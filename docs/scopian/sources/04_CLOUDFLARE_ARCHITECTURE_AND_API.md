---
project: ByteSiren
source_id: BS-SRC-04
title: Cloudflare Architecture and Public API Contract
status: frozen_source
version: phase0-source-of-truth-v1
last_updated: 2026-06-16
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Any change to frozen decisions requires a Scopian Scope Buffer decision before implementation.
depends_on: [BS-SRC-01, BS-SRC-02, BS-SRC-03]
---

# Cloudflare Architecture and Public API Contract

## Stack

```text
Frontend: Cloudflare Pages + Next.js static export
Backend/API/jobs: Cloudflare Workers TypeScript
Scheduler: Cloudflare Workers Cron Triggers
Database: Cloudflare D1
Secrets: Cloudflare Worker secrets
Market data: Binance public market-data-only API
AI: Claude API with Web Search
```

No Docker is needed for the MVP.

## High-level architecture

```text
Cloudflare Cron Trigger
  -> Worker scheduled() handler
  -> Binance public market data fetch
  -> D1 candle upsert
  -> v2.2 detector
  -> incident grouping/suppression
  -> queued Claude enrichment
  -> D1 brief/source storage

Cloudflare Pages
  -> static Next.js app
  -> calls Worker read-only public API
  -> renders chart + Intelligence Feed
```

## Recommended repository structure

```text
bytesiren/
  apps/
    web/
      src/
        app/
          page.tsx
          layout.tsx
          sitemap.ts
          robots.ts
          opengraph-image.png
          twitter-image.png
        components/
        lib/
    worker/
      src/
        index.ts
        routes/
        jobs/
        services/
        db/
        types/
  docs/
    scopian/
      sources/
  package.json
  pnpm-workspace.yaml
  wrangler.toml
```

## Worker responsibilities

```text
Serve public read-only API endpoints.
Run scheduled jobs.
Fetch Binance market data.
Store candles/features/incidents/briefs/sources in D1.
Run detector and grouping logic.
Call Claude enrichment only for queued final candidates.
Apply source filtering and output validation.
Run cleanup for 31-day retention.
```

## Public endpoints

Keep the public API small.

```text
GET /api/health
GET /api/market/latest
GET /api/market/candles?symbol=BTCUSDT
GET /api/intelligence/feed
```

Do not expose mutation endpoints publicly.

## `GET /api/health`

Purpose: deployment and uptime smoke check.

Response:

```json
{
  "ok": true,
  "service": "bytesiren-worker",
  "version": "phase0-mvp",
  "checked_at": "2026-06-16T00:00:00Z"
}
```

## `GET /api/market/latest`

Purpose: chart header and symbol tab indicators.

Response:

```json
{
  "updated_at": "2026-06-16T00:00:00Z",
  "symbols": [
    {
      "symbol": "BTCUSDT",
      "display_symbol": "BTC",
      "last_price": 64775.2,
      "change_15m_pct": 1.2,
      "change_24h_pct": 4.8,
      "state": "calm",
      "included_in_selected_incident": false,
      "data_status": "fresh"
    }
  ]
}
```

Allowed `state` values:

```text
calm
moving
in_event
strong_move
data_delay
```

## `GET /api/market/candles?symbol=BTCUSDT`

Purpose: TradingView Lightweight Charts.

Requirements:

```text
Symbol must be one of the five allowed pairs.
Return last 30 days of 15m candles.
Return data sorted ascending by time.
Do not return older than 30 days.
```

Response:

```json
{
  "symbol": "BTCUSDT",
  "interval": "15m",
  "range_days": 30,
  "candles": [
    {
      "time": "2026-06-14T21:15:00Z",
      "open": 63000.0,
      "high": 65000.0,
      "low": 62800.0,
      "close": 64775.2,
      "volume": 123.45,
      "quote_volume": 8000000.0
    }
  ],
  "markers": [
    {
      "incident_id": "bs_20260614_market_up_all5",
      "time": "2026-06-14T21:15:00Z",
      "direction": "observed_up",
      "ui_label": "Focused Cause",
      "selected": false
    }
  ]
}
```

