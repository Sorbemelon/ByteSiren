---
project: ByteSiren
source_id: BS-SRC-16
title: v0.2 Production Integration Spec
status: active_source
version: v0.2I6A-local-backfill-smoke-v1
last_updated: 2026-06-22
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

The v0.2 feed API is exposed when `FEED_VERSION=v02`. Missing, invalid, or `v01` feed versions use the existing v0.1 feed response. v0.2 feed reads are read-only: they do not generate Daily Overview rows, Market Story rows, Claude briefs, or source references.

Phase C made `FEED_VERSION=v02` the live public production read path, backed by imported v0.2 snapshot rows. Phase C1 aligns the tracked Worker production default to `v02` so future deploys do not accidentally revert to v0.1. `FEED_VERSION=v01` remains the explicit rollback path and local legacy-feed fallback.

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

Daily Overview rows are created deterministically before Claude enrichment. Row generation computes `24h Change`, market range, market tone, notable symbols, top symbol moves, same-day publishable Signal Event IDs, same-day publishable Market Story IDs, and same-day Audit Event counts from existing spot 15m candles and v0.2 records. It must not fake Claude summaries or sources.

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

v0.2I4A adds local Worker builders, validators, and repository helpers for v0.2 Claude payload persistence only. It does not call Claude, does not wire cron/enrichment jobs, and does not replace the existing production Claude prompt runtime.

v0.2I4B wires bounded v0.2 Claude enrichment behind explicit flags. v0.2 enrichment may select only `signal_event_v02` and `daily_overview_v02` targets. It must never select Market Story or Audit Event as standalone Claude targets.

Signal Event payloads must include:

- `mode: "signal_event"`
- `target_type: "signal_event_v02"`
- exact evidence window start/end/peak time
- `Avg Change`
- per-symbol `Window Change`, `Peak 15m`, and `Range Position`
- chart-context fields as descriptive evidence
- macro context when present
- source route hints and bounded suggested search queries
- `no_trading_advice: true`

Market Story public display uses `Avg Change` and `Volatility Score`.
Cross-day continuation copy is `Market Story continues`.

Daily Overview payloads must include:

- `mode: "daily_overview"`
- `target_type: "daily_overview_v02"`
- UTC day start/end
- `24h Change`
- `Top daily mover` and `Widest range`
- market tone, range, notable symbols, and top symbol moves
- Signal Event IDs for the day
- deterministic Market Story IDs/context for the day when useful
- audit event count for the day
- `no_trading_advice: true`

Market Story is not a Claude payload mode. Market Story may appear inside a Daily Overview payload only as deterministic context, not as a standalone Claude target.

v0.2 Claude status mapping should remain honest:

- Signal Event `Focused Cause` and `Likely Cause` map to `brief_ready`.
- Signal Event `Market Backdrop` maps to `context_only`.
- Signal Event `No Clear Cause` maps to `no_clear_cause`.
- Daily Overview `No Major Driver` maps to `no_major_driver`.
- Claude search/tool cap failures map to `claude_limited`.
- Missing API key skips v0.2 enrichment safely and must not mark v0.2 items terminal.
- Validation failure uses retryable or terminal failure status and must not fake a brief.
- Public v0.2 queued/not-yet-enriched copy is `No context yet`, not `Waiting for Claude`.
- Terminal v0.2 brief statuses such as `brief_ready`, `context_only`, `no_clear_cause`, `no_major_driver`, `claude_limited`, and `failed_terminal` must not be overwritten by later retry/failure results unless an explicit admin/debug force path is used.

If source policy removes focused/likely cause support, Signal Event results must not remain `Focused Cause` or `Likely Cause`. They should downgrade to `Market Backdrop` when accepted backdrop sources remain, otherwise `No Clear Cause`.

For v0.2 Claude output, `collapsed_summary` is the main readable brief for Signal Event and Daily Overview cards. It should combine source-backed context with the relevant Signal Event window or Daily Overview day detail. Long separate Signal Event `Context Details` or Daily Overview `Context summary` sections are not required and should not be rendered as separate public expanded-card sections.

## Source Reference Versioning

`source_references_v02` is versioned separately from v0.1 `source_references`.

Allowed `source_references_v02.target_type` values:

- `signal_event_v02`
- `daily_overview_v02`

Disallowed target:

- `market_story_v02`

Market Story has no Claude source references. Source markers in the chart may be produced only from Claude-backed Signal Event or Daily Overview source references.

v0.2 source persistence uses `source_references_v02` only. It must reject root/homepage URLs, low-quality source patterns covered by source policy, and any `market_story_v02` target. Accepted article URLs should be preserved exactly for public display.

