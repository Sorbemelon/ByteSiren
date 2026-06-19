import assert from "node:assert/strict";
import test from "node:test";

import { calibrateVNextAEvents, detectVNextBEvents } from "./index.mjs";
import { generateDailyOverviews } from "../generate-daily-overviews.mjs";
import { buildGroupedFeedPreview } from "../build-feed-preview.mjs";

const macroCalendar = [
  {
    id: "cpi",
    type: "CPI",
    title: "CPI",
    scheduled_at: "2026-06-10T12:30:00.000Z",
  },
];

function event(overrides = {}) {
  return {
    event_id: overrides.event_id ?? `a_${overrides.window_start ?? "event"}`,
    direction: overrides.direction ?? "observed_up",
    window_start: overrides.window_start ?? "2026-06-10T12:30:00.000Z",
    window_end: overrides.window_end ?? "2026-06-10T12:45:00.000Z",
    duration_min: overrides.duration_min ?? 15,
    peak_time: overrides.peak_time ?? overrides.window_start ?? "2026-06-10T12:30:00.000Z",
    symbols_involved: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    breadth_count: overrides.breadth_count ?? 3,
    n_tracked: 5,
    window_move_pct_by_symbol:
      overrides.window_move_pct_by_symbol ?? {
        BTCUSDT: overrides.move ?? 1.2,
        ETHUSDT: overrides.move ?? 1.2,
        SOLUSDT: overrides.move ?? 1.2,
      },
    peak_15m_move_pct_by_symbol:
      overrides.peak_15m_move_pct_by_symbol ?? {},
    volume_confirmation_by_symbol: {
      BTCUSDT: true,
      ETHUSDT: true,
      SOLUSDT: true,
    },
    range_confirmation_by_symbol: {
      BTCUSDT: true,
      ETHUSDT: true,
      SOLUSDT: true,
    },
    lead_mover: "BTCUSDT",
    event_strength: overrides.event_strength ?? 70,
    source_likelihood_score: 1,
    per_symbol_evidence: [],
    suppression_notes: [],
  };
}

test("publish gate keeps macro-aligned event even if move is modest", () => {
  const [result] = calibrateVNextAEvents(
    [
      event({
        move: 1.1,
        window_start: "2026-06-10T12:30:00.000Z",
        peak_time: "2026-06-10T12:30:00.000Z",
      }),
    ],
    { macroCalendar },
  );

  assert.equal(result.publish_candidate, true);
  assert.equal(result.publish_reason, "macro_aligned");
  assert.equal(result.macro_aligned, true);
  assert.ok(result.tags.includes("macro_aligned"));
});

test("publish gate suppresses weak below one percent event", () => {
  const [result] = calibrateVNextAEvents([event({ move: 0.8 })], {
    macroCalendar: [],
  });

  assert.equal(result.publish_candidate, false);
  assert.equal(result.suppress_reason, "weak_window_move_lt_1pct");
});

test("max abs window move at least one point five percent passes publish gate", () => {
  const [result] = calibrateVNextAEvents([event({ move: 1.5 })], {
    macroCalendar: [],
  });

  assert.equal(result.publish_candidate, true);
  assert.equal(result.publish_reason, "window_move_gte_1_5pct");
});

test("source likelihood score is not emitted and signal strength score is emitted", () => {
  const [result] = calibrateVNextAEvents([event({ move: 1.5 })], {
    macroCalendar: [],
  });

  assert.equal("source_likelihood_score" in result, false);
  assert.equal(typeof result.signal_strength_score, "number");
});

test("micro retrace suppression keeps detected event in output", () => {
  const results = calibrateVNextAEvents(
    [
      event({
        event_id: "parent",
        move: 4,
        direction: "observed_up",
        window_start: "2026-06-07T22:00:00.000Z",
        window_end: "2026-06-07T22:15:00.000Z",
        peak_time: "2026-06-07T22:00:00.000Z",
      }),
      event({
        event_id: "retrace",
        move: -1.4,
        direction: "observed_down",
        window_start: "2026-06-07T22:15:00.000Z",
        window_end: "2026-06-07T22:30:00.000Z",
        peak_time: "2026-06-07T22:15:00.000Z",
      }),
    ],
    { macroCalendar: [] },
  );

  assert.equal(results.length, 2);
  assert.equal(results[1].publish_candidate, false);
  assert.equal(results[1].suppress_reason, "micro_retrace_after_parent");
});

function candle(symbol, openTime, open, close) {
  return {
    symbol,
    interval: "15m",
    open_time: openTime,
    close_time: new Date(Date.parse(openTime) + 15 * 60 * 1000).toISOString(),
    open,
    high: Math.max(open, close) * 1.01,
    low: Math.min(open, close) * 0.99,
    close,
    volume: 1,
    quote_volume: 1,
    trade_count: 1,
  };
}

