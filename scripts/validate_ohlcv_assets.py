#!/usr/bin/env python3
"""Read-only, pinned-asset OHLCV dry run; never an import or eligibility check."""

import argparse
from collections import Counter
import csv
from dataclasses import dataclass, fields
from datetime import date
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import stat
import struct
import sys
import unicodedata
import zipfile
import zlib


class ValidationError(Exception):
    """Fatal input/format/resource failure; no partial-success report is returned."""


@dataclass(frozen=True)
class Limits:
    max_archive_bytes: int = 32 * 1024 * 1024
    max_members: int = 512
    max_member_bytes: int = 2 * 1024 * 1024
    max_total_uncompressed_bytes: int = 64 * 1024 * 1024
    max_rows_per_member: int = 20000
    max_total_rows: int = 1000000
    max_samples: int = 200
    max_field_chars: int = 128


HEADERS = ["Date", "Open", "High", "Low", "Close", "Volume"]
ISO_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}\Z")
SYMBOL_FILE = re.compile(r"([A-Z0-9][A-Z0-9&_.-]{0,39})\.NS\.csv\Z")
NUMBER = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\Z")
INVENTORY_LIMIT = 2 * 1024 * 1024


def _read_regular(path, cap, label):
    """Hold one non-symlink descriptor and materialize only bounded immutable bytes."""
    try:
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
        if Path(path).is_symlink():
            raise ValidationError(label + " must not be a symlink")
        with os.fdopen(os.open(path, flags), "rb") as handle:
            before = os.fstat(handle.fileno())
            if not stat.S_ISREG(before.st_mode):
                raise ValidationError(label + " must be a regular file")
            if before.st_size > cap:
                raise ValidationError(label + " exceeds byte limit")
            data = handle.read(cap + 1)
            after = os.fstat(handle.fileno())
            if len(data) > cap:
                raise ValidationError(label + " exceeds byte limit")
            if (len(data) != before.st_size or before.st_size != after.st_size
                    or before.st_mtime_ns != after.st_mtime_ns):
                raise ValidationError(label + " changed while being read")
            return data
    except OSError as exc:
        raise ValidationError(label + " cannot be read as a regular file") from exc


def _pinned_source(archive_path, inventory_path, limits):
    raw_inventory = _read_regular(inventory_path, INVENTORY_LIMIT, "inventory")
    try:
        inventory = json.loads(raw_inventory.decode("utf-8"))
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise ValidationError("inventory is not valid UTF-8 JSON") from exc
    if (not isinstance(inventory, dict)
            or inventory.get("schema_version") != "ashstocks-asset-inventory-v1"
            or not isinstance(inventory.get("assets"), list)):
        raise ValidationError("unsupported inventory schema")
    matches = []
    for asset in inventory["assets"]:
        if (not isinstance(asset, dict) or not isinstance(asset.get("name"), str)
                or not 0 < len(asset["name"]) <= 255
                or "/" in asset["name"] or "\\" in asset["name"]
                or type(asset.get("bytes")) is not int or asset["bytes"] < 0
                or not isinstance(asset.get("sha256"), str)
                or re.fullmatch(r"[0-9a-f]{64}", asset["sha256"]) is None
                or type(asset.get("id")) is not int or asset["id"] <= 0
                or not isinstance(asset.get("url"), str)
                or not asset["url"].startswith("https://") or len(asset["url"]) > 4096):
            raise ValidationError("invalid inventory asset entry")
        if asset["name"] == Path(archive_path).name:
            matches.append(asset)
    if len(matches) != 1:
        raise ValidationError("archive must have exactly one pinned inventory entry")
    asset = matches[0]
    if asset["bytes"] > limits.max_archive_bytes:
        raise ValidationError("pinned archive exceeds byte limit")
    raw_archive = _read_regular(archive_path, limits.max_archive_bytes, "archive")
    digest = hashlib.sha256(raw_archive).hexdigest()
    if len(raw_archive) != asset["bytes"] or digest != asset["sha256"]:
        raise ValidationError("archive size or SHA256 does not match inventory")
    return raw_archive, {
        "archive_name": asset["name"], "bytes": len(raw_archive), "sha256": digest,
        "asset_id": asset["id"], "url": asset["url"],
        "inventory_sha256": hashlib.sha256(raw_inventory).hexdigest(),
        "inventory_schema_version": inventory["schema_version"],
    }


