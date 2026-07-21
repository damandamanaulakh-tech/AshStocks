#!/usr/bin/env python3
"""
AM-07 Adaptive Risk Governor — IFR + FII Cash Stack
===================================================
LOCKED v1.0  |  Paper-trading ready  |  2026-07-19

Primary purpose
---------------
Convert daily market-damage and FII-cash flags into a single
target portfolio exposure percentage (L0 → L4).

This module is intentionally pure and side-effect free so it can be:
  - unit-tested
  - called from a paper-trading loop
  - later wrapped by a live order engine

Locked exposure table (do not change without formal re-lock)
-----------------------------------------------------------
L0 Normal          : DAMAGE=False                     → 100%
L1 Damage Only     : DAMAGE=True,  FII confirms = 0   →  70%
L2 Confirmed       : DAMAGE=True,  FII confirms = 1   →  50%
L3 High Severity   : DAMAGE=True,  FII confirms ≥ 2   →  25%
L4 Extreme         : DAMAGE=True + Q10 + SellCluster  →  15%

Repair rule
-----------
When REPAIR_AFTER_DAMAGE_CANDIDATE becomes True, exposure is
raised stepwise (never jump L4 → L0 in one day).

Execution
---------
    from ashstocks.brain.adaptive_risk_governor import AdaptiveRiskGovernor, SignalFlags

    gov = AdaptiveRiskGovernor()
    flags = SignalFlags(
        damage_cluster_5in10=True,
        fii_cash_stress_q10=True,
        fii_sell_cluster_7in10=False,
        fii_any_confirm=True,
        repair_after_damage_candidate=False,
    )
    decision = gov.evaluate(flags)
    print(decision.target_exposure_pct)   # e.g. 25.0

App    : Ash08 (AshStocks)
Author : AM-07 Quantitative Core → Ash08
Status : LOCKED for paper trading
Package: ashstocks.brain.adaptive_risk_governor
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

__version__ = "1.0.0"
__lock_date__ = "2026-07-19"
__status__ = "LOCKED_FOR_PAPER"

logger = logging.getLogger("ashstocks.brain.adaptive_risk_governor")


class SeverityLevel(str, Enum):
    L0_NORMAL = "L0_NORMAL"
    L1_DAMAGE_ONLY = "L1_DAMAGE_ONLY"
    L2_CONFIRMED = "L2_CONFIRMED"
    L3_HIGH_SEVERITY = "L3_HIGH_SEVERITY"
    L4_EXTREME = "L4_EXTREME"


EXPOSURE_TABLE: dict[SeverityLevel, float] = {
    SeverityLevel.L0_NORMAL: 100.0,
    SeverityLevel.L1_DAMAGE_ONLY: 70.0,
    SeverityLevel.L2_CONFIRMED: 50.0,
    SeverityLevel.L3_HIGH_SEVERITY: 25.0,
    SeverityLevel.L4_EXTREME: 15.0,
}


@dataclass(frozen=True)
class SignalFlags:
    damage_cluster_5in10: bool = False
    fii_cash_stress_q10: bool = False
    fii_sell_cluster_7in10: bool = False
    fii_any_confirm: bool = False
    repair_after_damage_candidate: bool = False

    def fii_confirm_count(self) -> int:
        return sum([
            self.fii_cash_stress_q10,
            self.fii_sell_cluster_7in10,
            self.fii_any_confirm,
        ])

    def is_extreme(self) -> bool:
        return self.fii_cash_stress_q10 and self.fii_sell_cluster_7in10


@dataclass
class GovernorDecision:
    severity: SeverityLevel
    target_exposure_pct: float
    fii_confirm_count: int
    action: str
    rationale: str
    previous_exposure_pct: Optional[float] = None
    is_repair_step: bool = False
    meta: dict = field(default_factory=dict)

    def __str__(self) -> str:
        return (
            f"{self.severity.value} | "
            f"exposure={self.target_exposure_pct:.0f}% | "
            f"{self.action}"
        )


class AdaptiveRiskGovernor:
    def __init__(
        self,
        extreme_exposure_pct: float = 15.0,
        max_step_up_pct: float = 25.0,
    ) -> None:
        if not (10.0 <= extreme_exposure_pct <= 25.0):
            raise ValueError(
                "extreme_exposure_pct must stay inside locked band 10-25%"
            )
        self.extreme_exposure_pct = float(extreme_exposure_pct)
        self.max_step_up_pct = float(max_step_up_pct)
        self._last_exposure: float = 100.0
        self._last_severity: SeverityLevel = SeverityLevel.L0_NORMAL
        logger.info(
            "AdaptiveRiskGovernor initialised | extreme=%.1f%% | max_step_up=%.1f%%",
            self.extreme_exposure_pct,
            self.max_step_up_pct,
        )

    def evaluate(
        self,
        flags: SignalFlags,
        current_exposure_pct: Optional[float] = None,
    ) -> GovernorDecision:
        if current_exposure_pct is not None:
            self._last_exposure = float(current_exposure_pct)

        severity = self._classify_severity(flags)

        if severity == SeverityLevel.L4_EXTREME:
            base_target = self.extreme_exposure_pct
        else:
            base_target = EXPOSURE_TABLE[severity]

        is_repair = False
        if flags.repair_after_damage_candidate and severity == SeverityLevel.L0_NORMAL:
            target, is_repair = self._apply_repair_step(base_target)
        else:
            target = base_target

        decision = GovernorDecision(
            severity=severity,
            target_exposure_pct=round(target, 2),
            fii_confirm_count=flags.fii_confirm_count(),
            action=self._action_label(severity, is_repair),
            rationale=self._rationale(flags, severity, is_repair),
            previous_exposure_pct=self._last_exposure,
            is_repair_step=is_repair,
            meta={
                "damage": flags.damage_cluster_5in10,
                "q10": flags.fii_cash_stress_q10,
                "sell_cluster": flags.fii_sell_cluster_7in10,
                "any_confirm": flags.fii_any_confirm,
                "repair_flag": flags.repair_after_damage_candidate,
                "version": __version__,
                "lock_date": __lock_date__,
            },
        )

        self._last_exposure = decision.target_exposure_pct
        self._last_severity = decision.severity
        logger.info("Decision: %s", decision)
        return decision

    def reset(self) -> None:
        self._last_exposure = 100.0
        self._last_severity = SeverityLevel.L0_NORMAL
        logger.info("Governor state reset to L0 / 100%%")

    def _classify_severity(self, flags: SignalFlags) -> SeverityLevel:
        if not flags.damage_cluster_5in10:
            return SeverityLevel.L0_NORMAL
        if flags.is_extreme():
            return SeverityLevel.L4_EXTREME
        count = flags.fii_confirm_count()
        if count >= 2:
            return SeverityLevel.L3_HIGH_SEVERITY
        if count == 1:
            return SeverityLevel.L2_CONFIRMED
        return SeverityLevel.L1_DAMAGE_ONLY

    def _apply_repair_step(self, full_target: float) -> tuple[float, bool]:
        if self._last_exposure >= full_target:
            return full_target, False
        proposed = self._last_exposure + self.max_step_up_pct
        new_exp = min(proposed, full_target)
        return new_exp, True

    @staticmethod
    def _action_label(severity: SeverityLevel, is_repair: bool) -> str:
        if is_repair:
            return "STEPWISE_RE_RISK"
        mapping = {
            SeverityLevel.L0_NORMAL: "FULL_RISK_ON",
            SeverityLevel.L1_DAMAGE_ONLY: "REDUCE_NEW_RISK",
            SeverityLevel.L2_CONFIRMED: "HALVE_EXPOSURE",
            SeverityLevel.L3_HIGH_SEVERITY: "DEFENSIVE",
            SeverityLevel.L4_EXTREME: "MINIMUM_RISK",
        }
        return mapping[severity]

    @staticmethod
    def _rationale(
        flags: SignalFlags,
        severity: SeverityLevel,
        is_repair: bool,
    ) -> str:
        if is_repair:
            return "Repair candidate active — increasing exposure stepwise"
        if severity == SeverityLevel.L0_NORMAL:
            return "No DAMAGE_CLUSTER_5IN10 — normal regime"
        parts = ["DAMAGE_CLUSTER_5IN10 active"]
        if flags.fii_cash_stress_q10:
            parts.append("FII_CASH_STRESS_Q10")
        if flags.fii_sell_cluster_7in10:
            parts.append("FII_SELL_CLUSTER_7IN10")
        if flags.fii_any_confirm:
            parts.append("FII_ANY_CONFIRM")
        return " + ".join(parts)


def create_governor(**kwargs) -> AdaptiveRiskGovernor:
    return AdaptiveRiskGovernor(**kwargs)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    gov = AdaptiveRiskGovernor()
    scenarios = [
        ("Normal day", SignalFlags()),
        ("Damage only", SignalFlags(damage_cluster_5in10=True)),
        ("Damage + 1 confirm", SignalFlags(
            damage_cluster_5in10=True, fii_any_confirm=True
        )),
        ("Damage + 2 confirms", SignalFlags(
            damage_cluster_5in10=True,
            fii_cash_stress_q10=True,
            fii_any_confirm=True,
        )),
        ("Extreme (Q10 + Sell)", SignalFlags(
            damage_cluster_5in10=True,
            fii_cash_stress_q10=True,
            fii_sell_cluster_7in10=True,
        )),
        ("Repair step", SignalFlags(
            damage_cluster_5in10=False,
            repair_after_damage_candidate=True,
        )),
    ]
    print("\n=== AdaptiveRiskGovernor Self-Check ===\n")
    for name, flags in scenarios:
        d = gov.evaluate(flags)
        print(f"{name:25s} → {d}")
    print("\nModule ready for import.")
