import { ALLOWED_SYMBOLS } from "../config.ts";
import type { Env } from "../types/env.ts";

const GITHUB_API_VERSION = "2026-03-10";
const GITHUB_DISPATCH_URL_PREFIX = "https://api.github.com/repos";
const SUCCESS_STATUSES = new Set([200, 201, 202, 204]);
const DEFAULT_WORKFLOW = "market-ingest.yml";
const DEFAULT_V02_REFRESH_WORKFLOW = "v02-snapshot-refresh.yml";
const DEFAULT_V02_SIGNAL_CLAUDE_WORKFLOW = "v02-claude-enrichment.yml";
const DEFAULT_REF = "main";
const DEFAULT_HOURS = "6";
const DEFAULT_DRY_RUN = "false";
const DEFAULT_REFRESH_REPO = "Sorbemelon/ByteSiren";
const DEFAULT_SIGNAL_CLAUDE_DISPATCH_LIMIT = 3;
const ACTIVE_WORKFLOW_RUN_STATUSES = new Set([
  "queued",
  "in_progress",
  "waiting",
  "requested",
  "pending",
]);

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

export type V02RefreshDispatchStatus =
  | "dry_run"
  | "dispatched"
  | "skipped_disabled"
  | "skipped_existing_run"
  | "failed_dispatch";

export interface V02RefreshInputsSummary {
  trigger_source: string;
  refresh_mode: string;
  requested_at: string;
  idempotency_key: string;
  dry_run: "false";
  confirm_live: "true";
}

export interface V02RefreshActiveRunSummary {
  id: number | null;
  status: string | null;
  event: string | null;
  url: string | null;
}

export interface V02RefreshDispatchResult {
  ok: boolean;
  outcome: GitHubDispatchOutcome;
  status: number | null;
  message: string;
  dispatch_status: V02RefreshDispatchStatus;
  workflow: string;
  repo: string;
  ref: string;
  inputs_summary: V02RefreshInputsSummary;
  dispatch_attempted: boolean;
  duplicate_check_status: number | null;
  active_run?: V02RefreshActiveRunSummary;
  token_present: boolean;
  error_summary?: string;
}

export type V02SignalClaudeDispatchStatus =
  | "dry_run"
  | "dispatched"
  | "skipped_disabled"
  | "skipped_no_targets"
  | "failed_dispatch";

export interface V02SignalClaudeInputsSummary {
  trigger_source: string;
  requested_at: string;
  signal_event_ids: string;
  limit: string;
  dry_run: "false";
  confirm_live: "true";
}

export interface V02SignalClaudeDispatchResult {
  ok: boolean;
  outcome: GitHubDispatchOutcome;
  status: number | null;
  message: string;
  dispatch_status: V02SignalClaudeDispatchStatus;
  workflow: string;
  repo: string;
  ref: string;
  inputs_summary: V02SignalClaudeInputsSummary;
  dispatch_attempted: boolean;
  token_present: boolean;
  error_summary?: string;
}

export interface V02RefreshDispatchOptions extends GitHubDispatchOptions {
  dryRun?: boolean;
  force?: boolean;
  triggerSource?: string;
  refreshMode?: string;
  now?: Date;
}

