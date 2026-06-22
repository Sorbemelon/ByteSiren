import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryD1 } from "../../test/d1Memory.ts";
import {
  buildDailyOverviewClaudePayloadsV02,
  buildDailyOverviewPromptV02,
  buildSignalEventClaudePayloadsV02,
  buildSignalEventPromptV02,
  toSourceReferenceInputsV02,
  validateClaudeResultV02,
  validateDailyOverviewClaudeResultV02,
  validateSignalEventClaudeResultV02,
} from "./index.ts";

const now = new Date("2026-06-21T12:00:00.000Z");

function signalEvent(id = "sig_public") {
  return {
    id,
    date_utc: "2026-06-19",
    event_start: "2026-06-19T14:00:00.000Z",
    event_end: "2026-06-19T14:45:00.000Z",
    duration_min: 45,
    peak_time: "2026-06-19T14:15:00.000Z",
    direction: "observed_up",
    signals_count: 4,
    n_tracked: 5,
    avg_change_pct: 1.8,
    avg_change_method: "median_participating_symbols",
    event_strength_score: 84,
    impact_label: "High",
    chart_context_score: 88,
    chart_context_label: "Strong chart context",
    event_story_type: "range_break_up",
    trend_context: "trend_up",
    momentum_context: "impulse",
    volatility_context: "volatility_expansion",
    event_range_context: "broad_broke_high",
    chart_context_reasons_json: JSON.stringify(["broad range break"]),
    chart_context_warnings_json: JSON.stringify([]),
    macro_aligned: 0,
    nearest_macro_event: null,
    macro_delta_min: null,
    source_route_hint: "broad_market",
    publish_candidate: 1,
    publish_reason: "strong chart context",
    suppress_reason: null,
    detector_version: "v02",
    created_at: "2026-06-19T14:00:00.000Z",
    updated_at: "2026-06-19T14:00:00.000Z",
  };
}

function signalSymbol(signalEventId: string, symbol = "BTCUSDT") {
  return {
    id: `${signalEventId}_${symbol}`,
    signal_event_id: signalEventId,
    symbol,
    window_change_pct: 2.1,
    peak_15m_change_pct: 1.2,
    volume_ratio: 2.6,
    range_position: "broke_high",
    prev_24h_high: 100,
    prev_24h_low: 90,
    range_break_direction: "up",
    range_break_pct: 0.8,
    range_break_strength: 0.7,
    distance_to_range_high_pct: 0.1,
    distance_to_range_low_pct: 9.2,
    is_lead_mover: 1,
    is_peak_15m_highlight: 1,
    participated: 1,
    evidence_json: "{}",
    created_at: "2026-06-19T14:00:00.000Z",
    updated_at: "2026-06-19T14:00:00.000Z",
  };
}

function dailyOverview() {
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
    top_symbol_moves_json: JSON.stringify([{ symbol: "BTCUSDT" }]),
    signal_event_ids_json: JSON.stringify(["sig_public"]),
    market_story_ids_json: JSON.stringify(["story_public"]),
    audit_event_count: 2,
    daily_chart_context_summary_json: JSON.stringify({
      story_count: 1,
    }),
    claude_status: "queued_for_analysis",
    claude_brief_id: null,
    created_at: "2026-06-20T00:10:00.000Z",
    updated_at: "2026-06-20T00:10:00.000Z",
  };
}

function marketStory() {
  return {
    id: "story_public",
    date_utc: "2026-06-19",
    story_start: "2026-06-19T12:00:00.000Z",
    story_end: "2026-06-19T18:00:00.000Z",
    duration_min: 360,
    story_label: "Range break sequence",
    story_family: "range_break",
    direction: "observed_up",
    swing_change_pct: 3.4,
    chart_context_score: 86,
    range_context_json: JSON.stringify({ swing_score: 0.42 }),
    trend_context_json: "{}",
    momentum_context_json: "{}",
    volatility_context_json: "{}",
    decision_reasons_json: JSON.stringify(["coherent range break"]),
    included_signal_event_ids_json: JSON.stringify(["sig_public"]),
    included_audit_event_ids_json: JSON.stringify(["audit_strong"]),
    publish_candidate: 1,
    publish_reason: "story criteria",
    suppress_reason: null,
    created_at: "2026-06-19T18:00:00.000Z",
    updated_at: "2026-06-19T18:00:00.000Z",
  };
}

