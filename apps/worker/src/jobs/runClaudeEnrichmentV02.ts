import {
  DEFAULT_CLAUDE_CATCHUP_LIMIT,
  VISIBLE_RANGE_DAYS,
  parseBooleanFlag,
  parseClaudeCatchupLimit,
} from "../config.ts";
import {
  getClaudeBriefV02ByTarget,
  upsertClaudeBriefV02,
  upsertSourceReferencesV02,
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
  buildDailyOverviewPromptV02,
  buildSignalEventClaudePayloadsV02,
  buildSignalEventPromptV02,
  toSourceReferenceInputsV02,
  validateDailyOverviewClaudeResultV02,
  validateSignalEventClaudeResultV02,
  type ClaudePayloadV02,
  type ClaudePromptModeV02,
  type ClaudeTargetTypeV02,
  type DailyOverviewClaudePayloadV02,
  type DailyOverviewClaudeResultV02,
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

type TargetKindV02 = "signal" | "daily";

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
  limit: number;
}

interface RunOptions {
  now?: Date;
  client?: ClaudeEnrichmentClientV02;
  limit?: number;
}

const TERMINAL_STATUSES = new Set<string>([
  "brief_ready",
  "context_only",
  "no_clear_cause",
  "no_major_driver",
  "claude_limited",
  "failed_terminal",
]);

export function isClaudeEnrichmentV02Enabled(env: Partial<Env>): boolean {
  return (
    parseBooleanFlag(env.ENABLE_SIGNAL_CLAUDE_V02) ||
    parseBooleanFlag(env.ENABLE_DAILY_CLAUDE)
  );
}

