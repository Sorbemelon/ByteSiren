#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_INPUT_JSON = ".tmp/v02-phase-b2-offline-rebuild-data.json";
const DEFAULT_OUTPUT_DIR = ".tmp/v02-phase-b2-import";

export const TABLES = [
  {
    filename: "001_signal_events_v02.sql",
    name: "signal_events_v02",
    columns: [
      "id",
      "date_utc",
      "event_start",
      "event_end",
      "duration_min",
      "peak_time",
      "direction",
      "signals_count",
      "n_tracked",
      "avg_change_pct",
      "avg_change_method",
      "event_strength_score",
      "impact_label",
      "chart_context_score",
      "chart_context_label",
      "event_story_type",
      "trend_context",
      "momentum_context",
      "volatility_context",
      "event_range_context",
      "chart_context_reasons_json",
      "chart_context_warnings_json",
      "macro_aligned",
      "nearest_macro_event",
      "macro_delta_min",
      "source_route_hint",
      "publish_candidate",
      "publish_reason",
      "suppress_reason",
      "detector_version",
      "created_at",
      "updated_at",
      "direction_changed",
      "direction_history_json",
    ],
    defaults: {
      direction_changed: 0,
      direction_history_json: "[]",
    },
  },
  {
    filename: "002_signal_event_symbols_v02.sql",
    name: "signal_event_symbols_v02",
    columns: [
      "id",
      "signal_event_id",
      "symbol",
      "window_change_pct",
      "peak_15m_change_pct",
      "volume_ratio",
      "range_position",
      "prev_24h_high",
      "prev_24h_low",
      "range_break_direction",
      "range_break_pct",
      "range_break_strength",
      "distance_to_range_high_pct",
      "distance_to_range_low_pct",
      "is_lead_mover",
      "is_peak_15m_highlight",
      "participated",
      "evidence_json",
      "created_at",
      "updated_at",
    ],
  },
  {
    filename: "003_audit_events_v02.sql",
    name: "audit_events_v02",
    columns: [
      "id",
      "date_utc",
      "event_start",
      "event_end",
      "duration_min",
      "direction",
      "avg_change_pct",
      "signals_count",
      "n_tracked",
      "event_strength_score",
      "chart_context_score",
      "chart_context_label",
      "suppress_reason",
      "why_suppressed",
      "nearby_public_event_id",
      "detector_version",
      "evidence_json",
      "created_at",
      "updated_at",
    ],
  },
  {
    filename: "004_market_stories_v02.sql",
    name: "market_stories_v02",
    columns: [
      "id",
      "date_utc",
      "story_start",
      "story_end",
      "duration_min",
      "story_label",
      "story_family",
      "direction",
      "swing_change_pct",
      "chart_context_score",
      "range_context_json",
      "trend_context_json",
      "momentum_context_json",
      "volatility_context_json",
      "decision_reasons_json",
      "included_signal_event_ids_json",
      "included_audit_event_ids_json",
      "publish_candidate",
      "publish_reason",
      "suppress_reason",
      "created_at",
      "updated_at",
    ],
  },
  {
    filename: "005_market_story_members_v02.sql",
    name: "market_story_members_v02",
    columns: [
      "id",
      "market_story_id",
      "member_type",
      "member_id",
      "display_order",
      "role",
      "created_at",
    ],
  },
  {
    filename: "006_daily_overviews_v02.sql",
    name: "daily_overviews_v02",
    columns: [
      "id",
      "date_utc",
      "day_start",
      "day_end",
      "market_tone",
      "daily_change_pct",
      "daily_change_label",
      "market_range_pct",
      "notable_symbols_json",
      "top_symbol_moves_json",
      "signal_event_ids_json",
      "market_story_ids_json",
      "audit_event_count",
      "daily_chart_context_summary_json",
      "claude_status",
      "claude_brief_id",
      "created_at",
      "updated_at",
    ],
  },
];

export const RESET_SQL = [
  "DELETE FROM source_references_v02;",
  "DELETE FROM claude_briefs_v02;",
  "DELETE FROM market_story_members_v02;",
  "DELETE FROM market_stories_v02;",
  "DELETE FROM signal_event_symbols_v02;",
  "DELETE FROM signal_events_v02;",
  "DELETE FROM audit_events_v02;",
  "DELETE FROM daily_overviews_v02;",
  "",
].join("\n");

