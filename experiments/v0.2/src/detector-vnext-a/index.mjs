import { createHash } from "node:crypto";

import {
  N_TRACKED,
  SYMBOLS,
  average,
  clamp,
  durationMinutes,
  isoForPath,
  roundNumber,
} from "../shared.mjs";
import { calculateFeaturesBySymbol } from "../../../../apps/worker/src/services/detector/index.ts";

export const DEFAULT_OPTIONS = {
  breadthMin: 3,
  triggerPriceZMin: 3,
  sustainPriceZMin: 1.5,
  triggerMovePctMin: 0.35,
  sustainMovePctMin: 0.2,
  triggerSeverityMin: 45,
  sustainSeverityMin: 12,
  confirmRatioMin: 2,
  maxDurationBars: 8,
  calmBarsToClose: 2,
};

function directionFromFeature(feature) {
  if (feature.direction === "up") {
    return "observed_up";
  }

  if (feature.direction === "down") {
    return "observed_down";
  }

  return "flat";
}

function sameDirectionFeature(feature, direction) {
  return directionFromFeature(feature) === direction;
}

function hasMeaningfulMove(feature, minMovePct) {
  return Math.abs(feature.return_15m_pct ?? 0) >= minMovePct;
}

function hasConfirmation(feature, ratioMin) {
  return (
    (feature.volume_ratio ?? 0) >= ratioMin ||
    (feature.volatility_ratio ?? 0) >= ratioMin
  );
}

function isTriggerFeature(feature, direction, options) {
  return (
    feature.baseline_ready &&
    sameDirectionFeature(feature, direction) &&
    hasMeaningfulMove(feature, options.triggerMovePctMin) &&
    Math.abs(feature.price_z ?? 0) >= options.triggerPriceZMin &&
    feature.scores.severity_score >= options.triggerSeverityMin &&
    hasConfirmation(feature, options.confirmRatioMin)
  );
}

function isSustainFeature(feature, direction, options) {
  return (
    feature.baseline_ready &&
    sameDirectionFeature(feature, direction) &&
    hasMeaningfulMove(feature, options.sustainMovePctMin) &&
    Math.abs(feature.price_z ?? 0) >= options.sustainPriceZMin &&
    feature.scores.severity_score >= options.sustainSeverityMin
  );
}

function alignedFeatureRows(featuresBySymbol) {
  const byTime = new Map();

  for (const symbol of SYMBOLS) {
    for (const feature of featuresBySymbol[symbol] ?? []) {
      const row = byTime.get(feature.open_time) ?? {};
      row[symbol] = feature;
      byTime.set(feature.open_time, row);
    }
  }

  return [...byTime.entries()]
    .filter(([, row]) => SYMBOLS.every((symbol) => row[symbol]))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => row);
}

function barEvidence(features, direction, options) {
  const trigger = features.filter((feature) =>
    isTriggerFeature(feature, direction, options),
  );
  const sustain = features.filter((feature) =>
    isSustainFeature(feature, direction, options),
  );
  const participants = sustain.length >= trigger.length ? sustain : trigger;
  const severityValues = participants.map(
    (feature) => feature.scores.severity_score,
  );
  const avgSeverity = average(severityValues) ?? 0;
  const maxSeverity =
    severityValues.length > 0 ? Math.max(...severityValues) : 0;
  const breadthBonus = participants.length / N_TRACKED;

  return {
    direction,
    trigger,
    sustain,
    participants,
    breadth_count: participants.length,
    trigger_breadth_count: trigger.length,
    event_strength: roundNumber(
      clamp(avgSeverity * (0.75 + breadthBonus * 0.25), 0, 100),
      4,
    ),
    max_symbol_severity: roundNumber(maxSeverity, 4),
  };
}

function strongestDirection(features, options) {
  const up = barEvidence(features, "observed_up", options);
  const down = barEvidence(features, "observed_down", options);

  if (up.trigger_breadth_count >= options.breadthMin) {
    return up;
  }

  if (down.trigger_breadth_count >= options.breadthMin) {
    return down;
  }

  return up.event_strength >= down.event_strength ? up : down;
}

function candleBySymbolAndOpen(candlesBySymbol) {
  const result = new Map();

  for (const symbol of SYMBOLS) {
    const byOpen = new Map();

    for (const candle of candlesBySymbol?.[symbol] ?? []) {
      byOpen.set(candle.open_time, candle);
    }

    result.set(symbol, byOpen);
  }

  return result;
}

