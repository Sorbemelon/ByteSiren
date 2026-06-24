import assert from "node:assert/strict";
import test from "node:test";

import { normalizeFeedResponse, normalizeFeedV02 } from "./feedAdapters.ts";
import {
  buildChartHighlightsV02,
  buildChartSourceMarkersV02,
  chooseChartHighlightAtTimeV02,
  createInitialExpandedDayIds,
  EMPTY_FEED_SELECTION_V02,
  ensureSelectedDayExpandedV02,
  getDayPostControlLabel,
  getDayPostHiddenCountLabel,
  getGlobalDayControlLabel,
  getVisibleSectionsForDay,
  isSectionSelectedV02,
  sectionHasExpandableDetails,
  sourceRoleLabelV02,
  sourceRoleToneV02,
  toggleAllDayPosts,
  toggleDayPost,
  toggleFeedSelectionV02,
  toggleSectionDetails,
} from "./feedV02ViewModel.ts";

test("v0.2 source roles map to distinct public labels and tones", () => {
  assert.deepEqual(
    [
      "Focused catalyst source",
      "Likely cause source",
      "Main daily context source",
      "Supporting daily source",
      "Backdrop source",
      "Price check source",
    ].map((role) => ({
      label: sourceRoleLabelV02(role),
      tone: sourceRoleToneV02(role),
    })),
    [
      { label: "Catalyst", tone: "catalyst" },
      { label: "Likely", tone: "likely" },
      { label: "Main", tone: "main" },
      { label: "Support", tone: "support" },
      { label: "Backdrop", tone: "backdrop" },
      { label: "Price", tone: "price" },
    ],
  );
  assert.notEqual(
    sourceRoleToneV02("Main daily context source"),
    sourceRoleToneV02("Supporting daily source"),
  );
});

const v01Feed = {
  ok: true,
  updated_at: "2026-06-21T12:00:00.000Z",
  range_days: 30,
  signal_window: "15m",
  baseline_window: "24h",
  items: [
    {
      incident_id: "inc_legacy",
      incident_key: "inc_legacy",
      detected_at: "2026-06-20T12:00:00.000Z",
      started_at: "2026-06-20T11:45:00.000Z",
      ended_at: "2026-06-20T12:00:00.000Z",
      display_date: "Jun 20, 11:45-12:00 UTC",
      scope: "market_wide",
      direction: "observed_up",
      symbols: ["BTCUSDT"],
      tags: [],
      evidence: {
        signal_window: "15m",
        baseline_window: "24h",
        summary: "Legacy fixture.",
        breadth_label: "Signals: 1 of 5 symbols",
        severity_score: 70,
        severity_label: "Impact Score",
        avg_15m_change_pct: 1.1,
        peak_symbol: "BTCUSDT",
      },
      brief: {
        status: "queued_for_analysis",
        catalyst_status: null,
        label: "Queued",
        summary: null,
        confidence: null,
        price_context_check: null,
      },
      sources: [],
      symbol_evidence: [],
    },
  ],
};

