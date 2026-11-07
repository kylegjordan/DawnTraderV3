#!/usr/bin/env python3
"""Tests for dt_archive_run (B-TRANSCRIPT-ARCHIVE P7, the run every trigger calls). The REAL producer runs for every
"machine" on this laptop (host None, a stdin pipe) against planted secret files, so the key handoff and the layer (c)
redaction are exercised end to end; no server is touched. `python3 -I test_dt_archive_run.py` - exit 0 = all pass."""
import json
import os
import shutil
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dt_archive_run as ar  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass
FAILS = []


def ok(name, cond, detail=None):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond or detail is None else "   [%r]" % (detail,)))
    if not cond:
        FAILS.append(name)


SECRET = "Sh" + "4peless9Val7ue2Kq8"
SID = "0fe1c46a-a390-40b1-92b3-b160c6024f60"


def tree():
    base = tempfile.mkdtemp(prefix="dt-run-")
    proj, root, shared = (os.path.join(base, x) for x in ("projects", "archive", "shared"))
    os.makedirs(os.path.join(proj, "C--DawnTraderV3-new"))
    os.makedirs(root)
    os.makedirs(shared)
    open(os.path.join(proj, "C--DawnTraderV3-new", SID + ".jsonl"), "w", newline="\n").write(
        json.dumps({"type": "user", "uuid": "u1", "timestamp": "2026-11-06T10:00:00Z",
                    "message": {"content": "the value is " + SECRET + " ok"}}) + "\n")
    env = os.path.join(base, "app.env")
    open(env, "w").write("FRED_API_KEY=%s\n" % SECRET)
    machines = {"one": (None, ["--env", env, "--names", "FRED_API_KEY"]),
                "two": (None, ["--file", "SOME_KEY=" + os.path.join(base, "k")])}
    open(os.path.join(base, "k"), "w").write("Zz" + "9Yy8Xx7Ww6Vv5Uu4\n")
    return base, proj, root, shared, machines


def run_(*a, **kw):
    """ar.run, with an escape turned into a FAILED result: run() promises never to raise for an expected failure,
    and a fresh tree (no .state yet) is every first run - an escape there must fail a check, not crash the suite."""
    try:
        return ar.run(*a, **kw)
    except Exception as e:  # noqa: BLE001
        return "escaped", "%s: %s" % (type(e).__name__, e)


SEEN = []


def spy(host, args, copy):
    SEEN.append((host, list(args), copy))
    return ar.run_machine(host, args, copy)


print("1. a clean run")
base, proj, root, shared, machines = tree()
code, line = run_(proj, root, shared, machines=machines, runner=spy)
ok("exit 0 and the OK line", code == 0 and line.startswith("ARCHIVE RUN OK") and "layer (c) 2 values" in line, line)
day = os.path.join(root, "CC-B", "2026-11-06_0fe1c46a.md")
t = open(day, encoding="utf-8").read() if os.path.exists(day) else ""
ok("the shapeless secret is redacted by the fingerprints the run fetched (layer c, end to end)",
   SECRET not in t and "[REDACTED value:FRED_API_KEY]" in t and "values: ON, 2 value(s) loaded" in t, t[:400])
ok("the index was built", os.path.exists(os.path.join(root, "INDEX.md")) and os.path.exists(os.path.join(shared, "TRANSCRIPT_INDEX.md")))
keyhex = [c.split(b'RUN_KEY_HEX = "')[1][:64] for _h, _a, c in SEEN]
k1 = keyhex[0] if keyhex else None    # no machine reached (the run escaped first): every key check FAILS, never crashes
ok("every machine got the SAME key, in the streamed copy", k1 is not None and len(set(keyhex)) == 1 and len(k1) == 64)
ok("the key is never on any command line", k1 is not None and all(k1.decode() not in " ".join(a) for _h, a, _c in SEEN))
ok("the key is written nowhere under the archive or the shared folder", k1 is not None and
   all(k1 not in open(os.path.join(dp, f), "rb").read() for d in (root, shared) for dp, _x, fs in os.walk(d) for f in fs))
