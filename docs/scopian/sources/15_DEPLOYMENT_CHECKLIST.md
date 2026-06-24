---
project: ByteSiren
source_id: BS-SRC-15
title: Deployment Checklist
status: frozen_source
version: phase6a-deployment-checklist-v1
last_updated: 2026-06-17
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Any change to frozen decisions requires a Scopian Scope Buffer decision before implementation.
depends_on: [BS-SRC-04, BS-SRC-14]
---

# Deployment Checklist

## Purpose

This checklist prepares ByteSiren for the two-target Cloudflare deployment model:

```text
apps/web     -> Cloudflare Pages static frontend
apps/worker  -> Cloudflare Worker API, Cron, and D1
```

Do not run a production deploy until the project owner explicitly approves it.

## A. Worker and D1 setup

1. Create the Cloudflare D1 database for ByteSiren.
2. Put the D1 `database_id` into `apps/worker/wrangler.toml` or an environment-specific Worker config.
3. Apply remote migrations from the Worker app context:

```bash
cd apps/worker
corepack pnpm exec wrangler d1 migrations apply bytesiren-placeholder --remote
```

Replace `bytesiren-placeholder` with the configured D1 database name when the production database is ready.

4. Set Worker secrets:

```text
ANTHROPIC_API_KEY
MARKET_IMPORT_TOKEN
GITHUB_INGEST_DISPATCH_TOKEN
```

5. Set Worker vars:

```text
CLAUDE_MODEL
CLAUDE_WEB_SEARCH_TOOL_TYPE
CLAUDE_DEFAULT_MAX_USES
CLAUDE_SECOND_SEARCH_MAX_USES
CLAUDE_PUBLIC_DAILY_ANALYSIS_LIMIT
PUBLIC_WEB_ORIGINS
ENABLE_MARKET_IMPORT
MARKET_FETCH_MODE
ENABLE_GITHUB_INGEST_DISPATCH
GITHUB_INGEST_OWNER
GITHUB_INGEST_REPO
GITHUB_INGEST_WORKFLOW
GITHUB_INGEST_REF
GITHUB_INGEST_HOURS
GITHUB_INGEST_SYMBOLS
GITHUB_INGEST_DRY_RUN
CLAUDE_ALLOWED_DOMAINS
CLAUDE_BLOCKED_DOMAINS
```

Keep `CLAUDE_ALLOWED_DOMAINS` blank unless a small curated list is proven accessible. Use either allowed domains or blocked domains, not both. `PUBLIC_WEB_ORIGINS` must include the deployed Pages origin and should not use `*`.

For production market ingestion:

```text
ENABLE_MARKET_IMPORT=true
MARKET_FETCH_MODE=external_import
ENABLE_GITHUB_INGEST_DISPATCH=true
GITHUB_INGEST_OWNER=<GitHub owner>
GITHUB_INGEST_REPO=<repo name>
GITHUB_INGEST_WORKFLOW=market-ingest.yml
GITHUB_INGEST_REF=main
GITHUB_INGEST_HOURS=6
GITHUB_INGEST_SYMBOLS=BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT
GITHUB_INGEST_DRY_RUN=false
```

`MARKET_IMPORT_TOKEN` is a Worker secret and must match the GitHub repository secret used by the ingestion workflow.
`GITHUB_INGEST_DISPATCH_TOKEN` is a Worker secret used only to call the GitHub workflow_dispatch API.
Use a fine-grained GitHub PAT limited to this repository with Actions read/write permission.

6. Deploy the Worker after secrets, vars, and D1 binding are ready.
7. Smoke Worker endpoints:

```text
GET /api/health
GET /api/version
GET /api/market/latest
GET /api/market/candles?symbol=BTCUSDT
GET /api/intelligence/feed
GET /api/metrics/views
POST /api/metrics/views
```

## B. External market ingestion through Cloudflare-controlled GitHub dispatch

Cloudflare Worker egress to Binance may be blocked in production. GitHub native scheduled workflows were also unreliable for this project. The final production ingestion path is:

```text
Cloudflare Cron -> GitHub workflow_dispatch API -> GitHub Actions
GitHub Actions -> Binance public market API -> protected Worker import endpoint -> D1 candle upsert
Worker detector cron -> incident candidates
Worker Claude cron -> public context enrichment
```

