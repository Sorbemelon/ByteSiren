import assert from "node:assert/strict";
import test from "node:test";

import { getIntelligenceFeedV02 } from "./feedRepositoryV02.ts";
import { createMemoryD1 } from "../test/d1Memory.ts";

const now = new Date("2026-06-21T12:00:00.000Z");

function dailyOverview(overrides: Record<string, unknown> = {}) {
  return {
    id: "daily_2026-06-19",
    date_utc: "2026-06-19",
    day_start: "2026-06-19T00:00:00.000Z",
    day_end: "2026-06-19T23:59:59.999Z",
    market_tone: "volatile",
    daily_change_pct: 2.4,
    daily_change_label: "24h Change",
    market_range_pct: 4.8,
    notable_symbols_json: JSON.stringify(["BTCUSDT", "ETHUSDT"]),
    top_symbol_moves_json: JSON.stringify([
      { symbol: "BTCUSDT", change_pct: 2.1 },
    ]),
    signal_event_ids_json: JSON.stringify(["sig_late", "sig_early"]),
    market_story_ids_json: JSON.stringify(["story_late", "story_early"]),
    audit_event_count: 1,
    daily_chart_context_summary_json: JSON.stringify({
      summary: "Broad context",
    }),
    claude_status: "queued_for_analysis",
    claude_brief_id: null,
    created_at: "2026-06-20T00:10:00.000Z",
    updated_at: "2026-06-20T00:10:00.000Z",
    ...overrides,
  };
}

function signalEvent(id: string, start: string, overrides = {}) {
  const end = new Date(Date.parse(start) + 45 * 60 * 1000).toISOString();
  return {
    id,
    date_utc: start.slice(0, 10),
    event_start: start,
    event_end: end,
    duration_min: 45,
    peak_time: start,
    direction: "observed_up",
    signals_count: 4,
    n_tracked: 5,
    avg_change_pct: 1.7,
    avg_change_method: "median_participating_symbols",
    event_strength_score: 82,
    impact_label: "High",
    chart_context_score: 88,
    chart_context_label: "Strong chart context",
    event_story_type: "range_break_up",
    trend_context: "trend_up",
    momentum_context: "impulse",
    volatility_context: "expansion_after_compression",
    event_range_context: "broad_broke_high",
    chart_context_reasons_json: JSON.stringify(["range break"]),
    chart_context_warnings_json: JSON.stringify([]),
    macro_aligned: 0,
    nearest_macro_event: null,
    macro_delta_min: null,
    source_route_hint: "broad_market",
    direction_changed: 0,
    direction_history_json: "[]",
    publish_candidate: 1,
    publish_reason: "strong chart context",
    suppress_reason: null,
    detector_version: "v02",
    created_at: start,
    updated_at: start,
    ...overrides,
  };
}

function signalSymbol(signalEventId: string, symbol: string, overrides = {}) {
  return {
    id: `${signalEventId}_${symbol}`,
    signal_event_id: signalEventId,
    symbol,
    window_change_pct: symbol === "BTCUSDT" ? 2.2 : 1.4,
    peak_15m_change_pct: symbol === "BTCUSDT" ? 1.1 : 0.8,
    volume_ratio: 2.5,
    range_position: symbol === "BTCUSDT" ? "broke_high" : "inside_range",
    prev_24h_high: 100,
    prev_24h_low: 90,
    range_break_direction: symbol === "BTCUSDT" ? "up" : null,
    range_break_pct: symbol === "BTCUSDT" ? 1.2 : null,
    range_break_strength: symbol === "BTCUSDT" ? 0.7 : null,
    distance_to_range_high_pct: 0.2,
    distance_to_range_low_pct: 8.2,
    is_lead_mover: symbol === "BTCUSDT" ? 1 : 0,
    is_peak_15m_highlight: symbol === "BTCUSDT" ? 1 : 0,
    participated: 1,
    evidence_json: JSON.stringify({ source: "fixture" }),
    created_at: "2026-06-19T14:00:00.000Z",
    updated_at: "2026-06-19T14:00:00.000Z",
    ...overrides,
  };
}

function marketStory(id: string, start: string, overrides = {}) {
  const end = new Date(Date.parse(start) + 4 * 60 * 60 * 1000).toISOString();
  return {
    id,
    date_utc: start.slice(0, 10),
    story_start: start,
    story_end: end,
    duration_min: 240,
    story_label: "Range break sequence",
    story_family: "range_break",
    direction: "observed_up",
    swing_change_pct: 3.4,
    chart_context_score: 86,
    range_context_json: JSON.stringify({
      event_range_context: "broad_broke_high",
      avg_change_label: "Avg Change",
      avg_change_pct: 1.15,
      swing_score_label: "Volatility Score",
      swing_score: 42,
      per_symbol_evidence: [
        {
          symbol: "BTCUSDT",
          avg_change_label: "Avg Change",
          avg_change_pct: 1.1,
          swing_score_label: "Volatility Score",
          swing_score: 31,
          volume_ratio: 1.2,
          movement_status_label: "Movement Status",
          movement_status: "Net up",
          bar_count: 16,
        },
      ],
    }),
    trend_context_json: JSON.stringify({ trend_context: "trend_up" }),
    momentum_context_json: JSON.stringify({ momentum_type: "continuation" }),
    volatility_context_json: JSON.stringify({
      volatility_context: "expansion_after_compression",
    }),
    decision_reasons_json: JSON.stringify(["coherent range break"]),
    included_signal_event_ids_json: JSON.stringify(["sig_late"]),
    included_audit_event_ids_json: JSON.stringify(["audit_hidden"]),
    publish_candidate: 1,
    publish_reason: "range break sequence",
    suppress_reason: null,
    created_at: start,
    updated_at: start,
    ...overrides,
  };
}

