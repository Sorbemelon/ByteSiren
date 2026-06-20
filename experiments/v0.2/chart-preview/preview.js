const PREVIEW_DATA_ERROR =
  "Preview data could not load. Run: py -3.11 -m http.server 4177 -d experiments/v0.2/chart-preview";
const ALL_SYMBOL_VALUE = "ALL";
const VALID_MODES = new Set(["public", "audit", "both"]);
const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"];
const SYMBOL_COLORS = {
  BTCUSDT: "#f59e0b",
  ETHUSDT: "#8b5cf6",
  BNBUSDT: "#facc15",
  SOLUSDT: "#14b8a6",
  XRPUSDT: "#38bdf8",
};

const state = {
  mode: initialMode(),
  daysExpanded: true,
  dayOverrides: new Map(),
  expandedSections: new Set(),
  symbol: "BTCUSDT",
  selectedId: null,
  selectedType: null,
  pendingScrollId: null,
  hitZones: [],
};

let feedContract;
let auditEvents;
let candles;
let canvas;
let ctx;
let feedEl;
let feedDiagnostics;
let symbolSelect;
let selectionLabel;
let dayToggle;
let publicDayPosts = [];
let publicItems = [];
let publicById = new Map();
let auditItems = [];
let auditById = new Map();
let itemToDayPost = new Map();
let dayPostById = new Map();

function initialMode() {
  const mode = new URLSearchParams(window.location.search).get("mode");
  return VALID_MODES.has(mode) ? mode : "public";
}

function publicFeedVisible() {
  return state.mode === "public" || state.mode === "both";
}

function auditFeedVisible() {
  return state.mode === "audit" || state.mode === "both";
}

function bundledPreviewData() {
  return (
    window.__BYTESIREN_V02_PREVIEW__ ?? window.BYTESIREN_PREVIEW_DATA ?? null
  );
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.json();
}

function normalizePreviewData(data) {
  const payload = {
    feedContract: data.feedContract,
    groupedPreview: data.groupedPreview,
    auditEvents: data.auditEvents,
    candles: data.candles,
  };

  if (!payload.feedContract?.day_groups?.length) {
    throw new Error("feedContract.day_groups is empty or missing.");
  }
  if (!payload.auditEvents?.items) {
    throw new Error("auditEvents.items is missing.");
  }
  if (!payload.candles?.candles_by_symbol) {
    throw new Error("candles.candles_by_symbol is missing.");
  }

  return payload;
}

async function loadPreviewData() {
  const bundled = bundledPreviewData();
  if (bundled) {
    return normalizePreviewData(bundled);
  }

  const [loadedFeedContract, groupedPreview, loadedAuditEvents, loadedCandles] =
    await Promise.all([
      fetchJson("./data/feed_contract_v02.json"),
      fetchJson("./data/grouped_feed_preview.json"),
      fetchJson("./data/non_public_audit_events.json"),
      fetchJson("./data/candles_30d.json"),
    ]);

  return normalizePreviewData({
    feedContract: loadedFeedContract,
    groupedPreview,
    auditEvents: loadedAuditEvents,
    candles: loadedCandles,
  });
}

function renderLoadError(error) {
  console.error(error);

  const diagnostics = document.getElementById("feed-diagnostics");
  if (diagnostics) {
    diagnostics.textContent = PREVIEW_DATA_ERROR;
    diagnostics.classList.add("is-error");
  }

  const feed = document.getElementById("feed");
  if (feed) {
    feed.innerHTML = `<div class="empty load-error">
      <strong>${PREVIEW_DATA_ERROR}</strong>
      <div class="card-meta">Direct file open requires ./data/preview-data.generated.js. Local HTTP fallback requires the JSON files in ./data/.</div>
    </div>`;
  }

  const label = document.getElementById("selection-label");
  if (label) {
    label.textContent = "Preview data failed to load";
  }

  const chart = document.getElementById("chart");
  const chartContext = chart?.getContext("2d");
  if (chart && chartContext) {
    const rect = chart.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    chart.width = Math.max(1, Math.floor(rect.width * dpr));
    chart.height = Math.max(1, Math.floor(rect.height * dpr));
    chartContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    chartContext.fillStyle = "#94a3b8";
    chartContext.font = "14px system-ui";
    chartContext.fillText("Preview data could not load.", 18, 30);
    chartContext.fillText("Run local server from the README command.", 18, 54);
  }
}

function pct(value, digits = 1) {
  const rounded = Number(value || 0).toFixed(digits);
  return `${Number(rounded) >= 0 ? "+" : ""}${rounded}%`;
}

function candleCountLabel(count) {
  const value = Number(count || 0);
  if (!Number.isFinite(value) || value <= 0) return "multi-candle window";
  return `${value} ${value === 1 ? "candle" : "candles"}`;
}

function evidenceWindowSummary(item) {
  if (item.evidence_window_display) return item.evidence_window_display;
  if (item.evidence_window?.display) return item.evidence_window.display;

  const duration = item.evidence_window?.duration_min ?? item.duration_min;
  const bars =
    item.evidence_bar_count ??
    item.evidence_window?.evidence_bar_count ??
    Math.max(1, Math.round(Number(duration || 15) / 15));

  if (item.display_window && duration) {
    return `${item.display_window} - ${duration} min - ${candleCountLabel(bars)}`;
  }

  return "Evidence window pending";
}

function displayDirection(direction) {
  if (direction === "observed_down") return "Observed Down";
  if (direction === "two_sided") return "Two-sided";
  return "Observed Up";
}

