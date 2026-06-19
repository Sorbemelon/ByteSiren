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
  candleSymbols: 5,
};

const REQUIRED_PREVIEW_JS_MARKERS = [
  "function syncDayToggle",
  "function renderDayPost",
  "function renderDailySection",
  "function renderSignalSection",
  "function renderAuditCard",
  "function drawAllSymbolsChart",
  "function resetSelectionState",
  "function selectionTypeForItem",
  "function scrollPendingSelectionIntoView",
  "data-day-post-toggle",
  "feed-diagnostics",
  "Preview data loaded:",
  "ALL_SYMBOL_VALUE",
  "SYMBOL_COLORS",
  "normalized % change",
  "detector_version",
  "chart_context_enabled",
  "Chart context",
  "Evidence window",
  "Daily Overview",
  "Signal Event",
  "24h Change",
  "Avg Change",
  "Window Change",
  "candles",
  "Peak 15m",
  "Range Position",
  "Volume",
  "Expand days",
  "Collapse days",
  "Show more",
  "Hide",
  "cell-highlight",
  "row-highlight",
  "selectedType",
  "selected-signal",
  "selected-daily",
  "selected-audit",
  "scrollIntoView",
];

const FORBIDDEN_CONTROL_MARKERS = [
  "Latest only",
  "latest_only",
  "Expand all",
  "Collapse all",
  "Expand day",
  "Collapse day",
];

const FORBIDDEN_VISIBLE_MARKERS = [
  "Avg Move",
  "Window Move",
  "Avg 15m",
  "Source likelihood",
  "Notes",
];

const ALLOWED_RANGE_LABELS = new Set([
  "Inside range",
  "Near high",
  "Near low",
  "Broke high",
  "Broke low",
  "—",
]);

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

function assertNoForbiddenControls(label, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const marker of FORBIDDEN_CONTROL_MARKERS) {
    const hasMarker =
      marker === "latest_only"
        ? text.includes(marker)
        : new RegExp(`\\b${marker}\\b`, "i").test(text);
    assert.equal(
      hasMarker,
      false,
      `${label} contains forbidden control marker: ${marker}`,
    );
  }
}

function assertNoForbiddenVisibleLabels(label, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const marker of FORBIDDEN_VISIBLE_MARKERS) {
    assert.equal(
      text.includes(marker),
      false,
      `${label} contains forbidden visible marker: ${marker}`,
    );
  }
}

