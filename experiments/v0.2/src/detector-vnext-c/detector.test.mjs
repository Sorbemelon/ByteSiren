import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_VNEXT_C_OPTIONS,
  classifyRangePosition,
  computeChartContextForEvent,
  computeSymbolChartContext,
  detectVNextCEvents,
  enrichVNextCEvents,
  ordinalMedian,
  summarizeVNextC,
} from "./index.mjs";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"];
const EVENT_START = "2026-06-10T12:00:00.000Z";
const EVENT_END = "2026-06-10T12:29:59.999Z";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function isoAt(index) {
  return new Date(
    Date.parse("2026-06-09T00:00:00.000Z") + index * 15 * 60 * 1000,
  ).toISOString();
}

function candle({ symbol, index, open, close, high, low, volume = 1000 }) {
  const openTime = isoAt(index);

  return {
    symbol,
    interval: "15m",
    open_time: openTime,
    close_time: new Date(Date.parse(openTime) + 15 * 60 * 1000).toISOString(),
    open,
    high: high ?? Math.max(open, close) + 0.05,
    low: low ?? Math.min(open, close) - 0.05,
    close,
    volume,
    quote_volume: volume,
    trade_count: 100,
  };
}

function candlesForSymbol(
  symbol,
  { mode = "break_up", afterClose = 109 } = {},
) {
  const candles = [];
  let close = 95;

  for (let index = 0; index < 144; index += 1) {
    const previous = close;
    if (mode === "inside_weak") {
      close = 95 + Math.sin(index / 8) * 0.35;
    } else if (mode === "vol_expansion") {
      close = index < 128 ? 95 + Math.sin(index / 6) * 0.03 : close + 0.05;
    } else {
      close = Math.min(99.2, close + 0.03);
    }

    candles.push(
      candle({
        symbol,
        index,
        open: previous,
        close,
        high:
          mode === "vol_expansion" && index < 128
            ? Math.max(previous, close) + 0.02
            : 100,
        low:
          mode === "vol_expansion" && index < 128
            ? Math.min(previous, close) - 0.02
            : 90,
        volume: 1000,
      }),
    );
  }

  if (mode === "break_up") {
    candles.push(
      candle({
        symbol,
        index: 144,
        open: 99.4,
        close: 106,
        high: 106.5,
        low: 98.8,
        volume: 2500,
      }),
    );
    candles.push(
      candle({
        symbol,
        index: 145,
        open: 106,
        close: afterClose,
        high: Math.max(afterClose, 106) + 0.2,
        low: Math.min(afterClose, 106) - 0.2,
        volume: 1800,
      }),
    );
  } else if (mode === "inside_weak") {
    candles.push(
      candle({
        symbol,
        index: 144,
        open: 95,
        close: 95.25,
        high: 96,
        low: 94,
        volume: 950,
      }),
    );
    candles.push(
      candle({
        symbol,
        index: 145,
        open: 95.25,
        close: afterClose,
        high: Math.max(96, afterClose),
        low: 94,
        volume: 900,
      }),
    );
  } else {
    candles.push(
      candle({
        symbol,
        index: 144,
        open: 95.1,
        close: 101,
        high: 102,
        low: 94,
        volume: 2600,
      }),
    );
    candles.push(
      candle({
        symbol,
        index: 145,
        open: 101,
        close: afterClose,
        high: Math.max(101, afterClose) + 0.5,
        low: 100.5,
        volume: 1800,
      }),
    );
  }

  if (mode === "break_up") {
    candles.push(
      candle({
        symbol,
        index: 146,
        open: afterClose,
        close: 250,
        high: 260,
        low: afterClose - 1,
        volume: 1000,
      }),
    );
  }

  return candles;
}

function candlesBySymbol(mode) {
  return Object.fromEntries(
    SYMBOLS.map((symbol) => [
      symbol,
      candlesForSymbol(symbol, {
        mode,
        afterClose: mode === "inside_weak" ? 95.1 : 109,
      }),
    ]),
  );
}

