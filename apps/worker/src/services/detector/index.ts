export * from "./constants.ts";
export * from "./math.ts";
export * from "./scoring.ts";
export * from "./features.ts";
export * from "./evidence.ts";
export * from "./detectRawEvents.ts";
export * from "./groupIncidents.ts";
export * from "./labels.ts";
export * from "./types.ts";

import type { MarketSymbol } from "../../config.ts";
import type { MarketCandle } from "../../types/market.ts";
import { calculateFeaturesBySymbol } from "./features.ts";
import { detectRawMarketEvents } from "./detectRawEvents.ts";
import { groupIncidentCandidates } from "./groupIncidents.ts";
import type { DetectorOutput } from "./types.ts";

export function detectByteSirenSignals(input: {
  candlesBySymbol: Partial<Record<MarketSymbol, MarketCandle[]>>;
}): DetectorOutput {
  const featuresBySymbol = calculateFeaturesBySymbol(input.candlesBySymbol);
  const rawResult = detectRawMarketEvents(featuresBySymbol);

  return {
    ...rawResult,
    candidates: groupIncidentCandidates(rawResult.raw_events),
  };
}
