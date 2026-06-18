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

test("Claude secrets stay Worker-only and no scripts depend on root Wrangler config", () => {
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