Cloudflare does not fetch Binance in production. It only dispatches the GitHub workflow. GitHub Actions fetches Binance and imports candles to the protected Worker endpoint.

The Worker keeps D1, detector, Claude enrichment, and cleanup responsibility. Detector execution is intentionally decoupled from the import request. Initial backfills can upload many chunks, and running detector inside the final import request can exceed practical Worker request limits. The import endpoint should stay focused on validating and storing candles.

1. Add GitHub repository secrets used by the workflow:

```text
BYTESIREN_WORKER_URL
BYTESIREN_MARKET_IMPORT_TOKEN
```

2. Set matching Worker import values:

```text
Worker secret: MARKET_IMPORT_TOKEN
Worker var: ENABLE_MARKET_IMPORT=true
Worker var: MARKET_FETCH_MODE=external_import
```

3. Set Cloudflare Worker GitHub dispatch values:

```text
Worker secret: GITHUB_INGEST_DISPATCH_TOKEN
Worker var: ENABLE_GITHUB_INGEST_DISPATCH=true
Worker var: GITHUB_INGEST_OWNER=<GitHub owner>
Worker var: GITHUB_INGEST_REPO=<repo name>
Worker var: GITHUB_INGEST_WORKFLOW=market-ingest.yml
Worker var: GITHUB_INGEST_REF=main
Worker var: GITHUB_INGEST_HOURS=6
Worker var: GITHUB_INGEST_SYMBOLS=BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT
Worker var: GITHUB_INGEST_DRY_RUN=false
```

The GitHub token should be a fine-grained PAT limited to this repository with Actions read/write permission. Do not put the token in `apps/worker/wrangler.toml`, Pages env, frontend code, or GitHub workflow logs.

4. Run an initial seed from GitHub Actions with:

```text
workflow_dispatch days=31
```

After the seed, wait for the Worker detector cron. If a protected maintenance endpoint exists and is enabled for a controlled diagnostic window, a manual detector trigger can be used instead.

5. Production market imports are controlled by Cloudflare Cron dispatching `workflow_dispatch`:

```text
2,17,32,47 * * * *    Cloudflare Worker dispatches market-ingest.yml
```

The workflow itself should keep `workflow_dispatch` only. It should not rely on GitHub native `schedule:` triggers.

The dispatch uses a rolling lookback window, defaulting to 6 hours, so delayed or missed dispatches can still backfill recent candles.

6. Worker scheduled jobs are staggered after dispatch/import:

```text
2,17,32,47 * * * *    GitHub workflow dispatch
5,20,35,50 * * * *    detector
10,25,40,55 * * * *   Claude enrichment
17 0 * * *            cleanup
```

7. The GitHub Actions importer calls:

```text
POST /api/ingest/candles
```

with the private header:

```text
x-bytesiren-market-token
```

The endpoint is not for frontend use, does not expose public CORS, does not call Claude, and should not be advertised as a public API.

The GitHub Actions importer should not pass `--run-detector-last` in production runs. Use that script flag only for controlled manual debugging.

8. Scheduled update procedure:

```text
Cloudflare Worker dispatches GitHub Actions.
GitHub Actions imports recent candles.
Worker detector cron evaluates stored candles.
Worker Claude cron enriches queued incidents.
```

9. Keep `ENABLE_ADMIN_MAINTENANCE=false` after diagnostics. The scheduled importer uses `MARKET_IMPORT_TOKEN`, not `ADMIN_BACKFILL_TOKEN`.

## C. Pages setup

1. Create a Cloudflare Pages project from the same Git repository.
2. Configure Pages for the monorepo frontend.
3. Use this build command:

```bash
corepack enable && corepack pnpm install --frozen-lockfile && corepack pnpm --filter @bytesiren/web build
```

4. Use this output directory:

```text
apps/web/out
```

5. Set the Pages environment variable:

```text
NEXT_PUBLIC_API_BASE_URL=<deployed Worker API URL>
```

Examples:

```text
https://api.bytesiren.example.com
https://bytesiren-api.<account>.workers.dev
```

6. Deploy Pages only after the Worker API URL is known.
   For manual deployment from the repository, use the Pages deploy command from the web app context:

