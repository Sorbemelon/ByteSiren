#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DATABASE = "bytesiren-db";
const WORKER_DIR = path.resolve("apps/worker");
const WRANGLER_TOML = path.join(WORKER_DIR, "wrangler.toml");
const DEFAULT_API_BASE = "https://bytesiren-api.nephilim.workers.dev";
const DEFAULT_REPORT_PREFIX = "v02-phase-g-claude-enrichment-run";
const MAX_BATCH_SIZE = 10;
const MAX_TARGETS = 100;
const SAFE_COUNT_TABLES = [
  "signal_events_v02",
  "daily_overviews_v02",
  "market_stories_v02",
  "audit_events_v02",
  "claude_briefs_v02",
  "source_references_v02",
  "claude_briefs",
  "source_references",
];

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

function readBooleanOption(argv, name, fallback = false) {
  const value = readOption(argv, name);

  if (value === undefined) {
    return hasFlag(argv, name) ? true : fallback;
  }
  if (value.startsWith("--")) return true;

  if (/^(true|1|yes)$/i.test(value)) return true;
  if (/^(false|0|no)$/i.test(value)) return false;
  throw new Error(`${name} must be true or false.`);
}

function readPositiveInt(argv, name, fallback, max) {
  const value = readOption(argv, name);

  if (value === undefined || value === "") return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return Math.max(1, Math.min(max, parsed));
}

