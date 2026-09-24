import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const source = await fs.readFile(new URL("../app.js", import.meta.url), "utf8");
let now = Date.parse("2026-09-24T12:00:00Z");
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const nodes = new Map(), timers = new Map();
let timerId = 0;
const node = (id) => {
  if (!nodes.has(id)) nodes.set(id, { value: "", textContent: "", innerHTML: "", disabled: false,
    classList: { toggle() {}, remove() {}, add() {} }, addEventListener() {}, querySelectorAll: () => [] });
  return nodes.get(id);
};
const context = vm.createContext({ console, Date: Clock, Intl, Set, Map, Promise, URL, JSON, Math, AbortController,
  lifecycle: {}, intervals: [],
  setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
  clearTimeout(id) { timers.delete(id); },
  document: { hidden: false, addEventListener(name, callback) { context.lifecycle[name] = callback; }, querySelectorAll: () => [], getElementById: node },
  window: { addEventListener() {}, setInterval(callback, delay) { context.intervals.push({ callback, delay }); } }
});
vm.runInContext(source, context);
const run = (text) => vm.runInContext(text, context);
const iso = (offset = 0) => new Date(now + offset).toISOString();
const row = { symbol: "RELIANCE", instrument_key: "NSE_EQ|INE002A01018", decision: "WATCH", score: 66, close: 100 };
const stock = (overrides = {}) => ({ ...row, status: "REPORTED", source: "Upstox Share Holdings API",
  fetched_at: iso(), cache_expires_at: iso(6 * 60 * 60_000), as_of: "2026-06-30", fii_period: "Jun 2026",
  fii_previous_period: "Mar 2026", fii_holding_pct: 18.67, fii_change_pp: 0.42,
  comparison_status: "ADJACENT_QUARTER", current_evidence_eligible: true, ...overrides });
const dates = ["2026-09-24", "2026-09-23", "2026-09-22", "2026-09-21", "2026-09-18"];
const market = (overrides = {}) => ({ status: "READY", fetched_at: iso(), cache_expires_at: iso(15 * 60_000),
  calendar: { status: "VERIFIED", fetched_at: iso(), cache_expires_at: iso(15 * 60_000), expected_session_dates: dates },
  feeds: Object.fromEntries(["fii", "dii"].map((key) => [key, { status: "READY", fetched_at: iso(),
    cache_expires_at: iso(15 * 60_000), observed_date: dates[0], days_available: 5, window_dates: dates }])),
  fii_cash_5d_net_cr: 400, dii_cash_5d_net_cr: 500, ...overrides });
const payload = (overrides = {}) => ({ ok: true, stocks: [stock()], market: market(), ...overrides });
context.row = row;
run("globalThis.renderActual=renderSignalDashboard;renderSignalDashboard=()=>{};state.rows=[row];state.selected=row;globalThis.calls=[]");
function install(value) {
  context.fixture = value;
  run("api=async(path,options)=>{calls.push({path,options});return fixture}");
}
function reset() {
  run("state.institutional={status:'idle',market:null,stocks:{}};calls=[]");
}
let scenarios = 0;
function passed() { scenarios += 1; }

// Failure is temporary and never displays the provider error/token body.
run("api=async(path,options)=>{calls.push({path,options});throw new Error('secret-provider-body')}");
await run("loadInstitutionalEvidence([row])");
assert.equal(run("calls.length"), 1);
assert.equal(run("institutionalFor(row).status"), "DATA_NEEDED");
assert.doesNotMatch(run("JSON.stringify(state.institutional)"), /secret-provider-body/);
await run("loadInstitutionalEvidence([row])");
assert.equal(run("calls.length"), 1);
now += 30_001;
install(payload());
await run("loadInstitutionalEvidence([row])");
assert.equal(run("calls.length"), 2);
assert.equal(run("institutionalFor(row).status"), "REPORTED");
assert.equal(run("institutionalMarketValue('fii')"), 400);
passed();

// Provider timestamps survive cache hits; receipt never renews old evidence.
context.cached = payload();
run("acceptInstitutionalPayload(cached,[row])");
now += 6 * 60 * 60_000 + 1;
run("acceptInstitutionalPayload(cached,[row])");
assert.equal(run("institutionalFor(row)"), null);
assert.equal(run("institutionalMarketValue('fii')"), null);
passed();

