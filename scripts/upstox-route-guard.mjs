import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import http from "node:http";
import { once } from "node:events";
import { UPSTOX_HTTP_FUNCTIONS } from "../lib/upstox-http.mjs";
import { RUNTIME_STORAGE_FUNCTIONS } from "../server-runtime-resilience-patch.mjs";
import { applyUpstoxOAuthPatches } from "../server-upstox-oauth-patch.mjs";

// Execute the actual embedded routes/functions with synthetic auth and storage.
// No server boot, real credentials, provider calls, Mongo access, or paper orders.
// Optional --loopback additionally exercises native HTTP disconnect semantics on
// a random 127.0.0.1 port, still with synthetic provider/storage implementations.
const oauthSource = fs.readFileSync(new URL("../server-upstox-oauth-patch.mjs", import.meta.url), "utf8");
const quoteSource = fs.readFileSync(new URL("../server-upstox-quote-patch.mjs", import.meta.url), "utf8");
function embedded(source, name) {
  const value = source.match(new RegExp("const " + name + " = String\\.raw`([\\s\\S]*?)\\n`;"))?.[1];
  assert(value, "Actual embedded source required: " + name);
  return value;
}
const oauthFunctions = embedded(oauthSource, "UPSTOX_OAUTH_FUNCTIONS");
const callbackRoute = embedded(oauthSource, "UPSTOX_PUBLIC_CALLBACK_ROUTE");
const authRoutes = embedded(oauthSource, "UPSTOX_AUTH_ROUTES");
const quoteFunctions = embedded(quoteSource, "UPSTOX_QUOTE_FUNCTIONS");
const baseSource = fs.readFileSync(new URL("../vendor/base-server-37a9e9ceacabd33bc5a2085ad621e368f8fc0cd8.mjs", import.meta.url), "utf8");
const patched = applyUpstoxOAuthPatches(baseSource, (source, before, after, label) => {
  assert(source.includes(before), "Patch anchor exists: " + label);
  return source.replace(before, after);
});
const scannerStart = patched.indexOf("async function runUpstoxScanner(");
const scannerEnd = patched.indexOf("\nfunction paperEngineSchedulerEnabled(", scannerStart);
assert(scannerStart >= 0 && scannerEnd > scannerStart, "Actual generated scanner must be extracted");
const scannerFunction = patched.slice(scannerStart, scannerEnd);
const bodyStart = patched.indexOf("async function readJsonBody(");
const bodyEnd = patched.indexOf("\nasync function readFormBody(", bodyStart);
assert(bodyStart >= 0 && bodyEnd > bodyStart, "Actual JSON body reader must be extracted");
const bodyFunction = patched.slice(bodyStart, bodyEnd);
const fixtureSecret = "fixture-route-private-token";
const fixtureRawError = "fixture-private-host-mongodb://private.example:27017?password=secret";
const fixtureRequest = { headers: { host: "fixture.invalid", "x-forwarded-proto": "https" }, method: "GET" };
const plain = (value) => JSON.parse(JSON.stringify(value));
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let groups = 0;
const failures = [];
async function check(name, work) {
  try { await work(); groups++; console.log("PASS " + name); }
  catch (error) { failures.push({ name, error }); console.error("FAIL " + name + ": " + error.message); }
}
function safePublic(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const sensitive of [fixtureSecret, fixtureRawError, "private.example", "password=secret"]) {
    assert(!text.includes(sensitive), "Public errors cannot contain fixture secrets or driver diagnostics");
  }
}

