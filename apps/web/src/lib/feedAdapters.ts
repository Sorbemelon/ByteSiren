import type {
  ApiFeedItem,
  ApiSymbolEvidence,
  FeedApiResponse,
  FeedApiResponseV01,
  FeedApiResponseV02,
  FeedItem,
  FeedItemV02,
  FeedSourceV02,
  NormalizedDailyOverviewSection,
  NormalizedFeedEnvelope,
  NormalizedFeedSection,
  NormalizedFeedV02,
  NormalizedMarketStorySection,
  NormalizedSignalEventSection,
  SignalEventHighlightCellV02,
  SignalEventSymbolEvidenceV02,
  SymbolEvidence,
} from "./types";

export function isFeedResponseV02(
  response: unknown,
): response is FeedApiResponseV02 {
  return (
    typeof response === "object" &&
    response !== null &&
    "version" in response &&
    (response as { version?: unknown }).version === "v02" &&
    Array.isArray((response as { day_groups?: unknown }).day_groups)
  );
}

function roundScore(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : 0;
}

function normalizeSymbolEvidence(raw: ApiSymbolEvidence): SymbolEvidence {
  return {
    symbol: raw.symbol,
    change_15m_pct: raw.change_15m_pct,
    price_z: raw.price_z,
    volume_x: raw.volume_ratio,
    range_x: raw.volatility_ratio,
    score: roundScore(raw.severity_score),
  };
}

export function normalizeFeedItem(raw: ApiFeedItem): FeedItem {
  const rawEvidence: ApiSymbolEvidence[] =
    raw.symbol_evidence ?? raw.expanded_details?.symbol_evidence ?? [];
  const symbolEvidence: SymbolEvidence[] = rawEvidence.map(
    normalizeSymbolEvidence,
  );
  const eventStartTime =
    raw.event_start_time ?? raw.started_at ?? raw.detected_at;
  const eventEndTime =
    raw.event_end_time ?? raw.ended_at ?? raw.started_at ?? raw.detected_at;
  const peakTime = raw.peak_time ?? raw.detected_at ?? eventStartTime;

  return {
    incident_id: raw.incident_id,
    incident_key: raw.incident_key,
    detected_at: raw.detected_at,
    started_at: raw.started_at ?? eventStartTime,
    ended_at: raw.ended_at ?? null,
    event_start_time: eventStartTime,
    event_end_time: eventEndTime,
    peak_time: peakTime,
    first_detected_at: raw.first_detected_at ?? raw.detected_at,
    last_evaluated_at: raw.last_evaluated_at ?? raw.detected_at,
    display_date: raw.display_date,
    scope: raw.scope,
    direction: raw.direction,
    symbols: raw.symbols ?? [],
    tags: raw.tags ?? [],
    evidence: {
      signal_window: raw.evidence.signal_window,
      baseline_window: raw.evidence.baseline_window,
      summary: raw.evidence.summary ?? raw.evidence.evidence_summary ?? "",
      breadth_label: raw.evidence.breadth_label,
      severity_score: roundScore(raw.evidence.severity_score),
      severity_label: raw.evidence.severity_label,
      avg_15m_change_pct: raw.evidence.avg_15m_change_pct ?? null,
      peak_symbol: raw.evidence.peak_symbol ?? "",
    },
    brief: {
      status: raw.brief.status,
      catalyst_status: raw.brief.catalyst_status,
      label: raw.brief.label,
      summary: raw.brief.summary ?? null,
      confidence: raw.brief.confidence,
      price_context_check: raw.brief.price_context_check,
    },
    sources: raw.sources ?? [],
    expanded_details: {
      symbol_evidence: symbolEvidence,
      claude_context:
        (raw.expanded_details?.claude_context as {
          summary?: string;
          caveats?: string[];
        }) ?? {},
      caveats: raw.expanded_details?.caveats ?? [],
    },
  };
}

function normalizeFeedV01(
  response: FeedApiResponseV01,
): NormalizedFeedEnvelope {
  return {
    version: "v01",
    items: (response.items ?? []).map(normalizeFeedItem),
    updatedAt: response.updated_at ?? null,
    v02: null,
  };
}

