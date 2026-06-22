import assert from "node:assert/strict";
import test from "node:test";

import {
  isFeedResponseV02,
  normalizeFeedResponse,
  normalizeFeedV02,
  safeFormatPercent,
} from "./feedAdapters.ts";

const v01Feed = {
  ok: true,
  updated_at: "2026-06-21T12:00:00.000Z",
  range_days: 30,
  signal_window: "15m",
  baseline_window: "24h",
  items: [
    {
      incident_id: "inc_001",
      incident_key: "inc_001",
      detected_at: "2026-06-19T14:45:00.000Z",
      started_at: "2026-06-19T14:00:00.000Z",
      ended_at: "2026-06-19T14:45:00.000Z",
      event_start_time: "2026-06-19T14:00:00.000Z",
      event_end_time: "2026-06-19T14:45:00.000Z",
      peak_time: "2026-06-19T14:15:00.000Z",
      first_detected_at: "2026-06-19T14:45:00.000Z",
      last_evaluated_at: "2026-06-19T14:45:00.000Z",
      display_date: "Jun 19, 14:00-14:45 UTC",
      scope: "market_wide",
      direction: "observed_up",
      symbols: ["BTCUSDT", "ETHUSDT"],
      tags: ["same_day_context"],
      evidence: {
        signal_window: "15m",
        baseline_window: "24h",
        summary: "Fixture signal.",
        breadth_label: "Signals: 2 of 5 symbols",
        severity_score: 80.4,
        severity_label: "Impact Score",
        avg_15m_change_pct: 1.2,
        peak_symbol: "BTCUSDT",
      },
      brief: {
        status: "brief_ready",
        catalyst_status: "context_only",
        label: "Market Backdrop",
        summary: "Fixture context.",
        confidence: "low",
        price_context_check: "matches_binance",
      },
      sources: [
        {
          publisher: "Reuters",
          title: "Fixture source",
          url: "https://www.reuters.com/markets/fixture/",
          published_at: "2026-06-19",
          used_for: "backdrop",
        },
      ],
      symbol_evidence: [
        {
          symbol: "BTCUSDT",
          included_in_event: true,
          direction: "up",
          change_15m_pct: 1.4,
          price_z: 2.3,
          volume_ratio: 2.1,
          volatility_ratio: 1.9,
          severity_score: 80.4,
        },
      ],
      expanded_details: {
        caveats: [],
        claude_context: { summary: "Detailed fixture context." },
      },
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
      day_post_id: "day_2026-06-19",
      date_utc: "2026-06-19",
      display_date: "Jun 19, 2026 UTC",
      is_current_utc_day: false,
      item_count: 3,
      hidden_item_count_when_collapsed: 2,
      default_collapsed_item_id: "daily_2026-06-19",
      has_extra_items: true,
      expanded_control_label: "+2 events \u00b7 Collapse post",
      collapsed_control_label: "+2 events \u00b7 Expand post",
      items: [
        {
          item_type: "daily_overview",
          id: "daily_2026-06-19",
          date_utc: "2026-06-19",
          display_time: "Full UTC day",
          daily_label: "Daily Context",
          daily_change_label: "24h Change",
          daily_change_pct: 1.8,
          market_tone: "risk_on",
          market_range_pct: 4.2,
          notable_symbols: [{ symbol: "BTCUSDT", reason: "largest change" }],
          top_symbol_moves: [
            {
              symbol: "BTCUSDT",
              change_pct: 2.1,
              range_pct: 4.2,
              volatility_score: 33,
            },
          ],
          public_context_status: "brief_ready",
          sources: [
            {
              publisher: "CoinDesk",
              title: "Daily fixture",
              url: "https://www.coindesk.com/markets/2026/06/19/daily-fixture/",
              published_at: "2026-06-19T20:00:00.000Z",
              tag: "Main daily context source",
              source_strength: "medium",
              used_for: "daily_context",
            },
          ],
          chart: {
            chart_highlight_type: "day_window",
            highlight_start: "2026-06-19T00:00:00.000Z",
            highlight_end: "2026-06-19T23:59:59.999Z",
            included_signal_event_ids: ["sig_2026-06-19T14"],
            included_market_story_ids: ["story_2026-06-19"],
            hide_other_days_on_select: true,
          },
          expanded: { daily_chart_context_summary: { generated_by: "test" } },
          brief: {
            id: "brief_daily",
            status: "brief_ready",
            public_label: "Daily Context",
            collapsed_summary: "Daily context.",
          },
        },
        {
          item_type: "market_story",
          id: "story_2026-06-19",
          date_utc: "2026-06-19",
          display_time: "10:00-18:00 UTC",
          story_window_label: "Story window",
          avg_change_label: "Avg Change",
          avg_change_pct: 1.2,
          swing_score_label: "Volatility Score",
          swing_score: 42,
          story_label: "Range break sequence",
          story_family: "range_break",
          direction: "observed_up",
          chart_context_score: 86,
          per_symbol_evidence: [
            {
              symbol: "BTCUSDT",
              avg_change_label: "Avg Change",
              avg_change_pct: 1.1,
              range_pct: 3.4,
              swing_score_label: "Volatility Score",
              swing_score: 31,
              volume_ratio: 1.2,
              movement_status_label: "Movement Status",
              movement_status: "Net up",
              bar_count: 32,
            },
          ],
          range_context: { event_range_context: "broad_broke_high" },
          trend_context: { trend_context: "trend_up" },
          momentum_context: { momentum_type: "continuation" },
          volatility_context: { volatility_context: "ordinary_volatility" },
          decision_reasons: ["coherent range break"],
          publish_reason: "strong deterministic story",
          chart: {
            chart_highlight_type: "story_window",
            highlight_start: "2026-06-19T10:00:00.000Z",
            highlight_end: "2026-06-19T18:00:00.000Z",
            included_signal_event_ids: ["sig_2026-06-19T14"],
            included_audit_event_ids: ["audit_2026-06-19T12"],
          },
          deterministic_context: {
            story_label: "Range break sequence",
            chart_context_score: 86,
          },
          public_context_status: "brief_ready",
          sources: [
            {
              publisher: "Ignored source",
              title: "Ignored source",
              url: "https://example.com/ignored-market-story-source",
              published_at: "2026-06-19",
              tag: "Backdrop source",
            },
          ],
          brief: {
            id: "brief_should_not_survive",
            status: "brief_ready",
            public_label: "Focused Cause",
          },
        },
        {
          item_type: "signal_event",
          id: "sig_2026-06-19T14",
          date_utc: "2026-06-19",
          display_time: "14:00-14:45 UTC",
          display_window: "14:00-14:45 UTC",
          direction: "observed_up",
          signals_count: 4,
          n_tracked: 5,
          avg_change_label: "Avg Change",
          avg_change_pct: 1.7,
          impact_label: "High",
          event_strength_score: 82,
          chart_context_score: 88,
          chart_context_label: "Strong chart context",
          event_story_type: "range_break_up",
          direction_changed: true,
          direction_history: [
            { direction: "observed_down", at: "2026-06-19T14:15:00.000Z" },
            { direction: "observed_up", at: "2026-06-19T14:45:00.000Z" },
          ],
          trend_context: "trend_up",
          momentum_context: "impulse",
          volatility_context: "expansion_after_compression",
          event_range_context: "broad_broke_high",
          public_context_status: "brief_ready",
          sources: [
            {
              publisher: "Reuters",
              title: "Signal fixture",
              url: "https://www.reuters.com/markets/2026/06/19/signal-fixture/",
              published_at: "2026-06-19T14:30:00.000Z",
              tag: "Likely cause source",
              source_strength: "medium",
              used_for: "likely_cause",
            },
          ],
          evidence_window: {
            start: "2026-06-19T14:00:00.000Z",
            end: "2026-06-19T14:45:00.000Z",
            duration_min: 45,
            peak_time: "2026-06-19T14:15:00.000Z",
          },
          per_symbol_evidence: [
            {
              symbol: "BTCUSDT",
              window_change_label: "Window Change",
              window_change_pct: 2.2,
              range_pct: 4.8,
              peak_15m_label: "Peak 15m",
              peak_15m_change_pct: 1.1,
              volume_ratio: 2.5,
              range_position_label: "Range Position",
              range_position: "broke_high",
              range_position_display: "Broke high",
              is_lead_mover: true,
              is_peak_15m_highlight: true,
              participated: true,
            },
          ],
          lead_mover_symbol: "BTCUSDT",
          strongest_peak_symbol: "BTCUSDT",
          highlight_cells: [
            {
              symbol: "BTCUSDT",
              column: "symbol",
              reason: "lead_mover",
            },
            {
              symbol: "BTCUSDT",
              column: "peak_15m",
              reason: "strongest_peak_15m",
            },
          ],
          chart: {
            chart_highlight_type: "event_window",
            highlight_start: "2026-06-19T14:00:00.000Z",
            highlight_end: "2026-06-19T14:45:00.000Z",
            peak_marker_time: "2026-06-19T14:15:00.000Z",
            feed_card_id: "sig_2026-06-19T14",
          },
          expanded: {
            chart_context_reasons: ["range break"],
            avg_change_method: "median_participating_symbols",
          },
          brief: {
            id: "brief_signal",
            status: "brief_ready",
            public_label: "Likely Cause",
            collapsed_summary: "Signal context.",
          },
        },
      ],
    },
  ],
};

