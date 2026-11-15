"""
token-watch — B-TOKEN-WATCH-FOLLOWUP-MEMORY P7 D2 and D4 (Langston r2 ruling): per checkpoint "is anyone looking",
the job-level verdict, the window derivation, and the oldest survivors' statuses.

Run:  python tests/test_p7_states.py        (exit 0 = every check passed)
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

ROOT = tempfile.mkdtemp(prefix="token-watch-p7s-", dir=os.path.expanduser("~"))
os.environ["TOKEN_WATCH_ROOT"] = ROOT
PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PKG)
sys.path.insert(0, os.path.join(PKG, "tools"))

import store  # noqa: E402
import obs_fold as of  # noqa: E402
import derive_obs_window as dw  # noqa: E402
from config import BIRTHS_DIR, OBSERVATIONS_DIR  # noqa: E402

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


def H(t):
    return t.strftime("%Y-%m-%dT%H")


def timer(text):
    p = os.path.join(ROOT, "t.timer")
    with open(p, "w", encoding="utf-8") as fh:
        fh.write(text)
    return p


os.makedirs(ROOT, exist_ok=True)

print(NL + "=== S1. THE CADENCE, AS systemd REPORTS IT (fold b; Langston part 2 C-A)")
SHOW = ("TimersCalendar={ OnCalendar=*-*-* *:00:00 ; next_elapse=(null) }" + NL + "RandomizedDelayUSec=5min" + NL
        + "LoadState=loaded" + NL)
check("S1 systemctl show's normalised hourly form + 5min -> a 3,900 s cycle (the form the box reports)",
      of.parse_cadence(SHOW) == {"on_calendar": "*-*-* *:00:00", "randomized_delay_s": 300, "cycle_s": 3900},
      of.parse_cadence(SHOW))
check("S1 the unit-file spelling 'hourly' + 300 is the same schedule",
      (of.parse_cadence("OnCalendar=hourly" + NL + "RandomizedDelaySec=300" + NL) or {}).get("cycle_s") == 3900)
check("S1 a fixed minute (the sibling summary timer's '*:12:00 UTC') is hourly too",
      (of.parse_cadence("TimersCalendar={ OnCalendar=*-*-* *:12:00 UTC ; next_elapse=x }" + NL
                        + "RandomizedDelayUSec=0" + NL + "LoadState=loaded") or {}).get("cycle_s") == 3600)
check("S1 a compound span '1min 30s' -> 90 s", (of.parse_cadence("OnCalendar=hourly" + NL + "RandomizedDelayUSec=1min 30s")
                                                or {}).get("randomized_delay_s") == 90)
check("S1 a period it does not understand -> None (unknown), never a guess",
      of.parse_cadence("OnCalendar=*:0/30" + NL) is None)
check("S1 an unloaded unit -> None", of.parse_cadence("RandomizedDelayUSec=0" + NL + "LoadState=not-found") is None)
check("S1 a unit not LOADED (masked) is None even when a calendar is shown",
      of.parse_cadence(SHOW.replace("LoadState=loaded", "LoadState=masked")) is None)
check("S1 a span it cannot read -> None", of.parse_cadence("OnCalendar=hourly" + NL + "RandomizedDelayUSec=5parsecs") is None)
check("S1 two calendars -> None", of.parse_cadence("OnCalendar=hourly" + NL + "OnCalendar=daily") is None)
CAD = {"on_calendar": "hourly", "randomized_delay_s": 300, "cycle_s": 3900}

print(NL + "=== S2. PER-CHECKPOINT STATES AND THE ONE JOB-LEVEL VERDICT")
first = NOW - timedelta(days=100)
born = {}
h = first.replace(minute=0)
while h <= NOW:
    born[H(h)] = 10
    h += timedelta(hours=1)
recent = [NOW.replace(minute=0) - timedelta(hours=i) for i in range(0, 3)]


def obs_with(cov=None, any_rows=None, last=None):
    o = of._empty()
    o["hourly"] = cov or {}
    o["hourly_any"] = any_rows or {}
    o["last_observed_at"] = last if last is not None else {L: "2026-11-01T00:00:00+00:00" for L in of.GRID_LABELS}
    return o


cov = {L: {H(t): 50 for t in recent} for L in ("1h", "6h", "24h", "3d", "7d", "30d", "90d")}
st = of.label_states(obs_with(cov, {H(t): 400 for t in recent}), born, first.isoformat(), NOW.isoformat(), None, CAD, NOW)
check("S2 healthy: job observing, every due checkpoint instrumented",
      st["job"]["state"] == "observing" and all(v["state"] == "instrumented" for v in st["labels"].values()), st)
check("S2 with no derived window the floor applies: K = 3, 11,700 s", st["labels"]["1h"]["k_cycles"] == 3
      and st["labels"]["1h"]["window_s"] == 11700, st["labels"]["1h"])
cov2 = dict(cov)
cov2["24h"] = {}
st = of.label_states(obs_with(cov2, {H(t): 400 for t in recent}), born, first.isoformat(), NOW.isoformat(), None, CAD, NOW)
check("S2 one checkpoint empty while the job observes others -> that checkpoint is stale, the rest instrumented",
      st["labels"]["24h"]["state"] == "stale" and st["labels"]["6h"]["state"] == "instrumented", st["labels"]["24h"])
st = of.label_states(obs_with({}, {}), born, first.isoformat(), NOW.isoformat(), None, CAD, NOW)
check("S2 no follow-up row at all -> job not_running, each checkpoint job_not_running (never N x stale)",
      st["job"]["state"] == "not_running" and {v["state"] for v in st["labels"].values()} == {"job_not_running"}, st)
st = of.label_states(obs_with({}, {H(t): 900 for t in recent}), born, first.isoformat(), NOW.isoformat(), None, CAD, NOW)
check("S2 follow-up rows but not one observation (all shed) -> job shedding, each checkpoint job_shedding",
      st["job"]["state"] == "shedding" and {v["state"] for v in st["labels"].values()} == {"job_shedding"}, st)
last = {L: "2026-11-01T00:00:00+00:00" for L in ("1h", "6h", "24h", "3d", "7d")}
st = of.label_states(obs_with(cov, {H(t): 400 for t in recent}, last), born, first.isoformat(), NOW.isoformat(),
                     None, CAD, NOW)
check("S2 a due checkpoint never observed at all -> never_instrumented (30d, 90d here)",
      st["labels"]["30d"]["state"] == "never_instrumented" and st["labels"]["90d"]["state"] == "never_instrumented",
      st["labels"]["30d"])
young = NOW - timedelta(days=10)
st = of.label_states(obs_with(cov, {H(t): 400 for t in recent}), born, young.isoformat(), NOW.isoformat(), None, CAD, NOW)
check("S2 first launch 10 days ago -> 30d and 90d not_yet_due, with the hour they first fall due",
      st["labels"]["30d"]["state"] == "not_yet_due" and st["labels"]["90d"]["first_due_at"]
      == (young + timedelta(days=90)).isoformat(), st["labels"]["90d"])
st = of.label_states(obs_with({}, {}), born, first.isoformat(), (NOW - timedelta(hours=5)).isoformat(), None, CAD, NOW)
check("S2 no launch recorded since 5 h ago -> the 1h checkpoint is unknown, NEVER instrumented (fold a)",
      st["labels"]["1h"]["state"] == "unknown" and st["labels"]["7d"]["state"] != "unknown", st["labels"]["1h"])
check("S2 and its reason names the condition that fires: a silent launch feed, not a lagging fold (Langston Q2)",
      st["labels"]["1h"].get("reason") == "feed_silent", st["labels"]["1h"])
gap = {k: (0 if k >= H(NOW - timedelta(hours=8)) and k <= H(NOW - timedelta(hours=1)) else v) for k, v in born.items()}
cov3 = dict(cov)
cov3["1h"] = {}
st = of.label_states(obs_with(cov3, {H(t): 400 for t in recent}), gap, first.isoformat(), NOW.isoformat(), None, CAD, NOW)
check("S2 nothing due in the window (no launches in the birth hours) -> instrumented, not stale",
      st["labels"]["1h"]["state"] == "instrumented" and st["labels"]["1h"]["due_in_window"] == 0, st["labels"]["1h"])
st = of.label_states(obs_with(cov), born, first.isoformat(), NOW.isoformat(), None, None, NOW)
check("S2 an unreadable cadence -> every checkpoint unknown", {v["state"] for v in st["labels"].values()} == {"unknown"})

print(NL + "=== S2c. LANGSTON CONDITIONS 1 AND 2: a job fault pages after a stated bound; K's basis travels with K")
check("C1 not_running while the timer is enabled -> exit JOB_FAULT_EXIT (4)",
      of.job_fault_exit_code({"state": "not_running", "window_s": 11700}, "enabled") == of.JOB_FAULT_EXIT == 4)
check("C1 shedding with the switch unreadable -> pages (unknown is treated as on, never off)",
      of.job_fault_exit_code({"state": "shedding", "window_s": 11700}, "unknown") == 4)
check("C1 a job switched OFF is a decision, published, not paged", of.job_fault_exit_code({"state": "not_running"},
                                                                                         "disabled") == 0)
check("C1 observing / no verdict -> 0", of.job_fault_exit_code({"state": "observing"}, "enabled") == 0
      and of.job_fault_exit_code(None, "enabled") == 0)
check("C1 an unreadable cadence PAGES with its own code (5), switch or no switch (part 2 C-A)",
      of.job_fault_exit_code({"state": "unknown", "reason": "x"}, "enabled") == of.CADENCE_UNKNOWN_EXIT == 5
      and of.job_fault_exit_code({"state": "unknown"}, "disabled") == 5)
st = of.label_states(obs_with({}, {}), born, first.isoformat(), NOW.isoformat(), None, CAD, NOW)
check("C1 the bound is published on the verdict: pages_after_s = the job window (3 cycles, 11,700 s)",
      st["job"].get("pages_after_s") == 11700, st["job"])
check("C2 with no derived window, every checkpoint's K says it is the floor and not derived",
      all(v.get("k_basis", {}).get("derived") is False and v["k_basis"].get("floor_bound") is True
          for v in st["labels"].values()), st["labels"]["1h"].get("k_basis"))
win = {"cadence": CAD, "labels": {"6h": {"k_cycles": 3, "window_s": 11700, "floor_bound": True,
                                         "observed_longest_run": 1, "beating_due_cycles": 643}}}
st = of.label_states(obs_with(cov, {H(t): 400 for t in recent}), born, first.isoformat(), NOW.isoformat(), win, CAD, NOW)
check("C2 with a derived window, its run, floor flag and cycles counted ride on the checkpoint",
      st["labels"]["6h"]["k_basis"] == {"derived": True, "floor_bound": True, "observed_longest_run": 1,
                                        "cycles_counted": 643, "counted": st["labels"]["6h"]["k_basis"]["counted"]},
      st["labels"]["6h"].get("k_basis"))

print(NL + "=== S2d. Q3: THE JOB IS JUDGED ON ITS OWN CADENCE -- job_not_running arrives BEFORE any checkpoint reads stale")
old = [NOW.replace(minute=0) - timedelta(hours=i) for i in range(5, 10)]      # the job died ~4.5 h ago
cov_old = {L: {H(t): 50 for t in old} for L in of.GRID_LABELS}
any_old = {H(t): 400 for t in old}
wide = {"cadence": CAD, "labels": {"7d": {"k_cycles": 10, "window_s": 39000, "floor_bound": False,
                                          "observed_longest_run": 8, "beating_due_cycles": 500}}}
st = of.label_states(obs_with(cov_old, any_old), born, first.isoformat(), NOW.isoformat(), wide, CAD, NOW)
check("Q3 one checkpoint calibrated wide (7d K = 10) does not slow the job verdict: not_running at the 3-cycle window",
      st["job"]["state"] == "not_running" and st["job"]["pages_after_s"] == 11700, st["job"])
check("Q3 so the short checkpoints read job_not_running, not N separate stale faults",
      st["labels"]["1h"]["state"] == "job_not_running" and st["labels"]["6h"]["state"] == "job_not_running",
      {L: v["state"] for L, v in st["labels"].items()})
check("Q3 and the wide checkpoint keeps its own window (still sees the old rows -> instrumented)",
      st["labels"]["7d"]["state"] == "instrumented" and st["labels"]["7d"]["window_s"] == 39000, st["labels"]["7d"])
quiet = {k: (0 if k >= H(NOW - timedelta(days=91)) else v) for k, v in born.items()}
st = of.label_states(obs_with({}, {}), quiet, first.isoformat(), NOW.isoformat(), None, CAD, NOW)
check("Q3 nothing due in the job window and no rows -> nothing_due: neither green nor a fault, and it does not page",
      st["job"]["state"] == "nothing_due" and of.job_fault_exit_code(st["job"], "enabled") == 0, st["job"])

print(NL + "=== S2e. C-B: THE UNIT'S EXIT COMBINES BOTH CODES AND ALWAYS RUNS THE JOB-FAULT CHECK (Langston part 2 condition)")
import summary as _sm  # noqa: E402
logged = []
_err = of.LOG.error
of.LOG.error = lambda *a, **k: logged.append(a[0] % a[1:] if len(a) > 1 else a[0])
try:
    dead_job = {"observation_states": {"job": {"state": "not_running", "window_s": 11700, "switch": "enabled"}}}
    rc_mem = _sm.final_exit_code(dead_job, 3)
    logged_mem = list(logged)                # what THIS call wrote, before the next call can write it
    rc_job = _sm.final_exit_code(dead_job, 0)
    rc_ok = _sm.final_exit_code({"observation_states": {"job": {"state": "observing", "switch": "enabled"}}}, 0)
finally:
    of.LOG.error = _err
check("C-B memory code set -> the unit exits 3, AND the job-fault line is still written",
      rc_mem == 3 and any("observed nothing for a whole window" in m for m in logged_mem), (rc_mem, logged_mem))
check("C-B no memory code -> the job fault's own code (4)", rc_job == 4, rc_job)
check("C-B neither -> 0", rc_ok == 0, rc_ok)

print(NL + "=== S2b. CHANGE-1: THE RE-DERIVATION TRIGGER IS A DUE-BUT-EMPTY RUN OF K - 1, while the job observed")
week = [NOW.replace(minute=0) - timedelta(hours=i) for i in range(1, 7 * 24)]
cov4 = {L: {H(t): 50 for t in week + recent} for L in of.GRID_LABELS}
for t in (NOW.replace(minute=0) - timedelta(hours=40), NOW.replace(minute=0) - timedelta(hours=41)):
    cov4["6h"].pop(H(t), None)
st = of.label_states(obs_with(cov4), born, first.isoformat(), NOW.isoformat(), None, CAD, NOW)
check("S2b a 2-hour empty run at 6h (K = 3) -> rederive_due", st["labels"]["6h"]["longest_recent_due_but_empty_run"] == 2
      and st["labels"]["6h"]["rederive_due"] is True, st["labels"]["6h"])
check("S2b and no other checkpoint flags", not any(v.get("rederive_due") for L, v in st["labels"].items() if L != "6h"))
cov4["6h"][H(NOW.replace(minute=0) - timedelta(hours=41))] = 50
st = of.label_states(obs_with(cov4), born, first.isoformat(), NOW.isoformat(), None, CAD, NOW)
check("S2b a 1-hour run does not", st["labels"]["6h"]["rederive_due"] is False, st["labels"]["6h"])
cov5 = {L: dict(v) for L, v in cov4.items()}
for L in cov5:
    for t in (NOW.replace(minute=0) - timedelta(hours=60), NOW.replace(minute=0) - timedelta(hours=61)):
        cov5[L].pop(H(t), None)
st = of.label_states(obs_with(cov5), born, first.isoformat(), NOW.isoformat(), None, CAD, NOW)
check("S2b two hours where NOTHING was observed are a job fault, not a checkpoint run: no flag",
      not any(v.get("rederive_due") for v in st["labels"].values()), {L: v.get("longest_recent_due_but_empty_run")
                                                                       for L, v in st["labels"].items()})

print(NL + "=== S3. D4 SURVIVOR STATUS (positive control in the same test: a member with rows, one without)")
settle = {L: 7200 for L in of.GRID_LABELS}         # NOT the production window, so a fallback cannot pass
born40 = (NOW - timedelta(days=40)).isoformat()
m7 = {"created_at": born40, "obs": {"7d": {"at": "x7", "alive": True}, "24h": {"at": "x1", "alive": True}}}
m30 = {"created_at": born40, "obs": {"7d": {"at": "x7", "alive": True}, "30d": {"at": "x30", "alive": True}}}
none = {"created_at": born40, "obs": {}}
r = of.survivor_status(born40, m7, settle, NOW)
check("S3 seen at 7d, 30d due and not seen -> unverified, last verified at 7d", r["status"] == "unverified"
      and r["last_verified_age"] == "7d" and r["latest_due_age"] == "30d", r)
check("S3 seen alive at 30d (its latest due) -> verified_alive", of.survivor_status(born40, m30, settle, NOW)["status"]
      == "verified_alive")
check("S3 a member with no observation -> never_observed", of.survivor_status(born40, none, settle, NOW)["status"]
      == "never_observed")
check("S3 a listed mint OUTSIDE the watch set -> unknown, never never_observed",
      of.survivor_status(born40, None, settle, NOW)["status"] == "unknown")
check("S3 no created_at on the birth row -> unknown", of.survivor_status(None, m7, settle, NOW)["status"] == "unknown")
check("S3 an unreadable cadence (settle None) -> unknown for every row, never a guessed cycle (part 2 C-A)",
      of.survivor_status(born40, m30, None, NOW)["status"] == "unknown")
just = (NOW - timedelta(days=7, hours=1)).isoformat()
r = of.survivor_status(just, {"obs": {"3d": {"at": "x", "alive": True}}}, settle, NOW)
check("S3 the clock is the birth's created_at: 7d fell due 1 h ago, inside its 2 h settle -> latest due is 3d",
      r["status"] == "verified_alive" and r["latest_due_age"] == "3d", r)
r = of.survivor_status(born40, {"obs": {"30d": {"at": "x", "alive": False}}}, settle, NOW)
check("S3 seen at its latest due point but not alive (and not tombstoned) -> unverified, never verified_alive",
      r["status"] == "unverified", r)

print(NL + "=== S4. THE WATCH SET IS SEEDED, KEPT AND REBUILT ONLY WHEN A REBUILD CAN CHANGE IT")
dead = set()
check("S4 none -> seeded", of.watch_needs_seed(None, dead, 2) == "seeded")
w = {"version": of.WATCH_VERSION, "members": {str(i): {} for i in range(5)}, "capped": True, "births_folded_at_seed": 9}
check("S4 enough not-dead members -> kept", of.watch_needs_seed(w, dead, 2, 9) is None)
check("S4 depleted below 2 x N and capped -> rebuilt", of.watch_needs_seed(w, {"0", "1"}, 2, 9) == "rebuilt")
w["capped"] = False
check("S4 depleted, NOT capped, nothing born since the seed -> kept (a re-seed would return the same set)",
      of.watch_needs_seed(w, {"0", "1"}, 2, 9) is None)
check("S4 depleted, not capped, launches folded since the seed (a COUNT, so a late launch older than the newest "
      "counts) -> rebuilt", of.watch_needs_seed(w, {"0", "1"}, 2, 10) == "rebuilt")
check("S4 prune_dead removes the dead members", of.prune_dead(w, {"0", "1"}) == 2 and sorted(w["members"]) == ["2", "3", "4"])

print(NL + "=== S5. THROUGH summary.build: statuses on the table, the set seeded once, the fold not re-read")
import summary  # noqa: E402
_real_cadence = of.read_cadence
of.read_cadence = lambda: CAD      # S5 runs with a READ cadence; the None case is tested on its own below
shutil.rmtree(ROOT, ignore_errors=True)
os.makedirs(ROOT)
store.ensure_dirs()
os.makedirs(BIRTHS_DIR, exist_ok=True)
os.makedirs(OBSERVATIONS_DIR, exist_ok=True)
day = (NOW - timedelta(days=40)).strftime("%Y-%m-%d")
with open(os.path.join(BIRTHS_DIR, day + ".jsonl"), "w", encoding="utf-8", newline="") as fh:
    for i, m in enumerate(("A", "B", "C", "D")):
        fh.write(json.dumps({"mint": m, "created_at": "%sT0%d:00:00+00:00" % (day, i)}) + NL)
obs_day = (NOW - timedelta(days=33)).strftime("%Y-%m-%d")
with open(os.path.join(OBSERVATIONS_DIR, obs_day + ".jsonl"), "w", encoding="utf-8", newline="") as fh:
    fh.write(json.dumps({"mint": "A", "age": "7d", "observed": True, "alive": True,
                         "observed_at": obs_day + "T01:10:00+00:00", "created_at": day + "T00:00:00+00:00"}) + NL)
d30 = (NOW - timedelta(days=10)).strftime("%Y-%m-%d")
with open(os.path.join(OBSERVATIONS_DIR, d30 + ".jsonl"), "w", encoding="utf-8", newline="") as fh:
    fh.write(json.dumps({"mint": "D", "age": "30d", "observed": True, "alive": False,
                         "observed_at": d30 + "T03:10:00+00:00", "created_at": day + "T03:00:00+00:00"}) + NL)
store.record_death("C", NOW - timedelta(days=39), "faded", "24h", {"pairs": 0}, created_at=day + "T02:00:00+00:00")
summary.OLDEST_N = 3
p1 = summary.build(NOW)
rows = {r["mint"]: r for r in p1["oldest_survivors"]}
check("S5 A seen at 7d, 30d due and unseen -> unverified; B never seen -> never_observed; C dead -> not listed; "
      "D seen at 30d NOT alive -> unverified (the fold carried alive=False onto the member)",
      rows.get("A", {}).get("status") == "unverified" and rows.get("B", {}).get("status") == "never_observed"
      and rows.get("D", {}).get("status") == "unverified" and rows["D"].get("last_verified_age") == "30d"
      and "C" not in rows, {m: r.get("status") for m, r in rows.items()})
s1 = p1["oldest_survivors_status"]
check("S5 counts and the oldest unverified age are published", s1["counts"] == {"never_observed": 1, "unverified": 2}
      and s1["oldest_unverified_age_days"] == max(rows["A"]["age_days"], rows["D"]["age_days"]), s1)
check("S5 seeded_at is stamped, rebuilt_at is not", s1["watch_set_seeded_at"] == NOW.isoformat()
      and s1["watch_set_rebuilt_at"] is None and s1["watch_set_size"] == 3, s1)
p2 = summary.build(NOW + timedelta(hours=1))
st2 = store.load_state("summary", {})
check("S5 a second build keeps the set (seeded_at unchanged, no rebuild) and does not re-read the fold",
      p2["oldest_survivors_status"]["watch_set_seeded_at"] == NOW.isoformat()
      and st2["obs"]["rebuilt_at"] == NOW.isoformat(), (p2["oldest_survivors_status"], st2["obs"]["rebuilt_at"]))
check("S5 the per-checkpoint block is published", "labels" in p2["observation_states"]
      and "job" in p2["observation_states"], sorted(p2["observation_states"]))
_sw = of.timer_switch
of.timer_switch = lambda: "disabled"
try:
    p2b = summary.build(NOW + timedelta(hours=1, minutes=30))
finally:
    of.timer_switch = _sw
check("S5 the timer's switch is published on the job verdict (the page says 'switched off', nothing pages)",
      p2b["observation_states"]["job"].get("switch") == "disabled", p2b["observation_states"]["job"])
check("S5 the build used the cadence it read (Langston's hypothesis: S5 had been ratifying the fallback)",
      p2b["observation_states"].get("cadence") == CAD, p2b["observation_states"].get("cadence"))
of.read_cadence = lambda: None
try:
    p2c = summary.build(NOW + timedelta(hours=1, minutes=40))
finally:
    of.read_cadence = lambda: CAD
rows_c = p2c["oldest_survivors"]
check("S5 cadence unreadable -> every checkpoint unknown, the job unknown, every survivor row unknown: ONE answer",
      {v["state"] for v in p2c["observation_states"]["labels"].values()} == {"unknown"}
      and p2c["observation_states"]["job"]["state"] == "unknown"
      and rows_c and all(r["status"] == "unknown" for r in rows_c), ({r["mint"]: r["status"] for r in rows_c},
                                                                      p2c["observation_states"]["job"]))
check("S5 and that build's exit code pages (5)", of.job_fault_exit_code(p2c["observation_states"]["job"],
                                                                        p2c["observation_states"]["job"].get("switch",
                                                                                                             "unknown")) == 5)
st2.pop("watch")
store.save_state("summary", st2)
T3 = NOW + timedelta(hours=2)
p3 = summary.build(T3)
rows3 = {r["mint"]: r for r in p3["oldest_survivors"]}
check("S5 a LOST watch set re-seeds (seeded_at moves - Langston's fold) AND its members' history is refilled: "
      "A is still unverified at 7d, not never_observed",
      p3["oldest_survivors_status"]["watch_set_seeded_at"] == T3.isoformat()
      and rows3.get("A", {}).get("status") == "unverified" and rows3["A"].get("last_verified_age") == "7d",
      (p3["oldest_survivors_status"], {m: r.get("status") for m, r in rows3.items()}))
summary.OLDEST_N = 100
of.read_cadence = _real_cadence

print(NL + "=== S5b. A STATE FROM THE PRE-P7 BIRTHS FOLD IS REBUILT, NOT EXTENDED (the P12 install's live finding)")
shutil.rmtree(ROOT, ignore_errors=True)
os.makedirs(ROOT)
store.ensure_dirs()
os.makedirs(BIRTHS_DIR, exist_ok=True)
old_day = (NOW - timedelta(days=40)).strftime("%Y-%m-%d")
with open(os.path.join(BIRTHS_DIR, old_day + ".jsonl"), "w", encoding="utf-8", newline="") as fh:
    for i in range(3):
        fh.write(json.dumps({"mint": "O%d" % i, "created_at": "%sT0%d:00:00+00:00" % (old_day, i)}) + NL)
# the state a pre-P7 summary.py leaves: counters and cursors at the end of every births file, no births_fold_version
pre = summary._fold({}, NOW)
for k in ("born_by_hour", "births_first_at", "births_through", "births_fold_version"):
    pre.pop(k, None)
store.save_state("summary", pre)
new_day = NOW.strftime("%Y-%m-%d")
with open(os.path.join(BIRTHS_DIR, new_day + ".jsonl"), "w", encoding="utf-8", newline="") as fh:
    fh.write(json.dumps({"mint": "N0", "created_at": new_day + "T11:00:00+00:00"}) + NL)
st5 = summary._fold(store.load_state("summary", {}), NOW)
check("S5b births_first_at is the FIRST launch on disk, not the first row since the last build",
      st5.get("births_first_at") == old_day + "T00:00:00+00:00", st5.get("births_first_at"))
check("S5b born_by_day counts every launch exactly once (rebuilt, not added to: 3 old + 1 new)",
      st5["born_by_day"] == {old_day: 3, new_day: 1}, st5["born_by_day"])
check("S5b the version is stamped, so the next build is incremental again",
      st5.get("births_fold_version") == summary.BIRTHS_FOLD_VERSION, st5.get("births_fold_version"))
st6 = summary._fold(st5, NOW)
check("S5b a second pass adds nothing (no double count)", st6["born_by_day"] == {old_day: 3, new_day: 1}, st6["born_by_day"])

print(NL + "=== S6. THE DERIVATION: shed-only hours are a job fault, K = 3 is recorded as a floor, written once")
shutil.rmtree(ROOT, ignore_errors=True)
os.makedirs(ROOT)
store.ensure_dirs()
os.makedirs(BIRTHS_DIR, exist_ok=True)
os.makedirs(OBSERVATIONS_DIR, exist_ok=True)
t0 = datetime(2026, 9, 1, 0, tzinfo=UTC)
with open(os.path.join(BIRTHS_DIR, "2026-09-01.jsonl"), "w", encoding="utf-8", newline="") as fh:
    for i in range(30):
        fh.write(json.dumps({"mint": "b%d" % i, "created_at": (t0 + timedelta(hours=i)).isoformat()}) + NL)
with open(os.path.join(OBSERVATIONS_DIR, "2026-09-01.jsonl"), "w", encoding="utf-8", newline="") as fh:
    for i in range(1, 20):          # 1h observations for hours 01..19
        fh.write(json.dumps({"mint": "b%d" % (i - 1), "age": "1h", "observed": True,
                             "observed_at": (t0 + timedelta(hours=i, minutes=3)).isoformat()}) + NL)
    for i in range(7, 20):          # 6h observations for hours 07..19, EXCEPT hour 12: a 1-hour run at 6h
        if i != 12:
            fh.write(json.dumps({"mint": "b%d" % (i - 6), "age": "6h", "observed": True,
                                 "observed_at": (t0 + timedelta(hours=i, minutes=4)).isoformat()}) + NL)
    for i in range(20, 26):         # hours 20..25: the job runs and sheds everything
        fh.write(json.dumps({"mint": "b%d" % (i - 1), "age": "1h", "observed": False, "shed": "x",
                             "observed_at": (t0 + timedelta(hours=i, minutes=3)).isoformat()}) + NL)
tp = timer("OnCalendar=hourly" + NL + "RandomizedDelaySec=300" + NL)
assert dw.main(["--timer", tp, "--apply"], now=NOW) == 0
w = store.load_state(of.WINDOW_STATE, {})
check("S6 the six shed-only hours are a job fault (counted there), not a 6-hour run at 1h",
      w["derived_from"]["job_shed_only_hours"] == 6 and w["labels"]["1h"]["observed_longest_run"] == 0, w["derived_from"])
check("S6 K = 3 and the file says the floor bound it", w["labels"]["1h"]["k_cycles"] == 3
      and w["labels"]["1h"]["floor_bound"] is True and w["labels"]["1h"]["window_s"] == 11700, w["labels"]["1h"])
check("S6 a 1-hour run at 6h still gives K = max(3, 1 + 2) = 3, and that is recorded as floor-bound (CHANGE-2)",
      w["labels"]["6h"]["observed_longest_run"] == 1 and w["labels"]["6h"]["k_cycles"] == 3
      and w["labels"]["6h"]["floor_bound"] is True, w["labels"]["6h"])
check("S6 a checkpoint never observed: floor, unmeasured, said so", w["labels"]["30d"]["observed_longest_run"] is None
      and w["labels"]["30d"]["floor_bound"] is True and w["labels"]["30d"]["note"], w["labels"]["30d"])
check("S6 a second --apply without --replace is REFUSED and the file is unchanged",
      dw.main(["--timer", tp, "--apply"], now=NOW + timedelta(days=1)) == 2
      and store.load_state(of.WINDOW_STATE, {})["derived_at"] == NOW.isoformat())
check("S6 --replace records the reason and the derivation it replaces",
      dw.main(["--timer", tp, "--apply", "--replace", "cadence changed"], now=NOW + timedelta(days=1)) == 0
      and store.load_state(of.WINDOW_STATE, {}).get("replaces") == {"derived_at": NOW.isoformat(),
                                                                    "reason": "cadence changed"})
check("S6 an unreadable cadence refuses", dw.main(["--timer", os.path.join(ROOT, "nope"), "--apply",
                                                   "--replace", "x"], now=NOW) == 2)

print(NL + "%d passed, %d failed" % (PASS, FAIL))
shutil.rmtree(ROOT, ignore_errors=True)
sys.exit(1 if FAIL else 0)
