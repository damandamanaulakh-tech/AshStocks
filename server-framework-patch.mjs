export function applyFrameworkPatches(output, mustReplace) {
  const frameworkBlock = `
const ASHSTOCKS_FRAMEWORK_VERSION = "ashstocks-sourceborn-framework-v1";
const ASHSTOCKS_HANDOFF_SOURCES = Object.freeze([
  "PROJECT_FILE_MANIFEST_ALL_AVAILABLE.csv",
  "NEW_CHAT_CONTINUATION_PROMPT.txt",
  "06_EARLY_WARNING.md",
  "07_DATA_FORMATS.md",
  "Chityy_Sourceborn_FINAL_MICRO_SPLIT_ENGINE_v0_6.xlsx",
  "Chityy_Sourceborn_IFR_FII_Cash_Stack_Test_v0_6.xlsx",
  "sourceborn_fii_volume_derivatives_review_v0_3/new_fii_volume_derivatives_parameters_v0_3.csv",
  "sourceborn_ifr_fii_cash_stack_test_v0_6/parameter_decisions.csv"
]);

const ASHSTOCKS_FRAMEWORK_LAYERS = Object.freeze([
  {
    id: "L00_FILE_LEDGER",
    name: "File Ledger And Source Map",
    status: "ACTIVE",
    role: "Track every uploaded file, lineage, duplicate group, and landing area before using it in decisions.",
    sources: ["PROJECT_FILE_MANIFEST_ALL_AVAILABLE.csv", "PROJECT_FILE_LIST_THIS_PART.txt"],
    product_use: "Controls what is accepted, duplicate, stale, or still waiting."
  },
  {
    id: "L01_UNIVERSE_MASTER",
    name: "NSE Equity Master",
    status: "ACTIVE_UPSTOX_CONNECTED",
    role: "Build the real India/NSE stock pool from Upstox complete instruments, excluding fund-like and suspended rows.",
    sources: ["Upstox complete instruments JSON", "Upstox suspended instruments JSON"],
    product_use: "Scanner universe and Upstox instrument_key source."
  },
  {
    id: "L02_PRICE_LIQUIDITY_TECH",
    name: "OHLCV Momentum And Liquidity",
    status: "ACTIVE_UPSTOX_RATE_LIMIT_AWARE",
    role: "Use historical candles for 6M/12M return, volatility, ADV20, turnover, stale candle, stuck candle and target-potential gates. If Upstox returns 429, the app names that rate limit instead of faking values.",
    sources: ["Upstox historical candle API", "Yahoo NSE fallback when Upstox is rate-limited"],
    product_use: "Current hard gates and score engine."
  },
  {
    id: "L03_PORTFOLIO_RISK",
    name: "Portfolio Caps And Correlation",
    status: "ACTIVE",
    role: "Block oversized portfolios, sector crowding, high correlation, and non-paper execution.",
    sources: ["scanner holdings", "scan ledger"],
    product_use: "Paper order sizing and BLOCKED decisions."
  },
  {
    id: "L04_IFR_DAMAGE_REPAIR",
    name: "IFR Damage And Repair State Machine",
    status: "DATA_AVAILABLE_NOT_SELECT_WIRED",
    role: "Internal Fracture and Repair is a risk/exposure throttle, not a standalone buy/sell signal.",
    sources: ["Chityy_Sourceborn_IFR_Validation_Hard_Checks_v0_5", "Chityy_Sourceborn_IFR_FII_Cash_Stack_Test_v0_6"],
    product_use: "Reduce exposure during fracture; restore only after repair state confirms."
  },
  {
    id: "L05_FII_DII_CASH",
    name: "FII/DII Cash Pressure",
    status: "ACTIVE_SNAPSHOT_IN_INTELLIGENCE",
    role: "Use latest FII/DII cash snapshot in intelligence overlay now; full history is still needed before it controls SELECT by itself.",
    sources: ["fii-dii-nse-latest.csv", "fii_dii_cash_flow_2012_2023.csv", "fii_dii_cash_full_history_clean.csv"],
    product_use: "Institutional flow score and future exposure throttle."
  },
  {
    id: "L06_PWOI_DERIVATIVES",
    name: "PWOI And Derivatives Positioning",
    status: "DATA_NEEDED_TO_WIRE",
    role: "Add participant-wise OI, FII derivatives, PCR, futures basis and F&O event-window checks.",
    sources: ["pwoi_participant_oi_long_2012_2023.csv", "pwoi_fii_derivatives_features_2012_2023.csv", "fo_options_pcr_oi_by_symbol_2026_06_03.csv"],
    product_use: "Early risk confirmation before cash data is obvious."
  },
  {
    id: "L07_VOLUME_DELIVERY_BREADTH",
    name: "Market-Wide Volume Delivery Breadth",
    status: "DATA_NEEDED_TO_WIRE",
    role: "Use delivery, volume concentration, up/down volume decay, dispersion and breadth to avoid narrow leadership traps.",
    sources: ["nse_volume_delivery_16stocks_eq_merged.csv", "05_daily_market_internals.csv", "06_EARLY_WARNING.md"],
    product_use: "Regime warning and false-positive filter."
  },
  {
    id: "L08_REGIME_EARLY_WARNING",
    name: "India Regime Early Warning",
    status: "PARAMETER_BANK_READY_NEEDS_FEEDS",
    role: "Thirty India-specific early warning hypotheses: DBI, volume HHI, FII futures shift, PCR skew, basis anomaly, GST, SIP, demat velocity and more.",
    sources: ["06_EARLY_WARNING.md", "07_DATA_FORMATS.md"],
    product_use: "Market exposure multiplier after validation."
  },
  {
    id: "L09_EVENT_VALIDATION",
    name: "Event Lead-Time And Robustness",
    status: "PAPER_PROOF_PARTIAL",
    role: "Measure lead time, false positives, time-block robustness, signal independence, and walk-forward thresholds.",
    sources: ["event_fire_matrix.csv", "block_robustness.csv", "signal_independence_clusters.csv", "signal_forward_return_distribution.csv"],
    product_use: "KEEP/WATCH/ARCHIVE decision ledger for parameters."
  },
  {
    id: "L10_SOURCEBORN_URR_CONTROL",
    name: "Sourceborn + URR Control Loop",
    status: "ACTIVE_CONTROL",
    role: "Run Point Zero, Source, Pattern, Evidence, Reality Check, URR pass, Halt Point, ProofLedger, GapTable and next loop.",
    sources: ["NEW_CHAT_CONTINUATION_PROMPT.txt", "URR Core.txt", "urr07.txt"],
    product_use: "Prevents fake proof and routes missing data to exact feed status."
  },
  {
    id: "L11_PAPER_ENGINE_ONLY",
    name: "Paper Engine And Safety",
    status: "ACTIVE",
    role: "Historical-candle-only Upstox/Yahoo-fallback scan and paper order output. No live broker orders.",
    sources: ["Upstox historical candle API", "Yahoo Finance NSE fallback", "scan_ledger"],
    product_use: "Daily proof loop, scheduler and audit trail."
  }
]);

const ASHSTOCKS_REQUIRED_FEEDS = Object.freeze([
  { id: "F01", name: "NSE Bhavcopy EQ", status: "DATA_NEEDED_NON_UPSTOX", priority: 1, minimum_history: "2018-01-01 to present", unlocks: ["DBI", "volume HHI", "up/down volume", "delivery breadth"] },
  { id: "F02", name: "Upstox Daily OHLCV", status: "CONNECTED_RATE_LIMIT_AWARE", priority: 1, minimum_history: "253 trading days active now; 15Y point-in-time history still needed", unlocks: ["price/liquidity scanner", "paper engine", "entry/target/stop"] },
  { id: "F03", name: "FII/DII Cash", status: "LATEST_SNAPSHOT_WIRED_FULL_HISTORY_NEEDED", priority: 1, minimum_history: "latest snapshot active; 2012/2018 to present history still needed", unlocks: ["FII cash pressure", "DII divergence", "flow_score"] },
  { id: "F04", name: "PWOI Participant OI", status: "DATA_NEEDED_TO_WIRE", priority: 2, minimum_history: "2012 to present", unlocks: ["PWOI stress", "derivatives confirmation"] },
  { id: "F05", name: "NSE F&O Bhavcopy", status: "DATA_NEEDED_TO_WIRE", priority: 2, minimum_history: "2020 to present", unlocks: ["PCR", "basis", "F&O event windows"] },
  { id: "F06", name: "Index/VIX/Breadth", status: "YAHOO_FALLBACK_PARTIAL_HISTORY_NEEDED", priority: 2, minimum_history: "2018 to present", unlocks: ["regime multiplier", "repair state"] },
  { id: "F07", name: "FX/Gold/10Y/Crude", status: "PARTIAL_ONLINE_HISTORY_NEEDED", priority: 3, minimum_history: "2018 to present", unlocks: ["cross-asset stress"] },
  { id: "F08", name: "GST/SIP/Demat/SME/Insider", status: "FUTURE_DATA_NEEDED_NON_UPSTOX", priority: 4, minimum_history: "monthly history", unlocks: ["macro and sentiment early warning"] }
]);

const ASHSTOCKS_DECISION_RULES = Object.freeze({
  keep: "Keep only when the signal has source data, formula, event evidence, false-positive check and paper-only safety.",
  watch: "Watch when mechanism is useful but validation is partial or time-block robustness is mixed.",
  archive: "Archive when the signal is duplicate, story-only, late, or fails false-positive limits.",
  data_needed: "Do not fake values. Mark DATA_NEEDED with the exact feed and column required.",
  live_trade: "NO. Upstox is historical-candle-only here; live orders stay disabled."
});

function frameworkStatusCounts() {
  return ASHSTOCKS_FRAMEWORK_LAYERS.reduce((counts, layer) => {
    counts[layer.status] = (counts[layer.status] || 0) + 1;
    return counts;
  }, {});
}

function ashstocksFrameworkSummary(state = defaultState()) {
  const universe = normalizeScannerUniverse(state.universe);
  const activeParameters = SCANNER_PARAMETERS.map((parameter) => ({ ...parameter, status: "ACTIVE_IN_SCANNER" }));
  return {
    ok: true,
    framework_version: ASHSTOCKS_FRAMEWORK_VERSION,
    product: "India/NSE stock-selection proof engine",
    truth: {
      live_trade: false,
      paper_only: true,
      current_scanner_layers_active: ["L01_UNIVERSE_MASTER", "L02_PRICE_LIQUIDITY_TECH", "L03_PORTFOLIO_RISK", "L05_FII_DII_CASH", "L11_PAPER_ENGINE_ONLY"],
      not_yet_active_as_buy_signal: ["IFR full state", "PWOI", "market-wide delivery", "macro early warning"],
      reason: "Upstox instruments/OHLCV and FII/DII latest snapshot are wired; 429 rate limits are named separately; remaining layers need full feeds and validation before they can control SELECT."
    },
    source_handoff: {
      folders: 2,
      files_manifested: 165,
      read_core_sources: ASHSTOCKS_HANDOFF_SOURCES,
      latest_control: "v0.6 IFR/FII cash stack plus Sourceborn/URR control loop"
    },
    universe: {
      saved_rows: universe.length,
      rows_with_instrument_key: universe.filter((row) => row.instrument_key).length,
      built_in_fallback_rows: INDIA_UNIVERSE.length
    },
    layers: ASHSTOCKS_FRAMEWORK_LAYERS,
    status_counts: frameworkStatusCounts(),
    active_scanner_parameters: activeParameters,
    required_feeds: ASHSTOCKS_REQUIRED_FEEDS,
    decision_rules: ASHSTOCKS_DECISION_RULES,
    next_build_loop: [
      "Keep Upstox 429 rate-limit failures separate from true DATA_NEEDED gaps",
      "Create durable feed ledger for uploaded CSV/XLSX sources",
      "Wire full FII/DII cash history and IFR state columns as paper exposure multipliers",
      "Wire market-wide delivery/volume breadth before allowing IFR/FII to affect SELECT",
      "Add event lead-time report for KEEP/WATCH/ARCHIVE parameter decisions",
      "Keep live orders disabled"
    ]
  };
}
`;

  output = mustReplace(
    output,
    '\nfunction dataBankSummary(state = defaultState()) {',
    `${frameworkBlock}\nfunction dataBankSummary(state = defaultState()) {`,
    'insert Sourceborn framework model'
  );

  output = mustReplace(
    output,
    '      "FII/DII/PWOI/IFR overlays are not complete",',
    '      "IFR full state/PWOI/volume-delivery overlays are not complete; Upstox/FII snapshot are wired separately",',
    'framework-specific data-bank gap'
  );

  output = mustReplace(
    output,
    '      if (url.pathname === "/api/scanner/parameters") {',
    `      if (url.pathname === "/api/framework") {
        const store = await getStore();
        const state = await store.getState();
        json(res, 200, ashstocksFrameworkSummary(state));
        return;
      }

      if (url.pathname === "/api/scanner/parameters") {`,
    'framework endpoint'
  );

  output = mustReplace(
    output,
    '          data_bank: dataBankSummary(state),\n          upstox: upstoxStatus()',
    '          data_bank: dataBankSummary(state),\n          framework: ashstocksFrameworkSummary(state),\n          upstox: upstoxStatus()',
    'scanner parameters include framework summary'
  );

  return output;
}