import assert from "node:assert/strict";
import test from "node:test";

import {
  evidenceWindowLabel,
  evidenceWindowParts,
  peakSignalLabel,
} from "./eventTiming.ts";

test("one-candle event uses date and time without year", () => {
  const label = evidenceWindowLabel({
    event_start_time: "2026-06-14T21:15:00.000Z",
    event_end_time: "2026-06-14T21:29:59.999Z",
  });

  assert.equal(label, "Jun 14, 21:29 UTC");
  assert.deepEqual(
    evidenceWindowParts({
      event_start_time: "2026-06-14T21:15:00.000Z",
      event_end_time: "2026-06-14T21:29:59.999Z",
    }),
    { date: "Jun 14", time: "21:29 UTC" },
  );
});

test("grouped event uses start-to-end evidence window wording", () => {
  const label = evidenceWindowLabel({
    event_start_time: "2026-06-14T21:15:00.000Z",
    event_end_time: "2026-06-14T23:44:59.999Z",
  });

  assert.equal(label, "Jun 14, 21:15-23:44 UTC");
});

test("peak time wording is separate from evidence window wording", () => {
  assert.equal(
    peakSignalLabel({ peak_time: "2026-06-14T22:15:00.000Z" }),
    "Peak time: 22:15 UTC",
  );
});

test("event timing labels do not use latest detected wording", () => {
  const serialized = [
    evidenceWindowLabel({
      event_start_time: "2026-06-14T21:15:00.000Z",
      event_end_time: "2026-06-14T21:29:59.999Z",
    }),
    peakSignalLabel({ peak_time: "2026-06-14T22:15:00.000Z" }),
  ]
    .join(" ")
    .toLowerCase();

  assert.equal(serialized.includes("latest detected"), false);
});
