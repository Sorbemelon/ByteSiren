CREATE TABLE IF NOT EXISTS public_view_counts (
  view_date TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
