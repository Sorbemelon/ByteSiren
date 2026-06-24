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
import type {
  CandleBar,
  ChartHighlightViewV02,
  ChartSourceMarkerViewV02,
  FeedItem,
} from "../lib/types";
import { chooseChartHighlightAtTimeV02 } from "../lib/feedV02ViewModel";
import type { Theme } from "../lib/theme";

interface TradingViewChartProps {
  candles: CandleBar[];
  feed: FeedItem[];
  selectedIncidentId: string | null;
  theme: Theme;
  v02Highlights?: ChartHighlightViewV02[];
  v02SourceMarkers?: ChartSourceMarkerViewV02[];
  onV02HighlightSelect?: (highlight: ChartHighlightViewV02 | null) => void;
  onV02SourceMarkerSelect?: (marker: ChartSourceMarkerViewV02) => void;
}

interface EvidenceWindowOverlay {
  id: string;
  left: number;
  width: number;
  color: string;
  alpha: number;
  selected: boolean;
}

interface V02WindowOverlay extends EvidenceWindowOverlay {
  highlight: ChartHighlightViewV02;
}

interface V02SourceOverlay {
  id: string;
  left: number;
  top: number;
  marker: ChartSourceMarkerViewV02;
}

function sourceMarkerTone(marker: ChartSourceMarkerViewV02): string {
  if (marker.tone === "catalyst") return "var(--source-catalyst-text)";
  if (marker.tone === "likely") return "var(--source-likely-text)";
  if (marker.tone === "main") return "var(--source-main-text)";
  if (marker.tone === "support") return "var(--source-support-text)";
  if (marker.tone === "price") return "var(--source-price-text)";
  return "var(--source-backdrop-text)";
}

interface ChartPlotArea {
  width: number;
  height: number;
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

const LEGACY_MARKET_DAY_HIGHLIGHT_COLOR = "#8b5cf6";
const LEGACY_MARKET_DAY_SELECTED_COLOR = "#a78bfa";
const DAILY_OVERVIEW_HIGHLIGHT_COLOR = "#f59e0b";
const MARKET_STORY_HIGHLIGHT_COLOR = "#8b5cf6";

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

function sourceTimeToCoordinate(
  chart: IChartApi,
  timeSec: number,
  candleTimes: number[],
): number | null {
  const direct = chart.timeScale().timeToCoordinate(timeSec as Time);

  if (direct != null) {
    return Number(direct);
  }

  const range = candleTimeRange(candleTimes);
  if (!range || timeSec < range.first || timeSec > range.last) {
    return null;
  }

  let previous = candleTimes[0];
  let next = candleTimes[candleTimes.length - 1];

  for (const candleTime of candleTimes) {
    if (candleTime <= timeSec) {
      previous = candleTime;
    }

    if (candleTime >= timeSec) {
      next = candleTime;
      break;
    }
  }

  const previousLeft = chart.timeScale().timeToCoordinate(previous as Time);
  const nextLeft = chart.timeScale().timeToCoordinate(next as Time);

  if (previousLeft == null || nextLeft == null) {
    return null;
  }

  if (previous === next) {
    return Number(previousLeft);
  }

  const progress = (timeSec - previous) / (next - previous);
  return (
    Number(previousLeft) + (Number(nextLeft) - Number(previousLeft)) * progress
  );
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
        item.scope === "market_day"
          ? isSelected
            ? LEGACY_MARKET_DAY_SELECTED_COLOR
            : LEGACY_MARKET_DAY_HIGHLIGHT_COLOR
          : item.direction === "observed_up"
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
  if (item.scope === "market_day") {
    return selected
      ? LEGACY_MARKET_DAY_SELECTED_COLOR
      : LEGACY_MARKET_DAY_HIGHLIGHT_COLOR;
  }

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
        alpha: selected ? 0.26 : 0.09,
        selected,
      } satisfies EvidenceWindowOverlay;
    })
    .filter((item): item is EvidenceWindowOverlay => item !== null);
}

function chartTimeToSeconds(time: Time | undefined): number | null {
  if (typeof time === "number") return time;
  if (typeof time === "string") return toUnixSeconds(time);
  if (time && typeof time === "object") {
    return toUnixSeconds(
      `${time.year}-${time.month}-${time.day}T00:00:00.000Z`,
    );
  }
  return null;
}

