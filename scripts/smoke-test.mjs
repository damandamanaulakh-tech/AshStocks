import { createServer, normalizeMongoUri } from "../server.js";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.SMOKE_PORT || 5199);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const Q1_INPUTS = [
  path.join(ROOT, "data", "q1_inputs", "fii_symbol_daily.csv"),
  path.join(ROOT, "data", "q1_inputs", "Q1_FII_20D_ranked_top_bottom_deciles_READY_FOR_PRICE_JOIN.csv")
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    ...options
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { response, body };
}

function multipartBody(files) {
  const boundary = `----ash-stock-smoke-${Date.now()}`;
  let body = "";
  for (const file of files) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${file.name}"; filename="${file.name}"\r\n`;
    body += "Content-Type: text/csv\r\n\r\n";
    body += file.content;
    body += "\r\n";
  }
  body += `--${boundary}--\r\n`;
  return {
    body,
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` }
  };
}

async function runProductionMongoHealthGuard() {
  const script = `
process.env.NODE_ENV = "production";
process.env.REQUIRE_AUTH = "true";
process.env.REQUIRE_DB = "true";
process.env.APP_PASSWORD = "smoke-password";
process.env.APP_SESSION_SECRET = "smoke-session";
process.env.MONGODB_URI = "mongodb://192.0.2.1:27017/ashstock";
process.env.MONGO_TIMEOUT_MS = "500";
const { createServer } = await import("./server.js");
const server = createServer();
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const port = server.address().port;
const started = Date.now();
let result;
try {
  const healthResponse = await fetch("http://127.0.0.1:" + port + "/api/health");
  const readyResponse = await fetch("http://127.0.0.1:" + port + "/api/ready");
  result = {
    healthStatus: healthResponse.status,
    healthBody: await healthResponse.json(),
    readyStatus: readyResponse.status,
    readyBody: await readyResponse.json(),
    elapsedMs: Date.now() - started
  };
} finally {
  await new Promise((resolve) => server.close(resolve));
}
if (result.healthStatus !== 200) throw new Error("production health should stay live");
if (result.healthBody.ok !== true) throw new Error("production health should report ok=true");
if (result.readyStatus !== 503) throw new Error("production Mongo readiness guard should return 503");
if (result.readyBody.ok !== false) throw new Error("production Mongo readiness guard should report ok=false");
if (result.elapsedMs > 6000) throw new Error("production Mongo readiness guard took too long");
console.log(JSON.stringify(result));
`;

  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      cwd: ROOT,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: null, stdout, stderr, timedOut: true });
    }, 10_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut: false });
    });
  });

  assert(!result.timedOut, "production Mongo readiness guard should not hang");
  assert(result.code === 0, result.stderr || result.stdout || "production Mongo readiness guard failed");
}

async function main() {
  assert(
    normalizeMongoUri("mongodb+srv://user:pass@example.mongodb.net:27017/ashstock?retryWrites=true") ===
      "mongodb+srv://user:pass@example.mongodb.net/ashstock?retryWrites=true",
    "mongodb+srv URIs must not keep port numbers"
  );
  assert(
    normalizeMongoUri(" mongodb+srv://user:p@ss@example.mongodb.net:27017/ashstock ") ===
      "mongodb+srv://user:p@ss@example.mongodb.net/ashstock",
    "mongodb+srv URI cleanup should tolerate whitespace and @ in credentials"
  );
  assert(
    normalizeMongoUri("mongodb+srv://user:pass@host-a.example.net:27017,host-b.example.net:27017/ashstock") ===
      "mongodb://user:pass@host-a.example.net:27017,host-b.example.net:27017/ashstock",
    "multi-host seed lists must use the standard mongodb scheme"
  );
  assert(
    normalizeMongoUri("mongodb+srv://example.mongodb.net%3A27017/ashstock") ===
      "mongodb+srv://example.mongodb.net/ashstock",
    "encoded mongodb+srv ports must be stripped from hostnames"
  );
  assert(
    normalizeMongoUri("mongodb+srv://user:p?ss/w@rd@example.mongodb.net:27017/ashstock") ===
      "mongodb+srv://user:p?ss/w@rd@example.mongodb.net/ashstock",
    "mongodb+srv host cleanup must find the host after credentials"
  );
  await runProductionMongoHealthGuard();

  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", resolve);
  });

  try {
    const health = await request("/api/health");
    assert(health.response.status === 200, "health should be 200 in local smoke");
    assert(health.body.ok === true, "health body should be ok");

    const state = await request("/api/state");
    assert(state.response.status === 200, "state should be readable");
    assert(Array.isArray(state.body.state.watchlist), "state should include watchlist");

    const q1Status = await request("/api/q1/status");
    assert(q1Status.response.status === 200, "q1 status should be readable");
    assert(q1Status.body.status.safety.live_orders === false, "q1 must not expose live orders");

    const upload = multipartBody([
      {
        name: "fii_symbol_daily.csv",
        content: "symbol,instrument_key\nABC,NSE_EQ|INE000000001\n"
      },
      {
        name: "Q1_FII_20D_ranked_top_bottom_deciles_READY_FOR_PRICE_JOIN.csv",
        content: "symbol,signal_date,bucket\nABC,2024-01-02,top\n"
      }
    ]);
    const uploadResult = await request("/api/q1/upload", {
      method: "POST",
      headers: upload.headers,
      body: upload.body
    });
    assert(uploadResult.response.status === 200, "q1 upload should accept required csv files");
    assert(uploadResult.body.status.input_files_found === true, "q1 upload should mark inputs found");

    const runGuard = await request("/api/q1/run-upstox-fetch", { method: "POST" });
    assert(runGuard.response.status === 409, "q1 run should be blocked outside Render");
    assert(runGuard.body.error === "render_only_endpoint", "q1 run guard should be render_only_endpoint");

    console.log(JSON.stringify({ ok: true, checks: ["mongo-readiness-timeout", "health", "state", "q1-status", "q1-upload", "q1-render-guard"] }));
  } finally {
    await Promise.all(Q1_INPUTS.map((file) => fs.unlink(file).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    })));
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
});
