import { loadPaperCapitalPolicy } from "./lib/paper-capital-policy.mjs";

const paperCapitalPolicy = loadPaperCapitalPolicy();

const PAPER_ORDER_LIFECYCLE_FUNCTIONS = String.raw`
const PAPER_ORDER_LIFECYCLE_VERSION = "ashstocks-paper-order-lifecycle-v0.7-server-quote-authority";
const PAPER_CAPITAL_POLICY = Object.freeze(${JSON.stringify(paperCapitalPolicy)});
function sanitizeParameterEvidence(input = {}) {
  return {
    version: String(input.version || "").slice(0, 80),
    evaluated: Math.max(0, Math.floor(finiteOr(input.evaluated, 0))),
    positive_hits: Math.max(0, Math.floor(finiteOr(input.positive_hits, 0))),
    risk_clear: Math.max(0, Math.floor(finiteOr(input.risk_clear, 0))),
    risk_hits: Array.isArray(input.risk_hits) ? input.risk_hits.map(String).slice(0, 20) : Math.max(0, Math.floor(finiteOr(input.risk_hits, 0))),
    misses: Math.max(0, Math.floor(finiteOr(input.misses, 0))),
    source_required: Math.max(0, Math.floor(finiteOr(input.source_required, 0))),
    coverage_pct: round(finiteOr(input.coverage_pct, 0), 2),
    evidence_score: round(finiteOr(input.evidence_score, 0), 2),
    top_hits: Array.isArray(input.top_hits) ? input.top_hits.map(String).slice(0, 20) : []
  };
}
function sanitizeExecutionEvidence(input = {}) {
  return {
    price_source: String(input.price_source || "").slice(0, 80),
    server_verified: Boolean(input.server_verified),
    quote_timestamp: String(input.quote_timestamp || "").slice(0, 40),
    quote_age_seconds: finiteOr(input.quote_age_seconds, null),
    quote_fresh: Boolean(input.quote_fresh),
    market_price_available: Boolean(input.market_price_available),
    best_bid: finiteOr(input.best_bid, null),
    best_ask: finiteOr(input.best_ask, null),
    spread_bps: finiteOr(input.spread_bps, null),
    depth_imbalance: finiteOr(input.depth_imbalance, null),
    estimated_impact_bps: finiteOr(input.estimated_impact_bps, null),
    circuit_clear: Boolean(input.circuit_clear),
    all_clear: Boolean(input.all_clear),
    nodes: Array.isArray(input.nodes) ? input.nodes.slice(0, 12).map((node) => ({
      id: String(node.id || "").slice(0, 20),
      state: String(node.state || "").slice(0, 20),
      value: finiteOr(node.value, null),
      evidence: String(node.evidence || "").slice(0, 180)
    })) : []
  };
}
function defaultPaperFunds() {
  return {
    currency: PAPER_CAPITAL_POLICY.currency,
    policy_version: PAPER_CAPITAL_POLICY.policyVersion,
    starting_capital: PAPER_CAPITAL_POLICY.startingCapital,
    deployment_target_pct: PAPER_CAPITAL_POLICY.deploymentTargetPct,
    minimum_entry_value: PAPER_CAPITAL_POLICY.minimumEntryValue,
    maximum_candidate_entries: PAPER_CAPITAL_POLICY.maximumCandidateEntries,
    maximum_open_positions: PAPER_CAPITAL_POLICY.maximumOpenPositions,
    affordable_open_positions_at_minimum: PAPER_CAPITAL_POLICY.affordableOpenPositionsAtMinimum,
    transaction_cost_one_way_pct: PAPER_CAPITAL_POLICY.transactionCostOneWayPct,
    transaction_costs_paid: 0,
    realized_pnl: 0
  };
}
function sanitizePaperFunds(input = {}) {
  const base = defaultPaperFunds();
  return {
    ...base,
    currency: PAPER_CAPITAL_POLICY.currency,
    starting_capital: PAPER_CAPITAL_POLICY.startingCapital,
    transaction_costs_paid: round(finiteOr(input.transaction_costs_paid ?? input.transactionCostsPaid ?? base.transaction_costs_paid, base.transaction_costs_paid), 2),
    realized_pnl: round(finiteOr(input.realized_pnl ?? input.realizedPnl ?? base.realized_pnl, base.realized_pnl), 2)
  };
}
function sanitizePaperOrder(order = {}) {
  const symbol = normalizeSymbol(order.symbol);
  return {
    id: String(order.id || "").slice(0, 64),
    idempotency_key: String(order.idempotency_key || order.idempotencyKey || "").trim().slice(0, 128),
    request_fingerprint: String(order.request_fingerprint || "").slice(0, 500),
    logical_fingerprint: String(order.logical_fingerprint || "").slice(0, 500),
    symbol,
    instrument_key: String(order.instrument_key || "").slice(0, 100),
    name: String(order.name || symbol).slice(0, 120),
    side: String(order.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
    product: String(order.product || "Paper Swing").slice(0, 40),
    order_type: String(order.order_type || order.orderType || "MARKET").toUpperCase().slice(0, 20),
    qty: Math.max(0, Math.floor(finiteOr(order.qty, 0))),
    price: finiteOr(order.price ?? order.entry_price, null),
    price_source: String(order.price_source || "").slice(0, 80),
    transaction_cost: round(finiteOr(order.transaction_cost ?? order.transactionCost, 0), 2),
    decision_price: finiteOr(order.decision_price, null),
    quote_timestamp: String(order.quote_timestamp || "").slice(0, 40),
    target_price: finiteOr(order.target_price ?? order.targetPrice, null),
    stop_price: finiteOr(order.stop_price ?? order.stopPrice, null),
    status: String(order.status || "PAPER_CREATED").slice(0, 40),
    rejection_reason: String(order.rejection_reason || "").slice(0, 220),
    source: String(order.source || "ashstocks-paper-ticket").slice(0, 80),
    thesis: String(order.thesis || "").slice(0, 360),
    parameter_evidence: sanitizeParameterEvidence(order.parameter_evidence || {}),
    execution_evidence: sanitizeExecutionEvidence(order.execution_evidence || {}),
    created_at: String(order.created_at || "").slice(0, 40),
    updated_at: String(order.updated_at || order.created_at || "").slice(0, 40),
    paper_only: true,
    broker_write_enabled: false
  };
}
function sanitizePaperTrade(trade = {}) {
  const symbol = normalizeSymbol(trade.symbol);
  const side = String(trade.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
  const qty = Math.max(0, Math.floor(finiteOr(trade.qty, 0)));
  const price = finiteOr(trade.price, null);
  const value = round(finiteOr(trade.value, qty && price ? qty * price : 0), 2);
  const realizedPnl = round(finiteOr(trade.realized_pnl ?? trade.realizedPnl, 0), 2);
  const grossRealizedPnl = round(finiteOr(trade.gross_realized_pnl ?? trade.grossRealizedPnl, realizedPnl), 2);
  const derivedEntryValue = side === "SELL" ? round(value - realizedPnl, 2) : value;
  const entryValue = round(finiteOr(trade.entry_value ?? trade.entryValue, derivedEntryValue), 2);
  const exitValue = side === "SELL"
    ? round(finiteOr(trade.exit_value ?? trade.exitValue, value), 2)
    : null;
  const entryPrice = finiteOr(
    trade.entry_price ?? trade.entryPrice,
    qty > 0 && entryValue > 0 ? entryValue / qty : price
  );
  const exitPrice = side === "SELL"
    ? finiteOr(trade.exit_price ?? trade.exitPrice, price)
    : null;
  const entryCost = round(finiteOr(trade.entry_cost ?? trade.entryCost, side === "BUY" ? trade.transaction_cost ?? trade.transactionCost : 0), 2);
  const exitCost = round(finiteOr(trade.exit_cost ?? trade.exitCost, side === "SELL" ? trade.transaction_cost ?? trade.transactionCost : 0), 2);
  const transactionCost = round(finiteOr(trade.transaction_cost ?? trade.transactionCost, side === "SELL" ? exitCost : entryCost), 2);
  const netEntryValue = round(finiteOr(trade.net_entry_value ?? trade.netEntryValue, entryValue + entryCost), 2);
  const netExitValue = side === "SELL"
    ? round(finiteOr(trade.net_exit_value ?? trade.netExitValue, exitValue - exitCost), 2)
    : null;
  const returnPct = side === "SELL" && netEntryValue > 0
    ? round(finiteOr(trade.return_pct ?? trade.returnPct, realizedPnl / netEntryValue * 100), 4)
    : null;
  return {
    id: String(trade.id || "").slice(0, 64),
    order_id: String(trade.order_id || trade.orderId || "").slice(0, 64),
    symbol,
    instrument_key: String(trade.instrument_key || "").slice(0, 100),
    side,
    qty,
    price,
    price_source: String(trade.price_source || "").slice(0, 80),
    quote_timestamp: String(trade.quote_timestamp || "").slice(0, 40),
    value,
    entry_price: entryPrice,
    exit_price: exitPrice,
    entry_value: entryValue,
    exit_value: exitValue,
    entry_cost: entryCost,
    exit_cost: exitCost,
    transaction_cost: transactionCost,
    round_trip_cost: side === "SELL" ? round(entryCost + exitCost, 2) : null,
    net_entry_value: netEntryValue,
    net_exit_value: netExitValue,
    gross_realized_pnl: grossRealizedPnl,
    realized_pnl: realizedPnl,
    return_pct: returnPct,
    entry_at: String(trade.entry_at || trade.entryAt || "").slice(0, 40),
    exit_at: String(trade.exit_at || trade.exitAt || trade.traded_at || "").slice(0, 40),
    holding_days: finiteOr(trade.holding_days ?? trade.holdingDays, null),
    close_reason: String(trade.close_reason || trade.closeReason || "").slice(0, 240),
    traded_at: String(trade.traded_at || "").slice(0, 40),
    paper_only: true,
    broker_write_enabled: false
  };
}
function paperHoldingDays(entryAt, exitAt) {
  const entryMs = Date.parse(String(entryAt || ""));
  const exitMs = Date.parse(String(exitAt || ""));
  if (!Number.isFinite(entryMs) || !Number.isFinite(exitMs) || exitMs < entryMs) return null;
  return round((exitMs - entryMs) / 86400000, 2);
}
function paperClosedTradeSummary(trade = {}) {
  const clean = sanitizePaperTrade(trade);
  if (clean.side !== "SELL" || clean.qty <= 0) return null;
  return {
    id: clean.id,
    order_id: clean.order_id,
    symbol: clean.symbol,
    qty: clean.qty,
    entry_price: clean.entry_price,
    exit_price: clean.exit_price,
    entry_value: clean.entry_value,
    exit_value: clean.exit_value,
    entry_cost: clean.entry_cost,
    exit_cost: clean.exit_cost,
    round_trip_cost: clean.round_trip_cost,
    net_entry_value: clean.net_entry_value,
    net_exit_value: clean.net_exit_value,
    gross_realized_pnl: clean.gross_realized_pnl,
    realized_pnl: clean.realized_pnl,
    return_pct: clean.return_pct,
    entry_at: clean.entry_at,
    exit_at: clean.exit_at || clean.traded_at,
    holding_days: clean.holding_days,
    close_reason: clean.close_reason,
    paper_only: true
  };
}
function sanitizePaperGtt(plan = {}) {
  const symbol = normalizeSymbol(plan.symbol);
  return {
    id: String(plan.id || "").slice(0, 64),
    idempotency_key: String(plan.idempotency_key || plan.idempotencyKey || "").trim().slice(0, 128),
    request_fingerprint: String(plan.request_fingerprint || "").slice(0, 500),
    logical_fingerprint: String(plan.logical_fingerprint || "").slice(0, 500),
    symbol,
    instrument_key: String(plan.instrument_key || "").slice(0, 100),
    name: String(plan.name || symbol).slice(0, 120),
    side: String(plan.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
    qty: Math.max(0, Math.floor(finiteOr(plan.qty, 0))),
    entry_price: finiteOr(plan.entry_price ?? plan.price, null),
    target_price: finiteOr(plan.target_price ?? plan.targetPrice, null),
    stop_price: finiteOr(plan.stop_price ?? plan.stopPrice, null),
    status: String(plan.status || "ACTIVE").slice(0, 40),
    thesis: String(plan.thesis || "").slice(0, 360),
    created_at: String(plan.created_at || "").slice(0, 40),
    triggered_at: String(plan.triggered_at || "").slice(0, 40),
    paper_only: true,
    broker_write_enabled: false
  };
}
function paperLifecycleNow() {
  return new Date().toISOString();
}
function paperLedgerId(prefix) {
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}
function paperPositionValuation(position = {}) {
  const clean = sanitizePaperPosition(position);
  const qty = Math.max(0, Math.floor(finiteOr(clean.qty, 0)));
  const entry = finiteOr(clean.entry_price, null);
  const current = finiteOr(clean.current_price, entry);
  const investedNotional = entry === null ? null : round(qty * entry, 2);
  const entryCost = round(finiteOr(clean.entry_cost, 0), 2);
  const investedValue = investedNotional === null ? null : round(investedNotional + entryCost, 2);
  const marketValue = current === null ? null : round(qty * current, 2);
  const unrealizedPnl = investedValue === null || marketValue === null ? null : round(marketValue - investedValue, 2);
  const unrealizedPnlPct = investedValue ? round((unrealizedPnl / investedValue) * 100, 2) : null;
  return {
    ...clean,
    invested_notional: investedNotional,
    entry_cost: entryCost,
    invested_value: investedValue,
    market_value: marketValue,
    unrealized_pnl: unrealizedPnl,
    unrealized_pnl_pct: unrealizedPnlPct
  };
}
function paperTransactionCost(value) {
  return round(Math.max(0, finiteOr(value, 0)) * PAPER_CAPITAL_POLICY.transactionCostOneWayPct / 100, 2);
}
function paperLifecycleFunds(paperTrader = {}) {
  const funds = sanitizePaperFunds(paperTrader.funds || {});
  const positions = Array.isArray(paperTrader.positions) ? paperTrader.positions.map(paperPositionValuation) : [];
  const invested = positions.reduce((sum, position) => sum + finiteOr(position.invested_value, 0), 0);
  const marketValue = positions.reduce((sum, position) => sum + finiteOr(position.market_value, 0), 0);
  const unrealizedPnl = positions.reduce((sum, position) => sum + finiteOr(position.unrealized_pnl, 0), 0);
  const activeBuyGtt = Array.isArray(paperTrader.gtt)
    ? paperTrader.gtt.filter((plan) => plan.status === "ACTIVE" && plan.side === "BUY")
    : [];
  const reservedGttValue = activeBuyGtt.reduce(
    (sum, plan) => {
      const value = finiteOr(plan.qty, 0) * finiteOr(plan.entry_price, 0);
      return sum + value + paperTransactionCost(value);
    },
    0
  );
  const closedTrades = Array.isArray(paperTrader.trades)
    ? paperTrader.trades.map(paperClosedTradeSummary).filter(Boolean)
    : [];
  const totalPnl = round(funds.realized_pnl + unrealizedPnl, 2);
  const buyingPower = round(
    funds.starting_capital + funds.realized_pnl - invested - reservedGttValue,
    2
  );
  return {
    ...funds,
    invested_value: round(invested, 2),
    market_value: round(marketValue, 2),
    reserved_gtt_value: round(reservedGttValue, 2),
    unrealized_pnl: round(unrealizedPnl, 2),
    total_pnl: totalPnl,
    equity_value: round(funds.starting_capital + totalPnl, 2),
    buying_power: buyingPower,
    deployment_pct: funds.starting_capital
      ? round((invested + reservedGttValue) / funds.starting_capital * 100, 2)
      : 0,
    open_positions: positions.filter((position) => position.qty > 0).length,
    open_orders: Array.isArray(paperTrader.orders) ? paperTrader.orders.filter((order) => ["PAPER_CREATED", "PENDING", "OPEN", "TRIGGER_PENDING"].includes(order.status)).length : 0,
    filled_orders: Array.isArray(paperTrader.orders) ? paperTrader.orders.filter((order) => ["PAPER_FILLED", "FILLED"].includes(order.status)).length : 0,
    active_gtt: Array.isArray(paperTrader.gtt) ? paperTrader.gtt.filter((plan) => plan.status === "ACTIVE").length : 0,
    closed_trades: closedTrades.length,
    available_minimum_entry_slots: Math.max(
      0,
      Math.min(
        PAPER_CAPITAL_POLICY.maximumOpenPositions - positions.filter((position) => position.qty > 0).length - activeBuyGtt.length,
        Math.floor(Math.max(0, buyingPower) / PAPER_CAPITAL_POLICY.minimumEntryValue)
      )
    ),
    paper_only: true,
    broker_write_enabled: false
  };
}
async function refreshPaperTraderMarks(state = defaultState(), store = null) {
  const paperTrader = sanitizePaperTraderState(state.paperTrader || {});
  const universeBySymbol = new Map(normalizeScannerUniverse(state.universe || []).map((row) => [normalizeSymbol(row.symbol), row]));
  const keys = unique(paperTrader.positions.map((position) => position.instrument_key || universeBySymbol.get(normalizeSymbol(position.symbol))?.instrument_key).filter(Boolean));
  if (!keys.length) {
    return { paperTrader, quote_error: null, quote_as_of: null, marked_positions: 0, unpriced_symbols: paperTrader.positions.map((position) => position.symbol) };
  }
  try {
    const quotePayload = await fetchUpstoxMarketQuotes(keys);
    const quoteMap = paperEngineQuoteMap(quotePayload);
    const quoteAsOf = quotePayload.asOf || new Date().toISOString();
    let markedPositions = 0;
    const unpricedSymbols = [];
    const positions = paperTrader.positions.map((position) => {
      const instrumentKey = position.instrument_key || universeBySymbol.get(normalizeSymbol(position.symbol))?.instrument_key || "";
      const quote = quoteMap.get(paperEngineQuoteKey(instrumentKey)) || quoteMap.get(normalizeSymbol(position.symbol));
      const price = finiteOr(quote?.last_price, null);
      if (price === null) {
        unpricedSymbols.push(position.symbol);
        return position;
      }
      markedPositions += 1;
      return sanitizePaperPosition({
        ...position,
        instrument_key: instrumentKey,
        current_price: price,
        quote_timestamp: quote.timestamp || position.quote_timestamp,
        checked_at: quote.timestamp || quoteAsOf
      });
    });
    const saved = sanitizePaperTraderState({ ...paperTrader, positions });
    if (store && markedPositions) await store.saveState({ ...state, paperTrader: saved });
    return { paperTrader: saved, quote_error: null, quote_as_of: quoteAsOf, marked_positions: markedPositions, unpriced_symbols: unpricedSymbols };
  } catch (error) {
    return { paperTrader, quote_error: error.message, quote_as_of: null, marked_positions: 0, unpriced_symbols: paperTrader.positions.map((position) => position.symbol) };
  }
}
function paperOrderRequest(body = {}) {
  const symbol = normalizeSymbol(body.symbol || body.trading_symbol || body.tradingSymbol);
  const side = String(body.side || body.action || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
  const product = String(body.product || body.product_type || body.productType || "Paper Swing").slice(0, 40);
  const orderType = String(body.order_type || body.orderType || "MARKET").toUpperCase().slice(0, 20);
  const qty = Math.max(0, Math.floor(finiteOr(body.qty ?? body.quantity, 0)));
  const price = finiteOr(body.price ?? body.entry_price ?? body.entryPrice ?? body.close, null);
  return {
    symbol,
    idempotency_key: String(body.idempotency_key || body.idempotencyKey || "").trim().slice(0, 128),
    instrument_key: String(body.instrument_key || "").slice(0, 100),
    name: String(body.name || symbol).slice(0, 120),
    sector: String(body.sector || "Unmapped").slice(0, 80),
    side,
    product,
    order_type: orderType,
    qty,
    price,
    price_source: String(body.price_source || "").slice(0, 80),
    decision_price: finiteOr(body.decision_price, null),
    quote_timestamp: String(body.quote_timestamp || "").slice(0, 40),
    target_price: finiteOr(body.target_price ?? body.targetPrice ?? body.target, null),
    stop_price: finiteOr(body.stop_price ?? body.stopPrice ?? body.stop, null),
    source: String(body.source || "upstox-workspace-paper-ticket").slice(0, 80),
    thesis: String(body.thesis || body.reason || "AshStocks paper ticket").slice(0, 360),
    parameter_evidence: sanitizeParameterEvidence(body.parameter_evidence || {}),
    execution_evidence: sanitizeExecutionEvidence(body.execution_evidence || {}),
    gtt: Boolean(body.gtt || String(body.order_type || body.action || "").toUpperCase() === "GTT")
  };
}
function paperOrderRequestFingerprint(request = {}) {
  return JSON.stringify([
    request.symbol,
    request.instrument_key,
    request.side,
    request.order_type,
    request.qty,
    request.price,
    request.target_price,
    request.stop_price,
    request.source,
    request.gtt
  ]).slice(0, 500);
}
function paperOrderLogicalFingerprint(request = {}) {
  return JSON.stringify([
    request.symbol,
    request.instrument_key,
    request.side,
    request.order_type,
    request.qty,
    request.target_price,
    request.stop_price,
    request.source,
    request.gtt
  ]).slice(0, 500);
}
function paperRouteOrderReplay(state = defaultState(), body = {}) {
  const incoming = paperOrderRequest(body);
  incoming.logical_fingerprint = paperOrderLogicalFingerprint(incoming);
  const paperTrader = sanitizePaperTraderState(state.paperTrader || {});
  const cutoff = Date.now() - 60_000;
  const priorOrder = paperTrader.orders.find((order) => (
    incoming.idempotency_key
      ? order.idempotency_key === incoming.idempotency_key
      : order.logical_fingerprint === incoming.logical_fingerprint
        && Date.parse(order.created_at || order.updated_at || "") >= cutoff
  ));
  if (priorOrder) {
    if (incoming.idempotency_key && priorOrder.logical_fingerprint && priorOrder.logical_fingerprint !== incoming.logical_fingerprint) {
      return { ok: false, status: 409, error: "idempotency_key_reused_with_different_request", replayed: false, order: priorOrder, funds: paperLifecycleFunds(paperTrader), paperTrader, nextState: { ...state, paperTrader } };
    }
    const trade = paperTrader.trades.find((item) => item.order_id === priorOrder.id) || null;
    const rejected = priorOrder.status === "REJECTED";
    return { ok: !rejected, status: rejected ? 409 : 200, action: rejected ? "PAPER_ORDER_REJECTED" : priorOrder.side === "BUY" ? "PAPER_BUY_FILLED" : "PAPER_SELL_FILLED", replayed: true, replay_mode: incoming.idempotency_key ? "explicit_key" : "legacy_60_second_logical_fingerprint", order: priorOrder, trade, funds: paperLifecycleFunds(paperTrader), paperTrader, nextState: { ...state, paperTrader } };
  }
  const priorGtt = paperTrader.gtt.find((plan) => (
    incoming.idempotency_key
      ? plan.idempotency_key === incoming.idempotency_key
      : plan.logical_fingerprint === incoming.logical_fingerprint
        && Date.parse(plan.created_at || "") >= cutoff
  ));
  if (!priorGtt) return null;
  if (incoming.idempotency_key && priorGtt.logical_fingerprint && priorGtt.logical_fingerprint !== incoming.logical_fingerprint) {
    return { ok: false, status: 409, error: "idempotency_key_reused_with_different_request", replayed: false, gtt: priorGtt, funds: paperLifecycleFunds(paperTrader), paperTrader, nextState: { ...state, paperTrader } };
  }
  return { ok: true, status: 200, action: "PAPER_GTT_CREATED", replayed: true, replay_mode: incoming.idempotency_key ? "explicit_key" : "legacy_60_second_logical_fingerprint", gtt: priorGtt, funds: paperLifecycleFunds(paperTrader), paperTrader, nextState: { ...state, paperTrader } };
}
function rejectedPaperOrderPreparation(state = defaultState(), body = {}, reason = "paper order preparation failed") {
  const asOf = paperLifecycleNow();
  const request = paperOrderRequest(body);
  request.request_fingerprint = paperOrderRequestFingerprint(request);
  request.logical_fingerprint = paperOrderLogicalFingerprint(request);
  const paperTrader = sanitizePaperTraderState(state.paperTrader || {});
  const order = rejectedPaperOrder(request, reason, asOf);
  const saved = sanitizePaperTraderState({ ...paperTrader, orders: [order, ...paperTrader.orders].slice(0, 200) });
  return { ok: false, status: 409, error: reason, order, funds: paperLifecycleFunds(saved), paperTrader: saved, nextState: { ...state, paperTrader: saved } };
}
async function preparePaperMarketOrder(body = {}) {
  const request = paperOrderRequest(body);
  if (request.gtt || request.order_type === "GTT") {
    return { ok: true, body: { ...body, price_source: "client_trigger_not_fill" } };
  }
  if (request.order_type !== "MARKET") {
    return { ok: false, error: "paper_market_or_gtt_order_required" };
  }
  if (ENV.NODE_ENV === "test" && body.test_fixture_price === true) {
    return {
      ok: true,
      body: {
        ...body,
        price_source: "test_fixture_only",
        execution_evidence: { ...(body.execution_evidence || {}), price_source: "test_fixture_only", server_verified: false, market_price_available: true, all_clear: true }
      }
    };
  }
  if (!/^NSE_EQ\|INE[A-Z0-9]{9}$/.test(request.instrument_key)) {
    return { ok: false, error: "exact_nse_equity_instrument_key_required" };
  }
  if (!paperEngineMarketState().open) {
    return { ok: false, error: "nse_market_closed_for_market_paper_fill" };
  }
  let payload;
  try {
    payload = await fetchUpstoxMarketQuotes([request.instrument_key]);
  } catch (error) {
    return { ok: false, error: "upstox_market_quote_failed: " + error.message };
  }
  const quote = paperEngineQuoteMap(payload).get(paperEngineQuoteKey(request.instrument_key));
  if (!quote) return { ok: false, error: "upstox_market_quote_missing" };
  const levels = request.side === "SELL"
    ? (Array.isArray(quote.depth?.bids) ? quote.depth.bids : [])
    : (Array.isArray(quote.depth?.asks) ? quote.depth.asks : []);
  let remaining = request.qty;
  let value = 0;
  let filled = 0;
  for (const level of levels.slice(0, 5)) {
    if (!remaining) break;
    const levelQty = Math.max(0, Math.floor(finiteOr(level.quantity, 0)));
    const levelPrice = finiteOr(level.price, null);
    if (!levelQty || !levelPrice) continue;
    const take = Math.min(remaining, levelQty);
    value += take * levelPrice;
    filled += take;
    remaining -= take;
  }
  if (!filled || remaining > 0) return { ok: false, error: "insufficient_upstox_depth_for_full_paper_fill" };
  const fillPrice = round(value / filled, 4);
  const timestampMs = paperEngineTimestampMs(quote.timestamp);
  const snapshotMs = paperEngineTimestampMs(quote.snapshot_timestamp);
  const tradeAgeSeconds = timestampMs === null ? null : Math.max(0, (Date.now() - timestampMs) / 1000);
  const snapshotAgeSeconds = snapshotMs === null ? null : Math.max(0, (Date.now() - snapshotMs) / 1000);
  const quoteFresh = (tradeAgeSeconds !== null && tradeAgeSeconds <= 60) || (snapshotAgeSeconds !== null && snapshotAgeSeconds <= 30);
  if (!quoteFresh) return { ok: false, error: "stale_upstox_market_quote" };
  const last = finiteOr(quote.last_price, null);
  const lower = finiteOr(quote.lower_circuit_limit, null);
  const upper = finiteOr(quote.upper_circuit_limit, null);
  const circuitClear = last !== null && (lower === null || last > lower) && (upper === null || last < upper);
  if (!circuitClear) return { ok: false, error: "upstox_circuit_limit_block" };
  const bestBid = finiteOr(quote.depth?.bids?.[0]?.price, null);
  const bestAsk = finiteOr(quote.depth?.asks?.[0]?.price, null);
  const midpoint = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : null;
  const spreadBps = midpoint ? round((bestAsk - bestBid) / midpoint * 10000, 3) : null;
  const quoteTimestamp = snapshotAgeSeconds !== null && snapshotAgeSeconds <= 30 ? quote.snapshot_timestamp : quote.timestamp;
  return {
    ok: true,
    body: {
      ...body,
      decision_price: finiteOr(body.decision_price, finiteOr(body.price, null)),
      price: fillPrice,
      price_source: request.side === "SELL" ? "server_upstox_weighted_bid" : "server_upstox_weighted_ask",
      quote_timestamp: quoteTimestamp,
      execution_evidence: {
        price_source: request.side === "SELL" ? "server_upstox_weighted_bid" : "server_upstox_weighted_ask",
        server_verified: true,
        quote_timestamp: quoteTimestamp,
        quote_age_seconds: snapshotAgeSeconds !== null && snapshotAgeSeconds <= 30 ? round(snapshotAgeSeconds, 3) : round(tradeAgeSeconds, 3),
        quote_fresh: true,
        market_price_available: true,
        best_bid: bestBid,
        best_ask: bestAsk,
        spread_bps: spreadBps,
        circuit_clear: true,
        all_clear: true,
        nodes: [{ id: "NBX09", state: "HIT", value: fillPrice, evidence: "Server fetched Upstox depth and replaced the client-submitted paper MARKET price" }]
      }
    }
  };
}
function rejectedPaperOrder(request, reason, asOf) {
  return sanitizePaperOrder({
    id: paperLedgerId("PAPER_REJECT"),
    ...request,
    status: "REJECTED",
    rejection_reason: reason,
    created_at: asOf,
    updated_at: asOf
  });
}
function paperKellySizing(paperTrader = {}) {
  if (
    typeof evaluateKellySizing !== "function"
    || typeof STOCK_SELECTION_PARAMETERS === "undefined"
  ) {
    return {
      status: "DATA_INCOMPLETE",
      applied: true,
      blockNewEntries: true,
      maximumPositionPct: 0,
      reason: "Kelly parameters or evaluator are unavailable."
    };
  }
  return evaluateKellySizing(
    Array.isArray(paperTrader.trades) ? paperTrader.trades : [],
    STOCK_SELECTION_PARAMETERS
  );
}
function applyPaperOrderLifecycle(state = defaultState(), body = {}) {
  const asOf = paperLifecycleNow();
  const request = paperOrderRequest(body);
  request.request_fingerprint = paperOrderRequestFingerprint(request);
  request.logical_fingerprint = paperOrderLogicalFingerprint(request);
  const paperTrader = sanitizePaperTraderState(state.paperTrader || {});
  const next = {
    ...paperTrader,
    funds: sanitizePaperFunds(paperTrader.funds || {}),
    positions: paperTrader.positions.slice(),
    orders: paperTrader.orders.slice(),
    trades: paperTrader.trades.slice(),
    gtt: paperTrader.gtt.slice()
  };

  {
    const replayCutoff = Date.parse(asOf) - 60_000;
    const priorOrder = next.orders.find((order) => (
      request.idempotency_key
        ? order.idempotency_key === request.idempotency_key
        : order.request_fingerprint === request.request_fingerprint
          && Date.parse(order.created_at || order.updated_at || "") >= replayCutoff
    ));
    if (priorOrder) {
      const saved = sanitizePaperTraderState(next);
      if (request.idempotency_key && priorOrder.request_fingerprint && priorOrder.request_fingerprint !== request.request_fingerprint) {
        return {
          ok: false,
          status: 409,
          error: "idempotency_key_reused_with_different_request",
          replayed: false,
          order: priorOrder,
          funds: paperLifecycleFunds(saved),
          paperTrader: saved,
          nextState: { ...state, paperTrader: saved }
        };
      }
      const trade = next.trades.find((item) => item.order_id === priorOrder.id) || null;
      const rejected = priorOrder.status === "REJECTED";
      return {
        ok: !rejected,
        status: rejected ? 409 : 200,
        action: rejected ? "PAPER_ORDER_REJECTED" : priorOrder.side === "BUY" ? "PAPER_BUY_FILLED" : "PAPER_SELL_FILLED",
        replayed: true,
        replay_mode: request.idempotency_key ? "explicit_key" : "legacy_60_second_fingerprint",
        order: priorOrder,
        trade,
        funds: paperLifecycleFunds(saved),
        paperTrader: saved,
        nextState: { ...state, paperTrader: saved }
      };
    }
    const priorGtt = next.gtt.find((plan) => (
      request.idempotency_key
        ? plan.idempotency_key === request.idempotency_key
        : plan.request_fingerprint === request.request_fingerprint
          && Date.parse(plan.created_at || "") >= replayCutoff
    ));
    if (priorGtt) {
      const saved = sanitizePaperTraderState(next);
      if (request.idempotency_key && priorGtt.request_fingerprint && priorGtt.request_fingerprint !== request.request_fingerprint) {
        return {
          ok: false,
          status: 409,
          error: "idempotency_key_reused_with_different_request",
          replayed: false,
          gtt: priorGtt,
          funds: paperLifecycleFunds(saved),
          paperTrader: saved,
          nextState: { ...state, paperTrader: saved }
        };
      }
      return {
        ok: true,
        status: 200,
        action: "PAPER_GTT_CREATED",
        replayed: true,
        replay_mode: request.idempotency_key ? "explicit_key" : "legacy_60_second_fingerprint",
        gtt: priorGtt,
        funds: paperLifecycleFunds(saved),
        paperTrader: saved,
        nextState: { ...state, paperTrader: saved }
      };
    }
  }

  if (!request.symbol) {
    const order = rejectedPaperOrder(request, "symbol missing", asOf);
    next.orders = [order, ...next.orders].slice(0, 200);
    const saved = sanitizePaperTraderState(next);
    return { ok: false, status: 422, order, paperTrader: saved, nextState: { ...state, paperTrader: saved } };
  }
  if (!request.qty || request.qty <= 0) {
    const order = rejectedPaperOrder(request, "quantity missing", asOf);
    next.orders = [order, ...next.orders].slice(0, 200);
    const saved = sanitizePaperTraderState(next);
    return { ok: false, status: 422, order, paperTrader: saved, nextState: { ...state, paperTrader: saved } };
  }
  if (!request.price || request.price <= 0) {
    const order = rejectedPaperOrder(request, "price missing: row needs live/historical price before paper execution", asOf);
    next.orders = [order, ...next.orders].slice(0, 200);
    const saved = sanitizePaperTraderState(next);
    return { ok: false, status: 422, order, paperTrader: saved, nextState: { ...state, paperTrader: saved } };
  }

  const kelly = paperKellySizing(next);
  if (request.side === "BUY") {
    if (kelly.blockNewEntries) {
      const rejected = rejectedPaperOrder(request, "Kelly governor blocked new paper entries: " + kelly.status, asOf);
      next.orders = [rejected, ...next.orders].slice(0, 200);
      const saved = sanitizePaperTraderState(next);
      return { ok: false, status: 409, order: rejected, kelly, paperTrader: saved, nextState: { ...state, paperTrader: saved } };
    }
    const existing = next.positions.find((position) => position.symbol === request.symbol && position.status !== "CLOSED");
    const requestValue = round(request.qty * request.price, 2);
    if (requestValue < PAPER_CAPITAL_POLICY.minimumEntryValue - 0.01) {
      const rejected = rejectedPaperOrder(
        request,
        "Paper BUY must be at least Rs " + PAPER_CAPITAL_POLICY.minimumEntryValue,
        asOf
      );
      next.orders = [rejected, ...next.orders].slice(0, 200);
      const saved = sanitizePaperTraderState(next);
      return { ok: false, status: 409, order: rejected, kelly, minimum_entry_value: PAPER_CAPITAL_POLICY.minimumEntryValue, paperTrader: saved, nextState: { ...state, paperTrader: saved } };
    }
    const openPositions = next.positions.filter(
      (position) => position.status !== "CLOSED" && finiteOr(position.qty, 0) > 0
    );
    const activeBuyGtt = next.gtt.filter(
      (plan) => plan.status === "ACTIVE" && plan.side === "BUY"
    );
    if (!existing && openPositions.length + activeBuyGtt.length >= PAPER_CAPITAL_POLICY.maximumOpenPositions) {
      const rejected = rejectedPaperOrder(
        request,
        "Paper portfolio reached the configured simultaneous-position limit of " + PAPER_CAPITAL_POLICY.maximumOpenPositions,
        asOf
      );
      next.orders = [rejected, ...next.orders].slice(0, 200);
      const saved = sanitizePaperTraderState(next);
      return { ok: false, status: 409, order: rejected, kelly, maximum_open_positions: PAPER_CAPITAL_POLICY.maximumOpenPositions, paperTrader: saved, nextState: { ...state, paperTrader: saved } };
    }
    const lifecycleFunds = paperLifecycleFunds(next);
    const requestDebit = round(requestValue + paperTransactionCost(requestValue), 2);
    if (requestDebit > finiteOr(lifecycleFunds.buying_power, 0) + 0.01) {
      const rejected = rejectedPaperOrder(
        request,
        "Insufficient paper buying power for net debit Rs " + requestDebit,
        asOf
      );
      next.orders = [rejected, ...next.orders].slice(0, 200);
      const saved = sanitizePaperTraderState(next);
      return { ok: false, status: 409, order: rejected, kelly, funds: lifecycleFunds, paperTrader: saved, nextState: { ...state, paperTrader: saved } };
    }
    const baseCapPct = STOCK_SELECTION_PARAMETERS.positionSizing.maximumPositionPct;
    const minimumCapPct = PAPER_CAPITAL_POLICY.minimumEntryValue
      / PAPER_CAPITAL_POLICY.startingCapital * 100;
    const positionCapPct = kelly.applied
      ? Math.max(minimumCapPct, Math.min(baseCapPct, finiteOr(kelly.maximumPositionPct, 0)))
      : Math.max(minimumCapPct, baseCapPct);
    const existingValue = existing
      ? finiteOr(existing.qty, 0) * finiteOr(existing.entry_price, request.price)
      : 0;
    const proposedValue = existingValue + requestValue;
    const maximumValue = Math.max(
      PAPER_CAPITAL_POLICY.minimumEntryValue,
      finiteOr(next.funds.starting_capital, 0) * positionCapPct / 100
    );
    if (proposedValue > maximumValue + 0.01) {
      const rejected = rejectedPaperOrder(
        request,
        "Paper position exceeds effective Kelly/base cap of " + round(positionCapPct, 4) + "%",
        asOf
      );
      next.orders = [rejected, ...next.orders].slice(0, 200);
      const saved = sanitizePaperTraderState(next);
      return { ok: false, status: 409, order: rejected, kelly, position_cap_pct: positionCapPct, paperTrader: saved, nextState: { ...state, paperTrader: saved } };
    }
  }

  if (request.gtt || request.order_type === "GTT") {
    const plan = sanitizePaperGtt({ id: paperLedgerId("PAPER_GTT"), ...request, entry_price: request.price, status: "ACTIVE", created_at: asOf });
    next.gtt = [plan, ...next.gtt].slice(0, 200);
    const saved = sanitizePaperTraderState(next);
    return { ok: true, status: 200, action: "PAPER_GTT_CREATED", gtt: plan, kelly, funds: paperLifecycleFunds(saved), paperTrader: saved, nextState: { ...state, paperTrader: saved } };
  }

  const fillValue = round(request.qty * request.price, 2);
  const fillTransactionCost = paperTransactionCost(fillValue);
  const order = sanitizePaperOrder({ id: paperLedgerId("PAPER_ORDER"), ...request, transaction_cost: fillTransactionCost, status: "PAPER_FILLED", created_at: asOf, updated_at: asOf });
  let trade = sanitizePaperTrade({ id: paperLedgerId("PAPER_TRADE"), order_id: order.id, symbol: request.symbol, instrument_key: request.instrument_key, side: request.side, qty: request.qty, price: request.price, price_source: request.price_source, quote_timestamp: request.quote_timestamp, value: fillValue, entry_cost: request.side === "BUY" ? fillTransactionCost : 0, exit_cost: request.side === "SELL" ? fillTransactionCost : 0, transaction_cost: fillTransactionCost, traded_at: asOf });

  if (request.side === "BUY") {
    const existingIndex = next.positions.findIndex((position) => position.symbol === request.symbol && position.status !== "CLOSED");
    if (existingIndex >= 0) {
      const existing = next.positions[existingIndex];
      const oldQty = Math.max(0, finiteOr(existing.qty, 0));
      const newQty = oldQty + request.qty;
      const weightedEntry = newQty ? ((oldQty * finiteOr(existing.entry_price, request.price)) + (request.qty * request.price)) / newQty : request.price;
      next.positions[existingIndex] = sanitizePaperPosition({
        ...existing,
        qty: newQty,
        entry_price: round(weightedEntry, 2),
        entry_cost: round(finiteOr(existing.entry_cost, 0) + fillTransactionCost, 2),
        price_source: request.price_source,
        current_price: request.price,
        target_price: request.target_price || existing.target_price,
        stop_price: request.stop_price || existing.stop_price,
        status: "OPEN",
        thesis: request.thesis,
        instrument_key: request.instrument_key || existing.instrument_key,
        decision_price: request.decision_price,
        quote_timestamp: request.quote_timestamp,
        parameter_evidence: request.parameter_evidence,
        execution_evidence: request.execution_evidence,
        checked_at: asOf
      });
    } else {
      next.positions.unshift(sanitizePaperPosition({
        symbol: request.symbol,
        instrument_key: request.instrument_key,
        name: request.name,
        sector: request.sector,
        qty: request.qty,
        entry_price: request.price,
        entry_cost: fillTransactionCost,
        price_source: request.price_source,
        decision_price: request.decision_price,
        quote_timestamp: request.quote_timestamp,
        current_price: request.price,
        target_price: request.target_price,
        stop_price: request.stop_price,
        entry_date: asOf,
        status: "OPEN",
        thesis: request.thesis,
        parameter_evidence: request.parameter_evidence,
        execution_evidence: request.execution_evidence,
        checked_at: asOf
      }));
    }
    next.funds = sanitizePaperFunds({ ...next.funds, transaction_costs_paid: finiteOr(next.funds.transaction_costs_paid, 0) + fillTransactionCost });
  } else {
    const existingIndex = next.positions.findIndex((position) => position.symbol === request.symbol && position.status !== "CLOSED" && finiteOr(position.qty, 0) > 0);
    if (existingIndex < 0) {
      const rejected = rejectedPaperOrder(request, "no open paper position to sell", asOf);
      next.orders = [rejected, ...next.orders].slice(0, 200);
      const saved = sanitizePaperTraderState(next);
      return { ok: false, status: 409, order: rejected, paperTrader: saved, nextState: { ...state, paperTrader: saved } };
    }
    const existing = next.positions[existingIndex];
    const heldQty = Math.max(0, Math.floor(finiteOr(existing.qty, 0)));
    if (request.qty > heldQty) {
      const rejected = rejectedPaperOrder(
        request,
        "paper SELL quantity " + request.qty + " exceeds held quantity " + heldQty,
        asOf
      );
      next.orders = [rejected, ...next.orders].slice(0, 200);
      const saved = sanitizePaperTraderState(next);
      return { ok: false, status: 409, order: rejected, paperTrader: saved, nextState: { ...state, paperTrader: saved } };
    }
    const sellQty = request.qty;
    const remaining = Math.max(0, finiteOr(existing.qty, 0) - sellQty);
    const entryPrice = finiteOr(existing.entry_price, request.price);
    const entryValue = round(entryPrice * sellQty, 2);
    const exitValue = round(request.price * sellQty, 2);
    const heldEntryCost = round(finiteOr(existing.entry_cost, 0), 2);
    const allocatedEntryCost = round(heldQty ? heldEntryCost * sellQty / heldQty : 0, 2);
    const remainingEntryCost = round(Math.max(0, heldEntryCost - allocatedEntryCost), 2);
    const exitCost = paperTransactionCost(exitValue);
    const grossRealized = round((request.price - entryPrice) * sellQty, 2);
    const realized = round(grossRealized - allocatedEntryCost - exitCost, 2);
    trade = sanitizePaperTrade({
      ...trade,
      qty: sellQty,
      value: exitValue,
      entry_price: entryPrice,
      exit_price: request.price,
      entry_value: entryValue,
      exit_value: exitValue,
      entry_cost: allocatedEntryCost,
      exit_cost: exitCost,
      transaction_cost: exitCost,
      net_entry_value: round(entryValue + allocatedEntryCost, 2),
      net_exit_value: round(exitValue - exitCost, 2),
      gross_realized_pnl: grossRealized,
      realized_pnl: realized,
      return_pct: entryValue + allocatedEntryCost ? realized / (entryValue + allocatedEntryCost) * 100 : null,
      entry_at: existing.entry_date,
      exit_at: asOf,
      holding_days: paperHoldingDays(existing.entry_date, asOf),
      close_reason: request.thesis || "Manual paper SELL"
    });
    next.funds = sanitizePaperFunds({ ...next.funds, realized_pnl: finiteOr(next.funds.realized_pnl, 0) + realized, transaction_costs_paid: finiteOr(next.funds.transaction_costs_paid, 0) + exitCost });
    if (remaining > 0) next.positions[existingIndex] = sanitizePaperPosition({ ...existing, qty: remaining, entry_cost: remainingEntryCost, current_price: request.price, checked_at: asOf });
    else next.positions.splice(existingIndex, 1);
  }

  next.orders = [order, ...next.orders].slice(0, 200);
  next.trades = [trade, ...next.trades].slice(0, 300);
  next.last_order_at = asOf;
  next.last_run = next.last_run || asOf;
  const saved = sanitizePaperTraderState(next);
  return { ok: true, status: 200, action: order.side === "BUY" ? "PAPER_BUY_FILLED" : "PAPER_SELL_FILLED", order, trade, kelly, funds: paperLifecycleFunds(saved), paperTrader: saved, nextState: { ...state, paperTrader: saved } };
}
function paperPriceMap(rows = []) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const symbol = normalizeSymbol(row.symbol);
    const price = finiteOr(row.close ?? row.ltp ?? row.last_price, null);
    if (symbol && price && price > 0) map.set(symbol, { price, row });
  }
  return map;
}
function closePaperPosition(next, position, price, reason, asOf) {
  const qty = Math.max(0, Math.floor(finiteOr(position.qty, 0)));
  if (!qty || !price) return null;
  const order = sanitizePaperOrder({
    id: paperLedgerId("PAPER_MONITOR_SELL"),
    symbol: position.symbol,
    name: position.name,
    side: "SELL",
    product: "Paper Monitor",
    order_type: "MARKET",
    qty,
    price,
    target_price: position.target_price,
    stop_price: position.stop_price,
    status: "PAPER_FILLED",
    thesis: reason,
    source: "paper-lifecycle-monitor",
    created_at: asOf,
    updated_at: asOf
  });
  const entryPrice = finiteOr(position.entry_price, price);
  const entryValue = round(entryPrice * qty, 2);
  const exitValue = round(price * qty, 2);
  const entryCost = round(finiteOr(position.entry_cost, 0), 2);
  const exitCost = paperTransactionCost(exitValue);
  const grossRealized = round((price - entryPrice) * qty, 2);
  const realized = round(grossRealized - entryCost - exitCost, 2);
  order.transaction_cost = exitCost;
  const trade = sanitizePaperTrade({
    id: paperLedgerId("PAPER_MONITOR_TRADE"),
    order_id: order.id,
    symbol: position.symbol,
    side: "SELL",
    qty,
    price,
    value: exitValue,
    entry_price: entryPrice,
    exit_price: price,
    entry_value: entryValue,
    exit_value: exitValue,
    entry_cost: entryCost,
    exit_cost: exitCost,
    transaction_cost: exitCost,
    net_entry_value: round(entryValue + entryCost, 2),
    net_exit_value: round(exitValue - exitCost, 2),
    gross_realized_pnl: grossRealized,
    realized_pnl: realized,
    return_pct: entryValue + entryCost ? realized / (entryValue + entryCost) * 100 : null,
    entry_at: position.entry_date,
    exit_at: asOf,
    holding_days: paperHoldingDays(position.entry_date, asOf),
    close_reason: reason,
    traded_at: asOf
  });
  next.orders.unshift(order);
  next.trades.unshift(trade);
  next.funds = sanitizePaperFunds({ ...next.funds, realized_pnl: finiteOr(next.funds.realized_pnl, 0) + realized, transaction_costs_paid: finiteOr(next.funds.transaction_costs_paid, 0) + exitCost });
  return { type: reason.includes("STOP") ? "STOP_EXIT" : "TARGET_EXIT", symbol: position.symbol, qty, price, realized_pnl: realized, order_id: order.id, reason };
}
function openPaperPositionFromGtt(next, plan, price, asOf) {
  const fillValue = round(plan.qty * price, 2);
  const fillTransactionCost = paperTransactionCost(fillValue);
  const order = sanitizePaperOrder({
    id: paperLedgerId("PAPER_GTT_FILL"),
    symbol: plan.symbol,
    name: plan.name,
    side: plan.side,
    product: "Paper GTT",
    order_type: "GTT",
    qty: plan.qty,
    price,
    transaction_cost: fillTransactionCost,
    target_price: plan.target_price,
    stop_price: plan.stop_price,
    status: "PAPER_FILLED",
    thesis: plan.thesis || "Paper GTT trigger touched by monitor",
    source: "paper-lifecycle-monitor",
    created_at: asOf,
    updated_at: asOf
  });
  const trade = sanitizePaperTrade({ id: paperLedgerId("PAPER_GTT_TRADE"), order_id: order.id, symbol: plan.symbol, side: plan.side, qty: plan.qty, price, value: fillValue, entry_cost: plan.side === "BUY" ? fillTransactionCost : 0, exit_cost: plan.side === "SELL" ? fillTransactionCost : 0, transaction_cost: fillTransactionCost, traded_at: asOf });
  next.orders.unshift(order);
  next.trades.unshift(trade);
  if (plan.side === "BUY") {
    const existingIndex = next.positions.findIndex((position) => position.symbol === plan.symbol && position.status !== "CLOSED");
    if (existingIndex >= 0) {
      const existing = next.positions[existingIndex];
      const oldQty = Math.max(0, finiteOr(existing.qty, 0));
      const newQty = oldQty + plan.qty;
      const weightedEntry = newQty ? ((oldQty * finiteOr(existing.entry_price, price)) + (plan.qty * price)) / newQty : price;
      next.positions[existingIndex] = sanitizePaperPosition({ ...existing, qty: newQty, entry_price: round(weightedEntry, 2), entry_cost: round(finiteOr(existing.entry_cost, 0) + fillTransactionCost, 2), current_price: price, target_price: plan.target_price || existing.target_price, stop_price: plan.stop_price || existing.stop_price, status: "OPEN", checked_at: asOf });
    } else {
      next.positions.unshift(sanitizePaperPosition({ symbol: plan.symbol, name: plan.name, qty: plan.qty, entry_price: price, entry_cost: fillTransactionCost, current_price: price, target_price: plan.target_price, stop_price: plan.stop_price, entry_date: asOf, status: "OPEN", thesis: plan.thesis }));
    }
    next.funds = sanitizePaperFunds({ ...next.funds, transaction_costs_paid: finiteOr(next.funds.transaction_costs_paid, 0) + fillTransactionCost });
  }
  return { type: "GTT_TRIGGERED", symbol: plan.symbol, qty: plan.qty, price, order_id: order.id, reason: "paper GTT trigger touched" };
}
function applyPaperLifecycleMonitor(state = defaultState(), rows = [], body = {}) {
  const asOf = paperLifecycleNow();
  const paperTrader = sanitizePaperTraderState(state.paperTrader || {});
  const next = {
    ...paperTrader,
    funds: sanitizePaperFunds(paperTrader.funds || {}),
    positions: paperTrader.positions.slice(),
    orders: paperTrader.orders.slice(),
    trades: paperTrader.trades.slice(),
    gtt: paperTrader.gtt.slice()
  };
  const prices = paperPriceMap(rows);
  const events = [];
  const dataNeeded = [];

  const remainingPositions = [];
  for (const position of next.positions) {
    const found = prices.get(position.symbol);
    if (!found) {
      dataNeeded.push({ symbol: position.symbol, reason: "latest price missing for target/stop monitor" });
      remainingPositions.push(position);
      continue;
    }
    const price = found.price;
    const target = finiteOr(position.target_price, null);
    const stop = finiteOr(position.stop_price, null);
    const updated = sanitizePaperPosition({ ...position, current_price: price, checked_at: asOf });
    if (target && price >= target) {
      const event = closePaperPosition(next, updated, price, "TARGET_HIT: paper monitor closed at target", asOf);
      if (event) events.push(event);
      continue;
    }
    if (stop && price <= stop) {
      const event = closePaperPosition(next, updated, price, "STOP_HIT: paper monitor closed at stop", asOf);
      if (event) events.push(event);
      continue;
    }
    remainingPositions.push(updated);
  }
  next.positions = remainingPositions;

  next.gtt = next.gtt.map((plan) => {
    if (plan.status !== "ACTIVE") return plan;
    const found = prices.get(plan.symbol);
    if (!found) {
      dataNeeded.push({ symbol: plan.symbol, reason: "latest price missing for GTT trigger monitor" });
      return plan;
    }
    const trigger = finiteOr(plan.entry_price, null);
    if (!trigger) {
      dataNeeded.push({ symbol: plan.symbol, reason: "GTT entry/trigger price missing" });
      return plan;
    }
    const touched = plan.side === "BUY" ? found.price >= trigger : found.price <= trigger;
    if (!touched) return plan;
    const event = openPaperPositionFromGtt(next, plan, found.price, asOf);
    events.push(event);
    return sanitizePaperGtt({ ...plan, status: "TRIGGERED", triggered_at: asOf });
  });

  next.orders = next.orders.slice(0, 200);
  next.trades = next.trades.slice(0, 300);
  next.last_monitor_at = asOf;
  next.last_monitor = { at: asOf, events: events.length, data_needed: dataNeeded.length, source: body.source || "paper-lifecycle-monitor" };
  const saved = sanitizePaperTraderState(next);
  return { ok: true, status: 200, action: "PAPER_LIFECYCLE_MONITORED", events, data_needed: dataNeeded, funds: paperLifecycleFunds(saved), paperTrader: saved, nextState: { ...state, paperTrader: saved }, paper_only: true, live_orders: false, broker_write_enabled: false };
}
`;

