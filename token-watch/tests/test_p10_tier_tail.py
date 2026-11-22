"""
token-watch — B-TOKEN-WATCH-FOLLOWUP-MEMORY P10 fold (Langston 2026-11-15, Discord `1571573900708679733`):
TIER IS CARRIED BY THE FOLLOW-UP'S TAIL, inside the follow-up's lock, once a UTC day from 04:30Z, and the tier timer is
the backstop. Also C-2: a failed promote / summary / tier stage exits the follow-up 1.

Every follow-up case is driven through the PRODUCTION entry point `follow_up.run_hour` (C-1), stubbing only the
providers and the two other stages; tier itself runs for real on a scratch store except where a fault is injected.

Run:  python tests/test_p10_tier_tail.py        (exit 0 = every check passed)
"""

import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-p10-", dir=os.path.expanduser("~"))
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import store  # noqa: E402
import tier  # noqa: E402
import follow_up  # noqa: E402

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


def set_record(when):
    if when is None:
        try:
            os.remove(store.state_path(tier.TIER_STATE))
        except FileNotFoundError:
            pass
    else:
        store.save_state(tier.TIER_STATE, {"completed_at": when.isoformat()})


def record():
    return store.load_state(tier.TIER_STATE, {}).get("completed_at")


def lock_line():
    try:
        with open(store.LOCK_PATH, encoding="utf-8") as fh:
            return fh.read()
    except FileNotFoundError:
        return None


SBUILDS = []   # the `now` each summary.build received (T10)


def drive(run_start, clock, tier_fault=None, tier_result=None, promote_fault=False, summary_fault=False):
    """One run_hour with no due bucket. Returns (stats, calls): calls = [(now passed to tier, lock line at the call)]."""
    calls = []
    SBUILDS.clear()
    real_locked = tier.run_locked

    def spy(n):
        calls.append((n, lock_line()))
        if tier_fault:
            raise RuntimeError(tier_fault)
        if tier_result is not None:
            return dict(tier_result)
        return real_locked(n)

    def p_run(n):
        if promote_fault:
            raise RuntimeError("promote exploded")
        return {}

    def s_build(n):
        SBUILDS.append(n)
        if summary_fault:
            raise RuntimeError("summary exploded")
        return {"generated_at": n.isoformat()}

    saved = (follow_up.due_now, follow_up._buckets_to_read, follow_up._buckets_too_old, follow_up.promote.run,
             follow_up.summary.build, follow_up._clock, tier.run_locked)
    follow_up.due_now = lambda b: []
    follow_up._buckets_to_read = lambda n: []
    follow_up._buckets_too_old = lambda n: 0
    follow_up.promote.run = p_run
    follow_up.summary.build = s_build
    follow_up._clock = lambda: clock
    tier.run_locked = spy
    try:
        st = follow_up.run_hour(run_start)
    finally:
        (follow_up.due_now, follow_up._buckets_to_read, follow_up._buckets_too_old, follow_up.promote.run,
         follow_up.summary.build, follow_up._clock, tier.run_locked) = saved
    return st, calls


store.ensure_dirs()
D = datetime(2026, 11, 20, tzinfo=UTC)

print(NL + "=== T1. NO RECORD: THE TAIL RUNS TIER, INSIDE THE FOLLOW-UP'S LOCK, AND TIER RECORDS ITSELF")
set_record(None)
st, calls = drive(D + timedelta(hours=1), D + timedelta(hours=1, minutes=50))
check("T1 tier was called once", len(calls) == 1, calls)
check("T1 the follow-up's lock was held at the call (inside the with block)",
      bool(calls) and (calls[0][1] or "").startswith("follow_up "), calls)
check("T1 the record was written by the real tier run", record() is not None, record())
check("T1 the follow-up exits 0", follow_up.exit_code(st) == 0, st.get("stage_errors"))
check("T1 the lock is released after the run", lock_line() is None, lock_line())

print(NL + "=== T2. ALREADY COMPLETED TODAY: NOT CALLED")
set_record(D + timedelta(hours=4, minutes=40))
st, calls = drive(D + timedelta(hours=5), D + timedelta(hours=5, minutes=40))
check("T2 tier not called", calls == [], calls)
check("T2 the stats say why", "not_due" in (st.get("tier") or {}), st.get("tier"))

print(NL + "=== T3. THE 04:30Z CADENCE: yesterday's record, 01:00Z today -> NOT called (C-6 ii)")
set_record(D - timedelta(hours=19))                      # yesterday 05:00Z
st, calls = drive(D + timedelta(hours=0, minutes=5), D + timedelta(hours=1))
check("T3 tier not called before 04:30Z", calls == [], calls)

print(NL + "=== T4. yesterday's record, 04:45Z today -> CALLED (POSITIVE CONTROL for T3)")
set_record(D - timedelta(hours=19))
st, calls = drive(D + timedelta(hours=4, minutes=2), D + timedelta(hours=4, minutes=45))
check("T4 tier called once at 04:45Z", len(calls) == 1, calls)

print(NL + "=== T5. C-3: TIER GETS THE FRESH CLOCK, NOT THE RUN-START `now`")
set_record(D - timedelta(hours=19))
st, calls = drive(D + timedelta(hours=3, minutes=59), D + timedelta(hours=4, minutes=50))
check("T5 due on the fresh clock (04:50Z) though the run started at 03:59Z", len(calls) == 1, calls)
check("T5 tier received the fresh clock", bool(calls) and calls[0][0] == D + timedelta(hours=4, minutes=50), calls)

