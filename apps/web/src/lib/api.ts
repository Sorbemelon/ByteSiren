import type {
  ApiCandle,
  ApiFeedItem,
  ApiSymbolEvidence,
  CandleBar,
  CandlesApiResponse,
  FeedApiResponse,
  FeedItem,
  MarketLatest,
  MarketLatestApiResponse,
  SymbolEvidence,
  ViewMetrics,
  ViewMetricsApiResponse,
} from "./types";

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

function normalizeSymbolEvidence(raw: ApiSymbolEvidence): SymbolEvidence {
  return {
    symbol: raw.symbol,
    change_15m_pct: raw.change_15m_pct,
    price_z: raw.price_z,
    volume_x: raw.volume_ratio,
    range_x: raw.volatility_ratio,
    score: raw.severity_score,
  };
}

function normalizeFeedItem(raw: ApiFeedItem): FeedItem {
  const rawEvidence: ApiSymbolEvidence[] =
    raw.symbol_evidence ?? raw.expanded_details?.symbol_evidence ?? [];
  const symbolEvidence: SymbolEvidence[] = rawEvidence.map(
    normalizeSymbolEvidence,
  );

  return {
    incident_id: raw.incident_id,
    detected_at: raw.detected_at,
    display_date: raw.display_date,
    scope: raw.scope,
    direction: raw.direction,
    symbols: raw.symbols ?? [],
    tags: raw.tags ?? [],
    evidence: {
      signal_window: raw.evidence.signal_window,
      baseline_window: raw.evidence.baseline_window,
      summary: raw.evidence.summary ?? raw.evidence.evidence_summary ?? "",
      breadth_label: raw.evidence.breadth_label,
      severity_score: raw.evidence.severity_score,
      severity_label: raw.evidence.severity_label,
      avg_15m_change_pct: raw.evidence.avg_15m_change_pct ?? null,
      peak_symbol: raw.evidence.peak_symbol ?? "",
    },
    brief: {
      status: raw.brief.status,
      catalyst_status: raw.brief.catalyst_status,
      label: raw.brief.label,
      summary: raw.brief.summary ?? null,
      confidence: raw.brief.confidence,
      price_context_check: raw.brief.price_context_check,
    },
    sources: raw.sources ?? [],
    expanded_details: {
      symbol_evidence: symbolEvidence,
      claude_context:
        (raw.expanded_details?.claude_context as {
          summary?: string;
          caveats?: string[];
        }) ?? {},
      caveats: raw.expanded_details?.caveats ?? [],
    },
  };
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

export async function fetchFeed(
  base = API_BASE_URL,
  options: ApiFetchOptions = {},
): Promise<{ items: FeedItem[]; updatedAt: string | null }> {
  const res = await fetch(apiUrl("/api/intelligence/feed", base), {
    signal: options.signal,
  });

  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);

  const data = (await res.json()) as FeedApiResponse;
  return {
    items: (data.items ?? []).map(normalizeFeedItem),
    updatedAt: data.updated_at ?? null,
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
