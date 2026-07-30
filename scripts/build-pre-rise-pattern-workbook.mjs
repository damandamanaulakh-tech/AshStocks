import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const [evidencePath, eventLedgerPath, outputPath, previewDirectory] = process.argv.slice(2);
if (!evidencePath || !eventLedgerPath || !outputPath || !previewDirectory) {
  throw new Error(
    "Usage: node build-pre-rise-pattern-workbook.mjs <evidence.json> <event-ledger.csv> <output.xlsx> <preview-dir>",
  );
}

const evidence = JSON.parse(await fs.readFile(evidencePath, "utf8"));
const eventLedger = parseCsv(await fs.readFile(eventLedgerPath, "utf8"));
const outputDir = path.dirname(outputPath);
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDirectory, { recursive: true });

const workbook = Workbook.create();
const dashboard = workbook.worksheets.add("Dashboard");
const ranking = workbook.worksheets.add("Signal Ranking");
const stability = workbook.worksheets.add("Pattern Stability");
const crossStock = workbook.worksheets.add("Cross Stock");
const events = workbook.worksheets.add("Rise Event Ledger");
const latest = workbook.worksheets.add("Latest Snapshot");
const sources = workbook.worksheets.add("Sources & Method");

const colors = {
  navy: "#0B1F33",
  navy2: "#163A5F",
  teal: "#0F766E",
  green: "#15803D",
  paleGreen: "#DCFCE7",
  amber: "#B45309",
  paleAmber: "#FEF3C7",
  red: "#B91C1C",
  paleRed: "#FEE2E2",
  blue: "#2563EB",
  paleBlue: "#DBEAFE",
  gray: "#475569",
  paleGray: "#F1F5F9",
  line: "#CBD5E1",
  white: "#FFFFFF",
  black: "#111827",
};

for (const sheet of [dashboard, ranking, stability, crossStock, events, latest, sources]) {
  sheet.showGridLines = false;
}

const statsByPeriod = new Map(
  evidence.statistics.map((row) => [`${row.period}|${row.signal_id}`, row]),
);
const consistencyBySignal = new Map(
  evidence.symbol_consistency.map((row) => [row.signal_id, row]),
);
const primarySignals = new Set([
  "COMPRESSION_VOLUME_IGNITION_WATCH",
  "COMPRESSION_TO_VOLUME_IGNITION",
]);
const signalIds = [...new Set(evidence.statistics.map((row) => row.signal_id))];
const rankingRows = signalIds.map((signalId) => {
  const full = statsByPeriod.get(`FULL_2016_2026|${signalId}`) || {};
  const train = statsByPeriod.get(`TRAIN_2016_2020|${signalId}`) || {};
  const test = statsByPeriod.get(`TEST_2021_2026|${signalId}`) || {};
  const consistency = consistencyBySignal.get(signalId) || {};
  const status = primarySignals.has(signalId)
    ? signalId.endsWith("WATCH") ? "ACTIVE WATCH" : "ACTIVE STRONG"
    : (test.fires || 0) >= 30 && (test.lift || 0) > 1
      ? "SUPPORTING"
      : "CONTEXT / NO EDGE";
  return {
    signalId,
    full,
    train,
    test,
    consistency,
    status,
  };
}).sort((left, right) => {
  if (primarySignals.has(left.signalId) !== primarySignals.has(right.signalId)) {
    return primarySignals.has(left.signalId) ? -1 : 1;
  }
  return (right.test.lift || -1) - (left.test.lift || -1);
});

buildSignalRanking();
buildStability();
buildCrossStock();
buildEventLedger();
buildLatestSnapshot();
buildSources();
buildDashboard();

const inspectionParts = [];
inspectionParts.push(
  (
    await workbook.inspect({
      kind: "workbook,sheet,table,drawing",
      maxChars: 12000,
      tableMaxRows: 8,
      tableMaxCols: 12,
      tableMaxCellChars: 100,
    })
  ).ndjson,
);
inspectionParts.push(
  (
    await workbook.inspect({
      kind: "table",
      sheetId: "Dashboard",
      range: "A1:L38",
      include: "values,formulas",
      maxChars: 10000,
      tableMaxRows: 38,
      tableMaxCols: 12,
    })
  ).ndjson,
);
inspectionParts.push(
  (
    await workbook.inspect({
      kind: "match",
      searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
      options: { useRegex: true, maxResults: 300 },
      summary: "final formula error scan",
    })
  ).ndjson,
);
await fs.writeFile(
  `${outputPath}.inspect.ndjson`,
  inspectionParts.join("\n"),
  "utf8",
);