test("daily overview generated for every UTC day", () => {
  const snapshot = {
    candles_by_symbol: {
      BTCUSDT: [
        candle("BTCUSDT", "2026-06-01T00:00:00.000Z", 100, 101),
        candle("BTCUSDT", "2026-06-02T00:00:00.000Z", 101, 100),
      ],
      ETHUSDT: [
        candle("ETHUSDT", "2026-06-01T00:00:00.000Z", 100, 101),
        candle("ETHUSDT", "2026-06-02T00:00:00.000Z", 101, 100),
      ],
      BNBUSDT: [
        candle("BNBUSDT", "2026-06-01T00:00:00.000Z", 100, 101),
        candle("BNBUSDT", "2026-06-02T00:00:00.000Z", 101, 100),
      ],
      SOLUSDT: [
        candle("SOLUSDT", "2026-06-01T00:00:00.000Z", 100, 101),
        candle("SOLUSDT", "2026-06-02T00:00:00.000Z", 101, 100),
      ],
      XRPUSDT: [
        candle("XRPUSDT", "2026-06-01T00:00:00.000Z", 100, 101),
        candle("XRPUSDT", "2026-06-02T00:00:00.000Z", 101, 100),
      ],
    },
  };
  const overviews = generateDailyOverviews({ snapshot, signalEvents: [] });

  assert.deepEqual(
    overviews.map((item) => item.date_utc),
    ["2026-06-01", "2026-06-02"],
  );
});

test("grouped preview puts Daily Overview first and includes chart interaction fields", () => {
  const overview = {
    item_type: "daily_overview",
    date_utc: "2026-06-10",
    day_start: "2026-06-10T00:00:00.000Z",
    day_end: "2026-06-10T23:59:59.999Z",
    market_tone: "risk_on",
    market_24h_move_pct: 1.2,
    summary_hint: "risk on day",
    source_query_hints: ["crypto market overview 2026-06-10"],
  };
  const signal = calibrateVNextAEvents(
    [
      event({
        move: 1.5,
        window_start: "2026-06-10T12:30:00.000Z",
        peak_time: "2026-06-10T12:30:00.000Z",
      }),
    ],
    { macroCalendar },
  )[0];
  const preview = buildGroupedFeedPreview({
    dailyOverviews: [overview],
    signalEvents: [signal],
  });
  const items = preview.public_preview.day_posts[0].sections;

  assert.equal(items[0].item_type, "daily_overview");
  assert.equal(items[0].chart_interaction.chart_highlight_type, "day_window");
  assert.equal(items[1].chart_interaction.chart_highlight_type, "event_window");
  assert.equal(items[0].chart_interaction.hide_other_days_on_select, true);
});

test("range position and table highlight metadata are emitted", () => {
  const candlesBySymbol = {
    BTCUSDT: [
      candle("BTCUSDT", "2026-06-09T12:30:00.000Z", 100, 101),
      candle("BTCUSDT", "2026-06-10T12:30:00.000Z", 101, 104),
    ],
    ETHUSDT: [
      candle("ETHUSDT", "2026-06-09T12:30:00.000Z", 100, 101),
      candle("ETHUSDT", "2026-06-10T12:30:00.000Z", 101, 103),
    ],
    SOLUSDT: [
      candle("SOLUSDT", "2026-06-09T12:30:00.000Z", 100, 101),
      candle("SOLUSDT", "2026-06-10T12:30:00.000Z", 101, 102),
    ],
  };
  const [result] = calibrateVNextAEvents(
    [
      event({
        move: 1.5,
        window_start: "2026-06-10T12:30:00.000Z",
        peak_time: "2026-06-10T12:30:00.000Z",
        peak_15m_move_pct_by_symbol: {
          BTCUSDT: 2.5,
          ETHUSDT: 1.4,
          SOLUSDT: 0.8,
        },
      }),
    ],
    { candlesBySymbol, macroCalendar: [] },
  );

  assert.ok(
    [
      "broad_break_high",
      "broad_break_low",
      "mixed_range_position",
      "inside_range",
    ].includes(result.event_range_context),
  );
  assert.equal(result.table_highlights.lead_mover_symbol, "BTCUSDT");
  assert.equal(result.table_highlights.strongest_peak_symbol, "BTCUSDT");
  assert.ok(
    result.per_symbol_evidence.every(
      (item) => item.range_position && item.range_position_label,
    ),
  );
});

test("detector wrapper keeps publish metadata on events", () => {
  const result = detectVNextBEvents({
    candlesBySymbol: {},
    macroCalendar: [],
  });

  assert.equal(result.detector, "vnext_b");
  assert.ok(Array.isArray(result.events));
});