function colorForV02Highlight(highlight: ChartHighlightViewV02): string {
  if (highlight.itemType === "daily_overview") {
    return DAILY_OVERVIEW_HIGHLIGHT_COLOR;
  }

  if (highlight.itemType === "market_story") {
    return MARKET_STORY_HIGHLIGHT_COLOR;
  }

  if (
    highlight.direction === "observed_down" ||
    highlight.direction?.endsWith("_down")
  ) {
    return highlight.selected ? "#fb7185" : "#f43f5e";
  }

  if (
    highlight.direction === "observed_up" ||
    highlight.direction?.endsWith("_up")
  ) {
    return highlight.selected ? "#34d399" : "#10b981";
  }

  return highlight.selected ? "#67e8f9" : "#22d3ee";
}

function isDirectionalSignalHighlight(
  highlight: ChartHighlightViewV02,
): boolean {
  if (highlight.itemType !== "signal_event") return false;

  return (
    highlight.direction === "observed_down" ||
    highlight.direction === "observed_up" ||
    highlight.direction?.endsWith("_down") === true ||
    highlight.direction?.endsWith("_up") === true
  );
}

function alphaForV02Highlight(highlight: ChartHighlightViewV02): number {
  if (isDirectionalSignalHighlight(highlight)) {
    if (highlight.selected) return 0.38;
    if (highlight.dimmed) return 0.075;
    return 0.18;
  }

  if (highlight.selected) return 0.26;
  if (highlight.dimmed) return 0.045;
  return 0.1;
}

function v02HighlightLayer(highlight: ChartHighlightViewV02): number {
  if (highlight.itemType === "signal_event") return 30;
  if (highlight.itemType === "daily_overview") return 20;
  if (highlight.itemType === "market_story") return 10;
  return 1;
}

function v02HighlightZIndex(highlight: ChartHighlightViewV02): number {
  return v02HighlightLayer(highlight) + (highlight.selected ? 1 : 0);
}