function marketTone(value) {
  return String(value || "").replace(/_/g, " ");
}

function rangePositionLabel(value) {
  if (!value) return "—";
  const labels = {
    inside_range: "Inside range",
    near_high: "Near high",
    near_low: "Near low",
    broke_high: "Broke high",
    broke_low: "Broke low",
  };
  return labels[value] ?? "—";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isDayPostExpanded(post) {
  if (state.dayOverrides.has(post.day_post_id)) {
    return state.dayOverrides.get(post.day_post_id);
  }

  return state.daysExpanded;
}

function setGlobalDaysExpanded(expanded) {
  state.daysExpanded = expanded;
  state.dayOverrides.clear();
  render();
}

function visibleItemsForPost(post) {
  if (isDayPostExpanded(post)) return post.items;
  return post.items.filter(
    (item) => item.id === post.default_collapsed_item_id,
  );
}

function anyDayPostExpanded() {
  return publicDayPosts.some((post) => isDayPostExpanded(post));
}

function syncDayToggle() {
  if (!dayToggle) return;

  const hasExpandedDay = publicFeedVisible() && anyDayPostExpanded();
  dayToggle.textContent = hasExpandedDay ? "Collapse days" : "Expand days";
  dayToggle.classList.toggle("is-active", hasExpandedDay);
  dayToggle.disabled = !publicFeedVisible();
}

function previewCounts() {
  const dailyCount = publicItems.filter(
    (item) => item.item_type === "daily_overview",
  ).length;
  const storyCount = publicItems.filter(
    (item) => item.item_type === "market_story",
  ).length;
  const signalCount = publicItems.filter(
    (item) => item.item_type === "signal_event",
  ).length;

  return {
    days: publicDayPosts.length,
    daily: dailyCount,
    stories: storyCount,
    signals: signalCount,
    audit: auditItems.length,
  };
}

function updateDiagnostics() {
  if (!feedDiagnostics) return;

  const counts = previewCounts();
  const detectorVersion = feedContract?.detector_version ?? "vnext_b";
  const chartContext = feedContract?.chart_context_enabled
    ? "chart context enabled"
    : "chart context disabled";
  feedDiagnostics.classList.remove("is-error");
  feedDiagnostics.textContent = `Preview data loaded: detector ${detectorVersion} · ${counts.days} days · ${counts.daily} daily overviews · ${counts.stories} market stories · ${counts.signals} signal events · ${counts.audit} audit events · ${chartContext}`;
}

function syncModeButtons() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.mode);
  });
}

function chartSymbols() {
  const available = new Set(Object.keys(candles.candles_by_symbol ?? {}));
  const defaults = DEFAULT_SYMBOLS.filter((symbol) => available.has(symbol));
  return defaults.length ? defaults : Array.from(available).sort();
}

function symbolLabel(symbol) {
  if (symbol === ALL_SYMBOL_VALUE) return "All";
  return symbol.replace("USDT", "");
}

function symbolCandles(symbol) {
  return (candles.candles_by_symbol[symbol] || []).map((candle) => ({
    time: Date.parse(candle.open_time),
    open_time: candle.open_time,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.quote_volume || candle.volume || 0),
  }));
}

function activeCandles() {
  return symbolCandles(state.symbol);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function colorForDirection(direction) {
  if (direction === "observed_down") return "#f43f5e";
  if (direction === "two_sided") return "#a78bfa";
  return "#10b981";
}

function drawRectOverlay(plot, startIso, endIso, color, alpha, id, kind) {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  const left = plot.xForTime(Math.min(start, end));
  const right = plot.xForTime(Math.max(start, end));
  const x = Math.max(plot.left, Math.min(left, right));
  const w = Math.max(4, Math.min(plot.right, Math.max(left, right)) - x);

  ctx.fillStyle = color.replace(")", `, ${alpha})`).replace("rgb", "rgba");
  ctx.fillRect(x, plot.top, w, plot.height);
  ctx.strokeStyle = color.replace(")", ", 0.45)").replace("rgb", "rgba");
  ctx.strokeRect(x, plot.top, w, plot.height);

  state.hitZones.push({ id, kind, x, y: plot.top, w, h: plot.height });
}

function overlayBounds(plot, startIso, endIso) {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  const left = plot.xForTime(Math.min(start, end));
  const right = plot.xForTime(Math.max(start, end));
  const x = Math.max(plot.left, Math.min(left, right));
  const w = Math.max(4, Math.min(plot.right, Math.max(left, right)) - x);
  return { x, w };
}

function drawMarker(plot, item, color) {
  const time = Date.parse(
    item.chart.peak_marker_time || item.chart.highlight_start,
  );
  const x = plot.xForTime(time);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, plot.top + 18, 5, 0, Math.PI * 2);
  ctx.fill();
  state.hitZones.push({
    id: item.id,
    kind: "marker",
    x: x - 10,
    y: plot.top,
    w: 20,
    h: 35,
  });
}

function drawAuditOverlay(plot, item, isSelected = false) {
  drawRectOverlay(
    plot,
    item.chart.highlight_start,
    item.chart.highlight_end,
    "rgb(245, 158, 11)",
    isSelected ? 0.2 : 0.07,
    item.id,
    "audit",
  );
  drawMarker(plot, { id: item.id, chart: item.chart }, "#f59e0b");
}

function addStoryHitZone(plot, item) {
  const { x, w } = overlayBounds(
    plot,
    item.chart.highlight_start,
    item.chart.highlight_end,
  );
  const h = Math.min(28, plot.height);
  state.hitZones.push({
    id: item.id,
    kind: "story",
    x,
    y: plot.bottom - h,
    w,
    h,
  });
}

