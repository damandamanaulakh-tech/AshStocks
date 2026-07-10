"""Minimal pure-ASGI AshStocks API for Render/AWS deployment checks.

No FastAPI/Pydantic dependency here. This keeps the first deploy lightweight and
avoids pydantic-core build failures on Render's Python image.
"""

from __future__ import annotations

import asyncio
import csv
import html
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs


CONFIG = {
    "min_select_score": 70.0,
    "min_watch_score": 55.0,
    "target_potential_pct": 15.0,
    "max_position_pct": 0.025,
    "paper_only": True,
    "broker_write_enabled": False,
    "max_stale_days": 7,
    "min_avg_volume_shares": 200_000,
    "min_rupee_volume_cr": 5.0,
    "correlation_threshold": 0.85,
    "quality_blend_pct": 0.35,
}


SPEC = {
    "engine": "ASHSTOCKS_SELECTION_ENGINE_v0_1",
    "status": "DESIGNED_NOT_FULLY_BACKTESTED",
    "score_formula": "FINAL_SCORE = 0.65 * MOMENTUM_SCORE + 0.35 * QUALITY_SCORE",
    "momentum_score": "clip(50 + (((6M_RETURN/6M_VOL) + (12M_RETURN/12M_VOL))/2) * 25, 0, 100)",
    "quality_score": "(LOW_VOL_SCORE + LIQUIDITY_QUALITY) / 2",
    "select": "FINAL_SCORE >= 70 and all hard gates pass",
    "watch": "55 <= FINAL_SCORE < 70 and all hard gates pass",
    "blocked": "any hard gate fails",
    "data_needed": "missing required candles/data",
    "max_positions": 50,
    "max_position_pct": 0.025,
    "target_potential_pct": 15,
    "hard_gates": [
        "253 clean daily candles for score",
        "6M absolute momentum > 0%",
        "last candle age <= 7 days",
        "ADV20 >= 200000 shares",
        "5D avg rupee turnover >= 5 crore",
        "latest OHLC not all equal",
        "correlation with existing holding <= 0.85",
    ],
}


ROOT_DIR = Path(__file__).resolve().parents[1]
Q1_INPUT_DIR = ROOT_DIR / "data" / "q1_inputs"
Q1_OUTPUT_DIR = ROOT_DIR / "data" / "q1_outputs"
Q1_REQUIRED_INPUTS = (
    "fii_symbol_daily.csv",
    "Q1_FII_20D_ranked_top_bottom_deciles_READY_FOR_PRICE_JOIN.csv",
)
Q1_OUTPUT_FILES = (
    "daily_close_by_scrip.csv",
    "nifty_daily_close.csv",
    "Q1_FII_20D_forward_return_result.csv",
    "Q1_FII_20D_summary.csv",
)
Q1_ALLOWED_UPLOADS = set(Q1_REQUIRED_INPUTS)


def _json_response(payload: dict[str, Any], status: int = 200) -> tuple[int, list[tuple[bytes, bytes]], bytes]:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = [
        (b"content-type", b"application/json; charset=utf-8"),
        (b"content-length", str(len(body)).encode("ascii")),
    ]
    return status, headers, body


def _text_response(
    body_text: str,
    *,
    status: int = 200,
    content_type: str = "text/html; charset=utf-8",
    extra_headers: list[tuple[bytes, bytes]] | None = None,
) -> tuple[int, list[tuple[bytes, bytes]], bytes]:
    body = body_text.encode("utf-8")
    headers = [
        (b"content-type", content_type.encode("ascii")),
        (b"content-length", str(len(body)).encode("ascii")),
    ]
    if extra_headers:
        headers.extend(extra_headers)
    return status, headers, body


def _redirect(location: str) -> tuple[int, list[tuple[bytes, bytes]], bytes]:
    return 303, [(b"location", location.encode("utf-8")), (b"content-length", b"0")], b""


def _is_render() -> bool:
    return bool(os.getenv("RENDER") or os.getenv("RENDER_SERVICE_ID") or os.getenv("RENDER_EXTERNAL_URL"))


