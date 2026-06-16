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

  const response = await fetcher(url.toString(), {
    headers: {
      "user-agent": BINANCE_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Binance klines request failed with HTTP ${response.status}.`,
    );
  }

  const rows = await response.json<unknown>();

  if (!Array.isArray(rows)) {
    throw new Error("Binance klines response was not an array.");
  }

  return rows.map((row) => parseBinanceKlineRow(row, symbol));
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
