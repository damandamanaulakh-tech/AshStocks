import { pathToFileURL } from "node:url";

const DEFAULT_URL = "https://ashstocks.onrender.com";
const EXPECTED_RELEASE = "2026-07-12-india-scanner";
const EXPECTED_PROVIDER = "AshStocks India Scanner";
const EXPECTED_ENGINE = "ashstocks-selection-v0.1-proof";
const FULL_COMMIT = /^[0-9a-f]{40}$/i;

class VerificationError extends Error {}

function assert(condition, message) {
  if (!condition) throw new VerificationError(message);
}

function integerSetting(env, name, fallback, minimum, maximum) {
  const value = env[name] === undefined ? String(fallback) : env[name];
  assert(typeof value === "string" && /^[0-9]{1,8}$/.test(value), name + " must be a bounded integer");
  const number = Number(value);
  assert(Number.isSafeInteger(number) && number >= minimum && number <= maximum,
    name + " must be between " + minimum + " and " + maximum);
  return number;
}

export function buildLiveConfig(env = process.env) {
  // Validate the caller's exact release intent BEFORE any request, including health.
  const expectedCommit = env.LIVE_EXPECTED_COMMIT;
  assert(typeof expectedCommit === "string" && FULL_COMMIT.test(expectedCommit),
    "LIVE_EXPECTED_COMMIT is required and must be a full 40-character Git SHA");
  let origin;
  try {
    const rawUrl = env.LIVE_RENDER_URL === undefined ? DEFAULT_URL : env.LIVE_RENDER_URL;
    assert(typeof rawUrl === "string" && rawUrl.length <= 2048 && !/[\s\x00-\x1f\x7f]/.test(rawUrl), "invalid URL");
    const url = new URL(rawUrl);
    assert(url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      && url.pathname.replaceAll("/", "") === "", "invalid URL");
    origin = url.origin;
  } catch {
    throw new VerificationError("LIVE_RENDER_URL must be an HTTPS origin without credentials, path, query or fragment");
  }
  return Object.freeze({
    origin,
    expectedCommit: expectedCommit.toLowerCase(),
    retryCount: integerSetting(env, "LIVE_RETRY_COUNT", 30, 1, 30),
    retryDelayMs: integerSetting(env, "LIVE_RETRY_DELAY_MS", 20_000, 0, 30_000),
    requestTimeoutMs: integerSetting(env, "LIVE_REQUEST_TIMEOUT_MS", 20_000, 1, 30_000),
    maxResponseBytes: integerSetting(env, "LIVE_MAX_RESPONSE_BYTES", 262_144, 128, 1_048_576)
  });
}

function safeError(error) {
  return error instanceof VerificationError ? error.message : "live Render verification failed";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(path, config, fetchImpl) {
  const controller = new AbortController();
  let reader;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new VerificationError(path + " request timed out"));
      controller.abort();
    }, config.requestTimeoutMs);
  });
  const request = (async () => {
    let response;
    try {
      response = await fetchImpl(config.origin + path, {
        method: "GET", signal: controller.signal, redirect: "error",
        headers: { accept: "application/json" }, cache: "no-store"
      });
    } catch {
      throw new VerificationError(path + " request failed");
    }
    assert(!controller.signal.aborted, path + " request timed out");
    assert(response && !response.redirected && !(response.status >= 300 && response.status < 400),
      path + " redirect refused");
    if (response.url) {
      let exactUrl = false;
      try { exactUrl = new URL(response.url).href === config.origin + path; } catch {}
      assert(exactUrl, path + " response URL mismatch");
    }
    assert(Number.isInteger(response.status) && response.status >= 200 && response.status < 300 && response.ok === true,
      path + " returned an unsuccessful HTTP status");
    const declared = response.headers?.get("content-length");
    assert(declared == null || (/^[0-9]{1,10}$/.test(declared) && Number(declared) <= config.maxResponseBytes),
      path + " response exceeds byte limit");
    assert(response.body && typeof response.body.getReader === "function", path + " has no readable JSON body");
    reader = response.body.getReader();
    let total = 0;
    const bytes = new Uint8Array(config.maxResponseBytes);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      assert(value instanceof Uint8Array && value.byteLength > 0, path + " returned an invalid response stream");
      assert(total + value.byteLength <= config.maxResponseBytes, path + " response exceeds byte limit");
      bytes.set(value, total);
      total += value.byteLength;
    }
    let body;
    try {
      body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, total)));
    } catch {
      throw new VerificationError(path + " returned invalid UTF-8 JSON");
    }
    assert(body !== null && typeof body === "object" && !Array.isArray(body), path + " returned a non-object JSON body");
    return body;
  })();
  try {
    return await Promise.race([request, timeout]);
  } catch (error) {
    // Native fetch/stream errors can include URLs, credentials and response data.
    throw new VerificationError(error instanceof VerificationError ? error.message : path + " request failed");
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
  }
}

