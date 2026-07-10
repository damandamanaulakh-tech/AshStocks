"""Core AshStocks data contracts.

These models are intentionally small and explicit so every scan can be stored,
replayed, audited, and compared with later versions of the brain.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any


class Decision(StrEnum):
    SELECT = "SELECT"
    WATCH = "WATCH"
    REJECT = "REJECT"
    BLOCKED = "BLOCKED"
    DATA_NEEDED = "DATA_NEEDED"


class GateStatus(StrEnum):
    PASS = "PASS"
    FAIL = "FAIL"
    WARN = "WARN"
    DATA_NEEDED = "DATA_NEEDED"


@dataclass(frozen=True)
class GateResult:
    gate: str
    status: GateStatus
    reason: str
    value: Any = None
    threshold: Any = None
    source: str | None = None


@dataclass
class StockScore:
    symbol: str
    score: float
    components: dict[str, float] = field(default_factory=dict)
    gates: list[GateResult] = field(default_factory=list)
    decision: Decision = Decision.WATCH
    reason: str = ""
    last_close: float | None = None
    data_sources: list[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)

    def as_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "score": round(float(self.score), 4),
            "components": {k: round(float(v), 4) for k, v in self.components.items()},
            "gates": [g.__dict__ for g in self.gates],
            "decision": self.decision.value,
            "reason": self.reason,
            "last_close": self.last_close,
            "data_sources": self.data_sources,
            "created_at": self.created_at.isoformat(),
        }


@dataclass(frozen=True)
class ScanConfig:
    min_select_score: float = 70.0
    min_watch_score: float = 55.0
    target_potential_pct: float = 15.0
    max_position_pct: float = 0.025
    paper_only: bool = True
    broker_write_enabled: bool = False
    max_stale_days: int = 7
    min_avg_volume_shares: float = 200_000
    min_rupee_volume_cr: float = 5.0
    correlation_threshold: float = 0.85
    quality_blend_pct: float = 0.35
