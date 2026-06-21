import assert from "node:assert/strict";
import test from "node:test";

import {
  ALLOWED_SYMBOLS,
  MARKET_INTERVAL,
  type MarketSymbol,
} from "../config.ts";
import { runDetector } from "./runDetector.ts";
import type { MarketCandle } from "../types/market.ts";
import { createMemoryD1 } from "../test/d1Memory.ts";

const baseTimeMs = Date.parse("2026-06-14T00:00:00.000Z");
const fifteenMinutesMs = 15 * 60 * 1000;
const detectorNow = new Date("2026-06-16T00:00:00.000Z");

function isoAt(index: number): string {
  return new Date(baseTimeMs + index * fifteenMinutesMs).toISOString();
}

function closeIsoAt(index: number): string {
  return new Date(
    baseTimeMs + (index + 1) * fifteenMinutesMs - 1,
  ).toISOString();
}

function syntheticCandles(
  symbol: MarketSymbol,
  options: {
    count?: number;
    spike?: boolean;
  } = {},
): MarketCandle[] {
  const count = options.count ?? 98;
  const candles: MarketCandle[] = [];
  let price = symbol === "BTCUSDT" ? 100 : 50;

  for (let index = 0; index < count; index += 1) {
    const isLast = index === count - 1;
    const change =
      isLast && options.spike ? 0.02 : index % 2 === 0 ? 0.001 : -0.0008;
    const open = price;
    price *= 1 + change;
    const close = price;
    const high = isLast && options.spike ? close * 1.012 : close * 1.003;
    const low = isLast && options.spike ? open * 0.988 : close * 0.997;

    candles.push({
      symbol,
      interval: MARKET_INTERVAL,
      open_time: isoAt(index),
      close_time: closeIsoAt(index),
      open,
      high,
      low,
      close,
      volume: 100,
      quote_volume: isLast && options.spike ? 5000 : 1000,
      trade_count: 10,
    });
  }

  return candles;
}

function candlesForAllSymbols(
  options: {
    count?: number;
    spikeSymbols?: MarketSymbol[];
  } = {},
): MarketCandle[] {
  const spikeSymbols = options.spikeSymbols ?? [...ALLOWED_SYMBOLS];

  return ALLOWED_SYMBOLS.flatMap((symbol) =>
    syntheticCandles(symbol, {
      count: options.count,
      spike: spikeSymbols.includes(symbol),
    }),
  );
}

function storySignalRow(id: string, start: string, end: string) {
  return {
    id,
    date_utc: start.slice(0, 10),
    event_start: start,
    event_end: end,
    duration_min: 60,
    peak_time: start,
    direction: "observed_up",
    signals_count: 4,
    n_tracked: 5,
    avg_change_pct: 1.2,
    avg_change_method: "median_participating_symbols",
    event_strength_score: 80,
    impact_label: "High",
    chart_context_score: 82,
    chart_context_label: "Range break",
    event_story_type: "range_break_up",
    trend_context: "trend_up",
    momentum_context: "continuation",
    volatility_context: "ordinary_volatility",
    event_range_context: "broad_broke_high",
    chart_context_reasons_json: "[]",
    chart_context_warnings_json: "[]",
    macro_aligned: 0,
    nearest_macro_event: null,
    macro_delta_min: null,
    source_route_hint: "broad_market",
    publish_candidate: 1,
    publish_reason: "test_public_signal",
    suppress_reason: null,
    detector_version: "v02",
    created_at: start,
    updated_at: start,
  };
}

test("runDetector skips safely when any symbol lacks sufficient candles", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: candlesForAllSymbols({ count: 96 }),
  });

  const result = await runDetector(db, detectorNow);

  assert.equal(result.status, "skipped");
  assert.equal(result.detector_version, "v01");
  assert.match(result.message, /insufficient 15m candle history/);
  assert.equal(tables.incidents.length, 0);
  assert.equal(tables.job_runs.at(-1)?.status, "skipped");
});

test("runDetector persists candidates, features, and suppressed raw events idempotently", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: candlesForAllSymbols(),
  });

  const firstRun = await runDetector(db, detectorNow);
  const secondRun = await runDetector(db, detectorNow);

  assert.equal(firstRun.status, "success");
  assert.equal(firstRun.detector_version, "v01");
  assert.ok(firstRun.candidate_count >= 1);
  assert.equal(secondRun.status, "success");
  assert.equal(tables.incidents.length, firstRun.candidate_count);
  assert.ok(tables.market_features.length >= ALLOWED_SYMBOLS.length * 98);
  assert.ok(
    tables.raw_signal_events.some((event) => event.status === "suppressed"),
  );
  assert.ok(
    tables.raw_signal_events.some((event) => event.status === "confirmed"),
  );
  assert.ok(
    tables.incidents.every(
      (incident) =>
        incident.scope === "market_wide" || incident.scope === "market_day",
    ),
  );
});