SEEN.clear()
code2, _l = run_(proj, root, shared, machines=machines, runner=spy)
k2 = SEEN[0][2].split(b'RUN_KEY_HEX = "')[1][:64] if SEEN else None
ok("a second run uses a DIFFERENT throwaway key", code2 == 0 and k1 is not None and k2 not in (None, k1))
shutil.rmtree(base)

print("2. fails loud")
base, proj, root, shared, machines = tree()
machines["two"] = (None, ["--file", "SOME_KEY=" + os.path.join(base, "missing")])
code, line = run_(proj, root, shared, machines=machines)
ok("one machine that cannot answer -> exit 3, nothing archived", code == 3 and "fingerprints incomplete" in line
   and "two" in line and not os.path.exists(os.path.join(root, "CC-B")), line)
shutil.rmtree(base)
base, proj, root, shared, machines = tree()
open(os.path.join(proj, "C--DawnTraderV3-new", SID[:8] + "-ffff-ffff-ffff-ffffffffffff.jsonl"), "w").write("")
code, line = run_(proj, root, shared, machines=machines)
ok("a name collision -> exit 4", code == 4 and "collision" in line, line)
shutil.rmtree(base)
base, proj, root, shared, machines = tree()
code, _l = run_(proj, root, shared, machines=machines)
sps = [os.path.join(dp, f) for dp, _d, fs in os.walk(os.path.join(root, ".state")) for f in fs if f.endswith(".json")]
ok("the setup run for the lock checks left a state file", code == 0 and len(sps) == 1, (code, _l, sps))
if sps:                       # without one the two lock checks below cannot be staged: the line above already FAILED
    sp = sps[0]
    open(sp + ".lock", "w").write("123 2026-11-01T00:00:00Z\n")
    code, line = run_(proj, root, shared, machines=machines)
    ok("a FRESH lock -> that file refused, exit 5", code == 5 and "refused" in line, line)
    old = time.time() - 26 * 3600
    os.utime(sp + ".lock", (old, old))
    code, line = run_(proj, root, shared, machines=machines)
    ok("a lock OLDER than one interval -> exit 6, naming it and what a human must do", code == 6 and sp + ".lock" in line
       and "confirm no run is alive" in line, line)
shutil.rmtree(base)
base, proj, root, shared, machines = tree()
os.makedirs(os.path.join(proj, "C--DawnTraderV3-old"))           # present, but no conversations in it
code, line = run_(proj, root, shared, machines=machines)
ok("a session folder present but EMPTY -> exit 7, naming it, nothing archived", code == 7 and "C--DawnTraderV3-old" in line
   and not os.path.exists(os.path.join(root, "CC-B")), line)
shutil.rmtree(base)
# Langston P10 counts leg: a Dawn Trader folder holding a conversation that is neither archived nor excluded is LOUD
NEWDT = "C--DawnTraderV3-sixth"
for label, folder, rel, want in (
        ("a NEW Dawn Trader folder holding a conversation -> exit 7, naming it", NEWDT, "s.jsonl", 7),
        ("...the name test is case-blind", "G--My-Drive-dawn-trader-copy", "s.jsonl", 7),
        ("...a conversation only in a nested folder still counts", NEWDT, "x/subagents/agent-1.jsonl", 7),
        ("...a .jsonl only under memory\\ does not", NEWDT, "memory/m.jsonl", 0),
        ("...an EMPTY Dawn Trader folder stays quiet", NEWDT, None, 0),
        ("...an EXCLUDED folder holding conversations stays quiet, and is not archived", "C--DawnTraderV3", "s.jsonl", 0),
        ("...one of Kyle's other projects stays quiet, and is never read", "G--My-Drive-Kasia-Projects", "s.jsonl", 0)):
    base, proj, root, shared, machines = tree()
    os.makedirs(os.path.join(proj, folder))
    if rel:
        p = os.path.join(proj, folder, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, "w", newline="\n").write(json.dumps({"type": "user", "uuid": "z9", "timestamp": "2026-11-06T11:00:00Z",
                                                      "message": {"content": "UNMAPPED-MARKER"}}) + "\n")
    code, line = run_(proj, root, shared, machines=machines)
    arch = "".join(open(os.path.join(r, f), encoding="utf-8").read() for r, _d, fs in os.walk(root) for f in fs
                   if f.endswith(".md"))
    ok(label, code == want and (want == 0 or folder in line) and "UNMAPPED-MARKER" not in arch, (code, line))
    shutil.rmtree(base)
