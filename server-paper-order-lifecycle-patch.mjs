const PAPER_ORDER_LIFECYCLE_FUNCTIONS = String.raw`
const PAPER_ORDER_LIFECYCLE_VERSION = "ashstocks-paper-order-lifecycle-v0.2";
function defaultPaperFunds() {
  return { currency: "INR", starting_capital: 2500000, realized_pnl: 0 };
}
function sanitizePaperFunds(input = {}) {
  const base = defaultPaperFunds();
  return {
    currency: "INR",
    starting_capital: Math.max(10000, finiteOr(input.starting_capital ?? input.startingCapital ?? base.starting_capital, base.starting_capital)),
    realized_pnl: round(finiteOr(input.realized_pnl ?? input.realizedPnl ?? base.realized_pnl, base.realized_pnl), 2)
  };
}
function sanitizePaperOrder(order = {}) {
  const symbol = normalizeSymbol(order.symbol);
  return {
    id: String(order.id || "").slice(0, 64),
    symbol,
    name: String(order.name || symbol).slice(0, 120),
    side: String(order.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
    product: String(order.product || "Paper Swing").slice(0, 40),
    order_type: String(order.order_type || order.orderType || "MARKET").toUpperCase().slice(0, 20),
    qty: Math.max(0, Math.floor(finiteOr(order.qty, 0))),
    price: finiteOr(order.price ?? order.entry_price, null),
    target_price: finiteOr(order.target_price ?? order.targetPrice, null),
    stop_price: finiteOr(order.stop_price ?? order.stopPrice, null),
    status: String(order.status || "PAPER_CREATED").slice(0, 40),
    rejection_reason: String(order.rejection_reason || "").slice(0, 220),
    source: String(order.source || "ashstocks-paper-ticket").slice(0, 80),
    thesis: String(order.thesis || "").slice(0, 360),
    created_at: String(order.created_at || "").slice(0, 40),
    updated_at: String(order.updated_at || order.created_at || "").slice(0, 40),
    paper_only: true,
    broker_write_enabled: false
  };
}
function sanitizePaperTrade(trade = {}) {
  const symbol = normalizeSymbol(trade.symbol);
  return {
    id: String(trade.id || "").slice(0, 64),
    order_id: String(trade.order_id || trade.orderId || "").slice(0, 64),
    symbol,
    side: String(trade.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
    qty: Math.max(0, Math.floor(finiteOr(trade.qty, 0))),
    price: finiteOr(trade.price, null),
    value: round(finiteOr(trade.value, 0), 2),
    realized_pnl: round(finiteOr(trade.realized_pnl ?? trade.realizedPnl, 0), 2),
    traded_at: String(trade.traded_at || "").slice(0, 40),
    paper_only: true,
    broker_write_enabled: false
  };
}
function sanitizePaperGtt(plan = {}) {
  const symbol = normalizeSymbol(plan.symbol);
  return {
    id: String(plan.id || "").slice(0, 64),
    symbol,
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
function paperLifecycleFunds(paperTrader = {}) {
  const funds = sanitizePaperFunds(paperTrader.funds || {});
  const positions = Array.isArray(paperTrader.positions) ? paperTrader.positions.map(sanitizePaperPosition) : [];
  const invested = positions.reduce((sum, position) => sum + finiteOr(position.qty, 0) * finiteOr(position.current_price ?? position.entry_price, 0), 0);
  return {
    ...funds,
    invested_value: round(invested, 2),
    buying_power: round(funds.starting_capital + funds.realized_pnl - invested, 2),
    open_positions: positions.filter((position) => position.qty > 0).length,
    open_orders: Array.isArray(paperTrader.orders) ? paperTrader.orders.filter((order) => !["REJECTED", "CANCELLED"].includes(order.status)).length : 0,
    active_gtt: Array.isArray(paperTrader.gtt) ? paperTrader.gtt.filter((plan) => plan.status === "ACTIVE").length : 0,
    paper_only: true,
    broker_write_enabled: false
  };
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
    name: String(body.name || symbol).slice(0, 120),
    side,
    product,
    order_type: orderType,
    qty,
    price,
    target_price: finiteOr(body.target_price ?? body.targetPrice ?? body.target, null),
    stop_price: finiteOr(body.stop_price ?? body.stopPrice ?? body.stop, null),
    source: String(body.source || "upstox-workspace-paper-ticket").slice(0, 80),
    thesis: String(body.thesis || body.reason || "AshStocks paper ticket").slice(0, 360),
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

  if (request.gtt || request.order_type === "GTT") {
    const plan = sanitizePaperGtt({ id: paperLedgerId("PAPER_GTT"), ...request, entry_price: request.price, status: "ACTIVE", created_at: asOf });
    next.gtt = [plan, ...next.gtt].slice(0, 200);
    const saved = sanitizePaperTraderState(next);
    return { ok: true, status: 200, action: "PAPER_GTT_CREATED", gtt: plan, funds: paperLifecycleFunds(saved), paperTrader: saved, nextState: { ...state, paperTrader: saved } };
  }

  const order = sanitizePaperOrder({ id: paperLedgerId("PAPER_ORDER"), ...request, status: "PAPER_FILLED", created_at: asOf, updated_at: asOf });
  let trade = sanitizePaperTrade({ id: paperLedgerId("PAPER_TRADE"), order_id: order.id, symbol: request.symbol, side: request.side, qty: request.qty, price: request.price, value: request.qty * request.price, traded_at: asOf });

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
        checked_at: asOf
      });
    } else {
      next.positions.unshift(sanitizePaperPosition({
        symbol: request.symbol,
        name: request.name,
        sector: body.sector || "Unmapped",
        qty: request.qty,
        entry_price: request.price,
        current_price: request.price,
        target_price: request.target_price,
        stop_price: request.stop_price,
        entry_date: asOf,
        status: "OPEN",
        thesis: request.thesis
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
    const realized = round((request.price - finiteOr(existing.entry_price, request.price)) * sellQty, 2);
    trade = sanitizePaperTrade({ ...trade, qty: sellQty, value: sellQty * request.price, realized_pnl: realized });
    next.funds = sanitizePaperFunds({ ...next.funds, realized_pnl: finiteOr(next.funds.realized_pnl, 0) + realized });
    if (remaining > 0) next.positions[existingIndex] = sanitizePaperPosition({ ...existing, qty: remaining, current_price: request.price, checked_at: asOf });
    else next.positions.splice(existingIndex, 1);
  }

  next.orders = [order, ...next.orders].slice(0, 200);
  next.trades = [trade, ...next.trades].slice(0, 300);
  next.last_order_at = asOf;
  next.last_run = next.last_run || asOf;
  const saved = sanitizePaperTraderState(next);
  return { ok: true, status: 200, action: order.side === "BUY" ? "PAPER_BUY_FILLED" : "PAPER_SELL_FILLED", order, trade, funds: paperLifecycleFunds(saved), paperTrader: saved, nextState: { ...state, paperTrader: saved } };
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
  const realized = round((price - finiteOr(position.entry_price, price)) * qty, 2);
  const trade = sanitizePaperTrade({ id: paperLedgerId("PAPER_MONITOR_TRADE"), order_id: order.id, symbol: position.symbol, side: "SELL", qty, price, value: qty * price, realized_pnl: realized, traded_at: asOf });
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
        const paperTrader = sanitizePaperTraderState(state.paperTrader || {});
        json(res, 200, { ok: true, engine: PAPER_ORDER_LIFECYCLE_VERSION, paper_only: true, live_orders: false, orders: paperTrader.orders, trades: paperTrader.trades, gtt: paperTrader.gtt, positions: paperTrader.positions, funds: paperLifecycleFunds(paperTrader), last_monitor: paperTrader.last_monitor || null });
        return;
      }
`;

