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

const DAY_STORY_GAP_MODEL_VERSION = "adaptive_chart_context_gap_v3";

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
  const contract = await readJson(
    "experiments/v0.2/outputs/feed_contract_v02.json",
  );

  assert.equal(contract.day_groups.length, 31);
  for (const group of contract.day_groups) {
    assert.equal(group.items[0].item_type, "daily_overview");
    assert.equal(
      group.items.filter((item) => item.item_type === "daily_overview").length,
      1,
    );
  }
});

test("public preview has 31 day posts and detector-derived public signal events", async () => {
  const preview = await readJson(
    "experiments/v0.2/outputs/grouped_feed_preview.json",
  );
  const eventsPayload = await readJson(
    "experiments/v0.2/outputs/vnext_c_events.json",
  );
  const signals = previewSections(preview).filter(
    (item) => item.item_type === "signal_event",
  );
  const expectedPublicSignals = eventsPayload.events.filter(
    (event) => event.publish_candidate,
  ).length;

  assert.equal(preview.detector_version, "vnext_c");
  assert.equal(preview.chart_context_enabled, true);
  assert.equal(preview.public_preview.day_posts.length, 31);
  assert.equal(signals.length, expectedPublicSignals);
});

test("market stories are anchored to the start-trigger UTC day", async () => {
  const contract = await readJson(
    "experiments/v0.2/outputs/feed_contract_v02.json",
  );
  const storiesPayload = await readJson(
    "experiments/v0.2/outputs/day_stories.json",
  );
  const stories = contractItems(contract).filter(
    (item) => item.item_type === "market_story",
  );
  const preview = await readJson(
    "experiments/v0.2/outputs/grouped_feed_preview.json",
  );
  const storySections = previewSections(preview).filter(
    (item) => item.item_type === "market_story",
  );

  assert.equal(stories.length, storiesPayload.count);
  assert.equal(storiesPayload.story_layer_version, DAY_STORY_GAP_MODEL_VERSION);
  assert.equal(
    storiesPayload.options.gapModelVersion,
    DAY_STORY_GAP_MODEL_VERSION,
  );
  assert.ok(storiesPayload.options.baseGapMinutes < storiesPayload.options.maxGapMinutes);
  assert.equal(preview.public_preview.market_story_count, storiesPayload.count);
  assert.equal(storySections.length, storiesPayload.count);
  assert.ok(stories.length > 0);
  assert.equal(storiesPayload.options.minStoryDurationMinutes, 240);
  assert.equal(storiesPayload.options.minStorySwingChangePct, 2);
  assert.ok(
    storiesPayload.items.every(
      (story) =>
        story.minimum_story_range?.eligible === true &&
        story.duration_min >= storiesPayload.options.minStoryDurationMinutes &&
        story.total_swing_change_pct >=
          storiesPayload.options.minStorySwingChangePct,
    ),
    "Market Stories should pass the minimum duration and Swing Change floor",
  );
  assert.ok(
    !storiesPayload.items.some(
      (story) =>
        story.duration_min < storiesPayload.options.minStoryDurationMinutes ||
        story.total_swing_change_pct <
          storiesPayload.options.minStorySwingChangePct,
    ),
    "short or low-swing clusters should not become Market Stories",
  );
  assert.ok(stories.some((story) => story.story_window.crosses_utc_day));
  assert.ok(
    stories.some((story) => story.max_event_gap_minutes > 480),
    "adaptive gaps should allow strongly connected stories past the old fixed 8h bridge",
  );
  assert.ok(
    stories.some(
      (story) =>
        story.eligibility_reason ===
          "mixed_public_audit_strong_chart_context" &&
        story.included_signal_event_ids.length === 1 &&
        story.included_audit_event_ids.length === 1,
    ),
    "one public plus one audit event should qualify when chart context is strong",
  );
  assert.ok(
    stories.some((story) => story.included_audit_event_ids.length > 0),
    "at least one Market Story should include audit-only detections",
  );
  assert.ok(
    stories.some(
      (story) =>
        story.story_source_type === "audit_only_sequence" &&
        story.included_signal_event_ids.length === 0 &&
        story.included_audit_event_ids.length >= 2,
    ),
    "at least one Market Story should be allowed from audit-only detections",
  );
  const juneAuditStory = stories.find(
    (story) =>
      story.story_source_type === "audit_only_sequence" &&
      story.included_signal_event_ids.length === 0 &&
      story.included_audit_event_ids.length === 3 &&
      [
        "2026-06-01T01:00",
        "2026-06-01T15:15",
        "2026-06-02T02:15",
      ].every((start) =>
        story.expanded.story_details.included_audit_events.some((event) =>
          event.window_start.startsWith(start),
        ),
      ),
  );
  assert.ok(
    juneAuditStory,
    "strong audit-only sequence should bridge the three June 1-2 audit events",
  );
  assert.equal(
    juneAuditStory.eligibility_reason,
    "strong_audit_context_sequence",
  );
  assert.equal(
    juneAuditStory.story_context_label,
    "Reversal sequence",
  );
  assert.equal(
    juneAuditStory.story_type,
    "multi_swing_relief_reversal_two_sided",
  );
  assert.equal(juneAuditStory.primary_story_family, "relief_reversal");
  assert.equal(
    juneAuditStory.member_dominant_story_family,
    "relief_reversal",
  );
  assert.equal(
    juneAuditStory.story_window_context.story_window_context_version,
    "story_window_path_v2",
  );
  assert.equal(
    juneAuditStory.story_window_context.reversal_sequence_score >= 55,
    true,
  );
  assert.equal(
    juneAuditStory.story_label_decision_reasons.includes(
      "story_window_reversal_score",
    ),
    true,
  );
  assert.equal(juneAuditStory.story_context_scores.range_break, 0);
  assert.equal(juneAuditStory.two_sided_swing.eligible, true);
  assert.equal("story_context_labels" in juneAuditStory, false);
  assert.equal("story_context_secondary_labels" in juneAuditStory, false);
  assert.ok(juneAuditStory.max_event_gap_minutes > 720);
  assert.ok(
    juneAuditStory.adaptive_gap_links.every(
      (link) =>
        link.strong_audit_sequence_bridge &&
        link.coherent_story_structure &&
        !link.full_market_reset_detected,
    ),
  );

  for (const story of stories) {
    assert.equal(story.date_utc, story.chart.anchor_date_utc);
    assert.equal(story.date_utc, story.story_window.start.slice(0, 10));
    assert.equal(story.story_window_label, "Story window");
    assert.equal(story.swing_change_label, "Swing Change");
    assert.equal(story.chart.chart_highlight_type, "story_window");
    assert.equal(story.gap_model_version, DAY_STORY_GAP_MODEL_VERSION);
    assert.ok(story.eligibility_reason);
    assert.ok(story.primary_story_family);
    assert.ok(story.member_dominant_story_family);
    assert.ok(story.story_context_scores);
    assert.ok(story.story_window_context?.available);
    assert.equal(
      story.story_window_context.story_window_context_version,
      "story_window_path_v2",
    );
    assert.equal(
      Number.isFinite(
        story.story_window_context.volatility_expansion_sequence_score,
      ),
      true,
    );
    assert.equal(
      Number.isFinite(
        story.story_window_context.inside_range_impulse_sequence_score,
      ),
      true,
    );
    assert.ok(Array.isArray(story.story_label_decision_reasons));
    assert.ok(story.story_label_decision_reasons.length > 0);
    assert.equal(typeof story.story_context_label, "string");
    assert.notEqual(story.story_context_label, "Two-sided sequence");
    assert.notEqual(story.story_context_label, "Multi-swing context");
    assert.equal("story_context_labels" in story, false);
    assert.equal("story_context_secondary_labels" in story, false);
    assert.ok(story.minimum_story_range?.eligible);
    if (story.direction === "two_sided") {
      assert.equal(story.two_sided_swing?.eligible, true);
    }
    assert.ok(Array.isArray(story.adaptive_gap_links));
    assert.equal(typeof story.adaptive_gap_summary, "string");
    assert.equal(typeof story.max_event_gap_minutes, "number");
    for (const link of story.adaptive_gap_links) {
      assert.ok(link.previous_event_id);
      assert.ok(link.next_event_id);
      assert.equal(typeof link.gap_minutes, "number");
      assert.equal(typeof link.allowed_gap_minutes, "number");
      assert.equal(link.bridge_allowed, true);
      assert.ok(link.gap_minutes <= link.allowed_gap_minutes);
      assert.ok(Array.isArray(link.bridge_reasons));
      assert.ok(link.bridge_reasons.length > 0);
    }
    assert.ok(story.story_source_label);
    assert.ok(story.total_event_count >= 2);
    assert.equal(
      story.total_event_count,
      story.included_signal_event_ids.length +
        story.included_audit_event_ids.length,
    );
    if (story.story_source_type === "audit_only_sequence") {
      assert.equal(story.included_signal_event_ids.length, 0);
      assert.ok(story.included_audit_event_ids.length >= 2);
    } else {
      assert.ok(story.included_signal_event_ids.length > 0);
    }
    assert.equal(story.audit_event_count, story.included_audit_event_ids.length);
    assert.deepEqual(
      story.chart.included_audit_event_ids,
      story.included_audit_event_ids,
    );
    assert.ok(Array.isArray(story.expanded.story_details.included_audit_events));
  }

  assert.ok(
    stories.some(
      (story) =>
        story.direction === "two_sided" &&
        story.story_context_label !== "Two-sided sequence",
    ),
    "two-sided direction should not automatically override the story-window label",
  );
  assert.ok(
    stories.every(
      (story) =>
        !["Two-sided sequence", "Multi-swing context"].includes(
          story.story_context_label,
        ),
    ),
    "Market Story headlines should use one specific chart-pattern label or the mixed fallback",
  );

  assert.ok(
    stories.some(
      (story) =>
        story.story_context_label === "Reversal sequence" &&
        story.primary_story_family === "relief_reversal" &&
        story.two_sided_swing?.eligible === true,
    ),
    "Market Stories should still classify full-window reversal sequences after Signal Event caps split compact evidence windows",
  );

  for (const story of storiesPayload.items) {
    assert.equal("story_context_labels" in story, false);
    assert.equal("story_context_secondary_labels" in story, false);
  }
});

