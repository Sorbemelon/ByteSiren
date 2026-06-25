import {
  DEFAULT_CLAUDE_CATCHUP_LIMIT,
  VISIBLE_RANGE_DAYS,
  parseBooleanFlag,
  parseClaudeCatchupLimit,
  parseClaudeRequestTimeoutMs,
} from "../config.ts";
import {
  claimClaudeBriefV02Target,
  getClaudeBriefV02ByTarget,
  isSelectableClaudeBriefV02,
  isTerminalClaudeBriefStatusV02,
  deleteSourceReferencesV02ForTarget,
  replaceSourceReferencesV02ForTarget,
  upsertClaudeBriefV02,
  type ClaudeBriefV02Row,
} from "../db/claudeRepositoryV02.ts";
import { recordJobRun } from "../db/marketRepository.ts";
import {
  AnthropicClient,
  claudeWebSearchPolicyFromEnv,
  type ClaudeClientRequest,
  type ClaudeClientResult,
} from "../services/claude/index.ts";
import {
  buildDailyOverviewClaudePayloadsV02,
  buildDailyOverviewSystemPromptV02,
  buildDailyOverviewUserPromptV02,
  buildSignalEventClaudePayloadsV02,
  buildSignalEventSystemPromptV02,
  buildSignalEventUserPromptV02,
  toSourceReferenceInputsV02,
  validateDailyOverviewClaudeResultV02,
  validateSignalEventClaudeResultV02,
  type ClaudePayloadV02,
  type ClaudePromptModeV02,
  type ClaudeTargetTypeV02,
  type DailyOverviewClaudePayloadV02,
  type SignalEventClaudePayloadV02,
  type SignalEventClaudeResultV02,
  type SourceReferenceInputV02,
} from "../services/claudeV02/index.ts";
import type { Env } from "../types/env.ts";
import { safeErrorMessage } from "../utils/http.ts";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const JOB_NAME = "claude_enrichment_v02";
const SIGNAL_PROMPT_VERSION = "v02-signal-event-v1";
const DAILY_PROMPT_VERSION = "v02-daily-overview-v1";

type ClaudeBriefStatusV02 =
  | "queued_for_analysis"
  | "processing"
  | "brief_ready"
  | "context_only"
  | "no_clear_cause"
  | "no_major_driver"
  | "claude_limited"
  | "failed_retryable"
  | "failed_terminal";

export type TargetKindV02 = "signal" | "daily";

export interface ClaudeEnrichmentClientV02 {
  createIncidentBrief(
    request: ClaudeClientRequest,
  ): Promise<ClaudeClientResult>;
}

export interface ClaudeEnrichmentTargetV02 {
  kind: TargetKindV02;
  target_type: ClaudeTargetTypeV02;
  target_id: string;
  prompt_mode: ClaudePromptModeV02;
  payload: ClaudePayloadV02;
}

export interface RunClaudeEnrichmentV02Result {
  status: "success" | "skipped" | "failed";
  message: string;
  processed: number;
  signal_processed: number;
  daily_processed: number;
  brief_ready_count: number;
  context_only_count: number;
  no_clear_cause_count: number;
  no_major_driver_count: number;
  claude_limited_count: number;
  failed_retryable_count: number;
  failed_terminal_count: number;
  sources_written: number;
  rejected_sources_count: number;
  searches_used: number;
  claimed_count: number;
  skipped_terminal_count: number;
  skipped_processing_count: number;
  limit: number;
}

interface RunOptions {
  now?: Date;
  client?: ClaudeEnrichmentClientV02;
  limit?: number;
  targetKinds?: TargetKindV02[];
  targetIds?: string[];
  bypassScheduleFlags?: boolean;
  force?: boolean;
  recordJobRun?: boolean;
  runSource?: "scheduled" | "admin_sample";
}

export function isClaudeEnrichmentV02Enabled(env: Partial<Env>): boolean {
  return (
    parseBooleanFlag(env.ENABLE_SIGNAL_CLAUDE_V02) ||
    parseBooleanFlag(env.ENABLE_DAILY_CLAUDE)
  );
}

function isRetryableOrMissing(row: ClaudeBriefV02Row | null): boolean {
  return isSelectableClaudeBriefV02(row);
}

