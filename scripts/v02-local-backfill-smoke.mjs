#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runImport } from "./import-binance-candles.mjs";

const DEFAULT_WORKER_URL = "http://127.0.0.1:8787";
const DEFAULT_DAYS = 31;
const DEFAULT_SYMBOLS = "BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT";
const DEFAULT_CHUNK_SIZE = 500;
const REPORT_JSON = ".tmp/v02-local-backfill-smoke-report.json";
const REPORT_MD = ".tmp/v02-local-backfill-smoke-report.md";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED_SYMBOLS = new Set([
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
]);

function readOption(argv, name) {
  const equalsPrefix = `${name}=`;
  const equalsValue = argv.find((item) => item.startsWith(equalsPrefix));

  if (equalsValue) {
    return equalsValue.slice(equalsPrefix.length);
  }

  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function readPositiveInteger(value, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }

  return Math.trunc(parsed);
}

function parseSymbols(value) {
  const symbols = (value ?? DEFAULT_SYMBOLS)
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    throw new Error("At least one symbol is required.");
  }

  for (const symbol of symbols) {
    if (!ALLOWED_SYMBOLS.has(symbol)) {
      throw new Error(`Unsupported symbol: ${symbol}`);
    }
  }

  return symbols;
}

function tokenFromArgsOrEnv(argv, name, envNames, env) {
  const explicit = readOption(argv, name);

  if (explicit !== undefined) {
    return explicit;
  }

  for (const envName of envNames) {
    if (env[envName]) {
      return env[envName];
    }
  }

  return undefined;
}

export function parseBackfillSmokeArgs(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const options = {
    workerUrl:
      readOption(argv, "--worker-url") ??
      env.BYTESIREN_WORKER_URL ??
      DEFAULT_WORKER_URL,
    marketToken: tokenFromArgsOrEnv(
      argv,
      "--market-token",
      ["BYTESIREN_MARKET_IMPORT_TOKEN", "MARKET_IMPORT_TOKEN"],
      env,
    ),
    adminToken: tokenFromArgsOrEnv(
      argv,
      "--admin-token",
      ["BYTESIREN_ADMIN_BACKFILL_TOKEN", "ADMIN_BACKFILL_TOKEN"],
      env,
    ),
    days: readPositiveInteger(readOption(argv, "--days"), DEFAULT_DAYS),
    symbols: parseSymbols(readOption(argv, "--symbols")),
    chunkSize: readPositiveInteger(
      readOption(argv, "--chunk-size"),
      DEFAULT_CHUNK_SIZE,
    ),
    skipImport: argv.includes("--skip-import"),
    skipPipeline: argv.includes("--skip-pipeline"),
    includeFixtureClaude: argv.includes("--include-fixture-claude"),
    expectV02Feed: argv.includes("--expect-v02-feed"),
    dryRun: argv.includes("--dry-run"),
  };

  if (options.chunkSize > DEFAULT_CHUNK_SIZE) {
    throw new Error(`--chunk-size must be ${DEFAULT_CHUNK_SIZE} or less.`);
  }

  if (!options.dryRun && !options.skipImport && !options.marketToken) {
    throw new Error(
      "--market-token is required unless --skip-import or --dry-run is used.",
    );
  }

  if (!options.dryRun && !options.skipPipeline && !options.adminToken) {
    throw new Error(
      "--admin-token is required unless --skip-pipeline or --dry-run is used.",
    );
  }

  return options;
}

function reportBase(options) {
  return {
    ok: true,
    dry_run: options.dryRun,
    generated_at: new Date().toISOString(),
    api_base: options.workerUrl,
    worker_url: options.workerUrl,
    days: options.days,
    symbols: options.symbols,
    steps_requested: [
      ...(options.skipImport ? [] : ["import"]),
      ...(options.skipPipeline
        ? []
        : ["detector", "market_stories", "daily_overviews"]),
      "latest_market",
      "feed",
    ],
    steps_run: [],
    steps: {
      import: options.skipImport ? "skipped" : "pending",
      pipeline: options.skipPipeline ? "skipped" : "pending",
      latest_market: "pending",
      feed: "pending",
    },
    warnings: [],
    errors: [],
    created_at: new Date().toISOString(),
    marketStoryBoundaryCheck: {
      forbiddenClaudeSourceFieldCount: 0,
      checkedCount: 0,
    },
    auditExclusionCheck: {
      publicAuditEventCount: 0,
    },
    dailyOverviewMismatchAnalysis: {
      status: "not_checked",
      expected: null,
      reason: "Feed has not been checked yet.",
    },
    next_recommended_action: "Run the local v0.2 smoke with --expect-v02-feed.",
  };
}

