import { ALLOWED_SYMBOLS, type MarketSymbol } from "../../config.ts";
import {
  BASELINE_WINDOW_LABEL,
  MARKET_BREADTH_MIN,
  MARKET_PERSISTENCE_BARS,
  SIGNAL_WINDOW_LABEL,
  WAIVE_PERSISTENCE_AVG_SEVERITY_MIN,
  WAIVE_PERSISTENCE_BREADTH_MIN,
  WAIVE_PERSISTENCE_MAX_SEVERITY_MIN,
} from "./constants.ts";
import { toSymbolEvidence } from "./evidence.ts";
import { directionSlug, queryHintsForCandidate } from "./labels.ts";
import { average, roundNumber } from "./math.ts";
import { tierFromSeverity } from "./scoring.ts";
import type {
  MarketDirection,
  PersistenceConfirmReason,
  RawDetectionResult,
  RawMarketEvent,
  SuppressedMarketEvent,
  SymbolFeature,
} from "./types.ts";

function eventTimeSlug(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(".000Z", "Z").toLowerCase();
}

function eventDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "");
}

function averageOrZero(values: number[]): number {
  return roundNumber(average(values) ?? 0, 4);
}

function marketDirection(elevated: SymbolFeature[]): MarketDirection {
  const up = elevated.filter((feature) => feature.direction === "up").length;
  const down = elevated.filter(
    (feature) => feature.direction === "down",
  ).length;

  if (up >= MARKET_BREADTH_MIN) {
    return "observed_up";
  }

  if (down >= MARKET_BREADTH_MIN) {
    return "observed_down";
  }

  return "mixed";
}

function sortedSymbols(symbols: Iterable<MarketSymbol>): MarketSymbol[] {
  return [...symbols].sort((a, b) => a.localeCompare(b));
}

function peakFeature(features: SymbolFeature[]): SymbolFeature {
  return features.reduce((peak, feature) =>
    feature.scores.severity_score > peak.scores.severity_score ? feature : peak,
  );
}

function confirmReason(input: {
  breadthCount: number;
  avgSeverity: number;
  maxSeverity: number;
  consecutiveBars: number;
}): { waived: boolean; reason: PersistenceConfirmReason | null } {
  if (input.breadthCount >= WAIVE_PERSISTENCE_BREADTH_MIN) {
    return { waived: true, reason: "breadth>=4" };
  }

  if (input.avgSeverity >= WAIVE_PERSISTENCE_AVG_SEVERITY_MIN) {
    return { waived: true, reason: "avg_severity>=80" };
  }

  if (
    input.breadthCount >= MARKET_BREADTH_MIN &&
    input.maxSeverity >= WAIVE_PERSISTENCE_MAX_SEVERITY_MIN
  ) {
    return { waived: true, reason: "breadth>=3+max_severity>=85" };
  }

  if (input.consecutiveBars >= MARKET_PERSISTENCE_BARS) {
    return { waived: false, reason: "consecutive_bars>=2" };
  }

  return { waived: false, reason: null };
}

function makeRawEvent(input: {
  features: SymbolFeature[];
  elevated: SymbolFeature[];
  direction: Exclude<MarketDirection, "mixed">;
  consecutiveBars: number;
  waived: boolean;
  confirmReason: PersistenceConfirmReason;
}): RawMarketEvent {
  const includedSymbols = new Set(
    input.elevated.map((feature) => feature.symbol),
  );
  const evidence = toSymbolEvidence(input.features, includedSymbols);
  const severityValues = input.elevated.map(
    (feature) => feature.scores.severity_score,
  );
  const headlineSeverity = averageOrZero(severityValues);
  const maxSeverity = roundNumber(Math.max(...severityValues), 4);
  const peak = peakFeature(input.elevated);
  const symbols = sortedSymbols(includedSymbols);
  const avgChange = average(
    input.elevated
      .map((feature) => feature.return_15m_pct)
      .filter((value): value is number => value !== null),
  );
  const detectedAt = input.features[0].open_time;
  const directionPart = directionSlug(input.direction);
  const symbolPart = symbols
    .map((symbol) => symbol.replace("USDT", "").toLowerCase())
    .join("-");

  return {
    id: `bs_raw_${eventTimeSlug(detectedAt)}_market_wide_${directionPart}_${symbolPart}`,
    scope: "market_wide",
    detected_at: detectedAt,
    close_time: input.features[0].close_time,
    signal_window: SIGNAL_WINDOW_LABEL,
    baseline_window: BASELINE_WINDOW_LABEL,
    direction: input.direction,
    symbols,
    breadth_count: input.elevated.length,
    avg_15m_change_pct: avgChange === null ? null : roundNumber(avgChange, 4),
    headline_severity: headlineSeverity,
    max_elevated_severity: maxSeverity,
    peak_symbol: peak.symbol,
    tier: tierFromSeverity(headlineSeverity),
    symbol_evidence: evidence,
    persistence: {
      waived: input.waived,
      consecutive_bars: input.consecutiveBars,
      confirm_reason: input.confirmReason,
    },
    query_hints: queryHintsForCandidate({
      scope: "market_wide",
      direction: input.direction,
      severity: headlineSeverity,
      breadthCount: input.elevated.length,
    }),
  };
}

