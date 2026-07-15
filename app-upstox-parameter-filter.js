(() => {
  const TOTAL_PARAMETERS = 2000;
  const PARAMETER_FAMILIES = [
    { name: "Universe", range: [1, 120], blocks: ["B01", "B24"], fields: ["symbol", "instrument_key", "sector"], terms: ["universe", "instrument", "suspended", "sector"] },
    { name: "Data Coverage", range: [121, 260], blocks: ["B24"], fields: ["close", "close_127", "close_253", "last_candle_date"], terms: ["coverage", "freshness", "data", "candle"] },
    { name: "Price Trend", range: [261, 400], blocks: ["B02", "B22"], fields: ["return_6m_pct", "return_12m_pct", "momentum_score"], terms: ["trend", "momentum", "dma", "return"] },
    { name: "Relative Strength", range: [401, 540], blocks: ["B22"], fields: ["score", "paper_score", "intelligence_score"], terms: ["relative", "strength", "rank", "score"] },
    { name: "Liquidity", range: [541, 680], blocks: ["B22"], fields: ["adv20", "rupee_turnover_cr"], terms: ["liquidity", "turnover", "volume"] },
    { name: "Candle Structure + Volume", range: [681, 800], blocks: ["B15", "B22"], fields: ["candle_status", "candle_score", "candle_patterns", "vol_63d_pct"], terms: ["candle", "volume", "delivery", "breakout"] },
    { name: "Target Room", range: [801, 920], blocks: ["B04", "B21"], fields: ["target_price", "target_pct", "target_potential"], terms: ["target", "upside", "valuation", "rerating"] },
    { name: "Risk Safety", range: [921, 1040], blocks: ["B19"], fields: ["regime_risk", "risk_score", "reason"], terms: ["risk", "drawdown", "regime", "governor"] },
    { name: "FII/DII Flow", range: [1041, 1160], blocks: ["B12"], fields: ["flow_score"], terms: ["fii", "dii", "institutional", "flow"] },
    { name: "Event Lift", range: [1161, 1280], blocks: ["B11", "B18"], fields: ["event_resilience", "reason"], terms: ["event", "war", "election", "rbi", "crash", "news"] },
    { name: "Hot Pocket", range: [1281, 1400], blocks: ["B09", "B18"], fields: ["theme_heat", "hot_pocket_score", "themes"], terms: ["theme", "ai", "ev", "green", "defence", "rail"] },
    { name: "Advisor Ready", range: [1401, 1520], blocks: ["B03", "B10"], fields: ["paper_ready", "watch_ready", "paper_reason"], terms: ["advisor", "growth", "order", "execution"] },
    { name: "Entry Target Stop", range: [1521, 1640], blocks: ["B21"], fields: ["entry_zone", "target_price", "stop_price", "paper_order"], terms: ["entry", "target", "stop", "size"] },
    { name: "Watchlist Rotation", range: [1641, 1760], blocks: ["B20"], fields: ["decision", "paper_order"], terms: ["watchlist", "rotation", "portfolio", "correlation"] },
    { name: "Sell Replace", range: [1761, 1880], blocks: ["B20"], fields: ["paper_order", "reason"], terms: ["sell", "replace", "target progress", "cash recycle"] },
    { name: "Paper Safety", range: [1881, 2000], blocks: ["B21", "B24"], fields: ["paper_order", "broker_write_enabled"], terms: ["paper", "audit", "safety", "broker"] }
  ];

  const state = {
    scannerRows: [],
    scanPayload: null,
    dataIntel: null,
    framework: null,
    selectedBlock: "ALL",
    selectedFamily: "ALL",
    selectedFeed: "ALL",
    selectedParam: 1,
    search: ""
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      state.scanPayload = payload;
      state.scannerRows = Array.isArray(payload.rows) ? payload.rows : [];
      renderParameterWorkspace();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => {
    const observer = new MutationObserver(() => ensureParameterWorkspace());
    observer.observe(document.body, { childList: true, subtree: true });
    boot().catch(() => {});
  });

  async function boot() {
    await waitForWorkspace();
    ensureParameterWorkspace();
    await refreshParameterSources();
    renderParameterWorkspace();
    setInterval(() => refreshParameterSources().catch(() => {}), 180000);
  }

  function waitForWorkspace() {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector("#upstoxWorkspaceView")) return resolve();
        if (Date.now() - started > 10000) return resolve();
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  async function refreshParameterSources() {
    const [dataIntel, framework] = await Promise.allSettled([
      fetchJson("/api/data-intelligence"),
      fetchJson("/api/framework")
    ]);
    if (dataIntel.status === "fulfilled") state.dataIntel = dataIntel.value;
    if (framework.status === "fulfilled") state.framework = framework.value;
    renderParameterWorkspace();
  }

  function ensureParameterWorkspace() {
    const panel = document.querySelector("#upstoxWorkspaceView");
    if (!panel || panel.querySelector("#uwParameterFilterPanel")) return;
    const lowerGrid = panel.querySelector(".uw-lower-grid");
    const section = document.createElement("section");
    section.id = "uwParameterFilterPanel";
    section.className = "panel uw-parameter-filter-panel";
    section.innerHTML = `
      <div class="panel-header"><h3>AshStocks Parameter Filters</h3><span id="uwFilterSourceState">Loading</span></div>
      <div class="uw-param-controls">
        <label><span>Block</span><select id="uwBlockFilter"><option value="ALL">All 24 Blocks</option></select></label>
        <label><span>Family</span><select id="uwFamilyFilter"><option value="ALL">All 2000 Parameters</option></select></label>
        <label><span>Feed</span><select id="uwFeedFilter"><option value="ALL">All Feeds</option></select></label>
        <label><span>Parameter No.</span><input id="uwParamNumber" type="number" min="1" max="2000" value="1" /></label>
        <label><span>Search</span><input id="uwParamSearch" placeholder="candle, FII, risk, target" /></label>
      </div>
      <div class="uw-param-summary" id="uwParamSummary"></div>
      <div class="uw-param-detail-grid">
        <section><div class="panel-header"><h3>Parameter Evidence</h3><span id="uwParamDetailState">Waiting</span></div><div id="uwParamEvidence" class="uw-copy"></div></section>
        <section><div class="panel-header"><h3>Filtered Candidates</h3><span id="uwFilteredCount">0</span></div><div class="uw-table-wrap"><table><thead><tr><th>Stock</th><th>Family</th><th>Score</th><th>Evidence</th><th>Status</th></tr></thead><tbody id="uwFilteredRows"></tbody></table></div></section>
      </div>
      <div class="uw-param-blocks" id="uwParamBlocks"></div>
    `;
    if (lowerGrid) lowerGrid.insertAdjacentElement("afterend", section);
    else panel.appendChild(section);
    bindControls(section);
    renderParameterWorkspace();
  }

  function bindControls(section) {
    section.querySelector("#uwBlockFilter")?.addEventListener("change", (event) => { state.selectedBlock = event.target.value; renderParameterWorkspace(); });
    section.querySelector("#uwFamilyFilter")?.addEventListener("change", (event) => { state.selectedFamily = event.target.value; const fam = familyByName(event.target.value); if (fam) state.selectedParam = fam.range[0]; syncParamInput(); renderParameterWorkspace(); });
    section.querySelector("#uwFeedFilter")?.addEventListener("change", (event) => { state.selectedFeed = event.target.value; renderParameterWorkspace(); });
    section.querySelector("#uwParamNumber")?.addEventListener("input", (event) => { state.selectedParam = clamp(Number(event.target.value) || 1, 1, TOTAL_PARAMETERS); state.selectedFamily = familyForParam(state.selectedParam)?.name || state.selectedFamily; syncFamilySelect(); renderParameterWorkspace(); });
    section.querySelector("#uwParamSearch")?.addEventListener("input", (event) => { state.search = event.target.value.trim().toLowerCase(); renderParameterWorkspace(); });
    section.querySelector("#uwParamBlocks")?.addEventListener("click", (event) => {
      const block = event.target.closest("button[data-block]");
      const family = event.target.closest("button[data-family]");
      if (block) { state.selectedBlock = block.dataset.block; syncBlockSelect(); renderParameterWorkspace(); }
      if (family) { state.selectedFamily = family.dataset.family; const fam = familyByName(state.selectedFamily); if (fam) state.selectedParam = fam.range[0]; syncFamilySelect(); syncParamInput(); renderParameterWorkspace(); }
    });
  }

  function renderParameterWorkspace() {
    const panel = document.querySelector("#uwParameterFilterPanel");
    if (!panel) return;
    syncSelectors(panel);
    const family = selectedFamily();
    const block = selectedBlock();
    const feed = selectedFeed();
    const rows = filteredRows(family, block, feed);
    renderSummary(panel, family, block, feed, rows);
    renderEvidence(panel, family, block, feed, rows);
    renderFilteredRows(panel, family, rows);
    renderBlocks(panel, family, block);
    mirrorUpstoxFamilySelect(family);
  }

  function syncSelectors(panel) {
    const blocks = state.dataIntel?.parameter_framework?.blocks || state.framework?.layers || [];
    const blockSelect = panel.querySelector("#uwBlockFilter");
    const familySelect = panel.querySelector("#uwFamilyFilter");
    const feedSelect = panel.querySelector("#uwFeedFilter");
    if (blockSelect && blockSelect.options.length <= 1) {
      blockSelect.innerHTML = '<option value="ALL">All 24 Blocks</option>' + blocks.map((block) => `<option value="${escapeAttr(block.id)}">${escapeHtml(block.id)} ${escapeHtml(block.name)}</option>`).join("");
    }
    if (familySelect && familySelect.options.length <= 1) {
      familySelect.innerHTML = '<option value="ALL">All 2000 Parameters</option>' + PARAMETER_FAMILIES.map((family) => `<option value="${escapeAttr(family.name)}">${escapeHtml(family.range[0] + "-" + family.range[1] + " " + family.name)}</option>`).join("");
    }
    if (feedSelect && feedSelect.options.length <= 1) {
      const feeds = state.dataIntel?.required_feeds || state.framework?.required_feeds || [];
      feedSelect.innerHTML = '<option value="ALL">All Feeds</option>' + feeds.map((feed) => `<option value="${escapeAttr(feed.feed || feed.id || feed.name)}">${escapeHtml(feed.feed || feed.name)} - ${escapeHtml(feed.status)}</option>`).join("");
    }
    syncBlockSelect();
    syncFamilySelect();
    syncParamInput();
  }

  function renderSummary(panel, family, block, feed, rows) {
    const sourceState = panel.querySelector("#uwFilterSourceState");
    if (sourceState) sourceState.textContent = `${state.dataIntel?.engine || "data-intelligence"} | ${state.framework?.framework_version || "framework"}`;
    const totalBlocks = state.dataIntel?.parameter_framework?.block_count || 24;
    const warningCount = state.dataIntel?.early_warning?.signal_count || 0;
    const feedCount = (state.dataIntel?.required_feeds || []).length;
    const activeRows = state.scannerRows.length;
    const host = panel.querySelector("#uwParamSummary");
    if (!host) return;
    host.innerHTML = [
      ["Parameter", `P${state.selectedParam}`, parameterName(state.selectedParam)],
      ["Family", family?.name || "All", family ? `${family.range[0]}-${family.range[1]}` : `${TOTAL_PARAMETERS} keys`],
      ["Blocks", totalBlocks, block?.name || "all blocks"],
      ["Warning", warningCount, "early-warning signals"],
      ["Feeds", feedCount, feed ? feed.status : "all feed states"],
      ["Rows", rows.length, `${activeRows} scanner rows loaded`]
    ].map(([label, value, note]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`).join("");
  }

  function renderEvidence(panel, family, block, feed, rows) {
    const detailState = panel.querySelector("#uwParamDetailState");
    const host = panel.querySelector("#uwParamEvidence");
    if (!host) return;
    const selected = state.scannerRows.find((row) => row.symbol === selectedSymbol()) || rows[0] || state.scannerRows[0] || {};
    const familyRow = family || familyForParam(state.selectedParam) || PARAMETER_FAMILIES[0];
    const fieldEvidence = familyRow.fields.map((field) => `${field}: ${valueText(readPath(selected, field))}`).join("; ");
    const blockText = block ? `${block.id} ${block.name}: ${block.use || block.role || ""}` : "All framework blocks available for selection.";
    const feedText = feed ? `${feed.feed || feed.name}: ${feed.status}; unlocks ${feed.unlocks || "not listed"}` : "All feeds; missing/partial feeds remain marked by status.";
    const searchText = state.search ? `Search term: ${state.search}` : "No text search active.";
    if (detailState) detailState.textContent = evidenceStatus(selected, familyRow);
    host.innerHTML = `<strong>${escapeHtml(parameterName(state.selectedParam))}</strong><p>${escapeHtml(blockText)}</p><p>${escapeHtml(feedText)}</p><span>${escapeHtml(selected.symbol ? selected.symbol + " | " + fieldEvidence : "No scanner row selected yet. Run scanner/Upstox scan to attach row evidence.")}</span><span>${escapeHtml(searchText)}</span>`;
  }

  function renderFilteredRows(panel, family, rows) {
    const count = panel.querySelector("#uwFilteredCount");
    const body = panel.querySelector("#uwFilteredRows");
    if (count) count.textContent = `${rows.length}`;
    if (!body) return;
    body.innerHTML = rows.length ? rows.slice(0, 40).map((row) => {
      const fam = family || bestFamilyForRow(row);
      const score = familyScore(row, fam);
      const evidence = rowEvidence(row, fam);
      return `<tr><td><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.name || "")}</span></td><td>${escapeHtml(fam.name)}</td><td>${number(score)}</td><td>${escapeHtml(evidence)}</td><td>${escapeHtml(evidenceStatus(row, fam))}</td></tr>`;
    }).join("") : `<tr><td colspan="5" class="empty-cell">No scanner rows match this parameter filter. Run scanner, broaden block/feed, or clear search.</td></tr>`;
  }

  function renderBlocks(panel, selectedFamilyRow, selectedBlockRow) {
    const host = panel.querySelector("#uwParamBlocks");
    if (!host) return;
    const blocks = state.dataIntel?.parameter_framework?.blocks || [];
    const warnings = state.dataIntel?.early_warning?.signals || [];
    const families = PARAMETER_FAMILIES.filter((family) => !selectedBlockRow || family.blocks.includes(selectedBlockRow.id));
    host.innerHTML = `
      <section><div class="panel-header"><h3>Parameter Families</h3><span>${families.length}</span></div><div class="uw-chip-grid">${families.map((family) => `<button type="button" class="${selectedFamilyRow?.name === family.name ? "active" : ""}" data-family="${escapeAttr(family.name)}"><strong>${escapeHtml(family.name)}</strong><span>${family.range[0]}-${family.range[1]}</span></button>`).join("")}</div></section>
      <section><div class="panel-header"><h3>Framework Blocks</h3><span>${blocks.length || 24}</span></div><div class="uw-chip-grid">${blocks.map((block) => `<button type="button" class="${selectedBlockRow?.id === block.id ? "active" : ""}" data-block="${escapeAttr(block.id)}"><strong>${escapeHtml(block.id)}</strong><span>${escapeHtml(block.name)}</span></button>`).join("") || "<span>No framework blocks loaded yet.</span>"}</div></section>
      <section><div class="panel-header"><h3>Early Warning</h3><span>${warnings.length}</span></div><div class="uw-warning-strip">${warnings.slice(0, 30).map((warning) => `<span>${escapeHtml(warning)}</span>`).join("") || "<span>No warning signals loaded.</span>"}</div></section>
    `;
  }

  function filteredRows(family, block, feed) {
    const rows = state.scannerRows.slice();
    return rows.filter((row) => {
      const fam = family || bestFamilyForRow(row);
      if (block && !fam.blocks.includes(block.id)) return false;
      if (state.search && !(`${row.symbol} ${row.name} ${row.sector} ${row.reason} ${row.paper_reason} ${fam.name}`.toLowerCase().includes(state.search))) return false;
      if (feed && !feedMatchesFamily(feed, fam)) return false;
      return familyScore(row, fam) > 0 || hasAnyField(row, fam.fields) || row.decision === "DATA_NEEDED";
    }).sort((a, b) => familyScore(b, family || bestFamilyForRow(b)) - familyScore(a, family || bestFamilyForRow(a)) || String(a.symbol).localeCompare(String(b.symbol)));
  }

  function familyScore(row, family) {
    if (!family) return Number(row.score || row.paper_score || 0);
    if (family.name === "Universe") return row.instrument_key ? 100 : 30;
    if (family.name === "Data Coverage") return Math.max(0, Math.min(100, Number(row.parameter_coverage || 0) || (row.close && row.last_candle_date ? 70 : row.close ? 35 : 0)));
    if (family.name === "Price Trend") return Math.max(Number(row.momentum_score || 0), Math.min(100, Math.max(0, Number(row.return_6m_pct || 0) + Number(row.return_12m_pct || 0) / 2)));
    if (family.name === "Relative Strength") return Number(row.intelligence_score || row.paper_score || row.score || 0);
    if (family.name === "Liquidity") return Math.min(100, Number(row.rupee_turnover_cr || 0) * 6 || Number(row.adv20 || 0) / 100000);
    if (family.name === "Candle Structure + Volume") return Number(row.candle_score || 0) || Math.min(100, Number(row.vol_63d_pct || 0) * 3);
    if (family.name === "Target Room") return Math.min(100, Number(row.target_pct || row.target_potential?.potential_left_pct || 0) * 3);
    if (family.name === "Risk Safety") return Math.max(0, 100 - Number(row.regime_risk || 0));
    if (family.name === "FII/DII Flow") return Number(row.flow_score || 0);
    if (family.name === "Event Lift") return Number(row.event_resilience || 0);
    if (family.name === "Hot Pocket") return Number(row.hot_pocket_score || row.theme_heat || 0);
    if (family.name === "Advisor Ready") return row.paper_ready ? 100 : row.watch_ready ? 65 : Number(row.paper_score || 0);
    if (family.name === "Entry Target Stop") return row.close && (row.target_price || row.target_potential) && (row.stop_price || row.paper_order?.stop_price) ? 100 : row.close ? 35 : 0;
    if (family.name === "Watchlist Rotation") return ["SELECT", "WATCH"].includes(row.decision) ? 80 : Number(row.paper_score || 0);
    if (family.name === "Sell Replace") return String(row.reason || "").toLowerCase().includes("replace") ? 80 : row.paper_order ? 45 : 0;
    if (family.name === "Paper Safety") return row.paper_order?.broker_write_enabled === false || row.paper_order?.paper_only ? 100 : 50;
    return Number(row.score || row.paper_score || 0);
  }

  function rowEvidence(row, family) {
    if (!row.symbol) return "No row evidence";
    const parts = family.fields.map((field) => `${field} ${valueText(readPath(row, field))}`).filter((part) => !part.endsWith(" n/a"));
    return parts.slice(0, 4).join("; ") || row.reason || "No matching field present";
  }

  function evidenceStatus(row, family) {
    if (!row.symbol) return "WAITING";
    if (row.decision === "DATA_NEEDED") return "DATA_NEEDED";
    const score = familyScore(row, family);
    if (score >= 70) return "HIT";
    if (score >= 35) return "WEAK";
    return hasAnyField(row, family.fields) ? "WEAK" : "WAITING";
  }

  function bestFamilyForRow(row) {
    let best = PARAMETER_FAMILIES[0];
    let bestScore = -1;
    for (const family of PARAMETER_FAMILIES) {
      const score = familyScore(row, family);
      if (score > bestScore) { best = family; bestScore = score; }
    }
    return best;
  }

  function selectedFamily() {
    return state.selectedFamily === "ALL" ? null : familyByName(state.selectedFamily);
  }

  function selectedBlock() {
    if (state.selectedBlock === "ALL") return null;
    return (state.dataIntel?.parameter_framework?.blocks || []).find((block) => block.id === state.selectedBlock) || null;
  }

  function selectedFeed() {
    if (state.selectedFeed === "ALL") return null;
    return (state.dataIntel?.required_feeds || state.framework?.required_feeds || []).find((feed) => (feed.feed || feed.id || feed.name) === state.selectedFeed) || null;
  }

  function familyForParam(number) {
    return PARAMETER_FAMILIES.find((family) => number >= family.range[0] && number <= family.range[1]) || null;
  }

  function familyByName(name) {
    return PARAMETER_FAMILIES.find((family) => family.name === name) || null;
  }

  function parameterName(number) {
    const family = familyForParam(number);
    if (!family) return "Unknown parameter";
    const index = number - family.range[0] + 1;
    return `${family.name} parameter ${index}`;
  }

  function feedMatchesFamily(feed, family) {
    const text = `${feed.feed || feed.name || ""} ${feed.unlocks || ""} ${feed.status || ""}`.toLowerCase();
    return family.terms.some((term) => text.includes(term.toLowerCase())) || family.blocks.some((block) => text.includes(block.toLowerCase()));
  }

  function mirrorUpstoxFamilySelect(family) {
    const select = document.querySelector("#uwParameterFamily");
    if (!select || !family) return;
    const value = family.name.includes("Candle") ? "Candle Structure" : family.name.includes("Risk") ? "Risk" : family.name.includes("FII") ? "FII/DII" : family.name.includes("Entry") ? "Entry Target Stop" : family.name.includes("Trend") ? "Momentum" : "All AshStocks";
    if ([...select.options].some((option) => option.value === value || option.textContent === value)) select.value = value;
  }

  function selectedSymbol() {
    const title = document.querySelector("#uwSelectedTitle")?.textContent || "";
    return title.trim().split(/\s+/)[0] || "";
  }

  function syncBlockSelect() { const select = document.querySelector("#uwBlockFilter"); if (select && select.value !== state.selectedBlock) select.value = state.selectedBlock; }
  function syncFamilySelect() { const select = document.querySelector("#uwFamilyFilter"); if (select && select.value !== state.selectedFamily) select.value = state.selectedFamily; }
  function syncParamInput() { const input = document.querySelector("#uwParamNumber"); if (input && Number(input.value) !== state.selectedParam) input.value = state.selectedParam; }

  function hasAnyField(row, fields) { return fields.some((field) => readPath(row, field) !== undefined && readPath(row, field) !== null && readPath(row, field) !== ""); }
  function readPath(row, path) { return String(path).split(".").reduce((current, key) => current && current[key], row); }
  function valueText(value) { if (Array.isArray(value)) return value.length ? value.slice(0, 3).join("|") : "n/a"; if (value && typeof value === "object") return JSON.stringify(value).slice(0, 80); return value === undefined || value === null || value === "" ? "n/a" : String(value).slice(0, 80); }
  function number(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "0.00"; }
  function money(value) { return Number.isFinite(Number(value)) ? "Rs " + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "n/a"; }
  function entryZone(row) { const zone = row.entry_zone || row.advisor?.entry_zone; return zone?.low && zone?.high ? `${money(zone.low)}-${money(zone.high)}` : money(row.close || row.entry_price); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function fetchJson(path) { return fetch(path).then((response) => response.status === 401 ? {} : response.json()); }
  function captureJson(response, callback) { response.clone().json().then((payload) => { if (payload) callback(payload); }).catch(() => {}); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
})();
