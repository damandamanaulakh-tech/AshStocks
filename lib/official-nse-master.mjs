import crypto from "node:crypto";
import zlib from "node:zlib";

export const OFFICIAL_NSE_MASTER_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";
export const OFFICIAL_NSE_SUSPENDED_URL = "https://assets.upstox.com/market-quote/instruments/exchange/suspended-instrument.json.gz";
export const OFFICIAL_NSE_EQUITY_URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";
export const OFFICIAL_NSE_IMPORT_VERSION = "official-nse-master-v2";

function officialMasterError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function officialMasterSymbol(value) {
  const symbol = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9&._-]{0,49}$/.test(symbol) ? symbol : "";
}

function officialMasterIdentity(row = {}) {
  if (row.exchange !== "NSE" || row.segment !== "NSE_EQ" || row.instrument_type !== "EQ") {
    throw officialMasterError("official_nse_identity_invalid");
  }
  const symbol = officialMasterSymbol(row.trading_symbol);
  const isin = String(row.isin || "").trim();
  if (!symbol || !/^IN[A-Z0-9]{10}$/.test(isin) || row.instrument_key !== `NSE_EQ|${isin}`) {
    throw officialMasterError("official_nse_identity_invalid");
  }
  const name = String(row.short_name || row.name || symbol).trim();
  if (!name || name.length > 120) throw officialMasterError("official_nse_name_invalid");
  return { symbol, name, sector: "Unmapped", exchange: "NSE", instrument_key: row.instrument_key,
    isin, instrument_type: "EQ", security_type: String(row.security_type || "").trim(),
    data_source: "Upstox NSE instruments JSON" };
}

function officialMasterComparable(row = {}) {
  return JSON.stringify([row.symbol, row.name, row.exchange, row.instrument_key, row.isin,
    row.instrument_type, row.security_type || "", row.nse_series || ""]);
}

function validateOfficialNseEquityRows(records) {
  if (!Array.isArray(records)) throw officialMasterError("official_nse_membership_required");
  if (!records.length) throw officialMasterError("official_nse_equity_csv_empty");
  const symbols = new Set(), isins = new Set();
  return records.map((row) => {
    const symbol = officialMasterSymbol(row?.symbol);
    const isin = String(row?.isin || "").trim();
    const name = String(row?.name || "").trim();
    const series = String(row?.series || "").trim();
    // Membership in NSE's equity file is authoritative, not a name heuristic.
    // INF identities are fund units; IN9 (e.g. a company's DVR) is not a fund.
    if (!symbol || !/^IN[A-Z0-9]{10}$/.test(isin) || isin.startsWith("INF") ||
        !name || name.length > 200 || !["EQ", "BE", "BZ"].includes(series)) {
      throw officialMasterError("official_nse_membership_invalid");
    }
    if (symbols.has(symbol) || isins.has(isin)) throw officialMasterError("official_nse_membership_duplicate_identity");
    symbols.add(symbol); isins.add(isin);
    return { symbol, isin, name, series };
  });
}

export function parseOfficialNseEquityCsv(text) {
  if (typeof text !== "string") throw officialMasterError("official_nse_equity_csv_invalid");
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], field = "", quoted = false, closed = false;
  const finishField = () => { row.push(field.trim()); field = ""; closed = false; };
  const finishRow = () => { finishField(); if (row.some(Boolean)) rows.push(row); row = []; };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[index + 1] === '"') { field += '"'; index += 1; }
      else { quoted = false; closed = true; }
    } else if (char === ",") finishField();
    else if (char === "\r" || char === "\n") {
      finishRow();
      if (char === "\r" && text[index + 1] === "\n") index += 1;
    } else if (closed) {
      if (char !== " " && char !== "\t") throw officialMasterError("official_nse_equity_csv_invalid");
    } else if (char === '"') {
      if (field.trim()) throw officialMasterError("official_nse_equity_csv_invalid");
      field = ""; quoted = true;
    } else field += char;
  }
  if (quoted) throw officialMasterError("official_nse_equity_csv_invalid");
  if (field || row.length || closed) finishRow();
  const header = rows.shift() || [];
  const required = ["SYMBOL", "NAME OF COMPANY", "SERIES", "DATE OF LISTING", "PAID UP VALUE", "MARKET LOT", "ISIN NUMBER", "FACE VALUE"];
  if (header.length !== required.length || new Set(header).size !== header.length || required.some((key) => !header.includes(key))) {
    throw officialMasterError("official_nse_equity_csv_header_invalid");
  }
  const column = (row, key) => row[header.indexOf(key)];
  return validateOfficialNseEquityRows(rows.map((row) => {
    if (row.length !== header.length) throw officialMasterError("official_nse_equity_csv_invalid");
    return { symbol: column(row, "SYMBOL"), name: column(row, "NAME OF COMPANY"),
      isin: column(row, "ISIN NUMBER"), series: column(row, "SERIES") };
  }));
}

