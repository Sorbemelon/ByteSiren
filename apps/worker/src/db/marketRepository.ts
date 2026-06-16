import {
  ALLOWED_SYMBOLS,
  BASELINE_BARS_24H,
  FIFTEEN_MINUTES_MS,
  INTERNAL_RETENTION_DAYS,
  MARKET_INTERVAL,
  VISIBLE_RANGE_DAYS,
  isoDaysAgo,
  type MarketSymbol,
} from "../config.ts";
import type {
  CandleHistoryBounds,
  JobRunStatus,
  MarketCandle,
  MarketSummaryItem,
} from "../types/market.ts";

interface MarketCandleRow {
  symbol: MarketSymbol;
  interval: typeof MARKET_INTERVAL;
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quote_volume: number;
  trade_count: number | null;
}

interface BoundsRow {
  count: number;
  earliest_open_time: string | null;
  latest_open_time: string | null;
  latest_close_time: string | null;
}

interface LatestCloseRow {
  latest_close_time: string | null;
}

export function percentChange(
  current: number,
  previous: number | null | undefined,
): number | null {
  if (
    !previous ||
    previous === 0 ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  ) {
    return null;
  }

  return Number((((current - previous) / previous) * 100).toFixed(4));
}

export function marketDataStatus(
  lastCloseTime: string | null,
  now = new Date(),
): "fresh" | "delayed" | "missing" {
  if (!lastCloseTime) {
    return "missing";
  }

  const closeMs = Date.parse(lastCloseTime);

  if (!Number.isFinite(closeMs)) {
    return "missing";
  }

  const maxFreshAgeMs = FIFTEEN_MINUTES_MS * 3;
  return now.getTime() - closeMs <= maxFreshAgeMs ? "fresh" : "delayed";
}

export function retentionCutoffIso(now = new Date()): string {
  return isoDaysAgo(INTERNAL_RETENTION_DAYS, now);
}

function toMarketCandle(row: MarketCandleRow): MarketCandle {
  return {
    symbol: row.symbol,
    interval: row.interval,
    open_time: row.open_time,
    close_time: row.close_time,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    quote_volume: row.quote_volume,
    trade_count: row.trade_count,
  };
}

function changedRows(result: D1Result<unknown>): number {
  return typeof result.meta.changes === "number" ? result.meta.changes : 0;
}

