import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const source = await fs.readFile(new URL("../app.js", import.meta.url), "utf8");
const nodes = new Map();
const node = (id) => {
  if (!nodes.has(id)) nodes.set(id, {
    value: "", textContent: "", innerHTML: "", disabled: false,
    classList: { toggle() {}, remove() {}, add() {} }, addEventListener() {}, querySelectorAll: () => []
  });
  return nodes.get(id);
};
const context = vm.createContext({
  console, Date, Intl, Set, Map, Promise, URL, JSON, Math,
  lifecycle: {}, intervals: [],
  document: { addEventListener(name, callback) { context.lifecycle[name] = callback; }, querySelectorAll: () => [], getElementById: node },
  window: { addEventListener() {}, setInterval(callback, delay) { context.intervals.push({ callback, delay }); } }
});
vm.runInContext(source, context);
const run = (text) => vm.runInContext(text, context);
run("globalThis.originalLoadOrders=loadOrders");
const row = (symbol, decision = "SELECT") => ({ symbol, name: symbol, instrument_key: `NSE_EQ|${symbol}`, decision, score: 75, close: 100,
  parameter_tunnel: { summary: { evaluated: 90, positive_hits: 26, evidence_score: 45.56 } } });
const scan = { ok: true, asOf: "2026-09-21T04:30:00.000Z", rows: [row("NEW"), row("WATCH", "WATCH")],
  summary: { SELECT: 1, WATCH: 1 }, rotation: { cycle: 2, attempted: 400, total: 2200 }, settings: { untouched: true } };
const result = {
  ok: true, scan, auto_buy: { selected_in_scan: 1, candidates_ready: 0, orders_filled: 0, rejected: 0, pending_after_run: 1,
    blockers: [{ code: "capital", reason: "No affordable entry slots" }], rejections: [] }
};
context.fixture = result;
context.oldRow = row("OLD");
run(`globalThis.calls=[]; globalThis.notices=[];
  setNotice=(message,tone)=>notices.push({message,tone});
  renderAll=()=>{};
  loadOrders=async()=>{calls.push({path:'/api/paper-trader/orders',method:'GET'});state.orders={ok:true,orders:[],positions:[]}};
  api=async(path,options={})=>{calls.push({path,method:options.method||'GET'});return fixture};
  refreshScan=async()=>{throw new Error('Must not start another scan')};
  maybeAutoStartPaperPortfolio=async()=>{throw new Error('Must not start another order loop')};
  state.rows=[oldRow];state.selected=oldRow;state.scan={asOf:'2026-09-20T04:30:00.000Z',rows:[oldRow]};
  state.selectedQuote={last_price:999};`);

assert.equal((await run("runPaperEngineNow()")).ok, true);
assert.equal(run("state.rows[0].symbol"), "NEW", "Engine-used scan replaces stale radar");
assert.equal(run("state.selected.symbol"), "NEW");
assert.equal(run("state.selectedQuote"), null, "Old stock quote cannot leak to the new selection");
assert.equal(run("state.rotation.attempted"), 400);
assert.equal(run("state.scan.settings.untouched"), true);
assert.equal(run("calls.filter(call=>call.method==='POST').length"), 1, "Exactly one requested engine mutation");
assert.equal(run("calls[0].path"), "/api/paper-engine/run");
assert.match(run("notices.at(-1).message"), /SELECT 1; buy tickets 0; fills 0; rejected 0; pending SELECT 1/);
assert.match(run("notices.at(-1).message"), /No affordable entry slots/);
assert.match(run("notices.at(-1).message"), /Radar synchronized/);
assert.equal(run("state.paperEngineRunning"), false);
assert.equal(node("paperEngineBtn").disabled, false);
run("renderSignalDashboard()");
assert.match(node("signalRadarBody").innerHTML, /data-signal-symbol="NEW"/);
assert.doesNotMatch(node("signalRadarBody").innerHTML, /data-signal-symbol="OLD"/);
assert.match(node("signalRadarLegend").innerHTML, /SELECT <b>1<\/b>/);
assert.equal(node("signalRadarStamp").textContent, run("'Scores updated '+isoDate(fixture.scan.asOf)"));
assert.match(node("signalPaperTitle").textContent, /SELECT — EXECUTION PENDING/);

