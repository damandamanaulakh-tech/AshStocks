"""
ASH08 Paper Engine — Phase 4
============================
Paper ticket, open positions, exit rules, Adaptive Risk Governor sizing.

LOCKED behaviour
----------------
  - Paper only (no live broker write)
  - Order fields: qty, side, type (MARKET/LIMIT), limit_price, stop, target
  - Exits: STOP_HIT | TARGET_HIT | GOVERNOR_CUT | ROTATION
  - Position size scaled by governor exposure (L0–L4: 100/70/50/25/15)
  - Max single-name weight before governor: MAX_NAME_PCT of book

Execution
---------
  python ash08/paper_engine.py --demo
  python ash08/paper_engine.py --status --data-dir ash08_data

Branch: ash08-adaptive-governor only. Never main.
"""

from __future__ import annotations

import argparse
import json
import logging
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

LOG = logging.getLogger("ash08.paper")

MAX_NAME_PCT = 2.5
DEFAULT_BOOK = 1_000_000.0
EXPOSURE_L0 = 100.0
EXPOSURE_L1 = 70.0
EXPOSURE_L2 = 50.0
EXPOSURE_L3 = 25.0
EXPOSURE_L4 = 15.0


class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"


class Side(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderStatus(str, Enum):
    NEW = "NEW"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"


class PositionStatus(str, Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class ExitReason(str, Enum):
    STOP_HIT = "STOP_HIT"
    TARGET_HIT = "TARGET_HIT"
    GOVERNOR_CUT = "GOVERNOR_CUT"
    ROTATION = "ROTATION"
    MANUAL = "MANUAL"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


@dataclass
class GovFlags:
    damage_cluster_5in10: bool = False
    fii_cash_stress_q10: bool = False
    fii_sell_cluster_7in10: bool = False
    fii_any_confirm: bool = False
    repair_after_damage_candidate: bool = False


@dataclass
class GovState:
    level: str
    exposure_pct: float
    rationale: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def evaluate_governor(flags: GovFlags, previous_exposure: float = 100.0) -> GovState:
    try:
        from adaptive_risk_governor import AdaptiveRiskGovernor, SignalFlags  # type: ignore

        gov = AdaptiveRiskGovernor()
        decision = gov.evaluate(
            SignalFlags(
                damage_cluster_5in10=flags.damage_cluster_5in10,
                fii_cash_stress_q10=flags.fii_cash_stress_q10,
                fii_sell_cluster_7in10=flags.fii_sell_cluster_7in10,
                fii_any_confirm=flags.fii_any_confirm,
                repair_after_damage_candidate=flags.repair_after_damage_candidate,
            )
        )
        return GovState(
            level=str(getattr(decision.severity, "value", decision.severity)),
            exposure_pct=float(decision.target_exposure_pct),
            rationale=str(decision.rationale),
        )
    except Exception:
        pass

    damage = flags.damage_cluster_5in10
    confirms = sum([
        flags.fii_cash_stress_q10,
        flags.fii_sell_cluster_7in10,
        flags.fii_any_confirm,
    ])
    extreme = flags.fii_cash_stress_q10 and flags.fii_sell_cluster_7in10
    if damage and extreme:
        return GovState("L4_EXTREME", EXPOSURE_L4, "damage + Q10 + sell cluster")
    if damage and confirms >= 2:
        return GovState("L3_HIGH_SEVERITY", EXPOSURE_L3, "damage + >=2 FII confirms")
    if damage and confirms == 1:
        return GovState("L2_CONFIRMED", EXPOSURE_L2, "damage + 1 FII confirm")
    if damage:
        return GovState("L1_DAMAGE_ONLY", EXPOSURE_L1, "damage only")
    return GovState("L0_NORMAL", EXPOSURE_L0, "no damage")


@dataclass
class PaperOrder:
    order_id: str
    symbol: str
    side: str
    order_type: str
    qty: int
    limit_price: Optional[float]
    stop: Optional[float]
    target: Optional[float]
    status: str
    created_at: str
    fill_price: Optional[float] = None
    filled_at: Optional[str] = None
    reject_reason: str = ""
    governor_level: str = ""
    exposure_pct: float = 100.0
    sized_qty: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class PaperPosition:
    position_id: str
    symbol: str
    qty: int
    side: str
    entry: float
    stop: Optional[float]
    target: Optional[float]
    status: str
    opened_at: str
    ltp: Optional[float] = None
    closed_at: Optional[str] = None
    exit_price: Optional[float] = None
    exit_reason: Optional[str] = None
    order_id: str = ""

    def unrealized_pnl(self) -> Optional[float]:
        if self.ltp is None or self.status != PositionStatus.OPEN.value:
            return None
        mult = 1 if self.side == Side.BUY.value else -1
        return round((self.ltp - self.entry) * self.qty * mult, 2)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["unrealized_pnl"] = self.unrealized_pnl()
        return d


@dataclass
class BookSnapshot:
    asof: str
    book_value: float
    governor: Dict[str, Any]
    open_positions: int
    closed_positions: int
    orders: int
    positions: List[Dict[str, Any]] = field(default_factory=list)
    recent_orders: List[Dict[str, Any]] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class PaperEngine:
    def __init__(self, data_dir: Path | str = "ash08_data", book_value: float = DEFAULT_BOOK) -> None:
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.book_value = float(book_value)
        self.orders: List[PaperOrder] = []
        self.positions: List[PaperPosition] = []
        self.governor = GovState("L0_NORMAL", 100.0, "init")
        self._load()

    @property
    def state_path(self) -> Path:
        return self.data_dir / "paper_state.json"

    def set_governor_flags(self, flags: GovFlags) -> GovState:
        self.governor = evaluate_governor(flags, previous_exposure=self.governor.exposure_pct)
        LOG.info("Governor %s exposure=%.0f%%", self.governor.level, self.governor.exposure_pct)
        return self.governor

    def size_qty(self, symbol: str, requested_qty: int, price: float) -> int:
        if price <= 0 or requested_qty <= 0:
            return 0
        max_notional = self.book_value * (MAX_NAME_PCT / 100.0) * (self.governor.exposure_pct / 100.0)
        max_qty = int(max_notional // price)
        return max(0, min(requested_qty, max_qty))

    def place_order(
        self,
        symbol: str,
        side: str,
        order_type: str,
        qty: int,
        limit_price: Optional[float] = None,
        stop: Optional[float] = None,
        target: Optional[float] = None,
        fill_price: Optional[float] = None,
    ) -> PaperOrder:
        symbol = symbol.upper().strip()
        side = side.upper()
        order_type = order_type.upper()
        px = fill_price if fill_price is not None else limit_price
        if px is None or px <= 0:
            order = PaperOrder(
                order_id=_id("ord"), symbol=symbol, side=side, order_type=order_type,
                qty=qty, limit_price=limit_price, stop=stop, target=target,
                status=OrderStatus.REJECTED.value, created_at=_utc_now_iso(),
                reject_reason="missing_price", governor_level=self.governor.level,
                exposure_pct=self.governor.exposure_pct,
            )
            self.orders.append(order)
            self._save()
            return order

        sized = self.size_qty(symbol, qty, px)
        if sized <= 0:
            order = PaperOrder(
                order_id=_id("ord"), symbol=symbol, side=side, order_type=order_type,
                qty=qty, limit_price=limit_price, stop=stop, target=target,
                status=OrderStatus.REJECTED.value, created_at=_utc_now_iso(),
                reject_reason="sized_qty_zero_governor_or_cap",
                governor_level=self.governor.level, exposure_pct=self.governor.exposure_pct,
                sized_qty=0,
            )
            self.orders.append(order)
            self._save()
            return order

        order = PaperOrder(
            order_id=_id("ord"), symbol=symbol, side=side, order_type=order_type,
            qty=qty, limit_price=limit_price, stop=stop, target=target,
            status=OrderStatus.FILLED.value, created_at=_utc_now_iso(),
            fill_price=px, filled_at=_utc_now_iso(),
            governor_level=self.governor.level, exposure_pct=self.governor.exposure_pct,
            sized_qty=sized,
        )
        self.orders.append(order)

        if side == Side.BUY.value:
            pos = PaperPosition(
                position_id=_id("pos"), symbol=symbol, qty=sized, side=side,
                entry=px, stop=stop, target=target, status=PositionStatus.OPEN.value,
                opened_at=_utc_now_iso(), ltp=px, order_id=order.order_id,
            )
            self.positions.append(pos)
        elif side == Side.SELL.value:
            self._close_symbol(symbol, px, ExitReason.MANUAL.value)

        self._save()
        return order

    def update_ltp(self, symbol: str, ltp: float) -> List[PaperPosition]:
        symbol = symbol.upper()
        closed: List[PaperPosition] = []
        for pos in self.positions:
            if pos.status != PositionStatus.OPEN.value or pos.symbol != symbol:
                continue
            pos.ltp = ltp
            if pos.side == Side.BUY.value:
                if pos.stop is not None and ltp <= pos.stop:
                    self._close_position(pos, ltp, ExitReason.STOP_HIT.value)
                    closed.append(pos)
                elif pos.target is not None and ltp >= pos.target:
                    self._close_position(pos, ltp, ExitReason.TARGET_HIT.value)
                    closed.append(pos)
        if closed:
            self._save()
        return closed

    def governor_cut(self, reduce_pct: float = 50.0) -> List[PaperPosition]:
        opens = [p for p in self.positions if p.status == PositionStatus.OPEN.value]
        if not opens:
            return []
        opens_sorted = sorted(opens, key=lambda p: (p.entry * p.qty))
        victim = opens_sorted[0]
        px = victim.ltp if victim.ltp is not None else victim.entry
        self._close_position(victim, px, ExitReason.GOVERNOR_CUT.value)
        self._save()
        return [victim]

    def rotate_out(self, symbol: str, ltp: Optional[float] = None) -> Optional[PaperPosition]:
        symbol = symbol.upper()
        for pos in self.positions:
            if pos.status == PositionStatus.OPEN.value and pos.symbol == symbol:
                px = ltp if ltp is not None else (pos.ltp or pos.entry)
                self._close_position(pos, px, ExitReason.ROTATION.value)
                self._save()
                return pos
        return None

    def _close_symbol(self, symbol: str, px: float, reason: str) -> None:
        for pos in self.positions:
            if pos.status == PositionStatus.OPEN.value and pos.symbol == symbol:
                self._close_position(pos, px, reason)

    def _close_position(self, pos: PaperPosition, px: float, reason: str) -> None:
        pos.status = PositionStatus.CLOSED.value
        pos.exit_price = px
        pos.exit_reason = reason
        pos.closed_at = _utc_now_iso()
        pos.ltp = px
        LOG.info("Closed %s qty=%s @ %s reason=%s", pos.symbol, pos.qty, px, reason)

    def snapshot(self) -> BookSnapshot:
        opens = [p for p in self.positions if p.status == PositionStatus.OPEN.value]
        closed = [p for p in self.positions if p.status == PositionStatus.CLOSED.value]
        return BookSnapshot(
            asof=_utc_now_iso(),
            book_value=self.book_value,
            governor=self.governor.to_dict(),
            open_positions=len(opens),
            closed_positions=len(closed),
            orders=len(self.orders),
            positions=[p.to_dict() for p in self.positions],
            recent_orders=[o.to_dict() for o in self.orders[-20:]],
            notes=[f"MAX_NAME_PCT={MAX_NAME_PCT}", f"exposure={self.governor.exposure_pct}", "paper_only"],
        )

    def _save(self) -> None:
        payload = {
            "book_value": self.book_value,
            "governor": self.governor.to_dict(),
            "orders": [o.to_dict() for o in self.orders],
            "positions": [p.to_dict() for p in self.positions],
            "saved_at": _utc_now_iso(),
        }
        self.state_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _load(self) -> None:
        if not self.state_path.exists():
            return
        data = json.loads(self.state_path.read_text(encoding="utf-8"))
        self.book_value = float(data.get("book_value") or self.book_value)
        g = data.get("governor") or {}
        self.governor = GovState(
            level=str(g.get("level") or "L0_NORMAL"),
            exposure_pct=float(g.get("exposure_pct") or 100.0),
            rationale=str(g.get("rationale") or ""),
        )
        self.orders = [PaperOrder(**o) for o in data.get("orders") or []]
        self.positions = []
        for p in data.get("positions") or []:
            p = dict(p)
            p.pop("unrealized_pnl", None)
            self.positions.append(PaperPosition(**p))


def run_demo(data_dir: Path) -> Dict[str, Any]:
    eng = PaperEngine(data_dir=data_dir, book_value=DEFAULT_BOOK)
    eng.set_governor_flags(GovFlags(damage_cluster_5in10=True))
    o1 = eng.place_order("TCS", "BUY", "MARKET", 50, fill_price=3840, stop=3720, target=4100)
    o2 = eng.place_order("HDFCBANK", "BUY", "LIMIT", 80, limit_price=1690, fill_price=1690, stop=1640, target=1760)
    eng.update_ltp("TCS", 3850)
    eng.update_ltp("HDFCBANK", 1635)
    eng.set_governor_flags(GovFlags(damage_cluster_5in10=True, fii_cash_stress_q10=True, fii_any_confirm=True))
    cut = eng.governor_cut()
    snap = eng.snapshot()
    return {
        "orders": [o1.to_dict(), o2.to_dict()],
        "stop_example": "HDFCBANK stop 1640 vs ltp 1635",
        "governor_cut": [c.symbol for c in cut],
        "snapshot": {
            "governor": snap.governor,
            "open_positions": snap.open_positions,
            "closed_positions": snap.closed_positions,
            "orders": snap.orders,
        },
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(description="ASH08 Paper Engine (Phase 4)")
    p.add_argument("--data-dir", default="ash08_data")
    p.add_argument("--demo", action="store_true")
    p.add_argument("--status", action="store_true")
    args = p.parse_args(list(argv) if argv is not None else None)
    data_dir = Path(args.data_dir)
    if args.demo:
        print(json.dumps(run_demo(data_dir), indent=2))
        return 0
    eng = PaperEngine(data_dir=data_dir)
    if args.status:
        print(json.dumps(eng.snapshot().to_dict(), indent=2))
        return 0
    p.error("Provide --demo or --status")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
