---
project: ByteSiren
source_id: BS-SRC-17
title: ByteSiren v0.2 Production Cutover Rehearsal Plan
status: active_source
version: v0.2I7A-production-cutover-rehearsal-plan-v1
last_updated: 2026-06-23
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Production cutover execution, remote D1 writes, deploys, live Claude calls, production flag changes, and destructive data operations require explicit owner approval.
depends_on:
  - BS-SRC-04
  - BS-SRC-14
  - BS-SRC-15
  - BS-SRC-16
---

# ByteSiren v0.2 Production Cutover Rehearsal Plan

## 1. Purpose

This plan is for production cutover rehearsal and later owner-approved execution of ByteSiren v0.2.

It does not execute remote mutations. The v0.2I7A phase must not apply remote D1 migrations, write remote D1 data, deploy Worker or Pages, call live Claude, clear production data, change production flags, or merge branches.

This plan is based on the successful local v0.2 end-to-end smoke. v0.1 remains the hosted production default until the owner explicitly approves a cutover execution phase.

## 2. Current Local v0.2 Evidence

Latest local v0.2 smoke evidence:

- Import: success.
- Pipeline: success.
- Feed: success.
- Days requested: 31.
- Symbols: `BTCUSDT`, `ETHUSDT`, `BNBUSDT`, `SOLUSDT`, `XRPUSDT`.
- API feed day groups: 29.
- API public items: 67.
- Daily Overviews in API feed: 29.
- Market Stories in API feed: 12.
- Signal Events in API feed: 26.
- Public Audit Events: 0.
- Market Story forbidden Claude/source fields: 0.

Local D1 v0.2 table counts:

- `signal_events_v02`: 28.
- `audit_events_v02`: 33.
- `market_stories_v02`: 15.
- `daily_overviews_v02`: 30.
- `claude_briefs_v02`: 0.
- `source_references_v02`: 0.

The Daily Overview count mismatch was expected:

- Table count: 30.
- Feed count: 29.
- Date outside visible feed range: `2026-05-24`.

Frontend local real-API smoke status:

- Local Worker served `FEED_VERSION=v02`.
- Local web rendered v0.2 day posts against real local v0.2 API rows.
- Chart/feed rendering passed the real-smoke contract.

Known local limits:

- v0.2 live Claude enrichment has not been exercised.
- Remote D1 has not been tested with the v0.2 path.
- Production flags have not been changed.
- No live Claude was called.
- No remote D1 writes were run.
- No deploy was run.

## 3. Production Cutover Goals

The production cutover should achieve:

- Production D1 has the additive v0.2 schema.
- Production has 30 visible days of candle data available.
- v0.2 Signal Event and Audit Event rows are generated.
- v0.2 Market Stories are generated deterministically.
- v0.2 Daily Overview rows are generated for completed UTC days.
- A controlled v0.2 Claude enrichment run is completed for Signal Events and Daily Overviews.
- `FEED_VERSION=v02` produces the grouped day-post feed.
- Cloudflare Pages renders the v0.2 day-post frontend against the production Worker.
- Market Stories remain deterministic-only and source-free.
- Audit Events remain hidden from the public feed.
- Rollback to v0.1 remains possible through feature flags and deployment rollback.

## 4. Non-goals

This cutover does not include:

- Trading advice.
- Futures data.
- Market Story Claude enrichment.
- Audit Event public feed exposure.
- Destructive database rollback.
- Enabling v0.2 without smoke checks.
- Remote reset without backup and explicit owner confirmation.
- Dropping v0.1 tables or making v0.1 unavailable before v0.2 is validated.

## 5. Required Production Secrets and Vars

Required Worker secrets:

- `ANTHROPIC_API_KEY`
- `MARKET_IMPORT_TOKEN`
- `GITHUB_INGEST_DISPATCH_TOKEN`
- `ADMIN_BACKFILL_TOKEN` if protected backfill/admin tools are used

Required GitHub repository secrets:

- `BYTESIREN_WORKER_URL`
- `BYTESIREN_MARKET_IMPORT_TOKEN`