function drawStoryOverlay(plot, item, isSelected = false) {
  const { x, w } = overlayBounds(
    plot,
    item.chart.highlight_start,
    item.chart.highlight_end,
  );
  const alpha = isSelected ? 0.16 : 0.055;
  ctx.fillStyle = `rgba(167, 139, 250, ${alpha})`;
  ctx.fillRect(x, plot.top, w, plot.height);
  ctx.strokeStyle = `rgba(167, 139, 250, ${isSelected ? 0.62 : 0.36})`;
  ctx.strokeRect(x, plot.top, w, plot.height);
  ctx.fillStyle = `rgba(167, 139, 250, ${isSelected ? 0.48 : 0.3})`;
  ctx.fillRect(x, plot.bottom - 6, w, 4);
}

function drawStoryAuditOverlay(plot, item, storyId) {
  const { x, w } = overlayBounds(
    plot,
    item.chart.highlight_start,
    item.chart.highlight_end,
  );
  ctx.fillStyle = "rgba(245, 158, 11, 0.12)";
  ctx.fillRect(x, plot.top, w, plot.height);
  ctx.strokeStyle = "rgba(245, 158, 11, 0.42)";
  ctx.strokeRect(x, plot.top, w, plot.height);
  ctx.fillStyle = "#f59e0b";
  ctx.beginPath();
  ctx.arc(x + w / 2, plot.top + 30, 4, 0, Math.PI * 2);
  ctx.fill();
  state.hitZones.push({
    id: storyId,
    kind: "story_audit",
    x,
    y: plot.top,
    w,
    h: plot.height,
  });
}

function signalItemsForDay(dateUtc) {
  return publicItems.filter(
    (item) => item.item_type === "signal_event" && item.date_utc === dateUtc,
  );
}

function publicStoryItems() {
  return publicItems.filter((item) => item.item_type === "market_story");
}

function auditLinkedStoryItems() {
  return publicStoryItems().filter(
    (item) => item.chart.included_audit_event_ids?.length > 0,
  );
}

function publicSignalItems() {
  return publicItems.filter((item) => item.item_type === "signal_event");
}

function includedSignalItems(ids) {
  const wanted = new Set(ids ?? []);
  return publicSignalItems().filter((item) => wanted.has(item.id));
}

function includedAuditItems(ids) {
  const wanted = new Set(ids ?? []);
  return auditItems.filter((item) => wanted.has(item.id));
}

function drawActiveOverlays(plot) {
  if (state.mode === "audit") {
    const selectedStory =
      state.selectedType === "market_story"
        ? publicById.get(state.selectedId)
        : null;
    if (selectedStory) {
      drawStoryOverlay(plot, selectedStory, true);
      for (const item of includedAuditItems(
        selectedStory.chart.included_audit_event_ids,
      )) {
        drawStoryAuditOverlay(plot, item, selectedStory.id);
      }
      addStoryHitZone(plot, selectedStory);
      return;
    }

    const auditStories = !state.selectedType ? auditLinkedStoryItems() : [];
    for (const item of auditStories) {
      drawStoryOverlay(plot, item, false);
    }

    const selected =
      state.selectedType === "audit_event"
        ? auditById.get(state.selectedId)
        : null;
    const events = selected ? [selected] : auditItems;

    for (const item of events) {
      drawAuditOverlay(plot, item, item.id === state.selectedId);
    }
    for (const item of auditStories) {
      addStoryHitZone(plot, item);
    }
    return;
  }

  if (state.mode === "both" && state.selectedType === "audit_event") {
    const selected = auditById.get(state.selectedId);
    const events = selected ? [selected] : auditItems;

    for (const item of events) {
      drawAuditOverlay(plot, item, item.id === state.selectedId);
    }
    return;
  }

  const selected =
    state.selectedType === "daily_overview" ||
    state.selectedType === "market_story" ||
    state.selectedType === "signal_event"
      ? publicById.get(state.selectedId)
      : null;

  if (state.selectedType === "daily_overview" && selected) {
    drawRectOverlay(
      plot,
      selected.chart.highlight_start,
      selected.chart.highlight_end,
      "rgb(96, 165, 250)",
      0.12,
      selected.id,
      "daily",
    );

    for (const item of signalItemsForDay(selected.date_utc)) {
      drawRectOverlay(
        plot,
        item.chart.highlight_start,
        item.chart.highlight_end,
        "rgb(245, 158, 11)",
        0.18,
        item.id,
        "signal",
      );
      drawMarker(plot, item, colorForDirection(item.direction));
    }
    return;
  }

  if (state.selectedType === "market_story" && selected) {
    drawStoryOverlay(plot, selected, true);

    for (const item of includedAuditItems(
      selected.chart.included_audit_event_ids,
    )) {
      drawStoryAuditOverlay(plot, item, selected.id);
    }

    for (const item of includedSignalItems(
      selected.chart.included_signal_event_ids,
    )) {
      drawRectOverlay(
        plot,
        item.chart.highlight_start,
        item.chart.highlight_end,
        "rgb(245, 158, 11)",
        0.18,
        item.id,
        "signal",
      );
      drawMarker(plot, item, colorForDirection(item.direction));
    }
    addStoryHitZone(plot, selected);
    return;
  }

  const defaultStoryWindows = !state.selectedType ? publicStoryItems() : [];
  if (!state.selectedType) {
    for (const item of defaultStoryWindows) {
      drawStoryOverlay(plot, item, false);
    }
  }

  const events =
    state.selectedType === "signal_event" && selected
      ? [selected]
      : publicSignalItems();

  for (const item of events) {
    const isSelected = item.id === state.selectedId;
    const color =
      item.direction === "observed_down"
        ? "rgb(244, 63, 94)"
        : "rgb(16, 185, 129)";
    drawRectOverlay(
      plot,
      item.chart.highlight_start,
      item.chart.highlight_end,
      color,
      isSelected ? 0.22 : 0.055,
      item.id,
      "signal",
    );
    drawMarker(plot, item, colorForDirection(item.direction));
  }

  if (state.mode === "both" && !state.selectedType) {
    for (const item of auditItems) {
      drawAuditOverlay(plot, item, false);
    }
  }

  for (const item of defaultStoryWindows) {
    addStoryHitZone(plot, item);
  }
}

