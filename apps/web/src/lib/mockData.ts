import type { FeedItem, MarketLatest, CandleBar } from "./types";

// ─── Market latest ────────────────────────────────────────────────────────────

export const MOCK_MARKET: Record<string, MarketLatest> = {
  BTCUSDT: {
    symbol: "BTCUSDT",
    last_price: 65420.5,
    change_15m_pct: 0.8,
    change_24h_pct: 3.2,
    data_status: "fresh",
    updated_at: new Date().toISOString(),
  },
  ETHUSDT: {
    symbol: "ETHUSDT",
    last_price: 3580.2,
    change_15m_pct: 0.5,
    change_24h_pct: 2.8,
    data_status: "fresh",
    updated_at: new Date().toISOString(),
  },
  BNBUSDT: {
    symbol: "BNBUSDT",
    last_price: 598.4,
    change_15m_pct: 0.3,
    change_24h_pct: 1.9,
    data_status: "fresh",
    updated_at: new Date().toISOString(),
  },
  SOLUSDT: {
    symbol: "SOLUSDT",
    last_price: 178.6,
    change_15m_pct: 1.2,
    change_24h_pct: 4.5,
    data_status: "fresh",
    updated_at: new Date().toISOString(),
  },
  XRPUSDT: {
    symbol: "XRPUSDT",
    last_price: 0.5425,
    change_15m_pct: 0.4,
    change_24h_pct: 1.7,
    data_status: "fresh",
    updated_at: new Date().toISOString(),
  },
};

// ─── Feed items ───────────────────────────────────────────────────────────────

