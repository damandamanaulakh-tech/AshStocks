import assert from "node:assert/strict";
import { loadParameterRegistry } from "../lib/parameter-registry.mjs";
const registry=loadParameterRegistry();
assert.equal(registry.governance.userApproved,true);
assert.equal(registry.mode.liveTrade,false);
assert.equal(registry.mode.paperEngine,true);
assert.equal(registry.mode.edgeConfirmed,false);
assert.equal(registry.paperCapital.maxPositionPct,10);
assert.equal(registry.paperCapital.cashBufferPct,5);
assert.equal(registry.paperCapital.maxOpenPositions,20);
assert.equal(registry.paperCapital.maxPortfolioHeatPct,25);
assert.equal(registry.paperCapital.kellySizing.enabled,true);
assert.equal(registry.paperCapital.kellySizing.mode,"paper_only");
assert.equal(registry.paperCapital.kellySizing.fractionOfKelly,0.25);
assert.equal(registry.paperCapital.kellySizing.minimumClosedTrades,100);
assert.equal(registry.paperCapital.kellySizing.minimumDistinctSymbols,20);
assert.equal(registry.paperCapital.kellySizing.fullConfidenceClosedTrades,300);
assert.equal(registry.paperCapital.kellySizing.maximumKellyPositionPct,10);
assert.deepEqual([registry.exposureGovernor.normalPct,registry.exposureGovernor.watchPct,registry.exposureGovernor.watchHighPct,registry.exposureGovernor.defensivePct],[100,70,50,25]);
assert.equal(registry.execution.returnCleaningClipPct,12);
assert.equal(registry.execution.transactionCostOneWayPct,0.08);
assert.equal(registry.selection.momentumLookbackSessions,20);
assert.equal(registry.selection.momentumSelectionCount,10);
assert.equal(registry.signals.damageCluster5In10.tailDown3Threshold,0.213);
assert.equal(registry.signals.volumeVs20dAverage.minimumMultiple,1.5);
assert.deepEqual([registry.signals.rsi14.minimum,registry.signals.rsi14.maximum],[45,70]);
assert.deepEqual([
  registry.signals.indiaVixRegime.elevatedSizeMultiplier,
  registry.signals.indiaVixRegime.highSizeMultiplier,
  registry.signals.indiaVixRegime.extremeSizeMultiplier,
],[0.8,0.65,0.5]);
assert.equal(registry.signals.indiaVixRegime.highBlockNewEntries,false);
assert.equal(registry.signals.indiaVixRegime.extremeBlockNewEntries,false);
console.log("ASH Stock parameter registry v2.2 guard passed.");
