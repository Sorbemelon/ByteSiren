import {
  UI_LABEL_BY_CATALYST_STATUS,
  validateClaudeBrief,
  normalizedUrlKey,
  sourceLinksToPublicSources,
  type ClaudeSourceLink,
  type PublicFeedSource,
  type StoredClaudeBrief,
  type ValidatedClaudeBrief,
} from "../services/claude/index.ts";

interface ClaudeBriefRow {
  id: string;
  incident_id: string;
  analysis_mode: string;
  catalyst_status: string | null;
  ui_label: string;
  confidence: string | null;
  price_context_check: string | null;
  headline: string | null;
  summary: string;
  focused_catalyst_json: string | null;
  main_catalyst_json: string | null;
  broader_context_json: string;
  caveats_json: string;
  tags_json: string;
  source_quality_meta_json: string;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SourceReferenceRow {
  publisher: string;
  title: string;
  url: string;
  published_at: string | null;
  accessed_at: string | null;
  used_for: string;
  source_strength: string | null;
}

export interface ClaudeCleanupCounts {
  claude_briefs: number;
  source_references: number;
  claude_analysis_usage: number;
}

export interface ClaudeAnalysisUsage {
  usage_date: string;
  analysis_count: number;
  web_search_requests: number;
  updated_at: string | null;
}

interface ClaudeUsageRow {
  usage_date: string;
  analysis_count: number;
  web_search_requests: number;
  updated_at: string | null;
}

function changedRows(result: D1Result<unknown>): number {
  return typeof result.meta.changes === "number" ? result.meta.changes : 0;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function publicStatusForBrief(brief: ValidatedClaudeBrief) {
  if (
    brief.catalyst_status === "cause_supported" ||
    brief.catalyst_status === "cause_likely"
  ) {
    return "brief_ready";
  }

  return brief.catalyst_status;
}

function toStoredBrief(row: ClaudeBriefRow): StoredClaudeBrief {
  return {
    id: row.id,
    incident_id: row.incident_id,
    analysis_mode: row.analysis_mode as StoredClaudeBrief["analysis_mode"],
    catalyst_status:
      row.catalyst_status as StoredClaudeBrief["catalyst_status"],
    ui_label: row.ui_label,
    confidence: row.confidence as StoredClaudeBrief["confidence"],
    price_context_check:
      row.price_context_check as StoredClaudeBrief["price_context_check"],
    headline: row.headline,
    summary: row.summary,
    focused_catalyst: parseJson(
      row.focused_catalyst_json ?? row.main_catalyst_json,
      null,
    ),
    broader_context: parseJson<unknown[]>(row.broader_context_json, []),
    caveats: parseJson<string[]>(row.caveats_json, []),
    tags: parseJson<string[]>(row.tags_json, []),
    source_quality_meta: parseJson<Record<string, unknown>>(
      row.source_quality_meta_json,
      {},
    ),
    generated_at: row.generated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toSource(row: SourceReferenceRow): ClaudeSourceLink {
  return {
    publisher: row.publisher,
    title: row.title,
    url: row.url,
    published_at: row.published_at,
    accessed_at: row.accessed_at,
    used_for: row.used_for as ClaudeSourceLink["used_for"],
    source_strength:
      (row.source_strength as ClaudeSourceLink["source_strength"] | null) ??
      "acceptable",
  };
}

export async function upsertClaudeBrief(
  db: D1Database,
  brief: ValidatedClaudeBrief,
): Promise<string> {
  await db
    .prepare(
      `INSERT INTO claude_briefs (
        id,
        incident_id,
        analysis_mode,
        catalyst_status,
        ui_label,
        confidence,
        price_context_check,
        headline,
        summary,
        focused_catalyst_json,
        main_catalyst_json,
        broader_context_json,
        caveats_json,
        tags_json,
        source_quality_meta_json,
        generated_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(incident_id, analysis_mode)
      DO UPDATE SET
        catalyst_status = excluded.catalyst_status,
        ui_label = excluded.ui_label,
        confidence = excluded.confidence,
        price_context_check = excluded.price_context_check,
        headline = excluded.headline,
        summary = excluded.summary,
        focused_catalyst_json = excluded.focused_catalyst_json,
        main_catalyst_json = excluded.main_catalyst_json,
        broader_context_json = excluded.broader_context_json,
        caveats_json = excluded.caveats_json,
        tags_json = excluded.tags_json,
        source_quality_meta_json = excluded.source_quality_meta_json,
        generated_at = excluded.generated_at,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      brief.id,
      brief.incident_id,
      brief.analysis_mode,
      brief.catalyst_status,
      UI_LABEL_BY_CATALYST_STATUS[brief.catalyst_status],
      brief.confidence,
      brief.price_context_check,
      brief.headline,
      brief.brief_summary,
      JSON.stringify(brief.focused_catalyst),
      JSON.stringify(brief.focused_catalyst),
      JSON.stringify(brief.broader_context),
      JSON.stringify(brief.caveats),
      JSON.stringify(brief.tags),
      JSON.stringify(brief.source_quality_meta),
      brief.generated_at,
    )
    .run();

  const publicStatus = publicStatusForBrief(brief);

  await db
    .prepare(
      `UPDATE incidents
       SET status = ?,
           brief_status = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(publicStatus, publicStatus, brief.incident_id)
    .run();

  return brief.id;
}

export async function upsertAcceptedSourceReferences(
  db: D1Database,
  briefId: string,
  sources: ClaudeSourceLink[],
): Promise<number> {
  if (sources.length === 0) {
    return 0;
  }

  let affected = 0;

  for (const source of sources) {
    const result = await db
      .prepare(
        `INSERT INTO source_references (
          brief_id,
          publisher,
          title,
          url,
          normalized_url,
          published_at,
          accessed_at,
          used_for,
          source_strength
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(brief_id, normalized_url)
        DO UPDATE SET
          publisher = excluded.publisher,
          title = excluded.title,
          url = excluded.url,
          published_at = excluded.published_at,
          accessed_at = excluded.accessed_at,
          used_for = excluded.used_for,
          source_strength = excluded.source_strength`,
      )
      .bind(
        briefId,
        source.publisher,
        source.title,
        source.url,
        normalizedUrlKey(source.url),
        source.published_at,
        source.accessed_at ?? new Date().toISOString(),
        source.used_for,
        source.source_strength,
      )
      .run();

    affected += changedRows(result);
  }

  return affected;
}

export async function getBriefByIncidentId(
  db: D1Database,
  incidentId: string,
): Promise<StoredClaudeBrief | null> {
  const row = await db
    .prepare(
      `SELECT
        id,
        incident_id,
        analysis_mode,
        catalyst_status,
        ui_label,
        confidence,
        price_context_check,
        headline,
        summary,
        focused_catalyst_json,
        main_catalyst_json,
        broader_context_json,
        caveats_json,
        tags_json,
        source_quality_meta_json,
        generated_at,
        created_at,
        updated_at
       FROM claude_briefs
       WHERE incident_id = ?
       ORDER BY generated_at DESC, updated_at DESC
       LIMIT 1`,
    )
    .bind(incidentId)
    .first<ClaudeBriefRow>();

  return row ? toStoredBrief(row) : null;
}

export async function getAcceptedSourcesForBrief(
  db: D1Database,
  briefId: string,
): Promise<ClaudeSourceLink[]> {
  const result = await db
    .prepare(
      `SELECT
        publisher,
        title,
        url,
        published_at,
        accessed_at,
        used_for,
        source_strength
       FROM source_references
       WHERE brief_id = ?
       ORDER BY id ASC`,
    )
    .bind(briefId)
    .all<SourceReferenceRow>();

  return result.results.map(toSource);
}

export async function getPublicSourcesForBrief(
  db: D1Database,
  briefId: string,
): Promise<PublicFeedSource[]> {
  return sourceLinksToPublicSources(
    await getAcceptedSourcesForBrief(db, briefId),
  );
}

export async function markIncidentAnalysisLimited(
  db: D1Database,
  incidentId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE incidents
       SET status = 'analysis_limited',
           brief_status = 'analysis_limited',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(incidentId)
    .run();
}

export async function markIncidentEnriching(
  db: D1Database,
  incidentId: string,
  now = new Date(),
): Promise<void> {
  await db
    .prepare(
      `UPDATE incidents
       SET analysis_attempt_count = analysis_attempt_count + 1,
           analysis_last_attempt_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(now.toISOString(), incidentId)
    .run();
}

export async function markIncidentRetryable(
  db: D1Database,
  incidentId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE incidents
       SET status = ?,
           brief_status = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind("failed_retryable", "failed_retryable", incidentId)
    .run();
}

export async function getClaudeUsageForToday(
  db: D1Database,
  now = new Date(),
): Promise<ClaudeAnalysisUsage> {
  const usageDate = now.toISOString().slice(0, 10);
  const row = await db
    .prepare(
      `SELECT usage_date, analysis_count, web_search_requests, updated_at
       FROM claude_analysis_usage
       WHERE usage_date = ?`,
    )
    .bind(usageDate)
    .first<ClaudeUsageRow>();

  return {
    usage_date: usageDate,
    analysis_count: row?.analysis_count ?? 0,
    web_search_requests: row?.web_search_requests ?? 0,
    updated_at: row?.updated_at ?? null,
  };
}

export async function recordClaudeUsageForToday(
  db: D1Database,
  input: {
    analyses: number;
    webSearchRequests: number;
    now?: Date;
  },
): Promise<void> {
  const usageDate = (input.now ?? new Date()).toISOString().slice(0, 10);

  await db
    .prepare(
      `INSERT INTO claude_analysis_usage (
        usage_date,
        analysis_count,
        web_search_requests,
        updated_at
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(usage_date)
      DO UPDATE SET
        analysis_count = analysis_count + excluded.analysis_count,
        web_search_requests = web_search_requests + excluded.web_search_requests,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(usageDate, input.analyses, input.webSearchRequests)
    .run();
}

export async function cleanupClaudeDataOlderThan31Days(
  db: D1Database,
  cutoffIso: string,
): Promise<ClaudeCleanupCounts> {
  const usageCutoffDate = cutoffIso.slice(0, 10);
  const usageResult = await db
    .prepare(
      `DELETE FROM claude_analysis_usage
       WHERE usage_date < ?`,
    )
    .bind(usageCutoffDate)
    .run();
  const sourceResult = await db
    .prepare(
      `DELETE FROM source_references
       WHERE created_at < ?
          OR brief_id IN (
            SELECT id FROM claude_briefs
            WHERE COALESCE(generated_at, created_at) < ?
          )`,
    )
    .bind(cutoffIso, cutoffIso)
    .run();
  const briefResult = await db
    .prepare(
      `DELETE FROM claude_briefs
       WHERE COALESCE(generated_at, created_at) < ?`,
    )
    .bind(cutoffIso)
    .run();

  return {
    source_references: changedRows(sourceResult),
    claude_briefs: changedRows(briefResult),
    claude_analysis_usage: changedRows(usageResult),
  };
}

export async function persistClaudeFixtureBriefForTest(
  db: D1Database,
  fixture: unknown,
  options: { eventDate?: string; blockedDomains?: string[] } = {},
): Promise<ValidatedClaudeBrief> {
  const brief = validateClaudeBrief(fixture, options);

  await upsertClaudeBrief(db, brief);
  await upsertAcceptedSourceReferences(db, brief.id, brief.accepted_sources);

  return brief;
}
