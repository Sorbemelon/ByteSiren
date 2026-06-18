"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import type { CandleBar, FeedItem } from "../lib/types";
import type { Theme } from "../lib/theme";

interface TradingViewChartProps {
  candles: CandleBar[];
  feed: FeedItem[];
  selectedIncidentId: string | null;
  theme: Theme;
}

interface EvidenceWindowOverlay {
  id: string;
  left: number;
  width: number;
  color: string;
  alpha: number;
  selected: boolean;
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

function toUnixSeconds(iso: string): number | null {
  const value = Math.floor(new Date(iso).getTime() / 1000);
  return Number.isFinite(value) ? value : null;
}

function candleTimeRange(
  candleTimes: number[],
): { first: number; last: number } | null {
  if (candleTimes.length === 0) return null;

  return {
    first: candleTimes[0],
    last: candleTimes[candleTimes.length - 1],
  };
}

function eventOverlapsCandleRange(
  startSec: number,
  endSec: number,
  range: { first: number; last: number },
): boolean {
  const start = Math.min(startSec, endSec);
  const end = Math.max(startSec, endSec);

  return end >= range.first && start <= range.last;
}

/** Snap an incident time (sec) to the displayed candle bucket containing it. */
function snapToCandle(
  timeSec: number,
  candleTimes: number[],
  options: { clampToRange?: boolean } = {},
): number | null {
  const range = candleTimeRange(candleTimes);
  if (!range) return null;

  if (timeSec < range.first) {
    return options.clampToRange ? range.first : null;
  }

  if (timeSec > range.last) {
    return options.clampToRange ? range.last : null;
  }

  let snap = candleTimes[0];
  for (const ct of candleTimes) {
    if (ct <= timeSec) snap = ct;
    else break;
  }
  return snap;
}

function incidentMarkers(
  feed: FeedItem[],
  selectedId: string | null,
  candles: CandleBar[],
): SeriesMarker<Time>[] {
  const candleTimes = candles.map((c) => c.time);
  return feed
    .map((item) => {
      const raw = toUnixSeconds(item.peak_time);
      if (raw == null) return null;

      const snapped = snapToCandle(raw, candleTimes);
      if (snapped == null) return null;
      const isSelected = item.incident_id === selectedId;

      const color =
        item.direction === "observed_up"
          ? isSelected
            ? "#34d399"
            : "#10b981"
          : item.direction === "observed_down"
            ? isSelected
              ? "#fb7185"
              : "#f43f5e"
            : isSelected
              ? "#c4b5fd"
              : "#a78bfa";

      const shape =
        item.scope === "market_day"
          ? "square"
          : item.direction === "observed_up"
            ? "arrowUp"
            : item.direction === "observed_down"
              ? "arrowDown"
              : "circle";

      return {
        time: snapped as Time,
        position: item.direction === "observed_down" ? "aboveBar" : "belowBar",
        color,
        shape,
        size: isSelected ? 2 : 1,
        text: isSelected ? `Impact Score: ${item.evidence.severity_score}` : "",
      } as SeriesMarker<Time>;
    })
    .filter((m): m is SeriesMarker<Time> => m !== null)
    .sort((a, b) => Number(a.time) - Number(b.time));
}

function colorForDirection(item: FeedItem, selected: boolean): string {
  if (item.direction === "observed_up") {
    return selected ? "#34d399" : "#10b981";
  }

  if (item.direction === "observed_down") {
    return selected ? "#fb7185" : "#f43f5e";
  }

  return selected ? "#c4b5fd" : "#a78bfa";
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);

