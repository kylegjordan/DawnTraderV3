"""
token-watch — THE DEAD-MAN'S SWITCH SUITE.

⛔ EVERY CENSUS ROW HERE IS WRITTEN BY `store.record_birth` — the PRODUCTION
   writer — never by this file appending JSONL. That is the whole lesson of
   `test_wiring.py`: a suite that manufactures the state it then asserts on
   proves the function works and says NOTHING about whether anything reaches
   it. If the receiver stopped calling `record_birth`, these tests must fail.

★ AND EVERY BLOCK CARRIES A POSITIVE CONTROL, because this instrument's whole
  job is to report an ABSENCE. "No gap was recorded" is worth nothing until
  the same code path is shown recording one.
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

ROOT = tempfile.mkdtemp(prefix="token-watch-live-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import liveness  # noqa: E402
import store  # noqa: E402
from config import LIVENESS_GAP_SECONDS  # noqa: E402

UTC = timezone.utc
PASS = FAIL = 0


def check(label, cond):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok   %s" % label)
    else:
        FAIL += 1
        print("  FAIL %s" % label)


def reset():
    """Fresh store between blocks — the cursor is state and it must not leak."""
    for name in os.listdir(ROOT):
        shutil.rmtree(os.path.join(ROOT, name), ignore_errors=True)
    store.ensure_dirs()


def birth(mint, seen_at):
    """One census row, through the PRODUCTION writer."""
    return store.record_birth(
        mint=mint,
        created_at=seen_at - timedelta(seconds=5),
        first_seen_at=seen_at,
        venue="PUMP_FUN",
        initial_size=1.0,
        initial_liquidity=None,
        creator="C1",
        size_source="feePayer_sole_transfer",
        socials={},
        followed=False,
        follow_reason="control",
    )


def gaps():
    if not os.path.exists(liveness.GAPS_PATH):
        return []
    with open(liveness.GAPS_PATH, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


T0 = datetime(2026, 8, 20, 12, 0, 0, tzinfo=UTC)

print("\n=== 1. A HEALTHY FEED MUST PRODUCE NO GAP (the control that must stay silent)")
reset()
for i in range(10):
    birth("M%d" % i, T0 + timedelta(seconds=60 * i))
st = liveness.check(now=T0 + timedelta(seconds=600))
check("ten rows one minute apart are read", st["rows"] == 10)
check("no gap recorded on a healthy feed", st["gaps"] == 0)
check("gap file holds nothing", gaps() == [])

print("\n=== 2. POSITIVE CONTROL — the same code path MUST fire on a real hole")
reset()
birth("A", T0)
birth("B", T0 + timedelta(seconds=LIVENESS_GAP_SECONDS + 60))
st = liveness.check(now=T0 + timedelta(seconds=LIVENESS_GAP_SECONDS + 120))
g = gaps()
check("the hole is detected", st["gaps"] == 1)
check("detected retrospectively, from the rows themselves",
      g[0]["detected"] == "retrospective")
check("start is the last row before the hole", g[0]["started_at"] == T0.isoformat())
check("end is the first row after it",
      g[0]["ended_at"] == (T0 + timedelta(seconds=LIVENESS_GAP_SECONDS + 60)).isoformat())
check("duration is the measured hole", g[0]["duration_s"] == LIVENESS_GAP_SECONDS + 60)
check("the row estimate is LABELLED as a bound, not a count",
      "not a count" in g[0]["estimate_basis"])

print("\n=== 3. THE RETROSPECTIVE LEG — a gap that OPENED AND CLOSED between checks")
# ★ This is the case an hourly checker structurally cannot see by asking
#   'is it silent right now?' — by the time it looks, the feed is healthy again.
reset()
birth("A", T0)
birth("B", T0 + timedelta(seconds=LIVENESS_GAP_SECONDS + 300))
for i in range(5):
    birth("C%d" % i, T0 + timedelta(seconds=LIVENESS_GAP_SECONDS + 360 + 60 * i))
st = liveness.check(now=T0 + timedelta(seconds=LIVENESS_GAP_SECONDS + 700))
check("the closed gap is still found after recovery", st["gaps"] == 1)
check("and the feed is NOT reported as currently down",
      liveness.load_state("liveness", {}).get("open_gap") in (None, {}))

print("\n=== 4. THE PROSPECTIVE LEG — a feed that is STILL down has no closing row")
reset()
birth("A", T0)
st = liveness.check(now=T0 + timedelta(seconds=LIVENESS_GAP_SECONDS + 60))
open_gap = liveness.load_state("liveness", {}).get("open_gap")
check("an open gap is raised while the feed is silent", bool(open_gap))
check("no gap RECORD is written yet — it has no end", st["gaps"] == 0)

# ...and it must CLOSE, with the record written, when rows resume.
birth("B", T0 + timedelta(seconds=LIVENESS_GAP_SECONDS + 600))
st2 = liveness.check(now=T0 + timedelta(seconds=LIVENESS_GAP_SECONDS + 700))
g = [x for x in gaps() if x["detected"] == "prospective_closed"]
check("the gap closes when the feed recovers", len(g) == 1)
check("and the open flag is cleared",
      liveness.load_state("liveness", {}).get("open_gap") in (None, {}))

print("\n=== 5. ROWS, NOT POSTS — a parse failure that answers 200 must still be caught")
# ⛔ THE DISCRIMINATING CASE. If this counted POSTs it would read healthy: the
#    receiver is up and answering. Zero ROWS is what makes it visible.
reset()
birth("A", T0)
# ...receiver keeps answering 200 but records nothing for an hour.
st = liveness.check(now=T0 + timedelta(seconds=3600))
check("a receiver that records nothing reads as DOWN, not as healthy",
      bool(liveness.load_state("liveness", {}).get("open_gap")))

print("\n=== 6. THE DAY ROLL — midnight must not silently eat the previous file's tail")
reset()
day1 = datetime(2026, 8, 20, 23, 50, 0, tzinfo=UTC)
birth("LATE1", day1)
birth("LATE2", day1 + timedelta(seconds=60))
liveness.check(now=day1 + timedelta(seconds=120))          # cursor parks in day 1
birth("LATE3", day1 + timedelta(seconds=180))              # still day 1, after the check
birth("NEXT", datetime(2026, 8, 21, 0, 30, 0, tzinfo=UTC))  # day 2
st = liveness.check(now=datetime(2026, 8, 21, 0, 40, 0, tzinfo=UTC))
check("the previous day's tail is drained, not skipped", st["rows"] == 2)

print("\n=== 7. A TORN TAIL IS A ROW BEING WRITTEN — never consume it")
reset()
birth("A", T0)
path = store.birth_path(T0)
with open(path, "a", encoding="utf-8") as fh:
    fh.write('{"mint": "PARTIAL", "first_seen')        # no newline: mid-write
st = liveness.check(now=T0 + timedelta(seconds=60))
check("only the complete row is read", st["rows"] == 1)
check("the partial line is not counted as corrupt", st["bad_lines"] == 0)
# ...and when the writer finishes it, the row appears.
with open(path, "a", encoding="utf-8") as fh:
    fh.write('_at": "%s"}\n' % (T0 + timedelta(seconds=30)).isoformat())
st2 = liveness.check(now=T0 + timedelta(seconds=90))
check("POSITIVE CONTROL — the completed row is then picked up", st2["rows"] == 1)

print("\n=== 8. FIRST RUN ON AN EMPTY CENSUS MUST NOT MANUFACTURE A GAP")
# 'Never started' and 'stopped' are indistinguishable from here, and inventing
# a gap out of our own ignorance is the absent-as-valid failure inverted.
reset()
st = liveness.check(now=T0)
check("no gap invented on an empty first run", st["gaps"] == 0)
check("and it is reported AS a first run, not as silence", st["first_run"] is True)

print("\n=== 9. THE STORE CAP — the accept-side dual, and it must actually measure")
reset()
birth("A", T0)
st = liveness.check(now=T0 + timedelta(seconds=30))
check("store size is measured, not assumed", st["store_bytes"] > 0)
check("a small store reads ok", st["store_state"] == "ok")
# POSITIVE CONTROL: the same code path must be able to say 'over'.
saved = liveness.STORE_CAP_BYTES
liveness.STORE_CAP_BYTES = 1
liveness.STORE_CAP_WARN_BYTES = 1
check("POSITIVE CONTROL — the cap check can fire",
      liveness._store_size_check()["store_state"] == "over_cap")
liveness.STORE_CAP_BYTES = saved
liveness.STORE_CAP_WARN_BYTES = saved - 1

print("\n=== 10. TRUNCATION — an append-only file that shrank must restart, not skip")
reset()
for i in range(5):
    birth("M%d" % i, T0 + timedelta(seconds=60 * i))
liveness.check(now=T0 + timedelta(seconds=300))
with open(store.birth_path(T0), "w", encoding="utf-8") as fh:
    fh.write("")                                   # truncated under our feet
birth("AFTER", T0 + timedelta(seconds=360))
st = liveness.check(now=T0 + timedelta(seconds=400))
check("the cursor restarts rather than reading past the end", st["rows"] == 1)

print("\n%d passed, %d failed" % (PASS, FAIL))
shutil.rmtree(ROOT, ignore_errors=True)
sys.exit(1 if FAIL else 0)
