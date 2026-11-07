"""
token-watch — copy named paths out of the store while holding the store's own periodic lock.
(B-TOKEN-WATCH-FOLLOWUP-MEMORY P1; called by tools/make_followup_scratch.sh, Langston Step 4 B-1.)

    TOKEN_WATCH_ROOT=/var/lib/token-watch python3 tools/locked_copy.py <dst> <rel path>...

Run as tokenwatch (it owns the store). It takes `store.periodic_lock("p1-scratch-copy", wait=True)` — the lock every
locked job takes (summary, feed-watch, tier, cold-offbox, follow-up) — so no job creates or removes a state file
while `cp -a` lists and opens it. It copies each path with `cp -a` under nice 19 / ionice idle, beating the lock
(utime) after each so a long copy is never stolen as stale (`LOCK_STALE_AFTER`). The source is config.ROOT; the
destination must be outside it. Exit: 0 copied · 2 refused · 9 the lock was not free within 300 s.
"""

from __future__ import annotations

import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import store  # noqa: E402
from config import ROOT  # noqa: E402


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: locked_copy.py <dst> <rel path>...", file=sys.stderr)
        return 2
    dst, rels = argv[0], argv[1:]
    real_dst, real_root = os.path.realpath(dst), os.path.realpath(ROOT)
    if real_dst == real_root or os.path.commonpath([real_dst, real_root]) == real_root:
        print("REFUSED: %s is the store or inside it" % dst, file=sys.stderr)
        return 2
    with store.periodic_lock("p1-scratch-copy", wait=True) as held:
        if not held:
            print("REFUSED: could not take the store's periodic lock within 300 s", file=sys.stderr)
            return 9
        for rel in rels:
            subprocess.run(["nice", "-n", "19", "ionice", "-c3", "cp", "-a",
                            os.path.join(ROOT, rel), os.path.join(dst, rel)], check=True)
            os.utime(store.LOCK_PATH)
    print("copied under the lock: %d paths" % len(rels))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
