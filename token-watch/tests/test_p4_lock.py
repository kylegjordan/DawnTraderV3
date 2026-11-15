"""
token-watch — B-TOKEN-WATCH-FOLLOWUP-MEMORY P4 (OBJ-4b(a)): the periodic lock's heartbeat, its logged stale-only steal,
its release by token, and the TIME-GATED beat (Langston CHANGES-1: at most one touch per BEAT_EVERY_S, called per
entry by run_hour, per row by promote, per source and per file by tier, and per census row by the summary walk), with
a LOST lock latched (logged once, never re-read) and a read fault retried at the gate's cadence.

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

class FakeTime:
    """store's clock for the time-gated beat: monotonic is ours to advance; wall time and sleep stay real."""
    def __init__(self):
        self.t = 1000.0

    def monotonic(self):
        return self.t

    def time(self):
        return time.time()

    def sleep(self, s):
        time.sleep(s)


print(NL + "=== G1. THE BEAT IS GATED ON ELAPSED TIME: AT MOST ONE TOUCH PER BEAT_EVERY_S (Langston CHANGES-1)")
fake = FakeTime()
_real_time = store.time
store.time = fake
try:
    with store.periodic_lock("gated") as held:
        age_lock(10)
        m0 = os.path.getmtime(store.LOCK_PATH)
        fake.t += 1
        r1 = store.lock_beat()
        m1 = os.path.getmtime(store.LOCK_PATH)
        fake.t += store.BEAT_EVERY_S
        r2 = store.lock_beat()
        m2 = os.path.getmtime(store.LOCK_PATH)
finally:
    store.time = _real_time
check("G1 BEAT_EVERY_S is a tenth of LOCK_STALE_AFTER", store.BEAT_EVERY_S == store.LOCK_STALE_AFTER.total_seconds() / 10)
check("G1 a call 1 s after the last beat reports fresh and touches nothing", r1 is True and m1 == m0, (r1, m0, m1))
check("G1 a call BEAT_EVERY_S later touches the lock", r2 is True and m2 > m0 + 300, (r2, m0, m2))


def driven_run(n_entries, secs_per_entry):
    """run_hour over one stubbed bucket of n entries, each lookup advancing store's monotonic clock; returns the
    clock times at which the lock was REALLY touched, and the run's own start/end clock."""
    fake = FakeTime()
    touches = []
    real_beat = store.LockHolder.beat

    def counting_beat(self):
        touches.append(fake.t)
        return real_beat(self)

    def slow_state(m):
        fake.t += secs_per_entry
        return {"alive": False, "pairs": 0, "evidence": "no_pairs_returned"}

    saved = (store.time, store.LockHolder.beat, follow_up.due_now, follow_up._buckets_to_read,
             follow_up._buckets_too_old, follow_up.providers.token_state, follow_up.promote.run,
             follow_up.summary.build)
    store.time = fake
    store.LockHolder.beat = counting_beat
    follow_up.due_now = lambda b: [{"mint": "R%d" % i, "age": "1h"} for i in range(n_entries)]
    follow_up._buckets_to_read = lambda now: [datetime(2026, 11, 30, 11, tzinfo=UTC)]
    follow_up._buckets_too_old = lambda now: 0
    follow_up.providers.token_state = slow_state
    follow_up.promote.run = lambda now: {}
    follow_up.summary.build = lambda now: {}
    t_start = fake.t
    try:
        st = follow_up.run_hour(datetime(2026, 11, 30, 12, tzinfo=UTC))
    finally:
        (store.time, store.LockHolder.beat, follow_up.due_now, follow_up._buckets_to_read,
         follow_up._buckets_too_old, follow_up.providers.token_state, follow_up.promote.run,
         follow_up.summary.build) = saved
    return st, touches, t_start, fake.t


print(NL + "=== L6. A LOST LOCK IS LATCHED: logged once, never re-read (Langston, P4 re-roll PROCEED)")
reads = {"n": 0}
_ro = open


