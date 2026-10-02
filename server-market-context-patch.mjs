const MARKET_CONTEXT_FUNCTIONS = String.raw`
const MARKET_CONTEXT_VERSION = "ashstocks-market-context-v0.2-availability";
const MARKET_CONTEXT_SYMBOLS = Object.freeze([
  { key: "nifty50", label: "NIFTY 50", yahoo: "^NSEI", group: "index" },
  { key: "sensex", label: "SENSEX", yahoo: "^BSESN", group: "index" },
  { key: "banknifty", label: "NIFTY BANK", yahoo: "^NSEBANK", group: "index" },
  { key: "indiavix", label: "INDIA VIX", yahoo: "^INDIAVIX", group: "risk" },
  { key: "usdinr", label: "USD/INR", yahoo: "INR=X", group: "macro" },
  { key: "gold", label: "GOLD", yahoo: "GC=F", group: "macro" }
]);
const MARKET_CONTEXT_FETCH_TIMEOUT_MS = 8000;
const MARKET_CONTEXT_REQUIRED_KEYS = Object.freeze(["nifty50", "sensex", "banknifty", "indiavix"]);
let marketContextCache = { at: 0, cards: null, asOf: null };
let marketContextInFlight = null;
function marketNumber(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function marketRound(value, digits = 2) {
  const number = marketNumber(value);
  return number === null ? null : Number(number.toFixed(digits));
}
function marketTone(changePct, key = "") {
  const value = marketNumber(changePct);
  if (value === null) return "neutral";
  if (key === "indiavix") return value <= 0 ? "positive" : "negative";
  return value >= 0 ? "positive" : "negative";
}
async function fetchYahooMarketCard(item) {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(item.yahoo) + "?range=5d&interval=1d";
  const controller = new AbortController();
  let timer;
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("market_feed_timeout"));
        controller.abort();
      }, MARKET_CONTEXT_FETCH_TIMEOUT_MS);
    });
    // The deadline covers headers AND the body. Promise.race also bounds a
    // provider implementation that ignores abort; late results are not cached.
    return await Promise.race([(async () => {
      const response = await fetch(url, { headers: { "user-agent": "ashstocks-market-context" }, signal: controller.signal });
      if (!response.ok) throw new Error("market_feed_http_" + response.status);
      const payload = await response.json();
      const result = payload?.chart?.result?.[0];
      const meta = result?.meta || {};
      const rawCloses = result?.indicators?.quote?.[0]?.close;
      const closes = (Array.isArray(rawCloses) ? rawCloses : []).map(marketNumber).filter((value) => value !== null);
      const price = marketRound(marketNumber(meta.regularMarketPrice) ?? closes.at(-1));
      const previous = marketRound(marketNumber(meta.previousClose) ?? marketNumber(meta.chartPreviousClose) ?? closes.at(-2));
      const change = price !== null && previous !== null ? marketRound(price - previous) : null;
      const changePct = price !== null && previous !== null && previous !== 0 ? marketRound(((price - previous) / previous) * 100) : null;
      const missingFields = [price === null && "price", previous === null && "previous_close", changePct === null && "change_pct"].filter(Boolean);
      const status = missingFields.length === 0 ? "available" : price === null ? "unavailable" : "partial";
      const spark = closes.slice(-20).map((value) => marketRound(value));
      return { key: item.key, label: item.label, symbol: item.yahoo, group: item.group, price, previous_close: previous, change, change_pct: changePct, tone: marketTone(changePct, item.key), spark, status, available: status === "available", missing_fields: missingFields, source: "Yahoo Finance chart", fetched_at: new Date().toISOString() };
    })(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
function buildMarketBreadth(state = defaultState(), paperTrader = null) {
  const rows = paperTrader?.last_plan?.top_ranked || [];
  if (!rows.length) return { advancing: null, declining: null, unchanged: null, unknown: null, status: "unavailable", source: "paper plan not ready" };
  const returns = rows.map((row) => marketNumber(row.return_6m_pct));
  const advancing = returns.filter((value) => value !== null && value > 0).length;
  const declining = returns.filter((value) => value !== null && value < 0).length;
  const unchanged = returns.filter((value) => value === 0).length;
  const unknown = returns.filter((value) => value === null).length;
  return { advancing, declining, unchanged, unknown, status: unknown === rows.length ? "unavailable" : unknown ? "partial" : "available", source: "latest paper ranking proxy" };
}
function marketInsight(cards = [], breadth = {}) {
  const byKey = Object.fromEntries(cards.map((card) => [card.key, card]));
  const missingRequired = MARKET_CONTEXT_REQUIRED_KEYS.filter((key) => !byKey[key] || marketNumber(byKey[key].price) === null || marketNumber(byKey[key].change_pct) === null);
  if (missingRequired.length) return { bias: "DATA NEEDED", confidence: null, status: "unavailable", available: false, required_keys: [...MARKET_CONTEXT_REQUIRED_KEYS], missing_required: missingRequired, notes: ["Required index/VIX evidence unavailable: " + missingRequired.join(", ")] };
  const indexCards = MARKET_CONTEXT_REQUIRED_KEYS.filter((key) => key !== "indiavix").map((key) => byKey[key]);
  const positiveIndexes = indexCards.filter((card) => marketNumber(card.change_pct) > 0).length;
  const vix = byKey.indiavix;
  const gold = byKey.gold;
  const usd = byKey.usdinr;
  const vixChange = marketNumber(vix.change_pct);
  const bias = positiveIndexes >= 2 && vixChange <= 0 ? "Bullish" : positiveIndexes >= 2 ? "Constructive" : "Cautious";
  const notes = [];
  if (positiveIndexes >= 2) notes.push("index breadth supportive"); else notes.push("index confirmation weak");
  if (vixChange <= 0) notes.push("volatility easing"); else notes.push("volatility rising");
  if (marketNumber(gold?.change_pct) !== null && marketNumber(gold.change_pct) > 0) notes.push("gold bid shows risk hedge demand");
  if (marketNumber(usd?.change_pct) !== null && marketNumber(usd.change_pct) > 0) notes.push("USD/INR pressure visible");
  if (marketNumber(breadth.advancing) !== null && marketNumber(breadth.declining) !== null && breadth.advancing > breadth.declining) notes.push("paper universe momentum breadth positive");
  return { bias, confidence: Math.min(95, Math.max(35, 45 + positiveIndexes * 12 + (vixChange <= 0 ? 10 : -5))), notes, status: "available", available: true, required_keys: [...MARKET_CONTEXT_REQUIRED_KEYS], missing_required: [] };
}
async function marketContextCards() {
  const now = Date.now();
  const age = now - marketContextCache.at;
  if (marketContextCache.cards && age >= 0 && age < 120000) return marketContextCache;
  if (marketContextInFlight) return marketContextInFlight;
  const pending = (async () => {
    const results = await Promise.allSettled(MARKET_CONTEXT_SYMBOLS.map(fetchYahooMarketCard));
    const cards = results.map((result, index) => result.status === "fulfilled" ? result.value : { key: MARKET_CONTEXT_SYMBOLS[index].key, label: MARKET_CONTEXT_SYMBOLS[index].label, symbol: MARKET_CONTEXT_SYMBOLS[index].yahoo, group: MARKET_CONTEXT_SYMBOLS[index].group, price: null, previous_close: null, change: null, change_pct: null, tone: "neutral", spark: [], status: "unavailable", available: false, missing_fields: ["price", "previous_close", "change_pct"], source: "Yahoo Finance chart", error: result.reason?.message === "market_feed_timeout" ? "market_feed_timeout" : "market_feed_unavailable" });
    const value = { at: Date.now(), asOf: new Date().toISOString(), cards };
    // Only a completely usable provider wave is cached. Partial/failed waves
    // remain retryable on the next request; never cache state-derived breadth.
    marketContextCache = cards.every((card) => card.available) ? value : { at: 0, asOf: null, cards: null };
    return value;
  })();
  marketContextInFlight = pending;
  try { return await pending; }
  finally { if (marketContextInFlight === pending) marketContextInFlight = null; }
}
async function marketContextPayload(state = defaultState()) {
  const { cards, asOf } = await marketContextCards();
  const paperTrader = sanitizePaperTraderState(state.paperTrader || {});
  const breadth = buildMarketBreadth(state, paperTrader);
  const insight = marketInsight(cards, breadth);
  const availableCards = cards.filter((card) => card.available).length;
  const pricedCards = cards.filter((card) => card.price !== null).length;
  const status = availableCards === cards.length ? "available" : pricedCards ? "partial" : "unavailable";
  return { ok: status !== "unavailable", status, engine: MARKET_CONTEXT_VERSION, asOf, cards, breadth, insight, coverage: { available_cards: availableCards, priced_cards: pricedCards, total_cards: cards.length, missing_required: insight.missing_required }, feeds: ["Yahoo Finance chart API", "AshStocks paper ranking breadth proxy"], paper_only: true, live_orders: false };
}
`;
const MARKET_CONTEXT_ROUTES = String.raw`
      if (url.pathname === "/api/market-context") { const { state } = await readDashboardState(); json(res, 200, await marketContextPayload(state)); return; }
`;
export function applyMarketContextPatches(source, mustReplace) {
  let output = source;
  output = mustReplace(output, "\nasync function dataBankStatus() {", `\n${MARKET_CONTEXT_FUNCTIONS}\nasync function dataBankStatus() {`, "insert market context functions");
  output = mustReplace(output, '      if (url.pathname === "/api/paper-trader/parameters") {', `${MARKET_CONTEXT_ROUTES}\n      if (url.pathname === "/api/paper-trader/parameters") {`, "market context api route");
  return output;
}
