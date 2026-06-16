import {
  UI_LABEL_BY_CATALYST_STATUS,
  briefIdFor,
  isCatalystStatus,
  isClaudeAnalysisMode,
  isClaudeConfidence,
  isClaudeUiLabel,
  isPriceContextCheck,
} from "./briefSchema.ts";
import { filterSourceLinks, type RawClaudeSource } from "./sourcePolicy.ts";
import type {
  CatalystStatus,
  ClaudeAnalysisMode,
  ClaudeSourceLink,
  ClaudeUiLabel,
  PriceContextCheck,
  RejectedClaudeSource,
  ValidatedClaudeBrief,
} from "./types.ts";

const FORBIDDEN_PUBLIC_TERMS = [
  "buy",
  "sell",
  "long",
  "short",
  "hold",
  "price target",
  "trading signal",
] as const;

export class ClaudeBriefValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeBriefValidationError";
  }
}

interface RawClaudeBrief {
  schema_version?: unknown;
  generated_at?: unknown;
  incident_id?: unknown;
  analysis_mode?: unknown;
  catalyst_status?: unknown;
  ui_label?: unknown;
  headline?: unknown;
  summary?: unknown;
  brief_summary?: unknown;
  confidence?: unknown;
  price_context_check?: unknown;
  focused_catalyst?: unknown;
  main_catalyst?: unknown;
  broader_context?: unknown;
  caveats?: unknown;
  tags?: unknown;
  sources?: unknown;
  source_links?: unknown;
  rejected_sources?: unknown;
}

export interface ValidateClaudeBriefOptions {
  eventDate?: string;
  blockedDomains?: string[];
}

function asRecord(value: unknown): RawClaudeBrief {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ClaudeBriefValidationError("Brief must be a JSON object.");
  }

  return value as RawClaudeBrief;
}

function stringField(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ClaudeBriefValidationError(`${fieldName} is required.`);
  }

  return value.trim();
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string => typeof item === "string" && Boolean(item.trim()),
  );
}

function unknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function rawSources(value: unknown): RawClaudeSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is RawClaudeSource =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function forbiddenPublicTerm(value: string): string | null {
  const lower = value.toLowerCase();

  for (const term of FORBIDDEN_PUBLIC_TERMS) {
    const escaped = term.replace(" ", "[\\s-]+");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");

    if (regex.test(lower)) {
      return term;
    }
  }

  return null;
}

function assertNoForbiddenPublicLanguage(value: string, fieldName: string) {
  const term = forbiddenPublicTerm(value);

  if (term) {
    throw new ClaudeBriefValidationError(
      `${fieldName} contains forbidden public wording: ${term}.`,
    );
  }
}

function catalystStatus(value: unknown): CatalystStatus {
  if (!isCatalystStatus(value)) {
    throw new ClaudeBriefValidationError("catalyst_status is invalid.");
  }

  return value;
}

function analysisMode(value: unknown): ClaudeAnalysisMode {
  if (!isClaudeAnalysisMode(value)) {
    throw new ClaudeBriefValidationError("analysis_mode is invalid.");
  }

  return value;
}

function uiLabel(
  value: unknown,
  catalystStatusValue: CatalystStatus,
): ClaudeUiLabel {
  if (!isClaudeUiLabel(value)) {
    throw new ClaudeBriefValidationError("ui_label is invalid.");
  }

  const expected = UI_LABEL_BY_CATALYST_STATUS[catalystStatusValue];

  if (value !== expected) {
    throw new ClaudeBriefValidationError(
      `ui_label must be ${expected} for ${catalystStatusValue}.`,
    );
  }

  return value;
}

function confidence(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!isClaudeConfidence(value)) {
    throw new ClaudeBriefValidationError("confidence is invalid.");
  }

  return value;
}

function priceContextCheck(value: unknown): PriceContextCheck | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!isPriceContextCheck(value)) {
    throw new ClaudeBriefValidationError("price_context_check is invalid.");
  }

  return value;
}

function hasStrongCauseSource(sources: ClaudeSourceLink[]): boolean {
  return sources.some(
    (source) =>
      source.source_strength === "strong" &&
      (source.used_for === "focused_catalyst" ||
        source.used_for === "likely_cause"),
  );
}

