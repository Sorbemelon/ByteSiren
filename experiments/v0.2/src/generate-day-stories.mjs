#!/usr/bin/env node

import { createHash } from "node:crypto";

import {
  CANDLES_SNAPSHOT_PATH,
  OUTPUTS_DIR,
  durationMinutes,
  isMain,
  loadCandleSnapshot,
  median,
  readJson,
  readOption,
  roundNumber,
  writeJson,
  writeText,
} from "./shared.mjs";
import { VNEXT_C_EVENTS_PATH } from "./run-vnext-c.mjs";

export const DAY_STORIES_JSON_PATH = `${OUTPUTS_DIR}/day_stories.json`;
export const DAY_STORIES_MD_PATH = `${OUTPUTS_DIR}/day_stories.md`;

const DEFAULT_OPTIONS = {
  gapModelVersion: "adaptive_chart_context_gap_v3",
  baseGapMinutes: 240,
  minGapMinutes: 120,
  maxGapMinutes: 720,
  fullMarketResetGapMinutes: 960,
  sameDirectionGapBonusMinutes: 120,
  strongChartContextGapBonusMinutes: 180,
  strongAuditSequenceGapBonusMinutes: 360,
  strongAuditSequenceMaxGapMinutes: 960,
  strongAuditCounterSwingGapMinutes: 240,
  storyContinuationBridgeMaxGapMinutes: 960,
  storyContinuationBridgeMinAverageScore: 75,
  sharedStoryFamilyGapBonusMinutes: 120,
  sharedRangeContextGapBonusMinutes: 60,
  publicAuditBridgeGapBonusMinutes: 60,
  macroGapBonusMinutes: 60,
  oppositeDirectionStrongGapBonusMinutes: 120,
  oppositeDirectionSoftCapMinutes: 360,
  oppositeDirectionStrongCapMinutes: 600,
  weakAuditGapCapMinutes: 180,
  supportingAuditPaddingMinutes: 120,
  // Off by default for base runs; the structural run enables
  // them to let strong continuations/reversals bridge a slightly wider gap.
  sameDirStrongContinuationMaxGapMinutes: null,
  oppositeStrongBridgeIgnoreFamily: false,
  minPublicSignals: 2,
  minAuditEvents: 2,
  minStoryDurationMinutes: 240,
  minStorySwingChangePct: 2,
  minTwoSidedLegSwingPct: 0.75,
  strongChartContextScore: 75,
  strongAuditSequenceAverageScore: 75,
  mixedStrongChartContextAverageScore: 65,
  storyWindowReversalScore: 55,
  storyWindowRangeBreakScore: 50,
  storyWindowMomentumScore: 50,
  storyWindowVolatilityScore: 55,
  storyWindowInsideRangeScore: 50,
};

const STRUCTURED_AUDIT_STORY_FAMILIES = new Set([
  "range_break",
  "momentum_continuation",
  "relief_reversal",
  "volatility_expansion",
  "inside_range_impulse",
]);

function isoTime(iso) {
  return new Date(iso).getTime();
}

function minutesBetween(aIso, bIso) {
  return (isoTime(bIso) - isoTime(aIso)) / 60000;
}

function shortHash(parts) {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 8);
}

function directionFromEvents(events) {
  const directions = new Set(events.map((event) => event.direction));
  if (directions.has("observed_up") && directions.has("observed_down")) {
    return "two_sided";
  }
  if (directions.has("observed_down")) return "observed_down";
  return "observed_up";
}

function storyRangeStats(events) {
  if (events.length === 0) {
    return {
      duration_min: 0,
      total_swing_change_pct: 0,
    };
  }

  const storyStart = events[0].window_start;
  const storyEnd = events.reduce(
    (latest, event) =>
      event.window_end.localeCompare(latest) > 0 ? event.window_end : latest,
    events[0].window_end,
  );
  const totalSwingChangePct = events.reduce(
    (sum, event) => sum + Math.abs(Number(event.window_move_pct ?? 0)),
    0,
  );

  return {
    duration_min: durationMinutes(storyStart, storyEnd),
    total_swing_change_pct: roundNumber(totalSwingChangePct, 4),
  };
}

function minimumStoryRange(events, options) {
  const stats = storyRangeStats(events);
  const passesDuration =
    stats.duration_min >= options.minStoryDurationMinutes;
  const passesSwing =
    stats.total_swing_change_pct >= options.minStorySwingChangePct;

  return {
    ...stats,
    min_duration_min: options.minStoryDurationMinutes,
    min_swing_change_pct: options.minStorySwingChangePct,
    passes_duration: passesDuration,
    passes_swing: passesSwing,
    eligible: passesDuration && passesSwing,
  };
}

function familyScores(events) {
  const scores = {
    range_break: 0,
    relief_reversal: 0,
    momentum_continuation: 0,
    volatility_expansion: 0,
    inside_range_impulse: 0,
  };
  const counts = Object.fromEntries(
    Object.keys(scores).map((family) => [family, 0]),
  );

  for (const event of events) {
    const type = event.event_story_type ?? "";
    const label = event.chart_context_label ?? "";
    const rangeContext = event.event_range_context ?? "";

    if (type.includes("range_break")) {
      scores.range_break += 3;
      counts.range_break += 1;
    }
    if (label === "Range break") scores.range_break += 2;
    if (rangeContext.includes("broad_broke")) scores.range_break += 1.5;

    if (type.includes("relief_reversal")) {
      scores.relief_reversal += 3;
      counts.relief_reversal += 1;
    }
    if (label === "Relief / reversal") scores.relief_reversal += 2;

    if (type.includes("momentum_continuation")) {
      scores.momentum_continuation += 3;
      counts.momentum_continuation += 1;
    }
    if (label === "Momentum continuation") scores.momentum_continuation += 2;

    if (type.includes("volatility_expansion")) {
      scores.volatility_expansion += 3;
      counts.volatility_expansion += 1;
    }
    if (label === "Volatility expansion") scores.volatility_expansion += 2;

    if (type.includes("inside_range_impulse")) {
      scores.inside_range_impulse += 1.5;
      counts.inside_range_impulse += 1;
    }
    if (
      ["mostly_inside_range", "weak_range_context"].includes(rangeContext)
    ) {
      scores.inside_range_impulse += 0.5;
    }
  }

  return {
    scores: Object.fromEntries(
      Object.entries(scores).map(([family, score]) => [
        family,
        roundNumber(score, 4),
      ]),
    ),
    counts,
  };
}

function dominantStoryFamily(events) {
  const { scores, counts } = familyScores(events);
  const priority = [
    "range_break",
    "relief_reversal",
    "momentum_continuation",
    "volatility_expansion",
    "inside_range_impulse",
  ];
  const ranked = priority
    .map((family, index) => ({
      family,
      score: scores[family] ?? 0,
      count: counts[family] ?? 0,
      priority: index,
    }))
    .sort((a, b) => b.score - a.score || a.priority - b.priority);
  const dominant = ranked[0];
  const runnerUp = ranked[1];

  return {
    family: dominant.score >= 2 ? dominant.family : "mixed_context",
    score: dominant.score,
    runner_up_family: runnerUp?.family ?? null,
    runner_up_score: runnerUp?.score ?? 0,
    scores,
    counts,
  };
}