const v02Feed = {
  ok: true,
  version: "v02",
  updated_at: "2026-06-21T12:00:00.000Z",
  range_days: 30,
  grouping: "utc_day",
  days_expanded_default: true,
  global_control_label_when_expanded: "Collapse days",
  global_control_label_when_collapsed: "Expand days",
  day_groups: [
    {
      day_post_id: "day_2026-06-20",
      date_utc: "2026-06-20",
      display_date: "Jun 20, 2026 UTC",
      is_current_utc_day: false,
      item_count: 4,
      hidden_item_count_when_collapsed: 2,
      default_collapsed_item_id: "daily_2026-06-20",
      has_extra_items: true,
      expanded_control_label: "+2 events \u00b7 Collapse post",
      collapsed_control_label: "+2 events \u00b7 Expand post",
      items: [
        {
          item_type: "daily_overview",
          id: "daily_2026-06-20",
          date_utc: "2026-06-20",
          display_time: "Full UTC day",
          daily_label: "Daily Overview",
          daily_change_label: "24h Change",
          daily_change_pct: 1.4,
          market_tone: "mixed",
          market_range_pct: 3.7,
          notable_symbols: [{ symbol: "BTCUSDT", reason: "largest change" }],
          top_symbol_moves: [
            {
              symbol: "BTCUSDT",
              change_pct: 1.9,
              range_pct: 3.7,
              volatility_score: 34,
            },
          ],
          public_context_status: "queued_for_analysis",
          sources: [
            {
              publisher: "CoinDesk",
              title: "Daily fixture",
              url: "https://www.coindesk.com/markets/2026/06/20/daily-fixture/",
              published_at: "2026-06-20T20:00:00.000Z",
              tag: "Main daily context source",
              used_for: "daily_context",
            },
          ],
          brief: {
            id: "brief_daily",
            status: "queued_for_analysis",
            public_label: null,
            collapsed_summary: "Daily context summary.",
          },
          chart: {
            chart_highlight_type: "day_window",
            highlight_start: "2026-06-20T00:00:00.000Z",
            highlight_end: "2026-06-20T23:59:59.999Z",
            included_signal_event_ids: ["sig_2026-06-20T15"],
            included_market_story_ids: ["story_2026-06-20"],
            hide_other_days_on_select: true,
          },
        },
        {
          item_type: "market_story",
          id: "story_2026-06-20",
          date_utc: "2026-06-20",
          display_time: "04:00-16:00 UTC",
          story_window_label: "Story window",
          avg_change_label: "Avg Change",
          avg_change_pct: -0.8,
          swing_score_label: "Volatility Score",
          swing_score: 51,
          story_label: "Reversal sequence",
          story_family: "reversal",
          direction: "two_sided",
          chart_context_score: 84,
          per_symbol_evidence: [
            {
              symbol: "ETHUSDT",
              avg_change_label: "Avg Change",
              avg_change_pct: -0.7,
              range_pct: 3.6,
              swing_score_label: "Volatility Score",
              swing_score: 44,
              volume_ratio: 1.1,
              movement_status_label: "Movement Status",
              movement_status: "Net down",
              bar_count: 48,
            },
          ],
          range_context: { event_range_context: "mixed_range_position" },
          trend_context: { trend_context: "trend_down" },
          momentum_context: { momentum_type: "reversal" },
          volatility_context: { volatility_context: "ordinary_volatility" },
          decision_reasons: ["opposite movement resolved into reversal"],
          publish_reason: "deterministic story criteria passed",
          chart: {
            chart_highlight_type: "story_window",
            highlight_start: "2026-06-20T04:00:00.000Z",
            highlight_end: "2026-06-20T16:00:00.000Z",
            included_signal_event_ids: ["sig_2026-06-20T15"],
            included_audit_event_ids: ["audit_2026-06-20T13"],
          },
          public_context_status: "brief_ready",
          sources: [
            {
              publisher: "Ignored",
              title: "Ignored",
              url: "https://example.com/ignored-story-source",
              published_at: "2026-06-20",
              tag: "Backdrop source",
            },
          ],
          brief: {
            id: "bad_story_brief",
            status: "brief_ready",
            public_label: "Focused Cause",
          },
        },
        {
          item_type: "signal_event",
          id: "sig_2026-06-20T15",
          date_utc: "2026-06-20",
          display_time: "15:15-16:00 UTC",
          display_window: "15:15-16:00 UTC",
          direction: "observed_up",
          signals_count: 4,
          n_tracked: 5,
          avg_change_label: "Avg Change",
          avg_change_pct: 1.65,
          impact_label: "High",
          event_strength_score: 82,
          chart_context_score: 88,
          chart_context_label: "Strong chart context",
          event_story_type: "range_break_up",
          trend_context: "trend_up",
          momentum_context: "impulse",
          volatility_context: "expansion_after_compression",
          event_range_context: "broad_broke_high",
          public_context_status: "brief_ready",
          sources: [
            {
              publisher: "Reuters",
              title: "Signal fixture",
              url: "https://www.reuters.com/markets/2026/06/20/signal-fixture/",
              published_at: "2026-06-20T15:40:00.000Z",
              tag: "Likely cause source",
              used_for: "likely_cause",
            },
          ],
          evidence_window: {
            start: "2026-06-20T15:15:00.000Z",
            end: "2026-06-20T16:00:00.000Z",
            duration_min: 45,
            peak_time: "2026-06-20T15:30:00.000Z",
          },
          per_symbol_evidence: [
            {
              symbol: "BTCUSDT",
              window_change_label: "Window Change",
              window_change_pct: 2.2,
              range_pct: 4.8,
              peak_15m_label: "Peak 15m",
              peak_15m_change_pct: 1.2,
              volume_ratio: 2.7,
              range_position_label: "Range Position",
              range_position: "broke_high",
              range_position_display: "Broke high",
              is_lead_mover: true,
              is_peak_15m_highlight: true,
            },
          ],
          lead_mover_symbol: "BTCUSDT",
          strongest_peak_symbol: "BTCUSDT",
          highlight_cells: [
            { symbol: "BTCUSDT", column: "symbol", reason: "lead_mover" },
            {
              symbol: "BTCUSDT",
              column: "peak_15m",
              reason: "strongest_peak_15m",
            },
          ],
          chart: {
            chart_highlight_type: "event_window",
            highlight_start: "2026-06-20T15:15:00.000Z",
            highlight_end: "2026-06-20T16:00:00.000Z",
            peak_marker_time: "2026-06-20T15:30:00.000Z",
            feed_card_id: "sig_2026-06-20T15",
          },
          brief: {
            id: "brief_signal",
            status: "brief_ready",
            public_label: "Likely Cause",
            collapsed_summary: "Signal context.",
          },
        },
        {
          item_type: "audit_event",
          id: "audit_should_not_render",
          date_utc: "2026-06-20",
        },
      ],
    },
    {
      day_post_id: "day_2026-06-19",
      date_utc: "2026-06-19",
      display_date: "Jun 19, 2026 UTC",
      is_current_utc_day: false,
      item_count: 1,
      hidden_item_count_when_collapsed: 0,
      default_collapsed_item_id: "sig_2026-06-19T12",
      has_extra_items: false,
      items: [
        {
          item_type: "signal_event",
          id: "sig_2026-06-19T12",
          date_utc: "2026-06-19",
          display_time: "12:00-12:45 UTC",
          direction: "observed_down",
          signals_count: 3,
          n_tracked: 5,
          avg_change_label: "Avg Change",
          avg_change_pct: -1.2,
          evidence_window: {
            start: "2026-06-19T12:00:00.000Z",
            end: "2026-06-19T12:45:00.000Z",
            duration_min: 45,
          },
        },
      ],
    },
  ],
};

function normalizedV02() {
  return normalizeFeedV02(v02Feed);
}

test("legacy v0.1 response still normalizes to v01 items", () => {
  const envelope = normalizeFeedResponse(v01Feed);

  assert.equal(envelope.version, "v01");
  assert.equal(envelope.items.length, 1);
  assert.equal(envelope.items[0].incident_id, "inc_legacy");
});

test("v0.2 day-post ordering and public item filtering are stable", () => {
  const feed = normalizedV02();
  const firstDay = feed.dayPosts[0];
  const serialized = JSON.stringify(feed);

  assert.equal(firstDay.sections[0].itemType, "daily_overview");
  assert.equal(firstDay.sections[1].itemType, "market_story");
  assert.equal(firstDay.sections[2].itemType, "signal_event");
  assert.equal(firstDay.sections.length, 3);
  assert.equal(serialized.includes("audit_should_not_render"), false);
  assert.equal(serialized.includes('"itemType":"audit_event"'), false);
});

