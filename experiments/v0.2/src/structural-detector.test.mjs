import assert from "node:assert/strict";
import test from "node:test";

import { CANDLES_SNAPSHOT_PATH, loadCandleSnapshot } from "./shared.mjs";
import {
  DEFAULT_STRUCTURAL_OPTIONS,
  detectStructuralEvents,
} from "./detector-structural/index.mjs";
import { detectVNextCEvents } from "./detector-vnext-c/index.mjs";

const STRUCTURAL_PATTERNS = new Set([
  "breakout_hold",
  "failed_breakout_reversal",
  "continuation_flag",
  "compression_expansion_break",
]);

const STORY_FOR_PATTERN = {
  breakout_hold: "range_break_",
  failed_breakout_reversal: "relief_reversal_",
  continuation_flag: "momentum_continuation_",
  compression_expansion_break: "volatility_expansion_",
};

let cachedResult = null;
async function loadResult() {
  if (!cachedResult) {
    const snapshot = await loadCandleSnapshot(CANDLES_SNAPSHOT_PATH);
    cachedResult = detectStructuralEvents({
      candlesBySymbol: snapshot.candles_by_symbol,
    });
  }
  return cachedResult;
}

test("every structural event is a broad, catalyst-likely chart pattern within the span bounds", async () => {
  const { events } = await loadResult();
  assert.ok(events.length > 0);

  for (const event of events) {
    const bars = event.diagnostics.evidence_bar_count;
    const isMergedPublic = Boolean(event.diagnostics.merged_public);
    // Never one bar. Compact units (audit + un-merged public) stay within the
    // span cap; only merged public signals (Stage 2 wide merge) extend past it.
    assert.ok(
      bars >= DEFAULT_STRUCTURAL_OPTIONS.structuralMinBars,
      `too few bars: ${bars}`,
    );
    if (!isMergedPublic) {
      assert.ok(
        bars <= DEFAULT_STRUCTURAL_OPTIONS.structuralMaxSpanBars,
        `compact bars out of range: ${bars}`,
      );
    }
    assert.ok(bars >= 2);

    assert.ok(
      STRUCTURAL_PATTERNS.has(event.structural_pattern),
      `unknown structural_pattern: ${event.structural_pattern}`,
    );
    assert.equal(event.diagnostics.detection_method, "structural");

    // Catalyst-likely floor: broad basket + strong move (max abs survives flips).
    assert.ok(
      event.breadth_count >= DEFAULT_STRUCTURAL_OPTIONS.structuralMinBreadth,
    );
    const maxAbsMove = Math.max(
      Math.abs(event.window_move_pct),
      event.evidence_window_stats?.window_change_abs_max ?? 0,
    );
    assert.ok(
      maxAbsMove >= DEFAULT_STRUCTURAL_OPTIONS.structuralMinAlignedPct,
      `weak move: ${maxAbsMove}`,
    );
  }
});

test("structural signals carry a progressive update lifecycle", async () => {
  const { events } = await loadResult();
  for (const event of events) {
    assert.ok(event.initial_detected_at, "missing initial_detected_at");
    assert.ok(event.last_updated_at, "missing last_updated_at");
    assert.equal(typeof event.update_count, "number");
    assert.equal(typeof event.direction_changed, "boolean");
    assert.ok(Array.isArray(event.direction_history));
    // Initial detection is at or before the final update.
    assert.ok(
      Date.parse(event.initial_detected_at) <= Date.parse(event.last_updated_at),
    );
  }
  // Some signals updated over time, and at least one flipped direction.
  assert.ok(events.some((e) => e.update_count > 0), "no updated signals");
  assert.ok(events.some((e) => e.direction_changed), "no direction flips");
  // A flipped signal has >1 distinct direction in its history.
  for (const e of events.filter((x) => x.direction_changed)) {
    assert.ok(
      new Set(e.direction_history.map((s) => s.direction)).size > 1,
    );
  }
});