test("runDetector stores single-symbol suppressions without final candidates", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: candlesForAllSymbols({ spikeSymbols: ["BTCUSDT"] }),
  });

  const result = await runDetector(db, detectorNow);

  assert.equal(result.status, "success");
  assert.equal(result.detector_version, "v01");
  assert.equal(result.candidate_count, 0);
  assert.equal(tables.incidents.length, 0);
  assert.ok(
    tables.raw_signal_events.some(
      (event) =>
        event.status === "suppressed" &&
        event.suppression_reason === "single_symbol_public_mvp_suppressed",
    ),
  );
});

test("runDetector uses v0.2 Signal/Audit write path only when DETECTOR_VERSION=v02", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: candlesForAllSymbols(),
  });

  const result = await runDetector(db, {
    env: { DETECTOR_VERSION: "v02" },
    now: detectorNow,
  });

  assert.equal(result.status, "success");
  assert.equal(result.detector_version, "v02");
  assert.ok(result.signal_count! >= 1);
  assert.ok(result.publish_candidate_count! >= 1);
  assert.equal(tables.signal_events_v02.length, result.signal_count);
  assert.equal(
    tables.signal_event_symbols_v02.length,
    result.signal_count! * 5,
  );
  assert.equal(tables.incidents.length, 0);
  assert.equal(tables.raw_signal_events.length, 0);
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(tables.source_references_v02.length, 0);
  assert.equal(tables.market_stories_v02.length, 0);
  assert.equal(tables.daily_overviews_v02.length, 0);
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_market_stories_v02"),
    false,
  );
  assert.equal(tables.job_runs.at(-1)?.job_name, "run_detector_v02");
});

test("runDetector v0.2 can write Market Stories only when enabled", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: candlesForAllSymbols(),
    signal_events_v02: [
      storySignalRow(
        "story_seed_signal_a",
        "2026-06-14T00:00:00.000Z",
        "2026-06-14T01:00:00.000Z",
      ),
      storySignalRow(
        "story_seed_signal_b",
        "2026-06-14T04:00:00.000Z",
        "2026-06-14T05:00:00.000Z",
      ),
    ],
  });

  const result = await runDetector(db, {
    env: { DETECTOR_VERSION: "v02", ENABLE_MARKET_STORIES: "true" },
    now: detectorNow,
  });

  assert.equal(result.status, "success");
  assert.equal(result.detector_version, "v02");
  assert.ok(result.market_story_count! >= 1);
  assert.ok(result.market_stories_written! >= 1);
  assert.ok(tables.market_stories_v02.length >= 1);
  assert.ok(tables.market_story_members_v02.length >= 2);
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_market_stories_v02"),
    true,
  );
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(tables.source_references_v02.length, 0);
});

test("runDetector v0.1 ignores ENABLE_MARKET_STORIES", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: candlesForAllSymbols(),
  });

  const result = await runDetector(db, {
    env: { DETECTOR_VERSION: "v01", ENABLE_MARKET_STORIES: "true" },
    now: detectorNow,
  });

  assert.equal(result.status, "success");
  assert.equal(result.detector_version, "v01");
  assert.equal(tables.market_stories_v02.length, 0);
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_market_stories_v02"),
    false,
  );
});

test("runDetector v0.2 writes Audit Events and is idempotent", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: candlesForAllSymbols({
      spikeSymbols: ["BTCUSDT", "ETHUSDT"],
    }),
  });

  const firstRun = await runDetector(db, {
    env: { DETECTOR_VERSION: "v02" },
    now: detectorNow,
  });
  const secondRun = await runDetector(db, {
    env: { DETECTOR_VERSION: "v02" },
    now: detectorNow,
  });

  assert.equal(firstRun.status, "success");
  assert.equal(secondRun.status, "success");
  assert.equal(tables.signal_events_v02.length, 0);
  assert.equal(tables.audit_events_v02.length, firstRun.audit_count);
  assert.ok(tables.audit_events_v02.length >= 1);
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(tables.source_references_v02.length, 0);
  assert.equal(tables.incidents.length, 0);
});
