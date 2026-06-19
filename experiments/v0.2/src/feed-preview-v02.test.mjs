import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function contractItems(contract) {
  return contract.day_groups.flatMap((group) => group.items);
}

function previewSections(preview) {
  return preview.public_preview.day_posts.flatMap((post) => post.sections);
}

const FORBIDDEN_CONTROL_LABELS = [
  "Latest only",
  "latest_only",
  "Expand all",
  "Collapse all",
  "Expand day",
  "Collapse day",
];

const FORBIDDEN_VISIBLE_LABELS = [
  "Avg Move",
  "Window Move",
  "Avg 15m",
  "Source likelihood",
];

const ALLOWED_RANGE_LABELS = new Set([
  "Inside range",
  "Near high",
  "Near low",
  "Broke high",
  "Broke low",
  "—",
]);

function publicLabelText(value) {
  return JSON.stringify(value)
    .replace(/window_move_pct|market_24h_move_pct|top_symbol_moves/g, "")
    .toLowerCase();
}

function includesForbiddenLabel(text, label) {
  return new RegExp(`\\b${label}\\b`, "i").test(text);
}

function includesForbiddenControl(text, label) {
  if (label === "latest_only") {
    return text.includes(label);
  }

  return includesForbiddenLabel(text, label);
}

test("feed contract has 31 day groups and Daily Overview first", async () => {
  const contract = await readJson("experiments/v0.2/outputs/feed_contract_v02.json");

  assert.equal(contract.day_groups.length, 31);
  for (const group of contract.day_groups) {
    assert.equal(group.items[0].item_type, "daily_overview");
    assert.equal(
      group.items.filter((item) => item.item_type === "daily_overview").length,
      1,
    );
  }
});

test("public preview has 31 day posts and 14 public signal events", async () => {
  const preview = await readJson("experiments/v0.2/outputs/grouped_feed_preview.json");
  const signals = previewSections(preview).filter(
    (item) => item.item_type === "signal_event",
  );

  assert.equal(preview.public_preview.day_posts.length, 31);
  assert.equal(signals.length, 14);
});

test("global day controls replace latest-only mode", async () => {
  const preview = await readJson("experiments/v0.2/outputs/grouped_feed_preview.json");

  assert.equal(preview.preview_state.days_expanded, true);
  assert.equal(preview.preview_state.global_control_label, "Collapse days");
  assert.equal(
    preview.preview_state.global_control_label_when_expanded,
    "Collapse days",
  );
  assert.equal(
    preview.preview_state.global_control_label_when_collapsed,
    "Expand days",
  );
  assert.deepEqual(preview.preview_state.possible_global_control_labels, [
    "Expand days",
    "Collapse days",
  ]);
  assert.deepEqual(preview.preview_state.global_controls, [
    "Expand days",
    "Collapse days",
  ]);
  assert.equal("expanded_mode" in preview.preview_state, false);
  assert.equal("possible_modes" in preview.preview_state, false);
  assert.equal("latest_item_id" in preview.preview_state, false);

  const controlText = JSON.stringify(preview.preview_state);
  for (const label of FORBIDDEN_CONTROL_LABELS) {
    assert.equal(includesForbiddenControl(controlText, label), false);
  }
});

test("day-post contract exposes collapsed and expanded metadata", async () => {
  const contract = await readJson("experiments/v0.2/outputs/feed_contract_v02.json");

  for (const group of contract.day_groups) {
    assert.ok(group.day_post_id);
    assert.ok(group.default_collapsed_item_id);
    assert.equal(group.items.some((item) => item.id === group.default_collapsed_item_id), true);
    assert.equal(
      group.hidden_item_count_when_collapsed,
      group.item_count - 1,
    );
    assert.equal(group.has_extra_items, group.item_count > 1);
    assert.deepEqual(group.visible_item_ids_when_collapsed, [
      group.default_collapsed_item_id,
    ]);
    assert.equal(group.visible_item_ids_when_expanded.length, group.item_count);

    if (group.item_count > 1) {
      const expandLabel = `+${group.hidden_item_count_when_collapsed} events · Expand post`;
      const collapseLabel = "Collapse post";
      assert.equal(
        group.day_post_control.expand_label,
        expandLabel,
      );
      assert.equal(
        group.day_post_control.collapse_label,
        collapseLabel,
      );
      assert.equal(group.collapsed_control_label, expandLabel);
      assert.equal(group.expanded_control_label, collapseLabel);
    } else {
      assert.equal(group.day_post_control.expand_label, null);
      assert.equal(group.day_post_control.collapse_label, null);
      assert.equal(group.collapsed_control_label, null);
      assert.equal(group.expanded_control_label, null);
    }
  }
});

