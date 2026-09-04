const PAPER_LEDGER_FUNCTIONS = String.raw`
const PAPER_LEDGER_SCHEMA_VERSION = "ashstocks-paper-ledger-v1";

function paperLedgerArchiveRecord(kind, input = {}, source = "state-save", archivedAt = new Date().toISOString()) {
  const normalizedKind = kind === "order" ? "order" : "trade";
  const firstPass = normalizedKind === "order" ? sanitizePaperOrder(input) : sanitizePaperTrade(input);
  const payload = normalizedKind === "order" ? sanitizePaperOrder(firstPass) : sanitizePaperTrade(firstPass);
  if (!payload.symbol) return null;
  const payloadJson = JSON.stringify(payload);
  const payloadHash = crypto.createHash("sha256").update(payloadJson).digest("hex");
  const eventId = crypto.createHash("sha256").update(normalizedKind + "\n" + payloadJson).digest("hex");
  const occurredCandidate = normalizedKind === "order"
    ? payload.updated_at || payload.created_at
    : payload.exit_at || payload.traded_at || payload.entry_at;
  const occurredAt = Number.isFinite(Date.parse(occurredCandidate)) ? new Date(occurredCandidate).toISOString() : archivedAt;
  return {
    schema_version: PAPER_LEDGER_SCHEMA_VERSION,
    event_id: eventId,
    entity_id: String(payload.id || payload.order_id || payloadHash),
    kind: normalizedKind,
    occurred_at: occurredAt,
    payload_hash: payloadHash,
    payload,
    archived_at: archivedAt,
    source: String(source || "state-save").slice(0, 80)
  };
}

function paperLedgerArchiveRecords(rawState = {}, source = "state-save") {
  const paperTrader = rawState && typeof rawState === "object" ? rawState.paperTrader || {} : {};
  const archivedAt = new Date().toISOString();
  return [
    ...(Array.isArray(paperTrader.orders) ? paperTrader.orders.map((record) => paperLedgerArchiveRecord("order", record, source, archivedAt)) : []),
    ...(Array.isArray(paperTrader.trades) ? paperTrader.trades.map((record) => paperLedgerArchiveRecord("trade", record, source, archivedAt)) : [])
  ].filter(Boolean);
}

function normalizePaperLedgerArchiveRecord(input = {}) {
  const kind = input.kind === "order" ? "order" : "trade";
  const record = paperLedgerArchiveRecord(kind, input.payload || {}, input.source || "archive-read", input.archived_at || new Date().toISOString());
  return record && input.event_id === record.event_id ? { ...record, archived_at: String(input.archived_at || record.archived_at).slice(0, 40) } : record;
}

function archivePaperLedgerMemory(index, rawState, source = "state-save") {
  const records = paperLedgerArchiveRecords(rawState, source);
  let inserted = 0;
  for (const record of records) {
    if (index.has(record.event_id)) continue;
    index.set(record.event_id, record);
    inserted += 1;
  }
  return { seen: records.length, inserted };
}

function paperLedgerCursorEncode(record) {
  if (!record) return null;
  return Buffer.from(JSON.stringify({ at: record.occurred_at, id: record.event_id }), "utf8").toString("base64url");
}

function paperLedgerCursorDecode(value) {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    if (!Number.isFinite(Date.parse(decoded.at)) || !decoded.id) return null;
    return { at: new Date(decoded.at).toISOString(), id: String(decoded.id) };
  } catch (_) {
    return null;
  }
}

function paperLedgerQueryOptions(input = {}) {
  const requestedKind = String(input.kind || "closed").toLowerCase();
  const kind = ["orders", "trades", "closed"].includes(requestedKind) ? requestedKind : "closed";
  const limit = Math.min(1000, Math.max(1, Math.floor(finiteOr(input.limit, 250))));
  return { kind, limit, cursor: paperLedgerCursorDecode(input.cursor) };
}

function paperLedgerMatches(record, kind) {
  if (kind === "orders") return record.kind === "order";
  if (kind === "trades") return record.kind === "trade";
  return record.kind === "trade" && String(record.payload?.side || "").toUpperCase() === "SELL";
}

function paperLedgerCompare(a, b) {
  const time = String(b.occurred_at).localeCompare(String(a.occurred_at));
  return time || String(b.event_id).localeCompare(String(a.event_id));
}

function paperLedgerAfterCursor(record, cursor) {
  if (!cursor) return true;
  if (record.occurred_at < cursor.at) return true;
  if (record.occurred_at > cursor.at) return false;
  return record.event_id < cursor.id;
}

function paperLedgerPage(records = [], input = {}) {
  const options = paperLedgerQueryOptions(input);
  const ordered = records
    .map(normalizePaperLedgerArchiveRecord)
    .filter(Boolean)
    .filter((record) => paperLedgerMatches(record, options.kind))
    .filter((record) => paperLedgerAfterCursor(record, options.cursor))
    .sort(paperLedgerCompare);
  const window = ordered.slice(0, options.limit + 1);
  const hasMore = window.length > options.limit;
  const pageRecords = hasMore ? window.slice(0, options.limit) : window;
  return {
    records: pageRecords,
    has_more: hasMore,
    next_cursor: hasMore ? paperLedgerCursorEncode(pageRecords[pageRecords.length - 1]) : null
  };
}
`;

