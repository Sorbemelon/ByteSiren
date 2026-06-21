export const ALLOWED_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
] as const;

export type MarketSymbol = (typeof ALLOWED_SYMBOLS)[number];

export const MARKET_INTERVAL = "15m";
export const VISIBLE_RANGE_DAYS = 30;
export const INTERNAL_RETENTION_DAYS = 31;
export const BASELINE_BARS_24H = 96;
export const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
export const BINANCE_BASE_URL = "https://data-api.binance.vision";
export const BINANCE_KLINES_LIMIT = 1000;
export const RECENT_KLINES_LIMIT = 200;
export const BINANCE_USER_AGENT = "ByteSiren/0.1";

export const DETECTOR_CRON = "5,20,35,50 * * * *";
export const CLAUDE_ENRICHMENT_CRON = "10,25,40,55 * * * *";
export const CLEANUP_CRON = "17 0 * * *";
export const GITHUB_INGEST_DISPATCH_CRON = "2,17,32,47 * * * *";
export const LEGACY_POLL_MARKET_CRON = "*/5 * * * *";

export type DetectorVersion = "v01" | "v02";

const allowedSymbolSet = new Set<string>(ALLOWED_SYMBOLS);

export function isAllowedSymbol(symbol: string): symbol is MarketSymbol {
  return allowedSymbolSet.has(symbol);
}

export function parseMarketSymbol(symbol: string | null): MarketSymbol | null {
  if (!symbol) {
    return null;
  }

  const normalized = symbol.toUpperCase();
  return isAllowedSymbol(normalized) ? normalized : null;
}

export function parseDetectorVersion(value?: string | null): DetectorVersion {
  return value?.trim().toLowerCase() === "v02" ? "v02" : "v01";
}

export function isoDaysAgo(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
