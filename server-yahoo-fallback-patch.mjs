const YAHOO_FALLBACK_FUNCTIONS = String.raw`
const YAHOO_NSE_FALLBACK_VERSION = "ashstocks-yahoo-nse-fallback-v0.1";
const YAHOO_FALLBACK_PRIORITY = Object.freeze([
  "RELIANCE", "HDFCBANK", "ICICIBANK", "INFY", "TCS", "SBIN", "BHARTIARTL", "LT", "AXISBANK", "KOTAKBANK",
  "ITC", "HINDUNILVR", "BAJFINANCE", "MARUTI", "SUNPHARMA", "M&M", "NTPC", "POWERGRID", "TATAMOTORS", "ADANIENT",
  "ADANIPORTS", "ONGC", "COALINDIA", "ASIANPAINT", "HCLTECH", "WIPRO", "TITAN", "TRENT", "HAL", "BEL",
  "BHEL", "ABB", "SIEMENS", "POLYCAB", "PERSISTENT", "COFORGE", "IRFC", "RVNL", "TATAPOWER", "JIOFIN"
]);
function yahooNseSymbol(symbol = "") {
  return String(symbol).trim().toUpperCase().replace(/&/g, "%26") + ".NS";
}
function yahooFallbackRows(universe, limit = 60) {
  const rows = normalizeScannerUniverse(universe);
  const rank = new Map(YAHOO_FALLBACK_PRIORITY.map((symbol, index) => [symbol, index]));
  return rows
    .filter((row) => row.symbol && !/ETF|BEES|LIQUID|GILT|SDL|TBILL|BOND/i.test(String(row.symbol + " " + row.name)))
    .sort((a, b) => (rank.get(a.symbol) ?? 10000) - (rank.get(b.symbol) ?? 10000) || a.symbol.localeCompare(b.symbol))
    .slice(0, limit);
}
async function fetchYahooNseCandles(row) {
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - 470 * 24 * 60 * 60;
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + yahooNseSymbol(row.symbol) + "?period1=" + fromSec + "&period2=" + nowSec + "&interval=1d&events=history";
  const response = await fetch(url, { headers: { "user-agent": "ashstocks-yahoo-fallback" } });
  if (!response.ok) throw new Error("Yahoo " + response.status);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const candles = timestamps.map((ts, index) => ({
    date: new Date(Number(ts) * 1000).toISOString().slice(0, 10),
    open: numericValue(quote.open?.[index]),
    high: numericValue(quote.high?.[index]),
    low: numericValue(quote.low?.[index]),
    close: numericValue(quote.close?.[index]),
    volume: numericValue(quote.volume?.[index])
  })).filter((candle) => Number.isFinite(candle.close));
  return candles;
}
async function runYahooNseFallbackScanner(universe, body = {}) {
  const limit = Math.min(80, Math.max(20, Math.floor(finiteOr(body.yahooLimit ?? body.yahoo_limit, 60))));
  const baseRows = yahooFallbackRows(universe, limit);
  const enriched = [];
  const failures = [];
  for (const row of baseRows) {
    try {
      const candles = await fetchYahooNseCandles(row);
      enriched.push({ ...row, candles, data_source: "Yahoo Finance NSE fallback", fetch_error: candles.length < 120 ? "short Yahoo candle history" : "" });
    } catch (error) {
      failures.push({ symbol: row.symbol, error: error.message });
      enriched.push({ ...row, candles: [], data_source: "Yahoo Finance NSE fallback", fetch_error: error.message });
    }
  }
  const scan = runScanner(enriched, { ...(body.settings || {}), source: "Yahoo Finance NSE fallback", holdings: body.holdings || [] });
  return { ...scan, source: "Yahoo Finance NSE fallback", fallback: { engine: YAHOO_NSE_FALLBACK_VERSION, attempted: baseRows.length, failures: failures.slice(0, 30) } };
}
`;
export function applyYahooFallbackPatches(source, mustReplace) {
  let output = source;
  output = mustReplace(output, '\nconst PAPER_TRADER_ROUTES = String.raw`', `\n${YAHOO_FALLBACK_FUNCTIONS}\nconst PAPER_TRADER_ROUTES = String.raw\``, 'insert yahoo fallback helpers');
  output = mustReplace(output, '        if (!scan || scan.ok === false) scan = runScanner(resolved.universe, { ...(body.settings || {}), source: resolved.source, holdings: body.holdings || state.paperTrader?.positions || [] });\n        const ledger = await appendScanLedger(scan, { store, mode: "paper-trader-scan", source: scan.source || resolved.source });\n        const plan = buildPaperTraderPlan(scan, state, body);', '        if (!scan || scan.ok === false) scan = runScanner(resolved.universe, { ...(body.settings || {}), source: resolved.source, holdings: body.holdings || state.paperTrader?.positions || [] });\n        let plan = buildPaperTraderPlan(scan, state, body);\n        if ((plan.summary?.buy_queue || 0) === 0 && body.useYahooFallback !== false) {\n          const fallbackScan = await runYahooNseFallbackScanner(resolved.universe, { ...body, holdings: body.holdings || state.paperTrader?.positions || [] });\n          const fallbackPlan = buildPaperTraderPlan(fallbackScan, state, body);\n          if ((fallbackPlan.summary?.buy_queue || 0) > (plan.summary?.buy_queue || 0)) {\n            scan = fallbackScan;\n            plan = { ...fallbackPlan, fallback_used: "Yahoo Finance NSE fallback" };\n          }\n        }\n        const ledger = await appendScanLedger(scan, { store, mode: "paper-trader-scan", source: scan.source || resolved.source });', 'advisor yahoo fallback when empty');
  return output;
}
