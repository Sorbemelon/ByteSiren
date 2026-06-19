#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const EXPERIMENT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CHART_PREVIEW_DIR = path.join(EXPERIMENT_ROOT, "chart-preview");
const CHART_PREVIEW_DATA_DIR = path.join(CHART_PREVIEW_DIR, "data");
const EXPECTED_COUNTS = {
  dayGroups: 31,
  dailyOverviews: 31,
  publicSignals: 14,
  auditEvents: 11,
  candleSymbols: 5,
};

const REQUIRED_PREVIEW_JS_MARKERS = [
  "function renderDayPost",
  "function renderDailySection",
  "function renderSignalSection",
  "function renderAuditCard",
  "feed-diagnostics",
  "Preview data loaded:",
  "Daily Overview",
  "Signal Event",
  "24h Change",
  "Avg Change",
  "Expand days",
  "Collapse days",
];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function loadGeneratedBundle(filePath) {
  const source = await readFile(filePath, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { timeout: 5000 });
  return (
    context.window.__BYTESIREN_V02_PREVIEW__ ??
    context.window.BYTESIREN_PREVIEW_DATA
  );
}

async function loadPreviewData() {
  const generatedPath = path.join(
    CHART_PREVIEW_DATA_DIR,
    "preview-data.generated.js",
  );

  if (await exists(generatedPath)) {
    const payload = await loadGeneratedBundle(generatedPath);
    assert.ok(payload, "generated preview bundle did not assign preview data");
    return {
      source: generatedPath,
      feedContract: payload.feedContract,
      groupedPreview: payload.groupedPreview,
      auditEvents: payload.auditEvents,
      candles: payload.candles,
    };
  }

  const jsonPaths = {
    feedContract: path.join(CHART_PREVIEW_DATA_DIR, "feed_contract_v02.json"),
    groupedPreview: path.join(
      CHART_PREVIEW_DATA_DIR,
      "grouped_feed_preview.json",
    ),
    auditEvents: path.join(
      CHART_PREVIEW_DATA_DIR,
      "non_public_audit_events.json",
    ),
    candles: path.join(CHART_PREVIEW_DATA_DIR, "candles_30d.json"),
  };

  for (const filePath of Object.values(jsonPaths)) {
    assert.ok(await exists(filePath), `missing preview data file: ${filePath}`);
  }

  return {
    source: "json_files",
    feedContract: await readJson(jsonPaths.feedContract),
    groupedPreview: await readJson(jsonPaths.groupedPreview),
    auditEvents: await readJson(jsonPaths.auditEvents),
    candles: await readJson(jsonPaths.candles),
  };
}

function contractItems(feedContract) {
  return feedContract.day_groups.flatMap((group) => group.items);
}

function assertLatestItemsExist(feedContract) {
  for (const group of feedContract.day_groups) {
    assert.ok(group.latest_item_id, `${group.date_utc} missing latest item`);
    assert.ok(
      group.items.some((item) => item.id === group.latest_item_id),
      `${group.date_utc} latest item is not present in items`,
    );
  }
}

async function runSmoke() {
  const requiredStaticFiles = [
    path.join(CHART_PREVIEW_DIR, "index.html"),
    path.join(CHART_PREVIEW_DIR, "preview.js"),
  ];
  for (const filePath of requiredStaticFiles) {
    assert.ok(await exists(filePath), `missing static file: ${filePath}`);
  }

  const [indexHtml, previewJs, data] = await Promise.all([
    readFile(path.join(CHART_PREVIEW_DIR, "index.html"), "utf8"),
    readFile(path.join(CHART_PREVIEW_DIR, "preview.js"), "utf8"),
    loadPreviewData(),
  ]);

  assert.ok(
    indexHtml.includes("preview-data.generated.js") ||
      previewJs.includes('fetchJson("./data/feed_contract_v02.json")'),
    "index.html or preview.js must reference a preview data source",
  );
  assert.ok(
    previewJs.includes("__BYTESIREN_V02_PREVIEW__"),
    "preview.js must try the direct-file-safe global bundle",
  );
  assert.ok(
    previewJs.includes("Preview data could not load"),
    "preview.js must render a visible data-load error",
  );
  for (const marker of REQUIRED_PREVIEW_JS_MARKERS) {
    assert.ok(
      previewJs.includes(marker),
      `preview.js is missing visible render marker: ${marker}`,
    );
  }

  const { feedContract, groupedPreview, auditEvents, candles } = data;
  const items = contractItems(feedContract);
  const signals = items.filter((item) => item.item_type === "signal_event");
  const overviews = items.filter((item) => item.item_type === "daily_overview");
  const candleSymbols = Object.keys(candles.candles_by_symbol ?? {});

  assert.equal(feedContract.day_groups.length, EXPECTED_COUNTS.dayGroups);
  assert.ok(
    groupedPreview?.public_preview?.day_posts?.length,
    "generated preview data must include grouped feed day posts",
  );
  assert.equal(
    groupedPreview.public_preview.day_posts.length,
    EXPECTED_COUNTS.dayGroups,
  );
  assert.equal(signals.length, EXPECTED_COUNTS.publicSignals);
  assert.equal(overviews.length, EXPECTED_COUNTS.dailyOverviews);
  assert.equal(auditEvents.count, EXPECTED_COUNTS.auditEvents);
  assert.equal(candleSymbols.length, EXPECTED_COUNTS.candleSymbols);
  assertLatestItemsExist(feedContract);
  assert.ok(
    signals.some((item) => item.chart?.chart_highlight_type === "event_window"),
    "missing event_window highlights",
  );
  assert.ok(
    overviews.some((item) => item.chart?.chart_highlight_type === "day_window"),
    "missing day_window highlights",
  );
  assert.ok(
    overviews.every(
      (item) =>
        item.expanded?.daily_market_summary_fields?.summary_hint &&
        item.change_label === "24h Change",
    ),
    "daily overview cards must have visible summary text and 24h Change labels",
  );
  assert.ok(
    signals.every(
      (item) =>
        item.display_window &&
        item.avg_change_label === "Avg Change" &&
        item.expanded?.per_symbol_table?.rows?.length,
    ),
    "signal cards must have visible windows, Avg Change labels, and table rows",
  );

  const dataSourceSize = (await stat(data.source)).size;
  const summary = {
    result: "PASS",
    data_source: path.relative(process.cwd(), data.source),
    data_source_size_bytes: dataSourceSize,
    day_groups: feedContract.day_groups.length,
    daily_overviews: overviews.length,
    public_signal_events: signals.length,
    audit_events: auditEvents.count,
    candle_symbols: candleSymbols,
  };

  console.log(JSON.stringify(summary, null, 2));
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
