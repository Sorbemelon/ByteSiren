import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBindings,
  parseClaudeEnrichmentArgs,
  redact,
  runClaudeEnrichmentCli,
  sqlLiteral,
} from "./v02-claude-enrichment.mjs";

test("v0.2 Claude enrichment defaults to safe dry-run preview", () => {
  const options = parseClaudeEnrichmentArgs([]);

  assert.equal(options.dryRun, true);
  assert.equal(options.live, false);
  assert.deepEqual(options.targetKinds, ["signal", "daily"]);
  assert.equal(options.mode, "sample");
  assert.equal(options.confirmLiveClaude, false);
});

test("v0.2 Claude enrichment parses explicit Signal ID live request", () => {
  const options = parseClaudeEnrichmentArgs([
    "--dry-run",
    "false",
    "--confirm-live-claude",
    "true",
    "--target-types",
    "signal",
    "--mode",
    "ids",
    "--ids",
    "signal_a,signal_b",
    "--limit",
    "2",
    "--batch-size",
    "1",
    "--force",
    "true",
  ]);

  assert.equal(options.live, true);
  assert.equal(options.confirmLiveClaude, true);
  assert.deepEqual(options.targetKinds, ["signal"]);
  assert.equal(options.mode, "ids");
  assert.deepEqual(options.ids, ["signal_a", "signal_b"]);
  assert.equal(options.force, true);
  assert.equal(options.batchSize, 1);
});

test("v0.2 Claude enrichment supports Worker dispatch compatibility inputs", () => {
  const options = parseClaudeEnrichmentArgs([
    "--dry-run=false",
    "--confirm-live=true",
    "--signal-event-ids",
    "signal_c",
  ]);

  assert.equal(options.live, true);
  assert.equal(options.confirmLiveClaude, true);
  assert.deepEqual(options.ids, ["signal_c"]);
  assert.equal(options.mode, "ids");
});

test("v0.2 Claude enrichment refuses live calls without explicit confirmation", async () => {
  const options = parseClaudeEnrichmentArgs(["--dry-run=false"]);

  await assert.rejects(
    () => runClaudeEnrichmentCli(options),
    /Live Claude requires --confirm-live-claude/,
  );
});

test("v0.2 Claude enrichment refuses live calls without Anthropic secret", async () => {
  const previous = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const options = parseClaudeEnrichmentArgs([
    "--dry-run=false",
    "--confirm-live-claude=true",
  ]);

  await assert.rejects(
    () => runClaudeEnrichmentCli(options),
    /Live Claude requires ANTHROPIC_API_KEY/,
  );
  if (previous === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = previous;
  }
});

test("v0.2 Claude enrichment SQL binding preserves URL text and escapes values", () => {
  assert.equal(
    sqlLiteral("https://example.com/a?b=1"),
    "'https://example.com/a?b=1'",
  );
  assert.equal(sqlLiteral("O'Hara"), "'O''Hara'");
  assert.equal(
    applyBindings(
      "INSERT INTO claude_briefs_v02 (id, headline) VALUES (?, ?)",
      ["brief_1", "O'Hara headline"],
    ),
    "INSERT INTO claude_briefs_v02 (id, headline) VALUES ('brief_1', 'O''Hara headline')",
  );
});

test("v0.2 Claude enrichment redacts Claude and GitHub secrets", () => {
  const value = redact(
    "sk-ant-secret Bearer ghp_abcdef github_pat_secret x-api-key abc123",
  );

  assert.equal(value.includes("sk-ant-secret"), false);
  assert.equal(value.includes("ghp_abcdef"), false);
  assert.equal(value.includes("github_pat_secret"), false);
  assert.match(value, /x-api-key \[redacted\]/);
});
