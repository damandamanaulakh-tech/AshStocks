const PAPER_TRADER_FUNCTIONS = String.raw`
const PAPER_TRADER_VERSION = "ashstocks-paper-trader-v0.2";
const PAPER_TRADER_PARAMETERS = Object.freeze([
  { key: "scanner_score", group: "Core", label: "Scanner score", weight: 35 },
  { key: "momentum_6m_12m", group: "Core", label: "6M/12M momentum", weight: 18 },
  { key: "target_room", group: "Rotation", label: "Target room left", weight: 12 },
  { key: "liquidity", group: "Execution", label: "ADV/turnover", weight: 10 },
  { key: "theme_heat", group: "Narrative", label: "AI/defence/rail/infra/energy/IT/PSU tags", weight: 10 },
  { key: "event_resilience", group: "Event", label: "Crash/event trend resilience", weight: 8 },
  { key: "risk_penalty", group: "Risk", label: "Volatility and missing-data penalty", weight: -7 },
  { key: "paper_rotation", group: "Portfolio", label: "Target-hit/stop/replace discipline", weight: 0 }
]);
const THEME_KEYWORDS = Object.freeze([
  { theme: "AI / Digital", words: ["TECH", "INFOTECH", "SOFTWARE", "DIGITAL", "DATA", "TCS", "INFOSYS", "HCL", "WIPRO", "PERSISTENT", "LTIMINDTREE", "MPHASIS"] },
  { theme: "Defence / Aerospace", words: ["DEFENCE", "AEROSPACE", "BHARAT ELECTRONICS", "BEL", "HAL", "COCHIN", "SHIP", "BEML"] },
  { theme: "Rail / Infra", words: ["RAIL", "IRFC", "IRCTC", "RVNL", "RITES", "INFRA", "LARSEN", "CONSTRUCTION", "ENGINEERS"] },
  { theme: "Green Energy / Power", words: ["GREEN", "RENEW", "SOLAR", "POWER", "ENERGY", "NTPC", "ADANI GREEN", "TATA POWER", "SUZLON"] },
  { theme: "EV / Auto", words: ["AUTO", "MOTOR", "ELECTRIC", "BATTERY", "EXIDE", "AMARA", "TATA MOTORS", "BAJAJ AUTO", "EICHER"] },
  { theme: "Banks / Financials", words: ["BANK", "FINANCE", "HDFC", "ICICI", "KOTAK", "AXIS", "SBIN", "NBFC"] },
  { theme: "Pharma / Healthcare", words: ["PHARMA", "LIFE", "HEALTH", "LAB", "DR REDDY", "SUN PHARMA", "CIPLA", "APOLLO"] },
  { theme: "PSU / Policy", words: ["PSU", "BHARAT", "INDIAN", "OIL", "ONGC", "COAL", "POWERGRID", "NTPC", "SAIL", "GAIL"] },
  { theme: "Consumption", words: ["CONSUMER", "FMCG", "RETAIL", "FOODS", "HINDUSTAN UNILEVER", "ITC", "TRENT", "AVENUE"] }
]);
function defaultPaperTraderState() {
  return { version: PAPER_TRADER_VERSION, paper_only: true, live_orders: false, last_run: null, positions: [], history: [], last_plan: null };
}
function sanitizePaperTraderState(input = {}) {
  const state = { ...defaultPaperTraderState(), ...(input || {}) };
  return {
    version: PAPER_TRADER_VERSION,
    paper_only: true,
    live_orders: false,
    last_run: state.last_run || null,
    positions: Array.isArray(state.positions) ? state.positions.slice(0, 80).map(sanitizePaperPosition) : [],
    history: Array.isArray(state.history) ? state.history.slice(0, 50) : [],
    last_plan: state.last_plan && typeof state.last_plan === "object" ? state.last_plan : null
  };
}
function sanitizePaperPosition(position = {}) {
  const symbol = normalizeSymbol(position.symbol);
  return {
    symbol,
    name: String(position.name || symbol).slice(0, 120),
    sector: String(position.sector || "Unmapped").slice(0, 80),
    qty: Math.max(0, Math.floor(finiteOr(position.qty, 0))),
    entry_price: finiteOr(position.entry_price, null),
    current_price: finiteOr(position.current_price, position.entry_price ?? null),
    target_price: finiteOr(position.target_price, null),
    stop_price: finiteOr(position.stop_price, null),
    entry_date: String(position.entry_date || "").slice(0, 32),
    status: String(position.status || "OPEN").slice(0, 30),
    thesis: String(position.thesis || "").slice(0, 240)
  };
}
function paperTraderSettings(input = {}) {
  return {
    maxCandidates: Math.min(100, Math.max(10, Math.floor(finiteOr(input.maxCandidates ?? input.max_candidates, 50)))),
    buyQueueSize: Math.min(60, Math.max(5, Math.floor(finiteOr(input.buyQueueSize ?? input.buy_queue_size, 30)))),
    startingCapital: Math.max(10000, finiteOr(input.startingCapital ?? input.starting_capital, 1000000)),
    maxPositionPct: Math.min(0.2, Math.max(0.01, finiteOr(input.maxPositionPct ?? input.max_position_pct, 0.04))),
    targetDefaultPct: Math.min(80, Math.max(8, finiteOr(input.targetDefaultPct ?? input.target_default_pct, 25))),
    stopLossPct: Math.min(25, Math.max(4, finiteOr(input.stopLossPct ?? input.stop_loss_pct, 10))),
    replaceBelowScore: Math.min(80, Math.max(5, finiteOr(input.replaceBelowScore ?? input.replace_below_score, 45))),
    targetHitPct: Math.min(100, Math.max(20, finiteOr(input.targetHitPct ?? input.target_hit_pct, 80)))
  };
}
function paperTraderStatusPayload(state = defaultState()) {
  const paperTrader = sanitizePaperTraderState(state.paperTrader || {});
  return { ok: true, engine: PAPER_TRADER_VERSION, paper_only: true, live_orders: false, parameters: PAPER_TRADER_PARAMETERS, status: paperTrader, data_bank: dataBankSummary(state), upstox: upstoxStatus() };
}
function buildPaperTraderPlan(scan, state = defaultState(), options = {}) {
  const settings = paperTraderSettings(options.settings || options);
  const paperState = sanitizePaperTraderState(state.paperTrader || {});
  const asOf = scan.asOf || new Date().toISOString();
  const rows = Array.isArray(scan.rows) ? scan.rows : [];
  const ranked = rows.map((row) => enrichPaperCandidate(row, settings)).sort((a, b) => b.paper_score - a.paper_score || b.score - a.score || a.symbol.localeCompare(b.symbol));
  const investable = ranked.filter((row) => row.paper_ready);
  const watch = ranked.filter((row) => !row.paper_ready && row.watch_ready).slice(0, settings.maxCandidates);
  const buyQueue = investable.slice(0, settings.buyQueueSize).map((row, index) => paperBuyTicket(row, index, settings, asOf));
  const positions = paperState.positions.map((position) => evaluatePaperPosition(position, rows, settings, asOf));
  const sellQueue = positions.filter((position) => ["TARGET_HIT", "STOP_HIT", "REPLACE"].includes(position.action));
  const holdQueue = positions.filter((position) => position.action === "HOLD");
  const watchlists = buildWatchlists(ranked, investable, watch);
  const historyItem = { at: asOf, source: scan.source || "paper-trader", scanned: rows.length, buy_queue: buyQueue.length, sell_queue: sellQueue.length, data_needed: ranked.filter((row) => row.decision === "DATA_NEEDED").length };
  return {
    ok: true,
    engine: PAPER_TRADER_VERSION,
    asOf,
    paper_only: true,
    live_orders: false,
    source: scan.source || "paper-trader",
    settings,
    summary: { scanned: rows.length, candidates: investable.length, buy_queue: buyQueue.length, watch: watch.length, active_positions: positions.length, sell_queue: sellQueue.length, data_needed: ranked.filter((row) => row.decision === "DATA_NEEDED").length },
    buy_queue: buyQueue,
    sell_queue: sellQueue,
    hold_queue: holdQueue,
    watchlists,
    top_ranked: ranked.slice(0, settings.maxCandidates),
    scan_summary: scan.summary || {},
    history: [historyItem, ...paperState.history].slice(0, 50)
  };
}
function enrichPaperCandidate(row = {}, settings) {
  const close = finiteOr(row.close, null);
  const score = finiteOr(row.score, 0);
  const momentum = finiteOr(row.momentum_score, 0);
  const quality = finiteOr(row.quality_score, 0);
  const ret6 = finiteOr(row.return_6m_pct, 0);
  const ret12 = finiteOr(row.return_12m_pct, 0);
  const vol = finiteOr(row.vol_63d_pct, 0);
  const targetLeft = finiteOr(row.target_potential?.potential_left_pct, settings.targetDefaultPct);
  const turnover = finiteOr(row.rupee_turnover_cr, 0);
  const liquidity = Math.min(100, Math.max(0, turnover * 6));
  const themes = detectThemes(row);
  const themeHeat = themes.length ? Math.min(100, 50 + themes.length * 15) : 25;
  const eventResilience = Math.max(0, Math.min(100, 45 + ret6 * 0.55 + ret12 * 0.25 - vol * 0.35));
  const riskPenalty = Math.max(0, Math.min(35, vol * 0.28 + (row.decision === "DATA_NEEDED" ? 25 : 0)));
  const paperScore = round(score * 0.35 + momentum * 0.18 + quality * 0.10 + Math.max(0, Math.min(100, targetLeft * 3)) * 0.12 + liquidity * 0.10 + themeHeat * 0.10 + eventResilience * 0.08 - riskPenalty, 2);
  const paperReady = Boolean(close && ["SELECT", "WATCH"].includes(row.decision) && paperScore >= settings.replaceBelowScore && targetLeft >= 10);
  const watchReady = Boolean(close && row.decision !== "REJECT" && paperScore >= 30);
  const targetPct = Math.max(12, Math.min(80, targetLeft || settings.targetDefaultPct));
  const targetPrice = close ? round(close * (1 + targetPct / 100), 2) : null;
  const stopPrice = close ? round(close * (1 - settings.stopLossPct / 100), 2) : null;
  return { ...row, themes, theme_heat: round(themeHeat, 2), event_resilience: round(eventResilience, 2), paper_score: paperScore, paper_ready: paperReady, watch_ready: watchReady, target_price: targetPrice, stop_price: stopPrice, target_pct: round(targetPct, 2), stop_loss_pct: settings.stopLossPct, paper_reason: paperReason(row, themes, targetLeft, paperScore) };
}
function detectThemes(row = {}) {
  const text = String((row.symbol || "") + " " + (row.name || "") + " " + (row.sector || "")).toUpperCase();
  return THEME_KEYWORDS.filter((theme) => theme.words.some((word) => text.includes(word))).map((theme) => theme.theme);
}
function paperReason(row, themes, targetLeft, paperScore) {
  const parts = [];
  parts.push("paper_score " + paperScore);
  if (row.decision) parts.push(row.decision);
  if (Number.isFinite(Number(targetLeft))) parts.push(round(targetLeft, 1) + "% target room");
  if (themes.length) parts.push(themes.slice(0, 2).join(" + "));
  if (row.reason) parts.push(row.reason);
  return parts.join("; ");
}
function paperBuyTicket(row, index, settings, asOf) {
  const capital = settings.startingCapital * settings.maxPositionPct;
  const qty = row.close ? Math.max(1, Math.floor(capital / row.close)) : 0;
  return { rank: index + 1, symbol: row.symbol, name: row.name, sector: row.sector || "Unmapped", action: "PAPER_BUY", paper_score: row.paper_score, close: row.close, qty, estimated_value: round(qty * row.close, 2), target_price: row.target_price, stop_price: row.stop_price, target_pct: row.target_pct, stop_loss_pct: row.stop_loss_pct, themes: row.themes, thesis: row.paper_reason, created_at: asOf, paper_only: true, broker_write_enabled: false };
}
function evaluatePaperPosition(position, rows, settings, asOf) {
  const row = rows.find((candidate) => candidate.symbol === position.symbol) || {};
  const current = finiteOr(row.close, position.current_price ?? position.entry_price);
  const target = finiteOr(position.target_price, current ? current * (1 + settings.targetDefaultPct / 100) : null);
  const stop = finiteOr(position.stop_price, current ? current * (1 - settings.stopLossPct / 100) : null);
  const entry = finiteOr(position.entry_price, current);
  const pnlPct = entry && current ? round(((current - entry) / entry) * 100, 2) : null;
  const targetProgress = entry && target && current ? round(((current - entry) / Math.max(0.01, target - entry)) * 100, 2) : null;
  let action = "HOLD";
  let reason = "position still valid";
  if (current && target && current >= target * (settings.targetHitPct / 100)) { action = "TARGET_HIT"; reason = "target progress reached rotation threshold"; }
  if (current && stop && current <= stop) { action = "STOP_HIT"; reason = "stop loss reached"; }
  if (row.paper_score !== undefined && row.paper_score < settings.replaceBelowScore && action === "HOLD") { action = "REPLACE"; reason = "paper score fell below replace threshold"; }
  return { ...position, current_price: current, target_price: target, stop_price: stop, pnl_pct: pnlPct, target_progress_pct: targetProgress, latest_paper_score: row.paper_score ?? null, action, reason, checked_at: asOf, paper_only: true };
}
function buildWatchlists(ranked, investable, watch) {
  const byTheme = new Map();
  for (const row of ranked) for (const theme of row.themes || []) { if (!byTheme.has(theme)) byTheme.set(theme, []); byTheme.get(theme).push(miniCandidate(row)); }
  return { morning_top_50: investable.slice(0, 50).map(miniCandidate), buy_queue_30: investable.slice(0, 30).map(miniCandidate), event_resilient: ranked.filter((row) => row.event_resilience >= 65).slice(0, 30).map(miniCandidate), target_room: ranked.filter((row) => finiteOr(row.target_potential?.potential_left_pct, 0) >= 20).slice(0, 30).map(miniCandidate), watch_not_buy: watch.slice(0, 40).map(miniCandidate), data_needed: ranked.filter((row) => row.decision === "DATA_NEEDED").slice(0, 40).map(miniCandidate), themes: Object.fromEntries([...byTheme.entries()].map(([theme, rows]) => [theme, rows.slice(0, 20)])) };
}
function miniCandidate(row) {
  return { symbol: row.symbol, name: row.name, sector: row.sector || "Unmapped", decision: row.decision, score: row.score, paper_score: row.paper_score, close: row.close, target_price: row.target_price, stop_price: row.stop_price, themes: row.themes || [], reason: row.paper_reason || row.reason || "" };
}
`;

