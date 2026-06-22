import type {
  ChartHighlightViewV02,
  ChartSourceMarkerViewV02,
  FeedSelectionItemTypeV02,
  FeedSelectionV02,
  NormalizedDayPost,
  NormalizedFeedSection,
  NormalizedFeedV02,
} from "./types";

export type ExpandedDayIds = ReadonlySet<string>;
export type ExpandedSectionIds = ReadonlySet<string>;

export const EMPTY_FEED_SELECTION_V02: FeedSelectionV02 = {
  itemType: null,
  itemId: null,
  dayPostId: null,
};

export function createInitialExpandedDayIds(
  feed: NormalizedFeedV02 | null,
): Set<string> {
  if (!feed?.daysExpandedDefault) {
    return new Set();
  }

  return new Set(feed.dayPosts.map((day) => day.id));
}

export function getGlobalDayControlLabel(
  feed: NormalizedFeedV02,
  expandedDayIds: ExpandedDayIds,
): "Collapse days" | "Expand days" {
  const hasExpandedDay = feed.dayPosts.some((day) =>
    expandedDayIds.has(day.id),
  );

  return hasExpandedDay
    ? feed.globalControlLabelWhenExpanded
    : feed.globalControlLabelWhenCollapsed;
}

export function toggleAllDayPosts(
  feed: NormalizedFeedV02,
  expandedDayIds: ExpandedDayIds,
): Set<string> {
  const hasExpandedDay = feed.dayPosts.some((day) =>
    expandedDayIds.has(day.id),
  );

  return hasExpandedDay
    ? new Set()
    : new Set(feed.dayPosts.map((day) => day.id));
}

export function toggleDayPost(
  expandedDayIds: ExpandedDayIds,
  dayId: string,
): Set<string> {
  const next = new Set(expandedDayIds);

  if (next.has(dayId)) {
    next.delete(dayId);
  } else {
    next.add(dayId);
  }

  return next;
}

export function getDayPostControlLabel(
  day: NormalizedDayPost,
  isExpanded: boolean,
): string | null {
  if (!day.hasExtraItems || day.hiddenItemCountWhenCollapsed <= 0) {
    return null;
  }

  return isExpanded ? "Collapse post" : "Expand post";
}

export function getDayPostHiddenCountLabel(
  day: NormalizedDayPost,
  isExpanded: boolean,
): string | null {
  if (
    isExpanded ||
    !day.hasExtraItems ||
    day.hiddenItemCountWhenCollapsed <= 0
  ) {
    return null;
  }

  const hidden = day.hiddenItemCountWhenCollapsed;
  return `+${hidden} event${hidden === 1 ? "" : "s"}`;
}

export function getVisibleSectionsForDay(
  day: NormalizedDayPost,
  isExpanded: boolean,
): NormalizedFeedSection[] {
  if (isExpanded) {
    return day.sections;
  }

  const defaultSection =
    day.sections.find((section) => section.id === day.defaultCollapsedItemId) ??
    day.sections[0];

  return defaultSection ? [defaultSection] : [];
}

export function toggleSectionDetails(
  expandedSectionIds: ExpandedSectionIds,
  sectionId: string,
): Set<string> {
  const next = new Set(expandedSectionIds);

  if (next.has(sectionId)) {
    next.delete(sectionId);
  } else {
    next.add(sectionId);
  }

  return next;
}

