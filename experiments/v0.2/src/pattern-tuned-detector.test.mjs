import assert from "node:assert/strict";
import test from "node:test";

import {
  CANDLES_SNAPSHOT_PATH,
  loadCandleSnapshot,
  readJson,
} from "./shared.mjs";
import {
  VNEXT_C_PATTERN_TUNED_OPTIONS,
  detectVNextCEvents,
  summarizeVNextC,
} from "./detector-vnext-c/index.mjs";

const MACRO_CALENDAR_PATH =
  "experiments/v0.2/data/macro_calendar_2026_window.json";

async function loadInputs() {
  const snapshot = await loadCandleSnapshot(CANDLES_SNAPSHOT_PATH);
  let macroCalendar = [];
  try {
    macroCalendar = (await readJson(MACRO_CALENDAR_PATH)).items ?? [];
  } catch {
    macroCalendar = [];
  }
  return { candlesBySymbol: snapshot.candles_by_symbol, macroCalendar };
}

function byStart(events, prefix) {
  return events.find((event) => event.window_start.startsWith(prefix));
}

test("A1: every event carries a cumulative max_aligned_excursion_pct", async () => {
  const inputs = await loadInputs();
  const { events } = detectVNextCEvents(inputs);
  assert.ok(events.length > 0);
  for (const event of events) {
    assert.equal(
      Number.isFinite(event.evidence_window_stats.max_aligned_excursion_pct),
      true,
    );
  }
});

test("base vnext_c gate is unchanged by the (default-off) continuation path", async () => {
  const inputs = await loadInputs();
  const { events } = detectVNextCEvents(inputs);
  const summary = summarizeVNextC(events);
  assert.equal(summary.publish_candidate_count, 23);
  assert.equal(summary.suppressed_count, 18);
  assert.equal(summary.publish_gate_version, "vnext_c_r5_history_gate");
  // No event should use the variant-only reason when the path is off.
  assert.equal(
    events.some(
      (event) =>
        event.publish_reason === "multibar_strong_context_continuation",
    ),
    false,
  );
});

test("pattern_tuned promotes only the two validated broad-reaction events", async () => {
  const inputs = await loadInputs();
  const { events } = detectVNextCEvents({
    ...inputs,
    options: VNEXT_C_PATTERN_TUNED_OPTIONS,
  });
  const summary = summarizeVNextC(events, VNEXT_C_PATTERN_TUNED_OPTIONS);
  assert.equal(summary.publish_candidate_count, 25);
  // 16 base audit + 8 retained broad-shock one-bar events.
  assert.equal(summary.suppressed_count, 24);
  assert.equal(summary.publish_gate_version, "vnext_c_pattern_tuned_r1");

  const promoted = events.filter(
    (event) =>
      event.publish_reason === "multibar_strong_context_continuation",
  );
  assert.equal(promoted.length, 2);
  for (const event of promoted) {
    assert.ok(event.diagnostics.evidence_bar_count >= 2);
    assert.ok(event.chart_context_score >= 85);
    assert.ok(event.direction_consistency_score >= 0.8);
    assert.ok(event.evidence_window_stats.max_aligned_excursion_pct >= 0.6);
  }

  const jun02 = byStart(events, "2026-06-02T02:15");
  const jun10 = byStart(events, "2026-06-10T00:30");
  assert.equal(jun02.publish_candidate, true);
  assert.equal(jun10.publish_candidate, true);

  // Narrow-breadth, narrow-source event must stay audit (source-free judgement).
  const jun01 = byStart(events, "2026-06-01T15:15");
  assert.equal(jun01.publish_candidate, false);
  assert.equal(jun01.suppress_reason, "no_strong_context_path");
  assert.ok(jun01.direction_consistency_score < 0.8);
});

test("broad-shock detection adds strong one-bar shocks in the variant only", async () => {
  const inputs = await loadInputs();
  const base = detectVNextCEvents(inputs);
  const variant = detectVNextCEvents({
    ...inputs,
    options: VNEXT_C_PATTERN_TUNED_OPTIONS,
  });

  // Base detector untouched by the (default-off) detection refinement.
  assert.equal(base.events.length, 41);
  assert.equal(base.events.filter((e) => e.broad_shock_event).length, 0);

  // Variant adds the 8 retained broad-shock one-bar events.
  assert.equal(variant.events.length, 49);
  const shocks = variant.events.filter((e) => e.broad_shock_event);
  assert.equal(shocks.length, 8);
  assert.equal(variant.source_detector_result.broad_shock_event_count, 8);

  for (const shock of shocks) {
    // Each retained shock matches the source-validated signature and stays audit.
    assert.equal(shock.diagnostics.evidence_bar_count, 1);
    assert.ok(shock.breadth_count >= 5);
    assert.ok(Math.abs(shock.window_move_pct) >= 0.8);
    assert.equal(shock.publish_candidate, false);
    assert.equal(shock.suppress_reason, "one_bar_unconfirmed_window");
  }
});
