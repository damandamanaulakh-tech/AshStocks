"""NSE FO bhavcopy parser.

This parses the real NSE FO CSV shape found in Drive, for example:
BhavCopy_NSE_FO_0_0_0_20260608_F_0000.csv

It is derivatives/OI data, not equity OHLC for the stock scanner.
"""

from __future__ import annotations

from dataclasses import dataclass
from io import StringIO

import pandas as pd


COLUMN_MAP = {
    "TradDt": "trade_date",
    "BizDt": "business_date",
    "Sgmt": "segment",
    "Src": "source",
    "FinInstrmTp": "instrument_type",
    "FinInstrmId": "instrument_id",
    "ISIN": "isin",
    "TckrSymb": "symbol",
    "SctySrs": "series",
    "XpryDt": "expiry_date",
    "FininstrmActlXpryDt": "actual_expiry_date",
    "StrkPric": "strike_price",
    "OptnTp": "option_type",
    "FinInstrmNm": "instrument_name",
    "OpnPric": "open",
    "HghPric": "high",
    "LwPric": "low",
    "ClsPric": "close",
    "LastPric": "last",
    "PrvsClsgPric": "prev_close",
    "UndrlygPric": "underlying_price",
    "SttlmPric": "settlement_price",
    "OpnIntrst": "open_interest",
    "ChngInOpnIntrst": "change_oi",
    "TtlTradgVol": "volume",
    "TtlTrfVal": "turnover",
    "TtlNbOfTxsExctd": "trades",
    "SsnId": "session_id",
    "NewBrdLotQty": "lot_size",
}

NUMERIC_COLS = [
    "strike_price", "open", "high", "low", "close", "last", "prev_close",
    "underlying_price", "settlement_price", "open_interest", "change_oi",
    "volume", "turnover", "trades", "lot_size",
]

DATE_COLS = ["trade_date", "business_date", "expiry_date", "actual_expiry_date"]


@dataclass(frozen=True)
class ParseResult:
    rows_parsed: int
    date_min: str | None
    date_max: str | None
    distinct_symbols: int
    columns: list[str]
    dataframe: pd.DataFrame

    def summary(self) -> dict:
        return {
            "rows_parsed": self.rows_parsed,
            "date_min": self.date_min,
            "date_max": self.date_max,
            "distinct_symbols": self.distinct_symbols,
            "columns": self.columns,
        }


def parse_nse_fo_bhavcopy_csv(csv_text: str) -> ParseResult:
    if not csv_text or not csv_text.strip():
        raise ValueError("empty NSE FO bhavcopy csv_text")
    df = pd.read_csv(StringIO(csv_text))
    missing = [c for c in ["TradDt", "TckrSymb", "FinInstrmTp", "ClsPric", "OpnIntrst"] if c not in df.columns]
    if missing:
        raise ValueError(f"not NSE FO bhavcopy shape; missing columns: {missing}")

    df = df.rename(columns={k: v for k, v in COLUMN_MAP.items() if k in df.columns})
    keep = [c for c in COLUMN_MAP.values() if c in df.columns]
    df = df[keep].copy()

    for col in DATE_COLS:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce").dt.date.astype("string")
    for col in NUMERIC_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    date_min = str(df["trade_date"].min()) if "trade_date" in df and not df.empty else None
    date_max = str(df["trade_date"].max()) if "trade_date" in df and not df.empty else None
    distinct_symbols = int(df["symbol"].nunique()) if "symbol" in df else 0
    return ParseResult(
        rows_parsed=int(len(df)),
        date_min=date_min,
        date_max=date_max,
        distinct_symbols=distinct_symbols,
        columns=list(df.columns),
        dataframe=df,
    )