function claudeBrief(
  id: string,
  targetType: string,
  targetId: string,
  overrides = {},
) {
  return {
    id,
    target_type: targetType,
    target_id: targetId,
    prompt_mode:
      targetType === "daily_overview_v02" ? "daily_overview" : "signal_event",
    status: "brief_ready",
    public_label: targetType === "daily_overview_v02" ? null : "Likely Cause",
    classification: targetType === "daily_overview_v02" ? null : "Likely Cause",
    confidence: "medium",
    headline: "Source-supported context",
    collapsed_summary: "Short context.",
    context_details: "Detailed context.",
    source_support: "medium",
    source_timing_alignment: "same_day",
    validation_flags_json: JSON.stringify({ generic_commentary_only: false }),
    detector_feedback_json: JSON.stringify({ event_quality: "keep" }),
    prompt_version: "v02-test",
    model: "claude-test",
    error_code: null,
    error_message: null,
    created_at: "2026-06-19T15:00:00.000Z",
    updated_at: "2026-06-19T15:00:00.000Z",
    ...overrides,
  };
}

function sourceReference(
  id: string,
  targetType: string,
  targetId: string,
  url: string,
  overrides = {},
) {
  return {
    id,
    target_type: targetType,
    target_id: targetId,
    brief_id: "brief_signal",
    source_role: "Likely cause source",
    source_strength: "medium",
    publisher: "Reuters",
    title: "Crypto market context",
    url,
    published_at: "2026-06-19T14:30:00.000Z",
    used_for: "likely_cause",
    accepted: 1,
    rejection_reason: null,
    metadata_json: "{}",
    created_at: "2026-06-19T15:00:00.000Z",
    ...overrides,
  };
}

test("v0.2 feed returns empty day groups when no v0.2 public rows exist", async () => {
  const { db } = createMemoryD1();
  const feed = await getIntelligenceFeedV02(db, { now });

  assert.equal(feed.ok, true);
  assert.equal(feed.version, "v02");
  assert.deepEqual(feed.day_groups, []);
});

test("v0.2 feed groups Daily Overview, Market Story, and Signal Event by day", async () => {
  const { db } = createMemoryD1({
    daily_overviews_v02: [dailyOverview()],
    market_stories_v02: [
      marketStory("story_early", "2026-06-19T01:00:00.000Z"),
      marketStory("story_late", "2026-06-19T12:00:00.000Z"),
      marketStory("story_hidden", "2026-06-19T18:00:00.000Z", {
        publish_candidate: 0,
      }),
    ],
    signal_events_v02: [
      signalEvent("sig_early", "2026-06-19T03:00:00.000Z"),
      signalEvent("sig_late", "2026-06-19T14:00:00.000Z"),
      signalEvent("sig_hidden", "2026-06-19T20:00:00.000Z", {
        publish_candidate: 0,
      }),
    ],
    signal_event_symbols_v02: [
      signalSymbol("sig_late", "BTCUSDT"),
      signalSymbol("sig_late", "ETHUSDT"),
    ],
    audit_events_v02: [
      {
        id: "audit_hidden",
        date_utc: "2026-06-19",
        event_start: "2026-06-19T10:00:00.000Z",
        event_end: "2026-06-19T10:45:00.000Z",
        duration_min: 45,
        direction: "observed_up",
        avg_change_pct: 0.9,
        signals_count: 2,
        n_tracked: 5,
        event_strength_score: 44,
        chart_context_score: 82,
        chart_context_label: "Strong chart context",
        suppress_reason: "audit_only",
        why_suppressed: "not public standalone",
        nearby_public_event_id: "sig_late",
        detector_version: "v02",
        evidence_json: "{}",
        created_at: "2026-06-19T10:00:00.000Z",
        updated_at: "2026-06-19T10:00:00.000Z",
      },
    ],
    claude_briefs_v02: [
      claudeBrief("brief_signal", "signal_event_v02", "sig_late"),
      claudeBrief("brief_daily", "daily_overview_v02", "daily_2026-06-19"),
    ],
    source_references_v02: [
      sourceReference(
        "src_signal",
        "signal_event_v02",
        "sig_late",
        "https://www.reuters.com/markets/2026/06/19/context/",
      ),
      sourceReference(
        "src_rejected",
        "signal_event_v02",
        "sig_late",
        "https://example.com/",
        { accepted: 0, rejection_reason: "root_url" },
      ),
      sourceReference(
        "src_daily",
        "daily_overview_v02",
        "daily_2026-06-19",
        "https://www.coindesk.com/markets/2026/06/19/daily-context/",
        { source_role: "Main daily context source" },
      ),
    ],
  });
  const feed = await getIntelligenceFeedV02(db, { now });
  const group = feed.day_groups[0];
  const itemTypes = group.items.map((item) => String(item.item_type));
  const marketStoryIds = group.items
    .filter((item) => item.item_type === "market_story")
    .map((item) => item.id);
  const signalIds = group.items
    .filter((item) => item.item_type === "signal_event")
    .map((item) => item.id);
  const serialized = JSON.stringify(feed);

  assert.equal(feed.global_control_label_when_expanded, "Collapse days");
  assert.equal(feed.global_control_label_when_collapsed, "Expand days");
  assert.deepEqual(itemTypes, [
    "daily_overview",
    "market_story",
    "market_story",
    "signal_event",
    "signal_event",
  ]);
  assert.deepEqual(marketStoryIds, ["story_late", "story_early"]);
  assert.deepEqual(signalIds, ["sig_late", "sig_early"]);
  assert.equal(group.default_collapsed_item_id, "daily_2026-06-19");
  assert.equal(group.hidden_item_count_when_collapsed, 4);
  assert.equal(group.expanded_control_label, "+4 events · Collapse post");
  assert.equal(group.collapsed_control_label, "+4 events · Expand post");
  assert.equal(serialized.includes("audit_hidden"), true);
  assert.equal(itemTypes.includes("audit_event"), false);
  assert.equal(serialized.includes("sig_hidden"), false);
  assert.equal(serialized.includes("story_hidden"), false);
  assert.equal(serialized.includes("https://example.com/"), false);
  assert.equal(serialized.includes("Latest only"), false);
  assert.equal(serialized.includes("Expand all"), false);
  assert.equal(serialized.includes("Collapse all"), false);
});

