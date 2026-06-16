import assert from "node:assert/strict";
import test from "node:test";

import {
  marketDataStatus,
  percentChange,
  retentionCutoffIso,
} from "./marketRepository.ts";

test("percentChange returns rounded percentages", () => {
  assert.equal(percentChange(110, 100), 10);
  assert.equal(percentChange(90, 100), -10);
  assert.equal(percentChange(101, 99), 2.0202);
});

test("percentChange returns null for unavailable or zero baselines", () => {
  assert.equal(percentChange(100, null), null);
  assert.equal(percentChange(100, 0), null);
});

test("marketDataStatus distinguishes fresh, delayed, and missing data", () => {
  const now = new Date("2026-06-16T12:00:00.000Z");

  assert.equal(marketDataStatus("2026-06-16T11:30:00.000Z", now), "fresh");
  assert.equal(marketDataStatus("2026-06-16T10:00:00.000Z", now), "delayed");
  assert.equal(marketDataStatus(null, now), "missing");
});

test("retentionCutoffIso uses the 31-day internal retention window", () => {
  const now = new Date("2026-06-16T00:00:00.000Z");

  assert.equal(retentionCutoffIso(now), "2026-05-16T00:00:00.000Z");
});
