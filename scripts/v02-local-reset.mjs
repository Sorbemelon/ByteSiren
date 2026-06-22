#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

  if (argv.some((arg) => arg === "--remote" || arg.startsWith("--remote="))) {
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

export function buildWranglerResetArgs(options, sqlFilePath) {
  return [
    "pnpm",
    "--filter",
    "@bytesiren/worker",
    "exec",
    "wrangler",
    "d1",
    "execute",
    options.database,
    "--local",
    "--file",
    sqlFilePath,
  ];
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

function runCommand(command, args, { cwd = process.cwd() } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: false,
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

async function writeResetSqlTempFile(sql, tempRoot = os.tmpdir()) {
  const tempDir = await mkdtemp(path.join(tempRoot, "bytesiren-v02-reset-"));
  const sqlFile = path.join(tempDir, "v02-local-reset.sql");
  await writeFile(sqlFile, sql, "utf8");
  return { tempDir, sqlFile };
}

export async function runLocalReset(
  options,
  {
    runner = runCommand,
    logger = console,
    tempRoot = os.tmpdir(),
    commandSpec = buildCorepackCommand(),
    command = commandSpec.command,
    commandArgsPrefix = commandSpec.argsPrefix,
  } = {},
) {
  const sql = buildResetSql(options);

  logger.log("WARNING: local-only v0.2 reset requested.");
  logger.log(`Database: ${options.database}`);
  logger.log("Tables:");
  logger.log(sql.trim());

  if (options.dryRun) {
    logger.log(
      "Dry-run: Wrangler command skipped. Live reset will use a temporary .sql file and --file.",
    );
    return { ok: true, dry_run: true, sql, command_strategy: "file" };
  }

  const { tempDir, sqlFile } = await writeResetSqlTempFile(sql, tempRoot);
  const args = buildWranglerResetArgs(options, sqlFile);

  try {
    await runner(command, [...commandArgsPrefix, ...args]);
    return {
      ok: true,
      dry_run: false,
      sql,
      command_strategy: "file",
      sql_file: sqlFile,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseResetArgs();
  await runLocalReset(options);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Local reset failed.",
    );
    process.exitCode = 1;
  });
}