  if (!Number.isFinite(value)) {
    return `rgba(148, 163, 184, ${alpha})`;
  }

  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function evidenceWindowOverlays(
  chart: IChartApi,
  feed: FeedItem[],
  selectedId: string | null,
  candles: CandleBar[],
): EvidenceWindowOverlay[] {
  const candleTimes = candles.map((c) => c.time);
  const range = candleTimeRange(candleTimes);

  if (!range) {
    return [];
  }

  const visibleItems = feed.filter((item) => {
    const startRaw = toUnixSeconds(item.event_start_time);
    const endRaw = toUnixSeconds(item.event_end_time);

    if (startRaw == null || endRaw == null) {
      return false;
    }

    return eventOverlapsCandleRange(startRaw, endRaw, range);
  });

  return visibleItems
    .map((item) => {
      const selected = item.incident_id === selectedId;
      const startRaw = toUnixSeconds(item.event_start_time);
      const endRaw = toUnixSeconds(item.event_end_time);

      if (startRaw == null || endRaw == null) {
        return null;
      }

      const start = snapToCandle(startRaw, candleTimes, {
        clampToRange: true,
      });
      const end = snapToCandle(endRaw, candleTimes, { clampToRange: true });

      if (start == null || end == null) {
        return null;
      }

      const startX = chart.timeScale().timeToCoordinate(start as Time);
      const endX = chart.timeScale().timeToCoordinate(end as Time);

      if (startX == null || endX == null) {
        return null;
      }

      const left = Math.min(startX, endX);
      const width = Math.max(6, Math.abs(endX - startX) + 6);

      return {
        id: item.incident_id,
        left,
        width,
        color: colorForDirection(item, selected),
        alpha: selected ? 0.18 : 0.055,
        selected,
      } satisfies EvidenceWindowOverlay;
    })
    .filter((item): item is EvidenceWindowOverlay => item !== null);
}

export default function TradingViewChart({
  candles,
  feed,
  selectedIncidentId,
  theme,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [windowOverlays, setWindowOverlays] = useState<EvidenceWindowOverlay[]>(
    [],
  );

  const initChart = useCallback(() => {
    const el = containerRef.current;
    if (!el || chartRef.current) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: cssVar("--chart-text", "#94a3b8"),
        fontFamily: "var(--font-geist, system-ui, sans-serif)",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: cssVar("--chart-grid", "rgba(148,163,184,0.06)") },
        horzLines: { color: cssVar("--chart-grid", "rgba(148,163,184,0.06)") },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: cssVar("--chart-border", "rgba(148,163,184,0.12)"),
        scaleMargins: { top: 0.08, bottom: 0.2 },
      },
      timeScale: {
        borderColor: cssVar("--chart-border", "rgba(148,163,184,0.12)"),
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
      width: el.clientWidth,
      height: el.clientHeight || 400,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderUpColor: "#10b981",
      borderDownColor: "#f43f5e",
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const ro = new ResizeObserver(() => {
      if (el && chartRef.current) {
        chartRef.current.applyOptions({
          width: el.clientWidth,
          height: el.clientHeight,
        });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cleanup = initChart();
    return cleanup;
  }, [initChart]);

  // Re-apply theme-driven axis/grid colors when the theme changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      layout: { textColor: cssVar("--chart-text", "#94a3b8") },
      grid: {
        vertLines: { color: cssVar("--chart-grid", "rgba(148,163,184,0.06)") },
        horzLines: { color: cssVar("--chart-grid", "rgba(148,163,184,0.06)") },
      },
      rightPriceScale: {
        borderColor: cssVar("--chart-border", "rgba(148,163,184,0.12)"),
      },
      timeScale: {
        borderColor: cssVar("--chart-border", "rgba(148,163,184,0.12)"),
      },
    });
  }, [theme]);

  useEffect(() => {
    const cs = candleSeriesRef.current;
    const vs = volumeSeriesRef.current;
    if (!cs || !vs || candles.length === 0) return;

    cs.setData(
      candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    vs.setData(
      candles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color:
          c.close >= c.open
            ? "rgba(16, 185, 129, 0.25)"
            : "rgba(244, 63, 94, 0.25)",
      })),
    );

    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    const cs = candleSeriesRef.current;
    if (!cs) return;
    cs.setMarkers(incidentMarkers(feed, selectedIncidentId, candles));
  }, [feed, selectedIncidentId, candles]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) {
      setWindowOverlays([]);
      return;
    }

    const update = () => {
      setWindowOverlays(
        evidenceWindowOverlays(chart, feed, selectedIncidentId, candles),
      );
    };

    update();
    chart.timeScale().subscribeVisibleTimeRangeChange(update);
    window.addEventListener("resize", update);

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(update);
      window.removeEventListener("resize", update);
    };
  }, [feed, selectedIncidentId, candles]);

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: 420 }}
      role="img"
      aria-label="ByteSiren candlestick chart with market incident markers"
    >
      <div ref={containerRef} className="absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[2]">
        {windowOverlays.map((window) => (
          <div
            key={window.id}
            className="absolute top-0 h-full border-x"
            style={{
              left: window.left,
              width: window.width,
              background: hexToRgba(window.color, window.alpha),
              borderColor: hexToRgba(
                window.color,
                window.selected ? 0.32 : 0.1,
              ),
            }}
          >
            {window.selected && (
              <span
                className="absolute left-1 top-2 rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  background: "rgba(3, 4, 7, 0.72)",
                  color: "var(--text-secondary)",
                }}
              >
                Evidence window
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
