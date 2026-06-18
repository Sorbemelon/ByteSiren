import type { IncidentCandidate, SymbolEvidence } from "../detector/index.ts";
import type { Env } from "../../types/env.ts";

export const CATALYST_STATUSES = [
  "cause_supported",
  "cause_likely",
  "context_only",
  "none_found",
] as const;

export const CLAUDE_UI_LABELS = [
  "Focused Cause",
  "Likely Cause",
  "Market Backdrop",
  "No Clear Cause",
] as const;

export const CONFIDENCE_VALUES = [
  "high",
  "medium",
  "low",
  "unexplained",
] as const;

export const PRICE_CONTEXT_CHECKS = [
  "matches_binance",
  "minor_mismatch",
  "conflict",
  "unknown",
] as const;

export const SOURCE_ROLES = [
  "focused_catalyst",
  "likely_cause",
  "backdrop",
  "price_check",
] as const;

export const SOURCE_STRENGTHS = ["strong", "acceptable", "weak"] as const;

export const ANALYSIS_MODES = [
  "live_context",
  "date_matched_retrospective",
  "fixture_test",
] as const;

export type CatalystStatus = (typeof CATALYST_STATUSES)[number];
export type ClaudeUiLabel = (typeof CLAUDE_UI_LABELS)[number];
export type ClaudeConfidence = (typeof CONFIDENCE_VALUES)[number];
export type PriceContextCheck = (typeof PRICE_CONTEXT_CHECKS)[number];
export type SourceRole = (typeof SOURCE_ROLES)[number];
export type SourceStrength = (typeof SOURCE_STRENGTHS)[number];
export type ClaudeAnalysisMode = (typeof ANALYSIS_MODES)[number];

export interface ClaudeSourceLink {
  publisher: string;
  title: string;
  url: string;
  published_at: string | null;
  accessed_at: string | null;
  used_for: SourceRole;
  source_strength: SourceStrength;
}

export interface RejectedClaudeSource extends Partial<ClaudeSourceLink> {
  rejection_reason: string;
}

export interface ValidatedClaudeBrief {
  id: string;
  schema_version: "1.0";
  generated_at: string;
  incident_id: string;
  analysis_mode: ClaudeAnalysisMode;
  catalyst_status: CatalystStatus;
  ui_label: ClaudeUiLabel;
  headline: string | null;
  brief_summary: string;
  confidence: ClaudeConfidence | null;
  price_context_check: PriceContextCheck | null;
  focused_catalyst: unknown | null;
  broader_context: unknown[];
  caveats: string[];
  tags: string[];
  accepted_sources: ClaudeSourceLink[];
  rejected_sources: RejectedClaudeSource[];
  source_quality_meta: Record<string, unknown>;
}

export interface StoredClaudeBrief {
  id: string;
  incident_id: string;
  analysis_mode: ClaudeAnalysisMode;
  catalyst_status: CatalystStatus | null;
  ui_label: string;
  confidence: ClaudeConfidence | null;
  price_context_check: PriceContextCheck | null;
  headline: string | null;
  summary: string;
  focused_catalyst: unknown | null;
  broader_context: unknown[];
  caveats: string[];
  tags: string[];
  source_quality_meta: Record<string, unknown>;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicFeedBrief {
  status:
    | "queued_for_analysis"
    | "analysis_limited"
    | "brief_ready"
    | "context_only"
    | "none_found";
  catalyst_status: CatalystStatus | null;
  label:
    | "Waiting for Claude"
    | "Claude Limited"
    | "Focused Cause"
    | "Likely Cause"
    | "Market Backdrop"
    | "No Clear Cause";
  summary: string;
  confidence: ClaudeConfidence | null;
  price_context_check: PriceContextCheck | null;
}

export interface PublicFeedSource {
  publisher: string;
  title: string;
  url: string;
  published_at: string | null;
  used_for: SourceRole;
  source_strength: SourceStrength;
}

export interface ClaudePromptInput {
  candidate: IncidentCandidate;
}

export interface ClaudeWebSearchPolicy {
  tool_type: string;
  model: string | null;
  default_max_uses: number;
  second_search_max_uses: number;
  allowed_domains: string[];
  blocked_domains: string[];
}

export interface ClaudePromptBuildResult {
  system_prompt: string;
  user_prompt: string;
  web_search_policy: ClaudeWebSearchPolicy;
  route_queries: string[];
  incident_json: Record<string, unknown>;
}

export type ClaudeToolErrorCode =
  | "too_many_requests"
  | "invalid_input"
  | "max_uses_exceeded"
  | "query_too_long"
  | "unavailable"
  | "http_error"
  | "parse_error"
  | "unknown";

export interface ClaudeResponseMetadata {
  searches_used: number;
  claude_model: string;
  tool_type: string;
  max_uses: number;
  error_code: ClaudeToolErrorCode | null;
  generated_at: string;
}

export interface ClaudeCitationSource {
  publisher: string;
  title: string;
  url: string;
  published_at: string | null;
  accessed_at: string | null;
  used_for: SourceRole;
  source_strength: SourceStrength;
}

export interface ClaudeParsedMessage {
  json: unknown | null;
  text: string;
  citations: ClaudeCitationSource[];
  metadata: ClaudeResponseMetadata;
  retryable: boolean;
  error_message: string | null;
}

export interface ClaudeClientRequest {
  system_prompt: string;
  user_prompt: string;
  model: string;
  tool_type: string;
  max_uses: number;
  allowed_domains: string[];
  blocked_domains: string[];
}

export interface ClaudeClientResult {
  ok: boolean;
  parsed: ClaudeParsedMessage;
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function claudeWebSearchPolicyFromEnv(
  env: Partial<Env> = {},
): ClaudeWebSearchPolicy {
  return {
    tool_type: env.CLAUDE_WEB_SEARCH_TOOL_TYPE || "web_search_20250305",
    model: env.CLAUDE_MODEL || null,
    default_max_uses: parseInteger(env.CLAUDE_DEFAULT_MAX_USES, 2),
    second_search_max_uses: parseInteger(env.CLAUDE_SECOND_SEARCH_MAX_USES, 3),
    allowed_domains: parseCsv(env.CLAUDE_ALLOWED_DOMAINS),
    blocked_domains: parseCsv(env.CLAUDE_BLOCKED_DOMAINS),
  };
}

export const WAITING_FOR_CLAUDE_SUMMARY =
  "Waiting for Claude analysis. This detection is queued for date-matched web context.";

export const CLAUDE_LIMITED_SUMMARY =
  "Claude analysis is limited in this free public project. The context will be shown when analysis is available.";

export interface PromptIncidentEvidence {
  incident_id: string;
  incident_key: string;
  scope: IncidentCandidate["scope"];
  direction: IncidentCandidate["direction"];
  detected_at: string;
  started_at: string;
  ended_at: string;
  signal_window: "15m";
  baseline_window: "24h";
  breadth_count: number;
  headline_severity: number;
  symbols: string[];
  symbol_evidence: SymbolEvidence[];
  query_hints: IncidentCandidate["query_hints"];
}
