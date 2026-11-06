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


SEEN = []


def spy(host, args, copy):
    SEEN.append((host, list(args), copy))
    return ar.run_machine(host, args, copy)


print("1. a clean run")
base, proj, root, shared, machines = tree()
code, line = ar.run(proj, root, shared, machines=machines, runner=spy)
ok("exit 0 and the OK line", code == 0 and line.startswith("ARCHIVE RUN OK") and "layer (c) 2 values" in line, line)
day = os.path.join(root, "CC-B", "2026-11-06_0fe1c46a.md")
t = open(day, encoding="utf-8").read() if os.path.exists(day) else ""
ok("the shapeless secret is redacted by the fingerprints the run fetched (layer c, end to end)",
   SECRET not in t and "[REDACTED value:FRED_API_KEY]" in t and "values: ON, 2 value(s) loaded" in t, t[:400])
ok("the index was built", os.path.exists(os.path.join(root, "INDEX.md")) and os.path.exists(os.path.join(shared, "TRANSCRIPT_INDEX.md")))
keyhex = [c.split(b'RUN_KEY_HEX = "')[1][:64] for _h, _a, c in SEEN]
ok("every machine got the SAME key, in the streamed copy", len(set(keyhex)) == 1 and len(keyhex[0]) == 64)
ok("the key is never on any command line", all(keyhex[0].decode() not in " ".join(a) for _h, a, _c in SEEN))
ok("the key is written nowhere under the archive or the shared folder",
   all(keyhex[0] not in open(os.path.join(dp, f), "rb").read() for d in (root, shared) for dp, _x, fs in os.walk(d) for f in fs))
SEEN.clear()
code2, _l = ar.run(proj, root, shared, machines=machines, runner=spy)
k2 = SEEN[0][2].split(b'RUN_KEY_HEX = "')[1][:64]
ok("a second run uses a DIFFERENT throwaway key", code2 == 0 and k2 != keyhex[0])
shutil.rmtree(base)

print("2. fails loud")
base, proj, root, shared, machines = tree()
machines["two"] = (None, ["--file", "SOME_KEY=" + os.path.join(base, "missing")])
code, line = ar.run(proj, root, shared, machines=machines)
ok("one machine that cannot answer -> exit 3, nothing archived", code == 3 and "fingerprints incomplete" in line
   and "two" in line and not os.path.exists(os.path.join(root, "CC-B")), line)
shutil.rmtree(base)
base, proj, root, shared, machines = tree()
open(os.path.join(proj, "C--DawnTraderV3-new", SID[:8] + "-ffff-ffff-ffff-ffffffffffff.jsonl"), "w").write("")
code, line = ar.run(proj, root, shared, machines=machines)
ok("a name collision -> exit 4", code == 4 and "collision" in line, line)
shutil.rmtree(base)
base, proj, root, shared, machines = tree()
code, _l = ar.run(proj, root, shared, machines=machines)
sp = [os.path.join(dp, f) for dp, _d, fs in os.walk(os.path.join(root, ".state")) for f in fs if f.endswith(".json")][0]
open(sp + ".lock", "w").write("123 2026-11-01T00:00:00Z\n")
code, line = ar.run(proj, root, shared, machines=machines)
ok("a FRESH lock -> that file refused, exit 5", code == 5 and "refused" in line, line)
old = time.time() - 26 * 3600
os.utime(sp + ".lock", (old, old))
code, line = ar.run(proj, root, shared, machines=machines)
ok("a lock OLDER than one interval -> exit 6, naming it and what a human must do", code == 6 and sp + ".lock" in line
   and "confirm no run is alive" in line, line)
shutil.rmtree(base)
base, proj, root, shared, machines = tree()
code, line = ar.run(proj, root, shared, dry=True, machines=machines)
ok("a dry run -> OK, and the archive and shared folders stay empty", code == 0 and "dry run" in line
   and os.listdir(root) == [] and os.listdir(shared) == [], (line, os.listdir(root)))
shutil.rmtree(base)
print("\n%d failed" % len(FAILS))
sys.exit(1 if FAILS else 0)