const renderRanges = {
  Dashboard: "A1:L38",
  "Signal Ranking": "A1:T24",
  "Pattern Stability": "A1:U28",
  "Cross Stock": "A1:H34",
  "Rise Event Ledger": "A1:N26",
  "Latest Snapshot": "A1:H24",
  "Sources & Method": "A1:G34",
};
for (const [sheetName, range] of Object.entries(renderRanges)) {
  const preview = await workbook.render({
    sheetName,
    range,
    scale: 1.3,
    format: "png",
  });
  await fs.writeFile(
    path.join(previewDirectory, `${sheetName.replaceAll(" ", "_")}.png`),
    new Uint8Array(await preview.arrayBuffer()),
  );
}

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(JSON.stringify({ ok: true, outputPath, sheets: Object.keys(renderRanges) }));

function buildSignalRanking() {
  const titleRange = ranking.getRange("A1:T2");
  titleRange.merge();
  titleRange.values = [["Signal Ranking — leakage-controlled 8% / 10-session test"]];
  styleTitle(titleRange);
  ranking.getRange("A3:T3").merge();
  ranking.getRange("A3:T3").values = [[
    "Filter by train/test lift, precision, fires, cross-stock consistency, or status. The two active rows are display-only tracker states.",
  ]];
  styleSubtitle(ranking.getRange("A3:T3"));

  const headers = [
    "Signal ID",
    "Full Fires",
    "Full Base Rate",
    "Full Precision",
    "Full Lift",
    "Full Z",
    "Test Fires",
    "Test Base Rate",
    "Test Precision",
    "Test Lift",
    "Test Z",
    "Train Fires",
    "Train Precision",
    "Train Lift",
    "Median Lead Days",
    "Full Recall",
    "Symbols Lift > 1",
    "Eligible Symbols",
    "Status",
    "Notes",
  ];
  const rows = rankingRows.map(({ signalId, full, train, test, consistency, status }) => [
    signalId,
    full.fires ?? null,
    full.base_rate ?? null,
    full.precision ?? null,
    full.lift ?? null,
    full.z_score_vs_nonfire ?? null,
    test.fires ?? null,
    test.base_rate ?? null,
    test.precision ?? null,
    test.lift ?? null,
    test.z_score_vs_nonfire ?? null,
    train.fires ?? null,
    train.precision ?? null,
    train.lift ?? null,
    full.median_lead_trading_days ?? null,
    full.recall ?? null,
    consistency.symbols_with_lift_gt_1 ?? null,
    consistency.eligible_symbols ?? null,
    status,
    status.startsWith("ACTIVE")
      ? "Observable lead pattern; never trade permission."
      : "Compared as supporting or context evidence.",
  ]);
  ranking.getRange(`A5:T${5 + rows.length}`).values = [headers, ...rows];
  const table = ranking.tables.add(`A5:T${5 + rows.length}`, true, "PreRiseSignalRanking");
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
  ranking.freezePanes.freezeRows(5);
  ranking.freezePanes.freezeColumns(1);
  styleHeader(ranking.getRange("A5:T5"));
  ranking.getRange(`C6:D${5 + rows.length}`).format.numberFormat = "0.00%";
  ranking.getRange(`H6:I${5 + rows.length}`).format.numberFormat = "0.00%";
  ranking.getRange(`M6:M${5 + rows.length}`).format.numberFormat = "0.00%";
  ranking.getRange(`P6:P${5 + rows.length}`).format.numberFormat = "0.00%";
  ranking.getRange(`E6:F${5 + rows.length}`).format.numberFormat = "0.000x";
  ranking.getRange(`J6:K${5 + rows.length}`).format.numberFormat = "0.000x";
  ranking.getRange(`N6:N${5 + rows.length}`).format.numberFormat = "0.000x";
  ranking.getRange(`A6:A${5 + rows.length}`).format.font = { color: colors.green };
  ranking.getRange(`J6:J${5 + rows.length}`).conditionalFormats.add("colorScale", {
    colors: [colors.paleRed, colors.paleAmber, colors.paleGreen],
    thresholds: ["min", "50%", "max"],
  });
  ranking.getRange(`S6:S${5 + rows.length}`).conditionalFormats.add("containsText", {
    text: "ACTIVE",
    format: { fill: colors.paleGreen, font: { color: colors.green, bold: true } },
  });
  setWidths(ranking, [
    ["A", 42], ["B", 11], ["C", 13], ["D", 13], ["E", 10], ["F", 10],
    ["G", 11], ["H", 13], ["I", 13], ["J", 10], ["K", 10], ["L", 11],
    ["M", 14], ["N", 11], ["O", 12], ["P", 11], ["Q", 13], ["R", 13],
    ["S", 18], ["T", 38],
  ]);
  ranking.getRange(`T6:T${5 + rows.length}`).format.wrapText = true;
}

