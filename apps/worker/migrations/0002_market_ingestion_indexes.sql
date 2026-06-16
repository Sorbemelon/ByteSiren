CREATE INDEX IF NOT EXISTS idx_market_candles_symbol_interval_close_time
ON market_candles(symbol, interval, close_time);

CREATE INDEX IF NOT EXISTS idx_market_candles_open_time
ON market_candles(open_time);