export interface V02SignalClaudeDispatchOptions extends GitHubDispatchOptions {
  dryRun?: boolean;
  triggerSource?: string;
  now?: Date;
  limit?: number;
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

interface V02RefreshDispatchConfig {
  owner: string;
  repoName: string;
  repoSlug: string;
  workflow: string;
  ref: string;
  token: string;
}

interface V02SignalClaudeDispatchConfig {
  owner: string;
  repoName: string;
  repoSlug: string;
  workflow: string;
  ref: string;
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

function v02RefreshWorkflowDispatchEnabled(env: Env): boolean {
  return isEnabled(env.ENABLE_V02_REFRESH_WORKFLOW_DISPATCH);
}

function v02SignalClaudeWorkflowDispatchEnabled(env: Env): boolean {
  return isEnabled(env.ENABLE_V02_SIGNAL_CLAUDE_WORKFLOW_DISPATCH);
}

function normalizeRepoSlug(value: string | undefined): {
  owner: string;
  repoName: string;
  repoSlug: string;
} {
  const trimmed = (value?.trim() || DEFAULT_REFRESH_REPO).replace(
    /^\/+|\/+$/g,
    "",
  );
  const [owner, repoName, extra] = trimmed.split("/");

  if (!owner || !repoName || extra) {
    throw new Error("invalid GITHUB_REFRESH_WORKFLOW_REPO");
  }

  return {
    owner,
    repoName,
    repoSlug: `${owner}/${repoName}`,
  };
}

function v02RefreshDispatchConfig(
  env: Env,
  { requireToken }: { requireToken: boolean },
): V02RefreshDispatchConfig {
  const repo = normalizeRepoSlug(env.GITHUB_REFRESH_WORKFLOW_REPO);
  const token = requireToken
    ? readRequired(
        env.GITHUB_INGEST_DISPATCH_TOKEN,
        "GITHUB_INGEST_DISPATCH_TOKEN",
      )
    : (env.GITHUB_INGEST_DISPATCH_TOKEN?.trim() ?? "");

  return {
    ...repo,
    workflow:
      env.GITHUB_REFRESH_WORKFLOW_FILE?.trim() || DEFAULT_V02_REFRESH_WORKFLOW,
    ref: env.GITHUB_REFRESH_WORKFLOW_REF?.trim() || DEFAULT_REF,
    token,
  };
}

function v02SignalClaudeDispatchConfig(
  env: Env,
  { requireToken }: { requireToken: boolean },
): V02SignalClaudeDispatchConfig {
  const repo = normalizeRepoSlug(env.GITHUB_REFRESH_WORKFLOW_REPO);
  const token = requireToken
    ? readRequired(
        env.GITHUB_INGEST_DISPATCH_TOKEN,
        "GITHUB_INGEST_DISPATCH_TOKEN",
      )
    : (env.GITHUB_INGEST_DISPATCH_TOKEN?.trim() ?? "");

  return {
    ...repo,
    workflow:
      env.V02_CLAUDE_WORKFLOW_FILE?.trim() ||
      env.V02_SIGNAL_CLAUDE_WORKFLOW_FILE?.trim() ||
      DEFAULT_V02_SIGNAL_CLAUDE_WORKFLOW,
    ref:
      env.V02_CLAUDE_WORKFLOW_REF?.trim() ||
      env.V02_SIGNAL_CLAUDE_WORKFLOW_REF?.trim() ||
      DEFAULT_REF,
    token,
  };
}

function safeSummary(value: string, token?: string): string {
  let sanitized = value.replace(/\s+/g, " ").trim();

  if (token) {
    sanitized = sanitized.split(token).join("[redacted]");
  }

  return sanitized.slice(0, 160);
}

function safeInputSlug(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim().toLowerCase() || fallback;
  const safe = trimmed.replace(/[^a-z0-9_-]/g, "_").replace(/_+/g, "_");

  return safe.slice(0, 48) || fallback;
}

function v02RefreshInputsSummary(
  now: Date,
  options: Pick<V02RefreshDispatchOptions, "triggerSource" | "refreshMode">,
): V02RefreshInputsSummary {
  const requestedAt = now.toISOString();

  return {
    trigger_source: safeInputSlug(options.triggerSource, "cloudflare_cron"),
    refresh_mode: safeInputSlug(options.refreshMode, "scheduled"),
    requested_at: requestedAt,
    idempotency_key: `v02-refresh-${requestedAt.slice(0, 10)}`,
    dry_run: "false",
    confirm_live: "true",
  };
}

function signalClaudeLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SIGNAL_CLAUDE_DISPATCH_LIMIT;
  }

  return Math.max(
    1,
    Math.min(DEFAULT_SIGNAL_CLAUDE_DISPATCH_LIMIT, Math.trunc(value ?? 0)),
  );
}