// Older deployments omit newer fields; absence is never shown as a zero.
context.fixture = { ok: true, auto_buy: { orders_filled: 0, candidates_ready: 2 } };
await run("runPaperEngineNow()");
assert.match(run("notices.at(-1).message"), /SELECT not reported; buy tickets 2/);
assert.match(run("notices.at(-1).message"), /rejected not reported; pending SELECT not reported/);
assert.match(run("notices.at(-1).message"), /Engine scan not returned; radar has not been refreshed/);
assert.equal(run("state.rows[0].symbol"), "NEW");

// A late engine response must not replace a newer scan that arrived meanwhile.
context.fixture = result;
run("state.scan={...state.scan,asOf:'2026-09-21T05:00:00.000Z'};state.rows=[oldRow]");
await run("runPaperEngineNow()");
assert.equal(run("state.rows[0].symbol"), "OLD");
assert.match(run("notices.at(-1).message"), /newer radar retained/);

// Logical, transport and malformed failures never become fabricated success counts.
for (const payload of [null, {}, { ok: false, error: "provider_unavailable" }, { ok: true }, { ok: true, auto_buy: {} },
  { ok: true, auto_buy: { orders_filled: "bad" } }, { ok: true, auto_buy: { orders_filled: -1 } },
  { ok: true, auto_buy: { orders_filled: false } }, { ok: true, auto_buy: { orders_filled: 1.5 } },
  { ...result, scan: { rows: [], asOf: "invalid" } }, { ...result, scan: { ...scan, rows: [null] } }]) {
  context.fixture = payload;
  assert.equal(await run("runPaperEngineNow()"), null);
  assert.match(run("notices.at(-1).message"), /^Paper engine failed:/);
  assert.doesNotMatch(run("notices.at(-1).message"), /SELECT 0/);
  assert.equal(node("paperEngineBtn").disabled, false);
  assert.equal(node("signalPaperEngineAction").disabled, false);
}
run("api=async()=>{throw new Error('Failed to fetch')}");
await run("runPaperEngineNow()");
assert.match(run("notices.at(-1).message"), /Paper engine failed: Failed to fetch/);

context.fixture = { ok: true, skipped: true, reason: "already_running" };
run("api=async()=>fixture");
assert.equal((await run("runPaperEngineNow()")).skipped, true);
assert.match(run("notices.at(-1).message"), /Paper engine skipped: already_running/);

// Duplicate buttons/automatic ticks cannot issue simultaneous engine requests.
run("globalThis.pendingResolve=null;globalThis.requestCount=0;api=()=>{requestCount++;return new Promise(resolve=>{pendingResolve=resolve})}");
const first = run("runPaperEngineNow()");
assert.equal(node("paperEngineBtn").disabled, true);
assert.equal(node("signalPaperEngineAction").disabled, true);
assert.equal(await run("runPaperEngineNow()"), null);
assert.equal(run("requestCount"), 1);
run("pendingResolve({ok:true,skipped:true,reason:'already_running'})");
await first;

// A partial ledger refresh must not erase the confirmed execution summary.
context.fixture = { ...result, scan: { ...scan, asOf: "2026-09-21T05:30:00.000Z" },
  auto_buy: { ...result.auto_buy, candidates_ready: 1, orders_filled: 1, pending_after_run: 0, blockers: [] } };
run("api=async()=>fixture;loadOrders=async()=>{state.orders={ok:false,error:'ledger offline',orders:[],positions:[]}}");
await run("runPaperEngineNow()");
assert.match(run("notices.at(-1).message"), /fills 1/);
assert.match(run("notices.at(-1).message"), /Ledger refresh failed: ledger offline/);

// The old frontend-only 35/48 gate must not contradict a final backend SELECT.
context.selectedRow = row("NEW");
run("state.orders={ok:true,orders:[],positions:[]};state.selected=selectedRow;state.selectedQuote={last_price:100,timestamp:'2026-09-21T05:30:00Z'};renderAutoOrderReadiness()");
assert.equal(run("paperExecutionDisplay(selectedRow).status"), "SELECT — EXECUTION PENDING");
assert.match(node("autoOrderReadiness").innerHTML, /SERVER CHECK REQUIRED/);
assert.doesNotMatch(node("autoOrderReadiness").innerHTML, /AUTO BUY READY|AUTOMATIC|FILTERED/);
assert.match(node("autoOrderReadiness").innerHTML, /SELECT is the scanner decision, not a fill/);
assert.doesNotMatch(source, /Paper BUY Ready|const executionReady = row\.decision/);

