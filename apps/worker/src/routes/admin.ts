import {
  ALLOWED_SYMBOLS,
  BINANCE_KLINES_LIMIT,
  type MarketSymbol,
  parseMarketSymbol,
  parseBooleanFlag,
} from "../config.ts";
import { enrichQueuedIncidents } from "../jobs/enrichQueuedIncidents.ts";
import { pollMarket } from "../jobs/pollMarket.ts";
import {
  runClaudeEnrichmentV02,
  selectClaudeEnrichmentTargetsV02,
  type ClaudeEnrichmentTargetV02,
  type TargetKindV02,
} from "../jobs/runClaudeEnrichmentV02.ts";
import { runDailyOverviewsV02 } from "../jobs/runDailyOverviewsV02.ts";
import { runDetectorV02 } from "../jobs/runDetectorV02.ts";
import { runMarketStoriesV02 } from "../jobs/runMarketStoriesV02.ts";
import { seedFixtureClaudeV02 } from "../jobs/seedFixtureClaudeV02.ts";
import { checkBinanceKlines } from "../services/binance.ts";
import type { Env } from "../types/env.ts";
import type { SymbolPollResult } from "../types/market.ts";
import { json, jsonError, methodNotAllowed, notFound } from "../utils/http.ts";

const ADMIN_TOKEN_HEADER = "x-bytesiren-admin-token";
const V02_PIPELINE_STEPS = new Set([
  "detector",
  "market_stories",
  "daily_overviews",
] as const);

type V02PipelineStep = "detector" | "market_stories" | "daily_overviews";
type V02ClaudeSampleMode = "signal" | "daily" | "both";

interface V02ClaudeSampleOptions {
  mode: V02ClaudeSampleMode;
  limit: number;
  ids: string[];
  dryRun: boolean;
  targetKinds: TargetKindV02[];
}

interface V02ClaudeCounts {
  claude_briefs_v02: number;
  source_references_v02: number;
  accepted_source_references_v02: number;
  rejected_source_references_v02: number;
  legacy_claude_briefs: number;
  legacy_source_references: number;
}

function isMaintenanceEnabled(env: Env): boolean {
  return env.ENABLE_ADMIN_MAINTENANCE?.trim().toLowerCase() === "true";
}

function isV02AdminToolsEnabled(env: Env): boolean {
  return parseBooleanFlag(env.ENABLE_V02_ADMIN_TOOLS);
}

function isAuthorized(request: Request, env: Env): boolean {
  const expected = env.ADMIN_BACKFILL_TOKEN?.trim();
  const provided = request.headers.get(ADMIN_TOKEN_HEADER)?.trim();

  return Boolean(
    isMaintenanceEnabled(env) && expected && provided === expected,
  );
}

function parseMode(value: string | null): "recent" | "backfill" | undefined {
  if (value === null || value === "") {
    return undefined;
  }

  return value === "recent" || value === "backfill" ? value : undefined;
}

function parseLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.min(BINANCE_KLINES_LIMIT, Math.max(1, Math.trunc(parsed)));
}

function parseOptionalSymbol(value: string | null): MarketSymbol | undefined {
  if (!value) {
    return undefined;
  }

  return parseMarketSymbol(value) ?? undefined;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return fallback;
}

function parseCatchupLimit(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return 5;
  }

  return Math.max(1, Math.min(10, Math.trunc(parsed)));
}

function parseSampleLimit(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return 2;
  }

  return Math.max(1, Math.min(5, Math.trunc(parsed)));
}

function parseSampleMode(value: unknown): V02ClaudeSampleMode {
  if (value === undefined || value === null || value === "") {
    return "signal";
  }

  if (value === "signal" || value === "daily" || value === "both") {
    return value;
  }

  throw new Error("mode must be signal, daily, or both.");
}

function targetKindsForMode(mode: V02ClaudeSampleMode): TargetKindV02[] {
  if (mode === "signal") {
    return ["signal"];
  }

  if (mode === "daily") {
    return ["daily"];
  }

  return ["signal", "daily"];
}