export async function upsertMarketCandles(
  db: D1Database,
  candles: MarketCandle[],
): Promise<number> {
  if (candles.length === 0) {
    return 0;
  }

  const statements = candles.map((candle) =>
    db
      .prepare(
        `INSERT INTO market_candles (
          symbol,
          interval,
          open_time,
          close_time,
          open,
          high,
          low,
          close,
          volume,
          quote_volume,
          trade_count,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(symbol, interval, open_time)
        DO UPDATE SET
          close_time = excluded.close_time,
          open = excluded.open,
          high = excluded.high,
          low = excluded.low,
          close = excluded.close,
          volume = excluded.volume,
          quote_volume = excluded.quote_volume,
          trade_count = excluded.trade_count,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        candle.symbol,
        candle.interval,
        candle.open_time,
        candle.close_time,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
        candle.quote_volume,
        candle.trade_count,
      ),
  );

  const batchSize = 100;
  let affected = 0;

  for (let index = 0; index < statements.length; index += batchSize) {
    const batch = statements.slice(index, index + batchSize);
    const results = await db.batch(batch);
    affected += results.reduce((sum, result) => sum + changedRows(result), 0);
  }

  return affected;
}

export async function getLatestCandlesBySymbol(
  db: D1Database,
  symbol: MarketSymbol,
  limit = 200,
): Promise<MarketCandle[]> {
  const result = await db
    .prepare(
      `SELECT symbol, interval, open_time, close_time, open, high, low, close, volume, quote_volume, trade_count
       FROM market_candles
       WHERE symbol = ? AND interval = ?
       ORDER BY open_time DESC
       LIMIT ?`,
    )
    .bind(symbol, MARKET_INTERVAL, limit)
    .all<MarketCandleRow>();

  return result.results.map(toMarketCandle).reverse();
}

export async function getCandlesForSymbol(
  db: D1Database,
  symbol: MarketSymbol,
  now = new Date(),
): Promise<MarketCandle[]> {
  const cutoff = isoDaysAgo(VISIBLE_RANGE_DAYS, now);
  return getCandlesForSymbolSince(db, symbol, cutoff);
}

export async function getCandlesForSymbolSince(
  db: D1Database,
  symbol: MarketSymbol,
  cutoffIso: string,
): Promise<MarketCandle[]> {
  const result = await db
    .prepare(
      `SELECT symbol, interval, open_time, close_time, open, high, low, close, volume, quote_volume, trade_count
       FROM market_candles
       WHERE symbol = ? AND interval = ? AND open_time >= ?
       ORDER BY open_time ASC`,
    )
    .bind(symbol, MARKET_INTERVAL, cutoffIso)
    .all<MarketCandleRow>();

  return result.results.map(toMarketCandle);
}

export async function getCandleHistoryBounds(
  db: D1Database,
  symbol: MarketSymbol,
): Promise<CandleHistoryBounds> {
  const row = await db
    .prepare(
      `SELECT
        COUNT(*) AS count,
        MIN(open_time) AS earliest_open_time,
        MAX(open_time) AS latest_open_time,
        MAX(close_time) AS latest_close_time
       FROM market_candles
       WHERE symbol = ? AND interval = ?`,
    )
    .bind(symbol, MARKET_INTERVAL)
    .first<BoundsRow>();

  return {
    symbol,
    count: row?.count ?? 0,
    earliest_open_time: row?.earliest_open_time ?? null,
    latest_open_time: row?.latest_open_time ?? null,
    latest_close_time: row?.latest_close_time ?? null,
  };
}

export async function getLatestMarketSummary(
  db: D1Database,
  now = new Date(),
): Promise<{ updated_at: string | null; symbols: MarketSummaryItem[] }> {
  const symbols: MarketSummaryItem[] = [];
  let updatedAt: string | null = null;

  for (const symbol of ALLOWED_SYMBOLS) {
    const candles = await getLatestCandlesBySymbol(
      db,
      symbol,
      BASELINE_BARS_24H + 1,
    );
    const latest = candles.at(-1);

    if (!latest) {
      symbols.push({
        symbol,
        last_price: null,
        last_close_time: null,
        change_15m_pct: null,
        change_24h_pct: null,
        data_status: "missing",
      });
      continue;
    }

    const previous = candles.at(-2);
    const dayBaseline =
      candles.length >= BASELINE_BARS_24H + 1 ? candles.at(0) : null;
    updatedAt =
      !updatedAt || Date.parse(latest.close_time) > Date.parse(updatedAt)
        ? latest.close_time
        : updatedAt;

    symbols.push({
      symbol,
      last_price: latest.close,
      last_close_time: latest.close_time,
      change_15m_pct: percentChange(latest.close, previous?.close),
      change_24h_pct: percentChange(latest.close, dayBaseline?.close),
      data_status: marketDataStatus(latest.close_time, now),
    });
  }

  return {
    updated_at: updatedAt,
    symbols,
  };
}

export async function getLatestMarketCloseTime(
  db: D1Database,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT MAX(close_time) AS latest_close_time FROM market_candles")
    .first<LatestCloseRow>();

  return row?.latest_close_time ?? null;
}

export async function cleanupOldData(
  db: D1Database,
  cutoffIso = retentionCutoffIso(),
): Promise<{ market_candles: number; market_features: number }> {
  const candleResult = await db
    .prepare("DELETE FROM market_candles WHERE open_time < ?")
    .bind(cutoffIso)
    .run();

  const featureResult = await db
    .prepare("DELETE FROM market_features WHERE open_time < ?")
    .bind(cutoffIso)
    .run();

  return {
    market_candles: changedRows(candleResult),
    market_features: changedRows(featureResult),
  };
}

export async function recordJobRun(
  db: D1Database,
  jobName: string,
  status: JobRunStatus,
  message: string,
  metadata: Record<string, unknown> = {},
  startedAt = new Date(),
  finishedAt = new Date(),
): Promise<void> {
  const id = `${jobName}_${startedAt.toISOString()}_${crypto.randomUUID()}`;

  await db
    .prepare(
      `INSERT INTO job_runs (
        id,
        job_name,
        status,
        started_at,
        finished_at,
        message,
        metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      jobName,
      status,
      startedAt.toISOString(),
      finishedAt.toISOString(),
      message,
      JSON.stringify(metadata),
    )
    .run();
}
