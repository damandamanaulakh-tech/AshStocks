(() => {
  const state = {
    scan: null,
    ledger: null,
    quoteCache: {},
    selectedSymbol: "",
    busy: false,
    message: "Waiting for scanner run",
    booted: false
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      state.scan = payload;
      state.selectedSymbol = pickSelectedSymbol(payload.rows || [], state.selectedSymbol);
      state.message = `Scanner synced: ${(payload.rows || []).length} rows`;
      renderBrokerScannerHub();
    });
    if (url.includes("/api/paper-trader/orders")) captureJson(response, (payload) => {
      state.ledger = payload;
      renderBrokerScannerHub();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => bootBrokerScannerHub().catch(() => {}));
  window.addEventListener("ashstocks:upstox-quote", (event) => {
    const detail = event.detail || {};
    if (detail.instrument_key && detail.quoteState) state.quoteCache[detail.instrument_key] = detail.quoteState;
    if (detail.symbol) state.selectedSymbol = detail.symbol;
    renderBrokerScannerHub();
  });

  document.addEventListener("click", (event) => {
    const run = event.target.closest("[data-broker-run-scanner]");
    if (run) runScannerFromBroker().catch(() => {});

    const symbolButton = event.target.closest("button[data-broker-symbol]");
    if (symbolButton?.dataset?.brokerSymbol) {
      selectBrokerSymbol(symbolButton.dataset.brokerSymbol);
    }

    const action = event.target.closest("button[data-broker-hub-action]");
    if (action) {
      const symbol = action.dataset.symbol || state.selectedSymbol;
      const row = scannerRows().find((item) => item.symbol === symbol) || selectedRow();
      selectBrokerSymbol(symbol);
      submitBrokerHubAction(row, action.dataset.brokerHubAction).catch(() => {});
    }
  }, true);

  async function bootBrokerScannerHub() {
    if (state.booted) return;
    state.booted = true;
    await waitForBrokerShell();
    installBrokerScannerHub();
    await refreshLedger();
    renderBrokerScannerHub();
    setInterval(() => refreshLedger().catch(() => {}), 60000);
  }

  function waitForBrokerShell() {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector("#brokerMarketsView") || document.querySelector("#upstoxWorkspaceView")) return resolve();
        if (Date.now() - started > 12000) return resolve();
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  function installBrokerScannerHub() {
    installMarketSnapshot();
    installWatchlistHub();
    installSignalHub();
    installOrderHub();
  }

  function installMarketSnapshot() {
    const view = document.querySelector("#brokerMarketsView");
    if (!view || document.querySelector("#brokerScannerSnapshot")) return;
    const anchor = view.querySelector(".broker-page-head") || view.firstElementChild;
    const html = `
      <section class="panel broker-scanner-hub" id="brokerScannerSnapshot">
        <div class="panel-header">
          <div><span class="eyebrow">AshStocks Brain In Broker Shell</span><h3>Scanner, Quote, Paper Ledger</h3></div>
          <button class="secondary-button" type="button" data-broker-run-scanner><i data-lucide="play" aria-hidden="true"></i><span>Run Scanner</span></button>
        </div>
        <div class="broker-hub-summary" id="brokerHubSummary"></div>
        <div class="broker-hub-selected" id="brokerHubSelected"></div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    else view.insertAdjacentHTML("afterbegin", html);
    window.lucide?.createIcons();
  }

  function installWatchlistHub() {
    const view = document.querySelector("#brokerWatchlistView");
    if (!view || document.querySelector("#brokerHubWatchlists")) return;
    const anchor = view.querySelector(".broker-page-head") || view.firstElementChild;
    const html = `<section class="panel broker-scanner-hub"><div class="panel-header"><h3>Live Scanner Buckets</h3><span id="brokerHubBucketState">DATA_NEEDED</span></div><div class="broker-grid three" id="brokerHubWatchlists"></div></section>`;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    else view.insertAdjacentHTML("afterbegin", html);
  }

  function installSignalHub() {
    const view = document.querySelector("#brokerSignalsView");
    if (!view || document.querySelector("#brokerHubSignalPanel")) return;
    const anchor = view.querySelector(".broker-page-head") || view.firstElementChild;
    const html = `
      <section class="panel broker-scanner-hub" id="brokerHubSignalPanel">
        <div class="panel-header"><h3>Scanner Signals With Parameter Proof</h3><span id="brokerHubSignalState">0 rows</span></div>
        <div class="broker-table-wrap"><table><thead><tr><th>Stock</th><th>Decision</th><th>Score</th><th>Parameter Proof</th><th>Quote</th><th>Action</th></tr></thead><tbody id="brokerHubSignalBody"></tbody></table></div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    else view.insertAdjacentHTML("afterbegin", html);
  }

  function installOrderHub() {
    const view = document.querySelector("#brokerOrdersView");
    if (!view || document.querySelector("#brokerScannerOrderPanel")) return;
    const anchor = view.querySelector("#brokerOrderTicket") || view.querySelector(".broker-order-tabs") || view.firstElementChild;
    const html = `
      <section class="panel broker-scanner-hub" id="brokerScannerOrderPanel">
        <div class="panel-header"><h3>Scanner To Paper Order</h3><span id="brokerHubOrderState">Paper only</span></div>
        <div id="brokerHubOrderBox" class="broker-hub-order-box"></div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("beforebegin", html);
    else view.insertAdjacentHTML("afterbegin", html);
  }

  async function refreshLedger() {
    try {
      const response = await fetch("/api/paper-trader/orders");
      if (response.status === 401) return;
      const payload = await response.json();
      if (payload && payload.ok !== false) state.ledger = payload;
    } catch (_) {}
  }

  async function runScannerFromBroker() {
    if (state.busy) return;
    state.busy = true;
    state.message = "Running scanner from broker shell...";
    renderBrokerScannerHub();
    try {
      const response = await fetch("/api/scanner/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "broker-scanner-hub", limit: 200 }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `scanner failed ${response.status}`);
      state.scan = payload;
      state.selectedSymbol = pickSelectedSymbol(payload.rows || [], state.selectedSymbol);
      state.message = `Scanner complete: ${(payload.rows || []).length} rows`;
    } catch (error) {
      state.message = error.message || String(error);
    } finally {
      state.busy = false;
      renderBrokerScannerHub();
    }
  }

  function renderBrokerScannerHub() {
    installBrokerScannerHub();
    const rows = scannerRows();
    const selected = selectedRow();
    renderSummary(rows, selected);
    renderBuckets(rows);
    renderSignals(rows);
    renderOrderBox(selected);
  }

  function renderSummary(rows, selected) {
    const host = document.querySelector("#brokerHubSummary");
    const selectedHost = document.querySelector("#brokerHubSelected");
    if (host) {
      const dataNeeded = rows.filter((row) => row.decision === "DATA_NEEDED").length;
      const actionable = rows.filter((row) => ["SELECT", "WATCH"].includes(row.decision)).length;
      const quoteReady = rows.filter((row) => Boolean(quoteStateFor(row).quote)).length;
      const orders = state.ledger?.orders?.length || 0;
      const positions = state.ledger?.positions?.length || 0;
      host.innerHTML = [
        ["Universe", rows.length || "DATA_NEEDED"],
        ["Actionable", actionable],
        ["Data Needed", dataNeeded],
        ["Quote Ready", quoteReady],
        ["Paper Orders", orders],
        ["Positions", positions]
      ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
    }
    if (selectedHost) {
      selectedHost.innerHTML = selected.symbol ? renderSelectedProof(selected) : `<div class="broker-hub-empty"><strong>No scanner row selected</strong><span>${escapeHtml(state.message)}. Click Run Scanner or run the Upstox scan from Dashboard.</span></div>`;
    }
  }

  function renderBuckets(rows) {
    const host = document.querySelector("#brokerHubWatchlists");
    const stateNode = document.querySelector("#brokerHubBucketState");
    if (!host) return;
    if (stateNode) stateNode.textContent = rows.length ? `${rows.length} scanner rows` : "DATA_NEEDED";
    if (!rows.length) {
      host.innerHTML = `<section class="broker-hub-empty"><strong>No real scanner buckets</strong><span>No fake watchlist is shown. Run Scanner to build buckets from real rows.</span></section>`;
      return;
    }
    const buckets = [
      ["SELECT", rows.filter((row) => row.decision === "SELECT")],
      ["WATCH", rows.filter((row) => row.decision === "WATCH")],
      ["Candle Ready", rows.filter((row) => candleReady(row))],
      ["Target Room", rows.filter((row) => targetPotential(row) >= 8)],
      ["Quote Ready", rows.filter((row) => quoteStateFor(row).quote)],
      ["DATA_NEEDED", rows.filter((row) => row.decision === "DATA_NEEDED" || row.fetch_error)]
    ];
    host.innerHTML = buckets.map(([name, bucketRows]) => renderBucket(name, bucketRows)).join("");
  }

  function renderSignals(rows) {
    const body = document.querySelector("#brokerHubSignalBody");
    const stateNode = document.querySelector("#brokerHubSignalState");
    if (stateNode) stateNode.textContent = rows.length ? `${rows.length} rows` : "DATA_NEEDED";
    if (!body) return;
    body.innerHTML = rows.length ? rows.slice(0, 50).map((row) => {
      const quote = quoteStateFor(row).quote;
      return `<tr>
        <td><button type="button" data-broker-symbol="${escapeAttr(row.symbol)}" data-select-symbol="${escapeAttr(row.symbol)}"><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.name || "")}</span></button></td>
        <td><span class="decision ${escapeAttr(row.decision || "DATA_NEEDED")}">${escapeHtml(row.decision || "DATA_NEEDED")}</span></td>
        <td>${number(row.score || row.paper_score)}</td>
        <td>${renderParamProof(row)}</td>
        <td><strong>${escapeHtml(quote ? money(quote.last_price || quote.close) : "DATA_NEEDED")}</strong><span>${escapeHtml(quoteStatus(row))}</span></td>
        <td><div class="broker-hub-actions"><button type="button" data-broker-hub-action="BUY" data-symbol="${escapeAttr(row.symbol)}">BUY</button><button type="button" data-broker-hub-action="GTT" data-symbol="${escapeAttr(row.symbol)}">GTT</button></div></td>
      </tr>`;
    }).join("") : `<tr><td colspan="6" class="empty-cell">No scanner payload captured yet. Run Scanner to populate broker signals.</td></tr>`;
  }

  function renderOrderBox(row) {
    const host = document.querySelector("#brokerHubOrderBox");
    const status = document.querySelector("#brokerHubOrderState");
    if (!host) return;
    if (status) status.textContent = state.busy ? "Working" : (state.message || "Paper only");
    if (!row.symbol) {
      host.innerHTML = `<div class="broker-hub-empty"><strong>No stock selected</strong><span>Run scanner and pick a stock. This panel never sends live broker orders.</span></div>`;
      return;
    }
    const quote = quoteStateFor(row).quote || {};
    const price = firstFinite(quote.last_price, quote.close, row.close, row.entry_price, 0);
    host.innerHTML = `
      <div class="broker-hub-order-grid">
        <label><span>Symbol</span><input readonly value="${escapeAttr(row.symbol)}" /></label>
        <label><span>Decision</span><input readonly value="${escapeAttr(row.decision || "DATA_NEEDED")}" /></label>
        <label><span>Score</span><input readonly value="${escapeAttr(number(row.score || row.paper_score))}" /></label>
        <label><span>Quote</span><input readonly value="${escapeAttr(price ? money(price) : "DATA_NEEDED")}" /></label>
        <label><span>Target</span><input readonly value="${escapeAttr(targetText(row))}" /></label>
        <label><span>Stop</span><input readonly value="${escapeAttr(money(row.stop_price || row.advisor?.stop))}" /></label>
      </div>
      <div class="broker-hub-selected-line">${renderParamProof(row)}</div>
      <div class="broker-hub-actions"><button type="button" data-broker-hub-action="BUY" data-symbol="${escapeAttr(row.symbol)}">Paper BUY</button><button type="button" data-broker-hub-action="GTT" data-symbol="${escapeAttr(row.symbol)}">Paper GTT</button><button type="button" data-broker-hub-action="SELL" data-symbol="${escapeAttr(row.symbol)}">Paper SELL</button></div>
    `;
  }

  function renderSelectedProof(row) {
    return `
      <article><span>Selected</span><strong>${escapeHtml(row.symbol)}</strong><b>${escapeHtml(row.name || row.sector || "")}</b></article>
      <article><span>Decision</span><strong>${escapeHtml(row.decision || "DATA_NEEDED")}</strong><b>${escapeHtml(row.reason || row.paper_reason || row.fetch_error || "No reason text")}</b></article>
      <article><span>Parameters</span>${renderParamProof(row)}</article>
      <article><span>Paper</span><strong>${escapeHtml(paperState(row))}</strong><b>Live orders locked</b></article>
    `;
  }

  function renderBucket(name, rows) {
    return `<section class="broker-watch-card broker-hub-bucket"><div class="panel-header"><h3>${escapeHtml(name)}</h3><span>${rows.length}</span></div>${rows.slice(0, 8).map((row) => `<button type="button" data-broker-symbol="${escapeAttr(row.symbol)}" data-select-symbol="${escapeAttr(row.symbol)}"><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.decision || "DATA_NEEDED")}</span><b>${number(row.score || row.paper_score)}</b></button>`).join("") || `<div class="broker-empty">No rows hit this bucket.</div>`}</section>`;
  }

  function renderParamProof(row) {
    const checks = [
      ["Momentum", Number(row.score || row.paper_score || 0) >= 60 || Number(row.return_6m_pct || 0) >= 8],
      ["Candle", candleReady(row)],
      ["Liquidity", Number(row.rupee_turnover_cr || 0) > 0 || Number(row.adv20 || 0) > 0],
      ["Target", targetPotential(row) >= 8 || row.target_price || row.target2],
      ["Risk", Number(row.regime_risk || 0) < 50 || row.regime_risk == null],
      ["Quote", Boolean(quoteStateFor(row).quote)]
    ];
    return `<div class="broker-hub-param-proof">${checks.map(([label, ok]) => `<span class="${ok ? "hit" : "need"}">${escapeHtml(label)}</span>`).join("")}</div>`;
  }

  async function submitBrokerHubAction(row, action) {
    if (state.busy || !row.symbol) return;
    state.busy = true;
    state.message = `Sending ${row.symbol} ${action} paper order...`;
    renderBrokerScannerHub();
    try {
      const quote = quoteStateFor(row).quote || {};
      const price = firstFinite(quote.last_price, quote.close, row.close, row.entry_price, 0);
      const payload = {
        symbol: row.symbol,
        name: row.name || row.symbol,
        sector: row.sector || "Unmapped",
        instrument_key: instrumentKey(row) || null,
        side: action === "SELL" ? "SELL" : "BUY",
        product: "Paper Swing",
        order_type: action === "GTT" ? "GTT" : "MARKET",
        validity: action === "GTT" ? "GTT" : "DAY",
        qty: estimatedQty(row, price),
        price,
        target_price: firstFinite(row.target_price, row.target2, row.advisor?.target2, row.advisor?.target1, null),
        stop_price: firstFinite(row.stop_price, row.advisor?.stop, null),
        risk_pct: 0.75,
        capital: 100000,
        thesis: row.reason || row.paper_reason || "AshStocks broker scanner hub paper order",
        source: "broker-scanner-hub",
        quote_source: quote.last_price || quote.close ? "Upstox Market Quote API" : "scanner-fallback",
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
      renderBrokerScannerHub();
    }
  }

  function selectBrokerSymbol(symbol) {
    state.selectedSymbol = symbol;
    window.dispatchEvent(new CustomEvent("ashstocks:broker-select-symbol", { detail: { symbol } }));
    renderBrokerScannerHub();
  }

  function scannerRows() {
    const rows = (state.scan?.rows || []).slice();
    return rows.sort((a, b) => {
      const rank = (row) => row.decision === "SELECT" ? 3 : row.decision === "WATCH" ? 2 : row.decision === "BLOCKED" ? 1 : 0;
      return rank(b) - rank(a) || Number(b.score || b.paper_score || 0) - Number(a.score || a.paper_score || 0);
    });
  }

  function selectedRow() {
    const rows = scannerRows();
    return rows.find((row) => row.symbol === state.selectedSymbol) || rows.find((row) => row.decision === "SELECT") || rows.find((row) => row.decision === "WATCH") || rows[0] || {};
  }

  function pickSelectedSymbol(rows, current) {
    if (current && rows.some((row) => row.symbol === current)) return current;
    return rows.find((row) => row.decision === "SELECT")?.symbol || rows.find((row) => row.decision === "WATCH")?.symbol || rows[0]?.symbol || "";
  }

  function quoteStateFor(row) { return state.quoteCache[instrumentKey(row)] || window.__ashstocksUpstoxQuoteCache?.[instrumentKey(row)] || {}; }
  function quoteStatus(row) {
    const quoteState = quoteStateFor(row);
    if (!instrumentKey(row)) return "instrument key missing";
    if (quoteState.loading) return "quote loading";
    if (quoteState.quote?.depth_available) return "quote + depth";
    if (quoteState.quote) return "quote ok";
    if (quoteState.error) return `quote failed: ${quoteState.error}`;
    return "quote DATA_NEEDED";
  }

  function paperState(row) {
    const orders = (state.ledger?.orders || []).filter((order) => sameSymbol(order, row));
    const position = (state.ledger?.positions || []).find((item) => sameSymbol(item, row));
    if (position) return "POSITION_OPEN";
    if (orders.length) return orders[0].status || "ORDER_CREATED";
    return row.paper_order?.status || "NOT_CREATED";
  }

  function candleReady(row) { return row.candle_status === "HIT" || row.candle_status === "PASS" || row.candle_engine?.status === "HIT" || row.candle_engine?.status === "PASS" || Boolean(row.candles?.length); }
  function targetPotential(row) { return Number(row.target_potential?.potential_left_pct ?? row.target_pct ?? 0); }
  function targetText(row) {
    const target = row.target_potential || {};
    if (target.label) return `${target.label} ${number(target.potential_left_pct)}%`;
    const targetPrice = firstFinite(row.target_price, row.target2, row.advisor?.target2, row.advisor?.target1, null);
    return targetPrice ? money(targetPrice) : "DATA_NEEDED";
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
