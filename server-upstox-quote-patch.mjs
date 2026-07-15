const UPSTOX_QUOTE_FUNCTIONS = String.raw`
const UPSTOX_QUOTE_VERSION = "ashstocks-upstox-quote-v0.1";
const UPSTOX_FULL_MARKET_QUOTE_URL = "https://api.upstox.com/v2/market-quote/quotes";
const UPSTOX_QUOTE_CACHE_MS = 15000;
let upstoxQuoteCache = { at: 0, key: "", payload: null };

function upstoxQuotePublicStatus() {
  return {
    version: UPSTOX_QUOTE_VERSION,
    provider: "Upstox Market Quote API",
    endpoint: UPSTOX_FULL_MARKET_QUOTE_URL + "?instrument_key=...",
    token_visible: Boolean(ENV.UPSTOX_ACCESS_TOKEN),
    api_key_visible: Boolean(ENV.UPSTOX_API_KEY || ENV.UPSTOX_CLIENT_ID),
    cache_ms: UPSTOX_QUOTE_CACHE_MS,
    paper_only: true,
    live_orders: false,
    broker_write_enabled: false,
    token_printed: false
  };
}

function quoteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeQuoteKeys(input = []) {
  const keys = [];
  for (const value of input) {
    for (const part of String(value || "").split(",")) {
      const key = part.trim();
      if (key && !keys.includes(key)) keys.push(key);
    }
  }
  return keys.slice(0, 50);
}

function normalizeDepthRows(rows = []) {
  return Array.isArray(rows) ? rows.slice(0, 10).map((row) => ({
    price: quoteNumber(row.price || row.rate || row.bid_price || row.ask_price),
    quantity: quoteNumber(row.quantity || row.qty || row.bid_qty || row.ask_qty),
    orders: quoteNumber(row.orders || row.order_count || row.no_of_orders)
  })).filter((row) => row.price !== null) : [];
}

function normalizeUpstoxQuoteRow(raw = {}, requestedKey = "") {
  const ohlc = raw.ohlc || raw.OHLC || {};
  const depth = raw.depth || raw.market_depth || {};
  const bids = normalizeDepthRows(depth.buy || depth.bids || depth.bid || raw.bids || []);
  const asks = normalizeDepthRows(depth.sell || depth.asks || depth.ask || raw.asks || []);
  const ltp = quoteNumber(raw.last_price ?? raw.ltp ?? raw.LTP ?? raw.close);
  const close = quoteNumber(ohlc.close ?? raw.close);
  const open = quoteNumber(ohlc.open ?? raw.open);
  const high = quoteNumber(ohlc.high ?? raw.high);
  const low = quoteNumber(ohlc.low ?? raw.low);
  return {
    instrument_key: raw.instrument_key || raw.instrument_token || raw.instrumentKey || requestedKey,
    trading_symbol: raw.trading_symbol || raw.tradingsymbol || raw.symbol || "",
    exchange: raw.exchange || "NSE",
    source: "Upstox Market Quote API",
    timestamp: raw.timestamp || raw.last_trade_time || raw.ltt || null,
    last_price: ltp,
    close,
    open,
    high,
    low,
    change: quoteNumber(raw.net_change ?? raw.change),
    change_pct: quoteNumber(raw.oi_day_change_percentage ?? raw.change_pct ?? raw.change_percent),
    volume: quoteNumber(raw.volume || raw.volume_traded || raw.volume_traded_today),
    average_price: quoteNumber(raw.average_price || raw.avg_price),
    total_buy_quantity: quoteNumber(raw.total_buy_quantity || raw.total_buy_qty),
    total_sell_quantity: quoteNumber(raw.total_sell_quantity || raw.total_sell_qty),
    lower_circuit_limit: quoteNumber(raw.lower_circuit_limit),
    upper_circuit_limit: quoteNumber(raw.upper_circuit_limit),
    depth: { bids, asks },
    depth_available: bids.length > 0 || asks.length > 0,
    raw_fields: Object.keys(raw).slice(0, 40)
  };
}

async function resolveUpstoxQuoteInput(url, body = {}) {
  const queryKeys = [
    ...url.searchParams.getAll("instrument_key"),
    ...url.searchParams.getAll("instrument_keys")
  ];
  const bodyKeys = Array.isArray(body.instrument_keys) ? body.instrument_keys : [body.instrument_key, body.instrument_keys];
  const keys = normalizeQuoteKeys([...queryKeys, ...bodyKeys]);
  const symbol = normalizeSymbol(body.symbol || url.searchParams.get("symbol") || "");
  if (!symbol || keys.length) return { keys, symbol };

  const store = await getStore();
  const state = await store.getState();
  const universe = normalizeScannerUniverse(state.universe || state.saved_universe || state.data_bank?.universe || []);
  const row = universe.find((item) => normalizeSymbol(item.symbol) === symbol || normalizeSymbol(item.trading_symbol) === symbol);
  if (row?.instrument_key && !keys.includes(row.instrument_key)) keys.push(row.instrument_key);
  return { keys, symbol };
}

async function fetchUpstoxMarketQuotes(keys = []) {
  const instrumentKeys = normalizeQuoteKeys(keys);
  if (!instrumentKeys.length) throw new Error("instrument_key_required");
  if (!ENV.UPSTOX_ACCESS_TOKEN) throw new Error("upstox_token_missing");
  const cacheKey = instrumentKeys.join(",");
  if (upstoxQuoteCache.payload && upstoxQuoteCache.key === cacheKey && Date.now() - upstoxQuoteCache.at < UPSTOX_QUOTE_CACHE_MS) {
    return upstoxQuoteCache.payload;
  }
  const query = instrumentKeys.map((key) => encodeURIComponent(key)).join(",");
  const response = await fetch(UPSTOX_FULL_MARKET_QUOTE_URL + "?instrument_key=" + query, {
    headers: {
      accept: "application/json",
      authorization: "Bearer " + ENV.UPSTOX_ACCESS_TOKEN
    }
  });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch (_) {}
  if (!response.ok) {
    const detail = payload?.errors?.[0]?.message || payload?.message || text.slice(0, 220);
    throw new Error("Upstox quote " + response.status + ": " + detail);
  }
  const data = payload?.data || {};
  const values = Array.isArray(data) ? data : Object.entries(data).map(([key, value]) => ({ key, value }));
  const quotes = values.map((entry, index) => {
    const raw = entry?.value || entry || {};
    return normalizeUpstoxQuoteRow(raw, raw.instrument_key || raw.instrument_token || entry?.key || instrumentKeys[index] || "");
  });
  const result = {
    ok: true,
    version: UPSTOX_QUOTE_VERSION,
    provider: "Upstox Market Quote API",
    asOf: new Date().toISOString(),
    quotes,
    failures: instrumentKeys.filter((key) => !quotes.some((quote) => quote.instrument_key === key || quote.instrument_key === key.replace("|", ":"))),
    safety: { paper_only: true, live_orders: false, broker_write_enabled: false, token_printed: false },
    status: upstoxQuotePublicStatus()
  };
  upstoxQuoteCache = { at: Date.now(), key: cacheKey, payload: result };
  return result;
}

async function upstoxQuoteResponse(url, req) {
  let body = {};
  if (req.method === "POST") body = await readJsonBody(req);
  const input = await resolveUpstoxQuoteInput(url, body);
  if (!input.keys.length) {
    return {
      ok: false,
      error: "instrument_key_required",
      symbol: input.symbol,
      message: "Run NSE Master first or pass instrument_key=NSE_EQ|...",
      status: upstoxQuotePublicStatus(),
      safety: { paper_only: true, live_orders: false, broker_write_enabled: false, token_printed: false }
    };
  }
  try {
    const payload = await fetchUpstoxMarketQuotes(input.keys);
    return { ...payload, symbol: input.symbol, requested_keys: input.keys };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      symbol: input.symbol,
      requested_keys: input.keys,
      quotes: [],
      failures: input.keys,
      status: upstoxQuotePublicStatus(),
      safety: { paper_only: true, live_orders: false, broker_write_enabled: false, token_printed: false }
    };
  }
}
`;

const UPSTOX_QUOTE_ROUTES = String.raw`
      if (url.pathname === "/api/upstox/quote") {
        if (!["GET", "POST"].includes(req.method)) {
          json(res, 405, { ok: false, error: "method_not_allowed", allowed: ["GET", "POST"] });
          return;
        }
        const payload = await upstoxQuoteResponse(url, req);
        json(res, payload.ok === false ? 502 : 200, payload);
        return;
      }
`;

export function applyUpstoxQuotePatches(source, mustReplace) {
  let output = source;
  output = mustReplace(
    output,
    "\nasync function dataBankStatus() {",
    `${UPSTOX_QUOTE_FUNCTIONS}\nasync function dataBankStatus() {`,
    "upstox quote functions"
  );
  output = mustReplace(
    output,
    '      if (url.pathname === "/api/upstox/status") {',
    `${UPSTOX_QUOTE_ROUTES}\n      if (url.pathname === "/api/upstox/status") {`,
    "upstox quote route"
  );
  return output;
}
