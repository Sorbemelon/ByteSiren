import assert from "node:assert/strict";
import test from "node:test";

import {
  ALLOWED_SYMBOLS,
  MARKET_INTERVAL,
  type MarketSymbol,
} from "../config.ts";
import { runDetector } from "./runDetector.ts";
import { runDetectorV02 } from "./runDetectorV02.ts";
import type { MarketCandle } from "../types/market.ts";
import { createMemoryD1 } from "../test/d1Memory.ts";
import {
  signalEventStorageIdV02,
  upsertDetectorV02Output,
  upsertDetectorV02OutputForRange,
} from "../db/v02DetectorRepository.ts";
import type { SignalEventV02 } from "../services/detectorV02/index.ts";

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
    spikeBars?: number;
    spikeChangePct?: number;
  } = {},
): MarketCandle[] {
  const count = options.count ?? 98;
  const spikeBars = options.spikeBars ?? 1;
  const spikeChangePct = options.spikeChangePct ?? 0.02;
  const candles: MarketCandle[] = [];
  let price = symbol === "BTCUSDT" ? 100 : 50;

  for (let index = 0; index < count; index += 1) {
    const isSignalBar = Boolean(options.spike && index >= count - spikeBars);
    const change = isSignalBar
      ? spikeChangePct
      : index % 2 === 0
        ? 0.001
        : -0.0008;
    const open = price;
    price *= 1 + change;
    const close = price;
    const high = isSignalBar ? close * 1.012 : close * 1.003;
    const low = isSignalBar ? open * 0.988 : close * 0.997;

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
      quote_volume: isSignalBar ? 5000 : 1000,
      trade_count: 10,
    });
  }

  return candles;
}

