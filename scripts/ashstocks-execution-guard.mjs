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

mustInclude("ASHSTOCKS_EXECUTION_GUARD.md", "AshStocks is a broker-grade Indian market product", "confirmed product rule");
mustInclude("ASHSTOCKS_EXECUTION_GUARD.md", "A vs X Check", "asked-vs-delivered check");
mustInclude("ASHSTOCKS_EXECUTION_GUARD.md", "Merge Check", "merge-vs-add check");
mustInclude("ASHSTOCKS_EXECUTION_GUARD.md", "Candle Parameter Family", "candle parameter contract");

mustInclude("README.md", "Indian/NSE", "India/NSE product scope");
mustInclude("README.md", "Upstox historical daily candle fetch only", "Upstox historical candle contract");
mustInclude("README.md", "No live orders", "live order lock contract");

for (const asset of [
  "./broker-shell.css",
  "./app-broker-shell.js",
  "./app-broker-ledger-bridge.js",
  "./app-broker-nav-guard.js",
  "./app-parameter-piano.js"
]) mustLoad("index.html", asset);

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
]) mustLoad("app-broker-nav-guard.js", asset);

for (const [file, checks] of Object.entries({
  "server.js": ["applyCandlePatternPatches", "applyPaperOrderLifecyclePatches"],
  "server-paper-order-lifecycle-patch.mjs": ["PAPER_ORDER_LIFECYCLE_VERSION", "/api/paper-trader/order", "/api/paper-trader/orders", "broker_write_enabled: false"],
  "server-candle-pattern-patch.mjs": ["CANDLE_PATTERN_VERSION", "candlePatternAnalysis", "candle_patterns", "candle_score", "candle_status"],
  "app-candle-engine-bridge.js": ["candle_engine", "candle_score", "candle_patterns"],
  "app-parameter-piano-candle-bridge.js": ["Candle Structure + Volume", "candle_evidence", "candle_score"],
  "app-paper-order-lifecycle.js": ["/api/paper-trader/order", "Paper BUY", "Paper Order Book", "Paper SELL", "Paper GTT"],
  "app-broker-ledger-bridge.js": ["/api/paper-trader/orders", "/api/paper-trader/order", "#brokerOrdersView", "#brokerPositionsView", "#brokerGttView", "Paper BUY", "Paper SELL", "Paper GTT", "Order Book", "Trade Book", "Buying Power"],
  "app-upstox-symbol-workspace.js": ["#uwSymbolWorkspace", "Upstox-Style Symbol Workspace", "/api/scanner/run", "/api/paper-trader/orders", "/api/paper-trader/order", "candleSvg", "DATA_NEEDED: candle chart not available", "Exchange depth not wired", "Paper BUY", "Paper SELL", "Paper GTT", "Selected Stock Ledger", "broker_write_enabled stays false"],
  "app-upstox-parameter-filter.js": ["TOTAL_PARAMETERS = 2000", "/api/data-intelligence", "/api/framework", "#uwParameterFilterPanel", "#uwBlockFilter", "#uwFamilyFilter", "#uwFeedFilter", "#uwParamNumber", "Filtered Candidates"],
  "app-upstox-parameter-keys.js": ["TOTAL_PARAMETERS = 2000", "#uwParameterKeyBoard", "1-2000 Parameter Board", "data-uw-param-key", "rule, source, evidence, pass line and engine impact", "syncExistingFilter", "Candle Structure + Volume", "Paper Safety", "DATA_NEEDED"],
  "app-upstox-parameter-exact-sync.js": ["data-uw-param-key", "#uwParamNumber", "exactParameter", "syncExactParameter"],
  "app-upstox-reasoning-dock.js": ["#uwReasoningDock", "/api/scanner/run", "/api/paper-trader/orders", "Reason, Verify, Execute", "intelligence", "advisor", "candle", "DATA_NEEDED", "broker_write_enabled: false"],
  "app-upstox-workspace.js": ["AshStocks x Upstox Workflow", "Paper Order Ticket", "Scanner to Trade Queue", "Parameter Piano Check", "Candle Structure", "api/scanner/run", "api/paper-trader/status", "api/market-context", "Live orders locked"],
  "app-upstox-autostart.js": ["ashstocks-workspace-scan-warmed", "runScanBtn", "data-ash-workspace"],
  "upstox-symbol-workspace.css": [".uw-symbol-workspace", ".uw-symbol-chart", ".uw-depth-box", ".uw-paper-actions", ".uw-symbol-ledger"],
  "upstox-parameter-keys.css": [".uw-parameter-keyboard", ".uw-param-key", ".uw-param-key-family", ".uw-parameter-key-detail"],
  "upstox-reasoning-dock.css": [".uw-reasoning-dock", ".uw-reason-grid", ".uw-reason-checklist", ".uw-reason-verdict"],
  "upstox-workspace.css": ["uw-parameter-filter-panel", "uw-param-controls", "uw-param-blocks"],
  "q1.html": ["Upstox"]
})) {
  for (const check of checks) mustInclude(file, check);
}

