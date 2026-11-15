"""
token-watch — B-TOKEN-WATCH-FOLLOWUP-MEMORY P4 (OBJ-4b(a)): the periodic lock's heartbeat, its logged stale-only steal,
and its release by token; and the three places that beat it (the follow-up per bucket and every 500 entries, promote
every 500 rows, tier per source).

Run:  python tests/test_p4_lock.py        (exit 0 = every check passed)
"""

import json
import logging
import os
import shutil
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-p4-", dir=os.path.expanduser("~"))
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import store  # noqa: E402
import follow_up  # noqa: E402
import promote  # noqa: E402
import tier  # noqa: E402
from config import BIRTHS_DIR  # noqa: E402

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


class Capture(logging.Handler):
    def __init__(self):
        super().__init__()
        self.lines = []

    def emit(self, record):
        self.lines.append(record.getMessage())


cap = Capture()
logging.getLogger("token-watch.store").addHandler(cap)
logging.getLogger("token-watch.store").setLevel(logging.INFO)


def lock_text():
    try:
        return open(store.LOCK_PATH, encoding="utf-8").read()
    except FileNotFoundError:
        return None


def age_lock(minutes):
    t = time.time() - minutes * 60
    os.utime(store.LOCK_PATH, (t, t))


store.ensure_dirs()

print(NL + "=== L1. THE LOCK LINE CARRIES A TOKEN; A HELD LOCK IS TRUTHY; RELEASE REMOVES OUR OWN LOCK")
with store.periodic_lock("job_a") as held:
    line = lock_text() or ""
    check("L1 held is truthy and carries beat()", bool(held) and hasattr(held, "beat"))
    check("L1 the line is holder, pid, token, time", line.split()[:3] == ["job_a", str(os.getpid()), held.token], line)
check("L1 our own lock is removed on exit", lock_text() is None)

print(NL + "=== L2. RELEASE IS BY TOKEN: A LOCK THAT IS NO LONGER OURS IS LEFT IN PLACE, AND THAT IS LOGGED")
cap.lines.clear()
with store.periodic_lock("job_a") as held:
    with open(store.LOCK_PATH, "w", encoding="utf-8") as fh:
        fh.write("thief 999 deadbeef 2026-11-15T00:00:00\n")       # someone stole it while we ran
check("L2 the foreign lock survives our exit", (lock_text() or "").startswith("thief 999 deadbeef"), lock_text())
check("L2 and the non-release is logged", any("NOT released" in x for x in cap.lines), cap.lines)
os.remove(store.LOCK_PATH)

print(NL + "=== L3. beat() REFRESHES ONLY OUR OWN LOCK")
with store.periodic_lock("job_a") as held:
    age_lock(10)
    before = os.path.getmtime(store.LOCK_PATH)
    ok = held.beat()
    after = os.path.getmtime(store.LOCK_PATH)
    check("L3 a beat on our lock refreshes its mtime", ok is True and after > before + 300, (ok, before, after))
    check("L3 the module-level lock_beat() reaches the same holder", store.lock_beat() is True)
    with open(store.LOCK_PATH, "w", encoding="utf-8") as fh:
        fh.write("thief 999 deadbeef now\n")
    age_lock(10)
    before = os.path.getmtime(store.LOCK_PATH)
    ok = held.beat()
    check("L3 a beat on a lock that is no longer ours touches nothing and says so",
          ok is False and os.path.getmtime(store.LOCK_PATH) == before, (ok, before, os.path.getmtime(store.LOCK_PATH)))
os.remove(store.LOCK_PATH)
check("L3 outside any lock, lock_beat() is False", store.lock_beat() is False)

print(NL + "=== L4. A STALE LOCK IS STOLEN AND LOGGED WITH THE DEAD HOLDER'S LINE; A FRESH ONE IS NOT")
with open(store.LOCK_PATH, "w", encoding="utf-8") as fh:
    fh.write("deadjob 4242 cafe 2026-11-14T00:00:00\n")
age_lock(31)
cap.lines.clear()
with store.periodic_lock("job_b") as held:
    check("L4 the stale lock is taken", bool(held) and (lock_text() or "").startswith("job_b"), lock_text())
check("L4 the steal is logged with the dead holder's line", any("STOLE" in x and "deadjob 4242 cafe" in x
                                                                  for x in cap.lines), cap.lines)
with open(store.LOCK_PATH, "w", encoding="utf-8") as fh:
    fh.write("livejob 4343 beef now\n")
