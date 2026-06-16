"use client";

import { useEffect, useRef, useCallback } from "react";
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

interface TradingViewChartProps {
  candles: CandleBar[];
  feed: FeedItem[];
  selectedIncidentId: string | null;
}

function incidentMarkers(
  feed: FeedItem[],
  selectedId: string | null,
): SeriesMarker<Time>[] {
  return feed
    .map((item) => {
      const time = Math.floor(
        new Date(item.detected_at).getTime() / 1000,
      ) as Time;
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
        time,
        position: item.direction === "observed_down" ? "aboveBar" : "belowBar",
        color,
        shape,
        size: isSelected ? 2 : 1,
        text:
          item.incident_id === selectedId ? item.evidence.severity_label : "",
      } as SeriesMarker<Time>;
    })
    .sort((a, b) => Number(a.time) - Number(b.time));
}

export default function TradingViewChart({
  candles,
  feed,
  selectedIncidentId,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const initChart = useCallback(() => {
    const el = containerRef.current;
    if (!el || chartRef.current) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        fontFamily: "var(--font-geist, system-ui, sans-serif)",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.06)" },
        horzLines: { color: "rgba(148, 163, 184, 0.06)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.12)",
        scaleMargins: { top: 0.08, bottom: 0.2 },
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.12)",
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
    cs.setMarkers(incidentMarkers(feed, selectedIncidentId));
  }, [feed, selectedIncidentId]);

  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{ height: 420 }}
      role="img"
      aria-label="ByteSiren 30-day 15-minute candlestick chart with incident markers"
    />
  );
}