function promptModeFor(payload: ClaudePayloadV02): ClaudePromptModeV02 {
  return payload.mode;
}

function targetTypeFor(payload: ClaudePayloadV02): ClaudeTargetTypeV02 {
  return payload.target_type;
}

function requestForPrompt(input: {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  toolType: string;
  maxUses: number;
  allowedDomains: string[];
  blockedDomains: string[];
}): ClaudeClientRequest {
  return {
    system_prompt: input.systemPrompt,
    user_prompt: input.userPrompt,
    model: input.model,
    tool_type: input.toolType,
    max_uses: input.maxUses,
    allowed_domains: input.allowedDomains,
    blocked_domains: input.blockedDomains,
  };
}

function systemPromptForPayload(payload: ClaudePayloadV02): string {
  return payload.mode === "signal_event"
    ? buildSignalEventSystemPromptV02()
    : buildDailyOverviewSystemPromptV02();
}

function userPromptForPayload(payload: ClaudePayloadV02): string {
  return payload.mode === "signal_event"
    ? buildSignalEventUserPromptV02(payload as SignalEventClaudePayloadV02)
    : buildDailyOverviewUserPromptV02(payload as DailyOverviewClaudePayloadV02);
}

export async function selectClaudeEnrichmentTargetsV02(
  db: D1Database,
  env: Env,
  options: {
    now?: Date;
    limit?: number;
    targetKinds?: TargetKindV02[];
    targetIds?: string[];
    bypassScheduleFlags?: boolean;
    force?: boolean;
  } = {},
): Promise<ClaudeEnrichmentTargetV02[]> {
  const now = options.now ?? new Date();
  const limit = Math.max(
    1,
    Math.min(
      options.limit ?? parseClaudeCatchupLimit(env.CLAUDE_CATCHUP_LIMIT),
      DEFAULT_CLAUDE_CATCHUP_LIMIT * 2,
    ),
  );
  const targets: ClaudeEnrichmentTargetV02[] = [];
  const allowedKinds = options.targetKinds
    ? new Set(options.targetKinds)
    : null;
  const allowedIds = options.targetIds?.length
    ? new Set(options.targetIds)
    : null;

  if (
    (!allowedKinds || allowedKinds.has("signal")) &&
    (parseBooleanFlag(env.ENABLE_SIGNAL_CLAUDE_V02) ||
      options.bypassScheduleFlags)
  ) {
    const signalPayloads = await buildSignalEventClaudePayloadsV02(db, {
      now,
      days: VISIBLE_RANGE_DAYS,
    });

    for (const payload of signalPayloads) {
      if (allowedIds && !allowedIds.has(payload.target_id)) {
        continue;
      }

      const existing = await getClaudeBriefV02ByTarget(
        db,
        "signal_event_v02",
        payload.target_id,
        "signal_event",
      );

      if (!options.force && !isRetryableOrMissing(existing)) {
        continue;
      }

      targets.push({
        kind: "signal",
        target_type: "signal_event_v02",
        target_id: payload.target_id,
        prompt_mode: "signal_event",
        payload,
      });

      if (targets.length >= limit) {
        return targets;
      }
    }
  }

  if (
    (!allowedKinds || allowedKinds.has("daily")) &&
    (parseBooleanFlag(env.ENABLE_DAILY_CLAUDE) || options.bypassScheduleFlags)
  ) {
    const dailyPayloads = await buildDailyOverviewClaudePayloadsV02(db, {
      now,
      days: VISIBLE_RANGE_DAYS,
    });

    for (const payload of dailyPayloads) {
      if (allowedIds && !allowedIds.has(payload.target_id)) {
        continue;
      }

      const existing = await getClaudeBriefV02ByTarget(
        db,
        "daily_overview_v02",
        payload.target_id,
        "daily_overview",
      );

      if (!options.force && !isRetryableOrMissing(existing)) {
        continue;
      }

      targets.push({
        kind: "daily",
        target_type: "daily_overview_v02",
        target_id: payload.target_id,
        prompt_mode: "daily_overview",
        payload,
      });

      if (targets.length >= limit) {
        return targets;
      }
    }
  }

  return targets;
}