test("preview models collapsed and expanded visible sections per day", async () => {
  const preview = await readJson("experiments/v0.2/outputs/grouped_feed_preview.json");

  for (const post of preview.public_preview.day_posts) {
    assert.equal(post.visible_sections_when_collapsed.length, 1);
    assert.equal(
      post.visible_sections_when_collapsed[0].section_id,
      post.default_collapsed_item_id,
    );
    assert.equal(post.visible_sections_when_expanded.length, post.item_count);

    if (post.item_count > 1) {
      assert.equal(
        post.collapsed_control_label,
        `+${post.hidden_item_count_when_collapsed} events · Expand post`,
      );
      assert.equal(post.expanded_control_label, "Collapse post");
    } else {
      assert.equal(post.collapsed_control_label, null);
      assert.equal(post.expanded_control_label, null);
    }
  }
});

test("section controls use Show more and Hide", async () => {
  const contract = await readJson("experiments/v0.2/outputs/feed_contract_v02.json");

  for (const item of contractItems(contract)) {
    assert.equal(item.expanded.section_control.collapsed_label, "Show more");
    assert.equal(item.expanded.section_control.expanded_label, "Hide");
  }
});

test("public labels use Avg Change, 24h Change, and Window Change", async () => {
  const contract = await readJson("experiments/v0.2/outputs/feed_contract_v02.json");
  const items = contractItems(contract);
  const signals = items.filter((item) => item.item_type === "signal_event");
  const overviews = items.filter((item) => item.item_type === "daily_overview");

  assert.ok(signals.length > 0);
  assert.ok(overviews.length > 0);
  assert.ok(signals.every((item) => item.avg_change_label === "Avg Change"));
  assert.ok(overviews.every((item) => item.change_label === "24h Change"));
  assert.ok(overviews.every((item) => item.daily_change_label === "24h Change"));
  assert.ok(
    signals.every(
      (item) =>
        item.table_window_change_label === "Window Change" &&
        item.peak_15m_label === "Peak 15m" &&
        item.volume_label === "Volume ×" &&
        item.range_position_label === "Range Position",
    ),
  );
  assert.ok(
    signals.every((item) =>
      item.expanded.per_symbol_table.columns.includes("Window Change"),
    ),
  );
  assert.ok(
    signals.every(
      (item) =>
        item.expanded.per_symbol_table.columns.includes("Peak 15m") &&
        item.expanded.per_symbol_table.columns.includes("Range Position") &&
        item.expanded.per_symbol_table.columns.includes("Volume ×") &&
        !item.expanded.per_symbol_table.columns.includes("Notes"),
    ),
  );
  assert.ok(
    signals.every(
      (item) =>
        item.expanded.per_symbol_table.labels.window_change ===
          "Window Change" &&
        item.expanded.per_symbol_table.labels.peak_15m === "Peak 15m" &&
        item.expanded.per_symbol_table.labels.range_position ===
          "Range Position",
    ),
  );
});

