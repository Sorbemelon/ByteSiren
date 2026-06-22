import type {
  NormalizedDayPost,
  NormalizedFeedSection,
  NormalizedFeedV02,
} from "./types";

export type ExpandedDayIds = ReadonlySet<string>;
export type ExpandedSectionIds = ReadonlySet<string>;

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
