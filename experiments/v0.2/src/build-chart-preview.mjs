#!/usr/bin/env node

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
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

export const CHART_PREVIEW_DIR = path.join(EXPERIMENT_ROOT, "chart-preview");
const CHART_PREVIEW_DATA_DIR = path.join(CHART_PREVIEW_DIR, "data");

function jsData(payload) {
  return [
    `window.__BYTESIREN_V02_PREVIEW__ = ${JSON.stringify(payload)};`,
    "window.BYTESIREN_PREVIEW_DATA = window.__BYTESIREN_V02_PREVIEW__;",
    "",
  ].join("\n");
}

export async function runChartPreviewBuild(options, { logger = console } = {}) {
  await mkdir(CHART_PREVIEW_DATA_DIR, { recursive: true });

  const feedContract = await readJson(options.feedContractPath);
  const groupedPreview = await readJson(options.groupedPreviewPath);
  const auditEvents = await readJson(options.auditEventsPath);
  const candles = await readJson(options.candlesPath);

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
  await copyFile(
    options.candlesPath,
    path.join(CHART_PREVIEW_DATA_DIR, "candles_30d.json"),
  );
  await writeFile(
    path.join(CHART_PREVIEW_DATA_DIR, "preview-data.js"),
    jsData({ feedContract, groupedPreview, auditEvents, candles }),
  );
  await writeFile(
    path.join(CHART_PREVIEW_DATA_DIR, "preview-data.generated.js"),
    jsData({ feedContract, groupedPreview, auditEvents, candles }),
  );

  // Touch static files so the command clearly verifies the expected bundle.
  await readFile(path.join(CHART_PREVIEW_DIR, "index.html"), "utf8");
  await readFile(path.join(CHART_PREVIEW_DIR, "preview.js"), "utf8");
  await readFile(path.join(CHART_PREVIEW_DIR, "preview.css"), "utf8");

  logger.log(
    `Chart preview data complete: ${feedContract.day_groups.length} day groups, ${auditEvents.count} audit events.`,
  );

  return {
    chartPreviewDir: CHART_PREVIEW_DIR,
    dayGroups: feedContract.day_groups.length,
    auditEvents: auditEvents.count,
  };
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    feedContractPath: readOption(argv, "--feed") ?? FEED_CONTRACT_V02_PATH,
    groupedPreviewPath:
      readOption(argv, "--preview") ?? GROUPED_FEED_PREVIEW_JSON_PATH,
    auditEventsPath: readOption(argv, "--audit") ?? NON_PUBLIC_AUDIT_JSON_PATH,
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