function harness(options = {}) {
  const activity = { responses: [], fetches: 0, writes: 0, reads: 0, engineQueues: 0, engineCalls: 0, normalization: 0 };
  const control = { body: options.body ?? { access_token: fixtureSecret }, stored: options.stored ?? null,
    fetch: options.fetch || (() => response({ access_token: fixtureSecret })), error: null };
  const context = vm.createContext({
    ENV: { NODE_ENV: "test", UPSTOX_API_KEY: "fixture-client", UPSTOX_API_SECRET: "fixture-client-secret", UPSTOX_ACCESS_TOKEN: "", ...options.env },
    Buffer, URL, URLSearchParams, crypto, AbortController, TextDecoder, Uint8Array, Date,
    console: { warn() {}, error() {} },
    setTimeout: (callback, ms) => {
      if (ms === 750) { activity.engineQueues++; return { unref() {} }; }
      return setTimeout(callback, Math.min(ms, 20));
    }, clearTimeout,
    fetch: async (url, init) => { activity.fetches++; return control.fetch(url, init); },
    sessionSecret: () => "fixture-session-key", finiteOr: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    escapeHtml: (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    readRawBody: async () => { if (options.bodyError) throw options.bodyError; return Buffer.from(options.rawBody ?? JSON.stringify(control.body)); },
    json: (_res, status, body) => activity.responses.push({ status, body: plain(body), type: "json" }),
    html: (_res, status, body) => activity.responses.push({ status, body, type: "html" }),
    runPaperEngineOnce: async () => { activity.engineCalls++; },
    upstoxStatus: () => ({ live_orders: false, token_visible: false }),
    defaultDateWindow: () => ({ from: "2026-09-01", to: "2026-10-01" }),
    normalizeScannerUniverse: () => { activity.normalization++; return []; },
    getStore: async () => {
      if (options.storeConnectError) throw vm.runInContext('runtimeStorageFailure("store_connect", new Error("fixture-driver"))', context);
      return vm.runInContext("instrumentRuntimeStore(fixtureStore)", context);
    },
    fixtureStore: {
      async getUpstoxAuth() { activity.reads++; if (options.storeReadError) throw new Error(fixtureRawError); return control.stored; },
      async saveUpstoxAuth(auth) { if (options.storeWriteError) throw new Error(fixtureRawError); activity.writes++; control.stored = auth; return auth; }
    },
    fixtureWork: async () => { throw control.error; }
  });
  vm.runInContext(RUNTIME_STORAGE_FUNCTIONS + UPSTOX_HTTP_FUNCTIONS + oauthFunctions + scannerFunction + bodyFunction +
    "\nasync function fixtureCallbackRoute(url, req, res) {" + callbackRoute + "}\n" +
    "async function fixtureAuthRoute(url, req, res) {" + authRoutes + "}\n", context, { timeout: 1000 });
  const run = (code) => vm.runInContext(code, context, { timeout: 1000 });
  return {
    activity, control, context, run,
    callback: async (query = null) => {
      context.fixtureUrl = new URL("https://fixture.invalid/api/upstox/callback");
      if (query === null) {
        context.fixtureUrl.searchParams.set("code", "fixture-code");
        context.fixtureUrl.searchParams.set("state", run("createUpstoxOAuthState({ headers: { host: 'fixture.invalid' } })"));
      } else for (const [name, value] of Object.entries(query)) context.fixtureUrl.searchParams.set(name, value);
      context.fixtureRequest = { ...fixtureRequest }; context.fixtureResponse = {};
      await run("fixtureCallbackRoute(fixtureUrl, fixtureRequest, fixtureResponse)");
      return activity.responses.at(-1);
    },
    manual: async (method = "POST") => {
      context.fixtureUrl = new URL("https://fixture.invalid/api/upstox/token");
      context.fixtureRequest = { ...fixtureRequest, method }; context.fixtureResponse = {};
      await run("fixtureAuthRoute(fixtureUrl, fixtureRequest, fixtureResponse)");
      return activity.responses.at(-1);
    },
    inject: (kind, error) => {
      control.error = error;
      run((kind === "callback" ? "exchangeUpstoxOAuthCode" : "handleUpstoxTokenPaste") + " = fixtureWork;");
    },
    scanner: async () => {
      try { return { value: await run("runUpstoxScanner({})") }; }
      catch (error) { return { error }; }
    }
  };
}

for (const kind of ["callback", "manual"]) {
  for (const [code, status] of [["upstox_timeout", 504], ["upstox_auth_rejected", 502], ["upstox_rate_limited", 503]]) {
    await check(kind + " route preserves sanitized provider " + status, async () => {
      const h = harness(); const error = h.run('upstoxRequestFailure("oauth_exchange", "' + code + '", ' + (code === "upstox_auth_rejected" ? 401 : code === "upstox_rate_limited" ? 429 : "null") + ')');
      error.message = fixtureRawError + fixtureSecret; error.status = 401;
      h.inject(kind, error); const result = await h[kind]();
      assert.equal(result.status, status); safePublic(result.body);
      if (kind === "manual") { assert.equal(result.body.code, code); assert.equal(result.body.dependency, "upstox"); }
      else assert.match(result.body, /Upstox oauth_exchange/);
      assert.equal(h.activity.engineQueues, 0); assert.equal(h.activity.writes, 0);
    });
  }
  await check(kind + " route preserves distinct storage 503", async () => {
    const h = harness({ storeWriteError: true }); const result = await h[kind]();
    assert.equal(result.status, 503); safePublic(result.body);
    if (kind === "manual") { assert.equal(result.body.code, "storage_unavailable"); assert.equal(result.body.dependency, "storage"); assert.equal(result.body.stage, "auth_write"); assert.equal(result.body.trading_ready, false); }
    else assert.match(result.body, /Saved data is temporarily unavailable/);
    assert.equal(h.activity.engineQueues, 0); assert.equal(h.activity.writes, 0);
  });
  await check(kind + " unknown internal error is safe HTTP 500", async () => {
    const h = harness(); const error = Object.assign(new Error(fixtureRawError + fixtureSecret), { status: 400, code: fixtureSecret, dependency: "upstox" });
    h.inject(kind, error); const result = await h[kind]();
    assert.equal(result.status, 500); safePublic(result.body);
    if (kind === "manual") { assert.equal(result.body.ok, false); assert.notEqual(result.body.dependency, "upstox"); }
    assert.equal(h.activity.engineQueues, 0); assert.equal(h.activity.writes, 0);
  });
}

for (const [name, query, expected] of [
  ["missing code", {}, "upstox_code_missing"],
  ["missing state", { code: "fixture-code" }, "upstox_state_missing"],
  ["bad state", { code: "fixture-code", state: "bad.signature" }, "upstox_state_invalid"]
]) {
  await check("OAuth callback " + name + " stays safe local HTTP 400", async () => {
    const h = harness(); const result = await h.callback(query);
    assert.equal(result.status, 400); safePublic(result.body); assert.match(result.body, new RegExp(expected));
    assert.equal(h.activity.fetches, 0); assert.equal(h.activity.writes, 0); assert.equal(h.activity.engineQueues, 0);
  });
}

for (const [name, body] of [["missing token", {}], ["null body", null], ["array body", []], ["scalar body", 5],
  ["object token", { access_token: { secret: fixtureSecret } }], ["array token", { access_token: [fixtureSecret] }],
  ["numeric token", { access_token: 123 }], ["boolean token", { access_token: true }], ["blank token", { access_token: "  " }]]) {
  await check("Manual token rejects " + name + " as HTTP 400 without overwriting", async () => {
    const existing = { access_token: "fixture-old-credential", source: "manual_paste" };
    const h = harness({ stored: existing }); h.control.body = body;
    const result = await h.manual(); assert.equal(result.status, 400); safePublic(result.body);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.code, ["missing token", "blank token"].includes(name) ? "upstox_access_token_missing" : "upstox_token_invalid");
    assert.equal(h.activity.writes, 0); assert.equal(h.activity.engineQueues, 0);
    assert.equal(h.control.stored, existing);
  });
}

