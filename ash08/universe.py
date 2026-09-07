"""
ASH08 Universe Manager — Phase 2
================================
Load NSE equity instruments (Upstox source shape), persist Core / Discovery
buckets, weekly Core refresh policy.

LOCKED policy (do not change without explicit approval):
  - Core size target: 150–250 names (paper desk)
  - Discovery max: 5000
  - Core refresh: weekly
  - Discovery refresh: on demand
  - Prices refresh: every scan (not this module)
  - Hard membership filters for Core (when metrics available):
      ADV20 >= 200_000 shares
      5D rupee turnover >= 5 Cr
      last candle age <= 7 days (enforced at scan time)

Offline-safe: works with local JSON/CSV when network/Mongo unavailable.

Execution
---------
  python -m ash08.universe --help
  python ash08/universe.py --from-json path/to/instruments.json --build-core

Branch: ash08-adaptive-governor only. Never main.
"""

from __future__ import annotations

import argparse
import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

LOG = logging.getLogger("ash08.universe")

CORE_MIN = 150
CORE_MAX = 250
DISCOVERY_MAX = 5000
ADV20_MIN = 200_000
TURNOVER_CR_MIN = 5.0
UPSTOX_NSE_EQ_URL = (
    "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
)
UPSTOX_COMPLETE_URL = (
    "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz"
)


@dataclass
class InstrumentRow:
    """Normalized NSE equity instrument row for ASH08."""

    symbol: str
    name: str = ""
    instrument_key: str = ""
    exchange: str = "NSE"
    segment: str = "NSE_EQ"
    instrument_type: str = "EQ"
    isin: str = ""
    lot_size: int = 1
    tick_size: float = 0.05
    adv20: Optional[float] = None
    turnover_cr_5d: Optional[float] = None
    segment_tag: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class UniverseSnapshot:
    """Persisted universe membership snapshot."""

    asof: str
    bucket: str
    source: str
    count: int
    symbols: List[str] = field(default_factory=list)
    rows: List[Dict[str, Any]] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def normalize_upstox_row(raw: Dict[str, Any]) -> Optional[InstrumentRow]:
    """Map Upstox-style instrument dict to InstrumentRow. None if not NSE equity."""
    exchange = str(raw.get("exchange") or raw.get("Exchange") or "").upper()
    segment = str(raw.get("segment") or raw.get("Segment") or "").upper()
    itype = str(
        raw.get("instrument_type")
        or raw.get("instrumentType")
        or raw.get("InstrumentType")
        or ""
    ).upper()
    symbol = str(
        raw.get("trading_symbol")
        or raw.get("tradingsymbol")
        or raw.get("TradingSymbol")
        or raw.get("symbol")
        or ""
    ).strip().upper()
    if not symbol:
        return None
    if exchange and exchange not in ("NSE", "NSE_EQ"):
        if "NSE" not in exchange:
            return None
    if segment and segment not in ("NSE_EQ", "EQ", ""):
        if "EQ" not in segment and segment not in ("NSE_EQ",):
            return None
    if itype and itype not in ("EQ", "EQUITY", ""):
        return None

    key = str(
        raw.get("instrument_key")
        or raw.get("instrumentKey")
        or raw.get("InstrumentKey")
        or ""
    )
    name = str(raw.get("name") or raw.get("Name") or symbol)
    isin = str(raw.get("isin") or raw.get("ISIN") or "")
    lot = raw.get("lot_size") or raw.get("lotSize") or 1
    tick = raw.get("tick_size") or raw.get("tickSize") or 0.05
    try:
        lot_i = int(lot)
    except (TypeError, ValueError):
        lot_i = 1
    try:
        tick_f = float(tick)
    except (TypeError, ValueError):
        tick_f = 0.05

    return InstrumentRow(
        symbol=symbol,
        name=name,
        instrument_key=key,
        exchange="NSE",
        segment="NSE_EQ",
        instrument_type="EQ",
        isin=isin,
        lot_size=lot_i,
        tick_size=tick_f,
    )


