import assert from "node:assert/strict";
import test from "node:test";

import {
  ALLOWED_SYMBOLS,
  MARKET_INTERVAL,
  type MarketSymbol,
} from "../config.ts";
import { createMemoryD1 } from "../test/d1Memory.ts";
import type { Env } from "../types/env.ts";
import type { MarketCandle } from "../types/market.ts";
import {
  runIncrementalRefreshV02,
  runIncrementalSignalsV02,
} from "./runIncrementalRefreshV02.ts";

const baseTimeMs = Date.parse("2026-06-14T00:00:00.000Z");
const fifteenMinutesMs = 15 * 60 * 1000;
const now = new Date("2026-06-16T00:00:00.000Z");

function isoAt(index: number): string {
  return new Date(baseTimeMs + index * fifteenMinutesMs).toISOString();
}

function closeIsoAt(index: number): string {
  return new Date(
    baseTimeMs + (index + 1) * fifteenMinutesMs - 1,
  ).toISOString();
}

function syntheticCandles(symbol: MarketSymbol): MarketCandle[] {
  const candles: MarketCandle[] = [];
  let price = symbol === "BTCUSDT" ? 100 : 50;

  for (let index = 0; index < 192; index += 1) {
    const isSignalBar = index >= 189;
    const change = isSignalBar ? 0.02 : index % 2 === 0 ? 0.001 : -0.0008;
    const open = price;
    price *= 1 + change;
    const close = price;

    candles.push({
      symbol,
      interval: MARKET_INTERVAL,
      open_time: isoAt(index),
      close_time: closeIsoAt(index),
      open,
      high: isSignalBar ? close * 1.012 : close * 1.003,
      low: isSignalBar ? open * 0.988 : close * 0.997,
      close,
      volume: 100,
      quote_volume: isSignalBar ? 5000 : 1000,
      trade_count: 10,
    });
  }

  return candles;
}

function candlesForAllSymbols(): MarketCandle[] {
  return ALLOWED_SYMBOLS.flatMap((symbol) => syntheticCandles(symbol));
}

function env(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    ENABLE_V02_INCREMENTAL_REFRESH: "true",
    ENABLE_V02_INCREMENTAL_SIGNALS: "true",
    ENABLE_V02_INCREMENTAL_MARKET_STORIES: "true",
    V02_INCREMENTAL_TARGET_WINDOW_HOURS: "6",
    V02_INCREMENTAL_LOOKBACK_HOURS: "24",
    V02_MARKET_STORY_OPEN_TTL_HOURS: "72",
    ENABLE_V02_SIGNAL_CLAUDE_WORKFLOW_DISPATCH: "false",
    ...overrides,
  };
}

test("runIncrementalSignalsV02 dry-run writes no v0.2 rows or jobs", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: candlesForAllSymbols(),
  });

  const result = await runIncrementalSignalsV02(db, env(), {
    now,
    dryRun: true,
    targetWindowHours: 6,
    lookbackHours: 24,
  });

  assert.equal(result.status, "success");
  assert.equal(result.dry_run, true);
  assert.equal(result.window.target_start, "2026-06-15T18:00:00.000Z");
  assert.equal(tables.signal_events_v02.length, 0);
  assert.equal(tables.signal_event_symbols_v02.length, 0);
  assert.equal(tables.audit_events_v02.length, 0);
  assert.equal(tables.job_runs.length, 0);
});

test("runIncrementalRefreshV02 live run is bounded, idempotent, and Claude-free", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: candlesForAllSymbols(),
  });
  const testEnv = env();

  const first = await runIncrementalRefreshV02(db, testEnv, {
    now,
    dryRun: false,
    requestId: "test-incremental",
    targetWindowHours: 6,
    lookbackHours: 24,
    runMarketStories: true,
    dispatchClaude: false,
  });
  const signalCount = tables.signal_events_v02.length;
  const storyCount = tables.market_stories_v02.length;
  const second = await runIncrementalRefreshV02(db, testEnv, {
    now,
    dryRun: false,
    requestId: "test-incremental-repeat",
    targetWindowHours: 6,
    lookbackHours: 24,
    runMarketStories: true,
    dispatchClaude: false,
  });

  assert.equal(first.status, "success");
  assert.equal(second.status, "success");
  assert.equal(first.market_stories?.open_ttl_hours, 72);
  assert.equal(second.market_stories?.open_ttl_hours, 72);
  assert.ok(signalCount > 0);
  assert.equal(tables.signal_events_v02.length, signalCount);
  assert.equal(tables.market_stories_v02.length, storyCount);
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(tables.source_references_v02.length, 0);
  assert.equal(tables.claude_briefs.length, 0);
  assert.equal(tables.source_references.length, 0);
  assert.equal(
    tables.signal_events_v02.every(
      (row) =>
        row.event_end >= "2026-06-15T18:00:00.000Z" &&
        row.event_start <= "2026-06-16T00:00:00.000Z",
    ),
    true,
  );
  assert.equal(
    tables.job_runs.some(
      (row) => row.job_name === "run_incremental_signals_v02",
    ),
    true,
  );
  assert.equal(
    tables.job_runs.some(
      (row) => row.job_name === "run_incremental_market_stories_v02",
    ),
    true,
  );
});

test("runIncrementalRefreshV02 does not dispatch Claude when scaffold flag is disabled", async () => {
  const { db } = createMemoryD1({
    market_candles: candlesForAllSymbols(),
  });

  const result = await runIncrementalRefreshV02(db, env(), {
    now,
    dryRun: false,
    targetWindowHours: 6,
    lookbackHours: 24,
    runMarketStories: false,
    dispatchClaude: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.claude_dispatch?.dispatch_status, "skipped_disabled");
  assert.equal(result.claude_dispatch?.dispatch_attempted, false);
});
