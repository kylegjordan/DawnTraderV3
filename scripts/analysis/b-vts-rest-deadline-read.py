#!/usr/bin/env python3
"""#1073 P4, read-only. The capture contract is in B_VTS_REST_DEADLINE_PRE_AUDIT.md.

Pass the verified coverage manifest and retained stdout to the receipts subcommand.
Export the database snapshot with the candidate SQL and the reported receipt_ids.
The grade subcommand reconciles those two independently captured populations.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
import gzip
import hashlib
import json
from pathlib import Path
import re


ASSET_CLASSES = ("crypto_spot", "xstock_spot")
LOG_MARKER = "[AJ10.3][OPEN_POSITION_OK]"
RECEIPT = re.compile(
    r"\[AJ10\.3\]\[OPEN_POSITION_OK\] positionId=(\S+) \| symbol=(\S+) \| tradeId=(\S+)"
    r" \| makerAuditVersion=1 \| makerAuditRole=pending_maker \| mode=paper"
    r" \| assetClass=(crypto_spot|xstock_spot) \| makerPlacedAtMs=(\d+|unknown)\s*$"
)
SHA256 = re.compile(r"[0-9a-f]{64}")
COMMIT_SHA = re.compile(r"[0-9a-f]{40}")


def utc(value):
    stamp = datetime.fromisoformat(value)
    if stamp.utcoffset() != timedelta(0):
        raise ValueError(f"expected UTC timestamp: {value}")
    return stamp.astimezone(timezone.utc)


def utc_ms(stamp):
    return (stamp - datetime(1970, 1, 1, tzinfo=timezone.utc)) // timedelta(milliseconds=1)


def load_json(file):
    return json.loads(file.read_text(encoding="utf-8"))


def sha256(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def has_number(value):
    return type(value) is int


def capture_receipts(manifest, log_paths, history_dir):
    activation = utc(manifest["activation"])
    placement_end = activation + timedelta(hours=168)
    terminal_at = activation + timedelta(hours=192)
    lower, upper = utc_ms(activation), utc_ms(placement_end)
    if manifest["version"] != 1 or not COMMIT_SHA.fullmatch(manifest["activation_build"]):
        raise ValueError("unrecognized capture manifest or missing exact activation build")
    paths = {file.name: file for file in log_paths}
    source_names = [source["file"] for source in manifest["stdout"]]
    if len(paths) != len(log_paths) or len(set(source_names)) != len(source_names) or set(paths) != set(source_names):
        raise ValueError("stdout rotation inventory does not match the supplied files")

    expected_start = activation
    coverage_issues = []
    if not manifest["stdout"]:
        coverage_issues.append("stdout_missing")
    receipts = {}
    unplaced = set()
    ambiguous = set()
    other_entry_controls = 0

    for source in manifest["stdout"]:
        path = paths[source["file"]]
        if sha256(path) != source["sha256"]:
            raise ValueError(f"stdout checksum mismatch: {path.name}")
        start, end = utc(source["start"]), utc(source["end"])
        if start > expected_start:
            coverage_issues.append(f"stdout_gap:{expected_start.isoformat()}:{start.isoformat()}")
        if start >= end or not COMMIT_SHA.fullmatch(source["build"]):
            raise ValueError(f"invalid stdout interval or build: {path.name}")
        if start <= activation < end and source["build"] != manifest["activation_build"]:
            raise ValueError(f"activation build differs in {path.name}")
        if source["placement_writer_verified"] is not True:
            coverage_issues.append(f"writer_unverified:{path.name}")
        expected_start = max(expected_start, end)
        opener = gzip.open if path.suffix == ".gz" else open
        with opener(path, "rt", encoding="utf-8") as lines:
            for line in lines:
                if LOG_MARKER not in line:
                    continue
                match = RECEIPT.search(line)
                if match is None:
                    if "makerAudit" in line:
                        coverage_issues.append(f"malformed_receipt:{path.name}")
                    else:
                        other_entry_controls += 1
                    continue
                position_id, symbol, trade_id, asset_class, stamp = match.groups()
                if stamp == "unknown":
                    unplaced.add((trade_id, asset_class, "placement_clock_missing"))
                    continue
                placed_at_ms = int(stamp)
                if not lower <= placed_at_ms < upper:
                    continue
                receipt = (position_id, symbol, asset_class, placed_at_ms)
                if source["placement_writer_verified"] is not True:
                    unplaced.add((trade_id, asset_class, "placement_writer_unverified"))
                    continue
                if trade_id in receipts and receipts[trade_id] != receipt:
                    ambiguous.add(trade_id)
                    continue
                receipts[trade_id] = receipt

    if expected_start < terminal_at:
        coverage_issues.append("stdout_ends_before_terminal_at")
    for name in ("boot_history", "deployment_history", "reset_history"):
        source = manifest["history"][name]
        filename = source["file"]
        if Path(filename).name != filename or not SHA256.fullmatch(source["sha256"]):
            raise ValueError(f"invalid history file or checksum: {name}")
        if sha256(history_dir / filename) != source["sha256"]:
            raise ValueError(f"history checksum mismatch: {name}")
        if source["complete"] is not True or utc(source["start"]) > activation or utc(source["end"]) < terminal_at:
            coverage_issues.append(f"{name}_unverified")
    if manifest["history"]["reset_history"]["unbounded_purge"] is not False:
        coverage_issues.append("paper_history_purge_unbounded")
    unplaced_ids = {trade_id for trade_id, _, _ in unplaced}
    ambiguous |= receipts.keys() & unplaced_ids
    if ambiguous:
        coverage_issues.append("conflicting_placement_receipts")
    return {
        "version": 1,
        "activation": activation.isoformat(), "placements_until": placement_end.isoformat(),
        "terminal_at": terminal_at.isoformat(), "receipt_ids": sorted(set(receipts) | unplaced_ids),
        "receipts": receipts, "unplaced_receipts": sorted(unplaced),
        "ambiguous_receipts": sorted(ambiguous),
        "coverage_issues": sorted(set(coverage_issues)), "ordinary_open_receipt_controls": other_entry_controls,
    }


def refusal_evidence(terminal, deadline, placed):
    summary = terminal.get("refusalEvidence")
    if not isinstance(summary, dict) or summary.get("version") != 1:
        return "unknown"
    if summary.get("placedAtMs") != placed or summary.get("deadlineAtMs") != deadline:
        return "unknown"
    sample = summary.get("sample") or {}
    period = summary.get("periodMs")
    evaluated, observed = terminal.get("evaluatedAtMs"), sample.get("wallAtMs")
    if not all(map(has_number, (period, evaluated, observed))) or period <= 0:
        return "unknown"
    allowance = min(1000, period / 4)
    if not evaluated <= observed <= evaluated + allowance:
        return "unknown"
    if sample.get("observation") == "venue_quiet_or_cold":
        return "venue_quiet_or_cold"
    span = summary.get("recovered") or summary.get("refusing")
    if not span or not summary.get("epochId"):
        return "unknown"
    first, last = span.get("first") or {}, span.get("last") or {}
    slots = [first.get("slot"), last.get("slot"), first.get("callbackNumber"), last.get("callbackNumber")]
    first_time, last_time = first.get("wallAtMs"), last.get("wallAtMs")
    if not all(map(has_number, (*slots, first_time, last_time, span.get("count")))):
        return "unknown"
    if (first.get("observation") != "upstream_refusal" or last.get("observation") != "upstream_refusal"
            or slots[0] < 1 or slots[2] < 1 or slots[1] - slots[0] + 1 != span["count"]
            or slots[3] - slots[2] + 1 != span["count"] or span["count"] < 2
            or not placed < first_time < deadline - allowance < deadline + allowance < last_time):
        return "unknown"
    if summary.get("recovered") and (sample.get("observation") != "evaluated_side"
            or sample.get("slot") != slots[1] + 1 or sample.get("callbackNumber") != slots[3] + 1
            or sample["wallAtMs"] <= last_time or summary.get("discontinuity") is not None):
        return "unknown"
    return "recovered_across_deadline" if summary.get("recovered") else "refused_across_deadline"


def stored_refusal(trade, position_id, deadline, placed, before_ms):
    summary = trade["refusal"] or {}
    if summary.get("tradeId") != trade["trade_id"] or summary.get("positionId") != position_id:
        return "unknown"
    observed = (summary.get("sample") or {}).get("wallAtMs")
    if not has_number(observed) or observed >= before_ms:
        return "unknown"
    return refusal_evidence({"refusalEvidence": summary, "evaluatedAtMs": observed}, deadline, placed)


def passes_rest_limit(trade, placement):
    try:
        price = Decimal(trade["entry_decision_price"])
        limit = Decimal(placement["limitPrice"])
    except (InvalidOperation, KeyError, TypeError, ValueError):
        return False
    if not price.is_finite() or not limit.is_finite() or min(price, limit) <= 0:
        return False
    return price <= limit if trade["side"] == "buy" else price >= limit


def grade_trade(receipt, trade, position, censor_at_ms):
    position_id, symbol, asset_class, placed = receipt
    result = {"asset_class": asset_class, "placed_at_ms": placed, "position_id": position_id,
              "receipt_timing": "unknown", "refusal": "unknown", "outcome": "unknown", "trigger": "unknown"}
    if trade is None or (trade["mode"], trade["asset_class"], trade["symbol"]) != ("paper", asset_class, symbol):
        return result | {"coverage_issue": "trade_identity_unreconciled"}
    if position is not None and (position["trade_id"], position["mode"], position["asset_class"], position["symbol"]) != (
            trade["trade_id"], "paper", asset_class, symbol):
        return result | {"coverage_issue": "position_identity_unreconciled"}

    stamp, terminal = trade["placement"] or {}, trade["terminal"] or {}
    deadline = stamp.get("makerDeadlineAtMs")
    if (stamp.get("version"), stamp.get("mode"), stamp.get("tradeId"), stamp.get("positionId"), stamp.get("assetClass"),
            stamp.get("symbol"), stamp.get("makerPlacedAtMs")) != (
                1, "paper", trade["trade_id"], position_id, asset_class, symbol, placed):
        result["coverage_issue"] = "placement_stamp_unreconciled"
        deadline = None

    if (terminal.get("version"), terminal.get("link"), terminal.get("positionId")) != (1, "linked", position_id):
        if position and position["state"] == "pending" and not trade["closed_at"] and not terminal:
            result["outcome"] = "censored_pending"
            if has_number(deadline) and deadline > placed:
                result["refusal"] = stored_refusal(trade, position_id, deadline, placed, censor_at_ms)
        else:
            result.setdefault("coverage_issue", "winning_outcome_unreconciled")
        return result

    evaluated = terminal.get("evaluatedAtMs")
    result["evaluated_at_ms"] = evaluated
    result["deadline_at_ms"] = deadline
    if has_number(deadline) and deadline > placed:
        result["refusal"] = refusal_evidence(terminal, deadline, placed)
    if terminal.get("outcome") == "cancel" and trade["close_reason"] == "never_filled" and trade["closed_at"]:
        close_ms = utc_ms(utc(trade["closed_at"]))
        if (position is not None or not placed <= close_ms < censor_at_ms or trade["exit_price"] is not None
                or has_number(evaluated) and not placed <= evaluated <= close_ms):
            return result | {"coverage_issue": "cancellation_unreconciled"}
        if result["refusal"] == "unknown" and has_number(deadline) and deadline > placed:
            result["refusal"] = stored_refusal(trade, position_id, deadline, placed, close_ms)
        reason = trade["unfilled_reason"] or ""
        if ("engine stop" in reason or "reset" in reason or "flatten" in reason):
            category = "stop_or_reset"
        elif result["refusal"] == "venue_quiet_or_cold":
            category = "venue_quiet_or_cold"
        elif result["refusal"] in ("refused_across_deadline", "recovered_across_deadline"):
            category = "held_then_unfilled"
        elif "hit the hard-drop deadline unfilled" in reason:
            category = "ordinary_expiry"
        else:
            category = "unfilled_other"
        return result | {"outcome": category, "receipt_timing": "no_winning_quote", "trigger": "no"}
    if (terminal.get("outcome") != "fill" or trade["close_reason"] == "never_filled"
            or not has_number(evaluated) or not placed < evaluated < censor_at_ms
            or position is not None and position["state"] != "open"):
        return result | {"coverage_issue": "fill_unreconciled"}
    result["outcome"] = "filled"
    quote_arrived = terminal.get("quoteArrivedAtMs")
    result["quote_arrived_at_ms"] = quote_arrived
    if (not has_number(deadline) or deadline <= placed or not has_number(quote_arrived)
            or not placed < quote_arrived <= evaluated
            or trade["side"] not in ("buy", "sell")
            or terminal.get("quoteSide") != {"buy": "ask", "sell": "bid"}[trade["side"]]):
        return result
    if quote_arrived < deadline:
        return result | {"receipt_timing": "early", "trigger": "no"}
    result["receipt_timing"] = "at_or_after_deadline"
    if result["refusal"] == "recovered_across_deadline" and passes_rest_limit(trade, stamp):
        result["trigger"] = "yes"
    return result


def grade(receipts, snapshot):
    if receipts["version"] != 1 or snapshot["version"] != 1:
        raise ValueError("unsupported receipt or database snapshot format")
    for key in ("activation", "placements_until", "terminal_at"):
        if utc(receipts[key]) != utc(snapshot[key]):
            raise ValueError(f"database and receipt boundaries disagree: {key}")
    if sorted(snapshot["receipt_ids"]) != receipts["receipt_ids"]:
        raise ValueError("candidate export did not use the exact independent receipt IDs")
    lower, upper, terminal = (utc_ms(utc(receipts[key])) for key in ("activation", "placements_until", "terminal_at"))
    if utc_ms(utc(snapshot["captured_at"])) < terminal:
        raise ValueError("candidate export predates the terminal cut")

    issues = defaultdict(list)
    entries = {}
    known = receipts["receipts"]
    for trade_id, asset_class, reason in receipts["unplaced_receipts"]:
        issues[asset_class].append((trade_id, reason))
    trades = {trade["trade_id"]: trade for trade in snapshot["trades"]}
    positions = {position["position_id"]: position for position in snapshot["positions"]}
    for trade_id, receipt in known.items():
        if trade_id in receipts["ambiguous_receipts"]:
            issues[receipt[2]].append((trade_id, "conflicting_receipts"))
            continue
        entries[trade_id] = grade_trade(receipt, trades.get(trade_id), positions.get(receipt[0]), terminal)
    for trade_id, trade in trades.items():
        if trade_id in known:
            continue
        stamp = trade["placement"] or {}
        clock = stamp.get("makerPlacedAtMs")
        if (has_number(clock) and not lower <= clock < upper
                and (stamp.get("version"), stamp.get("tradeId"), stamp.get("mode"), stamp.get("assetClass"),
                     stamp.get("symbol")) == (1, trade_id, "paper", trade["asset_class"], trade["symbol"])
                and isinstance(stamp.get("positionId"), str) and stamp["positionId"]):
            continue
        issues[trade["asset_class"]].append((trade_id, "unreconciled_trade_candidate"))
    for position_id, position in positions.items():
        clock = position["placed_at_ms"]
        receipt = known.get(position["trade_id"])
        if receipt and receipt[0] == position_id:
            continue
        if has_number(clock) and not lower <= clock < upper:
            continue
        issues[position["asset_class"]].append((position_id, "unreconciled_position_candidate"))

    report = {}
    for asset_class in ASSET_CLASSES:
        by_class = {key: item for key, item in entries.items() if item["asset_class"] == asset_class}
        statuses = Counter(item["trigger"] for item in by_class.values())
        pending = issues[asset_class] + [(key, item["coverage_issue"]) for key, item in by_class.items()
                                         if "coverage_issue" in item]
        complete = bool(by_class) and not pending and not receipts["coverage_issues"] and not statuses["unknown"]
        verdict = "NO-RESULT" if not complete else "TRIGGER-OBSERVED" if statuses["yes"] else "NO-TRIGGER"
        report[asset_class] = {
            "verdict": verdict, "exact_placements": sum(r[2] == asset_class for r in known.values()),
            "examined": len(by_class), "coverage_issues": sorted(set(pending)),
            "receipt_timing": Counter(item["receipt_timing"] for item in by_class.values()),
            "refusal": Counter(item["refusal"] for item in by_class.values()),
            "outcome": Counter(item["outcome"] for item in by_class.values()),
            "confirmed_trigger_ids": sorted(key for key, item in by_class.items() if item["trigger"] == "yes"),
            "records": by_class,
        }
    return {"version": 1, "source_coverage_issues": receipts["coverage_issues"], "classes": report}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    capture = sub.add_parser("receipts")
    capture.add_argument("manifest", type=Path)
    capture.add_argument("logs", nargs="*", type=Path)
    grader = sub.add_parser("grade")
    grader.add_argument("receipts", type=Path)
    grader.add_argument("snapshot", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "receipts":
            output = capture_receipts(load_json(args.manifest), args.logs, args.manifest.parent)
        else:
            output = grade(load_json(args.receipts), load_json(args.snapshot))
    except (ValueError, OSError, TypeError, KeyError, AttributeError) as exc:
        parser.exit(2, f"#1073 required input could not be read: {exc}\n")
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