test("Market Story feed item stays deterministic with no Claude or sources fields", async () => {
  const { db } = createMemoryD1({
    market_stories_v02: [
      marketStory("story_public", "2026-06-19T12:00:00.000Z"),
    ],
    claude_briefs_v02: [
      claudeBrief("brief_unrelated", "signal_event_v02", "sig_late"),
    ],
    source_references_v02: [
      sourceReference(
        "src_unrelated",
        "signal_event_v02",
        "sig_late",
        "https://www.reuters.com/markets/2026/06/19/context/",
      ),
    ],
  });
  const feed = await getIntelligenceFeedV02(db, { now });
  const story = feed.day_groups[0].items[0] as unknown as Record<
    string,
    unknown
  >;
  const storyEvidence = story.per_symbol_evidence as Array<
    Record<string, unknown>
  >;
  const serialized = JSON.stringify(story);

  assert.equal(story.item_type, "market_story");
  assert.equal(story.avg_change_label, "Avg Change");
  assert.equal(story.avg_change_pct, 1.15);
  assert.equal(story.swing_score_label, "Volatility Score");
  assert.equal(story.swing_score, 42);
  assert.equal(storyEvidence[0].swing_score_label, "Volatility Score");
  assert.equal(storyEvidence[0].movement_status_label, "Movement Status");
  assert.equal(Object.hasOwn(story, "public_context_status"), false);
  assert.equal(Object.hasOwn(story, "brief_status"), false);
  assert.equal(Object.hasOwn(story, "sources"), false);
  assert.equal(Object.hasOwn(story, "brief"), false);
  assert.equal(serialized.includes("Focused Cause"), false);
  assert.equal(serialized.includes("Likely Cause"), false);
  assert.equal(serialized.includes("Market Backdrop"), false);
  assert.equal(serialized.includes("No Clear Cause"), false);
  assert.equal(serialized.includes("Claude Limited"), false);
});

test("Signal Event feed item exposes evidence labels, highlights, brief, and accepted sources", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [
      signalEvent("sig_late", "2026-06-19T14:00:00.000Z", {
        direction_changed: 1,
        direction_history_json: JSON.stringify([
          { direction: "observed_down", at: "2026-06-19T14:15:00.000Z" },
          { direction: "observed_up", at: "2026-06-19T14:45:00.000Z" },
        ]),
      }),
    ],
    signal_event_symbols_v02: [
      signalSymbol("sig_late", "BTCUSDT"),
      signalSymbol("sig_late", "ETHUSDT"),
    ],
    claude_briefs_v02: [
      claudeBrief("brief_signal", "signal_event_v02", "sig_late"),
    ],
    source_references_v02: [
      sourceReference(
        "src_signal",
        "signal_event_v02",
        "sig_late",
        "https://www.reuters.com/markets/2026/06/19/context/",
      ),
    ],
  });
  const feed = await getIntelligenceFeedV02(db, { now });
  const signal = feed.day_groups[0].items[0];

  assert.equal(signal.item_type, "signal_event");
  if (signal.item_type !== "signal_event") {
    throw new Error("expected signal item");
  }

  assert.equal(signal.avg_change_label, "Avg Change");
  assert.equal(signal.direction_changed, true);
  assert.deepEqual(signal.direction_history, [
    { direction: "observed_down", at: "2026-06-19T14:15:00.000Z" },
    { direction: "observed_up", at: "2026-06-19T14:45:00.000Z" },
  ]);
  assert.equal(
    signal.per_symbol_evidence[0].window_change_label,
    "Window Change",
  );
  assert.equal(
    signal.per_symbol_evidence[0].range_position_label,
    "Range Position",
  );
  assert.equal(
    signal.per_symbol_evidence[0].range_position_display,
    "Broke high",
  );
  assert.equal(signal.lead_mover_symbol, "BTCUSDT");
  assert.equal(signal.strongest_peak_symbol, "BTCUSDT");
  assert.deepEqual(signal.highlight_cells, [
    { symbol: "BTCUSDT", column: "symbol", reason: "lead_mover" },
    {
      symbol: "BTCUSDT",
      column: "peak_15m",
      reason: "strongest_peak_15m",
    },
  ]);
  assert.equal(signal.brief?.public_label, "Likely Cause");
  assert.equal(signal.public_context_status, "brief_ready");
  assert.equal(Object.hasOwn(signal.brief ?? {}, "validation_flags"), false);
  assert.equal(Object.hasOwn(signal.brief ?? {}, "detector_feedback"), false);
  assert.equal(signal.sources.length, 1);
  assert.equal(
    signal.sources[0].url,
    "https://www.reuters.com/markets/2026/06/19/context/",
  );
});

