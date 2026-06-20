# Catalyst / Signal Timing Audit

Generated: 2026-06-20T10:59:34.228Z

No Claude was used for this audit. It checks accepted high/medium source-support catalyst candidates with exact timestamps against current vNext-C evidence windows.

## Method

- Prefer the independent catalyst `event_time_utc` when `time_granularity` is `exact` or `hour`.
- Otherwise use the source timestamp refinement from `catalyst_time_refinements.json`.
- A source can be catalyst-like only when the timestamp is inside the Signal Event evidence window or before it.
- A source timestamp after the evidence window is classified as backdrop/explanation for that Signal Event.
- Recommended catalyst candidate rule for this audit: inside the evidence window or leading it by <=12h.

## Public Signal Events Scope

Public Signal Events compared: 23

- high: 56 exact-time sources
  - strong <=6h/inside: 8
  - reasonable 6-12h lead: 13
  - loose 12-24h lead: 4
  - after-signal backdrop: 21
  - too early/not tied: 10
- medium: 32 exact-time sources
  - strong <=6h/inside: 2
  - reasonable 6-12h lead: 6
  - loose 12-24h lead: 2
  - after-signal backdrop: 18
  - too early/not tied: 4

Lead-window rollup:

- 6h lead allowance:
  - high: 8 timing-supported, 21 after-signal backdrop, 27 too early/not tied
  - medium: 2 timing-supported, 18 after-signal backdrop, 12 too early/not tied
- 12h lead allowance:
  - high: 21 timing-supported, 21 after-signal backdrop, 14 too early/not tied
  - medium: 8 timing-supported, 18 after-signal backdrop, 6 too early/not tied
- 24h lead allowance:
  - high: 25 timing-supported, 21 after-signal backdrop, 10 too early/not tied
  - medium: 10 timing-supported, 18 after-signal backdrop, 4 too early/not tied

Recommended timing-supported catalyst candidates (<=12h): 29

## All Detected Events Scope

This secondary scope includes public Signal Events plus audit-only detected events.

Detected events compared: 41

- high: 56 exact-time sources
  - strong <=6h/inside: 15
  - reasonable 6-12h lead: 12
  - loose 12-24h lead: 6
  - after-signal backdrop: 19
  - too early/not tied: 4
- medium: 32 exact-time sources
  - strong <=6h/inside: 5
  - reasonable 6-12h lead: 5
  - loose 12-24h lead: 4
  - after-signal backdrop: 18
  - too early/not tied: 0

Lead-window rollup:

- 6h lead allowance:
  - high: 15 timing-supported, 19 after-signal backdrop, 22 too early/not tied
  - medium: 5 timing-supported, 18 after-signal backdrop, 9 too early/not tied
- 12h lead allowance:
  - high: 27 timing-supported, 19 after-signal backdrop, 10 too early/not tied
  - medium: 10 timing-supported, 18 after-signal backdrop, 4 too early/not tied
- 24h lead allowance:
  - high: 33 timing-supported, 19 after-signal backdrop, 4 too early/not tied
  - medium: 14 timing-supported, 18 after-signal backdrop, 0 too early/not tied

Recommended timing-supported catalyst candidates (<=12h): 37

## Public-Scope Timing-Supported Candidates

