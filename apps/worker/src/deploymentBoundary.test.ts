import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workerSrcDir = dirname(fileURLToPath(import.meta.url));
const workerDir = resolve(workerSrcDir, "..");
const repoRoot = resolve(workerDir, "../..");

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

test("deployment boundary keeps active Wrangler configs app-local", () => {
  assert.equal(existsSync(resolve(repoRoot, "wrangler.toml")), false);
  assert.equal(existsSync(resolve(repoRoot, ".env.example")), false);

  const workerWrangler = readRepoFile("apps/worker/wrangler.toml");
  const webWrangler = readRepoFile("apps/web/wrangler.toml");

  assert.match(workerWrangler, /main = "src\/index\.ts"/);
  assert.match(workerWrangler, /binding = "DB"/);
  assert.match(workerWrangler, /crons = \[/);
  assert.match(workerWrangler, /"2,17,32,47 \* \* \* \*"/);
  assert.match(workerWrangler, /"5,20,35,50 \* \* \* \*"/);
  assert.match(workerWrangler, /"10,25,40,55 \* \* \* \*"/);
  assert.match(workerWrangler, /"18 0 \* \* \*"/);
  assert.equal(workerWrangler.includes('"17 0 * * *"'), false);
  assert.equal(workerWrangler.includes('"30 1 * * *"'), false);
  assert.match(
    workerWrangler,
    /ENABLE_V02_REFRESH_WORKFLOW_DISPATCH = "false"/,
  );
  assert.match(workerWrangler, /ENABLE_V02_INCREMENTAL_REFRESH = "true"/);
  assert.match(
    workerWrangler,
    /ENABLE_V02_INCREMENTAL_DAILY_OVERVIEWS = "true"/,
  );
  assert.match(workerWrangler, /V02_DAILY_OVERVIEW_LOOKBACK_DAYS = "5"/);
  assert.match(workerWrangler, /V02_MARKET_STORY_OPEN_TTL_HOURS = "72"/);
  assert.match(
    workerWrangler,
    /ENABLE_V02_DAILY_CLAUDE_WORKFLOW_DISPATCH = "true"/,
  );
  assert.match(workerWrangler, /V02_CLAUDE_DAILY_DISPATCH_LIMIT = "3"/);
  assert.match(workerWrangler, /V02_DAILY_CLAUDE_DISPATCH_LIMIT = "3"/);
  assert.equal(workerWrangler.includes('"*/5 * * * *"'), false);
  assert.match(webWrangler, /pages_build_output_dir = "out"/);
  assert.equal(webWrangler.includes('binding = "DB"'), false);
  assert.equal(webWrangler.includes("crons"), false);
  assert.equal(webWrangler.includes("ANTHROPIC_API_KEY"), false);
});

test("market ingest workflow imports only and leaves detector to Worker cron", () => {
  const workflow = readRepoFile(".github/workflows/market-ingest.yml");

  assert.match(workflow, /workflow_dispatch:/);
  assert.equal(workflow.includes("schedule:"), false);
  assert.equal(workflow.includes('cron: "2,17,32,47 * * * *"'), false);
  assert.match(
    workflow,
    /ByteSiren workflow_dispatch import-only run\. Triggered by Cloudflare scheduler or manual dispatch\./,
  );
  assert.match(
    workflow,
    /ByteSiren import-only run\. Detector is handled by Worker cron\./,
  );
  assert.equal(workflow.includes("--run-detector-last"), false);
});

test("v0.2 snapshot refresh workflow remains manual-only", () => {
  const workflow = readRepoFile(".github/workflows/v02-snapshot-refresh.yml");

  assert.match(workflow, /workflow_dispatch:/);
  assert.equal(workflow.includes("schedule:"), false);
  assert.equal(workflow.includes('cron: "30 1 * * *"'), false);
  assert.match(workflow, /trigger_source:/);
  assert.match(workflow, /idempotency_key:/);
});

test("v0.2 Claude enrichment workflow is manual-only and bounded to Signal/Daily", () => {
  const workflow = readRepoFile(".github/workflows/v02-claude-enrichment.yml");

  assert.match(workflow, /workflow_dispatch:/);
  assert.equal(workflow.includes("schedule:"), false);
  assert.match(workflow, /timeout-minutes: 240/);
  assert.match(
    workflow,
    /ANTHROPIC_API_KEY: \$\{\{ secrets\.ANTHROPIC_API_KEY \}\}/,
  );
  assert.match(
    workflow,
    /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/,
  );
  assert.equal(workflow.includes("v02-snapshot-refresh.mjs"), false);
  assert.equal(workflow.includes("v02-snapshot-refresh.yml"), false);
  assert.equal(workflow.includes("market_story_v02"), false);
  assert.equal(workflow.includes("audit_event_v02"), false);
  assert.match(workflow, /include-hidden-files: true/);
  assert.match(workflow, /CLAUDE_REQUEST_TIMEOUT_MS: "1200000"/);
  assert.match(workflow, /CLAUDE_DEFAULT_MAX_USES: "6"/);
  assert.match(workflow, /Compute v0\.2 Claude timeout budget/);
  assert.match(workflow, /per_target_minutes=22/);
  assert.match(workflow, /timeout --foreground --kill-after=60s/);
});

test("Claude secrets stay out of frontend and no scripts depend on root Wrangler config", () => {
  const workerEnvExample = readRepoFile("apps/worker/.dev.vars.example");
  const webEnvExample = readRepoFile("apps/web/.env.local.example");
  const rootPackage = readRepoFile("package.json");
  const workerPackage = readRepoFile("apps/worker/package.json");

  assert.match(workerEnvExample, /ANTHROPIC_API_KEY=/);
  assert.match(workerEnvExample, /PUBLIC_WEB_ORIGINS=/);
  assert.match(
    webEnvExample,
    /NEXT_PUBLIC_API_BASE_URL=http:\/\/localhost:8787/,
  );
  assert.equal(webEnvExample.includes("ANTHROPIC_API_KEY"), false);
  assert.equal(webEnvExample.includes("NEXT_PUBLIC_ANTHROPIC"), false);
  assert.equal(rootPackage.includes("../../wrangler.toml"), false);
  assert.equal(workerPackage.includes("../../wrangler.toml"), false);
});