function drawAllSymbolsChart(rect) {
  const seriesBySymbol = chartSymbols()
    .map((symbol) => ({
      symbol,
      series: symbolCandles(symbol),
    }))
    .filter(({ series }) => series.length > 1);

  if (seriesBySymbol.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px system-ui";
    ctx.fillText("No candles for all-symbol chart.", 18, 30);
    return;
  }

  const commonStart = Math.max(
    ...seriesBySymbol.map(({ series }) => series[0].time),
  );
  const commonEnd = Math.min(
    ...seriesBySymbol.map(({ series }) => series.at(-1).time),
  );
  const normalized = seriesBySymbol
    .map(({ symbol, series }) => {
      const commonSeries = series.filter(
        (candle) => candle.time >= commonStart && candle.time <= commonEnd,
      );
      const baseClose = commonSeries[0]?.close;
      if (!Number.isFinite(baseClose) || baseClose <= 0) {
        return { symbol, points: [] };
      }

      return {
        symbol,
        points: commonSeries.map((candle) => ({
          time: candle.time,
          changePct: ((candle.close - baseClose) / baseClose) * 100,
        })),
      };
    })
    .filter(({ points }) => points.length > 1);

  if (normalized.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px system-ui";
    ctx.fillText("No common candle range for all-symbol chart.", 18, 30);
    return;
  }

  const allValues = normalized.flatMap(({ points }) =>
    points.map((point) => point.changePct),
  );
  const minChange = Math.min(0, ...allValues);
  const maxChange = Math.max(0, ...allValues);
  const changePad = Math.max(0.5, (maxChange - minChange) * 0.08);
  const low = minChange - changePad;
  const high = maxChange + changePad;
  const pad = { left: 52, right: 16, top: 24, bottom: 50 };
  const plot = {
    left: pad.left,
    right: rect.width - pad.right,
    top: pad.top,
    bottom: rect.height - pad.bottom,
    width: rect.width - pad.left - pad.right,
    height: rect.height - pad.top - pad.bottom,
  };

  plot.xForTime = (time) => {
    const ratio = (time - commonStart) / Math.max(1, commonEnd - commonStart);
    return plot.left + Math.max(0, Math.min(1, ratio)) * plot.width;
  };

  const yForChange = (changePct) =>
    plot.bottom -
    ((changePct - low) / Math.max(0.0001, high - low)) * plot.height;

  ctx.strokeStyle = "rgba(148, 163, 184, 0.10)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px system-ui";
  for (let i = 0; i <= 4; i += 1) {
    const value = high - ((high - low) / 4) * i;
    const y = yForChange(value);
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.right, y);
    ctx.stroke();
    ctx.fillText(`${value >= 0 ? "+" : ""}${value.toFixed(1)}%`, 4, y + 4);
  }

  const zeroY = yForChange(0);
  ctx.strokeStyle = "rgba(203, 213, 225, 0.28)";
  ctx.beginPath();
  ctx.moveTo(plot.left, zeroY);
  ctx.lineTo(plot.right, zeroY);
  ctx.stroke();

  for (const { symbol, points } of normalized) {
    ctx.strokeStyle = SYMBOL_COLORS[symbol] ?? "#cbd5e1";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = plot.xForTime(point.time);
      const y = yForChange(point.changePct);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  drawActiveOverlays(plot);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px system-ui";
  ctx.fillText("All symbols - normalized % change", plot.left, 14);

  let legendX = plot.left;
  const legendY = rect.height - 26;
  for (const symbol of chartSymbols()) {
    ctx.fillStyle = SYMBOL_COLORS[symbol] ?? "#cbd5e1";
    ctx.fillRect(legendX, legendY - 8, 10, 3);
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(symbolLabel(symbol), legendX + 14, legendY - 4);
    legendX += 66;
  }
}

