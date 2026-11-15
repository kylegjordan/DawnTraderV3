"""
token-watch — ONE RECORDED STEP: move the follow-up cursor past the backlog, ONLY after its census exists.
(B-TOKEN-WATCH-FOLLOWUP-MEMORY P8(5), OBJ-3: "census first, cursor second".)

Sets `follow_up_cursor.last_bucket` to the census hour, leaving `consumed_from` unchanged, in one `save_state`
under the periodic lock. Moving the cursor ends the backlog for the follow-up (it would otherwise walk ~850 buckets
at 48 an hour) and arms the due prune for those buckets, which is why it REFUSES unless:
  * `--census-sha256` matches the census artifact for (the CURRENT cursor, --census-hour) — found in `cold/`, or,
    once the nightly off-box run has moved it, in the off-box manifest by name and sha256;
  * the cursor has not moved since that census (its `last_bucket` is still the census's cursor);
  * the census hour is after the cursor.
Without --apply it prints the before/after and writes nothing.
Run as tokenwatch:  python3 tools/move_followup_cursor.py --census-hour YYYY-MM-DDTHH --census-sha256 <hex> [--apply]
Exit: 0 moved (or dry run) · 2 refused.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import COLD_DIR, ROOT, STATE_DIR  # noqa: E402
from store import load_state, periodic_lock, save_state  # noqa: E402
from backlog_census import artifact_name  # noqa: E402

UTC = timezone.utc
CURSOR = "follow_up_cursor"
MANIFEST_PATH = os.path.join(ROOT, "offbox", "cold-offbox-manifest.jsonl")   # = cold_offbox.MANIFEST_PATH
# ⛔ THE DURABLE ON-BOX RECORD OF THE SKIP (Langston, P8 Step 4): after the move, tier reads every bucket in
#    [consumed_from, last_bucket] as read, and anything added to the cursor state is ERASED by the next follow-up run
#    (`_advance_cursor` rebuilds it with last_bucket + consumed_from only). So each move APPENDS one line here - the
#    range it skipped and the census that covers it - in a file nothing rewrites. The census artifact (in B2 and the
#    off-box manifest) and the batch record carry the same facts.
MOVES_PATH = os.path.join(STATE_DIR, "followup-cursor-moves.jsonl")


def artifact_sha_ok(name: str, sha: str, cold_dir: str = COLD_DIR, manifest: str = MANIFEST_PATH) -> str | None:
    """Where the named sha256 was confirmed ('cold' or 'manifest'), or None."""
    local = os.path.join(cold_dir, name)
    if os.path.exists(local):
        h = hashlib.sha256()
        with open(local, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        return "cold" if h.hexdigest() == sha else None
    if os.path.exists(manifest):
        with open(manifest, encoding="utf-8") as fh:
            for raw in fh:
                try:
                    r = json.loads(raw)
                except ValueError:
                    continue
                if isinstance(r, dict) and r.get("name") == name and r.get("sha256") == sha:
                    return "manifest"
    return None


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--census-hour", required=True)
    ap.add_argument("--census-sha256", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args(argv)
    with periodic_lock("move-followup-cursor") as held:
        if not held:
            print("REFUSED: another periodic job holds the lock", file=sys.stderr)
            return 2
        cur = load_state(CURSOR, {})
        last = cur.get("last_bucket")
        if not last:
            print("REFUSED: the cursor has no last_bucket", file=sys.stderr)
            return 2
        if a.census_hour <= last:
            print("REFUSED: the census hour %s is not after the cursor %s" % (a.census_hour, last), file=sys.stderr)
            return 2
        name = artifact_name(last, a.census_hour)
        where = artifact_sha_ok(name, a.census_sha256)
        if where is None:
            print("REFUSED: no census artifact %s with sha256 %s (in cold/ or the off-box manifest) for the CURRENT "
                  "cursor %s - census first, cursor second" % (name, a.census_sha256, last), file=sys.stderr)
            return 2
        new = dict(cur, last_bucket=a.census_hour)
        print("census %s confirmed in %s" % (name, where))
        print("cursor before: %s" % json.dumps(cur, sort_keys=True))
        print("cursor after:  %s" % json.dumps(new, sort_keys=True))
        if not a.apply:
            print("DRY RUN: nothing written (pass --apply)")
            return 0
        # APPENDED FIRST (Langston, P8 re-roll N3): if the append fails nothing has moved; if the save fails after
        # it, the record over-claims a move that did not happen - the safe direction, since tier reads the CURSOR,
        # and a cursor that did not move arms no prune. The reverse order could move the cursor with no record.
        rec = {"moved_at": datetime.now(UTC).isoformat(), "skipped_after": last, "skipped_through": a.census_hour,
               "census_artifact": name, "census_sha256": a.census_sha256, "confirmed_in": where,
               "consumed_from": cur.get("consumed_from")}
        os.makedirs(os.path.dirname(MOVES_PATH), exist_ok=True)
        with open(MOVES_PATH, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, sort_keys=True) + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        save_state(CURSOR, new)
        print("WRITTEN at %s: %s" % (datetime.now(UTC).isoformat(), json.dumps(load_state(CURSOR, {}), sort_keys=True)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