```bash
cd apps/web
corepack pnpm exec wrangler pages deploy ./out --project-name bytesiren --branch main
```

7. Smoke the frontend:

```text
chart renders or shows an honest delayed state
Intelligence Feed renders
source chips open exact accepted source URLs
view counters show values or an empty fallback
no fake production data appears
no public Claude budget, quota, search count, or token count appears
no raw Claude response or tool trace appears
```

## D. CORS readiness

Worker CORS is controlled by `PUBLIC_WEB_ORIGINS`.

Requirements:

```text
Allow GET and OPTIONS for public read API endpoints.
Allow POST and OPTIONS only for /api/metrics/views.
Do not allow credentials.
Echo Access-Control-Allow-Origin only for configured origins.
Do not use wildcard origins for production.
```

Default local development origins:

```text
http://localhost:3000
http://127.0.0.1:3000
http://localhost:3001
http://127.0.0.1:3001
```

Add the deployed Pages origin to Worker vars before production smoke.

## E. Security checks

Before deploy:

```text
no root wrangler.toml
no root .env.example
apps/worker/.dev.vars ignored and untracked
apps/web/.env.local ignored and untracked
.claude/settings.local.json ignored and untracked if present
ANTHROPIC_API_KEY exists only as a Worker secret
no NEXT_PUBLIC_ANTHROPIC_API_KEY
no Worker secret in Pages config or frontend code
D1 binding exists only in apps/worker/wrangler.toml
rejected sources are not public
raw Claude responses and Web Search traces are not public
market import token is not in frontend code or Pages config
```

## F. D1 migration readiness

Migrations live in:

```text
apps/worker/migrations/
```

Expected migration coverage:

```text
0001 initial schema
0002 market ingestion indexes
0003 detector incidents
0004 Claude brief foundation
0005 Claude analysis usage
0006 public view counts
```

Local check:

```bash
corepack pnpm --filter @bytesiren/worker exec wrangler d1 migrations apply bytesiren-placeholder --local
```

Do not run remote migrations until the production D1 database name and ID have been confirmed.

## G. Post-deploy monitoring

After deployment:

```text
watch Worker logs and D1 job_runs for github_ingest_dispatch
watch GitHub Actions market-ingest workflow_dispatch runs
watch Worker logs for import, detector, enrichment, and cleanup runs
verify public view counter increments
verify D1 row growth remains bounded by 31-day cleanup
verify Claude Limited state appears when the daily analysis limit is reached
verify accepted source links remain exact article/source URLs
```

## H. Local v0.2 smoke before cutover

The public v0.2 cutover completed in Phase C after the local/protected smoke and
remote offline-import rebuild were clean. Keep this section as the local
regression path for future v0.2 changes; run these checks against local D1 and
local Worker only.

1. Configure `apps/worker/.dev.vars` with local-only throwaway values:

```text
ENABLE_MARKET_IMPORT=true
MARKET_IMPORT_TOKEN=<local token>
ENABLE_ADMIN_MAINTENANCE=true
ADMIN_BACKFILL_TOKEN=<local token>
ENABLE_V02_ADMIN_TOOLS=true
DETECTOR_VERSION=v02
ENABLE_MARKET_STORIES=true
ENABLE_DAILY_OVERVIEWS=true
FEED_VERSION=v02
ENABLE_SIGNAL_CLAUDE_V02=false
ENABLE_DAILY_CLAUDE=false
```

2. Apply local migrations:

```bash
corepack pnpm --filter @bytesiren/worker exec wrangler d1 migrations apply bytesiren-db --local
```

3. Start the local Worker:

```bash
corepack pnpm worker:dev
```

4. Run the local v0.2 backfill smoke from the repo root:

```bash
node scripts/v02-local-backfill-smoke.mjs \
  --worker-url http://127.0.0.1:8787 \
  --market-token <local token> \
  --admin-token <local token> \
  --days 31 \
  --expect-v02-feed
```

The smoke report is written to:

```text
.tmp/v02-local-backfill-smoke-report.json
.tmp/v02-local-backfill-smoke-report.md
```

Interpret the report counts by source:

- `apiFeedCounts` are the public `/api/intelligence/feed` item counts and are the source of truth for public feed contents.
- `dbCounts`, when available, are local D1 table counts from `bytesiren-db --local`.
- `renderedUniqueCounts`, in the frontend smoke, count unique rendered day posts and sections by stable `data-v02-*` IDs.
- `rawDomOccurrences`, if present, are diagnostic text/selector occurrences only and must not be treated as feed item counts.

If `daily_overviews_v02` table count differs from the API Daily Overview count, read `dailyOverviewMismatchAnalysis`. A mismatch can be expected when the extra row is the current/incomplete UTC day or outside the visible feed range. A mismatch without that explanation should block production cutover rehearsal until diagnosed.

5. Start the web app against the local Worker:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8787 corepack pnpm --filter @bytesiren/web dev
```

On PowerShell, use:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL='http://127.0.0.1:8787'
corepack pnpm --filter @bytesiren/web dev
```

6. Run the real-API frontend smoke:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8787 corepack pnpm --filter @bytesiren/web smoke:v02-real-api
```

Local screenshots are written under `.tmp/`. The smoke report prints the requested web URL, actual web URL, detected port, and whether the smoke started its own server or attached to an existing server. If it starts a server, it may stop only the process it started. If it attaches to an existing local web server, do not stop that server from the smoke.

7. Run the controlled local v0.2 Claude sample before any remote cutover:

For the protected admin sample path, enable `ENABLE_ADMIN_MAINTENANCE=true`, `ENABLE_V02_ADMIN_TOOLS=true`, and `ENABLE_V02_CLAUDE_SAMPLE_TOOLS=true` only for the sample window. Keep scheduler-visible `ENABLE_SIGNAL_CLAUDE_V02=false` and `ENABLE_DAILY_CLAUDE=false`; the sample endpoint uses `--mode` to choose Signal or Daily.

```bash
node scripts/v02-local-claude-sample.mjs \
  --worker-url http://127.0.0.1:8787 \
  --admin-token <local token> \
  --mode signal \
  --limit 2 \
  --dry-run \
  --expect-v02-feed

node scripts/v02-local-claude-sample.mjs \
  --worker-url http://127.0.0.1:8787 \
  --admin-token <local token> \
  --mode signal \
  --limit 2 \
  --live \
  --expect-v02-feed