test("v0.1 feed response still normalizes to legacy items", () => {
  const normalized = normalizeFeedResponse(v01Feed);

  assert.equal(normalized.version, "v01");
  assert.equal(normalized.v02, null);
  assert.equal(normalized.items.length, 1);
  assert.equal(normalized.items[0].incident_id, "inc_001");
  assert.equal(normalized.items[0].evidence.severity_score, 80);
  assert.equal(normalized.items[0].expanded_details.symbol_evidence.length, 1);
});

test("v0.2 feed response is detected and normalized to day posts", () => {
  assert.equal(isFeedResponseV02(v02Feed), true);

  const normalized = normalizeFeedV02(v02Feed);
  const day = normalized.dayPosts[0];

  assert.equal(normalized.globalControlLabelWhenExpanded, "Collapse days");
  assert.equal(normalized.globalControlLabelWhenCollapsed, "Expand days");
  assert.equal(day.expandedControlLabel, "+2 events \u00b7 Collapse post");
  assert.equal(day.collapsedControlLabel, "+2 events \u00b7 Expand post");
  assert.equal(day.sections.length, 3);
  assert.equal(day.sections[0].itemType, "daily_overview");
  assert.equal(day.sections[1].itemType, "market_story");
  assert.equal(day.sections[2].itemType, "signal_event");
});

