# vNext-B vs vNext-C Comparison

Generated at: 2026-06-20T00:34:40.341Z

- vNext-B detected events: 25
- vNext-C detected events: 41
- vNext-B public candidates: 14
- vNext-C public candidates: 23
- vNext-B audit events: 11
- vNext-C audit events: 18

## Public/Audit Movement

- Kept public: 8
- Moved public to audit: 3
- Removed vNext-B public windows: 3
- Moved audit to public: 15
- Still audit-only: 15

## vNext-C Suppressed By Reason

- one_bar_unconfirmed_window: 8
- no_prior_history_support: 5
- no_strong_context_path: 4
- weak_breadth: 1

## Strongest Chart-Context Events

- 2026-05-21T13:30:00.000Z observed_down: Range break score 100; range_break_down; public=false
- 2026-05-22T18:30:00.000Z observed_down: Range break score 100; range_break_down; public=true
- 2026-05-23T07:45:00.000Z observed_down: Range break score 100; range_break_down; public=false
- 2026-05-23T20:30:00.000Z observed_up: Range break score 100; range_break_up; public=true
- 2026-05-24T21:15:00.000Z observed_down: Range break score 100; range_break_down; public=true
- 2026-05-26T00:30:00.000Z observed_down: Range break score 100; range_break_down; public=true
- 2026-05-26T10:15:00.000Z observed_up: Volatility expansion score 100; volatility_expansion_up; public=true
- 2026-05-27T21:30:00.000Z observed_down: Range break score 100; range_break_down; public=true
- 2026-05-28T03:15:00.000Z observed_down: Range break score 100; range_break_down; public=true
- 2026-06-02T14:15:00.000Z observed_down: Range break score 100; range_break_down; public=true

## Weakest Chart-Context Events

- 2026-06-05T13:45:00.000Z observed_down: Moderate chart context score 71.8; suppress=one_bar_unconfirmed_window
- 2026-06-15T01:30:00.000Z observed_up: Strong chart context score 72.11; suppress=no_prior_history_support
- 2026-05-27T17:00:00.000Z observed_down: Strong chart context score 73.4; suppress=one_bar_unconfirmed_window
- 2026-05-25T02:00:00.000Z observed_up: Strong chart context score 73.97; suppress=one_bar_unconfirmed_window
- 2026-06-01T01:00:00.000Z observed_down: Strong chart context score 77.65; suppress=no_prior_history_support
- 2026-06-03T16:15:00.000Z observed_down: Momentum continuation score 79.97; suppress=no_strong_context_path
- 2026-05-21T17:00:00.000Z observed_up: Strong chart context score 81.57; suppress=no_prior_history_support
- 2026-06-10T00:30:00.000Z observed_down: Momentum continuation score 86.97; suppress=no_strong_context_path
- 2026-05-22T23:15:00.000Z observed_down: Strong chart context score 86.98; suppress=null
- 2026-06-01T15:15:00.000Z observed_down: Momentum continuation score 89.05; suppress=no_strong_context_path

## Moved Public To Audit

- 2026-05-23T07:45:00.000Z observed_down: vnext_b_bd7eadf3_20260523t0745 -> vnext_c_58f50f6d_20260523t0745; one_bar_unconfirmed_window; Range break 100
- 2026-06-07T22:00:00.000Z observed_up: vnext_b_2fa494ec_20260607t2200 -> vnext_c_e639b7ad_20260607t2200; one_bar_unconfirmed_window; Range break 100
- 2026-06-10T12:30:00.000Z observed_up: vnext_b_1b8c81d3_20260610t1230 -> vnext_c_460a2114_20260610t1230; no_prior_history_support; Macro-aligned context 100
- 2026-06-10T13:30:00.000Z observed_up: vnext_b_da58fd31_20260610t1330 removed by vNext-C window builder
- 2026-06-17T18:30:00.000Z observed_up: vnext_b_28a60d1b_20260617t1830 removed by vNext-C window builder
- 2026-06-17T19:15:00.000Z observed_down: vnext_b_666c4278_20260617t1915 removed by vNext-C window builder

## Moved Audit To Public

- 2026-05-22T18:30:00.000Z observed_down: vnext_b_5677a786_20260522t1930 -> vnext_c_a838e493_20260522t1830; broad_confirmed_break; Range break 100
- 2026-05-22T23:15:00.000Z observed_down: unmatched -> vnext_c_ae635df8_20260522t2315; strong_continuation_breadth_trend; Strong chart context 86.98
- 2026-05-24T21:15:00.000Z observed_down: vnext_b_48f965c3_20260524t2200 -> vnext_c_d38f7b57_20260524t2115; broad_confirmed_break; Range break 100
- 2026-05-26T00:30:00.000Z observed_down: unmatched -> vnext_c_c29a0892_20260526t0030; broad_confirmed_break; Range break 100
- 2026-05-26T10:15:00.000Z observed_up: vnext_b_4b16e684_20260526t1015 -> vnext_c_cca96e5f_20260526t1015; compression_expansion_break; Volatility expansion 100
- 2026-05-27T21:30:00.000Z observed_down: vnext_b_6ff65be3_20260527t2130 -> vnext_c_b525c422_20260527t2130; broad_confirmed_break; Range break 100
- 2026-06-04T00:15:00.000Z observed_down: unmatched -> vnext_c_dc56b382_20260604t0015; broad_confirmed_break; Range break 100
- 2026-06-04T03:00:00.000Z observed_up: unmatched -> vnext_c_6c394e07_20260604t0300; relief_reversal; Relief / reversal 100
- 2026-06-05T07:15:00.000Z observed_up: unmatched -> vnext_c_c54de378_20260605t0715; relief_reversal; Relief / reversal 100
- 2026-06-07T01:00:00.000Z observed_up: unmatched -> vnext_c_228a8778_20260607t0100; compression_expansion_break; Volatility expansion 99.25
- 2026-06-08T01:00:00.000Z observed_down: unmatched -> vnext_c_33798218_20260608t0100; relief_reversal; Relief / reversal 100
- 2026-06-09T14:15:00.000Z observed_down: unmatched -> vnext_c_3870ebb2_20260609t1415; broad_confirmed_break; Range break 100
- 2026-06-11T17:15:00.000Z observed_up: unmatched -> vnext_c_56cdb3f3_20260611t1715; compression_expansion_break; Range break 100
- 2026-06-15T13:00:00.000Z observed_up: unmatched -> vnext_c_16999967_20260615t1300; broad_confirmed_break; Range break 100
- 2026-06-16T13:00:00.000Z observed_down: unmatched -> vnext_c_fcff80b4_20260616t1300; compression_expansion_break; Volatility expansion 100

## Claude Validation Notes

- Use chart_context_label and event_story_type as market-structure hints, not source proof.
- Range Position and Range break are descriptive chart context, not trading advice.
- Do not infer a cause from chart context alone.
- Use No Clear Cause or Market Backdrop when sources do not support a specific cause.
