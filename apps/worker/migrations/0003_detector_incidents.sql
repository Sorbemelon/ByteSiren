ALTER TABLE market_features
ADD COLUMN signal_window TEXT NOT NULL DEFAULT '15m';

ALTER TABLE market_features
ADD COLUMN baseline_window TEXT NOT NULL DEFAULT '24h';

ALTER TABLE raw_signal_events
ADD COLUMN tier TEXT;

ALTER TABLE raw_signal_events
ADD COLUMN query_hints_json TEXT;

ALTER TABLE incidents
ADD COLUMN query_hints_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE incidents
ADD COLUMN brief_status TEXT NOT NULL DEFAULT 'queued_for_analysis';

CREATE INDEX IF NOT EXISTS idx_raw_signal_events_status_detected_at
ON raw_signal_events(status, detected_at);

CREATE INDEX IF NOT EXISTS idx_incidents_scope_started_at
ON incidents(scope, started_at);
