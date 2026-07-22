const OUTPUT_FILES = [
  "daily_close_by_scrip.csv",
  "nifty_daily_close.csv",
  "Q1_FII_20D_forward_return_result.csv",
  "Q1_FII_20D_summary.csv"
];

const $ = (selector) => document.querySelector(selector);

let currentStatus = null;

function yesNo(value) {
  return value ? "Yes" : "No";
}

function check(label, value) {
  return `<div class="q1-check ${value ? "good" : "bad"}">${label}: <strong>${yesNo(value)}</strong></div>`;
}

async function refreshStatus() {
  const response = await fetch("/api/q1/status");
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Status unavailable");
  currentStatus = payload.status;
  renderStatus();
}

function renderStatus() {
  const status = currentStatus;
  if (!status) return;
  $("#renderRuntime").textContent = yesNo(status.render_runtime);
  $("#keyVisible").textContent = yesNo(status.key_visible);
  $("#tokenVisible").textContent = yesNo(status.token_visible);
  $("#inputFound").textContent = yesNo(status.input_files_found);

  $("#inputStatus").innerHTML = Object.entries(status.inputs)
    .map(([file, found]) => check(file, found))
    .join("");

  $("#downloadList").innerHTML = OUTPUT_FILES.map((file) => {
    const found = status.outputs[file];
    return `
      <div class="q1-download-row">
        <span class="${found ? "positive" : "negative"}">${file}</span>
        ${found ? `<a class="text-button compact" href="/api/q1/download?file=${encodeURIComponent(file)}">Download</a>` : `<span class="pill warn">Not ready</span>`}
      </div>
    `;
  }).join("");

  $("#runQ1Btn").disabled = !status.render_runtime || !status.token_visible || !status.input_files_found;
  const output = $("#runOutput");
  if (output && output.dataset.activeRun !== "true") {
    output.textContent = [
      `Status checked: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })} IST`,
      `Render runtime: ${yesNo(status.render_runtime)}`,
      `Upstox key: ${yesNo(status.key_visible)}`,
      `Upstox token: ${yesNo(status.token_visible)}`,
      `Input files: ${yesNo(status.input_files_found)}`,
      `Outputs ready: ${Object.values(status.outputs || {}).filter(Boolean).length}/${OUTPUT_FILES.length}`
    ].join("\n");
  }
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  $("#toastRegion").appendChild(toast);
  setTimeout(() => toast.remove(), 3600);
}

async function uploadInputs(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData();
  for (const input of form.querySelectorAll("input[type='file']")) {
    if (input.files[0]) formData.append(input.name, input.files[0], input.name);
  }
  const response = await fetch("/api/q1/upload", { method: "POST", body: formData });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Upload failed");
  currentStatus = payload.status;
  renderStatus();
  form.reset();
  showToast("Q1 inputs uploaded");
}

async function runFetch() {
  $("#runOutput").dataset.activeRun = "true";
  $("#runOutput").textContent = "Starting Render-side historical fetch...";
  const response = await fetch("/api/q1/run-upstox-fetch", { method: "POST" });
  const payload = await response.json();
  $("#runOutput").textContent = JSON.stringify(payload, null, 2);
  if (!response.ok || !payload.ok) {
    currentStatus = payload.status || currentStatus;
    renderStatus();
    showToast(payload.error || "Run blocked");
    return;
  }
  currentStatus = payload.status;
  renderStatus();
  showToast("Q1 outputs generated");
}

document.addEventListener("DOMContentLoaded", async () => {
  if (window.lucide) window.lucide.createIcons();
  $("#refreshStatusBtn").addEventListener("click", () => refreshStatus().catch((error) => showToast(error.message)));
  $("#q1UploadForm").addEventListener("submit", (event) => uploadInputs(event).catch((error) => showToast(error.message)));
  $("#runQ1Btn").addEventListener("click", () => runFetch().catch((error) => showToast(error.message)));
  await refreshStatus().catch((error) => {
    $("#runOutput").textContent = error.message;
  });
});
