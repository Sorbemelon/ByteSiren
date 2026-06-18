"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "../Header";
import ChartPanel, { type ChartStatus } from "../ChartPanel";
import IntelligenceFeed from "../IntelligenceFeed";
import BottomAccordions from "../BottomAccordions";
import {
  API_BASE_CONFIGURED,
  API_BASE_URL,
  fetchCandles,
  fetchFeed,
  fetchMarket,
  fetchViewMetrics,
  recordViewMetric,
} from "../../lib/api";
import {
  getInitialFeed,
  getInitialMarket,
  generateCandles,
} from "../../lib/mockData";
import type {
  CandleBar,
  FeedItem,
  MarketLatest,
  Symbol,
  ViewMetrics,
} from "../../lib/types";
import { SYMBOL_FULL } from "../../lib/types";
import type { ChartInterval } from "../../lib/candles";

const VIEW_COUNT_STORAGE_KEY = "bytesiren:view:last-counted-at";
const VIEW_COUNT_INTERVAL_MS = 30 * 60 * 1000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

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
  const [selectedSymbol, setSelectedSymbol] = useState<Symbol>("BTC");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [chartInterval, setChartInterval] = useState<ChartInterval>("15m");
  const [feed, setFeed] = useState<FeedItem[]>(getInitialFeed);
  const [market, setMarket] =
    useState<Record<string, MarketLatest>>(getInitialMarket);
  const [candles, setCandles] = useState<CandleBar[]>(() =>
    IS_PRODUCTION ? [] : generateCandles(SYMBOL_FULL.BTC),
  );
  const [chartStatus, setChartStatus] = useState<ChartStatus>(
    API_BASE_CONFIGURED ? "loading" : IS_PRODUCTION ? "unavailable" : "ready",
  );
  const [feedLoading, setFeedLoading] = useState(API_BASE_CONFIGURED);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [viewMetrics, setViewMetrics] = useState<ViewMetrics | null>(null);
  const [apiError, setApiError] = useState<string | null>(
    API_BASE_CONFIGURED ? null : "Production API URL is not configured.",
  );

  const selectedIncident =
    feed.find((item) => item.incident_id === selectedId) ?? null;

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
        fetchFeed(API_BASE_URL, { signal: controller.signal }),
        fetchMarket(API_BASE_URL, { signal: controller.signal }),
      ]);

      if (controller.signal.aborted) {
        return;
      }

      if (feedResult.status === "fulfilled") {
        const { items, updatedAt: feedUpdatedAt } = feedResult.value;
        setFeed(items);
        if (feedUpdatedAt) {
          setUpdatedAt(feedUpdatedAt);
        }
      } else if (!isAbortError(feedResult.reason)) {
        setApiError("Intelligence Feed could not be loaded.");
      }

      if (marketResult.status === "fulfilled") {
        const { market: nextMarket, updatedAt: marketUpdatedAt } =
          marketResult.value;
        setMarket(nextMarket);
        if (marketUpdatedAt) {
          setUpdatedAt((previous) => previous ?? marketUpdatedAt);
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

  const handleToggle = useCallback(
    (id: string) => {
      const toggling = expandedId === id;
      setSelectedId(toggling ? null : id);
      setExpandedId(toggling ? null : id);
    },
    [expandedId],
  );

  return (
    <main
      className="flex min-h-screen w-full flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8 2xl:px-10"
      data-api-base-configured={String(API_BASE_CONFIGURED)}
    >
      <Header updatedAt={updatedAt} />

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
        className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(440px,0.78fr)] lg:grid-rows-[auto_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(560px,0.72fr)]"
        aria-label="AI Crypto Market Intelligence Monitor"
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
        />

        <div
          className="min-h-0 rounded-2xl lg:col-start-2 lg:row-span-2 lg:row-start-1"
          style={{ scrollbarGutter: "stable" } as React.CSSProperties}
        >
          <IntelligenceFeed
            items={feed}
            selectedId={selectedId}
            expandedId={expandedId}
            onToggle={handleToggle}
            loading={feedLoading}
          />
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          <BottomAccordions viewMetrics={viewMetrics} />
        </div>
      </section>

      <p className="sr-only">
        Displaying {feed.length} market-wide intelligence events from the past
        30 days for {Object.values(SYMBOL_FULL).join(", ")} using Binance public
        market data. This is read-only market intelligence and not financial
        advice.
      </p>
    </main>
  );
}