test("v0.2 Daily Overview, Market Story, and Signal Event labels are preserved", () => {
  const normalized = normalizeFeedV02(v02Feed);
  const [daily, story, signal] = normalized.dayPosts[0].sections;

  assert.equal(daily.itemType, "daily_overview");
  assert.equal(daily.dailyChangeLabel, "24h Change");
  assert.equal(daily.topSymbolMoves[0].volatility_score, 33);
  assert.equal(
    daily.sources[0].url,
    v02Feed.day_groups[0].items[0].sources[0].url,
  );

  assert.equal(story.itemType, "market_story");
  assert.equal(story.storyWindowLabel, "Story window");
  assert.equal(story.avgChangeLabel, "Avg Change");
  assert.equal(story.avgChangePct, 1.2);
  assert.equal(story.swingScoreLabel, "Volatility Score");
  assert.equal(story.swingScore, 42);
  assert.equal(story.perSymbolEvidence[0].range_pct, 3.4);
  assert.equal(
    story.perSymbolEvidence[0].swing_score_label,
    "Volatility Score",
  );
  assert.equal(
    story.perSymbolEvidence[0].movement_status_label,
    "Movement Status",
  );

  assert.equal(signal.itemType, "signal_event");
  assert.equal(signal.avgChangeLabel, "Avg Change");
  assert.equal(signal.directionChanged, true);
  assert.deepEqual(signal.directionHistory, [
    { direction: "observed_down", at: "2026-06-19T14:15:00.000Z" },
    { direction: "observed_up", at: "2026-06-19T14:45:00.000Z" },
  ]);
  assert.equal(
    signal.perSymbolEvidence[0].window_change_label,
    "Window Change",
  );
  assert.equal(signal.perSymbolEvidence[0].range_pct, 4.8);
  assert.equal(
    signal.perSymbolEvidence[0].range_position_label,
    "Range Position",
  );
  assert.equal(
    signal.sources[0].url,
    v02Feed.day_groups[0].items[2].sources[0].url,
  );
});

