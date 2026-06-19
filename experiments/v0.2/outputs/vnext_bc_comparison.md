# vNext-B vs vNext-C Comparison

Generated at: 2026-06-19T17:43:16.785Z

- vNext-B detected events: 25
- vNext-C detected events: 28
- vNext-B public candidates: 14
- vNext-C public candidates: 5
- vNext-B audit events: 11
- vNext-C audit events: 23

## Public/Audit Movement

- Kept public: 3
- Moved public to audit: 4
- Removed vNext-B public windows: 7
- Moved audit to public: 2
- Still audit-only: 19

## vNext-C Suppressed By Reason

- no_strong_context_path: 11
- noisy_range_only: 12

## Strongest Chart-Context Events

- 2026-05-22T18:30:00.000Z observed_down: Range break score 100; range_break_down; public=true
- 2026-05-24T21:15:00.000Z observed_down: Range break score 100; range_break_down; public=false
- 2026-05-27T21:30:00.000Z observed_down: Range break score 100; range_break_down; public=true
- 2026-05-28T03:15:00.000Z observed_down: Range break score 100; range_break_down; public=true
- 2026-06-09T14:15:00.000Z observed_down: Range break score 100; range_break_down; public=false
- 2026-06-14T21:15:00.000Z observed_up: Range break score 100; range_break_up; public=true
- 2026-06-17T19:15:00.000Z observed_down: Range break score 100; range_break_down; public=true
- 2026-06-18T15:15:00.000Z observed_down: Range break score 100; range_break_down; public=false
- 2026-05-23T20:30:00.000Z observed_up: Range break score 99; range_break_up; public=false
- 2026-06-04T01:15:00.000Z observed_down: Range break score 99; range_break_down; public=false

## Weakest Chart-Context Events

- 2026-05-29T14:15:00.000Z observed_down: Moderate chart context score 59.37; suppress=noisy_range_only
- 2026-06-15T01:30:00.000Z observed_up: Moderate chart context score 67.94; suppress=no_strong_context_path
- 2026-06-08T01:00:00.000Z observed_down: Moderate chart context score 70.43; suppress=noisy_range_only
- 2026-05-22T23:15:00.000Z observed_down: Strong chart context score 75.67; suppress=no_strong_context_path
- 2026-06-01T15:15:00.000Z observed_down: Momentum continuation score 78.55; suppress=no_strong_context_path
- 2026-06-02T02:15:00.000Z observed_up: Relief / reversal score 81.25; suppress=no_strong_context_path
- 2026-05-21T17:00:00.000Z observed_up: Strong chart context score 81.57; suppress=no_strong_context_path
- 2026-06-01T02:00:00.000Z observed_up: Relief / reversal score 86.87; suppress=no_strong_context_path
- 2026-06-07T01:00:00.000Z observed_up: Volatility expansion score 88; suppress=no_strong_context_path
- 2026-05-26T10:15:00.000Z observed_up: Volatility expansion score 89.19; suppress=no_strong_context_path

## Moved Public To Audit

- 2026-05-23T20:30:00.000Z observed_up: vnext_b_fdc31c9f_20260523t2030 -> vnext_c_60319648_20260523t2030; noisy_range_only; Range break 99
- 2026-05-29T15:00:00.000Z observed_up: vnext_b_dac278c4_20260529t1500 -> vnext_c_fc005a7c_20260529t1415; noisy_range_only; Moderate chart context 59.37
- 2026-06-02T22:45:00.000Z observed_down: vnext_b_d21993f9_20260602t2245 -> vnext_c_ad551489_20260602t2245; noisy_range_only; Range break 97.12
- 2026-06-18T15:30:00.000Z observed_down: vnext_b_3f586e87_20260618t1530 -> vnext_c_1188cecc_20260618t1515; noisy_range_only; Range break 100
- 2026-05-23T07:45:00.000Z observed_down: vnext_b_bd7eadf3_20260523t0745 removed by vNext-C window builder
- 2026-06-02T14:15:00.000Z observed_down: vnext_b_2559ab4c_20260602t1415 removed by vNext-C window builder
- 2026-06-07T22:00:00.000Z observed_up: vnext_b_2fa494ec_20260607t2200 removed by vNext-C window builder
- 2026-06-10T12:30:00.000Z observed_up: vnext_b_1b8c81d3_20260610t1230 removed by vNext-C window builder
- 2026-06-10T13:30:00.000Z observed_up: vnext_b_da58fd31_20260610t1330 removed by vNext-C window builder
- 2026-06-17T18:00:00.000Z observed_down: vnext_b_4ab7f2a1_20260617t1800 removed by vNext-C window builder
- 2026-06-17T18:30:00.000Z observed_up: vnext_b_28a60d1b_20260617t1830 removed by vNext-C window builder

## Moved Audit To Public

- 2026-05-22T18:30:00.000Z observed_down: vnext_b_5677a786_20260522t1930 -> vnext_c_a838e493_20260522t1830; broad_confirmed_break; Range break 100
- 2026-05-27T21:30:00.000Z observed_down: vnext_b_6ff65be3_20260527t2130 -> vnext_c_6be351f0_20260527t2130; broad_confirmed_break; Range break 100

## Claude Validation Notes

- Use chart_context_label and event_story_type as market-structure hints, not source proof.
- Range Position and Range break are descriptive chart context, not trading advice.
- Do not infer a cause from chart context alone.
- Use No Clear Cause or Market Backdrop when sources do not support a specific cause.
