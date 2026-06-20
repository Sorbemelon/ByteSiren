# Source Learning Detector Recommendations

Generated from local v0.2 source/catalyst audits. This is retrospective learning only.

## Boundary

- Do not use accepted source URLs as a live detector or public-gate input.
- In production, source evidence only exists after a Signal Event is selected for public/Claude analysis.
- Source audits can validate which chart patterns later had catalyst support.
- Detector/public-gate tuning must use source-free features available at detection time: OHLCV, chart context, range position, breadth, momentum, volatility, and event-window shape.

## Source-Backed Audit Patterns Observed

### 2026-06-01 15:15-16:00 UTC

- Current status: audit-only.
- Current suppress reason: `no_strong_context_path`.
- Later source evidence: accepted high-support source 22 minutes before the evidence window.
- Chart pattern: 3-candle momentum continuation, chart context score 89.05.
- Event move: -0.48% Avg Change.
- Event-window max aligned excursion: +0.48%.
- 6h max aligned excursion after source time: +0.53%.

Learning:
- The detector should consider a source-free public path for multibar momentum-continuation events when chart context is strong and the event-window excursion confirms the direction.
- This should not depend on knowing the source. The source only tells us this chart shape was later source-supported.

### 2026-06-07 22:00-22:15 UTC

- Current status: audit-only in base vNext-C.
- Current suppress reason: `one_bar_unconfirmed_window`.
- Later source evidence: accepted high-support sources within 6h.
- Chart pattern: one-candle range break, chart context score 100.
- Event move: +2.93% Avg Change.
- 6h max aligned excursion after source time: +2.09%.

Learning:
- A very large one-candle broad range break can represent a real catalyst response.
- Before making this public, prefer source-free merge/continuation logic that either extends the evidence window or creates a clearly named flash subtype.
- Avoid broadly allowing one-candle public events.

### 2026-06-13 21:30-21:45 UTC

- Current status: audit-only.
- Current suppress reason: `one_bar_unconfirmed_window`.
- Later source evidence: accepted high-support source 250 minutes before the evidence window.
- Chart pattern: one-candle range break, chart context score 100.
- Event move: +0.70% Avg Change.
- 6h max aligned excursion after source time: +0.60%.

Learning:
- This is a weaker source-backed flash pattern.
- Keep audit unless source-free evidence improves through adjacent-window merge, continuation, broader Market Story context, or a stricter flash-event subtype.

## Recommended Source-Free Detector Changes

1. Add event-window max aligned excursion as a detector feature.
   - This catches reactions that are muted by close-to-close scoring.
   - It is computable from OHLCV during the evidence window.

2. Add a multibar strong-context continuation public path.
   - Candidate conditions:
     - evidence_bar_count >= 2
     - chart_context_score >= 85
     - event_story_type is momentum continuation, relief/reversal, or range break
     - Avg Change >= 0.45%
     - max aligned excursion inside the evidence window >= 0.45%
     - breadth and range/volume confirmation are not weak

3. Keep one-candle events audit by default.
   - Consider public only through a future source-free flash subtype:
     - chart_context_score >= 90
     - broad range break
     - Avg Change >= 1.5%
     - broad symbol alignment
     - adjacent continuation or merge support

4. Keep source timing reports separate from detector output.
   - They should validate and rank patterns after the fact.
   - They should not set `publish_candidate`.

## Corrected Next Step

Build a new source-free detector refinement, for example `vnext_c_pattern_tuned`, using:

- event-window max aligned excursion
- stronger multibar momentum-continuation path
- refined one-candle flash audit/public policy
- no source URL fields in gate logic

