#!/usr/bin/env python3
"""Read-only exact-symbol candidate links, never historical identity verification."""

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass, fields
from datetime import date, datetime
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import sys
import unicodedata


class ValidationError(Exception):
    """Invalid input/provenance/resource envelope; no partial report is returned."""


@dataclass(frozen=True)
class Limits:
    max_report_bytes: int = 2 * 1024 * 1024
    max_reference_bytes: int = 4 * 1024 * 1024
    max_symbols: int = 5000
    max_reference_rows: int = 10000
    max_diagnostics: int = 100
    max_candidates_per_symbol: int = 10
    max_rows: int = 10000000


SHA = re.compile(r"[0-9a-f]{64}\Z")
SYMBOL = re.compile(r"[A-Z0-9][A-Z0-9&_.-]{0,49}\Z")
ISIN = re.compile(r"IN[A-Z0-9]{10}\Z")
ISO_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}\Z")
UTC_TIME = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z\Z")
COUNTS = ("rows_total", "rows_structurally_valid", "rows_rejected", "zero_volume_rows",
          "weekend_rows", "out_of_order_rows")
SOURCE_URLS = {
    "source_url": "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz",
    "suspended_source_url": "https://assets.upstox.com/market-quote/instruments/exchange/suspended-instrument.json.gz",
    "equity_source_url": "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv",
}


def _string(value, cap=256):
    return isinstance(value, str) and 0 < len(value) <= cap and not any(ord(c) < 32 or ord(c) == 127 for c in value)


def _hash(value):
    return isinstance(value, str) and SHA.fullmatch(value) is not None


def _symbol(value):
    return isinstance(value, str) and SYMBOL.fullmatch(value) is not None and re.fullmatch(r"STOCK_[0-9]+", value) is None


def _day(value, label):
    try:
        if not isinstance(value, str) or not ISO_DATE.fullmatch(value):
            raise ValueError()
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError(label + " must be a valid YYYY-MM-DD date") from exc


def _time(value, label):
    try:
        if not isinstance(value, str) or not UTC_TIME.fullmatch(value):
            raise ValueError()
        return datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise ValidationError(label + " must be an explicit UTC timestamp") from exc


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValidationError("duplicate JSON object key")
        result[key] = value
    return result


def _integer(value):
    if len(value) > 19:
        raise ValidationError("JSON integer exceeds bound")
    return int(value)


def _float(value):
    number = float(value)
    if not math.isfinite(number):
        raise ValidationError("non-finite JSON number")
    return number


def _constant(value):
    raise ValidationError("non-standard JSON constant")


