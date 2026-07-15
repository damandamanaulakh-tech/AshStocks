import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const cache = new Map();

function read(file) {
  if (cache.has(file)) return cache.get(file);
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${file}: missing file`);
    cache.set(file, "");
    return "";
  }
  const body = fs.readFileSync(fullPath, "utf8");
  cache.set(file, body);
  return body;
}

function mustInclude(file, text, reason = text) {
  if (!read(file).includes(text)) failures.push(`${file}: missing ${reason}`);
}

function mustMatch(file, regex, reason) {
  if (!regex.test(read(file))) failures.push(`${file}: missing ${reason}`);
}

function mustLoad(loader, asset) {
  mustInclude(loader, asset, `${asset} loader`);
}

for (const [file, checks] of Object.entries({
  "ASHSTOCKS_EXECUTION_GUARD.md": ["AshStocks is a broker-grade Indian market product", "A vs X Check", "Merge Check", "Candle Parameter Family"],
  "README.md": ["Indian/NSE", "Upstox historical daily candle fetch only", "No live orders"],
  "server.js": ["applyCandlePatternPatches", "applyPaperOrderLifecyclePatches", "applyUpstoxQuotePatches"],
  "server-upstox-quote-patch.mjs": ["UPSTOX_QUOTE_VERSION", "/api/upstox/quote", "UPSTOX_FULL_MARKET_QUOTE_URL", "Upstox Market Quote API", "authorization: \"Bearer \" + ENV.UPSTOX_ACCESS_TOKEN", "paper_only: true", "live_orders: false", "broker_write_enabled: false", "token_printed: false", "fetchUpstoxMarketQuotes", "normalizeUpstoxQuoteRow"],
  "server-paper-order-lifecycle-patch.mjs": ["PAPER_ORDER_LIFECYCLE_VERSION", "/api/paper-trader/order", "/api/paper-trader/orders", "broker_write_enabled: false"],
  "server-candle-pattern-patch.mjs": ["CANDLE_PATTERN_VERSION", "candlePatternAnalysis", "candle_patterns", "candle_score", "candle_status", "bullish_engulfing", "hammer_rejection", "near_252d_breakout", "volume_confirmation"],
  "app-upstox-symbol-workspace.js": ["#uwSymbolWorkspace", "Upstox-Style Symbol Workspace", "/api/scanner/run", "/api/upstox/quote", "/api/paper-trader/orders", "/api/paper-trader/order", "requestUpstoxQuote", "quoteStatusText", "UPSTOX_DEPTH", "candleSvg", "DATA_NEEDED: candle chart not available", "Paper BUY", "Paper SELL", "Paper GTT", "Selected Stock Ledger", "broker_write_enabled stays false"],
  "app-upstox-parameter-filter.js": ["TOTAL_PARAMETERS = 2000", "/api/data-intelligence", "/api/framework", "#uwParameterFilterPanel", "#uwBlockFilter", "#uwFamilyFilter", "#uwFeedFilter", "#uwParamNumber", "Filtered Candidates", "Candle Structure + Volume", "FII/DII Flow", "Entry Target Stop", "Paper Safety"],
  "app-upstox-parameter-keys.js": ["TOTAL_PARAMETERS = 2000", "#uwParameterKeyBoard", "1-2000 Parameter Board", "data-uw-param-key", "rule, source, evidence, pass line and engine impact", "Current evidence", "Pass line", "Engine impact", "Candle Structure + Volume", "Paper Safety", "DATA_NEEDED", "bullish engulfing", "hammer rejection", "near 252D breakout", "volume confirmation"],
  "app-upstox-parameter-exact-sync.js": ["data-uw-param-key", "#uwParamNumber", "exactParameter", "syncExactParameter"],
  "app-upstox-reasoning-dock.js": ["#uwReasoningDock", "/api/scanner/run", "/api/paper-trader/orders", "Reason, Verify, Execute", "Decision Evidence", "Parameter Gates", "Paper Execution", "broker_write_enabled: false"],
  "app-upstox-workspace.js": ["AshStocks x Upstox Workflow", "Paper Order Ticket", "Scanner to Trade Queue", "Parameter Piano Check", "Candle Structure", "api/scanner/run", "api/paper-trader/status", "api/market-context", "Live orders locked", "analyzeCandles"],
  "app-paper-order-lifecycle.js": ["/api/paper-trader/order", "Paper BUY", "Paper Order Book", "Paper SELL", "Paper GTT"],
  "app-broker-ledger-bridge.js": ["/api/paper-trader/orders", "/api/paper-trader/order", "#brokerOrdersView", "#brokerPositionsView", "#brokerGttView", "Paper BUY", "Paper SELL", "Paper GTT", "Order Book", "Trade Book", "Buying Power"],
  "app-broker-shell.js": ["Markets", "Watchlist", "Signals", "Orders", "Positions", "GTT", "Reports", "Settings"],
  "app-parameter-piano.js": ["parameter", "addEventListener"],
  "q1.html": ["Upstox"]
})) {
  for (const check of checks) mustInclude(file, check);
}

for (const asset of ["./broker-shell.css", "./app-broker-shell.js", "./app-broker-ledger-bridge.js", "./app-broker-nav-guard.js", "./app-parameter-piano.js"]) {
  mustLoad("index.html", asset);
}

for (const asset of [
  "./upstox-workspace.css",
  "./upstox-symbol-workspace.css",
  "./upstox-reasoning-dock.css",
  "./upstox-parameter-keys.css",
  "./app-upstox-workspace.js",
  "./app-upstox-symbol-workspace.js",
  "./app-candle-engine-bridge.js",
  "./app-parameter-piano-candle-bridge.js",
  "./app-paper-order-lifecycle.js",
  "./app-upstox-parameter-filter.js",
  "./app-upstox-parameter-keys.js",
  "./app-upstox-parameter-exact-sync.js",
  "./app-upstox-reasoning-dock.js",
  "./app-upstox-autostart.js"
]) {
  mustLoad("app-broker-nav-guard.js", asset);
}

mustMatch("server-upstox-quote-patch.mjs", /\/api\/upstox\/quote[\s\S]*GET[\s\S]*POST/, "Upstox quote GET/POST route");
mustMatch("server-upstox-quote-patch.mjs", /paper_only: true[\s\S]*live_orders: false[\s\S]*broker_write_enabled: false/, "Upstox quote safety lock");
mustMatch("server-paper-order-lifecycle-patch.mjs", /orders.*trades.*gtt|gtt.*trades.*orders/s, "orders/trades/GTT ledger fields");
mustMatch("server-paper-order-lifecycle-patch.mjs", /PAPER_BUY_FILLED|PAPER_SELL_FILLED|PAPER_GTT_CREATED/, "paper order lifecycle actions");
mustMatch("app-upstox-symbol-workspace.js", /normalizeCandles[\s\S]*candleSvg[\s\S]*svg/, "symbol candle chart from scanner candles");
mustMatch("app-upstox-symbol-workspace.js", /\/api\/upstox\/quote[\s\S]*fetch\(url\)/, "symbol workspace Upstox quote fetch");
mustMatch("app-upstox-symbol-workspace.js", /fetch\("\/api\/paper-trader\/order"[\s\S]*source: "upstox-symbol-workspace"/, "symbol workspace paper order post");
mustMatch("app-upstox-parameter-exact-sync.js", /setTimeout\(\(\) => syncExactParameter\(parameterNumber\), 0\)/, "post-click exact parameter sync");

if (failures.length) {
  console.error("AshStocks execution guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AshStocks execution guard passed.");