function baseEvent(overrides = {}) {
  const direction = overrides.direction ?? "observed_up";
  const move = overrides.move ?? 1.2;

  return {
    event_id: overrides.event_id ?? `event_${direction}_${move}`,
    item_type: "signal_event",
    direction,
    window_start: overrides.window_start ?? EVENT_START,
    window_end: overrides.window_end ?? EVENT_END,
    duration_min: overrides.duration_min ?? 30,
    peak_time: overrides.peak_time ?? EVENT_START,
    symbols_involved: SYMBOLS,
    breadth_count: 5,
    n_tracked: 5,
    window_move_pct: direction === "observed_down" ? -Math.abs(move) : move,
    max_abs_window_move_pct: Math.abs(move),
    event_strength_label: "High",
    signal_strength_score: overrides.signal_strength_score ?? 78,
    source_route_hint: "broad_market",
    macro_aligned: Boolean(overrides.macro_aligned),
    publish_candidate: true,
    publish_reason: "source_fixture",
    suppress_reason: null,
    per_symbol_evidence: SYMBOLS.map((symbol) => ({
      symbol,
      window_move_pct: direction === "observed_down" ? -Math.abs(move) : move,
      window_change_pct: direction === "observed_down" ? -Math.abs(move) : move,
      max_volume_ratio: 1.5,
      range_position: "inside_range",
    })),
    table_highlights: {
      lead_mover_symbol: "BTCUSDT",
      strongest_peak_symbol: "BTCUSDT",
      highlight_cells: [
        { symbol: "BTCUSDT", column: "symbol", reason: "lead_mover" },
        { symbol: "BTCUSDT", column: "peak_15m", reason: "strongest_peak_15m" },
      ],
    },
    diagnostics: {
      evidence_bar_count: overrides.evidence_bar_count ?? 2,
      peak_15m_move_pct_by_symbol: Object.fromEntries(
        SYMBOLS.map((symbol) => [symbol, move]),
      ),
    },
  };
}

test("vNext-C emits chart-context fields and summary metadata", () => {
  const events = enrichVNextCEvents([baseEvent()], {
    candlesBySymbol: candlesBySymbol("break_up"),
  });
  const [event] = events;
  const summary = summarizeVNextC(events);

  assert.equal(event.detector_version, "vnext_c");
  assert.equal(event.publish_gate_version, "vnext_c_r5_history_gate");
  assert.equal(Number.isFinite(event.chart_context_score), true);
  assert.equal(typeof event.chart_context_label, "string");
  assert.equal(typeof event.event_story_type, "string");
  assert.ok(event.trend_context);
  assert.equal(typeof event.trend_context.trend_context, "string");
  assert.equal(typeof event.trend_context.trend_alignment, "string");
  assert.ok(
    ["weak", "building", "strong", "very_strong"].includes(
      event.trend_context.trend_strength_median,
    ),
  );
  assert.ok(event.momentum_context);
  assert.equal(typeof event.volatility_context, "string");
  assert.ok(
    ["compressed", "normal", "expanding", "compressed_to_expanding"].includes(
      event.volatility_state,
    ),
  );
  assert.equal(typeof event.event_range_context, "string");
  assert.equal(typeof event.history_support_type, "string");
  assert.ok(event.source_likelihood >= 0 && event.source_likelihood <= 1);
  assert.ok(["low", "medium", "high"].includes(event.source_likelihood_band));
  assert.ok(event.publish_gate);
  assert.ok(["public", "audit"].includes(event.publish_gate.decision));
  assert.equal(event.publish_gate.decision === "public", event.publish_candidate);
  assert.ok(Array.isArray(event.publish_gate.reasons));
  assert.equal(summary.detector, "vnext_c");
  assert.equal(summary.chart_context_enabled, true);
});

test("range break uses only prior candles and ignores future extremes", () => {
  const candles = candlesForSymbol("BTCUSDT", { mode: "break_up" });
  const context = computeSymbolChartContext({
    symbol: "BTCUSDT",
    event: baseEvent(),
    candles,
  });

  assert.equal(context.valid_chart_context, true);
  assert.equal(context.prev_24h_high, 100);
  assert.ok(context.event_high < 260);
  assert.equal(context.range_position, "broke_high");
  assert.equal(context.range_break_direction, "up");
});

test("broad broke high increases chart-context score", () => {
  const strong = computeChartContextForEvent({
    event: baseEvent({ move: 1.3 }),
    candlesBySymbol: candlesBySymbol("break_up"),
  });
  const weak = computeChartContextForEvent({
    event: baseEvent({ move: 0.35, signal_strength_score: 35 }),
    candlesBySymbol: candlesBySymbol("inside_weak"),
  });

  assert.equal(strong.event_range_context, "broad_broke_high");
  assert.ok(strong.chart_context_score > weak.chart_context_score);
  assert.ok(strong.chart_context_reasons.includes("broad_range_break"));
});