def _read_json(path, cap, label, expected_sha256=None):
    if expected_sha256 is not None and not _hash(expected_sha256):
        raise ValidationError("invalid expected " + label + " SHA256")
    try:
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
        if Path(path).is_symlink():
            raise ValidationError(label + " must not be a symlink")
        with os.fdopen(os.open(path, flags), "rb") as handle:
            before = os.fstat(handle.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size > cap:
                raise ValidationError(label + " is not a bounded regular file")
            raw = handle.read(cap + 1)
            after = os.fstat(handle.fileno())
            if (len(raw) > cap or len(raw) != before.st_size or before.st_size != after.st_size
                    or before.st_mtime_ns != after.st_mtime_ns):
                raise ValidationError(label + " exceeded byte limit or changed while reading")
    except OSError as exc:
        raise ValidationError(label + " cannot be read as a regular file") from exc
    digest = hashlib.sha256(raw).hexdigest()
    if expected_sha256 is not None and digest != expected_sha256:
        raise ValidationError(label + " SHA256 does not match expected digest")
    try:
        obj = json.loads(raw.decode("utf-8"), object_pairs_hook=_pairs,
                         parse_int=_integer, parse_float=_float, parse_constant=_constant)
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise ValidationError(label + " is not valid bounded UTF-8 JSON") from exc
    return obj, dict(bytes=len(raw), sha256=digest, expected_sha256_verified=expected_sha256 is not None)


def _history(report, cutoff, limits):
    if (not isinstance(report, dict) or report.get("schema_version") != "ashstocks-ohlcv-dry-run-v1"
            or report.get("dry_run") is not True or report.get("database_import_performed") is not False
            or report.get("production_import_ready") is not False):
        raise ValidationError("unsupported or activated historical report schema")
    report_day = _day(report.get("as_of"), "historical report as_of")
    if report_day > cutoff:
        raise ValidationError("historical report is newer than reconciliation cutoff")
    source = report.get("source")
    if (not isinstance(source, dict) or not _string(source.get("archive_name"))
            or "/" in source["archive_name"] or "\\" in source["archive_name"]
            or type(source.get("bytes")) is not int or source["bytes"] <= 0
            or type(source.get("asset_id")) is not int or source["asset_id"] <= 0
            or not _hash(source.get("sha256")) or not _hash(source.get("inventory_sha256"))
            or source.get("inventory_schema_version") != "ashstocks-asset-inventory-v1"
            or not _string(source.get("url"), 4096) or not source["url"].startswith("https://")):
        raise ValidationError("invalid historical source provenance")
    items, summary = report.get("symbols"), report.get("summary")
    if (not isinstance(items, list) or not 0 < len(items) <= limits.max_symbols
            or not isinstance(summary, dict) or type(summary.get("symbols")) is not int
            or summary["symbols"] != len(items) or "date_min" not in summary or "date_max" not in summary):
        raise ValidationError("invalid historical symbol list or summary")
    symbols, members, totals, dates = set(), set(), Counter(), []
    for item in items:
        if (not isinstance(item, dict) or not _string(item.get("candidate_symbol"), 50)
                or item.get("identity_verified") is not False or not _hash(item.get("member_sha256"))
                or not _string(item.get("member"), 512) or "date_min" not in item or "date_max" not in item):
            raise ValidationError("invalid historical member provenance")
        symbol, member = item["candidate_symbol"], item["member"]
        canonical = unicodedata.normalize("NFC", member).casefold()
        if ("\\" in member or ":" in member or any(p in ("", ".", "..") for p in member.split("/"))
                or member.split("/")[-1] != symbol + ".NS.csv"
                or canonical in members or symbol in symbols):
            raise ValidationError("unsafe, duplicate or inconsistent historical member identity")
        symbols.add(symbol)
        members.add(canonical)
        for key in COUNTS:
            if type(item.get(key)) is not int or not 0 <= item[key] <= limits.max_rows:
                raise ValidationError("invalid historical row count")
            totals[key] += item[key]
        if (not item["rows_total"] or item["rows_total"] != item["rows_structurally_valid"] + item["rows_rejected"]
                or any(item[k] > item["rows_total"] for k in COUNTS[1:])):
            raise ValidationError("inconsistent historical row counts")
        if item["rows_structurally_valid"]:
            low, high = _day(item.get("date_min"), "date_min"), _day(item.get("date_max"), "date_max")
            if low > high or high > report_day:
                raise ValidationError("inconsistent historical date coverage")
            dates.extend((item["date_min"], item["date_max"]))
        elif item.get("date_min") is not None or item.get("date_max") is not None:
            raise ValidationError("rejected-only history cannot claim valid date coverage")
    if (totals["rows_total"] > limits.max_rows
            or any(type(summary.get(k)) is not int or summary[k] != totals[k] for k in COUNTS)
            or summary.get("date_min") != (min(dates) if dates else None)
            or summary.get("date_max") != (max(dates) if dates else None)):
        raise ValidationError("historical summary does not match bounded member counts or dates")
    return source, sorted(items, key=lambda item: (item["candidate_symbol"], item["member"]))


def _reference(reference, cutoff, limits):
    if (not isinstance(reference, dict) or reference.get("schema") != "ashstocks-official-nse-reference-snapshot-v2"
            or reference.get("application_database_updated") is not False
            or reference.get("never_use_as_fresh_import_fallback") is not True):
        raise ValidationError("unsupported or activated reference snapshot schema")
    source, rows = reference.get("import"), reference.get("universe")
    if (not isinstance(source, dict) or source.get("version") != "official-nse-master-v2"
            or source.get("status") != "reference_snapshot"
            or source.get("membership_policy") != "nse-equity-list-eq-series-exact-symbol-isin-v2"
            or source.get("membership_verified") is not True
            or source.get("is_live_quote_data") is not False
            or not isinstance(rows, list) or not 0 < len(rows) <= limits.max_reference_rows
            or type(source.get("eligible_count")) is not int or source["eligible_count"] != len(rows)):
        raise ValidationError("invalid reference source policy or row count")
    provenance = {"snapshot_schema": reference["schema"]}
    for prefix in ("", "suspended_", "equity_"):
        fetched = _time(source.get(prefix + "fetched_at"), prefix + "fetched_at")
        modified = _time(source.get(prefix + "source_last_modified"), prefix + "source_last_modified")
        url_key, hash_key = prefix + "source_url", prefix + "source_sha256"
        if (source.get(url_key) != SOURCE_URLS[url_key] or not _hash(source.get(hash_key))
                or modified > fetched or fetched.date() > cutoff):
            raise ValidationError("invalid or future reference source provenance")
        for key in (prefix + "fetched_at", prefix + "source_last_modified", url_key, hash_key):
            provenance[key] = source[key]
    for key in ("decoded_sha256", "equity_decoded_sha256"):
        if not _hash(source.get(key)):
            raise ValidationError("invalid reference decoded hash provenance")
        provenance[key] = source[key]
    provenance["fetched_as_of"] = source["fetched_at"][:10]
    return rows, provenance


def _identity_reasons(row):
    if not isinstance(row, dict):
        return ["not_an_object"]
    reasons = []
    if not _symbol(row.get("symbol")):
        reasons.append("invalid_symbol")
    isin = row.get("isin")
    if not isinstance(isin, str) or not ISIN.fullmatch(isin) or isin.startswith("INF"):
        reasons.append("invalid_company_isin")
    if not isinstance(isin, str) or row.get("instrument_key") != "NSE_EQ|" + isin:
        reasons.append("instrument_key_mismatch")
    if row.get("exchange") != "NSE" or row.get("instrument_type") != "EQ" or row.get("nse_series") != "EQ":
        reasons.append("not_nse_eq_series")
    if not _string(row.get("name"), 200) or row["name"] != row["name"].strip():
        reasons.append("invalid_company_name")
    return reasons


def reconcile_identities(report_path, reference_path, *, as_of, limits=None,
                         expected_report_sha256=None, expected_reference_sha256=None):
    """Link exact filename symbols only. Even an exact candidate is NOT usable identity.

    Input JSON hashes are recomputed; inherited archive/member/official-feed hashes
    are format-checked declarations, not revalidated source bytes. No alias repair,
    historical ISIN inference, corporate-action adjustment, Mongo read or import.
    Ambiguity includes repeated symbol rows and ISIN/key reuse across symbols.
    """
    limits = limits if limits is not None else Limits()
    if not isinstance(limits, Limits):
        raise ValidationError("limits must be a Limits instance")
    for field in fields(limits):
        value = getattr(limits, field.name)
        if type(value) is not int or value < (0 if field.name == "max_diagnostics" else 1):
            raise ValidationError("invalid resource limit: " + field.name)
    cutoff = _day(as_of, "as_of")
    history, history_hash = _read_json(report_path, limits.max_report_bytes, "historical report", expected_report_sha256)
    reference, reference_hash = _read_json(reference_path, limits.max_reference_bytes, "reference", expected_reference_sha256)
    source, items = _history(history, cutoff, limits)
    rows, reference_source = _reference(reference, cutoff, limits)
    by_symbol, by_isin, by_key = defaultdict(list), defaultdict(list), defaultdict(list)
    diagnostics, diagnostic_total, invalid_rows = [], 0, 0
    entries = []
    for index, row in enumerate(rows):
        reasons = _identity_reasons(row)
        invalid_rows += bool(reasons)
        entry = dict(index=index, row=row, reasons=reasons)
        entries.append(entry)
        if isinstance(row, dict):
            for field, mapping in (("symbol", by_symbol), ("isin", by_isin), ("instrument_key", by_key)):
                value = row.get(field)
                if _string(value, 100):
                    mapping[value].append(entry)
    for entry in entries:
        row, reasons = entry["row"], list(entry["reasons"])
        if isinstance(row, dict):
            for field, mapping in (("symbol", by_symbol), ("isin", by_isin), ("instrument_key", by_key)):
                value = row.get(field)
                if _string(value, 100) and len(mapping[value]) > 1:
                    reasons.append("duplicate_" + field)
        entry["all_reasons"] = reasons
        if reasons:
            diagnostic_total += 1
            if len(diagnostics) < limits.max_diagnostics:
                diagnostics.append(dict(reference_row=entry["index"] + 1,
                                        symbol=row.get("symbol") if isinstance(row, dict) and _string(row.get("symbol"), 50) else None,
                                        reasons=sorted(reasons)))
    results, counts = [], Counter()
    for item in items:
        symbol = item["candidate_symbol"]
        matches = by_symbol.get(symbol, [])
        reasons = []
        if not _symbol(symbol):
            status, reasons = "invalid", ["invalid_historical_symbol"]
        elif not matches:
            status, reasons = "absent", ["no_exact_symbol_in_dated_reference"]
        elif any(entry["reasons"] for entry in matches):
            status, reasons = "invalid", ["invalid_reference_identity"]
        elif len(matches) != 1 or any(entry["all_reasons"] for entry in matches):
            status, reasons = "ambiguous", ["duplicate_reference_symbol_isin_or_key"]
        else:
            status = "exact_candidate"
        candidates = [dict(symbol=entry["row"]["symbol"], isin=entry["row"]["isin"],
                           instrument_key=entry["row"]["instrument_key"], name=entry["row"]["name"])
                      for entry in matches if not entry["reasons"]]
        candidates.sort(key=lambda candidate: (candidate["isin"], candidate["instrument_key"], candidate["name"]))
        counts[status] += 1
        results.append(dict(candidate_symbol=symbol, status=status, reasons=reasons,
                            member=item["member"], member_sha256=item["member_sha256"],
                            date_min=item["date_min"], date_max=item["date_max"],
                            rows_total=item["rows_total"], rows_rejected=item["rows_rejected"],
                            identity_verified=False, historical_identity_verified=False,
                            current_tradability_verified=False, activation_allowed=False, import_allowed=False,
                            reference_match_count=len(matches), valid_candidate_count=len(candidates),
                            candidates=candidates[:limits.max_candidates_per_symbol],
                            candidates_truncated=len(candidates) > limits.max_candidates_per_symbol))
    return dict(schema_version="ashstocks-asset-identity-candidates-v1", as_of=as_of, dry_run=True,
                database_import_performed=False, production_import_ready=False, activation_allowed=False,
                historical_identity_verified=False, current_tradability_verified=False,
                historical_report=dict(history_hash, schema_version=history["schema_version"], as_of=history["as_of"]),
                historical_source={key: source[key] for key in ("archive_name", "asset_id", "bytes", "sha256", "inventory_sha256", "inventory_schema_version", "url")},
                reference_snapshot=dict(reference_hash, **reference_source),
                inherited_source_hashes_revalidated=False, existing_mongo_coverage="unknown_not_queried",
                summary=dict(symbols=len(items), reference_rows=len(rows), reference_invalid_rows=invalid_rows,
                             reference_diagnostic_rows=diagnostic_total,
                             **{status: counts[status] for status in ("exact_candidate", "absent", "ambiguous", "invalid")}),
                symbols=results, reference_diagnostics=diagnostics,
                reference_diagnostics_truncated=diagnostic_total > len(diagnostics),
                unresolved_checks=["historical_isin_and_symbol_periods", "corporate_actions_and_adjustment_policy",
                                   "reference_currentness_and_current_tradability", "underlying_source_hash_revalidation",
                                   "existing_mongo_history_coverage_and_deduplication", "session_calendar_and_rejected_rows"],
                warnings=["Exact symbols are candidate links only, not verified historical identity.",
                          "Absence from this dated eligible-equity snapshot is not proof of delisting or invalid history.",
                          "No aliases, case folding, whitespace repair, punctuation stripping or automatic renames were applied.",
                          "Reference ISINs are syntax-checked declarations, not historical ISIN assignments or checksum certification.",
                          "Existing Mongo history may already contain these bars; inspect coverage before any import."])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", required=True)
    parser.add_argument("--reference", required=True)
    parser.add_argument("--as-of", required=True)
    parser.add_argument("--expected-report-sha256")
    parser.add_argument("--expected-reference-sha256")
    args = parser.parse_args(argv)
    try:
        result = reconcile_identities(args.report, args.reference, as_of=args.as_of,
                                      expected_report_sha256=args.expected_report_sha256,
                                      expected_reference_sha256=args.expected_reference_sha256)
    except ValidationError as exc:
        print(json.dumps({"error": str(exc), "database_import_performed": False}), file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
