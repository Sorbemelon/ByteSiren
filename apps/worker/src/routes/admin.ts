import {
  ALLOWED_SYMBOLS,
  BINANCE_KLINES_LIMIT,
  type MarketSymbol,
  parseMarketSymbol,
  parseBooleanFlag,
} from "../config.ts";
import { enrichQueuedIncidents } from "../jobs/enrichQueuedIncidents.ts";
import { pollMarket } from "../jobs/pollMarket.ts";
import { runDailyOverviewsV02 } from "../jobs/runDailyOverviewsV02.ts";
import { runDetectorV02 } from "../jobs/runDetectorV02.ts";
import { runMarketStoriesV02 } from "../jobs/runMarketStoriesV02.ts";
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
      warnings.push(
        "Fixture Claude seeding is deferred; no Claude or source rows were written.",
      );
      response.fixture_claude = {
        status: "deferred",
        written: 0,
      };
    }

    return json(response);
  }

  return notFound();
}
