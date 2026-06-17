---
generated_by: scopian
generator_schema: v0.2-B
view: main
generated_at: 2026-06-17T21:30:09+07:00
non_canonical: true
generated_mode: single
canonical_inputs:
  - VIEW.md
  - selected Scope Sources
  - approved Scope Buffer
  - context.yml
  - source_registry.yml
input_hashes:
  view: sha256:4da761ebd11c
  sources: sha256:b6052568ac58
  buffer: sha256:11e7a1a3d36e
  context: sha256:5ef45bc1a5d7
  registry: sha256:e1ba5e257ab6
---

# Generated Scope View

## Non-Canonical Notice

This file is generated and non-canonical.
Canonical scope comes from VIEW.md, selected Scope Sources, approved Scope Buffer records, context.yml, and source_registry.yml.
Regenerate with `scopian view refresh` after source or buffer changes.

## Active Scope View

- view: main
- view_path: docs/scopian/views/main/VIEW.md
- generated_at: 2026-06-17T21:30:09+07:00

## Selected Sources

- docs/scopian/sources/00_SOURCE_INDEX.md (sha256:3abe408fc27b31aa455f63c07f60d6a2e456ba072035d5bec7006187369bc0ce)
- docs/scopian/sources/01_PRODUCT_SPEC.md (sha256:5e1166ce582094a06466cc038086a6de0a117a5fa2a69880d23a60ea5e21d8f7)
- docs/scopian/sources/02_SIGNAL_ENGINE_V2_2.md (sha256:6ee10db5ff934f5552c83fcad278e7c3e2ee2e981031f6b2e88ee68aa7e5bdbf)
- docs/scopian/sources/03_CLAUDE_ENRICHMENT_POLICY.md (sha256:99989ebd89a29d2bacf928768770d2f9fce828ddfc3dba7cfdd225a165bccbaf)
- docs/scopian/sources/04_CLOUDFLARE_ARCHITECTURE_AND_API.md (sha256:37ba31db575ffe35d0a45c8d11d6673578104b08697b0ba86dc194e5ec282b78)
- docs/scopian/sources/05_DATA_MODEL_D1_RETENTION.md (sha256:5a0b20dc06b930686f5637f3233c17107af1413f481739f316131d89b7454ee6)
- docs/scopian/sources/06_UI_UX_VARIANT_A_SPEC.md (sha256:9626f814df5a410628a0f8423da9f8a95c4d28929560a0d454d58bd3a3969fcb)
- docs/scopian/sources/07_VISUAL_THEME_AND_BRAND.md (sha256:f8fb5996946571a10ba53becd99d0f75e0334929c6b2a29c810c0045a3a236e9)
- docs/scopian/sources/08_SEO_SPEC.md (sha256:42a9519fe8deeb3e807f0c30a6624edbe48299928fd65072310e8f3d72d5a1f3)
- docs/scopian/sources/09_SAFETY_DISCLAIMER_COPY.md (sha256:1c74e905b5c7b81e7ff8840fb002567d3a51a5f84b42ba003c6d6fe45f09e077)
- docs/scopian/sources/10_AGENT_ROLES_AND_BUILD_WORKFLOW.md (sha256:477e680400f61ce878050aac5f0bc0272fd46bafc565c4c16f8f764cce02f4fe)
- docs/scopian/sources/11_BUILD_PLAN_AND_VERIFICATION.md (sha256:ac29e166d9304ad26097d7828e68947cdd2ec6f728b5c48e7bff4e659723b432)
- docs/scopian/sources/12_CLAUDE_PRODUCTION_PROMPT.md (sha256:3195035b0510a3568b8a45ae204407e589271f2568763c58aa730183c58afde4)
- docs/scopian/sources/13_IMPLEMENTATION_PROMPT_TEMPLATES.md (sha256:f59fa372b1951fe6b9d256070b31d84f906321a750a31e6a428918fe3eee6803)
- docs/scopian/sources/14_DEPLOYMENT_BOUNDARIES.md (sha256:314087d5866f15255072fbe69e4594e4d1b0d62a131db207cf8e2a5483b9f0e5)
- PRODUCT.md (sha256:3c5250318e0bac61af2f8f54cd64356a08bce30afceaf7463a188549b0e30fdd)
- docs/scopian/sources/15_DEPLOYMENT_CHECKLIST.md (sha256:b37db8ea1f5b38995f992523b8ca75d6e2ea80694ab72422a52975f2eed5522e)

