const MARKET_CONTEXT_FUNCTIONS = String.raw`
const MARKET_CONTEXT_VERSION = "ashstocks-market-context-v0.1";
const MARKET_CONTEXT_SYMBOLS = Object.freeze([
  { key: "nifty50", label: "NIFTY 50", yahoo: "^NSEI", group: "index" },
  { key: "sensex", label: "SENSEX", yahoo: "^BSESN", group: "index" },
  { key: "banknifty", label: "NIFTY BANK", yahoo: "^NSEBANK", group: "index" },
  { key: "indiavix", label: "INDIA VIX", yahoo: "^INDIAVIX", group: "risk" },
  { key: "usdinr", label: "USD/INR", yahoo: "INR=X", group: "macro" },
  { key: "gold", label: "GOLD", yahoo: "GC=F", group: "macro" }
]);
let marketContextCache = { at: 0, payload: null };
function marketRound(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
}
function marketTone(changePct, key = "") {
  const value = Number(changePct);
  if (!Number.isFinite(value)) return "neutral";
  if (key === "indiavix") return value <= 0 ? "positive" : "negative";
  return value >= 0 ? "positive" : "negative";
}
async function fetchYahooMarketCard(item) {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(item.yahoo) + "?range=5d&interval=1d";
  const response = await fetch(url, { headers: { "user-agent": "ashstocks-market-context" } });
  if (!response.ok) throw new Error(item.label + " feed " + response.status);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta || {};
  const closes = (result?.indicators?.quote?.[0]?.close || []).filter((value) => Number.isFinite(Number(value)));
  const price = marketRound(meta.regularMarketPrice ?? closes.at(-1));
  const previous = marketRound(meta.previousClose ?? meta.chartPreviousClose ?? closes.at(-2));
  const change = price !== null && previous ? marketRound(price - previous) : null;
  const changePct = price !== null && previous ? marketRound(((price - previous) / previous) * 100) : null;
  const spark = closes.slice(-20).map((value) => marketRound(value));
  return { key: item.key, label: item.label, symbol: item.yahoo, group: item.group, price, previous_close: previous, change, change_pct: changePct, tone: marketTone(changePct, item.key), spark, source: "Yahoo Finance chart", fetched_at: new Date().toISOString() };
}
function buildMarketBreadth(state = defaultState(), paperTrader = null) {
  const rows = paperTrader?.last_plan?.top_ranked || [];
  if (!rows.length) return { advancing: null, declining: null, unchanged: null, source: "paper plan not ready" };
  const advancing = rows.filter((row) => Number(row.return_6m_pct || 0) > 0).length;
  const declining = rows.filter((row) => Number(row.return_6m_pct || 0) < 0).length;
  return { advancing, declining, unchanged: Math.max(0, rows.length - advancing - declining), source: "latest paper ranking proxy" };
}
function marketInsight(cards = [], breadth = {}) {
  const byKey = Object.fromEntries(cards.map((card) => [card.key, card]));
  const indexCards = cards.filter((card) => card.group === "index");
  const positiveIndexes = indexCards.filter((card) => Number(card.change_pct || 0) > 0).length;
  const vix = byKey.indiavix;
  const gold = byKey.gold;
  const usd = byKey.usdinr;
  const bias = positiveIndexes >= 2 && Number(vix?.change_pct || 0) <= 0 ? "Bullish" : positiveIndexes >= 2 ? "Constructive" : "Cautious";
  const notes = [];
  if (positiveIndexes >= 2) notes.push("index breadth supportive"); else notes.push("index confirmation weak");
  if (Number(vix?.change_pct || 0) <= 0) notes.push("volatility easing"); else if (vix?.change_pct !== null) notes.push("volatility rising");
  if (Number(gold?.change_pct || 0) > 0) notes.push("gold bid shows risk hedge demand");
  if (Number(usd?.change_pct || 0) > 0) notes.push("USD/INR pressure visible");
  if (Number(breadth.advancing || 0) > Number(breadth.declining || 0)) notes.push("paper universe momentum breadth positive");
  return { bias, confidence: Math.min(95, Math.max(35, 45 + positiveIndexes * 12 + (Number(vix?.change_pct || 0) <= 0 ? 10 : -5))), notes };
}
async function marketContextPayload(state = defaultState()) {
  const now = Date.now();
  if (marketContextCache.payload && now - marketContextCache.at < 120000) return marketContextCache.payload;
  const results = await Promise.allSettled(MARKET_CONTEXT_SYMBOLS.map(fetchYahooMarketCard));
  const cards = results.map((result, index) => result.status === "fulfilled" ? result.value : { key: MARKET_CONTEXT_SYMBOLS[index].key, label: MARKET_CONTEXT_SYMBOLS[index].label, symbol: MARKET_CONTEXT_SYMBOLS[index].yahoo, group: MARKET_CONTEXT_SYMBOLS[index].group, price: null, previous_close: null, change: null, change_pct: null, tone: "neutral", spark: [], source: "Yahoo Finance chart", error: result.reason?.message || "feed failed" });
  const paperTrader = sanitizePaperTraderState(state.paperTrader || {});
  const breadth = buildMarketBreadth(state, paperTrader);
  const insight = marketInsight(cards, breadth);
  const payload = { ok: true, engine: MARKET_CONTEXT_VERSION, asOf: new Date().toISOString(), cards, breadth, insight, feeds: ["Yahoo Finance chart API", "AshStocks paper ranking breadth proxy"], paper_only: true, live_orders: false };
  marketContextCache = { at: now, payload };
  return payload;
}
`;
const MARKET_CONTEXT_ROUTES = String.raw`
      if (url.pathname === "/api/market-context") { const store = await getStore(); const state = await store.getState(); json(res, 200, await marketContextPayload(state)); return; }
`;
export function applyMarketContextPatches(source, mustReplace) {
  let output = source;
  output = mustReplace(output, "\nasync function dataBankStatus() {", `\n${MARKET_CONTEXT_FUNCTIONS}\nasync function dataBankStatus() {`, "insert market context functions");
  output = mustReplace(output, '      if (url.pathname === "/api/paper-trader/parameters") {', `${MARKET_CONTEXT_ROUTES}\n      if (url.pathname === "/api/paper-trader/parameters") {`, "market context api route");
  return output;
}
