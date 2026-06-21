import type {
  ApiCandle,
  CandleBar,
  CandlesApiResponse,
  FeedApiResponse,
  FeedItem,
  MarketLatest,
  MarketLatestApiResponse,
  NormalizedFeedEnvelope,
  ViewMetrics,
  ViewMetricsApiResponse,
} from "./types";
import { normalizeFeedResponse } from "./feedAdapters";

const rawApiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

export const API_BASE_URL =
  rawApiBase && rawApiBase.trim().length > 0
    ? rawApiBase.trim().replace(/\/$/, "")
    : process.env.NODE_ENV === "production"
      ? ""
      : "http://localhost:8787";

export const API_BASE_CONFIGURED = API_BASE_URL.length > 0;

export const API_HOST_LABEL = (() => {
  if (!API_BASE_CONFIGURED) {
    return "not configured";
  }

  try {
    return new URL(API_BASE_URL).host;
  } catch {
    return "invalid API URL";
  }
})();

interface ApiFetchOptions {
  signal?: AbortSignal;
}

export function apiUrl(path: string, base = API_BASE_URL): string {
  const trimmedBase = base.trim().replace(/\/$/, "");

  if (!trimmedBase) {
    throw new Error("Production API URL is not configured.");
  }

  return `${trimmedBase}${path.startsWith("/") ? path : `/${path}`}`;
}

function normalizeCandle(candle: ApiCandle): CandleBar {
  return {
    time: Math.floor(new Date(candle.open_time).getTime() / 1000),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  };
}

export async function fetchFeedEnvelope(
  base = API_BASE_URL,
  options: ApiFetchOptions = {},
): Promise<NormalizedFeedEnvelope> {
  const res = await fetch(apiUrl("/api/intelligence/feed", base), {
    signal: options.signal,
  });

  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);

  const data = (await res.json()) as FeedApiResponse;
  return normalizeFeedResponse(data);
}

export async function fetchFeed(
  base = API_BASE_URL,
  options: ApiFetchOptions = {},
): Promise<{ items: FeedItem[]; updatedAt: string | null }> {
  const data = await fetchFeedEnvelope(base, options);
  return {
    items: data.items,
    updatedAt: data.updatedAt,
  };
}

export async function fetchMarket(
  base = API_BASE_URL,
  options: ApiFetchOptions = {},
): Promise<{ market: Record<string, MarketLatest>; updatedAt: string | null }> {
  const res = await fetch(apiUrl("/api/market/latest", base), {
    signal: options.signal,
  });

  if (!res.ok) throw new Error(`market HTTP ${res.status}`);

  const data = (await res.json()) as MarketLatestApiResponse;
  const market: Record<string, MarketLatest> = {};
  const now = new Date().toISOString();

  for (const symbol of data.symbols ?? []) {
    market[symbol.symbol] = {
      symbol: symbol.symbol,
      last_price: symbol.last_price,
      change_15m_pct: symbol.change_15m_pct,
      change_24h_pct: symbol.change_24h_pct,
      data_status: symbol.data_status,
      updated_at: data.updated_at ?? now,
    };
  }

  return { market, updatedAt: data.updated_at ?? null };
}

export async function fetchCandles(
  base = API_BASE_URL,
  symbol: string,
  options: ApiFetchOptions = {},
): Promise<CandleBar[]> {
  const res = await fetch(
    apiUrl(`/api/market/candles?symbol=${encodeURIComponent(symbol)}`, base),
    {
      signal: options.signal,
    },
  );

  if (!res.ok) throw new Error(`candles HTTP ${res.status}`);

  const data = (await res.json()) as CandlesApiResponse;
  return (data.candles ?? []).map(normalizeCandle);
}

export async function fetchViewMetrics(
  base = API_BASE_URL,
  options: ApiFetchOptions = {},
): Promise<ViewMetrics> {
  const res = await fetch(apiUrl("/api/metrics/views", base), {
    signal: options.signal,
  });

  if (!res.ok) throw new Error(`view metrics HTTP ${res.status}`);

  const data = (await res.json()) as ViewMetricsApiResponse;
  return {
    updated_at: data.updated_at,
    today_utc: data.today_utc,
    total_views: data.total_views,
    today_views: data.today_views,
  };
}

export async function recordViewMetric(
  base = API_BASE_URL,
  options: ApiFetchOptions = {},
): Promise<ViewMetrics> {
  const res = await fetch(apiUrl("/api/metrics/views", base), {
    method: "POST",
    signal: options.signal,
  });

  if (!res.ok) throw new Error(`view metrics POST HTTP ${res.status}`);

  const data = (await res.json()) as ViewMetricsApiResponse;
  return {
    updated_at: data.updated_at,
    today_utc: data.today_utc,
    total_views: data.total_views,
    today_views: data.today_views,
  };
}
