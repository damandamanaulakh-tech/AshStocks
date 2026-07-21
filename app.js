const DATA_GAP_DECISION = ["DATA", "NEEDED"].join("_");

const state = {
  ready: null,
  scan: null,
  rows: [],
  selected: null,
  selectedQuote: null,
  orders: null,
  activeSection: "dashboard",
  horizon: "intraday",
  lastError: "",
  activeParameter: null
};

const indexKeys = [
  { label: "NIFTY 50", key: "NSE_INDEX|Nifty 50" },
  { label: "NIFTY BANK", key: "NSE_INDEX|Nifty Bank" },
  { label: "INDIA VIX", key: "NSE_INDEX|India VIX" }
];

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

function setNotice(message, tone = "info") {
  const node = el("noticeLine");
  if (!node) return;
  node.className = `notice-line ${tone}`;
  node.textContent = message;
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
  if (status === "error") {
    node.innerHTML = `<article class="market-card danger"><span class="mini-label">Upstox quotes</span><strong>Quote error</strong><p>${escapeHtml(state.lastError)}</p></article>`;
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

function renderCandidates() {
  const node = el("candidateList");
  if (!node) return;
  const rows = visibleRows().slice(0, 80);
  el("selectionCount").textContent = `${state.rows.length}`;
  if (!rows.length) {
    node.innerHTML = `<div class="empty-state">No stock rows matched the current filter. Refresh runs the Upstox scan.</div>`;
    return;
  }
  node.innerHTML = rows.map((row) => {
    const active = state.selected?.symbol === row.symbol ? " active" : "";
    return `<button class="candidate-row${active}" type="button" data-symbol="${escapeHtml(row.symbol)}">
      <span>
        <strong>${escapeHtml(row.symbol)}</strong>
        <small>${escapeHtml(row.name || row.sector || "NSE")}</small>
      </span>
      <span class="candidate-metrics">
        <b>${fmtNumber(row.score)}</b>
        <em class="status-pill ${decisionClass(row.decision)}">${decisionDisplay(row.decision)}</em>
      </span>
    </button>`;
  }).join("");
  all(".candidate-row", node).forEach((button) => {
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
  el("ticketSymbol").value = row.symbol;
  const price = numberValue(row.close);
  if (price) {
    el("ticketPrice").value = round(price, 2);
    el("ticketStop").value = round(price * 0.94, 2);
    el("ticketTarget").value = round(price * 1.12, 2);
  }
  renderCandidates();
  renderSymbol();
  await fetchSelectedQuote(row);
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
  renderPiano();
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
  const hitRatio = results.length ? results.filter((item) => item.result.state === "hit").length / results.length : 0;
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
  const topHits = rowParameterResults(row, ctx).filter((item) => item.result.state === "hit").slice(0, 10);
  const blockers = rowParameterResults(row, ctx).filter((item) => item.result.state === "blocked").slice(0, 8);
  const lines = [
    ["Decision", decisionDisplay(row.decision)],
    ["Reason", row.reason || "No server reason returned"],
    ["Data source", row.data_source || "Upstox scanner"],
    ["Candle evidence", row.candle_evidence || `${m.candles.length} candles returned`],
    ["Paper action", row.paper_order?.status || "Paper ticket uses selected symbol price"],
    ["Latest price", fmtPrice(m.close)]
  ];
  node.innerHTML = lines.map(([k, v]) => `<div class="detail-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join("") +
    `<h4>Passed parameters</h4>` +
    topHits.map(({ param, result }) => `<button class="proof-chip hit" type="button" data-param="${param.id}">P${param.id} ${escapeHtml(param.name)} <small>${escapeHtml(result.value)}</small></button>`).join("") +
    `<h4>Removing or weak parameters</h4>` +
    (blockers.length ? blockers.map(({ param, result }) => `<button class="proof-chip blocked" type="button" data-param="${param.id}">P${param.id} ${escapeHtml(param.name)} <small>${escapeHtml(result.value)}</small></button>`).join("") : `<div class="empty-state">No hard removing parameter in current evaluated set.</div>`);
  all("[data-param]", node).forEach((button) => button.addEventListener("click", () => openParameter(Number(button.dataset.param))));
}

function renderPiano() {
  const stage = el("pianoStage");
  if (!stage) return;
  const rows = sortedRows().slice(0, 12);
  const ctx = buildContext(state.rows);
  const total = parameterCatalog.length;
  el("pianoCoverage").textContent = `${total} live keys`;
  const stockStrings = rows.map((row) => {
    const results = rowParameterResults(row, ctx);
    const hit = results.filter((item) => item.result.state === "hit").length;
    const bits = results.slice(0, 32).map((item) => `<span title="P${item.param.id} ${escapeHtml(item.param.name)}: ${escapeHtml(item.result.value)}" class="string-bit ${item.result.state}" data-param="${item.param.id}" data-symbol="${escapeHtml(row.symbol)}"></span>`).join("");
    return `<button class="piano-stock" type="button" data-symbol="${escapeHtml(row.symbol)}">
      <strong>${hit}/${total}</strong>
      <span class="piano-string">${bits}</span>
      <b>${escapeHtml(row.symbol)}</b>
      <em>${decisionDisplay(row.decision)}</em>
    </button>`;
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

function openParameter(id, symbol = "") {
  const param = parameterCatalog.find((item) => item.id === id);
  if (!param) return;
  state.activeParameter = param;
  state.activeSection = "piano";
  switchSection("piano");
  renderParameterProof(param, symbol);
  renderPiano();
}

function renderParameterProof(param, focusSymbol = "") {
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
        <thead><tr><th>Symbol</th><th>Effect</th><th>Computed value</th><th>Decision</th><th>Reason</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
  all("[data-symbol]", node).forEach((button) => button.addEventListener("click", () => selectSymbol(button.dataset.symbol)));
}

function renderScreener() {
  const body = el("screenerBody");
  if (!body) return;
  const rows = visibleRows().slice(0, 250);
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7">No stock rows matched the current filter.</td></tr>`;
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
  </tr>`).join("");
  all("[data-symbol]", body).forEach((button) => button.addEventListener("click", () => selectSymbol(button.dataset.symbol)));
}

function renderRuntime() {
  const ready = state.ready || {};
  const bank = ready.data_bank || {};
  const upstox = ready.upstox || {};
  const runtimeRows = [
    ["Render URL", location.origin],
    ["Storage", ready.storage || "checking"],
    ["Mongo source", ready.source || ready.warning || "Render env pending"],
    ["NSE universe", `${bank.universe_count || 0} rows`],
    ["Instrument keys", `${bank.rows_with_instrument_key || 0} rows`],
    ["Upstox token", upstox.token_visible ? "visible to server" : "not visible to server"],
    ["Upstox key", upstox.key_visible ? "visible to server" : "not visible to server"]
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
}

async function loadOrders() {
  try {
    state.orders = await api("/api/paper-trader/orders");
  } catch (error) {
    state.orders = { ok: false, error: error.message, orders: [], positions: [], trades: [] };
  }
  renderOrders();
}

function renderOrders() {
  const targets = [el("paperBook"), el("ordersLedger")].filter(Boolean);
  const orders = state.orders?.orders || [];
  const positions = state.orders?.positions || [];
  const funds = state.orders?.funds || {};
  const html = `<div class="book-summary">
      <article><span>Open positions</span><strong>${positions.length}</strong></article>
      <article><span>Orders</span><strong>${orders.length}</strong></article>
      <article><span>Realized P&L</span><strong>${fmtPrice(funds.realized_pnl || 0)}</strong></article>
    </div>
    <table>
      <thead><tr><th>Type</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Price</th><th>Status</th><th>Time</th></tr></thead>
      <tbody>
        ${positions.map((position) => `<tr><td>Position</td><td>${escapeHtml(position.symbol)}</td><td>LONG</td><td>${fmtInt(position.qty)}</td><td>${fmtPrice(position.current_price || position.entry_price)}</td><td>${escapeHtml(position.status || "OPEN")}</td><td>${escapeHtml(isoDate(position.checked_at || position.entry_date))}</td></tr>`).join("")}
        ${orders.slice(0, 20).map((order) => `<tr><td>Order</td><td>${escapeHtml(order.symbol)}</td><td>${escapeHtml(order.side)}</td><td>${fmtInt(order.qty)}</td><td>${fmtPrice(order.price)}</td><td>${escapeHtml(order.status)}</td><td>${escapeHtml(isoDate(order.updated_at || order.created_at))}</td></tr>`).join("")}
        ${!positions.length && !orders.length ? `<tr><td colspan="7">No paper orders have been placed in Mongo/file ledger yet.</td></tr>` : ""}
      </tbody>
    </table>
    ${state.orders?.error ? `<p class="error-text">${escapeHtml(state.orders.error)}</p>` : ""}`;
  targets.forEach((node) => { node.innerHTML = html; });
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
    renderRuntime();
  } catch (error) {
    state.lastError = error.message;
    setNotice(`Runtime check failed: ${error.message}`, "error");
    renderMarketStrip("error");
    return;
  }
  await refreshMarketStrip();
  try {
    const scan = await api("/api/scanner/run-upstox", { method: "POST", body: { horizon: state.horizon } });
    state.scan = scan;
    state.rows = Array.isArray(scan.rows) ? scan.rows : [];
    const summary = scan.summary || {};
    const failures = Array.isArray(scan.failures) ? scan.failures.length : 0;
    setNotice(`Upstox scan ${state.rows.length} rows | SELECT ${summary.SELECT || 0} | WATCH ${summary.WATCH || 0} | BLOCKED ${summary.BLOCKED || 0} | feed gaps ${failures}`, failures ? "warn" : "ok");
    if (!state.selected || !state.rows.some((row) => row.symbol === state.selected.symbol)) {
      const first = sortedRows().find((row) => ["SELECT", "WATCH"].includes(row.decision)) || sortedRows()[0] || null;
      state.selected = first;
    } else {
      state.selected = state.rows.find((row) => row.symbol === state.selected.symbol);
    }
    renderAll();
    if (state.selected) await selectSymbol(state.selected.symbol);
    await loadOrders();
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
  renderOrders();
  if (state.activeParameter) renderParameterProof(state.activeParameter);
  window.lucide?.createIcons?.();
}

function switchSection(section) {
  state.activeSection = section;
  all(".rail-item[data-section]").forEach((button) => button.classList.toggle("active", button.dataset.section === section));
  all(".section").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === section));
  const titleMap = { dashboard: "Dashboard", screener: "Screener", piano: "Signal Piano", orders: "Paper Orders", settings: "Settings" };
  el("sectionTitle").textContent = titleMap[section] || "Dashboard";
  window.lucide?.createIcons?.();
}

function exportCsv() {
  const rows = visibleRows();
  const headers = ["symbol", "name", "sector", "decision", "score", "momentum_score", "quality_score", "return_6m_pct", "return_12m_pct", "close", "adv20", "rupee_turnover_cr", "reason"];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ash-stock-scan-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function submitPaperOrder(event) {
  event.preventDefault();
  const row = state.selected || state.rows.find((item) => item.symbol === el("ticketSymbol").value.trim().toUpperCase());
  if (!row) {
    setNotice("Paper order blocked: select a scanned NSE symbol first", "error");
    return;
  }
  await fetchSelectedQuote(row);
  const quotePrice = numberValue(state.selectedQuote?.last_price);
  const scanPrice = numberValue(row.close);
  const orderType = el("ticketOrderType").value;
  const typedPrice = numberValue(el("ticketPrice").value);
  const executionPrice = orderType === "MARKET" ? (quotePrice ?? scanPrice) : typedPrice;
  if (!executionPrice) {
    setNotice("Paper order blocked: no real Upstox quote or scan close price available", "error");
    return;
  }
  const body = {
    symbol: row.symbol,
    name: row.name,
    side: el("ticketSide").value,
    order_type: orderType,
    qty: Math.max(1, Math.floor(numberValue(el("ticketQty").value) || 1)),
    price: executionPrice,
    stop_price: numberValue(el("ticketStop").value),
    target_price: numberValue(el("ticketTarget").value),
    product: el("ticketProduct").value,
    source: "ash-stock-dashboard",
    thesis: `${decisionDisplay(row.decision)} | score ${fmtNumber(row.score)} | ${row.reason || "scanner row"}`
  };
  try {
    const result = await api("/api/paper-trader/order", { method: "POST", body });
    setNotice(`${result.action || "Paper order saved"}: ${row.symbol} ${body.side} ${body.qty} @ ${fmtPrice(body.price)}`, "ok");
    await loadOrders();
  } catch (error) {
    setNotice(`Paper order failed: ${error.message}`, "error");
  }
}

function bindUi() {
  all(".rail-item[data-section]").forEach((button) => button.addEventListener("click", () => switchSection(button.dataset.section)));
  all(".tab-button").forEach((button) => button.addEventListener("click", () => {
    state.horizon = button.dataset.horizon;
    all(".tab-button").forEach((item) => item.classList.toggle("active", item === button));
    el("ticketProduct").value = state.horizon === "intraday" ? "Paper Intraday" : state.horizon === "positional" || state.horizon === "portfolio" ? "Paper Positional" : "Paper Swing";
  }));
  el("refreshBtn")?.addEventListener("click", refreshScan);
  el("refreshOrdersBtn")?.addEventListener("click", loadOrders);
  el("symbolSearch")?.addEventListener("input", () => { renderCandidates(); renderScreener(); });
  el("decisionFilter")?.addEventListener("change", () => { renderCandidates(); renderScreener(); });
  el("exportBtn")?.addEventListener("click", exportCsv);
  el("paperTicket")?.addEventListener("submit", submitPaperOrder);
  window.addEventListener("resize", () => drawChart(state.selected));
}

document.addEventListener("DOMContentLoaded", async () => {
  bindUi();
  renderMarketStrip();
  renderAll();
  window.lucide?.createIcons?.();
  await refreshScan();
});
