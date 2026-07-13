const COMPETITIVE_FRAMEWORK_FUNCTIONS = String.raw`
const COMPETITIVE_FRAMEWORK_VERSION = "ashstocks-competitive-framework-v0.1";
const COMPETITOR_COLUMNS = Object.freeze(["Univest", "AlgoTest", "Streak", "Tradetron", "AshStocks"]);
const COMPETITIVE_ROWS = Object.freeze([
  { area: "Daily stock picks", univest: "Yes: advisory/research picks", algotest: "No: strategy tester first", streak: "User-built scanners", tradetron: "User/copy strategy", ashstocks: "Yes: advisor paper buy queue", status: "built", action: "Keep improving scoring and proof" },
  { area: "Entry / target / stop", univest: "Yes", algotest: "Yes via strategy legs", streak: "Yes via rules", tradetron: "Yes via positions", ashstocks: "Yes: entry zone, T1, T2, stop", status: "built", action: "Add trailing stop and partial exits" },
  { area: "Sell / replace", univest: "Portfolio guidance", algotest: "Exit rules", streak: "Exit rules", tradetron: "Exit conditions", ashstocks: "Basic sell/replace queue", status: "partial", action: "Persist paper positions and target-progress rotation" },
  { area: "Backtest proof", univest: "Not main public edge", algotest: "Strong", streak: "Strong", tradetron: "Available", ashstocks: "Weak/basic", status: "gap", action: "Build walk-forward proof, win rate, max DD, profit factor" },
  { area: "No-code parameter builder", univest: "No", algotest: "Yes", streak: "Yes", tradetron: "Yes", ashstocks: "Not yet", status: "gap", action: "Build parameter builder from groups below" },
  { area: "Options/F&O", univest: "Yes", algotest: "Strong", streak: "Yes", tradetron: "Strong", ashstocks: "No", status: "later", action: "Keep later; finish equity engine first" },
  { area: "Market context", univest: "Yes", algotest: "Yes", streak: "Some", tradetron: "Some", ashstocks: "NIFTY/Sensex/BankNifty/VIX/USDINR/Gold", status: "partial", action: "Add crude, GIFT Nifty, yields, global indices" },
  { area: "News/events/theme", univest: "Research/advisory edge", algotest: "Limited", streak: "Limited", tradetron: "Limited", ashstocks: "Theme tags only", status: "gap", action: "Wire news, results, orders, FII/DII, policy, war/crash/election events" },
  { area: "Portfolio journal", univest: "Yes", algotest: "Strategy results", streak: "Deploy history", tradetron: "Logs/reports", ashstocks: "Basic state only", status: "gap", action: "Build paper portfolio, P&L, journal, audit trail" },
  { area: "Broker execution", univest: "Yes", algotest: "Yes", streak: "Zerodha", tradetron: "Multi broker", ashstocks: "Locked paper only", status: "intentional", action: "Keep locked until paper proof is strong" }
]);
const PARAMETER_MAP = Object.freeze([
  { group: "Price Action", parameters: ["1D/5D/1M/3M/6M/12M return", "52W distance", "breakout", "range expansion", "gap"], ashstocks: "partial", next: "multi-timeframe breakout cards" },
  { group: "Momentum", parameters: ["relative strength", "ROC", "RSI", "MACD", "ADX", "EMA stack"], ashstocks: "partial", next: "RSI/MACD/ADX/EMA in scanner" },
  { group: "Volume/Liquidity", parameters: ["ADV20", "rupee turnover", "relative volume", "delivery %", "block/bulk"], ashstocks: "partial", next: "delivery and abnormal volume feeds" },
  { group: "Risk", parameters: ["ATR stop", "volatility", "drawdown", "beta", "correlation", "position size"], ashstocks: "partial", next: "ATR from candles and portfolio risk budget" },
  { group: "Fundamental", parameters: ["sales growth", "profit growth", "ROE", "ROCE", "debt", "pledge", "FII/DII holding"], ashstocks: "gap", next: "financial and shareholding data layer" },
  { group: "Event", parameters: ["results", "budget", "RBI", "election", "war", "crash", "commodity shock"], ashstocks: "gap", next: "event calendar and regime flags" },
  { group: "Theme", parameters: ["AI", "defence", "rail", "infra", "EV", "green energy", "PSU", "capex"], ashstocks: "partial", next: "news-backed theme heat score" },
  { group: "Execution", parameters: ["entry", "T1", "T2", "stop", "trailing stop", "partial exit", "replace"], ashstocks: "partial", next: "trailing stop and target-progress sell/replace" },
  { group: "Proof", parameters: ["backtest", "walk-forward", "win rate", "profit factor", "max DD", "paper journal"], ashstocks: "gap", next: "AlgoTest-style proof dashboard" }
]);
function competitiveFrameworkPayload() {
  const counts = COMPETITIVE_ROWS.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, { built: 0, partial: 0, gap: 0, later: 0, intentional: 0 });
  return {
    ok: true,
    engine: COMPETITIVE_FRAMEWORK_VERSION,
    asOf: new Date().toISOString(),
    columns: COMPETITOR_COLUMNS,
    summary: counts,
    competitors: [
      { name: "Univest", role: "Indian advisory/recommendation app", edge: "packaged research, buy/sell style guidance, portfolio experience" },
      { name: "AlgoTest", role: "backtest/paper/automation platform", edge: "strategy proof, options logic, reports" },
      { name: "Streak", role: "no-code scanner/strategy builder", edge: "rule builder, backtest, deploy workflow" },
      { name: "Tradetron", role: "no-code algo marketplace/deployment", edge: "complex conditions, marketplace, broker deployment" },
      { name: "AshStocks", role: "custom India/NSE advisor engine", edge: "your data, Upstox/Yahoo fallback, paper stock-selection rotation" }
    ],
    rows: COMPETITIVE_ROWS,
    parameter_map: PARAMETER_MAP,
    next_build_order: [
      "Backtest proof dashboard",
      "Paper portfolio journal with target-progress sell/replace",
      "Parameter builder UI",
      "News/event/theme intelligence",
      "Fundamental/shareholding feeds",
      "Visual polish to Sourceborn dashboard standard"
    ],
    paper_only: true,
    live_orders: false
  };
}
`;
const COMPETITIVE_FRAMEWORK_ROUTES = String.raw`
      if (url.pathname === "/api/competitive-framework") { json(res, 200, competitiveFrameworkPayload()); return; }
`;
export function applyCompetitiveFrameworkPatches(source, mustReplace) {
  let output = source;
  output = mustReplace(output, "\nasync function dataBankStatus() {", `\n${COMPETITIVE_FRAMEWORK_FUNCTIONS}\nasync function dataBankStatus() {`, "insert competitive framework functions");
  output = mustReplace(output, '      if (url.pathname === "/api/market-context") {', `${COMPETITIVE_FRAMEWORK_ROUTES}\n      if (url.pathname === "/api/market-context") {`, "competitive framework route");
  return output;
}