function parseIds(value) {
  return (value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseTargetTypes(value = "both") {
  const normalized = value.trim().toLowerCase();

  if (normalized === "both") return ["signal", "daily"];

  const values = normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const allowed = new Set(["signal", "daily"]);

  if (values.length === 0 || values.some((entry) => !allowed.has(entry))) {
    throw new Error("--target-types must be signal, daily, or both.");
  }

  return [...new Set(values)];
}

export function parseClaudeEnrichmentArgs(argv = process.argv.slice(2)) {
  const liveFlag = hasFlag(argv, "--live");
  const dryRunValue = readOption(argv, "--dry-run");
  const dryRun =
    dryRunValue === undefined
      ? !liveFlag
      : readBooleanOption(argv, "--dry-run", true);
  const live = !dryRun;
  const ids = parseIds(
    readOption(argv, "--ids") ?? readOption(argv, "--signal-event-ids"),
  );
  const mode = (readOption(argv, "--mode") ?? (ids.length ? "ids" : "sample"))
    .trim()
    .toLowerCase();

  if (!["sample", "backfill_missing", "ids"].includes(mode)) {
    throw new Error("--mode must be sample, backfill_missing, or ids.");
  }

  if (mode === "ids" && ids.length === 0) {
    throw new Error("--mode ids requires --ids.");
  }

  const targetKinds = parseTargetTypes(readOption(argv, "--target-types"));
  const limit = readPositiveInt(
    argv,
    "--limit",
    mode === "sample" ? 5 : 25,
    MAX_TARGETS,
  );
  const maxTargets = readPositiveInt(argv, "--max-targets", limit, MAX_TARGETS);
  const batchSize = readPositiveInt(
    argv,
    "--batch-size",
    Math.min(limit, 5),
    MAX_BATCH_SIZE,
  );

  return {
    dryRun,
    live,
    remote: readBooleanOption(argv, "--remote", true),
    mode,
    ids,
    targetKinds,
    limit,
    maxTargets,
    batchSize,
    force: readBooleanOption(argv, "--force", false),
    confirmLiveClaude:
      readBooleanOption(argv, "--confirm-live-claude", false) ||
      readBooleanOption(argv, "--confirm-live", false),
    stopOnError: readBooleanOption(argv, "--stop-on-error", false),
    allowClaudeLimitedTerminal: readBooleanOption(
      argv,
      "--allow-claude-limited-terminal",
      true,
    ),
    reportDir: readOption(argv, "--report-dir") ?? ".tmp",
    apiBase: readOption(argv, "--api-base") ?? DEFAULT_API_BASE,
    database: readOption(argv, "--database") ?? DATABASE,
  };
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

export function redact(value) {
  return String(value)
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-[redacted]")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_[redacted]")
    .replace(/ghp_[A-Za-z0-9_]+/g, "ghp_[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/x-api-key['":\s]+[A-Za-z0-9._-]+/gi, "x-api-key [redacted]");
}

function parseJsonOutput(stdout, label) {
  const normalized = stdout.replace(/^\uFEFF/, "");
  try {
    return JSON.parse(normalized);
  } catch {
    const jsonStart = normalized.search(/[\[{]/);
    if (jsonStart >= 0) {
      try {
        return JSON.parse(normalized.slice(jsonStart));
      } catch {
        // Fall through to the safe diagnostic below.
      }
    }
    throw new Error(
      `${label} returned non-JSON output: ${redact(stdout).slice(0, 500)}`,
    );
  }
}

function flattenD1Rows(value) {
  if (Array.isArray(value) && value.every((entry) => "results" in entry)) {
    return value.flatMap((entry) => entry.results ?? []);
  }
  if (value && typeof value === "object" && Array.isArray(value.results)) {
    return value.results;
  }
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

export function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "NULL";
    return String(value);
  }
  if (typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === "object") {
    return sqlLiteral(JSON.stringify(value));
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function applyBindings(sql, bindings = []) {
  let index = 0;
  const bound = sql.replace(/\?/g, () => {
    if (index >= bindings.length) {
      throw new Error("Not enough SQL bindings supplied.");
    }
    const value = sqlLiteral(bindings[index]);
    index += 1;
    return value;
  });

  if (index !== bindings.length) {
    throw new Error("Too many SQL bindings supplied.");
  }

  return bound;
}

function sqlHash(sql) {
  return createHash("sha256").update(sql).digest("hex").slice(0, 16);
}

class RemoteD1PreparedStatement {
  constructor(adapter, sql, bindings = []) {
    this.adapter = adapter;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new RemoteD1PreparedStatement(this.adapter, this.sql, bindings);
  }

  async all() {
    const output = await this.adapter.executeBound(this.sql, this.bindings);
    return { results: flattenD1Rows(output) };
  }

  async first() {
    const output = await this.all();
    return output.results[0] ?? null;
  }

  async run() {
    const output = await this.adapter.executeBound(this.sql, this.bindings);
    return Array.isArray(output) ? output[0] : output;
  }
}

class RemoteD1DatabaseAdapter {
  constructor({ database, sqlDir }) {
    this.database = database;
    this.sqlDir = path.resolve(sqlDir);
    this.statementCounter = 0;
  }

  prepare(sql) {
    return new RemoteD1PreparedStatement(this, sql);
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  }

  async executeBound(sql, bindings = []) {
    const statement = applyBindings(sql, bindings).trim();
    const sqlText = statement.endsWith(";") ? statement : `${statement};`;
    if (/^(SELECT|WITH|PRAGMA)\b/i.test(statement)) {
      const result = await runWrangler([
        "d1",
        "execute",
        this.database,
        "--remote",
        "--json",
        "--command",
        sqlText,
      ]);
      return parseJsonOutput(result.stdout, "wrangler d1 execute");
    }

    await mkdir(this.sqlDir, { recursive: true });
    this.statementCounter += 1;
    const fileName = `${String(this.statementCounter).padStart(4, "0")}-${sqlHash(
      sqlText,
    )}.sql`;
    const filePath = path.join(this.sqlDir, fileName);
    await writeFile(filePath, `${sqlText}\n`);
    try {
      const result = await runWrangler([
        "d1",
        "execute",
        this.database,
        "--remote",
        "--json",
        "--file",
        filePath,
      ]);
      return parseJsonOutput(result.stdout, "wrangler d1 execute");
    } finally {
      await rm(filePath, { force: true });
    }
  }
}

async function readWranglerVars() {
  const config = await readFile(WRANGLER_TOML, "utf8");
  const vars = {};
  let inVars = false;

  for (const line of config.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "[vars]") {
      inVars = true;
      continue;
    }
    if (inVars && trimmed.startsWith("[")) break;
    if (!inVars || !trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*"([^"]*)"$/);
    if (match) {
      vars[match[1]] = match[2];
    }
  }

  return vars;
}

async function importClaudeRunner() {
  return import(
    pathToFileURL(
      path.resolve("apps/worker/src/jobs/runClaudeEnrichmentV02.ts"),
    ).href
  );
}

async function makeRemoteDb(options) {
  const runId = `${Date.now()}-${process.pid}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  return new RemoteD1DatabaseAdapter({
    database: options.database,
    sqlDir: path.join(options.reportDir, "v02-claude-enrichment-sql", runId),
  });
}

function safeEnvForRunner(db, wranglerVars) {
  return {
    ...wranglerVars,
    DB: db,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
    ENABLE_SIGNAL_CLAUDE_V02: "false",
    ENABLE_DAILY_CLAUDE: "false",
    ENABLE_V02_CLAUDE_SAMPLE_TOOLS: "false",
    ENABLE_V02_ADMIN_TOOLS: "false",
    ENABLE_ADMIN_MAINTENANCE: "false",
  };
}

async function readCounts(db) {
  const counts = {};
  for (const table of SAFE_COUNT_TABLES) {
    const row = await db
      .prepare(`SELECT COUNT(*) AS row_count FROM ${table}`)
      .first();
    counts[table] = Number(row?.row_count ?? 0);
  }
  const sourceSummary = await db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) AS accepted,
        SUM(CASE WHEN accepted = 0 THEN 1 ELSE 0 END) AS rejected
       FROM source_references_v02`,
    )
    .first();
  const statusRows = await db
    .prepare(
      `SELECT target_type, status, COUNT(*) AS row_count
       FROM claude_briefs_v02
       GROUP BY target_type, status
       ORDER BY target_type, status`,
    )
    .all();

  return {
    tables: counts,
    sources_v02: {
      total: Number(sourceSummary?.total ?? 0),
      accepted: Number(sourceSummary?.accepted ?? 0),
      rejected: Number(sourceSummary?.rejected ?? 0),
    },
    claude_statuses_v02: statusRows.results,
  };
}

function summarizeTargets(targets) {
  return targets.map((target) => ({
    kind: target.kind,
    target_type: target.target_type,
    target_id: target.target_id,
    prompt_mode: target.prompt_mode,
    date:
      target.payload.mode === "signal_event"
        ? target.payload.evidence_window?.start?.slice(0, 10)
        : target.payload.date_utc,
  }));
}

async function selectTargets({ db, env, options, runner }) {
  return runner.selectClaudeEnrichmentTargetsV02(db, env, {
    limit: Math.min(options.limit, options.maxTargets, MAX_BATCH_SIZE),
    targetKinds: options.targetKinds,
    targetIds: options.ids,
    bypassScheduleFlags: true,
    force: options.force,
  });
}

function addRunTotals(total, result) {
  const keys = [
    "processed",
    "signal_processed",
    "daily_processed",
    "brief_ready_count",
    "context_only_count",
    "no_clear_cause_count",
    "no_major_driver_count",
    "claude_limited_count",
    "failed_retryable_count",
    "failed_terminal_count",
    "sources_written",
    "rejected_sources_count",
    "searches_used",
    "claimed_count",
    "skipped_terminal_count",
    "skipped_processing_count",
  ];

  for (const key of keys) {
    total[key] = (total[key] ?? 0) + Number(result[key] ?? 0);
  }
}

async function runLiveBatches({ db, env, options, runner }) {
  const totals = {
    status: "success",
    message: "",
    batches: [],
    processed: 0,
    signal_processed: 0,
    daily_processed: 0,
    brief_ready_count: 0,
    context_only_count: 0,
    no_clear_cause_count: 0,
    no_major_driver_count: 0,
    claude_limited_count: 0,
    failed_retryable_count: 0,
    failed_terminal_count: 0,
    sources_written: 0,
    rejected_sources_count: 0,
    searches_used: 0,
    claimed_count: 0,
    skipped_terminal_count: 0,
    skipped_processing_count: 0,
  };
  let remaining = Math.min(options.maxTargets, options.limit);

  while (remaining > 0) {
    const batchLimit = Math.min(options.batchSize, remaining, MAX_BATCH_SIZE);
    const result = await runner.runClaudeEnrichmentV02(db, env, {
      limit: batchLimit,
      targetKinds: options.targetKinds,
      targetIds: options.ids,
      bypassScheduleFlags: true,
      force: options.force,
      recordJobRun: false,
      runSource: "admin_sample",
    });
    totals.batches.push(result);
    addRunTotals(totals, result);

    if (result.processed === 0) {
      totals.status = totals.processed > 0 ? "success" : "skipped";
      totals.message = result.message;
      break;
    }

    remaining -= result.processed;

    if (options.stopOnError && result.status === "failed") {
      totals.status = "failed";
      totals.message = "Stopped after failed Claude enrichment batch.";
      break;
    }

    if (options.mode === "sample" || options.mode === "ids") {
      break;
    }
  }

  if (!totals.message) {
    totals.message =
      totals.processed > 0
        ? `GitHub Claude enrichment processed ${totals.processed} item(s).`
        : "No claimable v0.2 Claude targets.";
  }

  if (totals.status === "success" && totals.processed === 0) {
    totals.status = "skipped";
  }

  return totals;
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

async function fetchPublicFeedSmoke(apiBase) {
  try {
    const response = await fetch(
      `${apiBase.replace(/\/$/, "")}/api/intelligence/feed`,
    );
    const json = await response.json();
    const groups = Array.isArray(json.day_groups) ? json.day_groups : [];
    const items = groups.flatMap((group) => group.items ?? []);
    const sources = items.flatMap((item) =>
      Array.isArray(item.sources) ? item.sources : [],
    );
    return {
      ok: response.ok && json.ok === true,
      http_status: response.status,
      version: json.version ?? null,
      grouping: json.grouping ?? null,
      day_groups: groups.length,
      public_items: items.length,
      daily_overviews: items.filter((item) => item.type === "daily_overview")
        .length,
      market_stories: items.filter((item) => item.type === "market_story")
        .length,
      signal_events: items.filter((item) => item.type === "signal_event")
        .length,
      public_audit_events: items.filter((item) => item.type === "audit_event")
        .length,
      source_count: sources.length,
      market_story_forbidden_field_count: items
        .filter((item) => item.type === "market_story")
        .filter(
          (item) =>
            item.claude_status ||
            item.public_label ||
            item.classification ||
            (Array.isArray(item.sources) && item.sources.length > 0),
        ).length,
      raw_trace_or_token_key_count: countKeys(
        json,
        /raw|trace|tool|token|budget|search/i,
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? redact(error.message) : "fetch_failed",
    };
  }
}

export function claudeEnrichmentReportResult({
  options,
  liveResult,
  publicFeedSmoke,
}) {
  const liveResultOk =
    !options.live || !liveResult || liveResult.status !== "failed";

  return liveResultOk &&
    publicFeedSmoke.ok &&
    publicFeedSmoke.version === "v02" &&
    publicFeedSmoke.public_audit_events === 0 &&
    publicFeedSmoke.market_story_forbidden_field_count === 0
    ? "PASS"
    : "NEEDS_FIX";
}

async function writeReports(report, options) {
  await mkdir(options.reportDir, { recursive: true });
  const timestamp = safeTimestamp();
  const jsonPath = path.join(
    options.reportDir,
    `${DEFAULT_REPORT_PREFIX}-${timestamp}.json`,
  );
  const mdPath = path.join(
    options.reportDir,
    `${DEFAULT_REPORT_PREFIX}-${timestamp}.md`,
  );
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(
    mdPath,
    [
      `# v0.2 Claude Enrichment Run ${timestamp}`,
      "",
      `- result: ${report.result}`,
      `- dry_run: ${report.options.dry_run}`,
      `- target_types: ${report.options.target_types.join(",")}`,
      `- mode: ${report.options.mode}`,
      `- selected_targets: ${report.selected_targets.length}`,
      `- processed: ${report.live_result?.processed ?? 0}`,
      `- signal_processed: ${report.live_result?.signal_processed ?? 0}`,
      `- daily_processed: ${report.live_result?.daily_processed ?? 0}`,
      `- claude_briefs_v02: ${report.counts_after?.tables?.claude_briefs_v02 ?? "n/a"}`,
      `- source_references_v02: ${report.counts_after?.tables?.source_references_v02 ?? "n/a"}`,
      `- accepted_sources_v02: ${report.counts_after?.sources_v02?.accepted ?? "n/a"}`,
      `- rejected_sources_v02: ${report.counts_after?.sources_v02?.rejected ?? "n/a"}`,
      `- public_feed_version: ${report.public_feed_smoke?.version ?? "n/a"}`,
      `- public_audit_events: ${report.public_feed_smoke?.public_audit_events ?? "n/a"}`,
      `- market_story_forbidden_field_count: ${report.public_feed_smoke?.market_story_forbidden_field_count ?? "n/a"}`,
      "",
    ].join("\n"),
  );

  return {
    json: jsonPath.replaceAll("\\", "/"),
    markdown: mdPath.replaceAll("\\", "/"),
  };
}

export async function runClaudeEnrichmentCli(options) {
  if (!options.remote) {
    throw new Error("Only --remote D1 execution is supported for Phase G.");
  }

  if (options.live && !options.confirmLiveClaude) {
    throw new Error("Live Claude requires --confirm-live-claude.");
  }

  if (options.live && !process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("Live Claude requires ANTHROPIC_API_KEY.");
  }

  const db = await makeRemoteDb(options);
  const runner = await importClaudeRunner();
  const wranglerVars = await readWranglerVars();
  const env = safeEnvForRunner(db, wranglerVars);
  const countsBefore = await readCounts(db);
  const selectedTargets = await selectTargets({ db, env, options, runner });
  const selectedSummary = summarizeTargets(selectedTargets);
  let liveResult = null;

  if (options.live) {
    liveResult = await runLiveBatches({ db, env, options, runner });
  }

  const countsAfter = await readCounts(db);
  const publicFeedSmoke = await fetchPublicFeedSmoke(options.apiBase);
  const result = claudeEnrichmentReportResult({
    options,
    liveResult,
    publicFeedSmoke,
  });
  const report = {
    result,
    generated_at: new Date().toISOString(),
    options: {
      dry_run: options.dryRun,
      live: options.live,
      mode: options.mode,
      target_types: options.targetKinds,
      ids: options.ids,
      limit: options.limit,
      batch_size: options.batchSize,
      max_targets: options.maxTargets,
      force: options.force,
      stop_on_error: options.stopOnError,
    },
    safety: {
      bypasses_worker_scheduler_flags: true,
      worker_side_claude_flags_required: false,
      writes_old_claude_tables: false,
      selects_market_story: false,
      selects_audit_event: false,
      record_job_runs: false,
    },
    selected_targets: selectedSummary,
    selected_target_count: selectedSummary.length,
    counts_before: countsBefore,
    live_result: liveResult,
    counts_after: countsAfter,
    public_feed_smoke: publicFeedSmoke,
  };
  const reports = await writeReports(report, options);

  return {
    ...report,
    reports,
  };
}

async function main() {
  const options = parseClaudeEnrichmentArgs();
  const report = await runClaudeEnrichmentCli(options);
  console.log(
    redact(
      JSON.stringify(
        {
          result: report.result,
          dry_run: report.options.dry_run,
          mode: report.options.mode,
          target_types: report.options.target_types,
          selected_target_count: report.selected_target_count,
          processed: report.live_result?.processed ?? 0,
          claude_briefs_v02:
            report.counts_after?.tables?.claude_briefs_v02 ?? null,
          source_references_v02:
            report.counts_after?.tables?.source_references_v02 ?? null,
          public_feed_version: report.public_feed_smoke?.version ?? null,
          reports: report.reports,
        },
        null,
        2,
      ),
    ),
  );

  if (report.result !== "PASS") {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      redact(
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      ),
    );
    process.exit(1);
  });
}