# Langston P10 review C-1: the GATED folder's counts are ALWAYS on the result line - empty, machine-only, kept
HBF = "G--My-Drive-Dawn-Trader"
SCHED = {"type": "user", "uuid": "g1", "timestamp": "2026-11-06T09:00:00Z",
         "message": {"content": '<scheduled-task name="wake-watcher-heartbeat">x</scheduled-task>'}}
HUMAN = {"type": "user", "uuid": "g2", "timestamp": "2026-11-06T09:01:00Z", "message": {"content": "please stop"}}
for label, entries, want in (("C-1: no heartbeat folder at all -> `HEARTBEAT: 0 of 0`", None, "HEARTBEAT: 0 of 0 runs"),
                             ("C-1: a heartbeat folder present but EMPTY -> `0 of 0`, said out loud", [], "HEARTBEAT: 0 of 0 runs"),
                             ("C-1: a machine-only run -> `0 of 1`, distinct from the empty line", [SCHED], "HEARTBEAT: 0 of 1 runs"),
                             ("C-1: a run holding a human turn -> `1 of 1`", [SCHED, HUMAN], "HEARTBEAT: 1 of 1 runs")):
    base, proj, root, shared, machines = tree()
    if entries is not None:
        os.makedirs(os.path.join(proj, HBF))
        if entries:
            open(os.path.join(proj, HBF, "b2000000-0000-0000-0000-000000000000.jsonl"), "w", newline="\n").write(
                "".join(json.dumps(e) + "\n" for e in entries))
    code, line = run_(proj, root, shared, machines=machines)
    ok(label, code == 0 and want in line, line)
    shutil.rmtree(base)
# Langston P10 r4: the QUIET class - named in the run line and the laptop index, a COUNT in the git-mirrored copy
OTHER = "G--My-Drive-Kasia-Projects"
base, proj, root, shared, machines = tree()
os.makedirs(os.path.join(proj, OTHER))
open(os.path.join(proj, OTHER, "s.jsonl"), "w").write("{}\n")
code, line = run_(proj, root, shared, machines=machines)
idx, lean = (open(os.path.join(d, f), encoding="utf-8").read() if os.path.exists(os.path.join(d, f)) else ""
             for d, f in ((root, "INDEX.md"), (shared, "TRANSCRIPT_INDEX.md")))
ok("a folder on no list -> exit 0, NAMED in the result line", code == 0 and "1 folder(s) on no list: " + OTHER in line, line)
ok("...named in the laptop-local index", OTHER in idx, idx[:600])
ok("...the git-mirrored index carries a COUNT and never the name", OTHER not in lean and "1 folder(s) on no list" in lean, lean[:600])
ok("...both indexes state the coverage bound", "COVERAGE, and its bound" in idx and "COVERAGE, and its bound" in lean)
open(os.path.join(root, "outside-folders.txt"), "w", encoding="utf-8").write("# Kyle's other work\n%s\tKasia's project\n" % OTHER)
code, line = run_(proj, root, shared, machines=machines)
ok("once it is on the laptop-local outside list, it is no longer named", code == 0 and "on no list" not in line, line)
open(os.path.join(root, "outside-folders.txt"), "a", encoding="utf-8").write("C--DawnTraderV3-sixth\ttrying to quiet it\n")
code, line = run_(proj, root, shared, machines=machines)
ok("a Dawn Trader name on the outside list is REFUSED (exit 7) - the list can never mute the loud class",
   code == 7 and "C--DawnTraderV3-sixth" in line and "never quiet" in line, line)
shutil.rmtree(base)
base, proj, root, shared, machines = tree()
code, line = run_(proj, root, shared, dry=True, machines=machines)
ok("a dry run -> OK, and the archive and shared folders stay empty", code == 0 and "dry run" in line
   and os.listdir(root) == [] and os.listdir(shared) == [], (line, os.listdir(root)))
shutil.rmtree(base)
print("3. Langston P5 r4: the run's own reach, and the last line is always one of the two")
import io as _io, contextlib as _cl


