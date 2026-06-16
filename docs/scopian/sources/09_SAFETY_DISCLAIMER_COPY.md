---
project: ByteSiren
source_id: BS-SRC-09
title: Safety, Disclaimer, and Copy Rules
status: frozen_source
version: phase0-source-of-truth-v1
last_updated: 2026-06-16
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Any change to frozen decisions requires a Scopian Scope Buffer decision before implementation.
depends_on: [BS-SRC-01, BS-SRC-03, BS-SRC-06]
---

# Safety, Disclaimer, and Copy Rules

## Purpose

ByteSiren is a public crypto market intelligence demo. It must be clear, useful, and safe. It must never look like a financial advice, trading signal, price prediction, or automated trading tool.

## Top compact safety pill

Use near header:

```text
Read-only · Not financial advice
```

Alternative acceptable:

```text
Read-only · No trading advice
```

## Bottom full disclaimer

Use in the bottom accordion:

```text
ByteSiren is a public portfolio demo for market intelligence only. It does not provide financial advice, trading signals, buy/sell/hold recommendations, price targets, or automated trading.

ByteSiren uses Binance public market data and Claude-generated web-search summaries. Information may be delayed, incomplete, or incorrect. Always verify information from primary sources.

ByteSiren is not affiliated with, endorsed by, or sponsored by Binance, Anthropic, or any exchange.
```

## Data source note

```text
ByteSiren monitors only BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, and XRPUSDT using Binance public market data. Only the past 30 days of analyzed data are shown. Older records are periodically deleted.
```

## How-to-read copy

```text
ByteSiren detects unusual market-wide movement across BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, and XRPUSDT.

The chart tabs only change the chart. The Intelligence Feed shows all detected market events from the past 30 days.

Each feed row has three parts:
Evidence — what ByteSiren detected from Binance public market data.
Claude Brief — what Claude found from public web sources.
Sources — clickable links to supporting public sources.
```

## Score explanation copy

```text
Severity Score describes how unusual the detected market move is compared with recent behavior. It is not a prediction.

Breadth means how many of the five monitored pairs were included in the event.

Price Z measures how unusual the 15-minute price move is compared with the recent 24-hour baseline.

Volume × compares the current 15-minute quote volume with the recent 24-hour median baseline.

Range × compares the current 15-minute candle high-low range with the recent 24-hour median baseline.

Scores describe unusual market conditions. They are not buy/sell signals, forecasts, or price targets.
```

## Duration explanation copy

```text
15m Change compares the latest detected 15-minute candle close with the previous 15-minute candle close.

24h Change compares the latest available price with roughly 24 hours earlier.

Volume × compares the current 15-minute quote volume with the recent 24-hour median baseline for the same symbol.

Range × compares the current 15-minute candle high-low range with the recent 24-hour median baseline for the same symbol.
```

## Claude limited copy

Exact public copy:

```text
Claude analysis is limited in this free public project.
The context will be shown when analysis is available.
```

Do not add:

```text
budget used
searches remaining
quota numbers
API cost
```

## No clear cause copy

```text
No clear public cause found from trusted sources for this detection.
```

## Market data delay copy

```text
Market data is delayed. ByteSiren will update when new public Binance data is available.
```

## Waiting for Claude copy

```text
Waiting for Claude analysis. This detection is queued for date-matched web context.
```

## Same-day context caveat

Use when source context is date-matched but not exact-minute causality:

```text
This is same-day public context, not proof of exact 15-minute causation.
```

## User-facing label dictionary

Watchlist states:

```text
Calm
Moving
In Event
Strong Move
Data Delay
```

Incident labels:

```text
Market-wide
Market Day
Observed Up
Observed Down
Two-sided
```

Claude labels:

```text
Focused Cause
Likely Cause
Market Backdrop
No Clear Cause
Claude Limited
Waiting for Claude
```

Source role labels:

```text
Catalyst
Likely cause
Backdrop
Price check
```

## Forbidden public wording

Do not use:

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
Alpha
Trading setup
Trade idea
Recommendation
Should buy
Should sell
Guaranteed
Prediction
Expected return
Win rate
```

## Allowed public wording

Use:

```text
Observed Up
Observed Down
Detected evidence
Market-wide anomaly
Market Backdrop
Focused Cause
Likely Cause
No Clear Cause
Same-day public context
Source-backed context
Read-only
Informational only
```

## Source display safety

Public UI should show only accepted and relevant source links.

Do not show:

```text
Rejected sources
Low-quality source names
Forecast/SEO source names
Raw search logs
Claude prompt/debug output
```

## Financial topic safety rule

Whenever a copy choice is ambiguous, choose the wording that makes ByteSiren look like an informational market monitor, not a trading decision system.
