import assert from "node:assert/strict";
import fs from "node:fs";
import { selectTradeInCandidates } from "../lib/stock-selection-engine.mjs";

const parameters = JSON.parse(
  fs.readFileSync(new URL("../config/stock-selection-parameters.v0.1.json", import.meta.url), "utf8"),
);
const manifest = JSON.parse(
  fs.readFileSync(new URL("../config/release-data-manifest.Backenddata.json", import.meta.url), "utf8"),
);

assert.equal(manifest.release.assetCount, 171);
assert.equal(manifest.audit.fullContentReviewCount, 171);
assert.deepEqual(manifest.audit.checksumFailures, []);
assert.deepEqual(manifest.audit.invalidArchives, ["2021_06.zip"]);
assert.deepEqual(manifest.audit.vixAssets, []);
assert.equal(manifest.audit.contentDiscoveredSeries.indiaVix.usableRows, 3659);
assert.equal(manifest.audit.contentDiscoveredSeries.indiaVix.endDate, "2026-06-05");
assert.equal(parameters.releaseSource.vixHistoricalSeriesPresent, true);
assert.equal(parameters.marketOverlays.indiaVix.releaseHistoricalReady, true);
assert.equal(parameters.primaryRank.lookbackSessions, 20);
assert.equal(parameters.primaryRank.weightPct, 100);
assert.equal(parameters.universe.selectionCount, 10);
assert.equal(parameters.confirmations.volume20.scoreWeightPct, 0);
assert.equal(parameters.confirmations.delivery20.scoreWeightPct, 0);
assert.equal(parameters.dataPreparation.returnCleaning.lowerPct, -12);
assert.equal(parameters.dataPreparation.returnCleaning.upperPct, 12);
assert.equal(parameters.marketOverlays.portfolioDrawdown.triggerPctInclusive, -18);

const stocks = Array.from({ length: 12 }, (_, index) => ({
  symbol: `S${String(index + 1).padStart(2, "0")}`,
  historySessions: 500,
  dataAgeSessions: 0,
  momentum20Percentile: (index + 1) / 12,
  closeAboveMa50: index % 2 === 0,
  volumeRatio20: 1 + index / 10,
  return1d: 0.01,
}));
const normal = selectTradeInCandidates({
  market: {
    indiaVix: 14,
    fii5dNetCr: 100,
    dii5dNetCr: 50,
    portfolioDrawdownPct: -5,
  },
  stocks,
}, parameters);
assert.equal(normal.selected.length, 10);
assert.equal(normal.selected[0].symbol, "S12");
assert.equal(normal.selected[0].route, "TRADE_IN_PAPER");
assert.equal(normal.selected[0].maximumPositionPct, 10);

const caution = selectTradeInCandidates({
  market: {
    indiaVix: 18,
    fii5dNetCr: -100,
    dii5dNetCr: 100,
    portfolioDrawdownPct: -5,
  },
  stocks,
}, parameters);
assert.equal(caution.market.positionMultiplier, 0.6);
assert.equal(caution.selected[0].maximumPositionPct, 6);

const highVix = selectTradeInCandidates({
  market: {
    indiaVix: 22,
    fii5dNetCr: 100,
    dii5dNetCr: 50,
    portfolioDrawdownPct: -5,
  },
  stocks,
}, parameters);
assert.equal(highVix.market.positionMultiplier, 0.65);
assert.equal(highVix.market.blockNewEntries, false);
assert.equal(highVix.selected[0].route, "TRADE_IN_PAPER");

const extremeVix = selectTradeInCandidates({
  market: {
    indiaVix: 30,
    fii5dNetCr: 100,
    dii5dNetCr: 50,
    portfolioDrawdownPct: -5,
  },
  stocks,
}, parameters);
assert.equal(extremeVix.market.positionMultiplier, 0.5);
assert.equal(extremeVix.market.blockNewEntries, false);
assert.equal(extremeVix.selected[0].maximumPositionPct, 5);

const drawdownBlocked = selectTradeInCandidates({
  market: {
    indiaVix: 14,
    fii5dNetCr: 100,
    dii5dNetCr: 50,
    portfolioDrawdownPct: -18,
  },
  stocks,
}, parameters);
assert.equal(drawdownBlocked.market.positionMultiplier, 0);
assert.equal(drawdownBlocked.market.blockNewEntries, true);
assert.ok(drawdownBlocked.market.flags.includes("PORTFOLIO_DRAWDOWN_GOVERNOR"));
assert.equal(drawdownBlocked.selected[0].route, "WATCH_ONLY");

const missingDrawdown = selectTradeInCandidates({
  market: { indiaVix: 14, fii5dNetCr: 100, dii5dNetCr: 50 },
  stocks,
}, parameters);
assert.equal(missingDrawdown.market.state, "DATA_INCOMPLETE");
assert.deepEqual(missingDrawdown.market.missing, ["portfolioDrawdownPct"]);

console.log("ASH Stock selection v0.1 guard passed.");
