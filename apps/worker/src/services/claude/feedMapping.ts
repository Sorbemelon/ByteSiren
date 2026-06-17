import {
  PUBLIC_STATUS_BY_CATALYST_STATUS,
  UI_LABEL_BY_CATALYST_STATUS,
} from "./briefSchema.ts";
import {
  CLAUDE_LIMITED_SUMMARY,
  WAITING_FOR_CLAUDE_SUMMARY,
  type PublicFeedBrief,
  type PublicFeedSource,
  type StoredClaudeBrief,
  type ClaudeSourceLink,
} from "./types.ts";
import { isUsefulSourceUrl } from "./sourcePolicy.ts";

export function queuedFeedBrief(): PublicFeedBrief {
  return {
    status: "queued_for_analysis",
    catalyst_status: null,
    label: "Waiting for Claude",
    summary: WAITING_FOR_CLAUDE_SUMMARY,
    confidence: null,
    price_context_check: null,
  };
}

export function analysisLimitedFeedBrief(): PublicFeedBrief {
  return {
    status: "analysis_limited",
    catalyst_status: null,
    label: "Claude Limited",
    summary: CLAUDE_LIMITED_SUMMARY,
    confidence: null,
    price_context_check: null,
  };
}

export function storedBriefToFeedBrief(
  brief: StoredClaudeBrief,
): PublicFeedBrief {
  if (!brief.catalyst_status) {
    return queuedFeedBrief();
  }

  return {
    status: PUBLIC_STATUS_BY_CATALYST_STATUS[brief.catalyst_status],
    catalyst_status: brief.catalyst_status,
    label: UI_LABEL_BY_CATALYST_STATUS[brief.catalyst_status],
    summary: brief.summary,
    confidence: brief.confidence,
    price_context_check: brief.price_context_check,
  };
}

export function sourceLinksToPublicSources(
  sources: ClaudeSourceLink[],
): PublicFeedSource[] {
  return sources
    .filter((source) => isUsefulSourceUrl(source.url))
    .map((source) => ({
      publisher: source.publisher,
      title: source.title,
      url: source.url,
      published_at: source.published_at,
      used_for: source.used_for,
      source_strength: source.source_strength,
    }));
}