async function fetchJson(url, init, fetchImpl) {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  let body;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `${url} returned non-JSON response HTTP ${response.status}.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `${url} failed HTTP ${response.status}: ${JSON.stringify(body).slice(0, 240)}`,
    );
  }

  return body;
}

export function marketStoryBoundaryCheck(feed) {
  const groups = Array.isArray(feed.day_groups) ? feed.day_groups : [];
  const forbiddenFields = [];
  let checkedCount = 0;

  for (const group of groups) {
    const items = Array.isArray(group.items) ? group.items : [];

    for (const item of items) {
      if (item?.item_type !== "market_story") {
        continue;
      }

      checkedCount += 1;
      const forbidden = [
        "sources",
        "public_context_status",
        "context_status",
        "brief_status",
        "brief",
        "claude_payload",
      ];

      for (const field of forbidden) {
        if (Object.hasOwn(item, field)) {
          forbiddenFields.push({ id: item.id ?? null, field });
        }
      }
    }
  }

  return {
    checkedCount,
    forbiddenClaudeSourceFieldCount: forbiddenFields.length,
    forbiddenFields,
  };
}

export function countApiFeedItems(feed) {
  const counts = {
    day_groups: 0,
    public_items: 0,
    daily_overviews: 0,
    market_stories: 0,
    signal_events: 0,
    audit_events_public: 0,
  };

  if (!Array.isArray(feed.day_groups)) {
    return counts;
  }

  counts.day_groups = feed.day_groups.length;

  for (const group of feed.day_groups) {
    const items = Array.isArray(group.items) ? group.items : [];

    for (const item of items) {
      counts.public_items += 1;
      if (item?.item_type === "daily_overview") {
        counts.daily_overviews += 1;
      } else if (item?.item_type === "market_story") {
        counts.market_stories += 1;
      } else if (item?.item_type === "signal_event") {
        counts.signal_events += 1;
      } else if (item?.item_type === "audit_event") {
        counts.audit_events_public += 1;
      }
    }
  }

  return counts;
}

export function auditExclusionCheck(feed) {
  return {
    publicAuditEventCount: countApiFeedItems(feed).audit_events_public,
  };
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function dailyOverviewDatesFromFeed(feed) {
  const dates = [];

  for (const group of feed.day_groups ?? []) {
    for (const item of group.items ?? []) {
      if (item?.item_type === "daily_overview") {
        dates.push(item.date_utc ?? group.date_utc);
      }
    }
  }

  return uniqueSorted(dates);
}

function dayGroupDatesFromFeed(feed) {
  return uniqueSorted((feed.day_groups ?? []).map((group) => group.date_utc));
}

function pipelineDailyDates(pipeline) {
  const dates = pipeline?.daily_overviews?.dates_generated;
  return Array.isArray(dates) ? uniqueSorted(dates) : [];
}

export function analyzeDailyOverviewMismatch({
  feed,
  apiFeedCounts,
  dbCounts = null,
  pipeline = null,
  now = new Date(),
}) {
  const feedDates = dailyOverviewDatesFromFeed(feed);
  const tableDatesProxy = pipelineDailyDates(pipeline);
  const feedDayDates = dayGroupDatesFromFeed(feed);
  const tableCount =
    typeof dbCounts?.daily_overviews_v02 === "number"
      ? dbCounts.daily_overviews_v02
      : typeof pipeline?.daily_overviews?.generated_count === "number"
        ? pipeline.daily_overviews.generated_count
        : null;
  const feedCount = apiFeedCounts.daily_overviews;
  const tableDatesMissingFromFeed = tableDatesProxy.filter(
    (date) => !feedDates.includes(date),
  );
  const feedDatesMissingFromTable = tableDatesProxy.length
    ? feedDates.filter((date) => !tableDatesProxy.includes(date))
    : [];
  const currentUtcDay = now.toISOString().slice(0, 10);
  const feedMinDate = feedDayDates[0] ?? null;
  const feedMaxDate = feedDayDates.at(-1) ?? null;
  const missingDateReasons = tableDatesMissingFromFeed.map((date) => ({
    date,
    is_current_utc_day: date === currentUtcDay,
    outside_feed_range:
      Boolean(feedMinDate && date < feedMinDate) ||
      Boolean(feedMaxDate && date > feedMaxDate),
    day_group_exists: feedDayDates.includes(date),
    likely_reason:
      date === currentUtcDay
        ? "current_or_incomplete_utc_day"
        : feedMinDate && date < feedMinDate
          ? "outside_visible_feed_range_before_cutoff"
          : feedMaxDate && date > feedMaxDate
            ? "outside_visible_feed_range_after_cutoff"
            : feedDayDates.includes(date)
              ? "day_group_exists_without_daily_item"
              : "date_absent_from_public_feed_groups",
  }));

  if (tableCount === null) {
    return {
      status: "not_available",
      expected: null,
      reason:
        "No local DB count or Daily Overview pipeline count was available to compare against the API feed.",
      table_count: null,
      feed_count: feedCount,
      dates_in_table_but_not_feed: [],
      dates_in_feed_but_not_table: [],
      missing_date_reasons: [],
    };
  }

  const countsMatch = tableCount === feedCount;
  const expected =
    countsMatch ||
    (missingDateReasons.length > 0 &&
      missingDateReasons.every(
        (item) =>
          item.is_current_utc_day ||
          item.outside_feed_range ||
          item.likely_reason === "date_absent_from_public_feed_groups",
      ));

  return {
    status: countsMatch ? "match" : "mismatch",
    expected,
    reason: countsMatch
      ? "Daily Overview table/pipeline count matches the API feed count."
      : expected
        ? "The mismatch is explainable by feed range/current-day visibility diagnostics."
        : "The mismatch needs review because a generated Daily Overview date is missing from the public feed without an expected range/current-day explanation.",
    table_count: tableCount,
    feed_count: feedCount,
    db_counts_available: typeof dbCounts?.daily_overviews_v02 === "number",
    date_source: tableDatesProxy.length
      ? "pipeline.daily_overviews.dates_generated"
      : "counts_only",
    dates_in_table_but_not_feed: tableDatesMissingFromFeed,
    dates_in_feed_but_not_table: feedDatesMissingFromTable,
    missing_date_reasons: missingDateReasons,
  };
}

function runCommandCapture(command, args, { cwd = ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `${command} exited with code ${code ?? "unknown"}: ${stderr.slice(
              -600,
            )}`,
          ),
        );
      }
    });
  });
}

export function buildCorepackCommand(
  platform = process.platform,
  comSpec = process.env.ComSpec,
) {
  if (platform === "win32") {
    return {
      command: comSpec || "cmd.exe",
      argsPrefix: ["/d", "/s", "/c", "corepack"],
    };
  }

  return { command: "corepack", argsPrefix: [] };
}

function parseWranglerJsonRows(stdout) {
  const start = stdout.indexOf("[");

  if (start === -1) {
    throw new Error("Wrangler JSON output did not contain a JSON array.");
  }

  const parsed = JSON.parse(stdout.slice(start));
  return parsed?.[0]?.results?.[0] ?? null;
}

export async function readLocalV02TableCounts({
  database = "bytesiren-db",
  runner = runCommandCapture,
} = {}) {
  const commandSpec = buildCorepackCommand();
  const query =
    "SELECT " +
    "(SELECT COUNT(*) FROM signal_events_v02) AS signal_events_v02, " +
    "(SELECT COUNT(*) FROM audit_events_v02) AS audit_events_v02, " +
    "(SELECT COUNT(*) FROM market_stories_v02) AS market_stories_v02, " +
    "(SELECT COUNT(*) FROM daily_overviews_v02) AS daily_overviews_v02, " +
    "(SELECT COUNT(*) FROM claude_briefs_v02) AS claude_briefs_v02, " +
    "(SELECT COUNT(*) FROM source_references_v02) AS source_references_v02;";
  const args = [
    "pnpm",
    "--filter",
    "@bytesiren/worker",
    "exec",
    "wrangler",
    "d1",
    "execute",
    database,
    "--local",
    "--json",
    "--command",
    query,
  ];
  const { stdout } = await runner(commandSpec.command, [
    ...commandSpec.argsPrefix,
    ...args,
  ]);
  const row = parseWranglerJsonRows(stdout);

  if (!row) {
    throw new Error("Local v0.2 table count query returned no row.");
  }

  return row;
}

function validateV02Feed({ feed, latest, pipeline, options, report }) {
  if (feed.version !== "v02") {
    throw new Error(
      `Expected feed version v02, received ${feed.version ?? "none"}.`,
    );
  }

  if (!Array.isArray(feed.day_groups)) {
    throw new Error("v0.2 feed is missing day_groups.");
  }

  const counts = countApiFeedItems(feed);
  const latestSymbols = Array.isArray(latest?.symbols)
    ? latest.symbols.length
    : 0;

  if (latestSymbols > 0 && counts.day_groups === 0) {
    throw new Error("v0.2 feed has no day_groups after local data import.");
  }

  const storyBoundary = marketStoryBoundaryCheck(feed);
  const auditBoundary = auditExclusionCheck(feed);
  report.marketStoryBoundaryCheck = storyBoundary;
  report.auditExclusionCheck = auditBoundary;

  if (auditBoundary.publicAuditEventCount > 0) {
    throw new Error("Audit Event appeared in the public v0.2 feed.");
  }

  if (storyBoundary.forbiddenClaudeSourceFieldCount > 0) {
    const field = storyBoundary.forbiddenFields[0]?.field ?? "unknown field";
    throw new Error(`Market Story unexpectedly included ${field}.`);
  }

  if (
    !options.skipPipeline &&
    pipeline?.steps_run?.includes?.("daily_overviews") &&
    counts.day_groups > 0 &&
    counts.daily_overviews === 0
  ) {
    throw new Error(
      "Daily Overview rows were expected but absent from v0.2 feed.",
    );
  }

  if (counts.market_stories === 0) {
    report.warnings.push(
      "No publishable Market Story items were present in the v0.2 feed.",
    );
  }

  if (counts.signal_events === 0) {
    report.warnings.push(
      "No publishable Signal Event items were present in the v0.2 feed.",
    );
  }

  return counts;
}

async function writeReport(report) {
  await mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  const counts = report.counts?.apiFeedCounts ?? report.feed_counts;
  const dbCounts = report.counts?.dbCounts;
  const mismatch = report.dailyOverviewMismatchAnalysis;
  await writeFile(
    REPORT_MD,
    [
      "# v0.2 Local Backfill Smoke Report",
      "",
      `- Result: ${report.ok ? "PASS" : "FAIL"}`,
      `- Dry run: ${report.dry_run}`,
      `- Worker URL: ${report.worker_url}`,
      `- Generated at: ${report.generated_at ?? report.created_at}`,
      `- Days: ${report.days}`,
      `- Symbols: ${report.symbols.join(", ")}`,
      `- Import: ${report.steps.import}`,
      `- Pipeline: ${report.steps.pipeline}`,
      `- Feed: ${report.steps.feed}`,
      "",
      "## API Feed Counts",
      `- Day groups: ${counts?.day_groups ?? "n/a"}`,
      `- Public items: ${counts?.public_items ?? "n/a"}`,
      `- Daily Overviews: ${counts?.daily_overviews ?? "n/a"}`,
      `- Market Stories: ${counts?.market_stories ?? "n/a"}`,
      `- Signal Events: ${counts?.signal_events ?? "n/a"}`,
      `- Public Audit Events: ${counts?.audit_events_public ?? "n/a"}`,
      "",
      "## Local DB Counts",
      ...(dbCounts
        ? Object.entries(dbCounts).map(([key, value]) => `- ${key}: ${value}`)
        : ["- Not available"]),
      "",
      "## Daily Overview Count Analysis",
      `- Status: ${mismatch?.status ?? "not_checked"}`,
      `- Expected: ${mismatch?.expected ?? "n/a"}`,
      `- Reason: ${mismatch?.reason ?? "n/a"}`,
      `- Table/pipeline count: ${mismatch?.table_count ?? "n/a"}`,
      `- Feed count: ${mismatch?.feed_count ?? "n/a"}`,
      `- Dates in table/pipeline but not feed: ${
        mismatch?.dates_in_table_but_not_feed?.length
          ? mismatch.dates_in_table_but_not_feed.join(", ")
          : "None"
      }`,
      `- Dates in feed but not table/pipeline: ${
        mismatch?.dates_in_feed_but_not_table?.length
          ? mismatch.dates_in_feed_but_not_table.join(", ")
          : "None"
      }`,
      "",
      "## Boundary Checks",
      `- Market Story forbidden Claude/source fields: ${
        report.marketStoryBoundaryCheck?.forbiddenClaudeSourceFieldCount ??
        "n/a"
      }`,
      `- Public Audit Event items: ${
        report.auditExclusionCheck?.publicAuditEventCount ?? "n/a"
      }`,
      "",
      "## Warnings",
      ...(report.warnings.length
        ? report.warnings.map((warning) => `- ${warning}`)
        : ["- None"]),
      "",
      "## Errors",
      ...(report.errors.length
        ? report.errors.map((error) => `- ${error}`)
        : ["- None"]),
      "",
      "## Next Recommended Action",
      `- ${report.next_recommended_action ?? "Review smoke report."}`,
      "",
    ].join("\n"),
  );
}

export async function runBackfillSmoke(
  options,
  {
    fetchImpl = fetch,
    logger = console,
    dbCountsProvider = readLocalV02TableCounts,
  } = {},
) {
  const report = reportBase(options);

  try {
    if (options.dryRun) {
      report.steps.import = options.skipImport ? "skipped" : "dry_run";
      report.steps.pipeline = options.skipPipeline ? "skipped" : "dry_run";
      report.steps.latest_market = "dry_run";
      report.steps.feed = "dry_run";
      report.next_recommended_action =
        "Run without --dry-run against a local Worker after confirming local-only tokens and v0.2 flags.";
      await writeReport(report);
      logger.log(`Dry-run report written to ${REPORT_JSON}`);
      return report;
    }

    if (!options.skipImport) {
      const importResult = await runImport(
        {
          workerUrl: options.workerUrl,
          token: options.marketToken,
          symbols: options.symbols,
          days: options.days,
          chunkSize: options.chunkSize,
          runDetectorLast: false,
          dryRun: false,
        },
        { fetchImpl, logger },
      );
      report.steps.import = "success";
      report.steps_run.push("import");
      report.import = importResult;
      report.import_summary = {
        fetched: importResult.fetched ?? null,
        uploaded: importResult.uploaded ?? null,
      };
    }

    let pipeline = null;

    if (!options.skipPipeline) {
      pipeline = await fetchJson(
        new URL("/api/admin/v02/run-pipeline", options.workerUrl),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-bytesiren-admin-token": options.adminToken,
          },
          body: JSON.stringify({
            steps: ["detector", "market_stories", "daily_overviews"],
            include_fixture_claude: options.includeFixtureClaude,
          }),
        },
        fetchImpl,
      );
      report.steps.pipeline = "success";
      report.steps_run.push(...(pipeline.steps_run ?? ["pipeline"]));
      report.pipeline = pipeline;
      report.pipeline_summary = {
        steps_run: pipeline.steps_run ?? [],
        detector_status: pipeline.detector?.status ?? null,
        market_stories_status: pipeline.market_stories?.status ?? null,
        daily_overviews_status: pipeline.daily_overviews?.status ?? null,
      };
    }

    const latest = await fetchJson(
      new URL("/api/market/latest", options.workerUrl),
      undefined,
      fetchImpl,
    );
    report.steps.latest_market = "success";
    report.steps_run.push("latest_market");
    report.latest_market = {
      symbol_count: Array.isArray(latest.symbols) ? latest.symbols.length : 0,
      updated_at: latest.updated_at ?? null,
    };

    const feed = await fetchJson(
      new URL("/api/intelligence/feed", options.workerUrl),
      undefined,
      fetchImpl,
    );
    report.steps.feed = "success";
    report.steps_run.push("feed");

    if (options.expectV02Feed) {
      report.feed_counts = validateV02Feed({
        feed,
        latest,
        pipeline,
        options,
        report,
      });
    } else {
      report.feed_counts = countApiFeedItems(feed);
      report.marketStoryBoundaryCheck = marketStoryBoundaryCheck(feed);
      report.auditExclusionCheck = auditExclusionCheck(feed);
    }

    let dbCounts = null;

    try {
      dbCounts = await dbCountsProvider();
    } catch (error) {
      report.warnings.push(
        `Local DB table counts unavailable: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }

    report.counts = {
      apiFeedCounts: report.feed_counts,
      dbCounts,
    };
    report.feed_summary = {
      version: feed.version ?? null,
      range_days: feed.range_days ?? null,
      grouping: feed.grouping ?? null,
    };
    report.dailyOverviewMismatchAnalysis = analyzeDailyOverviewMismatch({
      feed,
      apiFeedCounts: report.feed_counts,
      dbCounts,
      pipeline,
    });
    report.next_recommended_action = report.dailyOverviewMismatchAnalysis
      ?.expected
      ? "Review the local web smoke, then proceed to production cutover rehearsal planning."
      : "Review the Daily Overview mismatch before production cutover rehearsal.";

    await writeReport(report);
    logger.log(`v0.2 local smoke report written to ${REPORT_JSON}`);
    return report;
  } catch (error) {
    report.ok = false;
    report.errors.push(
      error instanceof Error ? error.message : "Unknown error.",
    );
    await writeReport(report);
    throw error;
  }
}

async function main() {
  const options = parseBackfillSmokeArgs();
  await runBackfillSmoke(options);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "v0.2 smoke failed.",
    );
    process.exitCode = 1;
  });
}
