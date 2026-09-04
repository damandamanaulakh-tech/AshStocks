import assert from "node:assert/strict";
import fs from "node:fs";
import {
  applyPaperSelectionChanges,
  paperSelectionDefaults,
  resetPaperSelectionSettings,
  validatePaperSelectionChanges,
} from "../lib/paper-selection-settings.mjs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const index = read("index.html");
const app = read("app.js");
const styles = read("styles.css");
const server = read("server-selection-settings-patch.mjs");
const settingsLib = read("lib/paper-selection-settings.mjs");
const institutional = read("server-upstox-institutional-patch.mjs");

for (const text of [
  'data-route-decision="WATCH"',
  'data-route-decision="ALL"',
  'data-nav-key="portfolio"',
  'data-nav-key="performance"',
  'data-nav-key="closed-trades"',
  'data-nav-key="orders"',
  'data-download-trades="open"',
  'data-download-trades="closed"',
  'id="formulaSettingsForm"',
  'id="formulaSettingsAudit"',
  'class="table-wrap watchlist-table-scroll"',
  'tabindex="0" aria-label="Watchlist stocks"',
]) assert.ok(index.includes(text), `index.html missing ${text}`);

for (const text of [
  "function buildPortfolioViewModel()",
  "function renderHoldingsDashboard(model)",
  "function renderPerformanceDashboard(model)",
  "function renderPaperBookDashboard(model)",
  'portfolioNode.innerHTML = error + (portfolioIsPerformance',
  "state.portfolioView === \"performance\"",
  "model.winRatePct",
  "model.averageReturnPct",
  "model.profitFactor",
  "model.bestTrade",
  "model.worstTrade",
  "function downloadTradeLedger(kind)",
  "state.orders?.positions",
  "state.orders?.closed_trades",
  "open-trades",
  "closed-trades",
  "button.dataset.routeDecision",
  "tableWrap.scrollTop = 0",
  'api(`/api/settings/formulas?ts=',
  'api("/api/settings/formulas"',
  "function resetFormulaSettings()",
  "function renderFormulaSettings()",
]) assert.ok(app.includes(text), `app.js missing ${text}`);

assert.ok(!app.includes('const targets = [el("portfolioDashboard"), el("paperTradeDashboard")]'), "shared portfolio renderer returned");
assert.ok(!app.includes("sortedRows().slice(0, 8)"), "radar is still capped at eight rows");
assert.ok(!app.includes("visibleRows().slice(0, 250)"), "screener is still silently capped");

for (const text of [
  ".signal-radar-card {",
  ".signal-table-scroll {",
  "overflow: auto;",
  "scrollbar-gutter: stable;",
  ".signal-radar-table thead,",
  "#screenerSection thead",
  "#screenerSection.section.active",
  "grid-template-rows: minmax(0, 1fr);",
  "grid-template-rows: auto minmax(0, 1fr);",
  "#screenerSection .watchlist-table-scroll",
  "overscroll-behavior: contain;",
  ".signal-radar-card > footer",
  ".market-regime-card footer",
  ".signal-evidence-body > footer",
  ".regime-facts span,",
  ".signal-radar-table .fii-holding-cell small,",
  ".signal-radar-table td > button small",
  ".portfolio-card th {",
  ".portfolio-card header p {",
  ".formula-settings-grid",
]) assert.ok(styles.includes(text), `styles.css missing ${text}`);

assert.ok(!styles.includes("var(--text)"), "styles.css still references undefined --text");
assert.ok(!styles.includes("var(--accent)"), "styles.css still references undefined --accent");

for (const text of [
  'url.pathname === "/api/settings/formulas"',
  "applyPaperSelectionChanges",
  "resetPaperSelectionSettings",
  "settings_revision_conflict",
  "settings_persistence_unavailable",
  "use_selection_settings_endpoint",
  "state.scannerSettings",
  "persisted-paper-settings",
  "paper_only = true",
  "broker_write_enabled = false",
  "edge_confirmed = false",
]) assert.ok(`${server}\n${settingsLib}`.includes(text), `server settings implementation missing ${text}`);

assert.ok(institutional.includes("institutional_advisory_score"));
assert.ok(institutional.includes("primary_rank_preserved: true"));
assert.ok(institutional.includes("score: baseScore"));
assert.ok(!institutional.includes("score: blendedScore"));

const defaults = paperSelectionDefaults();
assert.deepEqual(defaults, {
  minScoreSelect: 70,
  minScoreWatch: 55,
  minReturn6mPct: 8,
  minReturn12mPct: 12,
  maxVol252Pct: 55,
  adv20Min: 200000,
  turnoverCrMin: 5,
  maxStaleDays: 7,
  targetPotentialPct: 15,
  targetPotentialHardGate: false,
  correlationThreshold: 0.85,
});

assert.equal(validatePaperSelectionChanges({ current: defaults, changes: { minScoreSelect: 72.25 } }).valid, true);
assert.equal(validatePaperSelectionChanges({ current: defaults, changes: { minScoreSelect: "72.25" } }).valid, false);
assert.equal(validatePaperSelectionChanges({ current: defaults, changes: { minScoreWatch: 80 } }).valid, false);
assert.equal(validatePaperSelectionChanges({ current: defaults, changes: { brokerWriteEnabled: true } }).errors[0].code, "locked_field");
assert.equal(validatePaperSelectionChanges({ current: defaults, changes: { unknownThreshold: 2 } }).errors[0].code, "unknown_field");
assert.equal(validatePaperSelectionChanges({ current: defaults, changes: { correlationThreshold: 1.01 } }).valid, false);

const state = { scannerSettings: { ...defaults, paperOnly: true, brokerWriteEnabled: false, startingCapital: 50000000, maxPositions: 500, maxPositionPct: 0.002 } };
const update = applyPaperSelectionChanges({
  state,
  changes: { minScoreSelect: 72.25, minScoreWatch: 56 },
  expectedRevision: 0,
  reason: "guard update",
  now: "2026-08-29T10:00:00.000Z",
  id: "guard-1",
});
assert.equal(update.ok, true);
assert.equal(update.changed, true);
assert.equal(update.nextState.selectionSettingsControl.revision, 1);
assert.equal(update.nextState.scannerSettings.minScoreSelect, 72.25);
assert.equal(update.nextState.scannerSettings.paperOnly, true);
assert.equal(update.nextState.scannerSettings.brokerWriteEnabled, false);
assert.equal(update.nextState.scannerSettings.startingCapital, 50000000);
assert.equal(update.nextState.scannerSettings.maxPositions, 500);
assert.equal(update.nextState.scannerSettings.maxPositionPct, 0.002);
assert.deepEqual(state.selectionSettingsControl, undefined, "input state was mutated");

const stale = applyPaperSelectionChanges({
  state: update.nextState,
  changes: { minScoreSelect: 73 },
  expectedRevision: 0,
  reason: "stale guard update",
  now: "2026-08-29T10:01:00.000Z",
  id: "guard-2",
});
assert.equal(stale.status, 409);

const reset = resetPaperSelectionSettings({
  state: update.nextState,
  expectedRevision: 1,
  reason: "guard reset",
  now: "2026-08-29T10:02:00.000Z",
  id: "guard-3",
});
assert.equal(reset.ok, true);
assert.deepEqual(Object.fromEntries(Object.keys(defaults).map((key) => [key, reset.nextState.scannerSettings[key]])), defaults);
assert.equal(reset.auditEntry.action, "RESET");

console.log("Dashboard selection phases guard passed.");