function officialMasterEquities(records, allowEmpty) {
  if (!Array.isArray(records)) throw officialMasterError("official_instrument_array_required");
  const bySymbol = new Map();
  const byKey = new Map();
  let rawEquityCount = 0;
  let duplicateCount = 0;
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw officialMasterError("official_instrument_record_invalid");
    // Non-equity contracts are expected in the exchange file; never import them.
    if (record.segment !== "NSE_EQ" || record.instrument_type !== "EQ") continue;
    rawEquityCount += 1;
    const row = officialMasterIdentity(record);
    const previous = bySymbol.get(row.symbol);
    const keyOwner = byKey.get(row.instrument_key);
    if ((previous && officialMasterComparable(previous) !== officialMasterComparable(row)) ||
        (keyOwner && keyOwner !== row.symbol)) throw officialMasterError("official_nse_duplicate_identity_conflict");
    if (previous) { duplicateCount += 1; continue; }
    bySymbol.set(row.symbol, row);
    byKey.set(row.instrument_key, row.symbol);
  }
  if (!allowEmpty && !bySymbol.size) throw officialMasterError("official_nse_empty_master");
  return { rows: [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)), rawEquityCount, duplicateCount };
}

export function validateOfficialSuspendedRows(records) {
  if (!Array.isArray(records)) throw officialMasterError("official_instrument_array_required");
  const bySymbol = new Map();
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw officialMasterError("official_instrument_record_invalid");
    if (record.segment !== "NSE_EQ" || record.instrument_type !== "EQ") continue;
    const symbol = officialMasterSymbol(record.trading_symbol);
    if (record.exchange !== "NSE" || !symbol) throw officialMasterError("official_suspension_identity_invalid");
    // Exclusion evidence may omit ISIN/key. A validated symbol still blocks that
    // stock; it can never create an importable instrument or bypass master identity.
    const key = String(record.instrument_key || "").trim();
    const isin = String(record.isin || "").trim();
    // The official suspension feed also uses paired DUMMY identifiers for
    // inactive securities. They are exclusion evidence only, never valid ISINs
    // or broker keys. Require the exact matching pair before dropping the key.
    const pairedDummy = /^DUMMYY?[0-9]{1,20}$/.test(isin) && key === `NSE_EQ|${isin}`;
    if (!pairedDummy && ((key && !/^NSE_EQ\|IN[A-Z0-9]{10}$/.test(key)) ||
        (isin && !/^IN[A-Z0-9]{10}$/.test(isin)) ||
        (key && isin && key !== `NSE_EQ|${isin}`))) throw officialMasterError("official_suspension_identity_invalid");
    const exclusionKey = pairedDummy ? "" : key;
    const previous = bySymbol.get(symbol);
    if (previous?.instrument_key && exclusionKey && previous.instrument_key !== exclusionKey) throw officialMasterError("official_suspension_identity_conflict");
    bySymbol.set(symbol, { symbol, instrument_key: exclusionKey || previous?.instrument_key || "" });
  }
  return [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function buildOfficialNseUniverse(records, suspendedRecords, nseEquityRows) {
  const equity = officialMasterEquities(records, false);
  const suspendedRows = validateOfficialSuspendedRows(suspendedRecords);
  const membership = validateOfficialNseEquityRows(nseEquityRows);
  const bySymbol = new Map(membership.map((row) => [row.symbol, row]));
  const byIsin = new Map(membership.map((row) => [row.isin, row]));
  const suspendedKeys = new Set(suspendedRows.map((row) => row.instrument_key));
  const suspendedSymbols = new Set(suspendedRows.map((row) => row.symbol));
  const stocks = [];
  for (const row of equity.rows) {
    const member = bySymbol.get(row.symbol), isinOwner = byIsin.get(row.isin);
    if ((member && member.isin !== row.isin) || (isinOwner && isinOwner.symbol !== row.symbol)) {
      throw officialMasterError("official_nse_membership_identity_conflict");
    }
    if (member) stocks.push({ ...row, name: member.name, nse_series: member.series,
      data_source: "NSE equity list + Upstox instrument master" });
  }
  // Upstox's EQ instrument type is not NSE's trading-series classification.
  // Keep BE/BZ trade-for-trade securities out of this normal EQ scanner.
  const normalSeries = stocks.filter((row) => row.nse_series === "EQ");
  const universe = normalSeries.filter((row) => !suspendedKeys.has(row.instrument_key) && !suspendedSymbols.has(row.symbol));
  if (!universe.length) throw officialMasterError("official_nse_empty_eligible_master");
  const matchedSymbols = new Set(stocks.map((row) => row.symbol));
  return { universe, suspendedRows, reconciliation: {
    outside_nse_company_list: equity.rows.filter((row) => !matchedSymbols.has(row.symbol)),
    excluded_non_eq_series: stocks.filter((row) => row.nse_series !== "EQ"),
    excluded_suspended: normalSeries.filter((row) => suspendedKeys.has(row.instrument_key) || suspendedSymbols.has(row.symbol)),
    nse_without_upstox_eq_match: membership.filter((row) => !matchedSymbols.has(row.symbol))
  }, counts: {
    raw_equity_count: equity.rawEquityCount, duplicate_count: equity.duplicateCount,
    unique_equity_count: equity.rows.length, eligible_count: universe.length,
    nse_equity_count: membership.length, matched_nse_equity_count: stocks.length,
    nse_non_eq_count: membership.filter((row) => row.series !== "EQ").length,
    excluded_non_eq_series_count: stocks.length - normalSeries.length,
    excluded_not_nse_equity_count: equity.rows.length - stocks.length,
    nse_unmatched_count: membership.length - stocks.length,
    excluded_suspended_count: normalSeries.length - universe.length,
    suspended_equity_count: suspendedRows.length
  } };
}

export function diffOfficialNseUniverse(previous = [], universe = []) {
  const oldRows = new Map((Array.isArray(previous) ? previous : []).map((row) => [row.symbol, row]));
  const newRows = new Map(universe.map((row) => [row.symbol, row]));
  const added = [], updated = [], removed = [];
  let unchanged = 0;
  for (const row of universe) {
    const old = oldRows.get(row.symbol);
    if (!old) added.push(row.symbol);
    else if (officialMasterComparable(old) !== officialMasterComparable(row)) updated.push(row.symbol);
    else unchanged += 1;
  }
  for (const symbol of oldRows.keys()) if (!newRows.has(symbol)) removed.push(symbol);
  return { added_count: added.length, updated_count: updated.length, removed_count: removed.length,
    unchanged_count: unchanged, new_symbols: added.sort(), updated_symbols: updated.sort(), removed_symbols: removed.sort() };
}

export async function fetchOfficialInstrumentSource(url, options = {}) {
  if (![OFFICIAL_NSE_MASTER_URL, OFFICIAL_NSE_SUSPENDED_URL, OFFICIAL_NSE_EQUITY_URL].includes(url)) throw officialMasterError("official_nse_source_not_allowed");
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxDownloadBytes = options.maxDownloadBytes ?? 32 * 1024 * 1024;
  const maxDecodedBytes = options.maxDecodedBytes ?? 96 * 1024 * 1024;
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(officialMasterError("official_nse_fetch_timeout")); }, timeoutMs);
  });
  const work = (async () => {
    const response = await (options.fetchImpl || fetch)(url, {
      method: "GET", redirect: "error", cache: "no-store", signal: controller.signal,
      headers: { accept: "text/csv, application/json, application/gzip", "cache-control": "no-cache, no-store", pragma: "no-cache" }
    });
    if (!response.ok) throw officialMasterError(`official_nse_fetch_http_${response.status}`);
    if (response.url && response.url !== url) throw officialMasterError("official_nse_redirect_not_allowed");
    const contentLength = Number(response.headers.get("content-length"));
    if (contentLength > maxDownloadBytes) throw officialMasterError("official_nse_download_too_large");
    if (!response.body || typeof response.body.getReader !== "function") throw officialMasterError("official_nse_stream_required");
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > maxDownloadBytes) throw officialMasterError("official_nse_download_too_large");
        chunks.push(Buffer.from(chunk.value));
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    if (!size) throw officialMasterError("official_nse_empty_response");
    const buffer = Buffer.concat(chunks, size);
    const gzip = buffer[0] === 0x1f && buffer[1] === 0x8b;
    const decoded = gzip ? zlib.gunzipSync(buffer, { maxOutputLength: maxDecodedBytes }) : buffer;
    if (decoded.byteLength > maxDecodedBytes) throw officialMasterError("official_nse_decoded_too_large");
    const isEquityCsv = url === OFFICIAL_NSE_EQUITY_URL;
    const records = isEquityCsv ? parseOfficialNseEquityCsv(decoded.toString("utf8")) : JSON.parse(decoded.toString("utf8"));
    if (!Array.isArray(records)) throw officialMasterError("official_instrument_array_required");
    const fetchedAt = new Date(options.now ?? Date.now());
    const sourceModified = response.headers.get("last-modified");
    if (isEquityCsv && !sourceModified) throw officialMasterError("official_nse_source_date_required");
    const sourceTime = sourceModified ? Date.parse(sourceModified) : NaN;
    if (sourceModified && !Number.isFinite(sourceTime)) throw officialMasterError("official_nse_source_date_invalid");
    if (sourceTime > fetchedAt.getTime() + 5 * 60 * 1000) throw officialMasterError("official_nse_source_date_future");
    const ageHours = Number.isFinite(sourceTime) ? Math.max(0, (fetchedAt.getTime() - sourceTime) / 3600000) : null;
    if (ageHours !== null && ageHours > 7 * 24) throw officialMasterError("official_nse_source_stale");
    return { records, source_url: url, fetched_at: fetchedAt.toISOString(),
      source_last_modified: Number.isFinite(sourceTime) ? new Date(sourceTime).toISOString() : null,
      source_age_hours: ageHours, source_time_verified: Number.isFinite(sourceTime),
      source_sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
      decoded_sha256: crypto.createHash("sha256").update(decoded).digest("hex"),
      downloaded_bytes: buffer.length, decoded_bytes: decoded.length, encoding: gzip ? "gzip" : isEquityCsv ? "csv" : "json" };
  })();
  try { return await Promise.race([work, deadline]); }
  finally { clearTimeout(timer); controller.abort(); }
}