| Support | Decision | Catalyst | Exact time | Nearest window | Delta | Source |
|---|---|---|---|---|---:|---|
medium | strong_timing_match | BTC open interest falls to $54.69B (down 4.27% over 30 days) as leverage flushes from crypto market | 2026-05-26T07:04:56.182Z | public vnext_c_cca96e5f_20260526t1015 10:15-10:45 UTC | 190 min before | [Latest Crypto News Update - May 26, 2026](https://coinstats.app/ai/a/crypto-news-update-26-May-2026)
high | strong_timing_match | ~$1B in leveraged crypto long positions liquidated as BTC drops below $73K on Iran strike news | 2026-05-28T04:25:00.000Z | public vnext_c_1d469c0e_20260528t0315 03:15-05:30 UTC | inside | [Bitcoin drops below $73,000 as U.S. strikes on Iran spark $1 billion liquidations](https://www.coindesk.com/markets/2026/05/28/bitcoin-drops-below-usd73-000-as-us-strikes-on-iran-spark-usd1-billion-liquidations)
high | strong_timing_match | U.S. Treasury/OFAC designates IRGC-linked 'Persian Gulf Strait Authority' and sanctions Iran oil network on May 27 | 2026-05-28T04:25:42.733Z | public vnext_c_1d469c0e_20260528t0315 03:15-05:30 UTC | inside | [Bitcoin drops below $73,000 as U.S. strikes on Iran spark $1 billion liquidations](https://www.coindesk.com/markets/2026/05/28/bitcoin-drops-below-usd73-000-as-us-strikes-on-iran-spark-usd1-billion-liquidations)
high | strong_timing_match | CFTC approves first U.S.-regulated Bitcoin perpetual futures via Kalshi; issues Coinbase no-action relief | 2026-05-29T14:17:00.000Z | public vnext_c_fc005a7c_20260529t1415 14:15-14:45 UTC | inside | [U.S. CFTC opens crypto 'perp' door with first approval at regulated firm](https://www.coindesk.com/policy/2026/05/28/u-s-cftc-opens-crypto-perp-door-with-approval-of-first-regulated-firm)
high | strong_timing_match | Bitcoin hits $65,710 intraday low on June 3 as Strategy BTC sale and $1.8B in forced liquidations compound ETF outflow pressure | 2026-06-04T01:56:40.000Z | public vnext_c_dc56b382_20260604t0015 00:15-02:00 UTC | inside | [$1.2B Liquidated as Bitcoin Tests $62.5K Support Amid Sharp Crypto Selloff](https://news.bitcoin.com/1-2b-liquidated-as-bitcoin-tests-62-5k-support-amid-sharp-crypto-selloff/)
high | strong_timing_match | Trump formally announces US-Iran peace deal; MOU confirmed; oil drops sharply, BTC surges above $65,600 | 2026-06-14T22:06:25.114Z | public vnext_c_a45cf681_20260614t2115 21:15-00:15 UTC | inside | [Stocks Climb as US-Iran Deal Spurs Slide in Oil: Markets Wrap](https://www.bloomberg.com/news/articles/2026-06-14/us-futures-climb-oil-falls-on-iran-peace-deal-markets-wrap)
high | strong_timing_match | Oil falls sharply on Hormuz reopening; Fed rate-hike expectations recede, easing macro headwind for crypto | 2026-06-14T22:06:25.114Z | public vnext_c_a45cf681_20260614t2115 21:15-00:15 UTC | inside | [Stocks Climb as US-Iran Deal Spurs Slide in Oil: Markets Wrap](https://www.bloomberg.com/news/articles/2026-06-14/us-futures-climb-oil-falls-on-iran-peace-deal-markets-wrap)
medium | strong_timing_match | US May Retail Sales MoM data released June 17 ahead of FOMC decision | 2026-06-17T12:30:00.000Z | public vnext_c_e71b58af_20260617t1800 18:00-19:45 UTC | 330 min before | [Crypto Daily Market Report June 16 2026](https://www.kucoin.com/news/articles/crypto-daily-market-report-june-16-2026)
high | strong_timing_match | FOMC holds rates at 3.50–3.75%; Chair Warsh's debut press conference signals hawkish dot-plot revision | 2026-06-17T18:00:00.000Z | public vnext_c_e71b58af_20260617t1800 18:00-19:45 UTC | inside | [Live updates: Bitcoin bottom signal flashes as holders absorbed 125,000 BTC in June](https://www.coindesk.com/tech/2026/06/17/live-markets-a-bitcoin-bottom-signal-flashed-as-holders-absorbed-125-000-btc-in-june)
high | strong_timing_match | Microsoft discloses Trojan:Win32/CryptoBandits USB-spread crypto clipper malware active since February 2026 | 2026-06-17T19:44:38.000Z | public vnext_c_e71b58af_20260617t1800 18:00-19:45 UTC | inside | [Microsoft identifies malware 'worm' that hijacks crypto wallets, spreads through USB drives](https://www.coindesk.com/tech/2026/06/19/microsoft-found-malware-that-hijacks-crypto-wallets-and-spreads-through-usb-sticks)
high | reasonable_timing_match | Cascading leveraged long liquidations continue into May 23 window following May 18 $700M wipeout | 2026-05-25T15:50:39.000Z | public vnext_c_c29a0892_20260526t0030 00:30-01:45 UTC | 519 min before | [Crypto Market Today: BTC, ETH, SOL, XRP, BNB Flash Green After Sell-Off](https://www.cryptotimes.io/2026/05/25/crypto-market-today-btc-eth-sol-xrp-bnb-flash-green-after-sell-off/)
high | reasonable_timing_match | Broad crypto market posts first uniformly green session in over two weeks on May 25 as liquidations and shorts recede | 2026-05-25T15:50:39.000Z | public vnext_c_c29a0892_20260526t0030 00:30-01:45 UTC | 519 min before | [Crypto Market Today: BTC, ETH, SOL, XRP, BNB Flash Green After Sell-Off](https://www.cryptotimes.io/2026/05/25/crypto-market-today-btc-eth-sol-xrp-bnb-flash-green-after-sell-off/)
high | reasonable_timing_match | DTCC selects Stellar as first public blockchain for tokenized-securities settlement platform; XLM surges ~14–30% into May 29 | 2026-05-27T14:03:59.919Z | public vnext_c_b525c422_20260527t2130 21:30-23:30 UTC | 446 min before | [DTCC taps Stellar (XLM) for tokenized securities network in latest Wall Street blockchain push](https://www.coindesk.com/business/2026/05/27/dtcc-plans-to-bring-tokenized-assets-to-stellar-in-latest-wall-street-blockchain-push)
high | reasonable_timing_match | U.S. April PCE inflation hits near-3-year high; GDP revised down — crypto diverges from equity record highs | 2026-05-29T02:30:47.940Z | public vnext_c_fc005a7c_20260529t1415 14:15-14:45 UTC | 704 min before | [Crypto Daily Market Report – May 29, 2026](https://www.kucoin.com/news/articles/crypto-daily-market-report-may-29-2026)
medium | reasonable_timing_match | U.S.–Iran ceasefire negotiations remain unresolved; oil volatility persists into late May | 2026-05-29T02:30:47.940Z | public vnext_c_fc005a7c_20260529t1415 14:15-14:45 UTC | 704 min before | [Crypto Daily Market Report – May 29, 2026](https://www.kucoin.com/news/articles/crypto-daily-market-report-may-29-2026)
medium | reasonable_timing_match | VanEck launches first U.S. spot BNB ETF (ticker: VBNB) | 2026-05-29T02:30:47.940Z | public vnext_c_fc005a7c_20260529t1415 14:15-14:45 UTC | 704 min before | [Crypto Daily Market Report – May 29, 2026](https://www.kucoin.com/news/articles/crypto-daily-market-report-may-29-2026)
high | reasonable_timing_match | Treasury Secretary Bessent publicly urges Congress to pass CLARITY Act; passage probability rebounds to 57% | 2026-05-29T02:30:47.940Z | public vnext_c_fc005a7c_20260529t1415 14:15-14:45 UTC | 704 min before | [Crypto Daily Market Report – May 29, 2026](https://www.kucoin.com/news/articles/crypto-daily-market-report-may-29-2026)
medium | reasonable_timing_match | Grayscale submits final S-1 registration for 'Grayscale Hyperliquid Staking ETF' (GHYP), adding staking component | 2026-05-29T02:30:47.940Z | public vnext_c_fc005a7c_20260529t1415 14:15-14:45 UTC | 704 min before | [Crypto Daily Market Report – May 29, 2026](https://www.kucoin.com/news/articles/crypto-daily-market-report-may-29-2026)
medium | reasonable_timing_match | IBIT records second-largest-ever single-day outflow of $733M on May 28, coinciding with Iran strikes | 2026-05-29T06:54:52.426Z | public vnext_c_fc005a7c_20260529t1415 14:15-14:45 UTC | 440 min before | [BTC Price Today: Bitcoin Holds $73.6K Amid $223M ETF Outflow](https://phemex.com/blogs/btc-price-today-may-29-2026-bitcoin-etf-outflows)
medium | reasonable_timing_match | Hezbollah Rejects Israel Ceasefire Offer; Middle East Tensions Cited as Crypto Headwind | 2026-06-02T05:09:39.411Z | public vnext_c_1357e2a2_20260602t1415 14:15-15:30 UTC | 545 min before | [Bitcoin slides below $70,000 on Strategy's sale](https://www.coindesk.com/markets/2026/06/02/bitcoin-slide-to-usd70-000-as-stocks-pause-and-strategy-s-btc-sale-weighs-on-crypto)
high | reasonable_timing_match | Michael Saylor hints Strategy is resuming Bitcoin accumulation after first-ever sale shock | 2026-06-07T17:00:00.000Z | public vnext_c_33798218_20260608t0100 01:00-01:30 UTC | 480 min before | [Crypto: Trending News, Latest Updates, Analysis](https://www.bloomberg.com/latest/crypto)
high | reasonable_timing_match | Iran fires 11 ballistic missiles at northern Israel, breaking April ceasefire | 2026-06-09T02:26:28.000Z | public vnext_c_3870ebb2_20260609t1415 14:15-15:30 UTC | 709 min before | [Israel's Military Action Against Iran and Its Impact on Cryptocurrency Markets](https://www.valuethemarkets.com/cryptocurrency/news/israels-military-action-against-iran-and-its-impact-on-cryptocurrency-markets)
high | reasonable_timing_match | US-Iran indirect negotiations continue despite strikes; Qatar facilitates talks in Tehran on June 10 | 2026-06-11T08:08:08.000Z | public vnext_c_56cdb3f3_20260611t1715 17:15-18:00 UTC | 547 min before | [US and Iran negotiations remain on track despite overnight strikes, but crypto markets are feeling the heat](https://cryptobriefing.com/us-iran-negotiations-crypto-market-impact/)
high | reasonable_timing_match | US spot Bitcoin ETFs record historic $3.4B weekly net outflow in early June — largest since January 2024 launch | 2026-06-14T11:22:47.000Z | public vnext_c_a45cf681_20260614t2115 21:15-00:15 UTC | 592 min before | [Crypto ETF Flows June 2026: Bitcoin Outflows, XRP and Solana Rotation](https://www.spotedcrypto.com/crypto-etf-rotation-2026-bitcoin-outflows-xrp-solana/)
high | reasonable_timing_match | Intra-crypto ETF rotation: XRP and Solana ETFs absorb ~$226M combined as BTC and ETH funds bleed | 2026-06-14T11:22:47.000Z | public vnext_c_a45cf681_20260614t2115 21:15-00:15 UTC | 592 min before | [Crypto ETF Flows June 2026: Bitcoin Outflows, XRP and Solana Rotation](https://www.spotedcrypto.com/crypto-etf-rotation-2026-bitcoin-outflows-xrp-solana/)
high | reasonable_timing_match | Solana ETFs reach $1.118B cumulative inflows within weeks of May 26 launch; XRP/SOL rotation absorbs ~$226M as BTC/ETH funds bleed | 2026-06-14T11:22:47.000Z | public vnext_c_a45cf681_20260614t2115 21:15-00:15 UTC | 592 min before | [Crypto ETF Flows June 2026: Bitcoin Outflows, XRP and Solana Rotation](https://www.spotedcrypto.com/crypto-etf-rotation-2026-bitcoin-outflows-xrp-solana/)
medium | reasonable_timing_match | BlackRock BITA ETF listed June 16, fueling XRP ETF speculation and modest XRP rally | 2026-06-16T02:32:57.918Z | public vnext_c_fcff80b4_20260616t1300 13:00-14:30 UTC | 627 min before | [Crypto Daily Market Report June 16 2026](https://www.kucoin.com/news/articles/crypto-daily-market-report-june-16-2026)
high | reasonable_timing_match | SpaceX (SPCX) begins first trading day on Nasdaq after record $75B IPO; crypto capital-rotation risk and BTC treasury transparency created | 2026-06-17T08:25:52.000Z | public vnext_c_e71b58af_20260617t1800 18:00-19:45 UTC | 574 min before | [SpaceX holds 18,712 Bitcoin. Now everyone can see it move](https://crypto.news/spacex-bitcoin-treasury-ipo/)
high | reasonable_timing_match | US spot Bitcoin ETF complex bleeds $82.16M net on June 17 post-FOMC; Fidelity FBTC sole notable inflow at $14M | 2026-06-18T08:47:57.000Z | public vnext_c_1188cecc_20260618t1515 15:15-16:00 UTC | 387 min before | [Fidelity FBTC Leads Bitcoin ETF Inflows With $14M as Market Bleeds $82M Post-FOMC](https://99bitcoins.com/news/bitcoin-btc/fidelity-fbtc-leads-bitcoin-etf-inflows-post-fomc/)

## Public-Scope Loose 12-24h Candidates

| Support | Decision | Catalyst | Exact time | Nearest window | Delta | Source |
|---|---|---|---|---|---:|---|
high | loose_timing_match | Binance launches U.S. equities trading (7,000+ stocks/ETFs) and previews bStocks tokenized securities on BNB Chain | 2026-06-01T14:53:00.000Z | public vnext_c_1357e2a2_20260602t1415 14:15-15:30 UTC | 1402 min before | [Binance Launches U.S. Stocks Trading and Previews bStocks Tokenized Securities](https://www.prnewswire.com/news-releases/binance-launches-us-stocks-trading-and-previews-bstocks-tokenized-securities-302787226.html)
high | loose_timing_match | Strategy's First Net BTC Sale Since 2022 Continues to Weigh on Market Sentiment Through June 4–5 | 2026-06-04T18:07:40.000Z | public vnext_c_c54de378_20260605t0715 07:15-07:45 UTC | 787 min before | [Bitcoin is weathering its ugliest week in months as narrative fades and liquidity rotates](https://www.cnbc.com/2026/06/04/bitcoin-is-weathering-its-ugliest-week-in-months-as-narrative-fades-and-liquidity-rotates.html)
high | loose_timing_match | CLARITY Act Placed on Senate Legislative Calendar June 1, but Full Senate Passage Prospects Remain Uncertain | 2026-06-04T18:07:40.000Z | public vnext_c_c54de378_20260605t0715 07:15-07:45 UTC | 787 min before | [Bitcoin is weathering its ugliest week in months as narrative fades and liquidity rotates](https://www.cnbc.com/2026/06/04/bitcoin-is-weathering-its-ugliest-week-in-months-as-narrative-fades-and-liquidity-rotates.html)
medium | loose_timing_match | Speculative Capital Rotates Out of Crypto Into SpaceX IPO and AI/Chip Trades | 2026-06-04T18:07:40.000Z | public vnext_c_c54de378_20260605t0715 07:15-07:45 UTC | 787 min before | [Bitcoin is weathering its ugliest week in months as narrative fades and liquidity rotates](https://www.cnbc.com/2026/06/04/bitcoin-is-weathering-its-ugliest-week-in-months-as-narrative-fades-and-liquidity-rotates.html)
medium | loose_timing_match | US Treasury freezes ~$344M in crypto linked to Iran's Strait of Hormuz BTC toll-collection scheme; Nobitex sanctioned June 2 | 2026-06-11T00:18:59.000Z | public vnext_c_56cdb3f3_20260611t1715 17:15-18:00 UTC | 1016 min before | [Iran closes Strait of Hormuz and launches missile attacks as US-Iran conflict reshapes crypto markets](https://cryptobriefing.com/iran-strait-hormuz-bitcoin-crypto-impact/)
high | loose_timing_match | Bybit/Binance tokenized SpaceX IPO subscription closes June 11; spot trading set for June 12 — but xStocks fails to deliver allocations | 2026-06-14T09:00:56.000Z | public vnext_c_a45cf681_20260614t2115 21:15-00:15 UTC | 734 min before | [Crypto Platforms Sold Users on SpaceX IPO Access. The Tokenized Stocks Never Arrived](https://gizmodo.com/crypto-platforms-sold-users-on-spacex-ipo-access-the-tokenized-stocks-never-arrived-2000771535)

## Public-Scope After-Signal Backdrops

| Support | Decision | Catalyst | Exact time | Nearest window | Delta | Source |
|---|---|---|---|---|---:|---|
high | backdrop_after_signal | Spot Bitcoin ETFs extend multi-week outflow streak; 2026 net inflows collapse to $536M | 2026-05-25T07:44:34.000Z | public vnext_c_d38f7b57_20260524t2115 21:15-21:45 UTC | 600 min after | [US spot Bitcoin ETFs slide on six-day outflows, 2026 inflows](https://en.cryptonomist.ch/2026/05/25/us-spot-bitcoin-etfs-outflows-2026/)
medium | backdrop_after_signal | U.S. Memorial Day holiday on May 26 closes equity markets, thinning crypto liquidity during geopolitical flare-up | 2026-05-26T02:13:40.637Z | public vnext_c_c29a0892_20260526t0030 00:30-01:45 UTC | 29 min after | [Crypto Daily Market Report – May 26, 2026](https://www.kucoin.com/news/articles/crypto-daily-market-report-may-26-2026)
high | backdrop_after_signal | U.S. military strikes Iranian air-defense and drone sites near Strait of Hormuz over three-day window (May 25–28) | 2026-05-26T11:20:16.602Z | public vnext_c_cca96e5f_20260526t1015 10:15-10:45 UTC | 35 min after | [Bitcoin (BTC) ETFs crushed by outflows as bond market stifles interest-rate reduction hopes: Crypto Daily](https://www.coindesk.com/daybook-us/2026/05/26/bitcoin-etfs-crushed-by-billions-in-outflows-as-treasuries-stifle-interest-rate-cut-hopes)
high | backdrop_after_signal | Spot Bitcoin ETFs record $1.26B weekly outflow — largest of 2026 — as Treasury yields signal higher-for-longer rates | 2026-05-26T11:20:16.602Z | public vnext_c_cca96e5f_20260526t1015 10:15-10:45 UTC | 35 min after | [Bitcoin (BTC) ETFs crushed by outflows as bond market stifles interest-rate reduction hopes: Crypto Daily](https://www.coindesk.com/daybook-us/2026/05/26/bitcoin-etfs-crushed-by-billions-in-outflows-as-treasuries-stifle-interest-rate-cut-hopes)
medium | backdrop_after_signal | U.S. April Core PCE and revised Q1 GDP releases on May 28 awaited as key Fed-rate-path signals | 2026-05-26T11:20:16.602Z | public vnext_c_cca96e5f_20260526t1015 10:15-10:45 UTC | 35 min after | [Bitcoin (BTC) ETFs crushed by outflows as bond market stifles interest-rate reduction hopes: Crypto Daily](https://www.coindesk.com/daybook-us/2026/05/26/bitcoin-etfs-crushed-by-billions-in-outflows-as-treasuries-stifle-interest-rate-cut-hopes)
high | backdrop_after_signal | U.S. spot Bitcoin ETFs record ~$1.4B in weekly outflows in final week of May; 10-day outflow streak noted | 2026-05-31T09:27:10.000Z | public vnext_c_fc005a7c_20260529t1415 14:15-14:45 UTC | 2562 min after | [Crypto Market Recap: Trump Kills U.S. CBDC; $8B Seized in FBI Operation; Paxos Becomes First Blockchain Clearing Agency (May 24–30, 2026)](https://www.banklesstimes.com/articles/2026/05/31/crypto-market-recap-trump-kills-u-s-cbdc-8b-seized-in-fbi-operation-paxos-becomes-first-blockchain-clearing-agency-and-more-may-24-30-2026/)
medium | backdrop_after_signal | FBI seizes ~127,000 BTC (~$8B) in largest U.S. crypto forfeiture ever via Operation Blackout | 2026-05-31T09:27:10.000Z | public vnext_c_fc005a7c_20260529t1415 14:15-14:45 UTC | 2562 min after | [Crypto Market Recap: Trump Kills U.S. CBDC; $8B Seized in FBI Operation; Paxos Becomes First Blockchain Clearing Agency (May 24–30, 2026)](https://www.banklesstimes.com/articles/2026/05/31/crypto-market-recap-trump-kills-u-s-cbdc-8b-seized-in-fbi-operation-paxos-becomes-first-blockchain-clearing-agency-and-more-may-24-30-2026/)
medium | backdrop_after_signal | Japan FSA begins regulating foreign trust-type stablecoins as electronic payment methods | 2026-05-31T11:53:00.000Z | public vnext_c_fc005a7c_20260529t1415 14:15-14:45 UTC | 2708 min after | [Weekly Preview – Binance US Stocks, Microsoft Build, FOMC Speakers](https://www.panewslab.com/en/articles/019e7de2-a48e-76bd-8cea-5e9a7fb97047)
medium | backdrop_after_signal | Fed voters Kashkari (Minneapolis) and Harker (Cleveland) both speak on monetary policy on June 2, adding rate-path uncertainty | 2026-05-31T11:53:00.000Z | public vnext_c_fc005a7c_20260529t1415 14:15-14:45 UTC | 2708 min after | [Weekly Preview – Binance US Stocks, Microsoft Build, FOMC Speakers](https://www.panewslab.com/en/articles/019e7de2-a48e-76bd-8cea-5e9a7fb97047)
high | backdrop_after_signal | US Spot Bitcoin ETF 13-Day, $4.4B Outflow Streak Ends June 4–5 After Record Redemption Pressure | 2026-06-04T07:04:09.343Z | public vnext_c_6c394e07_20260604t0300 03:00-03:45 UTC | 199 min after | [Crypto Market Update June 04, 2026](https://coinstats.app/ai/a/crypto-news-update-04-June-2026)
medium | backdrop_after_signal | ~$1.75–1.84B in Crypto Liquidations in 24 Hours; BTC Open Interest Drops 22% | 2026-06-04T07:04:09.343Z | public vnext_c_6c394e07_20260604t0300 03:00-03:45 UTC | 199 min after | [Crypto Market Update June 04, 2026](https://coinstats.app/ai/a/crypto-news-update-04-June-2026)
medium | backdrop_after_signal | Ethereum Spot ETFs Record $429.3M in 7-Day Outflows Heading Into June 4–6 | 2026-06-04T07:04:09.343Z | public vnext_c_6c394e07_20260604t0300 03:00-03:45 UTC | 199 min after | [Crypto Market Update June 04, 2026](https://coinstats.app/ai/a/crypto-news-update-04-June-2026)
medium | backdrop_after_signal | Toncoin Falls 13.5% on June 4 After Post-Telegram 'Gram' Rebrand Announcement Profit-Taking | 2026-06-04T07:04:09.343Z | public vnext_c_6c394e07_20260604t0300 03:00-03:45 UTC | 199 min after | [Crypto Market Update June 04, 2026](https://coinstats.app/ai/a/crypto-news-update-04-June-2026)
high | backdrop_after_signal | US May Nonfarm Payrolls Printed 172K vs. 85K Consensus, Reinforcing Fed Hold Narrative | 2026-06-05T08:30:00.000Z | public vnext_c_c54de378_20260605t0715 07:15-07:45 UTC | 45 min after | [The Employment Situation — May 2026](https://www.bls.gov/news.release/empsit.nr0.htm)
medium | backdrop_after_signal | French regulator warns unlicensed crypto firms serving EU customers face prosecution under MiCA enforcement | 2026-06-08T06:30:41.000Z | public vnext_c_33798218_20260608t0100 01:00-01:30 UTC | 301 min after | [This Week in Crypto Law (May 30, 2026)](https://news.bitcoin.com/this-week-in-crypto-law-may-30-2026/)
high | backdrop_after_signal | Strategy's June 1 BTC sale (32 BTC) continues to depress sentiment entering June 7 week | 2026-06-08T09:32:01.000Z | public vnext_c_33798218_20260608t0100 01:00-01:30 UTC | 482 min after | [Crypto Market Update: June 8th 2026](https://blog.quidax.io/crypto-market-update-week-ending-june-7th-2026/)
medium | backdrop_after_signal | Capital rotation from crypto to AI equities cited as structural headwind entering June 7 week | 2026-06-08T09:32:01.000Z | public vnext_c_33798218_20260608t0100 01:00-01:30 UTC | 482 min after | [Crypto Market Update: June 8th 2026](https://blog.quidax.io/crypto-market-update-week-ending-june-7th-2026/)
high | backdrop_after_signal | Over $1 billion in crypto liquidations triggered by Israel-Iran escalation on June 8 | 2026-06-08T09:32:01.000Z | public vnext_c_33798218_20260608t0100 01:00-01:30 UTC | 482 min after | [Crypto Market Update: June 8th 2026](https://blog.quidax.io/crypto-market-update-week-ending-june-7th-2026/)
high | backdrop_after_signal | Strategy officially purchases 1,550 BTC for ~$100M, growing total holdings to 845,256 BTC | 2026-06-08T12:06:09.000Z | public vnext_c_33798218_20260608t0100 01:00-01:30 UTC | 636 min after | [Saylor's Strategy Resumes Bitcoin Accumulation Spree After Last Week's Sale](https://cryptopotato.com/saylors-strategy-resumes-bitcoin-accumulation-spree-after-last-weeks-sale/)
high | backdrop_after_signal | Israel launches retaliatory airstrikes on Iranian military and petrochemical targets; ceasefire collapses | 2026-06-09T15:37:31.000Z | public vnext_c_3870ebb2_20260609t1415 14:15-15:30 UTC | 8 min after | [Israel halts attacks on Iran amid diplomatic efforts, triggering crypto market whiplash](https://cryptobriefing.com/israel-halts-iran-attacks-crypto-liquidations/)
high | backdrop_after_signal | S&P 500 drops 2.2% intraday on geopolitical shock; crypto weakens in tandem, reflecting fragile risk appetite | 2026-06-10T02:26:31.975Z | public vnext_c_3870ebb2_20260609t1415 14:15-15:30 UTC | 657 min after | [Crypto Daily Market Report – June 10, 2026](https://www.kucoin.com/news/articles/crypto-daily-market-report-june-10-2026)
medium | backdrop_after_signal | US May PPI and weekly jobless claims released June 11 — scheduled macro data event for risk sentiment | 2026-06-10T02:26:31.975Z | public vnext_c_3870ebb2_20260609t1415 14:15-15:30 UTC | 657 min after | [Crypto Daily Market Report – June 10, 2026](https://www.kucoin.com/news/articles/crypto-daily-market-report-june-10-2026)
high | backdrop_after_signal | US Central Command launches new strikes on Iranian military targets on June 10, escalating conflict | 2026-06-10T13:32:01.000Z | public vnext_c_3870ebb2_20260609t1415 14:15-15:30 UTC | 1322 min after | [Iran strikes US bases in Bahrain and Jordan as Middle East conflict escalates](https://cryptobriefing.com/iran-strikes-us-bases-crypto-market-impact/)
medium | backdrop_after_signal | SEC approves T. Rowe Price actively managed multi-asset crypto ETF covering up to 15 digital assets | 2026-06-15T02:09:02.999Z | public vnext_c_a45cf681_20260614t2115 21:15-00:15 UTC | 114 min after | [Crypto Daily Market Report – June 15, 2026](https://www.kucoin.com/news/articles/crypto-daily-market-report-june-15-2026)
medium | backdrop_after_signal | CFTC formally upgrades crypto quasi-perpetual futures to true perpetual contracts with compliance pathway | 2026-06-15T02:09:02.999Z | public vnext_c_a45cf681_20260614t2115 21:15-00:15 UTC | 114 min after | [Crypto Daily Market Report – June 15, 2026](https://www.kucoin.com/news/articles/crypto-daily-market-report-june-15-2026)
high | backdrop_after_signal | US–Iran ceasefire and Strait of Hormuz reopening framework lifts risk sentiment early in the window | 2026-06-16T21:00:00.000Z | public vnext_c_fcff80b4_20260616t1300 13:00-14:30 UTC | 390 min after | [Prediction Markets Have Already Decided The FOMC Outcome](https://blockchainreporter.net/prediction-markets-have-already-decided-the-fomc-outcome-heres-how-crypto-could-react)
medium | backdrop_after_signal | Bank of Japan raises policy rate to 1.0%, highest in 31 years, ahead of FOMC | 2026-06-17T02:12:34.948Z | public vnext_c_fcff80b4_20260616t1300 13:00-14:30 UTC | 703 min after | [Crypto Daily Market Report – June 17, 2026](https://www.kucoin.com/news/articles/crypto-daily-market-report-june-17-2026)
medium | backdrop_after_signal | MARA adds 1,000 BTC; Circle mints $1B USDC on Solana with $3.5B weekly issuance | 2026-06-17T02:12:34.948Z | public vnext_c_fcff80b4_20260616t1300 13:00-14:30 UTC | 703 min after | [Crypto Daily Market Report – June 17, 2026](https://www.kucoin.com/news/articles/crypto-daily-market-report-june-17-2026)
medium | backdrop_after_signal | Dubai VARA updates AML guidelines requiring crypto firms to integrate real-time FATF blacklist screening | 2026-06-17T02:12:34.948Z | public vnext_c_fcff80b4_20260616t1300 13:00-14:30 UTC | 703 min after | [Crypto Daily Market Report – June 17, 2026](https://www.kucoin.com/news/articles/crypto-daily-market-report-june-17-2026)
high | backdrop_after_signal | Strategy STRC and Strive SATA digital credit products suffer leverage liquidation selloff on June 18 | 2026-06-18T19:36:11.000Z | public vnext_c_1188cecc_20260618t1515 15:15-16:00 UTC | 216 min after | [Strategy's investors are may be rotating out of its preferred stock for another crypto rival](https://www.coindesk.com/markets/2026/06/16/here-is-why-strategy-s-dividend-paying-crypto-stock-is-crashing-to-near-historic-lows)
high | backdrop_after_signal | Microsoft Discloses CryptoBandits USB-Worm Malware Targeting Crypto Wallets via Clipboard Hijacking | 2026-06-19T08:48:00.000Z | public vnext_c_1188cecc_20260618t1515 15:15-16:00 UTC | 1008 min after | [Microsoft identifies malware 'worm' that hijacks crypto wallets, spreads through USB drives](https://www.coindesk.com/tech/2026/06/19/microsoft-found-malware-that-hijacks-crypto-wallets-and-spreads-through-usb-sticks)
high | backdrop_after_signal | Iran-Switzerland Peace Memorandum Signing Postponed Indefinitely After Israeli Lebanon Airstrikes | 2026-06-19T10:13:35.000Z | public vnext_c_1188cecc_20260618t1515 15:15-16:00 UTC | 1094 min after | [Crypto Market Today June 19, 2026 \| Bitcoin $62,328](https://blockchainreporter.net/crypto-market-today-june-19-2026-bitcoin-62328-iran-signing-collapses/)
high | backdrop_after_signal | Fed June FOMC Hawkish Dot Plot Residual Pressure: 9 Officials Project 2026 Rate Hike | 2026-06-19T10:13:35.000Z | public vnext_c_1188cecc_20260618t1515 15:15-16:00 UTC | 1094 min after | [Crypto Market Today June 19, 2026 \| Bitcoin $62,328](https://blockchainreporter.net/crypto-market-today-june-19-2026-bitcoin-62328-iran-signing-collapses/)
high | backdrop_after_signal | CLARITY Act Remains on Senate Floor Calendar; White House Targets July 4 Signing — XRP Commodity Classification Key Outcome | 2026-06-19T10:13:35.000Z | public vnext_c_1188cecc_20260618t1515 15:15-16:00 UTC | 1094 min after | [Crypto Market Today June 19, 2026 \| Bitcoin $62,328](https://blockchainreporter.net/crypto-market-today-june-19-2026-bitcoin-62328-iran-signing-collapses/)
medium | backdrop_after_signal | Long-Term BTC Holders Absorb 125,000 BTC in June; Strategy Holds 846,842 BTC | 2026-06-19T10:13:35.000Z | public vnext_c_1188cecc_20260618t1515 15:15-16:00 UTC | 1094 min after | [Crypto Market Today June 19, 2026 \| Bitcoin $62,328](https://blockchainreporter.net/crypto-market-today-june-19-2026-bitcoin-62328-iran-signing-collapses/)
high | backdrop_after_signal | U.S. spot Bitcoin ETF 13-day, ~$4.4B net outflow streak peaks through June 3 — longest redemption run since January 2024 launch | 2026-06-19T11:36:41.000Z | public vnext_c_1188cecc_20260618t1515 15:15-16:00 UTC | 1177 min after | [Bitcoin ETF Inflows June 2026: IBIT Ends Record Outflow Streak](https://www.spotedcrypto.com/bitcoin-etf-outflows-june-2026-ibit-recovery/)
high | backdrop_after_signal | US Clarity Act Senate Banking Committee passage (May 14) remains active regulatory backdrop shaping crypto market structure sentiment through June 10–12 | 2026-06-19T11:36:41.000Z | public vnext_c_1188cecc_20260618t1515 15:15-16:00 UTC | 1177 min after | [Bitcoin ETF Inflows June 2026: IBIT Ends Record Outflow Streak](https://www.spotedcrypto.com/bitcoin-etf-outflows-june-2026-ibit-recovery/)
high | backdrop_after_signal | Franklin Templeton Files SEC Registration for Two 'Bitcoin DRIP' ETFs That Reinvest Stock Dividends Into BTC | 2026-06-19T20:00:00.000Z | public vnext_c_1188cecc_20260618t1515 15:15-16:00 UTC | 1680 min after | [Bitcoin BTC Price — Robinhood](https://robinhood.com/us/en/crypto/BTC/)
medium | backdrop_after_signal | Stronger US dollar and elevated rate expectations suppress crypto risk appetite on June 8 | 2026-06-19T20:05:00.000Z | public vnext_c_1188cecc_20260618t1515 15:15-16:00 UTC | 1685 min after | [Crypto Market Update: Bankman-Fried Seeks Pardon from Trump](https://investingnews.com/cryptocurrency-market-recap/)

## Interpretation

- High/medium source support is a source-quality score, not proof that the source caused a specific Signal Event.
- Exact timestamp alignment matters: source before/inside signal = catalyst-like; source after signal = backdrop/explanation.
- The 12-24h bucket can still be useful for day-level context, but should not be treated as a strong event catalyst without manual review.
