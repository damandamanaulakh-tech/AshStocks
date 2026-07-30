const REQUIRED_SIGNALS = ["damageCluster5In10","fiiCashStressQ10","fiiSellCluster7In10","fiiDiiDivergence5D","indiaVix","portfolioDrawdownPct"];

export function evaluateRiskGovernor(input = {}, registry) {
  if (!registry?.exposureGovernor) throw new Error("A validated parameter registry is required");
  const missingSignals = REQUIRED_SIGNALS.filter(name => ["indiaVix","portfolioDrawdownPct"].includes(name) ? !Number.isFinite(input[name]) : typeof input[name] !== "boolean");
  const ladder = registry.exposureGovernor;
  if (missingSignals.length) return {state:"DATA_INCOMPLETE",exposurePct:ladder.minimumPct,edgeConfirmed:false,liveReady:false,paperTradeOnly:true,missingSignals,reasons:["Required risk inputs are missing; governor failed closed."]};

  const confirmations=[input.fiiCashStressQ10,input.fiiSellCluster7In10,input.fiiDiiDivergence5D].filter(Boolean).length;
  let state="NORMAL", exposurePct=ladder.normalPct;
  const reasons=[];
  if (input.damageCluster5In10 && confirmations>=2) {state="DEFENSIVE_MAX";exposurePct=ladder.minimumPct;reasons.push("Damage cluster plus at least two FII cash confirmations.");}
  else if (input.damageCluster5In10 && confirmations===1) {state="DEFENSIVE";exposurePct=ladder.watchHighPct;reasons.push("Damage cluster plus one FII cash confirmation.");}
  else if (input.damageCluster5In10) {state="WATCH";exposurePct=ladder.watchPct;reasons.push("Damage cluster fired without an independent confirmation.");}
  else if (confirmations>=2) {state="WATCH_CONFIRMATIONS_ONLY";exposurePct=ladder.watchPct;reasons.push("Multiple FII cash warnings fired without market-damage confirmation.");}
  else reasons.push("No executable damage stack is active.");

  const vix=registry.signals.indiaVixRegime;
  let vixRegime="LOW",vixSizeMultiplier=vix.lowSizeMultiplier,blockNewEntries=false;
  if(input.indiaVix<vix.veryLowUpperExclusive){vixRegime="VERY_LOW";vixSizeMultiplier=vix.veryLowSizeMultiplier;}
  else if(input.indiaVix<vix.lowUpperExclusive){vixRegime="LOW";}
  else if(input.indiaVix<vix.elevatedUpperExclusive){vixRegime="ELEVATED";vixSizeMultiplier=vix.elevatedSizeMultiplier;}
  else if(input.indiaVix<vix.highUpperExclusive){vixRegime="HIGH";vixSizeMultiplier=vix.highSizeMultiplier;blockNewEntries=vix.highBlockNewEntries;}
  else{vixRegime="EXTREME";vixSizeMultiplier=vix.extremeSizeMultiplier;blockNewEntries=vix.extremeBlockNewEntries;}

  if(input.portfolioDrawdownPct<=ladder.drawdownTriggerPct){state="DRAWDOWN_GOVERNOR";exposurePct=ladder.minimumPct;blockNewEntries=true;reasons.push("Portfolio drawdown reached the user-approved -18% governor.");}
  const investableCapPct=100-registry.paperCapital.cashBufferPct;
  const targetGrossExposurePct=Math.min(investableCapPct,Math.max(ladder.minimumPct,Number((exposurePct*vixSizeMultiplier).toFixed(2))));
  return {state,exposurePct:targetGrossExposurePct,preVixExposurePct:exposurePct,vixRegime,vixSizeMultiplier,blockNewEntries,maxPositionPct:registry.paperCapital.maxPositionPct,cashBufferPct:registry.paperCapital.cashBufferPct,transactionCostOneWayPct:registry.execution.transactionCostOneWayPct,edgeConfirmed:false,liveReady:false,paperTradeOnly:true,missingSignals:[],confirmations,reasons};
}
export const RISK_GOVERNOR_REQUIRED_SIGNALS=Object.freeze([...REQUIRED_SIGNALS]);
