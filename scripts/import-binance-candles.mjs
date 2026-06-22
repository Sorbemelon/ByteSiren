#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const BINANCE_BASE_URL = "https://data-api.binance.vision";
const BINANCE_KLINES_PATH = "/api/v3/klines";
const BINANCE_LIMIT = 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_HOURS = 6;
const MARKET_INTERVAL = "15m";
const ALLOWED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"];
const TRANSIENT_WORKER_STATUSES = new Set([502, 503, 504]);
const MAX_UPLOAD_RETRIES = 2;

function readOption(argv, name) {
  const equalsPrefix = `${name}=`;
  const equalsValue = argv.find((item) => item.startsWith(equalsPrefix));

  if (equalsValue) {
    return equalsValue.slice(equalsPrefix.length);
  }

  const index = argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
}

function readPositiveNumber(value, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive number, received: ${value}`);
  }

  return parsed;
}

function parseSymbols(value) {
  const symbols = (value ?? ALLOWED_SYMBOLS.join(","))
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    throw new Error("At least one symbol is required.");
  }

  for (const symbol of symbols) {
    if (!ALLOWED_SYMBOLS.includes(symbol)) {
      throw new Error(`Unsupported symbol: ${symbol}`);
    }
  }

  return symbols;
}

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const daysValue = readOption(argv, "--days");
  const hoursValue = readOption(argv, "--hours");
  const dryRun = argv.includes("--dry-run");
  const options = {
    workerUrl: readOption(argv, "--worker-url") ?? env.BYTESIREN_WORKER_URL,
    token: readOption(argv, "--token") ?? env.BYTESIREN_MARKET_IMPORT_TOKEN,
    symbols: parseSymbols(readOption(argv, "--symbols")),
    days:
      daysValue === undefined
        ? undefined
        : readPositiveNumber(daysValue, undefined),
    hours:
      hoursValue === undefined
        ? undefined
        : readPositiveNumber(hoursValue, undefined),
    chunkSize: Math.trunc(
      readPositiveNumber(readOption(argv, "--chunk-size"), DEFAULT_CHUNK_SIZE),
    ),
    runDetectorLast: argv.includes("--run-detector-last"),
    dryRun,
  };

  if (options.chunkSize > DEFAULT_CHUNK_SIZE) {
    throw new Error(`Chunk size must be ${DEFAULT_CHUNK_SIZE} or less.`);
  }

  if (!options.dryRun && !options.workerUrl) {
    throw new Error("--worker-url is required unless --dry-run is used.");
  }

  if (!options.dryRun && !options.token) {
    throw new Error("--token is required unless --dry-run is used.");
  }

  return options;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toNumber(value, field) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid Binance ${field} value.`);
  }

  return parsed;
}

export function binanceRowsToCandles(rows) {
  return rows.map((row, index) => {
    if (!Array.isArray(row) || row.length < 9) {
      throw new Error(`Invalid Binance kline row at index ${index}.`);
    }

    return {
      open_time: new Date(toNumber(row[0], "open_time")).toISOString(),
      close_time: new Date(toNumber(row[6], "close_time")).toISOString(),
      open: toNumber(row[1], "open"),
      high: toNumber(row[2], "high"),
      low: toNumber(row[3], "low"),
      close: toNumber(row[4], "close"),
      volume: toNumber(row[5], "volume"),
      quote_volume: toNumber(row[7], "quote_volume"),
      trade_count: Math.trunc(toNumber(row[8], "trade_count")),
    };
  });
}

export function chunkArray(items, chunkSize) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function buildBinanceUrl({ symbol, startTimeMs, endTimeMs }) {
  const url = new URL(BINANCE_KLINES_PATH, BINANCE_BASE_URL);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", MARKET_INTERVAL);
  url.searchParams.set("limit", String(BINANCE_LIMIT));
  url.searchParams.set("startTime", String(startTimeMs));
  url.searchParams.set("endTime", String(endTimeMs));

  return url;
}

