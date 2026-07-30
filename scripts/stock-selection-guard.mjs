import assert from "node:assert/strict";
import fs from "node:fs";
import {
  evaluateKellySizing,
  selectTradeInCandidates,
} from "../lib/stock-selection-engine.mjs";

const parameters = JSON.parse(
  fs.readFileSync(new URL("../config/stock-selection-parameters.v0.1.json", import.meta.url), "utf8"),
);
const manifest = JSON.parse(
  fs.readFileSync(new URL("../config/release-data-manifest.Backenddata.json", import.meta.url), "utf8"),
);
const registry = JSON.parse(
  fs.readFileSync(new URL("../config/ash-stock-parameters.v2.2.json", import.meta.url), "utf8"),
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
assert.equal(parameters.parameterRevision, "0.2.0");
assert.equal(parameters.positionSizing.kelly.fractionOfKelly, 0.25);
assert.equal(parameters.positionSizing.kelly.minimumClosedTrades, 100);
assert.equal(parameters.positionSizing.kelly.minimumDistinctSymbols, 20);
assert.equal(parameters.positionSizing.kelly.minimumWins, 20);
assert.equal(parameters.positionSizing.kelly.minimumLosses, 20);
assert.equal(parameters.positionSizing.kelly.fullConfidenceClosedTrades, 300);
assert.equal(parameters.positionSizing.kelly.maximumKellyPositionPct, 10);
assert.equal(
  registry.paperCapital.kellySizing.parameterSource,
  "config/stock-selection-parameters.v0.1.json#positionSizing.kelly",
);
assert.equal(
  registry.paperCapital.kellySizing.fractionOfKelly,
  parameters.positionSizing.kelly.fractionOfKelly,
);
assert.equal(
  registry.paperCapital.kellySizing.minimumClosedTrades,
  parameters.positionSizing.kelly.minimumClosedTrades,
);
assert.deepEqual([
  registry.signals.indiaVixRegime.elevatedSizeMultiplier,
  registry.signals.indiaVixRegime.highSizeMultiplier,
  registry.signals.indiaVixRegime.extremeSizeMultiplier,
], [0.8, 0.65, 0.5]);

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
assert.equal(normal.kelly.status, "CALIBRATING");
assert.equal(normal.kelly.applied, false);

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

function closedTrades({ wins, losses, winPnl = 100, lossPnl = -50 }) {
  return Array.from({ length: wins + losses }, (_, index) => {
    const realizedPnl = index < wins ? winPnl : lossPnl;
    const entryValue = 1000;
    return {
      id: `T${index}`,
      order_id: `O${index}`,
      symbol: `K${String(index % 20).padStart(2, "0")}`,
      side: "SELL",
      qty: 10,
      price: (entryValue + realizedPnl) / 10,
      value: entryValue + realizedPnl,
      realized_pnl: realizedPnl,
      traded_at: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
    };
  });
}

const calibratingKelly = evaluateKellySizing(
  closedTrades({ wins: 59, losses: 40 }),
  parameters,
);
assert.equal(calibratingKelly.validClosedTrades, 99);
assert.equal(calibratingKelly.status, "CALIBRATING");
assert.equal(calibratingKelly.applied, false);
assert.equal(calibratingKelly.maximumPositionPct, null);

const positiveTrades = closedTrades({ wins: 60, losses: 40 });
const activeKelly = evaluateKellySizing(positiveTrades, parameters);
assert.equal(activeKelly.status, "ACTIVE_PAPER_ONLY");
assert.equal(activeKelly.applied, true);
assert.equal(activeKelly.blockNewEntries, false);
assert.equal(activeKelly.validClosedTrades, 100);
assert.equal(activeKelly.distinctSymbols, 20);
assert.ok(activeKelly.maximumPositionPct > 2.8 && activeKelly.maximumPositionPct < 2.9);
assert.ok(activeKelly.expectancyNetPct > 3);

const kellySized = selectTradeInCandidates({
  market: {
    indiaVix: 18,
    fii5dNetCr: -100,
    dii5dNetCr: 100,
    portfolioDrawdownPct: -5,
  },
  stocks,
  paperTrades: positiveTrades,
}, parameters);
assert.equal(kellySized.kelly.status, "ACTIVE_PAPER_ONLY");
assert.ok(kellySized.selected[0].maximumPositionPct > 1.69);
assert.ok(kellySized.selected[0].maximumPositionPct < 1.71);
assert.ok(kellySized.selected[0].maximumPositionPct < caution.selected[0].maximumPositionPct);

const noEdgeTrades = closedTrades({
  wins: 40,
  losses: 60,
  winPnl: 20,
  lossPnl: -50,
});
const noEdge = selectTradeInCandidates({
  market: {
    indiaVix: 14,
    fii5dNetCr: 100,
    dii5dNetCr: 50,
    portfolioDrawdownPct: -5,
  },
  stocks,
  paperTrades: noEdgeTrades,
}, parameters);
assert.equal(noEdge.kelly.status, "NO_POSITIVE_EDGE");
assert.equal(noEdge.kelly.applied, true);
assert.equal(noEdge.kelly.blockNewEntries, true);
assert.equal(noEdge.selected[0].route, "WATCH_ONLY");
assert.equal(noEdge.selected[0].maximumPositionPct, 0);

console.log("ASH Stock selection v0.1 guard passed.");
