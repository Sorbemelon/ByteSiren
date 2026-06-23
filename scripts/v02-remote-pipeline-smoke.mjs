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
const DATE_DIAGNOSTIC_JSON = ".tmp/v02-r2a-date-diagnostic-DATE.json";
const DATE_DIAGNOSTIC_MD = ".tmp/v02-r2a-date-diagnostic-DATE.md";
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const ALLOWED_STEPS = new Set([
  "detector",
  "market_stories",
  "daily_overviews",
]);

class RemotePipelineResponseError extends Error {
  constructor(failure) {
    super(failure.error);
    this.name = "RemotePipelineResponseError";
    this.failure = failure;
  }
}

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

function endOfUtcDate(date) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + DAY_MS - 1);
}

function redactSensitive(value, secrets = []) {
  let redacted = String(value);

  for (const secret of secrets) {
    if (secret) {
      redacted = redacted.split(secret).join("[redacted]");
    }
  }

  return redacted
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-[redacted]")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_[redacted]")
    .replace(/ghp_[A-Za-z0-9_]+/g, "ghp_[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(
      /x-bytesiren-admin-token["':\s]+[A-Za-z0-9._-]+/gi,
      "x-bytesiren-admin-token [redacted]",
    );
}

function safeBodyExcerpt(text, secrets = []) {
  return redactSensitive(text, secrets)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

function cloudflareErrorMetadata(text) {
  const code =
    text.match(/\bError\s+(\d{3,5})\b/i)?.[1] ??
    text.match(/\b(error code|code):\s*(\d{3,5})\b/i)?.[2] ??
    null;
  const rayId =
    text.match(/\bRay ID:\s*([A-Za-z0-9-]+)/i)?.[1] ??
    text.match(/\bcf-ray["':\s]+([A-Za-z0-9-]+)/i)?.[1] ??
    null;

  return {
    cloudflare_error_code: code,
    ray_id: rayId,
  };
}

function isCloudflareHtml(text) {
  return /<!doctype html/i.test(text) || /cloudflare/i.test(text);
}

function failureFromResponse({
  response,
  text,
  contentType,
  body,
  context,
  secrets,
  classification,
  error,
}) {
  const excerpt = safeBodyExcerpt(text, secrets);
  const metadata = isCloudflareHtml(text) ? cloudflareErrorMetadata(text) : {};

  return {
    step: context.step ?? null,
    date_from: context.date_from ?? null,
    date_to: context.date_to ?? null,
    time_from: context.time_from ?? null,
    time_to: context.time_to ?? null,
    attempt: context.attempt ?? 1,
    classification,
    http_status: response.status,
    content_type: contentType || null,
    error,
    body_excerpt: excerpt || null,
    response_body: body ?? null,
    ...metadata,
  };
}

async function fetchJson(url, init, fetchImpl, context = {}, secrets = []) {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const expectsJson = contentType.toLowerCase().includes("application/json");
  let body = null;

  if (text) {
    if (!expectsJson) {
      const classification = isCloudflareHtml(text)
        ? "cloudflare_html_error"
        : "non_json_response";
      throw new RemotePipelineResponseError(
        failureFromResponse({
          response,
          text,
          contentType,
          body: null,
          context,
          secrets,
          classification,
          error: `${classification}: HTTP ${response.status}`,
        }),
      );
    }

    try {
      body = JSON.parse(text);
    } catch (error) {
      throw new RemotePipelineResponseError(
        failureFromResponse({
          response,
          text,
          contentType,
          body: null,
          context,
          secrets,
          classification: "invalid_json_response",
          error:
            error instanceof Error ? error.message : "Invalid JSON response.",
        }),
      );
    }
  }

  if (!response.ok) {
    throw new RemotePipelineResponseError(
      failureFromResponse({
        response,
        text,
        contentType,
        body,
        context,
        secrets,
        classification: "http_json_error",
        error:
          body && typeof body === "object"
            ? JSON.stringify(body).slice(0, 500)
            : `HTTP ${response.status}`,
      }),
    );
  }

  return body;
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

function buildTimeWindowCalls(call, fallbackHours) {
  if (
    call.step !== "detector" ||
    !call.date_from ||
    call.date_from !== call.date_to ||
    call.time_from ||
    !fallbackHours
  ) {
    return [];
  }

  const windows = [];
  let cursor = Date.parse(`${call.date_from}T00:00:00.000Z`);
  const dayEnd = endOfUtcDate(call.date_from).getTime();
  const windowMs = fallbackHours * HOUR_MS;

  while (cursor <= dayEnd) {
    const windowEnd = Math.min(cursor + windowMs - 1, dayEnd);
    windows.push({
      ...call,
      fallback_for_date: call.date_from,
      time_from: new Date(cursor).toISOString(),
      time_to: new Date(windowEnd).toISOString(),
    });
    cursor = windowEnd + 1;
  }

  return windows;
}

function filterCallsForResume(calls, options) {
  return calls.filter((call) => {
    if (!call.date_from) {
      return true;
    }

    if (options.resumeFrom && call.date_from < options.resumeFrom) {
      return false;
    }

    if (options.startAfter && call.date_from <= options.startAfter) {
      return false;
    }

    return true;
  });
}

export function parseRemotePipelineSmokeArgs(
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date(),
) {
  const live = argv.includes("--live");
  const dryRun = !live || argv.includes("--dry-run");
  const fallbackDate = previousUtcDate(now);
  const diagnoseDate = dateUtc(readOption(argv, "--diagnose-date"));
  const dateFrom =
    dateUtc(readOption(argv, "--date-from")) ?? diagnoseDate ?? fallbackDate;
  const dateTo =
    dateUtc(readOption(argv, "--date-to")) ??
    dateUtc(readOption(argv, "--date-utc")) ??
    diagnoseDate ??
    dateFrom;
  const fallbackHours = argv.includes("--fallback-half-day")
    ? 12
    : readOption(argv, "--fallback-hours")
      ? Math.min(
          12,
          readPositiveInteger(readOption(argv, "--fallback-hours"), 12),
        )
      : null;
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
    retryFailedOnce: argv.includes("--retry-failed-once"),
    resumeFrom: dateUtc(readOption(argv, "--resume-from")),
    startAfter: dateUtc(readOption(argv, "--start-after")),
    skipCompleted: argv.includes("--skip-completed"),
    fallbackHours,
    diagnoseDate,
    reportDir: readOption(argv, "--report-dir") ?? ".tmp",
  };

  if (readOption(argv, "--resume-from") && !options.resumeFrom) {
    throw new Error("--resume-from must use YYYY-MM-DD.");
  }

  if (readOption(argv, "--start-after") && !options.startAfter) {
    throw new Error("--start-after must use YYYY-MM-DD.");
  }

  if (readOption(argv, "--diagnose-date") && !options.diagnoseDate) {
    throw new Error("--diagnose-date must use YYYY-MM-DD.");
  }

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

  return filterCallsForResume(calls, options);
}

function callKey(call) {
  return [
    call.step,
    call.date_from ?? "",
    call.date_to ?? "",
    call.time_from ?? "",
    call.time_to ?? "",
  ].join("|");
}

function stepFromJobName(jobName) {
  if (jobName === "run_detector_v02") {
    return "detector";
  }

  if (jobName === "run_market_stories_v02") {
    return "market_stories";
  }

  if (jobName === "run_daily_overviews_v02") {
    return "daily_overviews";
  }

  return null;
}

function parseMetadata(row) {
  if (
    !row ||
    typeof row !== "object" ||
    typeof row.metadata_json !== "string"
  ) {
    return {};
  }

  try {
    const parsed = JSON.parse(row.metadata_json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function completedKeysFromDiagnostics(diagnostics) {
  const rows = Array.isArray(diagnostics?.last_job_runs)
    ? diagnostics.last_job_runs
    : [];
  const keys = new Set();

  for (const row of rows) {
    if (row?.status !== "success") {
      continue;
    }

    const metadata = parseMetadata(row);
    const step =
      typeof metadata.step === "string"
        ? metadata.step
        : stepFromJobName(row.job_name);

    if (!step) {
      continue;
    }

    keys.add(
      callKey({
        step,
        date_from: metadata.date_from ?? null,
        date_to: metadata.date_to ?? null,
        time_from: metadata.time_from ?? null,
        time_to: metadata.time_to ?? null,
      }),
    );
  }

  return keys;
}

function callBody(call, dryRun) {
  return {
    steps: [call.step],
    mode: "bounded",
    dry_run: dryRun,
    ...(call.date_from ? { date_from: call.date_from } : {}),
    ...(call.date_to ? { date_to: call.date_to } : {}),
    ...(call.time_from ? { time_from: call.time_from } : {}),
    ...(call.time_to ? { time_to: call.time_to } : {}),
    max_days: 1,
    max_symbols: 5,
    include_fixture_claude: false,
  };
}

function reportPaths(options, report) {
  if (report.diagnose_date) {
    return {
      jsonPath: path.join(
        options.reportDir,
        path
          .basename(DATE_DIAGNOSTIC_JSON)
          .replace("DATE", report.diagnose_date),
      ),
      mdPath: path.join(
        options.reportDir,
        path.basename(DATE_DIAGNOSTIC_MD).replace("DATE", report.diagnose_date),
      ),
    };
  }

  return {
    jsonPath:
      options.live && !options.dryRun
        ? path.join(options.reportDir, path.basename(LIVE_REPORT_JSON))
        : path.join(options.reportDir, path.basename(DRY_REPORT_JSON)),
    mdPath:
      options.live && !options.dryRun
        ? path.join(options.reportDir, path.basename(LIVE_REPORT_MD))
        : path.join(options.reportDir, path.basename(DRY_REPORT_MD)),
  };
}

async function writeReport(report, options) {
  const { jsonPath, mdPath } = reportPaths(options, report);

  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(
    mdPath,
    [
      report.diagnose_date
        ? `# v0.2 Failed-Date Diagnostic: ${report.diagnose_date}`
        : "# v0.2 Remote Pipeline Smoke",
      "",
      `- Result: ${report.ok ? "PASS" : "FAIL"}`,
      `- Live: ${report.live}`,
      `- Dry run: ${report.dry_run}`,
      `- Worker URL: ${report.worker_url}`,
      `- Date range: ${report.date_from} to ${report.date_to}`,
      `- Planned calls: ${report.planned_calls.length}`,
      `- Completed calls: ${report.completed_calls.length}`,
      `- Skipped completed calls: ${report.skipped_completed_calls.length}`,
      `- Claude run: ${report.claude_run ? "yes" : "no"}`,
      `- FEED_VERSION switch: ${report.feed_version_switch ? "yes" : "no"}`,
      "",
      "## Failures",
      ...(report.failures.length
        ? report.failures.map(
            (failure) =>
              `- ${failure.step ?? "unknown"} ${failure.date_from ?? ""}: ${failure.classification ?? "error"} ${failure.http_status ?? ""} ${failure.error}`,
          )
        : ["- None"]),
      "",
      "## Warnings",
      ...(report.warnings.length
        ? report.warnings.map((warning) => `- ${warning}`)
        : ["- None"]),
      "",
    ].join("\n"),
  );

  return { jsonPath, mdPath };
}

function buildDateDiagnosticReport(options, calls) {
  const dateCalls = calls.filter(
    (call) =>
      call.date_from === options.diagnoseDate ||
      call.date_to === options.diagnoseDate,
  );
  const fallback_preview =
    options.fallbackHours && options.diagnoseDate
      ? buildTimeWindowCalls(
          {
            step: "detector",
            date_from: options.diagnoseDate,
            date_to: options.diagnoseDate,
          },
          options.fallbackHours,
        )
      : [];

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    diagnose_date: options.diagnoseDate,
    worker_url: options.workerUrl,
    date_from: options.dateFrom,
    date_to: options.dateTo,
    live: false,
    dry_run: true,
    steps: options.steps,
    planned_calls: dateCalls,
    completed_calls: [],
    skipped_completed_calls: [],
    fallback_preview,
    failures: [],
    warnings: [
      "Date diagnostic dry-run is local/report-only; remote candle and job checks require a protected diagnostics call in an owner-approved checkpoint.",
    ],
    claude_run: false,
    feed_version_switch: false,
    token_redacted: true,
  };
}

async function fetchDiagnostics(options, fetchImpl, secrets) {
  return fetchJson(
    new URL("/api/admin/v02/diagnostics", options.workerUrl),
    {
      method: "GET",
      headers: {
        "x-bytesiren-admin-token": options.adminToken,
      },
    },
    fetchImpl,
    { step: "diagnostics" },
    secrets,
  );
}

async function runCallOnce(call, options, fetchImpl, attempt) {
  return fetchJson(
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
    { ...call, attempt },
    [options.adminToken],
  );
}

async function runCallWithRetry(call, options, fetchImpl) {
  const maxAttempts = options.retryFailedOnce ? 2 : 1;
  let lastFailure = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return {
        ok: true,
        response: await runCallOnce(call, options, fetchImpl, attempt),
        attempts: attempt,
      };
    } catch (error) {
      lastFailure =
        error instanceof RemotePipelineResponseError
          ? error.failure
          : {
              step: call.step,
              date_from: call.date_from ?? null,
              date_to: call.date_to ?? null,
              time_from: call.time_from ?? null,
              time_to: call.time_to ?? null,
              attempt,
              classification: "fetch_error",
              http_status: null,
              content_type: null,
              error: error instanceof Error ? error.message : "fetch failed",
            };

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }

  return {
    ok: false,
    failure: lastFailure,
    attempts: maxAttempts,
  };
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
    resume_from: options.resumeFrom,
    start_after: options.startAfter,
    retry_failed_once: options.retryFailedOnce,
    skip_completed: options.skipCompleted,
    fallback_hours: options.fallbackHours,
    planned_calls: calls,
    completed_calls: [],
    skipped_completed_calls: [],
    fallback_attempts: [],
    failures: [],
    warnings: [],
    claude_run: false,
    feed_version_switch: false,
    token_redacted: true,
  };

  if (options.diagnoseDate) {
    const diagnosticReport = buildDateDiagnosticReport(options, calls);
    const paths = await writeReport(diagnosticReport, options);
    logger.log(`Date diagnostic report written to ${paths.jsonPath}`);
    return diagnosticReport;
  }

  if (options.dryRun) {
    if (options.skipCompleted) {
      report.warnings.push(
        "--skip-completed is only evaluated during live runs with protected diagnostics.",
      );
    }

    const paths = await writeReport(report, options);
    logger.log(`Dry-run remote pipeline report written to ${paths.jsonPath}`);
    return report;
  }

  let completedKeys = new Set();

  if (options.skipCompleted) {
    const diagnostics = await fetchDiagnostics(options, fetchImpl, [
      options.adminToken,
    ]);
    completedKeys = completedKeysFromDiagnostics(diagnostics);
    report.diagnostics_for_skip_completed = {
      completed_keys: [...completedKeys],
      stale_started_job_runs: diagnostics?.stale_started_job_runs ?? [],
    };
  }

  for (const call of calls) {
    if (options.skipCompleted && completedKeys.has(callKey(call))) {
      report.skipped_completed_calls.push(call);
      continue;
    }

    const result = await runCallWithRetry(call, options, fetchImpl);

    if (result.ok) {
      report.completed_calls.push({
        ...call,
        attempts: result.attempts,
        response: result.response,
      });
      continue;
    }

    const fallbackCalls = buildTimeWindowCalls(call, options.fallbackHours);

    if (fallbackCalls.length > 0) {
      const fallbackAttempt = {
        failed_call: call,
        original_failure: result.failure,
        fallback_calls: fallbackCalls,
        completed_calls: [],
        failures: [],
      };
      report.fallback_attempts.push(fallbackAttempt);

      for (const fallbackCall of fallbackCalls) {
        const fallbackResult = await runCallWithRetry(
          fallbackCall,
          options,
          fetchImpl,
        );

        if (!fallbackResult.ok) {
          fallbackAttempt.failures.push(fallbackResult.failure);
          report.failures.push(fallbackResult.failure);
          report.ok = false;
          break;
        }

        fallbackAttempt.completed_calls.push({
          ...fallbackCall,
          attempts: fallbackResult.attempts,
          response: fallbackResult.response,
        });
        report.completed_calls.push({
          ...fallbackCall,
          attempts: fallbackResult.attempts,
          response: fallbackResult.response,
        });
      }

      if (report.ok) {
        continue;
      }
    } else {
      report.failures.push(result.failure);
      report.ok = false;
    }

    break;
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
