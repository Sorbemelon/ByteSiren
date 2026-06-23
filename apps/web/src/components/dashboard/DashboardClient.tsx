"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Header from "../Header";
import ChartPanel, { type ChartStatus } from "../ChartPanel";
import IntelligenceFeed from "../IntelligenceFeed";
import IntelligenceFeedV02 from "../IntelligenceFeedV02";
import BottomAccordions from "../BottomAccordions";
import { ArrowUp } from "lucide-react";
import {
  API_BASE_CONFIGURED,
  API_BASE_URL,
  fetchCandles,
  fetchFeedEnvelope,
  fetchMarket,
  fetchViewMetrics,
  recordViewMetric,
} from "../../lib/api";
import {
  buildChartHighlightsV02,
  buildChartSourceMarkersV02,
  EMPTY_FEED_SELECTION_V02,
  toggleFeedSelectionV02,
} from "../../lib/feedV02ViewModel";
import {
  getInitialFeed,
  getInitialMarket,
  generateCandles,
} from "../../lib/mockData";
import type {
  ChartHighlightViewV02,
  ChartSourceMarkerViewV02,
  CandleBar,
  FeedSelectionItemTypeV02,
  FeedSelectionV02,
  FeedItem,
  MarketLatest,
  NormalizedFeedV02,
  Symbol,
  ViewMetrics,
} from "../../lib/types";
import { SYMBOL_FULL } from "../../lib/types";
import type { ChartInterval } from "../../lib/candles";

const VIEW_COUNT_STORAGE_KEY = "bytesiren:view:last-counted-at";
const VIEW_COUNT_INTERVAL_MS = 30 * 60 * 1000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

