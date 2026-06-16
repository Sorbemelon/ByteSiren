import {
  ANALYSIS_MODES,
  CATALYST_STATUSES,
  CLAUDE_UI_LABELS,
  CONFIDENCE_VALUES,
  PRICE_CONTEXT_CHECKS,
  SOURCE_ROLES,
  SOURCE_STRENGTHS,
  type CatalystStatus,
  type ClaudeAnalysisMode,
  type ClaudeConfidence,
  type ClaudeUiLabel,
  type PriceContextCheck,
  type SourceRole,
  type SourceStrength,
} from "./types.ts";

export const UI_LABEL_BY_CATALYST_STATUS: Record<
  CatalystStatus,
  ClaudeUiLabel
> = {
  cause_supported: "Focused Cause",
  cause_likely: "Likely Cause",
  context_only: "Market Backdrop",
  none_found: "No Clear Cause",
};

export const PUBLIC_STATUS_BY_CATALYST_STATUS: Record<
  CatalystStatus,
  "brief_ready" | "context_only" | "none_found"
> = {
  cause_supported: "brief_ready",
  cause_likely: "brief_ready",
  context_only: "context_only",
  none_found: "none_found",
};

function oneOf<T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

export function isCatalystStatus(value: unknown): value is CatalystStatus {
  return oneOf(CATALYST_STATUSES, value);
}

export function isClaudeUiLabel(value: unknown): value is ClaudeUiLabel {
  return oneOf(CLAUDE_UI_LABELS, value);
}

export function isClaudeConfidence(value: unknown): value is ClaudeConfidence {
  return oneOf(CONFIDENCE_VALUES, value);
}

export function isPriceContextCheck(
  value: unknown,
): value is PriceContextCheck {
  return oneOf(PRICE_CONTEXT_CHECKS, value);
}

export function isSourceRole(value: unknown): value is SourceRole {
  return oneOf(SOURCE_ROLES, value);
}

export function isSourceStrength(value: unknown): value is SourceStrength {
  return oneOf(SOURCE_STRENGTHS, value);
}

export function isClaudeAnalysisMode(
  value: unknown,
): value is ClaudeAnalysisMode {
  return oneOf(ANALYSIS_MODES, value);
}

export function briefIdFor(
  incidentId: string,
  analysisMode: ClaudeAnalysisMode,
): string {
  return `claude_brief_${incidentId}_${analysisMode}`;
}
