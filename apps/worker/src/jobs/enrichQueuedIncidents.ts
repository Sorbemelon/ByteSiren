import {
  getClaudeUsageForToday,
  markIncidentAnalysisLimited,
  markIncidentEnriching,
  markIncidentRetryable,
  recordClaudeUsageForToday,
  upsertAcceptedSourceReferences,
  upsertClaudeBrief,
} from "../db/claudeRepository.ts";
import {
  getNextIncidentsForEnrichment,
  type IncidentRow,
} from "../db/incidentRepository.ts";
import { recordJobRun } from "../db/marketRepository.ts";
import type { MarketSymbol } from "../config.ts";
import {
  AnthropicClient,
  buildClaudePrompt,
  claudeWebSearchPolicyFromEnv,
  validateClaudeBrief,
  type ClaudeAnalysisMode,
  type ClaudeCitationSource,
  type ClaudeClientRequest,
  type ClaudeClientResult,
  type ClaudePromptBuildResult,
  type ValidatedClaudeBrief,
} from "../services/claude/index.ts";
import type {
  IncidentCandidate,
  MarketTier,
  QueryHints,
  SymbolEvidence,
} from "../services/detector/index.ts";
import type { Env } from "../types/env.ts";
import { safeErrorMessage } from "../utils/http.ts";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_DAILY_LIMIT = 5;
const MAX_INCIDENTS_PER_RUN = 1;
const LIVE_CONTEXT_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface ClaudeEnrichmentClient {
  createIncidentBrief(
    request: ClaudeClientRequest,
  ): Promise<ClaudeClientResult>;
}

export interface EnrichQueuedIncidentsResult {
  status: "success" | "skipped" | "failed";
  message: string;
  processed: number;
  limited_count: number;
  failed_retryable_count: number;
  brief_ready_count: number;
  context_only_count: number;
  none_found_count: number;
  briefs_written: number;
  sources_written: number;
  searches_used: number;
}

interface EnrichOptions {
  now?: Date;
  limit?: number;
  includeAnalysisLimited?: boolean;
  client?: ClaudeEnrichmentClient;
}

interface AttemptOutcome {
  clientResult: ClaudeClientResult;
  brief: ValidatedClaudeBrief | null;
  validationError: string | null;
}

function parseDailyLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_LIMIT;
}

