import { loadPaperCapitalPolicy } from "./lib/paper-capital-policy.mjs";

const paperCapitalPolicy = loadPaperCapitalPolicy();

const PAPER_ORDER_LIFECYCLE_FUNCTIONS = String.raw`
const PAPER_ORDER_LIFECYCLE_VERSION = "ashstocks-paper-order-lifecycle-v0.4-capital-closed-trades";
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
    quote_timestamp: String(input.quote_timestamp || "").slice(0, 40),
    quote_age_seconds: finiteOr(input.quote_age_seconds, null),
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
    realized_pnl: 0
  };
}
function sanitizePaperFunds(input = {}) {
  const base = defaultPaperFunds();
  return {
    ...base,
    currency: PAPER_CAPITAL_POLICY.currency,
    starting_capital: PAPER_CAPITAL_POLICY.startingCapital,
    realized_pnl: round(finiteOr(input.realized_pnl ?? input.realizedPnl ?? base.realized_pnl, base.realized_pnl), 2)
  };
}
function sanitizePaperOrder(order = {}) {
  const symbol = normalizeSymbol(order.symbol);
  return {
    id: String(order.id || "").slice(0, 64),
    symbol,
    instrument_key: String(order.instrument_key || "").slice(0, 100),
    name: String(order.name || symbol).slice(0, 120),
    side: String(order.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
    product: String(order.product || "Paper Swing").slice(0, 40),
    order_type: String(order.order_type || order.orderType || "MARKET").toUpperCase().slice(0, 20),
    qty: Math.max(0, Math.floor(finiteOr(order.qty, 0))),
    price: finiteOr(order.price ?? order.entry_price, null),
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
  const returnPct = side === "SELL" && entryValue > 0
    ? round(finiteOr(trade.return_pct ?? trade.returnPct, realizedPnl / entryValue * 100), 4)
    : null;
  return {
    id: String(trade.id || "").slice(0, 64),
    order_id: String(trade.order_id || trade.orderId || "").slice(0, 64),
    symbol,
    instrument_key: String(trade.instrument_key || "").slice(0, 100),
    side,
    qty,
    price,
    quote_timestamp: String(trade.quote_timestamp || "").slice(0, 40),
    value,
    entry_price: entryPrice,
    exit_price: exitPrice,
    entry_value: entryValue,
    exit_value: exitValue,
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
  const investedValue = entry === null ? null : round(qty * entry, 2);
  const marketValue = current === null ? null : round(qty * current, 2);
  const unrealizedPnl = investedValue === null || marketValue === null ? null : round(marketValue - investedValue, 2);
  const unrealizedPnlPct = investedValue ? round((unrealizedPnl / investedValue) * 100, 2) : null;
  return {
    ...clean,
    invested_value: investedValue,
    market_value: marketValue,
    unrealized_pnl: unrealizedPnl,
    unrealized_pnl_pct: unrealizedPnlPct
  };
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
    (sum, plan) => sum + finiteOr(plan.qty, 0) * finiteOr(plan.entry_price, 0),
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
    instrument_key: String(body.instrument_key || "").slice(0, 100),
    name: String(body.name || symbol).slice(0, 120),
    sector: String(body.sector || "Unmapped").slice(0, 80),
    side,
    product,
    order_type: orderType,
    qty,
    price,
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
  const paperTrader = sanitizePaperTraderState(state.paperTrader || {});
  const next = {
    ...paperTrader,
    funds: sanitizePaperFunds(paperTrader.funds || {}),
    positions: paperTrader.positions.slice(),
    orders: paperTrader.orders.slice(),
    trades: paperTrader.trades.slice(),
    gtt: paperTrader.gtt.slice()
  };

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
    if (requestValue > finiteOr(lifecycleFunds.buying_power, 0) + 0.01) {
      const rejected = rejectedPaperOrder(
        request,
        "Insufficient paper buying power for Rs " + requestValue,
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

  const order = sanitizePaperOrder({ id: paperLedgerId("PAPER_ORDER"), ...request, status: "PAPER_FILLED", created_at: asOf, updated_at: asOf });
  let trade = sanitizePaperTrade({ id: paperLedgerId("PAPER_TRADE"), order_id: order.id, symbol: request.symbol, instrument_key: request.instrument_key, side: request.side, qty: request.qty, price: request.price, quote_timestamp: request.quote_timestamp, value: request.qty * request.price, traded_at: asOf });

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
  } else {
    const existingIndex = next.positions.findIndex((position) => position.symbol === request.symbol && position.status !== "CLOSED" && finiteOr(position.qty, 0) > 0);
    if (existingIndex < 0) {
      const rejected = rejectedPaperOrder(request, "no open paper position to sell", asOf);
      next.orders = [rejected, ...next.orders].slice(0, 200);
      const saved = sanitizePaperTraderState(next);
      return { ok: false, status: 409, order: rejected, paperTrader: saved, nextState: { ...state, paperTrader: saved } };
    }
    const existing = next.positions[existingIndex];
    const sellQty = Math.min(request.qty, Math.max(0, finiteOr(existing.qty, 0)));
    const remaining = Math.max(0, finiteOr(existing.qty, 0) - sellQty);
    const entryPrice = finiteOr(existing.entry_price, request.price);
    const entryValue = round(entryPrice * sellQty, 2);
    const exitValue = round(request.price * sellQty, 2);
    const realized = round((request.price - entryPrice) * sellQty, 2);
    trade = sanitizePaperTrade({
      ...trade,
      qty: sellQty,
      value: exitValue,
      entry_price: entryPrice,
      exit_price: request.price,
      entry_value: entryValue,
      exit_value: exitValue,
      realized_pnl: realized,
      return_pct: entryValue ? realized / entryValue * 100 : null,
      entry_at: existing.entry_date,
      exit_at: asOf,
      holding_days: paperHoldingDays(existing.entry_date, asOf),
      close_reason: request.thesis || "Manual paper SELL"
    });
    next.funds = sanitizePaperFunds({ ...next.funds, realized_pnl: finiteOr(next.funds.realized_pnl, 0) + realized });
    if (remaining > 0) next.positions[existingIndex] = sanitizePaperPosition({ ...existing, qty: remaining, current_price: request.price, checked_at: asOf });
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
  const realized = round((price - entryPrice) * qty, 2);
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
    realized_pnl: realized,
    return_pct: entryValue ? realized / entryValue * 100 : null,
    entry_at: position.entry_date,
    exit_at: asOf,
    holding_days: paperHoldingDays(position.entry_date, asOf),
    close_reason: reason,
    traded_at: asOf
  });
  next.orders.unshift(order);
  next.trades.unshift(trade);
  next.funds = sanitizePaperFunds({ ...next.funds, realized_pnl: finiteOr(next.funds.realized_pnl, 0) + realized });
  return { type: reason.includes("STOP") ? "STOP_EXIT" : "TARGET_EXIT", symbol: position.symbol, qty, price, realized_pnl: realized, order_id: order.id, reason };
}
function openPaperPositionFromGtt(next, plan, price, asOf) {
  const order = sanitizePaperOrder({
    id: paperLedgerId("PAPER_GTT_FILL"),
    symbol: plan.symbol,
    name: plan.name,
    side: plan.side,
    product: "Paper GTT",
    order_type: "GTT",
    qty: plan.qty,
    price,
    target_price: plan.target_price,
    stop_price: plan.stop_price,
    status: "PAPER_FILLED",
    thesis: plan.thesis || "Paper GTT trigger touched by monitor",
    source: "paper-lifecycle-monitor",
    created_at: asOf,
    updated_at: asOf
  });
  const trade = sanitizePaperTrade({ id: paperLedgerId("PAPER_GTT_TRADE"), order_id: order.id, symbol: plan.symbol, side: plan.side, qty: plan.qty, price, value: plan.qty * price, traded_at: asOf });
  next.orders.unshift(order);
  next.trades.unshift(trade);
  if (plan.side === "BUY") {
    const existingIndex = next.positions.findIndex((position) => position.symbol === plan.symbol && position.status !== "CLOSED");
    if (existingIndex >= 0) {
      const existing = next.positions[existingIndex];
      const oldQty = Math.max(0, finiteOr(existing.qty, 0));
      const newQty = oldQty + plan.qty;
      const weightedEntry = newQty ? ((oldQty * finiteOr(existing.entry_price, price)) + (plan.qty * price)) / newQty : price;
      next.positions[existingIndex] = sanitizePaperPosition({ ...existing, qty: newQty, entry_price: round(weightedEntry, 2), current_price: price, target_price: plan.target_price || existing.target_price, stop_price: plan.stop_price || existing.stop_price, status: "OPEN", checked_at: asOf });
    } else {
      next.positions.unshift(sanitizePaperPosition({ symbol: plan.symbol, name: plan.name, qty: plan.qty, entry_price: price, current_price: price, target_price: plan.target_price, stop_price: plan.stop_price, entry_date: asOf, status: "OPEN", thesis: plan.thesis }));
    }
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
        const result = applyPaperOrderLifecycle(state, body);
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
    '  return { symbol, instrument_key: String(position.instrument_key || "").slice(0, 100), name: String(position.name || symbol).slice(0, 120), sector: String(position.sector || "Unmapped").slice(0, 80), qty: Math.max(0, Math.floor(finiteOr(position.qty, 0))), entry_price: finiteOr(position.entry_price, null), decision_price: finiteOr(position.decision_price, null), current_price: finiteOr(position.current_price, position.entry_price ?? null), target_price: finiteOr(position.target_price, null), stop_price: finiteOr(position.stop_price, null), quote_timestamp: String(position.quote_timestamp || "").slice(0, 40), entry_date: String(position.entry_date || "").slice(0, 32), checked_at: String(position.checked_at || position.quote_timestamp || position.entry_date || "").slice(0, 40), status: String(position.status || "OPEN").slice(0, 30), thesis: String(position.thesis || "").slice(0, 360), parameter_evidence: sanitizeParameterEvidence(position.parameter_evidence || {}), execution_evidence: sanitizeExecutionEvidence(position.execution_evidence || {}) };',
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
