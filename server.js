import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { applyAdvancedScannerPatches } from "./server-quality-patch.mjs";
import { applySelectionFlowPatches } from "./server-selection-patch.mjs";
import { applyCandlePatternPatches } from "./server-candle-pattern-patch.mjs";
import { applyFrameworkPatches } from "./server-framework-patch.mjs";
import { applyPaperTraderPatches } from "./server-paper-trader-patch.mjs";
import { applyPaperOrderLifecyclePatches } from "./server-paper-order-lifecycle-patch.mjs";
import { applyAdvisorEnginePatches } from "./server-advisor-engine-patch.mjs";
import { applyMarketContextPatches } from "./server-market-context-patch.mjs";
import { applyCompetitiveFrameworkPatches } from "./server-competitive-framework-patch.mjs";
import { applyDataIntelligencePatches } from "./server-data-intelligence-patch.mjs";
import { applyIntelligenceScorePatches } from "./server-intelligence-score-patch.mjs";
import { applyUpstoxQuotePatches } from "./server-upstox-quote-patch.mjs";
import { applySuspendedEmptyScanPatch } from "./server-suspended-empty-patch.mjs";

const runtimeProcess = globalThis.process;
const PORT = Number(runtimeProcess?.env?.PORT || 4173);
const BASE_SERVER_URL = "https://raw.githubusercontent.com/damandamanaulakh-tech/AshStocks/37a9e9ceacabd33bc5a2085ad621e368f8fc0cd8/server.js";

