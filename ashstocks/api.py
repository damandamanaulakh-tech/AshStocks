"""Minimal AshStocks API for Render/AWS deployment checks.

This is not the full dashboard. It exposes the current engine contract so the
repo can be connected to Render and verified without fake market data.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import FastAPI

from ashstocks.brain.models import ScanConfig

app = FastAPI(title="AshStocks", version="0.1.0")


@app.get("/")
def root() -> dict:
    return {
        "app": "AshStocks",
        "status": "alive",
        "mode": "paper_only",
        "message": "AshStocks API is running. Use /health, /api/config, /api/spec.",
    }


@app.get("/health")
def health() -> dict:
    cfg = ScanConfig()
    return {
        "ok": True,
        "app": "AshStocks",
        "ts": datetime.utcnow().isoformat(),
        "paper_only": cfg.paper_only,
        "broker_write_enabled": cfg.broker_write_enabled,
    }


@app.get("/api/config")
def config() -> dict:
    return ScanConfig().__dict__.copy()


@app.get("/api/spec")
def spec() -> dict:
    return {
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
