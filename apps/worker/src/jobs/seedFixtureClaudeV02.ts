import {
  upsertClaudeBriefV02,
  upsertSourceReferencesV02,
} from "../db/claudeRepositoryV02.ts";
import type {
  ClaudePromptModeV02,
  ClaudeTargetTypeV02,
  SourceTagV02,
} from "../services/claudeV02/index.ts";
import type { SourceReferenceInputV02 } from "../services/claudeV02/sourcePolicy.ts";

interface FixtureSignalTarget {
  id: string;
  date_utc: string;
  event_start: string;
  event_end: string;
}

interface FixtureDailyTarget {
  id: string;
  date_utc: string;
  day_start: string;
  day_end: string;
}

interface ExperimentFixtureSource {
  catalyst_event_id: string;
  catalyst_headline: string;
  publisher: string;
  title: string;
  url: string;
  published_at: string;
  source_support: "high" | "medium";
  context_decision: "keep" | "conditional_keep";
  why_relevant: string;
}

export interface FixtureClaudeSeedV02Result {
  status: "seeded" | "skipped";
  fixture_only: true;
  signal_targets: number;
  daily_targets: number;
  briefs_written: number;
  sources_written: number;
  source_rows_attempted: number;
  source_dates: string[];
  message: string;
}

const FIXTURE_PROMPT_VERSION = "v02-fixture-experiment-news";

const EXPERIMENT_NEWS_FIXTURES: ExperimentFixtureSource[] = [
  {
    catalyst_event_id: "btc-etf-outflow-liquidation-risk-off-may23-context",
    catalyst_headline:
      "Crypto majors flashed green after a broad sell-off and liquidation pressure eased.",
    publisher: "The Crypto Times",
    title:
      "Crypto Market Today: BTC, ETH, SOL, XRP, BNB Flash Green After Sell-Off",
    url: "https://www.cryptotimes.io/2026/05/25/crypto-market-today-btc-eth-sol-xrp-bnb-flash-green-after-sell-off/",
    published_at: "2026-05-25T15:50:39.000Z",
    source_support: "high",
    context_decision: "conditional_keep",
    why_relevant:
      "Experiment source recheck marked this as a conditional keep broad-market source near detected crypto recovery windows.",
  },
  {
    catalyst_event_id: "geo-us-iran-strikes-hormuz-may26-28",
    catalyst_headline:
      "U.S.-Iran/Hormuz tension coincided with broad crypto liquidation pressure.",
    publisher: "CoinDesk",
    title:
      "Bitcoin drops below $73,000 as U.S. strikes on Iran spark $1 billion liquidations",
    url: "https://www.coindesk.com/markets/2026/05/28/bitcoin-drops-below-usd73-000-as-us-strikes-on-iran-spark-usd1-billion-liquidations",
    published_at: "2026-05-26T11:20:16.602Z",
    source_support: "high",
    context_decision: "keep",
    why_relevant:
      "Experiment source recheck marked this as a keep source for geopolitical/liquidation context affecting broad crypto moves.",
  },
  {
    catalyst_event_id: "geo-us-iran-strikes-hormuz-may26-28",
    catalyst_headline:
      "U.S.-Iran/Hormuz tension created risk-market pressure around crypto.",
    publisher: "CryptoBriefing",
    title:
      "US strikes Iranian air defenses and drone site as Hormuz tensions rattle crypto markets",
    url: "https://cryptobriefing.com/us-iran-hormuz-strikes-crypto-markets/",
    published_at: "2026-05-26T11:20:16.602Z",
    source_support: "high",
    context_decision: "keep",
    why_relevant:
      "Experiment source recheck marked this as a keep source for geopolitical risk context around crypto market moves.",
  },
  {
    catalyst_event_id: "dtcc-stellar-tokenization-announcement",
    catalyst_headline:
      "DTCC selected Stellar for tokenized-securities settlement work, adding project-specific context.",
    publisher: "CoinDesk",
    title:
      "DTCC plans to bring tokenized assets to Stellar in latest Wall Street blockchain push",
    url: "https://www.coindesk.com/business/2026/05/27/dtcc-plans-to-bring-tokenized-assets-to-stellar-in-latest-wall-street-blockchain-push",
    published_at: "2026-05-27T14:03:00.000Z",
    source_support: "high",
    context_decision: "keep",
    why_relevant:
      "Experiment catalyst audit treated this as a high-support institutional catalyst with an exact source timestamp.",
  },
  {
    catalyst_event_id: "us-pce-gdp-macro-slowdown-may29",
    catalyst_headline:
      "U.S. macro slowdown and inflation data shaped risk-asset context.",
    publisher: "PANEWS",
    title: "Crypto Market Update and Macro Data Context",
    url: "https://www.panewslab.com/en/articles/019e7de2-a48e-76bd-8cea-5e9a7fb97047",
    published_at: "2026-05-29T13:30:00.000Z",
    source_support: "medium",
    context_decision: "conditional_keep",
    why_relevant:
      "Experiment audit retained this as conditional daily/macro context for broad crypto movement review.",
  },
  {
    catalyst_event_id: "btc-etf-outflow-risk-june",
    catalyst_headline:
      "Bitcoin ETF outflow pressure and market-structure commentary appeared in the June experiment set.",
    publisher: "Bitcoin.com News",
    title: "Bitcoin ETF inflows and Ethereum outflows in June 2026",
    url: "https://news.bitcoin.com/bitcoin-etf-inflows-ethereum-outflows-june-2026/",
    published_at: "2026-06-10T12:00:00.000Z",
    source_support: "medium",
    context_decision: "conditional_keep",
    why_relevant:
      "Experiment audit kept ETF-flow context as a useful source marker for June market-structure checks.",
  },
  {
    catalyst_event_id: "coindesk-bitcoin-bottom-signal-june17",
    catalyst_headline:
      "Holder accumulation and bottom-signal commentary appeared near mid-June crypto movement.",
    publisher: "CoinDesk",
    title:
      "Live Markets: A Bitcoin bottom signal flashed as holders absorbed 125,000 BTC in June",
    url: "https://www.coindesk.com/tech/2026/06/17/live-markets-a-bitcoin-bottom-signal-flashed-as-holders-absorbed-125-000-btc-in-june",
    published_at: "2026-06-17T13:00:00.000Z",
    source_support: "high",
    context_decision: "keep",
    why_relevant:
      "Experiment recheck retained this as a high-support source for source-marker timing around mid-June chart context.",
  },
  {
    catalyst_event_id: "microsoft-crypto-wallet-malware-june19",
    catalyst_headline:
      "Microsoft warned about crypto-wallet malware spreading through removable media.",
    publisher: "CoinDesk",
    title:
      "Microsoft found malware that hijacks crypto wallets and spreads through USB sticks",
    url: "https://www.coindesk.com/tech/2026/06/19/microsoft-found-malware-that-hijacks-crypto-wallets-and-spreads-through-usb-sticks",
    published_at: "2026-06-19T15:00:00.000Z",
    source_support: "medium",
    context_decision: "conditional_keep",
    why_relevant:
      "Experiment source recheck included this as a June public-source candidate for UI source marker review.",
  },
];

