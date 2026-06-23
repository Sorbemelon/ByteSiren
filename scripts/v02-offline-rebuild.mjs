#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createMemoryD1 } from "../apps/worker/src/test/d1Memory.ts";
import { runDetectorV02 } from "../apps/worker/src/jobs/runDetectorV02.ts";
import { runMarketStoriesV02 } from "../apps/worker/src/jobs/runMarketStoriesV02.ts";
import { runDailyOverviewsV02 } from "../apps/worker/src/jobs/runDailyOverviewsV02.ts";
import { intelligenceFeedResponse } from "../apps/worker/src/routes/intelligence.ts";

const DEFAULT_REPORT_JSON = ".tmp/v02-phase-b2-offline-rebuild.json";
const DEFAULT_REPORT_MD = ".tmp/v02-phase-b2-offline-rebuild.md";
const DEFAULT_OUTPUT_JSON = ".tmp/v02-phase-b2-offline-rebuild-data.json";
const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"];

function readOption(argv, name) {
  const equalsPrefix = `${name}=`;
  const equalsValue = argv.find((item) => item.startsWith(equalsPrefix));

  if (equalsValue) {
    return equalsValue.slice(equalsPrefix.length);
  }

  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function requireDate(value, name) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  throw new Error(`${name} must use YYYY-MM-DD.`);
}

