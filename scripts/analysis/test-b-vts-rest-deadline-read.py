"""Exercise #1073 P4 with independent log receipts and database export fixtures."""
from datetime import datetime, timedelta, timezone
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("p4", Path(__file__).with_name("b-vts-rest-deadline-read.py"))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)

START = datetime(2026, 11, 1, tzinfo=timezone.utc)
END = START + timedelta(hours=168)
CENSOR = START + timedelta(hours=192)
PLACED = reader.utc_ms(START)
DEADLINE = PLACED + 6_000
ASSET = "crypto_spot"


def receipt_line(trade, position, clock):
    return (f"stdout {reader.LOG_MARKER} positionId={position} | symbol=BTC/USD | tradeId={trade}"
            f" | makerAuditVersion=1 | makerAuditRole=pending_maker | mode=paper"
            f" | assetClass={ASSET} | makerPlacedAtMs={clock}\n")


def filled(quote, *, trade_id="t", pos_id="p", outcome="fill"):
    evaluated = DEADLINE + 4_000
    row = {
        "trade_id": trade_id, "mode": "paper", "asset_class": ASSET, "symbol": "BTC/USD", "side": "buy",
        "closed_at": (START + timedelta(seconds=11)).isoformat() if outcome == "cancel" else None,
        "close_reason": "never_filled" if outcome == "cancel" else None, "exit_price": None,
        "entry_decision_price": "100",
        "unfilled_reason": "pending maker at 100 hit the hard-drop deadline unfilled",
        "placement": {"version": 1, "tradeId": trade_id, "positionId": pos_id, "makerPlacedAtMs": PLACED,
                      "makerDeadlineAtMs": DEADLINE, "mode": "paper", "assetClass": ASSET, "symbol": "BTC/USD",
                      "limitPrice": "100"},
        "refusal": None,
        "terminal": {"version": 1, "link": "linked", "positionId": pos_id, "outcome": outcome,
                     "quoteArrivedAtMs": quote, "quoteSide": "ask", "evaluatedAtMs": evaluated,
                     "refusalEvidence": {
                         "version": 1, "epochId": "boot:timer", "placedAtMs": PLACED, "deadlineAtMs": DEADLINE,
                         "periodMs": 2_000, "epochAnchorAtMs": PLACED, "epochMonotonicAnchorMs": 0.125,
                         "discontinuity": None,
                         "sample": {"slot": 5, "callbackNumber": 5, "wallAtMs": evaluated + 1,
                                    "monotonicAtMs": 10_001.125,
                                    "observation": "evaluated_side"},
                         "recovered": {"first": {"slot": 2, "callbackNumber": 2, "wallAtMs": PLACED + 4_000,
                                                 "monotonicAtMs": 4_000.125,
                                                 "observation": "upstream_refusal"},
                                       "last": {"slot": 4, "callbackNumber": 4, "wallAtMs": PLACED + 8_000,
                                                "monotonicAtMs": 8_000.125,
                                                "observation": "upstream_refusal"}, "count": 3},
                     }},
    }
    saved = copy.deepcopy(row["terminal"]["refusalEvidence"])
    saved["refusing"] = saved.pop("recovered")
    saved.update(tradeId=trade_id, positionId=pos_id, sample=saved["refusing"]["last"])
    row["refusal"] = saved
    return row


def open_position(trade_id="t", position_id="p", placed=PLACED, deadline=DEADLINE):
    return {"position_id": position_id, "state": "open", "placed_at_ms": placed, "deadline_at_ms": deadline,
            "trade_id": trade_id, "mode": "paper", "asset_class": ASSET, "symbol": "BTC/USD"}