await check("Manual token method guard remains POST-only", async () => {
  const h = harness(); const result = await h.manual("GET");
  assert.equal(result.status, 405); assert.deepEqual(result.body.allowed, ["POST"]);
  assert.equal(h.activity.writes, 0); assert.equal(h.activity.engineQueues, 0);
});

await check("Manual malformed JSON stays safe HTTP 400 and never saves", async () => {
  const h = harness({ rawBody: '{"private":"' + fixtureRawError + fixtureSecret + '" broken' }); const result = await h.manual();
  assert.equal(result.status, 400); assert.equal(result.body.code, "invalid_json_body"); safePublic(result.body);
  assert.equal(h.activity.writes, 0); assert.equal(h.activity.engineQueues, 0);
});

for (const [name, fetch, status] of [
  ["timeout", () => new Promise(() => {}), 504],
  ["provider authorization rejection", () => response({ message: fixtureRawError }, 401), 502],
  ["provider rate limit", () => response({ message: fixtureRawError }, 429), 503]
]) {
  await check("Actual callback exchange " + name + " reaches the public safe " + status + " boundary", async () => {
    const h = harness({ fetch }); const result = await h.callback();
    assert.equal(result.status, status); safePublic(result.body);
    assert.equal(h.activity.fetches, 1); assert.equal(h.activity.writes, 0); assert.equal(h.activity.engineQueues, 0);
  });
}

