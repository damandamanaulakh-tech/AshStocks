import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const PAPER_CAPITAL_REGISTRY_PATH = path.resolve(
  moduleDir,
  "../config/ash-stock-parameters.v2.2.json",
);

export function validatePaperCapitalRegistry(registry) {
  const capital = registry?.paperCapital || {};
  const failures = [];
  const exact = {
    initialCapitalInr: 5_000_000,
    deploymentTargetPct: 100,
    minimumEntryValue: 100_000,
    minimumEntryPct: 2,
    baseEntryPct: 2,
    maxPositionPct: 10,
    maxCandidateEntries: 80,
    maxOpenPositions: 50,
    maxBuysPerRun: 80,
    affordableOpenPositionsAtMinimum: 50,
  };
  for (const [key, expected] of Object.entries(exact)) {
    if (capital[key] !== expected) failures.push(`${key} must be ${expected}`);
  }
  if (capital.initialCapitalInr / capital.minimumEntryValue !== capital.affordableOpenPositionsAtMinimum) {
    failures.push("affordableOpenPositionsAtMinimum must equal capital divided by minimum entry");
  }
  if (capital.maxOpenPositions > capital.affordableOpenPositionsAtMinimum) {
    failures.push("maxOpenPositions cannot exceed affordable minimum-size positions");
  }
  if (failures.length) throw new Error(`ASH paper capital registry invalid: ${failures.join("; ")}`);
  return registry;
}

export function paperCapitalPolicyFromRegistry(registry) {
  validatePaperCapitalRegistry(registry);
  const capital = registry.paperCapital;
  return Object.freeze({
    schemaVersion: registry.schemaVersion,
    policyVersion: `ashstocks-paper-capital-${registry.parameterRevision}`,
    parameterSource: "config/ash-stock-parameters.v2.2.json#paperCapital",
    asOf: registry.asOf,
    currency: "INR",
    startingCapital: capital.initialCapitalInr,
    deploymentTargetPct: capital.deploymentTargetPct,
    minimumEntryValue: capital.minimumEntryValue,
    minimumEntryPct: capital.minimumEntryPct,
    baseEntryPct: capital.baseEntryPct,
    maximumPositionPct: capital.maxPositionPct,
    maximumCandidateEntries: capital.maxCandidateEntries,
    maximumOpenPositions: capital.maxOpenPositions,
    maximumBuysPerRun: capital.maxBuysPerRun,
    affordableOpenPositionsAtMinimum: capital.affordableOpenPositionsAtMinimum,
    cashBufferPct: capital.cashBufferPct,
    maximumPortfolioHeatPct: capital.maxPortfolioHeatPct,
    governance: Object.freeze({
      paperOnly: true,
      liveReady: false,
      brokerWriteEnabled: false,
      blockWhenBuyingPowerInsufficient: true,
      blockBuyBelowMinimumEntryValue: true,
      kellyNoPositiveEdgeStillBlocks: true,
      positiveKellySizingFloorValue: capital.minimumEntryValue,
    }),
  });
}

export function loadPaperCapitalPolicy() {
  const registry = JSON.parse(fs.readFileSync(PAPER_CAPITAL_REGISTRY_PATH, "utf8"));
  return paperCapitalPolicyFromRegistry(registry);
}
