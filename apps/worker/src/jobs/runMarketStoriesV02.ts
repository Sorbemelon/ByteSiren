import {
  listAuditEventsV02ForStoryGeneration,
  listSignalEventsV02ForStoryGeneration,
  upsertMarketStoryOutputV02,
} from "../db/marketStoryRepositoryV02.ts";
import { recordJobRun } from "../db/marketRepository.ts";
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
}

export async function runMarketStoriesV02(
  db: D1Database,
  now = new Date(),
): Promise<RunMarketStoriesV02Result> {
  const startedAt = new Date();

  try {
    const signalEvents = await listSignalEventsV02ForStoryGeneration(db);
    const auditEvents = await listAuditEventsV02ForStoryGeneration(db);
    const sourceEvents = [...signalEvents, ...auditEvents];

    if (sourceEvents.length < 2) {
      const message =
        "v0.2 Market Story generation skipped: fewer than two Signal/Audit events.";

      await recordJobRun(
        db,
        "run_market_stories_v02",
        "skipped",
        message,
        {
          detector_version: "v02",
          story_model_version: MARKET_STORY_V02_MODEL_VERSION,
          source_event_count: sourceEvents.length,
        },
        startedAt,
        now,
      );

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
      };
    }

    const output = generateMarketStoriesV02(sourceEvents);
    const writeCounts = await upsertMarketStoryOutputV02(db, output);
    const message = `v0.2 Market Story generation completed: ${output.summary.story_count} stories, ${output.summary.publish_candidate_count} public candidates.`;

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
        written: writeCounts,
      },
      startedAt,
      new Date(),
    );

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
    };
  } catch (error) {
    const message = `v0.2 Market Story generation failed: ${safeErrorMessage(error)}`;

    await recordJobRun(
      db,
      "run_market_stories_v02",
      "failed",
      message,
      {
        detector_version: "v02",
        story_model_version: MARKET_STORY_V02_MODEL_VERSION,
      },
      startedAt,
      new Date(),
    );

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
    };
  }
}
