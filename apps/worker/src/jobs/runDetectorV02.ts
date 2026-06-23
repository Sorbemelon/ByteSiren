import {
  BASELINE_BARS_24H,
  FIFTEEN_MINUTES_MS,
  ALLOWED_SYMBOLS,
  INTERNAL_RETENTION_DAYS,
  isoDaysAgo,
  type MarketSymbol,
} from "../config.ts";
import {
  getCandlesForSymbolRange,
  getCandlesForSymbolSince,
  recordJobRun,
} from "../db/marketRepository.ts";
import {
  upsertDetectorV02Output,
  upsertDetectorV02OutputForRange,
} from "../db/v02DetectorRepository.ts";
import {
  DETECTOR_V02_MIN_CANDLES,
  detectSignalAndAuditEventsV02,
  type AuditEventV02,
  type SignalEventV02,
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
  dry_run?: boolean;
  bounded?: boolean;
  date_from?: string;
  date_to?: string;
  candles_loaded?: number;
  market_story_count?: number;
  market_story_publish_candidate_count?: number;
  market_stories_written?: number;
  market_story_members_written?: number;
  candidate_count: number;
}

export interface RunDetectorV02Options {
  now?: Date;
  enableMarketStories?: boolean;
  dryRun?: boolean;
  dateFrom?: string;
  dateTo?: string;
  requestId?: string;
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

function dateStartIso(dateUtc: string): string {
  return `${dateUtc}T00:00:00.000Z`;
}

function dateEndIso(dateUtc: string): string {
  return `${dateUtc}T23:59:59.999Z`;
}

function shiftIso(iso: string, deltaMs: number): string {
  return new Date(Date.parse(iso) + deltaMs).toISOString();
}

function dateRangeFromOptions(options: RunDetectorV02Options): {
  dateFrom: string;
  dateTo: string;
  startIso: string;
  endIso: string;
} | null {
  if (!options.dateFrom && !options.dateTo) {
    return null;
  }

  const dateFrom = options.dateFrom ?? options.dateTo;
  const dateTo = options.dateTo ?? options.dateFrom;

  if (!dateFrom || !dateTo) {
    return null;
  }

  return {
    dateFrom,
    dateTo,
    startIso: dateStartIso(dateFrom),
    endIso: dateEndIso(dateTo),
  };
}

async function loadCandlesV02ForRange(
  db: D1Database,
  range: { startIso: string; endIso: string },
): Promise<LoadedCandlesV02> {
  const lookbackStart = shiftIso(
    range.startIso,
    -(BASELINE_BARS_24H + 1) * FIFTEEN_MINUTES_MS,
  );
  const candlesBySymbol = {} as Record<MarketSymbol, MarketCandle[]>;
  const countsBySymbol = {} as Record<MarketSymbol, number>;

  for (const symbol of ALLOWED_SYMBOLS) {
    const candles = await getCandlesForSymbolRange(
      db,
      symbol,
      lookbackStart,
      range.endIso,
    );
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

function eventOverlapsRange(
  event: Pick<SignalEventV02 | AuditEventV02, "event_start" | "event_end">,
  range: { startIso: string; endIso: string },
): boolean {
  return event.event_end >= range.startIso && event.event_start <= range.endIso;
}

function filterOutputToRange(
  output: ReturnType<typeof detectSignalAndAuditEventsV02>,
  range: { startIso: string; endIso: string },
): ReturnType<typeof detectSignalAndAuditEventsV02> {
  const signalEvents = output.signal_events.filter((event) =>
    eventOverlapsRange(event, range),
  );
  const auditEvents = output.audit_events.filter((event) =>
    eventOverlapsRange(event, range),
  );
  const countsByReason = auditEvents.reduce<Record<string, number>>(
    (counts, event) => {
      counts[event.suppress_reason] = (counts[event.suppress_reason] ?? 0) + 1;
      return counts;
    },
    {},
  );

  return {
    signal_events: signalEvents,
    audit_events: auditEvents,
    summary: {
      detector_version: "v02",
      signal_count: signalEvents.length,
      audit_count: auditEvents.length,
      publish_candidate_count: signalEvents.length,
      suppressed_count: auditEvents.length,
      counts_by_reason: countsByReason,
    },
  };
}

export async function runDetectorV02(
  db: D1Database,
  input: Date | RunDetectorV02Options = {},
): Promise<RunDetectorV02Result> {
  const options = input instanceof Date ? { now: input } : input;
  const now = options.now ?? new Date();
  const startedAt = new Date();
  const range = dateRangeFromOptions(options);
  const bounded = range !== null;

  try {
    const { candlesBySymbol, countsBySymbol } = bounded
      ? await loadCandlesV02ForRange(db, range)
      : await loadCandlesV02(db, now);
    const insufficient = insufficientSymbols(countsBySymbol);
    const candlesLoaded = Object.values(countsBySymbol).reduce(
      (sum, count) => sum + count,
      0,
    );

    if (insufficient.length > 0) {
      const message = `v0.2 detector skipped: insufficient 15m candle history for ${insufficient.join(", ")}.`;

      if (!options.dryRun) {
        await recordJobRun(
          db,
          "run_detector_v02",
          "skipped",
          message,
          {
            detector_version: "v02",
            required_per_symbol: DETECTOR_V02_MIN_CANDLES,
            counts_by_symbol: countsBySymbol,
            bounded,
            date_from: range?.dateFrom ?? null,
            date_to: range?.dateTo ?? null,
            request_id: options.requestId ?? null,
          },
          startedAt,
          new Date(),
        );
      }

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
        dry_run: options.dryRun === true,
        bounded,
        date_from: range?.dateFrom,
        date_to: range?.dateTo,
        candles_loaded: candlesLoaded,
      };
    }

    const detectedOutput = detectSignalAndAuditEventsV02({ candlesBySymbol });
    const output = bounded
      ? filterOutputToRange(detectedOutput, range)
      : detectedOutput;
    const writeCounts = options.dryRun
      ? {
          signal_events: 0,
          signal_event_symbols: 0,
          audit_events: 0,
        }
      : bounded
        ? await upsertDetectorV02OutputForRange(db, output, {
            startIso: range.startIso,
            endIso: range.endIso,
          })
        : await upsertDetectorV02Output(db, output);
    const marketStories =
      !options.dryRun && options.enableMarketStories
        ? await runMarketStoriesV02(db, now)
        : null;
    const message = options.dryRun
      ? `v0.2 detector dry-run completed: ${output.summary.signal_count} Signal Events, ${output.summary.audit_count} Audit Events estimated.`
      : `v0.2 detector completed: ${output.summary.signal_count} Signal Events, ${output.summary.audit_count} Audit Events, ${output.summary.publish_candidate_count} public candidates.`;

    if (!options.dryRun) {
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
          bounded,
          date_from: range?.dateFrom ?? null,
          date_to: range?.dateTo ?? null,
          candles_loaded: candlesLoaded,
          request_id: options.requestId ?? null,
        },
        startedAt,
        new Date(),
      );
    }

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
      dry_run: options.dryRun === true,
      bounded,
      date_from: range?.dateFrom,
      date_to: range?.dateTo,
      candles_loaded: candlesLoaded,
    };
  } catch (error) {
    const message = `v0.2 detector failed: ${safeErrorMessage(error)}`;

    if (!options.dryRun) {
      await recordJobRun(
        db,
        "run_detector_v02",
        "failed",
        message,
        {
          detector_version: "v02",
          bounded,
          date_from: range?.dateFrom ?? null,
          date_to: range?.dateTo ?? null,
          request_id: options.requestId ?? null,
        },
        startedAt,
        new Date(),
      );
    }

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
      dry_run: options.dryRun === true,
      bounded,
      date_from: range?.dateFrom,
      date_to: range?.dateTo,
      candles_loaded: 0,
    };
  }
}
