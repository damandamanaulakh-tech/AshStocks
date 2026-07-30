import assert from "node:assert/strict";
import { loadParameterRegistry } from "../lib/parameter-registry.mjs";

const registry = loadParameterRegistry();
assert.equal(registry.mode.liveTrade, false);
assert.equal(registry.mode.paperEngine, true);
assert.equal(registry.mode.edgeConfirmed, false);
assert.equal(registry.paperCapital.maxPositionPct, 2.5);
assert.equal(registry.paperCapital.maxOpenPositions, 20);
assert.equal(registry.paperCapital.maxPortfolioHeatPct, 25);
assert.deepEqual([registry.exposureGovernor.normalPct, registry.exposureGovernor.watchPct, registry.exposureGovernor.watchHighPct, registry.exposureGovernor.riskOnPct], [100, 70, 50, 25]);
assert.equal(registry.signals.damageCluster5In10.tailDown3Threshold, 0.213);
assert.equal(registry.signals.damageCluster5In10.minimumFireDays, 5);
assert.equal(registry.signals.damageCluster5In10.lookbackSessions, 10);
assert.equal(registry.signals.volumeVs20dAverage.minimumMultiple, 1.5);
assert.deepEqual([registry.signals.rsi14.minimum, registry.signals.rsi14.maximum], [45, 70]);
console.log("ASH Stock parameter registry v2.1 guard passed.");
