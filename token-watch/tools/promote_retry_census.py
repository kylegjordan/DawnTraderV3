"""
token-watch — READ-ONLY census of the socials sweep's retry state (#1257), run once BEFORE the follow-up is switched on
and again 7 days after (Langston's conditions on the P10 ordering ruling, B-TOKEN-WATCH-FOLLOWUP-MEMORY 2026-11-15).

Prints one JSON object:
  checked_mints        distinct mints with at least one record in study/social-checks.jsonl
  stranded             mints in state/promote.json's `attempts` map whose births row lies wholly BEHIND that file's
                       saved cursor and whose last check record still reads `becomes: deferred` (#1257's population)
  stranded_rate_per_100k   stranded / checked_mints x 100,000 -- a PREDICTION from the pre-09-30 era, not a property
  post_final_mints     mints with at least one check record AFTER a record whose `becomes` was final (not deferred) --
                       the "182" of #1257; consistent with a re-read of consumed rows, NOT established as its cause
  attempts_map_size    len(state/promote.json attempts)
Nothing is written. Run as root or tokenwatch:  python3 tools/promote_retry_census.py [--root /var/lib/token-watch]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone


def census(root: str) -> dict:
    pr = json.load(open(os.path.join(root, "state", "promote.json"), encoding="utf-8"))
    attempts, cursors = pr.get("attempts") or {}, pr.get("cursors") or {}
    want = set(attempts)
    ends = {}
    births = os.path.join(root, "births")
    for name in sorted(os.listdir(births)):
        if not name.endswith(".jsonl"):
            continue
        pos = 0
        with open(os.path.join(births, name), "rb") as fh:
            for raw in fh:
                pos += len(raw)
                if not want or b'"mint"' not in raw:
                    continue
                try:
                    r = json.loads(raw)
                except ValueError:
                    continue
                m = r.get("mint") if isinstance(r, dict) else None
                if m in want and m not in ends:
                    ends[m] = (name, pos)
    last, final_seen, post_final, checked = {}, set(), set(), set()
    with open(os.path.join(root, "study", "social-checks.jsonl"), "rb") as fh:
        for raw in fh:
            try:
                r = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(r, dict) or not r.get("mint"):
                continue
            m = r["mint"]
            checked.add(m)
            if m in final_seen:
                post_final.add(m)
            if r.get("becomes") and r.get("becomes") != "deferred":
                final_seen.add(m)
            if m in want:
                last[m] = r.get("becomes")
    stranded = sorted(m for m in want
                      if m in ends and ends[m][1] <= cursors.get(ends[m][0], -1) and last.get(m) == "deferred")
    n = len(checked)
    return {"taken_at": datetime.now(timezone.utc).isoformat(), "promote_checked_at": pr.get("checked_at"),
            "checked_mints": n, "attempts_map_size": len(attempts), "stranded": len(stranded),
            "stranded_rate_per_100k": round(len(stranded) / n * 100000, 3) if n else None,
            "post_final_mints": len(post_final), "stranded_mints": stranded}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.environ.get("TOKEN_WATCH_ROOT", "/var/lib/token-watch"))
    a = ap.parse_args(argv)
    print(json.dumps(census(a.root), indent=1, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