function directionalSwingStats(events) {
  return events.reduce(
    (stats, event) => {
      const swing = Math.abs(Number(event.window_move_pct ?? 0));
      if (event.direction === "observed_up") {
        stats.up_swing_pct += swing;
        stats.up_event_count += 1;
      } else if (event.direction === "observed_down") {
        stats.down_swing_pct += swing;
        stats.down_event_count += 1;
      }
      return stats;
    },
    {
      up_swing_pct: 0,
      down_swing_pct: 0,
      up_event_count: 0,
      down_event_count: 0,
    },
  );
}

function meaningfulTwoSidedSwing(events, options) {
  const stats = directionalSwingStats(events);

  return {
    ...Object.fromEntries(
      Object.entries(stats).map(([key, value]) => [
        key,
        key.endsWith("_pct") ? roundNumber(value, 4) : value,
      ]),
    ),
    min_leg_swing_pct: options.minTwoSidedLegSwingPct,
    eligible:
      stats.up_event_count > 0 &&
      stats.down_event_count > 0 &&
      stats.up_swing_pct >= options.minTwoSidedLegSwingPct &&
      stats.down_swing_pct >= options.minTwoSidedLegSwingPct,
  };
}

function pctChange(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0) {
    return null;
  }

  return ((end - start) / start) * 100;
}

function candleRangePct(candle) {
  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);

  return pctChange(open, high) - pctChange(open, low);
}

function candlesForWindow(candlesBySymbol, symbol, startIso, endIso) {
  const start = isoTime(startIso);
  const end = isoTime(endIso);

  return (candlesBySymbol?.[symbol] ?? []).filter((candle) => {
    const candleStart = isoTime(candle.open_time);
    const candleEnd = isoTime(candle.close_time);
    return candleEnd >= start && candleStart <= end;
  });
}

function candlesBeforeWindow(candlesBySymbol, symbol, startIso, lookbackMinutes) {
  const start = isoTime(startIso);
  const lookbackStart = start - lookbackMinutes * 60000;

  return (candlesBySymbol?.[symbol] ?? []).filter((candle) => {
    const candleStart = isoTime(candle.open_time);
    const candleEnd = isoTime(candle.close_time);
    return candleEnd < start && candleStart >= lookbackStart;
  });
}

function symbolWindowPath(
  symbol,
  candles,
  firstDirection,
  finalDirection,
  priorCandles = [],
) {
  if (candles.length === 0) return null;

  const first = candles[0];
  const last = candles.at(-1);
  const highCandle = candles.reduce(
    (highest, candle) => (candle.high > highest.high ? candle : highest),
    first,
  );
  const lowCandle = candles.reduce(
    (lowest, candle) => (candle.low < lowest.low ? candle : lowest),
    first,
  );
  const open = Number(first.open);
  const close = Number(last.close);
  const high = Number(highCandle.high);
  const low = Number(lowCandle.low);
  const highTime = highCandle.open_time;
  const lowTime = lowCandle.open_time;
  const netChangePct = pctChange(open, close);
  const upFromStartPct = pctChange(open, high);
  const downFromStartPct = pctChange(open, low);
  const rangePct = pctChange(low, high);
  const priorHigh =
    priorCandles.length > 0
      ? Math.max(...priorCandles.map((candle) => Number(candle.high)))
      : null;
  const priorLow =
    priorCandles.length > 0
      ? Math.min(...priorCandles.map((candle) => Number(candle.low)))
      : null;
  const storyMedianCandleRangePct = median(
    candles.map((candle) => candleRangePct(candle)),
  );
  const priorMedianCandleRangePct = median(
    priorCandles.map((candle) => candleRangePct(candle)),
  );
  const priorRecentMedianCandleRangePct = median(
    priorCandles.slice(-16).map((candle) => candleRangePct(candle)),
  );
  const volatilityExpansionRatio =
    priorRecentMedianCandleRangePct && priorRecentMedianCandleRangePct > 0
      ? storyMedianCandleRangePct / priorRecentMedianCandleRangePct
      : null;
  const priorCompressionRatio =
    priorMedianCandleRangePct && priorMedianCandleRangePct > 0
      ? priorRecentMedianCandleRangePct / priorMedianCandleRangePct
      : null;
  const compressionFlag =
    priorCompressionRatio !== null && priorCompressionRatio <= 0.8;
  const volatilityExpansionFlag =
    volatilityExpansionRatio !== null && volatilityExpansionRatio >= 1.3;
  const storyBrokeHigh = priorHigh !== null && high > priorHigh;
  const storyBrokeLow = priorLow !== null && low < priorLow;
  const insidePriorRange =
    priorHigh !== null &&
    priorLow !== null &&
    high <= priorHigh &&
    low >= priorLow;
  let rangeBreakDirection = "none";

  if (storyBrokeHigh && storyBrokeLow) rangeBreakDirection = "both";
  else if (storyBrokeHigh) rangeBreakDirection = "high";
  else if (storyBrokeLow) rangeBreakDirection = "low";

  let recoveryRatio = null;
  let reversalOrder = false;

  if (firstDirection === "observed_down" && finalDirection === "observed_up") {
    const stress = open - low;
    recoveryRatio = stress > 0 ? (close - low) / stress : null;
    reversalOrder = lowTime <= highTime;
  } else if (
    firstDirection === "observed_up" &&
    finalDirection === "observed_down"
  ) {
    const stress = high - open;
    recoveryRatio = stress > 0 ? (high - close) / stress : null;
    reversalOrder = highTime <= lowTime;
  }

  return {
    symbol,
    candle_count: candles.length,
    open,
    close,
    high,
    low,
    high_time: highTime,
    low_time: lowTime,
    net_change_pct: roundNumber(netChangePct ?? 0, 4),
    max_up_from_start_pct: roundNumber(upFromStartPct ?? 0, 4),
    max_down_from_start_pct: roundNumber(downFromStartPct ?? 0, 4),
    range_pct: roundNumber(rangePct ?? 0, 4),
    prior_24h_high: priorHigh === null ? null : roundNumber(priorHigh, 8),
    prior_24h_low: priorLow === null ? null : roundNumber(priorLow, 8),
    inside_prior_24h_range: insidePriorRange,
    story_broke_high: storyBrokeHigh,
    story_broke_low: storyBrokeLow,
    range_break_direction: rangeBreakDirection,
    story_median_candle_range_pct: roundNumber(
      storyMedianCandleRangePct ?? 0,
      4,
    ),
    prior_24h_median_candle_range_pct: roundNumber(
      priorMedianCandleRangePct ?? 0,
      4,
    ),
    prior_4h_median_candle_range_pct: roundNumber(
      priorRecentMedianCandleRangePct ?? 0,
      4,
    ),
    volatility_expansion_ratio:
      volatilityExpansionRatio === null
        ? null
        : roundNumber(volatilityExpansionRatio, 4),
    prior_compression_ratio:
      priorCompressionRatio === null
        ? null
        : roundNumber(priorCompressionRatio, 4),
    compression_before_window: compressionFlag,
    volatility_expanded_in_window: volatilityExpansionFlag,
    recovery_ratio:
      recoveryRatio === null ? null : roundNumber(recoveryRatio, 4),
    reversal_order: reversalOrder,
  };
}

