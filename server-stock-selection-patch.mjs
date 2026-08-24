import { readFileSync } from "node:fs";
import { loadPaperCapitalPolicy } from "./lib/paper-capital-policy.mjs";

const stockSelectionParameters = JSON.parse(
  readFileSync(new URL("./config/stock-selection-parameters.v0.1.json", import.meta.url), "utf8"),
);
const paperCapitalPolicy = loadPaperCapitalPolicy();
stockSelectionParameters.paperCapital = paperCapitalPolicy;
stockSelectionParameters.positionSizing.maximumPositionPct = paperCapitalPolicy.maximumPositionPct;
const releaseManifest = JSON.parse(
  readFileSync(new URL("./config/release-data-manifest.Backenddata.json", import.meta.url), "utf8"),
);
const embeddedEngine = readFileSync(
  new URL("./lib/stock-selection-engine.mjs", import.meta.url),
  "utf8",
)
  .replaceAll("export function ", "function ")
  .replace(/\nexport \{[^}]+\};\s*$/, "");

const STOCK_SELECTION_FUNCTIONS = String.raw`
const STOCK_SELECTION_PARAMETERS = Object.freeze(${JSON.stringify(stockSelectionParameters)});
const STOCK_SELECTION_RELEASE_AUDIT = Object.freeze(${JSON.stringify({
  tag: releaseManifest.release.tag,
  assets: releaseManifest.release.assetCount,
  reviewed: releaseManifest.audit.fullContentReviewCount,
  checksumFailures: releaseManifest.audit.checksumFailures,
  invalidArchives: releaseManifest.audit.invalidArchives,
  vixAssets: releaseManifest.audit.vixAssets,
  indiaVixSeries: releaseManifest.audit.contentDiscoveredSeries.indiaVix,
})});
${embeddedEngine}
`;

const STOCK_SELECTION_ROUTES = String.raw`
      if (url.pathname === "/api/stock-selection/parameters") {
        json(res, 200, { ok: true, parameters: STOCK_SELECTION_PARAMETERS, releaseAudit: STOCK_SELECTION_RELEASE_AUDIT });
        return;
      }
      if (url.pathname === "/api/stock-selection/evaluate") {
        if (req.method !== "POST") { json(res, 405, { ok: false, error: "Method not allowed" }); return; }
        const body = await readJsonBody(req);
        const store = await getStore();
        const state = await store.getState();
        const paperTrades = Array.isArray(state?.paperTrader?.trades) ? state.paperTrader.trades : [];
        json(res, 200, { ok: true, result: selectTradeInCandidates({ ...body, paperTrades }, STOCK_SELECTION_PARAMETERS) });
        return;
      }
`;

export function applyStockSelectionPatches(source, mustReplace) {
  let output = source;
  output = mustReplace(
    output,
    "\nasync function dataBankStatus() {",
    `\n${STOCK_SELECTION_FUNCTIONS}\nasync function dataBankStatus() {`,
    "insert release-vetted stock selection engine",
  );
  output = mustReplace(
    output,
    '      if (url.pathname === "/api/scanner/parameters") {',
    `${STOCK_SELECTION_ROUTES}\n      if (url.pathname === "/api/scanner/parameters") {`,
    "stock selection API routes",
  );
  return output;
}
