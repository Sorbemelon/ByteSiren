/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import {
  N_TRACKED,
  SYMBOLS,
  clamp,
  median,
  nearestMinutes,
  roundNumber,
} from "./experimentShared.ts";

export const DEFAULT_VNEXT_C_OPTIONS = {
  macroThresholdBars: 1,
  barMinutes: 15,
  windowMoveMethod: "median_participating_symbols",
  robustLookbackBars: 96,
  triggerStrengthZ: 3.5,
  sustainStrengthZ: 1.5,
  // Signal Events stay compact evidence windows; longer multi-swing movement
  // belongs in the Market Story layer rather than one vague signal.
  debounceBars: 3,
  maxEventBars: 12,
  minDetectedBars: 2,
  minPublicBars: 2,
  maxPublicBars: 12,
  minValidSymbols: 3,
  highStrengthMin: 88,
  microRetraceBars: 1,
  // Window builder recovery of genuine short flashes and fragmented spikes.
  flashKeepAvgZ: 6,
  mergeGapBars: 2,
  rangeLookbackBars: 96,
  atrPeriod: 20,
  adxPeriod: 14,
  emaShort: 8,
  emaMedium: 21,
  emaLong: 55,
  nearThreshold: 0.2,
  breakBufferAtr: 0.1,
  breakBufferPct: 0.0015,
  retestToleranceAtr: 0.05,
  compressionBbwPercentile: 0.2,
  expansionBbwMultiple: 1.5,
  atrExpansionMultiple: 1.25,
  minAbsSymbolMovePct: 0.25,
  minAvgChangePublicPct: 0.45,
  minBreadthPublic: 0.6,
  minVolumeXPublic: 1.2,
  minConfirmedBreakRatio: 0.6,
  minCompressionExpansionRatio: 0.4,
  minStrongContinuationBreadth: 0.8,
  minStrongContinuationAvgChangePct: 0.7,
  minStrongContinuationAdx: 25,
  // Strong-consensus publish paths (broad impulse / relief reversal).
  broadImpulseMinPct: 1.0,
  broadImpulseMinBreadth: 0.8,
  reliefReversalMinPct: 1.0,
  // A broad break publishes when meaningfully sized OR strongly confirmed.
  broadBreakMinPct: 0.8,
  broadBreakStrongConfirmRatio: 0.8,
  // Prior-history support detection (pre-window only).
  historyContinuationPrior4hPct: 0.5,
  historyReliefPrior4hPct: 0.8,
  // Source-likelihood bands (publish lever + Claude search effort).
  sourceLikelihoodMedBand: 0.4,
  sourceLikelihoodHighBand: 0.6,
  chartContextWeakScore: 40,
  chartContextModerateScore: 55,
  chartContextStrongScore: 72,
  publishGateVersion: "vnext_c_r5_history_gate",
};

const EPSILON = 1e-9;

function withinOptionalBarCap(barCount, cap) {
  return !Number.isFinite(cap) || barCount <= cap;
}

function rotateLeft(value, bits) {
  return (value << bits) | (value >>> (32 - bits));
}

function sha1Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 1 + 8) / 64) * 64;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;

  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let offset = 0; offset < paddedLength; offset += 64) {
    const w = new Array(80);
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 80; i += 1) {
      w[i] = rotateLeft(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i += 1) {
      let f;
      let k;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (rotateLeft(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30) >>> 0;
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4]
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");
}

function sha(input) {
  return sha1Hex(input).slice(0, 8);
}

function parseTime(candle) {
  return Date.parse(candle.open_time);
}

function pctChange(start, end) {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    Math.abs(start) < EPSILON
  ) {
    return 0;
  }

  return ((end - start) / start) * 100;
}

function eventDirectionSign(direction) {
  return direction === "observed_down" ? -1 : 1;
}

function eventDirectionWord(direction) {
  return direction === "observed_down" ? "down" : "up";
}

function roundOrNull(value, digits = 4) {
  return Number.isFinite(value) ? roundNumber(value, digits) : null;
}

function mean(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function standardDeviation(values) {
  const avg = mean(values);
  if (avg === null) return null;
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return variance === null ? null : Math.sqrt(variance);
}

function trueRange(candles, index) {
  const candle = candles[index];
  if (!candle) return null;
  const high = Number(candle.high);
  const low = Number(candle.low);
  const prevClose = Number(candles[index - 1]?.close ?? candle.close);

  return Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose),
  );
}

function simpleAverageAt(values, index, period) {
  const start = Math.max(0, index - period + 1);
  return mean(values.slice(start, index + 1));
}

function emaSeries(values, period) {
  const alpha = 2 / (period + 1);
  const output = [];
  let previous = null;

  for (const value of values) {
    if (!Number.isFinite(value)) {
      output.push(previous);
      continue;
    }

    previous =
      previous === null ? value : value * alpha + previous * (1 - alpha);
    output.push(previous);
  }

  return output;
}

function atrSeries(candles, period) {
  const trueRanges = candles.map((_, index) => trueRange(candles, index));
  return trueRanges.map((_, index) =>
    simpleAverageAt(trueRanges, index, period),
  );
}

function bollingerBandwidthSeries(candles, period = 20, stdMultiplier = 2) {
  const closes = candles.map((candle) => Number(candle.close));

  return closes.map((close, index) => {
    if (!Number.isFinite(close)) return null;
    const window = closes
      .slice(Math.max(0, index - period + 1), index + 1)
      .filter((value) => Number.isFinite(value));
    if (window.length < Math.min(5, period)) return null;
    const avg = mean(window);
    const deviation = standardDeviation(window);
    if (!avg || deviation === null) return null;
    return ((stdMultiplier * 2 * deviation) / avg) * 100;
  });
}

function percentileRank(value, values) {
  const finite = values.filter((item) => Number.isFinite(item));
  if (!Number.isFinite(value) || finite.length === 0) return null;
  const belowOrEqual = finite.filter((item) => item <= value).length;
  return belowOrEqual / finite.length;
}

function adxSeries(candles, period = 14) {
  const plusDm = [];
  const minusDm = [];
  const trueRanges = [];

  for (let index = 0; index < candles.length; index += 1) {
    if (index === 0) {
      plusDm.push(0);
      minusDm.push(0);
      trueRanges.push(trueRange(candles, index) ?? 0);
      continue;
    }

    const upMove =
      Number(candles[index].high) - Number(candles[index - 1].high);
    const downMove =
      Number(candles[index - 1].low) - Number(candles[index].low);
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trueRanges.push(trueRange(candles, index) ?? 0);
  }

  const dx = candles.map((_, index) => {
    const atr = simpleAverageAt(trueRanges, index, period);
    if (!atr || atr <= EPSILON) return 0;
    const plus = ((simpleAverageAt(plusDm, index, period) ?? 0) / atr) * 100;
    const minus = ((simpleAverageAt(minusDm, index, period) ?? 0) / atr) * 100;
    const total = plus + minus;
    return total <= EPSILON ? 0 : (Math.abs(plus - minus) / total) * 100;
  });

  return dx.map((_, index) => simpleAverageAt(dx, index, period));
}

export function computeIndicators(candles, options) {
  const closes = candles.map((candle) => Number(candle.close));

  return {
    atr: atrSeries(candles, options.atrPeriod),
    adx: adxSeries(candles, options.adxPeriod),
    emaShort: emaSeries(closes, options.emaShort),
    emaMedium: emaSeries(closes, options.emaMedium),
    emaLong: emaSeries(closes, options.emaLong),
    bbw: bollingerBandwidthSeries(candles, 20, 2),
  };
}

function findEventIndices(candles, event) {
  const startMs = Date.parse(event.window_start);
  const endMs = Date.parse(event.window_end);
  const startIndex = candles.findIndex(
    (candle) => parseTime(candle) >= startMs,
  );
  let endIndex = -1;

  for (let index = 0; index < candles.length; index += 1) {
    const time = parseTime(candles[index]);
    if (time <= endMs) endIndex = index;
  }

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return null;
  }

  return { startIndex, endIndex };
}

function twoConsecutiveClosesBeyond(closes, level, direction) {
  for (let index = 1; index < closes.length; index += 1) {
    if (
      direction === "up" &&
      closes[index - 1] >= level &&
      closes[index] >= level
    ) {
      return true;
    }
    if (
      direction === "down" &&
      closes[index - 1] <= level &&
      closes[index] <= level
    ) {
      return true;
    }
  }

  return false;
}

function closeBeyond(closes, level, direction, buffer = 0) {
  return closes.some((close) =>
    direction === "up" ? close >= level + buffer : close <= level - buffer,
  );
}

function relativeVolumeForWindow(candles, startIndex, endIndex) {
  const windowLength = endIndex - startIndex + 1;
  const windowVolume = candles
    .slice(startIndex, endIndex + 1)
    .reduce(
      (sum, candle) => sum + Number(candle.quote_volume ?? candle.volume ?? 0),
      0,
    );
  const previousTotals = [];

  for (
    let index = startIndex - windowLength;
    index >= 0 && previousTotals.length < 20;
    index -= windowLength
  ) {
    previousTotals.push(
      candles
        .slice(index, index + windowLength)
        .reduce(
          (sum, candle) =>
            sum + Number(candle.quote_volume ?? candle.volume ?? 0),
          0,
        ),
    );
  }

  const baseline = median(previousTotals);
  if (!baseline || baseline <= EPSILON) return 1;
  return windowVolume / baseline;
}

function classifyTrendStrength(adx) {
  if (adx >= 35) return "very_strong";
  if (adx >= 25) return "strong";
  if (adx >= 20) return "building";
  return "weak";
}

function mad(values) {
  const center = median(values);
  if (center === null) return null;
  return median(values.map((value) => Math.abs(value - center)));
}

function robustZ(value, baselineValues) {
  const center = median(baselineValues);
  const deviation = mad(baselineValues);

  if (center === null || deviation === null || deviation <= EPSILON) {
    return 0;
  }

  return (0.6745 * (value - center)) / deviation;
}

