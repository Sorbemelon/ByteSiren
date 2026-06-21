import type {
  ClaudeConfidenceV02,
  ClaudeOutputSourceV02,
  ClaudeResultV02,
  DailyOverviewClaudeResultV02,
  DailyOverviewLabelV02,
  SignalEventClassificationV02,
  SignalEventClaudeResultV02,
  SourceSupportV02,
  SourceTimingAlignmentV02,
} from "./types.ts";
import {
  DAILY_OVERVIEW_LABELS_V02,
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
const DAILY_LABELS = new Set<string>(DAILY_OVERVIEW_LABELS_V02);
const SIGNAL_SOURCE_TAGS = new Set<string>(SIGNAL_EVENT_SOURCE_TAGS_V02);
const DAILY_SOURCE_TAGS = new Set<string>(DAILY_OVERVIEW_SOURCE_TAGS_V02);

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

function optionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string => typeof item === "string" && Boolean(item.trim()),
  );
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

function dailyLabel(value: string): DailyOverviewLabelV02 {
  if (!DAILY_LABELS.has(value)) {
    if (SIGNAL_CLASSIFICATIONS.has(value)) {
      throw new ClaudeResultValidationErrorV02(
        "Daily Overview result cannot use Signal Event cause labels.",
      );
    }

    throw new ClaudeResultValidationErrorV02("daily_label is invalid.");
  }

  return value as DailyOverviewLabelV02;
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

  return {
    mode: "signal_event",
    item_id: itemId,
    target_id:
      typeof input.target_id === "string" && input.target_id.trim()
        ? input.target_id.trim()
        : itemId,
    classification: validatedClassification,
    confidence: confidence(stringField(input, "confidence")),
    headline: stringField(input, "headline"),
    collapsed_summary: stringField(input, "collapsed_summary"),
    context_details: stringField(input, "context_details"),
    why_this_classification: stringField(input, "why_this_classification"),
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
  const drivers = Array.isArray(input.notable_drivers)
    ? input.notable_drivers.map((item) => {
        const driver = record(item);
        return {
          driver: stringField(driver, "driver"),
          source_support: sourceSupport(stringField(driver, "source_support")),
          why_relevant: stringField(driver, "why_relevant"),
        };
      })
    : [];

  return {
    mode: "daily_overview",
    item_id: itemId,
    target_id:
      typeof input.target_id === "string" && input.target_id.trim()
        ? input.target_id.trim()
        : itemId,
    date_utc: stringField(input, "date_utc"),
    daily_label: dailyLabel(stringField(input, "daily_label")),
    confidence: confidence(stringField(input, "confidence")),
    headline: stringField(input, "headline"),
    collapsed_summary: stringField(input, "collapsed_summary"),
    context_details: stringField(input, "context_details"),
    market_tone_summary: stringField(input, "market_tone_summary"),
    notable_drivers: drivers,
    sources: sources(input.sources, DAILY_SOURCE_TAGS),
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