`source_references_v02.brief_id` was created during the first additive schema pass with a legacy `claude_briefs` reference. New v0.2 source writes should keep that legacy column null and use `brief_v02_id` for optional `claude_briefs_v02` linkage. The canonical public association remains `target_type` plus `target_id`.

## Signal Event Source Timing

Signal Event public source timing is stricter in v0.2:

- catalyst window start = Signal Event evidence window start minus 6 hours
- catalyst window end = Signal Event evidence window end
- `published_at` is the honest article publication timestamp and must not be rewritten to the Signal Event time, catalyst time, chart peak, or day boundary
- `catalyst_time_utc` is the time of the described public catalyst/event and is separate from `published_at`
- public Signal Event sources are allowed only when they are time-relevant to that source window
- `Focused catalyst source` and `Likely cause source` are allowed only when the source describes a catalyst inside that catalyst window
- an article may be published after the Signal Event only if it clearly describes a catalyst inside the allowed catalyst window and supplies an in-window `catalyst_time_utc`
- if `catalyst_time_utc` is unknown, Focused/Likely use is allowed only when the article publication itself is inside the catalyst window and the article describes a catalyst tied to this exact event
- broad older context outside the Signal source window belongs in Daily Overview context, not as a public Signal Event source
- later recaps without an in-window catalyst time should be omitted or rejected for Signal Event public sources
- price-check sources can confirm market data but must not establish Focused/Likely cause

## Source Display and Chart Markers

Frontend source chips live in the main card source row for Claude-backed Daily Overview and Signal Event cards. Compact rows may hide extra chips behind `+N`; expanding the row/card shows the full accepted list in that same main source area. Expanded detail sections should not duplicate a separate Sources block.

Chart source markers are visible for Claude-backed Daily Overview and Signal Event accepted public sources that have a usable `published_at`. Source markers are not globally de-duplicated by URL; if two cards legitimately reference the same article, each source row can produce its own marker. Source markers use the honest `published_at` article publication timestamp and do not substitute event time, chart peak, or day-boundary fallback times. Sources without a usable publication timestamp may still appear as card source chips if policy allows them, but they do not produce chart source markers. Markers that share or nearly share a source time are separated vertically only so overlap handling does not bias the chart time coordinate. Market Story and Audit Event must not produce source markers.

While public v0.2 remains Claude-disabled and `source_references_v02` is empty, Daily Overview and Signal Event cards should present the missing-context state as `No context yet` instead of a broken or loading state. The frontend should not show empty source chips. Market Story remains deterministic-only with no source/status/Claude labels.

The real-API frontend smoke should validate chart-to-feed selection by clicking a chart highlight when available, then asserting the matching feed section is selected and visible inside the feed viewport. It should not depend on an exact scroll offset; visible selected state is the user-facing contract.

## Planned Feature Flags

Runtime flags originally kept v0.1 as the default path until v0.2 was validated. After Phase C, the public production feed default is `FEED_VERSION=v02`; v0.1 remains available as `FEED_VERSION=v01` rollback:

- `DETECTOR_VERSION=v01|v02`
- `FEED_VERSION=v01|v02`
- `ENABLE_DAILY_OVERVIEWS`
- `ENABLE_MARKET_STORIES`
- `ENABLE_SIGNAL_CLAUDE_V02`
- `ENABLE_DAILY_CLAUDE`
- `ENABLE_V02_ADMIN_TOOLS`
- `ENABLE_V02_CLAUDE_SAMPLE_TOOLS`
- `ENABLE_AUDIT_FEED_LOCAL_ONLY`
- `CLAUDE_DAILY_LIMIT`
- `CLAUDE_CATCHUP_LIMIT`

Rollback behavior should be feature-flag/config based:

- set `FEED_VERSION=v01`
- set `DETECTOR_VERSION=v01`
- set `ENABLE_MARKET_STORIES=false`
- disable v0.2 Claude flags
- leave v0.2 tables in D1 for inspection
- do not require destructive DB rollback

`ENABLE_MARKET_STORIES` controls deterministic Market Story generation only after the v0.2 Signal/Audit write path has run. It must default to `false`. It does not expose Market Stories in the public feed until the v0.2 feed API contract is added.

`ENABLE_DAILY_OVERVIEWS` controls deterministic Daily Overview row generation. It must default to `false`. When true, the row-generation job may create or update `daily_overviews_v02` rows for completed UTC days with sufficient candle coverage. It must not call Claude, create Claude briefs, create source references, or generate missing Market Stories or Signal Events.

`FEED_VERSION` controls only the public feed read contract. The production default is `v02` after Phase C/C1. `FEED_VERSION=v02` reads `daily_overviews_v02`, publishable `market_stories_v02`, publishable `signal_events_v02`, `claude_briefs_v02`, and accepted `source_references_v02` for Claude-backed items. It must not expose Audit Events as standalone public feed items. `FEED_VERSION=v01` remains the explicit rollback and local legacy-feed fallback.

