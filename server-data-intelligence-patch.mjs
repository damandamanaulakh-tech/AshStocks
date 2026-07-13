const DATA_INTELLIGENCE_FUNCTIONS = String.raw`
const DATA_INTELLIGENCE_VERSION = "ashstocks-data-intelligence-v0.2-drive-suspended";
const UPSTOX_SUSPENDED_INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/suspended-instrument.json.gz";
const DRIVE_SOURCE_FOLDER_URL = "https://drive.google.com/drive/folders/1HSYAXYFCxu3f6kmHw1k8XaJ2b2psrC9W";
let suspendedInstrumentCache = { at: 0, payload: null, promise: null };
const DRIVE_DATA_CATALOG = Object.freeze({
  source: "Google Drive handoff + local Upstox suspended file",
  source_folder: DRIVE_SOURCE_FOLDER_URL,
  parts: [
    { name: "PART 1", files: 88 },
    { name: "PART 2", files: 77 }
  ],
  total_files_seen: 165,
  direct_inputs: [
    { name: "parameters_v0_7.csv", scope: "1200 parameters across 24 blocks", engine_use: "parameter dictionary and build map" },
    { name: "06_EARLY_WARNING.md", scope: "30 India/NSE early-warning regime signals", engine_use: "regime and risk overlay design" },
    { name: "07_DATA_FORMATS.md", scope: "10 validation feeds and required schemas", engine_use: "data roadmap and feed checks" },
    { name: "top_pre_fall_triggers.csv", scope: "validated pre-fall trigger precision/recall/lift", engine_use: "risk trigger scoring" },
    { name: "top_combo_triggers.csv", scope: "validated trigger combinations", engine_use: "multi-signal confirmation" },
    { name: "sourceborn_today_picks.csv", scope: "50 previous NIFTY200 momentum picks", engine_use: "advisor comparison/reference" },
    { name: "fii-dii-nse-latest.csv", scope: "FII/FPI and DII cash snapshot", engine_use: "institutional flow overlay" },
    { name: "suspended-instrument.json.gz", scope: "Upstox suspended instruments", engine_use: "do-not-scan/do-not-recommend guard" }
  ],
  available_domains: [
    "NSE equity and FO bhavcopy",
    "FII/DII cash and derivatives",
    "participant OI and participant volume",
    "PWOI 2012-2023",
    "IFR/FII cash stack tests",
    "delivery-volume batch checks",
    "early-warning and event validation",
    "India 10Y bond yield",
    "USD/INR, gold, crude feed schema",
    "paper engine and pyramid sequence workbooks"
  ]
});
const PARAMETER_FRAMEWORK_BLOCKS = Object.freeze([
  { id: "B01", name: "Industry Identity", use: "sector, business type, lifecycle, demand/supply and policy identity" },
  { id: "B02", name: "15-Year Performance", use: "long-cycle winners, drawdown history, survivorship checks" },
  { id: "B03", name: "Growth Drivers", use: "sales/order/capex/sector expansion drivers" },
  { id: "B04", name: "Valuation and Re-rating", use: "valuation gap, re-rating room, margin of safety" },
  { id: "B05", name: "Financial Quality", use: "ROE, ROCE, margin, debt, cash conversion" },
  { id: "B06", name: "Balance Sheet Risk", use: "leverage, pledge, dilution, bankruptcy style risk" },
  { id: "B07", name: "Cash Flow", use: "operating cash, free cash, working-capital stress" },
  { id: "B08", name: "Management and Governance", use: "promoter, pledge, insider and audit risk" },
  { id: "B09", name: "Sector Tailwind", use: "AI, EV, defence, rail, green energy, infra and PSU themes" },
  { id: "B10", name: "Order and Execution Pipeline", use: "order wins, backlog, execution runway and capex delivery" },
  { id: "B11", name: "Event Calendar", use: "results, RBI, budget, election, war/crash shock flags" },
  { id: "B12", name: "FII/DII Flow", use: "cash flow, sector concentration, institutional pressure" },
  { id: "B13", name: "Derivatives and OI", use: "FII futures shift, PCR, basis, FO ban, OI pressure" },
  { id: "B14", name: "Market Breadth", use: "advance/decline, dispersion, HHI concentration, leadership width" },
  { id: "B15", name: "Delivery and Volume", use: "delivery %, accumulation, abnormal volume, retail participation" },
  { id: "B16", name: "Macro", use: "GST, credit growth, liquidity, rate/yield pressure" },
  { id: "B17", name: "Currency and Commodity", use: "USD/INR, gold, crude, copper, import/export sensitivity" },
  { id: "B18", name: "News and Sentiment", use: "company orders, sector hot pockets, social/news velocity" },
  { id: "B19", name: "Risk Governor", use: "regime, drawdown, volatility, capital protection" },
  { id: "B20", name: "Portfolio Rotation", use: "sell/replace, target progress, correlation, sector caps" },
  { id: "B21", name: "Execution Plan", use: "entry zone, targets, stop, trailing stop, size" },
  { id: "B22", name: "Technical Price Liquidity", use: "DMA, momentum, relative strength, ADV, turnover, ATR" },
  { id: "B23", name: "Gold Currency Commodity", use: "gold hedge, INR pressure, crude/copper cycle" },
  { id: "B24", name: "Data Quality Realtime", use: "freshness, suspended flag, source confidence, audit trail" }
]);
const EARLY_WARNING_SIGNALS = Object.freeze([
  "Dispersion Breakdown Index",
  "Volume Herfindahl concentration",
  "Up-volume to down-volume decay",
  "FII index futures net position shift",
  "PCR skew shift",
  "Nifty futures basis anomaly",
  "FO ban list expansion",
  "Triple safe-haven rally",
  "USD/INR 50DMA breakout",
  "Cross-asset correlation spike",
  "GST collection trend",
  "Bank credit growth deceleration",
  "RBI G-Sec auction devolvement",
  "MTF outstanding leverage",
  "Promoter pledge increase cluster",
  "Insider sell-to-buy ratio",
  "Promoter fresh buying cluster",
  "SIP net inflow trend",
  "Smart beta outflow",
  "FII sectoral flow concentration",
  "Pre-result bias signal",
  "Budget/RBI MPC drift",
  "Retail volume share spike",
  "New demat account velocity",
  "Social/news mention velocity",
  "NSE-BSE volume divergence",
  "SME IPO pop distribution",
  "Sub-broker/algo account growth",
  "CPSE/PSU disinvestment pipeline",
  "Mutual fund cash allocation"
]);
const VALIDATED_TRIGGER_ROWS = Object.freeze([
  { trigger: "tail_down3_5d > 95pct", fires: 358, precision: 0.2402, recall: 0.1139, lift: 2.2788 },
  { trigger: "disp_5d > 95pct", fires: 358, precision: 0.2179, recall: 0.1033, lift: 2.0668 },
  { trigger: "ret_10d < 5pct", fires: 358, precision: 0.2067, recall: 0.0980, lift: 1.9608 },
  { trigger: "tail_down3_5d > 90pct", fires: 715, precision: 0.2014, recall: 0.1907, lift: 1.9105 },
  { trigger: "tail_down3_5d>90% and ret_10d>90%", fires: 21, precision: 0.2857, recall: 0.0079, lift: 2.7103 },
  { trigger: "disp_5d>85% and tail_down3_5d>90%", fires: 301, precision: 0.2359, recall: 0.0940, lift: 2.2376 }
]);
const REQUIRED_VALIDATION_FEEDS = Object.freeze([
  { feed: "NSE Bhavcopy Daily EQ", status: "available/partial", priority: 1, unlocks: "DBI, HHI, breadth, delivery, volume" },
  { feed: "NSE FII Derivatives", status: "available/partial", priority: 2, unlocks: "FII futures shift, derivatives regime" },
  { feed: "NSE FO Bhavcopy", status: "available/partial", priority: 3, unlocks: "PCR, basis, FO ban, OI" },
  { feed: "India VIX + index daily", status: "live via Yahoo + historical needed", priority: 4, unlocks: "regime and breadth context" },
  { feed: "USD/INR + Gold + Crude + Yields", status: "live partial + Drive 10Y", priority: 5, unlocks: "cross-asset risk overlay" },
  { feed: "FII/DII cash", status: "latest snapshot found", priority: 6, unlocks: "institutional flow overlay" },
  { feed: "GST monthly", status: "schema only", priority: 7, unlocks: "macro demand signal" },
  { feed: "AMFI SIP/MF flows", status: "schema only", priority: 8, unlocks: "retail/mutual fund flow" },
  { feed: "CDSL/NSDL demat", status: "schema only", priority: 9, unlocks: "retail FOMO cycle" },
  { feed: "SEBI insider/promoter", status: "schema only", priority: 10, unlocks: "promoter/insider risk" }
]);
const FII_DII_SNAPSHOT = Object.freeze({
  date: "08-Jun-2026",
  dii_net_cr: 5028.13,
  fii_fpi_net_cr: -5553.86,
  read_from: "fii-dii-nse-latest.csv"
});
function dataIntelligenceRound(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
}
async function loadSuspendedInstrumentPayload(force = false) {
  const now = Date.now();
  if (!force && suspendedInstrumentCache.payload && now - suspendedInstrumentCache.at < 6 * 60 * 60 * 1000) return suspendedInstrumentCache.payload;
  if (!force && suspendedInstrumentCache.promise) return suspendedInstrumentCache.promise;
  suspendedInstrumentCache.promise = (async () => {
    try {
      const response = await fetch(UPSTOX_SUSPENDED_INSTRUMENTS_URL, { headers: { "user-agent": "ashstocks-suspended-filter" } });
      if (!response.ok) throw new Error("suspended feed " + response.status);
      const buffer = Buffer.from(await response.arrayBuffer());
      const payload = JSON.parse(zlib.gunzipSync(buffer).toString("utf8"));
      const rows = Array.isArray(payload) ? payload : [];
      const nseEq = rows.filter((row) => row?.segment === "NSE_EQ" && row?.instrument_type === "EQ");
      const symbols = [...new Set(nseEq.map((row) => normalizeSymbol(row.trading_symbol)).filter(Boolean))].sort();
      const result = {
        ok: true,
        source: UPSTOX_SUSPENDED_INSTRUMENTS_URL,
        fetched_at: new Date().toISOString(),
        total_rows: rows.length,
        nse_eq_eq_rows: nseEq.length,
        unique_symbols: symbols.length,
        sample_symbols: symbols.slice(0, 24),
        symbols
      };
      suspendedInstrumentCache = { at: Date.now(), payload: result, promise: null };
      return result;
    } catch (error) {
      const result = {
        ok: false,
        source: UPSTOX_SUSPENDED_INSTRUMENTS_URL,
        fetched_at: new Date().toISOString(),
        error: error.message,
        total_rows: 0,
        nse_eq_eq_rows: 0,
        unique_symbols: 0,
        sample_symbols: [],
        symbols: []
      };
      suspendedInstrumentCache = { at: Date.now(), payload: result, promise: null };
      return result;
    }
  })();
  return suspendedInstrumentCache.promise;
}
async function suspendedNseEqSymbolSet() {
  const payload = await loadSuspendedInstrumentPayload(false);
  return new Set(payload.symbols || []);
}
async function filterSuspendedScannerRows(rows = []) {
  try {
    const suspended = await suspendedNseEqSymbolSet();
    if (!suspended.size) return rows;
    return rows.filter((row) => !suspended.has(normalizeSymbol(row.symbol || row.trading_symbol)));
  } catch {
    return rows;
  }
}
async function dataIntelligencePayload(force = false) {
  const suspended = await loadSuspendedInstrumentPayload(force);
  const triggerLiftAvg = dataIntelligenceRound(VALIDATED_TRIGGER_ROWS.reduce((sum, row) => sum + row.lift, 0) / VALIDATED_TRIGGER_ROWS.length, 2);
  return {
    ok: true,
    engine: DATA_INTELLIGENCE_VERSION,
    asOf: new Date().toISOString(),
    drive_catalog: DRIVE_DATA_CATALOG,
    parameter_framework: {
      total_parameters: 1200,
      blocks: PARAMETER_FRAMEWORK_BLOCKS,
      block_count: PARAMETER_FRAMEWORK_BLOCKS.length,
      source: "parameters_v0_7.csv"
    },
    early_warning: {
      signal_count: EARLY_WARNING_SIGNALS.length,
      signals: EARLY_WARNING_SIGNALS,
      pass_criteria: ["lead time > 5 trading days", "true positive rate > 60%", "false positive rate < 30%", "validated across 3+ events"]
    },
    validated_triggers: {
      source_files: ["top_pre_fall_triggers.csv", "top_combo_triggers.csv"],
      average_lift: triggerLiftAvg,
      rows: VALIDATED_TRIGGER_ROWS
    },
    required_feeds: REQUIRED_VALIDATION_FEEDS,
    fii_dii_snapshot: FII_DII_SNAPSHOT,
    suspended_guard: {
      ok: suspended.ok,
      source: suspended.source,
      fetched_at: suspended.fetched_at,
      total_rows: suspended.total_rows,
      nse_eq_eq_rows: suspended.nse_eq_eq_rows,
      unique_symbols: suspended.unique_symbols,
      sample_symbols: suspended.sample_symbols,
      filter_active: suspended.ok && suspended.unique_symbols > 0,
      error: suspended.error || null
    },
    engine_use: [
      "Filter suspended NSE EQ instruments before scanner and Upstox paper runs",
      "Use 1200-parameter map as the build dictionary instead of narrow ad-hoc scoring",
      "Show 30 early-warning signals as regime/risk overlay work queue",
      "Use validated pre-fall trigger lift as risk overlay candidates",
      "Use FII/DII, PWOI, delivery, FO and macro feeds as next scoring layers"
    ],
    paper_only: true,
    live_orders: false
  };
}
`;
const DATA_INTELLIGENCE_ROUTES = String.raw`
      if (url.pathname === "/api/data-intelligence") { json(res, 200, await dataIntelligencePayload(url.searchParams.get("refresh") === "1")); return; }
`;
export function applyDataIntelligencePatches(source, mustReplace) {
  let output = source;
  output = mustReplace(output, "\nasync function dataBankStatus() {", `\n${DATA_INTELLIGENCE_FUNCTIONS}\nasync function dataBankStatus() {`, "insert data intelligence functions");
  output = mustReplace(
    output,
    '  const baseRows = prioritizedStockRows(normalizeScannerUniverse(universeInput).filter((row) => row.instrument_key), maxLimit);',
    '  const baseRows = await filterSuspendedScannerRows(prioritizedStockRows(normalizeScannerUniverse(universeInput).filter((row) => row.instrument_key), maxLimit));',
    "filter suspended rows in Upstox scanner"
  );
  output = mustReplace(
    output,
    '        const scan = runScanner(resolved.universe, { ...(body.settings || {}), source: resolved.source, holdings: body.holdings, existingHoldings: body.existingHoldings });',
    '        const filteredUniverse = await filterSuspendedScannerRows(resolved.universe);\n        const scan = runScanner(filteredUniverse, { ...(body.settings || {}), source: resolved.source, holdings: body.holdings, existingHoldings: body.existingHoldings });',
    "filter suspended rows in scanner"
  );
  output = mustReplace(output, '      if (url.pathname === "/api/data-bank/status") {', `${DATA_INTELLIGENCE_ROUTES}\n      if (url.pathname === "/api/data-bank/status") {`, "data intelligence route");
  return output;
}
