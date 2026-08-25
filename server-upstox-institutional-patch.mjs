const UPSTOX_INSTITUTIONAL_FUNCTIONS = String.raw`
const UPSTOX_INSTITUTIONAL_VERSION = "ashstocks-upstox-institutional-v0.1";
const UPSTOX_SHARE_HOLDINGS_URL = "https://api.upstox.com/v2/fundamentals";
const UPSTOX_FII_ACTIVITY_URL = "https://api.upstox.com/v2/market/fii";
const UPSTOX_DII_ACTIVITY_URL = "https://api.upstox.com/v2/market/dii";
const UPSTOX_SHARE_HOLDINGS_CACHE_MS = 6 * 60 * 60 * 1000;
const UPSTOX_INSTITUTIONAL_MARKET_CACHE_MS = 15 * 60 * 1000;
const UPSTOX_INSTITUTIONAL_MAX_STOCKS = 12;
const upstoxShareHoldingCache = new Map();
let upstoxInstitutionalMarketCache = { at: 0, payload: null };

function institutionalRound(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
}

function institutionalIsin(input = {}) {
  const explicit = String(input.isin || "").trim().toUpperCase();
  const instrumentPart = String(input.instrument_key || input.instrumentKey || "").split("|").at(-1)?.trim().toUpperCase() || "";
  const candidate = explicit || instrumentPart;
  return /^INE[A-Z0-9]{9}$/.test(candidate) ? candidate : "";
}

function normalizeInstitutionalInputs(body = {}) {
  const source = Array.isArray(body.instruments) ? body.instruments : Array.isArray(body.rows) ? body.rows : [];
  const output = [];
  for (const raw of source) {
    const input = typeof raw === "string" ? { instrument_key: raw } : (raw || {});
    const symbol = normalizeSymbol(input.symbol || input.trading_symbol || "");
    const instrumentKey = String(input.instrument_key || input.instrumentKey || "").trim();
    const isin = institutionalIsin(input);
    const key = symbol || isin || instrumentKey;
    if (!key || output.some((item) => item.key === key)) continue;
    output.push({ key, symbol, instrument_key: instrumentKey, isin });
    if (output.length >= UPSTOX_INSTITUTIONAL_MAX_STOCKS) break;
  }
  return output;
}

function institutionalPeriodTime(period) {
  const parsed = Date.parse("1 " + String(period || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function categoryHistory(rows, category) {
  const entry = (Array.isArray(rows) ? rows : []).find((item) => String(item?.category || "").toLowerCase() === category);
  return (Array.isArray(entry?.history) ? entry.history : [])
    .map((item) => ({ period: String(item?.period || ""), value: quoteNumber(item?.value) }))
    .filter((item) => item.period && item.value !== null)
    .sort((a, b) => institutionalPeriodTime(b.period) - institutionalPeriodTime(a.period));
}

function holdingValueAt(history, period) {
  return history.find((item) => item.period === period)?.value ?? null;
}

function normalizeShareHoldings(rows, input) {
  const fii = categoryHistory(rows, "fii");
  const otherDii = categoryHistory(rows, "other_dii");
  const mutualFunds = categoryHistory(rows, "mutual_funds");
  const current = fii[0] || null;
  const previous = fii[1] || null;
  if (!current) {
    return {
      ...input,
      status: "DATA_NEEDED",
      reason: "Upstox share-holdings response has no FII category",
      source: "Upstox Share Holdings API",
      latest_reported_quarter: true
    };
  }
  const otherDiiValue = holdingValueAt(otherDii, current.period);
  const mutualFundValue = holdingValueAt(mutualFunds, current.period);
  const priorPeriod = previous?.period || null;
  const priorOtherDiiValue = priorPeriod ? holdingValueAt(otherDii, priorPeriod) : null;
  const priorMutualFundValue = priorPeriod ? holdingValueAt(mutualFunds, priorPeriod) : null;
  const diiHolding = [otherDiiValue, mutualFundValue].filter((value) => value !== null).reduce((sum, value) => sum + value, 0);
  const priorDiiHolding = [priorOtherDiiValue, priorMutualFundValue].filter((value) => value !== null).reduce((sum, value) => sum + value, 0);
  const fiiChange = previous ? current.value - previous.value : null;
  const otherDiiChange = otherDiiValue === null || priorOtherDiiValue === null ? null : otherDiiValue - priorOtherDiiValue;
  const mutualFundChange = mutualFundValue === null || priorMutualFundValue === null ? null : mutualFundValue - priorMutualFundValue;
  const diiChange = priorPeriod && (otherDiiValue !== null || mutualFundValue !== null) ? diiHolding - priorDiiHolding : null;
  const breadthCount = [fiiChange, otherDiiChange, mutualFundChange].filter((value) => value !== null && value > 0).length;
  return {
    ...input,
    status: "LIVE",
    source: "Upstox Share Holdings API",
    source_endpoint: "/v2/fundamentals/:isin/share-holdings",
    latest_reported_quarter: true,
    fii_holding_pct: institutionalRound(current.value),
    fii_period: current.period,
    fii_previous_holding_pct: previous ? institutionalRound(previous.value) : null,
    fii_previous_period: previous?.period || null,
    fii_change_pp: institutionalRound(fiiChange),
    fii_direction: fiiChange === null ? "NO_COMPARISON" : fiiChange > 0 ? "ACCUMULATING" : fiiChange < 0 ? "REDUCING" : "UNCHANGED",
    other_dii_holding_pct: otherDiiValue === null ? null : institutionalRound(otherDiiValue),
    mutual_fund_holding_pct: mutualFundValue === null ? null : institutionalRound(mutualFundValue),
    dii_holding_pct: otherDiiValue === null && mutualFundValue === null ? null : institutionalRound(diiHolding),
    dii_previous_holding_pct: priorOtherDiiValue === null && priorMutualFundValue === null ? null : institutionalRound(priorDiiHolding),
    dii_change_pp: institutionalRound(diiChange),
    other_dii_change_pp: institutionalRound(otherDiiChange),
    mutual_fund_change_pp: institutionalRound(mutualFundChange),
    institutional_breadth_increasing_count: breadthCount,
    institutional_holding_pct: institutionalRound(current.value + diiHolding)
  };
}

async function fetchUpstoxInstitutionalJson(url) {
  const accessToken = await currentUpstoxAccessToken();
  if (!accessToken) throw new Error("upstox_token_missing");
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: "Bearer " + accessToken
    }
  });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch (_) {}
  if (!response.ok) {
    const detail = payload?.errors?.[0]?.message || payload?.message || text.slice(0, 220);
    throw new Error("Upstox institutional data " + response.status + ": " + detail);
  }
  return payload;
}

async function fetchUpstoxShareHolding(input) {
  if (!input.isin) {
    return { ...input, status: "DATA_NEEDED", reason: "NSE ISIN is missing", source: "Upstox Share Holdings API", latest_reported_quarter: true };
  }
  const cached = upstoxShareHoldingCache.get(input.isin);
  if (cached && Date.now() - cached.at < UPSTOX_SHARE_HOLDINGS_CACHE_MS) return { ...cached.payload, cache_hit: true };
  const url = UPSTOX_SHARE_HOLDINGS_URL + "/" + encodeURIComponent(input.isin) + "/share-holdings";
  try {
    const payload = await fetchUpstoxInstitutionalJson(url);
    const normalized = normalizeShareHoldings(payload?.data || [], input);
    upstoxShareHoldingCache.set(input.isin, { at: Date.now(), payload: normalized });
    return normalized;
  } catch (error) {
    return { ...input, status: "DATA_NEEDED", reason: error.message, source: "Upstox Share Holdings API", latest_reported_quarter: true };
  }
}

function institutionalActivityRows(payload) {
  const rows = payload?.data?.["NSE_EQ|CASH"];
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      time_stamp: quoteNumber(row?.time_stamp),
      buy_amount: quoteNumber(row?.buy_amount),
      sell_amount: quoteNumber(row?.sell_amount)
    }))
    .filter((row) => row.time_stamp !== null && row.buy_amount !== null && row.sell_amount !== null)
    .sort((a, b) => b.time_stamp - a.time_stamp);
}

function institutionalNetCr(rows, days) {
  const window = rows.slice(0, days);
  if (!window.length) return null;
  return institutionalRound(window.reduce((sum, row) => sum + row.buy_amount - row.sell_amount, 0) / 10000000);
}

async function fetchUpstoxInstitutionalMarket() {
  if (upstoxInstitutionalMarketCache.payload && Date.now() - upstoxInstitutionalMarketCache.at < UPSTOX_INSTITUTIONAL_MARKET_CACHE_MS) {
    return { ...upstoxInstitutionalMarketCache.payload, cache_hit: true };
  }
  const query = "?data_type=" + encodeURIComponent("NSE_EQ|CASH") + "&interval=1D";
  try {
    const [fiiPayload, diiPayload] = await Promise.all([
      fetchUpstoxInstitutionalJson(UPSTOX_FII_ACTIVITY_URL + query),
      fetchUpstoxInstitutionalJson(UPSTOX_DII_ACTIVITY_URL + query)
    ]);
    const fiiRows = institutionalActivityRows(fiiPayload);
    const diiRows = institutionalActivityRows(diiPayload);
    const latestTimestamp = Math.max(fiiRows[0]?.time_stamp || 0, diiRows[0]?.time_stamp || 0);
    const payload = {
      status: fiiRows.length || diiRows.length ? "LIVE" : "DATA_NEEDED",
      source: "Upstox FII/DII Activity API",
      source_endpoints: ["/v2/market/fii", "/v2/market/dii"],
      amount_unit: "INR converted to crore",
      as_of: latestTimestamp ? new Date(latestTimestamp).toISOString() : null,
      fii_cash_1d_net_cr: institutionalNetCr(fiiRows, 1),
      fii_cash_5d_net_cr: institutionalNetCr(fiiRows, 5),
      dii_cash_1d_net_cr: institutionalNetCr(diiRows, 1),
      dii_cash_5d_net_cr: institutionalNetCr(diiRows, 5),
      fii_days: fiiRows.length,
      dii_days: diiRows.length
    };
    upstoxInstitutionalMarketCache = { at: Date.now(), payload };
    return payload;
  } catch (error) {
    return { status: "DATA_NEEDED", source: "Upstox FII/DII Activity API", reason: error.message };
  }
}

async function upstoxInstitutionalResponse(body = {}) {
  const inputs = normalizeInstitutionalInputs(body);
  if (!inputs.length) {
    return { ok: false, error: "institution_required", message: "Pass instruments with symbol and NSE instrument_key or ISIN", stocks: [], market: await fetchUpstoxInstitutionalMarket() };
  }
  const marketPromise = fetchUpstoxInstitutionalMarket();
  const stocks = [];
  for (let index = 0; index < inputs.length; index += 1) {
    if (index) await new Promise((resolve) => setTimeout(resolve, 100));
    stocks.push(await fetchUpstoxShareHolding(inputs[index]));
  }
  const market = await marketPromise;
  return {
    ok: stocks.some((stock) => stock.status === "LIVE") || market.status === "LIVE",
    version: UPSTOX_INSTITUTIONAL_VERSION,
    provider: "Upstox",
    as_of: new Date().toISOString(),
    stocks,
    market,
    requested: inputs.length,
    live_stocks: stocks.filter((stock) => stock.status === "LIVE").length,
    data_needed: stocks.filter((stock) => stock.status !== "LIVE").length,
    truth_labels: {
      stock_specific: "Quarterly FII/DII shareholding from Upstox by ISIN",
      market_wide: "Daily NSE cash FII/DII activity from Upstox",
      not_claimed: "No stock-wise daily FII cash-flow attribution"
    },
    token_printed: false
  };
}

function institutionalTunnelNode(previous, state, value, evidence, effect) {
  return { ...previous, state, value, evidence, effect };
}

function institutionalTunnelSummary(results) {
  const evaluated = results.filter((result) => result.state !== "SOURCE_REQUIRED");
  const positiveHits = results.filter((result) => result.state === "HIT").length;
  const riskClear = results.filter((result) => result.state === "CLEAR").length;
  const riskHits = results.filter((result) => result.state === "RISK").length;
  const misses = results.filter((result) => result.state === "MISS").length;
  const sourceRequired = results.length - evaluated.length;
  const evidenceScore = evaluated.length ? clamp(((positiveHits + riskClear) / evaluated.length) * 100, 0, 100) : 0;
  return {
    evaluated: evaluated.length,
    positive_hits: positiveHits,
    risk_clear: riskClear,
    risk_hits: riskHits,
    misses,
    source_required: sourceRequired,
    coverage_pct: round(evaluated.length / Math.max(1, results.length) * 100, 2),
    evidence_score: round(evidenceScore, 2)
  };
}

function attachUpstoxInstitutionalEvidence(row, stock, market) {
  if (!row?.parameter_tunnel?.results?.length) return { ...row, institutional_evidence: { stock, market } };
  const results = row.parameter_tunnel.results.map((result) => {
    if (result.id === "NO03" && stock?.status === "LIVE" && stock.fii_change_pp !== null) {
      return institutionalTunnelNode(result, stock.fii_change_pp > 0 ? "HIT" : "MISS", stock.fii_change_pp, "Upstox FII holding " + stock.fii_holding_pct + "% in " + stock.fii_period + "; QoQ change " + stock.fii_change_pp + " pp", "stock-specific reported ownership evidence");
    }
    if (result.id === "NO04" && stock?.status === "LIVE" && stock.dii_change_pp !== null) {
      return institutionalTunnelNode(result, stock.dii_change_pp > 0 ? "HIT" : "MISS", stock.dii_change_pp, "Upstox DII plus mutual-fund holding " + stock.dii_holding_pct + "%; QoQ change " + stock.dii_change_pp + " pp", "stock-specific reported domestic ownership evidence");
    }
    if (result.id === "NO05" && stock?.status === "LIVE") {
      const breadth = Number(stock.institutional_breadth_increasing_count || 0);
      return institutionalTunnelNode(result, breadth >= 2 ? "HIT" : "MISS", breadth, breadth + " of FII, other DII and mutual-fund groups increased QoQ", "stock-specific institutional breadth evidence");
    }
    if (result.id === "NO08" && market?.status === "LIVE" && market.fii_cash_5d_net_cr !== null) {
      return institutionalTunnelNode(result, market.fii_cash_5d_net_cr > 0 ? "HIT" : "MISS", market.fii_cash_5d_net_cr, "Upstox NSE cash FII five-day net " + market.fii_cash_5d_net_cr + " Cr", "market-wide institutional regime evidence");
    }
    return result;
  });
  const summary = institutionalTunnelSummary(results);
  const baseScore = tunnelFinite(row.base_score, tunnelFinite(row.score, 0));
  const hasExecutableEvidence = summary.evaluated > 0;
  const blendedScore = ["DATA_NEEDED", "BLOCKED"].includes(row.decision) || !hasExecutableEvidence
    ? baseScore
    : round(baseScore * 0.70 + summary.evidence_score * 0.30, 2);
  return {
    ...row,
    score: blendedScore,
    parameter_tunnel: { ...row.parameter_tunnel, summary, results },
    parameter_selection_effect: {
      ...(row.parameter_selection_effect || {}),
      status: hasExecutableEvidence ? "RANKED" : "BASE_SCORE_PRESERVED",
      base_score: baseScore,
      tunnel_score: summary.evidence_score,
      blended_score: blendedScore,
      hard_gate_decision_preserved: true,
      institutional_overlay: UPSTOX_INSTITUTIONAL_VERSION
    },
    institutional_evidence: { stock, market },
    fii_holding_pct: stock?.fii_holding_pct ?? null,
    fii_change_pp: stock?.fii_change_pp ?? null,
    fii5dNetCr: market?.fii_cash_5d_net_cr ?? null,
    dii5dNetCr: market?.dii_cash_5d_net_cr ?? null
  };
}

async function attachUpstoxInstitutionalScan(scan) {
  const instruments = (scan?.rows || []).slice(0, UPSTOX_INSTITUTIONAL_MAX_STOCKS).map((row) => ({ symbol: row.symbol, instrument_key: row.instrument_key, isin: row.isin || "" }));
  const institutional = await upstoxInstitutionalResponse({ instruments });
  const stocksBySymbol = new Map((institutional.stocks || []).map((stock) => [normalizeSymbol(stock.symbol), stock]));
  scan.rows = (scan.rows || []).map((row) => attachUpstoxInstitutionalEvidence(row, stocksBySymbol.get(normalizeSymbol(row.symbol)) || null, institutional.market || null));
  scan.rows.sort((a, b) => decisionRank(a.decision) - decisionRank(b.decision) || Number(b.score || 0) - Number(a.score || 0) || String(a.symbol).localeCompare(String(b.symbol)));
  scan.institutional = institutional;
  return scan;
}
`;