export async function fetchOfficialNseMaster(options = {}) {
  if (options.url !== undefined && options.url !== OFFICIAL_NSE_MASTER_URL) throw officialMasterError("official_nse_source_not_allowed");
  const [master, suspended, equity] = await Promise.all([
    fetchOfficialInstrumentSource(OFFICIAL_NSE_MASTER_URL, options),
    fetchOfficialInstrumentSource(OFFICIAL_NSE_SUSPENDED_URL, options),
    fetchOfficialInstrumentSource(OFFICIAL_NSE_EQUITY_URL, options)
  ]);
  const built = buildOfficialNseUniverse(master.records, suspended.records, equity.records);
  return { ...built, master, suspended, equity };
}

export function officialNseImportMetadata(snapshot, previousUniverse = [], previousImport = null) {
  const { master, suspended, equity, counts, universe } = snapshot;
  return { version: OFFICIAL_NSE_IMPORT_VERSION, status: "imported", source_url: OFFICIAL_NSE_MASTER_URL,
    fetched_at: master.fetched_at, source_last_modified: master.source_last_modified,
    source_age_hours: master.source_age_hours, source_time_verified: master.source_time_verified,
    source_sha256: master.source_sha256, decoded_sha256: master.decoded_sha256,
    downloaded_bytes: master.downloaded_bytes, total_records_read: master.records.length,
    suspended_source_url: OFFICIAL_NSE_SUSPENDED_URL, suspended_fetched_at: suspended.fetched_at,
    suspended_source_last_modified: suspended.source_last_modified, suspended_source_sha256: suspended.source_sha256,
    equity_source_url: OFFICIAL_NSE_EQUITY_URL, equity_fetched_at: equity.fetched_at,
    equity_source_last_modified: equity.source_last_modified, equity_source_sha256: equity.source_sha256,
    equity_decoded_sha256: equity.decoded_sha256, equity_downloaded_bytes: equity.downloaded_bytes,
    equity_source_age_hours: equity.source_age_hours, equity_source_time_verified: equity.source_time_verified,
    membership_verified: true, membership_policy: "nse-equity-list-eq-series-exact-symbol-isin-v2",
    suspended_status: "verified", ...counts, ...diffOfficialNseUniverse(previousUniverse, universe),
    requested_count: 2400, shortfall: Math.max(0, 2400 - universe.length),
    source_changed: previousImport?.source_sha256 !== master.source_sha256 || previousImport?.suspended_source_sha256 !== suspended.source_sha256 || previousImport?.equity_source_sha256 !== equity.source_sha256,
    no_synthetic_padding: true, is_live_quote_data: false };
}

