"""Ash08 Adaptive Risk Governor — thin JSON helpers for pure ASGI api.py.

Used by POST /api/risk/governor
"""

from __future__ import annotations

from typing import Any

from ashstocks.brain.adaptive_risk_governor import AdaptiveRiskGovernor, SignalFlags

# Single process-level governor (stateful repair tracking)
_GOV = AdaptiveRiskGovernor()


def evaluate_governor_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Evaluate flags and return a JSON-serialisable decision dict."""
    flags = SignalFlags(
        damage_cluster_5in10=bool(payload.get("damage_cluster_5in10", False)),
        fii_cash_stress_q10=bool(payload.get("fii_cash_stress_q10", False)),
        fii_sell_cluster_7in10=bool(payload.get("fii_sell_cluster_7in10", False)),
        fii_any_confirm=bool(payload.get("fii_any_confirm", False)),
        repair_after_damage_candidate=bool(payload.get("repair_after_damage_candidate", False)),
    )
    current = payload.get("current_exposure_pct")
    current_f = float(current) if current is not None else None
    decision = _GOV.evaluate(flags, current_exposure_pct=current_f)
    return {
        "ok": True,
        "app": "Ash08",
        "module": "adaptive_risk_governor",
        "version": "1.0.0",
        "lock_date": "2026-07-19",
        "severity": decision.severity.value,
        "target_exposure_pct": decision.target_exposure_pct,
        "fii_confirm_count": decision.fii_confirm_count,
        "action": decision.action,
        "rationale": decision.rationale,
        "previous_exposure_pct": decision.previous_exposure_pct,
        "is_repair_step": decision.is_repair_step,
        "meta": decision.meta,
        "paper_only": True,
    }


def reset_governor() -> dict[str, Any]:
    _GOV.reset()
    return {"ok": True, "app": "Ash08", "message": "governor state reset to L0 / 100%"}
