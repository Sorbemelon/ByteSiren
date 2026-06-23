import type {
  ClaudePromptModeV02,
  ClaudeTargetTypeV02,
} from "../services/claudeV02/index.ts";
import type { SourceReferenceInputV02 } from "../services/claudeV02/sourcePolicy.ts";

export interface ClaudeBriefV02Input {
  id?: string;
  target_type: ClaudeTargetTypeV02;
  target_id: string;
  prompt_mode: ClaudePromptModeV02;
  status?: string;
  public_label?: string | null;
  classification?: string | null;
  confidence?: string | null;
  headline?: string | null;
  collapsed_summary?: string | null;
  context_details?: string | null;
  source_support?: string | null;
  source_timing_alignment?: string | null;
  validation_flags?: Record<string, unknown>;
  detector_feedback?: Record<string, unknown>;
  prompt_version?: string | null;
  model?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
  force?: boolean;
}

export interface ClaudeBriefV02Row {
  id: string;
  target_type: ClaudeTargetTypeV02;
  target_id: string;
  prompt_mode: ClaudePromptModeV02;
  status: string;
  public_label: string | null;
  classification: string | null;
  confidence: string | null;
  headline: string | null;
  collapsed_summary: string | null;
  context_details: string | null;
  source_support: string | null;
  source_timing_alignment: string | null;
  validation_flags_json: string;
  detector_feedback_json: string;
  prompt_version: string | null;
  model: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceReferenceV02Row {
  id: string;
  target_type: ClaudeTargetTypeV02;
  target_id: string;
  brief_id: string | null;
  brief_v02_id: string | null;
  source_role: string;
  source_strength: string | null;
  publisher: string | null;
  title: string | null;
  url: string;
  published_at: string | null;
  used_for: string | null;
  accepted: number;
  rejection_reason: string | null;
  metadata_json: string;
  created_at: string;
}

export const TERMINAL_CLAUDE_BRIEF_STATUSES_V02 = new Set([
  "brief_ready",
  "context_only",
  "no_clear_cause",
  "no_major_driver",
  "claude_limited",
  "failed_terminal",
]);

export const RETRYABLE_CLAUDE_BRIEF_STATUSES_V02 = new Set([
  "queued_for_analysis",
  "failed_retryable",
]);

export type ClaudeBriefClaimV02Result =
  | {
      claimed: true;
      row: ClaudeBriefV02Row;
      skipped_reason: null;
    }
  | {
      claimed: false;
      row: ClaudeBriefV02Row;
      skipped_reason: "terminal_status" | "processing";
    };

function assertClaudeTarget(
  targetType: string,
): asserts targetType is ClaudeTargetTypeV02 {
  if (
    targetType !== "signal_event_v02" &&
    targetType !== "daily_overview_v02"
  ) {
    throw new Error(`Unsupported v0.2 Claude target: ${targetType}`);
  }
}

function assertPromptMatchesTarget(
  targetType: ClaudeTargetTypeV02,
  promptMode: ClaudePromptModeV02,
) {
  if (
    (targetType === "signal_event_v02" && promptMode !== "signal_event") ||
    (targetType === "daily_overview_v02" && promptMode !== "daily_overview")
  ) {
    throw new Error(
      `prompt_mode ${promptMode} does not match target_type ${targetType}`,
    );
  }
}

function safeJson(value: Record<string, unknown> | undefined): string {
  return JSON.stringify(value ?? {});
}

export function isTerminalClaudeBriefStatusV02(status: string): boolean {
  return TERMINAL_CLAUDE_BRIEF_STATUSES_V02.has(status);
}

export function isSelectableClaudeBriefV02(
  row: ClaudeBriefV02Row | null,
): boolean {
  return !row || RETRYABLE_CLAUDE_BRIEF_STATUSES_V02.has(row.status);
}

function idSafe(value: string): string {
  return value.replace(/[^a-zA-Z0-9_:-]/g, "_").slice(0, 96);
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(36);
}

function claudeBriefId(input: {
  target_type: ClaudeTargetTypeV02;
  target_id: string;
  prompt_mode: ClaudePromptModeV02;
}) {
  return `claude_v02_${input.prompt_mode}_${idSafe(input.target_id)}`;
}

function sourceReferenceId(source: SourceReferenceInputV02): string {
  return `src_v02_${idSafe(source.target_id)}_${shortHash(
    `${source.target_type}|${source.target_id}|${source.source_role}|${source.url}`,
  )}`;
}

function rowFromBriefInput(
  input: ClaudeBriefV02Input,
  id: string,
  existing: ClaudeBriefV02Row | null,
): ClaudeBriefV02Row {
  const now = input.updated_at ?? new Date().toISOString();
  return {
    id,
    target_type: input.target_type,
    target_id: input.target_id,
    prompt_mode: input.prompt_mode,
    status: input.status ?? "queued_for_analysis",
    public_label: input.public_label ?? null,
    classification: input.classification ?? null,
    confidence: input.confidence ?? null,
    headline: input.headline ?? null,
    collapsed_summary: input.collapsed_summary ?? null,
    context_details: input.context_details ?? null,
    source_support: input.source_support ?? null,
    source_timing_alignment: input.source_timing_alignment ?? null,
    validation_flags_json: safeJson(input.validation_flags),
    detector_feedback_json: safeJson(input.detector_feedback),
    prompt_version: input.prompt_version ?? null,
    model: input.model ?? null,
    error_code: input.error_code ?? null,
    error_message: input.error_message ?? null,
    created_at: existing?.created_at ?? input.created_at ?? now,
    updated_at: now,
  };
}

export async function getClaudeBriefV02ByTarget(
  db: D1Database,
  targetType: ClaudeTargetTypeV02,
  targetId: string,
  promptMode?: ClaudePromptModeV02,
): Promise<ClaudeBriefV02Row | null> {
  assertClaudeTarget(targetType);

  if (promptMode) {
    assertPromptMatchesTarget(targetType, promptMode);
  }

  const promptClause = promptMode ? "AND prompt_mode = ?" : "";
  const statement = db.prepare(
    `SELECT
      id,
      target_type,
      target_id,
      prompt_mode,
      status,
      public_label,
      classification,
      confidence,
      headline,
      collapsed_summary,
      context_details,
      source_support,
      source_timing_alignment,
      validation_flags_json,
      detector_feedback_json,
      prompt_version,
      model,
      error_code,
      error_message,
      created_at,
      updated_at
     FROM claude_briefs_v02
     WHERE target_type = ?
       AND target_id = ?
       ${promptClause}
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
  );

  return promptMode
    ? await statement
        .bind(targetType, targetId, promptMode)
        .first<ClaudeBriefV02Row>()
    : await statement.bind(targetType, targetId).first<ClaudeBriefV02Row>();
}

export async function listClaudeBriefsV02ByStatus(
  db: D1Database,
  status: string,
  limit = 50,
): Promise<ClaudeBriefV02Row[]> {
  const rows = await db
    .prepare(
      `SELECT
        id,
        target_type,
        target_id,
        prompt_mode,
        status,
        public_label,
        classification,
        confidence,
        headline,
        collapsed_summary,
        context_details,
        source_support,
        source_timing_alignment,
        validation_flags_json,
        detector_feedback_json,
        prompt_version,
        model,
        error_code,
        error_message,
        created_at,
        updated_at
       FROM claude_briefs_v02
       WHERE status = ?
       ORDER BY updated_at ASC, created_at ASC
       LIMIT ?`,
    )
    .bind(status, limit)
    .all<ClaudeBriefV02Row>();

  return rows.results;
}

export async function upsertClaudeBriefV02(
  db: D1Database,
  input: ClaudeBriefV02Input,
): Promise<ClaudeBriefV02Row> {
  assertClaudeTarget(input.target_type);
  assertPromptMatchesTarget(input.target_type, input.prompt_mode);

  const existing = await getClaudeBriefV02ByTarget(
    db,
    input.target_type,
    input.target_id,
    input.prompt_mode,
  );
  const id =
    input.id ??
    existing?.id ??
    claudeBriefId({
      target_type: input.target_type,
      target_id: input.target_id,
      prompt_mode: input.prompt_mode,
    });

  if (
    existing &&
    !input.force &&
    isTerminalClaudeBriefStatusV02(existing.status)
  ) {
    return existing;
  }

  const row = rowFromBriefInput(input, id, existing);

  await db
    .prepare(
      `INSERT INTO claude_briefs_v02 (
        id,
        target_type,
        target_id,
        prompt_mode,
        status,
        public_label,
        classification,
        confidence,
        headline,
        collapsed_summary,
        context_details,
        source_support,
        source_timing_alignment,
        validation_flags_json,
        detector_feedback_json,
        prompt_version,
        model,
        error_code,
        error_message,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id)
      DO UPDATE SET
        target_type = excluded.target_type,
        target_id = excluded.target_id,
        prompt_mode = excluded.prompt_mode,
        status = excluded.status,
        public_label = excluded.public_label,
        classification = excluded.classification,
        confidence = excluded.confidence,
        headline = excluded.headline,
        collapsed_summary = excluded.collapsed_summary,
        context_details = excluded.context_details,
        source_support = excluded.source_support,
        source_timing_alignment = excluded.source_timing_alignment,
        validation_flags_json = excluded.validation_flags_json,
        detector_feedback_json = excluded.detector_feedback_json,
        prompt_version = excluded.prompt_version,
        model = excluded.model,
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        updated_at = excluded.updated_at`,
    )
    .bind(
      row.id,
      row.target_type,
      row.target_id,
      row.prompt_mode,
      row.status,
      row.public_label,
      row.classification,
      row.confidence,
      row.headline,
      row.collapsed_summary,
      row.context_details,
      row.source_support,
      row.source_timing_alignment,
      row.validation_flags_json,
      row.detector_feedback_json,
      row.prompt_version,
      row.model,
      row.error_code,
      row.error_message,
      row.created_at,
      row.updated_at,
    )
    .run();

  return row;
}

export async function claimClaudeBriefV02Target(
  db: D1Database,
  input: {
    target_type: ClaudeTargetTypeV02;
    target_id: string;
    prompt_mode: ClaudePromptModeV02;
    prompt_version?: string | null;
    model?: string | null;
    updated_at?: string;
  },
): Promise<ClaudeBriefClaimV02Result> {
  const existing = await getClaudeBriefV02ByTarget(
    db,
    input.target_type,
    input.target_id,
    input.prompt_mode,
  );

  if (existing && isTerminalClaudeBriefStatusV02(existing.status)) {
    return {
      claimed: false,
      row: existing,
      skipped_reason: "terminal_status",
    };
  }

  if (existing?.status === "processing") {
    return {
      claimed: false,
      row: existing,
      skipped_reason: "processing",
    };
  }

  const row = await upsertClaudeBriefV02(db, {
    target_type: input.target_type,
    target_id: input.target_id,
    prompt_mode: input.prompt_mode,
    status: "processing",
    prompt_version: input.prompt_version,
    model: input.model,
    updated_at: input.updated_at,
  });

  return {
    claimed: true,
    row,
    skipped_reason: null,
  };
}

export async function updateClaudeBriefV02Status(
  db: D1Database,
  id: string,
  input: {
    status: string;
    error_code?: string | null;
    error_message?: string | null;
    updated_at?: string;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE claude_briefs_v02
       SET status = ?,
           error_code = ?,
           error_message = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      input.status,
      input.error_code ?? null,
      input.error_message ?? null,
      input.updated_at ?? new Date().toISOString(),
      id,
    )
    .run();
}

export async function upsertSourceReferencesV02(
  db: D1Database,
  sources: SourceReferenceInputV02[],
): Promise<number> {
  if (sources.length === 0) {
    return 0;
  }

  const statements = sources.map((source) => {
    assertClaudeTarget(source.target_type);

    return db
      .prepare(
        `INSERT INTO source_references_v02 (
          id,
          target_type,
          target_id,
          brief_id,
          brief_v02_id,
          source_role,
          source_strength,
          publisher,
          title,
          url,
          published_at,
          used_for,
          accepted,
          rejection_reason,
          metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id)
        DO UPDATE SET
          target_type = excluded.target_type,
          target_id = excluded.target_id,
          brief_id = excluded.brief_id,
          brief_v02_id = excluded.brief_v02_id,
          source_role = excluded.source_role,
          source_strength = excluded.source_strength,
          publisher = excluded.publisher,
          title = excluded.title,
          url = excluded.url,
          published_at = excluded.published_at,
          used_for = excluded.used_for,
          accepted = excluded.accepted,
          rejection_reason = excluded.rejection_reason,
          metadata_json = excluded.metadata_json`,
      )
      .bind(
        sourceReferenceId(source),
        source.target_type,
        source.target_id,
        null,
        source.brief_id,
        source.source_role,
        source.source_strength,
        source.publisher,
        source.title,
        source.url,
        source.published_at,
        source.used_for,
        source.accepted ? 1 : 0,
        source.rejection_reason,
        JSON.stringify(source.metadata),
      );
  });
  const results = await db.batch(statements);

  return results.reduce(
    (total, result) =>
      total +
      (typeof result.meta.changes === "number" ? result.meta.changes : 0),
    0,
  );
}

export async function listAcceptedSourceReferencesV02ByTarget(
  db: D1Database,
  targetType: ClaudeTargetTypeV02,
  targetId: string,
): Promise<SourceReferenceV02Row[]> {
  assertClaudeTarget(targetType);

  const rows = await db
    .prepare(
      `SELECT
        id,
        target_type,
        target_id,
        brief_id,
        brief_v02_id,
        source_role,
        source_strength,
        publisher,
        title,
        url,
        published_at,
        used_for,
        accepted,
        rejection_reason,
        metadata_json,
        created_at
       FROM source_references_v02
       WHERE target_type = ?
         AND target_id = ?
         AND accepted = 1
       ORDER BY created_at ASC, id ASC`,
    )
    .bind(targetType, targetId)
    .all<SourceReferenceV02Row>();

  return rows.results;
}
