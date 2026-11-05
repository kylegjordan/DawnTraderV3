"""
token-watch — ONE-TIME: write `consumed_from` into the live follow-up cursor. (B-TOKEN-WATCH-STORAGE amendment 1, P4)

The cursor predates the field. `tier.classify_due_buckets` removes nothing
before `consumed_from`, so until it is set the due prune removes nothing at
all — safe, and the reason this has to be set exactly once, correctly.

⛔ THE VALUE IS DERIVED HERE, AT RUN TIME, AND MUST AGREE WITH THE COMMITTED
   LITERAL. The follow-up job's first-ever run read only its own hour
   (`follow_up._buckets_to_read`: no cursor → this hour), so the first hour it
   read is the hour of the earliest observation IT wrote. `observations/` has
   TWO producers (pre-audit A4, Langston r2): the follow-up job and the
   scheduler's miss row (`store.py:324-326`, `reason == "scheduled_in_the_past"`,
   stamped with the receiver's clock). The miss rows are EXCLUDED: a minimum
   over both could date the first read too early and let the prune delete
   buckets that were never read. A too-LATE value only keeps buckets longer.
⚠️ HONEST LIMIT (Langston): the agreement check catches drift and transcription,
   not a shared method error — the derivation and the literal came from the
   same predicate. The residual is one-directional, as above — ⛔ BUT ONLY IF
   THE CURSOR'S LINEAGE IS UNBROKEN back to the value (Langston, Step-4 part 1).
   UNEVIDENCED PREMISE: if the cursor was ever lost and restarted between
   2026-08-31 and 2026-09-30, the first lineage's start sits before a gap of
   never-read hours, and those hours fall inside [consumed_from, last_bucket].
   ⇒ Before the first real prune, `tools/due_census.py --lineage` checks every
   REMOVABLE bucket for evidence it was read; a bucket with none is a gap and
   the prune must not run until it is explained.

REFUSES (exit 2, nothing written) if: the cursor file is missing; it already
has `consumed_from`; its `last_bucket` is before the value; the derivation
disagrees with the literal; or no follow-up observation is found.
Run as tokenwatch, under the periodic lock:  python3 tools/backfill_consumed_from.py [--apply]
Without --apply it derives, checks and prints, and writes nothing.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import OBSERVATIONS_DIR, STATE_DIR  # noqa: E402
from store import load_state, periodic_lock, save_state  # noqa: E402

UTC = timezone.utc
LITERAL = "2026-08-31T11"          # pre-audit A4, measured 2026-11-05
MISS_REASON = "scheduled_in_the_past"
CURSOR = "follow_up_cursor"


def derive(obs_dir: str = OBSERVATIONS_DIR) -> dict:
    """Minimum `observed_at` in the FIRST observations file: over all rows, and over follow-up rows only."""
    names = sorted(n for n in os.listdir(obs_dir) if n.endswith(".jsonl"))
    if not names:
        return {"error": "no observations file in %s" % obs_dir}
    path = os.path.join(obs_dir, names[0])
    all_min = fu_min = None
    rows = fu_rows = bad = 0
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            try:
                rec = json.loads(line)
                ts = datetime.fromisoformat(rec["observed_at"])
            except (ValueError, KeyError, TypeError):
                bad += 1
                continue
            rows += 1
            all_min = ts if all_min is None or ts < all_min else all_min
            if rec.get("reason") != MISS_REASON:
                fu_rows += 1
                fu_min = ts if fu_min is None or ts < fu_min else fu_min
    return {"file": path, "rows": rows, "follow_up_rows": fu_rows, "miss_rows": rows - fu_rows,
            "unparsed_lines": bad,
            "min_observed_at_all": all_min.isoformat() if all_min else None,
            "min_observed_at_follow_up": fu_min.isoformat() if fu_min else None,
            "derived_hour": fu_min.astimezone(UTC).strftime("%Y-%m-%dT%H") if fu_min else None}


def main(argv: list[str]) -> int:
    apply = argv[1:] == ["--apply"]
    if argv[1:] not in ([], ["--apply"]):
        print("usage: backfill_consumed_from.py [--apply]", file=sys.stderr)
        return 2
    d = derive()
    d["literal"] = LITERAL
    print(json.dumps(d, indent=2, sort_keys=True))
    if d.get("error") or not d.get("derived_hour"):
        print("REFUSED: no follow-up observation to derive from", file=sys.stderr)
        return 2
    if d["derived_hour"] != LITERAL:
        print("REFUSED: derived %s disagrees with the committed literal %s" % (d["derived_hour"], LITERAL),
              file=sys.stderr)
        return 2
    with periodic_lock("backfill-consumed-from") as held:
        if not held:
            print("REFUSED: another periodic job holds the lock", file=sys.stderr)
            return 2
        path = os.path.join(STATE_DIR, CURSOR + ".json")
        if not os.path.exists(path):
            print("REFUSED: no cursor file at %s" % path, file=sys.stderr)
            return 2
        cur = load_state(CURSOR, {})
        if "consumed_from" in cur:
            print("REFUSED: the cursor already has consumed_from=%r" % cur["consumed_from"], file=sys.stderr)
            return 2
        if not cur.get("last_bucket") or cur["last_bucket"] < LITERAL:
            print("REFUSED: last_bucket %r is before %s" % (cur.get("last_bucket"), LITERAL), file=sys.stderr)
            return 2
        new = dict(cur, consumed_from=LITERAL)
        print("cursor before: %s" % json.dumps(cur, sort_keys=True))
        print("cursor after:  %s" % json.dumps(new, sort_keys=True))
        if not apply:
            print("DRY RUN: nothing written (pass --apply)")
            return 0
        save_state(CURSOR, new)
        print("WRITTEN: %s" % json.dumps(load_state(CURSOR, {}), sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
