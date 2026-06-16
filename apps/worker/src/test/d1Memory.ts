import type { MarketCandle } from "../types/market.ts";
import type { IncidentRow } from "../db/incidentRepository.ts";

interface MarketFeatureRow {
  symbol: string;
  interval: string;
  open_time: string;
  return_15m_pct: number;
  price_z: number;
  volume_ratio_vs_24h_baseline: number;
  range_ratio_vs_24h_baseline: number;
  symbol_severity: number;
  direction: string;
  is_elevated: number;
  baseline_bars: number;
  signal_window: string;
  baseline_window: string;
}

interface RawSignalEventRow {
  id: string;
  detected_at: string;
  scope: string;
  direction: string;
  symbol_set_json: string;
  breadth_count: number;
  avg_elevated_severity: number;
  max_elevated_severity: number;
  peak_symbol: string | null;
  auto_confirm_reason: string | null;
  status: string;
  suppression_reason: string | null;
  evidence_json: string;
  tier: string | null;
  query_hints_json: string | null;
}

interface JobRunRow {
  id: string;
  job_name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  message: string;
  metadata_json: string;
}

export interface MemoryD1Tables {
  market_candles: MarketCandle[];
  market_features: MarketFeatureRow[];
  raw_signal_events: RawSignalEventRow[];
  incidents: IncidentRow[];
  job_runs: JobRunRow[];
}