`ENABLE_SIGNAL_CLAUDE_V02` controls Signal Event v0.2 Claude enrichment. It must default to `false`.

`ENABLE_DAILY_CLAUDE` controls Daily Overview v0.2 Claude enrichment for existing `daily_overviews_v02` rows. It must default to `false` and must not create missing Daily Overview rows.

`ENABLE_V02_CLAUDE_SAMPLE_TOOLS` controls only protected one-shot v0.2 Claude sample tooling. It must default to `false`. It does not enable scheduled v0.2 Claude enrichment and does not replace `ENABLE_SIGNAL_CLAUDE_V02` or `ENABLE_DAILY_CLAUDE` for cron/catch-up runs.

`CLAUDE_CATCHUP_LIMIT` bounds v0.2 enrichment work per run. The initial safe default is `5`, with an implementation cap of `10` unless explicitly revisited.

When both Signal Event and Daily Overview v0.2 Claude flags are enabled, selection is Signal Events first, then Daily Overviews, newest first within each category, up to `CLAUDE_CATCHUP_LIMIT`.

Scheduled Claude behavior uses Strategy A during integration:

- v0.2 Claude flags false: run the existing v0.1 Claude enrichment path.
- either v0.2 Claude flag true: run v0.2 Claude enrichment only.
- `ENABLE_V02_CLAUDE_SAMPLE_TOOLS=true` alone must not make scheduled v0.2 enrichment run.

This avoids accidental double-spending across v0.1 and v0.2 enrichment paths.

v0.2 Claude job metadata may record safe counts, selected flags, model, tool type, max uses, source counts, and status counts. It must not store API keys, raw Claude tool traces, public token/budget/search counts, or raw hidden responses in public feed data.

Protected broad admin catch-up for v0.2 Claude remains separate from the one-shot sample endpoint and must stay owner-approved.

`ENABLE_V02_ADMIN_TOOLS` controls protected local/admin v0.2 smoke tooling. It must default to `false`. The protected v0.2 pipeline endpoint also requires `ENABLE_ADMIN_MAINTENANCE=true` and a valid `x-bytesiren-admin-token`. It is not a public frontend API, must not expose public CORS, and must not run Claude.

`ENABLE_SCHEDULED_JOBS` controls the Worker `scheduled()` handler only. It must default to `true`. During an owner-approved maintenance/rebuild window it may be set to `false` to freeze scheduled write paths while public HTTP reads remain available. The freeze covers scheduled GitHub ingest dispatch, scheduled Worker market polling, detector cron, cleanup/Daily Overview cron, and Claude enrichment cron. It must be restored to `true` after the rebuild/smoke window unless the owner explicitly extends maintenance.

## Ongoing v0.2 Refresh

After Phase C/C1, public production reads `FEED_VERSION=v02`. Remote Worker historical v0.2 detector rebuilds exceeded Cloudflare resource limits even with small chunks, so the full 31-day deterministic snapshot rebuild/import path is manual recovery/backfill only:

1. Export a bounded remote `market_candles` window for the tracked symbols.
2. Rebuild deterministic v0.2 Signal Events, Audit Events, Market Stories, and Daily Overviews locally/offline.
3. Generate dependency-ordered SQL for deterministic v0.2 tables only.
4. Export current remote deterministic v0.2 rows as rollback artifacts.
5. Temporarily deploy a Worker config with `FEED_VERSION=v01` and `ENABLE_SCHEDULED_JOBS=false`.
6. Reset/import deterministic v0.2 tables only.
7. Restore the tracked production Worker config with `FEED_VERSION=v02` and `ENABLE_SCHEDULED_JOBS=true`.
8. Smoke the v02 API.

The refresh path must keep these tables empty until a separate Claude phase is approved:

- `claude_briefs_v02`
- `source_references_v02`

The refresh path must never touch:

- `market_candles`
- `market_features`
- `incidents`
- old `claude_briefs`
- old `source_references`
- `public_view_counts`
- `job_runs`

The manual snapshot workflow is `.github/workflows/v02-snapshot-refresh.yml`. Phase D2 proved it with `workflow_dispatch` run `28066280181` on `main`, and Phase D3 proved the Worker could dispatch it with run `28068735301`. D5 removes that full snapshot dispatch from the normal cron path:

```text
ENABLE_V02_REFRESH_WORKFLOW_DISPATCH=false
```

Normal production refresh is incremental and Worker-bounded:

