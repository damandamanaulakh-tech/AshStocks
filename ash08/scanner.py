"""
ASH08 Scanner — Phase 3
=======================
Apply LOCKED executable parameter gates on Core (or Discovery) membership.
Rank each name: SELECT / WATCH / REJECT.

Parameters (LOCKED — do not change without explicit approval)
------------------------------------------------------------
  P-ADV20     ADV20 >= 200,000 shares                         HARD
  P-TURNOVER  5D rupee turnover >= 5 Cr                       HARD
  P-STALE     last candle age <= 7 days                       HARD
  P-MOM       6M absolute momentum > 0                        HARD
  P-SCORE     0.65 * mom_score + 0.35 * quality_score         RANK
  P-CORR      corr vs any open holding <= 0.85                HARD (book)
  P-SELECT    score >= 70 AND all hard gates pass             DECISION
  P-WATCH     score in [55, 70) AND all hard gates pass       DECISION
  P-GOV       L0–L4 portfolio exposure                        (Phase 4)

Offline-safe: works with demo metrics and/or metrics JSON.

Execution
---------
  python ash08/scanner.py --demo
  python ash08/scanner.py --universe-core ash08_data/universe_core.json --metrics metrics.json

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

LOG = logging.getLogger("ash08.scanner")

ADV20_MIN = 200_000
TURNOVER_CR_MIN = 5.0
STALE_MAX_DAYS = 7
MOM_MIN = 0.0
SCORE_SELECT = 70.0
SCORE_WATCH = 55.0
CORR_MAX = 0.85
MOM_WEIGHT = 0.65
QUAL_WEIGHT = 0.35


@dataclass
class StockMetrics:
    symbol: str
    adv20: Optional[float] = None
    turnover_cr_5d: Optional[float] = None
    stale_days: Optional[float] = None
    mom_6m: Optional[float] = None
    quality_score: Optional[float] = None
    max_corr_vs_book: Optional[float] = None
    segment: str = ""
    ltp: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ParamHit:
    param_id: str
    passed: bool
    detail: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ScanRow:
    symbol: str
    decision: str
    score: float
    segment: str = ""
    ltp: Optional[float] = None
    reason: str = ""
    hits: List[ParamHit] = field(default_factory=list)
    hard_pass: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ScanSnapshot:
    asof: str
    universe_bucket: str
    universe_count: int
    select_count: int
    watch_count: int
    reject_count: int
    rows: List[Dict[str, Any]] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def mom_return_to_score(mom_6m: float) -> float:
    score = 50.0 + (mom_6m * 200.0)
    return max(0.0, min(100.0, score))


def compute_final_score(mom_6m: Optional[float], quality_score: Optional[float]) -> float:
    if mom_6m is None:
        mom_s = 50.0
    else:
        mom_s = mom_return_to_score(mom_6m)
    qual = 50.0 if quality_score is None else max(0.0, min(100.0, float(quality_score)))
    return round(MOM_WEIGHT * mom_s + QUAL_WEIGHT * qual, 2)


def evaluate_stock(m: StockMetrics, require_metrics: bool = False) -> ScanRow:
    hits: List[ParamHit] = []

    def gate(param_id: str, value: Optional[float], ok: bool, detail: str) -> bool:
        if value is None and not require_metrics:
            hits.append(ParamHit(param_id, True, f"{detail} (missing→skip)"))
            return True
        if value is None and require_metrics:
            hits.append(ParamHit(param_id, False, f"{detail} (missing→fail)"))
            return False
        hits.append(ParamHit(param_id, ok, detail))
        return ok

    if m.adv20 is not None:
        adv_ok = m.adv20 >= ADV20_MIN
        hits.append(ParamHit("P-ADV20", adv_ok, f"adv20={m.adv20:.0f} threshold={ADV20_MIN}"))
    else:
        adv_ok = gate("P-ADV20", None, True, f"threshold={ADV20_MIN}")

    if m.turnover_cr_5d is not None:
        t_ok = m.turnover_cr_5d >= TURNOVER_CR_MIN
        hits.append(ParamHit("P-TURNOVER", t_ok, f"turnover_cr_5d={m.turnover_cr_5d:.2f} threshold={TURNOVER_CR_MIN}"))
    else:
        t_ok = gate("P-TURNOVER", None, True, f"threshold={TURNOVER_CR_MIN}")

    if m.stale_days is not None:
        s_ok = m.stale_days <= STALE_MAX_DAYS
        hits.append(ParamHit("P-STALE", s_ok, f"stale_days={m.stale_days:.1f} max={STALE_MAX_DAYS}"))
    else:
        s_ok = gate("P-STALE", None, True, f"max={STALE_MAX_DAYS}")

    if m.mom_6m is not None:
        mom_ok = m.mom_6m > MOM_MIN
        hits.append(ParamHit("P-MOM", mom_ok, f"mom_6m={m.mom_6m:.4f} must_be_gt={MOM_MIN}"))
    else:
        mom_ok = gate("P-MOM", None, True, f"must_be_gt={MOM_MIN}")

    if m.max_corr_vs_book is not None:
        c_ok = m.max_corr_vs_book <= CORR_MAX
        hits.append(ParamHit("P-CORR", c_ok, f"max_corr={m.max_corr_vs_book:.3f} max_allowed={CORR_MAX}"))
    else:
        c_ok = gate("P-CORR", None, True, f"max_allowed={CORR_MAX}")

    hard_pass = adv_ok and t_ok and s_ok and mom_ok and c_ok
    score = compute_final_score(m.mom_6m, m.quality_score)
    hits.append(ParamHit("P-SCORE", True, f"score={score:.2f} weights={MOM_WEIGHT}/{QUAL_WEIGHT}"))

    if hard_pass and score >= SCORE_SELECT:
        decision = "SELECT"
        reason = f"hard gates pass · score {score:.1f} >= {SCORE_SELECT}"
    elif hard_pass and score >= SCORE_WATCH:
        decision = "WATCH"
        reason = f"hard gates pass · score {score:.1f} in [{SCORE_WATCH},{SCORE_SELECT})"
    else:
        decision = "REJECT"
        failed = [h.param_id for h in hits if not h.passed]
        if not hard_pass:
            reason = "hard gate fail: " + ",".join(failed) if failed else "hard gate fail"
        else:
            reason = f"score {score:.1f} < {SCORE_WATCH}"

    hits.append(ParamHit("P-SELECT", decision == "SELECT", f"decision={decision}"))

    return ScanRow(
        symbol=m.symbol,
        decision=decision,
        score=score,
        segment=m.segment,
        ltp=m.ltp,
        reason=reason,
        hits=hits,
        hard_pass=hard_pass,
    )


def run_scan(
    metrics: Sequence[StockMetrics],
    universe_bucket: str = "core",
    require_metrics: bool = False,
) -> ScanSnapshot:
    rows = [evaluate_stock(m, require_metrics=require_metrics) for m in metrics]
    rows_sorted = sorted(
        rows,
        key=lambda r: (
            0 if r.decision == "SELECT" else 1 if r.decision == "WATCH" else 2,
            -r.score,
            r.symbol,
        ),
    )
    select_n = sum(1 for r in rows_sorted if r.decision == "SELECT")
    watch_n = sum(1 for r in rows_sorted if r.decision == "WATCH")
    reject_n = sum(1 for r in rows_sorted if r.decision == "REJECT")
    return ScanSnapshot(
        asof=_utc_now_iso(),
        universe_bucket=universe_bucket,
        universe_count=len(rows_sorted),
        select_count=select_n,
        watch_count=watch_n,
        reject_count=reject_n,
        rows=[r.to_dict() for r in rows_sorted],
        notes=[
            f"require_metrics={require_metrics}",
            f"SCORE_SELECT={SCORE_SELECT}",
            f"SCORE_WATCH={SCORE_WATCH}",
        ],
    )


def metrics_from_dict_list(items: Sequence[Dict[str, Any]]) -> List[StockMetrics]:
    out: List[StockMetrics] = []
    for d in items:
        sym = str(d.get("symbol") or "").strip().upper()
        if not sym:
            continue
        out.append(
            StockMetrics(
                symbol=sym,
                adv20=_f(d.get("adv20")),
                turnover_cr_5d=_f(d.get("turnover_cr_5d")),
                stale_days=_f(d.get("stale_days")),
                mom_6m=_f(d.get("mom_6m")),
                quality_score=_f(d.get("quality_score")),
                max_corr_vs_book=_f(d.get("max_corr_vs_book")),
                segment=str(d.get("segment") or ""),
                ltp=_f(d.get("ltp")),
            )
        )
    return out


def _f(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def load_metrics_json(path: Path) -> List[StockMetrics]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        items = data.get("metrics") or data.get("rows") or data.get("data") or []
    else:
        items = data
    return metrics_from_dict_list(items)


def load_symbols_from_universe(path: Path) -> List[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    symbols = data.get("symbols") or []
    return [str(s).upper() for s in symbols]


def demo_metrics() -> List[StockMetrics]:
    return [
        StockMetrics("TCS", 800_000, 25.0, 1, 0.18, 75, 0.40, "IT", 3840),
        StockMetrics("HDFCBANK", 1_200_000, 40.0, 0, 0.12, 70, 0.35, "Finance", 1690),
        StockMetrics("INFY", 900_000, 22.0, 1, 0.08, 68, 0.45, "IT", 1520),
        StockMetrics("RELIANCE", 1_500_000, 50.0, 0, 0.03, 60, 0.50, "Energy", 2950),
        StockMetrics("ITC", 700_000, 15.0, 2, -0.05, 55, 0.30, "FMCG", 450),
        StockMetrics("THINNAME", 50_000, 1.0, 1, 0.20, 80, 0.20, "", 100),
        StockMetrics("STALECO", 400_000, 10.0, 12, 0.15, 70, 0.25, "", 200),
        StockMetrics("MIDWATCH", 300_000, 8.0, 1, 0.04, 52, 0.40, "Auto", 900),
    ]


def save_scan(snap: ScanSnapshot, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snap.to_dict(), indent=2), encoding="utf-8")
    LOG.info(
        "Scan saved %s SELECT=%s WATCH=%s REJECT=%s -> %s",
        snap.universe_bucket,
        snap.select_count,
        snap.watch_count,
        snap.reject_count,
        path,
    )


def main(argv: Optional[Sequence[str]] = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    p = argparse.ArgumentParser(description="ASH08 Scanner (Phase 3)")
    p.add_argument("--data-dir", default="ash08_data")
    p.add_argument("--metrics", type=Path)
    p.add_argument("--universe-core", type=Path)
    p.add_argument("--demo", action="store_true")
    p.add_argument("--require-metrics", action="store_true")
    p.add_argument("--status", action="store_true")
    args = p.parse_args(list(argv) if argv is not None else None)

    data_dir = Path(args.data_dir)
    out_path = data_dir / "scan_latest.json"

    if args.status:
        if not out_path.exists():
            print(json.dumps({"error": "no scan_latest.json"}, indent=2))
            return 1
        snap = json.loads(out_path.read_text(encoding="utf-8"))
        print(json.dumps({
            "asof": snap.get("asof"),
            "bucket": snap.get("universe_bucket"),
            "select": snap.get("select_count"),
            "watch": snap.get("watch_count"),
            "reject": snap.get("reject_count"),
            "universe_count": snap.get("universe_count"),
        }, indent=2))
        return 0

    if args.demo:
        metrics = demo_metrics()
        bucket = "demo"
    elif args.metrics:
        metrics = load_metrics_json(args.metrics)
        bucket = "core"
        if args.universe_core and args.universe_core.exists():
            allowed = set(load_symbols_from_universe(args.universe_core))
            metrics = [m for m in metrics if m.symbol in allowed]
    else:
        p.error("Provide --demo or --metrics")

    snap = run_scan(metrics, universe_bucket=bucket, require_metrics=args.require_metrics)
    save_scan(snap, out_path)
    print(json.dumps({
        "asof": snap.asof,
        "bucket": snap.universe_bucket,
        "select": snap.select_count,
        "watch": snap.watch_count,
        "reject": snap.reject_count,
        "top": [{
            "symbol": r["symbol"],
            "decision": r["decision"],
            "score": r["score"],
            "reason": r["reason"],
        } for r in snap.rows[:12]],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