function arrayOrEmpty<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function recordOrEmpty(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function nullableString(value: string | null | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeSources(
  sources: FeedSourceV02[] | null | undefined,
): FeedSourceV02[] {
  return arrayOrEmpty(sources)
    .filter((source) => typeof source.url === "string" && source.url !== "")
    .map((source) => ({
      publisher: source.publisher ?? null,
      title: source.title ?? null,
      url: source.url,
      published_at: source.published_at ?? null,
      tag: source.tag,
      source_strength: source.source_strength ?? null,
      used_for: source.used_for ?? null,
    }));
}

function normalizeDailyOverviewSection(
  item: Extract<FeedItemV02, { item_type: "daily_overview" }>,
): NormalizedDailyOverviewSection {
  return {
    itemType: "daily_overview",
    id: item.id,
    dateUtc: item.date_utc,
    displayTime: item.display_time ?? "Full UTC day",
    dailyLabel: item.daily_label ?? null,
    dailyChangeLabel: "24h Change",
    dailyChangePct: nullableNumber(item.daily_change_pct),
    marketTone: nullableString(item.market_tone),
    marketRangePct: nullableNumber(item.market_range_pct),
    notableSymbols: arrayOrEmpty(item.notable_symbols),
    topSymbolMoves: arrayOrEmpty(item.top_symbol_moves),
    publicContextStatus: item.public_context_status ?? null,
    sources: normalizeSources(item.sources),
    chart: item.chart ?? null,
    brief: item.brief ?? null,
    details: recordOrEmpty(item.expanded),
  };
}

function normalizeMarketStorySection(
  item: Extract<FeedItemV02, { item_type: "market_story" }>,
): NormalizedMarketStorySection {
  return {
    itemType: "market_story",
    id: item.id,
    dateUtc: item.date_utc,
    displayTime: item.display_time ?? "",
    storyWindowLabel: "Story window",
    swingChangeLabel: "Swing Change",
    storyLabel: item.story_label,
    storyFamily: nullableString(item.story_family),
    direction: nullableString(item.direction),
    swingChangePct: nullableNumber(item.swing_change_pct),
    chartContextScore: nullableNumber(item.chart_context_score),
    rangeContext: recordOrEmpty(item.range_context),
    trendContext: recordOrEmpty(item.trend_context),
    momentumContext: recordOrEmpty(item.momentum_context),
    volatilityContext: recordOrEmpty(item.volatility_context),
    decisionReasons: arrayOrEmpty(item.decision_reasons),
    publishReason: nullableString(item.publish_reason),
    chart: item.chart ?? null,
    deterministicContext: recordOrEmpty(item.deterministic_context),
  };
}

function normalizeSymbolEvidenceV02(
  row: SignalEventSymbolEvidenceV02,
): SignalEventSymbolEvidenceV02 {
  return {
    symbol: row.symbol,
    window_change_label: "Window Change",
    window_change_pct: nullableNumber(row.window_change_pct),
    peak_15m_label: "Peak 15m",
    peak_15m_change_pct: nullableNumber(row.peak_15m_change_pct),
    volume_ratio: nullableNumber(row.volume_ratio),
    range_position_label: "Range Position",
    range_position: nullableString(row.range_position),
    range_position_display: nullableString(row.range_position_display),
    is_lead_mover: row.is_lead_mover === true,
    is_peak_15m_highlight: row.is_peak_15m_highlight === true,
    participated: row.participated === true,
    evidence: recordOrEmpty(row.evidence),
    prev_24h_high: nullableNumber(row.prev_24h_high),
    prev_24h_low: nullableNumber(row.prev_24h_low),
    range_break_direction: nullableString(row.range_break_direction),
    range_break_pct: nullableNumber(row.range_break_pct),
    range_break_strength: nullableNumber(row.range_break_strength),
    distance_to_range_high_pct: nullableNumber(row.distance_to_range_high_pct),
    distance_to_range_low_pct: nullableNumber(row.distance_to_range_low_pct),
  };
}

function normalizeHighlightCells(
  cells: SignalEventHighlightCellV02[] | null | undefined,
): SignalEventHighlightCellV02[] {
  return arrayOrEmpty(cells).map((cell) => ({
    symbol: cell.symbol,
    column: cell.column,
    reason: cell.reason,
  }));
}

function normalizeSignalEventSection(
  item: Extract<FeedItemV02, { item_type: "signal_event" }>,
): NormalizedSignalEventSection {
  return {
    itemType: "signal_event",
    id: item.id,
    dateUtc: item.date_utc,
    displayTime: item.display_time ?? item.display_window ?? "",
    displayWindow: item.display_window ?? item.display_time ?? "",
    direction: item.direction,
    signalsCount: item.signals_count,
    nTracked: item.n_tracked,
    avgChangeLabel: "Avg Change",
    avgChangePct: nullableNumber(item.avg_change_pct),
    impactLabel: nullableString(item.impact_label),
    eventStrengthScore: nullableNumber(item.event_strength_score),
    chartContextScore: nullableNumber(item.chart_context_score),
    chartContextLabel: nullableString(item.chart_context_label),
    eventStoryType: nullableString(item.event_story_type),
    trendContext: nullableString(item.trend_context),
    momentumContext: nullableString(item.momentum_context),
    volatilityContext: nullableString(item.volatility_context),
    eventRangeContext: nullableString(item.event_range_context),
    publicContextStatus: item.public_context_status ?? null,
    sources: normalizeSources(item.sources),
    evidenceWindow: {
      start: item.evidence_window.start,
      end: item.evidence_window.end,
      duration_min: item.evidence_window.duration_min,
      peak_time: item.evidence_window.peak_time ?? null,
    },
    perSymbolEvidence: arrayOrEmpty(item.per_symbol_evidence).map(
      normalizeSymbolEvidenceV02,
    ),
    leadMoverSymbol: nullableString(item.lead_mover_symbol),
    strongestPeakSymbol: nullableString(item.strongest_peak_symbol),
    highlightCells: normalizeHighlightCells(item.highlight_cells),
    chart: item.chart ?? null,
    brief: item.brief ?? null,
    details: recordOrEmpty(item.expanded),
  };
}

function normalizeSection(item: FeedItemV02): NormalizedFeedSection {
  if (item.item_type === "daily_overview") {
    return normalizeDailyOverviewSection(item);
  }

  if (item.item_type === "market_story") {
    return normalizeMarketStorySection(item);
  }

  return normalizeSignalEventSection(item);
}

export function normalizeFeedV02(
  response: FeedApiResponseV02,
): NormalizedFeedV02 {
  return {
    version: "v02",
    ok: true,
    updatedAt: response.updated_at ?? null,
    rangeDays: response.range_days,
    grouping: "utc_day",
    daysExpandedDefault: response.days_expanded_default ?? true,
    globalControlLabelWhenExpanded: "Collapse days",
    globalControlLabelWhenCollapsed: "Expand days",
    dayPosts: (response.day_groups ?? []).map((group) => ({
      id: group.day_post_id,
      dateUtc: group.date_utc,
      displayDate: group.display_date,
      isCurrentUtcDay: group.is_current_utc_day,
      itemCount: group.item_count,
      hiddenItemCountWhenCollapsed: group.hidden_item_count_when_collapsed,
      defaultCollapsedItemId: group.default_collapsed_item_id ?? null,
      hasExtraItems: group.has_extra_items,
      expandedControlLabel: group.expanded_control_label ?? null,
      collapsedControlLabel: group.collapsed_control_label ?? null,
      sections: (group.items ?? []).map(normalizeSection),
    })),
  };
}

export function normalizeFeedResponse(
  response: FeedApiResponse,
): NormalizedFeedEnvelope {
  if (isFeedResponseV02(response)) {
    const v02 = normalizeFeedV02(response);
    return {
      version: "v02",
      items: [],
      updatedAt: v02.updatedAt,
      v02,
    };
  }

  return normalizeFeedV01(response);
}

export function safeFormatPercent(
  value: number | null | undefined,
  digits = 2,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "\u2014";
  }

  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}