function parseSampleIds(value: unknown): string[] {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("ids must be an array of strings.");
  }

  const ids = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  if (ids.length !== value.length) {
    throw new Error("ids must be an array of strings.");
  }

  return [...new Set(ids)].slice(0, 5);
}

function requireSampleFlags(env: Env, mode: V02ClaudeSampleMode) {
  const signalEnabled = parseBooleanFlag(env.ENABLE_SIGNAL_CLAUDE_V02);
  const dailyEnabled = parseBooleanFlag(env.ENABLE_DAILY_CLAUDE);

  if ((mode === "signal" || mode === "both") && !signalEnabled) {
    throw new Error("ENABLE_SIGNAL_CLAUDE_V02=true is required.");
  }

  if ((mode === "daily" || mode === "both") && !dailyEnabled) {
    throw new Error("ENABLE_DAILY_CLAUDE=true is required.");
  }
}

async function readV02ClaudeSampleOptions(
  request: Request,
): Promise<V02ClaudeSampleOptions> {
  let body: Record<string, unknown> = {};

  if (request.headers.get("content-type")?.includes("application/json")) {
    const parsed = (await request.json().catch(() => null)) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Request body must be a JSON object.");
    }

    body = parsed as Record<string, unknown>;
  }

  const mode = parseSampleMode(body.mode);

  return {
    mode,
    limit: parseSampleLimit(body.limit),
    ids: parseSampleIds(body.ids),
    dryRun: parseBoolean(body.dry_run, true),
    targetKinds: targetKindsForMode(mode),
  };
}

function dateUtcForTarget(target: ClaudeEnrichmentTargetV02): string {
  return target.payload.date_utc;
}

function safeSelectedTarget(target: ClaudeEnrichmentTargetV02) {
  return {
    target_type: target.target_type,
    target_id: target.target_id,
    prompt_mode: target.prompt_mode,
    date_utc: dateUtcForTarget(target),
    summary:
      target.kind === "signal"
        ? "Publishable v0.2 Signal Event selected for bounded Claude sample."
        : "Existing v0.2 Daily Overview selected for bounded Claude sample.",
  };
}

