#!/usr/bin/env python3
"""Tests for dt_archive_trigger (B-TRANSCRIPT-ARCHIVE P7). No server is touched: the alerts queue is a FAKE STAGING that
keeps rows with addAlert's real dedupe rule (a non-resolved row on the key swallows a new add) and resolve-key's real
filter, and can fail any one call. `python3 -I test_dt_archive_trigger.py` - exit 0 = all pass."""
import calendar
import json
import os
import re
import shlex as _sh
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dt_archive_trigger as tr  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass
FAILS = []
NOW = float(calendar.timegm((2026, 11, 7, 2, 30, 0)))
DAY = 24 * 3600
# A COPY of the staging evidence gate's path:line rule (server/services/system-alerts.ts, isValidResolutionEvidence).
PATH_LINE = re.compile(r"[\w./-]*[./][\w./-]*:\d+")


def ok(name, cond, detail=None):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond or detail is None else "   [%r]" % (detail,)))
    if not cond:
        FAILS.append(name)


def flag(args, name):
    return args[args.index("--" + name) + 1] if "--" + name in args else None


class Staging:
    """Rows keyed like the real queue. fail_at: the 1-based index of the ONE call that raises (None = none). Records
    whether the run lock was held at each call (root given)."""
    def __init__(self, fail_at=None, root=None, fail_kind=None):
        self.rows, self.calls, self.fail_at, self.root, self.locked, self.fail_kind = [], [], fail_at, root, [], fail_kind

    def __call__(self, args, timeout=120):
        self.calls.append(list(args))
        if self.root:
            self.locked.append(os.path.exists(os.path.join(self.root, ".run.lock")))
        if self.fail_at == len(self.calls) or (self.fail_kind and args[0] == self.fail_kind):
            raise RuntimeError("ssh: connect to host 188.245.193.8 port 22: Connection timed out")
        if args[0] == "add":
            key = flag(args, "dedupe-key")
            if any(r["key"] == key and r["state"] != "resolved" for r in self.rows):
                return "{}"                                       # addAlert's dedupe: swallowed
            self.rows.append({"key": key, "state": "scheduled" if flag(args, "triggers-at") > tr.utc(self.now) else "active",
                              "title": flag(args, "title"), "body": flag(args, "body"), "at": flag(args, "triggers-at"),
                              "category": flag(args, "category"), "severity": flag(args, "severity")})
        elif args[0] == "resolve-key":
            if not PATH_LINE.search(flag(args, "evidence") or ""):
                raise RuntimeError("system-alerts resolve-key exit 1: resolution_evidence rejected")
            for r in self.rows:
                if r["key"] == args[1] and r["state"] != "resolved":
                    r["state"] = "resolved"
        return "{}"

    def armed(self):
        return [r for r in self.rows if r["key"].startswith(tr.DEADMAN_PREFIX) and r["state"] != "resolved"]

    def failing(self):
        return [r for r in self.rows if r["key"] == tr.FAIL_KEY and r["state"] != "resolved"]


EMPTY = {"title": "", "at": "", "category": "", "severity": "", "key": "", "body": "", "state": ""}


def a0(st):
    """The first armed check, or an empty row - a missing one FAILS the check that reads it, never crashes the suite."""
    return (st.armed() or [EMPTY])[0]


def runs(root):
    p = os.path.join(root, "RUNS.log")
    return open(p, encoding="utf-8").read().splitlines() if os.path.exists(p) else []


def fresh():
    d = tempfile.mkdtemp(prefix="dt-trig-")
    return d, os.path.join(d, "archive")


