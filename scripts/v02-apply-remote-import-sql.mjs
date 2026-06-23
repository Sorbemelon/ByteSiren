import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_FILES = [
  "000_reset_v02.sql",
  "001_signal_events_v02.sql",
  "002_signal_event_symbols_v02.sql",
  "003_audit_events_v02.sql",
  "004_market_stories_v02.sql",
  "005_market_story_members_v02.sql",
  "006_daily_overviews_v02.sql",
];

const FORBIDDEN_PATTERNS = [
  /\bDROP\s+TABLE\b/i,
  /\bDELETE\s+FROM\s+(market_candles|market_features|incidents|claude_briefs\b|source_references\b|public_view_counts|job_runs)\b/i,
  /\bINSERT\s+(?:OR\s+\w+\s+)?INTO\s+(claude_briefs_v02|source_references_v02|claude_briefs\b|source_references\b|market_candles|market_features|incidents|public_view_counts|job_runs)\b/i,
  /sk-ant-[A-Za-z0-9_-]+/,
  /github_pat_[A-Za-z0-9_]+/,
  /ghp_[A-Za-z0-9_]+/,
];

function parseArgs(argv) {
  const options = {
    dir: ".tmp/v02-phase-b2-import",
    database: "bytesiren-db",
    reportJson: ".tmp/v02-phase-b2-remote-import-output.json",
    reportMd: ".tmp/v02-phase-b2-remote-import-output.md",
    outputDir: ".tmp",
    dryRun: true,
    live: false,
    confirm: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    if (arg === "--dir") options.dir = next();
    else if (arg === "--database") options.database = next();
    else if (arg === "--report-json") options.reportJson = next();
    else if (arg === "--report-md") options.reportMd = next();
    else if (arg === "--output-dir") options.outputDir = next();
    else if (arg === "--dry-run") {
      options.dryRun = true;
      options.live = false;
    } else if (arg === "--live") {
      options.live = true;
      options.dryRun = false;
    } else if (arg === "--confirm-remote-v02-import") {
      options.confirm = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function validateStatement(statement, file) {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(statement)) {
      throw new Error(`Unsafe SQL in ${file}: ${pattern}`);
    }
  }
}

function redactOutput(value) {
  return value
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-[redacted]")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_[redacted]")
    .replace(/ghp_[A-Za-z0-9_]+/g, "ghp_[redacted]");
}

async function loadPlan(dir) {
  const plan = [];
  for (const file of DEFAULT_FILES) {
    const filePath = path.join(dir, file);
    const contents = await readFile(filePath, "utf8");
    const statements = contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const statement of statements) {
      validateStatement(statement, file);
    }

    plan.push({
      file,
      path: filePath,
      statements,
    });
  }
  return plan;
}

function runWranglerStatement({ database, statement }) {
  return new Promise((resolve) => {
    const executable =
      process.platform === "win32" ? "corepack.cmd" : "corepack";
    const args = [
      "pnpm",
      "--filter",
      "@bytesiren/worker",
      "exec",
      "wrangler",
      "d1",
      "execute",
      database,
      "--remote",
      "--json",
      "--command",
      statement,
    ];

    const child = spawn(executable, args, {
      cwd: process.cwd(),
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ exitCode: 1, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

async function writeReports({ results, reportJson, reportMd }) {
  const report = {
    generated_at: new Date().toISOString(),
    ok: results.every((result) => result.exit_code === 0),
    chunks: results,
  };
  await mkdir(path.dirname(reportJson), { recursive: true });
  await writeFile(reportJson, JSON.stringify(report, null, 2));

  const lines = [
    "# v0.2 Phase B2 Remote Import",
    "",
    `- Result: ${report.ok ? "PASS" : "NEEDS_FIX"}`,
    `- Statements: ${results.length}`,
    "",
    "| File | Statement | Exit |",
    "| --- | ---: | ---: |",
    ...results.map(
      (result) =>
        `| ${result.file} | ${result.statement_index} | ${result.exit_code} |`,
    ),
  ];
  await writeFile(reportMd, `${lines.join("\n")}\n`);
}

export async function runImport(options) {
  const plan = await loadPlan(options.dir);
  const results = [];

  if (options.live && !options.confirm) {
    throw new Error(
      "Live remote v0.2 import requires --confirm-remote-v02-import",
    );
  }

  for (const filePlan of plan) {
    for (let index = 0; index < filePlan.statements.length; index += 1) {
      const startedAt = new Date().toISOString();
      let exitCode = 0;
      let outputFile = null;
      let outputExcerpt = "dry-run";

      if (!options.dryRun) {
        const output = await runWranglerStatement({
          database: options.database,
          statement: filePlan.statements[index],
        });
        exitCode = output.exitCode;
        const safeOutput = redactOutput(
          `${output.stdout}\n${output.stderr}`.trim(),
        );
        outputFile = path.join(
          options.outputDir,
          `v02-phase-b2-command-import-${filePlan.file}-statement-${index + 1}.txt`,
        );
        await mkdir(path.dirname(outputFile), { recursive: true });
        await writeFile(outputFile, `${safeOutput}\n`);
        outputExcerpt = safeOutput.slice(0, 1000);
      }

      const result = {
        file: filePlan.file,
        statement_index: index + 1,
        statements: 1,
        exit_code: exitCode,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        output_file: outputFile,
        output_excerpt: outputExcerpt,
      };
      results.push(result);

      if (
        result.exit_code !== 0 ||
        result.statement_index === filePlan.statements.length ||
        result.statement_index % 25 === 0
      ) {
        console.log(
          `file=${result.file} statement=${result.statement_index}/${filePlan.statements.length} exit=${result.exit_code}`,
        );
      }

      if (result.exit_code !== 0) {
        await writeReports({
          results,
          reportJson: options.reportJson,
          reportMd: options.reportMd,
        });
        return { ok: false, results };
      }
    }
  }

  await writeReports({
    results,
    reportJson: options.reportJson,
    reportMd: options.reportMd,
  });
  return { ok: true, results };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await runImport(options);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
