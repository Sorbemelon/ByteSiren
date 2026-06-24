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

export interface FeedApiResponseV01 {
  ok: boolean;
  updated_at: string;
  range_days: number;
  signal_window: string;
  baseline_window: string;
  items: ApiFeedItem[];
}

export type FeedApiResponse = FeedApiResponseV01 | FeedApiResponseV02;

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

export type FeedChartHighlightTypeV02 =
  | "day_window"
  | "story_window"
  | "event_window";

export interface FeedSourceV02 {
  publisher: string | null;
  title: string | null;
  url: string;
  published_at: string | null;
  catalyst_time_utc?: string | null;
  tag: string;
  source_strength?: string | null;
  used_for?: string | null;
}

export interface ClaudeBriefPublicV02 {
  id: string;
  status: string;
  public_label?: string | null;
  classification?: string | null;
  confidence?: string | null;
  headline?: string | null;
  collapsed_summary?: string | null;
  context_details?: string | null;
  source_support?: string | null;
  source_timing_alignment?: string | null;
  validation_flags?: Record<string, unknown>;
  detector_feedback?: Record<string, unknown>;
  prompt_version?: string | null;
  updated_at?: string | null;
}

export interface DailyOverviewChartV02 {
  chart_highlight_type: "day_window";
  highlight_start: string;
  highlight_end: string;
  included_signal_event_ids?: string[];
  included_market_story_ids?: string[];
  hide_other_days_on_select?: boolean;
}

export interface MarketStoryChartV02 {
  chart_highlight_type: "story_window";
  highlight_start: string;
  highlight_end: string;
  included_signal_event_ids?: string[];
  included_audit_event_ids?: string[];
}

export interface SignalEventChartV02 {
  chart_highlight_type: "event_window";
  highlight_start: string;
  highlight_end: string;
  peak_marker_time?: string | null;
  feed_card_id?: string;
}

export type ChartHighlightV02 =
  | DailyOverviewChartV02
  | MarketStoryChartV02
  | SignalEventChartV02;

export interface DailyOverviewItemV02 {
  item_type: "daily_overview";
  id: string;
  date_utc: string;
  display_time?: string;
  daily_label?: string;
  daily_change_label: "24h Change";
  daily_change_pct: number | null;
  market_tone?: string | null;
  market_range_pct?: number | null;
  notable_symbols?: unknown[];
  top_symbol_moves?: unknown[];
  public_context_status?: string;
  sources?: FeedSourceV02[];
  chart?: DailyOverviewChartV02;
  expanded?: Record<string, unknown>;
  brief?: ClaudeBriefPublicV02;
}

export interface MarketStoryItemV02 {
  item_type: "market_story";
  id: string;
  date_utc: string;
  display_time?: string;
  story_window_label: "Story window";
  avg_change_label?: "Avg Change";
  avg_change_pct?: number | null;
  swing_score_label?: "Volatility Score";
  swing_score?: number | null;
  story_label: string;
  story_family?: string | null;
  direction?: string | null;
  chart_context_score?: number | null;
  per_symbol_evidence?: MarketStorySymbolEvidenceV02[];
  range_context?: Record<string, unknown>;
  trend_context?: Record<string, unknown>;
  momentum_context?: Record<string, unknown>;
  volatility_context?: Record<string, unknown>;
  decision_reasons?: unknown[];
  publish_reason?: string | null;
  chart?: MarketStoryChartV02;
  deterministic_context?: Record<string, unknown>;
}

export interface MarketStorySymbolEvidenceV02 {
  symbol: string;
  avg_change_label?: "Avg Change";
  avg_change_pct?: number | null;
  range_pct?: number | null;
  swing_score_label?: "Volatility Score";
  swing_score?: number | null;
  volume_ratio?: number | null;
  movement_status_label?: "Movement Status";
  movement_status?: string | null;
  bar_count?: number | null;
}

