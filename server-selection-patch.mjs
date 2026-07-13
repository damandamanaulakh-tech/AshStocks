export function applySelectionFlowPatches(output, mustReplace) {
  output = mustReplace(
    output,
    '  const maxLimit = Math.min(200, Math.max(1, Math.floor(finiteOr(ENV.UPSTOX_SCAN_LIMIT, 120))));',
    '  const maxLimit = Math.min(200, Math.max(1, Math.floor(finiteOr(ENV.UPSTOX_SCAN_LIMIT, 200))));',
    'scan up to 200 prioritized names by default'
  );

  const prioritySortBlock = `
function prioritizedStockRows(rows, limit) {
  const prioritySymbols = new Map([
    "RELIANCE", "HDFCBANK", "ICICIBANK", "INFY", "TCS", "SBIN", "BHARTIARTL", "LT", "AXISBANK", "KOTAKBANK",
    "ITC", "HINDUNILVR", "BAJFINANCE", "MARUTI", "SUNPHARMA", "M&M", "NTPC", "POWERGRID", "TATAMOTORS", "ADANIENT",
    "ADANIPORTS", "ONGC", "COALINDIA", "ASIANPAINT", "HCLTECH", "WIPRO", "ULTRACEMCO", "TITAN", "BAJAJFINSV", "TECHM",
    "NESTLEIND", "JSWSTEEL", "TATASTEEL", "GRASIM", "HINDALCO", "CIPLA", "DRREDDY", "DIVISLAB", "EICHERMOT", "HEROMOTOCO",
    "BAJAJ-AUTO", "BRITANNIA", "APOLLOHOSP", "INDUSINDBK", "TATACONSUM", "BPCL", "SHRIRAMFIN", "HDFCLIFE", "SBILIFE", "BAJAJHLDNG",
    "DMART", "PIDILITIND", "GODREJCP", "DABUR", "MARICO", "COLPAL", "BERGEPAINT", "ICICIPRULI", "ICICIGI", "CHOLAFIN",
    "MUTHOOTFIN", "TVSMOTOR", "TRENT", "PERSISTENT", "COFORGE", "MPHASIS", "LTIM", "NAUKRI", "IRCTC", "ZOMATO",
    "JIOFIN", "POLYCAB", "ABB", "SIEMENS", "HAL", "BEL", "BHEL", "RECLTD", "PFC", "IRFC",
    "BANKBARODA", "PNB", "CANBK", "UNIONBANK", "IDFCFIRSTB", "FEDERALBNK", "YESBANK", "TATAPOWER", "ADANIPOWER", "INDIGO"
  ].map((symbol, index) => [symbol, index]));
  const fundLikePattern = /\\b(ETF|BEES|LIQUID|GILT|SDL|TBILL|TREASURY|BOND)\\b|KOTAKMAMC|ICICIPRAMC|NIPPONAMC|NIP IND ETF|NETF|MIRAEASSET|HDFCMF|SBIMF|UTIAMC -|BIRLASLAMC -/i;
  return normalizeScannerRows(rows)
    .filter((row) => !fundLikePattern.test(\`\${row.symbol} \${row.name} \${row.trading_symbol || ""}\`))
    .sort((a, b) => {
      const rankA = prioritySymbols.has(a.symbol) ? prioritySymbols.get(a.symbol) : 10000;
      const rankB = prioritySymbols.has(b.symbol) ? prioritySymbols.get(b.symbol) : 10000;
      return rankA - rankB || a.symbol.localeCompare(b.symbol);
    })
    .slice(0, limit);
}
`;

  output = mustReplace(
    output,
    'function normalizeUpstoxEquityUniverse(records, limit = MAX_UNIVERSE_ROWS) {',
    `${prioritySortBlock}\nfunction normalizeUpstoxEquityUniverse(records, limit = MAX_UNIVERSE_ROWS) {`,
    'insert priority sort helper'
  );

  output = mustReplace(
    output,
    '  return normalizeScannerRows([...bySymbol.values()]).slice(0, limit);\n}',
    '  return prioritizedStockRows([...bySymbol.values()], limit);\n}',
    'prioritize loaded stock universe'
  );

  output = mustReplace(
    output,
    '  const baseRows = normalizeScannerUniverse(universeInput).filter((row) => row.instrument_key).slice(0, maxLimit);',
    '  const baseRows = prioritizedStockRows(normalizeScannerUniverse(universeInput).filter((row) => row.instrument_key), maxLimit);',
    'prioritize actual candle scan rows'
  );

  return output;
}
