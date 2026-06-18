import { ALLOWED_SYMBOLS } from "../config.ts";
import type { Env } from "../types/env.ts";

const GITHUB_API_VERSION = "2026-03-10";
const GITHUB_DISPATCH_URL_PREFIX = "https://api.github.com/repos";
const SUCCESS_STATUSES = new Set([200, 201, 202, 204]);
const DEFAULT_WORKFLOW = "market-ingest.yml";
const DEFAULT_REF = "main";
const DEFAULT_HOURS = "6";
const DEFAULT_DRY_RUN = "false";

export type GitHubDispatchOutcome = "success" | "failed" | "skipped";

export interface GitHubDispatchInputsSummary {
  hours: string;
  symbols: string[];
  dry_run: "true" | "false";
}

export interface GitHubDispatchResult {
  ok: boolean;
  outcome: GitHubDispatchOutcome;
  status: number | null;
  message: string;
  workflow: string;
  ref: string;
  inputs_summary: GitHubDispatchInputsSummary;
  error_summary?: string;
}

export interface GitHubDispatchOptions {
  fetcher?: typeof fetch;
}

interface DispatchConfig {
  owner: string;
  repo: string;
  workflow: string;
  ref: string;
  hours: string;
  symbols: string[];
  dryRun: "true" | "false";
  token: string;
}

function isEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function readRequired(value: string | undefined, name: string): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`missing ${name}`);
  }

  return trimmed;
}

function normalizeHours(value: string | undefined): string {
  const trimmed = value?.trim() || DEFAULT_HOURS;
  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("invalid GITHUB_INGEST_HOURS");
  }

  return String(Math.trunc(parsed));
}

function normalizeDryRun(value: string | undefined): "true" | "false" {
  return value?.trim().toLowerCase() === "true" ? "true" : DEFAULT_DRY_RUN;
}

function parseSymbols(value: string | undefined): string[] {
  const symbols = (value || ALLOWED_SYMBOLS.join(","))
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    throw new Error("missing GITHUB_INGEST_SYMBOLS");
  }

  for (const symbol of symbols) {
    if (!ALLOWED_SYMBOLS.includes(symbol as (typeof ALLOWED_SYMBOLS)[number])) {
      throw new Error(`invalid GITHUB_INGEST_SYMBOLS entry: ${symbol}`);
    }
  }

  return symbols;
}

function dispatchConfig(env: Env): DispatchConfig {
  return {
    owner: readRequired(env.GITHUB_INGEST_OWNER, "GITHUB_INGEST_OWNER"),
    repo: readRequired(env.GITHUB_INGEST_REPO, "GITHUB_INGEST_REPO"),
    workflow: env.GITHUB_INGEST_WORKFLOW?.trim() || DEFAULT_WORKFLOW,
    ref: env.GITHUB_INGEST_REF?.trim() || DEFAULT_REF,
    hours: normalizeHours(env.GITHUB_INGEST_HOURS),
    symbols: parseSymbols(env.GITHUB_INGEST_SYMBOLS),
    dryRun: normalizeDryRun(env.GITHUB_INGEST_DRY_RUN),
    token: readRequired(
      env.GITHUB_INGEST_DISPATCH_TOKEN,
      "GITHUB_INGEST_DISPATCH_TOKEN",
    ),
  };
}

function safeSummary(value: string, token?: string): string {
  let sanitized = value.replace(/\s+/g, " ").trim();

  if (token) {
    sanitized = sanitized.split(token).join("[redacted]");
  }

  return sanitized.slice(0, 160);
}

function defaultInputsSummary(): GitHubDispatchInputsSummary {
  return {
    hours: DEFAULT_HOURS,
    symbols: [...ALLOWED_SYMBOLS],
    dry_run: DEFAULT_DRY_RUN,
  };
}

function failureResult({
  status,
  message,
  workflow = DEFAULT_WORKFLOW,
  ref = DEFAULT_REF,
  inputsSummary = defaultInputsSummary(),
  errorSummary,
  outcome = "failed",
}: {
  status: number | null;
  message: string;
  workflow?: string;
  ref?: string;
  inputsSummary?: GitHubDispatchInputsSummary;
  errorSummary?: string;
  outcome?: "failed" | "skipped";
}): GitHubDispatchResult {
  return {
    ok: false,
    outcome,
    status,
    message,
    workflow,
    ref,
    inputs_summary: inputsSummary,
    ...(errorSummary ? { error_summary: errorSummary } : {}),
  };
}

export async function dispatchMarketIngestWorkflow(
  env: Env,
  options: GitHubDispatchOptions = {},
): Promise<GitHubDispatchResult> {
  if (!isEnabled(env.ENABLE_GITHUB_INGEST_DISPATCH)) {
    return failureResult({
      status: null,
      message:
        "GitHub ingest dispatch skipped: ENABLE_GITHUB_INGEST_DISPATCH is not true.",
      outcome: "skipped",
    });
  }

  let config: DispatchConfig;

  try {
    config = dispatchConfig(env);
  } catch (error) {
    return failureResult({
      status: null,
      message: `GitHub ingest dispatch failed: ${
        error instanceof Error ? safeSummary(error.message) : "invalid config"
      }.`,
    });
  }

  const inputsSummary: GitHubDispatchInputsSummary = {
    hours: config.hours,
    symbols: config.symbols,
    dry_run: config.dryRun,
  };
  const workflow = config.workflow;
  const ref = config.ref;
  const url = `${GITHUB_DISPATCH_URL_PREFIX}/${encodeURIComponent(
    config.owner,
  )}/${encodeURIComponent(config.repo)}/actions/workflows/${encodeURIComponent(
    workflow,
  )}/dispatches`;

  try {
    const response = await (options.fetcher ?? fetch)(url, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        "user-agent": "ByteSiren-Worker",
        "x-github-api-version": GITHUB_API_VERSION,
      },
      body: JSON.stringify({
        ref,
        inputs: {
          hours: config.hours,
          symbols: config.symbols.join(","),
          dry_run: config.dryRun,
        },
      }),
    });
    const text = await response.text();

    if (!SUCCESS_STATUSES.has(response.status)) {
      return failureResult({
        status: response.status,
        message: `GitHub ingest dispatch failed: HTTP ${response.status}.`,
        workflow,
        ref,
        inputsSummary,
        errorSummary: safeSummary(text, config.token),
      });
    }

    return {
      ok: true,
      outcome: "success",
      status: response.status,
      message: `GitHub ingest workflow dispatched: ${workflow} on ${ref} for hours=${config.hours}.`,
      workflow,
      ref,
      inputs_summary: inputsSummary,
    };
  } catch (error) {
    return failureResult({
      status: null,
      message: "GitHub ingest dispatch failed: network_error.",
      workflow,
      ref,
      inputsSummary,
      errorSummary:
        error instanceof Error
          ? safeSummary(error.message, config.token)
          : "Unexpected dispatch error.",
    });
  }
}
