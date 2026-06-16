import { ALLOWED_SYMBOLS, VISIBLE_RANGE_DAYS, isoDaysAgo } from "../config.ts";
import {
  getAcceptedSourcesForBrief,
  getBriefByIncidentId,
} from "./claudeRepository.ts";
import {
  analysisLimitedFeedBrief,
  queuedFeedBrief,
  sourceLinksToPublicSources,
  storedBriefToFeedBrief,
  type PublicFeedBrief,
  type PublicFeedSource,
  type StoredClaudeBrief,
  type ClaudeSourceLink,
} from "../services/claude/index.ts";
import type {
  IncidentCandidate,
  MarketTier,
  QueryHints,
  SymbolEvidence,
} from "../services/detector/index.ts";

const UTC_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const TERMINAL_BRIEF_STATUSES = [
  "analysis_limited",
  "brief_ready",
  "context_only",
  "none_found",
] as const;

export interface IncidentRow {
  id: string;
  incident_key: string;
  macro_day_cache_key: string;
  scope: "market_wide" | "market_day";
  direction: "observed_up" | "observed_down" | "two_sided";
  started_at: string;
  ended_at: string | null;
  signal_window: "15m";
  baseline_window: "24h";
  headline_severity: number;
  severity_label: string;
  breadth_count: number;
  breadth_label: string;
  symbols_json: string;
  tags_json: string;
  sub_events_json: string;
  symbol_evidence_json: string;
  query_hints_json: string;
  status: string;
  brief_status: string;
  created_at: string;
  updated_at: string;
}

export interface FeedItem {
  incident_id: string;
  incident_key: string;
  detected_at: string;
  started_at: string;
  ended_at: string | null;
  display_date: string;
  scope: IncidentRow["scope"];
  direction: IncidentRow["direction"];
  evidence: {
    signal_window: "15m";
    baseline_window: "24h";
    evidence_summary: string;
    summary: string;
    breadth_label: string;
    severity_score: number;
    severity_label: string;
    avg_15m_change_pct: number | null;
    peak_symbol: string | null;
  };
  symbols: string[];
  symbol_evidence: SymbolEvidence[];
  brief: PublicFeedBrief;
  sources: PublicFeedSource[];
  tags: string[];
  has_details: true;
  expanded_details: {
    symbol_evidence: SymbolEvidence[];
    claude_context: Record<string, unknown>;
    caveats: string[];
  };
}

export interface FeedResponseBody {
  ok: true;
  updated_at: string;
  range_days: number;
  signal_window: "15m";
  baseline_window: "24h";
  items: FeedItem[];
}

function changedRows(result: D1Result<unknown>): number {
  return typeof result.meta.changes === "number" ? result.meta.changes : 0;
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function roundNumber(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(4));
}

export function severityLabelForTier(tier: MarketTier): string {
  if (tier === "severe") {
    return "Strong Move";
  }

  if (tier === "normal") {
    return "Calm";
  }

  return "Moving";
}

