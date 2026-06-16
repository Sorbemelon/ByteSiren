---
project: ByteSiren
source_id: BS-SRC-03
title: Claude Enrichment and Source Policy
status: frozen_source
version: phase0-source-of-truth-v1
last_updated: 2026-06-16
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Any change to frozen decisions requires a Scopian Scope Buffer decision before implementation.
depends_on: [BS-SRC-02]
---

# Claude Enrichment and Source Policy

## Purpose

Claude is used only after ByteSiren’s deterministic detector has created a final incident candidate. Claude’s role is to search for current or date-matched public context and produce a structured, cited brief.

Claude must not create trading advice, predictions, price targets, or recommendations.

## When to call Claude

Call Claude only for final candidates with scope:

```text
market_wide
market_day
```

Do not call Claude for:

```text
single_symbol raw events in MVP
mixed-direction same-candle events
suppressed records
duplicate events inside an open incident
normal/notable market states
```

## Search count policy

Default:

```text
1 Claude Web Search per final incident candidate
```

Allow a second search only when:

```text
first result is none_found
first result is context_only without focused cause
first result returns only rejected/forecast/SEO sources
candidate severity is 100 and breadth is 5
candidate scope is two_sided market_day
```

Do not show search counts or budget values in the public UI.

## Cache policy

Use cache keys to avoid repeated searches:

```text
incident_cache_key
macro_day_cache_key
```

Recommended keys:

```text
incident_cache_key = incident_key
macro_day_cache_key = UTC date + scope + direction/two_sided + symbol group
```

Reuse existing Claude analysis when:

```text
same incident/day already enriched
new detection is within same merged incident
prior result is cause_supported/cause_likely/context_only and still matches the event
```

Re-run or second-search when:

```text
severity tier increases materially
direction flips into market_day
the first result has only rejected sources
the first result is none_found or weak context_only
```

## Claude limited behavior

If Claude is unavailable because of free public project limits:

```text
Store the incident.
Show the Evidence column normally.
Show a blurred Claude Brief column.
Show Sources as “—”.
Do not show numeric budget/quota/status.
```

Exact public message:

```text
Claude analysis is limited in this free public project.
The context will be shown when analysis is available.
```

Queue priority after limits reset:

```text
1. Newest qualifying detection first.
2. Then older unanalyzed detections, newest to oldest.
3. Always use exact detected date/time in the search query.
4. Keep visible unanalyzed detections until normal 30/31-day retention removes them.
```

No `expired_without_analysis` state for MVP. If an event is still visible in the 30-day feed, it can still be analyzed using date-matched retrospective search.

## Analysis modes

```text
live_context
  used when Claude runs shortly after detection

date_matched_retrospective
  used when Claude analyzes an older visible event later
```

Both modes must use event-specific date-bound queries.

## Cause vs context labels

Claude must return exactly one catalyst status:

```text
cause_supported
cause_likely
context_only
none_found
```

The app may also have operational brief statuses:

```text
analysis_limited
queued_for_analysis
analyzing
failed_retryable
failed_final
```

## Catalyst status definitions

```text
cause_supported:
A reputable or primary source directly connects a dated public event to crypto market movement, liquidations, volatility, ETF flows, geopolitical risk, regulatory action, macro data, institutional flows, exchange/project incident, or similar catalyst.

cause_likely:
Sources strongly support a plausible event-specific explanation, but exact causation is not proven. Use cautious wording.

context_only:
Sources provide useful market backdrop but do not directly explain the exact detected move. UI must show “Market Backdrop,” not “Focused Cause.”

none_found:
No reliable public explanation was found. UI must show “No Clear Cause.”
```

## UI gate

```text
Focused Cause appears only for cause_supported.
Likely Cause appears only for cause_likely.
Market Backdrop appears only for context_only.
No Clear Cause appears only for none_found.
Claude Limited appears only for analysis_limited.
```

Detector severity must not override this gate.

## Required Claude output schema

Claude should return JSON matching `claude_brief_schema.json`.