export const MOCK_FEED: FeedItem[] = [
  {
    incident_id: "inc_001",
    detected_at: "2026-06-14T21:15:00Z",
    display_date: "Jun 14 · 21:15 UTC",
    scope: "market_wide",
    direction: "observed_up",
    symbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"],
    tags: ["same_day_context"],
    evidence: {
      signal_window: "15m",
      baseline_window: "24h",
      summary:
        "All five monitored pairs moved sharply upward within the same 15-minute window.",
      breadth_label: "5/5 pairs",
      severity_score: 100,
      severity_label: "Strong Move",
      avg_15m_change_pct: 2.4,
      peak_symbol: "SOLUSDT",
    },
    brief: {
      status: "brief_ready",
      catalyst_status: "cause_supported",
      label: "Focused Cause",
      summary:
        "Geopolitical easing news triggered a broad crypto market rally. Same-day reports linked the move to progress in US-China trade talks, driving risk assets higher across markets.",
      confidence: "high",
      price_context_check: "matches_binance",
    },
    sources: [
      {
        publisher: "Reuters",
        title:
          "US-China trade talks progress spurs risk-on rally across assets",
        url: "https://www.reuters.com",
        published_at: "2026-06-14",
        used_for: "focused_catalyst",
      },
      {
        publisher: "CoinDesk",
        title: "Crypto rallies as geopolitical tensions ease",
        url: "https://www.coindesk.com",
        published_at: "2026-06-14",
        used_for: "focused_catalyst",
      },
    ],
    expanded_details: {
      symbol_evidence: [
        {
          symbol: "BTCUSDT",
          change_15m_pct: 2.1,
          price_z: 3.2,
          volume_x: 4.5,
          range_x: 3.8,
          score: 95,
        },
        {
          symbol: "ETHUSDT",
          change_15m_pct: 2.4,
          price_z: 3.5,
          volume_x: 5.2,
          range_x: 4.1,
          score: 100,
        },
        {
          symbol: "BNBUSDT",
          change_15m_pct: 1.8,
          price_z: 2.9,
          volume_x: 3.8,
          range_x: 3.2,
          score: 87,
        },
        {
          symbol: "SOLUSDT",
          change_15m_pct: 2.8,
          price_z: 4.1,
          volume_x: 6.1,
          range_x: 4.9,
          score: 100,
        },
        {
          symbol: "XRPUSDT",
          change_15m_pct: 1.9,
          price_z: 3.0,
          volume_x: 4.0,
          range_x: 3.4,
          score: 91,
        },
      ],
      claude_context: {
        summary:
          "Public sources from the same day describe broad market risk-on sentiment driven by geopolitical easing. Multiple outlets reported crypto as part of the wider asset rally.",
        caveats: [
          "This is same-day public context, not proof of exact 15-minute causation.",
        ],
      },
      caveats: [
        "This is same-day public context, not proof of exact 15-minute causation.",
      ],
    },
  },
  {
    incident_id: "inc_002",
    detected_at: "2026-06-12T09:30:00Z",
    display_date: "Jun 12 · 09:30 UTC",
    scope: "market_wide",
    direction: "observed_up",
    symbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"],
    tags: ["same_day_context"],
    evidence: {
      signal_window: "15m",
      baseline_window: "24h",
      summary:
        "Four of five monitored pairs moved upward in the same 15-minute window.",
      breadth_label: "4/5 pairs",
      severity_score: 84,
      severity_label: "Strong Move",
      avg_15m_change_pct: 1.6,
      peak_symbol: "ETHUSDT",
    },
    brief: {
      status: "brief_ready",
      catalyst_status: "cause_likely",
      label: "Likely Cause",
      summary:
        "Public sources suggest strong ETF net inflows and risk-on positioning ahead of the scheduled Fed statement. Sentiment indicators pointed positive in morning trading.",
      confidence: "medium",
      price_context_check: "minor_mismatch",
    },
    sources: [
      {
        publisher: "Bloomberg",
        title: "Bitcoin ETFs see largest weekly inflow in three months",
        url: "https://www.bloomberg.com",
        published_at: "2026-06-12",
        used_for: "likely_cause",
      },
      {
        publisher: "Yahoo Finance",
        title: "Crypto markets move higher ahead of Fed minutes release",
        url: "https://finance.yahoo.com",
        published_at: "2026-06-12",
        used_for: "backdrop",
      },
    ],
    expanded_details: {
      symbol_evidence: [
        {
          symbol: "BTCUSDT",
          change_15m_pct: 1.4,
          price_z: 2.6,
          volume_x: 3.2,
          range_x: 2.9,
          score: 81,
        },
        {
          symbol: "ETHUSDT",
          change_15m_pct: 2.0,
          price_z: 3.1,
          volume_x: 4.0,
          range_x: 3.5,
          score: 90,
        },
        {
          symbol: "BNBUSDT",
          change_15m_pct: 1.3,
          price_z: 2.4,
          volume_x: 3.0,
          range_x: 2.6,
          score: 78,
        },
        {
          symbol: "SOLUSDT",
          change_15m_pct: 1.7,
          price_z: 2.8,
          volume_x: 3.8,
          range_x: 3.2,
          score: 84,
        },
      ],
      claude_context: {
        summary:
          "ETF inflow data and pre-FOMC positioning appear consistent with the observed upward move across four pairs.",
        caveats: [
          "This is same-day public context, not proof of exact 15-minute causation.",
          "Price data shows a minor mismatch with Binance reference.",
        ],
      },
      caveats: [
        "This is same-day public context, not proof of exact 15-minute causation.",
      ],
    },
  },
  {
    incident_id: "inc_003",
    detected_at: "2026-06-10T00:00:00Z",
    display_date: "Jun 10",
    scope: "market_day",
    direction: "two_sided",
    symbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"],
    tags: ["same_day_context"],
    evidence: {
      signal_window: "15m",
      baseline_window: "24h",
      summary:
        "Day-level grouping of two sub-events: sharp intraday decline reversed by late-session recovery.",
      breadth_label: "5/5 pairs",
      severity_score: 83,
      severity_label: "Strong Move",
      avg_15m_change_pct: 1.9,
      peak_symbol: "BTCUSDT",
    },
    brief: {
      status: "brief_ready",
      catalyst_status: "context_only",
      label: "Market Backdrop",
      summary:
        "Sources describe a volatile session. Early losses were attributed to macroeconomic uncertainty; the late-day recovery coincided with improved risk sentiment in equity markets.",
      confidence: "low",
      price_context_check: "unknown",
    },
    sources: [
      {
        publisher: "CoinDesk",
        title: "Crypto endures volatile session before recovering late",
        url: "https://www.coindesk.com",
        published_at: "2026-06-10",
        used_for: "backdrop",
      },
      {
        publisher: "CoinTelegraph",
        title: "Market day recap: crypto swings with equities",
        url: "https://cointelegraph.com",
        published_at: "2026-06-10",
        used_for: "backdrop",
      },
    ],
    expanded_details: {
      symbol_evidence: [
        {
          symbol: "BTCUSDT",
          change_15m_pct: 2.1,
          price_z: 3.4,
          volume_x: 4.2,
          range_x: 3.9,
          score: 91,
        },
        {
          symbol: "ETHUSDT",
          change_15m_pct: 1.8,
          price_z: 2.9,
          volume_x: 3.7,
          range_x: 3.3,
          score: 84,
        },
        {
          symbol: "BNBUSDT",
          change_15m_pct: 1.6,
          price_z: 2.7,
          volume_x: 3.3,
          range_x: 2.9,
          score: 78,
        },
        {
          symbol: "SOLUSDT",
          change_15m_pct: 1.9,
          price_z: 3.1,
          volume_x: 4.0,
          range_x: 3.5,
          score: 86,
        },
        {
          symbol: "XRPUSDT",
          change_15m_pct: 1.7,
          price_z: 2.8,
          volume_x: 3.5,
          range_x: 3.1,
          score: 80,
        },
      ],
      claude_context: {
        summary:
          "Day-level context only. Sources confirm broad volatility but do not identify a direct cause for either sub-event.",
        caveats: [
          "This is same-day public context, not proof of exact 15-minute causation.",
          "Market Day events group multiple sub-events; context applies to the day, not each 15m candle.",
        ],
      },
      caveats: [
        "Market Day events group multiple sub-events; context applies to the day, not each 15m candle.",
      ],
    },
  },
  {
    incident_id: "inc_004",
    detected_at: "2026-06-07T14:00:00Z",
    display_date: "Jun 7 · 14:00 UTC",
    scope: "market_wide",
    direction: "observed_down",
    symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    tags: [],
    evidence: {
      signal_window: "15m",
      baseline_window: "24h",
      summary:
        "Three of five monitored pairs moved sharply downward in the same 15-minute window.",
      breadth_label: "3/5 pairs",
      severity_score: 72,
      severity_label: "Strong Move",
      avg_15m_change_pct: -1.4,
      peak_symbol: "SOLUSDT",
    },
    brief: {
      status: "none_found",
      catalyst_status: "none_found",
      label: "No Clear Cause",
      summary: null,
      confidence: "unexplained",
      price_context_check: "unknown",
    },
    sources: [],
    expanded_details: {
      symbol_evidence: [
        {
          symbol: "BTCUSDT",
          change_15m_pct: -1.2,
          price_z: -2.5,
          volume_x: 2.8,
          range_x: 2.4,
          score: 68,
        },
        {
          symbol: "ETHUSDT",
          change_15m_pct: -1.3,
          price_z: -2.7,
          volume_x: 3.0,
          range_x: 2.6,
          score: 72,
        },
        {
          symbol: "SOLUSDT",
          change_15m_pct: -1.7,
          price_z: -3.2,
          volume_x: 3.5,
          range_x: 3.0,
          score: 81,
        },
      ],
      claude_context: {},
      caveats: [],
    },
  },
  {
    incident_id: "inc_005",
    detected_at: "2026-06-05T18:45:00Z",
    display_date: "Jun 5 · 18:45 UTC",
    scope: "market_wide",
    direction: "observed_up",
    symbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"],
    tags: [],
    evidence: {
      signal_window: "15m",
      baseline_window: "24h",
      summary:
        "All five monitored pairs moved upward in the same 15-minute window.",
      breadth_label: "5/5 pairs",
      severity_score: 91,
      severity_label: "Strong Move",
      avg_15m_change_pct: 1.9,
      peak_symbol: "SOLUSDT",
    },
    brief: {
      status: "analysis_limited",
      catalyst_status: null,
      label: "Claude Limited",
      summary: null,
      confidence: null,
      price_context_check: null,
    },
    sources: [],
    expanded_details: {
      symbol_evidence: [
        {
          symbol: "BTCUSDT",
          change_15m_pct: 1.7,
          price_z: 2.9,
          volume_x: 3.8,
          range_x: 3.3,
          score: 87,
        },
        {
          symbol: "ETHUSDT",
          change_15m_pct: 1.9,
          price_z: 3.1,
          volume_x: 4.1,
          range_x: 3.6,
          score: 90,
        },
        {
          symbol: "BNBUSDT",
          change_15m_pct: 1.5,
          price_z: 2.6,
          volume_x: 3.2,
          range_x: 2.8,
          score: 80,
        },
        {
          symbol: "SOLUSDT",
          change_15m_pct: 2.3,
          price_z: 3.8,
          volume_x: 5.0,
          range_x: 4.3,
          score: 97,
        },
        {
          symbol: "XRPUSDT",
          change_15m_pct: 1.6,
          price_z: 2.8,
          volume_x: 3.5,
          range_x: 3.0,
          score: 83,
        },
      ],
      claude_context: {},
      caveats: [],
    },
  },
  {
    incident_id: "inc_006",
    detected_at: "2026-06-03T11:00:00Z",
    display_date: "Jun 3 · 11:00 UTC",
    scope: "market_wide",
    direction: "two_sided",
    symbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"],
    tags: [],
    evidence: {
      signal_window: "15m",
      baseline_window: "24h",
      summary:
        "All five monitored pairs showed two-sided unusual movement in the same 15-minute window.",
      breadth_label: "5/5 pairs",
      severity_score: 77,
      severity_label: "Strong Move",
      avg_15m_change_pct: 1.7,
      peak_symbol: "ETHUSDT",
    },
    brief: {
      status: "queued_for_analysis",
      catalyst_status: null,
      label: "Waiting for Claude",
      summary: null,
      confidence: null,
      price_context_check: null,
    },
    sources: [],
    expanded_details: {
      symbol_evidence: [
        {
          symbol: "BTCUSDT",
          change_15m_pct: 1.5,
          price_z: 2.7,
          volume_x: 3.4,
          range_x: 2.9,
          score: 79,
        },
        {
          symbol: "ETHUSDT",
          change_15m_pct: 2.1,
          price_z: 3.3,
          volume_x: 4.3,
          range_x: 3.7,
          score: 88,
        },
        {
          symbol: "BNBUSDT",
          change_15m_pct: 1.4,
          price_z: 2.5,
          volume_x: 3.1,
          range_x: 2.7,
          score: 75,
        },
        {
          symbol: "SOLUSDT",
          change_15m_pct: 1.8,
          price_z: 2.9,
          volume_x: 3.8,
          range_x: 3.2,
          score: 82,
        },
        {
          symbol: "XRPUSDT",
          change_15m_pct: 1.6,
          price_z: 2.7,
          volume_x: 3.5,
          range_x: 3.0,
          score: 78,
        },
      ],
      claude_context: {},
      caveats: [],
    },
  },
];

