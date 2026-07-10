const SERVER_REQUIRED = window.location.protocol === "file:";

const CATALOG = {
  AAPL: { name: "Apple Inc.", sector: "Consumer Tech", exchange: "NASDAQ", pe: 31.6, beta: 1.18, base: 212.44, currency: "USD", ySymbol: "AAPL" },
  MSFT: { name: "Microsoft Corp.", sector: "Cloud", exchange: "NASDAQ", pe: 34.2, beta: 0.92, base: 511.82, currency: "USD", ySymbol: "MSFT" },
  NVDA: { name: "NVIDIA Corp.", sector: "Semiconductors", exchange: "NASDAQ", pe: 43.8, beta: 1.71, base: 158.19, currency: "USD", ySymbol: "NVDA" },
  TSLA: { name: "Tesla Inc.", sector: "Mobility", exchange: "NASDAQ", pe: 73.4, beta: 2.03, base: 323.67, currency: "USD", ySymbol: "TSLA" },
  GOOGL: { name: "Alphabet Inc.", sector: "Communication", exchange: "NASDAQ", pe: 25.1, beta: 1.05, base: 184.28, currency: "USD", ySymbol: "GOOGL" },
  AMZN: { name: "Amazon.com Inc.", sector: "Commerce", exchange: "NASDAQ", pe: 38.7, beta: 1.25, base: 221.14, currency: "USD", ySymbol: "AMZN" },
  META: { name: "Meta Platforms", sector: "Communication", exchange: "NASDAQ", pe: 29.5, beta: 1.28, base: 612.9, currency: "USD", ySymbol: "META" },
  JPM: { name: "JPMorgan Chase", sector: "Financials", exchange: "NYSE", pe: 13.1, beta: 1.09, base: 289.42, currency: "USD", ySymbol: "JPM" },
  RELIANCE: { name: "Reliance Industries", sector: "Energy", exchange: "NSE", pe: 26.4, beta: 0.86, base: 1486.25, currency: "INR", ySymbol: "RELIANCE.NS" },
  INFY: { name: "Infosys Ltd.", sector: "IT Services", exchange: "NSE", pe: 23.9, beta: 0.73, base: 1602.75, currency: "INR", ySymbol: "INFY.NS" },
  TCS: { name: "Tata Consultancy Services", sector: "IT Services", exchange: "NSE", pe: 28.2, beta: 0.62, base: 3925.2, currency: "INR", ySymbol: "TCS.NS" }
};

const SECTOR_COLORS = ["#0f8b8d", "#7551d9", "#d99235", "#168a5f", "#c84b4b", "#5b7cfa", "#9a6a20"];
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

let state = defaultState();
let quoteRange = 30;
let searchTerm = "";
let searchResults = [];
let saveTimer = null;
let saveInFlight = null;
let providerState = {
  mode: SERVER_REQUIRED ? "server-required" : "connecting",
  provider: "Yahoo Finance",
  storage: "connecting",
  persistent: false,
  pending: false,
  lastSync: null,
  error: null,
  failures: []
};

function defaultState() {
  return {
    theme: "light",
    selected: "NVDA",
    watchlist: [
      { symbol: "NVDA", target: 175 },
      { symbol: "MSFT", target: 540 },
      { symbol: "AAPL", target: 230 },
      { symbol: "TSLA", target: 360 },
      { symbol: "RELIANCE", target: 1560 }
    ],
    positions: [
      { symbol: "NVDA", shares: 18, cost: 126.4, note: "AI compute leader" },
      { symbol: "MSFT", shares: 9, cost: 438.5, note: "Cloud compounder" },
      { symbol: "AAPL", shares: 14, cost: 188.2, note: "Hardware cycle" },
      { symbol: "JPM", shares: 10, cost: 236.5, note: "Rate exposure" }
    ],
    alerts: [
      { id: newId(), symbol: "TSLA", operator: "above", price: 350 },
      { id: newId(), symbol: "AAPL", operator: "below", price: 200 }
    ],
    journal: [
      {
        id: newId(),
        date: new Date().toISOString(),
        symbol: "NVDA",
        side: "Buy",
        conviction: "High",
        thesis: "Holding above the 20 day trend with improving relative strength."
      }
    ],
    feed: {},
    news: {}
  };
}

async function loadServerState() {
  const response = await fetch("/api/state");
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || "State service unavailable");
  state = migrateState(payload.state || {}, defaultState());
  providerState.storage = payload.storage || "server";
  providerState.persistent = Boolean(payload.persistent);
}

