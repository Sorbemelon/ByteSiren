export const MARKET_STORY_V02_MODEL_VERSION = "adaptive_chart_context_gap_v3";

export const MARKET_STORY_V02_DEFAULT_OPTIONS = {
  baseGapMinutes: 240,
  minGapMinutes: 120,
  maxGapMinutes: 720,
  fullMarketResetGapMinutes: 960,
  sameDirectionGapBonusMinutes: 120,
  strongChartContextGapBonusMinutes: 180,
  strongAuditSequenceGapBonusMinutes: 360,
  strongAuditSequenceMaxGapMinutes: 960,
  strongAuditCounterSwingGapMinutes: 240,
  sharedStoryFamilyGapBonusMinutes: 120,
  sharedRangeContextGapBonusMinutes: 60,
  publicAuditBridgeGapBonusMinutes: 60,
  macroGapBonusMinutes: 60,
  oppositeDirectionStrongGapBonusMinutes: 120,
  oppositeDirectionSoftCapMinutes: 360,
  oppositeDirectionStrongCapMinutes: 600,
  weakAuditGapCapMinutes: 180,
  storyContinuationBridgeMaxGapMinutes: 960,
  minPublicSignals: 2,
  minAuditEvents: 2,
  minStoryDurationMinutes: 240,
  minStorySwingChangePct: 2,
  minTwoSidedLegSwingPct: 0.75,
  strongChartContextScore: 75,
  strongAuditSequenceAverageScore: 75,
  mixedStrongChartContextAverageScore: 65,
} as const;

export type MarketStoryDirectionV02 =
  | "observed_up"
  | "observed_down"
  | "two_sided";

export type MarketStoryLabelV02 =
  | "Range break sequence"
  | "Reversal sequence"
  | "Momentum continuation sequence"
  | "Volatility expansion sequence"
  | "Inside-range impulse sequence"
  | "Mixed sequence";

export type MarketStoryFamilyV02 =
  | "range_break"
  | "relief_reversal"
  | "momentum_continuation"
  | "volatility_expansion"
  | "inside_range_impulse"
  | "mixed_context";

export type MarketStorySourceTypeV02 =
  | "signal_sequence"
  | "mixed_signal_audit_sequence"
  | "audit_only_sequence";

export interface MarketStorySourceEventV02 {
  id: string;
  member_type: "signal_event_v02" | "audit_event_v02";
  event_start: string;
  event_end: string;
  direction: "observed_up" | "observed_down" | "mixed";
  avg_change_pct: number | null;
  signals_count: number | null;
  chart_context_score: number | null;
  chart_context_label: string | null;
  event_story_type: string | null;
  event_range_context: string | null;
  trend_context: string | null;
  momentum_context: string | null;
  volatility_context: string | null;
  publish_candidate: boolean;
  macro_aligned: boolean;
  suppress_reason?: string | null;
}

