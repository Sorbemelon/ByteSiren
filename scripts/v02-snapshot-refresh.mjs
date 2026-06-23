#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runImport } from "./v02-apply-remote-import-sql.mjs";
import {
  buildImportArtifacts,
  fileSha256,
  insertSql,
  RESET_SQL,
  TABLES,
} from "./v02-export-remote-import-sql.mjs";
import { runOfflineRebuild } from "./v02-offline-rebuild.mjs";

const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"];
const DATABASE = "bytesiren-db";
const WORKER_DIR = path.resolve("apps/worker");
const WRANGLER_TOML = path.join(WORKER_DIR, "wrangler.toml");
const DEFAULT_API_BASE = "https://bytesiren-api.nephilim.workers.dev";

function readOption(argv, name) {
  const equalsPrefix = `${name}=`;
  const equalsValue = argv.find((item) => item.startsWith(equalsPrefix));
  if (equalsValue) return equalsValue.slice(equalsPrefix.length);
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function requireDate(value, name) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;
  throw new Error(`${name} must use YYYY-MM-DD.`);
}

function addDays(dateUtc, days) {
  return new Date(Date.parse(`${dateUtc}T00:00:00.000Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

function safeTimestamp() {
  return (
    new Date()
      .toISOString()
      .replace(/[-:.]/g, "")
      .replace("T", "T")
      .slice(0, 15) + "Z"
  );
}

function redact(value) {
  return String(value)
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-[redacted]")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_[redacted]")
    .replace(/ghp_[A-Za-z0-9_]+/g, "ghp_[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]");
}

function parseJsonOutput(stdout, label) {
  try {
    return JSON.parse(stdout.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(
      `${label} returned non-JSON output: ${redact(stdout).slice(0, 500)}`,
    );
  }
}

function flattenD1Rows(value) {
  if (Array.isArray(value) && value.every((entry) => "results" in entry)) {
    return value.flatMap((entry) => entry.results ?? []);
  }
  if (value && typeof value === "object" && Array.isArray(value.results))
    return value.results;
  if (Array.isArray(value)) return value;
  return [];
}

function spawnNode(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd ?? process.cwd(),
      shell: false,
      windowsHide: true,
      env: options.env ?? process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ exitCode: 1, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

async function runWrangler(args, options = {}) {
  const wranglerScript = path.join(
    WORKER_DIR,
    "node_modules/wrangler/bin/wrangler.js",
  );
  const result = await spawnNode([wranglerScript, ...args], {
    cwd: options.cwd ?? WORKER_DIR,
  });
  if (result.exitCode !== 0) {
    throw new Error(redact(`${result.stdout}\n${result.stderr}`).trim());
  }
  return result;
}

async function queryRemoteD1(sql) {
  const result = await runWrangler([
    "d1",
    "execute",
    DATABASE,
    "--remote",
    "--json",
    "--command",
    sql,
  ]);
  return parseJsonOutput(result.stdout, "wrangler d1 execute");
}

async function deployWorkerWithOverrides(overrides, label, outputDir) {
  const baseConfig = await readFile(WRANGLER_TOML, "utf8");
  let config = baseConfig;
  for (const [key, value] of Object.entries(overrides)) {
    const pattern = new RegExp(`^${key}\\s*=\\s*\"[^\"]*\"`, "m");
    if (!pattern.test(config)) {
      throw new Error(`Cannot find ${key} in apps/worker/wrangler.toml.`);
    }
    config = config.replace(pattern, `${key} = "${value}"`);
  }

  await mkdir(outputDir, { recursive: true });
  const configPath = path.join(WORKER_DIR, `wrangler.refresh-${label}.toml`);
  try {
    await writeFile(configPath, config);
    const result = await runWrangler([
      "deploy",
      "--config",
      path.basename(configPath),
    ]);
    const safeOutput = redact(`${result.stdout}\n${result.stderr}`);
    await writeFile(
      path.join(outputDir, `worker-deploy-${label}.txt`),
      `${safeOutput}\n`,
    );
    const versionMatch = safeOutput.match(
      /Current Version ID:\s*([a-f0-9-]+)/i,
    );
    return {
      label,
      version_id: versionMatch?.[1] ?? null,
      output_file: path
        .join(outputDir, `worker-deploy-${label}.txt`)
        .replaceAll("\\", "/"),
    };
  } finally {
    await rm(configPath, { force: true });
  }
}

export function parseRefreshArgs(argv = process.argv.slice(2)) {
  const live = hasFlag(argv, "--live") || hasFlag(argv, "--manual-refresh");
  const dryRun = hasFlag(argv, "--dry-run") || !live;
  const rangeStart =
    readOption(argv, "--range-start") ?? readOption(argv, "--date-from");
  const rangeEnd =
    readOption(argv, "--range-end") ?? readOption(argv, "--date-to");
  return {
    dryRun,
    live: live && !dryRun,
    localOnly: hasFlag(argv, "--local-only"),
    prepareImport: hasFlag(argv, "--prepare-import"),
    remoteImport:
      hasFlag(argv, "--remote-import") || hasFlag(argv, "--manual-refresh"),
    manualRefresh: hasFlag(argv, "--manual-refresh"),
    latestCompleteDay:
      hasFlag(argv, "--latest-complete-day") || (!rangeEnd && !rangeStart),
    rollbackOnFail: hasFlag(argv, "--rollback-on-fail"),
    skipHostedSmoke: hasFlag(argv, "--skip-hosted-smoke"),
    confirm: hasFlag(argv, "--confirm-remote-v02-refresh"),
    rangeStart: rangeStart
      ? requireDate(rangeStart, "--range-start")
      : undefined,
    rangeEnd: rangeEnd ? requireDate(rangeEnd, "--range-end") : undefined,
    windowDays: Number(readOption(argv, "--window-days") ?? "31"),
    outputRoot: readOption(argv, "--report-dir") ?? ".tmp",
    apiBase: readOption(argv, "--api-base") ?? DEFAULT_API_BASE,
  };
}

export function latestCompleteDayFromCoverage(coverage) {
  const latestTimes = coverage
    .map((row) => row.latest_close_time)
    .filter(Boolean)
    .sort();
  if (latestTimes.length === 0)
    throw new Error("No market candle coverage found.");
  const minLatest = latestTimes[0];
  const date = minLatest.slice(0, 10);
  return minLatest.slice(11) >= "23:59:59.000Z" ? date : addDays(date, -1);
}

export function targetRangeFromEnd(endDay, windowDays = 31) {
  return {
    date_from: addDays(endDay, -(windowDays - 1)),
    date_to: endDay,
  };
}

async function getCandleCoverage(symbols = DEFAULT_SYMBOLS) {
  const quoted = symbols.map((symbol) => `'${symbol}'`).join(", ");
  const sql = [
    "SELECT symbol, COUNT(*) AS candle_count, MIN(open_time) AS oldest_open_time, MAX(close_time) AS latest_close_time",
    "FROM market_candles",
    `WHERE symbol IN (${quoted})`,
    "GROUP BY symbol",
    "ORDER BY symbol;",
  ].join(" ");
  return flattenD1Rows(await queryRemoteD1(sql));
}

async function exportRemoteCandles({ dateFrom, dateTo, outputPath }) {
  const lookbackStart = addDays(dateFrom, -1);
  const quoted = DEFAULT_SYMBOLS.map((symbol) => `'${symbol}'`).join(", ");
  const sql = [
    "SELECT symbol, interval, open_time, close_time, open, high, low, close, volume, quote_volume, trade_count",
    "FROM market_candles",
    `WHERE symbol IN (${quoted})`,
    `AND open_time >= '${lookbackStart}T00:00:00.000Z'`,
    `AND open_time <= '${dateTo}T23:59:59.999Z'`,
    "ORDER BY symbol, open_time;",
  ].join(" ");
  const output = await queryRemoteD1(sql);
  const rows = flattenD1Rows(output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify([{ results: rows }], null, 2)}\n`,
  );
  return {
    path: outputPath.replaceAll("\\", "/"),
    row_count: rows.length,
  };
}

async function writeRollbackArtifacts({ outputDir, publicFeedVersion }) {
  await mkdir(outputDir, { recursive: true });
  const manifestFiles = [];
  const tableCounts = {};
  for (const table of TABLES) {
    const sql = `SELECT ${table.columns.join(", ")} FROM ${table.name} ORDER BY id;`;
    const rows = flattenD1Rows(await queryRemoteD1(sql));
    tableCounts[table.name] = rows.length;
    const fileName = `current_${table.name}.sql`;
    const filePath = path.join(outputDir, fileName);
    await writeFile(filePath, insertSql(table, rows));
    const stats = await stat(filePath);
    manifestFiles.push({
      path: filePath.replaceAll("\\", "/"),
      size_bytes: stats.size,
      sha256: await fileSha256(filePath),
    });
  }
  const manifest = {
    generated_at: new Date().toISOString(),
    public_feed_version: publicFeedVersion,
    table_row_counts: tableCounts,
    excluded_tables: [
      "claude_briefs_v02",
      "source_references_v02",
      "market_candles",
      "market_features",
      "incidents",
      "claude_briefs",
      "source_references",
      "public_view_counts",
      "job_runs",
    ],
    files: manifestFiles,
    safety: {
      deterministic_v02_tables_only: true,
      old_v01_tables_excluded: true,
      claude_source_v02_tables_excluded: true,
    },
  };
  await writeFile(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

async function prepareRollbackApplyDir(rollbackDir) {
  const applyDir = path.join(rollbackDir, "apply");
  await mkdir(applyDir, { recursive: true });
  await writeFile(path.join(applyDir, "000_reset_v02.sql"), RESET_SQL);
  for (const table of TABLES) {
    const index = table.filename.slice(0, 3);
    await copyFile(
      path.join(rollbackDir, `current_${table.name}.sql`),
      path.join(applyDir, `${index}_${table.name}.sql`),
    );
  }
  return applyDir;
}

async function readRemoteCounts() {
  const tableNames = [
    "market_candles",
    "market_features",
    "claude_briefs",
    "source_references",
    ...TABLES.map((table) => table.name),
    "claude_briefs_v02",
    "source_references_v02",
  ];
  const output = {};
  for (const table of tableNames) {
    const rows = flattenD1Rows(
      await queryRemoteD1(`SELECT COUNT(*) AS row_count FROM ${table};`),
    );
    output[table] = rows[0]?.row_count ?? null;
  }
  return output;
}

function countKeys(value, pattern) {
  let count = 0;
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      if (pattern.test(key)) count += 1;
      walk(child);
    }
  };
  walk(value);
  return count;
}

async function smokeV02Feed(apiBase, outputPath) {
  const response = await fetch(`${apiBase}/api/intelligence/feed`);
  const feed = await response.json();
  const groups = Array.isArray(feed?.day_groups) ? feed.day_groups : [];
  const items = groups.flatMap((group) =>
    Array.isArray(group.items) ? group.items : [],
  );
  const byType = (type) =>
    items.filter((item) => item.item_type === type).length;
  const sourceCount = items.reduce(
    (count, item) =>
      count +
      (Array.isArray(item.sources) ? item.sources.length : 0) +
      (Array.isArray(item.source_references)
        ? item.source_references.length
        : 0),
    0,
  );
  const marketStoryForbiddenFieldCount = items
    .filter((item) => item.item_type === "market_story")
    .filter((item) =>
      /sources?\b|source_references|public_context_status|brief_status|claude|Focused Cause|Likely Cause|Market Backdrop|No Clear Cause|Claude Limited/i.test(
        JSON.stringify(item),
      ),
    ).length;
  const summary = {
    ok: feed?.ok === true,
    http_status: response.status,
    version: feed?.version,
    grouping: feed?.grouping,
    day_groups: groups.length,
    public_items: items.length,
    daily_overviews: byType("daily_overview"),
    market_stories: byType("market_story"),
    signal_events: byType("signal_event"),
    public_audit_events: items.filter((item) =>
      String(item.item_type ?? "")
        .toLowerCase()
        .includes("audit"),
    ).length,
    market_story_forbidden_field_count: marketStoryForbiddenFieldCount,
    source_count: sourceCount,
    raw_claude_tool_trace_key_count: countKeys(
      feed,
      /raw_claude|tool_trace|tool_use|raw_tool|claude_request|claude_response/i,
    ),
    token_budget_search_key_count: countKeys(
      feed,
      /token|budget|search_count|searches_used|web_search/i,
    ),
  };
  await writeFile(
    outputPath,
    `${JSON.stringify({ summary, feed }, null, 2)}\n`,
  );
  return summary;
}

async function writeMarkdownReport(report, pathName) {
  const lines = [
    "# v0.2 Phase D Snapshot Refresh",
    "",
    `- Result: ${report.result}`,
    `- Generated at: ${report.generated_at}`,
    `- Mode: ${report.mode}`,
    `- Range: ${report.range.date_from} to ${report.range.date_to}`,
    `- Dry run: ${report.dry_run}`,
    `- Rollback artifacts: ${report.rollback?.dir ?? "not generated"}`,
    `- Import manifest: ${report.import_manifest_path ?? "not generated"}`,
    `- Claude briefs v02 final: ${report.final_counts?.claude_briefs_v02 ?? "not checked"}`,
    `- Source references v02 final: ${report.final_counts?.source_references_v02 ?? "not checked"}`,
    `- FEED_VERSION final: ${report.final_flags?.FEED_VERSION ?? "not changed"}`,
    `- ENABLE_SCHEDULED_JOBS final: ${report.final_flags?.ENABLE_SCHEDULED_JOBS ?? "not changed"}`,
    "",
  ];
  if (report.api_smoke) {
    lines.push("## v02 API Smoke", "");
    for (const [key, value] of Object.entries(report.api_smoke)) {
      lines.push(`- ${key}: ${value}`);
    }
    lines.push("");
  }
  await writeFile(pathName, `${lines.join("\n")}\n`);
}

export async function runSnapshotRefresh(options) {
  if (options.live && !options.confirm) {
    throw new Error("Live refresh requires --confirm-remote-v02-refresh.");
  }

  const timestamp = safeTimestamp();
  const outputRoot = path.resolve(options.outputRoot);
  const workDir = path.join(outputRoot, `v02-phase-d-refresh-${timestamp}`);
  const coverage = await getCandleCoverage();
  const endDay = options.rangeEnd ?? latestCompleteDayFromCoverage(coverage);
  const range =
    options.rangeStart && options.rangeEnd
      ? { date_from: options.rangeStart, date_to: options.rangeEnd }
      : targetRangeFromEnd(endDay, options.windowDays);
  const candlesPath = path.join(workDir, "remote-candles.json");
  const offlineDataPath = path.join(workDir, "offline-rebuild-data.json");
  const offlineReportJson = path.join(workDir, "offline-rebuild.json");
  const offlineReportMd = path.join(workDir, "offline-rebuild.md");
  const importDir = path.join(workDir, "import");
  const rollbackDir = path.join(outputRoot, "v02-refresh-rollback", timestamp);
  const remoteImportJson = path.join(workDir, "remote-import.json");
  const remoteImportMd = path.join(workDir, "remote-import.md");
  const apiSmokeJson = path.join(
    outputRoot,
    "v02-phase-d-refresh-api-smoke.json",
  );
  const reportJson = path.join(
    outputRoot,
    options.dryRun
      ? "v02-phase-d-refresh-dry-run.json"
      : "v02-phase-d-manual-refresh.json",
  );
  const reportMd = path.join(
    outputRoot,
    options.dryRun
      ? "v02-phase-d-refresh-dry-run.md"
      : "v02-phase-d-manual-refresh.md",
  );

  const report = {
    result: "IN_PROGRESS",
    generated_at: new Date().toISOString(),
    mode: options.live ? "manual-refresh-live" : "dry-run",
    dry_run: options.dryRun,
    coverage,
    range,
    work_dir: workDir.replaceAll("\\", "/"),
    no_claude: true,
    tables_to_import: TABLES.map((table) => table.name),
    excluded_tables: [
      "claude_briefs_v02",
      "source_references_v02",
      "market_candles",
      "market_features",
      "incidents",
      "claude_briefs",
      "source_references",
      "public_view_counts",
      "job_runs",
    ],
    flag_plan: {
      import_window: {
        FEED_VERSION: "v01",
        ENABLE_SCHEDULED_JOBS: "false",
      },
      final: {
        FEED_VERSION: "v02",
        ENABLE_SCHEDULED_JOBS: "true",
      },
    },
  };

  await mkdir(workDir, { recursive: true });
  const candleExport = await exportRemoteCandles({
    dateFrom: range.date_from,
    dateTo: range.date_to,
    outputPath: candlesPath,
  });
  report.candle_export = candleExport;

  const { report: offlineReport } = await runOfflineRebuild({
    candlesJson: candlesPath,
    dateFrom: range.date_from,
    dateTo: range.date_to,
    outputJson: offlineDataPath,
    reportJson: offlineReportJson,
    reportMd: offlineReportMd,
  });
  report.offline_rebuild = {
    ok: offlineReport.ok,
    counts: offlineReport.counts,
    feed_validation: offlineReport.feed_validation,
    output_json: offlineDataPath.replaceAll("\\", "/"),
  };
  if (!offlineReport.ok) {
    report.result = "NEEDS_FIX";
    await writeFile(reportJson, `${JSON.stringify(report, null, 2)}\n`);
    await writeMarkdownReport(report, reportMd);
    throw new Error("Offline rebuild failed validation.");
  }

  const manifest = await buildImportArtifacts({
    inputJson: offlineDataPath,
    outputDir: importDir,
  });
  await copyFile(
    path.join(importDir, "manifest.json"),
    path.join(outputRoot, "v02-phase-d-refresh-import-manifest.json"),
  );
  report.import_manifest_path = path
    .join(outputRoot, "v02-phase-d-refresh-import-manifest.json")
    .replaceAll("\\", "/");
  report.import_manifest = manifest;

  if (options.dryRun) {
    report.result = "PASS";
    report.remote_plan = {
      rollback_artifacts: rollbackDir.replaceAll("\\", "/"),
      import_dir: importDir.replaceAll("\\", "/"),
      remote_reset_import: "planned-only",
      worker_freeze_deploy: "planned-only",
      worker_restore_deploy: "planned-only",
    };
    await writeFile(reportJson, `${JSON.stringify(report, null, 2)}\n`);
    await writeMarkdownReport(report, reportMd);
    return report;
  }

  const preCounts = await readRemoteCounts();
  report.pre_import_counts = preCounts;
  const rollback = await writeRollbackArtifacts({
    outputDir: rollbackDir,
    publicFeedVersion: "v02",
  });
  report.rollback = {
    dir: rollbackDir.replaceAll("\\", "/"),
    manifest: rollback,
  };

  let importWindowDeploy = null;
  let restoreDeploy = null;
  try {
    importWindowDeploy = await deployWorkerWithOverrides(
      {
        FEED_VERSION: "v01",
        ENABLE_SCHEDULED_JOBS: "false",
        ENABLE_MARKET_STORIES: "false",
        ENABLE_DAILY_OVERVIEWS: "false",
        ENABLE_SIGNAL_CLAUDE_V02: "false",
        ENABLE_DAILY_CLAUDE: "false",
        ENABLE_V02_ADMIN_TOOLS: "false",
        ENABLE_V02_CLAUDE_SAMPLE_TOOLS: "false",
        ENABLE_ADMIN_MAINTENANCE: "false",
        DETECTOR_VERSION: "v01",
      },
      "import-window",
      workDir,
    );
    report.import_window_deploy = importWindowDeploy;

    const importResult = await runImport({
      dir: importDir,
      database: DATABASE,
      reportJson: remoteImportJson,
      reportMd: remoteImportMd,
      outputDir: workDir,
      dryRun: false,
      live: true,
      confirm: true,
    });
    report.remote_import = {
      ok: importResult.ok,
      report_json: remoteImportJson.replaceAll("\\", "/"),
      report_md: remoteImportMd.replaceAll("\\", "/"),
      statements: importResult.results.length,
    };
    if (!importResult.ok) {
      throw new Error("Remote import failed.");
    }

    restoreDeploy = await deployWorkerWithOverrides(
      {
        FEED_VERSION: "v02",
        ENABLE_SCHEDULED_JOBS: "true",
        ENABLE_MARKET_STORIES: "false",
        ENABLE_DAILY_OVERVIEWS: "false",
        ENABLE_SIGNAL_CLAUDE_V02: "false",
        ENABLE_DAILY_CLAUDE: "false",
        ENABLE_V02_ADMIN_TOOLS: "false",
        ENABLE_V02_CLAUDE_SAMPLE_TOOLS: "false",
        ENABLE_ADMIN_MAINTENANCE: "false",
        DETECTOR_VERSION: "v01",
      },
      "restore-v02",
      workDir,
    );
    report.restore_deploy = restoreDeploy;

    const apiSmoke = await smokeV02Feed(options.apiBase, apiSmokeJson);
    report.api_smoke = apiSmoke;
    const apiOk =
      apiSmoke.ok &&
      apiSmoke.version === "v02" &&
      apiSmoke.day_groups > 0 &&
      apiSmoke.public_items > 0 &&
      apiSmoke.daily_overviews > 0 &&
      apiSmoke.market_stories > 0 &&
      apiSmoke.signal_events > 0 &&
      apiSmoke.public_audit_events === 0 &&
      apiSmoke.market_story_forbidden_field_count === 0 &&
      apiSmoke.source_count === 0 &&
      apiSmoke.raw_claude_tool_trace_key_count === 0 &&
      apiSmoke.token_budget_search_key_count === 0;
    if (!apiOk) {
      throw new Error("v02 API smoke failed after refresh import.");
    }

    report.final_counts = await readRemoteCounts();
    report.old_table_stability = {
      claude_briefs: `${preCounts.claude_briefs} -> ${report.final_counts.claude_briefs}`,
      source_references: `${preCounts.source_references} -> ${report.final_counts.source_references}`,
      market_candles: `${preCounts.market_candles} -> ${report.final_counts.market_candles}`,
      market_features: `${preCounts.market_features} -> ${report.final_counts.market_features}`,
    };
    report.final_flags = {
      DETECTOR_VERSION: "v01",
      FEED_VERSION: "v02",
      ENABLE_SCHEDULED_JOBS: "true",
      ENABLE_MARKET_STORIES: "false",
      ENABLE_DAILY_OVERVIEWS: "false",
      ENABLE_SIGNAL_CLAUDE_V02: "false",
      ENABLE_DAILY_CLAUDE: "false",
      ENABLE_V02_ADMIN_TOOLS: "false",
      ENABLE_V02_CLAUDE_SAMPLE_TOOLS: "false",
      ENABLE_ADMIN_MAINTENANCE: "false",
    };
    report.result = "PASS";
  } catch (error) {
    report.error = redact(
      error instanceof Error ? error.message : String(error),
    );
    report.result = "NEEDS_FIX";
    if (options.rollbackOnFail && report.rollback?.dir) {
      try {
        const rollbackApplyDir = await prepareRollbackApplyDir(rollbackDir);
        const rollbackResult = await runImport({
          dir: rollbackApplyDir,
          database: DATABASE,
          reportJson: path.join(workDir, "rollback-import.json"),
          reportMd: path.join(workDir, "rollback-import.md"),
          outputDir: workDir,
          dryRun: false,
          live: true,
          confirm: true,
        });
        report.rollback_import = {
          ok: rollbackResult.ok,
          statements: rollbackResult.results.length,
        };
      } catch (rollbackError) {
        report.rollback_import = {
          ok: false,
          error: redact(
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError),
          ),
        };
      }
    }
    try {
      report.restore_after_error_deploy = await deployWorkerWithOverrides(
        {
          FEED_VERSION: report.rollback_import?.ok ? "v02" : "v01",
          ENABLE_SCHEDULED_JOBS: "true",
          ENABLE_MARKET_STORIES: "false",
          ENABLE_DAILY_OVERVIEWS: "false",
          ENABLE_SIGNAL_CLAUDE_V02: "false",
          ENABLE_DAILY_CLAUDE: "false",
          ENABLE_V02_ADMIN_TOOLS: "false",
          ENABLE_V02_CLAUDE_SAMPLE_TOOLS: "false",
          ENABLE_ADMIN_MAINTENANCE: "false",
          DETECTOR_VERSION: "v01",
        },
        "restore-after-error",
        workDir,
      );
    } catch (restoreError) {
      report.restore_after_error = {
        ok: false,
        error: redact(
          restoreError instanceof Error
            ? restoreError.message
            : String(restoreError),
        ),
      };
    }
  }

  await writeFile(reportJson, `${JSON.stringify(report, null, 2)}\n`);
  await writeMarkdownReport(report, reportMd);
  if (report.result !== "PASS") {
    throw new Error(report.error ?? "Snapshot refresh failed.");
  }
  return report;
}

async function main() {
  const options = parseRefreshArgs();
  const report = await runSnapshotRefresh(options);
  console.log(
    JSON.stringify({
      ok: report.result === "PASS",
      result: report.result,
      range: report.range,
      counts: report.offline_rebuild?.counts,
      api_smoke: report.api_smoke,
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      redact(error instanceof Error ? error.message : String(error)),
    );
    process.exitCode = 1;
  });
}
