#!/usr/bin/env node

import {
  OUTPUTS_DIR,
  isMain,
  readJson,
  readOption,
  roundNumber,
  writeJson,
} from "./shared.mjs";
import { DAILY_OVERVIEWS_PATH } from "./generate-daily-overviews.mjs";
import { DAY_STORIES_JSON_PATH } from "./generate-day-stories.mjs";
import { VNEXT_C_EVENTS_PATH } from "./run-vnext-c.mjs";

export const FEED_CONTRACT_V02_PATH = `${OUTPUTS_DIR}/feed_contract_v02.json`;

const UTC_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const SIGNAL_CLASSIFICATION_INSTRUCTIONS = [
  "Classify the signal event as Focused Cause, Likely Cause, Market Backdrop, No Clear Cause, or Claude Limited.",
  "Use source tags: Focused catalyst source, Likely cause source, Backdrop source, Price check source.",
  "Do not force a cause when sources are weak or missing.",
  "Treat chart context as descriptive market structure, not proof of cause.",
  "Range Position is descriptive market structure, not advice.",
  "Use chart context to decide how hard to search and what route to try.",
  "Do not over-focus on one 15-minute candle unless the event is macro-aligned or a sharp impulse.",
  "Do not provide trading advice, forecasts, price targets, or recommendations.",
  "Return JSON only.",
];

const DAILY_OVERVIEW_INSTRUCTIONS = [
  "Summarize the day's crypto market context using relevant public sources.",
  "Do not classify the Daily Overview itself with Focused Cause or Likely Cause.",
  "Use separate Daily Overview labels unless referring to a specific included signal event.",
  "Do not provide trading advice, forecasts, price targets, or recommendations.",
  "Return JSON only.",
];

const DAY_STORY_INSTRUCTIONS = [
  "Summarize the multi-swing chart context only.",
  "Do not infer a news cause from chart context alone.",
  "Use Market Story labels separately from Signal Event and Daily Overview labels.",
  "Do not provide trading advice, forecasts, price targets, or recommendations.",
  "Return JSON only.",
];

export const RANGE_POSITION_LABELS = {
  inside_range: "Inside range",
  near_high: "Near high",
  near_low: "Near low",
  broke_high: "Broke high",
  broke_low: "Broke low",
};

export const EVENT_RANGE_CONTEXT_LABELS = {
  broad_break_high: "Range break",
  broad_break_low: "Range break",
  broad_broke_high: "Range break",
  broad_broke_low: "Range break",
  mixed_range_position: "Mixed range position",
  mostly_inside_range: "Inside range",
  weak_range_context: "Inside range",
  inside_range: "Inside range",
};

const TABLE_LABELS = {
  windowChange: "Window Change",
  peak15m: "Peak 15m",
  volume: "Volume \u00d7",
  rangePosition: "Range Position",
};

function displayDate(dateUtc) {
  const date = new Date(`${dateUtc}T00:00:00.000Z`);
  return `${UTC_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()} UTC`;
}

function displayTime(iso) {
  const date = new Date(iso);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")} UTC`;
}

function displayWindowEndTime(iso) {
  const end = new Date(Date.parse(iso) + 2);
  return `${String(end.getUTCHours()).padStart(2, "0")}:${String(
    end.getUTCMinutes(),
  ).padStart(2, "0")} UTC`;
}

function displayWindow(startIso, endIso) {
  const start = displayTime(startIso).replace(" UTC", "");
  return `${start}-${displayWindowEndTime(endIso)}`;
}

function directionLabel(direction) {
  if (direction === "observed_down") return "Observed Down";
  if (direction === "two_sided") return "Two-sided";
  return "Observed Up";
}