test("inside-range weak impulse lowers chart-context score", () => {
  const context = computeChartContextForEvent({
    event: baseEvent({ move: 0.3, signal_strength_score: 25 }),
    candlesBySymbol: candlesBySymbol("inside_weak"),
  });

  assert.equal(context.event_range_context, "mostly_inside_range");
  assert.ok(
    context.chart_context_score <
      DEFAULT_VNEXT_C_OPTIONS.chartContextModerateScore,
  );
  assert.ok(context.chart_context_warnings.includes("weak_avg_change"));
});

test("volatility expansion after compression increases chart-context score", () => {
  const context = computeChartContextForEvent({
    event: baseEvent({ move: 1.1 }),
    candlesBySymbol: candlesBySymbol("vol_expansion"),
    options: {
      ...DEFAULT_VNEXT_C_OPTIONS,
      compressionBbwPercentile: 1,
    },
  });

  assert.equal(context.volatility_context, "expansion_after_compression");
  assert.ok(
    context.chart_context_reasons.includes(
      "volatility_expansion_after_compression",
    ),
  );
  assert.ok(
    context.chart_context_score >=
      DEFAULT_VNEXT_C_OPTIONS.chartContextModerateScore,
  );
});

test("micro-retrace remains suppressible in vNext-C recalibration", () => {
  const parent = baseEvent({
    event_id: "parent",
    direction: "observed_up",
    move: 2,
  });
  const retrace = baseEvent({
    event_id: "retrace",
    direction: "observed_down",
    move: 0.7,
    window_start: "2026-06-10T12:30:00.000Z",
    window_end: "2026-06-10T12:44:59.999Z",
    peak_time: "2026-06-10T12:30:00.000Z",
  });
  const candles = candlesBySymbol("break_up");
  const events = enrichVNextCEvents([parent, retrace], {
    candlesBySymbol: candles,
  });

  assert.equal(events.length, 2);
  assert.equal(events[1].publish_candidate, false);
  assert.equal(events[1].suppress_reason, "micro_retrace_after_parent");
});

test("vNext-C builds events from its own window builder", async () => {
  const snapshot = await readJson("experiments/v0.2/data/candles_30d.json");
  const result = detectVNextCEvents({
    candlesBySymbol: snapshot.candles_by_symbol,
  });

  assert.equal(result.detector, "vnext_c");
  assert.equal(result.source_detector, "vnext_c_window_builder");
  assert.ok(
    result.source_detector_result.raw_windows_detected >= result.events.length,
  );
  assert.ok(
    result.source_detector_result.raw_windows_filtered_below_min_bars > 0,
  );
  assert.ok(
    result.events.every(
      (event) =>
        event.flash_event ||
        event.diagnostics.evidence_bar_count >= result.options.minDetectedBars,
    ),
  );
  // Flash (1-bar) events are detected but never public (audit-only).
  assert.ok(
    result.events.every(
      (event) => !event.flash_event || !event.publish_candidate,
    ),
  );
  assert.ok(
    result.events.every(
      (event) => event.diagnostics.source_detector === "vnext_c_window_builder",
    ),
  );
});

test("Signal Events are capped while Market Stories own longer context", async () => {
  const snapshot = await readJson("experiments/v0.2/data/candles_30d.json");
  const result = detectVNextCEvents({
    candlesBySymbol: snapshot.candles_by_symbol,
  });

  assert.equal(result.options.debounceBars, 3);
  assert.equal(result.options.mergeGapBars, 2);
  assert.equal(result.options.maxEventBars, 12);
  assert.equal(result.options.maxPublicBars, 12);
  assert.ok(
    result.events.every(
      (event) =>
        event.flash_event ||
        event.diagnostics.evidence_bar_count <= result.options.maxEventBars,
    ),
  );
  assert.ok(
    result.events
      .filter((event) => event.publish_candidate)
      .every(
        (event) =>
          event.diagnostics.evidence_bar_count <= result.options.maxPublicBars,
      ),
  );
});

test("vNext-C public gate requires confirmed multi-bar context paths", async () => {
  const payload = await readJson(
    "experiments/v0.2/outputs/vnext_c_events.json",
  );
  const publicEvents = payload.events.filter(
    (event) => event.publish_candidate,
  );
  const allowedReasons = new Set([
    "broad_confirmed_break",
    "compression_expansion_break",
    "strong_continuation_breadth_trend",
    "broad_impulse",
    "relief_reversal",
    "macro_aligned_confirmed_window",
  ]);

  assert.ok(publicEvents.length > 0);
  assert.ok(
    publicEvents.every(
      (event) => {
        const withinMax =
          !Number.isFinite(payload.options.maxPublicBars) ||
          event.diagnostics.evidence_bar_count <= payload.options.maxPublicBars;
        return (
          (event.flash_event ||
            event.diagnostics.evidence_bar_count >=
              payload.options.minPublicBars) &&
          withinMax &&
          Math.abs(event.window_move_pct) >=
            payload.options.minAvgChangePublicPct &&
          event.direction_consistency_score >=
            payload.options.minBreadthPublic &&
          event.history_support_type !== "none" &&
          allowedReasons.has(event.publish_reason)
        );
      },
    ),
  );
});