run(`state.orders.orders=[
  {symbol:'NEW',side:'BUY',status:'FILLED',created_at:'2026-09-20T05:30:00Z'},
  {symbol:'NEW',side:'SELL',status:'REJECTED',created_at:'2026-09-21T07:30:00Z',rejection_reason:'Unrelated SELL rejection'},
  {symbol:'NEW',side:'BUY',status:'REJECTED',created_at:'2026-09-21T06:30:00Z',rejection_reason:'Quote 401 <script>alert(1)</script>'}
];renderAutoOrderReadiness()`);
assert.match(node("autoOrderReadiness").innerHTML, /LAST BUY REJECTED/);
assert.match(node("autoOrderReadiness").innerHTML, /Quote 401 &lt;script&gt;/);
assert.doesNotMatch(node("autoOrderReadiness").innerHTML, /<script>|Unrelated SELL/);
assert.match(node("autoOrderReadiness").innerHTML, /Last rejection \(/);
run("renderSignalDashboard()");
assert.match(node("signalPaperTitle").textContent, /LAST BUY REJECTED/);
run("state.orders.positions=[{symbol:'NEW',qty:10,status:'OPEN',entry_price:100}];renderAutoOrderReadiness()");
assert.match(node("autoOrderReadiness").innerHTML, /POSITION OPEN/);
assert.doesNotMatch(node("autoOrderReadiness").innerHTML, /Last rejection/);
run("state.orders.positions[0].status='CLOSED';renderAutoOrderReadiness()");
assert.doesNotMatch(node("autoOrderReadiness").innerHTML, /POSITION OPEN/);
run("state.orders={ok:false,error:'ledger offline',positions:[],orders:[]};renderAutoOrderReadiness()");
assert.match(node("autoOrderReadiness").innerHTML, /LEDGER UNAVAILABLE/);

// Quote responses from a previous selection or pre-engine scan cannot repopulate stale prices.
run("state.selected=selectedRow;globalThis.quoteResolve=null;api=()=>new Promise(resolve=>{quoteResolve=resolve})");
const quotePending = run("fetchSelectedQuote(selectedRow)");
context.newerScan = { ...scan, asOf: "2026-09-21T08:00:00Z" };
run("applyPaperEngineScan(newerScan);quoteResolve({quotes:[{last_price:777}]})");
await quotePending;
assert.equal(run("state.selectedQuote"), null);

// A server-scheduled run must update a browser whose old batch has no SELECT.
const scheduledScan = { ...scan, asOf: "2026-09-24T04:30:00.000Z", rows: [row("SCHEDULED")] };
const scheduledResult = { ...result, scan: scheduledScan };
context.statusFixture = { ok: true, status: { running: false, lastRunAt: "2026-09-24T04:31:00Z", lastResult: scheduledResult } };
run(`state.rows=[];state.selected=null;state.scan=null;state.lastPaperEngineResult=null;
  state.lastPaperEngineReport=null;state.lastPaperEngineFingerprint='';state.lastPaperEngineStatusKey='';state.paperEngineStatusRunAt=0;
  state.upstoxStatus={token_visible:false};calls=[];notices=[];
  loadOrders=originalLoadOrders;
  renderAll=()=>{renderSignalDashboard();renderAutoOrderReadiness();renderBasketMeta()};
  api=async(path,options={})=>{calls.push({path,method:options.method||'GET'});return path==='/api/paper-engine/status'?statusFixture:{ok:true,orders:[],positions:[]}};
  setNotice('User is reviewing a manual operation','info')`);
assert.equal((await run("refreshPaperEngineStatus()")).lastResult.ok, true);
assert.equal(run("state.rows[0].symbol"), "SCHEDULED");
assert.match(node("signalRadarBody").innerHTML, /data-signal-symbol="SCHEDULED"/);
assert.match(node("autoOrderReadiness").innerHTML, /Latest engine outcome/);
assert.match(node("autoOrderReadiness").innerHTML, /SELECT 1; buy tickets 0; fills 0/);
assert.match(node("autoOrderReadiness").innerHTML, /No affordable entry slots/);
assert.equal(run("calls.length"), 2, "A new completed result reads status and refreshes orders once");
assert.equal(run("calls.every(call=>call.method==='GET')"), true, "Polling cannot mutate scanner or run the engine");
assert.equal(run("notices.length"), 1, "Background polling cannot overwrite the manual notice");

run("calls=[];state.selectedQuote={last_price:123}");
await run("refreshPaperEngineStatus()");
assert.equal(run("calls.length"), 1);
assert.equal(run("state.selectedQuote.last_price"), 123, "Repeated status does not invalidate a current quote");

// A distinct completed run may reuse the scan/result; lastRunAt still identifies a new completion.
context.statusFixture = { ...context.statusFixture, status: { ...context.statusFixture.status, lastRunAt: "2026-09-24T04:33:00Z" } };
run("calls=[]");
await run("refreshPaperEngineStatus()");
assert.equal(run("calls.length"), 2);
await run("refreshPaperEngineStatus()");
assert.equal(run("calls.length"), 3, "The new completion is consumed only once");

// A manual response and subsequent status read of that same result cannot duplicate ledger refreshes.
run("recordPaperEngineResult(statusFixture.status.lastResult);calls=[]");
await run("refreshPaperEngineStatus()");
assert.equal(run("calls.length"), 1);

const completedStatus = context.statusFixture;
context.statusFixture = { ok: true, status: { running: false } };
run("calls=[]");
await run("refreshPaperEngineStatus()");
assert.equal(run("calls.length"), 1, "Legacy/missing status fields trigger no execution or ledger calls");
assert.match(node("autoOrderReadiness").innerHTML, /SELECT 1/);

// A failed scheduler result remains a failure, not a fabricated zero-candidate success.
context.statusFixture = { ok: true, status: { running: false, lastRunAt: completedStatus.status.lastRunAt,
  lastResult: { ok: false, error: "Historical candles unavailable <script>" } } };
run("calls=[]");
await run("refreshPaperEngineStatus()");
assert.equal(run("calls.length"), 1, "Failed runs do not refresh/persist ledger quote marks");
assert.match(node("autoOrderReadiness").innerHTML, /Paper engine failed: Historical candles unavailable &lt;script&gt;/);
assert.doesNotMatch(node("autoOrderReadiness").innerHTML, /SELECT 0|<script>/);
assert.equal(run("state.rows[0].symbol"), "SCHEDULED", "A failed run leaves the last scanned batch visibly dated");

run("api=async()=>{throw new Error('status connection unavailable')}");
await run("refreshPaperEngineStatus()");
assert.match(node("autoOrderReadiness").innerHTML, /Engine status refresh failed: status connection unavailable/);
assert.match(node("autoOrderReadiness").innerHTML, /Historical candles unavailable/);
assert.equal(run("notices.length"), 1);
assert.equal(run("state.paperEngineStatusPolling"), false);

// Running, malformed and older status snapshots never produce new successful counts.
run("api=async(path,options={})=>{calls.push({path,method:options.method||'GET'});return statusFixture};calls=[]");
for (const payload of [{ ok: true, status: { running: true, lastResult: scheduledResult } },
  { ok: true, status: { lastResult: { ok: true } } }, { ok: false, error: "status_unavailable" },
  { ok: true, status: { lastRunAt: "2026-09-24T04:00:00Z", lastResult: result } }]) {
  context.statusFixture = payload;
  await run("refreshPaperEngineStatus()");
  assert.equal(run("state.rows[0].symbol"), "SCHEDULED");
}
assert.equal(run("calls.every(call=>call.path==='/api/paper-engine/status'&&call.method==='GET')"), true);

// Concurrent status ticks are deduplicated; a response started before a manual run is discarded.
run("globalThis.statusResolve=null;calls=[];api=(path)=>{calls.push({path,method:'GET'});return new Promise(resolve=>{statusResolve=resolve})}");
const pendingStatus = run("refreshPaperEngineStatus()");
assert.equal(await run("refreshPaperEngineStatus()"), null);
assert.equal(run("calls.length"), 1);
context.statusFixture = completedStatus;
run("state.paperEngineResultRevision+=1;statusResolve(statusFixture)");
await pendingStatus;
assert.equal(run("calls.length"), 1, "Stale status cannot launch a ledger refresh");

// A newer direct scan wins even when the completed engine result is otherwise new.
context.statusFixture = { ok: true, status: { lastRunAt: "2026-09-24T05:31:00Z",
  lastResult: { ...scheduledResult, scan: { ...scheduledScan, asOf: "2026-09-24T05:30:00Z" } } } };
run(`state.scan={asOf:'2026-09-24T06:00:00Z',rows:[oldRow]};state.rows=[oldRow];state.selected=oldRow;
  api=async(path)=>path==='/api/paper-engine/status'?statusFixture:{ok:true,orders:[],positions:[]}`);
await run("refreshPaperEngineStatus()");
assert.equal(run("state.rows[0].symbol"), "OLD");
assert.match(node("autoOrderReadiness").innerHTML, /newer radar retained/);

// A late poll-ledger response cannot overwrite orders from a newer manual action.
context.statusFixture = { ...context.statusFixture, status: { ...context.statusFixture.status, lastRunAt: "2026-09-24T06:31:00Z",
  lastResult: { ...scheduledResult, scan: { ...scheduledScan, asOf: "2026-09-24T06:30:00Z" } } } };
run(`globalThis.ordersResolve=null;api=async(path)=>path==='/api/paper-engine/status'?statusFixture:new Promise(resolve=>{ordersResolve=resolve})`);
const pendingLedger = run("refreshPaperEngineStatus()");
for (let attempt = 0; attempt < 5 && !run("Boolean(ordersResolve)"); attempt += 1) await Promise.resolve();
assert.equal(run("Boolean(ordersResolve)"), true);
run(`state.paperEngineResultRevision+=1;state.orders={ok:true,orders:[{symbol:'MANUAL'}],positions:[]};
  ordersResolve({ok:true,orders:[{symbol:'STALE'}],positions:[]})`);
await pendingLedger;
assert.equal(run("state.orders.orders[0].symbol"), "MANUAL");

// Independent order refreshes also invalidate a pending poll's ledger response,
// including a quick trade whose busy flag has already cleared before that response.
run("globalThis.orderReads=[];api=()=>new Promise(resolve=>orderReads.push(resolve))");
const oldOrders = run("loadOrders({isCurrent:()=>true})");
const newOrders = run("loadOrders()");
run("orderReads[1]({ok:true,orders:[{symbol:'LATEST'}],positions:[]})");
await newOrders;
run("orderReads[0]({ok:true,orders:[{symbol:'OUTDATED'}],positions:[]})");
await oldOrders;
assert.equal(run("state.orders.orders[0].symbol"), "LATEST");

// The page actually starts and repeats the GET status observer, independently of SELECT/autobuy eligibility.
run(`bindUi=()=>{};startClock=()=>{};renderMarketStrip=()=>{};renderFormulaSettings=()=>{};renderAll=()=>{};
  loadOrders=async()=>{};loadFormulaSettings=async()=>{};loadValuationTargets=async()=>{};loadMarketImportStatus=async()=>{};
  refreshScan=async()=>{};loadSignalMarketContext=async()=>{};loadReleaseIdentity=async()=>{};
  globalThis.statusReads=0;refreshPaperEngineStatus=async()=>{statusReads++};intervals.length=0;state.rows=[]`);
await context.lifecycle.DOMContentLoaded();
assert.equal(run("statusReads"), 1);
assert.equal(run("intervals.filter(item=>item.callback===refreshPaperEngineStatus&&item.delay===60000).length"), 1);
await run("intervals.find(item=>item.callback===refreshPaperEngineStatus).callback()");
assert.equal(run("statusReads"), 2);

console.log("Paper engine UI guard passed: truthful counts/errors/blockers, manual and scheduled scan synchronization, GET-only deduplicated status observation, guarded ledger refresh, stale-response protection, lifecycle polling, and server-authoritative execution labels.");