function displayDate(iso: string): string {
  const date = new Date(iso);

  if (!Number.isFinite(date.getTime())) {
    return iso.slice(0, 10);
  }

  return `${UTC_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function macroDayCacheKey(candidate: IncidentCandidate): string {
  const date = candidate.started_at.slice(0, 10);
  const directionPart =
    candidate.scope === "market_day" ? "two_sided" : candidate.direction;
  const symbolPart = candidate.symbols
    .map((symbol) => symbol.replace("USDT", "").toLowerCase())
    .join("-");

  return `${date}_${candidate.scope}_${directionPart}_${symbolPart}`;
}

function tagsForCandidate(candidate: IncidentCandidate): string[] {
  const tags = ["same_day_context"];

  if (candidate.scope === "market_day") {
    tags.push("two_sided_market_day");
  }

  return tags;
}

function candidateSymbols(candidate: IncidentCandidate): string[] {
  return [...candidate.symbols].sort((a, b) => a.localeCompare(b));
}

function averageIncludedChange(evidence: SymbolEvidence[]): number | null {
  const changes = evidence
    .filter((item) => item.included_in_event)
    .map((item) => item.change_15m_pct)
    .filter((value): value is number => value !== null);

  if (changes.length === 0) {
    return null;
  }

  return roundNumber(
    changes.reduce((sum, value) => sum + value, 0) / changes.length,
  );
}

function peakSymbol(evidence: SymbolEvidence[]): string | null {
  const included = evidence.filter((item) => item.included_in_event);

  if (included.length === 0) {
    return null;
  }

  return included.reduce((peak, item) =>
    item.severity_score > peak.severity_score ? item : peak,
  ).symbol;
}

function displayDirection(direction: IncidentRow["direction"]): string {
  if (direction === "observed_up") {
    return "Observed Up";
  }

  if (direction === "observed_down") {
    return "Observed Down";
  }

  return "Two-sided";
}

function evidenceSummary(input: {
  signalWindow: "15m";
  breadthLabel: string;
  direction: IncidentRow["direction"];
  severityLabel: string;
  severityScore: number;
}): string {
  return `${input.signalWindow} signal | ${input.breadthLabel} | ${displayDirection(input.direction)} | ${input.severityLabel} ${input.severityScore}`;
}

function ensureAllSymbolEvidence(evidence: SymbolEvidence[]): SymbolEvidence[] {
  const bySymbol = new Map(evidence.map((item) => [item.symbol, item]));

  return ALLOWED_SYMBOLS.map((symbol) => {
    const existing = bySymbol.get(symbol);

    if (existing) {
      return existing;
    }

    return {
      symbol,
      included_in_event: false,
      direction: "flat",
      signal_window: "15m",
      baseline_window: "24h",
      change_15m_pct: null,
      price_z: null,
      volume_ratio: null,
      volatility_ratio: null,
      severity_score: 0,
    };
  });
}

export function incidentRowToFeedItem(row: IncidentRow): FeedItem {
  return incidentRowToFeedItemWithBrief(row, null, []);
}

export function incidentRowToFeedItemWithBrief(
  row: IncidentRow,
  brief: StoredClaudeBrief | null,
  acceptedSources: ClaudeSourceLink[],
): FeedItem {
  const symbols = parseJsonArray<string>(row.symbols_json);
  const incidentTags = parseJsonArray<string>(row.tags_json);
  const symbolEvidence = ensureAllSymbolEvidence(
    parseJsonArray<SymbolEvidence>(row.symbol_evidence_json),
  );
  const severityScore = roundNumber(row.headline_severity) ?? 0;
  const summary = evidenceSummary({
    signalWindow: row.signal_window,
    breadthLabel: row.breadth_label,
    direction: row.direction,
    severityLabel: row.severity_label,
    severityScore,
  });
  const publicBrief = brief
    ? storedBriefToFeedBrief(brief)
    : row.status === "analysis_limited" ||
        row.brief_status === "analysis_limited"
      ? analysisLimitedFeedBrief()
      : queuedFeedBrief();
  const briefTags = brief?.tags ?? [];
  const tags = [...new Set([...incidentTags, ...briefTags])];
  const publicSources = brief
    ? sourceLinksToPublicSources(acceptedSources)
    : [];

  return {
    incident_id: row.id,
    incident_key: row.incident_key,
    detected_at: row.started_at,
    started_at: row.started_at,
    ended_at: row.ended_at,
    display_date: displayDate(row.started_at),
    scope: row.scope,
    direction: row.direction,
    evidence: {
      signal_window: row.signal_window,
      baseline_window: row.baseline_window,
      evidence_summary: summary,
      summary,
      breadth_label: row.breadth_label,
      severity_score: severityScore,
      severity_label: row.severity_label,
      avg_15m_change_pct: averageIncludedChange(symbolEvidence),
      peak_symbol: peakSymbol(symbolEvidence),
    },
    symbols,
    symbol_evidence: symbolEvidence,
    brief: publicBrief,
    sources: publicSources,
    tags,
    has_details: true,
    expanded_details: {
      symbol_evidence: symbolEvidence,
      claude_context: brief
        ? {
            headline: brief.headline,
            generated_at: brief.generated_at,
            analysis_mode: brief.analysis_mode,
            focused_catalyst: brief.focused_catalyst,
            broader_context: brief.broader_context,
          }
        : {},
      caveats: brief?.caveats ?? [],
    },
  };
}

export async function upsertIncidents(
  db: D1Database,
  candidates: IncidentCandidate[],
): Promise<number> {
  if (candidates.length === 0) {
    return 0;
  }

  const terminalStatuses = TERMINAL_BRIEF_STATUSES.join(",");
  const statements = candidates.map((candidate) =>
    db
      .prepare(
        `INSERT INTO incidents (
          id,
          incident_key,
          macro_day_cache_key,
          scope,
          direction,
          started_at,
          ended_at,
          signal_window,
          baseline_window,
          headline_severity,
          severity_label,
          breadth_count,
          breadth_label,
          symbols_json,
          tags_json,
          sub_events_json,
          symbol_evidence_json,
          query_hints_json,
          status,
          brief_status,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id)
        DO UPDATE SET
          incident_key = excluded.incident_key,
          macro_day_cache_key = excluded.macro_day_cache_key,
          scope = excluded.scope,
          direction = excluded.direction,
          started_at = excluded.started_at,
          ended_at = excluded.ended_at,
          signal_window = excluded.signal_window,
          baseline_window = excluded.baseline_window,
          headline_severity = excluded.headline_severity,
          severity_label = excluded.severity_label,
          breadth_count = excluded.breadth_count,
          breadth_label = excluded.breadth_label,
          symbols_json = excluded.symbols_json,
          tags_json = excluded.tags_json,
          sub_events_json = excluded.sub_events_json,
          symbol_evidence_json = excluded.symbol_evidence_json,
          query_hints_json = excluded.query_hints_json,
          status = CASE
            WHEN incidents.status IN (${terminalStatuses
              .split(",")
              .map(() => "?")
              .join(", ")}) THEN incidents.status
            ELSE excluded.status
          END,
          brief_status = CASE
            WHEN incidents.brief_status IN (${terminalStatuses
              .split(",")
              .map(() => "?")
              .join(", ")}) THEN incidents.brief_status
            ELSE excluded.brief_status
          END,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        candidate.id,
        candidate.incident_key,
        macroDayCacheKey(candidate),
        candidate.scope,
        candidate.direction,
        candidate.started_at,
        candidate.ended_at,
        candidate.signal_window,
        candidate.baseline_window,
        candidate.headline_severity,
        severityLabelForTier(candidate.tier),
        candidate.breadth_count,
        `${candidate.breadth_count}/5 pairs`,
        JSON.stringify(candidateSymbols(candidate)),
        JSON.stringify(tagsForCandidate(candidate)),
        JSON.stringify(candidate.sub_events),
        JSON.stringify(candidate.symbol_evidence),
        JSON.stringify(candidate.query_hints satisfies QueryHints),
        "queued_for_analysis",
        "queued_for_analysis",
        ...TERMINAL_BRIEF_STATUSES,
        ...TERMINAL_BRIEF_STATUSES,
      ),
  );

  let affected = 0;

  for (const statement of statements) {
    affected += changedRows(await statement.run());
  }

  return affected;
}

