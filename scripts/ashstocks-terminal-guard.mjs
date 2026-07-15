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
mustInclude("app-broker-nav-guard.js", "./app-ashstocks-trading-terminal.js", "Trading terminal script loader");
mustInclude("app-broker-nav-guard.js", "./app-ashstocks-terminal-inspector.js", "Terminal inspector script loader");
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

mustMatch("app-ashstocks-trading-terminal.js", /submitPaperAction[\s\S]*fetch|submitPaperAction[\s\S]*api\("\/api\/paper-trader\/order"/, "paper order submission path");
mustMatch("app-ashstocks-trading-terminal.js", /parameterGates[\s\S]*P681[\s\S]*P683[\s\S]*P686[\s\S]*P688[\s\S]*P1701/, "candle and quote parameter gates");
mustMatch("app-ashstocks-trading-terminal.js", /candleChart[\s\S]*normalizeCandles[\s\S]*DATA_NEEDED: Upstox daily candles/, "real candle chart or explicit data-needed state");
mustMatch("app-ashstocks-trading-terminal.js", /requestSelectedQuote[\s\S]*\/api\/upstox\/quote[\s\S]*instrument_keys/, "selected stock Upstox quote fetch");
mustMatch("app-ashstocks-trading-terminal.js", /paper_only: true[\s\S]*broker_write_enabled: false|broker_write_enabled: false[\s\S]*paper_only: true/, "paper safety flags");
mustMatch("app-ashstocks-terminal-inspector.js", /applyTerminalFilters[\s\S]*SELECT[\s\S]*WATCH[\s\S]*DATA_NEEDED/, "terminal watch filters");
mustMatch("app-ashstocks-terminal-inspector.js", /renderInspector[\s\S]*Rule[\s\S]*Source[\s\S]*Pass line[\s\S]*Current evidence[\s\S]*Engine impact/, "parameter inspector fields");
mustMatch("app-ashstocks-terminal-inspector.js", /renderParameterBoard[\s\S]*TOTAL_PARAMETERS[\s\S]*data-terminal-param-key[\s\S]*terminalParamCoverage/, "1-2000 parameter board render");
mustMatch("app-ashstocks-terminal-inspector.js", /generatedDetail[\s\S]*DATA_NEEDED[\s\S]*parameter dictionary did not return metadata/, "honest missing parameter metadata state");

if (failures.length) {
  console.error("AshStocks terminal guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AshStocks terminal guard passed.");