1. Cloudflare Cron dispatches the existing market ingest workflow every 15 minutes.
2. The existing Worker detector cron runs v0.1 detector behavior while `DETECTOR_VERSION=v01` remains unchanged.
3. When `ENABLE_V02_INCREMENTAL_REFRESH=true`, the same detector cron also runs a bounded v0.2 incremental refresh.
4. Incremental Signal/Audit detection calls `runDetectorV02` only with explicit recent `timeFrom/timeTo` bounds.
5. Incremental Market Story refresh reads recent/open Signal/Audit rows and upserts only the rolling story window.

Incremental flags:

```text
ENABLE_V02_INCREMENTAL_REFRESH=true after D5 canary
ENABLE_V02_INCREMENTAL_SIGNALS=true
ENABLE_V02_INCREMENTAL_MARKET_STORIES=true
V02_INCREMENTAL_TARGET_WINDOW_HOURS=6
V02_INCREMENTAL_LOOKBACK_HOURS=24
V02_MARKET_STORY_OPEN_TTL_HOURS=24
V02_INCREMENTAL_MAX_SIGNALS_PER_RUN=25
```

The incremental path must not run historical rebuilds, clear all v0.2 tables, write old v0.1 incident/Claude/source tables, call Claude, write `claude_briefs_v02`, write `source_references_v02`, or add source/Claude fields to Market Story. `DETECTOR_VERSION=v01` is not the public feed version; public feed selection is controlled by `FEED_VERSION=v02`.

The Worker dispatch path for future Signal Claude enrichment is only a disabled scaffold in D5. If later enabled by owner-approved Phase G, it may dispatch a bounded GitHub workflow for new `signal_event_v02` IDs only:

```text
ENABLE_V02_SIGNAL_CLAUDE_WORKFLOW_DISPATCH=false
V02_SIGNAL_CLAUDE_WORKFLOW_FILE=v02-claude-enrichment.yml
V02_SIGNAL_CLAUDE_WORKFLOW_REF=main
V02_SIGNAL_CLAUDE_DISPATCH_LIMIT=3
```

The scaffold must never dispatch Market Story or Audit Event targets, must not require `ENABLE_SIGNAL_CLAUDE_V02` or `ENABLE_DAILY_CLAUDE`, and must not run Claude inside the Worker.

The protected local v0.2 pipeline endpoint may run these explicit steps:

- `detector`: runs the v0.2 Signal/Audit detector write path only.
- `market_stories`: runs deterministic Market Story generation only.
- `daily_overviews`: runs deterministic Daily Overview row generation only.

v0.2I7B0 adds remote-safe pipeline diagnostics and bounded execution after a remote rehearsal failure. The protected admin surface includes:

- `GET /api/admin/v02/diagnostics`: read-only candle/table/job/flag diagnostics, protected by `ENABLE_ADMIN_MAINTENANCE=true`, `ENABLE_V02_ADMIN_TOOLS=true`, and `x-bytesiren-admin-token`.
- stale started `job_runs` diagnostics so an interrupted protected pipeline request can be found without mutating rows.
- early `job_runs` breadcrumbs for protected pipeline steps so remote failures leave a safe started/failed trail.
- bounded `POST /api/admin/v02/run-pipeline` mode with `mode: "bounded"`, `date_utc` or `date_from`/`date_to`, `max_days`, `max_symbols`, and `dry_run`.
- one-day or explicitly small date chunks for remote detector and Daily Overview generation.
- `scripts/v02-remote-pipeline-smoke.mjs` for dry-run-first chunk planning and owner-confirmed live remote pipeline execution.

v0.2I7B0-R2A hardens the failed-chunk path:

- normal thrown protected pipeline errors return structured JSON with `step`, `date_from`, `date_to`, optional `time_from`/`time_to`, and safe details.
- Cloudflare/runtime HTML or other non-JSON responses are classified by the remote pipeline script with HTTP status, content type, safe redacted body excerpt, and Ray/error code when visible.
- `--resume-from` / `--start-after` can resume a chunk plan after the last successful date.
- `--retry-failed-once` retries a failed chunk once before stopping.
- `--diagnose-date YYYY-MM-DD` writes a local/report-only failed-date diagnostic.
- `--fallback-hours 12` can split a failed detector day into UTC half-day target windows after an owner-approved live retry.
- `--fallback-hours 6,3,1` can recursively split a failed detector day/window into smaller UTC windows for Worker resource-limit recovery.

Unbounded v0.2 detector execution is no longer the protected admin default. It requires an explicit manual override and should not be used for remote production rehearsal unless the owner separately approves it. Remote rehearsal should use diagnostics first, then detector chunks, then Market Stories, then Daily Overview chunks.

It must not clear data, write remote D1, deploy, call Claude, write legacy v0.1 incident/source/Claude rows, or write Market Story source/Claude rows.

