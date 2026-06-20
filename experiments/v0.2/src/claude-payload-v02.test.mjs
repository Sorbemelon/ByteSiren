import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function contractItems(contract) {
  return contract.day_groups.flatMap((group) => group.items);
}

const CAUSE_LABELS = [
  "Focused Cause",
  "Likely Cause",
  "Market Backdrop",
  "No Clear Cause",
  "Claude Limited",
];

test("Claude payload outputs cover Signal Events and Daily Overviews only", async () => {
  const signalPayloads = await readJson(
    "experiments/v0.2/outputs/claude_payload_signal_events.json",
  );
  const dailyPayloads = await readJson(
    "experiments/v0.2/outputs/claude_payload_daily_overviews.json",
  );

  assert.ok(signalPayloads.item_count > 0);
  assert.ok(dailyPayloads.item_count > 0);
  assert.equal(signalPayloads.items.length, signalPayloads.item_count);
  assert.equal(dailyPayloads.items.length, dailyPayloads.item_count);
  assert.ok(signalPayloads.items.every((item) => item.mode === "signal_event"));
  assert.ok(
    dailyPayloads.items.every((item) => item.mode === "daily_overview"),
  );
  assert.equal(
    await pathExists(
      "experiments/v0.2/outputs/claude_payload_market_stories.json",
    ),
    false,
  );
  assert.equal(
    JSON.stringify(signalPayloads.items).includes('"mode":"market_story"'),
    false,
  );
  assert.equal(
    JSON.stringify(dailyPayloads.items).includes('"mode":"market_story"'),
    false,
  );
});

test("Signal Event Claude payload includes event evidence and source rules", async () => {
  const payloads = await readJson(
    "experiments/v0.2/outputs/claude_payload_signal_events.json",
  );
  const sample = payloads.items[0];

  assert.equal(sample.mode, "signal_event");
  assert.equal(sample.avg_change_label, "Avg Change");
  assert.ok(sample.evidence_window.start);
  assert.ok(sample.evidence_window.end);
  assert.ok(sample.evidence_window.start_et);
  assert.ok(sample.evidence_window.end_et);
  assert.ok(sample.range_context?.event_range_context);
  assert.ok(Array.isArray(sample.range_context?.per_symbol_range_positions));
  assert.ok(sample.chart_context?.chart_context_label);
  assert.ok(sample.chart_context?.trend_context);
  assert.ok(sample.chart_context?.momentum_context);
  assert.ok(sample.chart_context?.volatility_context);
  assert.ok(Array.isArray(sample.chart_context?.chart_context_reasons));
  assert.ok(Array.isArray(sample.per_symbol_evidence));
  assert.ok(sample.per_symbol_evidence.length > 0);
  assert.ok(
    sample.per_symbol_evidence.every(
      (row) =>
        row.symbol &&
        "window_change_pct" in row &&
        "peak_15m_change_pct" in row &&
        "range_position" in row &&
        "is_lead_mover" in row &&
        "is_peak_15m_highlight" in row,
    ),
  );
  assert.ok(Array.isArray(sample.suggested_search_queries));
  assert.ok(sample.suggested_search_queries.length > 0);
  assert.equal(sample.no_trading_advice, true);
  assert.deepEqual(sample.allowed_public_labels, CAUSE_LABELS);
  assert.equal(
    sample.source_tag_rules.focused_cause_requires,
    "Focused catalyst source",
  );
  assert.equal(
    sample.source_tag_rules.price_check_rule,
    "Price check source confirms the observed move but does not explain cause.",
  );
});

test("Daily Overview Claude payload includes day-level context and Market Story IDs", async () => {
  const payloads = await readJson(
    "experiments/v0.2/outputs/claude_payload_daily_overviews.json",
  );
  const sample = payloads.items.find(
    (item) => item.market_story_ids_for_day?.length > 0,
  );

  assert.ok(sample, "expected at least one day with Market Story IDs");
  assert.equal(sample.mode, "daily_overview");
  assert.equal(sample.daily_change_label, "24h Change");
  assert.ok(sample.day_start);
  assert.ok(sample.day_end);
  assert.ok(Array.isArray(sample.signal_event_ids_for_day));
  assert.ok(Array.isArray(sample.market_story_ids_for_day));
  assert.equal(typeof sample.audit_event_count_for_day, "number");
  assert.ok(sample.daily_chart_context_summary);
  assert.ok(Array.isArray(sample.source_query_hints));
  assert.equal(sample.no_trading_advice, true);
});

test("Market Story feed items stay deterministic-only", async () => {
  const contract = await readJson(
    "experiments/v0.2/outputs/feed_contract_v02.json",
  );
  const preview = await readJson(
    "experiments/v0.2/outputs/grouped_feed_preview.json",
  );
  const stories = contractItems(contract).filter(
    (item) => item.item_type === "market_story",
  );
  const previewStorySections = preview.public_preview.day_posts.flatMap((post) =>
    post.sections.filter((section) => section.item_type === "market_story"),
  );

  assert.ok(stories.length > 0);
  assert.equal(previewStorySections.length, stories.length);
  for (const story of stories) {
    assert.equal("claude_payload" in story, false);
    assert.equal("public_context_status" in story, false);
    assert.equal("sources" in story, false);
    assert.ok(story.deterministic_context);
    assert.equal(story.public_story_candidate, true);
    assert.equal(story.publish_candidate, true);
    assert.ok(Array.isArray(story.expanded.story_details.included_signal_event_ids));
    assert.ok(Array.isArray(story.expanded.story_details.included_audit_event_ids));
    assert.equal("included_signal_events" in story.expanded.story_details, false);
    assert.equal("included_audit_events" in story.expanded.story_details, false);
    for (const label of CAUSE_LABELS) {
      assert.equal(story.story_context_label.includes(label), false);
    }
  }
  for (const section of previewStorySections) {
    assert.equal("public_context" in section.collapsed_preview, false);
    assert.equal("sources" in section.collapsed_preview, false);
    assert.equal("included_signal_events" in section.expanded_preview, false);
  }
});

test("Claude prompt design documents source-tag rules and Market Story exclusion", async () => {
  const design = await readFile(
    "experiments/v0.2/outputs/claude_payload_design.md",
    "utf8",
  );
  const signalPrompt = await readFile(
    "experiments/v0.2/outputs/claude_prompt_signal_event_v02.md",
    "utf8",
  );
  const dailyPrompt = await readFile(
    "experiments/v0.2/outputs/claude_prompt_daily_overview_v02.md",
    "utf8",
  );

  assert.match(design, /Market Story is deterministic-only/i);
  assert.match(design, /Does NOT use Claude/i);
  assert.match(design, /Does NOT have Claude status/i);
  assert.match(design, /Does not nest Signal Event cards/i);
  assert.match(signalPrompt, /Focused Cause requires/i);
  assert.match(signalPrompt, /Likely Cause requires/i);
  assert.match(signalPrompt, /Price check source confirms/i);
  assert.match(signalPrompt, /Do not infer a news cause from chart pattern alone/i);
  assert.match(dailyPrompt, /Do not classify the whole day as Focused Cause or Likely Cause/i);
  assert.match(dailyPrompt, /Suggested Daily Overview labels/i);
});