def _check_directory(raw, limits):
    """Bound central-directory entries BEFORE ZipFile allocates their objects.

    This deliberately narrow format excludes split/ZIP64/self-extracting archives.
    None is needed for the pinned, small historical CSV asset.
    """
    end = raw.rfind(b"PK\x05\x06", max(0, len(raw) - 65557))
    if end < 0 or len(raw) - end < 22:
        raise ValidationError("missing ZIP end record")
    _, disk, cd_disk, disk_count, count, cd_size, cd_offset, comment = struct.unpack_from(
        "<4s4H2IH", raw, end)
    if (disk or cd_disk or disk_count != count or count == 65535
            or cd_size == 0xFFFFFFFF or cd_offset == 0xFFFFFFFF
            or end + 22 + comment != len(raw) or cd_offset + cd_size != end):
        raise ValidationError("unsupported or inconsistent ZIP directory")
    if count > limits.max_members:
        raise ValidationError("archive exceeds member limit")
    position, actual = cd_offset, 0
    while position < end:
        if position + 46 > end or raw[position:position + 4] != b"PK\x01\x02":
            raise ValidationError("malformed ZIP central directory")
        name_len, extra_len, comment_len = struct.unpack_from("<3H", raw, position + 28)
        position += 46 + name_len + extra_len + comment_len
        actual += 1
        if actual > limits.max_members:
            raise ValidationError("archive exceeds member limit")
    if position != end or actual != count:
        raise ValidationError("ZIP directory count or length mismatch")


