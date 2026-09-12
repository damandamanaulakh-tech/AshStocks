import { readFileSync } from "node:fs";

const valuationCode = readFileSync(new URL("./lib/valuation-targets.mjs", import.meta.url), "utf8")
  .replaceAll("export function ", "function ")
  .replaceAll("export const ", "const ");
const valuationSeed = JSON.parse(readFileSync(new URL("./data/valuation-assumptions-2026-09-09.json", import.meta.url), "utf8"));

const FUNCTIONS = String.raw`
${valuationCode}
const VALUATION_INITIAL_ASSUMPTIONS = ${JSON.stringify(valuationSeed.assumptions)};
const VALUATION_TRIGGER_INCREMENT_INR = 0.01;

function valuationClone(value) { return JSON.parse(JSON.stringify(value)); }
function valuationControl(input) {
  const seed = input && typeof input === "object" && !Array.isArray(input) ? input : null;
  const assumptions = {};
  const source = seed ? Object.values(seed.assumptions || {}) : VALUATION_INITIAL_ASSUMPTIONS;
  for (const row of source) {
    if (!row || typeof row !== "object" || !/^NSE_EQ\|[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(row.instrument_key || "")) continue;
    assumptions[row.instrument_key] = valuationClone(row);
  }
  const activations = {};
  for (const [key, value] of Object.entries(seed?.activations || {})) {
    if (!/^NSE_EQ\|[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(key) || !value || typeof value !== "object") continue;
    activations[key] = valuationClone(value);
  }
  return { schema_version: VALUATION_MODEL_VERSION,
    revision: Number.isSafeInteger(seed?.revision) && seed.revision >= 0 ? seed.revision : 0,
    updated_at: typeof seed?.updated_at === "string" ? seed.updated_at.slice(0, 40) : null,
    assumptions, activations, audit: Array.isArray(seed?.audit) ? valuationClone(seed.audit) : [] };
}

function valuationPositionFingerprint(position) {
  return crypto.createHash("sha256").update(JSON.stringify([
    position.instrument_key, normalizeSymbol(position.symbol), position.entry_date, position.entry_price, position.valuation_entry_revision || null
  ])).digest("hex");
}

function valuationEffectiveTarget(state, position, now = new Date()) {
  const legacy = { price: finiteOr(position.target_price, null), source: "technical", blocked: false, activation: null };
  const control = valuationControl(state.valuationTargets);
  const active = control.activations[position.instrument_key];
  if (!active || active.status !== "ACTIVE" || active.position_entry_date !== position.entry_date) return legacy;
  const blocked = (reason) => ({ price: null, source: "valuation_review_required", blocked: true, reason, activation: active });
  if (active.position_fingerprint !== valuationPositionFingerprint(position)) return blocked("Holding entry basis changed; review and reactivate the valuation target.");
  if (!(active.authorised_qty > 0) || Number(position.qty) > active.authorised_qty) return blocked("Holding quantity increased; review and reactivate the valuation target.");
  const current = control.assumptions[position.instrument_key];
  if (!current || current.corporate_action_reviewed !== true || current.corporate_action_basis !== active.assumption_snapshot?.corporate_action_basis) {
    return blocked("Current share-adjustment basis needs review before this valuation target can execute.");
  }
  const instrument = (state.universe || []).find((row) => row.instrument_key === position.instrument_key && normalizeSymbol(row.symbol) === normalizeSymbol(position.symbol));
  if (!instrument) return blocked("Holding is absent from the current NSE master; review required.");
  const calculation = calculateValuationTargets(active.assumption_snapshot, { now });
  const selected = chooseValuationTarget(calculation, active.horizon, active.price_policy, VALUATION_TRIGGER_INCREMENT_INR);
  if (!selected.ok || selected.price !== active.price || active.model_version !== VALUATION_MODEL_VERSION) {
    return blocked(selected.reason || "Stored target snapshot is invalid, stale or has reached its review date.");
  }
  return { price: active.price, source: "valuation", blocked: false, activation: active };
}

function valuationPositionView(state, position) {
  const effective = valuationEffectiveTarget(state, position);
  return { ...position, effective_target_price: effective.price, effective_target_source: effective.source,
    valuation_target_status: effective.blocked ? "REVIEW_REQUIRED" : effective.activation ? "ACTIVE" : "NOT_ACTIVATED",
    valuation_target_reason: effective.reason || null,
    valuation_target_activation_id: effective.activation?.id || null };
}

function valuationView(state, store, symbol = "") {
  const control = valuationControl(state.valuationTargets);
  const requested = normalizeSymbol(symbol);
  const positions = (state.paperTrader?.positions || []).filter((row) => row.status !== "CLOSED" && Number(row.qty) > 0);
  const records = Object.values(control.assumptions).map((assumption) => {
    const result = calculateValuationTargets(assumption);
    const position = positions.find((row) => row.instrument_key === assumption.instrument_key && normalizeSymbol(row.symbol) === assumption.symbol);
    return { ...result, assumption: result.assumption || assumption,
      available_in_universe: (state.universe || []).some((row) => row.instrument_key === assumption.instrument_key),
      open_position: position ? valuationPositionView(state, position) : null };
  }).sort((a, b) => a.assumption.symbol.localeCompare(b.assumption.symbol));
  let selected = requested ? records.find((row) => row.assumption.symbol === requested) || null : null;
  if (requested && !selected) {
    const row = (state.universe || []).find((item) => normalizeSymbol(item.symbol) === requested);
    selected = { status: "DATA_NEEDED", model_version: VALUATION_MODEL_VERSION,
      assumption: { symbol: requested, instrument_key: row?.instrument_key || "", isin: row?.isin || "" },
      targets: [], bear_12m: null, bull_12m: null, activation_allowed: false,
      warnings: ["No sourced annual EPS and P/E assumptions are saved for this stock."], open_position: null,
      available_in_universe: Boolean(row) };
  }
  const activeTargets = Object.fromEntries(Object.values(control.activations).filter((active) => active.status === "ACTIVE").map((active) => [active.symbol, active]));
  return { ok: true, engine: VALUATION_MODEL_VERSION, revision: control.revision, updated_at: control.updated_at,
    formulas: { ...VALUATION_FORMULAS, sell_price: "Internal market-exit trigger rounded upward to INR 0.01; not an exchange limit-order price" },
    records, selected, active_targets: activeTargets, audit: control.audit,
    storage: store.mode, persistent: store.persistent, seed_count: VALUATION_INITIAL_ASSUMPTIONS.length,
    paper_only: true, broker_write_enabled: false, calibrated_prediction: false };
}

function valuationMutationProblem(body, control) {
  if (!Number.isSafeInteger(body.expected_revision) || body.expected_revision !== control.revision) {
    return { ok: false, status: 409, error: "valuation_revision_conflict", revision: control.revision };
  }
  if (typeof body.reason !== "string" || body.reason.trim().length < 5 || body.reason.trim().length > 500) {
    return { ok: false, status: 400, error: "valuation_change_reason_required" };
  }
  return null;
}

function valuationAudit(control, action, body, before, after) {
  const at = new Date().toISOString();
  const audit = { id: crypto.randomUUID(), action, actor: "authenticated_session", at,
    revision_before: control.revision, revision_after: control.revision + 1,
    reason: body.reason.trim(), before: before ? valuationClone(before) : null, after: after ? valuationClone(after) : null };
  return { ...control, revision: control.revision + 1, updated_at: at, audit: [...control.audit, audit] };
}

async function saveValuationAssumption(body, store) {
  return withStateMutation(async () => {
    const state = await store.getState();
    const control = valuationControl(state.valuationTargets);
    const problem = valuationMutationProblem(body, control);
    if (problem) return problem;
    const validated = validateValuationAssumption(body.assumption);
    if (!validated.ok) return { ok: false, status: 400, error: "valuation_assumption_invalid", errors: validated.errors };
    const assumption = { ...validated.assumption, source_type: "user_assumption" };
    const instrument = (state.universe || []).find((row) => row.instrument_key === assumption.instrument_key && normalizeSymbol(row.symbol) === assumption.symbol && row.isin === assumption.isin);
    if (!instrument) return { ok: false, status: 409, error: "valuation_instrument_not_in_current_master" };
    const nextControl = valuationAudit(control, "ASSUMPTION_SAVE", body, control.assumptions[assumption.instrument_key], assumption);
    nextControl.assumptions[assumption.instrument_key] = assumption;
    const saved = await store.saveValuationMetadata({ ...state, valuationTargets: nextControl });
    return { ...valuationView(saved, store, assumption.symbol), notice: "Assumptions saved. Existing active sell targets remain frozen; reactivate explicitly to replace one." };
  });
}

async function activateValuationTarget(body, store) {
  const before = await store.getState();
  const initial = valuationControl(before.valuationTargets);
  const problem = valuationMutationProblem(body, initial);
  if (problem) return problem;
  if (body.confirm !== true) return { ok: false, status: 400, error: "valuation_activation_confirmation_required" };
  const symbol = normalizeSymbol(body.symbol);
  const key = String(body.instrument_key || "");
  const assumption = initial.assumptions[key];
  if (!assumption || assumption.symbol !== symbol) return { ok: false, status: 409, error: "valuation_assumption_missing" };
  const calculated = calculateValuationTargets(assumption);
  const choice = chooseValuationTarget(calculated, body.horizon, body.price_policy, VALUATION_TRIGGER_INCREMENT_INR);
  if (!choice.ok) return { ok: false, status: 409, error: choice.reason || "valuation_activation_blocked", warnings: calculated.warnings };
  const position = (before.paperTrader?.positions || []).find((row) => row.instrument_key === key && normalizeSymbol(row.symbol) === symbol && row.status !== "CLOSED" && Number(row.qty) > 0);
  if (!position || !position.entry_date || !(Number(position.entry_price) > 0)) return { ok: false, status: 409, error: "valuation_open_holding_required" };
  if (!(before.universe || []).some((row) => row.instrument_key === key && normalizeSymbol(row.symbol) === symbol)) return { ok: false, status: 409, error: "valuation_instrument_not_in_current_master" };
  if (!paperEngineMarketState().open) return { ok: false, status: 409, error: "nse_market_closed_for_valuation_activation" };
  let quote;
  try {
    const payload = await fetchUpstoxMarketQuotes([key]);
    const provider = payload.quotes?.find((row) => paperEngineQuoteKey(row.instrument_key) === key && normalizeSymbol(row.trading_symbol) === symbol);
    const timestamp = paperEngineTimestampMs(provider?.timestamp);
    const age = timestamp === null ? Infinity : (Date.now() - timestamp) / 1000;
    // Receiving a response now does not prove the provider's price is current.
    if (!provider || !(provider.last_price > 0) || age < -5 || age > 60) return { ok: false, status: 409, error: "valuation_fresh_market_quote_required" };
    quote = { close: provider.last_price, quote_timestamp: provider.timestamp };
  } catch (_) { return { ok: false, status: 409, error: "valuation_market_quote_unavailable" }; }
  if (choice.price <= Math.max(quote.close, Number(position.entry_price))) return { ok: false, status: 409, error: "valuation_target_not_above_market_and_entry", target_price: choice.price, current_price: quote.close, entry_price: position.entry_price };
  const fingerprint = valuationPositionFingerprint(position);
  return withStateMutation(async () => {
    const current = await store.getState();
    const control = valuationControl(current.valuationTargets);
    const conflict = valuationMutationProblem(body, control);
    if (conflict) return conflict;
    const held = (current.paperTrader?.positions || []).find((row) => row.instrument_key === key && normalizeSymbol(row.symbol) === symbol && row.status !== "CLOSED" && Number(row.qty) > 0);
    if (!held || valuationPositionFingerprint(held) !== fingerprint || Number(held.qty) !== Number(position.qty)) return { ok: false, status: 409, error: "valuation_holding_changed_during_activation" };
    const quoteMs = paperEngineTimestampMs(quote.quote_timestamp);
    const age = quoteMs === null ? Infinity : (Date.now() - quoteMs) / 1000;
    if (age < -5 || age > 60) return { ok: false, status: 409, error: "valuation_quote_expired_during_activation" };
    if (!(current.universe || []).some((row) => row.instrument_key === key && normalizeSymbol(row.symbol) === symbol)) return { ok: false, status: 409, error: "valuation_master_changed_during_activation" };
    const rechecked = chooseValuationTarget(calculateValuationTargets(control.assumptions[key]), body.horizon, body.price_policy, VALUATION_TRIGGER_INCREMENT_INR);
    if (!rechecked.ok || rechecked.price !== choice.price) return { ok: false, status: 409, error: rechecked.reason || "valuation_assumption_changed_during_activation" };
    if (Number(held.stop_price) >= choice.price) return { ok: false, status: 409, error: "valuation_target_not_above_stop" };
    const activation = { id: crypto.randomUUID(), status: "ACTIVE", symbol, instrument_key: key,
      model_version: VALUATION_MODEL_VERSION, assumption_revision: control.revision,
      assumption_snapshot: valuationClone(assumption), horizon: choice.months, price_policy: choice.policy,
      price: choice.price, trigger_increment_inr: VALUATION_TRIGGER_INCREMENT_INR,
      trigger_type: "INTERNAL_MARKET_EXIT_THRESHOLD_NOT_LIMIT_ORDER", position_fingerprint: fingerprint,
      authorised_qty: Number(held.qty),
      position_entry_date: held.entry_date, activated_at: new Date().toISOString(),
      quote_price_at_activation: quote.close, quote_timestamp: quote.quote_timestamp, reason: body.reason.trim() };
    const next = valuationAudit(control, "PAPER_TARGET_ACTIVATE", body, control.activations[key], activation);
    next.activations[key] = activation;
    const saved = await store.saveValuationMetadata({ ...current, valuationTargets: next });
    return { ...valuationView(saved, store, symbol), notice: "Paper target activated. No order was placed by activation; fresh executable market data and the existing stop controls remain required." };
  });
}

async function deactivateValuationTarget(body, store) {
  return withStateMutation(async () => {
    const state = await store.getState();
    const control = valuationControl(state.valuationTargets);
    const problem = valuationMutationProblem(body, control);
    if (problem) return problem;
    if (body.confirm !== true) return { ok: false, status: 400, error: "valuation_activation_confirmation_required" };
    const key = String(body.instrument_key || "");
    const existing = control.activations[key];
    if (!existing || existing.symbol !== normalizeSymbol(body.symbol)) return { ok: false, status: 404, error: "valuation_active_target_missing" };
    const disabled = { ...existing, status: "DISABLED", deactivated_at: new Date().toISOString(), deactivation_reason: body.reason.trim() };
    const next = valuationAudit(control, "PAPER_TARGET_DEACTIVATE", body, existing, disabled);
    next.activations[key] = disabled;
    const saved = await store.saveValuationMetadata({ ...state, valuationTargets: next });
    return { ...valuationView(saved, store, existing.symbol), notice: "Valuation target disabled. The existing legacy technical target is effective again; no order was placed by deactivation." };
  });
}

function valuationExecutionFields(input) {
  const value = input?.valuation_target_snapshot;
  if (!value || typeof value !== "object" || !value.id || !value.assumption_snapshot || !Number.isFinite(value.price)) return {};
  return { valuation_target_snapshot: valuationClone(value) };
}

function evaluateValuationPaperPosition(state, position, rows, settings, asOf) {
  const legacy = evaluatePaperPosition(position, rows, settings, asOf);
  const effective = valuationEffectiveTarget(state, position, asOf);
  if (effective.source === "technical") return legacy;
  const current = legacy.current_price;
  const stopHit = Number(legacy.stop_price) > 0 && current > 0 && current <= legacy.stop_price;
  const targetHit = !effective.blocked && effective.price > 0 && current >= effective.price;
  const scoreWeak = legacy.latest_paper_score !== null && legacy.latest_paper_score !== undefined && legacy.latest_paper_score < settings.replaceBelowScore;
  const action = stopHit ? "STOP_HIT" : targetHit ? "TARGET_HIT" : scoreWeak ? "REPLACE" : "HOLD";
  return { ...legacy, ...valuationPositionView(state, position), current_price: current,
    target_progress_pct: effective.price > position.entry_price ? (current - position.entry_price) / (effective.price - position.entry_price) * 100 : null,
    action, reason: stopHit ? "stop loss reached" : targetHit ? "activated valuation target reached" : scoreWeak ? "paper score fell below replace threshold" : effective.reason || "activated valuation target not reached" };
}
`;

