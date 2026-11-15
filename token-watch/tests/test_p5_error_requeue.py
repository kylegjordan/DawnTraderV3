"""
token-watch — B-TOKEN-WATCH-FOLLOWUP-MEMORY P5 (OBJ-4b(b)): a failed observation is RECORDED and retried next hour up to
MAX_ERROR_ATTEMPTS, then recorded `abandoned` — never dropped. Driven through follow_up.run_hour, stubbing only the
network read, the bucket list and the two downstream steps.

Run:  python tests/test_p5_error_requeue.py        (exit 0 = every check passed)
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

ROOT = tempfile.mkdtemp(prefix="token-watch-p5-", dir=os.path.expanduser("~"))
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import store  # noqa: E402
import follow_up  # noqa: E402
from config import OBSERVATIONS_DIR  # noqa: E402

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


def obs_rows():
    out = []
    if os.path.isdir(OBSERVATIONS_DIR):
        for n in sorted(os.listdir(OBSERVATIONS_DIR)):
            for raw in open(os.path.join(OBSERVATIONS_DIR, n), encoding="utf-8"):
                if raw.strip():
                    out.append(json.loads(raw))
    return out


def run_with(entries, now, token_state):
    """One run_hour over ONE stubbed bucket holding `entries`; returns (stats, appended next-bucket entries)."""
    appended = []
    saved = (follow_up.due_now, follow_up._buckets_to_read, follow_up._buckets_too_old, follow_up.providers.token_state,
             follow_up.promote.run, follow_up.summary.build, follow_up.store_append)
    follow_up.due_now = lambda b: list(entries)
    follow_up._buckets_to_read = lambda n: [now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)]
    follow_up._buckets_too_old = lambda n: 0
    follow_up.providers.token_state = token_state
    follow_up.promote.run = lambda n: {}
    follow_up.summary.build = lambda n: {}
    real_append = follow_up.store_append
    follow_up.store_append = lambda path, e: (appended.append((path, dict(e))), real_append(path, e))[1]
    try:
        st = follow_up.run_hour(now)
    finally:
        (follow_up.due_now, follow_up._buckets_to_read, follow_up._buckets_too_old, follow_up.providers.token_state,
         follow_up.promote.run, follow_up.summary.build, follow_up.store_append) = saved
    return st, appended


def boom(m):
    raise RuntimeError("provider exploded")


store.ensure_dirs()
T0 = datetime(2026, 11, 30, 12, 5, tzinfo=UTC)
entry = {"mint": "ERR1", "age": "1h", "due_at": (T0 - timedelta(hours=1)).isoformat()}

print(NL + "=== E1. A FAILED OBSERVATION IS RECORDED AND REQUEUED, CARRYING ITS ATTEMPT COUNT")
st, app = run_with([entry], T0, boom)
rows = [r for r in obs_rows() if r.get("mint") == "ERR1"]
check("E1 the failure is counted", st.get("errors") == 1 and st.get("error_requeued") == 1, st)
check("E1 a row names it: observed False, reason error, the error type, attempt 1",
      len(rows) == 1 and rows[0].get("observed") is False and rows[0].get("reason") == "error"
      and rows[0].get("error") == "RuntimeError" and rows[0].get("attempts") == 1, rows)
check("E1 the entry goes to the NEXT hour's bucket with attempts 1",
      len(app) == 1 and app[0][1].get("attempts") == 1 and app[0][1].get("mint") == "ERR1"
      and app[0][0] == store.due_path(T0 + timedelta(hours=1)), app)

print(NL + "=== E2. THE THIRD FAILURE IS RECORDED `abandoned` AND NOT REQUEUED")
st2, app2 = run_with([dict(entry, attempts=1)], T0 + timedelta(hours=1), boom)
st3, app3 = run_with([dict(entry, attempts=2)], T0 + timedelta(hours=2), boom)
rows = [r for r in obs_rows() if r.get("mint") == "ERR1"]
check("E2 attempt 2 is requeued with attempts 2", st2.get("error_requeued") == 1 and app2
      and app2[0][1].get("attempts") == 2, (st2, app2))
check("E2 attempt 3 (= MAX_ERROR_ATTEMPTS) is abandoned, not requeued",
      follow_up.MAX_ERROR_ATTEMPTS == 3 and st3.get("error_abandoned") == 1 and st3.get("error_requeued") == 0
      and not app3, (st3, app3))
check("E2 and the abandonment is on the record", rows[-1].get("reason") == "abandoned" and rows[-1].get("attempts") == 3,
      rows[-1])

print(NL + "=== E3. POSITIVE CONTROL: a retried entry that now succeeds is observed")
ok_state = lambda m: {"alive": True, "pairs": 1, "evidence": "pairs", "liquidity_usd": 10.0}
st4, app4 = run_with([dict(entry, attempts=1)], T0 + timedelta(hours=3), ok_state)
check("E3 the retry observes it", st4.get("observed") == 1 and st4.get("errors") == 0 and not app4, (st4, app4))

print(NL + "=== E4. A SHED IS STILL A SHED, NOT AN ERROR (the branch above it is unchanged)")


def shed(m):
    raise follow_up.providers.Shed("budget exhausted (test)")


st5, app5 = run_with([dict(entry, mint="SHED1")], T0 + timedelta(hours=4), shed)
check("E4 counted as shed, no error, no requeue", st5.get("shed") == 1 and st5.get("errors") == 0 and not app5,
      (st5, app5))

shutil.rmtree(ROOT, ignore_errors=True)
print(NL + "%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