def _file_status(directory: Path, names: tuple[str, ...]) -> dict[str, bool]:
    return {name: (directory / name).is_file() for name in names}


def _q1_status() -> dict[str, Any]:
    token_visible = bool(os.getenv("UPSTOX_ACCESS_TOKEN"))
    inputs = _file_status(Q1_INPUT_DIR, Q1_REQUIRED_INPUTS)
    outputs = _file_status(Q1_OUTPUT_DIR, Q1_OUTPUT_FILES)
    return {
        "token_visible": token_visible,
        "render_runtime": _is_render(),
        "input_files": inputs,
        "input_files_found": all(inputs.values()),
        "output_files": outputs,
        "output_files_found": all(outputs.values()),
        "safety": {
            "token_printed": False,
            "live_orders": False,
            "fetch_scope": "historical_candles_only",
        },
    }


def _yes_no(value: bool) -> str:
    return "yes" if value else "no"


def _status_list(items: dict[str, bool]) -> str:
    rows = []
    for name, found in items.items():
        rows.append(f"<li><code>{html.escape(name)}</code>: <strong>{_yes_no(found)}</strong></li>")
    return "\n".join(rows)


def _message_from_query(scope: dict[str, Any]) -> str:
    query = scope.get("query_string", b"").decode("utf-8", "replace")
    values = parse_qs(query)
    msg = values.get("msg", [""])[0]
    return html.escape(msg)


