(() => {
  const state = {
    scan: null,
    paperLedger: null,
    quoteCache: {},
    selectedSymbol: "",
    booted: false
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      state.scan = payload;
      state.selectedSymbol = pickSelectedSymbol(payload.rows || [], state.selectedSymbol);
      renderReasoningDock();
    });
    if (url.includes("/api/paper-trader/orders")) captureJson(response, (payload) => {
      state.paperLedger = payload;
      renderReasoningDock();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => bootReasoningDock().catch(() => {}));
  window.addEventListener("ashstocks:upstox-quote", (event) => {
    const detail = event.detail || {};
    if (detail.instrument_key && detail.quoteState) state.quoteCache[detail.instrument_key] = detail.quoteState;
    if (detail.symbol) state.selectedSymbol = detail.symbol;
    renderReasoningDock();
  });

  document.addEventListener("click", (event) => {
    const selected = event.target.closest("button[data-select-symbol]");
    if (selected?.dataset?.selectSymbol) {
      state.selectedSymbol = selected.dataset.selectSymbol;
      setTimeout(renderReasoningDock, 0);
    }
  }, true);

  async function bootReasoningDock() {
    if (state.booted) return;
    state.booted = true;
    await waitForWorkspace();
    installReasoningDock();
    state.quoteCache = window.__ashstocksUpstoxQuoteCache || state.quoteCache;
    await refreshPaperLedger();
    renderReasoningDock();
    setInterval(() => refreshPaperLedger().catch(() => {}), 45000);
  }

  function waitForWorkspace() {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector("#upstoxWorkspaceView")) return resolve();
        if (Date.now() - started > 10000) return resolve();
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  function installReasoningDock() {
    const workspace = document.querySelector("#upstoxWorkspaceView");
    if (!workspace || document.querySelector("#uwReasoningDock")) return;
    const anchor = workspace.querySelector(".uw-main-grid");
    const html = `
      <section class="uw-reasoning-dock" id="uwReasoningDock">
        <div class="panel-header">
          <div>
            <span class="eyebrow">Reason, Verify, Execute</span>
            <h3>AshStocks Decision Dock</h3>
          </div>
          <span id="uwReasonSource">Waiting for scanner</span>
        </div>
        <div class="uw-reason-head" id="uwReasonHead"></div>
        <div class="uw-reason-grid" id="uwReasonGrid"></div>
        <div class="uw-reason-columns">
          <section>
            <h4>Decision Evidence</h4>
            <div id="uwReasonEvidence" class="uw-reason-stack"></div>
          </section>
          <section>
            <h4>Parameter Gates</h4>
            <div id="uwReasonChecklist" class="uw-reason-checklist"></div>
          </section>
          <section>
            <h4>Paper Execution</h4>
            <div id="uwReasonExecution" class="uw-reason-stack"></div>
          </section>
        </div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    else workspace.insertAdjacentHTML("beforeend", html);
  }

  async function refreshPaperLedger() {
    try {
      const response = await fetch("/api/paper-trader/orders");
      if (response.status === 401) return;
      const payload = await response.json();
      if (payload && payload.ok !== false) state.paperLedger = payload;
    } catch (_) {}
  }

  function renderReasoningDock() {
    installReasoningDock();
    const dock = document.querySelector("#uwReasoningDock");
    if (!dock) return;
    const rows = state.scan?.rows || [];
    const row = rows.find((item) => item.symbol === state.selectedSymbol) || pickActionableRow(rows) || {};
    const quoteState = quoteStateFor(row);
    const source = document.querySelector("#uwReasonSource");
    if (source) source.textContent = state.scan?.asOf ? `scanner ${new Date(state.scan.asOf).toLocaleString()} | ${quoteStatus(row, quoteState)}` : `No scanner payload yet | ${quoteStatus(row, quoteState)}`;

    if (!row.symbol) {
      setHtml("#uwReasonHead", `<strong>No stock selected</strong><span>Run the scanner/Upstox scan. This dock does not invent a thesis without a real scanner row.</span>`);
      setHtml("#uwReasonGrid", summaryCards([
        ["Universe", state.scan?.summary?.total ?? 0],
        ["SELECT", state.scan?.summary?.SELECT ?? 0],
        ["WATCH", state.scan?.summary?.WATCH ?? 0],
        ["DATA_NEEDED", state.scan?.summary?.DATA_NEEDED ?? 0]
      ]));
      setHtml("#uwReasonEvidence", stackItems(["DATA_NEEDED: waiting for /api/scanner/run rows."]));
      setHtml("#uwReasonChecklist", checklist([]));
      setHtml("#uwReasonExecution", stackItems(["Paper only. broker_write_enabled: false."]));
      return;
    }

    const decision = row.decision || row.scanner_decision || "DATA_NEEDED";
    const intelligence = row.intelligence || {};
    const advisor = row.advisor || {};
    const paperOrder = row.paper_order || {};
    const target = row.target_potential || {};
    const candle = candleEvidence(row);
    const ledger = ledgerFor(row.symbol);
    const score = firstNumber(row.score, row.paper_score, intelligence.score, 0);
    const risk = firstNumber(row.regime_risk, intelligence.regime_risk, row.risk_score, 0);
    const coverage = firstNumber(row.parameter_coverage, intelligence.parameter_coverage, 0);
    const flow = firstNumber(row.flow_score, intelligence.flow_score, 0);
    const hot = firstNumber(row.hot_pocket_score, intelligence.hot_pocket_score, 0);

    setHtml("#uwReasonHead", `
      <div>
        <strong>${escapeHtml(row.symbol)} ${escapeHtml(row.name || "")}</strong>
        <span>${escapeHtml(row.sector || "Unmapped")} | ${escapeHtml(row.instrument_key || row.isin || "instrument missing")}</span>
      </div>
      <b class="uw-reason-verdict ${escapeAttr(decision)}">${escapeHtml(decision)}</b>
    `);

    setHtml("#uwReasonGrid", summaryCards([
      ["Scanner Score", number(score)],
      ["Quote", quoteCardValue(row, quoteState)],
      ["Intel Coverage", `${number(coverage)} / 100`],
      ["Candle", `${escapeHtml(candle.status)} ${number(candle.score)}`],
      ["FII/DII Flow", `${number(flow)} / 100`],
      ["Hot Pocket", `${number(hot)} / 100`],
      ["Regime Risk", `${number(risk)} / 100`]
    ]));

    setHtml("#uwReasonEvidence", stackItems(evidenceLines(row, advisor, intelligence, candle, target, quoteState)));
    setHtml("#uwReasonChecklist", checklist(gates(row, candle, target, ledger, quoteState)));
    setHtml("#uwReasonExecution", stackItems(executionLines(row, advisor, paperOrder, ledger, quoteState)));
  }

  function evidenceLines(row, advisor, intelligence, candle, target, quoteState) {
    const lines = [];
    const decision = row.decision || row.scanner_decision || "DATA_NEEDED";
    lines.push(`${decision}: ${row.reason || row.paper_reason || row.fetch_error || "No engine reason returned."}`);
    lines.push(`Quote proof: ${quoteStatus(row, quoteState)}${quoteState.quote ? `; LTP ${formatPrice(quoteState.quote.last_price || quoteState.quote.close)}; spread ${spreadText(quoteState.quote)}` : ""}.`);
    if (row.fetch_error) lines.push(`DATA_NEEDED source: ${row.fetch_error}`);
    if (advisor.setup || advisor.conviction || advisor.horizon) lines.push(`Advisor: ${advisor.setup || "setup missing"}; conviction ${advisor.conviction || "not returned"}; horizon ${advisor.horizon || "not returned"}.`);
    if (advisor.why) lines.push(`Advisor why: ${advisor.why}`);
    if (Array.isArray(advisor.parameters_used) && advisor.parameters_used.length) lines.push(`Advisor parameters: ${advisor.parameters_used.slice(0, 8).join(", ")}`);
    if (Array.isArray(intelligence.notes) && intelligence.notes.length) lines.push(`Intelligence notes: ${intelligence.notes.slice(0, 4).join(" | ")}`);
    lines.push(`Candle: ${candle.text}`);
    lines.push(`Target room: ${target.label || row.target_label || "not labelled"}; potential ${number(target.potential_left_pct ?? row.target_pct)}%.`);
    return lines.filter(Boolean);
  }

  function executionLines(row, advisor, paperOrder, ledger, quoteState) {
    const quotePrice = firstNumber(quoteState.quote?.last_price, quoteState.quote?.close, row.close, 0);
    const entry = advisor.entry_zone || paperOrder.entry_price || quotePrice || row.close;
    const target1 = advisor.target1 || paperOrder.target_price || row.target_price || row.target1;
    const target2 = advisor.target2 || row.target2;
    const stop = advisor.stop || paperOrder.stop_price || row.stop_price;
    const qty = paperOrder.qty || advisor.qty || row.qty || 0;
    const lines = [
      `Quote source: ${quoteState.quote ? "Upstox Market Quote API" : "scanner fallback / DATA_NEEDED"}.`,
      `Entry: ${formatPrice(entry)} | Qty: ${qty || "not sized"}`,
      `Target: ${formatPrice(target1)}${target2 ? ` / ${formatPrice(target2)}` : ""}`,
      `Stop: ${formatPrice(stop)} | Exit rule: ${advisor.exit_rule || row.exit_rule || "not returned"}`,
      `Paper order row: ${paperOrder.status || "not created"}. broker_write_enabled: false.`
    ];
    if (ledger.position) lines.push(`Open paper position: ${ledger.position.qty || 0} qty, avg ${formatPrice(ledger.position.avg_price || ledger.position.avgPrice)}.`);
    if (ledger.orders.length) lines.push(`Order ledger: ${ledger.orders.length} order(s), latest ${ledger.orders[0].status || ledger.orders[0].type || "recorded"}.`);
    if (ledger.gtt.length) lines.push(`GTT ledger: ${ledger.gtt.length} trigger plan(s) active/recorded.`);
    return lines;
  }

  function gates(row, candle, target, ledger, quoteState) {
    const decision = row.decision || row.scanner_decision || "DATA_NEEDED";
    return [
      ["Universe", Boolean(row.symbol && row.instrument_key), row.instrument_key || row.isin || "instrument key missing"],
      ["Quote", Boolean(quoteState.quote), quoteStatus(row, quoteState)],
      ["Depth", Boolean(quoteState.quote?.depth_available), quoteState.quote?.depth_available ? spreadText(quoteState.quote) : "REST depth missing or quote not loaded"],
      ["Data", !row.fetch_error && Boolean(row.close || row.last_candle_date || row.candles?.length), row.fetch_error || row.last_candle_date || "latest close/candle missing"],
      ["Momentum", firstNumber(row.momentum_score, row.score, 0) >= 60 || firstNumber(row.return_6m_pct, 0) >= 8, `score ${number(row.momentum_score || row.score)}; 6M ${number(row.return_6m_pct)}%`],
      ["Candle", candle.status === "HIT" || candle.status === "PASS", candle.text],
      ["Target Room", target.label === "PASS" || firstNumber(target.potential_left_pct, row.target_pct, 0) >= 8, `${target.label || "not labelled"} ${number(target.potential_left_pct ?? row.target_pct)}%`],
      ["Risk", !/BLOCKED|DATA_NEEDED/.test(decision) || firstNumber(row.regime_risk, 0) < 50, row.reason || "risk not blocking"],
      ["Paper", Boolean(row.paper_order?.status || ledger.orders.length || ledger.position), row.paper_order?.status || "paper order not created yet"]
    ];
  }

  function ledgerFor(symbol) {
    const ledger = state.paperLedger || {};
    const matchSymbol = (item) => String(item?.symbol || "").toUpperCase() === String(symbol || "").toUpperCase();
    const orders = (ledger.orders || []).filter(matchSymbol).slice().reverse();
    const gtt = (ledger.gtt || ledger.gtts || []).filter(matchSymbol).slice().reverse();
    const position = (ledger.positions || []).find(matchSymbol) || null;
    return { orders, gtt, position };
  }

  function candleEvidence(row) {
    const status = row.candle_status || row.candle_engine?.status || (row.candle_score ? "PASS" : (row.candles?.length ? "WEAK" : "DATA_NEEDED"));
    const score = firstNumber(row.candle_score, row.candle_engine?.score, 0);
    const names = row.candle_patterns || row.candle_pattern_names || row.candle_engine?.patterns || [];
    const evidence = row.candle_evidence || row.candle_engine?.evidence || "";
    const text = [Array.isArray(names) && names.length ? names.slice(0, 5).join(", ") : "no proven candle pattern returned", evidence, row.last_candle_date ? `last candle ${row.last_candle_date}` : "last candle date missing"].filter(Boolean).join("; ");
    return { status, score, text };
  }

  function quoteStateFor(row) {
    const key = row.instrument_key || row.instrumentKey || row.instrument_token || "";
    return state.quoteCache[key] || window.__ashstocksUpstoxQuoteCache?.[key] || {};
  }

  function quoteStatus(row, quoteState) {
    if (!row.symbol) return "no stock selected";
    if (!(row.instrument_key || row.instrumentKey || row.instrument_token)) return "DATA_NEEDED: no Upstox instrument_key";
    if (quoteState.loading) return "Upstox quote loading";
    if (quoteState.quote) return quoteState.quote.depth_available ? "Upstox quote + depth ok" : "Upstox quote ok; depth missing";
    if (quoteState.error) return `Upstox quote failed: ${quoteState.error}`;
    return "Upstox quote not requested yet";
  }

  function quoteCardValue(row, quoteState) {
    if (quoteState.quote) return formatPrice(quoteState.quote.last_price || quoteState.quote.close);
    if (quoteState.error) return "FAILED";
    if (row.instrument_key) return "WAITING";
    return "DATA_NEEDED";
  }

  function spreadText(quote) {
    const bid = quote?.depth?.bids?.[0]?.price;
    const ask = quote?.depth?.asks?.[0]?.price;
    if (!Number.isFinite(Number(bid)) || !Number.isFinite(Number(ask))) return "spread DATA_NEEDED";
    return `bid ${formatPrice(bid)} / ask ${formatPrice(ask)}`;
  }

  function checklist(items) {
    if (!items.length) return `<div class="uw-reason-empty">No gates available until scanner data arrives.</div>`;
    return items.map(([label, ok, text]) => `<article class="${ok ? "pass" : "wait"}"><b>${ok ? "PASS" : "DATA_NEEDED"}</b><strong>${escapeHtml(label)}</strong><span>${escapeHtml(text || "not returned")}</span></article>`).join("");
  }

  function stackItems(items) {
    return items.map((item) => `<article>${escapeHtml(item)}</article>`).join("");
  }

  function summaryCards(items) {
    return items.map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  }

  function pickActionableRow(rows) {
    return rows.find((row) => row.decision === "SELECT") || rows.find((row) => row.decision === "WATCH") || rows[0];
  }

  function pickSelectedSymbol(rows, current) {
    if (current && rows.some((row) => row.symbol === current)) return current;
    return pickActionableRow(rows)?.symbol || "";
  }

  function captureJson(response, callback) {
    response.clone().json().then((payload) => {
      if (payload && payload.ok !== false) callback(payload);
    }).catch(() => {});
  }

  function setHtml(selector, html) {
    const node = document.querySelector(selector);
    if (node) node.innerHTML = html;
  }

  function firstNumber(...values) {
    for (const value of values) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
    return 0;
  }

  function number(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
  }

  function formatPrice(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `Rs ${numeric.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "not returned";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