async function fetchBinanceRows({ symbol, startTimeMs, endTimeMs, fetchImpl }) {
  const url = buildBinanceUrl({ symbol, startTimeMs, endTimeMs });
  const response = await fetchImpl(url);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Binance fetch failed for ${symbol}: HTTP ${response.status} ${text
        .replace(/\s+/g, " ")
        .slice(0, 120)}`,
    );
  }

  const parsed = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    throw new Error(`Binance response for ${symbol} was not an array.`);
  }

  return parsed;
}

export async function fetchSymbolCandles({
  symbol,
  startTimeMs,
  endTimeMs,
  fetchImpl = fetch,
}) {
  const candlesByOpenTime = new Map();
  let nextStartTimeMs = startTimeMs;

  while (nextStartTimeMs <= endTimeMs) {
    const rows = await fetchBinanceRows({
      symbol,
      startTimeMs: nextStartTimeMs,
      endTimeMs,
      fetchImpl,
    });

    if (rows.length === 0) {
      break;
    }

    const candles = binanceRowsToCandles(rows);

    for (const candle of candles) {
      candlesByOpenTime.set(candle.open_time, candle);
    }

    const lastOpenTimeMs = toNumber(rows.at(-1)?.[0], "open_time");
    nextStartTimeMs = lastOpenTimeMs + FIFTEEN_MINUTES_MS;

    if (rows.length < BINANCE_LIMIT) {
      break;
    }
  }

  return [...candlesByOpenTime.values()].sort((a, b) =>
    a.open_time.localeCompare(b.open_time),
  );
}

async function uploadCandlesOnce({
  workerUrl,
  token,
  symbol,
  candles,
  runDetector,
  fetchImpl,
}) {
  const url = new URL("/api/ingest/candles", workerUrl);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bytesiren-market-token": token,
    },
    body: JSON.stringify({
      symbol,
      interval: MARKET_INTERVAL,
      candles,
      run_detector: runDetector,
    }),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Worker import failed for ${symbol}: HTTP ${response.status} ${text
        .replace(/\s+/g, " ")
        .slice(0, 160)}`,
    );
  }

  return JSON.parse(text);
}

async function uploadCandles({
  workerUrl,
  token,
  symbol,
  candles,
  runDetector,
  fetchImpl,
  logger,
  sleep,
}) {
  for (let attempt = 0; attempt <= MAX_UPLOAD_RETRIES; attempt += 1) {
    try {
      return await uploadCandlesOnce({
        workerUrl,
        token,
        symbol,
        candles,
        runDetector,
        fetchImpl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      const statusMatch = /HTTP (\d{3})/.exec(message);
      const status = statusMatch ? Number(statusMatch[1]) : null;
      const canRetry =
        status !== null &&
        TRANSIENT_WORKER_STATUSES.has(status) &&
        attempt < MAX_UPLOAD_RETRIES;

      if (!canRetry) {
        throw error;
      }

      const retryNumber = attempt + 1;
      logger.log(
        `${symbol}: Worker import HTTP ${status}; retry ${retryNumber}/${MAX_UPLOAD_RETRIES}.`,
      );
      await sleep(500 * retryNumber);
    }
  }

  throw new Error(`Worker import failed for ${symbol}.`);
}

function lookbackStart(options, now) {
  if (options.days !== undefined) {
    return now.getTime() - options.days * 24 * 60 * 60 * 1000;
  }

  return now.getTime() - (options.hours ?? DEFAULT_HOURS) * 60 * 60 * 1000;
}

export async function runImport(
  options,
  { fetchImpl = fetch, logger = console, now = new Date(), sleep = wait } = {},
) {
  const startTimeMs = lookbackStart(options, now);
  const endTimeMs = now.getTime();
  let totalFetched = 0;
  let totalUploaded = 0;

  if (options.runDetectorLast) {
    logger.log(
      "Manual option --run-detector-last is not recommended for scheduled production imports.",
    );
  }

  for (const [symbolIndex, symbol] of options.symbols.entries()) {
    const candles = await fetchSymbolCandles({
      symbol,
      startTimeMs,
      endTimeMs,
      fetchImpl,
    });
    const chunks = chunkArray(candles, options.chunkSize);

    totalFetched += candles.length;
    const firstOpenTime = candles[0]?.open_time ?? "none";
    const lastOpenTime = candles.at(-1)?.open_time ?? "none";
    logger.log(
      `${symbol}: fetched ${candles.length} candles (${firstOpenTime} -> ${lastOpenTime}); chunks ${chunks.length}.`,
    );

    if (options.dryRun) {
      logger.log(`${symbol}: dry-run, upload skipped.`);
      continue;
    }

    for (const [chunkIndex, chunk] of chunks.entries()) {
      const runDetector =
        options.runDetectorLast &&
        symbolIndex === options.symbols.length - 1 &&
        chunkIndex === chunks.length - 1;

      const uploadResponse = await uploadCandles({
        workerUrl: options.workerUrl,
        token: options.token,
        symbol,
        candles: chunk,
        runDetector,
        fetchImpl,
        logger,
        sleep,
      });
      totalUploaded += chunk.length;
      logger.log(
        `${symbol}: chunk ${chunkIndex + 1}/${chunks.length} accepted; received=${uploadResponse.received ?? "?"}; upserted=${uploadResponse.upserted ?? "?"}; detector_ran=${uploadResponse.detector?.ran === true}.`,
      );
    }

    logger.log(`${symbol}: uploaded ${candles.length} candles.`);
  }

  logger.log(
    `Import complete: fetched ${totalFetched} candles; uploaded ${totalUploaded} candles.`,
  );

  return {
    fetched: totalFetched,
    uploaded: totalUploaded,
  };
}

async function main() {
  const options = parseArgs();
  await runImport(options);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Import failed.");
    process.exitCode = 1;
  });
}
