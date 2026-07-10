"""Minimal pure-ASGI AshStocks API for Render/AWS deployment checks.

No FastAPI/Pydantic dependency here. This keeps the first deploy lightweight and
avoids pydantic-core build failures on Render's Python image.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any


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


def _json_response(payload: dict[str, Any], status: int = 200) -> tuple[int, list[tuple[bytes, bytes]], bytes]:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = [
        (b"content-type", b"application/json; charset=utf-8"),
        (b"content-length", str(len(body)).encode("ascii")),
    ]
    return status, headers, body


async def app(scope, receive, send):
    if scope["type"] != "http":
        return

    path = scope.get("path", "/")

    if path == "/":
        status, headers, body = _json_response({
            "app": "AshStocks",
            "status": "alive",
            "mode": "paper_only",
            "message": "AshStocks API is running. Use /health, /api/config, /api/spec.",
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
    else:
        status, headers, body = _json_response({"ok": False, "error": "not_found", "path": path}, 404)

    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})
