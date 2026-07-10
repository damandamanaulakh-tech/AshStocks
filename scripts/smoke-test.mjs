import { createServer } from "../server.js";
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

async function main() {
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

    console.log(JSON.stringify({ ok: true, checks: ["health", "state", "q1-status", "q1-upload", "q1-render-guard"] }));
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
