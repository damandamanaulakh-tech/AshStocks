import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    failures.push(`${file}: missing`);
    return "";
  }
  return fs.readFileSync(full, "utf8");
}

function mustInclude(file, text, reason = text) {
  if (!read(file).includes(text)) failures.push(`${file}: missing ${reason}`);
}

function mustMatch(file, regex, reason) {
  if (!regex.test(read(file))) failures.push(`${file}: missing ${reason}`);
}

mustInclude("app-broker-nav-guard.js", "./ashstocks-trading-terminal.css", "Trading terminal stylesheet loader");
mustInclude("app-broker-nav-guard.js", "./ashstocks-terminal-inspector.css", "Terminal inspector stylesheet loader");
mustInclude("app-broker-nav-guard.js", "./ashstocks-terminal-reasoning.css", "Terminal reasoning stylesheet loader");
mustInclude("app-broker-nav-guard.js", "./ashstocks-terminal-depth-risk.css", "Terminal depth/risk stylesheet loader");
mustInclude("app-broker-nav-guard.js", "./app-ashstocks-trading-terminal.js", "Trading terminal script loader");
mustInclude("app-broker-nav-guard.js", "./app-ashstocks-terminal-inspector.js", "Terminal inspector script loader");
mustInclude("app-broker-nav-guard.js", "./app-ashstocks-terminal-reasoning.js", "Terminal reasoning script loader");
mustInclude("app-broker-nav-guard.js", "./app-ashstocks-terminal-depth-risk.js", "Terminal depth/risk script loader");
mustInclude("app-broker-nav-guard.js", "[data-ash-terminal-panel]", "Terminal panel close handling");
mustInclude("app-broker-nav-guard.js", "[data-ash-terminal-nav]", "Terminal nav close handling");

for (const text of [
  "#ashTradingTerminalView",
  "data-ash-terminal-nav",
  "Broker-Grade Paper Terminal",
  "Market Watch",
  "Paper Order Ticket",
  "Parameter Proof",
  "Orders / Trades / GTT",
  "/api/ready",
  "/api/market-context",
  "/api/scanner/run",
  "/api/scanner/run-upstox",
  "/api/upstox/quote",
  "/api/paper-trader/orders",
  "/api/paper-trader/order",
  "paper_only: true",
  "broker_write_enabled: false",
  "source: \"ashstocks-trading-terminal\"",
  "P681",
  "P683",
  "P686",
  "P688",
  "P1701",
  "DATA_NEEDED: Upstox daily candles",
  "Real money broker order is locked by product rule"
]) {
  mustInclude("app-ashstocks-trading-terminal.js", text);
}

for (const text of [
  ".ash-trading-terminal",
  ".terminal-layout",
  ".terminal-market-strip",
  ".terminal-watch-list",
  ".terminal-candle-chart",
  ".terminal-ticket-grid",
  ".terminal-parameter-gates",
  ".terminal-ledger",
  ".terminal-action-row .buy",
  ".terminal-action-row .sell",
  ".terminal-action-row .gtt"
]) {
  mustInclude("ashstocks-trading-terminal.css", text);
}

for (const text of [
  "TOTAL_PARAMETERS = 2000",
  "1-2000 Parameter Board",
  "terminalParamBoard",
  "data-terminal-param-key",
  "terminalParamSearch",
  "terminalParamStatus",
  "PARAMETER_DETAILS",
  "#terminalSearchInput",
  "terminalGateInspector",
  "Clicked Parameter Detail",
  "Current evidence",
  "Pass line",
  "Engine impact",
  "parameter dictionary did not return metadata",
  "/api/scanner/parameters",
  "applyTerminalFilters",
  "renderParameterBoard",
  "data-terminal-filter",
  "P681",
  "P683",
  "P686",
  "P688",
  "P1701"
]) {
  mustInclude("app-ashstocks-terminal-inspector.js", text);
}

for (const text of [
  ".terminal-search-input",
  ".terminal-gate-inspector",
  ".terminal-param-controls",
  ".terminal-param-board",
  ".terminal-param-board button.HIT",
  ".terminal-param-board button.WAITING",
  ".terminal-param-board button.DATA_NEEDED",
  "#terminalGateBody",
  "#terminalParameterGates article:hover",
  "#terminalProof .terminal-proof-grid span:hover"
]) {
  mustInclude("ashstocks-terminal-inspector.css", text);
}

