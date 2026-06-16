import {
  ALLOWED_SYMBOLS,
  BINANCE_KLINES_LIMIT,
  INTERNAL_RETENTION_DAYS,
  RECENT_KLINES_LIMIT,
  isoDaysAgo,
} from "../config.ts";
import {
  getCandleHistoryBounds,
  recordJobRun,
  upsertMarketCandles,
} from "../db/marketRepository.ts";
import { fetchKlines, fetchPaginatedKlines } from "../services/binance.ts";
import type { SymbolPollResult } from "../types/market.ts";
import { safeErrorMessage } from "../utils/http.ts";

const MIN_BACKFILL_CANDLE_COUNT = 2500;

export interface PollMarketOptions {
  now?: Date;
  fetcher?: typeof fetch;
}

export interface PollMarketResult {
  status: "success" | "partial_success" | "failed";
  message: string;
  symbols: SymbolPollResult[];
}

export async function pollMarket(
  db: D1Database,
  { now = new Date(), fetcher = fetch }: PollMarketOptions = {},
): Promise<PollMarketResult> {
  const startedAt = new Date();
  const results: SymbolPollResult[] = [];

  for (const symbol of ALLOWED_SYMBOLS) {
    const bounds = await getCandleHistoryBounds(db, symbol);
    const shouldBackfill = bounds.count < MIN_BACKFILL_CANDLE_COUNT;
    const mode = shouldBackfill ? "backfill" : "recent";

    try {
      const candles = shouldBackfill
        ? await fetchPaginatedKlines({
            symbol,
            startTimeMs: Date.parse(isoDaysAgo(INTERNAL_RETENTION_DAYS, now)),
            endTimeMs: now.getTime(),
            limit: BINANCE_KLINES_LIMIT,
            fetcher,
          })
        : await fetchKlines({
            symbol,
            limit: RECENT_KLINES_LIMIT,
            fetcher,
          });

      const upserted = await upsertMarketCandles(db, candles);

      results.push({
        symbol,
        mode,
        fetched: candles.length,
        upserted,
        ok: true,
      });
    } catch (error) {
      results.push({
        symbol,
        mode,
        fetched: 0,
        upserted: 0,
        ok: false,
        error: safeErrorMessage(error),
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
  const message = `Market poll completed: ${successCount}/${results.length} symbols updated.`;

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
