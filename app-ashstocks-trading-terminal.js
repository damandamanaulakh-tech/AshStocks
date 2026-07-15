(() => {
  const state = {
    ready: null,
    market: null,
    framework: null,
    scan: null,
    ledger: null,
    selectedSymbol: "",
    quoteByKey: {},
    busy: false,
    message: "Booting terminal"
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/scanner/run")) captureJson(response, (payload) => {
      if (Array.isArray(payload.rows)) {
        state.scan = payload;
        state.selectedSymbol = chooseSelected(payload.rows, state.selectedSymbol);
        renderTerminal();
        requestSelectedQuote().catch(() => {});
      }
    });
    if (url.includes("/api/paper-trader/orders")) captureJson(response, (payload) => {
      state.ledger = payload;
      renderTerminal();
    });
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => boot().catch((error) => {
    state.message = error.message || String(error);
    renderTerminal();
  }));

  window.addEventListener("ashstocks:upstox-quote", (event) => {
    const detail = event.detail || {};
    const key = detail.instrument_key || detail.quoteState?.quote?.instrument_key || "";
    if (key) state.quoteByKey[key] = detail.quoteState || { quote: detail.quote, ok: true, transport: detail.transport || "event" };
    renderTerminal();
  });

  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-ash-terminal-nav]");
    if (nav) switchToTerminal();
    const rowButton = event.target.closest("button[data-terminal-symbol]");
    if (rowButton) {
      state.selectedSymbol = rowButton.dataset.terminalSymbol || "";
      window.dispatchEvent(new CustomEvent("ashstocks:broker-select-symbol", { detail: { symbol: state.selectedSymbol } }));
      renderTerminal();
      requestSelectedQuote().catch(() => {});
    }
    const action = event.target.closest("button[data-terminal-paper-action]");
    if (action) submitPaperAction(action.dataset.terminalPaperAction).catch((error) => {
      state.message = error.message || String(error);
      renderTerminal();
    });
    const run = event.target.closest("button[data-terminal-run]");
    if (run) runTerminalScan(run.dataset.terminalRun).catch((error) => {
      state.message = error.message || String(error);
      renderTerminal();
    });
  }, true);

  async function boot() {
    await waitForAppShell();
    installTerminalNav();
    installTerminalView();
    await Promise.allSettled([loadReady(), loadFramework(), loadMarket(), loadLedger()]);
    if (!state.scan) await runTerminalScan("server");
    renderTerminal();
    setInterval(() => loadLedger().catch(() => {}), 45000);
  }

  function waitForAppShell() {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector(".nav-list") && document.querySelector("#scannerView")) return resolve();
        if (Date.now() - started > 12000) return resolve();
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  function installTerminalNav() {
    const nav = document.querySelector(".nav-list");
    if (!nav || document.querySelector("[data-ash-terminal-nav]")) return;
    const button = document.createElement("button");
    button.className = "nav-item ash-terminal-nav";
    button.type = "button";
    button.dataset.ashTerminalNav = "trading";
    button.innerHTML = `<i data-lucide="panel-top-open" aria-hidden="true"></i><span>Trading</span>`;
    nav.insertBefore(button, nav.firstElementChild);
    window.lucide?.createIcons();
  }

  function installTerminalView() {
    const anchor = document.querySelector("#scannerView");
    if (!anchor || document.querySelector("#ashTradingTerminalView")) return;
    anchor.insertAdjacentHTML("beforebegin", `
      <section class="view active ash-trading-terminal" id="ashTradingTerminalView" data-ash-terminal-panel="trading">
        <div class="terminal-head">
          <div>
            <span class="eyebrow">Broker-Grade Paper Terminal</span>
            <h3>AshStocks Trading</h3>
          </div>
          <div class="terminal-actions">
            <button class="secondary-button" type="button" data-terminal-run="server"><i data-lucide="radar" aria-hidden="true"></i><span>Scan</span></button>
            <button class="primary-button" type="button" data-terminal-run="upstox"><i data-lucide="satellite-dish" aria-hidden="true"></i><span>Upstox Candles</span></button>
          </div>
        </div>
        <div class="terminal-status" id="terminalStatusLine"></div>
        <div class="terminal-market-strip" id="terminalMarketStrip"></div>
        <div class="terminal-layout">
          <section class="terminal-watch panel">
            <div class="panel-header"><h3>Market Watch</h3><span id="terminalWatchCount">0</span></div>
            <div class="terminal-filter-row">
              <button type="button" data-terminal-filter="ALL" class="active">All</button>
              <button type="button" data-terminal-filter="SELECT">SELECT</button>
              <button type="button" data-terminal-filter="WATCH">WATCH</button>
              <button type="button" data-terminal-filter="CANDLE">Candle</button>
              <button type="button" data-terminal-filter="DATA_NEEDED">Data</button>
            </div>
            <div id="terminalWatchList" class="terminal-watch-list"></div>
          </section>
          <section class="terminal-chart panel">
            <div class="panel-header"><h3 id="terminalSelectedName">No stock selected</h3><span id="terminalQuoteState">DATA_NEEDED</span></div>
            <div id="terminalQuoteTape" class="terminal-quote-tape"></div>
            <div id="terminalCandleChart" class="terminal-candle-chart"></div>
            <div id="terminalParameterGates" class="terminal-parameter-gates"></div>
          </section>
          <section class="terminal-ticket panel">
            <div class="panel-header"><h3>Paper Order Ticket</h3><span>Live broker locked</span></div>
            <div id="terminalTicketBody"></div>
          </section>
        </div>
        <div class="terminal-bottom-grid">
          <section class="panel"><div class="panel-header"><h3>Orders / Trades / GTT</h3><span id="terminalLedgerCount">0</span></div><div id="terminalLedger" class="terminal-ledger"></div></section>
          <section class="panel"><div class="panel-header"><h3>Parameter Proof</h3><span id="terminalProofState">Waiting</span></div><div id="terminalProof" class="terminal-proof"></div></section>
        </div>
      </section>
    `);
    switchToTerminal();
    window.lucide?.createIcons();
  }

  async function loadReady() { state.ready = await api("/api/ready"); renderTerminal(); }
  async function loadFramework() { state.framework = await api("/api/framework"); renderTerminal(); }
  async function loadMarket() { state.market = await api("/api/market-context"); renderTerminal(); }
  async function loadLedger() { state.ledger = await api("/api/paper-trader/orders"); renderTerminal(); }

  async function runTerminalScan(mode) {
    state.busy = true;
    state.message = mode === "upstox" ? "Fetching Upstox historical candles" : "Running AshStocks scanner";
    renderTerminal();
    const path = mode === "upstox" ? "/api/scanner/run-upstox" : "/api/scanner/run";
    const body = mode === "upstox" ? { from: dateBack(470), to: today() } : {};
    try {
      state.scan = await api(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      state.selectedSymbol = chooseSelected(state.scan.rows || [], state.selectedSymbol);
      state.message = `${mode === "upstox" ? "Upstox candle" : "Scanner"} run complete`;
      await requestSelectedQuote().catch(() => {});
    } finally {
      state.busy = false;
      renderTerminal();
    }
  }

  async function requestSelectedQuote() {
    const row = selectedRow();
    const key = instrumentKey(row);
    if (!key) return;
    const payload = await api("/api/upstox/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instrument_keys: [key], source: "ashstocks-trading-terminal" })
    });
    if (payload.quotes?.[0]) state.quoteByKey[key] = { ok: true, quote: payload.quotes[0], payload, transport: "quote-api" };
    renderTerminal();
  }

  async function submitPaperAction(side) {
    const row = selectedRow();
    if (!row.symbol) throw new Error("Select a stock before paper order.");
    const price = readNumber("#terminalOrderPrice") || quotePrice(row);
    const qty = Math.max(1, Math.floor(readNumber("#terminalOrderQty") || estimatedQty(row)));
    const payload = await api("/api/paper-trader/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        symbol: row.symbol,
        name: row.name,
        side,
        qty,
        price,
        order_type: document.querySelector("#terminalOrderType")?.value || "MARKET",
        product: document.querySelector("#terminalProduct")?.value || "PAPER_SWING",
        validity: document.querySelector("#terminalValidity")?.value || "DAY",
        target_price: readNumber("#terminalTarget") || row.target_price || row.target2 || row.advisor?.target2,
        stop_price: readNumber("#terminalStop") || row.stop_price || row.advisor?.stop,
        trigger_price: readNumber("#terminalTrigger") || null,
        risk_pct: readNumber("#terminalRiskPct") || 0.75,
        capital: readNumber("#terminalCapital") || 100000,
        decision: row.decision,
        score: row.score || row.paper_score,
        parameter_hits: parameterGates(row).filter((gate) => gate.status === "HIT").map((gate) => gate.id),
        candle_status: row.candle_status || "DATA_NEEDED",
        candle_patterns: row.candle_patterns || [],
        quote_source: quoteState(row).quote ? "Upstox Market Quote API" : "scanner-fallback",
        paper_only: true,
        broker_write_enabled: false,
        source: "ashstocks-trading-terminal"
      })
    });
    state.message = `${side} paper action saved: ${payload.order?.status || payload.status || "OK"}`;
    await loadLedger().catch(() => {});
    renderTerminal();
  }

  function switchToTerminal() {
    document.querySelectorAll("[data-view], [data-broker-view], [data-ash-workspace]").forEach((button) => button.classList.remove("active"));
    document.querySelector("[data-ash-terminal-nav]")?.classList.add("active");
    document.querySelectorAll("[data-view-panel], [data-broker-panel], [data-ash-workspace-panel]").forEach((panel) => panel.classList.remove("active"));
    document.querySelector("#ashTradingTerminalView")?.classList.add("active");
    const title = document.querySelector("#pageTitle");
    if (title) title.textContent = "Trading";
  }

  function renderTerminal() {
    installTerminalView();
    renderStatus();
    renderMarketStrip();
    renderWatchList();
    renderSelected();
    renderTicket();
    renderLedger();
    renderProof();
  }

  function renderStatus() {
    const host = document.querySelector("#terminalStatusLine");
    if (!host) return;
    const ready = state.ready || {};
    const dataBank = ready.data_bank || {};
    const quote = quoteState(selectedRow());
    const pieces = [
      state.busy ? "WORKING" : state.message,
      `universe ${dataBank.universe_count ?? "DATA_NEEDED"}`,
      `Mongo ${ready.storage === "mongodb" ? "OK" : "DATA_NEEDED"}`,
      `Upstox token ${ready.upstox?.token_visible ? "OK" : "DATA_NEEDED"}`,
      `quote ${quote.quote ? "OK" : quote.error || "DATA_NEEDED"}`,
      "paper only"
    ];
    host.innerHTML = pieces.map((piece, index) => `<span class="${index === 0 ? "primary" : ""}">${escapeHtml(piece)}</span>`).join("");
  }

  function renderMarketStrip() {
    const host = document.querySelector("#terminalMarketStrip");
    if (!host) return;
    const cards = state.market?.cards || [];
    if (!cards.length) {
      host.innerHTML = dataNeededCard("Market context", "Need /api/market-context for NIFTY/SENSEX/VIX style strip.");
      return;
    }
    host.innerHTML = cards.slice(0, 6).map((card) => `<article><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value ?? card.close ?? "DATA_NEEDED")}</strong><b class="${Number(card.change_pct) >= 0 ? "positive" : "negative"}">${signed(card.change_pct)}%</b></article>`).join("");
  }

  function renderWatchList() {
    const host = document.querySelector("#terminalWatchList");
    const count = document.querySelector("#terminalWatchCount");
    if (!host) return;
    const rows = rankedRows();
    if (count) count.textContent = String(rows.length);
    if (!rows.length) {
      host.innerHTML = `<div class="terminal-empty">DATA_NEEDED: scanner rows. Run Scan or Upstox Candles.</div>`;
      return;
    }
    host.innerHTML = rows.slice(0, 80).map((row) => {
      const q = quoteState(row).quote;
      return `<button type="button" data-terminal-symbol="${escapeAttr(row.symbol)}" class="${row.symbol === state.selectedSymbol ? "selected" : ""}"><strong>${escapeHtml(row.symbol)}</strong><span>${escapeHtml(row.decision || "DATA_NEEDED")}</span><b>${money(q?.last_price ?? row.close)}</b><small>${number(row.score || row.paper_score)} | ${number(row.return_6m_pct)}%</small></button>`;
    }).join("");
  }

  function renderSelected() {
    const row = selectedRow();
    const quote = quoteState(row);
    const name = document.querySelector("#terminalSelectedName");
    const stateNode = document.querySelector("#terminalQuoteState");
    const tape = document.querySelector("#terminalQuoteTape");
    const chart = document.querySelector("#terminalCandleChart");
    const gates = document.querySelector("#terminalParameterGates");
    if (name) name.textContent = row.symbol ? `${row.symbol} ${row.name || ""}` : "No stock selected";
    if (stateNode) stateNode.textContent = quote.quote ? "UPSTOX_QUOTE" : "DATA_NEEDED";
    if (tape) tape.innerHTML = quoteTape(row, quote);
    if (chart) chart.innerHTML = candleChart(row);
    if (gates) gates.innerHTML = parameterGates(row).map((gate) => `<article class="${gate.status}"><span>${escapeHtml(gate.id)}</span><strong>${escapeHtml(gate.label)}</strong><b>${escapeHtml(gate.status)}</b><small>${escapeHtml(gate.evidence)}</small></article>`).join("");
  }

  function renderTicket() {
    const host = document.querySelector("#terminalTicketBody");
    if (!host) return;
    const row = selectedRow();
    if (!row.symbol) {
      host.innerHTML = `<div class="terminal-empty">Select a scanner row to build a real paper ticket.</div>`;
      return;
    }
    const price = quotePrice(row);
    host.innerHTML = `
      <div class="terminal-ticket-grid">
        <label><span>Product</span><select id="terminalProduct"><option value="PAPER_INTRADAY">Intraday</option><option value="PAPER_SWING" selected>Swing</option><option value="PAPER_POSITIONAL">Positional</option><option value="PAPER_PORTFOLIO">Portfolio</option></select></label>
        <label><span>Order</span><select id="terminalOrderType"><option>MARKET</option><option>LIMIT</option><option>SL</option><option>GTT</option></select></label>
        <label><span>Validity</span><select id="terminalValidity"><option>DAY</option><option>IOC</option><option>GTT</option></select></label>
        <label><span>Qty</span><input id="terminalOrderQty" value="${escapeAttr(estimatedQty(row))}" /></label>
        <label><span>Price</span><input id="terminalOrderPrice" value="${escapeAttr(numberValue(price))}" /></label>
        <label><span>Trigger</span><input id="terminalTrigger" value="" /></label>
        <label><span>Target</span><input id="terminalTarget" value="${escapeAttr(numberValue(row.target_price || row.target2 || row.advisor?.target2))}" /></label>
        <label><span>Stop</span><input id="terminalStop" value="${escapeAttr(numberValue(row.stop_price || row.advisor?.stop))}" /></label>
        <label><span>Risk %</span><input id="terminalRiskPct" value="0.75" /></label>
        <label><span>Capital</span><input id="terminalCapital" value="100000" /></label>
      </div>
      <div class="terminal-action-row">
        <button type="button" data-terminal-paper-action="BUY" class="buy">BUY</button>
        <button type="button" data-terminal-paper-action="SELL" class="sell">SELL</button>
        <button type="button" data-terminal-paper-action="GTT" class="gtt">GTT</button>
      </div>
      <p>Execution writes only to paper ledger. Real money broker order is locked by product rule.</p>
    `;
  }

  function renderLedger() {
    const host = document.querySelector("#terminalLedger");
    const count = document.querySelector("#terminalLedgerCount");
    if (!host) return;
    const symbol = selectedRow().symbol;
    const ledger = state.ledger || {};
    const rows = [
      ...(ledger.orders || []).map((item) => ({ kind: "Order", ...item })),
      ...(ledger.trades || []).map((item) => ({ kind: "Trade", ...item })),
      ...(ledger.gtt || []).map((item) => ({ kind: "GTT", ...item })),
      ...(ledger.positions || []).map((item) => ({ kind: "Position", ...item }))
    ].filter((item) => !symbol || String(item.symbol || "").toUpperCase() === symbol.toUpperCase());
    if (count) count.textContent = String(rows.length);
    host.innerHTML = rows.length ? rows.slice(-12).reverse().map((item) => `<article><strong>${escapeHtml(item.kind)} ${escapeHtml(item.symbol || "")}</strong><span>${escapeHtml(item.side || item.status || "")}</span><b>${escapeHtml(`${item.qty || ""} @ ${money(item.price || item.entry_price || item.avg_price)}`)}</b></article>`).join("") : `<div class="terminal-empty">No paper ledger rows for selected stock yet.</div>`;
  }

  function renderProof() {
    const host = document.querySelector("#terminalProof");
    const stateNode = document.querySelector("#terminalProofState");
    if (!host) return;
    const row = selectedRow();
    const gates = parameterGates(row);
    const hits = gates.filter((gate) => gate.status === "HIT").length;
    if (stateNode) stateNode.textContent = row.symbol ? `${hits}/${gates.length} hit` : "DATA_NEEDED";
    if (!row.symbol) {
      host.innerHTML = `<div class="terminal-empty">DATA_NEEDED: selected scanner row.</div>`;
      return;
    }
    host.innerHTML = `<strong>${escapeHtml(row.symbol)} decision: ${escapeHtml(row.decision || "DATA_NEEDED")}</strong><p>${escapeHtml(row.reason || row.paper_reason || row.advisor?.why || "No engine reason returned for this row.")}</p><div class="terminal-proof-grid">${gates.map((gate) => `<span class="${gate.status}">${escapeHtml(gate.id)} ${escapeHtml(gate.status)}</span>`).join("")}</div>`;
  }

  function selectedRow() {
    const rows = state.scan?.rows || [];
    return rows.find((row) => row.symbol === state.selectedSymbol) || rankedRows()[0] || {};
  }

  function rankedRows() {
    return [...(state.scan?.rows || [])].sort((a, b) => decisionRank(b) - decisionRank(a) || Number(b.score || b.paper_score || 0) - Number(a.score || a.paper_score || 0));
  }

  function chooseSelected(rows, current) {
    if (current && rows.some((row) => row.symbol === current)) return current;
    return rows.find((row) => row.decision === "SELECT")?.symbol || rows.find((row) => row.decision === "WATCH")?.symbol || rows[0]?.symbol || "";
  }

  function decisionRank(row) { return row.decision === "SELECT" ? 5 : row.decision === "WATCH" ? 4 : row.candle_status === "HIT" ? 3 : row.decision === "BLOCKED" ? 2 : 1; }
  function instrumentKey(row) { return row?.instrument_key || row?.instrumentKey || row?.instrument_token || ""; }
  function quoteState(row) { return state.quoteByKey[instrumentKey(row)] || {}; }
  function quotePrice(row) { return Number(quoteState(row).quote?.last_price ?? row.close ?? row.paper_order?.entry_price ?? row.entry_price ?? 0); }

  function quoteTape(row, quoteStateValue) {
    const quote = quoteStateValue.quote;
    if (!row.symbol) return `<div class="terminal-empty">No stock selected.</div>`;
    const items = [
      ["LTP", money(quote?.last_price ?? row.close)],
      ["Open", money(quote?.open)],
      ["High", money(quote?.high)],
      ["Low", money(quote?.low)],
      ["Volume", compact(quote?.volume || row.volume)],
      ["Depth", quote?.depth_available ? "OK" : "DATA_NEEDED"]
    ];
    return items.map(([label, value]) => `<article><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  }

  function candleChart(row) {
    const candles = normalizeCandles(row.candles || []);
    if (!row.symbol) return `<div class="terminal-empty">DATA_NEEDED: selected stock.</div>`;
    if (!candles.length) return `<div class="terminal-empty">DATA_NEEDED: Upstox daily candles for chart and candle parameters.</div>`;
    const w = 780, h = 260, pad = 18;
    const sample = candles.slice(-80);
    const highs = sample.map((c) => c.high);
    const lows = sample.map((c) => c.low);
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const scaleY = (value) => h - pad - ((value - min) / Math.max(1, max - min)) * (h - pad * 2);
    const step = (w - pad * 2) / Math.max(1, sample.length);
    const bars = sample.map((c, index) => {
      const x = pad + index * step;
      const color = c.close >= c.open ? "#168a5f" : "#bd3b3b";
      const yOpen = scaleY(c.open);
      const yClose = scaleY(c.close);
      const yHigh = scaleY(c.high);
      const yLow = scaleY(c.low);
      return `<line x1="${x}" x2="${x}" y1="${yHigh}" y2="${yLow}" stroke="${color}" stroke-width="1"/><rect x="${x - 2}" y="${Math.min(yOpen, yClose)}" width="4" height="${Math.max(2, Math.abs(yClose - yOpen))}" fill="${color}"/>`;
    }).join("");
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeAttr(row.symbol)} candle chart"><rect width="${w}" height="${h}" rx="8" fill="var(--panel-soft)"/>${bars}<text x="18" y="24" fill="var(--muted)" font-size="12">Real candles: ${sample.length}</text></svg>`;
  }

  function parameterGates(row) {
    const q = quoteState(row).quote;
    return [
      gate("P001", "NSE universe", row.symbol && instrumentKey(row), row.symbol ? `${row.symbol} ${instrumentKey(row) || "no key"}` : "No scanner row"),
      gate("P261", "Price momentum", Number(row.return_6m_pct) >= 8, `6M ${number(row.return_6m_pct)}%`),
      gate("P401", "Relative strength", Number(row.return_12m_pct) >= 12, `12M ${number(row.return_12m_pct)}%`),
      gate("P521", "Liquidity", Number(row.rupee_turnover_cr) >= 5 || Number(row.adv20) >= 200000, `turnover ${number(row.rupee_turnover_cr)} cr ADV ${compact(row.adv20)}`),
      gate("P681", "Bullish candle", patternHit(row, "bullish_engulfing"), candleEvidence(row)),
      gate("P683", "Hammer rejection", patternHit(row, "hammer_rejection"), candleEvidence(row)),
      gate("P686", "252D breakout", patternHit(row, "near_252d_breakout"), candleEvidence(row)),
      gate("P688", "Volume confirmation", patternHit(row, "volume_confirmation"), candleEvidence(row)),
      gate("P1120", "Target room", targetRoom(row), `target ${escapeText(row.target_potential_label || row.target_status || "DATA_NEEDED")}`),
      gate("P1701", "Upstox quote", Boolean(q), q ? `ltp ${money(q.last_price)}` : "Need /api/upstox/quote"),
      gate("P1901", "Paper safety", true, "broker_write_enabled false")
    ];
  }

  function gate(id, label, hit, evidence) { return { id, label, status: hit ? "HIT" : evidence?.includes("DATA_NEEDED") || !evidence ? "DATA_NEEDED" : "WAITING", evidence: evidence || "DATA_NEEDED" }; }
  function patternHit(row, pattern) { return row.candle_status === "HIT" && Array.isArray(row.candle_patterns) && row.candle_patterns.includes(pattern); }
  function candleEvidence(row) { return row.candle_status ? `${row.candle_status}: ${(row.candle_patterns || []).join(", ") || "no pattern"}` : "DATA_NEEDED: candle engine"; }
  function targetRoom(row) { return /PASS|OK|READY/i.test(String(row.target_potential_label || row.target_status || "")); }

  function normalizeCandles(candles) {
    return Array.isArray(candles) ? candles.map((c) => ({ open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close), volume: Number(c.volume || 0), date: c.date || c.timestamp })).filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite)) : [];
  }

  async function api(path, options = {}) {
    const response = await nativeFetch(path, options);
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = "/login";
      throw new Error("Login required");
    }
    if (!response.ok || payload.ok === false) throw new Error(payload.error || `Request failed: ${response.status}`);
    return payload;
  }

  function captureJson(response, callback) { response.clone().json().then(callback).catch(() => {}); }
  function readNumber(selector) { const value = Number(document.querySelector(selector)?.value); return Number.isFinite(value) ? value : 0; }
  function estimatedQty(row) { const capital = 100000; const price = quotePrice(row); return price > 0 ? Math.max(1, Math.floor((capital * 0.1) / price)) : 1; }
  function dateBack(days) { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function number(value) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(2) : "-"; }
  function numberValue(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n.toFixed(2) : ""; }
  function money(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? `Rs ${n.toFixed(2)}` : "DATA_NEEDED"; }
  function compact(value) { const n = Number(value); if (!Number.isFinite(n)) return "DATA_NEEDED"; if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`; if (n >= 100000) return `${(n / 100000).toFixed(1)}L`; return String(Math.round(n)); }
  function signed(value) { const n = Number(value); return Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}` : "DATA_NEEDED"; }
  function dataNeededCard(label, detail) { return `<article class="data-needed"><span>${escapeHtml(label)}</span><strong>DATA_NEEDED</strong><b>${escapeHtml(detail)}</b></article>`; }
  function escapeText(value) { return String(value ?? ""); }
  function escapeHtml(value) { return escapeText(value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/'/g, "&#39;"); }
})();