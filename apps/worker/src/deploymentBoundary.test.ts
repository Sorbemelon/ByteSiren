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
  assert.match(webWrangler, /pages_build_output_dir = "out"/);
  assert.equal(webWrangler.includes('binding = "DB"'), false);
  assert.equal(webWrangler.includes("crons"), false);
  assert.equal(webWrangler.includes("ANTHROPIC_API_KEY"), false);
});

test("Claude secrets stay Worker-only and no scripts depend on root Wrangler config", () => {
  const workerEnvExample = readRepoFile("apps/worker/.dev.vars.example");
  const webEnvExample = readRepoFile("apps/web/.env.local.example");
  const rootPackage = readRepoFile("package.json");
  const workerPackage = readRepoFile("apps/worker/package.json");

  assert.match(workerEnvExample, /ANTHROPIC_API_KEY=/);
  assert.equal(webEnvExample.includes("ANTHROPIC_API_KEY"), false);
  assert.equal(webEnvExample.includes("NEXT_PUBLIC_ANTHROPIC"), false);
  assert.equal(rootPackage.includes("../../wrangler.toml"), false);
  assert.equal(workerPackage.includes("../../wrangler.toml"), false);
});