def counting_open(path, *a, **k):
    if str(path) == store.LOCK_PATH:
        reads["n"] += 1
    return _ro(path, *a, **k)


fake = FakeTime()
store.time = fake
try:
    with store.periodic_lock("latch") as held:
        with open(store.LOCK_PATH, "w", encoding="utf-8") as fh:
            fh.write("thief 999 deadbeef now" + NL)
        cap.lines.clear()
        store.open = counting_open
        try:
            fake.t += store.BEAT_EVERY_S + 1
            results = []
            for i in range(10000):
                fake.t += 1                      # 10,000 s of calls: 55 gate intervals
                results.append(store.lock_beat())
        finally:
            del store.open
        lost_errors = [x for x in cap.lines if "REFUSED" in x]
        lost_reads = reads["n"]
    os.remove(store.LOCK_PATH)
finally:
    store.time = _real_time
check("L6 every call after the loss returns False", not any(results))
check("L6 ONE refusal is logged for 10,000 calls", len(lost_errors) == 1, len(lost_errors))
check("L6 and the lock file is read once, not per call", lost_reads == 1, lost_reads)

print(NL + "=== L7. A READ FAULT IS NOT TERMINAL: retried once per BEAT_EVERY_S, and the beat resumes when it clears")
fault = {"on": True}


def faulty_open(path, *a, **k):
    if str(path) == store.LOCK_PATH and fault["on"]:
        raise PermissionError(13, "simulated fault")
    return _ro(path, *a, **k)


fake = FakeTime()
store.time = fake
try:
    with store.periodic_lock("fault") as held:
        cap.lines.clear()
        store.open = faulty_open
        try:
            fake.t += store.BEAT_EVERY_S + 1
            r_fault = store.lock_beat()
            fake.t += 10
            r_inside = store.lock_beat()
            errs_after_two = len([x for x in cap.lines if "could not be read" in x])
            fault["on"] = False
            fake.t += store.BEAT_EVERY_S
            r_back = store.lock_beat()
        finally:
            del store.open
        not_lost = not held.lost
finally:
    store.time = _real_time
check("L7 the fault refuses and names the error, without latching", r_fault is False and not_lost
      and errs_after_two == 1, (r_fault, not_lost, errs_after_two))
check("L7 inside the gate it does not retry (one error for two calls)", r_inside is False)
check("L7 once the fault clears, the next gate beats again", r_back is True, r_back)

print(NL + "=== G2. SLOW LOOKUPS STILL BEAT IN TIME: 500 entries at 3.6 s each never leave the lock unbeaten for 30 min")
# the breakeven Langston derived: 30 min / 500 = 3.6 s per entry. Run past it, at 4 s, for 1,200 entries (80 min).
st, touches, t0, t1 = driven_run(1200, 4.0)
points = [t0] + touches + [t1]
gaps = [b - a for a, b in zip(points, points[1:])]
check("G2 the run completed all 1,200 entries", st.get("due") == 1200, st.get("due"))
check("G2 the longest stretch without a touch is under BEAT_EVERY_S + one entry (never near 30 min)",
      max(gaps) <= store.BEAT_EVERY_S + 4.0, (max(gaps), len(touches)))
check("G2 POSITIVE CONTROL: the run was long enough to need many beats (80 min of lookups)",
      t1 - t0 >= 4800 and len(touches) >= 20, (t1 - t0, len(touches)))

print(NL + "=== G3. FAST LOOKUPS DO NOT HAMMER THE LOCK: 1,200 entries at 0.25 s each touch it at most a few times")
st, touches, t0, t1 = driven_run(1200, 0.25)
check("G3 300 s of lookups -> at most 2 touches", len(touches) <= 2, len(touches))

print(NL + "=== B1. THE FOUR SITES CALL lock_beat (the gate decides whether to touch)")
calls = []
saved_b = (follow_up.lock_beat, follow_up.due_now, follow_up._buckets_to_read, follow_up._buckets_too_old,
           follow_up.providers.token_state, follow_up.promote.run, follow_up.summary.build)