function candleVolume(candle) {
  return Number(candle?.quote_volume ?? candle?.volume ?? 0);
}

function candleStartReturnPct(candles, index) {
  if (index <= 0 || !candles[index] || !candles[index - 1]) return 0;
  return pctChange(
    Number(candles[index - 1].close),
    Number(candles[index].close),
  );
}

function eventWindowEndIso(candle) {
  const close = Date.parse(candle.close_time);
  const open = Date.parse(candle.open_time);
  const end = Number.isFinite(close)
    ? close - 1
    : open + DEFAULT_VNEXT_C_OPTIONS.barMinutes * 60000 - 1;
  return new Date(end).toISOString();
}

export function indexCandlesByTime(candlesBySymbol) {
  return Object.fromEntries(
    SYMBOLS.map((symbol) => [
      symbol,
      new Map(
        (candlesBySymbol[symbol] ?? []).map((candle, index) => [
          candle.open_time,
          index,
        ]),
      ),
    ]),
  );
}

export function commonTimes(candlesBySymbol, indicesBySymbol) {
  const baseSymbol =
    SYMBOLS.find((symbol) => (candlesBySymbol[symbol] ?? []).length > 0) ??
    SYMBOLS[0];

  return (candlesBySymbol[baseSymbol] ?? [])
    .map((candle) => candle.open_time)
    .filter((time) =>
      SYMBOLS.every((symbol) => indicesBySymbol[symbol]?.has(time)),
    );
}

function symbolBarFeature({ symbol, candles, index, direction, options }) {
  if (index <= options.robustLookbackBars || !candles[index - 1]) return null;

  const returns = [];
  const volumes = [];
  const ranges = [];

  for (
    let cursor = index - options.robustLookbackBars;
    cursor < index;
    cursor += 1
  ) {
    returns.push(Math.abs(candleStartReturnPct(candles, cursor)));
    volumes.push(candleVolume(candles[cursor]));
    ranges.push(trueRange(candles, cursor) ?? 0);
  }

  const returnPct = candleStartReturnPct(candles, index);
  const signedReturn = direction === "observed_down" ? -returnPct : returnPct;
  const absReturn = Math.abs(returnPct);
  const returnZ = Math.max(0, robustZ(absReturn, returns));
  const volumeBaseline = median(volumes) ?? 0;
  const volumeX =
    volumeBaseline > EPSILON
      ? candleVolume(candles[index]) / volumeBaseline
      : 1;
  const range = trueRange(candles, index) ?? 0;
  const rangeBaseline = median(ranges) ?? 0;
  const rangeX = rangeBaseline > EPSILON ? range / rangeBaseline : 1;
  const participated =
    signedReturn >= options.minAbsSymbolMovePct &&
    (returnZ >= options.sustainStrengthZ ||
      volumeX >= options.minVolumeXPublic ||
      rangeX >= options.atrExpansionMultiple);
  const score =
    returnZ +
    clamp((volumeX - 1) / 0.75, 0, 2) +
    clamp((rangeX - 1) / 0.75, 0, 2);

  return {
    symbol,
    index,
    return_pct: roundNumber(returnPct, 4),
    abs_return_pct: roundNumber(absReturn, 4),
    signed_return_pct: roundNumber(signedReturn, 4),
    return_z: roundNumber(returnZ, 4),
    volume_x: roundNumber(volumeX, 4),
    range_x: roundNumber(rangeX, 4),
    participated,
    score: roundNumber(score, 4),
  };
}

function barState({ time, candlesBySymbol, indicesBySymbol, options }) {
  const directions = ["observed_up", "observed_down"].map((direction) => {
    const features = SYMBOLS.map((symbol) => {
      const candles = candlesBySymbol[symbol] ?? [];
      const index = indicesBySymbol[symbol]?.get(time);
      if (!Number.isInteger(index)) return null;
      return symbolBarFeature({ symbol, candles, index, direction, options });
    }).filter(Boolean);
    const participating = features.filter((feature) => feature.participated);
    const breadthRatio = participating.length / Math.max(SYMBOLS.length, 1);
    const avgScore = median(participating.map((feature) => feature.score)) ?? 0;
    const avgReturnZ =
      median(participating.map((feature) => feature.return_z)) ?? 0;
    const peakZ = Math.max(
      0,
      ...participating.map((feature) => feature.return_z),
    );
    const marketStrength = avgScore + breadthRatio * 2;

    return {
      direction,
      features,
      participating,
      breadth_count: participating.length,
      breadth_ratio: roundNumber(breadthRatio, 4),
      avg_score: roundNumber(avgScore, 4),
      avg_return_z: roundNumber(avgReturnZ, 4),
      peak_z: roundNumber(peakZ, 4),
      market_strength: roundNumber(marketStrength, 4),
    };
  });
  const winner = [...directions].sort(
    (a, b) =>
      b.market_strength - a.market_strength ||
      b.breadth_count - a.breadth_count,
  )[0];

  return {
    time,
    direction: winner.direction,
    features: winner.features,
    participating: winner.participating,
    breadth_count: winner.breadth_count,
    breadth_ratio: winner.breadth_ratio,
    avg_return_z: winner.avg_return_z,
    peak_z: winner.peak_z,
    market_strength: winner.market_strength,
    trigger:
      winner.breadth_count >= options.minValidSymbols &&
      winner.avg_return_z >= options.triggerStrengthZ,
    sustain:
      winner.breadth_count >= 2 &&
      winner.avg_return_z >= options.sustainStrengthZ,
  };
}

function closeWindow(active, endCursor) {
  const states = active.states.slice();
  return {
    start_cursor: active.startCursor,
    end_cursor: endCursor,
    direction: active.direction,
    peak_cursor: active.peakCursor,
    peak_strength: active.peakStrength,
    peak_z: Math.max(0, ...states.map((state) => state.peak_z ?? 0)),
    peak_avg_z: Math.max(0, ...states.map((state) => state.avg_return_z ?? 0)),
    max_breadth: Math.max(
      0,
      ...states.map((state) => state.breadth_count ?? 0),
    ),
    states,
  };
}

export function detectVNextCWindows({ candlesBySymbol, options = {} }) {
  const mergedOptions = { ...DEFAULT_VNEXT_C_OPTIONS, ...options };
  const indicesBySymbol = indexCandlesByTime(candlesBySymbol);
  const times = commonTimes(candlesBySymbol, indicesBySymbol);
  const states = times.map((time) =>
    barState({
      time,
      candlesBySymbol,
      indicesBySymbol,
      options: mergedOptions,
    }),
  );
  const windows = [];
  let active = null;

  for (let cursor = 0; cursor < states.length; cursor += 1) {
    const state = states[cursor];

    if (!active) {
      if (state.trigger) {
        active = {
          startCursor: cursor,
          endCursor: cursor,
          direction: state.direction,
          peakCursor: cursor,
          peakStrength: state.market_strength,
          calmBars: 0,
          states: [state],
        };
      }
      continue;
    }

    const sameDirection = state.direction === active.direction;
    const withinCap = withinOptionalBarCap(
      cursor - active.startCursor + 1,
      mergedOptions.maxEventBars,
    );
    const sustained = sameDirection && state.sustain && withinCap;

    if (sustained) {
      active.endCursor = cursor;
      active.states.push(state);
      active.calmBars = 0;
      if (state.market_strength > active.peakStrength) {
        active.peakCursor = cursor;
        active.peakStrength = state.market_strength;
      }
      continue;
    }

    active.calmBars += 1;
    if (!withinCap || active.calmBars > mergedOptions.debounceBars) {
      windows.push(closeWindow(active, active.endCursor));
      active = state.trigger
        ? {
            startCursor: cursor,
            endCursor: cursor,
            direction: state.direction,
            peakCursor: cursor,
            peakStrength: state.market_strength,
            calmBars: 0,
            states: [state],
          }
        : null;
    }
  }

  if (active) {
    windows.push(closeWindow(active, active.endCursor));
  }

  return { windows, states, times, indicesBySymbol, options: mergedOptions };
}

// Consolidate fragmented same-direction windows that are separated by only a
// couple of calm bars into one evidence window, without exceeding the bar cap.
function mergeAdjacentWindows(windows, options) {
  if (windows.length === 0) return windows;
  const merged = [windows[0]];

  for (let index = 1; index < windows.length; index += 1) {
    const previous = merged[merged.length - 1];
    const current = windows[index];
    const gapBars = current.start_cursor - previous.end_cursor - 1;
    const combinedBars = current.end_cursor - previous.start_cursor + 1;

    if (
      current.direction === previous.direction &&
      gapBars >= 0 &&
      gapBars <= options.mergeGapBars &&
      withinOptionalBarCap(combinedBars, options.maxEventBars)
    ) {
      const keepPreviousPeak = previous.peak_strength >= current.peak_strength;
      merged[merged.length - 1] = {
        start_cursor: previous.start_cursor,
        end_cursor: current.end_cursor,
        direction: previous.direction,
        peak_cursor: keepPreviousPeak
          ? previous.peak_cursor
          : current.peak_cursor,
        peak_strength: Math.max(previous.peak_strength, current.peak_strength),
        peak_z: Math.max(previous.peak_z ?? 0, current.peak_z ?? 0),
        peak_avg_z: Math.max(previous.peak_avg_z ?? 0, current.peak_avg_z ?? 0),
        max_breadth: Math.max(
          previous.max_breadth ?? 0,
          current.max_breadth ?? 0,
        ),
        states: [...previous.states, ...current.states],
        merged_from: (previous.merged_from ?? 1) + 1,
      };
    } else {
      merged.push(current);
    }
  }

  return merged;
}

