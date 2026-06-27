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
  getCandlesForSymbolRange,
  getCandlesForSymbolSince,
  recordJobRun,
} from "../db/marketRepository.ts";
import {
  candidateDailyOverviewDatesV02,
  generateDailyOverviewsV02,
} from "../services/dailyOverviewsV02/index.ts";
import {
  dispatchV02DailyClaudeWorkflow,
  type V02DailyClaudeDispatchResult,
} from "../services/githubDispatch.ts";
import type { Env } from "../types/env.ts";
import type { JobRunStatus, MarketCandle } from "../types/market.ts";
import { safeErrorMessage } from "../utils/http.ts";

const DEFAULT_INCREMENTAL_DAILY_LOOKBACK_DAYS = 5;
const MAX_INCREMENTAL_DAILY_LOOKBACK_DAYS = 14;

export interface RunDailyOverviewsV02Result {
  status: "success" | "skipped" | "failed";
  message: string;
  generated_count: number;
  skipped_count: number;
  daily_overviews_written: number;
  dates_generated: string[];
  dates_skipped: string[];
  claude_dispatch: V02DailyClaudeDispatchResult | null;
}

export interface RunDailyOverviewsV02Options {
  now?: Date;
  includeIncompleteDays?: boolean;
  days?: number;
  dateFrom?: string;
  dateTo?: string;
  dryRun?: boolean;
  requestId?: string;
  triggerSource?: string;
  dispatchClaude?: boolean;
}

type DailyOverviewEnv = Pick<Env, "ENABLE_DAILY_OVERVIEWS"> & Partial<Env>;

export function isDailyOverviewGenerationEnabled(
  env: Pick<Env, "ENABLE_DAILY_OVERVIEWS">,
): boolean {
  return parseBooleanFlag(env.ENABLE_DAILY_OVERVIEWS);
}

export function isIncrementalDailyOverviewGenerationEnabled(
  env: Pick<Env, "ENABLE_V02_INCREMENTAL_DAILY_OVERVIEWS">,
): boolean {
  return parseBooleanFlag(env.ENABLE_V02_INCREMENTAL_DAILY_OVERVIEWS);
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.max(1, Math.min(max, Math.trunc(parsed)));
}

function incrementalDailyLookbackDays(
  env: Pick<Env, "V02_DAILY_OVERVIEW_LOOKBACK_DAYS">,
  override?: number,
): number {
  return Math.max(
    1,
    Math.min(
      MAX_INCREMENTAL_DAILY_LOOKBACK_DAYS,
      Math.trunc(
        override ??
          parsePositiveInt(
            env.V02_DAILY_OVERVIEW_LOOKBACK_DAYS,
            DEFAULT_INCREMENTAL_DAILY_LOOKBACK_DAYS,
            MAX_INCREMENTAL_DAILY_LOOKBACK_DAYS,
          ),
      ),
    ),
  );
}

function dailyClaudeDispatchLimit(
  env: Partial<
    Pick<
      Env,
      "V02_CLAUDE_DAILY_DISPATCH_LIMIT" | "V02_DAILY_CLAUDE_DISPATCH_LIMIT"
    >
  >,
): number {
  return parsePositiveInt(
    env.V02_CLAUDE_DAILY_DISPATCH_LIMIT ?? env.V02_DAILY_CLAUDE_DISPATCH_LIMIT,
    3,
    10,
  );
}