function assertDayPostCollapseContract(feedContract, groupedPreview) {
  assert.equal(feedContract.preview_state.days_expanded, true);
  assert.equal(
    feedContract.preview_state.global_control_label_when_expanded,
    "Collapse days",
  );
  assert.equal(
    feedContract.preview_state.global_control_label_when_collapsed,
    "Expand days",
  );
  assertNoForbiddenControls(
    "feed contract preview_state",
    feedContract.preview_state,
  );

  for (const group of feedContract.day_groups) {
    assert.ok(group.day_post_id, `${group.date_utc} missing day_post_id`);
    assert.ok(
      group.default_collapsed_item_id,
      `${group.date_utc} missing default_collapsed_item_id`,
    );
    assert.equal(
      group.hidden_item_count_when_collapsed,
      group.item_count - 1,
      `${group.date_utc} hidden count mismatch`,
    );
    assert.equal(
      group.has_extra_items,
      group.item_count > 1,
      `${group.date_utc} has_extra_items mismatch`,
    );
    assert.deepEqual(Array.from(group.visible_item_ids_when_collapsed), [
      group.default_collapsed_item_id,
    ]);
    assert.equal(group.visible_item_ids_when_expanded.length, group.item_count);

    if (group.has_extra_items) {
      assert.equal(
        group.collapsed_control_label,
        `+${group.hidden_item_count_when_collapsed} events · Expand post`,
      );
      assert.equal(group.expanded_control_label, "Collapse post");
    } else {
      assert.equal(group.collapsed_control_label, null);
      assert.equal(group.expanded_control_label, null);
    }
  }

  assert.equal(groupedPreview.preview_state.days_expanded, true);
  assert.deepEqual(Array.from(groupedPreview.preview_state.global_controls), [
    "Expand days",
    "Collapse days",
  ]);
  assertNoForbiddenControls(
    "grouped preview_state",
    groupedPreview.preview_state,
  );

  for (const post of groupedPreview.public_preview.day_posts) {
    assert.equal(post.visible_sections_when_collapsed.length, 1);
    assert.equal(
      post.visible_sections_when_collapsed[0].section_id,
      post.default_collapsed_item_id,
    );
    assert.equal(post.visible_sections_when_expanded.length, post.item_count);
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
    indexHtml.includes('<option value="ALL">All</option>'),
    "index.html must expose the all-symbol chart option",
  );
  assert.ok(
    indexHtml.includes('<option value="BTCUSDT" selected>BTC</option>'),
    "BTC must remain the default chart selection",
  );
  assert.ok(
    previewJs.includes("__BYTESIREN_V02_PREVIEW__"),
    "preview.js must try the direct-file-safe global bundle",
  );
  assert.ok(
    previewJs.includes("Preview data could not load"),
    "preview.js must render a visible data-load error",
  );
  assertNoForbiddenControls("index.html", indexHtml);
  assertNoForbiddenControls("preview.js", previewJs);
  assertNoForbiddenVisibleLabels("preview.js", previewJs);
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
  assertDayPostCollapseContract(feedContract, groupedPreview);
  assert.equal(
    signals.length,
    feedContract.preview_diagnostics.public_signal_count,
  );
  assert.equal(overviews.length, EXPECTED_COUNTS.dailyOverviews);
  assert.equal(
    auditEvents.count,
    feedContract.preview_diagnostics.audit_event_count,
  );
  assert.equal(candleSymbols.length, EXPECTED_COUNTS.candleSymbols);
  assert.equal(feedContract.detector_version, "vnext_c");
  assert.equal(feedContract.chart_context_enabled, true);
  assert.equal(groupedPreview.detector_version, "vnext_c");
  assert.equal(groupedPreview.chart_context_enabled, true);
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
        item.evidence_window_label === "Evidence window" &&
        item.evidence_window_display?.includes("candles") &&
        item.evidence_window?.display?.includes("candles") &&
        Number(item.evidence_bar_count) >= 2 &&
        item.avg_change_label === "Avg Change" &&
        item.chart_context_label &&
        Number.isFinite(item.chart_context_score) &&
        item.event_story_type &&
        item.table_window_change_label === "Window Change" &&
        item.peak_15m_label === "Peak 15m" &&
        item.range_position_label === "Range Position" &&
        item.expanded?.per_symbol_table?.rows?.length,
    ),
    "signal cards must have visible windows, Avg Change labels, and table rows",
  );
  assert.ok(
    signals.every(
      (item) =>
        item.expanded?.diagnostics?.evidence_bar_count >= 2 ||
        item.evidence_bar_count >= 2,
    ),
    "public signal cards must represent multi-candle evidence windows",
  );
  assert.ok(
    overviews.every((item) => item.daily_change_label === "24h Change"),
    "daily overview cards must expose 24h Change label metadata",
  );
  assert.ok(
    signals.every(
      (item) =>
        item.expanded.per_symbol_table.columns.join("|") ===
          "Symbol|Window Change|Peak 15m|Volume ×|Range Position" &&
        item.expanded.per_symbol_table.labels.window_change ===
          "Window Change" &&
        item.expanded.per_symbol_table.labels.peak_15m === "Peak 15m" &&
        item.expanded.per_symbol_table.labels.range_position ===
          "Range Position" &&
        !item.expanded.per_symbol_table.columns.includes("Notes") &&
        item.lead_mover_symbol &&
        item.strongest_peak_symbol &&
        item.highlight_cells?.length >= 2 &&
        item.expanded.per_symbol_table.rows.every((row) =>
          ALLOWED_RANGE_LABELS.has(row.range_position_label),
        ),
    ),
    "signal evidence tables must expose required labels, highlights, and range labels",
  );
  assertNoForbiddenVisibleLabels("feed contract", feedContract);
  assertNoForbiddenVisibleLabels("grouped preview", groupedPreview);

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