test("global day controls collapse and expand all day posts", () => {
  const feed = normalizedV02();
  const initial = createInitialExpandedDayIds(feed);

  assert.equal(initial.size, 2);
  assert.equal(getGlobalDayControlLabel(feed, initial), "Collapse days");

  const collapsed = toggleAllDayPosts(feed, initial);
  assert.equal(collapsed.size, 0);
  assert.equal(getGlobalDayControlLabel(feed, collapsed), "Expand days");

  const expanded = toggleAllDayPosts(feed, collapsed);
  assert.equal(expanded.size, 2);
  assert.equal(getGlobalDayControlLabel(feed, expanded), "Collapse days");
});

test("per-day controls show only the default collapsed item", () => {
  const feed = normalizedV02();
  const day = feed.dayPosts[0];

  assert.equal(getDayPostControlLabel(day, true), "Collapse post");
  assert.equal(getDayPostControlLabel(day, false), "Expand post");
  assert.equal(getDayPostHiddenCountLabel(day, true), null);
  assert.equal(getDayPostHiddenCountLabel(day, false), "+2 events");

  const visibleCollapsed = getVisibleSectionsForDay(day, false);
  assert.equal(visibleCollapsed.length, 1);
  assert.equal(visibleCollapsed[0].id, "daily_2026-06-20");

  const visibleExpanded = getVisibleSectionsForDay(day, true);
  assert.equal(visibleExpanded.length, 3);

  const next = toggleDayPost(new Set([day.id]), day.id);
  assert.equal(next.has(day.id), false);
});

test("section Show more / Hide state is independent from day-post state", () => {
  const feed = normalizedV02();
  const day = feed.dayPosts[0];
  const signal = day.sections[2];

  assert.equal(sectionHasExpandableDetails(signal), true);

  const expanded = toggleSectionDetails(new Set(), signal.id);
  assert.equal(expanded.has(signal.id), true);

  const collapsedDaySections = getVisibleSectionsForDay(day, false);
  assert.equal(
    collapsedDaySections.some((section) => section.id === signal.id),
    false,
  );
  assert.equal(expanded.has(signal.id), true);
});

test("v0.2 normalized labels preserve day-post and section wording", () => {
  const feed = normalizedV02();
  const [daily, story, signal] = feed.dayPosts[0].sections;
  const serialized = JSON.stringify(feed);

  assert.equal(feed.globalControlLabelWhenExpanded, "Collapse days");
  assert.equal(feed.globalControlLabelWhenCollapsed, "Expand days");
  assert.equal(daily.itemType, "daily_overview");
  assert.equal(daily.dailyChangeLabel, "24h Change");
  assert.equal(daily.topSymbolMoves[0].volatility_score, 34);
  assert.equal(story.itemType, "market_story");
  assert.equal(story.storyWindowLabel, "Story window");
  assert.equal(story.avgChangeLabel, "Avg Change");
  assert.equal(story.swingScoreLabel, "Volatility Score");
  assert.equal(story.perSymbolEvidence[0].range_pct, 3.6);
  assert.equal(story.perSymbolEvidence[0].movement_status, "Net down");
  assert.equal(signal.itemType, "signal_event");
  assert.equal(signal.avgChangeLabel, "Avg Change");
  assert.equal(
    signal.perSymbolEvidence[0].window_change_label,
    "Window Change",
  );
  assert.equal(signal.perSymbolEvidence[0].range_pct, 4.8);
  assert.equal(
    signal.perSymbolEvidence[0].range_position_label,
    "Range Position",
  );
  const controlLabels = [
    feed.globalControlLabelWhenExpanded,
    feed.globalControlLabelWhenCollapsed,
    feed.dayPosts[0].expandedControlLabel,
    feed.dayPosts[0].collapsedControlLabel,
  ];
  assert.equal(serialized.includes("Latest only"), false);
  assert.equal(controlLabels.includes("Expand all"), false);
  assert.equal(controlLabels.includes("Collapse all"), false);
  assert.equal(controlLabels.includes("Collapse day"), false);
  assert.equal(controlLabels.includes("Expand day"), false);
});

test("Market Story private context fields do not create public details", () => {
  const feed = normalizedV02();
  const story = feed.dayPosts[0].sections[1];

  assert.equal(story.itemType, "market_story");
  assert.equal(sectionHasExpandableDetails(story), true);

  const privateOnlyStory = {
    ...story,
    decisionReasons: ["internal chart bridge reason"],
    rangeContext: {},
    trendContext: {},
    momentumContext: {},
    volatilityContext: {},
    perSymbolEvidence: [],
    publishReason: "internal publish gate reason",
    deterministicContext: {
      story_source: "internal detector state",
      included_signal_event_ids: ["sig_internal"],
    },
  };

  assert.equal(sectionHasExpandableDetails(privateOnlyStory), false);
});

test("Signal Event highlights and exact source URLs are preserved", () => {
  const feed = normalizedV02();
  const signal = feed.dayPosts[0].sections[2];

  assert.equal(signal.itemType, "signal_event");
  assert.equal(signal.leadMoverSymbol, "BTCUSDT");
  assert.equal(signal.strongestPeakSymbol, "BTCUSDT");
  assert.deepEqual(signal.highlightCells, [
    { symbol: "BTCUSDT", column: "symbol", reason: "lead_mover" },
    {
      symbol: "BTCUSDT",
      column: "peak_15m",
      reason: "strongest_peak_15m",
    },
  ]);
  assert.equal(
    signal.sources[0].url,
    "https://www.reuters.com/markets/2026/06/20/signal-fixture/",
  );
});

