import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import test from "node:test";

import {
  analyzeDailyOverviewMismatch,
  auditExclusionCheck,
  buildCorepackCommand,
  countApiFeedItems,
  marketStoryBoundaryCheck,
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

test("v0.2 local backfill smoke uses a Windows-safe corepack wrapper", () => {
  assert.deepEqual(buildCorepackCommand("linux"), {
    command: "corepack",
    argsPrefix: [],
  });

  const windowsCommand = buildCorepackCommand("win32", "C:\\Windows\\cmd.exe");
  assert.equal(windowsCommand.command, "C:\\Windows\\cmd.exe");
  assert.deepEqual(windowsCommand.argsPrefix, ["/d", "/s", "/c", "corepack"]);
});

test("v0.2 local backfill smoke dry-run does not call network", async () => {
  await rm(".tmp/v02-local-backfill-smoke-report.json", { force: true });
  const options = parseBackfillSmokeArgs(["--dry-run"], {});
  const report = await runBackfillSmoke(options, {
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
    logger: { log() {} },
    dbCountsProvider: async () => {
      throw new Error("db counts should not be called");
    },
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
    dbCountsProvider: async () => ({
      signal_events_v02: 1,
      audit_events_v02: 0,
      market_stories_v02: 1,
      daily_overviews_v02: 1,
      claude_briefs_v02: 0,
      source_references_v02: 0,
    }),
  });

  assert.equal(report.ok, true);
  assert.deepEqual(calls, [
    "/api/admin/v02/run-pipeline",
    "/api/market/latest",
    "/api/intelligence/feed",
  ]);
  assert.equal(report.feed_counts.day_groups, 1);
  assert.equal(report.feed_counts.public_items, 3);
  assert.equal(report.feed_counts.daily_overviews, 1);
  assert.equal(report.feed_counts.market_stories, 1);
  assert.equal(report.feed_counts.signal_events, 1);
  assert.equal(report.feed_counts.audit_events_public, 0);
  assert.equal(report.counts.apiFeedCounts.daily_overviews, 1);
  assert.equal(report.counts.dbCounts.daily_overviews_v02, 1);
  assert.equal(
    report.marketStoryBoundaryCheck.forbiddenClaudeSourceFieldCount,
    0,
  );
  assert.equal(report.auditExclusionCheck.publicAuditEventCount, 0);
  assert.equal(report.dailyOverviewMismatchAnalysis.status, "match");
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
        dbCountsProvider: async () => null,
      }),
    /Market Story unexpectedly included sources/,
  );
});

test("v0.2 local backfill smoke API counts include audit public count", () => {
  const counts = countApiFeedItems({
    day_groups: [
      {
        items: [
          { item_type: "daily_overview" },
          { item_type: "market_story" },
          { item_type: "signal_event" },
          { item_type: "audit_event" },
        ],
      },
    ],
  });

  assert.deepEqual(counts, {
    day_groups: 1,
    public_items: 4,
    daily_overviews: 1,
    market_stories: 1,
    signal_events: 1,
    audit_events_public: 1,
  });
});

test("v0.2 local backfill smoke detects Market Story forbidden fields", () => {
  const result = marketStoryBoundaryCheck({
    day_groups: [
      {
        items: [
          { item_type: "market_story", id: "story_ok" },
          {
            item_type: "market_story",
            id: "story_bad",
            sources: [],
            public_context_status: "brief_ready",
          },
        ],
      },
    ],
  });

  assert.equal(result.checkedCount, 2);
  assert.equal(result.forbiddenClaudeSourceFieldCount, 2);
  assert.deepEqual(
    result.forbiddenFields.map((item) => item.field),
    ["sources", "public_context_status"],
  );
});

test("v0.2 local backfill smoke detects public Audit Event leakage", () => {
  assert.equal(
    auditExclusionCheck({
      day_groups: [{ items: [{ item_type: "audit_event" }] }],
    }).publicAuditEventCount,
    1,
  );
});

test("v0.2 local backfill smoke explains Daily Overview mismatch dates", () => {
  const feed = {
    day_groups: [
      {
        date_utc: "2026-06-20",
        items: [
          {
            item_type: "daily_overview",
            date_utc: "2026-06-20",
            id: "daily_2026-06-20",
          },
        ],
      },
    ],
  };
  const analysis = analyzeDailyOverviewMismatch({
    feed,
    apiFeedCounts: countApiFeedItems(feed),
    dbCounts: { daily_overviews_v02: 2 },
    pipeline: {
      daily_overviews: {
        generated_count: 2,
        dates_generated: ["2026-06-19", "2026-06-20"],
      },
    },
    now: new Date("2026-06-21T12:00:00.000Z"),
  });

  assert.equal(analysis.status, "mismatch");
  assert.equal(analysis.table_count, 2);
  assert.equal(analysis.feed_count, 1);
  assert.deepEqual(analysis.dates_in_table_but_not_feed, ["2026-06-19"]);
  assert.equal(
    analysis.missing_date_reasons[0].likely_reason,
    "outside_visible_feed_range_before_cutoff",
  );
});

test("v0.2 local backfill smoke marks current day mismatch as expected", () => {
  const feed = {
    day_groups: [
      {
        date_utc: "2026-06-21",
        items: [
          {
            item_type: "daily_overview",
            date_utc: "2026-06-21",
            id: "daily_2026-06-21",
          },
        ],
      },
    ],
  };
  const analysis = analyzeDailyOverviewMismatch({
    feed,
    apiFeedCounts: countApiFeedItems(feed),
    dbCounts: { daily_overviews_v02: 2 },
    pipeline: {
      daily_overviews: {
        generated_count: 2,
        dates_generated: ["2026-06-21", "2026-06-22"],
      },
    },
    now: new Date("2026-06-22T12:00:00.000Z"),
  });

  assert.equal(analysis.status, "mismatch");
  assert.equal(analysis.expected, true);
  assert.equal(analysis.missing_date_reasons[0].is_current_utc_day, true);
});