function candlesForAllSymbols(
  options: {
    count?: number;
    spikeSymbols?: MarketSymbol[];
    spikeBars?: number;
    spikeChangePct?: number;
  } = {},
): MarketCandle[] {
  const spikeSymbols = options.spikeSymbols ?? [...ALLOWED_SYMBOLS];

  return ALLOWED_SYMBOLS.flatMap((symbol) =>
    syntheticCandles(symbol, {
      count: options.count,
      spike: spikeSymbols.includes(symbol),
      spikeBars: options.spikeBars,
      spikeChangePct: options.spikeChangePct,
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

function staleSignalSymbolRow(signalEventId: string, symbol: MarketSymbol) {
  return {
    id: `${signalEventId}_${symbol}`,
    signal_event_id: signalEventId,
    symbol,
    window_change_pct: 0.1,
    peak_15m_change_pct: 0.1,
    volume_ratio: 1,
    range_position: "inside_range",
    prev_24h_high: 101,
    prev_24h_low: 99,
    range_break_direction: "none",
    range_break_pct: 0,
    range_break_strength: 0,
    distance_to_range_high_pct: 1,
    distance_to_range_low_pct: 1,
    is_lead_mover: 0,
    is_peak_15m_highlight: 0,
    participated: 1,
    evidence_json: "{}",
    created_at: "2026-06-14T00:00:00.000Z",
    updated_at: "2026-06-14T00:00:00.000Z",
  };
}

function detectorSignalEvent(index: number): SignalEventV02 {
  const start = isoAt(96 + index);
  const end = closeIsoAt(96 + index);
  const id = `vnext_fixture_${index}`;

  return {
    id,
    date_utc: start.slice(0, 10),
    event_start: start,
    event_end: end,
    duration_min: 15,
    peak_time: start,
    direction: "observed_up",
    signals_count: 5,
    n_tracked: 5,
    avg_change_pct: 1,
    avg_change_method: "median_participating_symbols",
    event_strength_score: 75,
    impact_label: "High",
    chart_context_score: 80,
    chart_context_label: "Range break",
    event_story_type: "range_break_up",
    trend_context: "trend_up",
    momentum_context: "impulse",
    volatility_context: "ordinary_volatility",
    event_range_context: "broad_broke_high",
    chart_context_reasons_json: "[]",
    chart_context_warnings_json: "[]",
    macro_aligned: false,
    nearest_macro_event: null,
    macro_delta_min: null,
    source_route_hint: "broad_market",
    direction_changed: false,
    direction_history_json: "[]",
    publish_candidate: true,
    publish_reason: "broad_confirmed_break",
    suppress_reason: null,
    detector_version: "v02",
    symbols: ALLOWED_SYMBOLS.map((symbol) => ({
      id: `${id}_${symbol}`,
      signal_event_id: id,
      symbol,
      window_change_pct: 1,
      peak_15m_change_pct: 1,
      volume_ratio: 1.5,
      range_position: "broke_high",
      prev_24h_high: 101,
      prev_24h_low: 99,
      range_break_direction: "up",
      range_break_pct: 1,
      range_break_strength: 1,
      distance_to_range_high_pct: 0,
      distance_to_range_low_pct: 2,
      is_lead_mover: symbol === "BTCUSDT",
      is_peak_15m_highlight: symbol === "BTCUSDT",
      participated: true,
      evidence_json: "{}",
    })),
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
    market_candles: candlesForAllSymbols({ count: 112, spikeBars: 3 }),
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

test("runDetector v0.2 runs Market Story job only when enabled", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: candlesForAllSymbols({ count: 112, spikeBars: 3 }),
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
  assert.ok(result.market_story_count! >= 0);
  assert.ok(result.market_stories_written! >= 0);
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

test("runDetector v0.2 writes detector rows and is idempotent", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: candlesForAllSymbols({
      count: 112,
      spikeSymbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
      spikeBars: 3,
      spikeChangePct: 0.003,
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
  assert.equal(tables.signal_events_v02.length, firstRun.signal_count);
  assert.equal(tables.audit_events_v02.length, firstRun.audit_count);
  assert.ok(
    tables.signal_events_v02.length + tables.audit_events_v02.length >= 1,
  );
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(tables.source_references_v02.length, 0);
  assert.equal(tables.incidents.length, 0);
});

test("runDetectorV02 bounded dry-run estimates work without writing rows or jobs", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: candlesForAllSymbols({ count: 192, spikeBars: 3 }),
  });

  const result = await runDetectorV02(db, {
    now: detectorNow,
    dateFrom: "2026-06-15",
    dateTo: "2026-06-15",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.bounded, true);
  assert.equal(result.dry_run, true);
  assert.equal(result.date_from, "2026-06-15");
  assert.equal(result.date_to, "2026-06-15");
  assert.ok((result.candles_loaded ?? 0) > 0);
  assert.equal(tables.signal_events_v02.length, 0);
  assert.equal(tables.audit_events_v02.length, 0);
  assert.equal(tables.job_runs.length, 0);
});

test("runDetectorV02 bounded live run writes only overlapping target range", async () => {
  const existing = storySignalRow(
    "story_seed_signal_previous_day",
    "2026-06-14T10:00:00.000Z",
    "2026-06-14T10:45:00.000Z",
  );
  const { db, tables } = createMemoryD1({
    market_candles: candlesForAllSymbols({ count: 192, spikeBars: 3 }),
    signal_events_v02: [existing],
    signal_event_symbols_v02: [
      staleSignalSymbolRow("story_seed_signal_previous_day", "BTCUSDT"),
    ],
  });

  const first = await runDetectorV02(db, {
    now: detectorNow,
    dateFrom: "2026-06-15",
    dateTo: "2026-06-15",
  });
  const countAfterFirst = tables.signal_events_v02.length;
  const second = await runDetectorV02(db, {
    now: detectorNow,
    dateFrom: "2026-06-15",
    dateTo: "2026-06-15",
  });

  assert.equal(first.status, "success");
  assert.equal(second.status, "success");
  assert.equal(tables.signal_events_v02.length, countAfterFirst);
  assert.equal(
    tables.signal_events_v02.some((row) => row.id === existing.id),
    true,
  );
  assert.equal(
    tables.signal_events_v02.every(
      (row) =>
        row.id === existing.id ||
        (row.event_end >= "2026-06-15T00:00:00.000Z" &&
          row.event_start <= "2026-06-15T23:59:59.999Z"),
    ),
    true,
  );
  assert.equal(
    tables.job_runs.some(
      (row) =>
        row.job_name === "run_detector_v02" &&
        JSON.parse(row.metadata_json).bounded === true,
    ),
    true,
  );
});

test("runDetectorV02 half-day bounded chunks include lookback and stay idempotent", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: candlesForAllSymbols({ count: 192, spikeBars: 3 }),
  });

  const morning = await runDetectorV02(db, {
    now: detectorNow,
    dateFrom: "2026-06-15",
    dateTo: "2026-06-15",
    timeFrom: "2026-06-15T00:00:00.000Z",
    timeTo: "2026-06-15T11:59:59.999Z",
  });
  const afternoon = await runDetectorV02(db, {
    now: detectorNow,
    dateFrom: "2026-06-15",
    dateTo: "2026-06-15",
    timeFrom: "2026-06-15T12:00:00.000Z",
    timeTo: "2026-06-15T23:59:59.999Z",
  });
  const countAfterAfternoon = tables.signal_events_v02.length;
  const afternoonAgain = await runDetectorV02(db, {
    now: detectorNow,
    dateFrom: "2026-06-15",
    dateTo: "2026-06-15",
    timeFrom: "2026-06-15T12:00:00.000Z",
    timeTo: "2026-06-15T23:59:59.999Z",
  });
  const metadata = tables.job_runs
    .filter((row) => row.job_name === "run_detector_v02")
    .map((row) => JSON.parse(row.metadata_json));

  assert.equal(morning.status, "success");
  assert.equal(afternoon.status, "success");
  assert.equal(afternoonAgain.status, "success");
  assert.equal(morning.time_from, "2026-06-15T00:00:00.000Z");
  assert.equal(afternoon.time_to, "2026-06-15T23:59:59.999Z");
  assert.equal(tables.signal_events_v02.length, countAfterAfternoon);
  assert.equal(
    tables.signal_events_v02.every(
      (row) =>
        row.event_end >= "2026-06-15T00:00:00.000Z" &&
        row.event_start <= "2026-06-15T23:59:59.999Z",
    ),
    true,
  );
  assert.equal(
    metadata.some(
      (row) =>
        row.time_from === "2026-06-15T12:00:00.000Z" &&
        row.time_to === "2026-06-15T23:59:59.999Z",
    ),
    true,
  );
});

test("v0.2 Signal Event storage identity survives a later window extension", async () => {
  const { db, tables } = createMemoryD1();
  const first = detectorSignalEvent(0);
  const extendedId = "vnext_fixture_0_extended";
  const extended: SignalEventV02 = {
    ...first,
    id: extendedId,
    event_end: closeIsoAt(101),
    duration_min: 90,
    avg_change_pct: 2.5,
    symbols: first.symbols.map((symbol) => ({
      ...symbol,
      id: `${extendedId}_${symbol.symbol}`,
      signal_event_id: extendedId,
      window_change_pct: 2.5,
    })),
  };
  const stableId = signalEventStorageIdV02(first);

  await upsertDetectorV02Output(db, {
    signal_events: [first],
    audit_events: [],
  });
  await upsertDetectorV02Output(db, {
    signal_events: [extended],
    audit_events: [],
  });

  assert.equal(tables.signal_events_v02.length, 1);
  assert.equal(tables.signal_events_v02[0].id, stableId);
  assert.equal(tables.signal_events_v02[0].event_end, extended.event_end);
  assert.equal(tables.signal_events_v02[0].duration_min, 90);
  assert.equal(tables.signal_events_v02[0].avg_change_pct, 2.5);
  assert.equal(tables.signal_event_symbols_v02.length, ALLOWED_SYMBOLS.length);
  assert.equal(
    tables.signal_event_symbols_v02.every(
      (symbol) => symbol.signal_event_id === stableId,
    ),
    true,
  );
});

test("v0.2 bounded detector pruning keeps public enriched Signals", async () => {
  const staleId = "signal_v02_20260629113000_up";
  const staleStart = "2026-06-29T11:30:00.000Z";
  const staleEnd = "2026-06-29T12:14:59.998Z";
  const nextSignal = detectorSignalEvent(116);
  const { db, tables } = createMemoryD1({
    signal_events_v02: [storySignalRow(staleId, staleStart, staleEnd)],
    signal_event_symbols_v02: ALLOWED_SYMBOLS.map((symbol) =>
      staleSignalSymbolRow(staleId, symbol),
    ),
    claude_briefs_v02: [
      {
        id: `claude_v02_signal_event_${staleId}`,
        target_type: "signal_event_v02",
        target_id: staleId,
        prompt_mode: "signal_event",
        status: "no_clear_cause",
        public_label: "No Clear Cause",
        classification: "No Clear Cause",
        confidence: "low",
        headline: "No clear public catalyst",
        collapsed_summary: "Fresh Claude context.",
        context_details: null,
        source_support: "none",
        source_timing_alignment: "none",
        validation_flags_json: "{}",
        detector_feedback_json: "{}",
        prompt_version: "v02-signal-event-v1",
        model: "claude-sonnet-4-6",
        error_code: null,
        error_message: null,
        created_at: staleStart,
        updated_at: staleStart,
      },
    ],
  });

  await upsertDetectorV02OutputForRange(
    db,
    {
      signal_events: [nextSignal],
      audit_events: [],
    },
    {
      startIso: "2026-06-29T10:00:00.000Z",
      endIso: "2026-06-29T18:00:00.000Z",
    },
  );

  assert.equal(
    tables.signal_events_v02.some((row) => row.id === staleId),
    true,
  );
  assert.equal(
    tables.signal_event_symbols_v02.some(
      (row) => row.signal_event_id === staleId,
    ),
    true,
  );
  assert.equal(
    tables.signal_events_v02.some(
      (row) => row.id === signalEventStorageIdV02(nextSignal),
    ),
    true,
  );
});

test("v0.2 bounded detector canonicalizes overlapping public Signals to the existing row", async () => {
  const existingStart = isoAt(100);
  const existingEnd = closeIsoAt(124);
  const incoming = {
    ...detectorSignalEvent(24),
    event_end: closeIsoAt(132),
    duration_min: 195,
  };
  const existingId = signalEventStorageIdV02({
    event_start: existingStart,
    direction: "observed_up",
  });
  const incomingStorageId = signalEventStorageIdV02(incoming);
  const { db, tables } = createMemoryD1({
    signal_events_v02: [storySignalRow(existingId, existingStart, existingEnd)],
    signal_event_symbols_v02: ALLOWED_SYMBOLS.map((symbol) =>
      staleSignalSymbolRow(existingId, symbol),
    ),
  });

  await upsertDetectorV02OutputForRange(
    db,
    {
      signal_events: [incoming],
      audit_events: [],
    },
    {
      startIso: existingStart,
      endIso: incoming.event_end,
    },
  );

  assert.equal(tables.signal_events_v02.length, 1);
  assert.equal(tables.signal_events_v02[0].id, existingId);
  assert.equal(tables.signal_events_v02[0].event_start, existingStart);
  assert.equal(tables.signal_events_v02[0].event_end, incoming.event_end);
  assert.equal(
    tables.signal_events_v02.some((row) => row.id === incomingStorageId),
    false,
  );
  assert.equal(tables.signal_event_symbols_v02.length, ALLOWED_SYMBOLS.length);
  assert.equal(
    tables.signal_event_symbols_v02.every(
      (symbol) => symbol.signal_event_id === existingId,
    ),
    true,
  );
});

test("v0.2 detector output pruning handles more than SQLite bind limit", async () => {
  const staleIds = Array.from({ length: 1100 }, (_, index) => `stale_${index}`);
  const { db, tables } = createMemoryD1({
    signal_events_v02: staleIds.map((id) =>
      storySignalRow(id, isoAt(96), closeIsoAt(96)),
    ),
    signal_event_symbols_v02: staleIds.flatMap((id) =>
      ALLOWED_SYMBOLS.map((symbol) => staleSignalSymbolRow(id, symbol)),
    ),
  });
  const signalEvents = Array.from({ length: 220 }, (_, index) =>
    detectorSignalEvent(index),
  );

  const result = await upsertDetectorV02Output(db, {
    signal_events: signalEvents,
    audit_events: [],
  });

  assert.equal(result.signal_events, signalEvents.length);
  assert.equal(result.signal_event_symbols, signalEvents.length * 5);
  assert.equal(tables.signal_events_v02.length, signalEvents.length);
  assert.equal(tables.signal_event_symbols_v02.length, signalEvents.length * 5);
  assert.equal(
    tables.signal_events_v02.some((row) => row.id.startsWith("stale_")),
    false,
  );
  assert.equal(
    tables.signal_event_symbols_v02.some((row) => row.id.startsWith("stale_")),
    false,
  );
});