test("v0.2 feed section selection toggles and expands the selected day", () => {
  const feed = normalizedV02();
  const day = feed.dayPosts[0];
  const signal = day.sections[2];

  const selected = toggleFeedSelectionV02(
    EMPTY_FEED_SELECTION_V02,
    signal.itemType,
    signal.id,
    day.id,
  );

  assert.equal(selected.itemType, "signal_event");
  assert.equal(selected.itemId, signal.id);
  assert.equal(selected.dayPostId, day.id);
  assert.equal(isSectionSelectedV02(selected, signal), true);

  const expanded = ensureSelectedDayExpandedV02(new Set(), selected);
  assert.equal(expanded.has(day.id), true);

  const cleared = toggleFeedSelectionV02(
    selected,
    signal.itemType,
    signal.id,
    day.id,
  );
  assert.deepEqual(cleared, EMPTY_FEED_SELECTION_V02);
});

test("v0.2 chart highlights follow default and selected item rules", () => {
  const feed = normalizedV02();
  const day = feed.dayPosts[0];
  const [daily, story, signal] = day.sections;

  const defaults = buildChartHighlightsV02(feed, EMPTY_FEED_SELECTION_V02);
  assert.deepEqual(
    defaults.map((highlight) => highlight.itemType),
    ["market_story", "signal_event", "signal_event"],
  );
  assert.equal(
    defaults.some((highlight) => highlight.type === "day_window"),
    false,
  );

  const selectedSignal = toggleFeedSelectionV02(
    EMPTY_FEED_SELECTION_V02,
    signal.itemType,
    signal.id,
    day.id,
  );
  const signalHighlights = buildChartHighlightsV02(feed, selectedSignal);
  const selectedEvent = signalHighlights.find(
    (highlight) => highlight.itemId === signal.id,
  );
  assert.equal(selectedEvent?.type, "event_window");
  assert.equal(selectedEvent?.selected, true);
  assert.equal(selectedEvent?.peakMarkerTime, "2026-06-20T15:30:00.000Z");
  assert.equal(
    signalHighlights.some(
      (highlight) => highlight.itemId !== signal.id && highlight.dimmed,
    ),
    true,
  );

  const selectedDaily = toggleFeedSelectionV02(
    EMPTY_FEED_SELECTION_V02,
    daily.itemType,
    daily.id,
    day.id,
  );
  const dailyHighlights = buildChartHighlightsV02(feed, selectedDaily);
  assert.equal(
    dailyHighlights.some(
      (highlight) => highlight.itemId === daily.id && highlight.selected,
    ),
    true,
  );
  assert.equal(
    dailyHighlights.some((highlight) => highlight.dayPostId !== day.id),
    false,
  );
  assert.equal(
    dailyHighlights.some((highlight) => highlight.itemId === story.id),
    true,
  );
});

test("cross-day Market Story continuations do not duplicate default chart highlights", () => {
  const crossDay = structuredClone(v02Feed);
  const story = crossDay.day_groups[0].items[1];
  story.display_time = "20:00-03:00 UTC";
  story.chart.highlight_start = "2026-06-20T20:00:00.000Z";
  story.chart.highlight_end = "2026-06-21T03:00:00.000Z";

  const feed = normalizeFeedV02(crossDay);
  const defaultHighlights = buildChartHighlightsV02(
    feed,
    EMPTY_FEED_SELECTION_V02,
  );
  const defaultStoryHighlights = defaultHighlights.filter(
    (highlight) =>
      highlight.itemType === "market_story" &&
      highlight.start === "2026-06-20T20:00:00.000Z" &&
      highlight.end === "2026-06-21T03:00:00.000Z",
  );

  assert.equal(defaultStoryHighlights.length, 1);

  const continuationDay = feed.dayPosts.find(
    (day) => day.dateUtc === "2026-06-21",
  );
  const continuationStory = continuationDay.sections.find(
    (section) => section.itemType === "market_story",
  );
  const selectedContinuation = toggleFeedSelectionV02(
    EMPTY_FEED_SELECTION_V02,
    continuationStory.itemType,
    continuationStory.id,
    continuationDay.id,
  );
  const selectedHighlights = buildChartHighlightsV02(
    feed,
    selectedContinuation,
  );
  const selectedStory = selectedHighlights.find(
    (highlight) => highlight.itemId === continuationStory.id,
  );

  assert.equal(continuationStory.isContinuation, true);
  assert.equal(selectedStory?.type, "story_window");
  assert.equal(selectedStory?.selected, true);
});

test("chart highlight hit testing prefers selected, then narrower, then recent", () => {
  const feed = normalizedV02();
  const day = feed.dayPosts[0];
  const signal = day.sections[2];
  const selectedSignal = toggleFeedSelectionV02(
    EMPTY_FEED_SELECTION_V02,
    signal.itemType,
    signal.id,
    day.id,
  );
  const highlights = buildChartHighlightsV02(feed, selectedSignal);
  const signalTime = Math.floor(
    new Date("2026-06-20T15:30:00.000Z").getTime() / 1000,
  );
  const storyOnlyTime = Math.floor(
    new Date("2026-06-20T09:00:00.000Z").getTime() / 1000,
  );

  assert.equal(
    chooseChartHighlightAtTimeV02(highlights, signalTime)?.itemId,
    signal.id,
  );
  assert.equal(
    chooseChartHighlightAtTimeV02(highlights, storyOnlyTime)?.itemType,
    "market_story",
  );
  assert.equal(
    chooseChartHighlightAtTimeV02(
      highlights,
      Math.floor(new Date("2026-06-21T00:00:00.000Z").getTime() / 1000),
    ),
    null,
  );
});