test("range position and table highlight metadata are present", async () => {
  const contract = await readJson("experiments/v0.2/outputs/feed_contract_v02.json");
  const signals = contractItems(contract).filter(
    (item) => item.item_type === "signal_event",
  );

  for (const signal of signals) {
    assert.ok(signal.event_range_context);
    assert.ok(signal.event_range_context_label);
    assert.ok(signal.lead_mover_symbol);
    assert.ok(signal.strongest_peak_symbol);
    assert.ok(Array.isArray(signal.highlight_cells));
    assert.ok(
      signal.highlight_cells.some(
        (cell) =>
          cell.symbol === signal.lead_mover_symbol &&
          cell.reason === "lead_mover",
      ),
    );
    assert.ok(
      signal.highlight_cells.some(
        (cell) =>
          cell.symbol === signal.strongest_peak_symbol &&
          cell.reason === "strongest_peak_15m",
      ),
    );
    assert.ok(
      signal.per_symbol_evidence.every(
        (row) =>
          row.range_position_label &&
          ALLOWED_RANGE_LABELS.has(row.range_position_label),
      ),
    );
    assert.equal(
      signal.expanded.per_symbol_table.rows.every((row) =>
        ALLOWED_RANGE_LABELS.has(row.range_position_label),
      ),
      true,
    );
  }
});

test("glossary explains evidence table wording without long theory", async () => {
  const preview = await readJson("experiments/v0.2/outputs/grouped_feed_preview.json");
  const glossary = preview.glossary;

  assert.match(glossary.avg_change, /median or average change/i);
  assert.match(glossary.window_change, /one symbol/i);
  assert.match(glossary.peak_15m, /15-minute change/i);
  assert.match(glossary.lead_mover_highlight, /highlighted symbol or row/i);
  assert.match(glossary.peak_15m_highlight, /highlighted Peak 15m cell/i);
  assert.match(glossary.range_position, /descriptive, not a trading signal/i);
  assert.match(glossary.evidence_window, /not a single timestamp/i);
});

test("public labels avoid trading-style range wording", async () => {
  const contract = await readJson("experiments/v0.2/outputs/feed_contract_v02.json");
  const preview = await readJson("experiments/v0.2/outputs/grouped_feed_preview.json");
  const visibleText = publicLabelText({
    contract,
    public_preview: preview.public_preview,
    glossary: preview.glossary,
  });

  for (const label of FORBIDDEN_VISIBLE_LABELS) {
    assert.equal(visibleText.includes(label.toLowerCase()), false);
  }
  assert.equal(includesForbiddenLabel(visibleText, "support"), false);
  assert.equal(includesForbiddenLabel(visibleText, "resistance"), false);
  assert.equal(visibleText.includes("breakout signal"), false);
  assert.equal(visibleText.includes("breakdown signal"), false);
  assert.equal(includesForbiddenLabel(visibleText, "buy"), false);
  assert.equal(includesForbiddenLabel(visibleText, "sell"), false);
  assert.equal(includesForbiddenLabel(visibleText, "long"), false);
  assert.equal(includesForbiddenLabel(visibleText, "short"), false);
  assert.equal(includesForbiddenLabel(visibleText, "hold"), false);
});

test("chart model supports event/day windows and selection toggles", async () => {
  const contract = await readJson("experiments/v0.2/outputs/feed_contract_v02.json");
  const items = contractItems(contract);
  const signal = items.find((item) => item.item_type === "signal_event");
  const overview = items.find((item) => item.item_type === "daily_overview");

  assert.equal(signal.chart.chart_highlight_type, "event_window");
  assert.ok(signal.chart.highlight_start);
  assert.ok(signal.chart.highlight_end);
  assert.ok(signal.chart.peak_marker_time);
  assert.equal(signal.chart.selection_toggle, "select_again_to_clear");
  assert.equal(signal.chart.background_click_clears_selection, true);

  assert.equal(overview.chart.chart_highlight_type, "day_window");
  assert.ok(overview.chart.highlight_start);
  assert.ok(overview.chart.highlight_end);
  assert.equal(overview.chart.hide_other_days_on_select, true);
  assert.equal(overview.chart.selection_toggle, "select_again_to_clear");
  assert.ok(Array.isArray(overview.chart.included_signal_event_ids));
});

test("audit file has exactly 11 non-public events", async () => {
  const audit = await readJson("experiments/v0.2/outputs/non_public_audit_events.json");

  assert.equal(audit.count, 11);
  assert.equal(audit.items.length, 11);
  assert.ok(audit.items.every((item) => item.suppress_reason));
});
