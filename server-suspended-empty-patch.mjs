export function applySuspendedEmptyScanPatch(source, mustReplace) {
  return mustReplace(
    source,
    '        const filteredUniverse = await filterSuspendedScannerRows(resolved.universe);\n        const scan = runScanner(filteredUniverse, { ...(body.settings || {}), source: resolved.source, holdings: body.holdings, existingHoldings: body.existingHoldings });',
    '        const filteredUniverse = await filterSuspendedScannerRows(resolved.universe);\n        const scan = filteredUniverse.length\n          ? runScanner(filteredUniverse, { ...(body.settings || {}), source: resolved.source, holdings: body.holdings, existingHoldings: body.existingHoldings })\n          : {\n              ok: true,\n              engine: ENGINE_VERSION,\n              rows: [],\n              summary: { total: 0, SELECT: 0, WATCH: 0, REJECT: 0, BLOCKED: 0, DATA_NEEDED: 0 },\n              settings: normalizeScannerSettings(body.settings || {}),\n              source: resolved.source,\n              reason: "all supplied rows removed by suspended-instrument guard",\n              guard: "suspended-instrument"\n            };',
    "empty suspended scanner result"
  );
}
