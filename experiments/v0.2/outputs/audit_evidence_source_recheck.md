# Audit Evidence Closest Catalyst Source Recheck

Generated: 2026-06-20T13:18:49.430Z
Audit events checked: 18
Accepted source lead window: <= 360 minutes

This local report rechecks every current audit-only Signal Event against its closest mapped catalyst source and any accepted keep/conditional source before or inside the event window. It adds max aligned excursion so short reactions are not missed by close-to-close response only.

## Assessment Counts

- conditional_public_review_candidate_one_bar_range_break: 2
- no_accepted_source_within_6h: 15
- public_review_candidate_multibar_source_backed: 1

## Public Review Candidates

### 2026-06-01T15:15:00.000Z to 2026-06-01T15:59:59.998Z
- ID: vnext_c_0118579a_20260601t1515
- Direction: observed_down
- Avg Change: -0.48%
- Evidence bars: 3
- Chart context: Momentum continuation (89.05)
- Suppress reason: no_strong_context_path
- Assessment: public_review_candidate_multibar_source_backed
- Best source: 2026-06-01T14:53:00.000Z; source_before_signal; lead 22m; keep; high; Binance Launches U.S. Stocks Trading and Previews bStocks Tokenized Securities
- Response: event +0.48%, max excursion to event end +0.48%, max 6h excursion +0.53%

### 2026-06-07T22:00:00.000Z to 2026-06-07T22:14:59.998Z
- ID: vnext_c_e639b7ad_20260607t2200
- Direction: observed_up
- Avg Change: +2.93%
- Evidence bars: 1
- Chart context: Range break (100)
- Suppress reason: one_bar_unconfirmed_window
- Assessment: conditional_public_review_candidate_one_bar_range_break
- Best source: 2026-06-07T17:00:00.000Z; source_before_signal; lead 300m; conditional_keep; high; Crypto Market Update: Bankman-Fried Seeks Pardon from Trump
- Response: event +2.93%, max excursion to event end +2.09%, max 6h excursion +2.09%

### 2026-06-13T21:30:00.000Z to 2026-06-13T21:44:59.998Z
- ID: vnext_c_a1f7b080_20260613t2130
- Direction: observed_up
- Avg Change: +0.7%
- Evidence bars: 1
- Chart context: Range break (100)
- Suppress reason: one_bar_unconfirmed_window
- Assessment: conditional_public_review_candidate_one_bar_range_break
- Best source: 2026-06-13T17:20:18.000Z; source_before_signal; lead 250m; keep; high; Blackrock's IBIT Leads $86 Million Bitcoin ETF Inflow as Ethereum Funds Extend Outflow Streak
- Response: event +0.7%, max excursion to event end +0.6%, max 6h excursion +0.6%

## All Audit Events

### 2026-05-21T13:30 observed_down
- ID: vnext_c_2119aa1c_20260521t1330
- Evidence window: 2026-05-21T13:30:00.000Z to 2026-05-21T13:44:59.998Z
- Avg Change: -0.71%
- Bars: 1
- Chart context: Range break (100)
- Suppress reason: one_bar_unconfirmed_window
- Closest mapped source: 2026-05-20T21:00:00.000Z; source_before_signal; lead 990m; conditional_keep; high; Weekly Market Outlook: Nvidia Earnings & FOMC Minutes
- Accepted sources within 6h: 0
- Assessment: no_accepted_source_within_6h

### 2026-05-21T17:00 observed_up
- ID: vnext_c_390c63ce_20260521t1700
- Evidence window: 2026-05-21T17:00:00.000Z to 2026-05-21T17:29:59.998Z
- Avg Change: +1.29%
- Bars: 2
- Chart context: Strong chart context (81.57)
- Suppress reason: no_prior_history_support
- Closest mapped source: None
- Accepted sources within 6h: 0
- Assessment: no_accepted_source_within_6h

### 2026-05-23T07:45 observed_down
- ID: vnext_c_58f50f6d_20260523t0745
- Evidence window: 2026-05-23T07:45:00.000Z to 2026-05-23T07:59:59.998Z
- Avg Change: -1.42%
- Bars: 1
- Chart context: Range break (100)
- Suppress reason: one_bar_unconfirmed_window
- Closest mapped source: None
- Accepted sources within 6h: 0
- Assessment: no_accepted_source_within_6h