print(NL + "=== T6. A TIER FAULT IN THE TAIL EXITS 1, AND THE FOLLOW-UP'S OWN RESULT STILL STANDS")
set_record(None)
st, calls = drive(D + timedelta(hours=6), D + timedelta(hours=6, minutes=50), tier_fault="tier exploded")
check("T6 the fault is a stage error", "tier" in st.get("stage_errors", []), st.get("stage_errors"))
check("T6 the follow-up exits 1", follow_up.exit_code(st) == 1, st)
check("T6 the follow-up's own counts are present", "due" in st and "summary" in st and "promote" in st, sorted(st))
check("T6 the record is NOT written (retried next run)", record() is None, record())

print(NL + "=== T7. A TIER REFUSAL IN THE TAIL EXITS 1 (as tier's own unit did)")
set_record(None)
st, calls = drive(D + timedelta(hours=6), D + timedelta(hours=6, minutes=50), tier_result={"refused": 2})
check("T7 a refusal is a stage error", "tier refused" in st.get("stage_errors", []), st.get("stage_errors"))
check("T7 the follow-up exits 1", follow_up.exit_code(st) == 1, st.get("stage_errors"))

print(NL + "=== T8. C-2: A PROMOTE OR SUMMARY FAULT EXITS 1 (they were logged and exited 0)")
set_record(D)
st, _ = drive(D + timedelta(hours=7), D + timedelta(hours=7, minutes=50), promote_fault=True)
check("T8 promote fault -> stage error + exit 1",
      "promote" in st.get("stage_errors", []) and follow_up.exit_code(st) == 1, st.get("stage_errors"))
st, _ = drive(D + timedelta(hours=7), D + timedelta(hours=7, minutes=50), summary_fault=True)
check("T8 summary fault -> stage error + exit 1",
      "summary" in st.get("stage_errors", []) and follow_up.exit_code(st) == 1, st.get("stage_errors"))
st, _ = drive(D + timedelta(hours=7), D + timedelta(hours=7, minutes=50))
check("T8 POSITIVE CONTROL: no fault -> no stage error, exit 0",
      st.get("stage_errors") == [] and follow_up.exit_code(st) == 0, st.get("stage_errors"))
check("T8 a skipped cycle still exits 75", follow_up.exit_code({"skipped": True}) == 75)

print(NL + "=== T10. 07eba4b2: THE SUMMARY IS STAMPED WITH THE FRESH CLOCK, NOT THE RUN-START `now`")
set_record(D)
st, _ = drive(D + timedelta(hours=8, minutes=56), D + timedelta(hours=9, minutes=59))
check("T10 summary.build called once", len(SBUILDS) == 1, SBUILDS)
check("T10 summary.build received the fresh clock (09:59Z), not the run start (08:56Z)",
      SBUILDS == [D + timedelta(hours=9, minutes=59)], SBUILDS)
check("T10 the published stamp is the publish time",
      (st.get("summary") or {}).get("generated_at") == (D + timedelta(hours=9, minutes=59)).isoformat(), st.get("summary"))

print(NL + "=== T9. THE BACKSTOP TIMER READS THE RECORD BEFORE THE LOCK (C-4), AND IS THE TAIL'S WATCHDOG (C-5)")
calls9 = []
real_locked = tier.run_locked


def spy9(n):
    calls9.append(n)
    return real_locked(n)


tier.run_locked = spy9
try:
    NOWT = D + timedelta(hours=4, minutes=32)
    # (a) 23 h old, lock FREE: the C-4 hazard -- the timer must not take the lock
    set_record(NOWT - timedelta(hours=23))
    rc_a = tier.timer_entry(NOWT)
    check("T9a record 23 h old, lock free -> exit 0 and tier NOT run (lock untouched)",
          rc_a == 0 and calls9 == [], (rc_a, calls9))
    # (b) 23 h old, lock HELD by the follow-up: still 0, lock line unchanged
    with store.periodic_lock("follow_up") as held:
        before = lock_line()
        rc_b = tier.timer_entry(NOWT)
        after = lock_line()
    check("T9b record 23 h old, follow-up holding the lock -> exit 0, the lock line unchanged",
          bool(held) and rc_b == 0 and before == after and calls9 == [], (rc_b, before, after))
    # (c) THE WATCHDOG: the tail stopped -> 27 h old, the follow-up holds the lock -> 75
    set_record(NOWT - timedelta(hours=27))
    with store.periodic_lock("follow_up") as held:
        rc_c = tier.timer_entry(NOWT)
    check("T9c WATCHDOG: record 27 h old and the follow-up holding the lock -> exit 75 (pages)",
          bool(held) and rc_c == 75 and calls9 == [], (rc_c, calls9))
    # (d) follow-up off: 27 h old, lock free -> the timer runs tier itself
    rc_d = tier.timer_entry(NOWT)
    check("T9d follow-up off: record 27 h old, lock free -> the timer runs tier, exit 0, record refreshed",
          rc_d == 0 and len(calls9) == 1 and record() == NOWT.isoformat(), (rc_d, calls9, record()))
    # (e) no record at all, lock free -> runs
    set_record(None)
    rc_e = tier.timer_entry(NOWT)
    check("T9e no record, lock free -> the timer runs tier", rc_e == 0 and len(calls9) == 2, (rc_e, calls9))
finally:
    tier.run_locked = real_locked

shutil.rmtree(ROOT, ignore_errors=True)
print(NL + "%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
