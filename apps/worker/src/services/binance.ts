import {
  BINANCE_BASE_URL,
  BINANCE_KLINES_LIMIT,
  BINANCE_USER_AGENT,
  FIFTEEN_MINUTES_MS,
  MARKET_INTERVAL,
  type MarketSymbol,
  isAllowedSymbol,
} from "../config.ts";
import type { BinanceKlineRow, MarketCandle } from "../types/market.ts";
import { safeErrorMessage } from "../utils/http.ts";

export interface BinanceFetchOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export interface FetchKlinesInput extends BinanceFetchOptions {
  symbol: MarketSymbol;
  limit?: number;
  startTimeMs?: number;
  endTimeMs?: number;
}

export interface FetchPaginatedKlinesInput extends FetchKlinesInput {
  maxPages?: number;
}

export type BinanceKlinesErrorStage = "fetch" | "parse";

export class BinanceKlinesError extends Error {
  readonly code: string;
  readonly stage: BinanceKlinesErrorStage;
  readonly httpStatus: number | null;
  readonly contentType: string | null;
  readonly responseSummary: string | null;

  constructor(
    message: string,
    {
      code,
      stage,
      httpStatus = null,
      contentType = null,
      responseSummary = null,
    }: {
      code: string;
      stage: BinanceKlinesErrorStage;
      httpStatus?: number | null;
      contentType?: string | null;
      responseSummary?: string | null;
    },
  ) {
    super(message);
    this.name = "BinanceKlinesError";
    this.code = code;
    this.stage = stage;
    this.httpStatus = httpStatus;
    this.contentType = contentType;
    this.responseSummary = responseSummary;
  }
}

export interface BinanceKlinesCheckResult {
  ok: boolean;
  symbol: MarketSymbol;
  status: number | null;
  content_type: string | null;
  parsed_rows_count: number;
  first_open_time: string | null;
  error_code: string | null;
  message: string | null;
}