export interface SignalEventSymbolEvidenceV02 {
  symbol: string;
  window_change_label: "Window Change";
  window_change_pct: number | null;
  peak_15m_label: "Peak 15m";
  peak_15m_change_pct: number | null;
  range_pct?: number | null;
  volume_ratio?: number | null;
  range_position_label: "Range Position";
  range_position?: string | null;
  range_position_display?: string | null;
  is_lead_mover?: boolean;
  is_peak_15m_highlight?: boolean;
  participated?: boolean;
  evidence?: Record<string, unknown>;
  prev_24h_high?: number | null;
  prev_24h_low?: number | null;
  range_break_direction?: string | null;
  range_break_pct?: number | null;
  range_break_strength?: number | null;
  distance_to_range_high_pct?: number | null;
  distance_to_range_low_pct?: number | null;
}

export interface SignalEventHighlightCellV02 {
  symbol: string;
  column: "symbol" | "peak_15m";
  reason: "lead_mover" | "strongest_peak_15m";
}

export interface SignalEventItemV02 {
  item_type: "signal_event";
  id: string;
  date_utc: string;
  display_time?: string;
  display_window?: string;
  direction: string;
  signals_count: number;
  n_tracked: number;
  avg_change_label: "Avg Change";
  avg_change_pct: number | null;
  impact_label?: string | null;
  event_strength_score?: number | null;
  chart_context_score?: number | null;
  chart_context_label?: string | null;
  event_story_type?: string | null;
  direction_changed?: boolean;
  direction_history?: unknown[];
  trend_context?: string | null;
  momentum_context?: string | null;
  volatility_context?: string | null;
  event_range_context?: string | null;
  public_context_status?: string;
  sources?: FeedSourceV02[];
  evidence_window: {
    start: string;
    end: string;
    duration_min: number;
    peak_time?: string | null;
  };
  per_symbol_evidence?: SignalEventSymbolEvidenceV02[];
  lead_mover_symbol?: string | null;
  strongest_peak_symbol?: string | null;
  highlight_cells?: SignalEventHighlightCellV02[];
  chart?: SignalEventChartV02;
  expanded?: Record<string, unknown>;
  brief?: ClaudeBriefPublicV02;
}

export type FeedItemV02 =
  | DailyOverviewItemV02
  | MarketStoryItemV02
  | SignalEventItemV02;

export interface FeedDayGroupV02 {
  day_post_id: string;
  date_utc: string;
  display_date: string;
  is_current_utc_day: boolean;
  item_count: number;
  hidden_item_count_when_collapsed: number;
  default_collapsed_item_id: string | null;
  has_extra_items: boolean;
  expanded_control_label?: string | null;
  collapsed_control_label?: string | null;
  items: FeedItemV02[];
}

export interface FeedApiResponseV02 {
  ok: true;
  version: "v02";
  updated_at: string;
  range_days: number;
  grouping: "utc_day";
  days_expanded_default: boolean;
  global_control_label_when_expanded: "Collapse days";
  global_control_label_when_collapsed: "Expand days";
  day_groups: FeedDayGroupV02[];
}

export interface NormalizedDailyOverviewSection {
  itemType: "daily_overview";
  id: string;
  dateUtc: string;
  displayTime: string;
  dailyLabel: string | null;
  dailyChangeLabel: "24h Change";
  dailyChangePct: number | null;
  marketTone: string | null;
  marketRangePct: number | null;
  notableSymbols: unknown[];
  topSymbolMoves: unknown[];
  publicContextStatus: string | null;
  sources: FeedSourceV02[];
  chart: DailyOverviewChartV02 | null;
  brief: ClaudeBriefPublicV02 | null;
  details: Record<string, unknown>;
}

export interface NormalizedMarketStorySection {
  itemType: "market_story";
  id: string;
  originalId: string;
  isContinuation: boolean;
  dateUtc: string;
  displayTime: string;
  storyWindowLabel: "Story window";
  avgChangeLabel: "Avg Change";
  avgChangePct: number | null;
  swingScoreLabel: "Volatility Score";
  swingScore: number | null;
  storyLabel: string;
  storyFamily: string | null;
  direction: string | null;
  chartContextScore: number | null;
  perSymbolEvidence: MarketStorySymbolEvidenceV02[];
  rangeContext: Record<string, unknown>;
  trendContext: Record<string, unknown>;
  momentumContext: Record<string, unknown>;
  volatilityContext: Record<string, unknown>;
  decisionReasons: unknown[];
  publishReason: string | null;
  chart: MarketStoryChartV02 | null;
  deterministicContext: Record<string, unknown>;
}