Minimum fields:

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-06-16T00:00:00Z",
  "incident_id": "string",
  "analysis_mode": "live_context",
  "catalyst_status": "cause_supported",
  "ui_label": "Focused Cause",
  "headline": "string",
  "brief_summary": "1-2 line summary",
  "confidence": "high",
  "price_context_check": "matches_binance",
  "main_catalyst": null,
  "broader_context": [],
  "caveats": [],
  "source_links": []
}
```

## Event-focused search requirement

Claude is not looking for generic crypto explanations. It must find evidence that explains the current/focused event or classify the result as context-only or none-found.

A source is valid causal evidence only if most of these are true:

```text
It is published on or near the event date.
It discusses the same asset group or broad crypto market.
It describes a catalyst such as ETF flows, liquidations, macro data, geopolitical news, regulatory action, exchange/project event, network incident, exploit, official announcement, or institutional activity.
It explicitly or strongly connects that catalyst to crypto price movement, volatility, risk appetite, flows, or liquidations.
Its reported price/time context does not conflict with Binance data.
```

If a source only explains general crypto conditions, classify it as `context_only`.

## Query templates

### Market-wide down

```text
crypto market selloff {YYYY-MM-DD} liquidations ETF outflows Fed rates geopolitics
bitcoin ethereum solana xrp drop {YYYY-MM-DD} cause
BTC price drop {YYYY-MM-DD} liquidations ETF outflows
```

### Market-wide up

```text
crypto market rally {YYYY-MM-DD} ETF inflows macro Fed geopolitics
bitcoin ethereum solana xrp rise {YYYY-MM-DD} cause
BTC rally {YYYY-MM-DD} institutional inflows
```

### Two-sided market-day

```text
crypto market volatility {YYYY-MM-DD} selloff rebound cause
bitcoin intraday selloff rebound {YYYY-MM-DD}
crypto liquidation relief rally {YYYY-MM-DD}
```

### Future single-symbol routes, not used for MVP auto-search

```text
BTC: ETF flows, macro, regulation, liquidations
ETH: ETF, staking, upgrade, gas, DeFi
BNB: Binance, BNB Chain, regulatory, burn/announcement
SOL: Solana outage/status, ETF, exploit, ecosystem
XRP: Ripple, SEC/legal, listing, ETF/regulatory
```

## Source quality policy

Prefer:

```text
official exchange/project/status pages
regulators / central banks / official macro sources
Reuters / AP / CNBC / Fortune / Yahoo Finance
CoinDesk
The Block
Blockworks
Decrypt
Cointelegraph
CoinShares / Farside for ETF/flow data
security/exploit sources when relevant
```

Down-rank or reject:

```text
price prediction pages
forecast pages
price target pages
SEO “why is crypto up/down” pages
low-quality exchange blog/news pages
stale pages outside the event date window
pages with price context conflicting with Binance data
coindcx.com/blog
bitcoinfoundation.org/news
TradingKey
Intellectia
MEXC/news
Bitget/wiki
StealthEX
*/why-is-crypto-*
*-price-prediction-*
```

Public UI shows only accepted source links.

## Accepted source link shape

```json
{
  "publisher": "CoinDesk",
  "title": "Bitcoin drops below...",
  "url": "https://example.com/article",
  "published_at": "2026-05-28",
  "accessed_at": "2026-06-16T00:00:00Z",
  "used_for": "focused_catalyst",
  "source_strength": "strong"
}
```

Allowed `used_for` values:

```text
focused_catalyst
likely_cause
backdrop
price_check
```

## Price context check

Claude/backend should classify source price context:

```text
matches_binance
minor_mismatch
conflict
unknown
```

UI rule:

```text
matches_binance -> green confidence chip
minor_mismatch -> amber confidence chip
conflict -> red confidence chip and no Focused Cause unless another strong source resolves it
unknown -> muted chip
```

## Safety rules for Claude

Claude must never output:

```text
buy/sell/hold/long/short guidance
price targets
entry/exit levels
position sizing
risk/reward ratio
trading strategy
directional forecast
financial advice
```

Claude may output:

```text
observed market movement
public source-backed event context
market backdrop
caveat that source context is same-day, not minute-level causality
none_found when no reliable source exists
```