function analysisModeFor(row: IncidentRow, now: Date): ClaudeAnalysisMode {
  const started = Date.parse(row.started_at);

  if (
    Number.isFinite(started) &&
    now.getTime() - started <= LIVE_CONTEXT_WINDOW_MS
  ) {
    return "live_context";
  }

  return "date_matched_retrospective";
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function marketTierFromSeverityLabel(label: string): MarketTier {
  if (label === "Strong Move") {
    return "severe";
  }

  if (label === "Calm") {
    return "normal";
  }

  return "elevated";
}

function averageIncludedChange(evidence: SymbolEvidence[]): number | null {
  const changes = evidence
    .filter((item) => item.included_in_event && item.change_15m_pct !== null)
    .map((item) => item.change_15m_pct)
    .filter((value): value is number => value !== null);

  if (changes.length === 0) {
    return null;
  }

  return changes.reduce((sum, value) => sum + value, 0) / changes.length;
}

function maxSeverity(evidence: SymbolEvidence[]): number {
  return evidence.reduce((max, item) => Math.max(max, item.severity_score), 0);
}

function peakSymbol(evidence: SymbolEvidence[]): MarketSymbol | null {
  const included = evidence.filter((item) => item.included_in_event);

  if (included.length === 0) {
    return null;
  }

  return included.reduce((peak, item) =>
    item.severity_score > peak.severity_score ? item : peak,
  ).symbol;
}

function rowToCandidate(row: IncidentRow): IncidentCandidate {
  const symbolEvidence = parseJson<SymbolEvidence[]>(
    row.symbol_evidence_json,
    [],
  );
  const symbols = parseJson<MarketSymbol[]>(row.symbols_json, []);

  return {
    id: row.id,
    incident_key: row.incident_key,
    scope: row.scope,
    direction: row.direction,
    detected_at: row.started_at,
    started_at: row.started_at,
    ended_at: row.ended_at ?? row.started_at,
    signal_window: row.signal_window,
    baseline_window: row.baseline_window,
    symbols,
    breadth_count: row.breadth_count,
    avg_15m_change_pct: averageIncludedChange(symbolEvidence),
    headline_severity: row.headline_severity,
    max_elevated_severity: maxSeverity(symbolEvidence),
    peak_symbol: peakSymbol(symbolEvidence) ?? symbols[0] ?? "BTCUSDT",
    tier: marketTierFromSeverityLabel(row.severity_label),
    symbol_evidence: symbolEvidence,
    sub_events: parseJson(row.sub_events_json, []),
    query_hints: parseJson<QueryHints>(row.query_hints_json, {
      route:
        row.direction === "two_sided"
          ? "two_sided_market_day"
          : row.direction === "observed_down"
            ? "market_wide_down"
            : "market_wide_up",
      date_bound_query_required: true,
      second_search_allowed: row.direction === "two_sided",
      no_trading_advice: true,
    }),
  };
}

function requestForPrompt(
  prompt: ClaudePromptBuildResult,
  input: {
    model: string;
    maxUses: number;
    userPrompt?: string;
  },
): ClaudeClientRequest {
  return {
    system_prompt: prompt.system_prompt,
    user_prompt: input.userPrompt ?? prompt.user_prompt,
    model: input.model,
    tool_type: prompt.web_search_policy.tool_type,
    max_uses: input.maxUses,
    allowed_domains: prompt.web_search_policy.allowed_domains,
    blocked_domains: prompt.web_search_policy.blocked_domains,
  };
}

function withEnvelopeAndCitations(
  raw: unknown,
  input: {
    incidentId: string;
    analysisMode: ClaudeAnalysisMode;
    generatedAt: string;
    citations: ClaudeCitationSource[];
  },
): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const record = raw as Record<string, unknown>;
  const sourceLinks = Array.isArray(record.source_links)
    ? record.source_links
    : Array.isArray(record.sources)
      ? record.sources
      : [];
  const citations = input.citations.filter(
    (source) =>
      !sourceLinks.some(
        (existing) =>
          Boolean(existing) &&
          typeof existing === "object" &&
          !Array.isArray(existing) &&
          (existing as Record<string, unknown>).url === source.url,
      ),
  );

  return {
    ...record,
    incident_id: input.incidentId,
    analysis_mode: input.analysisMode,
    generated_at:
      typeof record.generated_at === "string" && record.generated_at
        ? record.generated_at
        : input.generatedAt,
    source_links: [...sourceLinks, ...citations],
  };
}

function shouldRunSecondSearch(input: {
  row: IncidentRow;
  firstBrief: ValidatedClaudeBrief | null;
  validationError: string | null;
  firstHadJson: boolean;
}): boolean {
  if (input.row.scope === "market_day" && input.row.direction === "two_sided") {
    return true;
  }

  if (input.row.headline_severity >= 100 && input.row.breadth_count >= 5) {
    return true;
  }

  if (!input.firstBrief) {
    return Boolean(input.validationError) && input.firstHadJson;
  }

  if (input.firstBrief.catalyst_status === "none_found") {
    return true;
  }

  if (
    input.firstBrief.catalyst_status === "context_only" &&
    input.firstBrief.focused_catalyst === null
  ) {
    return true;
  }

  return (
    input.firstBrief.accepted_sources.length === 0 &&
    input.firstBrief.rejected_sources.length > 0
  );
}

function secondSearchPrompt(userPrompt: string): string {
  return `${userPrompt}

SECOND_SEARCH_PASS:
Use a narrower alternative date-bound search around the detected event date/time. Prefer reputable or official sources near that date. Return one JSON object only.`;
}

function chooseBrief(
  first: ValidatedClaudeBrief | null,
  second: ValidatedClaudeBrief | null,
): ValidatedClaudeBrief | null {
  if (!first) {
    return second;
  }

  if (!second) {
    return first;
  }

  if (
    (first.catalyst_status === "none_found" ||
      first.catalyst_status === "context_only" ||
      first.accepted_sources.length === 0) &&
    second.accepted_sources.length >= first.accepted_sources.length
  ) {
    return second;
  }

  return first;
}