test("v0.2 chart source markers are built for Claude-backed items", () => {
  const feed = normalizedV02();
  const day = feed.dayPosts[0];
  const [daily, story, signal] = day.sections;

  const defaultMarkers = buildChartSourceMarkersV02(
    feed,
    EMPTY_FEED_SELECTION_V02,
  );
  assert.equal(defaultMarkers.length, 2);
  assert.deepEqual(
    defaultMarkers.map((marker) => marker.itemType),
    ["daily_overview", "signal_event"],
  );
  assert.deepEqual(
    defaultMarkers.map((marker) => marker.time),
    ["2026-06-20T23:59:59.999Z", "2026-06-20T15:15:00.000Z"],
  );
  assert.equal(
    defaultMarkers.every((marker) => marker.selected === false),
    true,
  );
  assert.equal(
    defaultMarkers.every((marker) => marker.filled === true),
    true,
  );

  const signalMarkers = buildChartSourceMarkersV02(
    feed,
    toggleFeedSelectionV02(
      EMPTY_FEED_SELECTION_V02,
      signal.itemType,
      signal.id,
      day.id,
    ),
  );
  const selectedSignalMarker = signalMarkers.find(
    (marker) => marker.itemId === signal.id,
  );
  assert.equal(signalMarkers.length, 2);
  assert.equal(selectedSignalMarker?.itemType, "signal_event");
  assert.equal(selectedSignalMarker?.label, "Likely");
  assert.equal(selectedSignalMarker?.tone, "likely");
  assert.equal(selectedSignalMarker?.selected, true);
  assert.equal(selectedSignalMarker?.time, "2026-06-20T15:15:00.000Z");
  assert.equal(selectedSignalMarker?.filled, true);
  assert.equal(
    selectedSignalMarker?.url,
    "https://www.reuters.com/markets/2026/06/20/signal-fixture/",
  );

  const dailyMarkers = buildChartSourceMarkersV02(
    feed,
    toggleFeedSelectionV02(
      EMPTY_FEED_SELECTION_V02,
      daily.itemType,
      daily.id,
      day.id,
    ),
  );
  const selectedDailyMarker = dailyMarkers.find(
    (marker) => marker.itemId === daily.id,
  );
  assert.equal(dailyMarkers.length, 2);
  assert.equal(selectedDailyMarker?.itemType, "daily_overview");
  assert.equal(selectedDailyMarker?.label, "Main");
  assert.equal(selectedDailyMarker?.tone, "main");
  assert.equal(selectedDailyMarker?.selected, true);
  assert.equal(selectedDailyMarker?.time, "2026-06-20T23:59:59.999Z");
  assert.equal(selectedDailyMarker?.filled, true);

  const storyMarkers = buildChartSourceMarkersV02(
    feed,
    toggleFeedSelectionV02(
      EMPTY_FEED_SELECTION_V02,
      story.itemType,
      story.id,
      day.id,
    ),
  );
  assert.equal(storyMarkers.length, 2);
  assert.equal(
    storyMarkers.some((marker) => marker.itemType === "market_story"),
    false,
  );
  assert.equal(
    storyMarkers.every((marker) => marker.selected === false),
    true,
  );
});

