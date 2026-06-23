import assert from "node:assert/strict";
import test from "node:test";

import {
  latestCompleteDayFromCoverage,
  parseRefreshArgs,
  targetRangeFromEnd,
} from "./v02-snapshot-refresh.mjs";

test("v0.2 snapshot refresh defaults to dry-run and requires explicit live confirmation separately", () => {
  const options = parseRefreshArgs([]);

  assert.equal(options.dryRun, true);
  assert.equal(options.live, false);
  assert.equal(options.latestCompleteDay, true);
  assert.equal(options.windowDays, 31);
});

test("v0.2 snapshot refresh parses manual live mode and confirmation", () => {
  const options = parseRefreshArgs([
    "--manual-refresh",
    "--live",
    "--confirm-remote-v02-refresh",
    "--range-start",
    "2026-05-24",
    "--range-end",
    "2026-06-22",
    "--rollback-on-fail",
  ]);

  assert.equal(options.dryRun, false);
  assert.equal(options.live, true);
  assert.equal(options.confirm, true);
  assert.equal(options.rollbackOnFail, true);
  assert.equal(options.rangeStart, "2026-05-24");
  assert.equal(options.rangeEnd, "2026-06-22");
});

test("v0.2 snapshot refresh derives latest complete UTC day conservatively", () => {
  assert.equal(
    latestCompleteDayFromCoverage([
      { symbol: "BTCUSDT", latest_close_time: "2026-06-23T23:59:59.999Z" },
      { symbol: "ETHUSDT", latest_close_time: "2026-06-23T23:59:59.999Z" },
    ]),
    "2026-06-23",
  );
  assert.equal(
    latestCompleteDayFromCoverage([
      { symbol: "BTCUSDT", latest_close_time: "2026-06-23T22:59:59.999Z" },
      { symbol: "ETHUSDT", latest_close_time: "2026-06-23T23:59:59.999Z" },
    ]),
    "2026-06-22",
  );
});

test("v0.2 snapshot refresh uses an inclusive 31-day default window", () => {
  assert.deepEqual(targetRangeFromEnd("2026-06-23", 31), {
    date_from: "2026-05-24",
    date_to: "2026-06-23",
  });
});
