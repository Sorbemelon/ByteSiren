import {
  PRICE_SCORE_WEIGHT,
  PRICE_Z_CAP,
  PRICE_Z_FLOOR,
  RANGE_RATIO_CAP,
  RANGE_RATIO_FLOOR,
  RANGE_SCORE_WEIGHT,
  VOLUME_RATIO_CAP,
  VOLUME_RATIO_FLOOR,
  VOLUME_SCORE_WEIGHT,
} from "./constants.ts";
import { clamp, roundNumber } from "./math.ts";
import type { DetectorScores, MarketTier } from "./types.ts";

export function scaledScore(value: number, floor: number, cap: number): number {
  if (!Number.isFinite(value) || value <= floor) {
    return 0;
  }

  if (value >= cap) {
    return 100;
  }

  return roundNumber(((value - floor) / (cap - floor)) * 100, 4);
}

export function calculateScores(input: {
  price_z: number | null;
  volume_ratio: number | null;
  volatility_ratio: number | null;
}): DetectorScores {
  const priceScore = scaledScore(
    Math.abs(input.price_z ?? 0),
    PRICE_Z_FLOOR,
    PRICE_Z_CAP,
  );
  const volumeScore = scaledScore(
    input.volume_ratio ?? 0,
    VOLUME_RATIO_FLOOR,
    VOLUME_RATIO_CAP,
  );
  const rangeScore = scaledScore(
    input.volatility_ratio ?? 0,
    RANGE_RATIO_FLOOR,
    RANGE_RATIO_CAP,
  );

  return {
    price_score: priceScore,
    volume_score: volumeScore,
    range_score: rangeScore,
    severity_score: roundNumber(
      clamp(
        priceScore * PRICE_SCORE_WEIGHT +
          volumeScore * VOLUME_SCORE_WEIGHT +
          rangeScore * RANGE_SCORE_WEIGHT,
        0,
        100,
      ),
      4,
    ),
  };
}

export function tierFromSeverity(severity: number): MarketTier {
  if (severity >= 75) {
    return "severe";
  }

  if (severity >= 50) {
    return "elevated";
  }

  if (severity >= 25) {
    return "notable";
  }

  return "normal";
}
