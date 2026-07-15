(() => {
  const state = {
    scan: null,
    ledger: null,
    quoteCache: {},
    selectedSymbol: "",
    busy: false,
    message: "Waiting for scanner candles",
    booted: false
  };

  const PATTERN_PARAMS = {
    bullish_engulfing: 681,
    bearish_engulfing: 682,
    hammer_rejection: 683,
    wide_body_bullish: 684,
    wide_body_bearish: 685,
    near_252d_breakout: 686,
    inside_bar: 687,
    volume_confirmation: 688,
    doji_exhaustion_watch: 689,
    supply_rejection_watch: 690,
    three_candle_continuation_watch: 691
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      state.scan = payload;
      state.selectedSymbol = pickSelectedSymbol(payload.rows || [], state.selectedSymbol);
      state.message = `Candle tape synced: ${(payload.rows || []).length} rows`;
      renderCandleTape();
    });
    if (url.includes("/api/paper-trader/orders")) captureJson(response, (payload) => {
      state.ledger = payload;
      renderCandleTape();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => bootCandleTape().catch(() => {}));
  window.addEventListener("ashstocks:upstox-quote", (event) => {
    const detail = event.detail || {};
    if (detail.instrument_key && detail.quoteState) state.quoteCache[detail.instrument_key] = detail.quoteState;
    if (detail.symbol) state.selectedSymbol = detail.symbol;
    renderCandleTape();
  });
  window.addEventListener("ashstocks:broker-select-symbol", (event) => {
    if (event.detail?.symbol) {
      state.selectedSymbol = event.detail.symbol;
      renderCandleTape();
    }
  });

  document.addEventListener("click", (event) => {
    const selected = event.target.closest("button[data-select-symbol]");
    if (selected?.dataset?.selectSymbol) {
      state.selectedSymbol = selected.dataset.selectSymbol;
      setTimeout(renderCandleTape, 0);
    }

    const detail = event.target.closest("button[data-candle-param]");
    if (detail) {
      state.selectedSymbol = detail.dataset.symbol || state.selectedSymbol;
      renderCandleTape(Number(detail.dataset.candleParam || 681));
    }

    const action = event.target.closest("button[data-candle-tape-action]");
    if (action) {
      const row = scannerRows().find((item) => item.symbol === action.dataset.symbol) || selectedRow();
      state.selectedSymbol = row.symbol || state.selectedSymbol;
      submitCandlePaperAction(row, action.dataset.candleTapeAction).catch(() => {});
    }
  }, true);

  async function bootCandleTape() {
    if (state.booted) return;
    state.booted = true;
    await waitForWorkspace();
    installCandleTape();
    await refreshLedger();
    renderCandleTape();
    setInterval(() => refreshLedger().catch(() => {}), 60000);
  }

  function waitForWorkspace() {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector("#upstoxWorkspaceView") || document.querySelector("#brokerSignalsView")) return resolve();
        if (Date.now() - started > 12000) return resolve();
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  function installCandleTape() {
    installWorkspaceTape();
    installBrokerSignalTape();
  }

  function installWorkspaceTape() {
    const workspace = document.querySelector("#upstoxWorkspaceView");
    if (!workspace || document.querySelector("#uwCandleTriggerTape")) return;
    const anchor = document.querySelector("#uwTradeQueueBridge") || document.querySelector("#uwReasoningDock") || workspace.querySelector(".uw-lower-grid");
    const html = `
      <section class="panel candle-trigger-tape" id="uwCandleTriggerTape">
        <div class="panel-header">
          <div><span class="eyebrow">Candle Parameters 681-800</span><h3>Candle Trigger Tape</h3></div>
          <span id="candleTapeState">Waiting</span>
        </div>
        <div class="candle-tape-summary" id="candleTapeSummary"></div>
        <div class="candle-tape-selected" id="candleTapeSelected"></div>
        <div class="uw-table-wrap candle-tape-table"><table><thead><tr><th>Stock</th><th>Status</th><th>Pattern Parameters</th><th>Evidence</th><th>Quote</th><th>Paper</th></tr></thead><tbody id="candleTapeBody"></tbody></table></div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    else workspace.insertAdjacentHTML("beforeend", html);
  }

  function installBrokerSignalTape() {
    const view = document.querySelector("#brokerSignalsView");
    if (!view || document.querySelector("#brokerCandleTriggerTape")) return;
    const anchor = document.querySelector("#brokerHubSignalPanel") || view.querySelector(".broker-page-head") || view.firstElementChild;
    const html = `
      <section class="panel candle-trigger-tape" id="brokerCandleTriggerTape">
        <div class="panel-header"><div><span class="eyebrow">Broker Signal Layer</span><h3>Candle Hit Watch</h3></div><span id="brokerCandleTapeState">Waiting</span></div>
        <div class="uw-table-wrap candle-tape-table"><table><thead><tr><th>Stock</th><th>Candle</th><th>Parameters</th><th>Order Readiness</th></tr></thead><tbody id="brokerCandleTapeBody"></tbody></table></div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    else view.insertAdjacentHTML("beforeend", html);
  }

  async function refreshLedger() {
    try {
      const response = await fetch("/api/paper-trader/orders");
      if (response.status === 401) return;
      const payload = await response.json();
      if (payload && payload.ok !== false) state.ledger = payload;
    } catch (_) {}
  }

  function renderCandleTape(forceParam = 0) {
    installCandleTape();
    const rows = scannerRows();
    const selected = selectedRow();
    renderSummary(rows);
    renderSelected(selected, forceParam);
    renderWorkspaceRows(rows);
    renderBrokerRows(rows);
  }

  function renderSummary(rows) {
    const host = document.querySelector("#candleTapeSummary");
    const stateNode = document.querySelector("#candleTapeState");
    const brokerState = document.querySelector("#brokerCandleTapeState");
    const ready = rows.filter((row) => candleStatus(row) === "HIT" || candleStatus(row) === "PASS").length;
    const watch = rows.filter((row) => candleStatus(row) === "WATCH").length;
    const data = rows.filter((row) => candleStatus(row) === "DATA_NEEDED").length;
    if (stateNode) stateNode.textContent = state.busy ? "Working" : (state.message || `${ready} candle hits`);
    if (brokerState) brokerState.textContent = rows.length ? `${ready} hit / ${watch} watch` : "DATA_NEEDED";
    if (!host) return;
    host.innerHTML = [
      ["Rows", rows.length || "DATA_NEEDED"],
      ["HIT/PASS", ready],
      ["WATCH", watch],
      ["DATA_NEEDED", data],
      ["Parameter Family", "681-800"],
      ["Paper Mode", "Only"]
    ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  }

  function renderSelected(row, forceParam) {
    const host = document.querySelector("#candleTapeSelected");
    if (!host) return;
    if (!row.symbol) {
      host.innerHTML = `<div class="candle-empty"><strong>No selected stock</strong><span>Run scanner to populate candle parameters. No fake candle hit is shown.</span></div>`;
      return;
    }
    const params = candleParams(row);
    const selectedParam = forceParam || params[0]?.number || 681;
    host.innerHTML = `
      <article><span>Selected</span><strong>${escapeHtml(row.symbol)}</strong><b>${escapeHtml(row.name || row.sector || "")}</b></article>
      <article><span>Status</span><strong>${escapeHtml(candleStatus(row))} / ${number(row.candle_score)}</strong><b>${escapeHtml(row.candle_reason || "No pattern reason")}</b></article>
      <article><span>Active Parameter</span><strong>P${escapeHtml(selectedParam)}</strong><b>${escapeHtml(parameterText(selectedParam, row))}</b></article>
      <article><span>Evidence</span><strong>${escapeHtml(row.candle_evidence || row.fetch_error || "DATA_NEEDED")}</strong><b>${escapeHtml(row.last_candle_date || "latest date missing")}</b></article>
    `;
  }

  function renderWorkspaceRows(rows) {
    const body = document.querySelector("#candleTapeBody");
    if (!body) return;
    body.innerHTML = rows.length ? rows.slice(0, 50).map((row) => {
      const params = candleParams(row);
      const quote = quoteStateFor(row).quote;
      return `<tr>
        <td><button type="button" data-select-symbol="${escapeAttr(row.symbol)}"><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.name || "")}</span></button></td>
        <td><span class="candle-status ${escapeAttr(candleStatus(row))}">${escapeHtml(candleStatus(row))}</span><small>${number(row.candle_score)} / 100</small></td>
        <td>${renderParamButtons(row, params)}</td>
        <td><strong>${escapeHtml(row.candle_reason || "No candle reason")}</strong><span>${escapeHtml(row.candle_evidence || row.fetch_error || "DATA_NEEDED: OHLC candle bodies missing")}</span></td>
        <td><strong>${escapeHtml(quote ? money(quote.last_price || quote.close) : "DATA_NEEDED")}</strong><span>${escapeHtml(quoteStatus(row))}</span></td>
        <td><div class="candle-actions"><button type="button" data-candle-tape-action="BUY" data-symbol="${escapeAttr(row.symbol)}">BUY</button><button type="button" data-candle-tape-action="GTT" data-symbol="${escapeAttr(row.symbol)}">GTT</button></div><small>${escapeHtml(paperState(row))}</small></td>
      </tr>`;
    }).join("") : `<tr><td colspan="6" class="empty-cell">No scanner candle rows captured. Run Upstox scan or broker scanner.</td></tr>`;
  }

  function renderBrokerRows(rows) {
    const body = document.querySelector("#brokerCandleTapeBody");
    if (!body) return;
    const ordered = rows.slice(0, 30);
    body.innerHTML = ordered.length ? ordered.map((row) => `<tr>
      <td><button type="button" data-select-symbol="${escapeAttr(row.symbol)}"><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.name || "")}</span></button></td>
      <td><span class="candle-status ${escapeAttr(candleStatus(row))}">${escapeHtml(candleStatus(row))}</span><small>${escapeHtml(row.candle_reason || "No candle reason")}</small></td>
      <td>${renderParamButtons(row, candleParams(row))}</td>
      <td>${escapeHtml(readinessText(row))}</td>
    </tr>`).join("") : `<tr><td colspan="4" class="empty-cell">No candle trigger tape yet. Run scanner.</td></tr>`;
  }

  function scannerRows() {
    return (state.scan?.rows || []).slice().sort((a, b) => {
      const rank = (row) => candleStatus(row) === "HIT" || candleStatus(row) === "PASS" ? 4 : candleStatus(row) === "WATCH" ? 3 : row.decision === "SELECT" ? 2 : row.decision === "WATCH" ? 1 : 0;
      return rank(b) - rank(a) || Number(b.candle_score || 0) - Number(a.candle_score || 0) || Number(b.score || b.paper_score || 0) - Number(a.score || a.paper_score || 0);
    });
  }

  function selectedRow() {
    const rows = scannerRows();
    return rows.find((row) => row.symbol === state.selectedSymbol) || rows[0] || {};
  }

  function candleParams(row) {
    const patterns = Array.isArray(row.candle_patterns) ? row.candle_patterns : [];
    if (!patterns.length) {
      if (candleStatus(row) === "DATA_NEEDED") return [{ number: 700, label: "ohlc_data_needed", ok: false }];
      return [{ number: 699, label: "no_pattern_hit", ok: false }];
    }
    return patterns.slice(0, 8).map((pattern) => ({ number: PATTERN_PARAMS[pattern] || 698, label: pattern, ok: candleStatus(row) === "HIT" || candleStatus(row) === "PASS" }));
  }

  function renderParamButtons(row, params) {
    return `<div class="candle-param-list">${params.map((param) => `<button type="button" class="${param.ok ? "hit" : "need"}" data-candle-param="${param.number}" data-symbol="${escapeAttr(row.symbol)}">P${param.number}<span>${escapeHtml(param.label)}</span></button>`).join("")}</div>`;
  }

  async function submitCandlePaperAction(row, action) {
    if (state.busy || !row.symbol) return;
    state.busy = true;
    state.message = `Sending ${row.symbol} candle ${action}...`;
    renderCandleTape();
    try {
      const quote = quoteStateFor(row).quote || {};
      const price = firstFinite(quote.last_price, quote.close, row.close, row.entry_price, 0);
      const payload = {
        symbol: row.symbol,
        name: row.name || row.symbol,
        sector: row.sector || "Unmapped",
        instrument_key: instrumentKey(row) || null,
        side: "BUY",
        product: "Paper Swing",
        order_type: action === "GTT" ? "GTT" : "MARKET",
        validity: action === "GTT" ? "GTT" : "DAY",
        qty: estimatedQty(row, price),
        price,
        target_price: firstFinite(row.target_price, row.target2, row.advisor?.target2, row.advisor?.target1, null),
        stop_price: firstFinite(row.stop_price, row.advisor?.stop, null),
        risk_pct: 0.75,
        capital: 100000,
        thesis: `Candle ${candleStatus(row)}: ${row.candle_reason || row.reason || "AshStocks candle trigger"}`,
        source: "candle-trigger-tape",
        quote_source: quote.last_price || quote.close ? "Upstox Market Quote API" : "scanner-fallback",
        candle_status: candleStatus(row),
        candle_score: row.candle_score || 0,
        candle_patterns: row.candle_patterns || [],
        broker_write_enabled: false,
        paper_only: true,
        gtt: action === "GTT"
      };
      const response = await fetch("/api/paper-trader/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) throw new Error(result.error || result.order?.rejection_reason || `paper order failed ${response.status}`);
      state.message = `${row.symbol} ${result.action || action} ${result.order?.id || result.gtt?.id || "done"}`;
      await refreshLedger();
    } catch (error) {
      state.message = error.message || String(error);
    } finally {
      state.busy = false;
      renderCandleTape();
    }
  }

  function candleStatus(row) { return row.candle_status || row.candle_engine?.status || (row.candles?.length ? "WATCH" : "DATA_NEEDED"); }
  function parameterText(param, row) {
    const found = Object.entries(PATTERN_PARAMS).find(([, number]) => number === Number(param));
    if (found) return `${found[0]} from server candle engine`;
    if (Number(param) === 700) return "OHLC candle bodies are required before this parameter can hit";
    return row.candle_reason || "Candle parameter awaiting stronger evidence";
  }

  function quoteStateFor(row) { return state.quoteCache[instrumentKey(row)] || window.__ashstocksUpstoxQuoteCache?.[instrumentKey(row)] || {}; }
  function quoteStatus(row) {
    const quoteState = quoteStateFor(row);
    if (!instrumentKey(row)) return "instrument_key DATA_NEEDED";
    if (quoteState.loading) return "quote loading";
    if (quoteState.quote?.depth_available) return "quote + depth ok";
    if (quoteState.quote) return "quote ok; depth missing";
    if (quoteState.error) return `quote failed: ${quoteState.error}`;
    return "quote not requested yet";
  }

  function readinessText(row) {
    const missing = [];
    if (!(candleStatus(row) === "HIT" || candleStatus(row) === "PASS")) missing.push("candle hit");
    if (!quoteStateFor(row).quote) missing.push("quote");
    if (!firstFinite(row.target_price, row.target2, row.advisor?.target2, null)) missing.push("target");
    if (!firstFinite(row.stop_price, row.advisor?.stop, null)) missing.push("stop");
    return missing.length ? `Needs ${missing.join(", ")}` : "Ready for paper order";
  }

  function paperState(row) {
    const orders = (state.ledger?.orders || []).filter((order) => sameSymbol(order, row));
    const gtt = (state.ledger?.gtt || state.ledger?.gtts || []).filter((item) => sameSymbol(item, row));
    const position = (state.ledger?.positions || []).find((item) => sameSymbol(item, row));
    if (position) return "POSITION_OPEN";
    if (gtt.length) return "GTT_CREATED";
    if (orders.length) return orders[0].status || "ORDER_CREATED";
    return "NOT_CREATED";
  }

  function pickSelectedSymbol(rows, current) {
    if (current && rows.some((row) => row.symbol === current)) return current;
    return rows.find((row) => candleStatus(row) === "HIT")?.symbol || rows.find((row) => row.decision === "SELECT")?.symbol || rows.find((row) => row.decision === "WATCH")?.symbol || rows[0]?.symbol || "";
  }

  function estimatedQty(row, price) {
    const value = Number(price || row.close || row.entry_price || 0);
    return value ? Math.max(1, Math.floor(100000 / value)) : 0;
  }

  function instrumentKey(row) { return row.instrument_key || row.instrumentKey || row.instrument_token || ""; }
  function sameSymbol(item, row) { return String(item?.symbol || "").toUpperCase() === String(row?.symbol || "").toUpperCase(); }
  function captureJson(response, callback) { response.clone().json().then((payload) => { if (payload && payload.ok !== false) callback(payload); }).catch(() => {}); }
  function firstFinite(...values) {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }
  function money(value) { return Number.isFinite(Number(value)) ? "Rs " + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "DATA_NEEDED"; }
  function number(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "0.00"; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
})();
