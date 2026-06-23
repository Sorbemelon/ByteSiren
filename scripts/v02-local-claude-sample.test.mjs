import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseClaudeSampleArgs,
  runClaudeSample,
} from "./v02-local-claude-sample.mjs";

test("v0.2 Claude sample defaults to dry-run", () => {
  const options = parseClaudeSampleArgs(["--admin-token", "admin-token"], {});

  assert.equal(options.workerUrl, "http://127.0.0.1:8787");
  assert.equal(options.mode, "signal");
  assert.equal(options.limit, 2);
  assert.equal(options.dryRun, true);
  assert.equal(options.live, false);
});

test("v0.2 Claude sample requires explicit --live for live calls", () => {
  const options = parseClaudeSampleArgs(
    [
      "--admin-token",
      "admin-token",
      "--mode",
      "daily",
      "--limit",
      "1",
      "--live",
    ],
    {},
  );

  assert.equal(options.mode, "daily");
  assert.equal(options.limit, 1);
  assert.equal(options.dryRun, false);
  assert.equal(options.live, true);
});

test("v0.2 Claude sample refuses missing admin token", () => {
  assert.throws(
    () => parseClaudeSampleArgs([], {}),
    /--admin-token is required/,
  );
});

test("v0.2 Claude sample caps limit and parses IDs", () => {
  const options = parseClaudeSampleArgs(
    [
      "--admin-token",
      "admin-token",
      "--mode",
      "both",
      "--limit",
      "99",
      "--ids",
      "sig_a,daily_b,sig_a",
    ],
    {},
  );

  assert.equal(options.limit, 5);
  assert.deepEqual(options.ids, ["sig_a", "daily_b"]);
});

test("v0.2 Claude sample dry-run writes report and checks v02 feed", async () => {
  const reportDir = await mkdtemp(
    path.join(os.tmpdir(), "bytesiren-claude-sample-"),
  );
  const calls = [];
  const options = parseClaudeSampleArgs(
    [
      "--admin-token",
      "admin-token",
      "--mode",
      "signal",
      "--limit",
      "2",
      "--expect-v02-feed",
      "--report-dir",
      reportDir,
    ],
    {},
  );
  const fetchImpl = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ path: url.pathname, body: init?.body ?? null });

    if (url.pathname === "/api/admin/v02/run-claude-sample") {
      return new Response(
        JSON.stringify({
          ok: true,
          dry_run: true,
          mode: "signal",
          limit: 2,
          selected: [
            {
              target_type: "signal_event_v02",
              target_id: "sig_sample",
              date_utc: "2026-06-19",
              summary: "safe",
            },
          ],
          processed: 0,
          counts_before: {
            claude_briefs_v02: 0,
            source_references_v02: 0,
            accepted_source_references_v02: 0,
            rejected_source_references_v02: 0,
          },
          counts_after: {
            claude_briefs_v02: 0,
            source_references_v02: 0,
            accepted_source_references_v02: 0,
            rejected_source_references_v02: 0,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.pathname === "/api/intelligence/feed") {
      return new Response(
        JSON.stringify({
          ok: true,
          version: "v02",
          day_groups: [
            {
              items: [
                {
                  item_type: "signal_event",
                  id: "sig_sample",
                  brief: { status: "queued_for_analysis" },
                  sources: [],
                },
                {
                  item_type: "market_story",
                  id: "story_sample",
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    throw new Error(`unexpected path ${url.pathname}`);
  };

  try {
    const report = await runClaudeSample(options, {
      fetchImpl,
      logger: { log() {} },
    });

    assert.equal(report.ok, true);
    assert.equal(report.selected.length, 1);
    assert.equal(report.feed_summary.version, "v02");
    assert.equal(report.auditExclusionCheck.publicAuditEventCount, 0);
    assert.equal(
      report.marketStoryBoundaryCheck.forbiddenClaudeSourceFieldCount,
      0,
    );
    assert.deepEqual(
      calls.map((call) => call.path),
      ["/api/admin/v02/run-claude-sample", "/api/intelligence/feed"],
    );
    assert.equal(String(calls[0].body).includes("admin-token"), false);
  } finally {
    await rm(reportDir, { recursive: true, force: true });
  }
});

test("v0.2 Claude sample rejects non-v02 feed when expected", async () => {
  const reportDir = await mkdtemp(
    path.join(os.tmpdir(), "bytesiren-claude-sample-"),
  );
  const options = parseClaudeSampleArgs(
    [
      "--admin-token",
      "admin-token",
      "--expect-v02-feed",
      "--report-dir",
      reportDir,
    ],
    {},
  );
  const fetchImpl = async (input) => {
    const url = new URL(String(input));

    if (url.pathname === "/api/admin/v02/run-claude-sample") {
      return new Response(
        JSON.stringify({
          ok: true,
          dry_run: true,
          mode: "signal",
          limit: 2,
          selected: [],
          processed: 0,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true, version: "v01" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await assert.rejects(
      () => runClaudeSample(options, { fetchImpl, logger: { log() {} } }),
      /Expected feed version v02/,
    );
  } finally {
    await rm(reportDir, { recursive: true, force: true });
  }
});
