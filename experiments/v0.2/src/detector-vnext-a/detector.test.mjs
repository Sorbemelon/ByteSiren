import assert from "node:assert/strict";
import test from "node:test";

import {
  detectVNextEventsFromFeatures,
  scoreSourceLikelihood,
} from "./index.mjs";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"];
const baseMs = Date.parse("2026-06-01T00:00:00.000Z");
const fifteenMinutesMs = 15 * 60 * 1000;

function isoAt(index) {
  return new Date(baseMs + index * fifteenMinutesMs).toISOString();
}

function closeIsoAt(index) {
  return new Date(baseMs + (index + 1) * fifteenMinutesMs).toISOString();
}

function feature(symbol, index, input = {}) {
  const direction = input.direction ?? "flat";
  const changePct =
    input.changePct ??
    (direction === "down" ? -1.2 : direction === "up" ? 1.2 : 0);
  const severity = input.severity ?? (direction === "flat" ? 0 : 70);

  return {
    symbol,
    interval: "15m",
    open_time: isoAt(index),
    close_time: closeIsoAt(index),
    close: 100 + index,
    signal_window: "15m",
    baseline_window: "24h",
    baseline_ready: input.baselineReady ?? true,
    return_15m: Math.log(1 + changePct / 100),
    return_15m_pct: changePct,
    true_range_pct: input.rangePct ?? 1,
    price_z:
      input.priceZ ??
      (direction === "down" ? -4.5 : direction === "up" ? 4.5 : 0),
    volume_ratio: input.volumeRatio ?? (direction === "flat" ? 1 : 3),
    volatility_ratio: input.rangeRatio ?? (direction === "flat" ? 1 : 3),
    scores: {
      price_score: severity,
      volume_score: severity,
      range_score: severity,
      severity_score: severity,
    },
    direction:
      direction === "observed_up"
        ? "up"
        : direction === "observed_down"
          ? "down"
          : direction,
    is_elevated: direction !== "flat",
  };
}

function row(index, elevatedSymbols, input = {}) {
  const bySymbol = {};

  for (const symbol of SYMBOLS) {
    const elevated = elevatedSymbols.includes(symbol);
    bySymbol[symbol] = feature(symbol, index, {
      direction: elevated ? (input.direction ?? "up") : "flat",
      severity: elevated ? (input.severity ?? 70) : 0,
      changePct: elevated ? input.changePct : 0,
      priceZ: elevated ? input.priceZ : 0,
      volumeRatio: elevated ? input.volumeRatio : 1,
      rangeRatio: elevated ? input.rangeRatio : 1,
    });
  }

  return bySymbol;
}

function featuresBySymbol(rows) {
  const result = {};

  for (const symbol of SYMBOLS) {
    result[symbol] = rows.map((item) => item[symbol]);
  }

  return result;
}

function run(rows, options = {}) {
  return detectVNextEventsFromFeatures({
    featuresBySymbol: featuresBySymbol(rows),
    options,
  });
}

test("hysteresis opens on trigger and closes after calm debounce", () => {
  const result = run(
    [
      row(0, ["BTCUSDT", "ETHUSDT", "SOLUSDT"]),
      row(1, ["BTCUSDT", "ETHUSDT", "SOLUSDT"], { severity: 50 }),
      row(2, ["BTCUSDT", "ETHUSDT", "SOLUSDT"], {
        severity: 15,
        priceZ: 1.8,
        changePct: 0.25,
        volumeRatio: 1.1,
        rangeRatio: 1.1,
      }),
      row(3, []),
      row(4, []),
    ],
    { calmBarsToClose: 2 },
  );

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].window_start, isoAt(0));
  assert.equal(result.events[0].window_end, closeIsoAt(2));
  assert.equal(result.events[0].duration_min, 45);
  assert.deepEqual(result.events[0].suppression_notes, [
    "closed_after_2_calm_bars",
  ]);
});

test("max duration cap splits sustained windows", () => {
  const rows = Array.from({ length: 10 }, (_, index) =>
    row(index, ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"]),
  );
  const result = run(rows, { maxDurationBars: 4 });

  assert.ok(result.events.length >= 2);
  assert.ok(result.events.every((event) => event.duration_min <= 60));
  assert.ok(
    result.events.some((event) =>
      event.suppression_notes.includes("closed_at_max_duration"),
    ),
  );
});

test("weak short move is suppressed", () => {
  const result = run([
    row(0, ["BTCUSDT", "ETHUSDT", "SOLUSDT"], {
      changePct: 0.1,
      priceZ: 4,
      volumeRatio: 4,
      rangeRatio: 4,
    }),
  ]);

  assert.equal(result.events.length, 0);
  assert.equal(result.suppressed_candidates.length, 1);
});

test("volume-only spike is suppressed", () => {
  const result = run([
    row(0, ["BTCUSDT", "ETHUSDT", "SOLUSDT"], {
      changePct: 0.02,
      priceZ: 0.2,
      volumeRatio: 10,
      rangeRatio: 1,
    }),
  ]);

  assert.equal(result.events.length, 0);
});

test("market-wide breadth requires at least three symbols", () => {
  const result = run([row(0, ["BTCUSDT", "ETHUSDT"])]);

  assert.equal(result.events.length, 0);
  assert.equal(
    result.suppressed_candidates[0].reason,
    "market_wide_breadth_below_3",
  );
});

test("duplicate reprocessing produces stable ids", () => {
  const rows = [
    row(0, ["BTCUSDT", "ETHUSDT", "SOLUSDT"]),
    row(1, ["BTCUSDT", "ETHUSDT", "SOLUSDT"]),
  ];

  assert.deepEqual(
    run(rows).events.map((event) => event.event_id),
    run(rows).events.map((event) => event.event_id),
  );
});

test("source likelihood rises with breadth, volume, range, and magnitude", () => {
  const weak = scoreSourceLikelihood({
    breadth_count: 3,
    n_tracked: 5,
    event_strength: 45,
    max_abs_window_move_pct: 0.6,
    volume_confirmation_count: 1,
    range_confirmation_count: 1,
    duration_min: 15,
  });
  const strong = scoreSourceLikelihood({
    breadth_count: 5,
    n_tracked: 5,
    event_strength: 90,
    max_abs_window_move_pct: 4,
    volume_confirmation_count: 5,
    range_confirmation_count: 5,
    duration_min: 60,
  });

  assert.ok(strong > weak);
});

test("source likelihood decreases for range-led volatility without volume", () => {
  const noVolume = scoreSourceLikelihood({
    breadth_count: 4,
    n_tracked: 5,
    event_strength: 70,
    max_abs_window_move_pct: 2,
    volume_confirmation_count: 0,
    range_confirmation_count: 4,
    duration_min: 45,
  });
  const withVolume = scoreSourceLikelihood({
    breadth_count: 4,
    n_tracked: 5,
    event_strength: 70,
    max_abs_window_move_pct: 2,
    volume_confirmation_count: 4,
    range_confirmation_count: 4,
    duration_min: 45,
  });

  assert.ok(withVolume > noVolume);
});