function shouldRecordView(now = Date.now()): boolean {
  try {
    const last = window.localStorage.getItem(VIEW_COUNT_STORAGE_KEY);
    if (!last) return true;
    const lastMs = Number(last);
    return !Number.isFinite(lastMs) || now - lastMs >= VIEW_COUNT_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markViewRecorded(now = Date.now()): void {
  try {
    window.localStorage.setItem(VIEW_COUNT_STORAGE_KEY, String(now));
  } catch {
    // localStorage can be unavailable in privacy-restricted contexts.
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function DashboardClient() {
  const leftSectionRef = useRef<HTMLDivElement>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<Symbol>("BTC");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [chartInterval, setChartInterval] = useState<ChartInterval>("15m");
  const [feed, setFeed] = useState<FeedItem[]>(getInitialFeed);
  const [feedV02, setFeedV02] = useState<NormalizedFeedV02 | null>(null);
  const [feedVersion, setFeedVersion] = useState<"v01" | "v02">("v01");
  const [feedSelectionV02, setFeedSelectionV02] = useState<FeedSelectionV02>(
    EMPTY_FEED_SELECTION_V02,
  );
  const [market, setMarket] =
    useState<Record<string, MarketLatest>>(getInitialMarket);
  const [candles, setCandles] = useState<CandleBar[]>(() =>
    IS_PRODUCTION ? [] : generateCandles(SYMBOL_FULL.BTC),
  );
  const [chartStatus, setChartStatus] = useState<ChartStatus>(
    API_BASE_CONFIGURED ? "loading" : IS_PRODUCTION ? "unavailable" : "ready",
  );
  const [feedLoading, setFeedLoading] = useState(API_BASE_CONFIGURED);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState<string | null>(null);
  const [viewMetrics, setViewMetrics] = useState<ViewMetrics | null>(null);
  const [apiError, setApiError] = useState<string | null>(
    API_BASE_CONFIGURED ? null : "Production API URL is not configured.",
  );
  const [feedPanelHeight, setFeedPanelHeight] = useState<number | null>(null);

  const selectedIncident =
    feed.find((item) => item.incident_id === selectedId) ?? null;

  const handleScrollToTop = useCallback(() => {
    const behavior = preferredScrollBehavior();
    window.scrollTo({ top: 0, behavior });
    document.documentElement.scrollTo({ top: 0, behavior });
    document.body.scrollTo({ top: 0, behavior });

    document
      .querySelectorAll<HTMLElement>(
        '[data-testid="feed-scroll-v01"], [data-testid="feed-scroll-v02"]',
      )
      .forEach((element) => {
        element.scrollTo({ top: 0, behavior });
      });
  }, []);

  const v02ChartHighlights = useMemo(
    () => buildChartHighlightsV02(feedV02, feedSelectionV02),
    [feedSelectionV02, feedV02],
  );
  const v02ChartSourceMarkers = useMemo(
    () => buildChartSourceMarkersV02(feedV02, feedSelectionV02),
    [feedSelectionV02, feedV02],
  );

  useEffect(() => {
    if (!API_BASE_CONFIGURED) {
      setFeedLoading(false);
      return;
    }

    const controller = new AbortController();
    setFeedLoading(true);
    setApiError(null);

    async function loadDashboardData() {
      const [feedResult, marketResult] = await Promise.allSettled([
        fetchFeedEnvelope(API_BASE_URL, { signal: controller.signal }),
        fetchMarket(API_BASE_URL, { signal: controller.signal }),
      ]);

      if (controller.signal.aborted) {
        return;
      }

      if (feedResult.status === "fulfilled") {
        const envelope = feedResult.value;
        setFeedVersion(envelope.version);

        if (envelope.version === "v02") {
          setFeed([]);
          setFeedV02(envelope.v02);
          setSelectedId(null);
          setExpandedId(null);
          setFeedSelectionV02(EMPTY_FEED_SELECTION_V02);
        } else {
          setFeed(envelope.items);
          setFeedV02(null);
          setFeedSelectionV02(EMPTY_FEED_SELECTION_V02);
        }
      } else if (!isAbortError(feedResult.reason)) {
        setApiError("Intelligence Feed could not be loaded.");
      }

      if (marketResult.status === "fulfilled") {
        const { market: nextMarket, updatedAt } = marketResult.value;
        setMarket(nextMarket);
        if (updatedAt) {
          setMarketUpdatedAt(updatedAt);
        }
      } else if (!isAbortError(marketResult.reason)) {
        setApiError(
          (previous) => previous ?? "Market data could not be loaded.",
        );
      }

      setFeedLoading(false);
    }

    void loadDashboardData();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const symbolFull = SYMBOL_FULL[selectedSymbol];

    if (!API_BASE_CONFIGURED) {
      if (IS_PRODUCTION) {
        setCandles([]);
        setChartStatus("unavailable");
      } else {
        setCandles(generateCandles(symbolFull));
        setChartStatus("ready");
      }
      return;
    }

    const controller = new AbortController();
    setChartStatus("loading");
    setCandles([]);

    fetchCandles(API_BASE_URL, symbolFull, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) {
          return;
        }

        setCandles(data);
        setChartStatus(data.length > 0 ? "ready" : "unavailable");
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }

        if (!IS_PRODUCTION) {
          setCandles(generateCandles(symbolFull));
          setChartStatus("ready");
          return;
        }

        setCandles([]);
        setChartStatus("unavailable");
        setApiError(
          (previous) => previous ?? "Chart data could not be loaded.",
        );
      });

    return () => {
      controller.abort();
    };
  }, [selectedSymbol]);

  useEffect(() => {
    if (!API_BASE_CONFIGURED) {
      setViewMetrics(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function loadViewMetrics() {
      const now = Date.now();
      const shouldCount = shouldRecordView(now);

      try {
        const metrics = shouldCount
          ? await recordViewMetric(API_BASE_URL, { signal: controller.signal })
          : await fetchViewMetrics(API_BASE_URL, { signal: controller.signal });

        if (shouldCount) markViewRecorded(now);
        if (!cancelled) setViewMetrics(metrics);
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }

        try {
          const metrics = await fetchViewMetrics(API_BASE_URL, {
            signal: controller.signal,
          });
          if (!cancelled) setViewMetrics(metrics);
        } catch {
          if (!cancelled) setViewMetrics(null);
        }
      }
    }

    void loadViewMetrics();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    setFeedSelectionV02(EMPTY_FEED_SELECTION_V02);
  }, [feedVersion, selectedSymbol]);

  const handleToggle = useCallback(
    (id: string) => {
      const toggling = expandedId === id;
      setSelectedId(toggling ? null : id);
      setExpandedId(toggling ? null : id);
    },
    [expandedId],
  );

  const handleSelectV02Section = useCallback(
    (itemType: FeedSelectionItemTypeV02, itemId: string, dayPostId: string) => {
      setFeedSelectionV02((current) =>
        toggleFeedSelectionV02(current, itemType, itemId, dayPostId),
      );
    },
    [],
  );

  const handleSelectV02ChartHighlight = useCallback(
    (highlight: ChartHighlightViewV02 | null) => {
      if (!highlight) {
        setFeedSelectionV02(EMPTY_FEED_SELECTION_V02);
        return;
      }

      setFeedSelectionV02((current) =>
        toggleFeedSelectionV02(
          current,
          highlight.itemType,
          highlight.itemId,
          highlight.dayPostId,
        ),
      );
    },
    [],
  );

  const handleSelectV02SourceMarker = useCallback(
    (marker: ChartSourceMarkerViewV02) => {
      setFeedSelectionV02({
        itemType: marker.itemType,
        itemId: marker.itemId,
        dayPostId: marker.dayPostId,
      });
    },
    [],
  );

  useEffect(() => {
    if (feedVersion !== "v02") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFeedSelectionV02(EMPTY_FEED_SELECTION_V02);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [feedVersion]);

  useEffect(() => {
    const leftSection = leftSectionRef.current;
    if (!leftSection || typeof ResizeObserver === "undefined") {
      return;
    }

    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const updateHeight = () => {
      if (!desktopQuery.matches) {
        setFeedPanelHeight(null);
        return;
      }

      const leftHeight = leftSection.getBoundingClientRect().height;
      setFeedPanelHeight(leftHeight > 0 ? Math.ceil(leftHeight) : null);
    };

    const observer = new ResizeObserver(updateHeight);
    observer.observe(leftSection);
    updateHeight();

    desktopQuery.addEventListener("change", updateHeight);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer.disconnect();
      desktopQuery.removeEventListener("change", updateHeight);
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  return (
    <main
      className="flex min-h-screen w-full flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8 2xl:px-10"
      data-api-base-configured={String(API_BASE_CONFIGURED)}
    >
      <Header marketUpdatedAt={marketUpdatedAt} />

      {apiError && (
        <div
          className="rounded-lg border px-3 py-2 text-[12px]"
          role="status"
          style={{
            borderColor: "rgba(245, 158, 11, 0.32)",
            background: "var(--chip-bg)",
            color: "var(--status-strong)",
          }}
        >
          {apiError}
        </div>
      )}

      <section
        className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(440px,0.78fr)] lg:items-start 2xl:grid-cols-[minmax(0,1fr)_minmax(560px,0.72fr)]"
        aria-label="AI Crypto Market Intelligence Monitor"
      >
        <div
          ref={leftSectionRef}
          className="flex min-w-0 flex-col gap-4 lg:col-start-1"
          data-testid="dashboard-left-section"
        >
          <ChartPanel
            selectedSymbol={selectedSymbol}
            onSymbolChange={setSelectedSymbol}
            market={market}
            feed={feed}
            selectedIncidentId={selectedIncident?.incident_id ?? null}
            candles={candles}
            chartStatus={chartStatus}
            chartInterval={chartInterval}
            onChartIntervalChange={setChartInterval}
            v02Highlights={v02ChartHighlights}
            v02SourceMarkers={v02ChartSourceMarkers}
            onV02HighlightSelect={
              feedVersion === "v02" ? handleSelectV02ChartHighlight : undefined
            }
            onV02SourceMarkerSelect={
              feedVersion === "v02" ? handleSelectV02SourceMarker : undefined
            }
          />

          <BottomAccordions viewMetrics={viewMetrics} />
        </div>

        <div
          className="min-h-0 overflow-hidden rounded-2xl lg:col-start-2"
          data-testid="dashboard-feed-panel"
          style={
            {
              height: feedPanelHeight ?? undefined,
              maxHeight: feedPanelHeight ?? undefined,
              scrollbarGutter: "stable",
            } as React.CSSProperties
          }
        >
          {feedVersion === "v02" ? (
            <IntelligenceFeedV02
              feed={feedV02}
              loading={feedLoading}
              selection={feedSelectionV02}
              onSelectSection={handleSelectV02Section}
              onClearSelection={() =>
                setFeedSelectionV02(EMPTY_FEED_SELECTION_V02)
              }
            />
          ) : (
            <IntelligenceFeed
              items={feed}
              selectedId={selectedId}
              expandedId={expandedId}
              onToggle={handleToggle}
              loading={feedLoading}
            />
          )}
        </div>
      </section>

      <p className="sr-only">
        Displaying{" "}
        {feedVersion === "v02"
          ? (feedV02?.dayPosts.reduce(
              (count, day) => count + day.sections.length,
              0,
            ) ?? 0)
          : feed.length}{" "}
        market-wide intelligence events from the past 30 days for{" "}
        {Object.values(SYMBOL_FULL).join(", ")} using Binance public market
        data. This is read-only market intelligence and not financial advice.
      </p>

      <button
        type="button"
        onClick={handleScrollToTop}
        className="fixed bottom-4 right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-lg border transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 sm:bottom-5 sm:right-5"
        data-testid="scroll-to-top-button"
        aria-label="Scroll to top"
        style={{
          background: "var(--bg-panel)",
          borderColor: "var(--border-panel)",
          color: "var(--text-primary)",
          boxShadow: "0 8px 20px rgba(0, 0, 0, 0.22)",
        }}
      >
        <ArrowUp size={18} aria-hidden />
      </button>
    </main>
  );
}