test("v0.2 chart source markers keep duplicate URLs visible per source row", () => {
  const duplicateFeed = structuredClone(v02Feed);
  const signal = duplicateFeed.day_groups[0].items.find(
    (item) => item.item_type === "signal_event",
  );
  const daily = duplicateFeed.day_groups[0].items.find(
    (item) => item.item_type === "daily_overview",
  );

  signal.sources = [
    ...signal.sources,
    {
      publisher: "Reuters",
      title: "Signal fixture duplicate",
      url: "https://www.reuters.com/markets/2026/06/20/signal-fixture/",
      published_at: "2026-06-20T15:45:00.000Z",
      tag: "Likely cause source",
      used_for: "likely_cause",
    },
    {
      publisher: "CoinDesk",
      title: "Signal backdrop",
      url: "https://www.coindesk.com/markets/2026/06/20/signal-backdrop/",
      published_at: "2026-06-20T14:30:00.000Z",
      tag: "Backdrop source",
      used_for: "backdrop",
    },
    {
      publisher: "Cointelegraph",
      title: "Signal price check",
      url: "https://cointelegraph.com/news/signal-price-check",
      published_at: "2026-06-20T16:05:00.000Z",
      tag: "Price check source",
      used_for: "price_check",
    },
  ];
  daily.sources = [
    ...daily.sources,
    {
      publisher: "CoinDesk",
      title: "Daily fixture duplicate",
      url: "https://www.coindesk.com/markets/2026/06/20/daily-fixture/",
      published_at: "2026-06-20T21:00:00.000Z",
      tag: "Main daily context source",
      used_for: "daily_context",
    },
    {
      publisher: "Reuters",
      title: "Daily references the signal article",
      url: "https://www.reuters.com/markets/2026/06/20/signal-fixture/",
      published_at: "2026-06-20T15:45:00.000Z",
      tag: "Supporting daily source",
      used_for: "supporting_daily",
    },
    {
      publisher: "The Block",
      title: "Daily support",
      url: "https://www.theblock.co/post/daily-fixture-support",
      published_at: "2026-06-20T18:30:00.000Z",
      tag: "Supporting daily source",
      used_for: "supporting_daily",
    },
  ];

  const feed = normalizeFeedV02(duplicateFeed);
  const day = feed.dayPosts[0];
  const [dailySection, , signalSection] = day.sections;
  const defaultMarkers = buildChartSourceMarkersV02(
    feed,
    EMPTY_FEED_SELECTION_V02,
  );
  const signalMarkers = buildChartSourceMarkersV02(
    feed,
    toggleFeedSelectionV02(
      EMPTY_FEED_SELECTION_V02,
      signalSection.itemType,
      signalSection.id,
      day.id,
    ),
  );
  const dailyMarkers = buildChartSourceMarkersV02(
    feed,
    toggleFeedSelectionV02(
      EMPTY_FEED_SELECTION_V02,
      dailySection.itemType,
      dailySection.id,
      day.id,
    ),
  );

  assert.equal(defaultMarkers.length, 8);
  assert.equal(new Set(defaultMarkers.map((marker) => marker.url)).size, 5);
  assert.equal(
    defaultMarkers.filter((marker) => marker.url.endsWith("/signal-fixture/"))
      .length,
    3,
  );
  assert.equal(signalMarkers.length, 8);
  assert.deepEqual(
    signalMarkers
      .filter((marker) => marker.itemId === signalSection.id)
      .map((marker) => marker.label),
    ["Likely", "Likely", "Backdrop", "Price"],
  );
  assert.deepEqual(
    signalMarkers
      .filter((marker) => marker.itemId === signalSection.id)
      .map((marker) => marker.tone),
    ["likely", "likely", "backdrop", "price"],
  );
  assert.deepEqual(
    signalMarkers
      .filter((marker) => marker.itemId === dailySection.id)
      .map((marker) => marker.tone),
    ["main", "main", "support", "support"],
  );
  assert.deepEqual(
    signalMarkers
      .filter((marker) => marker.itemId === signalSection.id)
      .map((marker) => marker.time),
    [
      "2026-06-20T15:15:00.000Z",
      "2026-06-20T15:15:00.000Z",
      "2026-06-20T15:15:00.000Z",
      "2026-06-20T15:15:00.000Z",
    ],
  );
  assert.deepEqual(
    signalMarkers
      .filter((marker) => marker.itemId === dailySection.id)
      .map((marker) => marker.time),
    [
      "2026-06-20T23:59:59.999Z",
      "2026-06-20T23:59:59.999Z",
      "2026-06-20T23:59:59.999Z",
      "2026-06-20T23:59:59.999Z",
    ],
  );
  assert.equal(
    signalMarkers.every((marker) => marker.filled === true),
    true,
  );
  assert.equal(new Set(signalMarkers.map((marker) => marker.url)).size, 5);
  assert.equal(
    signalMarkers.filter((marker) => marker.itemId === signalSection.id).length,
    4,
  );
  assert.equal(
    signalMarkers.filter((marker) => marker.itemId === dailySection.id).length,
    4,
  );
  assert.equal(
    dailyMarkers.filter((marker) => marker.url.endsWith("/signal-fixture/"))
      .length,
    3,
  );
  assert.equal(
    dailyMarkers.some(
      (marker) =>
        marker.url.endsWith("/signal-fixture/") &&
        marker.itemId === dailySection.id &&
        marker.selected === true,
    ),
    true,
  );
  assert.equal(
    dailyMarkers.some(
      (marker) =>
        marker.url.endsWith("/signal-fixture/") &&
        marker.itemId === signalSection.id &&
        marker.selected === false,
    ),
    true,
  );
});

test("v0.2 chart source markers anchor to the parent card window", () => {
  const timestampFeed = structuredClone(v02Feed);
  const signal = timestampFeed.day_groups[0].items.find(
    (item) => item.item_type === "signal_event",
  );
  const daily = timestampFeed.day_groups[0].items.find(
    (item) => item.item_type === "daily_overview",
  );

  signal.sources = [
    {
      publisher: "Reuters",
      title: "Post-window signal article",
      url: "https://www.reuters.com/markets/2026/06/20/post-window-signal/",
      published_at: "2026-06-20T18:15:00.000Z",
      tag: "Likely cause source",
      used_for: "likely_cause",
    },
  ];
  daily.sources = [
    {
      publisher: "CoinDesk",
      title: "Daily article",
      url: "https://www.coindesk.com/markets/2026/06/20/daily-fixture/",
      published_at: "2026-06-20T21:00:00.000Z",
      tag: "Main daily context source",
      used_for: "daily_context",
    },
    {
      publisher: "Reuters",
      title: "Daily references same post-window article",
      url: "https://www.reuters.com/markets/2026/06/20/post-window-signal/",
      published_at: "2026-06-20T19:30:00.000Z",
      tag: "Supporting daily source",
      used_for: "supporting_daily",
    },
  ];

  const feed = normalizeFeedV02(timestampFeed);
  const day = feed.dayPosts[0];
  const [dailySection, , signalSection] = day.sections;
  const defaultMarkers = buildChartSourceMarkersV02(
    feed,
    EMPTY_FEED_SELECTION_V02,
  );
  const dailySelectedMarkers = buildChartSourceMarkersV02(
    feed,
    toggleFeedSelectionV02(
      EMPTY_FEED_SELECTION_V02,
      dailySection.itemType,
      dailySection.id,
      day.id,
    ),
  );
  const signalSelectedMarkers = buildChartSourceMarkersV02(
    feed,
    toggleFeedSelectionV02(
      EMPTY_FEED_SELECTION_V02,
      signalSection.itemType,
      signalSection.id,
      day.id,
    ),
  );
  const signalArticleUrl =
    "https://www.reuters.com/markets/2026/06/20/post-window-signal/";
  const defaultSharedMarkers = defaultMarkers.filter(
    (marker) => marker.url === signalArticleUrl,
  );
  const dailySelectedSharedMarkers = dailySelectedMarkers.filter(
    (marker) => marker.url === signalArticleUrl,
  );
  const signalSelectedSharedMarker = signalSelectedMarkers.find(
    (marker) =>
      marker.url === signalArticleUrl && marker.itemId === signalSection.id,
  );

  assert.deepEqual(
    defaultSharedMarkers.map((marker) => ({
      itemId: marker.itemId,
      time: marker.time,
    })),
    [
      {
        itemId: dailySection.id,
        time: "2026-06-20T23:59:59.999Z",
      },
      {
        itemId: signalSection.id,
        time: "2026-06-20T15:15:00.000Z",
      },
    ],
  );
  assert.deepEqual(
    dailySelectedSharedMarkers.map((marker) => ({
      itemId: marker.itemId,
      selected: marker.selected,
      time: marker.time,
    })),
    [
      {
        itemId: dailySection.id,
        selected: true,
        time: "2026-06-20T23:59:59.999Z",
      },
      {
        itemId: signalSection.id,
        selected: false,
        time: "2026-06-20T15:15:00.000Z",
      },
    ],
  );
  assert.equal(signalSelectedSharedMarker?.time, "2026-06-20T15:15:00.000Z");
  assert.equal(
    defaultMarkers.every((marker) => marker.filled === true),
    true,
  );
});

