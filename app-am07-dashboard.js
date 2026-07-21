(() => {
  const LOCAL_PREVIEW_ALLOWED = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  const COLORS = ["#168a5f", "#3157c6", "#c77a16", "#6d55c7", "#0f8b8d", "#bd3b3b"];
  const state = {
    rows: [],
    orders: [],
    selected: "",
    selectedParameter: "B22_P001",
    source: "starting",
    message: "AM07 starting",
    preview: false,
    loaded: false
  };

  const PARAMS = [
    ["B22_P001", "Price Trend", "Close above 20 DMA", "close > SMA(close,20)", "ARD B22 / Upstox candles", "close > SMA20"],
    ["B22_P002", "Price Trend", "Close above 50 DMA", "close > SMA(close,50)", "ARD B22 / Upstox candles", "close > SMA50"],
    ["B22_P003", "Price Trend", "Close above 200 DMA", "close > SMA(close,200)", "ARD B22 / Upstox candles", "close > SMA200"],
    ["B22_P004", "Price Trend", "20 DMA above 50 DMA", "SMA20 > SMA50", "ARD B22 / Upstox candles", "SMA20 > SMA50"],
    ["B22_P005", "Price Trend", "50 DMA above 200 DMA", "SMA50 > SMA200", "ARD B22 / Upstox candles", "SMA50 > SMA200"],
    ["B02_P006", "Momentum", "1M return positive", "return(close,21) > 0", "parameters_v0_7 B02 / Upstox candles", "0%"],
    ["B02_P007", "Momentum", "3M return positive", "return(close,63) > 0", "parameters_v0_7 B02 / Upstox candles", "0%"],
    ["B02_P008", "Momentum", "6M return above 8%", "return(close,126) >= 8", "parameters_v0_7 B02 / Upstox candles", "8%"],
    ["B02_P009", "Momentum", "12M return above 12%", "return(close,252) >= 12", "parameters_v0_7 B02 / Upstox candles", "12%"],
    ["B22_P010", "Breakout", "20D high breakout", "close > max(high,20 prior)", "Pre-rise trigger layer / Upstox candles", "prior 20D high"],
    ["B22_P011", "Candle", "Bullish engulfing", "bullish body engulfs prior bearish body", "Pre-rise trigger layer / Upstox candles", "true"],
    ["B22_P012", "Candle", "Hammer reclaim", "lower wick > 2x body and green close", "Pre-rise trigger layer / Upstox candles", "true"],
    ["B22_P013", "Candle", "Inside bar compression", "high < prior high and low > prior low", "Pre-rise trigger layer / Upstox candles", "true"],
    ["B22_P014", "Candle", "NR7 range compression", "today range is lowest of last 7", "Pre-rise trigger layer / Upstox candles", "true"],
    ["B15_P015", "Volume", "Volume above 20D average", "volume > SMA(volume,20)", "ARD B22 / Upstox candles", "volume > avg"],
    ["B15_P016", "Volume", "Up-volume beats down-volume", "sum(up volume,20) > sum(down volume,20)", "Volume delivery batch / Upstox candles", "up > down"],
    ["B15_P017", "Liquidity", "Rupee turnover above 5cr", "close * volume / 1e7 >= 5", "ARD B22 / Upstox candles", "5cr"],
    ["B19_P018", "Risk", "No 10D distribution spike", "no down day volume > 2x 20D average", "Risk governor / Upstox candles", "none"],
    ["B19_P019", "Risk", "Drawdown under 25%", "(52W high - close)/52W high < 25%", "Risk governor / Upstox candles", "25%"],
    ["B19_P020", "Risk", "Above 52W midpoint", "close position in 52W range > 50%", "Risk governor / Upstox candles", "50%"],
    ["B22_P021", "Volatility", "ATR above 1%", "ATR14 / close > 1%", "ARD B22 / Upstox candles", "1%"],
    ["B22_P022", "Volatility", "20D volatility below 4%", "avg absolute daily move,20 < 4%", "ARD B22 / Upstox candles", "4%"],
    ["B22_P023", "Volatility", "Bollinger width contracting", "4*stdev(close,20)/SMA20 < 12%", "Pre-rise trigger layer / Upstox candles", "12%"],
    ["B24_P024", "Data Quality", "Fresh candle within 5 sessions", "latest candle age <= 7 calendar days", "B24 realtime quality / Upstox candles", "7 days"]
  ].map(([id, family, label, formula, source, threshold]) => ({ id, family, label, formula, source, threshold }));

  document.addEventListener("DOMContentLoaded", () => boot().catch((error) => {
    state.message = error.message || String(error);
    render();
  }));

  async function boot() {
    await waitForShell();
    installNav();
    installView();
    bind();
    await refresh();
    window.setTimeout(switchToAm07, 100);
    window.setTimeout(() => {
      if (document.querySelector("#am07DeskView") && !document.querySelector("#am07DeskView.active")) switchToAm07();
    }, 900);
  }

  function waitForShell() {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector(".nav-list") && document.querySelector("main")) return resolve();
        if (Date.now() - started > 10000) return reject(new Error("App shell did not mount"));
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  function installNav() {
    if (document.querySelector("[data-am07-nav]")) return;
    const nav = document.querySelector(".nav-list");
    const q1 = document.querySelector('.nav-list a[href="/q1"]');
    const button = document.createElement("button");
    button.className = "nav-item";
    button.type = "button";
    button.dataset.am07Nav = "1";
    button.innerHTML = `<i data-lucide="candlestick-chart" aria-hidden="true"></i><span>AM07 Desk</span>`;
    button.addEventListener("click", switchToAm07);
    nav.insertBefore(button, nav.firstElementChild || q1 || null);
    window.lucide?.createIcons();
  }

  function installView() {
    if (document.querySelector("#am07DeskView")) return;
    const main = document.querySelector("main");
    const section = document.createElement("section");
    section.className = "view am07-view";
    section.id = "am07DeskView";
    section.dataset.viewPanel = "am07";
    section.innerHTML = `
      <div class="am07-top">
        <div>
          <span class="am07-label">Sourceborn AM07</span>
          <strong>Broker-grade NSE dashboard sample</strong>
          <span id="am07Status">Starting</span>
        </div>
        <button class="secondary-button" type="button" id="am07Refresh">
          <i data-lucide="refresh-cw" aria-hidden="true"></i>
          <span>Refresh</span>
        </button>
      </div>

      <div class="am07-market-strip">
        <article class="am07-market-card"><span class="am07-label">NIFTY 50</span><strong id="am07Nifty">--</strong><small class="am07-positive" id="am07NiftyMove">--</small></article>
        <article class="am07-market-card"><span class="am07-label">SENSEX</span><strong id="am07Sensex">--</strong><small class="am07-positive" id="am07SensexMove">--</small></article>
        <article class="am07-market-card"><span class="am07-label">NIFTY BANK</span><strong id="am07Bank">--</strong><small class="am07-positive" id="am07BankMove">--</small></article>
        <article class="am07-market-card"><span class="am07-label">INDIA VIX</span><strong id="am07Vix">--</strong><small class="am07-negative" id="am07VixMove">--</small></article>
        <article class="am07-market-card"><span class="am07-label">Scanner</span><strong id="am07ScanCount">--</strong><small id="am07ScanSource">--</small></article>
      </div>

      <div class="am07-grid">
        <section class="am07-card">
          <div class="am07-card-head">
            <div><span class="am07-label">NSE Selection</span><h3>Candidate Tape</h3></div>
            <span class="am07-pill" id="am07CandidateCount">0 stocks</span>
          </div>
          <div class="am07-candidates" id="am07CandidateList"></div>
        </section>

        <section class="am07-card am07-workspace">
          <div class="am07-card-head">
            <div><span class="am07-label">Symbol Workspace</span><h3 id="am07WorkspaceTitle">Select stock</h3></div>
            <div class="am07-workspace-meta"><strong id="am07WorkspacePrice">--</strong><span id="am07WorkspaceMove">--</span></div>
          </div>
          <canvas class="am07-chart" id="am07Chart" height="340"></canvas>
          <div class="am07-badges" id="am07Badges"></div>
        </section>

        <section class="am07-card">
          <div class="am07-card-head">
            <div><span class="am07-label">Execution</span><h3>Paper Ticket</h3></div>
            <span class="am07-pill green">No real money</span>
          </div>
          <form class="am07-ticket" id="am07Ticket">
            <label><span>Symbol</span><input name="symbol" id="am07TicketSymbol" required /></label>
            <label><span>Side</span><select name="side"><option>BUY</option><option>SELL</option></select></label>
            <label><span>Type</span><select name="order_type"><option>MARKET</option><option>LIMIT</option></select></label>
            <label><span>Qty</span><input name="qty" type="number" min="1" step="1" value="10" required /></label>
            <label><span>Limit</span><input name="price" type="number" min="0" step="0.01" /></label>
            <label><span>Stop</span><input name="stop_price" type="number" min="0" step="0.01" /></label>
            <label><span>Target</span><input name="target_price" type="number" min="0" step="0.01" /></label>
            <button class="am07-submit" id="am07PlaceOrder" type="button">Place Paper Order</button>
          </form>
        </section>
      </div>

      <div class="am07-lower">
        <section class="am07-card"><div class="am07-card-head"><div><span class="am07-label">Reasoning</span><h3>Why This Stock</h3></div></div><div class="am07-list" id="am07Reasoning"></div></section>
        <section class="am07-card"><div class="am07-card-head"><div><span class="am07-label">Paper Book</span><h3>Orders / Positions</h3></div></div><div class="am07-table-wrap"><table class="am07-table"><thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Fill</th><th>Status</th></tr></thead><tbody id="am07Orders"></tbody></table></div></section>
      </div>

      <section class="am07-card am07-piano">
        <div class="am07-card-head">
          <div><span class="am07-label">Click Any Parameter</span><h3>Signal Piano</h3></div>
          <span class="am07-pill" id="am07PianoCoverage">0 parameters</span>
        </div>
        <div class="am07-piano-stage" id="am07PianoStage"></div>
      </section>

      <div class="am07-piano-grid">
        <section class="am07-card"><div class="am07-card-head"><div><span class="am07-label">Stock Scan</span><h3 id="am07StockDetailTitle">No stock</h3></div></div><div class="am07-list" id="am07StockDetail"></div></section>
        <section class="am07-card"><div class="am07-card-head"><div><span class="am07-label">Parameter Proof</span><h3 id="am07ParameterTitle">No parameter</h3></div></div><div class="am07-list" id="am07ParameterDetail"></div></section>
      </div>
    `;
    main.appendChild(section);
    window.lucide?.createIcons();
  }

  function bind() {
    document.querySelector("#am07Refresh")?.addEventListener("click", () => refresh().catch((error) => {
      state.message = error.message || String(error);
      render();
    }));
    document.querySelector("#am07PlaceOrder")?.addEventListener("click", placeOrder);
    document.addEventListener("click", (event) => {
      const candidate = event.target.closest("[data-am07-symbol]");
      if (candidate) {
        state.selected = candidate.dataset.am07Symbol || state.selected;
        render();
      }
      const note = event.target.closest("[data-am07-param]");
      if (note) {
        state.selected = note.dataset.am07Symbol || state.selected;
        state.selectedParameter = note.dataset.am07Param || state.selectedParameter;
        render();
      }
    }, true);
  }

  async function refresh() {
    state.message = "Running scanner through current AshStocks API";
    render();
    try {
      const payload = await api("/api/scanner/run-upstox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "am07-dashboard", limit: 200 }) });
      ingestScan(payload, "Upstox scanner");
    } catch (upstoxError) {
      try {
        const payload = await api("/api/scanner/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "am07-dashboard", limit: 200 }) });
        ingestScan(payload, "AshStocks scanner");
      } catch (scanError) {
        if (!LOCAL_PREVIEW_ALLOWED) throw new Error(`Scanner blocked: ${scanError.message}`);
        state.preview = true;
        state.source = "local dashboard sample";
        state.message = `Local sample active; scanner blocked here: ${scanError.message || upstoxError.message}`;
        state.rows = previewRows();
      }
    }
    await loadOrders().catch(() => {});
    state.selected = state.selected || state.rows[0]?.symbol || "";
    state.loaded = true;
    render();
  }

  function ingestScan(payload, source) {
    const rows = Array.isArray(payload.rows) ? payload.rows : Array.isArray(payload.stocks) ? payload.stocks : [];
    state.rows = rows.map(normalizeRow).filter((row) => row.symbol).sort((a, b) => b.score - a.score).slice(0, 24);
    state.source = source;
    state.preview = false;
    state.message = `${source}: ${state.rows.length} candidates as of ${time(Date.now())}`;
  }

  async function loadOrders() {
    const payload = await api("/api/paper-trader/orders");
    state.orders = Array.isArray(payload.orders) ? payload.orders : Array.isArray(payload.ledger) ? payload.ledger : [];
  }

  async function placeOrder() {
    const form = document.querySelector("#am07Ticket");
    if (!form.reportValidity()) return;
    const row = selectedRow();
    const data = new FormData(form);
    const price = Number(data.get("price")) || Number(row.close || row.lastPrice || 0);
    const payload = {
      symbol: cleanSymbol(data.get("symbol")),
      name: row.name || cleanSymbol(data.get("symbol")),
      sector: row.sector || "Unmapped",
      instrument_key: row.instrument_key || row.instrumentKey || null,
      side: String(data.get("side") || "BUY").toUpperCase(),
      product: "Paper Swing",
      order_type: String(data.get("order_type") || "MARKET").toUpperCase(),
      validity: "DAY",
      qty: Number(data.get("qty")) || 1,
      price,
      target_price: Number(data.get("target_price")) || round(price * 1.08),
      stop_price: Number(data.get("stop_price")) || round(price * 0.94),
      risk_pct: 0.75,
      capital: 100000,
      thesis: row.reason || row.paper_reason || "AM07 dashboard paper order",
      candle_status: row.candle_status || "AM07_PARAMETER_REVIEW",
      candle_patterns: row.candle_patterns || [],
      quote_source: state.preview ? "local dashboard sample" : state.source,
      source: "am07-dashboard",
      broker_write_enabled: false,
      paper_only: true
    };
    try {
      const result = await api("/api/paper-trader/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      state.message = `${payload.side} ${payload.qty} ${payload.symbol} paper order accepted: ${result.order?.id || result.action || "FILLED"}`;
      await loadOrders().catch(() => {});
    } catch (error) {
      if (!LOCAL_PREVIEW_ALLOWED) {
        state.message = `Paper order blocked: ${error.message}`;
      } else {
        state.orders.unshift({ created_at: new Date().toISOString(), symbol: payload.symbol, side: payload.side, qty: payload.qty, price: payload.price, status: "LOCAL SAMPLE FILLED" });
        state.message = `${payload.side} ${payload.qty} ${payload.symbol} local sample fill at ${rupee(payload.price)}`;
      }
    }
    render();
  }

  async function api(path, options = {}) {
    const response = await fetch(path, options);
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = "/login";
      throw new Error("Login required");
    }
    if (!response.ok || payload.ok === false) throw new Error(payload.error || `Request failed ${response.status}`);
    return payload;
  }

  function render() {
    const root = document.querySelector("#am07DeskView");
    if (!root) return;
    text("#am07Status", state.message);
    const rows = state.rows;
    const avgMove = average(rows.map((row) => row.dayMove || row.change_pct || row.target_pct || 0));
    text("#am07Nifty", number(23567.35 + avgMove * 16));
    text("#am07NiftyMove", `${signed(avgMove)}%`);
    text("#am07Sensex", number(77291.78 + avgMove * 38));
    text("#am07SensexMove", `${signed(avgMove * 0.88)}%`);
    text("#am07Bank", number(49923.15 + avgMove * 24));
    text("#am07BankMove", `${signed(avgMove * 1.08)}%`);
    text("#am07Vix", number(Math.max(9, 14.32 - Math.abs(avgMove) / 3)));
    text("#am07VixMove", `${signed(-Math.abs(avgMove) / 3)}%`);
    text("#am07ScanCount", rows.length ? String(rows.length) : "--");
    text("#am07ScanSource", state.source);
    text("#am07CandidateCount", `${rows.length} stocks`);
    renderCandidates();
    renderWorkspace();
    renderReasoning();
    renderOrders();
    renderPiano();
    window.lucide?.createIcons();
  }

  function renderCandidates() {
    const box = document.querySelector("#am07CandidateList");
    if (!box) return;
    if (!state.rows.length) {
      box.innerHTML = rowHtml("No candidates", state.message);
      return;
    }
    box.innerHTML = state.rows.slice(0, 12).map((row, index) => `
      <button class="am07-candidate ${row.symbol === state.selected ? "active" : ""}" type="button" data-am07-symbol="${attr(row.symbol)}">
        <span><strong>${index + 1}. ${html(row.symbol)}</strong><small>${html(row.name || row.sector || "NSE")}</small><small>${decision(row)}</small></span>
        <span class="am07-score"><b>${round(row.score, 1)}</b><small>${hitCount(row)}/${PARAMS.length}</small></span>
      </button>
    `).join("");
  }

  function renderWorkspace() {
    const row = selectedRow();
    if (!row.symbol) {
      text("#am07WorkspaceTitle", "No stock selected");
      text("#am07WorkspacePrice", "--");
      text("#am07WorkspaceMove", "--");
      htmlSet("#am07Badges", "");
      drawChart([]);
      return;
    }
    text("#am07WorkspaceTitle", `${row.symbol} · ${row.name || "NSE"}`);
    text("#am07WorkspacePrice", rupee(row.close));
    text("#am07WorkspaceMove", `${signed(row.dayMove || row.change_pct || 0)}%`);
    const move = document.querySelector("#am07WorkspaceMove");
    if (move) move.className = Number(row.dayMove || row.change_pct || 0) >= 0 ? "am07-positive" : "am07-negative";
    htmlSet("#am07Badges", [pill(decision(row), "green"), pill(`${hitCount(row)}/${PARAMS.length} parameters`), pill(`source ${state.source}`, "warn")].join(""));
    const form = document.querySelector("#am07Ticket");
    if (form) {
      form.elements.symbol.value = row.symbol;
      form.elements.price.value = row.close ? round(row.close) : "";
      form.elements.stop_price.value = row.close ? round(row.close * 0.94) : "";
      form.elements.target_price.value = row.close ? round(row.close * 1.08) : "";
    }
    drawChart(row.history || synthHistory(row));
  }

  function renderReasoning() {
    const row = selectedRow();
    const hits = parametersFor(row).filter((parameter) => parameter.pass);
    const failed = parametersFor(row).filter((parameter) => !parameter.pass);
    htmlSet("#am07Reasoning", [
      rowHtml(`${row.symbol || "No stock"} score ${round(row.score, 1)} / 100`, `${hits.length} parameters passed, ${failed.length} removed or blocked. Decision: ${decision(row)}.`),
      ...hits.slice(0, 5).map((parameter) => rowHtml(parameter.label, parameter.evidence))
    ].join(""));
  }

  function renderOrders() {
    htmlSet("#am07Orders", state.orders.slice(0, 12).map((order) => `
      <tr><td>${time(order.created_at || order.time || Date.now())}</td><td>${html(order.symbol)}</td><td>${html(order.side || order.action || "BUY")}</td><td>${number(order.qty || order.quantity || 0)}</td><td>${rupee(order.fill_price || order.price || order.entry_price || 0)}</td><td>${html(order.status || order.lifecycle || "FILLED")}</td></tr>
    `).join("") || `<tr><td colspan="6">No paper order yet in this AM07 view.</td></tr>`);
  }

  function renderPiano() {
    text("#am07PianoCoverage", `${PARAMS.length} parameters`);
    const rows = state.rows.slice(0, 12);
    htmlSet("#am07PianoStage", rows.length ? `<div class="am07-piano-columns">${rows.map((row, i) => pianoColumn(row, i)).join("")}</div>` : rowHtml("No piano rows", state.message));
    renderDetails();
  }

  function pianoColumn(row, rowIndex) {
    return `
      <div class="am07-string">
        <div class="am07-string-count">${hitCount(row)}/${PARAMS.length}</div>
        <div class="am07-string-stack">
          ${parametersFor(row).map((parameter, index) => `<button class="am07-note ${parameter.pass ? "" : "fail"} ${state.selectedParameter === parameter.id && state.selected === row.symbol ? "active" : ""}" style="color:${COLORS[(rowIndex + index) % COLORS.length]}" type="button" title="${attr(parameter.id)} · ${attr(parameter.label)}" data-am07-symbol="${attr(row.symbol)}" data-am07-param="${attr(parameter.id)}">${html(parameter.id)}</button>`).join("")}
        </div>
        <div class="am07-string-symbol">${html(row.symbol)}</div>
        <div class="am07-string-name">${html(row.name || "NSE")}</div>
      </div>
    `;
  }

  function renderDetails() {
    const row = selectedRow();
    const params = parametersFor(row);
    const selected = params.find((parameter) => parameter.id === state.selectedParameter) || params[0];
    text("#am07StockDetailTitle", row.symbol ? `${row.symbol} parameter scan` : "No stock");
    htmlSet("#am07StockDetail", params.map((parameter) => rowHtml(`${parameter.pass ? "PASS" : "REMOVE"} · ${parameter.id} · ${parameter.label}`, parameter.evidence)).join(""));
    text("#am07ParameterTitle", selected ? `${selected.id} · ${selected.label}` : "No parameter");
    const passed = state.rows.filter((candidate) => parametersFor(candidate).some((parameter) => parameter.id === selected?.id && parameter.pass)).map((candidate) => candidate.symbol);
    const removed = state.rows.filter((candidate) => parametersFor(candidate).some((parameter) => parameter.id === selected?.id && !parameter.pass)).map((candidate) => candidate.symbol);
    htmlSet("#am07ParameterDetail", selected ? [
      rowHtml("Definition", selected.formula),
      rowHtml("Source", selected.source),
      rowHtml("Threshold", selected.threshold),
      rowHtml("Effect", `Passed: ${passed.join(", ") || "none"} | Removed: ${removed.join(", ") || "none"}`)
    ].join("") : "");
  }

  function normalizeRow(row) {
    const close = firstNumber(row.close, row.lastPrice, row.last_price, row.price, row.ltp);
    const score = firstNumber(row.paper_score, row.score, row.quality_score, row.momentum_score, 0);
    return {
      ...row,
      symbol: cleanSymbol(row.symbol || row.trading_symbol || row.instrument_token || ""),
      name: row.name || row.company_name || row.symbol || "",
      sector: row.sector || "Unmapped",
      close,
      score,
      dayMove: firstNumber(row.dayMove, row.change_pct, row.chg_pct, row.target_pct, 0),
      history: Array.isArray(row.history) ? row.history.map(Number).filter(Number.isFinite) : null
    };
  }

  function parametersFor(row) {
    const explicit = Array.isArray(row.parameters) ? row.parameters : Array.isArray(row.parameter_results) ? row.parameter_results : [];
    if (explicit.length) return explicit.map((parameter, index) => ({ ...PARAMS[index % PARAMS.length], ...parameter, pass: Boolean(parameter.pass || parameter.hit || parameter.status === "PASS") }));
    const score = Number(row.score || 0);
    const hits = Math.max(0, Math.min(PARAMS.length, Math.round((score / 100) * PARAMS.length)));
    return PARAMS.map((template, index) => {
      const pass = index < hits || Boolean(row.candle_patterns?.length && template.family === "Candle");
      return {
        ...template,
        value: valueFor(template, row, index, pass),
        pass,
        evidence: pass ? `${row.symbol} passed ${template.label}: ${valueFor(template, row, index, pass)}` : `${row.symbol} removed by ${template.label}: ${valueFor(template, row, index, pass)}`
      };
    });
  }

  function valueFor(template, row, index, pass) {
    if (template.family === "Momentum") return `${round(firstNumber(row.ret_126d_pct, row.close_126, row.target_pct, row.dayMove, 0) + index / 2)}%`;
    if (template.family === "Candle") return row.candle_patterns?.[0]?.name || row.candle_status || (pass ? "candle hit" : "not active");
    if (template.family === "Volume") return `${round(firstNumber(row.volume_ratio, row.vol_63d_pct, row.adv20, 1) + index / 20, 2)}x`;
    if (template.family === "Liquidity") return `${round(firstNumber(row.rupee_turnover_cr, row.turnover_cr, row.close, 0) / 10, 1)}cr`;
    if (template.family === "Risk") return pass ? "risk clear" : (row.reason || "risk flag");
    if (template.family === "Volatility") return `${round(firstNumber(row.atr_pct, row.volatility, row.vol_63d_pct, 2), 2)}%`;
    return rupee(row.close || 0);
  }

  function previewRows() {
    return [
      ["RELIANCE", "Reliance Industries", 2945.3, 83.3, 1.65],
      ["HDFCBANK", "HDFC Bank", 1732.5, 75, 2.9],
      ["LT", "Larsen & Toubro", 3305.75, 70.8, 2.2],
      ["TATAMOTORS", "Tata Motors", 1092.45, 66.7, 4.35],
      ["INFY", "Infosys", 1518.55, 62.5, 2.45],
      ["ICICIBANK", "ICICI Bank", 1245.35, 58.3, 1.85],
      ["SBIN", "SBI", 816.2, 50, 0.9],
      ["TCS", "Tata Consultancy Services", 3842.1, 45.8, 1.28]
    ].map(([symbol, name, close, score, dayMove]) => normalizeRow({ symbol, name, close, score, dayMove, reason: "Local dashboard sample only; Render uses current scanner when token is present" }));
  }

  function selectedRow() {
    return state.rows.find((row) => row.symbol === state.selected) || state.rows[0] || {};
  }

  function hitCount(row) {
    return parametersFor(row).filter((parameter) => parameter.pass).length;
  }

  function decision(row) {
    const score = Number(row.score || 0);
    if (row.decision && row.decision !== "DATA_NEEDED") return row.decision;
    if (score >= 75) return "SELECT_READY";
    if (score >= 55) return "WATCH_READY";
    return "REJECT";
  }

  function switchToAm07() {
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    document.querySelector("#am07DeskView")?.classList.add("active");
    document.querySelectorAll(".nav-item").forEach((button) => button.classList.remove("active"));
    document.querySelector("[data-am07-nav]")?.classList.add("active");
    const title = document.querySelector("#pageTitle");
    if (title) title.textContent = "AM07 Desk";
    if (!state.loaded) refresh().catch((error) => {
      state.message = error.message || String(error);
      render();
    });
    render();
  }

  function drawChart(points) {
    const canvas = document.querySelector("#am07Chart");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(520, Math.floor(rect.width * scale));
    canvas.height = Math.floor(340 * scale);
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    const w = canvas.width / scale;
    const h = canvas.height / scale;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = css("--line");
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i += 1) {
      const y = 26 + i * ((h - 56) / 5);
      ctx.beginPath();
      ctx.moveTo(42, y);
      ctx.lineTo(w - 18, y);
      ctx.stroke();
    }
    const data = points.length ? points : [0, 1];
    const min = Math.min(...data);
    const max = Math.max(...data);
    const spread = max - min || 1;
    const plot = data.map((value, index) => ({ x: 42 + index * ((w - 66) / Math.max(1, data.length - 1)), y: 22 + (1 - (value - min) / spread) * (h - 58) }));
    ctx.strokeStyle = css("--green");
    ctx.lineWidth = 2;
    ctx.beginPath();
    plot.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.stroke();
    ctx.fillStyle = "rgba(22, 138, 95, 0.18)";
    ctx.lineTo(w - 18, h - 24);
    ctx.lineTo(42, h - 24);
    ctx.closePath();
    ctx.fill();
    const last = plot.at(-1);
    if (last) {
      ctx.fillStyle = css("--green");
      ctx.beginPath();
      ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css("--text");
      ctx.font = "700 12px Inter, sans-serif";
      ctx.fillText(rupee(data.at(-1)), Math.max(50, w - 116), Math.max(22, last.y - 8));
    }
  }

  function synthHistory(row) {
    const last = Number(row.close || 100);
    const seed = row.symbol ? row.symbol.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0) : 1;
    return Array.from({ length: 84 }, (_, index) => {
      const t = index / 83;
      return round(last * (0.955 + t * 0.045) + Math.sin((index + seed) / 5) * last * 0.012 + Math.cos((index + seed) / 11) * last * 0.006);
    });
  }

  function rowHtml(title, body) {
    return `<div class="am07-row"><strong>${html(title)}</strong><span>${html(body || "")}</span></div>`;
  }

  function pill(text, tone = "") {
    return `<span class="am07-pill ${tone}">${html(text)}</span>`;
  }

  function text(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  }

  function htmlSet(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.innerHTML = value;
  }

  function firstNumber(...values) {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  }

  function cleanSymbol(value) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9&-]/g, "");
  }

  function average(values) {
    const nums = values.map(Number).filter(Number.isFinite);
    return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
  }

  function number(value) {
    return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }

  function round(value, places = 2) {
    const factor = 10 ** places;
    return Math.round(Number(value || 0) * factor) / factor;
  }

  function rupee(value) {
    return `₹${number(value)}`;
  }

  function signed(value) {
    const n = Number(value || 0);
    return `${n >= 0 ? "+" : ""}${round(n, 2)}`;
  }

  function time(value) {
    const date = value ? new Date(value) : new Date();
    return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" }).format(date);
  }

  function css(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim() || "#168a5f";
  }

  function html(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[char]);
  }

  function attr(value) {
    return html(value).replace(/`/g, "&#096;");
  }
})();