function eventId({ direction, windowStart, symbols }) {
  const symbolSlug = symbols
    .map((symbol) => symbol.replace("USDT", "").toLowerCase())
    .join("-");
  const digest = createHash("sha1")
    .update(`${direction}:${windowStart}:${symbols.join(",")}`)
    .digest("hex")
    .slice(0, 8);

  return `vnext_a_${isoForPath(windowStart)}_market_wide_${direction.replace(
    "observed_",
    "",
  )}_${symbolSlug}_${digest}`;
}

function choosePeakBar(activeBars) {
  return activeBars.reduce((peak, bar) =>
    bar.event_strength > peak.event_strength ? bar : peak,
  );
}

function signedLargestByAbs(values) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((largest, value) =>
    Math.abs(value) > Math.abs(largest) ? value : largest,
  );
}

function symbolWindowMove(symbol, activeBars, candleIndex) {
  const first = activeBars[0];
  const last = activeBars.at(-1);
  const startCandle = candleIndex.get(symbol)?.get(first.open_time);
  const endCandle = candleIndex.get(symbol)?.get(last.open_time);

  if (!startCandle || !endCandle || startCandle.open <= 0) {
    return null;
  }

  return roundNumber((endCandle.close / startCandle.open - 1) * 100, 4);
}

function eventQueryHints(eventDate, direction, sourceLikelihoodScore) {
  const route =
    direction === "observed_down" ? "market_wide_down" : "market_wide_up";
  const movement = direction === "observed_down" ? "drop" : "rally";

  return {
    route,
    date_bound_query_required: true,
    no_trading_advice: true,
    source_likelihood:
      sourceLikelihoodScore >= 0.7
        ? "high"
        : sourceLikelihoodScore >= 0.4
          ? "medium"
          : "low",
    public_labels: [
      "Event window",
      "Signals",
      "Event strength",
      "Lead mover",
      "Window move",
      "Peak 15m move",
      "Source likelihood",
    ],
    search_phrases: [
      `crypto market ${movement} ${eventDate} cause`,
      `bitcoin ethereum solana xrp ${movement} ${eventDate}`,
    ],
  };
}

export function scoreSourceLikelihood(input) {
  const breadthScore = input.breadth_count / input.n_tracked;
  const strengthScore = input.event_strength / 100;
  const magnitudeScore = clamp(input.max_abs_window_move_pct / 3, 0, 1);
  const volumeScore =
    input.breadth_count === 0
      ? 0
      : input.volume_confirmation_count / input.breadth_count;
  const rangeScore =
    input.breadth_count === 0
      ? 0
      : input.range_confirmation_count / input.breadth_count;
  let score =
    0.08 +
    breadthScore * 0.26 +
    strengthScore * 0.25 +
    magnitudeScore * 0.2 +
    volumeScore * 0.15 +
    rangeScore * 0.06;

  if (
    input.volume_confirmation_count === 0 &&
    input.range_confirmation_count > 0
  ) {
    score -= 0.12;
  }

  if (input.duration_min <= 15 && input.breadth_count === 3) {
    score -= 0.08;
  }

  return roundNumber(clamp(score, 0, 1), 4);
}

function sourceReason(input) {
  const reasons = [
    `${input.breadth_count}/${input.n_tracked} symbols participated`,
    `event strength ${roundNumber(input.event_strength, 1)}`,
    `max window move ${roundNumber(input.max_abs_window_move_pct, 2)}%`,
  ];

  if (input.volume_confirmation_count > 0) {
    reasons.push(`${input.volume_confirmation_count} volume confirmations`);
  }

  if (input.range_confirmation_count > 0) {
    reasons.push(`${input.range_confirmation_count} range confirmations`);
  }

  if (
    input.volume_confirmation_count === 0 &&
    input.range_confirmation_count > 0
  ) {
    reasons.push("range-led event lowered because volume did not confirm");
  }

  return reasons.join("; ");
}

