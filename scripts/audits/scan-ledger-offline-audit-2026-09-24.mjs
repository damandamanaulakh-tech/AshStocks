import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

// Diagnostic checkpoint only: all source reads are immutable, local Git objects.
// Run from the AshStocks repository root. No server entry point is imported.
const repo = process.cwd();
const featureRef = 'c2a99bf97128d645eb1891e474743b522c9e26a6';
const mainRef = '226e1394d5af3f0c380593d58917b8d2ee5c13e8';
const historical = (ref, file) => execFileSync('git', ['show', `${ref}:${file}`], { cwd: repo, encoding: 'utf8', maxBuffer: 4_000_000, timeout: 10000 });
const read = file => historical(featureRef, file);
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const basePath = 'vendor/base-server-37a9e9ceacabd33bc5a2085ad621e368f8fc0cd8.mjs';
const base = read(basePath);
assert.equal(sha(base), '156db2e19447e47c5b642a66f6b74f4809763d386d6cc40430b3dd98d264f324');
assert.equal(sha(historical('37a9e9ceacabd33bc5a2085ad621e368f8fc0cd8', 'server.js')), sha(base));
const sourceHashes = { [basePath]: sha(base) };
const engineFile = 'server-paper-engine-autobuy-patch.mjs';
const engines = {};
for (const [label, source] of [['feature', read(engineFile)], ['main', historical(mainRef, engineFile)]]) {
  assert.ok(!/^import /m.test(source));
  const sandbox = {};
  vm.runInNewContext(source.replace(/^export /gm, '') + '\nglobalThis.parts = { run: PAPER_ENGINE_RUN_REPLACEMENT, due: PAPER_ENGINE_DUE_REPLACEMENT };', sandbox, { timeout: 1000 });
  engines[label] = sandbox.parts;
  sourceHashes[`${label}:${engineFile}`] = sha(source);
}
const rotationSource = read('server-universe-rotation-patch.mjs');
const rotationLib = read('lib/universe-rotation.mjs').replace(/^import crypto from "node:crypto";\n/m, '').replaceAll('export function ', 'function ').replaceAll('export const ', 'const ');
const rotationLiteral = rotationSource.match(/const FUNCTIONS = (String\.raw`[\s\S]*?`);\n\nconst ROUTES/)[1];
const rotationFunctions = vm.runInNewContext(rotationLiteral, { rotationCode: rotationLib }, { timeout: 1000 });
sourceHashes['server-universe-rotation-patch.mjs'] = sha(rotationSource);
sourceHashes['lib/universe-rotation.mjs'] = sha(read('lib/universe-rotation.mjs'));
const ledgerFunctions = base.slice(base.indexOf('function compactScanRow('), base.indexOf('function upstoxStatus()'));
assert.ok(ledgerFunctions.includes('return store.appendScanRecord(buildScanRecord(scan, context));'));
const tick = base.slice(base.indexOf('async function paperEngineTick()'), base.indexOf('function startPaperEngineScheduler()'));
const mongoBody = base.match(/        async appendScanRecord\(record\) \{([\s\S]*?)\n        \},\n        async listScanRecords/)[1];
assert.ok(mongoBody.includes('await scanLedger.insertOne('));
const mongoAppend = `async function mongoAppendScanRecord(record) {${mongoBody}\n}`;
const clone = value => JSON.parse(JSON.stringify(value));
const testResults = [];
let allNetworkAttempts = 0;

