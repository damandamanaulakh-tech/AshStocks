import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchOfficialNseMaster, officialNseImportMetadata } from "../lib/official-nse-master.mjs";

// A dated reference artifact, never a fallback for the NSE / Upstox button.
// This exporter cannot reach application storage, portfolios or order routes.
const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const snapshot = await fetchOfficialNseMaster();
if (snapshot.universe.length > 5000) throw new Error("official_nse_storage_capacity_exceeded");
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const target = path.join(root, "data", `official-nse-master-${day}.json`);
// Historical comparison is performed only AFTER all fresh sources succeed.
// It supplies diffs, never candidates, a fallback, or live database state.
const priorFile = (await fs.readdir(path.join(root, "data")))
  .filter((name) => /^official-nse-master-\d{4}-\d{2}-\d{2}\.json$/.test(name) && name < path.basename(target)).sort().at(-1);
const prior = priorFile ? JSON.parse(await fs.readFile(path.join(root, "data", priorFile), "utf8")) : null;
const artifact = {
  schema: "ashstocks-official-nse-reference-snapshot-v2",
  purpose: "Dated official instrument identities only; not live prices, OHLCV, EPS, P/E or scanner eligibility.",
  application_database_updated: false,
  comparison_baseline: priorFile ? `${priorFile} historical reference only, not the live application's saved universe` : "Empty reference artifact, not the live application's saved universe",
  never_use_as_fresh_import_fallback: true,
  import: { ...officialNseImportMetadata(snapshot, prior?.universe, prior?.import), status: "reference_snapshot" },
  universe: snapshot.universe,
  reconciliation: snapshot.reconciliation
};
// Exclusive creation protects prior snapshots. A second same-day export fails
// rather than replacing the existing evidence artifact.
await fs.writeFile(target, JSON.stringify(artifact, null, 2) + "\n", { flag: "wx" });
const { new_symbols, updated_symbols, removed_symbols, ...summary } = artifact.import;
console.log(JSON.stringify({ path: target, eligible: snapshot.universe.length, import: summary }, null, 2));