## Deterministic Daily Overview Generation

v0.2I4C adds deterministic row generation for existing `daily_overviews_v02` storage only. It is controlled by `ENABLE_DAILY_OVERVIEWS=false` by default.

Generation rules:

- Generate rows for complete UTC days only by default.
- `day_start` is `YYYY-MM-DDT00:00:00.000Z`.
- `day_end` is `YYYY-MM-DDT23:59:59.999Z`.
- Expected candles per symbol per day is 96 for 15m candles.
- A day needs at least 80% coverage per tracked symbol.
- Incomplete current UTC day and insufficient-coverage days are skipped with safe reasons.
- Initial v0.2 backfill should create deterministic Daily Overview rows before running any Daily Overview Claude enrichment.
- Ongoing production should create the previous completed UTC-day row after the UTC day closes.

Deterministic fields:

- `daily_change_pct`: median tracked-symbol percent change from first open to last close in the UTC day.
- `daily_change_label`: always `24h Change`.
- `market_range_pct`: median tracked-symbol high-low range percent for the UTC day.
- `top_symbol_moves_json`: tracked symbols sorted by absolute daily change.
- `notable_symbols_json`: compact deterministic top-symbol list by change/range.
- `market_tone`: deterministic `risk_on`, `risk_off`, `mixed`, `quiet`, `volatile`, or `relief`; public UI labels use `Risk-on Day`, `Risk-off Day`, `Mixed Day`, `Quiet Day`, `Volatile Day`, and `Relief Day`.
- `signal_event_ids_json`: publishable Signal Event IDs for the same UTC day.
- `market_story_ids_json`: publishable Market Story IDs anchored to the same UTC day.
- `audit_event_count`: count of Audit Events for the same UTC day; Audit Event IDs are not public standalone data.
- `daily_chart_context_summary_json`: deterministic method, coverage, breadth, counts, story labels, tone reasons, and generator metadata.

Daily Overview generation does not:

- call Claude
- write `claude_briefs_v02`
- write `source_references_v02`
- write legacy `claude_briefs`
- write legacy `source_references`
- generate Signal Events
- generate Market Stories
- create fake summaries, fake context, or fake sources

If an existing Daily Overview row has a terminal Claude status, row generation should preserve that status while updating deterministic market fields.

## Rollout Phases

- v0.2I1 schema/spec: add additive schema and this source spec only.
- v0.2I2A Signal/Audit detector write path: write v0.2 Signal Event and Audit Event output behind `DETECTOR_VERSION=v02` without changing public feed behavior.
- v0.2I2B Market Story write path: generate deterministic Market Story rows after Signal/Audit writes when `DETECTOR_VERSION=v02` and `ENABLE_MARKET_STORIES=true`.
- v0.2I3 feed API v02 contract: support read-only grouped day posts behind `FEED_VERSION=v02` while keeping v0.1 as the default feed response.
- v0.2I4A Claude payload persistence foundation: add Signal Event and Daily Overview payload builders, prompt builders, validators, `claude_briefs_v02` helpers, and `source_references_v02` helpers without calling Claude or wiring enrichment.
- v0.2I4B Claude enrichment jobs: wire bounded v0.2 Signal Event and Daily Overview analysis behind explicit feature flags, using `claude_briefs_v02`, `source_references_v02`, and `brief_v02_id`.
- v0.2I4C Daily Overview row generation: create deterministic `daily_overviews_v02` rows from existing candles and v0.2 records behind `ENABLE_DAILY_OVERVIEWS`, without calling Claude or writing source rows.
- v0.2I5A frontend API types/adapters: add v0.2 feed response types and normalized day-post adapter support without switching the active v0.1 UI rendering.
- v0.2I5B frontend day-post rendering: use the v0.1 visual baseline with v0.2 grouping.
- v0.2I5C frontend chart/feed selection: connect v0.2 feed sections to chart highlights, chart highlight clicks back to feed selection, and source chips for Claude-backed items only.
- v0.2I6A local/protected backfill smoke tooling: run local candle import, protected v0.2 detector/story/daily pipeline, v0.2 feed read checks, and frontend real-API smoke against local Worker/D1 without remote writes or live Claude.
- v0.2I6 backfill/catch-up tools: rebuild visible 30-day v0.2 data safely.
- v0.2I7A production cutover rehearsal plan: create the tracked remote rehearsal and execution plan only, preserving v0.1 rollback and avoiding remote writes, deploys, live Claude, and production flag changes.
- v0.2I7B0 remote pipeline hardening: add protected diagnostics, started breadcrumbs, bounded date-range detector/Daily Overview chunks, and remote dry-run smoke tooling after the first remote data-build attempt failed before writing v0.2 rows.
- v0.2I7B1 controlled v0.2 Claude sample: run dry-run-first local/protected Signal Event and Daily Overview Claude samples with small limits, v0.2 tables only, and no Market Story/Audit/legacy Claude writes.
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