## Approved Buffer Summary

- 2026-06-17T01:12:59+07:00 DEC-20260617-0112-user-header-orange-wordmark-FPDE: User approved keeping the 'Siren' header wordmark as the orange logo-gradient (background-clip:text), an accepted deviation from the loc ... (docs/scopian/views/main/buffer/decisions/DEC-20260617-0112-user-header-orange-wordmark-FPDE.md)
- 2026-06-17T01:13:04+07:00 DEC-20260617-0113-user-muted-contrast-aa-5W8M: User approved lifting --text-muted and --context-backdrop from #64748b to #828ea1 (~3.9:1 -> ~5.5:1) to meet WCAG AA for small text on d ... (docs/scopian/views/main/buffer/decisions/DEC-20260617-0113-user-muted-contrast-aa-5W8M.md)
- 2026-06-17T03:10:35+07:00 DEC-20260617-0310-user-feed-wording-public-context-PHJ5: User instructed renaming the feed column 'Claude Brief' -> 'Public Context' and the expanded 'Claude context' -> 'Context Details' to be ... (docs/scopian/views/main/buffer/decisions/DEC-20260617-0310-user-feed-wording-public-context-PHJ5.md)
- 2026-06-17T03:10:37+07:00 DEC-20260617-0310-user-feed-wording-tracked-pairs-5GQQ: User instructed changing breadth wording '5/5 pairs' -> 'All 5 tracked pairs' / 'N of 5 tracked pairs' for clarity. Display derived from ... (docs/scopian/views/main/buffer/decisions/DEC-20260617-0310-user-feed-wording-tracked-pairs-5GQQ.md)

## Scope Checklist