function migrateState(input, defaults) {
  const migrated = {
    ...defaults,
    ...input,
    feed: input.feed || {},
    news: input.news || {},
    market: input.market || defaults.market
  };
  migrated.selected = normalizeSymbol(migrated.selected || defaults.selected);
  migrated.watchlist = (migrated.watchlist || []).map((item) => ({
    ...item,
    symbol: normalizeSymbol(item.symbol)
  })).filter((item) => item.symbol);
  migrated.positions = (migrated.positions || []).map((item) => ({
    ...item,
    symbol: normalizeSymbol(item.symbol),
    shares: Number(item.shares || 0),
    cost: Number(item.cost || 0)
  })).filter((item) => item.symbol && item.shares > 0);
  migrated.alerts = (migrated.alerts || []).map((item) => ({
    ...item,
    id: item.id || newId(),
    symbol: normalizeSymbol(item.symbol)
  })).filter((item) => item.symbol);
  migrated.journal = (migrated.journal || []).map((item) => ({
    ...item,
    id: item.id || newId(),
    symbol: normalizeSymbol(item.symbol)
  })).filter((item) => item.symbol);
  return migrated;
}

function saveState() {
  if (SERVER_REQUIRED) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveInFlight = persistState();
  }, 180);
}

async function persistState() {
  try {
    const response = await fetch("/api/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: stateForPersistence() })
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Save failed");
    providerState.storage = payload.storage || providerState.storage;
    providerState.persistent = Boolean(payload.persistent);
    return payload.state;
  } catch (error) {
    providerState.error = error.message;
    showToast("Server save failed");
    renderProviderStatus();
    return null;
  }
}

function stateForPersistence() {
  return {
    theme: state.theme,
    selected: state.selected,
    watchlist: state.watchlist,
    positions: state.positions,
    alerts: state.alerts,
    journal: state.journal
  };
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeSymbol(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9.^=-]/g, "");
}

function catalogProfile(symbol) {
  const normalized = normalizeSymbol(symbol);
  const direct = CATALOG[normalized];
  if (direct) return { symbol: normalized, ...direct };

  const alias = Object.entries(CATALOG).find(([, value]) => normalizeSymbol(value.ySymbol) === normalized);
  if (alias) return { symbol: alias[0], ...alias[1] };

  const seed = hash(normalized);
  const sectors = ["Industrials", "Healthcare", "Financials", "Energy", "Software", "Materials"];
  return {
    symbol: normalized,
    name: `${normalized} Holdings`,
    sector: sectors[seed % sectors.length],
    exchange: normalized.includes(".NS") ? "NSE" : "NASDAQ",
    pe: 12 + (seed % 290) / 10,
    beta: 0.55 + (seed % 170) / 100,
    base: 38 + (seed % 420),
    currency: normalized.includes(".NS") ? "INR" : "USD",
    ySymbol: normalized
  };
}

function profileFor(symbol) {
  const normalized = normalizeSymbol(symbol);
  const catalog = catalogProfile(normalized);
  const quote = state.feed[normalized];
  return {
    ...catalog,
    symbol: normalized || catalog.symbol,
    name: quote?.name || catalog.name,
    sector: catalog.sector || quote?.instrumentType || "Market",
    exchange: quote?.exchange || catalog.exchange,
    currency: quote?.currency || catalog.currency,
    ySymbol: quote?.providerSymbol || catalog.ySymbol || normalized
  };
}

function hash(input) {
  let total = 0;
  for (let i = 0; i < input.length; i += 1) total = (total * 31 + input.charCodeAt(i)) >>> 0;
  return total || 37;
}

function ensureQuote(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return null;
  if (!state.feed[normalized]) state.feed[normalized] = generateLocalQuote(normalized);
  return state.feed[normalized];
}

function generateLocalQuote(symbol) {
  const profile = catalogProfile(symbol);
  const seed = hash(symbol);
  const history = [];
  for (let i = 179; i >= 0; i -= 1) {
    const wave = Math.sin((i + seed) / 11) * 0.035;
    const drift = (180 - i) * 0.0009;
    const chop = (((seed + i * 17) % 21) - 10) / 1000;
    history.push(round(profile.base * (1 + drift + wave + chop), 2));
  }
  return {
    price: history.at(-1),
    previous: history.at(-2),
    history,
    currency: profile.currency,
    exchange: profile.exchange,
    name: profile.name,
    providerSymbol: profile.ySymbol,
    source: "Awaiting live data",
    syncedAt: null
  };
}