test("global day controls replace latest-only mode", async () => {
  const preview = await readJson(
    "experiments/v0.2/outputs/grouped_feed_preview.json",
  );

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
  const contract = await readJson(
    "experiments/v0.2/outputs/feed_contract_v02.json",
  );

  for (const group of contract.day_groups) {
    assert.ok(group.day_post_id);
    assert.ok(group.default_collapsed_item_id);
    assert.equal(
      group.items.some((item) => item.id === group.default_collapsed_item_id),
      true,
    );
    assert.equal(group.hidden_item_count_when_collapsed, group.item_count - 1);
    assert.equal(group.has_extra_items, group.item_count > 1);
    assert.deepEqual(group.visible_item_ids_when_collapsed, [
      group.default_collapsed_item_id,
    ]);
    assert.equal(group.visible_item_ids_when_expanded.length, group.item_count);

    if (group.item_count > 1) {
      const expandLabel = `+${group.hidden_item_count_when_collapsed} events · Expand post`;
      const collapseLabel = "Collapse post";
      assert.equal(group.day_post_control.expand_label, expandLabel);
      assert.equal(group.day_post_control.collapse_label, collapseLabel);
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
  const preview = await readJson(
    "experiments/v0.2/outputs/grouped_feed_preview.json",
  );

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
  const contract = await readJson(
    "experiments/v0.2/outputs/feed_contract_v02.json",
  );

  for (const item of contractItems(contract)) {
    assert.equal(item.expanded.section_control.collapsed_label, "Show more");
    assert.equal(item.expanded.section_control.expanded_label, "Hide");
  }
});

test("public labels use Avg Change, 24h Change, and Window Change", async () => {
  const contract = await readJson(
    "experiments/v0.2/outputs/feed_contract_v02.json",
  );
  const items = contractItems(contract);
  const signals = items.filter((item) => item.item_type === "signal_event");
  const overviews = items.filter((item) => item.item_type === "daily_overview");

  assert.ok(signals.length > 0);
  assert.ok(overviews.length > 0);
  assert.ok(signals.every((item) => item.avg_change_label === "Avg Change"));
  assert.ok(overviews.every((item) => item.change_label === "24h Change"));
  assert.ok(
    overviews.every((item) => item.daily_change_label === "24h Change"),
  );
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

test("public signal cards expose multi-candle evidence windows", async () => {
  const contract = await readJson(
    "experiments/v0.2/outputs/feed_contract_v02.json",
  );
  const preview = await readJson(
    "experiments/v0.2/outputs/grouped_feed_preview.json",
  );
  const signals = contractItems(contract).filter(
    (item) => item.item_type === "signal_event",
  );
  const signalSections = previewSections(preview).filter(
    (section) => section.item_type === "signal_event",
  );

  assert.ok(signals.length > 0);
  assert.ok(
    signals.every(
      (item) =>
        item.evidence_window_label === "Evidence window" &&
        item.evidence_window_display.includes("candles") &&
        item.evidence_window.display.includes("candles") &&
        item.evidence_bar_count >= 2 &&
        item.evidence_window.evidence_bar_count >= 2,
    ),
  );
  assert.ok(
    signalSections.every(
      (section) =>
        section.collapsed_preview.evidence_window.includes("Evidence window") &&
        section.collapsed_preview.evidence_window.includes("candles"),
    ),
  );
});

test("feed contract exposes vNext-C chart-context fields", async () => {
  const contract = await readJson(
    "experiments/v0.2/outputs/feed_contract_v02.json",
  );
  const signals = contractItems(contract).filter(
    (item) => item.item_type === "signal_event",
  );

  assert.equal(contract.detector_version, "vnext_c");
  assert.equal(contract.chart_context_enabled, true);
  assert.ok(signals.length > 0);

  for (const signal of signals) {
    assert.equal(typeof signal.chart_context_label, "string");
    assert.equal(Number.isFinite(signal.chart_context_score), true);
    assert.equal(typeof signal.event_story_type, "string");
    assert.ok(signal.trend_context);
    assert.ok(signal.momentum_context);
    assert.equal(typeof signal.volatility_context, "string");
    assert.equal(typeof signal.event_range_context, "string");
    assert.ok(Array.isArray(signal.chart_context_reasons));
    assert.ok(Array.isArray(signal.chart_context_warnings));
    assert.ok(signal.expanded.chart_context_details);
    assert.ok(
      ["compressed", "normal", "expanding", "compressed_to_expanding"].includes(
        signal.volatility_state,
      ),
    );
    assert.equal(typeof signal.history_support_type, "string");
    assert.ok(signal.source_likelihood >= 0 && signal.source_likelihood <= 1);
    assert.ok(
      ["low", "medium", "high"].includes(signal.source_likelihood_band),
    );
    assert.ok(signal.publish_gate);
    assert.equal(signal.publish_gate.decision, "public");
    assert.equal(signal.avg_change_method, "median");
    assert.ok(signal.evidence_window_stats);
    assert.equal(
      Number.isFinite(signal.evidence_window_stats.window_change_median),
      true,
    );
  }
});

test("range position and table highlight metadata are present", async () => {
  const contract = await readJson(
    "experiments/v0.2/outputs/feed_contract_v02.json",
  );
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
  const preview = await readJson(
    "experiments/v0.2/outputs/grouped_feed_preview.json",
  );
  const glossary = preview.glossary;

  assert.match(glossary.avg_change, /median or average change/i);
  assert.match(glossary.window_change, /one symbol/i);
  assert.match(glossary.peak_15m, /15-minute change/i);
  assert.match(glossary.lead_mover_highlight, /highlighted symbol or row/i);
  assert.match(glossary.peak_15m_highlight, /highlighted Peak 15m cell/i);
  assert.match(glossary.range_position, /descriptive, not a trading signal/i);
  assert.match(glossary.evidence_window, /not a single timestamp/i);
  assert.match(glossary.market_story, /audit-only detections/i);
});

test("public labels avoid trading-style range wording", async () => {
  const contract = await readJson(
    "experiments/v0.2/outputs/feed_contract_v02.json",
  );
  const preview = await readJson(
    "experiments/v0.2/outputs/grouped_feed_preview.json",
  );
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
  const contract = await readJson(
    "experiments/v0.2/outputs/feed_contract_v02.json",
  );
  const items = contractItems(contract);
  const signal = items.find((item) => item.item_type === "signal_event");
  const overview = items.find((item) => item.item_type === "daily_overview");
  const story = items.find((item) => item.item_type === "market_story");

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

  assert.equal(story.chart.chart_highlight_type, "story_window");
  assert.ok(story.chart.highlight_start);
  assert.ok(story.chart.highlight_end);
  assert.equal(story.chart.selection_toggle, "select_again_to_clear");
  assert.ok(Array.isArray(story.chart.included_signal_event_ids));
  assert.ok(Array.isArray(story.chart.included_audit_event_ids));
});

test("audit file count matches vNext-C non-public events", async () => {
  const audit = await readJson(
    "experiments/v0.2/outputs/non_public_audit_events.json",
  );
  const eventsPayload = await readJson(
    "experiments/v0.2/outputs/vnext_c_events.json",
  );
  const expectedAuditCount = eventsPayload.events.filter(
    (event) => !event.publish_candidate,
  ).length;

  assert.equal(audit.count, expectedAuditCount);
  assert.equal(audit.items.length, expectedAuditCount);
  assert.ok(audit.items.every((item) => item.suppress_reason));
  assert.ok(audit.items.every((item) => item.chart_context_label));
});
