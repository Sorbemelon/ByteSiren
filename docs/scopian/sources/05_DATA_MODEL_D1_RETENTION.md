---
project: ByteSiren
source_id: BS-SRC-05
title: D1 Data Model and Retention
status: frozen_source
version: phase0-source-of-truth-v1
last_updated: 2026-06-16
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Any change to frozen decisions requires a Scopian Scope Buffer decision before implementation.
depends_on: [BS-SRC-04]
---

# D1 Data Model and Retention

## Goals

The D1 schema must support:

```text
30-day public display
31-day internal retention
idempotent candle ingestion
v2.2 detector evidence
incident grouping
Claude brief storage
accepted source links
job status and debugging without exposing internals publicly
```

Do not store raw Claude search HTML or raw model logs in the public data model.

## Retention policy

```text
Public display: last 30 days
Internal retention: 31 days
Cleanup cadence: daily
```

Reason for 31 days: avoid timezone/edge deletion errors while still ensuring storage does not accumulate.

## Conceptual tables

```text
market_candles
market_features
raw_signal_events
incidents
claude_briefs
source_references
job_runs
```

## SQL schema draft

```sql
CREATE TABLE IF NOT EXISTS market_candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL,
  open_time TEXT NOT NULL,
  close_time TEXT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,
  quote_volume REAL NOT NULL,
  trade_count INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, interval, open_time)
);

CREATE INDEX IF NOT EXISTS idx_market_candles_symbol_interval_time
ON market_candles(symbol, interval, open_time);

CREATE TABLE IF NOT EXISTS market_features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL,
  open_time TEXT NOT NULL,
  return_15m_pct REAL NOT NULL,
  price_z REAL NOT NULL,
  volume_ratio_vs_24h_baseline REAL NOT NULL,
  range_ratio_vs_24h_baseline REAL NOT NULL,
  symbol_severity REAL NOT NULL,
  direction TEXT NOT NULL,
  is_elevated INTEGER NOT NULL,
  baseline_bars INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, interval, open_time)
);

CREATE INDEX IF NOT EXISTS idx_market_features_symbol_time
ON market_features(symbol, interval, open_time);

CREATE TABLE IF NOT EXISTS raw_signal_events (
  id TEXT PRIMARY KEY,
  detected_at TEXT NOT NULL,
  scope TEXT NOT NULL,
  direction TEXT NOT NULL,
  symbol_set_json TEXT NOT NULL,
  breadth_count INTEGER NOT NULL,
  avg_elevated_severity REAL NOT NULL,
  max_elevated_severity REAL NOT NULL,
  peak_symbol TEXT,
  auto_confirm_reason TEXT,
  status TEXT NOT NULL,
  suppression_reason TEXT,
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_raw_signal_events_detected_at
ON raw_signal_events(detected_at);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  incident_key TEXT NOT NULL UNIQUE,
  macro_day_cache_key TEXT NOT NULL,
  scope TEXT NOT NULL,
  direction TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  signal_window TEXT NOT NULL DEFAULT '15m',
  baseline_window TEXT NOT NULL DEFAULT '24h',
  headline_severity REAL NOT NULL,
  severity_label TEXT NOT NULL,
  breadth_count INTEGER NOT NULL,
  breadth_label TEXT NOT NULL,
  symbols_json TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  sub_events_json TEXT NOT NULL DEFAULT '[]',
  symbol_evidence_json TEXT NOT NULL,
  status TEXT NOT NULL,
  analysis_priority INTEGER NOT NULL DEFAULT 0,
  analysis_available_after TEXT,
  analysis_attempt_count INTEGER NOT NULL DEFAULT 0,
  analysis_last_attempt_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_incidents_started_at
ON incidents(started_at);

CREATE INDEX IF NOT EXISTS idx_incidents_status_priority
ON incidents(status, analysis_priority, started_at);

CREATE TABLE IF NOT EXISTS claude_briefs (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  analysis_mode TEXT NOT NULL,
  catalyst_status TEXT,
  ui_label TEXT NOT NULL,
  confidence TEXT,
  price_context_check TEXT,
  headline TEXT,
  summary TEXT NOT NULL,
  main_catalyst_json TEXT,
  broader_context_json TEXT NOT NULL DEFAULT '[]',
  caveats_json TEXT NOT NULL DEFAULT '[]',
  source_quality_meta_json TEXT NOT NULL DEFAULT '{}',
  generated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(incident_id, analysis_mode),
  FOREIGN KEY(incident_id) REFERENCES incidents(id)
);

CREATE INDEX IF NOT EXISTS idx_claude_briefs_incident_id
ON claude_briefs(incident_id);

CREATE TABLE IF NOT EXISTS source_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brief_id TEXT NOT NULL,
  publisher TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  published_at TEXT,
  accessed_at TEXT NOT NULL,
  used_for TEXT NOT NULL,
  source_strength TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(brief_id, normalized_url),
  FOREIGN KEY(brief_id) REFERENCES claude_briefs(id)
);

CREATE INDEX IF NOT EXISTS idx_source_references_brief_id
ON source_references(brief_id);

CREATE TABLE IF NOT EXISTS job_runs (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_job_runs_started_at
ON job_runs(started_at);
```

## Retention cleanup SQL

Run daily:

```sql
DELETE FROM market_candles
WHERE open_time < datetime('now', '-31 days');

DELETE FROM market_features
WHERE open_time < datetime('now', '-31 days');

DELETE FROM raw_signal_events
WHERE detected_at < datetime('now', '-31 days');

DELETE FROM source_references
WHERE brief_id IN (
  SELECT id FROM claude_briefs
  WHERE incident_id IN (
    SELECT id FROM incidents
    WHERE started_at < datetime('now', '-31 days')
  )
);

DELETE FROM claude_briefs
WHERE incident_id IN (
  SELECT id FROM incidents
  WHERE started_at < datetime('now', '-31 days')
);

DELETE FROM incidents
WHERE started_at < datetime('now', '-31 days');

DELETE FROM job_runs
WHERE started_at < datetime('now', '-31 days');
```

Implementation note: D1 SQLite behavior should be tested for datetime string compatibility. If needed, use ISO timestamp comparisons instead of `datetime('now', '-31 days')` by passing a cutoff timestamp from the Worker.

## Status enums

Incident status:

```text
detected
suppressed
candidate
queued_for_analysis
analyzing
brief_ready
context_only
none_found
analysis_limited
failed_retryable
failed_final
```

Brief/attempt status can be represented in `claude_briefs` and `incidents.status`.

## Tags

Recommended tags:

```text
same_day_context
relief_rally
oversold_rebound
no_direct_catalyst
two_sided_market_day
price_context_minor_mismatch
```

Tags are displayed as small muted chips only when useful.

## Migration requirements

```text
Use versioned SQL migrations.
Never hand-edit remote D1 schema without migration.
Run local migration before remote migration.
Document migration command in phase report.
```

## Data privacy

```text
No users.
No accounts.
No wallet addresses.
No uploaded files.
No personal data.
No exchange API key data.
```

## Public data exposure

Public endpoints may expose:

```text
market candles for the five symbols
final incident feed
accepted source links
score explanations
Claude summaries
```

Public endpoints must not expose:

```text
Claude API key
raw Claude logs
rejected/low-quality sources
internal budget/quota
raw prompt details
stack traces
```