const PAPER_ORDER_LIFECYCLE_ROUTES = String.raw`
      if (url.pathname === "/api/paper-trader/order") {
        if (req.method !== "POST") { json(res, 405, { ok: false, error: "Method not allowed" }); return; }
        const body = await readJsonBody(req);
        const store = await getStore();
        const state = await store.getState();
        const replay = paperRouteOrderReplay(state, body);
        const prepared = replay ? null : await preparePaperMarketOrder(body);
        const result = replay || (prepared.ok
          ? applyPaperOrderLifecycle(state, prepared.body)
          : rejectedPaperOrderPreparation(state, body, prepared.error));
        await store.saveState(result.nextState);
        const { nextState, status, ...payload } = result;
        json(res, status || 200, { ...payload, engine: PAPER_ORDER_LIFECYCLE_VERSION, paper_only: true, live_orders: false, broker_write_enabled: false });
        return;
      }
      if (url.pathname === "/api/paper-trader/monitor") {
        if (req.method !== "POST") { json(res, 405, { ok: false, error: "Method not allowed" }); return; }
        const body = await readJsonBody(req);
        const store = await getStore();
        const state = await store.getState();
        const resolved = await resolveRequestUniverse(body);
        let scan;
        if (body.useUpstox !== false && ENV.UPSTOX_ACCESS_TOKEN) scan = await runUpstoxScanner(body, resolved.universe);
        if (!scan || scan.ok === false) scan = runScanner(resolved.universe, { ...(body.settings || {}), source: resolved.source, holdings: state.paperTrader?.positions || [] });
        const result = applyPaperLifecycleMonitor(state, scan.rows || [], { ...body, source: scan.source || resolved.source });
        await store.saveState(result.nextState);
        const { nextState, status, ...payload } = result;
        json(res, status || 200, { ...payload, engine: PAPER_ORDER_LIFECYCLE_VERSION, scan_summary: scan.summary || {}, scanned: Array.isArray(scan.rows) ? scan.rows.length : 0 });
        return;
      }
      if (url.pathname === "/api/paper-trader/orders") {
        const store = await getStore();
        const state = await store.getState();
        const marked = await refreshPaperTraderMarks(state, store);
        const paperTrader = marked.paperTrader;
        const positions = paperTrader.positions.map(paperPositionValuation);
        const closedTrades = paperTrader.trades
          .map(paperClosedTradeSummary)
          .filter(Boolean);
        json(res, 200, {
          ok: true,
          engine: PAPER_ORDER_LIFECYCLE_VERSION,
          capital_policy: PAPER_CAPITAL_POLICY,
          paper_only: true,
          live_orders: false,
          orders: paperTrader.orders,
          trades: paperTrader.trades,
          closed_trades: closedTrades,
          gtt: paperTrader.gtt,
          positions,
          funds: paperLifecycleFunds({ ...paperTrader, positions }),
          mark_to_market: {
            source: "Upstox Market Quote API",
            as_of: marked.quote_as_of,
            marked_positions: marked.marked_positions,
            unpriced_symbols: marked.unpriced_symbols,
            quote_error: marked.quote_error
          },
          last_monitor: paperTrader.last_monitor || null
        });
        return;
      }
`;

