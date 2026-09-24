const HOLDINGS_HISTORY_FUNCTIONS = String.raw`
const HOLDINGS_HISTORY_VERSION = "ashstocks-holdings-history-v0.1";

function completeHoldingCorrelationGate(row, holdings, threshold) {
  // Keep the governed formula and threshold unchanged. A successful comparison
  // with one holding cannot establish availability for the other holdings.
  const missingHoldings = [];
  for (const holding of holdings) {
    if (holding.symbol === row.symbol) continue;
    const correlation = correlateReturnSeries(row.candles, holding.candles, 60);
    if (!Number.isFinite(correlation)) {
      missingHoldings.push({ symbol: holding.symbol, instrument_key: holding.instrument_key || null,
        reason: "holding_return_series_not_comparable" });
    }
  }
  if (missingHoldings.length) return { ok: false, status: "data_needed", data_needed: true,
    max_correlation: null, blocking_symbol: null, threshold, missing_holdings: missingHoldings };
  // Includes the original no-holdings and self-only behavior.
  return correlationGate(row, holdings, threshold);
}

async function hydrateScannerHoldings(input = [], fetchedRows = [], from, to) {
  const source = Array.isArray(input) ? input : [];
  const holdings = source.map((row) => normalizeScannerRow(row || {}));
  const metadata = { version: HOLDINGS_HISTORY_VERSION, requested: holdings.length, loaded: 0, reused: 0, fetched: 0, failures: [] };
  if (!holdings.length) return { holdings, metadata };
  // Persisted positions deliberately do not contain historical candles. Resolve
  // missing identities from the saved master, never a default/sample universe.
  const store = await getStore();
  const state = await store.getState();
  const savedBySymbol = new Map();
  for (const row of normalizeScannerRows(state.universe || [])) {
    if (!row.symbol || !row.instrument_key) continue;
    const keys = savedBySymbol.get(row.symbol) || new Set();
    keys.add(row.instrument_key);
    savedBySymbol.set(row.symbol, keys);
  }
  const fetchedByKey = new Map((Array.isArray(fetchedRows) ? fetchedRows : [])
    .filter((row) => row.instrument_key)
    .map((row) => [row.instrument_key, row]));
  const needed = new Map();
  const fail = (holding, reason) => {
    holding.candles = [];
    holding.fetch_error = reason;
    holding.data_source = "Upstox holding history unavailable";
    metadata.failures.push({ symbol: holding.symbol, instrument_key: holding.instrument_key || null, reason });
  };
  const assign = (holding, candles, origin) => {
    holding.candles = normalizeCandles(candles);
    if (!holding.candles.length) { fail(holding, "holding_history_empty"); return; }
    // The unchanged correlation function requires at least 30 daily return
    // pairs, hence at least 31 prices. Partial histories are not usable input.
    if (holding.candles.length < 31) { fail(holding, "holding_history_insufficient"); return; }
    holding.fetch_error = "";
    holding.data_source = "Upstox historical candles";
    metadata.loaded += 1;
    metadata[origin] += 1;
  };
  for (const holding of holdings) {
    // Supplied candles are not accepted as a substitute for this provider read.
    holding.candles = [];
    if (!holding.symbol) { fail(holding, "holding_symbol_missing"); continue; }
    if (!holding.instrument_key) {
      const keys = savedBySymbol.get(holding.symbol);
      if (keys?.size === 1) holding.instrument_key = [...keys][0];
      else { fail(holding, keys?.size > 1 ? "holding_instrument_key_ambiguous" : "holding_instrument_key_missing"); continue; }
    }
    if (!/^NSE_EQ\|[A-Z0-9]+$/.test(holding.instrument_key)
      || (holding.isin && holding.instrument_key !== "NSE_EQ|" + holding.isin)) {
      fail(holding, "holding_instrument_identity_invalid");
      continue;
    }
    // A symbol-only match is unsafe after renames or instrument replacement.
    const fetched = fetchedByKey.get(holding.instrument_key);
    if (fetched) {
      if (fetched.fetch_error) fail(holding, "holding_history_fetch_failed: " + String(fetched.fetch_error).slice(0, 180));
      else assign(holding, fetched.candles, "reused");
      continue;
    }
    const group = needed.get(holding.instrument_key) || [];
    group.push(holding);
    needed.set(holding.instrument_key, group);
  }
  // Keep provider load bounded; duplicate holding identities share one fetch.
  const jobs = [...needed.entries()];
  const paceMs = Math.min(3000, Math.max(0, Math.floor(finiteOr(ENV.UPSTOX_SCAN_PACE_MS, 300))));
  const retryMs = Math.min(15000, Math.max(1000, Math.floor(finiteOr(ENV.UPSTOX_SCAN_RETRY_MS, 2500))));
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const [instrumentKey, group] = jobs[cursor++];
      if (paceMs) await new Promise((resolve) => setTimeout(resolve, paceMs));
      try {
        let candles;
        try { candles = await fetchUpstoxCandles(instrumentKey, from, to); }
        catch (error) {
          if (!/429|rate limit|1015/i.test(error.message || "")) throw error;
          await new Promise((resolve) => setTimeout(resolve, retryMs));
          candles = await fetchUpstoxCandles(instrumentKey, from, to);
        }
        for (const holding of group) assign(holding, candles, "fetched");
      } catch (error) {
        for (const holding of group) fail(holding, "holding_history_fetch_failed: " + String(error.message || error).slice(0, 180));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, jobs.length) }, () => worker()));
  return { holdings, metadata };
}
`;

export function applyHoldingsHistoryPatches(source, mustReplace) {
  let output = mustReplace(source,
    '\nasync function runUpstoxScanner(body = {}, fallbackUniverse = null) {',
    `\n${HOLDINGS_HISTORY_FUNCTIONS}\nasync function runUpstoxScanner(body = {}, fallbackUniverse = null) {`,
    "hydrate real holding histories for the unchanged correlation gate");
  output = mustReplace(output,
    '  const correlation = correlationGate(row, holdings, settings.correlationThreshold);',
    '  const correlation = completeHoldingCorrelationGate(row, holdings, settings.correlationThreshold);',
    "require every non-self holding comparison before the unchanged correlation gate");
  output = mustReplace(output,
    '  const scan = runScanner(fetchedRows, { ...(body.settings || {}), source: "Upstox historical candles", holdings: body.holdings || body.existingHoldings || [], cacheScan: body.cacheScan !== false });',
    '  const holdingHistory = await hydrateScannerHoldings(body.holdings || body.existingHoldings || [], fetchedRows, from, to);\n  if (holdingHistory.metadata.failures.length) return { ok: false, error: "holding_history_incomplete", message: "Holding histories are incomplete; no selection or paper entry was authorized. Retry after resolving the reported history failures.", holding_history: holdingHistory.metadata, from, to, scanned: fetchedRows.length, rows: [], failures: [] };\n  const scan = runScanner(fetchedRows, { ...(body.settings || {}), source: "Upstox historical candles", holdings: holdingHistory.holdings, cacheScan: body.cacheScan !== false });\n  scan.holding_history = holdingHistory.metadata;',
    "use verified holding histories and expose provider failures without dropping holdings");
  return output;
}