export interface NormalizedSignalEventSection {
  itemType: "signal_event";
  id: string;
  dateUtc: string;
  displayTime: string;
  displayWindow: string;
  direction: string;
  signalsCount: number;
  nTracked: number;
  avgChangeLabel: "Avg Change";
  avgChangePct: number | null;
  impactLabel: string | null;
  eventStrengthScore: number | null;
  chartContextScore: number | null;
  chartContextLabel: string | null;
  eventStoryType: string | null;
  directionChanged: boolean;
  directionHistory: unknown[];
  trendContext: string | null;
  momentumContext: string | null;
  volatilityContext: string | null;
  eventRangeContext: string | null;
  publicContextStatus: string | null;
  sources: FeedSourceV02[];
  evidenceWindow: SignalEventItemV02["evidence_window"];
  perSymbolEvidence: SignalEventSymbolEvidenceV02[];
  leadMoverSymbol: string | null;
  strongestPeakSymbol: string | null;
  highlightCells: SignalEventHighlightCellV02[];
  chart: SignalEventChartV02 | null;
  brief: ClaudeBriefPublicV02 | null;
  details: Record<string, unknown>;
}

export type NormalizedFeedSection =
  | NormalizedDailyOverviewSection
  | NormalizedMarketStorySection
  | NormalizedSignalEventSection;

export type FeedSelectionItemTypeV02 = NormalizedFeedSection["itemType"];

export interface FeedSelectionV02 {
  itemType: FeedSelectionItemTypeV02 | null;
  itemId: string | null;
  dayPostId: string | null;
}

export interface ChartHighlightViewV02 {
  id: string;
  itemType: FeedSelectionItemTypeV02;
  itemId: string;
  dayPostId: string;
  type: FeedChartHighlightTypeV02;
  start: string;
  end: string;
  peakMarkerTime?: string | null;
  label: string;
  direction?: string | null;
  selected: boolean;
  dimmed: boolean;
}

export type SourceRoleToneV02 =
  | "catalyst"
  | "likely"
  | "main"
  | "support"
  | "backdrop"
  | "price"
  | "source";

export interface ChartSourceMarkerViewV02 {
  id: string;
  itemType: "daily_overview" | "signal_event";
  itemId: string;
  dayPostId: string;
  time: string;
  label: string;
  tone: SourceRoleToneV02;
  publisher: string | null;
  url: string;
  selected: boolean;
  // Source markers are filled. Signals anchor to the Signal start; Daily
  // Overview markers anchor to the Daily range end.
  filled: boolean;
}

export interface NormalizedDayPost {
  id: string;
  dateUtc: string;
  displayDate: string;
  isCurrentUtcDay: boolean;
  itemCount: number;
  hiddenItemCountWhenCollapsed: number;
  defaultCollapsedItemId: string | null;
  hasExtraItems: boolean;
  expandedControlLabel: string | null;
  collapsedControlLabel: string | null;
  sections: NormalizedFeedSection[];
}

export interface NormalizedFeedV02 {
  version: "v02";
  ok: true;
  updatedAt: string | null;
  rangeDays: number;
  grouping: "utc_day";
  daysExpandedDefault: boolean;
  globalControlLabelWhenExpanded: "Collapse days";
  globalControlLabelWhenCollapsed: "Expand days";
  dayPosts: NormalizedDayPost[];
}

export type NormalizedFeedEnvelope =
  | {
      version: "v01";
      items: FeedItem[];
      updatedAt: string | null;
      v02: null;
    }
  | {
      version: "v02";
      items: FeedItem[];
      updatedAt: string | null;
      v02: NormalizedFeedV02;
    };