def main_out(argv):
    buf = _io.StringIO()
    try:
        with _cl.redirect_stdout(buf):
            code = ar.main(argv)
    except Exception as e:      # noqa: BLE001 - an escape from main IS the failure under test, reported, not crashed
        return "escaped", "%s: %s" % (type(e).__name__, e)
    return code, buf.getvalue()


base, proj, root, shared, machines = tree()
code, _l = run_(proj, root, shared, machines=machines)
real_walk = ar.os.walk


def blind(top, onerror=None, **kw):
    if onerror and ".state" in str(top):
        onerror(PermissionError(13, "Permission denied", top))
        return iter(())
    return real_walk(top, onerror=onerror, **kw)


ar.os.walk = blind
try:
    try:
        ar.old_locks(root, time.time())
        ok("an unreadable lock folder RAISES, never reads as 'no stale lock'", False)
    except OSError as e:
        ok("an unreadable lock folder RAISES, never reads as 'no stale lock'", "cannot read the lock folder" in str(e), str(e))
finally:
    ar.os.walk = real_walk
try:
    fresh = ar.old_locks(os.path.join(base, "fresh"), time.time())
except OSError as e:
    fresh = e
ok("a missing .state (no archive yet) is no locks, never a failure", fresh == [], fresh)
saved = dict(ar.MACHINES)
ar.MACHINES.clear()
ar.MACHINES.update(machines)
try:
    ar.os.walk = blind
    try:
        code, out = main_out(["x", "--projects", proj, "--root", root, "--shared", shared])
    finally:
        ar.os.walk = real_walk
    ok("main: an unreadable lock folder ends with ARCHIVE RUN FAILED (exit 8), never a traceback",
       code == 8 and out.strip().split("\n")[-1].startswith("ARCHIVE RUN FAILED — unexpected"), out)
    code, out = main_out(["x", "--projects", proj, "--root", root, "--shared", os.path.join(base, "no-such-shared")])
    ok("main: a missing shared folder ends with ARCHIVE RUN FAILED (exit 8)",
       code == 8 and out.strip().split("\n")[-1].startswith("ARCHIVE RUN FAILED"), out)
    code, out = main_out(["x", "--projects", proj, "--root", root, "--shared", shared])
    ok("main: a clean run ends with ARCHIVE RUN OK (exit 0)", code == 0 and out.strip().split("\n")[-1].startswith("ARCHIVE RUN OK"), out)
finally:
    ar.MACHINES.clear()
    ar.MACHINES.update(saved)
shutil.rmtree(base)

# Langston's cap ruling (2026-11-07): the shared index has NO cap; its size is on the OK line on every run
base, proj, root, shared, machines = tree()
code, line = run_(proj, root, shared, machines=machines)
sz = os.path.getsize(os.path.join(shared, "TRANSCRIPT_INDEX.md")) if os.path.exists(os.path.join(shared, "TRANSCRIPT_INDEX.md")) else -1
ok("the OK line carries the shared index's size, and it is the file's real size",
   code == 0 and ("shared index %d bytes" % sz) in line, (code, line, sz))
code, line = run_(proj, root, shared, dry=True, machines=machines)
ok("...a dry run builds no index, so it claims no size", code == 0 and "shared index" not in line, line)
shutil.rmtree(base)

print("4. a raw file rewritten in place is RE-READ, and the result line says so")
base, proj, root, shared, machines = tree()
code, line = run_(proj, root, shared, machines=machines)
rawp = os.path.join(proj, "C--DawnTraderV3-new", SID + ".jsonl")
open(rawp, "w", newline="\n").write(json.dumps({"type": "user", "uuid": "u1", "timestamp": "2026-11-06T10:00:00Z",
                                                "message": {"content": "short"}}) + "\n")
code, line = run_(proj, root, shared, machines=machines)
ok("the OK line names the re-read file", code == 0 and ("1 REREAD after an in-place rewrite: " + SID + ".jsonl") in line, line)
code, line = run_(proj, root, shared, machines=machines)
ok("...and the next run's line does not", code == 0 and "REREAD" not in line, line)
shutil.rmtree(base)

print("\n%d failed" % len(FAILS))
sys.exit(1 if FAILS else 0)
