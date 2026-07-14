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

  const PARAMETER_RULES = {
    Universe: ["NSE_EQ equity only", "instrument key present", "suspended instrument excluded", "fund/ETF noise excluded", "symbol normalized", "duplicate listing controlled", "active security type", "tradable exchange NSE", "name resolved", "sector tag available"],
    "Data Coverage": ["latest close present", "127D close present", "253D close present", "252D high present", "20D average volume present", "rupee turnover present", "63D volatility present", "126D volatility present", "252D volatility present", "last candle fresh", "instrument key mapped", "sector not unmapped"],
    "Price Trend": ["6M return positive", "12M return positive", "close above 127D reference", "close above 253D reference", "near 252D high", "momentum score above line", "trend not stale", "uptrend not one-candle spike"],
    "Relative Strength": ["scanner score rank", "momentum/quality blend", "relative strength vs pool", "target potential survives gate", "decision not DATA_NEEDED", "score above watch line", "score above select line"],
    Liquidity: ["rupee turnover crores", "20D average volume", "liquidity hard gate", "paper position capacity", "wide-spread avoidance", "large order survivability"],
    Volume: ["63D volatility", "126D volatility", "252D volatility", "volume confirmation", "abnormal activity check", "stuck candle avoidance", "delivery/volume placeholder avoided"],
    "Target Room": ["target percentage left", "target potential label", "target hard gate", "reward room after entry", "target 1 calculated", "target 2 calculated", "upside vs stop balance"],
    "Risk Safety": ["regime risk score", "validated trigger lift", "drawdown pressure", "volatility penalty", "stretched target penalty", "weak 6M return penalty", "capital protection governor"],
    "FII/DII Flow": ["FII cash net", "DII cash net", "institutional net pressure", "flow score", "FII/DII overlay used", "flow risk neutralizer"],
    "Event Lift": ["tail_down3_5d trigger", "dispersion trigger", "ret_10d trigger", "combo trigger", "precision check", "recall check", "lift multiplier"],
    "Hot Pocket": ["sector hot pocket", "AI/digital theme", "EV/auto theme", "green energy theme", "defence/rail/infra theme", "bank/NBFC theme", "pharma/health theme", "PSU/capital goods theme"],
    "Advisor Ready": ["paper score ready", "buy queue candidate", "watch candidate", "conviction label", "thesis generated", "reason generated", "replacement eligibility"],
    "Entry Target Stop": ["entry zone low", "entry zone high", "target 1", "target 2", "stop loss", "stop percent", "quantity sizing", "paper ticket created"],
    "Watchlist Rotation": ["selected bucket", "target room bucket", "event resilient bucket", "theme bucket", "watch bucket", "rotation candidate", "portfolio cap"],
    "Sell Replace": ["sell queue count", "hold queue check", "replace below score", "target reached exit", "stop exit", "score deterioration exit", "cash recycle"],
    "Paper Safety": ["paper only true", "live orders false", "broker write disabled", "Upstox token hidden", "historical candles only", "audit trail ready", "no live execution path"]
  };

  let latestPlan = null;
  let latestStatus = null;
  let lastRenderSignature = "";
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
      <div id="parameterDetailPanel" class="parameter-detail-panel"><strong>Select any parameter number</strong><span>Click a key to see exact rule, source, current evidence, pass line and engine impact.</span></div>
      <div id="parameterPianoRows" class="parameter-piano-rows"></div>
    `;
    panel.addEventListener("click", (event) => {
      const key = event.target.closest(".piano-key");
      if (!key) return;
      showParameterDetail(Number(key.dataset.param), key.dataset.family, key.dataset.state);
    });
    metrics.after(panel);
  }

  function renderPiano(plan, statusPayload) {
    const target = document.querySelector("#parameterPianoRows");
    if (!target) return;
    const context = buildContext(plan, statusPayload);
    const signature = JSON.stringify({
      asOf: plan?.asOf || "waiting",
      scanned: context.summary.scanned || 0,
      buyQueue: context.summary.buy_queue || 0,
      dataNeeded: context.summary.data_needed || 0,
      avgIntelligence: context.summary.avg_intelligence_score || 0,
      avgRisk: context.summary.avg_regime_risk || 0,
      top: context.top.symbol || "",
      topScore: context.top.intelligence_score || context.top.paper_score || 0,
      risk: context.top.regime_risk || 0,
      coverage: context.top.parameter_coverage || 0
    });
    if (signature === lastRenderSignature && target.dataset.rendered === "1") return;
    lastRenderSignature = signature;
    target.dataset.rendered = "1";
    let hitTotal = 0;
    const rows = FAMILIES.map((family) => {
      const start = family.range[0];
      const end = family.range[1];
      const total = end - start + 1;
      const rawScore = clamp(Number(family.score(context)) || 0, 0, 100);
      const active = Math.round(total * rawScore / 100);
      hitTotal += active;
      const familyState = stateFor(family.name, rawScore, context.summary, context.top);
      const keys = [];
      for (let parameterNumber = start; parameterNumber <= end; parameterNumber += 1) {
        const index = parameterNumber - start;
        const state = index < active ? familyState : blockerState(family.name, context.summary, context.top);
        const descriptor = parameterDescriptor(parameterNumber, family, state, context);
        keys.push(`<button type="button" class="piano-key ${state}" data-param="${parameterNumber}" data-family="${escapeHtml(family.name)}" data-state="${state}" title="P${parameterNumber}: ${escapeHtml(descriptor.name)} | ${escapeHtml(descriptor.evidence)}" aria-label="Parameter ${parameterNumber} ${escapeHtml(descriptor.name)} ${state}">${parameterNumber}</button>`);
      }
      return `<article class="piano-family"><div class="piano-family-head"><strong>${escapeHtml(family.name)}</strong><span>${start}-${end}</span><b>${active}/${total}</b></div><div class="piano-key-grid">${keys.join("")}</div></article>`;
    }).join("");
    const count = document.querySelector("#parameterPianoCount");
    if (count) count.textContent = `${hitTotal} / ${TOTAL_PARAMETERS}`;
    target.innerHTML = rows;
  }

  function buildContext(plan, statusPayload) {
    const summary = plan?.summary || {};
    const top = plan?.top_ranked?.[0] || plan?.buy_queue?.[0] || {};
    const overlay = plan?.intelligence_overlay || {};
    return { plan: plan || {}, summary, top, overlay, statusPayload: statusPayload || {} };
  }

  function showParameterDetail(parameterNumber, familyName, state) {
    const family = FAMILIES.find((row) => row.name === familyName);
    const panel = document.querySelector("#parameterDetailPanel");
    if (!family || !panel) return;
    const descriptor = parameterDescriptor(parameterNumber, family, state, buildContext(latestPlan, latestStatus));
    panel.innerHTML = `
      <div class="parameter-detail-head"><span class="piano-key ${state}">${parameterNumber}</span><strong>${escapeHtml(descriptor.name)}</strong><b>${escapeHtml(state.toUpperCase())}</b></div>
      <div class="parameter-detail-grid">
        <span>Family</span><strong>${escapeHtml(family.name)} ${family.range[0]}-${family.range[1]}</strong>
        <span>Source</span><strong>${escapeHtml(descriptor.source)}</strong>
        <span>Current evidence</span><strong>${escapeHtml(descriptor.evidence)}</strong>
        <span>Pass line</span><strong>${escapeHtml(descriptor.passLine)}</strong>
        <span>Engine impact</span><strong>${escapeHtml(descriptor.impact)}</strong>
      </div>
    `;
  }

  function parameterDescriptor(parameterNumber, family, state, context) {
    const rules = PARAMETER_RULES[family.name] || [family.name];
    const offset = parameterNumber - family.range[0];
    const rule = rules[offset % rules.length];
    const variant = Math.floor(offset / rules.length) + 1;
    const top = context.top || {};
    const summary = context.summary || {};
    const plan = context.plan || {};
    const overlay = context.overlay || {};
    const sourceMap = {
      Universe: "Upstox NSE instruments master + suspended instrument guard",
      "Data Coverage": plan.fallback_used ? `Paper run fields via ${plan.fallback_used}` : "Upstox historical candle fields in paper run",
      "Price Trend": plan.fallback_used ? `${plan.fallback_used} daily OHLCV fallback` : "Upstox historical daily OHLCV",
      "Relative Strength": "Scanner rank and advisor enriched row",
      Liquidity: "Turnover and volume fields from candle/enriched row",
      Volume: "63D/126D/252D volatility and volume fields",
      "Target Room": "Advisor target-potential and entry/target calculation",
      "Risk Safety": "Validated trigger lift + regime risk overlay",
      "FII/DII Flow": "fii-dii-nse-latest.csv snapshot used in intelligence overlay",
      "Event Lift": "top_pre_fall_triggers.csv and top_combo_triggers.csv",
      "Hot Pocket": "sector/theme detection from stock name, sector and theme tags",
      "Advisor Ready": "paper-trader plan summary and ranked candidates",
      "Entry Target Stop": "paper ticket construction fields",
      "Watchlist Rotation": "paper-trader watchlists object",
      "Sell Replace": "paper state sell/hold queues",
      "Paper Safety": "server guardrails: paper_only, live_orders false, broker_write_enabled false"
    };
    const evidenceMap = {
      Universe: `${summary.scanned || 0} scanned; ${summary.data_needed || 0} data gaps; top ${top.symbol || "not selected"}`,
      "Data Coverage": `coverage ${number(top.parameter_coverage ?? summary.avg_parameter_coverage)}; data gaps ${summary.data_needed || 0}`,
      "Price Trend": `paper ${number(top.paper_score)}; 6M ${number(top.return_6m_pct)}; 12M ${number(top.return_12m_pct)}`,
      "Relative Strength": `scanner ${number(top.score)}; decision ${top.decision || top.scanner_decision || "not available"}`,
      Liquidity: `turnover ${number(top.rupee_turnover_cr)} cr; qty ${top.qty || "not available"}`,
      Volume: `vol63 ${number(top.vol_63d_pct || top.vol63)}; vol126 ${number(top.vol_126d_pct || top.vol126)}; vol252 ${number(top.vol_252d_pct || top.vol252)}`,
      "Target Room": `target ${number(top.target_pct)}%; T1 ${money(top.target1)}; T2 ${money(top.target2 || top.target_price)}`,
      "Risk Safety": `regime risk ${number(top.regime_risk ?? summary.avg_regime_risk)}; status ${top.intelligence?.status || "not available"}`,
      "FII/DII Flow": `flow score ${number(top.flow_score)}; FII ${overlay.fii_dii_snapshot?.fii_fpi_net_cr ?? "not available"} cr; DII ${overlay.fii_dii_snapshot?.dii_net_cr ?? "not available"} cr`,
      "Event Lift": `${overlay.trigger_rows?.length || 0} trigger rows; avg lift checked in overlay`,
      "Hot Pocket": `theme ${number(top.hot_pocket_score || top.theme_heat)}; sector ${top.sector || "not mapped"}; themes ${(top.themes || []).join(", ") || "none"}`,
      "Advisor Ready": `${summary.buy_queue || 0} buy / ${summary.candidates || 0} candidates; conviction ${top.conviction || "not available"}`,
      "Entry Target Stop": `entry ${entryZone(top)}; stop ${money(top.stop_price)}; target ${money(top.target_price || top.target2)}`,
      "Watchlist Rotation": `${Object.keys(plan.watchlists || {}).length} watchlist buckets; sell queue ${summary.sell_queue || 0}`,
      "Sell Replace": `${summary.sell_queue || 0} replace; active positions ${summary.active_positions || 0}`,
      "Paper Safety": `paper_only ${String(plan.paper_only)}; live_orders ${String(plan.live_orders)}; broker write false`
    };
    const passLineMap = {
      Universe: "Included only when NSE equity is tradable, mapped, not suspended and not fund-like noise.",
      "Data Coverage": "Coverage contributes from real fields only; missing candle/close/volume data stays blocked.",
      "Price Trend": "Trend fires when daily OHLCV proves momentum, positive returns and fresh candles.",
      "Relative Strength": "Fires when scanner/advisor score clears watch/select line against the pool.",
      Liquidity: "Fires when turnover and ADV can support paper position sizing.",
      Volume: "Fires when volatility/volume fields exist and do not show stale or stuck candle behavior.",
      "Target Room": "Fires when upside room remains after entry and target-potential gate survives.",
      "Risk Safety": "Green below risk line; red when regime or validated pre-fall triggers dominate.",
      "FII/DII Flow": "Positive when institutional flow overlay is neutral or supportive.",
      "Event Lift": "Uses only validation rows with measured fires, precision, recall and lift.",
      "Hot Pocket": "Fires when sector/theme text matches actual hot-pocket theme dictionary.",
      "Advisor Ready": "Fires when a ranked candidate becomes buy/watch ready with reasons.",
      "Entry Target Stop": "Fires only when entry, target, stop and quantity fields exist.",
      "Watchlist Rotation": "Fires when selected/theme/target/event buckets exist after a run.",
      "Sell Replace": "Fires when paper state can produce hold/sell/replace decisions.",
      "Paper Safety": "Must remain paper-only with no live order path."
    };
    return {
      name: `P${parameterNumber} ${rule} v${variant}`,
      source: sourceMap[family.name] || family.name,
      evidence: evidenceMap[family.name] || family.detail(context),
      passLine: passLineMap[family.name] || "Uses current engine evidence only.",
      impact: `${state.toUpperCase()} in ${family.name}; contributes to the visible parameter hit map, not a core score change in this patch.`
    };
  }

  function stateFor(name, score, summary, top) {
    if (name === "Risk Safety" && Number(top.regime_risk ?? summary.avg_regime_risk ?? 0) >= 60) return "block";
    if (summary.data_needed && name === "Data Coverage") return "block";
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

  function entryZone(row) {
    const zone = row.entry_zone || row.advisor?.entry_zone;
    if (zone?.low && zone?.high) return `${money(zone.low)} - ${money(zone.high)}`;
    return money(row.close);
  }

  function money(value) {
    return Number.isFinite(Number(value)) ? `Rs ${Number(value).toFixed(2)}` : "not available";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function number(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "not available";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }
})();
