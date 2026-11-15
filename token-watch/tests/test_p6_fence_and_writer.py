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

import subprocess  # noqa: E402
import tier  # noqa: E402

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run_main(script, held_by="tier 4242 cafe 2026-11-15T00:00:00"):
    """Run a job's __main__ as the timer would, with ANOTHER job holding a fresh periodic lock."""
    with open(store.LOCK_PATH, "w", encoding="utf-8") as fh:
        fh.write(held_by + NL)
    try:
        r = subprocess.run([sys.executable, os.path.join(HERE, script)], capture_output=True, text=True,
                           env=dict(os.environ, TOKEN_WATCH_ROOT=ROOT), timeout=120)
    finally:
        os.remove(store.LOCK_PATH)
    return r


def publish(age):
    os.makedirs(os.path.dirname(summary.SUMMARY_PATH), exist_ok=True)
    with open(summary.SUMMARY_PATH, "w", encoding="utf-8") as fh:
        json.dump({"generated_at": (datetime.now(UTC) - age).isoformat()}, fh)


print(NL + "=== X1. A SKIPPED SUMMARY RUN DOES NOT READ AS A PUBLISH: exit 75 when the published file is stale or missing"
      " (Langston, P6 Step 4 CHANGES-1)")
try:
    os.remove(summary.SUMMARY_PATH)
except FileNotFoundError:
    pass
r_missing = run_main("summary.py")
publish(timedelta(hours=3))
r_stale = run_main("summary.py")
publish(timedelta(minutes=20))
r_fresh = run_main("summary.py")
check("X1 no published file -> exit 75", r_missing.returncode == 75, (r_missing.returncode, r_missing.stderr[-200:]))
check("X1 published 3 h ago -> exit 75", r_stale.returncode == 75, (r_stale.returncode, r_stale.stderr[-200:]))
check("X1 POSITIVE CONTROL: published 20 min ago (the follow-up holding the lock publishes) -> exit 0",
      r_fresh.returncode == 0, (r_fresh.returncode, r_fresh.stderr[-200:]))
check("X1 the log names WHO held the lock", "held by: tier 4242" in r_stale.stderr, r_stale.stderr[-300:])

print(NL + "=== X2. A SKIPPED TIER RUN DOES NOT READ AS A COMPLETION: exit 75 when no run completed in 26 h")
try:
    os.remove(store.state_path(tier.TIER_STATE))
except FileNotFoundError:
    pass
r_none = run_main("tier.py", held_by="follow_up 77 beef 2026-11-15T00:00:00")
store.save_state(tier.TIER_STATE, {"completed_at": (datetime.now(UTC) - timedelta(hours=27)).isoformat()})
r_old = run_main("tier.py", held_by="follow_up 77 beef 2026-11-15T00:00:00")
store.save_state(tier.TIER_STATE, {"completed_at": (datetime.now(UTC) - timedelta(hours=2)).isoformat()})
r_recent = run_main("tier.py", held_by="follow_up 77 beef 2026-11-15T00:00:00")
check("X2 no completion on record -> exit 75", r_none.returncode == 75, (r_none.returncode, r_none.stderr[-200:]))
check("X2 last completion 27 h ago -> exit 75", r_old.returncode == 75, (r_old.returncode, r_old.stderr[-200:]))
check("X2 POSITIVE CONTROL: completed 2 h ago -> exit 0", r_recent.returncode == 0,
      (r_recent.returncode, r_recent.stderr[-200:]))
check("X2 the log names WHO held the lock", "held by: follow_up 77" in r_old.stderr, r_old.stderr[-300:])
os.remove(store.state_path(tier.TIER_STATE))
tier.run(datetime.now(UTC))
check("X2 a completed tier run records itself", bool(store.load_state(tier.TIER_STATE, {}).get("completed_at")))

shutil.rmtree(ROOT, ignore_errors=True)
print(NL + "%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