export async function getRecentIncidentsForFeed(
  db: D1Database,
  days = VISIBLE_RANGE_DAYS,
  now = new Date(),
): Promise<FeedItem[]> {
  const cutoff = isoDaysAgo(days, now);
  const result = await db
    .prepare(
      `SELECT
        id,
        incident_key,
        macro_day_cache_key,
        scope,
        direction,
        started_at,
        ended_at,
        signal_window,
        baseline_window,
        headline_severity,
        severity_label,
        breadth_count,
        breadth_label,
        symbols_json,
        tags_json,
        sub_events_json,
        symbol_evidence_json,
        query_hints_json,
        status,
        brief_status,
        created_at,
        updated_at
       FROM incidents
       WHERE started_at >= ?
         AND scope IN ('market_wide', 'market_day')
       ORDER BY started_at DESC`,
    )
    .bind(cutoff)
    .all<IncidentRow>();

  const feedItems: FeedItem[] = [];

  for (const row of result.results) {
    const brief = await getBriefByIncidentId(db, row.id);
    const sources = brief ? await getAcceptedSourcesForBrief(db, brief.id) : [];
    feedItems.push(incidentRowToFeedItemWithBrief(row, brief, sources));
  }

  return feedItems;
}

export async function getIncidentById(
  db: D1Database,
  id: string,
): Promise<FeedItem | null> {
  const row = await db
    .prepare(
      `SELECT
        id,
        incident_key,
        macro_day_cache_key,
        scope,
        direction,
        started_at,
        ended_at,
        signal_window,
        baseline_window,
        headline_severity,
        severity_label,
        breadth_count,
        breadth_label,
        symbols_json,
        tags_json,
        sub_events_json,
        symbol_evidence_json,
        query_hints_json,
        status,
        brief_status,
        created_at,
        updated_at
       FROM incidents
       WHERE id = ?`,
    )
    .bind(id)
    .first<IncidentRow>();

  if (!row) {
    return null;
  }

  const brief = await getBriefByIncidentId(db, row.id);
  const sources = brief ? await getAcceptedSourcesForBrief(db, brief.id) : [];

  return incidentRowToFeedItemWithBrief(row, brief, sources);
}