function storyWindowPathContext(events, storyStart, storyEnd, candlesBySymbol) {
  const firstDirection = events.find((event) =>
    ["observed_up", "observed_down"].includes(event.direction),
  )?.direction;
  const finalDirection = [...events]
    .reverse()
    .find((event) =>
      ["observed_up", "observed_down"].includes(event.direction),
    )?.direction;
  const finalEvent = [...events]
    .reverse()
    .find((event) => event.direction === finalDirection);
  const symbolPaths = Object.keys(candlesBySymbol ?? {})
    .map((symbol) =>
      symbolWindowPath(
        symbol,
        candlesForWindow(candlesBySymbol, symbol, storyStart, storyEnd),
        firstDirection,
        finalDirection,
        candlesBeforeWindow(candlesBySymbol, symbol, storyStart, 24 * 60),
      ),
    )
    .filter(Boolean);
  const reversalCandidate =
    firstDirection &&
    finalDirection &&
    firstDirection !== finalDirection &&
    symbolPaths.length > 0;
  const recoveryRatios = symbolPaths
    .map((path) => path.recovery_ratio)
    .filter((value) => Number.isFinite(value));
  const reversalOrderCount = symbolPaths.filter(
    (path) => path.reversal_order,
  ).length;
  const netChanges = symbolPaths.map((path) => path.net_change_pct);
  const ranges = symbolPaths.map((path) => path.range_pct);
  const downStress = symbolPaths.map((path) =>
    Math.abs(Math.min(0, path.max_down_from_start_pct)),
  );
  const upStress = symbolPaths.map((path) =>
    Math.max(0, path.max_up_from_start_pct),
  );
  const medianNetChangePct = median(netChanges);
  const medianRangePct = median(ranges);
  const medianDownStressPct = median(downStress);
  const medianUpStressPct = median(upStress);
  const medianRecoveryRatio = median(recoveryRatios);
  const finalFamily = finalEvent ? eventStoryFamily(finalEvent) : "mixed_context";
  const memberFamily = dominantStoryFamily(events);
  const broadBreakEventCount = events.filter((event) =>
    String(event.event_range_context ?? "").includes("broad_broke"),
  ).length;
  const insideRangeEventCount = events.filter((event) =>
    String(event.event_story_type ?? "").includes("inside_range_impulse"),
  ).length;
  const mostlyInsideEventCount = events.filter((event) =>
    ["mostly_inside_range", "weak_range_context"].includes(
      event.event_range_context,
    ),
  ).length;
  const volatilityExpansionEventCount = events.filter((event) =>
    String(event.event_story_type ?? "").includes("volatility_expansion"),
  ).length;
  const rangeBreakPathCount = symbolPaths.filter(
    (path) => path.range_break_direction !== "none",
  ).length;
  const insidePriorRangeCount = symbolPaths.filter(
    (path) => path.inside_prior_24h_range,
  ).length;
  const volatilityExpansionCount = symbolPaths.filter(
    (path) => path.volatility_expanded_in_window,
  ).length;
  const compressionExpansionCount = symbolPaths.filter(
    (path) =>
      path.compression_before_window && path.volatility_expanded_in_window,
  ).length;
  const volatilityExpansionRatios = symbolPaths
    .map((path) => path.volatility_expansion_ratio)
    .filter((value) => Number.isFinite(value));
  const medianVolatilityExpansionRatio = median(volatilityExpansionRatios);
  const medianStoryCandleRangePct = median(
    symbolPaths.map((path) => path.story_median_candle_range_pct),
  );
  const medianPriorCandleRangePct = median(
    symbolPaths.map((path) => path.prior_24h_median_candle_range_pct),
  );
  let reversalScore = 0;

  if (reversalCandidate) reversalScore += 25;
  if (finalFamily === "relief_reversal") reversalScore += 25;
  if (memberFamily.family === "relief_reversal") reversalScore += 15;
  if ((medianRecoveryRatio ?? 0) >= 0.35) reversalScore += 15;
  if (reversalOrderCount >= 3) reversalScore += 10;
  if (
    (firstDirection === "observed_down" && (medianDownStressPct ?? 0) >= 0.75) ||
    (firstDirection === "observed_up" && (medianUpStressPct ?? 0) >= 0.75)
  ) {
    reversalScore += 10;
  }

  const rangeBreakScore = roundNumber(
    (memberFamily.scores.range_break ?? 0) * 10 +
      broadBreakEventCount * 15 +
      rangeBreakPathCount * 8,
    4,
  );
  const sameDirectionCount = events.filter(
    (event) => event.direction === firstDirection,
  ).length;
  const momentumScore = roundNumber(
    (memberFamily.scores.momentum_continuation ?? 0) * 10 +
      (sameDirectionCount === events.length ? 20 : 0) +
      (Math.abs(medianNetChangePct ?? 0) >= 1 ? 10 : 0),
    4,
  );
  const volatilityRatioScore =
    (medianVolatilityExpansionRatio ?? 0) >= 1.8
      ? 25
      : (medianVolatilityExpansionRatio ?? 0) >= 1.4
        ? 15
        : (medianVolatilityExpansionRatio ?? 0) >= 1.15
          ? 8
          : 0;
  const volatilityScore = roundNumber(
    (memberFamily.scores.volatility_expansion ?? 0) * 10 +
      volatilityExpansionEventCount * 10 +
      volatilityExpansionCount * 8 +
      compressionExpansionCount * 8 +
      volatilityRatioScore,
    4,
  );
  const insideRangeScore = roundNumber(
    Math.max(
      0,
      (memberFamily.scores.inside_range_impulse ?? 0) * 10 +
        insideRangeEventCount * 10 +
        mostlyInsideEventCount * 8 +
        insidePriorRangeCount * 8 +
        (Math.abs(medianNetChangePct ?? 0) >= 0.75 ? 10 : 0) +
        ((medianRangePct ?? 0) >= 1 ? 8 : 0) -
        broadBreakEventCount * 18 -
        rangeBreakPathCount * 12,
    ),
    4,
  );

  return {
    available: symbolPaths.length > 0,
    story_window_context_version: "story_window_path_v2",
    first_direction: firstDirection ?? null,
    final_direction: finalDirection ?? null,
    final_event_family: finalFamily,
    member_dominant_family: memberFamily.family,
    median_net_change_pct: roundNumber(medianNetChangePct ?? 0, 4),
    median_range_pct: roundNumber(medianRangePct ?? 0, 4),
    median_down_stress_pct: roundNumber(medianDownStressPct ?? 0, 4),
    median_up_stress_pct: roundNumber(medianUpStressPct ?? 0, 4),
    median_story_candle_range_pct: roundNumber(
      medianStoryCandleRangePct ?? 0,
      4,
    ),
    median_prior_24h_candle_range_pct: roundNumber(
      medianPriorCandleRangePct ?? 0,
      4,
    ),
    median_volatility_expansion_ratio:
      medianVolatilityExpansionRatio === null
        ? null
        : roundNumber(medianVolatilityExpansionRatio, 4),
    median_recovery_ratio:
      medianRecoveryRatio === null ? null : roundNumber(medianRecoveryRatio, 4),
    reversal_order_count: reversalOrderCount,
    range_break_path_count: rangeBreakPathCount,
    inside_prior_24h_range_count: insidePriorRangeCount,
    volatility_expansion_count: volatilityExpansionCount,
    compression_expansion_count: compressionExpansionCount,
    n_symbols_with_window: symbolPaths.length,
    reversal_sequence_score: Math.min(100, roundNumber(reversalScore, 4)),
    range_break_sequence_score: Math.min(100, rangeBreakScore),
    momentum_sequence_score: Math.min(100, momentumScore),
    volatility_expansion_sequence_score: Math.min(100, volatilityScore),
    inside_range_impulse_sequence_score: Math.min(100, insideRangeScore),
    symbol_paths: symbolPaths,
  };
}

