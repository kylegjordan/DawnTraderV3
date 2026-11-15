"""
token-watch — ONE-TIME, before the follow-up timer returns: fold every closed month's spend-journal tail.
(B-TOKEN-WATCH-FOLLOWUP-MEMORY P9, OBJ-7.)

The follow-up was off from 2026-09-30, so nothing folded September's tail (6,930,128 B after the last fold,
pre-audit A8) or any of October. `budget.fold_pending` now drains every closed month itself
(`_drain_closed_months`), but it only runs inside the follow-up; this runs the same drain once, under the
store's periodic lock, so `tier_closed_journals` can move the fully-folded journals to cold before P10.

⛔ SPEND IS ARCHIVED (state/closed_months.json), NEVER CHARGED TO THE CURRENT MONTH; inclusion tallies are
   folded into their days. Both are `budget._drain_month`'s rules, not this tool's.
Without --apply it lists each closed journal with its size and cursor and writes nothing.
Run as tokenwatch:  python3 tools/drain_closed_journals.py [--apply]
Exit: 0 done (or dry run) · 2 another periodic job holds the lock.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import budget  # noqa: E402
from store import load_state, periodic_lock  # noqa: E402

UTC = timezone.utc


def main(argv: list[str]) -> int:
    apply = "--apply" in argv
    now = datetime.now(UTC)
    with periodic_lock("drain-closed-journals") as held:
        if not held:
            print("REFUSED: another periodic job holds the lock", file=sys.stderr)
            return 2
        cursors = load_state("journal_cursors", {})
        before = {}
        for key in budget.closed_journal_months(now):
            path = os.path.join(budget.STATE_DIR, "%s%s%s" % (budget.JOURNAL_PREFIX, key, budget.JOURNAL_SUFFIX))
            before[key] = {"bytes": os.path.getsize(path), "cursor": cursors.get(key, 0)}
        print("closed journals: %s" % json.dumps(before, sort_keys=True))
        if not apply:
            print("DRY RUN: nothing written (pass --apply)")
            return 0
        out = budget._drain_closed_months(now)
        print("drained: %s" % json.dumps(out, sort_keys=True))
        print("cursors after: %s" % json.dumps(load_state("journal_cursors", {}), sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
