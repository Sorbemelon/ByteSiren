"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "../components/Header";
import ChartPanel from "../components/ChartPanel";
import IntelligenceFeed from "../components/IntelligenceFeed";
import BottomAccordions from "../components/BottomAccordions";
import type { FeedItem, MarketLatest, Symbol } from "../lib/types";
import { SYMBOL_FULL } from "../lib/types";
import { MOCK_FEED, MOCK_MARKET } from "../lib/mockData";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

export default function Home() {
  const [selectedSymbol, setSelectedSymbol] = useState<Symbol>("BTC");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>(MOCK_FEED);
  const [market, setMarket] =
    useState<Record<string, MarketLatest>>(MOCK_MARKET);
  const [feedLoading, setFeedLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const selectedIncident =
    feed.find((f) => f.incident_id === selectedId) ?? null;

  // Fetch live data when API_BASE is available
  useEffect(() => {
    if (!API_BASE) return;

    // Feed
    setFeedLoading(true);
    fetch(`${API_BASE}/api/intelligence/feed`)
      .then((r) => r.json())
      .then((data: FeedItem[] | { items: FeedItem[] }) => {
        const items = Array.isArray(data) ? data : (data.items ?? []);
        if (items.length > 0) setFeed(items);
      })
      .catch(() => {})
      .finally(() => setFeedLoading(false));

    // Market latest
    fetch(`${API_BASE}/api/market/latest`)
      .then((r) => r.json())
      .then((data: MarketLatest[] | Record<string, MarketLatest>) => {
        if (Array.isArray(data)) {
          const map: Record<string, MarketLatest> = {};
          data.forEach((m) => {
            map[m.symbol] = m;
          });
          setMarket(map);
        } else {
          setMarket(data);
        }
        setUpdatedAt(new Date().toISOString());
      })
      .catch(() => {});
  }, []);

  // Derive updatedAt from mock market on mount if no API
  useEffect(() => {
    if (!API_BASE) {
      setUpdatedAt(MOCK_MARKET["BTCUSDT"]?.updated_at ?? null);
    }
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
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
      <Header updatedAt={updatedAt} />

      {/* Two-column dashboard grid */}
      <section
        className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]"
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
          className="overflow-y-auto rounded-2xl lg:max-h-[calc(100vh-8rem)]"
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
      </section>

      <BottomAccordions />

      {/* Accessible chart summary for screen readers */}
      <p className="sr-only">
        Displaying {feed.length} market-wide intelligence events from the past
        30 days for {Object.values(SYMBOL_FULL).join(", ")} using Binance public
        market data. This is read-only market intelligence and not financial
        advice.
      </p>
    </main>
  );
}
