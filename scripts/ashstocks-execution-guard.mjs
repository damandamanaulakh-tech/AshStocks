import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(file) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${file}: missing file`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function mustInclude(file, text, reason) {
  const body = read(file);
  if (!body.includes(text)) failures.push(`${file}: missing ${reason || text}`);
}

function mustMatch(file, regex, reason) {
  const body = read(file);
  if (!regex.test(body)) failures.push(`${file}: missing ${reason}`);
}

mustInclude("ASHSTOCKS_EXECUTION_GUARD.md", "AshStocks is a broker-grade Indian market product", "confirmed product rule");
mustInclude("ASHSTOCKS_EXECUTION_GUARD.md", "Candle Parameter Family", "candle parameter contract");
mustInclude("ASHSTOCKS_EXECUTION_GUARD.md", "A vs X Check", "asked-vs-delivered check");
mustInclude("ASHSTOCKS_EXECUTION_GUARD.md", "Merge Check", "merge-vs-add check");

mustInclude("README.md", "Indian/NSE", "India/NSE product scope");
mustInclude("README.md", "Upstox historical daily candle fetch only", "Upstox historical candle contract");
mustInclude("README.md", "No live orders", "live order lock contract");

mustInclude("index.html", "./broker-shell.css", "broker shell CSS");
mustInclude("index.html", "./app-broker-shell.js", "broker shell script");
mustInclude("index.html", "./app-broker-ledger-bridge.js", "real broker ledger bridge script");
mustInclude("index.html", "./app-broker-nav-guard.js", "broker nav guard script");
mustInclude("index.html", "./app-parameter-piano.js", "Parameter Piano script");
mustInclude("app-broker-nav-guard.js", "./app-upstox-workspace.js", "merged Upstox workspace loader");
mustInclude("app-broker-nav-guard.js", "./app-candle-engine-bridge.js", "server candle bridge loader");
mustInclude("app-broker-nav-guard.js", "./app-parameter-piano-candle-bridge.js", "Parameter Piano candle bridge loader");
mustInclude("app-broker-nav-guard.js", "./app-paper-order-lifecycle.js", "paper order lifecycle UI loader");
mustInclude("app-broker-nav-guard.js", "./app-upstox-parameter-filter.js", "Upstox parameter filter bridge loader");
mustInclude("app-broker-nav-guard.js", "./app-upstox-autostart.js", "merged dashboard autostart loader");
mustInclude("app-broker-nav-guard.js", "./upstox-workspace.css", "merged Upstox workspace stylesheet loader");

mustInclude("server.js", "applyCandlePatternPatches", "server candle pattern patch wiring");
mustInclude("server.js", "applyPaperOrderLifecyclePatches", "paper order lifecycle patch wiring");
mustInclude("server-paper-order-lifecycle-patch.mjs", "PAPER_ORDER_LIFECYCLE_VERSION", "paper order lifecycle version");
mustInclude("server-paper-order-lifecycle-patch.mjs", "/api/paper-trader/order", "paper order endpoint");
mustInclude("server-paper-order-lifecycle-patch.mjs", "/api/paper-trader/orders", "paper orders ledger endpoint");
mustMatch("server-paper-order-lifecycle-patch.mjs", /orders.*trades.*gtt|gtt.*trades.*orders/s, "orders/trades/GTT ledger fields");
mustMatch("server-paper-order-lifecycle-patch.mjs", /PAPER_BUY_FILLED|PAPER_SELL_FILLED|PAPER_GTT_CREATED/, "paper order lifecycle actions");
mustMatch("server-paper-order-lifecycle-patch.mjs", /broker_write_enabled:\s*false/, "broker write lock in paper lifecycle");
mustInclude("server-candle-pattern-patch.mjs", "CANDLE_PATTERN_VERSION", "server candle pattern version");
mustInclude("server-candle-pattern-patch.mjs", "candlePatternAnalysis", "server candle pattern analysis function");
mustInclude("server-candle-pattern-patch.mjs", "candle_patterns", "scanner row candle pattern output");
mustInclude("server-candle-pattern-patch.mjs", "candle_score", "scanner row candle score output");
mustInclude("server-candle-pattern-patch.mjs", "candle_status", "scanner row candle status output");
mustMatch("server-candle-pattern-patch.mjs", /bullish_engulfing|hammer_rejection|near_252d_breakout|inside_bar|volume_confirmation/, "server candle pattern names");

mustInclude("app-candle-engine-bridge.js", "candle_engine", "server candle engine UI bridge");
mustInclude("app-candle-engine-bridge.js", "candle_score", "server candle score UI bridge");
mustInclude("app-candle-engine-bridge.js", "candle_patterns", "server candle patterns UI bridge");
mustInclude("app-parameter-piano-candle-bridge.js", "Candle Structure + Volume", "old Parameter Piano candle relabel");
mustInclude("app-parameter-piano-candle-bridge.js", "candle_evidence", "old Parameter Piano server candle evidence");
mustInclude("app-parameter-piano-candle-bridge.js", "candle_score", "old Parameter Piano server candle score");

mustInclude("app-paper-order-lifecycle.js", "/api/paper-trader/order", "paper order action post");
mustInclude("app-paper-order-lifecycle.js", "Paper BUY", "paper buy button action text");
mustInclude("app-paper-order-lifecycle.js", "Paper Order Book", "paper order book visible in dashboard");
mustMatch("app-paper-order-lifecycle.js", /SELL|GTT/, "paper sell and GTT actions");
mustMatch("app-paper-order-lifecycle.js", /broker write path remains locked|broker_write_enabled/, "paper UI live-order lock");

mustInclude("app-broker-ledger-bridge.js", "/api/paper-trader/orders", "broker tabs real paper ledger endpoint");
mustInclude("app-broker-ledger-bridge.js", "/api/paper-trader/order", "broker tabs paper order endpoint");
mustInclude("app-broker-ledger-bridge.js", "#brokerOrdersView", "broker Orders tab bridge");
mustInclude("app-broker-ledger-bridge.js", "#brokerPositionsView", "broker Positions tab bridge");
mustInclude("app-broker-ledger-bridge.js", "#brokerGttView", "broker GTT tab bridge");
mustInclude("app-broker-ledger-bridge.js", "Paper BUY", "broker tab paper buy action");
mustInclude("app-broker-ledger-bridge.js", "Paper SELL", "broker tab paper sell action");
mustInclude("app-broker-ledger-bridge.js", "Paper GTT", "broker tab paper GTT action");
mustMatch("app-broker-ledger-bridge.js", /Order Book|Trade Book|Buying Power/, "broker ledger visible sections");

mustInclude("app-upstox-parameter-filter.js", "TOTAL_PARAMETERS = 2000", "2000-key parameter filter scope");
mustInclude("app-upstox-parameter-filter.js", "/api/data-intelligence", "data intelligence source in Upstox filters");
mustInclude("app-upstox-parameter-filter.js", "/api/framework", "framework source in Upstox filters");
mustInclude("app-upstox-parameter-filter.js", "#uwParameterFilterPanel", "Upstox parameter filter panel");
mustInclude("app-upstox-parameter-filter.js", "#uwBlockFilter", "framework block filter control");
mustInclude("app-upstox-parameter-filter.js", "#uwFamilyFilter", "parameter family filter control");
mustInclude("app-upstox-parameter-filter.js", "#uwFeedFilter", "feed status filter control");
mustInclude("app-upstox-parameter-filter.js", "#uwParamNumber", "parameter number control");
mustInclude("app-upstox-parameter-filter.js", "Filtered Candidates", "filtered candidate table");
mustMatch("app-upstox-parameter-filter.js", /Candle Structure \+ Volume|FII\/DII Flow|Entry Target Stop|Paper Safety/, "key AshStocks parameter families in Upstox filter");
mustMatch("app-upstox-parameter-filter.js", /familyScore|rowEvidence|evidenceStatus/, "real row evidence scoring in Upstox filter");

mustInclude("app-upstox-autostart.js", "ashstocks-workspace-scan-warmed", "single warm scanner guard");
mustInclude("app-upstox-autostart.js", "runScanBtn", "scanner warm-up button bridge");
mustInclude("app-upstox-autostart.js", "data-ash-workspace", "dashboard activation bridge");

mustInclude("app-upstox-workspace.js", "AshStocks x Upstox Workflow", "merged dashboard label");
mustInclude("app-upstox-workspace.js", "Paper Order Ticket", "paper order ticket in merged workspace");
mustInclude("app-upstox-workspace.js", "Scanner to Trade Queue", "scanner-to-trade queue");
mustInclude("app-upstox-workspace.js", "Parameter Piano Check", "parameter piano quick check");
mustInclude("app-upstox-workspace.js", "Candle Structure", "candle structure workspace block");
mustMatch("app-upstox-workspace.js", /api\/scanner\/run/, "scanner payload bridge");
mustMatch("app-upstox-workspace.js", /api\/paper-trader\/status/, "paper status bridge");
mustMatch("app-upstox-workspace.js", /api\/market-context/, "market context bridge");
mustMatch("app-upstox-workspace.js", /analyzeCandles|bullish engulfing|hammer rejection|near 252D breakout/, "browser fallback candle analysis");
mustMatch("app-upstox-workspace.js", /Live orders locked|Live broker order path is locked/, "live order lock in merged workspace");

mustMatch("upstox-workspace.css", /uw-parameter-filter-panel|uw-param-controls|uw-param-blocks/, "Upstox parameter filter styling");

for (const label of ["Markets", "Watchlist", "Signals", "Orders", "Positions", "GTT", "Reports", "Settings"]) {
  mustInclude("app-broker-shell.js", `label: "${label}"`, `${label} broker workflow view`);
}

mustMatch("app-broker-shell.js", /paper/i, "paper execution wording");
mustMatch("app-broker-shell.js", /buy|sell|order/i, "order workflow wording");
mustMatch("app-broker-shell.js", /gtt|target|stop/i, "target/stop or GTT workflow wording");

mustMatch("app-parameter-piano.js", /click|addEventListener/i, "clickable Parameter Piano behavior");
mustMatch("app-parameter-piano.js", /parameter/i, "parameter detail behavior");

mustMatch("q1.html", /Upstox/i, "Q1 Upstox source label");

if (failures.length) {
  console.error("AshStocks execution guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AshStocks execution guard passed.");
