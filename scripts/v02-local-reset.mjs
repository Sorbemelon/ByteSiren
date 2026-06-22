#!/usr/bin/env node

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_DATABASE = "bytesiren-db";
const V02_TABLES = [
  "source_references_v02",
  "claude_briefs_v02",
  "daily_overviews_v02",
  "market_story_members_v02",
  "market_stories_v02",
  "signal_event_symbols_v02",
  "signal_events_v02",
  "audit_events_v02",
];

function readOption(argv, name) {
  const equalsPrefix = `${name}=`;
  const equalsValue = argv.find((item) => item.startsWith(equalsPrefix));

  if (equalsValue) {
    return equalsValue.slice(equalsPrefix.length);
  }

  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

export function parseResetArgs(argv = process.argv.slice(2)) {
  const options = {
    database: readOption(argv, "--database") ?? DEFAULT_DATABASE,
    confirmLocalReset: argv.includes("--confirm-local-reset"),
    includeMarketCandles: argv.includes("--include-market-candles"),
    includeJobRuns: argv.includes("--include-job-runs"),
    dryRun: argv.includes("--dry-run"),
  };

  if (argv.includes("--remote")) {
    throw new Error("Refusing to run: v02-local-reset never accepts --remote.");
  }

  if (!options.confirmLocalReset) {
    throw new Error(
      "Refusing to reset local tables without --confirm-local-reset.",
    );
  }

  return options;
}

export function buildResetSql(options) {
  const tables = [...V02_TABLES];

  if (options.includeMarketCandles) {
    tables.push("market_candles");
  }

  if (options.includeJobRuns) {
    tables.push("job_runs");
  }

  return `${tables.map((table) => `DELETE FROM ${table};`).join("\n")}\n`;
}

function runCommand(command, args, { cwd = process.cwd() } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
      }
    });
  });
}

export async function runLocalReset(options, { runner = runCommand } = {}) {
  const sql = buildResetSql(options);
  const args = [
    "pnpm",
    "--filter",
    "@bytesiren/worker",
    "exec",
    "wrangler",
    "d1",
    "execute",
    options.database,
    "--local",
    "--command",
    sql,
  ];

  console.log("WARNING: local-only v0.2 reset requested.");
  console.log(`Database: ${options.database}`);
  console.log("Tables:");
  console.log(sql.trim());

  if (options.dryRun) {
    console.log("Dry-run: wrangler command skipped.");
    return { ok: true, dry_run: true, sql };
  }

  await runner("corepack", args);
  return { ok: true, dry_run: false, sql };
}

async function main() {
  const options = parseResetArgs();
  await runLocalReset(options);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Local reset failed.",
    );
    process.exitCode = 1;
  });
}
