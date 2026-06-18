import {
  ALLOWED_SYMBOLS,
  BINANCE_KLINES_LIMIT,
  INTERNAL_RETENTION_DAYS,
  RECENT_KLINES_LIMIT,
  type MarketSymbol,
  isoDaysAgo,
} from "../config.ts";
import {
  getCandleHistoryBounds,
  recordJobRun,
  upsertMarketCandles,
} from "../db/marketRepository.ts";
import {
  BinanceKlinesError,
  fetchKlines,
  fetchPaginatedKlines,
} from "../services/binance.ts";
import type { MarketCandle, SymbolPollResult } from "../types/market.ts";
import { safeErrorMessage } from "../utils/http.ts";

const MIN_BACKFILL_CANDLE_COUNT = 2500;
const MIN_LIMIT = 1;

export interface PollMarketOptions {
  now?: Date;
  fetcher?: typeof fetch;
  mode?: "recent" | "backfill";
  symbol?: MarketSymbol;
  limit?: number;
}

export interface PollMarketResult {
  status: "success" | "partial_success" | "failed";
  message: string;
  symbols: SymbolPollResult[];
}

export async function pollMarket(
  db: D1Database,
  {
    now = new Date(),
    fetcher = fetch,
    mode,
    symbol,
    limit,
  }: PollMarketOptions = {},
): Promise<PollMarketResult> {
  const startedAt = new Date();
  const results: SymbolPollResult[] = [];
  const symbols = symbol ? [symbol] : ALLOWED_SYMBOLS;
  const requestedLimit = normalizeLimit(limit);

  for (const currentSymbol of symbols) {
    const bounds = await getCandleHistoryBounds(db, currentSymbol);
    const shouldBackfill =
      mode === "backfill" ||
      (mode !== "recent" && bounds.count < MIN_BACKFILL_CANDLE_COUNT);
    const symbolMode = shouldBackfill ? "backfill" : "recent";

    let candles: MarketCandle[] = [];
    try {
      candles = shouldBackfill
        ? await fetchPaginatedKlines({
            symbol: currentSymbol,
            startTimeMs: Date.parse(isoDaysAgo(INTERNAL_RETENTION_DAYS, now)),
            endTimeMs: now.getTime(),
            limit: requestedLimit ?? BINANCE_KLINES_LIMIT,
            fetcher,
          })
        : await fetchKlines({
            symbol: currentSymbol,
            limit: requestedLimit ?? RECENT_KLINES_LIMIT,
            fetcher,
          });
    } catch (error) {
      results.push(
        failedSymbolResult(currentSymbol, symbolMode, "fetch", error),
      );
      continue;
    }

    try {
      const upserted = await upsertMarketCandles(db, candles);
      results.push({
        symbol: currentSymbol,
        mode: symbolMode,
        fetched: candles.length,
        upserted,
        ok: true,
      });
    } catch (error) {
      results.push({
        symbol: currentSymbol,
        mode: symbolMode,
        fetched: candles.length,
        upserted: 0,
        ok: false,
        error: safeErrorMessage(error),
        error_stage: "d1_upsert",
        error_code: "d1_upsert_error",
      });
    }
  }

  const successCount = results.filter((result) => result.ok).length;
  const status =
    successCount === results.length
      ? "success"
      : successCount === 0
        ? "failed"
        : "partial_success";
  const message = buildPollMessage(successCount, results);

  await recordJobRun(
    db,
    "poll_market",
    status,
    message,
    {
      symbols: results,
    },
    startedAt,
    new Date(),
  );

  return {
    status,
    message,
    symbols: results,
  };
}

function normalizeLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) {
    return undefined;
  }

  if (!Number.isFinite(limit)) {
    return undefined;
  }

  return Math.min(BINANCE_KLINES_LIMIT, Math.max(MIN_LIMIT, Math.trunc(limit)));
}

function failedSymbolResult(
  symbol: MarketSymbol,
  mode: "backfill" | "recent",
  fallbackStage: "fetch" | "parse" | "d1_upsert",
  error: unknown,
): SymbolPollResult {
  if (error instanceof BinanceKlinesError) {
    return {
      symbol,
      mode,
      fetched: 0,
      upserted: 0,
      ok: false,
      error: error.message,
      error_stage: error.stage,
      error_code: error.code,
      http_status: error.httpStatus,
      response_summary: error.responseSummary,
    };
  }

  return {
    symbol,
    mode,
    fetched: 0,
    upserted: 0,
    ok: false,
    error: safeErrorMessage(error),
    error_stage: fallbackStage,
    error_code:
      fallbackStage === "parse" ? "parse_error" : `${fallbackStage}_error`,
  };
}

function buildPollMessage(
  successCount: number,
  results: SymbolPollResult[],
): string {
  const base = `Market poll completed: ${successCount}/${results.length} symbols updated. Attempted: ${results.length}.`;
  const failures = results
    .filter((result) => !result.ok)
    .map(
      (result) => `${result.symbol} ${result.error_code ?? "unknown_error"}`,
    );

  if (failures.length === 0) {
    return base;
  }

  return `${base} Failures: ${failures.join("; ")}.`;
}