// ─── Deterministic candle generator ──────────────────────────────────────────

const BASE_PRICES: Record<string, number> = {
  BTCUSDT: 65420,
  ETHUSDT: 3580,
  BNBUSDT: 598,
  SOLUSDT: 178,
  XRPUSDT: 0.54,
};

function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

export function generateCandles(symbolFull: string, days = 30): CandleBar[] {
  const basePrice = BASE_PRICES[symbolFull] ?? 100;
  const interval = 15 * 60;
  const count = days * 24 * 4;
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - count * interval;

  const bars: CandleBar[] = [];
  let price = basePrice;

  for (let i = 0; i < count; i++) {
    const seed = basePrice + i * 7;
    const drift = Math.sin(i / 200) * 0.001;
    const noise = (seededRand(seed) - 0.5) * 0.006;
    const change = drift + noise;

    const open = price;
    const close = price * (1 + change);
    const high = Math.max(open, close) * (1 + seededRand(seed * 2) * 0.003);
    const low = Math.min(open, close) * (1 - seededRand(seed * 3) * 0.002);
    const volume = 80 + seededRand(seed * 11) * 300;

    bars.push({
      time: startTime + i * interval,
      open,
      high,
      low,
      close,
      volume,
    });
    price = close;
  }

  return bars;
}

// ─── Dev gate ─────────────────────────────────────────────────────────────────

export const IS_DEV = process.env.NODE_ENV !== "production";

export function getInitialFeed(): FeedItem[] {
  return IS_DEV ? MOCK_FEED : [];
}

export function getInitialMarket(): Record<string, MarketLatest> {
  return IS_DEV ? MOCK_MARKET : {};
}