export function sectionHasExpandableDetails(
  section: NormalizedFeedSection,
): boolean {
  if (section.itemType === "daily_overview") {
    return (
      Boolean(section.brief?.context_details) ||
      Boolean(section.brief?.headline) ||
      section.notableSymbols.length > 0 ||
      section.topSymbolMoves.length > 0 ||
      Object.keys(section.details).length > 0 ||
      section.sources.length > 0
    );
  }

  if (section.itemType === "market_story") {
    return (
      section.decisionReasons.length > 0 ||
      Boolean(section.publishReason) ||
      Object.keys(section.rangeContext).length > 0 ||
      Object.keys(section.trendContext).length > 0 ||
      Object.keys(section.momentumContext).length > 0 ||
      Object.keys(section.volatilityContext).length > 0 ||
      Object.keys(section.deterministicContext).length > 0
    );
  }

  return (
    section.perSymbolEvidence.length > 0 ||
    Boolean(section.brief?.context_details) ||
    Boolean(section.brief?.headline) ||
    section.sources.length > 0
  );
}

function findDayPostForSection(
  feed: NormalizedFeedV02 | null,
  itemId: string,
): NormalizedDayPost | null {
  return (
    feed?.dayPosts.find((day) =>
      day.sections.some((section) => section.id === itemId),
    ) ?? null
  );
}

export function isFeedSelectionActiveV02(selection: FeedSelectionV02): boolean {
  return Boolean(selection.itemType && selection.itemId && selection.dayPostId);
}

export function isSectionSelectedV02(
  selection: FeedSelectionV02,
  section: NormalizedFeedSection,
): boolean {
  return (
    selection.itemType === section.itemType && selection.itemId === section.id
  );
}

export function toggleFeedSelectionV02(
  current: FeedSelectionV02,
  itemType: FeedSelectionItemTypeV02,
  itemId: string,
  dayPostId: string,
): FeedSelectionV02 {
  if (current.itemType === itemType && current.itemId === itemId) {
    return EMPTY_FEED_SELECTION_V02;
  }

  return { itemType, itemId, dayPostId };
}

export function ensureSelectedDayExpandedV02(
  expandedDayIds: ExpandedDayIds,
  selection: FeedSelectionV02,
): Set<string> {
  const next = new Set(expandedDayIds);

  if (selection.dayPostId) {
    next.add(selection.dayPostId);
  }

  return next;
}

function sectionWindow(section: NormalizedFeedSection): {
  type: ChartHighlightViewV02["type"];
  start: string;
  end: string;
  peakMarkerTime?: string | null;
} | null {
  if (section.itemType === "daily_overview") {
    if (section.chart) {
      return {
        type: "day_window",
        start: section.chart.highlight_start,
        end: section.chart.highlight_end,
      };
    }

    return {
      type: "day_window",
      start: `${section.dateUtc}T00:00:00.000Z`,
      end: `${section.dateUtc}T23:59:59.999Z`,
    };
  }

  if (section.itemType === "market_story") {
    if (!section.chart) return null;

    return {
      type: "story_window",
      start: section.chart.highlight_start,
      end: section.chart.highlight_end,
    };
  }

  if (section.chart) {
    return {
      type: "event_window",
      start: section.chart.highlight_start,
      end: section.chart.highlight_end,
      peakMarkerTime:
        section.chart.peak_marker_time ?? section.evidenceWindow.peak_time,
    };
  }

  return {
    type: "event_window",
    start: section.evidenceWindow.start,
    end: section.evidenceWindow.end,
    peakMarkerTime: section.evidenceWindow.peak_time,
  };
}

function sectionHighlightLabel(section: NormalizedFeedSection): string {
  if (section.itemType === "daily_overview") {
    return "Daily Overview";
  }

  if (section.itemType === "market_story") {
    return section.storyLabel || "Market Story";
  }

  return section.displayWindow || section.displayTime || "Signal Event";
}

