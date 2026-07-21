const UPSTOX_OAUTH_FUNCTIONS = String.raw`
const UPSTOX_AUTHORIZATION_URL = "https://api.upstox.com/v2/login/authorization/dialog";
const UPSTOX_TOKEN_URL = "https://api.upstox.com/v2/login/authorization/token";
const UPSTOX_AUTH_STATE_TTL_MS = 10 * 60 * 1000;

function upstoxClientId() {
  return String(ENV.UPSTOX_API_KEY || ENV.UPSTOX_CLIENT_ID || "").trim();
}

function upstoxClientSecret() {
  return String(ENV.UPSTOX_API_SECRET || ENV.UPSTOX_CLIENT_SECRET || "").trim();
}

function requestOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = forwardedProto || (ENV.NODE_ENV === "production" ? "https" : "http");
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || req.headers.host || "localhost";
  return proto + "://" + host;
}

function upstoxRedirectUri(req) {
  return String(ENV.UPSTOX_REDIRECT_URI || "").trim() || requestOrigin(req) + "/api/upstox/callback";
}

function createUpstoxOAuthState(req) {
  const payload = Buffer.from(JSON.stringify({
    issued_at: Date.now(),
    origin: requestOrigin(req)
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return payload + "." + signature;
}

function verifyUpstoxOAuthState(value) {
  const text = String(value || "");
  const [payload, signature] = text.split(".");
  if (!payload || !signature) throw new Error("upstox_state_missing");
  const expected = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) throw new Error("upstox_state_invalid");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("upstox_state_invalid");
  let parsed = {};
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("upstox_state_invalid");
  }
  const age = Date.now() - Number(parsed.issued_at);
  if (!Number.isFinite(age) || age < 0 || age > UPSTOX_AUTH_STATE_TTL_MS) throw new Error("upstox_state_expired");
  return parsed;
}

function sanitizeUpstoxAuth(input = {}) {
  const accessToken = String(input.access_token || input.accessToken || input.token || "").trim();
  if (!accessToken) throw new Error("upstox_access_token_missing");
  const savedAt = String(input.saved_at || input.savedAt || new Date().toISOString());
  const expiresIn = finiteOr(input.expires_in ?? input.expiresIn, 0);
  const expiresAt = input.expires_at || input.expiresAt || (expiresIn > 0 ? new Date(Date.parse(savedAt) + expiresIn * 1000).toISOString() : null);
  return {
    access_token: accessToken,
    refresh_token: String(input.refresh_token || input.refreshToken || "").trim(),
    token_type: String(input.token_type || input.tokenType || "Bearer").trim() || "Bearer",
    scope: String(input.scope || "").slice(0, 500),
    api_user_id: String(input.api_user_id || input.user_id || input.userId || "").slice(0, 120),
    source: String(input.source || "oauth").slice(0, 60),
    saved_at: savedAt,
    expires_at: expiresAt,
    raw_fields: Object.keys(input).filter((key) => !/token/i.test(key)).slice(0, 30)
  };
}

function upstoxAuthPublic(auth) {
  if (!auth?.access_token) return {
    token_visible: false,
    token_source: null,
    token_saved_at: null,
    token_expires_at: null,
    token_age_minutes: null,
    token_printed: false
  };
  const savedAtMs = Date.parse(auth.saved_at || "");
  return {
    token_visible: true,
    token_source: auth.source || "stored",
    token_saved_at: auth.saved_at || null,
    token_expires_at: auth.expires_at || null,
    token_age_minutes: Number.isFinite(savedAtMs) ? Math.max(0, Math.floor((Date.now() - savedAtMs) / 60000)) : null,
    token_type: auth.token_type || "Bearer",
    api_user_id: auth.api_user_id || null,
    token_printed: false
  };
}

async function currentUpstoxAuth() {
  try {
    const store = await getStore();
    const stored = store.getUpstoxAuth ? await store.getUpstoxAuth() : null;
    if (stored?.access_token) return stored;
  } catch (_) {}
  const envToken = String(ENV.UPSTOX_ACCESS_TOKEN || "").trim();
  if (!envToken) return null;
  return { access_token: envToken, token_type: "Bearer", source: "render_env", saved_at: null, expires_at: null };
}

async function currentUpstoxAccessToken() {
  return (await currentUpstoxAuth())?.access_token || "";
}

async function saveUpstoxAuth(input) {
  const auth = sanitizeUpstoxAuth(input);
  const store = await getStore();
  if (!store.saveUpstoxAuth) throw new Error("upstox_token_store_missing");
  return store.saveUpstoxAuth(auth);
}

async function upstoxRuntimeStatus(req = null) {
  const auth = await currentUpstoxAuth();
  return {
    ...upstoxStatus(),
    ...upstoxAuthPublic(auth),
    oauth_configured: Boolean(upstoxClientId() && upstoxClientSecret()),
    api_key_visible: Boolean(upstoxClientId()),
    api_secret_visible: Boolean(upstoxClientSecret()),
    authorization_endpoint: UPSTOX_AUTHORIZATION_URL,
    token_endpoint: UPSTOX_TOKEN_URL,
    callback_path: "/api/upstox/callback",
    callback_url: req ? upstoxRedirectUri(req) : (ENV.UPSTOX_REDIRECT_URI || null),
    paper_only: true,
    live_orders: false
  };
}

function buildUpstoxAuthorizeUrl(req) {
  const clientId = upstoxClientId();
  if (!clientId) throw new Error("upstox_api_key_missing");
  const url = new URL(UPSTOX_AUTHORIZATION_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", upstoxRedirectUri(req));
  url.searchParams.set("state", createUpstoxOAuthState(req));
  const scope = String(ENV.UPSTOX_SCOPE || "").trim();
  if (scope) url.searchParams.set("scope", scope);
  return url.toString();
}

async function exchangeUpstoxOAuthCode(req, url) {
  const code = String(url.searchParams.get("code") || "").trim();
  if (!code) throw new Error("upstox_code_missing");
  verifyUpstoxOAuthState(url.searchParams.get("state"));
  const clientId = upstoxClientId();
  const clientSecret = upstoxClientSecret();
  if (!clientId) throw new Error("upstox_api_key_missing");
  if (!clientSecret) throw new Error("upstox_api_secret_missing");

  const form = new URLSearchParams();
  form.set("code", code);
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("redirect_uri", upstoxRedirectUri(req));
  form.set("grant_type", "authorization_code");

  const response = await fetch(UPSTOX_TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: form
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) {
    const detail = payload?.errors?.[0]?.message || payload?.message || text.slice(0, 240) || response.statusText;
    throw new Error("upstox_token_exchange_failed_" + response.status + ": " + detail);
  }
  const tokenPayload = payload.data && typeof payload.data === "object" ? payload.data : payload;
  const saved = await saveUpstoxAuth({ ...tokenPayload, source: "oauth", saved_at: new Date().toISOString() });
  return upstoxAuthPublic(saved);
}

async function handleUpstoxTokenPaste(req) {
  const body = await readJsonBody(req);
  const accessToken = String(body.access_token || body.token || "").trim();
  if (!accessToken) throw new Error("upstox_access_token_missing");
  const saved = await saveUpstoxAuth({
    access_token: accessToken,
    expires_in: body.expires_in,
    source: "manual_paste",
    saved_at: new Date().toISOString()
  });
  return upstoxAuthPublic(saved);
}

function upstoxCallbackPage(result, error = "") {
  const ok = !error;
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\" />" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />" +
    "<title>ASH Stock Upstox</title><link rel=\"stylesheet\" href=\"/styles.css\" /></head>" +
    "<body><main class=\"server-required-screen\"><section class=\"server-required-panel login-panel\">" +
    "<div class=\"brand-mark\">AS</div><span class=\"eyebrow\">Upstox Token Renewal</span>" +
    "<h1>" + (ok ? "Token saved" : "Token failed") + "</h1>" +
    "<p>" + (ok ? "ASH Stock can now use the renewed Upstox market-data token from MongoDB." : escapeHtml(error)) + "</p>" +
    (ok ? "<p class=\"positive\">Source: " + escapeHtml(result.token_source || "oauth") + "</p>" : "") +
    "<a class=\"primary-button\" href=\"/\">Return To ASH Stock</a>" +
    "</section></main></body></html>";
}
`;

