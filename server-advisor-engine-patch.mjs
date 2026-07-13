const ADVISOR_ENGINE_FUNCTIONS = String.raw`
const ADVISOR_SECTOR_RULES = Object.freeze([
  { sector: "Banking", words: ["BANK", "HDFC", "ICICI", "KOTAK", "AXIS", "SBIN", "FEDERAL", "IDFC", "PNB", "CANARA", "INDUSIND"] },
  { sector: "NBFC / Finance", words: ["FINANCE", "FIN", "CAPITAL", "CREDIT", "BAJAJ", "CHOLAMANDALAM", "SHRIRAM", "MUTHOOT", "MANAPPURAM", "AMC"] },
  { sector: "IT / Digital", words: ["TECH", "INFOTECH", "SOFTWARE", "DIGITAL", "DATA", "TCS", "INFOSYS", "HCL", "WIPRO", "PERSISTENT", "LTIMINDTREE", "MPHASIS", "COFORGE"] },
  { sector: "Auto / EV", words: ["AUTO", "MOTOR", "TYRE", "BATTERY", "EXIDE", "AMARA", "EICHER", "TATA MOTORS", "BAJAJ AUTO", "M&M", "MARUTI", "ASHOK"] },
  { sector: "Pharma / Healthcare", words: ["PHARMA", "LIFE", "HEALTH", "HOSPITAL", "LAB", "DR REDDY", "SUN", "CIPLA", "APOLLO", "AUROBINDO", "DIVIS"] },
  { sector: "Energy / Power", words: ["POWER", "ENERGY", "GREEN", "RENEW", "SOLAR", "NTPC", "ADANI GREEN", "TATA POWER", "SUZLON", "ONGC", "OIL", "GAIL"] },
  { sector: "Infra / Capital Goods", words: ["INFRA", "CONSTRUCTION", "LARSEN", "ENGINEERS", "BHEL", "ABB", "SIEMENS", "THERMAX", "KEC", "KALPATARU"] },
  { sector: "Rail / Defence", words: ["RAIL", "IRFC", "IRCTC", "RVNL", "RITES", "DEFENCE", "AEROSPACE", "HAL", "BEL", "BEML", "COCHIN", "SHIP"] },
  { sector: "Metals / Materials", words: ["STEEL", "METAL", "HINDALCO", "TATA STEEL", "JSW", "JINDAL", "VEDANTA", "NALCO", "CEMENT", "PAINT"] },
  { sector: "FMCG / Consumption", words: ["FOOD", "FMCG", "CONSUMER", "RETAIL", "TRENT", "AVENUE", "ITC", "NESTLE", "BRITANNIA", "HINDUSTAN UNILEVER", "TITAN"] }
]);
function inferAdvisorSector(row = {}) {
  const current = String(row.sector || "").trim();
  if (current && current !== "Unmapped") return current;
  const text = String((row.symbol || "") + " " + (row.name || "")).toUpperCase();
  const match = ADVISOR_SECTOR_RULES.find((rule) => rule.words.some((word) => text.includes(word)));
  return match?.sector || "General NSE";
}
function advisorConviction(score) {
  const value = Number(score) || 0;
  if (value >= 78) return "HIGH";
  if (value >= 62) return "MEDIUM";
  if (value >= 45) return "WATCH";
  return "LOW";
}
function advisorHorizon(ret6, ret12, volatility) {
  if ((Number(ret6) || 0) >= 20 && (Number(volatility) || 0) <= 35) return "Swing 2-8 weeks";
  if ((Number(ret12) || 0) >= 30) return "Position 2-6 months";
  return "Tactical 5-20 days";
}
function advisorSetup(row = {}, themes = []) {
  if (themes.some((theme) => /Defence|Rail|Green|EV|AI|PSU/i.test(theme))) return "Theme + momentum";
  if ((Number(row.return_6m_pct) || 0) > 20 && (Number(row.return_12m_pct) || 0) > 25) return "Relative strength continuation";
  if ((Number(row.rupee_turnover_cr) || 0) >= 50) return "Liquid large participation";
  return "Ranked opportunity";
}
function buildAdvisorFields(row = {}, inputs = {}) {
  const close = finiteOr(row.close, null);
  const atrProxyPct = Math.max(4, Math.min(14, finiteOr(row.vol_63d_pct, 24) / 4));
  const entryLow = close ? round(close * 0.9925, 2) : null;
  const entryHigh = close ? round(close * 1.0075, 2) : null;
  const stop = inputs.stopPrice ?? (close ? round(close * (1 - atrProxyPct / 100), 2) : null);
  const target1 = close ? round(close * (1 + Math.max(8, inputs.targetPct * 0.45) / 100), 2) : null;
  const target2 = inputs.targetPrice ?? (close ? round(close * 1.18, 2) : null);
  const score = finiteOr(inputs.paperScore, 0);
  const themes = inputs.themes || [];
  const horizon = advisorHorizon(row.return_6m_pct, row.return_12m_pct, row.vol_63d_pct);
  const why = [advisorSetup(row, themes), advisorConviction(score) + " conviction", (themes[0] || inputs.sector || "NSE") + " context", round(finiteOr(row.return_6m_pct, 0), 1) + "% 6M", round(finiteOr(row.return_12m_pct, 0), 1) + "% 12M"].filter(Boolean).join("; ");
  return { sector: inputs.sector || inferAdvisorSector(row), conviction: advisorConviction(score), horizon, setup: advisorSetup(row, themes), entry_zone: { low: entryLow, high: entryHigh }, target1, target2, stop, exit_rule: "Exit or replace if target progress >= 80%, stop hits, or advisor score falls below replace line", why, parameters_used: ["Upstox historical candles", "6M/12M momentum", "quality score", "rupee turnover", "target room", "event resilience", "theme heat", "volatility stop", "paper-only rotation"] };
}
`;
export function applyAdvisorEnginePatches(source, mustReplace) {
  let output = source;
  output = mustReplace(output, 'const PAPER_TRADER_VERSION = "ashstocks-paper-trader-v0.3";', 'const PAPER_TRADER_VERSION = "ashstocks-paper-trader-v0.4-advisor";', 'advisor engine version');
  output = mustReplace(output, '\nfunction detectThemes(row = {}) {', `\n${ADVISOR_ENGINE_FUNCTIONS}\nfunction detectThemes(row = {}) {`, 'insert advisor helpers');
  output = mustReplace(output, '  const themes = detectThemes(row);\n  const themeHeat = themes.length ? Math.min(100, 50 + themes.length * 15) : 25;', '  const inferredSector = inferAdvisorSector(row);\n  const themes = detectThemes({ ...row, sector: inferredSector });\n  const themeHeat = themes.length ? Math.min(100, 50 + themes.length * 15) : 25;', 'advisor sector/theme inference');
  output = mustReplace(output, '  const paperReady = Boolean(close && row.decision !== "DATA_NEEDED" && paperScore >= settings.replaceBelowScore);', '  const paperReady = Boolean(close && row.decision !== "DATA_NEEDED" && paperScore >= Math.max(25, settings.replaceBelowScore - 10));', 'advisor paper ready threshold');
  output = mustReplace(output, '  return { ...row, themes, theme_heat: round(themeHeat, 2), event_resilience: round(eventResilience, 2), paper_score: paperScore, paper_ready: paperReady, watch_ready: watchReady, target_price: targetPrice, stop_price: stopPrice, target_pct: round(targetPct, 2), stop_loss_pct: settings.stopLossPct, paper_reason: paperReason(row, themes, targetLeft, paperScore) };', '  return { ...row, sector: inferredSector, themes, theme_heat: round(themeHeat, 2), event_resilience: round(eventResilience, 2), paper_score: paperScore, paper_ready: paperReady, watch_ready: watchReady, target_price: targetPrice, stop_price: stopPrice, target_pct: round(targetPct, 2), stop_loss_pct: settings.stopLossPct, advisor: buildAdvisorFields(row, { sector: inferredSector, themes, paperScore, targetPct, targetPrice, stopPrice }), paper_reason: paperReason({ ...row, sector: inferredSector }, themes, targetLeft, paperScore) };', 'advisor enriched candidate return');
  output = mustReplace(output, 'return { rank: index + 1, symbol: row.symbol, name: row.name, sector: row.sector || "Unmapped", action: "PAPER_BUY", readiness: ["SELECT", "WATCH"].includes(row.decision) ? "READY" : "REVIEW", scanner_decision: row.decision, paper_score: row.paper_score, close: row.close, qty, estimated_value: round(qty * row.close, 2), target_price: row.target_price, stop_price: row.stop_price, target_pct: row.target_pct, stop_loss_pct: row.stop_loss_pct, themes: row.themes, thesis: row.paper_reason, created_at: asOf, paper_only: true, broker_write_enabled: false };', 'return { rank: index + 1, symbol: row.symbol, name: row.name, sector: row.sector || row.advisor?.sector || "General NSE", action: "PAPER_BUY", readiness: ["SELECT", "WATCH"].includes(row.decision) ? "READY" : "REVIEW", scanner_decision: row.decision, paper_score: row.paper_score, conviction: row.advisor?.conviction || advisorConviction(row.paper_score), horizon: row.advisor?.horizon || "Tactical 5-20 days", setup: row.advisor?.setup || "Ranked opportunity", close: row.close, entry_zone: row.advisor?.entry_zone || null, qty, estimated_value: round(qty * row.close, 2), target_price: row.target_price, target1: row.advisor?.target1 || null, target2: row.advisor?.target2 || row.target_price, stop_price: row.stop_price, target_pct: row.target_pct, stop_loss_pct: row.stop_loss_pct, themes: row.themes, advisor: row.advisor || null, thesis: row.advisor?.why || row.paper_reason, exit_rule: row.advisor?.exit_rule || "Exit or replace on target/stop/score deterioration", created_at: asOf, paper_only: true, broker_write_enabled: false };', 'advisor buy ticket');
  output = mustReplace(output, 'return { symbol: row.symbol, name: row.name, sector: row.sector || "Unmapped", decision: row.decision, score: row.score, paper_score: row.paper_score, close: row.close, target_price: row.target_price, stop_price: row.stop_price, readiness: row.paper_ready ? (["SELECT", "WATCH"].includes(row.decision) ? "READY" : "REVIEW") : "WATCH", themes: row.themes || [], reason: row.paper_reason || row.reason || "" };', 'return { symbol: row.symbol, name: row.name, sector: row.sector || row.advisor?.sector || "General NSE", decision: row.decision, score: row.score, paper_score: row.paper_score, conviction: row.advisor?.conviction || advisorConviction(row.paper_score), horizon: row.advisor?.horizon || "Tactical 5-20 days", close: row.close, target_price: row.target_price, stop_price: row.stop_price, readiness: row.paper_ready ? (["SELECT", "WATCH"].includes(row.decision) ? "READY" : "REVIEW") : "WATCH", themes: row.themes || [], advisor: row.advisor || null, reason: row.advisor?.why || row.paper_reason || row.reason || "" };', 'advisor mini candidate');
  return output;
}
