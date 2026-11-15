"""
token-watch — B-TOKEN-WATCH-FOLLOWUP-MEMORY P7 (OBJ-5): the observation fold (what the follow-up actually looked at)
and the D1 coverage rule.

Run:  python tests/test_p7_obs_fold.py        (exit 0 = every check passed)
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

ROOT = tempfile.mkdtemp(prefix="token-watch-p7-", dir=os.path.expanduser("~"))
os.environ["TOKEN_WATCH_ROOT"] = ROOT
PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PKG)

import store  # noqa: E402
import obs_fold as of  # noqa: E402
from config import OBSERVATIONS_DIR  # noqa: E402

UTC = timezone.utc
NOW = datetime(2026, 11, 15, 12, 30, tzinfo=UTC)
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


def reset():
    shutil.rmtree(ROOT, ignore_errors=True)
    os.makedirs(ROOT)
    store.ensure_dirs()
    os.makedirs(OBSERVATIONS_DIR, exist_ok=True)


def write(day, rows, mode="a"):
    with open(os.path.join(OBSERVATIONS_DIR, day + ".jsonl"), mode, encoding="utf-8", newline="") as fh:
        for r in rows:
            fh.write((r if isinstance(r, str) else json.dumps(r, separators=(",", ":"))) + NL)


def g(d, *ks):
    """nested .get -- a missing key is a FAIL line, never a crash (a crash prints no FAIL and reads as survived)"""
    for k in ks:
        d = d.get(k) if isinstance(d, dict) else None
    return d


def obs(mint, age, at, **kw):
    r = {"mint": mint, "age": age, "observed_at": at, "observed": True}
    r.update(kw)
    return r


print(NL + "=== F1. EVERY SHAPE IS COUNTED, AGAINST ITS BIRTH DAY")
reset()
write("2026-09-20", [
    obs("A", "24h", "2026-09-20T10:00:00+00:00"),                                     # approx -> 09-19
    obs("B", "24h", "2026-09-20T11:00:00+00:00", created_at="2026-09-18T23:30:00+00:00"),  # exact -> 09-18
    {"mint": "C", "age": "7d", "observed_at": "2026-09-20T12:00:00+00:00", "observed": False, "shed": "follow_up"},
    {"mint": "D", "age": "6h", "observed_at": "2026-09-20T12:00:00+00:00", "observed": False,
     "reason": "scheduled_in_the_past", "due_at": "2026-09-20T02:00:00+00:00"},       # exact via due_at -> 09-19
    {"mint": "E", "age": "1h", "observed_at": "2026-09-20T13:00:00+00:00", "observed": False, "reason": "error"},
    {"mint": "F", "age": "1h", "observed_at": "2026-09-20T13:00:00+00:00", "observed": False, "reason": "abandoned"},
    {"mint": "G", "age": "3d", "observed_at": "2026-09-20T13:00:00+00:00", "observed": False, "reason": "novel"},
    "not json", "[1, 2]", "",
])
st = {}
o = of.fold_observations(st, NOW)
bd = o["by_day"]
check("F1 approximate covered row lands on observed_at - grid", g(bd, "24h", "2026-09-19", "covered") == 1, bd.get("24h"))
check("F1 created_at wins over observed_at - grid", g(bd, "24h", "2026-09-18", "covered") == 1, bd.get("24h"))
check("F1 shed counted", g(bd, "7d", "2026-09-13", "shed") == 1, bd.get("7d"))
check("F1 scheduled_in_the_past uses due_at - grid (exact)", g(bd, "6h", "2026-09-19", "scheduled_in_the_past") == 1,
      bd.get("6h"))
check("F1 error and abandoned counted separately", g(bd, "1h", "2026-09-20") == {"error": 1, "abandoned": 1}, bd.get("1h"))
check("F1 an unknown shape is counted, not dropped", g(bd, "3d", "2026-09-17", "unknown_shape") == 1, bd.get("3d"))
check("F1 the exact/approximated split: 2 exact (created_at, due_at), 5 approximated",
      o["split"] == {"exact": 2, "approximated": 5}, o["split"])
check("F1 two non-object lines counted, the blank line silently consumed", o["skipped_lines"] == 2, o["skipped_lines"])
check("F1 last_observed_at is per label and from covered rows only",
      o["last_observed_at"] == {"24h": "2026-09-20T11:00:00+00:00"}, o["last_observed_at"])
check("F1 observed_through is the newest observed_at of ANY shape", o["observed_through"] == "2026-09-20T13:00:00+00:00",
      o["observed_through"])

print(NL + "=== F2. INCREMENTAL: a second pass folds only the new lines; a half-written line waits")
before = json.dumps(o, sort_keys=True)
o2 = of.fold_observations(st, NOW)
check("F2 a pass with nothing new changes nothing", json.dumps(o2, sort_keys=True) == before)
with open(os.path.join(OBSERVATIONS_DIR, "2026-09-20.jsonl"), "a", encoding="utf-8", newline="") as fh:
    fh.write(json.dumps(obs("H", "24h", "2026-09-20T14:00:00+00:00")) + NL)
    fh.write('{"mint": "I", "age": "24h"')                              # no newline: still being written
o3 = of.fold_observations(st, NOW)
check("F2 the new complete row is folded once", o3["by_day"]["24h"]["2026-09-19"]["covered"] == 2, o3["by_day"]["24h"])
with open(os.path.join(OBSERVATIONS_DIR, "2026-09-20.jsonl"), "a", encoding="utf-8", newline="") as fh:
    fh.write(', "observed_at": "2026-09-20T15:00:00+00:00", "observed": true}' + NL)
o4 = of.fold_observations(st, NOW)
check("F2 the half-written row is folded once it completes, and only then",
      o4["by_day"]["24h"]["2026-09-19"]["covered"] == 3, o4["by_day"]["24h"])

print(NL + "=== F3. A FILE THAT SHRANK REBUILDS THE FOLD FROM BYTE 0 (never double-counts, never skips)")
write("2026-09-20", [obs("Z", "24h", "2026-09-20T10:00:00+00:00")], mode="w")
o5 = of.fold_observations(st, NOW + timedelta(minutes=1))
check("F3 rebuilt: exactly the one row now on disk", o5["by_day"] == {"24h": {"2026-09-19": {"covered": 1}}}, o5["by_day"])
check("F3 the rebuild is stamped", o5["rebuilt_at"] == (NOW + timedelta(minutes=1)).isoformat(), o5["rebuilt_at"])
check("F3 and records WHAT it lost, so a short count does not read as a quiet period (Langston part 1a Q1)",
      g(o5, "rebuild_cause", "reason") == "shrank" and g(o5, "rebuild_cause", "file") == "2026-09-20.jsonl"
      and g(o5, "rebuild_cause", "cursor_before") == 963 and g(o5, "rebuild_cause", "size_now") == 83
      and g(o5, "rebuild_cause", "bytes_lost_at_least") == 880, o5.get("rebuild_cause"))
regrow = [obs("R%d" % i, "24h", "2026-09-20T1%d:00:00+00:00" % (i % 10)) for i in range(30)]
write("2026-09-20", regrow, mode="w")
o5b = of.fold_observations(st, NOW + timedelta(minutes=2))
before_size = os.path.getsize(os.path.join(OBSERVATIONS_DIR, "2026-09-20.jsonl"))
check("F3 a file truncated and REGROWN past the cursor (first line changed) is caught and rebuilt (Langston Q1)",
      g(o5b, "rebuild_cause", "reason") == "first line changed" and g(o5b, "by_day", "24h", "2026-09-19", "covered") == 30
      and before_size > 83, (o5b.get("rebuild_cause"), g(o5b, "by_day", "24h")))
o5c = of.fold_observations(st, NOW + timedelta(minutes=3))
check("F3 an unchanged file does not rebuild again", o5c["rebuilt_at"] == (NOW + timedelta(minutes=2)).isoformat(),
      o5c["rebuilt_at"])
st_old = {"obs": dict(o5, version=0)}
o6 = of.fold_observations(st_old, NOW)
check("F3 a state of another fold version is rebuilt from what is on disk now (the 30 regrown rows), with its cause",
      o6["version"] == of.OBS_FOLD_VERSION and o6["by_day"] == {"24h": {"2026-09-19": {"covered": 30}}}
      and "no usable fold state" in g(o6, "rebuild_cause", "reason"), (o6["by_day"], o6.get("rebuild_cause")))

print(NL + "=== F3b. A STATE WRITTEN BEFORE THE HEAD CHECK (no `heads`) IS ADOPTED, NOT CRASHED ON; A MISSED HEAD IS RE-TRIED")
reset()
write("2026-09-21", [obs("H1", "24h", "2026-09-21T10:00:00+00:00")])
st = {}
of.fold_observations(st, NOW)
old = dict(st["obs"])
old.pop("heads")
old.pop("rebuild_cause", None)
st_old2 = {"obs": old}
try:
    o7 = of.fold_observations(st_old2, NOW + timedelta(minutes=5))
    crashed = None
except Exception as exc:                       # noqa: BLE001 - a crash must be a FAIL line, not an abort
    o7, crashed = {}, exc
check("F3b a version-2 state with no `heads` folds without crashing and without a byte-0 rebuild (C-2)",
      crashed is None and o7.get("rebuilt_at") == old.get("rebuilt_at")
      and g(o7, "heads", "2026-09-21.jsonl") is not None, (crashed, o7.get("rebuilt_at"), o7.get("heads")))
st["obs"]["heads"]["2026-09-21.jsonl"] = None   # a head that could not be read at that instant
of.fold_observations(st, NOW + timedelta(minutes=6))
check("F3b a head recorded as None is re-tried next build, so the check is not disarmed for good (C-2)",
      g(st, "obs", "heads", "2026-09-21.jsonl") is not None, g(st, "obs", "heads"))

print(NL + "=== F4. HOURLY COUNTS: covered rows only, trailing 7 days, pruned")
reset()
recent = (NOW - timedelta(hours=2)).isoformat()
old = (NOW - timedelta(days=8)).isoformat()
write(NOW.strftime("%Y-%m-%d"), [obs("A", "1h", recent), obs("B", "1h", recent),
                                 {"mint": "C", "age": "1h", "observed_at": recent, "observed": False, "shed": "x"}])
write((NOW - timedelta(days=8)).strftime("%Y-%m-%d"), [obs("D", "1h", old)])
st = {}
o = of.fold_observations(st, NOW)
hk = (NOW - timedelta(hours=2)).strftime("%Y-%m-%dT%H")
check("F4 two covered rows in the recent hour, the shed row not counted, the 8-day-old hour not kept",
      o["hourly"] == {"1h": {hk: 2}}, o["hourly"])
check("F4 the job-liveness count holds the follow-up's rows of any shape (2 covered + 1 shed)",
      o["hourly_any"] == {hk: 3}, o["hourly_any"])
write(NOW.strftime("%Y-%m-%d"), [{"mint": "S", "age": "6h", "observed_at": recent, "observed": False,
                                  "reason": "scheduled_in_the_past", "due_at": recent}])
o = of.fold_observations(st, NOW)
check("F4 a scheduled_in_the_past row (the RECEIVER's) is NOT follow-up liveness (Langston CHANGE-3)",
      o["hourly_any"] == {hk: 3}, o["hourly_any"])
o = of.fold_observations(st, NOW + timedelta(days=7, hours=1))
check("F4 an hour older than 7 days is pruned on a later pass", o["hourly"] == {"1h": {}} and o["hourly_any"] == {},
      (o["hourly"], o["hourly_any"]))

print(NL + "=== F5. D1 COVERAGE: a day is uncovered if ANY due label has no covering row")
obs_state = {"by_day": {"1h": {"2026-11-10": {"covered": 5}, "2026-11-11": {"shed": 3}},
                        "6h": {"2026-11-10": {"covered": 5}, "2026-11-11": {"covered": 2}}}}
born = {"2026-11-10": 5, "2026-11-11": 4, "2026-11-12": 2, "2026-11-15": 1}
cov = of.coverage(obs_state, born, NOW)
check("F5 11-11: 6h covered, 1h only shed -> uncovered; 11-10 covered by 1h and 6h but 24h/3d have no row -> uncovered",
      cov["by_label"]["1h"]["uncovered_days"] == 2 and cov["by_label"]["6h"]["uncovered_days"] == 1
      and cov["uncovered_days"] == 3, cov)
check("F5 BLIND = every due checkpoint empty: only 11-12 (nothing at all); 11-10 and 11-11 each have one covered",
      cov["blind_days"] == 1 and cov["blind_first"] == "2026-11-12", cov)
check("F5 11-15 (today) has no label due for its whole day -> neither", "2026-11-15" not in
      [cov["by_label"][L]["first"] for L in cov["by_label"]], cov)
check("F5 7d is not yet due for 11-10 (ends 11-11 + 7d > now) and contributes nothing",
      cov["by_label"]["7d"]["uncovered_days"] == 0, cov["by_label"]["7d"])

print(NL + "=== F6. THE PUBLISHED SUMMARY CARRIES THE COVERAGE BLOCK (driven through summary.build, the production entry)")
reset()
import summary  # noqa: E402
from config import BIRTHS_DIR  # noqa: E402
os.makedirs(BIRTHS_DIR, exist_ok=True)
for day, n in (("2026-11-10", 3), ("2026-11-12", 2)):
    with open(os.path.join(BIRTHS_DIR, day + ".jsonl"), "w", encoding="utf-8", newline="") as fh:
        for i in range(n):
            fh.write(json.dumps({"mint": "%s-%d" % (day, i), "created_at": day + "T05:00:00+00:00"}) + NL)
write("2026-11-11", [obs("2026-11-10-0", "24h", "2026-11-11T05:10:00+00:00",
                         created_at="2026-11-10T05:00:00+00:00")])
store.save_state("follow_up_cursor", {"consumed_from": "2026-08-31T11", "last_bucket": "2026-11-15T10"})
p = summary.build(NOW)
c = p.get("coverage") or {}
check("F6 the block is published", bool(c), sorted(p))
check("F6 11-11 had no births: listed as such, not uncovered", c.get("no_births_days") == ["2026-11-11"], c.get("no_births_days"))
check("F6 both birth days are uncovered (1h, 6h, 3d have no row; 11-12 has nothing at all)", c.get("uncovered_days") == 2, c)
check("F6 and only 11-12 is BLIND (11-10 has its 24h)", c.get("blind_days") == 1, c)
check("F6 24h covers 11-10, so its uncovered list starts at 11-12",
      c.get("by_label", {}).get("24h", {}).get("first") == "2026-11-12", c.get("by_label", {}).get("24h"))
check("F6 the covering COUNT is published per day and label", c.get("covering_by_day") == {"2026-11-10": {"24h": 1}},
      c.get("covering_by_day"))
check("F6 the follow-up lag: cursor last_bucket 10:00 ends 11:00, now 12:30 -> 5400 s", c.get("follow_up_lag_s") == 5400,
      c.get("follow_up_lag_s"))
check("F6 observed_through and the exact split ride along", c.get("observed_through") == "2026-11-11T05:10:00+00:00"
      and c.get("birth_day_split") == {"exact": 1, "approximated": 0}, c)
st = store.load_state("summary", {})
check("F6 births per hour are kept for the trailing 7 days only (11-10 and 11-12 05:00 are inside it)",
      st.get("born_by_hour") == {"2026-11-10T05": 3, "2026-11-12T05": 2}, st.get("born_by_hour"))
store.save_state("follow_up_cursor", {"consumed_from": "2026-08-31T11"})
check("F6 an unreadable cursor publishes lag None, never 0",
      summary.build(NOW)["coverage"]["follow_up_lag_s"] is None)

print(NL + "%d passed, %d failed" % (PASS, FAIL))
shutil.rmtree(ROOT, ignore_errors=True)
sys.exit(1 if FAIL else 0)
