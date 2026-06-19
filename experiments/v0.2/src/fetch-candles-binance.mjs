#!/usr/bin/env node

// One-off snapshot builder that sources candles directly from Binance public
// klines (no ByteSiren Worker URL required). Writes the same snapshot shape
// that loadCandleSnapshot() expects.

import { fetchSymbolCandles } from "../../../scripts/import-binance-candles.mjs";
import { CANDLES_SNAPSHOT_PATH, SYMBOLS, writeJson } from "./shared.mjs";

const DAYS = 30;

async function main() {
  const now = new Date();
  const endTimeMs = now.getTime();
  const startTimeMs = endTimeMs - DAYS * 24 * 60 * 60 * 1000;
  const candlesBySymbol = {};

  for (const symbol of SYMBOLS) {
    const candles = await fetchSymbolCandles({ symbol, startTimeMs, endTimeMs });
    candlesBySymbol[symbol] = candles;
    const first = candles[0]?.open_time ?? "none";
    const last = candles.at(-1)?.open_time ?? "none";
    console.log(`${symbol}: ${candles.length} candles (${first} -> ${last})`);
  }

  const snapshot = {
    fetched_at: now.toISOString(),
    api_base_url: "https://data-api.binance.vision (direct)",
    symbols: SYMBOLS,
    candles_by_symbol: candlesBySymbol,
  };

  await writeJson(CANDLES_SNAPSHOT_PATH, snapshot);
  console.log(`Wrote ${CANDLES_SNAPSHOT_PATH}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Fetch failed.");
  process.exitCode = 1;
});
