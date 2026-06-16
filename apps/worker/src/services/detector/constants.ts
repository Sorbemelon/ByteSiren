import {
  ALLOWED_SYMBOLS,
  BASELINE_BARS_24H,
  MARKET_INTERVAL,
} from "../../config.ts";

export const DETECTOR_SYMBOLS = ALLOWED_SYMBOLS;
export const DETECTOR_INTERVAL = MARKET_INTERVAL;
export const SIGNAL_WINDOW_LABEL = "15m";
export const BASELINE_WINDOW_LABEL = "24h";
export const BASELINE_BARS = BASELINE_BARS_24H;
export const MIN_BASELINE_BARS = BASELINE_BARS;

export const PRICE_Z_FLOOR = 3.0;
export const PRICE_Z_CAP = 8.0;
export const VOLUME_RATIO_FLOOR = 2.0;
export const VOLUME_RATIO_CAP = 6.0;
export const RANGE_RATIO_FLOOR = 2.0;
export const RANGE_RATIO_CAP = 6.0;

export const PRICE_SCORE_WEIGHT = 0.4;
export const VOLUME_SCORE_WEIGHT = 0.3;
export const RANGE_SCORE_WEIGHT = 0.3;

export const SYMBOL_PRICE_Z_MIN = 3.0;
export const SYMBOL_RETURN_15M_PCT_MIN = 0.35;
export const SYMBOL_VOLUME_RATIO_MIN = 2.0;
export const SYMBOL_RANGE_RATIO_MIN = 2.0;

export const MARKET_BREADTH_MIN = 3;
export const MARKET_PERSISTENCE_BARS = 2;
export const WAIVE_PERSISTENCE_BREADTH_MIN = 4;
export const WAIVE_PERSISTENCE_AVG_SEVERITY_MIN = 80;
export const WAIVE_PERSISTENCE_MAX_SEVERITY_MIN = 85;

export const SAME_DIRECTION_MERGE_HOURS = 4;
export const SAME_DIRECTION_MERGE_MS =
  SAME_DIRECTION_MERGE_HOURS * 60 * 60 * 1000;

export const FORBIDDEN_TRADING_ADVICE_TERMS = [
  "buy",
  "sell",
  "long",
  "short",
  "hold",
  "price target",
  "trading signal",
] as const;