function buildStability() {
  stability.getRange("A1:N2").merge();
  stability.getRange("A1:N2").values = [["Compression → Positive-Volume Ignition Stability"]];
  styleTitle(stability.getRange("A1:N2"));
  stability.getRange("A3:N3").merge();
  stability.getRange("A3:N3").values = [[
    "The selected 1.5x-volume watch and strong thresholds produced lift above 1.0 in every tested time block.",
  ]];
  styleSubtitle(stability.getRange("A3:N3"));

  const selectedGrid = evidence.compression_ignition_grid.filter((row) => (
    row.volume_multiple_threshold === 1.5
    && [2, 3].includes(row.inside_count_threshold)
  ));
  const headers = [
    "Level",
    "Inside Bars / 10",
    "Volume Multiple",
    "Period",
    "Fires",
    "Base Rate",
    "Precision",
    "Lift",
    "Z Score",
    "Median Lead Days",
    "Lift > 1",
  ];
  const rows = selectedGrid.map((row) => [
    row.inside_count_threshold === 3 ? "STRONG" : "WATCH",
    row.inside_count_threshold,
    row.volume_multiple_threshold,
    row.period,
    row.fires,
    row.base_rate,
    row.precision,
    row.lift,
    row.z_score_vs_nonfire,
    row.median_lead_trading_days,
    null,
  ]);
  stability.getRange(`A5:K${5 + rows.length}`).values = [headers, ...rows];
  for (let index = 0; index < rows.length; index += 1) {
    const excelRow = 6 + index;
    stability.getRange(`K${excelRow}`).formulas = [[`=IF(H${excelRow}>1,"YES","NO")`]];
  }
  const table = stability.tables.add(`A5:K${5 + rows.length}`, true, "PreRiseStability");
  table.style = "TableStyleMedium4";
  styleHeader(stability.getRange("A5:K5"));
  stability.freezePanes.freezeRows(5);
  stability.getRange(`C6:C${5 + rows.length}`).format.numberFormat = "0.00x";
  stability.getRange(`F6:G${5 + rows.length}`).format.numberFormat = "0.00%";
  stability.getRange(`H6:I${5 + rows.length}`).format.numberFormat = "0.000x";
  stability.getRange(`K6:K${5 + rows.length}`).conditionalFormats.add("containsText", {
    text: "YES",
    format: { fill: colors.paleGreen, font: { color: colors.green, bold: true } },
  });

  const blockNames = [
    "BLOCK_2016_2018",
    "BLOCK_2019_2021",
    "BLOCK_2022_2024",
    "BLOCK_2025_2026",
  ];
  const helper = [["Time Block", "WATCH Lift", "STRONG Lift"]];
  for (const blockName of blockNames) {
    const watch = selectedGrid.find(
      (row) => row.period === blockName && row.inside_count_threshold === 2,
    );
    const strong = selectedGrid.find(
      (row) => row.period === blockName && row.inside_count_threshold === 3,
    );
    helper.push([
      blockName.replace("BLOCK_", "").replaceAll("_", "-"),
      watch?.lift ?? null,
      strong?.lift ?? null,
    ]);
  }
  stability.getRange("M5:O9").values = helper;
  styleHeader(stability.getRange("M5:O5"));
  stability.getRange("N6:O9").format.numberFormat = "0.00x";
  const chart = stability.charts.add("line", stability.getRange("M5:O9"));
  chart.title = "Lift stayed above 1.0 in all four blocks";
  chart.hasLegend = true;
  chart.xAxis = { axisType: "textAxis", textStyle: { fontSize: 9 } };
  chart.yAxis = { numberFormatCode: "0.00x", min: 0.8, max: 3.0 };
  chart.setPosition("M11", "U27");
  setWidths(stability, [
    ["A", 12], ["B", 15], ["C", 15], ["D", 20], ["E", 10], ["F", 12],
    ["G", 12], ["H", 10], ["I", 10], ["J", 14], ["K", 10], ["L", 3],
    ["M", 18], ["N", 13], ["O", 13],
  ]);
}