test("Signal Event feed item keeps in-window and nearby Backdrop sources but hides stale sources", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_late", "2026-06-19T14:00:00.000Z")],
    claude_briefs_v02: [
      claudeBrief("brief_signal", "signal_event_v02", "sig_late"),
    ],
    source_references_v02: [
      // In the 6h window (08:00–14:45) → kept.
      sourceReference(
        "src_a_in_window",
        "signal_event_v02",
        "sig_late",
        "https://www.reuters.com/markets/2026/06/19/in-window-context/",
        {
          published_at: "2026-06-19T14:30:00.000Z",
          source_role: "Backdrop source",
          used_for: "backdrop",
        },
      ),
      // Same UTC day but outside the window → kept as Backdrop (Market Backdrop).
      sourceReference(
        "src_b_same_day_backdrop",
        "signal_event_v02",
        "sig_late",
        "https://blockchainreporter.net/markets/2026/06/19/roundup/",
        {
          published_at: "2026-06-19T02:00:00.000Z",
          source_role: "Backdrop source",
          used_for: "backdrop",
          metadata_json: JSON.stringify({ catalyst_time_utc: null }),
        },
      ),
      // Published after the event but with an in-window catalyst time → kept.
      sourceReference(
        "src_c_later_with_catalyst",
        "signal_event_v02",
        "sig_late",
        "https://www.reuters.com/markets/2026/06/19/later-with-catalyst/",
        {
          published_at: "2026-06-19T18:00:00.000Z",
          source_role: "Likely cause source",
          used_for: "likely_cause",
          metadata_json: JSON.stringify({
            catalyst_time_utc: "2026-06-19T13:30:00.000Z",
          }),
        },
      ),
      // Nearby next-day recap within the accepted Backdrop window.
      sourceReference(
        "src_b_next_day_backdrop",
        "signal_event_v02",
        "sig_late",
        "https://finance.yahoo.com/markets/crypto/articles/next-day-market-recap.html",
        {
          published_at: "2026-06-20T02:00:00.000Z",
          source_role: "Backdrop source",
          used_for: "backdrop",
          metadata_json: JSON.stringify({
            catalyst_time_utc: null,
          }),
        },
      ),
      sourceReference(
        "src_e_prior_day",
        "signal_event_v02",
        "sig_late",
        "https://www.reuters.com/markets/2026/06/17/prior-day-context/",
        {
          published_at: "2026-06-17T02:00:00.000Z",
          source_role: "Backdrop source",
          used_for: "backdrop",
          metadata_json: JSON.stringify({
            catalyst_time_utc: "2026-06-17T02:00:00.000Z",
          }),
        },
      ),
    ],
  });
  const feed = await getIntelligenceFeedV02(db, { now });
  const signal = feed.day_groups[0].items[0];

  assert.equal(signal.item_type, "signal_event");
  if (signal.item_type !== "signal_event") {
    throw new Error("expected signal item");
  }

  assert.deepEqual(
    signal.sources.map((source) => source.url).sort(),
    [
      "https://blockchainreporter.net/markets/2026/06/19/roundup/",
      "https://finance.yahoo.com/markets/crypto/articles/next-day-market-recap.html",
      "https://www.reuters.com/markets/2026/06/19/in-window-context/",
    ].sort(),
  );
});

