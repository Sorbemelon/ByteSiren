import {
  ALLOWED_SYMBOLS,
  BINANCE_KLINES_LIMIT,
  MARKET_INTERVAL,
  type MarketSymbol,
  parseMarketSymbol,
  parseBooleanFlag,
} from "../config.ts";
import {
  getCandleHistoryBounds,
  recordJobRun,
} from "../db/marketRepository.ts";
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
import {
  runMarketStoriesV02,
  type RunMarketStoriesV02Result,
} from "../jobs/runMarketStoriesV02.ts";
import { seedFixtureClaudeV02 } from "../jobs/seedFixtureClaudeV02.ts";
import { checkBinanceKlines } from "../services/binance.ts";
import { MARKET_STORY_V02_MODEL_VERSION } from "../services/marketStoriesV02/index.ts";
import type { Env } from "../types/env.ts";
import type { SymbolPollResult } from "../types/market.ts";
import {
  json,
  jsonError,
  methodNotAllowed,
  notFound,
  safeErrorMessage,
} from "../utils/http.ts";

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

interface V02PipelineOptions {
  steps: V02PipelineStep[];
  includeFixtureClaude: boolean;
  mode: "legacy_unbounded" | "bounded";
  dryRun: boolean;
  dateFrom: string | null;
  dateTo: string | null;
  timeFrom: string | null;
  timeTo: string | null;
  maxDays: number;
  maxSymbols: number;
  allowUnboundedDetector: boolean;
}

interface V02TableCounts {
  signal_events_v02: number;
  signal_event_symbols_v02: number;
  audit_events_v02: number;
  market_stories_v02: number;
  market_story_members_v02: number;
  daily_overviews_v02: number;
  claude_briefs_v02: number;
  source_references_v02: number;
}

interface CandleCoverageRow {
  symbol: MarketSymbol;
  date_utc: string;
  candle_count: number;
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

function dateUtc(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function isoUtc(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const parsed = Date.parse(trimmed);

  if (
    !Number.isFinite(parsed) ||
    !trimmed.endsWith("Z") ||
    new Date(parsed).toISOString() !== trimmed
  ) {
    return null;
  }

  return trimmed;
}

function parseMaxDays(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, Math.min(3, Math.trunc(parsed)));
}

function parseMaxSymbols(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return ALLOWED_SYMBOLS.length;
  }

  return Math.max(1, Math.min(ALLOWED_SYMBOLS.length, Math.trunc(parsed)));
}

function inclusiveDayCount(dateFrom: string, dateTo: string): number {
  const from = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const to = Date.parse(`${dateTo}T00:00:00.000Z`);

  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
    return 0;
  }

  return Math.floor((to - from) / (24 * 60 * 60 * 1000)) + 1;
}