const ROUTES = String.raw`
      if (url.pathname === "/api/valuation-targets" || url.pathname.startsWith("/api/valuation-targets/")) {
        const store = await getStore();
        if (url.pathname === "/api/valuation-targets" && req.method === "GET") {
          json(res, 200, valuationView(await store.getState(), store, url.searchParams.get("symbol") || "")); return;
        }
        const handlers = { "/api/valuation-targets/assumptions": saveValuationAssumption,
          "/api/valuation-targets/activate": activateValuationTarget, "/api/valuation-targets/deactivate": deactivateValuationTarget };
        const handler = handlers[url.pathname];
        if (!handler || req.method !== "POST") { json(res, 405, { ok: false, error: "method_not_allowed" }); return; }
        if (ENV.NODE_ENV === "production" && store.persistent !== true) { json(res, 503, { ok: false, error: "valuation_persistence_unavailable" }); return; }
        const result = await handler(await readJsonBody(req), store);
        json(res, result.status || (result.ok ? 200 : 409), result); return;
      }
`;

export function applyValuationTargetsPatches(source, mustReplace) {
  let output = mustReplace(source, "\nasync function dataBankStatus() {", `\n${FUNCTIONS}\nasync function dataBankStatus() {`, "insert versioned valuation target helpers");
  output = mustReplace(output, "    scannerRotation: sanitizeUniverseRotation(state.scannerRotation || {}),", "    scannerRotation: sanitizeUniverseRotation(state.scannerRotation || {}),\n    valuationTargets: valuationControl(state.valuationTargets),", "retain valuation state separately from trading state");
  output = mustReplace(output, "    async saveUniverseMetadata(nextState) {\n      state =", "    async saveValuationMetadata(nextState) {\n      state = { ...state, valuationTargets: valuationControl(nextState.valuationTargets) };\n      return state;\n    },\n    async saveUniverseMetadata(nextState) {\n      state =", "memory valuation-only persistence");
  output = mustReplace(output, "    async saveUniverseMetadata(nextState) {\n      const payload =", "    async saveValuationMetadata(nextState) {\n      const payload = JSON.parse(await fsp.readFile(STATE_FILE, \"utf8\"));\n      const next = { ...(payload.state || payload), valuationTargets: valuationControl(nextState.valuationTargets) };\n      await writeState(next);\n      state = next;\n      return state;\n    },\n    async saveUniverseMetadata(nextState) {\n      const payload =", "file valuation-only persistence preserves raw ledger");
  output = mustReplace(output, "        async saveUniverseMetadata(nextState) {\n          const metadata =", "        async saveValuationMetadata(nextState) {\n          const valuationTargets = valuationControl(nextState.valuationTargets);\n          const updated = await collection.updateOne({ _id: \"default\" }, { $set: { \"state.valuationTargets\": valuationTargets, updatedAt: new Date() } });\n          if (updated.matchedCount !== 1) throw new Error(\"valuation_state_missing\");\n          return { ...nextState, valuationTargets };\n        },\n        async saveUniverseMetadata(nextState) {\n          const metadata =", "Mongo valuation-only persistence never overwrites ledger");
  output = mustReplace(output, "const state = await store.saveState({ ...requested, scannerSettings: current.scannerSettings, selectionSettingsControl: current.selectionSettingsControl });", "const state = await store.saveState({ ...requested, scannerSettings: current.scannerSettings, selectionSettingsControl: current.selectionSettingsControl, valuationTargets: current.valuationTargets });", "prevent generic state writes from activating valuation targets");
  output = mustReplace(output, '      if (url.pathname === "/api/scanner/parameters") {', `${ROUTES}\n      if (url.pathname === "/api/scanner/parameters") {`, "valuation target domain routes");
  output = mustReplace(output, "          return refreshPaperTraderMarks(state, store);", "          return { ...await refreshPaperTraderMarks(state, store), valuationState: state };", "carry full valuation context with position marks");
  output = mustReplace(output, "const positions = paperTrader.positions.map(paperPositionValuation);", "const positions = paperTrader.positions.map((position) => valuationPositionView(marked.valuationState, paperPositionValuation(position)));", "report actual active target without changing position ledger");
  output = mustReplace(output, "const positions = paperState.positions.map((position) => evaluatePaperPosition(position, rows, settings, asOf));", "const positions = paperState.positions.map((position) => evaluateValuationPaperPosition(state, position, rows, settings, asOf));", "valuation advisory queue uses full activated target not legacy progress threshold");
  output = mustReplace(output, "    const target = finiteOr(position.target_price, null);\n    const stop = finiteOr(position.stop_price, null);", "    const valuationTarget = valuationEffectiveTarget(state, position, asOf);\n    const target = valuationTarget.price;\n    const stop = finiteOr(position.stop_price, null);\n    if (valuationTarget.blocked) dataNeeded.push({ symbol: position.symbol, reason: valuationTarget.reason });", "monitor uses only explicitly activated valid valuation targets");
  output = mustReplace(output, 'quote_timestamp: quoteTimestamp, data_source: "Upstox Market Quote API" });', 'quote_timestamp: quoteTimestamp, provider_quote_timestamp: quote.timestamp, data_source: "Upstox Market Quote API" });', "keep provider timestamp distinct from local receipt time in monitor");
  output = mustReplace(output, 'last_candle_date: quote.timestamp,', 'last_candle_date: quote.timestamp, provider_quote_timestamp: quote.timestamp,', "automatic engine retains provider timestamp for activated valuation exits");
  output = mustReplace(output, "    if (target && price >= target) {", "    const valuationQuoteMs = paperEngineTimestampMs(found.row.provider_quote_timestamp);\n    const valuationQuoteAge = valuationQuoteMs === null ? Infinity : (Date.now() - valuationQuoteMs) / 1000;\n    const valuationQuoteFresh = !valuationTarget.activation || (valuationQuoteAge >= -5 && valuationQuoteAge <= 60);\n    if (valuationTarget.activation && !valuationQuoteFresh) dataNeeded.push({ symbol: position.symbol, reason: \"Fresh provider timestamp required for valuation exit; local receipt time is not price freshness.\" });\n    if (target && price >= target && valuationQuoteFresh) {", "activated valuation exits require fresh provider prices without disabling legacy stops");
  output = mustReplace(output, 'const event = closePaperPosition(next, updated, exitPrice, "TARGET_HIT: paper monitor closed at target", asOf, found.row);', 'const reason = valuationTarget.activation ? "VALUATION_TARGET_HIT: " + valuationTarget.activation.id : "TARGET_HIT: paper monitor closed at target";\n      const event = closePaperPosition(next, updated, exitPrice, reason, asOf, { ...found.row, ...(valuationTarget.activation ? { valuation_target_snapshot: valuationTarget.activation } : {}) });', "snapshot activated model into valuation exit evidence");
  output = mustReplace(output, "    parameter_evidence: sanitizeParameterEvidence(order.parameter_evidence || {}),", "    parameter_evidence: sanitizeParameterEvidence(order.parameter_evidence || {}),\n    ...valuationExecutionFields(order),", "preserve valuation evidence only on new valuation orders");
  output = mustReplace(output, "execution_evidence: sanitizeExecutionEvidence(position.execution_evidence || {}) };", "execution_evidence: sanitizeExecutionEvidence(position.execution_evidence || {}), ...(typeof position.valuation_entry_revision === \"string\" ? { valuation_entry_revision: position.valuation_entry_revision.slice(0, 50) } : {}) };", "retain entry generation only on positions that have a scale-in");
  output = mustReplace(output, "        ...existing,\n        qty: newQty,", "        ...existing,\n        valuation_entry_revision: crypto.randomUUID(),\n        qty: newQty,", "same-price scale-ins invalidate any previously authorised holding generation");
  output = mustReplace(output, "qty: newQty, entry_price: round(weightedEntry, 2)", "qty: newQty, valuation_entry_revision: crypto.randomUUID(), entry_price: round(weightedEntry, 2)", "GTT scale-ins also invalidate old valuation authorisation");
  output = mustReplace(output, "    execution_evidence: sanitizeExecutionEvidence(trade.execution_evidence || {}),\n    value,", "    execution_evidence: sanitizeExecutionEvidence(trade.execution_evidence || {}),\n    ...valuationExecutionFields(trade),\n    value,", "preserve valuation evidence only on new valuation trades");
  output = mustReplace(output, "    target_price: position.target_price,\n    stop_price: position.stop_price,", "    target_price: quoteRow.valuation_target_snapshot?.price ?? position.target_price,\n    ...valuationExecutionFields(quoteRow),\n    stop_price: position.stop_price,", "exit record retains activated trigger without rewriting surviving position");
  output = mustReplace(output, '    id: paperLedgerId("PAPER_MONITOR_TRADE"),\n    order_id: order.id,', '    id: paperLedgerId("PAPER_MONITOR_TRADE"),\n    ...valuationExecutionFields(quoteRow),\n    order_id: order.id,', "closed valuation trade retains complete formula snapshot");
  return output;
}
