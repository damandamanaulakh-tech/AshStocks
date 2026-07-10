#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const FII_SYMBOL_FILE = "fii_symbol_daily.csv";
const RANKED_FILE = "Q1_FII_20D_ranked_top_bottom_deciles_READY_FOR_PRICE_JOIN.csv";
const DAILY_CLOSE_FILE = "daily_close_by_scrip.csv";
const NIFTY_CLOSE_FILE = "nifty_daily_close.csv";
const RESULT_FILE = "Q1_FII_20D_forward_return_result.csv";
const SUMMARY_FILE = "Q1_FII_20D_summary.csv";
const ERRORS_FILE = "Q1_FII_20D_fetch_errors.csv";
const NIFTY_INSTRUMENT_KEY = "NSE_INDEX|Nifty 50";

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim().slice(0, 10);
  const normalized = text.includes("/") ? text.replaceAll("/", "-") : text;
  const parts = normalized.split("-");
  if (parts.length !== 3) return null;
  let yyyy;
  let mm;
  let dd;
  if (parts[0].length === 4) {
    [yyyy, mm, dd] = parts;
  } else {
    [dd, mm, yyyy] = parts;
  }
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function coalesce(row, names) {
  const lowered = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), String(value || "").trim()]));
  for (const name of names) {
    const value = lowered[name.toLowerCase()];
    if (value) return value;
  }
  return "";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted && char === "\"" && next === "\"") {
      cell += "\"";
      i += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, "").trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

async function readCsv(filePath) {
  return parseCsv(await fs.readFile(filePath, "utf8"));
}

async function writeCsv(filePath, rows, fieldnames) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const lines = [
    fieldnames.join(","),
    ...rows.map((row) => fieldnames.map((field) => csvEscape(row[field])).join(","))
  ];
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

function symbolMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const symbol = coalesce(row, ["symbol", "tradingsymbol", "ticker", "scrip", "scrip_name"]);
    const key = coalesce(row, ["instrument_key", "instrumentKey", "upstox_instrument_key", "token"]);
    if (symbol && key) map.set(symbol.toUpperCase(), key);
  }
  return map;
}

function rankedItems(rows, mapping) {
  const items = [];
  for (const row of rows) {
    const symbol = coalesce(row, ["symbol", "tradingsymbol", "ticker", "scrip", "scrip_name"]);
    let key = coalesce(row, ["instrument_key", "instrumentKey", "upstox_instrument_key", "token"]);
    const signalDate = parseDate(coalesce(row, ["date", "signal_date", "trade_date", "asof_date"]));
    const bucket = coalesce(row, ["bucket", "decile", "side", "rank_bucket"]);
    if (symbol && !key) key = mapping.get(symbol.toUpperCase()) || "";
    if (symbol && key && signalDate) {
      items.push({ ...row, symbol, instrument_key: key, signal_date: isoDay(signalDate), bucket });
    }
  }
  return items;
}