export function classifyRangePosition({
  prevHigh,
  prevLow,
  eventHigh,
  eventLow,
  eventClose,
  eventCloses = [],
  atrPre = 0,
  volumeX = 1,
  options = DEFAULT_VNEXT_C_OPTIONS,
}) {
  const span = Math.max(prevHigh - prevLow, EPSILON);
  const buffer = Math.max(
    options.breakBufferAtr * Math.max(atrPre, 0),
    options.breakBufferPct * Math.max(Math.abs(eventClose), EPSILON),
  );
  const retestTolerance = options.retestToleranceAtr * Math.max(atrPre, 0);
  const closeBuffer = 0.05 * Math.max(atrPre, 0);
  const highBreach = eventHigh >= prevHigh + buffer;
  const lowBreach = eventLow <= prevLow - buffer;
  const highConfirmed =
    highBreach &&
    (closeBeyond(eventCloses, prevHigh, "up", closeBuffer) ||
      twoConsecutiveClosesBeyond(eventCloses, prevHigh, "up") ||
      eventClose >= prevHigh - retestTolerance ||
      (closeBeyond(eventCloses, prevHigh, "up", 0) &&
        volumeX >= options.minVolumeXPublic));
  const lowConfirmed =
    lowBreach &&
    (closeBeyond(eventCloses, prevLow, "down", closeBuffer) ||
      twoConsecutiveClosesBeyond(eventCloses, prevLow, "down") ||
      eventClose <= prevLow + retestTolerance ||
      (closeBeyond(eventCloses, prevLow, "down", 0) &&
        volumeX >= options.minVolumeXPublic));
  const pctInRange = (eventClose - prevLow) / span;

  let rangePosition = "inside_range";
  let rangeBreakDirection = "none";
  let rangeBreakPct = 0;
  let rangeBreakStrength = 0;
  let rangeBreakConfirmed = false;

  if (highConfirmed) {
    rangePosition = "broke_high";
    rangeBreakDirection = "up";
    rangeBreakPct = pctChange(prevHigh, Math.max(eventHigh, eventClose));
    rangeBreakStrength = Math.max(1, rangeBreakPct / 0.25);
    rangeBreakConfirmed = true;
  } else if (lowConfirmed) {
    rangePosition = "broke_low";
    rangeBreakDirection = "down";
    rangeBreakPct = pctChange(prevLow, Math.min(eventLow, eventClose));
    rangeBreakStrength = Math.max(1, Math.abs(rangeBreakPct) / 0.25);
    rangeBreakConfirmed = true;
  } else if (pctInRange >= 1 - options.nearThreshold) {
    rangePosition = "near_high";
  } else if (pctInRange <= options.nearThreshold) {
    rangePosition = "near_low";
  }

  return {
    range_position: rangePosition,
    range_break_direction: rangeBreakDirection,
    range_break_type:
      rangeBreakDirection === "up"
        ? "broke_high"
        : rangeBreakDirection === "down"
          ? "broke_low"
          : "none",
    range_break_confirmed: rangeBreakConfirmed,
    range_break_pct: roundNumber(rangeBreakPct, 4),
    range_break_strength: roundNumber(rangeBreakStrength, 4),
    pct_in_range: roundNumber(pctInRange, 4),
  };
}

export function computeSymbolChartContext({
  symbol,
  event,
  candles,
  indicators = computeIndicators(candles, DEFAULT_VNEXT_C_OPTIONS),
  options = DEFAULT_VNEXT_C_OPTIONS,
}) {
  const indices = findEventIndices(candles, event);

  if (!indices) {
    return {
      symbol,
      valid_chart_context: false,
      chart_context_warning: "missing_event_candles",
    };
  }

  const { startIndex, endIndex } = indices;
  const referenceIndex = startIndex - 1;
  const previousStart = Math.max(0, startIndex - options.rangeLookbackBars);
  const previous = candles.slice(previousStart, startIndex);
  const eventWindow = candles.slice(startIndex, endIndex + 1);

  if (previous.length === 0 || !candles[referenceIndex]) {
    return {
      symbol,
      valid_chart_context: false,
      chart_context_warning: "insufficient_prior_candles",
      lookback_bars_used: previous.length,
    };
  }

  const prevHigh = Math.max(...previous.map((candle) => Number(candle.high)));
  const prevLow = Math.min(...previous.map((candle) => Number(candle.low)));
  const eventHigh = Math.max(
    ...eventWindow.map((candle) => Number(candle.high)),
  );
  const eventLow = Math.min(...eventWindow.map((candle) => Number(candle.low)));
  const eventClose = Number(eventWindow.at(-1).close);
  const eventCloses = eventWindow.map((candle) => Number(candle.close));
  const startPrice = Number(candles[referenceIndex].close);
  const windowChangePct = pctChange(startPrice, eventClose);
  const volumeX = relativeVolumeForWindow(candles, startIndex, endIndex);
  const atrPre =
    indicators.atr[referenceIndex] ?? trueRange(candles, referenceIndex) ?? 0;
  const range = classifyRangePosition({
    prevHigh,
    prevLow,
    eventHigh,
    eventLow,
    eventClose,
    eventCloses,
    atrPre,
    volumeX,
    options,
  });
  const emaShort = indicators.emaShort[referenceIndex];
  const emaMedium = indicators.emaMedium[referenceIndex];
  const emaLong = indicators.emaLong[referenceIndex];
  const shortSlopeAtr =
    referenceIndex >= 4
      ? ((emaShort ?? 0) - (indicators.emaShort[referenceIndex - 4] ?? 0)) /
        Math.max(atrPre, EPSILON)
      : 0;
  const mediumSlopeAtr =
    referenceIndex >= 8
      ? ((emaMedium ?? 0) - (indicators.emaMedium[referenceIndex - 8] ?? 0)) /
        Math.max(atrPre, EPSILON)
      : 0;
  let trendDirection = "mixed";

  if (
    emaShort > emaMedium &&
    emaMedium > emaLong &&
    shortSlopeAtr > 0 &&
    mediumSlopeAtr > 0
  ) {
    trendDirection = "up";
  } else if (
    emaShort < emaMedium &&
    emaMedium < emaLong &&
    shortSlopeAtr < 0 &&
    mediumSlopeAtr < 0
  ) {
    trendDirection = "down";
  }

  const adx14 = indicators.adx[referenceIndex] ?? 0;
  const trendStrength = classifyTrendStrength(adx14);
  const prior1hStart = Math.max(0, startIndex - 4);
  const prior4hStart = Math.max(0, startIndex - 16);
  const prior1hMovePct = pctChange(
    Number(candles[prior1hStart]?.close),
    startPrice,
  );
  const prior4hMovePct = pctChange(
    Number(candles[prior4hStart]?.close),
    startPrice,
  );
  const postEndIndex = Math.min(candles.length - 1, endIndex + 2);
  const postMovePct =
    postEndIndex > endIndex
      ? pctChange(eventClose, Number(candles[postEndIndex].close))
      : 0;
  const bbwPre = indicators.bbw[referenceIndex] ?? null;
  const bbwHistory = indicators.bbw.slice(previousStart, startIndex);
  const bbwPct96 = percentileRank(bbwPre, bbwHistory);
  const bbwMedian = median(bbwHistory);
  const eventBbwMax = Math.max(
    ...indicators.bbw
      .slice(startIndex, endIndex + 1)
      .filter((value) => Number.isFinite(value)),
    0,
  );
  const atrHistory = indicators.atr.slice(previousStart, startIndex);
  const atrMedian = median(atrHistory) ?? atrPre;
  const atrExpansionX =
    atrMedian > EPSILON ? (indicators.atr[endIndex] ?? atrPre) / atrMedian : 1;
  const compressionFlag =
    (bbwPct96 !== null && bbwPct96 <= options.compressionBbwPercentile) ||
    (Number.isFinite(bbwPre) &&
      Number.isFinite(bbwMedian) &&
      bbwPre <= 0.8 * bbwMedian);
  const expansionFlag =
    (Number.isFinite(eventBbwMax) &&
      Number.isFinite(bbwPre) &&
      bbwPre > EPSILON &&
      eventBbwMax >= options.expansionBbwMultiple * bbwPre) ||
    atrExpansionX >= options.atrExpansionMultiple;
  const squeezeBreakFlag =
    compressionFlag && expansionFlag && range.range_break_confirmed;

  return {
    symbol,
    valid_chart_context: true,
    start_index: startIndex,
    end_index: endIndex,
    lookback_bars_used: previous.length,
    prev_24h_high: roundNumber(prevHigh, 8),
    prev_24h_low: roundNumber(prevLow, 8),
    event_high: roundNumber(eventHigh, 8),
    event_low: roundNumber(eventLow, 8),
    event_close: roundNumber(eventClose, 8),
    window_change_pct: roundNumber(windowChangePct, 4),
    range_position: range.range_position,
    range_break_direction: range.range_break_direction,
    range_break_type: range.range_break_type,
    range_break_confirmed: range.range_break_confirmed,
    range_break_pct: range.range_break_pct,
    range_break_strength: range.range_break_strength,
    distance_to_range_high_pct: roundNumber(pctChange(eventClose, prevHigh), 4),
    distance_to_range_low_pct: roundNumber(pctChange(eventClose, prevLow), 4),
    trend_direction: trendDirection,
    trend_strength: trendStrength,
    adx14: roundNumber(adx14, 4),
    short_slope_atr: roundNumber(shortSlopeAtr, 4),
    medium_slope_atr: roundNumber(mediumSlopeAtr, 4),
    prior_1h_move_pct: roundNumber(prior1hMovePct, 4),
    prior_4h_move_pct: roundNumber(prior4hMovePct, 4),
    post_window_move_pct: roundNumber(postMovePct, 4),
    bbw20: roundOrNull(bbwPre, 4),
    bbw_percentile_96: roundOrNull(bbwPct96, 4),
    atr20: roundNumber(atrPre, 8),
    atr20_expansion_x: roundNumber(atrExpansionX, 4),
    compression_flag: compressionFlag,
    volatility_expansion_flag: expansionFlag,
    squeeze_break_flag: squeezeBreakFlag,
    volume_x: roundNumber(volumeX, 4),
  };
}

