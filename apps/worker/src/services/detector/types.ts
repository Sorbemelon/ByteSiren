import type { MarketSymbol } from "../../config.ts";
import type { MarketCandle } from "../../types/market.ts";

export type SignalWindowLabel = "15m";
export type BaselineWindowLabel = "24h";
export type SymbolMoveDirection = "up" | "down" | "flat";
export type MarketDirection = "observed_up" | "observed_down" | "mixed";
export type CandidateDirection = "observed_up" | "observed_down" | "two_sided";
export type MarketTier = "normal" | "notable" | "elevated" | "severe";
export type RawEventScope = "market_wide";
export type FinalCandidateScope = "market_wide" | "market_day";

export type SuppressionReason =
  | "mixed_direction_same_candle"
  | "market_elevated_not_persisted"
  | "single_symbol_public_mvp_suppressed"
  | "insufficient_baseline";

export type PersistenceConfirmReason =
  | "breadth>=4"
  | "avg_severity>=80"
  | "breadth>=3+max_severity>=85"
  | "consecutive_bars>=2";

export interface DetectorScores {
  price_score: number;
  volume_score: number;
  range_score: number;
  severity_score: number;
}

export interface SymbolFeature {
  symbol: MarketSymbol;
  interval: "15m";
  open_time: string;
  close_time: string;
  close: number;
  signal_window: SignalWindowLabel;
  baseline_window: BaselineWindowLabel;
  baseline_ready: boolean;
  return_15m: number | null;
  return_15m_pct: number | null;
  true_range_pct: number | null;
  price_z: number | null;
  volume_ratio: number | null;
  volatility_ratio: number | null;
  scores: DetectorScores;
  direction: SymbolMoveDirection;
  is_elevated: boolean;
}

export interface SymbolEvidence {
  symbol: MarketSymbol;
  included_in_event: boolean;
  direction: SymbolMoveDirection;
  signal_window: SignalWindowLabel;
  baseline_window: BaselineWindowLabel;
  change_15m_pct: number | null;
  price_z: number | null;
  volume_ratio: number | null;
  volatility_ratio: number | null;
  severity_score: number;
}

export interface RawMarketEvent {
  id: string;
  scope: RawEventScope;
  detected_at: string;
  close_time: string;
  signal_window: SignalWindowLabel;
  baseline_window: BaselineWindowLabel;
  direction: Exclude<MarketDirection, "mixed">;
  symbols: MarketSymbol[];
  breadth_count: number;
  avg_15m_change_pct: number | null;
  headline_severity: number;
  max_elevated_severity: number;
  peak_symbol: MarketSymbol;
  tier: MarketTier;
  symbol_evidence: SymbolEvidence[];
  persistence: {
    waived: boolean;
    consecutive_bars: number;
    confirm_reason: PersistenceConfirmReason;
  };
  query_hints: QueryHints;
}

export interface SuppressedMarketEvent {
  id: string;
  detected_at: string;
  close_time: string;
  scope: RawEventScope;
  direction: MarketDirection;
  symbols: MarketSymbol[];
  breadth_count: number;
  headline_severity: number;
  max_elevated_severity: number;
  tier: MarketTier;
  suppression_reason: SuppressionReason;
  symbol_evidence: SymbolEvidence[];
}

export interface RawDetectionResult {
  raw_events: RawMarketEvent[];
  suppressed_events: SuppressedMarketEvent[];
}

export interface QueryHints {
  route: "market_wide_up" | "market_wide_down" | "two_sided_market_day";
  date_bound_query_required: true;
  second_search_allowed: boolean;
  no_trading_advice: true;
}

export interface RawSubEventSummary {
  id: string;
  detected_at: string;
  close_time: string;
  direction: Exclude<MarketDirection, "mixed">;
  symbols: MarketSymbol[];
  breadth_count: number;
  headline_severity: number;
  max_elevated_severity: number;
  peak_symbol: MarketSymbol;
  tier: MarketTier;
  symbol_evidence: SymbolEvidence[];
}

export interface IncidentCandidate {
  id: string;
  incident_key: string;
  scope: FinalCandidateScope;
  direction: CandidateDirection;
  detected_at: string;
  started_at: string;
  ended_at: string;
  signal_window: SignalWindowLabel;
  baseline_window: BaselineWindowLabel;
  symbols: MarketSymbol[];
  breadth_count: number;
  avg_15m_change_pct: number | null;
  headline_severity: number;
  max_elevated_severity: number;
  peak_symbol: MarketSymbol;
  tier: MarketTier;
  symbol_evidence: SymbolEvidence[];
  sub_events: RawSubEventSummary[];
  query_hints: QueryHints;
}

export interface DetectorInput {
  candlesBySymbol: Partial<Record<MarketSymbol, MarketCandle[]>>;
}

export interface DetectorOutput extends RawDetectionResult {
  candidates: IncidentCandidate[];
}
