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

  function hasUpstoxToken() {
    return /token visible/i.test(textOf("#upstoxLabel"));
  }

  async function autoRunUpstox(reason) {
    const now = Date.now();
    if (autoRunInFlight || now - lastAutoRunAt < 45000) return;
    autoRunInFlight = true;

    try {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const button = document.querySelector("#runUpstoxBtn");
        const universeText = textOf("#summaryGrid");
        const pageReady = button && hasUpstoxToken() && !/Loading scanner|Running scanner/i.test(textOf("#messageLine"));
        if (pageReady && !button.disabled) {
          lastAutoRunAt = Date.now();
          setLine(reason === "master" ? "NSE master loaded. Fetching Upstox candles." : "Fetching Upstox candles for ranked selection.");
          button.click();
          return;
        }
        if (pageReady && /Universe/i.test(universeText)) {
          await sleep(500);
        } else {
          await sleep(750);
        }
      }
    } finally {
      autoRunInFlight = false;
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => autoRunUpstox("startup"), 3500);
    document.querySelector("#masterPoolBtn")?.addEventListener("click", () => {
      setTimeout(() => autoRunUpstox("master"), 4500);
    });
  });
})();