v0.2I2B does:

- generate deterministic Market Story rows after v0.2 Signal/Audit writes when explicitly enabled with `ENABLE_MARKET_STORIES=true`
- write `market_stories_v02`
- write `market_story_members_v02`
- keep Market Story rollback as `ENABLE_MARKET_STORIES=false` and/or `DETECTOR_VERSION=v01`
- leave Market Story rows in D1 for inspection after rollback

v0.2I2B does not:

- change the public feed API
- change frontend UI
- call Claude
- write `claude_briefs_v02`
- write `source_references_v02`
- generate Daily Overviews
- write source references
- add Claude status, Claude payload, Claude source tags, or public cause labels to Market Story

v0.2I3 originally did:

- add `FEED_VERSION=v01|v02` feed contract selection with `v01` as the pre-cutover default
- return grouped UTC day posts when `FEED_VERSION=v02`
- include Daily Overview first, then publishable Market Story sections, then publishable Signal Event sections
- read actual `claude_briefs_v02` and accepted `source_references_v02` rows for Signal Event and Daily Overview items only
- keep Market Story as a standalone deterministic item with no Claude/source fields

v0.2I3 does not:

- change frontend UI
- call Claude
- write any v0.2 feed, Claude, source, detector, or Daily Overview data
- generate missing Daily Overview rows
- generate Market Story rows
- expose Audit Events in the public feed
- add Claude status, source chips, source references, or cause labels to Market Story
- change v0.1 feed behavior when `FEED_VERSION` is missing, invalid, or `v01`

v0.2I4A does:

- build Signal Event Claude payloads from `signal_events_v02` and `signal_event_symbols_v02`
- build Daily Overview Claude payloads from `daily_overviews_v02` plus deterministic Signal Event and Market Story context for the same day
- provide prompt builders for the future Signal Event and Daily Overview Claude modes
- validate fixture Claude results for v0.2 output labels and source tag rules
- write fixture/test v0.2 Claude results to `claude_briefs_v02`
- write fixture/test v0.2 source references to `source_references_v02`
- keep Market Story excluded from Claude payloads, Claude results, and source references

v0.2I4A does not:

- call Claude
- add live Anthropic or Web Search calls
- wire cron or enrichment jobs
- change the current production Claude prompt behavior
- generate Daily Overview rows
- generate Market Story rows
- write old `claude_briefs` or old `source_references` for v0.2 targets
- change frontend UI
- change v0.1 feed behavior when `FEED_VERSION` is missing, invalid, or `v01`

v0.2I4B does:

- add default-off v0.2 Claude flags: `ENABLE_SIGNAL_CLAUDE_V02`, `ENABLE_DAILY_CLAUDE`, and bounded `CLAUDE_CATCHUP_LIMIT`
- select publishable Signal Events only when `ENABLE_SIGNAL_CLAUDE_V02=true`
- select existing Daily Overview rows only when `ENABLE_DAILY_CLAUDE=true`
- prioritize Signal Events, then Daily Overviews, newest first within each class
- persist successful/limited/failed v0.2 results in `claude_briefs_v02`
- persist accepted/rejected v0.2 source rows in `source_references_v02`
- keep legacy `source_references_v02.brief_id` null for new v0.2 writes and use `brief_v02_id` for the v0.2 brief link
- record safe `job_runs` metadata for `claude_enrichment_v02`
- route the existing Claude cron to v0.2 enrichment only when a v0.2 Claude flag is enabled

v0.2I4B does not:

- enrich Market Stories
- enrich Audit Events as standalone targets
- generate Daily Overview rows
- generate Market Story rows
- call Claude in tests
- write old `claude_briefs` or old `source_references` for v0.2 targets
- expose raw Claude tool traces, token counts, budget counts, or public search counts
- add a protected admin catch-up endpoint
- change frontend UI
- change v0.1 feed behavior when `FEED_VERSION` is missing, invalid, or `v01`
- change v0.1 Claude enrichment behavior when v0.2 Claude flags are false

v0.2I4C does:

- add default-off `ENABLE_DAILY_OVERVIEWS`
- generate deterministic Daily Overview rows for complete UTC days with sufficient candle coverage
- compute `24h Change`, market range, market tone, notable symbols, top symbol moves, and deterministic chart-context summary fields
- link same-day publishable Signal Event IDs and publishable Market Story IDs
- count same-day Audit Events without exposing Audit Events as standalone public items
- set new/retryable Daily Overview rows to `queued_for_analysis`
- preserve terminal Daily Overview Claude status on existing rows
- optionally run after daily cleanup only when `ENABLE_DAILY_OVERVIEWS=true`

