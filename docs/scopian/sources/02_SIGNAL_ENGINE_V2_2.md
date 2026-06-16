---
project: ByteSiren
source_id: BS-SRC-02
title: ByteSiren Signal Engine v2.2
status: frozen_source
version: phase0-source-of-truth-v1
last_updated: 2026-06-16
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Any change to frozen decisions requires a Scopian Scope Buffer decision before implementation.
depends_on: [BS-SRC-01]
---

# ByteSiren Signal Engine v2.2

## Purpose

The signal engine turns Binance public market data into final incident candidates for the Intelligence Feed and Claude Web Search enrichment. It is deterministic and must run before Claude. Claude should explain only final candidates, not raw market noise.

## Version

```text
Detector baseline: ByteSiren v2.2
Status: frozen for MVP implementation
```

## Data input

Source: Binance public market data.

Primary endpoint:

```text
GET https://data-api.binance.vision/api/v3/klines
```

MVP fields required from each kline:

```text
open_time
open
high
low
close
volume
close_time
quote_volume
trade_count optional
```

Primary interval:

```text
15m
```

Symbols:

```text
BTCUSDT
ETHUSDT
BNBUSDT
SOLUSDT
XRPUSDT
```

## Feature calculation

For each symbol and 15m candle:

```text
return_15m = ln(close_t / close_t-1)
return_15m_pct = (exp(return_15m) - 1) * 100
true_range_pct = ((high - low) / close) * 100
```

Baseline:

```text
lookback_bars = 96
baseline duration = 24h
baseline excludes current candle
```

Robust price z-score:

```text
price_z = 0.6745 * (return_15m - median_return_baseline) / MAD_return_baseline
```

Volume ratio:

```text
volume_ratio = current_quote_volume / median_quote_volume_baseline
```

Range ratio:

```text
range_ratio = current_true_range_pct / median_true_range_pct_baseline
```

Implementation note: previous PoC used the name `volatility_ratio`; product UI should call this **Range ×** to make it easier for users.

## Score mapping

Use clamped linear scoring.

```text
score_z(abs_z, floor=3.0, cap=8.0)
score_ratio(ratio, floor=2.0, cap=6.0)
```

Where:

```text
score_z = clamp(100 * (abs_z - floor) / (cap - floor), 0, 100)
score_ratio = clamp(100 * (ratio - floor) / (cap - floor), 0, 100)
```

Per-symbol severity:

```text
symbol_severity =
  price_score * 0.40
+ volume_score * 0.30
+ range_score * 0.30
```

## Symbol elevated rule

A symbol is elevated only when price is involved and at least one confirming dimension is present.

```text
is_elevated =
  abs(price_z) >= 3.0
  AND abs(return_15m_pct) >= 0.35
  AND (
    volume_ratio >= 2.0
    OR range_ratio >= 2.0
  )
```

This rule is frozen because earlier validation showed that volume+range without a meaningful price move created weak artifacts.

## Direction rule

For each elevated symbol:

```text
return_15m > 0 => observed_up
return_15m < 0 => observed_down
return_15m == 0 => flat
```

For market-wide event direction:

```text
if up_count >= 3 => observed_up
else if down_count >= 3 => observed_down
else => mixed
```

Mixed same-candle events are not final candidates.

## Market-wide candidate rule

A raw market-wide event is eligible when:

```text
breadth_count >= 3
AND direction != mixed
```

Where:

```text
breadth_count = number of elevated symbols in the same candle
```

## Persistence rule

Default persistence:

```text
Require 2 consecutive elevated bars.
```

Persistence is waived for strong market-wide events when any of these is true:

```text
breadth_count >= 4
OR avg_elevated_severity >= 80
OR (breadth_count >= 3 AND max_elevated_severity >= 85)
```

This waiver is a key v2.2 rule. It recovered the May 28 event while keeping low-severity flickers suppressed.

## Headline severity

For public display, market-wide severity uses average elevated severity, not max severity.

```text
headline_severity = avg_elevated_severity
max_elevated_severity = max(symbol_severity for elevated symbols)
peak_symbol = symbol with max_elevated_severity
```

