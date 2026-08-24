import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const revision = "37a9e9ceacabd33bc5a2085ad621e368f8fc0cd8";
const relativeBaseFile = `vendor/base-server-${revision}.mjs`;
const expectedSha256 = "156db2e19447e47c5b642a66f6b74f4809763d386d6cc40430b3dd98d264f324";
const failures = [];

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${relativePath}: missing file`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function mustInclude(source, text, reason) {
  if (!source.includes(text)) failures.push(reason);
}

const baseSource = read(relativeBaseFile);
const actualSha256 = crypto.createHash("sha256").update(baseSource).digest("hex");
if (actualSha256 !== expectedSha256) {
  failures.push(`${relativeBaseFile}: expected sha256 ${expectedSha256}, received ${actualSha256}`);
}

const serverSource = read("server.js");
mustInclude(serverSource, relativeBaseFile.replaceAll("\\", "/"), "server.js: bundled base path is not wired");
mustInclude(serverSource, expectedSha256, "server.js: bundled base sha256 is not wired");
mustInclude(serverSource, 'readFile(BASE_SERVER_FILE, "utf8")', "server.js: bundled base is not read locally");
mustInclude(serverSource, 'ENV.ALLOW_EPHEMERAL_FILE_STORE === "true"', "server.js: production file fallback is not explicitly gated");
mustInclude(serverSource, 'persistent: ENV.NODE_ENV !== "production"', "server.js: production filesystem is still labeled durable");
mustInclude(serverSource, 'error: "durable_mongodb_required"', "server.js: readiness does not require durable MongoDB");
mustInclude(serverSource, 'readiness_endpoint: "/api/ready"', "server.js: liveness does not direct checked readiness");

const renderSource = read("render.yaml");
mustInclude(renderSource, "healthCheckPath: /api/ready", "render.yaml: health check must use /api/ready");
mustInclude(renderSource, "DISABLE_FILE_STORE_FALLBACK", "render.yaml: production file fallback must be disabled");

const wakeSource = read(".github/workflows/ashstocks-market-hours.yml");
mustInclude(wakeSource, "https://ashstocks.onrender.com/api/ready", "market-hours workflow must probe durable readiness");

const liveCheckSource = read("scripts/check-live-render.mjs");
mustInclude(liveCheckSource, 'ready.storage === "mongodb"', "live verification must require MongoDB");
mustInclude(liveCheckSource, 'health.ready === null', "live verification must reject unchecked liveness readiness");

for (const forbidden of ["raw.githubusercontent.com", "BASE_SERVER_URL", "fetch(BASE_SERVER"]) {
  if (serverSource.includes(forbidden)) failures.push(`server.js: forbidden remote bootstrap remains: ${forbidden}`);
}

const patches = [
  ["server-quality-patch.mjs", "applyAdvancedScannerPatches"],
  ["server-selection-patch.mjs", "applySelectionFlowPatches"],
  ["server-candle-pattern-patch.mjs", "applyCandlePatternPatches"],
  ["server-pre-rise-pattern-patch.mjs", "applyPreRisePatternPatches"],
  ["server-framework-patch.mjs", "applyFrameworkPatches"],
  ["server-paper-trader-patch.mjs", "applyPaperTraderPatches"],
  ["server-paper-order-lifecycle-patch.mjs", "applyPaperOrderLifecyclePatches"],
  ["server-paper-engine-autobuy-patch.mjs", "applyPaperEngineAutoBuyPatches"],
  ["server-advisor-engine-patch.mjs", "applyAdvisorEnginePatches"],
  ["server-market-context-patch.mjs", "applyMarketContextPatches"],
  ["server-competitive-framework-patch.mjs", "applyCompetitiveFrameworkPatches"],
  ["server-data-intelligence-patch.mjs", "applyDataIntelligencePatches"],
  ["server-intelligence-score-patch.mjs", "applyIntelligenceScorePatches"],
  ["server-upstox-oauth-patch.mjs", "applyUpstoxOAuthPatches"],
  ["server-upstox-quote-patch.mjs", "applyUpstoxQuotePatches"],
  ["server-suspended-empty-patch.mjs", "applySuspendedEmptyScanPatch"],
  ["server-parameter-tunnel-patch.mjs", "applyParameterTunnelPatches"],
  ["server-stock-selection-patch.mjs", "applyStockSelectionPatches"]
];

let previousPatchIndex = -1;
for (const [patchFile, applyFunction] of patches) {
  read(patchFile);
  mustInclude(serverSource, `from "./${patchFile}"`, `server.js: missing ${patchFile} import`);
  const patchIndex = serverSource.indexOf(`output = ${applyFunction}(output, mustReplace);`);
  if (patchIndex < 0) {
    failures.push(`server.js: missing ${applyFunction} application`);
  } else if (patchIndex <= previousPatchIndex) {
    failures.push(`server.js: ${applyFunction} is applied out of order`);
  }
  previousPatchIndex = patchIndex;
}

if (failures.length) {
  console.error(`Bundled server guard failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log(`Bundled server guard passed (${revision}, sha256 ${expectedSha256}).`);