test("generated vNext-C output produces public and audit counts without hardcoding", async () => {
  const payload = await readJson(
    "experiments/v0.2/outputs/vnext_c_events.json",
  );
  const publicCount = payload.events.filter(
    (event) => event.publish_candidate,
  ).length;
  const auditCount = payload.events.filter(
    (event) => !event.publish_candidate,
  ).length;

  assert.equal(payload.detector, "vnext_c");
  assert.equal(payload.source_detector, "vnext_c_window_builder");
  assert.ok(payload.events.length > 0);
  assert.ok(publicCount > 0);
  assert.ok(auditCount > 0);
  assert.equal(publicCount + auditCount, payload.events.length);
});

test("public chart-context labels avoid trading-action wording", async () => {
  const contract = await readJson(
    "experiments/v0.2/outputs/feed_contract_v02.json",
  );
  const publicText = JSON.stringify({
    detector_version: contract.detector_version,
    day_groups: contract.day_groups.map((group) => ({
      display_date: group.display_date,
      items: group.items.map((item) => ({
        item_type: item.item_type,
        labels: [
          item.avg_change_label,
          item.daily_change_label,
          item.chart_context_label,
          item.event_range_context_label,
          item.event_story_type,
        ],
        per_symbol_evidence: item.per_symbol_evidence,
      })),
    })),
  }).toLowerCase();

  for (const forbidden of [
    "support",
    "resistance",
    "breakout signal",
    "breakdown signal",
    "buy",
    "sell",
    "long",
    "short",
    "hold",
  ]) {
    assert.equal(publicText.includes(forbidden), false);
  }
});

test("range classifier keeps descriptive labels", () => {
  const result = classifyRangePosition({
    prevHigh: 100,
    prevLow: 90,
    eventHigh: 100.5,
    eventLow: 94,
    eventClose: 98.5,
    eventCloses: [98.5],
    atrPre: 1,
    volumeX: 1,
  });

  assert.ok(
    [
      "inside_range",
      "near_high",
      "near_low",
      "broke_high",
      "broke_low",
    ].includes(result.range_position),
  );
});

test("ordinalMedian returns the median bucket, not the mode", () => {
  const order = ["weak", "building", "strong", "very_strong"];
  // ranks [0,0,2,3,1] -> sorted [0,0,1,2,3] -> median rank 1 -> "building".
  assert.equal(
    ordinalMedian(
      ["weak", "weak", "strong", "very_strong", "building"],
      order,
      "weak",
    ),
    "building",
  );
  assert.equal(ordinalMedian([], order, "weak"), "weak");
});

test("broad consensus break publishes with history support and source likelihood", () => {
  const [event] = enrichVNextCEvents([baseEvent({ move: 1.5 })], {
    candlesBySymbol: candlesBySymbol("break_up"),
  });

  assert.equal(event.event_range_context, "broad_broke_high");
  assert.notEqual(event.history_support_type, "none");
  assert.equal(event.publish_candidate, true);
  assert.equal(event.publish_gate.decision, "public");
  assert.ok(event.publish_gate.reasons.length > 0);
  assert.ok(event.source_likelihood > 0);
});

test("vNext-C detection/publish never uses look-ahead (no whipsaw, post-window retrospective)", async () => {
  const snapshot = await readJson("experiments/v0.2/data/candles_30d.json");
  const result = detectVNextCEvents({
    candlesBySymbol: snapshot.candles_by_symbol,
  });

  assert.ok(result.events.every((event) => event.momentum_type !== "whipsaw"));
  assert.ok(
    result.events.every(
      (event) =>
        event.momentum_context.retrospective_post_window_only === true,
    ),
  );
  assert.equal(
    typeof result.source_detector_result.flash_event_count,
    "number",
  );
  const publicEvents = result.events.filter((event) => event.publish_candidate);
  assert.ok(publicEvents.length > 0);
  assert.ok(
    publicEvents.every(
      (event) =>
        event.source_likelihood >= 0 &&
        event.source_likelihood <= 1 &&
        event.evidence_window_stats &&
        Number.isFinite(event.evidence_window_stats.window_change_median) &&
        event.publish_gate.decision === "public",
    ),
  );
});
