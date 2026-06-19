# vNext-A vs vNext-B Comparison

Generated at: 2026-06-19T09:38:24.237Z

- vNext-A detected events: 25
- vNext-B detected events: 25
- vNext-B publish candidates: 14
- vNext-B events >90 min: 0
- vNext-B events >120 min: 0

## Suppressed By Reason

- below_publish_gate: 5
- weak_window_move_lt_1pct: 3
- weak_weekend_overnight_micro_move: 2
- micro_retrace_after_parent: 1

## Macro-Aligned Events

- 2026-06-10T12:30:00.000Z observed_up vnext_b_1b8c81d3_20260610t1230 strength 45.6114
- 2026-06-17T18:00:00.000Z observed_down vnext_b_4ab7f2a1_20260617t1800 strength 81.1444
- 2026-06-17T18:30:00.000Z observed_up vnext_b_28a60d1b_20260617t1830 strength 56.8101

## Top Public Candidates

- 2026-05-23T07:45:00.000Z observed_down move 1.9783% strength 100
- 2026-06-14T21:15:00.000Z observed_up move 3.2339% strength 100
- 2026-06-07T22:00:00.000Z observed_up move 4.1306% strength 96.2382
- 2026-05-23T20:30:00.000Z observed_up move 3.3261% strength 94.3857
- 2026-06-17T19:15:00.000Z observed_down move 2.5711% strength 86.2218
- 2026-06-17T18:00:00.000Z observed_down move 1.4149% strength 81.1444
- 2026-06-02T14:15:00.000Z observed_down move 2.0342% strength 75.2338
- 2026-06-10T13:30:00.000Z observed_up move 1.8007% strength 63.3362
- 2026-05-28T03:15:00.000Z observed_down move 1.7212% strength 61.5041
- 2026-06-17T18:30:00.000Z observed_up move 1.5166% strength 56.8101
- 2026-06-18T15:30:00.000Z observed_down move 2.2244% strength 53.3499
- 2026-06-10T12:30:00.000Z observed_up move 1.2439% strength 45.6114
- 2026-05-29T15:00:00.000Z observed_up move 1.5984% strength 44.9419
- 2026-06-02T22:45:00.000Z observed_down move 2.3781% strength 44.6141

## Claude Validation Notes

- Use signal_strength_score as detector magnitude only; do not treat it as source availability.
- Use macro_aligned and nearest_macro_event as route hints, not proof of cause.
- Prefer No Clear Cause for weekend or overnight micro-moves without dated, time-aligned sources.
- Daily Overview source work should use day-level context labels, not Focused Cause or Likely Cause.