async function fetchDailyCandles(accessToken, instrumentKey, start, end) {
  const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/day/${isoDay(end)}/${isoDay(start)}`;
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) throw new Error(`Upstox historical candle returned ${response.status}`);
  const payload = await response.json();
  const candles = payload.data?.candles || [];
  return candles.map((candle) => ({
    instrument_key: instrumentKey,
    ts: candle[0],
    open: Number(candle[1]),
    high: Number(candle[2]),
    low: Number(candle[3]),
    close: Number(candle[4]),
    volume: Number(candle[5] || 0),
    open_interest: Number(candle[6] || 0),
    interval: "day"
  })).filter((candle) => Number.isFinite(candle.close));
}

function firstCloseOnOrAfter(closes, targetDay, leewayDays = 8) {
  for (let offset = 0; offset <= leewayDays; offset += 1) {
    const day = isoDay(addDays(targetDay, offset));
    if (closes.has(day)) return [day, closes.get(day)];
  }
  return ["", null];
}

function forwardRows(items, candleRows) {
  const grouped = new Map();
  for (const row of candleRows) {
    if (!grouped.has(row.instrument_key)) grouped.set(row.instrument_key, new Map());
    grouped.get(row.instrument_key).set(row.date, Number(row.close));
  }

  return items.map((item) => {
    const signalDay = parseDate(item.signal_date);
    const closes = grouped.get(item.instrument_key) || new Map();
    const [entryDate, entryClose] = firstCloseOnOrAfter(closes, signalDay);
    const [forwardDate, forwardClose] = firstCloseOnOrAfter(closes, addDays(signalDay, 20), 12);
    const forwardReturn = entryClose && forwardClose ? Number(((forwardClose / entryClose - 1) * 100).toFixed(6)) : "";
    return {
      symbol: item.symbol,
      instrument_key: item.instrument_key,
      bucket: item.bucket || "",
      signal_date: item.signal_date,
      entry_date: entryDate,
      entry_close: entryClose ?? "",
      forward_20d_date: forwardDate,
      forward_20d_close: forwardClose ?? "",
      forward_20d_return_pct: forwardReturn
    };
  });
}

function summaryRows(results, fetchedSymbols, errors) {
  const numeric = results.map((row) => Number(row.forward_20d_return_pct)).filter(Number.isFinite);
  const avg = numeric.length ? Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(6)) : "";
  return [
    { metric: "ranked_rows", value: results.length },
    { metric: "rows_with_forward_return", value: numeric.length },
    { metric: "average_forward_20d_return_pct", value: avg },
    { metric: "fetched_symbols", value: fetchedSymbols },
    { metric: "fetch_errors", value: errors.length }
  ];
}

async function run() {
  const accessToken = process.env.UPSTOX_ACCESS_TOKEN;
  if (!accessToken) throw new Error("UPSTOX_ACCESS_TOKEN missing");

  const inputDir = argValue("--input-dir", "data/q1_inputs");
  const outputDir = argValue("--output-dir", "data/q1_outputs");
  const pauseSeconds = Number(argValue("--pause-seconds", "0.2"));

  const symbolRows = await readCsv(path.join(inputDir, FII_SYMBOL_FILE));
  const rankedRows = await readCsv(path.join(inputDir, RANKED_FILE));
  const mapping = symbolMap(symbolRows);
  const items = rankedItems(rankedRows, mapping);
  if (!items.length) throw new Error("No Q1 ranked rows with symbol, instrument_key and signal_date");

  const signalDates = items.map((item) => parseDate(item.signal_date)).filter(Boolean);
  const start = addDays(new Date(Math.min(...signalDates.map((date) => date.getTime()))), -5);
  const end = addDays(new Date(Math.max(...signalDates.map((date) => date.getTime()))), 45);

  const candleRows = [];
  const errors = [];
  const unique = Array.from(new Map(items.map((item) => [`${item.symbol}|${item.instrument_key}`, item])).values());
  for (const item of unique.sort((a, b) => a.symbol.localeCompare(b.symbol))) {
    try {
      const candles = await fetchDailyCandles(accessToken, item.instrument_key, start, end);
      for (const candle of candles) {
        candleRows.push({ ...candle, symbol: item.symbol, date: String(candle.ts).slice(0, 10) });
      }
    } catch (error) {
      errors.push(`${item.symbol}: ${error.message}`);
    }
    if (pauseSeconds) await new Promise((resolve) => setTimeout(resolve, pauseSeconds * 1000));
  }

  const niftyRows = [];
  try {
    const candles = await fetchDailyCandles(accessToken, NIFTY_INSTRUMENT_KEY, start, end);
    niftyRows.push(...candles.map((candle) => ({ date: String(candle.ts).slice(0, 10), close: candle.close, instrument_key: candle.instrument_key })));
  } catch (error) {
    errors.push(`NIFTY: ${error.message}`);
  }

  const results = forwardRows(items, candleRows);
  await writeCsv(path.join(outputDir, DAILY_CLOSE_FILE), candleRows, ["symbol", "instrument_key", "date", "ts", "open", "high", "low", "close", "volume", "open_interest", "interval"]);
  await writeCsv(path.join(outputDir, NIFTY_CLOSE_FILE), niftyRows, ["date", "close", "instrument_key"]);
  await writeCsv(path.join(outputDir, RESULT_FILE), results, ["symbol", "instrument_key", "bucket", "signal_date", "entry_date", "entry_close", "forward_20d_date", "forward_20d_close", "forward_20d_return_pct"]);
  await writeCsv(path.join(outputDir, SUMMARY_FILE), summaryRows(results, unique.length, errors), ["metric", "value"]);
  if (errors.length) await writeCsv(path.join(outputDir, ERRORS_FILE), errors.map((error) => ({ error })), ["error"]);

  return { symbols: unique.length, candles: candleRows.length, results: results.length, errors: errors.length };
}

run()
  .then((stats) => {
    console.log(JSON.stringify({ ok: true, ...stats }));
  })
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  });