follow_up.lock_beat = lambda: calls.append("f") or True
follow_up.due_now = lambda b: [{"mint": "R%d" % i, "age": "1h"} for i in range(300)]
follow_up._buckets_to_read = lambda now: [datetime(2026, 11, 30, 11, tzinfo=UTC)]
follow_up._buckets_too_old = lambda now: 0
follow_up.providers.token_state = lambda m: {"alive": False, "pairs": 0, "evidence": "no_pairs_returned"}
follow_up.promote.run = lambda now: {}
follow_up.summary.build = lambda now: {}
try:
    st = follow_up.run_hour(datetime(2026, 11, 30, 12, tzinfo=UTC))
finally:
    (follow_up.lock_beat, follow_up.due_now, follow_up._buckets_to_read, follow_up._buckets_too_old,
     follow_up.providers.token_state, follow_up.promote.run, follow_up.summary.build) = saved_b
check("B1 run_hour calls it once per entry", st.get("due") == 300 and len(calls) == 300, (st.get("due"), len(calls)))


def birth_row(mint):
    return {"mint": mint, "created_at": "2026-10-01T00:00:00+00:00", "follow_reason": "size_carrier"}


os.makedirs(BIRTHS_DIR, exist_ok=True)
with open(os.path.join(BIRTHS_DIR, "2026-10-01.jsonl"), "w", encoding="utf-8", newline="") as fh:
    for i in range(1250):
        fh.write(json.dumps(birth_row("P%d" % i)) + NL)
calls.clear()
_rp = promote.lock_beat
promote.lock_beat = lambda: calls.append("p") or True
try:
    promote.run(datetime(2026, 11, 30, tzinfo=UTC))
finally:
    promote.lock_beat = _rp
check("B2 promote calls it once per row", len(calls) == 1250, len(calls))

calls.clear()
_rt = tier.lock_beat
tier.lock_beat = lambda: calls.append("t") or True
try:
    tier.tier_payloads(datetime(2026, 11, 30, tzinfo=UTC))
finally:
    tier.lock_beat = _rt
check("B3 tier calls it once per source", len(calls) == len(tier.TIERED_SOURCES) and calls, (len(calls),))

import summary  # noqa: E402
calls.clear()
_rs = summary.lock_beat
summary.lock_beat = lambda: calls.append("s") or True
try:
    summary._oldest_in_file("2026-10-01.jsonl", {}, set(), 5, [])
finally:
    summary.lock_beat = _rs
check("B4 the summary's day-file walk calls it once per row (the lock is oldest there)", len(calls) == 1250, len(calls))

print(NL + "=== S1. THE STEAL RE-CHECKS THE LINE: A LOCK REPLACED BETWEEN THE TWO READS IS NOT REMOVED")
with open(store.LOCK_PATH, "w", encoding="utf-8") as fh:
    fh.write("deadjob 4242 cafe 2026-11-14T00:00:00" + NL)
age_lock(31)
reads = {"n": 0}
_real_open = open


def racing_open(path, *a, **k):
    if str(path) == store.LOCK_PATH and (not a or "r" in a[0]) and "w" not in str(k.get("mode", "")):
        reads["n"] += 1
        if reads["n"] == 2:                    # the steal's re-read: someone took the lock in between
            with _real_open(path, "w", encoding="utf-8") as fh:
                fh.write("newjob 5555 f00d now" + NL)
    return _real_open(path, *a, **k)


store.open = racing_open
try:
    with store.periodic_lock("job_s") as held:
        got = held
finally:
    del store.open
check("S1 the new job's lock is NOT removed, so we do not get it", got is False and (lock_text() or "").startswith(
    "newjob 5555"), (got, lock_text()))
os.remove(store.LOCK_PATH)

shutil.rmtree(ROOT, ignore_errors=True)
print(NL + "%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
