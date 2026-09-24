"""Offline tests: bounded evidence links must never become verified/importable identity."""

from copy import deepcopy
from dataclasses import replace
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "reconcile_asset_identities.py"
SPEC = importlib.util.spec_from_file_location("asset_identity_reconciliation", SCRIPT)
reconciler = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = reconciler
SPEC.loader.exec_module(reconciler)
AS_OF = "2026-09-24"


def member(symbol="ABC"):
    return dict(candidate_symbol=symbol, identity_verified=False, member="history/" + symbol + ".NS.csv",
                member_sha256="a" * 64, rows_total=2, rows_structurally_valid=1, rows_rejected=1,
                zero_volume_rows=0, weekend_rows=0, out_of_order_rows=0,
                date_min="2026-07-17", date_max="2026-07-17")


def identity(symbol="ABC", isin="INE144J01027"):
    return dict(symbol=symbol, isin=isin, instrument_key="NSE_EQ|" + isin, name=symbol + " Limited",
                exchange="NSE", instrument_type="EQ", nse_series="EQ")


class AssetIdentityReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="ashstocks-identity-test-")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.report_path, self.reference_path = self.directory / "report.json", self.directory / "reference.json"
        self.report = dict(schema_version="ashstocks-ohlcv-dry-run-v1", dry_run=True,
                           database_import_performed=False, production_import_ready=False, as_of=AS_OF,
                           source=dict(archive_name="fixture.zip", asset_id=1, bytes=100, sha256="b" * 64,
                                       inventory_sha256="c" * 64, inventory_schema_version="ashstocks-asset-inventory-v1",
                                       url="https://example.invalid/fixture.zip"), symbols=[member()])
        source = dict(version="official-nse-master-v2", status="reference_snapshot", membership_verified=True,
                      membership_policy="nse-equity-list-eq-series-exact-symbol-isin-v2", is_live_quote_data=False,
                      decoded_sha256="d" * 64, equity_decoded_sha256="e" * 64)
        for prefix in ("", "suspended_", "equity_"):
            source.update({prefix + "source_url": reconciler.SOURCE_URLS[prefix + "source_url"],
                           prefix + "source_sha256": "f" * 64, prefix + "fetched_at": "2026-09-13T05:00:56.416Z",
                           prefix + "source_last_modified": "2026-09-12T23:51:56.000Z"})
        self.reference = dict(schema="ashstocks-official-nse-reference-snapshot-v2",
                              application_database_updated=False, never_use_as_fresh_import_fallback=True,
                              universe=[identity()], **{"import": source})
        self.write()

    def write(self):
        dates = [item[key] for item in self.report["symbols"] for key in ("date_min", "date_max") if item.get(key)]
        self.report["summary"] = dict(symbols=len(self.report["symbols"]),
                                      date_min=min(dates) if dates else None, date_max=max(dates) if dates else None,
                                      **{key: sum(item[key] for item in self.report["symbols"]) for key in reconciler.COUNTS})
        self.reference["import"]["eligible_count"] = len(self.reference["universe"])
        self.save_raw()

    def save_raw(self):
        self.report_path.write_text(json.dumps(self.report), encoding="utf-8")
        self.reference_path.write_text(json.dumps(self.reference), encoding="utf-8")

    def run_reconcile(self, **kwargs):
        return reconciler.reconcile_identities(self.report_path, self.reference_path, as_of=AS_OF, **kwargs)

    def test_deterministic_read_only_offline_and_all_activation_flags_false(self):
        before = {p.name: p.read_bytes() for p in self.directory.iterdir()}
        with patch.object(socket, "socket", side_effect=AssertionError("network forbidden")), \
                patch.object(socket, "getaddrinfo", side_effect=AssertionError("network forbidden")):
            result = self.run_reconcile()
            self.assertEqual(result, self.run_reconcile())
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.directory.iterdir()})
        self.assertEqual(result["summary"]["exact_candidate"], 1)
        self.assertEqual(result["symbols"][0]["candidates"][0]["isin"], "INE144J01027")
        self.assertEqual(result["symbols"][0]["rows_rejected"], 1)
        for key in ("database_import_performed", "production_import_ready", "activation_allowed",
                    "historical_identity_verified", "current_tradability_verified", "inherited_source_hashes_revalidated"):
            self.assertIs(result[key], False)
        for key in ("identity_verified", "historical_identity_verified", "current_tradability_verified", "activation_allowed", "import_allowed"):
            self.assertIs(result["symbols"][0][key], False)
        self.assertEqual(result["existing_mongo_coverage"], "unknown_not_queried")
        self.assertEqual(result["historical_source"]["sha256"], "b" * 64)
        self.assertEqual(result["symbols"][0]["member_sha256"], "a" * 64)
        self.assertEqual(result["reference_snapshot"]["fetched_as_of"], "2026-09-13")

    def test_paths_and_input_order_do_not_change_candidate_order(self):
        self.report["symbols"] = [member("ZZZ"), member("ABC")]
        self.write()
        first = self.run_reconcile()
        other = self.directory / "other"
        other.mkdir()
        shutil.copyfile(self.report_path, other / "renamed.json")
        shutil.copyfile(self.reference_path, other / "renamed-reference.json")
        self.assertEqual(first, reconciler.reconcile_identities(other / "renamed.json", other / "renamed-reference.json", as_of=AS_OF))
        self.assertEqual([row["candidate_symbol"] for row in first["symbols"]], ["ABC", "ZZZ"])

    def test_input_hashes_recomputed_and_optional_pins_enforced(self):
        report_hash = hashlib.sha256(self.report_path.read_bytes()).hexdigest()
        reference_hash = hashlib.sha256(self.reference_path.read_bytes()).hexdigest()
        result = self.run_reconcile(expected_report_sha256=report_hash, expected_reference_sha256=reference_hash)
        self.assertEqual(result["historical_report"]["sha256"], report_hash)
        self.assertEqual(result["reference_snapshot"]["sha256"], reference_hash)
        self.assertTrue(result["historical_report"]["expected_sha256_verified"])
        for kwargs in ({"expected_report_sha256": "0" * 64}, {"expected_reference_sha256": "0" * 64},
                       {"expected_report_sha256": "invalid"}, {"expected_reference_sha256": True}):
            with self.subTest(kwargs=kwargs), self.assertRaises(reconciler.ValidationError):
                self.run_reconcile(**kwargs)

    def test_no_alias_case_or_punctuation_repair(self):
        self.report["symbols"] = [member("M&M"), member("BAJAJ-AUTO"), member("NEWNAME"), member("abc")]
        self.reference["universe"] = [identity("MM"), identity("BAJAJAUTO", "INE253B01015"), identity("OLDNAME", "INE466L01038")]
        self.write()
        result = self.run_reconcile()
        self.assertEqual({row["candidate_symbol"]: row["status"] for row in result["symbols"]},
                         {"M&M": "absent", "BAJAJ-AUTO": "absent", "NEWNAME": "absent", "abc": "invalid"})
        self.assertTrue(all(not row["candidates"] for row in result["symbols"]))

    def test_real_symbol_punctuation_and_in9_identity_are_supported(self):
        self.report["symbols"] = [member("M&M"), member("BAJAJ-AUTO"), member("JISLDVREQS")]
        self.reference["universe"] = [identity("M&M"), identity("BAJAJ-AUTO", "INE253B01015"), identity("JISLDVREQS", "IN9175A01010")]
        self.write()
        self.assertEqual(self.run_reconcile()["summary"]["exact_candidate"], 3)

    def test_duplicate_reference_symbol_same_or_different_identity_is_ambiguous(self):
        for row in (identity(), identity(isin="INE253B01015")):
            with self.subTest(row=row):
                self.reference["universe"] = [identity(), row]
                self.write()
                result = self.run_reconcile()
                self.assertEqual(result["symbols"][0]["status"], "ambiguous")
                self.assertEqual(result["symbols"][0]["reference_match_count"], 2)
                self.assertEqual(result["summary"]["reference_diagnostic_rows"], 2)

    def test_shared_isin_across_symbols_is_ambiguous_not_silently_merged(self):
        self.reference["universe"] += [identity("OTHER")]
        self.write()
        result = self.run_reconcile()
        self.assertEqual(result["symbols"][0]["status"], "ambiguous")
        self.assertEqual(result["symbols"][0]["reference_match_count"], 1)
        self.assertIn("duplicate_isin", result["reference_diagnostics"][0]["reasons"])

    def test_malformed_reference_identity_never_becomes_exact_candidate(self):
        for change in ({"isin": "INF144J01027"}, {"isin": "DUMMY1"}, {"instrument_key": "NSE_EQ|OTHER"},
                       {"exchange": "BSE"}, {"instrument_type": "ETF"}, {"nse_series": "BE"},
                       {"name": ""}, {"name": " leading space"}, {"name": "A" * 201}):
            with self.subTest(change=change):
                self.reference["universe"] = [dict(identity(), **change)]
                self.write()
                result = self.run_reconcile()
                self.assertEqual(result["symbols"][0]["status"], "invalid")
                self.assertFalse(result["symbols"][0]["candidates"])
                self.assertEqual(result["summary"]["reference_invalid_rows"], 1)

    def test_unrelated_invalid_reference_row_is_visible_not_hidden(self):
        self.reference["universe"] += [None, {"symbol": "OTHER", "isin": "bad"}]
        self.write()
        result = self.run_reconcile()
        self.assertEqual(result["symbols"][0]["status"], "exact_candidate")
        self.assertEqual(result["summary"]["reference_invalid_rows"], 2)
        self.assertEqual(len(result["reference_diagnostics"]), 2)

    def test_placeholder_history_is_invalid_even_if_reference_repeats_it(self):
        self.report["symbols"] = [member("STOCK_1")]
        self.reference["universe"] = [identity("STOCK_1")]
        self.write()
        self.assertEqual(self.run_reconcile()["symbols"][0]["status"], "invalid")

    def test_duplicate_or_unsafe_historical_members_are_fatal(self):
        for rows in ([member(), member()], [dict(member(), member="../ABC.NS.csv")],
                     [dict(member(), member="/ABC.NS.csv")], [dict(member(), member="history/WRONG.NS.csv")],
                     [dict(member(), member="history\\ABC.NS.csv")]):
            with self.subTest(rows=rows):
                self.report["symbols"] = rows
                self.write()
                with self.assertRaises(reconciler.ValidationError):
                    self.run_reconcile()

    def test_inherited_hashes_and_schema_guards_are_required(self):
        clean = deepcopy(self.report)
        for field, value in (("schema_version", "old"), ("dry_run", False), ("production_import_ready", True),
                             ("database_import_performed", True)):
            self.report = dict(clean, **{field: value})
            self.write()
            with self.subTest(field=field), self.assertRaises(reconciler.ValidationError):
                self.run_reconcile()
        self.report = deepcopy(clean)
        for field in ("sha256", "inventory_sha256"):
            self.report["source"][field] = "bad"
            self.write()
            with self.subTest(field=field), self.assertRaises(reconciler.ValidationError):
                self.run_reconcile()
            self.report = deepcopy(clean)
        self.report["symbols"][0]["member_sha256"] = None
        self.write()
        with self.assertRaises(reconciler.ValidationError):
            self.run_reconcile()

    def test_reference_schema_source_urls_and_hashes_cannot_be_relabelled(self):
        clean = deepcopy(self.reference)
        for field, value in (("schema", "old"), ("application_database_updated", True),
                             ("never_use_as_fresh_import_fallback", False)):
            self.reference = dict(clean, **{field: value})
            self.write()
            with self.subTest(field=field), self.assertRaises(reconciler.ValidationError):
                self.run_reconcile()
        for field, value in (("source_url", "https://example.invalid"), ("equity_source_sha256", "bad"),
                             ("decoded_sha256", "bad"), ("membership_verified", False),
                             ("is_live_quote_data", True), ("status", "live")):
            self.reference = deepcopy(clean)
            self.reference["import"][field] = value
            self.write()
            with self.subTest(field=field), self.assertRaises(reconciler.ValidationError):
                self.run_reconcile()

    def test_inconsistent_dates_counts_and_booleans_rejected(self):
        clean = deepcopy(self.report)
        for field, value in (("rows_total", True), ("rows_structurally_valid", 2), ("rows_rejected", -1),
                             ("zero_volume_rows", 5), ("date_max", "2026-10-01"), ("date_min", "2026-07-18"),
                             ("date_min", "not-a-date"), ("identity_verified", True)):
            self.report = deepcopy(clean)
            self.report["symbols"][0][field] = value
            self.write()
            with self.subTest(field=field), self.assertRaises(reconciler.ValidationError):
                self.run_reconcile()
        self.report = deepcopy(clean)
        self.write()
        self.report["summary"]["rows_total"] += 1
        self.save_raw()
        with self.assertRaises(reconciler.ValidationError):
            self.run_reconcile()

    def test_rejected_only_source_has_no_valid_dates_but_identity_stays_a_candidate(self):
        self.report["symbols"][0].update(rows_structurally_valid=0, rows_rejected=2, date_min=None, date_max=None)
        self.write()
        result = self.run_reconcile()["symbols"][0]
        self.assertEqual(result["status"], "exact_candidate")
        self.assertEqual(result["rows_rejected"], 2)
        self.assertIsNone(result["date_min"])
        self.assertFalse(result["import_allowed"])

    def test_rejected_only_source_requires_explicit_null_date_fields(self):
        self.report["symbols"][0].update(rows_structurally_valid=0, rows_rejected=2, date_min=None, date_max=None)
        self.write()
        clean = deepcopy(self.report)
        for container in ("member", "summary"):
            for key in ("date_min", "date_max"):
                self.report = deepcopy(clean)
                target = self.report["symbols"][0] if container == "member" else self.report["summary"]
                del target[key]
                self.save_raw()
                with self.subTest(container=container, key=key), self.assertRaises(reconciler.ValidationError):
                    self.run_reconcile()

    def test_future_and_ill_ordered_source_timestamps_fail(self):
        clean = deepcopy(self.reference)
        for field, value in (("fetched_at", "2026-10-01T00:00:00Z"),
                             ("source_last_modified", "2026-09-14T00:00:00Z"),
                             ("equity_fetched_at", "2026-09-13"),
                             ("suspended_fetched_at", "2026-09-13T05:00:00+05:30")):
            self.reference = deepcopy(clean)
            self.reference["import"][field] = value
            self.write()
            with self.subTest(field=field), self.assertRaises(reconciler.ValidationError):
                self.run_reconcile()
        self.reference = deepcopy(clean)
        self.report["as_of"] = "2026-10-01"
        self.write()
        with self.assertRaises(reconciler.ValidationError):
            self.run_reconcile()

    def test_cutoff_and_reference_declared_counts_are_strict(self):
        for cutoff in (None, True, "2026-02-30", "2026-9-24", "2026-09-23"):
            with self.subTest(cutoff=cutoff), self.assertRaises(reconciler.ValidationError):
                reconciler.reconcile_identities(self.report_path, self.reference_path, as_of=cutoff)
        for count in (True, 0, 2, "1"):
            self.reference["import"]["eligible_count"] = count
            self.save_raw()
            with self.subTest(count=count), self.assertRaises(reconciler.ValidationError):
                self.run_reconcile()

    def test_resource_bounds_and_invalid_limits(self):
        for limits in (replace(reconciler.Limits(), max_report_bytes=1), replace(reconciler.Limits(), max_reference_bytes=1),
                       replace(reconciler.Limits(), max_rows=1), replace(reconciler.Limits(), max_symbols=0),
                       replace(reconciler.Limits(), max_diagnostics=-1), replace(reconciler.Limits(), max_symbols=True), {}):
            with self.subTest(limits=limits), self.assertRaises(reconciler.ValidationError):
                self.run_reconcile(limits=limits)
        self.reference["universe"] += [identity("OTHER", "INE253B01015")]
        self.report["symbols"] += [member("OTHER")]
        self.write()
        for limits in (replace(reconciler.Limits(), max_symbols=1), replace(reconciler.Limits(), max_reference_rows=1)):
            with self.subTest(limits=limits), self.assertRaises(reconciler.ValidationError):
                self.run_reconcile(limits=limits)

    def test_diagnostics_and_candidates_are_bounded_with_explicit_truncation(self):
        self.reference["universe"] = [identity(), identity(), identity()]
        self.write()
        result = self.run_reconcile(limits=replace(reconciler.Limits(), max_diagnostics=1, max_candidates_per_symbol=1))
        self.assertEqual(result["summary"]["reference_diagnostic_rows"], 3)
        self.assertEqual(len(result["reference_diagnostics"]), 1)
        self.assertTrue(result["reference_diagnostics_truncated"])
        self.assertEqual(result["symbols"][0]["status"], "ambiguous")
        self.assertEqual(len(result["symbols"][0]["candidates"]), 1)
        self.assertEqual(result["symbols"][0]["valid_candidate_count"], 3)
        self.assertTrue(result["symbols"][0]["candidates_truncated"])
        self.assertEqual(self.run_reconcile(limits=replace(reconciler.Limits(), max_diagnostics=0))["reference_diagnostics"], [])

    def test_nonstandard_duplicate_or_invalid_json_is_fatal(self):
        for body in (b'{"x":1,"x":2}', b'{"x":NaN}', b'{"x":Infinity}', b'{"x":1e9999}',
                     b'{"x":123456789012345678901}', b'\xff', b'{invalid', b'[' * 2000 + b']' * 2000):
            with self.subTest(body=body[:40]):
                self.report_path.write_bytes(body)
                with self.assertRaises(reconciler.ValidationError):
                    self.run_reconcile()

    def test_symlinks_missing_and_nonregular_inputs_rejected(self):
        link = self.directory / "symlink.json"
        link.symlink_to(self.report_path)
        fifo = self.directory / "fifo"
        os.mkfifo(fifo)
        for path in (link, self.directory / "missing.json", self.directory, fifo):
            with self.subTest(path=path), self.assertRaises(reconciler.ValidationError):
                reconciler.reconcile_identities(path, self.reference_path, as_of=AS_OF)

    def test_cli_has_machine_readable_success_and_fatal_exit(self):
        args = [sys.executable, "-B", str(SCRIPT), "--report", str(self.report_path),
                "--reference", str(self.reference_path), "--as-of", AS_OF]
        success = subprocess.run(args, text=True, capture_output=True, timeout=10, check=False)
        self.assertEqual(success.returncode, 0, success.stderr)
        self.assertEqual(json.loads(success.stdout), self.run_reconcile())
        self.assertEqual(success.stderr, "")
        failure = subprocess.run(args + ["--expected-report-sha256", "0" * 64], text=True, capture_output=True, timeout=10, check=False)
        self.assertEqual(failure.returncode, 2)
        self.assertEqual(failure.stdout, "")
        self.assertFalse(json.loads(failure.stderr)["database_import_performed"])


if __name__ == "__main__":
    unittest.main()
