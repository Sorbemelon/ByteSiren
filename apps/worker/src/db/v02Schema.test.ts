import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workerSrcDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(workerSrcDir, "../../../..");
const feedMigrationPath = resolve(
  repoRoot,
  "apps/worker/migrations/0007_v02_feed_schema.sql",
);
const claudeMigrationPath = resolve(
  repoRoot,
  "apps/worker/migrations/0008_claude_briefs_v02.sql",
);
const sourceReferenceLinkMigrationPath = resolve(
  repoRoot,
  "apps/worker/migrations/0009_source_references_v02_brief_link.sql",
);
const signalLifecycleMigrationPath = resolve(
  repoRoot,
  "apps/worker/migrations/0010_signal_event_lifecycle_v02.sql",
);
const feedMigrationSql = readFileSync(feedMigrationPath, "utf8");
const claudeMigrationSql = readFileSync(claudeMigrationPath, "utf8");
const sourceReferenceLinkMigrationSql = readFileSync(
  sourceReferenceLinkMigrationPath,
  "utf8",
);
const signalLifecycleMigrationSql = readFileSync(
  signalLifecycleMigrationPath,
  "utf8",
);
const migrationSql = `${feedMigrationSql}\n${claudeMigrationSql}\n${sourceReferenceLinkMigrationSql}\n${signalLifecycleMigrationSql}`;

function tableBlock(tableName: string): string {
  const match = migrationSql.match(
    new RegExp(
      `CREATE TABLE IF NOT EXISTS ${tableName} \\([\\s\\S]*?\\n\\);`,
      "m",
    ),
  );
  assert.ok(match, `missing table block for ${tableName}`);
  return match[0];
}