const PAPER_TRADER_ROUTES = String.raw`
      if (url.pathname === "/api/paper-trader/parameters") {
        json(res, 200, { ok: true, engine: PAPER_TRADER_VERSION, paper_only: true, live_orders: false, parameters: PAPER_TRADER_PARAMETERS });
        return;
      }
      if (url.pathname === "/api/paper-trader/status") {
        const store = await getStore();
        const state = await store.getState();
        json(res, 200, paperTraderStatusPayload(state));
        return;
      }
      if (url.pathname === "/api/paper-trader/run") {
        if (req.method !== "POST") { json(res, 405, { ok: false, error: "Method not allowed" }); return; }
        const body = await readJsonBody(req);
        const store = await getStore();
        const state = await store.getState();
        const resolved = await resolveRequestUniverse(body);
        let scan;
        if (body.useUpstox !== false && ENV.UPSTOX_ACCESS_TOKEN) scan = await runUpstoxScanner(body, resolved.universe);
        if (!scan || scan.ok === false) scan = runScanner(resolved.universe, { ...(body.settings || {}), source: resolved.source, holdings: body.holdings || state.paperTrader?.positions || [] });
        const ledger = await appendScanLedger(scan, { store, mode: "paper-trader-scan", source: scan.source || resolved.source });
        const plan = buildPaperTraderPlan(scan, state, body);
        const nextPaperTrader = sanitizePaperTraderState({ ...(state.paperTrader || {}), last_run: plan.asOf, last_plan: plan, history: plan.history });
        await store.saveState({ ...state, paperTrader: nextPaperTrader });
        json(res, 200, { ...plan, ledger: scanLedgerMeta(ledger) });
        return;
      }
`;