function finalizeEvent(openEvent, candleIndex, options, closeReason = null) {
  const activeBars = openEvent.activeBars;
  const peakBar = choosePeakBar(activeBars);
  const symbols = [
    ...new Set(
      activeBars.flatMap((bar) =>
        bar.participants.map((feature) => feature.symbol),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const windowStart = activeBars[0].open_time;
  const windowEnd = activeBars.at(-1).close_time;
  const duration = durationMinutes(windowStart, windowEnd) ?? 0;
  const windowMovePctBySymbol = {};
  const peak15mMovePctBySymbol = {};
  const volumeConfirmationBySymbol = {};
  const rangeConfirmationBySymbol = {};
  const perSymbolEvidence = [];

  for (const symbol of SYMBOLS) {
    const symbolFeatures = activeBars
      .map((bar) => bar.features.find((feature) => feature.symbol === symbol))
      .filter(Boolean);
    const included = symbols.includes(symbol);
    const peakMove = signedLargestByAbs(
      symbolFeatures
        .map((feature) => feature.return_15m_pct)
        .filter((value) => Number.isFinite(value)),
    );
    const maxPriceZ = Math.max(
      0,
      ...symbolFeatures.map((feature) => Math.abs(feature.price_z ?? 0)),
    );
    const maxVolumeRatio = Math.max(
      0,
      ...symbolFeatures.map((feature) => feature.volume_ratio ?? 0),
    );
    const maxRangeRatio = Math.max(
      0,
      ...symbolFeatures.map((feature) => feature.volatility_ratio ?? 0),
    );
    const maxSeverity = Math.max(
      0,
      ...symbolFeatures.map((feature) => feature.scores.severity_score),
    );
    const windowMove = symbolWindowMove(symbol, activeBars, candleIndex);

    windowMovePctBySymbol[symbol] = windowMove;
    peak15mMovePctBySymbol[symbol] =
      peakMove === null ? null : roundNumber(peakMove, 4);
    volumeConfirmationBySymbol[symbol] =
      maxVolumeRatio >= options.confirmRatioMin;
    rangeConfirmationBySymbol[symbol] =
      maxRangeRatio >= options.confirmRatioMin;
    perSymbolEvidence.push({
      symbol,
      included_in_event: included,
      direction: included ? openEvent.direction : "flat",
      peak_15m_move_pct: peak15mMovePctBySymbol[symbol],
      window_move_pct: windowMove,
      peak_price_z: roundNumber(maxPriceZ, 4),
      max_volume_ratio: roundNumber(maxVolumeRatio, 4),
      max_range_ratio: roundNumber(maxRangeRatio, 4),
      max_severity_score: roundNumber(maxSeverity, 4),
      volume_confirmed: volumeConfirmationBySymbol[symbol],
      range_confirmed: rangeConfirmationBySymbol[symbol],
    });
  }

  const lead = perSymbolEvidence
    .filter((item) => item.included_in_event)
    .reduce((peak, item) =>
      Math.abs(item.window_move_pct ?? 0) > Math.abs(peak.window_move_pct ?? 0)
        ? item
        : peak,
    );
  const includedEvidence = perSymbolEvidence.filter(
    (item) => item.included_in_event,
  );
  const maxAbsWindowMovePct = Math.max(
    0,
    ...includedEvidence.map((item) => Math.abs(item.window_move_pct ?? 0)),
  );
  const volumeConfirmationCount = includedEvidence.filter(
    (item) => item.volume_confirmed,
  ).length;
  const rangeConfirmationCount = includedEvidence.filter(
    (item) => item.range_confirmed,
  ).length;
  const eventStrength = Math.max(
    ...activeBars.map((bar) => bar.event_strength),
  );
  const sourceScoreInput = {
    breadth_count: Math.max(...activeBars.map((bar) => bar.breadth_count)),
    n_tracked: N_TRACKED,
    event_strength: eventStrength,
    max_abs_window_move_pct: maxAbsWindowMovePct,
    volume_confirmation_count: volumeConfirmationCount,
    range_confirmation_count: rangeConfirmationCount,
    duration_min: duration,
  };
  const sourceLikelihoodScore = scoreSourceLikelihood(sourceScoreInput);
  const suppressionNotes = closeReason ? [closeReason] : [];

  return {
    event_id: eventId({
      direction: openEvent.direction,
      windowStart,
      symbols,
    }),
    event_type: "market_wide",
    direction: openEvent.direction,
    window_start: windowStart,
    window_end: windowEnd,
    duration_min: duration,
    peak_time: peakBar.open_time,
    symbols_involved: symbols,
    breadth_count: sourceScoreInput.breadth_count,
    n_tracked: N_TRACKED,
    window_move_pct_by_symbol: windowMovePctBySymbol,
    peak_15m_move_pct_by_symbol: peak15mMovePctBySymbol,
    volume_confirmation_by_symbol: volumeConfirmationBySymbol,
    range_confirmation_by_symbol: rangeConfirmationBySymbol,
    lead_mover: lead.symbol,
    event_strength: roundNumber(eventStrength, 4),
    source_likelihood_score: sourceLikelihoodScore,
    source_likelihood_reason: sourceReason(sourceScoreInput),
    query_hints: eventQueryHints(
      windowStart.slice(0, 10),
      openEvent.direction,
      sourceLikelihoodScore,
    ),
    per_symbol_evidence: perSymbolEvidence,
    suppression_notes: suppressionNotes,
  };
}

function makeSuppression(features, reason) {
  return {
    time: features[0]?.open_time ?? null,
    reason,
    symbols: features
      .filter((feature) => hasMeaningfulMove(feature, 0.01))
      .map((feature) => feature.symbol),
  };
}

export function detectVNextEventsFromFeatures({
  featuresBySymbol,
  candlesBySymbol = {},
  options = {},
}) {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const rows = alignedFeatureRows(featuresBySymbol);
  const candleIndex = candleBySymbolAndOpen(candlesBySymbol);
  const events = [];
  const suppressed_candidates = [];
  let openEvent = null;

  for (const row of rows) {
    const features = SYMBOLS.map((symbol) => row[symbol]);
    const strongest = strongestDirection(features, mergedOptions);
    const triggerReady =
      strongest.trigger_breadth_count >= mergedOptions.breadthMin;
    const sustainReady = strongest.breadth_count >= mergedOptions.breadthMin;

    if (!openEvent && !triggerReady) {
      const highConfirmOnly = features.filter(
        (feature) =>
          feature.baseline_ready &&
          Math.abs(feature.price_z ?? 0) >= mergedOptions.triggerPriceZMin &&
          feature.scores.severity_score >= mergedOptions.triggerSeverityMin &&
          hasConfirmation(feature, mergedOptions.confirmRatioMin),
      );

      if (
        highConfirmOnly.length > 0 &&
        highConfirmOnly.length < mergedOptions.breadthMin
      ) {
        suppressed_candidates.push(
          makeSuppression(features, "market_wide_breadth_below_3"),
        );
      } else if (
        highConfirmOnly.length >= mergedOptions.breadthMin &&
        highConfirmOnly.some(
          (feature) =>
            !hasMeaningfulMove(feature, mergedOptions.triggerMovePctMin),
        )
      ) {
        suppressed_candidates.push(
          makeSuppression(features, "weak_price_move_or_volume_only_spike"),
        );
      }

      continue;
    }

    if (!openEvent && triggerReady) {
      openEvent = {
        direction: strongest.direction,
        activeBars: [
          {
            ...strongest,
            features,
            open_time: features[0].open_time,
            close_time: features[0].close_time,
          },
        ],
        calmBars: 0,
      };
      continue;
    }

    if (!openEvent) {
      continue;
    }

    const current = barEvidence(features, openEvent.direction, mergedOptions);
    const sameDirectionTrigger =
      current.trigger_breadth_count >= mergedOptions.breadthMin;
    const sameDirectionSustain =
      current.breadth_count >= mergedOptions.breadthMin;
    const opposite = barEvidence(
      features,
      openEvent.direction === "observed_up" ? "observed_down" : "observed_up",
      mergedOptions,
    );
    const oppositeTrigger =
      opposite.trigger_breadth_count >= mergedOptions.breadthMin;

    if (oppositeTrigger) {
      events.push(finalizeEvent(openEvent, candleIndex, mergedOptions));
      openEvent = {
        direction: opposite.direction,
        activeBars: [
          {
            ...opposite,
            features,
            open_time: features[0].open_time,
            close_time: features[0].close_time,
          },
        ],
        calmBars: 0,
      };
      continue;
    }

    if (sameDirectionSustain || sameDirectionTrigger) {
      openEvent.activeBars.push({
        ...current,
        features,
        open_time: features[0].open_time,
        close_time: features[0].close_time,
      });
      openEvent.calmBars = 0;

      if (openEvent.activeBars.length >= mergedOptions.maxDurationBars) {
        events.push(
          finalizeEvent(
            openEvent,
            candleIndex,
            mergedOptions,
            "closed_at_max_duration",
          ),
        );
        openEvent = null;
      }

      continue;
    }

    openEvent.calmBars += 1;

    if (openEvent.calmBars >= mergedOptions.calmBarsToClose) {
      events.push(
        finalizeEvent(
          openEvent,
          candleIndex,
          mergedOptions,
          `closed_after_${mergedOptions.calmBarsToClose}_calm_bars`,
        ),
      );
      openEvent = null;
    }
  }

  if (openEvent) {
    events.push(
      finalizeEvent(
        openEvent,
        candleIndex,
        mergedOptions,
        "closed_at_end_of_input",
      ),
    );
  }

  return {
    detector: "vnext_a",
    events,
    suppressed_candidates,
    options: mergedOptions,
  };
}

export function detectVNextEvents({ candlesBySymbol, options = {} }) {
  const featuresBySymbol = calculateFeaturesBySymbol(candlesBySymbol);

  return detectVNextEventsFromFeatures({
    featuresBySymbol,
    candlesBySymbol,
    options,
  });
}
