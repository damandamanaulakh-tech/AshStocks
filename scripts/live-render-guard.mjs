import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// No test may reach the network, including an accidental import-time request.
let accidentalRequests = 0;
globalThis.fetch = async () => { accidentalRequests += 1; throw new Error("offline guard forbids real fetch"); };
const { buildLiveConfig, runLiveVerification } = await import("./check-live-render.mjs");
assert.equal(accidentalRequests, 0, "import must be side-effect free");

const COMMIT = "abc123".repeat(6) + "abcd";
const OLD_COMMIT = "0".repeat(40);
const ENV = { LIVE_EXPECTED_COMMIT: COMMIT, LIVE_RENDER_URL: "https://release.invalid",
  LIVE_RETRY_COUNT: "1", LIVE_RETRY_DELAY_MS: "0", LIVE_REQUEST_TIMEOUT_MS: "1000" };
const health = () => ({ ok: true, commit: COMMIT, provider: "AshStocks India Scanner",
  release: "2026-07-12-india-scanner", engine: "ashstocks-selection-v0.1-proof", ready: null,
  readiness_endpoint: "/api/ready", upstox: { historical_candles_only: false,
    live_quotes_enabled: true, institutional_analytics_enabled: true, live_orders: false } });
const ready = () => ({ ok: true, commit: COMMIT, provider: "AshStocks India Scanner",
  engine: "ashstocks-selection-v0.1-proof", storage: "mongodb", persistent: true,
  auth: { configured: true }, upstox: { key_visible: true, token_visible: true } });
const response = (body, init = {}) => new Response(JSON.stringify(body), { status: 200, ...init });
let scenarios = 0;
async function check(name, callback) {
  try { await callback(); scenarios += 1; } catch (error) { throw new Error(name + ": " + error.message, { cause: error }); }
}
function harness(sequence, env = {}) {
  const calls = [], attempts = [], delays = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const next = sequence[calls.length - 1];
    assert.notEqual(next, undefined, "unexpected extra request");
    if (typeof next === "function") return next(url, options);
    return next instanceof Response ? next : response(next);
  };
  return { calls, attempts, delays, run: () => runLiveVerification({ env: { ...ENV, ...env }, fetchImpl,
    onAttempt: (event) => attempts.push(event), sleepImpl: async (ms) => { delays.push(ms); } }) };
}
const paths = (test) => test.calls.map((call) => new URL(call.url).pathname);

await check("required exact commit is checked before any network request", async () => {
  for (const value of [undefined, "", "abc123", "g".repeat(40), "a".repeat(41), " " + COMMIT, COMMIT + "\n", 1]) {
    const test = harness([], { LIVE_EXPECTED_COMMIT: value });
    await assert.rejects(test.run(), /LIVE_EXPECTED_COMMIT/);
    assert.equal(test.calls.length, 0);
  }
});

await check("configuration bounds and HTTPS origin validation precede requests", async () => {
  for (const [key, value] of [
    ["LIVE_RETRY_COUNT", "0"], ["LIVE_RETRY_COUNT", "31"], ["LIVE_RETRY_COUNT", "Infinity"],
    ["LIVE_RETRY_COUNT", "2.5"], ["LIVE_RETRY_DELAY_MS", "-1"], ["LIVE_RETRY_DELAY_MS", "30001"],
    ["LIVE_REQUEST_TIMEOUT_MS", "0"], ["LIVE_REQUEST_TIMEOUT_MS", "30001"],
    ["LIVE_MAX_RESPONSE_BYTES", "127"], ["LIVE_MAX_RESPONSE_BYTES", "1048577"],
    ["LIVE_RENDER_URL", "http://release.invalid"], ["LIVE_RENDER_URL", "https://user:secret@release.invalid"],
    ["LIVE_RENDER_URL", "https://release.invalid?token=secret"], ["LIVE_RENDER_URL", "https://release.invalid/path"],
    ["LIVE_RENDER_URL", "https://release.invalid/#fragment"], ["LIVE_RENDER_URL", " https://release.invalid"]
  ]) {
    const test = harness([], { [key]: value });
    await assert.rejects(test.run());
    assert.equal(test.calls.length, 0);
  }
  assert.equal(buildLiveConfig({ ...ENV, LIVE_RENDER_URL: "https://release.invalid///" }).origin, "https://release.invalid");
});

await check("old or missing health SHA prevents readiness", async () => {
  for (const commit of [OLD_COMMIT, null, undefined, "short"]) {
    const test = harness([{ ...health(), commit }]);
    await assert.rejects(test.run(), /health commit/);
    assert.deepEqual(paths(test), ["/api/health"]);
  }
});

