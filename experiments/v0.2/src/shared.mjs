import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const EXPERIMENT_VERSION = "v0.2A";
export const SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"];
export const INTERVAL = "15m";
export const N_TRACKED = SYMBOLS.length;
export const EXPERIMENT_ROOT = path.resolve("experiments/v0.2");
export const DATA_DIR = path.join(EXPERIMENT_ROOT, "data");
export const OUTPUTS_DIR = path.join(EXPERIMENT_ROOT, "outputs");
export const CANDLES_SNAPSHOT_PATH = path.join(DATA_DIR, "candles_30d.json");
export const BASELINE_EVENTS_PATH = path.join(
  OUTPUTS_DIR,
  "baseline_v01_events.json",
);
export const BASELINE_SUMMARY_PATH = path.join(
  OUTPUTS_DIR,
  "baseline_v01_summary.json",
);
export const VNEXT_EVENTS_PATH = path.join(OUTPUTS_DIR, "vnext_a_events.json");
export const VNEXT_SUMMARY_PATH = path.join(
  OUTPUTS_DIR,
  "vnext_a_summary.json",
);
export const COMPARISON_JSON_PATH = path.join(
  OUTPUTS_DIR,
  "detector_comparison.json",
);
export const COMPARISON_MD_PATH = path.join(
  OUTPUTS_DIR,
  "detector_comparison.md",
);

export function readOption(argv, name) {
  const equalsPrefix = `${name}=`;
  const equalsValue = argv.find((item) => item.startsWith(equalsPrefix));

  if (equalsValue) {
    return equalsValue.slice(equalsPrefix.length);
  }

  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

export function roundNumber(value, digits = 4) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(digits));
}

export function average(values) {
  const finite = values.filter((value) => Number.isFinite(value));

  if (finite.length === 0) {
    return null;
  }

  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

export function median(values) {
  const finite = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (finite.length === 0) {
    return null;
  }

  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 === 1
    ? finite[middle]
    : (finite[middle - 1] + finite[middle]) / 2;
}

export function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

export function isoForPath(iso) {
  return iso.replace(/[-:]/g, "").replace(".000Z", "Z").toLowerCase();
}

export function durationMinutes(startIso, endIso) {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  return Math.max(0, Math.round((end - start) / 60000));
}

export function nearestMinutes(aIso, bIso) {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);

  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return null;
  }

  return Math.abs(a - b) / 60000;
}

export function isMain(importMetaUrl) {
  return (
    Boolean(process.argv[1]) &&
    importMetaUrl === pathToFileURL(process.argv[1]).href
  );
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value.endsWith("\n") ? value : `${value}\n`);
}

export function normalizeCandle(symbol, candle) {
  return {
    symbol,
    interval: candle.interval ?? INTERVAL,
    open_time: candle.open_time,
    close_time: candle.close_time,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume ?? 0),
    quote_volume: Number(candle.quote_volume ?? candle.quoteVolume ?? 0),
    trade_count:
      candle.trade_count === undefined || candle.trade_count === null
        ? null
        : Math.trunc(Number(candle.trade_count)),
  };
}

export function normalizeCandlesBySymbol(candlesBySymbol) {
  const normalized = {};

  for (const symbol of SYMBOLS) {
    normalized[symbol] = (candlesBySymbol[symbol] ?? [])
      .map((candle) => normalizeCandle(symbol, candle))
      .filter(
        (candle) =>
          candle.open_time &&
          candle.close_time &&
          Number.isFinite(candle.open) &&
          Number.isFinite(candle.high) &&
          Number.isFinite(candle.low) &&
          Number.isFinite(candle.close),
      )
      .sort((a, b) => a.open_time.localeCompare(b.open_time));
  }

  return normalized;
}

export async function loadCandleSnapshot(filePath = CANDLES_SNAPSHOT_PATH) {
  const snapshot = await readJson(filePath);
  return {
    ...snapshot,
    symbols: snapshot.symbols ?? SYMBOLS,
    candles_by_symbol: normalizeCandlesBySymbol(snapshot.candles_by_symbol),
  };
}

export function buildEventSummary(events, options = {}) {
  const durations = events
    .map((event) => event.duration_min)
    .filter((value) => Number.isFinite(value));
  const avgDuration = average(durations);
  const medianDuration = median(durations);
  const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
  const missingWindowFields = events.filter(
    (event) =>
      !event.window_start ||
      !event.window_end ||
      !event.peak_time ||
      !Number.isFinite(event.duration_min),
  ).length;

  return {
    event_count: events.length,
    raw_signal_count: options.rawSignalCount ?? null,
    avg_duration_min: avgDuration === null ? null : roundNumber(avgDuration, 2),
    median_duration_min:
      medianDuration === null ? null : roundNumber(medianDuration, 2),
    max_duration_min: roundNumber(maxDuration, 2),
    count_0_30_min: durations.filter((value) => value <= 30).length,
    count_30_90_min: durations.filter((value) => value > 30 && value <= 90)
      .length,
    count_90_120_min: durations.filter((value) => value > 90 && value <= 120)
      .length,
    count_over_120_min: durations.filter((value) => value > 120).length,
    count_market_wide: events.filter(
      (event) => event.event_type === "market_wide",
    ).length,
    count_market_day: events.filter(
      (event) => event.event_type === "market_day",
    ).length,
    count_observed_up: events.filter(
      (event) => event.direction === "observed_up",
    ).length,
    count_observed_down: events.filter(
      (event) => event.direction === "observed_down",
    ).length,
    count_two_sided: events.filter((event) => event.direction === "two_sided")
      .length,
    events_missing_evidence_window_fields: missingWindowFields,
  };
}

export function sourceLikelihoodDistribution(events) {
  const scores = events
    .map((event) => event.source_likelihood_score)
    .filter((value) => Number.isFinite(value));

  return {
    low_lt_0_4: scores.filter((score) => score < 0.4).length,
    medium_0_4_to_0_7: scores.filter((score) => score >= 0.4 && score < 0.7)
      .length,
    high_gte_0_7: scores.filter((score) => score >= 0.7).length,
  };
}