function mustReplace(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Patch anchor missing: ${label}`);
  return source.replace(search, replacement);
}

function patchServerSource(source) {
  let output = source;
  output = output
    .replaceAll("AshStocks Login", "ASH Stock Login")
    .replaceAll("Private India Scanner", "Private NSE Paper Trading")
    .replaceAll("<h1>AshStocks</h1>", "<h1>ASH Stock</h1>")
    .replaceAll("Sign in to the Render app.", "Sign in to ASH Stock.")
    .replaceAll("AshStocks running", "ASH Stock running");
  output = mustReplace(
    output,
    'const ROOT = path.dirname(fileURLToPath(import.meta.url));\nconst runtimeProcess = globalThis.process;',
    'const runtimeProcess = globalThis.process;\nconst ROOT = runtimeProcess?.cwd?.() || path.dirname(fileURLToPath(import.meta.url));',
    'runtime root'
  );
  output = mustReplace(
    output,
    'const PAPER_ENGINE_POLL_MS = 60_000;\nconst UPSTOX_NSE_INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";',
    'const PAPER_ENGINE_POLL_MS = 60_000;\nconst DATA_BANK_BOOTSTRAP_DELAY_MS = 1_500;\nconst UPSTOX_NSE_INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";',
    'bootstrap delay constant'
  );
  output = mustReplace(
    output,
    'let storePromise;\nlet paperEngineScheduler;\nconst paperEngineState = {',
    'let storePromise;\nlet paperEngineScheduler;\nlet dataBankBootstrapTimer;\nlet dataBankBootstrapPromise;\nconst dataBankBootstrapState = {\n  enabled: false,\n  running: false,\n  startedAt: null,\n  lastAttemptAt: null,\n  completedAt: null,\n  lastResult: null,\n  lastError: null\n};\nconst paperEngineState = {',
    'bootstrap state'
  );
  output = mustReplace(
    output,
    '    upstox: upstoxStatus(),\n    requirements: {',
    '    upstox: upstoxStatus(),\n    bootstrap: dataBankBootstrapStatus(),\n    requirements: {',
    'data bank summary bootstrap status'
  );
  output = mustReplace(
    output,
    '    warning: store.warning || null,\n    data_bank: dataBankSummary(state)\n  };\n}\n\nasync function resolveRequestUniverse',
    '    warning: store.warning || null,\n    bootstrap: dataBankBootstrapStatus(),\n    data_bank: dataBankSummary(state)\n  };\n}\n\nasync function resolveRequestUniverse',
    'data bank status bootstrap status'
  );
  const bootstrapFunctions = `
function dataBankAutoBootstrapEnabled() {
  if (ENV.DISABLE_DATA_BANK_AUTO_BOOTSTRAP === "true") return false;
  if (ENV.ENABLE_DATA_BANK_AUTO_BOOTSTRAP === "true") return true;
  return ENV.NODE_ENV === "production";
}

function dataBankBootstrapStatus() {
  return {
    enabled: dataBankAutoBootstrapEnabled(),
    running: dataBankBootstrapState.running,
    startedAt: dataBankBootstrapState.startedAt,
    lastAttemptAt: dataBankBootstrapState.lastAttemptAt,
    completedAt: dataBankBootstrapState.completedAt,
    lastResult: dataBankBootstrapState.lastResult,
    lastError: dataBankBootstrapState.lastError
  };
}

async function runDataBankBootstrap(trigger = "startup") {
  if (!dataBankAutoBootstrapEnabled()) {
    return { ok: true, skipped: true, reason: "disabled", trigger };
  }
  if (dataBankBootstrapPromise) return dataBankBootstrapPromise;

  dataBankBootstrapPromise = (async () => {
    dataBankBootstrapState.enabled = true;
    dataBankBootstrapState.running = true;
    dataBankBootstrapState.lastAttemptAt = new Date().toISOString();
    dataBankBootstrapState.lastError = null;
    try {
      const store = await getStore();
      const state = await store.getState();
      const summary = dataBankSummary(state);
      if (summary.universe_count > INDIA_UNIVERSE.length && summary.rows_with_instrument_key > INDIA_UNIVERSE.length) {
        const skipped = {
          ok: true,
          skipped: true,
          reason: "already_loaded",
          trigger,
          saved_universe: summary.universe_count,
          rows_with_instrument_key: summary.rows_with_instrument_key,
          data_sources: summary.data_sources
        };
        dataBankBootstrapState.lastResult = skipped;
        return skipped;
      }

      const result = await loadUpstoxNseDataBank({ limit: MAX_UNIVERSE_ROWS, trigger });
      const savedState = await store.getState();
      const savedSummary = dataBankSummary(savedState);
      dataBankBootstrapState.lastResult = {
        ok: result.ok,
        trigger,
        source: result.source,
        saved_universe: savedSummary.universe_count,
        rows_with_instrument_key: savedSummary.rows_with_instrument_key,
        data_sources: savedSummary.data_sources,
        total_records_read: result.total_records_read,
        url: result.url
      };
      return dataBankBootstrapState.lastResult;
    } catch (error) {
      const failure = { ok: false, trigger, error: error.message };
      dataBankBootstrapState.lastError = failure;
      dataBankBootstrapState.lastResult = failure;
      return failure;
    } finally {
      dataBankBootstrapState.running = false;
      dataBankBootstrapState.completedAt = new Date().toISOString();
      dataBankBootstrapPromise = null;
    }
  })();

  return dataBankBootstrapPromise;
}

function startDataBankBootstrap() {
  if (dataBankBootstrapTimer || !dataBankAutoBootstrapEnabled()) return;
  dataBankBootstrapState.enabled = true;
  dataBankBootstrapState.startedAt = new Date().toISOString();
  dataBankBootstrapTimer = setTimeout(() => {
    runDataBankBootstrap("startup").catch((error) => {
      dataBankBootstrapState.lastError = { ok: false, trigger: "startup", error: error.message };
      dataBankBootstrapState.lastResult = dataBankBootstrapState.lastError;
      dataBankBootstrapState.running = false;
      dataBankBootstrapState.completedAt = new Date().toISOString();
    });
  }, DATA_BANK_BOOTSTRAP_DELAY_MS);
  dataBankBootstrapTimer.unref?.();
}
`;
  output = mustReplace(
    output,
    '\nasync function loadUpstoxNseDataBank(options = {}) {',
    `${bootstrapFunctions}\nasync function loadUpstoxNseDataBank(options = {}) {`,
    'insert bootstrap functions'
  );
  output = mustReplace(
    output,
    'export function createServer() {\n  startPaperEngineScheduler();',
    'export function createServer() {\n  startDataBankBootstrap();\n  startPaperEngineScheduler();',
    'start bootstrap'
  );
  output = applyAdvancedScannerPatches(output, mustReplace);
  output = applySelectionFlowPatches(output, mustReplace);
  output = applyCandlePatternPatches(output, mustReplace);
  output = applyFrameworkPatches(output, mustReplace);
  output = applyPaperTraderPatches(output, mustReplace);
  output = applyPaperOrderLifecyclePatches(output, mustReplace);
  output = applyAdvisorEnginePatches(output, mustReplace);
  output = applyMarketContextPatches(output, mustReplace);
  output = applyCompetitiveFrameworkPatches(output, mustReplace);
  output = applyDataIntelligencePatches(output, mustReplace);
  output = applyIntelligenceScorePatches(output, mustReplace);
  output = applyUpstoxQuotePatches(output, mustReplace);
  output = applySuspendedEmptyScanPatch(output, mustReplace);
  return output;
}

async function loadInnerServer() {
  const response = await fetch(BASE_SERVER_URL, { headers: { "user-agent": "ashstocks-render-bootstrap" } });
  if (!response.ok) throw new Error(`Unable to load base server source: ${response.status} ${response.statusText}`);
  const patched = patchServerSource(await response.text());
  const hash = crypto.createHash("sha256").update(patched).digest("hex").slice(0, 16);
  const runtimeRoot = runtimeProcess?.cwd?.() || os.tmpdir();
  const runtimeDir = path.join(runtimeRoot, ".ashstocks-runtime-server");
  await fs.promises.mkdir(runtimeDir, { recursive: true });
  const runtimeFile = path.join(runtimeDir, `server-${hash}.mjs`);
  await fs.promises.writeFile(runtimeFile, patched, "utf8");
  return import(pathToFileURL(runtimeFile).href);
}

const inner = await loadInnerServer();

export const createServer = inner.createServer;
export const quoteFor = inner.quoteFor;
export const searchSymbols = inner.searchSymbols;
export const newsFor = inner.newsFor;
export const sanitizeState = inner.sanitizeState;
export const normalizeMongoUri = inner.normalizeMongoUri;
export const runScanner = inner.runScanner;
export const normalizeSymbol = inner.normalizeSymbol;
export const dataBankSummary = inner.dataBankSummary;
export const loadUpstoxNseDataBank = inner.loadUpstoxNseDataBank;

if (runtimeProcess?.argv?.[1] && import.meta.url === pathToFileURL(runtimeProcess.argv[1]).href) {
  createServer().listen(PORT, () => {
    console.log(`AshStocks running at http://localhost:${PORT}`);
  });
}