function drawChart() {
  resizeCanvas();
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  state.hitZones = [];

  if (state.symbol === ALL_SYMBOL_VALUE) {
    drawAllSymbolsChart(rect);
    return;
  }

  const series = activeCandles();
  if (series.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px system-ui";
    ctx.fillText(`No candles for ${state.symbol}.`, 18, 30);
    return;
  }

  const pad = { left: 48, right: 16, top: 18, bottom: 54 };
  const volumeHeight = 72;
  const priceTop = pad.top;
  const priceBottom = rect.height - pad.bottom - volumeHeight;
  const plot = {
    left: pad.left,
    right: rect.width - pad.right,
    top: priceTop,
    bottom: priceBottom,
    width: rect.width - pad.left - pad.right,
    height: priceBottom - priceTop,
  };
  const firstTime = series[0].time;
  const lastTime = series.at(-1).time;
  const minPrice = Math.min(...series.map((candle) => candle.low));
  const maxPrice = Math.max(...series.map((candle) => candle.high));
  const maxVolume = Math.max(...series.map((candle) => candle.volume));
  const pricePad = (maxPrice - minPrice) * 0.08 || 1;
  const low = minPrice - pricePad;
  const high = maxPrice + pricePad;

  plot.xForTime = (time) => {
    const ratio = (time - firstTime) / Math.max(1, lastTime - firstTime);
    return plot.left + Math.max(0, Math.min(1, ratio)) * plot.width;
  };
  const yForPrice = (price) =>
    plot.bottom - ((price - low) / Math.max(1, high - low)) * plot.height;

  ctx.strokeStyle = "rgba(148, 163, 184, 0.10)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = plot.top + (plot.height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.right, y);
    ctx.stroke();
  }

  const candleStep = plot.width / Math.max(1, series.length - 1);
  const bodyWidth = Math.max(1, Math.min(5, candleStep * 0.72));
  for (const candle of series) {
    const x = plot.xForTime(candle.time);
    const up = candle.close >= candle.open;
    ctx.strokeStyle = up ? "#10b981" : "#f43f5e";
    ctx.fillStyle = up ? "#10b981" : "#f43f5e";
    const highY = yForPrice(candle.high);
    const lowY = yForPrice(candle.low);
    const openY = yForPrice(candle.open);
    const closeY = yForPrice(candle.close);

    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();
    ctx.fillRect(
      x - bodyWidth / 2,
      Math.min(openY, closeY),
      bodyWidth,
      Math.max(1, Math.abs(closeY - openY)),
    );

    const volTop =
      rect.height -
      pad.bottom -
      (candle.volume / Math.max(1, maxVolume)) * volumeHeight;
    ctx.fillStyle = up ? "rgba(16, 185, 129, 0.22)" : "rgba(244, 63, 94, 0.22)";
    ctx.fillRect(
      x - bodyWidth / 2,
      volTop,
      bodyWidth,
      rect.height - pad.bottom - volTop,
    );
  }

  drawActiveOverlays(plot);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px system-ui";
  ctx.fillText(symbolLabel(state.symbol), plot.left, 14);
  ctx.fillText(high.toFixed(2), 4, plot.top + 4);
  ctx.fillText(low.toFixed(2), 4, plot.bottom);
}

function resetSelectionState() {
  state.selectedId = null;
  state.selectedType = null;
  state.pendingScrollId = null;
  if (selectionLabel) {
    selectionLabel.textContent = "No selection";
  }
}

function clearSelection() {
  resetSelectionState();
  render();
}

function selectionTypeForItem(item) {
  if (!item) return null;
  if (auditById.has(item.id)) return "audit_event";
  if (item.item_type === "market_story") return "market_story";
  return item.item_type === "daily_overview"
    ? "daily_overview"
    : "signal_event";
}

function revealDayPostForItem(id) {
  const dayPostId = itemToDayPost.get(id);
  if (dayPostId) {
    state.dayOverrides.set(dayPostId, true);
  }
}

function updateSelectionLabel(item, selectedType) {
  if (!selectionLabel) return;

  if (selectedType === "daily_overview") {
    selectionLabel.textContent = `Selected: Daily Overview ${item.date_utc}`;
  } else if (selectedType === "market_story") {
    selectionLabel.textContent = `Selected market story: ${item.id}`;
  } else if (selectedType === "audit_event") {
    selectionLabel.textContent = `Selected audit: ${item.id}`;
  } else {
    selectionLabel.textContent = `Selected signal: ${item.id}`;
  }
}

function selectItem(id, options = {}) {
  const item = auditFeedVisible() && !publicFeedVisible()
    ? auditById.get(id) || publicById.get(id)
    : publicById.get(id) || auditById.get(id);
  const selectedType = selectionTypeForItem(item);

  if (!item || !selectedType) {
    clearSelection();
    return;
  }

  if (state.selectedId === id && state.selectedType === selectedType) {
    clearSelection();
    return;
  }

  state.selectedId = id;
  state.selectedType = selectedType;

  if (options.expandDay && selectedType !== "audit_event") {
    revealDayPostForItem(id);
  }

  if (options.scrollIntoView) {
    state.pendingScrollId = id;
  }

  updateSelectionLabel(item, selectedType);
  render();
}

function selectedClass(item, type) {
  const selected = item.id === state.selectedId && state.selectedType === type;
  if (!selected) return "";
  if (type === "daily_overview") return "is-selected selected-daily";
  if (type === "market_story") return "is-selected selected-story";
  if (type === "audit_event") return "is-selected selected-audit";
  return "is-selected selected-signal";
}

