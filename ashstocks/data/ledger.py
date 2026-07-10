"""CSV ledger helpers for AshStocks source-of-truth tracking.

The app must record what was used, what failed, what was adopted, and why.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, fields
from datetime import datetime
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class LedgerRow:
    ts: str
    ledger: str
    item_id: str
    item_name: str
    status: str
    source: str
    reason: str
    next_action: str

    @classmethod
    def now(cls, ledger: str, item_id: str, item_name: str, status: str, source: str, reason: str, next_action: str) -> "LedgerRow":
        return cls(
            ts=datetime.utcnow().isoformat(),
            ledger=ledger,
            item_id=item_id,
            item_name=item_name,
            status=status,
            source=source,
            reason=reason,
            next_action=next_action,
        )


HEADER = [f.name for f in fields(LedgerRow)]


def append_rows(path: str | Path, rows: Iterable[LedgerRow]) -> int:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    exists = path.exists() and path.stat().st_size > 0
    rows = list(rows)
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=HEADER)
        if not exists:
            writer.writeheader()
        for row in rows:
            writer.writerow(row.__dict__)
    return len(rows)
