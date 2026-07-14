const INTELLIGENCE_SCORE_FUNCTIONS = String.raw`
const INTELLIGENCE_SCORE_VERSION = "ashstocks-intelligence-score-v0.1";
function clampScore(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}
function parameterCoverageScore(row = {}) {
  const checks = [
    row.close,
    row.close_127,
    row.close_253,
    row.high_252,
    row.adv20,
    row.rupee_turnover_cr,
    row.vol_63d_pct ?? row.vol63,
    row.vol_126d_pct ?? row.vol126,
    row.vol_252d_pct ?? row.vol252,
    row.return_6m_pct,
    row.return_12m_pct,
    row.momentum_score,
    row.quality_score,
    row.last_candle_date,
    row.instrument_key,
    row.sector && row.sector !== "Unmapped" ? row.sector : null
  ];
  const present = checks.filter((value) => value !== null && value !== undefined && value !== "" && Number(value) !== 0).length;
  return round((present / checks.length) * 100, 2);
}
function institutionalFlowScore() {
  const net = Number(FII_DII_SNAPSHOT.dii_net_cr || 0) + Number(FII_DII_SNAPSHOT.fii_fpi_net_cr || 0);
  return clampScore(50 + net / 250, 0, 100);
}
function regimeRiskScore(row = {}) {
  const lift = VALIDATED_TRIGGER_ROWS.reduce((sum, item) => sum + Number(item.lift || 0), 0) / Math.max(1, VALIDATED_TRIGGER_ROWS.length);
  const vol = Number(row.vol_63d_pct || row.vol63 || 0);
  const targetRoom = Number(row.target_potential?.potential_left_pct ?? row.target_pct ?? 0);
  const weakReturn = Number(row.return_6m_pct || 0) < 8 ? 10 : 0;
  const stretched = targetRoom < 8 ? 12 : 0;
  return clampScore(lift * 10 + vol * 0.25 + weakReturn + stretched, 0, 100);
}
function hotPocketScore(row = {}, themes = []) {
  const sector = String(row.sector || "").toUpperCase();
  const text = `${row.symbol || ""} ${row.name || ""} ${sector} ${(themes || []).join(" ")}`.toUpperCase();
  let score = 30;
  if (/DEFENCE|AEROSPACE|RAIL|INFRA|CAPITAL GOODS|POWER|GREEN|ENERGY|EV|AUTO|AI|DIGITAL|PSU/.test(text)) score += 35;
  if (/BANK|FINANCE|NBFC/.test(text)) score += 15;
  if (/PHARMA|HEALTH/.test(text)) score += 10;
  if ((themes || []).length) score += Math.min(20, themes.length * 8);
  return clampScore(score, 0, 100);
}
function intelligenceOverlay(row = {}, basePaperScore = 0, themes = []) {
  const coverage = parameterCoverageScore(row);
  const flow = institutionalFlowScore();
  const regimeRisk = regimeRiskScore(row);
  const hotPocket = hotPocketScore(row, themes);
  const targetRoom = clampScore(Number(row.target_potential?.potential_left_pct ?? row.target_pct ?? 0) * 3, 0, 100);
  const intelligenceScore = round(
    clampScore(basePaperScore) * 0.48 +
      coverage * 0.12 +
      flow * 0.10 +
      hotPocket * 0.14 +
      targetRoom * 0.08 +
      Math.max(0, 100 - regimeRisk) * 0.08,
    2
  );
  const status = intelligenceScore >= 72 && regimeRisk < 45 ? "SELECT_READY" : intelligenceScore >= 58 ? "WATCH_READY" : regimeRisk >= 60 ? "RISK_REVIEW" : "BUILD_DATA";
  const notes = [
    `coverage ${round(coverage, 1)}/100`,
    `FII+DII flow ${round(flow, 1)}/100`,
    `regime risk ${round(regimeRisk, 1)}/100`,
    `theme ${round(hotPocket, 1)}/100`,
    `status ${status}`
  ];
  return { score: intelligenceScore, coverage, flow, regime_risk: round(regimeRisk, 2), hot_pocket: round(hotPocket, 2), target_room_score: round(targetRoom, 2), status, notes };
}
function intelligenceDecision(row = {}) {
  if (row.decision === "DATA_NEEDED") return "DATA_NEEDED";
  if (row.intelligence?.status === "SELECT_READY" && row.paper_score >= 55) return "SELECT";
  if (row.intelligence?.status === "WATCH_READY" || row.paper_score >= 45) return "WATCH";
  if (row.intelligence?.status === "RISK_REVIEW") return "BLOCKED";
  return row.decision || "WATCH";
}
function intelligenceReason(row = {}) {
  const base = row.paper_reason || row.reason || "advisor scoring";
  const notes = row.intelligence?.notes || [];
  return `${base}; intelligence overlay: ${notes.join("; ")}`;
}
`;
export function applyIntelligenceScorePatches(source, mustReplace) {
  let output = source;
  output = mustReplace(output, "\nasync function dataBankStatus() {", `\n${INTELLIGENCE_SCORE_FUNCTIONS}\nasync function dataBankStatus() {`, "insert intelligence score helpers");
  output = mustReplace(
    output,
    '  const paperScore = round(score * 0.30 + momentum * 0.20 + quality * 0.10 + Math.max(0, Math.min(100, targetLeft * 3)) * 0.10 + liquidity * 0.10 + themeHeat * 0.10 + eventResilience * 0.10 - riskPenalty, 2);',
    '  const basePaperScore = round(score * 0.30 + momentum * 0.20 + quality * 0.10 + Math.max(0, Math.min(100, targetLeft * 3)) * 0.10 + liquidity * 0.10 + themeHeat * 0.10 + eventResilience * 0.10 - riskPenalty, 2);\n  const intelligence = intelligenceOverlay({ ...row, sector: inferredSector, return_6m_pct: ret6, return_12m_pct: ret12, vol_63d_pct: vol, target_pct: targetLeft }, basePaperScore, themes);\n  const paperScore = intelligence.score;',
    "apply intelligence score"
  );
  output = mustReplace(
    output,
    '  return { ...row, sector: inferredSector, themes, theme_heat: round(themeHeat, 2), event_resilience: round(eventResilience, 2), paper_score: paperScore, paper_ready: paperReady, watch_ready: watchReady, target_price: targetPrice, stop_price: stopPrice, target_pct: round(targetPct, 2), stop_loss_pct: settings.stopLossPct, advisor: buildAdvisorFields(row, { sector: inferredSector, themes, paperScore, targetPct, targetPrice, stopPrice }), paper_reason: paperReason({ ...row, sector: inferredSector }, themes, targetLeft, paperScore) };',
    '  const enrichedDecision = intelligenceDecision({ ...row, paper_score: paperScore, intelligence });\n  return { ...row, sector: inferredSector, decision: enrichedDecision, themes, theme_heat: round(themeHeat, 2), event_resilience: round(eventResilience, 2), intelligence_score: paperScore, intelligence, parameter_coverage: intelligence.coverage, flow_score: intelligence.flow, regime_risk: intelligence.regime_risk, hot_pocket_score: intelligence.hot_pocket, paper_score: paperScore, paper_ready: paperReady, watch_ready: watchReady, target_price: targetPrice, stop_price: stopPrice, target_pct: round(targetPct, 2), stop_loss_pct: settings.stopLossPct, advisor: buildAdvisorFields(row, { sector: inferredSector, themes, paperScore, targetPct, targetPrice, stopPrice }), paper_reason: intelligenceReason({ ...row, paper_score: paperScore, intelligence, paper_reason: paperReason({ ...row, sector: inferredSector }, themes, targetLeft, paperScore) }) };',
    "return intelligence fields"
  );
  output = mustReplace(
    output,
    'return { rank: index + 1, symbol: row.symbol, name: row.name, sector: row.sector || row.advisor?.sector || "General NSE", action: "PAPER_BUY", readiness: ["SELECT", "WATCH"].includes(row.decision) ? "READY" : "REVIEW", scanner_decision: row.decision, paper_score: row.paper_score, conviction: row.advisor?.conviction || advisorConviction(row.paper_score), horizon: row.advisor?.horizon || "Tactical 5-20 days", setup: row.advisor?.setup || "Ranked opportunity", close: row.close, entry_zone: row.advisor?.entry_zone || null, qty, estimated_value: round(qty * row.close, 2), target_price: row.target_price, target1: row.advisor?.target1 || null, target2: row.advisor?.target2 || row.target_price, stop_price: row.stop_price, target_pct: row.target_pct, stop_loss_pct: row.stop_loss_pct, themes: row.themes, advisor: row.advisor || null, thesis: row.advisor?.why || row.paper_reason, exit_rule: row.advisor?.exit_rule || "Exit or replace on target/stop/score deterioration", created_at: asOf, paper_only: true, broker_write_enabled: false };',
    'return { rank: index + 1, symbol: row.symbol, name: row.name, sector: row.sector || row.advisor?.sector || "General NSE", action: "PAPER_BUY", readiness: ["SELECT", "WATCH"].includes(row.decision) ? "READY" : "REVIEW", scanner_decision: row.decision, paper_score: row.paper_score, intelligence_score: row.intelligence_score || row.paper_score, parameter_coverage: row.parameter_coverage, flow_score: row.flow_score, regime_risk: row.regime_risk, hot_pocket_score: row.hot_pocket_score, intelligence: row.intelligence || null, conviction: row.advisor?.conviction || advisorConviction(row.paper_score), horizon: row.advisor?.horizon || "Tactical 5-20 days", setup: row.advisor?.setup || "Ranked opportunity", close: row.close, entry_zone: row.advisor?.entry_zone || null, qty, estimated_value: round(qty * row.close, 2), target_price: row.target_price, target1: row.advisor?.target1 || null, target2: row.advisor?.target2 || row.target_price, stop_price: row.stop_price, target_pct: row.target_pct, stop_loss_pct: row.stop_loss_pct, themes: row.themes, advisor: row.advisor || null, thesis: row.paper_reason || row.advisor?.why, exit_rule: row.advisor?.exit_rule || "Exit or replace on target/stop/score deterioration", created_at: asOf, paper_only: true, broker_write_enabled: false };',
    "buy ticket intelligence fields"
  );
  output = mustReplace(
    output,
    'return { symbol: row.symbol, name: row.name, sector: row.sector || row.advisor?.sector || "General NSE", decision: row.decision, score: row.score, paper_score: row.paper_score, conviction: row.advisor?.conviction || advisorConviction(row.paper_score), horizon: row.advisor?.horizon || "Tactical 5-20 days", close: row.close, target_price: row.target_price, stop_price: row.stop_price, readiness: row.paper_ready ? (["SELECT", "WATCH"].includes(row.decision) ? "READY" : "REVIEW") : "WATCH", themes: row.themes || [], advisor: row.advisor || null, reason: row.advisor?.why || row.paper_reason || row.reason || "" };',
    'return { symbol: row.symbol, name: row.name, sector: row.sector || row.advisor?.sector || "General NSE", decision: row.decision, score: row.score, paper_score: row.paper_score, intelligence_score: row.intelligence_score || row.paper_score, parameter_coverage: row.parameter_coverage, flow_score: row.flow_score, regime_risk: row.regime_risk, hot_pocket_score: row.hot_pocket_score, intelligence: row.intelligence || null, conviction: row.advisor?.conviction || advisorConviction(row.paper_score), horizon: row.advisor?.horizon || "Tactical 5-20 days", close: row.close, target_price: row.target_price, stop_price: row.stop_price, readiness: row.paper_ready ? (["SELECT", "WATCH"].includes(row.decision) ? "READY" : "REVIEW") : "WATCH", themes: row.themes || [], advisor: row.advisor || null, reason: row.paper_reason || row.advisor?.why || row.reason || "" };',
    "mini candidate intelligence fields"
  );
  output = mustReplace(
    output,
    'return { ok: true, engine: PAPER_TRADER_VERSION, asOf, paper_only: true, live_orders: false, source: scan.source || "paper-trader", settings, summary: { scanned: rows.length, selected_stocks: buyQueue.length, candidates: investable.length, buy_queue: buyQueue.length, watch: watch.length, active_positions: positions.length, sell_queue: sellQueue.length, data_needed: ranked.filter((row) => row.decision === "DATA_NEEDED").length }, buy_queue: buyQueue, sell_queue: sellQueue, hold_queue: holdQueue, watchlists, top_ranked: ranked.slice(0, settings.maxCandidates), scan_summary: scan.summary || {}, history: [historyItem, ...paperState.history].slice(0, 50) };',
    'return { ok: true, engine: PAPER_TRADER_VERSION, intelligence_engine: INTELLIGENCE_SCORE_VERSION, asOf, paper_only: true, live_orders: false, source: scan.source || "paper-trader", settings, summary: { scanned: rows.length, selected_stocks: buyQueue.length, candidates: investable.length, buy_queue: buyQueue.length, watch: watch.length, active_positions: positions.length, sell_queue: sellQueue.length, data_needed: ranked.filter((row) => row.decision === "DATA_NEEDED").length, avg_intelligence_score: round(ranked.reduce((sum, row) => sum + Number(row.intelligence_score || row.paper_score || 0), 0) / Math.max(1, ranked.length), 2), avg_regime_risk: round(ranked.reduce((sum, row) => sum + Number(row.regime_risk || 0), 0) / Math.max(1, ranked.length), 2), avg_parameter_coverage: round(ranked.reduce((sum, row) => sum + Number(row.parameter_coverage || 0), 0) / Math.max(1, ranked.length), 2) }, intelligence_overlay: { version: INTELLIGENCE_SCORE_VERSION, fii_dii_snapshot: FII_DII_SNAPSHOT, trigger_rows: VALIDATED_TRIGGER_ROWS.slice(0, 6), uses: ["parameter coverage", "FII/DII flow", "validated trigger lift", "regime risk", "theme hot-pocket", "target room"] }, buy_queue: buyQueue, sell_queue: sellQueue, hold_queue: holdQueue, watchlists, top_ranked: ranked.slice(0, settings.maxCandidates), scan_summary: scan.summary || {}, history: [historyItem, ...paperState.history].slice(0, 50) };',
    "plan intelligence summary"
  );
  return output;
}
