"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type {
  ChartHighlightViewV02,
  ChartSourceMarkerViewV02,
  MarketLatest,
  FeedItem,
  CandleBar,
  Symbol,
} from "../lib/types";
import { SYMBOLS, SYMBOL_FULL } from "../lib/types";
import { aggregateCandles, CHART_INTERVALS } from "../lib/candles";
import type { ChartInterval } from "../lib/candles";
import { useTheme } from "../lib/theme";

export type ChartStatus = "loading" | "ready" | "unavailable";

const TradingViewChart = dynamic(() => import("./TradingViewChart"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center rounded-xl"
      style={{
        height: 420,
        background: "var(--bg-chart-loading)",
        border: "1px dashed rgba(148,163,184,0.2)",
      }}
    >
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Loading chart…
      </p>
    </div>
  ),
});

interface ChartPanelProps {
  selectedSymbol: Symbol;
  onSymbolChange: (s: Symbol) => void;
  market: Record<string, MarketLatest>;
  feed: FeedItem[];
  selectedIncidentId: string | null;
  candles: CandleBar[];
  chartStatus: ChartStatus;
  chartInterval: ChartInterval;
  onChartIntervalChange: (interval: ChartInterval) => void;
  v02Highlights?: ChartHighlightViewV02[];
  v02SourceMarkers?: ChartSourceMarkerViewV02[];
  onV02HighlightSelect?: (highlight: ChartHighlightViewV02 | null) => void;
  onV02SourceMarkerSelect?: (marker: ChartSourceMarkerViewV02) => void;
}

function fmtPrice(price: number, symbol: string): string {
  if (symbol.includes("XRP")) return `$${price.toFixed(4)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  if (price < 10) return `$${price.toFixed(3)}`;
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export default function ChartPanel({
  selectedSymbol,
  onSymbolChange,
  market,
  feed,
  selectedIncidentId,
  candles,
  chartStatus,
  chartInterval,
  onChartIntervalChange,
  v02Highlights = [],
  v02SourceMarkers = [],
  onV02HighlightSelect,
  onV02SourceMarkerSelect,
}: ChartPanelProps) {
  const symbolFull = SYMBOL_FULL[selectedSymbol];
  const mkt = market[symbolFull];
  const theme = useTheme();

  // Frontend display aggregation only — detection always uses 15m signals.
  const displayCandles = useMemo(
    () => aggregateCandles(candles, chartInterval),
    [candles, chartInterval],
  );

  return (
    <section
      aria-label="Market Chart"
      className="flex flex-col gap-3 rounded-2xl p-4"
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border-panel)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      <h2 className="sr-only">Market Chart</h2>
      {/* Symbol tabs + chart interval selector */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Chart symbol" className="flex gap-1.5">
          {SYMBOLS.map((sym) => {
            const active = sym === selectedSymbol;
            return (
              <button
                key={sym}
                role="tab"
                aria-selected={active}
                onClick={() => onSymbolChange(sym)}
                className="chart-symbol-tab rounded-md px-3 py-1.5 text-xs font-semibold"
              >
                {sym}
              </button>
            );
          })}
        </div>
        <div
          role="tablist"
          aria-label="Chart interval"
          className="flex gap-1.5"
        >
          {CHART_INTERVALS.map((iv) => (
            <button
              key={iv}
              role="tab"
              aria-selected={iv === chartInterval}
              onClick={() => onChartIntervalChange(iv)}
              className="chart-interval-tab rounded-md px-3 py-1.5 text-xs font-semibold"
            >
              {iv}
            </button>
          ))}
        </div>
      </div>

      {/* Stat header */}
      <div
        className="rounded-xl p-3"
        style={{
          background: "var(--bg-stat-card)",
        }}
      >
        <p
          className="text-[13px] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {symbolFull}
        </p>
        {mkt &&
        mkt.data_status !== "missing" &&
        mkt.last_price != null &&
        mkt.change_15m_pct != null &&
        mkt.change_24h_pct != null ? (
          <>
            <p
              className="mt-0.5 text-[22px] font-bold leading-none tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              {fmtPrice(mkt.last_price, symbolFull)}
            </p>
            <p
              className="mt-1.5 text-[12px] tabular-nums"
              style={{ color: "var(--text-secondary)" }}
            >
              <span
                style={{
                  color: mkt.change_15m_pct >= 0 ? "var(--up)" : "var(--down)",
                  fontWeight: 500,
                }}
              >
                15m Change {fmtPct(mkt.change_15m_pct)}
              </span>
              <span style={{ color: "var(--text-muted)" }}> · </span>
              <span
                style={{
                  color: mkt.change_24h_pct >= 0 ? "var(--up)" : "var(--down)",
                  fontWeight: 500,
                }}
              >
                24h Change {fmtPct(mkt.change_24h_pct)}
              </span>
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Market data is delayed. ByteSiren will update when new public
            Binance data is available.
          </p>
        )}
      </div>

      {/* Chart */}
      <div
        className="overflow-hidden rounded-xl"
        style={{ background: "var(--bg-chart-container)" }}
      >
        {displayCandles.length > 0 ? (
          <TradingViewChart
            candles={displayCandles}
            feed={feed}
            selectedIncidentId={selectedIncidentId}
            theme={theme}
            v02Highlights={v02Highlights}
            v02SourceMarkers={v02SourceMarkers}
            onV02HighlightSelect={onV02HighlightSelect}
            onV02SourceMarkerSelect={onV02SourceMarkerSelect}
          />
        ) : (
          <div
            className="flex items-center justify-center px-6 text-center"
            style={{ height: 420 }}
            role="status"
          >
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {chartStatus === "loading"
                ? "Loading chart…"
                : "Market data is delayed. ByteSiren will update when new public Binance data is available."}
            </p>
          </div>
        )}
      </div>

      <p
        className="px-2 text-center text-[11px] leading-snug"
        style={{ color: "var(--text-muted)" }}
      >
        30-day chart | {chartInterval} display | Detections use 15m signals |
        Binance public market data | Evidence window band shows candles used as
        evidence | Source markers use honest article publication time when
        available
      </p>
    </section>
  );
}
