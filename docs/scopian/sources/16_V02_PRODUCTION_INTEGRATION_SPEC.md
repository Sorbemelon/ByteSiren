---
project: ByteSiren
source_id: BS-SRC-16
title: v0.2 Production Integration Spec
status: active_source
version: v0.2I2A-signal-audit-write-path-v1
last_updated: 2026-06-21
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Any change to approved v0.2 integration decisions requires user approval before implementation.
depends_on: [BS-SRC-01, BS-SRC-02, BS-SRC-03, BS-SRC-05, BS-SRC-06, BS-SRC-15]
---

# ByteSiren v0.2 Production Integration Spec

## Purpose

This source captures the approved production integration boundary for ByteSiren v0.2. It converts the local v0.2 experiment model into an additive production schema and rollout plan without switching production behavior during v0.2I1.

## Approved v0.2 Model

ByteSiren v0.2 has four feed item concepts:

- `daily_overview`: Claude-backed full UTC-day context. One Daily Overview exists for every UTC day in the visible feed range.
- `market_story`: deterministic broader multi-swing chart and context pattern. It may use Signal Event and Audit Event IDs as internal evidence, but it renders as a standalone section.
- `signal_event`: compact Claude-backed evidence-window anomaly.
- `audit_event`: detected event stored for local/debug/audit review. It is not public as a standalone item unless a future debug route is explicitly approved.

The public feed groups items by UTC day as day posts. Daily Overview appears first. Market Story sections appear after Daily Overview. Signal Event sections appear after Market Story sections. Market Story must not nest Signal Event cards.

## Storage Decisions

v0.2 should use additive v0.2 tables where safer than overloading v0.1 `incidents` rows. v0.1 tables remain available until v0.2 is validated and feature flags switch the runtime path.

Storage decisions:

- Store compact public/internal signal events in `signal_events_v02`.
- Store per-symbol Signal Event evidence in `signal_event_symbols_v02`.
- Store non-public detected events in `audit_events_v02`.
- Store deterministic Market Stories in `market_stories_v02`.
- Store optional normalized Market Story membership in `market_story_members_v02`.
- Store one UTC-day Daily Overview record in `daily_overviews_v02`.
- Store accepted/rejected v0.2 source records in `source_references_v02`.
- Store Signal Event and Daily Overview Claude results in `claude_briefs_v02`.
- Existing `claude_briefs` remains the v0.1/legacy table. The nullable `target_type`, `target_id`, and `prompt_mode` columns added in v0.2I1 are retained for additive compatibility, but they are not the preferred v0.2 write path and should not be used for new v0.2 writes unless explicitly revisited.
- Do not store Claude results directly on Market Story rows.

## Feed Item Types

### Daily Overview

Daily Overview uses Claude and represents full UTC-day context. It may include deterministic day metrics, Signal Event IDs, Market Story IDs, and audit counts as context for Claude. It should use day-level labels, not Signal Event cause labels as the main status.

### Market Story

Market Story is deterministic only. It represents broader chart-pattern context such as range, trend, momentum, volatility expansion, reversal, or mixed movement structure. It is descriptive market intelligence, not a cause claim and not trading advice.

Market Story rows must not include:

- `claude_brief_id`
- `claude_payload`
- `public_context_status`
- `source_status`
- `source_count`
- `brief_status`
- `Focused Cause`
- `Likely Cause`
- `Market Backdrop`
- `No Clear Cause`
- `Claude Limited`

Market Story must not have a `source_references_v02` target.

### Signal Event

Signal Event uses Claude for event-specific public context after deterministic detection passes the public gate. Signal Event display uses `Avg Change` for the collapsed metric and per-symbol `Window Change` and `Range Position` in the evidence table.

Only the first public Signal Event in a canonical merge sequence should queue Claude. Later merged detections update deterministic evidence and display range but must not trigger Claude again.

### Audit Event

Audit Event is stored for review and future debug tooling. Audit Events do not queue Claude as standalone items and do not appear in the public feed unless a future debug route is explicitly approved.

## Claude Responsibility Boundary

Claude-backed item types:

- `signal_event_v02`
- `daily_overview_v02`

Deterministic-only item types:

- `market_story_v02`
- `audit_event_v02`

Claude must not infer cause from chart context alone. If source support is weak or missing, the Claude result should use the existing honest v0.1-style statuses and labels rather than force a cause.

v0.2 Claude persistence uses `claude_briefs_v02` with these target types only:

- `signal_event_v02`
- `daily_overview_v02`

`claude_briefs_v02.prompt_mode` values are:

- `signal_event`
- `daily_overview`

Market Story must not have a `claude_briefs_v02` row.

## Source Reference Versioning

`source_references_v02` is versioned separately from v0.1 `source_references`.

Allowed `source_references_v02.target_type` values:

- `signal_event_v02`
- `daily_overview_v02`

Disallowed target:

- `market_story_v02`

Market Story has no Claude source references. Source markers in the chart may be produced only from Claude-backed Signal Event or Daily Overview source references.

## Planned Feature Flags

Runtime flags are planned for later phases and are not implemented by v0.2I1:

- `DETECTOR_VERSION=v01|v02`
- `FEED_VERSION=v01|v02`
- `ENABLE_DAILY_OVERVIEWS`
- `ENABLE_MARKET_STORIES`
- `ENABLE_SIGNAL_CLAUDE_V02`
- `ENABLE_DAILY_CLAUDE`
- `ENABLE_AUDIT_FEED_LOCAL_ONLY`
- `CLAUDE_DAILY_LIMIT`
- `CLAUDE_CATCHUP_LIMIT`

Rollback behavior should be feature-flag/config based:

- set `FEED_VERSION=v01`
- set `DETECTOR_VERSION=v01`
- disable v0.2 Claude flags
- leave v0.2 tables in D1 for inspection
- do not require destructive DB rollback

## Rollout Phases

- v0.2I1 schema/spec: add additive schema and this source spec only.
- v0.2I2A Signal/Audit detector write path: write v0.2 Signal Event and Audit Event output behind `DETECTOR_VERSION=v02` without changing public feed behavior.
- v0.2I2B Market Story write path: generate deterministic Market Story rows after Signal/Audit writes.
- v0.2I3 feed API v02 contract: support grouped day posts behind a feed version flag.
- v0.2I4 Claude payload / Daily Overview enrichment: add Signal Event and Daily Overview Claude modes.
- v0.2I5 frontend day-post integration: use the v0.1 visual baseline with v0.2 grouping and chart interactions.
- v0.2I6 backfill/catch-up tools: rebuild visible 30-day v0.2 data safely.
- v0.2I7 production smoke: verify ingestion, detector, Claude limits, feed, chart, and rollback.
- v0.2I8 cleanup experiments: untrack local experiment artifacts after production integration is complete.

## Rollback Strategy

v0.2 migrations are additive. v0.1 tables and runtime behavior remain available during rollout. If v0.2 validation fails, switch flags back to v0.1 and leave v0.2 tables in D1 for inspection or later cleanup.

Do not drop v0.1 tables during initial v0.2 integration.

## Non-Goals

v0.2I1 does not:

- replace the production detector
- switch the public feed API
- change frontend production UI
- change the production Claude prompt behavior
- generate Daily Overviews
- generate Market Stories in production
- call Claude
- write remote D1
- deploy
- add futures data
- add trading advice, price targets, or buy/sell/long/short/hold language

v0.2I2A does not:

- change the public feed API
- change frontend UI
- call Claude
- write `claude_briefs_v02`
- write `source_references_v02`
- generate Market Stories
- generate Daily Overviews
- write v0.1 `incidents` from the v0.2 detector path
