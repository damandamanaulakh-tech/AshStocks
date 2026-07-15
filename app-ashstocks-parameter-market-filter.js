(() => {
  const state = {
    rows: [],
    selectedParameter: "",
    enabled: false,
    lastCount: 0
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) {
      response.clone().json().then((payload) => {
        if (Array.isArray(payload.rows)) {
          state.rows = payload.rows;
          applyParameterMarketFilter();
        }
      }).catch(() => {});
    }
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => bootParameterMarketFilter());

  document.addEventListener("click", (event) => {
    const key = event.target.closest("button[data-terminal-param-key]");
    if (key?.dataset?.terminalParamKey) {
      state.selectedParameter = key.dataset.terminalParamKey;
      state.enabled = true;
      applyParameterMarketFilter();
      renderParameterMarketFilter();
    }
    const clear = event.target.closest("button[data-clear-parameter-market-filter]");
    if (clear) {
      state.enabled = false;
      state.selectedParameter = "";
      applyParameterMarketFilter();
      renderParameterMarketFilter();
    }
  }, true);

  const observer = new MutationObserver(() => {
    installParameterMarketFilter();
    if (state.enabled) applyParameterMarketFilter();
  });

  function bootParameterMarketFilter() {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    installParameterMarketFilter();
  }

  function installParameterMarketFilter() {
    const board = document.querySelector("#terminalParamBoard");
    if (!board || document.querySelector("#terminalParameterMarketFilter")) return;
    board.insertAdjacentHTML("afterend", `
      <section class="terminal-parameter-market-filter" id="terminalParameterMarketFilter">
        <div>
          <span>Parameter market filter</span>
          <strong id="terminalParameterMarketFilterState">No parameter applied</strong>
        </div>
        <button type="button" data-clear-parameter-market-filter>Clear</button>
      </section>
    `);
    renderParameterMarketFilter();
  }

  function renderParameterMarketFilter() {
    installParameterMarketFilter();
    const stateNode = document.querySelector("#terminalParameterMarketFilterState");
    if (!stateNode) return;
    if (!state.enabled || !state.selectedParameter) {
      stateNode.textContent = "No parameter applied";
      return;
    }
    const detail = parameterDetail(state.selectedParameter);
    stateNode.textContent = `${state.selectedParameter} ${detail.label}: ${state.lastCount} matching rows`;
  }

  function applyParameterMarketFilter() {
    const buttons = Array.from(document.querySelectorAll("#terminalWatchList button[data-terminal-symbol]"));
    if (!buttons.length) return;
    if (!state.enabled || !state.selectedParameter) {
      buttons.forEach((button) => { button.hidden = false; button.classList.remove("parameter-filtered-out"); });
      state.lastCount = buttons.length;
      updateCount(buttons.length);
      return;
    }
    let count = 0;
    for (const button of buttons) {
      const symbol = button.dataset.terminalSymbol || "";
      const row = state.rows.find((item) => item.symbol === symbol) || rowFromButton(button);
      const result = rowPassesParameter(row, state.selectedParameter);
      button.hidden = !result.pass;
      button.classList.toggle("parameter-filtered-out", !result.pass);
      button.dataset.parameterFilterEvidence = result.evidence;
      if (result.pass) count += 1;
    }
    state.lastCount = count;
    updateCount(count);
    renderParameterMarketFilter();
    renderEmptyState(count, buttons.length);
  }

  function renderEmptyState(count, total) {
    const list = document.querySelector("#terminalWatchList");
    if (!list) return;
    let empty = document.querySelector("#terminalParameterFilterEmpty");
    if (!empty) {
      list.insertAdjacentHTML("beforeend", `<div class="terminal-empty" id="terminalParameterFilterEmpty"></div>`);
      empty = document.querySelector("#terminalParameterFilterEmpty");
    }
    empty.hidden = count !== 0 || !state.enabled;
    empty.textContent = `No rows match ${state.selectedParameter}. Checked ${total} real scanner rows; no placeholder candidates shown.`;
  }

  function updateCount(count) {
    const countNode = document.querySelector("#terminalWatchCount");
    if (countNode) countNode.textContent = String(count);
  }

  function rowPassesParameter(row, id) {
    const n = Number(String(id || "").replace(/\D/g, ""));
    if (!row?.symbol) return { pass: false, evidence: "DATA_NEEDED: scanner row missing" };
    if (n === 1) return result(Boolean(row.instrument_key || row.instrumentKey || row.instrument_token), row.instrument_key || "DATA_NEEDED: instrument_key missing");
    if (n === 261) return result(Number(row.return_6m_pct) >= 8, `6M ${num(row.return_6m_pct)}%`);
    if (n === 401) return result(Number(row.return_12m_pct) >= 12, `12M ${num(row.return_12m_pct)}%`);
    if (n === 521) return result(Number(row.rupee_turnover_cr) >= 5 || Number(row.adv20) >= 200000, `turnover ${num(row.rupee_turnover_cr)} cr ADV ${compact(row.adv20)}`);
    if (n === 681) return result(pattern(row, "bullish_engulfing"), candleEvidence(row));
    if (n === 683) return result(pattern(row, "hammer_rejection"), candleEvidence(row));
    if (n === 686) return result(pattern(row, "near_252d_breakout"), candleEvidence(row));
    if (n === 688) return result(pattern(row, "volume_confirmation"), candleEvidence(row));
    if (n === 1120) return result(/PASS|OK|READY/i.test(String(row.target_potential_label || row.target_status || "")), row.target_potential_label || row.target_status || "DATA_NEEDED: target room missing");
    if (n === 1701) return result(Boolean(row.instrument_key || row.instrumentKey || row.instrument_token), "Quote filter needs instrument_key; live quote evidence updates selected stock.");
    if (n === 1901) return result(true, "Paper safety applies to all rows: broker_write_enabled false.");
    return { pass: false, evidence: `DATA_NEEDED: ${id} is not mapped to a market-watch row filter yet.` };
  }

  function parameterDetail(id) {
    const n = Number(String(id || "").replace(/\D/g, ""));
    const labels = {
      1: "NSE universe",
      261: "6M momentum",
      401: "12M trend",
      521: "liquidity",
      681: "bullish candle",
      683: "hammer rejection",
      686: "252D breakout",
      688: "volume confirmation",
      1120: "target room",
      1701: "Upstox quote readiness",
      1901: "paper safety"
    };
    return { label: labels[n] || "DATA_NEEDED mapping" };
  }

  function result(pass, evidence) { return { pass: Boolean(pass), evidence: String(evidence || "DATA_NEEDED") }; }
  function pattern(row, name) { return row.candle_status === "HIT" && Array.isArray(row.candle_patterns) && row.candle_patterns.includes(name); }
  function candleEvidence(row) { return row.candle_status ? `${row.candle_status}: ${(row.candle_patterns || []).join(", ") || "no pattern"}` : "DATA_NEEDED: candle engine"; }
  function rowFromButton(button) { return { symbol: button.dataset.terminalSymbol || "", decision: button.textContent || "" }; }
  function num(value) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(2) : "DATA_NEEDED"; }
  function compact(value) { const n = Number(value); if (!Number.isFinite(n)) return "DATA_NEEDED"; if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`; if (n >= 100000) return `${(n / 100000).toFixed(1)}L`; return String(Math.round(n)); }
})();