function buildCrossStock() {
  crossStock.getRange("A1:H2").merge();
  crossStock.getRange("A1:H2").values = [["Cross-Stock Consistency"]];
  styleTitle(crossStock.getRange("A1:H2"));
  crossStock.getRange("A3:H3").merge();
  crossStock.getRange("A3:H3").values = [[
    "A pattern is not universal. This sheet shows exactly where lift was above or below 1.0.",
  ]];
  styleSubtitle(crossStock.getRange("A3:H3"));

  const rows = [];
  for (const signalId of [
    "COMPRESSION_VOLUME_IGNITION_WATCH",
    "COMPRESSION_TO_VOLUME_IGNITION",
  ]) {
    const item = consistencyBySignal.get(signalId);
    for (const detail of item?.symbol_details || []) {
      rows.push([
        signalId.endsWith("WATCH") ? "WATCH" : "STRONG",
        detail.symbol,
        detail.eligible_rows,
        detail.fires,
        detail.precision,
        detail.lift,
        null,
        detail.fires < 20 ? "Small fire count" : "Eligible",
      ]);
    }
  }
  const headers = [
    "Level",
    "Symbol",
    "Eligible Rows",
    "Fires",
    "Precision",
    "Lift",
    "Lift > 1",
    "Sample Note",
  ];
  crossStock.getRange(`A5:H${5 + rows.length}`).values = [headers, ...rows];
  for (let index = 0; index < rows.length; index += 1) {
    const excelRow = 6 + index;
    crossStock.getRange(`G${excelRow}`).formulas = [[`=IF(F${excelRow}>1,"YES","NO")`]];
  }
  const table = crossStock.tables.add(`A5:H${5 + rows.length}`, true, "PreRiseCrossStock");
  table.style = "TableStyleMedium9";
  styleHeader(crossStock.getRange("A5:H5"));
  crossStock.freezePanes.freezeRows(5);
  crossStock.getRange(`E6:E${5 + rows.length}`).format.numberFormat = "0.00%";
  crossStock.getRange(`F6:F${5 + rows.length}`).format.numberFormat = "0.000x";
  crossStock.getRange(`G6:G${5 + rows.length}`).conditionalFormats.add("containsText", {
    text: "YES",
    format: { fill: colors.paleGreen, font: { color: colors.green, bold: true } },
  });
  crossStock.getRange(`G6:G${5 + rows.length}`).conditionalFormats.add("containsText", {
    text: "NO",
    format: { fill: colors.paleRed, font: { color: colors.red, bold: true } },
  });
  setWidths(crossStock, [
    ["A", 11], ["B", 16], ["C", 14], ["D", 10],
    ["E", 12], ["F", 10], ["G", 10], ["H", 20],
  ]);
}

function buildEventLedger() {
  events.getRange("A1:N2").merge();
  events.getRange("A1:N2").values = [["Rise Event Ledger — historical validation anchors"]];
  styleTitle(events.getRange("A1:N2"));
  events.getRange("A3:N3").merge();
  events.getRange("A3:N3").values = [[
    "Each row is the first labeled date after five non-labeled sessions. Future returns are validation labels only.",
  ]];
  styleSubtitle(events.getRange("A3:N3"));
  const selectedSignals = [
    "COMPRESSION_VOLUME_IGNITION_WATCH",
    "COMPRESSION_TO_VOLUME_IGNITION",
    "INSIDE_BARS_GE_3_OF_10",
    "POSITIVE_VOLUME_WAKE_1_5X",
    "MOMENTUM_QUALITY",
    "DELIVERY_PCT_GE_1_1X_20D",
    "FII_INDEX_FUTURES_NET_POSITIVE",
    "INDIA_VIX_BELOW_20",
  ];
  const headers = [
    "Symbol",
    "Signal Date",
    "Close",
    "Future Max Return 10D",
    "Future Close Return 10D",
    "Days to +8%",
    "WATCH",
    "STRONG",
    "Inside Bars ≥ 3",
    "Positive Volume Wake",
    "Momentum Quality",
    "Delivery High",
    "FII Futures Net Positive",
    "VIX Below 20",
  ];
  const rows = eventLedger.map((row) => [
    row.symbol,
    excelDate(row.trade_date),
    toNumber(row.close),
    toNumber(row.future_max_return_10d),
    toNumber(row.future_close_return_10d),
    toNumber(row.days_to_rise_8pct),
    toBoolean(row[selectedSignals[0]]),
    toBoolean(row[selectedSignals[1]]),
    toBoolean(row[selectedSignals[2]]),
    toBoolean(row[selectedSignals[3]]),
    toBoolean(row[selectedSignals[4]]),
    toBoolean(row[selectedSignals[5]]),
    toBoolean(row[selectedSignals[6]]),
    toBoolean(row[selectedSignals[7]]),
  ]);
  events.getRange(`A5:N${5 + rows.length}`).values = [headers, ...rows];
  const table = events.tables.add(`A5:N${5 + rows.length}`, true, "PreRiseEventLedger");
  table.style = "TableStyleMedium2";
  styleHeader(events.getRange("A5:N5"));
  events.freezePanes.freezeRows(5);
  events.freezePanes.freezeColumns(2);
  events.getRange(`B6:B${5 + rows.length}`).format.numberFormat = "yyyy-mm-dd";
  events.getRange(`C6:C${5 + rows.length}`).format.numberFormat = "#,##0.00";
  events.getRange(`D6:E${5 + rows.length}`).format.numberFormat = "0.00%";
  events.getRange(`G6:N${5 + rows.length}`).conditionalFormats.add("cellIs", {
    operator: "equal",
    formula: "TRUE",
    format: { fill: colors.paleGreen, font: { color: colors.green, bold: true } },
  });
  setWidths(events, [
    ["A", 15], ["B", 13], ["C", 12], ["D", 18], ["E", 19], ["F", 12],
    ["G", 10], ["H", 10], ["I", 16], ["J", 19], ["K", 17], ["L", 14],
    ["M", 22], ["N", 14],
  ]);
}