test("Market Story normalized section strips accidental Claude and source fields", () => {
  const normalized = normalizeFeedV02(v02Feed);
  const story = normalized.dayPosts[0].sections[1];
  const serialized = JSON.stringify(story);

  assert.equal(story.itemType, "market_story");
  assert.equal(Object.hasOwn(story, "sources"), false);
  assert.equal(Object.hasOwn(story, "publicContextStatus"), false);
  assert.equal(Object.hasOwn(story, "brief"), false);
  assert.equal(
    serialized.includes("https://example.com/ignored-market-story-source"),
    false,
  );
  assert.equal(serialized.includes("Focused Cause"), false);
});

test("cross-day Market Stories are repeated as continuation cards", () => {
  const crossDay = structuredClone(v02Feed);
  const story = crossDay.day_groups[0].items[1];
  story.display_time = "22:00-03:00 UTC";
  story.chart.highlight_start = "2026-06-19T22:00:00.000Z";
  story.chart.highlight_end = "2026-06-20T03:00:00.000Z";

  const normalized = normalizeFeedV02(crossDay);
  const originalDay = normalized.dayPosts.find(
    (day) => day.dateUtc === "2026-06-19",
  );
  const continuationDay = normalized.dayPosts.find(
    (day) => day.dateUtc === "2026-06-20",
  );
  const originalStory = originalDay.sections.find(
    (section) => section.itemType === "market_story",
  );
  const continuationStory = continuationDay.sections.find(
    (section) => section.itemType === "market_story",
  );

  assert.equal(originalStory.itemType, "market_story");
  assert.equal(originalStory.id, "story_2026-06-19");
  assert.equal(originalStory.originalId, "story_2026-06-19");
  assert.equal(originalStory.isContinuation, false);

  assert.equal(continuationStory.itemType, "market_story");
  assert.equal(continuationStory.id, "story_2026-06-19__continue__2026-06-20");
  assert.equal(continuationStory.originalId, "story_2026-06-19");
  assert.equal(continuationStory.isContinuation, true);
  assert.equal(continuationStory.storyLabel, originalStory.storyLabel);
  assert.equal(Object.hasOwn(continuationStory, "sources"), false);
});

test("Signal Event table highlight metadata and source URLs survive exactly", () => {
  const normalized = normalizeFeedV02(v02Feed);
  const signal = normalized.dayPosts[0].sections[2];

  assert.equal(signal.itemType, "signal_event");
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
    "https://www.reuters.com/markets/2026/06/19/signal-fixture/",
  );
});

test("v0.2 normalized model does not invent missing optional arrays or audit items", () => {
  const sparse = structuredClone(v02Feed);
  sparse.day_groups[0].items = [
    {
      item_type: "signal_event",
      id: "sig_sparse",
      date_utc: "2026-06-19",
      direction: "observed_down",
      signals_count: 3,
      n_tracked: 5,
      avg_change_label: "Avg Change",
      avg_change_pct: null,
      evidence_window: {
        start: "2026-06-19T18:00:00.000Z",
        end: "2026-06-19T18:45:00.000Z",
        duration_min: 45,
      },
    },
  ];

  const normalized = normalizeFeedV02(sparse);
  const signal = normalized.dayPosts[0].sections[0];
  const serialized = JSON.stringify(normalized);

  assert.equal(signal.itemType, "signal_event");
  assert.deepEqual(signal.sources, []);
  assert.deepEqual(signal.perSymbolEvidence, []);
  assert.equal(serialized.includes("audit_event"), false);
  assert.equal(serialized.includes("Latest only"), false);
  assert.equal(serialized.includes("Expand all"), false);
  assert.equal(serialized.includes("Collapse all"), false);
});

test("normalized v0.2 envelope preserves data while legacy items stay empty", () => {
  const envelope = normalizeFeedResponse(v02Feed);

  assert.equal(envelope.version, "v02");
  assert.equal(envelope.v02?.dayPosts[0].sections.length, 3);
  assert.deepEqual(envelope.items, []);
  assert.equal(envelope.updatedAt, "2026-06-21T12:00:00.000Z");
});

test("safe percent formatting uses an explicit empty marker", () => {
  assert.equal(safeFormatPercent(1.234), "+1.23%");
  assert.equal(safeFormatPercent(-0.5, 1), "-0.5%");
  assert.equal(safeFormatPercent(null), "\u2014");
});