function applyLiveQuote(payload) {
  const symbol = normalizeSymbol(payload.symbol);
  if (!symbol) return;
  const existing = ensureQuote(symbol);
  const history = Array.isArray(payload.history) && payload.history.length ? payload.history.filter(Number.isFinite) : existing.history;
  const price = Number(payload.price || history.at(-1) || existing.price);
  const previous = Number(payload.previousClose || history.at(-2) || existing.previous || price);
  state.feed[symbol] = {
    ...existing,
    price: round(price, 4),
    previous: round(previous, 4),
    history: history.slice(-180).map((value) => round(value, 4)),
    historyTimes: payload.historyTimes || existing.historyTimes || [],
    currency: payload.currency || existing.currency,
    exchange: payload.exchange || existing.exchange,
    instrumentType: payload.instrumentType || existing.instrumentType,
    name: payload.name || existing.name,
    providerSymbol: payload.providerSymbol || existing.providerSymbol,
    source: payload.source || "Yahoo Finance",
    syncedAt: payload.regularMarketTime || Date.now()
  };
}

function trackedSymbols() {
  return Array.from(
    new Set([
      ...state.watchlist.map((item) => item.symbol),
      ...state.positions.map((item) => item.symbol),
      ...state.alerts.map((item) => item.symbol),
      state.selected
    ].map(normalizeSymbol).filter(Boolean))
  );
}

async function refreshMarketData({ silent = false } = {}) {
  const symbols = trackedSymbols();
  symbols.forEach(ensureQuote);

  providerState.pending = true;
  providerState.error = null;
  renderProviderStatus();

  try {
    const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Quote sync failed");

    payload.quotes.forEach(applyLiveQuote);
    providerState = {
      ...providerState,
      mode: payload.quotes.length ? "live" : "unavailable",
      provider: payload.provider || "Yahoo Finance",
      pending: false,
      lastSync: new Date(payload.fetchedAt || Date.now()).toISOString(),
      error: payload.failures?.length ? `${payload.failures.length} symbol failed` : null,
      failures: payload.failures || []
    };

    saveState();
    render();
    refreshNews({ silent: true });
    if (!silent) showToast(payload.quotes.length ? "Live prices refreshed" : "No live quotes returned");
  } catch (error) {
    providerState = {
      ...providerState,
      mode: "unavailable",
      pending: false,
      provider: "Yahoo Finance",
      lastSync: new Date().toISOString(),
      error: error.message,
      failures: []
    };
    saveState();
    render();
    if (!silent) showToast("Live data is unavailable right now");
  }
}

async function refreshNews({ silent = false } = {}) {
  const symbol = normalizeSymbol(state.selected);
  if (!symbol) return;
  try {
    const profile = profileFor(symbol);
    const response = await fetch(`/api/news?q=${encodeURIComponent(profile.ySymbol || symbol)}`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "News sync failed");
    state.news[symbol] = payload.results || [];
    saveState();
    renderNews();
  } catch (error) {
    if (!silent) showToast("News is unavailable right now");
  }
}

function tickQuotes(strength = 1) {
  trackedSymbols().forEach((symbol) => {
    const quote = ensureQuote(symbol);
    if (!quote || quote.source === "Yahoo Finance") return;
    const volatility = 0.0025 + (hash(symbol) % 9) / 10000;
    const direction = Math.sin(Date.now() / 60000 + hash(symbol)) * volatility;
    const random = (Math.random() - 0.48) * volatility * strength;
    const next = Math.max(0.5, quote.price * (1 + direction + random));
    quote.previous = quote.price;
    quote.price = round(next, 2);
    quote.history.push(quote.price);
    quote.history = quote.history.slice(-180);
    quote.syncedAt = new Date().toISOString();
  });
  saveState();
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

function currencyFor(symbol, value) {
  const profile = profileFor(symbol);
  const currency = profile.currency || "USD";
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: Math.abs(value || 0) >= 1000 ? 0 : 2
  }).format(value || 0);
}

function money(value, currency = "USD") {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: Math.abs(value || 0) >= 1000 ? 0 : 2
  }).format(value || 0);
}

function number(value, digits = 2) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value || 0);
}

function pct(value) {
  return `${value >= 0 ? "+" : ""}${number(value, 2)}%`;
}

function changeFor(symbol) {
  const quote = ensureQuote(symbol);
  const previous = quote.previous || quote.price;
  const amount = quote.price - previous;
  const percent = previous ? (amount / previous) * 100 : 0;
  return { amount, percent };
}

function classFor(value) {
  return value >= 0 ? "positive" : "negative";
}