function minutesFrom(dateTime: string): number {
  const parsed = Date.parse(dateTime);
  return Number.isFinite(parsed) ? parsed / 60000 : 0;
}

function nearestFixture(dateTime: string, offset = 0): ExperimentFixtureSource {
  const target = minutesFrom(dateTime);
  const sorted = [...EXPERIMENT_NEWS_FIXTURES].sort((a, b) => {
    const aDistance = Math.abs(minutesFrom(a.published_at) - target);
    const bDistance = Math.abs(minutesFrom(b.published_at) - target);

    if (aDistance !== bDistance) {
      return aDistance - bDistance;
    }

    return a.url.localeCompare(b.url);
  });

  return sorted[offset % sorted.length];
}

async function listSignalTargets(
  db: D1Database,
): Promise<FixtureSignalTarget[]> {
  const rows = await db
    .prepare(
      `SELECT
        id,
        date_utc,
        event_start,
        event_end
       FROM signal_events_v02
       WHERE event_start >= ?
         AND publish_candidate = 1
       ORDER BY event_end DESC, event_start DESC
       LIMIT ?`,
    )
    .bind("0000-00-00T00:00:00.000Z", 3)
    .all<FixtureSignalTarget>();

  return rows.results;
}

async function listDailyTargets(db: D1Database): Promise<FixtureDailyTarget[]> {
  const rows = await db
    .prepare(
      `SELECT
        id,
        date_utc,
        day_start,
        day_end
       FROM daily_overviews_v02
       ORDER BY date_utc DESC
       LIMIT ?`,
    )
    .bind(3)
    .all<FixtureDailyTarget>();

  return rows.results;
}

function supportFromFixture(
  source: ExperimentFixtureSource,
): "high" | "medium" {
  return source.source_support;
}

function timingAlignmentForTarget(
  source: ExperimentFixtureSource,
  targetDateUtc: string,
): "exact" | "same_day" | "broad" {
  if (source.published_at.slice(0, 10) === targetDateUtc) {
    return "same_day";
  }

  const deltaDays = Math.abs(
    (Date.parse(`${source.published_at.slice(0, 10)}T00:00:00.000Z`) -
      Date.parse(`${targetDateUtc}T00:00:00.000Z`)) /
      86_400_000,
  );

  return deltaDays <= 1 ? "broad" : "broad";
}