await check("matching commit and all safety assertions succeed with three version-bound reads", async () => {
  const first = health(), readiness = ready(), last = health();
  first.commit = first.commit.toUpperCase();
  last.commit = last.commit.toUpperCase();
  readiness.commit = readiness.commit.toUpperCase();
  readiness.upstox.secret = "never-copy-response-secret";
  const test = harness([first, readiness, last], { LIVE_EXPECTED_COMMIT: COMMIT.toUpperCase() });
  const result = await test.run();
  assert.equal(result.ok, true);
  assert.equal(result.commit, COMMIT);
  assert.equal(result.expectedCommit, COMMIT);
  assert.equal(result.commitCheckedBeforeDuringAndAfterReadiness, true);
  assert.equal(result.storage, "mongodb");
  assert.equal(JSON.stringify(result).includes("never-copy-response-secret"), false);
  assert.deepEqual(paths(test), ["/api/health", "/api/ready", "/api/health"]);
  for (const { options } of test.calls) {
    assert.equal(options.redirect, "error");
    assert.equal(options.method, "GET");
    assert.equal(options.cache, "no-store");
  }
});

await check("readiness version cannot be missing or from another deployment", async () => {
  for (const commit of [undefined, null, "short", OLD_COMMIT]) {
    const test = harness([health(), { ...ready(), commit }]);
    await assert.rejects(test.run(), /ready commit/);
    assert.deepEqual(paths(test), ["/api/health", "/api/ready"]);
  }
});

await check("mid-check deployment change fails final health", async () => {
  const test = harness([health(), ready(), { ...health(), commit: OLD_COMMIT }]);
  await assert.rejects(test.run(), /health commit does not match/);
  assert.deepEqual(paths(test), ["/api/health", "/api/ready", "/api/health"]);
});

await check("all existing liveness provider and paper safety checks remain enforced", async () => {
  const mutations = [
    (h) => { h.ok = false; }, (h) => { h.provider = "other"; }, (h) => { h.release = "other"; },
    (h) => { h.engine = "other"; }, (h) => { h.ready = true; }, (h) => { h.readiness_endpoint = "https://other.invalid"; },
    (h) => { h.upstox.historical_candles_only = true; }, (h) => { h.upstox.live_quotes_enabled = false; },
    (h) => { h.upstox.institutional_analytics_enabled = false; }, (h) => { h.upstox.live_orders = true; }
  ];
  for (const mutate of mutations) {
    const first = health(); mutate(first);
    const test = harness([first]);
    await assert.rejects(test.run());
    assert.deepEqual(paths(test), ["/api/health"]);
  }
  const last = health(); last.upstox.live_orders = true;
  await assert.rejects(harness([health(), ready(), last]).run(), /live orders/);
});

await check("all existing durable Mongo authentication and provider visibility checks remain enforced", async () => {
  const mutations = [
    (r) => { r.ok = false; }, (r) => { r.provider = "other"; }, (r) => { r.engine = "other"; },
    (r) => { r.storage = "memory"; }, (r) => { r.persistent = false; }, (r) => { r.auth.configured = false; },
    (r) => { r.upstox.key_visible = false; }, (r) => { r.upstox.token_visible = false; }
  ];
  for (const mutate of mutations) {
    const readiness = ready(); mutate(readiness);
    const test = harness([health(), readiness]);
    await assert.rejects(test.run());
    assert.deepEqual(paths(test), ["/api/health", "/api/ready"]);
  }
});

await check("readiness 503 and response errors do not expose raw secrets", async () => {
  const test = harness([health(), response({ error: "mongodb://private:SECRET@host" }, { status: 503 })]);
  await assert.rejects(test.run(), /unsuccessful HTTP status/);
  assert.equal(JSON.stringify(test.attempts).includes("SECRET"), false);
  const thrown = harness([() => { throw new Error("https://token:SECRET@private.invalid"); }]);
  await assert.rejects(thrown.run(), /request failed/);
  assert.equal(JSON.stringify(thrown.attempts).includes("SECRET"), false);
});

await check("HTTP redirects and wrong response origins are refused", async () => {
  for (const mutate of [
    () => response({}, { status: 302, headers: { location: "https://wrong.invalid" } }),
    () => { const res = response(health()); Object.defineProperty(res, "redirected", { value: true }); return res; },
    () => { const res = response(health()); Object.defineProperty(res, "url", { value: "https://wrong.invalid/api/health" }); return res; },
    () => { const res = response(health()); Object.defineProperty(res, "url", { value: "https://release.invalid/api/health?token=SECRET" }); return res; }
  ]) {
    const test = harness([mutate()]);
    await assert.rejects(test.run(), /redirect refused|response URL mismatch/);
    assert.deepEqual(paths(test), ["/api/health"]);
  }
});

await check("JSON and UTF-8 must be valid bounded objects", async () => {
  for (const body of ["SECRET invalid JSON", "null", "[]", "42", Uint8Array.from([0xff])]) {
    const test = harness([new Response(body)]);
    await assert.rejects(test.run(), /invalid UTF-8 JSON|non-object JSON/);
    assert.equal(JSON.stringify(test.attempts).includes("SECRET"), false);
  }
});

