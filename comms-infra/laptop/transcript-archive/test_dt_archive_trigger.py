#!/usr/bin/env python3
"""Tests for dt_archive_trigger (B-TRANSCRIPT-ARCHIVE P7). No server is touched: the alerts leg is a recording fake, the
archive run a stub. `python3 -I test_dt_archive_trigger.py` - exit 0 = all pass."""
import json
import os
import re
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
NOW = float(__import__("calendar").timegm((2026, 11, 7, 2, 0, 0)))      # 2026-11-07T02:00:00Z
# A COPY of the staging evidence gate's path:line rule (server/services/system-alerts.ts, isValidResolutionEvidence):
# a resolve whose evidence fails it is REFUSED, which would leave the scheduled check standing and fire a false alarm.
PATH_LINE = re.compile(r"[\w./-]*[./][\w./-]*:\d+")


def ok(name, cond, detail=None):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond or detail is None else "   [%r]" % (detail,)))
    if not cond:
        FAILS.append(name)


class Remote:
    """Records each alerts call AND whether the run lock was held at that moment (it must be: the lock covers the alert
    leg and the RUNS.log write, so the line the evidence cites cannot move under it)."""
    def __init__(self, fail=None, root=None):
        self.calls, self.fail, self.root, self.locked = [], fail, root, []

    def __call__(self, args, timeout=120):
        self.calls.append(list(args))
        if self.root:
            self.locked.append(os.path.exists(os.path.join(self.root, ".run.lock")))
        if self.fail and args[0] == self.fail:
            raise RuntimeError("ssh: connect to host 188.245.193.8 port 22: Connection timed out")
        return "{}"


def flag(args, name):
    return args[args.index("--" + name) + 1] if "--" + name in args else None


def runs(root):
    p = os.path.join(root, "RUNS.log")
    return open(p, encoding="utf-8").read().splitlines() if os.path.exists(p) else []


def fresh():
    d = tempfile.mkdtemp(prefix="dt-trig-")
    return d, os.path.join(d, "archive")


def bounded_sleep(limit=200, record=None):
    n = [0]

    def f(_s):
        n[0] += 1
        if record is not None:
            record.append(_s)
        if n[0] > limit:
            raise RuntimeError("slept %d times - the wait never gives up" % limit)
    return f


def night(*a, **kw):
    kw.setdefault("sleep", bounded_sleep())
    kw.setdefault("wait_s", 60)
    return call(tr.nightly, *a, **kw)