function signalFor(symbol) {
  const quote = ensureQuote(symbol);
  const recent = quote.history.slice(-20);
  const earlier = quote.history.slice(-60, -20);
  const recentAvg = average(recent);
  const earlierAvg = average(earlier);
  const day = changeFor(symbol).percent;
  if (recentAvg > earlierAvg * 1.025 && day > 0) return { label: "Breakout", tone: "good" };
  if (recentAvg < earlierAvg * 0.985 && day < 0) return { label: "Weakening", tone: "bad" };
  if (Math.abs(day) > 1.2) return { label: "Volatile", tone: "warn" };
  return { label: "Base", tone: "" };
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function portfolioRows() {
  const total = state.positions.reduce((sum, item) => {
    const quote = ensureQuote(item.symbol);
    return sum + quote.price * item.shares;
  }, 0);
  return state.positions.map((item) => {
    const quote = ensureQuote(item.symbol);
    const profile = profileFor(item.symbol);
    const value = quote.price * item.shares;
    const costBasis = item.cost * item.shares;
    const pnl = value - costBasis;
    const day = (quote.price - quote.previous) * item.shares;
    return { ...item, profile, quote, value, costBasis, pnl, day, weight: total ? (value / total) * 100 : 0 };
  });
}

function portfolioStats() {
  const rows = portfolioRows();
  const value = rows.reduce((sum, row) => sum + row.value, 0);
  const cost = rows.reduce((sum, row) => sum + row.costBasis, 0);
  const day = rows.reduce((sum, row) => sum + row.day, 0);
  return {
    value,
    cost,
    day,
    totalPercent: cost ? ((value - cost) / cost) * 100 : 0,
    dayPercent: value ? (day / value) * 100 : 0
  };
}

function render() {
  document.body.classList.toggle("dark", state.theme === "dark");
  tickClock();
  renderProviderStatus();
  renderMetrics();
  renderFocus();
  renderWatchlists();
  renderPortfolio();
  renderJournal();
  renderAlerts();
  renderCharts();
  renderSearchSuggestions();
  refreshIcons();
}

function renderProviderStatus() {
  const badge = $("#dataSourceBadge");
  const label = $("#lastSyncLabel");
  if (!badge || !label) return;
  const mode = providerState.pending ? "syncing" : providerState.mode;
  const labels = {
    syncing: "Syncing",
    live: "Live",
    unavailable: "Unavailable",
    "server-required": "Server Required",
    connecting: "Connecting"
  };
  badge.textContent = labels[mode] || "Connecting";
  badge.className = `status-badge ${mode}`;
  const storageLabel = providerState.storage === "mongodb" ? "MongoDB" : providerState.storage === "memory" ? "Dev memory" : "Server";
  label.textContent = providerState.lastSync ? `Synced ${relativeTime(providerState.lastSync)} / ${storageLabel}` : storageLabel;

  const status = $("#marketStatus");
  if (status) {
    if (providerState.mode === "live") status.textContent = providerState.provider;
    else if (providerState.mode === "server-required") status.textContent = "Run npm start";
    else if (providerState.mode === "unavailable") status.textContent = "Live data unavailable";
    else status.textContent = "Connecting";
  }
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function renderMetrics() {
  const stats = portfolioStats();
  const watchSymbols = state.watchlist.map((item) => item.symbol);
  const advancing = watchSymbols.filter((symbol) => changeFor(symbol).percent >= 0).length;
  const triggered = state.alerts.filter(isAlertTriggered).length;
  $("#totalEquity").textContent = money(stats.value, "USD");
  $("#totalEquityDelta").textContent = pct(stats.totalPercent);
  $("#totalEquityDelta").className = classFor(stats.totalPercent);
  $("#dayPnL").textContent = money(stats.day, "USD");
  $("#dayPnL").className = classFor(stats.day);
  $("#dayPnLPercent").textContent = pct(stats.dayPercent);
  $("#dayPnLPercent").className = classFor(stats.dayPercent);
  $("#openAlerts").textContent = state.alerts.length;
  $("#triggeredAlerts").textContent = `${triggered} triggered`;
  $("#breadthLabel").textContent = `${advancing} / ${watchSymbols.length}`;
  $("#breadthDetail").textContent = watchSymbols.length ? "advancing" : "no symbols";
}

function renderFocus() {
  const symbol = state.selected || state.watchlist[0]?.symbol || state.positions[0]?.symbol || "NVDA";
  state.selected = symbol;
  const profile = profileFor(symbol);
  const quote = ensureQuote(symbol);
  const move = changeFor(symbol);
  const signal = signalFor(symbol);
  $("#focusName").textContent = `${profile.symbol} - ${profile.name}`;
  $("#focusPrice").textContent = currencyFor(symbol, quote.price);
  $("#focusMove").textContent = `${currencyFor(symbol, move.amount)} ${pct(move.percent)}`;
  $("#focusMove").className = classFor(move.percent);
  $("#focusSector").textContent = profile.sector;
  $("#focusExchange").textContent = profile.exchange;
  $("#focusPe").textContent = number(profile.pe, 1);
  $("#focusBeta").textContent = number(profile.beta, 2);
  $("#signalStrip").innerHTML = [
    pill(signal.label, signal.tone),
    pill(`RS ${number(relativeStrength(symbol), 1)}`, relativeStrength(symbol) >= 50 ? "good" : "warn"),
    pill(`Vol ${number(volatility(symbol), 1)}%`, volatility(symbol) > 2 ? "warn" : ""),
    pill(quote.source === "Yahoo Finance" ? "Live quote" : "Awaiting live", quote.source === "Yahoo Finance" ? "good" : "warn")
  ].join("");
  drawSpark($("#focusSpark"), quote.history.slice(-60), move.percent);
  renderNews();
}

function renderNews() {
  const target = $("#focusNews");
  if (!target) return;
  const symbol = normalizeSymbol(state.selected);
  const items = state.news[symbol] || [];

  target.innerHTML = items.length
    ? items
        .map((item) => {
          const date = item.providerPublishTime
            ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(item.providerPublishTime))
            : "Market";
          return `
            <a class="news-item" href="${escapeAttribute(item.link || "#")}" target="_blank" rel="noreferrer">
              <strong>${escapeHtml(item.title || "Market update")}</strong>
              <span>${escapeHtml(item.publisher || "Finance")} - ${date}</span>
            </a>
          `;
        })
        .join("")
    : `<div class="empty-state">No recent headlines</div>`;
}

function relativeStrength(symbol) {
  const quote = ensureQuote(symbol);
  const slice = quote.history.slice(-60);
  const start = slice[0] || quote.price;
  const change = start ? ((quote.price - start) / start) * 100 : 0;
  return Math.max(0, Math.min(99, 50 + change * 6));
}

function volatility(symbol) {
  const quote = ensureQuote(symbol);
  const slice = quote.history.slice(-20);
  const returns = slice.slice(1).map((value, index) => ((value - slice[index]) / slice[index]) * 100);
  return Math.sqrt(average(returns.map((value) => value ** 2))) * Math.sqrt(252);
}

function pill(label, tone = "") {
  return `<span class="pill ${tone}">${escapeHtml(label)}</span>`;
}

function renderWatchlists() {
  const rows = state.watchlist
    .filter((item) => matchesSearch(item.symbol))
    .map((item) => {
      const profile = profileFor(item.symbol);
      const quote = ensureQuote(item.symbol);
      const move = changeFor(item.symbol);
      const signal = signalFor(item.symbol);
      const target = item.target ? currencyFor(item.symbol, item.target) : "-";
      return { item, profile, quote, move, signal, target };
    });

  $("#watchlistTable").innerHTML = rows.length
    ? rows
        .map(
          (row, index) => `
          <tr data-select="${row.item.symbol}">
            <td>${symbolCell(row.profile)}</td>
            <td>${escapeHtml(row.profile.name)}</td>
            <td>${currencyFor(row.item.symbol, row.quote.price)}</td>
            <td class="${classFor(row.move.percent)}">${pct(row.move.percent)}</td>
            <td>${pill(row.signal.label, row.signal.tone)}</td>
            <td>${row.target}</td>
            <td><canvas class="mini-chart" data-spark="${row.item.symbol}" width="116" height="34"></canvas></td>
            <td>${rowActions("watch", index)}</td>
          </tr>
        `
        )
        .join("")
    : emptyRow(8, "No symbols match");

  $("#watchlistPreview").innerHTML = state.watchlist
    .slice(0, 6)
    .map((item) => {
      const quote = ensureQuote(item.symbol);
      const move = changeFor(item.symbol);
      return `
        <tr data-select="${item.symbol}">
          <td>${symbolCell(profileFor(item.symbol))}</td>
          <td>${currencyFor(item.symbol, quote.price)}</td>
          <td class="${classFor(move.percent)}">${pct(move.percent)}</td>
          <td><canvas class="mini-chart" data-spark="${item.symbol}" width="116" height="34"></canvas></td>
        </tr>
      `;
    })
    .join("");

  drawAllMiniCharts();
}

function matchesSearch(symbol) {
  if (!searchTerm) return true;
  const profile = profileFor(symbol);
  const haystack = `${profile.symbol} ${profile.name} ${profile.sector} ${profile.exchange}`.toLowerCase();
  return haystack.includes(searchTerm.toLowerCase());
}

function symbolCell(profile) {
  return `
    <span class="symbol-cell">
      <strong>${escapeHtml(profile.symbol)}</strong>
      <small>${escapeHtml(profile.exchange)} / ${escapeHtml(profile.sector)}</small>
    </span>
  `;
}

function rowActions(type, index) {
  return `
    <span class="row-actions">
      <button class="small-icon" type="button" data-action="select" data-type="${type}" data-index="${index}" title="Focus" aria-label="Focus">
        <i data-lucide="crosshair" aria-hidden="true"></i>
      </button>
      <button class="small-icon" type="button" data-action="delete" data-type="${type}" data-index="${index}" title="Remove" aria-label="Remove">
        <i data-lucide="trash-2" aria-hidden="true"></i>
      </button>
    </span>
  `;
}

function emptyRow(cols, label) {
  return `<tr><td colspan="${cols}"><div class="empty-state">${escapeHtml(label)}</div></td></tr>`;
}

function renderPortfolio() {
  const rows = portfolioRows();
  $("#positionsTable").innerHTML = rows.length
    ? rows
        .map((row, index) => {
          const moveClass = classFor(row.pnl);
          return `
            <tr data-select="${row.symbol}">
              <td>${symbolCell(row.profile)}</td>
              <td>${number(row.shares, 2)}</td>
              <td>${currencyFor(row.symbol, row.cost)}</td>
              <td>${currencyFor(row.symbol, row.quote.price)}</td>
              <td>${currencyFor(row.symbol, row.value)}</td>
              <td class="${moveClass}">${currencyFor(row.symbol, row.pnl)}</td>
              <td>${number(row.weight, 1)}%</td>
              <td>${rowActions("position", index)}</td>
            </tr>
          `;
        })
        .join("")
    : emptyRow(8, "No positions yet");
}

function renderJournal() {
  $("#journalList").innerHTML = state.journal.length
    ? state.journal
        .map((item, index) => {
          const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(item.date));
          return `
            <article class="journal-card">
              <div class="journal-main">
                <strong>${escapeHtml(item.symbol)} ${escapeHtml(item.side)} - ${escapeHtml(item.conviction)}</strong>
                <p>${escapeHtml(item.thesis)}</p>
                <span class="subtle">${date}</span>
              </div>
              ${rowActions("journal", index)}
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">No journal entries yet</div>`;
}

function renderAlerts() {
  $("#alertList").innerHTML = state.alerts.length
    ? state.alerts
        .map((item, index) => {
          const quote = ensureQuote(item.symbol);
          const hit = isAlertTriggered(item);
          return `
            <article class="alert-card">
              <div class="alert-main">
                <strong>${escapeHtml(item.symbol)} ${item.operator} ${currencyFor(item.symbol, item.price)}</strong>
                <p>Last ${currencyFor(item.symbol, quote.price)} ${hit ? "- triggered" : "- waiting"}</p>
              </div>
              <span class="pill ${hit ? "good" : ""}">${hit ? "Triggered" : "Active"}</span>
              ${rowActions("alert", index)}
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">No alerts yet</div>`;
}

function isAlertTriggered(item) {
  const quote = ensureQuote(item.symbol);
  return item.operator === "above" ? quote.price >= item.price : quote.price <= item.price;
}

function renderCharts() {
  drawPerformance($("#performanceChart"));
  drawAllocation($("#allocationChart"));
}

function drawPerformance(canvas) {
  if (!canvas) return;
  const rows = portfolioRows();
  const length = quoteRange;
  const values = Array.from({ length }, (_, index) =>
    rows.reduce((sum, row) => {
      const quote = ensureQuote(row.symbol);
      const history = quote.history.slice(-length);
      return sum + (history[index] || quote.price) * row.shares;
    }, 0)
  );
  drawLine(canvas, values, "#0f8b8d", true);
}

function drawSpark(canvas, values, percent) {
  if (!canvas) return;
  drawLine(canvas, values, percent >= 0 ? "#168a5f" : "#c84b4b", false);
}

function drawLine(canvas, values, color, filled) {
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width || canvas.width));
  const height = Math.max(1, Math.floor(rect.height || canvas.height));
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);

  if (!values.length) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const pad = filled ? 18 : 4;
  const points = values.map((value, index) => ({
    x: values.length === 1 ? width / 2 : (index / (values.length - 1)) * (width - pad * 2) + pad,
    y: height - pad - ((value - min) / spread) * (height - pad * 2)
  }));

  if (filled) {
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--line");
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 7]);
    for (let i = 1; i < 4; i += 1) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(width - pad, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = filled ? 3 : 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  if (filled) {
    const gradient = ctx.createLinearGradient(0, pad, 0, height);
    gradient.addColorStop(0, "rgba(15, 139, 141, 0.22)");
    gradient.addColorStop(1, "rgba(15, 139, 141, 0.00)");
    ctx.lineTo(points.at(-1).x, height - pad);
    ctx.lineTo(points[0].x, height - pad);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }
}

function drawAllMiniCharts() {
  $$('[data-spark]').forEach((canvas) => {
    const symbol = canvas.dataset.spark;
    const quote = ensureQuote(symbol);
    drawSpark(canvas, quote.history.slice(-30), changeFor(symbol).percent);
  });
}

function drawAllocation(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const size = Math.max(180, Math.floor(rect.width || canvas.width));
  const ratio = window.devicePixelRatio || 1;
  canvas.width = size * ratio;
  canvas.height = size * ratio;
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, size, size);

  const bySector = new Map();
  portfolioRows().forEach((row) => bySector.set(row.profile.sector, (bySector.get(row.profile.sector) || 0) + row.value));
  const entries = Array.from(bySector.entries()).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, entry) => sum + entry[1], 0) || 1;
  let start = -Math.PI / 2;
  entries.forEach(([, value], index) => {
    const angle = (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(size / 2, size / 2);
    ctx.arc(size / 2, size / 2, size * 0.42, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = SECTOR_COLORS[index % SECTOR_COLORS.length];
    ctx.fill();
    start += angle;
  });
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--text");
  ctx.textAlign = "center";
  ctx.font = "700 14px Inter, sans-serif";
  ctx.fillText("Sectors", size / 2, size / 2 + 5);

  $("#allocationLegend").innerHTML = entries
    .map(([sector, value], index) => {
      const percent = (value / total) * 100;
      return `
        <div class="legend-item">
          <span class="legend-dot" style="background:${SECTOR_COLORS[index % SECTOR_COLORS.length]}"></span>
          <span>${escapeHtml(sector)}</span>
          <span>${number(percent, 0)}%</span>
        </div>
      `;
    })
    .join("");
}

function setView(viewId) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.viewTarget === viewId));
  const title = $(`#${viewId} h2`)?.textContent || "Dashboard";
  $("#pageTitle").textContent = title;
  renderCharts();
}

function selectSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return;
  state.selected = normalized;
  ensureQuote(normalized);
  saveState();
  render();
  refreshMarketData({ silent: true });
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view-target]");
    if (viewButton) setView(viewButton.dataset.viewTarget);

    const selectRow = event.target.closest("[data-select]");
    if (selectRow && !event.target.closest("button")) selectSymbol(selectRow.dataset.select);

    const actionButton = event.target.closest("[data-action]");
    if (actionButton) handleAction(actionButton);
  });

  $("#refreshBtn").addEventListener("click", () => refreshMarketData());

  $("#newsRefreshBtn").addEventListener("click", () => refreshNews());

  $("#themeBtn").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    saveState();
    render();
  });

  const suggest = debounce(updateSearchSuggestions, 220);
  $("#symbolSearch").addEventListener("input", (event) => {
    searchTerm = event.target.value.trim();
    renderWatchlists();
    suggest(searchTerm);
  });

  $("#symbolSearch").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const candidate = searchResults[0]?.symbol || searchTerm;
    if (!candidate) return;
    event.preventDefault();
    addWatchSymbol(candidate);
    selectSymbol(candidate);
    setView("dashboard");
  });

  $("#clearSearchBtn").addEventListener("click", () => {
    searchTerm = "";
    $("#symbolSearch").value = "";
    searchResults = [];
    renderWatchlists();
    renderSearchSuggestions();
  });

  $("#pinFocusBtn").addEventListener("click", () => {
    addWatchSymbol(state.selected);
  });

  $("#watchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    addWatchSymbol(form.get("symbol"), Number(form.get("target") || 0));
    event.currentTarget.reset();
  });

  $("#positionForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const symbol = normalizeSymbol(form.get("symbol"));
    if (!symbol) return;
    ensureQuote(symbol);
    state.positions.push({
      symbol,
      shares: Number(form.get("shares")),
      cost: Number(form.get("cost")),
      note: String(form.get("note") || "")
    });
    state.selected = symbol;
    saveState();
    event.currentTarget.reset();
    render();
    refreshMarketData({ silent: true });
  });

  $("#alertForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const symbol = normalizeSymbol(form.get("symbol"));
    if (!symbol) return;
    ensureQuote(symbol);
    state.alerts.push({
      id: newId(),
      symbol,
      operator: String(form.get("operator")),
      price: Number(form.get("price"))
    });
    saveState();
    event.currentTarget.reset();
    render();
    refreshMarketData({ silent: true });
  });

  $("#journalForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const symbol = normalizeSymbol(form.get("symbol"));
    if (!symbol) return;
    state.journal.unshift({
      id: newId(),
      date: new Date().toISOString(),
      symbol,
      side: String(form.get("side")),
      conviction: String(form.get("conviction")),
      thesis: String(form.get("thesis"))
    });
    saveState();
    event.currentTarget.reset();
    render();
  });

  $("#exportBtn").addEventListener("click", exportCsv);

  $$(".segmented button").forEach((button) => {
    button.addEventListener("click", () => {
      quoteRange = Number(button.dataset.range);
      $$(".segmented button").forEach((item) => item.classList.toggle("active", item === button));
      renderCharts();
    });
  });

  window.addEventListener("resize", debounce(renderCharts, 120));
}