def load_instruments_from_json(path: Path) -> List[InstrumentRow]:
    """Load instruments from local JSON (list or {data: [...]})."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        rows_raw = data.get("data") or data.get("instruments") or data.get("rows") or []
    else:
        rows_raw = data
    out: List[InstrumentRow] = []
    seen = set()
    for raw in rows_raw:
        if not isinstance(raw, dict):
            continue
        row = normalize_upstox_row(raw)
        if row is None or row.symbol in seen:
            continue
        seen.add(row.symbol)
        out.append(row)
    LOG.info("Loaded %s unique NSE_EQ-like rows from %s", len(out), path)
    return out


def load_instruments_from_csv_symbols(path: Path) -> List[InstrumentRow]:
    """Minimal loader: one symbol per line or CSV with symbol column."""
    text = path.read_text(encoding="utf-8").strip().splitlines()
    if not text:
        return []
    header = text[0].lower()
    out: List[InstrumentRow] = []
    seen = set()
    if "symbol" in header and "," in text[0]:
        cols = [c.strip().lower() for c in text[0].split(",")]
        try:
            idx = cols.index("symbol")
        except ValueError:
            idx = 0
        lines = text[1:]
        for line in lines:
            parts = [p.strip() for p in line.split(",")]
            if idx >= len(parts):
                continue
            sym = parts[idx].upper()
            if not sym or sym in seen:
                continue
            seen.add(sym)
            out.append(InstrumentRow(symbol=sym))
    else:
        for line in text:
            sym = line.split(",")[0].strip().upper()
            if not sym or sym in seen or sym == "SYMBOL":
                continue
            seen.add(sym)
            out.append(InstrumentRow(symbol=sym))
    LOG.info("Loaded %s symbols from %s", len(out), path)
    return out


def passes_core_liquidity(row: InstrumentRow) -> bool:
    """Apply Core hard liquidity filters when metrics are present."""
    if row.adv20 is not None and row.adv20 < ADV20_MIN:
        return False
    if row.turnover_cr_5d is not None and row.turnover_cr_5d < TURNOVER_CR_MIN:
        return False
    return True


def build_discovery(
    rows: Sequence[InstrumentRow],
    max_rows: int = DISCOVERY_MAX,
) -> UniverseSnapshot:
    """Discovery bucket: broad list, capped."""
    capped = list(rows)[:max_rows]
    return UniverseSnapshot(
        asof=_utc_now_iso(),
        bucket="discovery",
        source="upstox_or_local",
        count=len(capped),
        symbols=[r.symbol for r in capped],
        rows=[r.to_dict() for r in capped],
        notes=[f"capped_at={max_rows}", f"input={len(rows)}"],
    )


def build_core(
    rows: Sequence[InstrumentRow],
    target_min: int = CORE_MIN,
    target_max: int = CORE_MAX,
    prefer_symbols: Optional[Sequence[str]] = None,
) -> UniverseSnapshot:
    """Core bucket for paper desk (liquidity filter + prefer list + cap)."""
    prefer = {s.upper() for s in (prefer_symbols or [])}
    liquid = [r for r in rows if passes_core_liquidity(r)]
    if not liquid:
        liquid = list(rows)
        note_liq = "no_liquidity_metrics_all_candidates_kept"
    else:
        note_liq = f"liquidity_filtered={len(liquid)}/{len(rows)}"

    if prefer:
        ranked = sorted(
            liquid,
            key=lambda r: (0 if r.symbol in prefer else 1, r.symbol),
        )
    else:
        ranked = sorted(liquid, key=lambda r: r.symbol)

    selected = ranked[:target_max]
    notes = [
        note_liq,
        f"target_min={target_min}",
        f"target_max={target_max}",
        f"selected={len(selected)}",
    ]
    if len(selected) < target_min:
        notes.append("WARN_below_core_min")

    return UniverseSnapshot(
        asof=_utc_now_iso(),
        bucket="core",
        source="upstox_or_local",
        count=len(selected),
        symbols=[r.symbol for r in selected],
        rows=[r.to_dict() for r in selected],
        notes=notes,
    )


def save_snapshot(snap: UniverseSnapshot, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snap.to_dict(), indent=2), encoding="utf-8")
    LOG.info("Wrote %s (%s rows) -> %s", snap.bucket, snap.count, path)


def load_snapshot(path: Path) -> UniverseSnapshot:
    data = json.loads(path.read_text(encoding="utf-8"))
    return UniverseSnapshot(
        asof=data.get("asof", ""),
        bucket=data.get("bucket", ""),
        source=data.get("source", ""),
        count=int(data.get("count") or 0),
        symbols=list(data.get("symbols") or []),
        rows=list(data.get("rows") or []),
        notes=list(data.get("notes") or []),
    )


class UniverseManager:
    """ASH08 universe controller. JSON snapshots by default; Mongo optional later."""

    def __init__(self, data_dir: Path | str = "ash08_data") -> None:
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.core_path = self.data_dir / "universe_core.json"
        self.discovery_path = self.data_dir / "universe_discovery.json"

    def rebuild_from_rows(
        self,
        rows: Sequence[InstrumentRow],
        prefer_symbols: Optional[Sequence[str]] = None,
    ) -> Dict[str, UniverseSnapshot]:
        discovery = build_discovery(rows)
        core = build_core(rows, prefer_symbols=prefer_symbols)
        save_snapshot(discovery, self.discovery_path)
        save_snapshot(core, self.core_path)
        return {"core": core, "discovery": discovery}

    def load_core(self) -> Optional[UniverseSnapshot]:
        if not self.core_path.exists():
            return None
        return load_snapshot(self.core_path)

    def load_discovery(self) -> Optional[UniverseSnapshot]:
        if not self.discovery_path.exists():
            return None
        return load_snapshot(self.discovery_path)

    def status(self) -> Dict[str, Any]:
        core = self.load_core()
        disc = self.load_discovery()
        return {
            "core_count": core.count if core else 0,
            "core_asof": core.asof if core else None,
            "discovery_count": disc.count if disc else 0,
            "discovery_asof": disc.asof if disc else None,
            "core_path": str(self.core_path),
            "discovery_path": str(self.discovery_path),
            "policy": {
                "core_min": CORE_MIN,
                "core_max": CORE_MAX,
                "discovery_max": DISCOVERY_MAX,
                "core_refresh": "weekly",
                "discovery_refresh": "on_demand",
                "adv20_min": ADV20_MIN,
                "turnover_cr_min": TURNOVER_CR_MIN,
            },
        }


def _demo_rows(n: int = 300) -> List[InstrumentRow]:
    """Synthetic rows for offline unit check."""
    base = [
        "TCS", "INFY", "HDFCBANK", "ICICIBANK", "RELIANCE", "SBIN", "BHARTIARTL",
        "ITC", "LT", "AXISBANK", "KOTAKBANK", "HINDUNILVR", "BAJFINANCE", "ASIANPAINT",
        "MARUTI", "SUNPHARMA", "TITAN", "WIPRO", "ULTRACEMCO", "NESTLEIND",
    ]
    rows: List[InstrumentRow] = []
    for i in range(n):
        sym = base[i] if i < len(base) else f"SYM{i:04d}"
        rows.append(
            InstrumentRow(
                symbol=sym,
                name=sym,
                instrument_key=f"NSE_EQ|{sym}",
                adv20=500_000 if i < 200 else 50_000,
                turnover_cr_5d=20.0 if i < 200 else 1.0,
            )
        )
    return rows


def main(argv: Optional[Sequence[str]] = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    p = argparse.ArgumentParser(description="ASH08 Universe Manager (Phase 2)")
    p.add_argument("--data-dir", default="ash08_data", help="Snapshot directory")
    p.add_argument("--from-json", type=Path, help="Local Upstox-style instruments JSON")
    p.add_argument("--from-symbols", type=Path, help="Symbol list / CSV")
    p.add_argument("--prefer", type=Path, help="Preferred core symbols (N200 etc.)")
    p.add_argument("--demo", action="store_true", help="Build from synthetic demo rows")
    p.add_argument("--status", action="store_true", help="Print current snapshot status")
    args = p.parse_args(list(argv) if argv is not None else None)

    mgr = UniverseManager(data_dir=args.data_dir)

    if args.status:
        print(json.dumps(mgr.status(), indent=2))
        return 0

    rows: List[InstrumentRow] = []
    if args.from_json:
        rows = load_instruments_from_json(args.from_json)
    elif args.from_symbols:
        rows = load_instruments_from_csv_symbols(args.from_symbols)
    elif args.demo:
        rows = _demo_rows(300)
    else:
        p.error("Provide --from-json, --from-symbols, --demo, or --status")

    prefer: Optional[List[str]] = None
    if args.prefer and args.prefer.exists():
        prefer = [
            ln.split(",")[0].strip().upper()
            for ln in args.prefer.read_text(encoding="utf-8").splitlines()
            if ln.strip() and not ln.lower().startswith("symbol")
        ]

    result = mgr.rebuild_from_rows(rows, prefer_symbols=prefer)
    print(
        json.dumps(
            {
                "core_count": result["core"].count,
                "discovery_count": result["discovery"].count,
                "core_notes": result["core"].notes,
                "status": mgr.status(),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
