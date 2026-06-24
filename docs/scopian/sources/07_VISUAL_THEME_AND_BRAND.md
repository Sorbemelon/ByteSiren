---
project: ByteSiren
source_id: BS-SRC-07
title: Visual Theme and Brand System
status: frozen_source
version: phase0-source-of-truth-v1
last_updated: 2026-06-16
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Any change to frozen decisions requires a Scopian Scope Buffer decision before implementation.
depends_on: [BS-SRC-06]
---

# ByteSiren Visual Theme and Brand System

## Visual north star

ByteSiren should feel like:

```text
Dark crypto intelligence terminal
with violet AI/interface accents
and a subtle orange siren-brand glow from the logo
```

It should not feel like a hype-heavy trading signal app.

## Final frozen theme rule

```text
Orange is brand presence.
Violet is interface control.
Emerald/rose is market direction.
Teal/emerald is evidence confidence.
Slate/navy is the product base.
```

## Logo assets

Expected source asset files:

```text
assets/bytesiren_logo_transparent.png
assets/bytesiren_logo-name_transparent.png
```

Usage:

```text
App header: logo mark + live text
Favicon/app icon: logo mark only
README/portfolio/OG image: full logo-name image
```

The full wordmark is wide; prefer mark + live text inside the compact app header.

## Logo color extraction

Logo gradient approximates:

```text
Deep ember:     #FE4000
Siren orange:   #FE7203
Core orange:    #FE9303
Warm amber:     #FEA800
Signal yellow:  #FEB500
White wordmark: #FFFFFF
```

## CSS tokens

```css
:root {
  --bg-page: #070A12;
  --bg-page-top: #0B1020;
  --bg-panel: #0D1324;
  --bg-panel-soft: #111827;
  --bg-row: #101729;
  --border-panel: rgba(148, 163, 184, 0.16);
  --border-panel-hover: rgba(139, 92, 246, 0.45);

  --text-primary: #E5E7EB;
  --text-secondary: #94A3B8;
  --text-muted: #64748B;

  --accent-primary: #8B5CF6;
  --accent-secondary: #22D3EE;

  --up: #10B981;
  --down: #F43F5E;
  --two-sided: #A78BFA;

  --status-calm: #64748B;
  --status-moving: #3B82F6;
  --status-in-event: #8B5CF6;
  --status-strong: #F59E0B;
  --status-severe: #F97316;

  --cause-focused: #10B981;
  --cause-likely: #14B8A6;
  --context-backdrop: #64748B;
  --none-found: #94A3B8;
  --claude-limited: #8B5CF6;

  --brand-logo-orange-deep: #FE4000;
  --brand-logo-orange: #FE7203;
  --brand-logo-ember: #FE9303;
  --brand-logo-amber: #FEA800;
  --brand-logo-yellow: #FEB500;
  --brand-logo-glow-soft: rgba(254, 114, 3, 0.14);
  --brand-logo-glow-medium: rgba(254, 147, 3, 0.22);
  --brand-logo-border-soft: rgba(254, 147, 3, 0.24);
}
```

Brand gradient:

```css
--brand-logo-gradient: linear-gradient(135deg, #FE4000 0%, #FE7203 35%, #FEA800 70%, #FEB500 100%);
```

## Page background

Use subtle dual glow:

```css
background:
  radial-gradient(circle at 8% 6%, rgba(254, 114, 3, 0.10), transparent 28%),
  radial-gradient(circle at 78% 12%, rgba(139, 92, 246, 0.12), transparent 32%),
  #070A12;
```

The orange glow must remain subtle and local to brand presence.

## Where to use orange

Use orange only in:

```text
logo
soft glow near logo
tiny selected incident marker outer glow
selected row mini-accent at low opacity
OG/social preview image
very subtle loading shimmer, optional
```

Do not use orange for:

```text
all buttons
all panel borders
all feed rows
Claude Focused Cause
Likely Cause
source chips by default
chart tabs by default
```

## Panel style

```text
background: #0D1324
border: 1px solid rgba(148, 163, 184, 0.16)
border-radius: 22px
padding: 16px
shadow: subtle dark shadow
```

Hover:

```text
border slightly brighter, preferably violet-tinted
no dramatic glow
```

## Header

Logo mark size:

```text
desktop: 32–40px
mobile: 28–32px
```

Header text:

```text
ByteSiren: 28–32px, weight 700, tight letter spacing
Subtitle: 13–14px, secondary text
Safety pill: 12px, violet outline
Updated timestamp: 12–13px, muted
```

## Chart styles

```text
Selected symbol tab: violet border/fill
Unselected tabs: slate border/text
Symbol included in selected event: tiny violet dot
Strong move symbol: tiny amber dot
Observed up marker: emerald
Observed down marker: rose
Market day marker: violet diamond
Selected marker: direction color + subtle orange outer glow
```

## Feed row styles

```text
background: #101729
border: 1px solid rgba(148, 163, 184, 0.12)
border-radius: 16px
padding: 12px
row gap: 8px
```

Selected row:

```text
border: rgba(139, 92, 246, 0.75)
box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.18)
small orange accent line allowed at low opacity
```

Left accent by Claude label:

```text
Focused Cause: emerald
Likely Cause: teal
Market Backdrop: brown
No Clear Cause: slate
Claude Limited: violet
```

## Source chips

```text
font-size: 11px
padding: 4px 7px
border-radius: 999px
border: 1px solid role color
background: transparent or low-opacity fill
```

Role colors:

```text
focused_catalyst: emerald outline
likely_cause: teal outline
backdrop: lighter brown outline
price_check: amber outline
```

## Claude Limited card

```text
background: rgba(139, 92, 246, 0.08)
border: rgba(139, 92, 246, 0.25)
backdrop-filter: blur(8px)
```

The text must remain readable.

## Typography

Preferred fonts:

```text
Geist Sans
Inter
IBM Plex Sans
```

Recommended default:

```text
Geist Sans
```

Scale:

```text
Page title: 28–32px
Subtitle: 13–14px
Panel title: 16–18px
Feed row main: 13px
Feed row secondary: 12px
Chip: 11–12px
Expanded table: 12px
Accordion body: 13–14px
```

Weights:

```text
Page title: 700
Panel heading: 600
Row label: 600
Metric: 500
Secondary: 400
```

## Spacing

```text
Page padding desktop: 24px
Page padding mobile: 14–16px
Panel gap: 16px
Panel padding: 16px
Feed row padding: 12px
Chip gap: 6px
Row gap: 8px
Accordion gap: 8px
```

## Accessibility

```text
Always pair colors with text.
Use visible focus rings.
Do not rely on orange/red/green alone.
Ensure source chips and feed rows are keyboard accessible.
```
