import type {
  ClaudeConfidenceV02,
  ClaudeOutputSourceV02,
  ClaudeResultV02,
  DailyOverviewClaudeResultV02,
  SignalEventClassificationV02,
  SignalEventClaudeResultV02,
  SourceSupportV02,
  SourceTimingAlignmentV02,
} from "./types.ts";
import {
  DAILY_OVERVIEW_SOURCE_TAGS_V02,
  SIGNAL_EVENT_CLASSIFICATIONS_V02,
  SIGNAL_EVENT_SOURCE_TAGS_V02,
} from "./types.ts";

export class ClaudeResultValidationErrorV02 extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeResultValidationErrorV02";
  }
}

const CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);
const SOURCE_SUPPORT_VALUES = new Set(["high", "medium", "low", "none"]);
const SOURCE_TIMING_VALUES = new Set([
  "exact",
  "same_day",
  "broad",
  "poor",
  "none",
]);
const SIGNAL_CLASSIFICATIONS = new Set<string>(
  SIGNAL_EVENT_CLASSIFICATIONS_V02,
);
const DAILY_LABELS = new Set<string>([
  "Daily Context",
  "Quiet Day",
  "Mixed Day",
  "Volatile Day",
  "Risk-on Day",
  "Risk-off Day",
  "Relief Day",
  "No Major Driver",
  "Claude Limited",
]);
const SIGNAL_SOURCE_TAGS = new Set<string>(SIGNAL_EVENT_SOURCE_TAGS_V02);
const DAILY_SOURCE_TAGS = new Set<string>(DAILY_OVERVIEW_SOURCE_TAGS_V02);
const PUBLIC_OPERATIONAL_LIMIT_PATTERNS = [
  /\bexternal source validation\b/i,
  /\bweb search tool limit\b/i,
  /\bsearch tool limit\b/i,
  /\bsearch limit error\b/i,
  /\btool limit error\b/i,
  /\bmax[_\s-]?uses\b/i,
  /\bsearches?\s+(?:were\s+)?exhausted\b/i,
  /\bcould not be completed\b.*\b(?:web\s+)?search\b/i,
] as const;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ClaudeResultValidationErrorV02(
      "Claude result must be an object.",
    );
  }

  return value as Record<string, unknown>;
}

function stringField(
  input: Record<string, unknown>,
  fieldName: string,
): string {
  const value = input[fieldName];

  if (typeof value !== "string" || !value.trim()) {
    throw new ClaudeResultValidationErrorV02(`${fieldName} is required.`);
  }

  return value.trim();
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? value.trim() : null;
}

function optionalStringField(
  input: Record<string, unknown>,
  fieldName: string,
): string | null {
  const value = input[fieldName];

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ClaudeResultValidationErrorV02(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string => typeof item === "string" && Boolean(item.trim()),
  );
}

function assertNoPublicOperationalLimitText(
  value: string | null | undefined,
  fieldName: string,
) {
  if (!value) {
    return;
  }

  for (const pattern of PUBLIC_OPERATIONAL_LIMIT_PATTERNS) {
    if (pattern.test(value)) {
      throw new ClaudeResultValidationErrorV02(
        `${fieldName} contains public tool-limit wording.`,
      );
    }
  }
}