Worker vars for safe production default:

```text
DETECTOR_VERSION=v01
FEED_VERSION=v01
ENABLE_MARKET_STORIES=false
ENABLE_DAILY_OVERVIEWS=false
ENABLE_SIGNAL_CLAUDE_V02=false
ENABLE_DAILY_CLAUDE=false
ENABLE_V02_ADMIN_TOOLS=false
ENABLE_ADMIN_MAINTENANCE=false
```

Worker vars for temporary cutover rehearsal:

```text
DETECTOR_VERSION=v02
ENABLE_MARKET_STORIES=true
ENABLE_DAILY_OVERVIEWS=true
FEED_VERSION=v02 only after v0.2 data is ready
ENABLE_SIGNAL_CLAUDE_V02=true only during controlled Claude enrichment
ENABLE_DAILY_CLAUDE=true only during controlled Claude enrichment
ENABLE_V02_ADMIN_TOOLS=true only during protected rehearsal
ENABLE_ADMIN_MAINTENANCE=true only during protected admin actions
```

Real secrets must never be committed. `.dev.vars` and `.env.local` remain local-only. Production flag changes should be recorded manually with timestamp, operator, reason, and rollback value.

## 6. Remote Backup / Snapshot Strategy

Before any remote v0.2 work, create a production checkpoint.

Preferred backup:

- Try Cloudflare D1 export if account permissions and current Wrangler support it.
- Store the export outside the repository or in a secure ignored location.
- Record the exact command, timestamp, output file, and operator.

Fallback backup:

- If D1 export fails, create in-D1 backup tables only with explicit owner approval, or capture read-only row-count snapshots.
- Keep v0.1 tables available for rollback.
- Keep `public_view_counts` unless the owner explicitly wants reset.

Record row counts before cutover:

- `market_candles`
- `market_features`
- `raw_signal_events`
- `incidents`
- `claude_briefs`
- `source_references`
- `claude_analysis_usage`
- `job_runs`
- `signal_events_v02`
- `signal_event_symbols_v02`
- `audit_events_v02`
- `market_stories_v02`
- `market_story_members_v02`
- `daily_overviews_v02`
- `claude_briefs_v02`
- `source_references_v02`
- `public_view_counts`

Planned manual examples, not executed in v0.2I7A:

```bash
# PLANNED MANUAL ONLY. Verify exact Wrangler syntax before running.
corepack pnpm --filter @bytesiren/worker exec wrangler d1 export bytesiren-db --remote --output .tmp/bytesiren-db-production-before-v02.sql

# PLANNED MANUAL ONLY. Read-only count snapshot.
corepack pnpm --filter @bytesiren/worker exec wrangler d1 execute bytesiren-db --remote --command "SELECT 'incidents' AS table_name, COUNT(*) AS row_count FROM incidents;"
```

Do not run remote reset. Do not delete v0.1 tables. Do not clear production data without a separate owner-approved destructive-data plan.

## 7. Remote Migration Plan

Remote migration sequence:

1. Confirm the local branch and commit to rehearse.
2. Confirm the worktree is clean.
3. Run local migrations.
4. Run Worker dry-run.
5. Complete remote backup/checkpoint.
6. Apply remote migrations to `bytesiren-db`.
7. Verify v0.2 tables exist.
8. Verify `claude_briefs_v02` exists.
9. Verify `market_stories_v02` has no Claude fields.
10. Verify `source_references_v02` target rules from migration DDL. If a live constraint write test is desired, get explicit owner approval first.

Planned manual examples, not executed in v0.2I7A:

```bash
# Local preflight.
corepack pnpm --filter @bytesiren/worker exec wrangler d1 migrations apply bytesiren-db --local
corepack pnpm --filter @bytesiren/worker exec wrangler deploy --dry-run

# Remote migration after backup and owner approval.
corepack pnpm --filter @bytesiren/worker exec wrangler d1 migrations apply bytesiren-db --remote

# Remote schema inspection after migration.
corepack pnpm --filter @bytesiren/worker exec wrangler d1 execute bytesiren-db --remote --command "PRAGMA table_info(market_stories_v02);"
corepack pnpm --filter @bytesiren/worker exec wrangler d1 execute bytesiren-db --remote --command "PRAGMA table_info(claude_briefs_v02);"
```