for (const kind of ["callback", "manual"]) {
  await check(kind + " success persists once and schedules existing paper behavior only after save", async () => {
    const h = harness(); const result = await h[kind]();
    assert.equal(result.status, 200); safePublic(result.body);
    assert.equal(h.activity.writes, 1); assert.equal(h.activity.engineQueues, 1); assert.equal(h.activity.engineCalls, 0);
    assert.equal(h.control.stored.access_token, fixtureSecret);
  });
}

for (const source of ["storeConnectError", "storeReadError"]) {
  await check("Scanner upfront " + source + " is storage failure, not missing credential", async () => {
    const h = harness({ [source]: true }); const result = await h.scanner();
    const failure = result.error || result.value;
    assert.equal(failure.code, "storage_unavailable"); assert.equal(failure.dependency, "storage");
    assert.equal(failure.stage, "auth_read"); assert.equal(result.error ? failure.status : failure.http_status, 503);
    assert.equal(h.activity.fetches, 0); assert.equal(h.activity.normalization, 0); assert.equal(h.activity.writes, 0);
    assert.equal(h.activity.reads, source === "storeReadError" ? 1 : 0, "Error reporting cannot trigger another auth read");
  });
}

await check("Scanner missing credential remains a distinct local auth failure", async () => {
  const h = harness(); const result = await h.scanner(); const failure = result.error || result.value;
  assert.equal(failure.code, "upstox_token_missing"); assert.equal(failure.dependency, "upstox");
  assert.equal(h.activity.fetches, 0); assert.equal(h.activity.normalization, 0); assert.equal(h.activity.writes, 0);
  assert.equal(h.activity.reads, 1, "Missing-token status must describe the same single credential selection");
});

await check("Scanner available environment fallback survives stored-auth outage", async () => {
  const h = harness({ storeReadError: true, env: { UPSTOX_ACCESS_TOKEN: fixtureSecret } }); const result = await h.scanner();
  assert.equal(result.error, undefined); assert.equal(result.value.error, "instrument_key_missing");
  assert.equal(h.activity.normalization, 1); assert.equal(h.activity.fetches, 0); assert.equal(h.activity.writes, 0);
});