age_lock(29)
with store.periodic_lock("job_c") as held:
    check("L4 POSITIVE CONTROL: a lock 29 minutes old is NOT stolen", held is False, held)
check("L4 and it is still the live job's", (lock_text() or "").startswith("livejob 4343"), lock_text())
os.remove(store.LOCK_PATH)

print(NL + "=== L5. A LIVE HOLDER THAT BEATS IS NEVER STOLEN, EVEN PAST 30 MINUTES OF WORK")
with store.periodic_lock("long_job") as held:
    age_lock(29)
    held.beat()                                     # the beat a long run makes
    with store.periodic_lock("intruder") as got:
        check("L5 the intruder is refused after the beat", got is False, got)
    check("L5 and the long job still holds it", held.ours())

print(NL + "=== B1. THE FOLLOW-UP BEATS PER BUCKET AND EVERY 500 ENTRIES")
beats = []
_real = follow_up.lock_beat
_real_due = follow_up.due_now
follow_up.lock_beat = lambda: beats.append(1) or True
follow_up.due_now = lambda b: [{"mint": "M%d" % i, "age": "1h"} for i in range(700)]
try:
    n = sum(1 for _ in follow_up._entries_across(["b1", "b2", "b3"]))
finally:
    follow_up.lock_beat, follow_up.due_now = _real, _real_due
check("B1 one beat per bucket from the entry generator", n == 2100 and len(beats) == 3, (n, len(beats)))
# DRIVEN THROUGH run_hour (the production entry point), not read from its source: one bucket of 1,200 entries ->
# one bucket beat + two 500-entry beats
beats.clear()
saved = (follow_up.lock_beat, follow_up.due_now, follow_up._buckets_to_read, follow_up._buckets_too_old,
         follow_up.providers.token_state, follow_up.promote.run, follow_up.summary.build)
follow_up.lock_beat = lambda: beats.append(1) or True
follow_up.due_now = lambda b: [{"mint": "R%d" % i, "age": "1h"} for i in range(1200)]
follow_up._buckets_to_read = lambda now: [datetime(2026, 11, 30, 11, tzinfo=UTC)]
follow_up._buckets_too_old = lambda now: 0
follow_up.providers.token_state = lambda m: {"alive": False, "pairs": 0, "evidence": "no_pairs_returned"}
follow_up.promote.run = lambda now: {}
follow_up.summary.build = lambda now: {}
try:
    st = follow_up.run_hour(datetime(2026, 11, 30, 12, tzinfo=UTC))
finally:
    (follow_up.lock_beat, follow_up.due_now, follow_up._buckets_to_read, follow_up._buckets_too_old,
     follow_up.providers.token_state, follow_up.promote.run, follow_up.summary.build) = saved
check("B1 run_hour over one bucket of 1,200 entries beats 3 times (1 bucket + 2 x 500)",
      st.get("due") == 1200 and len(beats) == 3, (st.get("due"), len(beats), st.get("skipped")))


def birth_row(mint):
    return {"mint": mint, "created_at": "2026-10-01T00:00:00+00:00", "follow_reason": "size_carrier"}


print(NL + "=== B2. PROMOTE BEATS EVERY 500 ROWS")
os.makedirs(BIRTHS_DIR, exist_ok=True)
with open(os.path.join(BIRTHS_DIR, "2026-10-01.jsonl"), "w", encoding="utf-8", newline="") as fh:
    for i in range(1250):
        fh.write(json.dumps(birth_row("P%d" % i)) + NL)
beats.clear()
_rp = promote.lock_beat
promote.lock_beat = lambda: beats.append(1) or True
try:
    promote.run(datetime(2026, 11, 30, tzinfo=UTC))
finally:
    promote.lock_beat = _rp
check("B2 1,250 rows -> 2 beats", len(beats) == 2, len(beats))

print(NL + "=== B3. TIER BEATS ONCE PER SOURCE")
beats.clear()
_rt = tier.lock_beat
tier.lock_beat = lambda: beats.append(1) or True
try:
    tier.tier_payloads(datetime(2026, 11, 30, tzinfo=UTC))
finally:
    tier.lock_beat = _rt
check("B3 one beat per tiered source", len(beats) == len(tier.TIERED_SOURCES) and len(beats) > 0,
      (len(beats), len(tier.TIERED_SOURCES)))

shutil.rmtree(ROOT, ignore_errors=True)
print(NL + "%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