function buildLatestSnapshot() {
  latest.getRange("A1:H1").merge();
  latest.getRange("A1:H1").values = [["Latest Available Historical Snapshot"]];
  styleTitle(latest.getRange("A1:H1"));
  latest.getRange("A2").values = [["Report As Of"]];
  latest.getRange("B2").values = [[new Date("2026-07-31T00:00:00Z")]];
  latest.getRange("B2").format.numberFormat = "yyyy-mm-dd";
  latest.getRange("A3:H3").merge();
  latest.getRange("A3:H3").values = [[
    "This is the latest date in the supplied historical panel, not a live quote. The runtime scanner now refreshes the tracker from current Upstox candles.",
  ]];
  styleSubtitle(latest.getRange("A3:H3"));
  const rows = evidence.latest_snapshot.map((row) => {
    const primaryStatus = row.active_signals.includes("COMPRESSION_TO_VOLUME_IGNITION")
      ? "STRONG"
      : row.active_signals.includes("COMPRESSION_VOLUME_IGNITION_WATCH")
        ? "WATCH"
        : row.active_signals.includes("INSIDE_BARS_GE_3_OF_10")
          ? "COMPRESSION"
          : "NO HIT";
    return [
      row.symbol,
      excelDate(row.as_of),
      row.close,
      null,
      primaryStatus,
      row.active_signal_count,
      row.active_signals.join(" | "),
      null,
    ];
  });
  const headers = [
    "Symbol",
    "Latest Source Date",
    "Close",
    "Stale Days",
    "Primary Pattern",
    "Active Signal Count",
    "Active Signals",
    "Data Status",
  ];
  latest.getRange(`A5:H${5 + rows.length}`).values = [headers, ...rows];
  for (let index = 0; index < rows.length; index += 1) {
    const excelRow = 6 + index;
    latest.getRange(`D${excelRow}`).formulas = [[`=$B$2-B${excelRow}`]];
    latest.getRange(`H${excelRow}`).formulas = [[
      `=IF(D${excelRow}>30,"STALE","CURRENT ENOUGH")`,
    ]];
  }
  const table = latest.tables.add(`A5:H${5 + rows.length}`, true, "PreRiseLatestSnapshot");
  table.style = "TableStyleMedium4";
  styleHeader(latest.getRange("A5:H5"));
  latest.freezePanes.freezeRows(5);
  latest.getRange(`B6:B${5 + rows.length}`).format.numberFormat = "yyyy-mm-dd";
  latest.getRange(`C6:C${5 + rows.length}`).format.numberFormat = "#,##0.00";
  latest.getRange(`H6:H${5 + rows.length}`).conditionalFormats.add("containsText", {
    text: "STALE",
    format: { fill: colors.paleAmber, font: { color: colors.amber, bold: true } },
  });
  latest.getRange(`E6:E${5 + rows.length}`).conditionalFormats.add("containsText", {
    text: "STRONG",
    format: { fill: colors.paleGreen, font: { color: colors.green, bold: true } },
  });
  setWidths(latest, [
    ["A", 15], ["B", 17], ["C", 12], ["D", 11],
    ["E", 17], ["F", 17], ["G", 60], ["H", 18],
  ]);
  latest.getRange(`G6:G${5 + rows.length}`).format.wrapText = true;
}

