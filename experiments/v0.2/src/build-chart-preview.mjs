#!/usr/bin/env node

import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CANDLES_SNAPSHOT_PATH,
  EXPERIMENT_ROOT,
  isMain,
  readJson,
  readOption,
  writeJson,
} from "./shared.mjs";
import { FEED_CONTRACT_V02_PATH } from "./build-feed-contract.mjs";
import { GROUPED_FEED_PREVIEW_JSON_PATH } from "./build-feed-preview.mjs";
import { NON_PUBLIC_AUDIT_JSON_PATH } from "./build-non-public-audit.mjs";
import {
  CATALYST_SIGNAL_ALIGNMENT_JSON_PATH,
  INDEPENDENT_CATALYSTS_JSON_PATH,
} from "./discover-catalysts.mjs";
import { CATALYST_TIME_REFINEMENTS_JSON_PATH } from "./refine-catalyst-times.mjs";
import { SOURCE_AUDIT_JSON_PATH } from "./audit-catalyst-sources.mjs";

export const CHART_PREVIEW_DIR = path.join(EXPERIMENT_ROOT, "chart-preview");
const CHART_PREVIEW_DATA_DIR = path.join(CHART_PREVIEW_DIR, "data");

function jsData(payload) {
  return [
    `window.__BYTESIREN_V02_PREVIEW__ = ${JSON.stringify(payload)};`,
    "window.BYTESIREN_PREVIEW_DATA = window.__BYTESIREN_V02_PREVIEW__;",
    "",
  ].join("\n");
}

async function readOptionalJson(filePath, fallback) {
  try {
    await access(filePath);
    return readJson(filePath);
  } catch {
    return fallback;
  }
}

function signalOrAuditUniqueSourceMarkerCount(sourceAudit) {
  const urls = new Set();
  for (const row of sourceAudit.rows ?? []) {
    if (
      row.source?.url &&
      ["keep", "conditional_keep"].includes(row.context_decision) &&
      (row.public_signal_timing?.catalyst_candidate_within_12h ||
        row.all_detected_timing?.catalyst_candidate_within_12h)
    ) {
      urls.add(row.source.url);
    }
  }
  return urls.size;
}

