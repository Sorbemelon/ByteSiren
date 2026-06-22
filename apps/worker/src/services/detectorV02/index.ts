import {
  BASELINE_BARS_24H,
  FIFTEEN_MINUTES_MS,
  MARKET_INTERVAL,
  type MarketSymbol,
} from "../../config.ts";
import type { MarketCandle } from "../../types/market.ts";
import { detectStructuralEvents } from "./experimentStructural.ts";

export type V02EventDirection = "observed_up" | "observed_down";
export type V02RangePosition =
  | "inside_range"
  | "near_high"
  | "near_low"
  | "broke_high"
  | "broke_low";

export interface SignalEventSymbolV02 {
  id: string;
  signal_event_id: string;
  symbol: MarketSymbol;
  window_change_pct: number | null;
  peak_15m_change_pct: number | null;
  volume_ratio: number | null;
  range_position: V02RangePosition | null;
  prev_24h_high: number | null;
  prev_24h_low: number | null;
  range_break_direction: "up" | "down" | "none";
  range_break_pct: number | null;
  range_break_strength: number | null;
  distance_to_range_high_pct: number | null;
  distance_to_range_low_pct: number | null;
  is_lead_mover: boolean;
  is_peak_15m_highlight: boolean;
  participated: boolean;
  evidence_json: string;
}

export interface SignalEventV02 {
  id: string;
  date_utc: string;
  event_start: string;
  event_end: string;
  duration_min: number;
  peak_time: string | null;
  direction: V02EventDirection;
  signals_count: number;
  n_tracked: number;
  avg_change_pct: number | null;
  avg_change_method: "median_participating_symbols";
  event_strength_score: number | null;
  impact_label: "Low" | "Medium" | "High";
  chart_context_score: number | null;
  chart_context_label: string;
  event_story_type: string;
  trend_context: string;
  momentum_context: string;
  volatility_context: string;
  event_range_context: string;
  chart_context_reasons_json: string;
  chart_context_warnings_json: string;
  macro_aligned: boolean;
  nearest_macro_event: string | null;
  macro_delta_min: number | null;
  source_route_hint:
    | "broad_market"
    | "weak_route"
    | "no_clear_route"
    | "possible_relief_rally"
    | "possible_liquidation_context";
  publish_candidate: boolean;
  publish_reason: string | null;
  suppress_reason: string | null;
  detector_version: "v02";
  symbols: SignalEventSymbolV02[];
}

export interface AuditEventV02 {
  id: string;
  date_utc: string;
  event_start: string;
  event_end: string;
  duration_min: number;
  direction: V02EventDirection | "mixed";
  avg_change_pct: number | null;
  signals_count: number;
  n_tracked: number;
  event_strength_score: number | null;
  chart_context_score: number | null;
  chart_context_label: string | null;
  suppress_reason: string;
  why_suppressed: string;
  nearby_public_event_id: string | null;
  detector_version: "v02";
  evidence_json: string;
}

export interface DetectorV02Result {
  signal_events: SignalEventV02[];
  audit_events: AuditEventV02[];
  summary: {
    detector_version: "v02";
    signal_count: number;
    audit_count: number;
    publish_candidate_count: number;
    suppressed_count: number;
    counts_by_reason: Record<string, number>;
  };
}

type ExperimentEvent = Record<string, unknown>;

const validRangePositions = new Set<V02RangePosition>([
  "inside_range",
  "near_high",
  "near_low",
  "broke_high",
  "broke_low",
]);
const validSourceRoutes = new Set<SignalEventV02["source_route_hint"]>([
  "broad_market",
  "weak_route",
  "no_clear_route",
  "possible_relief_rally",
  "possible_liquidation_context",
]);

