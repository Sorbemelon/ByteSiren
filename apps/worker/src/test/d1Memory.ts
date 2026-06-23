import type { MarketCandle } from "../types/market.ts";
import type { IncidentRow } from "../db/incidentRepository.ts";

interface MarketFeatureRow {
  symbol: string;
  interval: string;
  open_time: string;
  return_15m_pct: number;
  price_z: number;
  volume_ratio_vs_24h_baseline: number;
  range_ratio_vs_24h_baseline: number;
  symbol_severity: number;
  direction: string;
  is_elevated: number;
  baseline_bars: number;
  signal_window: string;
  baseline_window: string;
}

interface RawSignalEventRow {
  id: string;
  detected_at: string;
  scope: string;
  direction: string;
  symbol_set_json: string;
  breadth_count: number;
  avg_elevated_severity: number;
  max_elevated_severity: number;
  peak_symbol: string | null;
  auto_confirm_reason: string | null;
  status: string;
  suppression_reason: string | null;
  evidence_json: string;
  tier: string | null;
  query_hints_json: string | null;
}

interface JobRunRow {
  id: string;
  job_name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  message: string;
  metadata_json: string;
}

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
  id: number;
  brief_id: string;
  publisher: string;
  title: string;
  url: string;
  normalized_url: string;
  published_at: string | null;
  accessed_at: string | null;
  used_for: string;
  source_strength: string | null;
  created_at: string;
}

interface ClaudeAnalysisUsageRow {
  usage_date: string;
  analysis_count: number;
  web_search_requests: number;
  updated_at: string;
}

interface PublicViewCountRow {
  view_date: string;
  views: number;
  updated_at: string;
}

interface SignalEventV02Row {
  id: string;
  date_utc: string;
  event_start: string;
  event_end: string;
  duration_min: number;
  peak_time: string | null;
  direction: string;
  signals_count: number;
  n_tracked: number;
  avg_change_pct: number | null;
  avg_change_method: string | null;
  event_strength_score: number | null;
  impact_label: string | null;
  chart_context_score: number | null;
  chart_context_label: string | null;
  event_story_type: string | null;
  trend_context: string | null;
  momentum_context: string | null;
  volatility_context: string | null;
  event_range_context: string | null;
  chart_context_reasons_json: string;
  chart_context_warnings_json: string;
  macro_aligned: number;
  nearest_macro_event: string | null;
  macro_delta_min: number | null;
  source_route_hint: string | null;
  direction_changed?: number;
  direction_history_json?: string;
  publish_candidate: number;
  publish_reason: string | null;
  suppress_reason: string | null;
  detector_version: string;
  created_at: string;
  updated_at: string;
}

interface SignalEventSymbolV02Row {
  id: string;
  signal_event_id: string;
  symbol: string;
  window_change_pct: number | null;
  peak_15m_change_pct: number | null;
  volume_ratio: number | null;
  range_position: string | null;
  prev_24h_high: number | null;
  prev_24h_low: number | null;
  range_break_direction: string | null;
  range_break_pct: number | null;
  range_break_strength: number | null;
  distance_to_range_high_pct: number | null;
  distance_to_range_low_pct: number | null;
  is_lead_mover: number;
  is_peak_15m_highlight: number;
  participated: number;
  evidence_json: string;
  created_at: string;
  updated_at: string;
}

interface AuditEventV02Row {
  id: string;
  date_utc: string;
  event_start: string;
  event_end: string;
  duration_min: number;
  direction: string | null;
  avg_change_pct: number | null;
  signals_count: number | null;
  n_tracked: number;
  event_strength_score: number | null;
  chart_context_score: number | null;
  chart_context_label: string | null;
  suppress_reason: string | null;
  why_suppressed: string | null;
  nearby_public_event_id: string | null;
  detector_version: string;
  evidence_json: string;
  created_at: string;
  updated_at: string;
}

