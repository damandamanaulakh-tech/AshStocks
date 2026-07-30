const REQUIRED_BOOLEAN_SIGNALS = ["damageCluster5In10", "fiiCashStressQ10", "fiiSellCluster7In10", "fiiDiiDivergence5D"];

export function evaluateRiskGovernor(input = {}, registry) {
  if (!registry?.exposureGovernor) throw new Error("A validated parameter registry is required");
  const missingSignals = REQUIRED_BOOLEAN_SIGNALS.filter((name) => typeof input[name] !== "boolean");
  const ladder = registry.exposureGovernor;
  if (missingSignals.length) return {state: "DATA_INCOMPLETE", exposurePct: ladder.minimumPct, edgeConfirmed: false, liveReady: false, paperTradeOnly: true, missingSignals, reasons: ["Required risk inputs are missing; governor failed closed."]};

  const damage = input.damageCluster5In10;
  const confirmations = [input.fiiCashStressQ10, input.fiiSellCluster7In10, input.fiiDiiDivergence5D].filter(Boolean).length;
  let state = "NORMAL", exposurePct = ladder.normalPct;
  const reasons = [];
  if (damage && confirmations >= 2) { state = "DEFENSIVE_MAX"; exposurePct = ladder.minimumPct; reasons.push("Damage cluster plus at least two FII cash confirmations."); }
  else if (damage && confirmations === 1) { state = "DEFENSIVE"; exposurePct = ladder.watchHighPct; reasons.push("Damage cluster plus one FII cash confirmation."); }
  else if (damage) { state = "WATCH"; exposurePct = ladder.watchPct; reasons.push("Damage cluster fired without an independent confirmation."); }
  else if (confirmations >= 2) { state = "WATCH_CONFIRMATIONS_ONLY"; exposurePct = ladder.watchPct; reasons.push("Multiple FII cash warnings fired without market-damage confirmation."); }
  else reasons.push("No executable damage stack is active.");
  return {state, exposurePct, edgeConfirmed: false, liveReady: false, paperTradeOnly: true, missingSignals: [], confirmations, reasons};
}

export const RISK_GOVERNOR_REQUIRED_SIGNALS = Object.freeze([...REQUIRED_BOOLEAN_SIGNALS]);
