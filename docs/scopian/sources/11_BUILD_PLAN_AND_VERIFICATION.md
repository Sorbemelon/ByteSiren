---
project: ByteSiren
source_id: BS-SRC-11
title: Build Plan and Verification
status: frozen_source
version: phase0-source-of-truth-v1
last_updated: 2026-06-16
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Any change to frozen decisions requires a Scopian Scope Buffer decision before implementation.
depends_on: [BS-SRC-10]
---

# Build Plan and Verification

## Build phases

### Phase 0 — Source-of-Truth Pack

Goal:

```text
Add docs/scopian/sources source pack.
Register docs with Scopian.
Initialize repo memory with CrossHelix when repo exists.
```

Deliverables:

```text
all Phase 0 markdown docs
machine-readable JSON helper files
logo assets copied to docs/scopian/sources/assets or app assets
```

Acceptance:

```text
Docs exist in docs/scopian/sources/.
Frozen decisions are explicit.
No implementation yet except documentation/assets.
```

### Phase 1 — Cloudflare foundation

Goal:

```text
Create monorepo and deployable skeleton.
```

Deliverables:

```text
apps/web Next.js static app
apps/worker Cloudflare Worker
apps/web/wrangler.toml
apps/worker/wrangler.toml
D1 binding placeholder
health endpoint
basic local scripts
```

Acceptance:

```text
pnpm install works
web builds
worker type-checks or compiles
/api/health returns ok locally
no detector/UI complexity yet
```

### Phase 2 — Market ingestion and retention

Goal:

```text
Fetch Binance public market data and store 15m candles.
```

Deliverables:

```text
Binance fetch service
D1 market_candles migration
candle upsert by symbol + interval + open_time
/api/market/latest
/api/market/candles
cleanup job
```

Acceptance:

```text
fetch service validates allowed symbols
30-day candles endpoint returns sorted data
31-day cleanup exists
no authenticated Binance API usage
```

### Phase 3 — Signal engine v2.2

Goal:

```text
Implement deterministic detector and incident candidate generation.
```

Deliverables:

```text
feature calculation
symbol elevated rule
severity scoring
market-wide candidate detection
persistence waiver
suppression rules
same-direction merge
market_day grouping
incident storage
/api/intelligence/feed returns evidence without Claude if no brief yet
```

Acceptance:

```text
single-symbol candidates are not public final candidates
mixed same-candle events suppressed
all final candidates preserve symbol evidence
incident creation is idempotent
feed endpoint includes Evidence | Brief | Sources fields
```

### Phase 4 — Claude enrichment

Goal:

```text
Generate source-backed Claude briefs for final candidates.
```

Deliverables:

```text
Claude prompt builder
web search wrapper
brief schema validation
source filtering
accepted source storage
analysis_limited state
queued analysis behavior
source chips data
```

Acceptance:

```text
Claude runs only for eligible market_wide / market_day final candidates
cause/context labels follow gate
rejected sources hidden from public API
limited state uses exact approved copy
no public budget/quota field
```

### Phase 5 — UI implementation

Goal:

```text
Build one-page Variant A terminal UI.
```

Deliverables:

```text
HeaderBar
ChartPanel
ChartSymbolTabs
ChartStatHeader
MarketChart
IntelligenceFeedPanel
FeedRow three-column layout
SourceChipCell clickable links
ExpandedFeedRow
BottomInfoAccordions
responsive behavior
```

Acceptance:

```text
symbol tabs control chart only
feed shows all 30-day incidents newest first
source chips are clickable
duration labels are explicit
bottom glossary exists
no rejected sources visible
no trading advice language
```

### Phase 6 — SEO, polish, deployment smoke

Goal:

```text
Make the app portfolio-ready and deployable.
```

Deliverables:

```text
metadata
OG/Twitter images
sitemap
robots
JSON-LD
favicon/icons
README
final disclaimer check
deployment smoke tests
```

Acceptance:

```text
page title and description correct
OG image exists
sitemap/robots exist
JSON-LD visible content matches claim
health, market, feed endpoints work
public UI loads deployed
```

## Verification checklist

### Scope safety

```text
No login.
No wallet.
No portfolio tracking.
No authenticated exchange API.
No trading/order endpoints.
No buy/sell/hold/long/short labels.
No price targets.
No public Claude budget/quota.
No rejected sources visible.
```

### Detector

```text
Allowed symbols only.
15m candles only for MVP.
24h baseline implemented.
Price floor implemented.
Price + confirmation rule implemented.
Market-wide breadth >= 3.
Mixed same-candle suppressed.
Persistence waiver implemented exactly.
Average severity used for headline.
Same-day market_day grouping implemented.
Single-symbol public candidates suppressed.
```

### Claude

```text
Only eligible final candidates invoke Claude.
Date-bound queries include detected date.
Second search only under approved conditions.
Source filtering implemented in prompt and backend.
Brief JSON validated.
Cause-vs-context UI gate preserved in API response.
Limited message exact.
```

### UI

```text
Variant A layout implemented.
Source chips clickable with target=_blank and rel=noopener noreferrer.
Symbol tabs only in chart panel.
Intelligence Feed not filtered by symbol tabs.
Three-column feed on desktop.
Stacked feed rows on mobile.
Duration labels shown for all percentages.
Glossary explains scores.
Bottom disclaimer present.
Color not sole meaning carrier.
```

### SEO

```text
Title set.
Meta description set.
OG/Twitter images present.
Sitemap present.
Robots present.
JSON-LD present.
Visible crawlable description present.
No meta keywords tag.
No trading-signal SEO positioning.
```

## Suggested local commands

Actual commands may change after repo setup.

```bash
corepack pnpm install
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm --filter @bytesiren/worker dev
corepack pnpm --filter @bytesiren/web dev
corepack pnpm --filter @bytesiren/worker exec wrangler d1 migrations apply bytesiren-placeholder --local
corepack pnpm --filter @bytesiren/worker exec wrangler deploy --dry-run
```

Worker commands run from `apps/worker/wrangler.toml`. Pages commands run from `apps/web/wrangler.toml`.

## Manual smoke tests

```text
Open page desktop.
Open page mobile.
Switch chart tabs; verify feed does not filter.
Click feed row; verify chart marker highlights.
Click source chip; verify source opens in new tab.
Expand row; verify evidence table and caveat display.
Check limited Claude row.
Check no incidents empty state.
Check bottom glossary/disclaimer.
View page source/head for SEO tags.
```

## Review status labels

```text
PASS
PASS_WITH_LIMITS
NEEDS_FIX
BLOCKED
```

Use `PASS_WITH_LIMITS` when a phase works but has known non-blocking limitations.
