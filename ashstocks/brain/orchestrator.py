"""AshStocks scan orchestrator.

This module connects scoring + risk + IFR into one transparent scan packet.
It does not place live broker orders. Paper execution is a later module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

import pandas as pd

from ashstocks.brain.ifr import IFRSnapshot, check_ifr
from ashstocks.brain.models import Decision, GateStatus, ScanConfig, StockScore
from ashstocks.brain.risk import liquidity_gate, stale_data_gate
from ashstocks.brain.selection import score_symbol


@dataclass
class ScanPacket:
    scan_id: str
    created_at: str
    config: dict
    universe_count: int
    scored_count: int
    selected_count: int
    watch_count: int
    rejected_count: int
    data_needed_count: int
    ifr: dict
    selected: list[dict] = field(default_factory=list)
    watch: list[dict] = field(default_factory=list)
    rejected: list[dict] = field(default_factory=list)
    data_needed: list[dict] = field(default_factory=list)


def run_scan(history_by_symbol: dict[str, pd.DataFrame], cfg: ScanConfig = ScanConfig(), now: datetime | None = None) -> ScanPacket:
    """Run one transparent scan from already-loaded OHLCV.

    Data loading is deliberately outside this function. That keeps the brain testable
    and prevents hidden network calls during proof runs.
    """
    now = now or datetime.utcnow()
    ifr: IFRSnapshot = check_ifr(history_by_symbol, now=now)

    selected: list[StockScore] = []
    watch: list[StockScore] = []
    rejected: list[StockScore] = []
    data_needed: list[StockScore] = []

    for symbol, hist in history_by_symbol.items():
        score = score_symbol(symbol, hist, cfg)
        score.gates.append(stale_data_gate(hist, now.date(), cfg))
        score.gates.append(liquidity_gate(hist, cfg))

        hard_fails = [g for g in score.gates if g.status == GateStatus.FAIL]
        missing = [g for g in score.gates if g.status == GateStatus.DATA_NEEDED]
        if hard_fails:
            score.decision = Decision.BLOCKED
            score.reason = "; ".join(f"{g.gate}: {g.reason}" for g in hard_fails)
        elif missing and score.decision == Decision.DATA_NEEDED:
            score.reason = "; ".join(f"{g.gate}: {g.reason}" for g in missing)

        if score.decision == Decision.SELECT:
            selected.append(score)
        elif score.decision == Decision.WATCH:
            watch.append(score)
        elif score.decision == Decision.DATA_NEEDED:
            data_needed.append(score)
        else:
            rejected.append(score)

    selected.sort(key=lambda x: x.score, reverse=True)
    watch.sort(key=lambda x: x.score, reverse=True)
    rejected.sort(key=lambda x: x.score, reverse=True)

    return ScanPacket(
        scan_id=f"ASHSCAN-{now.strftime('%Y%m%d-%H%M%S')}",
        created_at=now.isoformat(),
        config=cfg.__dict__.copy(),
        universe_count=len(history_by_symbol),
        scored_count=len(history_by_symbol) - len(data_needed),
        selected_count=len(selected),
        watch_count=len(watch),
        rejected_count=len(rejected),
        data_needed_count=len(data_needed),
        ifr=ifr.__dict__.copy(),
        selected=[x.as_dict() for x in selected],
        watch=[x.as_dict() for x in watch],
        rejected=[x.as_dict() for x in rejected],
        data_needed=[x.as_dict() for x in data_needed],
    )