function signalStatusFor(
  classification: SignalEventClaudeResultV02["classification"],
): ClaudeBriefStatusV02 {
  if (classification === "Market Backdrop") {
    return "context_only";
  }

  if (classification === "No Clear Cause") {
    return "no_clear_cause";
  }

  return "brief_ready";
}

function acceptedSources(
  sources: SourceReferenceInputV02[],
): SourceReferenceInputV02[] {
  return sources.filter((source) => source.accepted);
}

function rejectedSources(
  sources: SourceReferenceInputV02[],
): SourceReferenceInputV02[] {
  return sources.filter((source) => !source.accepted);
}

function hasAcceptedSignalCauseSource(
  sources: SourceReferenceInputV02[],
  tags: Array<"Focused catalyst source" | "Likely cause source">,
): boolean {
  return acceptedSources(sources).some((source) =>
    tags.some((tag) => source.source_role === tag),
  );
}

const SOURCELESS_SIGNAL_COPY_PATTERNS = [
  /\bno (?:accepted )?(?:time[- ]aligned )?public source\b/i,
  /\btime[- ]aligned (?:public )?source\b/i,
  /\baccepted (?:public )?source\b/i,
  /\breturned (?:public )?source\b/i,
  /\brejected(?: or ignored)? (?:public )?source\b/i,
  /\bsource(?:s)?\b/i,
  /\barticle(?:s)?\b/i,
  /\bpublisher(?:s)?\b/i,
  /\bnews\b/i,
  /\breported\b/i,
  /\bconfirmed catalyst\b/i,
  /\b(?:fed|fomc|cpi|ppi|jobs report)\b.*\b(?:drove|caused|triggered)\b/i,
  /\breuters\b/i,
  /\bcoindesk\b/i,
  /\bcointelegraph\b/i,
  /\bbloomberg\b/i,
  /\bcnbc\b/i,
  /\bthe block\b/i,
  /\bdecrypt\b/i,
] as const;

function cleanSignalContextLabel(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const cleaned = value
    .replace(/_/g, " ")
    .replace(/\bup\b/g, "upside")
    .replace(/\bdown\b/g, "downside")
    .trim();

  return cleaned || null;
}

function signalDirectionPhrase(direction: string): string {
  if (direction.includes("down")) return "downside";
  if (direction.includes("up")) return "upside";
  return "mixed-direction";
}