Reason: one hot symbol should not inflate the whole market incident headline.

## Severity tiers

```text
0–24     normal
25–49    notable
50–74    elevated
75–100   severe
```

UI-facing wording:

```text
normal -> Calm
notable -> Moving
included_in_incident -> In Event
severe/strong -> Strong Move
```

Avoid “bullish,” “bearish,” “buy,” “sell,” and similar trading terms.

## Raw event shape

```json
{
  "id": "raw_20260614t2115z_market_wide_up",
  "detected_at": "2026-06-14T21:15:00Z",
  "scope": "market_wide",
  "direction": "observed_up",
  "symbols": ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"],
  "breadth_count": 5,
  "avg_elevated_severity": 100,
  "max_elevated_severity": 100,
  "peak_symbol": "SOLUSDT",
  "auto_confirm_reason": "breadth>=4",
  "symbol_evidence": []
}
```

## Per-symbol evidence shape

```json
{
  "symbol": "BTCUSDT",
  "signal_window": "15m",
  "baseline_window": "24h",
  "included_in_event": true,
  "direction": "observed_up",
  "change_15m_pct": 2.1,
  "price_z": 4.9,
  "volume_ratio_vs_24h_baseline": 2.4,
  "range_ratio_vs_24h_baseline": 3.1,
  "severity_score": 78
}
```

## Suppression rules

Suppress these from Claude/public final candidates:

```text
single_symbol events in MVP
mixed-direction same-candle market events
flat-price volume/range artifacts
single-symbol events within 60 minutes after a market-wide event
low-severity 3/5 events that fail persistence and waiver
immediate follow-on bars inside the same incident
duplicate raw events with same incident key
```

Single-symbol evidence can still appear in expanded detail as part of market-wide events.

## Incident grouping

Separate these concepts:

```text
raw_detector_event
final_incident_candidate
claude_brief
```

### Same-direction merge

Merge same-scope and same-direction market-wide events when:

```text
same UTC day
within 4 hours
similar symbol set
same direction
```

Preserve sub-events in `sub_events[]`.

### Market-day grouping

Group same-day opposite-direction market-wide swings into `market_day` candidates.

Example:

```text
May 23 down + May 23 up => one market_day two_sided candidate
May 26 up + May 26 down => one market_day two_sided candidate
```

A market-day candidate must preserve all sub-events so the UI can show “selloff then rebound” without flattening the story.

## Final incident candidate shape

```json
{
  "incident_id": "bs_20260614_market_up_all5",
  "incident_key": "2026-06-14_market_wide_observed_up_all5",
  "macro_day_cache_key": "2026-06-14_market_up",
  "scope": "market_wide",
  "direction": "observed_up",
  "started_at": "2026-06-14T21:15:00Z",
  "ended_at": "2026-06-14T21:45:00Z",
  "signal_window": "15m",
  "baseline_window": "24h",
  "breadth_count": 5,
  "breadth_label": "5/5 pairs",
  "headline_severity": 100,
  "severity_label": "Strong Move",
  "symbols": ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"],
  "sub_events": [],
  "symbol_evidence": [],
  "status": "queued_for_analysis"
}
```

## Pseudocode

```text
for each poll cycle:
  fetch latest required klines for all 5 symbols
  upsert candles by symbol + interval + open_time
  compute features from latest candles and 24h baseline
  mark symbols elevated if price gate + confirmation pass
  align symbols by candle open_time
  create raw market events when breadth >= 3 and direction != mixed
  apply persistence and v2.2 waiver
  suppress low-quality raw events
  merge same-direction events
  group same-day two-sided market_day events
  create or update final incident candidates by incident_key
  queue eligible candidates for Claude enrichment
```

## Implementation requirements

```text
Detector must be deterministic.
Detector must not call Claude directly.
Detector must store events before Claude enrichment.
Detector must be idempotent under cron retries.
Detector must preserve symbol evidence for all five symbols, not only elevated ones.
Detector must expose enough data for the UI to explain scores and duration windows.
```