function harness(label, options = {}) {
  const clock = { now: Date.parse('2026-09-24T05:00:00.000Z') };
  class FrozenDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const events = [];
  const persisted = [];
  const attempts = [];
  const counts = { scanner: 0, plan: 0, quotes: 0, monitor: 0, orders: 0, stateSave: 0, metadataSave: 0 };
  const controls = { failMode: options.failMode || null, failStateSave: Boolean(options.failStateSave) };
  let state = {
    universe: Array.from({ length: 400 }, (_, i) => ({ symbol: `SAMPLE${String(i).padStart(4,'0')}`, instrument_key: `NSE_EQ|OFFLINE${String(i).padStart(5,'0')}` })),
    universeRevision: 1, selectionSettingsControl: { revision: 1 }, scannerSettings: { offline_fixture: true }, scannerRotation: {},
    paperTrader: { positions: [{ symbol: 'HELD', instrument_key: 'NSE_EQ|OFFLINEHELD', qty: 1 }], gtt: [], orders: [] }
  };
  const makeScan = rows => ({ ok: true, asOf: new FrozenDate().toISOString(), engine: 'offline-scan-fixture', source: 'Upstox historical candles',
    universe: rows.length, scanned: rows.length, settings: state.scannerSettings,
    summary: { total: rows.length, SELECT: 1, WATCH: rows.length-1, REJECT: 0, BLOCKED: 0, DATA_NEEDED: 0 },
    rows: rows.map((r,i) => ({ ...r, decision: i ? 'WATCH' : 'SELECT', score: 75, close: 100, gates: { input: 'synthetic' }, reason: 'offline fixture' })) });
  const store = {
    async getState() { events.push('getState'); return clone(state); },
    async saveUniverseMetadata(next) { counts.metadataSave++; events.push('saveUniverseMetadata'); state = clone(next); return clone(state); },
    async saveState(next) { counts.stateSave++; events.push('saveState'); if (controls.failStateSave) throw new Error('OFFLINE_STATE_SAVE_REJECTED'); state = clone(next); return clone(state); }
  };
  const scanLedger = {
    async insertOne(doc) {
      events.push(`insert:${doc.mode}`); attempts.push(clone(doc));
      if (controls.failMode === 'all' || (controls.failMode === 'engine' && doc.mode.startsWith('paper-engine')) || (controls.failMode === 'rotation' && doc.mode === 'universe-rotation')) {
        throw new Error('OFFLINE_INSERT_REJECTED');
      }
      persisted.push(clone(doc));
      return { acknowledged: true, insertedId: doc.id };
    }
  };
  let sandbox;
  const context = {
    crypto, Date: FrozenDate, console: { log() {}, error() {} },
    fetch() { allNetworkAttempts++; throw new Error('NETWORK_FORBIDDEN'); },
    ENV: { UPSTOX_SCAN_LIMIT: '200' }, MAX_UNIVERSE_ROWS: 5000, MAX_SCAN_LEDGER_ROWS: 75,
    ENGINE_VERSION: 'offline-base', PAPER_ENGINE_AUTOBUY_VERSION: 'source-derived-control-flow-fixture', PAPER_ENGINE_AUTO_INTERVAL_MINUTES: 2,
    PARAMETER_TUNNEL_VERSION: 'offline', PAPER_CAPITAL_POLICY: { minimumEntryPct: 0.2, minimumEntryValue: 100000, maximumCandidateEntries: 500, maximumOpenPositions: 500 },
    paperEngineState: { runKeys: {}, running: false, lastRunAt: null, lastSlotKey: null, lastResult: null }, latestParameterTunnelScan: null,
    finiteOr: (v, fallback=0) => Number.isFinite(Number(v)) ? Number(v) : fallback,
    normalizeScannerSettings: x => x, normalizeScannerUniverse: rows => rows, normalizeSymbol: x => String(x || '').trim().toUpperCase(),
    unique: values => [...new Set(values.filter(Boolean))], scanLedger,
    getStore: async () => store, withStateMutation: async fn => fn(), currentUpstoxAccessToken: async () => 'OFFLINE_TOKEN_NOT_A_CREDENTIAL',
    upstoxRuntimeStatus: async () => ({ offline: true }),
    selectionSettingsRevision: s => s.selectionSettingsControl?.revision || 0,
    filterSuspendedScannerRows: async rows => rows, prioritizedStockRows: rows => rows,
    stampPersistedSelectionSettings: scan => scan,
    runUpstoxScanner: async (body, rows) => { counts.scanner++; events.push('scanner'); const scan = makeScan(rows); if (body.cacheScan !== false) sandbox.latestParameterTunnelScan = scan; return scan; },
    paperEngineAutoBuySettings: () => ({ enabled: true, requireScannerDecision: 'SELECT', maxBuysPerRun: 1, maxQuoteAgeSeconds: 60, product: 'offline' }),
    buildPaperTraderPlan: (scan) => { counts.plan++; events.push('plan'); return { summary: {}, settings: {}, history: [], fixtureTicket: { symbol: scan.rows[0].symbol, close: 100, qty: 1 } }; },
    paperKellySizing: () => ({ applied: false }), sanitizePaperTraderState: trader => ({ ...trader, positions: trader.positions || [], gtt: trader.gtt || [], orders: trader.orders || [] }),
    paperEngineOpenSymbols: s => new Set(s.paperTrader.positions.map(p=>p.symbol)),
    paperEngineCandidateTickets: plan => [plan.fixtureTicket], paperEngineCandidateBlockers: () => [],
    paperEngineMarketState: () => ({ open: true }),
    fetchUpstoxMarketQuotes: async keys => { counts.quotes++; events.push('quotes'); return { ok: true, quotes: keys.map(key => ({ instrument_key: key, last_price: 100, timestamp: new FrozenDate().toISOString(), depth: { asks: [], bids: [] } })) }; },
    paperEngineQuoteMap: payload => new Map(payload.quotes.map(q => [q.instrument_key,q])), paperEngineQuoteKey: value => String(value || ''),
    paperEngineTimestampMs: value => Date.parse(value), paperMonitorDepthExecution: () => ({ fill_price: 100 }),
    applyPaperLifecycleMonitor: s => { counts.monitor++; events.push('monitor'); return { nextState: s, events: [], data_needed: [] }; },
    paperEngineQuoteEvidence: q => ({ all_clear: true, quote_fresh: true, full_visible_ask_depth: true, requested_qty: 1, fill_price: 100, quote_timestamp: q.timestamp }),
    applyPaperOrderLifecycle: (s, body) => { counts.orders++; events.push('order'); return { ok: true, nextState: s, order: { id: `mock-${counts.orders}`, ...body, status: 'FILLED' } }; },
    paperEngineRecordRejection: () => { throw new Error('UNEXPECTED_REJECTION_IN_CONTROL_FIXTURE'); },
    paperLifecycleFunds: () => ({ buying_power: 1000000 }), paperTraderSettings: () => ({ maxPositionPct: 0.02 }),
    paperEngineSchedulerEnabled: () => true,
    istClockParts: date => { const local = new Date(date.getTime()+330*60000).toISOString(); return { date: local.slice(0,10), time: local.slice(11,16) }; }
  };
  sandbox = vm.createContext(context, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(ledgerFunctions + '\n' + mongoAppend + '\n' + (label === 'feature' ? rotationFunctions : '') + '\n' + engines[label].run + '\n' + engines[label].due + '\n' + tick, sandbox, { timeout: 1000 });
  store.appendScanRecord = record => sandbox.mongoAppendScanRecord(record);
  if (options.seedCache) sandbox.latestParameterTunnelScan = makeScan(state.universe.slice(0,200));
  return {
    label, clock, counts, events, persisted, attempts, controls,
    run: () => sandbox.runPaperEngineOnce('manual', null), tick: () => sandbox.paperEngineTick(),
    precommit: () => sandbox.runNextUniverseBatch({ horizon:'intraday' }),
    appendSame: () => sandbox.appendScanLedger(sandbox.latestParameterTunnelScan, { store, mode:'same-scan-test' }),
    debug: () => ({ state: clone(state), engine: clone(sandbox.paperEngineState),
      committed: label === 'feature' ? vm.runInContext('committedUniverseScan ? { consumed: committedUniverseScan.consumed, asOf: committedUniverseScan.scan.asOf, rotation: committedUniverseScan.scan.rotation } : null', sandbox) : null })
  };
}

function payload(record) {
  const { id, createdAt, createdAtDate, mode, source, ...content } = record;
  return JSON.stringify(content);
}
function summary(h) { return { counts: clone(h.counts), append_attempts: h.attempts.length, successful_inserts: h.persisted.length, modes: h.persisted.map(r=>r.mode), events: [...h.events], last_result: h.debug().engine.lastResult?.ok ?? null }; }
function noDownstream(h) { for (const k of ['plan','quotes','monitor','orders','stateSave']) assert.equal(h.counts[k],0,k); }
async function scenario(name, work) { const details = await work(); testResults.push({ name, passed:true, ...details }); }

await scenario('main_three_successful_runs_reappend_one_fresh_cached_scan', async () => {
  const h=harness('main',{seedCache:true}); const results=[];
  for(let i=0;i<3;i++){ results.push(await h.run()); h.clock.now += 60000; }
  assert.equal(h.counts.scanner,0); assert.equal(h.persisted.length,3); assert.equal(new Set(h.persisted.map(r=>r.id)).size,3);
  assert.equal(new Set(h.persisted.map(payload)).size,1); assert.ok(results.every(r=>r.scan_cache_used));
  assert.equal(h.counts.quotes,3); assert.equal(h.counts.monitor,3); assert.equal(h.counts.orders,3);
  assert.ok(h.persisted.every(r=>r.rows.length===75));
  return { ...summary(h), distinct_record_ids:3, distinct_compact_payloads:1, retained_rows_per_record:75, cache_flags:results.map(r=>r.scan_cache_used),
    synthetic_json_bytes:h.persisted.map(r=>Buffer.byteLength(JSON.stringify(r))), sizing_warning:'synthetic fixture JSON only, not BSON/compression/live Mongo sizing' };
});
await scenario('main_expired_cached_scan_requests_new_scan',async()=>{
  const h=harness('main',{seedCache:true}); h.clock.now+=301000; const r=await h.run();
  assert.equal(h.counts.scanner,1); assert.equal(h.persisted.length,1); assert.equal(r.scan_cache_used,false); return summary(h);
});
await scenario('feature_two_fresh_runs_write_rotation_plus_engine_pairs',async()=>{
  const h=harness('feature'); const a=await h.run(),b=await h.run();
  assert.equal(h.counts.scanner,2); assert.equal(h.persisted.length,4); assert.equal(h.counts.metadataSave,2);
  assert.deepEqual(h.persisted.map(r=>r.mode),['universe-rotation','paper-engine-manual','universe-rotation','paper-engine-manual']);
  assert.equal(payload(h.persisted[0]),payload(h.persisted[1])); assert.equal(payload(h.persisted[2]),payload(h.persisted[3]));
  assert.equal(new Set(h.persisted.map(r=>r.id)).size,4); assert.equal(a.scan_cache_used,false);assert.equal(b.scan_cache_used,false);
  assert.equal(h.debug().committed.consumed,true);
  return { ...summary(h), pair_content_equal_excluding_event_identity_mode_source:true, cache_flags:[a.scan_cache_used,b.scan_cache_used],
    synthetic_json_bytes:h.persisted.map(r=>Buffer.byteLength(JSON.stringify(r))), sizing_warning:'different audit events duplicate the compact content; not evidence that either event is disposable' };
});
await scenario('feature_precommitted_scan_reused_once_after_success',async()=>{
  const h=harness('feature'); await h.precommit(); const a=await h.run(),b=await h.run();
  assert.equal(a.scan_cache_used,true);assert.equal(b.scan_cache_used,false);assert.equal(h.counts.scanner,2);assert.equal(h.persisted.length,4);
  return { ...summary(h), cache_flags:[a.scan_cache_used,b.scan_cache_used] };
});
await scenario('main_insert_rejection_aborts_before_plan_quotes_monitor_orders',async()=>{
  const h=harness('main',{seedCache:true,failMode:'all'}); await assert.rejects(h.run(),/OFFLINE_INSERT_REJECTED/);
  noDownstream(h);assert.equal(h.attempts.length,1);assert.equal(h.persisted.length,0);assert.equal(h.debug().engine.lastResult,null);
  return { ...summary(h), manual_promise_rejected:true, manual_last_result_not_replaced:true };
});
await scenario('feature_rotation_insert_rejection_prevents_cursor_cache_and_downstream',async()=>{
  const h=harness('feature',{failMode:'rotation'});await assert.rejects(h.run(),/OFFLINE_INSERT_REJECTED/);
  noDownstream(h);assert.equal(h.counts.scanner,1);assert.equal(h.counts.metadataSave,0);assert.equal(h.debug().committed,null);
  assert.equal(h.persisted.length,0);return { ...summary(h), committed_cache:null, rotation_progress_saved:false };
});
await scenario('feature_engine_insert_rejection_leaves_committed_scan_unconsumed_then_retries_cache',async()=>{
  const h=harness('feature',{failMode:'engine'});await assert.rejects(h.run(),/OFFLINE_INSERT_REJECTED/);
  noDownstream(h);assert.equal(h.persisted.length,1);assert.equal(h.attempts.length,2);assert.equal(h.counts.metadataSave,1);assert.equal(h.debug().committed.consumed,false);
  await assert.rejects(h.run(),/OFFLINE_INSERT_REJECTED/); noDownstream(h);assert.equal(h.attempts.length,3);assert.equal(h.persisted.length,1);assert.equal(h.counts.scanner,1);
  const failureSnapshot=summary(h); h.controls.failMode=null;const recovered=await h.run();
  assert.equal(recovered.scan_cache_used,true);assert.equal(h.counts.scanner,1);assert.equal(h.persisted.length,2);assert.equal(h.debug().committed.consumed,true);
  return { initial_and_retry:failureSnapshot, recovery:summary(h), recovery_cache_used:true, failed_attempts_add_no_documents:true };
});
await scenario('feature_post_append_state_save_failure_can_reappend_same_cached_payload',async()=>{
  const h=harness('feature',{failStateSave:true});await assert.rejects(h.run(),/OFFLINE_STATE_SAVE_REJECTED/);
  assert.equal(h.persisted.length,2);assert.equal(h.debug().committed.consumed,false); h.controls.failStateSave=false;
  const retried=await h.run();assert.equal(retried.scan_cache_used,true);assert.equal(h.counts.scanner,1);assert.equal(h.persisted.length,3);
  assert.equal(payload(h.persisted[1]),payload(h.persisted[2]));
  return { ...summary(h), retry_cache_used:true, identical_successful_engine_payloads:2,
    scope_limit:'State-save rejection is a separate downstream failure scenario. Lifecycle callbacks are mocked; repeated callback calls do not prove real duplicate filled orders.' };
});
for(const label of ['main','feature']) await scenario(`${label}_scheduler_catches_insert_failure_and_does_not_retry_same_slot`,async()=>{
  const h=harness(label,{seedCache:label==='main',failMode:'all'});await h.tick();const attempts=h.attempts.length;
  assert.equal(h.debug().engine.lastResult.error,'OFFLINE_INSERT_REJECTED');assert.equal(h.debug().engine.running,false);
  await h.tick();assert.equal(h.attempts.length,attempts);h.clock.now+=120000;await h.tick();assert.equal(h.attempts.length,attempts+1);noDownstream(h);
  return { ...summary(h), same_slot_retry_attempts:0, next_two_minute_slot_attempted:true, marked_run_keys:Object.keys(h.debug().engine.runKeys).length };
});
await scenario('mongo_append_path_does_not_enforce_250_record_count_retention',async()=>{
  const h=harness('main',{seedCache:true});for(let i=0;i<251;i++)await h.appendSame();assert.equal(h.persisted.length,251);
  assert.equal(new Set(h.persisted.map(r=>r.id)).size,251);
  return { successful_inserts:251, distinct_ids:251, source_scope:'actual Mongo append method and ledger builder with mocked insertOne; this does not inspect existing server-side TTL indexes or production retention' };
});
assert.equal(allNetworkAttempts,0);
console.log(JSON.stringify({ schema_version:'ash-scan-ledger-offline-audit-v1',as_of:'2026-09-24',
  revisions:{feature:featureRef,main:mainRef,base:'37a9e9ceacabd33bc5a2085ad621e368f8fc0cd8'},source_sha256:sourceHashes,
  method:'Immutable-commit source-derived engine run/due bodies, rotation/cache implementation and Mongo append/ledger helpers evaluated in disposable VM; all source reads use local git show, no server boot, no sockets, no actual providers/database.',
  mocks:['getStore/state and Mongo insertOne in-memory only; getState is explicitly nonthrowing in these fixtures','synthetic scanner uses a 400-symbol fixture in 200-row batches for rotation; main direct scanner receives its supplied universe','fixed clock / always-open market','provider quotes, settings normalization, planning/risk/execution/lifecycle callbacks are explicit mocks','withStateMutation directly invokes its callback without the real queue; concurrency races not tested'],
  privacy:'No real credentials, raw portfolio state or database contents read. Token fixture is a literal dummy; process.env is never inspected.',
  side_effects:{network_attempts:allNetworkAttempts,mongo_connections:0,server_listeners:0,repo_writes:0,raw_asset_writes:0},
  results:testResults,total_scenarios:testResults.length,all_passed:true,
  limits:['This is offline control-flow evidence, not live Mongo size/alarm/deployment proof.','The real getState path can first archive a paper-ledger startup backfill and fail before scan append; this earlier write/failure path is explicitly mocked out, not exonerated.','Mocked trading success is used only to prove downstream callbacks are reachable when ledger writes succeed. No scoring, fill correctness or real-order claim is made.','JSON byte counts are synthetic fixture sizes and omit Mongo BSON/storage/index/compression overhead.','Feature and main sources are immutable local Git objects at the recorded SHAs, not proof of the live deployed revision.','The HTTP outer 500 catch is source-inspected, not an exercised server route in this harness.']},null,2));