test("Signal Event feed item keeps Market Backdrop copy with a nearby Backdrop source", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [
      signalEvent("sig_backdrop_recap", "2026-06-19T14:00:00.000Z"),
    ],
    claude_briefs_v02: [
      claudeBrief("brief_signal", "signal_event_v02", "sig_backdrop_recap", {
        status: "context_only",
        public_label: "Market Backdrop",
        classification: "Market Backdrop",
        headline: "Crypto moved against a broader risk backdrop",
        collapsed_summary:
          "A near next-day recap described broader risk-off conditions around the same UTC-day move.",
        source_support: "low",
        source_timing_alignment: "broad",
      }),
    ],
    source_references_v02: [
      sourceReference(
        "src_next_day_backdrop",
        "signal_event_v02",
        "sig_backdrop_recap",
        "https://finance.yahoo.com/markets/crypto/articles/next-day-risk-recap.html",
        {
          published_at: "2026-06-20T02:00:00.000Z",
          source_role: "Backdrop source",
          used_for: "backdrop",
          accepted: 1,
          metadata_json: JSON.stringify({
            catalyst_time_utc: null,
            timing_policy_note: "signal_source_nearby_backdrop_recap",
          }),
        },
      ),
    ],
  });
  const feed = await getIntelligenceFeedV02(db, { now });
  const signal = feed.day_groups[0].items[0];

  assert.equal(signal.item_type, "signal_event");
  if (signal.item_type !== "signal_event") {
    throw new Error("expected signal item");
  }

  assert.equal(signal.sources.length, 1);
  assert.equal(signal.sources[0].tag, "Backdrop source");
  assert.equal(signal.brief?.public_label, "Market Backdrop");
  assert.equal(signal.brief?.classification, "Market Backdrop");
  assert.match(signal.brief?.collapsed_summary ?? "", /risk-off conditions/);
});

test("Signal Event feed item preserves source-free No Clear Cause analysis", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [
      signalEvent("sig_no_source", "2026-06-19T14:00:00.000Z", {
        direction: "observed_down",
        avg_change_pct: -1.4,
      }),
    ],
    claude_briefs_v02: [
      claudeBrief("brief_signal", "signal_event_v02", "sig_no_source", {
        status: "no_clear_cause",
        public_label: "No Clear Cause",
        classification: "No Clear Cause",
        headline: "No clear cause in the evidence window",
        collapsed_summary:
          "Claude did not find a reliable public explanation for this Signal Event.",
        source_support: "none",
        source_timing_alignment: "none",
      }),
    ],
    source_references_v02: [
      sourceReference(
        "src_stale",
        "signal_event_v02",
        "sig_no_source",
        "https://www.reuters.com/markets/2026/06/17/stale-context/",
        {
          published_at: "2026-06-17T02:00:00.000Z",
          source_role: "Backdrop source",
          used_for: "backdrop",
          accepted: 1,
          metadata_json: JSON.stringify({
            catalyst_time_utc: "2026-06-17T02:00:00.000Z",
          }),
        },
      ),
    ],
  });
  const feed = await getIntelligenceFeedV02(db, { now });
  const signal = feed.day_groups[0].items[0];

  assert.equal(signal.item_type, "signal_event");
  if (signal.item_type !== "signal_event") {
    throw new Error("expected signal item");
  }

  assert.equal(signal.sources.length, 0);
  assert.equal(signal.brief?.headline, "No clear cause in the evidence window");
  assert.match(
    signal.brief?.collapsed_summary ?? "",
    /did not find a reliable public explanation/,
  );
  assert.equal(signal.brief?.source_support, "none");
  assert.equal(signal.brief?.source_timing_alignment, "none");
});

test("Signal Event feed item replaces source-referencing No Clear Cause copy when no sources survive", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [
      signalEvent("sig_no_clear_sourcey", "2026-06-19T14:00:00.000Z"),
    ],
    claude_briefs_v02: [
      claudeBrief("brief_signal", "signal_event_v02", "sig_no_clear_sourcey", {
        status: "no_clear_cause",
        public_label: "No Clear Cause",
        classification: "No Clear Cause",
        headline: "No time-aligned public source",
        collapsed_summary:
          "No time-aligned public source was accepted for this signal event. Reuters described a possible Fed catalyst in an older article.",
        context_details:
          "Reuters and other articles did not line up with this Signal Event.",
        source_support: "none",
        source_timing_alignment: "none",
      }),
    ],
    source_references_v02: [
      sourceReference(
        "src_rejected",
        "signal_event_v02",
        "sig_no_clear_sourcey",
        "https://www.reuters.com/markets/2026/06/17/old-context/",
        {
          published_at: "2026-06-17T02:00:00.000Z",
          source_role: "Backdrop source",
          accepted: 0,
          rejection_reason: "signal_source_outside_6h_event_window",
        },
      ),
    ],
  });
  const feed = await getIntelligenceFeedV02(db, { now });
  const signal = feed.day_groups[0].items[0];

  assert.equal(signal.item_type, "signal_event");
  if (signal.item_type !== "signal_event") {
    throw new Error("expected signal item");
  }

  assert.equal(signal.sources.length, 0);
  assert.equal(signal.brief?.headline, "No clear public catalyst");
  assert.match(
    signal.brief?.collapsed_summary ?? "",
    /range break upside pressure across 4\/5 tracked symbols/,
  );
  assert.equal(signal.brief?.context_details, null);
  assert.equal(
    /source|article|publisher|Reuters|Fed/i.test(
      `${signal.brief?.headline ?? ""} ${signal.brief?.collapsed_summary ?? ""} ${signal.brief?.context_details ?? ""}`,
    ),
    false,
  );
});