export function applyPaperOrderLifecyclePatches(source, mustReplace) {
  let output = source;
  output = mustReplace(
    output,
    '  return { symbol, name: String(position.name || symbol).slice(0, 120), sector: String(position.sector || "Unmapped").slice(0, 80), qty: Math.max(0, Math.floor(finiteOr(position.qty, 0))), entry_price: finiteOr(position.entry_price, null), current_price: finiteOr(position.current_price, position.entry_price ?? null), target_price: finiteOr(position.target_price, null), stop_price: finiteOr(position.stop_price, null), entry_date: String(position.entry_date || "").slice(0, 32), status: String(position.status || "OPEN").slice(0, 30), thesis: String(position.thesis || "").slice(0, 240) };',
    '  return { symbol, instrument_key: String(position.instrument_key || "").slice(0, 100), name: String(position.name || symbol).slice(0, 120), sector: String(position.sector || "Unmapped").slice(0, 80), qty: Math.max(0, Math.floor(finiteOr(position.qty, 0))), entry_price: finiteOr(position.entry_price, null), entry_cost: round(finiteOr(position.entry_cost ?? position.entryCost, 0), 2), price_source: String(position.price_source || "").slice(0, 80), decision_price: finiteOr(position.decision_price, null), current_price: finiteOr(position.current_price, position.entry_price ?? null), target_price: finiteOr(position.target_price, null), stop_price: finiteOr(position.stop_price, null), quote_timestamp: String(position.quote_timestamp || "").slice(0, 40), entry_date: String(position.entry_date || "").slice(0, 32), checked_at: String(position.checked_at || position.quote_timestamp || position.entry_date || "").slice(0, 40), status: String(position.status || "OPEN").slice(0, 30), thesis: String(position.thesis || "").slice(0, 360), parameter_evidence: sanitizeParameterEvidence(position.parameter_evidence || {}), execution_evidence: sanitizeExecutionEvidence(position.execution_evidence || {}) };',
    "persist parameter and quote evidence on paper positions"
  );
  output = mustReplace(
    output,
    'function defaultPaperTraderState() {\n  return { version: PAPER_TRADER_VERSION, paper_only: true, live_orders: false, last_run: null, positions: [], history: [], last_plan: null };\n}',
    'function defaultPaperTraderState() {\n  return { version: PAPER_TRADER_VERSION, lifecycle_version: PAPER_ORDER_LIFECYCLE_VERSION, paper_only: true, live_orders: false, last_run: null, last_order_at: null, last_monitor_at: null, last_monitor: null, funds: defaultPaperFunds(), positions: [], orders: [], trades: [], gtt: [], history: [], last_plan: null };\n}',
    'paper order lifecycle default state'
  );
  output = mustReplace(
    output,
    '  return { version: PAPER_TRADER_VERSION, paper_only: true, live_orders: false, last_run: state.last_run || null, positions: Array.isArray(state.positions) ? state.positions.slice(0, 80).map(sanitizePaperPosition) : [], history: Array.isArray(state.history) ? state.history.slice(0, 50) : [], last_plan: state.last_plan && typeof state.last_plan === "object" ? state.last_plan : null };',
    '  return { version: PAPER_TRADER_VERSION, lifecycle_version: PAPER_ORDER_LIFECYCLE_VERSION, paper_only: true, live_orders: false, last_run: state.last_run || null, last_order_at: state.last_order_at || null, last_monitor_at: state.last_monitor_at || null, last_monitor: state.last_monitor && typeof state.last_monitor === "object" ? state.last_monitor : null, funds: sanitizePaperFunds(state.funds || {}), positions: Array.isArray(state.positions) ? state.positions.slice(0, PAPER_CAPITAL_POLICY.maximumOpenPositions).map(sanitizePaperPosition) : [], orders: Array.isArray(state.orders) ? state.orders.slice(0, 200).map(sanitizePaperOrder) : [], trades: Array.isArray(state.trades) ? state.trades.slice(0, 300).map(sanitizePaperTrade) : [], gtt: Array.isArray(state.gtt) ? state.gtt.slice(0, 200).map(sanitizePaperGtt) : [], history: Array.isArray(state.history) ? state.history.slice(0, 50) : [], last_plan: state.last_plan && typeof state.last_plan === "object" ? state.last_plan : null };',
    'paper order lifecycle sanitize state'
  );
  output = mustReplace(
    output,
    '  return { maxCandidates: Math.min(100, Math.max(10, Math.floor(finiteOr(input.maxCandidates ?? input.max_candidates, 50)))), buyQueueSize: Math.min(60, Math.max(5, Math.floor(finiteOr(input.buyQueueSize ?? input.buy_queue_size, 30)))), startingCapital: Math.max(10000, finiteOr(input.startingCapital ?? input.starting_capital, 1000000)), maxPositionPct: Math.min(0.2, Math.max(0.01, finiteOr(input.maxPositionPct ?? input.max_position_pct, 0.04))), targetDefaultPct: Math.min(80, Math.max(8, finiteOr(input.targetDefaultPct ?? input.target_default_pct, 25))), stopLossPct: Math.min(25, Math.max(4, finiteOr(input.stopLossPct ?? input.stop_loss_pct, 10))), replaceBelowScore: Math.min(80, Math.max(5, finiteOr(input.replaceBelowScore ?? input.replace_below_score, 35))), targetHitPct: Math.min(100, Math.max(20, finiteOr(input.targetHitPct ?? input.target_hit_pct, 80))) };',
    '  return { maxCandidates: Math.min(PAPER_CAPITAL_POLICY.maximumCandidateEntries, Math.max(10, Math.floor(finiteOr(input.maxCandidates ?? input.max_candidates, PAPER_CAPITAL_POLICY.maximumCandidateEntries)))), buyQueueSize: Math.min(PAPER_CAPITAL_POLICY.maximumCandidateEntries, Math.max(5, Math.floor(finiteOr(input.buyQueueSize ?? input.buy_queue_size, PAPER_CAPITAL_POLICY.maximumCandidateEntries)))), startingCapital: PAPER_CAPITAL_POLICY.startingCapital, maxPositionPct: Math.min(PAPER_CAPITAL_POLICY.maximumPositionPct / 100, Math.max(PAPER_CAPITAL_POLICY.minimumEntryPct / 100, finiteOr(input.maxPositionPct ?? input.max_position_pct, PAPER_CAPITAL_POLICY.baseEntryPct / 100))), targetDefaultPct: Math.min(80, Math.max(8, finiteOr(input.targetDefaultPct ?? input.target_default_pct, 25))), stopLossPct: Math.min(25, Math.max(4, finiteOr(input.stopLossPct ?? input.stop_loss_pct, 10))), replaceBelowScore: Math.min(80, Math.max(5, finiteOr(input.replaceBelowScore ?? input.replace_below_score, 35))), targetHitPct: Math.min(100, Math.max(20, finiteOr(input.targetHitPct ?? input.target_hit_pct, 80))) };',
    'paper trader capital and 80-entry settings'
  );
  output = mustReplace(output, '\nfunction paperTraderSettings(input = {}) {', `\n${PAPER_ORDER_LIFECYCLE_FUNCTIONS}\nfunction paperTraderSettings(input = {}) {`, 'insert paper order lifecycle functions');
  output = mustReplace(output, '      if (url.pathname === "/api/paper-trader/run") {', `${PAPER_ORDER_LIFECYCLE_ROUTES}\n      if (url.pathname === "/api/paper-trader/run") {`, 'paper order lifecycle routes');
  return output;
}