mustMatch("server-paper-order-lifecycle-patch.mjs", /orders.*trades.*gtt|gtt.*trades.*orders/s, "orders/trades/GTT ledger fields");
mustMatch("server-paper-order-lifecycle-patch.mjs", /PAPER_BUY_FILLED|PAPER_SELL_FILLED|PAPER_GTT_CREATED/, "paper order lifecycle actions");
mustMatch("server-candle-pattern-patch.mjs", /bullish_engulfing|hammer_rejection|near_252d_breakout|inside_bar|volume_confirmation/, "server candle pattern names");
mustMatch("app-upstox-symbol-workspace.js", /normalizeCandles[\s\S]*candleSvg[\s\S]*svg/, "symbol candle chart from scanner candles");
mustMatch("app-upstox-symbol-workspace.js", /Exchange depth not wired[\s\S]*DATA_NEEDED/, "truthful missing market depth state");
mustMatch("app-upstox-symbol-workspace.js", /fetch\("\/api\/paper-trader\/order"[\s\S]*source: "upstox-symbol-workspace"/, "symbol workspace paper order post");
mustMatch("app-upstox-parameter-filter.js", /Candle Structure \+ Volume|FII\/DII Flow|Entry Target Stop|Paper Safety/, "key AshStocks parameter families in Upstox filter");
mustMatch("app-upstox-parameter-filter.js", /familyScore|rowEvidence|evidenceStatus/, "real row evidence scoring in Upstox filter");
mustMatch("app-upstox-parameter-keys.js", /addEventListener\("click"[\s\S]*data-uw-param-key/, "clickable Upstox parameter keys");
mustMatch("app-upstox-parameter-keys.js", /Current evidence|Pass line|Engine impact|Framework block|Selected stock/, "non-placeholder parameter detail fields");
mustMatch("app-upstox-parameter-keys.js", /bullish engulfing|hammer rejection|near 252D breakout|volume confirmation/, "candle rules in Upstox parameter board");
mustMatch("app-upstox-parameter-exact-sync.js", /setTimeout\(\(\) => syncExactParameter\(parameterNumber\), 0\)/, "post-click exact parameter sync");
mustMatch("app-upstox-reasoning-dock.js", /Decision Evidence|Parameter Gates|Paper Execution/, "reasoning dock sections");
mustMatch("app-upstox-reasoning-dock.js", /entry_zone|target1|target2|stop|exit_rule|parameters_used/, "advisor execution contract in dock");
mustMatch("app-upstox-workspace.js", /analyzeCandles|bullish engulfing|hammer rejection|near 252D breakout/, "browser fallback candle analysis");
mustMatch("app-broker-shell.js", /Markets|Watchlist|Signals|Orders|Positions|GTT|Reports|Settings/s, "broker workflow views");
mustMatch("app-broker-shell.js", /paper/i, "paper execution wording");
mustMatch("app-broker-shell.js", /buy|sell|order/i, "order workflow wording");
mustMatch("app-broker-shell.js", /gtt|target|stop/i, "target/stop or GTT workflow wording");
mustMatch("app-parameter-piano.js", /click|addEventListener/i, "clickable Parameter Piano behavior");
mustMatch("app-parameter-piano.js", /parameter/i, "parameter detail behavior");

if (failures.length) {
  console.error("AshStocks execution guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AshStocks execution guard passed.");