function enforceSourceRequirements(input: {
  catalyst_status: CatalystStatus;
  accepted_sources: ClaudeSourceLink[];
}) {
  if (
    (input.catalyst_status === "cause_supported" ||
      input.catalyst_status === "cause_likely") &&
    input.accepted_sources.length === 0
  ) {
    throw new ClaudeBriefValidationError(
      "Cause classifications require at least one accepted source.",
    );
  }
}

function maybeDowngradeForConflict(input: {
  catalyst_status: CatalystStatus;
  ui_label: ClaudeUiLabel;
  price_context_check: PriceContextCheck | null;
  accepted_sources: ClaudeSourceLink[];
}): {
  catalyst_status: CatalystStatus;
  ui_label: ClaudeUiLabel;
} {
  if (
    input.price_context_check === "conflict" &&
    (input.catalyst_status === "cause_supported" ||
      input.catalyst_status === "cause_likely") &&
    !hasStrongCauseSource(input.accepted_sources)
  ) {
    return {
      catalyst_status: "context_only",
      ui_label: "Market Backdrop",
    };
  }

  return {
    catalyst_status: input.catalyst_status,
    ui_label: input.ui_label,
  };
}

export function validateClaudeBrief(
  value: unknown,
  options: ValidateClaudeBriefOptions = {},
): ValidatedClaudeBrief {
  const raw = asRecord(value);
  const schemaVersion = stringField(raw.schema_version, "schema_version");

  if (schemaVersion !== "1.0") {
    throw new ClaudeBriefValidationError("schema_version must be 1.0.");
  }

  const generatedAt = stringField(raw.generated_at, "generated_at");

  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new ClaudeBriefValidationError("generated_at must be ISO time.");
  }

  const incidentId = stringField(raw.incident_id, "incident_id");
  const mode = analysisMode(raw.analysis_mode);
  const status = catalystStatus(raw.catalyst_status);
  const label = uiLabel(raw.ui_label, status);
  const summary = stringField(
    raw.brief_summary ?? raw.summary,
    "brief_summary",
  );
  const headline = nullableString(raw.headline);
  const priceCheck = priceContextCheck(raw.price_context_check);
  const filtered = filterSourceLinks(
    rawSources(raw.source_links ?? raw.sources),
    {
      eventDate: options.eventDate,
      blockedDomains: options.blockedDomains,
    },
  );
  const rejectedSources = [
    ...filtered.rejected,
    ...rawSources(raw.rejected_sources).map((source) => ({
      ...source,
      rejection_reason: "provided_as_rejected_source",
    })),
  ] as RejectedClaudeSource[];
  const downgraded = maybeDowngradeForConflict({
    catalyst_status: status,
    ui_label: label,
    price_context_check: priceCheck,
    accepted_sources: filtered.accepted,
  });

  enforceSourceRequirements({
    catalyst_status: downgraded.catalyst_status,
    accepted_sources: filtered.accepted,
  });

  if (
    status === "context_only" &&
    (raw.main_catalyst || raw.focused_catalyst)
  ) {
    throw new ClaudeBriefValidationError(
      "context_only briefs must not include a main catalyst.",
    );
  }

  if (
    downgraded.catalyst_status === "none_found" &&
    (raw.main_catalyst || raw.focused_catalyst)
  ) {
    throw new ClaudeBriefValidationError(
      "none_found briefs must not include a main catalyst.",
    );
  }

  assertNoForbiddenPublicLanguage(summary, "brief_summary");

  if (headline) {
    assertNoForbiddenPublicLanguage(headline, "headline");
  }

  return {
    id: briefIdFor(incidentId, mode),
    schema_version: "1.0",
    generated_at: generatedAt,
    incident_id: incidentId,
    analysis_mode: mode,
    catalyst_status: downgraded.catalyst_status,
    ui_label: downgraded.ui_label,
    headline,
    brief_summary: summary,
    confidence: confidence(raw.confidence),
    price_context_check: priceCheck,
    focused_catalyst:
      downgraded.catalyst_status === "cause_supported" ||
      downgraded.catalyst_status === "cause_likely"
        ? (raw.focused_catalyst ?? raw.main_catalyst ?? null)
        : null,
    broader_context: unknownArray(raw.broader_context),
    caveats: stringArray(raw.caveats),
    tags: stringArray(raw.tags),
    accepted_sources: filtered.accepted,
    rejected_sources: rejectedSources,
    source_quality_meta: {
      rejected_count: rejectedSources.length,
    },
  };
}
