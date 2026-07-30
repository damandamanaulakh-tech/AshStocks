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
assert.equal(parameters.primaryRank.lookbackSessions, 20);
assert.equal(parameters.primaryRank.weightPct, 100);
assert.equal(parameters.universe.selectionCount, 10);
assert.equal(parameters.confirmations.volume20.scoreWeightPct, 0);
assert.equal(parameters.confirmations.delivery20.scoreWeightPct, 0);

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
  market: { indiaVix: 14, fii5dNetCr: 100, dii5dNetCr: 50 },
  stocks,
}, parameters);
assert.equal(normal.selected.length, 10);
assert.equal(normal.selected[0].symbol, "S12");
assert.equal(normal.selected[0].route, "TRADE_IN_PAPER");
assert.equal(normal.selected[0].maximumPositionPct, 10);

const caution = selectTradeInCandidates({
  market: { indiaVix: 18, fii5dNetCr: -100, dii5dNetCr: 100 },
  stocks,
}, parameters);
assert.equal(caution.market.positionMultiplier, 0.5625);
assert.equal(caution.selected[0].maximumPositionPct, 5.625);

const blocked = selectTradeInCandidates({
  market: { indiaVix: 22, fii5dNetCr: 100, dii5dNetCr: 50 },
  stocks,
}, parameters);
assert.equal(blocked.market.blockNewEntries, true);
assert.equal(blocked.selected[0].route, "WATCH_ONLY");

console.log("ASH Stock selection v0.1 guard passed.");
