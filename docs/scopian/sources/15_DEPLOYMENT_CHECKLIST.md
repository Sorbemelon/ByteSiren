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
CLAUDE_ALLOWED_DOMAINS
CLAUDE_BLOCKED_DOMAINS
```

Keep `CLAUDE_ALLOWED_DOMAINS` blank unless a small curated list is proven accessible. Use either allowed domains or blocked domains, not both. `PUBLIC_WEB_ORIGINS` must include the deployed Pages origin and should not use `*`.

For production market ingestion:

```text
ENABLE_MARKET_IMPORT=true
MARKET_FETCH_MODE=external_import
```

`MARKET_IMPORT_TOKEN` is a Worker secret and must match the GitHub repository secret used by the ingestion workflow.

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

## B. External market ingestion through GitHub Actions

Cloudflare Worker egress to Binance may be blocked in production. The production ingestion path is:

```text
GitHub Actions -> Binance public market API -> protected Worker import endpoint -> D1 candle upsert
Worker detector cron -> incident candidates
Worker Claude cron -> public context enrichment
```

The Worker keeps D1, detector, Claude enrichment, and cleanup responsibility. It should not depend on fetching Binance directly in production.

Detector execution is intentionally decoupled from the import request. Initial backfills can upload many chunks, and running detector inside the final import request can exceed practical Worker request limits. The import endpoint should stay focused on validating and storing candles.

1. Add GitHub repository secrets:

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

3. Run an initial seed from GitHub Actions with:

```text
workflow_dispatch days=31
```

After the seed, wait for the Worker detector cron. If a protected maintenance endpoint exists and is enabled for a controlled diagnostic window, a manual detector trigger can be used instead.

4. Scheduled market imports run through GitHub Actions:

```text
2,17,32,47 * * * *
```

The workflow fetches a rolling lookback window, defaulting to 6 hours, because GitHub scheduled runs can be delayed or dropped.

5. Worker scheduled jobs are staggered after import:

```text
5,20,35,50 * * * *    detector
10,25,40,55 * * * *   Claude enrichment
17 0 * * *            cleanup
```

6. The scheduled importer calls:

```text
POST /api/ingest/candles
```

with the private header:

```text
x-bytesiren-market-token
```

The endpoint is not for frontend use, does not expose public CORS, does not call Claude, and should not be advertised as a public API.

The GitHub Actions importer should not pass `--run-detector-last` in scheduled production runs. Use that script flag only for controlled manual debugging.

7. Scheduled update procedure:

```text
GitHub Actions imports recent candles.
Worker detector cron evaluates stored candles.
Worker Claude cron enriches queued incidents.
```

8. Keep `ENABLE_ADMIN_MAINTENANCE=false` after diagnostics. The scheduled importer uses `MARKET_IMPORT_TOKEN`, not `ADMIN_BACKFILL_TOKEN`.

## C. Pages setup

1. Create a Cloudflare Pages project from the same Git repository.
2. Configure Pages for the monorepo frontend.
3. Use this build command:

```bash
corepack pnpm install --frozen-lockfile && corepack pnpm --filter @bytesiren/web build
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
watch GitHub Actions market-ingest runs
watch Worker logs for import, detector, enrichment, and cleanup runs
verify public view counter increments
verify D1 row growth remains bounded by 31-day cleanup
verify Claude Limited state appears when the daily analysis limit is reached
verify accepted source links remain exact article/source URLs
```

## H. SEO asset note

Create these later using the ByteSiren full logo:

```text
apps/web/src/app/opengraph-image.png
apps/web/src/app/twitter-image.png
```

This is non-blocking for deployment readiness.