def call(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except Exception as e:  # noqa: BLE001 - an escape is reported as a failed check, never a crashed suite
        return ("escaped", "%s: %s" % (type(e).__name__, e))


print("1. a nightly success clears the key and schedules the never-ran check")
base, root = fresh()
rm = Remote(root=root)
res = night("p", root, "s", remote=rm, runner=lambda *a: (0, "ARCHIVE RUN OK — 3 raw files, 9 lines"), clock=lambda: NOW)
ok("the run lock is HELD through every alerts call (so the cited RUNS.log line cannot move)", rm.locked == [True, True], rm.locked)
ok("returns the run's result and no alert-leg failure", res == (0, "ARCHIVE RUN OK — 3 raw files, 9 lines", None), res)
ok("two calls: resolve-key, then add", [c[0] for c in rm.calls] == ["resolve-key", "add"], rm.calls)
if len(rm.calls) == 2:
    r, a = rm.calls
    ok("resolve-key names the key and the canonical actor", r[1] == tr.KEY and flag(r, "by") == "cc-infra", r)
    ev = flag(r, "evidence") or ""
    ok("the resolve evidence passes the gate's path:line rule (else the resolve is REFUSED)", bool(PATH_LINE.search(ev)), ev)
    ok("...and cites THIS attempt's RUNS.log line", ev.startswith("transcript-archive/RUNS.log:1 "), ev)
    ok("the check is scheduled DEADMAN_H ahead", flag(a, "triggers-at") == tr.utc(NOW + 26 * 3600), flag(a, "triggers-at"))
    ok("on the same dedupe key, as a warning health_check", flag(a, "dedupe-key") == tr.KEY and flag(a, "severity") == "warning"
       and flag(a, "category") == "health_check", a)
    ok("its title says what firing would mean", "has not succeeded since 2026-11-07T02:00:00Z" in (flag(a, "title") or ""), a)
    ok("it names the owner", json.loads(flag(a, "metadata") or "{}").get("owner") == "CC-INFRA", a)
ok("one RUNS.log line, the run's own", len(runs(root)) == 1 and "\tnightly\t0\tARCHIVE RUN OK" in runs(root)[0], runs(root))
ok("the lock is released", not os.path.exists(os.path.join(root, ".run.lock")))
rm2 = Remote()
night("p", root, "s", remote=rm2, runner=lambda *a: (0, "ARCHIVE RUN OK — 3 raw files, 1 lines"), clock=lambda: NOW)
ev2 = flag(rm2.calls[0], "evidence") if rm2.calls else ""
ok("a second run cites line 2, and line 2 IS that run", (ev2 or "").startswith("transcript-archive/RUNS.log:2 ")
   and "1 lines" in (runs(root) + ["", ""])[1], (ev2, runs(root)))
shutil.rmtree(base)

print("2. a nightly failure raises an ACTIVE alert now")
base, root = fresh()
rm = Remote()
res = night("p", root, "s", remote=rm, runner=lambda *a: (5, "ARCHIVE RUN FAILED — 1 file(s) refused: x"), clock=lambda: NOW)
ok("returns the failure", res[0] == 5, res)
ok("resolve-key first (else the scheduled check would dedupe the failure away), then add", [c[0] for c in rm.calls] == ["resolve-key", "add"], rm.calls)
if len(rm.calls) == 2:
    a = rm.calls[1]
    ok("active NOW, not scheduled", flag(a, "triggers-at") == tr.utc(NOW), flag(a, "triggers-at"))
    ok("title says FAILED with the exit code", "FAILED (exit 5)" in (flag(a, "title") or ""), a)
    ok("body carries the run's own line", "1 file(s) refused: x" in (flag(a, "body") or ""), a)
    ok("same dedupe key", flag(a, "dedupe-key") == tr.KEY, a)
shutil.rmtree(base)

print("3. the alert leg cannot reach staging")
base, root = fresh()
rm = Remote(fail="resolve-key")
res = night("p", root, "s", remote=rm, runner=lambda *a: (0, "ARCHIVE RUN OK — 1 raw files, 1 lines"), clock=lambda: NOW)
ok("the run's result is kept, the leg's failure returned", res[0] == 0 and res[2] and "Connection timed out" in res[2], res)
ok("RUNS.log says so on the run's own line", len(runs(root)) == 1 and "ALERT LEG FAILED" in runs(root)[0], runs(root))
ok("no add after a failed resolve", [c[0] for c in rm.calls] == ["resolve-key"], rm.calls)
shutil.rmtree(base)

print("4. another run holds the lock")
base, root = fresh()
os.makedirs(root)
open(os.path.join(root, ".run.lock"), "w").write("4242 2026-11-07T01:00:00Z\n")
rm, slept, ran = Remote(), [], []
res = night("p", root, "s", remote=rm, runner=lambda *a: ran.append(1) or (0, "x"), wait_s=60,
           sleep=bounded_sleep(record=slept), clock=lambda: NOW)
ok("nightly waits, then FAILS with exit 9 naming the lock", res[0] == 9 and ".run.lock" in res[1] and sum(slept) == 60, (res, slept))
ok("the run itself never started", ran == [])
ok("the failure is alerted", [c[0] for c in rm.calls] == ["resolve-key", "add"] and "FAILED (exit 9)" in (flag(rm.calls[-1], "title") or ""), rm.calls)
ok("the other run's lock is NOT removed", os.path.exists(os.path.join(root, ".run.lock"))
   and open(os.path.join(root, ".run.lock")).read().startswith("4242"))
if not os.path.exists(os.path.join(root, ".run.lock")):
    open(os.path.join(root, ".run.lock"), "w").write("4242 2026-11-07T01:00:00Z" + chr(10))   # restage it for the next check
ran = []
res = call(tr.precompact_run, "p", root, "s", runner=lambda *a: ran.append(1) or (0, "x"))
ok("precompact SKIPS while it is held, without running", res is None and ran == [] and "SKIPPED" in runs(root)[-1], (res, runs(root)))
ok("...and precompact did not take or remove it", open(os.path.join(root, ".run.lock")).read().startswith("4242")
   if os.path.exists(os.path.join(root, ".run.lock")) else False)
if os.path.exists(os.path.join(root, ".run.lock")):
    os.remove(os.path.join(root, ".run.lock"))
seq = []
res = night("p", root, "s", remote=rm, runner=lambda *a: (0, "ok"), wait_s=120,
           sleep=bounded_sleep(record=seq), clock=lambda: NOW)
ok("a free lock: no waiting at all", res[0] == 0 and seq == [], (res, seq))
shutil.rmtree(base)

print("5. a run that raises still ends on a result, and the lock is released")
base, root = fresh()


def boom(*a):
    raise PermissionError(13, "Permission denied", "x")


saved = tr.ar.run
tr.ar.run = boom
try:
    res = call(tr.run_once, "p", root, "s")
finally:
    tr.ar.run = saved
ok("run_once turns an escape into exit 8 and the FAILED line", res[0] == 8 and res[1].startswith("ARCHIVE RUN FAILED — unexpected PermissionError"), res)
res = night("p", root, "s", remote=Remote(), runner=boom, clock=lambda: NOW)
ok("even a runner that raises leaves no lock behind", not os.path.exists(os.path.join(root, ".run.lock")), res)
shutil.rmtree(base)

print("6. the PreCompact hook")
base, root = fresh()
spawned = []
rc = call(tr.precompact_hook, json.dumps({"session_id": "s", "transcript_path": "t", "trigger": "auto"}), root=root,
          spawn=spawned.append)
ok("returns 0 at once", rc == 0, rc)
ok("starts the run in the background, as precompact-run", len(spawned) == 1 and spawned[0][-1] == "precompact-run"
   and spawned[0][1] == "-I", spawned)
ok("records that it fired and which inputs it got (P7b: is transcript_path handed over?)",
   runs(root) and "precompact-hook" in runs(root)[-1] and "session_id,transcript_path,trigger" in runs(root)[-1], runs(root))


def nospawn(args):
    raise OSError(8, "Exec format error")


rc = call(tr.precompact_hook, "not json", root=root, spawn=nospawn)
ok("a spawn that fails still returns 0 (never blocks compaction) and is written down",
   rc == 0 and "COULD NOT START THE RUN" in runs(root)[-1], (rc, runs(root)))
ok("an unparseable input is recorded, not fatal", any("<unparseable stdin>" in l for l in runs(root)), runs(root))
code = call(tr.precompact_run, "p", root, "s", runner=lambda *a: (0, "ARCHIVE RUN OK — 1 raw files, 2 lines"))
ok("precompact-run logs its result and releases the lock", code == (0, "ARCHIVE RUN OK — 1 raw files, 2 lines")
   and "\tprecompact\t0\t" in runs(root)[-1] and not os.path.exists(os.path.join(root, ".run.lock")), (code, runs(root)))
shutil.rmtree(base)

print("7. the real remote call's shape (no ssh made)")
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
import shlex as _sh
try:                     # an unbalanced quote makes the parser raise: that IS the defect, reported as a failed check
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