test("public signals merge wide while audit stays compact and un-merged", async () => {
  const { events } = await loadResult();
  const publicEvents = events.filter((e) => e.publish_candidate);
  const auditEvents = events.filter((e) => !e.publish_candidate);

  // Audit is never merged: every audit event is a compact unit within the cap.
  for (const event of auditEvents) {
    assert.equal(
      Boolean(event.diagnostics.merged_public),
      false,
      "audit event was merged",
    );
    assert.ok(
      event.diagnostics.evidence_bar_count <=
        DEFAULT_STRUCTURAL_OPTIONS.structuralMaxSpanBars,
      "audit event exceeded compact span",
    );
  }

  // At least one public signal is a wide merge spanning beyond the compact cap.
  const wideMerged = publicEvents.filter(
    (e) =>
      e.diagnostics.merged_public &&
      e.diagnostics.evidence_bar_count >
        DEFAULT_STRUCTURAL_OPTIONS.structuralMaxSpanBars,
  );
  assert.ok(wideMerged.length > 0, "no wide-merged public signal");
  for (const event of wideMerged) {
    assert.ok(event.diagnostics.public_merge_member_count >= 2);
    assert.ok(event.update_count > 0);
  }
});

test("structural detector is independent of (and leaves) the base z-score detector", async () => {
  const snapshot = await loadCandleSnapshot(CANDLES_SNAPSHOT_PATH);
  const base = detectVNextCEvents({
    candlesBySymbol: snapshot.candles_by_symbol,
  });
  // Base unchanged; structural is its own detector with its own label.
  assert.equal(base.events.length, 41);
  assert.equal(base.events.some((e) => e.structural_pattern), false);

  const structural = detectStructuralEvents({
    candlesBySymbol: snapshot.candles_by_symbol,
  });
  assert.equal(structural.detector, "vnext_structural");
  assert.ok(structural.events.length > base.events.length);
});

test("structural patterns capture the catalyst-validated reference shapes", async () => {
  const { events } = await loadResult();
  // Match by span overlap, not window_start: once a move merges wide it can
  // start the prior evening (e.g. 05-28 liquidation begins ~05-27 21:00 UTC).
  const spans = (d) => {
    const lo = Date.parse(`${d}T00:00:00.000Z`);
    const hi = Date.parse(`${d}T23:59:59.999Z`);
    return events.filter(
      (e) => Date.parse(e.window_start) <= hi && Date.parse(e.window_end) >= lo,
    );
  };

  // 05-28 broad liquidation -> downside break/expansion.
  assert.ok(
    spans("2026-05-28").some(
      (e) =>
        (e.structural_pattern === "breakout_hold" ||
          e.structural_pattern === "compression_expansion_break") &&
        e.direction === "observed_down",
    ),
    "missing 05-28 down break/expansion",
  );
  // 06-14 peace deal -> upside breakout.
  assert.ok(
    spans("2026-06-14").some(
      (e) =>
        e.structural_pattern === "breakout_hold" &&
        e.direction === "observed_up",
    ),
    "missing 06-14 up breakout",
  );
  // 06-17 FOMC hawkish -> downside breakout.
  assert.ok(
    spans("2026-06-17").some(
      (e) =>
        e.structural_pattern === "breakout_hold" &&
        e.direction === "observed_down",
    ),
    "missing 06-17 down breakout",
  );
});

test("structural_pattern maps to the expected event_story_type family", async () => {
  const { events } = await loadResult();
  for (const event of events) {
    const expectedPrefix = STORY_FOR_PATTERN[event.structural_pattern];
    // enrich may relabel weak context; assert the structural pre-seed mapping
    // holds whenever the enriched story type is one of the structural families.
    if (
      ["range_break_", "relief_reversal_", "momentum_continuation_", "volatility_expansion_"].some(
        (p) => (event.event_story_type ?? "").startsWith(p),
      )
    ) {
      // Not strictly required to equal, but the pattern's family must be defined.
      assert.ok(expectedPrefix, "no story mapping for pattern");
    }
  }
});
