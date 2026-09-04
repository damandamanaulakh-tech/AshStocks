const DATA_GAP_DECISION = ["DATA", "NEEDED"].join("_");

const state = {
  ready: null,
  scan: null,
  rows: [],
  selected: null,
  selectedQuote: null,
  orders: null,
  health: null,
  marketContext: null,
  marketQuotes: [],
  institutional: { status: "idle", market: null, stocks: {} },
  upstoxStatus: null,
  activeSection: "dashboard",
  activeNavKey: "dashboard",
  horizon: "intraday",
  lastError: "",
  activeParameter: null,
  universeRows: [],
  scanBasket: [],
  parameterCatalog: [],
  parameterStages: [],
  tunnelSelectedSymbols: [],
  tunnelStage: "ALL",
  tunnelParameterQuery: "",
  tunnelStockQuery: "",
  lastAutoPortfolioAttemptAt: 0,
  paperLedgerTab: "open",
  portfolioView: "holdings",
  orderWorkspaceView: "book",
  formulaSettings: null,
  formulaSettingsSaving: false,
  quickTrade: null,
  quickTradeSubmitting: false
};

const institutionalPendingSymbols = new Set();

const indexKeys = [
  { label: "NIFTY 50", key: "NSE_INDEX|Nifty 50" },
  { label: "SENSEX", key: "BSE_INDEX|SENSEX" },
  { label: "NIFTY BANK", key: "NSE_INDEX|Nifty Bank" },
  { label: "MIDCAP 150", key: "NSE_INDEX|Nifty Midcap 150" },
  { label: "INDIA VIX", key: "NSE_INDEX|India VIX" }
];

const DEFAULT_SCAN_LIMIT = 200;
const FAMILIAR_DEFAULT_EXCLUDE = new Set([
  "ADANIENT", "ADANIPORTS", "ASIANPAINT", "AXISBANK", "BAJAJFINSV", "BAJFINANCE",
  "BHARTIARTL", "HCLTECH", "HDFC", "HDFCAMC", "HDFCBANK", "HDFCLIFE", "HINDUNILVR",
  "ICICIBANK", "INFY", "ITC", "KOTAKBANK", "LT", "MARUTI", "NESTLEIND", "NTPC",
  "POWERGRID", "RELIANCE", "SBIN", "SUNPHARMA", "TATACONSUM", "TATAMOTORS",
  "TATAPOWER", "TATASTEEL", "TCS", "TECHM", "TITAN", "ULTRACEMCO"
]);
const NON_EQUITY_NAME_PATTERN = /\b(?:ETF|BEES|LIQUID|GILT|SDL|NIFTY|SENSEX|INDEX|GOLD|SILVER|NASDAQ|HANGSENG|MON100|BANKETF|PSUBANK|LOWVOL|MOMENTUM|VALUE|ALPHA)\b/i;

