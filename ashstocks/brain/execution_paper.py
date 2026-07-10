"""Paper execution ledger.

Private AshStocks can later add broker actions, but this module remains paper-only.
No live order method is implemented here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


class LiveOrderBlocked(RuntimeError):
    pass


def assert_paper_only(paper_only: bool = True, broker_write_enabled: bool = False) -> None:
    if not paper_only or broker_write_enabled:
        raise LiveOrderBlocked("AshStocks live broker write path is not implemented in this module")


@dataclass
class PaperPosition:
    symbol: str
    qty: int
    entry_price: float
    entry_time: str
    reason: str
    score: float
    config_snapshot: dict
    peak_price: float | None = None


@dataclass
class PaperBook:
    starting_cash: float
    cash: float | None = None
    positions: dict[str, PaperPosition] = field(default_factory=dict)
    journal: list[dict] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.cash is None:
            self.cash = self.starting_cash

    def buy(self, symbol: str, price: float, target_pct: float, score: float, reason: str, config_snapshot: dict) -> PaperPosition:
        assert_paper_only(
            paper_only=bool(config_snapshot.get("paper_only", True)),
            broker_write_enabled=bool(config_snapshot.get("broker_write_enabled", False)),
        )
        if symbol in self.positions:
            raise ValueError(f"already held: {symbol}")
        if price <= 0:
            raise ValueError("price must be positive")
        target_value = self.starting_cash * target_pct
        qty = int(target_value // price)
        if qty <= 0:
            raise ValueError("target position too small for price")
        notional = qty * price
        if self.cash is None or notional > self.cash:
            raise ValueError("insufficient paper cash")
        now = datetime.utcnow().isoformat()
        self.cash -= notional
        pos = PaperPosition(symbol, qty, price, now, reason, score, config_snapshot, peak_price=price)
        self.positions[symbol] = pos
        self.journal.append({
            "ts": now,
            "action": "PAPER_BUY",
            "symbol": symbol,
            "qty": qty,
            "price": round(price, 4),
            "notional": round(notional, 2),
            "score": round(score, 4),
            "reason": reason,
            "config_snapshot": config_snapshot,
            "cash_after": round(self.cash, 2),
        })
        return pos