v0.2I4C does not:

- call Claude
- write `claude_briefs_v02`
- write `source_references_v02`
- write old `claude_briefs`
- write old `source_references`
- generate Signal Events
- generate Market Stories
- change frontend UI
- change v0.1 feed behavior when `FEED_VERSION` is missing, invalid, or `v01`
- change v0.1 runtime behavior when `ENABLE_DAILY_OVERVIEWS` is absent or false

v0.2I5A does:

- add frontend TypeScript types for the `FEED_VERSION=v02` grouped day-post response
- add a normalized v0.2 day-post adapter model for future UI work
- preserve the current v0.1 feed item adapter and active `fetchFeed` rendering path
- expose a safe feed envelope helper so future UI code can branch on `v02`
- strip or ignore accidental Claude/source fields from normalized Market Story sections

v0.2I5A does not:

- change Worker/backend behavior
- change the active production feed rendering
- implement day-post UI
- implement Daily Overview, Market Story, or Signal Event v0.2 section components
- implement chart selection or source markers
- invent Daily Overview summaries or sources
- allow Market Story Claude status, Claude labels, or sources in the normalized frontend model

v0.2I5B does:

- branch the frontend feed rendering on the normalized feed envelope version
- keep the existing v0.1 `IntelligenceFeed` rendering path active for `v01`
- render `v02` grouped UTC day posts using the v0.1 visual baseline
- render Daily Overview first, Market Story sections second, and Signal Event sections last inside each day post
- support the feed-level `Collapse days` / `Expand days` control
- support per-day `+N events · Collapse post` / `+N events · Expand post` controls
- support section-level `Show more` / `Hide` controls independent from day-post collapse state
- render Daily Overview `24h Change`, `Top daily mover`, and `Widest range`; render Signal Event `Avg Change` and Signal Event per-symbol `Window Change`, `Peak 15m`, `Volume ×`, and `Range Position`
- render Lead mover and strongest `Peak 15m` as table highlights, not headline metrics
- render Market Story `Avg Change` and `Volatility Score`
- render accepted source chips only for Claude-backed Daily Overview and Signal Event sections
- keep Market Story deterministic-only in the frontend with no Claude status, source chips, source labels, or nested Signal Event cards

v0.2I5B does not:

- change Worker/backend behavior
- change the v0.1 feed rendering path
- implement chart/feed selection or chart highlight behavior
- expose Audit Events as public feed sections
- invent Daily Overview summaries or sources
- allow Market Story Claude status, Claude labels, or sources in rendered UI

v0.2I5C does:

- keep the v0.1 feed and chart path supported while adding v0.2-only selection state
- let clicking a v0.2 Signal Event select or deselect its event-window chart highlight
- let clicking a v0.2 Market Story select or deselect its story-window chart highlight
- let clicking a v0.2 Daily Overview select or deselect its full UTC-day chart highlight
- keep Daily Overview full-day chart highlights hidden until selected
- let chart highlight clicks select the matching v0.2 feed section where the chart library supports practical hit testing
- expand and scroll the matching day post when chart selection targets a hidden section
- clear v0.2 selection on repeated selected-item clicks, Escape, neutral chart background clicks, and practical neutral feed-space clicks
- render accepted source chips only for Claude-backed Daily Overview and Signal Event sections
- preserve exact source URLs and avoid rejected-source details in the public UI
- keep Market Story deterministic-only, source-free, and Claude-status-free in both feed rendering and chart markers

v0.2I5C does not:

- change Worker/backend behavior
- change the v0.1 feed rendering path
- change the public API contract
- expose Audit Events as public feed sections
- invent Daily Overview summaries or sources
- add source chips, Claude status, or public cause labels to Market Story
- call Claude, write remote D1, or deploy

v0.2I6A does:

- add default-off `ENABLE_V02_ADMIN_TOOLS`
- add a protected v0.2 pipeline endpoint for local/admin smoke only
- let local smoke explicitly run v0.2 Signal/Audit detection, deterministic Market Story generation, and deterministic Daily Overview row generation
- add local-only reset tooling for v0.2 tables guarded by `--confirm-local-reset`
- add a local backfill smoke orchestrator that can import candles to a local Worker, run the protected v0.2 pipeline, fetch `/api/market/latest`, and validate `FEED_VERSION=v02`
- add a frontend real-API smoke that renders the v0.2 day-post UI against a real local Worker API and saves local screenshots

v0.2I6B1 hardens the local smoke tooling:

