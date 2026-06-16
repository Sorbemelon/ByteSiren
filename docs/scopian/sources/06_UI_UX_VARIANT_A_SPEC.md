---
project: ByteSiren
source_id: BS-SRC-06
title: Variant A UI/UX Specification
status: frozen_source
version: phase0-source-of-truth-v1
last_updated: 2026-06-16
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Any change to frozen decisions requires a Scopian Scope Buffer decision before implementation.
depends_on: [BS-SRC-01, BS-SRC-04, BS-SRC-05]
---

# ByteSiren UI/UX Specification — Variant A Terminal Split Layout

## Selected layout

**Variant A — Terminal Split Layout** is the final MVP layout.

```text
Left: Chart Panel
Right: Intelligence Feed
Bottom: Accordions for explanation, data timing, and disclaimer
```

The page should feel like a compact crypto market intelligence terminal, not a trading signal application.

## Desktop wireframe

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ ByteSiren                                                    Updated 14:05 │
│ AI Crypto Market Intelligence          Read-only · Not financial advice    │
├───────────────────────────────────────┬────────────────────────────────────┤
│ Chart Panel                            │ Intelligence Feed                  │
│                                       │ Past 30 days · newest first         │
│ [ BTC ] [ ETH ] [ BNB ] [ SOL ] [ XRP ]│ What do these labels mean?          │
│ Chart symbol only                      │                                    │
│                                       │ ┌────────────┬──────────────┬──────┐ │
│ BTCUSDT                               │ │ Evidence   │ Claude Brief │Sources│ │
│ $64,775.20                            │ ├────────────┼──────────────┼──────┤ │
│ 15m Change +1.2% · 24h Change +4.8%   │ │ 15m signal │ Focused Cause│[CD] │ │
│                                       │ │ 5/5 pairs  │ Same-day...  │[YF] │ │
│ ┌───────────────────────────────────┐ │ │ Up · 100   │ High · Price │ +1  │ │
│ │ TradingView chart                  │ │ │ Jun 14 UTC │ minor match  │     │ │
│ │ Candles + volume                   │ │ └────────────┴──────────────┴──────┘ │
│ │ Incident markers                   │ │                                    │
│ │ Selected marker highlight          │ │ ┌────────────┬──────────────┬──────┐ │
│ └───────────────────────────────────┘ │ │ Market Day │ Likely Cause │[CB] │ │
│                                       │ │ Two-sided  │ Day-level... │[CD] │ │
│                                       │ └────────────┴──────────────┴──────┘ │
├───────────────────────────────────────┴────────────────────────────────────┤
│ How to read ByteSiren ▾  What scores mean ▾  Data sources ▾  Disclaimer ▾  │
└────────────────────────────────────────────────────────────────────────────┘
```

## Mobile wireframe

```text
Header
Chart Panel
Intelligence Feed
Bottom Accordions
```

Mobile feed rows stack:

```text
Evidence
Claude Brief
Sources
```

## HeaderBar

Content:

```text
ByteSiren
AI Crypto Market Intelligence
Read-only · Not financial advice
Updated 14:05 UTC
```

Use logo mark plus live text in the app header. Use full logo-name image for README, OG/social, and portfolio card.

Do not show the long disclaimer in the top header.

## ChartPanel

### Purpose

The chart panel is the reliable market anchor.

### Contains

```text
ChartSymbolTabs
ChartStatHeader
TradingView Lightweight Chart
Chart helper text
```

### Symbol tabs

Tabs:

```text
BTC
ETH
BNB
SOL
XRP
```

Rules:

```text
Symbol tabs exist only inside the chart panel.
Symbol tabs control only the chart.
Intelligence Feed is not filtered by symbol tabs.
```

Helper text:

```text
Chart symbol only · Intelligence Feed shows all detected market events
```

### Chart stat header

Example:

```text
BTCUSDT
$64,775.20
15m Change +1.2% · 24h Change +4.8%
```

Every percentage must include duration.

### Chart requirements

```text
30-day candlestick chart
15m candles
volume bars
incident markers
selected incident marker highlight
market_day sub-event markers
```

## IntelligenceFeedPanel

Header:

```text
Intelligence Feed
Past 30 days · newest first
Labels describe observed market movement, not trading advice.
What do these labels mean?
```

The feed is scrollable inside the right panel on desktop. It shows all visible final incident candidates for the past 30 days.

## FeedRow

Every row has three columns:

```text
Evidence | Claude Brief | Sources
```

Desktop column widths:

```text
Evidence: 30%
Claude Brief: 48%
Sources: 22%
```

Collapsed row height target:

```text
104–118px
```

Collapsed row content must fit in 1–2 lines per major section.

## EvidenceCell

Purpose: show what ByteSiren detected from Binance public data.

Default format:

```text
15m signal · 5/5 pairs
Observed Up · Strong Move 100
Jun 14 · 21:15 UTC
```

Market-day format:

```text
Market Day · Two-sided
5/5 pairs · Strong Move 83
May 26 · 2 sub-events
```

Use chips:

```text
15m signal
5/5 pairs
Observed Up
Strong Move 100
```

## BriefCell

Purpose: show Claude’s event-focused source-backed context.

Examples:

```text
Focused Cause
Same-day reports linked the broad crypto rally to geopolitical easing.
High confidence · Price: minor mismatch
```

```text
Likely Cause
Public sources point to ETF outflows and risk-off sentiment around the move.
Medium confidence · Price: matches Binance
```

```text
Market Backdrop
Sources describe a relief rally, but no direct cause was found for this move.
Context only
```

```text
No Clear Cause
No reliable public explanation was found for this detection.
```

```text
Claude analysis is limited in this free public project.
The context will be shown when analysis is available.
```

Brief summary is line-clamped to two lines in collapsed rows.

## SourceChipCell

Purpose: show accepted source links as compact clickable chips.

Examples:

```text
[CoinDesk ↗]
[Yahoo ↗]
[+2]
```

Rules:

```text
Each source chip links directly to its source URL.
Open in new tab.
Use rel="noopener noreferrer".
Display publisher name only.
Use source title in title/aria-label.
Do not show rejected/low-quality sources.
+N expands the row to show all accepted sources.
```

## ExpandedFeedRow

Expansion is inline for MVP.

Expanded sections:

```text
Per-symbol evidence
Claude context details
Accepted sources
Caveats
```

Do not show:

```text
Rejected sources
Raw Claude search logs
Claude budget/quota
Prompt details
Debug traces
```

### Per-symbol evidence table

Columns:

```text
Symbol
15m %
Price Z
Volume ×
Range ×
Score
```

Tooltips/glossary explain that Volume × and Range × compare the current 15m candle to the recent 24h median baseline.

### Required caveat for day-level context

When appropriate, show:

```text
This is same-day public context, not proof of exact 15-minute causation.
```

## Interactions

```text
Click symbol tab -> changes chart only.
Click feed row -> selects/highlights row and related chart marker.
Click View on chart -> optional switch to BTC or most relevant symbol and center event.
Click source chip -> opens source in new tab.
Click What do these labels mean? -> scrolls to glossary or opens lightweight drawer.
```

## Row selected state

```text
Violet border/glow.
Selected chart marker highlighted.
No automatic chart symbol switch unless user chooses View on chart.
```

## Empty/loading/error states

### No incidents

```text
No market-wide incident detected in the past 30 days.
ByteSiren will add events when the detector finds a qualifying market-wide move.
```

### Claude limited

```text
Claude analysis is limited in this free public project.
The context will be shown when analysis is available.
```

### Waiting for Claude

```text
Waiting for Claude analysis.
This detection is queued for date-matched web context.
```

### No clear cause

```text
No clear public cause found from trusted sources for this detection.
```

### Market data delay

```text
Market data is delayed.
ByteSiren will update when new public Binance data is available.
```

## BottomInfoAccordions

Accordions:

```text
How to read ByteSiren
What the scores mean
Data sources and timing
Limitations and disclaimer
```

Content should be real HTML text for readability and SEO.

## Accessibility requirements

```text
Color is never the only meaning carrier.
Source chips are keyboard focusable.
Feed rows have aria-expanded when expandable.
External links have descriptive aria labels.
Chart has an accessible summary.
Text contrast is readable on dark background.
```
