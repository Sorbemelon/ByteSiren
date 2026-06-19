#!/usr/bin/env node

import {
  OUTPUTS_DIR,
  isMain,
  readJson,
  readOption,
  roundNumber,
  writeJson,
  writeText,
} from "./shared.mjs";
import { buildFeedContract } from "./build-feed-contract.mjs";
import { DAILY_OVERVIEWS_PATH } from "./generate-daily-overviews.mjs";
import { VNEXT_B_EVENTS_PATH } from "./run-vnext-b.mjs";

export const GROUPED_FEED_PREVIEW_JSON_PATH = `${OUTPUTS_DIR}/grouped_feed_preview.json`;
export const GROUPED_FEED_PREVIEW_MD_PATH = `${OUTPUTS_DIR}/grouped_feed_preview.md`;

function signPct(value, digits = 1) {
  const rounded = roundNumber(value, digits);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function sectionPreview(item) {
  if (item.item_type === "daily_overview") {
    return {
      section_id: item.id,
      item_type: "daily_overview",
      title: "Daily Overview",
      date_utc: item.date_utc,
      section_control: item.expanded.section_control,
      collapsed_preview: {
        market_tone: `Market tone: ${item.market_tone.replace(/_/g, " ")}`,
        change: `${item.change_label}: ${signPct(item.change_pct)}`,
        summary_hint: item.expanded.daily_market_summary_fields.summary_hint,
        public_context: "Public Context placeholder",
      },
      expanded_preview: item.expanded,
      chart_interaction: item.chart,
      contract_item: item,
    };
  }

  return {
    section_id: item.id,
    item_type: "signal_event",
    title: "Signal Event",
    date_utc: item.date_utc,
    section_control: item.expanded.section_control,
    collapsed_preview: {
      time_window: item.display_window,
      direction: item.direction_label,
      signals: `Signals: ${item.signals_count} of ${item.n_tracked}`,
      avg_change: `${item.avg_change_label}: ${signPct(item.avg_change_pct)}`,
      range_context: `Range Position: ${item.event_range_context_label}`,
      impact: `Impact: ${item.impact_label}`,
      public_context: "Public Context placeholder",
    },
    expanded_preview: item.expanded,
    chart_interaction: item.chart,
    contract_item: item,
  };
}

function auditPreview(event) {
  return {
    id: event.event_id,
    date_utc: event.window_start.slice(0, 10),
    evidence_window: {
      start: event.window_start,
      end: event.window_end,
      duration_min: event.duration_min,
    },
    direction: event.direction,
    change_pct: roundNumber(event.window_move_pct, 4),
    signals_count: event.signals_count,
    n_tracked: event.n_tracked,
    suppress_reason: event.suppress_reason,
    chart: {
      chart_highlight_type: "event_window",
      highlight_start: event.window_start,
      highlight_end: event.window_end,
      peak_marker_time: event.peak_time,
      feed_card_id: `audit_${event.event_id}`,
      selection_toggle: true,
      background_click_clears_selection: true,
    },
  };
}

function dayPostPreview(group) {
  const sections = group.items.map(sectionPreview);
  const collapsedSections = sections.filter(
    (section) => section.section_id === group.default_collapsed_item_id,
  );

  return {
    day_post_id: group.day_post_id,
    date_utc: group.date_utc,
    display_date: group.display_date,
    is_current_utc_day: group.is_current_utc_day,
    item_count: group.item_count,
    hidden_item_count_when_collapsed: group.hidden_item_count_when_collapsed,
    has_extra_items: group.has_extra_items,
    latest_item_id: group.latest_item_id,
    default_collapsed_item_id: group.default_collapsed_item_id,
    expanded_control_label: group.expanded_control_label,
    collapsed_control_label: group.collapsed_control_label,
    day_post_control: {
      expand_label: group.day_post_control.expand_label,
      collapse_label: group.day_post_control.collapse_label,
    },
    visible_item_ids_when_collapsed: group.visible_item_ids_when_collapsed,
    visible_item_ids_when_expanded: group.visible_item_ids_when_expanded,
    visible_sections_when_collapsed: collapsedSections,
    visible_sections_when_expanded: sections,
    sections,
  };
}

export function buildGroupedFeedPreview({
  dailyOverviews,
  signalEvents,
  now = new Date(),
}) {
  const contract = buildFeedContract({ dailyOverviews, signalEvents, now });
  const auditEvents = signalEvents
    .filter((event) => !event.publish_candidate)
    .sort((a, b) => b.window_start.localeCompare(a.window_start))
    .map(auditPreview);

  return {
    generated_at: now.toISOString(),
    preview_state: {
      ...contract.preview_state,
      global_controls: ["Expand days", "Collapse days"],
      section_controls: ["Show more", "Hide"],
    },
    public_preview: {
      grouping: "utc_day",
      day_post_count: contract.day_groups.length,
      day_posts: contract.day_groups.map(dayPostPreview),
    },
    audit_only: {
      non_public_detected_count: auditEvents.length,
      non_publishable_detected_events: auditEvents,
    },
    glossary: {
      avg_change:
        "Avg Change is the median change of participating symbols across the evidence window.",
      window_change: "Window Change is one symbol's change across the evidence window.",
      peak_15m:
        "Peak 15m is the strongest single 15-minute change inside the event window.",
      lead_mover:
        "Lead mover is the symbol with the strongest event-window contribution, highlighted in the table.",
      range_position:
        "Range Position shows where the event sits relative to the recent 24h high/low range.",
      daily_overview: "Daily Overview is a full UTC-day context summary.",
      signal_event: "Signal Event is a compact evidence-window anomaly.",
      show_more_hide:
        "Show more and Hide expand details inside one Daily Overview or Signal Event section.",
      expand_days_collapse_days:
        "Expand days and Collapse days expand or collapse parent day posts.",
      day_post_control:
        "+N events · Expand post shows hidden items for one day post; Collapse post returns that post to its default item.",
    },
  };
}

function markdownSectionLine(section) {
  if (section.item_type === "daily_overview") {
    return `${section.collapsed_preview.market_tone}; ${section.collapsed_preview.change}; ${section.collapsed_preview.summary_hint}`;
  }

  return `${section.collapsed_preview.time_window}; ${section.collapsed_preview.direction}; ${section.collapsed_preview.signals}; ${section.collapsed_preview.avg_change}; ${section.collapsed_preview.range_context}; ${section.collapsed_preview.impact}`;
}

function markdownPost(lines, post, sections, controlLabel) {
  lines.push(`### ${post.display_date}`);
  lines.push(
    `Post: ${post.item_count} items; collapsed item ${post.default_collapsed_item_id}`,
  );

  if (controlLabel) {
    lines.push(`Control: ${controlLabel}`);
  }

  for (const section of sections) {
    lines.push(`- ${section.title}: ${markdownSectionLine(section)}`);
    lines.push(
      `  Section control: ${section.section_control.collapsed_label} / ${section.section_control.expanded_label}`,
    );
  }

  lines.push("");
}

function markdown(preview) {
  const lines = [
    "# Grouped Feed Preview",
    "",
    `Days expanded: ${preview.preview_state.days_expanded}`,
    `Global control: ${preview.preview_state.global_control_label}`,
    `Global controls: ${preview.preview_state.global_controls.join(", ")}`,
    `Section controls: ${preview.preview_state.section_controls.join(", ")}`,
    "",
    "## Expanded Days State",
    "",
  ];

  for (const post of preview.public_preview.day_posts) {
    markdownPost(
      lines,
      post,
      post.visible_sections_when_expanded,
      post.expanded_control_label,
    );
  }

  lines.push("## Collapsed Days State");
  lines.push("");

  for (const post of preview.public_preview.day_posts) {
    markdownPost(
      lines,
      post,
      post.visible_sections_when_collapsed,
      post.collapsed_control_label,
    );
  }

  lines.push("## Audit-only non-public detected events");
  lines.push("");
  lines.push(`Count: ${preview.audit_only.non_public_detected_count}`);
  lines.push("");

  for (const item of preview.audit_only.non_publishable_detected_events) {
    lines.push(
      `- ${item.evidence_window.start}: ${item.direction}; Avg Change ${signPct(item.change_pct)}; Signals ${item.signals_count} of ${item.n_tracked}; ${item.suppress_reason}`,
    );
  }

  lines.push("");
  lines.push("## Glossary");
  lines.push("");
  for (const [key, value] of Object.entries(preview.glossary)) {
    lines.push(`- ${key.replace(/_/g, " ")}: ${value}`);
  }

  return lines.join("\n");
}

export async function runFeedPreview(
  options,
  { now = new Date(), logger = console } = {},
) {
  const dailyOverviews = (await readJson(options.dailyOverviewPath)).items ?? [];
  const signalEvents = (await readJson(options.signalEventsPath)).events ?? [];
  const preview = buildGroupedFeedPreview({ dailyOverviews, signalEvents, now });

  await writeJson(options.jsonOutputPath, preview);
  await writeText(options.markdownOutputPath, markdown(preview));
  logger.log(
    `Feed preview complete: ${preview.public_preview.day_posts.length} day posts.`,
  );

  return preview;
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    dailyOverviewPath: readOption(argv, "--daily") ?? DAILY_OVERVIEWS_PATH,
    signalEventsPath: readOption(argv, "--events") ?? VNEXT_B_EVENTS_PATH,
    jsonOutputPath:
      readOption(argv, "--json-output") ?? GROUPED_FEED_PREVIEW_JSON_PATH,
    markdownOutputPath:
      readOption(argv, "--md-output") ?? GROUPED_FEED_PREVIEW_MD_PATH,
  };
}

if (isMain(import.meta.url)) {
  runFeedPreview(parseArgs()).catch((error) => {
    console.error(error instanceof Error ? error.message : "Preview failed.");
    process.exitCode = 1;
  });
}