export function buildChartHighlightsV02(
  feed: NormalizedFeedV02 | null,
  selection: FeedSelectionV02,
): ChartHighlightViewV02[] {
  if (!feed) {
    return [];
  }

  const selectedDay = selection.itemId
    ? findDayPostForSection(feed, selection.itemId)
    : null;
  const hasSelection = isFeedSelectionActiveV02(selection);

  return feed.dayPosts.flatMap((day) =>
    day.sections.flatMap((section) => {
      const window = sectionWindow(section);
      if (!window) return [];

      const selected = isSectionSelectedV02(selection, section);

      if (section.itemType === "daily_overview" && !selected) {
        return [];
      }

      if (
        hasSelection &&
        selection.itemType === "daily_overview" &&
        selectedDay &&
        day.id !== selectedDay.id
      ) {
        return [];
      }

      return [
        {
          id: `${section.itemType}:${section.id}`,
          itemType: section.itemType,
          itemId: section.id,
          dayPostId: day.id,
          type: window.type,
          start: window.start,
          end: window.end,
          peakMarkerTime: window.peakMarkerTime ?? null,
          label: sectionHighlightLabel(section),
          direction:
            section.itemType === "daily_overview" ? null : section.direction,
          selected,
          dimmed:
            hasSelection &&
            !selected &&
            !(
              selection.itemType === "daily_overview" &&
              selectedDay &&
              day.id === selectedDay.id
            ),
        } satisfies ChartHighlightViewV02,
      ];
    }),
  );
}

function toUnixSeconds(iso: string): number | null {
  const value = Math.floor(new Date(iso).getTime() / 1000);
  return Number.isFinite(value) ? value : null;
}

export function chooseChartHighlightAtTimeV02(
  highlights: ChartHighlightViewV02[],
  timeSec: number,
): ChartHighlightViewV02 | null {
  const candidates = highlights.filter((highlight) => {
    const start = toUnixSeconds(highlight.start);
    const end = toUnixSeconds(highlight.end);
    if (start === null || end === null) return false;
    return timeSec >= Math.min(start, end) && timeSec <= Math.max(start, end);
  });

  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((a, b) => {
    if (a.selected !== b.selected) return a.selected ? -1 : 1;

    const aStart = toUnixSeconds(a.start) ?? 0;
    const aEnd = toUnixSeconds(a.end) ?? aStart;
    const bStart = toUnixSeconds(b.start) ?? 0;
    const bEnd = toUnixSeconds(b.end) ?? bStart;
    const aDuration = Math.abs(aEnd - aStart);
    const bDuration = Math.abs(bEnd - bStart);

    if (aDuration !== bDuration) return aDuration - bDuration;
    return bStart - aStart;
  })[0];
}

function sourceMarkerLabel(sourceTag: string | null | undefined): string {
  const role = `${sourceTag ?? ""}`.toLowerCase();

  if (role.includes("focused")) return "Catalyst";
  if (role.includes("likely")) return "Likely";
  if (role.includes("main")) return "Main";
  if (role.includes("support")) return "Support";
  if (role.includes("backdrop")) return "Backdrop";
  if (role.includes("price")) return "Price";
  return "Source";
}

export function buildChartSourceMarkersV02(
  feed: NormalizedFeedV02 | null,
  selection: FeedSelectionV02,
): ChartSourceMarkerViewV02[] {
  if (!feed || !isFeedSelectionActiveV02(selection)) {
    return [];
  }

  return feed.dayPosts.flatMap((day) =>
    day.sections.flatMap((section) => {
      if (!isSectionSelectedV02(selection, section)) {
        return [];
      }

      if (section.itemType === "market_story") {
        return [];
      }

      return section.sources.flatMap((source, index) => {
        const fallbackTime =
          section.brief?.updated_at ??
          section.chart?.highlight_start ??
          section.dateUtc;
        const time = source.published_at ?? fallbackTime;

        if (!source.url || !time) {
          return [];
        }

        return [
          {
            id: `${section.itemType}:${section.id}:source:${index}`,
            itemType: section.itemType,
            itemId: section.id,
            dayPostId: day.id,
            time,
            label: sourceMarkerLabel(source.tag || source.used_for),
            publisher: source.publisher ?? source.title ?? null,
            url: source.url,
            selected: true,
          } satisfies ChartSourceMarkerViewV02,
        ];
      });
    }),
  );
}
