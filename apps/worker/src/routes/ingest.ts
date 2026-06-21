import {
  ALLOWED_SYMBOLS,
  MARKET_INTERVAL,
  type MarketSymbol,
  parseMarketSymbol,
} from "../config.ts";
import { upsertMarketCandles } from "../db/marketRepository.ts";
import { runDetector } from "../jobs/runDetector.ts";
import type { Env } from "../types/env.ts";
import type { MarketCandle } from "../types/market.ts";
import {
  json,
  jsonError,
  methodNotAllowed,
  notFound,
  safeErrorMessage,
} from "../utils/http.ts";

const MARKET_TOKEN_HEADER = "x-bytesiren-market-token";
const MAX_CANDLES_PER_REQUEST = 500;
const MAX_IMPORT_BODY_BYTES = 1_000_000;

interface ImportCandleInput {
  open_time?: unknown;
  close_time?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
  volume?: unknown;
  quote_volume?: unknown;
  trade_count?: unknown;
}

interface ImportBody {
  symbol?: unknown;
  interval?: unknown;
  candles?: unknown;
  run_detector?: unknown;
}

function isImportEnabled(env: Env): boolean {
  return env.ENABLE_MARKET_IMPORT?.trim().toLowerCase() === "true";
}

function isAuthorized(request: Request, env: Env): boolean {
  const expected = env.MARKET_IMPORT_TOKEN?.trim();
  const provided = request.headers.get(MARKET_TOKEN_HEADER)?.trim();

  return Boolean(isImportEnabled(env) && expected && provided === expected);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function tradeCount(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!isFiniteNumber(value) || value < 0) {
    throw new Error("trade_count must be null or a non-negative number.");
  }

  return Math.trunc(value);
}

function validateCandle(
  candle: ImportCandleInput,
  symbol: MarketSymbol,
  index: number,
): MarketCandle {
  const openTime = isoTimestamp(candle.open_time);
  const closeTime = isoTimestamp(candle.close_time);

  if (!openTime || !closeTime) {
    throw new Error(`Candle ${index + 1} has invalid timestamps.`);
  }

  if (
    !isFiniteNumber(candle.open) ||
    !isFiniteNumber(candle.high) ||
    !isFiniteNumber(candle.low) ||
    !isFiniteNumber(candle.close)
  ) {
    throw new Error(`Candle ${index + 1} has invalid OHLC values.`);
  }

  if (
    candle.open <= 0 ||
    candle.high <= 0 ||
    candle.low <= 0 ||
    candle.close <= 0 ||
    candle.high < candle.low
  ) {
    throw new Error(`Candle ${index + 1} has inconsistent OHLC values.`);
  }

  if (!isFiniteNumber(candle.volume) || candle.volume < 0) {
    throw new Error(`Candle ${index + 1} has invalid volume.`);
  }

  if (!isFiniteNumber(candle.quote_volume) || candle.quote_volume < 0) {
    throw new Error(`Candle ${index + 1} has invalid quote volume.`);
  }

  return {
    symbol,
    interval: MARKET_INTERVAL,
    open_time: openTime,
    close_time: closeTime,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    quote_volume: candle.quote_volume,
    trade_count: tradeCount(candle.trade_count),
  };
}

async function parseImportBody(request: Request): Promise<ImportBody> {
  const rawLength = request.headers.get("content-length");
  const contentLength = rawLength ? Number(rawLength) : null;

  if (
    contentLength !== null &&
    Number.isFinite(contentLength) &&
    contentLength > MAX_IMPORT_BODY_BYTES
  ) {
    throw new Response("payload_too_large", { status: 413 });
  }

  const text = await request.text();

  if (text.length > MAX_IMPORT_BODY_BYTES) {
    throw new Response("payload_too_large", { status: 413 });
  }

  try {
    return JSON.parse(text) as ImportBody;
  } catch {
    throw new Response("invalid_json", { status: 400 });
  }
}

function validateImport(body: ImportBody): {
  symbol: MarketSymbol;
  candles: MarketCandle[];
  runDetectorRequested: boolean;
} {
  const symbol =
    typeof body.symbol === "string" ? parseMarketSymbol(body.symbol) : null;

  if (!symbol) {
    throw new Error(`Symbol must be one of: ${ALLOWED_SYMBOLS.join(", ")}.`);
  }

  if (body.interval !== MARKET_INTERVAL) {
    throw new Error(`Interval must be ${MARKET_INTERVAL}.`);
  }

  if (!Array.isArray(body.candles) || body.candles.length === 0) {
    throw new Error("Candles must be a non-empty array.");
  }

  if (body.candles.length > MAX_CANDLES_PER_REQUEST) {
    throw new Error(
      `Candles must contain at most ${MAX_CANDLES_PER_REQUEST} rows.`,
    );
  }

  return {
    symbol,
    candles: body.candles.map((item, index) =>
      validateCandle(item as ImportCandleInput, symbol, index),
    ),
    runDetectorRequested: body.run_detector === true,
  };
}

export async function ingestCandlesResponse(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return notFound();
  }

  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  let body: ImportBody;

  try {
    body = await parseImportBody(request);
  } catch (error) {
    if (error instanceof Response && error.status === 413) {
      return jsonError(
        413,
        "payload_too_large",
        "Import payload is too large.",
      );
    }

    return jsonError(400, "invalid_json", "Request body must be valid JSON.");
  }

  let validated: {
    symbol: MarketSymbol;
    candles: MarketCandle[];
    runDetectorRequested: boolean;
  };

  try {
    validated = validateImport(body);
  } catch (error) {
    return jsonError(
      400,
      "invalid_import_payload",
      error instanceof Error ? error.message : "Import payload is invalid.",
    );
  }

  try {
    const { symbol, candles, runDetectorRequested } = validated;
    const upserted = await upsertMarketCandles(env.DB, candles);
    const detector = runDetectorRequested
      ? await runDetector(env.DB, { env })
      : undefined;

    return json({
      ok: true,
      symbol,
      interval: MARKET_INTERVAL,
      received: candles.length,
      upserted,
      detector: detector
        ? {
            ran: true,
            status: detector.status,
            candidate_count: detector.candidate_count,
            message: detector.message,
          }
        : {
            ran: false,
          },
    });
  } catch (error) {
    return jsonError(
      500,
      "import_failed",
      `Market import failed: ${safeErrorMessage(error)}`,
    );
  }
}