const el = (id) => document.getElementById(id);
const all = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(String(value).replace(/,/g, "").replace(/%$/, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function round(value, places = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** places;
  return Math.round(n * factor) / factor;
}

function fmtNumber(value, places = 2) {
  const n = numberValue(value);
  if (n === null) return "NA";
  return n.toLocaleString("en-IN", { maximumFractionDigits: places, minimumFractionDigits: places });
}

function fmtInt(value) {
  const n = numberValue(value);
  if (n === null) return "NA";
  return Math.round(n).toLocaleString("en-IN");
}

function fmtPrice(value) {
  const n = numberValue(value);
  if (n === null) return "NA";
  return "Rs " + n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function fmtPct(value, alreadyPct = true) {
  const n = numberValue(value);
  if (n === null) return "NA";
  const pct = alreadyPct ? n : n * 100;
  return `${pct >= 0 ? "+" : ""}${fmtNumber(pct, 2)}%`;
}

function isoDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value).slice(0, 19);
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
}

function nseSymbol(row) {
  return String(row?.symbol || row?.trading_symbol || row?.tradingsymbol || "").trim().toUpperCase();
}

function openPaperPosition(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  return (state.orders?.positions || []).find((position) => nseSymbol(position) === normalized) || null;
}

function tradeSourceFor(symbol, source = null) {
  const normalized = String(symbol || "").trim().toUpperCase();
  return source
    || state.rows.find((row) => nseSymbol(row) === normalized)
    || openPaperPosition(normalized)
    || (state.orders?.orders || []).find((order) => nseSymbol(order) === normalized)
    || (state.orders?.closed_trades || []).find((trade) => nseSymbol(trade) === normalized)
    || { symbol: normalized };
}

function renderTradeActions(item, { compact = false } = {}) {
  const symbol = nseSymbol(item);
  if (!symbol) return "";
  const position = openPaperPosition(symbol);
  const heldQty = Math.max(0, Math.floor(numberValue(position?.qty) || 0));
  const buyLabel = heldQty ? "ADD" : "BUY";
  const compactClass = compact ? " compact" : "";
  return `<span class="inline-trade-actions${compactClass}" data-trade-actions-for="${escapeHtml(symbol)}">
    <button class="trade-action buy" type="button" data-quick-trade="BUY" data-trade-symbol="${escapeHtml(symbol)}" aria-label="${buyLabel} ${escapeHtml(symbol)} paper position">${buyLabel}</button>
    <button class="trade-action sell" type="button" data-quick-trade="SELL" data-trade-symbol="${escapeHtml(symbol)}" aria-label="Exit ${escapeHtml(symbol)} paper position" ${heldQty ? "" : `disabled title="No open paper position to exit"`}>EXIT</button>
  </span>`;
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function freshScanSeed() {
  return `${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}:${state.horizon}`;
}

function isFreshScanCandidate(row) {
  const symbol = nseSymbol(row);
  if (!symbol || !row?.instrument_key) return false;
  if (FAMILIAR_DEFAULT_EXCLUDE.has(symbol)) return false;
  const exchange = String(row.exchange || "NSE").toUpperCase();
  if (exchange && exchange !== "NSE") return false;
  const instrumentType = String(row.instrument_type || "EQ").toUpperCase();
  if (instrumentType && instrumentType !== "EQ") return false;
  const joined = `${symbol} ${row.name || ""} ${row.short_name || ""}`;
  return !NON_EQUITY_NAME_PATTERN.test(joined);
}

function buildFreshScanBasket(universe = []) {
  const rows = universe
    .filter((row) => row && nseSymbol(row) && row.instrument_key)
    .map((row) => ({ ...row, symbol: nseSymbol(row) }));
  const freshRows = rows.filter(isFreshScanCandidate);
  const sourceRows = freshRows.length >= 80 ? freshRows : rows.filter((row) => !FAMILIAR_DEFAULT_EXCLUDE.has(nseSymbol(row)));
  const seed = freshScanSeed();
  return [...sourceRows]
    .sort((a, b) => stableHash(`${seed}:${nseSymbol(a)}`) - stableHash(`${seed}:${nseSymbol(b)}`))
    .slice(0, DEFAULT_SCAN_LIMIT);
}

async function loadUniverseForFreshScan() {
  const meta = await api("/api/scanner/parameters");
  state.universeRows = Array.isArray(meta.universe) ? meta.universe : [];
  state.parameterCatalog = Array.isArray(meta.parameter_tunnel?.parameters) ? meta.parameter_tunnel.parameters : [];
  state.parameterStages = Array.isArray(meta.parameter_tunnel?.stages) ? meta.parameter_tunnel.stages : [];
  state.scanBasket = buildFreshScanBasket(state.universeRows);
  if (!state.scanBasket.length) throw new Error("Mongo NSE universe is empty; reload NSE Master first.");
}

async function loadNseMaster() {
  const button = el("nseMasterBtn");
  if (button) button.disabled = true;
  setNotice("Loading fresh NSE Master from Upstox into Mongo", "info");
  try {
    const result = await api("/api/data-bank/load-upstox-nse", { method: "POST", body: { trigger: "dashboard" } });
    const saved = result.saved_universe || result.universe_count || result.rows_saved || result.count || "NSE";
    setNotice(`NSE Master loaded into Mongo: ${saved} instruments`, "ok");
    await refreshScan();
  } catch (error) {
    state.lastError = error.message;
    setNotice(`NSE Master load failed: ${error.message}`, "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function runPaperEngineNow() {
  const button = el("paperEngineBtn");
  if (button) button.disabled = true;
  setNotice("Running paper engine: Upstox scan, SELECT filter, paper fills, target/stop monitor", "info");
  try {
    const result = await api("/api/paper-engine/run", { method: "POST", body: { trigger: "dashboard" } });
    const autoBuy = result.auto_buy || {};
    const filled = Number(autoBuy.orders_filled || 0);
    const ready = Number(autoBuy.candidates_ready || 0);
    const rejected = Number(autoBuy.rejected || 0);
    const positions = Array.isArray(result.positions) ? result.positions.length : 0;
    const pending = Number(autoBuy.pending_after_run || 0);
    const rejectionReason = autoBuy.rejections?.[0]?.rejection_reason || "";
    const message = filled
      ? `Paper engine filled ${filled} BUY order(s); open positions ${positions}; pending SELECT ${pending}`
      : `Paper engine ran: ${ready} SELECT candidate(s), ${filled} fills, ${rejected} rejected, pending SELECT ${pending}${rejectionReason ? ` | ${rejectionReason}` : ""}`;
    setNotice(message, filled ? "ok" : "warn");
    await loadOrders();
    return result;
  } catch (error) {
    state.lastError = error.message;
    setNotice(`Paper engine failed: ${error.message}`, "error");
    return null;
  } finally {
    if (button) button.disabled = false;
  }
}

function nseMarketOpenNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minute = Number(values.hour) * 60 + Number(values.minute);
  return !["Sat", "Sun"].includes(values.weekday) && minute >= 9 * 60 + 15 && minute <= 15 * 60 + 30;
}

async function maybeAutoStartPaperPortfolio() {
  if (!nseMarketOpenNow()) return;
  if (!state.upstoxStatus?.token_visible) return;
  const openSymbols = new Set(
    (state.orders?.positions || [])
      .filter((position) => position.status !== "CLOSED" && numberValue(position.qty) > 0)
      .map((position) => nseSymbol(position))
      .filter(Boolean)
  );
  const pendingSelects = state.rows.filter((row) => row.decision === "SELECT" && !openSymbols.has(nseSymbol(row)));
  if (!pendingSelects.length) return;
  if (Date.now() - state.lastAutoPortfolioAttemptAt < 2 * 60 * 1000) return;
  state.lastAutoPortfolioAttemptAt = Date.now();
  await runPaperEngineNow();
}

function renderBasketMeta() {
  const node = el("basketMeta");
  if (!node) return;
  const total = state.universeRows.length || state.scanBasket.length || state.rows.length;
  node.textContent = `Fresh NSE rotation: ${state.scanBasket.length || state.rows.length}/${total || 0}`;
}

function setNotice(message, tone = "info") {
  const node = el("noticeLine");
  if (!node) return;
  node.className = `notice-line ${tone}`;
  node.textContent = message;
}

function startClock() {
  const node = el("marketClock");
  if (!node) return;
  const draw = () => {
    const now = new Date();
    const ist = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
    const weekday = now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" });
    node.textContent = `${weekday} ${ist} IST`;
  };
  draw();
  setInterval(draw, 1000);
}

async function api(path, options = {}) {
  const init = {
    method: options.method || "GET",
    headers: { accept: "application/json", ...(options.headers || {}) },
    credentials: "same-origin"
  };
  if (options.body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, init);
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_) {
    payload = { ok: false, error: text || response.statusText };
  }
  if (!response.ok) {
    const reason = payload.error || payload.message || response.statusText;
    throw new Error(`${response.status}: ${reason}`);
  }
  return payload;
}

function decisionDisplay(decision) {
  if (decision === DATA_GAP_DECISION) return "DATA GAP";
  return String(decision || "UNRANKED").replaceAll("_", " ");
}

function decisionClass(decision) {
  const value = String(decision || "").toLowerCase();
  if (value === "select") return "select";
  if (value === "watch") return "watch";
  if (value === "blocked" || value === "reject") return "blocked";
  if (decision === DATA_GAP_DECISION || value.includes("data")) return "gap";
  return "neutral";
}

function normalizeCandles(row) {
  const source = Array.isArray(row?.candles) ? row.candles : [];
  return source
    .map((item) => {
      if (Array.isArray(item)) {
        return {
          date: String(item[0] || ""),
          open: numberValue(item[1]),
          high: numberValue(item[2]),
          low: numberValue(item[3]),
          close: numberValue(item[4]),
          volume: numberValue(item[5])
        };
      }
      return {
        date: String(item.date || item.time || item.timestamp || ""),
        open: numberValue(item.open),
        high: numberValue(item.high),
        low: numberValue(item.low),
        close: numberValue(item.close),
        volume: numberValue(item.volume || item.vol)
      };
    })
    .filter((candle) =>
      Number.isFinite(Date.parse(candle.date)) &&
      [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
    )
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

function last(candles) {
  return candles[candles.length - 1] || null;
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function sma(candles, days) {
  if (candles.length < days) return null;
  return average(candles.slice(-days).map((candle) => candle.close));
}

function highest(candles, days, field = "high") {
  if (candles.length < days) return null;
  const values = candles.slice(-days).map((candle) => candle[field]).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function lowest(candles, days, field = "low") {
  if (candles.length < days) return null;
  const values = candles.slice(-days).map((candle) => candle[field]).filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}

function returnDays(candles, days) {
  if (candles.length <= days) return null;
  const now = last(candles)?.close;
  const then = candles[candles.length - 1 - days]?.close;
  if (!Number.isFinite(now) || !Number.isFinite(then) || then <= 0) return null;
  return (now / then - 1) * 100;
}

function trueRange(candle, previousClose) {
  if (!candle) return null;
  const a = candle.high - candle.low;
  const b = Math.abs(candle.high - previousClose);
  const c = Math.abs(candle.low - previousClose);
  return Math.max(a, b, c);
}

function atr(candles, days = 14) {
  if (candles.length <= days) return null;
  const ranges = [];
  for (let i = candles.length - days; i < candles.length; i += 1) {
    ranges.push(trueRange(candles[i], candles[i - 1]?.close ?? candles[i].close));
  }
  return average(ranges);
}

function dailyReturns(candles) {
  const values = [];
  for (let i = 1; i < candles.length; i += 1) {
    const prev = candles[i - 1].close;
    const cur = candles[i].close;
    if (prev > 0 && cur > 0) values.push(cur / prev - 1);
  }
  return values;
}

function annualVol(candles, days) {
  const returns = dailyReturns(candles).slice(-days);
  if (returns.length < Math.min(20, days)) return null;
  const mean = average(returns);
  const variance = average(returns.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function volumeAverage(candles, days) {
  if (candles.length < days) return null;
  return average(candles.slice(-days).map((candle) => candle.volume || 0));
}

function closeLocation(candle) {
  if (!candle || !Number.isFinite(candle.high) || !Number.isFinite(candle.low) || candle.high <= candle.low) return null;
  return ((candle.close - candle.low) / (candle.high - candle.low)) * 100;
}

function rowMetrics(row) {
  const candles = normalizeCandles(row);
  const latest = last(candles);
  const close = numberValue(row.close ?? latest?.close);
  const sma20 = sma(candles, 20);
  const sma50 = sma(candles, 50);
  const sma200 = sma(candles, 200);
  const high20 = highest(candles.slice(0, -1), 20, "high");
  const high252 = highest(candles, 252, "high") ?? numberValue(row.high_252);
  const low20 = lowest(candles, 20, "low");
  const atr14 = atr(candles, 14);
  const vol20 = annualVol(candles, 20);
  const vol63 = numberValue(row.vol_63d_pct ?? row.vol63) ?? annualVol(candles, 63);
  const avgVol20 = numberValue(row.adv20) ?? volumeAverage(candles, 20);
  const turnoverCr = numberValue(row.rupee_turnover_cr);
  const targetLeft = numberValue(row.target_potential?.potential_left_pct);
  return {
    candles,
    latest,
    close,
    sma20,
    sma50,
    sma200,
    high20,
    high252,
    low20,
    atr14,
    atrPct: atr14 && close ? (atr14 / close) * 100 : null,
    vol20,
    vol63,
    avgVol20,
    turnoverCr,
    targetLeft,
    return5: returnDays(candles, 5),
    return20: returnDays(candles, 20),
    return63: returnDays(candles, 63),
    return127: numberValue(row.return_6m_pct) ?? returnDays(candles, 127),
    return253: numberValue(row.return_12m_pct) ?? returnDays(candles, 253),
    closeLocation: closeLocation(latest)
  };
}

function pass(value, label, effect = "positive") {
  return { state: "hit", value: label, effect };
}

function fail(value, label, effect = "removes") {
  return { state: effect === "warn" ? "weak" : "blocked", value: label, effect };
}

function missing(label) {
  return { state: "missing", value: label, effect: "no value" };
}

function compareMetric(actual, test, label) {
  if (actual === null || actual === undefined || !Number.isFinite(Number(actual))) return missing("no computed value");
  return test(actual) ? pass(actual, label(actual)) : fail(actual, label(actual));
}

function latestCandle(row, metrics) {
  return metrics.latest || null;
}

function candleBodyPct(candle) {
  if (!candle) return null;
  const range = candle.high - candle.low;
  if (!Number.isFinite(range) || range <= 0) return null;
  return (Math.abs(candle.close - candle.open) / range) * 100;
}

function parameterPassFromServer(row, key) {
  const gates = row.gates || {};
  if (!(key in gates)) return null;
  return gates[key] ? pass(gates[key], "server gate PASS") : fail(gates[key], "server gate failed");
}

const parameterCatalog = [
  { id: 1, group: "Data", name: "Upstox instrument key exists", why: "Universe row can be priced by Upstox", evaluate: (row) => row.instrument_key ? pass(row.instrument_key, row.instrument_key) : missing("instrument key absent") },
  { id: 2, group: "Data", name: "No Upstox fetch error", why: "Candle feed must be clean", evaluate: (row) => row.fetch_error ? fail(row.fetch_error, row.fetch_error) : pass("", "no fetch error") },
  { id: 3, group: "Data", name: "Latest close exists", why: "Entry and P&L need real price", evaluate: (row, m) => compareMetric(m.close, (v) => v > 0, fmtPrice) },
  { id: 4, group: "Data", name: "At least 120 candles", why: "Medium-term parameters have enough evidence", evaluate: (row, m) => compareMetric(m.candles.length, (v) => v >= 120, (v) => `${v} candles`) },
  { id: 5, group: "Data", name: "At least 253 candles", why: "One-year momentum and volatility evidence", evaluate: (row, m) => compareMetric(m.candles.length, (v) => v >= 253, (v) => `${v} candles`) },
  { id: 6, group: "Data", name: "Fresh candle within 7 days", why: "Reject stale instruments", evaluate: (row) => compareMetric(numberValue(row.last_candle_age_days), (v) => v <= 7, (v) => `${v} days old`) },
  { id: 7, group: "Data", name: "Server data sufficiency gate", why: "Core engine says enough inputs exist", evaluate: (row) => parameterPassFromServer(row, "data_sufficiency") || missing("gate absent") },
  { id: 8, group: "Data", name: "No stuck OHLC candle", why: "Avoid bad daily candles", evaluate: (row) => parameterPassFromServer(row, "stuck_candle") || missing("gate absent") },

  { id: 21, group: "Trend", name: "Close above SMA 20", why: "Short trend is positive", evaluate: (row, m) => m.close === null || m.sma20 === null ? missing("needs 20 candles") : m.close > m.sma20 ? pass(m.close, `${fmtPrice(m.close)} > SMA20 ${fmtPrice(m.sma20)}`) : fail(m.close, `${fmtPrice(m.close)} <= SMA20 ${fmtPrice(m.sma20)}`, "warn") },
  { id: 22, group: "Trend", name: "Close above SMA 50", why: "Intermediate trend is positive", evaluate: (row, m) => m.close === null || m.sma50 === null ? missing("needs 50 candles") : m.close > m.sma50 ? pass(m.close, `${fmtPrice(m.close)} > SMA50 ${fmtPrice(m.sma50)}`) : fail(m.close, `${fmtPrice(m.close)} <= SMA50 ${fmtPrice(m.sma50)}`, "warn") },
  { id: 23, group: "Trend", name: "Close above SMA 200", why: "Long trend is positive", evaluate: (row, m) => m.close === null || m.sma200 === null ? missing("needs 200 candles") : m.close > m.sma200 ? pass(m.close, `${fmtPrice(m.close)} > SMA200 ${fmtPrice(m.sma200)}`) : fail(m.close, `${fmtPrice(m.close)} <= SMA200 ${fmtPrice(m.sma200)}`) },
  { id: 24, group: "Trend", name: "SMA 20 above SMA 50", why: "Trend alignment", evaluate: (row, m) => m.sma20 === null || m.sma50 === null ? missing("needs SMA20 and SMA50") : m.sma20 > m.sma50 ? pass(m.sma20, `${fmtPrice(m.sma20)} > ${fmtPrice(m.sma50)}`) : fail(m.sma20, `${fmtPrice(m.sma20)} <= ${fmtPrice(m.sma50)}`, "warn") },
  { id: 25, group: "Trend", name: "SMA 50 above SMA 200", why: "Long trend alignment", evaluate: (row, m) => m.sma50 === null || m.sma200 === null ? missing("needs SMA50 and SMA200") : m.sma50 > m.sma200 ? pass(m.sma50, `${fmtPrice(m.sma50)} > ${fmtPrice(m.sma200)}`) : fail(m.sma50, `${fmtPrice(m.sma50)} <= ${fmtPrice(m.sma200)}`) },
  { id: 26, group: "Trend", name: "Near 252D high", why: "Leadership near yearly high", evaluate: (row, m) => m.close === null || m.high252 === null ? missing("needs 252D high") : (m.high252 / m.close - 1) * 100 <= 15 ? pass(m.high252, `${fmtNumber((m.high252 / m.close - 1) * 100)}% below high`) : fail(m.high252, `${fmtNumber((m.high252 / m.close - 1) * 100)}% below high`, "warn") },
  { id: 27, group: "Trend", name: "20D breakout close", why: "Fresh strength over recent supply", evaluate: (row, m) => m.close === null || m.high20 === null ? missing("needs 20D high") : m.close >= m.high20 ? pass(m.close, `${fmtPrice(m.close)} >= 20D high ${fmtPrice(m.high20)}`) : fail(m.close, `${fmtPrice(m.close)} < 20D high ${fmtPrice(m.high20)}`, "warn") },
  { id: 28, group: "Trend", name: "Above 20D low by 8 percent", why: "Avoid immediate breakdown area", evaluate: (row, m) => m.close === null || m.low20 === null ? missing("needs 20D low") : m.close >= m.low20 * 1.08 ? pass(m.close, `${fmtNumber((m.close / m.low20 - 1) * 100)}% over 20D low`) : fail(m.close, `${fmtNumber((m.close / m.low20 - 1) * 100)}% over 20D low`, "warn") },

  { id: 41, group: "Momentum", name: "5D return positive", why: "Recent price impulse", evaluate: (row, m) => compareMetric(m.return5, (v) => v > 0, (v) => fmtPct(v)) },
  { id: 42, group: "Momentum", name: "20D return positive", why: "Monthly momentum", evaluate: (row, m) => compareMetric(m.return20, (v) => v > 0, (v) => fmtPct(v)) },
  { id: 43, group: "Momentum", name: "63D return positive", why: "Quarter momentum", evaluate: (row, m) => compareMetric(m.return63, (v) => v > 0, (v) => fmtPct(v)) },
  { id: 44, group: "Momentum", name: "6M return at least 8 percent", why: "Core AshStocks momentum gate", evaluate: (row, m) => compareMetric(m.return127, (v) => v >= 8, (v) => fmtPct(v)) },
  { id: 45, group: "Momentum", name: "12M return at least 12 percent", why: "Long-cycle strength", evaluate: (row, m) => compareMetric(m.return253, (v) => v >= 12, (v) => fmtPct(v)) },
  { id: 46, group: "Momentum", name: "Momentum score at least 65", why: "Server momentum score threshold", evaluate: (row) => compareMetric(numberValue(row.momentum_score), (v) => v >= 65, (v) => `${fmtNumber(v)} / 100`) },
  { id: 47, group: "Momentum", name: "Score in top quartile of scan", why: "Relative leadership inside current scan", evaluate: (row, m, ctx) => compareMetric(numberValue(row.score), (v) => v >= ctx.scoreQ3, (v) => `${fmtNumber(v)} vs Q3 ${fmtNumber(ctx.scoreQ3)}`) },
  { id: 48, group: "Momentum", name: "6M beats scan median", why: "Relative 6M strength", evaluate: (row, m, ctx) => compareMetric(m.return127, (v) => v >= ctx.median6m, (v) => `${fmtPct(v)} vs median ${fmtPct(ctx.median6m)}`) },
  { id: 49, group: "Momentum", name: "12M beats scan median", why: "Relative 12M strength", evaluate: (row, m, ctx) => compareMetric(m.return253, (v) => v >= ctx.median12m, (v) => `${fmtPct(v)} vs median ${fmtPct(ctx.median12m)}`) },

  { id: 61, group: "Liquidity", name: "ADV20 at least 200k shares", why: "Avoid illiquid paper fills", evaluate: (row, m) => compareMetric(m.avgVol20, (v) => v >= 200000, (v) => `${fmtInt(v)} shares`) },
  { id: 62, group: "Liquidity", name: "Rupee turnover at least 5 cr", why: "Cash participation filter", evaluate: (row, m) => compareMetric(m.turnoverCr, (v) => v >= 5, (v) => `${fmtNumber(v)} cr`) },
  { id: 63, group: "Liquidity", name: "ADV20 at least 1M shares", why: "Institutional liquidity tier", evaluate: (row, m) => compareMetric(m.avgVol20, (v) => v >= 1000000, (v) => `${fmtInt(v)} shares`) },
  { id: 64, group: "Liquidity", name: "Volume above 20D average", why: "Current participation", evaluate: (row, m) => {
    const latest = latestCandle(row, m);
    if (!latest || m.avgVol20 === null) return missing("needs latest volume and ADV20");
    return latest.volume >= m.avgVol20 ? pass(latest.volume, `${fmtInt(latest.volume)} >= ${fmtInt(m.avgVol20)}`) : fail(latest.volume, `${fmtInt(latest.volume)} < ${fmtInt(m.avgVol20)}`, "warn");
  } },
  { id: 65, group: "Liquidity", name: "Server liquidity share gate", why: "Core engine volume gate", evaluate: (row) => parameterPassFromServer(row, "liquidity_shares") || missing("gate absent") },
  { id: 66, group: "Liquidity", name: "Server rupee liquidity gate", why: "Core engine cash turnover gate", evaluate: (row) => parameterPassFromServer(row, "liquidity_rupee") || missing("gate absent") },

  { id: 81, group: "Risk", name: "ATR14 between 1 and 8 percent", why: "Enough movement without excess risk", evaluate: (row, m) => compareMetric(m.atrPct, (v) => v >= 1 && v <= 8, (v) => `${fmtNumber(v)}% ATR`) },
  { id: 82, group: "Risk", name: "20D drawdown under 12 percent", why: "Avoid damaged names", evaluate: (row, m) => {
    if (m.close === null || m.high20 === null) return missing("needs 20D high");
    const drawdown = (m.close / m.high20 - 1) * 100;
    return drawdown >= -12 ? pass(drawdown, `${fmtNumber(drawdown)}%`) : fail(drawdown, `${fmtNumber(drawdown)}%`);
  } },
  { id: 83, group: "Risk", name: "63D volatility under 45 percent", why: "Volatility cap", evaluate: (row, m) => compareMetric(m.vol63, (v) => v <= 45, (v) => `${fmtNumber(v)}% vol`) },
  { id: 84, group: "Risk", name: "Quality score at least 50", why: "Risk-adjusted quality floor", evaluate: (row) => compareMetric(numberValue(row.quality_score), (v) => v >= 50, (v) => `${fmtNumber(v)} / 100`) },
  { id: 85, group: "Risk", name: "Server correlation gate", why: "Avoid duplicate exposure", evaluate: (row) => parameterPassFromServer(row, "correlation") || missing("gate absent") },
  { id: 86, group: "Risk", name: "Server volatility cap", why: "Core engine risk cap", evaluate: (row) => parameterPassFromServer(row, "volatility_cap") || missing("gate absent") },

  { id: 101, group: "Candle", name: "Latest candle green", why: "Bullish daily close", evaluate: (row, m) => {
    const candle = latestCandle(row, m);
    if (!candle) return missing("needs latest candle");
    return candle.close > candle.open ? pass(candle.close, `C ${fmtPrice(candle.close)} > O ${fmtPrice(candle.open)}`) : fail(candle.close, `C ${fmtPrice(candle.close)} <= O ${fmtPrice(candle.open)}`, "warn");
  } },
  { id: 102, group: "Candle", name: "Close in upper 60 percent of range", why: "Demand held into close", evaluate: (row, m) => compareMetric(m.closeLocation, (v) => v >= 60, (v) => `${fmtNumber(v)}% close location`) },
  { id: 103, group: "Candle", name: "Wide bullish body", why: "Strong candle body", evaluate: (row, m) => {
    const candle = latestCandle(row, m);
    const body = candleBodyPct(candle);
    if (body === null) return missing("needs latest candle body");
    return candle.close > candle.open && body >= 55 ? pass(body, `${fmtNumber(body)}% body`) : fail(body, `${fmtNumber(body)}% body`, "warn");
  } },
  { id: 104, group: "Candle", name: "Bullish engulfing hit", why: "Reversal candle structure", evaluate: (row) => (row.candle_patterns || []).includes("bullish_engulfing") ? pass("", "server candle pattern hit") : fail("", "pattern not hit", "warn") },
  { id: 105, group: "Candle", name: "Hammer rejection hit", why: "Lower wick demand rejection", evaluate: (row) => (row.candle_patterns || []).includes("hammer_rejection") ? pass("", "server candle pattern hit") : fail("", "pattern not hit", "warn") },
  { id: 106, group: "Candle", name: "Volume confirmation candle", why: "Candle move has participation", evaluate: (row) => (row.candle_patterns || []).includes("volume_confirmation") ? pass("", "server candle pattern hit") : fail("", "pattern not hit", "warn") },
  { id: 107, group: "Candle", name: "Higher high and higher low", why: "Daily continuation structure", evaluate: (row) => (row.candle_patterns || []).includes("higher_high_higher_low") ? pass("", "server candle pattern hit") : fail("", "pattern not hit", "warn") },
  { id: 108, group: "Candle", name: "No bearish engulfing", why: "Avoid latest bearish reversal", evaluate: (row) => (row.candle_patterns || []).includes("bearish_engulfing") ? fail("", "bearish engulfing hit") : pass("", "no bearish engulfing") },

  { id: 121, group: "Selection", name: "Total score at least 70", why: "Selection-grade engine score", evaluate: (row) => compareMetric(numberValue(row.score), (v) => v >= 70, (v) => `${fmtNumber(v)} / 100`) },
  { id: 122, group: "Selection", name: "Target room at least 15 percent", why: "Upside room before prior high", evaluate: (row, m) => compareMetric(m.targetLeft, (v) => v >= 15, (v) => `${fmtNumber(v)}% room`) },
  { id: 123, group: "Selection", name: "Decision is SELECT or WATCH", why: "Candidate survives core filter", evaluate: (row) => ["SELECT", "WATCH"].includes(row.decision) ? pass(row.decision, decisionDisplay(row.decision)) : fail(row.decision, decisionDisplay(row.decision)) },
  { id: 124, group: "Selection", name: "Paper order is allowed by engine", why: "Order ticket can use real price", evaluate: (row) => row.paper_order?.status === "READY" ? pass(row.paper_order.status, "paper order ready") : fail(row.paper_order?.status, row.paper_order?.status || "paper order not created", "warn") },
  { id: 125, group: "Selection", name: "Paper-only safety lock", why: "No real-money broker writes", evaluate: (row) => row.paper_order?.broker_write_enabled === false || row.gates?.broker_write_enabled === false ? pass("", "broker write disabled") : fail("", "safety flag absent") }
];

function buildContext(rows) {
  const values6 = rows.map((row) => rowMetrics(row).return127).filter(Number.isFinite).sort((a, b) => a - b);
  const values12 = rows.map((row) => rowMetrics(row).return253).filter(Number.isFinite).sort((a, b) => a - b);
  const scores = rows.map((row) => numberValue(row.score)).filter(Number.isFinite).sort((a, b) => a - b);
  const median = (values) => values.length ? values[Math.floor(values.length / 2)] : 0;
  const q3 = (values) => values.length ? values[Math.floor(values.length * 0.75)] : 0;
  return { median6m: median(values6), median12m: median(values12), scoreQ3: q3(scores) };
}

function evaluateParameter(param, row, ctx) {
  try {
    return param.evaluate(row, rowMetrics(row), ctx);
  } catch (error) {
    return { state: "missing", value: error.message, effect: "calculation error" };
  }
}

function rowParameterResults(row, ctx) {
  return parameterCatalog.map((param) => ({ param, result: evaluateParameter(param, row, ctx) }));
}

function hitCount(row, ctx) {
  return rowParameterResults(row, ctx).filter((item) => item.result.state === "hit").length;
}

function sortedRows(rows = state.rows) {
  const rank = { SELECT: 0, WATCH: 1, BLOCKED: 2, REJECT: 3, [DATA_GAP_DECISION]: 4 };
  return [...rows].sort((a, b) => (rank[a.decision] ?? 8) - (rank[b.decision] ?? 8) || (numberValue(b.score) || 0) - (numberValue(a.score) || 0) || String(a.symbol).localeCompare(String(b.symbol)));
}

function visibleRows() {
  const search = el("symbolSearch")?.value.trim().toUpperCase() || "";
  const decisionRaw = el("decisionFilter")?.value || "ALL";
  const decision = decisionRaw === "DATA_GAP" ? DATA_GAP_DECISION : decisionRaw;
  return sortedRows().filter((row) => {
    const inSearch = !search || String(row.symbol || "").includes(search) || String(row.name || "").toUpperCase().includes(search) || String(row.sector || "").toUpperCase().includes(search);
    const inDecision = decision === "ALL" || row.decision === decision;
    return inSearch && inDecision;
  });
}

function renderMarketStrip(status = "loading", quotes = []) {
  const node = el("marketStrip");
  if (!node) return;
  if (status === "ready") state.marketQuotes = Array.isArray(quotes) ? quotes : [];
  node.classList.toggle("has-error", status === "error");
  if (status === "error") {
    node.innerHTML = `
      <article class="market-card danger market-error-card">
        <span class="mini-label">Upstox quotes</span>
        <strong>Quote unavailable</strong>
        <p>${escapeHtml(state.lastError || "Upstox did not return the requested market quotes.")}</p>
        <small>Renew the Upstox token in Settings, then refresh.</small>
      </article>`;
    return;
  }
  const byKey = new Map((quotes || []).map((quote) => [quote.instrument_key, quote]));
  node.innerHTML = indexKeys.map((item) => {
    const quote = byKey.get(item.key);
    if (!quote) {
      return `<article class="market-card"><span class="mini-label">${escapeHtml(item.label)}</span><strong>Quote pending</strong><p>Upstox key ${escapeHtml(item.key)}</p></article>`;
    }
    const change = quote.change_pct ?? (quote.close && quote.last_price ? ((quote.last_price / quote.close) - 1) * 100 : null);
    return `<article class="market-card ${Number(change) >= 0 ? "up" : "down"}">
      <span class="mini-label">${escapeHtml(item.label)}</span>
      <strong>${fmtNumber(quote.last_price)}</strong>
      <p>${fmtPct(change)} | ${escapeHtml(isoDate(quote.timestamp || quote.asOf))}</p>
    </article>`;
  }).join("");
}

function tunnelEvidence(row, patterns = []) {
  const results = Array.isArray(row?.parameter_tunnel?.results) ? row.parameter_tunnel.results : [];
  return results.find((result) => patterns.some((pattern) => pattern.test(`${result.id || ""} ${result.name || ""} ${result.formula || ""}`))) || null;
}

function signalState(value) {
  const normalized = String(value || "SOURCE_REQUIRED").toUpperCase();
  if (["HIT", "CLEAR", "PASS", "SELECT"].includes(normalized)) return { className: "positive", label: normalized === "CLEAR" ? "CLEAR" : "BULLISH", icon: "circle-check" };
  if (["RISK", "BLOCKED", "REJECT"].includes(normalized)) return { className: "negative", label: normalized, icon: "circle-x" };
  if (["MISS", "WATCH", "WEAK"].includes(normalized)) return { className: "watch", label: normalized, icon: "circle-alert" };
  return { className: "needed", label: "DATA NEEDED", icon: "circle-help" };
}

function institutionalFor(row) {
  return state.institutional.stocks[nseSymbol(row)] || null;
}

function renderFiiHoldingCell(row) {
  const evidence = institutionalFor(row);
  const symbol = nseSymbol(row);
  if (evidence?.status === "LIVE" && numberValue(evidence.fii_holding_pct) !== null) {
    const change = numberValue(evidence.fii_change_pp);
    const tone = change === null || change === 0 ? "watch" : change > 0 ? "positive" : "negative";
    const delta = change === null ? "first quarter" : `${change >= 0 ? "+" : ""}${fmtNumber(change, 2)} pp`;
    const title = `${evidence.source} · ${evidence.fii_period} · previous ${evidence.fii_previous_period || "not returned"}`;
    return `<span class="fii-holding-cell ${tone}" title="${escapeHtml(title)}"><strong>${fmtNumber(evidence.fii_holding_pct, 2)}%</strong><small>${escapeHtml(delta)}</small></span>`;
  }
  if (institutionalPendingSymbols.has(symbol)) return `<span class="data-needed fii-loading">UPSTOX…</span>`;
  return `<span class="data-needed" title="${escapeHtml(evidence?.reason || "Upstox FII shareholding not loaded")}">DATA NEEDED</span>`;
}

async function loadInstitutionalEvidence(rows = []) {
  const candidates = rows
    .filter((row) => row?.instrument_key && !institutionalFor(row) && !institutionalPendingSymbols.has(nseSymbol(row)))
    .slice(0, 12);
  if (!candidates.length && state.institutional.market) return;
  candidates.forEach((row) => institutionalPendingSymbols.add(nseSymbol(row)));
  state.institutional.status = "loading";
  renderSignalDashboard();
  try {
    const payload = await api("/api/upstox/institutional-flow", {
      method: "POST",
      body: {
        instruments: candidates.map((row) => ({
          symbol: nseSymbol(row),
          instrument_key: row.instrument_key,
          isin: row.isin || ""
        }))
      }
    });
    state.institutional.market = payload.market || state.institutional.market;
    for (const stock of payload.stocks || []) {
      const symbol = nseSymbol(stock) || candidates.find((row) => String(row.instrument_key) === String(stock.instrument_key))?.symbol;
      if (symbol) state.institutional.stocks[symbol] = stock;
    }
    state.institutional.status = payload.ok ? "ready" : "data_needed";
    state.institutional.asOf = payload.as_of || null;
    state.institutional.version = payload.version || null;
  } catch (error) {
    state.institutional.status = "data_needed";
    state.institutional.market = { status: "DATA_NEEDED", reason: error.message, source: "Upstox FII/DII Activity API" };
    candidates.forEach((row) => {
      state.institutional.stocks[nseSymbol(row)] = { status: "DATA_NEEDED", reason: error.message, source: "Upstox Share Holdings API" };
    });
  } finally {
    candidates.forEach((row) => institutionalPendingSymbols.delete(nseSymbol(row)));
    renderSignalDashboard();
  }
}

function renderSignalDashboard() {
  const radarBody = el("signalRadarBody");
  if (!radarBody) return;
  const rows = sortedRows();
  const counts = state.rows.reduce((summary, row) => {
    const key = row.decision === "SELECT"
      ? "SELECT"
      : row.decision === "WATCH"
        ? "WATCH"
        : row.decision === DATA_GAP_DECISION
          ? "DATA NEEDED"
          : "BLOCKED";
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});
  const legend = el("signalRadarLegend");
  if (legend) legend.innerHTML = [
    ["select", "SELECT", counts.SELECT || 0],
    ["watch", "WATCH", counts.WATCH || 0],
    ["blocked", "BLOCKED", counts.BLOCKED || 0],
    ["needed", "DATA NEEDED", counts["DATA NEEDED"] || 0]
  ].map(([tone, label, count]) => `<span class="${tone}"><i></i>${label} <b>${count}</b></span>`).join("");

  if (!rows.length) {
    radarBody.innerHTML = `<tr><td colspan="10" class="signal-empty">Run the scanner to populate the Pre-Rise Radar with real NSE evidence.</td></tr>`;
  } else {
    radarBody.innerHTML = rows.map((row, index) => {
      const metrics = rowMetrics(row);
      const trend20 = numberValue(metrics.return20);
      const volumeMultiple = metrics.latest?.volume && metrics.avgVol20 ? metrics.latest.volume / metrics.avgVol20 : null;
      const volumeEvidence = tunnelEvidence(row, [/volume.*20/i, /volume confirmation/i, /volume expansion/i]);
      const priceEvidence = tunnelEvidence(row, [/price structure/i, /breakout/i, /above.*(?:ema|sma)/i, /new high/i]);
      const proof = row.parameter_tunnel?.summary || {};
      const volumeState = signalState(volumeEvidence?.state || "SOURCE_REQUIRED");
      const priceState = signalState(priceEvidence?.state || (trend20 !== null ? (trend20 > 0 ? "HIT" : "WATCH") : "SOURCE_REQUIRED"));
      const proofState = signalState(numberValue(proof.evaluated) > 0 ? (numberValue(proof.evidence_score) >= 48 ? "HIT" : "WATCH") : "SOURCE_REQUIRED");
      const decision = decisionDisplay(row.decision);
      return `<tr class="${state.selected?.symbol === row.symbol ? "active" : ""}" data-signal-symbol="${escapeHtml(row.symbol)}">
        <td>${index + 1}</td>
        <td><button type="button" data-signal-symbol="${escapeHtml(row.symbol)}"><strong>${escapeHtml(row.symbol)}</strong><small>${escapeHtml(row.sector || row.name || "NSE")}</small></button></td>
        <td><b class="signal-score ${decisionClass(row.decision)}">${fmtNumber(row.score, 0)}</b></td>
        <td><span class="signal-trend ${trend20 !== null && trend20 >= 0 ? "positive" : "negative"}">${fmtPct(trend20)}</span></td>
        <td>${volumeMultiple === null ? `<span class="data-needed">DATA NEEDED</span>` : `<strong>${fmtNumber(volumeMultiple, 2)}x</strong>`}</td>
        <td>${renderFiiHoldingCell(row)}</td>
        <td><span class="evidence-icon ${volumeState.className}" title="${escapeHtml(volumeEvidence?.value || volumeState.label)}"><i data-lucide="${volumeState.icon}"></i></span></td>
        <td><span class="evidence-icon ${priceState.className}" title="${escapeHtml(priceEvidence?.value || priceState.label)}"><i data-lucide="${priceState.icon}"></i></span></td>
        <td><span class="evidence-icon ${proofState.className}" title="${escapeHtml(proof.evaluated ? `${proof.positive_hits || 0}/${proof.evaluated} conditions` : proofState.label)}"><i data-lucide="${proofState.icon}"></i></span></td>
        <td><span class="radar-inline-actions"><button class="radar-action ${decisionClass(row.decision)}" type="button" data-signal-symbol="${escapeHtml(row.symbol)}">${escapeHtml(decision)}</button>${renderTradeActions(row, { compact: true })}</span></td>
      </tr>`;
    }).join("");
  }

  const stamp = el("signalRadarStamp");
  if (stamp) {
    const scanAsOf = state.scan?.asOf || state.scan?.as_of || state.scan?.generated_at || state.scan?.last_run;
    stamp.textContent = scanAsOf ? `Scores updated ${isoDate(scanAsOf)}` : `${state.rows.length} stocks evaluated from the latest scan`;
  }

  all("button[data-signal-symbol]", radarBody).forEach((target) => target.addEventListener("click", (event) => {
    event.stopPropagation();
    selectSymbol(target.dataset.signalSymbol);
  }));

  const context = state.marketContext || {};
  const insight = context.insight || {};
  const cards = Array.isArray(context.cards) ? context.cards : [];
  const contextByKey = Object.fromEntries(cards.map((card) => [card.key, card]));
  const breadth = context.breadth || {};
  const breadthTotal = [breadth.advancing, breadth.declining, breadth.unchanged].map(numberValue).filter((value) => value !== null).reduce((sum, value) => sum + value, 0);
  const breadthPct = breadthTotal ? (numberValue(breadth.advancing) || 0) / breadthTotal * 100 : null;
  const confidence = Math.max(0, Math.min(100, numberValue(insight.confidence) || 0));
  const institutionalMarket = state.institutional.market || {};
  const fiiCash5d = numberValue(institutionalMarket.fii_cash_5d_net_cr);
  const topSectors = [...state.rows.reduce((map, row) => {
    if (row.decision === "SELECT") map.set(row.sector || "Unmapped", (map.get(row.sector || "Unmapped") || 0) + 1);
    return map;
  }, new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([sector]) => sector).join(", ");
  const regimeNode = el("signalMarketRegime");
  if (regimeNode) regimeNode.innerHTML = `
    <div class="regime-summary">
      <div class="regime-gauge" style="--regime-angle:${(-75 + confidence * 1.5).toFixed(2)}deg"><span><strong>${escapeHtml(insight.bias || "LOADING")}</strong><small>Strength ${fmtNumber(confidence, 0)} / 100</small></span></div>
      <div class="regime-facts">
        <div><span>Trend (NIFTY 50)</span><strong class="${numberValue(contextByKey.nifty50?.change_pct) >= 0 ? "positive" : "negative"}">${contextByKey.nifty50?.price === null || contextByKey.nifty50?.price === undefined ? "DATA NEEDED" : `${fmtNumber(contextByKey.nifty50.price)} · ${fmtPct(contextByKey.nifty50.change_pct)}`}</strong></div>
        <div><span>Market breadth</span><strong>${breadthPct === null ? "DATA NEEDED" : `${fmtNumber(breadthPct, 1)}% advance`}</strong></div>
        <div><span>FII cash flow (5D)</span><strong class="${fiiCash5d === null ? "data-needed" : fiiCash5d >= 0 ? "positive" : "negative"}" title="${escapeHtml(institutionalMarket.source || institutionalMarket.reason || "Upstox FII Activity API")}">${fiiCash5d === null ? (state.institutional.status === "loading" ? "UPSTOX…" : "DATA NEEDED") : `${fiiCash5d >= 0 ? "+" : ""}${fmtNumber(fiiCash5d, 2)} Cr`}</strong></div>
        <div><span>Volatility (India VIX)</span><strong>${contextByKey.indiavix?.price === null || contextByKey.indiavix?.price === undefined ? "DATA NEEDED" : `${fmtNumber(contextByKey.indiavix.price)} · ${fmtPct(contextByKey.indiavix.change_pct)}`}</strong></div>
        <div><span>SELECT sector strength</span><strong>${escapeHtml(topSectors || "No SELECT sectors")}</strong></div>
      </div>
    </div>
    <footer><span>${escapeHtml((insight.notes || []).join(" · ") || "Fetching current market context")}</span><strong>${escapeHtml(context.asOf ? isoDate(context.asOf) : "Context loading")}</strong></footer>`;

  const row = state.selected;
  const evidenceSymbol = el("signalEvidenceSymbol");
  if (evidenceSymbol) evidenceSymbol.textContent = row ? `(${row.symbol})` : "No symbol";
  const evidenceNode = el("signalEvidence");
  if (evidenceNode) {
    if (!row) {
      evidenceNode.innerHTML = `<p class="signal-empty">Select a radar row to inspect its evidence.</p>`;
    } else {
      const metrics = rowMetrics(row);
      const volumeMultiple = metrics.latest?.volume && metrics.avgVol20 ? metrics.latest.volume / metrics.avgVol20 : null;
      const proof = row.parameter_tunnel?.summary || {};
      const selectedVolumeEvidence = tunnelEvidence(row, [/volume.*20/i, /volume confirmation/i, /volume expansion/i]);
      const stockInstitutional = institutionalFor(row);
      const stockFiiChange = numberValue(stockInstitutional?.fii_change_pp);
      const stockFiiStatus = stockInstitutional?.status !== "LIVE" ? "SOURCE_REQUIRED" : stockFiiChange === null || stockFiiChange === 0 ? "WATCH" : stockFiiChange > 0 ? "HIT" : "RISK";
      const stockFiiText = stockInstitutional?.status === "LIVE"
        ? `${fmtNumber(stockInstitutional.fii_holding_pct, 2)}% in ${stockInstitutional.fii_period}${stockFiiChange === null ? "" : ` · ${stockFiiChange >= 0 ? "+" : ""}${fmtNumber(stockFiiChange, 2)} pp QoQ`} · Upstox reported shareholding`
        : stockInstitutional?.reason || (institutionalPendingSymbols.has(nseSymbol(row)) ? "Loading Upstox shareholding" : "Upstox shareholding not returned");
      const evidenceRows = [
        ["FII Holding", stockFiiStatus, stockFiiText],
        ["Volume Expansion", selectedVolumeEvidence?.state || "SOURCE_REQUIRED", volumeMultiple === null ? "20D volume evidence absent" : `${fmtNumber(volumeMultiple, 2)}x of 20D average · ${selectedVolumeEvidence?.value || "threshold evidence absent"}`],
        ["Price Structure", numberValue(metrics.return20) === null ? "SOURCE_REQUIRED" : metrics.return20 > 0 ? "HIT" : "WATCH", numberValue(metrics.return20) === null ? "20D trend unavailable" : `${fmtPct(metrics.return20)} over 20 sessions`],
        ["Parameter Proof", numberValue(proof.evaluated) ? (numberValue(proof.evidence_score) >= 48 ? "HIT" : "WATCH") : "SOURCE_REQUIRED", numberValue(proof.evaluated) ? `${proof.positive_hits || 0}/${proof.evaluated} positive · score ${fmtNumber(proof.evidence_score)}` : "Tunnel proof not returned"]
      ];
      evidenceNode.innerHTML = `<div class="signal-evidence-head"><span>Factor</span><span>Status</span><span>Evidence</span><span></span></div>` + evidenceRows.map(([name, status, value]) => {
        const stateInfo = signalState(status);
        return `<div class="signal-evidence-row"><strong>${escapeHtml(name)}</strong><b class="${stateInfo.className}">${escapeHtml(stateInfo.label)}</b><span>${escapeHtml(value)}</span><i data-lucide="${stateInfo.icon}" class="${stateInfo.className}"></i></div>`;
      }).join("") + `<footer><span>Overall evidence strength</span><strong>${numberValue(proof.evidence_score) === null ? "DATA NEEDED" : `${fmtNumber(proof.evidence_score)} / 100`}</strong></footer>`;
    }
  }

  const paperTitle = el("signalPaperTitle");
  if (paperTitle) paperTitle.textContent = row?.decision === "SELECT" ? `Paper BUY Ready · ${row.symbol}` : row ? `Paper ${decisionDisplay(row.decision)} · ${row.symbol}` : "Paper BUY Readiness";
  const paperAction = el("signalPaperEngineAction");
  if (paperAction) paperAction.disabled = !state.rows.length;
  window.lucide?.createIcons?.();
}

async function loadSignalMarketContext() {
  try {
    state.marketContext = await api(`/api/market-context?ts=${Date.now()}`);
  } catch (error) {
    state.marketContext = { ok: false, error: error.message, insight: { bias: "DATA NEEDED", confidence: 0, notes: [error.message] }, cards: [], breadth: {} };
  }
  renderSignalDashboard();
}

function renderCandidates() {
  const node = el("candidateList");
  if (!node) return;
  const rows = visibleRows().slice(0, 80);
  const total = state.universeRows.length || state.rows.length;
  el("selectionCount").textContent = total ? `${state.rows.length}/${total}` : `${state.rows.length}`;
  renderBasketMeta();
  if (!rows.length) {
    node.innerHTML = `<div class="empty-state">No stock rows matched the current filter. Refresh runs the Upstox scan.</div>`;
    return;
  }
  node.innerHTML = rows.map((row) => {
    const active = state.selected?.symbol === row.symbol ? " active" : "";
    return `<div class="candidate-row${active}" data-candidate-symbol="${escapeHtml(row.symbol)}">
      <button class="candidate-select" type="button" data-symbol="${escapeHtml(row.symbol)}">
        <span><strong>${escapeHtml(row.symbol)}</strong><small>${escapeHtml(row.name || row.sector || "NSE")}</small></span>
        <span class="candidate-metrics"><b>${fmtNumber(row.score)}</b><em class="status-pill ${decisionClass(row.decision)}">${decisionDisplay(row.decision)}</em></span>
      </button>
      ${renderTradeActions(row, { compact: true })}
    </div>`;
  }).join("");
  all(".candidate-select", node).forEach((button) => {
    button.addEventListener("click", () => selectSymbol(button.dataset.symbol));
  });
}

function drawChart(row) {
  const canvas = el("priceChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(680, Math.floor(rect.width * scale));
  canvas.height = Math.max(280, Math.floor(rect.height * scale));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const width = canvas.width / scale;
  const height = canvas.height / scale;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#071013";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i += 1) {
    const y = 28 + i * ((height - 58) / 5);
    ctx.beginPath();
    ctx.moveTo(44, y);
    ctx.lineTo(width - 18, y);
    ctx.stroke();
  }
  const candles = normalizeCandles(row).slice(-90);
  if (!candles.length) {
    ctx.fillStyle = "#d8e6e4";
    ctx.font = "14px Inter, Arial, sans-serif";
    ctx.fillText("No candle evidence returned by Upstox scan for this symbol.", 28, 44);
    return;
  }
  const highs = candles.map((candle) => candle.high).filter(Number.isFinite);
  const lows = candles.map((candle) => candle.low).filter(Number.isFinite);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const pad = Math.max(0.01, (max - min) * 0.08);
  const top = max + pad;
  const bottom = min - pad;
  const xStep = (width - 72) / candles.length;
  const yFor = (price) => 24 + ((top - price) / (top - bottom)) * (height - 64);
  candles.forEach((candle, index) => {
    const x = 50 + index * xStep + xStep / 2;
    const openY = yFor(candle.open);
    const closeY = yFor(candle.close);
    const highY = yFor(candle.high);
    const lowY = yFor(candle.low);
    const up = candle.close >= candle.open;
    ctx.strokeStyle = up ? "#14b878" : "#e34b4b";
    ctx.fillStyle = up ? "#14b878" : "#e34b4b";
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();
    const bodyY = Math.min(openY, closeY);
    const bodyH = Math.max(2, Math.abs(openY - closeY));
    ctx.fillRect(x - Math.max(2, xStep * 0.28), bodyY, Math.max(4, xStep * 0.56), bodyH);
  });
  ctx.fillStyle = "#c8d8d5";
  ctx.font = "12px Inter, Arial, sans-serif";
  const latest = last(candles);
  ctx.fillText(`${row.symbol} | ${latest.date.slice(0, 10)} | C ${fmtPrice(latest.close)}`, 24, height - 18);
  ctx.fillText(`High ${fmtPrice(max)} / Low ${fmtPrice(min)}`, width - 190, height - 18);
}

async function fetchSelectedQuote(row) {
  state.selectedQuote = null;
  if (!row?.instrument_key) return null;
  try {
    const payload = await api(`/api/upstox/quote?instrument_key=${encodeURIComponent(row.instrument_key)}&symbol=${encodeURIComponent(row.symbol)}`);
    state.selectedQuote = payload.quotes?.[0] || null;
  } catch (error) {
    state.selectedQuote = { error: error.message };
  }
  return state.selectedQuote;
}

async function selectSymbol(symbol) {
  const row = state.rows.find((item) => item.symbol === symbol) || state.rows[0] || null;
  if (!row) return;
  state.selected = row;
  renderCandidates();
  renderSymbol();
  await Promise.all([fetchSelectedQuote(row), loadInstitutionalEvidence([row])]);
  renderSymbol();
}

function renderSymbol() {
  const row = state.selected;
  const ctx = buildContext(state.rows);
  if (!row) {
    el("symbolTitle").textContent = "Run scanner";
    el("symbolPrice").textContent = "Scan required";
    el("symbolMeta").textContent = "No NSE row selected";
    drawChart(null);
    renderFactors(null, ctx);
    renderReason(null, ctx);
    renderAutoOrderReadiness(null);
    renderSignalDashboard();
    renderPiano();
    return;
  }
  const quotePrice = numberValue(state.selectedQuote?.last_price);
  const scanPrice = numberValue(row.close);
  const latestPrice = quotePrice ?? scanPrice;
  el("symbolTitle").textContent = `${row.symbol} - ${row.name || "NSE"}`;
  el("symbolPrice").textContent = fmtPrice(latestPrice);
  const quoteMeta = state.selectedQuote?.error ? `Quote error: ${state.selectedQuote.error}` : state.selectedQuote?.timestamp ? `Quote ${isoDate(state.selectedQuote.timestamp)}` : row.last_candle_date ? `Candle ${row.last_candle_date}` : "Scan row price";
  el("symbolMeta").textContent = quoteMeta;
  const chips = [
    { label: decisionDisplay(row.decision), className: decisionClass(row.decision) },
    { label: `Score ${fmtNumber(row.score)}`, className: "neutral" },
    { label: `6M ${fmtPct(row.return_6m_pct)}`, className: Number(row.return_6m_pct) >= 0 ? "select" : "blocked" },
    { label: `12M ${fmtPct(row.return_12m_pct)}`, className: Number(row.return_12m_pct) >= 0 ? "select" : "blocked" }
  ];
  if (row.candle_status) chips.push({ label: `Candle ${String(row.candle_status).replaceAll("_", " ")}`, className: row.candle_status === "HIT" ? "select" : "watch" });
  el("signalChips").innerHTML = chips.map((chip) => `<span class="status-pill ${chip.className}">${escapeHtml(chip.label)}</span>`).join("");
  drawChart(row);
  renderFactors(row, ctx);
  renderReason(row, ctx);
  renderAutoOrderReadiness(row);
  renderSignalDashboard();
  renderPiano();
}

function renderAutoOrderReadiness(row = state.selected) {
  const node = el("autoOrderReadiness");
  if (!node) return;
  if (!row) {
    node.innerHTML = `<div class="engine-order-state neutral">
      <span>No selected NSE stock</span>
      <strong>Scanner has not returned a candidate</strong>
    </div>`;
    return;
  }

  const quotePrice = numberValue(state.selectedQuote?.last_price);
  const decisionPrice = numberValue(row.close);
  const targetRoom = numberValue(row.target_potential?.potential_left_pct);
  const targetPct = Math.max(12, Math.min(80, targetRoom !== null && targetRoom >= 8 ? targetRoom : 25));
  const targetPrice = numberValue(row.paper_order?.target_price ?? row.target_price ?? row.advisor?.target2)
    ?? (decisionPrice ? round(decisionPrice * (1 + targetPct / 100), 2) : null);
  const stopPrice = numberValue(row.paper_order?.stop_price ?? row.stop_price ?? row.advisor?.stop)
    ?? (decisionPrice ? round(decisionPrice * 0.90, 2) : null);
  const minimumEntryValue = numberValue(state.orders?.capital_policy?.minimumEntryValue) || 100000;
  const minimumQty = decisionPrice ? Math.max(1, Math.ceil(minimumEntryValue / decisionPrice)) : 1;
  const qty = Math.max(minimumQty, Math.floor(numberValue(row.paper_order?.qty) || minimumQty));
  const tunnel = row.parameter_tunnel?.summary || {};
  const evaluated = numberValue(tunnel.evaluated) || 0;
  const evidenceScore = numberValue(tunnel.evidence_score) || 0;
  const openPosition = (state.orders?.positions || []).find((item) => item.symbol === row.symbol);
  const latestOrder = (state.orders?.orders || []).find((item) => item.symbol === row.symbol);
  const executionReady = row.decision === "SELECT" && evaluated >= 35 && evidenceScore >= 48;
  const status = openPosition
    ? "POSITION OPEN"
    : latestOrder?.status
      ? latestOrder.status
      : executionReady && quotePrice
        ? "AUTO BUY READY"
        : executionReady
          ? "REAL QUOTE REQUIRED"
          : decisionDisplay(row.decision);
  const tone = openPosition || latestOrder?.status === "FILLED" || status === "AUTO BUY READY" ? "good" : executionReady ? "watch" : "neutral";
  const entryText = openPosition
    ? fmtPrice(openPosition.entry_price)
    : quotePrice
      ? fmtPrice(quotePrice)
      : "Upstox quote required";
  const proofText = evaluated ? `${fmtNumber(evidenceScore)} | ${fmtInt(tunnel.positive_hits || 0)}/${fmtInt(evaluated)}` : decisionDisplay(row.decision);

  node.innerHTML = `
    <div class="engine-order-state ${tone}">
      <span>${escapeHtml(row.symbol)} · BUY MARKET · Paper Swing</span>
      <strong>${escapeHtml(status)}</strong>
    </div>
    <div class="engine-order-grid">
      <article><span>Entry</span><strong>${escapeHtml(entryText)}</strong><small>${quotePrice ? escapeHtml(isoDate(state.selectedQuote?.timestamp)) : "Real Upstox quote gate"}</small></article>
      <article><span>Quantity</span><strong>${fmtInt(openPosition?.qty || latestOrder?.qty || qty)}</strong><small>₹1 lakh minimum entry from ₹5 crore paper capital</small></article>
      <article><span>Stop</span><strong>${fmtPrice(openPosition?.stop_price || latestOrder?.stop_price || stopPrice)}</strong><small>Engine risk rule</small></article>
      <article><span>Target</span><strong>${fmtPrice(openPosition?.target_price || latestOrder?.target_price || targetPrice)}</strong><small>${fmtNumber(targetPct)}% target room</small></article>
      <article><span>Parameter proof</span><strong>${escapeHtml(proofText)}</strong><small>Score | hits/evaluated</small></article>
      <article><span>Execution</span><strong>${openPosition ? "BOUGHT" : executionReady ? "AUTOMATIC" : "FILTERED"}</strong><small>Fresh quote and market gates apply</small></article>
    </div>
    <div class="engine-order-actions"><span>Manual paper control</span>${renderTradeActions(row)}</div>`;
}

function factorScore(name, value, max = 10) {
  const v = Math.max(0, Math.min(max, Number(value) || 0));
  return `<div class="factor-row"><span>${escapeHtml(name)}</span><div><i style="width:${(v / max) * 100}%"></i></div><b>${fmtNumber(v, 1)}</b></div>`;
}

function renderFactors(row, ctx) {
  const node = el("factorList");
  if (!node) return;
  if (!row) {
    el("factorTotal").textContent = "0 / 100";
    node.innerHTML = `<div class="empty-state">Run the scanner to calculate factor ranking.</div>`;
    return;
  }
  const m = rowMetrics(row);
  const results = rowParameterResults(row, ctx);
  const tunnelSummary = row.parameter_tunnel?.summary;
  const hitRatio = tunnelSummary?.evaluated
    ? ((tunnelSummary.positive_hits || 0) + (tunnelSummary.risk_clear || 0)) / tunnelSummary.evaluated
    : results.length ? results.filter((item) => item.result.state === "hit").length / results.length : 0;
  const score = numberValue(row.score) || 0;
  const momentum = numberValue(row.momentum_score) || 0;
  const quality = numberValue(row.quality_score) || 0;
  const liquidity = Math.min(100, ((m.avgVol20 || 0) / 1000000) * 60 + ((m.turnoverCr || 0) / 20) * 40);
  const candle = numberValue(row.candle_score) || 0;
  const risk = Math.max(0, 100 - Math.max(0, (m.vol63 || 0) - 15) * 2);
  const target = Math.max(0, Math.min(100, (m.targetLeft || 0) * 4));
  const total = round((score * 0.32) + (momentum * 0.18) + (quality * 0.12) + (liquidity * 0.10) + (candle * 0.10) + (risk * 0.10) + (target * 0.08), 2);
  el("factorTotal").textContent = `${fmtNumber(total)} / 100`;
  node.innerHTML = [
    factorScore("Engine score", score / 10),
    factorScore("Momentum", momentum / 10),
    factorScore("Quality", quality / 10),
    factorScore("Liquidity", liquidity / 10),
    factorScore("Candle structure", candle / 10),
    factorScore("Risk control", risk / 10),
    factorScore("Target room", target / 10),
    factorScore("Parameter coverage", hitRatio * 10)
  ].join("");
}

function renderReason(row, ctx) {
  const node = el("reasonList");
  if (!node) return;
  if (!row) {
    node.innerHTML = `<div class="empty-state">Run scanner, then pick a stock to see parameter proof.</div>`;
    return;
  }
  const m = rowMetrics(row);
  const tunnelHits = (row.parameter_tunnel?.results || []).filter((item) => item.state === "HIT").slice(0, 10);
  const topHits = rowParameterResults(row, ctx).filter((item) => item.result.state === "hit").slice(0, 10);
  const blockers = rowParameterResults(row, ctx).filter((item) => item.result.state === "blocked").slice(0, 8);
  const lines = [
    ["Decision", decisionDisplay(row.decision)],
    ["Reason", row.reason || "No server reason returned"],
    ["Data source", row.data_source || "Upstox scanner"],
    ["Candle evidence", row.candle_evidence || `${m.candles.length} candles returned`],
    ["Parameter tunnel", row.parameter_tunnel?.summary ? `${row.parameter_tunnel.summary.positive_hits} hits / ${row.parameter_tunnel.summary.evaluated} evaluated | score ${fmtNumber(row.parameter_tunnel.summary.evidence_score)}` : "No tunnel evidence returned"],
    ["Paper action", row.paper_order?.status || "Paper ticket uses selected symbol price"],
    ["Latest price", fmtPrice(m.close)]
  ];
  node.innerHTML = lines.map(([k, v]) => `<div class="detail-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join("") +
    `<h4>Passed parameters</h4>` +
    (tunnelHits.length
      ? tunnelHits.map((result) => `<button class="proof-chip hit" type="button" data-param="${escapeHtml(result.id)}">${escapeHtml(result.id)} ${escapeHtml(result.name)} <small>${escapeHtml(result.value ?? "")}</small></button>`).join("")
      : topHits.map(({ param, result }) => `<button class="proof-chip hit" type="button" data-param="${param.id}">P${param.id} ${escapeHtml(param.name)} <small>${escapeHtml(result.value)}</small></button>`).join("")) +
    `<h4>Removing or weak parameters</h4>` +
    (blockers.length ? blockers.map(({ param, result }) => `<button class="proof-chip blocked" type="button" data-param="${param.id}">P${param.id} ${escapeHtml(param.name)} <small>${escapeHtml(result.value)}</small></button>`).join("") : `<div class="empty-state">No hard removing parameter in current evaluated set.</div>`);
  all("[data-param]", node).forEach((button) => button.addEventListener("click", () => openParameter(button.dataset.param)));
}

function renderPiano() {
  const stage = el("pianoStage");
  if (stage) {
    const rows = sortedRows().slice(0, 12);
    const ctx = buildContext(state.rows);
    const total = parameterCatalog.length;
    el("pianoCoverage").textContent = `${total} live keys`;
    const stockStrings = rows.map((row) => {
      const results = rowParameterResults(row, ctx);
      const hit = results.filter((item) => item.result.state === "hit").length;
      const bits = results.slice(0, 32).map((item) => `<span title="P${item.param.id} ${escapeHtml(item.param.name)}: ${escapeHtml(item.result.value)}" class="string-bit ${item.result.state}" data-param="${item.param.id}" data-symbol="${escapeHtml(row.symbol)}"></span>`).join("");
      return `<div class="piano-stock-row">
        <button class="piano-stock" type="button" data-symbol="${escapeHtml(row.symbol)}">
          <strong>${hit}/${total}</strong><span class="piano-string">${bits}</span><b>${escapeHtml(row.symbol)}</b><em>${decisionDisplay(row.decision)}</em>
        </button>
        ${renderTradeActions(row, { compact: true })}
      </div>`;
    }).join("");
    const groups = [...new Set(parameterCatalog.map((param) => param.group))];
    const keys = groups.map((group) => {
      const params = parameterCatalog.filter((param) => param.group === group);
      return `<section class="piano-key-group"><span>${escapeHtml(group)}</span>${params.map((param) => `<button class="param-key ${state.activeParameter?.id === param.id ? "active" : ""}" type="button" data-param="${param.id}">P${param.id}</button>`).join("")}</section>`;
    }).join("");
    stage.innerHTML = `<div class="piano-strings">${stockStrings}</div><div class="piano-keys">${keys}</div>`;
    all(".piano-stock", stage).forEach((button) => button.addEventListener("click", () => selectSymbol(button.dataset.symbol)));
    all("[data-param]", stage).forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      openParameter(Number(button.dataset.param), button.dataset.symbol);
    }));
  }
  renderParameterTunnel();
}

function openParameter(id, symbol = "") {
  const param = state.parameterCatalog.find((item) => String(item.id) === String(id))
    || parameterCatalog.find((item) => String(item.id) === String(id));
  if (!param) return;
  state.activeParameter = param;
  state.activeSection = "piano";
  switchSection("piano");
  renderParameterProof(param, symbol);
  renderPiano();
}

function renderParameterProof(param, focusSymbol = "") {
  if (state.parameterCatalog.some((item) => String(item.id) === String(param.id))) {
    renderTunnelInspector(param, focusSymbol);
    return;
  }
  el("parameterTitle").textContent = `P${param.id} - ${param.name}`;
  const node = el("parameterProof");
  const ctx = buildContext(state.rows);
  const rows = sortedRows().map((row) => ({ row, result: evaluateParameter(param, row, ctx) }));
  const hits = rows.filter((item) => item.result.state === "hit");
  const removed = rows.filter((item) => item.result.state === "blocked");
  const weak = rows.filter((item) => item.result.state === "weak");
  const missingRows = rows.filter((item) => item.result.state === "missing");
  const focus = focusSymbol ? rows.find((item) => item.row.symbol === focusSymbol) : state.selected ? rows.find((item) => item.row.symbol === state.selected.symbol) : null;
  const tableRows = rows.slice(0, 80).map(({ row, result }) => `<tr>
    <td><button class="link-button" type="button" data-symbol="${escapeHtml(row.symbol)}">${escapeHtml(row.symbol)}</button></td>
    <td><span class="status-pill ${result.state}">${escapeHtml(result.state.toUpperCase())}</span></td>
    <td>${escapeHtml(result.value)}</td>
    <td>${escapeHtml(decisionDisplay(row.decision))}</td>
    <td>${escapeHtml(row.reason || "")}</td>
    <td>${renderTradeActions(row, { compact: true })}</td>
  </tr>`).join("");
  node.innerHTML = `<div class="proof-summary">
      <article><span class="mini-label">Requirement</span><strong>${escapeHtml(param.why)}</strong></article>
      <article><span class="mini-label">Hit</span><strong>${hits.length}</strong></article>
      <article><span class="mini-label">Removed</span><strong>${removed.length}</strong></article>
      <article><span class="mini-label">Weak</span><strong>${weak.length}</strong></article>
      <article><span class="mini-label">Feed missing</span><strong>${missingRows.length}</strong></article>
    </div>
    ${focus ? `<div class="focus-proof"><strong>${escapeHtml(focus.row.symbol)}</strong><span class="status-pill ${focus.result.state}">${escapeHtml(focus.result.state.toUpperCase())}</span><p>${escapeHtml(focus.result.value)}</p></div>` : ""}
    <div class="table-wrap proof-table">
      <table>
        <thead><tr><th>Symbol</th><th>Effect</th><th>Computed value</th><th>Decision</th><th>Reason</th><th>Action</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
  all("[data-symbol]", node).forEach((button) => button.addEventListener("click", () => selectSymbol(button.dataset.symbol)));
}

function tunnelRows() {
  return sortedRows().filter((row) => row.parameter_tunnel?.results?.length);
}

function selectedTunnelRows() {
  const rows = tunnelRows();
  const available = new Set(rows.map((row) => row.symbol));
  state.tunnelSelectedSymbols = state.tunnelSelectedSymbols.filter((symbol) => available.has(symbol));
  if (!state.tunnelSelectedSymbols.length) {
    const initial = state.selected?.symbol && available.has(state.selected.symbol)
      ? state.selected.symbol
      : rows[0]?.symbol;
    if (initial) state.tunnelSelectedSymbols = [initial];
  }
  const selected = new Set(state.tunnelSelectedSymbols);
  return rows.filter((row) => selected.has(row.symbol));
}

function parameterResultFor(row, parameterId) {
  return row.parameter_tunnel?.results?.find((result) => String(result.id) === String(parameterId)) || null;
}

function tunnelAggregate(parameter, rows) {
  const results = rows.map((row) => ({ row, result: parameterResultFor(row, parameter.id) })).filter((item) => item.result);
  const counts = { HIT: 0, CLEAR: 0, MISS: 0, RISK: 0, SOURCE_REQUIRED: 0 };
  results.forEach(({ result }) => { counts[result.state] = (counts[result.state] || 0) + 1; });
  const evaluated = results.length - counts.SOURCE_REQUIRED;
  const supportive = counts.HIT + counts.CLEAR;
  let stateName = "SOURCE_REQUIRED";
  if (counts.RISK) stateName = "RISK";
  else if (counts.HIT || counts.CLEAR) stateName = "HIT";
  else if (counts.MISS) stateName = "MISS";
  return {
    results,
    counts,
    evaluated,
    supportive,
    hitRate: evaluated ? supportive / evaluated : 0,
    state: stateName
  };
}

function tunnelStateClass(value) {
  return {
    HIT: "hit",
    CLEAR: "clear",
    MISS: "miss",
    RISK: "risk",
    SOURCE_REQUIRED: "source"
  }[value] || "source";
}

function renderParameterTunnel() {
  const svg = el("parameterTunnelSvg");
  const stockList = el("tunnelStockList");
  const segments = el("tunnelSegments");
  if (!svg || !stockList || !segments) return;

  const catalog = state.parameterCatalog;
  const rows = tunnelRows();
  const selectedRows = selectedTunnelRows();
  const selectedSymbols = new Set(state.tunnelSelectedSymbols);
  const stockQuery = state.tunnelStockQuery.toUpperCase();
  const visibleStocks = rows.filter((row) => !stockQuery || `${row.symbol} ${row.name || ""}`.toUpperCase().includes(stockQuery)).slice(0, 60);
  const nodeQuery = state.tunnelParameterQuery.toLowerCase();
  const visibleParameters = catalog.filter((parameter) => {
    if (state.tunnelStage !== "ALL" && parameter.stage !== state.tunnelStage) return false;
    if (!nodeQuery) return true;
    return `${parameter.id} ${parameter.name} ${parameter.family} ${parameter.formula} ${parameter.source}`.toLowerCase().includes(nodeQuery);
  });

  el("tunnelCatalogCount").textContent = `${catalog.length || 0} nodes`;
  const evaluatedCounts = selectedRows.map((row) => row.parameter_tunnel?.summary?.evaluated || 0);
  const hitCounts = selectedRows.map((row) => row.parameter_tunnel?.summary?.positive_hits || 0);
  el("tunnelVisibleCount").textContent = selectedRows.length
    ? `${selectedRows.length} stock${selectedRows.length === 1 ? "" : "s"} | avg ${fmtNumber(average(evaluatedCounts), 0)} evaluated | avg ${fmtNumber(average(hitCounts), 0)} hits`
    : "Run the Upstox scan to calculate stock evidence";

  segments.innerHTML = [
    `<button type="button" class="${state.tunnelStage === "ALL" ? "active" : ""}" data-tunnel-stage="ALL">All 175</button>`,
    ...state.parameterStages.map((stage) => `<button type="button" class="${state.tunnelStage === stage.id ? "active" : ""}" data-tunnel-stage="${escapeHtml(stage.id)}"><i style="background:${escapeHtml(stage.color)}"></i>${escapeHtml(stage.label)}</button>`)
  ].join("");
  all("[data-tunnel-stage]", segments).forEach((button) => button.addEventListener("click", () => {
    state.tunnelStage = button.dataset.tunnelStage;
    renderParameterTunnel();
  }));

  stockList.innerHTML = visibleStocks.length ? visibleStocks.map((row) => {
    const summary = row.parameter_tunnel.summary || {};
    const checked = selectedSymbols.has(row.symbol);
    return `<div class="tunnel-stock-row ${checked ? "active" : ""}">
      <button class="tunnel-stock-select" type="button" data-tunnel-symbol="${escapeHtml(row.symbol)}">
        <span class="tunnel-stock-check"><i data-lucide="${checked ? "check" : "plus"}"></i></span>
        <span><strong>${escapeHtml(row.symbol)}</strong><small>${escapeHtml(row.name || "NSE equity")}</small></span>
        <span class="tunnel-stock-score"><b>${fmtNumber(summary.evidence_score || 0, 1)}</b><small>${summary.positive_hits || 0}/${summary.evaluated || 0}</small></span>
      </button>
      ${renderTradeActions(row, { compact: true })}
    </div>`;
  }).join("") : `<div class="tunnel-empty">No real scan row matches this stock search.</div>`;
  all("[data-tunnel-symbol]", stockList).forEach((button) => button.addEventListener("click", () => {
    const symbol = button.dataset.tunnelSymbol;
    const selected = new Set(state.tunnelSelectedSymbols);
    if (selected.has(symbol) && selected.size > 1) selected.delete(symbol);
    else selected.add(symbol);
    state.tunnelSelectedSymbols = [...selected];
    renderParameterTunnel();
  }));

  if (!catalog.length) {
    svg.innerHTML = `<text x="710" y="330" text-anchor="middle" class="tunnel-empty-svg">Parameter catalog was not returned by the server.</text>`;
    el("tunnelStageFooter").textContent = "Server catalog unavailable";
    return;
  }
  if (!rows.length) {
    svg.innerHTML = `<text x="710" y="330" text-anchor="middle" class="tunnel-empty-svg">Run the real Upstox scan to illuminate the 175 nodes.</text>`;
    el("tunnelStageFooter").textContent = "No scan evidence returned";
    return;
  }

  const activeStages = state.parameterStages.filter((stage) => visibleParameters.some((parameter) => parameter.stage === stage.id));
  const stageCount = Math.max(1, activeStages.length);
  const stageWidth = stageCount === 1 ? 0 : 1240 / (stageCount - 1);
  const axis = `<path class="tunnel-axis" d="M70 330 C380 195 1040 195 1350 330 C1040 465 380 465 70 330Z"></path>`;
  const rings = activeStages.map((stage, stageIndex) => {
    const x = stageCount === 1 ? 710 : 90 + stageIndex * stageWidth;
    const distance = Math.abs(stageIndex - (stageCount - 1) / 2) / Math.max(1, (stageCount - 1) / 2);
    const rx = 22 + distance * 28;
    const ry = 205 + distance * 68;
    const parameters = visibleParameters.filter((parameter) => parameter.stage === stage.id);
    const nodes = parameters.map((parameter, index) => {
      const y = parameters.length === 1 ? 330 : 108 + index * (444 / Math.max(1, parameters.length - 1));
      const aggregate = tunnelAggregate(parameter, selectedRows);
      const nodeClass = tunnelStateClass(aggregate.state);
      const active = String(state.activeParameter?.id || "") === String(parameter.id) ? " active" : "";
      const radius = 4.5 + Math.min(5, aggregate.hitRate * 5);
      const title = `${parameter.id} ${parameter.name} | ${aggregate.counts.HIT} hit, ${aggregate.counts.RISK} risk, ${aggregate.counts.MISS} miss`;
      return `<g class="tunnel-node-group" data-tunnel-node="${escapeHtml(parameter.id)}">
        <circle class="tunnel-node ${nodeClass}${active}" cx="${x}" cy="${y}" r="${radius}"></circle>
        <title>${escapeHtml(title)}</title>
      </g>`;
    }).join("");
    return `<g class="tunnel-stage-ring">
      <ellipse cx="${x}" cy="330" rx="${rx}" ry="${ry}" style="--stage-color:${escapeHtml(stage.color)}"></ellipse>
      <text x="${x}" y="54" text-anchor="middle">${escapeHtml(stage.label)}</text>
      <text x="${x}" y="82" text-anchor="middle" class="tunnel-stage-count">${parameters.length}</text>
      ${nodes}
    </g>`;
  }).join("");
  svg.innerHTML = `<defs>
      <radialGradient id="tunnelGlow"><stop offset="0%" stop-color="#17d7c1" stop-opacity=".16"></stop><stop offset="100%" stop-color="#17d7c1" stop-opacity="0"></stop></radialGradient>
    </defs>
    <ellipse cx="710" cy="330" rx="560" ry="265" fill="url(#tunnelGlow)"></ellipse>
    ${axis}${rings}`;
  all("[data-tunnel-node]", svg).forEach((node) => node.addEventListener("click", () => openParameter(node.dataset.tunnelNode)));
  el("tunnelStageFooter").textContent = `${visibleParameters.length} visible nodes across ${activeStages.length} stages | click any node for its formula and stock evidence`;

  const activeCatalogParameter = catalog.find((item) => String(item.id) === String(state.activeParameter?.id));
  const inspectorParameter = activeCatalogParameter || visibleParameters[0] || catalog[0];
  if (inspectorParameter) {
    state.activeParameter = inspectorParameter;
    renderTunnelInspector(inspectorParameter);
  }
  window.lucide?.createIcons?.();
}

function renderTunnelInspector(param, focusSymbol = "") {
  const node = el("parameterProof");
  if (!node || !param) return;
  const rows = selectedTunnelRows();
  const focusRows = focusSymbol ? tunnelRows().filter((row) => row.symbol === focusSymbol) : rows;
  const proofRows = focusRows.map((row) => ({ row, result: parameterResultFor(row, param.id) })).filter((item) => item.result);
  const aggregate = tunnelAggregate(param, focusRows);
  el("parameterTitle").textContent = param.name;
  el("tunnelNodeId").textContent = `${param.id} | ${param.family}`;
  node.innerHTML = `<div class="tunnel-node-status ${tunnelStateClass(aggregate.state)}">
      <strong>${aggregate.counts.HIT + aggregate.counts.CLEAR}/${aggregate.evaluated || 0}</strong>
      <span>supportive real evaluations</span>
    </div>
    <dl class="tunnel-definition">
      <div><dt>Formula</dt><dd>${escapeHtml(param.formula)}</dd></div>
      <div><dt>Threshold</dt><dd>${escapeHtml(param.threshold)}</dd></div>
      <div><dt>Required data</dt><dd>${escapeHtml(param.required)}</dd></div>
      <div><dt>Lookback</dt><dd>${escapeHtml(param.lookback)}</dd></div>
      <div><dt>Source</dt><dd>${escapeHtml(param.source)}</dd></div>
      <div><dt>Why it matters</dt><dd>${escapeHtml(param.reason)}</dd></div>
      <div><dt>Worked example</dt><dd>${escapeHtml(param.example)}</dd></div>
    </dl>
    <div class="tunnel-proof-list">
      ${proofRows.length ? proofRows.map(({ row, result }) => `<article class="${tunnelStateClass(result.state)}">
        <header><button type="button" data-symbol="${escapeHtml(row.symbol)}">${escapeHtml(row.symbol)}</button><span>${escapeHtml(result.state.replaceAll("_", " "))}</span></header>
        <strong>${escapeHtml(result.value ?? "Not counted")}</strong>
        <p>${escapeHtml(result.evidence)}</p>
        <small>${escapeHtml(result.effect)}</small>${renderTradeActions(row, { compact: true })}
      </article>`).join("") : `<div class="tunnel-empty">This node has no selected stock evidence yet.</div>`}
    </div>`;
  all("[data-symbol]", node).forEach((button) => button.addEventListener("click", () => selectSymbol(button.dataset.symbol)));
}

function renderScreener() {
  const body = el("screenerBody");
  if (!body) return;
  const rows = visibleRows();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8">No stock rows matched the current filter.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((row) => `<tr>
    <td><button class="link-button" type="button" data-symbol="${escapeHtml(row.symbol)}">${escapeHtml(row.symbol)}</button><small>${escapeHtml(row.name || "")}</small></td>
    <td><span class="status-pill ${decisionClass(row.decision)}">${decisionDisplay(row.decision)}</span></td>
    <td>${fmtNumber(row.score)}</td>
    <td>${fmtNumber(row.momentum_score)} / ${fmtNumber(row.quality_score)}</td>
    <td>${fmtPct(row.return_6m_pct)} / ${fmtPct(row.return_12m_pct)}</td>
    <td>${fmtInt(row.adv20)} / ${fmtNumber(row.rupee_turnover_cr)} cr</td>
    <td>${escapeHtml(row.reason || "")}</td>
    <td>${renderTradeActions(row, { compact: true })}</td>
  </tr>`).join("");
  all("[data-symbol]", body).forEach((button) => button.addEventListener("click", () => selectSymbol(button.dataset.symbol)));
}

function renderRuntime() {
  const ready = state.ready || {};
  const bank = ready.data_bank || {};
  const upstox = state.upstoxStatus || ready.upstox || {};
  const runtimeRows = [
    ["Render URL", location.origin],
    ["Storage", ready.storage || "checking"],
    ["Mongo source", ready.source || ready.warning || "Render env pending"],
    ["NSE universe", `${bank.universe_count || 0} rows`],
    ["Instrument keys", `${bank.rows_with_instrument_key || 0} rows`],
    ["Upstox token", upstox.token_visible ? `active via ${upstox.token_source || "server"}` : "token absent"],
    ["Upstox key", upstox.key_visible || upstox.api_key_visible ? "active in server env" : "key absent"]
  ];
  el("runtimeDetails").innerHTML = runtimeRows.map(([k, v]) => `<div class="detail-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join("");
  el("safetyDetails").innerHTML = [
    ["Execution", "Paper orders only"],
    ["Live broker orders", "Hard disabled"],
    ["Price source", "Upstox market quote and historical candles"],
    ["Fallback market data", "Disabled"],
    ["Token display", "Never printed in app"]
  ].map(([k, v]) => `<div class="detail-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join("");
  const storage = ready.storage === "mongodb" ? "MongoDB storage" : `${ready.storage || "Storage check"} - fix Mongo env if this is not mongodb`;
  el("railConnection").textContent = storage;
  renderUpstoxSettings();
}

function renderUpstoxSettings() {
  const node = el("upstoxDetails");
  if (!node) return;
  const status = state.upstoxStatus || state.ready?.upstox || {};
  const callbackUrl = status.callback_url || `${location.origin}/api/upstox/callback`;
  const rows = [
    ["Token source", status.token_visible ? (status.token_source || "server") : "token absent"],
    ["Saved at", status.token_saved_at ? isoDate(status.token_saved_at) : "env token or no stored token"],
    ["Expires at", status.token_expires_at ? isoDate(status.token_expires_at) : "not supplied by token response"],
    ["OAuth configured", status.oauth_configured ? "client key and secret active" : "client key/secret missing"],
    ["Required Upstox Redirect URI", callbackUrl],
    ["Redirect matching", "Must match the Upstox Developer App exactly"],
    ["Client key fingerprint", status.client_id_fingerprint || "client key missing"],
    ["Secret display", status.token_printed === false ? "token never printed" : "token hidden"]
  ];
  node.innerHTML = rows.map(([k, v]) => `<div class="detail-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join("");
}

function portfolioPnlClass(value) {
  return numberValue(value) > 0 ? "pnl-positive" : numberValue(value) < 0 ? "pnl-negative" : "pnl-flat";
}

function buildPortfolioViewModel() {
  if (!state.orders) return null;
  const orders = Array.isArray(state.orders.orders) ? state.orders.orders : [];
  const positions = Array.isArray(state.orders.positions) ? state.orders.positions : [];
  const closedTrades = Array.isArray(state.orders.closed_trades) ? state.orders.closed_trades : [];
  const funds = state.orders.funds || {};
  const policy = state.orders.capital_policy || {};
  const mark = state.orders.mark_to_market || {};
  const startingCapital = numberValue(funds.starting_capital ?? policy.startingCapital) || 0;
  const investedValue = numberValue(funds.invested_value) || 0;
  const buyingPower = numberValue(funds.buying_power) || 0;
  const unrealizedPnl = numberValue(funds.unrealized_pnl) || 0;
  const realizedPnl = numberValue(funds.realized_pnl) || 0;
  const totalPnl = numberValue(funds.total_pnl) || 0;
  const deploymentPct = Math.max(0, Math.min(100, numberValue(funds.deployment_pct) || 0));
  const totalReturnPct = startingCapital ? totalPnl / startingCapital * 100 : 0;
  const percentageOfCapital = (value) => startingCapital ? (numberValue(value) || 0) / startingCapital * 100 : 0;
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const todayRealizedPnl = closedTrades.reduce((sum, trade) => {
    const exitAt = Date.parse(trade.exit_at || "");
    if (!Number.isFinite(exitAt)) return sum;
    const exitKey = new Date(exitAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    return exitKey === todayKey ? sum + (numberValue(trade.realized_pnl) || 0) : sum;
  }, 0);
  const sortedClosedTrades = [...closedTrades].sort((a, b) => Date.parse(b.exit_at || 0) - Date.parse(a.exit_at || 0));
  const sortedOrders = [...orders].sort((a, b) => Date.parse(b.updated_at || b.created_at || 0) - Date.parse(a.updated_at || a.created_at || 0));
  const wins = closedTrades.filter((trade) => (numberValue(trade.realized_pnl) || 0) > 0);
  const losses = closedTrades.filter((trade) => (numberValue(trade.realized_pnl) || 0) < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + (numberValue(trade.realized_pnl) || 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + (numberValue(trade.realized_pnl) || 0), 0));
  const returnValues = closedTrades.map((trade) => numberValue(trade.return_pct)).filter((value) => value !== null);
  const holdingValues = closedTrades.map((trade) => numberValue(trade.holding_days)).filter((value) => value !== null);
  const bestTrade = [...closedTrades].sort((a, b) => (numberValue(b.return_pct) || 0) - (numberValue(a.return_pct) || 0))[0] || null;
  const worstTrade = [...closedTrades].sort((a, b) => (numberValue(a.return_pct) || 0) - (numberValue(b.return_pct) || 0))[0] || null;
  const sectorValues = new Map();
  for (const position of positions) {
    const sector = String(position.sector || "Unmapped");
    const value = numberValue(position.market_value) || (numberValue(position.current_price) || 0) * (numberValue(position.qty) || 0);
    sectorValues.set(sector, (sectorValues.get(sector) || 0) + value);
  }
  const totalSectorValue = [...sectorValues.values()].reduce((sum, value) => sum + value, 0);
  const sectorExposure = [...sectorValues.entries()].sort((a, b) => b[1] - a[1]).map(([sector, value]) => ({
    sector,
    value,
    pct: totalSectorValue ? value / totalSectorValue * 100 : 0
  }));
  const largestPositionValue = positions.reduce((largest, position) => Math.max(largest, numberValue(position.market_value) || 0), 0);
  const portfolioHeatValue = positions.reduce((sum, position) => {
    const entry = numberValue(position.entry_price);
    const stop = numberValue(position.stop_price);
    const qty = numberValue(position.qty) || 0;
    return sum + (entry !== null && stop !== null ? Math.max(0, entry - stop) * qty : 0);
  }, 0);
  const statusCounts = orders.reduce((counts, order) => {
    const status = String(order.status || "RECORDED").toUpperCase();
    const side = String(order.side || "ORDER").toUpperCase();
    if (status.includes("REJECT")) counts.rejected += 1;
    if (status.includes("FILL") || status.includes("COMPLETE")) counts.filled += 1;
    if (side === "BUY") counts.buy += 1;
    if (side === "SELL") counts.sell += 1;
    return counts;
  }, { rejected: 0, filled: 0, buy: 0, sell: 0 });
  const maximumOpenPositions = numberValue(policy.maximumOpenPositions ?? funds.maximum_open_positions);
  const minimumEntryValue = numberValue(policy.minimumEntryValue ?? funds.minimum_entry_value);
  const cashPct = percentageOfCapital(buyingPower);
  const largestPositionPct = percentageOfCapital(largestPositionValue);
  const portfolioHeatPct = percentageOfCapital(portfolioHeatValue);
  const drawdownPct = Math.min(0, totalReturnPct);
  const capitalBlocked = (minimumEntryValue !== null && buyingPower < minimumEntryValue)
    || (maximumOpenPositions !== null && positions.length >= maximumOpenPositions);
  return {
    orders,
    positions,
    closedTrades,
    sortedClosedTrades,
    sortedOrders,
    funds,
    policy,
    mark,
    startingCapital,
    investedValue,
    buyingPower,
    unrealizedPnl,
    realizedPnl,
    totalPnl,
    deploymentPct,
    totalReturnPct,
    todayRealizedPnl,
    todayRealizedReturnPct: startingCapital ? todayRealizedPnl / startingCapital * 100 : 0,
    maximumOpenPositions,
    minimumEntryValue,
    maximumPositionPct: numberValue(policy.maximumPositionPct),
    cashBufferPct: numberValue(policy.cashBufferPct),
    maximumPortfolioHeatPct: numberValue(policy.maximumPortfolioHeatPct),
    drawdownLimitPct: numberValue(policy.portfolioDrawdownTriggerPct),
    cashPct,
    largestPositionPct,
    portfolioHeatPct,
    drawdownPct,
    capitalBlocked,
    sectorExposure,
    wins,
    losses,
    winRatePct: closedTrades.length ? wins.length / closedTrades.length * 100 : 0,
    averageReturnPct: returnValues.length ? returnValues.reduce((sum, value) => sum + value, 0) / returnValues.length : 0,
    averageHoldingDays: holdingValues.length ? holdingValues.reduce((sum, value) => sum + value, 0) / holdingValues.length : 0,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    bestTrade,
    worstTrade,
    statusCounts,
    error: state.orders.error || ""
  };
}

function portfolioMetricGrid(items, label) {
  return `<section class="portfolio-metric-grid" aria-label="${escapeHtml(label)}">${items.map((item) => `<article>
    <span class="metric-icon ${escapeHtml(item.iconTone || "")}"><i data-lucide="${escapeHtml(item.icon)}"></i></span>
    <div><small>${escapeHtml(item.label)}</small><strong class="${escapeHtml(item.tone || "")}">${item.value}</strong><em class="${escapeHtml(item.detailTone || "")}">${item.detail}</em></div>
  </article>`).join("")}</section>`;
}

function renderOpenPositionRows(model, limit = null) {
  const rows = limit === null ? model.positions : model.positions.slice(0, limit);
  return rows.map((position) => `<tr>
    <td><strong>${escapeHtml(position.symbol)}</strong><small>${escapeHtml(position.sector || position.status || "OPEN")}</small></td>
    <td>${fmtInt(position.qty)}</td>
    <td>${fmtPrice(position.entry_price)}</td>
    <td>${fmtPrice(position.current_price)}</td>
    <td>${fmtPrice(position.market_value)}</td>
    <td class="${portfolioPnlClass(position.unrealized_pnl)}"><strong>${fmtPrice(position.unrealized_pnl)}</strong></td>
    <td class="${portfolioPnlClass(position.unrealized_pnl_pct)}">${fmtPct(position.unrealized_pnl_pct)}</td>
    <td>${fmtPrice(position.target_price)}</td>
    <td>${fmtPrice(position.stop_price)}</td>
    <td>${renderTradeActions(position, { compact: true })}</td>
  </tr>`).join("");
}

function renderClosedTradeRows(model, limit = null) {
  const rows = limit === null ? model.sortedClosedTrades : model.sortedClosedTrades.slice(0, limit);
  return rows.map((trade) => `<tr>
    <td><strong>${escapeHtml(trade.symbol)}</strong><small>${escapeHtml(trade.close_reason || "Paper SELL")}</small></td>
    <td>${fmtInt(trade.qty)}</td>
    <td>${fmtPrice(trade.entry_price)}</td>
    <td>${fmtPrice(trade.exit_price)}</td>
    <td class="${portfolioPnlClass(trade.realized_pnl)}"><strong>${fmtPrice(trade.realized_pnl)}</strong></td>
    <td class="${portfolioPnlClass(trade.return_pct)}">${fmtPct(trade.return_pct)}</td>
    <td>${numberValue(trade.holding_days) === null ? "NA" : `${fmtNumber(trade.holding_days)} days`}</td>
    <td>${escapeHtml(isoDate(trade.exit_at))}</td>
    <td>${renderTradeActions(trade, { compact: true })}</td>
  </tr>`).join("");
}

function renderOpenPositionsCard(model, { limit = null, action = true, subtitle = "Live mark-to-market, targets and stops" } = {}) {
  const rows = renderOpenPositionRows(model, limit);
  return `<article class="portfolio-card portfolio-open-card">
    <header><div><h4>Open Positions <span>${model.positions.length}</span></h4><p>${escapeHtml(subtitle)}</p></div>${action ? `<button type="button" data-dashboard-book="open">Full ledger <i data-lucide="chevron-right"></i></button>` : ""}</header>
    <div class="portfolio-table-scroll"><table><thead><tr><th>Symbol</th><th>Qty</th><th>Entry</th><th>LTP</th><th>Value</th><th>P&amp;L</th><th>Return</th><th>Target</th><th>Stop</th><th>Action</th></tr></thead><tbody>${rows || `<tr><td colspan="10" class="empty-state">No open paper positions.</td></tr>`}</tbody></table></div>
  </article>`;
}

function renderClosedTradesCard(model, { limit = null, action = true, subtitle = "Sold stocks and realized returns" } = {}) {
  const rows = renderClosedTradeRows(model, limit);
  return `<article class="portfolio-card portfolio-closed-card">
    <header><div><h4>Closed Trades <span>${model.closedTrades.length}</span></h4><p>${escapeHtml(subtitle)}</p></div>${action ? `<button type="button" data-dashboard-book="closed">Full ledger <i data-lucide="chevron-right"></i></button>` : ""}</header>
    <div class="portfolio-table-scroll"><table><thead><tr><th>Symbol</th><th>Qty</th><th>Entry</th><th>Exit</th><th>Net P&amp;L</th><th>Return</th><th>Held</th><th>Exit time</th><th>Action</th></tr></thead><tbody>${rows || `<tr><td colspan="9" class="empty-state">No closed paper trades yet.</td></tr>`}</tbody></table></div>
  </article>`;
}

function renderRiskGovernorCard(model) {
  const governorLabel = model.capitalBlocked ? "ENTRY BLOCKED" : model.deploymentPct >= 95 ? "FULLY DEPLOYED" : model.deploymentPct >= 70 ? "WATCH" : "AVAILABLE";
  const governorTone = model.capitalBlocked ? "blocked" : model.deploymentPct >= 70 ? "watch" : "good";
  const riskCheck = (actual, limit, comparison = "max") => comparison === "min" ? actual >= limit : actual <= limit;
  const riskRow = (label, value, passed) => `<div class="governor-rule"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><i data-lucide="${passed ? "circle-check" : "triangle-alert"}" class="${passed ? "rule-pass" : "rule-warn"}" aria-hidden="true"></i></div>`;
  const sectorRows = model.sectorExposure.slice(0, 8).map((item) => `<div class="risk-exposure-row"><span>${escapeHtml(item.sector)}</span><i><b style="width:${Math.min(100, item.pct).toFixed(2)}%"></b></i><strong>${fmtNumber(item.pct, 1)}%</strong></div>`).join("");
  return `<aside class="portfolio-card portfolio-risk-card">
    <header><div><h4>Risk &amp; Capital Governor</h4><p>Current holdings exposure, not trade performance</p></div><span class="governor-state ${governorTone}">${governorLabel}</span></header>
    <div class="deployment-block">
      <div class="deployment-donut" style="--deployment:${model.deploymentPct.toFixed(2)}%"><span><strong>${fmtNumber(model.deploymentPct, 1)}%</strong>deployed</span></div>
      <dl><div><dt>Invested</dt><dd>${fmtPrice(model.investedValue)}</dd></div><div><dt>Cash</dt><dd>${fmtPrice(model.buyingPower)}</dd></div></dl>
    </div>
    <section class="sector-exposure"><h5>Sector exposure</h5>${sectorRows || `<p class="empty-state compact">Exposure appears when positions are open.</p>`}</section>
    <section class="governor-rules">
      ${riskRow("Largest position", `${fmtNumber(model.largestPositionPct, 2)}% / ${fmtNumber(model.maximumPositionPct, 2)}%`, model.maximumPositionPct !== null && riskCheck(model.largestPositionPct, model.maximumPositionPct))}
      ${riskRow("Open position slots", `${model.positions.length} / ${fmtInt(model.maximumOpenPositions)}`, model.maximumOpenPositions !== null && model.positions.length < model.maximumOpenPositions)}
      ${riskRow("Minimum new entry", `${fmtPrice(model.minimumEntryValue)} · cash ${fmtPrice(model.buyingPower)}`, model.minimumEntryValue !== null && model.buyingPower >= model.minimumEntryValue)}
      ${riskRow("Cash reserve", `${fmtNumber(model.cashPct, 2)}% / ${fmtNumber(model.cashBufferPct, 2)}%`, model.cashBufferPct !== null && riskCheck(model.cashPct, model.cashBufferPct, "min"))}
      ${riskRow("Portfolio heat", `${fmtNumber(model.portfolioHeatPct, 2)}% / ${fmtNumber(model.maximumPortfolioHeatPct, 2)}%`, model.maximumPortfolioHeatPct !== null && riskCheck(model.portfolioHeatPct, model.maximumPortfolioHeatPct))}
      ${riskRow("Drawdown governor", `${fmtNumber(model.drawdownPct, 2)}% / ${fmtNumber(model.drawdownLimitPct, 2)}%`, model.drawdownLimitPct !== null && model.drawdownPct > model.drawdownLimitPct)}
    </section>
  </aside>`;
}

function renderRecentActivityCard(model, limit = 7, action = true) {
  const rows = (limit === null ? model.sortedOrders : model.sortedOrders.slice(0, limit)).map((order) => {
    const side = String(order.side || "ORDER").toUpperCase();
    const rejected = String(order.status || "").toUpperCase().includes("REJECT");
    const tone = rejected ? "rejected" : side === "BUY" ? "buy" : "sell";
    const initial = rejected ? "!" : side.slice(0, 1);
    return `<li><span class="activity-mark ${tone}">${escapeHtml(initial)}</span><span><strong>${escapeHtml(side)} ${escapeHtml(order.symbol)}</strong><small>${fmtInt(order.qty)} @ ${fmtPrice(order.price ?? order.fill_price)} · ${escapeHtml(order.status || "RECORDED")}</small></span><time>${escapeHtml(isoDate(order.updated_at || order.created_at || order.quote_timestamp))}</time>${renderTradeActions(order, { compact: true })}</li>`;
  }).join("");
  return `<article class="portfolio-card portfolio-activity-card">
    <header><div><h4>Recent Activity <span>${model.orders.length}</span></h4><p>Paper order events; this is not the holdings ledger</p></div>${action ? `<button type="button" data-dashboard-book="orders">Full history <i data-lucide="chevron-right"></i></button>` : ""}</header>
    <ul class="activity-list">${rows || `<li class="empty-state">No paper order activity yet.</li>`}</ul>
  </article>`;
}

function renderHoldingsDashboard(model) {
  const metrics = portfolioMetricGrid([
    { icon: "wallet-cards", label: "Starting capital", value: fmtPrice(model.startingCapital), detail: "Approved paper capital" },
    { icon: "pie-chart", label: "Invested holdings", value: fmtPrice(model.investedValue), detail: `${fmtNumber(model.deploymentPct)}% deployed` },
    { icon: "indian-rupee", iconTone: "success", label: "Buying power", value: fmtPrice(model.buyingPower), detail: `${fmtNumber(model.cashPct)}% cash` },
    { icon: "activity", label: "Open holdings", value: fmtInt(model.positions.length), detail: `${fmtInt(model.maximumOpenPositions)} maximum positions` },
    { icon: "trending-up", label: "Unrealized P&L", value: fmtPrice(model.unrealizedPnl), detail: "Live mark-to-market only", tone: portfolioPnlClass(model.unrealizedPnl), detailTone: portfolioPnlClass(model.unrealizedPnl) }
  ], "Current holdings summary");
  return `${metrics}<section class="portfolio-dashboard-grid">${renderOpenPositionsCard(model, { limit: null, action: false })}${renderRiskGovernorCard(model)}</section>`;
}

function renderPerformanceDashboard(model) {
  const profitFactor = Number.isFinite(model.profitFactor) ? fmtNumber(model.profitFactor, 2) : "∞";
  const metrics = portfolioMetricGrid([
    { icon: "trending-up", label: "Total P&L", value: fmtPrice(model.totalPnl), detail: fmtPct(model.totalReturnPct), tone: portfolioPnlClass(model.totalPnl), detailTone: portfolioPnlClass(model.totalReturnPct) },
    { icon: "badge-indian-rupee", label: "Realized P&L", value: fmtPrice(model.realizedPnl), detail: `${model.closedTrades.length} closed trades`, tone: portfolioPnlClass(model.realizedPnl) },
    { icon: "line-chart", label: "Unrealized P&L", value: fmtPrice(model.unrealizedPnl), detail: `${model.positions.length} still open`, tone: portfolioPnlClass(model.unrealizedPnl) },
    { icon: "calendar-days", label: "Today realized", value: fmtPrice(model.todayRealizedPnl), detail: fmtPct(model.todayRealizedReturnPct), tone: portfolioPnlClass(model.todayRealizedPnl) },
    { icon: "trophy", label: "Win rate", value: fmtPct(model.winRatePct), detail: `${model.wins.length} wins / ${model.losses.length} losses` }
  ], "Paper performance summary");
  const stats = `<section class="performance-stat-grid" aria-label="Closed trade statistics">
    <article><small>Average return</small><strong class="${portfolioPnlClass(model.averageReturnPct)}">${fmtPct(model.averageReturnPct)}</strong><em>Mean of closed-trade returns</em></article>
    <article><small>Profit factor</small><strong>${profitFactor}</strong><em>Gross profit / gross loss</em></article>
    <article><small>Average holding</small><strong>${fmtNumber(model.averageHoldingDays, 1)} days</strong><em>Closed positions only</em></article>
    <article><small>Best trade</small><strong class="${portfolioPnlClass(model.bestTrade?.return_pct)}">${escapeHtml(model.bestTrade?.symbol || "NA")} ${model.bestTrade ? fmtPct(model.bestTrade.return_pct) : ""}</strong><em>Highest realized return</em></article>
    <article><small>Worst trade</small><strong class="${portfolioPnlClass(model.worstTrade?.return_pct)}">${escapeHtml(model.worstTrade?.symbol || "NA")} ${model.worstTrade ? fmtPct(model.worstTrade.return_pct) : ""}</strong><em>Lowest realized return</em></article>
    <article><small>Gross profit</small><strong class="pnl-positive">${fmtPrice(model.grossProfit)}</strong><em>Winning trades</em></article>
    <article><small>Gross loss</small><strong class="pnl-negative">${fmtPrice(model.grossLoss)}</strong><em>Absolute losing amount</em></article>
    <article><small>Closed trades</small><strong>${fmtInt(model.closedTrades.length)}</strong><em>Downloadable ledger below</em></article>
  </section>`;
  return `${metrics}${stats}<section class="portfolio-dashboard-grid">${renderClosedTradesCard(model, { limit: null, action: false, subtitle: "Every sold stock, exit reason and realized result" })}</section>`;
}

function renderPaperBookDashboard(model) {
  if (state.orderWorkspaceView === "positions") {
    return `${portfolioMetricGrid([
      { icon: "briefcase-business", label: "Open positions", value: fmtInt(model.positions.length), detail: `${fmtInt(model.maximumOpenPositions)} maximum` },
      { icon: "pie-chart", label: "Invested", value: fmtPrice(model.investedValue), detail: `${fmtNumber(model.deploymentPct)}% deployed` },
      { icon: "trending-up", label: "Unrealized P&L", value: fmtPrice(model.unrealizedPnl), detail: "Live marks", tone: portfolioPnlClass(model.unrealizedPnl) },
      { icon: "indian-rupee", label: "Buying power", value: fmtPrice(model.buyingPower), detail: `${fmtNumber(model.cashPct)}% cash` },
      { icon: "shield-check", label: "Entry state", value: model.capitalBlocked ? "BLOCKED" : "AVAILABLE", detail: "Paper capital governor" }
    ], "Open position ledger summary")}<section class="portfolio-dashboard-grid">${renderOpenPositionsCard(model, { limit: null, action: false, subtitle: "Every current position with BUY/SELL controls" })}${renderRiskGovernorCard(model)}</section>`;
  }
  if (state.orderWorkspaceView === "closed") return renderPerformanceDashboard(model);
  if (state.orderWorkspaceView === "orders") {
    return `${portfolioMetricGrid([
      { icon: "receipt-text", label: "Recorded orders", value: fmtInt(model.orders.length), detail: "Complete paper lifecycle" },
      { icon: "circle-check", label: "Filled", value: fmtInt(model.statusCounts.filled), detail: "Completed fills" },
      { icon: "triangle-alert", label: "Rejected", value: fmtInt(model.statusCounts.rejected), detail: "Governor or quote rejects" },
      { icon: "shopping-cart", label: "BUY events", value: fmtInt(model.statusCounts.buy), detail: "Paper buys and adds" },
      { icon: "log-out", label: "SELL events", value: fmtInt(model.statusCounts.sell), detail: "Partial and full exits" }
    ], "Paper order history summary")}<section class="portfolio-dashboard-grid">${renderRecentActivityCard(model, null, false)}</section>`;
  }
  const metrics = portfolioMetricGrid([
    { icon: "wallet-cards", label: "Starting capital", value: fmtPrice(model.startingCapital), detail: "Approved paper capital" },
    { icon: "pie-chart", label: "Invested", value: fmtPrice(model.investedValue), detail: `${fmtNumber(model.deploymentPct)}% deployed` },
    { icon: "indian-rupee", iconTone: "success", label: "Buying power", value: fmtPrice(model.buyingPower), detail: `${fmtNumber(model.cashPct)}% of capital` },
    { icon: "trending-up", label: "Total P&L", value: fmtPrice(model.totalPnl), detail: fmtPct(model.totalReturnPct), tone: portfolioPnlClass(model.totalPnl), detailTone: portfolioPnlClass(model.totalReturnPct) },
    { icon: "badge-indian-rupee", label: "Today realized", value: fmtPrice(model.todayRealizedPnl), detail: `Total ${fmtPrice(model.realizedPnl)}`, tone: portfolioPnlClass(model.todayRealizedPnl) }
  ], "Paper Book overview");
  return `${metrics}<section class="portfolio-dashboard-grid">${renderOpenPositionsCard(model, { limit: 8 })}${renderRiskGovernorCard(model)}${renderClosedTradesCard(model, { limit: 5 })}${renderRecentActivityCard(model, 7)}</section>`;
}

function bindDashboardBookActions(root) {
  all("[data-dashboard-book]", root).forEach((button) => button.addEventListener("click", () => {
    const tab = button.dataset.dashboardBook;
    const navByTab = {
      open: ["positions", "Positions", "positions"],
      closed: ["closed-trades", "Closed Trades", "closed"],
      orders: ["order-history", "Orders", "orders"]
    };
    const [navKey, title, workspaceView] = navByTab[tab] || ["orders", "Paper Book", "book"];
    state.orderWorkspaceView = workspaceView;
    switchSection("orders", navKey, title);
    openPaperLedgerTab(tab, { scroll: true });
    renderPortfolioDashboard();
  }));
}

function renderPortfolioDashboard() {
  const portfolioNode = el("portfolioDashboard");
  const paperBookNode = el("paperTradeDashboard");
  if (!portfolioNode && !paperBookNode) return;
  const model = buildPortfolioViewModel();
  if (!model) {
    const loading = `<section class="portfolio-loading panel"><strong>Loading paper portfolio</strong><span>Reading positions, closed trades and capital controls.</span></section>`;
    if (portfolioNode) portfolioNode.innerHTML = loading;
    if (paperBookNode) paperBookNode.innerHTML = loading;
    return;
  }
  const stampText = model.mark.quote_error
    ? `Portfolio loaded. Live marks unavailable: ${model.mark.quote_error}`
    : model.mark.as_of
      ? `Live mark-to-market from Upstox at ${isoDate(model.mark.as_of)}.`
      : "Portfolio loaded from the durable paper ledger; no live mark timestamp is available.";
  if (el("portfolioDashboardStamp")) el("portfolioDashboardStamp").textContent = stampText;
  if (el("paperTradeDashboardStamp")) el("paperTradeDashboardStamp").textContent = stampText;
  const portfolioIsPerformance = state.portfolioView === "performance";
  if (el("portfolioViewLabel")) el("portfolioViewLabel").textContent = portfolioIsPerformance ? "Paper Performance" : "Paper Holdings";
  if (el("portfolioViewTitle")) el("portfolioViewTitle").textContent = portfolioIsPerformance ? "Realized results and trade quality" : "Open positions and allocation";
  const paperHeadings = {
    positions: ["Paper Positions", "Open position ledger"],
    closed: ["Paper Exits", "Closed Trades"],
    orders: ["Paper Lifecycle", "Order History"],
    book: ["Paper Execution", "Paper Trade Dashboard"]
  };
  const [paperLabel, paperTitle] = paperHeadings[state.orderWorkspaceView] || paperHeadings.book;
  if (el("paperTradeViewLabel")) el("paperTradeViewLabel").textContent = paperLabel;
  if (el("paperTradeViewTitle")) el("paperTradeViewTitle").textContent = paperTitle;
  const error = model.error ? `<p class="portfolio-error">${escapeHtml(model.error)}</p>` : "";
  if (portfolioNode) {
    portfolioNode.innerHTML = error + (portfolioIsPerformance ? renderPerformanceDashboard(model) : renderHoldingsDashboard(model));
    bindDashboardBookActions(portfolioNode);
  }
  if (paperBookNode) {
    paperBookNode.innerHTML = error + renderPaperBookDashboard(model);
    bindDashboardBookActions(paperBookNode);
  }
  window.lucide?.createIcons?.();
}

async function refreshUpstoxStatus() {
  try {
    const payload = await api("/api/upstox/status");
    state.upstoxStatus = payload.status || null;
  } catch (error) {
    state.upstoxStatus = { token_visible: false, error: error.message, callback_url: `${location.origin}/api/upstox/callback`, token_printed: false };
  }
  renderUpstoxSettings();
}

async function loadOrders() {
  try {
    state.orders = await api("/api/paper-trader/orders");
  } catch (error) {
    state.orders = { ok: false, error: error.message, orders: [], positions: [], trades: [] };
  }
  renderAll();
}

function renderOrders() {
  const targets = [el("paperBook"), el("ordersLedger")].filter(Boolean);
  const orders = state.orders?.orders || [];
  const positions = state.orders?.positions || [];
  const closedTrades = state.orders?.closed_trades || [];
  const funds = state.orders?.funds || {};
  const capitalPolicy = state.orders?.capital_policy || {};
  const pnlClass = (value) => numberValue(value) > 0 ? "pnl-positive" : numberValue(value) < 0 ? "pnl-negative" : "pnl-flat";
  const mark = state.orders?.mark_to_market || {};
  const quoteNote = mark.quote_error
    ? `<p class="mark-warning">Upstox mark-to-market error: ${escapeHtml(mark.quote_error)}. Last persisted real quote remains visible.</p>`
    : mark.as_of
      ? `<p class="mark-time">Marked from Upstox quotes at ${escapeHtml(isoDate(mark.as_of))}</p>`
      : "";
  const positionRows = positions.map((position) => `<tr>
      <td><strong>${escapeHtml(position.symbol)}</strong><small>${escapeHtml(position.status || "OPEN")}</small></td>
      <td>${fmtInt(position.qty)}</td>
      <td>${fmtPrice(position.entry_price)}</td>
      <td>${fmtPrice(position.current_price)}</td>
      <td>${fmtPrice(position.market_value)}</td>
      <td class="${pnlClass(position.unrealized_pnl)}"><strong>${fmtPrice(position.unrealized_pnl)}</strong></td>
      <td class="${pnlClass(position.unrealized_pnl_pct)}">${fmtNumber(position.unrealized_pnl_pct)}%</td>
      <td>${position.parameter_evidence?.evaluated ? `${fmtNumber(position.parameter_evidence.evidence_score)} | ${position.parameter_evidence.positive_hits}/${position.parameter_evidence.evaluated}` : "Manual order"}</td>
      <td>${escapeHtml(isoDate(position.quote_timestamp || position.checked_at || position.entry_date))}</td>
      <td>${renderTradeActions(position, { compact: true })}</td>
    </tr>`).join("");
  const closedRows = closedTrades.map((trade) => `<tr>
      <td><strong>${escapeHtml(trade.symbol)}</strong><small>${escapeHtml(trade.close_reason || "Paper SELL")}</small></td>
      <td>${fmtInt(trade.qty)}</td>
      <td>${fmtPrice(trade.entry_price)}</td>
      <td>${fmtPrice(trade.exit_price)}</td>
      <td>${fmtPrice(trade.entry_value)}</td>
      <td>${fmtPrice(trade.exit_value)}</td>
      <td class="${pnlClass(trade.gross_realized_pnl)}">${fmtPrice(trade.gross_realized_pnl)}</td>
      <td>${fmtPrice(trade.round_trip_cost)}</td>
      <td class="${pnlClass(trade.realized_pnl)}"><strong>${fmtPrice(trade.realized_pnl)}</strong></td>
      <td class="${pnlClass(trade.return_pct)}"><strong>${fmtPct(trade.return_pct)}</strong></td>
      <td>${escapeHtml(isoDate(trade.entry_at))}</td>
      <td>${escapeHtml(isoDate(trade.exit_at))}</td>
      <td>${numberValue(trade.holding_days) === null ? "NA" : `${fmtNumber(trade.holding_days)} days`}</td>
      <td>${renderTradeActions(trade, { compact: true })}</td>
    </tr>`).join("");
  const orderRows = orders.slice(0, 50).map((order) => `<tr>
      <td>${escapeHtml(order.symbol)}</td>
      <td>${escapeHtml(order.side)}</td>
      <td>${fmtInt(order.qty)}</td>
      <td>${fmtPrice(order.price)}</td>
      <td><strong>${escapeHtml(order.status)}</strong>${order.rejection_reason ? `<small>${escapeHtml(order.rejection_reason)}</small>` : ""}</td>
      <td>${escapeHtml(isoDate(order.quote_timestamp || order.updated_at || order.created_at))}</td>
      <td>${renderTradeActions(order, { compact: true })}</td>
    </tr>`).join("");
  const deployment = numberValue(funds.deployment_pct) || 0;
  const affordableAtMinimum = numberValue(
    capitalPolicy.initialAffordableOpenPositionsAfterEntryCost
      ?? funds.initial_affordable_open_positions_after_entry_cost
  );
  const policyText = `${fmtPrice(funds.starting_capital || capitalPolicy.startingCapital)} capital | ${fmtPrice(funds.minimum_entry_value || capitalPolicy.minimumEntryValue)} minimum entry | ${fmtInt(capitalPolicy.maximumCandidateEntries || funds.maximum_candidate_entries || 80)} lifecycle entries | ${fmtInt(capitalPolicy.maximumOpenPositions || funds.maximum_open_positions || 500)} position ceiling | ${fmtInt(affordableAtMinimum || 499)} initially affordable after costs`;
  const html = `<div class="book-summary">
      <article><span>Starting capital</span><strong>${fmtPrice(funds.starting_capital || capitalPolicy.startingCapital)}</strong></article>
      <article><span>Invested</span><strong>${fmtPrice(funds.invested_value || 0)}</strong></article>
      <article><span>Buying power</span><strong>${fmtPrice(funds.buying_power || 0)}</strong></article>
      <article><span>Deployment</span><strong>${fmtNumber(deployment)}%</strong></article>
      <article><span>Open positions</span><strong>${positions.length}</strong></article>
      <article><span>Closed trades</span><strong>${closedTrades.length}</strong></article>
      <article><span>Transaction costs paid</span><strong>${fmtPrice(funds.transaction_costs_paid || 0)}</strong></article>
      <article><span>Unrealized P&L</span><strong class="${pnlClass(funds.unrealized_pnl)}">${fmtPrice(funds.unrealized_pnl || 0)}</strong></article>
      <article><span>Net realized P&L</span><strong class="${pnlClass(funds.realized_pnl)}">${fmtPrice(funds.realized_pnl || 0)}</strong></article>
      <article><span>Net total P&L</span><strong class="${pnlClass(funds.total_pnl)}">${fmtPrice(funds.total_pnl || 0)}</strong></article>
    </div>
    <p class="capital-policy-note">${escapeHtml(policyText)}</p>
    ${quoteNote}
    <div class="ledger-tabs" role="tablist" aria-label="Paper trade lifecycle">
      <button type="button" role="tab" data-paper-ledger-tab="open" aria-selected="${state.paperLedgerTab === "open"}" class="${state.paperLedgerTab === "open" ? "active" : ""}">Open Positions <strong>${positions.length}</strong></button>
      <button type="button" role="tab" data-paper-ledger-tab="closed" aria-selected="${state.paperLedgerTab === "closed"}" class="${state.paperLedgerTab === "closed" ? "active" : ""}">Closed Trades <strong>${closedTrades.length}</strong></button>
      <button type="button" role="tab" data-paper-ledger-tab="orders" aria-selected="${state.paperLedgerTab === "orders"}" class="${state.paperLedgerTab === "orders" ? "active" : ""}">Order History <strong>${orders.length}</strong></button>
    </div>
    <section class="ledger-panel" data-paper-ledger-panel="open" ${state.paperLedgerTab === "open" ? "" : "hidden"}>
      <div class="ledger-panel-head"><h4>Open Positions</h4><span>Live mark-to-market return</span></div>
      <div class="ledger-scroll">
        <table>
          <thead><tr><th>Symbol</th><th>Qty</th><th>Entry</th><th>LTP</th><th>Market value</th><th>Unrealized P&L</th><th>Return</th><th>Parameter proof</th><th>Quote time</th><th>Action</th></tr></thead>
          <tbody>${positionRows || `<tr><td colspan="10">No open paper position.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
    <section class="ledger-panel" data-paper-ledger-panel="closed" ${state.paperLedgerTab === "closed" ? "" : "hidden"}>
      <div class="ledger-panel-head"><h4>Closed Trades</h4><span>Every sold stock with realized return</span></div>
      <div class="ledger-scroll">
        <table>
          <thead><tr><th>Symbol</th><th>Qty</th><th>Entry</th><th>Exit</th><th>Invested</th><th>Exit value</th><th>Gross P&L</th><th>Costs</th><th>Net P&L</th><th>Net return</th><th>Entry time</th><th>Exit time</th><th>Held</th><th>Action</th></tr></thead>
          <tbody>${closedRows || `<tr><td colspan="14">No closed paper trades yet. Sold positions will appear here with their net realized return.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
    <section class="ledger-panel" data-paper-ledger-panel="orders" ${state.paperLedgerTab === "orders" ? "" : "hidden"}>
      <div class="ledger-panel-head"><h4>Order History</h4><span>Filled and rejected lifecycle events</span></div>
      <div class="ledger-scroll">
        <table>
          <thead><tr><th>Symbol</th><th>Side</th><th>Qty</th><th>Fill price</th><th>Status</th><th>Real quote time</th><th>Action</th></tr></thead>
          <tbody>${orderRows || `<tr><td colspan="7">No paper order history.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
    ${state.orders?.error ? `<p class="error-text">${escapeHtml(state.orders.error)}</p>` : ""}`;
  targets.forEach((node) => {
    node.innerHTML = html;
    all("[data-paper-ledger-tab]", node).forEach((button) => button.addEventListener("click", () => {
      state.paperLedgerTab = button.dataset.paperLedgerTab;
      renderOrders();
    }));
  });
}

async function refreshMarketStrip() {
  try {
    const payload = await api(`/api/upstox/quote?instrument_key=${encodeURIComponent(indexKeys.map((item) => item.key).join(","))}`);
    renderMarketStrip("ready", payload.quotes || []);
  } catch (error) {
    state.lastError = error.message;
    renderMarketStrip("error");
  }
}

async function refreshScan() {
  setNotice("Reading Render runtime, Mongo state, and Upstox candles", "info");
  try {
    state.ready = await api("/api/ready");
    await refreshUpstoxStatus();
    await loadUniverseForFreshScan();
    renderRuntime();
    renderBasketMeta();
  } catch (error) {
    state.lastError = error.message;
    setNotice(`Runtime check failed: ${error.message}`, "error");
    renderMarketStrip("error");
    return;
  }
  await refreshMarketStrip();
  try {
    const scan = await api("/api/scanner/run-upstox", { method: "POST", body: { horizon: state.horizon, universe: state.scanBasket } });
    state.scan = scan;
    state.rows = Array.isArray(scan.rows) ? scan.rows : [];
    if (scan.institutional?.market) state.institutional.market = scan.institutional.market;
    for (const stock of scan.institutional?.stocks || []) {
      const symbol = nseSymbol(stock);
      if (symbol) state.institutional.stocks[symbol] = stock;
    }
    if (scan.institutional) {
      state.institutional.status = scan.institutional.ok ? "ready" : "data_needed";
      state.institutional.asOf = scan.institutional.as_of || null;
      state.institutional.version = scan.institutional.version || null;
    }
    const summary = scan.summary || {};
    const failures = Array.isArray(scan.failures) ? scan.failures.length : 0;
    setNotice(`Fresh NSE scan ${state.rows.length}/${state.universeRows.length || state.rows.length} rows | SELECT ${summary.SELECT || 0} | WATCH ${summary.WATCH || 0} | BLOCKED ${summary.BLOCKED || 0} | feed gaps ${failures}`, failures ? "warn" : "ok");
    if (!state.selected || !state.rows.some((row) => row.symbol === state.selected.symbol)) {
      const first = sortedRows().find((row) => ["SELECT", "WATCH"].includes(row.decision)) || sortedRows()[0] || null;
      state.selected = first;
    } else {
      state.selected = state.rows.find((row) => row.symbol === state.selected.symbol);
    }
    renderAll();
    const institutionalPromise = loadInstitutionalEvidence(sortedRows());
    await Promise.all([state.selected ? selectSymbol(state.selected.symbol) : Promise.resolve(), institutionalPromise]);
    await loadOrders();
    await maybeAutoStartPaperPortfolio();
  } catch (error) {
    state.lastError = error.message;
    setNotice(`Upstox scan failed: ${error.message}`, "error");
    renderAll();
  }
}

function renderAll() {
  renderCandidates();
  renderScreener();
  renderSymbol();
  renderPiano();
  renderRuntime();
  renderBasketMeta();
  renderOrders();
  renderPortfolioDashboard();
  renderSignalDashboard();
  if (state.activeParameter) renderParameterProof(state.activeParameter);
  window.lucide?.createIcons?.();
}

function switchSection(section, navKey = section, navTitle = "") {
  state.activeSection = section;
  state.activeNavKey = navKey;
  if (section === "portfolio") state.portfolioView = navKey === "performance" ? "performance" : "holdings";
  all(".rail-item[data-section]").forEach((button) => button.classList.toggle("active", (button.dataset.navKey || button.dataset.section) === navKey));
  all(".section").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === section));
  const titleMap = { dashboard: "Dashboard", portfolio: "Holdings", screener: "Scanner", piano: "Trading", "signal-piano": "Signals", orders: "Paper Book", settings: "Settings", help: "Help" };
  el("sectionTitle").textContent = navTitle || titleMap[section] || "Dashboard";
  if (section === "portfolio" || section === "orders") renderPortfolioDashboard();
  window.lucide?.createIcons?.();
}

function openPaperLedgerTab(tab, { scroll = false } = {}) {
  if (!tab) return;
  state.paperLedgerTab = tab;
  renderOrders();
  const detail = el("paperTradeLedgerDetail");
  if (!detail) return;
  detail.open = true;
  if (scroll) window.requestAnimationFrame(() => detail.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function routeRailNavigation(button) {
  const section = button.dataset.section;
  const navKey = button.dataset.navKey || section;
  const ledgerTab = button.dataset.routeLedger || "";
  const decision = button.dataset.routeDecision || "";
  if (decision && el("decisionFilter")) {
    el("decisionFilter").value = decision;
    renderCandidates();
    renderScreener();
    const tableWrap = el("screenerSection")?.querySelector(".table-wrap");
    if (tableWrap) tableWrap.scrollTop = 0;
  }
  if (section === "portfolio") state.portfolioView = navKey === "performance" ? "performance" : "holdings";
  if (section === "orders") {
    state.orderWorkspaceView = ledgerTab === "open" ? "positions" : ledgerTab === "closed" ? "closed" : ledgerTab === "orders" ? "orders" : "book";
  }
  switchSection(section, navKey, button.dataset.navTitle || "");
  if (ledgerTab) openPaperLedgerTab(ledgerTab, { scroll: false });
  renderPortfolioDashboard();
  if (button.dataset.routeAnchor) {
    window.requestAnimationFrame(() => el(button.dataset.routeAnchor)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
}

async function loadReleaseIdentity() {
  const build = el("railBuild");
  try {
    state.health = await api(`/api/health?ts=${Date.now()}`);
    const commit = String(state.health.commit || "").slice(0, 7);
    if (build) build.textContent = commit ? `UI build ${commit}` : "UI build verified";
  } catch (error) {
    if (build) build.textContent = `UI build check failed: ${error.message}`;
  }
}

function downloadCsv(filename, headers, rows) {
  const columns = headers.map((header) => typeof header === "string" ? { key: header, label: header } : header);
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [columns.map((column) => quote(column.label)).join(",")];
  for (const row of rows) lines.push(columns.map((column) => quote(column.value ? column.value(row) : row[column.key])).join(","));
  const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportCsv() {
  const headers = ["symbol", "name", "sector", "decision", "score", "momentum_score", "quality_score", "return_6m_pct", "return_12m_pct", "close", "adv20", "rupee_turnover_cr", "reason"];
  downloadCsv(`ash-stock-scan-${new Date().toISOString().slice(0, 10)}.csv`, headers, visibleRows());
}

async function fetchAllPaperHistory(kind) {
  const rows = [];
  const seenCursors = new Set();
  let cursor = "";
  do {
    const query = new URLSearchParams({ kind, limit: "1000" });
    if (cursor) query.set("cursor", cursor);
    const page = await api(`/api/paper-trader/history?${query}`);
    rows.push(...(Array.isArray(page.records) ? page.records : []));
    const nextCursor = page.next_cursor || "";
    if (nextCursor && seenCursors.has(nextCursor)) throw new Error("paper ledger returned a repeated pagination cursor");
    if (nextCursor) seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor);
  return rows;
}

async function downloadTradeLedger(kind) {
  const open = kind === "open";
  let rows;
  try {
    rows = open ? state.orders?.positions : await fetchAllPaperHistory("closed");
  } catch (error) {
    setNotice(`Full closed-trade download failed: ${error.message}`, "error");
    return;
  }
  if (!Array.isArray(rows)) {
    setNotice("Trade download is not ready; refresh the paper ledger first.", "error");
    return;
  }
  const headers = open ? [
    "symbol", "name", "sector", "qty", "entry_price", "current_price", "market_value",
    "unrealized_pnl", "unrealized_pnl_pct", "entry_date", "quote_timestamp", "target_price", "stop_price", "status"
  ] : [
    "symbol", "name", "sector", "qty", "entry_price", "exit_price", "entry_value", "exit_value",
    "gross_realized_pnl", "round_trip_cost", "realized_pnl", "return_pct", "entry_at", "exit_at", "holding_days", "close_reason"
  ];
  const ledgerName = open ? "open-trades" : "closed-trades";
  downloadCsv(`ash-stock-${ledgerName}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  setNotice(`${rows.length} ${open ? "open positions" : "closed trades"} downloaded as CSV.`, "ok");
}

function quickTradeReferencePrice(source, position = null) {
  return numberValue(
    position?.current_price
      ?? source?.last_price
      ?? source?.current_price
      ?? source?.close
      ?? source?.exit_price
      ?? source?.price
      ?? source?.entry_price
  );
}

function paperBuyQuantityForValue(value, price) {
  const targetValue = Math.max(0, numberValue(value) || 0);
  const referencePrice = numberValue(price);
  if (!targetValue || !referencePrice) return 1;
  return Math.max(1, Math.ceil((targetValue * 1.005) / referencePrice));
}

function updateQuickTradeEstimate() {
  const trade = state.quickTrade;
  if (!trade) return;
  const qty = Math.max(0, Math.floor(numberValue(el("quickTradeQty")?.value) || 0));
  const estimate = trade.referencePrice ? qty * trade.referencePrice : null;
  if (el("quickTradeEstimate")) el("quickTradeEstimate").textContent = estimate === null ? "Waiting for Upstox quote" : fmtPrice(estimate);
  if (el("quickTradeHolding")) {
    el("quickTradeHolding").textContent = trade.position
      ? `${fmtInt(trade.position.qty)} held · ${fmtPrice(trade.position.current_price || trade.position.entry_price)} current mark`
      : "No open position";
  }
}

function renderQuickTradeModal() {
  const trade = state.quickTrade;
  if (!trade) return;
  const minimumEntryValue = numberValue(state.orders?.capital_policy?.minimumEntryValue) || 100000;
  const heldQty = Math.max(0, Math.floor(numberValue(trade.position?.qty) || 0));
  el("quickTradeTitle").textContent = `${trade.side === "BUY" && heldQty ? "Add to" : trade.side === "BUY" ? "Buy" : "Exit"} ${trade.symbol}`;
  el("quickTradeMode").textContent = `${trade.side} · MARKET · PAPER ONLY`;
  el("quickTradeMode").className = `quick-trade-mode ${trade.side.toLowerCase()}`;
  el("quickTradeSymbol").textContent = trade.symbol;
  el("quickTradeQuote").textContent = trade.referencePrice
    ? `${fmtPrice(trade.referencePrice)} reference · server will verify ${trade.side === "BUY" ? "full ask depth" : "visible bid quantity"}`
    : "Fetching live Upstox depth";
  el("quickTradeSubmit").textContent = state.quickTradeSubmitting
    ? "Submitting…"
    : trade.side === "BUY"
      ? heldQty ? "Confirm ADD" : "Confirm BUY"
      : heldQty && Number(el("quickTradeQty")?.value) === heldQty ? "Confirm EXIT ALL" : "Confirm SELL";
  el("quickTradeSubmit").className = `quick-trade-submit ${trade.side.toLowerCase()}`;
  el("quickTradeSubmit").disabled = state.quickTradeSubmitting
    || (trade.side === "SELL" && !heldQty)
    || (trade.side === "BUY" && !trade.referencePrice);
  el("quickTradePresets").innerHTML = trade.side === "BUY"
    ? [minimumEntryValue, 200000, 500000].map((value) => `<button type="button" data-quick-buy-value="${value}">${value === minimumEntryValue ? "₹1L+ min" : value === 200000 ? "₹2L" : "₹5L"}</button>`).join("")
    : `<button type="button" data-quick-sell-pct="25">25%</button><button type="button" data-quick-sell-pct="50">50%</button><button type="button" data-quick-sell-pct="100">EXIT ALL</button>`;
  updateQuickTradeEstimate();
}

async function openQuickTrade(symbol, side) {
  const normalized = String(symbol || "").trim().toUpperCase();
  const normalizedSide = String(side || "BUY").toUpperCase();
  const source = tradeSourceFor(normalized);
  const position = openPaperPosition(normalized);
  if (!normalized || !["BUY", "SELL"].includes(normalizedSide)) return;
  if (normalizedSide === "SELL" && !position) {
    setNotice(`EXIT blocked: ${normalized} has no open paper position`, "error");
    return;
  }
  const referencePrice = quickTradeReferencePrice(source, position);
  const minimumEntryValue = numberValue(state.orders?.capital_policy?.minimumEntryValue) || 100000;
  const defaultQty = normalizedSide === "SELL"
    ? Math.max(1, Math.floor(numberValue(position?.qty) || 1))
    : referencePrice
      ? paperBuyQuantityForValue(minimumEntryValue, referencePrice)
      : 1;
  state.quickTrade = {
    symbol: normalized,
    side: normalizedSide,
    source,
    position,
    instrumentKey: String(source?.instrument_key || position?.instrument_key || ""),
    referencePrice,
    quantityTouched: false
  };
  el("quickTradeQty").value = defaultQty;
  el("quickTradeError").textContent = "";
  renderQuickTradeModal();
  const dialog = el("quickTradeDialog");
  if (dialog && !dialog.open) dialog.showModal();
  try {
    const instrumentQuery = state.quickTrade.instrumentKey ? `instrument_key=${encodeURIComponent(state.quickTrade.instrumentKey)}&` : "";
    const payload = await api(`/api/upstox/quote?${instrumentQuery}symbol=${encodeURIComponent(normalized)}`);
    if (!state.quickTrade || state.quickTrade.symbol !== normalized || state.quickTrade.side !== normalizedSide) return;
    const quote = payload.quotes?.[0] || null;
    const livePrice = numberValue(quote?.last_price);
    if (livePrice) {
      state.quickTrade.referencePrice = livePrice;
      state.quickTrade.quoteTimestamp = quote?.timestamp || "";
      if (normalizedSide === "BUY" && !state.quickTrade.quantityTouched) el("quickTradeQty").value = paperBuyQuantityForValue(minimumEntryValue, livePrice);
    }
    renderQuickTradeModal();
  } catch (error) {
    if (state.quickTrade?.symbol === normalized) {
      el("quickTradeQuote").textContent = `Live preview unavailable · server quote gate still applies`;
      el("quickTradeError").textContent = error.message;
    }
  }
}

function closeQuickTrade() {
  if (state.quickTradeSubmitting) return;
  const dialog = el("quickTradeDialog");
  if (dialog?.open) dialog.close();
  state.quickTrade = null;
}

async function submitQuickTrade(event) {
  event.preventDefault();
  const trade = state.quickTrade;
  if (!trade || state.quickTradeSubmitting) return;
  const qty = Math.max(1, Math.floor(numberValue(el("quickTradeQty").value) || 1));
  const heldQty = Math.max(0, Math.floor(numberValue(trade.position?.qty) || 0));
  if (trade.side === "SELL" && qty > heldQty) {
    el("quickTradeError").textContent = `Quantity ${qty} exceeds held quantity ${heldQty}.`;
    return;
  }
  const row = tradeSourceFor(trade.symbol, trade.source);
  const parameterResults = row.parameter_tunnel?.results || [];
  const body = {
    idempotency_key: `inline-${trade.symbol}-${trade.side}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    symbol: trade.symbol,
    instrument_key: trade.instrumentKey,
    name: row.name || trade.symbol,
    sector: row.sector || trade.position?.sector || "Unmapped",
    side: trade.side,
    order_type: "MARKET",
    product: "SWING",
    qty,
    price: trade.referencePrice,
    decision_price: trade.referencePrice,
    quote_timestamp: trade.quoteTimestamp || "",
    stop_price: trade.side === "BUY" ? numberValue(row.paper_order?.stop_price ?? row.stop_price ?? row.advisor?.stop) : null,
    target_price: trade.side === "BUY" ? numberValue(row.paper_order?.target_price ?? row.target_price ?? row.advisor?.target2) : null,
    source: "ash-stock-inline-controls",
    paper_only: true,
    broker_write_enabled: false,
    parameter_evidence: {
      ...(row.parameter_tunnel?.summary || {}),
      version: row.parameter_tunnel?.version || "",
      top_hits: parameterResults.filter((item) => item.state === "HIT").slice(0, 12).map((item) => item.id),
      risk_hits: parameterResults.filter((item) => item.state === "RISK").slice(0, 12).map((item) => item.id)
    },
    thesis: trade.side === "SELL"
      ? `Manual paper ${qty === heldQty ? "full exit" : "partial exit"} from inline ledger control`
      : `${decisionDisplay(row.decision)} | score ${fmtNumber(row.score)} | ${row.reason || "manual inline paper BUY"}`
  };
  state.quickTradeSubmitting = true;
  el("quickTradeError").textContent = "";
  renderQuickTradeModal();
  try {
    const result = await api("/api/paper-trader/order", { method: "POST", body });
    const fill = result.order?.price;
    const filledQty = Math.max(0, Math.floor(numberValue(result.order?.filled_qty ?? result.order?.qty) || 0));
    const unfilledQty = Math.max(0, Math.floor(numberValue(result.order?.unfilled_qty) || 0));
    const partialFill = Boolean(result.order?.partial_fill || result.action === "PAPER_SELL_PARTIALLY_FILLED");
    const verb = trade.side === "BUY"
      ? heldQty ? "ADDED" : "BOUGHT"
      : partialFill ? "PARTIALLY SOLD" : qty === heldQty ? "EXITED" : "SOLD";
    state.quickTradeSubmitting = false;
    closeQuickTrade();
    const remainder = partialFill
      ? ` · ${fmtInt(unfilledQty)} requested shares unfilled; ${fmtInt(Math.max(0, heldQty - filledQty))} remain open`
      : "";
    setNotice(`${trade.symbol} ${verb}: ${fmtInt(filledQty)} @ ${fmtPrice(fill)} · server-verified Upstox ${trade.side === "BUY" ? "ask" : "bid"}${remainder}`, partialFill ? "warn" : "ok");
    await loadOrders();
  } catch (error) {
    state.quickTradeSubmitting = false;
    if (state.quickTrade) {
      el("quickTradeError").textContent = error.message.includes("insufficient_upstox_ask_depth_for_full_paper_buy")
        ? "BUY blocked: the visible Upstox asks cannot fill the full quantity. Reduce quantity and retry."
        : error.message.includes("upstox_bid_depth_unavailable_for_paper_exit")
          ? "EXIT paused: Upstox currently shows no executable bid quantity. Refresh the quote and retry."
          : error.message;
      renderQuickTradeModal();
    }
    setNotice(`${trade.symbol} ${trade.side} failed: ${error.message}`, "error");
  }
}

async function startUpstoxOAuth() {
  try {
    const payload = await api("/api/upstox/oauth/start");
    if (!payload.authorize_url) throw new Error("authorize_url_missing");
    window.location.href = payload.authorize_url;
  } catch (error) {
    setNotice(`Upstox OAuth failed: ${error.message}`, "error");
    await refreshUpstoxStatus();
  }
}

async function submitUpstoxToken(event) {
  event.preventDefault();
  const tokenInput = el("upstoxAccessToken");
  const expiryInput = el("upstoxTokenExpiry");
  const resultNode = el("upstoxTokenResult");
  const token = String(tokenInput?.value || "").trim();
  if (!token) {
    setNotice("Upstox token save blocked: paste the access token first", "error");
    return;
  }
  const expiresIn = numberValue(expiryInput?.value);
  try {
    const payload = await api("/api/upstox/token", {
      method: "POST",
      body: {
        access_token: token,
        expires_in: expiresIn
      }
    });
    tokenInput.value = "";
    if (expiryInput) expiryInput.value = "";
    state.upstoxStatus = payload.status || null;
    if (resultNode) resultNode.textContent = `Token saved in Mongo at ${isoDate(state.upstoxStatus?.token_saved_at)}`;
    setNotice("Upstox token saved in Mongo. Scanner and quotes will use it now.", "ok");
    renderRuntime();
  } catch (error) {
    if (resultNode) resultNode.textContent = `Token save failed: ${error.message}`;
    setNotice(`Upstox token save failed: ${error.message}`, "error");
  }
}

function renderFormulaSettings() {
  const grid = el("formulaSettingsGrid");
  const mode = el("formulaSettingsMode");
  const auditNode = el("formulaSettingsAudit");
  if (!grid || !mode || !auditNode) return;
  const payload = state.formulaSettings;
  if (!payload) {
    mode.textContent = "Loading";
    mode.className = "status-pill watch";
    grid.innerHTML = `<p class="empty-state">Loading validated paper-selection controls.</p>`;
    auditNode.innerHTML = `<p class="empty-state compact">No formula history loaded.</p>`;
    return;
  }
  const definitions = Array.isArray(payload.definitions) ? payload.definitions : Array.isArray(payload.editable) ? payload.editable : [];
  const values = payload.settings || payload.values || {};
  const paperOnly = payload.paper_only !== false && payload.broker_write_enabled !== true;
  mode.textContent = paperOnly ? `PAPER ONLY · EDGE ${payload.edge_confirmed ? "CONFIRMED" : "NOT CONFIRMED"}` : "SAFETY ERROR";
  mode.className = `status-pill ${paperOnly ? "watch" : "blocked"}`;
  if (!definitions.length) {
    grid.innerHTML = `<p class="empty-state">${escapeHtml(payload.error || "The server did not return editable formula definitions.")}</p>`;
  } else {
    const groups = definitions.reduce((map, definition) => {
      const group = definition.group || "Selection";
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(definition);
      return map;
    }, new Map());
    grid.innerHTML = [...groups.entries()].map(([group, fields]) => `<section class="formula-settings-group">
      <h4>${escapeHtml(group)}</h4>
      <p>${escapeHtml(fields[0]?.group_description || fields[0]?.phase_description || "Validated operands; formula source code remains locked.")}</p>
      ${fields.map((definition) => {
        const value = values[definition.id] ?? definition.default;
        const details = [definition.formula, definition.unit, definition.phase ? `Phase ${definition.phase}` : "", definition.range_note].filter(Boolean).join(" · ");
        let control = "";
        if (definition.type === "boolean") {
          control = `<select name="${escapeHtml(definition.id)}" data-formula-id="${escapeHtml(definition.id)}" ${definition.editable === false ? "disabled" : ""}><option value="false" ${value === false ? "selected" : ""}>Off</option><option value="true" ${value === true ? "selected" : ""}>On</option></select>`;
        } else if (definition.type === "enum") {
          control = `<select name="${escapeHtml(definition.id)}" data-formula-id="${escapeHtml(definition.id)}" ${definition.editable === false ? "disabled" : ""}>${(definition.options || []).map((option) => `<option value="${escapeHtml(option)}" ${String(value) === String(option) ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`;
        } else {
          control = `<input name="${escapeHtml(definition.id)}" data-formula-id="${escapeHtml(definition.id)}" type="number" value="${escapeHtml(value)}" min="${escapeHtml(definition.min)}" max="${escapeHtml(definition.max)}" step="${escapeHtml(definition.step ?? "any")}" inputmode="decimal" ${definition.editable === false ? "disabled" : ""} />`;
        }
        return `<label class="formula-field"><span><span>${escapeHtml(definition.label || definition.id)}</span><small>${escapeHtml(details || definition.description || definition.id)}</small></span>${control}</label>`;
      }).join("")}
    </section>`).join("");
  }
  const audit = Array.isArray(payload.audit) ? payload.audit : Array.isArray(payload.history) ? payload.history : [];
  auditNode.innerHTML = audit.length ? audit.slice(0, 20).map((entry) => {
    const changes = Object.entries(entry.changes || {}).map(([key, value]) => {
      const before = value && typeof value === "object" ? value.before : "";
      const after = value && typeof value === "object" ? value.after : value;
      return `${key}: ${before} → ${after}`;
    }).join(" · ");
    return `<div class="formula-audit-row"><strong>${escapeHtml(isoDate(entry.changed_at || entry.changedAt))}<br />Revision ${escapeHtml(entry.revision_after ?? entry.revisionAfter ?? entry.revision ?? "-")}</strong><span>${escapeHtml(entry.action || "UPDATE")} · ${escapeHtml(changes || entry.reason || "No value change")}</span></div>`;
  }).join("") : `<p class="empty-state compact">No formula changes have been recorded.</p>`;
  window.lucide?.createIcons?.();
}

async function loadFormulaSettings() {
  try {
    state.formulaSettings = await api(`/api/settings/formulas?ts=${Date.now()}`);
  } catch (error) {
    state.formulaSettings = { error: error.message, definitions: [], audit: [], paper_only: true, broker_write_enabled: false, edge_confirmed: false };
  }
  renderFormulaSettings();
}

function collectFormulaSettings() {
  const payload = state.formulaSettings || {};
  const definitions = Array.isArray(payload.definitions) ? payload.definitions : [];
  const settings = {};
  for (const definition of definitions.filter((item) => item.editable !== false)) {
    const input = el("formulaSettingsForm")?.querySelector(`[data-formula-id="${CSS.escape(definition.id)}"]`);
    if (!input) continue;
    settings[definition.id] = definition.type === "boolean" ? input.value === "true" : definition.type === "enum" ? input.value : Number(input.value);
  }
  return settings;
}

async function submitFormulaSettings(event) {
  event.preventDefault();
  if (state.formulaSettingsSaving) return;
  const result = el("formulaSettingsResult");
  state.formulaSettingsSaving = true;
  if (result) result.textContent = "Saving validated settings…";
  try {
    state.formulaSettings = await api("/api/settings/formulas", {
      method: "POST",
      body: {
        expected_revision: state.formulaSettings?.revision ?? 0,
        settings: collectFormulaSettings(),
        reason: "ASH Stock Settings UI update"
      }
    });
    if (result) result.textContent = `Saved revision ${state.formulaSettings.revision}. Applies to the next paper scan.`;
    setNotice("Paper selection formulas saved. Live execution remains locked.", "ok");
  } catch (error) {
    if (result) result.textContent = `Save blocked: ${error.message}`;
    setNotice(`Formula save blocked: ${error.message}`, "error");
  } finally {
    state.formulaSettingsSaving = false;
    renderFormulaSettings();
  }
}

async function resetFormulaSettings() {
  if (state.formulaSettingsSaving || !window.confirm("Reset editable paper-selection formulas to the governed defaults?")) return;
  const result = el("formulaSettingsResult");
  state.formulaSettingsSaving = true;
  if (result) result.textContent = "Resetting defaults…";
  try {
    state.formulaSettings = await api("/api/settings/formulas", {
      method: "POST",
      body: {
        action: "reset",
        expected_revision: state.formulaSettings?.revision ?? 0,
        reason: "ASH Stock Settings UI reset"
      }
    });
    if (result) result.textContent = `Defaults restored at revision ${state.formulaSettings.revision}.`;
    setNotice("Paper selection formulas reset to governed defaults.", "ok");
  } catch (error) {
    if (result) result.textContent = `Reset blocked: ${error.message}`;
    setNotice(`Formula reset blocked: ${error.message}`, "error");
  } finally {
    state.formulaSettingsSaving = false;
    renderFormulaSettings();
  }
}

function bindUi() {
  document.addEventListener("click", (event) => {
    const download = event.target.closest("[data-download-trades]");
    if (download) {
      event.preventDefault();
      downloadTradeLedger(download.dataset.downloadTrades);
      return;
    }
    const action = event.target.closest("[data-quick-trade]");
    if (!action || action.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    openQuickTrade(action.dataset.tradeSymbol, action.dataset.quickTrade);
  });
  all(".rail-item[data-section]").forEach((button) => button.addEventListener("click", () => routeRailNavigation(button)));
  all(".tab-button").forEach((button) => button.addEventListener("click", () => {
    state.horizon = button.dataset.horizon;
    all(".tab-button").forEach((item) => item.classList.toggle("active", item === button));
    renderAutoOrderReadiness();
  }));
  el("refreshBtn")?.addEventListener("click", refreshScan);
  el("nseMasterBtn")?.addEventListener("click", loadNseMaster);
  el("paperEngineBtn")?.addEventListener("click", runPaperEngineNow);
  el("signalPaperEngineAction")?.addEventListener("click", runPaperEngineNow);
  el("signalRadarRefresh")?.addEventListener("click", refreshScan);
  el("dashboardRefreshBtn")?.addEventListener("click", loadOrders);
  el("paperTradeRefreshBtn")?.addEventListener("click", loadOrders);
  el("refreshOrdersBtn")?.addEventListener("click", loadOrders);
  el("upstoxConnectBtn")?.addEventListener("click", startUpstoxOAuth);
  el("upstoxTokenForm")?.addEventListener("submit", submitUpstoxToken);
  el("formulaSettingsForm")?.addEventListener("submit", submitFormulaSettings);
  el("formulaSettingsReset")?.addEventListener("click", resetFormulaSettings);
  el("symbolSearch")?.addEventListener("input", () => { renderCandidates(); renderScreener(); });
  el("decisionFilter")?.addEventListener("change", () => {
    renderCandidates();
    renderScreener();
    const tableWrap = el("screenerSection")?.querySelector(".table-wrap");
    if (tableWrap) tableWrap.scrollTop = 0;
  });
  el("exportBtn")?.addEventListener("click", exportCsv);
  el("quickTradeForm")?.addEventListener("submit", submitQuickTrade);
  el("quickTradeCancel")?.addEventListener("click", closeQuickTrade);
  el("quickTradeQty")?.addEventListener("input", () => {
    if (!state.quickTrade) return;
    state.quickTrade.quantityTouched = true;
    renderQuickTradeModal();
  });
  el("quickTradePresets")?.addEventListener("click", (event) => {
    const buyPreset = event.target.closest("[data-quick-buy-value]");
    const sellPreset = event.target.closest("[data-quick-sell-pct]");
    if (!state.quickTrade || (!buyPreset && !sellPreset)) return;
    event.preventDefault();
    if (buyPreset) {
      if (!state.quickTrade.referencePrice) {
        el("quickTradeError").textContent = "A price reference is required before sizing by value.";
        return;
      }
      el("quickTradeQty").value = paperBuyQuantityForValue(Number(buyPreset.dataset.quickBuyValue), state.quickTrade.referencePrice);
    } else {
      const heldQty = Math.max(1, Math.floor(numberValue(state.quickTrade.position?.qty) || 1));
      const pct = Number(sellPreset.dataset.quickSellPct);
      el("quickTradeQty").value = pct === 100 ? heldQty : Math.max(1, Math.floor(heldQty * pct / 100));
    }
    state.quickTrade.quantityTouched = true;
    renderQuickTradeModal();
  });
  el("quickTradeDialog")?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeQuickTrade();
  });
  el("quickTradeDialog")?.addEventListener("click", (event) => {
    if (event.target === el("quickTradeDialog")) closeQuickTrade();
  });
  el("tunnelParameterSearch")?.addEventListener("input", (event) => {
    state.tunnelParameterQuery = event.target.value;
    renderParameterTunnel();
  });
  el("tunnelStockSearch")?.addEventListener("input", (event) => {
    state.tunnelStockQuery = event.target.value;
    renderParameterTunnel();
  });
  el("tunnelToggleAll")?.addEventListener("click", () => {
    const query = state.tunnelStockQuery.toUpperCase();
    const visible = tunnelRows()
      .filter((row) => !query || `${row.symbol} ${row.name || ""}`.toUpperCase().includes(query))
      .slice(0, 60)
      .map((row) => row.symbol);
    const selected = new Set(state.tunnelSelectedSymbols);
    state.tunnelSelectedSymbols = visible.length && visible.every((symbol) => selected.has(symbol)) ? [visible[0]] : visible;
    renderParameterTunnel();
  });
  window.addEventListener("resize", () => drawChart(state.selected));
}

document.addEventListener("DOMContentLoaded", async () => {
  bindUi();
  startClock();
  renderMarketStrip();
  renderAll();
  renderFormulaSettings();
  window.lucide?.createIcons?.();
  await Promise.all([loadOrders(), loadFormulaSettings()]);
  await Promise.all([refreshScan(), loadSignalMarketContext(), loadReleaseIdentity()]);
  window.setInterval(maybeAutoStartPaperPortfolio, 60_000);
});
