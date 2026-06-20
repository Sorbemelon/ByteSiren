#!/usr/bin/env node

// Side-by-side chart-preview builder for the vnext_c_pattern_tuned detector
// variant. Runs the whole feed pipeline in a `pattern_tuned` namespace
// (variant-named outputs + a separate chart-preview/data-pattern-tuned bundle +
// index.pattern-tuned.html), recomputing the catalyst timing + source markers
// against the variant detection. Base committed outputs and chart-preview/data
// are never touched, so all base tests keep passing.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { CANDLES_SNAPSHOT_PATH, OUTPUTS_DIR, isMain } from "./shared.mjs";
import { runVNextC, parseArgs as vnextcArgs } from "./run-vnext-c.mjs";
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
import {
  runChartPreviewBuild,
  parseArgs as chartArgs,
  CHART_PREVIEW_DIR,
} from "./build-chart-preview.mjs";

const out = (name) => path.join(OUTPUTS_DIR, name);

const PATHS = {
  events: out("vnext_c_pattern_tuned_events.json"),
  daily: out("daily_overviews.pattern_tuned.json"),
  stories: out("day_stories.pattern_tuned.json"),
  storiesMd: out("day_stories.pattern_tuned.md"),
  contract: out("feed_contract_v02.pattern_tuned.json"),
  preview: out("grouped_feed_preview.pattern_tuned.json"),
  previewMd: out("grouped_feed_preview.pattern_tuned.md"),
  audit: out("non_public_audit_events.pattern_tuned.json"),
  auditMd: out("non_public_audit_events.pattern_tuned.md"),
  timing: out("catalyst_signal_timing_audit.pattern_tuned.json"),
  timingMd: out("catalyst_signal_timing_audit.pattern_tuned.md"),
  source: out("catalyst_source_audit.pattern_tuned.json"),
  sourceMd: out("catalyst_source_audit.pattern_tuned.md"),
};

const VARIANT_DATA_DIR = path.join(CHART_PREVIEW_DIR, "data-pattern-tuned");
const VARIANT_HTML_PATH = path.join(CHART_PREVIEW_DIR, "index.pattern-tuned.html");
const VARIANT_DATA_DIRNAME = "data-pattern-tuned";

async function writeVariantHtml(logger) {
  const baseHtml = await readFile(
    path.join(CHART_PREVIEW_DIR, "index.html"),
    "utf8",
  );
  const variantHtml = baseHtml
    .replace(
      "<title>ByteSiren v0.2 Local Feed Preview</title>",
      "<title>ByteSiren v0.2 — pattern_tuned variant preview</title>",
    )
    .replace(
      '<p class="eyebrow">Local-only v0.2D preview</p>',
      '<p class="eyebrow">Local-only v0.2D preview — pattern_tuned variant (A1+A2)</p>',
    )
    .replace(
      "./data/preview-data.generated.js",
      `./${VARIANT_DATA_DIRNAME}/preview-data.generated.js`,
    );
  await writeFile(VARIANT_HTML_PATH, variantHtml, "utf8");
  logger.log(`Variant preview HTML written: ${VARIANT_HTML_PATH}`);
}

export async function buildPatternTunedPreview({ logger = console } = {}) {
  // 1. Variant detector run (25 public / 16 audit), stamped vnext_c_pattern_tuned.
  await runVNextC(vnextcArgs(["--variant", "pattern_tuned"]), { logger });

  // 2-6. Feed pipeline on the variant events, into the pattern_tuned namespace.
  await runDailyOverviews(
    {
      ...dailyArgs([]),
      inputPath: CANDLES_SNAPSHOT_PATH,
      signalEventsPath: PATHS.events,
      outputPath: PATHS.daily,
    },
    { logger },
  );
  await runDayStories(
    {
      ...storiesArgs([]),
      signalEventsPath: PATHS.events,
      jsonOutputPath: PATHS.stories,
      markdownOutputPath: PATHS.storiesMd,
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

  // 7-8. Recompute catalyst timing + source markers against the variant split.
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

  // 9. Build the variant chart-preview bundle (catalysts/alignment/refinements/
  // candles reuse base; feed/preview/audit/source-audit are the variant).
  await runChartPreviewBuild(
    {
      ...chartArgs([]),
      feedContractPath: PATHS.contract,
      groupedPreviewPath: PATHS.preview,
      auditEventsPath: PATHS.audit,
      catalystSourceAuditPath: PATHS.source,
      outDir: VARIANT_DATA_DIR,
    },
    { logger },
  );

  // 10. Variant HTML entry (shares preview.js/preview.css).
  await writeVariantHtml(logger);

  logger.log(
    `Pattern-tuned preview ready: open ${VARIANT_HTML_PATH} (data in ${VARIANT_DATA_DIR}).`,
  );
}

if (isMain(import.meta.url)) {
  buildPatternTunedPreview().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Pattern-tuned preview failed.",
    );
    process.exitCode = 1;
  });
}
