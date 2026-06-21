import {
  ALLOWED_SYMBOLS,
  INTERNAL_RETENTION_DAYS,
  isoDaysAgo,
  parseBooleanFlag,
  type MarketSymbol,
} from "../config.ts";
import {
  countAuditEventsV02ByDate,
  getDailyOverviewV02ByDate,
  listPublishableMarketStoriesV02ByDate,
  listPublishableSignalEventIdsV02ByDate,
  upsertDailyOverviewsV02,
} from "../db/dailyOverviewRepositoryV02.ts";
import {
  getCandlesForSymbolSince,
  recordJobRun,
} from "../db/marketRepository.ts";
import {
  candidateDailyOverviewDatesV02,
  generateDailyOverviewsV02,
} from "../services/dailyOverviewsV02/index.ts";
import type { Env } from "../types/env.ts";
import type { MarketCandle } from "../types/market.ts";
import { safeErrorMessage } from "../utils/http.ts";

export interface RunDailyOverviewsV02Result {
  status: "success" | "skipped" | "failed";
  message: string;
  generated_count: number;
  skipped_count: number;
  daily_overviews_written: number;
  dates_generated: string[];
  dates_skipped: string[];
}

export interface RunDailyOverviewsV02Options {
  now?: Date;
  includeIncompleteDays?: boolean;
  days?: number;
}

export function isDailyOverviewGenerationEnabled(
  env: Pick<Env, "ENABLE_DAILY_OVERVIEWS">,
): boolean {
  return parseBooleanFlag(env.ENABLE_DAILY_OVERVIEWS);
}

async function loadCandles(
  db: D1Database,
  now: Date,
  days: number,
): Promise<Record<MarketSymbol, MarketCandle[]>> {
  const cutoff = isoDaysAgo(days, now);
  const candlesBySymbol = {} as Record<MarketSymbol, MarketCandle[]>;

  for (const symbol of ALLOWED_SYMBOLS) {
    candlesBySymbol[symbol] = await getCandlesForSymbolSince(
      db,
      symbol,
      cutoff,
    );
  }

  return candlesBySymbol;
}

export async function runDailyOverviewsV02(
  db: D1Database,
  env: Pick<Env, "ENABLE_DAILY_OVERVIEWS">,
  options: RunDailyOverviewsV02Options = {},
): Promise<RunDailyOverviewsV02Result> {
  const now = options.now ?? new Date();
  const startedAt = new Date();
  const enabled = isDailyOverviewGenerationEnabled(env);

  if (!enabled) {
    const message =
      "v0.2 Daily Overview generation skipped: ENABLE_DAILY_OVERVIEWS is not true.";

    await recordJobRun(
      db,
      "run_daily_overviews_v02",
      "skipped",
      message,
      {
        enable_daily_overviews: false,
      },
      startedAt,
      new Date(),
    );

    return {
      status: "skipped",
      message,
      generated_count: 0,
      skipped_count: 0,
      daily_overviews_written: 0,
      dates_generated: [],
      dates_skipped: [],
    };
  }

  try {
    const candlesBySymbol = await loadCandles(
      db,
      now,
      options.days ?? INTERNAL_RETENTION_DAYS,
    );
    const dates = candidateDailyOverviewDatesV02(candlesBySymbol);
    const signalEventIdsByDate = new Map<string, string[]>();
    const marketStoriesByDate = new Map<
      string,
      Awaited<ReturnType<typeof listPublishableMarketStoriesV02ByDate>>
    >();
    const auditEventCountsByDate = new Map<string, number>();
    const existingClaudeStatusByDate = new Map<string, string | null>();

    for (const dateUtc of dates) {
      const [signals, stories, auditCount, existing] = await Promise.all([
        listPublishableSignalEventIdsV02ByDate(db, dateUtc),
        listPublishableMarketStoriesV02ByDate(db, dateUtc),
        countAuditEventsV02ByDate(db, dateUtc),
        getDailyOverviewV02ByDate(db, dateUtc),
      ]);

      signalEventIdsByDate.set(dateUtc, signals);
      marketStoriesByDate.set(dateUtc, stories);
      auditEventCountsByDate.set(dateUtc, auditCount);
      existingClaudeStatusByDate.set(dateUtc, existing?.claude_status ?? null);
    }

    const generated = generateDailyOverviewsV02({
      candlesBySymbol,
      now,
      includeIncompleteDays: options.includeIncompleteDays === true,
      signalEventIdsByDate,
      marketStoriesByDate,
      auditEventCountsByDate,
      existingClaudeStatusByDate,
    });
    const written = await upsertDailyOverviewsV02(db, generated.rows);
    const message = `v0.2 Daily Overview generation completed: ${generated.rows.length} rows generated, ${generated.skipped.length} days skipped.`;

    await recordJobRun(
      db,
      "run_daily_overviews_v02",
      "success",
      message,
      {
        generated_count: generated.rows.length,
        skipped_count: generated.skipped.length,
        dates_generated: generated.summary.dates_generated,
        dates_skipped: generated.summary.dates_skipped,
        skipped: generated.skipped,
        daily_overviews_written: written,
        enable_daily_overviews: true,
        include_incomplete_days: options.includeIncompleteDays === true,
      },
      startedAt,
      new Date(),
    );

    return {
      status: "success",
      message,
      generated_count: generated.rows.length,
      skipped_count: generated.skipped.length,
      daily_overviews_written: written,
      dates_generated: generated.summary.dates_generated,
      dates_skipped: generated.summary.dates_skipped,
    };
  } catch (error) {
    const message = `v0.2 Daily Overview generation failed: ${safeErrorMessage(error)}`;

    await recordJobRun(
      db,
      "run_daily_overviews_v02",
      "failed",
      message,
      {
        enable_daily_overviews: enabled,
      },
      startedAt,
      new Date(),
    );

    return {
      status: "failed",
      message,
      generated_count: 0,
      skipped_count: 0,
      daily_overviews_written: 0,
      dates_generated: [],
      dates_skipped: [],
    };
  }
}