function signPct(value, digits = 1) {
  const rounded = roundNumber(value, digits);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function evidenceBarCount(event) {
  const diagnosticCount = Number(event.diagnostics?.evidence_bar_count);
  if (Number.isFinite(diagnosticCount) && diagnosticCount > 0) {
    return diagnosticCount;
  }

  return Math.max(1, Math.round(Number(event.duration_min ?? 15) / 15));
}

function candleCountLabel(count) {
  return `${count} ${count === 1 ? "candle" : "candles"}`;
}

function evidenceWindowDisplay(event) {
  const bars = evidenceBarCount(event);
  return `${displayWindow(event.window_start, event.window_end)} - ${event.duration_min} min - ${candleCountLabel(bars)}`;
}

function peakMoveForSymbol(event, symbol) {
  return event.diagnostics?.peak_15m_move_pct_by_symbol?.[symbol] ?? null;
}

function highlightSet(event, column) {
  return new Set(
    (event.table_highlights?.highlight_cells ?? [])
      .filter((cell) => cell.column === column)
      .map((cell) => cell.symbol),
  );
}

function tableRows(event) {
  const leadSymbols = highlightSet(event, "symbol");
  const peakSymbols = highlightSet(event, "peak_15m");

  return (event.per_symbol_evidence ?? []).map((row) => ({
    symbol: row.symbol,
    window_change_pct: roundNumber(
      row.window_change_pct ?? row.window_move_pct ?? 0,
      4,
    ),
    peak_15m_pct: roundNumber(peakMoveForSymbol(event, row.symbol) ?? 0, 4),
    volume_x: roundNumber(row.max_volume_ratio ?? 0, 4),
    range_position: row.range_position ?? null,
    range_position_label: row.range_position
      ? (RANGE_POSITION_LABELS[row.range_position] ?? "\u2014")
      : "\u2014",
    prev_24h_high: row.prev_24h_high ?? null,
    prev_24h_low: row.prev_24h_low ?? null,
    range_break_direction: row.range_break_direction ?? "none",
    range_break_type: row.range_break_type ?? "none",
    range_break_confirmed: Boolean(row.range_break_confirmed),
    range_break_pct: row.range_break_pct ?? 0,
    range_break_strength: row.range_break_strength ?? 0,
    distance_to_range_high_pct: row.distance_to_range_high_pct ?? null,
    distance_to_range_low_pct: row.distance_to_range_low_pct ?? null,
    highlights: {
      lead_mover: leadSymbols.has(row.symbol),
      strongest_peak_15m: peakSymbols.has(row.symbol),
    },
  }));
}

function publicDiagnostics(event) {
  const { per_symbol_chart_context: _perSymbolChartContext, ...diagnostics } =
    event.diagnostics ?? {};
  return diagnostics;
}

export function signalClaudePayload(event) {
  return {
    event_mode: "signal_event",
    event_id: event.event_id,
    date_utc: event.window_start.slice(0, 10),
    evidence_window: {
      start: event.window_start,
      end: event.window_end,
      duration_min: event.duration_min,
      evidence_bar_count: evidenceBarCount(event),
      display: evidenceWindowDisplay(event),
    },
    evidence_bar_count: evidenceBarCount(event),
    direction: event.direction,
    signals_count: event.signals_count,
    n_tracked: event.n_tracked,
    avg_change_label: "Avg Change",
    avg_change_pct: roundNumber(event.window_move_pct, 4),
    avg_change_method: event.avg_change_method ?? "median",
    event_direction: event.event_direction ?? null,
    evidence_window_stats: event.evidence_window_stats ?? null,
    signal_strength: event.event_strength_label,
    signal_strength_score: roundNumber(event.signal_strength_score, 4),
    event_range_context: event.event_range_context,
    chart_context_label: event.chart_context_label,
    chart_context_score: event.chart_context_score,
    event_story_type: event.event_story_type,
    trend_context: event.trend_context,
    momentum_context: event.momentum_context,
    momentum_type: event.momentum_type,
    volatility_context: event.volatility_context,
    volatility_state: event.volatility_state ?? null,
    history_support_type: event.history_support_type ?? null,
    history_support_score: event.history_support_score ?? null,
    source_likelihood: event.source_likelihood ?? null,
    source_likelihood_band: event.source_likelihood_band ?? null,
    source_likelihood_reasons: event.source_likelihood_reasons ?? [],
    publish_gate: event.publish_gate ?? null,
    chart_context_reasons: event.chart_context_reasons,
    chart_context_warnings: event.chart_context_warnings,
    source_route_hint: event.source_route_hint,
    per_symbol_window_evidence: tableRows(event),
    table_highlights: event.table_highlights,
    show_peak_details: event.show_peak_details,
    macro_aligned: event.macro_aligned,
    nearest_macro_event: event.nearest_macro_event,
    macro_delta_min: event.macro_delta_min,
    retrospective_post_window: {
      post_window_move_pct_median:
        event.momentum_context?.post_window_move_pct_median ?? null,
      post_window_reversal_flag:
        event.momentum_context?.post_window_reversal_flag ?? false,
      note: "Retrospective only; not used for detection or publishing.",
    },
    instructions: SIGNAL_CLASSIFICATION_INSTRUCTIONS,
  };
}

export function dayStoryClaudePayload(story) {
  return {
    event_mode: "market_story",
    story_id: story.id,
    anchor_date_utc: story.anchor_date_utc,
    story_window: {
      start: story.story_start,
      end: story.story_end,
      duration_min: story.duration_min,
      crosses_utc_day: story.crosses_utc_day,
    },
    direction: story.direction,
    story_context_label: story.story_context_label,
    story_type: story.story_type,
    primary_story_family: story.primary_story_family ?? null,
    member_dominant_story_family:
      story.member_dominant_story_family ?? story.primary_story_family ?? null,
    story_context_scores: story.story_context_scores ?? {},
    story_window_context: story.story_window_context ?? null,
    story_label_decision_reasons: story.story_label_decision_reasons ?? [],
    minimum_story_range: story.minimum_story_range ?? null,
    two_sided_swing: story.two_sided_swing ?? null,
    story_source_type: story.story_source_type ?? "signal_sequence",
    story_source_label: story.story_source_label ?? "Signal story",
    signal_event_count: story.signal_event_count,
    audit_event_count: story.audit_event_count ?? 0,
    total_event_count: story.total_event_count ?? story.signal_event_count,
    included_signal_event_ids: story.included_signal_event_ids,
    included_audit_event_ids: story.included_audit_event_ids ?? [],
    supporting_audit_event_ids: story.supporting_audit_event_ids,
    gap_model_version: story.gap_model_version ?? story.story_layer_version,
    eligibility_reason: story.eligibility_reason ?? null,
    adaptive_gap_links: story.adaptive_gap_links ?? [],
    max_event_gap_minutes: story.max_event_gap_minutes ?? 0,
    adaptive_gap_summary: story.adaptive_gap_summary ?? null,
    swing_change_label: "Swing Change",
    total_swing_change_pct: story.total_swing_change_pct,
    net_signal_change_pct: story.net_signal_change_pct,
    audit_swing_change_pct: story.audit_swing_change_pct ?? 0,
    summary_hint: story.summary_hint,
    instructions: DAY_STORY_INSTRUCTIONS,
  };
}

export function dailyClaudePayload(overview, daySignalEvents) {
  return {
    event_mode: "daily_overview",
    date_utc: overview.date_utc,
    day_start: overview.day_start,
    day_end: overview.day_end,
    change_label: "24h Change",
    market_24h_change_pct: overview.market_24h_move_pct,
    market_tone: overview.market_tone,
    notable_symbols: overview.notable_symbols,
    market_range_pct: overview.market_range_pct,
    signal_events: daySignalEvents.map((event) => ({
      event_id: event.event_id,
      window_start: event.window_start,
      window_end: event.window_end,
      direction: event.direction,
      avg_change_pct: event.window_move_pct,
      impact_label: event.event_strength_label,
      range_context: event.event_range_context,
      chart_context_label: event.chart_context_label,
      event_story_type: event.event_story_type,
      source_route_hint: event.source_route_hint,
    })),
    source_query_hints: overview.source_query_hints,
    instructions: DAILY_OVERVIEW_INSTRUCTIONS,
  };
}

function signalItem(event) {
  const cardId = `card_${event.event_id}`;
  const bars = evidenceBarCount(event);
  const evidenceDisplay = evidenceWindowDisplay(event);

  return {
    item_type: "signal_event",
    id: event.event_id,
    date_utc: event.window_start.slice(0, 10),
    display_time: displayTime(event.window_start),
    display_window: displayWindow(event.window_start, event.window_end),
    evidence_window_label: "Evidence window",
    evidence_window_display: evidenceDisplay,
    evidence_bar_count: bars,
    evidence_candle_count_label: candleCountLabel(bars),
    duration_label: "Duration",
    duration_display: `${event.duration_min} min`,
    direction: event.direction,
    direction_label: directionLabel(event.direction),
    signals_count: event.signals_count,
    n_tracked: event.n_tracked,
    avg_change_pct: roundNumber(event.window_move_pct, 4),
    avg_change_label: "Avg Change",
    avg_change_method: event.avg_change_method ?? "median",
    event_direction: event.event_direction ?? null,
    evidence_window_stats: event.evidence_window_stats ?? null,
    table_window_change_label: TABLE_LABELS.windowChange,
    peak_15m_label: TABLE_LABELS.peak15m,
    volume_label: TABLE_LABELS.volume,
    range_position_label: TABLE_LABELS.rangePosition,
    metric_label: "Avg Change",
    metric_display: `Avg Change: ${signPct(event.window_move_pct)}`,
    impact_label: event.event_strength_label,
    event_strength_score: roundNumber(event.signal_strength_score, 4),
    event_range_context: event.event_range_context,
    event_range_context_label:
      EVENT_RANGE_CONTEXT_LABELS[event.event_range_context] ?? "Inside range",
    chart_context_score: roundNumber(event.chart_context_score ?? 0, 4),
    chart_context_label: event.chart_context_label ?? "Weak chart context",
    event_story_type: event.event_story_type ?? "weak_chart_context",
    trend_context: event.trend_context ?? null,
    momentum_context: event.momentum_context ?? null,
    momentum_type: event.momentum_type ?? null,
    volatility_context: event.volatility_context ?? null,
    volatility_state: event.volatility_state ?? null,
    history_support_type: event.history_support_type ?? null,
    history_support_score: event.history_support_score ?? null,
    source_likelihood: event.source_likelihood ?? null,
    source_likelihood_band: event.source_likelihood_band ?? null,
    chart_context_reasons: event.chart_context_reasons ?? [],
    chart_context_warnings: event.chart_context_warnings ?? [],
    publish_gate: event.publish_gate ?? null,
    publish_candidate: event.publish_candidate,
    public_context_status: "placeholder_pending_claude",
    sources: [],
    per_symbol_evidence: tableRows(event),
    evidence_window: {
      start: event.window_start,
      end: event.window_end,
      duration_min: event.duration_min,
      evidence_bar_count: bars,
      display: evidenceDisplay,
    },
    chart: {
      chart_highlight_type: "event_window",
      highlight_start: event.window_start,
      highlight_end: event.window_end,
      peak_marker_time: event.peak_time,
      feed_card_id: cardId,
      selection_toggle: "select_again_to_clear",
      background_click_clears_selection: true,
    },
    expanded: {
      section_control: {
        collapsed_label: "Show more",
        expanded_label: "Hide",
      },
      per_symbol_table: {
        columns: [
          "Symbol",
          TABLE_LABELS.windowChange,
          TABLE_LABELS.peak15m,
          TABLE_LABELS.volume,
          TABLE_LABELS.rangePosition,
        ],
        labels: {
          window_change: TABLE_LABELS.windowChange,
          peak_15m: TABLE_LABELS.peak15m,
          volume: TABLE_LABELS.volume,
          range_position: TABLE_LABELS.rangePosition,
        },
        rows: tableRows(event),
        highlight_glossary: [
          "Highlighted symbol or row marks the strongest contributor in the evidence window.",
          "Highlighted Peak 15m cell marks the strongest 15-minute change inside the evidence window.",
          "Highlights are supporting diagnostics, not standalone headline metrics.",
        ],
      },
      context_details_placeholder: "Public Context placeholder",
      sources_placeholder: [],
      diagnostics: publicDiagnostics(event),
      chart_context_details: {
        chart_context_score: roundNumber(event.chart_context_score ?? 0, 4),
        chart_context_label: event.chart_context_label ?? "Weak chart context",
        event_story_type: event.event_story_type ?? "weak_chart_context",
        trend_context: event.trend_context ?? null,
        momentum_context: event.momentum_context ?? null,
        volatility_context: event.volatility_context ?? null,
        event_range_context: event.event_range_context,
        reasons: event.chart_context_reasons ?? [],
        warnings: event.chart_context_warnings ?? [],
      },
      show_peak_details: event.show_peak_details,
    },
    lead_mover_symbol: event.table_highlights?.lead_mover_symbol ?? null,
    strongest_peak_symbol:
      event.table_highlights?.strongest_peak_symbol ?? null,
    highlight_cells: event.table_highlights?.highlight_cells ?? [],
    show_peak_details: event.show_peak_details,
    claude_payload: signalClaudePayload(event),
  };
}

function dailyOverviewItem(overview, daySignalEvents) {
  const includedSignalEventIds = daySignalEvents.map((event) => event.event_id);

  return {
    item_type: "daily_overview",
    id: `daily_${overview.date_utc}`,
    date_utc: overview.date_utc,
    display_time: "Full UTC day",
    market_tone: overview.market_tone,
    change_pct: roundNumber(overview.market_24h_move_pct, 4),
    change_label: "24h Change",
    daily_change_label: "24h Change",
    metric_label: "24h Change",
    metric_display: `24h Change: ${signPct(overview.market_24h_move_pct)}`,
    market_range_pct: overview.market_range_pct,
    notable_symbols: overview.notable_symbols,
    has_publishable_signal_events: overview.has_publishable_signal_events,
    public_context_status: "placeholder_pending_daily_overview",
    sources: [],
    chart: {
      chart_highlight_type: "day_window",
      highlight_start: overview.day_start,
      highlight_end: overview.day_end,
      included_signal_event_ids: includedSignalEventIds,
      hide_other_days_on_select: true,
      default_highlight_hidden: true,
      selection_toggle: "select_again_to_clear",
    },
    expanded: {
      section_control: {
        collapsed_label: "Show more",
        expanded_label: "Hide",
      },
      daily_market_summary_fields: {
        label: "Daily Overview",
        market_tone: overview.market_tone,
        change_label: "24h Change",
        market_24h_change_pct: overview.market_24h_move_pct,
        market_range_pct: overview.market_range_pct,
        summary_hint: overview.summary_hint,
        notable_symbols: overview.notable_symbols,
        top_symbol_moves: overview.top_symbol_moves,
        source_query_hints: overview.source_query_hints,
        sources_placeholder: [],
      },
    },
    claude_payload: dailyClaudePayload(overview, daySignalEvents),
  };
}

function storyItem(story) {
  const cardId = `card_${story.id}`;

  return {
    item_type: "market_story",
    id: story.id,
    date_utc: story.anchor_date_utc,
    display_time: displayTime(story.story_start),
    display_window: story.story_display_window,
    story_window_label: "Story window",
    story_window_display: story.story_display_window,
    direction: story.direction,
    direction_label: directionLabel(story.direction),
    story_context_label: story.story_context_label,
    story_type: story.story_type,
    primary_story_family: story.primary_story_family ?? null,
    member_dominant_story_family:
      story.member_dominant_story_family ?? story.primary_story_family ?? null,
    story_context_scores: story.story_context_scores ?? {},
    story_context_counts: story.story_context_counts ?? {},
    story_window_context: story.story_window_context ?? null,
    story_label_decision_reasons: story.story_label_decision_reasons ?? [],
    two_sided_swing: story.two_sided_swing ?? null,
    story_source_type: story.story_source_type ?? "signal_sequence",
    story_source_label: story.story_source_label ?? "Signal story",
    gap_model_version: story.gap_model_version ?? story.story_layer_version,
    eligibility_reason: story.eligibility_reason ?? null,
    minimum_story_range: story.minimum_story_range ?? null,
    adaptive_gap_links: story.adaptive_gap_links ?? [],
    max_event_gap_minutes: story.max_event_gap_minutes ?? 0,
    adaptive_gap_summary: story.adaptive_gap_summary ?? null,
    signal_event_count: story.signal_event_count,
    audit_event_count: story.audit_event_count ?? 0,
    total_event_count: story.total_event_count ?? story.signal_event_count,
    included_signal_event_ids: story.included_signal_event_ids,
    included_audit_event_ids: story.included_audit_event_ids ?? [],
    supporting_audit_event_ids: story.supporting_audit_event_ids,
    all_story_event_ids: story.all_story_event_ids ?? [
      ...story.included_signal_event_ids,
      ...(story.included_audit_event_ids ?? []),
    ],
    crosses_utc_day: story.crosses_utc_day,
    duration_min: story.duration_min,
    swing_change_label: "Swing Change",
    total_swing_change_pct: roundNumber(story.total_swing_change_pct, 4),
    net_signal_change_pct: roundNumber(story.net_signal_change_pct, 4),
    audit_swing_change_pct: roundNumber(story.audit_swing_change_pct ?? 0, 4),
    median_signal_change_pct: roundNumber(story.median_signal_change_pct, 4),
    strongest_signal_event_id: story.strongest_signal_event_id,
    dominant_chart_context_label: story.dominant_chart_context_label,
    event_range_contexts: story.event_range_contexts ?? [],
    summary_hint: story.summary_hint,
    public_context_status: "placeholder_pending_market_story",
    sources: [],
    story_window: {
      start: story.story_start,
      end: story.story_end,
      duration_min: story.duration_min,
      crosses_utc_day: story.crosses_utc_day,
      display: story.story_display_window,
    },
    chart: {
      chart_highlight_type: "story_window",
      highlight_start: story.story_start,
      highlight_end: story.story_end,
      included_signal_event_ids: story.included_signal_event_ids,
      included_audit_event_ids: story.included_audit_event_ids ?? [],
      supporting_audit_event_ids: story.supporting_audit_event_ids,
      feed_card_id: cardId,
      anchor_date_utc: story.anchor_date_utc,
      selection_toggle: "select_again_to_clear",
      background_click_clears_selection: true,
    },
    expanded: {
      section_control: {
        collapsed_label: "Show more",
        expanded_label: "Hide",
      },
      story_details: {
        label: "Market Story",
        story_window_label: "Story window",
        story_window_display: story.story_display_window,
        story_context_label: story.story_context_label,
        story_source_type: story.story_source_type ?? "signal_sequence",
        story_source_label: story.story_source_label ?? "Signal story",
        gap_model_version: story.gap_model_version ?? story.story_layer_version,
        eligibility_reason: story.eligibility_reason ?? null,
        primary_story_family: story.primary_story_family ?? null,
        member_dominant_story_family:
          story.member_dominant_story_family ??
          story.primary_story_family ??
          null,
        story_context_scores: story.story_context_scores ?? {},
        story_context_counts: story.story_context_counts ?? {},
        story_window_context: story.story_window_context ?? null,
        story_label_decision_reasons:
          story.story_label_decision_reasons ?? [],
        minimum_story_range: story.minimum_story_range ?? null,
        two_sided_swing: story.two_sided_swing ?? null,
        adaptive_gap_links: story.adaptive_gap_links ?? [],
        max_event_gap_minutes: story.max_event_gap_minutes ?? 0,
        adaptive_gap_summary: story.adaptive_gap_summary ?? null,
        signal_event_count: story.signal_event_count,
        audit_event_count: story.audit_event_count ?? 0,
        total_event_count: story.total_event_count ?? story.signal_event_count,
        included_signal_events: story.included_signal_events ?? [],
        included_audit_events: story.included_audit_events ?? [],
        supporting_audit_events: story.supporting_audit_events ?? [],
        summary_hint: story.summary_hint,
        note: "Market Stories summarize related Signal Events and audit-only detections. They use an adaptive chart-context gap, can cross UTC day boundaries, and are placed in the day where the first trigger starts.",
      },
      sources_placeholder: [],
    },
    claude_payload: dayStoryClaudePayload(story),
  };
}

function itemSortTime(item) {
  if (item.item_type === "daily_overview") return item.chart.highlight_end;
  if (item.item_type === "market_story") return item.story_window.end;
  return item.evidence_window.end;
}

function latestSignalForDay(dayEvents) {
  return [...dayEvents].sort((a, b) =>
    b.window_start.localeCompare(a.window_start),
  )[0];
}

function sectionDetailsState(dayGroups) {
  return Object.fromEntries(
    dayGroups.flatMap((group) => group.items.map((item) => [item.id, false])),
  );
}

function dayPostControlLabel(hiddenCount, action) {
  if (hiddenCount <= 0) return null;
  if (action === "Collapse") return "Collapse post";
  return `+${hiddenCount} events · ${action} post`;
}

function sortDayItems(items) {
  return [...items].sort((a, b) => {
    const order = {
      daily_overview: 0,
      market_story: 1,
      signal_event: 2,
    };
    const aOrder = order[a.item_type] ?? 10;
    const bOrder = order[b.item_type] ?? 10;

    if (aOrder !== bOrder) return aOrder - bOrder;
    return itemSortTime(a).localeCompare(itemSortTime(b));
  });
}

export function buildFeedContract({
  dailyOverviews,
  signalEvents,
  dayStories = [],
  now = new Date(),
  detectorVersion = "vnext_c",
}) {
  const currentUtcDay = now.toISOString().slice(0, 10);
  const publicSignals = signalEvents
    .filter((event) => event.publish_candidate)
    .sort((a, b) => a.window_start.localeCompare(b.window_start));
  const auditOnly = signalEvents.filter((event) => !event.publish_candidate);
  const dayGroups = [...dailyOverviews]
    .sort((a, b) => b.date_utc.localeCompare(a.date_utc))
    .map((overview) => {
      const dayEvents = publicSignals.filter(
        (event) => event.window_start.slice(0, 10) === overview.date_utc,
      );
      const storyItems = dayStories
        .filter((story) => story.anchor_date_utc === overview.date_utc)
        .sort((a, b) => a.story_start.localeCompare(b.story_start))
        .map(storyItem);
      const dailyItem = dailyOverviewItem(overview, dayEvents);
      const signalItems = dayEvents.map(signalItem);
      const items = sortDayItems([dailyItem, ...storyItems, ...signalItems]);
      const isCurrentUtcDay = overview.date_utc === currentUtcDay;
      const latestItem = [...items].sort((a, b) =>
        itemSortTime(b).localeCompare(itemSortTime(a)),
      )[0];
      const latestSignal = latestSignalForDay(dayEvents);
      const defaultCollapsedItemId =
        isCurrentUtcDay && (latestItem || latestSignal)
          ? (latestItem?.id ?? latestSignal.event_id)
          : dailyItem.id;
      const hiddenCount = Math.max(0, items.length - 1);
      const hasExtraItems = hiddenCount > 0;
      const expandedControlLabel = dayPostControlLabel(hiddenCount, "Collapse");
      const collapsedControlLabel = dayPostControlLabel(hiddenCount, "Expand");

      return {
        day_post_id: `day_${overview.date_utc}`,
        date_utc: overview.date_utc,
        display_date: displayDate(overview.date_utc),
        is_current_utc_day: isCurrentUtcDay,
        item_count: items.length,
        hidden_item_count_when_collapsed: hiddenCount,
        has_extra_items: hasExtraItems,
        latest_item_id: latestItem?.id ?? defaultCollapsedItemId,
        default_collapsed_item_id: defaultCollapsedItemId,
        expanded_control_label: expandedControlLabel,
        collapsed_control_label: collapsedControlLabel,
        day_post_control: {
          expand_label: collapsedControlLabel,
          collapse_label: expandedControlLabel,
        },
        visible_item_ids_when_collapsed: [defaultCollapsedItemId],
        visible_item_ids_when_expanded: items.map((item) => item.id),
        items,
      };
    });

  return {
    ok: true,
    updated_at: now.toISOString(),
    detector_version: detectorVersion,
    chart_context_enabled: signalEvents.some((event) =>
      Number.isFinite(event.chart_context_score),
    ),
    range_days: 30,
    grouping: "utc_day",
    day_groups: dayGroups,
    audit: {
      non_public_detected_count: auditOnly.length,
      non_public_detected_events_not_in_public_feed: true,
    },
    preview_state: {
      days_expanded: true,
      section_details_expanded_by_id: sectionDetailsState(dayGroups),
      global_control_label: "Collapse days",
      global_control_label_when_expanded: "Collapse days",
      global_control_label_when_collapsed: "Expand days",
      possible_global_control_labels: ["Expand days", "Collapse days"],
    },
    preview_diagnostics: {
      detector_version: detectorVersion,
      public_signal_count: publicSignals.length,
      market_story_count: dayStories.length,
      audit_event_count: auditOnly.length,
      chart_context_enabled: signalEvents.some((event) =>
        Number.isFinite(event.chart_context_score),
      ),
    },
  };
}

export async function runFeedContract(
  options,
  { now = new Date(), logger = console } = {},
) {
  const dailyOverviews =
    (await readJson(options.dailyOverviewPath)).items ?? [];
  let dayStories = [];
  try {
    dayStories = (await readJson(options.dayStoriesPath)).items ?? [];
  } catch {
    dayStories = [];
  }
  const signalPayload = await readJson(options.signalEventsPath);
  const signalEvents = signalPayload.events ?? [];
  const detectorVersion = signalPayload.detector ?? "vnext_c";
  const contract = buildFeedContract({
    dailyOverviews,
    signalEvents,
    dayStories,
    now,
    detectorVersion,
  });

  await writeJson(options.outputPath, contract);
  logger.log(
    `Feed contract complete: ${contract.day_groups.length} day posts, ${contract.audit.non_public_detected_count} audit-only events.`,
  );

  return contract;
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    dailyOverviewPath: readOption(argv, "--daily") ?? DAILY_OVERVIEWS_PATH,
    dayStoriesPath: readOption(argv, "--stories") ?? DAY_STORIES_JSON_PATH,
    signalEventsPath: readOption(argv, "--events") ?? VNEXT_C_EVENTS_PATH,
    outputPath: readOption(argv, "--output") ?? FEED_CONTRACT_V02_PATH,
  };
}

if (isMain(import.meta.url)) {
  runFeedContract(parseArgs()).catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Feed contract failed.",
    );
    process.exitCode = 1;
  });
}
