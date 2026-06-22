import type {
  MarketStoryMemberV02,
  MarketStorySourceEventV02,
  MarketStoryV02,
} from "../services/marketStoriesV02/index.ts";

interface SignalEventStoryRow {
  id: string;
  event_start: string;
  event_end: string;
  direction: string;
  avg_change_pct: number | null;
  signals_count: number | null;
  chart_context_score: number | null;
  chart_context_label: string | null;
  event_story_type: string | null;
  trend_context: string | null;
  momentum_context: string | null;
  volatility_context: string | null;
  event_range_context: string | null;
  publish_candidate: number;
  macro_aligned: number;
  suppress_reason: string | null;
}

interface AuditEventStoryRow {
  id: string;
  event_start: string;
  event_end: string;
  direction: string | null;
  avg_change_pct: number | null;
  signals_count: number | null;
  chart_context_score: number | null;
  chart_context_label: string | null;
  suppress_reason: string | null;
  evidence_json: string;
}

export interface MarketStoryV02WriteCounts {
  market_stories: number;
  market_story_members: number;
}

function changedRows(result: D1Result<unknown>): number {
  return typeof result.meta.changes === "number" ? result.meta.changes : 0;
}

function boolInt(value: boolean): number {
  return value ? 1 : 0;
}

const SQLITE_BIND_CHUNK_SIZE = 50;
const D1_BATCH_STATEMENT_CHUNK_SIZE = 25;

async function runStatementBatches(
  db: D1Database,
  statements: D1PreparedStatement[],
): Promise<number> {
  let affected = 0;

  for (
    let index = 0;
    index < statements.length;
    index += D1_BATCH_STATEMENT_CHUNK_SIZE
  ) {
    const results = await db.batch(
      statements.slice(index, index + D1_BATCH_STATEMENT_CHUNK_SIZE),
    );
    affected += results.reduce((sum, result) => sum + changedRows(result), 0);
  }

  return affected;
}

function safeJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stringField(
  object: Record<string, unknown>,
  key: string,
): string | null {
  const value = object[key];
  return typeof value === "string" ? value : null;
}

function signalRowToStoryEvent(
  row: SignalEventStoryRow,
): MarketStorySourceEventV02 {
  return {
    id: row.id,
    member_type: "signal_event_v02",
    event_start: row.event_start,
    event_end: row.event_end,
    direction:
      row.direction === "observed_down" ? "observed_down" : "observed_up",
    avg_change_pct: row.avg_change_pct,
    signals_count: row.signals_count,
    chart_context_score: row.chart_context_score,
    chart_context_label: row.chart_context_label,
    event_story_type: row.event_story_type,
    event_range_context: row.event_range_context,
    trend_context: row.trend_context,
    momentum_context: row.momentum_context,
    volatility_context: row.volatility_context,
    publish_candidate: row.publish_candidate === 1,
    macro_aligned: row.macro_aligned === 1,
    suppress_reason: row.suppress_reason,
  };
}

function auditRowToStoryEvent(
  row: AuditEventStoryRow,
): MarketStorySourceEventV02 {
  const evidence = safeJsonObject(row.evidence_json);
  return {
    id: row.id,
    member_type: "audit_event_v02",
    event_start: row.event_start,
    event_end: row.event_end,
    direction:
      row.direction === "observed_down"
        ? "observed_down"
        : row.direction === "mixed"
          ? "mixed"
          : "observed_up",
    avg_change_pct: row.avg_change_pct,
    signals_count: row.signals_count,
    chart_context_score: row.chart_context_score,
    chart_context_label: row.chart_context_label,
    event_story_type: stringField(evidence, "event_story_type"),
    event_range_context: stringField(evidence, "event_range_context"),
    trend_context: stringField(evidence, "trend_context"),
    momentum_context: stringField(evidence, "momentum_context"),
    volatility_context: stringField(evidence, "volatility_context"),
    publish_candidate: false,
    macro_aligned: false,
    suppress_reason: row.suppress_reason,
  };
}

export async function listSignalEventsV02ForStoryGeneration(
  db: D1Database,
): Promise<MarketStorySourceEventV02[]> {
  const rows = await db
    .prepare(
      `SELECT
        id,
        event_start,
        event_end,
        direction,
        avg_change_pct,
        signals_count,
        chart_context_score,
        chart_context_label,
        event_story_type,
        trend_context,
        momentum_context,
        volatility_context,
        event_range_context,
        publish_candidate,
        macro_aligned,
        suppress_reason
      FROM signal_events_v02
      ORDER BY event_start ASC`,
    )
    .all<SignalEventStoryRow>();

  return rows.results.map(signalRowToStoryEvent);
}

export async function listAuditEventsV02ForStoryGeneration(
  db: D1Database,
): Promise<MarketStorySourceEventV02[]> {
  const rows = await db
    .prepare(
      `SELECT
        id,
        event_start,
        event_end,
        direction,
        avg_change_pct,
        signals_count,
        chart_context_score,
        chart_context_label,
        suppress_reason,
        evidence_json
      FROM audit_events_v02
      ORDER BY event_start ASC`,
    )
    .all<AuditEventStoryRow>();

  return rows.results.map(auditRowToStoryEvent);
}