```

Run the Daily Overview sample only after reviewing the Signal sample. Use `--mode daily --limit 1`. The script defaults to dry-run; `--live` is explicitly required for a real Claude call. Reports are written to `.tmp/v02-claude-sample-report.json` and `.tmp/v02-claude-sample-report.md`.

The controlled sample must confirm `claude_briefs_v02` and `source_references_v02` writes for Signal/Daily only, no old `claude_briefs` or old `source_references` writes, no Market Story Claude/source rows, exact accepted source URLs, no public raw Claude traces or token/search/budget counts, no scheduled-run collision, and no terminal brief overwrite by a later retry/failure. If sample output is poor, disable `ENABLE_V02_CLAUDE_SAMPLE_TOOLS`, keep scheduled Claude flags false, do not run broader Claude backfill, and leave v0.2 rows for inspection. Roll back public `FEED_VERSION` to `v01` only if the public feed safety checks fail.

The v0.2 real-API smoke should confirm:

- Market Story displays `Avg Change` and `Volatility Score`, not `Swing Change`.
- Daily Overview displays `Top daily mover` and `Widest range`, not `Lead` or standalone `Peak` as day-level labels.
- Cross-day story continuation copy is `Market Story continues`.
- Market Story remains deterministic-only with no Claude status, Public Context status, source chips, or source markers.
- Chart band behavior remains unchanged by the v0.2I6B2 label pass.
- v0.2 queued/not-yet-enriched items display `No context yet`.
- Signal Event Focused/Likely sources are limited to the approved 6-hour catalyst window unless a later article clearly describes an in-window catalyst.
- Signal Event and Daily Overview cards use the collapsed brief as the readable context and do not duplicate expanded Context Details / Context summary or Sources blocks.
- Source chips stay in the main card source row, use `+N` expansion for the full accepted list, and chart source markers are visible for Claude-backed Daily Overview and Signal Event public sources with usable `published_at`. Source markers are not globally de-duplicated by URL, use only the honest article publication timestamp without event/peak/day fallback substitution, and vertically separate same-time markers without shifting the chart time coordinate. Sources without usable publication time may remain as card chips if policy allows them, but do not produce chart markers.

Do not use production tokens for this flow. Do not run live Claude for this smoke.

Optional local reset before another smoke:

```bash
node scripts/v02-local-reset.mjs --confirm-local-reset --dry-run
node scripts/v02-local-reset.mjs --confirm-local-reset
```

The reset script is local-only, refuses `--remote`, and clears only v0.2 tables by default.
It writes reset SQL to a temporary `.sql` file and runs Wrangler with `d1 execute bytesiren-db --local --file <temp-file>` so Windows, PowerShell, and Git Bash do not split multi-line SQL as command arguments.

Do not enable v0.2 production flags until the local smoke report counts and any Daily Overview mismatch analysis are understood.

## I. v0.2 production cutover rehearsal

Before any remote v0.2 migration, production D1 write, production backfill, live v0.2 Claude run, Pages cutover, or public `FEED_VERSION=v02` switch, use `17_V02_PRODUCTION_CUTOVER_REHEARSAL_PLAN.md` as the tracked owner-review checklist.

That plan preserves v0.1 as the rollback path, requires backup/snapshot evidence before remote mutation, keeps Market Story deterministic-only, keeps Audit Events hidden from the public feed, and separates rehearsal/no-public-switch, temporary smoke window, and full cutover modes.

As of Phase C / Phase C1, the public production feed is v0.2 and tracked Worker
configuration should preserve `FEED_VERSION=v02` on deploy. The rollback path is
still `FEED_VERSION=v01`, but future normal deploys must not accidentally revert
the public feed to v0.1. v0.2 scheduled generation and all v0.2 Claude flags
remain disabled until later owner-approved phases.

After the first owner-supervised remote data-build attempt failed before writing v0.2 rows, the protected remote v0.2 pipeline must be run diagnostics-first and chunked:

```bash
# Read-only protected diagnostics after enabling the admin gates for a short window.
curl "$BYTESIREN_WORKER_URL/api/admin/v02/diagnostics" \
  -H "x-bytesiren-admin-token: <redacted-admin-token>"

# Dry-run chunk plan from the repo root.
node scripts/v02-remote-pipeline-smoke.mjs \
  --worker-url "$BYTESIREN_WORKER_URL" \
  --admin-token "<redacted-admin-token>" \
  --date-from YYYY-MM-DD \
  --date-to YYYY-MM-DD \
  --max-days-per-call 1 \
  --remote-rehearsal \
  --dry-run
```

Live remote chunk execution additionally requires:

```text
--live
--confirm-remote-v02-pipeline
```

For owner-approved fresh remote v0.2 rebuilds where downtime/drift control is more important than continuous scheduled writes, temporarily set `ENABLE_SCHEDULED_JOBS=false` before resetting v0.2 tables. This freezes scheduled GitHub ingest dispatch, scheduled market polling, detector cron, cleanup/Daily Overview cron, and Claude enrichment cron while keeping public HTTP reads available. Restore `ENABLE_SCHEDULED_JOBS=true` after the smoke window ends and the intended public feed version (`v02` for normal production, `v01` only for rollback) is verified.

Do not use a full unbounded remote v0.2 detector call as the default production rehearsal path. If Cloudflare `1102` or HTTP `503` repeats, capture `wrangler tail bytesiren-api` or dashboard logs with request path, timestamp, Ray ID if available, the started `job_runs` breadcrumb, last completed chunk, and safe error message. Do not paste tokens or secrets into reports.

If a bounded detector chunk returns HTML/non-JSON, stop the live run and keep the public feed on the current intended version; use `FEED_VERSION=v01` only when rolling back or before a public v0.2 launch. The R2 failure pattern stopped at `2026-06-12` after completing `2026-06-11`; the hardened R2A recovery path is:

```bash
# Local/report-only diagnostic; no remote writes.
node scripts/v02-remote-pipeline-smoke.mjs \
  --dry-run \
  --diagnose-date 2026-06-12 \
  --fallback-hours 12