function nullableNumber(value: unknown): number | null {
  return Number.isFinite(value) ? Number(value) : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function json(value: unknown) {
  return JSON.stringify(value ?? null);
}

function dateUtc(iso: unknown) {
  return typeof iso === "string" ? iso.slice(0, 10) : "";
}

function normalizeDirection(value: unknown): V02EventDirection {
  return value === "observed_down" ? "observed_down" : "observed_up";
}

function normalizeImpactLabel(value: unknown): SignalEventV02["impact_label"] {
  const label = String(value ?? "").toLowerCase();
  if (label.includes("high")) {
    return "High";
  }
  if (label.includes("medium")) {
    return "Medium";
  }
  return "Low";
}

function normalizeRangePosition(value: unknown): V02RangePosition | null {
  return validRangePositions.has(value as V02RangePosition)
    ? (value as V02RangePosition)
    : null;
}

function normalizeRangeBreakDirection(value: unknown): "up" | "down" | "none" {
  return value === "up" || value === "down" ? value : "none";
}

function normalizeSourceRouteHint(
  value: unknown,
): SignalEventV02["source_route_hint"] {
  const route = Array.isArray(value) ? value[0] : value;
  return validSourceRoutes.has(route as SignalEventV02["source_route_hint"])
    ? (route as SignalEventV02["source_route_hint"])
    : "no_clear_route";
}

function normalizeTrendContext(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && "trend_context" in value) {
    return String((value as { trend_context?: unknown }).trend_context);
  }
  return "trend_mixed";
}

function normalizeMomentumContext(event: ExperimentEvent): string {
  if (typeof event.momentum_type === "string") {
    return event.momentum_type;
  }
  if (typeof event.momentum_context === "string") {
    return event.momentum_context;
  }
  if (
    event.momentum_context &&
    typeof event.momentum_context === "object" &&
    "momentum_context" in event.momentum_context
  ) {
    return String(
      (event.momentum_context as { momentum_context?: unknown })
        .momentum_context,
    );
  }
  return "no_clear_momentum";
}

function mapSymbolEvidence(
  event: ExperimentEvent,
  direction: V02EventDirection,
): SignalEventSymbolV02[] {
  const leadMover =
    (event.table_highlights as { lead_mover_symbol?: string } | undefined)
      ?.lead_mover_symbol ?? null;
  const strongestPeak =
    (event.table_highlights as { strongest_peak_symbol?: string } | undefined)
      ?.strongest_peak_symbol ?? null;

  return ((event.per_symbol_evidence as ExperimentEvent[] | undefined) ?? [])
    .filter((row) => typeof row.symbol === "string")
    .map((row) => {
      const symbol = row.symbol as MarketSymbol;
      const windowChangePct = nullableNumber(row.window_change_pct);
      const peak15m = nullableNumber(
        row.peak_15m_move_pct ?? row.peak_15m_change_pct,
      );

      return {
        id: `${event.event_id}_${symbol}`,
        signal_event_id: String(event.event_id),
        symbol,
        window_change_pct: windowChangePct,
        peak_15m_change_pct: peak15m,
        volume_ratio: nullableNumber(row.max_volume_ratio ?? row.volume_x),
        range_position: normalizeRangePosition(row.range_position),
        prev_24h_high: nullableNumber(row.prev_24h_high),
        prev_24h_low: nullableNumber(row.prev_24h_low),
        range_break_direction: normalizeRangeBreakDirection(
          row.range_break_direction,
        ),
        range_break_pct: nullableNumber(row.range_break_pct),
        range_break_strength: nullableNumber(row.range_break_strength),
        distance_to_range_high_pct: nullableNumber(
          row.distance_to_range_high_pct,
        ),
        distance_to_range_low_pct: nullableNumber(
          row.distance_to_range_low_pct,
        ),
        is_lead_mover: symbol === leadMover,
        is_peak_15m_highlight: symbol === strongestPeak,
        participated:
          direction === "observed_up"
            ? (windowChangePct ?? 0) > 0
            : (windowChangePct ?? 0) < 0,
        evidence_json: json(row),
      };
    });
}

