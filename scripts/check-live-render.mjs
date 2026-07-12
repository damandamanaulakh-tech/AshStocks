const DEFAULT_URL = "https://ashstocks-api.onrender.com";
const LIVE_URL = String(process.env.LIVE_RENDER_URL || DEFAULT_URL).replace(/\/+$/, "");
const RETRY_COUNT = Number(process.env.LIVE_RETRY_COUNT || 30);
const RETRY_DELAY_MS = Number(process.env.LIVE_RETRY_DELAY_MS || 20_000);
const REQUEST_TIMEOUT_MS = Number(process.env.LIVE_REQUEST_TIMEOUT_MS || 20_000);
const EXPECTED_RELEASE = "2026-07-12-india-scanner";
const EXPECTED_PROVIDER = "AshStocks India Scanner";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${LIVE_URL}${path}`, { signal: controller.signal });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${path} returned non-JSON ${response.status}: ${text.slice(0, 160)}`);
    }
    if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body).slice(0, 240)}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function tryCheck() {
  const health = await fetchJson("/api/health");
  assert(health.ok === true, "health ok must be true");
  assert(health.provider === EXPECTED_PROVIDER, `health provider must be ${EXPECTED_PROVIDER}`);
  assert(health.release === EXPECTED_RELEASE, `health release must be ${EXPECTED_RELEASE}`);
  assert(health.ready === true, "health ready must be true");
  assert(health.upstox?.historical_candles_only === true, "health must expose historical-candle-only Upstox mode");
  assert(health.upstox?.live_orders === false, "health must not expose live orders");

  const ready = await fetchJson("/api/ready");
  assert(ready.ok === true, "ready ok must be true");
  assert(ready.provider === EXPECTED_PROVIDER, `ready provider must be ${EXPECTED_PROVIDER}`);
  assert(["mongodb", "file"].includes(ready.storage), "ready storage must be mongodb or file fallback");
  assert(ready.persistent === true, "ready storage must be persistent");
  assert(ready.auth?.configured === true, "Render APP_PASSWORD must be configured");
  assert(ready.upstox?.key_visible === true, "UPSTOX_API_KEY must be visible to Render");
  assert(ready.upstox?.token_visible === true, "UPSTOX_ACCESS_TOKEN must be visible to Render");

  return {
    ok: true,
    liveUrl: LIVE_URL,
    release: health.release,
    commit: health.commit,
    storage: ready.storage,
    upstox: ready.upstox
  };
}

async function main() {
  let lastError;
  for (let attempt = 1; attempt <= RETRY_COUNT; attempt += 1) {
    try {
      const result = await tryCheck();
      console.log(JSON.stringify(result, null, 2));
      return;
    } catch (error) {
      lastError = error;
      console.log(JSON.stringify({ ok: false, attempt, liveUrl: LIVE_URL, error: error.message }));
      if (attempt < RETRY_COUNT) await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastError || new Error("live Render verification failed");
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, liveUrl: LIVE_URL, error: error.message }));
  process.exitCode = 1;
});
