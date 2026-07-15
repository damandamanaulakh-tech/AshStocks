(() => {
  let attempts = 0;

  function tick() {
    attempts += 1;
    const dashboard = document.querySelector('[data-ash-workspace="dashboard"]');
    if (dashboard && !dashboard.classList.contains("active")) dashboard.click();

    const body = document.querySelector("#uwQueueBody");
    const runButton = document.querySelector("#runScanBtn");
    const needsRows = body && /No scanner rows available|Run scanner/i.test(body.textContent || "");
    if (needsRows && runButton && !runButton.disabled && !sessionStorage.getItem("ashstocks-workspace-scan-warmed")) {
      sessionStorage.setItem("ashstocks-workspace-scan-warmed", "1");
      runButton.click();
    }

    if (attempts < 30 && (!dashboard || needsRows)) window.setTimeout(tick, 250);
  }

  window.addEventListener("DOMContentLoaded", () => window.setTimeout(tick, 250));
})();
