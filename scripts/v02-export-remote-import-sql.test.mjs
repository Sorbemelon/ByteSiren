import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildImportArtifacts,
  sqlLiteral,
} from "./v02-export-remote-import-sql.mjs";

test("v0.2 SQL literal escapes strings and keeps nulls explicit", () => {
  assert.equal(sqlLiteral("a'b"), "'a''b'");
  assert.equal(sqlLiteral(null), "NULL");
  assert.equal(sqlLiteral(undefined), "NULL");
  assert.equal(sqlLiteral(true), "1");
  assert.equal(sqlLiteral(1.5), "1.5");
});

test("v0.2 remote import exporter emits v0.2-only SQL and excludes Claude/source rows", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bytesiren-v02-export-"));
  const inputJson = path.join(dir, "offline.json");
  const outputDir = path.join(dir, "import");
  const rowTime = "2026-06-15T00:00:00.000Z";
  const data = {
    range: { date_from: "2026-05-24", date_to: "2026-06-22" },
    source: {
      candle_count_by_symbol: { BTCUSDT: 1 },
    },
    rows: {
      signal_events_v02: [
        {
          id: "sig_1",
          date_utc: "2026-06-15",
          event_start: rowTime,
          event_end: rowTime,
          duration_min: 15,
          peak_time: rowTime,
          direction: "observed_up",
          signals_count: 5,
          n_tracked: 5,
          avg_change_pct: 1.2,
          avg_change_method: "median",
          event_strength_score: 80,
          impact_label: "High",
          chart_context_score: 90,
          chart_context_label: "Strong",
          event_story_type: "range_break_up",
          trend_context: "trend_up",
          momentum_context: "impulse",
          volatility_context: "expansion",
          event_range_context: "broad_broke_high",
          chart_context_reasons_json: "[]",
          chart_context_warnings_json: "[]",
          macro_aligned: 0,
          nearest_macro_event: null,
          macro_delta_min: null,
          source_route_hint: "broad_market",
          publish_candidate: 1,
          publish_reason: "test",
          suppress_reason: null,
          detector_version: "v02",
          created_at: rowTime,
          updated_at: rowTime,
        },
      ],
      signal_event_symbols_v02: [],
      audit_events_v02: [],
      market_stories_v02: [],
      market_story_members_v02: [],
      daily_overviews_v02: [],
      claude_briefs_v02: [{ id: "must_not_export" }],
      source_references_v02: [{ id: "must_not_export" }],
    },
  };

  await writeFile(inputJson, JSON.stringify(data));

  try {
    const manifest = await buildImportArtifacts({ inputJson, outputDir });
    const resetSql = await readFile(
      path.join(outputDir, "000_reset_v02.sql"),
      "utf8",
    );
    const signalSql = await readFile(
      path.join(outputDir, "001_signal_events_v02.sql"),
      "utf8",
    );
    const serializedManifest = JSON.stringify(manifest);

    assert.match(resetSql, /DELETE FROM claude_briefs_v02;/);
    assert.match(signalSql, /INSERT OR REPLACE INTO signal_events_v02/);
    assert.doesNotMatch(signalSql, /INSERT .*claude_briefs_v02/i);
    assert.doesNotMatch(signalSql, /INSERT .*source_references_v02/i);
    assert.equal(manifest.table_row_counts.signal_events_v02, 1);
    assert.equal(manifest.safety.no_claude_briefs_v02_import, true);
    assert.equal(serializedManifest.includes("must_not_export"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