const UPSTOX_PUBLIC_CALLBACK_ROUTE = String.raw`
      if (url.pathname === "/api/upstox/callback" && req.method === "GET") {
        try {
          const result = await exchangeUpstoxOAuthCode(req, url);
          html(res, 200, upstoxCallbackPage(result));
        } catch (error) {
          html(res, 400, upstoxCallbackPage(null, error.message));
        }
        return;
      }

`;

const UPSTOX_AUTH_ROUTES = String.raw`
      if (url.pathname === "/api/upstox/oauth/start") {
        if (req.method !== "GET") {
          json(res, 405, { ok: false, error: "method_not_allowed", allowed: ["GET"] });
          return;
        }
        const authorizeUrl = buildUpstoxAuthorizeUrl(req);
        json(res, 200, {
          ok: true,
          authorize_url: authorizeUrl,
          callback_url: upstoxRedirectUri(req),
          status: await upstoxRuntimeStatus(req),
          token_printed: false
        });
        return;
      }

      if (url.pathname === "/api/upstox/token") {
        if (req.method !== "POST") {
          json(res, 405, { ok: false, error: "method_not_allowed", allowed: ["POST"] });
          return;
        }
        try {
          const status = await handleUpstoxTokenPaste(req);
          json(res, 200, { ok: true, status, token_printed: false });
        } catch (error) {
          json(res, 400, { ok: false, error: error.message, token_printed: false });
        }
        return;
      }

      if (url.pathname === "/api/upstox/status") {
        json(res, 200, { ok: true, status: await upstoxRuntimeStatus(req) });
        return;
      }
`;

