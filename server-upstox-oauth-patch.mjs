import { UPSTOX_HTTP_FUNCTIONS } from "./lib/upstox-http.mjs";

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

function upstoxClientIdFingerprint() {
  const clientId = upstoxClientId();
  if (!clientId) return null;
  return crypto.createHash("sha256").update(clientId).digest("hex").slice(0, 12);
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

function upstoxTokenExpiryState(auth, now = Date.now()) {
  if (!String(auth?.access_token || "").trim()) return "missing";
  if (typeof auth.expires_at !== "string" || !Number.isFinite(now)) return "unknown";
  // Only explicit, calendar-valid ISO instants are expiry evidence. Date.parse
  // alone accepts numeric strings, normalizes impossible days and assumes a
  // local timezone for ambiguous timestamps. No JWT/daily-expiry inference.
  const value = auth.expires_at.trim();
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
  if (!parts) return "unknown";
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = parts;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
      || Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59
      || (zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) return "unknown";
  const expiresAt = Date.parse(value);
  if (!Number.isFinite(expiresAt)) return "unknown";
  return expiresAt <= now ? "expired" : "not_expired";
}

function upstoxAuthPublic(auth) {
  if (!auth?.access_token) return {
    token_visible: false,
    token_source: null,
    token_saved_at: null,
    token_expires_at: null,
    token_age_minutes: null,
    token_expiry_state: "missing",
    provider_auth_status: "not_checked",
    token_printed: false
  };
  const savedAtMs = Date.parse(auth.saved_at || "");
  return {
    token_visible: true,
    token_source: auth.source || "stored",
    token_saved_at: auth.saved_at || null,
    token_expires_at: auth.expires_at || null,
    token_expiry_state: upstoxTokenExpiryState(auth),
    provider_auth_status: "not_checked",
    token_age_minutes: Number.isFinite(savedAtMs) ? Math.max(0, Math.floor((Date.now() - savedAtMs) / 60000)) : null,
    token_type: auth.token_type || "Bearer",
    api_user_id: auth.api_user_id || null,
    token_printed: false
  };
}

async function resolveCurrentUpstoxAuth() {
  let stored = null;
  let storageStatus = "available";
  try {
    const store = await getStore();
    if (typeof store?.getUpstoxAuth !== "function") storageStatus = "unavailable";
    else stored = await store.getUpstoxAuth();
  } catch (_) {
    // Preserve the existing environment fallback without leaking storage
    // errors or claiming that an unreadable credential store is empty.
    storageStatus = "unavailable";
  }
  const storedToken = String(stored?.access_token || "").trim();
  const envToken = String(ENV.UPSTOX_ACCESS_TOKEN || "").trim();
  const storedExpiry = storageStatus === "unavailable" ? "unknown" : upstoxTokenExpiryState(stored);
  const base = {
    auth_storage_status: storageStatus,
    stored_token_expiry_state: storedExpiry,
    token_present: Boolean(storedToken || envToken) ? true : storageStatus === "available" ? false : null
  };
  if (storedToken && storedExpiry !== "expired") {
    return { ...base, auth: { ...stored, access_token: storedToken }, token_selection_reason: "stored_selected" };
  }
  // A known-expired credential must not be selected again via another source.
  if (envToken && !(storedExpiry === "expired" && envToken === storedToken)) {
    return {
      ...base,
      auth: { access_token: envToken, token_type: "Bearer", source: "render_env", saved_at: null, expires_at: null },
      token_selection_reason: storedExpiry === "expired" ? "stored_expired_environment_selected"
        : storageStatus === "unavailable" ? "storage_unavailable_environment_selected" : "environment_selected"
    };
  }
  return {
    ...base, auth: null,
    token_selection_reason: storedExpiry === "expired" ? "stored_expired_no_alternative"
      : storageStatus === "unavailable" ? "storage_unavailable_no_token" : "no_token"
  };
}

async function currentUpstoxAuth() {
  return (await resolveCurrentUpstoxAuth()).auth;
}

async function currentUpstoxAccessToken() {
  return (await currentUpstoxAuth())?.access_token || "";
}

async function upstoxRequestAuth(stage) {
  const selection = await resolveCurrentUpstoxAuth();
  if (selection.auth?.access_token) return selection;
  if (selection.auth_storage_status === "unavailable") {
    if (typeof runtimeStorageFailure === "function") throw runtimeStorageFailure("auth_read", null);
    const error = new Error("Saved provider credentials are temporarily unavailable.");
    Object.assign(error, { runtimeStorageFailure: true, code: "storage_unavailable", dependency: "storage",
      stage: "auth_read", retryable: true, status: 503 });
    throw error;
  }
  throw upstoxRequestFailure(stage, "upstox_token_missing");
}

async function saveUpstoxAuth(input) {
  const auth = sanitizeUpstoxAuth(input);
  const store = await getStore();
  if (!store.saveUpstoxAuth) throw new Error("upstox_token_store_missing");
  return store.saveUpstoxAuth(auth);
}

function upstoxResolvedRuntimeStatus({ auth, ...selection }, req = null) {
  return {
    ...upstoxStatus(),
    ...upstoxAuthPublic(auth),
    ...selection,
    oauth_configured: Boolean(upstoxClientId() && upstoxClientSecret()),
    api_key_visible: Boolean(upstoxClientId()),
    api_secret_visible: Boolean(upstoxClientSecret()),
    client_id_fingerprint: upstoxClientIdFingerprint(),
    authorization_endpoint: UPSTOX_AUTHORIZATION_URL,
    token_endpoint: UPSTOX_TOKEN_URL,
    callback_path: "/api/upstox/callback",
    callback_url: req ? upstoxRedirectUri(req) : (ENV.UPSTOX_REDIRECT_URI || null),
    callback_exact_match_required: true,
    paper_only: true,
    live_orders: false
  };
}

async function upstoxRuntimeStatus(req = null) {
  return upstoxResolvedRuntimeStatus(await resolveCurrentUpstoxAuth(), req);
}

function buildUpstoxAuthorizeUrl(req, options = {}) {
  const clientId = upstoxClientId();
  if (!clientId) throw new Error("upstox_api_key_missing");
  const url = new URL(UPSTOX_AUTHORIZATION_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", upstoxRedirectUri(req));
  if (options.includeState !== false) url.searchParams.set("state", createUpstoxOAuthState(req));
  const scope = String(ENV.UPSTOX_SCOPE || "").trim();
  if (scope) url.searchParams.set("scope", scope);
  return url.toString();
}

async function preflightUpstoxOAuthConfiguration(req) {
  if (ENV.UPSTOX_OAUTH_PREFLIGHT === "false") return { ok: true, skipped: true, reason: "disabled" };
  if (ENV.NODE_ENV === "test" && ENV.UPSTOX_OAUTH_PREFLIGHT !== "true") {
    return { ok: true, skipped: true, reason: "test" };
  }
  const callbackUrl = upstoxRedirectUri(req);
  try {
    const response = await upstoxFetchJson(buildUpstoxAuthorizeUrl(req, { includeState: false }), {
      method: "GET",
      redirect: "manual",
      headers: { accept: "text/html,application/json" }
    }, "oauth_preflight");
    const payload = response.payload || {};
    const upstream = payload?.errors?.[0] || {};
    const errorCode = String(upstream.errorCode || payload?.errorCode || "").trim();
    const message = String(upstream.message || payload?.message || "").trim();
    const configurationRejected = errorCode === "UDAPI100068"
      || (response.status === 401 && /client_id|redirect_uri/i.test(message));
    if (configurationRejected) {
      return {
        ok: false,
        status: response.status,
        error_code: errorCode === "UDAPI100068" ? errorCode : "UPSTOX_OAUTH_CONFIGURATION_REJECTED",
        message: "Upstox rejected the configured client_id and redirect_uri.",
        callback_url: callbackUrl,
        client_id_fingerprint: upstoxClientIdFingerprint()
      };
    }
    if (!response.ok && response.status >= 400) throw upstoxHttpFailure("oauth_preflight", response.status);
    return { ok: true, status: response.status };
  } catch (error) {
    const failure = upstoxRequestPayload(error);
    return { ok: true, warning: "preflight_unavailable", detail: failure.error,
      code: failure.code, dependency: failure.dependency, retryable: failure.retryable };
  }
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

  const response = await upstoxFetchJson(UPSTOX_TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: form
  }, "oauth_exchange");
  const payload = response.payload;
  if (payload.status && payload.status !== "success") throw upstoxRequestFailure("oauth_exchange", "upstox_invalid_response");
  const tokenPayload = payload.data && typeof payload.data === "object" ? payload.data : payload;
  // Validate provider fields before the legacy sanitizer can coerce objects or
  // scalars into strings and overwrite an otherwise usable saved credential.
  if (Array.isArray(tokenPayload) || typeof tokenPayload.access_token !== "string" || !tokenPayload.access_token.trim()
      || (tokenPayload.refresh_token != null && typeof tokenPayload.refresh_token !== "string")
      || (tokenPayload.token_type != null && (typeof tokenPayload.token_type !== "string"
        || (tokenPayload.token_type.trim() && !/^Bearer$/i.test(tokenPayload.token_type.trim()))))) {
    throw upstoxRequestFailure("oauth_exchange", "upstox_invalid_response");
  }
  const saved = await saveUpstoxAuth({ ...tokenPayload, source: "oauth", saved_at: new Date().toISOString() });
  return upstoxAuthPublic(saved);
}

async function handleUpstoxTokenPaste(req) {
  let body;
  try { body = await readJsonBody(req); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error("invalid_json_body");
    throw error;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("upstox_token_invalid");
  const rawToken = body.access_token ?? body.token ?? "";
  if (typeof rawToken !== "string") throw new Error("upstox_token_invalid");
  const accessToken = rawToken.trim();
  if (!accessToken) throw new Error("upstox_access_token_missing");
  const saved = await saveUpstoxAuth({
    access_token: accessToken,
    expires_in: body.expires_in,
    source: "manual_paste",
    saved_at: new Date().toISOString()
  });
  return upstoxAuthPublic(saved);
}

function upstoxRouteFailure(error) {
  if (error?.runtimeStorageFailure === true) return { status: 503, payload: upstoxRequestPayload(error) };
  if (error?.upstoxRequestFailure === true) {
    const safe = upstoxRequestFailure(error.stage, error.code, error.upstream_status);
    return { status: safe.status, payload: upstoxRequestPayload(safe) };
  }
  const validation = ["upstox_state_missing", "upstox_state_invalid", "upstox_state_expired", "upstox_code_missing",
    "upstox_api_key_missing", "upstox_api_secret_missing", "upstox_access_token_missing", "upstox_token_invalid", "invalid_json_body"];
  const code = validation.includes(error?.message) ? error.message : "upstox_operation_failed";
  return { status: code === "upstox_operation_failed" ? 500 : 400, payload: { ok: false, code,
    error: code === "upstox_operation_failed" ? "Upstox operation could not be completed. Please retry." : code,
    dependency: "application", retryable: code === "upstox_operation_failed", token_printed: false } };
}

function upstoxCallbackPage(result, error = "") {
  const ok = !error;
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\" />" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />" +
    "<title>ASH Stock Upstox</title><link rel=\"stylesheet\" href=\"/styles.css\" /></head>" +
    "<body><main class=\"server-required-screen\"><section class=\"server-required-panel login-panel\">" +
    "<div class=\"brand-mark\">AS</div><span class=\"eyebrow\">Upstox Token Renewal</span>" +
    "<h1>" + (ok ? "Token saved" : "Token failed") + "</h1>" +
    "<p>" + (ok ? "ASH Stock saved the renewed Upstox market-data token in MongoDB and queued the real-quote paper engine." : escapeHtml(error)) + "</p>" +
    (ok ? "<p class=\"positive\">Source: " + escapeHtml(result.token_source || "oauth") + "</p>" : "") +
    "<a class=\"primary-button\" href=\"/\">Return To ASH Stock</a>" +
    "</section></main></body></html>";
}
`;

const UPSTOX_PUBLIC_CALLBACK_ROUTE = String.raw`
      if (url.pathname === "/api/upstox/callback" && req.method === "GET") {
        try {
          const result = await exchangeUpstoxOAuthCode(req, url);
          const timer = setTimeout(() => runPaperEngineOnce("upstox-oauth").catch((error) => {
            console.error("Upstox OAuth paper-engine run failed:", error.message);
          }), 750);
          timer.unref?.();
          html(res, 200, upstoxCallbackPage(result));
        } catch (error) {
          const failure = upstoxRouteFailure(error);
          html(res, failure.status, upstoxCallbackPage(null, failure.payload.error));
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
        const callbackUrl = upstoxRedirectUri(req);
        const preflight = await preflightUpstoxOAuthConfiguration(req);
        if (!preflight.ok) {
          json(res, 409, {
            ok: false,
            error: "Upstox rejected the API key and callback pair (" + preflight.error_code + "). In Upstox Developer Apps, set the Redirect URI exactly to: " + callbackUrl,
            code: "upstox_oauth_configuration_rejected",
            upstream_error_code: preflight.error_code,
            upstream_message: preflight.message,
            callback_url: callbackUrl,
            client_id_fingerprint: preflight.client_id_fingerprint,
            token_printed: false
          });
          return;
        }
        const authorizeUrl = buildUpstoxAuthorizeUrl(req);
        json(res, 200, {
          ok: true,
          authorize_url: authorizeUrl,
          callback_url: callbackUrl,
          oauth_preflight: preflight,
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
          const timer = setTimeout(() => runPaperEngineOnce("upstox-token-paste").catch((error) => {
            console.error("Upstox token paper-engine run failed:", error.message);
          }), 750);
          timer.unref?.();
          json(res, 200, { ok: true, status, token_printed: false });
        } catch (error) {
          const failure = upstoxRouteFailure(error);
          json(res, failure.status, failure.payload);
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
    UPSTOX_HTTP_FUNCTIONS + UPSTOX_OAUTH_FUNCTIONS + '\nfunction dataBankSummary(state = defaultState()) {',
    "upstox oauth functions"
  );
  output = mustReplace(
    output,
    'async function fetchUpstoxCandles(instrumentKey, from, to) {\n  if (!ENV.UPSTOX_ACCESS_TOKEN) throw new Error("upstox_token_missing");\n  const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/day/${to}/${from}`;',
    'async function fetchUpstoxCandles(instrumentKey, from, to) {\n  const accessToken = await currentUpstoxAccessToken();\n  if (!accessToken) throw new Error("upstox_token_missing");\n  const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/day/${to}/${from}`;',
    "candles stored token"
  );
  output = output.replaceAll('authorization: `Bearer ${ENV.UPSTOX_ACCESS_TOKEN}`', 'authorization: `Bearer ${accessToken}`');
  const candlesStart = output.indexOf("async function fetchUpstoxCandles(");
  const candlesEnd = output.indexOf("\nasync function runUpstoxScanner(", candlesStart);
  if (candlesStart < 0 || candlesEnd < 0) throw new Error("Patch anchor missing: bounded Upstox candles");
  output = mustReplace(output, output.slice(candlesStart, candlesEnd), String.raw`async function fetchUpstoxCandles(instrumentKey, from, to) {
  const { auth } = await upstoxRequestAuth("candles");
  const url = "https://api.upstox.com/v2/historical-candle/" + encodeURIComponent(instrumentKey) + "/day/" + to + "/" + from;
  const response = await upstoxFetchJson(url, { headers: { accept: "application/json", authorization: "Bearer " + auth.access_token } }, "candles");
  const payload = response.payload;
  if (payload.status !== "success" || !Array.isArray(payload.data?.candles)) throw upstoxRequestFailure("candles", "upstox_invalid_response");
  return normalizeCandles(payload.data.candles);
}
`, "bounded Upstox candle headers/body");
  output = mustReplace(
    output,
    'async function runUpstoxScanner(body = {}, fallbackUniverse = null) {\n  if (!ENV.UPSTOX_ACCESS_TOKEN) return { ok: false, error: "upstox_token_missing", status: upstoxStatus() };',
    'async function runUpstoxScanner(body = {}, fallbackUniverse = null) {\n  try { await upstoxRequestAuth("candles"); }\n  catch (error) {\n    if (error?.runtimeStorageFailure === true) throw error;\n    return { ...upstoxRequestPayload(error), status: { token_visible: false, provider_auth_status: "not_checked", token_printed: false } };\n  }',
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
