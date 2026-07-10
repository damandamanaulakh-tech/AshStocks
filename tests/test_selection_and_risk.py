from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from ashstocks.brain.models import Decision, ScanConfig
from ashstocks.brain.orchestrator import run_scan
from ashstocks.brain.selection import normalized_momentum_score, score_symbol


def make_history(days=300, start=100, drift=0.001, volume=500_000):
    idx = pd.date_range(datetime.utcnow().date() - timedelta(days=days * 2), periods=days, freq="B")
    prices = start * (1 + drift) ** np.arange(days)
    return pd.DataFrame(
        {
            "Open": prices,
            "High": prices * 1.01,
            "Low": prices * 0.99,
            "Close": prices,
            "Volume": np.full(days, volume),
        },
        index=idx,
    )


def test_normalized_momentum_score_computes_for_253_candles():
    hist = make_history()
    score = normalized_momentum_score(hist["Close"])
    assert score is not None
    assert 0 <= score <= 100


def test_score_symbol_selects_positive_quality_momentum():
    hist = make_history(drift=0.002, volume=1_000_000)
    result = score_symbol("TEST", hist, ScanConfig(min_select_score=55))
    assert result.decision in {Decision.SELECT, Decision.WATCH}
    assert result.components["momentum"] > 50


def test_run_scan_returns_transparent_packet():
    packet = run_scan({"WINNER": make_history(drift=0.002), "LOSER": make_history(drift=-0.002)})
    assert packet.universe_count == 2
    assert packet.selected_count + packet.watch_count + packet.rejected_count + packet.data_needed_count == 2
    assert "sizing_multiplier" in packet.ifr