function v02SignalClaudeInputsSummary(
  signalEventIds: string[],
  now: Date,
  options: Pick<V02SignalClaudeDispatchOptions, "triggerSource" | "limit">,
): V02SignalClaudeInputsSummary {
  const limit = signalClaudeLimit(options.limit);

  return {
    trigger_source: safeInputSlug(options.triggerSource, "incremental_signal"),
    requested_at: now.toISOString(),
    signal_event_ids: signalEventIds.slice(0, limit).join(","),
    limit: String(limit),
    dry_run: "false",
    confirm_live: "true",
  };
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

function v02RefreshFailureResult({
  status,
  message,
  dispatchStatus,
  workflow = DEFAULT_V02_REFRESH_WORKFLOW,
  repo = DEFAULT_REFRESH_REPO,
  ref = DEFAULT_REF,
  inputsSummary = v02RefreshInputsSummary(new Date(0), {}),
  duplicateCheckStatus = null,
  errorSummary,
  outcome = "failed",
  tokenPresent = false,
  activeRun,
}: {
  status: number | null;
  message: string;
  dispatchStatus: V02RefreshDispatchStatus;
  workflow?: string;
  repo?: string;
  ref?: string;
  inputsSummary?: V02RefreshInputsSummary;
  duplicateCheckStatus?: number | null;
  errorSummary?: string;
  outcome?: "failed" | "skipped";
  tokenPresent?: boolean;
  activeRun?: V02RefreshActiveRunSummary;
}): V02RefreshDispatchResult {
  return {
    ok: false,
    outcome,
    status,
    message,
    dispatch_status: dispatchStatus,
    workflow,
    repo,
    ref,
    inputs_summary: inputsSummary,
    dispatch_attempted: false,
    duplicate_check_status: duplicateCheckStatus,
    token_present: tokenPresent,
    ...(activeRun ? { active_run: activeRun } : {}),
    ...(errorSummary ? { error_summary: errorSummary } : {}),
  };
}

function v02SignalClaudeFailureResult({
  status,
  message,
  dispatchStatus,
  workflow = DEFAULT_V02_SIGNAL_CLAUDE_WORKFLOW,
  repo = DEFAULT_REFRESH_REPO,
  ref = DEFAULT_REF,
  inputsSummary = v02SignalClaudeInputsSummary([], new Date(0), {}),
  errorSummary,
  outcome = "failed",
  tokenPresent = false,
}: {
  status: number | null;
  message: string;
  dispatchStatus: V02SignalClaudeDispatchStatus;
  workflow?: string;
  repo?: string;
  ref?: string;
  inputsSummary?: V02SignalClaudeInputsSummary;
  errorSummary?: string;
  outcome?: "failed" | "skipped";
  tokenPresent?: boolean;
}): V02SignalClaudeDispatchResult {
  return {
    ok: false,
    outcome,
    status,
    message,
    dispatch_status: dispatchStatus,
    workflow,
    repo,
    ref,
    inputs_summary: inputsSummary,
    dispatch_attempted: false,
    token_present: tokenPresent,
    ...(errorSummary ? { error_summary: errorSummary } : {}),
  };
}

async function activeWorkflowRun(
  config: V02RefreshDispatchConfig,
  fetcher: typeof fetch,
): Promise<{
  status: number;
  activeRun: V02RefreshActiveRunSummary | null;
  errorSummary?: string;
}> {
  const url = `${GITHUB_DISPATCH_URL_PREFIX}/${encodeURIComponent(
    config.owner,
  )}/${encodeURIComponent(config.repoName)}/actions/workflows/${encodeURIComponent(
    config.workflow,
  )}/runs?branch=${encodeURIComponent(config.ref)}&per_page=20`;
  const response = await fetcher(url, {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${config.token}`,
      "user-agent": "ByteSiren-Worker",
      "x-github-api-version": GITHUB_API_VERSION,
    },
  });
  const text = await response.text();

  if (!SUCCESS_STATUSES.has(response.status)) {
    return {
      status: response.status,
      activeRun: null,
      errorSummary: safeSummary(text, config.token),
    };
  }

  const parsed = JSON.parse(text || "{}") as {
    workflow_runs?: Array<{
      id?: number;
      status?: string;
      event?: string;
      html_url?: string;
      url?: string;
    }>;
  };
  const active = (parsed.workflow_runs ?? []).find((run) =>
    ACTIVE_WORKFLOW_RUN_STATUSES.has(run.status ?? ""),
  );

  return {
    status: response.status,
    activeRun: active
      ? {
          id: active.id ?? null,
          status: active.status ?? null,
          event: active.event ?? null,
          url: active.html_url ?? active.url ?? null,
        }
      : null,
  };
}

export async function dispatchV02SnapshotRefreshWorkflow(
  env: Env,
  options: V02RefreshDispatchOptions = {},
): Promise<V02RefreshDispatchResult> {
  const dryRun = options.dryRun === true;
  const now = options.now ?? new Date();
  const inputsSummary = v02RefreshInputsSummary(now, options);
  const tokenPresent = Boolean(env.GITHUB_INGEST_DISPATCH_TOKEN?.trim());

  if (!v02RefreshWorkflowDispatchEnabled(env)) {
    return v02RefreshFailureResult({
      status: null,
      message:
        "v0.2 refresh workflow dispatch skipped: ENABLE_V02_REFRESH_WORKFLOW_DISPATCH is not true.",
      dispatchStatus: "skipped_disabled",
      inputsSummary,
      outcome: "skipped",
      tokenPresent,
    });
  }

  let config: V02RefreshDispatchConfig;

  try {
    config = v02RefreshDispatchConfig(env, { requireToken: !dryRun });
  } catch (error) {
    return v02RefreshFailureResult({
      status: null,
      message: `v0.2 refresh workflow dispatch failed: ${
        error instanceof Error ? safeSummary(error.message) : "invalid config"
      }.`,
      dispatchStatus: "failed_dispatch",
      inputsSummary,
      tokenPresent,
    });
  }

  const workflow = config.workflow;
  const repo = config.repoSlug;
  const ref = config.ref;

  if (dryRun) {
    return {
      ok: true,
      outcome: "success",
      status: null,
      message: `v0.2 refresh workflow dispatch dry-run: ${workflow} on ${ref}.`,
      dispatch_status: "dry_run",
      workflow,
      repo,
      ref,
      inputs_summary: inputsSummary,
      dispatch_attempted: false,
      duplicate_check_status: null,
      token_present: tokenPresent,
    };
  }

  const fetcher = options.fetcher ?? fetch;

  if (!options.force) {
    try {
      const duplicate = await activeWorkflowRun(config, fetcher);

      if (duplicate.errorSummary) {
        return v02RefreshFailureResult({
          status: duplicate.status,
          message: `v0.2 refresh workflow dispatch failed: active run check HTTP ${duplicate.status}.`,
          dispatchStatus: "failed_dispatch",
          workflow,
          repo,
          ref,
          inputsSummary,
          duplicateCheckStatus: duplicate.status,
          errorSummary: duplicate.errorSummary,
          tokenPresent,
        });
      }

      if (duplicate.activeRun) {
        return v02RefreshFailureResult({
          status: null,
          message:
            "v0.2 refresh workflow dispatch skipped: an active workflow run already exists.",
          dispatchStatus: "skipped_existing_run",
          workflow,
          repo,
          ref,
          inputsSummary,
          duplicateCheckStatus: duplicate.status,
          outcome: "skipped",
          tokenPresent,
          activeRun: duplicate.activeRun,
        });
      }
    } catch (error) {
      return v02RefreshFailureResult({
        status: null,
        message:
          "v0.2 refresh workflow dispatch failed: active run check network_error.",
        dispatchStatus: "failed_dispatch",
        workflow,
        repo,
        ref,
        inputsSummary,
        errorSummary:
          error instanceof Error
            ? safeSummary(error.message, config.token)
            : "Unexpected active run check error.",
        tokenPresent,
      });
    }
  }

  const url = `${GITHUB_DISPATCH_URL_PREFIX}/${encodeURIComponent(
    config.owner,
  )}/${encodeURIComponent(config.repoName)}/actions/workflows/${encodeURIComponent(
    workflow,
  )}/dispatches`;

  try {
    const response = await fetcher(url, {
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
        inputs: inputsSummary,
      }),
    });
    const text = await response.text();

    if (!SUCCESS_STATUSES.has(response.status)) {
      return v02RefreshFailureResult({
        status: response.status,
        message: `v0.2 refresh workflow dispatch failed: HTTP ${response.status}.`,
        dispatchStatus: "failed_dispatch",
        workflow,
        repo,
        ref,
        inputsSummary,
        errorSummary: safeSummary(text, config.token),
        tokenPresent,
      });
    }

    return {
      ok: true,
      outcome: "success",
      status: response.status,
      message: `v0.2 refresh workflow dispatched: ${workflow} on ${ref}.`,
      dispatch_status: "dispatched",
      workflow,
      repo,
      ref,
      inputs_summary: inputsSummary,
      dispatch_attempted: true,
      duplicate_check_status: options.force ? null : 200,
      token_present: tokenPresent,
    };
  } catch (error) {
    return v02RefreshFailureResult({
      status: null,
      message: "v0.2 refresh workflow dispatch failed: network_error.",
      dispatchStatus: "failed_dispatch",
      workflow,
      repo,
      ref,
      inputsSummary,
      errorSummary:
        error instanceof Error
          ? safeSummary(error.message, config.token)
          : "Unexpected dispatch error.",
      tokenPresent,
    });
  }
}

export async function dispatchV02SignalClaudeWorkflow(
  env: Env,
  signalEventIds: string[],
  options: V02SignalClaudeDispatchOptions = {},
): Promise<V02SignalClaudeDispatchResult> {
  const dryRun = options.dryRun === true;
  const now = options.now ?? new Date();
  const ids = [
    ...new Set(signalEventIds.map((id) => id.trim()).filter(Boolean)),
  ];
  const inputsSummary = v02SignalClaudeInputsSummary(ids, now, options);
  const tokenPresent = Boolean(env.GITHUB_INGEST_DISPATCH_TOKEN?.trim());

  if (!v02SignalClaudeWorkflowDispatchEnabled(env)) {
    return v02SignalClaudeFailureResult({
      status: null,
      message:
        "v0.2 Signal Claude workflow dispatch skipped: ENABLE_V02_SIGNAL_CLAUDE_WORKFLOW_DISPATCH is not true.",
      dispatchStatus: "skipped_disabled",
      inputsSummary,
      outcome: "skipped",
      tokenPresent,
    });
  }

  if (ids.length === 0) {
    return v02SignalClaudeFailureResult({
      status: null,
      message:
        "v0.2 Signal Claude workflow dispatch skipped: no Signal targets.",
      dispatchStatus: "skipped_no_targets",
      inputsSummary,
      outcome: "skipped",
      tokenPresent,
    });
  }

  let config: V02SignalClaudeDispatchConfig;

  try {
    config = v02SignalClaudeDispatchConfig(env, { requireToken: !dryRun });
  } catch (error) {
    return v02SignalClaudeFailureResult({
      status: null,
      message: `v0.2 Signal Claude workflow dispatch failed: ${
        error instanceof Error ? safeSummary(error.message) : "invalid config"
      }.`,
      dispatchStatus: "failed_dispatch",
      inputsSummary,
      tokenPresent,
    });
  }

  const workflow = config.workflow;
  const repo = config.repoSlug;
  const ref = config.ref;

  if (dryRun) {
    return {
      ok: true,
      outcome: "success",
      status: null,
      message: `v0.2 Signal Claude workflow dispatch dry-run: ${workflow} on ${ref}.`,
      dispatch_status: "dry_run",
      workflow,
      repo,
      ref,
      inputs_summary: inputsSummary,
      dispatch_attempted: false,
      token_present: tokenPresent,
    };
  }

  const url = `${GITHUB_DISPATCH_URL_PREFIX}/${encodeURIComponent(
    config.owner,
  )}/${encodeURIComponent(config.repoName)}/actions/workflows/${encodeURIComponent(
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
        inputs: inputsSummary,
      }),
    });
    const text = await response.text();

    if (!SUCCESS_STATUSES.has(response.status)) {
      return v02SignalClaudeFailureResult({
        status: response.status,
        message: `v0.2 Signal Claude workflow dispatch failed: HTTP ${response.status}.`,
        dispatchStatus: "failed_dispatch",
        workflow,
        repo,
        ref,
        inputsSummary,
        errorSummary: safeSummary(text, config.token),
        tokenPresent,
      });
    }

    return {
      ok: true,
      outcome: "success",
      status: response.status,
      message: `v0.2 Signal Claude workflow dispatched: ${workflow} on ${ref}.`,
      dispatch_status: "dispatched",
      workflow,
      repo,
      ref,
      inputs_summary: inputsSummary,
      dispatch_attempted: true,
      token_present: tokenPresent,
    };
  } catch (error) {
    return v02SignalClaudeFailureResult({
      status: null,
      message: "v0.2 Signal Claude workflow dispatch failed: network_error.",
      dispatchStatus: "failed_dispatch",
      workflow,
      repo,
      ref,
      inputsSummary,
      errorSummary:
        error instanceof Error
          ? safeSummary(error.message, config.token)
          : "Unexpected dispatch error.",
      tokenPresent,
    });
  }
}