export function applyPaperTraderPatches(source, mustReplace) {
  let output = source;
  output = mustReplace(output, 'function defaultState() {\n  return {\n    theme: "light",\n    selectedView: "scanner",\n    universe: INDIA_UNIVERSE,\n    scannerSettings: defaultScannerSettings()\n  };\n}', 'function defaultState() {\n  return {\n    theme: "light",\n    selectedView: "scanner",\n    universe: INDIA_UNIVERSE,\n    scannerSettings: defaultScannerSettings(),\n    paperTrader: defaultPaperTraderState()\n  };\n}', 'paper trader default state');
  output = mustReplace(output, '    universe: normalizeScannerUniverse(state.universe).slice(0, MAX_UNIVERSE_ROWS),\n    scannerSettings: normalizeScannerSettings(state.scannerSettings || {})\n  };', '    universe: normalizeScannerUniverse(state.universe).slice(0, MAX_UNIVERSE_ROWS),\n    scannerSettings: normalizeScannerSettings(state.scannerSettings || {}),\n    paperTrader: sanitizePaperTraderState(state.paperTrader || {})\n  };', 'paper trader sanitize state');
  output = mustReplace(output, '\nasync function dataBankStatus() {', `\n${PAPER_TRADER_FUNCTIONS}\nasync function dataBankStatus() {`, 'insert paper trader functions');
  output = mustReplace(output, '      if (url.pathname === "/api/scanner/run") {', `${PAPER_TRADER_ROUTES}\n      if (url.pathname === "/api/scanner/run") {`, 'paper trader api routes');
  return output;
}
