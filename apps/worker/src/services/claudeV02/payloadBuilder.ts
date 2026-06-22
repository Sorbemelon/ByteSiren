import { VISIBLE_RANGE_DAYS, isoDaysAgo } from "../../config.ts";
import type {
  DailyOverviewClaudePayloadV02,
  SignalEventClaudePayloadV02,
} from "./types.ts";

interface SignalEventPayloadRow {
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
}

interface SignalSymbolPayloadRow {
  signal_event_id: string;
  symbol: string;
  window_change_pct: number | null;
  peak_15m_change_pct: number | null;
  volume_ratio: number | null;
  range_position: string | null;
  is_lead_mover: number;
  is_peak_15m_highlight: number;
}

interface DailyOverviewPayloadRow {
  id: string;
  date_utc: string;
  day_start: string;
  day_end: string;
  market_tone: string | null;
  daily_change_pct: number | null;
  market_range_pct: number | null;
  notable_symbols_json: string;
  top_symbol_moves_json: string;
  signal_event_ids_json: string;
  market_story_ids_json: string;
  audit_event_count: number;
  daily_chart_context_summary_json: string;
}

interface MarketStoryContextRow {
  id: string;
  date_utc: string;
  story_start: string;
  story_end: string;
  duration_min: number;
  story_label: string;
  story_family: string | null;
  swing_change_pct: number | null;
  range_context_json: string;
  chart_context_score: number | null;
  decision_reasons_json: string;
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseStringArray(value: string): string[] {
  return parseJsonArray(value).filter(
    (item): item is string => typeof item === "string",
  );
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function numberFromRecord(
  object: Record<string, unknown>,
  key: string,
): number | null {
  const value = object[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function directionQueryWord(direction: string): string {
  if (direction.includes("down")) {
    return "crypto market selloff decline";
  }

  return "crypto market rally catalyst";
}

function signalSearchQueries(row: SignalEventPayloadRow): string[] {
  const routeHint = row.source_route_hint
    ? ` ${row.source_route_hint.replaceAll("_", " ")}`
    : "";

  return [
    `${row.date_utc} ${directionQueryWord(row.direction)}`,
    `${row.date_utc} Bitcoin Ethereum crypto catalyst${routeHint}`,
    `${row.event_start.slice(0, 13)} UTC crypto market news`,
  ];
}

function dailySearchQueries(row: DailyOverviewPayloadRow): string[] {
  const tone = row.market_tone
    ? ` ${row.market_tone.replaceAll("_", " ")}`
    : "";
  return [
    `${row.date_utc} crypto market daily context${tone}`,
    `${row.date_utc} Bitcoin Ethereum crypto market news`,
    `${row.date_utc} macro crypto market context`,
  ];
}

async function getSignalSymbols(
  db: D1Database,
  signalEventId: string,
): Promise<SignalSymbolPayloadRow[]> {
  const rows = await db
    .prepare(
      `SELECT
        signal_event_id,
        symbol,
        window_change_pct,
        peak_15m_change_pct,
        volume_ratio,
        range_position,
        is_lead_mover,
        is_peak_15m_highlight
       FROM signal_event_symbols_v02
       WHERE signal_event_id = ?
       ORDER BY symbol ASC`,
    )
    .bind(signalEventId)
    .all<SignalSymbolPayloadRow>();

  return rows.results;
}

async function getSignalRows(
  db: D1Database,
  cutoff: string,
  includeNonPublishable: boolean,
): Promise<SignalEventPayloadRow[]> {
  const publishClause = includeNonPublishable
    ? ""
    : "AND publish_candidate = 1";
  const rows = await db
    .prepare(
      `SELECT
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
        source_route_hint
       FROM signal_events_v02
       WHERE event_start >= ?
         ${publishClause}
       ORDER BY event_end DESC, event_start DESC`,
    )
    .bind(cutoff)
    .all<SignalEventPayloadRow>();

  return rows.results;
}

async function getDailyRows(
  db: D1Database,
  cutoff: string,
): Promise<DailyOverviewPayloadRow[]> {
  const rows = await db
    .prepare(
      `SELECT
        id,
        date_utc,
        day_start,
        day_end,
        market_tone,
        daily_change_pct,
        market_range_pct,
        notable_symbols_json,
        top_symbol_moves_json,
        signal_event_ids_json,
        market_story_ids_json,
        audit_event_count,
        daily_chart_context_summary_json
       FROM daily_overviews_v02
       WHERE day_start >= ?
       ORDER BY date_utc DESC`,
    )
    .bind(cutoff)
    .all<DailyOverviewPayloadRow>();

  return rows.results;
}

async function getMarketStoryRows(
  db: D1Database,
  cutoff: string,
): Promise<MarketStoryContextRow[]> {
  const rows = await db
    .prepare(
      `SELECT
        id,
        date_utc,
        story_start,
        story_end,
        duration_min,
        story_label,
        story_family,
        swing_change_pct,
        range_context_json,
        chart_context_score,
        decision_reasons_json
       FROM market_stories_v02
       WHERE story_start >= ?
         AND publish_candidate = 1
       ORDER BY story_end DESC, story_start DESC`,
    )
    .bind(cutoff)
    .all<MarketStoryContextRow>();

  return rows.results;
}

export async function buildSignalEventClaudePayloadsV02(
  db: D1Database,
  options: {
    days?: number;
    now?: Date;
    includeNonPublishable?: boolean;
  } = {},
): Promise<SignalEventClaudePayloadV02[]> {
  const days = options.days ?? VISIBLE_RANGE_DAYS;
  const cutoff = isoDaysAgo(days, options.now ?? new Date());
  const rows = await getSignalRows(
    db,
    cutoff,
    options.includeNonPublishable ?? false,
  );
  const payloads: SignalEventClaudePayloadV02[] = [];

  for (const row of rows) {
    const symbols = await getSignalSymbols(db, row.id);
    payloads.push({
      mode: "signal_event",
      target_type: "signal_event_v02",
      target_id: row.id,
      event_id: row.id,
      date_utc: row.date_utc,
      evidence_window: {
        start: row.event_start,
        end: row.event_end,
        duration_min: row.duration_min,
        peak_time: row.peak_time,
      },
      direction: row.direction,
      signals_count: row.signals_count,
      n_tracked: row.n_tracked,
      avg_change_label: "Avg Change",
      avg_change_pct: row.avg_change_pct,
      event_strength_score: row.event_strength_score,
      impact_label: row.impact_label,
      chart_context: {
        chart_context_score: row.chart_context_score,
        chart_context_label: row.chart_context_label,
        event_story_type: row.event_story_type,
        trend_context: row.trend_context,
        momentum_context: row.momentum_context,
        volatility_context: row.volatility_context,
        event_range_context: row.event_range_context,
        chart_context_reasons: parseJsonArray(row.chart_context_reasons_json),
        chart_context_warnings: parseJsonArray(row.chart_context_warnings_json),
      },
      macro_context: {
        macro_aligned: row.macro_aligned === 1,
        nearest_macro_event: row.nearest_macro_event,
        macro_delta_min: row.macro_delta_min,
      },
      per_symbol_evidence: symbols.map((symbol) => ({
        symbol: symbol.symbol,
        window_change_label: "Window Change",
        window_change_pct: symbol.window_change_pct,
        peak_15m_label: "Peak 15m",
        peak_15m_change_pct: symbol.peak_15m_change_pct,
        volume_ratio: symbol.volume_ratio,
        range_position_label: "Range Position",
        range_position: symbol.range_position,
        is_lead_mover: symbol.is_lead_mover === 1,
        is_peak_15m_highlight: symbol.is_peak_15m_highlight === 1,
      })),
      source_route_hint: row.source_route_hint,
      suggested_search_queries: signalSearchQueries(row),
      no_trading_advice: true,
    });
  }

  return payloads;
}

export async function buildDailyOverviewClaudePayloadsV02(
  db: D1Database,
  options: { days?: number; now?: Date } = {},
): Promise<DailyOverviewClaudePayloadV02[]> {
  const days = options.days ?? VISIBLE_RANGE_DAYS;
  const cutoff = isoDaysAgo(days, options.now ?? new Date());
  const [dailyRows, storyRows] = await Promise.all([
    getDailyRows(db, cutoff),
    getMarketStoryRows(db, cutoff),
  ]);
  const storiesByDate = new Map<string, MarketStoryContextRow[]>();

  for (const story of storyRows) {
    const existing = storiesByDate.get(story.date_utc) ?? [];
    existing.push(story);
    storiesByDate.set(story.date_utc, existing);
  }

  return dailyRows.map((row) => {
    const stories = storiesByDate.get(row.date_utc) ?? [];
    return {
      mode: "daily_overview",
      target_type: "daily_overview_v02",
      target_id: row.id,
      date_utc: row.date_utc,
      day_start: row.day_start,
      day_end: row.day_end,
      market_tone: row.market_tone,
      daily_change_label: "24h Change",
      daily_change_pct: row.daily_change_pct,
      market_range_pct: row.market_range_pct,
      notable_symbols: parseJsonArray(row.notable_symbols_json),
      top_symbol_moves: parseJsonArray(row.top_symbol_moves_json),
      signal_event_ids_for_day: parseStringArray(row.signal_event_ids_json),
      market_story_ids_for_day: parseStringArray(row.market_story_ids_json),
      audit_event_count_for_day: row.audit_event_count,
      daily_chart_context_summary: parseJsonObject(
        row.daily_chart_context_summary_json,
      ),
      market_stories_for_day: stories.map((story) => ({
        id: story.id,
        story_label: story.story_label,
        story_family: story.story_family,
        story_window: {
          start: story.story_start,
          end: story.story_end,
          duration_min: story.duration_min,
        },
        swing_score:
          numberFromRecord(
            parseJsonObject(story.range_context_json),
            "swing_score",
          ) ?? story.swing_change_pct,
        chart_context_score: story.chart_context_score,
        decision_reasons: parseJsonArray(story.decision_reasons_json),
      })),
      source_query_hints: dailySearchQueries(row),
      no_trading_advice: true,
    };
  });
}