export async function runChartPreviewBuild(options, { logger = console } = {}) {
  await mkdir(CHART_PREVIEW_DATA_DIR, { recursive: true });

  const feedContract = await readJson(options.feedContractPath);
  const groupedPreview = await readJson(options.groupedPreviewPath);
  const auditEvents = await readJson(options.auditEventsPath);
  const candles = await readJson(options.candlesPath);
  const catalysts = await readOptionalJson(options.catalystsPath, {
    generated_at: new Date(0).toISOString(),
    catalyst_count: 0,
    items: [],
  });
  const catalystAlignment = await readOptionalJson(options.catalystAlignmentPath, {
    generated_at: new Date(0).toISOString(),
    catalyst_count: 0,
    signal_count: 0,
    catalyst_alignment: [],
    catalysts_near_signal_count: 0,
    catalyst_without_near_signal_count: 0,
    signals_near_catalyst_count: 0,
    signal_without_near_catalyst_count: 0,
  });
  const catalystTimeRefinements = await readOptionalJson(
    options.catalystTimeRefinementsPath,
    {
      generated_at: new Date(0).toISOString(),
      input_count: 0,
      target_count: 0,
      refined_count: 0,
      same_day_refined_count: 0,
      fetch_failed_count: 0,
      items: [],
    },
  );
  const catalystSourceAudit = await readOptionalJson(
    options.catalystSourceAuditPath,
    {
      generated_at: new Date(0).toISOString(),
      no_claude_used: true,
      summary: {},
      rows: [],
    },
  );

  await writeJson(
    path.join(CHART_PREVIEW_DATA_DIR, "feed_contract_v02.json"),
    feedContract,
  );
  await writeJson(
    path.join(CHART_PREVIEW_DATA_DIR, "grouped_feed_preview.json"),
    groupedPreview,
  );
  await writeJson(
    path.join(CHART_PREVIEW_DATA_DIR, "non_public_audit_events.json"),
    auditEvents,
  );
  await writeJson(
    path.join(CHART_PREVIEW_DATA_DIR, "independent_catalyst_events_30d.json"),
    catalysts,
  );
  await writeJson(
    path.join(CHART_PREVIEW_DATA_DIR, "catalyst_signal_alignment.json"),
    catalystAlignment,
  );
  await writeJson(
    path.join(CHART_PREVIEW_DATA_DIR, "catalyst_time_refinements.json"),
    catalystTimeRefinements,
  );
  await writeJson(
    path.join(CHART_PREVIEW_DATA_DIR, "catalyst_source_audit.json"),
    catalystSourceAudit,
  );
  await copyFile(
    options.candlesPath,
    path.join(CHART_PREVIEW_DATA_DIR, "candles_30d.json"),
  );
  const payload = {
    feedContract,
    groupedPreview,
    auditEvents,
    catalysts,
    catalystAlignment,
    catalystTimeRefinements,
    catalystSourceAudit,
    candles,
  };
  await writeFile(
    path.join(CHART_PREVIEW_DATA_DIR, "preview-data.js"),
    jsData(payload),
  );
  await writeFile(
    path.join(CHART_PREVIEW_DATA_DIR, "preview-data.generated.js"),
    jsData(payload),
  );

  // Touch static files so the command clearly verifies the expected bundle.
  await readFile(path.join(CHART_PREVIEW_DIR, "index.html"), "utf8");
  await readFile(path.join(CHART_PREVIEW_DIR, "preview.js"), "utf8");
  await readFile(path.join(CHART_PREVIEW_DIR, "preview.css"), "utf8");

  logger.log(
    `Chart preview data complete: ${feedContract.day_groups.length} day groups, ${auditEvents.count} audit events, ${catalysts.items.length} catalyst candidates, ${catalystTimeRefinements.refined_count} source-time refinements, ${signalOrAuditUniqueSourceMarkerCount(catalystSourceAudit)} signal/audit keep/conditional source markers.`,
  );

  return {
    chartPreviewDir: CHART_PREVIEW_DIR,
    dayGroups: feedContract.day_groups.length,
    auditEvents: auditEvents.count,
    catalystCandidates: catalysts.items.length,
    catalystTimeRefinements: catalystTimeRefinements.refined_count,
    signalOrAuditSourceMarkers:
      signalOrAuditUniqueSourceMarkerCount(catalystSourceAudit),
  };
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    feedContractPath: readOption(argv, "--feed") ?? FEED_CONTRACT_V02_PATH,
    groupedPreviewPath:
      readOption(argv, "--preview") ?? GROUPED_FEED_PREVIEW_JSON_PATH,
    auditEventsPath: readOption(argv, "--audit") ?? NON_PUBLIC_AUDIT_JSON_PATH,
    catalystsPath:
      readOption(argv, "--catalysts") ?? INDEPENDENT_CATALYSTS_JSON_PATH,
    catalystAlignmentPath:
      readOption(argv, "--catalyst-alignment") ??
      CATALYST_SIGNAL_ALIGNMENT_JSON_PATH,
    catalystTimeRefinementsPath:
      readOption(argv, "--catalyst-time-refinements") ??
      CATALYST_TIME_REFINEMENTS_JSON_PATH,
    catalystSourceAuditPath:
      readOption(argv, "--catalyst-source-audit") ?? SOURCE_AUDIT_JSON_PATH,
    candlesPath: readOption(argv, "--candles") ?? CANDLES_SNAPSHOT_PATH,
  };
}

if (isMain(import.meta.url)) {
  runChartPreviewBuild(parseArgs()).catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Chart preview build failed.",
    );
    process.exitCode = 1;
  });
}
