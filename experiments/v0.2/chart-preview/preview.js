const PREVIEW_DATA_ERROR =
  "Preview data could not load. Run: py -3.11 -m http.server 4177 -d experiments/v0.2/chart-preview";

const state = {
  mode:
    new URLSearchParams(window.location.search).get("mode") === "audit"
      ? "audit"
      : "public",
  daysExpanded: true,
  dayOverrides: new Map(),
  expandedSections: new Set(),
  symbol: "BTCUSDT",
  selectedId: null,
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

  const hasExpandedDay = state.mode === "public" && anyDayPostExpanded();
  dayToggle.textContent = hasExpandedDay ? "Collapse days" : "Expand days";
  dayToggle.classList.toggle("is-active", hasExpandedDay);
}

function previewCounts() {
  const dailyCount = publicItems.filter(
    (item) => item.item_type === "daily_overview",
  ).length;
  const signalCount = publicItems.filter(
    (item) => item.item_type === "signal_event",
  ).length;

  return {
    days: publicDayPosts.length,
    daily: dailyCount,
    signals: signalCount,
    audit: auditItems.length,
  };
}

function updateDiagnostics() {
  if (!feedDiagnostics) return;

  const counts = previewCounts();
  feedDiagnostics.classList.remove("is-error");
  feedDiagnostics.textContent = `Preview data loaded: ${counts.days} days · ${counts.daily} daily overviews · ${counts.signals} signal events · ${counts.audit} audit events`;
}

function syncModeButtons() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.mode);
  });
}

function activeCandles() {
  return (candles.candles_by_symbol[state.symbol] || []).map((candle) => ({
    time: Date.parse(candle.open_time),
    open_time: candle.open_time,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.quote_volume || candle.volume || 0),
  }));
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

function signalItemsForDay(dateUtc) {
  return publicItems.filter(
    (item) => item.item_type === "signal_event" && item.date_utc === dateUtc,
  );
}

function publicSignalItems() {
  return publicItems.filter((item) => item.item_type === "signal_event");
}

function drawActiveOverlays(plot) {
  if (state.mode === "audit") {
    const selected = auditById.get(state.selectedId);
    const events = selected ? [selected] : auditItems;

    for (const item of events) {
      const isSelected = item.id === state.selectedId;
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
    return;
  }

  const selected = publicById.get(state.selectedId);

  if (selected?.item_type === "daily_overview") {
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

  const events =
    selected?.item_type === "signal_event" ? [selected] : publicSignalItems();

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
}

function drawChart() {
  resizeCanvas();
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  state.hitZones = [];

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
  ctx.fillText(state.symbol, plot.left, 14);
  ctx.fillText(high.toFixed(2), 4, plot.top + 4);
  ctx.fillText(low.toFixed(2), 4, plot.bottom);
}

function clearSelection() {
  state.selectedId = null;
  selectionLabel.textContent = "No selection";
  render();
}

function selectItem(id, options = {}) {
  if (state.selectedId === id) {
    clearSelection();
    return;
  }

  state.selectedId = id;
  const item = publicById.get(id) || auditById.get(id);

  if (options.expandDay) {
    const dayPostId = itemToDayPost.get(id);
    if (dayPostId) {
      state.dayOverrides.set(dayPostId, true);
    }
  }

  if (!item) {
    selectionLabel.textContent = "No selection";
  } else if (item.item_type === "daily_overview") {
    selectionLabel.textContent = `Selected: Daily Overview ${item.date_utc}`;
  } else {
    selectionLabel.textContent = `Selected: ${item.id}`;
  }

  render();
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
            const symbolClass = isLead
              ? "cell-highlight"
              : "";
            const rangeLabel =
              row.range_position_label ?? rangePositionLabel(row.range_position);
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
  const selected = item.id === state.selectedId;
  const expanded = state.expandedSections.has(item.id);
  const fields = item.expanded.daily_market_summary_fields;
  const summary = fields.summary_hint || "Daily market context pending.";

  return `
    <article class="section-card ${selected ? "is-selected" : ""}" data-id="${item.id}">
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

function renderSignalSection(item) {
  const selected = item.id === state.selectedId;
  const expanded = state.expandedSections.has(item.id);
  const summary = `${escapeHtml(item.display_window)} · ${escapeHtml(displayDirection(item.direction))} · Signals ${item.signals_count} of ${item.n_tracked}`;

  return `
    <article class="section-card ${selected ? "is-selected" : ""}" data-id="${item.id}">
      <div class="card-header">
        <div>
          <p class="card-title">Signal Event</p>
          <div class="card-meta">${escapeHtml(item.display_window)}</div>
        </div>
        <span class="chip ${item.direction === "observed_down" ? "down" : "up"}">${escapeHtml(displayDirection(item.direction))}</span>
      </div>
      <div class="chips">
        <span class="chip">Signals: ${item.signals_count} of ${item.n_tracked}</span>
        <span class="chip">Avg Change ${pct(item.avg_change_pct)}</span>
        <span class="chip">Range Position: ${escapeHtml(item.event_range_context_label)}</span>
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
  return item.item_type === "daily_overview"
    ? renderDailySection(item)
    : renderSignalSection(item);
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
  const selected = item.id === state.selectedId;
  const expanded = state.expandedSections.has(item.id);
  return `
    <article class="section-card ${selected ? "is-selected" : ""}" data-id="${item.id}">
      <div class="card-header">
        <div>
          <p class="card-title">Non-public Event</p>
          <div class="card-meta">${escapeHtml(item.date_time)}</div>
        </div>
        <span class="chip ${item.direction === "observed_down" ? "down" : "up"}">${escapeHtml(displayDirection(item.direction))}</span>
      </div>
      <div class="chips">
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

function renderFeed() {
  if (state.mode === "audit") {
    feedEl.innerHTML = auditItems.length
      ? auditItems.map(renderAuditCard).join("")
      : '<div class="empty">No audit events.</div>';
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
}

function render() {
  syncDayToggle();
  renderFeed();
  drawChart();
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

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      state.selectedId = null;
      syncModeButtons();
      selectionLabel.textContent = "No selection";
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
      selectItem(hit.id, { expandDay: true });
    } else if (state.selectedId) {
      clearSelection();
    }
  });

  window.addEventListener("resize", drawChart);
  render();
}

loadPreviewData().then(startPreview).catch(renderLoadError);
