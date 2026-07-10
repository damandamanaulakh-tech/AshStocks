"""Render-side Q1 FII 20D Upstox historical price join.

This script reads UPSTOX_ACCESS_TOKEN from the process environment, fetches
historical daily candles only, and writes CSV outputs for the Q1 workflow. It
never places orders and never prints the token.
"""

from __future__ import annotations

import argparse
import csv
import os
import time
from dataclasses import asdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable

from ashstocks.data.upstox_candles import Candle, fetch_historical_candles

FII_SYMBOL_FILE = "fii_symbol_daily.csv"
RANKED_FILE = "Q1_FII_20D_ranked_top_bottom_deciles_READY_FOR_PRICE_JOIN.csv"
DAILY_CLOSE_FILE = "daily_close_by_scrip.csv"
NIFTY_CLOSE_FILE = "nifty_daily_close.csv"
RESULT_FILE = "Q1_FII_20D_forward_return_result.csv"
SUMMARY_FILE = "Q1_FII_20D_summary.csv"
NIFTY_INSTRUMENT_KEY = "NSE_INDEX|Nifty 50"


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(value.strip()[:10], fmt).date()
        except ValueError:
            continue
    return None


def _coalesce(row: dict[str, str], names: Iterable[str]) -> str:
    lowered = {key.lower().strip(): value for key, value in row.items()}
    for name in names:
        value = lowered.get(name.lower())
        if value not in (None, ""):
            return value.strip()
    return ""


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def _write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def _symbol_map(rows: list[dict[str, str]]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for row in rows:
        symbol = _coalesce(row, ("symbol", "tradingsymbol", "ticker", "scrip", "scrip_name"))
        key = _coalesce(row, ("instrument_key", "instrumentKey", "upstox_instrument_key", "token"))
        if symbol and key:
            mapping[symbol.upper()] = key
    return mapping


def _ranked_items(rows: list[dict[str, str]], mapping: dict[str, str]) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for row in rows:
        symbol = _coalesce(row, ("symbol", "tradingsymbol", "ticker", "scrip", "scrip_name"))
        key = _coalesce(row, ("instrument_key", "instrumentKey", "upstox_instrument_key", "token"))
        signal_date = _parse_date(_coalesce(row, ("date", "signal_date", "trade_date", "asof_date")))
        bucket = _coalesce(row, ("bucket", "decile", "side", "rank_bucket"))
        if symbol and not key:
            key = mapping.get(symbol.upper(), "")
        if symbol and key and signal_date:
            copied = dict(row)
            copied["symbol"] = symbol
            copied["instrument_key"] = key
            copied["signal_date"] = signal_date.isoformat()
            copied["bucket"] = bucket
            items.append(copied)
    return items


def _fetch_daily(access_token: str, instrument_key: str, start: date, end: date) -> list[Candle]:
    return fetch_historical_candles(
        access_token=access_token,
        instrument_key=instrument_key,
        interval="day",
        from_date=start,
        to_date=end,
    )


def _first_close_on_or_after(closes: dict[str, float], day: date, max_days: int = 8) -> tuple[str, float] | tuple[None, None]:
    for offset in range(max_days + 1):
        key = (day + timedelta(days=offset)).isoformat()
        if key in closes:
            return key, closes[key]
    return None, None


def _forward_rows(items: list[dict[str, str]], candle_rows: list[dict]) -> list[dict]:
    grouped: dict[str, dict[str, float]] = {}
    for row in candle_rows:
        grouped.setdefault(row["instrument_key"], {})[row["date"]] = float(row["close"])

    results = []
    for item in items:
        signal_day = _parse_date(item["signal_date"])
        if signal_day is None:
            continue
        closes = grouped.get(item["instrument_key"], {})
        entry_date, entry_close = _first_close_on_or_after(closes, signal_day)
        fwd_date, fwd_close = _first_close_on_or_after(closes, signal_day + timedelta(days=20), 12)
        forward_return = ""
        if entry_close and fwd_close:
            forward_return = round((fwd_close / entry_close - 1.0) * 100.0, 6)
        results.append(
            {
                "symbol": item["symbol"],
                "instrument_key": item["instrument_key"],
                "bucket": item.get("bucket", ""),
                "signal_date": item["signal_date"],
                "entry_date": entry_date or "",
                "entry_close": entry_close if entry_close is not None else "",
                "forward_20d_date": fwd_date or "",
                "forward_20d_close": fwd_close if fwd_close is not None else "",
                "forward_20d_return_pct": forward_return,
            }
        )
    return results


def _summary_rows(results: list[dict], fetched_symbols: int, errors: list[str]) -> list[dict]:
    numeric = [float(r["forward_20d_return_pct"]) for r in results if r.get("forward_20d_return_pct") != ""]
    avg = round(sum(numeric) / len(numeric), 6) if numeric else ""
    return [
        {"metric": "ranked_rows", "value": len(results)},
        {"metric": "rows_with_forward_return", "value": len(numeric)},
        {"metric": "average_forward_20d_return_pct", "value": avg},
        {"metric": "fetched_symbols", "value": fetched_symbols},
        {"metric": "fetch_errors", "value": len(errors)},
    ]


def run(input_dir: Path, output_dir: Path, pause_seconds: float) -> dict[str, int]:
    token = os.getenv("UPSTOX_ACCESS_TOKEN")
    if not token:
        raise RuntimeError("UPSTOX_ACCESS_TOKEN missing")

    symbol_rows = _read_csv(input_dir / FII_SYMBOL_FILE)
    ranked_source_rows = _read_csv(input_dir / RANKED_FILE)
    mapping = _symbol_map(symbol_rows)
    items = _ranked_items(ranked_source_rows, mapping)
    if not items:
        raise RuntimeError("no Q1 ranked rows with symbol, instrument_key and signal_date")

    signal_dates = [_parse_date(item["signal_date"]) for item in items]
    start = min(day for day in signal_dates if day is not None) - timedelta(days=5)
    end = max(day for day in signal_dates if day is not None) + timedelta(days=45)

    candle_rows: list[dict] = []
    errors: list[str] = []
    unique_symbols = {(item["symbol"], item["instrument_key"]) for item in items}
    for symbol, key in sorted(unique_symbols):
        try:
            candles = _fetch_daily(token, key, start, end)
            for candle in candles:
                row = asdict(candle)
                row["symbol"] = symbol
                row["date"] = candle.ts[:10]
                candle_rows.append(row)
        except Exception as exc:  # noqa: BLE001 - recorded in output summary without token context.
            errors.append(f"{symbol}: {exc}")
        if pause_seconds:
            time.sleep(pause_seconds)

    nifty_rows: list[dict] = []
    try:
        for candle in _fetch_daily(token, NIFTY_INSTRUMENT_KEY, start, end):
            nifty_rows.append({"date": candle.ts[:10], "close": candle.close, "instrument_key": candle.instrument_key})
    except Exception as exc:  # noqa: BLE001
        errors.append(f"NIFTY: {exc}")

    results = _forward_rows(items, candle_rows)
    summary = _summary_rows(results, len(unique_symbols), errors)

    _write_csv(
        output_dir / DAILY_CLOSE_FILE,
        candle_rows,
        ["symbol", "instrument_key", "date", "ts", "open", "high", "low", "close", "volume", "open_interest", "interval"],
    )
    _write_csv(output_dir / NIFTY_CLOSE_FILE, nifty_rows, ["date", "close", "instrument_key"])
    _write_csv(
        output_dir / RESULT_FILE,
        results,
        [
            "symbol",
            "instrument_key",
            "bucket",
            "signal_date",
            "entry_date",
            "entry_close",
            "forward_20d_date",
            "forward_20d_close",
            "forward_20d_return_pct",
        ],
    )
    _write_csv(output_dir / SUMMARY_FILE, summary, ["metric", "value"])
    if errors:
        _write_csv(output_dir / "Q1_FII_20D_fetch_errors.csv", [{"error": e} for e in errors], ["error"])

    return {"symbols": len(unique_symbols), "candles": len(candle_rows), "results": len(results), "errors": len(errors)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", default="data/q1_inputs")
    parser.add_argument("--output-dir", default="data/q1_outputs")
    parser.add_argument("--pause-seconds", type=float, default=0.2)
    args = parser.parse_args()
    stats = run(Path(args.input_dir), Path(args.output_dir), args.pause_seconds)
    print({"ok": True, **stats})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
