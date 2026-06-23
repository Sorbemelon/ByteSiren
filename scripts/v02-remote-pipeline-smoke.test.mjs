import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import test from "node:test";

import {
  buildDateChunks,
  parseRemotePipelineSmokeArgs,
  runRemotePipelineSmoke,
} from "./v02-remote-pipeline-smoke.mjs";

test("v0.2 remote pipeline smoke dry-run creates day chunks without network", async () => {
  await rm(".tmp/v02-remote-pipeline-dry-run.json", { force: true });
  const options = parseRemotePipelineSmokeArgs(
    [
      "--dry-run",
      "--date-from",
      "2026-06-20",
      "--date-to",
      "2026-06-22",
      "--max-days-per-call",
      "1",
    ],
    {},
  );
  const report = await runRemotePipelineSmoke(options, {
    fetchImpl: async () => {
      throw new Error("fetch should not be called in dry-run");
    },
    logger: { log() {} },
  });

  assert.equal(report.ok, true);
  assert.equal(report.dry_run, true);
  assert.deepEqual(
    report.planned_calls
      .filter((call) => call.step === "detector")
      .map((call) => [call.date_from, call.date_to]),
    [
      ["2026-06-20", "2026-06-20"],
      ["2026-06-21", "2026-06-21"],
      ["2026-06-22", "2026-06-22"],
    ],
  );
});

test("v0.2 remote pipeline smoke live mode requires explicit confirmation", () => {
  assert.throws(
    () =>
      parseRemotePipelineSmokeArgs(
        ["--live", "--admin-token", "secret-token"],
        {},
      ),
    /--confirm-remote-v02-pipeline/,
  );
});

test("v0.2 remote pipeline smoke live mode refuses missing token", () => {
  assert.throws(
    () =>
      parseRemotePipelineSmokeArgs(
        ["--live", "--confirm-remote-v02-pipeline"],
        {},
      ),
    /--admin-token is required/,
  );
});

test("v0.2 remote pipeline smoke redacts token and stops on first failed chunk", async () => {
  const options = parseRemotePipelineSmokeArgs(
    [
      "--live",
      "--confirm-remote-v02-pipeline",
      "--admin-token",
      "secret-admin-token",
      "--date-from",
      "2026-06-20",
      "--date-to",
      "2026-06-21",
      "--steps",
      "detector,daily_overviews",
    ],
    {},
  );
  const requestedBodies = [];
  const report = await runRemotePipelineSmoke(options, {
    fetchImpl: async (_input, init) => {
      requestedBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ ok: false }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    },
    logger: { log() {} },
  });
  const serialized = JSON.stringify(report);

  assert.equal(report.ok, false);
  assert.equal(report.completed_calls.length, 0);
  assert.equal(report.failures.length, 1);
  assert.equal(requestedBodies.length, 1);
  assert.equal(requestedBodies[0].mode, "bounded");
  assert.equal(requestedBodies[0].dry_run, false);
  assert.equal(serialized.includes("secret-admin-token"), false);
  assert.equal(report.claude_run, false);
  assert.equal(report.feed_version_switch, false);
});

test("v0.2 remote pipeline chunk helper supports capped multi-day chunks", () => {
  assert.deepEqual(buildDateChunks("2026-06-20", "2026-06-24", 2), [
    { date_from: "2026-06-20", date_to: "2026-06-21" },
    { date_from: "2026-06-22", date_to: "2026-06-23" },
    { date_from: "2026-06-24", date_to: "2026-06-24" },
  ]);
});
