import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runImport } from "./v02-apply-remote-import-sql.mjs";

const FILES = [
  "000_reset_v02.sql",
  "001_signal_events_v02.sql",
  "002_signal_event_symbols_v02.sql",
  "003_audit_events_v02.sql",
  "004_market_stories_v02.sql",
  "005_market_story_members_v02.sql",
  "006_daily_overviews_v02.sql",
];

test("v0.2 remote SQL importer defaults to dry-run and plans every statement", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bytesiren-v02-import-"));
  try {
    for (const file of FILES) {
      await writeFile(
        path.join(dir, file),
        "DELETE FROM source_references_v02;\n",
      );
    }
    const result = await runImport({
      dir,
      database: "bytesiren-db",
      reportJson: path.join(dir, "report.json"),
      reportMd: path.join(dir, "report.md"),
      outputDir: dir,
      dryRun: true,
      live: false,
      confirm: false,
    });

    assert.equal(result.ok, true);
    assert.equal(result.results.length, FILES.length);
    assert.equal(
      result.results.every((row) => row.output_excerpt === "dry-run"),
      true,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("v0.2 remote SQL importer rejects unsafe non-v0.2 statements", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bytesiren-v02-import-"));
  try {
    for (const file of FILES) {
      await writeFile(
        path.join(dir, file),
        file === "001_signal_events_v02.sql"
          ? "DELETE FROM incidents;\n"
          : "DELETE FROM source_references_v02;\n",
      );
    }

    await assert.rejects(
      runImport({
        dir,
        database: "bytesiren-db",
        reportJson: path.join(dir, "report.json"),
        reportMd: path.join(dir, "report.md"),
        outputDir: dir,
        dryRun: true,
        live: false,
        confirm: false,
      }),
      /Unsafe SQL/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
