"""
token-watch — B-TOKEN-WATCH-FOLLOWUP-MEMORY P7 C-1 (Langston: stamp the birth, don't infer it). Driven through
follow_up.run_hour -- the production entry point -- and then through obs_fold.fold_observations, so the test covers the
CONNECTION: every row the follow-up writes carries the due entry's created_at, and the coverage fold reads it exactly.

Run:  python tests/test_p7_birth_stamp.py        (exit 0 = every check passed)
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

ROOT = tempfile.mkdtemp(prefix="token-watch-p7c1-", dir=os.path.expanduser("~"))
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import store  # noqa: E402
import follow_up  # noqa: E402
import obs_fold  # noqa: E402
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
    saved = (follow_up.due_now, follow_up._buckets_to_read, follow_up._buckets_too_old, follow_up.providers.token_state,
             follow_up.promote.run, follow_up.summary.build)
    follow_up.due_now = lambda b: list(entries)
    follow_up._buckets_to_read = lambda n: [now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)]
    follow_up._buckets_too_old = lambda n: 0
    follow_up.providers.token_state = token_state
    follow_up.promote.run = lambda n: {}
    follow_up.summary.build = lambda n: {}
    try:
        return follow_up.run_hour(now)
    finally:
        (follow_up.due_now, follow_up._buckets_to_read, follow_up._buckets_too_old, follow_up.providers.token_state,
         follow_up.promote.run, follow_up.summary.build) = saved


store.ensure_dirs()
T0 = datetime(2026, 11, 30, 12, 5, tzinfo=UTC)
BORN = "2026-11-29T23:40:00+00:00"
due = (T0 - timedelta(minutes=30)).isoformat()


def e(mint, age, born=BORN):
    d = {"mint": mint, "age": age, "due_at": due}
    if born:
        d["created_at"] = born
    return d


alive = lambda m: {"alive": True, "pairs": 1, "evidence": "pairs", "liquidity_usd": 10.0}


def shed(m):
    raise follow_up.providers.Shed("budget exhausted (test)")


def boom(m):
    raise RuntimeError("provider exploded")


print(NL + "=== B1. EVERY ROW SHAPE THE FOLLOW-UP WRITES CARRIES created_at FROM ITS DUE ENTRY")
run_with([e("OBS1", "24h")], T0, alive)
run_with([e("SHED1", "24h")], T0, shed)
run_with([e("ERR1", "24h")], T0, boom)
dead_born = "2026-11-28T10:00:00+00:00"
store.record_death("DEAD1", T0 - timedelta(hours=2), "faded", "24h", {"pairs": 0}, created_at=dead_born)
run_with([e("DEAD1", "3d", born=dead_born)], T0, alive)
rows = {r["mint"]: r for r in obs_rows()}
check("B1 an observed row carries it", rows.get("OBS1", {}).get("created_at") == BORN, rows.get("OBS1"))
check("B1 a shed row carries it", rows.get("SHED1", {}).get("created_at") == BORN and rows["SHED1"].get("shed"),
      rows.get("SHED1"))
check("B1 an error row carries it", rows.get("ERR1", {}).get("created_at") == BORN and rows["ERR1"].get("reason") == "error",
      rows.get("ERR1"))
check("B1 the post-mortem observation (the second observation write) carries it",
      rows.get("DEAD1", {}).get("created_at") == dead_born and rows["DEAD1"].get("post_mortem") is True,
      rows.get("DEAD1"))

print(NL + "=== B2. AN ENTRY WITHOUT created_at (written before schedule_grid carried it) ADDS NO FIELD")
run_with([e("OLD1", "24h", born=None)], T0, alive)
rows = {r["mint"]: r for r in obs_rows()}
check("B2 no created_at key at all - never a null", "created_at" not in rows.get("OLD1", {"created_at": 1}),
      rows.get("OLD1"))

print(NL + "=== B2b. THE FIFTH WRITER: schedule_grid's scheduled_in_the_past rows carry the birth it was handed (Langston)")
_now = store._now if hasattr(store, "_now") else None
past_birth = datetime(2026, 11, 30, 2, 0, tzinfo=UTC)   # 1h and 6h points already past at T0
store._now = lambda: T0
try:
    store.schedule_grid("LATE1", past_birth)
finally:
    if _now is not None:
        store._now = _now
late = [r for r in obs_rows() if r.get("mint") == "LATE1"]
check("B2b both past points written as scheduled_in_the_past rows, each carrying created_at",
      sorted(r["age"] for r in late) == ["1h", "6h"] and all(r.get("reason") == "scheduled_in_the_past"
      and r.get("created_at") == past_birth.isoformat() for r in late), late)

print(NL + "=== B2c. A REQUEUED ENTRY KEEPS ITS BIRTH: a P5 error requeue, then a success, is counted EXACT (Langston fence)")
appended = []
real_append = follow_up.store_append
follow_up.store_append = lambda path, en: (appended.append(dict(en)), real_append(path, en))[1]
try:
    run_with([e("RQ1", "7d")], T0, boom)
finally:
    follow_up.store_append = real_append
check("B2c the requeued entry still carries created_at", len(appended) == 1 and appended[0].get("created_at") == BORN
      and appended[0].get("attempts") == 1, appended)
run_with([appended[0]], T0 + timedelta(hours=1), alive)
rq = [r for r in obs_rows() if r.get("mint") == "RQ1"]
check("B2c the error row and the retried observation both carry it", len(rq) == 2
      and all(r.get("created_at") == BORN for r in rq) and rq[-1].get("observed") is True, rq)

print(NL + "=== B3. THE COVERAGE FOLD READS THE STAMPED BIRTH EXACTLY (the connection, not the function)")
o = obs_fold.fold_observations({}, T0 + timedelta(minutes=10))
check("B3 the eight stamped rows (4 + 2 scheduled_in_the_past + 2 requeue) are exact, the unstamped one approximated",
      o["split"] == {"exact": 8, "approximated": 1}, o["split"])
check("B3 the 3d post-mortem row counts against 11-28 (its created_at), where observed_at - 3d would put it on 11-27",
      o["by_day"]["3d"].get("2026-11-28", {}).get("covered") == 1 and "2026-11-27" not in o["by_day"]["3d"],
      o["by_day"].get("3d"))

shutil.rmtree(ROOT, ignore_errors=True)
print(NL + "%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