function dispatchJobStatus(result: V02DailyClaudeDispatchResult): JobRunStatus {
  if (result.dispatch_status === "dispatched" || result.ok) {
    return "success";
  }

  if (result.outcome === "skipped") {
    return "skipped";
  }

  return "failed";
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

function dateStartIso(dateUtc: string): string {
  return `${dateUtc}T00:00:00.000Z`;
}

function dateEndIso(dateUtc: string): string {
  return `${dateUtc}T23:59:59.999Z`;
}

function previousDayStartIso(dateUtc: string): string {
  const date = new Date(dateStartIso(dateUtc));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString();
}

async function loadCandlesForDateRange(
  db: D1Database,
  dateFrom: string,
  dateTo: string,
): Promise<Record<MarketSymbol, MarketCandle[]>> {
  const candlesBySymbol = {} as Record<MarketSymbol, MarketCandle[]>;

  for (const symbol of ALLOWED_SYMBOLS) {
    candlesBySymbol[symbol] = await getCandlesForSymbolRange(
      db,
      symbol,
      previousDayStartIso(dateFrom),
      dateEndIso(dateTo),
    );
  }

  return candlesBySymbol;
}

function filterDates(
  dates: string[],
  options: Pick<RunDailyOverviewsV02Options, "dateFrom" | "dateTo">,
): string[] {
  if (!options.dateFrom && !options.dateTo) {
    return dates;
  }

  const dateFrom = options.dateFrom ?? options.dateTo;
  const dateTo = options.dateTo ?? options.dateFrom;

  return dates.filter(
    (dateUtc) =>
      (!dateFrom || dateUtc >= dateFrom) && (!dateTo || dateUtc <= dateTo),
  );
}

export async function runDailyOverviewsV02(
  db: D1Database,
  env: DailyOverviewEnv,
  options: RunDailyOverviewsV02Options = {},
): Promise<RunDailyOverviewsV02Result> {
  const now = options.now ?? new Date();
  const startedAt = new Date();
  const enabled = isDailyOverviewGenerationEnabled(env);

  if (!enabled) {
    const message =
      "v0.2 Daily Overview generation skipped: ENABLE_DAILY_OVERVIEWS is not true.";

    if (!options.dryRun) {
      await recordJobRun(
        db,
        "run_daily_overviews_v02",
        "skipped",
        message,
        {
          enable_daily_overviews: false,
          dry_run: false,
          date_from: options.dateFrom ?? null,
          date_to: options.dateTo ?? null,
          request_id: options.requestId ?? null,
        },
        startedAt,
        new Date(),
      );
    }

    return {
      status: "skipped",
      message,
      generated_count: 0,
      skipped_count: 0,
      daily_overviews_written: 0,
      dates_generated: [],
      dates_skipped: [],
      claude_dispatch: null,
    };
  }

  try {
    const bounded = Boolean(options.dateFrom || options.dateTo);
    const dateFrom = options.dateFrom ?? options.dateTo;
    const dateTo = options.dateTo ?? options.dateFrom;
    const candlesBySymbol =
      bounded && dateFrom && dateTo
        ? await loadCandlesForDateRange(db, dateFrom, dateTo)
        : await loadCandles(db, now, options.days ?? INTERNAL_RETENTION_DAYS);
    const dates = filterDates(
      candidateDailyOverviewDatesV02(candlesBySymbol),
      options,
    );
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
    generated.rows = generated.rows.filter((row) =>
      dates.includes(row.date_utc),
    );
    generated.skipped = generated.skipped.filter((row) =>
      dates.includes(row.date_utc),
    );
    generated.summary.generated_count = generated.rows.length;
    generated.summary.skipped_count = generated.skipped.length;
    generated.summary.dates_generated = generated.rows.map(
      (row) => row.date_utc,
    );
    generated.summary.dates_skipped = generated.skipped.map(
      (row) => row.date_utc,
    );
    const written = options.dryRun
      ? 0
      : await upsertDailyOverviewsV02(db, generated.rows);
    let claudeDispatch: V02DailyClaudeDispatchResult | null = null;
    const claudeDispatchTargetIds = generated.rows
      .filter((row) => row.claude_status === "queued_for_analysis")
      .map((row) => row.id);
    const message = options.dryRun
      ? `v0.2 Daily Overview generation dry-run completed: ${generated.rows.length} rows estimated, ${generated.skipped.length} days skipped.`
      : `v0.2 Daily Overview generation completed: ${generated.rows.length} rows generated, ${generated.skipped.length} days skipped.`;

    if (!options.dryRun) {
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
          bounded,
          date_from: options.dateFrom ?? null,
          date_to: options.dateTo ?? null,
          dry_run: false,
          request_id: options.requestId ?? null,
          dispatch_claude_requested: options.dispatchClaude === true,
          claude_dispatch_target_ids: claudeDispatchTargetIds,
        },
        startedAt,
        new Date(),
      );

      if (options.dispatchClaude === true) {
        const dispatchStartedAt = new Date();
        claudeDispatch = await dispatchV02DailyClaudeWorkflow(
          env as Env,
          claudeDispatchTargetIds,
          {
            dryRun: false,
            triggerSource: options.triggerSource ?? "incremental_daily",
            now,
            limit: dailyClaudeDispatchLimit(env),
          },
        );

        await recordJobRun(
          db,
          "dispatch_v02_daily_claude_workflow",
          dispatchJobStatus(claudeDispatch),
          claudeDispatch.message,
          {
            request_id: options.requestId ?? null,
            trigger_source: options.triggerSource ?? "incremental_daily",
            daily_overview_ids: claudeDispatchTargetIds,
            generated_dates: generated.summary.dates_generated,
            dispatch_status: claudeDispatch.dispatch_status,
            dispatch_attempted: claudeDispatch.dispatch_attempted,
            workflow: claudeDispatch.workflow,
            repo: claudeDispatch.repo,
            ref: claudeDispatch.ref,
            github_status: claudeDispatch.status,
            inputs_summary: claudeDispatch.inputs_summary,
            token_present: claudeDispatch.token_present,
            error_summary: claudeDispatch.error_summary ?? null,
          },
          dispatchStartedAt,
          new Date(),
        );
      }
    }

    return {
      status: "success",
      message,
      generated_count: generated.rows.length,
      skipped_count: generated.skipped.length,
      daily_overviews_written: written,
      dates_generated: generated.summary.dates_generated,
      dates_skipped: generated.summary.dates_skipped,
      claude_dispatch: claudeDispatch,
    };
  } catch (error) {
    const message = `v0.2 Daily Overview generation failed: ${safeErrorMessage(error)}`;

    if (!options.dryRun) {
      await recordJobRun(
        db,
        "run_daily_overviews_v02",
        "failed",
        message,
        {
          enable_daily_overviews: enabled,
          date_from: options.dateFrom ?? null,
          date_to: options.dateTo ?? null,
          dry_run: false,
          request_id: options.requestId ?? null,
        },
        startedAt,
        new Date(),
      );
    }

    return {
      status: "failed",
      message,
      generated_count: 0,
      skipped_count: 0,
      daily_overviews_written: 0,
      dates_generated: [],
      dates_skipped: [],
      claude_dispatch: null,
    };
  }
}

export async function runIncrementalDailyOverviewsV02(
  db: D1Database,
  env: Pick<
    Env,
    | "ENABLE_V02_INCREMENTAL_DAILY_OVERVIEWS"
    | "V02_DAILY_OVERVIEW_LOOKBACK_DAYS"
  > &
    Partial<Env>,
  options: RunDailyOverviewsV02Options = {},
): Promise<RunDailyOverviewsV02Result> {
  const days = options.days ?? incrementalDailyLookbackDays(env);

  return runDailyOverviewsV02(
    db,
    {
      ...env,
      ENABLE_DAILY_OVERVIEWS: isIncrementalDailyOverviewGenerationEnabled(env)
        ? "true"
        : "false",
    },
    {
      ...options,
      days,
      includeIncompleteDays: false,
    },
  );
}