Schema checks:

- `signal_events_v02` exists.
- `signal_event_symbols_v02` exists.
- `audit_events_v02` exists.
- `market_stories_v02` exists.
- `market_story_members_v02` exists.
- `daily_overviews_v02` exists.
- `claude_briefs_v02` exists.
- `source_references_v02` exists.
- `source_references_v02` does not permit `market_story_v02`.
- `market_stories_v02` does not include `claude_brief_id`, `claude_payload`, `public_context_status`, `brief_status`, or source fields.

## 8. Production v0.2 Data Refresh Plan

Build production v0.2 data without destroying v0.1 data.

Recommended sequence:

1. Keep existing `market_candles` unless the owner explicitly approves a refresh.
2. If candle refresh is needed, use the GitHub workflow or protected import path for 31 days and five symbols.
3. Run protected v0.2 pipeline:
   - detector
   - market_stories
   - daily_overviews
4. Verify v0.2 table counts.
5. Verify the v0.2 feed with `FEED_VERSION=v02` only after data exists.
6. Keep v0.1 data in place.

Planned GitHub workflow approach:

```text
Workflow: .github/workflows/market-ingest.yml
Inputs:
  days: 31
  symbols: BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT
  dry_run: false only after owner approval
```

Planned protected admin pipeline call:

```bash
# PLANNED MANUAL ONLY. Requires ENABLE_ADMIN_MAINTENANCE=true,
# ENABLE_V02_ADMIN_TOOLS=true, and a valid admin token.
curl -X POST "$BYTESIREN_WORKER_URL/api/admin/v02/run-pipeline" \
  -H "content-type: application/json" \
  -H "x-bytesiren-admin-token: <redacted-admin-token>" \
  --data '{"steps":["detector","market_stories","daily_overviews"],"include_fixture_claude":false}'
```

Verify counts after pipeline:

- `signal_events_v02`
- `signal_event_symbols_v02`
- `audit_events_v02`
- `market_stories_v02`
- `market_story_members_v02`
- `daily_overviews_v02`
- public Audit Event count in feed is 0
- Market Story forbidden Claude/source field count is 0

Do not plan remote destructive reset as the default. If a remote v0.2-only reset becomes necessary, it requires a separate owner-confirmed procedure and a backup checkpoint.

## 9. Controlled v0.2 Claude Rehearsal Plan

Local smoke ended with:

- `claude_briefs_v02 = 0`
- `source_references_v02 = 0`

Therefore live v0.2 Claude should be rehearsed in a controlled sample before broad public cutover.

Recommended first sample:

1. Keep `FEED_VERSION=v01` if public users should not see v0.2 yet.
2. Set `CLAUDE_CATCHUP_LIMIT=2` to `5`.
3. Enable one Claude target class at a time.
4. Start with Signal Event or Daily Overview based on owner decision.
5. Run one scheduled/admin enrichment pass.
6. Disable the Claude flag after the sample if no immediate second pass is planned.

Signal-first sample:

```text
ENABLE_SIGNAL_CLAUDE_V02=true
ENABLE_DAILY_CLAUDE=false
CLAUDE_CATCHUP_LIMIT=2
```

Daily-first sample:

```text
ENABLE_SIGNAL_CLAUDE_V02=false
ENABLE_DAILY_CLAUDE=true
CLAUDE_CATCHUP_LIMIT=2
```

v0.2I7B1 local controlled-sample tooling:

