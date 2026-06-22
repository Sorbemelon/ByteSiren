import assert from "node:assert/strict";
import test from "node:test";

import {
  buildResetSql,
  parseResetArgs,
  runLocalReset,
} from "./v02-local-reset.mjs";

test("v0.2 local reset refuses to run without explicit confirmation", () => {
  assert.throws(() => parseResetArgs([]), /--confirm-local-reset/);
});

test("v0.2 local reset refuses remote usage", () => {
  assert.throws(
    () => parseResetArgs(["--confirm-local-reset", "--remote"]),
    /never accepts --remote/,
  );
});

test("v0.2 local reset clears only v0.2 tables by default", () => {
  const options = parseResetArgs(["--confirm-local-reset"]);
  const sql = buildResetSql(options);

  assert.match(sql, /DELETE FROM signal_events_v02;/);
  assert.match(sql, /DELETE FROM audit_events_v02;/);
  assert.doesNotMatch(sql, /DELETE FROM incidents;/);
  assert.doesNotMatch(sql, /DELETE FROM source_references;/);
  assert.doesNotMatch(sql, /DELETE FROM market_candles;/);
  assert.doesNotMatch(sql, /--remote/);
});

test("v0.2 local reset includes optional local-only tables explicitly", () => {
  const options = parseResetArgs([
    "--confirm-local-reset",
    "--include-market-candles",
    "--include-job-runs",
  ]);
  const sql = buildResetSql(options);

  assert.match(sql, /DELETE FROM market_candles;/);
  assert.match(sql, /DELETE FROM job_runs;/);
});

test("v0.2 local reset dry-run does not invoke wrangler", async () => {
  const options = parseResetArgs(["--confirm-local-reset", "--dry-run"]);
  const result = await runLocalReset(options, {
    runner: async () => {
      throw new Error("runner should not be called");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
});