export function applyPaperOrderLifecyclePatches(source, mustReplace) {
  let output = source;
  output = mustReplace(
    output,
    'function defaultPaperTraderState() {\n  return { version: PAPER_TRADER_VERSION, paper_only: true, live_orders: false, last_run: null, positions: [], history: [], last_plan: null };\n}',
    'function defaultPaperTraderState() {\n  return { version: PAPER_TRADER_VERSION, lifecycle_version: "ashstocks-paper-order-lifecycle-v0.2", paper_only: true, live_orders: false, last_run: null, last_order_at: null, last_monitor_at: null, last_monitor: null, funds: defaultPaperFunds(), positions: [], orders: [], trades: [], gtt: [], history: [], last_plan: null };\n}',
    'paper order lifecycle default state'
  );
  output = mustReplace(
    output,
    '  return { version: PAPER_TRADER_VERSION, paper_only: true, live_orders: false, last_run: state.last_run || null, positions: Array.isArray(state.positions) ? state.positions.slice(0, 80).map(sanitizePaperPosition) : [], history: Array.isArray(state.history) ? state.history.slice(0, 50) : [], last_plan: state.last_plan && typeof state.last_plan === "object" ? state.last_plan : null };',
    '  return { version: PAPER_TRADER_VERSION, lifecycle_version: PAPER_ORDER_LIFECYCLE_VERSION, paper_only: true, live_orders: false, last_run: state.last_run || null, last_order_at: state.last_order_at || null, last_monitor_at: state.last_monitor_at || null, last_monitor: state.last_monitor && typeof state.last_monitor === "object" ? state.last_monitor : null, funds: sanitizePaperFunds(state.funds || {}), positions: Array.isArray(state.positions) ? state.positions.slice(0, 120).map(sanitizePaperPosition) : [], orders: Array.isArray(state.orders) ? state.orders.slice(0, 200).map(sanitizePaperOrder) : [], trades: Array.isArray(state.trades) ? state.trades.slice(0, 300).map(sanitizePaperTrade) : [], gtt: Array.isArray(state.gtt) ? state.gtt.slice(0, 200).map(sanitizePaperGtt) : [], history: Array.isArray(state.history) ? state.history.slice(0, 50) : [], last_plan: state.last_plan && typeof state.last_plan === "object" ? state.last_plan : null };',
    'paper order lifecycle sanitize state'
  );
  output = mustReplace(output, '\nfunction paperTraderSettings(input = {}) {', `\n${PAPER_ORDER_LIFECYCLE_FUNCTIONS}\nfunction paperTraderSettings(input = {}) {`, 'insert paper order lifecycle functions');
  output = mustReplace(output, '      if (url.pathname === "/api/paper-trader/run") {', `${PAPER_ORDER_LIFECYCLE_ROUTES}\n      if (url.pathname === "/api/paper-trader/run") {`, 'paper order lifecycle routes');
  return output;
}