async function updateSearchSuggestions(term) {
  const query = String(term || "").trim();
  if (query.length < 2) {
    searchResults = localSearch(query);
    renderSearchSuggestions();
    return;
  }

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const payload = await response.json();
    searchResults = payload.ok ? payload.results || [] : localSearch(query);
  } catch {
    searchResults = localSearch(query);
  }
  renderSearchSuggestions();
}

function localSearch(query) {
  const term = String(query || "").toLowerCase();
  return Object.entries(CATALOG)
    .map(([symbol, profile]) => ({ symbol, name: profile.name, exchange: profile.exchange, type: "Equity" }))
    .filter((item) => !term || `${item.symbol} ${item.name} ${item.exchange}`.toLowerCase().includes(term))
    .slice(0, 8);
}

function renderSearchSuggestions() {
  const list = $("#symbolSuggestions");
  if (!list) return;
  const items = searchResults.length ? searchResults : localSearch(searchTerm).slice(0, 6);
  list.innerHTML = items
    .map((item) => `<option value="${escapeAttribute(item.symbol)}">${escapeHtml(item.name || item.symbol)} - ${escapeHtml(item.exchange || item.type || "Market")}</option>`)
    .join("");
}

function handleAction(button) {
  const type = button.dataset.type;
  const index = Number(button.dataset.index);
  const action = button.dataset.action;
  if (action === "select") {
    const source = collectionFor(type)[index];
    if (source?.symbol) selectSymbol(source.symbol);
    return;
  }
  if (action === "delete") {
    collectionFor(type).splice(index, 1);
    saveState();
    render();
  }
}