function storyLabelFromFamily(family) {
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

function storySummaryFocus(label, dominantFamily) {
  if (label === "Reversal sequence") {
    return "story-window path shows a prior move followed by a meaningful opposite leg";
  }
  if (label === "Range break sequence") {
    return "story-window path and member signals share range-break chart context";
  }
  if (label === "Momentum continuation sequence") {
    return "story-window path and member signals mainly extend in one direction";
  }
  if (label === "Volatility expansion sequence") {
    return "story-window candles show volatility expanding across the tracked symbols";
  }
  if (label === "Inside-range impulse sequence") {
    return "story-window path shows an impulse that mostly remains inside the prior range";
  }
  if (label === "Mixed sequence") {
    return `market moved through a mixed story window; primary member context is ${dominantFamily.replace(/_/g, " ")}`;
  }
  return "nearby signals form a broader market context window";
}

function chooseStoryLabel({ direction, dominant, twoSidedSwing, windowContext, options }) {
  const candidates = [];

  if (windowContext?.available) {
    candidates.push(
      {
        family: "relief_reversal",
        label: "Reversal sequence",
        score: windowContext.reversal_sequence_score ?? 0,
        threshold: options.storyWindowReversalScore,
        reason: "story_window_reversal_score",
        priority: 0,
      },
      {
        family: "range_break",
        label: "Range break sequence",
        score: windowContext.range_break_sequence_score ?? 0,
        threshold: options.storyWindowRangeBreakScore,
        reason: "story_window_range_break_score",
        priority: 1,
      },
      {
        family: "momentum_continuation",
        label: "Momentum continuation sequence",
        score: windowContext.momentum_sequence_score ?? 0,
        threshold: options.storyWindowMomentumScore,
        reason: "story_window_momentum_score",
        priority: 2,
      },
      {
        family: "volatility_expansion",
        label: "Volatility expansion sequence",
        score: windowContext.volatility_expansion_sequence_score ?? 0,
        threshold: options.storyWindowVolatilityScore,
        reason: "story_window_volatility_expansion_score",
        priority: 3,
      },
      {
        family: "inside_range_impulse",
        label: "Inside-range impulse sequence",
        score: windowContext.inside_range_impulse_sequence_score ?? 0,
        threshold: options.storyWindowInsideRangeScore,
        reason: "story_window_inside_range_impulse_score",
        priority: 4,
      },
    );
  }

  const eligible = candidates
    .filter((candidate) => candidate.score >= candidate.threshold)
    .sort((a, b) => a.priority - b.priority);

  if (eligible.length > 0) {
    const selected = eligible[0];
    const reasons = [selected.reason];

    if (
      selected.family === "relief_reversal" &&
      direction === "two_sided" &&
      twoSidedSwing.eligible
    ) {
      reasons.push("member_events_bridge_prior_stress_to_relief");
    }

    if (selected.family === dominant.family) {
      reasons.push("member_dominant_family_agrees");
    }

    return {
      label: selected.label,
      family: selected.family,
      storyType: directionalStoryType(selected.family, direction),
      reasons,
    };
  }

  if (dominant.family !== "mixed_context") {
    const reasons = ["member_dominant_family_without_story_window_score"];
    return {
      label: storyLabelFromFamily(dominant.family),
      family: dominant.family,
      storyType: directionalStoryType(dominant.family, direction),
      reasons,
    };
  }

  const reasons = [
    direction === "two_sided" && twoSidedSwing.eligible
      ? "two_sided_direction_without_specific_story_label"
      : "mixed_context_fallback",
  ];
  return {
    label: "Mixed sequence",
    family: "mixed_context",
    storyType: directionalStoryType("mixed_context", direction),
    reasons,
  };
}

function directionalStoryType(family, direction) {
  const suffix =
    direction === "two_sided"
      ? "two_sided"
      : direction === "observed_down"
        ? "down"
        : "up";

  if (family === "range_break") return `multi_swing_range_break_${suffix}`;
  if (family === "relief_reversal") {
    return `multi_swing_relief_reversal_${suffix}`;
  }
  if (family === "momentum_continuation") {
    return `multi_swing_momentum_${suffix}`;
  }
  if (family === "volatility_expansion") {
    return `multi_swing_volatility_expansion_${suffix}`;
  }
  if (family === "inside_range_impulse") {
    return `multi_swing_inside_range_impulse_${suffix}`;
  }
  if (family === "mixed_context") return `multi_swing_mixed_context_${suffix}`;
  if (direction === "two_sided") return "multi_swing_mixed_context_two_sided";
  return direction === "observed_down"
    ? "multi_swing_context_down"
    : "multi_swing_context_up";
}

function storyContext(events, direction, options, storyWindowContext = null) {
  const dominant = dominantStoryFamily(events);
  const twoSidedSwing = meaningfulTwoSidedSwing(events, options);
  const labelDecision = chooseStoryLabel({
    direction,
    dominant,
    twoSidedSwing,
    windowContext: storyWindowContext,
    options,
  });

  return {
    story_type: labelDecision.storyType,
    story_context_label: labelDecision.label,
    summary_focus: storySummaryFocus(labelDecision.label, dominant.family),
    primary_story_family: labelDecision.family,
    member_dominant_story_family: dominant.family,
    story_context_scores: dominant.scores,
    story_context_counts: dominant.counts,
    two_sided_swing: twoSidedSwing,
    story_window_context: storyWindowContext,
    story_label_decision_reasons: labelDecision.reasons,
  };
}

function dateTimeLabel(iso) {
  const date = new Date(iso);
  return `${iso.slice(0, 10)} ${String(date.getUTCHours()).padStart(2, "0")}:${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")} UTC`;
}

function storyDisplayWindow(story) {
  const end = new Date(Date.parse(story.story_end) + 2);
  const endLabel =
    story.story_start.slice(0, 10) === story.story_end.slice(0, 10)
      ? `${String(end.getUTCHours()).padStart(2, "0")}:${String(
          end.getUTCMinutes(),
        ).padStart(2, "0")} UTC`
      : dateTimeLabel(end.toISOString());
  return `${dateTimeLabel(story.story_start)}-${endLabel}`;
}

function nearbyAuditEvents(storyStart, storyEnd, auditEvents, paddingMinutes) {
  const paddedStart = isoTime(storyStart) - paddingMinutes * 60000;
  const paddedEnd = isoTime(storyEnd) + paddingMinutes * 60000;

  return auditEvents.filter((event) => {
    const start = isoTime(event.window_start);
    const end = isoTime(event.window_end);
    return end >= paddedStart && start <= paddedEnd;
  });
}

function eventBrief(event) {
  return {
    id: event.event_id,
    window_start: event.window_start,
    window_end: event.window_end,
    direction: event.direction,
    avg_change_pct: event.window_move_pct,
    chart_context_label: event.chart_context_label,
    event_story_type: event.event_story_type,
    event_range_context: event.event_range_context,
  };
}

function auditEventBrief(event) {
  return {
    ...eventBrief(event),
    suppress_reason: event.suppress_reason,
    chart_context_label: event.chart_context_label,
    event_story_type: event.event_story_type,
    event_range_context: event.event_range_context,
  };
}

function eventScore(event) {
  const score = Number(event.chart_context_score);
  return Number.isFinite(score) ? score : 0;
}

function eventStoryFamily(event) {
  const type = event.event_story_type ?? "";
  if (type.includes("range_break")) return "range_break";
  if (type.includes("momentum_continuation")) return "momentum_continuation";
  if (type.includes("relief_reversal")) return "relief_reversal";
  if (type.includes("volatility_expansion")) return "volatility_expansion";
  if (type.includes("inside_range_impulse")) return "inside_range_impulse";
  return "mixed_context";
}

function isStrongChartContext(event, options) {
  if (eventScore(event) >= options.strongChartContextScore) return true;

  return [
    "Range break",
    "Momentum continuation",
    "Relief / reversal",
    "Volatility expansion",
    "Strong chart context",
    "Macro-aligned context",
  ].includes(event.chart_context_label);
}

function clusterChartScore(events) {
  if (events.length === 0) return 0;
  return (
    events.reduce((sum, event) => sum + eventScore(event), 0) / events.length
  );
}

function clusterHasStrongMixedPublicAuditContext(events, options) {
  const publicCount = events.filter((event) => event.publish_candidate).length;
  const auditCount = events.length - publicCount;
  if (publicCount < 1 || auditCount < 1) return false;

  const hasStrongEvent = events.some((event) =>
    isStrongChartContext(event, options),
  );
  const averageScore =
    events.reduce((sum, event) => sum + eventScore(event), 0) / events.length;
  const hasStructuredContext = events.some((event) =>
    [
      "range_break",
      "momentum_continuation",
      "relief_reversal",
      "volatility_expansion",
      "inside_range_impulse",
    ].includes(eventStoryFamily(event)),
  );

  return (
    hasStrongEvent &&
    averageScore >= options.mixedStrongChartContextAverageScore &&
    hasStructuredContext
  );
}

function hasMomentumRangeReliefContext(events) {
  return events.some((event) =>
    STRUCTURED_AUDIT_STORY_FAMILIES.has(eventStoryFamily(event)),
  );
}

function hasSharedStructure(previous, next) {
  const previousFamily = eventStoryFamily(previous);
  const nextFamily = eventStoryFamily(next);

  return (
    previousFamily === nextFamily ||
    (previous.event_range_context &&
      previous.event_range_context === next.event_range_context)
  );
}

function hasReliefBridge(previous, next) {
  return (
    eventStoryFamily(previous) === "relief_reversal" ||
    eventStoryFamily(next) === "relief_reversal"
  );
}

function hasCoherentStoryStructure(previous, next, gapMinutes, options) {
  if (previous.direction === next.direction) return true;
  if (hasSharedStructure(previous, next)) return true;
  if (hasReliefBridge(previous, next)) return true;

  return (
    isStrongChartContext(previous, options) &&
    isStrongChartContext(next, options) &&
    gapMinutes <= options.strongAuditCounterSwingGapMinutes
  );
}

function crossesFullMarketReset(previous, next, gapMinutes, options) {
  if (gapMinutes > options.fullMarketResetGapMinutes) return true;
  if (previous.direction === next.direction) return false;
  return !hasCoherentStoryStructure(previous, next, gapMinutes, options);
}

function clusterHasStrongAuditOnlyContext(events, options) {
  if (events.length < options.minAuditEvents) return false;
  if (events.some((event) => event.publish_candidate)) return false;
  if (!events.every((event) => isStrongChartContext(event, options))) {
    return false;
  }
  if (clusterChartScore(events) < options.strongAuditSequenceAverageScore) {
    return false;
  }
  if (!hasMomentumRangeReliefContext(events)) return false;

  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const next = events[index];
    const gapMinutes = Math.max(
      0,
      Math.round(minutesBetween(previous.window_end, next.window_start)),
    );
    if (crossesFullMarketReset(previous, next, gapMinutes, options)) {
      return false;
    }
  }

  return true;
}

