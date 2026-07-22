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
const PAPER_ENGINE_AUTOBUY_VERSION = "ashstocks-paper-engine-autobuy-v0.1";

function paperEngineAutoBuySettings(input = {}) {
  return {
    enabled: ENV.DISABLE_PAPER_ENGINE_AUTOBUY === "true" ? false : true,
    maxBuysPerRun: Math.min(10, Math.max(1, Math.floor(finiteOr(input.maxBuysPerRun ?? input.max_buys_per_run ?? ENV.PAPER_ENGINE_MAX_BUYS_PER_RUN, 3)))),
    requireScannerDecision: String(input.requireScannerDecision || ENV.PAPER_ENGINE_REQUIRED_DECISION || "SELECT").toUpperCase(),
    product: String(input.product || ENV.PAPER_ENGINE_PRODUCT || "Paper Swing").slice(0, 40)
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

function paperEngineCandidateTickets(plan = {}, state = defaultState(), settings = paperEngineAutoBuySettings()) {
  const openSymbols = paperEngineOpenSymbols(state);
  return (Array.isArray(plan.buy_queue) ? plan.buy_queue : [])
    .filter((ticket) => normalizeSymbol(ticket.symbol))
    .filter((ticket) => !openSymbols.has(normalizeSymbol(ticket.symbol)))
    .filter((ticket) => ticket.readiness === "READY")
    .filter((ticket) => String(ticket.scanner_decision || "").toUpperCase() === settings.requireScannerDecision)
    .filter((ticket) => finiteOr(ticket.close, null) && finiteOr(ticket.qty, 0) > 0)
    .slice(0, settings.maxBuysPerRun);
}
`;

const PAPER_ENGINE_RUN_REPLACEMENT = String.raw`async function runPaperEngineOnce(trigger = "manual", slot = null) {
  const store = await getStore();
  let state = await store.getState();
  if (!ENV.UPSTOX_ACCESS_TOKEN) {
    const result = { ok: false, error: "upstox_token_missing", trigger, slot, status: upstoxStatus() };
    paperEngineState.lastResult = result;
    return result;
  }

  const scan = await runUpstoxScanner({ universe: state.universe, settings: state.scannerSettings, holdings: state.paperTrader?.positions || [] }, state.universe);
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
  let monitor = null;
  let workingState = state;
  if (autoSettings.enabled) {
    monitor = applyPaperLifecycleMonitor(workingState, scan.rows || [], { source: "paper-engine-monitor" });
    workingState = monitor.nextState;
  }

  const tickets = autoSettings.enabled ? paperEngineCandidateTickets(plan, workingState, autoSettings) : [];
  const orders = [];
  const rejected = [];
  for (const ticket of tickets) {
    const orderBody = {
      symbol: ticket.symbol,
      name: ticket.name,
      sector: ticket.sector,
      side: "BUY",
      order_type: "MARKET",
      qty: ticket.qty,
      price: ticket.close,
      target_price: ticket.target_price,
      stop_price: ticket.stop_price,
      product: autoSettings.product,
      source: "paper-engine-autobuy",
      thesis: ticket.thesis || ("Auto paper buy from " + ticket.scanner_decision + " scan")
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
      required_decision: autoSettings.requireScannerDecision,
      max_buys_per_run: autoSettings.maxBuysPerRun,
      candidates_ready: tickets.length,
      orders_filled: orders.length,
      rejected: rejected.length,
      orders: orders.map((order) => ({ id: order.id, symbol: order.symbol, qty: order.qty, price: order.price, target_price: order.target_price, stop_price: order.stop_price, status: order.status }))
    },
    monitor: monitor ? {
      events: monitor.events || [],
      data_needed: monitor.data_needed || []
    } : null,
    funds: paperLifecycleFunds(savedPaperTrader),
    positions: savedPaperTrader.positions.slice(0, 20),
    safety: { paper_only: true, live_orders: false, broker_write_enabled: false, historical_candles_only: true }
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
