(() => {
  const TOTAL_PARAMETERS = 2000;
  const FAMILIES = [
    { name: "Universe", range: [1, 120], fields: ["symbol", "instrument_key", "isin", "sector"] },
    { name: "Data Coverage", range: [121, 260], fields: ["close", "close_127", "close_253", "last_candle_date"] },
    { name: "Price Trend", range: [261, 400], fields: ["return_6m_pct", "return_12m_pct", "momentum_score", "close"] },
    { name: "Relative Strength", range: [401, 540], fields: ["score", "paper_score", "intelligence_score", "decision"] },
    { name: "Liquidity", range: [541, 680], fields: ["adv20", "rupee_turnover_cr", "volume"] },
    { name: "Candle Structure + Volume", range: [681, 800], fields: ["candle_status", "candle_score", "candle_patterns", "candle_evidence"] },
    { name: "Target Room", range: [801, 920], fields: ["target_potential", "target_pct", "target_price", "target2"] },
    { name: "Risk Safety", range: [921, 1040], fields: ["regime_risk", "risk_score", "reason"] },
    { name: "FII/DII Flow", range: [1041, 1160], fields: ["flow_score", "intelligence.flow_score"] },
    { name: "Event Lift", range: [1161, 1280], fields: ["event_resilience", "reason", "intelligence.notes"] },
    { name: "Hot Pocket", range: [1281, 1400], fields: ["hot_pocket_score", "theme_heat", "themes", "sector"] },
    { name: "Advisor Ready", range: [1401, 1520], fields: ["advisor", "paper_ready", "watch_ready", "paper_reason"] },
    { name: "Entry Target Stop", range: [1521, 1640], fields: ["advisor.entry_zone", "advisor.target1", "advisor.target2", "advisor.stop", "paper_order"] },
    { name: "Watchlist Rotation", range: [1641, 1760], fields: ["decision", "target_potential", "paper_order"] },
    { name: "Sell Replace", range: [1761, 1880], fields: ["reason", "paper_order", "exit_rule"] },
    { name: "Paper Safety", range: [1881, 2000], fields: ["paper_order", "broker_write_enabled", "paper_only"] }
  ];

  const state = { rows: [], enabled: false, parameter: 1, family: null, matched: new Set(), lastCount: 0 };
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      state.rows = Array.isArray(payload.rows) ? payload.rows : [];
      applyParameterTradeQueueFilter();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => boot());

  document.addEventListener("input", (event) => {
    if (event.target.closest("#uwParameterFilterPanel")) activateFromPanel();
  }, true);

  document.addEventListener("change", (event) => {
    if (event.target.closest("#uwParameterFilterPanel")) activateFromPanel();
  }, true);

  document.addEventListener("click", (event) => {
    if (event.target.closest("button[data-clear-uw-param-trade-filter]")) {
      state.enabled = false;
      state.matched = new Set();
      applyParameterTradeQueueFilter();
      renderBridgeStatus();
      return;
    }
    if (event.target.closest("#uwParameterFilterPanel button, #uwParameterFilterPanel input, #uwParameterFilterPanel select")) {
      setTimeout(activateFromPanel, 0);
    }
  }, true);

  function boot() {
    const observer = new MutationObserver(() => {
      installBridgeStatus();
      applyParameterTradeQueueFilter();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    installBridgeStatus();
    applyParameterTradeQueueFilter();
  }

  function activateFromPanel() {
    state.enabled = true;
    const param = Number(document.querySelector("#uwParamNumber")?.value || 1);
    state.parameter = clamp(param, 1, TOTAL_PARAMETERS);
    const familySelect = document.querySelector("#uwFamilyFilter")?.value || "ALL";
    state.family = familySelect !== "ALL" ? familyByName(familySelect) : familyForParam(state.parameter);
    applyParameterTradeQueueFilter();
    publishFilter();
  }

  function installBridgeStatus() {
    const bridge = document.querySelector("#uwTradeQueueBridge");
    if (!bridge || bridge.querySelector("#uwParameterTradeBridge")) return;
    const summary = bridge.querySelector("#uwTradeQueueSummary");
    const node = document.createElement("div");
    node.id = "uwParameterTradeBridge";
    node.className = "uw-parameter-trade-bridge";
    node.innerHTML = `<span>Parameter trade filter</span><strong>No parameter filter applied</strong><button type="button" data-clear-uw-param-trade-filter>Clear</button>`;
    if (summary) summary.insertAdjacentElement("beforebegin", node);
    else bridge.appendChild(node);
  }

  function applyParameterTradeQueueFilter() {
    installBridgeStatus();
    const rows = Array.from(document.querySelectorAll("#uwTradeQueueBody tr"));
    if (!rows.length) return;
    if (!state.enabled || !state.family) {
      rows.forEach((tr) => { tr.hidden = false; tr.classList.remove("uw-param-filter-hidden"); });
      state.lastCount = rows.length;
      renderBridgeStatus();
      return;
    }

    const family = state.family;
    const matches = new Set(state.rows.filter((row) => rowPassesFamily(row, family)).map((row) => row.symbol));
    let visible = 0;
    for (const tr of rows) {
      const symbol = tr.querySelector("button[data-select-symbol]")?.dataset?.selectSymbol || "";
      const pass = matches.has(symbol);
      tr.hidden = !pass;
      tr.classList.toggle("uw-param-filter-hidden", !pass);
      if (pass) visible += 1;
    }
    state.matched = matches;
    state.lastCount = visible;
    renderBridgeStatus();
  }

  function renderBridgeStatus() {
    const node = document.querySelector("#uwParameterTradeBridge");
    if (!node) return;
    const strong = node.querySelector("strong");
    if (!strong) return;
    if (!state.enabled || !state.family) {
      strong.textContent = "No parameter filter applied";
      return;
    }
    strong.textContent = `P${state.parameter} ${state.family.name}: ${state.lastCount} queue rows visible`;
  }

  function publishFilter() {
    window.dispatchEvent(new CustomEvent("ashstocks:upstox-parameter-trade-filter", {
      detail: {
        enabled: state.enabled,
        parameter: state.parameter,
        family: state.family?.name || "",
        matched_symbols: Array.from(state.matched),
        visible_rows: state.lastCount,
        source: "app-upstox-parameter-trade-bridge"
      }
    }));
  }

  function rowPassesFamily(row, family) {
    if (!row?.symbol) return false;
    if (row.decision === "DATA_NEEDED" || row.fetch_error) return family.name === "Data Coverage" || family.name === "Paper Safety";
    const score = familyScore(row, family);
    return score >= 35 || hasAnyField(row, family.fields);
  }

  function familyScore(row, family) {
    if (family.name === "Universe") return row.instrument_key ? 100 : 20;
    if (family.name === "Data Coverage") return Math.max(Number(row.parameter_coverage || 0), row.close && row.last_candle_date ? 80 : row.close ? 40 : 0);
    if (family.name === "Price Trend") return Math.max(Number(row.momentum_score || 0), Math.min(100, Math.max(0, Number(row.return_6m_pct || 0) + Number(row.return_12m_pct || 0) / 2)));
    if (family.name === "Relative Strength") return Number(row.intelligence_score || row.paper_score || row.score || 0);
    if (family.name === "Liquidity") return Math.min(100, Number(row.rupee_turnover_cr || 0) * 6 || Number(row.adv20 || 0) / 100000);
    if (family.name === "Candle Structure + Volume") return Number(row.candle_score || row.candle_engine?.score || 0) || (Array.isArray(row.candle_patterns) && row.candle_patterns.length ? 75 : 0);
    if (family.name === "Target Room") return Math.min(100, Number(row.target_potential?.potential_left_pct || row.target_pct || 0) * 3);
    if (family.name === "Risk Safety") return Math.max(0, 100 - Number(row.regime_risk || row.risk_score || 100));
    if (family.name === "FII/DII Flow") return Number(row.flow_score || row.intelligence?.flow_score || 0);
    if (family.name === "Event Lift") return Number(row.event_resilience || 0) || (Array.isArray(row.intelligence?.notes) ? 35 : 0);
    if (family.name === "Hot Pocket") return Number(row.hot_pocket_score || row.theme_heat || 0);
    if (family.name === "Advisor Ready") return row.advisor ? Number(row.paper_score || row.score || 60) : row.watch_ready ? 55 : 0;
    if (family.name === "Entry Target Stop") return readPath(row, "advisor.entry_zone") && (readPath(row, "advisor.target1") || row.target_price) && (readPath(row, "advisor.stop") || row.stop_price) ? 100 : row.close ? 35 : 0;
    if (family.name === "Watchlist Rotation") return ["SELECT", "WATCH"].includes(row.decision) ? 80 : Number(row.paper_score || 0);
    if (family.name === "Sell Replace") return String(row.reason || "").toLowerCase().includes("replace") || row.exit_rule ? 70 : row.paper_order ? 40 : 0;
    if (family.name === "Paper Safety") return row.paper_order?.broker_write_enabled === false || row.paper_order?.paper_only || row.paper_only ? 100 : 50;
    return Number(row.score || 0);
  }

  function familyForParam(number) { return FAMILIES.find((family) => number >= family.range[0] && number <= family.range[1]) || FAMILIES[0]; }
  function familyByName(name) { return FAMILIES.find((family) => family.name === name) || null; }
  function hasAnyField(row, fields) { return fields.some((field) => { const value = readPath(row, field); return value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length > 0); }); }
  function readPath(row, path) { return String(path).split(".").reduce((current, key) => current && current[key], row); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function captureJson(response, callback) { response.clone().json().then((payload) => { if (payload && payload.ok !== false) callback(payload); }).catch(() => {}); }
})();