function buildSources() {
  sources.getRange("A1:G2").merge();
  sources.getRange("A1:G2").values = [["Sources, Method, and Checks"]];
  styleTitle(sources.getRange("A1:G2"));
  const sourceHeaders = [
    "Source",
    "Role",
    "Rows",
    "Date Start",
    "Date End",
    "Status",
    "Audit Note",
  ];
  const sourceRows = [
    [
      "nse_volume_delivery_16stocks_eq_merged.csv",
      "Primary stock-day OHLCV + delivery panel",
      32201,
      excelDate("2016-02-02"),
      excelDate("2026-06-08"),
      "USED",
      "16 stocks; uneven coverage.",
    ],
    [
      "India_VIX_historical.csv",
      "Market volatility context",
      null,
      excelDate("2018-01-01"),
      excelDate("2024-07-01"),
      "TESTED / CONTEXT",
      "Falling VIX did not improve the primary outcome.",
    ],
    [
      "fii_daily_aggregate.csv",
      "FII aggregate context",
      null,
      excelDate("2009-01-01"),
      excelDate("2020-12-31"),
      "TESTED / LIMITED",
      "No post-2020 coverage.",
    ],
    [
      "pwoi_fii_derivatives_features_2012_2023.csv",
      "FII derivatives context",
      2791,
      excelDate("2012-01-02"),
      excelDate("2023-04-27"),
      "TESTED / REGIME DEPENDENT",
      "Negative train lift; positive 2021-2023 lift.",
    ],
    [
      "fii_symbol_daily.csv",
      "Stock-level FII context",
      89931,
      excelDate("2009-01-01"),
      excelDate("2020-12-31"),
      "TESTED / NO STANDALONE EDGE",
      "Mapped to the 16-stock panel where names were available.",
    ],
  ];
  sources.getRange(`A5:G${5 + sourceRows.length}`).values = [sourceHeaders, ...sourceRows];
  const sourceTable = sources.tables.add(
    `A5:G${5 + sourceRows.length}`,
    true,
    "PreRiseSources",
  );
  sourceTable.style = "TableStyleMedium2";
  styleHeader(sources.getRange("A5:G5"));
  sources.getRange(`D6:E${5 + sourceRows.length}`).format.numberFormat = "yyyy-mm-dd";

  const methodStart = 13;
  sources.getRange(`A${methodStart}:G${methodStart}`).merge();
  sources.getRange(`A${methodStart}:G${methodStart}`).values = [["Method and Governance"]];
  styleSection(sources.getRange(`A${methodStart}:G${methodStart}`));
  const methodRows = [
    ["Rise label", "Future maximum close return ≥ 8% within 10 trading sessions."],
    ["Leakage control", "Signals use only current and prior sessions; future data creates labels only."],
    ["Train/test split", "2016-2020 training; 2021-2026 temporal test."],
    ["Stability blocks", "2016-2018, 2019-2021, 2022-2024, and 2025-2026."],
    ["Watch pattern", "At least 2 inside bars in 10 + positive close + volume ≥ 1.5x 20D."],
    ["Strong pattern", "At least 3 inside bars in 10 + positive close + volume ≥ 1.5x 20D."],
    ["Execution impact", "None. Display only; no rank, sizing, Kelly, paper-order, or live-order change."],
    ["Edge status", "NOT CONFIRMED. Positive lift does not make the signal universal."],
  ];
  sources.getRange(`A${methodStart + 1}:B${methodStart + methodRows.length}`).values = methodRows;
  sources.getRange(`A${methodStart + 1}:A${methodStart + methodRows.length}`).format.font = {
    bold: true,
    color: colors.navy2,
  };
  sources.getRange(`B${methodStart + 1}:B${methodStart + methodRows.length}`).format.wrapText = true;

  const checkStart = 24;
  sources.getRange(`A${checkStart}:G${checkStart}`).merge();
  sources.getRange(`A${checkStart}:G${checkStart}`).values = [["Checks"]];
  styleSection(sources.getRange(`A${checkStart}:G${checkStart}`));
  const checkHeaderRow = checkStart + 1;
  const checkDataStart = checkStart + 2;
  const checks = [
    ["Source rows", evidence.rows, 32201, null, "Exact primary row count"],
    ["Symbols", evidence.symbols.length, 16, null, "Exact primary symbol count"],
    ["Strong full lift", valueFor("COMPRESSION_TO_VOLUME_IGNITION", "FULL_2016_2026", "lift"), 1.5632907611, null, "Matches evidence JSON"],
    ["Watch test lift", valueFor("COMPRESSION_VOLUME_IGNITION_WATCH", "TEST_2021_2026", "lift"), 1.3705866349, null, "Matches evidence JSON"],
    ["Edge confirmed", false, false, null, "Must remain false"],
  ];
  sources.getRange(`A${checkHeaderRow}:E${checkHeaderRow}`).values = [[
    "Check",
    "Actual",
    "Expected",
    "Status",
    "Notes",
  ]];
  styleHeader(sources.getRange(`A${checkHeaderRow}:E${checkHeaderRow}`));
  sources.getRange(`A${checkDataStart}:E${checkDataStart + checks.length - 1}`).values = checks;
  for (let index = 0; index < checks.length; index += 1) {
    const excelRow = checkDataStart + index;
    sources.getRange(`D${excelRow}`).formulas = [[
      `=IF(OR(B${excelRow}=C${excelRow},IFERROR(ABS(B${excelRow}-C${excelRow})<0.000000001,FALSE)),"OK","FAIL")`,
    ]];
  }
  sources.getRange(`D${checkDataStart}:D${checkDataStart + checks.length - 1}`).conditionalFormats.add("containsText", {
    text: "OK",
    format: { fill: colors.paleGreen, font: { color: colors.green, bold: true } },
  });
  sources.getRange(`D${checkDataStart}:D${checkDataStart + checks.length - 1}`).conditionalFormats.add("containsText", {
    text: "FAIL",
    format: { fill: colors.paleRed, font: { color: colors.red, bold: true } },
  });
  sources.freezePanes.freezeRows(5);
  setWidths(sources, [
    ["A", 38], ["B", 48], ["C", 14], ["D", 14], ["E", 14], ["F", 24], ["G", 45],
  ]);
  sources.getRange("A1:G34").format.wrapText = true;
}

