export type ClaudeTargetTypeV02 = "signal_event_v02" | "daily_overview_v02";

export type ClaudePromptModeV02 = "signal_event" | "daily_overview";

export type SignalEventClassificationV02 =
  | "Focused Cause"
  | "Likely Cause"
  | "Market Backdrop"
  | "No Clear Cause";

export type ClaudeConfidenceV02 = "high" | "medium" | "low";

export type SourceSupportV02 = "high" | "medium" | "low" | "none";

export type SourceTimingAlignmentV02 =
  | "exact"
  | "same_day"
  | "broad"
  | "poor"
  | "none";

export type SignalEventSourceTagV02 =
  | "Focused catalyst source"
  | "Likely cause source"
  | "Backdrop source"
  | "Price check source";

export type DailyOverviewSourceTagV02 =
  | "Main daily context source"
  | "Supporting daily source"
  | "Backdrop source"
  | "Price check source";

export type SourceTagV02 = SignalEventSourceTagV02 | DailyOverviewSourceTagV02;

export interface ClaudePayloadBaseV02 {
  mode: ClaudePromptModeV02;
  target_type: ClaudeTargetTypeV02;
  target_id: string;
  date_utc: string;
  no_trading_advice: true;
}

export interface SignalEventClaudePayloadV02 extends ClaudePayloadBaseV02 {
  mode: "signal_event";
  target_type: "signal_event_v02";
  event_id: string;
  evidence_window: {
    start: string;
    end: string;
    duration_min: number;
    peak_time: string | null;
  };
  direction: string;
  signals_count: number;
  n_tracked: number;
  avg_change_label: "Avg Change";
  avg_change_pct: number | null;
  event_strength_score: number | null;
  impact_label: string | null;
  chart_context: {
    chart_context_score: number | null;
    chart_context_label: string | null;
    event_story_type: string | null;
    trend_context: string | null;
    momentum_context: string | null;
    volatility_context: string | null;
    event_range_context: string | null;
    chart_context_reasons: unknown[];
    chart_context_warnings: unknown[];
  };
  macro_context: {
    macro_aligned: boolean;
    nearest_macro_event: string | null;
    macro_delta_min: number | null;
  };
  per_symbol_evidence: Array<{
    symbol: string;
    window_change_label: "Window Change";
    window_change_pct: number | null;
    peak_15m_label: "Peak 15m";
    peak_15m_change_pct: number | null;
    volume_ratio: number | null;
    range_position_label: "Range Position";
    range_position: string | null;
    is_lead_mover: boolean;
    is_peak_15m_highlight: boolean;
  }>;
  source_route_hint: string | null;
  suggested_search_queries: string[];
}

export interface DailyOverviewClaudePayloadV02 extends ClaudePayloadBaseV02 {
  mode: "daily_overview";
  target_type: "daily_overview_v02";
  date_utc: string;
  day_start: string;
  day_end: string;
  market_tone: string | null;
  daily_change_label: "24h Change";
  daily_change_pct: number | null;
  market_range_pct: number | null;
  notable_symbols: unknown[];
  top_symbol_moves: unknown[];
  signal_event_ids_for_day: string[];
  market_story_ids_for_day: string[];
  audit_event_count_for_day: number;
  daily_chart_context_summary: Record<string, unknown>;
  market_stories_for_day: Array<{
    id: string;
    story_label: string;
    story_family: string | null;
    story_window: {
      start: string;
      end: string;
      duration_min: number;
    };
    swing_score: number | null;
    chart_context_score: number | null;
    decision_reasons: unknown[];
  }>;
  source_query_hints: string[];
}

export type ClaudePayloadV02 =
  | SignalEventClaudePayloadV02
  | DailyOverviewClaudePayloadV02;

export interface ClaudeOutputSourceV02 {
  title: string;
  publisher: string;
  url: string;
  published_at: string | null;
  tag: SourceTagV02;
  why_relevant: string;
  catalyst_time_utc?: string | null;
}

export interface SignalEventClaudeResultV02 {
  mode: "signal_event";
  item_id: string;
  target_id: string;
  classification: SignalEventClassificationV02;
  confidence: ClaudeConfidenceV02;
  headline: string;
  collapsed_summary: string;
  source_free_signal_insight?: string | null;
  context_details?: string | null;
  why_this_classification: string;
  source_support: SourceSupportV02;
  source_timing_alignment: SourceTimingAlignmentV02;
  sources: ClaudeOutputSourceV02[];
  rejected_or_ignored_source_notes: string[];
  validation_flags: Record<string, unknown>;
  detector_feedback: Record<string, unknown>;
}

export interface DailyOverviewClaudeResultV02 {
  mode: "daily_overview";
  item_id: string;
  target_id: string;
  date_utc: string;
  confidence: ClaudeConfidenceV02;
  headline: string;
  collapsed_summary: string;
  context_details?: string | null;
  market_tone_summary: string;
  notable_drivers: Array<{
    driver: string;
    source_support: SourceSupportV02;
    why_relevant: string;
  }>;
  sources: ClaudeOutputSourceV02[];
  validation_flags: Record<string, unknown>;
  detector_feedback: Record<string, unknown>;
}

export type ClaudeResultV02 =
  | SignalEventClaudeResultV02
  | DailyOverviewClaudeResultV02;

export const SIGNAL_EVENT_CLASSIFICATIONS_V02 = [
  "Focused Cause",
  "Likely Cause",
  "Market Backdrop",
  "No Clear Cause",
] as const;

export const SIGNAL_EVENT_SOURCE_TAGS_V02 = [
  "Focused catalyst source",
  "Likely cause source",
  "Backdrop source",
  "Price check source",
] as const;

export const DAILY_OVERVIEW_SOURCE_TAGS_V02 = [
  "Main daily context source",
  "Supporting daily source",
  "Backdrop source",
  "Price check source",
] as const;