| Item ID | Scope Signal | Scope Item | Refs | Flags | Implementation Evidence |
|---|---|---|---|---|---|
| ITEM-likely-in-scope-a-worker-and-d1-setup-aa1abe13 | likely_in_scope | A. Worker and D1 setup | docs/scopian/sources/15_DEPLOYMENT_CHECKLIST.md#a-worker-and-d1-setup | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-accepted-source-link-shape-9a1bf6f7 | likely_in_scope | Accepted source link shape | docs/scopian/sources/03_CLAUDE_ENRICHMENT_POLICY.md#accepted-source-link-shape | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-api-validation-db24fb39 | likely_in_scope | API validation | docs/scopian/sources/04_CLOUDFLARE_ARCHITECTURE_AND_API.md#api-validation | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-build-readiness-decision-d6e4e0a1 | likely_in_scope | Build-readiness decision | docs/scopian/sources/01_PRODUCT_SPEC.md#build-readiness-decision | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-claude-limited-behavior-a6bb7e2c | likely_in_scope | Claude limited behavior | docs/scopian/sources/03_CLAUDE_ENRICHMENT_POLICY.md#claude-limited-behavior | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-data-input-1732f372 | likely_in_scope | Data input | docs/scopian/sources/02_SIGNAL_ENGINE_V2_2.md#data-input | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-expandedfeedrow-c76f0827 | likely_in_scope | ExpandedFeedRow | docs/scopian/sources/06_UI_UX_VARIANT_A_SPEC.md#expandedfeedrow | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-feed-row-styles-2994f7f1 | likely_in_scope | Feed row styles | docs/scopian/sources/07_VISUAL_THEME_AND_BRAND.md#feed-row-styles | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-future-single-symbol-routes-not-2ed48120 | likely_in_scope | Future single-symbol routes, not used for MVP auto-search | docs/scopian/sources/03_CLAUDE_ENRICHMENT_POLICY.md#future-single-symbol-routes-not-used-for-mvp-auto-search | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-get-api-health-492e7a94 | likely_in_scope | `GET /api/health` | docs/scopian/sources/04_CLOUDFLARE_ARCHITECTURE_AND_API.md#get-api-health | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-get-api-market-candles-symbol-bt-d086ac14 | likely_in_scope | `GET /api/market/candles?symbol=BTCUSDT` | docs/scopian/sources/04_CLOUDFLARE_ARCHITECTURE_AND_API.md#get-api-market-candles-symbol-btcusdt | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-get-api-market-latest-caaacfe2 | likely_in_scope | `GET /api/market/latest` | docs/scopian/sources/04_CLOUDFLARE_ARCHITECTURE_AND_API.md#get-api-market-latest | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-goals-4d25ec3f | likely_in_scope | Goals | docs/scopian/sources/05_DATA_MODEL_D1_RETENTION.md#goals | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-machine-readable-helper-files-d11070f3 | likely_in_scope | Machine-readable helper files | docs/scopian/sources/00_SOURCE_INDEX.md#machine-readable-helper-files | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-mvp-scope-b4888c07 | likely_in_scope | MVP scope | docs/scopian/sources/01_PRODUCT_SPEC.md#mvp-scope | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-phase-2-market-ingestion-and-ret-1243d10d | likely_in_scope | Phase 2 — Market ingestion and retention | docs/scopian/sources/11_BUILD_PLAN_AND_VERIFICATION.md#phase-2-market-ingestion-and-retention | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-query-route-hints-31d35ade | likely_in_scope | Query route hints | docs/scopian/sources/12_CLAUDE_PRODUCTION_PROMPT.md#query-route-hints | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-selected-layout-46f571e9 | likely_in_scope | Selected layout | docs/scopian/sources/06_UI_UX_VARIANT_A_SPEC.md#selected-layout | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-sitemap-5bac33e7 | likely_in_scope | Sitemap | docs/scopian/sources/08_SEO_SPEC.md#sitemap | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-suppression-rules-2155a135 | likely_in_scope | Suppression rules | docs/scopian/sources/02_SIGNAL_ENGINE_V2_2.md#suppression-rules | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-user-approved-lifting-text-muted-55031b97 | likely_in_scope | User approved lifting --text-muted and --context-backdrop from #64748b to #828ea1 (~3.9:1 -> ~5.5:1) to meet WCAG AA for small text on d ... | docs/scopian/views/main/buffer/decisions/DEC-20260617-0113-user-muted-contrast-aa-5W8M.md | approved_buffer | not_checked_in_generated_view |
| ITEM-likely-in-scope-user-instructed-changing-breadth-856a6102 | likely_in_scope | User instructed changing breadth wording '5/5 pairs' -> 'All 5 tracked pairs' / 'N of 5 tracked pairs' for clarity. Display derived from ... | docs/scopian/views/main/buffer/decisions/DEC-20260617-0310-user-feed-wording-tracked-pairs-5GQQ.md | approved_buffer | not_checked_in_generated_view |
| ITEM-likely-in-scope-user-instructed-renaming-the-fee-dcab955c | likely_in_scope | User instructed renaming the feed column 'Claude Brief' -> 'Public Context' and the expanded 'Claude context' -> 'Context Details' to be ... | docs/scopian/views/main/buffer/decisions/DEC-20260617-0310-user-feed-wording-public-context-PHJ5.md | approved_buffer | not_checked_in_generated_view |
| ITEM-likely-in-scope-version-5a350958 | likely_in_scope | Version | docs/scopian/sources/02_SIGNAL_ENGINE_V2_2.md#version | none | not_checked_in_generated_view |
| ITEM-likely-in-scope-web-search-domain-filter-guidanc-8c16d913 | likely_in_scope | Web Search domain filter guidance | docs/scopian/sources/03_CLAUDE_ENRICHMENT_POLICY.md#web-search-domain-filter-guidance | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-accessibility-requirements-6ca0a2f5 | allowed_with_limits | Accessibility requirements | docs/scopian/sources/06_UI_UX_VARIANT_A_SPEC.md#accessibility-requirements | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-allowed-public-wording-05648528 | allowed_with_limits | Allowed public wording | docs/scopian/sources/09_SAFETY_DISCLAIMER_COPY.md#allowed-public-wording | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-app-local-configs-05b525a1 | allowed_with_limits | App-local configs | docs/scopian/sources/14_DEPLOYMENT_BOUNDARIES.md#app-local-configs | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-approved-poc-validation-baseline-f76043f6 | allowed_with_limits | Approved PoC / validation baseline | docs/scopian/sources/00_SOURCE_INDEX.md#approved-poc-validation-baseline | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-b-pages-setup-c67fa2da | allowed_with_limits | B. Pages setup | docs/scopian/sources/15_DEPLOYMENT_CHECKLIST.md#b-pages-setup | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-bottom-full-disclaimer-afb73ee1 | allowed_with_limits | Bottom full disclaimer | docs/scopian/sources/09_SAFETY_DISCLAIMER_COPY.md#bottom-full-disclaimer | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-briefcell-8676e17d | allowed_with_limits | BriefCell | docs/scopian/sources/06_UI_UX_VARIANT_A_SPEC.md#briefcell | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-bytesiren-phase-0-source-of-trut-05c904ec | allowed_with_limits | ByteSiren Phase 0 Source-of-Truth Pack | docs/scopian/sources/00_SOURCE_INDEX.md#bytesiren-phase-0-source-of-truth-pack | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-c-cors-readiness-05f45586 | allowed_with_limits | C. CORS readiness | docs/scopian/sources/15_DEPLOYMENT_CHECKLIST.md#c-cors-readiness | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-cache-policy-0b684636 | allowed_with_limits | Cache policy | docs/scopian/sources/03_CLAUDE_ENRICHMENT_POLICY.md#cache-policy | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-claude-4c6bd3d1 | allowed_with_limits | Claude | docs/scopian/sources/11_BUILD_PLAN_AND_VERIFICATION.md#claude | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-claude-code-phase-5-prompt-ui-06-37790fee | allowed_with_limits | Claude Code Phase 5 prompt — UI: 06_UI_UX_VARIANT_A_SPEC.md; 07_VISUAL_THEME_AND_BRAND.md; 08_SEO_SPEC.md; 09_SAFETY_DISCLAIMER_COPY.md | docs/scopian/sources/13_IMPLEMENTATION_PROMPT_TEMPLATES.md#claude-code-phase-5-prompt-ui | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-claude-limited-card-b36a02a6 | allowed_with_limits | Claude Limited card | docs/scopian/sources/07_VISUAL_THEME_AND_BRAND.md#claude-limited-card | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-claude-web-search-domain-filters-6151b637 | allowed_with_limits | Claude Web Search domain filters | docs/scopian/sources/14_DEPLOYMENT_BOUNDARIES.md#claude-web-search-domain-filters | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-d-security-checks-9dc34b1e | allowed_with_limits | D. Security checks | docs/scopian/sources/15_DEPLOYMENT_CHECKLIST.md#d-security-checks | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-d1-boundary-0f9d7659 | allowed_with_limits | D1 boundary | docs/scopian/sources/14_DEPLOYMENT_BOUNDARIES.md#d1-boundary | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-data-source-note-c8a424f4 | allowed_with_limits | Data source note | docs/scopian/sources/09_SAFETY_DISCLAIMER_COPY.md#data-source-note | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-deployment-resources-1ba6435f | allowed_with_limits | Deployment resources | docs/scopian/sources/04_CLOUDFLARE_ARCHITECTURE_AND_API.md#deployment-resources | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-design-principles-206253ea | allowed_with_limits | Design Principles | PRODUCT.md#design-principles | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-desktop-wireframe-683eb886 | allowed_with_limits | Desktop wireframe | docs/scopian/sources/06_UI_UX_VARIANT_A_SPEC.md#desktop-wireframe | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-detector-3597d56c | allowed_with_limits | Detector | docs/scopian/sources/11_BUILD_PLAN_AND_VERIFICATION.md#detector | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-environment-ownership-6060a3d6 | allowed_with_limits | Environment ownership | docs/scopian/sources/04_CLOUDFLARE_ARCHITECTURE_AND_API.md#environment-ownership | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-event-focused-search-requirement-896d58a1 | allowed_with_limits | Event-focused search requirement | docs/scopian/sources/03_CLAUDE_ENRICHMENT_POLICY.md#event-focused-search-requirement | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-external-reference-urls-verified-4bc20bcb | allowed_with_limits | External reference URLs verified during planning | docs/scopian/sources/00_SOURCE_INDEX.md#external-reference-urls-verified-during-planning | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-f-post-deploy-monitoring-e1571320 | allowed_with_limits | F. Post-deploy monitoring | docs/scopian/sources/15_DEPLOYMENT_CHECKLIST.md#f-post-deploy-monitoring | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-frozen-decisions-summary-368b963d | allowed_with_limits | Frozen decisions summary | docs/scopian/sources/00_SOURCE_INDEX.md#frozen-decisions-summary | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-general-rules-for-all-prompts-0d1a44bc | allowed_with_limits | General rules for all prompts | docs/scopian/sources/13_IMPLEMENTATION_PROMPT_TEMPLATES.md#general-rules-for-all-prompts | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-headerbar-b999474e | allowed_with_limits | HeaderBar | docs/scopian/sources/06_UI_UX_VARIANT_A_SPEC.md#headerbar | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-high-level-architecture-69790859 | allowed_with_limits | High-level architecture | docs/scopian/sources/04_CLOUDFLARE_ARCHITECTURE_AND_API.md#high-level-architecture | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-how-to-read-copy-ae5a57e8 | allowed_with_limits | How-to-read copy | docs/scopian/sources/09_SAFETY_DISCLAIMER_COPY.md#how-to-read-copy | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-if-only-broader-context-found-ec0892ae | allowed_with_limits | If only broader context found | docs/scopian/sources/12_CLAUDE_PRODUCTION_PROMPT.md#if-only-broader-context-found | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-included-07c8fcd2 | allowed_with_limits | Included | docs/scopian/sources/01_PRODUCT_SPEC.md#included | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-interactions-9ecb50cd | allowed_with_limits | Interactions | docs/scopian/sources/06_UI_UX_VARIANT_A_SPEC.md#interactions | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-local-env-ownership-2dc83d90 | allowed_with_limits | Local env ownership | docs/scopian/sources/14_DEPLOYMENT_BOUNDARIES.md#local-env-ownership | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-locked-project-constraints-4351263c | allowed_with_limits | Locked project constraints | docs/scopian/sources/01_PRODUCT_SPEC.md#locked-project-constraints | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-logo-assets-8ffb511f | allowed_with_limits | Logo assets | docs/scopian/sources/07_VISUAL_THEME_AND_BRAND.md#logo-assets | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-meta-description-6ee13576 | allowed_with_limits | Meta description | docs/scopian/sources/08_SEO_SPEC.md#meta-description | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-next-js-metadata-5b0ae45d | allowed_with_limits | Next.js metadata | docs/scopian/sources/08_SEO_SPEC.md#next-js-metadata | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-open-graph-image-5216a2ca | allowed_with_limits | Open Graph image | docs/scopian/sources/08_SEO_SPEC.md#open-graph-image | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-page-background-2b23867e | allowed_with_limits | Page background | docs/scopian/sources/07_VISUAL_THEME_AND_BRAND.md#page-background | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-phase-4-claude-enrichment-a5559d37 | allowed_with_limits | Phase 4 — Claude enrichment | docs/scopian/sources/11_BUILD_PLAN_AND_VERIFICATION.md#phase-4-claude-enrichment | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-phase-4c-live-claude-smoke-basel-0cc65236 | allowed_with_limits | Phase 4C live Claude smoke baseline | docs/scopian/sources/00_SOURCE_INDEX.md#phase-4c-live-claude-smoke-baseline | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-phase-5-ui-implementation-7ab719d5 | allowed_with_limits | Phase 5 — UI implementation | docs/scopian/sources/11_BUILD_PLAN_AND_VERIFICATION.md#phase-5-ui-implementation | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-post-processing-requirements-5d2850aa | allowed_with_limits | Post-processing requirements | docs/scopian/sources/12_CLAUDE_PRODUCTION_PROMPT.md#post-processing-requirements | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-product-identity-a2010428 | allowed_with_limits | Product identity | docs/scopian/sources/01_PRODUCT_SPEC.md#product-identity | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-product-page-structure-f867a21f | allowed_with_limits | Product page structure | docs/scopian/sources/01_PRODUCT_SPEC.md#product-page-structure | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-product-purpose-01bc1350 | allowed_with_limits | Product Purpose | PRODUCT.md#product-purpose | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-production-env-ownership-00b86492 | allowed_with_limits | Production env ownership | docs/scopian/sources/14_DEPLOYMENT_BOUNDARIES.md#production-env-ownership | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-prompt-template-for-claude-code-5e4d5b55 | allowed_with_limits | Prompt template for Claude Code: 06_UI_UX_VARIANT_A_SPEC.md; 07_VISUAL_THEME_AND_BRAND.md; 08_SEO_SPEC.md; 09_SAFETY_DISCLAIMER_COPY.md | docs/scopian/sources/10_AGENT_ROLES_AND_BUILD_WORKFLOW.md#prompt-template-for-claude-code | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-public-summary-wording-292d1368 | allowed_with_limits | Public summary wording | docs/scopian/sources/03_CLAUDE_ENRICHMENT_POLICY.md#public-summary-wording | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-public-ui-summary-constraints-1a6f2c7d | allowed_with_limits | Public UI summary constraints | docs/scopian/sources/12_CLAUDE_PRODUCTION_PROMPT.md#public-ui-summary-constraints | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-purpose-e8e4b104 | allowed_with_limits | Purpose | docs/scopian/sources/02_SIGNAL_ENGINE_V2_2.md#purpose | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-rate-and-failure-behavior-9d0282dd | allowed_with_limits | Rate and failure behavior | docs/scopian/sources/04_CLOUDFLARE_ARCHITECTURE_AND_API.md#rate-and-failure-behavior | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-scopian-7d2b6bd6 | allowed_with_limits | Scopian | docs/scopian/sources/10_AGENT_ROLES_AND_BUILD_WORKFLOW.md#scopian | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-search-count-policy-3ddb5dc4 | allowed_with_limits | Search count policy | docs/scopian/sources/03_CLAUDE_ENRICHMENT_POLICY.md#search-count-policy | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-security-and-secrets-e079f592 | allowed_with_limits | Security and secrets | docs/scopian/sources/04_CLOUDFLARE_ARCHITECTURE_AND_API.md#security-and-secrets | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-seo-goal-cafb4b4f | allowed_with_limits | SEO goal | docs/scopian/sources/08_SEO_SPEC.md#seo-goal | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-source-display-safety-d3209f2d | allowed_with_limits | Source display safety | docs/scopian/sources/09_SAFETY_DISCLAIMER_COPY.md#source-display-safety | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-source-quality-policy-1fab3ad8 | allowed_with_limits | Source quality policy | docs/scopian/sources/03_CLAUDE_ENRICHMENT_POLICY.md#source-quality-policy | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-sourcechipcell-17580cda | allowed_with_limits | SourceChipCell | docs/scopian/sources/06_UI_UX_VARIANT_A_SPEC.md#sourcechipcell | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-stack-b2c86ae4 | allowed_with_limits | Stack | docs/scopian/sources/04_CLOUDFLARE_ARCHITECTURE_AND_API.md#stack | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-static-crawlable-page-copy-dbb3ea37 | allowed_with_limits | Static crawlable page copy | docs/scopian/sources/08_SEO_SPEC.md#static-crawlable-page-copy | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-structured-data-10a12de0 | allowed_with_limits | Structured data | docs/scopian/sources/08_SEO_SPEC.md#structured-data | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-symbol-elevated-rule-e012366f | allowed_with_limits | Symbol elevated rule | docs/scopian/sources/02_SIGNAL_ENGINE_V2_2.md#symbol-elevated-rule | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-symbol-tabs-7ba74ccf | allowed_with_limits | Symbol tabs | docs/scopian/sources/06_UI_UX_VARIANT_A_SPEC.md#symbol-tabs | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-system-prompt-this-is-not-a-trad-dad7f86a | allowed_with_limits | System prompt: This is NOT a trading app.; Do NOT provide financial advice.; Do NOT provide buy, sell, hold, long, short, entry, exit, stop-loss, take-profi ... | docs/scopian/sources/12_CLAUDE_PRODUCTION_PROMPT.md#system-prompt | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-tags-27c456ea | allowed_with_limits | Tags | docs/scopian/sources/05_DATA_MODEL_D1_RETENTION.md#tags | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-tool-behavior-b3e8a175 | allowed_with_limits | Tool behavior | docs/scopian/sources/12_CLAUDE_PRODUCTION_PROMPT.md#tool-behavior | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-top-compact-safety-pill-b882e74c | allowed_with_limits | Top compact safety pill | docs/scopian/sources/09_SAFETY_DISCLAIMER_COPY.md#top-compact-safety-pill | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-ui-f4964ec8 | allowed_with_limits | UI | docs/scopian/sources/11_BUILD_PLAN_AND_VERIFICATION.md#ui | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-user-approved-keeping-the-siren-a9cd4f89 | allowed_with_limits | User approved keeping the 'Siren' header wordmark as the orange logo-gradient (background-clip:text), an accepted deviation from the loc ... | docs/scopian/views/main/buffer/decisions/DEC-20260617-0112-user-header-orange-wordmark-FPDE.md | approved_buffer | not_checked_in_generated_view |
| ITEM-allowed-with-limits-user-prompt-template-cause-suppo-ff2eb9ae | allowed_with_limits | User prompt template: cause_supported => UI label Focused Cause; cause_likely => UI label Likely Cause; context_only => UI label Market Backdrop; none_found ... | docs/scopian/sources/12_CLAUDE_PRODUCTION_PROMPT.md#user-prompt-template | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-when-to-call-claude-40241b1e | allowed_with_limits | When to call Claude | docs/scopian/sources/03_CLAUDE_ENRICHMENT_POLICY.md#when-to-call-claude | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-where-to-use-orange-4cf1933e | allowed_with_limits | Where to use orange | docs/scopian/sources/07_VISUAL_THEME_AND_BRAND.md#where-to-use-orange | none | not_checked_in_generated_view |
| ITEM-allowed-with-limits-worker-responsibilities-1d668606 | allowed_with_limits | Worker responsibilities | docs/scopian/sources/04_CLOUDFLARE_ARCHITECTURE_AND_API.md#worker-responsibilities | read-only | not_checked_in_generated_view |
| ITEM-allowed-with-limits-working-style-82a5378e | allowed_with_limits | Working style | docs/scopian/sources/10_AGENT_ROLES_AND_BUILD_WORKFLOW.md#working-style | none | not_checked_in_generated_view |
| ITEM-likely-out-of-scope-cause-vs-context-philosophy-0034039d | likely_out_of_scope | Cause vs context philosophy | docs/scopian/sources/01_PRODUCT_SPEC.md#cause-vs-context-philosophy | none | not_checked_in_generated_view |
| ITEM-likely-out-of-scope-claude-boundary-48928f06 | likely_out_of_scope | Claude boundary | docs/scopian/sources/14_DEPLOYMENT_BOUNDARIES.md#claude-boundary | none | not_checked_in_generated_view |
| ITEM-likely-out-of-scope-claude-code-1e5c5a79 | likely_out_of_scope | Claude Code | docs/scopian/sources/10_AGENT_ROLES_AND_BUILD_WORKFLOW.md#claude-code | none | not_checked_in_generated_view |
| ITEM-likely-out-of-scope-codex-7ab08705 | likely_out_of_scope | Codex | docs/scopian/sources/10_AGENT_ROLES_AND_BUILD_WORKFLOW.md#codex | none | not_checked_in_generated_view |
| ITEM-likely-out-of-scope-codex-phase-1-prompt-cloudflare-ac8ee980 | likely_out_of_scope | Codex Phase 1 prompt — Cloudflare foundation: 01_PRODUCT_SPEC.md; 04_CLOUDFLARE_ARCHITECTURE_AND_API.md; 10_AGENT_ROLES_AND_BUILD_WORKFLOW.md; 11_BUILD_PLAN ... | docs/scopian/sources/13_IMPLEMENTATION_PROMPT_TEMPLATES.md#codex-phase-1-prompt-cloudflare-foundation | do-not-build | not_checked_in_generated_view |
| ITEM-likely-out-of-scope-codex-phase-2-prompt-market-inge-9cb3804f | likely_out_of_scope | Codex Phase 2 prompt — Market ingestion: 02_SIGNAL_ENGINE_V2_2.md; 04_CLOUDFLARE_ARCHITECTURE_AND_API.md; 05_DATA_MODEL_D1_RETENTION.md; D1 migration for ma ... | docs/scopian/sources/13_IMPLEMENTATION_PROMPT_TEMPLATES.md#codex-phase-2-prompt-market-ingestion | do-not-build | not_checked_in_generated_view |
| ITEM-likely-out-of-scope-idempotency-requirements-a89ade13 | likely_out_of_scope | Idempotency requirements | docs/scopian/sources/04_CLOUDFLARE_ARCHITECTURE_AND_API.md#idempotency-requirements | none | not_checked_in_generated_view |
| ITEM-likely-out-of-scope-impeccable-frontend-skill-7b91f37c | likely_out_of_scope | Impeccable frontend skill | docs/scopian/sources/10_AGENT_ROLES_AND_BUILD_WORKFLOW.md#impeccable-frontend-skill | none | not_checked_in_generated_view |
| ITEM-likely-out-of-scope-implementation-requirements-12034e69 | likely_out_of_scope | Implementation requirements | docs/scopian/sources/02_SIGNAL_ENGINE_V2_2.md#implementation-requirements | none | not_checked_in_generated_view |
| ITEM-likely-out-of-scope-phase-4c-backend-smoke-status-fe6088fd | likely_out_of_scope | Phase 4C backend smoke status | docs/scopian/sources/04_CLOUDFLARE_ARCHITECTURE_AND_API.md#phase-4c-backend-smoke-status | none | not_checked_in_generated_view |
| ITEM-likely-out-of-scope-phase-4c-live-smoke-finding-e0b3445b | likely_out_of_scope | Phase 4C live-smoke finding | docs/scopian/sources/03_CLAUDE_ENRICHMENT_POLICY.md#phase-4c-live-smoke-finding | none | not_checked_in_generated_view |
| ITEM-likely-out-of-scope-prompt-template-for-codex-01-pro-a60804f9 | likely_out_of_scope | Prompt template for Codex: 01_PRODUCT_SPEC.md; 02_SIGNAL_ENGINE_V2_2.md; 03_CLAUDE_ENRICHMENT_POLICY.md; 04_CLOUDFLARE_ARCHITECTURE_AND_API.md | docs/scopian/sources/10_AGENT_ROLES_AND_BUILD_WORKFLOW.md#prompt-template-for-codex | do-not-build | not_checked_in_generated_view |
| ITEM-likely-out-of-scope-public-data-exposure-20bf8dc1 | likely_out_of_scope | Public data exposure | docs/scopian/sources/05_DATA_MODEL_D1_RETENTION.md#public-data-exposure | none | not_checked_in_generated_view |
| ITEM-likely-out-of-scope-purpose-52ad4e11 | likely_out_of_scope | Purpose | docs/scopian/sources/03_CLAUDE_ENRICHMENT_POLICY.md#purpose | none | not_checked_in_generated_view |
| ITEM-likely-out-of-scope-ui-gate-a5794ac8 | likely_out_of_scope | UI gate | docs/scopian/sources/03_CLAUDE_ENRICHMENT_POLICY.md#ui-gate | none | not_checked_in_generated_view |

## Coverage Snapshot

- likely_in_scope: 25
- allowed_with_limits: 76
- likely_out_of_scope: 15
- decision_required: 0
- conflict_detected: 0
- insufficient_evidence: 0

## PM Summary

- agent_enhanced: false
- template_only: true
- correctness_claim: false
- decision_required_items: 0
- out_of_scope_items: 15

## Changelog Snapshot

- generated_refresh: 2026-06-17T21:30:09+07:00
- selected_sources: 17
- approved_buffer_records: 4

## Freshness Metadata

- view: sha256:4da761ebd11c
- sources: sha256:b6052568ac58
- buffer: sha256:11e7a1a3d36e
- context: sha256:5ef45bc1a5d7
- registry: sha256:e1ba5e257ab6

## Refresh Instructions

- Regenerate with `scopian view refresh` after source or buffer changes.
- Use `scopian view refresh --mode legacy_split` only when legacy split files are needed.
- Treat this generated file as scope evidence, not implementation correctness.
