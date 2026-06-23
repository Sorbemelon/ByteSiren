#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_WORKER_URL = "http://127.0.0.1:8787";
const DEFAULT_STEPS = "detector,market_stories,daily_overviews";
const DRY_REPORT_JSON = ".tmp/v02-remote-pipeline-dry-run.json";
const DRY_REPORT_MD = ".tmp/v02-remote-pipeline-dry-run.md";
const LIVE_REPORT_JSON = ".tmp/v02-remote-pipeline-run.json";
const LIVE_REPORT_MD = ".tmp/v02-remote-pipeline-run.md";
const DAY_MS = 24 * 60 * 60 * 1000;
const ALLOWED_STEPS = new Set([
  "detector",
  "market_stories",
  "daily_overviews",
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

function dateUtc(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

function previousUtcDate(now = new Date()) {
  return new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
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

function parseSteps(value = DEFAULT_STEPS) {
  const steps = value
    .split(",")
    .map((step) => step.trim())
    .filter(Boolean);

  if (steps.length === 0) {
    throw new Error("At least one step is required.");
  }

  for (const step of steps) {
    if (!ALLOWED_STEPS.has(step)) {
      throw new Error(`Unsupported v0.2 pipeline step: ${step}`);
    }
  }

  return [...new Set(steps)];
}

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function buildDateChunks(dateFrom, dateTo, maxDaysPerCall = 1) {
  const fromMs = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const toMs = Date.parse(`${dateTo}T00:00:00.000Z`);

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    throw new Error("date range must be valid and ascending.");
  }

  const chunks = [];
  let cursor = dateFrom;

  while (cursor <= dateTo) {
    const chunkEnd = addDays(cursor, maxDaysPerCall - 1);
    const boundedEnd = chunkEnd > dateTo ? dateTo : chunkEnd;
    chunks.push({ date_from: cursor, date_to: boundedEnd });
    cursor = addDays(boundedEnd, 1);
  }

  return chunks;
}

export function parseRemotePipelineSmokeArgs(
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date(),
) {
  const live = argv.includes("--live");
  const dryRun = !live || argv.includes("--dry-run");
  const fallbackDate = previousUtcDate(now);
  const dateFrom = dateUtc(readOption(argv, "--date-from")) ?? fallbackDate;
  const dateTo =
    dateUtc(readOption(argv, "--date-to")) ??
    dateUtc(readOption(argv, "--date-utc")) ??
    dateFrom;
  const options = {
    workerUrl:
      readOption(argv, "--worker-url") ??
      env.BYTESIREN_WORKER_URL ??
      DEFAULT_WORKER_URL,
    adminToken:
      readOption(argv, "--admin-token") ??
      env.BYTESIREN_ADMIN_BACKFILL_TOKEN ??
      env.ADMIN_BACKFILL_TOKEN,
    dateFrom,
    dateTo,
    maxDaysPerCall: Math.min(
      3,
      readPositiveInteger(readOption(argv, "--max-days-per-call"), 1),
    ),
    steps: parseSteps(readOption(argv, "--steps")),
    dryRun,
    live,
    remoteRehearsal: argv.includes("--remote-rehearsal"),
    expectV02Feed: argv.includes("--expect-v02-feed"),
    confirmRemoteV02Pipeline: argv.includes("--confirm-remote-v02-pipeline"),
    reportDir: readOption(argv, "--report-dir") ?? ".tmp",
  };

  if (options.live && !options.confirmRemoteV02Pipeline) {
    throw new Error(
      "--live requires --confirm-remote-v02-pipeline for remote v0.2 writes.",
    );
  }

  if (options.live && !options.adminToken) {
    throw new Error("--admin-token is required for live remote pipeline runs.");
  }

  return options;
}

function plannedCalls(options) {
  const chunks = buildDateChunks(
    options.dateFrom,
    options.dateTo,
    options.maxDaysPerCall,
  );
  const calls = [];

  if (options.steps.includes("detector")) {
    for (const chunk of chunks) {
      calls.push({ step: "detector", ...chunk });
    }
  }

  if (options.steps.includes("market_stories")) {
    calls.push({ step: "market_stories", date_from: null, date_to: null });
  }

  if (options.steps.includes("daily_overviews")) {
    for (const chunk of chunks) {
      calls.push({ step: "daily_overviews", ...chunk });
    }
  }

  return calls;
}

async function fetchJson(url, init, fetchImpl) {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `${url} failed HTTP ${response.status}: ${JSON.stringify(body).slice(0, 240)}`,
    );
  }

  return body;
}

function callBody(call, dryRun) {
  return {
    steps: [call.step],
    mode: "bounded",
    dry_run: dryRun,
    ...(call.date_from ? { date_from: call.date_from } : {}),
    ...(call.date_to ? { date_to: call.date_to } : {}),
    max_days: 1,
    max_symbols: 5,
    include_fixture_claude: false,
  };
}

async function writeReport(report, options) {
  const jsonPath =
    options.live && !options.dryRun
      ? path.join(options.reportDir, path.basename(LIVE_REPORT_JSON))
      : path.join(options.reportDir, path.basename(DRY_REPORT_JSON));
  const mdPath =
    options.live && !options.dryRun
      ? path.join(options.reportDir, path.basename(LIVE_REPORT_MD))
      : path.join(options.reportDir, path.basename(DRY_REPORT_MD));

  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(
    mdPath,
    [
      "# v0.2 Remote Pipeline Smoke",
      "",
      `- Result: ${report.ok ? "PASS" : "FAIL"}`,
      `- Live: ${report.live}`,
      `- Dry run: ${report.dry_run}`,
      `- Worker URL: ${report.worker_url}`,
      `- Date range: ${report.date_from} to ${report.date_to}`,
      `- Planned calls: ${report.planned_calls.length}`,
      `- Completed calls: ${report.completed_calls.length}`,
      `- Claude run: ${report.claude_run ? "yes" : "no"}`,
      `- FEED_VERSION switch: ${report.feed_version_switch ? "yes" : "no"}`,
      "",
      "## Failures",
      ...(report.failures.length
        ? report.failures.map(
            (failure) => `- ${failure.step}: ${failure.error}`,
          )
        : ["- None"]),
      "",
    ].join("\n"),
  );

  return { jsonPath, mdPath };
}

export async function runRemotePipelineSmoke(
  options,
  { fetchImpl = fetch, logger = console } = {},
) {
  const calls = plannedCalls(options);
  const report = {
    ok: true,
    generated_at: new Date().toISOString(),
    worker_url: options.workerUrl,
    date_from: options.dateFrom,
    date_to: options.dateTo,
    live: options.live,
    dry_run: options.dryRun,
    steps: options.steps,
    planned_calls: calls,
    completed_calls: [],
    failures: [],
    claude_run: false,
    feed_version_switch: false,
    token_redacted: true,
  };

  if (options.dryRun) {
    const paths = await writeReport(report, options);
    logger.log(`Dry-run remote pipeline report written to ${paths.jsonPath}`);
    return report;
  }

  for (const call of calls) {
    try {
      const body = await fetchJson(
        new URL("/api/admin/v02/run-pipeline", options.workerUrl),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-bytesiren-admin-token": options.adminToken,
          },
          body: JSON.stringify(callBody(call, false)),
        },
        fetchImpl,
      );
      report.completed_calls.push({
        step: call.step,
        date_from: call.date_from,
        date_to: call.date_to,
        response: body,
      });
    } catch (error) {
      report.ok = false;
      report.failures.push({
        step: call.step,
        date_from: call.date_from,
        date_to: call.date_to,
        error: error instanceof Error ? error.message : "unknown error",
      });
      break;
    }
  }

  const paths = await writeReport(report, options);
  logger.log(`Remote pipeline report written to ${paths.jsonPath}`);
  return report;
}

async function main() {
  const options = parseRemotePipelineSmokeArgs();
  await runRemotePipelineSmoke(options);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "remote smoke failed",
    );
    process.exitCode = 1;
  });
}
