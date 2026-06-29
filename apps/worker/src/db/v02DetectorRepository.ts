import type {
  AuditEventV02,
  SignalEventSymbolV02,
  SignalEventV02,
} from "../services/detectorV02/index.ts";

export interface DetectorV02WriteCounts {
  signal_events: number;
  signal_event_symbols: number;
  audit_events: number;
}

export interface DetectorV02StoredCounts {
  signal_events: number;
  signal_event_symbols: number;
  audit_events: number;
}

export interface DetectorV02TableCounts {
  signal_events_v02: number;
  signal_event_symbols_v02: number;
  audit_events_v02: number;
  market_stories_v02: number;
  market_story_members_v02: number;
  daily_overviews_v02: number;
  claude_briefs_v02: number;
  source_references_v02: number;
}

function changedRows(result: D1Result<unknown>): number {
  return typeof result.meta.changes === "number" ? result.meta.changes : 0;
}

function boolInt(value: boolean): number {
  return value ? 1 : 0;
}

const SQLITE_BIND_CHUNK_SIZE = 50;
const D1_BATCH_STATEMENT_CHUNK_SIZE = 25;

export function signalEventStorageIdV02(
  event: Pick<SignalEventV02, "event_start" | "direction">,
): string {
  const stamp = event.event_start
    .replace(/[^0-9]/g, "")
    .slice(0, 14)
    .toLowerCase();
  const direction = event.direction === "observed_down" ? "down" : "up";

  return `signal_v02_${stamp}_${direction}`;
}

function signalEventForStorage(event: SignalEventV02): SignalEventV02 {
  const id = signalEventStorageIdV02(event);

  return {
    ...event,
    id,
    symbols: event.symbols.map((symbol) => ({
      ...symbol,
      id: `${id}_${symbol.symbol}`,
      signal_event_id: id,
    })),
  };
}

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

export async function upsertSignalEventsV02(
  db: D1Database,
  events: SignalEventV02[],
): Promise<number> {
  if (events.length === 0) {
    return 0;
  }

  const statements = events.map((event) =>
    db
      .prepare(
        `INSERT INTO signal_events_v02 (
          id,
          date_utc,
          event_start,
          event_end,
          duration_min,
          peak_time,
          direction,
          signals_count,
          n_tracked,
          avg_change_pct,
          avg_change_method,
          event_strength_score,
          impact_label,
          chart_context_score,
          chart_context_label,
          event_story_type,
          trend_context,
          momentum_context,
          volatility_context,
          event_range_context,
          chart_context_reasons_json,
          chart_context_warnings_json,
          macro_aligned,
          nearest_macro_event,
          macro_delta_min,
          source_route_hint,
          direction_changed,
          direction_history_json,
          publish_candidate,
          publish_reason,
          suppress_reason,
          detector_version,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id)
        DO UPDATE SET
          date_utc = excluded.date_utc,
          event_start = excluded.event_start,
          event_end = excluded.event_end,
          duration_min = excluded.duration_min,
          peak_time = excluded.peak_time,
          direction = excluded.direction,
          signals_count = excluded.signals_count,
          n_tracked = excluded.n_tracked,
          avg_change_pct = excluded.avg_change_pct,
          avg_change_method = excluded.avg_change_method,
          event_strength_score = excluded.event_strength_score,
          impact_label = excluded.impact_label,
          chart_context_score = excluded.chart_context_score,
          chart_context_label = excluded.chart_context_label,
          event_story_type = excluded.event_story_type,
          trend_context = excluded.trend_context,
          momentum_context = excluded.momentum_context,
          volatility_context = excluded.volatility_context,
          event_range_context = excluded.event_range_context,
          chart_context_reasons_json = excluded.chart_context_reasons_json,
          chart_context_warnings_json = excluded.chart_context_warnings_json,
          macro_aligned = excluded.macro_aligned,
          nearest_macro_event = excluded.nearest_macro_event,
          macro_delta_min = excluded.macro_delta_min,
          source_route_hint = excluded.source_route_hint,
          direction_changed = excluded.direction_changed,
          direction_history_json = excluded.direction_history_json,
          publish_candidate = excluded.publish_candidate,
          publish_reason = excluded.publish_reason,
          suppress_reason = excluded.suppress_reason,
          detector_version = excluded.detector_version,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        event.id,
        event.date_utc,
        event.event_start,
        event.event_end,
        event.duration_min,
        event.peak_time,
        event.direction,
        event.signals_count,
        event.n_tracked,
        event.avg_change_pct,
        event.avg_change_method,
        event.event_strength_score,
        event.impact_label,
        event.chart_context_score,
        event.chart_context_label,
        event.event_story_type,
        event.trend_context,
        event.momentum_context,
        event.volatility_context,
        event.event_range_context,
        event.chart_context_reasons_json,
        event.chart_context_warnings_json,
        boolInt(event.macro_aligned),
        event.nearest_macro_event,
        event.macro_delta_min,
        event.source_route_hint,
        boolInt(event.direction_changed),
        event.direction_history_json,
        boolInt(event.publish_candidate),
        event.publish_reason,
        event.suppress_reason,
        event.detector_version,
      ),
  );

  return runStatementBatches(db, statements);
}

export async function upsertSignalEventSymbolsV02(
  db: D1Database,
  symbols: SignalEventSymbolV02[],
): Promise<number> {
  if (symbols.length === 0) {
    return 0;
  }

  const statements = symbols.map((symbol) =>
    db
      .prepare(
        `INSERT INTO signal_event_symbols_v02 (
          id,
          signal_event_id,
          symbol,
          window_change_pct,
          peak_15m_change_pct,
          volume_ratio,
          range_position,
          prev_24h_high,
          prev_24h_low,
          range_break_direction,
          range_break_pct,
          range_break_strength,
          distance_to_range_high_pct,
          distance_to_range_low_pct,
          is_lead_mover,
          is_peak_15m_highlight,
          participated,
          evidence_json,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id)
        DO UPDATE SET
          signal_event_id = excluded.signal_event_id,
          symbol = excluded.symbol,
          window_change_pct = excluded.window_change_pct,
          peak_15m_change_pct = excluded.peak_15m_change_pct,
          volume_ratio = excluded.volume_ratio,
          range_position = excluded.range_position,
          prev_24h_high = excluded.prev_24h_high,
          prev_24h_low = excluded.prev_24h_low,
          range_break_direction = excluded.range_break_direction,
          range_break_pct = excluded.range_break_pct,
          range_break_strength = excluded.range_break_strength,
          distance_to_range_high_pct = excluded.distance_to_range_high_pct,
          distance_to_range_low_pct = excluded.distance_to_range_low_pct,
          is_lead_mover = excluded.is_lead_mover,
          is_peak_15m_highlight = excluded.is_peak_15m_highlight,
          participated = excluded.participated,
          evidence_json = excluded.evidence_json,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        symbol.id,
        symbol.signal_event_id,
        symbol.symbol,
        symbol.window_change_pct,
        symbol.peak_15m_change_pct,
        symbol.volume_ratio,
        symbol.range_position,
        symbol.prev_24h_high,
        symbol.prev_24h_low,
        symbol.range_break_direction,
        symbol.range_break_pct,
        symbol.range_break_strength,
        symbol.distance_to_range_high_pct,
        symbol.distance_to_range_low_pct,
        boolInt(symbol.is_lead_mover),
        boolInt(symbol.is_peak_15m_highlight),
        boolInt(symbol.participated),
        symbol.evidence_json,
      ),
  );

  return runStatementBatches(db, statements);
}