function buildDashboard() {
  dashboard.getRange("A1:L2").merge();
  dashboard.getRange("A1:L2").values = [["ASH STOCK — Pre-Rise Pattern Tracker"]];
  styleTitle(dashboard.getRange("A1:L2"));
  dashboard.getRange("A3:L3").merge();
  dashboard.getRange("A3:L3").values = [[
    "Evidence audit as of 2026-07-31 | 32,201 stock-days | 16 stocks | observational and paper-only",
  ]];
  styleSubtitle(dashboard.getRange("A3:L3"));

  const strongRow = 6 + rankingRows.findIndex(
    (row) => row.signalId === "COMPRESSION_TO_VOLUME_IGNITION",
  );
  const watchRow = 6 + rankingRows.findIndex(
    (row) => row.signalId === "COMPRESSION_VOLUME_IGNITION_WATCH",
  );
  const cards = [
    ["A5:C8", "Universal identical sign?", "NO", "No single signal appears before every rise."],
    ["D5:F8", "Strong test lift", `='Signal Ranking'!J${strongRow}`, "1.949x in 2021-2026."],
    ["G5:I8", "Strong test precision", `='Signal Ranking'!I${strongRow}`, "15.60% versus 8.00% base."],
    ["J5:L8", "Median lead", 8, "8 sessions in temporal test."],
  ];
  for (const [range, label, value, note] of cards) {
    const [from, to] = range.split(":");
    const fromColumn = from.match(/[A-Z]+/)[0];
    const toColumn = to.match(/[A-Z]+/)[0];
    const startRow = Number(from.match(/\d+/)[0]);
    const labelRange = dashboard.getRange(`${fromColumn}${startRow}:${toColumn}${startRow}`);
    labelRange.merge();
    labelRange.values = [[label]];
    labelRange.format = {
      fill: colors.navy2,
      font: { bold: true, color: colors.white, size: 10 },
      horizontalAlignment: "center",
      verticalAlignment: "center",
    };
    const valueRange = dashboard.getRange(`${fromColumn}${startRow + 1}:${toColumn}${startRow + 2}`);
    valueRange.merge();
    if (String(value).startsWith("=")) valueRange.formulas = [[value]];
    else valueRange.values = [[value]];
    valueRange.format = {
      fill: colors.paleBlue,
      font: {
        bold: true,
        color: value === "NO" ? colors.red : colors.green,
        size: 18,
      },
      horizontalAlignment: "center",
      verticalAlignment: "center",
      borders: { preset: "outside", style: "thin", color: colors.line },
    };
    const noteRange = dashboard.getRange(`${fromColumn}${startRow + 3}:${toColumn}${startRow + 3}`);
    noteRange.merge();
    noteRange.values = [[note]];
    noteRange.format = {
      fill: colors.paleGray,
      font: { color: colors.gray, size: 9 },
      horizontalAlignment: "center",
      wrapText: true,
      borders: { preset: "outside", style: "thin", color: colors.line },
    };
  }
  dashboard.getRange("D6:F7").format.numberFormat = "0.000x";
  dashboard.getRange("G6:I7").format.numberFormat = "0.00%";
  dashboard.getRange("J6:L7").format.numberFormat = "0.0";

  dashboard.getRange("A10:L10").merge();
  dashboard.getRange("A10:L10").values = [["What repeated before the rise"]];
  styleSection(dashboard.getRange("A10:L10"));
  const findingRows = [
    ["1", "Compression", "Two or more inside bars appeared in the last 10 comparisons."],
    ["2", "Ignition", "The latest close was positive and volume reached at least 1.5x its 20-session average."],
    ["3", "Strong state", "Three or more inside bars plus the same volume ignition raised full-sample odds by 1.563x."],
    ["4", "Governance", "The tracker is display-only and does not change ranking, sizing, Kelly, or order permission."],
  ];
  dashboard.getRange("A11:L14").values = findingRows.map(([step, label, text]) => [
    step,
    label,
    text,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
  for (let row = 11; row <= 14; row += 1) {
    dashboard.getRange(`C${row}:L${row}`).merge();
  }
  dashboard.getRange("A11:A14").format = {
    fill: colors.teal,
    font: { bold: true, color: colors.white },
    horizontalAlignment: "center",
  };
  dashboard.getRange("B11:B14").format.font = { bold: true, color: colors.navy2 };
  dashboard.getRange("C11:L14").format.wrapText = true;
  dashboard.getRange("A11:L14").format.borders = {
    preset: "inside",
    style: "thin",
    color: colors.line,
  };

  const chartData = [
    ["Pattern / Period", "Base Rate", "Pattern Precision"],
    ["WATCH Full", valueFor("COMPRESSION_VOLUME_IGNITION_WATCH", "FULL_2016_2026", "base_rate"), valueFor("COMPRESSION_VOLUME_IGNITION_WATCH", "FULL_2016_2026", "precision")],
    ["WATCH Test", valueFor("COMPRESSION_VOLUME_IGNITION_WATCH", "TEST_2021_2026", "base_rate"), valueFor("COMPRESSION_VOLUME_IGNITION_WATCH", "TEST_2021_2026", "precision")],
    ["STRONG Full", valueFor("COMPRESSION_TO_VOLUME_IGNITION", "FULL_2016_2026", "base_rate"), valueFor("COMPRESSION_TO_VOLUME_IGNITION", "FULL_2016_2026", "precision")],
    ["STRONG Test", valueFor("COMPRESSION_TO_VOLUME_IGNITION", "TEST_2021_2026", "base_rate"), valueFor("COMPRESSION_TO_VOLUME_IGNITION", "TEST_2021_2026", "precision")],
  ];
  dashboard.getRange("A33:C37").values = chartData;
  styleHeader(dashboard.getRange("A33:C33"));
  dashboard.getRange("B34:C37").format.numberFormat = "0.0%";
  const chart = dashboard.charts.add("bar", dashboard.getRange("A33:C37"));
  chart.title = "Pattern precision exceeded the matching base rate";
  chart.hasLegend = true;
  chart.xAxis = { axisType: "textAxis", textStyle: { fontSize: 9 } };
  chart.yAxis = { numberFormatCode: "0%", min: 0, max: 0.22 };
  chart.setPosition("A16", "F31");

  dashboard.getRange("G16:L16").merge();
  dashboard.getRange("G16:L16").values = [["Current interpretation"]];
  styleSection(dashboard.getRange("G16:L16"));
  dashboard.getRange("G17:L24").merge();
  dashboard.getRange("G17:L24").values = [[
    "The common pre-rise structure is not a magic signal. Compression followed by positive volume ignition repeated across all four time blocks and improved conditional odds, but the strong pattern fired only 221 times and captured roughly 1.1% of labeled rise-days. Most rises used a different path. Treat STRONG as a research alert, not a prediction or permission to buy.",
  ]];
  dashboard.getRange("G17:L24").format = {
    fill: colors.paleAmber,
    font: { color: colors.black, size: 11 },
    wrapText: true,
    verticalAlignment: "top",
    borders: { preset: "outside", style: "thin", color: colors.amber },
  };
  dashboard.getRange("G26:L26").merge();
  dashboard.getRange("G26:L26").values = [["Clean state"]];
  styleSection(dashboard.getRange("G26:L26"));
  dashboard.getRange("G27:L31").merge();
  dashboard.getRange("G27:L31").values = [[
    "Tracker: ACTIVE OBSERVATION\nEdge confirmed: NO\nLive ready: NO\nScanner ranking impact: NONE\nPosition/Kelly/order impact: NONE",
  ]];
  dashboard.getRange("G27:L31").format = {
    fill: colors.paleGreen,
    font: { color: colors.green, bold: true, size: 11 },
    wrapText: true,
    verticalAlignment: "center",
    borders: { preset: "outside", style: "thin", color: colors.green },
  };
  setWidths(dashboard, [
    ["A", 11], ["B", 18], ["C", 16], ["D", 11], ["E", 18], ["F", 16],
    ["G", 11], ["H", 18], ["I", 16], ["J", 11], ["K", 18], ["L", 16],
  ]);
  dashboard.getRange("A1:L38").format.rowHeight = 20;
  dashboard.getRange("A1:L2").format.rowHeight = 28;
}

function styleTitle(range) {
  range.format = {
    fill: colors.navy,
    font: { bold: true, color: colors.white, size: 18 },
    horizontalAlignment: "left",
    verticalAlignment: "center",
    borders: { preset: "outside", style: "medium", color: colors.navy },
  };
}

function styleSubtitle(range) {
  range.format = {
    fill: colors.paleBlue,
    font: { color: colors.navy2, italic: true, size: 10 },
    wrapText: true,
    verticalAlignment: "center",
    borders: { preset: "outside", style: "thin", color: colors.line },
  };
}

function styleSection(range) {
  range.format = {
    fill: colors.navy2,
    font: { bold: true, color: colors.white, size: 11 },
    verticalAlignment: "center",
  };
}

function styleHeader(range) {
  range.format = {
    fill: colors.teal,
    font: { bold: true, color: colors.white },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: colors.teal },
  };
}

function setWidths(sheet, widths) {
  for (const [column, width] of widths) {
    sheet.getRange(`${column}:${column}`).format.columnWidth = width;
  }
}

function valueFor(signalId, period, field) {
  return statsByPeriod.get(`${period}|${signalId}`)?.[field] ?? null;
}

function excelDate(value) {
  if (!value) return null;
  return new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toBoolean(value) {
  return String(value).trim().toLowerCase() === "true";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const [headers, ...data] = rows.filter((item) => item.some((cell) => cell !== ""));
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [
    header,
    values[index] ?? "",
  ])));
}