function signedPercent(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function leadSymbol(payload: SignalEventClaudePayloadV02): string | null {
  const explicit = payload.per_symbol_evidence.find(
    (symbol) => symbol.is_lead_mover,
  );

  if (explicit) {
    return explicit.symbol;
  }

  let strongest: { symbol: string; value: number } | null = null;

  for (const symbol of payload.per_symbol_evidence) {
    if (
      symbol.window_change_pct === null ||
      !Number.isFinite(symbol.window_change_pct)
    ) {
      continue;
    }

    if (
      !strongest ||
      Math.abs(symbol.window_change_pct) > Math.abs(strongest.value)
    ) {
      strongest = {
        symbol: symbol.symbol,
        value: symbol.window_change_pct,
      };
    }
  }

  return strongest?.symbol ?? null;
}

function signalEvidenceOnlyNoClearCauseSummary(
  payload: SignalEventClaudePayloadV02,
): string {
  const direction = signalDirectionPhrase(payload.direction);
  const context =
    cleanSignalContextLabel(payload.chart_context.event_story_type) ??
    cleanSignalContextLabel(payload.chart_context.momentum_context) ??
    cleanSignalContextLabel(payload.chart_context.volatility_context) ??
    cleanSignalContextLabel(payload.chart_context.trend_context) ??
    cleanSignalContextLabel(payload.chart_context.event_range_context) ??
    cleanSignalContextLabel(payload.chart_context.chart_context_label);
  const avgChange = signedPercent(payload.avg_change_pct);
  const lead = leadSymbol(payload);
  const breadth =
    payload.signals_count === payload.n_tracked
      ? `all ${payload.n_tracked} tracked symbols`
      : `${payload.signals_count} of ${payload.n_tracked} tracked symbols`;
  const pressure =
    context && context.includes(direction)
      ? `${context} pressure`
      : `${context ? `${context} ` : ""}${direction} pressure`;

  return [
    `The chart evidence points to ${pressure} across ${breadth}`,
    lead ? `, with ${lead} setting the pace` : "",
    avgChange ? ` and the basket averaging ${avgChange}` : "",
    ". The move is internally coherent, but the external driver remains unconfirmed.",
  ]
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function textContainsRejectedSourceReference(
  text: string,
  sources: SourceReferenceInputV02[],
): boolean {
  const normalized = text.toLowerCase();

  return rejectedSources(sources).some((source) => {
    const publisher = source.publisher?.trim().toLowerCase();
    const title = source.title?.trim().toLowerCase();

    return Boolean(
      (publisher && publisher.length >= 4 && normalized.includes(publisher)) ||
      (title && title.length >= 12 && normalized.includes(title)),
    );
  });
}

function sourceFreeSignalTextNeedsReplacement(input: {
  text: string;
  sourceInputs: SourceReferenceInputV02[];
}): boolean {
  return (
    SOURCELESS_SIGNAL_COPY_PATTERNS.some((pattern) =>
      pattern.test(input.text),
    ) || textContainsRejectedSourceReference(input.text, input.sourceInputs)
  );
}

function noSourceSignalCopyNeedsReplacement(input: {
  result: SignalEventClaudeResultV02;
  sourceInputs: SourceReferenceInputV02[];
}): boolean {
  const text = [
    input.result.headline,
    input.result.collapsed_summary,
    input.result.context_details ?? "",
    input.result.why_this_classification,
  ].join("\n");

  return sourceFreeSignalTextNeedsReplacement({
    text,
    sourceInputs: input.sourceInputs,
  });
}

function noAcceptedSignalSourceResult(input: {
  result: SignalEventClaudeResultV02;
  payload: SignalEventClaudePayloadV02;
  sourceInputs: SourceReferenceInputV02[];
}): SignalEventClaudeResultV02 {
  const sourceFreeInsight =
    input.result.source_free_signal_insight &&
    !sourceFreeSignalTextNeedsReplacement({
      text: input.result.source_free_signal_insight,
      sourceInputs: input.sourceInputs,
    })
      ? input.result.source_free_signal_insight
      : null;
  const headline = sourceFreeSignalTextNeedsReplacement({
    text: input.result.headline,
    sourceInputs: input.sourceInputs,
  })
    ? "No clear public catalyst"
    : input.result.headline;

  return {
    ...input.result,
    classification: "No Clear Cause",
    headline,
    collapsed_summary:
      sourceFreeInsight ?? signalEvidenceOnlyNoClearCauseSummary(input.payload),
    context_details: null,
    source_support: "none",
    source_timing_alignment: "none",
    validation_flags: {
      ...input.result.validation_flags,
      source_policy_no_accepted_sources: true,
      source_policy_used_source_free_signal_insight: Boolean(sourceFreeInsight),
    },
    detector_feedback: {
      ...input.result.detector_feedback,
      source_policy_note: sourceFreeInsight
        ? "Signal Event public brief used Claude's source-free chart/evidence insight because no accepted source remained after source policy."
        : "Signal Event brief text was replaced because no accepted source remained after source policy.",
    },
  };
}

function normalizeSignalResultAfterSourcePolicy(input: {
  result: SignalEventClaudeResultV02;
  sourceInputs: SourceReferenceInputV02[];
  payload: SignalEventClaudePayloadV02;
}): SignalEventClaudeResultV02 {
  if (acceptedSources(input.sourceInputs).length === 0) {
    if (
      input.result.classification === "No Clear Cause" &&
      !noSourceSignalCopyNeedsReplacement(input)
    ) {
      return {
        ...input.result,
        source_support: "none",
        source_timing_alignment: "none",
      };
    }

    return noAcceptedSignalSourceResult({
      result: input.result,
      payload: input.payload,
      sourceInputs: input.sourceInputs,
    });
  }

  const hasBackdrop = acceptedSources(input.sourceInputs).some(
    (source) => source.source_role === "Backdrop source",
  );

  if (
    input.result.classification === "Focused Cause" &&
    !hasAcceptedSignalCauseSource(input.sourceInputs, [
      "Focused catalyst source",
    ])
  ) {
    return {
      ...input.result,
      classification: hasBackdrop ? "Market Backdrop" : "No Clear Cause",
      source_support: hasBackdrop ? "low" : "none",
      source_timing_alignment: hasBackdrop ? "broad" : "none",
      validation_flags: {
        ...input.result.validation_flags,
        source_policy_downgraded: true,
      },
      detector_feedback: {
        ...input.result.detector_feedback,
        source_policy_note:
          "Focused Cause was downgraded because no accepted focused catalyst source remained after source policy.",
      },
    };
  }

  if (
    input.result.classification === "Likely Cause" &&
    !hasAcceptedSignalCauseSource(input.sourceInputs, [
      "Focused catalyst source",
      "Likely cause source",
    ])
  ) {
    return {
      ...input.result,
      classification: hasBackdrop ? "Market Backdrop" : "No Clear Cause",
      source_support: hasBackdrop ? "low" : "none",
      source_timing_alignment: hasBackdrop ? "broad" : "none",
      validation_flags: {
        ...input.result.validation_flags,
        source_policy_downgraded: true,
      },
      detector_feedback: {
        ...input.result.detector_feedback,
        source_policy_note:
          "Likely Cause was downgraded because no accepted focused or likely source remained after source policy.",
      },
    };
  }

  return input.result;
}

function eventDateForPayload(payload: ClaudePayloadV02): string {
  return payload.mode === "signal_event"
    ? payload.evidence_window.start
    : payload.day_start;
}

function signalWindowForPayload(
  payload: ClaudePayloadV02,
): { start: string; end: string } | null {
  return payload.mode === "signal_event"
    ? { start: payload.evidence_window.start, end: payload.evidence_window.end }
    : null;
}

async function persistClientFailure(input: {
  db: D1Database;
  target: ClaudeEnrichmentTargetV02;
  clientResult: ClaudeClientResult;
  model: string;
  now: Date;
}) {
  const existing = await getClaudeBriefV02ByTarget(
    input.db,
    input.target.target_type,
    input.target.target_id,
    input.target.prompt_mode,
  );

  if (existing && isTerminalClaudeBriefStatusV02(existing.status)) {
    return existing.status as ClaudeBriefStatusV02;
  }

  const errorCode = input.clientResult.parsed.metadata.error_code;
  const status: ClaudeBriefStatusV02 = input.clientResult.parsed.retryable
    ? "failed_retryable"
    : errorCode === "max_uses_exceeded"
      ? "failed_retryable"
      : "failed_terminal";

  await upsertClaudeBriefV02(input.db, {
    target_type: input.target.target_type,
    target_id: input.target.target_id,
    prompt_mode: input.target.prompt_mode,
    status,
    public_label: null,
    classification: null,
    prompt_version:
      input.target.kind === "signal"
        ? SIGNAL_PROMPT_VERSION
        : DAILY_PROMPT_VERSION,
    model: input.model,
    error_code: errorCode ?? "unknown",
    error_message:
      input.clientResult.parsed.error_message ??
      "Claude v0.2 enrichment failed.",
    updated_at: input.now.toISOString(),
  });
  await deleteSourceReferencesV02ForTarget(
    input.db,
    input.target.target_type,
    input.target.target_id,
  );

  return status;
}

async function persistValidationFailure(input: {
  db: D1Database;
  target: ClaudeEnrichmentTargetV02;
  error: unknown;
  model: string;
  now: Date;
}): Promise<ClaudeBriefStatusV02> {
  const existing = await getClaudeBriefV02ByTarget(
    input.db,
    input.target.target_type,
    input.target.target_id,
    input.target.prompt_mode,
  );

  if (existing && isTerminalClaudeBriefStatusV02(existing.status)) {
    return existing.status as ClaudeBriefStatusV02;
  }

  await upsertClaudeBriefV02(input.db, {
    target_type: input.target.target_type,
    target_id: input.target.target_id,
    prompt_mode: input.target.prompt_mode,
    status: "failed_retryable",
    prompt_version:
      input.target.kind === "signal"
        ? SIGNAL_PROMPT_VERSION
        : DAILY_PROMPT_VERSION,
    model: input.model,
    error_code: "validation_error",
    error_message: safeErrorMessage(input.error),
    updated_at: input.now.toISOString(),
  });
  await deleteSourceReferencesV02ForTarget(
    input.db,
    input.target.target_type,
    input.target.target_id,
  );

  return "failed_retryable";
}

async function persistValidatedResult(input: {
  db: D1Database;
  target: ClaudeEnrichmentTargetV02;
  rawJson: unknown;
  model: string;
  blockedDomains: string[];
  now: Date;
}): Promise<{
  status: ClaudeBriefStatusV02;
  sourcesWritten: number;
  rejectedSources: number;
}> {
  const existing = await getClaudeBriefV02ByTarget(
    input.db,
    input.target.target_type,
    input.target.target_id,
    input.target.prompt_mode,
  );

  if (existing && isTerminalClaudeBriefStatusV02(existing.status)) {
    return {
      status: existing.status as ClaudeBriefStatusV02,
      sourcesWritten: 0,
      rejectedSources: 0,
    };
  }

  if (input.target.kind === "signal") {
    const result = validateSignalEventClaudeResultV02(input.rawJson);
    const initialSources = toSourceReferenceInputsV02({
      target_type: "signal_event_v02",
      target_id: input.target.target_id,
      sources: result.sources,
      eventDate: eventDateForPayload(input.target.payload),
      signalEventWindow: signalWindowForPayload(input.target.payload),
      blockedDomains: input.blockedDomains,
      includeRejected: true,
    });
    const normalizedResult = normalizeSignalResultAfterSourcePolicy({
      result,
      sourceInputs: initialSources,
      payload: input.target.payload as SignalEventClaudePayloadV02,
    });
    const status = signalStatusFor(normalizedResult.classification);
    const brief = await upsertClaudeBriefV02(input.db, {
      target_type: "signal_event_v02",
      target_id: input.target.target_id,
      prompt_mode: "signal_event",
      status,
      public_label: normalizedResult.classification,
      classification: normalizedResult.classification,
      confidence: normalizedResult.confidence,
      headline: normalizedResult.headline,
      collapsed_summary: normalizedResult.collapsed_summary,
      context_details: null,
      source_support: normalizedResult.source_support,
      source_timing_alignment: normalizedResult.source_timing_alignment,
      validation_flags: normalizedResult.validation_flags,
      detector_feedback: normalizedResult.detector_feedback,
      prompt_version: SIGNAL_PROMPT_VERSION,
      model: input.model,
      updated_at: input.now.toISOString(),
    });
    const sources = toSourceReferenceInputsV02({
      target_type: "signal_event_v02",
      target_id: input.target.target_id,
      brief_id: brief.id,
      sources: normalizedResult.sources,
      eventDate: eventDateForPayload(input.target.payload),
      signalEventWindow: signalWindowForPayload(input.target.payload),
      blockedDomains: input.blockedDomains,
      includeRejected: true,
    });

    return {
      status,
      sourcesWritten: await replaceSourceReferencesV02ForTarget(
        input.db,
        "signal_event_v02",
        input.target.target_id,
        sources,
      ),
      rejectedSources: rejectedSources(sources).length,
    };
  }

  const result = validateDailyOverviewClaudeResultV02(input.rawJson);
  const status = "brief_ready";
  const brief = await upsertClaudeBriefV02(input.db, {
    target_type: "daily_overview_v02",
    target_id: input.target.target_id,
    prompt_mode: "daily_overview",
    status,
    public_label: null,
    classification: null,
    confidence: result.confidence,
    headline: result.headline,
    collapsed_summary: result.collapsed_summary,
    context_details: null,
    source_support: result.notable_drivers[0]?.source_support ?? null,
    source_timing_alignment: null,
    validation_flags: result.validation_flags,
    detector_feedback: result.detector_feedback,
    prompt_version: DAILY_PROMPT_VERSION,
    model: input.model,
    updated_at: input.now.toISOString(),
  });
  const sources = toSourceReferenceInputsV02({
    target_type: "daily_overview_v02",
    target_id: input.target.target_id,
    brief_id: brief.id,
    sources: result.sources,
    eventDate: eventDateForPayload(input.target.payload),
    blockedDomains: input.blockedDomains,
    includeRejected: true,
  });

  return {
    status,
    sourcesWritten: await replaceSourceReferencesV02ForTarget(
      input.db,
      "daily_overview_v02",
      input.target.target_id,
      sources,
    ),
    rejectedSources: rejectedSources(sources).length,
  };
}

function emptyResult(input: {
  status: RunClaudeEnrichmentV02Result["status"];
  message: string;
  limit: number;
}): RunClaudeEnrichmentV02Result {
  return {
    status: input.status,
    message: input.message,
    processed: 0,
    signal_processed: 0,
    daily_processed: 0,
    brief_ready_count: 0,
    context_only_count: 0,
    no_clear_cause_count: 0,
    no_major_driver_count: 0,
    claude_limited_count: 0,
    failed_retryable_count: 0,
    failed_terminal_count: 0,
    sources_written: 0,
    rejected_sources_count: 0,
    searches_used: 0,
    claimed_count: 0,
    skipped_terminal_count: 0,
    skipped_processing_count: 0,
    limit: input.limit,
  };
}

function incrementStatusCount(
  result: RunClaudeEnrichmentV02Result,
  status: ClaudeBriefStatusV02,
) {
  if (status === "brief_ready") {
    result.brief_ready_count += 1;
  } else if (status === "context_only") {
    result.context_only_count += 1;
  } else if (status === "no_clear_cause") {
    result.no_clear_cause_count += 1;
  } else if (status === "no_major_driver") {
    result.no_major_driver_count += 1;
  } else if (status === "claude_limited") {
    result.claude_limited_count += 1;
  } else if (status === "failed_retryable") {
    result.failed_retryable_count += 1;
  } else if (status === "failed_terminal") {
    result.failed_terminal_count += 1;
  }
}

export async function runClaudeEnrichmentV02(
  db: D1Database,
  env: Env,
  options: RunOptions = {},
): Promise<RunClaudeEnrichmentV02Result> {
  const startedAt = options.now ?? new Date();
  const limit = Math.max(
    1,
    Math.min(
      options.limit ?? parseClaudeCatchupLimit(env.CLAUDE_CATCHUP_LIMIT),
      DEFAULT_CLAUDE_CATCHUP_LIMIT * 2,
    ),
  );
  const signalEnabled = parseBooleanFlag(env.ENABLE_SIGNAL_CLAUDE_V02);
  const dailyEnabled = parseBooleanFlag(env.ENABLE_DAILY_CLAUDE);
  const bypassScheduleFlags = options.bypassScheduleFlags === true;
  const runSource = options.runSource ?? "scheduled";
  const shouldRecordJobRun = options.recordJobRun !== false;

  if (!signalEnabled && !dailyEnabled && !bypassScheduleFlags) {
    const result = emptyResult({
      status: "skipped",
      message: "Claude v0.2 enrichment skipped: no v0.2 Claude flags enabled.",
      limit,
    });
    if (shouldRecordJobRun) {
      await recordJobRun(
        db,
        JOB_NAME,
        "skipped",
        result.message,
        {
          ...result,
          enable_signal_claude_v02: signalEnabled,
          enable_daily_claude: dailyEnabled,
          bypass_schedule_flags: false,
          run_source: runSource,
        },
        startedAt,
        new Date(),
      );
    }
    return result;
  }

  const targets = await selectClaudeEnrichmentTargetsV02(db, env, {
    now: startedAt,
    limit,
    targetKinds: options.targetKinds,
    targetIds: options.targetIds,
    bypassScheduleFlags,
    force: options.force,
  });

  if (targets.length === 0) {
    const result = emptyResult({
      status: "skipped",
      message: "No eligible v0.2 Claude targets.",
      limit,
    });
    if (shouldRecordJobRun) {
      await recordJobRun(
        db,
        JOB_NAME,
        "skipped",
        result.message,
        {
          ...result,
          enable_signal_claude_v02: signalEnabled,
          enable_daily_claude: dailyEnabled,
          bypass_schedule_flags: bypassScheduleFlags,
          run_source: runSource,
        },
        startedAt,
        new Date(),
      );
    }
    return result;
  }

  const apiKey = env.ANTHROPIC_API_KEY?.trim();

  if (!apiKey && !options.client) {
    const result = emptyResult({
      status: "skipped",
      message: "Claude v0.2 enrichment skipped: missing Worker API key.",
      limit,
    });
    if (shouldRecordJobRun) {
      await recordJobRun(
        db,
        JOB_NAME,
        "skipped",
        result.message,
        {
          ...result,
          eligible_targets: targets.length,
          enable_signal_claude_v02: signalEnabled,
          enable_daily_claude: dailyEnabled,
          bypass_schedule_flags: bypassScheduleFlags,
          run_source: runSource,
        },
        startedAt,
        new Date(),
      );
    }
    return result;
  }

  const policy = claudeWebSearchPolicyFromEnv(env);
  const model = policy.model ?? DEFAULT_MODEL;
  const client =
    options.client ??
    new AnthropicClient({
      apiKey: apiKey ?? "",
      timeoutMs: parseClaudeRequestTimeoutMs(env.CLAUDE_REQUEST_TIMEOUT_MS),
    });
  const result = emptyResult({
    status: "success",
    message: "",
    limit,
  });

  for (const target of targets) {
    const claim = await claimClaudeBriefV02Target(db, {
      target_type: targetTypeFor(target.payload),
      target_id: target.target_id,
      prompt_mode: promptModeFor(target.payload),
      prompt_version:
        target.kind === "signal" ? SIGNAL_PROMPT_VERSION : DAILY_PROMPT_VERSION,
      model,
      updated_at: startedAt.toISOString(),
      force: options.force,
    });

    if (!claim.claimed) {
      if (claim.skipped_reason === "terminal_status") {
        result.skipped_terminal_count += 1;
      } else if (claim.skipped_reason === "processing") {
        result.skipped_processing_count += 1;
      }

      continue;
    }

    result.claimed_count += 1;

    const clientResult = await client.createIncidentBrief(
      requestForPrompt({
        systemPrompt: systemPromptForPayload(target.payload),
        userPrompt: userPromptForPayload(target.payload),
        model,
        toolType: policy.tool_type,
        maxUses: policy.default_max_uses,
        allowedDomains: policy.allowed_domains,
        blockedDomains: policy.blocked_domains,
      }),
    );
    result.searches_used += clientResult.parsed.metadata.searches_used;
    result.processed += 1;

    if (target.kind === "signal") {
      result.signal_processed += 1;
    } else {
      result.daily_processed += 1;
    }

    if (!clientResult.ok || !clientResult.parsed.json) {
      const status = await persistClientFailure({
        db,
        target,
        clientResult,
        model,
        now: startedAt,
      });
      incrementStatusCount(result, status);
      continue;
    }

    try {
      const persisted = await persistValidatedResult({
        db,
        target,
        rawJson: clientResult.parsed.json,
        model,
        blockedDomains: policy.blocked_domains,
        now: startedAt,
      });
      incrementStatusCount(result, persisted.status);
      result.sources_written += persisted.sourcesWritten;
      result.rejected_sources_count += persisted.rejectedSources;
    } catch (error) {
      const status = await persistValidationFailure({
        db,
        target,
        error,
        model,
        now: startedAt,
      });
      incrementStatusCount(result, status);
    }
  }

  result.status =
    result.processed === 0
      ? "skipped"
      : result.failed_terminal_count + result.failed_retryable_count ===
          result.processed
        ? "failed"
        : "success";
  result.message =
    result.status === "skipped"
      ? "No claimable v0.2 Claude targets."
      : result.status === "success"
        ? `Claude v0.2 enrichment processed ${result.processed} item(s).`
        : "Claude v0.2 enrichment could not validate any item.";

  if (shouldRecordJobRun) {
    await recordJobRun(
      db,
      JOB_NAME,
      result.status,
      result.message,
      {
        ...result,
        enable_signal_claude_v02: signalEnabled,
        enable_daily_claude: dailyEnabled,
        bypass_schedule_flags: bypassScheduleFlags,
        run_source: runSource,
        claude_model: model,
        tool_type: policy.tool_type,
        max_uses: policy.default_max_uses,
      },
      startedAt,
      new Date(),
    );
  }

  return result;
}