function resolvePipelineDateRange(body: Record<string, unknown>): {
  dateFrom: string | null;
  dateTo: string | null;
  timeFrom: string | null;
  timeTo: string | null;
} {
  const singleDate = dateUtc(body.date_utc);
  const dateFrom = dateUtc(body.date_from) ?? singleDate;
  const dateTo = dateUtc(body.date_to) ?? singleDate ?? dateFrom;
  const timeFrom = isoUtc(body.time_from);
  const timeTo = isoUtc(body.time_to);

  if ((body.date_from && !dateFrom) || (body.date_to && !dateTo)) {
    throw new Error("date_from and date_to must use YYYY-MM-DD.");
  }

  if (body.date_utc && !singleDate) {
    throw new Error("date_utc must use YYYY-MM-DD.");
  }

  if (dateFrom && dateTo && inclusiveDayCount(dateFrom, dateTo) <= 0) {
    throw new Error("date_to must be on or after date_from.");
  }

  if ((body.time_from && !timeFrom) || (body.time_to && !timeTo)) {
    throw new Error("time_from and time_to must use UTC ISO timestamps.");
  }

  if ((timeFrom && !timeTo) || (!timeFrom && timeTo)) {
    throw new Error("time_from and time_to must be provided together.");
  }

  if (timeFrom && timeTo) {
    if (!dateFrom || !dateTo) {
      throw new Error("time windows require date_utc or date_from/date_to.");
    }

    const fromMs = Date.parse(timeFrom);
    const toMs = Date.parse(timeTo);
    const maxWindowMs = 12 * 60 * 60 * 1000;

    if (toMs <= fromMs) {
      throw new Error("time_to must be after time_from.");
    }

    if (toMs - fromMs > maxWindowMs) {
      throw new Error("bounded detector time window exceeds 12 hours.");
    }

    if (timeFrom.slice(0, 10) < dateFrom || timeTo.slice(0, 10) > dateTo) {
      throw new Error("time window must stay inside date_from/date_to.");
    }
  }

  return {
    dateFrom,
    dateTo,
    timeFrom,
    timeTo,
  };
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

async function readV02PipelineOptions(
  request: Request,
): Promise<V02PipelineOptions> {
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

  const mode = body.mode === "bounded" ? "bounded" : "legacy_unbounded";
  const { dateFrom, dateTo, timeFrom, timeTo } = resolvePipelineDateRange(body);
  const maxDays = parseMaxDays(body.max_days);
  const maxSymbols = parseMaxSymbols(body.max_symbols);
  const allowUnboundedDetector = parseBoolean(
    body.allow_unbounded_detector,
    false,
  );

  if (mode === "bounded") {
    if (dateFrom && dateTo && inclusiveDayCount(dateFrom, dateTo) > maxDays) {
      throw new Error("bounded pipeline date range exceeds max_days.");
    }

    if (
      parsedSteps.some(
        (step) => step === "detector" || step === "daily_overviews",
      ) &&
      (!dateFrom || !dateTo)
    ) {
      throw new Error(
        "bounded detector/daily_overviews requests require date_utc or date_from/date_to.",
      );
    }
  } else if (parsedSteps.includes("detector") && !allowUnboundedDetector) {
    throw new Error(
      "unbounded v0.2 detector requests require allow_unbounded_detector=true.",
    );
  }

  return {
    steps: parsedSteps,
    includeFixtureClaude: parseBoolean(body.include_fixture_claude, false),
    mode,
    dryRun: parseBoolean(body.dry_run, mode === "bounded"),
    dateFrom,
    dateTo,
    timeFrom,
    timeTo,
    maxDays,
    maxSymbols,
    allowUnboundedDetector,
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

async function getV02TableCounts(db: D1Database): Promise<V02TableCounts> {
  const row = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM signal_events_v02) AS signal_events_v02,
        (SELECT COUNT(*) FROM signal_event_symbols_v02) AS signal_event_symbols_v02,
        (SELECT COUNT(*) FROM audit_events_v02) AS audit_events_v02,
        (SELECT COUNT(*) FROM market_stories_v02) AS market_stories_v02,
        (SELECT COUNT(*) FROM market_story_members_v02) AS market_story_members_v02,
        (SELECT COUNT(*) FROM daily_overviews_v02) AS daily_overviews_v02,
        (SELECT COUNT(*) FROM claude_briefs_v02) AS claude_briefs_v02,
        (SELECT COUNT(*) FROM source_references_v02) AS source_references_v02`,
    )
    .first<V02TableCounts>();

  return {
    signal_events_v02: row?.signal_events_v02 ?? 0,
    signal_event_symbols_v02: row?.signal_event_symbols_v02 ?? 0,
    audit_events_v02: row?.audit_events_v02 ?? 0,
    market_stories_v02: row?.market_stories_v02 ?? 0,
    market_story_members_v02: row?.market_story_members_v02 ?? 0,
    daily_overviews_v02: row?.daily_overviews_v02 ?? 0,
    claude_briefs_v02: row?.claude_briefs_v02 ?? 0,
    source_references_v02: row?.source_references_v02 ?? 0,
  };
}

async function listCandleCoverageRows(
  db: D1Database,
): Promise<CandleCoverageRow[]> {
  const result = await db
    .prepare(
      `SELECT
        symbol,
        substr(open_time, 1, 10) AS date_utc,
        COUNT(*) AS candle_count
       FROM market_candles
       WHERE interval = ?
       GROUP BY symbol, date_utc
       ORDER BY date_utc ASC, symbol ASC`,
    )
    .bind(MARKET_INTERVAL)
    .all<CandleCoverageRow>();

  return result.results;
}

function completeUtcDaysFromCoverage(rows: CandleCoverageRow[]): string[] {
  const byDate = new Map<string, Map<string, number>>();
  const currentDateUtc = new Date().toISOString().slice(0, 10);

  for (const row of rows) {
    const bySymbol = byDate.get(row.date_utc) ?? new Map<string, number>();
    bySymbol.set(row.symbol, Number(row.candle_count));
    byDate.set(row.date_utc, bySymbol);
  }

  return [...byDate.entries()]
    .filter(([dateUtc, bySymbol]) => {
      if (dateUtc >= currentDateUtc) {
        return false;
      }

      return ALLOWED_SYMBOLS.every(
        (symbol) => (bySymbol.get(symbol) ?? 0) >= 77,
      );
    })
    .map(([dateUtc]) => dateUtc)
    .sort();
}

async function lastV02JobRuns(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT job_name, status, started_at, finished_at, message, metadata_json
       FROM job_runs
       WHERE job_name IN ('admin_v02_pipeline', 'run_detector_v02', 'run_market_stories_v02', 'run_daily_overviews_v02')
       ORDER BY started_at DESC
       LIMIT 100`,
    )
    .all<Record<string, unknown>>();

  return result.results;
}

async function staleStartedV02JobRuns(
  db: D1Database,
  now = new Date(),
): Promise<Record<string, unknown>[]> {
  const thresholdIso = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const result = await db
    .prepare(
      `SELECT job_name, status, started_at, finished_at, message, metadata_json
       FROM job_runs
       WHERE job_name IN ('admin_v02_pipeline', 'run_detector_v02', 'run_market_stories_v02', 'run_daily_overviews_v02')
         AND status = 'started'
         AND started_at <= ?
       ORDER BY started_at DESC
       LIMIT 50`,
    )
    .bind(thresholdIso)
    .all<Record<string, unknown>>();

  return result.results;
}

async function diagnosticsResponse(env: Env): Promise<Response> {
  const [candleBounds, coverageRows, tableCounts, jobRuns, staleJobRuns] =
    await Promise.all([
      Promise.all(
        ALLOWED_SYMBOLS.map((symbol) => getCandleHistoryBounds(env.DB, symbol)),
      ),
      listCandleCoverageRows(env.DB),
      getV02TableCounts(env.DB),
      lastV02JobRuns(env.DB),
      staleStartedV02JobRuns(env.DB),
    ]);
  const completeDays = completeUtcDaysFromCoverage(coverageRows);
  const totalCandles = candleBounds.reduce((sum, row) => sum + row.count, 0);
  const oldest =
    candleBounds
      .map((row) => row.earliest_open_time)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;
  const latest =
    candleBounds
      .map((row) => row.latest_close_time)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  return json({
    ok: true,
    diagnostics_version: "v02_admin_diagnostics_v1",
    feature_flags: {
      detector_version: env.DETECTOR_VERSION ?? null,
      feed_version: env.FEED_VERSION ?? null,
      enable_market_stories: parseBooleanFlag(env.ENABLE_MARKET_STORIES),
      enable_daily_overviews: parseBooleanFlag(env.ENABLE_DAILY_OVERVIEWS),
      enable_signal_claude_v02: parseBooleanFlag(env.ENABLE_SIGNAL_CLAUDE_V02),
      enable_daily_claude: parseBooleanFlag(env.ENABLE_DAILY_CLAUDE),
      enable_admin_maintenance: isMaintenanceEnabled(env),
      enable_v02_admin_tools: isV02AdminToolsEnabled(env),
    },
    candles: {
      by_symbol: candleBounds,
      coverage_days_by_symbol: coverageRows,
      expected_complete_utc_day_count: completeDays.length,
      complete_utc_days: completeDays,
    },
    v02_table_counts: tableCounts,
    last_job_runs: jobRuns,
    stale_started_job_runs: staleJobRuns,
    estimated_work_size: {
      symbol_count: ALLOWED_SYMBOLS.length,
      candle_count: totalCandles,
      oldest_candle_time: oldest,
      latest_candle_time: latest,
      complete_days: completeDays.length,
      date_range:
        oldest && latest
          ? {
              start: oldest.slice(0, 10),
              end: latest.slice(0, 10),
            }
          : null,
    },
  });
}

async function recordPipelineBreadcrumb(
  db: D1Database,
  status: "started" | "success" | "failed" | "skipped",
  message: string,
  metadata: Record<string, unknown>,
  startedAt = new Date(),
) {
  await recordJobRun(
    db,
    "admin_v02_pipeline",
    status,
    message,
    metadata,
    startedAt,
    status === "started" ? startedAt : new Date(),
  );
}

function safePipelineOptionsForMetadata(
  options: Pick<
    V02PipelineOptions,
    | "mode"
    | "dryRun"
    | "dateFrom"
    | "dateTo"
    | "timeFrom"
    | "timeTo"
    | "maxDays"
    | "maxSymbols"
  >,
) {
  return {
    mode: options.mode,
    dry_run: options.dryRun,
    date_from: options.dateFrom,
    date_to: options.dateTo,
    time_from: options.timeFrom,
    time_to: options.timeTo,
    max_days: options.maxDays,
    max_symbols: options.maxSymbols,
  };
}

function pipelineResultFailed(result: unknown): boolean {
  return (
    Boolean(result) &&
    typeof result === "object" &&
    (result as { status?: unknown }).status === "failed"
  );
}

function pipelineResultMessage(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "v0.2 admin pipeline step failed.";
  }

  const message = (result as { message?: unknown }).message;
  return typeof message === "string"
    ? message
    : "v0.2 admin pipeline step failed.";
}