interface MarketStoryV02Row {
  id: string;
  date_utc: string;
  story_start: string;
  story_end: string;
  duration_min: number;
  story_label: string;
  story_family: string | null;
  direction: string | null;
  swing_change_pct: number | null;
  chart_context_score: number | null;
  range_context_json: string;
  trend_context_json: string;
  momentum_context_json: string;
  volatility_context_json: string;
  decision_reasons_json: string;
  included_signal_event_ids_json: string;
  included_audit_event_ids_json: string;
  publish_candidate: number;
  publish_reason: string | null;
  suppress_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface MarketStoryMemberV02Row {
  id: string;
  market_story_id: string;
  member_type: string;
  member_id: string;
  display_order: number;
  role: string | null;
  created_at: string;
}

interface ClaudeBriefV02Row {
  id: string;
  target_type: string;
  target_id: string;
  prompt_mode: string;
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

interface SourceReferenceV02Row {
  id: string;
  target_type: string;
  target_id: string;
  brief_id: string | null;
  brief_v02_id?: string | null;
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

interface DailyOverviewV02Row {
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

export interface MemoryD1Tables {
  market_candles: MarketCandle[];
  market_features: MarketFeatureRow[];
  raw_signal_events: RawSignalEventRow[];
  incidents: IncidentRow[];
  claude_briefs: ClaudeBriefRow[];
  claude_briefs_v02: ClaudeBriefV02Row[];
  source_references: SourceReferenceRow[];
  source_references_v02: SourceReferenceV02Row[];
  signal_events_v02: SignalEventV02Row[];
  signal_event_symbols_v02: SignalEventSymbolV02Row[];
  audit_events_v02: AuditEventV02Row[];
  market_stories_v02: MarketStoryV02Row[];
  market_story_members_v02: MarketStoryMemberV02Row[];
  daily_overviews_v02: DailyOverviewV02Row[];
  claude_analysis_usage: ClaudeAnalysisUsageRow[];
  public_view_counts: PublicViewCountRow[];
  job_runs: JobRunRow[];
}

const TERMINAL_INCIDENT_STATUSES = new Set([
  "analysis_limited",
  "brief_ready",
  "context_only",
  "none_found",
]);
const PREPARED_STATEMENT_BIND_LIMIT = 100;
const BATCH_BIND_LIMIT = 999;

function incidentEventEnd(row: Pick<IncidentRow, "started_at" | "ended_at">) {
  return row.ended_at ?? row.started_at;
}

export function createMemoryD1(initial: Partial<MemoryD1Tables> = {}): {
  db: D1Database;
  tables: MemoryD1Tables;
} {
  const tables: MemoryD1Tables = {
    market_candles: [...(initial.market_candles ?? [])],
    market_features: [...(initial.market_features ?? [])],
    raw_signal_events: [...(initial.raw_signal_events ?? [])],
    incidents: [...(initial.incidents ?? [])],
    claude_briefs: [...(initial.claude_briefs ?? [])],
    claude_briefs_v02: [...(initial.claude_briefs_v02 ?? [])],
    source_references: [...(initial.source_references ?? [])],
    source_references_v02: [...(initial.source_references_v02 ?? [])],
    signal_events_v02: [...(initial.signal_events_v02 ?? [])],
    signal_event_symbols_v02: [...(initial.signal_event_symbols_v02 ?? [])],
    audit_events_v02: [...(initial.audit_events_v02 ?? [])],
    market_stories_v02: [...(initial.market_stories_v02 ?? [])],
    market_story_members_v02: [...(initial.market_story_members_v02 ?? [])],
    daily_overviews_v02: [...(initial.daily_overviews_v02 ?? [])],
    claude_analysis_usage: [...(initial.claude_analysis_usage ?? [])],
    public_view_counts: [...(initial.public_view_counts ?? [])],
    job_runs: [...(initial.job_runs ?? [])],
  };

  function result(changes: number): D1Result<unknown> {
    return {
      results: [],
      success: true,
      meta: {
        changes,
        changed_db: changes > 0,
        duration: 0,
        last_row_id: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: changes,
      },
    } as unknown as D1Result<unknown>;
  }

  class Prepared {
    private params: unknown[] = [];
    private readonly sql: string;

    constructor(sql: string) {
      this.sql = sql;
    }

    bind(...values: unknown[]) {
      if (values.length > PREPARED_STATEMENT_BIND_LIMIT) {
        throw new Error("too many SQL variables");
      }
      this.params = values;
      return this;
    }

    bindCount() {
      return this.params.length;
    }

    async all<T>() {
      if (this.sql.includes("SELECT id AS id FROM signal_events_v02")) {
        return {
          results: tables.signal_events_v02.map((row) => ({
            id: row.id,
          })) as T[],
        };
      }

      if (this.sql.includes("SELECT id AS id FROM signal_event_symbols_v02")) {
        return {
          results: tables.signal_event_symbols_v02.map((row) => ({
            id: row.id,
          })) as T[],
        };
      }

      if (this.sql.includes("SELECT id AS id FROM audit_events_v02")) {
        return {
          results: tables.audit_events_v02.map((row) => ({
            id: row.id,
          })) as T[],
        };
      }

      if (this.sql.includes("SELECT id AS id FROM market_stories_v02")) {
        return {
          results: tables.market_stories_v02.map((row) => ({
            id: row.id,
          })) as T[],
        };
      }

      if (
        this.sql.includes("FROM market_candles") &&
        this.sql.includes("ORDER BY open_time DESC")
      ) {
        const [symbol, interval, limit] = this.params as [
          string,
          string,
          number,
        ];

        return {
          results: tables.market_candles
            .filter((row) => row.symbol === symbol && row.interval === interval)
            .sort((a, b) => b.open_time.localeCompare(a.open_time))
            .slice(0, limit) as T[],
        };
      }

      if (
        this.sql.includes("FROM market_candles") &&
        this.sql.includes("open_time >= ?")
      ) {
        const [symbol, interval, cutoff] = this.params as [
          string,
          string,
          string,
        ];

        return {
          results: tables.market_candles
            .filter(
              (row) =>
                row.symbol === symbol &&
                row.interval === interval &&
                row.open_time >= cutoff,
            )
            .sort((a, b) => a.open_time.localeCompare(b.open_time)) as T[],
        };
      }

      if (
        this.sql.includes("FROM incidents") &&
        this.sql.includes("brief_status IN")
      ) {
        const cutoff = this.params[0] as string;
        const limit = this.params.at(-1) as number;
        const statuses = new Set(
          this.params.slice(1, -1).map((value) => String(value)),
        );

        return {
          results: tables.incidents
            .filter(
              (row) =>
                row.started_at >= cutoff &&
                (row.scope === "market_wide" || row.scope === "market_day") &&
                statuses.has(row.brief_status),
            )
            .sort(
              (a, b) =>
                incidentEventEnd(b).localeCompare(incidentEventEnd(a)) ||
                b.started_at.localeCompare(a.started_at),
            )
            .slice(0, limit) as T[],
        };
      }

      if (
        this.sql.includes("FROM signal_events_v02") &&
        this.sql.includes("date_utc = ?") &&
        this.sql.includes("publish_candidate = 1")
      ) {
        const [dateUtc] = this.params as [string];

        return {
          results: tables.signal_events_v02
            .filter(
              (row) => row.date_utc === dateUtc && row.publish_candidate === 1,
            )
            .sort(
              (a, b) =>
                b.event_end.localeCompare(a.event_end) ||
                b.event_start.localeCompare(a.event_start) ||
                a.id.localeCompare(b.id),
            ) as T[],
        };
      }

      if (
        this.sql.includes("FROM signal_events_v02") &&
        this.sql.includes("publish_candidate = 1")
      ) {
        const [cutoff] = this.params as [string];

        return {
          results: tables.signal_events_v02
            .filter(
              (row) => row.event_start >= cutoff && row.publish_candidate === 1,
            )
            .sort(
              (a, b) =>
                b.event_end.localeCompare(a.event_end) ||
                b.event_start.localeCompare(a.event_start),
            ) as T[],
        };
      }

      if (
        this.sql.includes("FROM signal_events_v02") &&
        this.sql.includes("ORDER BY event_start ASC")
      ) {
        return {
          results: [...tables.signal_events_v02].sort((a, b) =>
            a.event_start.localeCompare(b.event_start),
          ) as T[],
        };
      }

      if (
        this.sql.includes("FROM audit_events_v02") &&
        this.sql.includes("ORDER BY event_start ASC")
      ) {
        return {
          results: [...tables.audit_events_v02].sort((a, b) =>
            a.event_start.localeCompare(b.event_start),
          ) as T[],
        };
      }

      if (
        this.sql.includes("FROM daily_overviews_v02") &&
        this.sql.includes("ORDER BY date_utc DESC") &&
        this.sql.includes("LIMIT ?")
      ) {
        const [limit] = this.params as [number];

        return {
          results: [...tables.daily_overviews_v02]
            .sort((a, b) => b.date_utc.localeCompare(a.date_utc))
            .slice(0, limit) as T[],
        };
      }

      if (
        this.sql.includes("FROM daily_overviews_v02") &&
        this.sql.includes("day_start >= ?")
      ) {
        const [cutoff] = this.params as [string];

        return {
          results: tables.daily_overviews_v02
            .filter((row) => row.day_start >= cutoff)
            .sort((a, b) => b.date_utc.localeCompare(a.date_utc)) as T[],
        };
      }

      if (
        this.sql.includes("FROM market_stories_v02") &&
        this.sql.includes("date_utc = ?") &&
        this.sql.includes("publish_candidate = 1")
      ) {
        const [dateUtc] = this.params as [string];

        return {
          results: tables.market_stories_v02
            .filter(
              (row) => row.date_utc === dateUtc && row.publish_candidate === 1,
            )
            .sort(
              (a, b) =>
                b.story_end.localeCompare(a.story_end) ||
                b.story_start.localeCompare(a.story_start) ||
                a.id.localeCompare(b.id),
            ) as T[],
        };
      }

      if (
        this.sql.includes("FROM market_stories_v02") &&
        this.sql.includes("publish_candidate = 1")
      ) {
        const [cutoff] = this.params as [string];

        return {
          results: tables.market_stories_v02
            .filter(
              (row) => row.story_start >= cutoff && row.publish_candidate === 1,
            )
            .sort(
              (a, b) =>
                b.story_end.localeCompare(a.story_end) ||
                b.story_start.localeCompare(a.story_start),
            ) as T[],
        };
      }

      if (
        this.sql.includes("FROM signal_event_symbols_v02") &&
        this.sql.includes("signal_event_id = ?")
      ) {
        const [signalEventId] = this.params as [string];

        return {
          results: tables.signal_event_symbols_v02
            .filter((row) => row.signal_event_id === signalEventId)
            .sort((a, b) => a.symbol.localeCompare(b.symbol)) as T[],
        };
      }

      if (
        this.sql.includes("FROM source_references_v02") &&
        this.sql.includes("target_type = ?") &&
        this.sql.includes("accepted = 1")
      ) {
        const [targetType, targetId] = this.params as [string, string];

        return {
          results: tables.source_references_v02
            .filter(
              (row) =>
                row.target_type === targetType &&
                row.target_id === targetId &&
                row.accepted === 1,
            )
            .sort(
              (a, b) =>
                a.created_at.localeCompare(b.created_at) ||
                a.id.localeCompare(b.id),
            ) as T[],
        };
      }

      if (
        this.sql.includes("FROM claude_briefs_v02") &&
        this.sql.includes("status = ?")
      ) {
        const [status, limit] = this.params as [string, number];

        return {
          results: tables.claude_briefs_v02
            .filter((row) => row.status === status)
            .sort(
              (a, b) =>
                a.updated_at.localeCompare(b.updated_at) ||
                a.created_at.localeCompare(b.created_at),
            )
            .slice(0, limit) as T[],
        };
      }

      if (
        this.sql.includes("FROM incidents") &&
        this.sql.includes("started_at >= ?")
      ) {
        const [cutoff] = this.params as [string];

        return {
          results: tables.incidents
            .filter(
              (row) =>
                row.started_at >= cutoff &&
                (row.scope === "market_wide" || row.scope === "market_day"),
            )
            .sort(
              (a, b) =>
                incidentEventEnd(b).localeCompare(incidentEventEnd(a)) ||
                b.started_at.localeCompare(a.started_at),
            ) as T[],
        };
      }

      if (
        this.sql.includes("FROM source_references") &&
        this.sql.includes("brief_id = ?")
      ) {
        const [briefId] = this.params as [string];

        return {
          results: tables.source_references
            .filter((row) => row.brief_id === briefId)
            .sort((a, b) => a.id - b.id) as T[],
        };
      }

      return { results: [] as T[] };
    }

    async first<T>() {
      if (this.sql.includes("MAX(close_time) AS latest_close_time")) {
        const latest = [...tables.market_candles].sort((a, b) =>
          b.close_time.localeCompare(a.close_time),
        )[0];

        return {
          latest_close_time: latest?.close_time ?? null,
        } as T;
      }

      if (
        this.sql.includes("COUNT(*) AS count") &&
        this.sql.includes("FROM daily_overviews_v02")
      ) {
        return {
          count: tables.daily_overviews_v02.length,
        } as T;
      }

      if (
        this.sql.includes("claude_briefs_v02") &&
        this.sql.includes("accepted_source_references_v02")
      ) {
        return {
          claude_briefs_v02: tables.claude_briefs_v02.length,
          source_references_v02: tables.source_references_v02.length,
          accepted_source_references_v02: tables.source_references_v02.filter(
            (row) => row.accepted === 1,
          ).length,
          rejected_source_references_v02: tables.source_references_v02.filter(
            (row) => row.accepted === 0,
          ).length,
          legacy_claude_briefs: tables.claude_briefs.length,
          legacy_source_references: tables.source_references.length,
        } as T;
      }

      if (
        this.sql.includes("COUNT(*) AS count") &&
        this.sql.includes("FROM audit_events_v02")
      ) {
        const [dateUtc] = this.params as [string];
        return {
          count: tables.audit_events_v02.filter(
            (row) => row.date_utc === dateUtc,
          ).length,
        } as T;
      }

      if (
        this.sql.includes("COUNT(*) AS count") &&
        this.sql.includes("FROM market_candles")
      ) {
        const [symbol, interval] = this.params as [string, string];
        const rows = tables.market_candles
          .filter((row) => row.symbol === symbol && row.interval === interval)
          .sort((a, b) => a.open_time.localeCompare(b.open_time));
        const latest = rows.at(-1);

        return {
          count: rows.length,
          earliest_open_time: rows[0]?.open_time ?? null,
          latest_open_time: latest?.open_time ?? null,
          latest_close_time: latest?.close_time ?? null,
        } as T;
      }

      if (this.sql.includes("FROM incidents") && this.sql.includes("id = ?")) {
        const [id] = this.params as [string];
        return (tables.incidents.find((row) => row.id === id) ?? null) as T;
      }

      if (
        this.sql.includes("FROM daily_overviews_v02") &&
        this.sql.includes("date_utc = ?")
      ) {
        const [dateUtc] = this.params as [string];
        return (tables.daily_overviews_v02.find(
          (row) => row.date_utc === dateUtc,
        ) ?? null) as T;
      }

      if (
        this.sql.includes("FROM claude_briefs_v02") &&
        this.sql.includes("target_type = ?") &&
        this.sql.includes("target_id = ?")
      ) {
        const [targetType, targetId, promptMode] = this.params as [
          string,
          string,
          string | undefined,
        ];
        const filtersPromptMode =
          this.sql.includes("prompt_mode = ?") &&
          typeof promptMode === "string";
        const row = tables.claude_briefs_v02
          .filter(
            (brief) =>
              brief.target_type === targetType &&
              brief.target_id === targetId &&
              (!filtersPromptMode || brief.prompt_mode === promptMode),
          )
          .sort(
            (a, b) =>
              b.updated_at.localeCompare(a.updated_at) ||
              b.created_at.localeCompare(a.created_at),
          )[0];

        return (row ?? null) as T;
      }

      if (
        this.sql.includes("FROM claude_briefs") &&
        this.sql.includes("incident_id = ?")
      ) {
        const [incidentId] = this.params as [string];
        const row = tables.claude_briefs
          .filter((brief) => brief.incident_id === incidentId)
          .sort((a, b) =>
            (b.generated_at ?? b.updated_at).localeCompare(
              a.generated_at ?? a.updated_at,
            ),
          )[0];

        return (row ?? null) as T;
      }

      if (this.sql.includes("FROM claude_analysis_usage")) {
        const [usageDate] = this.params as [string];
        return (tables.claude_analysis_usage.find(
          (row) => row.usage_date === usageDate,
        ) ?? null) as T;
      }

      if (
        this.sql.includes("SUM(views)") &&
        this.sql.includes("AS total_views")
      ) {
        return {
          total_views: tables.public_view_counts.reduce(
            (total, row) => total + row.views,
            0,
          ),
        } as T;
      }

      if (
        this.sql.includes("FROM public_view_counts") &&
        this.sql.includes("view_date = ?")
      ) {
        const [viewDate] = this.params as [string];
        return (tables.public_view_counts.find(
          (row) => row.view_date === viewDate,
        ) ?? null) as T;
      }

      return null as T;
    }

    async run() {
      if (this.sql.includes("INSERT INTO market_candles")) {
        const [
          symbol,
          interval,
          openTime,
          closeTime,
          open,
          high,
          low,
          close,
          volume,
          quoteVolume,
          tradeCount,
        ] = this.params as [
          string,
          string,
          string,
          string,
          number,
          number,
          number,
          number,
          number,
          number,
          number | null,
        ];
        const existing = tables.market_candles.find(
          (row) =>
            row.symbol === symbol &&
            row.interval === interval &&
            row.open_time === openTime,
        );
        const row: MarketCandle = {
          symbol: symbol as MarketCandle["symbol"],
          interval: interval as MarketCandle["interval"],
          open_time: openTime,
          close_time: closeTime,
          open,
          high,
          low,
          close,
          volume,
          quote_volume: quoteVolume,
          trade_count: tradeCount,
        };

        if (existing) {
          Object.assign(existing, row);
        } else {
          tables.market_candles.push(row);
        }

        return result(1);
      }

      if (this.sql.includes("INSERT INTO market_features")) {
        const [
          symbol,
          interval,
          openTime,
          return15mPct,
          priceZ,
          volumeRatio,
          rangeRatio,
          severity,
          direction,
          isElevated,
          baselineBars,
          signalWindow,
          baselineWindow,
        ] = this.params as [
          string,
          string,
          string,
          number,
          number,
          number,
          number,
          number,
          string,
          number,
          number,
          string,
          string,
        ];
        const existing = tables.market_features.find(
          (row) =>
            row.symbol === symbol &&
            row.interval === interval &&
            row.open_time === openTime,
        );
        const row: MarketFeatureRow = {
          symbol,
          interval,
          open_time: openTime,
          return_15m_pct: return15mPct,
          price_z: priceZ,
          volume_ratio_vs_24h_baseline: volumeRatio,
          range_ratio_vs_24h_baseline: rangeRatio,
          symbol_severity: severity,
          direction,
          is_elevated: isElevated,
          baseline_bars: baselineBars,
          signal_window: signalWindow,
          baseline_window: baselineWindow,
        };

        if (existing) {
          Object.assign(existing, row);
        } else {
          tables.market_features.push(row);
        }

        return result(1);
      }

      if (this.sql.includes("INSERT INTO raw_signal_events")) {
        const [
          id,
          detectedAt,
          scope,
          direction,
          symbolSetJson,
          breadthCount,
          avgSeverity,
          maxSeverity,
          peakSymbol,
          autoConfirmReason,
          status,
          suppressionReason,
          evidenceJson,
          tier,
          queryHintsJson,
        ] = this.params as [
          string,
          string,
          string,
          string,
          string,
          number,
          number,
          number,
          string | null,
          string | null,
          string,
          string | null,
          string,
          string | null,
          string | null,
        ];
        const existing = tables.raw_signal_events.find((row) => row.id === id);
        const row: RawSignalEventRow = {
          id,
          detected_at: detectedAt,
          scope,
          direction,
          symbol_set_json: symbolSetJson,
          breadth_count: breadthCount,
          avg_elevated_severity: avgSeverity,
          max_elevated_severity: maxSeverity,
          peak_symbol: peakSymbol,
          auto_confirm_reason: autoConfirmReason,
          status,
          suppression_reason: suppressionReason,
          evidence_json: evidenceJson,
          tier,
          query_hints_json: queryHintsJson,
        };

        if (existing) {
          Object.assign(existing, row);
        } else {
          tables.raw_signal_events.push(row);
        }

        return result(1);
      }

      if (this.sql.includes("INSERT INTO incidents")) {
        const [
          id,
          incidentKey,
          macroDayCacheKey,
          scope,
          direction,
          startedAt,
          endedAt,
          signalWindow,
          baselineWindow,
          headlineSeverity,
          severityLabel,
          breadthCount,
          breadthLabel,
          symbolsJson,
          tagsJson,
          subEventsJson,
          symbolEvidenceJson,
          queryHintsJson,
          status,
          briefStatus,
        ] = this.params as [
          string,
          string,
          string,
          "market_wide" | "market_day",
          "observed_up" | "observed_down" | "two_sided",
          string,
          string | null,
          "15m",
          "24h",
          number,
          string,
          number,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ];
        const existing = tables.incidents.find((row) => row.id === id);
        const now = new Date().toISOString();
        const row: IncidentRow = {
          id,
          incident_key: incidentKey,
          macro_day_cache_key: macroDayCacheKey,
          scope,
          direction,
          started_at: startedAt,
          ended_at: endedAt,
          signal_window: signalWindow,
          baseline_window: baselineWindow,
          headline_severity: headlineSeverity,
          severity_label: severityLabel,
          breadth_count: breadthCount,
          breadth_label: breadthLabel,
          symbols_json: symbolsJson,
          tags_json: tagsJson,
          sub_events_json: subEventsJson,
          symbol_evidence_json: symbolEvidenceJson,
          query_hints_json: queryHintsJson,
          status:
            existing && TERMINAL_INCIDENT_STATUSES.has(existing.status)
              ? existing.status
              : status,
          brief_status:
            existing && TERMINAL_INCIDENT_STATUSES.has(existing.brief_status)
              ? existing.brief_status
              : briefStatus,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };

        if (existing) {
          Object.assign(existing, row);
        } else {
          tables.incidents.push(row);
        }

        return result(1);
      }

      if (this.sql.includes("INSERT INTO claude_briefs_v02")) {
        const [
          id,
          targetType,
          targetId,
          promptMode,
          status,
          publicLabel,
          classification,
          confidence,
          headline,
          collapsedSummary,
          contextDetails,
          sourceSupport,
          sourceTimingAlignment,
          validationFlagsJson,
          detectorFeedbackJson,
          promptVersion,
          model,
          errorCode,
          errorMessage,
          createdAt,
          updatedAt,
        ] = this.params as [
          string,
          string,
          string,
          string,
          string,
          string | null,
          string | null,
          string | null,
          string | null,
          string | null,
          string | null,
          string | null,
          string | null,
          string,
          string,
          string | null,
          string | null,
          string | null,
          string | null,
          string,
          string,
        ];
        const existing = tables.claude_briefs_v02.find((row) => row.id === id);
        const row: ClaudeBriefV02Row = {
          id,
          target_type: targetType,
          target_id: targetId,
          prompt_mode: promptMode,
          status,
          public_label: publicLabel,
          classification,
          confidence,
          headline,
          collapsed_summary: collapsedSummary,
          context_details: contextDetails,
          source_support: sourceSupport,
          source_timing_alignment: sourceTimingAlignment,
          validation_flags_json: validationFlagsJson,
          detector_feedback_json: detectorFeedbackJson,
          prompt_version: promptVersion,
          model,
          error_code: errorCode,
          error_message: errorMessage,
          created_at: existing?.created_at ?? createdAt,
          updated_at: updatedAt,
        };

        if (existing) {
          Object.assign(existing, row);
        } else {
          tables.claude_briefs_v02.push(row);
        }

        return result(1);
      }

      if (this.sql.includes("INSERT INTO claude_briefs")) {
        const [
          id,
          incidentId,
          analysisMode,
          catalystStatus,
          uiLabel,
          confidence,
          priceContextCheck,
          headline,
          summary,
          focusedCatalystJson,
          mainCatalystJson,
          broaderContextJson,
          caveatsJson,
          tagsJson,
          sourceQualityMetaJson,
          generatedAt,
        ] = this.params as [
          string,
          string,
          string,
          string | null,
          string,
          string | null,
          string | null,
          string | null,
          string,
          string | null,
          string | null,
          string,
          string,
          string,
          string,
          string | null,
        ];
        const existing = tables.claude_briefs.find(
          (row) =>
            row.incident_id === incidentId &&
            row.analysis_mode === analysisMode,
        );
        const now = new Date().toISOString();
        const row: ClaudeBriefRow = {
          id,
          incident_id: incidentId,
          analysis_mode: analysisMode,
          catalyst_status: catalystStatus,
          ui_label: uiLabel,
          confidence,
          price_context_check: priceContextCheck,
          headline,
          summary,
          focused_catalyst_json: focusedCatalystJson,
          main_catalyst_json: mainCatalystJson,
          broader_context_json: broaderContextJson,
          caveats_json: caveatsJson,
          tags_json: tagsJson,
          source_quality_meta_json: sourceQualityMetaJson,
          generated_at: generatedAt,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };

        if (existing) {
          Object.assign(existing, row);
        } else {
          tables.claude_briefs.push(row);
        }

        return result(1);
      }

      if (this.sql.includes("INSERT INTO source_references_v02")) {
        const [
          id,
          targetType,
          targetId,
          briefId,
          briefV02Id,
          sourceRole,
          sourceStrength,
          publisher,
          title,
          url,
          publishedAt,
          usedFor,
          accepted,
          rejectionReason,
          metadataJson,
        ] = this.params as [
          string,
          string,
          string,
          string | null,
          string | null,
          string,
          string | null,
          string | null,
          string | null,
          string,
          string | null,
          string | null,
          number,
          string | null,
          string,
        ];
        const existing = tables.source_references_v02.find(
          (row) => row.id === id,
        );
        const row: SourceReferenceV02Row = {
          id,
          target_type: targetType,
          target_id: targetId,
          brief_id: briefId,
          brief_v02_id: briefV02Id,
          source_role: sourceRole,
          source_strength: sourceStrength,
          publisher,
          title,
          url,
          published_at: publishedAt,
          used_for: usedFor,
          accepted,
          rejection_reason: rejectionReason,
          metadata_json: metadataJson,
          created_at: existing?.created_at ?? new Date().toISOString(),
        };

        if (existing) {
          Object.assign(existing, row);
        } else {
          tables.source_references_v02.push(row);
        }

        return result(1);
      }

      if (this.sql.includes("INSERT INTO source_references")) {
        const [
          briefId,
          publisher,
          title,
          url,
          normalizedUrl,
          publishedAt,
          accessedAt,
          usedFor,
          sourceStrength,
        ] = this.params as [
          string,
          string,
          string,
          string,
          string,
          string | null,
          string | null,
          string,
          string | null,
        ];
        const existing = tables.source_references.find(
          (row) =>
            row.brief_id === briefId && row.normalized_url === normalizedUrl,
        );
        const now = new Date().toISOString();
        const row: SourceReferenceRow = {
          id: existing?.id ?? tables.source_references.length + 1,
          brief_id: briefId,
          publisher,
          title,
          url,
          normalized_url: normalizedUrl,
          published_at: publishedAt,
          accessed_at: accessedAt,
          used_for: usedFor,
          source_strength: sourceStrength,
          created_at: existing?.created_at ?? now,
        };

        if (existing) {
          Object.assign(existing, row);
        } else {
          tables.source_references.push(row);
        }

        return result(1);
      }

      if (this.sql.includes("INSERT INTO claude_analysis_usage")) {
        const [usageDate, analysisCount, webSearchRequests] = this.params as [
          string,
          number,
          number,
        ];
        const existing = tables.claude_analysis_usage.find(
          (row) => row.usage_date === usageDate,
        );
        const now = new Date().toISOString();

        if (existing) {
          existing.analysis_count += analysisCount;
          existing.web_search_requests += webSearchRequests;
          existing.updated_at = now;
        } else {
          tables.claude_analysis_usage.push({
            usage_date: usageDate,
            analysis_count: analysisCount,
            web_search_requests: webSearchRequests,
            updated_at: now,
          });
        }

        return result(1);
      }

      if (this.sql.includes("INSERT INTO public_view_counts")) {
        const [viewDate, updatedAt] = this.params as [string, string];
        const existing = tables.public_view_counts.find(
          (row) => row.view_date === viewDate,
        );

        if (existing) {
          existing.views += 1;
          existing.updated_at = updatedAt;
        } else {
          tables.public_view_counts.push({
            view_date: viewDate,
            views: 1,
            updated_at: updatedAt,
          });
        }

        return result(1);
      }

      if (this.sql.includes("INSERT INTO signal_events_v02")) {
        const [
          id,
          dateUtc,
          eventStart,
          eventEnd,
          durationMin,
          peakTime,
          direction,
          signalsCount,
          nTracked,
          avgChangePct,
          avgChangeMethod,
          eventStrengthScore,
          impactLabel,
          chartContextScore,
          chartContextLabel,
          eventStoryType,
          trendContext,
          momentumContext,
          volatilityContext,
          eventRangeContext,
          chartContextReasonsJson,
          chartContextWarningsJson,
          macroAligned,
          nearestMacroEvent,
          macroDeltaMin,
          sourceRouteHint,
          directionChanged,
          directionHistoryJson,
          publishCandidate,
          publishReason,
          suppressReason,
          detectorVersion,
        ] = this.params as [
          string,
          string,
          string,
          string,
          number,
          string | null,
          string,
          number,
          number,
          number | null,
          string | null,
          number | null,
          string | null,
          number | null,
          string | null,
          string | null,
          string | null,
          string | null,
          string | null,
          string | null,
          string,
          string,
          number,
          string | null,
          number | null,
          string | null,
          number,
          string,
          number,
          string | null,
          string | null,
          string,
        ];
        const existing = tables.signal_events_v02.find((row) => row.id === id);
        const now = new Date().toISOString();
        const row: SignalEventV02Row = {
          id,
          date_utc: dateUtc,
          event_start: eventStart,
          event_end: eventEnd,
          duration_min: durationMin,
          peak_time: peakTime,
          direction,
          signals_count: signalsCount,
          n_tracked: nTracked,
          avg_change_pct: avgChangePct,
          avg_change_method: avgChangeMethod,
          event_strength_score: eventStrengthScore,
          impact_label: impactLabel,
          chart_context_score: chartContextScore,
          chart_context_label: chartContextLabel,
          event_story_type: eventStoryType,
          trend_context: trendContext,
          momentum_context: momentumContext,
          volatility_context: volatilityContext,
          event_range_context: eventRangeContext,
          chart_context_reasons_json: chartContextReasonsJson,
          chart_context_warnings_json: chartContextWarningsJson,
          macro_aligned: macroAligned,
          nearest_macro_event: nearestMacroEvent,
          macro_delta_min: macroDeltaMin,
          source_route_hint: sourceRouteHint,
          direction_changed: directionChanged,
          direction_history_json: directionHistoryJson,
          publish_candidate: publishCandidate,
          publish_reason: publishReason,
          suppress_reason: suppressReason,
          detector_version: detectorVersion,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };

        if (existing) {
          Object.assign(existing, row);
        } else {
          tables.signal_events_v02.push(row);
        }

        return result(1);
      }

      if (this.sql.includes("INSERT INTO signal_event_symbols_v02")) {
        const [
          id,
          signalEventId,
          symbol,
          windowChangePct,
          peak15mChangePct,
          volumeRatio,
          rangePosition,
          prev24hHigh,
          prev24hLow,
          rangeBreakDirection,
          rangeBreakPct,
          rangeBreakStrength,
          distanceToRangeHighPct,
          distanceToRangeLowPct,
          isLeadMover,
          isPeak15mHighlight,
          participated,
          evidenceJson,
        ] = this.params as [
          string,
          string,
          string,
          number | null,
          number | null,
          number | null,
          string | null,
          number | null,
          number | null,
          string | null,
          number | null,
          number | null,
          number | null,
          number | null,
          number,
          number,
          number,
          string,
        ];
        const existing = tables.signal_event_symbols_v02.find(
          (row) => row.id === id,
        );
        const now = new Date().toISOString();
        const row: SignalEventSymbolV02Row = {
          id,
          signal_event_id: signalEventId,
          symbol,
          window_change_pct: windowChangePct,
          peak_15m_change_pct: peak15mChangePct,
          volume_ratio: volumeRatio,
          range_position: rangePosition,
          prev_24h_high: prev24hHigh,
          prev_24h_low: prev24hLow,
          range_break_direction: rangeBreakDirection,
          range_break_pct: rangeBreakPct,
          range_break_strength: rangeBreakStrength,
          distance_to_range_high_pct: distanceToRangeHighPct,
          distance_to_range_low_pct: distanceToRangeLowPct,
          is_lead_mover: isLeadMover,
          is_peak_15m_highlight: isPeak15mHighlight,
          participated,
          evidence_json: evidenceJson,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };

        if (existing) {
          Object.assign(existing, row);
        } else {
          tables.signal_event_symbols_v02.push(row);
        }

        return result(1);
      }

      if (this.sql.includes("INSERT INTO audit_events_v02")) {
        const [
          id,
          dateUtc,
          eventStart,
          eventEnd,
          durationMin,
          direction,
          avgChangePct,
          signalsCount,
          nTracked,
          eventStrengthScore,
          chartContextScore,
          chartContextLabel,
          suppressReason,
          whySuppressed,
          nearbyPublicEventId,
          detectorVersion,
          evidenceJson,
        ] = this.params as [
          string,
          string,
          string,
          string,
          number,
          string | null,
          number | null,
          number | null,
          number,
          number | null,
          number | null,
          string | null,
          string | null,
          string | null,
          string | null,
          string,
          string,
        ];
        const existing = tables.audit_events_v02.find((row) => row.id === id);
        const now = new Date().toISOString();
        const row: AuditEventV02Row = {
          id,
          date_utc: dateUtc,
          event_start: eventStart,
          event_end: eventEnd,
          duration_min: durationMin,
          direction,
          avg_change_pct: avgChangePct,
          signals_count: signalsCount,
          n_tracked: nTracked,
          event_strength_score: eventStrengthScore,
          chart_context_score: chartContextScore,
          chart_context_label: chartContextLabel,
          suppress_reason: suppressReason,
          why_suppressed: whySuppressed,
          nearby_public_event_id: nearbyPublicEventId,
          detector_version: detectorVersion,
          evidence_json: evidenceJson,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };

        if (existing) {
          Object.assign(existing, row);
        } else {
          tables.audit_events_v02.push(row);
        }

        return result(1);
      }

      if (this.sql.includes("DELETE FROM signal_event_symbols_v02")) {
        const before = tables.signal_event_symbols_v02.length;
        if (this.sql.includes("WHERE id IN")) {
          const ids = new Set(this.params as string[]);
          tables.signal_event_symbols_v02 =
            tables.signal_event_symbols_v02.filter((row) => !ids.has(row.id));
        } else {
          tables.signal_event_symbols_v02 = [];
        }

        return result(before - tables.signal_event_symbols_v02.length);
      }

      if (this.sql.includes("DELETE FROM signal_events_v02")) {
        const before = tables.signal_events_v02.length;
        if (this.sql.includes("WHERE id IN")) {
          const ids = new Set(this.params as string[]);
          tables.signal_events_v02 = tables.signal_events_v02.filter(
            (row) => !ids.has(row.id),
          );
        } else {
          tables.signal_events_v02 = [];
        }

        return result(before - tables.signal_events_v02.length);
      }

      if (this.sql.includes("DELETE FROM audit_events_v02")) {
        const before = tables.audit_events_v02.length;
        if (this.sql.includes("WHERE id IN")) {
          const ids = new Set(this.params as string[]);
          tables.audit_events_v02 = tables.audit_events_v02.filter(
            (row) => !ids.has(row.id),
          );
        } else {
          tables.audit_events_v02 = [];
        }

        return result(before - tables.audit_events_v02.length);
      }

      if (this.sql.includes("INSERT INTO market_stories_v02")) {
        const [
          id,
          dateUtc,
          storyStart,
          storyEnd,
          durationMin,
          storyLabel,
          storyFamily,
          direction,
          swingChangePct,
          chartContextScore,
          rangeContextJson,
          trendContextJson,
          momentumContextJson,
          volatilityContextJson,
          decisionReasonsJson,
          includedSignalEventIdsJson,
          includedAuditEventIdsJson,
          publishCandidate,
          publishReason,
          suppressReason,
        ] = this.params as [
          string,
          string,
          string,
          string,
          number,
          string,
          string | null,
          string | null,
          number | null,
          number | null,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          number,
          string | null,
          string | null,
        ];
        const existing = tables.market_stories_v02.find((row) => row.id === id);
        const now = new Date().toISOString();
        const row: MarketStoryV02Row = {
          id,
          date_utc: dateUtc,
          story_start: storyStart,
          story_end: storyEnd,
          duration_min: durationMin,
          story_label: storyLabel,
          story_family: storyFamily,
          direction,
          swing_change_pct: swingChangePct,
          chart_context_score: chartContextScore,
          range_context_json: rangeContextJson,
          trend_context_json: trendContextJson,
          momentum_context_json: momentumContextJson,
          volatility_context_json: volatilityContextJson,
          decision_reasons_json: decisionReasonsJson,
          included_signal_event_ids_json: includedSignalEventIdsJson,
          included_audit_event_ids_json: includedAuditEventIdsJson,
          publish_candidate: publishCandidate,
          publish_reason: publishReason,
          suppress_reason: suppressReason,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };

        if (existing) {
          Object.assign(existing, row);
        } else {
          tables.market_stories_v02.push(row);
        }

        return result(1);
      }

      if (
        this.sql.includes("DELETE FROM market_story_members_v02") &&
        this.sql.includes("market_story_id = ?")
      ) {
        const [storyId] = this.params as [string];
        const before = tables.market_story_members_v02.length;
        tables.market_story_members_v02 =
          tables.market_story_members_v02.filter(
            (row) => row.market_story_id !== storyId,
          );

        return result(before - tables.market_story_members_v02.length);
      }

      if (this.sql.includes("DELETE FROM market_story_members_v02")) {
        const before = tables.market_story_members_v02.length;
        if (this.sql.includes("WHERE market_story_id IN")) {
          const ids = new Set(this.params as string[]);
          tables.market_story_members_v02 =
            tables.market_story_members_v02.filter(
              (row) => !ids.has(row.market_story_id),
            );
        } else {
          tables.market_story_members_v02 = [];
        }

        return result(before - tables.market_story_members_v02.length);
      }

      if (this.sql.includes("DELETE FROM market_stories_v02")) {
        const before = tables.market_stories_v02.length;
        if (this.sql.includes("WHERE id IN")) {
          const ids = new Set(this.params as string[]);
          tables.market_stories_v02 = tables.market_stories_v02.filter(
            (row) => !ids.has(row.id),
          );
        } else {
          tables.market_stories_v02 = [];
        }

        return result(before - tables.market_stories_v02.length);
      }

      if (this.sql.includes("INSERT INTO market_story_members_v02")) {
        const [id, storyId, memberType, memberId, displayOrder, role] = this
          .params as [string, string, string, string, number, string | null];
        tables.market_story_members_v02.push({
          id,
          market_story_id: storyId,
          member_type: memberType,
          member_id: memberId,
          display_order: displayOrder,
          role,
          created_at: new Date().toISOString(),
        });

        return result(1);
      }

      if (this.sql.includes("INSERT INTO daily_overviews_v02")) {
        const [
          id,
          dateUtc,
          dayStart,
          dayEnd,
          marketTone,
          dailyChangePct,
          dailyChangeLabel,
          marketRangePct,
          notableSymbolsJson,
          topSymbolMovesJson,
          signalEventIdsJson,
          marketStoryIdsJson,
          auditEventCount,
          dailyChartContextSummaryJson,
          claudeStatus,
          claudeBriefId,
        ] = this.params as [
          string,
          string,
          string,
          string,
          string | null,
          number | null,
          string,
          number | null,
          string,
          string,
          string,
          string,
          number,
          string,
          string,
          string | null,
        ];
        const existing = tables.daily_overviews_v02.find(
          (row) => row.date_utc === dateUtc,
        );
        const now = new Date().toISOString();
        const row: DailyOverviewV02Row = {
          id,
          date_utc: dateUtc,
          day_start: dayStart,
          day_end: dayEnd,
          market_tone: marketTone,
          daily_change_pct: dailyChangePct,
          daily_change_label: dailyChangeLabel,
          market_range_pct: marketRangePct,
          notable_symbols_json: notableSymbolsJson,
          top_symbol_moves_json: topSymbolMovesJson,
          signal_event_ids_json: signalEventIdsJson,
          market_story_ids_json: marketStoryIdsJson,
          audit_event_count: auditEventCount,
          daily_chart_context_summary_json: dailyChartContextSummaryJson,
          claude_status: claudeStatus,
          claude_brief_id: existing?.claude_brief_id ?? claudeBriefId,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };

        if (existing) {
          Object.assign(existing, row);
        } else {
          tables.daily_overviews_v02.push(row);
        }

        return result(1);
      }

      if (this.sql.includes("UPDATE claude_briefs_v02")) {
        const [status, errorCode, errorMessage, updatedAt, id] = this
          .params as [string, string | null, string | null, string, string];
        const brief = tables.claude_briefs_v02.find((row) => row.id === id);

        if (!brief) {
          return result(0);
        }

        brief.status = status;
        brief.error_code = errorCode;
        brief.error_message = errorMessage;
        brief.updated_at = updatedAt;

        return result(1);
      }

      if (this.sql.includes("UPDATE incidents")) {
        if (this.sql.includes("analysis_attempt_count")) {
          const [attemptedAt, incidentId] = this.params as [string, string];
          const incident = tables.incidents.find(
            (row) => row.id === incidentId,
          );

          if (!incident) {
            return result(0);
          }

          const mutableIncident = incident as IncidentRow & {
            analysis_attempt_count?: number;
            analysis_last_attempt_at?: string;
          };
          mutableIncident.analysis_attempt_count =
            (mutableIncident.analysis_attempt_count ?? 0) + 1;
          mutableIncident.analysis_last_attempt_at = attemptedAt;
          incident.updated_at = new Date().toISOString();

          return result(1);
        }

        const hasExplicitStatus = this.sql.includes("SET status = ?");
        const [status, briefStatus, incidentId] = hasExplicitStatus
          ? (this.params as [string, string, string])
          : (["analysis_limited", "analysis_limited", this.params[0]] as [
              string,
              string,
              string,
            ]);
        const incident = tables.incidents.find((row) => row.id === incidentId);

        if (!incident) {
          return result(0);
        }

        incident.status = status;
        incident.brief_status = briefStatus;
        incident.updated_at = new Date().toISOString();

        return result(1);
      }

      if (this.sql.includes("INSERT INTO job_runs")) {
        const [
          id,
          jobName,
          status,
          startedAt,
          finishedAt,
          message,
          metadataJson,
        ] = this.params as [
          string,
          string,
          string,
          string,
          string | null,
          string,
          string,
        ];

        tables.job_runs.push({
          id,
          job_name: jobName,
          status,
          started_at: startedAt,
          finished_at: finishedAt,
          message,
          metadata_json: metadataJson,
        });

        return result(1);
      }

      if (this.sql.includes("DELETE FROM market_features")) {
        const [cutoff] = this.params as [string];
        const before = tables.market_features.length;
        tables.market_features = tables.market_features.filter(
          (row) => row.open_time >= cutoff,
        );
        return result(before - tables.market_features.length);
      }

      if (this.sql.includes("DELETE FROM raw_signal_events")) {
        const [cutoff] = this.params as [string];
        const before = tables.raw_signal_events.length;
        tables.raw_signal_events = tables.raw_signal_events.filter(
          (row) => row.detected_at >= cutoff,
        );
        return result(before - tables.raw_signal_events.length);
      }

      if (this.sql.includes("DELETE FROM incidents")) {
        const [cutoff] = this.params as [string];
        const before = tables.incidents.length;
        tables.incidents = tables.incidents.filter(
          (row) => row.started_at >= cutoff,
        );
        return result(before - tables.incidents.length);
      }

      if (this.sql.includes("DELETE FROM market_candles")) {
        const [cutoff] = this.params as [string];
        const before = tables.market_candles.length;
        tables.market_candles = tables.market_candles.filter(
          (row) => row.open_time >= cutoff,
        );
        return result(before - tables.market_candles.length);
      }

      if (this.sql.includes("DELETE FROM source_references")) {
        const [cutoff] = this.params as [string];
        const before = tables.source_references.length;
        const oldBriefIds = new Set(
          tables.claude_briefs
            .filter((row) => (row.generated_at ?? row.created_at) < cutoff)
            .map((row) => row.id),
        );
        tables.source_references = tables.source_references.filter(
          (row) => row.created_at >= cutoff && !oldBriefIds.has(row.brief_id),
        );
        return result(before - tables.source_references.length);
      }

      if (this.sql.includes("DELETE FROM claude_briefs")) {
        const [cutoff] = this.params as [string];
        const before = tables.claude_briefs.length;
        tables.claude_briefs = tables.claude_briefs.filter(
          (row) => (row.generated_at ?? row.created_at) >= cutoff,
        );
        return result(before - tables.claude_briefs.length);
      }

      if (this.sql.includes("DELETE FROM claude_analysis_usage")) {
        const [cutoff] = this.params as [string];
        const before = tables.claude_analysis_usage.length;
        tables.claude_analysis_usage = tables.claude_analysis_usage.filter(
          (row) => row.usage_date >= cutoff,
        );
        return result(before - tables.claude_analysis_usage.length);
      }

      return result(0);
    }
  }

  const db = {
    prepare(sql: string) {
      return new Prepared(sql);
    },
    async batch(statements: Array<{ run: () => Promise<D1Result<unknown>> }>) {
      const totalVariables = statements.reduce(
        (sum, statement) =>
          sum + (statement instanceof Prepared ? statement.bindCount() : 0),
        0,
      );

      if (totalVariables > BATCH_BIND_LIMIT) {
        throw new Error("too many SQL variables");
      }

      return Promise.all(statements.map((statement) => statement.run()));
    },
  } as unknown as D1Database;

  return {
    db,
    tables,
  };
}