async function runAttempt(input: {
  client: ClaudeEnrichmentClient;
  request: ClaudeClientRequest;
  row: IncidentRow;
  analysisMode: ClaudeAnalysisMode;
  eventDate: string;
  blockedDomains: string[];
}): Promise<AttemptOutcome> {
  const clientResult = await input.client.createIncidentBrief(input.request);

  if (!clientResult.ok || !clientResult.parsed.json) {
    return {
      clientResult,
      brief: null,
      validationError: clientResult.parsed.error_message,
    };
  }

  try {
    const enrichedJson = withEnvelopeAndCitations(clientResult.parsed.json, {
      incidentId: input.row.id,
      analysisMode: input.analysisMode,
      generatedAt: clientResult.parsed.metadata.generated_at,
      citations: clientResult.parsed.citations,
    });
    const brief = validateClaudeBrief(enrichedJson, {
      eventDate: input.eventDate,
      blockedDomains: input.blockedDomains,
    });

    return {
      clientResult,
      brief,
      validationError: null,
    };
  } catch (error) {
    return {
      clientResult,
      brief: null,
      validationError: safeErrorMessage(error),
    };
  }
}

export async function enrichQueuedIncidents(
  db: D1Database,
  env: Env,
  options: EnrichOptions = {},
): Promise<EnrichQueuedIncidentsResult> {
  const startedAt = options.now ?? new Date();
  const requestedLimit = Math.max(
    1,
    Math.min(options.limit ?? MAX_INCIDENTS_PER_RUN, 10),
  );
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  const dailyLimit = parseDailyLimit(env.CLAUDE_PUBLIC_DAILY_ANALYSIS_LIMIT);
  const usage = await getClaudeUsageForToday(db, startedAt);
  const remainingCapacity = Math.max(0, dailyLimit - usage.analysis_count);
  const hasCapacity = remainingCapacity > 0;
  const canCallClaude = Boolean(apiKey) && hasCapacity;
  const limit = canCallClaude
    ? Math.max(1, Math.min(requestedLimit, remainingCapacity))
    : requestedLimit;
  const incidents = await getNextIncidentsForEnrichment(db, {
    limit,
    includeAnalysisLimited:
      options.includeAnalysisLimited ?? Boolean(canCallClaude),
    now: startedAt,
  });

  if (incidents.length === 0) {
    const result: EnrichQueuedIncidentsResult = {
      status: "skipped",
      message: "No queued Claude incidents.",
      processed: 0,
      limited_count: 0,
      failed_retryable_count: 0,
      brief_ready_count: 0,
      context_only_count: 0,
      none_found_count: 0,
      briefs_written: 0,
      sources_written: 0,
      searches_used: 0,
    };

    await recordJobRun(
      db,
      "claude_enrichment",
      "skipped",
      result.message,
      result as unknown as Record<string, unknown>,
      startedAt,
      new Date(),
    );

    return result;
  }

  if (!apiKey || !hasCapacity) {
    for (const incident of incidents) {
      await markIncidentAnalysisLimited(db, incident.id);
    }

    const message = !apiKey
      ? "Claude enrichment limited: missing Worker API key."
      : "Claude enrichment limited: daily public-project cap reached.";
    const result: EnrichQueuedIncidentsResult = {
      status: "skipped",
      message,
      processed: 0,
      limited_count: incidents.length,
      failed_retryable_count: 0,
      brief_ready_count: 0,
      context_only_count: 0,
      none_found_count: 0,
      briefs_written: 0,
      sources_written: 0,
      searches_used: 0,
    };

    await recordJobRun(
      db,
      "claude_enrichment",
      "skipped",
      message,
      result as unknown as Record<string, unknown>,
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
      apiKey,
    });
  const blockedDomains = policy.blocked_domains;
  let processed = 0;
  let briefsWritten = 0;
  let sourcesWritten = 0;
  let failedRetryableCount = 0;
  let searchesUsed = 0;
  let lastError: string | null = null;
  let limitedCount = 0;
  let briefReadyCount = 0;
  let contextOnlyCount = 0;
  let noneFoundCount = 0;

  for (const row of incidents) {
    await markIncidentEnriching(db, row.id, startedAt);

    const candidate = rowToCandidate(row);
    const prompt = buildClaudePrompt({ candidate }, env);
    const analysisMode = analysisModeFor(row, startedAt);
    const firstRequest = requestForPrompt(prompt, {
      model,
      maxUses: policy.default_max_uses,
    });
    const first = await runAttempt({
      client,
      request: firstRequest,
      row,
      analysisMode,
      eventDate: row.started_at,
      blockedDomains,
    });

    searchesUsed += first.clientResult.parsed.metadata.searches_used;

    let second: AttemptOutcome | null = null;

    if (
      shouldRunSecondSearch({
        row,
        firstBrief: first.brief,
        validationError: first.validationError,
        firstHadJson: Boolean(first.clientResult.parsed.json),
      })
    ) {
      const secondRequest = requestForPrompt(prompt, {
        model,
        maxUses: policy.second_search_max_uses,
        userPrompt: secondSearchPrompt(prompt.user_prompt),
      });

      second = await runAttempt({
        client,
        request: secondRequest,
        row,
        analysisMode,
        eventDate: row.started_at,
        blockedDomains,
      });
      searchesUsed += second.clientResult.parsed.metadata.searches_used;
    }

    const selectedBrief = chooseBrief(first.brief, second?.brief ?? null);

    if (selectedBrief) {
      const briefId = await upsertClaudeBrief(db, selectedBrief);
      const writtenSources = await upsertAcceptedSourceReferences(
        db,
        briefId,
        selectedBrief.accepted_sources,
      );

      briefsWritten += 1;
      sourcesWritten += writtenSources;

      if (
        selectedBrief.catalyst_status === "cause_supported" ||
        selectedBrief.catalyst_status === "cause_likely"
      ) {
        briefReadyCount += 1;
      } else if (selectedBrief.catalyst_status === "context_only") {
        contextOnlyCount += 1;
      } else if (selectedBrief.catalyst_status === "none_found") {
        noneFoundCount += 1;
      }
    } else if (
      first.clientResult.parsed.metadata.error_code === "max_uses_exceeded" ||
      second?.clientResult.parsed.metadata.error_code === "max_uses_exceeded"
    ) {
      limitedCount += 1;
      lastError =
        second?.validationError ??
        first.validationError ??
        "Claude Web Search reached the configured max uses.";
      await markIncidentAnalysisLimited(db, row.id);
    } else {
      failedRetryableCount += 1;
      lastError =
        second?.validationError ??
        first.validationError ??
        "Claude enrichment did not return a usable brief.";
      await markIncidentRetryable(db, row.id);
    }

    processed += 1;
  }

  await recordClaudeUsageForToday(db, {
    analyses: processed,
    webSearchRequests: searchesUsed,
    now: startedAt,
  });

  const status = failedRetryableCount === processed ? "failed" : "success";
  const message =
    status === "success" && limitedCount > 0
      ? `Claude enrichment limited ${limitedCount} incident(s): ${lastError ?? "configured search limit reached"}`
      : status === "success"
        ? `Claude enrichment processed ${processed} incident(s).`
        : `Claude enrichment could not validate a brief: ${lastError ?? "unknown error"}`;
  const result: EnrichQueuedIncidentsResult = {
    status,
    message,
    processed,
    limited_count: limitedCount,
    failed_retryable_count: failedRetryableCount,
    brief_ready_count: briefReadyCount,
    context_only_count: contextOnlyCount,
    none_found_count: noneFoundCount,
    briefs_written: briefsWritten,
    sources_written: sourcesWritten,
    searches_used: searchesUsed,
  };

  await recordJobRun(
    db,
    "claude_enrichment",
    status === "success" ? "success" : "failed",
    message,
    {
      ...result,
      claude_model: model,
      tool_type: policy.tool_type,
      max_uses: policy.default_max_uses,
    },
    startedAt,
    new Date(),
  );

  return result;
}
