---
project: ByteSiren
source_id: BS-SRC-00
title: ByteSiren Phase 0 Source Index
status: frozen_source
version: phase4d-source-of-truth-sync-v1
last_updated: 2026-06-16
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Any change to frozen decisions requires a Scopian Scope Buffer decision before implementation.
depends_on: []
---

# ByteSiren Phase 0 Source-of-Truth Pack

This folder is the canonical Scopian source set for **ByteSiren**. These files should be placed in:

```text
docs/scopian/sources/
```

ByteSiren is a one-page, read-only AI crypto market intelligence dashboard. It monitors Binance public market data for five major USDT pairs, detects market-wide anomalies, and uses Claude Web Search to produce cited public context.

## How agents should use this pack

1. Read this index first.
2. Read `01_PRODUCT_SPEC.md` before any implementation.
3. Backend/Codex work must follow `02_SIGNAL_ENGINE_V2_2.md`, `03_CLAUDE_ENRICHMENT_POLICY.md`, `04_CLOUDFLARE_ARCHITECTURE_AND_API.md`, and `05_DATA_MODEL_D1_RETENTION.md`.
4. UI/Claude Code work must follow `06_UI_UX_VARIANT_A_SPEC.md`, `07_VISUAL_THEME_AND_BRAND.md`, `08_SEO_SPEC.md`, and `09_SAFETY_DISCLAIMER_COPY.md`.
5. Agent workflow must follow `10_AGENT_ROLES_AND_BUILD_WORKFLOW.md` and `11_BUILD_PLAN_AND_VERIFICATION.md`.
6. Machine-readable contracts live in `*.json` files and should be treated as implementation helpers, not separate product authority.

## Canonical documents

| File | Purpose | Primary owner |
|---|---|---|
| `01_PRODUCT_SPEC.md` | Product identity, scope, locked decisions, goals, non-goals | All agents |
| `02_SIGNAL_ENGINE_V2_2.md` | Detector math, thresholds, grouping, suppression, incident rules | Codex/backend |
| `03_CLAUDE_ENRICHMENT_POLICY.md` | Claude Web Search, source quality, cause/context schema, limited states | Codex/backend |
| `04_CLOUDFLARE_ARCHITECTURE_AND_API.md` | Cloudflare architecture, routes, cron jobs, endpoint contracts | Codex/backend |
| `05_DATA_MODEL_D1_RETENTION.md` | D1 schema, retention, indexes, migration notes | Codex/backend |
| `06_UI_UX_VARIANT_A_SPEC.md` | Selected Terminal Split UI, component behavior, responsive rules | Claude Code/UI |
| `07_VISUAL_THEME_AND_BRAND.md` | Logo, dark terminal theme, orange brand accent tokens | Claude Code/UI |
| `08_SEO_SPEC.md` | Metadata, structured data, sitemap, robots, SEO copy | Claude Code/UI + Codex config |
| `09_SAFETY_DISCLAIMER_COPY.md` | Exact public copy and forbidden language | All agents |
| `10_AGENT_ROLES_AND_BUILD_WORKFLOW.md` | Codex/Claude/CrossHelix/Scopian/Impeccable roles | All agents |
| `11_BUILD_PLAN_AND_VERIFICATION.md` | Phase plan, acceptance criteria, verification checklist | All agents |
| `12_CLAUDE_PRODUCTION_PROMPT.md` | Production Claude Web Search prompt and output rules | Codex/backend |
| `13_IMPLEMENTATION_PROMPT_TEMPLATES.md` | Ready-to-copy prompts for Codex and Claude Code phases | Project owner |
| `14_DEPLOYMENT_BOUNDARIES.md` | Cloudflare Pages vs Worker deployment split and env ownership | Codex/backend |
| `15_DEPLOYMENT_CHECKLIST.md` | Cloudflare Worker, D1, Pages, CORS, env, and smoke checklist | Codex/backend |

## Machine-readable helper files

| File | Purpose |
|---|---|
| `bytesiren_v2_2_rules.json` | Detector thresholds, symbol list, grouping, retention, Claude gating |
| `api_contracts.json` | Public API response contracts and feed item shape |
| `claude_brief_schema.json` | Strict Claude brief JSON structure |
| `ui_labels.json` | User-facing label dictionary and color role mapping |
| `source_policy.json` | Allowed/down-ranked source rules and UI source behavior |

## Frozen decisions summary

```text
Project name: ByteSiren
Product type: one-page read-only AI crypto market intelligence dashboard
Stack: Cloudflare Pages + Workers + Cron Triggers + D1
Frontend: Next.js static export + TypeScript + Tailwind + shadcn/ui + TradingView Lightweight Charts
Backend: Cloudflare Workers TypeScript
AI: Claude API + Claude Web Search
Market data: Binance public market-data-only REST API
Symbols: BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, XRPUSDT
Visible history: 30 days
Internal retention: 31 days
Detector baseline: v2.2
UI layout: Variant A — Terminal Split Layout
No login, no wallet, no trading/account API, no trade execution, no financial advice
```

## Approved PoC / validation baseline

The approved detector baseline is **ByteSiren v2.2**. The validation report classified it as `good_enough_for_public_mvp`, with these critical conclusions:

```text
Final candidates after grouping: 13
Scope split: 11 market_wide, 2 market_day, 0 single_symbol
Cause-supported / cause-likely outputs: 9/13
Context-only outputs: 4/13
Old noise patterns: not returned
May 28 event: recovered
Public framing: market intelligence, not trading signal
```

Implementation should not reopen the detector logic unless a new Scopian decision explicitly approves it.

## Phase 4C live Claude smoke baseline

The backend intelligence pipeline through Phase 4C is live-smoke validated for the MVP backend path:

```text
Local Worker can process one queued market incident through Claude Web Search.
Accepted source URLs are persisted and exposed through GET /api/intelligence/feed.
Rejected sources, raw Claude responses, tool traces, and analysis usage counts remain hidden from the public feed.
Claude credentials stay Worker-only.
```

The next implementation focus is frontend preparation and the Variant A UI build. The frontend should consume `/api/intelligence/feed` as the primary Intelligence Feed source and render only accepted source URLs returned by the API.

## External reference URLs verified during planning

These references are included so implementation agents know which official docs informed the source pack:

```text
Binance Market Data Only:
https://developers.binance.com/docs/binance-spot-api-docs/faqs/market_data_only

Binance Spot REST Market Data Endpoints:
https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints

Cloudflare Workers Cron Triggers:
https://developers.cloudflare.com/workers/configuration/cron-triggers/

Cloudflare scheduled() handler:
https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/

Cloudflare D1 Worker API:
https://developers.cloudflare.com/d1/worker-api/

Claude Web Search tool:
https://docs.anthropic.com/en/docs/build-with-claude/tool-use/web-search-tool

Next.js metadata and OG images:
https://nextjs.org/docs/app/getting-started/metadata-and-og-images

Next.js sitemap:
https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap

Next.js robots:
https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots

Google SEO Starter Guide:
https://developers.google.com/search/docs/fundamentals/seo-starter-guide
```