- the reset script remains local-only, refuses any `--remote` usage, requires `--confirm-local-reset`, writes SQL to a temporary `.sql` file, and invokes Wrangler with `d1 execute bytesiren-db --local --file <temp-file>` for Windows-safe execution
- the backfill smoke report separates public API feed counts, local D1 table counts when available, Market Story boundary checks, public Audit Event checks, and Daily Overview mismatch analysis
- the frontend real-API smoke counts unique rendered v0.2 day posts and feed sections by stable `data-v02-*` attributes; raw DOM occurrence counts are diagnostics only
- the frontend real-API smoke reports requested web URL, actual web URL, detected port, and whether it used an existing server or started its own server
- Daily Overview table/feed count mismatches must be explained as current/incomplete-day visibility, outside visible feed range, or an issue needing review before production cutover rehearsal

v0.2I6B2 aligns real-smoke UI labels:

- Market Story displays `Avg Change` and `Volatility Score`, not `Swing Change`
- Daily Overview displays `Top daily mover` and `Widest range` as day-level labels
- cross-day Market Story continuation copy is `Market Story continues`
- chart band opacity, density, ordering, and selection behavior remain unchanged in this label pass

v0.2I7A adds `17_V02_PRODUCTION_CUTOVER_REHEARSAL_PLAN.md` as the tracked source for production rehearsal and future owner-approved execution. It documents backup/snapshot strategy, remote migration order, v0.2 data refresh, controlled v0.2 Claude sampling, frontend cutover, rollback, go/no-go criteria, monitoring, risks, and open questions. The phase does not execute remote D1 writes, deploys, live Claude calls, production flag changes, or data clearing.

v0.2I7B1 adds local/protected v0.2 Claude sample tooling:

- `/api/admin/v02/run-claude-sample` is protected by `ENABLE_ADMIN_MAINTENANCE=true`, `ENABLE_V02_ADMIN_TOOLS=true`, `ENABLE_V02_CLAUDE_SAMPLE_TOOLS=true`, and `x-bytesiren-admin-token`
- `scripts/v02-local-claude-sample.mjs` defaults to dry-run and requires `--live` for a real Claude call
- Signal sample should run first with `--mode signal --limit 2`
- Daily Overview sample should run second with `--mode daily --limit 1`
- admin samples use request `mode` plus the sample gate and should keep scheduler-visible `ENABLE_SIGNAL_CLAUDE_V02` and `ENABLE_DAILY_CLAUDE` false unless the owner is intentionally running scheduled/catch-up enrichment
- Market Story and Audit Event are never selected
- v0.2 writes go only to `claude_briefs_v02` and `source_references_v02`
- old `claude_briefs` and old `source_references` remain v0.1/legacy and must not be written by the v0.2 sample
- reports are written to `.tmp/v02-claude-sample-report.json` and `.tmp/v02-claude-sample-report.md`
- if sample output is poor, disable `ENABLE_V02_CLAUDE_SAMPLE_TOOLS`, keep scheduled Claude flags false, do not broaden Claude backfill, and leave rows for inspection; roll back public `FEED_VERSION` to `v01` only if public feed safety is affected

v0.2I7B1A hardens the sample path after a remote Signal sample collision:

- protected admin samples bypass scheduled flags only inside the admin sample endpoint
- scheduled enrichment still obeys only `ENABLE_SIGNAL_CLAUDE_V02` and `ENABLE_DAILY_CLAUDE`
- `processing` and terminal v0.2 brief rows are not selected for another run
- later `failed_retryable` or `claude_limited` results cannot overwrite terminal v0.2 brief statuses without an explicit force path
- the overwritten remote sample row should be recovered only by owner-approved force rerun, alternate target sampling, or manual inspection

v0.2I7B2 refines v0.2 Claude context and source display after the controlled sample:

- v0.2 queued public copy is `No context yet`
- Signal Event Focused/Likely source timing uses the 6-hour catalyst window rule above
- Signal Event and Daily Overview prompts treat `collapsed_summary` as the main public brief
- separate expanded `Context Details` / `Context summary` blocks are removed from the v0.2 feed UI
- source chips stay in the main card source row, with `+N` expansion for the full accepted source list
- chart source markers are visible for Claude-backed Daily Overview and Signal Event public sources with usable `published_at`, are not globally de-duplicated by URL, use only honest article publication time without fallback substitution, are vertically separated when times overlap without shifting chart time, and are never shown for Market Story

v0.2I6A does not:

- deploy
- write remote D1
- call live Claude
- clear remote data
- enable v0.2 production defaults
- change detector thresholds
- change the production Claude prompt
- expose Audit Events in the public feed
- write Market Story Claude/source fields
- expose secrets or real tokens in tracked files