function collectionFor(type) {
  if (type === "watch") return state.watchlist;
  if (type === "position") return state.positions;
  if (type === "alert") return state.alerts;
  return state.journal;
}

function addWatchSymbol(symbol, target = 0) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return;
  ensureQuote(normalized);
  const existing = state.watchlist.find((item) => item.symbol === normalized);
  if (existing) {
    existing.target = target || existing.target || 0;
  } else {
    state.watchlist.push({ symbol: normalized, target });
  }
  state.selected = normalized;
  saveState();
  render();
  refreshMarketData({ silent: true });
}

function exportCsv() {
  const header = ["Symbol", "Shares", "Average Cost", "Last", "Market Value", "PnL", "Currency", "Source", "Note"];
  const rows = portfolioRows().map((row) => [
    row.symbol,
    row.shares,
    row.cost,
    row.quote.price,
    row.value,
    row.pnl,
    row.profile.currency,
    row.quote.source,
    row.note || ""
  ]);
  const csv = [header, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "ash-stock-portfolio.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function tickClock() {
  const now = new Date();
  $("#clockLabel").textContent = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(now);
  const hour = now.getHours();
  const open = hour >= 9 && hour < 16;
  $("#sessionLabel").textContent = open ? "Regular session" : "After hours";
}

function showToast(message) {
  const region = $("#toastRegion");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  region.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function debounce(fn, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

function renderServerRequired() {
  document.body.innerHTML = `
    <main class="server-required-screen">
      <section class="server-required-panel">
        <div class="brand-mark">AS</div>
        <span class="eyebrow">Ash Stock</span>
        <h1>Run the live app server</h1>
        <p>This product uses the local backend for market data, search, and news.</p>
        <code>npm start</code>
        <p>Then open <strong>http://localhost:4173</strong></p>
      </section>
    </main>
  `;
}

async function bootstrap() {
  if (SERVER_REQUIRED) {
    renderServerRequired();
    return;
  }

  try {
    await loadServerState();
  } catch (error) {
    providerState.mode = "unavailable";
    providerState.storage = "unavailable";
    providerState.error = error.message;
    showToast("Backend state service unavailable");
  }

  bindEvents();
  trackedSymbols().forEach(ensureQuote);
  render();
  refreshMarketData({ silent: true });
  updateSearchSuggestions("");
  window.setInterval(() => refreshMarketData({ silent: true }), 60_000);
  window.setInterval(tickClock, 30_000);
}

bootstrap();