export async function upsertAuditEventsV02(
  db: D1Database,
  events: AuditEventV02[],
): Promise<number> {
  if (events.length === 0) {
    return 0;
  }

  const statements = events.map((event) =>
    db
      .prepare(
        `INSERT INTO audit_events_v02 (
          id,
          date_utc,
          event_start,
          event_end,
          duration_min,
          direction,
          avg_change_pct,
          signals_count,
          n_tracked,
          event_strength_score,
          chart_context_score,
          chart_context_label,
          suppress_reason,
          why_suppressed,
          nearby_public_event_id,
          detector_version,
          evidence_json,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id)
        DO UPDATE SET
          date_utc = excluded.date_utc,
          event_start = excluded.event_start,
          event_end = excluded.event_end,
          duration_min = excluded.duration_min,
          direction = excluded.direction,
          avg_change_pct = excluded.avg_change_pct,
          signals_count = excluded.signals_count,
          n_tracked = excluded.n_tracked,
          event_strength_score = excluded.event_strength_score,
          chart_context_score = excluded.chart_context_score,
          chart_context_label = excluded.chart_context_label,
          suppress_reason = excluded.suppress_reason,
          why_suppressed = excluded.why_suppressed,
          nearby_public_event_id = excluded.nearby_public_event_id,
          detector_version = excluded.detector_version,
          evidence_json = excluded.evidence_json,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        event.id,
        event.date_utc,
        event.event_start,
        event.event_end,
        event.duration_min,
        event.direction,
        event.avg_change_pct,
        event.signals_count,
        event.n_tracked,
        event.event_strength_score,
        event.chart_context_score,
        event.chart_context_label,
        event.suppress_reason,
        event.why_suppressed,
        event.nearby_public_event_id,
        event.detector_version,
        event.evidence_json,
      ),
  );

  return runStatementBatches(db, statements);
}

export async function upsertDetectorV02Output(
  db: D1Database,
  output: { signal_events: SignalEventV02[]; audit_events: AuditEventV02[] },
): Promise<DetectorV02WriteCounts> {
  const signalEventsForStorage = output.signal_events.map(
    signalEventForStorage,
  );
  const storageOutput = {
    signal_events: signalEventsForStorage,
    audit_events: output.audit_events,
  };

  await pruneDetectorV02Output(db, storageOutput);

  const signalEvents = await upsertSignalEventsV02(db, signalEventsForStorage);
  const signalSymbols = await upsertSignalEventSymbolsV02(
    db,
    signalEventsForStorage.flatMap((event) => event.symbols),
  );
  const auditEvents = await upsertAuditEventsV02(db, output.audit_events);

  return {
    signal_events: signalEvents,
    signal_event_symbols: signalSymbols,
    audit_events: auditEvents,
  };
}

export async function upsertDetectorV02OutputForRange(
  db: D1Database,
  output: { signal_events: SignalEventV02[]; audit_events: AuditEventV02[] },
  range: { startIso: string; endIso: string },
): Promise<DetectorV02WriteCounts> {
  const signalEventsForStorage = output.signal_events.map(
    signalEventForStorage,
  );
  const storageOutput = {
    signal_events: signalEventsForStorage,
    audit_events: output.audit_events,
  };

  await pruneDetectorV02OutputForRange(db, storageOutput, range);

  const signalEvents = await upsertSignalEventsV02(db, signalEventsForStorage);
  const signalSymbols = await upsertSignalEventSymbolsV02(
    db,
    signalEventsForStorage.flatMap((event) => event.symbols),
  );
  const auditEvents = await upsertAuditEventsV02(db, output.audit_events);

  return {
    signal_events: signalEvents,
    signal_event_symbols: signalSymbols,
    audit_events: auditEvents,
  };
}

async function deleteRowsNotIn(
  db: D1Database,
  table: string,
  idColumn: string,
  keepIds: string[],
): Promise<void> {
  if (keepIds.length === 0) {
    await db.prepare(`DELETE FROM ${table}`).run();
    return;
  }

  const keep = new Set(keepIds);
  const existing = await db
    .prepare(`SELECT ${idColumn} AS id FROM ${table}`)
    .all<{ id: string }>();
  const staleIds = (existing.results ?? [])
    .map((row) => row.id)
    .filter((id) => !keep.has(id));

  for (
    let index = 0;
    index < staleIds.length;
    index += SQLITE_BIND_CHUNK_SIZE
  ) {
    const chunk = staleIds.slice(index, index + SQLITE_BIND_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    await db
      .prepare(`DELETE FROM ${table} WHERE ${idColumn} IN (${placeholders})`)
      .bind(...chunk)
      .run();
  }
}

async function pruneDetectorV02Output(
  db: D1Database,
  output: { signal_events: SignalEventV02[]; audit_events: AuditEventV02[] },
): Promise<void> {
  const signalIds = output.signal_events.map((event) => event.id);
  const auditIds = output.audit_events.map((event) => event.id);
  const symbolIds = output.signal_events.flatMap((event) =>
    event.symbols.map((symbol) => symbol.id),
  );

  await deleteRowsNotIn(db, "signal_event_symbols_v02", "id", symbolIds);
  await deleteRowsNotIn(db, "signal_events_v02", "id", signalIds);
  await deleteRowsNotIn(db, "audit_events_v02", "id", auditIds);
}

async function idsOverlappingRange(
  db: D1Database,
  table: string,
  range: { startIso: string; endIso: string },
): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT id
       FROM ${table}
       WHERE event_end >= ? AND event_start <= ?`,
    )
    .bind(range.startIso, range.endIso)
    .all<{ id: string }>();

  return result.results.map((row) => row.id);
}

export async function listSignalEventIdsV02ForRange(
  db: D1Database,
  range: { startIso: string; endIso: string },
  limit = 50,
): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT id
       FROM signal_events_v02
       WHERE event_end >= ? AND event_start <= ?
       ORDER BY event_start ASC, id ASC
       LIMIT ?`,
    )
    .bind(range.startIso, range.endIso, Math.max(1, Math.trunc(limit)))
    .all<{ id: string }>();

  return result.results.map((row) => row.id);
}

export async function getDetectorV02TableCounts(
  db: D1Database,
): Promise<DetectorV02TableCounts> {
  const row = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM signal_events_v02) AS signal_events_v02,
        (SELECT COUNT(*) FROM signal_event_symbols_v02) AS signal_event_symbols_v02,
        (SELECT COUNT(*) FROM audit_events_v02) AS audit_events_v02,
        (SELECT COUNT(*) FROM market_stories_v02) AS market_stories_v02,
        (SELECT COUNT(*) FROM market_story_members_v02) AS market_story_members_v02,
        (SELECT COUNT(*) FROM daily_overviews_v02) AS daily_overviews_v02,
        (SELECT COUNT(*) FROM claude_briefs_v02) AS claude_briefs_v02,
        (SELECT COUNT(*) FROM source_references_v02) AS source_references_v02`,
    )
    .first<DetectorV02TableCounts>();

  return {
    signal_events_v02: row?.signal_events_v02 ?? 0,
    signal_event_symbols_v02: row?.signal_event_symbols_v02 ?? 0,
    audit_events_v02: row?.audit_events_v02 ?? 0,
    market_stories_v02: row?.market_stories_v02 ?? 0,
    market_story_members_v02: row?.market_story_members_v02 ?? 0,
    daily_overviews_v02: row?.daily_overviews_v02 ?? 0,
    claude_briefs_v02: row?.claude_briefs_v02 ?? 0,
    source_references_v02: row?.source_references_v02 ?? 0,
  };
}