function signalEventFromExperiment(event: ExperimentEvent): SignalEventV02 {
  const direction = normalizeDirection(event.direction);

  return {
    id: String(event.event_id),
    date_utc: dateUtc(event.window_start),
    event_start: String(event.window_start),
    event_end: String(event.window_end),
    duration_min: Number(event.duration_min),
    peak_time: stringOrNull(event.peak_time),
    direction,
    signals_count: Number(event.signals_count ?? event.breadth_count ?? 0),
    n_tracked: Number(event.n_tracked ?? 5),
    avg_change_pct: nullableNumber(event.window_move_pct),
    avg_change_method: "median_participating_symbols",
    event_strength_score: nullableNumber(event.signal_strength_score),
    impact_label: normalizeImpactLabel(event.event_strength_label),
    chart_context_score: nullableNumber(event.chart_context_score),
    chart_context_label: String(event.chart_context_label ?? ""),
    event_story_type: String(event.event_story_type ?? ""),
    trend_context: normalizeTrendContext(event.trend_context),
    momentum_context: normalizeMomentumContext(event),
    volatility_context: String(event.volatility_context ?? ""),
    event_range_context: String(event.event_range_context ?? ""),
    chart_context_reasons_json: json(event.chart_context_reasons ?? []),
    chart_context_warnings_json: json(event.chart_context_warnings ?? []),
    macro_aligned: Boolean(event.macro_aligned),
    nearest_macro_event: stringOrNull(event.nearest_macro_event),
    macro_delta_min: nullableNumber(event.macro_delta_min),
    source_route_hint: normalizeSourceRouteHint(event.source_route_hint),
    publish_candidate: true,
    publish_reason: stringOrNull(event.publish_reason),
    suppress_reason: null,
    detector_version: "v02",
    symbols: mapSymbolEvidence(event, direction),
  };
}

function auditEventFromExperiment(event: ExperimentEvent): AuditEventV02 {
  return {
    id: String(event.event_id),
    date_utc: dateUtc(event.window_start),
    event_start: String(event.window_start),
    event_end: String(event.window_end),
    duration_min: Number(event.duration_min),
    direction: normalizeDirection(event.direction),
    avg_change_pct: nullableNumber(event.window_move_pct),
    signals_count: Number(event.signals_count ?? event.breadth_count ?? 0),
    n_tracked: Number(event.n_tracked ?? 5),
    event_strength_score: nullableNumber(event.signal_strength_score),
    chart_context_score: nullableNumber(event.chart_context_score),
    chart_context_label: stringOrNull(event.chart_context_label),
    suppress_reason: stringOrNull(event.suppress_reason) ?? "not_public",
    why_suppressed:
      "Detected movement did not meet the accepted v0.2 structural public Signal Event gate.",
    nearby_public_event_id: null,
    detector_version: "v02",
    evidence_json: json({
      event_range_context: event.event_range_context,
      event_story_type: event.event_story_type,
      trend_context: event.trend_context,
      momentum_context: event.momentum_context,
      momentum_type: event.momentum_type,
      volatility_context: event.volatility_context,
      structural_pattern: event.structural_pattern,
      structural_pattern_components: event.structural_pattern_components,
      chart_context_reasons: event.chart_context_reasons,
      chart_context_warnings: event.chart_context_warnings,
      publish_gate: event.publish_gate,
      per_symbol_evidence: event.per_symbol_evidence,
    }),
  };
}

export function detectSignalAndAuditEventsV02(input: {
  candlesBySymbol: Partial<Record<MarketSymbol, MarketCandle[]>>;
}): DetectorV02Result {
  const accepted = detectStructuralEvents({
    candlesBySymbol: input.candlesBySymbol,
  });
  const signalEvents: SignalEventV02[] = [];
  const auditEvents: AuditEventV02[] = [];

  for (const event of (accepted.events ?? []) as ExperimentEvent[]) {
    if (event.publish_candidate) {
      signalEvents.push(signalEventFromExperiment(event));
    } else {
      auditEvents.push(auditEventFromExperiment(event));
    }
  }

  const countsByReason = auditEvents.reduce<Record<string, number>>(
    (counts, event) => {
      counts[event.suppress_reason] = (counts[event.suppress_reason] ?? 0) + 1;
      return counts;
    },
    {},
  );

  return {
    signal_events: signalEvents,
    audit_events: auditEvents,
    summary: {
      detector_version: "v02",
      signal_count: signalEvents.length,
      audit_count: auditEvents.length,
      publish_candidate_count: signalEvents.length,
      suppressed_count: auditEvents.length,
      counts_by_reason: countsByReason,
    },
  };
}

export const DETECTOR_V02_VERSION = "v02";
export const DETECTOR_V02_INTERVAL = MARKET_INTERVAL;
export const DETECTOR_V02_MIN_CANDLES = BASELINE_BARS_24H + 1;
export const DETECTOR_V02_BAR_MS = FIFTEEN_MINUTES_MS;