reset(); install(payload());
await run("loadInstitutionalEvidence([row])");
now += 15 * 60_000 + 1;
install(payload({ stocks: [] }));
await run("loadInstitutionalEvidence([row])");
assert.equal(run("calls.at(-1).options.body.market_only"), true);
assert.equal(run("calls.at(-1).options.body.instruments.length"), 0);
assert.equal(run("institutionalFor(row).fii_holding_pct"), 18.67);
passed();

reset();
run("globalThis.resolveFeed=null;api=(path,options)=>{calls.push({path,options});return new Promise(resolve=>{resolveFeed=resolve})}");
const first = run("loadInstitutionalEvidence([row])");
const second = run("loadInstitutionalEvidence([row])");
await Promise.resolve();
assert.equal(run("calls.length"), 1);
context.fixture = payload(); run("resolveFeed(fixture)");
await Promise.all([first, second]);
assert.equal(timers.size, 0);
passed();

// Browser network stalls release the lock even if fetch ignores abort.
reset();
run("api=(path,options)=>{calls.push({path,options});return new Promise(()=>{})}");
const stalled = run("loadInstitutionalEvidence([row])");
await Promise.resolve();
const timeout = [...timers.values()].find((timer) => timer.delay === 50_000);
assert.ok(timeout); timeout.callback(); await stalled;
assert.equal(run("institutionalRequest"), null);
assert.equal(run("calls[0].options.signal.aborted"), true);
assert.equal(run("institutionalFor(row).status"), "DATA_NEEDED");
passed();

// Missing, duplicate, unsolicited and wrong-instrument evidence cannot be reused.
for (const stocks of [[], [stock({ instrument_key: "NSE_EQ|OTHER" })], [stock(), stock()], [stock({ symbol: "OTHER" })]]) {
  reset(); install(payload({ stocks }));
  await run("loadInstitutionalEvidence([row])");
  assert.equal(run("institutionalFor(row).status"), "DATA_NEEDED");
  assert.equal(run("state.institutional.stocks.OTHER"), undefined);
}
passed();

reset(); install(payload()); await run("loadInstitutionalEvidence([row])");
assert.equal(run("institutionalFor({...row,instrument_key:'NSE_EQ|OTHER'})"), null);
passed();

// Late requests do not replace evidence in a newly accepted scan.
reset();
run("api=()=>new Promise(resolve=>{resolveFeed=resolve})");
const late = run("loadInstitutionalEvidence([row])"); await Promise.resolve();
context.newPayload = payload({ stocks: [stock({ fii_holding_pct: 22 })] });
run("applyPaperEngineScan({ok:true,asOf:new Date().toISOString(),rows:[row],institutional:newPayload})");
context.fixture = payload(); run("resolveFeed(fixture)"); await late;
assert.equal(run("institutionalFor(row).fii_holding_pct"), 22);
passed();

// Quarterly histories stay visible with dates but do not masquerade as current signals.
for (const change of [null, true, "0.42"]) {
  reset(); context.fixture = payload({ stocks: [stock({ fii_change_pp: change, comparison_status: "UNAVAILABLE" })] });
  run("acceptInstitutionalPayload(fixture,[row]);renderActual()");
  assert.match(node("signalEvidence").innerHTML, /prior quarter not returned/);
  assert.match(run("renderFiiHoldingCell(row)"), /prior quarter not returned/);
  assert.doesNotMatch(run("renderFiiHoldingCell(row)"), /first quarter|fii-holding-cell positive/);
}
reset(); context.fixture = payload({ stocks: [stock({ as_of: "2026-03-31", fii_period: "Mar 2026", current_evidence_eligible: false })] });
run("acceptInstitutionalPayload(fixture,[row]);renderActual()");
assert.match(node("signalEvidence").innerHTML, /historical \/ current comparison unavailable/);
assert.equal(run("institutionalCurrent(institutionalFor(row))"), false);
assert.match(run("renderFiiHoldingCell(row)"), /18.67%/);
passed();

reset(); context.fixture = payload(); run("acceptInstitutionalPayload(fixture,[row])");
assert.equal(run("institutionalCurrent(institutionalFor(row))"), true);
now = Date.parse("2026-09-30T18:30:01Z");
assert.equal(run("institutionalCurrent(fixture.stocks[0])"), false, "IST quarter boundary invalidates older currentness");
passed();