function storySourceType(publicEvents, auditEvents) {
  if (publicEvents.length === 0 && auditEvents.length > 0) {
    return {
      story_source_type: "audit_only_sequence",
      story_source_label: "Audit-only story",
    };
  }
  if (publicEvents.length > 0 && auditEvents.length > 0) {
    return {
      story_source_type: "mixed_signal_audit_sequence",
      story_source_label: "Signal + audit story",
    };
  }

  return {
    story_source_type: "signal_sequence",
    story_source_label: "Signal story",
  };
}

function storyEligibility(events, options) {
  const publicCount = events.filter((event) => event.publish_candidate).length;
  const auditCount = events.length - publicCount;
  const minimumRange = minimumStoryRange(events, options);

  if (!minimumRange.eligible) {
    return {
      eligible: false,
      reason: "below_minimum_story_range",
      public_count: publicCount,
      audit_count: auditCount,
      average_chart_context_score: roundNumber(clusterChartScore(events), 4),
      minimum_story_range: minimumRange,
    };
  }

  if (publicCount >= options.minPublicSignals) {
    return {
      eligible: true,
      reason: "min_public_signals",
      public_count: publicCount,
      audit_count: auditCount,
      average_chart_context_score: roundNumber(clusterChartScore(events), 4),
      minimum_story_range: minimumRange,
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
      public_count: publicCount,
      audit_count: auditCount,
      average_chart_context_score: roundNumber(clusterChartScore(events), 4),
      minimum_story_range: minimumRange,
    };
  }

  if (clusterHasStrongMixedPublicAuditContext(events, options)) {
    return {
      eligible: true,
      reason: "mixed_public_audit_strong_chart_context",
      public_count: publicCount,
      audit_count: auditCount,
      average_chart_context_score: roundNumber(clusterChartScore(events), 4),
      minimum_story_range: minimumRange,
    };
  }

  return {
    eligible: false,
    reason: "below_story_threshold",
    public_count: publicCount,
    audit_count: auditCount,
    average_chart_context_score: roundNumber(clusterChartScore(events), 4),
    minimum_story_range: minimumRange,
  };
}

