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
export const MAX_PUBLIC_SOURCES_PER_BRIEF_V02 = 3;

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

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function signalSourceRoleAfterTiming(input: {
  tag: SourceTagV02;
  published_at: string | null;
  catalyst_time_utc?: string | null;
  signalEventWindow?: { start: string; end: string } | null;
}): {
  tag: SourceTagV02;
  timingPolicyNote: string | null;
  rejectionReason: string | null;
} {
  if (!input.signalEventWindow) {
    return { tag: input.tag, timingPolicyNote: null, rejectionReason: null };
  }

  const eventStart = timeValue(input.signalEventWindow.start);
  const eventEnd = timeValue(input.signalEventWindow.end);

  if (eventStart === null || eventEnd === null) {
    return { tag: input.tag, timingPolicyNote: null, rejectionReason: null };
  }

  const catalystStart = eventStart - SIGNAL_CAUSE_LOOKBACK_MS;
  const catalystEnd = eventEnd;
  const catalystTime = timeValue(input.catalyst_time_utc);
  const publishedAt = timeValue(input.published_at);
  const catalystInWindow =
    catalystTime !== null && inWindow(catalystTime, catalystStart, catalystEnd);
  const publishedInWindow =
    publishedAt !== null && inWindow(publishedAt, catalystStart, catalystEnd);

  if (catalystInWindow) {
    return {
      tag: input.tag,
      timingPolicyNote: "catalyst_time_in_window",
      rejectionReason: null,
    };
  }

  if (publishedInWindow) {
    return {
      tag: input.tag,
      timingPolicyNote: "published_time_in_window",
      rejectionReason: null,
    };
  }

  if (input.tag === "Price check source" && publishedAt === null) {
    return {
      tag: input.tag,
      timingPolicyNote: "price_source_without_publication_time",
      rejectionReason: null,
    };
  }

  // Cause tags that failed the in-window test are downgraded to Backdrop.
  const downgradedTag: SourceTagV02 = SIGNAL_CAUSE_TAGS.has(
    input.tag as SignalEventSourceTagV02,
  )
    ? "Backdrop source"
    : input.tag;

  // Same-UTC-day coverage of the move is valid Backdrop context even when it
  // falls outside the strict 6h catalyst window. Accept it as Backdrop so the
  // Signal Event can classify Market Backdrop instead of No Clear Cause. Cause
  // tags are never kept here — they already failed the in-window test above.
  const eventDay = utcDay(eventStart);
  const sameDayTime = catalystTime ?? publishedAt;
  if (
    downgradedTag === "Backdrop source" &&
    sameDayTime !== null &&
    utcDay(sameDayTime) === eventDay
  ) {
    return {
      tag: "Backdrop source",
      timingPolicyNote: "signal_source_same_utc_day_backdrop",
      rejectionReason: null,
    };
  }

  return {
    tag: downgradedTag,
    timingPolicyNote: "signal_source_outside_6h_event_window",
    rejectionReason: "signal_source_outside_6h_event_window",
  };
}

function sourceRolePriority(source: AcceptedSourceReferenceV02): number {
  if (source.source_role === "Focused catalyst source") return 0;
  if (source.source_role === "Likely cause source") return 1;
  if (source.source_role === "Main daily context source") return 0;
  if (source.source_role === "Supporting daily source") return 1;
  if (source.source_role === "Backdrop source") return 2;
  if (source.source_role === "Price check source") return 3;
  return 4;
}

function limitAcceptedSources(
  sources: AcceptedSourceReferenceV02[],
): AcceptedSourceReferenceV02[] {
  return sources
    .map((source, index) => ({ source, index }))
    .sort((a, b) => {
      const priorityDelta =
        sourceRolePriority(a.source) - sourceRolePriority(b.source);
      return priorityDelta !== 0 ? priorityDelta : a.index - b.index;
    })
    .slice(0, MAX_PUBLIC_SOURCES_PER_BRIEF_V02)
    .map(({ source }) => source);
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
        : { tag: source.tag, timingPolicyNote: null, rejectionReason: null };

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
      _signal_rejection_reason: timing.rejectionReason,
    } as RawClaudeSource & {
      _source_role: SourceTagV02;
      _why_relevant: string;
      _catalyst_time_utc: string | null;
      _timing_policy_note: string | null;
      _signal_rejection_reason: string | null;
    };
  });
  const filtered = filterSourceLinks(rawSources, {
    eventDate: input.eventDate,
    blockedDomains: input.blockedDomains,
  });

  function rawSourceForUrl(sourceUrl: string | null | undefined) {
    if (typeof sourceUrl !== "string") {
      return undefined;
    }

    const sourceKey = normalizedUrlKey(sourceUrl);
    return rawSources.find(
      (item) =>
        typeof item.url === "string" &&
        normalizedUrlKey(item.url) === sourceKey,
    );
  }

  const accepted = filtered.accepted.flatMap((source) => {
    const raw = rawSourceForUrl(source.url);
    if (raw?._signal_rejection_reason) {
      return [];
    }

    const sourceReference = {
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
    return [sourceReference];
  });

  if (!input.includeRejected) {
    return limitAcceptedSources(accepted);
  }

  const timingRejected = filtered.accepted.flatMap((source) => {
    const raw = rawSourceForUrl(source.url);
    if (!raw?._signal_rejection_reason) {
      return [];
    }

    const sourceReference: RejectedSourceReferenceV02 = {
      target_type: targetType,
      target_id: input.target_id,
      brief_id: input.brief_id ?? null,
      source_role: raw._source_role,
      source_strength: source.source_strength ?? null,
      publisher: source.publisher ?? null,
      title: source.title ?? null,
      url: source.url ?? "about:blank",
      published_at: source.published_at ?? null,
      used_for: source.used_for ?? null,
      accepted: false,
      rejection_reason: raw._signal_rejection_reason,
      metadata: {
        why_relevant: raw._why_relevant ?? "",
        catalyst_time_utc: raw._catalyst_time_utc ?? null,
        timing_policy_note: raw._timing_policy_note ?? null,
      },
    };
    return [sourceReference];
  });

  return [
    ...limitAcceptedSources(accepted),
    ...timingRejected,
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