export async function upsertMarketStoriesV02(
  db: D1Database,
  stories: MarketStoryV02[],
): Promise<number> {
  if (stories.length === 0) {
    return 0;
  }

  const statements = stories.map((story) =>
    db
      .prepare(
        `INSERT INTO market_stories_v02 (
          id,
          date_utc,
          story_start,
          story_end,
          duration_min,
          story_label,
          story_family,
          direction,
          swing_change_pct,
          chart_context_score,
          range_context_json,
          trend_context_json,
          momentum_context_json,
          volatility_context_json,
          decision_reasons_json,
          included_signal_event_ids_json,
          included_audit_event_ids_json,
          publish_candidate,
          publish_reason,
          suppress_reason,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id)
        DO UPDATE SET
          date_utc = excluded.date_utc,
          story_start = excluded.story_start,
          story_end = excluded.story_end,
          duration_min = excluded.duration_min,
          story_label = excluded.story_label,
          story_family = excluded.story_family,
          direction = excluded.direction,
          swing_change_pct = excluded.swing_change_pct,
          chart_context_score = excluded.chart_context_score,
          range_context_json = excluded.range_context_json,
          trend_context_json = excluded.trend_context_json,
          momentum_context_json = excluded.momentum_context_json,
          volatility_context_json = excluded.volatility_context_json,
          decision_reasons_json = excluded.decision_reasons_json,
          included_signal_event_ids_json = excluded.included_signal_event_ids_json,
          included_audit_event_ids_json = excluded.included_audit_event_ids_json,
          publish_candidate = excluded.publish_candidate,
          publish_reason = excluded.publish_reason,
          suppress_reason = excluded.suppress_reason,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        story.id,
        story.date_utc,
        story.story_start,
        story.story_end,
        story.duration_min,
        story.story_label,
        story.story_family,
        story.direction,
        story.swing_change_pct,
        story.chart_context_score,
        story.range_context_json,
        story.trend_context_json,
        story.momentum_context_json,
        story.volatility_context_json,
        story.decision_reasons_json,
        story.included_signal_event_ids_json,
        story.included_audit_event_ids_json,
        boolInt(story.publish_candidate),
        story.publish_reason,
        story.suppress_reason,
      ),
  );

  return runStatementBatches(db, statements);
}

export async function replaceMarketStoryMembersV02(
  db: D1Database,
  storyId: string,
  members: MarketStoryMemberV02[],
): Promise<number> {
  const deleteResult = await db
    .prepare("DELETE FROM market_story_members_v02 WHERE market_story_id = ?")
    .bind(storyId)
    .run();

  if (members.length === 0) {
    return changedRows(deleteResult);
  }

  const insertStatements = members.map((member) =>
    db
      .prepare(
        `INSERT INTO market_story_members_v02 (
          id,
          market_story_id,
          member_type,
          member_id,
          display_order,
          role
        )
        VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        member.id,
        member.market_story_id,
        member.member_type,
        member.member_id,
        member.display_order,
        member.role,
      ),
  );

  return (
    changedRows(deleteResult) +
    (await runStatementBatches(db, insertStatements))
  );
}

async function deleteStoriesByIds(
  db: D1Database,
  storyIds: string[],
): Promise<void> {
  for (
    let index = 0;
    index < storyIds.length;
    index += SQLITE_BIND_CHUNK_SIZE
  ) {
    const chunk = storyIds.slice(index, index + SQLITE_BIND_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    await db
      .prepare(
        `DELETE FROM market_story_members_v02 WHERE market_story_id IN (${placeholders})`,
      )
      .bind(...chunk)
      .run();
    await db
      .prepare(`DELETE FROM market_stories_v02 WHERE id IN (${placeholders})`)
      .bind(...chunk)
      .run();
  }
}

async function pruneMarketStoryOutputV02(
  db: D1Database,
  stories: MarketStoryV02[],
): Promise<void> {
  if (stories.length === 0) {
    await db.prepare("DELETE FROM market_story_members_v02").run();
    await db.prepare("DELETE FROM market_stories_v02").run();
    return;
  }

  const keep = new Set(stories.map((story) => story.id));
  const existing = await db
    .prepare("SELECT id AS id FROM market_stories_v02")
    .all<{ id: string }>();
  const staleIds = (existing.results ?? [])
    .map((row) => row.id)
    .filter((id) => !keep.has(id));

  await deleteStoriesByIds(db, staleIds);
}

export async function upsertMarketStoryOutputV02(
  db: D1Database,
  output: {
    market_stories: MarketStoryV02[];
    market_story_members: MarketStoryMemberV02[];
  },
): Promise<MarketStoryV02WriteCounts> {
  await pruneMarketStoryOutputV02(db, output.market_stories);
  const stories = await upsertMarketStoriesV02(db, output.market_stories);
  let members = 0;

  for (const story of output.market_stories) {
    members += await replaceMarketStoryMembersV02(
      db,
      story.id,
      output.market_story_members.filter(
        (member) => member.market_story_id === story.id,
      ),
    );
  }

  return {
    market_stories: stories,
    market_story_members: members,
  };
}