async function runPipelineStepWithBreadcrumb<T>(
  env: Env,
  step: V02PipelineStep,
  requestId: string,
  options: V02PipelineOptions,
  run: () => Promise<T>,
): Promise<T> {
  if (!options.dryRun) {
    await recordPipelineBreadcrumb(
      env.DB,
      "started",
      `v0.2 admin pipeline step started: ${step}.`,
      {
        request_id: requestId,
        step,
        ...safePipelineOptionsForMetadata(options),
      },
    );
  }

  try {
    const result = await run();

    if (pipelineResultFailed(result)) {
      throw new Error(pipelineResultMessage(result));
    }

    if (!options.dryRun) {
      await recordPipelineBreadcrumb(
        env.DB,
        "success",
        `v0.2 admin pipeline step completed: ${step}.`,
        {
          request_id: requestId,
          step,
          result:
            result && typeof result === "object"
              ? {
                  status: (result as { status?: unknown }).status ?? null,
                  message: (result as { message?: unknown }).message ?? null,
                }
              : null,
          ...safePipelineOptionsForMetadata(options),
        },
      );
    }

    return result;
  } catch (error) {
    if (!options.dryRun) {
      await recordPipelineBreadcrumb(
        env.DB,
        "failed",
        `v0.2 admin pipeline step failed: ${step}.`,
        {
          request_id: requestId,
          step,
          error_message: safeErrorMessage(error),
          ...safePipelineOptionsForMetadata(options),
        },
      );
    }

    throw error;
  }
}

