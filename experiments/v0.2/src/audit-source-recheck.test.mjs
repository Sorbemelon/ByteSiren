import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runAuditSourceRecheck } from "./recheck-audit-sources.mjs";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("audit source recheck runs against accepted structural defaults", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "bytesiren-audit-src-"));
  const options = {
    eventsPath: "experiments/v0.2/outputs/vnext_structural_events.json",
    sourceAuditPath: "experiments/v0.2/outputs/catalyst_source_audit.json",
    candlesPath: "experiments/v0.2/data/candles_30d.json",
    maxLeadMin: 360,
    jsonOutputPath: path.join(outputDir, "audit-source-recheck.json"),
    markdownOutputPath: path.join(outputDir, "audit-source-recheck.md"),
  };

  await runAuditSourceRecheck(options, { logger: { log() {} } });
  const payload = await readJson(options.jsonOutputPath);
  const candidates = payload.items.filter((item) =>
    item.recheck_assessment.includes("public_review_candidate"),
  );
  const candidateIds = candidates.map((item) => item.event_id).sort();

  assert.equal(payload.summary.audit_event_count, 31);
  assert.equal(payload.summary.accepted_source_matched_event_count, 2);
  assert.equal(payload.summary.public_review_candidate_count, 0);
  assert.deepEqual(candidateIds, []);
});
