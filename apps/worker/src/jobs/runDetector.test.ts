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

test("runDetector skips safely when any symbol lacks sufficient candles", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: candlesForAllSymbols({ count: 96 }),
  });

  const result = await runDetector(db, detectorNow);

  assert.equal(result.status, "skipped");
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
