"""Real Upstox historical candle fetcher.

This module never returns fake OK. Network/API errors raise UpstoxCandleError.
The caller must store candles and log exact row counts.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Iterable
from urllib.parse import quote

import requests


BASE_URL = "https://api.upstox.com/v2/historical-candle"
ALLOWED_INTERVALS = {"1minute", "30minute", "day", "week", "month"}


class UpstoxCandleError(RuntimeError):
    pass


@dataclass(frozen=True)
class Candle:
    instrument_key: str
    interval: str
    ts: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    open_interest: float | None = None

    @classmethod
    def from_upstox_row(cls, instrument_key: str, interval: str, row: list) -> "Candle":
        if len(row) < 6:
            raise UpstoxCandleError(f"bad candle row length {len(row)}: {row!r}")
        return cls(
            instrument_key=instrument_key,
            interval=interval,
            ts=str(row[0]),
            open=float(row[1]),
            high=float(row[2]),
            low=float(row[3]),
            close=float(row[4]),
            volume=float(row[5]),
            open_interest=float(row[6]) if len(row) > 6 and row[6] is not None else None,
        )


def fetch_historical_candles(
    *,
    access_token: str,
    instrument_key: str,
    interval: str,
    from_date: date | str,
    to_date: date | str,
    timeout: float = 20.0,
) -> list[Candle]:
    """Fetch candles from Upstox v2 historical endpoint.

    Endpoint shape:
    /historical-candle/:instrument_key/:interval/:to_date/:from_date
    """
    if not access_token:
        raise UpstoxCandleError("UPSTOX_ACCESS_TOKEN missing")
    if not instrument_key:
        raise UpstoxCandleError("instrument_key missing")
    if interval not in ALLOWED_INTERVALS:
        raise UpstoxCandleError(f"unsupported interval {interval!r}; allowed={sorted(ALLOWED_INTERVALS)}")

    from_s = from_date.isoformat() if hasattr(from_date, "isoformat") else str(from_date)
    to_s = to_date.isoformat() if hasattr(to_date, "isoformat") else str(to_date)
    key = quote(instrument_key, safe="")
    url = f"{BASE_URL}/{key}/{interval}/{to_s}/{from_s}"
    headers = {"Accept": "application/json", "Authorization": f"Bearer {access_token}"}

    try:
        response = requests.get(url, headers=headers, timeout=timeout)
    except requests.RequestException as exc:
        raise UpstoxCandleError(f"Upstox network error: {exc}") from exc

    if response.status_code >= 400:
        raise UpstoxCandleError(f"Upstox HTTP {response.status_code}: {response.text[:500]}")

    try:
        body = response.json()
    except ValueError as exc:
        raise UpstoxCandleError(f"Upstox returned non-JSON body: {response.text[:300]}") from exc

    if body.get("status") not in {"success", "SUCCESS"}:
        raise UpstoxCandleError(f"Upstox status not success: {body!r}")

    raw_rows = (body.get("data") or {}).get("candles")
    if raw_rows is None:
        raise UpstoxCandleError(f"Upstox response missing data.candles: {body!r}")
    if not isinstance(raw_rows, list):
        raise UpstoxCandleError(f"Upstox candles not list: {type(raw_rows).__name__}")

    candles = [Candle.from_upstox_row(instrument_key, interval, row) for row in raw_rows]
    return candles


def candles_to_dicts(candles: Iterable[Candle]) -> list[dict]:
    return [c.__dict__.copy() for c in candles]