function addDays(dateUtc, days) {
  return new Date(Date.parse(`${dateUtc}T00:00:00.000Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

function datesBetween(dateFrom, dateTo) {
  const dates = [];
  let cursor = dateFrom;

  while (cursor <= dateTo) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function flattenD1Results(value) {
  if (Array.isArray(value) && value.every((entry) => "results" in entry)) {
    return value.flatMap((entry) => entry.results ?? []);
  }

  if (value && typeof value === "object" && Array.isArray(value.results)) {
    return value.results;
  }

  if (Array.isArray(value)) {
    return value;
  }

  throw new Error("Unsupported candle JSON shape.");
}

function normalizeMarketCandle(row) {
  return {
    symbol: String(row.symbol),
    interval: String(row.interval ?? "15m"),
    open_time: String(row.open_time),
    close_time: String(row.close_time),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    quote_volume: Number(row.quote_volume),
    trade_count: Number(row.trade_count),
  };
}

function countBySymbol(candles) {
  const counts = Object.fromEntries(
    DEFAULT_SYMBOLS.map((symbol) => [symbol, 0]),
  );

  for (const candle of candles) {
    counts[candle.symbol] = (counts[candle.symbol] ?? 0) + 1;
  }

  return counts;
}

function coverageBySymbol(candles) {
  const coverage = Object.fromEntries(
    DEFAULT_SYMBOLS.map((symbol) => [
      symbol,
      {
        count: 0,
        oldest_open_time: null,
        latest_close_time: null,
      },
    ]),
  );

  for (const candle of candles) {
    const row = coverage[candle.symbol] ?? {
      count: 0,
      oldest_open_time: null,
      latest_close_time: null,
    };
    row.count += 1;
    row.oldest_open_time =
      row.oldest_open_time && row.oldest_open_time < candle.open_time
        ? row.oldest_open_time
        : candle.open_time;
    row.latest_close_time =
      row.latest_close_time && row.latest_close_time > candle.close_time
        ? row.latest_close_time
        : candle.close_time;
    coverage[candle.symbol] = row;
  }

  return coverage;
}

function v02Counts(tables) {
  return {
    signal_events_v02: tables.signal_events_v02.length,
    signal_event_symbols_v02: tables.signal_event_symbols_v02.length,
    audit_events_v02: tables.audit_events_v02.length,
    market_stories_v02: tables.market_stories_v02.length,
    market_story_members_v02: tables.market_story_members_v02.length,
    daily_overviews_v02: tables.daily_overviews_v02.length,
    claude_briefs_v02: tables.claude_briefs_v02.length,
    source_references_v02: tables.source_references_v02.length,
  };
}

function countFeedItems(feed) {
  const counts = {
    day_groups: 0,
    public_items: 0,
    daily_overviews: 0,
    market_stories: 0,
    signal_events: 0,
    audit_events_public: 0,
    source_count: 0,
    market_story_forbidden_fields: 0,
  };
  const forbidden = new Set([
    "sources",
    "public_context_status",
    "context_status",
    "brief_status",
    "brief",
    "claude_payload",
  ]);

  for (const group of feed.day_groups ?? []) {
    counts.day_groups += 1;

    for (const item of group.items ?? []) {
      counts.public_items += 1;

      if (item.item_type === "daily_overview") {
        counts.daily_overviews += 1;
      } else if (item.item_type === "market_story") {
        counts.market_stories += 1;

        for (const field of forbidden) {
          if (Object.hasOwn(item, field)) {
            counts.market_story_forbidden_fields += 1;
          }
        }
      } else if (item.item_type === "signal_event") {
        counts.signal_events += 1;
      } else if (item.item_type === "audit_event") {
        counts.audit_events_public += 1;
      }

      if (Array.isArray(item.sources)) {
        counts.source_count += item.sources.length;
      }
    }
  }

  return counts;
}

async function readCandles(candlesJsonPath) {
  const raw = JSON.parse(await readFile(candlesJsonPath, "utf8"));
  return flattenD1Results(raw)
    .map(normalizeMarketCandle)
    .filter((row) => DEFAULT_SYMBOLS.includes(row.symbol))
    .sort(
      (a, b) =>
        a.symbol.localeCompare(b.symbol) ||
        a.open_time.localeCompare(b.open_time),
    );
}

export function parseOfflineRebuildArgs(
  argv = process.argv.slice(2),
  env = process.env,
) {
  return {
    candlesJson: readOption(argv, "--candles-json") ?? env.V02_CANDLES_JSON,
    dateFrom: requireDate(readOption(argv, "--date-from"), "--date-from"),
    dateTo: requireDate(readOption(argv, "--date-to"), "--date-to"),
    outputJson: readOption(argv, "--output-json") ?? DEFAULT_OUTPUT_JSON,
    reportJson: readOption(argv, "--report-json") ?? DEFAULT_REPORT_JSON,
    reportMd: readOption(argv, "--report-md") ?? DEFAULT_REPORT_MD,
  };
}

export async function runOfflineRebuild(options) {
  if (!options.candlesJson) {
    throw new Error("--candles-json is required.");
  }

  const candles = await readCandles(options.candlesJson);
  const { db, tables } = createMemoryD1({ market_candles: candles });
  const detectorResults = [];

  for (const dateUtc of datesBetween(options.dateFrom, options.dateTo)) {
    detectorResults.push(
      await runDetectorV02(db, {
        dateFrom: dateUtc,
        dateTo: dateUtc,
        requestId: `offline_rebuild_${dateUtc}`,
      }),
    );
  }

  const marketStoryResult = await runMarketStoriesV02(db);
  const dailyOverviewResult = await runDailyOverviewsV02(
    db,
    { ENABLE_DAILY_OVERVIEWS: "true" },
    {
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      requestId: "offline_rebuild_daily_overviews",
    },
  );
  const feedResponse = await intelligenceFeedResponse(db, {
    FEED_VERSION: "v02",
  });
  const feed = await feedResponse.json();
  const feedCounts = countFeedItems(feed);
  const counts = v02Counts(tables);
  const ok =
    counts.signal_events_v02 > 0 &&
    counts.signal_event_symbols_v02 > 0 &&
    counts.market_stories_v02 > 0 &&
    counts.market_story_members_v02 > 0 &&
    counts.daily_overviews_v02 > 0 &&
    counts.claude_briefs_v02 === 0 &&
    counts.source_references_v02 === 0 &&
    feed.version === "v02" &&
    feedCounts.day_groups > 0 &&
    feedCounts.audit_events_public === 0 &&
    feedCounts.market_story_forbidden_fields === 0 &&
    feedCounts.source_count === 0;
  const output = {
    generated_at: new Date().toISOString(),
    source: {
      candle_json: options.candlesJson,
      candle_count: candles.length,
      candle_count_by_symbol: countBySymbol(candles),
      candle_coverage_by_symbol: coverageBySymbol(candles),
    },
    range: {
      date_from: options.dateFrom,
      date_to: options.dateTo,
    },
    rows: {
      signal_events_v02: tables.signal_events_v02,
      signal_event_symbols_v02: tables.signal_event_symbols_v02,
      audit_events_v02: tables.audit_events_v02,
      market_stories_v02: tables.market_stories_v02,
      market_story_members_v02: tables.market_story_members_v02,
      daily_overviews_v02: tables.daily_overviews_v02,
    },
    excluded_tables: ["claude_briefs_v02", "source_references_v02"],
  };
  const report = {
    ok,
    generated_at: output.generated_at,
    source: output.source,
    range: output.range,
    counts,
    detector_results: detectorResults,
    market_story_result: marketStoryResult,
    daily_overview_result: dailyOverviewResult,
    feed_validation: {
      ok: feed.ok === true,
      version: feed.version,
      grouping: feed.grouping,
      counts: feedCounts,
    },
    output_json: options.outputJson,
    no_claude: true,
  };

  await mkdir(path.dirname(options.outputJson), { recursive: true });
  await mkdir(path.dirname(options.reportJson), { recursive: true });
  await writeFile(options.outputJson, `${JSON.stringify(output, null, 2)}\n`);
  await writeFile(options.reportJson, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(
    options.reportMd,
    [
      "# v0.2 Phase B2 Offline Rebuild",
      "",
      `- Result: ${ok ? "PASS" : "FAIL"}`,
      `- Date range: ${options.dateFrom} to ${options.dateTo}`,
      `- Candle rows: ${candles.length}`,
      `- Signal Events: ${counts.signal_events_v02}`,
      `- Signal Event symbols: ${counts.signal_event_symbols_v02}`,
      `- Audit Events: ${counts.audit_events_v02}`,
      `- Market Stories: ${counts.market_stories_v02}`,
      `- Market Story members: ${counts.market_story_members_v02}`,
      `- Daily Overviews: ${counts.daily_overviews_v02}`,
      `- Claude briefs v02: ${counts.claude_briefs_v02}`,
      `- Source references v02: ${counts.source_references_v02}`,
      `- Feed day groups: ${feedCounts.day_groups}`,
      `- Public Audit Events: ${feedCounts.audit_events_public}`,
      `- Market Story forbidden fields: ${feedCounts.market_story_forbidden_fields}`,
      `- Source count: ${feedCounts.source_count}`,
      "",
    ].join("\n"),
  );

  return { report, output };
}

async function main() {
  const options = parseOfflineRebuildArgs();
  const { report } = await runOfflineRebuild(options);
  console.log(JSON.stringify({ ok: report.ok, counts: report.counts }));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "offline rebuild failed",
    );
    process.exitCode = 1;
  });
}
