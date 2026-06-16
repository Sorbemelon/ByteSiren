import { BASELINE_BARS_24H } from "../config.ts";
import type {
  RawMarketEvent,
  SuppressedMarketEvent,
  SymbolFeature,
} from "../services/detector/index.ts";

export type DetectorRawEventInput = RawMarketEvent | SuppressedMarketEvent;

export interface DetectorCleanupCounts {
  market_features: number;
  raw_signal_events: number;
  incidents: number;
}

function changedRows(result: D1Result<unknown>): number {
  return typeof result.meta.changes === "number" ? result.meta.changes : 0;
}

function numberOrZero(value: number | null): number {
  return value === null || !Number.isFinite(value) ? 0 : value;
}

function rawEventStatus(
  event: DetectorRawEventInput,
): "confirmed" | "suppressed" {
  return "suppression_reason" in event ? "suppressed" : "confirmed";
}

function rawEventAutoConfirmReason(
  event: DetectorRawEventInput,
): string | null {
  return "persistence" in event ? event.persistence.confirm_reason : null;
}

function rawEventQueryHints(event: DetectorRawEventInput): string | null {
  return "query_hints" in event ? JSON.stringify(event.query_hints) : null;
}

function rawEventSuppressionReason(
  event: DetectorRawEventInput,
): string | null {
  return "suppression_reason" in event ? event.suppression_reason : null;
}

function rawEventPeakSymbol(event: DetectorRawEventInput): string | null {
  return "peak_symbol" in event
    ? event.peak_symbol
    : (event.symbols[0] ?? null);
}

export async function upsertMarketFeatures(
  db: D1Database,
  features: SymbolFeature[],
): Promise<number> {
  if (features.length === 0) {
    return 0;
  }

  const statements = features.map((feature) =>
    db
      .prepare(
        `INSERT INTO market_features (
          symbol,
          interval,
          open_time,
          return_15m_pct,
          price_z,
          volume_ratio_vs_24h_baseline,
          range_ratio_vs_24h_baseline,
          symbol_severity,
          direction,
          is_elevated,
          baseline_bars,
          signal_window,
          baseline_window,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(symbol, interval, open_time)
        DO UPDATE SET
          return_15m_pct = excluded.return_15m_pct,
          price_z = excluded.price_z,
          volume_ratio_vs_24h_baseline = excluded.volume_ratio_vs_24h_baseline,
          range_ratio_vs_24h_baseline = excluded.range_ratio_vs_24h_baseline,
          symbol_severity = excluded.symbol_severity,
          direction = excluded.direction,
          is_elevated = excluded.is_elevated,
          baseline_bars = excluded.baseline_bars,
          signal_window = excluded.signal_window,
          baseline_window = excluded.baseline_window,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        feature.symbol,
        feature.interval,
        feature.open_time,
        numberOrZero(feature.return_15m_pct),
        numberOrZero(feature.price_z),
        numberOrZero(feature.volume_ratio),
        numberOrZero(feature.volatility_ratio),
        feature.scores.severity_score,
        feature.direction,
        feature.is_elevated ? 1 : 0,
        feature.baseline_ready ? BASELINE_BARS_24H : 0,
        feature.signal_window,
        feature.baseline_window,
      ),
  );

  let affected = 0;
  const batchSize = 100;

  for (let index = 0; index < statements.length; index += batchSize) {
    const results = await db.batch(statements.slice(index, index + batchSize));
    affected += results.reduce((sum, result) => sum + changedRows(result), 0);
  }

  return affected;
}

export async function upsertRawSignalEvents(
  db: D1Database,
  events: DetectorRawEventInput[],
): Promise<number> {
  if (events.length === 0) {
    return 0;
  }

  const statements = events.map((event) =>
    db
      .prepare(
        `INSERT INTO raw_signal_events (
          id,
          detected_at,
          scope,
          direction,
          symbol_set_json,
          breadth_count,
          avg_elevated_severity,
          max_elevated_severity,
          peak_symbol,
          auto_confirm_reason,
          status,
          suppression_reason,
          evidence_json,
          tier,
          query_hints_json,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id)
        DO UPDATE SET
          detected_at = excluded.detected_at,
          scope = excluded.scope,
          direction = excluded.direction,
          symbol_set_json = excluded.symbol_set_json,
          breadth_count = excluded.breadth_count,
          avg_elevated_severity = excluded.avg_elevated_severity,
          max_elevated_severity = excluded.max_elevated_severity,
          peak_symbol = excluded.peak_symbol,
          auto_confirm_reason = excluded.auto_confirm_reason,
          status = excluded.status,
          suppression_reason = excluded.suppression_reason,
          evidence_json = excluded.evidence_json,
          tier = excluded.tier,
          query_hints_json = excluded.query_hints_json,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        event.id,
        event.detected_at,
        event.scope,
        event.direction,
        JSON.stringify(event.symbols),
        event.breadth_count,
        event.headline_severity,
        event.max_elevated_severity,
        rawEventPeakSymbol(event),
        rawEventAutoConfirmReason(event),
        rawEventStatus(event),
        rawEventSuppressionReason(event),
        JSON.stringify(event.symbol_evidence),
        event.tier,
        rawEventQueryHints(event),
      ),
  );

  let affected = 0;
  const batchSize = 100;

  for (let index = 0; index < statements.length; index += batchSize) {
    const results = await db.batch(statements.slice(index, index + batchSize));
    affected += results.reduce((sum, result) => sum + changedRows(result), 0);
  }

  return affected;
}

export async function cleanupDetectorDataOlderThan31Days(
  db: D1Database,
  cutoffIso: string,
): Promise<DetectorCleanupCounts> {
  const featureResult = await db
    .prepare("DELETE FROM market_features WHERE open_time < ?")
    .bind(cutoffIso)
    .run();
  const rawEventResult = await db
    .prepare("DELETE FROM raw_signal_events WHERE detected_at < ?")
    .bind(cutoffIso)
    .run();
  const incidentResult = await db
    .prepare("DELETE FROM incidents WHERE started_at < ?")
    .bind(cutoffIso)
    .run();

  return {
    market_features: changedRows(featureResult),
    raw_signal_events: changedRows(rawEventResult),
    incidents: changedRows(incidentResult),
  };
}

export function flattenDetectorFeatures(output: {
  featuresBySymbol: Partial<Record<string, SymbolFeature[]>>;
}): SymbolFeature[] {
  return Object.values(output.featuresBySymbol).flatMap(
    (features) => features ?? [],
  );
}