function countBy(items, predicate) {
  return items.filter(predicate).length;
}

function majorityValue(values, fallback = "mixed") {
  const counts = {};
  for (const value of values.filter(Boolean)) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  const [winner] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? [];
  return winner ?? fallback;
}

const TREND_STRENGTH_ORDER = ["weak", "building", "strong", "very_strong"];

// True median of ordinal categories (e.g. trend strength), not the mode.
export function ordinalMedian(values, order, fallback) {
  const ranks = values
    .map((value) => order.indexOf(value))
    .filter((rank) => rank >= 0)
    .sort((a, b) => a - b);
  if (ranks.length === 0) return fallback;
  const mid = Math.floor(ranks.length / 2);
  const rank =
    ranks.length % 2 === 1
      ? ranks[mid]
      : Math.round((ranks[mid - 1] + ranks[mid]) / 2);
  return order[clamp(rank, 0, order.length - 1)];
}

function rangeContextFromSymbols(symbols, options) {
  const valid = symbols.filter((item) => item.valid_chart_context);
  const denominator = Math.max(valid.length, 1);
  const highCount = countBy(
    valid,
    (item) =>
      item.range_position === "broke_high" && item.range_break_confirmed,
  );
  const lowCount = countBy(
    valid,
    (item) => item.range_position === "broke_low" && item.range_break_confirmed,
  );
  const mixed = highCount > 0 && lowCount > 0;
  const highRatio = highCount / denominator;
  const lowRatio = lowCount / denominator;

  if (highRatio >= options.minBreadthPublic) return "broad_broke_high";
  if (lowRatio >= options.minBreadthPublic) return "broad_broke_low";
  if (mixed) return "mixed_range_position";
  if (
    valid.length > 0 &&
    valid.every((item) =>
      ["inside_range", "near_high", "near_low"].includes(item.range_position),
    )
  ) {
    return "mostly_inside_range";
  }

  return "weak_range_context";
}

function trendContextFromSymbols(symbols) {
  const valid = symbols.filter((item) => item.valid_chart_context);
  const up = countBy(valid, (item) => item.trend_direction === "up");
  const down = countBy(valid, (item) => item.trend_direction === "down");
  const threshold = Math.ceil(valid.length * 0.6);

  if (up >= threshold) return "trend_up";
  if (down >= threshold) return "trend_down";
  if (up === 0 && down === 0) return "trend_flat";
  return "trend_mixed";
}

function trendAlignment({
  trendContext,
  direction,
  avgChangePct,
  volatilityContext,
}) {
  const directionWord = eventDirectionWord(direction);
  const trendWord =
    trendContext === "trend_up"
      ? "up"
      : trendContext === "trend_down"
        ? "down"
        : "mixed";

  if (trendWord === "mixed") return "no_clear_trend";
  if (trendWord === directionWord) return "aligned_with_trend";
  if (
    Math.abs(avgChangePct) >= 0.6 ||
    volatilityContext !== "ordinary_volatility"
  ) {
    return "trend_reversal_attempt";
  }
  return "counter_trend";
}

function momentumContextFromSymbols({
  symbols,
  direction,
  avgChangePct,
  trendAlign,
}) {
  const sign = eventDirectionSign(direction);
  const valid = symbols.filter((item) => item.valid_chart_context);
  const prior1h = median(valid.map((item) => item.prior_1h_move_pct)) ?? 0;
  const prior4h = median(valid.map((item) => item.prior_4h_move_pct)) ?? 0;
  const post = median(valid.map((item) => item.post_window_move_pct)) ?? 0;
  const alignedCount = countBy(
    valid,
    (item) =>
      sign * item.window_change_pct >=
      DEFAULT_VNEXT_C_OPTIONS.minAbsSymbolMovePct,
  );
  const directionConsistencyScore = valid.length
    ? alignedCount / valid.length
    : 0;
  const continuationAfterWindow = roundNumber(sign * post, 4);
  const reversalAfterWindow = roundNumber(Math.max(0, -sign * post), 4);
  // Causal momentum only (prior-window structure). The post-window reversal is
  // kept as a retrospective diagnostic and MUST NOT drive detection/publish.
  let momentumType = "no_clear_momentum";

  if (sign * prior4h > 0.25 && trendAlign === "aligned_with_trend") {
    momentumType = "continuation";
  } else if (
    sign * prior4h < -0.25 &&
    trendAlign === "trend_reversal_attempt"
  ) {
    momentumType = "reversal";
  } else if (
    Math.abs(avgChangePct) >= 0.6 &&
    directionConsistencyScore >= 0.6
  ) {
    momentumType = "impulse";
  }

  return {
    momentum_context: {
      prior_1h_move_pct_median: roundNumber(prior1h, 4),
      prior_4h_move_pct_median: roundNumber(prior4h, 4),
      post_window_move_pct_median: roundNumber(post, 4),
      post_window_reversal_flag: reversalAfterWindow >= 0.35,
      retrospective_post_window_only: true,
    },
    momentum_type: momentumType,
    continuation_after_window: continuationAfterWindow,
    reversal_after_window: reversalAfterWindow,
    direction_consistency_score: roundNumber(directionConsistencyScore, 4),
  };
}

function volatilityContextFromSymbols(symbols) {
  const valid = symbols.filter((item) => item.valid_chart_context);
  const compressedExpansion = countBy(
    valid,
    (item) => item.compression_flag && item.volatility_expansion_flag,
  );
  const expansion = countBy(valid, (item) => item.volatility_expansion_flag);
  const ordinary = valid.length - expansion;
  let context = "ordinary_volatility";

  if (compressedExpansion >= Math.max(1, Math.ceil(valid.length * 0.4))) {
    context = "expansion_after_compression";
  } else if (expansion >= Math.ceil(valid.length * 0.6)) {
    context = "high_volatility_continuation";
  } else if (ordinary < valid.length && expansion > 0) {
    context = "ordinary_volatility";
  }

  const score = valid.length
    ? clamp((compressedExpansion * 1.4 + expansion * 0.8) / valid.length, 0, 1)
    : 0;

  return {
    volatility_context: context,
    volatility_expansion_score: roundNumber(score * 100, 2),
  };
}

// R5 volatility_state enum: compressed | normal | expanding | compressed_to_expanding.
function volatilityStateForEvent(volatilityContext, valid) {
  const denom = Math.max(valid.length, 1);
  const compressionRatio =
    countBy(valid, (item) => item.compression_flag) / denom;
  const expansionRatio =
    countBy(valid, (item) => item.volatility_expansion_flag) / denom;

  if (volatilityContext === "expansion_after_compression") {
    return "compressed_to_expanding";
  }
  if (
    volatilityContext === "high_volatility_continuation" ||
    expansionRatio >= 0.6
  ) {
    return "expanding";
  }
  if (compressionRatio >= 0.6) return "compressed";
  return "normal";
}

// Does the PRIOR-window chart structure support detecting this point? Uses only
// causal (pre-window) signals: confirmed prior-24h break, compression that built
// up then expanded, trend continuation, or a sharp relief reversal after a strong
// prior counter-move. Events with no support stay in audit (gate prerequisite).
function historySupportForEvent({
  eventRangeContext,
  confirmedBreakRatio,
  volatilityContext,
  trendAlign,
  prior4hMedian,
  direction,
  options,
}) {
  const sign = eventDirectionSign(direction);
  const supports = [];

  if (
    eventRangeContext === "broad_broke_high" ||
    eventRangeContext === "broad_broke_low" ||
    confirmedBreakRatio >= options.minConfirmedBreakRatio
  ) {
    supports.push({
      type: "range_break",
      score: 0.5 + 0.5 * clamp(confirmedBreakRatio, 0, 1),
    });
  }
  if (volatilityContext === "expansion_after_compression") {
    supports.push({ type: "compression_breakout", score: 0.75 });
  }
  if (trendAlign === "aligned_with_trend") {
    supports.push({ type: "trend_continuation", score: 0.7 });
  }
  if (
    trendAlign === "trend_reversal_attempt" &&
    sign * prior4hMedian <= -options.historyReliefPrior4hPct
  ) {
    supports.push({ type: "relief_reversal", score: 0.65 });
  }

  if (supports.length === 0) {
    return {
      history_support_type: "none",
      history_support_score: 0,
      history_support_factors: [],
    };
  }

  const primary = [...supports].sort((a, b) => b.score - a.score)[0];
  return {
    history_support_type: primary.type,
    history_support_score: roundNumber(
      clamp(primary.score + 0.1 * (supports.length - 1), 0, 1),
      4,
    ),
    history_support_factors: supports.map((item) => item.type),
  };
}

function chartContextScore({
  event,
  eventRangeContext,
  trendAlign,
  momentumType,
  volatilityContext,
  volatilityExpansionScore,
  directionConsistencyScore,
  medianVolumeX,
  avgChangePct,
  historySupportScore = 0,
}) {
  let score = 15;

  score += directionConsistencyScore * 20;
  score += clamp(Math.abs(avgChangePct) / 1.5, 0, 1) * 10;
  score += clamp((event.signal_strength_score ?? 0) / 100, 0, 1) * 10;
  score += clamp((medianVolumeX - 1) / 1.5, 0, 1) * 10;

  if (["broad_broke_high", "broad_broke_low"].includes(eventRangeContext)) {
    score += 25;
  } else if (eventRangeContext === "mixed_range_position") {
    score -= 18;
  } else if (eventRangeContext === "mostly_inside_range") {
    score += 4;
  }

  if (trendAlign === "aligned_with_trend") score += 12;
  if (trendAlign === "trend_reversal_attempt") score += 8;
  if (trendAlign === "counter_trend") score -= 8;

  if (momentumType === "continuation") score += 10;
  if (momentumType === "reversal") score += 8;
  if (momentumType === "impulse") score += 6;

  if (volatilityContext === "expansion_after_compression") score += 12;
  if (volatilityContext === "high_volatility_continuation") score += 7;
  score += clamp(volatilityExpansionScore / 100, 0, 1) * 5;

  score += clamp(historySupportScore, 0, 1) * 15;

  if (event.macro_aligned) score += 8;
  if (Math.abs(avgChangePct) < 0.45) score -= 12;

  return roundNumber(clamp(score, 0, 100), 2);
}