await check("declared and streamed response byte limits are enforced", async () => {
  const declared = harness([response(health(), { headers: { "content-length": "9999999999" } })]);
  await assert.rejects(declared.run(), /byte limit/);
  const streamed = harness([new Response(" ".repeat(2000))], { LIVE_MAX_RESPONSE_BYTES: "1024" });
  await assert.rejects(streamed.run(), /byte limit/);
  const chunks = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(100));
    controller.enqueue(new Uint8Array(100));
    controller.close();
  } });
  await assert.rejects(harness([new Response(chunks)], { LIVE_MAX_RESPONSE_BYTES: "128" }).run(), /byte limit/);
});

await check("retry exhaustion is bounded and observed old health skips readiness", async () => {
  const test = harness(Array.from({ length: 3 }, () => ({ ...health(), commit: OLD_COMMIT })),
    { LIVE_RETRY_COUNT: "3", LIVE_RETRY_DELAY_MS: "7" });
  await assert.rejects(test.run(), /health commit/);
  assert.deepEqual(paths(test), ["/api/health", "/api/health", "/api/health"]);
  assert.deepEqual(test.delays, [7, 7]);
  assert.deepEqual(test.attempts.map((row) => row.attempt), [1, 2, 3]);
});

await check("retry restarts health and can succeed only on a full matching sequence", async () => {
  const test = harness([{ ...health(), commit: OLD_COMMIT }, health(), ready(), health()], { LIVE_RETRY_COUNT: "2" });
  assert.equal((await test.run()).ok, true);
  assert.deepEqual(paths(test), ["/api/health", "/api/health", "/api/ready", "/api/health"]);
});

await check("fetch timeout aborts even a mock that ignores its signal", async () => {
  const test = harness([() => new Promise(() => {}), () => new Promise(() => {})],
    { LIVE_REQUEST_TIMEOUT_MS: "5", LIVE_RETRY_COUNT: "2" });
  await assert.rejects(test.run(), /timed out/);
  assert.equal(test.calls.length, 2);
  assert.ok(test.calls.every(({ options }) => options.signal.aborted));
  assert.deepEqual(test.delays, [0]);
});

await check("body-read timeout is bounded and canceled", async () => {
  let canceled = false;
  const body = new ReadableStream({ cancel() { canceled = true; } });
  const test = harness([new Response(body)], { LIVE_REQUEST_TIMEOUT_MS: "5" });
  await assert.rejects(test.run(), /timed out/);
  assert.equal(canceled, true);
});

await check("actual CLI succeeds and fails offline without contacting production", async () => {
  const script = fileURLToPath(new URL("./check-live-render.mjs", import.meta.url));
  function cli(expected, before, readiness, after, expectedCalls, timeout = false) {
    const fixture = [before, readiness, after];
    const preload = "let count=0; const rows=" + JSON.stringify(fixture) + "; globalThis.fetch=async()=>{count++;"
      + (timeout ? "return new Promise(()=>{});" : "if(count>rows.length) throw Error('unexpected request'); return new Response(JSON.stringify(rows[count-1]));")
      + "}; process.on('exit',()=>{if(count!==" + expectedCalls + ") process.exitCode=99;});";
    const childEnv = { PATH: process.env.PATH, ...ENV, LIVE_REQUEST_TIMEOUT_MS: "20" };
    if (expected === undefined) delete childEnv.LIVE_EXPECTED_COMMIT;
    else childEnv.LIVE_EXPECTED_COMMIT = expected;
    return spawnSync(process.execPath, ["--import", "data:text/javascript," + encodeURIComponent(preload), script],
      { encoding: "utf8", env: childEnv, timeout: 5000, maxBuffer: 262144 });
  }
  const success = cli(COMMIT, health(), ready(), health(), 3);
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).commit, COMMIT);
  assert.equal(success.stderr, "");
  const missing = cli(undefined, health(), ready(), health(), 0);
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, "");
  assert.match(JSON.parse(missing.stderr).error, /LIVE_EXPECTED_COMMIT/);
  const old = cli(COMMIT, { ...health(), commit: OLD_COMMIT }, ready(), health(), 1);
  assert.equal(old.status, 1);
  assert.match(JSON.parse(old.stderr).error, /health commit/);
  const timed = cli(COMMIT, health(), ready(), health(), 1, true);
  assert.equal(timed.status, 1);
  assert.match(JSON.parse(timed.stderr).error, /timed out/);
});

assert.equal(accidentalRequests, 0, "all network calls must be replaced by offline fixtures");
console.log(JSON.stringify({ ok: true, scenarios, networkRequests: 0,
  note: "Exact-commit Render verifier guard passed; no production readiness or deployment actions performed." }));
