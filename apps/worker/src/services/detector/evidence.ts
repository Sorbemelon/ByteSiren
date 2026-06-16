import { roundNumber } from "./math.ts";
import type { SymbolEvidence, SymbolFeature } from "./types.ts";

export function toSymbolEvidence(
  features: SymbolFeature[],
  includedSymbols: Set<string>,
): SymbolEvidence[] {
  return [...features]
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((feature) => ({
      symbol: feature.symbol,
      included_in_event: includedSymbols.has(feature.symbol),
      direction: feature.direction,
      signal_window: feature.signal_window,
      baseline_window: feature.baseline_window,
      change_15m_pct: feature.return_15m_pct,
      price_z: feature.price_z,
      volume_ratio: feature.volume_ratio,
      volatility_ratio: feature.volatility_ratio,
      severity_score: roundNumber(feature.scores.severity_score, 4),
    }));
}
