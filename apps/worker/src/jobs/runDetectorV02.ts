import {
  ALLOWED_SYMBOLS,
  INTERNAL_RETENTION_DAYS,
  isoDaysAgo,
  type MarketSymbol,
} from "../config.ts";
import {
  getCandlesForSymbolSince,
  recordJobRun,
} from "../db/marketRepository.ts";
import { upsertDetectorV02Output } from "../db/v02DetectorRepository.ts";
import {
  DETECTOR_V02_MIN_CANDLES,
  detectSignalAndAuditEventsV02,
} from "../services/detectorV02/index.ts";
import type { MarketCandle } from "../types/market.ts";
import { safeErrorMessage } from "../utils/http.ts";
import { runMarketStoriesV02 } from "./runMarketStoriesV02.ts";

export interface RunDetectorV02Result {
  status: "success" | "skipped" | "failed";
  message: string;
  detector_version: "v02";
  signal_count: number;
  audit_count: number;
  publish_candidate_count: number;
  suppressed_count: number;
  signal_events_written: number;
  signal_event_symbols_written: number;
  audit_events_written: number;
  market_story_count?: number;
  market_story_publish_candidate_count?: number;
  market_stories_written?: number;
  market_story_members_written?: number;
  candidate_count: number;
}

export interface RunDetectorV02Options {
  now?: Date;
  enableMarketStories?: boolean;
}

interface LoadedCandlesV02 {
  candlesBySymbol: Record<MarketSymbol, MarketCandle[]>;
  countsBySymbol: Record<MarketSymbol, number>;
}

async function loadCandlesV02(
  db: D1Database,
  now: Date,
): Promise<LoadedCandlesV02> {
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
    (symbol) => countsBySymbol[symbol] < DETECTOR_V02_MIN_CANDLES,
  );
}

export async function runDetectorV02(
  db: D1Database,
  input: Date | RunDetectorV02Options = {},
): Promise<RunDetectorV02Result> {
  const options = input instanceof Date ? { now: input } : input;
  const now = options.now ?? new Date();
  const startedAt = new Date();

  try {
    const { candlesBySymbol, countsBySymbol } = await loadCandlesV02(db, now);
    const insufficient = insufficientSymbols(countsBySymbol);

    if (insufficient.length > 0) {
      const message = `v0.2 detector skipped: insufficient 15m candle history for ${insufficient.join(", ")}.`;

      await recordJobRun(
        db,
        "run_detector_v02",
        "skipped",
        message,
        {
          detector_version: "v02",
          required_per_symbol: DETECTOR_V02_MIN_CANDLES,
          counts_by_symbol: countsBySymbol,
        },
        startedAt,
        new Date(),
      );

      return {
        status: "skipped",
        message,
        detector_version: "v02",
        signal_count: 0,
        audit_count: 0,
        publish_candidate_count: 0,
        suppressed_count: 0,
        signal_events_written: 0,
        signal_event_symbols_written: 0,
        audit_events_written: 0,
        candidate_count: 0,
      };
    }

    const output = detectSignalAndAuditEventsV02({ candlesBySymbol });
    const writeCounts = await upsertDetectorV02Output(db, output);
    const marketStories = options.enableMarketStories
      ? await runMarketStoriesV02(db, now)
      : null;
    const message = `v0.2 detector completed: ${output.summary.signal_count} Signal Events, ${output.summary.audit_count} Audit Events, ${output.summary.publish_candidate_count} public candidates.`;

    await recordJobRun(
      db,
      "run_detector_v02",
      "success",
      message,
      {
        detector_version: "v02",
        signal_count: output.summary.signal_count,
        audit_count: output.summary.audit_count,
        publish_candidate_count: output.summary.publish_candidate_count,
        suppressed_count: output.summary.suppressed_count,
        counts_by_reason: output.summary.counts_by_reason,
        written: writeCounts,
        market_stories_enabled: options.enableMarketStories === true,
        market_story_result: marketStories
          ? {
              status: marketStories.status,
              story_count: marketStories.story_count,
              publish_candidate_count: marketStories.publish_candidate_count,
            }
          : null,
      },
      startedAt,
      new Date(),
    );

    return {
      status: "success",
      message,
      detector_version: "v02",
      signal_count: output.summary.signal_count,
      audit_count: output.summary.audit_count,
      publish_candidate_count: output.summary.publish_candidate_count,
      suppressed_count: output.summary.suppressed_count,
      signal_events_written: writeCounts.signal_events,
      signal_event_symbols_written: writeCounts.signal_event_symbols,
      audit_events_written: writeCounts.audit_events,
      market_story_count: marketStories?.story_count,
      market_story_publish_candidate_count:
        marketStories?.publish_candidate_count,
      market_stories_written: marketStories?.market_stories_written,
      market_story_members_written: marketStories?.market_story_members_written,
      candidate_count: output.summary.signal_count,
    };
  } catch (error) {
    const message = `v0.2 detector failed: ${safeErrorMessage(error)}`;

    await recordJobRun(
      db,
      "run_detector_v02",
      "failed",
      message,
      {
        detector_version: "v02",
      },
      startedAt,
      new Date(),
    );

    return {
      status: "failed",
      message,
      detector_version: "v02",
      signal_count: 0,
      audit_count: 0,
      publish_candidate_count: 0,
      suppressed_count: 0,
      signal_events_written: 0,
      signal_event_symbols_written: 0,
      audit_events_written: 0,
      candidate_count: 0,
    };
  }
}
