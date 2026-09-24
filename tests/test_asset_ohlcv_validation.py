"""Offline, stdlib-only contract tests for read-only historical OHLCV validation."""

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import stat
import struct
import subprocess
import sys
import tempfile
import unittest
from dataclasses import replace
from unittest.mock import patch
import warnings
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "validate_ohlcv_assets.py"
SPEC = importlib.util.spec_from_file_location("asset_ohlcv_validator", SCRIPT)
validator = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = validator
SPEC.loader.exec_module(validator)

HEADER = "Date,Open,High,Low,Close,Volume\n"
VALID = "2026-07-17,10,12,9,11,100.0\n"
AS_OF = "2026-09-24"


class AssetOhlcvValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="ashstocks-asset-test-")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.archive = self.directory / "fixture.zip"
        self.inventory = self.directory / "inventory.json"

    def pin(self):
        body = self.archive.read_bytes()
        self.inventory.write_text(json.dumps({
            "schema_version": "ashstocks-asset-inventory-v1",
            "assets": [{"id": 1, "name": self.archive.name, "bytes": len(body),
                        "sha256": hashlib.sha256(body).hexdigest(),
                        "url": "https://example.invalid/fixture.zip"}],
        }), encoding="utf-8")

    def make(self, members=None, compression=zipfile.ZIP_DEFLATED):
        if members is None:
            members = [("history/ABC.NS.csv", HEADER + VALID)]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(self.archive, "w", compression=compression) as output:
                for name, content in members:
                    output.writestr(name, content, compress_type=compression)
        self.pin()

    def run_validation(self, **kwargs):
        return validator.validate_archive(self.archive, self.inventory, as_of=AS_OF, **kwargs)

    def test_happy_path_is_deterministic_read_only_and_never_import_ready(self):
        self.make([("history/", ""), ("history/ABC.NS.csv", HEADER + VALID),
                   ("history/MANIFEST.txt", "historical source notes\n")])
        before = {p.name: p.read_bytes() for p in self.directory.iterdir()}
        with patch.object(socket, "socket", side_effect=AssertionError("network forbidden")), \
                patch.object(socket, "getaddrinfo", side_effect=AssertionError("network forbidden")):
            first = self.run_validation()
            second = self.run_validation()
        self.assertEqual(first, second)
        self.assertEqual(first["schema_version"], "ashstocks-ohlcv-dry-run-v1")
        self.assertTrue(first["dry_run"])
        self.assertFalse(first["database_import_performed"])
        self.assertFalse(first["production_import_ready"])
        self.assertEqual(first["summary"]["rows_structurally_valid"], 1)
        self.assertEqual(first["summary"]["rows_rejected"], 0)
        self.assertEqual(first["summary"]["symbols"], 1)
        self.assertFalse(first["symbols"][0]["identity_verified"])
        self.assertEqual(first["symbols"][0]["candidate_symbol"], "ABC")
        self.assertTrue(first["unresolved_checks"])
        self.assertEqual(len(first["metadata_members"]), 1)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.directory.iterdir()})
        other = self.directory / "other"
        other.mkdir()
        shutil.copyfile(self.archive, other / self.archive.name)
        shutil.copyfile(self.inventory, other / self.inventory.name)
        copied = validator.validate_archive(other / self.archive.name, other / self.inventory.name, as_of=AS_OF)
        self.assertEqual(first, copied, "absolute local paths must not alter the report")

    def test_zero_volume_weekend_bom_and_real_symbol_punctuation(self):
        self.make([("M&M.NS.csv", "\ufeff" + HEADER + "2026-07-18,10,12,9,11,0\n"),
                   ("BAJAJ-AUTO.NS.csv", HEADER + VALID)])
        report = self.run_validation()
        self.assertEqual(report["summary"]["rows_structurally_valid"], 2)
        self.assertEqual(report["summary"]["zero_volume_rows"], 1)
        self.assertEqual({s["candidate_symbol"] for s in report["symbols"]}, {"M&M", "BAJAJ-AUTO"})

    def test_invalid_rows_are_reported_without_silent_numeric_or_date_repair(self):
        bad = [
            "2026-07-01,10,12,9,11,-1",
            "2026-07-02,10,12,9,11,100.5",
            "2026-07-03,NaN,12,9,11,100",
            "2026-07-04,10,1e999,9,11,100",
            "2026-07-05,0,12,9,11,100",
            "2026-07-06,10,8,9,11,100",
            "2026-07-07,10,12,9,11,Infinity",
            "2026-02-30,10,12,9,11,100",
            "07/08/2026,10,12,9,11,100",
            "2027-01-01,10,12,9,11,100",
            "2026-07-08,10,12,9,11,9007199254740992.5",
        ]
        self.make([("ABC.NS.csv", HEADER + VALID + "\n".join(bad) + "\n")])
        report = self.run_validation()
        self.assertEqual(report["summary"]["rows_total"], 12)
        self.assertEqual(report["summary"]["rows_structurally_valid"], 1)
        self.assertEqual(report["summary"]["rows_rejected"], 11)
        self.assertEqual(report["summary"]["date_min"], "2026-07-17")
        self.assertEqual(report["summary"]["date_max"], "2026-07-17")
        self.assertEqual(len(report["rejected_rows"]), 11)
        self.assertTrue(all(row["reasons"] for row in report["rejected_rows"]))

    def test_duplicate_dates_reject_all_versions_including_first(self):
        self.make([("ABC.NS.csv", HEADER + VALID + VALID.replace(",11,", ",10,"))])
        report = self.run_validation()
        self.assertEqual(report["summary"]["rows_total"], 2)
        self.assertEqual(report["summary"]["rows_structurally_valid"], 0)
        self.assertEqual(report["summary"]["rows_rejected"], 2)
        self.assertEqual(report["summary"]["rejection_reasons"]["duplicate_date"], 2)

    def test_out_of_order_dates_are_observed_not_silently_sorted(self):
        self.make([("ABC.NS.csv", HEADER + VALID + VALID.replace("07-17", "07-16"))])
        report = self.run_validation()
        self.assertEqual(report["summary"]["rows_structurally_valid"], 2)
        self.assertEqual(report["summary"]["out_of_order_rows"], 1)
        self.assertEqual(report["symbols"][0]["out_of_order_rows"], 1)
        self.assertFalse(report["production_import_ready"])

    def test_placeholder_symbol_never_becomes_verified_history(self):
        self.make([("STOCK_123.NS.csv", HEADER + VALID)])
        report = self.run_validation()
        self.assertEqual(report["summary"]["rows_rejected"], 1)
        self.assertEqual(report["summary"]["rows_structurally_valid"], 0)

    def test_rejected_samples_are_bounded_but_total_counts_are_complete(self):
        rows = "".join("2026-07-%02d,10,12,9,11,-1\n" % day for day in range(1, 6))
        self.make([("ABC.NS.csv", HEADER + rows)])
        report = self.run_validation(limits=replace(validator.Limits(), max_samples=2))
        self.assertEqual(report["summary"]["rows_rejected"], 5)
        self.assertEqual(len(report["rejected_rows"]), 2)
        self.assertTrue(report["rejected_samples_truncated"])

    def test_strict_headers_encoding_and_csv_shape_fail_without_partial_success(self):
        contents = [
            "Open,Date,High,Low,Close,Volume\n10,2026-07-17,12,9,11,100\n",
            "Date,Open,High,Low,Close,Close\n" + VALID,
            HEADER + "2026-07-17,10,12,9,11\n",
            HEADER + "2026-07-17,10,12,9,11,100,extra\n",
            HEADER + '"2026-07-17,10,12,9,11,100\n',
            HEADER.encode() + b"\xff\n",
        ]
        for content in contents:
            with self.subTest(content=repr(content)[:80]):
                self.make([("ABC.NS.csv", content)])
                with self.assertRaises(validator.ValidationError):
                    self.run_validation()

    def test_unknown_metadata_or_no_candles_is_not_success(self):
        for members in [[("README.exe", "not market data")], [("MANIFEST.txt", "notes")],
                        [("ABC.csv", HEADER + VALID)]]:
            with self.subTest(members=members):
                self.make(members)
                with self.assertRaises(validator.ValidationError):
                    self.run_validation()

    def test_unsafe_member_names_fail_without_extraction(self):
        for name in ["../ABC.NS.csv", "/ABC.NS.csv", "a/../ABC.NS.csv",
                     "a\\ABC.NS.csv", "C:/ABC.NS.csv", "a//ABC.NS.csv"]:
            with self.subTest(name=name):
                self.make([(name, HEADER + VALID)])
                with self.assertRaises(validator.ValidationError):
                    self.run_validation()
        self.assertEqual(sorted(p.name for p in self.directory.iterdir()), ["fixture.zip", "inventory.json"])

    def test_duplicate_member_or_symbol_alias_fails(self):
        cases = [
            [("ABC.NS.csv", HEADER + VALID), ("ABC.NS.csv", HEADER + VALID)],
            [("a/ABC.NS.csv", HEADER + VALID), ("b/ABC.NS.csv", HEADER + VALID)],
            [("ABC.NS.csv", HEADER + VALID), ("abc.NS.csv", HEADER + VALID)],
        ]
        for members in cases:
            with self.subTest(members=[x[0] for x in members]):
                self.make(members)
                with self.assertRaises(validator.ValidationError):
                    self.run_validation()

    def test_symlink_member_and_symlink_input_are_refused(self):
        info = zipfile.ZipInfo("ABC.NS.csv")
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        self.make([(info, "elsewhere")])
        with self.assertRaises(validator.ValidationError):
            self.run_validation()
        self.make()
        alias = self.directory / "alias.zip"
        alias.symlink_to(self.archive)
        manifest = json.loads(self.inventory.read_text())
        manifest["assets"][0]["name"] = alias.name
        self.inventory.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(validator.ValidationError, "symlink"):
            validator.validate_archive(alias, self.inventory, as_of=AS_OF)

    def test_nonregular_archive_and_symlink_inventory_fail_without_hanging(self):
        self.make()
        inventory_alias = self.directory / "linked-inventory.json"
        inventory_alias.symlink_to(self.inventory)
        with self.assertRaises(validator.ValidationError):
            validator.validate_archive(self.archive, inventory_alias, as_of=AS_OF)
        self.archive.unlink()
        os.mkfifo(self.archive)
        with self.assertRaises(validator.ValidationError):
            self.run_validation()

    def test_unsupported_compression_and_encrypted_member_are_refused(self):
        self.make(compression=zipfile.ZIP_BZIP2)
        with self.assertRaises(validator.ValidationError):
            self.run_validation()
        self.make()
        body = bytearray(self.archive.read_bytes())
        local = body.index(b"PK\x03\x04")
        central = body.index(b"PK\x01\x02")
        struct.pack_into("<H", body, local + 6, struct.unpack_from("<H", body, local + 6)[0] | 1)
        struct.pack_into("<H", body, central + 8, struct.unpack_from("<H", body, central + 8)[0] | 1)
        self.archive.write_bytes(body)
        self.pin()
        with self.assertRaises(validator.ValidationError):
            self.run_validation()

    def test_member_count_preflight_runs_before_zip_object_allocation(self):
        self.make()
        body = bytearray(self.archive.read_bytes())
        end = body.rindex(b"PK\x05\x06")
        struct.pack_into("<HH", body, end + 8, 1000, 1000)
        self.archive.write_bytes(body)
        self.pin()
        with patch.object(validator.zipfile, "ZipFile", side_effect=AssertionError("allocation before limit")):
            with self.assertRaises(validator.ValidationError):
                self.run_validation()

    def test_invalid_or_oversized_inventory_and_limits_are_refused(self):
        self.make()
        for content in [b"\xff", b"[]", b"x" * (2 * 1024 * 1024 + 1)]:
            with self.subTest(size=len(content)):
                self.inventory.write_bytes(content)
                with self.assertRaises(validator.ValidationError):
                    self.run_validation()
        self.pin()
        for limit in [replace(validator.Limits(), max_rows_per_member=0),
                      replace(validator.Limits(), max_archive_bytes=True), object()]:
            with self.assertRaises(validator.ValidationError):
                self.run_validation(limits=limit)

    def test_limits_bound_archive_members_uncompressed_rows_and_fields(self):
        self.make([("ABC.NS.csv", HEADER + VALID + VALID.replace("07-17", "07-16")),
                   ("DEF.NS.csv", HEADER + VALID)])
        limits = validator.Limits()
        overrides = [dict(max_archive_bytes=1), dict(max_members=1), dict(max_member_bytes=10),
                     dict(max_total_uncompressed_bytes=10), dict(max_rows_per_member=1),
                     dict(max_total_rows=1), dict(max_field_chars=4)]
        for override in overrides:
            with self.subTest(override=override):
                with self.assertRaises(validator.ValidationError):
                    self.run_validation(limits=replace(limits, **override))

    def test_checksum_size_manifest_and_asof_failures(self):
        for mutation in ["sha", "size", "missing", "duplicate", "schema", "asof"]:
            with self.subTest(mutation=mutation):
                self.make()
                manifest = json.loads(self.inventory.read_text())
                if mutation == "sha": manifest["assets"][0]["sha256"] = "0" * 64
                if mutation == "size": manifest["assets"][0]["bytes"] += 1
                if mutation == "missing": manifest["assets"] = []
                if mutation == "duplicate": manifest["assets"].append(dict(manifest["assets"][0]))
                if mutation == "schema": manifest["schema_version"] = "wrong"
                self.inventory.write_text(json.dumps(manifest), encoding="utf-8")
                with self.assertRaises(validator.ValidationError):
                    validator.validate_archive(self.archive, self.inventory,
                                               as_of="24/09/2026" if mutation == "asof" else AS_OF)

    def test_truncated_and_crc_corrupt_zip_fail_even_with_matching_digest(self):
        self.make(compression=zipfile.ZIP_STORED)
        original = self.archive.read_bytes()
        self.archive.write_bytes(original[:-20])
        self.pin()
        with self.assertRaises(validator.ValidationError):
            self.run_validation()
        self.archive.write_bytes(original)
        with zipfile.ZipFile(self.archive) as z:
            offset = z.infolist()[0].header_offset
        body = bytearray(original)
        name_len, extra_len = struct.unpack_from("<HH", body, offset + 26)
        payload_offset = offset + 30 + name_len + extra_len
        body[payload_offset + len(HEADER) + 12] ^= 1
        self.archive.write_bytes(body)
        self.pin()
        with self.assertRaises(validator.ValidationError):
            self.run_validation()

    def test_cli_contract_clean_environment_and_structured_fatal_error(self):
        self.make()
        command = [sys.executable, "-B", str(SCRIPT), "--archive", str(self.archive),
                   "--inventory", str(self.inventory), "--as-of", AS_OF]
        result = subprocess.run(command, text=True, capture_output=True, timeout=10,
                                env={"PATH": os.environ.get("PATH", "")})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(json.loads(result.stdout)["production_import_ready"])
        self.archive.write_bytes(b"invalid")
        result = subprocess.run(command, text=True, capture_output=True, timeout=10,
                                env={"PATH": os.environ.get("PATH", "")})
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, "")
        self.assertIsInstance(json.loads(result.stderr), dict)


if __name__ == "__main__":
    unittest.main()
