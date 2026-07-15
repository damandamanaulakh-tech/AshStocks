(() => {
  const state = {
    rows: [],
    selectedSymbol: "",
    quotes: {},
    lastRunAt: 0
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) {
      response.clone().json().then((payload) => {
        if (Array.isArray(payload.rows)) {
          state.rows = payload.rows;
          state.lastRunAt = Date.now();
          state.selectedSymbol = chooseSymbol(payload.rows, state.selectedSymbol);
          renderReasoningPanel();
        }
      }).catch(() => {});
    }
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => bootReasoning());

  window.addEventListener("ashstocks:broker-select-symbol", (event) => {
    if (event.detail?.symbol) {
      state.selectedSymbol = event.detail.symbol;
      renderReasoningPanel();
    }
  });

  window.addEventListener("ashstocks:upstox-quote", (event) => {
    const detail = event.detail || {};
    const key = detail.instrument_key || detail.quoteState?.quote?.instrument_key || "";
    if (key) state.quotes[key] = detail.quoteState || { quote: detail.quote, ok: true };
    renderReasoningPanel();
  });

  document.addEventListener("click", (event) => {
    const rowButton = event.target.closest("button[data-terminal-symbol]");
    if (rowButton?.dataset?.terminalSymbol) {
      state.selectedSymbol = rowButton.dataset.terminalSymbol;
      renderReasoningPanel();
    }
    const action = event.target.closest("button[data-reason-paper-action]");
    if (action) {
      const target = document.querySelector(`button[data-terminal-paper-action="${action.dataset.reasonPaperAction}"]`);
      if (target) target.click();
    }
  }, true);

  const observer = new MutationObserver(() => installReasoningPanel());

  function bootReasoning() {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    installReasoningPanel();
    renderReasoningPanel();
  }

  function installReasoningPanel() {
    const gates = document.querySelector("#terminalParameterGates");
    if (!gates || document.querySelector("#terminalReasonVerifyExecute")) return;
    gates.insertAdjacentHTML("afterend", `
      <section class="terminal-rve" id="terminalReasonVerifyExecute">
        <div class="panel-header compact"><h3>Reason, Verify, Execute</h3><span id="terminalRveState">DATA_NEEDED</span></div>
        <div class="terminal-rve-grid" id="terminalRveGrid"></div>
        <div class="terminal-rve-checks" id="terminalRveChecks"></div>
      </section>
    `);
  }

  function renderReasoningPanel() {
    installReasoningPanel();
    const grid = document.querySelector("#terminalRveGrid");
    const checksHost = document.querySelector("#terminalRveChecks");
    const stateNode = document.querySelector("#terminalRveState");
    if (!grid || !checksHost) return;
    const row = selectedRow();
    const model = buildModel(row);
    if (stateNode) stateNode.textContent = model.verdict;
    grid.innerHTML = `
      <article>
        <span>Reason</span>
        <strong>${escapeHtml(model.reasonTitle)}</strong>
        <p>${escapeHtml(model.reasonText)}</p>
      </article>
      <article>
        <span>Verify</span>
        <strong>${model.passed}/${model.checks.length} gates passed</strong>
        <p>${escapeHtml(model.verifyText)}</p>
      </article>
      <article>
        <span>Execute</span>
        <strong>${escapeHtml(model.nextAction)}</strong>
        <p>${escapeHtml(model.executeText)}</p>
        <div class="terminal-rve-actions">
          <button type="button" data-reason-paper-action="BUY" ${model.allowBuy ? "" : "disabled"}>Paper BUY</button>
          <button type="button" data-reason-paper-action="GTT" ${model.allowGtt ? "" : "disabled"}>Paper GTT</button>
          <button type="button" data-reason-paper-action="SELL" ${model.allowSell ? "" : "disabled"}>Paper SELL</button>
        </div>
      </article>
    `;
    checksHost.innerHTML = model.checks.map((check) => `
      <article class="${check.status}">
        <span>${escapeHtml(check.id)}</span>
        <strong>${escapeHtml(check.label)}</strong>
        <b>${escapeHtml(check.status)}</b>
        <small>${escapeHtml(check.evidence)}</small>
      </article>
    `).join("");
  }

  function buildModel(row) {
    if (!row.symbol) {
      const checks = [check("R00", "Selected stock", "DATA_NEEDED", "Run scanner and select a stock.")];
      return {
        verdict: "DATA_NEEDED",
        reasonTitle: "No stock selected",
        reasonText: "Scanner row is required before AshStocks can reason on a paper trade.",
        verifyText: "No scanner evidence is loaded into the terminal yet.",
        nextAction: "Run Scan",
        executeText: "No paper action is available until a real scanner row exists.",
        checks,
        passed: 0,
        allowBuy: false,
        allowGtt: false,
        allowSell: false
      };
    }

    const quote = quoteState(row).quote;
    const checks = readinessChecks(row, quote);
    const passed = checks.filter((item) => item.status === "PASS").length;
    const hardBlocks = checks.filter((item) => item.status === "BLOCKED" || item.status === "DATA_NEEDED");
    const decision = row.decision || "DATA_NEEDED";
    const score = Number(row.score || row.paper_score || 0);
    const candleReady = row.candle_status === "HIT";
    const quoteReady = Boolean(quote?.last_price);
    const selectReady = decision === "SELECT" && passed >= 7 && quoteReady;
    const watchReady = decision === "WATCH" || candleReady || score >= 60;
    const verdict = selectReady ? "PAPER_BUY_READY" : watchReady ? "WATCH_READY" : hardBlocks.length ? "VERIFY_DATA" : "WAIT";
    const nextAction = selectReady ? "Paper BUY or Paper GTT" : watchReady ? "Keep in watchlist / create GTT only after quote+target verify" : "No buy yet";
    const reasonText = row.reason || row.paper_reason || row.advisor?.why || "No engine thesis returned. Use the blocker list instead of guessing.";
    const verifyText = hardBlocks.length ? hardBlocks.map((item) => `${item.label}: ${item.evidence}`).join(" | ") : "All visible hard checks passed for the current selected row.";
    return {
      verdict,
      reasonTitle: `${row.symbol} ${decision} | Score ${number(score)}`,
      reasonText,
      verifyText,
      nextAction,
      executeText: executionText(row, quote, verdict),
      checks,
      passed,
      allowBuy: selectReady,
      allowGtt: quoteReady && (selectReady || watchReady),
      allowSell: hasOpenPaperPosition(row.symbol)
    };
  }

  function readinessChecks(row, quote) {
    return [
      check("R01", "NSE instrument", instrumentKey(row) ? "PASS" : "DATA_NEEDED", instrumentKey(row) || "Need instrument_key from NSE master."),
      check("R02", "Scanner decision", row.decision === "SELECT" || row.decision === "WATCH" ? "PASS" : row.decision === "BLOCKED" ? "BLOCKED" : "DATA_NEEDED", row.decision || "No decision."),
      check("R03", "6M momentum", Number(row.return_6m_pct) >= 8 ? "PASS" : "BLOCKED", `6M ${number(row.return_6m_pct)}%`),
      check("R04", "12M trend", Number(row.return_12m_pct) >= 12 ? "PASS" : "BLOCKED", `12M ${number(row.return_12m_pct)}%`),
      check("R05", "Liquidity", Number(row.rupee_turnover_cr) >= 5 || Number(row.adv20) >= 200000 ? "PASS" : "DATA_NEEDED", `turnover ${number(row.rupee_turnover_cr)} cr | ADV ${compact(row.adv20)}`),
      check("R06", "Candle trigger", row.candle_status === "HIT" ? "PASS" : row.candle_status ? "BLOCKED" : "DATA_NEEDED", row.candle_status ? `${row.candle_status}: ${(row.candle_patterns || []).join(", ") || "no pattern"}` : "Need Upstox candles."),
      check("R07", "Target room", /PASS|OK|READY/i.test(String(row.target_potential_label || row.target_status || "")) ? "PASS" : "BLOCKED", row.target_potential_label || row.target_status || "DATA_NEEDED"),
      check("R08", "Upstox quote", quote?.last_price ? "PASS" : "DATA_NEEDED", quote?.last_price ? `ltp ${money(quote.last_price)}` : "Need /api/upstox/quote or stream tick."),
      check("R09", "Paper safety", "PASS", "paper_only true; live broker write disabled")
    ];
  }

  function executionText(row, quote, verdict) {
    if (verdict === "PAPER_BUY_READY") return `Paper ticket can use ${quote?.last_price ? "Upstox quote" : "scanner fallback"} price, target ${money(row.target_price || row.target2 || row.advisor?.target2)}, stop ${money(row.stop_price || row.advisor?.stop)}.`;
    if (verdict === "WATCH_READY") return "Do not force buy. Keep watch/GTT only after quote, target, and candle checks are visible.";
    return "Execution blocked until data-needed/blocker checks are resolved.";
  }

  function check(id, label, status, evidence) { return { id, label, status, evidence }; }
  function selectedRow() { return state.rows.find((row) => row.symbol === state.selectedSymbol) || rankedRows()[0] || {}; }
  function rankedRows() { return [...state.rows].sort((a, b) => rank(b) - rank(a) || Number(b.score || b.paper_score || 0) - Number(a.score || a.paper_score || 0)); }
  function rank(row) { return row.decision === "SELECT" ? 5 : row.decision === "WATCH" ? 4 : row.candle_status === "HIT" ? 3 : row.decision === "BLOCKED" ? 2 : 1; }
  function chooseSymbol(rows, current) { return current && rows.some((row) => row.symbol === current) ? current : rows.find((row) => row.decision === "SELECT")?.symbol || rows.find((row) => row.decision === "WATCH")?.symbol || rows[0]?.symbol || ""; }
  function instrumentKey(row) { return row?.instrument_key || row?.instrumentKey || row?.instrument_token || ""; }
  function quoteState(row) { return state.quotes[instrumentKey(row)] || window.__ashstocksUpstoxQuoteCache?.[instrumentKey(row)] || {}; }
  function hasOpenPaperPosition(symbol) { return Array.from(document.querySelectorAll("#terminalLedger article")).some((node) => (node.textContent || "").includes(symbol) && /Position|Order|Trade/i.test(node.textContent || "")); }
  function number(value) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(2) : "DATA_NEEDED"; }
  function money(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? `Rs ${n.toFixed(2)}` : "DATA_NEEDED"; }
  function compact(value) { const n = Number(value); if (!Number.isFinite(n)) return "DATA_NEEDED"; if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`; if (n >= 100000) return `${(n / 100000).toFixed(1)}L`; return String(Math.round(n)); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch])); }
})();
