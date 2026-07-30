import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const PARAMETER_REGISTRY_PATH = path.resolve(moduleDir, "../config/ash-stock-parameters.v2.1.json");

export function loadParameterRegistry() {
  const registry = JSON.parse(fs.readFileSync(PARAMETER_REGISTRY_PATH, "utf8"));
  validateParameterRegistry(registry);
  return Object.freeze(registry);
}

export function validateParameterRegistry(registry) {
  const failures = [];
  if (registry?.schemaVersion !== "2.1") failures.push("schemaVersion must be 2.1");
  if (registry?.mode?.liveTrade !== false) failures.push("liveTrade must remain false");
  if (registry?.mode?.paperEngine !== true) failures.push("paperEngine must remain true");
  if (registry?.mode?.edgeConfirmed !== false) failures.push("edgeConfirmed must remain false");
  if (registry?.paperCapital?.maxPositionPct !== 2.5) failures.push("maxPositionPct must be 2.5");
  if (registry?.paperCapital?.maxPortfolioHeatPct !== 25) failures.push("maxPortfolioHeatPct must be 25");
  const ladder = registry?.exposureGovernor;
  if (ladder?.normalPct !== 100 || ladder?.watchPct !== 70 || ladder?.watchHighPct !== 50 || ladder?.riskOnPct !== 25 || ladder?.minimumPct !== 25) failures.push("exposure ladder must be exactly 100/70/50/25 with minimum 25");
  if (registry?.signals?.damageCluster5In10?.status !== "conditional_risk_throttle") failures.push("damageCluster5In10 cannot be promoted above conditional_risk_throttle");
  if (failures.length) throw new Error(`ASH parameter registry invalid: ${failures.join("; ")}`);
  return registry;
}
