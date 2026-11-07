"""
token-watch — copy named paths out of the store while holding the store's own periodic lock.
(B-TOKEN-WATCH-FOLLOWUP-MEMORY P1; called by tools/make_followup_scratch.sh, Langston Step 4 B-1.)

    TOKEN_WATCH_ROOT=/var/lib/token-watch python3 tools/locked_copy.py <dst> <rel path>...

Run as tokenwatch (it owns the store). It takes `store.periodic_lock(HOLDER, wait=True)` — the lock every locked job
takes (summary, feed-watch, tier, cold-offbox, follow-up) — so no job creates or removes a state file while `cp -a`
lists and opens it. Each path is copied with `cp -a` under nice 19 / ionice idle.

⛔ THE LOCK IS BEATEN FROM A THREAD EVERY BEAT_S SECONDS, NOT AFTER EACH PATH (Langston, Step 4 r2, BLOCKER-2).
   births alone is ~1.5 GB, copied at idle IO priority; a beat only between paths could leave the lock unbeaten for
   longer than `LOCK_STALE_AFTER` (30 min), another job would steal it, our next beat would then extend THE THIEF'S
   lock, and `periodic_lock`'s unconditional unlink on exit would delete it while the thief still runs.
⛔ SO EACH BEAT FIRST ASSERTS THE LOCK STILL CARRIES OUR HOLDER STRING AND PID. If it is gone or foreign, the copy is
   killed and the process exits 8 at once with os._exit — skipping `periodic_lock`'s finally, which would otherwise
   unlink a lock that is no longer ours. (Release-by-token in `store.periodic_lock` itself is P4 of this batch.)
Exit: 0 copied · 2 refused · 8 the lock was lost or taken mid-copy · 9 the lock was not free within 300 s.
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import store  # noqa: E402
from config import ROOT  # noqa: E402

HOLDER = "p1-scratch-copy"
BEAT_S = float(os.environ.get("LOCKED_COPY_BEAT_S", "60"))      # tests shorten it; production uses 60 s
NICE = ["nice", "-n", "19", "ionice", "-c3"] if os.environ.get("LOCKED_COPY_NO_NICE") != "1" else []
# TEST ONLY: a JSON argv used instead of `cp -a` (a slow copier lets a test change the lock mid-copy)
TEST_CMD = os.environ.get("LOCKED_COPY_TEST_CMD")


def _ours() -> bool:
    try:
        with open(store.LOCK_PATH, encoding="utf-8") as fh:
            return fh.read().startswith("%s %d " % (HOLDER, os.getpid()))
    except OSError:
        return False


def main(argv: list[str], copy_cmd=None) -> int:
    if len(argv) < 2:
        print("usage: locked_copy.py <dst> <rel path>...", file=sys.stderr)
        return 2
    dst, rels = argv[0], argv[1:]
    real_dst, real_root = os.path.realpath(dst), os.path.realpath(ROOT)
    if real_dst == real_root or os.path.commonpath([real_dst, real_root]) == real_root:
        print("REFUSED: %s is the store or inside it" % dst, file=sys.stderr)
        return 2
    with store.periodic_lock(HOLDER, wait=True) as held:
        if not held:
            print("REFUSED: could not take the store's periodic lock within 300 s", file=sys.stderr)
            return 9
        state = {"child": None, "lost": False}
        stop = threading.Event()

        def beat():
            while not stop.wait(BEAT_S):
                if not _ours():
                    state["lost"] = True
                    child = state["child"]
                    if child is not None and child.poll() is None:
                        child.kill()
                    print("ABORTED: the periodic lock is gone or not ours; nothing of ours is unlinked",
                          file=sys.stderr, flush=True)
                    os._exit(8)                     # skip periodic_lock's finally: it would unlink a foreign lock
                os.utime(store.LOCK_PATH)
        t = threading.Thread(target=beat, daemon=True)
        t.start()
        try:
            for rel in rels:
                cmd = copy_cmd or (__import__("json").loads(TEST_CMD) if TEST_CMD else NICE + ["cp", "-a"])
                state["child"] = subprocess.Popen(cmd + [os.path.join(ROOT, rel), os.path.join(dst, rel)])
                rc = state["child"].wait()
                if rc != 0:
                    print("FAILED: cp -a %s exited %d" % (rel, rc), file=sys.stderr)
                    return 1
        finally:
            stop.set()
    print("copied under the lock: %d paths" % len(rels))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
