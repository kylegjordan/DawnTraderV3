"""
token-watch — READ-ONLY census of the follow-up backlog, BEFORE the cursor moves. (B-TOKEN-WATCH-FOLLOWUP-MEMORY P8(1),
OBJ-3; Langston r1c: "census first, cursor second".)

The follow-up has been off since 2026-09-30; every `due/` bucket after its cursor is a scheduled observation that
never happened. Dropping them would throw the same data away twice (OBJ-5's 30d/90d checkpoints have no observations,
and these buckets are exactly that cohort), and moving the cursor arms the due prune, which then removes them unread.
So before the cursor moves, every entry in (cursor, census hour] is written to its own artifact.

WHAT IT WRITES, under `periodic_lock("backlog-census")`, reading the `due/` buckets and nothing else:
  * `cold/followup-backlog-census-<cursor>-<censushour>.jsonl.gz` — one row per entry: bucket, mint, age label,
    due_at, created_at, age_now_s (seconds from created_at to the census time). Written to a `.tmp`, re-read and
    counted, then renamed; an existing artifact of that name is never overwritten. The nightly off-box run takes it
    to B2 and records it in the manifest (it is a `cold/*.gz`).
  * a small summary JSON (stdout, and `--summary <path>`): cursor, census hour, buckets read, rows, rows by age
    label, unreadable lines, the artifact's bytes and sha256. That summary is what goes in the batch record — the
    sha256 is what `tools/move_followup_cursor.py` must be given.
⛔ The census hour is NAMED, never inferred: it must be after the cursor and no later than the current hour.
⛔ An unreadable line is COUNTED in the summary, never silently dropped and never fatal.
Run as tokenwatch:  python3 tools/backlog_census.py --census-hour YYYY-MM-DDTHH [--summary <path>]
Exit: 0 written · 2 refused (lock held, bad census hour, artifact exists, no cursor).
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import COLD_DIR  # noqa: E402
from store import due_path, load_state, lock_beat, periodic_lock  # noqa: E402

UTC = timezone.utc
HOUR_FMT = "%Y-%m-%dT%H"
CURSOR = "follow_up_cursor"


def artifact_name(cursor: str, census_hour: str) -> str:
    return "followup-backlog-census-%s-%s.jsonl.gz" % (cursor, census_hour)


def _hour(v: str) -> datetime:
    return datetime.strptime(v, HOUR_FMT).replace(tzinfo=UTC)


def census(cursor: str, census_hour: str, now: datetime, out_path: str) -> dict:
    """Write the artifact for buckets in (cursor, census_hour]; return the summary (without the file hash)."""
    rows, bad, buckets_read, missing = 0, 0, 0, 0
    by_age = {}
    payload = hashlib.sha256()                  # the UNCOMPRESSED lines as written, compared on the re-read
    h, end = _hour(cursor) + timedelta(hours=1), _hour(census_hour)
    with gzip.open(out_path, "wt", encoding="utf-8") as out:
        while h <= end:
            lock_beat()
            path = due_path(h)
            bucket = h.strftime(HOUR_FMT)
            if not os.path.exists(path):
                missing += 1
                h += timedelta(hours=1)
                continue
            buckets_read += 1
            with open(path, encoding="utf-8") as fh:
                for raw in fh:
                    if not raw.strip():
                        continue
                    try:
                        e = json.loads(raw)
                        mint, age = e["mint"], e["age"]
                    except (ValueError, KeyError, TypeError):
                        bad += 1
                        continue
                    created = e.get("created_at")
                    try:
                        age_now = round((now - datetime.fromisoformat(created)).total_seconds(), 1) if created else None
                    except (ValueError, TypeError):
                        age_now = None
                    line = json.dumps({"bucket": bucket, "mint": mint, "age": age, "due_at": e.get("due_at"),
                                       "created_at": created, "age_now_s": age_now}, sort_keys=True) + "\n"
                    out.write(line)
                    payload.update(line.encode("utf-8"))
                    rows += 1
                    by_age[age] = by_age.get(age, 0) + 1
            h += timedelta(hours=1)
    return {"cursor": cursor, "census_hour": census_hour, "census_at": now.isoformat(), "buckets_read": buckets_read,
            "buckets_absent": missing, "rows": rows, "rows_by_age": dict(sorted(by_age.items())),
            "unreadable_lines": bad, "payload_sha256": payload.hexdigest()}


def main(argv: list[str], now: datetime | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--census-hour", required=True)
    ap.add_argument("--summary")
    a = ap.parse_args(argv)
    now = now or datetime.now(UTC)
    try:
        end = _hour(a.census_hour)
    except ValueError:
        print("REFUSED: --census-hour must be YYYY-MM-DDTHH", file=sys.stderr)
        return 2
    if end > now.replace(minute=0, second=0, microsecond=0):
        print("REFUSED: the census hour %s is after the current hour" % a.census_hour, file=sys.stderr)
        return 2
    with periodic_lock("backlog-census") as held:
        if not held:
            print("REFUSED: another periodic job holds the lock", file=sys.stderr)
            return 2
        cursor = load_state(CURSOR, {}).get("last_bucket")
        if not cursor:
            print("REFUSED: the follow-up cursor has no last_bucket", file=sys.stderr)
            return 2
        if end <= _hour(cursor):
            print("REFUSED: the census hour %s is not after the cursor %s" % (a.census_hour, cursor), file=sys.stderr)
            return 2
        os.makedirs(COLD_DIR, exist_ok=True)
        dst = os.path.join(COLD_DIR, artifact_name(cursor, a.census_hour))
        if os.path.exists(dst):
            print("REFUSED: %s already exists; it is never overwritten" % dst, file=sys.stderr)
            return 2
        summary = census(cursor, a.census_hour, now, dst + ".tmp")
        # re-read the written artifact: its row count AND the sha256 of its uncompressed lines must equal what was
        # written (a content check, not only a truncation check - Langston, P8 Step 4), and its file hash is the
        # summary's
        n, h, back = 0, hashlib.sha256(), hashlib.sha256()
        with gzip.open(dst + ".tmp", "rt", encoding="utf-8") as fh:
            for line in fh:
                n += 1
                back.update(line.encode("utf-8"))
        with open(dst + ".tmp", "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        if n != summary["rows"] or back.hexdigest() != summary["payload_sha256"]:
            os.unlink(dst + ".tmp")
            print("REFUSED: the artifact re-read %d rows (content %s), %d were written (content %s); nothing kept"
                  % (n, back.hexdigest()[:12], summary["rows"], summary["payload_sha256"][:12]), file=sys.stderr)
            return 2
        os.replace(dst + ".tmp", dst)
        summary.update({"artifact": os.path.basename(dst), "artifact_bytes": os.path.getsize(dst),
                        "artifact_sha256": h.hexdigest()})
    text = json.dumps(summary, indent=2, sort_keys=True)
    print(text)                                 # FIRST: an unwritable --summary must not lose the sha (Langston nit)
    if a.summary:
        with open(a.summary, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
