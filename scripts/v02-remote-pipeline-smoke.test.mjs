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

test("v0.2 remote pipeline smoke captures non-JSON responses with a safe excerpt", async () => {
  const options = parseRemotePipelineSmokeArgs(
    [
      "--live",
      "--confirm-remote-v02-pipeline",
      "--admin-token",
      "secret-admin-token",
      "--date-from",
      "2026-06-12",
      "--date-to",
      "2026-06-12",
      "--steps",
      "detector",
    ],
    {},
  );
  const report = await runRemotePipelineSmoke(options, {
    fetchImpl: async () =>
      new Response("temporary failure secret-admin-token sk-ant-test", {
        status: 503,
        headers: { "content-type": "text/plain" },
      }),
    logger: { log() {} },
  });
  const failure = report.failures[0];
  const serialized = JSON.stringify(report);

  assert.equal(report.ok, false);
  assert.equal(failure.classification, "non_json_response");
  assert.equal(failure.http_status, 503);
  assert.equal(failure.content_type, "text/plain");
  assert.equal(failure.body_excerpt.includes("[redacted]"), true);
  assert.equal(serialized.includes("secret-admin-token"), false);
  assert.equal(serialized.includes("sk-ant-test"), false);
});

test("v0.2 remote pipeline smoke classifies Cloudflare HTML errors", async () => {
  const options = parseRemotePipelineSmokeArgs(
    [
      "--live",
      "--confirm-remote-v02-pipeline",
      "--admin-token",
      "secret-admin-token",
      "--date-from",
      "2026-06-12",
      "--date-to",
      "2026-06-12",
      "--steps",
      "detector",
    ],
    {},
  );
  const report = await runRemotePipelineSmoke(options, {
    fetchImpl: async () =>
      new Response(
        "<!DOCTYPE html><title>Cloudflare</title><h1>Error 1102</h1><p>Ray ID: abc123</p>",
        {
          status: 503,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      ),
    logger: { log() {} },
  });
  const failure = report.failures[0];

  assert.equal(report.ok, false);
  assert.equal(failure.classification, "cloudflare_html_error");
  assert.equal(failure.cloudflare_error_code, "1102");
  assert.equal(failure.ray_id, "abc123");
  assert.match(failure.body_excerpt, /Error 1102/);
});

test("v0.2 remote pipeline smoke retries a failed chunk once when requested", async () => {
  const options = parseRemotePipelineSmokeArgs(
    [
      "--live",
      "--confirm-remote-v02-pipeline",
      "--admin-token",
      "secret-admin-token",
      "--date-from",
      "2026-06-12",
      "--date-to",
      "2026-06-12",
      "--steps",
      "detector",
      "--retry-failed-once",
    ],
    {},
  );
  let attempts = 0;
  const report = await runRemotePipelineSmoke(options, {
    fetchImpl: async () => {
      attempts += 1;
      return attempts === 1
        ? new Response(JSON.stringify({ ok: false }), {
            status: 503,
            headers: { "content-type": "application/json" },
          })
        : new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
    },
    logger: { log() {} },
  });

  assert.equal(report.ok, true);
  assert.equal(attempts, 2);
  assert.equal(report.completed_calls.length, 1);
  assert.equal(report.completed_calls[0].attempts, 2);
});

test("v0.2 remote pipeline smoke resume-from starts at requested date", async () => {
  const options = parseRemotePipelineSmokeArgs(
    [
      "--dry-run",
      "--date-from",
      "2026-06-10",
      "--date-to",
      "2026-06-12",
      "--steps",
      "detector",
      "--resume-from",
      "2026-06-12",
    ],
    {},
  );
  const report = await runRemotePipelineSmoke(options, {
    fetchImpl: async () => {
      throw new Error("fetch should not be called in dry-run");
    },
    logger: { log() {} },
  });

  assert.deepEqual(
    report.planned_calls.map((call) => call.date_from),
    ["2026-06-12"],
  );
});

test("v0.2 remote pipeline smoke failed-date diagnostic shows half-day fallback plan without network", async () => {
  const options = parseRemotePipelineSmokeArgs(
    [
      "--dry-run",
      "--diagnose-date",
      "2026-06-12",
      "--steps",
      "detector",
      "--fallback-hours",
      "12",
    ],
    {},
  );
  const report = await runRemotePipelineSmoke(options, {
    fetchImpl: async () => {
      throw new Error("fetch should not be called in date diagnostic dry-run");
    },
    logger: { log() {} },
  });

  assert.equal(report.diagnose_date, "2026-06-12");
  assert.equal(report.fallback_preview.length, 2);
  assert.equal(
    report.fallback_preview[0].time_from,
    "2026-06-12T00:00:00.000Z",
  );
  assert.equal(
    report.fallback_preview[1].time_from,
    "2026-06-12T12:00:00.000Z",
  );
});

test("v0.2 remote pipeline smoke adaptively splits failed detector windows", async () => {
  const options = parseRemotePipelineSmokeArgs(
    [
      "--live",
      "--confirm-remote-v02-pipeline",
      "--admin-token",
      "secret-admin-token",
      "--date-from",
      "2026-06-09",
      "--date-to",
      "2026-06-09",
      "--steps",
      "detector",
      "--retry-failed-once",
      "--fallback-hours",
      "6,3,1",
    ],
    {},
  );
  const requestedBodies = [];
  const report = await runRemotePipelineSmoke(options, {
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      requestedBodies.push(body);
      const timeFrom = body.time_from ?? "";
      const timeTo = body.time_to ?? "";
      const shouldFail =
        !timeFrom ||
        (timeFrom === "2026-06-09T12:00:00.000Z" &&
          timeTo === "2026-06-09T17:59:59.999Z");

      return new Response(JSON.stringify({ ok: !shouldFail, body }), {
        status: shouldFail ? 503 : 200,
        headers: { "content-type": "application/json" },
      });
    },
    logger: { log() {} },
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.fallback_hours_sequence, [6, 3, 1]);
  assert.equal(report.fallback_attempts.length, 2);
  assert.equal(report.fallback_attempts[0].fallback_hours, 6);
  assert.equal(report.fallback_attempts[1].fallback_hours, 3);
  assert.equal(
    report.completed_calls.some(
      (call) =>
        call.time_from === "2026-06-09T12:00:00.000Z" &&
        call.time_to === "2026-06-09T14:59:59.999Z",
    ),
    true,
  );
  assert.equal(
    report.completed_calls.some(
      (call) =>
        call.time_from === "2026-06-09T15:00:00.000Z" &&
        call.time_to === "2026-06-09T17:59:59.999Z",
    ),
    true,
  );
  assert.equal(
    requestedBodies.some((body) => body.dry_run === false),
    true,
  );
});

test("v0.2 remote pipeline smoke reports unresolved fallback without looping", async () => {
  const options = parseRemotePipelineSmokeArgs(
    [
      "--live",
      "--confirm-remote-v02-pipeline",
      "--admin-token",
      "secret-admin-token",
      "--date-from",
      "2026-06-09",
      "--date-to",
      "2026-06-09",
      "--steps",
      "detector",
      "--fallback-hours",
      "24",
    ],
    {},
  );
  const report = await runRemotePipelineSmoke(options, {
    fetchImpl: async () =>
      new Response(JSON.stringify({ ok: false }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    logger: { log() {} },
  });

  assert.equal(report.ok, false);
  assert.equal(report.fallback_attempts.length, 0);
  assert.equal(report.failures.length, 1);
  assert.equal(report.failures[0].date_from, "2026-06-09");
});

test("v0.2 remote pipeline chunk helper supports capped multi-day chunks", () => {
  assert.deepEqual(buildDateChunks("2026-06-20", "2026-06-24", 2), [
    { date_from: "2026-06-20", date_to: "2026-06-21" },
    { date_from: "2026-06-22", date_to: "2026-06-23" },
    { date_from: "2026-06-24", date_to: "2026-06-24" },
  ]);
});