# Owner-approved live resume from the failed date.
node scripts/v02-remote-pipeline-smoke.mjs \
  --worker-url "$BYTESIREN_WORKER_URL" \
  --admin-token "<redacted-admin-token>" \
  --steps detector \
  --date-from 2026-06-12 \
  --date-to YYYY-MM-DD \
  --max-days-per-call 1 \
  --remote-rehearsal \
  --live \
  --confirm-remote-v02-pipeline \
  --retry-failed-once
```

Only if the resumed day fails again and the owner approves continuing, add `--fallback-hours 12` to split the failed detector day into UTC half-day target windows. If a half-day window itself exceeds Worker limits, use adaptive smaller windows such as `--fallback-hours 6,3,1` so the script can split failed detector windows recursively before stopping. Do not run Market Stories, Daily Overviews, `FEED_VERSION=v02`, or Claude until detector chunks complete and counts are reviewed.

## J. Ongoing v0.2 snapshot refresh

Phase D moves ongoing deterministic v0.2 refresh out of the production Worker. The Worker-side historical detector rebuild exceeded Cloudflare resource limits, so normal refresh uses the offline rebuild/import path:

```bash
# Plan only. Reads remote candle coverage, exports a candle window, rebuilds local
# deterministic v0.2 rows, and prepares v0.2-only import SQL.
node scripts/v02-snapshot-refresh.mjs --dry-run

# Owner-approved manual live refresh. Temporarily freezes scheduled jobs and
# switches the public feed to v01 during reset/import, then restores v02 after
# v02 API smoke passes.
node scripts/v02-snapshot-refresh.mjs \
  --manual-refresh \
  --live \
  --confirm-remote-v02-refresh \
  --rollback-on-fail
```

The refresh imports only deterministic v0.2 tables:

- `signal_events_v02`
- `signal_event_symbols_v02`
- `audit_events_v02`
- `market_stories_v02`
- `market_story_members_v02`
- `daily_overviews_v02`

It must not import `claude_briefs_v02`, `source_references_v02`, legacy Claude/source tables, candles/features, incidents, public view counts, or `job_runs`.

Before every live import, create rollback artifacts under `.tmp/v02-refresh-rollback/<UTC_TIMESTAMP>/`. If rollback export fails, do not import the new snapshot. The simple live-feed safety model is:

1. Export rollback artifacts.
2. Deploy a temporary Worker config with `FEED_VERSION=v01` and `ENABLE_SCHEDULED_JOBS=false`.
3. Reset/import deterministic v0.2 tables only.
4. Deploy the normal tracked Worker config with `FEED_VERSION=v02` and `ENABLE_SCHEDULED_JOBS=true`.
5. Smoke the v02 API and confirm public Audit Events and source count are both zero.

`.github/workflows/v02-snapshot-refresh.yml` is the deterministic v0.2 snapshot refresh workflow. Phase D2 proved the workflow with `workflow_dispatch` run `28066280181` on `main`, then enabled a daily GitHub Actions cron at `30 1 * * *` UTC. Keep `workflow_dispatch` available for owner-supervised refreshes. The workflow requires the GitHub repository secret `CLOUDFLARE_API_TOKEN` and must not add `ANTHROPIC_API_KEY`; Claude remains a separate future phase. It uses a concurrency group so daily and manual refreshes do not overlap.

The v0.1 market-ingest workflow remains Cloudflare-Cron-dispatched and should keep its existing `workflow_dispatch`-only pattern. The v0.2 snapshot refresh cron is separate and may be revisited later if the owner wants Cloudflare Cron to dispatch it too.

## K. Public v0.2 hosted smoke

Phase E stabilizes the hosted v0.2 browser smoke after public cutover. The smoke should prove that the app shell, chart, grouped v0.2 feed, desktop layout, and mobile feed render against the production API. For selected-section behavior, trigger a chart highlight when available and assert the matching feed section is selected and visible inside the feed viewport. Do not require an exact pixel scroll offset. The zero-source public state is intentional while Claude remains disabled: Daily Overview and Signal Event cards may show `No context yet`, Market Story remains deterministic-only, and source chips should not appear when source count is 0.

## L. SEO asset note

Create these later using the ByteSiren full logo:

```text
apps/web/src/app/opengraph-image.png
apps/web/src/app/twitter-image.png
```

This is non-blocking for deployment readiness.
