import type {
  FeedItem,
  MarketLatest,
  CandleBar,
  SymbolEvidence,
  ApiFeedItem,
  ApiSymbolEvidence,
  ApiCandle,
  FeedApiResponse,
  MarketLatestApiResponse,
  CandlesApiResponse,
} from "./types";

// ─── Normalization helpers ────────────────────────────────────────────────────

function normalizeSymbolEvidence(raw: ApiSymbolEvidence): SymbolEvidence {
  // Preserve null for genuinely missing fields so the UI can show "—"
  // rather than a misleading "0".
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
  // Prefer item-level symbol_evidence; fall back to expanded_details
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
      // backend may send evidence_summary instead of summary
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

function normalizeCandle(c: ApiCandle): CandleBar {
  return {
    // Align each candle to its open time (matches detector/candle-time markers).
    time: Math.floor(new Date(c.open_time).getTime() / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  };
}

// ─── Public API helpers ───────────────────────────────────────────────────────

export async function fetchFeed(
  base: string,
): Promise<{ items: FeedItem[]; updatedAt: string | null }> {
  const res = await fetch(`${base}/api/intelligence/feed`);
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  const data = (await res.json()) as FeedApiResponse;
  return {
    items: (data.items ?? []).map(normalizeFeedItem),
    updatedAt: data.updated_at ?? null,
  };
}

export async function fetchMarket(
  base: string,
): Promise<{ market: Record<string, MarketLatest>; updatedAt: string | null }> {
  const res = await fetch(`${base}/api/market/latest`);
  if (!res.ok) throw new Error(`market HTTP ${res.status}`);
  const data = (await res.json()) as MarketLatestApiResponse;

  const market: Record<string, MarketLatest> = {};
  const now = new Date().toISOString();
  for (const sym of data.symbols ?? []) {
    // Preserve null market values; the UI decides how to render missing data.
    market[sym.symbol] = {
      symbol: sym.symbol,
      last_price: sym.last_price,
      change_15m_pct: sym.change_15m_pct,
      change_24h_pct: sym.change_24h_pct,
      data_status: sym.data_status,
      updated_at: data.updated_at ?? now,
    };
  }
  return { market, updatedAt: data.updated_at ?? null };
}

export async function fetchCandles(
  base: string,
  symbol: string,
): Promise<CandleBar[]> {
  const res = await fetch(
    `${base}/api/market/candles?symbol=${encodeURIComponent(symbol)}`,
  );
  if (!res.ok) throw new Error(`candles HTTP ${res.status}`);
  const data = (await res.json()) as CandlesApiResponse;
  return (data.candles ?? []).map(normalizeCandle);
}