```bash
# Dry-run Signal sample against local Worker.
node scripts/v02-local-claude-sample.mjs \
  --worker-url http://127.0.0.1:8787 \
  --admin-token "<local-admin-token>" \
  --mode signal \
  --limit 2 \
  --dry-run \
  --expect-v02-feed

# Live Signal sample. This is the only form that may call Claude.
node scripts/v02-local-claude-sample.mjs \
  --worker-url http://127.0.0.1:8787 \
  --admin-token "<local-admin-token>" \
  --mode signal \
  --limit 2 \
  --live \
  --expect-v02-feed

# Dry-run Daily sample after reviewing Signal output.
node scripts/v02-local-claude-sample.mjs \
  --worker-url http://127.0.0.1:8787 \
  --admin-token "<local-admin-token>" \
  --mode daily \
  --limit 1 \
  --dry-run \
  --expect-v02-feed

# Live Daily sample only after the Signal sample is acceptable.
node scripts/v02-local-claude-sample.mjs \
  --worker-url http://127.0.0.1:8787 \
  --admin-token "<local-admin-token>" \
  --mode daily \
  --limit 1 \
  --live \
  --expect-v02-feed
```

The local sample script writes:

- `.tmp/v02-claude-sample-report.json`
- `.tmp/v02-claude-sample-report.md`

The script defaults to dry-run and requires `--live` for any real Claude call. It must not print the admin token or `ANTHROPIC_API_KEY`. The protected Worker endpoint behind the script is `/api/admin/v02/run-claude-sample`, gated by `ENABLE_ADMIN_MAINTENANCE=true`, `ENABLE_V02_ADMIN_TOOLS=true`, and `x-bytesiren-admin-token`.

Verify after sample:

- `claude_briefs_v02` rows are created.
- `source_references_v02` rows are created.
- Source URLs are exact article URLs.
- Rejected/root sources are excluded from public accepted-source reads.
- Signal Event and Daily Overview can show sources if accepted rows exist.
- Market Story still has no sources, source markers, Claude status, Claude result, or Public Context status.
- No raw Claude traces are public.
- No public budget/search/token counts are public.
- Old `claude_briefs` and old `source_references` counts do not increase.
- `source_references_v02.brief_v02_id` links sources to the v0.2 brief.

If the sample is good, optionally run a Daily Overview sample, then a bounded catch-up. Full 30-day Claude catch-up should happen only after sample source quality is accepted.

Rollback if Claude output is poor:

- Set `ENABLE_SIGNAL_CLAUDE_V02=false`.
- Set `ENABLE_DAILY_CLAUDE=false`.
- Keep or restore `FEED_VERSION=v01`.
- Leave `claude_briefs_v02` and `source_references_v02` rows for inspection unless the owner approves cleanup.

## 10. Frontend Cutover Plan

Pages/frontend cutover should happen only after the backend v0.2 feed passes.

Preconditions:

- v0.2 backend API can return `version: "v02"` with non-empty `day_groups`.
- Market Story forbidden Claude/source fields count is 0.
- Public Audit Events count is 0.
- Daily Overview and Signal Event source behavior is accepted.
- `NEXT_PUBLIC_API_BASE_URL` points to the correct Worker.
- Worker `PUBLIC_WEB_ORIGINS` includes the Pages origin.

Frontend deployment steps:

1. Merge/deploy v0.2 frontend code only after backend smoke is acceptable.
2. Confirm Pages build environment uses the correct API base URL.
3. Rebuild Pages after env changes.
4. Verify v0.1 behavior with `FEED_VERSION=v01`.
5. Verify v0.2 behavior with `FEED_VERSION=v02`.

Public web smoke checks:

- Chart renders.
- Day posts render.
- Daily Overview renders.
- Market Story renders.
- Signal Event renders.
- Source chips open exact source URLs.
- Market Story has no sources/status/Claude fields.
- Mobile layout works.
- No raw Claude traces are visible.
- No token/budget/search counts are visible.

## 11. Cutover Execution Modes

### Mode A - Rehearsal / no public switch

- Remote v0.2 tables are populated.
- `FEED_VERSION` remains `v01`.
- v0.2 API is checked through a controlled environment, temporary Worker setting, or local override.
- Public users still see v0.1.