function validSignalResult() {
  return {
    mode: "signal_event",
    item_id: "sig_public",
    classification: "Focused Cause",
    confidence: "high",
    headline: "Source-supported catalyst",
    collapsed_summary: "A source-supported event lined up with the move.",
    context_details: "The public context was time-aligned with the event.",
    why_this_classification: "A focused source matched the event window.",
    source_support: "high",
    source_timing_alignment: "exact",
    sources: [
      {
        title: "Crypto market context",
        publisher: "Reuters",
        url: "https://www.reuters.com/markets/2026/06/19/context/",
        published_at: "2026-06-19T14:20:00.000Z",
        tag: "Focused catalyst source",
        why_relevant: "Time-aligned catalyst context.",
      },
    ],
    rejected_or_ignored_source_notes: [],
    validation_flags: { has_focused_source: true },
    detector_feedback: { event_quality: "keep" },
  };
}

function validDailyResult() {
  return {
    mode: "daily_overview",
    item_id: "daily_2026-06-19",
    date_utc: "2026-06-19",
    daily_label: "Daily Context",
    confidence: "medium",
    headline: "Daily crypto context",
    collapsed_summary: "The day had broad crypto market context.",
    context_details: "Sources described the day-level context.",
    market_tone_summary: "Volatile but source-supported.",
    notable_drivers: [
      {
        driver: "Macro backdrop",
        source_support: "medium",
        why_relevant: "Same-day public context.",
      },
    ],
    sources: [
      {
        title: "Daily crypto market context",
        publisher: "CoinDesk",
        url: "https://www.coindesk.com/markets/2026/06/19/daily-context/",
        published_at: "2026-06-19T20:00:00.000Z",
        tag: "Main daily context source",
        why_relevant: "Same-day daily context.",
      },
    ],
    validation_flags: { no_major_driver_found: false },
    detector_feedback: { daily_overview_quality: "useful" },
  };
}

test("Signal Event payload builder emits v0.2 evidence labels and chart context", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [signalEvent()],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
  });
  const payloads = await buildSignalEventClaudePayloadsV02(db, { now });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].mode, "signal_event");
  assert.equal(payloads[0].target_type, "signal_event_v02");
  assert.equal(payloads[0].avg_change_label, "Avg Change");
  assert.equal(payloads[0].evidence_window.duration_min, 45);
  assert.equal(
    payloads[0].per_symbol_evidence[0].window_change_label,
    "Window Change",
  );
  assert.equal(
    payloads[0].per_symbol_evidence[0].range_position_label,
    "Range Position",
  );
  assert.equal(
    payloads[0].chart_context.chart_context_label,
    "Strong chart context",
  );
  assert.equal(payloads[0].no_trading_advice, true);
});

test("Daily Overview payload builder emits 24h Change and deterministic Market Story context", async () => {
  const { db } = createMemoryD1({
    daily_overviews_v02: [dailyOverview()],
    market_stories_v02: [marketStory()],
  });
  const payloads = await buildDailyOverviewClaudePayloadsV02(db, { now });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].mode, "daily_overview");
  assert.equal(payloads[0].target_type, "daily_overview_v02");
  assert.equal(payloads[0].daily_change_label, "24h Change");
  assert.deepEqual(payloads[0].signal_event_ids_for_day, ["sig_public"]);
  assert.deepEqual(payloads[0].market_story_ids_for_day, ["story_public"]);
  assert.equal(payloads[0].market_stories_for_day[0].id, "story_public");
  assert.equal(payloads[0].market_stories_for_day[0].swing_score, 0.42);
  assert.equal(payloads[0].no_trading_advice, true);
});