test("Signal Event with high source_support but zero in-window rows drops to No Clear Cause", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [
      signalEvent("sig_drift", "2026-06-19T14:00:00.000Z", {
        direction: "observed_up",
        avg_change_pct: 2.1,
      }),
    ],
    claude_briefs_v02: [
      claudeBrief("brief_signal", "signal_event_v02", "sig_drift", {
        public_label: "Likely Cause",
        classification: "Likely Cause",
        headline: "Fed decision drove the rally",
        collapsed_summary:
          "Reuters reported a Fed decision that drove this Signal Event higher.",
        source_support: "high",
        source_timing_alignment: "exact",
      }),
    ],
    source_references_v02: [
      sourceReference(
        "src_out_of_window",
        "signal_event_v02",
        "sig_drift",
        "https://www.reuters.com/markets/2026/06/19/old-context/",
        {
          published_at: "2026-06-19T02:00:00.000Z",
          source_role: "Likely cause source",
          used_for: "likely_cause",
          accepted: 1,
          metadata_json: JSON.stringify({
            catalyst_time_utc: "2026-06-19T02:00:00.000Z",
          }),
        },
      ),
    ],
  });
  const feed = await getIntelligenceFeedV02(db, { now });
  const signal = feed.day_groups[0].items[0];

  assert.equal(signal.item_type, "signal_event");
  if (signal.item_type !== "signal_event") {
    throw new Error("expected signal item");
  }

  // The feed window filter drops the only (stale) row, so the stored
  // high-support news brief must NOT survive — it is rewritten to No Clear Cause
  // even though source_support/source_timing_alignment were not "none".
  assert.equal(signal.sources.length, 0);
  assert.equal(signal.brief?.public_label, "No Clear Cause");
  assert.equal(signal.brief?.classification, "No Clear Cause");
  assert.equal(signal.brief?.headline, "No clear public catalyst");
  assert.match(
    signal.brief?.collapsed_summary ?? "",
    /range break upside pressure across 4\/5 tracked symbols/,
  );
  assert.match(signal.brief?.collapsed_summary ?? "", /Avg Change \+2\.10%/);
  assert.equal(
    (signal.brief?.collapsed_summary ?? "").includes("Fed decision"),
    false,
  );
  assert.equal(
    (signal.brief?.collapsed_summary ?? "").includes("Reuters"),
    false,
  );
  assert.equal(
    /source|article|publisher/i.test(signal.brief?.collapsed_summary ?? ""),
    false,
  );
});

test("Signal Event source window uses 6h-before-event-start bounds", async () => {
  const { db } = createMemoryD1({
    // Event 14:00–14:45 UTC → allowed source window starts at 08:00 UTC.
    signal_events_v02: [signalEvent("sig_bounds", "2026-06-19T14:00:00.000Z")],
    claude_briefs_v02: [
      claudeBrief("brief_signal", "signal_event_v02", "sig_bounds"),
    ],
    source_references_v02: [
      sourceReference(
        "src_inside_window",
        "signal_event_v02",
        "sig_bounds",
        "https://www.reuters.com/markets/2026/06/19/inside/",
        {
          published_at: "2026-06-19T08:30:00.000Z",
          source_role: "Likely cause source",
          used_for: "likely_cause",
          metadata_json: JSON.stringify({ catalyst_time_utc: null }),
        },
      ),
      sourceReference(
        "src_just_before_window",
        "signal_event_v02",
        "sig_bounds",
        "https://www.reuters.com/markets/2026/06/19/just-before/",
        {
          published_at: "2026-06-19T07:30:00.000Z",
          source_role: "Likely cause source",
          used_for: "likely_cause",
          metadata_json: JSON.stringify({ catalyst_time_utc: null }),
        },
      ),
    ],
  });
  const feed = await getIntelligenceFeedV02(db, { now });
  const signal = feed.day_groups[0].items[0];

  assert.equal(signal.item_type, "signal_event");
  if (signal.item_type !== "signal_event") {
    throw new Error("expected signal item");
  }

  // Only the row at/after eventStart-6h survives; the one 30m earlier is dropped.
  assert.deepEqual(
    signal.sources.map((source) => source.url),
    ["https://www.reuters.com/markets/2026/06/19/inside/"],
  );
});