Use this mode for remote schema, data refresh, and Claude sample validation before public switch.

### Mode B - Temporary v0.2 smoke window

- Set `FEED_VERSION=v02` for a short manual smoke window.
- Monitor API and frontend behavior.
- Revert `FEED_VERSION=v01` immediately if any issue appears.
- Keep admin and Claude flags disabled unless actively running a protected step.

Use this mode for final production-real UI/API validation.

### Mode C - Full v0.2 cutover

- `FEED_VERSION=v02`
- `DETECTOR_VERSION=v02`
- `ENABLE_MARKET_STORIES=true`
- `ENABLE_DAILY_OVERVIEWS=true`
- v0.2 Claude flags set according to final policy.
- Scheduled jobs monitored after switch.

Use this mode only after Mode A and Mode B pass or the owner explicitly accepts the remaining risk.

## 12. Rollback Plan

Feature-flag rollback:

```text
FEED_VERSION=v01
DETECTOR_VERSION=v01
ENABLE_MARKET_STORIES=false
ENABLE_DAILY_OVERVIEWS=false
ENABLE_SIGNAL_CLAUDE_V02=false
ENABLE_DAILY_CLAUDE=false
ENABLE_V02_ADMIN_TOOLS=false
ENABLE_ADMIN_MAINTENANCE=false
```

Expected rollback behavior:

- v0.1 public feed resumes.
- v0.1 detector/enrichment path resumes.
- v0.2 tables remain for inspection.
- No destructive schema rollback is needed.

Deployment rollback:

- If frontend breaks, roll back Cloudflare Pages to the previous deployment.
- If Worker API breaks, roll back Worker to the previous deployment.
- If branch state is wrong, return to the last known-good main/v0.1 commit.

Data rollback:

- Do not drop v0.2 tables during initial rollback.
- Do not delete v0.1 tables.
- Use pre-cutover backup/snapshot only if an owner-approved restore is needed.

## 13. Exact Rehearsal Checklist

- [ ] Confirm branch and commit.
- [ ] Confirm worktree is clean.
- [ ] Confirm no production cutover action is being run accidentally.
- [ ] Confirm remote backup or snapshot plan.
- [ ] Capture pre-cutover remote row counts.
- [ ] Run local migrations.
- [ ] Run Worker dry-run deploy.
- [ ] Apply remote migrations after owner approval.
- [ ] Verify remote v0.2 schema.
- [ ] Verify `market_stories_v02` has no Claude fields.
- [ ] Verify `source_references_v02` cannot target Market Story from schema evidence or owner-approved constraint test.
- [ ] Set temporary admin flags only for protected actions.
- [ ] Run remote candle refresh/import if needed.
- [ ] Run protected v0.2 pipeline.
- [ ] Verify v0.2 table counts.
- [ ] Verify `FEED_VERSION=v02` response in a controlled smoke.
- [ ] Verify public Audit Event count is 0.
- [ ] Verify Market Story forbidden Claude/source field count is 0.
- [ ] Run controlled v0.2 Claude sample.
- [ ] Verify v0.2 brief/source rows.
- [ ] Verify exact accepted source URLs.
- [ ] Verify rejected/root sources are not public.
- [ ] Run frontend smoke.
- [ ] Run mobile smoke.
- [ ] Decide go/no-go.
- [ ] Restore admin flags after protected work.
- [ ] Record final production flag values.
- [ ] Document results and screenshots.

## 14. Go / No-Go Criteria

Go criteria:

- Remote migration succeeds.
- v0.2 table counts are reasonable for 30 visible days.
- `FEED_VERSION=v02` returns non-empty `day_groups` when rows exist.
- Public Audit Event count is 0.
- Market Story forbidden source/Claude field count is 0.
- Frontend v0.2 smoke passes.
- Mobile smoke passes.
- Source chips preserve exact accepted source URLs.
- No raw Claude traces are public.
- No public token/budget/search counts are public.
- No real secrets are present in the repository.
- Rollback by feature flags is validated or at least explicitly rehearsed as a manual step.

