function replaceNamedFunction(source, signature, replacement, label) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`Patch anchor missing: ${label}`);
  const bodyStart = source.indexOf("{", start);
  if (bodyStart < 0) throw new Error(`Patch body missing: ${label}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      return source.slice(0, start) + replacement + source.slice(index + 1);
    }
  }
  throw new Error(`Patch end missing: ${label}`);
}

const PAPER_ENGINE_AUTOBUY_FUNCTIONS = String.raw`
const PAPER_ENGINE_AUTOBUY_VERSION = "ashstocks-paper-engine-autobuy-v0.4-select-market";

function paperEngineAutoBuySettings(input = {}) {
  return {
    enabled: ENV.DISABLE_PAPER_ENGINE_AUTOBUY === "true" ? false : true,
    maxBuysPerRun: Math.min(10, Math.max(1, Math.floor(finiteOr(input.maxBuysPerRun ?? input.max_buys_per_run ?? ENV.PAPER_ENGINE_MAX_BUYS_PER_RUN, 3)))),
    requireScannerDecision: String(input.requireScannerDecision || ENV.PAPER_ENGINE_REQUIRED_DECISION || "SELECT").toUpperCase(),
    product: String(input.product || ENV.PAPER_ENGINE_PRODUCT || "Paper Swing").slice(0, 40),
    maxQuoteAgeSeconds: Math.min(120, Math.max(10, finiteOr(input.maxQuoteAgeSeconds ?? ENV.PAPER_ENGINE_MAX_QUOTE_AGE_SECONDS, 60))),
    maxSpreadBps: Math.min(100, Math.max(5, finiteOr(input.maxSpreadBps ?? ENV.PAPER_ENGINE_MAX_SPREAD_BPS, 25)))
  };
}

function paperEngineOpenSymbols(state = defaultState()) {
  return new Set(
    sanitizePaperTraderState(state.paperTrader || {}).positions
      .filter((position) => position.status !== "CLOSED" && finiteOr(position.qty, 0) > 0)
      .map((position) => normalizeSymbol(position.symbol))
      .filter(Boolean)
  );
}

function paperEngineCandidateTickets(plan = {}, state = defaultState(), settings = paperEngineAutoBuySettings(), scan = {}) {
  const openSymbols = paperEngineOpenSymbols(state);
  const plannedBySymbol = new Map((Array.isArray(plan.buy_queue) ? plan.buy_queue : []).map((ticket) => [normalizeSymbol(ticket.symbol), ticket]));
  const traderSettings = paperTraderSettings(plan.settings || {});
  const asOf = scan.asOf || new Date().toISOString();
  return (Array.isArray(scan.rows) ? scan.rows : [])
    .filter((scanRow) => String(scanRow.decision || "").toUpperCase() === settings.requireScannerDecision)
    .map((scanRow, index) => {
      const symbol = normalizeSymbol(scanRow.symbol);
      const ticket = plannedBySymbol.get(symbol) || paperBuyTicket(enrichPaperCandidate(scanRow, traderSettings), index, traderSettings, asOf);
      return {
        ...ticket,
        symbol,
        name: scanRow.name || ticket.name,
        sector: scanRow.sector || ticket.sector,
        instrument_key: scanRow.instrument_key || ticket.instrument_key,
        scanner_decision: scanRow.decision,
        selection_contract: "SELECT_FINAL",
        close: finiteOr(scanRow.close, ticket.close),
        parameter_tunnel: scanRow.parameter_tunnel || ticket.parameter_tunnel,
        parameter_selection_effect: scanRow.parameter_selection_effect || ticket.parameter_selection_effect
      };
    })
    .filter((ticket) => ticket.symbol)
    .filter((ticket) => !openSymbols.has(ticket.symbol))
    .filter((ticket) => finiteOr(ticket.close, null) && finiteOr(ticket.qty, 0) > 0)
    .slice(0, settings.maxBuysPerRun);
}

function paperEngineIstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function paperEngineMarketState(date = new Date()) {
  const parts = paperEngineIstParts(date);
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const weekday = !["Sat", "Sun"].includes(parts.weekday);
  const open = weekday && minute >= 9 * 60 + 15 && minute <= 15 * 60 + 30;
  return {
    open,
    label: open ? "NSE_OPEN" : "NSE_CLOSED",
    ist: parts.day + "-" + parts.month + "-" + parts.year + " " + parts.hour + ":" + parts.minute + ":" + parts.second + " IST"
  };
}

function paperEngineTimestampMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1e15) return Math.floor(value / 1000);
    if (value > 1e12) return value;
    if (value > 1e9) return value * 1000;
  }
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function paperEngineQuoteKey(value) {
  return String(value || "").trim().replace(":", "|");
}

