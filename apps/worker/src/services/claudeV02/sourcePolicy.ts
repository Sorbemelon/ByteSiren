import {
  filterSourceLinks,
  normalizedUrlKey,
  type RawClaudeSource,
} from "../claude/sourcePolicy.ts";
import type {
  ClaudeOutputSourceV02,
  ClaudeTargetTypeV02,
  DailyOverviewSourceTagV02,
  SignalEventSourceTagV02,
  SourceTagV02,
} from "./types.ts";

export interface AcceptedSourceReferenceV02 {
  target_type: ClaudeTargetTypeV02;
  target_id: string;
  brief_id: string | null;
  source_role: SourceTagV02;
  source_strength: string | null;
  publisher: string | null;
  title: string | null;
  url: string;
  published_at: string | null;
  used_for: string | null;
  accepted: true;
  rejection_reason: null;
  metadata: Record<string, unknown>;
}

export interface RejectedSourceReferenceV02 {
  target_type: ClaudeTargetTypeV02;
  target_id: string;
  brief_id: string | null;
  source_role: SourceTagV02 | "Rejected source";
  source_strength: string | null;
  publisher: string | null;
  title: string | null;
  url: string;
  published_at: string | null;
  used_for: string | null;
  accepted: false;
  rejection_reason: string;
  metadata: Record<string, unknown>;
}

export type SourceReferenceInputV02 =
  | AcceptedSourceReferenceV02
  | RejectedSourceReferenceV02;

const SIGNAL_SOURCE_TAGS = new Set<SignalEventSourceTagV02>([
  "Focused catalyst source",
  "Likely cause source",
  "Backdrop source",
  "Price check source",
]);

const DAILY_SOURCE_TAGS = new Set<DailyOverviewSourceTagV02>([
  "Main daily context source",
  "Supporting daily source",
  "Backdrop source",
  "Price check source",
]);

const SIGNAL_CAUSE_TAGS = new Set<SignalEventSourceTagV02>([
  "Focused catalyst source",
  "Likely cause source",
]);
const SIGNAL_CAUSE_LOOKBACK_MS = 6 * 60 * 60 * 1000;

function assertClaudeBackedTarget(
  targetType: string,
): asserts targetType is ClaudeTargetTypeV02 {
  if (
    targetType !== "signal_event_v02" &&
    targetType !== "daily_overview_v02"
  ) {
    throw new Error(`Unsupported v0.2 Claude source target: ${targetType}`);
  }
}

export function isAllowedSourceTagForTargetV02(
  targetType: ClaudeTargetTypeV02,
  tag: string,
): tag is SourceTagV02 {
  if (targetType === "signal_event_v02") {
    return SIGNAL_SOURCE_TAGS.has(tag as SignalEventSourceTagV02);
  }

  return DAILY_SOURCE_TAGS.has(tag as DailyOverviewSourceTagV02);
}

function usedForFromTag(tag: SourceTagV02): RawClaudeSource["used_for"] {
  if (tag === "Focused catalyst source") {
    return "focused_catalyst";
  }

  if (tag === "Likely cause source") {
    return "likely_cause";
  }

  if (tag === "Price check source") {
    return "price_check";
  }

  return "backdrop";
}