### 2026-05-25T02:00 observed_up
- ID: vnext_c_202f8c1f_20260525t0200
- Evidence window: 2026-05-25T02:00:00.000Z to 2026-05-25T02:14:59.998Z
- Avg Change: +0.6%
- Bars: 1
- Chart context: Strong chart context (73.97)
- Suppress reason: one_bar_unconfirmed_window
- Closest mapped source: 2026-05-25T07:44:34.000Z; source_after_signal; lead 330m; demote_for_signal_cause; high; US spot Bitcoin ETFs slide on six-day outflows, 2026 inflows
- Accepted sources within 6h: 0
- Assessment: no_accepted_source_within_6h

### 2026-05-26T14:30 observed_down
- ID: vnext_c_1955bb1e_20260526t1430
- Evidence window: 2026-05-26T14:30:00.000Z to 2026-05-26T16:14:59.998Z
- Avg Change: -2.06%
- Bars: 7
- Chart context: Relief / reversal (92)
- Suppress reason: no_prior_history_support
- Closest mapped source: None
- Accepted sources within 6h: 0
- Assessment: no_accepted_source_within_6h
- Best accepted response: event +2.06%, max-to-end +0.2%, max-6h +0.06%

### 2026-05-27T17:00 observed_down
- ID: vnext_c_7bdd9b1f_20260527t1700
- Evidence window: 2026-05-27T17:00:00.000Z to 2026-05-27T17:14:59.998Z
- Avg Change: -0.64%
- Bars: 1
- Chart context: Strong chart context (73.4)
- Suppress reason: one_bar_unconfirmed_window
- Closest mapped source: 2026-05-27T14:03:59.919Z; source_before_signal; lead 176m; manual_review; high; DTCC taps Stellar (XLM) for tokenized securities network in latest Wall Street blockchain push
- Accepted sources within 6h: 0
- Assessment: no_accepted_source_within_6h

### 2026-06-01T01:00 observed_down
- ID: vnext_c_fae265e5_20260601t0100
- Evidence window: 2026-06-01T01:00:00.000Z to 2026-06-01T01:59:59.998Z
- Avg Change: -1.2%
- Bars: 4
- Chart context: Strong chart context (77.65)
- Suppress reason: no_prior_history_support
- Closest mapped source: 2026-06-01T02:19:00.769Z; source_after_signal; lead 19m; conditional_keep; medium; Crypto Daily Market Report – June 1, 2026
- Accepted sources within 6h: 0
- Assessment: no_accepted_source_within_6h

### 2026-06-01T15:15 observed_down
- ID: vnext_c_0118579a_20260601t1515
- Evidence window: 2026-06-01T15:15:00.000Z to 2026-06-01T15:59:59.998Z
- Avg Change: -0.48%
- Bars: 3
- Chart context: Momentum continuation (89.05)
- Suppress reason: no_strong_context_path
- Closest mapped source: 2026-06-01T14:53:00.000Z; source_before_signal; lead 22m; keep; high; Binance Launches U.S. Stocks Trading and Previews bStocks Tokenized Securities
- Accepted sources within 6h: 3
- Assessment: public_review_candidate_multibar_source_backed
- Best accepted response: event +0.48%, max-to-end +0.48%, max-6h +0.53%

### 2026-06-02T02:15 observed_up
- ID: vnext_c_7e978f69_20260602t0215
- Evidence window: 2026-06-02T02:15:00.000Z to 2026-06-02T02:59:59.998Z
- Avg Change: +1.03%
- Bars: 3
- Chart context: Relief / reversal (91)
- Suppress reason: no_strong_context_path
- Closest mapped source: 2026-06-02T05:09:39.411Z; source_after_signal; lead 130m; keep; medium; Bitcoin and ethereum prices today, Friday, June 5, 2026: Prices continue their descent — 5 reasons why
- Accepted sources within 6h: 0
- Assessment: no_accepted_source_within_6h
- Best accepted response: event +1.03%, max-to-end +1.9%, max-6h +1.84%

### 2026-06-03T16:15 observed_down
- ID: vnext_c_c4f71745_20260603t1615
- Evidence window: 2026-06-03T16:15:00.000Z to 2026-06-03T17:14:59.998Z
- Avg Change: -0.59%
- Bars: 4
- Chart context: Momentum continuation (79.97)
- Suppress reason: no_strong_context_path
- Closest mapped source: None
- Accepted sources within 6h: 0
- Assessment: no_accepted_source_within_6h

### 2026-06-05T13:45 observed_down
- ID: vnext_c_4d17fb96_20260605t1345
- Evidence window: 2026-06-05T13:45:00.000Z to 2026-06-05T13:59:59.998Z
- Avg Change: -1.8%
- Bars: 1
- Chart context: Moderate chart context (71.8)
- Suppress reason: one_bar_unconfirmed_window
- Closest mapped source: None
- Accepted sources within 6h: 0
- Assessment: no_accepted_source_within_6h

