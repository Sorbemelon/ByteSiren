#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  auditExclusionCheck,
  countApiFeedItems,
  marketStoryBoundaryCheck,
} from "./v02-local-backfill-smoke.mjs";

const DEFAULT_WORKER_URL = "http://127.0.0.1:8787";
const DEFAULT_REPORT_DIR = ".tmp";
const REPORT_JSON = "v02-claude-sample-report.json";
const REPORT_MD = "v02-claude-sample-report.md";
const MODES = new Set(["signal", "daily", "both"]);

function readOption(argv, name) {
  const equalsPrefix = `${name}=`;
  const equalsValue = argv.find((item) => item.startsWith(equalsPrefix));

  if (equalsValue) {
    return equalsValue.slice(equalsPrefix.length);
  }

  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
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

function parseLimit(value) {
  if (value === undefined || value === "") {
    return 2;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Expected --limit to be a positive integer, received ${value}.`,
    );
  }

  return Math.max(1, Math.min(5, Math.trunc(parsed)));
}

function parseIds(value) {
  if (!value) {
    return [];
  }

  return [
    ...new Set(
      value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ].slice(0, 5);
}

export function parseClaudeSampleArgs(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const live = argv.includes("--live");
  const explicitDryRun = argv.includes("--dry-run");

  if (live && explicitDryRun) {
    throw new Error("Use either --live or --dry-run, not both.");
  }

  const mode = readOption(argv, "--mode") ?? "signal";

  if (!MODES.has(mode)) {
    throw new Error("--mode must be signal, daily, or both.");
  }

  const adminToken = tokenFromArgsOrEnv(
    argv,
    "--admin-token",
    ["BYTESIREN_ADMIN_BACKFILL_TOKEN", "ADMIN_BACKFILL_TOKEN"],
    env,
  );

  if (!adminToken) {
    throw new Error("--admin-token is required.");
  }

  return {
    workerUrl:
      readOption(argv, "--worker-url") ??
      env.BYTESIREN_WORKER_URL ??
      DEFAULT_WORKER_URL,
    adminToken,
    mode,
    limit: parseLimit(readOption(argv, "--limit")),
    ids: parseIds(readOption(argv, "--ids")),
    dryRun: !live,
    live,
    expectV02Feed: argv.includes("--expect-v02-feed"),
    reportDir: readOption(argv, "--report-dir") ?? DEFAULT_REPORT_DIR,
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

function feedSourceReadiness(feed) {
  const summary = {
    daily_items_with_brief_or_sources: 0,
    signal_items_with_brief_or_sources: 0,
    daily_source_count: 0,
    signal_source_count: 0,
  };

  for (const group of feed.day_groups ?? []) {
    for (const item of group.items ?? []) {
      const sources = Array.isArray(item.sources) ? item.sources : [];
      const hasBrief = Boolean(item.brief);

      if (item.item_type === "daily_overview") {
        summary.daily_source_count += sources.length;

        if (hasBrief || sources.length > 0) {
          summary.daily_items_with_brief_or_sources += 1;
        }
      } else if (item.item_type === "signal_event") {
        summary.signal_source_count += sources.length;

        if (hasBrief || sources.length > 0) {
          summary.signal_items_with_brief_or_sources += 1;
        }
      }
    }
  }

  return summary;
}

function reportBase(options) {
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    worker_url: options.workerUrl,
    mode: options.mode,
    limit: options.limit,
    ids: options.ids,
    dry_run: options.dryRun,
    live: options.live,
    selected: [],
    processed: 0,
    classification_counts: {},
    counts_before: null,
    counts_after: null,
    feed_summary: null,
    marketStoryBoundaryCheck: null,
    auditExclusionCheck: null,
    feedSourceReadiness: null,
    warnings: [],
    errors: [],
  };
}

function classificationCounts(result) {
  if (!result) {
    return {};
  }

  return {
    brief_ready: result.brief_ready ?? 0,
    context_only: result.context_only ?? 0,
    no_clear_cause: result.no_clear_cause ?? 0,
    no_major_driver: result.no_major_driver ?? 0,
    claude_limited: result.claude_limited ?? 0,
    failed_retryable: result.failed_retryable ?? 0,
    failed_terminal: result.failed_terminal ?? 0,
  };
}

async function writeReport(report, reportDir) {
  await mkdir(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, REPORT_JSON);
  const mdPath = path.join(reportDir, REPORT_MD);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(
    mdPath,
    [
      "# v0.2 Claude Sample Report",
      "",
      `- Result: ${report.ok ? "PASS" : "FAIL"}`,
      `- Mode: ${report.mode}`,
      `- Limit: ${report.limit}`,
      `- Dry run: ${report.dry_run}`,
      `- Live: ${report.live}`,
      `- Worker URL: ${report.worker_url}`,
      `- Generated at: ${report.generated_at}`,
      `- Selected targets: ${report.selected.length}`,
      `- Processed: ${report.processed}`,
      "",
      "## Counts",
      `- claude_briefs_v02 before/after: ${report.counts_before?.claude_briefs_v02 ?? "n/a"} -> ${report.counts_after?.claude_briefs_v02 ?? "n/a"}`,
      `- source_references_v02 before/after: ${report.counts_before?.source_references_v02 ?? "n/a"} -> ${report.counts_after?.source_references_v02 ?? "n/a"}`,
      `- accepted v0.2 sources: ${report.counts_after?.accepted_source_references_v02 ?? "n/a"}`,
      `- rejected v0.2 sources: ${report.counts_after?.rejected_source_references_v02 ?? "n/a"}`,
      "",
      "## Classification Counts",
      ...Object.entries(report.classification_counts).map(
        ([key, value]) => `- ${key}: ${value}`,
      ),
      "",
      "## Feed Checks",
      `- Feed version: ${report.feed_summary?.version ?? "not_checked"}`,
      `- Day groups: ${report.feed_summary?.counts?.day_groups ?? "n/a"}`,
      `- Public Audit Events: ${report.auditExclusionCheck?.publicAuditEventCount ?? "n/a"}`,
      `- Market Story forbidden fields: ${report.marketStoryBoundaryCheck?.forbiddenClaudeSourceFieldCount ?? "n/a"}`,
      `- Daily items with brief/source: ${report.feedSourceReadiness?.daily_items_with_brief_or_sources ?? "n/a"}`,
      `- Signal items with brief/source: ${report.feedSourceReadiness?.signal_items_with_brief_or_sources ?? "n/a"}`,
      "",
      "## Selected Targets",
      ...(report.selected.length
        ? report.selected.map(
            (target) =>
              `- ${target.target_type} ${target.target_id} (${target.date_utc})`,
          )
        : ["- None"]),
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

  return { jsonPath, mdPath };
}

export async function runClaudeSample(
  options,
  { fetchImpl = fetch, logger = console } = {},
) {
  const report = reportBase(options);

  try {
    const sample = await fetchJson(
      new URL("/api/admin/v02/run-claude-sample", options.workerUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bytesiren-admin-token": options.adminToken,
        },
        body: JSON.stringify({
          mode: options.mode,
          limit: options.limit,
          ids: options.ids,
          dry_run: options.dryRun,
        }),
      },
      fetchImpl,
    );

    report.selected = sample.selected ?? [];
    report.processed = sample.processed ?? 0;
    report.counts_before = sample.counts_before ?? null;
    report.counts_after = sample.counts_after ?? null;
    report.classification_counts = classificationCounts(sample.result);

    if (options.expectV02Feed) {
      const feed = await fetchJson(
        new URL("/api/intelligence/feed", options.workerUrl),
        undefined,
        fetchImpl,
      );

      if (feed.version !== "v02") {
        throw new Error(
          `Expected feed version v02, received ${feed.version ?? "none"}.`,
        );
      }

      report.feed_summary = {
        version: feed.version,
        range_days: feed.range_days ?? null,
        grouping: feed.grouping ?? null,
        counts: countApiFeedItems(feed),
      };
      report.marketStoryBoundaryCheck = marketStoryBoundaryCheck(feed);
      report.auditExclusionCheck = auditExclusionCheck(feed);
      report.feedSourceReadiness = feedSourceReadiness(feed);

      if (report.auditExclusionCheck.publicAuditEventCount > 0) {
        throw new Error("Audit Event appeared in the public v0.2 feed.");
      }

      if (report.marketStoryBoundaryCheck.forbiddenClaudeSourceFieldCount > 0) {
        throw new Error(
          "Market Story unexpectedly included Claude/source fields.",
        );
      }
    }

    const paths = await writeReport(report, options.reportDir);
    logger.log(`v0.2 Claude sample report written to ${paths.jsonPath}`);
    return report;
  } catch (error) {
    report.ok = false;
    report.errors.push(
      error instanceof Error ? error.message : "Unknown error.",
    );
    await writeReport(report, options.reportDir);
    throw error;
  }
}

async function main() {
  const options = parseClaudeSampleArgs();
  await runClaudeSample(options);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "v0.2 Claude sample failed.",
    );
    process.exitCode = 1;
  });
}
