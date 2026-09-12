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
const artifact = {
  schema: "ashstocks-official-nse-reference-snapshot-v1",
  purpose: "Dated official instrument identities only; not live prices, OHLCV, EPS, P/E or scanner eligibility.",
  application_database_updated: false,
  comparison_baseline: "Empty reference artifact, not the live application's saved universe",
  never_use_as_fresh_import_fallback: true,
  import: { ...officialNseImportMetadata(snapshot), status: "reference_snapshot" },
  universe: snapshot.universe
};
// Exclusive creation protects prior snapshots. A second same-day export fails
// rather than replacing the existing evidence artifact.
await fs.writeFile(target, JSON.stringify(artifact, null, 2) + "\n", { flag: "wx" });
const { new_symbols, updated_symbols, removed_symbols, ...summary } = artifact.import;
console.log(JSON.stringify({ path: target, eligible: snapshot.universe.length, import: summary }, null, 2));
