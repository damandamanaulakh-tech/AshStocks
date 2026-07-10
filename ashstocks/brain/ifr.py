"""AshStocks internal-fracture risk overlay.

Adopts the useful AM07 IFR concept but keeps it standalone and auditable.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

import pandas as pd


TAIL_DROP_PCT = -0.03
TAIL_UP_PCT = 0.03
TAIL_WINDOW = 5
CLUSTER_WINDOW = 10
CLUSTER_MIN_FIRES = 5
TAIL_PERCENTILE = 0.90
RATIO_PERCENTILE = 0.85
ACTIVE_DAYS_AFTER_FIRE = 22
THROTTLE_MULTIPLIER = 0.50


@dataclass(frozen=True)
class IFRSnapshot:
    active: bool
    fired_today: bool
    sizing_multiplier: float
    which_fired: tuple[str, ...]
    reason: str
    tail_down_today: float = 0.0
    tail_down_threshold: float = 0.0
    tail_damage_ratio_today: float = 0.0
    tail_damage_ratio_threshold: float = 0.0


def _tail_ratio(history: dict[str, pd.DataFrame], direction: str) -> pd.Series:
    parts = []
    threshold = TAIL_DROP_PCT if direction == "down" else TAIL_UP_PCT
    for symbol, df in history.items():
        if df is None or "Close" not in df.columns or len(df) < TAIL_WINDOW + 2:
            continue
        ret = df["Close"].pct_change()
        if direction == "down":
            hit = (ret < threshold).astype(int)
        else:
            hit = (ret > threshold).astype(int)
        parts.append((hit.rolling(TAIL_WINDOW).sum() > 0).astype(int).rename(symbol))
    if not parts:
        return pd.Series(dtype=float)
    return pd.concat(parts, axis=1).mean(axis=1)


def _is_recent(prev_iso: str | None, now_date: date) -> bool:
    if not prev_iso:
        return False
    try:
        prev = datetime.fromisoformat(prev_iso).date()
    except ValueError:
        return False
    return (now_date - prev).days <= ACTIVE_DAYS_AFTER_FIRE


def check_ifr(history: dict[str, pd.DataFrame], now: datetime | None = None, last_cluster_fire: str | None = None, last_ratio_fire: str | None = None) -> IFRSnapshot:
    now = now or datetime.utcnow()
    down = _tail_ratio(history, "down")
    up = _tail_ratio(history, "up")
    if down.empty or len(down) < CLUSTER_WINDOW + 30:
        return IFRSnapshot(False, False, 1.0, (), "insufficient IFR history")

    down_threshold = float(down.quantile(TAIL_PERCENTILE))
    down_today = float(down.iloc[-1])
    fires_in_window = int((down > down_threshold).astype(int).rolling(CLUSTER_WINDOW).sum().iloc[-1])
    cluster_fired = fires_in_window >= CLUSTER_MIN_FIRES

    ratio = pd.Series(dtype=float)
    ratio_fired = False
    ratio_today = 0.0
    ratio_threshold = 0.0
    if not up.empty:
        aligned = pd.concat([down, up], axis=1, join="inner").dropna()
        aligned.columns = ["down", "up"]
        ratio = aligned["down"] / (aligned["down"] + aligned["up"] + 0.001)
    if not ratio.empty:
        ratio_threshold = float(ratio.quantile(RATIO_PERCENTILE))
        ratio_today = float(ratio.iloc[-1])
        ratio_fired = ratio_today > ratio_threshold

    cluster_active = cluster_fired or _is_recent(last_cluster_fire, now.date())
    ratio_active = ratio_fired or _is_recent(last_ratio_fire, now.date())
    active = cluster_active or ratio_active
    fired_today = cluster_fired or ratio_fired
    which = tuple(name for name, ok in (("DAMAGE_CLUSTER", cluster_active), ("TAIL_DAMAGE_RATIO", ratio_active)) if ok)
    sizing = THROTTLE_MULTIPLIER if active else 1.0

    if fired_today:
        reason = f"IFR fired: {', '.join(which)}; sizing {sizing:.2f}x"
    elif active:
        reason = f"IFR active window: {', '.join(which)}; sizing {sizing:.2f}x"
    else:
        reason = "IFR normal"

    return IFRSnapshot(
        active=active,
        fired_today=fired_today,
        sizing_multiplier=sizing,
        which_fired=which,
        reason=reason,
        tail_down_today=round(down_today, 4),
        tail_down_threshold=round(down_threshold, 4),
        tail_damage_ratio_today=round(ratio_today, 4),
        tail_damage_ratio_threshold=round(ratio_threshold, 4),
    )
