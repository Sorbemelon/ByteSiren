import {
  MARKET_INTERVAL,
  VISIBLE_RANGE_DAYS,
  parseMarketSymbol,
} from "../config.ts";
import {
  getCandlesForSymbol,
  getLatestMarketSummary,
} from "../db/marketRepository.ts";
import { json, jsonError } from "../utils/http.ts";

export async function latestMarketResponse(db: D1Database): Promise<Response> {
  const summary = await getLatestMarketSummary(db);

  return json(
    {
      ok: true,
      updated_at: summary.updated_at,
      symbols: summary.symbols,
    },
    {
      headers: {
        "cache-control": "public, max-age=30",
      },
    },
  );
}

export async function marketCandlesResponse(
  request: Request,
  db: D1Database,
): Promise<Response> {
  const url = new URL(request.url);
  const symbol = parseMarketSymbol(url.searchParams.get("symbol"));

  if (!symbol) {
    return jsonError(
      400,
      "invalid_symbol",
      "Symbol must be one of the approved markets.",
    );
  }

  const candles = await getCandlesForSymbol(db, symbol);

  return json(
    {
      ok: true,
      symbol,
      interval: MARKET_INTERVAL,
      range_days: VISIBLE_RANGE_DAYS,
      candles: candles.map((candle) => ({
        open_time: candle.open_time,
        close_time: candle.close_time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        quote_volume: candle.quote_volume,
      })),
    },
    {
      headers: {
        "cache-control": "public, max-age=60",
      },
    },
  );
}