### 2026-06-07T22:00 observed_up
- ID: vnext_c_e639b7ad_20260607t2200
- Evidence window: 2026-06-07T22:00:00.000Z to 2026-06-07T22:14:59.998Z
- Avg Change: +2.93%
- Bars: 1
- Chart context: Range break (100)
- Suppress reason: one_bar_unconfirmed_window
- Closest mapped source: 2026-06-07T17:00:00.000Z; source_before_signal; lead 300m; conditional_keep; high; Crypto Market Update: Bankman-Fried Seeks Pardon from Trump
- Accepted sources within 6h: 3
- Assessment: conditional_public_review_candidate_one_bar_range_break
- Best accepted response: event +2.93%, max-to-end +2.09%, max-6h +2.09%

### 2026-06-10T00:30 observed_down
- ID: vnext_c_e201390e_20260610t0030
- Evidence window: 2026-06-10T00:30:00.000Z to 2026-06-10T02:44:59.998Z
- Avg Change: -1.09%
- Bars: 9
- Chart context: Momentum continuation (86.97)
- Suppress reason: no_strong_context_path
- Closest mapped source: 2026-06-10T02:26:31.975Z; inside_evidence_window; lead 0m; demote_for_signal_cause; high; Crypto Daily Market Report – June 10, 2026
- Accepted sources within 6h: 0
- Assessment: no_accepted_source_within_6h

### 2026-06-10T12:30 observed_up
- ID: vnext_c_460a2114_20260610t1230
- Evidence window: 2026-06-10T12:30:00.000Z to 2026-06-10T13:44:59.998Z
- Avg Change: +2.53%
- Bars: 5
- Chart context: Macro-aligned context (100)
- Suppress reason: no_prior_history_support
- Closest mapped source: 2026-06-10T13:32:01.000Z; inside_evidence_window; lead 0m; demote_for_signal_cause; high; US launches new strikes on targets in Iran, Bitcoin drops 2% as crypto liquidations near $1B
- Accepted sources within 6h: 0
- Assessment: no_accepted_source_within_6h

### 2026-06-12T14:45 observed_up
- ID: vnext_c_8090723c_20260612t1445
- Evidence window: 2026-06-12T14:45:00.000Z to 2026-06-12T16:14:59.998Z
- Avg Change: +0.62%
- Bars: 6
- Chart context: Range break (100)
- Suppress reason: weak_breadth
- Closest mapped source: None
- Accepted sources within 6h: 0
- Assessment: no_accepted_source_within_6h

### 2026-06-13T21:30 observed_up
- ID: vnext_c_a1f7b080_20260613t2130
- Evidence window: 2026-06-13T21:30:00.000Z to 2026-06-13T21:44:59.998Z
- Avg Change: +0.7%
- Bars: 1
- Chart context: Range break (100)
- Suppress reason: one_bar_unconfirmed_window
- Closest mapped source: 2026-06-13T17:20:18.000Z; source_before_signal; lead 250m; keep; high; Blackrock's IBIT Leads $86 Million Bitcoin ETF Inflow as Ethereum Funds Extend Outflow Streak
- Accepted sources within 6h: 2
- Assessment: conditional_public_review_candidate_one_bar_range_break
- Best accepted response: event +0.7%, max-to-end +0.6%, max-6h +0.6%

### 2026-06-15T01:30 observed_up
- ID: vnext_c_2198e7e8_20260615t0130
- Evidence window: 2026-06-15T01:30:00.000Z to 2026-06-15T03:44:59.998Z
- Avg Change: +0.78%
- Bars: 9
- Chart context: Strong chart context (72.11)
- Suppress reason: no_prior_history_support
- Closest mapped source: 2026-06-15T02:09:02.999Z; inside_evidence_window; lead 0m; demote_for_signal_cause; medium; Crypto Daily Market Report – June 15, 2026
- Accepted sources within 6h: 0
- Assessment: no_accepted_source_within_6h
- Best accepted response: event +0.78%, max-to-end +1.06%, max-6h +1.09%

### 2026-06-15T11:15 observed_up
- ID: vnext_c_1ec200ef_20260615t1115
- Evidence window: 2026-06-15T11:15:00.000Z to 2026-06-15T11:29:59.998Z
- Avg Change: +0.87%
- Bars: 1
- Chart context: Range break (100)
- Suppress reason: one_bar_unconfirmed_window
- Closest mapped source: None
- Accepted sources within 6h: 0
- Assessment: no_accepted_source_within_6h
