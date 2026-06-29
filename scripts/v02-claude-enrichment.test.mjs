import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBindings,
  claudeEnrichmentReportResult,
  parseClaudeEnrichmentArgs,
  readClaudeRequestTimeoutMs,
  redact,
  runClaudeEnrichmentCli,
  safeEnvForRunner,
  summarizePublicFeedSmokeJson,
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

test("v0.2 Claude enrichment CLI honors explicit Claude search-budget env overrides", () => {
  const previousDefault = process.env.CLAUDE_DEFAULT_MAX_USES;
  const previousSecond = process.env.CLAUDE_SECOND_SEARCH_MAX_USES;

  process.env.CLAUDE_DEFAULT_MAX_USES = "6";
  process.env.CLAUDE_SECOND_SEARCH_MAX_USES = "8";

  const env = safeEnvForRunner("db", {
    CLAUDE_DEFAULT_MAX_USES: "2",
    CLAUDE_SECOND_SEARCH_MAX_USES: "3",
  });

  assert.equal(env.CLAUDE_DEFAULT_MAX_USES, "6");
  assert.equal(env.CLAUDE_SECOND_SEARCH_MAX_USES, "8");
  assert.equal(env.ENABLE_SIGNAL_CLAUDE_V02, "false");
  assert.equal(env.ENABLE_DAILY_CLAUDE, "false");

  if (previousDefault === undefined) {
    delete process.env.CLAUDE_DEFAULT_MAX_USES;
  } else {
    process.env.CLAUDE_DEFAULT_MAX_USES = previousDefault;
  }

  if (previousSecond === undefined) {
    delete process.env.CLAUDE_SECOND_SEARCH_MAX_USES;
  } else {
    process.env.CLAUDE_SECOND_SEARCH_MAX_USES = previousSecond;
  }
});

test("v0.2 Claude enrichment CLI caps explicit request timeout at twenty minutes", () => {
  assert.equal(readClaudeRequestTimeoutMs(), 120_000);
  assert.equal(readClaudeRequestTimeoutMs(""), 120_000);
  assert.equal(readClaudeRequestTimeoutMs("abc"), 120_000);
  assert.equal(readClaudeRequestTimeoutMs("600000"), 600_000);
  assert.equal(readClaudeRequestTimeoutMs("1200000"), 1_200_000);
  assert.equal(readClaudeRequestTimeoutMs("9999999"), 1_200_000);
});

test("v0.2 Claude enrichment report marks failed live target as needs fix", () => {
  assert.equal(
    claudeEnrichmentReportResult({
      options: { live: true },
      liveResult: { status: "failed" },
      publicFeedSmoke: {
        ok: true,
        version: "v02",
        public_audit_events: 0,
        market_story_forbidden_field_count: 0,
      },
    }),
    "NEEDS_FIX",
  );
  assert.equal(
    claudeEnrichmentReportResult({
      options: { live: true },
      liveResult: { status: "success" },
      publicFeedSmoke: {
        ok: true,
        version: "v02",
        public_audit_events: 0,
        market_story_forbidden_field_count: 0,
      },
    }),
    "PASS",
  );
});

test("v0.2 Claude enrichment public feed smoke understands v02 item_type", () => {
  const summary = summarizePublicFeedSmokeJson({
    ok: true,
    version: "v02",
    grouping: "utc_day",
    day_groups: [
      {
        items: [
          {
            item_type: "daily_overview",
            sources: [{ url: "https://example.test" }],
          },
          { item_type: "signal_event" },
          { item_type: "market_story" },
        ],
      },
    ],
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.version, "v02");
  assert.equal(summary.daily_overviews, 1);
  assert.equal(summary.signal_events, 1);
  assert.equal(summary.market_stories, 1);
  assert.equal(summary.public_audit_events, 0);
  assert.equal(summary.source_count, 1);
  assert.equal(summary.market_story_forbidden_field_count, 0);
});