export function createMemoryD1(initial: Partial<MemoryD1Tables> = {}): {
  db: D1Database;
  tables: MemoryD1Tables;
} {
  const tables: MemoryD1Tables = {
    market_candles: [...(initial.market_candles ?? [])],
    market_features: [...(initial.market_features ?? [])],
    raw_signal_events: [...(initial.raw_signal_events ?? [])],
    incidents: [...(initial.incidents ?? [])],
    job_runs: [...(initial.job_runs ?? [])],
  };

  function result(changes: number): D1Result<unknown> {
    return {
      results: [],
      success: true,
      meta: {
        changes,
        changed_db: changes > 0,
        duration: 0,
        last_row_id: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: changes,
      },
    } as unknown as D1Result<unknown>;
  }

  class Prepared {
    private params: unknown[] = [];
    private readonly sql: string;

    constructor(sql: string) {
      this.sql = sql;
    }

    bind(...values: unknown[]) {
      this.params = values;
      return this;
    }

    async all<T>() {
      if (
        this.sql.includes("FROM market_candles") &&
        this.sql.includes("ORDER BY open_time DESC")
      ) {
        const [symbol, interval, limit] = this.params as [
          string,
          string,
          number,
        ];

        return {
          results: tables.market_candles
            .filter((row) => row.symbol === symbol && row.interval === interval)
            .sort((a, b) => b.open_time.localeCompare(a.open_time))
            .slice(0, limit) as T[],
        };
      }

      if (
        this.sql.includes("FROM market_candles") &&
        this.sql.includes("open_time >= ?")
      ) {
        const [symbol, interval, cutoff] = this.params as [
          string,
          string,
          string,
        ];

        return {
          results: tables.market_candles
            .filter(
              (row) =>
                row.symbol === symbol &&
                row.interval === interval &&
                row.open_time >= cutoff,
            )
            .sort((a, b) => a.open_time.localeCompare(b.open_time)) as T[],
        };
      }

      if (
        this.sql.includes("FROM incidents") &&
        this.sql.includes("started_at >= ?")
      ) {
        const [cutoff] = this.params as [string];

        return {
          results: tables.incidents
            .filter(
              (row) =>
                row.started_at >= cutoff &&
                (row.scope === "market_wide" || row.scope === "market_day"),
            )
            .sort((a, b) => b.started_at.localeCompare(a.started_at)) as T[],
        };
      }

      return { results: [] as T[] };
    }

    async first<T>() {
      if (this.sql.includes("MAX(close_time) AS latest_close_time")) {
        const latest = [...tables.market_candles].sort((a, b) =>
          b.close_time.localeCompare(a.close_time),
        )[0];

        return {
          latest_close_time: latest?.close_time ?? null,
        } as T;
      }

      if (this.sql.includes("FROM incidents") && this.sql.includes("id = ?")) {
        const [id] = this.params as [string];
        return (tables.incidents.find((row) => row.id === id) ?? null) as T;
      }

      return null as T;
    }

    async run() {
      if (this.sql.includes("INSERT INTO market_features")) {
        const [
          symbol,
          interval,
          openTime,
          return15mPct,
          priceZ,
          volumeRatio,
          rangeRatio,
          severity,
          direction,
          isElevated,
          baselineBars,
          signalWindow,
          baselineWindow,
        ] = this.params as [
          string,
          string,
          string,
          number,
          number,
          number,
          number,
          number,
          string,
          number,
          number,
          string,
          string,
        ];
        const existing = tables.market_features.find(
          (row) =>
            row.symbol === symbol &&
            row.interval === interval &&
            row.open_time === openTime,
        );
        const row: MarketFeatureRow = {
          symbol,
          interval,
          open_time: openTime,
          return_15m_pct: return15mPct,
          price_z: priceZ,
          volume_ratio_vs_24h_baseline: volumeRatio,
          range_ratio_vs_24h_baseline: rangeRatio,
          symbol_severity: severity,
          direction,
          is_elevated: isElevated,
          baseline_bars: baselineBars,
          signal_window: signalWindow,
          baseline_window: baselineWindow,
        };

        if (existing) {
          Object.assign(existing, row);
        } else {
          tables.market_features.push(row);
        }

        return result(1);
      }

      if (this.sql.includes("INSERT INTO raw_signal_events")) {
        const [
          id,
          detectedAt,
          scope,
          direction,
          symbolSetJson,
          breadthCount,
          avgSeverity,
          maxSeverity,
          peakSymbol,
          autoConfirmReason,
          status,
          suppressionReason,
          evidenceJson,
          tier,
          queryHintsJson,
        ] = this.params as [
          string,
          string,
          string,
          string,
          string,
          number,
          number,
          number,
          string | null,
          string | null,
          string,
          string | null,
          string,
          string | null,
          string | null,
        ];
        const existing = tables.raw_signal_events.find((row) => row.id === id);
        const row: RawSignalEventRow = {
          id,
          detected_at: detectedAt,
          scope,
          direction,
          symbol_set_json: symbolSetJson,
          breadth_count: breadthCount,
          avg_elevated_severity: avgSeverity,
          max_elevated_severity: maxSeverity,
          peak_symbol: peakSymbol,
          auto_confirm_reason: autoConfirmReason,
          status,
          suppression_reason: suppressionReason,
          evidence_json: evidenceJson,
          tier,
          query_hints_json: queryHintsJson,
        };

        if (existing) {
          Object.assign(existing, row);
        } else {
          tables.raw_signal_events.push(row);
        }

        return result(1);
      }

      if (this.sql.includes("INSERT INTO incidents")) {
        const [
          id,
          incidentKey,
          macroDayCacheKey,
          scope,
          direction,
          startedAt,
          endedAt,
          signalWindow,
          baselineWindow,
          headlineSeverity,
          severityLabel,
          breadthCount,
          breadthLabel,
          symbolsJson,
          tagsJson,
          subEventsJson,
          symbolEvidenceJson,
          queryHintsJson,
          status,
          briefStatus,
        ] = this.params as [
          string,
          string,
          string,
          "market_wide" | "market_day",
          "observed_up" | "observed_down" | "two_sided",
          string,
          string | null,
          "15m",
          "24h",
          number,
          string,
          number,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ];
        const existing = tables.incidents.find((row) => row.id === id);
        const now = new Date().toISOString();
        const row: IncidentRow = {
          id,
          incident_key: incidentKey,
          macro_day_cache_key: macroDayCacheKey,
          scope,
          direction,
          started_at: startedAt,
          ended_at: endedAt,
          signal_window: signalWindow,
          baseline_window: baselineWindow,
          headline_severity: headlineSeverity,
          severity_label: severityLabel,
          breadth_count: breadthCount,
          breadth_label: breadthLabel,
          symbols_json: symbolsJson,
          tags_json: tagsJson,
          sub_events_json: subEventsJson,
          symbol_evidence_json: symbolEvidenceJson,
          query_hints_json: queryHintsJson,
          status,
          brief_status: briefStatus,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };

        if (existing) {
          Object.assign(existing, row);
        } else {
          tables.incidents.push(row);
        }

        return result(1);
      }

      if (this.sql.includes("INSERT INTO job_runs")) {
        const [
          id,
          jobName,
          status,
          startedAt,
          finishedAt,
          message,
          metadataJson,
        ] = this.params as [
          string,
          string,
          string,
          string,
          string | null,
          string,
          string,
        ];

        tables.job_runs.push({
          id,
          job_name: jobName,
          status,
          started_at: startedAt,
          finished_at: finishedAt,
          message,
          metadata_json: metadataJson,
        });

        return result(1);
      }

      if (this.sql.includes("DELETE FROM market_features")) {
        const [cutoff] = this.params as [string];
        const before = tables.market_features.length;
        tables.market_features = tables.market_features.filter(
          (row) => row.open_time >= cutoff,
        );
        return result(before - tables.market_features.length);
      }

      if (this.sql.includes("DELETE FROM raw_signal_events")) {
        const [cutoff] = this.params as [string];
        const before = tables.raw_signal_events.length;
        tables.raw_signal_events = tables.raw_signal_events.filter(
          (row) => row.detected_at >= cutoff,
        );
        return result(before - tables.raw_signal_events.length);
      }

      if (this.sql.includes("DELETE FROM incidents")) {
        const [cutoff] = this.params as [string];
        const before = tables.incidents.length;
        tables.incidents = tables.incidents.filter(
          (row) => row.started_at >= cutoff,
        );
        return result(before - tables.incidents.length);
      }

      if (this.sql.includes("DELETE FROM market_candles")) {
        const [cutoff] = this.params as [string];
        const before = tables.market_candles.length;
        tables.market_candles = tables.market_candles.filter(
          (row) => row.open_time >= cutoff,
        );
        return result(before - tables.market_candles.length);
      }

      return result(0);
    }
  }

  const db = {
    prepare(sql: string) {
      return new Prepared(sql);
    },
    async batch(statements: Array<{ run: () => Promise<D1Result<unknown>> }>) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  } as unknown as D1Database;

  return {
    db,
    tables,
  };
}