export function sanitizeOfficialNseImport(input) {
  if (!input || typeof input !== "object" || ![OFFICIAL_NSE_IMPORT_VERSION, "official-nse-master-v1"].includes(input.version)) return null;
  const v2 = input.version === OFFICIAL_NSE_IMPORT_VERSION;
  const clean = { version: input.version, status: "imported", source_url: OFFICIAL_NSE_MASTER_URL,
    suspended_source_url: OFFICIAL_NSE_SUSPENDED_URL, requested_count: 2400, no_synthetic_padding: true, is_live_quote_data: false };
  for (const key of ["fetched_at", "source_last_modified", "suspended_fetched_at", "suspended_source_last_modified"]) {
    clean[key] = typeof input[key] === "string" && Number.isFinite(Date.parse(input[key])) ? new Date(input[key]).toISOString() : null;
  }
  for (const key of ["source_sha256", "decoded_sha256", "suspended_source_sha256"]) clean[key] = /^[a-f0-9]{64}$/.test(input[key] || "") ? input[key] : null;
  for (const key of ["downloaded_bytes", "total_records_read", "raw_equity_count", "duplicate_count", "unique_equity_count", "eligible_count", "excluded_suspended_count", "suspended_equity_count", "added_count", "updated_count", "removed_count", "unchanged_count", "shortfall", ...(v2 ? ["nse_equity_count", "matched_nse_equity_count", "nse_non_eq_count", "excluded_non_eq_series_count", "excluded_not_nse_equity_count", "nse_unmatched_count"] : ["excluded_fund_count"])]) clean[key] = Number.isSafeInteger(input[key]) && input[key] >= 0 ? input[key] : 0;
  clean.source_age_hours = typeof input.source_age_hours === "number" && Number.isFinite(input.source_age_hours) && input.source_age_hours >= 0 ? input.source_age_hours : null;
  clean.source_time_verified = input.source_time_verified === true;
  clean.source_changed = input.source_changed === true;
  clean.suspended_status = input.suspended_status === "verified" ? "verified" : "unknown";
  if (v2) {
    clean.equity_source_url = OFFICIAL_NSE_EQUITY_URL;
    for (const key of ["equity_fetched_at", "equity_source_last_modified"]) clean[key] = typeof input[key] === "string" && Number.isFinite(Date.parse(input[key])) ? new Date(input[key]).toISOString() : null;
    for (const key of ["equity_source_sha256", "equity_decoded_sha256"]) clean[key] = /^[a-f0-9]{64}$/.test(input[key] || "") ? input[key] : null;
    clean.equity_downloaded_bytes = Number.isSafeInteger(input.equity_downloaded_bytes) && input.equity_downloaded_bytes >= 0 ? input.equity_downloaded_bytes : 0;
    clean.equity_source_age_hours = typeof input.equity_source_age_hours === "number" && Number.isFinite(input.equity_source_age_hours) && input.equity_source_age_hours >= 0 ? input.equity_source_age_hours : null;
    clean.equity_source_time_verified = input.equity_source_time_verified === true;
    clean.membership_policy = input.membership_policy === "nse-equity-list-eq-series-exact-symbol-isin-v2" ? input.membership_policy : null;
    clean.membership_verified = input.membership_verified === true && !!clean.membership_policy && !!clean.equity_source_sha256 && !!clean.equity_source_last_modified;
  }
  for (const key of ["new_symbols", "updated_symbols", "removed_symbols"]) clean[key] = [...new Set((Array.isArray(input[key]) ? input[key] : []).map(officialMasterSymbol).filter(Boolean))].slice(0, 5000);
  return clean;
}
