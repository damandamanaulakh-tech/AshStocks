"""AshStocks selection brain.

This is not a clone of AM07. It adopts the useful Nifty200 momentum/quality logic,
but outputs transparent scores and gates for AshStocks.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from ashstocks.brain.models import Decision, GateResult, GateStatus, ScanConfig, StockScore


def _clip(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return float(max(lo, min(hi, x)))


def normalized_momentum_score(close: pd.Series) -> float | None:
    """6m + 12m volatility-adjusted momentum mapped to 0-100.

    Returns None when the series cannot prove itself. No fake score is produced.
    """
    clean = close.dropna() if close is not None else pd.Series(dtype=float)
    if len(clean) < 253:
        return None

    last = float(clean.iloc[-1])
    p6 = float(clean.iloc[-127])
    p12 = float(clean.iloc[-253])
    if last <= 0 or p6 <= 0 or p12 <= 0:
        return None

    r6 = last / p6 - 1
    r12 = last / p12 - 1
    vol6 = float(clean.iloc[-126:].pct_change().dropna().std() * math.sqrt(252))
    vol12 = float(clean.iloc[-252:].pct_change().dropna().std() * math.sqrt(252))
    if vol6 <= 0 or vol12 <= 0 or not np.isfinite(vol6 + vol12):
        return None

    raw = ((r6 / vol6) + (r12 / vol12)) / 2
    return _clip(50 + raw * 25)


def quality_score(close: pd.Series, volume: pd.Series | None = None) -> float:
    """Low volatility + liquidity quality tilt. Uses only supplied OHLCV."""
    c = close.dropna() if close is not None else pd.Series(dtype=float)
    if len(c) >= 64:
        ann_vol = float(c.pct_change().dropna().iloc[-63:].std() * math.sqrt(252) * 100)
        low_vol = _clip(100 - (ann_vol - 10) * 1.7)
    else:
        low_vol = 50.0

    if volume is not None and not volume.dropna().empty:
        adv = float(volume.dropna().iloc[-20:].mean())
        if adv > 1_000_000:
            liq = 90.0
        elif adv > 300_000:
            liq = 70.0
        elif adv > 100_000:
            liq = 55.0
        else:
            liq = 30.0
    else:
        liq = 50.0
    return round((low_vol + liq) / 2, 2)


def blended_score(momentum: float, quality: float, quality_weight: float) -> float:
    w = max(0.0, min(1.0, quality_weight))
    return round((1 - w) * momentum + w * quality, 2)


def absolute_momentum_gate(close: pd.Series) -> GateResult:
    clean = close.dropna() if close is not None else pd.Series(dtype=float)
    if len(clean) < 127:
        return GateResult("ABSOLUTE_MOMENTUM", GateStatus.DATA_NEEDED, "need 127 candles", len(clean), 127)
    ok = float(clean.iloc[-1]) > float(clean.iloc[-127])
    return GateResult(
        "ABSOLUTE_MOMENTUM",
        GateStatus.PASS if ok else GateStatus.FAIL,
        "last close above 6m-ago close" if ok else "negative 6m absolute momentum",
        round(float(clean.iloc[-1] / clean.iloc[-127] - 1) * 100, 2),
        "> 0%",
    )


def target_potential_gate(close: pd.Series, target_pct: float = 15.0) -> GateResult:
    """A transparent potential-left label, not a guarantee.

    Uses distance to 252-day high as a rough potential reference until richer
    valuation/sector models are wired.
    """
    clean = close.dropna() if close is not None else pd.Series(dtype=float)
    if len(clean) < 252:
        return GateResult("TARGET_POTENTIAL", GateStatus.DATA_NEEDED, "need 252 candles", len(clean), 252)
    last = float(clean.iloc[-1])
    high = float(clean.iloc[-252:].max())
    if last <= 0:
        return GateResult("TARGET_POTENTIAL", GateStatus.FAIL, "invalid last close", last, "> 0")
    potential = (high / last - 1) * 100
    status = GateStatus.PASS if potential >= target_pct else GateStatus.WARN
    return GateResult(
        "TARGET_POTENTIAL",
        status,
        f"potential-to-252d-high {potential:.1f}%" if status == GateStatus.PASS else f"below {target_pct:.1f}% target-potential",
        round(potential, 2),
        f">= {target_pct}%",
    )


def score_symbol(symbol: str, history: pd.DataFrame, cfg: ScanConfig = ScanConfig()) -> StockScore:
    if history is None or history.empty or "Close" not in history.columns:
        return StockScore(symbol=symbol, score=0, decision=Decision.DATA_NEEDED, reason="missing Close history")

    close = history["Close"]
    volume = history["Volume"] if "Volume" in history.columns else None
    gates = [absolute_momentum_gate(close), target_potential_gate(close, cfg.target_potential_pct)]

    mom = normalized_momentum_score(close)
    if mom is None:
        gates.append(GateResult("MOMENTUM_SCORE", GateStatus.DATA_NEEDED, "need clean 253 daily candles"))
        return StockScore(symbol=symbol, score=0, gates=gates, decision=Decision.DATA_NEEDED, reason="cannot score momentum")

    q = quality_score(close, volume)
    score = blended_score(mom, q, cfg.quality_blend_pct)
    gates.append(GateResult("MOMENTUM_SCORE", GateStatus.PASS, "score computed", round(mom, 2), "0-100"))
    gates.append(GateResult("QUALITY_SCORE", GateStatus.PASS, "quality computed", round(q, 2), "0-100"))

    failed = [g for g in gates if g.status == GateStatus.FAIL]
    if failed:
        decision = Decision.REJECT
        reason = "; ".join(f"{g.gate}: {g.reason}" for g in failed)
    elif score >= cfg.min_select_score:
        decision = Decision.SELECT
        reason = f"score {score:.1f} >= select {cfg.min_select_score:.1f}"
    elif score >= cfg.min_watch_score:
        decision = Decision.WATCH
        reason = f"score {score:.1f} >= watch {cfg.min_watch_score:.1f}"
    else:
        decision = Decision.REJECT
        reason = f"score {score:.1f} below watch {cfg.min_watch_score:.1f}"

    return StockScore(
        symbol=symbol,
        score=score,
        components={"momentum": mom, "quality": q, "quality_blend_pct": cfg.quality_blend_pct},
        gates=gates,
        decision=decision,
        reason=reason,
        last_close=float(close.dropna().iloc[-1]),
    )
