CREATE TABLE IF NOT EXISTS claude_analysis_usage (
  usage_date TEXT PRIMARY KEY,
  analysis_count INTEGER NOT NULL DEFAULT 0,
  web_search_requests INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