function readOption(argv, name) {
  const equalsPrefix = `${name}=`;
  const equalsValue = argv.find((item) => item.startsWith(equalsPrefix));

  if (equalsValue) {
    return equalsValue.slice(equalsPrefix.length);
  }

  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

export function sqlLiteral(value) {
  if (value === undefined || value === null) {
    return "NULL";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "NULL";
    }

    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

function rowsForTable(data, table) {
  return Array.isArray(data.rows?.[table.name]) ? data.rows[table.name] : [];
}

export function insertSql(table, rows) {
  if (rows.length === 0) {
    return `-- ${table.name}: 0 rows\n`;
  }

  const columnList = table.columns.join(", ");
  const statements = rows.map((row) => {
    const values = table.columns.map((column) =>
      sqlLiteral(row[column] ?? table.defaults?.[column] ?? null),
    );

    return `INSERT OR REPLACE INTO ${table.name} (${columnList}) VALUES (${values.join(", ")});`;
  });

  return `${statements.join("\n")}\n`;
}

export async function fileSha256(filePath) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex")
    .toUpperCase();
}

function validateSqlFileContent(filename, content) {
  const forbidden = [
    /\bDROP\s+TABLE\b/i,
    /\bDELETE\s+FROM\s+(?!source_references_v02|claude_briefs_v02|market_story_members_v02|market_stories_v02|signal_event_symbols_v02|signal_events_v02|audit_events_v02|daily_overviews_v02\b)[A-Za-z0-9_]+/i,
    /\bINSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+(?:claude_briefs_v02|source_references_v02|claude_briefs|source_references|market_candles|market_features|incidents|public_view_counts|job_runs)\b/i,
    /sk-ant-[A-Za-z0-9_-]+/,
    /github_pat_[A-Za-z0-9_]+/,
    /ghp_[A-Za-z0-9_]+/,
  ];

  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      throw new Error(`${filename} failed SQL safety validation: ${pattern}`);
    }
  }
}

export async function buildImportArtifacts(options) {
  const inputJson = options.inputJson ?? DEFAULT_INPUT_JSON;
  const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
  const data = JSON.parse(await readFile(inputJson, "utf8"));

  await mkdir(outputDir, { recursive: true });

  const files = [];
  const resetPath = path.join(outputDir, "000_reset_v02.sql");
  await writeFile(resetPath, RESET_SQL);
  validateSqlFileContent(path.basename(resetPath), RESET_SQL);
  files.push(resetPath);

  for (const table of TABLES) {
    const rows = rowsForTable(data, table);
    const filePath = path.join(outputDir, table.filename);
    const content = insertSql(table, rows);
    validateSqlFileContent(table.filename, content);
    await writeFile(filePath, content);
    files.push(filePath);
  }

  const manifestFiles = [];

  for (const filePath of files) {
    const stats = await stat(filePath);
    manifestFiles.push({
      path: filePath.replaceAll("\\", "/"),
      size_bytes: stats.size,
      sha256: await fileSha256(filePath),
    });
  }

  const rowCounts = Object.fromEntries(
    TABLES.map((table) => [table.name, rowsForTable(data, table).length]),
  );
  const manifest = {
    generated_at: new Date().toISOString(),
    source_rebuild_json: inputJson,
    source_range: data.range,
    source_symbols: Object.keys(data.source?.candle_count_by_symbol ?? {}),
    table_row_counts: rowCounts,
    excluded_tables: ["claude_briefs_v02", "source_references_v02"],
    safety: {
      reset_v02_tables_only: true,
      inserts_v02_deterministic_tables_only: true,
      no_claude_briefs_v02_import: true,
      no_source_references_v02_import: true,
      no_legacy_table_import: true,
    },
    files: manifestFiles,
  };

  await writeFile(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  return manifest;
}

export function parseExportArgs(argv = process.argv.slice(2)) {
  return {
    inputJson: readOption(argv, "--input-json") ?? DEFAULT_INPUT_JSON,
    outputDir: readOption(argv, "--output-dir") ?? DEFAULT_OUTPUT_DIR,
  };
}

async function main() {
  const manifest = await buildImportArtifacts(parseExportArgs());
  console.log(
    JSON.stringify({
      ok: true,
      output_dir: DEFAULT_OUTPUT_DIR,
      table_row_counts: manifest.table_row_counts,
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "export failed");
    process.exitCode = 1;
  });
}
