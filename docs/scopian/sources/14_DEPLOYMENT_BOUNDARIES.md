---
project: ByteSiren
source_id: BS-SRC-14
title: Deployment Boundaries
status: frozen_source
version: phase4a5-deployment-boundary-v1
last_updated: 2026-06-16
intended_path: docs/scopian/sources/
scopian_role: canonical_scope_source
change_policy: Any change to frozen decisions requires a Scopian Scope Buffer decision before implementation.
depends_on: [BS-SRC-04, BS-SRC-05, BS-SRC-10]
---

# Deployment Boundaries

## Repo deploy model

ByteSiren uses one Git repository with two separate Cloudflare deployment targets.

```text
apps/web     -> Cloudflare Pages static frontend
apps/worker  -> Cloudflare Worker backend/API/Cron/D1
```

Do not use one mixed root Wrangler config for both targets.

## App-local configs

```text
apps/web/wrangler.toml
  Pages-only config
  pages_build_output_dir = "out"
  no D1 binding
  no Cron Triggers
  no backend secrets

apps/worker/wrangler.toml
  Worker-only config
  main = "src/index.ts"
  D1 binding = "DB"
  Cron Triggers
  non-secret Worker vars
```

## Local env ownership

```text
apps/worker/.dev.vars
  Worker-local secrets and non-public runtime values

apps/web/.env.local
  frontend public values only
```

Use these local env files and committed examples:

```text
Worker local env: apps/worker/.dev.vars
Worker example: apps/worker/.dev.vars.example
Web local env: apps/web/.env.local
Web example: apps/web/.env.local.example
```

Real local env files must stay untracked.

## Production env ownership

```text
Worker secrets and non-public vars:
  Cloudflare Worker settings

Pages public env vars:
  Cloudflare Pages settings
```

Claude credentials belong only in Worker secrets.

Never create:

```text
NEXT_PUBLIC_ANTHROPIC_API_KEY
```

## D1 boundary

D1 is bound only to the Worker deployment.

Cloudflare Pages calls the Worker read-only public API and does not receive D1 bindings.

## Claude boundary

Claude configuration for model/tool behavior is Worker-only.

`ANTHROPIC_API_KEY` is a Worker secret only. It must not be committed and must not be exposed to the frontend.

Phase 4A.5 does not add a live Claude client.

## Deployment sequence

```text
1. Create the Cloudflare D1 database.
2. Put the D1 database_id in apps/worker/wrangler.toml or an environment-specific Worker config.
3. Apply remote migrations from apps/worker.
4. Set Worker secrets and non-public runtime vars in Cloudflare Worker settings.
5. Deploy the Worker.
6. Set NEXT_PUBLIC_API_BASE_URL in Cloudflare Pages settings.
7. Build and deploy the Pages app from apps/web/out.
```

## Verification commands

From the repo root:

```bash
corepack pnpm --filter @bytesiren/worker exec wrangler d1 migrations apply bytesiren-placeholder --local
corepack pnpm --filter @bytesiren/worker exec wrangler deploy --dry-run
corepack pnpm --filter @bytesiren/web build
```

Do not run a real deploy during verification unless the project owner explicitly asks.
