import { parseBooleanFlag } from "../config.ts";
import {
  getDetectorV02TableCounts,
  listSignalEventIdsV02ForRange,
  type DetectorV02TableCounts,
} from "../db/v02DetectorRepository.ts";
import { recordJobRun } from "../db/marketRepository.ts";
import {
  dispatchV02SignalClaudeWorkflow,
  type V02SignalClaudeDispatchResult,
} from "../services/githubDispatch.ts";
import type { Env } from "../types/env.ts";
import type { JobRunStatus } from "../types/market.ts";
import { safeErrorMessage } from "../utils/http.ts";
import { runDetectorV02, type RunDetectorV02Result } from "./runDetectorV02.ts";
import {
  runMarketStoriesV02,
  type RunMarketStoriesV02Result,
} from "./runMarketStoriesV02.ts";

const DEFAULT_TARGET_WINDOW_HOURS = 6;
const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_MARKET_STORY_OPEN_TTL_HOURS = 72;
const DEFAULT_MAX_SIGNALS_PER_RUN = 25;

export interface IncrementalV02Window {
  target_start: string;
  target_end: string;
  lookback_start: string;
}

export interface RunIncrementalSignalsV02Result {
  status: "success" | "skipped" | "failed";
  message: string;
  dry_run: boolean;
  window: IncrementalV02Window;
  target_window_hours: number;
  lookback_hours: number;
  detector: RunDetectorV02Result;
  counts_before: DetectorV02TableCounts;
  counts_after: DetectorV02TableCounts;
  signals_detected: number;
  signals_inserted_estimate: number;
  signals_updated_or_retained: number;
  audit_detected: number;
  audit_inserted_estimate: number;
  new_signal_ids: string[];
  changed_signal_ids: string[];
}

export interface RunIncrementalMarketStoriesV02Result {
  status: "success" | "skipped" | "failed";
  message: string;
  dry_run: boolean;
  window: {
    story_refresh_start: string;
    story_refresh_end: string;
  };
  open_ttl_hours: number;
  market_stories: RunMarketStoriesV02Result;
  counts_before: DetectorV02TableCounts;
  counts_after: DetectorV02TableCounts;
  stories_created_or_updated: number;
  story_member_rows_written: number;
}

export interface RunIncrementalRefreshV02Result {
  status: "success" | "skipped" | "failed";
  message: string;
  dry_run: boolean;
  request_id: string;
  trigger_source: string;
  signals: RunIncrementalSignalsV02Result | null;
  market_stories: RunIncrementalMarketStoriesV02Result | null;
  claude_dispatch: Awaited<
    ReturnType<typeof dispatchV02SignalClaudeWorkflow>
  > | null;
}

