import assert from "node:assert/strict";
import test from "node:test";

import { MARKET_INTERVAL } from "../config.ts";
import {
  fetchPaginatedKlines,
  parseBinanceKlineRow,
  validateMarketSymbol,
} from "./binance.ts";

const sampleRow = [
  1718327700000,
  "63000.00",
  "65000.00",
  "62800.00",
  "64775.20",
  "123.45",
  1718328599999,
  "8000000.00",
  42,
  "0",
  "0",
  "0",
];

test("parseBinanceKlineRow converts Binance rows into internal candles", () => {
  const candle = parseBinanceKlineRow(sampleRow, "BTCUSDT");

  assert.equal(candle.symbol, "BTCUSDT");
  assert.equal(candle.interval, MARKET_INTERVAL);
  assert.equal(candle.open_time, "2024-06-14T01:15:00.000Z");
  assert.equal(candle.close_time, "2024-06-14T01:29:59.999Z");
  assert.equal(candle.open, 63000);
  assert.equal(candle.high, 65000);
  assert.equal(candle.low, 62800);
  assert.equal(candle.close, 64775.2);
  assert.equal(candle.volume, 123.45);
  assert.equal(candle.quote_volume, 8000000);
  assert.equal(candle.trade_count, 42);
});

test("validateMarketSymbol rejects symbols outside the source-approved list", () => {
  assert.doesNotThrow(() => validateMarketSymbol("BTCUSDT"));
  assert.throws(() => validateMarketSymbol("DOGEUSDT"), /not supported/);
});

test("fetchPaginatedKlines advances by the next 15m open time", async () => {
  const requestedStartTimes: string[] = [];
  const rows = [
    [sampleRow],
    [[1718328600000, "1", "2", "1", "2", "3", 1718329499999, "4", 5]],
    [],
  ];

  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    requestedStartTimes.push(url.searchParams.get("startTime") ?? "");
    const body = JSON.stringify(rows.shift() ?? []);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  };

  const candles = await fetchPaginatedKlines({
    symbol: "BTCUSDT",
    startTimeMs: 1718327700000,
    endTimeMs: 1718330400000,
    limit: 1,
    maxPages: 3,
    fetcher,
  });

  assert.equal(candles.length, 2);
  assert.deepEqual(requestedStartTimes, [
    "1718327700000",
    "1718328600000",
    "1718329500000",
  ]);
});