function v02WindowOverlays(
  chart: IChartApi,
  highlights: ChartHighlightViewV02[],
  candles: CandleBar[],
): V02WindowOverlay[] {
  const candleTimes = candles.map((c) => c.time);
  const range = candleTimeRange(candleTimes);

  if (!range) {
    return [];
  }

  return highlights
    .map((highlight) => {
      const startRaw = toUnixSeconds(highlight.start);
      const endRaw = toUnixSeconds(highlight.end);

      if (startRaw == null || endRaw == null) {
        return null;
      }

      if (!eventOverlapsCandleRange(startRaw, endRaw, range)) {
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
      const color = colorForV02Highlight(highlight);

      return {
        id: highlight.id,
        left,
        width,
        color,
        alpha: alphaForV02Highlight(highlight),
        selected: highlight.selected,
        highlight,
      } satisfies V02WindowOverlay;
    })
    .filter((item): item is V02WindowOverlay => item !== null)
    .sort(
      (a, b) =>
        v02HighlightZIndex(a.highlight) - v02HighlightZIndex(b.highlight),
    );
}

function buildV02SourceOverlays(
  chart: IChartApi,
  markers: ChartSourceMarkerViewV02[],
  candles: CandleBar[],
): V02SourceOverlay[] {
  const candleTimes = candles.map((c) => c.time);

  const overlays = markers
    .map((marker) => {
      const raw = toUnixSeconds(marker.time);
      if (raw == null) return null;

      const left = sourceTimeToCoordinate(chart, raw, candleTimes);
      if (left == null) return null;

      return {
        id: marker.id,
        left: Number(left),
        top: 6,
        marker,
      } satisfies V02SourceOverlay;
    })
    .filter((item): item is V02SourceOverlay => item !== null);

  const sorted = [...overlays].sort((a, b) => a.left - b.left);
  const groups: V02SourceOverlay[][] = [];
  const collisionThreshold = 18;

  for (const overlay of sorted) {
    const group = groups.at(-1);
    const groupCenter =
      group == null
        ? null
        : group.reduce((sum, item) => sum + item.left, 0) / group.length;

    if (
      group &&
      groupCenter != null &&
      overlay.left - groupCenter <= collisionThreshold
    ) {
      group.push(overlay);
    } else {
      groups.push([overlay]);
    }
  }

  return groups.flatMap((group) => {
    return group.map((overlay, index) => {
      const top = 6 + index * 16;

      return {
        ...overlay,
        top,
      };
    });
  });
}

function measurePlotArea(
  chart: IChartApi | null,
  container: HTMLDivElement | null,
): ChartPlotArea {
  const containerWidth = container?.clientWidth ?? 0;
  const containerHeight = container?.clientHeight ?? 0;

  if (!chart || !containerWidth || !containerHeight) {
    return { width: containerWidth, height: containerHeight };
  }

  const timeScaleWidth = chart.timeScale().width();
  const timeScaleHeight = chart.timeScale().height();
  const rightScaleWidth = chart.priceScale("right").width();
  const leftScaleWidth = chart.priceScale("left").width();
  const fallbackPaneWidth = Math.max(
    0,
    containerWidth - rightScaleWidth - leftScaleWidth,
  );

  return {
    width: Math.max(0, Math.min(timeScaleWidth, fallbackPaneWidth)),
    height: Math.max(0, containerHeight - timeScaleHeight),
  };
}

export default function TradingViewChart({
  candles,
  feed,
  selectedIncidentId,
  theme,
  v02Highlights = [],
  v02SourceMarkers = [],
  onV02HighlightSelect,
  onV02SourceMarkerSelect,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [windowOverlays, setWindowOverlays] = useState<EvidenceWindowOverlay[]>(
    [],
  );
  const [v02Overlays, setV02Overlays] = useState<V02WindowOverlay[]>([]);
  const [v02SourceOverlays, setV02SourceOverlays] = useState<
    V02SourceOverlay[]
  >([]);
  const [plotArea, setPlotArea] = useState<ChartPlotArea>({
    width: 0,
    height: 0,
  });
  const hasSelectedSourceMarker = v02SourceMarkers.some(
    (marker) => marker.selected,
  );
  const hasSelectedV02Item = v02Highlights.some(
    (highlight) => highlight.selected,
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
        setPlotArea(measurePlotArea(chartRef.current, el));
      }
    });
    ro.observe(el);
    setPlotArea(measurePlotArea(chart, el));

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
      setPlotArea(measurePlotArea(chart, containerRef.current));
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

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) {
      setV02Overlays([]);
      setV02SourceOverlays([]);
      return;
    }

    const update = () => {
      setPlotArea(measurePlotArea(chart, containerRef.current));
      setV02Overlays(v02WindowOverlays(chart, v02Highlights, candles));
      setV02SourceOverlays(
        buildV02SourceOverlays(chart, v02SourceMarkers, candles),
      );
    };

    update();
    chart.timeScale().subscribeVisibleTimeRangeChange(update);
    window.addEventListener("resize", update);

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(update);
      window.removeEventListener("resize", update);
    };
  }, [v02Highlights, v02SourceMarkers, candles]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onV02HighlightSelect) {
      return;
    }

    const handleClick = (param: { time?: Time }) => {
      const timeSec = chartTimeToSeconds(param.time);
      const highlight =
        timeSec == null
          ? null
          : chooseChartHighlightAtTimeV02(v02Highlights, timeSec);
      onV02HighlightSelect(highlight);
    };

    chart.subscribeClick(handleClick);

    return () => {
      chart.unsubscribeClick(handleClick);
    };
  }, [onV02HighlightSelect, v02Highlights]);

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: 420 }}
      role="img"
      aria-label="ByteSiren candlestick chart with market incident markers"
      data-testid="trading-view-chart"
      data-v02-highlight-count={v02Highlights.length}
      data-v02-selected-highlight-id={
        v02Highlights.find((highlight) => highlight.selected)?.id ?? ""
      }
      data-v02-source-marker-count={v02SourceMarkers.length}
      data-plot-area-width={Math.round(plotArea.width)}
      data-plot-area-height={Math.round(plotArea.height)}
    >
      <div ref={containerRef} className="absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-[2] overflow-hidden"
        style={{
          width: plotArea.width,
          height: plotArea.height,
        }}
      >
        {windowOverlays.map((window) => (
          <div
            key={window.id}
            className="absolute top-0 h-full"
            style={{
              left: window.left,
              width: window.width,
              background: hexToRgba(window.color, window.alpha),
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
      <div
        aria-hidden={!onV02HighlightSelect}
        className="pointer-events-none absolute left-0 top-0 z-[3] overflow-hidden"
        style={{
          width: plotArea.width,
          height: plotArea.height,
        }}
      >
        {v02Overlays.map((window) => (
          <button
            key={window.id}
            type="button"
            data-testid="chart-v02-highlight"
            data-highlight-id={window.highlight.id}
            data-item-id={window.highlight.itemId}
            data-item-type={window.highlight.itemType}
            data-highlight-type={window.highlight.type}
            onClick={(event) => {
              event.stopPropagation();
              onV02HighlightSelect?.(window.highlight);
            }}
            aria-label={`${window.highlight.label} chart window`}
            className="pointer-events-auto absolute top-0 h-full text-left transition-colors"
            style={{
              left: window.left,
              width: window.width,
              background: hexToRgba(window.color, window.alpha),
              zIndex: v02HighlightZIndex(window.highlight),
            }}
          >
            {window.selected && (
              <span
                className="absolute left-1 top-2 max-w-[160px] truncate rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  background: "rgba(3, 4, 7, 0.72)",
                  color: "var(--text-secondary)",
                }}
              >
                {window.highlight.label}
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        aria-hidden={!onV02SourceMarkerSelect}
        className="pointer-events-none absolute left-0 top-0 z-[4] overflow-hidden"
        style={{
          width: plotArea.width,
          height: Math.min(108, plotArea.height),
        }}
      >
        {v02SourceOverlays.map((overlay) => {
          const muted =
            (hasSelectedSourceMarker || hasSelectedV02Item) &&
            !overlay.marker.selected;
          const markerSize = overlay.marker.selected ? 15 : muted ? 6 : 10;
          const markerBorderWidth = overlay.marker.filled
            ? overlay.marker.selected
              ? 2
              : muted
                ? 0
                : 1.4
            : overlay.marker.selected
              ? 3
              : muted
                ? 2
                : 2.4;

          return (
            <button
              key={overlay.id}
              type="button"
              data-testid="chart-v02-source-marker"
              data-item-id={overlay.marker.itemId}
              data-item-type={overlay.marker.itemType}
              data-source-url={overlay.marker.url}
              data-source-label={overlay.marker.label}
              data-source-tone={overlay.marker.tone}
              data-selected={String(overlay.marker.selected)}
              data-muted={String(muted)}
              data-filled={String(overlay.marker.filled)}
              data-marker-left={Math.round(overlay.left)}
              data-marker-top={Math.round(overlay.top)}
              onClick={(event) => {
                event.stopPropagation();
                onV02SourceMarkerSelect?.(overlay.marker);
              }}
              aria-label={`${overlay.marker.label} source marker for ${overlay.marker.publisher ?? overlay.marker.itemType}`}
              title={`${overlay.marker.label}: ${overlay.marker.publisher ?? overlay.marker.url}`}
              className="pointer-events-auto absolute inline-flex h-6 w-6 -translate-x-1/2 items-center justify-center bg-transparent p-0 transition-opacity"
              style={{
                left: overlay.left,
                top: overlay.top,
                color: sourceMarkerTone(overlay.marker),
                opacity: muted ? 0.42 : 1,
              }}
            >
              <span
                aria-hidden
                className={
                  overlay.marker.itemType === "daily_overview"
                    ? "block rounded-full border"
                    : "block rotate-45 border"
                }
                style={{
                  width: markerSize,
                  height: markerSize,
                  borderColor: sourceMarkerTone(overlay.marker),
                  borderWidth: markerBorderWidth,
                  background: overlay.marker.filled
                    ? sourceMarkerTone(overlay.marker)
                    : "transparent",
                  boxShadow: overlay.marker.selected
                    ? `0 0 0 2px color-mix(in srgb, ${sourceMarkerTone(overlay.marker)} 22%, transparent)`
                    : "none",
                  transition:
                    "width 160ms ease-out, height 160ms ease-out, opacity 160ms ease-out",
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