function objectField(
  input: Record<string, unknown>,
  fieldName: string,
): Record<string, unknown> {
  const value = input[fieldName];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ClaudeResultValidationErrorV02(`${fieldName} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function confidence(value: string): ClaudeConfidenceV02 {
  if (!CONFIDENCE_VALUES.has(value)) {
    throw new ClaudeResultValidationErrorV02("confidence is invalid.");
  }

  return value as ClaudeConfidenceV02;
}

function sourceSupport(value: string): SourceSupportV02 {
  if (!SOURCE_SUPPORT_VALUES.has(value)) {
    throw new ClaudeResultValidationErrorV02("source_support is invalid.");
  }

  return value as SourceSupportV02;
}

function sourceTiming(value: string): SourceTimingAlignmentV02 {
  if (!SOURCE_TIMING_VALUES.has(value)) {
    throw new ClaudeResultValidationErrorV02(
      "source_timing_alignment is invalid.",
    );
  }

  return value as SourceTimingAlignmentV02;
}

function sources(
  value: unknown,
  allowedTags: Set<string>,
): ClaudeOutputSourceV02[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item): ClaudeOutputSourceV02 => {
    const source = record(item);
    const tag = stringField(source, "tag");

    if (!allowedTags.has(tag)) {
      throw new ClaudeResultValidationErrorV02(`source tag is invalid: ${tag}`);
    }

    return {
      title: stringField(source, "title"),
      publisher: stringField(source, "publisher"),
      url: stringField(source, "url"),
      published_at: nullableString(source.published_at),
      tag: tag as ClaudeOutputSourceV02["tag"],
      why_relevant: stringField(source, "why_relevant"),
      catalyst_time_utc: nullableString(source.catalyst_time_utc),
    };
  });
}

function classification(value: string): SignalEventClassificationV02 {
  if (!SIGNAL_CLASSIFICATIONS.has(value)) {
    if (DAILY_LABELS.has(value)) {
      throw new ClaudeResultValidationErrorV02(
        "Signal Event result cannot use a Daily Overview label.",
      );
    }

    throw new ClaudeResultValidationErrorV02("classification is invalid.");
  }

  return value as SignalEventClassificationV02;
}

function enforceSignalSourceRules(input: {
  classification: SignalEventClassificationV02;
  sources: ClaudeOutputSourceV02[];
}) {
  if (
    input.classification === "Focused Cause" &&
    !input.sources.some((source) => source.tag === "Focused catalyst source")
  ) {
    throw new ClaudeResultValidationErrorV02(
      "Focused Cause requires a Focused catalyst source.",
    );
  }

  if (
    input.classification === "Likely Cause" &&
    !input.sources.some(
      (source) =>
        source.tag === "Focused catalyst source" ||
        source.tag === "Likely cause source",
    )
  ) {
    throw new ClaudeResultValidationErrorV02(
      "Likely Cause requires a Focused catalyst source or Likely cause source.",
    );
  }
}

export function validateSignalEventClaudeResultV02(
  value: unknown,
): SignalEventClaudeResultV02 {
  const input = record(value);

  if (stringField(input, "mode") !== "signal_event") {
    throw new ClaudeResultValidationErrorV02("mode must be signal_event.");
  }

  const itemId = stringField(input, "item_id");
  const validatedSources = sources(input.sources, SIGNAL_SOURCE_TAGS);
  const validatedClassification = classification(
    stringField(input, "classification"),
  );

  enforceSignalSourceRules({
    classification: validatedClassification,
    sources: validatedSources,
  });

  const headline = stringField(input, "headline");
  const collapsedSummary = stringField(input, "collapsed_summary");
  const contextDetails = optionalStringField(input, "context_details");
  const whyThisClassification = stringField(input, "why_this_classification");

  assertNoPublicOperationalLimitText(headline, "headline");
  assertNoPublicOperationalLimitText(collapsedSummary, "collapsed_summary");
  assertNoPublicOperationalLimitText(contextDetails, "context_details");
  assertNoPublicOperationalLimitText(
    whyThisClassification,
    "why_this_classification",
  );

  return {
    mode: "signal_event",
    item_id: itemId,
    target_id:
      typeof input.target_id === "string" && input.target_id.trim()
        ? input.target_id.trim()
        : itemId,
    classification: validatedClassification,
    confidence: confidence(stringField(input, "confidence")),
    headline,
    collapsed_summary: collapsedSummary,
    context_details: contextDetails,
    why_this_classification: whyThisClassification,
    source_support: sourceSupport(stringField(input, "source_support")),
    source_timing_alignment: sourceTiming(
      stringField(input, "source_timing_alignment"),
    ),
    sources: validatedSources,
    rejected_or_ignored_source_notes: optionalStringArray(
      input.rejected_or_ignored_source_notes,
    ),
    validation_flags: objectField(input, "validation_flags"),
    detector_feedback: objectField(input, "detector_feedback"),
  };
}

export function validateDailyOverviewClaudeResultV02(
  value: unknown,
): DailyOverviewClaudeResultV02 {
  const input = record(value);

  if (stringField(input, "mode") !== "daily_overview") {
    throw new ClaudeResultValidationErrorV02("mode must be daily_overview.");
  }

  const itemId = stringField(input, "item_id");
  for (const labelField of ["daily_label", "public_label", "classification"]) {
    if (input[labelField] !== null && input[labelField] !== undefined) {
      throw new ClaudeResultValidationErrorV02(
        "Daily Overview Claude result must not include a day label.",
      );
    }
  }
  const drivers = Array.isArray(input.notable_drivers)
    ? input.notable_drivers.map((item) => {
        const driver = record(item);
        const driverName = stringField(driver, "driver");
        const whyRelevant = stringField(driver, "why_relevant");

        assertNoPublicOperationalLimitText(driverName, "notable_driver.driver");
        assertNoPublicOperationalLimitText(
          whyRelevant,
          "notable_driver.why_relevant",
        );

        return {
          driver: driverName,
          source_support: sourceSupport(stringField(driver, "source_support")),
          why_relevant: whyRelevant,
        };
      })
    : [];
  const headline = stringField(input, "headline");
  const collapsedSummary = stringField(input, "collapsed_summary");
  const contextDetails = optionalStringField(input, "context_details");
  const marketToneSummary = stringField(input, "market_tone_summary");
  const validatedSources = sources(input.sources, DAILY_SOURCE_TAGS);

  assertNoPublicOperationalLimitText(headline, "headline");
  assertNoPublicOperationalLimitText(collapsedSummary, "collapsed_summary");
  assertNoPublicOperationalLimitText(contextDetails, "context_details");
  assertNoPublicOperationalLimitText(marketToneSummary, "market_tone_summary");

  return {
    mode: "daily_overview",
    item_id: itemId,
    target_id:
      typeof input.target_id === "string" && input.target_id.trim()
        ? input.target_id.trim()
        : itemId,
    date_utc: stringField(input, "date_utc"),
    confidence: confidence(stringField(input, "confidence")),
    headline,
    collapsed_summary: collapsedSummary,
    context_details: contextDetails,
    market_tone_summary: marketToneSummary,
    notable_drivers: drivers,
    sources: validatedSources,
    validation_flags: objectField(input, "validation_flags"),
    detector_feedback: objectField(input, "detector_feedback"),
  };
}

export function validateClaudeResultV02(value: unknown): ClaudeResultV02 {
  const input = record(value);
  const mode = stringField(input, "mode");

  if (mode === "signal_event") {
    return validateSignalEventClaudeResultV02(input);
  }

  if (mode === "daily_overview") {
    return validateDailyOverviewClaudeResultV02(input);
  }

  throw new ClaudeResultValidationErrorV02(
    `Unsupported v0.2 Claude result mode: ${mode}`,
  );
}
