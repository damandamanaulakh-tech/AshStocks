(() => {
  let autoRunInFlight = false;
  let lastAutoRunAt = 0;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function textOf(selector) {
    return document.querySelector(selector)?.textContent || "";
  }

  function setLine(message) {
    const line = document.querySelector("#messageLine");
    if (!line) return;
    line.textContent = message;
    line.className = "alert-line";
  }

  function hasDeadMasterRows() {
    const summary = textOf("#summaryGrid");
    const body = textOf("#resultBody");
    return summary.includes("DATA_NEEDED") || body.includes("DATA_NEEDED") || body.includes("Need 253");
  }

  function hasUpstoxToken() {
    return /token visible/i.test(textOf("#upstoxLabel"));
  }

  async function autoRunUpstox(reason) {
    const now = Date.now();
    if (autoRunInFlight || now - lastAutoRunAt < 45000) return;
    autoRunInFlight = true;

    try {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const button = document.querySelector("#runUpstoxBtn");
        if (button && !button.disabled && hasUpstoxToken()) {
          if (reason === "dead-master" || hasDeadMasterRows()) {
            lastAutoRunAt = Date.now();
            setLine("Fetching Upstox historical candles for scored selection");
            button.click();
            return;
          }
        }
        await sleep(750);
      }
    } finally {
      autoRunInFlight = false;
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => autoRunUpstox("startup"), 2500);
    document.querySelector("#masterPoolBtn")?.addEventListener("click", () => {
      setTimeout(() => autoRunUpstox("dead-master"), 3500);
    });
  });
})();