def _members(archive, limits):
    entries, seen_paths, seen_symbols, total = [], set(), set(), 0
    for info in archive.infolist():
        name = info.orig_filename
        path = name[:-1] if name.endswith("/") else name
        canonical_path = unicodedata.normalize("NFC", path).casefold()
        parts = path.split("/")
        if (not path or len(name) > 512 or "\\" in name or "\x00" in name
                or any(part in ("", ".", "..") for part in parts)
                or any(ord(char) < 32 or ord(char) == 127 for char in name)
                or ":" in name or canonical_path in seen_paths):
            raise ValidationError("unsafe or duplicate archive member path")
        seen_paths.add(canonical_path)
        mode = info.external_attr >> 16
        kind = stat.S_IFMT(mode)
        if (kind not in (0, stat.S_IFREG, stat.S_IFDIR)
                or (kind == stat.S_IFDIR and not info.is_dir())
                or (info.is_dir() and kind == stat.S_IFREG)
                or info.flag_bits & 1
                or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
            raise ValidationError("unsupported archive member type, compression or encryption")
        if info.file_size > limits.max_member_bytes:
            raise ValidationError("archive member exceeds byte limit")
        total += info.file_size
        if total > limits.max_total_uncompressed_bytes:
            raise ValidationError("archive exceeds total uncompressed byte limit")
        symbol = None
        if info.is_dir():
            if info.file_size != 0:
                raise ValidationError("directory member has content")
        elif parts[-1] != "MANIFEST.txt":
            match = SYMBOL_FILE.fullmatch(parts[-1])
            if match is None:
                raise ValidationError("unsupported archive member filename")
            symbol = match.group(1)
            if symbol in seen_symbols:
                raise ValidationError("duplicate candidate symbol across archive members")
            seen_symbols.add(symbol)
        entries.append((info, symbol))
    if not seen_symbols:
        raise ValidationError("archive has no OHLCV CSV members")
    return sorted(entries, key=lambda entry: entry[0].filename)


def _number(value):
    try:
        if NUMBER.fullmatch(value) is None or not math.isfinite(float(value)):
            return None
        return Decimal(value)
    except (ValueError, InvalidOperation, OverflowError):
        return None


def _rows(raw, member, symbol, as_of, limits, rows_so_far):
    try:
        text = raw.decode("utf-8-sig", errors="strict")
        reader = csv.reader(io.StringIO(text, newline=""), strict=True)
        if next(reader, None) != HEADERS:
            raise ValidationError("unexpected OHLCV header: " + member)
        records, date_counts = [], Counter()
        for row_number, row in enumerate(reader, 2):
            if len(records) >= limits.max_rows_per_member or rows_so_far + len(records) >= limits.max_total_rows:
                raise ValidationError("OHLCV row limit exceeded")
            if len(row) != 6 or any(len(field) > limits.max_field_chars for field in row):
                raise ValidationError("malformed row or oversized field: " + member)
            reasons, parsed_date = [], None
            if re.fullmatch(r"STOCK_[0-9]+", symbol):
                reasons.append("placeholder_symbol")
            try:
                if not ISO_DATE.fullmatch(row[0]):
                    raise ValueError("non-ISO date")
                parsed_date = date.fromisoformat(row[0])
                date_counts[row[0]] += 1
                if parsed_date > as_of:
                    reasons.append("future_date")
            except ValueError:
                reasons.append("invalid_date")
            prices = [_number(value) for value in row[1:5]]
            if any(value is None or value <= 0 or float(value) <= 0 for value in prices):
                reasons.append("invalid_ohlc")
            else:
                opening, high, low, close = prices
                if not (low <= opening <= high and low <= close <= high):
                    reasons.append("invalid_ohlc_bounds")
            volume = _number(row[5])
            if volume is None or volume < 0 or volume != volume.to_integral_value():
                reasons.append("invalid_volume")
            records.append((row_number, row[0], parsed_date, reasons, volume == 0))
        if not records:
            raise ValidationError("OHLCV CSV has no data rows: " + member)
        for _, day, parsed_date, reasons, _ in records:
            if parsed_date is not None and date_counts[day] > 1:
                reasons.append("duplicate_date")
        return records
    except (UnicodeError, csv.Error) as exc:
        raise ValidationError("invalid UTF-8 or CSV: " + member) from exc


def validate_archive(archive_path, inventory_path, *, as_of, limits=None):
    """Return deterministic bounded diagnostics; success NEVER approves an import.

    Date coverage counts structurally valid rows only. Rejection reason counts
    can exceed rejected rows. Zero-volume counts include all otherwise rejected
    rows too: zero is a warning, not missing data and not evidence of liquidity.
    Weekend rows are observations only; exchange session validity is unresolved.
    Out-of-order rows count dates earlier than the preceding parseable source
    date. Input order is never changed, and no bars are returned for ingestion.
    Sample row_number is the logical CSV record number (header=1), not the
    physical line number when a quoted field contains embedded newlines.
    Candidate symbols are filename claims, never verified exchange identities.
    """
    limits = limits if limits is not None else Limits()
    if not isinstance(limits, Limits):
        raise ValidationError("limits must be a Limits instance")
    for field in fields(limits):
        value = getattr(limits, field.name)
        if type(value) is not int or value < (0 if field.name == "max_samples" else 1):
            raise ValidationError("invalid resource limit: " + field.name)
    try:
        if not isinstance(as_of, str) or not ISO_DATE.fullmatch(as_of):
            raise ValueError("non-ISO date")
        cutoff = date.fromisoformat(as_of)
    except ValueError as exc:
        raise ValidationError("as_of must be a valid YYYY-MM-DD date") from exc
    raw, source = _pinned_source(archive_path, inventory_path, limits)
    _check_directory(raw, limits)
    summary = dict(symbols=0, rows_total=0, rows_structurally_valid=0, rows_rejected=0,
                   zero_volume_rows=0, weekend_rows=0, out_of_order_rows=0,
                   date_min=None, date_max=None, rejection_reasons={})
    report = dict(schema_version="ashstocks-ohlcv-dry-run-v1", dry_run=True,
                  database_import_performed=False, production_import_ready=False, as_of=as_of,
                  source=source, summary=summary, symbols=[], rejected_rows=[],
                  rejected_samples_truncated=False, metadata_members=[],
                  unresolved_checks=["source_identity", "corporate_actions", "session_calendar", "currentness"])
    total_reasons = Counter()
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            for info, symbol in _members(archive, limits):
                with archive.open(info) as member:
                    content = member.read(limits.max_member_bytes + 1)
                    if len(content) != info.file_size or member.read(1):
                        raise ValidationError("member size mismatch")
                digest = hashlib.sha256(content).hexdigest()  # EOF read exercises CRC, including metadata.
                if symbol is None:
                    content.decode("utf-8-sig", errors="strict")
                    if not info.is_dir():
                        report["metadata_members"].append(dict(member=info.filename, bytes=len(content), sha256=digest))
                    continue
                records = _rows(content, info.filename, symbol, cutoff, limits, summary["rows_total"])
                reasons, valid_dates = Counter(), []
                item = dict(candidate_symbol=symbol, identity_verified=False, member=info.filename,
                            member_sha256=digest, rows_total=len(records), rows_structurally_valid=0,
                            rows_rejected=0, zero_volume_rows=0, weekend_rows=0, out_of_order_rows=0,
                            date_min=None, date_max=None)
                previous_date = None
                for row_number, day, parsed_date, rejected, zero in records:
                    item["zero_volume_rows"] += int(zero)
                    item["weekend_rows"] += int(parsed_date is not None and parsed_date.weekday() >= 5)
                    if parsed_date is not None:
                        item["out_of_order_rows"] += int(previous_date is not None and parsed_date < previous_date)
                        previous_date = parsed_date
                    if rejected:
                        item["rows_rejected"] += 1
                        reasons.update(rejected)
                        if len(report["rejected_rows"]) < limits.max_samples:
                            report["rejected_rows"].append(dict(member=info.filename, row_number=row_number,
                                candidate_symbol=symbol, date=day, reasons=sorted(rejected)))
                        else:
                            report["rejected_samples_truncated"] = True
                    else:
                        item["rows_structurally_valid"] += 1
                        valid_dates.append(day)
                item["rejection_reasons"] = dict(sorted(reasons.items()))
                if valid_dates:
                    item["date_min"], item["date_max"] = min(valid_dates), max(valid_dates)
                    summary["date_min"] = min(summary["date_min"] or item["date_min"], item["date_min"])
                    summary["date_max"] = max(summary["date_max"] or item["date_max"], item["date_max"])
                for key in ("rows_total", "rows_structurally_valid", "rows_rejected", "zero_volume_rows",
                            "weekend_rows", "out_of_order_rows"):
                    summary[key] += item[key]
                total_reasons.update(reasons)
                report["symbols"].append(item)
    except (zipfile.BadZipFile, OSError, RuntimeError, EOFError, NotImplementedError, UnicodeError, zlib.error) as exc:
        raise ValidationError("archive cannot be fully read and CRC verified") from exc
    summary["symbols"] = len(report["symbols"])
    summary["rejection_reasons"] = dict(sorted(total_reasons.items()))
    if summary["out_of_order_rows"]:
        report["unresolved_checks"].append("source_row_order")
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--inventory", required=True)
    parser.add_argument("--as-of", required=True, help="Explicit YYYY-MM-DD validation cutoff")
    args = parser.parse_args(argv)
    try:
        result = validate_archive(args.archive, args.inventory, as_of=args.as_of)
    except ValidationError as exc:
        print(json.dumps({"error": str(exc), "database_import_performed": False}), file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