test("v0.2 chart source markers ignore source timestamps outside the item window", () => {
  const farTimestampFeed = structuredClone(v02Feed);
  const signal = farTimestampFeed.day_groups[0].items.find(
    (item) => item.item_type === "signal_event",
  );
  const daily = farTimestampFeed.day_groups[0].items.find(
    (item) => item.item_type === "daily_overview",
  );

  signal.sources = [
    {
      publisher: "Reuters",
      title: "Next-day signal recap",
      url: "https://www.reuters.com/markets/2026/06/21/next-day-signal/",
      published_at: "2026-06-21T10:00:00.000Z",
      tag: "Likely cause source",
      used_for: "likely_cause",
    },
  ];
  daily.sources = [
    {
      publisher: "CoinDesk",
      title: "Next-day daily recap",
      url: "https://www.coindesk.com/markets/2026/06/21/next-day-daily/",
      published_at: "2026-06-21T10:00:00.000Z",
      tag: "Main daily context source",
      used_for: "daily_context",
    },
  ];

  const feed = normalizeFeedV02(farTimestampFeed);
  const markers = buildChartSourceMarkersV02(feed, EMPTY_FEED_SELECTION_V02);
  const dailyMarker = markers.find(
    (marker) => marker.itemType === "daily_overview",
  );
  const signalMarker = markers.find(
    (marker) => marker.itemType === "signal_event",
  );

  assert.equal(
    dailyMarker?.time,
    "2026-06-20T23:59:59.999Z",
    "Daily source marker should anchor to the Daily range end",
  );
  assert.equal(dailyMarker?.filled, true);
  assert.equal(
    signalMarker?.time,
    "2026-06-20T15:15:00.000Z",
    "Signal source marker should anchor to the Signal start",
  );
  assert.equal(signalMarker?.filled, true);
});

test("v0.2 chart source markers are filled even when source timestamps are missing", () => {
  const fallbackFeed = structuredClone(v02Feed);
  const signal = fallbackFeed.day_groups[0].items.find(
    (item) => item.item_type === "signal_event",
  );
  const daily = fallbackFeed.day_groups[0].items.find(
    (item) => item.item_type === "daily_overview",
  );

  signal.sources = [
    {
      publisher: "Price Feed",
      title: "Signal live price page",
      url: "https://prices.example.test/signal-live-price",
      published_at: null,
      catalyst_time_utc: null,
      tag: "Price check source",
      used_for: "price_check",
    },
    {
      publisher: "Reuters",
      title: "Catalyst only, no publication time",
      url: "https://www.reuters.com/markets/catalyst-only/",
      published_at: null,
      catalyst_time_utc: "2026-06-20T05:00:00.000Z",
      tag: "Likely cause source",
      used_for: "likely_cause",
    },
  ];
  daily.sources = [
    {
      publisher: "Daily Publisher",
      title: "Daily article",
      url: "https://www.example-news.test/daily-article",
      published_at: "2026-06-20T20:30:00.000Z",
      tag: "Main daily context source",
      used_for: "daily_context",
    },
  ];

  const feed = normalizeFeedV02(fallbackFeed);
  const markers = buildChartSourceMarkersV02(feed, EMPTY_FEED_SELECTION_V02);
  const priceMarker = markers.find((marker) =>
    marker.url.includes("signal-live-price"),
  );
  const catalystMarker = markers.find((marker) =>
    marker.url.includes("catalyst-only"),
  );
  const dailyMarker = markers.find((marker) =>
    marker.url.includes("daily-article"),
  );

  // Source-time metadata does not control marker placement.
  assert.ok(priceMarker, "time-less source should still produce a marker");
  assert.equal(priceMarker.filled, true);
  assert.equal(priceMarker.time, "2026-06-20T15:15:00.000Z");

  assert.ok(catalystMarker);
  assert.equal(catalystMarker.filled, true);
  assert.equal(catalystMarker.time, "2026-06-20T15:15:00.000Z");

  assert.ok(dailyMarker);
  assert.equal(dailyMarker.filled, true);
  assert.equal(dailyMarker.time, "2026-06-20T23:59:59.999Z");
});

