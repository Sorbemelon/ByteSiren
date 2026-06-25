# ByteSiren v0.2 Public Release Notes

Status: live public beta

ByteSiren v0.2 is live at https://bytesiren.pages.dev with the public API served from https://bytesiren-api.nephilim.workers.dev.

## What Is Live

- Public feed version: `v02`
- Public feed grouping: UTC day posts
- Frontend: Cloudflare Pages static Next.js export
- API: Cloudflare Worker
- Database: Cloudflare D1
- Market data: Binance public 15-minute candles
- Refresh: Cloudflare Cron, bounded Worker incremental refresh, and GitHub Actions for heavier workflow work
- Claude context: bounded Signal/Daily enrichment only

## Current Public Feed Shape

Latest release-polish smoke verified:

| Area | Current result |
| --- | --- |
| Day posts | 30 |
| Daily Overview sections | 28 |
| Market Story sections | 13 |
| Signal Event sections | 28 |
| Public Audit Events | 0 |
| Market Story source rows | 0 |
| Daily citation markup leaks | 0 |

## Claude And Source Status

The visible v0.2 Signal/Daily queue is currently backfilled.

| Item | Count |
| --- | ---: |
| `claude_briefs_v02` | 56 |
| `source_references_v02` | 195 |
| Accepted v0.2 sources | 169 |
| Rejected v0.2 sources | 26 |

Signal context status:

| Signal status | Count |
| --- | ---: |
| Focused Cause | 6 |
| Likely Cause | 8 |
| Market Backdrop | 12 |
| No Clear Cause | 2 |

Source/status alignment review:

- Focused Cause rows have focused catalyst source support.
- Likely Cause rows have focused or likely source support.
- Market Backdrop rows use backdrop or price-check sources only.
- No Clear Cause rows are source-free.
- Market Story has no Claude brief and no source references.
- Audit Events are not public feed items.

## Safety Boundaries

ByteSiren is market monitoring, not trading advice.

- Signals are detected movement windows, not predictions.
- Market Stories are deterministic chart context, not cause claims.
- Claude is not used for Market Story or Audit Event cards.
- Public responses hide raw Claude traces, tool traces, token counts, search budgets, and internal validation metadata.
- Full historical v0.2 rebuilds remain manual/backstop work outside the Worker runtime.

## Known Limits

- Source context depends on accepted Claude-backed Signal/Daily enrichment.
- Rows outside the visible public/enrichment range may remain deterministic-only.
- Market data and refresh workflows are intentionally bounded for a public portfolio app.
- This repository has no license file.

## Verified Screenshots

- [Desktop capture](assets/bytesiren-v02-live-desktop.png)
- [Mobile capture](assets/bytesiren-v02-live-mobile.png)
