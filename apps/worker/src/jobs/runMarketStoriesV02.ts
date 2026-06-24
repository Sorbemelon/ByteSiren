import {
  listAuditEventsV02ForStoryGeneration,
  listSignalEventsV02ForStoryGeneration,
  upsertMarketStoryOutputV02,
  upsertMarketStoryOutputV02ForRange,
  type MarketStoryV02Range,
} from "../db/marketStoryRepositoryV02.ts";
import {
  getCandlesForSymbolSince,
  recordJobRun,
} from "../db/marketRepository.ts";
import { ALLOWED_SYMBOLS } from "../config.ts";
import {
  generateMarketStoriesV02,
  MARKET_STORY_V02_MODEL_VERSION,
} from "../services/marketStoriesV02/index.ts";
import { safeErrorMessage } from "../utils/http.ts";

export interface RunMarketStoriesV02Result {
  status: "success" | "skipped" | "failed";
  message: string;
  story_model_version: typeof MARKET_STORY_V02_MODEL_VERSION;
  story_count: number;
  publish_candidate_count: number;
  suppressed_count: number;
  audit_only_story_count: number;
  signal_story_count: number;
  signal_audit_story_count: number;
  market_stories_written: number;
  market_story_members_written: number;
  dry_run?: boolean;
  bounded?: boolean;
  time_from?: string;
  time_to?: string;
  source_event_count?: number;
}

export interface RunMarketStoriesV02Options {
  now?: Date;
  dryRun?: boolean;
  timeFrom?: string;
  timeTo?: string;
  requestId?: string;
}

function resolveOptions(
  input: Date | RunMarketStoriesV02Options = {},
): RunMarketStoriesV02Options {
  return input instanceof Date ? { now: input } : input;
}

function rangeFromOptions(
  options: RunMarketStoriesV02Options,
): MarketStoryV02Range | null {
  if (!options.timeFrom && !options.timeTo) {
    return null;
  }

  if (!options.timeFrom || !options.timeTo) {
    throw new Error("timeFrom and timeTo must be provided together.");
  }

  if (Date.parse(options.timeTo) <= Date.parse(options.timeFrom)) {
    throw new Error("timeTo must be after timeFrom.");
  }

  return {
    startIso: options.timeFrom,
    endIso: options.timeTo,
  };
}