function sourceInput(input: {
  targetType: ClaudeTargetTypeV02;
  targetId: string;
  briefId: string;
  source: ExperimentFixtureSource;
  sourceRole: SourceTagV02;
  usedFor: string;
}): SourceReferenceInputV02 {
  return {
    target_type: input.targetType,
    target_id: input.targetId,
    brief_id: input.briefId,
    source_role: input.sourceRole,
    source_strength: input.source.source_support,
    publisher: input.source.publisher,
    title: input.source.title,
    url: input.source.url,
    published_at: input.source.published_at,
    used_for: input.usedFor,
    accepted: true,
    rejection_reason: null,
    metadata: {
      fixture_only: true,
      source_dataset: "experiments/v0.2 source audit",
      catalyst_event_id: input.source.catalyst_event_id,
      catalyst_headline: input.source.catalyst_headline,
      context_decision: input.source.context_decision,
      why_relevant: input.source.why_relevant,
    },
  };
}

async function seedTarget(input: {
  db: D1Database;
  targetType: ClaudeTargetTypeV02;
  targetId: string;
  promptMode: ClaudePromptModeV02;
  dateUtc: string;
  source: ExperimentFixtureSource;
  sourceRole: SourceTagV02;
  usedFor: string;
}) {
  const status =
    input.targetType === "daily_overview_v02"
      ? "context_only"
      : input.source.context_decision === "keep"
        ? "brief_ready"
        : "context_only";
  const publicLabel =
    input.targetType === "daily_overview_v02"
      ? "Daily Context"
      : input.source.context_decision === "keep"
        ? "Likely Cause"
        : "Market Backdrop";
  const brief = await upsertClaudeBriefV02(input.db, {
    target_type: input.targetType,
    target_id: input.targetId,
    prompt_mode: input.promptMode,
    status,
    public_label: publicLabel,
    classification: publicLabel,
    confidence: input.source.source_support === "high" ? "high" : "medium",
    headline: input.source.catalyst_headline,
    collapsed_summary: input.source.title,
    context_details: `${input.source.why_relevant} This row is fixture-only local smoke data copied from the v0.2 experiment source audit; no live Claude call was made.`,
    source_support: supportFromFixture(input.source),
    source_timing_alignment: timingAlignmentForTarget(
      input.source,
      input.dateUtc,
    ),
    validation_flags: {
      fixture_only: true,
      no_live_claude_call: true,
    },
    detector_feedback: {
      source_dataset: "experiments/v0.2 source audit",
      context_decision: input.source.context_decision,
    },
    prompt_version: FIXTURE_PROMPT_VERSION,
    model: "fixture_only",
  });
  const sourceCount = await upsertSourceReferencesV02(input.db, [
    sourceInput({
      targetType: input.targetType,
      targetId: input.targetId,
      briefId: brief.id,
      source: input.source,
      sourceRole: input.sourceRole,
      usedFor: input.usedFor,
    }),
  ]);

  return { brief, sourceCount };
}

export async function seedFixtureClaudeV02(
  db: D1Database,
): Promise<FixtureClaudeSeedV02Result> {
  const [signals, dailies] = await Promise.all([
    listSignalTargets(db),
    listDailyTargets(db),
  ]);
  let briefsWritten = 0;
  let sourcesWritten = 0;
  const sourceDates = new Set<string>();

  for (const [index, signal] of signals.entries()) {
    const source = nearestFixture(signal.event_start, index);
    const { sourceCount } = await seedTarget({
      db,
      targetType: "signal_event_v02",
      targetId: signal.id,
      promptMode: "signal_event",
      dateUtc: signal.date_utc,
      source,
      sourceRole:
        source.context_decision === "keep"
          ? "Likely cause source"
          : "Backdrop source",
      usedFor: source.context_decision === "keep" ? "likely_cause" : "backdrop",
    });

    briefsWritten += 1;
    sourcesWritten += sourceCount;
    sourceDates.add(source.published_at.slice(0, 10));
  }

  for (const [index, daily] of dailies.entries()) {
    const source = nearestFixture(daily.day_end, index);
    const { sourceCount } = await seedTarget({
      db,
      targetType: "daily_overview_v02",
      targetId: daily.id,
      promptMode: "daily_overview",
      dateUtc: daily.date_utc,
      source,
      sourceRole:
        source.context_decision === "keep"
          ? "Main daily context source"
          : "Supporting daily source",
      usedFor:
        source.context_decision === "keep"
          ? "daily_context"
          : "supporting_context",
    });

    briefsWritten += 1;
    sourcesWritten += sourceCount;
    sourceDates.add(source.published_at.slice(0, 10));
  }

  if (briefsWritten === 0) {
    return {
      status: "skipped",
      fixture_only: true,
      signal_targets: 0,
      daily_targets: 0,
      briefs_written: 0,
      sources_written: 0,
      source_rows_attempted: 0,
      source_dates: [],
      message:
        "No v0.2 Signal Event or Daily Overview targets were available for fixture source seeding.",
    };
  }

  return {
    status: "seeded",
    fixture_only: true,
    signal_targets: signals.length,
    daily_targets: dailies.length,
    briefs_written: briefsWritten,
    sources_written: sourcesWritten,
    source_rows_attempted: briefsWritten,
    source_dates: [...sourceDates].sort(),
    message:
      "Seeded fixture-only v0.2 Claude/source rows from experiment news artifacts. No live Claude call was made.",
  };
}
