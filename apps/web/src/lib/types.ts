export interface SymbolEvidence {
  symbol: string;
  // Nullable: a genuinely missing metric stays null so the UI shows "—",
  // distinct from a real measured 0.
  change_15m_pct: number | null;
  price_z: number | null;
  volume_x: number | null;
  range_x: number | null;
  score: number | null;
}

export interface FeedItemBrief {
  status:
    | "brief_ready"
    | "analysis_limited"
    | "queued_for_analysis"
    | "none_found"
    | "context_only";
  catalyst_status:
    | "cause_supported"
    | "cause_likely"
    | "context_only"
    | "none_found"
    | null;
  label: string;
  summary: string | null;
  confidence: "high" | "medium" | "low" | "unexplained" | null;
  price_context_check:
    | "matches_binance"
    | "minor_mismatch"
    | "conflict"
    | "unknown"
    | null;
}

export interface FeedItemSource {
  publisher: string;
  title: string;
  url: string;
  published_at: string;
  used_for: "focused_catalyst" | "likely_cause" | "backdrop" | "price_check";
}

export interface FeedItem {
  incident_id: string;
  incident_key: string;
  detected_at: string;
  started_at: string;
  ended_at: string | null;
  event_start_time: string;
  event_end_time: string;
  peak_time: string;
  first_detected_at: string;
  last_evaluated_at: string;
  display_date: string;
  scope: "market_wide" | "market_day";
  direction: "observed_up" | "observed_down" | "two_sided";
  symbols: string[];
  tags: string[];
  evidence: {
    signal_window: string;
    baseline_window: string;
    summary: string;
    breadth_label: string;
    severity_score: number;
    severity_label: string;
    avg_15m_change_pct: number | null;
    peak_symbol: string;
  };
  brief: FeedItemBrief;
  sources: FeedItemSource[];
  expanded_details: {
    symbol_evidence: SymbolEvidence[];
    claude_context: { summary?: string; caveats?: string[] };
    caveats: string[];
  };
}

export interface MarketLatest {
  symbol: string;
  // Nullable: missing values stay null so the UI shows the delayed state
  // instead of a fake $0.00 / +0.00%.
  last_price: number | null;
  change_15m_pct: number | null;
  change_24h_pct: number | null;
  data_status: "fresh" | "delayed" | "missing";
  updated_at: string;
}

export interface CandleBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ViewMetrics {
  updated_at: string;
  today_utc: string;
  total_views: number;
  today_views: number;
}

export const SYMBOLS = ["BTC", "ETH", "BNB", "SOL", "XRP"] as const;
export type Symbol = (typeof SYMBOLS)[number];

export const SYMBOL_FULL: Record<Symbol, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  BNB: "BNBUSDT",
  SOL: "SOLUSDT",
  XRP: "XRPUSDT",
};

// ─── Backend API wire types (normalized before reaching UI components) ────────

export interface ApiSymbolEvidence {
  symbol: string;
  included_in_event?: boolean;
  direction?: "up" | "down" | "flat";
  change_15m_pct: number | null;
  price_z: number | null;
  volume_ratio: number | null;
  volatility_ratio: number | null;
  severity_score: number;
}

export interface ApiCandle {
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quote_volume: number;
}

export interface ApiMarketSymbol {
  symbol: string;
  last_price: number | null;
  last_close_time: string | null;
  change_15m_pct: number | null;
  change_24h_pct: number | null;
  data_status: "fresh" | "delayed" | "missing";
}

export interface FeedApiResponse {
  ok: boolean;
  updated_at: string;
  range_days: number;
  signal_window: string;
  baseline_window: string;
  items: ApiFeedItem[];
}

export interface MarketLatestApiResponse {
  ok: boolean;
  updated_at: string | null;
  symbols: ApiMarketSymbol[];
}

export interface CandlesApiResponse {
  ok: boolean;
  symbol: string;
  interval: string;
  range_days: number;
  candles: ApiCandle[];
}

export interface ViewMetricsApiResponse extends ViewMetrics {
  ok: boolean;
}

export type ApiFeedItem = Omit<
  FeedItem,
  | "expanded_details"
  | "evidence"
  | "event_start_time"
  | "event_end_time"
  | "peak_time"
  | "first_detected_at"
  | "last_evaluated_at"
> & {
  symbol_evidence?: ApiSymbolEvidence[];
  event_start_time?: string;
  event_end_time?: string;
  peak_time?: string;
  first_detected_at?: string;
  last_evaluated_at?: string;
  evidence: Omit<FeedItem["evidence"], "avg_15m_change_pct"> & {
    avg_15m_change_pct?: number | null;
    evidence_summary?: string;
  };
  expanded_details?: {
    symbol_evidence?: ApiSymbolEvidence[];
    claude_context?: Record<string, unknown>;
    caveats?: string[];
  };
};
