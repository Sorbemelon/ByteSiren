#!/usr/bin/env node

import {
  OUTPUTS_DIR,
  SYMBOLS,
  average,
  isMain,
  loadCandleSnapshot,
  median,
  readJson,
  readOption,
  roundNumber,
  writeJson,
} from "./shared.mjs";
import { VNEXT_C_EVENTS_PATH } from "./run-vnext-c.mjs";

export const DAILY_OVERVIEWS_PATH = `${OUTPUTS_DIR}/daily_overviews.json`;

function utcDayRange(dateUtc) {
  return {
    day_start: `${dateUtc}T00:00:00.000Z`,
    day_end: `${dateUtc}T23:59:59.999Z`,
  };
}

function daysInSnapshot(candlesBySymbol) {
  const days = new Set();

  for (const symbol of SYMBOLS) {
    for (const candle of candlesBySymbol[symbol] ?? []) {
      days.add(candle.open_time.slice(0, 10));
    }
  }

  return [...days].sort();
}

function dailySymbolStats(candles) {
  if (candles.length === 0) {
    return null;
  }

  const first = candles[0];
  const last = candles.at(-1);
  const high = Math.max(...candles.map((candle) => candle.high));
  const low = Math.min(...candles.map((candle) => candle.low));
  const movePct = first.open > 0 ? ((last.close / first.open) - 1) * 100 : 0;
  const rangePct = first.open > 0 ? ((high - low) / first.open) * 100 : 0;

  return {
    symbol: first.symbol,
    move_pct: roundNumber(movePct, 4),
    range_pct: roundNumber(rangePct, 4),
    high,
    low,
  };
}

function marketTone(movePct, rangePct, topMoves) {
  const up = topMoves.filter((item) => item.move_pct >= 1).length;
  const down = topMoves.filter((item) => item.move_pct <= -1).length;

  if (rangePct >= 4) return "volatile";
  if (movePct >= 1 && up >= 3) return "risk_on";
  if (movePct <= -1 && down >= 3) return "risk_off";
  if (Math.abs(movePct) < 0.5 && rangePct < 2) return "quiet";
  if (movePct > 0 && down >= 1) return "relief";
  return "mixed";
}

function summaryHint(tone, movePct, rangePct) {
  const move = `${movePct >= 0 ? "+" : ""}${roundNumber(movePct, 1)}%`;
  const range = `${roundNumber(rangePct, 1)}%`;

  return `${tone.replace(/_/g, " ")} day; 24h change ${move}; notable range ${range}.`;
}

export function generateDailyOverviews({ snapshot, signalEvents = [] }) {
  const days = daysInSnapshot(snapshot.candles_by_symbol);

  return days.map((dateUtc) => {
    const stats = SYMBOLS.map((symbol) =>
      dailySymbolStats(
        (snapshot.candles_by_symbol[symbol] ?? []).filter(
          (candle) => candle.open_time.slice(0, 10) === dateUtc,
        ),
      ),
    ).filter(Boolean);
    const market24hMovePct = roundNumber(
      median(stats.map((item) => item.move_pct)) ?? 0,
      4,
    );
    const marketRangePct = roundNumber(
      average(stats.map((item) => item.range_pct)) ?? 0,
      4,
    );
    const topSymbolMoves = [...stats]
      .sort((a, b) => Math.abs(b.move_pct) - Math.abs(a.move_pct))
      .slice(0, 5);
    const notableSymbols = topSymbolMoves
      .filter((item) => Math.abs(item.move_pct) >= 1 || item.range_pct >= 2)
      .map((item) => item.symbol);
    const dayEvents = signalEvents.filter(
      (event) => event.window_start.slice(0, 10) === dateUtc,
    );
    const tone = marketTone(market24hMovePct, marketRangePct, topSymbolMoves);
    const { day_start, day_end } = utcDayRange(dateUtc);

    return {
      item_type: "daily_overview",
      date_utc: dateUtc,
      day_start,
      day_end,
      market_tone: tone,
      market_24h_move_pct: market24hMovePct,
      market_range_pct: marketRangePct,
      notable_symbols: notableSymbols,
      top_symbol_moves: topSymbolMoves,
      has_publishable_signal_events: dayEvents.some(
        (event) => event.publish_candidate,
      ),
      summary_hint: summaryHint(tone, market24hMovePct, marketRangePct),
      claude_payload: {
        item_type: "daily_overview",
        date_utc: dateUtc,
        market_tone: tone,
        change_label: "24h Change",
        market_24h_move_pct: market24hMovePct,
        market_range_pct: marketRangePct,
        notable_symbols: notableSymbols,
        publishable_signal_event_ids: dayEvents
          .filter((event) => event.publish_candidate)
          .map((event) => event.event_id),
        no_trading_advice: true,
      },
      source_query_hints: [
        `crypto market overview ${dateUtc}`,
        `bitcoin ethereum solana xrp market context ${dateUtc}`,
      ],
    };
  });
}

export async function runDailyOverviews(
  options,
  { logger = console } = {},
) {
  const snapshot = await loadCandleSnapshot(options.inputPath);
  let signalEvents = [];

  try {
    signalEvents = (await readJson(options.signalEventsPath)).events ?? [];
  } catch {
    signalEvents = [];
  }

  const overviews = generateDailyOverviews({ snapshot, signalEvents });
  await writeJson(options.outputPath, {
    generated_at: new Date().toISOString(),
    item_count: overviews.length,
    items: overviews,
  });
  logger.log(`Daily overviews complete: ${overviews.length} days.`);

  return overviews;
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    inputPath: readOption(argv, "--input"),
    signalEventsPath: readOption(argv, "--events") ?? VNEXT_C_EVENTS_PATH,
    outputPath: readOption(argv, "--output") ?? DAILY_OVERVIEWS_PATH,
  };
}

if (isMain(import.meta.url)) {
  runDailyOverviews(parseArgs()).catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Daily overview failed.",
    );
    process.exitCode = 1;
  });
}