test("prompt builders include v0.2 label rules and JSON-only safety", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [signalEvent()],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
    daily_overviews_v02: [dailyOverview()],
  });
  const signalPayload = (
    await buildSignalEventClaudePayloadsV02(db, { now })
  )[0];
  const dailyPayload = (
    await buildDailyOverviewClaudePayloadsV02(db, { now })
  )[0];
  const signalPrompt = buildSignalEventPromptV02(signalPayload);
  const dailyPrompt = buildDailyOverviewPromptV02(dailyPayload);

  assert.match(signalPrompt, /Focused Cause/);
  assert.match(signalPrompt, /Likely Cause/);
  assert.match(signalPrompt, /Market Backdrop/);
  assert.match(signalPrompt, /No Clear Cause/);
  assert.match(signalPrompt, /Claude Limited/);
  assert.match(signalPrompt, /chart context only as descriptive evidence/i);
  assert.match(signalPrompt, /Return JSON only/);
  assert.match(dailyPrompt, /Daily Context/);
  assert.match(dailyPrompt, /Quiet Day/);
  assert.match(dailyPrompt, /No Major Driver/);
  assert.match(dailyPrompt, /Do not use Signal Event cause labels/);
  assert.match(dailyPrompt, /Do not provide trading advice/);
});

test("v0.2 validators accept Signal and Daily results but reject crossed labels and Market Story mode", () => {
  const signal = validateSignalEventClaudeResultV02(validSignalResult());
  const daily = validateDailyOverviewClaudeResultV02(validDailyResult());

  assert.equal(signal.classification, "Focused Cause");
  assert.equal(daily.daily_label, "Daily Context");
  assert.throws(() =>
    validateSignalEventClaudeResultV02({
      ...validSignalResult(),
      classification: "Quiet Day",
    }),
  );
  assert.throws(() =>
    validateDailyOverviewClaudeResultV02({
      ...validDailyResult(),
      daily_label: "Focused Cause",
    }),
  );
  assert.throws(() => validateClaudeResultV02({ mode: "market_story" }));
});

test("v0.2 Signal Event cause labels require matching source tags", () => {
  assert.throws(() =>
    validateSignalEventClaudeResultV02({
      ...validSignalResult(),
      classification: "Focused Cause",
      sources: [
        {
          title: "Backdrop",
          publisher: "Reuters",
          url: "https://www.reuters.com/markets/2026/06/19/backdrop/",
          published_at: "2026-06-19T14:20:00.000Z",
          tag: "Backdrop source",
          why_relevant: "Backdrop only.",
        },
      ],
    }),
  );
  assert.throws(() =>
    validateSignalEventClaudeResultV02({
      ...validSignalResult(),
      classification: "Likely Cause",
      sources: [
        {
          title: "Price check",
          publisher: "CoinDesk",
          url: "https://www.coindesk.com/markets/2026/06/19/price-check/",
          published_at: "2026-06-19T14:20:00.000Z",
          tag: "Price check source",
          why_relevant: "Price confirmation only.",
        },
      ],
    }),
  );
});

test("v0.2 source policy rejects root URLs and disallows Market Story targets", () => {
  const signalResult = validateSignalEventClaudeResultV02(validSignalResult());
  const result = toSourceReferenceInputsV02({
    target_type: "signal_event_v02",
    target_id: "sig_public",
    sources: signalResult.sources,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].accepted, true);
  assert.equal(
    result[0].url,
    "https://www.reuters.com/markets/2026/06/19/context/",
  );
  assert.deepEqual(
    toSourceReferenceInputsV02({
      target_type: "signal_event_v02",
      target_id: "sig_public",
      sources: [
        {
          title: "CoinDesk homepage",
          publisher: "CoinDesk",
          url: "https://www.coindesk.com/",
          published_at: null,
          tag: "Backdrop source",
          why_relevant: "Root URL should be rejected.",
        },
      ],
      includeRejected: true,
    }).map((source) => source.accepted),
    [false],
  );
  assert.throws(() =>
    toSourceReferenceInputsV02({
      target_type: "market_story_v02",
      target_id: "story_public",
      sources: [],
    }),
  );
});
