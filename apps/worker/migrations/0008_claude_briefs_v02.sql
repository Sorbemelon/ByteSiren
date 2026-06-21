-- ByteSiren v0.2 Claude result table.
-- Schema-only in v0.2I2A; no production write path is enabled here.

CREATE TABLE IF NOT EXISTS claude_briefs_v02 (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('signal_event_v02', 'daily_overview_v02')),
  target_id TEXT NOT NULL,
  prompt_mode TEXT NOT NULL CHECK (prompt_mode IN ('signal_event', 'daily_overview')),
  status TEXT NOT NULL DEFAULT 'queued_for_analysis',
  public_label TEXT,
  classification TEXT,
  confidence TEXT,
  headline TEXT,
  collapsed_summary TEXT,
  context_details TEXT,
  source_support TEXT,
  source_timing_alignment TEXT,
  validation_flags_json TEXT NOT NULL DEFAULT '{}',
  detector_feedback_json TEXT NOT NULL DEFAULT '{}',
  prompt_version TEXT,
  model TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_claude_briefs_v02_target
ON claude_briefs_v02(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_claude_briefs_v02_status
ON claude_briefs_v02(status);

CREATE INDEX IF NOT EXISTS idx_claude_briefs_v02_prompt_mode
ON claude_briefs_v02(prompt_mode);