function paperEngineQuoteMap(payload = {}) {
  const map = new Map();
  for (const quote of Array.isArray(payload.quotes) ? payload.quotes : []) {
    const key = paperEngineQuoteKey(quote.instrument_key);
    if (key) map.set(key, quote);
    const symbol = normalizeSymbol(quote.trading_symbol);
    if (symbol) map.set(symbol, quote);
  }
  return map;
}

function paperEngineQuoteEvidence(quote = {}, ticket = {}, settings = paperEngineAutoBuySettings()) {
  const timestampMs = paperEngineTimestampMs(quote.timestamp);
  const ageSeconds = timestampMs === null ? null : Math.max(0, (Date.now() - timestampMs) / 1000);
  const bids = Array.isArray(quote.depth?.bids) ? quote.depth.bids : [];
  const asks = Array.isArray(quote.depth?.asks) ? quote.depth.asks : [];
  const bestBid = finiteOr(bids[0]?.price, null);
  const bestAsk = finiteOr(asks[0]?.price, null);
  const midpoint = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : null;
  const spreadBps = midpoint ? ((bestAsk - bestBid) / midpoint) * 10000 : null;
  const buyQty = bids.slice(0, 5).reduce((sum, row) => sum + finiteOr(row.quantity, 0), 0);
  const sellQty = asks.slice(0, 5).reduce((sum, row) => sum + finiteOr(row.quantity, 0), 0);
  const depthImbalance = buyQty + sellQty ? (buyQty - sellQty) / (buyQty + sellQty) : null;
  let remaining = Math.max(0, finiteOr(ticket.qty, 0));
  let cost = 0;
  let filled = 0;
  for (const level of asks) {
    if (!remaining) break;
    const levelQty = Math.max(0, finiteOr(level.quantity, 0));
    const take = Math.min(remaining, levelQty);
    cost += take * finiteOr(level.price, 0);
    filled += take;
    remaining -= take;
  }
  const weightedFill = filled ? cost / filled : null;
  const fillPrice = finiteOr(weightedFill, finiteOr(bestAsk, finiteOr(quote.last_price, null)));
  const impactBps = midpoint && fillPrice ? (fillPrice / midpoint - 1) * 10000 : null;
  const lower = finiteOr(quote.lower_circuit_limit, null);
  const upper = finiteOr(quote.upper_circuit_limit, null);
  const last = finiteOr(quote.last_price, null);
  const circuitClear = last !== null && (lower === null || last > lower) && (upper === null || last < upper);
  const quoteFresh = ageSeconds !== null && ageSeconds <= settings.maxQuoteAgeSeconds;
  const marketPriceAvailable = fillPrice !== null && fillPrice > 0;
  const spreadClear = spreadBps === null ? false : spreadBps <= settings.maxSpreadBps;
  const depthClear = depthImbalance === null ? false : depthImbalance >= -0.20;
  const impactClear = impactBps === null ? false : impactBps <= 20;
  return {
    quote_timestamp: quote.timestamp || null,
    quote_age_seconds: ageSeconds === null ? null : round(ageSeconds, 3),
    quote_fresh: quoteFresh,
    fill_price: marketPriceAvailable ? round(fillPrice, 4) : null,
    market_price_available: marketPriceAvailable,
    best_bid: bestBid,
    best_ask: bestAsk,
    spread_bps: spreadBps === null ? null : round(spreadBps, 3),
    depth_imbalance: depthImbalance === null ? null : round(depthImbalance, 4),
    estimated_impact_bps: impactBps === null ? null : round(impactBps, 3),
    circuit_clear: circuitClear,
    all_clear: quoteFresh && marketPriceAvailable && circuitClear,
    nodes: [
      { id: "NBX01", state: quoteFresh ? "HIT" : "MISS", value: ageSeconds === null ? null : round(ageSeconds, 3), evidence: quote.timestamp ? "Real Upstox quote timestamp" : "Quote timestamp absent" },
      { id: "NBX02", state: spreadClear ? "HIT" : "MISS", value: spreadBps === null ? null : round(spreadBps, 3), evidence: "Best Upstox bid and ask; recorded but non-blocking after SELECT" },
      { id: "NBX03", state: depthClear ? "HIT" : "MISS", value: depthImbalance === null ? null : round(depthImbalance, 4), evidence: "Top-five Upstox depth; recorded but non-blocking after SELECT" },
      { id: "NBX04", state: impactClear ? "HIT" : "MISS", value: impactBps === null ? null : round(impactBps, 3), evidence: "Requested paper quantity walked through real ask depth; recorded but non-blocking after SELECT" },
      { id: "NBX05", state: "HIT", value: round(Math.abs(finiteOr(quote.last_price, 0) - finiteOr(ticket.close, 0)) / Math.max(0.01, finiteOr(ticket.close, 0)) * 10000, 3), evidence: "Real quote versus scanner decision close" },
      { id: "NBX06", state: quoteFresh ? "HIT" : "MISS", value: ageSeconds === null ? null : round(ageSeconds, 3), evidence: "Trigger evaluated against quote timestamp" },
      { id: "NBX07", state: remaining === 0 || !asks.length ? "HIT" : "MISS", value: remaining === 0 ? 1 : round(filled / Math.max(1, finiteOr(ticket.qty, 1)), 3), evidence: "Paper market price uses weighted ask depth, then best ask/LTP fallback" },
      { id: "NBX08", state: circuitClear ? "HIT" : "MISS", value: last, evidence: "LTP checked against Upstox circuit limits" }
    ]
  };
}
`;

const PAPER_ENGINE_RUN_REPLACEMENT = String.raw`async function runPaperEngineOnce(trigger = "manual", slot = null) {
  const store = await getStore();
  let state = await store.getState();
  const accessToken = await currentUpstoxAccessToken();
  if (!accessToken) {
    const result = { ok: false, error: "upstox_token_missing", trigger, slot, status: await upstoxRuntimeStatus() };
    paperEngineState.lastResult = result;
    return result;
  }

  const cachedScanAgeMs = latestParameterTunnelScan?.asOf ? Date.now() - Date.parse(latestParameterTunnelScan.asOf) : Infinity;
  const cachedScan = cachedScanAgeMs >= 0 && cachedScanAgeMs <= 5 * 60 * 1000 && Array.isArray(latestParameterTunnelScan?.rows) && latestParameterTunnelScan.rows.length
    ? latestParameterTunnelScan
    : null;
  const scan = cachedScan || await runUpstoxScanner({ universe: state.universe, settings: state.scannerSettings, holdings: state.paperTrader?.positions || [] }, state.universe);
  if (!scan.ok) {
    const result = { ...scan, trigger, slot };
    paperEngineState.lastResult = result;
    return result;
  }

  const ledger = await appendScanLedger(scan, {
    store,
    mode: slot?.time ? "paper-engine-" + slot.time : "paper-engine-manual",
    source: "paper-engine-upstox-historical"
  });

  const autoSettings = paperEngineAutoBuySettings();
  const plan = buildPaperTraderPlan(scan, state, { settings: state.scannerSettings || {} });
  let workingState = state;
  const tickets = autoSettings.enabled ? paperEngineCandidateTickets(plan, workingState, autoSettings, scan) : [];
  const market = paperEngineMarketState();
  const scanBySymbol = new Map((scan.rows || []).map((row) => [normalizeSymbol(row.symbol), row]));
  const universeBySymbol = new Map(normalizeScannerUniverse(state.universe || []).map((row) => [normalizeSymbol(row.symbol), row]));
  const quoteKeys = unique([
    ...tickets.map((ticket) => scanBySymbol.get(normalizeSymbol(ticket.symbol))?.instrument_key),
    ...sanitizePaperTraderState(workingState.paperTrader || {}).positions.map((position) => position.instrument_key || universeBySymbol.get(normalizeSymbol(position.symbol))?.instrument_key)
  ].filter(Boolean));
  let quotePayload = { ok: true, quotes: [], asOf: new Date().toISOString() };
  let quoteError = "";
  if (quoteKeys.length) {
    try {
      quotePayload = await fetchUpstoxMarketQuotes(quoteKeys);
    } catch (error) {
      quoteError = error.message;
    }
  }
  const quoteMap = paperEngineQuoteMap(quotePayload);
  let monitor = null;
  if (autoSettings.enabled && market.open) {
    const monitorRows = sanitizePaperTraderState(workingState.paperTrader || {}).positions.flatMap((position) => {
      const baseRow = scanBySymbol.get(normalizeSymbol(position.symbol)) || universeBySymbol.get(normalizeSymbol(position.symbol)) || { symbol: position.symbol, instrument_key: position.instrument_key };
      const quote = quoteMap.get(paperEngineQuoteKey(baseRow.instrument_key)) || quoteMap.get(normalizeSymbol(position.symbol));
      const timestampMs = paperEngineTimestampMs(quote?.timestamp);
      const fresh = timestampMs !== null && Date.now() - timestampMs <= autoSettings.maxQuoteAgeSeconds * 1000;
      return quote && fresh && finiteOr(quote.last_price, null)
        ? [{ ...baseRow, symbol: position.symbol, close: quote.last_price, ltp: quote.last_price, last_price: quote.last_price, last_candle_date: quote.timestamp, data_source: "Upstox Market Quote API" }]
        : [];
    });
    monitor = applyPaperLifecycleMonitor(workingState, monitorRows, { source: "paper-engine-upstox-real-quote-monitor" });
    workingState = monitor.nextState;
  }

  const orders = [];
  const rejected = [];
  for (const ticket of tickets) {
    const scanRow = scanBySymbol.get(normalizeSymbol(ticket.symbol)) || {};
    const quote = quoteMap.get(paperEngineQuoteKey(scanRow.instrument_key)) || quoteMap.get(normalizeSymbol(ticket.symbol));
    if (!market.open) {
      rejected.push({ symbol: ticket.symbol, rejection_reason: "NSE is closed; automatic market fill waits for a real open-session quote", market });
      continue;
    }
    if (!quote || !finiteOr(quote.last_price, null)) {
      rejected.push({ symbol: ticket.symbol, rejection_reason: quoteError || "real Upstox quote missing" });
      continue;
    }
    const executionEvidence = paperEngineQuoteEvidence(quote, ticket, autoSettings);
    if (!executionEvidence.all_clear) {
      const rejectionReason = !executionEvidence.quote_fresh
        ? "Upstox market quote is stale"
        : !executionEvidence.market_price_available
          ? "Upstox market price is unavailable"
          : !executionEvidence.circuit_clear
            ? "Stock is at an Upstox circuit limit"
            : "Real Upstox market-price gate failed";
      rejected.push({ symbol: ticket.symbol, rejection_reason: rejectionReason, execution_evidence: executionEvidence });
      continue;
    }
    const parameterEvidence = {
      ...(ticket.parameter_tunnel?.summary || {}),
      top_hits: (ticket.parameter_tunnel?.results || []).filter((item) => item.state === "HIT").slice(0, 12).map((item) => item.id),
      risk_hits: (ticket.parameter_tunnel?.results || []).filter((item) => item.state === "RISK").slice(0, 12).map((item) => item.id),
      version: ticket.parameter_tunnel?.version || PARAMETER_TUNNEL_VERSION
    };
    const orderBody = {
      symbol: ticket.symbol,
      name: ticket.name,
      sector: ticket.sector,
      instrument_key: scanRow.instrument_key,
      side: "BUY",
      order_type: "MARKET",
      qty: ticket.qty,
      price: executionEvidence.fill_price,
      decision_price: ticket.close,
      quote_timestamp: quote.timestamp,
      target_price: ticket.target_price,
      stop_price: ticket.stop_price,
      product: autoSettings.product,
      source: "paper-engine-autobuy",
      thesis: ticket.thesis || ("Auto paper buy from " + ticket.scanner_decision + " scan"),
      parameter_evidence: parameterEvidence,
      execution_evidence: executionEvidence
    };
    const orderResult = applyPaperOrderLifecycle(workingState, orderBody);
    workingState = orderResult.nextState;
    if (orderResult.ok) orders.push(orderResult.order);
    else rejected.push(orderResult.order || { symbol: ticket.symbol, rejection_reason: orderResult.error || "paper order rejected" });
  }

  const savedPaperTrader = sanitizePaperTraderState({
    ...(workingState.paperTrader || {}),
    last_run: scan.asOf || new Date().toISOString(),
    last_plan: plan,
    history: plan.history
  });
  await store.saveState({ ...workingState, paperTrader: savedPaperTrader });

  const result = {
    ok: true,
    trigger,
    slot,
    engine: PAPER_ENGINE_AUTOBUY_VERSION,
    ledger: scanLedgerMeta(ledger),
    summary: scan.summary,
    scanned: scan.scanned,
    plan_summary: plan.summary,
    auto_buy: {
      enabled: autoSettings.enabled,
      selection_contract: "SELECT_FINAL",
      fill_method: "UPSTOX_WEIGHTED_ASK_OR_LTP",
      required_decision: autoSettings.requireScannerDecision,
      max_buys_per_run: autoSettings.maxBuysPerRun,
      candidates_ready: tickets.length,
      orders_filled: orders.length,
      rejected: rejected.length,
      orders: orders.map((order) => ({ id: order.id, symbol: order.symbol, qty: order.qty, price: order.price, quote_timestamp: order.quote_timestamp, target_price: order.target_price, stop_price: order.stop_price, status: order.status, parameter_evidence: order.parameter_evidence })),
      rejections: rejected.slice(0, 20)
    },
    monitor: monitor ? {
      events: monitor.events || [],
      data_needed: monitor.data_needed || []
    } : null,
    funds: paperLifecycleFunds(savedPaperTrader),
    positions: savedPaperTrader.positions.slice(0, 20),
    market,
    quote_error: quoteError || null,
    scan_cache_used: Boolean(cachedScan),
    safety: { paper_only: true, live_orders: false, broker_write_enabled: false, upstox_quotes_required_for_fills: true }
  };
  paperEngineState.lastRunAt = new Date().toISOString();
  paperEngineState.lastSlotKey = slot?.key || null;
  paperEngineState.lastResult = result;
  return result;
}`;

export function applyPaperEngineAutoBuyPatches(source) {
  let output = source;
  output = output.replace(
    "\nasync function runPaperEngineOnce(trigger = \"manual\", slot = null) {",
    `\n${PAPER_ENGINE_AUTOBUY_FUNCTIONS}\nasync function runPaperEngineOnce(trigger = "manual", slot = null) {`
  );
  return replaceNamedFunction(
    output,
    "async function runPaperEngineOnce(trigger = \"manual\", slot = null)",
    PAPER_ENGINE_RUN_REPLACEMENT,
    "paper engine auto buy run"
  );
}