function makeSuppressedEvent(input: {
  features: SymbolFeature[];
  elevated: SymbolFeature[];
  direction: MarketDirection;
  reason: SuppressedMarketEvent["suppression_reason"];
}): SuppressedMarketEvent {
  const includedSymbols = new Set(
    input.elevated.map((feature) => feature.symbol),
  );
  const severityValues = input.elevated.map(
    (feature) => feature.scores.severity_score,
  );
  const headlineSeverity =
    severityValues.length > 0 ? averageOrZero(severityValues) : 0;
  const maxSeverity =
    severityValues.length > 0 ? roundNumber(Math.max(...severityValues), 4) : 0;
  const symbols = sortedSymbols(includedSymbols);
  const detectedAt = input.features[0].open_time;
  const directionPart = directionSlug(input.direction);
  const symbolPart =
    symbols.length > 0
      ? symbols
          .map((symbol) => symbol.replace("USDT", "").toLowerCase())
          .join("-")
      : "none";

  return {
    id: `bs_suppressed_${eventTimeSlug(detectedAt)}_market_wide_${directionPart}_${symbolPart}`,
    detected_at: detectedAt,
    close_time: input.features[0].close_time,
    scope: "market_wide",
    direction: input.direction,
    symbols,
    breadth_count: input.elevated.length,
    headline_severity: headlineSeverity,
    max_elevated_severity: maxSeverity,
    tier: tierFromSeverity(headlineSeverity),
    suppression_reason: input.reason,
    symbol_evidence: toSymbolEvidence(input.features, includedSymbols),
  };
}

function alignedFeaturesByTime(
  featuresBySymbol: Partial<Record<MarketSymbol, SymbolFeature[]>>,
): Map<string, SymbolFeature[]> {
  const byTime = new Map<string, Map<MarketSymbol, SymbolFeature>>();

  for (const symbol of ALLOWED_SYMBOLS) {
    for (const feature of featuresBySymbol[symbol] ?? []) {
      const symbolMap =
        byTime.get(feature.open_time) ?? new Map<MarketSymbol, SymbolFeature>();
      symbolMap.set(symbol, feature);
      byTime.set(feature.open_time, symbolMap);
    }
  }

  const aligned = new Map<string, SymbolFeature[]>();

  for (const [time, featureMap] of byTime.entries()) {
    if (ALLOWED_SYMBOLS.every((symbol) => featureMap.has(symbol))) {
      aligned.set(
        time,
        ALLOWED_SYMBOLS.map(
          (symbol) => featureMap.get(symbol) as SymbolFeature,
        ),
      );
    }
  }

  return aligned;
}

export function detectRawMarketEvents(
  featuresBySymbol: Partial<Record<MarketSymbol, SymbolFeature[]>>,
): RawDetectionResult {
  const rawEvents: RawMarketEvent[] = [];
  const suppressedEvents: SuppressedMarketEvent[] = [];
  const aligned = alignedFeaturesByTime(featuresBySymbol);
  const consecutiveByDirection: Record<
    Exclude<MarketDirection, "mixed">,
    number
  > = {
    observed_up: 0,
    observed_down: 0,
  };
  let insufficientBaselineRecorded = false;

  for (const time of [...aligned.keys()].sort()) {
    const features = aligned.get(time) as SymbolFeature[];

    if (features.some((feature) => !feature.baseline_ready)) {
      consecutiveByDirection.observed_up = 0;
      consecutiveByDirection.observed_down = 0;

      if (!insufficientBaselineRecorded) {
        suppressedEvents.push(
          makeSuppressedEvent({
            features,
            elevated: [],
            direction: "mixed",
            reason: "insufficient_baseline",
          }),
        );
        insufficientBaselineRecorded = true;
      }

      continue;
    }

    const elevated = features.filter((feature) => feature.is_elevated);

    if (elevated.length === 1) {
      consecutiveByDirection.observed_up = 0;
      consecutiveByDirection.observed_down = 0;
      suppressedEvents.push(
        makeSuppressedEvent({
          features,
          elevated,
          direction:
            elevated[0].direction === "down" ? "observed_down" : "observed_up",
          reason: "single_symbol_public_mvp_suppressed",
        }),
      );
      continue;
    }

    if (elevated.length < MARKET_BREADTH_MIN) {
      consecutiveByDirection.observed_up = 0;
      consecutiveByDirection.observed_down = 0;
      continue;
    }

    const direction = marketDirection(elevated);

    if (direction === "mixed") {
      consecutiveByDirection.observed_up = 0;
      consecutiveByDirection.observed_down = 0;
      suppressedEvents.push(
        makeSuppressedEvent({
          features,
          elevated,
          direction,
          reason: "mixed_direction_same_candle",
        }),
      );
      continue;
    }

    const otherDirection =
      direction === "observed_up" ? "observed_down" : "observed_up";
    consecutiveByDirection[direction] += 1;
    consecutiveByDirection[otherDirection] = 0;

    const severityValues = elevated.map(
      (feature) => feature.scores.severity_score,
    );
    const avgSeverity = averageOrZero(severityValues);
    const maxSeverity = roundNumber(Math.max(...severityValues), 4);
    const confirmation = confirmReason({
      breadthCount: elevated.length,
      avgSeverity,
      maxSeverity,
      consecutiveBars: consecutiveByDirection[direction],
    });

    if (!confirmation.reason) {
      suppressedEvents.push(
        makeSuppressedEvent({
          features,
          elevated,
          direction,
          reason: "market_elevated_not_persisted",
        }),
      );
      continue;
    }

    rawEvents.push(
      makeRawEvent({
        features,
        elevated,
        direction,
        consecutiveBars: consecutiveByDirection[direction],
        waived: confirmation.waived,
        confirmReason: confirmation.reason,
      }),
    );
  }

  return {
    raw_events: rawEvents,
    suppressed_events: suppressedEvents,
  };
}

export const __detectorRawInternalsForTests = {
  eventDate,
  marketDirection,
};
