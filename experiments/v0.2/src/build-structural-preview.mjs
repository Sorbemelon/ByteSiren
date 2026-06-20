#!/usr/bin/env node

// Default chart-preview builder for the accepted vnext_structural detector.
// Runs the feed pipeline into the default output names and chart-preview/data
// bundle so index.html always opens the accepted experiment version.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { CANDLES_SNAPSHOT_PATH, OUTPUTS_DIR, isMain } from "./shared.mjs";
import {
  runStructural,
  parseArgs as structuralArgs,
  VNEXT_STRUCTURAL_EVENTS_PATH,
} from "./run-structural.mjs";
import {
  runDailyOverviews,
  parseArgs as dailyArgs,
} from "./generate-daily-overviews.mjs";
import {
  runDayStories,
  parseArgs as storiesArgs,
} from "./generate-day-stories.mjs";
import {
  runFeedContract,
  parseArgs as contractArgs,
} from "./build-feed-contract.mjs";
import {
  runFeedPreview,
  parseArgs as previewArgs,
} from "./build-feed-preview.mjs";
import {
  runNonPublicAudit,
  parseArgs as auditArgs,
} from "./build-non-public-audit.mjs";
import { runCatalystSignalTiming } from "./audit-catalyst-signal-timing.mjs";
import { runCatalystSourceAudit } from "./audit-catalyst-sources.mjs";
import { runAuditSourceRecheck } from "./recheck-audit-sources.mjs";
import {
  runChartPreviewBuild,
  parseArgs as chartArgs,
  CHART_PREVIEW_DIR,
} from "./build-chart-preview.mjs";

const out = (name) => path.join(OUTPUTS_DIR, name);

const PATHS = {
  events: VNEXT_STRUCTURAL_EVENTS_PATH,
  daily: out("daily_overviews.json"),
  stories: out("day_stories.json"),
  storiesMd: out("day_stories.md"),
  contract: out("feed_contract_v02.json"),
  preview: out("grouped_feed_preview.json"),
  previewMd: out("grouped_feed_preview.md"),
  audit: out("non_public_audit_events.json"),
  auditMd: out("non_public_audit_events.md"),
  timing: out("catalyst_signal_timing_audit.json"),
  timingMd: out("catalyst_signal_timing_audit.md"),
  source: out("catalyst_source_audit.json"),
  sourceMd: out("catalyst_source_audit.md"),
  auditSourceRecheck: out("audit_evidence_source_recheck.json"),
  auditSourceRecheckMd: out("audit_evidence_source_recheck.md"),
};

const PREVIEW_DATA_DIRNAME = "data";
const PREVIEW_DATA_DIR = path.join(CHART_PREVIEW_DIR, PREVIEW_DATA_DIRNAME);
const PREVIEW_HTML_PATH = path.join(CHART_PREVIEW_DIR, "index.html");

async function writeDefaultHtml(logger) {
  const baseHtml = await readFile(
    path.join(CHART_PREVIEW_DIR, "index.html"),
    "utf8",
  );
  const previewHtml = baseHtml
    .replace(
      "<title>ByteSiren v0.2 Local Feed Preview</title>",
      "<title>ByteSiren v0.2 structural detector preview</title>",
    )
    .replace(
      '<p class="eyebrow">Local-only v0.2D preview</p>',
      '<p class="eyebrow">Local-only v0.2 preview - vnext_structural (compact catalyst-likely chart patterns)</p>',
    )
    .replace(
      "./data/preview-data.generated.js",
      `./${PREVIEW_DATA_DIRNAME}/preview-data.generated.js`,
    );
  await writeFile(PREVIEW_HTML_PATH, previewHtml, "utf8");
  logger.log(`Structural preview HTML written: ${PREVIEW_HTML_PATH}`);
}

export async function buildStructuralPreview({ logger = console } = {}) {
  // 1. Structural detector run.
  await runStructural(structuralArgs([]), { logger });

  // 2-6. Feed pipeline on the structural events, into the default namespace.
  await runDailyOverviews(
    {
      ...dailyArgs([]),
      inputPath: CANDLES_SNAPSHOT_PATH,
      signalEventsPath: PATHS.events,
      outputPath: PATHS.daily,
    },
    { logger },
  );
  const storyDefaults = storiesArgs([]);
  await runDayStories(
    {
      ...storyDefaults,
      signalEventsPath: PATHS.events,
      jsonOutputPath: PATHS.stories,
      markdownOutputPath: PATHS.storiesMd,
      storyOptions: {
        ...storyDefaults.storyOptions,
        // Structural-only: let a strong same-direction continuation and a strong
        // opposite-direction (cross-family) reversal bridge a slightly wider gap,
        // so otherwise-orphaned strong signals join their nearby Market Story.
        sameDirStrongContinuationMaxGapMinutes: 600,
        oppositeStrongBridgeIgnoreFamily: true,
      },
    },
    { logger },
  );
  await runFeedContract(
    {
      ...contractArgs([]),
      signalEventsPath: PATHS.events,
      dailyOverviewPath: PATHS.daily,
      dayStoriesPath: PATHS.stories,
      outputPath: PATHS.contract,
    },
    { logger },
  );
  await runFeedPreview(
    {
      ...previewArgs([]),
      signalEventsPath: PATHS.events,
      dailyOverviewPath: PATHS.daily,
      dayStoriesPath: PATHS.stories,
      jsonOutputPath: PATHS.preview,
      markdownOutputPath: PATHS.previewMd,
    },
    { logger },
  );
  await runNonPublicAudit(
    {
      ...auditArgs([]),
      signalEventsPath: PATHS.events,
      jsonOutputPath: PATHS.audit,
      markdownOutputPath: PATHS.auditMd,
    },
    { logger },
  );

  // 7-9. Recompute catalyst timing, source markers, and audit source recheck.
  await runCatalystSignalTiming(
    {
      feedContractPath: PATHS.contract,
      auditEventsPath: PATHS.audit,
      jsonOutputPath: PATHS.timing,
      mdOutputPath: PATHS.timingMd,
    },
    { logger },
  );
  await runCatalystSourceAudit(
    {
      timingAuditPath: PATHS.timing,
      jsonOutputPath: PATHS.source,
      mdOutputPath: PATHS.sourceMd,
    },
    { logger },
  );
  await runAuditSourceRecheck(
    {
      eventsPath: PATHS.events,
      sourceAuditPath: PATHS.source,
      candlesPath: CANDLES_SNAPSHOT_PATH,
      jsonOutputPath: PATHS.auditSourceRecheck,
      markdownOutputPath: PATHS.auditSourceRecheckMd,
    },
    { logger },
  );

  // 10. Build the structural chart-preview bundle.
  await runChartPreviewBuild(
    {
      ...chartArgs([]),
      feedContractPath: PATHS.contract,
      groupedPreviewPath: PATHS.preview,
      auditEventsPath: PATHS.audit,
      catalystSourceAuditPath: PATHS.source,
      outDir: PREVIEW_DATA_DIR,
    },
    { logger },
  );

  // 11. Default HTML entry (shares preview.js/preview.css).
  await writeDefaultHtml(logger);

  logger.log(
    `Structural preview ready: open ${PREVIEW_HTML_PATH} (data in ${PREVIEW_DATA_DIR}).`,
  );
}

if (isMain(import.meta.url)) {
  buildStructuralPreview().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Structural preview failed.",
    );
    process.exitCode = 1;
  });
}
