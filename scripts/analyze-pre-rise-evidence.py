#!/usr/bin/env python3
"""Audit pre-rise signals using only information available at each signal date.

This analysis script is intentionally separate from the live runtime. It labels a
future rise only for validation and never exposes those labels to the feature
calculations.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd


MAIN_RISE_COLUMN = "rise_8pct_10d"
SPLIT_DATE = pd.Timestamp("2021-01-01")


def rolling_obv(group: pd.DataFrame) -> pd.Series:
    direction = np.sign(group["close"].pct_change()).fillna(0)
    return (direction * group["tot_traded_qty"].fillna(0)).cumsum()


def add_stock_features(group: pd.DataFrame) -> pd.DataFrame:
    group = group.sort_values("trade_date").copy()
    close = group["close"]
    high = group["high"]
    low = group["low"]
    volume = group["tot_traded_qty"]
    delivery = group["deliv_perc"]
    previous_close = close.shift(1)

    group["ret_1d"] = close.pct_change()
    group["ret_5d"] = close.pct_change(5)
    group["ret_20d"] = close.pct_change(20)
    group["ma_20d"] = close.rolling(20, min_periods=20).mean()
    group["ma_50d"] = close.rolling(50, min_periods=50).mean()
    group["prior_high_20d"] = high.shift(1).rolling(20, min_periods=20).max()
    group["base_width_10d"] = (
        high.rolling(10, min_periods=10).max()
        - low.rolling(10, min_periods=10).min()
    ) / close
    group["volume_avg_5d"] = volume.rolling(5, min_periods=5).mean()
    group["volume_avg_20d"] = volume.rolling(20, min_periods=20).mean()
    group["volume_ratio_20d"] = volume / group["volume_avg_20d"]
    group["delivery_avg_20d"] = delivery.rolling(20, min_periods=20).mean()
    group["delivery_ratio_20d"] = delivery / group["delivery_avg_20d"]

    true_range = pd.concat(
        [
            high - low,
            (high - previous_close).abs(),
            (low - previous_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    group["atr_14d_pct"] = true_range.rolling(14, min_periods=14).mean() / close
    group["atr_20pct_threshold"] = (
        group["atr_14d_pct"].rolling(252, min_periods=100).quantile(0.20)
    )

    std_20d = close.rolling(20, min_periods=20).std()
    group["bb_width_20d"] = 4 * std_20d / group["ma_20d"]
    group["bb_width_20pct_threshold"] = (
        group["bb_width_20d"].rolling(252, min_periods=100).quantile(0.20)
    )

    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14, min_periods=14).mean()
    loss = (-delta.clip(upper=0)).rolling(14, min_periods=14).mean()
    rs = gain / loss.replace(0, np.nan)
    group["rsi_14d"] = 100 - (100 / (1 + rs))

    group["obv"] = rolling_obv(group)
    group["obv_up_10d"] = group["obv"] > group["obv"].shift(10)
    candle_range = (high - low).replace(0, np.nan)
    group["close_location"] = (close - low) / candle_range
    group["close_location_5d"] = (
        group["close_location"].rolling(5, min_periods=5).mean()
    )
    inside = (high <= high.shift(1)) & (low >= low.shift(1))
    group["inside_count_10d"] = inside.rolling(10, min_periods=10).sum()

    future_closes_10 = pd.concat([close.shift(-step) for step in range(1, 11)], axis=1)
    future_closes_20 = pd.concat([close.shift(-step) for step in range(1, 21)], axis=1)
    group["future_max_return_10d"] = future_closes_10.max(axis=1) / close - 1
    group["future_close_return_10d"] = close.shift(-10) / close - 1
    group["future_max_return_20d"] = future_closes_20.max(axis=1) / close - 1
    group["rise_5pct_10d"] = group["future_max_return_10d"] >= 0.05
    group["rise_8pct_10d"] = group["future_max_return_10d"] >= 0.08
    group["rise_10pct_10d"] = group["future_max_return_10d"] >= 0.10
    group["rise_8pct_20d"] = group["future_max_return_20d"] >= 0.08
    group["future_complete_10d"] = close.shift(-10).notna()
    group["future_complete_20d"] = close.shift(-20).notna()
    hit_8pct = future_closes_10.div(close, axis=0).sub(1).ge(0.08)
    group["days_to_rise_8pct"] = hit_8pct.apply(
        lambda row: next(
            (step for step, hit in enumerate(row.tolist(), start=1) if hit),
            np.nan,
        ),
        axis=1,
    )
    previous_rise = pd.concat(
        [group["rise_8pct_10d"].shift(step).fillna(False) for step in range(1, 6)],
        axis=1,
    ).any(axis=1)
    group["rise_event_anchor"] = group["rise_8pct_10d"] & ~previous_rise
    return group


def load_overlay(path: str | None, date_column: str) -> pd.DataFrame | None:
    if not path:
        return None
    frame = pd.read_csv(path)
    frame[date_column] = pd.to_datetime(frame[date_column], errors="coerce")
    return frame.dropna(subset=[date_column]).drop_duplicates(date_column)


def assign_fii_symbol(name: object) -> str | None:
    text = str(name).upper().strip()
    rules = [
        ("BAJAJFINSV", ("BAJAJ FINSERV",), ()),
        ("BAJFINANCE", ("BAJAJ FINANCE",), ()),
        ("BHARTIARTL", ("BHARTI AIRTEL",), ("INFRATEL",)),
        ("DRREDDY", ("REDDY",), ()),
        ("HDFCBANK", ("HDFC BANK",), ()),
        ("HINDUNILVR", ("HINDUSTAN UNILEVER", "HINDUSTAN LEVER"), ()),
        ("ICICIBANK", ("ICICI BANK",), ()),
        ("INFY", ("INFOSYS",), ()),
        (
            "M&M",
            ("MAHINDRA AND MAHINDRA LTD", "MAHINDRA & MAHINDRA LTD"),
            ("FINANC", "KOTAK"),
        ),
        ("MARUTI", ("MARUTI SUZUKI",), ()),
        ("ONGC", ("OIL AND NATURAL GAS", "ONGC LTD"), ()),
        ("RELIANCE", ("RELIANCE INDUSTRIES",), ("COMMUNICATION",)),
        ("SBIN", ("STATE BANK OF INDIA",), ()),
        ("SUNPHARMA", ("SUN PHARMA", "SUN PHARMACEUTICAL"), ("ADVANCE RESEARCH",)),
        ("TATASTEEL", ("TATA STEEL",), ()),
        ("TCS", ("TATA CONSULTANCY SERVICES",), ()),
    ]
    for symbol, includes, excludes in rules:
        if any(token in text for token in includes) and not any(
            token in text for token in excludes
        ):
            return symbol
    return None


def add_overlays(
    frame: pd.DataFrame,
    vix_path: str | None,
    fii_aggregate_path: str | None,
    fii_derivatives_path: str | None,
    fii_dii_path: str | None,
    fii_symbol_path: str | None,
) -> pd.DataFrame:
    result = frame.copy()

    vix = load_overlay(vix_path, "Date")
    if vix is not None:
        vix = vix.sort_values("Date")
        vix["vix_change_5d"] = vix["India_VIX"].diff(5)
        result = result.merge(
            vix[["Date", "India_VIX", "vix_change_5d"]].rename(
                columns={"Date": "trade_date"}
            ),
            on="trade_date",
            how="left",
        )

    fii_aggregate = load_overlay(fii_aggregate_path, "date")
    if fii_aggregate is not None:
        result = result.merge(
            fii_aggregate[
                ["date", "fii_net_cr_5d", "fii_net_cr_20d", "fii_net_z20"]
            ].rename(columns={"date": "trade_date"}),
            on="trade_date",
            how="left",
        )

    derivatives = load_overlay(fii_derivatives_path, "trade_date")
    if derivatives is not None:
        derivatives = derivatives.sort_values("trade_date")
        derivatives["fii_index_fut_net_5d_chg"] = derivatives[
            "fii_index_fut_net"
        ].diff(5)
        result = result.merge(
            derivatives[
                [
                    "trade_date",
                    "fii_index_fut_net",
                    "fii_index_fut_long_pct",
                    "fii_total_long_pct",
                    "fii_index_fut_net_5d_chg",
                ]
            ],
            on="trade_date",
            how="left",
        )

    fii_dii = load_overlay(fii_dii_path, "trade_date")
    if fii_dii is not None:
        fii_dii = fii_dii.sort_values("trade_date")
        fii_dii["fii_cash_net_5d"] = fii_dii[
            "fii_net_purchase_sales_cr"
        ].rolling(5, min_periods=5).sum()
        fii_dii["dii_cash_net_5d"] = fii_dii[
            "dii_net_purchase_sales_cr"
        ].rolling(5, min_periods=5).sum()
        result = result.merge(
            fii_dii[
                ["trade_date", "fii_cash_net_5d", "dii_cash_net_5d"]
            ],
            on="trade_date",
            how="left",
        )

    if fii_symbol_path:
        stock_fii = pd.read_csv(fii_symbol_path)
        stock_fii["trade_date"] = pd.to_datetime(stock_fii["date"], errors="coerce")
        stock_fii["symbol"] = stock_fii["scrip"].map(assign_fii_symbol)
        stock_fii = stock_fii.dropna(subset=["trade_date", "symbol"])
        stock_fii = (
            stock_fii.groupby(["trade_date", "symbol"], as_index=False)["fii_net_cr"]
            .sum()
            .sort_values(["symbol", "trade_date"])
        )
        stock_fii["stock_fii_net_5d"] = stock_fii.groupby("symbol")[
            "fii_net_cr"
        ].transform(lambda series: series.rolling(5, min_periods=5).sum())
        result = result.merge(
            stock_fii[["trade_date", "symbol", "stock_fii_net_5d"]],
            on=["trade_date", "symbol"],
            how="left",
        )

    return result


def boolean_with_availability(
    condition: pd.Series, availability: pd.Series
) -> pd.Series:
    return condition.astype("boolean").where(availability)


def define_signals(frame: pd.DataFrame) -> dict[str, pd.Series]:
    enough_history = frame["ma_50d"].notna()
    trend = (frame["close"] > frame["ma_20d"]) & (
        frame["ma_20d"] > frame["ma_50d"]
    )
    rsi_mid = frame["rsi_14d"].between(45, 70, inclusive="both")
    compression = frame["base_width_10d"] <= 0.08
    near_high = frame["close"] >= 0.95 * frame["prior_high_20d"]
    volume_dry = frame["volume_avg_5d"] <= 0.80 * frame["volume_avg_20d"]
    delivery_high = frame["delivery_ratio_20d"] >= 1.10
    positive_rs = frame["ret_20d"] > frame["market_median_ret_20d"]
    obv_up = frame["obv_up_10d"].fillna(False)
    close_location = frame["close_location_5d"] >= 0.55
    atr_compressed = frame["atr_14d_pct"] <= frame["atr_20pct_threshold"]
    bb_squeeze = frame["bb_width_20d"] <= frame["bb_width_20pct_threshold"]
    volume_wake = (frame["volume_ratio_20d"] >= 1.50) & (frame["ret_1d"] > 0)
    breakout = (frame["close"] > frame["prior_high_20d"]) & (
        frame["volume_ratio_20d"] >= 1.20
    )

    signals: dict[str, pd.Series] = {
        "TREND_CLOSE_GT_MA20_GT_MA50": boolean_with_availability(trend, enough_history),
        "POSITIVE_20D_RELATIVE_STRENGTH": boolean_with_availability(
            positive_rs, enough_history
        ),
        "RSI_45_TO_70": boolean_with_availability(rsi_mid, enough_history),
        "WITHIN_5PCT_OF_PRIOR_20D_HIGH": boolean_with_availability(
            near_high, enough_history
        ),
        "BASE_WIDTH_10D_LE_8PCT": boolean_with_availability(
            compression, enough_history
        ),
        "VOLUME_DRYUP_5D_VS_20D": boolean_with_availability(
            volume_dry, enough_history
        ),
        "DELIVERY_PCT_GE_1_1X_20D": boolean_with_availability(
            delivery_high, enough_history
        ),
        "OBV_UP_10D": boolean_with_availability(obv_up, enough_history),
        "CLOSE_LOCATION_5D_GE_55PCT": boolean_with_availability(
            close_location, enough_history
        ),
        "ATR_BOTTOM_20PCT_TRAILING": boolean_with_availability(
            atr_compressed, frame["atr_20pct_threshold"].notna()
        ),
        "BB_WIDTH_BOTTOM_20PCT_TRAILING": boolean_with_availability(
            bb_squeeze, frame["bb_width_20pct_threshold"].notna()
        ),
        "INSIDE_BARS_GE_3_OF_10": boolean_with_availability(
            frame["inside_count_10d"] >= 3, enough_history
        ),
        "POSITIVE_VOLUME_WAKE_1_5X": boolean_with_availability(
            volume_wake, enough_history
        ),
        "BREAKOUT_20D_WITH_1_2X_VOLUME": boolean_with_availability(
            breakout, enough_history
        ),
        "TREND_PLUS_COMPRESSION": boolean_with_availability(
            trend & compression, enough_history
        ),
        "TREND_PLUS_ACCUMULATION": boolean_with_availability(
            trend & rsi_mid & (delivery_high | obv_up), enough_history
        ),
        "QUIET_ACCUMULATION": boolean_with_availability(
            compression
            & (volume_dry | delivery_high)
            & close_location
            & (frame["ret_5d"] > -0.02),
            enough_history,
        ),
        "MOMENTUM_QUALITY": boolean_with_availability(
            (frame["ret_20d"] > 0) & positive_rs & rsi_mid, enough_history
        ),
        "PRE_RISE_PRESSURE_CLUSTER": boolean_with_availability(
            trend
            & near_high
            & rsi_mid
            & (compression | volume_dry)
            & (delivery_high | obv_up),
            enough_history,
        ),
        "COMPRESSION_RELEASE": boolean_with_availability(
            compression & volume_wake & (frame["close"] > frame["ma_20d"]),
            enough_history,
        ),
        "COMPRESSION_TO_VOLUME_IGNITION": boolean_with_availability(
            (frame["inside_count_10d"] >= 3) & volume_wake,
            enough_history,
        ),
        "COMPRESSION_VOLUME_IGNITION_WATCH": boolean_with_availability(
            (frame["inside_count_10d"] >= 2) & volume_wake,
            enough_history,
        ),
        "COMPRESSED_RSI_CONFIRMATION": boolean_with_availability(
            (frame["inside_count_10d"] >= 3) & rsi_mid,
            enough_history,
        ),
    }

    optional = {
        "INDIA_VIX_BELOW_20": (
            frame.get("India_VIX", pd.Series(np.nan, index=frame.index)) < 20,
            frame.get("India_VIX", pd.Series(np.nan, index=frame.index)).notna(),
        ),
        "INDIA_VIX_FALLING_5D": (
            frame.get("vix_change_5d", pd.Series(np.nan, index=frame.index)) < 0,
            frame.get("vix_change_5d", pd.Series(np.nan, index=frame.index)).notna(),
        ),
        "FII_AGGREGATE_5D_POSITIVE": (
            frame.get("fii_net_cr_5d", pd.Series(np.nan, index=frame.index)) > 0,
            frame.get("fii_net_cr_5d", pd.Series(np.nan, index=frame.index)).notna(),
        ),
        "FII_INDEX_FUTURES_NET_POSITIVE": (
            frame.get("fii_index_fut_net", pd.Series(np.nan, index=frame.index)) > 0,
            frame.get("fii_index_fut_net", pd.Series(np.nan, index=frame.index)).notna(),
        ),
        "FII_INDEX_FUTURES_IMPROVING_5D": (
            frame.get(
                "fii_index_fut_net_5d_chg", pd.Series(np.nan, index=frame.index)
            )
            > 0,
            frame.get(
                "fii_index_fut_net_5d_chg", pd.Series(np.nan, index=frame.index)
            ).notna(),
        ),
        "FII_CASH_5D_GE_DII": (
            frame.get("fii_cash_net_5d", pd.Series(np.nan, index=frame.index))
            >= frame.get("dii_cash_net_5d", pd.Series(np.nan, index=frame.index)),
            frame.get("fii_cash_net_5d", pd.Series(np.nan, index=frame.index)).notna()
            & frame.get(
                "dii_cash_net_5d", pd.Series(np.nan, index=frame.index)
            ).notna(),
        ),
        "STOCK_FII_NET_5D_POSITIVE": (
            frame.get("stock_fii_net_5d", pd.Series(np.nan, index=frame.index)) > 0,
            frame.get(
                "stock_fii_net_5d", pd.Series(np.nan, index=frame.index)
            ).notna(),
        ),
    }
    for name, (condition, availability) in optional.items():
        signals[name] = boolean_with_availability(condition, availability)

    signals["CONFIRMED_TREND_PRESSURE"] = boolean_with_availability(
        signals["MOMENTUM_QUALITY"].fillna(False)
        & (
            signals["QUIET_ACCUMULATION"].fillna(False)
            | signals["TREND_PLUS_ACCUMULATION"].fillna(False)
        ),
        enough_history,
    )
    signals["CONFIRMED_TREND_PRESSURE_WITH_VIX"] = boolean_with_availability(
        signals["CONFIRMED_TREND_PRESSURE"].fillna(False)
        & signals["INDIA_VIX_BELOW_20"].fillna(False),
        enough_history & signals["INDIA_VIX_BELOW_20"].notna(),
    )
    return signals


def two_proportion_z(
    fire_success: int,
    fire_total: int,
    nonfire_success: int,
    nonfire_total: int,
) -> float | None:
    if fire_total <= 0 or nonfire_total <= 0:
        return None
    pooled = (fire_success + nonfire_success) / (fire_total + nonfire_total)
    variance = pooled * (1 - pooled) * (1 / fire_total + 1 / nonfire_total)
    if variance <= 0:
        return None
    return (fire_success / fire_total - nonfire_success / nonfire_total) / math.sqrt(
        variance
    )


def signal_stats(
    frame: pd.DataFrame,
    signals: dict[str, pd.Series],
    period_name: str,
    period_mask: pd.Series,
    rise_column: str = MAIN_RISE_COLUMN,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    future_complete = (
        frame["future_complete_20d"]
        if rise_column.endswith("20d")
        else frame["future_complete_10d"]
    )
    for name, raw_signal in signals.items():
        eligible = period_mask & future_complete & raw_signal.notna()
        signal = raw_signal.fillna(False).astype(bool)
        tested = int(eligible.sum())
        fires = int((eligible & signal).sum())
        rises = int((eligible & frame[rise_column]).sum())
        hits = int((eligible & signal & frame[rise_column]).sum())
        nonfires = tested - fires
        nonfire_hits = rises - hits
        base_rate = rises / tested if tested else None
        precision = hits / fires if fires else None
        recall = hits / rises if rises else None
        lift = precision / base_rate if precision is not None and base_rate else None
        avg_forward = (
            float(frame.loc[eligible & signal, "future_max_return_10d"].mean())
            if fires
            else None
        )
        hit_leads = frame.loc[
            eligible & signal & frame[rise_column], "days_to_rise_8pct"
        ].dropna()
        z_score = two_proportion_z(hits, fires, nonfire_hits, nonfires)
        anchor_mask = eligible & frame["rise_event_anchor"]
        anchors = int(anchor_mask.sum())
        anchor_hits = int((anchor_mask & signal).sum())
        rows.append(
            {
                "period": period_name,
                "rise_definition": rise_column,
                "signal_id": name,
                "eligible_rows": tested,
                "fires": fires,
                "rise_rows": rises,
                "rise_hits": hits,
                "base_rate": base_rate,
                "precision": precision,
                "recall": recall,
                "lift": lift,
                "z_score_vs_nonfire": z_score,
                "avg_future_max_return_10d": avg_forward,
                "median_lead_trading_days": (
                    float(hit_leads.median()) if len(hit_leads) else None
                ),
                "minimum_lead_trading_days": (
                    int(hit_leads.min()) if len(hit_leads) else None
                ),
                "maximum_lead_trading_days": (
                    int(hit_leads.max()) if len(hit_leads) else None
                ),
                "event_anchors": anchors,
                "anchor_hits": anchor_hits,
                "anchor_coverage": anchor_hits / anchors if anchors else None,
            }
        )
    return rows


def symbol_consistency(
    frame: pd.DataFrame, signals: dict[str, pd.Series]
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for name, signal in signals.items():
        positive_symbols = 0
        eligible_symbols = 0
        symbol_details = []
        for symbol, group in frame.groupby("symbol"):
            eligible = (
                group["future_complete_10d"]
                & signal.loc[group.index].notna()
                & group["ma_50d"].notna()
            )
            fires = int((eligible & signal.loc[group.index].fillna(False)).sum())
            rises = int((eligible & group[MAIN_RISE_COLUMN]).sum())
            hits = int(
                (
                    eligible
                    & signal.loc[group.index].fillna(False)
                    & group[MAIN_RISE_COLUMN]
                ).sum()
            )
            tested = int(eligible.sum())
            if tested < 250 or fires < 10 or rises < 10:
                continue
            base = rises / tested
            precision = hits / fires
            lift = precision / base if base else None
            eligible_symbols += 1
            if lift is not None and lift > 1:
                positive_symbols += 1
            symbol_details.append(
                {
                    "symbol": symbol,
                    "eligible_rows": tested,
                    "fires": fires,
                    "precision": precision,
                    "lift": lift,
                }
            )
        rows.append(
            {
                "signal_id": name,
                "eligible_symbols": eligible_symbols,
                "symbols_with_lift_gt_1": positive_symbols,
                "symbol_consistency_pct": (
                    positive_symbols / eligible_symbols if eligible_symbols else None
                ),
                "symbol_details": symbol_details,
            }
        )
    return rows


def latest_snapshot(
    frame: pd.DataFrame, signals: dict[str, pd.Series]
) -> list[dict[str, object]]:
    rows = []
    for symbol, group in frame.groupby("symbol"):
        latest = group.sort_values("trade_date").iloc[-1]
        index = latest.name
        active = [
            name
            for name, signal in signals.items()
            if pd.notna(signal.get(index)) and bool(signal.get(index))
        ]
        rows.append(
            {
                "symbol": symbol,
                "as_of": latest["trade_date"].date().isoformat(),
                "close": float(latest["close"]),
                "active_signal_count": len(active),
                "active_signals": active,
                "trend_pressure": bool(
                    signals["CONFIRMED_TREND_PRESSURE"].fillna(False).get(index)
                ),
                "pre_rise_pressure_cluster": bool(
                    signals["PRE_RISE_PRESSURE_CLUSTER"].fillna(False).get(index)
                ),
            }
        )
    return rows


def pairwise_confirmation_tests(
    frame: pd.DataFrame, signals: dict[str, pd.Series]
) -> list[dict[str, object]]:
    names = sorted(signals)
    rows = []
    for left_index, left_name in enumerate(names):
        for right_name in names[left_index + 1 :]:
            left = signals[left_name]
            right = signals[right_name]
            combo = boolean_with_availability(
                left.fillna(False) & right.fillna(False),
                left.notna() & right.notna(),
            )
            combo_name = f"{left_name} + {right_name}"
            train = signal_stats(
                frame,
                {combo_name: combo},
                "TRAIN_2016_2020",
                frame["trade_date"] < SPLIT_DATE,
            )[0]
            test = signal_stats(
                frame,
                {combo_name: combo},
                "TEST_2021_2026",
                frame["trade_date"] >= SPLIT_DATE,
            )[0]
            full = signal_stats(
                frame,
                {combo_name: combo},
                "FULL_2016_2026",
                pd.Series(True, index=frame.index),
            )[0]
            rows.append(
                {
                    "signal_id": combo_name,
                    "left_signal": left_name,
                    "right_signal": right_name,
                    "train_fires": train["fires"],
                    "train_precision": train["precision"],
                    "train_lift": train["lift"],
                    "train_z_score": train["z_score_vs_nonfire"],
                    "test_fires": test["fires"],
                    "test_precision": test["precision"],
                    "test_lift": test["lift"],
                    "test_z_score": test["z_score_vs_nonfire"],
                    "test_anchor_coverage": test["anchor_coverage"],
                    "full_fires": full["fires"],
                    "full_precision": full["precision"],
                    "full_lift": full["lift"],
                }
            )
    return rows


def compression_ignition_grid(frame: pd.DataFrame) -> list[dict[str, object]]:
    rows = []
    enough_history = frame["ma_50d"].notna()
    for inside_count in range(1, 6):
        for volume_multiple in (1.20, 1.50, 2.00):
            name = (
                f"INSIDE_GE_{inside_count}_OF_10"
                f"_PLUS_POSITIVE_VOLUME_GE_{volume_multiple:.2f}X"
            )
            signal = boolean_with_availability(
                (frame["inside_count_10d"] >= inside_count)
                & (frame["volume_ratio_20d"] >= volume_multiple)
                & (frame["ret_1d"] > 0),
                enough_history,
            )
            periods = [
                ("TRAIN_2016_2020", frame["trade_date"] < SPLIT_DATE),
                ("TEST_2021_2026", frame["trade_date"] >= SPLIT_DATE),
                ("BLOCK_2016_2018", frame["trade_date"] < pd.Timestamp("2019-01-01")),
                (
                    "BLOCK_2019_2021",
                    frame["trade_date"].between(
                        pd.Timestamp("2019-01-01"),
                        pd.Timestamp("2021-12-31"),
                    ),
                ),
                (
                    "BLOCK_2022_2024",
                    frame["trade_date"].between(
                        pd.Timestamp("2022-01-01"),
                        pd.Timestamp("2024-12-31"),
                    ),
                ),
                ("BLOCK_2025_2026", frame["trade_date"] >= pd.Timestamp("2025-01-01")),
            ]
            for period_name, period_mask in periods:
                stat = signal_stats(
                    frame,
                    {name: signal},
                    period_name,
                    period_mask,
                )[0]
                rows.append(
                    {
                        "signal_id": name,
                        "inside_count_threshold": inside_count,
                        "volume_multiple_threshold": volume_multiple,
                        **stat,
                    }
                )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ohlcv-delivery", required=True)
    parser.add_argument("--vix")
    parser.add_argument("--fii-aggregate")
    parser.add_argument("--fii-derivatives")
    parser.add_argument("--fii-dii")
    parser.add_argument("--fii-symbol")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    frame = pd.read_csv(args.ohlcv_delivery)
    frame["trade_date"] = pd.to_datetime(frame["trade_date"], errors="coerce")
    numeric_columns = [
        "open",
        "high",
        "low",
        "close",
        "tot_traded_qty",
        "deliv_perc",
    ]
    for column in numeric_columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame = frame.dropna(
        subset=[
            "trade_date",
            "symbol",
            "open",
            "high",
            "low",
            "close",
            "tot_traded_qty",
        ]
    )
    frame = frame.sort_values(["symbol", "trade_date"]).drop_duplicates(
        ["symbol", "trade_date"], keep="last"
    )
    frame = pd.concat(
        [
            add_stock_features(group)
            for _, group in frame.groupby("symbol", sort=False)
        ],
        ignore_index=True,
    )
    frame["market_median_ret_20d"] = frame.groupby("trade_date")[
        "ret_20d"
    ].transform("median")
    frame = add_overlays(
        frame,
        args.vix,
        args.fii_aggregate,
        args.fii_derivatives,
        args.fii_dii,
        args.fii_symbol,
    )
    signals = define_signals(frame)

    periods = {
        "FULL_2016_2026": pd.Series(True, index=frame.index),
        "TRAIN_2016_2020": frame["trade_date"] < SPLIT_DATE,
        "TEST_2021_2026": frame["trade_date"] >= SPLIT_DATE,
    }
    stats = []
    for period_name, period_mask in periods.items():
        stats.extend(signal_stats(frame, signals, period_name, period_mask))

    sensitivity = []
    for rise_column in [
        "rise_5pct_10d",
        "rise_8pct_10d",
        "rise_10pct_10d",
        "rise_8pct_20d",
    ]:
        sensitivity.extend(
            signal_stats(
                frame,
                signals,
                "FULL_2016_2026",
                periods["FULL_2016_2026"],
                rise_column,
            )
        )

    consistency = symbol_consistency(frame, signals)
    latest = latest_snapshot(frame, signals)
    pairwise = pairwise_confirmation_tests(frame, signals)
    compression_grid = compression_ignition_grid(frame)
    main_full = [
        row
        for row in stats
        if row["period"] == "FULL_2016_2026"
        and row["rise_definition"] == MAIN_RISE_COLUMN
    ]
    ranked = sorted(
        main_full,
        key=lambda row: (
            row["lift"] is not None,
            row["lift"] or -1,
            row["anchor_coverage"] or -1,
        ),
        reverse=True,
    )

    summary = {
        "analysis_version": "pre-rise-evidence-v0.1",
        "generated_at": pd.Timestamp.now(tz="UTC").isoformat(),
        "source": args.ohlcv_delivery,
        "rows": int(len(frame)),
        "symbols": sorted(frame["symbol"].unique().tolist()),
        "date_range": [
            frame["trade_date"].min().date().isoformat(),
            frame["trade_date"].max().date().isoformat(),
        ],
        "main_rise_definition": "Maximum close return of at least +8% within the next 10 trading sessions.",
        "feature_timing": "All features use only current and prior rows; future rows are used only for validation labels.",
        "split_date": SPLIT_DATE.date().isoformat(),
        "ranked_signals": ranked,
        "statistics": stats,
        "sensitivity": sensitivity,
        "symbol_consistency": consistency,
        "pairwise_confirmation_tests": pairwise,
        "compression_ignition_grid": compression_grid,
        "latest_snapshot": latest,
    }
    (output / "pre-rise-pattern-evidence.json").write_text(
        json.dumps(summary, indent=2, default=str), encoding="utf-8"
    )
    pd.DataFrame(stats).to_csv(output / "pre-rise-signal-statistics.csv", index=False)
    pd.DataFrame(sensitivity).to_csv(
        output / "pre-rise-sensitivity.csv", index=False
    )
    pd.DataFrame(pairwise).to_csv(
        output / "pre-rise-pairwise-confirmations.csv", index=False
    )
    pd.DataFrame(compression_grid).to_csv(
        output / "pre-rise-compression-ignition-grid.csv", index=False
    )
    consistency_rows = []
    for item in consistency:
        for detail in item["symbol_details"]:
            consistency_rows.append(
                {
                    "signal_id": item["signal_id"],
                    "eligible_symbols": item["eligible_symbols"],
                    "symbols_with_lift_gt_1": item["symbols_with_lift_gt_1"],
                    "symbol_consistency_pct": item["symbol_consistency_pct"],
                    **detail,
                }
            )
    pd.DataFrame(consistency_rows).to_csv(
        output / "pre-rise-symbol-consistency.csv", index=False
    )
    pd.DataFrame(latest).assign(
        active_signals=lambda data: data["active_signals"].map("|".join)
    ).to_csv(output / "pre-rise-latest-snapshot.csv", index=False)

    event_columns = [
        "symbol",
        "trade_date",
        "close",
        "future_max_return_10d",
        "future_close_return_10d",
        "days_to_rise_8pct",
        "rise_event_anchor",
    ]
    event_frame = frame.loc[frame["rise_event_anchor"], event_columns].copy()
    for name, signal in signals.items():
        event_frame[name] = signal.loc[event_frame.index].astype("boolean")
    event_frame.to_csv(output / "pre-rise-event-ledger.csv", index=False)
    print(json.dumps({"ok": True, "output": str(output), "rows": len(frame)}))


if __name__ == "__main__":
    main()