export interface MarketStoryCandleV02 {
  symbol: string;
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketStorySymbolEvidenceV02 {
  symbol: string;
  avg_change_label: "Avg Change";
  avg_change_pct: number | null;
  range_pct: number | null;
  swing_score_label: "Volatility Score";
  swing_score: number | null;
  volume_ratio: number | null;
  movement_status_label: "Movement Status";
  movement_status: string;
  bar_count: number;
}

export interface MarketStoryMemberV02 {
  id: string;
  market_story_id: string;
  member_type: "signal_event_v02" | "audit_event_v02";
  member_id: string;
  display_order: number;
  role: string;
}

export interface MarketStoryV02 {
  id: string;
  date_utc: string;
  story_start: string;
  story_end: string;
  duration_min: number;
  story_label: MarketStoryLabelV02;
  story_family: MarketStoryFamilyV02;
  direction: MarketStoryDirectionV02;
  swing_change_pct: number | null;
  chart_context_score: number;
  range_context_json: string;
  trend_context_json: string;
  momentum_context_json: string;
  volatility_context_json: string;
  decision_reasons_json: string;
  included_signal_event_ids_json: string;
  included_audit_event_ids_json: string;
  publish_candidate: boolean;
  publish_reason: string | null;
  suppress_reason: string | null;
}

export interface MarketStoryV02Output {
  market_stories: MarketStoryV02[];
  market_story_members: MarketStoryMemberV02[];
  summary: {
    story_model_version: typeof MARKET_STORY_V02_MODEL_VERSION;
    story_count: number;
    publish_candidate_count: number;
    suppressed_count: number;
    audit_only_story_count: number;
    signal_story_count: number;
    signal_audit_story_count: number;
    counts_by_label: Record<string, number>;
    counts_by_source: Record<string, number>;
  };
}

interface MarketStoryOptionsV02 {
  baseGapMinutes: number;
  minGapMinutes: number;
  maxGapMinutes: number;
  fullMarketResetGapMinutes: number;
  sameDirectionGapBonusMinutes: number;
  strongChartContextGapBonusMinutes: number;
  strongAuditSequenceGapBonusMinutes: number;
  strongAuditSequenceMaxGapMinutes: number;
  strongAuditCounterSwingGapMinutes: number;
  sharedStoryFamilyGapBonusMinutes: number;
  sharedRangeContextGapBonusMinutes: number;
  publicAuditBridgeGapBonusMinutes: number;
  macroGapBonusMinutes: number;
  oppositeDirectionStrongGapBonusMinutes: number;
  oppositeDirectionSoftCapMinutes: number;
  oppositeDirectionStrongCapMinutes: number;
  weakAuditGapCapMinutes: number;
  storyContinuationBridgeMaxGapMinutes: number;
  minPublicSignals: number;
  minAuditEvents: number;
  minStoryDurationMinutes: number;
  minStorySwingChangePct: number;
  minTwoSidedLegSwingPct: number;
  strongChartContextScore: number;
  strongAuditSequenceAverageScore: number;
  mixedStrongChartContextAverageScore: number;
}

interface StoryClusterV02 {
  events: MarketStorySourceEventV02[];
  gapReasons: string[];
}

interface StoryEligibilityV02 {
  eligible: boolean;
  reason: string;
  publicCount: number;
  auditCount: number;
  averageChartContextScore: number;
  durationMin: number;
  eventSwingPct: number;
}

interface StoryBarStatsV02 {
  avgChangePct: number | null;
  swingScore: number | null;
  perSymbolEvidence: MarketStorySymbolEvidenceV02[];
}

const STRUCTURED_STORY_FAMILIES = new Set<MarketStoryFamilyV02>([
  "range_break",
  "relief_reversal",
  "momentum_continuation",
  "volatility_expansion",
  "inside_range_impulse",
]);

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function toTime(iso: string): number {
  return Date.parse(iso);
}

function minutesBetween(aIso: string, bIso: string): number {
  return (toTime(bIso) - toTime(aIso)) / 60000;
}

function durationMinutes(startIso: string, endIso: string): number {
  return Math.max(0, Math.round(minutesBetween(startIso, endIso)));
}

function stableHash(parts: string[]): string {
  let hash = 0x811c9dc5;
  const input = parts.join("|");

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function eventScore(event: MarketStorySourceEventV02): number {
  return Number.isFinite(event.chart_context_score)
    ? Number(event.chart_context_score)
    : 0;
}

function eventDirection(
  event: MarketStorySourceEventV02,
): MarketStoryDirectionV02 {
  return event.direction === "mixed" ? "two_sided" : event.direction;
}

function storyDirection(
  events: MarketStorySourceEventV02[],
): MarketStoryDirectionV02 {
  const directions = new Set(events.map(eventDirection));
  if (directions.has("two_sided")) return "two_sided";
  if (directions.has("observed_up") && directions.has("observed_down")) {
    return "two_sided";
  }
  if (directions.has("observed_down")) return "observed_down";
  return "observed_up";
}

function storyFamily(event: MarketStorySourceEventV02): MarketStoryFamilyV02 {
  const type = event.event_story_type ?? "";
  const label = event.chart_context_label ?? "";
  const rangeContext = event.event_range_context ?? "";

  if (type.includes("range_break") || label === "Range break") {
    return "range_break";
  }
  if (
    type.includes("relief_reversal") ||
    type.includes("reversal") ||
    label === "Relief / reversal" ||
    label === "Reversal sequence"
  ) {
    return "relief_reversal";
  }
  if (
    type.includes("momentum") ||
    label === "Momentum continuation" ||
    event.momentum_context === "continuation"
  ) {
    return "momentum_continuation";
  }
  if (
    type.includes("volatility_expansion") ||
    label === "Volatility expansion" ||
    event.volatility_context === "volatility_expansion"
  ) {
    return "volatility_expansion";
  }
  if (
    type.includes("inside_range_impulse") ||
    label === "Inside-range impulse" ||
    rangeContext === "mostly_inside_range" ||
    rangeContext === "weak_range_context"
  ) {
    return "inside_range_impulse";
  }
  if (
    rangeContext === "broad_broke_high" ||
    rangeContext === "broad_broke_low"
  ) {
    return "range_break";
  }

  return "mixed_context";
}

function isStrongChartContext(
  event: MarketStorySourceEventV02,
  options: MarketStoryOptionsV02,
): boolean {
  if (eventScore(event) >= options.strongChartContextScore) return true;

  return [
    "Range break",
    "Momentum continuation",
    "Relief / reversal",
    "Volatility expansion",
    "Strong chart context",
    "Macro-aligned context",
  ].includes(event.chart_context_label ?? "");
}

function averageChartScore(events: MarketStorySourceEventV02[]): number {
  if (events.length === 0) return 0;
  return round(
    events.reduce((sum, event) => sum + eventScore(event), 0) / events.length,
    4,
  );
}

function swingChangePct(events: MarketStorySourceEventV02[]): number {
  return round(
    events.reduce(
      (sum, event) => sum + Math.abs(Number(event.avg_change_pct ?? 0)),
      0,
    ),
    4,
  );
}

function percentChange(current: number, previous: number): number | null {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rootMeanSquare(values: number[]): number | null {
  if (values.length === 0) return null;
  const meanSquare =
    values.reduce((sum, value) => sum + value ** 2, 0) / values.length;
  return Math.sqrt(meanSquare) * 100;
}

function barReturnPct(candle: MarketStoryCandleV02): number | null {
  return percentChange(Number(candle.close), Number(candle.open));
}

function movementStatus(
  avgChangePct: number | null,
  swingScore: number | null,
): string {
  if (avgChangePct === null) return "No bar data";
  if (Math.abs(avgChangePct) < 0.15 && (swingScore ?? 0) >= 35) {
    return "Choppy";
  }
  if (Math.abs(avgChangePct) < 0.15) {
    return "Mostly flat";
  }
  return avgChangePct > 0 ? "Net up" : "Net down";
}

function storyBarStats(
  storyStart: string,
  storyEnd: string,
  candles: MarketStoryCandleV02[] = [],
): StoryBarStatsV02 {
  const bySymbol = new Map<string, MarketStoryCandleV02[]>();

  for (const candle of candles) {
    if (candle.open_time < storyStart || candle.close_time > storyEnd) {
      continue;
    }

    const rows = bySymbol.get(candle.symbol) ?? [];
    rows.push(candle);
    bySymbol.set(candle.symbol, rows);
  }

  const allReturns: number[] = [];
  const perSymbolEvidence = [...bySymbol.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([symbol, rows]) => {
      const sortedRows = rows.sort((a, b) =>
        a.open_time.localeCompare(b.open_time),
      );
      const returns = sortedRows
        .map(barReturnPct)
        .filter((value): value is number => value !== null);
      allReturns.push(...returns);

      const first = sortedRows[0];
      const last = sortedRows.at(-1);
      const avgChangePct =
        first && last
          ? percentChange(Number(last.close), Number(first.open))
          : null;
      const high = Math.max(...sortedRows.map((row) => Number(row.high)));
      const low = Math.min(...sortedRows.map((row) => Number(row.low)));
      const rangePct =
        first && Number(first.open) > 0
          ? ((high - low) / Number(first.open)) * 100
          : null;
      const swingScore = rootMeanSquare(returns);
      const baselineRows = candles.filter(
        (candle) =>
          candle.symbol === symbol &&
          candle.close_time <= storyStart &&
          candle.volume > 0,
      );
      const baselineVolume =
        average(
          baselineRows.slice(-96).map((candle) => Number(candle.volume)),
        ) ?? null;
      const windowVolume =
        average(sortedRows.map((candle) => Number(candle.volume))) ?? null;
      const volumeRatio =
        baselineVolume && windowVolume
          ? round(windowVolume / baselineVolume, 4)
          : null;

      return {
        symbol,
        avg_change_label: "Avg Change" as const,
        avg_change_pct: avgChangePct === null ? null : round(avgChangePct, 4),
        range_pct: rangePct === null ? null : round(rangePct, 4),
        swing_score_label: "Volatility Score" as const,
        swing_score: swingScore === null ? null : Math.round(swingScore),
        volume_ratio: volumeRatio,
        movement_status_label: "Movement Status" as const,
        movement_status: movementStatus(avgChangePct, swingScore),
        bar_count: sortedRows.length,
      };
    });

  const avgChanges = perSymbolEvidence
    .map((row) => row.avg_change_pct)
    .filter((value): value is number => value !== null);
  const avgChangePct = average(avgChanges);
  const swingScore = rootMeanSquare(allReturns);

  return {
    avgChangePct: avgChangePct === null ? null : round(avgChangePct, 4),
    swingScore: swingScore === null ? null : Math.round(swingScore),
    perSymbolEvidence,
  };
}

function directionalSwingStats(events: MarketStorySourceEventV02[]) {
  const stats = {
    upSwingPct: 0,
    downSwingPct: 0,
    upCount: 0,
    downCount: 0,
  };

  for (const event of events) {
    const swing = Math.abs(Number(event.avg_change_pct ?? 0));
    if (event.direction === "observed_up") {
      stats.upSwingPct += swing;
      stats.upCount += 1;
    }
    if (event.direction === "observed_down") {
      stats.downSwingPct += swing;
      stats.downCount += 1;
    }
  }

  return {
    up_swing_pct: round(stats.upSwingPct, 4),
    down_swing_pct: round(stats.downSwingPct, 4),
    up_event_count: stats.upCount,
    down_event_count: stats.downCount,
  };
}

function familyScores(events: MarketStorySourceEventV02[]) {
  const scores: Record<MarketStoryFamilyV02, number> = {
    range_break: 0,
    relief_reversal: 0,
    momentum_continuation: 0,
    volatility_expansion: 0,
    inside_range_impulse: 0,
    mixed_context: 0,
  };
  const counts: Record<MarketStoryFamilyV02, number> = {
    range_break: 0,
    relief_reversal: 0,
    momentum_continuation: 0,
    volatility_expansion: 0,
    inside_range_impulse: 0,
    mixed_context: 0,
  };

  for (const event of events) {
    const family = storyFamily(event);
    counts[family] += 1;
    const type = event.event_story_type ?? "";
    const label = event.chart_context_label ?? "";
    const rangeContext = event.event_range_context ?? "";
    let matchedSpecificFamily = false;

    if (type.includes("range_break") || label === "Range break") {
      scores.range_break += 4;
      matchedSpecificFamily = true;
    }
    if (
      rangeContext === "broad_broke_high" ||
      rangeContext === "broad_broke_low"
    ) {
      scores.range_break += 2;
    }

    if (
      type.includes("relief_reversal") ||
      type.includes("reversal") ||
      label === "Relief / reversal" ||
      label === "Reversal sequence"
    ) {
      scores.relief_reversal += 4;
      matchedSpecificFamily = true;
    }

    if (type.includes("momentum") || label === "Momentum continuation") {
      scores.momentum_continuation += 4;
      matchedSpecificFamily = true;
    }
    if (event.momentum_context === "continuation") {
      scores.momentum_continuation += 1;
    }

    if (
      type.includes("volatility_expansion") ||
      label === "Volatility expansion" ||
      event.volatility_context === "volatility_expansion"
    ) {
      scores.volatility_expansion += 4;
      matchedSpecificFamily = true;
    }
    if (event.volatility_context === "high_volatility_continuation") {
      scores.volatility_expansion += 0.5;
    }

    if (
      type.includes("inside_range_impulse") ||
      label === "Inside-range impulse" ||
      rangeContext === "mostly_inside_range" ||
      rangeContext === "weak_range_context"
    ) {
      scores.inside_range_impulse +=
        type.includes("inside_range_impulse") ||
        label === "Inside-range impulse"
          ? 4
          : 2;
      matchedSpecificFamily = true;
    }

    if (!matchedSpecificFamily) {
      scores.mixed_context += 1;
    }
  }

  return {
    scores: Object.fromEntries(
      Object.entries(scores).map(([family, score]) => [family, round(score)]),
    ) as Record<MarketStoryFamilyV02, number>,
    counts,
  };
}

function dominantFamily(events: MarketStorySourceEventV02[]) {
  const { scores, counts } = familyScores(events);
  const direction = storyDirection(events);
  const directionalStats = directionalSwingStats(events);
  const twoSidedEligible =
    direction === "two_sided" &&
    directionalStats.up_swing_pct >=
      MARKET_STORY_V02_DEFAULT_OPTIONS.minTwoSidedLegSwingPct &&
    directionalStats.down_swing_pct >=
      MARKET_STORY_V02_DEFAULT_OPTIONS.minTwoSidedLegSwingPct;

  if (twoSidedEligible) {
    const hasReversalEvidence =
      (counts.relief_reversal ?? 0) > 0 || scores.relief_reversal >= 4;
    scores.relief_reversal += hasReversalEvidence ? 2 : 1;
  }

  const priority: MarketStoryFamilyV02[] = [
    "relief_reversal",
    "volatility_expansion",
    "inside_range_impulse",
    "range_break",
    "momentum_continuation",
    "mixed_context",
  ];
  const ranked = priority
    .map((family, index) => ({
      family,
      score: scores[family] ?? 0,
      count: counts[family] ?? 0,
      priority: index,
    }))
    .sort((a, b) => b.score - a.score || a.priority - b.priority);
  const winner = ranked[0];
  const runnerUp = ranked[1];
  const lowConfidenceWinner = winner.score < 2;
  const ambiguousSpecificWinner =
    winner.family !== "mixed_context" &&
    runnerUp &&
    runnerUp.family !== "mixed_context" &&
    runnerUp.score >= 2 &&
    winner.score - runnerUp.score < 1;

  return {
    family:
      lowConfidenceWinner || ambiguousSpecificWinner
        ? "mixed_context"
        : winner.family,
    score: winner.score,
    scores,
    counts,
  };
}

function labelForFamily(family: MarketStoryFamilyV02): MarketStoryLabelV02 {
  if (family === "range_break") return "Range break sequence";
  if (family === "relief_reversal") return "Reversal sequence";
  if (family === "momentum_continuation") {
    return "Momentum continuation sequence";
  }
  if (family === "volatility_expansion") {
    return "Volatility expansion sequence";
  }
  if (family === "inside_range_impulse") {
    return "Inside-range impulse sequence";
  }
  return "Mixed sequence";
}

function hasSharedStructure(
  previous: MarketStorySourceEventV02,
  next: MarketStorySourceEventV02,
): boolean {
  const previousFamily = storyFamily(previous);
  const nextFamily = storyFamily(next);
  return (
    (previousFamily === nextFamily && previousFamily !== "mixed_context") ||
    (Boolean(previous.event_range_context) &&
      previous.event_range_context === next.event_range_context)
  );
}

function hasCoherentStoryStructure(
  previous: MarketStorySourceEventV02,
  next: MarketStorySourceEventV02,
  gapMinutes: number,
  options: MarketStoryOptionsV02,
): boolean {
  if (previous.direction === next.direction) return true;
  if (hasSharedStructure(previous, next)) return true;
  if (
    storyFamily(previous) === "relief_reversal" ||
    storyFamily(next) === "relief_reversal"
  ) {
    return true;
  }

  return (
    isStrongChartContext(previous, options) &&
    isStrongChartContext(next, options) &&
    gapMinutes <= options.strongAuditCounterSwingGapMinutes
  );
}

function crossesFullMarketReset(
  previous: MarketStorySourceEventV02,
  next: MarketStorySourceEventV02,
  gapMinutes: number,
  options: MarketStoryOptionsV02,
): boolean {
  if (gapMinutes > options.fullMarketResetGapMinutes) return true;
  if (previous.direction === next.direction) return false;
  return !hasCoherentStoryStructure(previous, next, gapMinutes, options);
}

function hasStructuredContext(events: MarketStorySourceEventV02[]): boolean {
  return events.some((event) =>
    STRUCTURED_STORY_FAMILIES.has(storyFamily(event)),
  );
}

function clusterHasStrongAuditOnlyContext(
  events: MarketStorySourceEventV02[],
  options: MarketStoryOptionsV02,
): boolean {
  if (events.length < options.minAuditEvents) return false;
  if (events.some((event) => event.publish_candidate)) return false;
  if (!events.every((event) => isStrongChartContext(event, options))) {
    return false;
  }
  if (averageChartScore(events) < options.strongAuditSequenceAverageScore) {
    return false;
  }
  if (!hasStructuredContext(events)) return false;

  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const next = events[index];
    const gapMinutes = Math.max(
      0,
      Math.round(minutesBetween(previous.event_end, next.event_start)),
    );
    if (crossesFullMarketReset(previous, next, gapMinutes, options)) {
      return false;
    }
  }

  return true;
}

function clusterHasStrongMixedPublicAuditContext(
  events: MarketStorySourceEventV02[],
  options: MarketStoryOptionsV02,
): boolean {
  const publicCount = events.filter((event) => event.publish_candidate).length;
  const auditCount = events.length - publicCount;
  if (publicCount < 1 || auditCount < 1) return false;
  if (averageChartScore(events) < options.mixedStrongChartContextAverageScore) {
    return false;
  }
  if (!hasStructuredContext(events)) return false;

  return events.every(
    (event) => event.publish_candidate || isStrongChartContext(event, options),
  );
}

function storyRange(
  events: MarketStorySourceEventV02[],
  candles: MarketStoryCandleV02[] = [],
) {
  const storyStart = events[0].event_start;
  const storyEnd = events.reduce(
    (latest, event) =>
      event.event_end.localeCompare(latest) > 0 ? event.event_end : latest,
    events[0].event_end,
  );

  return {
    storyStart,
    storyEnd,
    durationMin: durationMinutes(storyStart, storyEnd),
    eventSwingPct: swingChangePct(events),
    barStats: storyBarStats(storyStart, storyEnd, candles),
  };
}

function storyEligibility(
  events: MarketStorySourceEventV02[],
  options: MarketStoryOptionsV02,
): StoryEligibilityV02 {
  const publicCount = events.filter((event) => event.publish_candidate).length;
  const auditCount = events.length - publicCount;
  const range = storyRange(events);
  const averageScore = averageChartScore(events);

  if (
    range.durationMin < options.minStoryDurationMinutes ||
    range.eventSwingPct < options.minStorySwingChangePct
  ) {
    return {
      eligible: false,
      reason: "below_minimum_story_range",
      publicCount,
      auditCount,
      averageChartContextScore: averageScore,
      durationMin: range.durationMin,
      eventSwingPct: range.eventSwingPct,
    };
  }

  if (publicCount >= options.minPublicSignals) {
    return {
      eligible: true,
      reason: "min_public_signals",
      publicCount,
      auditCount,
      averageChartContextScore: averageScore,
      durationMin: range.durationMin,
      eventSwingPct: range.eventSwingPct,
    };
  }

  if (
    publicCount === 0 &&
    auditCount >= options.minAuditEvents &&
    clusterHasStrongAuditOnlyContext(events, options)
  ) {
    return {
      eligible: true,
      reason: "strong_audit_context_sequence",
      publicCount,
      auditCount,
      averageChartContextScore: averageScore,
      durationMin: range.durationMin,
      eventSwingPct: range.eventSwingPct,
    };
  }

  if (clusterHasStrongMixedPublicAuditContext(events, options)) {
    return {
      eligible: true,
      reason: "mixed_public_audit_strong_chart_context",
      publicCount,
      auditCount,
      averageChartContextScore: averageScore,
      durationMin: range.durationMin,
      eventSwingPct: range.eventSwingPct,
    };
  }

  return {
    eligible: false,
    reason: "below_story_threshold",
    publicCount,
    auditCount,
    averageChartContextScore: averageScore,
    durationMin: range.durationMin,
    eventSwingPct: range.eventSwingPct,
  };
}

function adaptiveGapDecision(
  previous: MarketStorySourceEventV02,
  next: MarketStorySourceEventV02,
  clusterEvents: MarketStorySourceEventV02[],
  options: MarketStoryOptionsV02,
) {
  const gapMinutes = Math.max(
    0,
    Math.round(minutesBetween(previous.event_end, next.event_start)),
  );
  const reasons = ["base_gap"];
  const previousFamily = storyFamily(previous);
  const nextFamily = storyFamily(next);
  const sameDirection = previous.direction === next.direction;
  const bothStrong =
    isStrongChartContext(previous, options) &&
    isStrongChartContext(next, options);
  const auditOnlyPair = !previous.publish_candidate && !next.publish_candidate;
  const mixedPublicAudit =
    previous.publish_candidate !== next.publish_candidate;
  const coherentStoryStructure = hasCoherentStoryStructure(
    previous,
    next,
    gapMinutes,
    options,
  );
  const fullMarketReset = crossesFullMarketReset(
    previous,
    next,
    gapMinutes,
    options,
  );
  const strongAuditSequenceBridge =
    auditOnlyPair &&
    bothStrong &&
    hasStructuredContext([previous, next]) &&
    coherentStoryStructure &&
    !fullMarketReset;
  let allowedGapMinutes = options.baseGapMinutes;
  let maxGapMinutes = options.maxGapMinutes;
  let oppositeDirectionCap = options.oppositeDirectionSoftCapMinutes;

  if (sameDirection) {
    allowedGapMinutes += options.sameDirectionGapBonusMinutes;
    reasons.push("same_direction");
  }

  if (bothStrong) {
    allowedGapMinutes += options.strongChartContextGapBonusMinutes;
    reasons.push("strong_chart_context_pair");
  }

  if (previousFamily === nextFamily && previousFamily !== "mixed_context") {
    allowedGapMinutes += options.sharedStoryFamilyGapBonusMinutes;
    reasons.push(`shared_${previousFamily}`);
  }

  if (
    previous.event_range_context &&
    previous.event_range_context === next.event_range_context
  ) {
    allowedGapMinutes += options.sharedRangeContextGapBonusMinutes;
    reasons.push("shared_range_context");
  }

  if (mixedPublicAudit) {
    allowedGapMinutes += options.publicAuditBridgeGapBonusMinutes;
    reasons.push("public_audit_bridge");
  }

  if (strongAuditSequenceBridge) {
    allowedGapMinutes += options.strongAuditSequenceGapBonusMinutes;
    maxGapMinutes = options.strongAuditSequenceMaxGapMinutes;
    oppositeDirectionCap = Math.max(
      oppositeDirectionCap,
      options.strongAuditSequenceMaxGapMinutes,
    );
    reasons.push("strong_audit_sequence_bridge");
    reasons.push("no_full_market_reset");
  }

  if (previous.macro_aligned || next.macro_aligned) {
    allowedGapMinutes += options.macroGapBonusMinutes;
    reasons.push("macro_aligned_bridge");
  }

  if (!sameDirection) {
    if (
      previousFamily === "relief_reversal" ||
      nextFamily === "relief_reversal" ||
      (bothStrong && previousFamily === nextFamily)
    ) {
      allowedGapMinutes += options.oppositeDirectionStrongGapBonusMinutes;
      oppositeDirectionCap = Math.max(
        oppositeDirectionCap,
        options.oppositeDirectionStrongCapMinutes,
      );
      reasons.push("opposite_direction_coherent_context");
    }
    allowedGapMinutes = Math.min(allowedGapMinutes, oppositeDirectionCap);
  }

  if (
    auditOnlyPair &&
    !bothStrong &&
    !clusterHasStrongMixedPublicAuditContext([...clusterEvents, next], options)
  ) {
    allowedGapMinutes = Math.min(
      allowedGapMinutes,
      options.weakAuditGapCapMinutes,
    );
    reasons.push("weak_audit_gap_cap");
  }

  allowedGapMinutes = Math.max(
    options.minGapMinutes,
    Math.min(maxGapMinutes, Math.round(allowedGapMinutes)),
  );

  return {
    gapMinutes,
    allowedGapMinutes,
    bridgeAllowed: gapMinutes <= allowedGapMinutes && !fullMarketReset,
    reasons,
    coherentStoryStructure,
    fullMarketReset,
  };
}

function shouldMergeStoryClusters(
  previousCluster: StoryClusterV02,
  nextCluster: StoryClusterV02,
  options: MarketStoryOptionsV02,
) {
  const previousEvents = previousCluster.events;
  const nextEvents = nextCluster.events;
  const previous = previousEvents.at(-1);
  const next = nextEvents[0];

  if (!previous || !next) {
    return {
      bridgeAllowed: false,
      reasons: ["empty_cluster"],
    };
  }

  const gapMinutes = Math.max(
    0,
    Math.round(minutesBetween(previous.event_end, next.event_start)),
  );
  const previousEligible = storyEligibility(previousEvents, options).eligible;
  const nextEligible = storyEligibility(nextEvents, options).eligible;
  const boundaryOpposite = previous.direction !== next.direction;
  const previousStrong = previousEvents.every((event) =>
    isStrongChartContext(event, options),
  );
  const nextStrong = nextEvents.every((event) =>
    isStrongChartContext(event, options),
  );
  const coherentStoryStructure = hasCoherentStoryStructure(
    previous,
    next,
    gapMinutes,
    options,
  );
  const fullMarketReset = crossesFullMarketReset(
    previous,
    next,
    gapMinutes,
    options,
  );
  const combinedEvents = [...previousEvents, ...nextEvents];
  const combinedEligible = storyEligibility(combinedEvents, options).eligible;
  const reasons = ["story_to_story_opposite_direction_continuation"];

  if (previousEligible) reasons.push("previous_cluster_is_market_story");
  if (nextEligible) reasons.push("next_cluster_is_market_story");
  if (boundaryOpposite) reasons.push("opposite_direction_continuation");
  if (previousStrong && nextStrong) reasons.push("strong_chart_context_sides");
  if (coherentStoryStructure) reasons.push("coherent_story_structure");
  if (!fullMarketReset) reasons.push("no_full_market_reset");
  if (combinedEligible) reasons.push("combined_story_eligible");

  return {
    bridgeAllowed:
      (previousEligible || nextEligible) &&
      boundaryOpposite &&
      previousStrong &&
      nextStrong &&
      coherentStoryStructure &&
      !fullMarketReset &&
      combinedEligible &&
      gapMinutes <= options.storyContinuationBridgeMaxGapMinutes,
    reasons,
  };
}

function mergeStoryContinuationClusters(
  clusters: StoryClusterV02[],
  options: MarketStoryOptionsV02,
): StoryClusterV02[] {
  const merged: StoryClusterV02[] = [];

  for (const cluster of clusters) {
    const previous = merged.at(-1);
    if (!previous) {
      merged.push(cluster);
      continue;
    }

    const bridge = shouldMergeStoryClusters(previous, cluster, options);
    if (bridge.bridgeAllowed) {
      previous.events.push(...cluster.events);
      previous.gapReasons.push(...cluster.gapReasons, ...bridge.reasons);
    } else {
      merged.push(cluster);
    }
  }

  return merged;
}

function normalizedStoryLabel(events: MarketStorySourceEventV02[]): {
  label: MarketStoryLabelV02;
  family: MarketStoryFamilyV02;
  reasons: string[];
} {
  const dominant = dominantFamily(events);
  const direction = storyDirection(events);
  const directionalStats = directionalSwingStats(events);
  const twoSidedEligible =
    direction === "two_sided" &&
    directionalStats.up_swing_pct >=
      MARKET_STORY_V02_DEFAULT_OPTIONS.minTwoSidedLegSwingPct &&
    directionalStats.down_swing_pct >=
      MARKET_STORY_V02_DEFAULT_OPTIONS.minTwoSidedLegSwingPct;

  if (dominant.family !== "mixed_context") {
    return {
      label: labelForFamily(dominant.family),
      family: dominant.family,
      reasons: ["story_label_score", `story_label_${dominant.family}`],
    };
  }

  return {
    label: "Mixed sequence",
    family: "mixed_context",
    reasons: [
      twoSidedEligible
        ? "two_sided_direction_without_specific_story_label"
        : "mixed_context_fallback",
      dominant.score >= 2
        ? "ambiguous_story_label_scores"
        : "low_confidence_story_label_scores",
    ],
  };
}

function countValues(values: Array<string | null>): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    const key = value ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function storySourceType(events: MarketStorySourceEventV02[]) {
  const publicCount = events.filter((event) => event.publish_candidate).length;
  const auditCount = events.length - publicCount;

  if (publicCount === 0 && auditCount > 0) {
    return "audit_only_sequence" satisfies MarketStorySourceTypeV02;
  }
  if (publicCount > 0 && auditCount > 0) {
    return "mixed_signal_audit_sequence" satisfies MarketStorySourceTypeV02;
  }
  return "signal_sequence" satisfies MarketStorySourceTypeV02;
}

function storyFromCluster(
  cluster: StoryClusterV02,
  options: MarketStoryOptionsV02,
  candles: MarketStoryCandleV02[] = [],
): { story: MarketStoryV02; members: MarketStoryMemberV02[] } | null {
  if (cluster.events.length < 2) return null;

  const events = cluster.events;
  const range = storyRange(events, candles);
  const eligibility = storyEligibility(events, options);
  const label = normalizedStoryLabel(events);
  const sourceType = storySourceType(events);
  const signalIds = events
    .filter((event) => event.member_type === "signal_event_v02")
    .map((event) => event.id);
  const auditIds = events
    .filter((event) => event.member_type === "audit_event_v02")
    .map((event) => event.id);
  const anchor = events[0];
  const id = `story_v02_${stableHash([
    anchor.member_type,
    anchor.id,
    range.storyStart,
  ])}_${range.storyStart.replace(/[-:]/g, "").slice(0, 13).toLowerCase()}`;
  const decisionReasons = [
    MARKET_STORY_V02_MODEL_VERSION,
    eligibility.reason,
    sourceType,
    ...label.reasons,
    ...cluster.gapReasons,
  ];
  const story: MarketStoryV02 = {
    id,
    date_utc: range.storyStart.slice(0, 10),
    story_start: range.storyStart,
    story_end: range.storyEnd,
    duration_min: range.durationMin,
    story_label: label.label,
    story_family: label.family,
    direction: storyDirection(events),
    swing_change_pct: range.barStats.swingScore,
    chart_context_score: eligibility.averageChartContextScore,
    range_context_json: JSON.stringify({
      event_range_contexts: countValues(
        events.map((event) => event.event_range_context),
      ),
      avg_change_label: "Avg Change",
      avg_change_pct: range.barStats.avgChangePct,
      swing_score_label: "Volatility Score",
      swing_score: range.barStats.swingScore,
      swing_score_method: "rms_15m_bar_open_close_returns_x100",
      per_symbol_evidence: range.barStats.perSymbolEvidence,
      model_version: MARKET_STORY_V02_MODEL_VERSION,
    }),
    trend_context_json: JSON.stringify({
      trend_contexts: countValues(events.map((event) => event.trend_context)),
    }),
    momentum_context_json: JSON.stringify({
      momentum_contexts: countValues(
        events.map((event) => event.momentum_context),
      ),
      directional_swing: directionalSwingStats(events),
    }),
    volatility_context_json: JSON.stringify({
      volatility_contexts: countValues(
        events.map((event) => event.volatility_context),
      ),
    }),
    decision_reasons_json: JSON.stringify([...new Set(decisionReasons)]),
    included_signal_event_ids_json: JSON.stringify(signalIds),
    included_audit_event_ids_json: JSON.stringify(auditIds),
    publish_candidate: eligibility.eligible,
    publish_reason: eligibility.eligible ? eligibility.reason : null,
    suppress_reason: eligibility.eligible ? null : eligibility.reason,
  };
  const members = events.map((event, index) => ({
    id: `${id}_${event.member_type}_${event.id}`,
    market_story_id: id,
    member_type: event.member_type,
    member_id: event.id,
    display_order: index,
    role:
      index === 0
        ? "start_trigger"
        : index === events.length - 1
          ? "end_trigger"
          : event.publish_candidate
            ? "signal_member"
            : "audit_member",
  }));

  return { story, members };
}

export function generateMarketStoriesV02(
  sourceEvents: MarketStorySourceEventV02[],
  options: Partial<MarketStoryOptionsV02> = {},
  candles: MarketStoryCandleV02[] = [],
): MarketStoryV02Output {
  const resolvedOptions = {
    ...MARKET_STORY_V02_DEFAULT_OPTIONS,
    ...options,
  };
  const sorted = [...sourceEvents]
    .filter(
      (event) =>
        Number.isFinite(toTime(event.event_start)) &&
        Number.isFinite(toTime(event.event_end)),
    )
    .sort((a, b) => a.event_start.localeCompare(b.event_start));
  const clusters: StoryClusterV02[] = [];
  let current: StoryClusterV02 = { events: [], gapReasons: [] };

  for (const event of sorted) {
    if (current.events.length === 0) {
      current = { events: [event], gapReasons: [] };
      continue;
    }

    const previous = current.events.at(-1)!;
    const gap = adaptiveGapDecision(
      previous,
      event,
      current.events,
      resolvedOptions,
    );

    if (gap.bridgeAllowed) {
      current.events.push(event);
      current.gapReasons.push(...gap.reasons);
    } else {
      clusters.push(current);
      current = { events: [event], gapReasons: [] };
    }
  }

  if (current.events.length > 0) {
    clusters.push(current);
  }

  const storyParts = mergeStoryContinuationClusters(clusters, resolvedOptions)
    .map((cluster) => storyFromCluster(cluster, resolvedOptions, candles))
    .filter(
      (
        story,
      ): story is { story: MarketStoryV02; members: MarketStoryMemberV02[] } =>
        story !== null,
    );
  const marketStories = storyParts.map((part) => part.story);
  const marketStoryMembers = storyParts.flatMap((part) => part.members);
  const countsByLabel = marketStories.reduce<Record<string, number>>(
    (counts, story) => {
      counts[story.story_label] = (counts[story.story_label] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const countsBySource = marketStories.reduce<Record<string, number>>(
    (counts, story) => {
      const signalCount = JSON.parse(
        story.included_signal_event_ids_json,
      ) as string[];
      const auditCount = JSON.parse(
        story.included_audit_event_ids_json,
      ) as string[];
      const sourceType =
        signalCount.length === 0 && auditCount.length > 0
          ? "audit_only_sequence"
          : signalCount.length > 0 && auditCount.length > 0
            ? "mixed_signal_audit_sequence"
            : "signal_sequence";
      counts[sourceType] = (counts[sourceType] ?? 0) + 1;
      return counts;
    },
    {},
  );

  return {
    market_stories: marketStories,
    market_story_members: marketStoryMembers,
    summary: {
      story_model_version: MARKET_STORY_V02_MODEL_VERSION,
      story_count: marketStories.length,
      publish_candidate_count: marketStories.filter(
        (story) => story.publish_candidate,
      ).length,
      suppressed_count: marketStories.filter(
        (story) => !story.publish_candidate,
      ).length,
      audit_only_story_count: countsBySource.audit_only_sequence ?? 0,
      signal_story_count: countsBySource.signal_sequence ?? 0,
      signal_audit_story_count: countsBySource.mixed_signal_audit_sequence ?? 0,
      counts_by_label: countsByLabel,
      counts_by_source: countsBySource,
    },
  };
}