async function deleteSignalSymbolsForEvents(
  db: D1Database,
  signalEventIds: string[],
): Promise<void> {
  for (
    let index = 0;
    index < signalEventIds.length;
    index += SQLITE_BIND_CHUNK_SIZE
  ) {
    const chunk = signalEventIds.slice(index, index + SQLITE_BIND_CHUNK_SIZE);

    if (chunk.length === 0) {
      continue;
    }

    const placeholders = chunk.map(() => "?").join(", ");
    await db
      .prepare(
        `DELETE FROM signal_event_symbols_v02 WHERE signal_event_id IN (${placeholders})`,
      )
      .bind(...chunk)
      .run();
  }
}

async function deleteRowsByIds(
  db: D1Database,
  table: string,
  idColumn: string,
  ids: string[],
): Promise<void> {
  for (let index = 0; index < ids.length; index += SQLITE_BIND_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + SQLITE_BIND_CHUNK_SIZE);

    if (chunk.length === 0) {
      continue;
    }

    const placeholders = chunk.map(() => "?").join(", ");
    await db
      .prepare(`DELETE FROM ${table} WHERE ${idColumn} IN (${placeholders})`)
      .bind(...chunk)
      .run();
  }
}

async function listProtectedSignalEventIds(
  db: D1Database,
  ids: string[],
): Promise<Set<string>> {
  const protectedIds = new Set<string>();

  for (let index = 0; index < ids.length; index += SQLITE_BIND_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + SQLITE_BIND_CHUNK_SIZE);

    if (chunk.length === 0) {
      continue;
    }

    const placeholders = chunk.map(() => "?").join(", ");
    const result = await db
      .prepare(
        `SELECT DISTINCT id
         FROM (
           SELECT id
           FROM signal_events_v02
           WHERE id IN (${placeholders})
             AND publish_candidate = 1

           UNION

           SELECT target_id AS id
           FROM claude_briefs_v02
           WHERE target_type = 'signal_event_v02'
             AND target_id IN (${placeholders})

           UNION

           SELECT target_id AS id
           FROM source_references_v02
           WHERE target_type = 'signal_event_v02'
             AND target_id IN (${placeholders})
         )`,
      )
      .bind(...chunk, ...chunk, ...chunk)
      .all<{ id: string }>();

    for (const row of result.results ?? []) {
      protectedIds.add(row.id);
    }
  }

  return protectedIds;
}

async function pruneDetectorV02OutputForRange(
  db: D1Database,
  output: { signal_events: SignalEventV02[]; audit_events: AuditEventV02[] },
  range: { startIso: string; endIso: string },
): Promise<void> {
  const signalIds = new Set(output.signal_events.map((event) => event.id));
  const auditIds = new Set(output.audit_events.map((event) => event.id));
  const existingSignalIds = await idsOverlappingRange(
    db,
    "signal_events_v02",
    range,
  );
  const existingAuditIds = await idsOverlappingRange(
    db,
    "audit_events_v02",
    range,
  );
  const staleSignalIds = existingSignalIds.filter((id) => !signalIds.has(id));
  const staleAuditIds = existingAuditIds.filter((id) => !auditIds.has(id));
  const protectedSignalIds = await listProtectedSignalEventIds(
    db,
    staleSignalIds,
  );
  const deletableStaleSignalIds = staleSignalIds.filter(
    (id) => !protectedSignalIds.has(id),
  );

  await deleteSignalSymbolsForEvents(db, deletableStaleSignalIds);
  await deleteRowsByIds(db, "signal_events_v02", "id", deletableStaleSignalIds);
  await deleteRowsByIds(db, "audit_events_v02", "id", staleAuditIds);
}
