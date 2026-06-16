"use client";

import dynamic from "next/dynamic";
import { useMemo, useEffect, useState } from "react";
import type { MarketLatest, FeedItem, CandleBar, Symbol } from "../lib/types";
import { SYMBOLS, SYMBOL_FULL } from "../lib/types";
import { generateCandles } from "../lib/mockData";

const TradingViewChart = dynamic(() => import("./TradingViewChart"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center rounded-xl"
      style={{
        height: 420,
        background: "rgba(16, 23, 41, 0.4)",
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
}: ChartPanelProps) {
  const symbolFull = SYMBOL_FULL[selectedSymbol];
  const mkt = market[symbolFull];

  const [candles, setCandles] = useState<CandleBar[]>([]);

  useEffect(() => {
    setCandles(generateCandles(symbolFull));
  }, [symbolFull]);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  useEffect(() => {
    if (!apiBase || candles.length === 0) return;
    fetch(`${apiBase}/api/market/candles?symbol=${symbolFull}`)
      .then((r) => r.json())
      .then((data: CandleBar[]) => {
        if (Array.isArray(data) && data.length > 0) setCandles(data);
      })
      .catch(() => {});
  }, [apiBase, symbolFull, candles.length]);

  const memoCandles = useMemo(() => candles, [candles]);

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
      {/* Symbol tabs + helper */}
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
                className="rounded-md border px-3 py-1 text-xs font-semibold transition-colors"
                style={
                  active
                    ? {
                        borderColor: "var(--accent-primary)",
                        background: "var(--accent-selected-bg)",
                        color: "#c4b5fd",
                      }
                    : {
                        borderColor: "rgba(148,163,184,0.2)",
                        color: "var(--text-muted)",
                      }
                }
              >
                {sym}
              </button>
            );
          })}
        </div>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Chart symbol only · Intelligence Feed shows all detected market events
        </p>
      </div>

      {/* Stat header */}
      <div
        className="rounded-xl p-3"
        style={{
          background: "rgba(16,23,41,0.5)",
          border: "1px solid rgba(148,163,184,0.1)",
        }}
      >
        <p
          className="text-[13px] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {symbolFull}
        </p>
        {mkt ? (
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
        style={{ background: "rgba(16,23,41,0.4)" }}
      >
        <TradingViewChart
          candles={memoCandles}
          feed={feed}
          selectedIncidentId={selectedIncidentId}
        />
      </div>

      <p
        className="text-center text-[11px]"
        style={{ color: "var(--text-muted)" }}
      >
        30-day 15m candles · Binance public market data · Incident markers shown
      </p>
    </section>
  );
}
