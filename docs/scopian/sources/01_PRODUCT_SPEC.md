---
project: ByteSiren
source_id: BS-SRC-01
title: ByteSiren Product Specification
status: frozen_source
version: phase0-source-of-truth-v1
last_updated: 2026-06-16
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Any change to frozen decisions requires a Scopian Scope Buffer decision before implementation.
depends_on: [BS-SRC-00]
---

# ByteSiren Product Specification

## Product identity

**Name:** ByteSiren

**Type:** Read-only AI crypto market intelligence dashboard.

**Core promise:** ByteSiren monitors selected Binance public market data, detects broad crypto market anomalies, and uses Claude Web Search to produce cited public context. It is a market intelligence demo, not a trading tool.

**One-line portfolio description:**

> ByteSiren is a read-only AI crypto market intelligence dashboard that monitors Binance public market data for five major crypto pairs, detects abnormal market-wide movement, and uses Claude Web Search to provide cited public context without giving trading advice.

## Primary user impression

A first-time viewer should immediately understand:

```text
1. This is a serious AI + crypto portfolio project.
2. It monitors real public market data.
3. It detects unusual market-wide movement.
4. Claude adds current public context with source links.
5. It is not financial advice and not a trading signal app.
```

## Target portfolio value

ByteSiren is designed to show competence in:

```text
AI application engineering
crypto/fintech awareness
Cloudflare serverless architecture
public API ingestion
market anomaly detection
Claude Web Search integration
source-backed AI summarization
safe UX framing for financial topics
SEO-ready one-page application design
```

## MVP scope

### Included

```text
One public page
Top five crypto pairs only
Binance public market data ingestion
15-minute candle-based detection
30-day visible history
31-day internal retention
v2.2 signal engine
market-wide and market-day incident grouping
Claude Web Search enrichment for qualifying candidates
source links attached to each accepted Claude brief
Variant A Terminal Split Layout
clickable source chips
bottom glossary / score explanation / data timing / disclaimer / SEO copy
Cloudflare Pages + Workers + Cron Triggers + D1 deployment
```

### Excluded

```text
No user login
No wallet connection
No portfolio tracker
No authenticated Binance account API
No order/trading endpoint
No trade execution
No buy/sell/hold/long/short labels
No price targets
No financial or investment advice
No trading strategy
No prediction market or gambling content
No multi-page admin dashboard
No public Claude budget or quota number
No raw Claude search logs in public UI
No rejected/low-quality source display in public UI
```

## Product page structure

The final page uses **Variant A — Terminal Split Layout**.

```text
Header
  ByteSiren identity, compact safety pill, updated timestamp

Dashboard Grid
  Left: Chart Panel
    symbol tabs only for chart
    selected symbol price
    15m and 24h changes with explicit duration labels
    TradingView Lightweight Charts candlestick chart
    incident markers

  Right: Intelligence Feed
    30-day history, newest first
    each row: Evidence | Claude Brief | Sources
    rows expandable for details

Bottom Accordions
  How to read ByteSiren
  What scores mean
  Data sources and timing
  Limitations and disclaimer
  SEO-readable description
```

## Locked project constraints

```text
Project name is ByteSiren.
Use top five symbols only: BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, XRPUSDT.
Show only past 30 days publicly.
Retain only 31 days internally.
Use Cloudflare stack.
Use Claude Web Search only after deterministic candidate detection.
Use one public page only.
Use Variant A layout.
Use v2.2 detector baseline.
Use orange logo color only as subtle brand accent.
Do not show public Claude budget/status numbers.
Do not show rejected/low-quality sources publicly.
```

## Naming and language rules

Use market intelligence language:

```text
Detected Evidence
Claude Brief
Sources
Market-wide
Market Day
Observed Up
Observed Down
Two-sided
Focused Cause
Likely Cause
Market Backdrop
No Clear Cause
Claude Limited
```

Avoid trading language:

```text
Buy
Sell
Hold
Long
Short
Entry
Exit
Take profit
Stop loss
Price target
Strong buy
Strong sell
Bullish signal
Bearish signal
Trading strategy
```

## Data scope

Monitored pairs:

```text
BTCUSDT
ETHUSDT
BNBUSDT
SOLUSDT
XRPUSDT
```

Primary candle interval:

```text
15m
```

Baseline window:

```text
24h = 96 bars of 15m candles
```

Visible history:

```text
30 days
```

Cleanup:

```text
Delete records older than 31 days.
```

## Cause vs context philosophy

The UI must not overclaim causation. Claude output is classified as:

```text
cause_supported
cause_likely
context_only
none_found
analysis_limited
queued_for_analysis
```

Public UI label gate:

```text
Focused Cause = cause_supported only
Likely Cause = cause_likely only
Market Backdrop = context_only only
No Clear Cause = none_found only
Claude Limited = analysis_limited only
Waiting for Claude = queued_for_analysis only
```

Detector severity must never turn a `context_only` result into a cause label.

## Current theme rule

```text
Orange is brand presence.
Violet is interface control.
Emerald/rose is market direction.
Teal/emerald is evidence confidence.
Slate/navy is the product base.
```

## Build-readiness decision

ByteSiren is ready to build from this source pack. New feature requests should be held until the MVP is implemented and reviewed.
