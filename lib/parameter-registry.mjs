import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePaperCapitalRegistry } from "./paper-capital-policy.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const PARAMETER_REGISTRY_PATH = path.resolve(moduleDir, "../config/ash-stock-parameters.v2.2.json");

export function loadParameterRegistry() {
  const registry = JSON.parse(fs.readFileSync(PARAMETER_REGISTRY_PATH, "utf8"));
  validateParameterRegistry(registry);
  return Object.freeze(registry);
}

export function validateParameterRegistry(registry) {
  const failures = [];
  if (registry?.schemaVersion !== "2.2") failures.push("schemaVersion must be 2.2");
  if (registry?.mode?.liveTrade !== false) failures.push("liveTrade must remain false");
  if (registry?.mode?.paperEngine !== true) failures.push("paperEngine must remain true");
  if (registry?.mode?.edgeConfirmed !== false) failures.push("edgeConfirmed must remain false");
  if (registry?.governance?.userApproved !== true) failures.push("v2.2 requires recorded user approval");
  try { validatePaperCapitalRegistry(registry); } catch (error) { failures.push(error.message); }
  if (registry?.paperCapital?.maxPositionPct !== 10) failures.push("maxPositionPct must be 10");
  if (registry?.paperCapital?.cashBufferPct !== 5) failures.push("cashBufferPct must be 5");
  if (registry?.paperCapital?.maxPortfolioHeatPct !== 25) failures.push("maxPortfolioHeatPct must be 25");
  const kelly = registry?.paperCapital?.kellySizing;
  if (kelly?.enabled !== true || kelly?.mode !== "paper_only") failures.push("Kelly sizing must remain enabled for paper only");
  if (kelly?.fractionOfKelly !== 0.25) failures.push("Kelly fraction must be 0.25");
  if (kelly?.minimumClosedTrades !== 100 || kelly?.minimumDistinctSymbols !== 20) failures.push("Kelly sample gate must be 100 closes across 20 symbols");
  if (kelly?.fullConfidenceClosedTrades !== 300 || kelly?.maximumKellyPositionPct !== 10) failures.push("Kelly confidence/cap must be 300 trades and 10%");
  const ladder = registry?.exposureGovernor;
  if (ladder?.normalPct !== 100 || ladder?.watchPct !== 70 || ladder?.watchHighPct !== 50 || ladder?.defensivePct !== 25 || ladder?.minimumPct !== 25) failures.push("exposure ladder must be exactly 100/70/50/25 with minimum 25");
  if (registry?.execution?.transactionCostOneWayPct !== 0.08) failures.push("one-way cost must be 0.08%");
  if (registry?.execution?.returnCleaningClipPct !== 12) failures.push("return clip must be 12%");
  if (registry?.selection?.momentumLookbackSessions !== 20) failures.push("momentum lookback must be 20");
  if (registry?.selection?.momentumSelectionCount !== 10) failures.push("momentum selection count must be 10");
  const vix = registry?.signals?.indiaVixRegime;
  if (vix?.elevatedSizeMultiplier !== 0.8 || vix?.highSizeMultiplier !== 0.65 || vix?.extremeSizeMultiplier !== 0.5) failures.push("VIX sizing must be exactly 0.80/0.65/0.50 above LOW");
  if (vix?.highBlockNewEntries !== false || vix?.extremeBlockNewEntries !== false) failures.push("VIX alone must not block high/extreme entries");
  if (failures.length) throw new Error(`ASH parameter registry invalid: ${failures.join("; ")}`);
  return registry;
}