function isRetryableOrMissing(row: ClaudeBriefV02Row | null): boolean {
  if (!row) {
    return true;
  }

  return !TERMINAL_STATUSES.has(row.status);
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

function systemPromptForV02(): string {
  return [
    "You are ByteSiren v0.2 market-context validation.",
    "Return one JSON object only.",
    "Do not provide trading advice, price targets, or buy/sell/long/short/hold guidance.",
  ].join(" ");
}

export async function selectClaudeEnrichmentTargetsV02(
  db: D1Database,
  env: Env,
  options: { now?: Date; limit?: number } = {},
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

  if (parseBooleanFlag(env.ENABLE_SIGNAL_CLAUDE_V02)) {
    const signalPayloads = await buildSignalEventClaudePayloadsV02(db, {
      now,
      days: VISIBLE_RANGE_DAYS,
    });

    for (const payload of signalPayloads) {
      const existing = await getClaudeBriefV02ByTarget(
        db,
        "signal_event_v02",
        payload.target_id,
        "signal_event",
      );

      if (!isRetryableOrMissing(existing)) {
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

  if (parseBooleanFlag(env.ENABLE_DAILY_CLAUDE)) {
    const dailyPayloads = await buildDailyOverviewClaudePayloadsV02(db, {
      now,
      days: VISIBLE_RANGE_DAYS,
    });

    for (const payload of dailyPayloads) {
      const existing = await getClaudeBriefV02ByTarget(
        db,
        "daily_overview_v02",
        payload.target_id,
        "daily_overview",
      );

      if (!isRetryableOrMissing(existing)) {
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

  if (classification === "Claude Limited") {
    return "claude_limited";
  }

  return "brief_ready";
}

function dailyStatusFor(
  label: DailyOverviewClaudeResultV02["daily_label"],
): ClaudeBriefStatusV02 {
  if (label === "No Major Driver") {
    return "no_major_driver";
  }

  if (label === "Claude Limited") {
    return "claude_limited";
  }

  if (label === "Quiet Day" || label === "Mixed Day") {
    return "context_only";
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

function normalizeSignalResultAfterSourcePolicy(input: {
  result: SignalEventClaudeResultV02;
  sourceInputs: SourceReferenceInputV02[];
}): SignalEventClaudeResultV02 {
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

function promptForPayload(payload: ClaudePayloadV02): string {
  return payload.mode === "signal_event"
    ? buildSignalEventPromptV02(payload as SignalEventClaudePayloadV02)
    : buildDailyOverviewPromptV02(payload as DailyOverviewClaudePayloadV02);
}

function eventDateForPayload(payload: ClaudePayloadV02): string {
  return payload.mode === "signal_event"
    ? payload.evidence_window.start
    : payload.day_start;
}

async function persistClientFailure(input: {
  db: D1Database;
  target: ClaudeEnrichmentTargetV02;
  clientResult: ClaudeClientResult;
  model: string;
  now: Date;
}) {
  const errorCode = input.clientResult.parsed.metadata.error_code;
  const isLimited = errorCode === "max_uses_exceeded";
  const status: ClaudeBriefStatusV02 = isLimited
    ? "claude_limited"
    : input.clientResult.parsed.retryable
      ? "failed_retryable"
      : "failed_terminal";

  await upsertClaudeBriefV02(input.db, {
    target_type: input.target.target_type,
    target_id: input.target.target_id,
    prompt_mode: input.target.prompt_mode,
    status,
    public_label: isLimited ? "Claude Limited" : null,
    classification: isLimited ? "Claude Limited" : null,
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

  return status;
}

async function persistValidationFailure(input: {
  db: D1Database;
  target: ClaudeEnrichmentTargetV02;
  error: unknown;
  model: string;
  now: Date;
}) {
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
  if (input.target.kind === "signal") {
    const result = validateSignalEventClaudeResultV02(input.rawJson);
    const initialSources = toSourceReferenceInputsV02({
      target_type: "signal_event_v02",
      target_id: input.target.target_id,
      sources: result.sources,
      eventDate: eventDateForPayload(input.target.payload),
      blockedDomains: input.blockedDomains,
      includeRejected: true,
    });
    const normalizedResult = normalizeSignalResultAfterSourcePolicy({
      result,
      sourceInputs: initialSources,
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
      context_details: normalizedResult.context_details,
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
      blockedDomains: input.blockedDomains,
      includeRejected: true,
    });

    return {
      status,
      sourcesWritten: await upsertSourceReferencesV02(input.db, sources),
      rejectedSources: rejectedSources(sources).length,
    };
  }

  const result = validateDailyOverviewClaudeResultV02(input.rawJson);
  const status = dailyStatusFor(result.daily_label);
  const brief = await upsertClaudeBriefV02(input.db, {
    target_type: "daily_overview_v02",
    target_id: input.target.target_id,
    prompt_mode: "daily_overview",
    status,
    public_label: result.daily_label,
    classification: result.daily_label,
    confidence: result.confidence,
    headline: result.headline,
    collapsed_summary: result.collapsed_summary,
    context_details: result.context_details,
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
    sourcesWritten: await upsertSourceReferencesV02(input.db, sources),
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

  if (!signalEnabled && !dailyEnabled) {
    const result = emptyResult({
      status: "skipped",
      message: "Claude v0.2 enrichment skipped: no v0.2 Claude flags enabled.",
      limit,
    });
    await recordJobRun(
      db,
      JOB_NAME,
      "skipped",
      result.message,
      {
        ...result,
        enable_signal_claude_v02: signalEnabled,
        enable_daily_claude: dailyEnabled,
      },
      startedAt,
      new Date(),
    );
    return result;
  }

  const targets = await selectClaudeEnrichmentTargetsV02(db, env, {
    now: startedAt,
    limit,
  });

  if (targets.length === 0) {
    const result = emptyResult({
      status: "skipped",
      message: "No eligible v0.2 Claude targets.",
      limit,
    });
    await recordJobRun(
      db,
      JOB_NAME,
      "skipped",
      result.message,
      {
        ...result,
        enable_signal_claude_v02: signalEnabled,
        enable_daily_claude: dailyEnabled,
      },
      startedAt,
      new Date(),
    );
    return result;
  }

  const apiKey = env.ANTHROPIC_API_KEY?.trim();

  if (!apiKey && !options.client) {
    const result = emptyResult({
      status: "skipped",
      message: "Claude v0.2 enrichment skipped: missing Worker API key.",
      limit,
    });
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
      },
      startedAt,
      new Date(),
    );
    return result;
  }

  const policy = claudeWebSearchPolicyFromEnv(env);
  const model = policy.model ?? DEFAULT_MODEL;
  const client =
    options.client ??
    new AnthropicClient({
      apiKey: apiKey ?? "",
    });
  const result = emptyResult({
    status: "success",
    message: "",
    limit,
  });

  for (const target of targets) {
    await upsertClaudeBriefV02(db, {
      target_type: targetTypeFor(target.payload),
      target_id: target.target_id,
      prompt_mode: promptModeFor(target.payload),
      status: "processing",
      prompt_version:
        target.kind === "signal" ? SIGNAL_PROMPT_VERSION : DAILY_PROMPT_VERSION,
      model,
      updated_at: startedAt.toISOString(),
    });

    const clientResult = await client.createIncidentBrief(
      requestForPrompt({
        systemPrompt: systemPromptForV02(),
        userPrompt: promptForPayload(target.payload),
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
      await persistValidationFailure({
        db,
        target,
        error,
        model,
        now: startedAt,
      });
      incrementStatusCount(result, "failed_retryable");
    }
  }

  result.status =
    result.failed_terminal_count + result.failed_retryable_count ===
    result.processed
      ? "failed"
      : "success";
  result.message =
    result.status === "success"
      ? `Claude v0.2 enrichment processed ${result.processed} item(s).`
      : "Claude v0.2 enrichment could not validate any item.";

  await recordJobRun(
    db,
    JOB_NAME,
    result.status === "success" ? "success" : "failed",
    result.message,
    {
      ...result,
      enable_signal_claude_v02: signalEnabled,
      enable_daily_claude: dailyEnabled,
      claude_model: model,
      tool_type: policy.tool_type,
      max_uses: policy.default_max_uses,
    },
    startedAt,
    new Date(),
  );

  return result;
}
