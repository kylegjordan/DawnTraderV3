"""
token-watch — B-TOKEN-WATCH-FOLLOWUP-MEMORY P6: OBJ-4b(c)'s fence (a grid point already past is a MISS ROW and is
written to NO bucket; a point still due this hour lands in the NEXT bucket) and OBJ-4b(d) (the summary timer builds
only under the periodic lock, so summary.json has one writer at a time).

Run:  python tests/test_p6_fence_and_writer.py        (exit 0 = every check passed)
"""

import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-p6-", dir=os.path.expanduser("~"))
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import store  # noqa: E402
import summary  # noqa: E402
from config import DUE_DIR, GRID, GRID_LABELS  # noqa: E402

UTC = timezone.utc
PASS = FAIL = 0
NL = chr(10)


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok   %s" % label)
    else:
        FAIL += 1
        print("  FAIL %s%s" % (label, (" :: %s" % (detail,)) if detail else ""))


def due_entries():
    out = []
    if os.path.isdir(DUE_DIR):
        for dp, _dn, files in os.walk(DUE_DIR):
            for n in files:
                for raw in open(os.path.join(dp, n), encoding="utf-8"):
                    if raw.strip():
                        out.append((os.path.relpath(os.path.join(dp, n), DUE_DIR), json.loads(raw)))
    return out


store.ensure_dirs()
NOW = datetime(2026, 11, 30, 12, 20, tzinfo=UTC)
_real_now = store._now
store._now = lambda: NOW

print(NL + "=== F1. A GRID POINT ALREADY PAST IS A MISS ROW AND IS WRITTEN TO NO BUCKET (OBJ-4b(c))")
created = NOW - timedelta(hours=3)                      # 1h is past; 6h and later are future
store.schedule_grid("PAST1", created)
misses = [r for r in store._read(store.observation_path(NOW)) if r.get("mint") == "PAST1"]
due = [e for _p, e in due_entries() if e.get("mint") == "PAST1"]
check("F1 the 1h point is a miss row, observed False, reason scheduled_in_the_past",
      [m["age"] for m in misses] == ["1h"] and misses[0].get("observed") is False
      and misses[0].get("reason") == "scheduled_in_the_past", misses)
check("F1 and NO bucket holds a 1h entry for it", not any(e.get("age") == "1h" for e in due), due)
check("F1 POSITIVE CONTROL: every future point IS scheduled", sorted(e["age"] for e in due) == sorted(
    GRID_LABELS[1:]), sorted(e["age"] for e in due))

print(NL + "=== F2. A POINT STILL DUE THIS HOUR LANDS IN THE NEXT BUCKET, NEVER THE CURRENT ONE")
created2 = NOW - GRID[0] + timedelta(minutes=10)         # its 1h point is due at 12:30, inside the 12:00 hour
store.schedule_grid("SAME1", created2)
same = [(p, e) for p, e in due_entries() if e.get("mint") == "SAME1" and e.get("age") == "1h"]
check("F2 the 1h entry is in the 13:00 bucket", len(same) == 1
      and os.path.normpath(store.due_path(NOW + timedelta(hours=1))).endswith(os.path.normpath(same[0][0])), same)
store._now = _real_now

print(NL + "=== W1. THE SUMMARY TIMER SKIPS WHILE ANOTHER JOB HOLDS THE LOCK, AND BUILDS WHEN IT IS FREE (OBJ-4b(d))")
calls = []
_real_build = summary.build
summary.build = lambda now=None: (calls.append(now), {"ok": True})[1]
try:
    with store.periodic_lock("follow_up") as held:
        r_locked = summary.main()
    builds_while_locked = len(calls)
    r_free = summary.main()
finally:
    summary.build = _real_build
check("W1 with the lock held elsewhere, main() does not build and says it skipped",
      bool(held) and r_locked is None and builds_while_locked == 0, (r_locked, builds_while_locked))
check("W1 POSITIVE CONTROL: with the lock free, main() builds", r_free == {"ok": True} and len(calls) == 1,
      (r_free, calls))
check("W1 and it releases the lock after building", not os.path.exists(store.LOCK_PATH))

print(NL + "=== W2. THE SUMMARY HOLDS THE LOCK WHILE IT BUILDS (a follow-up starting meanwhile is refused)")
seen = {}


def probe_build(now=None):
    with store.periodic_lock("follow_up") as other:
        seen["other"] = other
    return {"ok": True}


summary.build = probe_build
try:
    summary.main()
finally:
    summary.build = _real_build
check("W2 a second job is refused while the summary builds", seen.get("other") is False, seen)

shutil.rmtree(ROOT, ignore_errors=True)
print(NL + "%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