function sanitizeDiagnosticText(value: string, maxLength = 200): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function parseFiniteNumber(value: string | number, fieldName: string): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid Binance kline ${fieldName}.`);
  }

  return parsed;
}

function assertKlineRow(row: unknown): asserts row is BinanceKlineRow {
  if (!Array.isArray(row) || row.length < 9) {
    throw new Error("Invalid Binance kline row.");
  }
}

export function validateMarketSymbol(
  symbol: string,
): asserts symbol is MarketSymbol {
  if (!isAllowedSymbol(symbol)) {
    throw new Error("Symbol is not supported.");
  }
}

function buildKlinesUrl({
  symbol,
  limit,
  startTimeMs,
  endTimeMs,
  baseUrl,
}: {
  symbol: MarketSymbol;
  limit: number;
  startTimeMs?: number;
  endTimeMs?: number;
  baseUrl: string;
}): URL {
  const url = new URL("/api/v3/klines", baseUrl);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", MARKET_INTERVAL);
  url.searchParams.set("limit", String(Math.min(limit, BINANCE_KLINES_LIMIT)));

  if (startTimeMs !== undefined) {
    url.searchParams.set("startTime", String(Math.trunc(startTimeMs)));
  }

  if (endTimeMs !== undefined) {
    url.searchParams.set("endTime", String(Math.trunc(endTimeMs)));
  }

  return url;
}

async function requestBinanceKlineRows({
  symbol,
  limit,
  startTimeMs,
  endTimeMs,
  baseUrl,
  fetcher,
}: Required<
  Pick<FetchKlinesInput, "symbol" | "limit" | "baseUrl" | "fetcher">
> &
  Pick<FetchKlinesInput, "startTimeMs" | "endTimeMs">): Promise<{
  rows: unknown[];
  status: number;
  contentType: string | null;
}> {
  const url = buildKlinesUrl({
    symbol,
    limit,
    startTimeMs,
    endTimeMs,
    baseUrl,
  });
  let response: Response;

  try {
    response = await fetcher(url.toString(), {
      headers: {
        "user-agent": BINANCE_USER_AGENT,
      },
    });
  } catch (error) {
    throw new BinanceKlinesError("Binance klines network request failed.", {
      code: "fetch_network_error",
      stage: "fetch",
      responseSummary: safeErrorMessage(error),
    });
  }

  const contentType = response.headers.get("content-type");
  const body = await response.text();
  const bodySummary = sanitizeDiagnosticText(body);

  if (!response.ok) {
    throw new BinanceKlinesError(
      `Binance klines request failed with HTTP ${response.status}.`,
      {
        code: `fetch_http_${response.status}`,
        stage: "fetch",
        httpStatus: response.status,
        contentType,
        responseSummary: bodySummary,
      },
    );
  }

  let rows: unknown;

  try {
    rows = JSON.parse(body || "null");
  } catch {
    throw new BinanceKlinesError("Binance klines response was not JSON.", {
      code: "parse_json_error",
      stage: "parse",
      httpStatus: response.status,
      contentType,
      responseSummary: bodySummary,
    });
  }

  if (!Array.isArray(rows)) {
    throw new BinanceKlinesError("Binance klines response was not an array.", {
      code: "parse_shape_error",
      stage: "parse",
      httpStatus: response.status,
      contentType,
      responseSummary: bodySummary,
    });
  }

  return {
    rows,
    status: response.status,
    contentType,
  };
}

export function parseBinanceKlineRow(
  row: unknown,
  symbol: MarketSymbol,
): MarketCandle {
  assertKlineRow(row);

  const openTimeMs = parseFiniteNumber(row[0], "open_time");
  const closeTimeMs = parseFiniteNumber(row[6], "close_time");

  return {
    symbol,
    interval: MARKET_INTERVAL,
    open_time: new Date(openTimeMs).toISOString(),
    close_time: new Date(closeTimeMs).toISOString(),
    open: parseFiniteNumber(row[1], "open"),
    high: parseFiniteNumber(row[2], "high"),
    low: parseFiniteNumber(row[3], "low"),
    close: parseFiniteNumber(row[4], "close"),
    volume: parseFiniteNumber(row[5], "volume"),
    quote_volume: parseFiniteNumber(row[7], "quote_volume"),
    trade_count: Number.isFinite(Number(row[8])) ? Number(row[8]) : null,
  };
}

export async function fetchKlines({
  symbol,
  limit = BINANCE_KLINES_LIMIT,
  startTimeMs,
  endTimeMs,
  baseUrl = BINANCE_BASE_URL,
  fetcher = fetch,
}: FetchKlinesInput): Promise<MarketCandle[]> {
  validateMarketSymbol(symbol);

  const { rows } = await requestBinanceKlineRows({
    symbol,
    limit,
    startTimeMs,
    endTimeMs,
    baseUrl,
    fetcher,
  });

  try {
    return rows.map((row) => parseBinanceKlineRow(row, symbol));
  } catch (error) {
    throw new BinanceKlinesError("Binance klines row parsing failed.", {
      code: "parse_row_error",
      stage: "parse",
      responseSummary: safeErrorMessage(error),
    });
  }
}

export async function fetchPaginatedKlines({
  symbol,
  limit = BINANCE_KLINES_LIMIT,
  startTimeMs,
  endTimeMs,
  maxPages = 8,
  baseUrl = BINANCE_BASE_URL,
  fetcher = fetch,
}: FetchPaginatedKlinesInput): Promise<MarketCandle[]> {
  if (startTimeMs === undefined || endTimeMs === undefined) {
    return fetchKlines({ symbol, limit, baseUrl, fetcher });
  }

  const candles: MarketCandle[] = [];
  let nextStart = startTimeMs;

  for (let page = 0; page < maxPages && nextStart <= endTimeMs; page += 1) {
    const pageCandles = await fetchKlines({
      symbol,
      limit,
      startTimeMs: nextStart,
      endTimeMs,
      baseUrl,
      fetcher,
    });

    if (pageCandles.length === 0) {
      break;
    }

    candles.push(...pageCandles);

    const lastOpenTime = Date.parse(
      pageCandles[pageCandles.length - 1].open_time,
    );
    const followingOpenTime = lastOpenTime + FIFTEEN_MINUTES_MS;

    if (!Number.isFinite(lastOpenTime) || followingOpenTime <= nextStart) {
      break;
    }

    nextStart = followingOpenTime;

    if (pageCandles.length < limit) {
      break;
    }
  }

  return candles;
}

export async function checkBinanceKlines({
  symbol,
  baseUrl = BINANCE_BASE_URL,
  fetcher = fetch,
}: BinanceFetchOptions & {
  symbol: MarketSymbol;
}): Promise<BinanceKlinesCheckResult> {
  validateMarketSymbol(symbol);

  try {
    const { rows, status, contentType } = await requestBinanceKlineRows({
      symbol,
      limit: 1,
      baseUrl,
      fetcher,
    });
    const firstRow = rows[0];
    const firstOpenMs = Array.isArray(firstRow) ? Number(firstRow[0]) : NaN;

    return {
      ok: true,
      symbol,
      status,
      content_type: contentType,
      parsed_rows_count: rows.length,
      first_open_time: Number.isFinite(firstOpenMs)
        ? new Date(firstOpenMs).toISOString()
        : null,
      error_code: null,
      message: null,
    };
  } catch (error) {
    if (error instanceof BinanceKlinesError) {
      return {
        ok: false,
        symbol,
        status: error.httpStatus,
        content_type: error.contentType,
        parsed_rows_count: 0,
        first_open_time: null,
        error_code: error.code,
        message: error.responseSummary ?? error.message,
      };
    }

    return {
      ok: false,
      symbol,
      status: null,
      content_type: null,
      parsed_rows_count: 0,
      first_open_time: null,
      error_code: "fetch_network_error",
      message: safeErrorMessage(error),
    };
  }
}