function assertCommit(commit, expectedCommit, label) {
  assert(typeof commit === "string" && FULL_COMMIT.test(commit), label + " commit must be a full 40-character Git SHA");
  assert(commit.toLowerCase() === expectedCommit.toLowerCase(), label + " commit does not match LIVE_EXPECTED_COMMIT");
}

export function assertLiveHealth(health, expectedCommit) {
  assert(typeof expectedCommit === "string" && FULL_COMMIT.test(expectedCommit), "expected commit is invalid");
  assert(health !== null && typeof health === "object" && !Array.isArray(health), "health must be an object");
  assertCommit(health.commit, expectedCommit, "health");
  assert(health.ok === true, "health ok must be true");
  assert(health.provider === EXPECTED_PROVIDER, "health provider must be " + EXPECTED_PROVIDER);
  assert(health.release === EXPECTED_RELEASE, "health release must be " + EXPECTED_RELEASE);
  assert(health.engine === EXPECTED_ENGINE, "health engine must be " + EXPECTED_ENGINE);
  assert(health.ready === null, "liveness must not claim unchecked readiness");
  assert(health.readiness_endpoint === "/api/ready", "health must direct readiness checks to /api/ready");
  assert(health.upstox?.historical_candles_only === false, "health must expose multi-feed Upstox mode");
  assert(health.upstox?.live_quotes_enabled === true, "health must expose live Upstox quotes");
  assert(health.upstox?.institutional_analytics_enabled === true, "health must expose Upstox institutional analytics");
  assert(health.upstox?.live_orders === false, "health must not expose live orders");
}

function assertReadiness(ready, expectedCommit) {
  assertCommit(ready.commit, expectedCommit, "ready");
  assert(ready.ok === true, "ready ok must be true");
  assert(ready.provider === EXPECTED_PROVIDER, "ready provider must be " + EXPECTED_PROVIDER);
  assert(ready.engine === EXPECTED_ENGINE, "ready engine must be " + EXPECTED_ENGINE);
  assert(ready.storage === "mongodb", "ready storage must be durable MongoDB");
  assert(ready.persistent === true, "ready storage must be persistent");
  assert(ready.auth?.configured === true, "Render APP_PASSWORD must be configured");
  assert(ready.upstox?.key_visible === true, "UPSTOX_API_KEY must be visible to Render");
  assert(ready.upstox?.token_visible === true, "UPSTOX_ACCESS_TOKEN must be visible to Render");
}

async function checkOnce(config, fetchImpl) {
  const health = await fetchJson("/api/health", config, fetchImpl);
  assertLiveHealth(health, config.expectedCommit);
  // Readiness may initialize or persist state. Skip it when the preceding health
  // reports another release; readiness must separately identify its responding release.
  const ready = await fetchJson("/api/ready", config, fetchImpl);
  assertReadiness(ready, config.expectedCommit);
  const finalHealth = await fetchJson("/api/health", config, fetchImpl);
  assertLiveHealth(finalHealth, config.expectedCommit);
  return {
    ok: true, expectedCommit: config.expectedCommit, commit: finalHealth.commit.toLowerCase(),
    release: EXPECTED_RELEASE, engine: EXPECTED_ENGINE, storage: "mongodb", persistent: true,
    commitCheckedBeforeDuringAndAfterReadiness: true,
    upstox: { key_visible: true, token_visible: true, live_orders: false }
  };
}

export async function runLiveVerification({ env = process.env, fetchImpl = globalThis.fetch,
  sleepImpl = sleep, onAttempt = () => {} } = {}) {
  const config = buildLiveConfig(env);
  assert(typeof fetchImpl === "function", "fetch is unavailable");
  let lastError;
  for (let attempt = 1; attempt <= config.retryCount; attempt += 1) {
    try {
      return await checkOnce(config, fetchImpl);
    } catch (error) {
      lastError = new VerificationError(safeError(error));
      onAttempt({ ok: false, attempt, error: lastError.message });
      if (attempt < config.retryCount) await sleepImpl(config.retryDelayMs);
    }
  }
  throw lastError;
}

async function main() {
  try {
    const result = await runLiveVerification({ onAttempt: (event) => console.log(JSON.stringify(event)) });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: safeError(error) }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