test("Daily Overview sources stay within the UTC day plus a short overnight lookback", async () => {
  const { db } = createMemoryD1({
    // day_start 2026-06-19T00:00 → source window starts 2026-06-18T18:00.
    daily_overviews_v02: [dailyOverview()],
    claude_briefs_v02: [
      claudeBrief("brief_daily", "daily_overview_v02", "daily_2026-06-19"),
    ],
    source_references_v02: [
      sourceReference(
        "src_in_day",
        "daily_overview_v02",
        "daily_2026-06-19",
        "https://www.coindesk.com/markets/2026/06/19/in-day/",
        {
          source_role: "Main daily context source",
          used_for: "daily_context",
          published_at: "2026-06-19T10:00:00.000Z",
        },
      ),
      sourceReference(
        "src_prior_evening",
        "daily_overview_v02",
        "daily_2026-06-19",
        "https://www.coindesk.com/markets/2026/06/18/prior-evening/",
        {
          source_role: "Backdrop source",
          used_for: "backdrop",
          published_at: "2026-06-18T21:00:00.000Z",
        },
      ),
      sourceReference(
        "src_two_days_old",
        "daily_overview_v02",
        "daily_2026-06-19",
        "https://www.coindesk.com/markets/2026/06/17/two-days-old/",
        {
          source_role: "Backdrop source",
          used_for: "backdrop",
          published_at: "2026-06-17T12:00:00.000Z",
        },
      ),
    ],
  });
  const feed = await getIntelligenceFeedV02(db, { now });
  const daily = feed.day_groups[0].items[0];

  assert.equal(daily.item_type, "daily_overview");
  if (daily.item_type !== "daily_overview") {
    throw new Error("expected daily overview item");
  }

  // In-day and late-prior-evening kept; the two-days-old source is dropped.
  assert.deepEqual(
    daily.sources.map((source) => source.url).sort(),
    [
      "https://www.coindesk.com/markets/2026/06/18/prior-evening/",
      "https://www.coindesk.com/markets/2026/06/19/in-day/",
    ].sort(),
  );
});

test("Daily Overview public brief hides stored web-search-limit prose", async () => {
  const { db } = createMemoryD1({
    daily_overviews_v02: [dailyOverview()],
    claude_briefs_v02: [
      claudeBrief("brief_day", "daily_overview_v02", "daily_2026-06-19", {
        headline: "Daily context",
        collapsed_summary:
          "External source validation could not be completed this session due to a web search tool limit error.",
        context_details:
          "This context could not be completed because web search was exhausted.",
      }),
    ],
  });
  const feed = await getIntelligenceFeedV02(db, { now });
  const daily = feed.day_groups[0].items[0];

  assert.equal(daily.item_type, "daily_overview");
  if (daily.item_type !== "daily_overview") {
    throw new Error("expected daily overview item");
  }

  assert.equal(daily.brief?.headline, "Daily context");
  assert.equal(daily.brief?.collapsed_summary, null);
  assert.equal(daily.brief?.context_details, null);
  assert.equal(daily.sources.length, 0);
});

test("public sources expose catalyst_time_utc from metadata", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_cat", "2026-06-19T14:00:00.000Z")],
    claude_briefs_v02: [
      claudeBrief("brief_signal", "signal_event_v02", "sig_cat"),
    ],
    source_references_v02: [
      sourceReference(
        "src_cat",
        "signal_event_v02",
        "sig_cat",
        "https://www.reuters.com/markets/2026/06/19/catalyst/",
        {
          published_at: "2026-06-19T18:00:00.000Z",
          source_role: "Likely cause source",
          used_for: "likely_cause",
          metadata_json: JSON.stringify({
            catalyst_time_utc: "2026-06-19T13:30:00.000Z",
          }),
        },
      ),
    ],
  });
  const feed = await getIntelligenceFeedV02(db, { now });
  const signal = feed.day_groups[0].items[0];

  assert.equal(signal.item_type, "signal_event");
  if (signal.item_type !== "signal_event") {
    throw new Error("expected signal item");
  }

  assert.equal(signal.sources.length, 1);
  assert.equal(signal.sources[0].published_at, "2026-06-19T18:00:00.000Z");
  assert.equal(signal.sources[0].catalyst_time_utc, "2026-06-19T13:30:00.000Z");
});