export async function runMarketStoriesV02(
  db: D1Database,
  input: Date | RunMarketStoriesV02Options = {},
): Promise<RunMarketStoriesV02Result> {
  const options = resolveOptions(input);
  const now = options.now ?? new Date();
  const startedAt = new Date();
  const range = rangeFromOptions(options);
  const bounded = range !== null;
  const dryRun = options.dryRun === true;

  try {
    const signalEvents = await listSignalEventsV02ForStoryGeneration(
      db,
      range ?? undefined,
    );
    const auditEvents = await listAuditEventsV02ForStoryGeneration(
      db,
      range ?? undefined,
    );
    const sourceEvents = [...signalEvents, ...auditEvents];

    if (sourceEvents.length < 2) {
      if (!dryRun && !range) {
        const emptyOutput = {
          market_stories: [],
          market_story_members: [],
        };

        await upsertMarketStoryOutputV02(db, emptyOutput);
      }

      const message =
        "v0.2 Market Story generation skipped: fewer than two Signal/Audit events.";

      if (!dryRun) {
        await recordJobRun(
          db,
          "run_market_stories_v02",
          "skipped",
          message,
          {
            detector_version: "v02",
            story_model_version: MARKET_STORY_V02_MODEL_VERSION,
            source_event_count: sourceEvents.length,
            bounded,
            time_from: range?.startIso ?? null,
            time_to: range?.endIso ?? null,
            request_id: options.requestId ?? null,
          },
          startedAt,
          now,
        );
      }

      return {
        status: "skipped",
        message,
        story_model_version: MARKET_STORY_V02_MODEL_VERSION,
        story_count: 0,
        publish_candidate_count: 0,
        suppressed_count: 0,
        audit_only_story_count: 0,
        signal_story_count: 0,
        signal_audit_story_count: 0,
        market_stories_written: 0,
        market_story_members_written: 0,
        dry_run: dryRun,
        bounded,
        time_from: range?.startIso,
        time_to: range?.endIso,
        source_event_count: sourceEvents.length,
      };
    }

    const earliestEventStart = sourceEvents.reduce(
      (earliest, event) =>
        event.event_start.localeCompare(earliest) < 0
          ? event.event_start
          : earliest,
      sourceEvents[0].event_start,
    );
    const marketCandles = (
      await Promise.all(
        ALLOWED_SYMBOLS.map((symbol) =>
          getCandlesForSymbolSince(db, symbol, earliestEventStart),
        ),
      )
    ).flat();
    const output = generateMarketStoriesV02(sourceEvents, {}, marketCandles);
    const writeCounts = dryRun
      ? {
          market_stories: 0,
          market_story_members: 0,
        }
      : range
        ? await upsertMarketStoryOutputV02ForRange(db, output, range)
        : await upsertMarketStoryOutputV02(db, output);
    const message = `v0.2 Market Story generation completed: ${output.summary.story_count} stories, ${output.summary.publish_candidate_count} public candidates.`;

    if (!dryRun) {
      await recordJobRun(
        db,
        "run_market_stories_v02",
        "success",
        message,
        {
          detector_version: "v02",
          story_model_version: output.summary.story_model_version,
          story_count: output.summary.story_count,
          publish_candidate_count: output.summary.publish_candidate_count,
          suppressed_count: output.summary.suppressed_count,
          audit_only_story_count: output.summary.audit_only_story_count,
          signal_story_count: output.summary.signal_story_count,
          signal_audit_story_count: output.summary.signal_audit_story_count,
          counts_by_label: output.summary.counts_by_label,
          counts_by_source: output.summary.counts_by_source,
          source_event_count: sourceEvents.length,
          written: writeCounts,
          bounded,
          time_from: range?.startIso ?? null,
          time_to: range?.endIso ?? null,
          request_id: options.requestId ?? null,
        },
        startedAt,
        new Date(),
      );
    }

    return {
      status: "success",
      message,
      story_model_version: output.summary.story_model_version,
      story_count: output.summary.story_count,
      publish_candidate_count: output.summary.publish_candidate_count,
      suppressed_count: output.summary.suppressed_count,
      audit_only_story_count: output.summary.audit_only_story_count,
      signal_story_count: output.summary.signal_story_count,
      signal_audit_story_count: output.summary.signal_audit_story_count,
      market_stories_written: writeCounts.market_stories,
      market_story_members_written: writeCounts.market_story_members,
      dry_run: dryRun,
      bounded,
      time_from: range?.startIso,
      time_to: range?.endIso,
      source_event_count: sourceEvents.length,
    };
  } catch (error) {
    const message = `v0.2 Market Story generation failed: ${safeErrorMessage(error)}`;

    if (!dryRun) {
      await recordJobRun(
        db,
        "run_market_stories_v02",
        "failed",
        message,
        {
          detector_version: "v02",
          story_model_version: MARKET_STORY_V02_MODEL_VERSION,
          bounded,
          time_from: range?.startIso ?? null,
          time_to: range?.endIso ?? null,
          request_id: options.requestId ?? null,
        },
        startedAt,
        new Date(),
      );
    }

    return {
      status: "failed",
      message,
      story_model_version: MARKET_STORY_V02_MODEL_VERSION,
      story_count: 0,
      publish_candidate_count: 0,
      suppressed_count: 0,
      audit_only_story_count: 0,
      signal_story_count: 0,
      signal_audit_story_count: 0,
      market_stories_written: 0,
      market_story_members_written: 0,
      dry_run: dryRun,
      bounded,
      time_from: range?.startIso,
      time_to: range?.endIso,
      source_event_count: 0,
    };
  }
}
