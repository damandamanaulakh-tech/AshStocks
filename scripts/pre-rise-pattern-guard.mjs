import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluatePreRisePattern } from "../lib/pre-rise-pattern-tracker.mjs";

const parameters = JSON.parse(
  fs.readFileSync(
    new URL("../config/pre-rise-patterns.v0.1.json", import.meta.url),
    "utf8",
  ),
);

function syntheticCandles({ insideBars = 3, ignition = true } = {}) {
  const candles = Array.from({ length: 50 }, (_, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    open: 100 + index * 0.2,
    high: 102 + index * 0.2,
    low: 99 + index * 0.2,
    close: 101 + index * 0.2,
    volume: 100,
  }));
  let priorHigh = candles.at(-1).high;
  let priorLow = candles.at(-1).low;
  for (let index = 0; index < 9; index += 1) {
    const makeInside = index < insideBars;
    const high = makeInside ? priorHigh - 0.1 : priorHigh + 0.8;
    const low = makeInside ? priorLow + 0.1 : priorLow - 0.2;
    candles.push({
      date: `2026-03-${String(index + 1).padStart(2, "0")}`,
      open: low + 0.5,
      high,
      low,
      close: low + (high - low) * 0.7,
      volume: 100,
    });
    priorHigh = high;
    priorLow = low;
  }
  const previous = candles.at(-1);
  candles.push({
    date: "2026-03-10",
    open: previous.close,
    high: previous.high + 1,
    low: previous.low - 0.1,
    close: previous.close + 0.8,
    volume: ignition ? 200 : 100,
  });
  return candles;
}

assert.equal(parameters.edgeConfirmed, false);
assert.equal(parameters.liveReady, false);
assert.equal(parameters.governance.changesScannerRanking, false);
assert.equal(parameters.patterns.watch.minimumInsideBarsIn10, 2);
assert.equal(parameters.patterns.strong.minimumInsideBarsIn10, 3);
assert.equal(parameters.patterns.strong.minimumPositiveVolumeMultipleVs20d, 1.5);

const dataNeeded = evaluatePreRisePattern(
  syntheticCandles().slice(0, 49),
  parameters,
);
assert.equal(dataNeeded.status, "DATA_NEEDED");
assert.equal(dataNeeded.edgeConfirmed, false);

const strong = evaluatePreRisePattern(syntheticCandles(), parameters);
assert.equal(strong.status, "STRONG");
assert.equal(strong.patternId, "PRE_RISE_COMPRESSION_VOLUME_STRONG");
assert.ok(strong.insideBarsIn10 >= 3);
assert.ok(strong.positiveVolumeMultipleVs20d >= 1.5);
assert.equal(strong.positiveClose, true);
assert.equal(strong.changesScannerRanking, false);
assert.equal(strong.changesPositionSizing, false);
assert.equal(strong.changesKellySizing, false);
assert.equal(strong.allowsLiveOrder, false);
assert.equal(strong.paperTradePermission, false);

const watch = evaluatePreRisePattern(
  syntheticCandles({ insideBars: 2 }),
  parameters,
);
assert.equal(watch.status, "WATCH");
assert.equal(watch.patternId, "PRE_RISE_COMPRESSION_VOLUME_WATCH");

const compressionOnly = evaluatePreRisePattern(
  syntheticCandles({ insideBars: 3, ignition: false }),
  parameters,
);
assert.equal(compressionOnly.status, "COMPRESSION_ONLY");
assert.equal(compressionOnly.patternId, null);

console.log("ASH Stock pre-rise pattern guard passed.");