function storyWindowContextSupportsBridge(windowContext, options) {
  if (!windowContext?.available) return false;

  return (
    (windowContext.reversal_sequence_score ?? 0) >=
      options.storyWindowReversalScore ||
    (windowContext.range_break_sequence_score ?? 0) >=
      options.storyWindowRangeBreakScore ||
    (windowContext.momentum_sequence_score ?? 0) >=
      options.storyWindowMomentumScore ||
    (windowContext.volatility_expansion_sequence_score ?? 0) >=
      options.storyWindowVolatilityScore ||
    (windowContext.inside_range_impulse_sequence_score ?? 0) >=
      options.storyWindowInsideRangeScore
  );
}

function clusterIsStrongStoryContext(events, options) {
  if (events.length === 0) return false;
  if (clusterChartScore(events) < options.storyContinuationBridgeMinAverageScore) {
    return false;
  }
  if (!events.some((event) => isStrongChartContext(event, options))) {
    return false;
  }

  return hasMomentumRangeReliefContext(events);
}

function clusterStoryWindow(events) {
  return {
    start: events[0].window_start,
    end: events.reduce(
      (latest, event) =>
        event.window_end.localeCompare(latest) > 0
          ? event.window_end
          : latest,
      events[0].window_end,
    ),
  };
}

function storyContinuationBridgeDecision(
  previousCluster,
  nextCluster,
  options,
  candlesBySymbol,
) {
  const previousEvents = previousCluster.events;
  const nextEvents = nextCluster.events;
  const previous = previousEvents.at(-1);
  const next = nextEvents[0];
  const gapMinutes = Math.max(
    0,
    Math.round(minutesBetween(previous.window_end, next.window_start)),
  );
  const previousEligible = isEligibleStoryCluster(previousEvents, options);
  const nextEligible = isEligibleStoryCluster(nextEvents, options);
  const boundaryOpposite = previous.direction !== next.direction;
  const previousStrong = clusterIsStrongStoryContext(previousEvents, options);
  const nextStrong = clusterIsStrongStoryContext(nextEvents, options);
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
  const combinedWindow = clusterStoryWindow(combinedEvents);
  const combinedWindowContext = storyWindowPathContext(
    combinedEvents,
    combinedWindow.start,
    combinedWindow.end,
    candlesBySymbol,
  );
  const storyWindowSupported = storyWindowContextSupportsBridge(
    combinedWindowContext,
    options,
  );
  const reasons = ["story_to_story_opposite_direction_continuation"];

  if (previousEligible) reasons.push("previous_cluster_is_market_story");
  if (nextEligible) reasons.push("next_cluster_is_market_story");
  if (boundaryOpposite) reasons.push("opposite_direction_continuation");
  if (previousStrong && nextStrong) reasons.push("strong_chart_context_sides");
  if (coherentStoryStructure) reasons.push("coherent_story_structure");
  if (!fullMarketReset) reasons.push("no_full_market_reset");
  if (combinedEligible) reasons.push("combined_story_eligible");
  if (storyWindowSupported) reasons.push("combined_story_window_supported");

  return {
    previous_event_id: previous.event_id,
    next_event_id: next.event_id,
    gap_minutes: gapMinutes,
    allowed_gap_minutes: options.storyContinuationBridgeMaxGapMinutes,
    bridge_allowed:
      (previousEligible || nextEligible) &&
      boundaryOpposite &&
      previousStrong &&
      nextStrong &&
      coherentStoryStructure &&
      !fullMarketReset &&
      combinedEligible &&
      storyWindowSupported &&
      gapMinutes <= options.storyContinuationBridgeMaxGapMinutes,
    bridge_reasons: reasons,
    bridge_type: "story_to_story_opposite_direction_continuation",
    previous_cluster_event_ids: previousEvents.map((event) => event.event_id),
    next_cluster_event_ids: nextEvents.map((event) => event.event_id),
    previous_cluster_eligible: previousEligible,
    next_cluster_eligible: nextEligible,
    previous_cluster_average_score: roundNumber(
      clusterChartScore(previousEvents),
      4,
    ),
    next_cluster_average_score: roundNumber(clusterChartScore(nextEvents), 4),
    boundary_opposite_direction: boundaryOpposite,
    strong_chart_context_sides: previousStrong && nextStrong,
    strong_audit_sequence_bridge: false,
    coherent_story_structure: coherentStoryStructure,
    full_market_reset_detected: fullMarketReset,
    combined_story_eligible: combinedEligible,
    combined_story_window_supported: storyWindowSupported,
  };
}

