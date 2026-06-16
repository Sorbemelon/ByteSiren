export interface SymbolEvidence {
  symbol: string;
  change_15m_pct: number;
  price_z: number;
  volume_x: number;
  range_x: number;
  score: number;
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
  detected_at: string;
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
    avg_15m_change_pct: number;
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
  last_price: number;
  change_15m_pct: number;
  change_24h_pct: number;
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

export const SYMBOLS = ["BTC", "ETH", "BNB", "SOL", "XRP"] as const;
export type Symbol = (typeof SYMBOLS)[number];

export const SYMBOL_FULL: Record<Symbol, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  BNB: "BNBUSDT",
  SOL: "SOLUSDT",
  XRP: "XRPUSDT",
};
