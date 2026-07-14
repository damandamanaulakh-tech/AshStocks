(() => {
  const TOTAL_PARAMETERS = 2000;
  const FAMILIES = [
    { name: "Universe", range: [1, 120], score: ({ summary }) => summary.scanned ? 100 : 0, detail: ({ summary }) => `${summary.scanned || 0} rows scanned` },
    { name: "Data Coverage", range: [121, 260], score: ({ top, summary }) => top.parameter_coverage ?? summary.avg_parameter_coverage ?? 0, detail: ({ top, summary }) => `coverage ${number(top.parameter_coverage ?? summary.avg_parameter_coverage)}` },
    { name: "Price Trend", range: [261, 400], score: ({ top }) => top.momentum_score || top.paper_score || 0, detail: ({ top }) => `momentum ${number(top.momentum_score || top.paper_score)}` },
    { name: "Relative Strength", range: [401, 540], score: ({ top }) => top.score || top.paper_score || 0, detail: ({ top }) => `scanner ${number(top.score || top.paper_score)}` },
    { name: "Liquidity", range: [541, 680], score: ({ top }) => Math.min(100, Number(top.rupee_turnover_cr || 0) * 4 || top.paper_score || 0), detail: ({ top }) => `turnover ${number(top.rupee_turnover_cr)} cr` },
    { name: "Volume", range: [681, 800], score: ({ top }) => Math.min(100, Number(top.vol_63d_pct || top.vol63 || 0) * 3 || 0), detail: ({ top }) => `vol ${number(top.vol_63d_pct || top.vol63)}` },
    { name: "Target Room", range: [801, 920], score: ({ top }) => Math.min(100, Number(top.target_pct || 0) * 3), detail: ({ top }) => `target ${number(top.target_pct)}%` },
    { name: "Risk Safety", range: [921, 1040], score: ({ top, summary }) => Math.max(0, 100 - Number(top.regime_risk ?? summary.avg_regime_risk ?? 100)), detail: ({ top, summary }) => `risk ${number(top.regime_risk ?? summary.avg_regime_risk)}` },
    { name: "FII/DII Flow", range: [1041, 1160], score: ({ top }) => top.flow_score || 0, detail: ({ top }) => `flow ${number(top.flow_score)}` },
    { name: "Event Lift", range: [1161, 1280], score: ({ overlay }) => Array.isArray(overlay.trigger_rows) && overlay.trigger_rows.length ? 72 : 0, detail: ({ overlay }) => `${overlay.trigger_rows?.length || 0} triggers` },
    { name: "Hot Pocket", range: [1281, 1400], score: ({ top }) => top.hot_pocket_score || top.theme_heat || 0, detail: ({ top }) => `theme ${number(top.hot_pocket_score || top.theme_heat)}` },
    { name: "Advisor Ready", range: [1401, 1520], score: ({ summary }) => summary.candidates ? Math.min(100, Number(summary.buy_queue || 0) / Math.max(1, Number(summary.candidates || 1)) * 100) : 0, detail: ({ summary }) => `${summary.buy_queue || 0}/${summary.candidates || 0} selected` },
    { name: "Entry Target Stop", range: [1521, 1640], score: ({ top }) => top.close && (top.target_price || top.target1) && top.stop_price ? 100 : 0, detail: ({ top }) => top.stop_price ? "ready" : "waiting" },
    { name: "Watchlist Rotation", range: [1641, 1760], score: ({ plan }) => Object.keys(plan.watchlists || {}).length ? 80 : 0, detail: ({ plan }) => `${Object.keys(plan.watchlists || {}).length} buckets` },
    { name: "Sell Replace", range: [1761, 1880], score: ({ plan }) => plan ? 70 : 0, detail: ({ summary }) => `${summary.sell_queue || 0} replace` },
    { name: "Paper Safety", range: [1881, 2000], score: ({ plan }) => plan.paper_only && plan.live_orders === false ? 100 : 0, detail: ({ plan }) => plan.paper_only ? "paper only" : "check mode" }
  ];

  let latestPlan = null;
  let latestStatus = null;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = String(args[0] || "");
    if (url.includes("/api/paper-trader/run") || url.includes("/api/paper-trader/status")) {
      response.clone().json().then((payload) => {
        if (url.includes("/api/paper-trader/status")) {
          latestStatus = payload;
          latestPlan = payload.status?.last_plan || latestPlan;
        } else {
          latestPlan = payload?.ok === false ? latestPlan : payload;
        }
        scheduleRender();
      }).catch(() => {});
    }
    return response;
  };

  window.addEventListener("DOMContentLoaded", () => {
    scheduleRender();
    const observer = new MutationObserver(() => scheduleRender());
    observer.observe(document.body, { childList: true, subtree: true });
  });

  function scheduleRender() {
    window.requestAnimationFrame(() => {
      ensurePanel();
      renderPiano(latestPlan, latestStatus);
    });
  }

  function ensurePanel() {
    if (document.querySelector("#parameterPianoPanel")) return;
    const view = document.querySelector("#paperTraderView");
    const metrics = document.querySelector("#paperTraderMetrics");
    if (!view || !metrics) return;
    const panel = document.createElement("section");
    panel.className = "panel parameter-piano-panel";
    panel.id = "parameterPianoPanel";
    panel.innerHTML = `
      <div class="panel-header">
        <h3>Parameter Piano</h3>
        <span id="parameterPianoCount">0 / ${TOTAL_PARAMETERS}</span>
      </div>
      <div class="parameter-piano-legend" aria-label="Parameter state legend">
        <span><i class="hit"></i>Hit</span>
        <span><i class="warn"></i>Weak</span>
        <span><i class="block"></i>Blocked</span>
        <span><i class="idle"></i>Waiting</span>
      </div>
      <div id="parameterPianoRows" class="parameter-piano-rows"></div>
    `;
    metrics.after(panel);
  }

  function renderPiano(plan, statusPayload) {
    const target = document.querySelector("#parameterPianoRows");
    if (!target) return;
    const summary = plan?.summary || {};
    const top = plan?.top_ranked?.[0] || plan?.buy_queue?.[0] || {};
    const overlay = plan?.intelligence_overlay || {};
    const context = { plan: plan || {}, summary, top, overlay, statusPayload: statusPayload || {} };
    let hitTotal = 0;
    const rows = FAMILIES.map((family) => {
      const start = family.range[0];
      const end = family.range[1];
      const total = end - start + 1;
      const rawScore = clamp(Number(family.score(context)) || 0, 0, 100);
      const active = Math.round(total * rawScore / 100);
      hitTotal += active;
      const familyState = stateFor(family.name, rawScore, summary, top);
      const keys = [];
      for (let number = start; number <= end; number += 1) {
        const index = number - start;
        const state = index < active ? familyState : blockerState(family.name, summary, top);
        keys.push(`<button type="button" class="piano-key ${state}" title="P${number}: ${escapeHtml(family.name)} | ${escapeHtml(family.detail(context))}" aria-label="Parameter ${number} ${escapeHtml(family.name)} ${state}">${number}</button>`);
      }
      return `<article class="piano-family"><div class="piano-family-head"><strong>${escapeHtml(family.name)}</strong><span>${start}-${end}</span><b>${active}/${total}</b></div><div class="piano-key-grid">${keys.join("")}</div></article>`;
    }).join("");
    const count = document.querySelector("#parameterPianoCount");
    if (count) count.textContent = `${hitTotal} / ${TOTAL_PARAMETERS}`;
    target.innerHTML = rows;
  }

  function stateFor(name, score, summary, top) {
    if (name === "Risk Safety" && Number(top.regime_risk ?? summary.avg_regime_risk ?? 0) >= 60) return "block";
    if (summary.data_needed && (name === "Data Coverage" || name === "Universe")) return "block";
    if (score >= 70) return "hit";
    if (score >= 35) return "warn";
    if (score > 0) return "warn";
    return "idle";
  }

  function blockerState(name, summary, top) {
    if (summary.data_needed && name === "Data Coverage") return "block";
    if (name === "Risk Safety" && Number(top.regime_risk ?? summary.avg_regime_risk ?? 0) >= 60) return "block";
    return "idle";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function number(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "Pending";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }
})();