const UPSTOX_INSTITUTIONAL_ROUTES = String.raw`
      if (url.pathname === "/api/upstox/institutional-flow") {
        if (req.method !== "POST") {
          json(res, 405, { ok: false, error: "method_not_allowed", allowed: ["POST"] });
          return;
        }
        const payload = await upstoxInstitutionalResponse(await readJsonBody(req));
        json(res, payload.ok === false && payload.error ? 400 : 200, payload);
        return;
      }
`;

export function applyUpstoxInstitutionalPatches(source, mustReplace) {
  let output = source;
  output = mustReplace(
    output,
    '    historical_candles_only: true,\n    live_orders: false,\n    endpoint: "https://api.upstox.com/v2/historical-candle/{instrument_key}/day/{to_date}/{from_date}",',
    '    historical_candles_only: false,\n    live_quotes_enabled: true,\n    institutional_analytics_enabled: true,\n    institutional_sources: ["share_holdings", "fii_activity", "dii_activity"],\n    live_orders: false,\n    endpoint: "https://api.upstox.com/v2/historical-candle/{instrument_key}/day/{to_date}/{from_date}",',
    "Upstox runtime capability identity"
  );
  output = mustReplace(
    output,
    "\nasync function dataBankStatus() {",
    `${UPSTOX_INSTITUTIONAL_FUNCTIONS}\nasync function dataBankStatus() {`,
    "Upstox institutional functions"
  );
  output = mustReplace(
    output,
    '      if (url.pathname === "/api/upstox/status") {',
    `${UPSTOX_INSTITUTIONAL_ROUTES}\n      if (url.pathname === "/api/upstox/status") {`,
    "Upstox institutional route"
  );
  output = mustReplace(
    output,
    '  const scan = runScanner(fetchedRows, { ...(body.settings || {}), source: "Upstox historical candles", holdings: body.holdings || body.existingHoldings || [] });\n  return {\n    ...scan,',
    '  const scan = runScanner(fetchedRows, { ...(body.settings || {}), source: "Upstox historical candles", holdings: body.holdings || body.existingHoldings || [] });\n  await attachUpstoxInstitutionalScan(scan);\n  return {\n    ...scan,',
    "attach Upstox institutional evidence to scanner rows"
  );
  return output;
}
