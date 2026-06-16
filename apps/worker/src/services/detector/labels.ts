import type {
  CandidateDirection,
  MarketDirection,
  QueryHints,
} from "./types.ts";

export function directionSlug(
  direction: CandidateDirection | MarketDirection,
): string {
  switch (direction) {
    case "observed_up":
      return "up";
    case "observed_down":
      return "down";
    case "two_sided":
      return "two_sided";
    case "mixed":
      return "mixed";
  }
}

export function queryHintsForCandidate(input: {
  scope: "market_wide" | "market_day";
  direction: CandidateDirection;
  severity: number;
  breadthCount: number;
}): QueryHints {
  if (input.scope === "market_day" || input.direction === "two_sided") {
    return {
      route: "two_sided_market_day",
      date_bound_query_required: true,
      second_search_allowed: true,
      no_trading_advice: true,
    };
  }

  const route =
    input.direction === "observed_down" ? "market_wide_down" : "market_wide_up";

  return {
    route,
    date_bound_query_required: true,
    second_search_allowed: input.severity >= 100 && input.breadthCount >= 5,
    no_trading_advice: true,
  };
}
