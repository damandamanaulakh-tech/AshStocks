(() => {
  const state = {
    scan: null,
    ledger: null,
    quotes: {},
    selectedSymbol: "",
    message: "Terminal waiting for scanner evidence",
    busy: false,
    booted: false
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      if (Array.isArray(payload.rows)) {
        state.scan = payload;
        state.selectedSymbol = chooseSymbol(payload.rows, state.selectedSymbol);
        state.message = `Scanner synced: ${payload.rows.length} rows`;
      }
      renderTerminal();
    });
    if (url.includes("/api/upstox/quote")) captureJson(response, (payload) => {
      mergeQuotePayload(payload);
      renderTerminal();
    });
    if (url.includes("/api/paper-trader/orders") || url.includes("/api/paper-trader/order")) captureJson(response, (payload) => {
      if (payload && payload.ok !== false) state.ledger = payload;
      renderTerminal();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => bootTerminal().catch(() => {}));
  window.addEventListener("ashstocks:upstox-quote", (event) => {
    const detail = event.detail || {};
    if (detail.instrument_key && detail.quoteState) state.quotes[detail.instrument_key] = detail.quoteState;
    if (detail.symbol) state.selectedSymbol = detail.symbol;
    renderTerminal();
  });
  window.addEventListener("ashstocks:broker-select-symbol", (event) => {
    if (event.detail?.symbol) {
      state.selectedSymbol = event.detail.symbol;
      renderTerminal();
      requestSelectedQuote().catch(() => {});
    }
  });

  document.addEventListener("click", (event) => {
    const run = event.target.closest("[data-terminal-run]");
    if (run) runScanner().catch(() => {});

    const rowButton = event.target.closest("button[data-terminal-symbol]");
    if (rowButton?.dataset?.terminalSymbol) {
      state.selectedSymbol = rowButton.dataset.terminalSymbol;
      window.dispatchEvent(new CustomEvent("ashstocks:broker-select-symbol", { detail: { symbol: state.selectedSymbol } }));
      renderTerminal();
      requestSelectedQuote().catch(() => {});
    }

    const action = event.target.closest("button[data-terminal-action]");
    if (action) submitTerminalOrder(action.dataset.terminalAction).catch(() => {});
  }, true);

  async function bootTerminal() {
    if (state.booted) return;
    state.booted = true;
    await waitForWorkspace();
    installTerminal();
    await refreshLedger();
    renderTerminal();
    setInterval(() => refreshLedger().catch(() => {}), 60000);
  }

  function waitForWorkspace() {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector("#upstoxWorkspaceView") || document.querySelector("#brokerMarketsView") || document.querySelector("#dataView")) return resolve();
        if (Date.now() - started > 12000) return resolve();
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  function installTerminal() {
    const workspace = document.querySelector("#upstoxWorkspaceView") || document.querySelector("#dataView")?.parentElement;
    if (!workspace || document.querySelector("#ashBrokerTerminal")) return;
    const anchor = workspace.querySelector(".uw-commandbar") || workspace.firstElementChild;
    const html = `
      <section class="ash-broker-terminal" id="ashBrokerTerminal">
        <div class="abt-topbar">
          <div><span class="eyebrow">Broker-Grade Paper Terminal</span><h3>AshStocks Terminal</h3></div>
          <div class="abt-actions"><span id="abtStatus">DATA_NEEDED</span><button type="button" data-terminal-run><i data-lucide="play" aria-hidden="true"></i><b>Run Engine</b></button></div>
        </div>
        <div class="abt-market-strip" id="abtMarketStrip"></div>
        <div class="abt-layout">
          <section class="abt-watch">
            <div class="abt-section-head"><strong>Market Watch</strong><span id="abtWatchCount">0</span></div>
            <div class="abt-watch-filters"><button type="button" data-terminal-filter="ALL">All</button><button type="button" data-terminal-filter="SELECT">Select</button><button type="button" data-terminal-filter="WATCH">Watch</button><button type="button" data-terminal-filter="CANDLE">Candle</button><button type="button" data-terminal-filter="DATA_NEEDED">Data Needed</button></div>
            <div class="abt-watch-table"><table><thead><tr><th>Symbol</th><th>Decision</th><th>LTP</th><th>Score</th></tr></thead><tbody id="abtWatchBody"></tbody></table></div>
          </section>
          <section class="abt-chart">
            <div class="abt-section-head"><strong id="abtSelectedTitle">Selected Stock</strong><span id="abtSelectedState">No stock</span></div>
            <div class="abt-price-line" id="abtPriceLine"></div>
            <div class="abt-chart-box" id="abtChartBox"></div>
            <div class="abt-proof-grid" id="abtProofGrid"></div>
          </section>
          <section class="abt-ticket">
            <div class="abt-section-head"><strong>Order Ticket</strong><span>Paper only</span></div>
            <div id="abtTicket"></div>
          </section>
        </div>
        <div class="abt-bottom-grid">
          <section><div class="abt-section-head"><strong>Parameter Proof</strong><span id="abtParameterState">0 hit</span></div><div class="abt-param-grid" id="abtParamGrid"></div></section>
          <section><div class="abt-section-head"><strong>Candle Trigger</strong><span id="abtCandleState">DATA_NEEDED</span></div><div id="abtCandleBox" class="abt-copy"></div></section>
          <section><div class="abt-section-head"><strong>Order Book</strong><span id="abtOrderState">0</span></div><div id="abtOrderBook" class="abt-ledger"></div></section>
          <section><div class="abt-section-head"><strong>Positions / GTT</strong><span id="abtPositionState">0</span></div><div id="abtPositions" class="abt-ledger"></div></section>
        </div>
      </section>
    `;
    if (anchor) anchor.insertAdjacentHTML("beforebegin", html);
    else workspace.insertAdjacentHTML("afterbegin", html);
    window.lucide?.createIcons();
  }

  async function runScanner() {
    if (state.busy) return;
    state.busy = true;
    state.message = "Running AshStocks scanner for terminal...";
    renderTerminal();
    try {
      const response = await fetch("/api/scanner/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "ashstocks-broker-terminal", limit: 200 }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `scanner failed ${response.status}`);
      state.scan = payload;
      state.selectedSymbol = chooseSymbol(payload.rows || [], state.selectedSymbol);
      state.message = `Terminal scanner complete: ${(payload.rows || []).length} rows`;
      await requestSelectedQuote();
    } catch (error) {
      state.message = error.message || String(error);
    } finally {
      state.busy = false;
      renderTerminal();
    }
  }

  async function refreshLedger() {
    try {
      const response = await fetch("/api/paper-trader/orders");
      if (response.status === 401) return;
      const payload = await response.json().catch(() => ({}));
      if (payload && payload.ok !== false) state.ledger = payload;
    } catch (_) {}
  }

  async function requestSelectedQuote() {
    const row = selectedRow();
    const key = instrumentKey(row);
    if (!key) return;
    try {
      const response = await fetch("/api/upstox/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instrument_keys: [key], source: "ashstocks-broker-terminal" }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `quote failed ${response.status}`);
      mergeQuotePayload(payload);
    } catch (error) {
      state.quotes[key] = { error: error.message || String(error) };
    }
  }

  function renderTerminal() {
    installTerminal();
    const host = document.querySelector("#ashBrokerTerminal");
    if (!host) return;
    const rows = scannerRows();
    const row = selectedRow();
    renderStatus(rows, row);
    renderMarketStrip(rows);
    renderWatch(rows);
    renderSelected(row);
    renderTicket(row);
    renderParameters(row);
    renderCandles(row);
    renderLedger(row);
  }

  function renderStatus(rows, row) {
    const node = document.querySelector("#abtStatus");
    if (!node) return;
    const quote = quoteFor(row).quote;
    const bits = [
      rows.length ? `${rows.length} NSE rows` : "DATA_NEEDED scanner",
      row.symbol ? row.symbol : "no selected stock",
      quote ? "Upstox quote ACTIVE" : "quote DATA_NEEDED",
      state.busy ? "working" : "paper only"
    ];
    node.textContent = bits.join(" | ");
  }

  function renderMarketStrip(rows) {
    const host = document.querySelector("#abtMarketStrip");
    if (!host) return;
    const selected = rows.filter((row) => row.decision === "SELECT").length;
    const watch = rows.filter((row) => row.decision === "WATCH").length;
    const data = rows.filter((row) => row.decision === "DATA_NEEDED" || row.fetch_error).length;
    const quoteReady = rows.filter((row) => quoteFor(row).quote).length;
    const orders = ledgerArray("orders").length;
    const gtt = ledgerArray("gtt").length;
    host.innerHTML = [
      ["Universe", rows.length], ["SELECT", selected], ["WATCH", watch], ["DATA_NEEDED", data], ["Quote Ready", quoteReady], ["Paper Orders", orders], ["GTT", gtt]
    ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  }

  function renderWatch(rows) {
    const body = document.querySelector("#abtWatchBody");
    const count = document.querySelector("#abtWatchCount");
    if (count) count.textContent = String(rows.length);
    if (!body) return;
    body.innerHTML = rows.length ? rows.slice(0, 60).map((row) => {
      const quote = quoteFor(row).quote;
      const ltp = firstFinite(quote?.last_price, quote?.close, row.close, null);
      const selected = row.symbol === state.selectedSymbol ? "selected" : "";
      return `<tr class="${selected}"><td><button type="button" data-terminal-symbol="${escapeAttr(row.symbol)}"><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.name || "")}</span></button></td><td><span class="abt-pill ${escapeAttr(row.decision || "DATA_NEEDED")}">${escapeHtml(row.decision || "DATA_NEEDED")}</span></td><td>${money(ltp)}</td><td>${number(row.score || row.paper_score)}</td></tr>`;
    }).join("") : `<tr><td colspan="4" class="empty-cell">Run Engine to load real NSE scanner rows.</td></tr>`;
  }

  function renderSelected(row) {
    const title = document.querySelector("#abtSelectedTitle");
    const stateNode = document.querySelector("#abtSelectedState");
    const priceLine = document.querySelector("#abtPriceLine");
    const chart = document.querySelector("#abtChartBox");
    const proof = document.querySelector("#abtProofGrid");
    if (title) title.textContent = row.symbol ? `${row.symbol} ${row.name || ""}` : "Selected Stock";
    if (stateNode) stateNode.textContent = row.decision || "DATA_NEEDED";
    const quoteState = quoteFor(row);
    const quote = quoteState.quote;
    const price = firstFinite(quote?.last_price, quote?.close, row.close, null);
    if (priceLine) priceLine.innerHTML = row.symbol ? `<strong>${money(price)}</strong><span>${escapeHtml(quote ? "Upstox Market Quote API" : quoteState.error || row.fetch_error || "quote DATA_NEEDED")}</span><b>${escapeHtml(row.sector || "Unmapped")}</b>` : `<strong>DATA_NEEDED</strong><span>No selected stock.</span>`;
    if (chart) chart.innerHTML = terminalChart(row);
    if (proof) proof.innerHTML = proofCards(row).map(([label, value, status]) => `<article class="${status}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  }

  function renderTicket(row) {
    const host = document.querySelector("#abtTicket");
    if (!host) return;
    if (!row.symbol) {
      host.innerHTML = `<div class="abt-copy"><strong>DATA_NEEDED</strong><span>No stock selected. Run scanner first.</span></div>`;
      return;
    }
    const quote = quoteFor(row).quote;
    const price = firstFinite(quote?.last_price, quote?.close, row.close, row.entry_price, 0);
    const qty = estimatedQty(row, price);
    host.innerHTML = `
      <div class="abt-form-grid">
        <label><span>Symbol</span><input id="abtSymbol" readonly value="${escapeAttr(row.symbol)}" /></label>
        <label><span>Side</span><select id="abtSide"><option>BUY</option><option>SELL</option></select></label>
        <label><span>Product</span><select id="abtProduct"><option>Paper Intraday</option><option selected>Paper Swing</option><option>Paper Positional</option><option>Paper Portfolio</option></select></label>
        <label><span>Order Type</span><select id="abtOrderType"><option selected>MARKET</option><option>LIMIT</option><option>SL</option><option>GTT</option></select></label>
        <label><span>Validity</span><select id="abtValidity"><option selected>DAY</option><option>IOC</option><option>GTT</option></select></label>
        <label><span>Qty</span><input id="abtQty" value="${escapeAttr(qty)}" /></label>
        <label><span>Price</span><input id="abtPrice" value="${escapeAttr(numberValue(price))}" /></label>
        <label><span>Trigger</span><input id="abtTrigger" value="${escapeAttr(numberValue(price ? price * 1.002 : 0))}" /></label>
        <label><span>Target</span><input id="abtTarget" value="${escapeAttr(numberValue(targetPrice(row)))}" /></label>
        <label><span>Stop</span><input id="abtStop" value="${escapeAttr(numberValue(stopPrice(row)))}" /></label>
        <label><span>Risk %</span><input id="abtRisk" value="0.75" /></label>
        <label><span>Capital</span><input id="abtCapital" value="100000" /></label>
      </div>
      <div class="abt-ticket-actions">
        <button type="button" data-terminal-action="BUY">Paper BUY</button>
        <button type="button" data-terminal-action="SELL">Paper SELL</button>
        <button type="button" data-terminal-action="GTT">Paper GTT</button>
      </div>
      <small>${escapeHtml(state.message)}. Live broker write remains locked.</small>
    `;
  }

  function renderParameters(row) {
    const host = document.querySelector("#abtParamGrid");
    const stateNode = document.querySelector("#abtParameterState");
    if (!host) return;
    const params = parameterProof(row);
    const hits = params.filter((item) => item.status === "hit").length;
    if (stateNode) stateNode.textContent = `${hits} / ${params.length} hit`;
    host.innerHTML = params.map((item) => `<button type="button" class="${item.status}" title="${escapeAttr(item.evidence)}"><strong>${item.id}</strong><span>${escapeHtml(item.name)}</span><small>${escapeHtml(item.evidence)}</small></button>`).join("");
  }

  function renderCandles(row) {
    const stateNode = document.querySelector("#abtCandleState");
    const host = document.querySelector("#abtCandleBox");
    if (!host) return;
    const candle = candleProof(row);
    if (stateNode) stateNode.textContent = candle.status;
    host.innerHTML = `<strong>${escapeHtml(candle.title)}</strong><p>${escapeHtml(candle.evidence)}</p><span>${escapeHtml(candle.impact)}</span>`;
  }

  function renderLedger(row) {
    const orders = ledgerArray("orders");
    const trades = ledgerArray("trades");
    const positions = ledgerArray("positions");
    const gtt = ledgerArray("gtt");
    const orderState = document.querySelector("#abtOrderState");
    const positionState = document.querySelector("#abtPositionState");
    if (orderState) orderState.textContent = `${orders.length} orders / ${trades.length} trades`;
    if (positionState) positionState.textContent = `${positions.length} positions / ${gtt.length} GTT`;
    const orderHost = document.querySelector("#abtOrderBook");
    if (orderHost) orderHost.innerHTML = orders.length ? orders.slice(0, 6).map((order) => `<article><strong>${escapeHtml(order.symbol)} ${escapeHtml(order.side || "")}</strong><span>${escapeHtml(order.status || "PAPER")}</span><b>${money(order.price)} x ${escapeHtml(order.qty || 0)}</b></article>`).join("") : `<article><strong>No paper orders</strong><span>Create Paper BUY/GTT from the terminal.</span></article>`;
    const positionHost = document.querySelector("#abtPositions");
    if (positionHost) {
      const list = [...positions.map((p) => ({ ...p, type: "POSITION" })), ...gtt.map((g) => ({ ...g, type: "GTT" }))];
      positionHost.innerHTML = list.length ? list.slice(0, 6).map((item) => `<article><strong>${escapeHtml(item.symbol)} ${escapeHtml(item.type)}</strong><span>${money(item.current_price || item.entry_price)} | T ${money(item.target_price)} | S ${money(item.stop_price)}</span><b>${escapeHtml(item.status || item.action || "OPEN")}</b></article>`).join("") : `<article><strong>No position or GTT</strong><span>Paper ledger has no open risk item.</span></article>`;
    }
  }

  async function submitTerminalOrder(action) {
    const row = selectedRow();
    if (state.busy || !row.symbol) return;
    state.busy = true;
    state.message = `Sending ${action} paper order for ${row.symbol}...`;
    renderTerminal();
    try {
      const quote = quoteFor(row).quote;
      const price = valueFrom("#abtPrice", firstFinite(quote?.last_price, quote?.close, row.close, 0));
      const payload = {
        symbol: row.symbol,
        name: row.name || row.symbol,
        sector: row.sector || "Unmapped",
        instrument_key: instrumentKey(row) || null,
        side: action === "SELL" ? "SELL" : "BUY",
        product: textFrom("#abtProduct", "Paper Swing"),
        order_type: action === "GTT" ? "GTT" : textFrom("#abtOrderType", "MARKET"),
        validity: action === "GTT" ? "GTT" : textFrom("#abtValidity", "DAY"),
        qty: valueFrom("#abtQty", estimatedQty(row, price)),
        price,
        trigger_price: valueFrom("#abtTrigger", null),
        target_price: valueFrom("#abtTarget", targetPrice(row)),
        stop_price: valueFrom("#abtStop", stopPrice(row)),
        risk_pct: valueFrom("#abtRisk", 0.75),
        capital: valueFrom("#abtCapital", 100000),
        thesis: row.reason || row.paper_reason || candleProof(row).evidence || "AshStocks terminal paper order",
        candle_status: row.candle_status || candleProof(row).status,
        candle_patterns: row.candle_patterns || [],
        quote_source: quote ? "Upstox Market Quote API" : "scanner-fallback",
        source: "ashstocks-broker-terminal",
        broker_write_enabled: false,
        paper_only: true,
        gtt: action === "GTT"
      };
      const response = await fetch("/api/paper-trader/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) throw new Error(result.error || result.order?.rejection_reason || `paper order failed ${response.status}`);
      state.message = `${row.symbol} ${result.action || action} ${result.order?.id || result.gtt?.id || "paper done"}`;
      await refreshLedger();
    } catch (error) {
      state.message = error.message || String(error);
    } finally {
      state.busy = false;
      renderTerminal();
    }
  }

  function scannerRows() {
    const rows = Array.isArray(state.scan?.rows) ? state.scan.rows.slice() : [];
    return rows.sort((a, b) => rank(b) - rank(a) || Number(b.score || b.paper_score || 0) - Number(a.score || a.paper_score || 0));
  }

  function selectedRow() {
    const rows = scannerRows();
    return rows.find((row) => row.symbol === state.selectedSymbol) || rows.find((row) => row.decision === "SELECT") || rows.find((row) => row.decision === "WATCH") || rows[0] || {};
  }

  function chooseSymbol(rows, current) {
    if (current && rows.some((row) => row.symbol === current)) return current;
    return rows.find((row) => row.decision === "SELECT")?.symbol || rows.find((row) => row.decision === "WATCH")?.symbol || rows[0]?.symbol || "";
  }

  function proofCards(row) {
    const quote = quoteFor(row).quote;
    const candle = candleProof(row);
    return [
      ["Decision", row.decision || "DATA_NEEDED", row.decision === "SELECT" ? "hit" : row.decision === "WATCH" ? "warn" : "need"],
      ["Score", number(row.score || row.paper_score), Number(row.score || row.paper_score || 0) >= 70 ? "hit" : "warn"],
      ["Quote", quote ? "ACTIVE" : "DATA_NEEDED", quote ? "hit" : "need"],
      ["Candle", candle.status, candle.status === "HIT" || candle.status === "PASS" ? "hit" : candle.status === "WEAK" ? "warn" : "need"],
      ["Liquidity", `${number(row.rupee_turnover_cr)} cr`, Number(row.rupee_turnover_cr || 0) > 0 ? "hit" : "need"],
      ["Target", targetText(row), targetPrice(row) ? "hit" : "need"]
    ];
  }

  function parameterProof(row) {
    const candle = candleProof(row);
    const quote = quoteFor(row).quote;
    return [
      { id: "P261", name: "Price momentum", status: Number(row.return_6m_pct || 0) >= 8 ? "hit" : "need", evidence: `6M return ${number(row.return_6m_pct)}%` },
      { id: "P287", name: "12M trend", status: Number(row.return_12m_pct || 0) >= 12 ? "hit" : "need", evidence: `12M return ${number(row.return_12m_pct)}%` },
      { id: "P401", name: "Relative strength", status: Number(row.momentum_score || row.score || 0) >= 60 ? "hit" : "need", evidence: `Momentum score ${number(row.momentum_score || row.score)}` },
      { id: "P681", name: "Bullish engulfing", status: hasPattern(row, "bullish_engulfing") ? "hit" : "need", evidence: candle.evidence },
      { id: "P683", name: "Hammer rejection", status: hasPattern(row, "hammer_rejection") ? "hit" : "need", evidence: candle.evidence },
      { id: "P686", name: "Near 252D breakout", status: hasPattern(row, "near_252d_breakout") ? "hit" : "need", evidence: candle.evidence },
      { id: "P688", name: "Volume confirmation", status: hasPattern(row, "volume_confirmation") ? "hit" : "need", evidence: candle.evidence },
      { id: "P801", name: "Liquidity turnover", status: Number(row.rupee_turnover_cr || 0) > 0 ? "hit" : "need", evidence: `Turnover ${number(row.rupee_turnover_cr)} cr` },
      { id: "P1041", name: "FII/DII flow", status: Number(row.flow_score || 0) > 0 ? "hit" : "need", evidence: `Flow score ${number(row.flow_score)}` },
      { id: "P1521", name: "Entry zone", status: firstFinite(row.close, row.entry_price, null) ? "hit" : "need", evidence: `Entry ${money(firstFinite(row.close, row.entry_price, null))}` },
      { id: "P1531", name: "Target room", status: targetPrice(row) ? "hit" : "need", evidence: targetText(row) },
      { id: "P1701", name: "Upstox quote proof", status: quote ? "hit" : "need", evidence: quote ? `LTP ${money(quote.last_price || quote.close)}` : quoteFor(row).error || "quote DATA_NEEDED" }
    ];
  }

  function candleProof(row) {
    if (!row.symbol) return { status: "DATA_NEEDED", title: "No selected stock", evidence: "Run scanner and select a stock.", impact: "Candle parameters wait for real row evidence." };
    const patterns = Array.isArray(row.candle_patterns) ? row.candle_patterns : [];
    if (patterns.length || row.candle_status) {
      return { status: row.candle_status || "HIT", title: patterns.join(", ") || row.candle_status, evidence: row.candle_reason || row.reason || "Server candle engine returned status.", impact: "Used by candle parameters 681-800 and paper thesis." };
    }
    const candles = normalizeCandles(row.candles || []);
    if (!candles.length) return { status: "DATA_NEEDED", title: "No candle evidence", evidence: row.fetch_error || "Need Upstox OHLC candles in scanner row.", impact: "No candle hit can be claimed." };
    const last = candles.at(-1);
    const prev = candles.at(-2) || last;
    const range = Math.max(0.0001, last.high - last.low);
    const body = Math.abs(last.close - last.open);
    const bullish = last.close > last.open;
    const lower = Math.min(last.open, last.close) - last.low;
    const upper = last.high - Math.max(last.open, last.close);
    const hits = [];
    if (bullish && last.open <= prev.close && last.close >= prev.open) hits.push("bullish_engulfing");
    if (bullish && lower / range > 0.45 && upper / range < 0.25) hits.push("hammer_rejection");
    if (Number(row.high_252 || 0) && last.close >= Number(row.high_252) * 0.97) hits.push("near_252d_breakout");
    if (Number(last.volume || 0) > Number(row.vol126 || row.vol63 || 0)) hits.push("volume_confirmation");
    return { status: hits.length ? "HIT" : body / range > 0.55 ? "WEAK" : "DATA_NEEDED", title: hits.length ? hits.join(", ") : "No proven candle hit", evidence: `${row.symbol}: O ${number(last.open)} H ${number(last.high)} L ${number(last.low)} C ${number(last.close)}`, impact: hits.length ? "Candle parameter is active for paper thesis." : "Keep watch-only until pattern threshold hits." };
  }

  function terminalChart(row) {
    const candles = normalizeCandles(row.candles || []);
    if (!row.symbol) return `<div class="abt-empty-chart"><strong>DATA_NEEDED</strong><span>No scanner row selected.</span></div>`;
    if (!candles.length) return `<div class="abt-empty-chart"><strong>DATA_NEEDED: candle chart</strong><span>${escapeHtml(row.fetch_error || "Upstox OHLC candles not attached yet.")}</span></div>`;
    const sample = candles.slice(-50);
    const highs = sample.map((c) => c.high);
    const lows = sample.map((c) => c.low);
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const width = 620;
    const height = 250;
    const step = width / Math.max(sample.length, 1);
    const y = (value) => height - ((value - min) / Math.max(max - min, 0.0001)) * (height - 24) - 12;
    const bars = sample.map((c, i) => {
      const x = i * step + step / 2;
      const color = c.close >= c.open ? "#11966e" : "#c2413c";
      const bodyTop = Math.min(y(c.open), y(c.close));
      const bodyHeight = Math.max(2, Math.abs(y(c.open) - y(c.close)));
      return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y(c.high).toFixed(1)}" y2="${y(c.low).toFixed(1)}" stroke="${color}" stroke-width="1.4"/><rect x="${(x - Math.max(2, step * 0.28)).toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${Math.max(3, step * 0.56).toFixed(1)}" height="${bodyHeight.toFixed(1)}" rx="1" fill="${color}"/>`;
    }).join("");
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(row.symbol)} candle chart"><rect width="${width}" height="${height}" fill="#f8fafc"/>${bars}<text x="12" y="22" fill="#516173" font-size="12">${escapeHtml(row.symbol)} daily candles</text><text x="12" y="238" fill="#516173" font-size="12">${money(sample.at(-1)?.close)}</text></svg>`;
  }

  function mergeQuotePayload(payload) {
    if (!payload || payload.ok === false) return;
    const rows = Array.isArray(payload.quotes) ? payload.quotes : Object.values(payload.data || {});
    for (const quote of rows) {
      const key = quote.instrument_key || quote.instrumentKey || quote.key;
      if (key) state.quotes[key] = { quote };
    }
  }

  function quoteFor(row) {
    const key = instrumentKey(row);
    return state.quotes[key] || window.__ashstocksUpstoxQuoteCache?.[key] || {};
  }

  function ledgerArray(name) {
    const ledger = state.ledger || {};
    return [ledger[name], ledger.paperTrader?.[name], ledger.status?.[name]].find(Array.isArray) || [];
  }

  function rank(row) { return row.decision === "SELECT" ? 4 : row.decision === "WATCH" ? 3 : row.decision === "BLOCKED" ? 2 : row.decision === "DATA_NEEDED" ? 1 : 0; }
  function instrumentKey(row) { return row.instrument_key || row.instrumentKey || row.instrument_token || ""; }
  function targetPrice(row) { return firstFinite(row.target_price, row.target2, row.advisor?.target2, row.advisor?.target1, null); }
  function stopPrice(row) { return firstFinite(row.stop_price, row.advisor?.stop, row.paper_order?.stop_price, null); }
  function targetText(row) { return targetPrice(row) ? money(targetPrice(row)) : row.target_potential?.label ? `${row.target_potential.label} ${number(row.target_potential.potential_left_pct)}%` : "DATA_NEEDED"; }
  function estimatedQty(row, price) { const p = Number(price || row.close || row.entry_price || 0); return p ? Math.max(1, Math.floor(100000 / p)) : 0; }
  function hasPattern(row, pattern) { return (row.candle_patterns || []).includes(pattern) || row.candle_engine?.patterns?.includes(pattern); }
  function normalizeCandles(candles) {
    return candles.map((c) => Array.isArray(c) ? { date: c[0], open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5]) } : { date: c.date, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close), volume: Number(c.volume) }).filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite));
  }
  function entryZone(row) { const close = firstFinite(row.close, row.entry_price, null); return close ? money(close) : "DATA_NEEDED"; }
  function marketQuoteValue(row) { return firstFinite(quoteFor(row).quote?.last_price, quoteFor(row).quote?.close, row.close, null); }
  function valueFrom(selector, fallback) { const n = Number(String(document.querySelector(selector)?.value || "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) && n !== 0 ? n : fallback; }
  function textFrom(selector, fallback) { return document.querySelector(selector)?.value || fallback; }
  function firstFinite(...values) { for (const value of values) { const n = Number(value); if (Number.isFinite(n)) return n; } return null; }
  function numberValue(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : ""; }
  function money(value) { return Number.isFinite(Number(value)) ? "Rs " + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "DATA_NEEDED"; }
  function number(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "0.00"; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
  function captureJson(response, callback) { response.clone().json().then((payload) => callback(payload)).catch(() => {}); }
})();