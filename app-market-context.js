(() => {
  const state = { loaded: false, timer: null };

  function $(selector) {
    return document.querySelector(selector);
  }

  async function api(path) {
    const response = await fetch(path);
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = "/login";
      throw new Error("Login required");
    }
    if (!response.ok || payload.ok === false) throw new Error(payload.error || `Request failed: ${response.status}`);
    return payload;
  }

  function waitForDashboard() {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        const view = $("#paperTraderView");
        if (view) return resolve(view);
        if (Date.now() - started > 10000) return reject(new Error("Trading dashboard did not mount"));
        setTimeout(tick, 120);
      };
      tick();
    });
  }

  function installShell(view) {
    if ($("#marketContextLayer")) return;
    const shell = document.createElement("section");
    shell.id = "marketContextLayer";
    shell.className = "market-context-layer";
    shell.innerHTML = `
      <div class="market-strip" id="marketCards"></div>
      <div class="market-dashboard-grid">
        <section class="panel market-insight-panel">
          <div class="panel-header"><h3>Market Context</h3><span id="marketContextStamp">Loading</span></div>
          <div id="marketContextInsight" class="market-insight-copy"></div>
        </section>
        <section class="panel market-insight-panel">
          <div class="panel-header"><h3>Breadth / Risk</h3><span>Online + Paper</span></div>
          <div id="marketBreadth" class="breadth-grid"></div>
        </section>
      </div>
    `;
    const metrics = $("#paperTraderMetrics");
    if (metrics) view.insertBefore(shell, metrics);
    else view.prepend(shell);
  }

  async function loadMarketContext() {
    try {
      const payload = await api(`/api/market-context?ts=${Date.now()}`);
      render(payload);
      state.loaded = true;
    } catch (error) {
      renderError(error);
    }
  }

  function render(payload) {
    const cards = Array.isArray(payload.cards) ? payload.cards : [];
    const cardHost = $("#marketCards");
    if (cardHost) {
      cardHost.innerHTML = cards.map((card) => `
        <article class="market-card ${escapeHtml(card.tone || "neutral")}">
          <div><span>${escapeHtml(card.label)}</span><small>${escapeHtml(card.symbol || "")}</small></div>
          <strong>${formatMarketPrice(card)}</strong>
          <b>${formatSigned(card.change)} ${formatPct(card.change_pct)}</b>
          ${sparkline(card.spark || [])}
        </article>
      `).join("");
    }

    const stamp = $("#marketContextStamp");
    if (stamp) stamp.textContent = payload.asOf ? new Date(payload.asOf).toLocaleTimeString() : "Live context";

    const insight = payload.insight || {};
    const insightHost = $("#marketContextInsight");
    if (insightHost) {
      insightHost.innerHTML = `
        <strong>${escapeHtml(insight.bias || "Context loading")}</strong>
        <p>${escapeHtml((insight.notes || []).join(". ") || "Fetching online market context.")}</p>
        <div class="confidence-bar"><span style="width:${clamp(insight.confidence || 0, 0, 100)}%"></span></div>
        <small>Confidence ${formatNumber(insight.confidence)} / 100</small>
      `;
    }

    const breadth = payload.breadth || {};
    const breadthHost = $("#marketBreadth");
    if (breadthHost) {
      breadthHost.innerHTML = `
        <div class="breadth-tile"><strong>${valueOrDash(breadth.advancing)}</strong><span>Advancing</span></div>
        <div class="breadth-tile danger"><strong>${valueOrDash(breadth.declining)}</strong><span>Declining</span></div>
        <div class="breadth-tile"><strong>${valueOrDash(breadth.unchanged)}</strong><span>Unchanged</span></div>
        <div class="breadth-tile wide"><strong>${escapeHtml(payload.engine || "market-context")}</strong><span>${escapeHtml((payload.feeds || []).join(" + "))}</span></div>
      `;
    }
  }

  function renderError(error) {
    const insightHost = $("#marketContextInsight");
    if (insightHost) insightHost.innerHTML = `<strong>Market context unavailable</strong><p>${escapeHtml(error.message || String(error))}</p>`;
  }

  function sparkline(values) {
    const nums = values.map(Number).filter(Number.isFinite);
    if (nums.length < 2) return '<div class="sparkline empty"></div>';
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const span = Math.max(0.0001, max - min);
    const points = nums.map((value, index) => `${(index / Math.max(1, nums.length - 1)) * 100},${36 - ((value - min) / span) * 32}`).join(" ");
    return `<svg class="sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" /></svg>`;
  }

  function formatMarketPrice(card) {
    const value = Number(card.price);
    if (!Number.isFinite(value)) return "-";
    if (card.key === "usdinr") return value.toFixed(2);
    if (card.key === "gold") return value.toLocaleString("en-IN", { maximumFractionDigits: 1 });
    return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }

  function formatSigned(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    return `${number >= 0 ? "+" : ""}${number.toFixed(2)}`;
  }

  function formatPct(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return `(${number >= 0 ? "+" : ""}${number.toFixed(2)}%)`;
  }

  function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(0) : "-";
  }

  function valueOrDash(value) {
    return Number.isFinite(Number(value)) ? String(value) : "-";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  window.addEventListener("DOMContentLoaded", async () => {
    try {
      const view = await waitForDashboard();
      installShell(view);
      await loadMarketContext();
      state.timer = setInterval(loadMarketContext, 120000);
    } catch (error) {
      renderError(error);
    }
  });
})();
