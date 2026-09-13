import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const source = await fs.readFile(new URL("../app.js", import.meta.url), "utf8");
const html = await fs.readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await fs.readFile(new URL("../styles.css", import.meta.url), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(ids.length, new Set(ids).size, "Existing element IDs must remain unique");
for (const id of ["valuationSection", "valuationAssumptionForm", "valuationActivationForm", "valuationReviewed", "valuationActivationConfirm", "valuationFormulaCatalog", "nseMasterBtn", "scanAllBtn", "quickTradeForm"]) assert.ok(ids.includes(id), `${id} remains mounted`);
assert.match(html, /app\.js\?v=20260913\.1/);
assert.match(html, /styles\.css\?v=20260909\.1/);
assert.doesNotMatch(html.match(/<input id="valuationReviewed"[^>]+>/)[0], /\schecked(?:\s|=|\/|>)/);
assert.doesNotMatch(html.match(/<input id="valuationActivationConfirm"[^>]+>/)[0], /\schecked(?:\s|=|\/|>)/);
assert.match(css, /\.valuation-section\.section\.active/);
assert.match(css, /@media \(max-width: 600px\)/);

const nodes = new Map();
const node = (id) => {
  if (!nodes.has(id)) nodes.set(id, {
    value: "", checked: false, disabled: false, textContent: "", innerHTML: "", listeners: {},
    classList: { toggle() {} }, addEventListener(name, handler) { this.listeners[name] = handler; },
    reportValidity: () => true
  });
  return nodes.get(id);
};
const context = vm.createContext({
  console, Date, Intl, Set, Map, Promise, URL, JSON, Math,
  document: { addEventListener() {}, querySelectorAll: () => [], getElementById: node },
  window: { confirm: () => false, addEventListener() {} }
});
vm.runInContext(source, context);
const run = (text) => vm.runInContext(text, context);
const assumption = {
  symbol: "SAFE", instrument_key: "NSE_EQ|INE000000001", isin: "INE000000001", reference_price: 100,
  reference_date: "2026-09-09", as_of: "2026-09-09", valid_until: "2026-12-09", annual_eps: 10,
  eps_basis: "normalised_annual", base_pe_low: 12, base_pe_high: 16, bear_eps: 8, bear_pe: 10,
  source_type: "analyst_assumption", source_urls: ["https://example.com/results", "javascript:alert(1)"],
  notes: '<img src=x onerror="alert(1)">', corporate_action_basis: "Bonus-adjusted", corporate_action_reviewed: false
};
const position = { symbol: "SAFE", instrument_key: assumption.instrument_key, qty: 10, entry_price: 100, current_price: 105,
  target_price: 130, stop_price: 90, status: "OPEN", effective_target_price: 125, effective_target_source: "valuation" };
const calculation = {
  assumption, model_version: "test-v1", status: "REVIEW_REQUIRED", activation_allowed: false, bear_12m: 80, bull_12m: null,
  warnings: ['<script>alert("no")</script>'], open_position: position,
  targets: [3, 9, 12].map((months) => ({ months, due_date: months === 3 ? "2026-12-09" : months === 9 ? "2027-06-09" : "2027-09-09",
    low: 100 + 20 * months / 12, mid: 100 + 40 * months / 12, high: 100 + 60 * months / 12, upside_low_pct: 20 * months / 12, upside_high_pct: 60 * months / 12, activation_allowed: false }))
};
context.fixture = { ok: true, revision: 3, persistent: true, records: [calculation], selected: calculation, active_targets: {}, formulas: { base_12m_low: "annual_eps * base_pe_low", custom: "<script>not markup</script>" } };
context.positionFixture = position;
run(`state.valuation = fixture; state.valuationSymbol = "SAFE"; state.orders = {positions:[positionFixture]}; state.rows = [{symbol:"SAFE", decision:"WATCH"}]; state.universeRows = [{symbol:"SAFE",instrument_key:"NSE_EQ|INE000000001",isin:"INE000000001"}]; bindUi(); renderValuationTargets(); fillValuationForm();`);
assert.match(node("valuationSummaryBody").innerHTML, /3? months|2026-12-09/);
assert.match(node("valuationSelected").innerHTML, /&lt;img/);
assert.doesNotMatch(node("valuationSelected").innerHTML, /<script>|<img|href="javascript:/);
assert.match(node("valuationFormulaCatalog").innerHTML, /annual_eps \* base_pe_low/);
assert.match(node("valuationFormulaCatalog").innerHTML, /&lt;script&gt;/);
assert.match(node("valuationSelected").innerHTML, /Separate current-batch AshStock decision/);
assert.equal(node("valuationActivate").disabled, true, "Seed assumptions are not silently actionable");
assert.equal(node("valuationReviewed").checked, false);
assert.equal(node("valuationActivationConfirm").checked, false);
for (const [id, event] of [["valuationAssumptionForm", "submit"], ["valuationActivationForm", "submit"], ["valuationLookupForm", "submit"], ["nseMasterBtn", "click"], ["scanAllBtn", "click"], ["quickTradeForm", "submit"]]) assert.equal(typeof node(id).listeners[event], "function", `${id} binding retained`);
assert.equal(run("effectivePositionTarget({target_price:200,effective_target_price:null,effective_target_source:'valuation_review_required'})"), null);
assert.match(run("effectivePositionTargetLabel({effective_target_source:'valuation_review_required'})"), /review required/);
assert.match(run("renderOpenPositionRows({positions:[positionFixture]})"), /Rs 125\.00/);
assert.doesNotMatch(run("renderOpenPositionRows({positions:[positionFixture]})"), /Rs 130\.00/);
run(`globalThis.originalRecords=state.valuation.records; state.valuation.records=Array.from({length:12},(_,index)=>({...originalRecords[0],assumption:{...originalRecords[0].assumption,symbol:'SEED'+index}})); renderValuationTargets()`);
assert.equal([...node("valuationSummaryBody").innerHTML.matchAll(/data-valuation-symbol=/g)].length, 12, "All initial records are visible; no current-batch truncation");
run("state.valuation.records=originalRecords");

// A new market equity has no inherited/guessed EPS, multiple or target values.
run(`state.valuationSymbol = "NEW"; state.universeRows.push({symbol:"NEW",instrument_key:"NSE_EQ|INE000000002",isin:"INE000000002"}); state.valuation.selected = {status:"DATA_NEEDED",assumption:{symbol:"NEW",instrument_key:"NSE_EQ|INE000000002",isin:"INE000000002"},targets:[],activation_allowed:false}; fillValuationForm(); renderValuationTargets();`);
for (const id of ["valuationAnnualEps", "valuationPeLow", "valuationPeHigh", "valuationReferencePrice", "valuationBearEps", "valuationBearPe"]) assert.equal(node(id).value, "", `${id} remains blank for new stock`);
assert.match(node("valuationSelected").innerHTML, /DATA NEEDED/);
assert.equal(node("valuationActivate").disabled, true);

// Nothing is sent until both source review / activation confirmation and a reason are explicit.
run(`globalThis.requests=[]; api=async (path,options={})=>{requests.push({path,options});return fixture}; loadOrders=async()=>{}; state.valuationSymbol="SAFE"; state.valuation.selected=state.valuation.records[0]; fillValuationForm();`);
await run("submitValuationAssumption({preventDefault(){}})");
assert.equal(run("requests.length"), 0);
node("valuationReviewed").checked = true;
node("valuationSaveReason").value = "Reviewed source and normalisation";
node("valuationSources").value = "https://example.com/results";
await run("submitValuationAssumption({preventDefault(){}})");
assert.equal(run("requests.length"), 1);
assert.equal(run("requests[0].path"), "/api/valuation-targets/assumptions");
assert.equal(run("requests[0].options.body.assumption.source_type"), "user_assumption");
assert.equal(run("requests[0].options.body.assumption.corporate_action_reviewed"), true);
assert.equal(run("requests[0].options.body.assumption.eps_basis"), "normalised_annual");
assert.equal(node("valuationReviewed").checked, false, "Reusing saved values requires fresh review consent");
run("requests=[]");
run(`state.valuation.records[0].activation_allowed=true; state.valuation.records[0].assumption.corporate_action_reviewed=true; state.valuation.records[0].targets.forEach(t=>t.activation_allowed=true);`);
node("valuationHorizon").value = "3";
node("valuationPricePolicy").value = "low";
run("renderValuationActivation()");
assert.equal(node("valuationActivate").disabled, false);
await run("submitValuationActivation({preventDefault(){}})");
assert.equal(run("requests.length"), 0);
node("valuationActivationConfirm").checked = true;
node("valuationActivationReason").value = "Reviewed fixed take-profit target";
await run("submitValuationActivation({preventDefault(){}})");
assert.equal(run("requests.length"), 0, "Cancelling the final confirmation must not mutate state");
run("window.confirm=()=>true");
await run("submitValuationActivation({preventDefault(){}})");
assert.equal(run("requests.length"), 1);
assert.equal(run("requests[0].path"), "/api/valuation-targets/activate");
assert.equal(run("requests[0].options.body.confirm"), true);
assert.equal(run("requests[0].options.body.expected_revision"), 3);
assert.equal(node("valuationActivationConfirm").checked, false, "Confirmation resets after mutation");
assert.equal(run("requests.some(r=>/paper-trader|orders|paper-engine/.test(r.path))"), false, "Activation never submits a sell or runs an engine");

// A horizon/policy change invalidates earlier consent; mismatched holdings cannot activate.
node("valuationActivationConfirm").checked = true;
node("valuationHorizon").listeners.change();
assert.equal(node("valuationActivationConfirm").checked, false);
run(`state.valuation.records[0].open_position={...positionFixture,instrument_key:"NSE_EQ|OTHER"}; state.orders={positions:[]}; renderValuationActivation();`);
assert.equal(node("valuationActivate").disabled, true);

// Source errors block activation, and rapid selection changes cannot render stale responses.
run(`state.valuationError="503 source unavailable"; renderValuationTargets()`);
assert.equal(node("valuationActivate").disabled, true);
run(`state.valuationError=""; globalThis.pending={}; api=(path)=>new Promise(resolve=>{pending[path]=resolve})`);
const older = run("loadValuationTargets('SAFE')");
const newer = run("loadValuationTargets('NEW')");
run(`pending['/api/valuation-targets?symbol=NEW']({...fixture,selected:{assumption:{symbol:'NEW'},targets:[],activation_allowed:false}})`);
await newer;
run(`pending['/api/valuation-targets?symbol=SAFE'](fixture)`);
await older;
assert.equal(run("state.valuationSymbol"), "NEW");
assert.equal(node("valuationAnnualEps").value, "");

run(`state.marketImport={fetched_at:"2026-09-09T05:00:00Z",eligible_count:2348,added_count:0,updated_count:0,removed_count:0,unchanged_count:2348,requested_count:2400,shortfall:52,source_last_modified:"2026-09-09T01:00:00Z"};renderMarketImportStatus()`);
assert.match(node("marketImportStatus").textContent, /52 below/);
assert.match(node("marketImportStatus").textContent, /no invented stocks/);
assert.match(node("marketImportStatus").textContent, /0 new to saved data/);
assert.match(node("marketImportStatus").textContent, /Legacy import.*membership has not been verified/);
run(`state.marketImport={...state.marketImport,membership_verified:true,equity_source_last_modified:"2026-09-10T21:35:02Z",excluded_not_nse_equity_count:351,excluded_non_eq_series_count:14,excluded_suspended_count:12};renderMarketImportStatus()`);
assert.match(node("marketImportStatus").textContent, /exact symbol \+ ISIN, EQ series only/);
assert.match(node("marketImportStatus").textContent, /351 provider entries outside the company list, 14 other-series matches and 12 suspended excluded/);
assert.match(source, /if \(loaded\) await scanFullUniverse\(\)/, "Failed official refresh must not scan an old master");
assert.match(source, /state\.scanPauseRequested = true/);
console.log("Valuation UI guard passed: escaping, complete formula catalog, missing-data blanks, explicit reviewed saves / activation confirmation, fixed target display, stale response protection, master provenance and legacy control bindings.");
