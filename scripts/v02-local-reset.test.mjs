import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildCorepackCommand,
  buildWranglerResetArgs,
  buildResetSql,
  parseResetArgs,
  runLocalReset,
} from "./v02-local-reset.mjs";

test("v0.2 local reset refuses to run without explicit confirmation", () => {
  assert.throws(() => parseResetArgs([]), /--confirm-local-reset/);
});

test("v0.2 local reset refuses remote usage", () => {
  assert.throws(
    () => parseResetArgs(["--confirm-local-reset", "--remote"]),
    /never accepts --remote/,
  );
  assert.throws(
    () => parseResetArgs(["--confirm-local-reset", "--remote=true"]),
    /never accepts --remote/,
  );
});

test("v0.2 local reset clears only v0.2 tables by default", () => {
  const options = parseResetArgs(["--confirm-local-reset"]);
  const sql = buildResetSql(options);

  assert.match(sql, /DELETE FROM signal_events_v02;/);
  assert.match(sql, /DELETE FROM audit_events_v02;/);
  assert.match(sql, /DELETE FROM source_references_v02;/);
  assert.match(sql, /DELETE FROM claude_briefs_v02;/);
  assert.match(sql, /DELETE FROM daily_overviews_v02;/);
  assert.match(sql, /DELETE FROM market_story_members_v02;/);
  assert.match(sql, /DELETE FROM market_stories_v02;/);
  assert.match(sql, /DELETE FROM signal_event_symbols_v02;/);
  assert.doesNotMatch(sql, /DELETE FROM incidents;/);
  assert.doesNotMatch(sql, /DELETE FROM raw_signal_events;/);
  assert.doesNotMatch(sql, /DELETE FROM claude_briefs;/);
  assert.doesNotMatch(sql, /DELETE FROM source_references;/);
  assert.doesNotMatch(sql, /DELETE FROM market_candles;/);
  assert.doesNotMatch(sql, /DELETE FROM public_view_counts;/);
  assert.doesNotMatch(sql, /DELETE FROM job_runs;/);
  assert.doesNotMatch(sql, /--remote/);
});

test("v0.2 local reset includes optional local-only tables explicitly", () => {
  const options = parseResetArgs([
    "--confirm-local-reset",
    "--include-market-candles",
    "--include-job-runs",
  ]);
  const sql = buildResetSql(options);

  assert.match(sql, /DELETE FROM market_candles;/);
  assert.match(sql, /DELETE FROM job_runs;/);
});

test("v0.2 local reset builds a local file-based wrangler command", () => {
  const options = parseResetArgs(["--confirm-local-reset"]);
  const args = buildWranglerResetArgs(options, "C:\\tmp\\reset.sql");

  assert.equal(args.includes("--local"), true);
  assert.equal(args.includes("--file"), true);
  assert.equal(args.includes("--command"), false);
  assert.equal(args.includes("--remote"), false);
  assert.equal(args.at(-1), "C:\\tmp\\reset.sql");
  assert.equal(
    args.some((arg) => arg.includes("DELETE FROM")),
    false,
  );
});

test("v0.2 local reset uses a Windows-safe corepack wrapper", () => {
  assert.deepEqual(buildCorepackCommand("linux"), {
    command: "corepack",
    argsPrefix: [],
  });

  const windowsCommand = buildCorepackCommand("win32", "C:\\Windows\\cmd.exe");
  assert.equal(windowsCommand.command, "C:\\Windows\\cmd.exe");
  assert.deepEqual(windowsCommand.argsPrefix, ["/d", "/s", "/c", "corepack"]);
});

test("v0.2 local reset dry-run does not invoke wrangler", async () => {
  const options = parseResetArgs(["--confirm-local-reset", "--dry-run"]);
  const result = await runLocalReset(options, {
    runner: async () => {
      throw new Error("runner should not be called");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.equal(result.command_strategy, "file");
});

test("v0.2 local reset live command writes a temp SQL file and cleans it up", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "bytesiren-reset-test-"),
  );
  const options = parseResetArgs(["--confirm-local-reset"]);
  let capturedCommand;
  let capturedArgs;
  let capturedSqlFile;
  let capturedSql;

  try {
    const result = await runLocalReset(options, {
      tempRoot,
      command: "corepack-test",
      logger: { log() {} },
      runner: async (command, args) => {
        capturedCommand = command;
        capturedArgs = args;
        const fileIndex = args.indexOf("--file");
        capturedSqlFile = args[fileIndex + 1];
        capturedSql = await readFile(capturedSqlFile, "utf8");
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.dry_run, false);
    assert.equal(result.command_strategy, "file");
    assert.equal(capturedCommand, "corepack-test");
    assert.equal(capturedArgs.includes("--local"), true);
    assert.equal(capturedArgs.includes("--file"), true);
    assert.equal(capturedArgs.includes("--command"), false);
    assert.equal(capturedArgs.includes("--remote"), false);
    assert.match(capturedSql, /DELETE FROM signal_events_v02;/);
    assert.match(capturedSql, /DELETE FROM audit_events_v02;/);

    await assert.rejects(() => readFile(capturedSqlFile, "utf8"), {
      code: "ENOENT",
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("v0.2 local reset logs do not print secret-like values", async () => {
  const options = parseResetArgs(["--confirm-local-reset", "--dry-run"]);
  const logs = [];

  await runLocalReset(options, {
    logger: { log: (message) => logs.push(String(message)) },
  });

  const output = logs.join("\n");
  assert.doesNotMatch(output, /sk-ant/);
  assert.doesNotMatch(output, /ANTHROPIC_API_KEY=/);
  assert.doesNotMatch(output, /MARKET_IMPORT_TOKEN=/);
  assert.doesNotMatch(output, /ADMIN_BACKFILL_TOKEN=/);
});
