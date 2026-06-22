import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import test from "node:test";

import {
  parseBackfillSmokeArgs,
  runBackfillSmoke,
} from "./v02-local-backfill-smoke.mjs";

test("v0.2 local backfill smoke dry-run does not require tokens", () => {
  const options = parseBackfillSmokeArgs(["--dry-run"], {});

  assert.equal(options.dryRun, true);
  assert.equal(options.workerUrl, "http://127.0.0.1:8787");
  assert.deepEqual(options.symbols, [
    "BTCUSDT",
    "ETHUSDT",
    "BNBUSDT",
    "SOLUSDT",
    "XRPUSDT",
  ]);
});

test("v0.2 local backfill smoke refuses missing tokens outside dry-run", () => {
  assert.throws(
    () => parseBackfillSmokeArgs(["--skip-pipeline"], {}),
    /--market-token is required/,
  );
  assert.throws(
    () => parseBackfillSmokeArgs(["--skip-import"], {}),
    /--admin-token is required/,
  );
});

test("v0.2 local backfill smoke dry-run does not call network", async () => {
  await rm(".tmp/v02-local-backfill-smoke-report.json", { force: true });
  const options = parseBackfillSmokeArgs(["--dry-run"], {});
  const report = await runBackfillSmoke(options, {
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
    logger: { log() {} },
  });

  assert.equal(report.ok, true);
  assert.equal(report.steps.import, "dry_run");
  assert.equal(report.steps.feed, "dry_run");
});

test("v0.2 local backfill smoke validates v02 feed shape", async () => {
  const calls = [];
  const options = parseBackfillSmokeArgs(
    ["--skip-import", "--admin-token", "admin-token", "--expect-v02-feed"],
    {},
  );
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname);

    if (url.pathname === "/api/admin/v02/run-pipeline") {
      return new Response(
        JSON.stringify({
          ok: true,
          steps_run: ["detector", "market_stories", "daily_overviews"],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.pathname === "/api/market/latest") {
      return new Response(
        JSON.stringify({ ok: true, symbols: [{ symbol: "BTCUSDT" }] }),
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
                { item_type: "daily_overview", id: "daily_2026-06-20" },
                { item_type: "market_story", id: "story_2026-06-20" },
                { item_type: "signal_event", id: "sig_2026-06-20" },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    throw new Error(`unexpected path ${url.pathname}`);
  };

  const report = await runBackfillSmoke(options, {
    fetchImpl,
    logger: { log() {} },
  });

  assert.equal(report.ok, true);
  assert.deepEqual(calls, [
    "/api/admin/v02/run-pipeline",
    "/api/market/latest",
    "/api/intelligence/feed",
  ]);
  assert.equal(report.feed_counts.day_groups, 1);
  assert.equal(report.feed_counts.daily_overviews, 1);
  assert.equal(report.feed_counts.market_stories, 1);
  assert.equal(report.feed_counts.signal_events, 1);
});

test("v0.2 local backfill smoke rejects Market Story Claude fields", async () => {
  const options = parseBackfillSmokeArgs(
    ["--skip-import", "--admin-token", "admin-token", "--expect-v02-feed"],
    {},
  );
  const fetchImpl = async (input) => {
    const url = new URL(String(input));

    if (url.pathname === "/api/admin/v02/run-pipeline") {
      return new Response(
        JSON.stringify({
          ok: true,
          steps_run: ["daily_overviews"],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.pathname === "/api/market/latest") {
      return new Response(
        JSON.stringify({ ok: true, symbols: [{ symbol: "BTCUSDT" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        version: "v02",
        day_groups: [
          {
            items: [
              {
                item_type: "market_story",
                id: "story_with_source",
                sources: [],
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  await assert.rejects(
    () =>
      runBackfillSmoke(options, {
        fetchImpl,
        logger: { log() {} },
      }),
    /Market Story unexpectedly included sources/,
  );
});