function timeValue(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inWindow(value: number, start: number, end: number): boolean {
  return value >= Math.min(start, end) && value <= Math.max(start, end);
}

function signalSourceRoleAfterTiming(input: {
  tag: SourceTagV02;
  published_at: string | null;
  catalyst_time_utc?: string | null;
  signalEventWindow?: { start: string; end: string } | null;
}): {
  tag: SourceTagV02;
  timingPolicyNote: string | null;
} {
  if (!SIGNAL_CAUSE_TAGS.has(input.tag as SignalEventSourceTagV02)) {
    return { tag: input.tag, timingPolicyNote: null };
  }

  if (!input.signalEventWindow) {
    return { tag: input.tag, timingPolicyNote: null };
  }

  const eventStart = timeValue(input.signalEventWindow.start);
  const eventEnd = timeValue(input.signalEventWindow.end);

  if (eventStart === null || eventEnd === null) {
    return { tag: input.tag, timingPolicyNote: null };
  }

  const catalystStart = eventStart - SIGNAL_CAUSE_LOOKBACK_MS;
  const catalystEnd = eventEnd;
  const catalystTime = timeValue(input.catalyst_time_utc);

  if (
    catalystTime !== null &&
    inWindow(catalystTime, catalystStart, catalystEnd)
  ) {
    return { tag: input.tag, timingPolicyNote: "catalyst_time_in_window" };
  }

  const publishedAt = timeValue(input.published_at);

  if (
    publishedAt !== null &&
    inWindow(publishedAt, catalystStart, catalystEnd)
  ) {
    return { tag: input.tag, timingPolicyNote: "published_time_in_window" };
  }

  return {
    tag: "Backdrop source",
    timingPolicyNote: "cause_source_downgraded_outside_6h_event_window",
  };
}

export function toSourceReferenceInputsV02(input: {
  target_type: string;
  target_id: string;
  brief_id?: string | null;
  sources: ClaudeOutputSourceV02[];
  eventDate?: string;
  blockedDomains?: string[];
  includeRejected?: boolean;
  signalEventWindow?: { start: string; end: string } | null;
}): SourceReferenceInputV02[] {
  const targetType = input.target_type;
  assertClaudeBackedTarget(targetType);

  const rawSources = input.sources.map((source) => {
    if (!isAllowedSourceTagForTargetV02(targetType, source.tag)) {
      throw new Error(`Unsupported source tag ${source.tag} for ${targetType}`);
    }

    const timing =
      targetType === "signal_event_v02"
        ? signalSourceRoleAfterTiming({
            tag: source.tag,
            published_at: source.published_at,
            catalyst_time_utc: source.catalyst_time_utc,
            signalEventWindow: input.signalEventWindow,
          })
        : { tag: source.tag, timingPolicyNote: null };

    return {
      publisher: source.publisher,
      title: source.title,
      url: source.url,
      published_at: source.published_at,
      used_for: usedForFromTag(timing.tag),
      source_strength: "acceptable",
      _source_role: timing.tag,
      _why_relevant: source.why_relevant,
      _catalyst_time_utc: source.catalyst_time_utc ?? null,
      _timing_policy_note: timing.timingPolicyNote,
    } as RawClaudeSource & {
      _source_role: SourceTagV02;
      _why_relevant: string;
      _catalyst_time_utc: string | null;
      _timing_policy_note: string | null;
    };
  });
  const filtered = filterSourceLinks(rawSources, {
    eventDate: input.eventDate,
    blockedDomains: input.blockedDomains,
  });
  const accepted = filtered.accepted.map((source) => {
    const sourceKey = normalizedUrlKey(source.url);
    const raw = rawSources.find(
      (item) =>
        typeof item.url === "string" &&
        normalizedUrlKey(item.url) === sourceKey,
    );
    return {
      target_type: targetType,
      target_id: input.target_id,
      brief_id: input.brief_id ?? null,
      source_role: raw?._source_role ?? "Backdrop source",
      source_strength: source.source_strength,
      publisher: source.publisher,
      title: source.title,
      url: source.url,
      published_at: source.published_at,
      used_for: source.used_for,
      accepted: true,
      rejection_reason: null,
      metadata: {
        why_relevant: raw?._why_relevant ?? "",
        catalyst_time_utc: raw?._catalyst_time_utc ?? null,
        timing_policy_note: raw?._timing_policy_note ?? null,
      },
    } satisfies AcceptedSourceReferenceV02;
  });

  if (!input.includeRejected) {
    return accepted;
  }

  return [
    ...accepted,
    ...filtered.rejected.map(
      (source): RejectedSourceReferenceV02 => ({
        target_type: targetType,
        target_id: input.target_id,
        brief_id: input.brief_id ?? null,
        source_role: "Rejected source",
        source_strength: source.source_strength ?? null,
        publisher: source.publisher ?? null,
        title: source.title ?? null,
        url: source.url ?? "about:blank",
        published_at: source.published_at ?? null,
        used_for: source.used_for ?? null,
        accepted: false,
        rejection_reason: source.rejection_reason,
        metadata: {},
      }),
    ),
  ];
}
