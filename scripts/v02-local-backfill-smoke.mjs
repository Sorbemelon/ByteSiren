#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runImport } from "./import-binance-candles.mjs";

const DEFAULT_WORKER_URL = "http://127.0.0.1:8787";
const DEFAULT_DAYS = 31;
const DEFAULT_SYMBOLS = "BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT";
const DEFAULT_CHUNK_SIZE = 500;
const REPORT_JSON = ".tmp/v02-local-backfill-smoke-report.json";
const REPORT_MD = ".tmp/v02-local-backfill-smoke-report.md";
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
    worker_url: options.workerUrl,
    days: options.days,
    symbols: options.symbols,
    steps: {
      import: options.skipImport ? "skipped" : "pending",
      pipeline: options.skipPipeline ? "skipped" : "pending",
      latest_market: "pending",
      feed: "pending",
    },
    warnings: [],
    errors: [],
    created_at: new Date().toISOString(),
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

function assertNoMarketStoryClaudeFields(feed) {
  const groups = Array.isArray(feed.day_groups) ? feed.day_groups : [];

  for (const group of groups) {
    const items = Array.isArray(group.items) ? group.items : [];

    for (const item of items) {
      if (item?.item_type === "audit_event") {
        throw new Error("Audit Event appeared in the public v0.2 feed.");
      }

      if (item?.item_type !== "market_story") {
        continue;
      }

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
          throw new Error(`Market Story unexpectedly included ${field}.`);
        }
      }
    }
  }
}

function countFeedItems(feed) {
  const counts = {
    day_groups: 0,
    daily_overviews: 0,
    market_stories: 0,
    signal_events: 0,
  };

  if (!Array.isArray(feed.day_groups)) {
    return counts;
  }

  counts.day_groups = feed.day_groups.length;

  for (const group of feed.day_groups) {
    const items = Array.isArray(group.items) ? group.items : [];

    for (const item of items) {
      if (item?.item_type === "daily_overview") {
        counts.daily_overviews += 1;
      } else if (item?.item_type === "market_story") {
        counts.market_stories += 1;
      } else if (item?.item_type === "signal_event") {
        counts.signal_events += 1;
      }
    }
  }

  return counts;
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

  const counts = countFeedItems(feed);
  const latestSymbols = Array.isArray(latest?.symbols)
    ? latest.symbols.length
    : 0;

  if (latestSymbols > 0 && counts.day_groups === 0) {
    throw new Error("v0.2 feed has no day_groups after local data import.");
  }

  assertNoMarketStoryClaudeFields(feed);

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
  await writeFile(
    REPORT_MD,
    [
      "# v0.2 Local Backfill Smoke Report",
      "",
      `- Result: ${report.ok ? "PASS" : "FAIL"}`,
      `- Dry run: ${report.dry_run}`,
      `- Worker URL: ${report.worker_url}`,
      `- Days: ${report.days}`,
      `- Symbols: ${report.symbols.join(", ")}`,
      `- Import: ${report.steps.import}`,
      `- Pipeline: ${report.steps.pipeline}`,
      `- Feed: ${report.steps.feed}`,
      `- Day groups: ${report.feed_counts?.day_groups ?? "n/a"}`,
      `- Daily Overviews: ${report.feed_counts?.daily_overviews ?? "n/a"}`,
      `- Market Stories: ${report.feed_counts?.market_stories ?? "n/a"}`,
      `- Signal Events: ${report.feed_counts?.signal_events ?? "n/a"}`,
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
    ].join("\n"),
  );
}

export async function runBackfillSmoke(
  options,
  { fetchImpl = fetch, logger = console } = {},
) {
  const report = reportBase(options);

  try {
    if (options.dryRun) {
      report.steps.import = options.skipImport ? "skipped" : "dry_run";
      report.steps.pipeline = options.skipPipeline ? "skipped" : "dry_run";
      report.steps.latest_market = "dry_run";
      report.steps.feed = "dry_run";
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
      report.import = importResult;
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
      report.pipeline = pipeline;
    }

    const latest = await fetchJson(
      new URL("/api/market/latest", options.workerUrl),
      undefined,
      fetchImpl,
    );
    report.steps.latest_market = "success";
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

    if (options.expectV02Feed) {
      report.feed_counts = validateV02Feed({
        feed,
        latest,
        pipeline,
        options,
        report,
      });
    } else {
      report.feed_counts = countFeedItems(feed);
    }

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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "v0.2 smoke failed.",
    );
    process.exitCode = 1;
  });
}
