import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EMPTY_SELECTION,
  clearSelection,
  clearSelectionOnModeSwitch,
  feedCardIdForChartItem,
  highlightsForSelection,
  selectionTargetForItem,
  shouldExpandDayPostForSelection,
  toggleSelection,
} from "./chart-selection-state.mjs";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function loadFixture() {
  const [contract, audit] = await Promise.all([
    readJson("experiments/v0.2/outputs/feed_contract_v02.json"),
    readJson("experiments/v0.2/outputs/non_public_audit_events.json"),
  ]);
  const publicItems = contract.day_groups.flatMap((group) => group.items);
  const signals = publicItems.filter(
    (item) => item.item_type === "signal_event",
  );
  const overviews = publicItems.filter(
    (item) => item.item_type === "daily_overview",
  );
  const stories = publicItems.filter(
    (item) => item.item_type === "market_story",
  );

  return {
    contract,
    audit,
    publicItems,
    signals,
    overviews,
    stories,
    auditIds: new Set(audit.items.map((item) => item.id)),
  };
}

test("signal event selection toggles on same target", async () => {
  const { signals } = await loadFixture();
  const signal = signals[0];
  const target = selectionTargetForItem(signal);

  assert.deepEqual(target, {
    selected_type: "signal_event",
    selected_id: signal.id,
  });
  assert.deepEqual(toggleSelection(EMPTY_SELECTION, target), target);
  assert.deepEqual(toggleSelection(target, target), EMPTY_SELECTION);
});

test("daily overview selection toggles and uses day-window highlights", async () => {
  const { publicItems, signals, overviews } = await loadFixture();
  const overview = overviews.find(
    (item) => item.chart.included_signal_event_ids.length > 0,
  );
  const target = selectionTargetForItem(overview);
  const selected = toggleSelection(EMPTY_SELECTION, target);
  const highlights = highlightsForSelection({
    mode: "public",
    selection: selected,
    publicItems,
  });

  assert.equal(selected.selected_type, "daily_overview");
  assert.deepEqual(highlights.dayWindowIds, [overview.id]);
  assert.deepEqual(
    highlights.signalWindowIds,
    overview.chart.included_signal_event_ids,
  );
  assert.ok(
    highlights.signalWindowIds.every((id) =>
      signals.some(
        (signal) => signal.id === id && signal.date_utc === overview.date_utc,
      ),
    ),
  );
  assert.deepEqual(toggleSelection(selected, target), EMPTY_SELECTION);
});

test("daily overview highlight is hidden by default", async () => {
  const { publicItems, signals } = await loadFixture();
  const highlights = highlightsForSelection({
    mode: "public",
    selection: EMPTY_SELECTION,
    publicItems,
  });

  assert.deepEqual(highlights.dayWindowIds, []);
  assert.equal(highlights.signalWindowIds.length, signals.length);
});

test("market story selection includes signal and audit windows", async () => {
  const { publicItems, stories } = await loadFixture();
  const story = stories.find(
    (item) => item.chart.included_audit_event_ids.length > 0,
  );
  const target = selectionTargetForItem(story);
  const selected = toggleSelection(EMPTY_SELECTION, target);
  const highlights = highlightsForSelection({
    mode: "public",
    selection: selected,
    publicItems,
  });

  assert.equal(selected.selected_type, "market_story");
  assert.deepEqual(highlights.signalWindowIds, story.chart.included_signal_event_ids);
  assert.deepEqual(highlights.auditWindowIds, story.chart.included_audit_event_ids);
  assert.deepEqual(toggleSelection(selected, target), EMPTY_SELECTION);
});

test("chart event selection can reveal a signal hidden by collapsed day post", async () => {
  const { contract } = await loadFixture();
  const dayPost = contract.day_groups.find(
    (group) =>
      group.has_extra_items &&
      group.items.some((item) => item.item_type === "signal_event"),
  );
  const hiddenSignal = dayPost.items.find(
    (item) =>
      item.item_type === "signal_event" &&
      !dayPost.visible_item_ids_when_collapsed.includes(item.id),
  );

  assert.ok(hiddenSignal, "fixture must contain a collapsed-hidden signal");
  assert.equal(shouldExpandDayPostForSelection(dayPost, hiddenSignal.id), true);
  assert.equal(
    shouldExpandDayPostForSelection(dayPost, dayPost.default_collapsed_item_id),
    false,
  );
});

test("chart event maps to feed card metadata", async () => {
  const { signals, audit } = await loadFixture();

  assert.ok(feedCardIdForChartItem(signals[0]).startsWith("card_"));
  assert.ok(feedCardIdForChartItem(audit.items[0]).startsWith("audit_"));
});

test("neutral clear action and mode switch reset selection", async () => {
  const { signals } = await loadFixture();
  const target = selectionTargetForItem(signals[0]);
  const selected = toggleSelection(EMPTY_SELECTION, target);

  assert.equal(selected.selected_type, "signal_event");
  assert.deepEqual(clearSelection(selected), EMPTY_SELECTION);
  assert.deepEqual(clearSelectionOnModeSwitch(selected), EMPTY_SELECTION);
});

test("audit event selection and highlight filtering work", async () => {
  const { audit, auditIds } = await loadFixture();
  const auditItem = audit.items[0];
  const target = selectionTargetForItem(auditItem, {
    mode: "audit",
    auditIds,
  });
  const selected = toggleSelection(EMPTY_SELECTION, target);
  const highlights = highlightsForSelection({
    mode: "audit",
    selection: selected,
    auditItems: audit.items,
  });

  assert.deepEqual(target, {
    selected_type: "audit_event",
    selected_id: auditItem.id,
  });
  assert.deepEqual(highlights.auditWindowIds, [auditItem.id]);
  assert.deepEqual(toggleSelection(selected, target), EMPTY_SELECTION);
});

test("both mode shows public and audit highlights until an item is selected", async () => {
  const { publicItems, signals, audit, auditIds } = await loadFixture();
  const defaultHighlights = highlightsForSelection({
    mode: "both",
    selection: EMPTY_SELECTION,
    publicItems,
    auditItems: audit.items,
  });

  assert.equal(defaultHighlights.signalWindowIds.length, signals.length);
  assert.equal(defaultHighlights.auditWindowIds.length, audit.items.length);

  const auditItem = audit.items[0];
  const selectedAudit = toggleSelection(
    EMPTY_SELECTION,
    selectionTargetForItem(auditItem, {
      mode: "both",
      auditIds,
    }),
  );
  const selectedHighlights = highlightsForSelection({
    mode: "both",
    selection: selectedAudit,
    publicItems,
    auditItems: audit.items,
  });

  assert.deepEqual(selectedHighlights.signalWindowIds, []);
  assert.deepEqual(selectedHighlights.auditWindowIds, [auditItem.id]);
});
