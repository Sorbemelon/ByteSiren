import type {
  DailyOverviewMarketStoryContextV02,
  DailyOverviewV02Input,
} from "../services/dailyOverviewsV02/index.ts";

export interface DailyOverviewV02StoredRow {
  id: string;
  date_utc: string;
  day_start: string;
  day_end: string;
  market_tone: string | null;
  daily_change_pct: number | null;
  daily_change_label: string;
  market_range_pct: number | null;
  notable_symbols_json: string;
  top_symbol_moves_json: string;
  signal_event_ids_json: string;
  market_story_ids_json: string;
  audit_event_count: number;
  daily_chart_context_summary_json: string;
  claude_status: string;
  claude_brief_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CountRow {
  count: number;
}

function changedRows(result: D1Result<unknown>): number {
  return typeof result.meta.changes === "number" ? result.meta.changes : 0;
}

export async function getDailyOverviewV02ByDate(
  db: D1Database,
  dateUtc: string,
): Promise<DailyOverviewV02StoredRow | null> {
  return await db
    .prepare(
      `SELECT
        id,
        date_utc,
        day_start,
        day_end,
        market_tone,
        daily_change_pct,
        daily_change_label,
        market_range_pct,
        notable_symbols_json,
        top_symbol_moves_json,
        signal_event_ids_json,
        market_story_ids_json,
        audit_event_count,
        daily_chart_context_summary_json,
        claude_status,
        claude_brief_id,
        created_at,
        updated_at
       FROM daily_overviews_v02
       WHERE date_utc = ?
       LIMIT 1`,
    )
    .bind(dateUtc)
    .first<DailyOverviewV02StoredRow>();
}

export async function listDailyOverviewsV02(
  db: D1Database,
  limit = 50,
): Promise<DailyOverviewV02StoredRow[]> {
  const result = await db
    .prepare(
      `SELECT
        id,
        date_utc,
        day_start,
        day_end,
        market_tone,
        daily_change_pct,
        daily_change_label,
        market_range_pct,
        notable_symbols_json,
        top_symbol_moves_json,
        signal_event_ids_json,
        market_story_ids_json,
        audit_event_count,
        daily_chart_context_summary_json,
        claude_status,
        claude_brief_id,
        created_at,
        updated_at
       FROM daily_overviews_v02
       ORDER BY date_utc DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<DailyOverviewV02StoredRow>();

  return result.results;
}

export async function getDailyOverviewV02Counts(
  db: D1Database,
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM daily_overviews_v02")
    .first<CountRow>();

  return row?.count ?? 0;
}

export async function listPublishableSignalEventIdsV02ByDate(
  db: D1Database,
  dateUtc: string,
): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT id
       FROM signal_events_v02
       WHERE date_utc = ?
         AND publish_candidate = 1
       ORDER BY event_end DESC, event_start DESC, id ASC`,
    )
    .bind(dateUtc)
    .all<{ id: string }>();

  return result.results.map((row) => row.id);
}

export async function listPublishableMarketStoriesV02ByDate(
  db: D1Database,
  dateUtc: string,
): Promise<DailyOverviewMarketStoryContextV02[]> {
  const result = await db
    .prepare(
      `SELECT id, story_label
       FROM market_stories_v02
       WHERE date_utc = ?
         AND publish_candidate = 1
       ORDER BY story_end DESC, story_start DESC, id ASC`,
    )
    .bind(dateUtc)
    .all<DailyOverviewMarketStoryContextV02>();

  return result.results;
}

export async function countAuditEventsV02ByDate(
  db: D1Database,
  dateUtc: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM audit_events_v02
       WHERE date_utc = ?`,
    )
    .bind(dateUtc)
    .first<CountRow>();

  return row?.count ?? 0;
}

export async function upsertDailyOverviewsV02(
  db: D1Database,
  rows: DailyOverviewV02Input[],
): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  const statements = rows.map((row) =>
    db
      .prepare(
        `INSERT INTO daily_overviews_v02 (
          id,
          date_utc,
          day_start,
          day_end,
          market_tone,
          daily_change_pct,
          daily_change_label,
          market_range_pct,
          notable_symbols_json,
          top_symbol_moves_json,
          signal_event_ids_json,
          market_story_ids_json,
          audit_event_count,
          daily_chart_context_summary_json,
          claude_status,
          claude_brief_id,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(date_utc)
        DO UPDATE SET
          id = excluded.id,
          day_start = excluded.day_start,
          day_end = excluded.day_end,
          market_tone = excluded.market_tone,
          daily_change_pct = excluded.daily_change_pct,
          daily_change_label = excluded.daily_change_label,
          market_range_pct = excluded.market_range_pct,
          notable_symbols_json = excluded.notable_symbols_json,
          top_symbol_moves_json = excluded.top_symbol_moves_json,
          signal_event_ids_json = excluded.signal_event_ids_json,
          market_story_ids_json = excluded.market_story_ids_json,
          audit_event_count = excluded.audit_event_count,
          daily_chart_context_summary_json = excluded.daily_chart_context_summary_json,
          claude_status = excluded.claude_status,
          claude_brief_id = COALESCE(daily_overviews_v02.claude_brief_id, excluded.claude_brief_id),
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        row.id,
        row.date_utc,
        row.day_start,
        row.day_end,
        row.market_tone,
        row.daily_change_pct,
        row.daily_change_label,
        row.market_range_pct,
        row.notable_symbols_json,
        row.top_symbol_moves_json,
        row.signal_event_ids_json,
        row.market_story_ids_json,
        row.audit_event_count,
        row.daily_chart_context_summary_json,
        row.claude_status,
        row.claude_brief_id,
      ),
  );

  const results = await db.batch(statements);
  return results.reduce((sum, result) => sum + changedRows(result), 0);
}