// Legacy LIVE, invalid timestamps and clock rollback fail closed.
for (const overrides of [{ status: "LIVE" }, { fetched_at: "invalid" }, { fetched_at: iso(1000) }, { fii_holding_pct: false }]) {
  reset(); context.fixture = payload({ stocks: [stock(overrides)] }); run("acceptInstitutionalPayload(fixture,[row])");
  assert.doesNotMatch(run("renderFiiHoldingCell(row)"), /18.67%/);
}
reset(); context.fixture = payload(); run("acceptInstitutionalPayload(fixture,[row])");
now -= 1000; assert.equal(run("institutionalFor(row)"), null);
passed();

// FII may remain usable when DII fails; a peer feed cannot supply FII freshness.
reset(); const partial = market({ status: "PARTIAL" }); partial.feeds.dii.status = "ERROR";
context.fixture = payload({ market: partial }); run("acceptInstitutionalPayload(fixture,[row])");
assert.equal(run("institutionalMarketValue('fii')"), 400);
assert.equal(run("institutionalMarketValue('dii')"), null);
run("state.institutional.market.feeds.fii.days_available=30");
assert.equal(run("institutionalMarketValue('fii')"), 400, "Longer provider history retains the exact five-date window");
run("state.institutional.market.feeds.fii.status='STALE';renderActual()");
assert.equal(run("institutionalMarketValue('fii')"), null);
assert.match(node("signalMarketRegime").innerHTML, /FII cash flow \(5D\)[\s\S]*DATA NEEDED/);
passed();

for (const expression of ["calendar.status='UNVERIFIED'", "feeds.fii.days_available=2", "feeds.fii.days_available=NaN", "feeds.fii.window_dates=['2026-09-23']",
  "feeds.fii.observed_date='2026-09-23'", "feeds.fii.fetched_at='invalid'", "fii_cash_5d_net_cr=false"]) {
  reset(); context.fixture = payload(); run("acceptInstitutionalPayload(fixture,[row]);state.institutional.market." + expression);
  assert.equal(run("institutionalMarketValue('fii')"), null);
}
passed();

// Polling is read-analytics only, bounded to12 unique stocks, gated on runtime/UI readiness.
reset(); install(payload());
await run("refreshInstitutionalEvidence()"); assert.equal(run("calls.length"), 0);
run("state.ready={ok:true};state.scanInFlight=true");
await run("refreshInstitutionalEvidence()"); assert.equal(run("calls.length"), 0);
run("state.scanInFlight=false;document.hidden=true");
await run("refreshInstitutionalEvidence()"); assert.equal(run("calls.length"), 0);
run("document.hidden=false"); await run("refreshInstitutionalEvidence()");
assert.ok(run("calls.every(call=>call.path==='/api/upstox/institutional-flow' && call.options.method==='POST')"));
assert.equal(run("row.score"), 66); assert.equal(run("row.decision"), "WATCH");
reset(); install(payload({ stocks: [] }));
await run("loadInstitutionalEvidence(Array.from({length:30},(_,i)=>({...row,symbol:'S'+i,instrument_key:'NSE_EQ|'+i})))");
assert.equal(run("calls[0].options.body.instruments.length"), 12);
passed();

// Repeated failures at the front of a large scan cannot starve later symbols.
reset(); install(payload({ stocks: [] }));
run("globalThis.manyRows=Array.from({length:20},(_,i)=>({...row,symbol:'S'+i,instrument_key:'NSE_EQ|'+i}))");
await run("loadInstitutionalEvidence(manyRows)");
now += 60_001;
install(payload({ stocks: [] })); await run("loadInstitutionalEvidence(manyRows)");
assert.deepEqual(JSON.parse(run("JSON.stringify(calls[1].options.body.instruments.slice(0,8).map(item=>item.symbol))")),
  Array.from({ length: 8 }, (_, i) => "S" + (i + 12)));
passed();

// Exercise lifecycle registration without running unrelated application workflows.
run(`bindUi=()=>{};startClock=()=>{};renderMarketStrip=()=>{};renderAll=()=>{};renderFormulaSettings=()=>{};
  loadOrders=async()=>{};loadFormulaSettings=async()=>{};loadValuationTargets=async()=>{};loadMarketImportStatus=async()=>{};
  refreshScan=async()=>{};loadSignalMarketContext=async()=>{};loadReleaseIdentity=async()=>{};refreshPaperEngineStatus=async()=>{}`);
await context.lifecycle.DOMContentLoaded();
assert.equal(run("intervals.filter(item=>item.callback===refreshInstitutionalEvidence && item.delay===60000).length"), 1);
passed();
console.log(`Institutional UI guard passed: ${scenarios} grouped scenarios, no network, Mongo or trading calls.`);