function storyType({
  direction,
  eventRangeContext,
  momentumType,
  volatilityContext,
  chartContextScoreValue,
}) {
  const suffix = eventDirectionWord(direction);

  if (chartContextScoreValue < DEFAULT_VNEXT_C_OPTIONS.chartContextWeakScore) {
    return "weak_chart_context";
  }
  if (eventRangeContext === "mixed_range_position") return "mixed_context";
  if (eventRangeContext === "broad_broke_high") return "range_break_up";
  if (eventRangeContext === "broad_broke_low") return "range_break_down";
  if (momentumType === "continuation") return `momentum_continuation_${suffix}`;
  if (momentumType === "reversal") return `relief_reversal_${suffix}`;
  if (volatilityContext === "expansion_after_compression") {
    return `volatility_expansion_${suffix}`;
  }
  return `inside_range_impulse_${suffix}`;
}

function chartContextLabel({
  event,
  eventRangeContext,
  momentumType,
  volatilityContext,
  chartContextScoreValue,
}) {
  if (event.macro_aligned && chartContextScoreValue >= 45) {
    return "Macro-aligned context";
  }
  if (["broad_broke_high", "broad_broke_low"].includes(eventRangeContext)) {
    return "Range break";
  }
  if (momentumType === "continuation") return "Momentum continuation";
  if (momentumType === "reversal") return "Relief / reversal";
  if (volatilityContext === "expansion_after_compression") {
    return "Volatility expansion";
  }
  if (chartContextScoreValue < DEFAULT_VNEXT_C_OPTIONS.chartContextWeakScore) {
    return "Weak chart context";
  }
  if (
    chartContextScoreValue >= DEFAULT_VNEXT_C_OPTIONS.chartContextStrongScore
  ) {
    return "Strong chart context";
  }
  if (
    chartContextScoreValue >= DEFAULT_VNEXT_C_OPTIONS.chartContextModerateScore
  ) {
    return "Moderate chart context";
  }
  return "Inside-range impulse";
}

function chartContextReasons({
  eventRangeContext,
  trendAlign,
  momentumType,
  volatilityContext,
  directionConsistencyScore,
  medianVolumeX,
}) {
  const reasons = [];

  if (["broad_broke_high", "broad_broke_low"].includes(eventRangeContext)) {
    reasons.push("broad_range_break");
  }
  if (trendAlign === "aligned_with_trend") reasons.push("trend_aligned");
  if (trendAlign === "trend_reversal_attempt")
    reasons.push("relief_or_reversal_context");
  if (momentumType !== "no_clear_momentum")
    reasons.push(`momentum_${momentumType}`);
  if (volatilityContext === "expansion_after_compression") {
    reasons.push("volatility_expansion_after_compression");
  }
  if (directionConsistencyScore >= 0.8)
    reasons.push("strong_direction_consistency");
  if (medianVolumeX >= 1.2) reasons.push("volume_confirmation");

  return reasons;
}

function chartContextWarnings({
  eventRangeContext,
  avgChangePct,
  medianVolumeX,
}) {
  const warnings = [];

  if (eventRangeContext === "mixed_range_position")
    warnings.push("mixed_range_position");
  if (Math.abs(avgChangePct) < 0.45) warnings.push("weak_avg_change");
  if (medianVolumeX < 1.0) warnings.push("weak_volume_confirmation");

  return warnings;
}

export function computeChartContextForEvent({
  event,
  candlesBySymbol,
  indicatorsBySymbol = {},
  options = DEFAULT_VNEXT_C_OPTIONS,
}) {
  const symbols = (event.per_symbol_evidence ?? []).map((row) => row.symbol);
  const perSymbol = symbols.map((symbol) => {
    const candles = candlesBySymbol[symbol] ?? [];
    const indicators =
      indicatorsBySymbol[symbol] ?? computeIndicators(candles, options);
    return computeSymbolChartContext({
      symbol,
      event,
      candles,
      indicators,
      options,
    });
  });
  const valid = perSymbol.filter((item) => item.valid_chart_context);
  const avgChangePct =
    event.window_move_pct ??
    median(valid.map((item) => item.window_change_pct)) ??
    0;
  const eventRangeContext = rangeContextFromSymbols(perSymbol, options);
  const trendContext = trendContextFromSymbols(perSymbol);
  const volatility = volatilityContextFromSymbols(perSymbol);
  const trendAlign = trendAlignment({
    trendContext,
    direction: event.direction,
    avgChangePct,
    volatilityContext: volatility.volatility_context,
  });
  const momentum = momentumContextFromSymbols({
    symbols: perSymbol,
    direction: event.direction,
    avgChangePct,
    trendAlign,
  });
  const medianVolumeX = median(valid.map((item) => item.volume_x)) ?? 1;
  const confirmedBreakRatio = valid.length
    ? countBy(valid, (item) => item.range_break_confirmed) / valid.length
    : 0;
  const history = historySupportForEvent({
    eventRangeContext,
    confirmedBreakRatio,
    volatilityContext: volatility.volatility_context,
    trendAlign,
    prior4hMedian: momentum.momentum_context.prior_4h_move_pct_median ?? 0,
    direction: event.direction,
    options,
  });
  const score = chartContextScore({
    event,
    eventRangeContext,
    trendAlign,
    momentumType: momentum.momentum_type,
    volatilityContext: volatility.volatility_context,
    volatilityExpansionScore: volatility.volatility_expansion_score,
    directionConsistencyScore: momentum.direction_consistency_score,
    medianVolumeX,
    avgChangePct,
    historySupportScore: history.history_support_score,
  });
  const label = chartContextLabel({
    event,
    eventRangeContext,
    momentumType: momentum.momentum_type,
    volatilityContext: volatility.volatility_context,
    chartContextScoreValue: score,
  });
  const ratioOf = (predicate) =>
    valid.length ? roundNumber(countBy(valid, predicate) / valid.length, 4) : 0;
  const breadthUpRatio = ratioOf(
    (item) => item.window_change_pct >= options.minAbsSymbolMovePct,
  );
  const breadthDownRatio = ratioOf(
    (item) => item.window_change_pct <= -options.minAbsSymbolMovePct,
  );
  const breakHighRatio = ratioOf(
    (item) => item.range_position === "broke_high",
  );
  const breakLowRatio = ratioOf((item) => item.range_position === "broke_low");
  const squeezeBreakRatio = ratioOf((item) => item.squeeze_break_flag);
  const medianAdx14 = roundNumber(
    median(valid.map((item) => item.adx14)) ?? 0,
    4,
  );
  const volatilityState = volatilityStateForEvent(
    volatility.volatility_context,
    valid,
  );
  const eventSqueezeBreakFlag =
    squeezeBreakRatio >= options.minCompressionExpansionRatio;

  return {
    chart_context_score: score,
    chart_context_label: label,
    event_story_type: storyType({
      direction: event.direction,
      eventRangeContext,
      momentumType: momentum.momentum_type,
      volatilityContext: volatility.volatility_context,
      chartContextScoreValue: score,
    }),
    trend_context: {
      trend_context: trendContext,
      trend_alignment: trendAlign,
      trend_direction_majority: majorityValue(
        valid.map((item) => item.trend_direction),
        "mixed",
      ),
      trend_strength_median: ordinalMedian(
        valid.map((item) => item.trend_strength),
        TREND_STRENGTH_ORDER,
        "weak",
      ),
    },
    trend_alignment: trendAlign,
    momentum_context: momentum.momentum_context,
    momentum_type: momentum.momentum_type,
    continuation_after_window: momentum.continuation_after_window,
    reversal_after_window: momentum.reversal_after_window,
    direction_consistency_score: momentum.direction_consistency_score,
    volatility_context: volatility.volatility_context,
    volatility_expansion_score: volatility.volatility_expansion_score,
    volatility_state: volatilityState,
    history_support_type: history.history_support_type,
    history_support_score: history.history_support_score,
    history_support_factors: history.history_support_factors,
    breadth_up_ratio: breadthUpRatio,
    breadth_down_ratio: breadthDownRatio,
    break_high_ratio: breakHighRatio,
    break_low_ratio: breakLowRatio,
    confirmed_break_ratio: roundNumber(confirmedBreakRatio, 4),
    squeeze_break_ratio: squeezeBreakRatio,
    squeeze_break_flag: eventSqueezeBreakFlag,
    event_range_context: eventRangeContext,
    chart_context_reasons: chartContextReasons({
      eventRangeContext,
      trendAlign,
      momentumType: momentum.momentum_type,
      volatilityContext: volatility.volatility_context,
      directionConsistencyScore: momentum.direction_consistency_score,
      medianVolumeX,
    }),
    chart_context_warnings: chartContextWarnings({
      eventRangeContext,
      avgChangePct,
      medianVolumeX,
    }),
    chart_context_stats: {
      breadth_up_ratio: breadthUpRatio,
      breadth_down_ratio: breadthDownRatio,
      break_high_ratio: breakHighRatio,
      break_low_ratio: breakLowRatio,
      confirmed_break_ratio: roundNumber(confirmedBreakRatio, 4),
      squeeze_break_ratio: squeezeBreakRatio,
      median_adx14: medianAdx14,
      median_volume_x: roundNumber(medianVolumeX, 4),
      valid_symbol_count: valid.length,
    },
    per_symbol_chart_context: perSymbol,
  };
}

