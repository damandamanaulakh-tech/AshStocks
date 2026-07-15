(() => {
  const TOTAL_PARAMETERS = 2000;
  const state = {
    activeFilter: "ALL",
    search: "",
    paramSearch: "",
    paramStatus: "ALL",
    selectedGate: null,
    parameters: [],
    loaded: false
  };

  const PARAMETER_DETAILS = {
    P001: {
      block: "Universe",
      family: "NSE master identity",
      source: "Upstox complete instruments JSON + AshStocks scanner row",
      rule: "Stock must exist in the NSE equity universe with a usable instrument_key.",
      pass: "symbol present and instrument_key present",
      impact: "Without this, the stock cannot receive Upstox candles, quotes, or paper execution evidence."
    },
    P261: {
      block: "Price Trend",
      family: "6M momentum",
      source: "Upstox historical daily candles",
      rule: "Six-month return should clear the engine momentum floor.",
      pass: "6M return >= 8%",
      impact: "Weak 6M momentum keeps the stock in WATCH/BLOCKED instead of SELECT."
    },
    P401: {
      block: "Relative Strength",
      family: "12M continuation",
      source: "Upstox historical daily candles",
      rule: "Twelve-month return should confirm the longer trend.",
      pass: "12M return >= 12%",
      impact: "Confirms the candidate is not only a short bounce."
    },
    P521: {
      block: "Liquidity",
      family: "Tradability",
      source: "Upstox candles and volume fields",
      rule: "Stock must have enough volume/turnover for paper execution realism.",
      pass: "rupee turnover >= 5 cr or ADV20 >= 200000 shares",
      impact: "Low liquidity reduces confidence and blocks thin names."
    },
    P681: {
      block: "Candle Structure + Volume",
      family: "Bullish reversal",
      source: "Candle pattern engine on Upstox OHLCV",
      rule: "Detect bullish engulfing structure with current candle body stronger than prior candle.",
      pass: "candle_patterns includes bullish_engulfing",
      impact: "Adds a candle trigger to the selected-stock execution proof."
    },
    P683: {
      block: "Candle Structure + Volume",
      family: "Rejection candle",
      source: "Candle pattern engine on Upstox OHLCV",
      rule: "Detect hammer/rejection structure near support or after weakness.",
      pass: "candle_patterns includes hammer_rejection",
      impact: "Marks a reversal-style watch or entry trigger."
    },
    P686: {
      block: "Candle Structure + Volume",
      family: "Breakout readiness",
      source: "Candle pattern engine and 252D high from Upstox OHLCV",
      rule: "Stock should trade close to yearly breakout zone with trend context.",
      pass: "candle_patterns includes near_252d_breakout",
      impact: "Supports target-room and breakout continuation logic."
    },
    P688: {
      block: "Candle Structure + Volume",
      family: "Volume confirmation",
      source: "Upstox OHLCV volume history",
      rule: "Latest move should have volume support versus recent average.",
      pass: "candle_patterns includes volume_confirmation",
      impact: "Reduces false breakouts and upgrades candle confidence."
    },
    P1120: {
      block: "Execution Plan",
      family: "Target room",
      source: "AshStocks target-potential label from 252D high and current price",
      rule: "There should be enough target room after entry versus expected risk.",
      pass: "target label PASS/OK/READY",
      impact: "If target room fails, the app should not force a buy even with momentum."
    },
    P1701: {
      block: "Realtime Data Quality",
      family: "Upstox quote proof",
      source: "/api/upstox/quote and SSE quote stream",
      rule: "Selected stock should have a current Upstox quote where token/rate limit permits.",
      pass: "quote returned with last_price",
      impact: "Paper order price uses quote if available; otherwise it must disclose scanner fallback or DATA_NEEDED."
    },
    P1901: {
      block: "Paper Safety",
      family: "Execution lock",
      source: "Paper order payload and server lifecycle guard",
      rule: "All execution from this app must stay paper-only unless product rule changes later.",
      pass: "paper_only true and broker_write_enabled false",
      impact: "Keeps workflow real while preventing live broker money movement."
    }
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/parameters")) {
      response.clone().json().then((payload) => {
        state.parameters = payload.parameters || [];
        renderInspector();
      }).catch(() => {});
    }
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => bootInspector());

  document.addEventListener("click", (event) => {
    const filter = event.target.closest("button[data-terminal-filter]");
    if (filter) {
      state.activeFilter = filter.dataset.terminalFilter || "ALL";
      updateFilterButtons();
      applyTerminalFilters();
    }
    const paramKey = event.target.closest("button[data-terminal-param-key]");
    if (paramKey) {
      state.selectedGate = paramKey.dataset.terminalParamKey || "P681";
      renderInspector();
    }
    const gate = event.target.closest("#terminalParameterGates article, #terminalProof .terminal-proof-grid span");
    if (gate) {
      state.selectedGate = extractGateId(gate.textContent || "");
      renderInspector();
    }
  }, true);

  document.addEventListener("input", (event) => {
    if (event.target?.id === "terminalSearchInput") {
      state.search = event.target.value || "";
      applyTerminalFilters();
    }
    if (event.target?.id === "terminalParamSearch") {
      state.paramSearch = event.target.value || "";
      renderParameterBoard();
    }
  }, true);

  document.addEventListener("change", (event) => {
    if (event.target?.id === "terminalParamStatus") {
      state.paramStatus = event.target.value || "ALL";
      renderParameterBoard();
    }
  }, true);

  const observer = new MutationObserver(() => {
    installFilterSearch();
    installInspector();
    applyTerminalFilters();
  });

  function bootInspector() {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    installFilterSearch();
    installInspector();
    loadParameters().catch(() => {});
  }

  async function loadParameters() {
    if (state.loaded) return;
    state.loaded = true;
    const response = await nativeFetch("/api/scanner/parameters");
    if (response.status === 401) return;
    const payload = await response.json().catch(() => ({}));
    state.parameters = payload.parameters || [];
    renderInspector();
  }

  function installFilterSearch() {
    const row = document.querySelector(".terminal-filter-row");
    if (!row || document.querySelector("#terminalSearchInput")) return;
    row.insertAdjacentHTML("beforeend", `<input id="terminalSearchInput" class="terminal-search-input" type="search" autocomplete="off" placeholder="Search symbol, decision, score" />`);
    updateFilterButtons();
  }

  function installInspector() {
    const terminal = document.querySelector("#ashTradingTerminalView");
    const proof = document.querySelector("#terminalProof")?.closest(".panel");
    if (!terminal || !proof || document.querySelector("#terminalGateInspector")) return;
    proof.insertAdjacentHTML("beforeend", `
      <section class="terminal-gate-inspector" id="terminalGateInspector">
        <div class="panel-header"><h3>1-2000 Parameter Board</h3><span id="terminalGateState">Select a parameter</span></div>
        <div class="terminal-param-controls">
          <input id="terminalParamSearch" type="search" autocomplete="off" placeholder="Search 1-2000, P681, candle, quote" />
          <select id="terminalParamStatus">
            <option value="ALL">All</option>
            <option value="HIT">Hit</option>
            <option value="WAITING">Waiting</option>
            <option value="DATA_NEEDED">Data needed</option>
          </select>
        </div>
        <div class="terminal-param-board" id="terminalParamBoard" aria-label="1-2000 parameter board"></div>
        <div class="panel-header compact"><h3>Clicked Parameter Detail</h3><span id="terminalParamCoverage">0 / 2000</span></div>
        <div id="terminalGateBody"></div>
      </section>
    `);
    renderInspector();
  }

  function renderInspector() {
    installInspector();
    renderParameterBoard();
    const body = document.querySelector("#terminalGateBody");
    const stateNode = document.querySelector("#terminalGateState");
    if (!body) return;
    const id = state.selectedGate || "P681";
    const detail = enrichDetail(id);
    if (stateNode) stateNode.textContent = id;
    body.innerHTML = `
      <article>
        <span>Parameter</span>
        <strong>${escapeHtml(id)} - ${escapeHtml(detail.family)}</strong>
      </article>
      <article>
        <span>Status</span>
        <strong>${escapeHtml(parameterStatus(id))}</strong>
      </article>
      <article>
        <span>Block</span>
        <strong>${escapeHtml(detail.block)}</strong>
      </article>
      <article>
        <span>Rule</span>
        <p>${escapeHtml(detail.rule)}</p>
      </article>
      <article>
        <span>Source</span>
        <p>${escapeHtml(detail.source)}</p>
      </article>
      <article>
        <span>Pass line</span>
        <p>${escapeHtml(detail.pass)}</p>
      </article>
      <article>
        <span>Current evidence</span>
        <p>${escapeHtml(currentEvidence(id))}</p>
      </article>
      <article>
        <span>Engine impact</span>
        <p>${escapeHtml(detail.impact)}</p>
      </article>
    `;
  }

  function renderParameterBoard() {
    const board = document.querySelector("#terminalParamBoard");
    if (!board) return;
    const query = state.paramSearch.trim().toLowerCase();
    const ids = [];
    let visible = 0;
    let known = 0;
    for (let number = 1; number <= TOTAL_PARAMETERS; number += 1) {
      const id = parameterId(number);
      const detail = enrichDetail(id);
      const status = parameterStatus(id);
      const haystack = `${number} ${id} ${detail.block} ${detail.family} ${detail.rule} ${detail.source}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query) || String(number).includes(query.replace(/^p/i, ""));
      const matchesStatus = state.paramStatus === "ALL" || status === state.paramStatus;
      if (!matchesQuery || !matchesStatus) continue;
      visible += 1;
      if (hasMetadata(id)) known += 1;
      ids.push(`<button type="button" class="${status} ${state.selectedGate === id ? "selected" : ""}" data-terminal-param-key="${id}" title="${escapeAttr(`${id} ${detail.family} | ${status}`)}">${number}</button>`);
    }
    board.innerHTML = ids.length ? ids.join("") : `<div class="terminal-empty">No parameters match this filter.</div>`;
    const coverage = document.querySelector("#terminalParamCoverage");
    if (coverage) coverage.textContent = `${visible} visible | ${known} with metadata | ${TOTAL_PARAMETERS} total`;
  }

  function enrichDetail(id) {
    const base = PARAMETER_DETAILS[id] || generatedDetail(id);
    const dictionary = state.parameters.find((param) => parameterMatches(param, id));
    if (!dictionary) return base;
    return {
      ...base,
      block: dictionary.block || dictionary.layer || dictionary.category || base.block,
      family: dictionary.family || dictionary.name || dictionary.label || base.family,
      rule: dictionary.rule || dictionary.description || base.rule,
      source: dictionary.source || dictionary.feed || base.source,
      pass: dictionary.pass_line || dictionary.threshold || base.pass,
      impact: dictionary.engine_impact || dictionary.impact || base.impact
    };
  }

  function generatedDetail(id) {
    return {
      block: "DATA_NEEDED",
      family: "Parameter metadata missing",
      source: "/api/scanner/parameters",
      rule: `DATA_NEEDED: parameter dictionary did not return metadata for ${id}.`,
      pass: "DATA_NEEDED: pass line missing from parameter dictionary.",
      impact: "DATA_NEEDED: engine impact not wired for this parameter yet."
    };
  }

  function currentEvidence(id) {
    const cards = Array.from(document.querySelectorAll("#terminalParameterGates article, #terminalProof .terminal-proof-grid span"));
    const match = cards.find((card) => (card.textContent || "").includes(id));
    if (!match) return `DATA_NEEDED: selected stock has not returned live evidence for ${id}.`;
    return (match.textContent || "").replace(/\s+/g, " ").trim();
  }

  function parameterStatus(id) {
    const evidence = currentEvidence(id);
    if (/\bHIT\b/i.test(evidence)) return "HIT";
    if (/DATA_NEEDED/i.test(evidence)) return "DATA_NEEDED";
    return hasMetadata(id) ? "WAITING" : "DATA_NEEDED";
  }

  function hasMetadata(id) {
    return Boolean(PARAMETER_DETAILS[id] || state.parameters.some((param) => parameterMatches(param, id)));
  }

  function parameterMatches(param, id) {
    const rawValues = [param.id, param.parameter, param.number, param.parameter_id, param.param_id].filter((value) => value !== undefined && value !== null);
    return rawValues.some((value) => normalizeParameterId(value) === id);
  }

  function applyTerminalFilters() {
    const buttons = Array.from(document.querySelectorAll("#terminalWatchList button[data-terminal-symbol]"));
    const query = state.search.trim().toLowerCase();
    for (const button of buttons) {
      const text = (button.textContent || "").toLowerCase();
      const decision = findDecision(text);
      const filterMatch = state.activeFilter === "ALL" ||
        decision === state.activeFilter ||
        (state.activeFilter === "CANDLE" && /P681|P683|P686|P688|candle|hit/.test(text)) ||
        (state.activeFilter === "DATA_NEEDED" && /data_needed|data needed|DATA_NEEDED/i.test(button.textContent || ""));
      const queryMatch = !query || text.includes(query);
      button.hidden = !(filterMatch && queryMatch);
    }
    const count = buttons.filter((button) => !button.hidden).length;
    const countNode = document.querySelector("#terminalWatchCount");
    if (countNode) countNode.textContent = String(count);
    const list = document.querySelector("#terminalWatchList");
    if (list && buttons.length && count === 0 && !document.querySelector("#terminalFilterEmpty")) {
      list.insertAdjacentHTML("beforeend", `<div class="terminal-empty" id="terminalFilterEmpty">No terminal rows match this filter. This is a real filter result, not placeholder data.</div>`);
    }
    const empty = document.querySelector("#terminalFilterEmpty");
    if (empty) empty.hidden = count !== 0;
  }

  function updateFilterButtons() {
    document.querySelectorAll("button[data-terminal-filter]").forEach((button) => {
      button.classList.toggle("active", button.dataset.terminalFilter === state.activeFilter);
    });
  }

  function findDecision(text) {
    if (text.includes("select")) return "SELECT";
    if (text.includes("watch")) return "WATCH";
    if (text.includes("blocked")) return "BLOCKED";
    if (text.includes("reject")) return "REJECT";
    if (text.includes("data_needed") || text.includes("data needed")) return "DATA_NEEDED";
    return "ALL";
  }

  function extractGateId(text) {
    return normalizeParameterId(String(text || "").match(/P?\d{1,4}/i)?.[0] || "P681");
  }

  function parameterId(number) {
    return `P${String(number).padStart(number < 1000 ? 3 : 4, "0")}`;
  }

  function normalizeParameterId(value) {
    const match = String(value || "").match(/\d{1,4}/);
    if (!match) return String(value || "").toUpperCase();
    return parameterId(Math.max(1, Math.min(TOTAL_PARAMETERS, Number(match[0]))));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }
})();