export interface RunIncrementalRefreshV02Options {
  now?: Date;
  dryRun?: boolean;
  requestId?: string;
  triggerSource?: string;
  targetWindowHours?: number;
  lookbackHours?: number;
  runSignals?: boolean;
  runMarketStories?: boolean;
  marketStoryOpenTtlHours?: number;
  dispatchClaude?: boolean;
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

function hoursAgo(now: Date, hours: number): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function resolveTargetWindow(
  now: Date,
  targetWindowHours: number,
  lookbackHours: number,
): IncrementalV02Window {
  const targetEnd = now.toISOString();

  return {
    target_start: hoursAgo(now, targetWindowHours),
    target_end: targetEnd,
    lookback_start: hoursAgo(now, Math.max(targetWindowHours, lookbackHours)),
  };
}

function newIds(before: string[], after: string[]): string[] {
  const existing = new Set(before);
  return after.filter((id) => !existing.has(id));
}

export function isV02IncrementalRefreshEnabled(env: Env): boolean {
  return parseBooleanFlag(env.ENABLE_V02_INCREMENTAL_REFRESH);
}

export function areV02IncrementalSignalsEnabled(env: Env): boolean {
  return env.ENABLE_V02_INCREMENTAL_SIGNALS === undefined
    ? true
    : parseBooleanFlag(env.ENABLE_V02_INCREMENTAL_SIGNALS);
}

export function areV02IncrementalMarketStoriesEnabled(env: Env): boolean {
  return env.ENABLE_V02_INCREMENTAL_MARKET_STORIES === undefined
    ? true
    : parseBooleanFlag(env.ENABLE_V02_INCREMENTAL_MARKET_STORIES);
}

function targetWindowHours(env: Env, override?: number): number {
  return Math.max(
    1,
    Math.min(
      24,
      Math.trunc(
        override ??
          parsePositiveInt(
            env.V02_INCREMENTAL_TARGET_WINDOW_HOURS,
            DEFAULT_TARGET_WINDOW_HOURS,
            24,
          ),
      ),
    ),
  );
}

function lookbackHours(env: Env, override?: number): number {
  return Math.max(
    DEFAULT_LOOKBACK_HOURS,
    Math.min(
      72,
      Math.trunc(
        override ??
          parsePositiveInt(
            env.V02_INCREMENTAL_LOOKBACK_HOURS,
            DEFAULT_LOOKBACK_HOURS,
            72,
          ),
      ),
    ),
  );
}

function marketStoryOpenTtlHours(env: Env, override?: number): number {
  return Math.max(
    1,
    Math.min(
      72,
      Math.trunc(
        override ??
          parsePositiveInt(
            env.V02_MARKET_STORY_OPEN_TTL_HOURS,
            DEFAULT_MARKET_STORY_OPEN_TTL_HOURS,
            72,
          ),
      ),
    ),
  );
}

function maxSignalsPerRun(env: Env): number {
  return parsePositiveInt(
    env.V02_INCREMENTAL_MAX_SIGNALS_PER_RUN,
    DEFAULT_MAX_SIGNALS_PER_RUN,
    100,
  );
}

function claudeDispatchLimit(env: Env): number {
  return parsePositiveInt(
    env.V02_CLAUDE_SIGNAL_DISPATCH_LIMIT ??
      env.V02_SIGNAL_CLAUDE_DISPATCH_LIMIT,
    3,
    10,
  );
}

function dispatchJobStatus(
  result: V02SignalClaudeDispatchResult,
): JobRunStatus {
  if (result.dispatch_status === "dispatched" || result.ok) {
    return "success";
  }

  if (result.outcome === "skipped") {
    return "skipped";
  }

  return "failed";
}

async function recordIncrementalJob(
  db: D1Database,
  jobName: string,
  status: JobRunStatus,
  message: string,
  metadata: Record<string, unknown>,
  startedAt: Date,
): Promise<void> {
  await recordJobRun(
    db,
    jobName,
    status,
    message,
    metadata,
    startedAt,
    new Date(),
  );
}

export async function runIncrementalSignalsV02(
  db: D1Database,
  env: Env,
  options: RunIncrementalRefreshV02Options = {},
): Promise<RunIncrementalSignalsV02Result> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun === true;
  const targetHours = targetWindowHours(env, options.targetWindowHours);
  const baselineHours = lookbackHours(env, options.lookbackHours);
  const window = resolveTargetWindow(now, targetHours, baselineHours);
  const range = {
    startIso: window.target_start,
    endIso: window.target_end,
  };
  const startedAt = new Date();
  const beforeIds = dryRun
    ? []
    : await listSignalEventIdsV02ForRange(db, range, maxSignalsPerRun(env));
  const countsBefore = await getDetectorV02TableCounts(db);
  const detector = await runDetectorV02(db, {
    now,
    dryRun,
    dateFrom: window.target_start.slice(0, 10),
    dateTo: window.target_end.slice(0, 10),
    timeFrom: window.target_start,
    timeTo: window.target_end,
    requestId: options.requestId,
    enableMarketStories: false,
  });
  const afterIds = dryRun
    ? []
    : await listSignalEventIdsV02ForRange(db, range, maxSignalsPerRun(env));
  const countsAfter = dryRun
    ? countsBefore
    : await getDetectorV02TableCounts(db);
  const insertedIds = newIds(beforeIds, afterIds);
  const status = detector.status;
  const message =
    status === "success"
      ? `v0.2 incremental Signal refresh completed for ${targetHours}h window.`
      : `v0.2 incremental Signal refresh ${status}: ${detector.message}`;

  if (!dryRun) {
    await recordIncrementalJob(
      db,
      "run_incremental_signals_v02",
      status,
      message,
      {
        request_id: options.requestId ?? null,
        trigger_source: options.triggerSource ?? "manual",
        window,
        detector_status: detector.status,
        detector_message: detector.message,
        signal_count: detector.signal_count,
        audit_count: detector.audit_count,
        new_signal_ids: insertedIds,
        changed_signal_ids: afterIds,
        counts_before: countsBefore,
        counts_after: countsAfter,
      },
      startedAt,
    );
  }

  return {
    status,
    message,
    dry_run: dryRun,
    window,
    target_window_hours: targetHours,
    lookback_hours: baselineHours,
    detector,
    counts_before: countsBefore,
    counts_after: countsAfter,
    signals_detected: detector.signal_count,
    signals_inserted_estimate: Math.max(
      0,
      countsAfter.signal_events_v02 - countsBefore.signal_events_v02,
    ),
    signals_updated_or_retained: afterIds.length,
    audit_detected: detector.audit_count,
    audit_inserted_estimate: Math.max(
      0,
      countsAfter.audit_events_v02 - countsBefore.audit_events_v02,
    ),
    new_signal_ids: insertedIds,
    changed_signal_ids: afterIds,
  };
}

