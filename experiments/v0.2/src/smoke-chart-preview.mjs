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
  "function drawStoryOverlay",
  "function drawStoryAuditOverlay",
  "function renderStorySection",
  "story_context_label",
  "function renderSignalSection",
  "function renderAuditCard",
  "function renderAuditStoryGroup",
  "function renderCombinedAuditGroup",
  "function auditLinkedStoryItems",
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
  "Market Story",
  "Story-window context",
  "Label decision",
  "Adaptive gap",
  "Signal Event",
  "24h Change",
  "Swing Change",
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
  "selected-story",
  "publicStoryItems",
  "includedAuditItems",
  '"story"',
  '"story_audit"',
  "Audit Events",
  "Audit-linked Market Stories",
  "selected-audit",
  "combined-audit-group",
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
    indexHtml.includes('data-mode="both"'),
    "index.html must expose the Both feed mode",
  );
  assert.ok(
    previewJs.includes("__BYTESIREN_V02_PREVIEW__"),
    "preview.js must try the direct-file-safe global bundle",
  );
  assert.ok(
    previewJs.includes("Preview data could not load"),
    "preview.js must render a visible data-load error",
  );
  assert.ok(
    previewJs.includes('state.mode === "both"'),
    "preview.js must render a combined public/audit mode",
  );
  assertNoForbiddenControls("index.html", indexHtml);
  assertNoForbiddenControls("preview.js", previewJs);
  assertNoForbiddenVisibleLabels("preview.js", previewJs);
  assert.equal(
    previewJs.includes("story-index"),
    false,
    "Market Stories should be merged into day posts, not rendered as a separate story index",
  );
  assert.equal(
    previewJs.includes("data-story-index-item"),
    false,
    "Market Story selection should use merged cards or chart story bands, not a separate index",
  );
  assert.equal(
    previewJs.includes("story-chip-stack"),
    false,
    "Market Story preview should render one selected label, not a multi-label chip stack",
  );
  assert.equal(
    previewJs.includes("secondary-story-chip"),
    false,
    "Market Story preview should not render secondary story-label chips",
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
  const stories = items.filter((item) => item.item_type === "market_story");
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
  assert.equal(
    stories.length,
    feedContract.preview_diagnostics.market_story_count,
  );
  for (const story of stories) {
    assert.equal(
      "story_context_labels" in story,
      false,
      `${story.id} should expose one story_context_label only`,
    );
    assert.equal(
      "story_context_secondary_labels" in story,
      false,
      `${story.id} should not expose secondary story labels`,
    );
    assert.equal(
      "story_context_labels" in (story.claude_payload ?? {}),
      false,
      `${story.id} Claude payload should use one story_context_label only`,
    );
    assert.ok(
      story.story_window_context?.available,
      `${story.id} should include story-window candle context`,
    );
    assert.equal(
      story.story_window_context.story_window_context_version,
      "story_window_path_v2",
      `${story.id} should use the explicit story-window classifier model`,
    );
    assert.equal(
      Number.isFinite(
        story.story_window_context.volatility_expansion_sequence_score,
      ),
      true,
      `${story.id} should include volatility-expansion story-window score`,
    );
    assert.equal(
      Number.isFinite(
        story.story_window_context.inside_range_impulse_sequence_score,
      ),
      true,
      `${story.id} should include inside-range story-window score`,
    );
    assert.equal(
      ["Two-sided sequence", "Multi-swing context"].includes(
        story.story_context_label,
      ),
      false,
      `${story.id} should not use removed duplicate Market Story labels`,
    );
    assert.ok(
      Array.isArray(story.story_label_decision_reasons) &&
        story.story_label_decision_reasons.length > 0,
      `${story.id} should include story label decision reasons`,
    );
  }
  assert.ok(
    stories.length > 0,
    "generated preview data must include Market Story items",
  );
  assert.ok(
    stories.some((item) => item.story_window.crosses_utc_day),
    "at least one Market Story should demonstrate cross-UTC-day support",
  );
  assert.ok(
    stories.some((item) => item.max_event_gap_minutes > 480),
    "adaptive gap should allow at least one story beyond the old fixed 8h bridge",
  );
  assert.ok(
    stories.some(
      (item) =>
        item.eligibility_reason ===
          "mixed_public_audit_strong_chart_context" &&
        item.included_signal_event_ids.length === 1 &&
        item.included_audit_event_ids.length === 1,
    ),
    "strong chart context should qualify one public plus one audit event",
  );
  assert.ok(
    stories.some((item) => item.included_audit_event_ids.length > 0),
    "at least one Market Story should include audit-only detections",
  );
  assert.ok(
    stories.some(
      (item) =>
        item.story_source_type === "audit_only_sequence" &&
        item.included_signal_event_ids.length === 0 &&
        item.included_audit_event_ids.length >= 2,
    ),
    "at least one Market Story should be generated from audit-only detections",
  );
  assert.ok(
    stories.some(
      (item) =>
        item.story_source_type === "audit_only_sequence" &&
        item.included_signal_event_ids.length === 0 &&
        item.included_audit_event_ids.length === 3 &&
        item.eligibility_reason === "strong_audit_context_sequence" &&
        item.max_event_gap_minutes > 720 &&
        item.expanded.story_details.included_audit_events.some((event) =>
          event.window_start.startsWith("2026-06-01T01:00"),
        ) &&
        item.expanded.story_details.included_audit_events.some((event) =>
          event.window_start.startsWith("2026-06-01T15:15"),
        ) &&
        item.expanded.story_details.included_audit_events.some((event) =>
          event.window_start.startsWith("2026-06-02T02:15"),
        ),
    ),
    "the strong June 1-2 audit-only sequence should become one Market Story",
  );
  assert.ok(
    stories.every(
      (item) =>
        item.chart?.chart_highlight_type === "story_window" &&
        item.chart.highlight_start &&
        item.chart.highlight_end &&
        item.chart.anchor_date_utc === item.date_utc &&
        item.swing_change_label === "Swing Change" &&
        item.story_source_label &&
        item.gap_model_version === "adaptive_chart_context_gap_v3" &&
        item.minimum_story_range?.eligible === true &&
        item.primary_story_family &&
        item.story_context_scores &&
        item.eligibility_reason &&
        Array.isArray(item.adaptive_gap_links) &&
        typeof item.adaptive_gap_summary === "string" &&
        item.adaptive_gap_links.every(
          (link) =>
            link.bridge_allowed === true &&
            Number.isFinite(link.gap_minutes) &&
            Number.isFinite(link.allowed_gap_minutes) &&
            link.gap_minutes <= link.allowed_gap_minutes &&
            typeof link.strong_audit_sequence_bridge === "boolean" &&
            typeof link.coherent_story_structure === "boolean" &&
            typeof link.full_market_reset_detected === "boolean" &&
            Array.isArray(link.bridge_reasons) &&
            link.bridge_reasons.length > 0,
        ) &&
        item.total_event_count >= 2 &&
        item.total_event_count ===
          item.included_signal_event_ids.length +
            item.included_audit_event_ids.length &&
        Array.isArray(item.included_audit_event_ids) &&
        item.audit_event_count === item.included_audit_event_ids.length &&
        item.chart.included_audit_event_ids.length ===
          item.included_audit_event_ids.length &&
        Array.isArray(item.expanded.story_details.included_audit_events),
    ),
    "Market Story cards must expose story-window chart fields and included signal/audit events",
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
  const storyAuditEventLinks = stories.reduce(
    (sum, item) => sum + item.included_audit_event_ids.length,
    0,
  );
  const summary = {
    result: "PASS",
    data_source: path.relative(process.cwd(), data.source),
    data_source_size_bytes: dataSourceSize,
    day_groups: feedContract.day_groups.length,
    daily_overviews: overviews.length,
    public_signal_events: signals.length,
    market_stories: stories.length,
    story_audit_event_links: storyAuditEventLinks,
    audit_events: auditEvents.count,
    candle_symbols: candleSymbols,
  };

  console.log(JSON.stringify(summary, null, 2));
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