export function applyUpstoxOAuthPatches(source, mustReplace) {
  let output = source;
  output = mustReplace(
    output,
    'const Q1_OUTPUT_DIR = path.join(ROOT, "data", "q1_outputs");',
    'const Q1_OUTPUT_DIR = path.join(ROOT, "data", "q1_outputs");\nconst UPSTOX_AUTH_FILE = path.join(ROOT, "data", "upstox_auth.json");',
    "upstox auth file"
  );
  output = mustReplace(
    output,
    '  let state = sanitizeState(defaultState());\n  let scanLedger = [];\n  return {',
    '  let state = sanitizeState(defaultState());\n  let scanLedger = [];\n  let upstoxAuth = null;\n  return {',
    "memory auth slot"
  );
  output = mustReplace(
    output,
    '    async listScanRecords(limit) {\n      return scanLedger.slice(0, normalizeLedgerLimit(limit));\n    }\n  };',
    '    async listScanRecords(limit) {\n      return scanLedger.slice(0, normalizeLedgerLimit(limit));\n    },\n    async getUpstoxAuth() {\n      return upstoxAuth;\n    },\n    async saveUpstoxAuth(nextAuth) {\n      upstoxAuth = sanitizeUpstoxAuth(nextAuth);\n      return upstoxAuth;\n    }\n  };',
    "memory auth methods"
  );
  output = mustReplace(
    output,
    '  let state = await readState();\n  await writeState(state);\n  return {',
    '  async function readUpstoxAuth() {\n    try {\n      const payload = JSON.parse(await fsp.readFile(UPSTOX_AUTH_FILE, "utf8"));\n      return payload?.auth ? sanitizeUpstoxAuth(payload.auth) : null;\n    } catch (error) {\n      if (error.code === "ENOENT") return null;\n      throw error;\n    }\n  }\n\n  async function writeUpstoxAuth(auth) {\n    const payload = JSON.stringify({ auth, updatedAt: new Date().toISOString() }, null, 2);\n    const temp = `${UPSTOX_AUTH_FILE}.${runtimeProcess?.pid || Date.now()}.tmp`;\n    await fsp.mkdir(path.dirname(UPSTOX_AUTH_FILE), { recursive: true });\n    await fsp.writeFile(temp, payload);\n    await fsp.rename(temp, UPSTOX_AUTH_FILE);\n  }\n\n  let state = await readState();\n  await writeState(state);\n  return {',
    "file auth helpers"
  );
  output = mustReplace(
    output,
    '    async listScanRecords(limit) {\n      return readLedger(limit);\n    }\n  };',
    '    async listScanRecords(limit) {\n      return readLedger(limit);\n    },\n    async getUpstoxAuth() {\n      return readUpstoxAuth();\n    },\n    async saveUpstoxAuth(nextAuth) {\n      const auth = sanitizeUpstoxAuth(nextAuth);\n      await writeUpstoxAuth(auth);\n      return auth;\n    }\n  };',
    "file auth methods"
  );
  output = mustReplace(
    output,
    '      const scanLedger = database.collection("scan_ledger");\n      await withTimeout(collection.createIndex({ updatedAt: -1 }), timeoutMs + 2_000, `MongoDB setup timed out after ${timeoutMs}ms`);',
    '      const scanLedger = database.collection("scan_ledger");\n      const upstoxAuth = database.collection("upstox_auth");\n      await withTimeout(collection.createIndex({ updatedAt: -1 }), timeoutMs + 2_000, `MongoDB setup timed out after ${timeoutMs}ms`);',
    "mongo auth collection"
  );
  output = mustReplace(
    output,
    '      await withTimeout(scanLedger.createIndex({ createdAt: -1 }), timeoutMs + 2_000, `MongoDB scan ledger setup timed out after ${timeoutMs}ms`);',
    '      await withTimeout(scanLedger.createIndex({ createdAt: -1 }), timeoutMs + 2_000, `MongoDB scan ledger setup timed out after ${timeoutMs}ms`);\n      await withTimeout(upstoxAuth.createIndex({ updatedAt: -1 }), timeoutMs + 2_000, `MongoDB Upstox auth setup timed out after ${timeoutMs}ms`);',
    "mongo auth index"
  );
  output = mustReplace(
    output,
    '        async listScanRecords(limit) {\n          const docs = await scanLedger\n            .find({})\n            .sort({ createdAt: -1 })\n            .limit(normalizeLedgerLimit(limit))\n            .toArray();\n          return docs.map((doc) => {\n            const { _id, createdAtDate, ...record } = doc;\n            return sanitizeScanRecord(record);\n          });\n        }\n      };',
    '        async listScanRecords(limit) {\n          const docs = await scanLedger\n            .find({})\n            .sort({ createdAt: -1 })\n            .limit(normalizeLedgerLimit(limit))\n            .toArray();\n          return docs.map((doc) => {\n            const { _id, createdAtDate, ...record } = doc;\n            return sanitizeScanRecord(record);\n          });\n        },\n        async getUpstoxAuth() {\n          const doc = await upstoxAuth.findOne({ _id: "default" });\n          return doc?.auth ? sanitizeUpstoxAuth(doc.auth) : null;\n        },\n        async saveUpstoxAuth(nextAuth) {\n          const auth = sanitizeUpstoxAuth(nextAuth);\n          await upstoxAuth.updateOne(\n            { _id: "default" },\n            { $set: { auth, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },\n            { upsert: true }\n          );\n          return auth;\n        }\n      };',
    "mongo auth methods"
  );
  output = mustReplace(
    output,
    '\nfunction dataBankSummary(state = defaultState()) {',
    UPSTOX_OAUTH_FUNCTIONS + '\nfunction dataBankSummary(state = defaultState()) {',
    "upstox oauth functions"
  );
  output = mustReplace(
    output,
    'async function fetchUpstoxCandles(instrumentKey, from, to) {\n  if (!ENV.UPSTOX_ACCESS_TOKEN) throw new Error("upstox_token_missing");\n  const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/day/${to}/${from}`;',
    'async function fetchUpstoxCandles(instrumentKey, from, to) {\n  const accessToken = await currentUpstoxAccessToken();\n  if (!accessToken) throw new Error("upstox_token_missing");\n  const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/day/${to}/${from}`;',
    "candles stored token"
  );
  output = output.replaceAll('authorization: `Bearer ${ENV.UPSTOX_ACCESS_TOKEN}`', 'authorization: `Bearer ${accessToken}`');
  output = mustReplace(
    output,
    'async function runUpstoxScanner(body = {}, fallbackUniverse = null) {\n  if (!ENV.UPSTOX_ACCESS_TOKEN) return { ok: false, error: "upstox_token_missing", status: upstoxStatus() };',
    'async function runUpstoxScanner(body = {}, fallbackUniverse = null) {\n  if (!(await currentUpstoxAccessToken())) return { ok: false, error: "upstox_token_missing", status: await upstoxRuntimeStatus() };',
    "scanner stored token"
  );
  output = mustReplace(
    output,
    '  if (!ENV.UPSTOX_ACCESS_TOKEN) return { ok: false, error: "upstox_token_missing" };',
    '  const accessToken = await currentUpstoxAccessToken();\n  if (!accessToken) return { ok: false, error: "upstox_token_missing" };',
    "q1 stored token check"
  );
  output = mustReplace(
    output,
    '  const childEnv = { ...readEnv(), UPSTOX_ACCESS_TOKEN: ENV.UPSTOX_ACCESS_TOKEN };',
    '  const childEnv = { ...readEnv(), UPSTOX_ACCESS_TOKEN: accessToken };',
    "q1 child token"
  );
  output = mustReplace(
    output,
    '      const token = ENV.UPSTOX_ACCESS_TOKEN || "";',
    '      const token = accessToken || "";',
    "q1 token redaction"
  );
  output = mustReplace(
    output,
    '      if (!isAuthenticated(req)) {',
    UPSTOX_PUBLIC_CALLBACK_ROUTE + '      if (!isAuthenticated(req)) {',
    "public upstox callback"
  );
  output = mustReplace(
    output,
    '      if (url.pathname === "/api/upstox/status") {\n        json(res, 200, { ok: true, status: upstoxStatus() });\n        return;\n      }',
    UPSTOX_AUTH_ROUTES.trimEnd(),
    "upstox oauth routes"
  );
  return output;
}
