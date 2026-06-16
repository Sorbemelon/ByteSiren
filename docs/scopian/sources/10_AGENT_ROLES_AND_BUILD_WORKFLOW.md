---
project: ByteSiren
source_id: BS-SRC-10
title: Agent Roles and Build Workflow
status: frozen_source
version: phase0-source-of-truth-v1
last_updated: 2026-06-16
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Any change to frozen decisions requires a Scopian Scope Buffer decision before implementation.
depends_on: [BS-SRC-00]
---

# Agent Roles and Build Workflow

## Working style

ByteSiren should be built with a source-of-truth-first, phased workflow similar to the user’s CentralDocs style:

```text
Plan clearly.
Implement one phase at a time.
Respect frozen scope.
Verify after each phase.
Report changed files, commands, status, and limits.
Use Scopian for scope guard.
Use CrossHelix for repo memory.
Use Claude Code only for UI.
Use Codex for backend/core unless the project owner delegates core detector/docs work here.
```

## Agent role split

### Codex

Owns:

```text
Cloudflare Worker backend
D1 schema and migrations
Binance ingestion
v2.2 detector implementation
incident grouping and suppression
Claude enrichment integration
source filtering and validation
API endpoints
cron jobs
retention cleanup
tests / smoke checks
repo wiring
```

Codex must not own polished UI design decisions.

Codex must not change:

```text
product scope
v2.2 detector thresholds
Variant A UI design
public labels/disclaimer rules
source display policy
Claude cause/context gate
```

### Claude Code

Owns UI implementation only:

```text
Next.js one-page layout
Variant A Terminal Split Layout
ChartPanel
IntelligenceFeedPanel
Feed rows with Evidence | Claude Brief | Sources
clickable source chips
expanded rows
bottom accordions
responsive design
accessibility
SEO metadata and static visible copy
visual polish using the approved theme
```

Claude Code must not change backend logic, detector rules, data model semantics, or API contract.

### CrossHelix

Use for repo memory/context integrity:

```text
crosshelix init
crosshelix refresh --quick / --repo
crosshelix map status
crosshelix brief
crosshelix note / decision after important implementation milestones
```

Purpose:

```text
preserve repo map
track current implementation state
avoid repeated context loss
support Codex/Claude handoff
```

### Scopian

Use for scope guard:

```text
Register docs/scopian/sources as source documents.
Generate/refresh scope view.
Record Scope Buffer decisions for changes.
Run scope checks before implementation where practical.
```

Scopian should guard:

```text
one public page only
no trading advice
no wallet/login/trade execution
top five symbols only
past 30 days only
Cloudflare stack
v2.2 detector baseline
Variant A layout
Claude cause/context gate
hidden rejected sources
no public Claude budget display
orange as subtle brand accent only
```

### Impeccable frontend skill

Use with Claude Code UI work for:

```text
visual hierarchy
compact terminal layout
dark-mode polish
source-chip readability
feed row density
responsive behavior
accessibility
microcopy consistency
```

It must not invent product features.

## Required phase report format

Every implementation agent should end each phase with:

```text
Status: PASS / PASS_WITH_LIMITS / NEEDS_FIX / BLOCKED

Changed files:
- ...

What was implemented:
- ...

Verification commands run:
- ...

What passed:
- ...

Known limits:
- ...

Next recommended phase:
- ...
```

## Scope change policy

If an agent wants to add or change anything outside the source pack, it must stop and ask.

Examples requiring approval:

```text
adding login/auth
adding wallet connection
adding extra symbols
adding WebSocket data
adding futures/open-interest data
changing detector thresholds
changing Claude source policy
showing public budget/quota
adding additional pages
turning analysis into trading signal wording
```

## Prompt template for Codex

```text
You are Codex working on ByteSiren.
Implement Phase <X> only.
Read docs/scopian/sources/ first, especially:
- 01_PRODUCT_SPEC.md
- 02_SIGNAL_ENGINE_V2_2.md
- 03_CLAUDE_ENRICHMENT_POLICY.md
- 04_CLOUDFLARE_ARCHITECTURE_AND_API.md
- 05_DATA_MODEL_D1_RETENTION.md

Do not change frozen product decisions.
Do not implement UI polish beyond placeholders unless explicitly requested.
Use Cloudflare Workers + D1 + TypeScript.
Return changed files, commands run, verification result, known limits, and next phase.
```

## Prompt template for Claude Code

```text
You are Claude Code working on ByteSiren UI only.
Use the Impeccable frontend skill.
Read docs/scopian/sources/ first, especially:
- 06_UI_UX_VARIANT_A_SPEC.md
- 07_VISUAL_THEME_AND_BRAND.md
- 08_SEO_SPEC.md
- 09_SAFETY_DISCLAIMER_COPY.md

Implement the approved Variant A Terminal Split Layout.
Do not alter backend logic, detector rules, API contracts, or source policy.
Return changed files, UI behavior summary, responsive/accessibility notes, verification, and known limits.
```

## Commit style

Use concise conventional commits, e.g.:

```text
chore: add bytesiren source-of-truth docs
feat: add cloudflare worker foundation
feat: ingest binance market candles
feat: implement v2.2 signal detector
feat: add claude incident enrichment
feat: build bytesiren terminal UI
fix: tighten source chip accessibility
```