test("acceptance: feed surfaces each accepted source with its own role and preserved timestamps", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_acc", "2026-06-19T14:00:00.000Z")],
    daily_overviews_v02: [dailyOverview()],
    claude_briefs_v02: [
      claudeBrief("brief_sig", "signal_event_v02", "sig_acc", {
        public_label: "Focused Cause",
        classification: "Focused Cause",
      }),
      claudeBrief("brief_day", "daily_overview_v02", "daily_2026-06-19"),
    ],
    source_references_v02: [
      // Focused catalyst with an in-window catalyst_time_utc → stays Focused.
      sourceReference(
        "src_focused",
        "signal_event_v02",
        "sig_acc",
        "https://www.reuters.com/markets/2026/06/19/focused/",
        {
          source_role: "Focused catalyst source",
          used_for: "focused_catalyst",
          published_at: "2026-06-19T18:00:00.000Z",
          metadata_json: JSON.stringify({
            catalyst_time_utc: "2026-06-19T13:30:00.000Z",
          }),
        },
      ),
      // Same-day backdrop → stays Backdrop.
      sourceReference(
        "src_backdrop",
        "signal_event_v02",
        "sig_acc",
        "https://blockchainreporter.net/markets/2026/06/19/roundup/",
        {
          source_role: "Backdrop source",
          used_for: "backdrop",
          published_at: "2026-06-19T02:00:00.000Z",
        },
      ),
      // Price check, no publication time → stays Price check.
      sourceReference(
        "src_price",
        "signal_event_v02",
        "sig_acc",
        "https://example.com/price/live",
        {
          source_role: "Price check source",
          used_for: "price_check",
          published_at: null,
        },
      ),
      sourceReference(
        "src_daily_main",
        "daily_overview_v02",
        "daily_2026-06-19",
        "https://nexo.com/markets/2026/06/19/main/",
        {
          source_role: "Main daily context source",
          used_for: "daily_context",
          published_at: "2026-06-19T09:30:00.000Z",
        },
      ),
      sourceReference(
        "src_daily_support",
        "daily_overview_v02",
        "daily_2026-06-19",
        "https://www.coindesk.com/markets/2026/06/19/support/",
        {
          source_role: "Supporting daily source",
          used_for: "supporting_daily",
          published_at: "2026-06-19T11:00:00.000Z",
        },
      ),
    ],
  });
  const feed = await getIntelligenceFeedV02(db, { now });
  const items = feed.day_groups[0].items;
  const signal = items.find((item) => item.item_type === "signal_event");
  const daily = items.find((item) => item.item_type === "daily_overview");

  assert.ok(signal && signal.item_type === "signal_event");
  assert.ok(daily && daily.item_type === "daily_overview");
  if (
    signal.item_type !== "signal_event" ||
    daily.item_type !== "daily_overview"
  ) {
    throw new Error("expected signal and daily items");
  }

  // Signal: each role is preserved (not flattened to Backdrop).
  assert.deepEqual(signal.sources.map((source) => source.tag).sort(), [
    "Backdrop source",
    "Focused catalyst source",
    "Price check source",
  ]);
  const focused = signal.sources.find(
    (source) => source.tag === "Focused catalyst source",
  );
  assert.equal(focused?.published_at, "2026-06-19T18:00:00.000Z");
  assert.equal(focused?.catalyst_time_utc, "2026-06-19T13:30:00.000Z");
  const price = signal.sources.find(
    (source) => source.tag === "Price check source",
  );
  assert.equal(price?.published_at, null);

  // Daily: Main + Supporting roles preserved.
  assert.deepEqual(daily.sources.map((source) => source.tag).sort(), [
    "Main daily context source",
    "Supporting daily source",
  ]);
});

test("v0.2 public feed limits accepted sources to three", async () => {
  const { db } = createMemoryD1({
    daily_overviews_v02: [dailyOverview()],
    claude_briefs_v02: [
      claudeBrief("brief_daily", "daily_overview_v02", "daily_2026-06-19"),
    ],
    source_references_v02: [1, 2, 3, 4, 5].map((index) =>
      sourceReference(
        `src_daily_${index}`,
        "daily_overview_v02",
        "daily_2026-06-19",
        `https://www.coindesk.com/markets/2026/06/19/daily-context-${index}/`,
        {
          source_role:
            index === 1
              ? "Main daily context source"
              : "Supporting daily source",
          used_for: index === 1 ? "daily_context" : "supporting_daily",
          published_at: `2026-06-19T1${index}:00:00.000Z`,
          created_at: `2026-06-19T1${index}:10:00.000Z`,
        },
      ),
    ),
  });
  const feed = await getIntelligenceFeedV02(db, { now });
  const daily = feed.day_groups[0].items[0];

  assert.equal(daily.item_type, "daily_overview");
  if (daily.item_type !== "daily_overview") {
    throw new Error("expected daily overview item");
  }

  assert.equal(daily.sources.length, 3);
});

test("Daily Overview feed item uses daily labels and actual v0.2 Claude/source rows only", async () => {
  const { db } = createMemoryD1({
    daily_overviews_v02: [dailyOverview()],
    claude_briefs_v02: [
      claudeBrief("brief_daily", "daily_overview_v02", "daily_2026-06-19", {
        public_label: "Focused Cause",
        classification: "Focused Cause",
      }),
    ],
    source_references_v02: [
      sourceReference(
        "src_daily",
        "daily_overview_v02",
        "daily_2026-06-19",
        "https://www.coindesk.com/markets/2026/06/19/daily-context/",
        { source_role: "Main daily context source" },
      ),
    ],
  });
  const feed = await getIntelligenceFeedV02(db, { now });
  const daily = feed.day_groups[0].items[0];

  assert.equal(daily.item_type, "daily_overview");
  if (daily.item_type !== "daily_overview") {
    throw new Error("expected daily overview item");
  }

  assert.equal(daily.daily_change_label, "24h Change");
  assert.equal(daily.daily_label, "Daily Overview");
  assert.equal(daily.public_context_status, "brief_ready");
  assert.equal(daily.chart.chart_highlight_type, "day_window");
  assert.equal(daily.sources.length, 1);
  assert.equal(daily.sources[0].tag, "Main daily context source");
});

test("current day default collapsed item uses latest item when Daily Overview is absent", async () => {
  const { db } = createMemoryD1({
    market_stories_v02: [
      marketStory("story_current", "2026-06-21T04:00:00.000Z"),
    ],
    signal_events_v02: [signalEvent("sig_current", "2026-06-21T09:00:00.000Z")],
  });
  const feed = await getIntelligenceFeedV02(db, { now });
  const group = feed.day_groups[0];

  assert.equal(group.is_current_utc_day, true);
  assert.equal(group.default_collapsed_item_id, "sig_current");
  assert.equal(group.hidden_item_count_when_collapsed, 1);
});