test("v0.2 migration creates the additive feed schema tables", () => {
  const requiredTables = [
    "signal_events_v02",
    "signal_event_symbols_v02",
    "audit_events_v02",
    "market_stories_v02",
    "market_story_members_v02",
    "daily_overviews_v02",
    "source_references_v02",
  ];

  for (const tableName of requiredTables) {
    assert.match(
      migrationSql,
      new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName} \\(`),
      `${tableName} should be created`,
    );
  }
});

test("v0.2 source references target only Claude-backed item types", () => {
  const sourceReferences = tableBlock("source_references_v02");

  assert.match(sourceReferences, /target_type TEXT NOT NULL CHECK/);
  assert.match(sourceReferences, /'signal_event_v02'/);
  assert.match(sourceReferences, /'daily_overview_v02'/);
  assert.equal(sourceReferences.includes("'market_story_v02'"), false);
});

test("v0.2 market stories keep the deterministic no-Claude boundary", () => {
  const marketStories = tableBlock("market_stories_v02");
  const forbiddenColumnsOrLabels = [
    "claude_brief_id",
    "claude_payload",
    "public_context_status",
    "source_status",
    "source_count",
    "brief_status",
    "Focused Cause",
    "Likely Cause",
    "Market Backdrop",
    "No Clear Cause",
    "Claude Limited",
  ];

  for (const term of forbiddenColumnsOrLabels) {
    assert.equal(
      marketStories.includes(term),
      false,
      `market_stories_v02 must not include ${term}`,
    );
  }
});

test("claude_briefs keeps v0.1 compatibility while adding v0.2 target mapping", () => {
  assert.match(
    migrationSql,
    /ALTER TABLE claude_briefs\s+ADD COLUMN target_type TEXT;/,
  );
  assert.match(
    migrationSql,
    /ALTER TABLE claude_briefs\s+ADD COLUMN target_id TEXT;/,
  );
  assert.match(
    migrationSql,
    /ALTER TABLE claude_briefs\s+ADD COLUMN prompt_mode TEXT;/,
  );
  assert.match(
    migrationSql,
    /CREATE INDEX IF NOT EXISTS idx_claude_briefs_target\s+ON claude_briefs\(target_type, target_id\);/,
  );
});

test("daily overviews and signal events can be associated with Claude briefs", () => {
  const dailyOverviews = tableBlock("daily_overviews_v02");

  assert.match(
    dailyOverviews,
    /claude_status TEXT NOT NULL DEFAULT 'queued_for_analysis'/,
  );
  assert.match(dailyOverviews, /claude_brief_id TEXT/);
  assert.match(
    dailyOverviews,
    /FOREIGN KEY\(claude_brief_id\) REFERENCES claude_briefs\(id\)/,
  );
  assert.match(migrationSql, /target_type TEXT/);
  assert.match(migrationSql, /target_id TEXT/);
  assert.match(migrationSql, /prompt_mode TEXT/);
});

test("signal events store lifecycle reversal context additively", () => {
  assert.match(
    migrationSql,
    /ALTER TABLE signal_events_v02\s+ADD COLUMN direction_changed INTEGER NOT NULL DEFAULT 0;/,
  );
  assert.match(
    migrationSql,
    /ALTER TABLE signal_events_v02\s+ADD COLUMN direction_history_json TEXT NOT NULL DEFAULT '\[\]';/,
  );
});

test("v0.2 migration adds expected indexes", () => {
  const requiredIndexes = [
    "idx_signal_events_v02_date_utc",
    "idx_signal_events_v02_event_end",
    "idx_signal_events_v02_publish_candidate",
    "idx_signal_event_symbols_v02_signal_event_id",
    "idx_audit_events_v02_date_utc",
    "idx_audit_events_v02_event_end",
    "idx_market_stories_v02_date_utc",
    "idx_market_stories_v02_story_end",
    "idx_market_stories_v02_publish_candidate",
    "idx_market_story_members_v02_market_story_id",
    "idx_daily_overviews_v02_date_utc",
    "idx_source_references_v02_target",
    "idx_source_references_v02_brief_id",
    "idx_claude_briefs_target",
  ];

  for (const indexName of requiredIndexes) {
    assert.match(
      migrationSql,
      new RegExp(`CREATE INDEX IF NOT EXISTS ${indexName}`),
      `${indexName} should exist`,
    );
  }
});

test("v0.2 migration does not destructively alter v0.1 data", () => {
  const destructivePatterns = [
    /\bDROP\s+TABLE\b/i,
    /\bTRUNCATE\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bUPDATE\s+(market_candles|market_features|raw_signal_events|incidents|claude_briefs|source_references|job_runs|public_view_counts)\b/i,
    /\bALTER\s+TABLE\s+(market_candles|market_features|raw_signal_events|incidents|source_references|job_runs|public_view_counts)\b/i,
  ];

  for (const pattern of destructivePatterns) {
    assert.equal(
      pattern.test(migrationSql),
      false,
      `unexpected destructive SQL: ${pattern}`,
    );
  }
});

test("v0.2 Claude briefs use a new table without legacy incident coupling", () => {
  const claudeBriefs = tableBlock("claude_briefs_v02");

  assert.match(claudeBriefs, /target_type TEXT NOT NULL CHECK/);
  assert.match(claudeBriefs, /'signal_event_v02'/);
  assert.match(claudeBriefs, /'daily_overview_v02'/);
  assert.equal(claudeBriefs.includes("'market_story_v02'"), false);
  assert.equal(claudeBriefs.includes("incident_id"), false);
  assert.match(claudeBriefs, /prompt_mode TEXT NOT NULL CHECK/);
  assert.match(claudeBriefs, /'signal_event'/);
  assert.match(claudeBriefs, /'daily_overview'/);
});

test("v0.2 Claude brief indexes support target, status, and prompt mode", () => {
  const requiredIndexes = [
    "idx_claude_briefs_v02_target",
    "idx_claude_briefs_v02_status",
    "idx_claude_briefs_v02_prompt_mode",
  ];

  for (const indexName of requiredIndexes) {
    assert.match(
      claudeMigrationSql,
      new RegExp(`CREATE INDEX IF NOT EXISTS ${indexName}`),
      `${indexName} should exist`,
    );
  }
});

test("v0.2 source references use additive v02 brief linkage", () => {
  assert.match(
    sourceReferenceLinkMigrationSql,
    /ALTER TABLE source_references_v02\s+ADD COLUMN brief_v02_id TEXT;/,
  );
  assert.match(
    sourceReferenceLinkMigrationSql,
    /CREATE INDEX IF NOT EXISTS idx_source_references_v02_brief_v02_id/,
  );
});