const PAPER_LEDGER_FILE_STORE = String.raw`
  let paperLedgerFileIndex = null;

  async function loadPaperLedgerFileIndex() {
    if (paperLedgerFileIndex) return paperLedgerFileIndex;
    const index = new Map();
    try {
      const text = await fsp.readFile(PAPER_LEDGER_FILE, "utf8");
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        try {
          const record = normalizePaperLedgerArchiveRecord(JSON.parse(line));
          if (record) index.set(record.event_id, record);
        } catch (_) {}
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    paperLedgerFileIndex = index;
    return index;
  }

  async function archivePaperLedgerFile(rawState, source = "state-save") {
    const index = await loadPaperLedgerFileIndex();
    const records = [...new Map(paperLedgerArchiveRecords(rawState, source)
      .filter((record) => !index.has(record.event_id))
      .map((record) => [record.event_id, record])).values()];
    if (!records.length) return { seen: 0, inserted: 0 };
    await fsp.mkdir(path.dirname(PAPER_LEDGER_FILE), { recursive: true });
    const handle = await fsp.open(PAPER_LEDGER_FILE, "a");
    try {
      await handle.writeFile(records.map((record) => JSON.stringify(record)).join("\n") + "\n");
      await handle.sync();
    } finally {
      await handle.close();
    }
    for (const record of records) index.set(record.event_id, record);
    return { seen: records.length, inserted: records.length };
  }

  async function listPaperLedgerFile(input = {}) {
    return paperLedgerPage([...(await loadPaperLedgerFileIndex()).values()], input);
  }
`;

const PAPER_LEDGER_MONGO_STORE = String.raw`
      async function archivePaperLedgerMongo(rawState, source = "state-save") {
        const records = [...new Map(paperLedgerArchiveRecords(rawState, source).map((record) => [record.event_id, record])).values()];
        if (!records.length) return { seen: 0, inserted: 0 };
        const result = await paperLedger.bulkWrite(records.map((record) => ({
          updateOne: {
            filter: { _id: record.event_id },
            update: { $setOnInsert: { ...record, _id: record.event_id, occurredAtDate: new Date(record.occurred_at) } },
            upsert: true
          }
        })), { ordered: false });
        return { seen: records.length, inserted: result.upsertedCount || 0 };
      }

      async function listPaperLedgerMongo(input = {}) {
        const options = paperLedgerQueryOptions(input);
        const query = options.kind === "orders"
          ? { kind: "order" }
          : options.kind === "trades"
            ? { kind: "trade" }
            : { kind: "trade", "payload.side": "SELL" };
        if (options.cursor) {
          const cursorDate = new Date(options.cursor.at);
          query.$or = [
            { occurredAtDate: { $lt: cursorDate } },
            { occurredAtDate: cursorDate, _id: { $lt: options.cursor.id } }
          ];
        }
        const docs = await paperLedger.find(query).sort({ occurredAtDate: -1, _id: -1 }).limit(options.limit + 1).toArray();
        const hasMore = docs.length > options.limit;
        const selected = hasMore ? docs.slice(0, options.limit) : docs;
        const records = selected.map(({ _id, occurredAtDate, ...record }) => normalizePaperLedgerArchiveRecord(record)).filter(Boolean);
        return { records, has_more: hasMore, next_cursor: hasMore ? paperLedgerCursorEncode(records[records.length - 1]) : null };
      }
`;

