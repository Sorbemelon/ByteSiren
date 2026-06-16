---
project: ByteSiren
source_id: BS-SRC-08
title: SEO Specification
status: frozen_source
version: phase0-source-of-truth-v1
last_updated: 2026-06-16
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Any change to frozen decisions requires a Scopian Scope Buffer decision before implementation.
depends_on: [BS-SRC-01, BS-SRC-06, BS-SRC-07]
---

# ByteSiren SEO Specification

## SEO goal

ByteSiren should be discoverable as a portfolio-grade AI crypto market intelligence project, without sounding like a trading-signal product.

Target concepts:

```text
AI crypto market intelligence dashboard
crypto market anomaly detection
Claude Web Search crypto analysis
Binance public API crypto monitor
read-only crypto market intelligence
crypto market event detection dashboard
```

Avoid positioning:

```text
crypto trading signals
best buy sell crypto signals
AI price prediction
Bitcoin price target
trading bot
```

## Page title

Preferred:

```text
ByteSiren — AI Crypto Market Intelligence Dashboard
```

Shorter alternative:

```text
ByteSiren | AI Crypto Market Intelligence
```

## Meta description

```text
ByteSiren monitors Binance public crypto market data, detects broad market anomalies, and uses Claude Web Search to provide cited public context. Read-only and not financial advice.
```

## H1

```text
ByteSiren
```

## H2 sections

Use crawlable semantic section headings:

```text
AI Crypto Market Intelligence Monitor
Market Chart
Intelligence Feed
How to read ByteSiren
What the scores mean
Data sources and timing
Limitations and disclaimer
```

## Static crawlable page copy

Include this text in the rendered HTML, preferably near the bottom accordions or a compact explanation section:

```text
ByteSiren is a read-only AI crypto market intelligence dashboard. It monitors BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, and XRPUSDT using Binance public market data. It detects unusual market-wide movement from 15-minute candles and uses Claude Web Search to attach cited public context.

ByteSiren is designed for market awareness, not trading advice. It does not provide buy, sell, hold, long, short, price target, or automated trading recommendations.
```

## Next.js metadata

Use the Next.js Metadata API in `app/layout.tsx` or equivalent.

Suggested metadata:

```ts
export const metadata = {
  title: 'ByteSiren — AI Crypto Market Intelligence Dashboard',
  description:
    'ByteSiren monitors Binance public crypto market data, detects broad market anomalies, and uses Claude Web Search to provide cited public context. Read-only and not financial advice.',
  alternates: {
    canonical: 'https://<domain>/'
  },
  openGraph: {
    title: 'ByteSiren — AI Crypto Market Intelligence Dashboard',
    description:
      'Read-only AI crypto market intelligence using Binance public data and Claude Web Search.',
    url: 'https://<domain>/',
    siteName: 'ByteSiren',
    type: 'website',
    images: ['/opengraph-image.png']
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ByteSiren — AI Crypto Market Intelligence',
    description:
      'A read-only AI crypto market intelligence dashboard using Binance public data and Claude Web Search.',
    images: ['/twitter-image.png']
  }
};
```

Replace `<domain>` when the real deployment URL is known.

## Open Graph image

Create:

```text
app/opengraph-image.png
app/twitter-image.png
```

OG image text:

```text
ByteSiren
AI Crypto Market Intelligence
Binance public data · Claude Web Search · Read-only
```

Use the full logo-name image or logo mark with live text. The orange gradient can be more visible in OG than in the app UI.

## Icons

Create or provide:

```text
favicon.ico
icon.png
apple-icon.png
```

Use the logo mark. Check readability at small sizes.

## Sitemap

Create `app/sitemap.ts`.

MVP sitemap includes one URL:

```text
/
```

If future public documentation pages are added, include them later.

## Robots

Create `app/robots.ts`.

Policy:

```text
Allow: /
Disallow: /api/
Disallow: /debug/
Sitemap: https://<domain>/sitemap.xml
```

## Structured data

Use JSON-LD in the page or layout.

Recommended schema:

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "ByteSiren",
  "applicationCategory": "FinanceApplication",
  "operatingSystem": "Web",
  "description": "A read-only AI crypto market intelligence dashboard using Binance public market data and Claude Web Search.",
  "creator": {
    "@type": "Person",
    "name": "Methus Klaewkla"
  }
}
```

Ensure visible page content matches structured data claims.

## Link policy

Accepted source chips are editorial/source links and should be clickable.

Use:

```html
<a href="..." target="_blank" rel="noopener noreferrer">CoinDesk</a>
```

Do not show rejected sources publicly.

Do not add `nofollow` to accepted editorial source links unless the project owner specifically decides to avoid association with a source.

## Image alt text

Logo alt:

```text
ByteSiren AI Crypto Market Intelligence
```

If a static chart/dashboard image is used:

```text
ByteSiren crypto market intelligence dashboard showing market-wide anomaly detection
```

## Do not use meta keywords

Do not add a keywords meta tag. Use natural visible content and semantic metadata instead.

## SEO QA checklist

```text
Page has exactly one clear H1.
Title and meta description are unique and clear.
Static description is visible/crawlable.
OG and Twitter images exist.
Sitemap exists.
Robots file exists.
JSON-LD matches visible page content.
No trading-signal keywords are emphasized.
No meta keywords tag.
Source links are real clickable links.
Full disclaimer exists in visible HTML.
```
