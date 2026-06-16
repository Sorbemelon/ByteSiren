---
project: ByteSiren
source_id: BS-SRC-13
title: Implementation Prompt Templates
status: frozen_source
version: phase0-source-of-truth-v1
last_updated: 2026-06-16
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Any change to frozen decisions requires a Scopian Scope Buffer decision before implementation.
depends_on: [BS-SRC-10, BS-SRC-11]
---

# Implementation Prompt Templates

## General rules for all prompts

Every build prompt should say:

```text
Read docs/scopian/sources first.
Do not change frozen decisions.
Implement only the named phase.
Return changed files, commands run, verification, known limits, and next phase.
```

## Codex Phase 1 prompt — Cloudflare foundation

```text
You are Codex working on ByteSiren Phase 1 — Cloudflare foundation.

Read docs/scopian/sources first:
- 01_PRODUCT_SPEC.md
- 04_CLOUDFLARE_ARCHITECTURE_AND_API.md
- 10_AGENT_ROLES_AND_BUILD_WORKFLOW.md
- 11_BUILD_PLAN_AND_VERIFICATION.md

Implement Phase 1 only:
- monorepo skeleton
- apps/web Next.js static app placeholder
- apps/worker Cloudflare Worker TypeScript skeleton
- apps/web/wrangler.toml
- apps/worker/wrangler.toml
- health endpoint
- package scripts
- D1 binding placeholder, no real detector yet

Do not implement detector, Claude enrichment, or polished UI yet.
Do not add login, wallet, trading endpoints, or extra pages.

Return:
- Status
- Changed files
- Commands run
- What passed
- Known limits
- Next recommended phase
```

## Codex Phase 2 prompt — Market ingestion

```text
You are Codex working on ByteSiren Phase 2 — Market ingestion and retention.

Read docs/scopian/sources first:
- 02_SIGNAL_ENGINE_V2_2.md
- 04_CLOUDFLARE_ARCHITECTURE_AND_API.md
- 05_DATA_MODEL_D1_RETENTION.md

Implement Phase 2 only:
- D1 migration for market_candles and job_runs
- Binance public kline fetch service for the five approved symbols only
- idempotent candle upsert
- /api/market/latest
- /api/market/candles?symbol=...
- daily cleanup job for 31-day retention

Do not implement detector or Claude enrichment yet.
Do not use authenticated Binance APIs.

Return phase report.
```

## Codex Phase 3 prompt — Signal engine

```text
You are Codex working on ByteSiren Phase 3 — v2.2 signal engine.

Read docs/scopian/sources first:
- 02_SIGNAL_ENGINE_V2_2.md
- 05_DATA_MODEL_D1_RETENTION.md
- bytesiren_v2_2_rules.json
- api_contracts.json

Implement the deterministic v2.2 detector exactly:
- feature calculation
- price_z, volume ratio, range ratio
- price floor + confirmation rule
- symbol severity scoring
- market-wide candidate rule
- persistence waiver
- suppression rules
- same-direction merge
- market_day grouping
- incident storage
- /api/intelligence/feed returns evidence even before Claude brief

Do not call Claude yet.
Do not expose single-symbol public candidates.
Return phase report.
```

## Codex Phase 4 prompt — Claude enrichment

```text
You are Codex working on ByteSiren Phase 4 — Claude enrichment.

Read docs/scopian/sources first:
- 03_CLAUDE_ENRICHMENT_POLICY.md
- 12_CLAUDE_PRODUCTION_PROMPT.md
- claude_brief_schema.json
- source_policy.json
- 09_SAFETY_DISCLAIMER_COPY.md

Implement:
- Claude prompt builder
- Web Search call wrapper
- brief JSON validation
- source filtering
- accepted source storage
- analysis_limited state
- queued analysis behavior
- date-matched retrospective search support

Do not show public Claude budget/quota.
Do not expose rejected sources publicly.
Do not change detector logic.
Return phase report.
```

## Claude Code Phase 5 prompt — UI

```text
You are Claude Code working on ByteSiren Phase 5 — UI implementation only.
Use the Impeccable frontend skill.

Read docs/scopian/sources first:
- 06_UI_UX_VARIANT_A_SPEC.md
- 07_VISUAL_THEME_AND_BRAND.md
- 08_SEO_SPEC.md
- 09_SAFETY_DISCLAIMER_COPY.md
- api_contracts.json
- ui_labels.json

Implement the approved Variant A Terminal Split Layout:
- HeaderBar
- ChartPanel with symbol tabs only inside chart panel
- ChartStatHeader with explicit 15m/24h labels
- TradingView Lightweight Charts integration
- IntelligenceFeedPanel
- FeedRow with Evidence | Claude Brief | Sources columns
- clickable source chips
- inline expanded row
- BottomInfoAccordions
- responsive mobile stacked layout
- accessible labels and focus states

Do not change backend API contracts.
Do not change detector rules.
Do not expose rejected sources.
Do not add extra pages.
Return phase report and screenshots/visual notes if available.
```

## Claude Code Phase 6 prompt — SEO and polish

```text
You are Claude Code working on ByteSiren Phase 6 — SEO and UI polish.
Use the Impeccable frontend skill.

Read docs/scopian/sources:
- 08_SEO_SPEC.md
- 07_VISUAL_THEME_AND_BRAND.md
- 09_SAFETY_DISCLAIMER_COPY.md

Implement:
- Next.js metadata
- Open Graph / Twitter image setup
- sitemap.ts
- robots.ts
- JSON-LD
- favicon/icon usage
- visible SEO-readable copy
- final responsive spacing polish
- accessibility improvements

Do not change product scope or backend logic.
Return phase report.
```

## Review prompt template

```text
Review the current ByteSiren phase output against docs/scopian/sources.
Check for:
- scope drift
- trading advice language
- detector rule changes
- hidden rejected source leakage
- public Claude budget leakage
- API contract mismatch
- UI contract mismatch
- missing verification

Return PASS, PASS_WITH_LIMITS, NEEDS_FIX, or BLOCKED.
```