for (const text of [
  "terminalReasonVerifyExecute",
  "Reason, Verify, Execute",
  "buildModel",
  "readinessChecks",
  "PAPER_BUY_READY",
  "WATCH_READY",
  "VERIFY_DATA",
  "data-reason-paper-action",
  "Paper BUY",
  "Paper GTT",
  "Paper SELL",
  "Need /api/upstox/quote or stream tick",
  "paper_only true; live broker write disabled"
]) {
  mustInclude("app-ashstocks-terminal-reasoning.js", text);
}

for (const text of [
  ".terminal-rve",
  ".terminal-rve-grid",
  ".terminal-rve-checks",
  ".terminal-rve-actions",
  ".terminal-rve-checks article.PASS",
  ".terminal-rve-checks article.BLOCKED",
  ".terminal-rve-checks article.DATA_NEEDED"
]) {
  mustInclude("ashstocks-terminal-reasoning.css", text);
}

for (const text of [
  "terminalDepthRisk",
  "Depth, Funds & Risk",
  "Market Depth",
  "Funds & Exposure",
  "Position Sizing",
  "UPSTOX_DEPTH",
  "/api/paper-trader/orders",
  "/api/paper-trader/status",
  "Depth not returned by /api/upstox/quote yet",
  "broker_write_enabled false",
  "virtual only",
  "R:R"
]) {
  mustInclude("app-ashstocks-terminal-depth-risk.js", text);
}

for (const text of [
  ".terminal-depth-risk",
  ".terminal-depth-risk-grid",
  ".terminal-depth-ladder",
  ".terminal-risk-metrics",
  ".terminal-depth-needed"
]) {
  mustInclude("ashstocks-terminal-depth-risk.css", text);
}

mustMatch("app-ashstocks-trading-terminal.js", /submitPaperAction[\s\S]*fetch|submitPaperAction[\s\S]*api\("\/api\/paper-trader\/order"/, "paper order submission path");
mustMatch("app-ashstocks-trading-terminal.js", /parameterGates[\s\S]*P681[\s\S]*P683[\s\S]*P686[\s\S]*P688[\s\S]*P1701/, "candle and quote parameter gates");
mustMatch("app-ashstocks-trading-terminal.js", /candleChart[\s\S]*normalizeCandles[\s\S]*DATA_NEEDED: Upstox daily candles/, "real candle chart or explicit data-needed state");
mustMatch("app-ashstocks-trading-terminal.js", /requestSelectedQuote[\s\S]*\/api\/upstox\/quote[\s\S]*instrument_keys/, "selected stock Upstox quote fetch");
mustMatch("app-ashstocks-trading-terminal.js", /paper_only: true[\s\S]*broker_write_enabled: false|broker_write_enabled: false[\s\S]*paper_only: true/, "paper safety flags");
mustMatch("app-ashstocks-terminal-inspector.js", /applyTerminalFilters[\s\S]*SELECT[\s\S]*WATCH[\s\S]*DATA_NEEDED/, "terminal watch filters");
mustMatch("app-ashstocks-terminal-inspector.js", /renderInspector[\s\S]*Rule[\s\S]*Source[\s\S]*Pass line[\s\S]*Current evidence[\s\S]*Engine impact/, "parameter inspector fields");
mustMatch("app-ashstocks-terminal-inspector.js", /renderParameterBoard[\s\S]*TOTAL_PARAMETERS[\s\S]*data-terminal-param-key[\s\S]*terminalParamCoverage/, "1-2000 parameter board render");
mustMatch("app-ashstocks-terminal-inspector.js", /generatedDetail[\s\S]*DATA_NEEDED[\s\S]*parameter dictionary did not return metadata/, "honest missing parameter metadata state");
mustMatch("app-ashstocks-terminal-reasoning.js", /readinessChecks[\s\S]*Scanner decision[\s\S]*6M momentum[\s\S]*Candle trigger[\s\S]*Upstox quote[\s\S]*Paper safety/, "reasoning readiness checklist");
mustMatch("app-ashstocks-terminal-reasoning.js", /buildModel[\s\S]*hardBlocks[\s\S]*nextAction[\s\S]*allowBuy[\s\S]*allowGtt/, "reasoning verdict and paper action gating");
mustMatch("app-ashstocks-terminal-depth-risk.js", /renderDepth[\s\S]*quote\?\.depth\?\.bids[\s\S]*quote\?\.depth\?\.asks[\s\S]*DATA_NEEDED/, "real Upstox depth or explicit data-needed state");
mustMatch("app-ashstocks-terminal-depth-risk.js", /renderSizing[\s\S]*Risk[\s\S]*Qty[\s\S]*R:R/, "position sizing risk metrics");

if (failures.length) {
  console.error("AshStocks terminal guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AshStocks terminal guard passed.");
