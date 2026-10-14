#!/usr/bin/env python3
"""Seal raw Windows process and server-journal captures into verifier input."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path


def read_json_lines(path: Path) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"{path.name}:{number}: row is not an object")
        rows.append(value)
    return rows


def parse_utc(value: object) -> dt.datetime:
    if not isinstance(value, str):
        raise ValueError("capture timestamp is not a string")
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("capture timestamp has no UTC offset")
    return parsed


def journal_time(row: dict[str, object]) -> dt.datetime:
    return dt.datetime.fromtimestamp(
        int(str(row["__REALTIME_TIMESTAMP"])) / 1_000_000,
        tz=dt.timezone.utc,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--capture-dir", required=True, type=Path)
    parser.add_argument("--expected-fingerprint", required=True)
    parser.add_argument("--journal", default="server-journal.jsonl")
    parser.add_argument("--output", default="evidence.json")
    args = parser.parse_args()

    root = args.capture_dir.resolve(strict=True)
    manifest_path = root / "capture-manifest.json"
    process_path = root / "process-events.jsonl"
    journal_path = root / Path(args.journal).name
    output_path = root / Path(args.output).name
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    if manifest.get("schema") != "dt-caller-process-capture-v1":
        raise ValueError("capture manifest schema differs")
    process_rows = read_json_lines(process_path)
    journal_rows = read_json_lines(journal_path)
    if any(
        row.get("processName") in {"ssh.exe", "scp.exe", "sftp.exe"} and not row.get("image")
        for row in process_rows
    ):
        raise ValueError("a process start could not be bound to an executable image")

    sealed_rows: list[dict[str, object]] = []
    for source in manifest.get("rows", []):
        if not isinstance(source, dict):
            raise ValueError("capture manifest row is not an object")
        start = parse_utc(source.get("startedAtUtc"))
        end = parse_utc(source.get("endedAtUtc"))
        cursors: list[str] = []
        for journal in journal_rows:
            message = journal.get("MESSAGE")
            cursor = journal.get("__CURSOR")
            if (
                isinstance(message, str)
                and isinstance(cursor, str)
                and "Accepted publickey" in message
                and args.expected_fingerprint in message
                and start <= journal_time(journal) <= end
            ):
                cursors.append(cursor)
        if not cursors:
            raise ValueError(f"{source.get('name')}: no accepted expected-fingerprint journal row in capture window")
        sealed_rows.append({
            "name": source.get("name"),
            "result": source.get("result"),
            "startedAtUtc": source.get("startedAtUtc"),
            "endedAtUtc": source.get("endedAtUtc"),
            "negativeStartedAtUtc": source.get("negativeStartedAtUtc"),
            "negativeEndedAtUtc": source.get("negativeEndedAtUtc"),
            "entryProcessId": source.get("entryProcessId"),
            "processEventIds": source.get("processEventIds"),
            "serverJournalCursors": sorted(set(cursors)),
        })

    bundle = {
        "schema": "dt-caller-capture-v1",
        "captureId": manifest.get("captureId"),
        "processEventsFile": process_path.name,
        "processEventsSha256": hashlib.sha256(process_path.read_bytes()).hexdigest(),
        "serverJournalFile": journal_path.name,
        "serverJournalSha256": hashlib.sha256(journal_path.read_bytes()).hexdigest(),
        "rows": sealed_rows,
    }
    output_path.write_text(json.dumps(bundle, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"CALLER_EVIDENCE_SEALED output={output_path} rows={len(sealed_rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