test("v0.2 chart source markers include Backdrop sources", () => {
  const dateOnlyFeed = structuredClone(v02Feed);
  const signal = dateOnlyFeed.day_groups[0].items.find(
    (item) => item.item_type === "signal_event",
  );

  signal.sources = [
    {
      publisher: "BlockchainReporter",
      title: "Same-day roundup, date only",
      url: "https://blockchainreporter.net/markets/2026/06/20/roundup/",
      published_at: "2026-06-20T00:00:00.000Z",
      catalyst_time_utc: null,
      tag: "Backdrop source",
      used_for: "backdrop",
    },
  ];

  const feed = normalizeFeedV02(dateOnlyFeed);
  const markers = buildChartSourceMarkersV02(feed, EMPTY_FEED_SELECTION_V02);
  const signalSection = feed.dayPosts[0].sections.find(
    (section) => section.itemType === "signal_event",
  );

  assert.equal(signalSection?.sources.length, 1);
  assert.equal(signalSection?.sources[0].tag, "Backdrop source");
  const marker = markers.find((m) => m.url.includes("roundup"));
  assert.ok(marker);
  assert.equal(marker.label, "Backdrop");
  assert.equal(marker.tone, "backdrop");
  assert.equal(marker.time, "2026-06-20T15:15:00.000Z");
  assert.equal(marker.filled, true);
});

test("acceptance: every accepted Signal and Daily source gets a filled chart marker", () => {
  const acceptanceFeed = structuredClone(v02Feed);
  const signal = acceptanceFeed.day_groups[0].items.find(
    (item) => item.item_type === "signal_event",
  );
  const daily = acceptanceFeed.day_groups[0].items.find(
    (item) => item.item_type === "daily_overview",
  );

  signal.sources = [
    {
      publisher: "Reuters",
      title: "Focused catalyst",
      url: "https://example.test/src-focused",
      published_at: null,
      catalyst_time_utc: "2026-06-20T05:15:00.000Z",
      tag: "Focused catalyst source",
      used_for: "focused_catalyst",
    },
    {
      publisher: "BlockchainReporter",
      title: "Same-day backdrop (date only)",
      url: "https://example.test/src-backdrop",
      published_at: "2026-06-20T00:00:00.000Z",
      catalyst_time_utc: null,
      tag: "Backdrop source",
      used_for: "backdrop",
    },
    {
      publisher: "Price Feed",
      title: "Live price page",
      url: "https://example.test/src-price",
      published_at: null,
      catalyst_time_utc: null,
      tag: "Price check source",
      used_for: "price_check",
    },
  ];
  daily.sources = [
    {
      publisher: "Nexo",
      title: "Main daily context",
      url: "https://example.test/src-main",
      published_at: "2026-06-20T09:30:00.000Z",
      catalyst_time_utc: null,
      tag: "Main daily context source",
      used_for: "daily_context",
    },
    {
      publisher: "CoinDesk",
      title: "Supporting daily (date only)",
      url: "https://example.test/src-support",
      published_at: "2026-06-20T00:00:00.000Z",
      catalyst_time_utc: null,
      tag: "Supporting daily source",
      used_for: "supporting_daily",
    },
  ];

  const feed = normalizeFeedV02(acceptanceFeed);
  const markers = buildChartSourceMarkersV02(feed, EMPTY_FEED_SELECTION_V02);
  const by = (fragment) => markers.find((m) => m.url.includes(fragment));
  const signalSection = feed.dayPosts[0].sections.find(
    (section) => section.itemType === "signal_event",
  );

  assert.equal(signalSection?.sources.length, 3);

  // Every accepted source is shown in the chart (none silently missing).
  for (const fragment of [
    "src-focused",
    "src-backdrop",
    "src-price",
    "src-main",
    "src-support",
  ]) {
    assert.ok(by(fragment), `${fragment} should produce a marker`);
  }

  // Source type is classified correctly per role — not flattened to Backdrop.
  assert.equal(by("src-focused").tone, "catalyst");
  assert.equal(by("src-focused").label, "Catalyst");
  assert.equal(by("src-backdrop").tone, "backdrop");
  assert.equal(by("src-backdrop").label, "Backdrop");
  assert.equal(by("src-price").tone, "price");
  assert.equal(by("src-price").label, "Price");
  assert.equal(by("src-main").tone, "main");
  assert.equal(by("src-main").label, "Main");
  assert.equal(by("src-support").tone, "support");
  assert.equal(by("src-support").label, "Support");

  for (const fragment of ["src-focused", "src-backdrop", "src-price"]) {
    assert.equal(by(fragment).filled, true);
    assert.equal(by(fragment).time, "2026-06-20T15:15:00.000Z");
  }

  for (const fragment of ["src-main", "src-support"]) {
    assert.equal(by(fragment).filled, true);
    assert.equal(by(fragment).time, "2026-06-20T23:59:59.999Z");
  }

  // Roles are genuinely distinct (sanity check against "everything is backdrop").
  const distinctTones = new Set(
    ["src-focused", "src-backdrop", "src-price", "src-main", "src-support"].map(
      (fragment) => by(fragment).tone,
    ),
  );
  assert.equal(distinctTones.size, 5);
});

test("Market Story normalized section strips Claude and source material", () => {
  const feed = normalizedV02();
  const story = feed.dayPosts[0].sections[1];
  const serialized = JSON.stringify(story);

  assert.equal(story.itemType, "market_story");
  assert.equal(Object.hasOwn(story, "sources"), false);
  assert.equal(Object.hasOwn(story, "publicContextStatus"), false);
  assert.equal(Object.hasOwn(story, "brief"), false);
  assert.equal(serialized.includes("Focused Cause"), false);
  assert.equal(serialized.includes("Likely Cause"), false);
  assert.equal(serialized.includes("Market Backdrop"), false);
  assert.equal(serialized.includes("No Clear Cause"), false);
  assert.equal(serialized.includes("Claude Limited"), false);
  assert.equal(
    serialized.includes("https://example.com/ignored-story-source"),
    false,
  );
});

test("empty v0.2 feeds keep honest empty data", () => {
  const feed = normalizeFeedV02({
    ...v02Feed,
    day_groups: [],
  });
  const expanded = createInitialExpandedDayIds(feed);

  assert.equal(feed.dayPosts.length, 0);
  assert.equal(expanded.size, 0);
});
