import { isSourceRole, isSourceStrength } from "./briefSchema.ts";
import type {
  ClaudeSourceLink,
  RejectedClaudeSource,
  SourceRole,
  SourceStrength,
} from "./types.ts";

export const DEFAULT_REJECT_PATTERNS = [
  "price prediction",
  "forecast",
  "price target",
  "why-is-crypto",
  "coindcx.com/blog",
  "bitcoinfoundation.org/news",
  "tradingkey",
  "intellectia",
  "mexc/news",
  "bitget/wiki",
  "stealthex",
  "-price-prediction-",
] as const;

export interface RawClaudeSource {
  publisher?: unknown;
  title?: unknown;
  url?: unknown;
  published_at?: unknown;
  accessed_at?: unknown;
  used_for?: unknown;
  source_strength?: unknown;
}

export interface SourcePolicyOptions {
  eventDate?: string;
  blockedDomains?: string[];
}

export interface FilteredSources {
  accepted: ClaudeSourceLink[];
  rejected: RejectedClaudeSource[];
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const KNOWN_PUBLISHER_LABELS: Record<string, string> = {
  "bloomberg.com": "Bloomberg",
  "cnbc.com": "CNBC",
  "coindesk.com": "CoinDesk",
  "cointelegraph.com": "Cointelegraph",
  "finance.yahoo.com": "Yahoo Finance",
  "reuters.com": "Reuters",
  "theblock.co": "The Block",
};

export function publisherLabelFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return KNOWN_PUBLISHER_LABELS[host] ?? host;
  } catch {
    return "Unknown";
  }
}

export function publisherLabelForSource(
  publisher: unknown,
  url: string,
): string {
  const explicit = toStringOrNull(publisher);

  if (explicit && explicit.toLowerCase() !== "unknown") {
    return explicit;
  }

  return publisherLabelFromUrl(url);
}

function normalizeUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    return null;
  }
}

function isGenericHomepageUrl(value: string): boolean {
  const parsed = new URL(value);
  const pathSegments = parsed.pathname
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);

  if (pathSegments.length === 0) {
    return true;
  }

  return (
    pathSegments.length === 1 &&
    ["home", "homepage", "index", "index.html", "default.aspx"].includes(
      pathSegments[0],
    )
  );
}

export function isUsefulSourceUrl(value: string): boolean {
  const normalized = normalizeUrl(value);

  if (!normalized) {
    return false;
  }

  return !isGenericHomepageUrl(normalized);
}

export function normalizedUrlKey(value: string): string {
  const normalized = normalizeUrl(value);

  if (!normalized) {
    return value.trim().toLowerCase();
  }

  const parsed = new URL(normalized);
  return `${parsed.hostname.toLowerCase()}${parsed.pathname.toLowerCase()}${parsed.search}`;
}

function matchesRejectPattern(sourceText: string, blockedDomains: string[]) {
  const lower = sourceText.toLowerCase();
  return [...DEFAULT_REJECT_PATTERNS, ...blockedDomains].some((pattern) =>
    lower.includes(pattern.toLowerCase().replaceAll("*", "")),
  );
}

function sourceRole(value: unknown): SourceRole {
  return isSourceRole(value) ? value : "backdrop";
}

function sourceStrength(value: unknown): SourceStrength {
  return isSourceStrength(value) ? value : "acceptable";
}

function reject(
  source: RawClaudeSource,
  rejectionReason: string,
): RejectedClaudeSource {
  return {
    publisher: toStringOrNull(source.publisher) ?? undefined,
    title: toStringOrNull(source.title) ?? undefined,
    url: toStringOrNull(source.url) ?? undefined,
    published_at: toStringOrNull(source.published_at),
    accessed_at: toStringOrNull(source.accessed_at),
    used_for: isSourceRole(source.used_for) ? source.used_for : undefined,
    source_strength: isSourceStrength(source.source_strength)
      ? source.source_strength
      : undefined,
    rejection_reason: rejectionReason,
  };
}

export function filterSourceLinks(
  sources: RawClaudeSource[],
  options: SourcePolicyOptions = {},
): FilteredSources {
  const accepted = new Map<string, ClaudeSourceLink>();
  const rejected: RejectedClaudeSource[] = [];

  for (const source of sources) {
    const url = toStringOrNull(source.url);

    if (!url) {
      rejected.push(reject(source, "missing_url"));
      continue;
    }

    const normalized = normalizeUrl(url);

    if (!normalized) {
      rejected.push(reject(source, "invalid_url"));
      continue;
    }

    if (!isUsefulSourceUrl(normalized)) {
      rejected.push(reject(source, "generic_homepage_url"));
      continue;
    }

    const title = toStringOrNull(source.title) ?? "";
    const publisher = publisherLabelForSource(source.publisher, normalized);
    const publishedAt = toStringOrNull(source.published_at);
    const accessedAt = toStringOrNull(source.accessed_at);
    const sourceText = `${publisher} ${title} ${normalizedUrlKey(normalized)}`;

    if (matchesRejectPattern(sourceText, options.blockedDomains ?? [])) {
      rejected.push(reject(source, "blocked_or_low_quality_source"));
      continue;
    }

    const key = normalizedUrlKey(normalized);
    accepted.set(key, {
      publisher,
      title,
      url: normalized,
      published_at: publishedAt,
      accessed_at: accessedAt,
      used_for: sourceRole(source.used_for),
      source_strength: sourceStrength(source.source_strength),
    });
  }

  return {
    accepted: [...accepted.values()],
    rejected,
  };
}
