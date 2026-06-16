"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "../components/Header";
import ChartPanel from "../components/ChartPanel";
import IntelligenceFeed from "../components/IntelligenceFeed";
import BottomAccordions from "../components/BottomAccordions";
import { fetchFeed, fetchMarket } from "../lib/api";
import { getInitialFeed, getInitialMarket } from "../lib/mockData";
import type { FeedItem, MarketLatest, Symbol } from "../lib/types";
import { SYMBOL_FULL } from "../lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

export default function Home() {
  const [selectedSymbol, setSelectedSymbol] = useState<Symbol>("BTC");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>(getInitialFeed);
  const [market, setMarket] =
    useState<Record<string, MarketLatest>>(getInitialMarket);
  const [feedLoading, setFeedLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const selectedIncident =
    feed.find((f) => f.incident_id === selectedId) ?? null;

  useEffect(() => {
    if (!API_BASE) return;

    setFeedLoading(true);
    fetchFeed(API_BASE)
      .then(({ items, updatedAt: ua }) => {
        if (items.length > 0) setFeed(items);
        if (ua) setUpdatedAt(ua);
      })
      .catch(() => {})
      .finally(() => setFeedLoading(false));

    fetchMarket(API_BASE)
      .then(({ market: m, updatedAt: ua }) => {
        if (Object.keys(m).length > 0) setMarket(m);
        if (ua) setUpdatedAt((prev) => prev ?? ua);
      })
      .catch(() => {});
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
    <main className="flex min-h-screen w-full flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8 2xl:px-10">
      <Header updatedAt={updatedAt} />

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
          <BottomAccordions />
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