async function getV02ClaudeCounts(db: D1Database): Promise<V02ClaudeCounts> {
  const row = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM claude_briefs_v02) AS claude_briefs_v02,
        (SELECT COUNT(*) FROM source_references_v02) AS source_references_v02,
        (SELECT COUNT(*) FROM source_references_v02 WHERE accepted = 1) AS accepted_source_references_v02,
        (SELECT COUNT(*) FROM source_references_v02 WHERE accepted = 0) AS rejected_source_references_v02,
        (SELECT COUNT(*) FROM claude_briefs) AS legacy_claude_briefs,
        (SELECT COUNT(*) FROM source_references) AS legacy_source_references`,
    )
    .first<V02ClaudeCounts>();

  return {
    claude_briefs_v02: row?.claude_briefs_v02 ?? 0,
    source_references_v02: row?.source_references_v02 ?? 0,
    accepted_source_references_v02: row?.accepted_source_references_v02 ?? 0,
    rejected_source_references_v02: row?.rejected_source_references_v02 ?? 0,
    legacy_claude_briefs: row?.legacy_claude_briefs ?? 0,
    legacy_source_references: row?.legacy_source_references ?? 0,
  };
}

async function readV02PipelineOptions(request: Request): Promise<{
  steps: V02PipelineStep[];
  includeFixtureClaude: boolean;
}> {
  let body: Record<string, unknown> = {};

  if (request.headers.get("content-type")?.includes("application/json")) {
    const parsed = (await request.json().catch(() => null)) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Request body must be a JSON object.");
    }

    body = parsed as Record<string, unknown>;
  }

  const rawSteps = body.steps;
  const steps =
    rawSteps === undefined
      ? (["detector", "market_stories", "daily_overviews"] as V02PipelineStep[])
      : Array.isArray(rawSteps)
        ? rawSteps
        : null;

  if (!steps) {
    throw new Error("steps must be an array.");
  }

  const parsedSteps: V02PipelineStep[] = [];

  for (const step of steps) {
    if (
      typeof step !== "string" ||
      !V02_PIPELINE_STEPS.has(step as V02PipelineStep)
    ) {
      throw new Error(
        "steps must contain only detector, market_stories, or daily_overviews.",
      );
    }

    if (!parsedSteps.includes(step as V02PipelineStep)) {
      parsedSteps.push(step as V02PipelineStep);
    }
  }

  return {
    steps: parsedSteps,
    includeFixtureClaude: parseBoolean(body.include_fixture_claude, false),
  };
}

async function readCatchupOptions(request: Request): Promise<{
  limit: number;
  includeLimited: boolean;
  newestFirst: boolean;
}> {
  let body: Record<string, unknown> = {};

  if (request.headers.get("content-type")?.includes("application/json")) {
    const parsed = (await request.json().catch(() => null)) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Request body must be a JSON object.");
    }

    body = parsed as Record<string, unknown>;
  }

  const url = new URL(request.url);

  return {
    limit: parseCatchupLimit(body.limit ?? url.searchParams.get("limit")),
    includeLimited: parseBoolean(
      body.include_limited ?? url.searchParams.get("include_limited"),
      false,
    ),
    newestFirst: parseBoolean(
      body.newest_first ?? url.searchParams.get("newest_first"),
      true,
    ),
  };
}

function failuresForResponse(results: SymbolPollResult[]) {
  return results
    .filter((result) => !result.ok)
    .map((result) => ({
      symbol: result.symbol,
      mode: result.mode,
      stage: result.error_stage ?? null,
      code: result.error_code ?? "unknown_error",
      http_status: result.http_status ?? null,
      message: result.error ?? null,
    }));
}

export async function adminResponse(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return notFound();
  }

  const url = new URL(request.url);

  if (url.pathname === "/api/admin/binance-check") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    const symbol = parseMarketSymbol(url.searchParams.get("symbol"));

    if (!symbol) {
      return jsonError(
        400,
        "invalid_symbol",
        `Symbol must be one of: ${ALLOWED_SYMBOLS.join(", ")}.`,
      );
    }

    return json({ ...(await checkBinanceKlines({ symbol })) });
  }

  if (url.pathname === "/api/admin/market-poll") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    const rawMode = url.searchParams.get("mode");
    const mode = parseMode(rawMode);

    if (rawMode && !mode) {
      return jsonError(400, "invalid_mode", "Mode must be recent or backfill.");
    }

    const rawSymbol = url.searchParams.get("symbol");
    const symbol = parseOptionalSymbol(rawSymbol);

    if (rawSymbol && !symbol) {
      return jsonError(
        400,
        "invalid_symbol",
        `Symbol must be one of: ${ALLOWED_SYMBOLS.join(", ")}.`,
      );
    }

    const result = await pollMarket(env.DB, {
      mode,
      symbol,
      limit: parseLimit(url.searchParams.get("limit")),
    });
    const symbolsUpdated = result.symbols.filter((item) => item.ok).length;

    return json({
      ok: result.status !== "failed",
      mode: mode ?? "auto",
      symbols_attempted: result.symbols.length,
      symbols_updated: symbolsUpdated,
      failures: failuresForResponse(result.symbols),
      message: result.message,
    });
  }

  if (url.pathname === "/api/admin/claude-catchup") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    let options: Awaited<ReturnType<typeof readCatchupOptions>>;

    try {
      options = await readCatchupOptions(request);
    } catch {
      return jsonError(
        400,
        "invalid_request",
        "Request body must be a JSON object.",
      );
    }

    const result = await enrichQueuedIncidents(env.DB, env, {
      limit: options.limit,
      includeAnalysisLimited: options.includeLimited,
    });

    return json({
      ok: result.status !== "failed",
      processed: Math.max(result.processed, result.limited_count),
      brief_ready: result.brief_ready_count,
      context_only: result.context_only_count,
      none_found: result.none_found_count,
      limited: result.limited_count,
      failed_retryable: result.failed_retryable_count,
      newest_first: options.newestFirst,
      message: result.message,
    });
  }

  if (url.pathname === "/api/admin/v02/run-pipeline") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    if (!isV02AdminToolsEnabled(env)) {
      return notFound();
    }

    let options: Awaited<ReturnType<typeof readV02PipelineOptions>>;

    try {
      options = await readV02PipelineOptions(request);
    } catch {
      return jsonError(
        400,
        "invalid_request",
        "Request body must include valid v0.2 pipeline options.",
      );
    }

    const stepsRun: V02PipelineStep[] = [];
    const warnings: string[] = [];
    const response: Record<string, unknown> = {
      ok: true,
      steps_run: stepsRun,
      warnings,
    };

    if (options.steps.includes("detector")) {
      const detector = await runDetectorV02(env.DB, {
        enableMarketStories: false,
      });
      stepsRun.push("detector");
      response.detector = detector;
    }

    if (options.steps.includes("market_stories")) {
      const marketStories = await runMarketStoriesV02(env.DB);
      stepsRun.push("market_stories");
      response.market_stories = marketStories;
    }

    if (options.steps.includes("daily_overviews")) {
      const dailyOverviews = await runDailyOverviewsV02(env.DB, env);
      stepsRun.push("daily_overviews");
      response.daily_overviews = dailyOverviews;
    }

    if (options.includeFixtureClaude) {
      const fixtureClaude = await seedFixtureClaudeV02(env.DB);
      response.fixture_claude = fixtureClaude;

      if (fixtureClaude.status === "skipped") {
        warnings.push(fixtureClaude.message);
      }
    }

    return json(response);
  }

  if (url.pathname === "/api/admin/v02/run-claude-sample") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    if (!isV02AdminToolsEnabled(env)) {
      return notFound();
    }

    let options: V02ClaudeSampleOptions;

    try {
      options = await readV02ClaudeSampleOptions(request);
      requireSampleFlags(env, options.mode);
    } catch (error) {
      return jsonError(400, "invalid_request", safeSampleError(error));
    }

    const countsBefore = await getV02ClaudeCounts(env.DB);
    const selected = await selectClaudeEnrichmentTargetsV02(env.DB, env, {
      limit: options.limit,
      targetKinds: options.targetKinds,
      targetIds: options.ids,
    });
    const response: Record<string, unknown> = {
      ok: true,
      dry_run: options.dryRun,
      mode: options.mode,
      limit: options.limit,
      selected: selected.map(safeSelectedTarget),
      processed: 0,
      results: [],
      counts_before: countsBefore,
      counts_after: countsBefore,
      warnings: [],
    };

    if (options.dryRun) {
      return json(response);
    }

    const result = await runClaudeEnrichmentV02(env.DB, env, {
      limit: options.limit,
      targetKinds: options.targetKinds,
      targetIds: selected.map((target) => target.target_id),
    });
    const countsAfter = await getV02ClaudeCounts(env.DB);

    response.ok = result.status !== "failed";
    response.processed = result.processed;
    response.result = {
      status: result.status,
      message: result.message,
      processed: result.processed,
      signal_processed: result.signal_processed,
      daily_processed: result.daily_processed,
      brief_ready: result.brief_ready_count,
      context_only: result.context_only_count,
      no_clear_cause: result.no_clear_cause_count,
      no_major_driver: result.no_major_driver_count,
      claude_limited: result.claude_limited_count,
      failed_retryable: result.failed_retryable_count,
      failed_terminal: result.failed_terminal_count,
      sources_written: result.sources_written,
      rejected_sources: result.rejected_sources_count,
      limit: result.limit,
    };
    response.counts_after = countsAfter;

    return json(response);
  }

  return notFound();
}

function safeSampleError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Request body must include valid v0.2 Claude sample options.";
}