## `GET /api/intelligence/feed`

Purpose: primary frontend data source for Intelligence Feed.

Response includes all visible incidents for the past 30 days, newest first. The frontend should not need to stitch together brief/source/evidence data from multiple endpoints for the main feed.

Top-level response:

```json
{
  "updated_at": "2026-06-16T00:00:00Z",
  "range_days": 30,
  "signal_window": "15m",
  "baseline_window": "24h",
  "items": []
}
```

Feed item shape:

```json
{
  "incident_id": "bs_20260614_market_up_all5",
  "detected_at": "2026-06-14T21:15:00Z",
  "display_date": "Jun 14",
  "scope": "market_wide",
  "direction": "observed_up",
  "symbols": ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"],
  "tags": ["same_day_context"],
  "evidence": {
    "signal_window": "15m",
    "baseline_window": "24h",
    "summary": "15m signal · 5/5 pairs · Observed Up · Strong Move 100",
    "breadth_label": "5/5 pairs",
    "severity_score": 100,
    "severity_label": "Strong Move",
    "avg_15m_change_pct": 2.4,
    "peak_symbol": "SOLUSDT"
  },
  "brief": {
    "status": "brief_ready",
    "catalyst_status": "cause_supported",
    "label": "Focused Cause",
    "summary": "Same-day reports linked the broad crypto rally to geopolitical easing.",
    "confidence": "high",
    "price_context_check": "minor_mismatch"
  },
  "sources": [
    {
      "publisher": "CoinDesk",
      "title": "Source title",
      "url": "https://example.com/source",
      "published_at": "2026-06-14",
      "used_for": "focused_catalyst"
    }
  ],
  "expanded_details": {
    "symbol_evidence": [],
    "claude_context": {},
    "caveats": []
  }
}
```

Limited state item:

```json
{
  "brief": {
    "status": "analysis_limited",
    "catalyst_status": null,
    "label": "Claude Limited",
    "summary": "Claude analysis is limited in this free public project. The context will be shown when analysis is available.",
    "confidence": null,
    "price_context_check": null
  },
  "sources": []
}
```

## API validation

All public inputs must be validated.

```text
symbol must be one of five allowed symbols
range is fixed at 30 days for MVP
interval is fixed at 15m for MVP
unknown query params should be ignored or rejected consistently
```

## API cache guidance

Public read endpoints may use short cache headers if suitable:

```text
/api/market/latest: short cache, e.g. 30–60s
/api/market/candles: cache until next poll window
/api/intelligence/feed: short cache, e.g. 60s
```

Do not cache errors as successful responses.

## Cron schedule

Recommended:

```text
*/5 * * * *      poll Binance and detect
*/15 * * * *     enrich queued incidents with Claude
17 0 * * *       cleanup records older than 31 days
```

Worker `scheduled()` handler must route based on cron expression.

## Idempotency requirements

```text
Candle upsert key = symbol + interval + open_time
Feature upsert key = symbol + interval + open_time
Raw event key = deterministic event id or open_time + scope + direction + symbol set
Incident key = incident_key
Brief key = incident_id + analysis_mode
Source key = brief_id + normalized URL
```

Cron retry/overlap must not create duplicate feed rows or duplicate briefs.

## Error states

Worker should represent these statuses for UI:

```text
market_data_delay
queued_for_analysis
analysis_limited
analyzing
brief_ready
context_only
none_found
failed_retryable
failed_final
```

## Security and secrets

```text
Claude API key must be a Worker secret.
Do not expose Claude API key to frontend.
No Binance key is needed for public market-data-only endpoints.
Do not store raw Claude search HTML.
Do not store user data; MVP has no user accounts.
```

## Rate and failure behavior

```text
If Binance fetch fails, keep latest successful data and mark data_delay.
If Claude fails due to limit, mark analysis_limited or failed_retryable.
If Claude output JSON fails validation, retry once or mark failed_retryable.
If source filtering rejects all sources, allow second search if policy permits.
```
