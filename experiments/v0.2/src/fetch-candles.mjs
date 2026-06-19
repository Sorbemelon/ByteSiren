#!/usr/bin/env node

import {
  CANDLES_SNAPSHOT_PATH,
  SYMBOLS,
  isMain,
  readOption,
  writeJson,
} from "./shared.mjs";

function parseApiBaseUrl(argv = process.argv.slice(2), env = process.env) {
  const value =
    readOption(argv, "--api-base-url") ??
    readOption(argv, "--api-base") ??
    env.API_BASE_URL;

  if (!value) {
    throw new Error(
      "API_BASE_URL or --api-base-url is required. No default API base is used.",
    );
  }

  return value;
}

function outputPath(argv = process.argv.slice(2)) {
  return readOption(argv, "--output") ?? CANDLES_SNAPSHOT_PATH;
}

async function fetchSymbolCandles({ apiBaseUrl, symbol, fetchImpl = fetch }) {
  const url = new URL("/api/market/candles", apiBaseUrl);
  url.searchParams.set("symbol", symbol);

  const response = await fetchImpl(url);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `${symbol}: candle fetch failed with HTTP ${response.status}: ${text
        .replace(/\s+/g, " ")
        .slice(0, 160)}`,
    );
  }

  const parsed = JSON.parse(text);

  if (!parsed || !Array.isArray(parsed.candles)) {
    throw new Error(`${symbol}: response did not contain a candles array.`);
  }

  return parsed.candles;
}

export async function fetchCandleSnapshot(
  options,
  { fetchImpl = fetch, now = new Date(), logger = console } = {},
) {
  const candlesBySymbol = {};

  for (const symbol of SYMBOLS) {
    const candles = await fetchSymbolCandles({
      apiBaseUrl: options.apiBaseUrl,
      symbol,
      fetchImpl,
    });
    candlesBySymbol[symbol] = candles;
    logger.log(`${symbol}: fetched ${candles.length} candles.`);
  }

  const snapshot = {
    fetched_at: now.toISOString(),
    api_base_url: options.apiBaseUrl,
    symbols: SYMBOLS,
    candles_by_symbol: candlesBySymbol,
  };

  await writeJson(options.outputPath, snapshot);
  logger.log(`Wrote ${options.outputPath}.`);

  return snapshot;
}

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  return {
    apiBaseUrl: parseApiBaseUrl(argv, env),
    outputPath: outputPath(argv),
  };
}

if (isMain(import.meta.url)) {
  fetchCandleSnapshot(parseArgs()).catch((error) => {
    console.error(error instanceof Error ? error.message : "Fetch failed.");
    process.exitCode = 1;
  });
}
