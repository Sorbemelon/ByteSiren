# Source-Calibrated Detector Gate

Generated: 2026-06-20T12:24:39.214Z
Lead window: <= 360 minutes

This is a local offline calibration pass. It uses only accepted `keep` and `conditional_keep` source URLs whose timestamp is inside or before a current public/audit Signal Event by the configured lead window. It then checks the chart response after the source timestamp using existing 15m OHLCV data.

## Counts

- vNext-C public signals: 23
- vNext-C audit events: 18
- Source-tuned public signals: 24
- Source-tuned audit events: 17
- Promoted from audit: 1
- Source-matched events: 5

## Promoted From Audit

- vnext_c_e639b7ad_20260607t2200: 2026-06-07T22:00:00.000Z to 2026-06-07T22:14:59.998Z; observed_up; Avg Change +2.93%; Range break; previous suppress one_bar_unconfirmed_window; reason source_calibrated_one_bar_range_break_review; best post-source aligned response +1.16% over 360m

## Source-Matched Audit Kept Audit

- vnext_c_0118579a_20260601t1515: 2026-06-01T15:15:00.000Z to 2026-06-01T15:59:59.998Z; observed_down; Avg Change -0.48%; previous suppress no_strong_context_path; source reason source_match_but_gate_requirements_not_met; best response +0.26%
- vnext_c_a1f7b080_20260613t2130: 2026-06-13T21:30:00.000Z to 2026-06-13T21:44:59.998Z; observed_up; Avg Change +0.7%; previous suppress one_bar_unconfirmed_window; source reason source_match_but_one_bar_or_modest_response_kept_audit; best response +0.24%

## Matched Event Source Response

### vnext_c_cca96e5f_20260526t1015
- Signal: 2026-05-26T10:15:00.000Z to 2026-05-26T10:44:59.998Z; observed_up; previous public true; tuned public true
- Sources: 1 unique; keep 0; conditional 1; high support 0
- Best post-source aligned response: +0.98% over 360m
  - 2026-05-26T07:04:56.182Z; lead 190m; strong_timing_match; best +0.98% over 360m; Latest Crypto News Update - May 26, 2026

### vnext_c_0118579a_20260601t1515
- Signal: 2026-06-01T15:15:00.000Z to 2026-06-01T15:59:59.998Z; observed_down; previous public false; tuned public false
- Sources: 3 unique; keep 2; conditional 1; high support 3
- Best post-source aligned response: +0.26% over 60m
  - 2026-06-01T14:53:00.000Z; lead 22m; strong_timing_match; best +0.26% over 60m; You Can Now Trade 8,000 US Stocks on Binance Using Your Stablecoins
  - 2026-06-01T14:53:00.000Z; lead 22m; strong_timing_match; best +0.26% over 60m; Crypto Daily Market Report – June 1, 2026
  - 2026-06-01T14:53:00.000Z; lead 22m; strong_timing_match; best +0.26% over 60m; Binance Launches U.S. Stocks Trading and Previews bStocks Tokenized Securities

### vnext_c_e639b7ad_20260607t2200
- Signal: 2026-06-07T22:00:00.000Z to 2026-06-07T22:14:59.998Z; observed_up; previous public false; tuned public true
- Sources: 3 unique; keep 2; conditional 1; high support 3
- Best post-source aligned response: +1.16% over 360m
  - 2026-06-07T17:00:00.000Z; lead 300m; strong_timing_match; best +1.16% over 360m; Saylor's Strategy Resumes Bitcoin Accumulation Spree After Last Week's Sale
  - 2026-06-07T17:00:00.000Z; lead 300m; strong_timing_match; best +1.16% over 360m; Crypto Market Update: Bankman-Fried Seeks Pardon from Trump
  - 2026-06-07T17:00:00.000Z; lead 300m; strong_timing_match; best +1.16% over 360m; Crypto: Trending News, Latest Updates, Analysis

### vnext_c_a1f7b080_20260613t2130
- Signal: 2026-06-13T21:30:00.000Z to 2026-06-13T21:44:59.998Z; observed_up; previous public false; tuned public false
- Sources: 2 unique; keep 2; conditional 0; high support 2
- Best post-source aligned response: +0.24% over 360m
  - 2026-06-13T17:20:18.000Z; lead 250m; strong_timing_match; best +0.24% over 360m; Blackrock's IBIT Leads $86 Million Bitcoin ETF Inflow as Ethereum Funds Extend Outflow Streak
  - 2026-06-13T17:20:18.000Z; lead 250m; strong_timing_match; best +0.24% over 360m; Crypto ETF Flows June 2026: Bitcoin Outflows, XRP and Solana Rotation

### vnext_c_e71b58af_20260617t1800
- Signal: 2026-06-17T18:00:00.000Z to 2026-06-17T19:44:59.998Z; observed_down; previous public true; tuned public true
- Sources: 2 unique; keep 1; conditional 1; high support 0
- Best post-source aligned response: +0.5% over 720m
  - 2026-06-17T12:30:00.000Z; lead 330m; strong_timing_match; best +0.5% over 720m; The Fed speaks this afternoon. PCE follows in 8 days.
  - 2026-06-17T12:30:00.000Z; lead 330m; strong_timing_match; best +0.5% over 720m; Crypto Daily Market Report June 16 2026