def call(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except Exception as e:  # noqa: BLE001 - an escape is reported as a failed check, never a crashed suite
        return ("escaped", "%s: %s" % (type(e).__name__, e))


def bounded_sleep(limit=200, record=None):
    n = [0]

    def f(_s):
        n[0] += 1
        if record is not None:
            record.append(_s)
        if n[0] > limit:
            raise RuntimeError("slept %d times - the wait never gives up" % limit)
    return f


OKRUN = lambda *a: (0, "ARCHIVE RUN OK — 3 raw files, 9 lines")      # noqa: E731
BADRUN = lambda *a: (5, "ARCHIVE RUN FAILED — 1 file(s) refused: x")  # noqa: E731


def night(st, root, t, runner=OKRUN, **kw):
    st.now = t
    kw.setdefault("sleep", bounded_sleep())
    kw.setdefault("wait_s", 60)
    return call(tr.nightly, "p", root, "s", remote=st, runner=runner, clock=lambda: t, **kw)


print("1. a clean success: arm first, resolve last")
base, root = fresh()
st = Staging(root=root)
r1 = night(st, root, NOW)
ok("first night: exit 0, no problem", r1 == (0, "ARCHIVE RUN OK — 3 raw files, 9 lines", None), r1)
ok("one never-ran check armed, +26 h, warning health_check", len(st.armed()) == 1 and a0(st)["at"] == tr.utc(NOW + 26 * 3600)
   and a0(st)["category"] == "health_check" and a0(st)["severity"] == "warning", st.rows)
ok("its title says what firing would mean", "has not succeeded since 2026-11-07T02:30:00Z" in a0(st)["title"], st.rows)
ok("first call is the ADD (arm first)", st.calls[0][0] == "add" and flag(st.calls[0], "dedupe-key").startswith(tr.DEADMAN_PREFIX), st.calls)
ok("the run lock is HELD at every alerts call", st.locked and all(st.locked), st.locked)
calls0 = len(st.calls)
r2 = night(st, root, NOW + DAY)
ok("second night: exit 0", r2[0] == 0 and r2[2] is None, r2)
ok("still exactly ONE armed check, the new one", len(st.armed()) == 1 and "2026-11-08T02:30:00Z" in a0(st)["title"], st.rows)
seq = [c[0] for c in st.calls[calls0:]]
ok("order: add the new check, THEN resolve the old one, then the failure key", seq == ["add", "resolve-key", "resolve-key"]
   and st.calls[calls0 + 1][1].startswith(tr.DEADMAN_PREFIX) and st.calls[calls0 + 2][1] == tr.FAIL_KEY, st.calls[calls0:])
ev = (flag(st.calls[calls0 + 1], "evidence") if len(st.calls) > calls0 + 1 else "") or ""
ok("evidence names the host and cites this night's own RUNS.log line", ev.startswith("laptop:~/.claude/transcript-archive/RUNS.log:2 ")
   and runs(root)[1].split("\t")[1] == "nightly", (ev, runs(root)))
ok("...and passes the gate's path:line rule", bool(PATH_LINE.search(ev)), ev)
ok("the state file holds only the live key", tr.read_state(root) == [a0(st)["key"]], tr.read_state(root))
ok("the run lock is released", not os.path.exists(os.path.join(root, ".run.lock")))
shutil.rmtree(base)

print("2. BLOCKER-1: a successful night may NEVER end with zero checks armed - every single-call failure")
SEQ_LEN = 3                       # a success night: add, resolve the older check, resolve the failure key
for i in range(1, SEQ_LEN + 1):
    base, root = fresh()
    st = Staging(root=root)
    night(st, root, NOW)                          # night 1 arms check A
    st.fail_at = len(st.calls) + i                # night 2: call i of its sequence fails
    r = night(st, root, NOW + DAY)
    ok("call %d of the success sequence fails -> at least one check still armed" % i, len(st.armed()) >= 1, st.rows)
    ok("call %d fails -> the nightly exits non-zero (10), never 0" % i, r[0] == 10 and r[2], r)
    ok("call %d fails -> RUNS.log has the run line AND an ALERT LEG FAILED line" % i,
       runs(root)[-2].split("\t")[1] == "nightly" and "ALERT LEG FAILED" in runs(root)[-1], runs(root))
    st.fail_at = None
    night(st, root, NOW + 2 * DAY)                # night 3: all calls work
    ok("call %d case: the next clean night converges to exactly one armed check" % i, len(st.armed()) == 1, st.rows)
    shutil.rmtree(base)

print("3. a failed night raises the failure alert and leaves the never-ran check alone")
base, root = fresh()
st = Staging(root=root)
night(st, root, NOW)
armed_before = [r["key"] for r in st.armed()]
c_before = len(st.calls)
r = night(st, root, NOW + DAY, runner=BADRUN)
ok("returns the run's own failure code", r[0] == 5, r)
ok("one ACTIVE failure alert carrying the run's line", len(st.failing()) == 1 and (st.failing() or [EMPTY])[0]["state"] == "active"
   and "1 file(s) refused: x" in (st.failing() or [EMPTY])[0]["body"] and "FAILED (exit 5)" in (st.failing() or [EMPTY])[0]["title"], st.rows)
ok("the never-ran check is untouched (a dark laptop after a failure still fires)", [r["key"] for r in st.armed()] == armed_before, st.rows)
ok("nothing resolved on a failed night (one call: the failure add)", [c[0] for c in st.calls[c_before:]] == ["add"]
   and flag(st.calls[c_before], "dedupe-key") == tr.FAIL_KEY, st.calls[c_before:])
night(st, root, NOW + 2 * DAY)
ok("the next success resolves the failure alert", st.failing() == [], st.rows)
st.fail_kind = "add"
r = night(st, root, NOW + 3 * DAY, runner=BADRUN)
ok("a failure alert that cannot be raised is reported (non-zero, logged)", r[0] == 5 and r[2] and "ALERT LEG FAILED" in runs(root)[-1], (r, runs(root)))
shutil.rmtree(base)

print("4. CONDITION-1: the cited line is the nightly's own, even with a PreCompact skip landing mid-leg")
base, root = fresh()
st = Staging(root=root)
night(st, root, NOW)
orig = st.__call__


class Interleaved(Staging):
    def __call__(self, args, timeout=120):
        tr.log_line(root, "precompact", "-", "SKIPPED — a run is already in progress")   # a compaction lands here
        return Staging.__call__(self, args, timeout)


st2 = Interleaved(root=root)
st2.rows = st.rows
night(st2, root, NOW + DAY)
ev = [flag(c, "evidence") for c in st2.calls if c[0] == "resolve-key"]
m = re.search(r"RUNS\.log:(\d+) ", ev[0] or "") if ev else None
cited = int(m.group(1)) if m else 0
lines = runs(root)
ok("the cited line IS a nightly line (not the interleaved skip)", cited and lines[cited - 1].split("\t")[1] == "nightly"
   and "2026-11-08" in flag(st2.calls[0], "title"), (ev, lines))
ok("log_line returns the number it wrote", tr.log_line(root, "x", "-", "y") == len(runs(root)), runs(root))
shutil.rmtree(base)

print("5. the state file")
base, root = fresh()
os.makedirs(root)
open(os.path.join(root, ".alert-state.json"), "w").write("{not json")
st = Staging(root=root)
r = night(st, root, NOW)
ok("a corrupt state still ARMS the new check", len(st.armed()) == 1, st.rows)
ok("...and is reported, not read as empty", r[0] == 10 and "NOT resolved" in (r[2] or ""), r)
ok("...and the corrupt file is kept aside for the human", any(f.startswith(".alert-state.json.unreadable-") for f in os.listdir(root)), os.listdir(root))
r = call(tr.read_state, root)
ok("the fresh state is readable again", r == [a0(st)["key"]], r)
open(os.path.join(root, ".alert-state.json"), "w").write(json.dumps({"deadman_keys": ["somebody-else"]}))
r = call(tr.read_state, root)
ok("a state naming a foreign key is refused, not trusted", isinstance(r, tuple) and r[0] == "escaped", r)
shutil.rmtree(base)

print("6. the run lock")
base, root = fresh()
os.makedirs(root)
open(os.path.join(root, ".run.lock"), "w").write("4242 2026-11-07T01:00:00Z" + chr(10))
st, slept, ran = Staging(root=root), [], []
r = night(st, root, NOW, runner=lambda *a: ran.append(1) or (0, "x"), sleep=bounded_sleep(record=slept))
ok("nightly waits, then FAILS with exit 9 naming the lock", r[0] == 9 and ".run.lock" in r[1] and sum(slept) == 60, (r, slept))
ok("the run itself never started", ran == [])
ok("the failure is alerted", len(st.failing()) == 1 and "FAILED (exit 9)" in (st.failing() or [EMPTY])[0]["title"], st.rows)
ok("the other run's lock is NOT removed", os.path.exists(os.path.join(root, ".run.lock"))
   and open(os.path.join(root, ".run.lock")).read().startswith("4242"))
if not os.path.exists(os.path.join(root, ".run.lock")):
    open(os.path.join(root, ".run.lock"), "w").write("4242 2026-11-07T01:00:00Z" + chr(10))
ran = []
r = call(tr.precompact_run, "p", root, "s", runner=lambda *a: ran.append(1) or (0, "x"), clock=lambda: NOW)
ok("precompact SKIPS while it is held, without running", r is None and ran == [] and "already in progress" in runs(root)[-1], (r, runs(root)))
ok("...and did not take or remove it", os.path.exists(os.path.join(root, ".run.lock"))
   and open(os.path.join(root, ".run.lock")).read().startswith("4242"))
if os.path.exists(os.path.join(root, ".run.lock")):
    os.remove(os.path.join(root, ".run.lock"))
seq = []
r = night(st, root, NOW, sleep=bounded_sleep(record=seq))
ok("a free lock: no waiting at all", r[0] == 0 and seq == [], (r, seq))


def boom(*a):
    raise PermissionError(13, "Permission denied", "x")


saved = tr.ar.run
tr.ar.run = boom
try:
    r = call(tr.run_once, "p", root, "s")
finally:
    tr.ar.run = saved
ok("run_once turns an escape into exit 8 and the FAILED line", r[0] == 8 and r[1].startswith("ARCHIVE RUN FAILED — unexpected PermissionError"), r)
r = night(Staging(root=root), root, NOW, runner=boom)
ok("even a runner that raises leaves no lock behind", not os.path.exists(os.path.join(root, ".run.lock")), r)
shutil.rmtree(base)

print("7. the PreCompact floor and run")
base, root = fresh()
os.makedirs(root)
tr.log_line(root, "nightly", 0, "ARCHIVE RUN OK")
t_ok = tr.last_success(root)
ran = []
r = call(tr.precompact_run, "p", root, "s", runner=lambda *a: ran.append(1) or (0, "x"), clock=lambda: t_ok + 10 * 60)
ok("a success 10 min ago: SKIPPED, logged, not run", r is None and ran == [] and "under 30 min ago" in runs(root)[-1], (r, runs(root)))
r = call(tr.precompact_run, "p", root, "s", runner=lambda *a: ran.append(1) or (0, "ARCHIVE RUN OK — 1 raw files, 2 lines"),
         clock=lambda: t_ok + 31 * 60)
ok("a success 31 min ago: runs, logs, releases the lock", r == (0, "ARCHIVE RUN OK — 1 raw files, 2 lines") and ran == [1]
   and "\tprecompact\t0\t" in runs(root)[-1] and not os.path.exists(os.path.join(root, ".run.lock")), (r, runs(root)))
with open(os.path.join(root, "RUNS.log"), "a", encoding="utf-8", newline=chr(10)) as fh:   # a FAILED run, 1 h LATER
    fh.write("%s\tnightly\t5\tARCHIVE RUN FAILED\n" % tr.utc(t_ok + 3600))
ok("a FAILED run is not a success for the floor", tr.last_success(root) == t_ok, (tr.last_success(root), t_ok))
ran = []
r = call(tr.precompact_run, "p", root, "s", runner=lambda *a: ran.append(1) or (0, "x"), clock=lambda: t_ok + 3600 + 5 * 60)
ok("...so a failure 5 min ago does not suppress the PreCompact run", ran == [1], (r, runs(root)))
shutil.rmtree(base)

print("8. the PreCompact hook")
base, root = fresh()
spawned = []
rc = call(tr.precompact_hook, json.dumps({"session_id": "s", "transcript_path": "t", "trigger": "auto"}), root=root,
          spawn=spawned.append)
ok("returns 0 at once", rc == 0, rc)
ok("starts the run in the background, as precompact-run", len(spawned) == 1 and spawned[0][-1] == "precompact-run"
   and spawned[0][1] == "-I", spawned)
ok("spawns ITS OWN file (so registering the installed copy runs the installed copy)",
   spawned and os.path.normcase(spawned[0][2]) == os.path.normcase(os.path.abspath(tr.__file__)), spawned)
ok("records that it fired and which inputs it got (P7b)", runs(root) and "session_id,transcript_path,trigger" in runs(root)[-1], runs(root))


def nospawn(args):
    raise OSError(8, "Exec format error")


rc = call(tr.precompact_hook, "not json", root=root, spawn=nospawn)
ok("a spawn that fails still returns 0 and is written down", rc == 0 and "COULD NOT START THE RUN" in runs(root)[-1], (rc, runs(root)))
ok("an unparseable input is recorded, not fatal", any("<unparseable stdin>" in l for l in runs(root)), runs(root))
shutil.rmtree(base)

print("9. the real remote call's shape (no ssh made)")
seen = []
saved = tr.subprocess.run


class P:
    returncode, stdout, stderr = 0, b"{}", b""


tr.subprocess.run = lambda cmd, **kw: seen.append(cmd) or P()
try:
    call(tr.remote_alerts, ["add", "--title", "it's a test; $(rm -rf /)"])
finally:
    tr.subprocess.run = saved
ok("ssh in batch mode to staging", seen and seen[0][:5] == ["ssh", "-o", "ConnectTimeout=15", "-o", "BatchMode=yes"]
   and seen[0][5] == tr.STAGING, seen)
try:
    outer = _sh.split(seen[0][-1]) if seen else []
    inner = _sh.split(outer[-1]) if len(outer) == 5 else []
except ValueError as e:
    outer, inner = ["unparseable: %s" % e], []
ok("parsed by BOTH remote shells, the arguments come out exactly as given", outer[:4] == ["su", "-", "deploy", "-c"]
   and inner[-3:] == ["add", "--title", "it's a test; $(rm -rf /)"], (outer, inner))
tr.subprocess.run = lambda cmd, **kw: type("F", (), {"returncode": 1, "stdout": b"", "stderr": b"refused"})()
try:
    r = call(tr.remote_alerts, ["resolve-key", "k"])
finally:
    tr.subprocess.run = saved
ok("a non-zero exit RAISES with the reason (never a quiet success)", isinstance(r, tuple) and r[0] == "escaped"
   and "refused" in r[1], r)

print("\n%d failed" % len(FAILS))
sys.exit(1 if FAILS else 0)