async function nativeStreamHarness() {
  const activeTimers = new Set(); const activity = { requests: 0, writes: 0, intervals: 0, cleared: 0, requestClosed: 0, responseClosed: 0, errors: [] };
  const control = { input: async () => ({ keys: ["NSE_EQ|INEFIXTURE001"], symbol: "FIXTURE" }), quote: async () => ({ asOf: "fixture", cache_hit: false, quotes: [], failures: [], safety: { paper_only: true } }) };
  const serverWork = new Set(); const sockets = new Set();
  const context = vm.createContext({
    ENV: {}, crypto, Buffer, URL, Date,
    setInterval: (callback) => { activity.intervals++; const timer = setInterval(callback, 15); activeTimers.add(timer); return timer; },
    clearInterval: (timer) => { activity.cleared++; activeTimers.delete(timer); clearInterval(timer); },
    fakeResolveInput: () => control.input(), fakeRuntimeStatus: async () => ({ token_visible: true, provider_auth_status: "not_checked" }),
    fakeQuotes: () => { activity.requests++; return control.quote(); }
  });
  vm.runInContext(UPSTOX_HTTP_FUNCTIONS + quoteFunctions + "\nresolveUpstoxQuoteInput = fakeResolveInput; upstoxRuntimeStatus = fakeRuntimeStatus; fetchUpstoxMarketQuotes = fakeQuotes;", context, { timeout: 1000 });
  const stream = vm.runInContext("streamUpstoxQuotes", context);
  const server = http.createServer((req, res) => {
    req.on("close", () => activity.requestClosed++); res.on("close", () => activity.responseClosed++);
    const write = res.write.bind(res); res.write = (...args) => { activity.writes++; return write(...args); };
    const task = stream(new URL(req.url, "http://fixture.invalid"), req, res).catch((error) => { activity.errors.push(error); res.destroy(); });
    serverWork.add(task); task.finally(() => serverWork.delete(task));
  });
  server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return {
    control, activity, activeTimers,
    async connect() {
      const chunks = []; const first = deferred();
      const req = http.get({ host: "127.0.0.1", port: server.address().port, path: "/api/upstox/quote-stream?symbol=FIXTURE", agent: false });
      req.on("error", () => {});
      req.on("response", (res) => { res.on("data", (chunk) => chunks.push(chunk.toString())); res.on("error", () => {}); first.resolve(res); });
      const res = await Promise.race([first.promise, delay(1500).then(() => { throw new Error("Native SSE did not return headers"); })]);
      return { req, res, chunks, close: () => { res.destroy(); req.destroy(); } };
    },
    async close() {
      for (const timer of activeTimers) clearInterval(timer); activeTimers.clear();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

if (process.argv.includes("--loopback")) {
  await check("Native HTTP SSE remains connected and prevents overlapping polls", async () => {
    const h = await nativeStreamHarness(); let client;
    try {
      const pending = deferred(); let cycle = 0;
      h.control.quote = () => ++cycle === 1 ? Promise.resolve({ asOf: "fixture", quotes: [], failures: [], safety: { paper_only: true } }) : pending.promise;
      client = await h.connect(); await delay(80);
      assert(client.chunks.join("").includes("event: status")); assert(client.chunks.join("").includes("event: quote"));
      assert.equal(h.activity.requests, 2, "One in-flight follow-up prevents overlapping interval requests");
      assert.equal(h.activeTimers.size, 1); assert.equal(h.activity.responseClosed, 0);
      client.close(); await delay(30); const writesBeforeLate = h.activity.writes;
      pending.resolve({ asOf: "late", quotes: [], failures: [], safety: {} }); await delay(30);
      assert.equal(h.activeTimers.size, 0); assert.equal(h.activity.writes, writesBeforeLate);
      assert.equal(h.activity.requests, 2); assert.equal(h.activity.responseClosed, 1); assert.deepEqual(h.activity.errors, []);
    } finally { client?.close(); await h.close(); }
  });
  await check("Native HTTP SSE disconnect during first quote creates no orphan interval", async () => {
    const h = await nativeStreamHarness(); let client;
    try {
      const pending = deferred(); h.control.quote = () => pending.promise;
      client = await h.connect(); await delay(15); assert.equal(h.activity.requests, 1);
      client.close(); await delay(30); const writesBeforeLate = h.activity.writes;
      pending.resolve({ asOf: "late", quotes: [], failures: [], safety: {} }); await delay(30);
      assert.equal(h.activeTimers.size, 0); assert.equal(h.activity.intervals, 0); assert.equal(h.activity.writes, writesBeforeLate);
      assert.equal(h.activity.requests, 1); assert.deepEqual(h.activity.errors, []);
    } finally { client?.close(); await h.close(); }
  });
} else console.log("SKIP native HTTP SSE loopback checks; run this guard with --loopback in a loopback-enabled environment.");

if (failures.length) {
  console.error(failures.length + " route guard groups failed; " + groups + " passed.");
  process.exitCode = 1;
} else console.log("Upstox route guard passed: " + groups + " groups; no real provider, credentials, storage, or orders.");