const PAPER_LEDGER_ROUTE = String.raw`
      if (url.pathname === "/api/paper-trader/history") {
        if (req.method !== "GET") { json(res, 405, { ok: false, error: "method_not_allowed", allowed: ["GET"] }); return; }
        const store = await getStore();
        const state = await store.getState();
        if (store.archivePaperLedgerState) await store.archivePaperLedgerState(state, { source: "history-backfill" });
        const kind = String(url.searchParams.get("kind") || "closed").toLowerCase();
        const page = store.listPaperLedger
          ? await store.listPaperLedger({ kind, limit: url.searchParams.get("limit"), cursor: url.searchParams.get("cursor") })
          : { records: [], has_more: false, next_cursor: null };
        const records = page.records.map((record) => kind === "closed" ? paperClosedTradeSummary(record.payload) : record.payload).filter(Boolean);
        json(res, 200, {
          ok: true,
          schema_version: PAPER_LEDGER_SCHEMA_VERSION,
          kind,
          records,
          next_cursor: page.next_cursor,
          has_more: page.has_more,
          storage: store.mode,
          persistent: store.persistent,
          paper_only: true,
          broker_write_enabled: false
        });
        return;
      }
`;

export function applyPaperLedgerRetentionPatches(source, mustReplace) {
  let output = source;
  output = mustReplace(
    output,
    'const SCAN_LEDGER_FILE = path.join(ROOT, "data", "scan_ledger.jsonl");',
    'const SCAN_LEDGER_FILE = path.join(ROOT, "data", "scan_ledger.jsonl");\nconst PAPER_LEDGER_FILE = path.join(ROOT, "data", "paper_ledger.jsonl");',
    "paper ledger archive file",
  );
  output = mustReplace(
    output,
    '\nasync function getStore() {',
    `\n${PAPER_LEDGER_FUNCTIONS}\nasync function getStore() {`,
    "paper ledger archive helpers",
  );
  output = mustReplace(
    output,
    '  let scanLedger = [];\n  let upstoxAuth = null;',
    '  let scanLedger = [];\n  const paperLedger = new Map();\n  let upstoxAuth = null;',
    "memory paper ledger index",
  );
  output = mustReplace(
    output,
    '    async getState() {\n      return state;\n    },\n    async saveState(nextState) {\n      state = sanitizeState(nextState);\n      return state;\n    },',
    '    async getState() {\n      archivePaperLedgerMemory(paperLedger, state, "startup-backfill");\n      return state;\n    },\n    async saveState(nextState) {\n      archivePaperLedgerMemory(paperLedger, nextState, "state-save");\n      state = sanitizeState(nextState);\n      return state;\n    },',
    "memory archive before state sanitize",
  );
  output = mustReplace(
    output,
    '    async listScanRecords(limit) {\n      return scanLedger.slice(0, normalizeLedgerLimit(limit));\n    },\n    async getUpstoxAuth() {',
    '    async listScanRecords(limit) {\n      return scanLedger.slice(0, normalizeLedgerLimit(limit));\n    },\n    async archivePaperLedgerState(rawState, context = {}) {\n      return archivePaperLedgerMemory(paperLedger, rawState, context.source || "state-save");\n    },\n    async listPaperLedger(input = {}) {\n      return paperLedgerPage([...paperLedger.values()], input);\n    },\n    async getUpstoxAuth() {',
    "memory paper ledger contract",
  );
  output = mustReplace(
    output,
    '  let state = await readState();',
    `${PAPER_LEDGER_FILE_STORE}\n  let state = await readState();`,
    "file paper ledger functions",
  );
  output = mustReplace(
    output,
    '      const payload = JSON.parse(await fsp.readFile(STATE_FILE, "utf8"));\n      return sanitizeState(payload.state || payload);',
    '      const payload = JSON.parse(await fsp.readFile(STATE_FILE, "utf8"));\n      const rawState = payload.state || payload;\n      await archivePaperLedgerFile(rawState, "startup-backfill");\n      return sanitizeState(rawState);',
    "file startup paper ledger backfill",
  );
  output = mustReplace(
    output,
    '    async saveState(nextState) {\n      state = sanitizeState(nextState);\n      await writeState(state);\n      return state;\n    },',
    '    async saveState(nextState) {\n      await archivePaperLedgerFile(nextState, "state-save");\n      state = sanitizeState(nextState);\n      await writeState(state);\n      return state;\n    },',
    "file archive before state sanitize",
  );
  output = mustReplace(
    output,
    '    async listScanRecords(limit) {\n      return readLedger(limit);\n    },\n    async getUpstoxAuth() {',
    '    async listScanRecords(limit) {\n      return readLedger(limit);\n    },\n    async archivePaperLedgerState(rawState, context = {}) {\n      return archivePaperLedgerFile(rawState, context.source || "state-save");\n    },\n    async listPaperLedger(input = {}) {\n      return listPaperLedgerFile(input);\n    },\n    async getUpstoxAuth() {',
    "file paper ledger contract",
  );
  output = mustReplace(
    output,
    '      const scanLedger = database.collection("scan_ledger");\n      const upstoxAuth = database.collection("upstox_auth");',
    '      const scanLedger = database.collection("scan_ledger");\n      const paperLedger = database.collection("paper_ledger");\n      const upstoxAuth = database.collection("upstox_auth");',
    "Mongo paper ledger collection",
  );
  output = mustReplace(
    output,
    '      await withTimeout(upstoxAuth.createIndex({ updatedAt: -1 }), timeoutMs + 2_000, `MongoDB Upstox auth setup timed out after ${timeoutMs}ms`);',
    `      await withTimeout(upstoxAuth.createIndex({ updatedAt: -1 }), timeoutMs + 2_000, \`MongoDB Upstox auth setup timed out after \${timeoutMs}ms\`);\n      await withTimeout(paperLedger.createIndex({ kind: 1, occurredAtDate: -1, _id: -1 }), timeoutMs + 2_000, \`MongoDB paper ledger setup timed out after \${timeoutMs}ms\`);\n      await withTimeout(paperLedger.createIndex({ entity_id: 1, occurredAtDate: -1 }), timeoutMs + 2_000, \`MongoDB paper ledger entity index timed out after \${timeoutMs}ms\`);\n${PAPER_LEDGER_MONGO_STORE}`,
    "Mongo paper ledger functions",
  );
  output = mustReplace(
    output,
    '          if (doc?.state) return sanitizeState(doc.state);',
    '          if (doc?.state) { await archivePaperLedgerMongo(doc.state, "startup-backfill"); return sanitizeState(doc.state); }',
    "Mongo startup paper ledger backfill",
  );
  output = mustReplace(
    output,
    '        async saveState(nextState) {\n          const state = sanitizeState(nextState);',
    '        async saveState(nextState) {\n          await archivePaperLedgerMongo(nextState, "state-save");\n          const state = sanitizeState(nextState);',
    "Mongo archive before app state overwrite",
  );
  output = mustReplace(
    output,
    '        async getUpstoxAuth() {\n          const doc = await upstoxAuth.findOne({ _id: "default" });',
    '        async archivePaperLedgerState(rawState, context = {}) {\n          return archivePaperLedgerMongo(rawState, context.source || "state-save");\n        },\n        async listPaperLedger(input = {}) {\n          return listPaperLedgerMongo(input);\n        },\n        async getUpstoxAuth() {\n          const doc = await upstoxAuth.findOne({ _id: "default" });',
    "Mongo paper ledger contract",
  );
  output = mustReplace(
    output,
    '      if (url.pathname === "/api/paper-trader/orders") {',
    `${PAPER_LEDGER_ROUTE}\n      if (url.pathname === "/api/paper-trader/orders") {`,
    "paper ledger history API",
  );
  return output;
}
