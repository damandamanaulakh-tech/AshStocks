"""AshStocks risk brain.

All risk outputs are explicit gates. No hidden rejection and no silent success.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from ashstocks.brain.models import GateResult, GateStatus, ScanConfig


DRAWDOWN_LEVELS = [
    (-0.05, "watchful", 0.75, 0.0),
    (-0.08, "stop_adding", 0.0, 0.0),
    (-0.10, "cut_half", 0.0, 0.50),
    (-0.15, "mostly_cash", 0.0, 0.80),
    (-0.20, "full_halt", 0.0, 1.00),
]


@dataclass(frozen=True)
class DrawdownState:
    level: str
    drawdown_pct: float
    sizing_multiplier: float
    halt_new_entries: bool
    forced_cut: float
    reason: str


def classify_drawdown(current_equity: float, peak_equity: float) -> DrawdownState:
    if peak_equity <= 0:
        return DrawdownState("normal", 0.0, 1.0, False, 0.0, "no peak equity yet")
    dd = (current_equity - peak_equity) / peak_equity
    level = "normal"
    mult = 1.0
    forced = 0.0
    halt = False
    for threshold, name, sizing, cut in DRAWDOWN_LEVELS:
        if dd <= threshold:
            level = name
            mult = sizing
            forced = cut
            halt = name in {"stop_adding", "cut_half", "mostly_cash", "full_halt"}
    return DrawdownState(level, round(dd * 100, 2), mult, halt, forced, f"drawdown {dd*100:.2f}% from peak")


def liquidity_gate(history: pd.DataFrame, cfg: ScanConfig = ScanConfig()) -> GateResult:
    if history is None or history.empty or "Close" not in history.columns or "Volume" not in history.columns:
        return GateResult("LIQUIDITY", GateStatus.DATA_NEEDED, "need Close and Volume")
    close = history["Close"].dropna()
    volume = history["Volume"].dropna()
    if len(close) < 20 or len(volume) < 20:
        return GateResult("LIQUIDITY", GateStatus.DATA_NEEDED, "need 20 candles", min(len(close), len(volume)), 20)

    adv = float(volume.iloc[-20:].mean())
    if adv < cfg.min_avg_volume_shares:
        return GateResult("LIQUIDITY", GateStatus.FAIL, "average volume too low", round(adv, 0), cfg.min_avg_volume_shares)

    rupee_vol_cr = float((close.iloc[-5:] * volume.iloc[-5:]).dropna().mean()) / 1e7
    if rupee_vol_cr < cfg.min_rupee_volume_cr:
        return GateResult("LIQUIDITY", GateStatus.FAIL, "rupee turnover too low", round(rupee_vol_cr, 2), cfg.min_rupee_volume_cr)

    if {"Open", "High", "Low"}.issubset(history.columns):
        o = float(history["Open"].dropna().iloc[-1])
        h = float(history["High"].dropna().iloc[-1])
        l = float(history["Low"].dropna().iloc[-1])
        c = float(close.iloc[-1])
        if o == h == l == c:
            return GateResult("LIQUIDITY", GateStatus.FAIL, "stuck at circuit / no real range", c, "open/high/low/close not all equal")

    return GateResult("LIQUIDITY", GateStatus.PASS, "liquidity passed", {"adv": round(adv, 0), "rupee_vol_cr": round(rupee_vol_cr, 2)})


def stale_data_gate(history: pd.DataFrame, today, cfg: ScanConfig = ScanConfig()) -> GateResult:
    if history is None or history.empty:
        return GateResult("STALE_DATA", GateStatus.DATA_NEEDED, "no history")
    try:
        last_date = history.index[-1].date()
        stale_days = (today - last_date).days
    except Exception:
        return GateResult("STALE_DATA", GateStatus.DATA_NEEDED, "history index has no date")
    if stale_days > cfg.max_stale_days:
        return GateResult("STALE_DATA", GateStatus.FAIL, "last candle is stale", stale_days, cfg.max_stale_days)
    return GateResult("STALE_DATA", GateStatus.PASS, "fresh enough", stale_days, cfg.max_stale_days)


def daily_returns(close: pd.Series, n: int = 60) -> pd.Series | None:
    clean = close.dropna() if close is not None else pd.Series(dtype=float)
    if len(clean) < n + 1:
        return None
    return clean.iloc[-(n + 1):].pct_change().dropna()


def correlation_gate(candidate_close: pd.Series, open_position_closes: dict[str, pd.Series], cfg: ScanConfig = ScanConfig()) -> GateResult:
    cand = daily_returns(candidate_close)
    if cand is None:
        return GateResult("CORRELATION", GateStatus.DATA_NEEDED, "need 61 candles for candidate")
    for symbol, close in open_position_closes.items():
        ret = daily_returns(close)
        if ret is None:
            continue
        df = pd.concat([cand, ret], axis=1, join="inner").dropna()
        if len(df) < 20:
            continue
        corr = float(df.iloc[:, 0].corr(df.iloc[:, 1]))
        if corr > cfg.correlation_threshold:
            return GateResult("CORRELATION", GateStatus.FAIL, f"too correlated with {symbol}", round(corr, 4), cfg.correlation_threshold)
    return GateResult("CORRELATION", GateStatus.PASS, "correlation passed", None, cfg.correlation_threshold)
