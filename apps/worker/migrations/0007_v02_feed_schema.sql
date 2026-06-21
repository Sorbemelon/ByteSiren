-- ByteSiren v0.2 additive feed schema.
-- This migration does not drop, rename, or clear v0.1 tables.

ALTER TABLE claude_briefs
ADD COLUMN target_type TEXT;

ALTER TABLE claude_briefs
ADD COLUMN target_id TEXT;

ALTER TABLE claude_briefs
ADD COLUMN prompt_mode TEXT;

CREATE TABLE IF NOT EXISTS signal_events_v02 (
  id TEXT PRIMARY KEY,
  date_utc TEXT NOT NULL,
  event_start TEXT NOT NULL,
  event_end TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  peak_time TEXT,
  direction TEXT NOT NULL,
  signals_count INTEGER NOT NULL,
  n_tracked INTEGER NOT NULL DEFAULT 5,
  avg_change_pct REAL,
  avg_change_method TEXT,
  event_strength_score REAL,
  impact_label TEXT,
  chart_context_score REAL,
  chart_context_label TEXT,
  event_story_type TEXT,
  trend_context TEXT,
  momentum_context TEXT,
  volatility_context TEXT,
  event_range_context TEXT,
  chart_context_reasons_json TEXT NOT NULL DEFAULT '[]',
  chart_context_warnings_json TEXT NOT NULL DEFAULT '[]',
  macro_aligned INTEGER NOT NULL DEFAULT 0,
  nearest_macro_event TEXT,
  macro_delta_min INTEGER,
  source_route_hint TEXT,
  canonical_event_id TEXT,
  merged_from_event_ids_json TEXT NOT NULL DEFAULT '[]',
  first_public_detected_at TEXT,
  last_public_updated_at TEXT,
  claude_trigger_event_id TEXT,
  claude_triggered_at TEXT,
  publish_candidate INTEGER NOT NULL DEFAULT 0,
  publish_reason TEXT,
  suppress_reason TEXT,
  detector_version TEXT NOT NULL DEFAULT 'v02',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS signal_event_symbols_v02 (
  id TEXT PRIMARY KEY,
  signal_event_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  window_change_pct REAL,
  peak_15m_change_pct REAL,
  volume_ratio REAL,
  range_position TEXT,
  prev_24h_high REAL,
  prev_24h_low REAL,
  range_break_direction TEXT,
  range_break_pct REAL,
  range_break_strength REAL,
  distance_to_range_high_pct REAL,
  distance_to_range_low_pct REAL,
  is_lead_mover INTEGER NOT NULL DEFAULT 0,
  is_peak_15m_highlight INTEGER NOT NULL DEFAULT 0,
  participated INTEGER NOT NULL DEFAULT 0,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(signal_event_id) REFERENCES signal_events_v02(id)
);

CREATE TABLE IF NOT EXISTS audit_events_v02 (
  id TEXT PRIMARY KEY,
  date_utc TEXT NOT NULL,
  event_start TEXT NOT NULL,
  event_end TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  direction TEXT,
  avg_change_pct REAL,
  signals_count INTEGER,
  n_tracked INTEGER NOT NULL DEFAULT 5,
  event_strength_score REAL,
  chart_context_score REAL,
  chart_context_label TEXT,
  suppress_reason TEXT,
  why_suppressed TEXT,
  nearby_public_event_id TEXT,
  detector_version TEXT NOT NULL DEFAULT 'v02',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS market_stories_v02 (
  id TEXT PRIMARY KEY,
  date_utc TEXT NOT NULL,
  story_start TEXT NOT NULL,
  story_end TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  story_label TEXT NOT NULL,
  story_family TEXT,
  direction TEXT,
  swing_change_pct REAL,
  chart_context_score REAL,
  range_context_json TEXT NOT NULL DEFAULT '{}',
  trend_context_json TEXT NOT NULL DEFAULT '{}',
  momentum_context_json TEXT NOT NULL DEFAULT '{}',
  volatility_context_json TEXT NOT NULL DEFAULT '{}',
  decision_reasons_json TEXT NOT NULL DEFAULT '[]',
  included_signal_event_ids_json TEXT NOT NULL DEFAULT '[]',
  included_audit_event_ids_json TEXT NOT NULL DEFAULT '[]',
  publish_candidate INTEGER NOT NULL DEFAULT 0,
  publish_reason TEXT,
  suppress_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS market_story_members_v02 (
  id TEXT PRIMARY KEY,
  market_story_id TEXT NOT NULL,
  member_type TEXT NOT NULL CHECK (member_type IN ('signal_event_v02', 'audit_event_v02')),
  member_id TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  role TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(market_story_id) REFERENCES market_stories_v02(id)
);

CREATE TABLE IF NOT EXISTS daily_overviews_v02 (
  id TEXT PRIMARY KEY,
  date_utc TEXT NOT NULL UNIQUE,
  day_start TEXT NOT NULL,
  day_end TEXT NOT NULL,
  market_tone TEXT,
  daily_change_pct REAL,
  daily_change_label TEXT NOT NULL DEFAULT '24h Change',
  market_range_pct REAL,
  notable_symbols_json TEXT NOT NULL DEFAULT '[]',
  top_symbol_moves_json TEXT NOT NULL DEFAULT '[]',
  signal_event_ids_json TEXT NOT NULL DEFAULT '[]',
  market_story_ids_json TEXT NOT NULL DEFAULT '[]',
  audit_event_count INTEGER NOT NULL DEFAULT 0,
  daily_chart_context_summary_json TEXT NOT NULL DEFAULT '{}',
  claude_status TEXT NOT NULL DEFAULT 'queued_for_analysis',
  claude_brief_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(claude_brief_id) REFERENCES claude_briefs(id)
);

CREATE TABLE IF NOT EXISTS source_references_v02 (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('signal_event_v02', 'daily_overview_v02')),
  target_id TEXT NOT NULL,
  brief_id TEXT,
  source_role TEXT NOT NULL,
  source_strength TEXT,
  publisher TEXT,
  title TEXT,
  url TEXT NOT NULL,
  published_at TEXT,
  used_for TEXT,
  accepted INTEGER NOT NULL DEFAULT 1,
  rejection_reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(brief_id) REFERENCES claude_briefs(id)
);

CREATE INDEX IF NOT EXISTS idx_signal_events_v02_date_utc
ON signal_events_v02(date_utc);

CREATE INDEX IF NOT EXISTS idx_signal_events_v02_event_end
ON signal_events_v02(event_end);

CREATE INDEX IF NOT EXISTS idx_signal_events_v02_publish_candidate
ON signal_events_v02(publish_candidate);

CREATE INDEX IF NOT EXISTS idx_signal_event_symbols_v02_signal_event_id
ON signal_event_symbols_v02(signal_event_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_v02_date_utc
ON audit_events_v02(date_utc);

CREATE INDEX IF NOT EXISTS idx_audit_events_v02_event_end
ON audit_events_v02(event_end);

CREATE INDEX IF NOT EXISTS idx_market_stories_v02_date_utc
ON market_stories_v02(date_utc);

CREATE INDEX IF NOT EXISTS idx_market_stories_v02_story_end
ON market_stories_v02(story_end);

CREATE INDEX IF NOT EXISTS idx_market_stories_v02_publish_candidate
ON market_stories_v02(publish_candidate);

CREATE INDEX IF NOT EXISTS idx_market_story_members_v02_market_story_id
ON market_story_members_v02(market_story_id);

CREATE INDEX IF NOT EXISTS idx_daily_overviews_v02_date_utc
ON daily_overviews_v02(date_utc);

CREATE INDEX IF NOT EXISTS idx_source_references_v02_target
ON source_references_v02(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_source_references_v02_brief_id
ON source_references_v02(brief_id);

CREATE INDEX IF NOT EXISTS idx_claude_briefs_target
ON claude_briefs(target_type, target_id);
