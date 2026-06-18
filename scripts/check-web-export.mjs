#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webOutDir = join(repoRoot, "apps", "web", "out");
const indexPath = join(webOutDir, "index.html");
const staticDir = join(webOutDir, "_next", "static");
const expectedApiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(
  /\/$/,
  "",
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readTextFiles(dir) {
  const chunks = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      chunks.push(...readTextFiles(fullPath));
      continue;
    }

    if (/\.(html|js|css|txt|xml|json)$/.test(entry)) {
      chunks.push(readFileSync(fullPath, "utf8"));
    }
  }

  return chunks;
}

assert(existsSync(indexPath), "apps/web/out/index.html is missing.");
assert(existsSync(staticDir), "apps/web/out/_next/static is missing.");

const indexHtml = readFileSync(indexPath, "utf8");
const builtText = [indexHtml, ...readTextFiles(staticDir)].join("\n");

assert(
  indexHtml.includes("_next/static"),
  "apps/web/out/index.html does not reference _next/static assets.",
);
assert(
  builtText.includes("api/market/latest"),
  "Built output does not contain /api/market/latest fetch path.",
);
assert(
  builtText.includes("api/intelligence/feed"),
  "Built output does not contain /api/intelligence/feed fetch path.",
);

if (expectedApiBase) {
  assert(
    builtText.includes(expectedApiBase),
    `Built output does not contain ${expectedApiBase}.`,
  );
  assert(
    !builtText.includes("localhost:8787"),
    "Built output contains localhost:8787 even though NEXT_PUBLIC_API_BASE_URL is set.",
  );
}

console.log("Web export check passed.");