function eventStrengthLabel(score) {
  if (score >= 75) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

function nearestMacro(event, macroCalendar, options) {
  const candidates = macroCalendar
    .map((item) => {
      const openDelta = nearestMinutes(event.window_start, item.scheduled_at);
      const peakDelta = nearestMinutes(event.peak_time, item.scheduled_at);
      const deltas = [openDelta, peakDelta].filter((value) =>
        Number.isFinite(value),
      );

      if (deltas.length === 0) return null;

      return {
        id: item.id,
        type: item.type,
        title: item.title,
        scheduled_at: item.scheduled_at,
        source_query_hint: item.source_query_hint,
        delta_min: Math.min(...deltas),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.delta_min - b.delta_min);
  const nearest = candidates[0] ?? null;
  const threshold = options.macroThresholdBars * options.barMinutes;

  return {
    nearest_macro_event: nearest,
    macro_delta_min: nearest?.delta_min ?? null,
    macro_aligned: Boolean(nearest && nearest.delta_min <= threshold),
  };
}

function highlightMetadata({ leadMoverSymbol, strongestPeakSymbol }) {
  const cells = [];
  if (leadMoverSymbol) {
    cells.push({
      symbol: leadMoverSymbol,
      column: "symbol",
      reason: "lead_mover",
    });
  }
  if (strongestPeakSymbol) {
    cells.push({
      symbol: strongestPeakSymbol,
      column: "peak_15m",
      reason: "strongest_peak_15m",
    });
  }

  return {
    lead_mover_symbol: leadMoverSymbol ?? null,
    strongest_peak_symbol: strongestPeakSymbol ?? null,
    highlight_cells: cells,
  };
}

function eventIdForWindow(event) {
  const symbolKey = [...(event.symbols_involved ?? [])].sort().join("_");
  return `vnext_c_${sha(
    `${event.window_start}|${event.window_end}|${event.direction}|${symbolKey}`,
  )}_${event.window_start.replace(/[-:]/g, "").slice(0, 13).toLowerCase()}`;
}

function sourceRouteHintForEvent(event) {
  const hints = [];

  if (event.macro_aligned) hints.push("macro_aligned");
  if (
    event.event_range_context === "broad_broke_high" ||
    event.event_range_context === "broad_broke_low"
  ) {
    hints.push("broad_market");
  }
  if (
    event.chart_context_reasons?.includes(
      "volatility_expansion_after_compression",
    )
  ) {
    hints.push("possible_liquidation_context");
  }
  if (event.event_story_type?.startsWith("relief_reversal")) {
    hints.push("possible_relief_rally");
  }
  if (Math.abs(event.window_move_pct) < 1 && !event.publish_candidate) {
    hints.push("weak_route");
  }

  return hints.length ? hints : ["no_clear_route"];
}

function symbolWindowEvidence({
  symbol,
  candles,
  startIndex,
  endIndex,
  direction,
  options,
}) {
  if (!candles[startIndex] || !candles[endIndex] || !candles[startIndex - 1]) {
    return null;
  }

  const sign = eventDirectionSign(direction);
  const startPrice = Number(candles[startIndex - 1].close);
  const endPrice = Number(candles[endIndex].close);
  const windowChangePct = pctChange(startPrice, endPrice);
  const peakReturns = [];

  for (let index = startIndex; index <= endIndex; index += 1) {
    peakReturns.push(candleStartReturnPct(candles, index));
  }

  const peak15m =
    direction === "observed_down"
      ? Math.min(...peakReturns)
      : Math.max(...peakReturns);
  // Cumulative max aligned excursion: best directional close vs the pre-window
  // baseline, anywhere inside the window. Captures reactions that spike then
  // settle (muted by close-to-close). Source-free, no look-ahead past the window.
  let maxAlignedExcursion = 0;
  for (let index = startIndex; index <= endIndex; index += 1) {
    const cumulative =
      sign * pctChange(startPrice, Number(candles[index].close));
    if (cumulative > maxAlignedExcursion) maxAlignedExcursion = cumulative;
  }
  const volumeX = relativeVolumeForWindow(candles, startIndex, endIndex);
  const eventRanges = [];
  const priorRanges = [];
  const windowLength = endIndex - startIndex + 1;

  for (let index = startIndex; index <= endIndex; index += 1) {
    eventRanges.push(trueRange(candles, index) ?? 0);
  }
  for (
    let index = startIndex - windowLength;
    index >= 0 && priorRanges.length < 20;
    index -= windowLength
  ) {
    const rangeTotal = candles
      .slice(index, index + windowLength)
      .reduce(
        (sum, _candle, offset) =>
          sum + (trueRange(candles, index + offset) ?? 0),
        0,
      );
    priorRanges.push(rangeTotal);
  }

  const priorRangeMedian = median(priorRanges) ?? 0;
  const eventRangeTotal = eventRanges.reduce((sum, value) => sum + value, 0);
  const rangeX =
    priorRangeMedian > EPSILON ? eventRangeTotal / priorRangeMedian : 1;
  const participated = sign * windowChangePct >= options.minAbsSymbolMovePct;

  return {
    symbol,
    window_move_pct: roundNumber(windowChangePct, 4),
    window_change_pct: roundNumber(windowChangePct, 4),
    peak_15m_move_pct: roundNumber(peak15m, 4),
    max_aligned_excursion_pct: roundNumber(maxAlignedExcursion, 4),
    max_volume_ratio: roundNumber(volumeX, 4),
    max_range_ratio: roundNumber(rangeX, 4),
    volume_confirmed: volumeX >= options.minVolumeXPublic,
    range_confirmed: rangeX >= options.atrExpansionMultiple,
    participated,
  };
}

export function windowToCandidateEvent({
  window,
  times,
  indicesBySymbol,
  candlesBySymbol,
  macroCalendar,
  options,
}) {
  const startTime = times[window.start_cursor];
  const endTime = times[window.end_cursor];
  const peakTime = times[window.peak_cursor];
  const startIndexBySymbol = Object.fromEntries(
    SYMBOLS.map((symbol) => [symbol, indicesBySymbol[symbol]?.get(startTime)]),
  );
  const endIndexBySymbol = Object.fromEntries(
    SYMBOLS.map((symbol) => [symbol, indicesBySymbol[symbol]?.get(endTime)]),
  );
  const perSymbol = SYMBOLS.map((symbol) => {
    const startIndex = startIndexBySymbol[symbol];
    const endIndex = endIndexBySymbol[symbol];
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex))
      return null;
    return symbolWindowEvidence({
      symbol,
      candles: candlesBySymbol[symbol] ?? [],
      startIndex,
      endIndex,
      direction: window.direction,
      options,
    });
  }).filter(Boolean);
  const participated = perSymbol.filter((item) => item.participated);
  const directionSign = eventDirectionSign(window.direction);
  const involved = participated.map((item) => item.symbol);
  const movesBySymbol = Object.fromEntries(
    perSymbol.map((item) => [item.symbol, item.window_change_pct]),
  );
  const peakMovesBySymbol = Object.fromEntries(
    perSymbol.map((item) => [item.symbol, item.peak_15m_move_pct]),
  );
  const volumeConfirmations = Object.fromEntries(
    perSymbol.map((item) => [item.symbol, item.volume_confirmed]),
  );
  const rangeConfirmations = Object.fromEntries(
    perSymbol.map((item) => [item.symbol, item.range_confirmed]),
  );
  const eventMove =
    median(participated.map((item) => item.window_change_pct)) ?? 0;
  const eventMoveMean =
    mean(participated.map((item) => item.window_change_pct)) ?? 0;
  const maxAbsMove = Math.max(
    0,
    ...perSymbol.map((item) => Math.abs(item.window_change_pct)),
  );
  const peak15mAbsMax = Math.max(
    0,
    ...perSymbol.map((item) => Math.abs(item.peak_15m_move_pct)),
  );
  const relativeVolumeMedian =
    median(perSymbol.map((item) => item.max_volume_ratio)) ?? 1;
  const leadMover =
    [...perSymbol].sort(
      (a, b) =>
        directionSign * b.window_change_pct -
        directionSign * a.window_change_pct,
    )[0]?.symbol ?? null;
  const strongestPeak =
    [...perSymbol].sort(
      (a, b) =>
        directionSign * b.peak_15m_move_pct -
        directionSign * a.peak_15m_move_pct,
    )[0]?.symbol ?? null;
  const strength = roundNumber(
    clamp(
      (window.peak_strength / Math.max(options.triggerStrengthZ, EPSILON)) *
        70 +
        (participated.length / Math.max(SYMBOLS.length, 1)) * 30,
      0,
      100,
    ),
    4,
  );
  const firstCandle =
    candlesBySymbol[SYMBOLS[0]]?.[indicesBySymbol[SYMBOLS[0]]?.get(startTime)];
  const lastCandle =
    candlesBySymbol[SYMBOLS[0]]?.[indicesBySymbol[SYMBOLS[0]]?.get(endTime)];
  const candidate = {
    event_id: `candidate_${startTime}_${window.direction}`,
    item_type: "signal_event",
    direction: window.direction,
    window_start: firstCandle?.open_time ?? startTime,
    window_end: lastCandle ? eventWindowEndIso(lastCandle) : endTime,
    duration_min:
      (window.end_cursor - window.start_cursor + 1) * options.barMinutes,
    peak_time: peakTime,
    signals_count: involved.length,
    breadth_count: involved.length,
    n_tracked: N_TRACKED,
    flash_event: Boolean(window.flash_event),
    symbols_involved: involved,
    window_move_pct: roundNumber(eventMove, 4),
    window_move_pct_by_symbol: movesBySymbol,
    max_abs_window_move_pct: roundNumber(maxAbsMove, 4),
    avg_change_method: "median",
    event_direction: eventDirectionWord(window.direction),
    evidence_window_stats: {
      window_change_median: roundNumber(eventMove, 4),
      window_change_mean: roundNumber(eventMoveMean, 4),
      window_change_abs_max: roundNumber(maxAbsMove, 4),
      peak_15m_abs_max: roundNumber(peak15mAbsMax, 4),
      max_aligned_excursion_pct: roundNumber(
        median(participated.map((item) => item.max_aligned_excursion_pct)) ?? 0,
        4,
      ),
      relative_volume_median: roundNumber(relativeVolumeMedian, 4),
    },
    event_strength_label: eventStrengthLabel(strength),
    signal_strength_score: strength,
    source_route_hint: ["no_clear_route"],
    publish_candidate: false,
    publish_reason: null,
    suppress_reason: null,
    macro_aligned: false,
    nearest_macro_event: null,
    macro_delta_min: null,
    event_range_context: "weak_range_context",
    per_symbol_evidence: perSymbol,
    table_highlights: highlightMetadata({
      leadMoverSymbol: leadMover,
      strongestPeakSymbol: strongestPeak,
    }),
    diagnostics: {
      source_detector: "vnext_c_window_builder",
      window_move_method: options.windowMoveMethod,
      evidence_bar_count: window.end_cursor - window.start_cursor + 1,
      peak_market_strength: roundNumber(window.peak_strength, 4),
      bar_strengths: window.states.map((state) => ({
        time: state.time,
        direction: state.direction,
        market_strength: state.market_strength,
        breadth_count: state.breadth_count,
      })),
      peak_15m_move_pct_by_symbol: peakMovesBySymbol,
      volume_confirmation_by_symbol: volumeConfirmations,
      range_confirmation_by_symbol: rangeConfirmations,
      lead_mover: leadMover,
      direction_sign: directionSign,
    },
    tags: [],
    show_peak_details: false,
  };
  const macro = nearestMacro(candidate, macroCalendar, options);

  return {
    ...candidate,
    macro_aligned: macro.macro_aligned,
    nearest_macro_event: macro.nearest_macro_event,
    macro_delta_min: macro.macro_delta_min,
    tags: macro.macro_aligned ? ["macro_aligned"] : [],
  };
}

function vnextCEventId(event) {
  return eventIdForWindow(event);
}

function updatePerSymbolEvidence(event, chartContext) {
  const bySymbol = new Map(
    chartContext.per_symbol_chart_context.map((item) => [item.symbol, item]),
  );

  return (event.per_symbol_evidence ?? []).map((row) => {
    const chart = bySymbol.get(row.symbol) ?? {};
    return {
      ...row,
      window_change_pct: chart.window_change_pct ?? row.window_change_pct,
      prev_24h_high: chart.prev_24h_high ?? row.prev_24h_high,
      prev_24h_low: chart.prev_24h_low ?? row.prev_24h_low,
      range_position: chart.range_position ?? row.range_position,
      range_position_label: row.range_position_label,
      range_break_direction: chart.range_break_direction ?? "none",
      range_break_type: chart.range_break_type ?? "none",
      range_break_confirmed: Boolean(chart.range_break_confirmed),
      range_break_pct: chart.range_break_pct ?? 0,
      range_break_strength: chart.range_break_strength ?? 0,
      distance_to_range_high_pct: chart.distance_to_range_high_pct ?? null,
      distance_to_range_low_pct: chart.distance_to_range_low_pct ?? null,
      trend_direction: chart.trend_direction ?? "mixed",
      trend_strength: chart.trend_strength ?? "weak",
      adx14: chart.adx14 ?? 0,
      short_slope_atr: chart.short_slope_atr ?? 0,
      medium_slope_atr: chart.medium_slope_atr ?? 0,
      bbw20: chart.bbw20 ?? null,
      bbw_percentile_96: chart.bbw_percentile_96 ?? null,
      atr20: chart.atr20 ?? null,
      atr20_expansion_x: chart.atr20_expansion_x ?? 1,
      compression_flag: Boolean(chart.compression_flag),
      volatility_expansion_flag: Boolean(chart.volatility_expansion_flag),
      squeeze_break_flag: Boolean(chart.squeeze_break_flag),
    };
  });
}

// Doc-2 source-likelihood (0-1): how likely a findable public cause exists.
// Sets the publish lever (broad_impulse/relief paths) and Claude search effort.
// Uses only causal fields (breadth, magnitude, macro, prior-history support,
// single-name concentration); penalizes pure volatility and thin liquidity.
function scoreSourceLikelihood(event, options) {
  const stats = event.chart_context_stats ?? {};
  const breadth = event.direction_consistency_score ?? 0;
  const avgAbs = Math.abs(event.window_move_pct ?? 0);
  const maxAbs = event.max_abs_window_move_pct ?? avgAbs;
  const medianVolumeX = stats.median_volume_x ?? 1;
  const historySupport = event.history_support_score ?? 0;
  const reasons = [];
  let score = 0.1;

  score += clamp(avgAbs / 2, 0, 1) * 0.3;
  if (avgAbs >= 1) reasons.push("large_move");

  score += clamp(breadth, 0, 1) * 0.25;
  if (breadth >= options.broadImpulseMinBreadth) {
    reasons.push("broad_participation");
  }

  score += clamp(historySupport, 0, 1) * 0.15;
  if (historySupport > 0) {
    reasons.push(`history_${event.history_support_type}`);
  }

  if (event.macro_aligned) {
    score += 0.15;
    reasons.push("macro_aligned");
  }

  if (
    breadth < options.minBreadthPublic &&
    maxAbs >= avgAbs * 1.8 &&
    maxAbs >= 1
  ) {
    score += 0.1;
    reasons.push("single_name_concentration");
  }

  if (medianVolumeX >= options.minVolumeXPublic) {
    score += 0.1;
    reasons.push("volume_confirmation");
  }

  if (
    (event.volatility_context === "expansion_after_compression" ||
      event.volatility_context === "high_volatility_continuation") &&
    medianVolumeX < options.minVolumeXPublic
  ) {
    score -= 0.15;
    reasons.push("pure_volatility_no_volume");
  }

  const startDate = new Date(event.window_start);
  const utcDay = startDate.getUTCDay();
  const utcHour = startDate.getUTCHours();
  if (utcDay === 0 || utcDay === 6) {
    score -= 0.12;
    reasons.push("weekend_thin_liquidity");
  } else if (utcHour < 6) {
    score -= 0.05;
    reasons.push("overnight_thin_liquidity");
  }

  const finalScore = roundNumber(clamp(score, 0, 1), 4);
  const band =
    finalScore >= options.sourceLikelihoodHighBand
      ? "high"
      : finalScore >= options.sourceLikelihoodMedBand
        ? "medium"
        : "low";

  return {
    source_likelihood: finalScore,
    source_likelihood_band: band,
    source_likelihood_reasons: reasons,
  };
}

function publishDecisionC({ event, previousPublished, options }) {
  const gapFromPreviousMin =
    previousPublished && previousPublished.window_end
      ? Math.abs(
          Date.parse(event.window_start) -
            Date.parse(previousPublished.window_end),
        ) / 60000
      : null;
  const isOppositeRetrace =
    previousPublished &&
    previousPublished.direction !== event.direction &&
    Number.isFinite(gapFromPreviousMin) &&
    gapFromPreviousMin <= options.microRetraceBars * options.barMinutes &&
    event.max_abs_window_move_pct < previousPublished.max_abs_window_move_pct;
  const avgAbs = Math.abs(event.window_move_pct);
  const evidenceBarCount = event.diagnostics?.evidence_bar_count ?? 1;
  const validSymbolCount = event.chart_context_stats?.valid_symbol_count ?? 0;
  const breadthRatio = event.direction_consistency_score ?? 0;
  const broadBreak =
    event.event_range_context === "broad_broke_high" ||
    event.event_range_context === "broad_broke_low";
  const confirmedBreakRatio =
    event.chart_context_stats?.confirmed_break_ratio ?? 0;
  const squeezeBreakRatio = event.chart_context_stats?.squeeze_break_ratio ?? 0;
  const medianAdx = event.chart_context_stats?.median_adx14 ?? 0;
  const medianVolumeX = event.chart_context_stats?.median_volume_x ?? 1;
  const volumeConfirmed = medianVolumeX >= options.minVolumeXPublic;
  const historyType = event.history_support_type ?? "none";
  const sourceLikelihood = event.source_likelihood ?? 0;
  const trendContext = event.trend_context?.trend_context ?? "trend_mixed";
  const trendAligned =
    event.trend_alignment === "aligned_with_trend" ||
    (event.direction === "observed_up" && trendContext === "trend_up") ||
    (event.direction === "observed_down" && trendContext === "trend_down");
  const leadSqueeze = Boolean(
    event.diagnostics?.per_symbol_chart_context?.find(
      (item) => item.symbol === event.table_highlights?.lead_mover_symbol,
    )?.squeeze_break_flag,
  );
  const exceptionallyStrong =
    avgAbs >= options.minStrongContinuationAvgChangePct &&
    breadthRatio >= options.minStrongContinuationBreadth &&
    volumeConfirmed;

  const suppress = (reason) => ({
    publish_candidate: false,
    publish_reason: null,
    suppress_reason: reason,
    reasons: [reason],
  });
  const publish = (reason, extra = []) => ({
    publish_candidate: true,
    publish_reason: reason,
    suppress_reason: null,
    reasons: [reason, ...extra],
  });

  // Hard minimums (all causal; no post-window/look-ahead inputs). One-bar
  // windows (incl. extreme flashes) are detected but stay audit-only, keeping
  // the public feed multi-candle ("evidence window, not single point").
  if (isOppositeRetrace) return suppress("micro_retrace_after_parent");
  if (evidenceBarCount < options.minPublicBars) {
    return suppress("one_bar_unconfirmed_window");
  }
  if (!withinOptionalBarCap(evidenceBarCount, options.maxPublicBars)) {
    return suppress("long_vague_window");
  }
  if (validSymbolCount < options.minValidSymbols) {
    return suppress("insufficient_valid_symbols");
  }
  if (avgAbs < options.minAvgChangePublicPct) {
    return suppress("weak_avg_change");
  }
  if (breadthRatio < options.minBreadthPublic) {
    return suppress("weak_breadth");
  }
  if (
    event.event_range_context === "mixed_range_position" &&
    !exceptionallyStrong
  ) {
    return suppress("mixed_range_position");
  }
  // The detection point must be supported by prior chart history.
  if (historyType === "none") return suppress("no_prior_history_support");

  // Strong-context publish paths (specific structure first, then catch-alls).
  if (
    broadBreak &&
    confirmedBreakRatio >= options.minConfirmedBreakRatio &&
    (trendAligned || medianAdx >= options.minStrongContinuationAdx) &&
    (avgAbs >= options.broadBreakMinPct ||
      confirmedBreakRatio >= options.broadBreakStrongConfirmRatio)
  ) {
    return publish("broad_confirmed_break", [
      "confirmed_break_ge_min",
      trendAligned ? "trend_aligned" : "adx_median_ge_25",
      avgAbs >= options.broadBreakMinPct
        ? "move_ge_min"
        : "strong_confirmation",
    ]);
  }

  if (
    event.volatility_context === "expansion_after_compression" &&
    (squeezeBreakRatio >= options.minCompressionExpansionRatio ||
      leadSqueeze ||
      historyType === "compression_breakout") &&
    volumeConfirmed
  ) {
    return publish("compression_expansion_break", ["volume_confirmation"]);
  }

  if (
    historyType === "trend_continuation" &&
    breadthRatio >= options.minStrongContinuationBreadth &&
    avgAbs >= options.minStrongContinuationAvgChangePct &&
    medianAdx >= options.minStrongContinuationAdx
  ) {
    return publish("strong_continuation_breadth_trend", ["adx_median_ge_25"]);
  }

  if (
    historyType === "relief_reversal" &&
    breadthRatio >= options.minStrongContinuationBreadth &&
    avgAbs >= options.reliefReversalMinPct &&
    volumeConfirmed
  ) {
    return publish("relief_reversal", ["volume_confirmation"]);
  }

  if (
    breadthRatio >= options.broadImpulseMinBreadth &&
    avgAbs >= options.broadImpulseMinPct &&
    volumeConfirmed &&
    sourceLikelihood >= options.sourceLikelihoodHighBand
  ) {
    return publish("broad_impulse", [
      "high_source_likelihood",
      "volume_confirmation",
    ]);
  }

  // Subordinate macro path (after the structural paths).
  if (
    event.macro_aligned &&
    event.chart_context_score >= options.chartContextModerateScore &&
    volumeConfirmed
  ) {
    return publish("macro_aligned_confirmed_window", ["volume_confirmation"]);
  }

  return suppress("no_strong_context_path");
}

export function enrichVNextCEvents(events, { candlesBySymbol, options = {} }) {
  const mergedOptions = { ...DEFAULT_VNEXT_C_OPTIONS, ...options };
  const indicatorsBySymbol = Object.fromEntries(
    Object.entries(candlesBySymbol ?? {}).map(([symbol, candles]) => [
      symbol,
      computeIndicators(candles, mergedOptions),
    ]),
  );
  const enriched = events.map((event) => {
    const chartContext = computeChartContextForEvent({
      event,
      candlesBySymbol,
      indicatorsBySymbol,
      options: mergedOptions,
    });
    const perSymbolEvidence = updatePerSymbolEvidence(event, chartContext);
    const eventId = vnextCEventId(event);

    const base = {
      ...event,
      event_id: eventId,
      source_event_id: event.diagnostics?.source_event_id ?? event.event_id,
      detector_version: "vnext_c",
      publish_gate_version: mergedOptions.publishGateVersion,
      per_symbol_evidence: perSymbolEvidence,
      event_range_context: chartContext.event_range_context,
      chart_context_score: chartContext.chart_context_score,
      chart_context_label: chartContext.chart_context_label,
      event_story_type: chartContext.event_story_type,
      trend_context: chartContext.trend_context,
      trend_alignment: chartContext.trend_alignment,
      momentum_context: chartContext.momentum_context,
      momentum_type: chartContext.momentum_type,
      continuation_after_window: chartContext.continuation_after_window,
      reversal_after_window: chartContext.reversal_after_window,
      direction_consistency_score: chartContext.direction_consistency_score,
      volatility_context: chartContext.volatility_context,
      volatility_expansion_score: chartContext.volatility_expansion_score,
      volatility_state: chartContext.volatility_state,
      history_support_type: chartContext.history_support_type,
      history_support_score: chartContext.history_support_score,
      history_support_factors: chartContext.history_support_factors,
      breadth_up_ratio: chartContext.breadth_up_ratio,
      breadth_down_ratio: chartContext.breadth_down_ratio,
      break_high_ratio: chartContext.break_high_ratio,
      break_low_ratio: chartContext.break_low_ratio,
      squeeze_break_flag: chartContext.squeeze_break_flag,
      chart_context_reasons: chartContext.chart_context_reasons,
      chart_context_warnings: chartContext.chart_context_warnings,
      chart_context_stats: chartContext.chart_context_stats,
      diagnostics: {
        ...event.diagnostics,
        per_symbol_chart_context: chartContext.per_symbol_chart_context,
      },
    };

    return { ...base, ...scoreSourceLikelihood(base, mergedOptions) };
  });
  const recalibrated = [];
  let previousPublished = null;

  for (const event of [...enriched].sort((a, b) =>
    a.window_start.localeCompare(b.window_start),
  )) {
    const decision = publishDecisionC({
      event,
      previousPublished,
      options: mergedOptions,
    });
    const recalibratedEvent = {
      ...event,
      publish_candidate: decision.publish_candidate,
      publish_reason: decision.publish_reason,
      suppress_reason: decision.suppress_reason,
      publish_gate: {
        decision: decision.publish_candidate ? "public" : "audit",
        reasons: decision.reasons ?? [],
      },
      source_route_hint: sourceRouteHintForEvent({
        ...event,
        publish_candidate: decision.publish_candidate,
        publish_reason: decision.publish_reason,
        suppress_reason: decision.suppress_reason,
      }),
      show_peak_details:
        event.macro_aligned ||
        (event.chart_context_label === "Range break" &&
          event.diagnostics?.evidence_bar_count <= 3),
    };

    recalibrated.push(recalibratedEvent);
    if (recalibratedEvent.publish_candidate) {
      previousPublished = recalibratedEvent;
    }
  }

  return recalibrated;
}

export function detectVNextCEvents({
  candlesBySymbol,
  macroCalendar = [],
  options = {},
}) {
  const mergedOptions = { ...DEFAULT_VNEXT_C_OPTIONS, ...options };
  const detected = detectVNextCWindows({
    candlesBySymbol,
    options: mergedOptions,
  });
  const mergedWindows = mergeAdjacentWindows(detected.windows, mergedOptions);
  const flaggedWindows = mergedWindows.map((window) => {
    const bars = window.end_cursor - window.start_cursor + 1;
    // Flash-keep is deliberately rare: a sub-min window is only rescued when
    // the bar's MEDIAN robust z (avg_return_z) is exceptional (>= flashKeepAvgZ,
    // well above the 3.5 trigger), i.e. a genuine market-wide one-bar spike.
    const isExtremeFlash =
      (window.peak_avg_z ?? 0) >= mergedOptions.flashKeepAvgZ;
    return {
      ...window,
      flash_event: bars < mergedOptions.minDetectedBars && isExtremeFlash,
    };
  });
  const keepWindow = (window) => {
    const bars = window.end_cursor - window.start_cursor + 1;
    return bars >= mergedOptions.minDetectedBars || window.flash_event;
  };
  const emittedWindows = flaggedWindows.filter(keepWindow);
  const toCandidate = (window) =>
    windowToCandidateEvent({
      window,
      times: detected.times,
      indicesBySymbol: detected.indicesBySymbol,
      candlesBySymbol,
      macroCalendar,
      options: mergedOptions,
    });
  const candidateEvents = emittedWindows.map(toCandidate);

  const events = enrichVNextCEvents(candidateEvents, {
    candlesBySymbol,
    options: mergedOptions,
  });

  return {
    detector: "vnext_c",
    source_detector: "vnext_c_window_builder",
    events,
    source_events: candidateEvents,
    source_detector_result: {
      detector: "vnext_c_window_builder",
      windows: emittedWindows,
      raw_windows_detected: detected.windows.length,
      merged_window_count: mergedWindows.length,
      raw_windows_filtered_below_min_bars:
        mergedWindows.length - emittedWindows.length,
      flash_event_count: emittedWindows.filter((window) => window.flash_event)
        .length,
      bar_state_count: detected.states.length,
    },
    options: mergedOptions,
  };
}

export function summarizeVNextC(events, options = DEFAULT_VNEXT_C_OPTIONS) {
  const suppressedByReason = {};

  for (const event of events.filter((item) => !item.publish_candidate)) {
    suppressedByReason[event.suppress_reason ?? "unknown"] =
      (suppressedByReason[event.suppress_reason ?? "unknown"] ?? 0) + 1;
  }

  return {
    detector: "vnext_c",
    detected_event_count: events.length,
    publish_candidate_count: events.filter((event) => event.publish_candidate)
      .length,
    suppressed_count: events.filter((event) => !event.publish_candidate).length,
    suppressed_by_reason: suppressedByReason,
    chart_context_enabled: true,
    chart_context_score_avg: roundNumber(
      mean(events.map((event) => event.chart_context_score)) ?? 0,
      2,
    ),
    chart_context_score_median: roundNumber(
      median(events.map((event) => event.chart_context_score)) ?? 0,
      2,
    ),
    chart_context_labels: events.reduce((acc, event) => {
      acc[event.chart_context_label] =
        (acc[event.chart_context_label] ?? 0) + 1;
      return acc;
    }, {}),
    event_story_types: events.reduce((acc, event) => {
      acc[event.event_story_type] = (acc[event.event_story_type] ?? 0) + 1;
      return acc;
    }, {}),
    publish_gate_version:
      options.publishGateVersion ?? DEFAULT_VNEXT_C_OPTIONS.publishGateVersion,
  };
}
