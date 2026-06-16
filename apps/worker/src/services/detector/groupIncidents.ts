import type { MarketSymbol } from "../../config.ts";
import { SAME_DIRECTION_MERGE_MS } from "./constants.ts";
import { directionSlug, queryHintsForCandidate } from "./labels.ts";
import { average, roundNumber } from "./math.ts";
import { tierFromSeverity } from "./scoring.ts";
import type {
  CandidateDirection,
  IncidentCandidate,
  RawMarketEvent,
  RawSubEventSummary,
} from "./types.ts";

function utcDay(iso: string): string {
  return iso.slice(0, 10);
}

function daySlug(isoDay: string): string {
  return isoDay.replace(/-/g, "");
}

function timeSlug(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}${minutes}`;
}

function sortEvents(events: RawMarketEvent[]): RawMarketEvent[] {
  return [...events].sort(
    (a, b) => Date.parse(a.detected_at) - Date.parse(b.detected_at),
  );
}

function uniqueSortedSymbols(events: RawMarketEvent[]): MarketSymbol[] {
  const symbols = new Set<MarketSymbol>();

  for (const event of events) {
    for (const symbol of event.symbols) {
      symbols.add(symbol);
    }
  }

  return [...symbols].sort((a, b) => a.localeCompare(b));
}

function toSubEvent(event: RawMarketEvent): RawSubEventSummary {
  return {
    id: event.id,
    detected_at: event.detected_at,
    close_time: event.close_time,
    direction: event.direction,
    symbols: event.symbols,
    breadth_count: event.breadth_count,
    headline_severity: event.headline_severity,
    max_elevated_severity: event.max_elevated_severity,
    peak_symbol: event.peak_symbol,
    tier: event.tier,
    symbol_evidence: event.symbol_evidence,
  };
}

function highestSeverityEvent(events: RawMarketEvent[]): RawMarketEvent {
  return events.reduce((highest, event) =>
    event.headline_severity > highest.headline_severity ? event : highest,
  );
}

function averageHeadlineSeverity(events: RawMarketEvent[]): number {
  return roundNumber(
    average(events.map((event) => event.headline_severity)) ?? 0,
    4,
  );
}

function maxElevatedSeverity(events: RawMarketEvent[]): number {
  return roundNumber(
    Math.max(...events.map((event) => event.max_elevated_severity)),
    4,
  );
}

function maxBreadth(events: RawMarketEvent[]): number {
  return Math.max(...events.map((event) => event.breadth_count));
}

function averageChange(events: RawMarketEvent[]): number | null {
  const value = average(
    events
      .map((event) => event.avg_15m_change_pct)
      .filter((change): change is number => change !== null),
  );

  return value === null ? null : roundNumber(value, 4);
}

function candidateFromEvents(input: {
  events: RawMarketEvent[];
  scope: "market_wide" | "market_day";
  direction: CandidateDirection;
  id: string;
  incidentKey: string;
}): IncidentCandidate {
  const events = sortEvents(input.events);
  const representative = highestSeverityEvent(events);
  const headlineSeverity = averageHeadlineSeverity(events);
  const breadthCount = maxBreadth(events);
  const maxSymbolSeverity = maxElevatedSeverity(events);
  const peakEvent = events.reduce((highest, event) =>
    event.max_elevated_severity > highest.max_elevated_severity
      ? event
      : highest,
  );
  const subEvents = events.map(toSubEvent);
  const symbols = uniqueSortedSymbols(events);

  return {
    id: input.id,
    incident_key: input.incidentKey,
    scope: input.scope,
    direction: input.direction,
    detected_at: events[0].detected_at,
    started_at: events[0].detected_at,
    ended_at: events[events.length - 1].close_time,
    signal_window: representative.signal_window,
    baseline_window: representative.baseline_window,
    symbols,
    breadth_count: breadthCount,
    avg_15m_change_pct: averageChange(events),
    headline_severity: headlineSeverity,
    max_elevated_severity: maxSymbolSeverity,
    peak_symbol: peakEvent.peak_symbol,
    tier: tierFromSeverity(headlineSeverity),
    symbol_evidence: representative.symbol_evidence,
    sub_events: subEvents,
    query_hints: queryHintsForCandidate({
      scope: input.scope,
      direction: input.direction,
      severity: headlineSeverity,
      breadthCount,
    }),
  };
}

function groupSameDirectionEvents(
  events: RawMarketEvent[],
  day: string,
): IncidentCandidate[] {
  const sorted = sortEvents(events);
  const candidates: IncidentCandidate[] = [];
  let currentGroup: RawMarketEvent[] = [];

  for (const event of sorted) {
    const previous = currentGroup.at(-1);

    if (
      previous &&
      Date.parse(event.detected_at) - Date.parse(previous.detected_at) >
        SAME_DIRECTION_MERGE_MS
    ) {
      candidates.push(makeSameDirectionCandidate(currentGroup, day));
      currentGroup = [];
    }

    currentGroup.push(event);
  }

  if (currentGroup.length > 0) {
    candidates.push(makeSameDirectionCandidate(currentGroup, day));
  }

  return candidates;
}

function makeSameDirectionCandidate(
  events: RawMarketEvent[],
  day: string,
): IncidentCandidate {
  const sorted = sortEvents(events);
  const direction = sorted[0].direction;
  const slug = directionSlug(direction);
  const bucket = timeSlug(sorted[0].detected_at);
  const id = `bs_${daySlug(day)}_market_wide_${slug}_${bucket}`;

  return candidateFromEvents({
    events: sorted,
    scope: "market_wide",
    direction,
    id,
    incidentKey: id,
  });
}

function makeMarketDayCandidate(
  events: RawMarketEvent[],
  day: string,
): IncidentCandidate {
  const id = `bs_${daySlug(day)}_market_day_two_sided`;

  return candidateFromEvents({
    events,
    scope: "market_day",
    direction: "two_sided",
    id,
    incidentKey: id,
  });
}

export function groupIncidentCandidates(
  rawEvents: RawMarketEvent[],
): IncidentCandidate[] {
  const eventsByDay = new Map<string, RawMarketEvent[]>();

  for (const event of rawEvents) {
    const day = utcDay(event.detected_at);
    eventsByDay.set(day, [...(eventsByDay.get(day) ?? []), event]);
  }

  const candidates: IncidentCandidate[] = [];

  for (const [day, dayEvents] of [...eventsByDay.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const directions = new Set(dayEvents.map((event) => event.direction));

    if (directions.has("observed_up") && directions.has("observed_down")) {
      candidates.push(makeMarketDayCandidate(dayEvents, day));
      continue;
    }

    candidates.push(...groupSameDirectionEvents(dayEvents, day));
  }

  return candidates.sort(
    (a, b) => Date.parse(a.detected_at) - Date.parse(b.detected_at),
  );
}
