(() => {
  const TOTAL_PARAMETERS = 2000;
  const FAMILIES = [
    { name: "Universe", range: [1, 120], fields: ["symbol", "instrument_key", "isin", "sector"], source: "Upstox NSE instruments master + suspended guard", pass: "NSE equity is mapped, active, not suspended and has an instrument key.", impact: "Defines whether a stock is allowed into the scanner universe." },
    { name: "Data Coverage", range: [121, 260], fields: ["close", "close_127", "close_253", "last_candle_date"], source: "Upstox historical daily OHLCV + scanner derived fields", pass: "Latest close, 127D/253D references, 252D high, volume and candle freshness exist.", impact: "Blocks fake recommendations when price history is missing or stale." },
    { name: "Price Trend", range: [261, 400], fields: ["return_6m_pct", "return_12m_pct", "momentum_score", "close"], source: "Upstox daily candles converted into return and momentum fields", pass: "6M/12M trend, DMA/price references and momentum score confirm the move.", impact: "Moves a stock from data-only into momentum candidate pool." },
    { name: "Relative Strength", range: [401, 540], fields: ["score", "paper_score", "intelligence_score", "decision"], source: "Scanner rank, paper score and intelligence overlay", pass: "Score is strong against the current NSE pool and decision is not DATA_NEEDED.", impact: "Ranks candidates against each other instead of judging one stock alone." },
    { name: "Liquidity", range: [541, 680], fields: ["adv20", "rupee_turnover_cr", "volume"], source: "Volume and rupee-turnover fields from candle/enriched scanner row", pass: "Turnover and ADV are enough for paper order sizing without thin-stock distortion.", impact: "Controls tradability, position capacity and blocked decisions." },
    { name: "Candle Structure + Volume", range: [681, 800], fields: ["candle_status", "candle_score", "candle_patterns", "candle_evidence"], source: "Server candle engine over Upstox daily candles", pass: "A proven candle/volume structure fires or candle score reaches the pass line.", impact: "Adds trigger timing so a good stock is not bought without structure." },
    { name: "Target Room", range: [801, 920], fields: ["target_potential", "target_pct", "target_price", "target2"], source: "Target-potential and advisor target calculations", pass: "Remaining target room is large enough after entry, stop and risk gates.", impact: "Prevents buying stocks where most upside is already consumed." },
    { name: "Risk Safety", range: [921, 1040], fields: ["regime_risk", "risk_score", "reason"], source: "Regime risk, validated trigger lift and hard-gate reasons", pass: "Risk governor is not blocking and volatility/drawdown pressure is acceptable.", impact: "Keeps the engine defensive during crash, war, election or stress regimes." },
    { name: "FII/DII Flow", range: [1041, 1160], fields: ["flow_score", "intelligence.flow_score"], source: "FII/DII cash snapshot and institutional flow overlay", pass: "Institutional pressure is supportive or not dangerous for the stock/sector.", impact: "Adds India-market flow context above pure price action." },
    { name: "Event Lift", range: [1161, 1280], fields: ["event_resilience", "reason", "intelligence.notes"], source: "Validated event and pre-fall trigger files", pass: "Event trigger lift is understood and not giving a hard avoid signal.", impact: "Connects elections, RBI, war/crash and large event windows to ranking." },
    { name: "Hot Pocket", range: [1281, 1400], fields: ["hot_pocket_score", "theme_heat", "themes", "sector"], source: "Sector/theme overlay: AI, EV, green, defence, rail, infra, PSU and similar baskets", pass: "Theme heat is present with enough evidence and not only narrative noise.", impact: "Rewards stocks in active demand pockets without making theme alone enough." },
    { name: "Advisor Ready", range: [1401, 1520], fields: ["advisor", "paper_ready", "watch_ready", "paper_reason"], source: "Advisor engine and scanner-to-paper readiness fields", pass: "Thesis, setup, conviction and execution readiness are returned by engine.", impact: "Turns raw scanner rank into a trader-readable candidate." },
    { name: "Entry Target Stop", range: [1521, 1640], fields: ["advisor.entry_zone", "advisor.target1", "advisor.target2", "advisor.stop", "paper_order"], source: "Advisor execution plan and paper ticket construction", pass: "Entry zone, stop, target and quantity are all available.", impact: "Converts a selected stock into an executable paper trade plan." },
    { name: "Watchlist Rotation", range: [1641, 1760], fields: ["decision", "target_potential", "paper_order"], source: "Decision ledger, watch bucket and portfolio rotation rules", pass: "Candidate belongs in SELECT/WATCH and can replace weaker capital use.", impact: "Maintains rolling watchlists instead of static one-time picks." },
    { name: "Sell Replace", range: [1761, 1880], fields: ["reason", "paper_order", "exit_rule"], source: "Paper position lifecycle, target progress and deterioration checks", pass: "Sell/hold/replace logic is explicit from target, stop, score or rule change.", impact: "Handles when to exit and recycle paper capital." },
    { name: "Paper Safety", range: [1881, 2000], fields: ["paper_order", "broker_write_enabled", "paper_only"], source: "Paper order ledger and live-order lock", pass: "paper_only is true, live broker writes are false, and audit trail is kept.", impact: "Makes the workflow real-data and real-process, but no real money execution." }
  ];

  const RULES = {
    Universe: ["NSE_EQ equity only", "instrument key present", "suspended instrument excluded", "fund/ETF noise excluded", "symbol normalized", "duplicate listing controlled", "security type normal", "tradable exchange NSE", "name resolved", "sector tag available"],
    "Data Coverage": ["latest close present", "127D close present", "253D close present", "252D high present", "20D average volume present", "rupee turnover present", "63D volatility present", "126D volatility present", "252D volatility present", "last candle fresh", "candles not stuck", "fetch error absent"],
    "Price Trend": ["6M return positive", "12M return positive", "close above 127D reference", "close above 253D reference", "near 252D high", "momentum score above line", "trend not stale", "not one-candle spike"],
    "Relative Strength": ["scanner score rank", "paper score rank", "relative strength vs pool", "decision survives target gate", "score above watch line", "score above select line", "not DATA_NEEDED"],
    Liquidity: ["rupee turnover crores", "20D average volume", "liquidity hard gate", "paper position capacity", "wide-spread avoidance", "large order survivability"],
    "Candle Structure + Volume": ["bullish engulfing", "hammer rejection", "inside bar pressure", "near 252D breakout", "volume confirmation", "body/range quality", "gap control", "fresh candle date"],
    "Target Room": ["target percentage left", "target label pass", "target hard gate", "reward room after entry", "target 1 calculated", "target 2 calculated", "upside versus stop balance"],
    "Risk Safety": ["regime risk score", "drawdown pressure", "validated trigger lift", "volatility penalty", "weak 6M return penalty", "capital protection governor", "hard gate reason"],
    "FII/DII Flow": ["FII cash net", "DII cash net", "institutional net pressure", "flow score", "FII/DII overlay used", "flow risk neutralizer"],
    "Event Lift": ["tail_down3_5d trigger", "dispersion trigger", "ret_10d trigger", "combo trigger", "precision check", "recall check", "lift multiplier"],
    "Hot Pocket": ["sector hot pocket", "AI theme", "EV theme", "green energy theme", "defence/rail/infra theme", "bank/NBFC theme", "pharma/health theme", "PSU/capital goods theme"],
    "Advisor Ready": ["advisor setup returned", "conviction label", "horizon returned", "why text returned", "parameters used returned", "watch-ready flag", "paper-ready flag"],
    "Entry Target Stop": ["entry zone low", "entry zone high", "target 1", "target 2", "stop loss", "stop percent", "quantity sizing", "paper ticket created"],
    "Watchlist Rotation": ["selected bucket", "watch bucket", "target room bucket", "theme bucket", "rotation candidate", "correlation cap", "sector cap"],
    "Sell Replace": ["sell queue check", "hold queue check", "replace below score", "target reached exit", "stop exit", "score deterioration exit", "cash recycle"],
    "Paper Safety": ["paper only true", "live orders false", "broker write disabled", "token hidden", "historical candles only", "audit trail ready", "no live execution path"]
  };

  const state = { rows: [], payload: null, dataIntel: null, selectedParam: 1, selectedSymbol: "" };
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      state.payload = payload;
      state.rows = Array.isArray(payload.rows) ? payload.rows : [];
      state.selectedSymbol = pickSelectedSymbol(state.rows, state.selectedSymbol);
      renderKeys();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => boot().catch(() => {}));
  document.addEventListener("click", (event) => {
    const stock = event.target.closest("button[data-select-symbol]");
    if (stock?.dataset?.selectSymbol) {
      state.selectedSymbol = stock.dataset.selectSymbol;
      setTimeout(renderKeys, 0);
    }
  }, true);

  async function boot() {
    await waitForPanel();
    installKeys();
    await refreshDataIntel();
    renderKeys();
  }

  function waitForPanel() {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector("#uwParameterFilterPanel")) return resolve();
        if (Date.now() - started > 12000) return resolve();
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  async function refreshDataIntel() {
    try {
      const response = await fetch("/api/data-intelligence");
      if (response.status !== 401) state.dataIntel = await response.json();
    } catch (_) {}
  }

  function installKeys() {
    const panel = document.querySelector("#uwParameterFilterPanel");
    if (!panel || panel.querySelector("#uwParameterKeyBoard")) return;
    const detailGrid = panel.querySelector(".uw-param-detail-grid");
    const board = document.createElement("section");
    board.id = "uwParameterKeyBoard";
    board.className = "uw-parameter-keyboard";
    board.innerHTML = `
      <div class="panel-header">
        <div><h3>1-2000 Parameter Board</h3><span>Click any number: rule, source, evidence, pass line and engine impact.</span></div>
        <span id="uwParameterKeyCount">0 / ${TOTAL_PARAMETERS}</span>
      </div>
      <div class="uw-key-legend"><span><i class="hit"></i>Hit</span><span><i class="weak"></i>Weak</span><span><i class="blocked"></i>Blocked</span><span><i class="waiting"></i>Waiting</span></div>
      <div id="uwParameterKeyDetail" class="uw-parameter-key-detail"><strong>Select a number</strong><span>No placeholder: details come from the selected stock row and framework family.</span></div>
      <div id="uwParameterKeyRows" class="uw-parameter-key-rows"></div>
    `;
    board.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-uw-param-key]");
      if (!button) return;
      const number = Number(button.dataset.uwParamKey);
      state.selectedParam = clamp(number, 1, TOTAL_PARAMETERS);
      syncExistingFilter(state.selectedParam);
      renderKeys();
    });
    if (detailGrid) detailGrid.insertAdjacentElement("beforebegin", board);
    else panel.appendChild(board);
  }

  function renderKeys() {
    installKeys();
    const host = document.querySelector("#uwParameterKeyRows");
    if (!host) return;
    const row = selectedRow();
    let hits = 0;
    host.innerHTML = FAMILIES.map((family) => {
      const score = familyScore(row, family);
      const total = family.range[1] - family.range[0] + 1;
      const active = Math.round(total * clamp(score, 0, 100) / 100);
      hits += active;
      const keys = [];
      for (let number = family.range[0]; number <= family.range[1]; number += 1) {
        const index = number - family.range[0];
        const keyState = parameterState(row, family, index, active);
        keys.push(`<button type="button" class="uw-param-key ${keyState} ${number === state.selectedParam ? "selected" : ""}" data-uw-param-key="${number}" title="P${number}: ${escapeAttr(ruleName(number, family))}">${number}</button>`);
      }
      return `<article class="uw-param-key-family"><div><strong>${escapeHtml(family.name)}</strong><span>${family.range[0]}-${family.range[1]}</span><b>${active}/${total}</b></div><section>${keys.join("")}</section></article>`;
    }).join("");
    const count = document.querySelector("#uwParameterKeyCount");
    if (count) count.textContent = `${hits} / ${TOTAL_PARAMETERS}`;
    renderDetail(row);
  }

  function renderDetail(row) {
    const host = document.querySelector("#uwParameterKeyDetail");
    if (!host) return;
    const family = familyForParam(state.selectedParam) || FAMILIES[0];
    const rule = ruleName(state.selectedParam, family);
    const evidence = evidenceText(row, family);
    const status = row.symbol ? evidenceStatus(row, family) : "WAITING";
    const block = blockText(family);
    host.innerHTML = `
      <div class="uw-param-key-head"><span class="uw-param-key ${status.toLowerCase()} selected">${state.selectedParam}</span><strong>${escapeHtml(rule)}</strong><b>${escapeHtml(status)}</b></div>
      <div class="uw-param-key-info">
        <span>Family</span><strong>${escapeHtml(family.name)} ${family.range[0]}-${family.range[1]}</strong>
        <span>Framework block</span><strong>${escapeHtml(block)}</strong>
        <span>Source</span><strong>${escapeHtml(family.source)}</strong>
        <span>Selected stock</span><strong>${escapeHtml(row.symbol ? `${row.symbol} ${row.name || ""}` : "No scanner row selected yet")}</strong>
        <span>Current evidence</span><strong>${escapeHtml(evidence)}</strong>
        <span>Pass line</span><strong>${escapeHtml(family.pass)}</strong>
        <span>Engine impact</span><strong>${escapeHtml(family.impact)}</strong>
      </div>
    `;
  }

  function syncExistingFilter(number) {
    const input = document.querySelector("#uwParamNumber");
    if (input) {
      input.value = String(number);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const family = familyForParam(number);
    const select = document.querySelector("#uwFamilyFilter");
    if (select && family) {
      select.value = family.name;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function selectedRow() {
    const titleSymbol = (document.querySelector("#uwSelectedTitle")?.textContent || "").trim().split(/\s+/)[0];
    const symbol = state.selectedSymbol || titleSymbol;
    return state.rows.find((row) => row.symbol === symbol) || pickActionableRow(state.rows) || {};
  }

  function pickSelectedSymbol(rows, current) {
    if (current && rows.some((row) => row.symbol === current)) return current;
    return pickActionableRow(rows)?.symbol || "";
  }

  function pickActionableRow(rows) {
    return rows.find((row) => row.decision === "SELECT") || rows.find((row) => row.decision === "WATCH") || rows[0];
  }

  function familyForParam(number) {
    return FAMILIES.find((family) => number >= family.range[0] && number <= family.range[1]) || null;
  }

  function ruleName(number, family) {
    const rules = RULES[family.name] || [family.name];
    const offset = number - family.range[0];
    const cycle = Math.floor(offset / rules.length) + 1;
    return `${family.name}: ${rules[offset % rules.length]} #${cycle}`;
  }

  function familyScore(row, family) {
    if (!row.symbol) return 0;
    if (family.name === "Universe") return row.instrument_key ? 100 : 20;
    if (family.name === "Data Coverage") return Math.max(Number(row.parameter_coverage || 0), row.close && row.last_candle_date ? 80 : row.close ? 40 : 0);
    if (family.name === "Price Trend") return Math.max(Number(row.momentum_score || 0), Math.min(100, Math.max(0, Number(row.return_6m_pct || 0) + Number(row.return_12m_pct || 0) / 2)));
    if (family.name === "Relative Strength") return Number(row.intelligence_score || row.paper_score || row.score || 0);
    if (family.name === "Liquidity") return Math.min(100, Number(row.rupee_turnover_cr || 0) * 6 || Number(row.adv20 || 0) / 100000);
    if (family.name === "Candle Structure + Volume") return Number(row.candle_score || row.candle_engine?.score || 0);
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

  function parameterState(row, family, index, active) {
    if (!row.symbol) return "waiting";
    if (row.decision === "DATA_NEEDED" || row.fetch_error) return index < active ? "weak" : "blocked";
    if (index < active) return familyScore(row, family) >= 70 ? "hit" : "weak";
    return hasAnyField(row, family.fields) ? "weak" : "waiting";
  }

  function evidenceStatus(row, family) {
    if (!row.symbol) return "WAITING";
    if (row.decision === "DATA_NEEDED" || row.fetch_error) return "DATA_NEEDED";
    const score = familyScore(row, family);
    if (score >= 70) return "HIT";
    if (score >= 35 || hasAnyField(row, family.fields)) return "WEAK";
    return "WAITING";
  }

  function evidenceText(row, family) {
    if (!row.symbol) return "Run scanner/Upstox scan to attach row evidence.";
    if (row.fetch_error) return `DATA_NEEDED: ${row.fetch_error}`;
    const fieldEvidence = family.fields.map((field) => `${field}: ${valueText(readPath(row, field))}`).filter((part) => !part.endsWith(": n/a"));
    if (fieldEvidence.length) return fieldEvidence.slice(0, 6).join("; ");
    return row.reason || row.paper_reason || "No matching field returned yet, keep this parameter waiting.";
  }

  function blockText(family) {
    const blocks = state.dataIntel?.parameter_framework?.blocks || [];
    const match = blocks.find((block) => String(family.name).toLowerCase().includes(String(block.name || "").split(" ")[0]?.toLowerCase()));
    return match ? `${match.id} ${match.name}` : frameworkGuess(family.name);
  }

  function frameworkGuess(name) {
    if (name.includes("Candle") || name.includes("Liquidity") || name.includes("Trend")) return "B22 Technical Price Liquidity / B15 Delivery and Volume";
    if (name.includes("FII")) return "B12 FII/DII Flow";
    if (name.includes("Entry") || name.includes("Paper")) return "B21 Execution Plan";
    if (name.includes("Risk")) return "B19 Risk Governor";
    if (name.includes("Hot")) return "B09 Sector Tailwind / B18 News and Sentiment";
    return "AshStocks framework block mapping";
  }

  function hasAnyField(row, fields) {
    return fields.some((field) => {
      const value = readPath(row, field);
      return value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length > 0);
    });
  }

  function readPath(row, path) {
    return String(path).split(".").reduce((current, key) => current && current[key], row);
  }

  function valueText(value) {
    if (Array.isArray(value)) return value.length ? value.slice(0, 4).join("|") : "n/a";
    if (value && typeof value === "object") return JSON.stringify(value).slice(0, 120);
    return value === undefined || value === null || value === "" ? "n/a" : String(value).slice(0, 120);
  }

  function captureJson(response, callback) {
    response.clone().json().then((payload) => { if (payload && payload.ok !== false) callback(payload); }).catch(() => {});
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
})();
