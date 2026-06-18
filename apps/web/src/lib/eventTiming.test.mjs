import assert from "node:assert/strict";
import test from "node:test";

import { evidenceWindowLabel, peakSignalLabel } from "./eventTiming.ts";

test("one-candle event uses 15m candle ending wording", () => {
  const label = evidenceWindowLabel({
    event_start_time: "2026-06-14T21:15:00.000Z",
    event_end_time: "2026-06-14T21:29:59.999Z",
  });

  assert.equal(
    label,
    "Evidence window: 15m candle ending Jun 14, 2026, 21:29 UTC",
  );
});

test("grouped event uses start-to-end evidence window wording", () => {
  const label = evidenceWindowLabel({
    event_start_time: "2026-06-14T21:15:00.000Z",
    event_end_time: "2026-06-14T23:44:59.999Z",
  });

  assert.equal(label, "Evidence window: Jun 14, 2026, 21:15-23:44 UTC");
});

test("peak signal wording is separate from evidence window wording", () => {
  assert.equal(
    peakSignalLabel({ peak_time: "2026-06-14T22:15:00.000Z" }),
    "Peak signal: Jun 14, 2026, 22:15 UTC",
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