function scrollPendingSelectionIntoView() {
  if (!state.pendingScrollId || !feedEl) return;

  const selectedCard = Array.from(
    feedEl.querySelectorAll(".section-card"),
  ).find((card) => card.dataset.id === state.pendingScrollId);

  if (selectedCard) {
    selectedCard.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  state.pendingScrollId = null;
}

function renderSymbolTable(item) {
  const rows = item.expanded.per_symbol_table?.rows ?? [];
  const labels = item.expanded.per_symbol_table?.labels ?? {};
  const windowChangeLabel =
    labels.window_change ?? item.table_window_change_label ?? "Window Change";
  const peak15mLabel = labels.peak_15m ?? item.peak_15m_label ?? "Peak 15m";
  const volumeLabel = labels.volume ?? item.volume_label ?? "Volume ×";
  const rangePositionTableLabel =
    labels.range_position ?? item.range_position_label ?? "Range Position";

  return `
    <table class="small-table">
      <thead>
        <tr>
          <th>Symbol</th>
          <th>${escapeHtml(windowChangeLabel)}</th>
          <th>${escapeHtml(peak15mLabel)}</th>
          <th>${escapeHtml(volumeLabel)}</th>
          <th>${escapeHtml(rangePositionTableLabel)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => {
            const isLead = Boolean(row.highlights?.lead_mover);
            const isPeak = Boolean(row.highlights?.strongest_peak_15m);
            const rowClass = isLead ? "row-highlight" : "";
            const peakClass = row.highlights?.strongest_peak_15m
              ? `cell-highlight${isLead && isPeak ? " combined-highlight" : ""}`
              : "";
            const symbolClass = isLead ? "cell-highlight" : "";
            const rangeLabel =
              row.range_position_label ??
              rangePositionLabel(row.range_position);
            return `<tr class="${rowClass}">
              <td class="${symbolClass}">${escapeHtml(row.symbol.replace("USDT", ""))}</td>
              <td>${pct(row.window_change_pct)}</td>
              <td class="${peakClass}">${pct(row.peak_15m_pct)}</td>
              <td>${Number(row.volume_x ?? 0).toFixed(1)}x</td>
              <td class="${rangeLabel === "—" ? "cell-muted" : ""}">${escapeHtml(rangeLabel)}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
    <div class="table-glossary">
      Highlighted symbol/row = strongest contributor in the evidence window. Highlighted Peak 15m cell = strongest 15-minute change. Range Position is descriptive, not a trading signal.
    </div>`;
}

function sectionControl(item) {
  const expanded = state.expandedSections.has(item.id);
  return `<button class="section-toggle" data-section-toggle="${item.id}">
    ${expanded ? "Hide" : "Show more"}
  </button>`;
}

function renderDailySection(item) {
  const selected = selectedClass(item, "daily_overview");
  const expanded = state.expandedSections.has(item.id);
  const fields = item.expanded.daily_market_summary_fields;
  const summary = fields.summary_hint || "Daily market context pending.";

  return `
    <article class="section-card daily-section ${selected}" data-id="${item.id}">
      <div class="card-header">
        <div>
          <p class="card-title">Daily Overview</p>
          <div class="card-meta">${item.display_time}</div>
        </div>
        <span class="chip">24h Change ${pct(item.change_pct)}</span>
      </div>
      <div class="chips">
        <span class="chip">Market tone: ${escapeHtml(marketTone(item.market_tone))}</span>
        <span class="chip">Range ${pct(item.market_range_pct)}</span>
        <span class="chip">${item.has_publishable_signal_events ? "Has signals" : "No public signals"}</span>
      </div>
      <div class="card-body">${escapeHtml(summary)}</div>
      ${
        expanded
          ? `<div class="card-expanded">
              <div class="card-meta">Notable: ${fields.notable_symbols.map((symbol) => symbol.replace("USDT", "")).join(", ") || "none"}</div>
              <div class="card-meta">Sources placeholder: ${fields.source_query_hints.map(escapeHtml).join("; ")}</div>
            </div>`
          : ""
      }
      ${sectionControl(item)}
    </article>`;
}

function renderStorySection(item) {
  const selected = selectedClass(item, "market_story");
  const expanded = state.expandedSections.has(item.id);
  const details = item.expanded.story_details;
  const contextLabel = item.story_context_label ?? "Market Story";
  const signalLines = (details.included_signal_event_ids ?? [])
    .map((id) => `<li>${escapeHtml(id)}</li>`)
    .join("");
  const auditLines = (details.included_audit_event_ids ?? [])
    .map((id) => `<li>${escapeHtml(id)}</li>`)
    .join("");
  const supportingAuditCount = (
    details.supporting_audit_event_ids ?? []
  ).length;
  const windowContext = details.story_window_context ?? item.story_window_context;
  const recoveryRatio =
    windowContext?.median_recovery_ratio === null ||
    windowContext?.median_recovery_ratio === undefined
      ? "n/a"
      : `${Number(windowContext.median_recovery_ratio).toFixed(2)}x`;
  const labelReasons = (
    details.story_label_decision_reasons ??
    item.story_label_decision_reasons ??
    []
  ).join(", ");

  return `
    <article class="section-card story-section ${selected}" data-id="${item.id}">
      <div class="card-header">
        <div>
          <p class="card-title">Market Story</p>
          <div class="card-meta">Story window: ${escapeHtml(item.story_window_display)}</div>
        </div>
        <span class="chip story-chip">${escapeHtml(contextLabel)}</span>
      </div>
      <div class="chips">
        <span class="chip">${escapeHtml(item.direction_label)}</span>
        <span class="chip story-chip">${escapeHtml(item.story_source_label ?? "Signal story")}</span>
        <span class="chip">Signal Events: ${item.signal_event_count}</span>
        <span class="chip audit-chip">Audit Events: ${item.audit_event_count ?? 0}</span>
        <span class="chip">Swing Change ${pct(item.total_swing_change_pct)}</span>
        <span class="chip">${escapeHtml(item.adaptive_gap_summary ?? "Adaptive gap: n/a")}</span>
        <span class="chip">${escapeHtml(item.story_bridge_summary ?? "Story bridge: none")}</span>
        <span class="chip">${item.crosses_utc_day ? "Crosses UTC day" : "Same UTC day"}</span>
      </div>
      <div class="card-body">${escapeHtml(item.summary_hint)}</div>
      ${
        expanded
          ? `<div class="card-expanded">
              <div class="card-meta">Included Signal Events</div>
              <ul class="compact-list">${signalLines || "<li>none</li>"}</ul>
              <div class="card-meta">Included Audit Events</div>
              <ul class="compact-list">${auditLines || "<li>none</li>"}</ul>
              <div class="card-meta">Story-window context: ${escapeHtml(windowContext?.story_window_context_version ?? "n/a")}</div>
              <div class="card-meta">Median recovery ratio: ${escapeHtml(recoveryRatio)} · Median net change ${pct(windowContext?.median_net_change_pct ?? 0)} · Median range ${pct(windowContext?.median_range_pct ?? 0)}</div>
              <div class="card-meta">Label decision: ${escapeHtml(labelReasons || "n/a")}</div>
              <div class="card-meta">${escapeHtml(details.adaptive_gap_summary ?? item.adaptive_gap_summary ?? "Adaptive gap: n/a")}</div>
              <div class="card-meta">${escapeHtml(details.story_bridge_summary ?? item.story_bridge_summary ?? "Story bridge: none")}</div>
              <div class="card-meta">Eligibility: ${escapeHtml((details.eligibility_reason ?? item.eligibility_reason ?? "n/a").replace(/_/g, " "))}</div>
              <div class="card-meta">Nearby audit-only context: ${supportingAuditCount}</div>
              <div class="card-meta">Deterministic only · no Claude payload or source status</div>
              <div class="card-meta">${escapeHtml(details.note)}</div>
            </div>`
          : ""
      }
      ${sectionControl(item)}
    </article>`;
}

function renderSignalSection(item) {
  const selected = selectedClass(item, "signal_event");
  const expanded = state.expandedSections.has(item.id);
  const windowSummary = evidenceWindowSummary(item);
  const summary = `Evidence window: ${escapeHtml(windowSummary)} - ${escapeHtml(displayDirection(item.direction))} - Signals ${item.signals_count} of ${item.n_tracked}`;

  return `
    <article class="section-card signal-section ${selected}" data-id="${item.id}">
      <div class="card-header">
        <div>
          <p class="card-title">Signal Event</p>
          <div class="card-meta">Evidence window: ${escapeHtml(windowSummary)}</div>
        </div>
        <span class="chip ${item.direction === "observed_down" ? "down" : "up"}">${escapeHtml(displayDirection(item.direction))}</span>
      </div>
      <div class="chips">
        <span class="chip">${escapeHtml(candleCountLabel(item.evidence_bar_count ?? item.evidence_window?.evidence_bar_count))}</span>
        <span class="chip">Signals: ${item.signals_count} of ${item.n_tracked}</span>
        <span class="chip">Avg Change ${pct(item.avg_change_pct)}</span>
        <span class="chip">Range Position: ${escapeHtml(item.event_range_context_label)}</span>
        <span class="chip">Chart context: ${escapeHtml(item.chart_context_label ?? "Weak chart context")}</span>
        <span class="chip">Impact: ${escapeHtml(item.impact_label)}</span>
      </div>
      <div class="card-body">${summary}</div>
      ${
        expanded
          ? `<div class="card-expanded">
              ${renderSymbolTable(item)}
              <div class="card-meta">Public Context placeholder</div>
              <div class="card-meta">Sources placeholder</div>
            </div>`
          : ""
      }
      ${sectionControl(item)}
    </article>`;
}

function renderPublicSection(item) {
  if (item.item_type === "daily_overview") return renderDailySection(item);
  if (item.item_type === "market_story") return renderStorySection(item);
  return renderSignalSection(item);
}

function renderDayPost(post) {
  const expanded = isDayPostExpanded(post);
  const visibleItems = visibleItemsForPost(post);
  const label = expanded
    ? post.day_post_control.collapse_label
    : post.day_post_control.expand_label;

  return `
    <section class="day-post" data-day-post-id="${post.day_post_id}">
      <div class="day-post-header">
        <div>
          <h2 class="day-title">${escapeHtml(post.display_date)}</h2>
          <div class="day-meta">${post.item_count} item${post.item_count === 1 ? "" : "s"}</div>
        </div>
        ${
          label
            ? `<button class="day-post-toggle" data-day-post-toggle="${post.day_post_id}">${escapeHtml(label)}</button>`
            : ""
        }
      </div>
      <div class="day-post-sections">
        ${visibleItems.map(renderPublicSection).join("")}
      </div>
    </section>`;
}

function renderAuditCard(item) {
  const selected = selectedClass(item, "audit_event");
  const expanded = state.expandedSections.has(item.id);
  const windowSummary = evidenceWindowSummary(item);
  return `
    <article class="section-card audit-section ${selected}" data-id="${item.id}">
      <div class="card-header">
        <div>
          <p class="card-title">Non-public Event</p>
          <div class="card-meta">Evidence window: ${escapeHtml(windowSummary)}</div>
        </div>
        <span class="chip ${item.direction === "observed_down" ? "down" : "up"}">${escapeHtml(displayDirection(item.direction))}</span>
      </div>
      <div class="chips">
        <span class="chip">${escapeHtml(candleCountLabel(item.evidence_bar_count ?? item.evidence_window?.evidence_bar_count))}</span>
        <span class="chip">Avg Change ${pct(item.avg_change_pct)}</span>
        <span class="chip">Signals: ${item.signals_count} of ${item.n_tracked}</span>
        <span class="chip">${escapeHtml(item.suppress_reason)}</span>
      </div>
      ${
        expanded
          ? `<div class="card-expanded">
              <div>${escapeHtml(item.why_suppressed)}</div>
              <div class="card-meta">Nearby public event: ${
                item.nearby_public_event
                  ? `${escapeHtml(item.nearby_public_event.id)} (${item.nearby_public_event.delta_min} min)`
                  : "none nearby"
              }</div>
            </div>`
          : ""
      }
      ${sectionControl(item)}
    </article>`;
}

function renderAuditFeed() {
  return auditItems.length
    ? auditItems.map(renderAuditCard).join("")
    : '<div class="empty">No audit events.</div>';
}

function renderAuditStoryGroup() {
  const stories = auditLinkedStoryItems();
  if (!stories.length) return "";

  return `
    <section class="combined-audit-group audit-story-group" aria-label="Audit-linked Market Stories">
      <div class="combined-audit-header">
        <div>
          <h2 class="combined-title">Audit-linked Market Stories</h2>
          <div class="combined-meta">${stories.length} story${stories.length === 1 ? "" : "ies"} built from audit context</div>
        </div>
      </div>
      <div class="combined-audit-list">
        ${stories.map(renderStorySection).join("")}
      </div>
    </section>`;
}

function renderCombinedAuditGroup() {
  return `
    <section class="combined-audit-group" aria-label="Audit events in combined view">
      <div class="combined-audit-header">
        <div>
          <h2 class="combined-title">Audit events</h2>
          <div class="combined-meta">${auditItems.length} non-public event${auditItems.length === 1 ? "" : "s"}</div>
        </div>
      </div>
      <div class="combined-audit-list">
        ${renderAuditFeed()}
      </div>
    </section>`;
}

function renderFeed() {
  if (state.mode === "audit") {
    feedEl.innerHTML = `${renderAuditStoryGroup()}${renderAuditFeed()}`;
  } else if (state.mode === "both") {
    const publicHtml = publicDayPosts.length
      ? publicDayPosts.map(renderDayPost).join("")
      : '<div class="empty">Preview data loaded, but no public day posts were found.</div>';
    feedEl.innerHTML = `${publicHtml}${renderCombinedAuditGroup()}`;
  } else {
    feedEl.innerHTML = publicDayPosts.length
      ? publicDayPosts.map(renderDayPost).join("")
      : '<div class="empty">Preview data loaded, but no public day posts were found.</div>';
  }

  feedEl.querySelectorAll(".section-card").forEach((card) => {
    card.addEventListener("click", () => selectItem(card.dataset.id));
  });

  feedEl.querySelectorAll("[data-section-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = button.dataset.sectionToggle;
      if (state.expandedSections.has(id)) {
        state.expandedSections.delete(id);
      } else {
        state.expandedSections.add(id);
      }
      render();
    });
  });

  feedEl.querySelectorAll("[data-day-post-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const post = dayPostById.get(button.dataset.dayPostToggle);
      if (!post) return;
      state.dayOverrides.set(post.day_post_id, !isDayPostExpanded(post));
      render();
    });
  });

  scrollPendingSelectionIntoView();
}

function render() {
  syncDayToggle();
  renderFeed();
  drawChart();
}

function exposePreviewRuntime() {
  window.__BYTESIREN_V02_RUNTIME__ = {
    feedContract,
    auditEvents,
    candles,
    state,
    publicDayPosts,
    publicItems,
    auditItems,
  };
  window.feedContract = feedContract;
  window.auditEvents = auditEvents;
  window.candles = candles;
  window.state = state;
  window.publicDayPosts = publicDayPosts;
  window.publicItems = publicItems;
  window.auditItems = auditItems;
}

function startPreview(data) {
  feedContract = data.feedContract;
  auditEvents = data.auditEvents;
  candles = data.candles;

  canvas = document.getElementById("chart");
  ctx = canvas.getContext("2d");
  feedEl = document.getElementById("feed");
  feedDiagnostics = document.getElementById("feed-diagnostics");
  symbolSelect = document.getElementById("symbol-select");
  selectionLabel = document.getElementById("selection-label");
  dayToggle = document.getElementById("day-toggle");
  symbolSelect.value = state.symbol;

  publicDayPosts = feedContract.day_groups;
  publicItems = publicDayPosts.flatMap((group) => group.items);
  publicById = new Map(publicItems.map((item) => [item.id, item]));
  auditItems = auditEvents.items;
  auditById = new Map(auditItems.map((item) => [item.id, item]));
  itemToDayPost = new Map(
    publicDayPosts.flatMap((group) =>
      group.items.map((item) => [item.id, group.day_post_id]),
    ),
  );
  dayPostById = new Map(
    publicDayPosts.map((group) => [group.day_post_id, group]),
  );
  exposePreviewRuntime();

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      resetSelectionState();
      syncModeButtons();
      render();
    });
  });

  syncModeButtons();
  updateDiagnostics();

  dayToggle.addEventListener("click", () => {
    setGlobalDaysExpanded(!anyDayPostExpanded());
  });

  symbolSelect.addEventListener("change", () => {
    state.symbol = symbolSelect.value;
    drawChart();
  });

  feedEl.addEventListener("click", (event) => {
    if (event.target === feedEl && state.selectedId) {
      clearSelection();
    }
  });

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = [...state.hitZones]
      .reverse()
      .find(
        (zone) =>
          x >= zone.x &&
          x <= zone.x + zone.w &&
          y >= zone.y &&
          y <= zone.y + zone.h,
      );

    if (hit) {
      selectItem(hit.id, { expandDay: true, scrollIntoView: true });
    } else if (state.selectedId) {
      clearSelection();
    }
  });

  window.addEventListener("resize", drawChart);
  render();
}

loadPreviewData().then(startPreview).catch(renderLoadError);