class P4Fixture(unittest.TestCase):
    def collect(self, *, gap=False, clock=PLACED, corrupt_history=False):
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp) / "out.log"
            file.write_text(receipt_line("t", "p", clock)
                            + receipt_line("end-exclusive", "p2", reader.utc_ms(END))
                            + receipt_line("before-start", "p3", PLACED - 1)
                            + f"{reader.LOG_MARKER} positionId=other | symbol=BTC/USD | tradeId=other\n",
                            encoding="utf-8")
            period = {"start": START.isoformat(), "end": CENSOR.isoformat()}
            history = {}
            for name in ("boot_history", "reset_history", "deployment_history"):
                evidence = file.with_name(name)
                evidence.write_text(f"fixture {name}\n", encoding="utf-8")
                history[name] = {"file": name, "complete": True, "sha256": reader.sha256(evidence),
                                 "unbounded_purge": False} | period
            manifest = {
                "version": 1, "activation": START.isoformat(), "activation_build": "b" * 40,
                "stdout": [{"file": file.name, "sha256": reader.sha256(file), "build": "b" * 40,
                            "placement_writer_verified": True} | period],
                "history": history,
            }
            if gap:
                manifest["stdout"][0]["start"] = (START + timedelta(minutes=1)).isoformat()
            if corrupt_history:
                file.with_name("boot_history").write_text("different boot history\n", encoding="utf-8")
            return reader.capture_receipts(manifest, [file], file.parent)

    def grade(self, trades, *, receipts=None, positions=None):
        receipts = self.collect() if receipts is None else receipts
        if positions is None:
            positions = [
                open_position(item["trade_id"], item["placement"]["positionId"], item["placement"]["makerPlacedAtMs"])
                for item in trades if item["placement"] and item["terminal"]["outcome"] == "fill" and not item["closed_at"]
            ]
        snapshot = {key: receipts[key] for key in ("version", "activation", "placements_until", "terminal_at",
                                                   "receipt_ids")}
        snapshot.update(captured_at=CENSOR.isoformat(), trades=trades, positions=positions)
        return reader.grade(receipts, snapshot)["classes"]

    def test_exact_placement_edges_and_unrelated_control(self):
        result = self.collect()
        self.assertEqual(result["receipt_ids"], ["t"])
        self.assertEqual(result["ordinary_open_receipt_controls"], 1)

    def test_early_quote_decided_late_and_at_deadline_positive_control(self):
        early = self.grade([filled(DEADLINE - 1)])[ASSET]
        at_deadline = self.grade([filled(DEADLINE)])[ASSET]
        self.assertEqual(early["verdict"], "NO-TRIGGER")
        self.assertEqual(early["receipt_timing"], {"early": 1})
        self.assertEqual(at_deadline["verdict"], "TRIGGER-OBSERVED")
        self.assertEqual(at_deadline["confirmed_trigger_ids"], ["t"])

    def test_gaps_keep_separate_receipt_and_outcome_evidence(self):
        for break_cause in ("epoch", "slot_gap", "clock"):
            with self.subTest(break_cause=break_cause):
                trade = filled(DEADLINE)
                trade["terminal"]["refusalEvidence"]["discontinuity"] = break_cause
                result = self.grade([trade])[ASSET]
                self.assertEqual(result["verdict"], "NO-RESULT")
                self.assertEqual(result["receipt_timing"], {"at_or_after_deadline": 1})
                self.assertEqual(result["outcome"], {"filled": 1})

    def test_receipt_found_but_stamp_missing_and_trade_without_receipt(self):
        missing_stamp = filled(DEADLINE)
        missing_stamp["placement"] = None
        missing_receipt = filled(DEADLINE, trade_id="other", pos_id="another")
        result = self.grade([missing_stamp, missing_receipt],
                            positions=[open_position(), open_position("other", "another")])[ASSET]
        self.assertEqual(result["exact_placements"], 1)
        self.assertEqual(result["verdict"], "NO-RESULT")
        self.assertIn(("t", "placement_stamp_unreconciled"), result["coverage_issues"])
        self.assertIn(("other", "unreconciled_trade_candidate"), result["coverage_issues"])

    def test_different_position_on_same_symbol_does_not_reconcile(self):
        trade = filled(DEADLINE)
        trade["terminal"]["positionId"] = "replacement"
        result = self.grade([trade])[ASSET]
        self.assertEqual(result["verdict"], "NO-RESULT")
        self.assertEqual(result["confirmed_trigger_ids"], [])

    def test_source_coverage_gap_and_empty_class_are_no_result(self):
        results = self.grade([filled(DEADLINE)], receipts=self.collect(gap=True))
        self.assertEqual(results["xstock_spot"]["verdict"], "NO-RESULT")
        self.assertEqual(results[ASSET]["verdict"], "NO-RESULT")
        self.assertEqual(results[ASSET]["confirmed_trigger_ids"], ["t"])

    def test_a_history_checksum_requires_its_underlying_bytes(self):
        with self.assertRaisesRegex(ValueError, "history checksum mismatch: boot_history"):
            self.collect(corrupt_history=True)

    def test_held_then_unfilled_and_exact_stop_have_distinct_outcomes(self):
        cancel = filled(None, outcome="cancel")
        stop = copy.deepcopy(cancel)
        stop["terminal"]["evaluatedAtMs"] = None
        stop["unfilled_reason"] = "pending maker cancelled by the engine stop, unfilled"
        self.assertEqual(self.grade([cancel])[ASSET]["outcome"], {"held_then_unfilled": 1})
        self.assertEqual(self.grade([stop])[ASSET]["outcome"], {"stop_or_reset": 1})

    def test_cancel_keeps_an_earlier_persisted_refusal_but_fill_requires_terminal_recovery(self):
        cancel = filled(None, outcome="cancel")
        saved = cancel["terminal"].pop("refusalEvidence")
        saved["refusing"] = saved.pop("recovered")
        saved.update(tradeId="t", positionId="p", sample=saved["refusing"]["last"])
        cancel["refusal"] = saved
        self.assertEqual(self.grade([cancel])[ASSET]["outcome"], {"held_then_unfilled": 1})
        fill = filled(DEADLINE)
        fill["terminal"].pop("refusalEvidence")
        fill["refusal"] = saved
        self.assertEqual(self.grade([fill])[ASSET]["confirmed_trigger_ids"], [])

    def test_missing_receipt_clock_does_not_impute_membership(self):
        results = self.grade([filled(DEADLINE)], receipts=self.collect(clock="unknown"))
        self.assertEqual(results[ASSET]["exact_placements"], 0)
        self.assertEqual(results[ASSET]["verdict"], "NO-RESULT")
        self.assertIn(("t", "placement_clock_missing"), results[ASSET]["coverage_issues"])

    def test_exact_outside_placement_can_discharge_broad_terminal_day_candidate(self):
        lost = filled(DEADLINE, trade_id="edge", pos_id="other")
        lost["placement"] = None
        covered = self.grade([filled(DEADLINE), lost])[ASSET]
        self.assertEqual(covered["verdict"], "NO-RESULT")
        self.assertEqual(covered["confirmed_trigger_ids"], ["t"])
        outside = filled(DEADLINE, trade_id="edge", pos_id="other")
        outside["placement"]["makerPlacedAtMs"] = reader.utc_ms(END)
        self.assertEqual(self.grade([filled(DEADLINE), outside])[ASSET]["verdict"], "TRIGGER-OBSERVED")

    def test_non_crossing_winning_price_preserves_timing_but_withholds_trigger(self):
        false_cross = filled(DEADLINE)
        false_cross["entry_decision_price"] = "100.00000001"
        result = self.grade([false_cross])[ASSET]
        self.assertEqual(result["receipt_timing"], {"at_or_after_deadline": 1})
        self.assertEqual(result["verdict"], "NO-RESULT")
        self.assertEqual(result["confirmed_trigger_ids"], [])

    def test_fill_reconciles_open_position_or_later_close(self):
        trade = filled(DEADLINE)
        missing_open = self.grade([trade], positions=[])[ASSET]
        self.assertEqual(missing_open["verdict"], "NO-RESULT")
        self.assertIn(("t", "fill_unreconciled"), missing_open["coverage_issues"])

        trade.update(closed_at=(START + timedelta(seconds=9)).isoformat(), close_reason="target_hit")
        before_fill = self.grade([trade])[ASSET]
        self.assertEqual(before_fill["verdict"], "NO-RESULT")
        self.assertEqual(before_fill["confirmed_trigger_ids"], [])

        trade["closed_at"] = (START + timedelta(seconds=11)).isoformat()
        later_close = self.grade([trade])[ASSET]
        self.assertEqual(later_close["confirmed_trigger_ids"], ["t"])
        closed_with_position = self.grade([trade], positions=[open_position()])[ASSET]
        self.assertEqual(closed_with_position["verdict"], "NO-RESULT")
        trade["closed_at"] = (CENSOR + timedelta(seconds=1)).isoformat()
        future_close = self.grade([trade])[ASSET]
        self.assertEqual(future_close["verdict"], "NO-RESULT")

    def test_recovery_requires_forward_coherent_monotonic_samples(self):
        for path, monotonic_value in (("first", 9_000), ("sample", 7_000), ("sample", 13_000), ("sample", None)):
            with self.subTest(path=path, clock=monotonic_value):
                trade = filled(DEADLINE)
                evidence = trade["terminal"]["refusalEvidence"]
                point = evidence["sample"] if path == "sample" else evidence["recovered"][path]
                point["monotonicAtMs"] = monotonic_value
                result = self.grade([trade])[ASSET]
                self.assertEqual(result["verdict"], "NO-RESULT")
                self.assertEqual(result["confirmed_trigger_ids"], [])
                self.assertEqual(result["outcome"], {"filled": 1})
                self.assertEqual(result["receipt_timing"], {"at_or_after_deadline": 1})

    def test_recovery_requires_the_matching_committed_boundary(self):
        for case in ("missing", "wrong_epoch", "wrong_pair", "different_first_sample"):
            with self.subTest(case=case):
                trade = filled(DEADLINE)
                saved = trade["refusal"]
                if case == "missing":
                    trade["refusal"] = None
                elif case == "wrong_epoch":
                    saved["epochId"] = "another"
                elif case == "wrong_pair":
                    saved["positionId"] = "another"
                else:
                    saved["refusing"]["first"]["wallAtMs"] += 10
                result = self.grade([trade])[ASSET]
                self.assertEqual(result["verdict"], "NO-RESULT")
                self.assertEqual(result["refusal"], {"unknown": 1})
                self.assertEqual(result["outcome"], {"filled": 1})
                self.assertEqual(result["receipt_timing"], {"at_or_after_deadline": 1})

    def test_recovery_requires_samples_in_the_claimed_epoch_slots(self):
        for field, value in (("periodMs", 1_000), ("epochAnchorAtMs", PLACED + 5_000),
                             ("epochMonotonicAnchorMs", None), ("epochMonotonicAnchorMs", 2_000),
                             ("sample", ["invalid"]), ("epochMonotonicAnchorMs", float("nan"))):
            with self.subTest(field=field, value=value):
                trade = filled(DEADLINE)
                trade["terminal"]["refusalEvidence"][field] = value
                result = self.grade([trade])[ASSET]
                self.assertEqual(result["verdict"], "NO-RESULT")
                self.assertEqual(result["refusal"], {"unknown": 1})
                self.assertEqual(result["outcome"], {"filled": 1})
                self.assertEqual(result["receipt_timing"], {"at_or_after_deadline": 1})

    def test_surviving_position_must_agree_with_both_maker_clocks(self):
        trade = filled(DEADLINE)
        for position in (open_position(placed=PLACED + 1_000), open_position(deadline=DEADLINE + 1_000),
                         open_position(placed=None), open_position(deadline=None)):
            with self.subTest(position=position):
                result = self.grade([trade], positions=[position])[ASSET]
                self.assertEqual(result["verdict"], "NO-RESULT")
                self.assertEqual(result["confirmed_trigger_ids"], [])
                self.assertEqual(result["receipt_timing"], {"unknown": 1})
                self.assertIn(("t", "position_clocks_unreconciled"), result["coverage_issues"])


if __name__ == "__main__":
    unittest.main()
