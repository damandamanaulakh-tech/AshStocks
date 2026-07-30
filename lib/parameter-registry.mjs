import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  if (registry?.paperCapital?.maxPositionPct !== 10) failures.push("maxPositionPct must be 10");
  if (registry?.paperCapital?.cashBufferPct !== 5) failures.push("cashBufferPct must be 5");
  if (registry?.paperCapital?.maxPortfolioHeatPct !== 25) failures.push("maxPortfolioHeatPct must be 25");
  const ladder = registry?.exposureGovernor;
  if (ladder?.normalPct !== 100 || ladder?.watchPct !== 70 || ladder?.watchHighPct !== 50 || ladder?.defensivePct !== 25 || ladder?.minimumPct !== 25) failures.push("exposure ladder must be exactly 100/70/50/25 with minimum 25");
  if (registry?.execution?.transactionCostOneWayPct !== 0.08) failures.push("one-way cost must be 0.08%");
  if (registry?.execution?.returnCleaningClipPct !== 12) failures.push("return clip must be 12%");
  if (registry?.selection?.momentumLookbackSessions !== 20) failures.push("momentum lookback must be 20");
  if (registry?.selection?.momentumSelectionCount !== 10) failures.push("momentum selection count must be 10");
  if (failures.length) throw new Error(`ASH parameter registry invalid: ${failures.join("; ")}`);
  return registry;
}
