import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const server = read("server.js");
const patch = read("server-paper-ledger-retention-patch.mjs");
const lifecycle = read("server-paper-order-lifecycle-patch.mjs");
const selection = read("server-selection-settings-patch.mjs");
const app = read("app.js");

assert.ok(server.includes('import { applyPaperLedgerRetentionPatches } from "./server-paper-ledger-retention-patch.mjs";'));
assert.ok(server.indexOf("applyPaperLedgerRetentionPatches(output") > server.indexOf("applySelectionSettingsPatches(output"), "ledger retention patch must be applied last");

for (const text of [
  "PAPER_LEDGER_FILE",
  "paper_ledger.jsonl",
  "ashstocks-paper-ledger-v1",
  "archivePaperLedgerState",
  "listPaperLedger",
  "startup-backfill",
  "handle.sync()",
  'database.collection("paper_ledger")',
  "paperLedger.bulkWrite",
  "$setOnInsert",
  'url.pathname === "/api/paper-trader/history"',
  "next_cursor",
  "has_more",
]) assert.ok(patch.includes(text), `paper ledger patch missing ${text}`);

assert.ok(patch.includes('await archivePaperLedgerMongo(nextState, "state-save");\\n          const state = sanitizeState(nextState);'), "Mongo archive must run before state sanitization");
assert.ok(patch.includes('await archivePaperLedgerFile(nextState, "state-save");\\n      state = sanitizeState(nextState);'), "file archive must run before state sanitization");
assert.ok(lifecycle.includes("orders: Array.isArray(state.orders) ? state.orders.slice(0, 200)"), "hot order snapshot must remain bounded");
assert.ok(lifecycle.includes("trades: Array.isArray(state.trades) ? state.trades.slice(0, 300)"), "hot trade snapshot must remain bounded");
assert.ok(selection.includes("state_mutation_disabled_in_production"), "production generic state writes must be disabled");
assert.ok(selection.includes("buildPaperTraderPlan(scan, state, { ...body, settings: state.scannerSettings })"), "paper plan must use persisted settings");
assert.ok(selection.includes("settingsRevision: scan.settingsRevision"), "scan ledger must retain settings revision");
assert.ok(selection.includes("if (body.useUpstox !== false) scan = await runUpstoxScanner"), "paper scan must accept stored OAuth tokens");

for (const text of [
  "async function fetchAllPaperHistory(kind)",
  'await fetchAllPaperHistory("closed")',
  'limit: "1000"',
  "page.next_cursor",
  "seenCursors",
]) assert.ok(app.includes(text), `app full-history export missing ${text}`);

console.log("Paper ledger retention guard passed.");