export async function runIncrementalMarketStoriesV02(
  db: D1Database,
  env: Env,
  options: RunIncrementalRefreshV02Options = {},
): Promise<RunIncrementalMarketStoriesV02Result> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun === true;
  const openTtlHours = marketStoryOpenTtlHours(
    env,
    options.marketStoryOpenTtlHours,
  );
  const storyWindow = {
    story_refresh_start: hoursAgo(now, openTtlHours),
    story_refresh_end: now.toISOString(),
  };
  const startedAt = new Date();
  const countsBefore = await getDetectorV02TableCounts(db);
  const marketStories = await runMarketStoriesV02(db, {
    now,
    dryRun,
    timeFrom: storyWindow.story_refresh_start,
    timeTo: storyWindow.story_refresh_end,
    requestId: options.requestId,
  });
  const countsAfter = dryRun
    ? countsBefore
    : await getDetectorV02TableCounts(db);
  const status = marketStories.status;
  const message =
    status === "success"
      ? `v0.2 incremental Market Story refresh completed for ${openTtlHours}h window.`
      : `v0.2 incremental Market Story refresh ${status}: ${marketStories.message}`;

  if (!dryRun) {
    await recordIncrementalJob(
      db,
      "run_incremental_market_stories_v02",
      status,
      message,
      {
        request_id: options.requestId ?? null,
        trigger_source: options.triggerSource ?? "manual",
        window: storyWindow,
        open_ttl_hours: openTtlHours,
        market_story_status: marketStories.status,
        market_story_message: marketStories.message,
        stories_written: marketStories.market_stories_written,
        members_written: marketStories.market_story_members_written,
        counts_before: countsBefore,
        counts_after: countsAfter,
      },
      startedAt,
    );
  }

  return {
    status,
    message,
    dry_run: dryRun,
    window: storyWindow,
    open_ttl_hours: openTtlHours,
    market_stories: marketStories,
    counts_before: countsBefore,
    counts_after: countsAfter,
    stories_created_or_updated: marketStories.market_stories_written,
    story_member_rows_written: marketStories.market_story_members_written,
  };
}

export async function runIncrementalRefreshV02(
  db: D1Database,
  env: Env,
  options: RunIncrementalRefreshV02Options = {},
): Promise<RunIncrementalRefreshV02Result> {
  const requestId = options.requestId ?? crypto.randomUUID();
  const triggerSource = options.triggerSource ?? "manual";
  const dryRun = options.dryRun === true;
  const runSignals = options.runSignals ?? areV02IncrementalSignalsEnabled(env);
  const runStories =
    options.runMarketStories ?? areV02IncrementalMarketStoriesEnabled(env);

  if (!runSignals && !runStories) {
    return {
      status: "skipped",
      message:
        "v0.2 incremental refresh skipped: no enabled incremental steps.",
      dry_run: dryRun,
      request_id: requestId,
      trigger_source: triggerSource,
      signals: null,
      market_stories: null,
      claude_dispatch: null,
    };
  }

  let signals: RunIncrementalSignalsV02Result | null = null;
  let marketStories: RunIncrementalMarketStoriesV02Result | null = null;
  let claudeDispatch: Awaited<
    ReturnType<typeof dispatchV02SignalClaudeWorkflow>
  > | null = null;

  try {
    if (runSignals) {
      signals = await runIncrementalSignalsV02(db, env, {
        ...options,
        dryRun,
        requestId,
        triggerSource,
      });
    }

    if (signals?.status === "failed") {
      return {
        status: "failed",
        message:
          "v0.2 incremental refresh failed: Signal step failed; Market Story step skipped.",
        dry_run: dryRun,
        request_id: requestId,
        trigger_source: triggerSource,
        signals,
        market_stories: null,
        claude_dispatch: null,
      };
    }

    if (runStories) {
      marketStories = await runIncrementalMarketStoriesV02(db, env, {
        ...options,
        dryRun,
        requestId,
        triggerSource,
      });
    }

    if (options.dispatchClaude === true) {
      const dispatchStartedAt = new Date();
      const signalClaudeTargets = signals?.new_signal_ids ?? [];
      claudeDispatch = await dispatchV02SignalClaudeWorkflow(
        env,
        signalClaudeTargets,
        {
          dryRun,
          triggerSource,
          now: options.now,
          limit: claudeDispatchLimit(env),
        },
      );

      if (!dryRun && signalClaudeTargets.length > 0) {
        await recordIncrementalJob(
          db,
          "dispatch_v02_signal_claude_workflow",
          dispatchJobStatus(claudeDispatch),
          claudeDispatch.message,
          {
            request_id: requestId,
            trigger_source: triggerSource,
            signal_event_ids: signalClaudeTargets,
            changed_signal_ids: signals?.changed_signal_ids ?? [],
            new_public_signal_detected: true,
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
        );
      }
    }

    const failed = marketStories?.status === "failed";

    return {
      status: failed ? "failed" : "success",
      message: failed
        ? "v0.2 incremental refresh completed with failed step."
        : "v0.2 incremental refresh completed.",
      dry_run: dryRun,
      request_id: requestId,
      trigger_source: triggerSource,
      signals,
      market_stories: marketStories,
      claude_dispatch: claudeDispatch,
    };
  } catch (error) {
    return {
      status: "failed",
      message: `v0.2 incremental refresh failed: ${safeErrorMessage(error)}`,
      dry_run: dryRun,
      request_id: requestId,
      trigger_source: triggerSource,
      signals,
      market_stories: marketStories,
      claude_dispatch: claudeDispatch,
    };
  }
}
