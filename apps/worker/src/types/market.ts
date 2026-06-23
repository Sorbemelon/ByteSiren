import type { MARKET_INTERVAL, MarketSymbol } from "../config.ts";

export type MarketInterval = typeof MARKET_INTERVAL;
export type DataStatus = "fresh" | "delayed" | "missing";
export type JobRunStatus =
  | "started"
  | "success"
  | "partial_success"
  | "failed"
  | "skipped";

export interface MarketCandle {
  symbol: MarketSymbol;
  interval: MarketInterval;
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

export interface CandleHistoryBounds {
  symbol: MarketSymbol;
  count: number;
  earliest_open_time: string | null;
  latest_open_time: string | null;
  latest_close_time: string | null;
}

export interface MarketSummaryItem {
  symbol: MarketSymbol;
  last_price: number | null;
  last_close_time: string | null;
  change_15m_pct: number | null;
  change_24h_pct: number | null;
  data_status: DataStatus;
}

export interface BinanceKlineRow extends Array<string | number> {
  0: number;
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
  6: number;
  7: string;
  8: number;
}

export interface SymbolPollResult {
  symbol: MarketSymbol;
  mode: "backfill" | "recent";
  fetched: number;
  upserted: number;
  ok: boolean;
  error?: string;
  error_stage?: "fetch" | "parse" | "d1_upsert";
  error_code?: string;
  http_status?: number | null;
  response_summary?: string | null;
}