function boundedDetectorOptions(
  options: V02PipelineOptions,
  requestId: string,
) {
  return options.mode === "bounded"
    ? {
        dateFrom: options.dateFrom ?? undefined,
        dateTo: options.dateTo ?? undefined,
        timeFrom: options.timeFrom ?? undefined,
        timeTo: options.timeTo ?? undefined,
        dryRun: options.dryRun,
        requestId,
        enableMarketStories: false,
      }
    : {
        dryRun: false,
        requestId,
        enableMarketStories: false,
      };
}

function boundedDailyOptions(options: V02PipelineOptions, requestId: string) {
  return options.mode === "bounded"
    ? {
        dateFrom: options.dateFrom ?? undefined,
        dateTo: options.dateTo ?? undefined,
        dryRun: options.dryRun,
        requestId,
      }
    : {
        dryRun: false,
        requestId,
      };
}

function pipelineJsonError(
  status: number,
  code: string,
  message: string,
  step: V02PipelineStep | null,
  requestId: string,
  options: V02PipelineOptions,
  safeDetails: Record<string, unknown> = {},
): Response {
  return json(
    {
      ok: false,
      error: {
        code,
        message,
        step,
        date_utc:
          options.dateFrom && options.dateFrom === options.dateTo
            ? options.dateFrom
            : null,
        date_from: options.dateFrom,
        date_to: options.dateTo,
        time_from: options.timeFrom,
        time_to: options.timeTo,
        request_id: requestId,
        safe_details: {
          ...safePipelineOptionsForMetadata(options),
          ...safeDetails,
        },
      },
    },
    { status },
  );
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

  if (url.pathname === "/api/admin/v02/diagnostics") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    if (!isV02AdminToolsEnabled(env)) {
      return notFound();
    }

    return diagnosticsResponse(env);
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
    } catch (error) {
      return jsonError(400, "invalid_request", safeErrorMessage(error));
    }

    const stepsRun: V02PipelineStep[] = [];
    const warnings: string[] = [];
    const requestId = crypto.randomUUID();
    const response: Record<string, unknown> = {
      ok: true,
      dry_run: options.dryRun,
      mode: options.mode,
      request_id: requestId,
      date_from: options.dateFrom,
      date_to: options.dateTo,
      time_from: options.timeFrom,
      time_to: options.timeTo,
      steps_run: stepsRun,
      warnings,
    };
    let activeStep: V02PipelineStep | null = null;

    try {
      if (options.steps.includes("detector")) {
        activeStep = "detector";
        const detector = await runPipelineStepWithBreadcrumb(
          env,
          "detector",
          requestId,
          options,
          () =>
            runDetectorV02(env.DB, boundedDetectorOptions(options, requestId)),
        );
        stepsRun.push("detector");
        response.detector = detector;
      }

      if (options.steps.includes("market_stories")) {
        activeStep = "market_stories";
        const marketStories = await runPipelineStepWithBreadcrumb(
          env,
          "market_stories",
          requestId,
          options,
          () =>
            options.dryRun
              ? Promise.resolve({
                  status: "success" as const,
                  message:
                    "v0.2 Market Story generation dry-run: existing Signal/Audit rows would be used.",
                  story_model_version: MARKET_STORY_V02_MODEL_VERSION,
                  story_count: 0,
                  publish_candidate_count: 0,
                  suppressed_count: 0,
                  audit_only_story_count: 0,
                  signal_story_count: 0,
                  signal_audit_story_count: 0,
                  market_stories_written: 0,
                  market_story_members_written: 0,
                } satisfies RunMarketStoriesV02Result)
              : runMarketStoriesV02(env.DB),
        );
        stepsRun.push("market_stories");
        response.market_stories = marketStories;
      }

      if (options.steps.includes("daily_overviews")) {
        activeStep = "daily_overviews";
        const dailyOverviews = await runPipelineStepWithBreadcrumb(
          env,
          "daily_overviews",
          requestId,
          options,
          () =>
            runDailyOverviewsV02(
              env.DB,
              env,
              boundedDailyOptions(options, requestId),
            ),
        );
        stepsRun.push("daily_overviews");
        response.daily_overviews = dailyOverviews;
      }
    } catch (error) {
      return pipelineJsonError(
        503,
        "v02_pipeline_step_failed",
        safeErrorMessage(error),
        activeStep,
        requestId,
        options,
        { steps_run: stepsRun },
      );
    }

    if (options.includeFixtureClaude && !options.dryRun) {
      const fixtureClaude = await seedFixtureClaudeV02(env.DB);
      response.fixture_claude = fixtureClaude;

      if (fixtureClaude.status === "skipped") {
        warnings.push(fixtureClaude.message);
      }
    } else if (options.includeFixtureClaude && options.dryRun) {
      warnings.push("Fixture Claude seeding skipped during dry-run.");
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