No-go criteria:

- Market Story shows Claude/source/status fields.
- Audit Events appear in the public feed.
- `FEED_VERSION=v02` breaks the frontend.
- v0.2 API returns empty feed when rows exist.
- Claude source quality is poor or misleading.
- Source URLs are generic roots/homepages instead of exact article URLs.
- Rollback path is not verified or is unclear.
- Remote migration has unresolved errors.
- Any accidental remote data clearing occurs.
- Any secret exposure is detected.

## 15. Post-Cutover Monitoring

Monitor after cutover:

- `GET /api/health`
- `GET /api/version`
- `GET /api/market/latest`
- `GET /api/market/candles`
- `GET /api/intelligence/feed`
- `GET /api/metrics/views`
- latest `job_runs` rows
- latest GitHub ingest dispatch run
- latest v0.2 detector run
- latest Market Story job run
- latest Daily Overview job run
- latest `claude_enrichment_v02` job run
- latest candle timestamp advances
- frontend visual smoke
- mobile visual smoke
- source URL quality sample
- Market Story no-source/no-Claude boundary
- Audit Events hidden from public feed

## 16. Risk Register

| Risk | Mitigation |
|---|---|
| Cloudflare env flags mis-set | Record before/after flag values; change one mode at a time; keep rollback flag set ready. |
| GitHub workflow dispatch failure | Keep protected import/admin path available; verify GitHub secrets before import. |
| Binance or GitHub fetch issue | Run import with smaller symbol/day scope first; retry after confirming upstream availability. |
| D1 migration issue | Backup first; run local migration and dry-run deploy; stop on first remote migration error. |
| v0.2 feed empty because of Daily Overview filter/range | Compare table counts to API feed dates; use mismatch diagnosis rules from local smoke. |
| Claude `max_uses_exceeded` | Map to `claude_limited`; keep catch-up limit small; disable Claude flags until quota is clear. |
| Poor Claude source quality | Run sample first; verify exact URLs; disable Claude flags if source quality is not acceptable. |
| Market Story duplicate or continuation confusion | Verify story counts and continuation wording; keep Market Story deterministic and source-free. |
| Frontend static env issue | Confirm `NEXT_PUBLIC_API_BASE_URL`; rebuild Pages after env change; test deployed Pages. |
| CORS origin mismatch | Confirm Worker `PUBLIC_WEB_ORIGINS` contains the Pages origin before public smoke. |
| Local/prod mismatch | Compare local smoke report with remote table/feed counts; run remote smoke before public switch. |
| Admin tools left enabled | Restore `ENABLE_ADMIN_MAINTENANCE=false` and `ENABLE_V02_ADMIN_TOOLS=false` after protected work. |
| Accidental token exposure | Run secret scan; keep tokens in Cloudflare/GitHub secrets only; do not paste tokens into reports. |

## 17. Open Questions

- Should the first live v0.2 Claude sample run Signal Event enrichment or Daily Overview enrichment first?
- Should full 30-day Claude catch-up run before public cutover, after public cutover, or in bounded batches over several runs?
- How long should v0.1 data be kept after v0.2 proves stable?
- How long should v0.2 admin tools remain enabled during rehearsal windows?
- Should a production debug route for audit-only events be added later, and who should be able to access it?
- Should a remote v0.2-only reset ever be allowed, or should production rehearsal always append/update v0.2 rows after backup?

## 18. Recommended Next Phase

Recommended next phase:

```text
v0.2I7B1 - Controlled v0.2 Claude sample before remote public cutover
```

Reason:

- The local v0.2 chain passed without live Claude.
- `claude_briefs_v02` and `source_references_v02` are still unproven with live v0.2 enrichment.
- A small controlled sample reduces source-quality and status-mapping risk before a broader remote cutover rehearsal.

Alternative:

```text
v0.2I7B - Execute production cutover rehearsal with remote D1 under owner supervision
```

Use this if the owner wants the next phase to include remote migrations/import/pipeline rehearsal first, with Claude still bounded and owner-approved.