function adaptiveGapDecision(previous, next, clusterEvents, options) {
  const gapMinutes = Math.max(
    0,
    Math.round(minutesBetween(previous.window_end, next.window_start)),
  );
  const reasons = ["base_gap"];
  const previousFamily = eventStoryFamily(previous);
  const nextFamily = eventStoryFamily(next);
  const sameDirection = previous.direction === next.direction;
  const bothStrong =
    isStrongChartContext(previous, options) &&
    isStrongChartContext(next, options);
  const auditOnlyPair =
    !previous.publish_candidate && !next.publish_candidate;
  const mixedPublicAudit = previous.publish_candidate !== next.publish_candidate;
  const oppositeDirection = !sameDirection;
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
    hasMomentumRangeReliefContext([previous, next]) &&
    coherentStoryStructure &&
    !fullMarketReset;
  let allowedGapMinutes = options.baseGapMinutes;
  let oppositeDirectionCap = options.oppositeDirectionSoftCapMinutes;
  let maxGapMinutes = options.maxGapMinutes;

  if (sameDirection) {
    allowedGapMinutes += options.sameDirectionGapBonusMinutes;
    reasons.push("same_direction");
  }

  if (bothStrong) {
    allowedGapMinutes += options.strongChartContextGapBonusMinutes;
    reasons.push("strong_chart_context_pair");
  }

  if (
    sameDirection &&
    bothStrong &&
    options.sameDirStrongContinuationMaxGapMinutes
  ) {
    allowedGapMinutes = Math.max(
      allowedGapMinutes,
      options.sameDirStrongContinuationMaxGapMinutes,
    );
    maxGapMinutes = Math.max(
      maxGapMinutes,
      options.sameDirStrongContinuationMaxGapMinutes,
    );
    reasons.push("same_direction_strong_continuation");
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

  if (oppositeDirection) {
    if (
      previousFamily === "relief_reversal" ||
      nextFamily === "relief_reversal"
    ) {
      allowedGapMinutes += options.oppositeDirectionStrongGapBonusMinutes;
      oppositeDirectionCap = Math.max(
        oppositeDirectionCap,
        options.oppositeDirectionStrongCapMinutes,
      );
      reasons.push("relief_or_reversal_bridge");
    } else if (
      bothStrong &&
      (previousFamily === nextFamily || options.oppositeStrongBridgeIgnoreFamily)
    ) {
      allowedGapMinutes += options.oppositeDirectionStrongGapBonusMinutes;
      oppositeDirectionCap = Math.max(
        oppositeDirectionCap,
        options.oppositeDirectionStrongCapMinutes,
      );
      reasons.push(
        previousFamily === nextFamily
          ? "strong_two_sided_chart_context"
          : "strong_two_sided_cross_family",
      );
    }

    allowedGapMinutes = Math.min(allowedGapMinutes, oppositeDirectionCap);
  }

  if (
    !previous.publish_candidate &&
    !next.publish_candidate &&
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
    previous_event_id: previous.event_id,
    next_event_id: next.event_id,
    gap_minutes: gapMinutes,
    allowed_gap_minutes: allowedGapMinutes,
    bridge_allowed: gapMinutes <= allowedGapMinutes,
    bridge_reasons: reasons,
    strong_audit_sequence_bridge: strongAuditSequenceBridge,
    coherent_story_structure: coherentStoryStructure,
    full_market_reset_detected: fullMarketReset,
  };
}

function isEligibleStoryCluster(events, options) {
  return storyEligibility(events, options).eligible;
}

function normalizeCluster(cluster) {
  return {
    events: cluster.events,
    adaptiveGapLinks: cluster.adaptiveGapLinks ?? [],
    storyBridgeLinks: cluster.storyBridgeLinks ?? [],
  };
}

function mergeStoryContinuationClusters(clusters, options, candlesBySymbol) {
  if (clusters.length <= 1) return clusters.map(normalizeCluster);

  const merged = [];
  let current = normalizeCluster(clusters[0]);

  for (const rawNext of clusters.slice(1)) {
    const next = normalizeCluster(rawNext);
    const bridgeDecision = storyContinuationBridgeDecision(
      current,
      next,
      options,
      candlesBySymbol,
    );

    if (bridgeDecision.bridge_allowed) {
      current = {
        events: [...current.events, ...next.events],
        adaptiveGapLinks: [
          ...current.adaptiveGapLinks,
          bridgeDecision,
          ...next.adaptiveGapLinks,
        ],
        storyBridgeLinks: [
          ...current.storyBridgeLinks,
          bridgeDecision,
          ...next.storyBridgeLinks,
        ],
      };
      continue;
    }

    merged.push(current);
    current = next;
  }

  merged.push(current);
  return merged;
}

function storyFromCluster(
  cluster,
  allAuditEvents,
  options,
  adaptiveGapLinks = [],
  storyBridgeLinks = [],
  candlesBySymbol = {},
) {
  const storyStart = cluster[0].window_start;
  const storyEnd = cluster.reduce(
    (latest, event) =>
      event.window_end.localeCompare(latest) > 0 ? event.window_end : latest,
    cluster[0].window_end,
  );
  const publicEvents = cluster.filter((event) => event.publish_candidate);
  const includedAuditEvents = cluster.filter(
    (event) => !event.publish_candidate,
  );
  const eligibility = storyEligibility(cluster, options);
  const includedAuditIds = new Set(
    includedAuditEvents.map((event) => event.event_id),
  );
  const supportingAuditContext = nearbyAuditEvents(
    storyStart,
    storyEnd,
    allAuditEvents,
    options.supportingAuditPaddingMinutes,
  ).filter((event) => !includedAuditIds.has(event.event_id));
  const direction = directionFromEvents(cluster);
  const storyWindowContext = storyWindowPathContext(
    cluster,
    storyStart,
    storyEnd,
    candlesBySymbol,
  );
  const context = storyContext(
    cluster,
    direction,
    options,
    storyWindowContext,
  );
  const source = storySourceType(publicEvents, includedAuditEvents);
  const signalIds = publicEvents.map((event) => event.event_id);
  const auditIds = includedAuditEvents.map((event) => event.event_id);
  const allStoryIds = cluster.map((event) => event.event_id);
  const id = `story_${shortHash([storyStart, storyEnd, ...allStoryIds])}_${storyStart
    .replace(/[-:]/g, "")
    .slice(0, 13)
    .toLowerCase()}`;
  const netSignalChangePct = publicEvents.reduce(
    (sum, event) => sum + Number(event.window_move_pct ?? 0),
    0,
  );
  const totalSwingChangePct = cluster.reduce(
    (sum, event) => sum + Math.abs(Number(event.window_move_pct ?? 0)),
    0,
  );
  const medianSignalChangePct = median(
    publicEvents.map((event) => Number(event.window_move_pct ?? 0)),
  );
  const auditSwingChangePct = includedAuditEvents.reduce(
    (sum, event) => sum + Math.abs(Number(event.window_move_pct ?? 0)),
    0,
  );
  const crossesUtcDay = storyStart.slice(0, 10) !== storyEnd.slice(0, 10);
  const durationMin = durationMinutes(storyStart, storyEnd);
  const eventRangeContexts = [
    ...new Set(cluster.map((event) => event.event_range_context).filter(Boolean)),
  ];
  const chartContextLabels = [
    ...new Set(cluster.map((event) => event.chart_context_label).filter(Boolean)),
  ];
  const maxEventGapMinutes =
    adaptiveGapLinks.length > 0
      ? Math.max(...adaptiveGapLinks.map((link) => link.gap_minutes))
      : 0;

  return {
    item_type: "market_story",
    id,
    story_id: id,
    anchor_date_utc: storyStart.slice(0, 10),
    story_start: storyStart,
    story_end: storyEnd,
    story_display_window: null,
    duration_min: durationMin,
    crosses_utc_day: crossesUtcDay,
    direction,
    story_type: context.story_type,
    story_context_label: context.story_context_label,
    primary_story_family: context.primary_story_family,
    member_dominant_story_family: context.member_dominant_story_family,
    story_context_scores: context.story_context_scores,
    story_context_counts: context.story_context_counts,
    two_sided_swing: context.two_sided_swing,
    story_window_context: context.story_window_context,
    story_label_decision_reasons: context.story_label_decision_reasons,
    story_layer_version: options.gapModelVersion,
    gap_model_version: options.gapModelVersion,
    eligibility_reason: eligibility.reason,
    eligibility_detail: eligibility,
    minimum_story_range: eligibility.minimum_story_range,
    adaptive_gap_links: adaptiveGapLinks,
    story_bridge_links: storyBridgeLinks,
    story_bridge_count: storyBridgeLinks.length,
    story_bridge_summary:
      storyBridgeLinks.length > 0
        ? `Story continuation bridges: ${storyBridgeLinks.length}`
        : "Story continuation bridges: none",
    max_event_gap_minutes: maxEventGapMinutes,
    adaptive_gap_summary:
      adaptiveGapLinks.length > 0
        ? `Adaptive gap: max ${maxEventGapMinutes} min between story events`
        : "Adaptive gap: single event cluster",
    story_source_type: source.story_source_type,
    story_source_label: source.story_source_label,
    signal_event_count: publicEvents.length,
    audit_event_count: includedAuditEvents.length,
    total_event_count: cluster.length,
    included_signal_event_ids: signalIds,
    included_audit_event_ids: auditIds,
    supporting_audit_event_ids: supportingAuditContext.map(
      (event) => event.event_id,
    ),
    all_story_event_ids: allStoryIds,
    start_trigger_event_id: cluster[0].event_id,
    end_trigger_event_id: cluster.at(-1).event_id,
    net_signal_change_pct: roundNumber(netSignalChangePct, 4),
    total_swing_change_pct: roundNumber(totalSwingChangePct, 4),
    audit_swing_change_pct: roundNumber(auditSwingChangePct, 4),
    median_signal_change_pct: roundNumber(medianSignalChangePct ?? 0, 4),
    strongest_signal_event_id: [...publicEvents].sort(
      (a, b) =>
        Math.abs(Number(b.window_move_pct ?? 0)) -
        Math.abs(Number(a.window_move_pct ?? 0)),
    )[0]?.event_id,
    dominant_chart_context_label:
      chartContextLabels[0] ?? "Mixed sequence",
    event_range_contexts: eventRangeContexts,
    summary_hint: `${publicEvents.length} Signal Events and ${includedAuditEvents.length} audit-only events from ${dateTimeLabel(storyStart)}; ${context.summary_focus}.`,
    included_signal_events: publicEvents.map(eventBrief),
    included_audit_events: includedAuditEvents.map(auditEventBrief),
    supporting_audit_events: supportingAuditContext.map(auditEventBrief),
    chart: {
      chart_highlight_type: "story_window",
      highlight_start: storyStart,
      highlight_end: storyEnd,
      included_signal_event_ids: signalIds,
      included_audit_event_ids: auditIds,
      supporting_audit_event_ids: supportingAuditContext.map(
        (event) => event.event_id,
      ),
      anchor_date_utc: storyStart.slice(0, 10),
      selection_toggle: "select_again_to_clear",
      background_click_clears_selection: true,
    },
  };
}

function withDisplayWindow(story) {
  return {
    ...story,
    story_display_window: storyDisplayWindow(story),
  };
}

export function buildDayStories(signalEvents, options = {}, context = {}) {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const candlesBySymbol = context.candlesBySymbol ?? {};
  const sortedEvents = [...signalEvents]
    .sort((a, b) => a.window_start.localeCompare(b.window_start));
  const auditEvents = signalEvents.filter((event) => !event.publish_candidate);
  const clusters = [];
  let cluster = { events: [], adaptiveGapLinks: [] };

  for (const event of sortedEvents) {
    if (cluster.events.length === 0) {
      cluster = { events: [event], adaptiveGapLinks: [] };
      continue;
    }

    const previous = cluster.events.at(-1);
    const gapDecision = adaptiveGapDecision(
      previous,
      event,
      cluster.events,
      resolvedOptions,
    );

    if (gapDecision.bridge_allowed) {
      cluster.events.push(event);
      cluster.adaptiveGapLinks.push(gapDecision);
      continue;
    }

    clusters.push(cluster);
    cluster = { events: [event], adaptiveGapLinks: [] };
  }

  if (cluster.events.length > 0) {
    clusters.push(cluster);
  }

  const storyClusters = mergeStoryContinuationClusters(
    clusters,
    resolvedOptions,
    candlesBySymbol,
  ).filter((items) => isEligibleStoryCluster(items.events, resolvedOptions));

  const stories = storyClusters
    .map((items) =>
      storyFromCluster(
        items.events,
        auditEvents,
        resolvedOptions,
        items.adaptiveGapLinks,
        items.storyBridgeLinks,
        candlesBySymbol,
      ),
    )
    .map(withDisplayWindow);

  return {
    generated_at: new Date().toISOString(),
    detector_version: "vnext_c",
    story_layer_version: resolvedOptions.gapModelVersion,
    options: resolvedOptions,
    count: stories.length,
    items: stories,
  };
}

function markdown(payload) {
  const lines = [
    "# Market Stories / Multi-swing Context",
    "",
    `Count: ${payload.count}`,
    `Story layer: ${payload.story_layer_version}`,
    "",
  ];

  for (const story of payload.items) {
    lines.push(`## ${story.story_context_label}`);
    lines.push(`- ID: ${story.id}`);
    lines.push(`- Anchor day: ${story.anchor_date_utc}`);
    lines.push(`- Story window: ${story.story_display_window}`);
    lines.push(`- Crosses UTC day: ${story.crosses_utc_day}`);
    lines.push(`- Direction: ${story.direction}`);
    lines.push(`- Story source: ${story.story_source_label}`);
    lines.push(`- Signal Events: ${story.signal_event_count}`);
    lines.push(`- Included audit-only events: ${story.audit_event_count}`);
    lines.push(`- Story continuation bridges: ${story.story_bridge_count}`);
    lines.push(
      `- Swing Change: ${story.total_swing_change_pct >= 0 ? "+" : ""}${story.total_swing_change_pct}% total absolute story-event change`,
    );
    lines.push(`- Summary: ${story.summary_hint}`);
    lines.push(
      `- Included Signal Events: ${story.included_signal_event_ids.join(", ")}`,
    );
    lines.push(
      `- Included Audit Events: ${story.included_audit_event_ids.join(", ") || "none"}`,
    );
    lines.push(
      `- Supporting audit events: ${story.supporting_audit_event_ids.length}`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

export async function runDayStories(options, { logger = console } = {}) {
  const signalEvents = (await readJson(options.signalEventsPath)).events ?? [];
  const candleSnapshot = await loadCandleSnapshot(options.candlesPath);
  const payload = buildDayStories(signalEvents, options.storyOptions, {
    candlesBySymbol: candleSnapshot.candles_by_symbol,
  });

  await writeJson(options.jsonOutputPath, payload);
  await writeText(options.markdownOutputPath, markdown(payload));
  logger.log(
    `Day stories complete: ${payload.count} multi-swing context items.`,
  );

  return payload;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const maxGap = Number(readOption(argv, "--max-gap-min"));
  const baseGap = Number(readOption(argv, "--base-gap-min"));
  const minAuditEvents = Number(readOption(argv, "--min-audit-events"));
  const strongChartContextScore = Number(
    readOption(argv, "--strong-chart-context-score"),
  );
  const minStoryDuration = Number(readOption(argv, "--min-story-duration-min"));
  const minStorySwing = Number(readOption(argv, "--min-story-swing-pct"));
  const minTwoSidedLegSwing = Number(
    readOption(argv, "--min-two-sided-leg-swing-pct"),
  );

  return {
    signalEventsPath: readOption(argv, "--events") ?? VNEXT_C_EVENTS_PATH,
    candlesPath: readOption(argv, "--candles") ?? CANDLES_SNAPSHOT_PATH,
    jsonOutputPath: readOption(argv, "--json-output") ?? DAY_STORIES_JSON_PATH,
    markdownOutputPath: readOption(argv, "--md-output") ?? DAY_STORIES_MD_PATH,
    storyOptions: {
      ...DEFAULT_OPTIONS,
      ...(Number.isFinite(maxGap) ? { maxGapMinutes: maxGap } : {}),
      ...(Number.isFinite(baseGap) ? { baseGapMinutes: baseGap } : {}),
      ...(Number.isFinite(minAuditEvents)
        ? { minAuditEvents }
        : {}),
      ...(Number.isFinite(strongChartContextScore)
        ? { strongChartContextScore }
        : {}),
      ...(Number.isFinite(minStoryDuration)
        ? { minStoryDurationMinutes: minStoryDuration }
        : {}),
      ...(Number.isFinite(minStorySwing)
        ? { minStorySwingChangePct: minStorySwing }
        : {}),
      ...(Number.isFinite(minTwoSidedLegSwing)
        ? { minTwoSidedLegSwingPct: minTwoSidedLegSwing }
        : {}),
    },
  };
}

if (isMain(import.meta.url)) {
  runDayStories(parseArgs()).catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Day story generation failed.",
    );
    process.exitCode = 1;
  });
}