def _q1_page(scope: dict[str, Any]) -> tuple[int, list[tuple[bytes, bytes]], bytes]:
    status = _q1_status()
    message = _message_from_query(scope)
    downloads = []
    for filename, found in status["output_files"].items():
        if found:
            downloads.append(f'<li><a href="/api/q1/download/{html.escape(filename)}">{html.escape(filename)}</a></li>')
        else:
            downloads.append(f"<li><span>{html.escape(filename)}</span> <strong>missing</strong></li>")

    disabled = "" if status["render_runtime"] else " disabled"
    run_note = "" if status["render_runtime"] else "<p><strong>Run disabled outside Render.</strong></p>"
    message_html = f'<p class="notice">{message}</p>' if message else ""
    body = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AshStocks Q1 Upstox Fetch</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 32px; color: #17202a; background: #f7f9fb; }}
    main {{ max-width: 980px; margin: 0 auto; background: #fff; border: 1px solid #d8dee4; padding: 24px; }}
    h1 {{ margin-top: 0; }}
    section {{ border-top: 1px solid #e5e7eb; padding-top: 18px; margin-top: 18px; }}
    code {{ background: #eef2f6; padding: 2px 5px; }}
    input, button {{ font-size: 1rem; }}
    button {{ padding: 8px 12px; cursor: pointer; }}
    button[disabled] {{ cursor: not-allowed; opacity: .55; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }}
    .tile {{ border: 1px solid #d8dee4; padding: 12px; background: #fbfdff; }}
    .notice {{ border-left: 4px solid #2f81f7; background: #eef6ff; padding: 10px; }}
    .safety {{ color: #57606a; }}
  </style>
</head>
<body>
<main>
  <h1>AshStocks Q1 Upstox Fetch</h1>
  {message_html}
  <section class="grid">
    <div class="tile">Render runtime: <strong>{_yes_no(status["render_runtime"])}</strong></div>
    <div class="tile">Token visible: <strong>{_yes_no(status["token_visible"])}</strong></div>
    <div class="tile">Input files found: <strong>{_yes_no(status["input_files_found"])}</strong></div>
    <div class="tile">Output files found: <strong>{_yes_no(status["output_files_found"])}</strong></div>
  </section>
  <section>
    <h2>Upload inputs</h2>
    <form action="/api/q1/upload" method="post" enctype="multipart/form-data">
      <p><label><code>fii_symbol_daily.csv</code><br><input type="file" name="fii_symbol_daily.csv" accept=".csv,text/csv"></label></p>
      <p><label><code>Q1_FII_20D_ranked_top_bottom_deciles_READY_FOR_PRICE_JOIN.csv</code><br><input type="file" name="Q1_FII_20D_ranked_top_bottom_deciles_READY_FOR_PRICE_JOIN.csv" accept=".csv,text/csv"></label></p>
      <button type="submit">Upload Q1 inputs</button>
    </form>
  </section>
  <section>
    <h2>Inputs</h2>
    <ul>{_status_list(status["input_files"])}</ul>
  </section>
  <section>
    <h2>Run Render fetch</h2>
    {run_note}
    <form action="/api/q1/run-upstox-fetch" method="post">
      <button type="submit"{disabled}>Run historical candle fetch</button>
    </form>
  </section>
  <section>
    <h2>Downloads</h2>
    <ul>{''.join(downloads)}</ul>
  </section>
  <section class="safety">
    <h2>Safety</h2>
    <ul>
      <li>Never prints or returns <code>UPSTOX_ACCESS_TOKEN</code>.</li>
      <li>Uses <code>os.getenv("UPSTOX_ACCESS_TOKEN")</code> inside the Render process.</li>
      <li>No live orders. Historical candle fetch only.</li>
      <li><code>.env</code> and generated Q1 CSVs are ignored.</li>
    </ul>
  </section>
</main>
</body>
</html>"""
    return _text_response(body)


async def _read_body(receive) -> bytes:
    chunks = []
    more = True
    while more:
        message = await receive()
        if message.get("type") != "http.request":
            break
        chunks.append(message.get("body", b""))
        more = message.get("more_body", False)
    return b"".join(chunks)


def _header(scope: dict[str, Any], name: bytes) -> str:
    for key, value in scope.get("headers", []):
        if key.lower() == name:
            return value.decode("latin-1")
    return ""


def _parse_multipart(body: bytes, content_type: str) -> dict[str, bytes]:
    marker = "boundary="
    if marker not in content_type:
        raise ValueError("missing multipart boundary")
    boundary = content_type.split(marker, 1)[1].split(";", 1)[0].strip().strip('"')
    if not boundary:
        raise ValueError("empty multipart boundary")
    delimiter = ("--" + boundary).encode("latin-1")
    uploads: dict[str, bytes] = {}
    for part in body.split(delimiter):
        part = part.strip(b"\r\n")
        if not part or part == b"--" or b"\r\n\r\n" not in part:
            continue
        raw_headers, data = part.split(b"\r\n\r\n", 1)
        if data.endswith(b"\r\n"):
            data = data[:-2]
        header_text = raw_headers.decode("latin-1", "replace")
        disposition = ""
        for line in header_text.split("\r\n"):
            if line.lower().startswith("content-disposition:"):
                disposition = line
                break
        if "filename=" not in disposition:
            continue
        name = ""
        filename = ""
        for chunk in disposition.split(";"):
            chunk = chunk.strip()
            if chunk.startswith("name="):
                name = chunk.split("=", 1)[1].strip('"')
            elif chunk.startswith("filename="):
                filename = chunk.split("=", 1)[1].strip('"')
        target = filename or name
        if target in Q1_ALLOWED_UPLOADS and data:
            uploads[target] = data
    return uploads


def _save_q1_uploads(body: bytes, content_type: str) -> dict[str, Any]:
    uploads = _parse_multipart(body, content_type)
    if not uploads:
        return {"ok": False, "error": "no_allowed_q1_csv_uploaded"}
    Q1_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    saved = []
    for name, data in uploads.items():
        (Q1_INPUT_DIR / name).write_bytes(data)
        saved.append(name)
    return {"ok": True, "saved": sorted(saved), "status": _q1_status()}


def _run_q1_fetch() -> dict[str, Any]:
    if not _is_render():
        return {"ok": False, "error": "render_only_endpoint"}
    if not os.getenv("UPSTOX_ACCESS_TOKEN"):
        return {"ok": False, "error": "UPSTOX_ACCESS_TOKEN_missing"}
    inputs = _file_status(Q1_INPUT_DIR, Q1_REQUIRED_INPUTS)
    if not all(inputs.values()):
        return {"ok": False, "error": "missing_q1_input_files", "input_files": inputs}

    Q1_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    script = ROOT_DIR / "scripts" / "q1_upstox_price_join.py"
    if not script.is_file():
        return {"ok": False, "error": "q1_fetch_script_missing"}

    proc = subprocess.run(
        [
            sys.executable,
            str(script),
            "--input-dir",
            str(Q1_INPUT_DIR),
            "--output-dir",
            str(Q1_OUTPUT_DIR),
        ],
        cwd=str(ROOT_DIR),
        env=os.environ.copy(),
        text=True,
        capture_output=True,
        timeout=900,
        check=False,
    )
    outputs = _file_status(Q1_OUTPUT_DIR, Q1_OUTPUT_FILES)
    return {
        "ok": proc.returncode == 0 and all(outputs.values()),
        "returncode": proc.returncode,
        "output_files": outputs,
        "stdout_tail": proc.stdout[-2000:],
        "stderr_tail": proc.stderr[-2000:],
    }


def _download_q1_file(path: str) -> tuple[int, list[tuple[bytes, bytes]], bytes]:
    name = Path(path).name
    if name not in Q1_OUTPUT_FILES:
        return _json_response({"ok": False, "error": "unknown_q1_output_file"}, 404)
    target = Q1_OUTPUT_DIR / name
    if not target.is_file():
        return _json_response({"ok": False, "error": "q1_output_file_missing", "file": name}, 404)
    body = target.read_bytes()
    headers = [
        (b"content-type", b"text/csv; charset=utf-8"),
        (b"content-length", str(len(body)).encode("ascii")),
        (b"content-disposition", f'attachment; filename="{name}"'.encode("utf-8")),
    ]
    return 200, headers, body


async def app(scope, receive, send):
    if scope["type"] != "http":
        return

    path = scope.get("path", "/")
    method = scope.get("method", "GET").upper()

    if path == "/":
        status, headers, body = _json_response({
            "app": "AshStocks",
            "status": "alive",
            "mode": "paper_only",
            "message": "AshStocks API is running. Use /health, /api/config, /api/spec, /q1.",
        })
    elif path == "/health":
        status, headers, body = _json_response({
            "ok": True,
            "app": "AshStocks",
            "ts": datetime.utcnow().isoformat(),
            "paper_only": CONFIG["paper_only"],
            "broker_write_enabled": CONFIG["broker_write_enabled"],
        })
    elif path == "/api/config":
        status, headers, body = _json_response(CONFIG)
    elif path == "/api/spec":
        status, headers, body = _json_response(SPEC)
    elif path == "/q1" and method == "GET":
        status, headers, body = _q1_page(scope)
    elif path == "/api/q1/status" and method == "GET":
        status, headers, body = _json_response(_q1_status())
    elif path == "/api/q1/upload" and method == "POST":
        result = _save_q1_uploads(await _read_body(receive), _header(scope, b"content-type"))
        if "text/html" in _header(scope, b"accept"):
            msg = "uploaded" if result.get("ok") else result.get("error", "upload_failed")
            status, headers, body = _redirect(f"/q1?msg={msg}")
        else:
            status, headers, body = _json_response(result, 200 if result.get("ok") else 400)
    elif path == "/api/q1/run-upstox-fetch" and method == "POST":
        result = await asyncio.to_thread(_run_q1_fetch)
        if "text/html" in _header(scope, b"accept"):
            msg = "run_complete" if result.get("ok") else result.get("error", "run_failed")
            status, headers, body = _redirect(f"/q1?msg={msg}")
        else:
            status, headers, body = _json_response(result, 200 if result.get("ok") else 400)
    elif path.startswith("/api/q1/download/") and method == "GET":
        status, headers, body = _download_q1_file(path.rsplit("/", 1)[-1])
    else:
        status, headers, body = _json_response({"ok": False, "error": "not_found", "path": path}, 404)

    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})
