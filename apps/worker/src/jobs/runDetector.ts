import {
  ALLOWED_SYMBOLS,
  BASELINE_BARS_24H,
  INTERNAL_RETENTION_DAYS,
  isoDaysAgo,
  parseBooleanFlag,
  parseDetectorVersion,
  type MarketSymbol,
} from "../config.ts";
import {
  upsertMarketFeatures,
  upsertRawSignalEvents,
} from "../db/detectorRepository.ts";
import {
  getCandlesForSymbolSince,
  recordJobRun,
} from "../db/marketRepository.ts";
import { upsertIncidents } from "../db/incidentRepository.ts";
import {
  calculateFeaturesBySymbol,
  detectRawMarketEvents,
  groupIncidentCandidates,
  type SymbolFeature,
} from "../services/detector/index.ts";
import type { MarketCandle } from "../types/market.ts";
import type { Env } from "../types/env.ts";
import { safeErrorMessage } from "../utils/http.ts";
import { runDetectorV02, type RunDetectorV02Result } from "./runDetectorV02.ts";

const MIN_CANDLES_PER_SYMBOL = BASELINE_BARS_24H + 1;

export interface RunDetectorResult {
  status: "success" | "skipped" | "failed";
  message: string;
  detector_version?: "v01" | "v02";
  features_written: number;
  raw_events_written: number;
  suppressed_events_written: number;
  incidents_written: number;
  candidate_count: number;
  signal_count?: number;
  audit_count?: number;
  publish_candidate_count?: number;
  suppressed_count?: number;
  signal_events_written?: number;
  signal_event_symbols_written?: number;
  audit_events_written?: number;
  market_story_count?: number;
  market_story_publish_candidate_count?: number;
  market_stories_written?: number;
  market_story_members_written?: number;
}

export interface RunDetectorOptions {
  env?: Pick<Env, "DETECTOR_VERSION" | "ENABLE_MARKET_STORIES">;
  now?: Date;
}

interface LoadedCandles {
  candlesBySymbol: Record<MarketSymbol, MarketCandle[]>;
  countsBySymbol: Record<MarketSymbol, number>;
}

function flattenFeatures(
  featuresBySymbol: Partial<Record<MarketSymbol, SymbolFeature[]>>,
): SymbolFeature[] {
  return ALLOWED_SYMBOLS.flatMap((symbol) => featuresBySymbol[symbol] ?? []);
}

async function loadCandles(db: D1Database, now: Date): Promise<LoadedCandles> {
  const cutoff = isoDaysAgo(INTERNAL_RETENTION_DAYS, now);
  const candlesBySymbol = {} as Record<MarketSymbol, MarketCandle[]>;
  const countsBySymbol = {} as Record<MarketSymbol, number>;

  for (const symbol of ALLOWED_SYMBOLS) {
    const candles = await getCandlesForSymbolSince(db, symbol, cutoff);
    candlesBySymbol[symbol] = candles;
    countsBySymbol[symbol] = candles.length;
  }

  return {
    candlesBySymbol,
    countsBySymbol,
  };
}

function insufficientSymbols(
  countsBySymbol: Record<MarketSymbol, number>,
): MarketSymbol[] {
  return ALLOWED_SYMBOLS.filter(
    (symbol) => countsBySymbol[symbol] < MIN_CANDLES_PER_SYMBOL,
  );
}

export async function runDetector(
  db: D1Database,
  input: Date | RunDetectorOptions = {},
): Promise<RunDetectorResult> {
  const options = input instanceof Date ? { now: input } : input;
  const now = options.now ?? new Date();
  const detectorVersion = parseDetectorVersion(options.env?.DETECTOR_VERSION);

  if (detectorVersion === "v02") {
    const result: RunDetectorV02Result = await runDetectorV02(db, {
      now,
      enableMarketStories: parseBooleanFlag(options.env?.ENABLE_MARKET_STORIES),
    });
    return {
      ...result,
      features_written: 0,
      raw_events_written: 0,
      suppressed_events_written: 0,
      incidents_written: 0,
    };
  }

  const startedAt = new Date();

  try {
    const { candlesBySymbol, countsBySymbol } = await loadCandles(db, now);
    const insufficient = insufficientSymbols(countsBySymbol);

    if (insufficient.length > 0) {
      const message = `Detector skipped: insufficient 15m candle history for ${insufficient.join(", ")}.`;

      await recordJobRun(
        db,
        "run_detector",
        "skipped",
        message,
        {
          required_per_symbol: MIN_CANDLES_PER_SYMBOL,
          counts_by_symbol: countsBySymbol,
        },
        startedAt,
        new Date(),
      );

      return {
        status: "skipped",
        message,
        detector_version: "v01",
        features_written: 0,
        raw_events_written: 0,
        suppressed_events_written: 0,
        incidents_written: 0,
        candidate_count: 0,
      };
    }

    const featuresBySymbol = calculateFeaturesBySymbol(candlesBySymbol);
    const features = flattenFeatures(featuresBySymbol);
    const rawResult = detectRawMarketEvents(featuresBySymbol);
    const candidates = groupIncidentCandidates(rawResult.raw_events);

    const featuresWritten = await upsertMarketFeatures(db, features);
    const rawEventsWritten = await upsertRawSignalEvents(
      db,
      rawResult.raw_events,
    );
    const suppressedEventsWritten = await upsertRawSignalEvents(
      db,
      rawResult.suppressed_events,
    );
    const incidentsWritten = await upsertIncidents(db, candidates);
    const message = `Detector completed: ${candidates.length} candidate incidents queued.`;

    await recordJobRun(
      db,
      "run_detector",
      "success",
      message,
      {
        features_written: featuresWritten,
        raw_events_written: rawEventsWritten,
        suppressed_events_written: suppressedEventsWritten,
        incidents_written: incidentsWritten,
        candidate_count: candidates.length,
      },
      startedAt,
      new Date(),
    );

    return {
      status: "success",
      message,
      detector_version: "v01",
      features_written: featuresWritten,
      raw_events_written: rawEventsWritten,
      suppressed_events_written: suppressedEventsWritten,
      incidents_written: incidentsWritten,
      candidate_count: candidates.length,
    };
  } catch (error) {
    const message = `Detector failed: ${safeErrorMessage(error)}`;

    await recordJobRun(
      db,
      "run_detector",
      "failed",
      message,
      {},
      startedAt,
      new Date(),
    );

    return {
      status: "failed",
      message,
      detector_version: "v01",
      features_written: 0,
      raw_events_written: 0,
      suppressed_events_written: 0,
      incidents_written: 0,
      candidate_count: 0,
    };
  }
}
