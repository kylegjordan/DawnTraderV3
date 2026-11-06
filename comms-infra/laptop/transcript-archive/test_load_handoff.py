#!/usr/bin/env python3
"""Tests for .claude/hooks/load-handoff.mjs (B-TRANSCRIPT-ARCHIVE P8): the hook RUN AS NODE RUNS IT, against a fake clone
folder whose dt_handoff.py is a stand-in that succeeds, fails, prints nothing, or prints too much.
`python3 -I test_load_handoff.py` - exit 0 = all pass."""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
HOOK = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(HERE))), ".claude", "hooks", "load-handoff.mjs")
HOOK = os.environ.get("LOAD_HANDOFF_HOOK", HOOK)
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass
FAILS = []


def ok(name, cond, detail=None):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond or detail is None else "   [%r]" % (detail,)))
    if not cond:
        FAILS.append(name)


base = tempfile.mkdtemp(prefix="dt-hook-")
root = os.path.join(base, "archive")


def clone(name, stub):
    d = os.path.join(base, name)
    g = os.path.join(d, "comms-infra", "laptop", "transcript-archive")
    os.makedirs(g, exist_ok=True)
    open(os.path.join(g, "dt_handoff.py"), "w", encoding="utf-8").write(stub)
    return d


def handoff(alias):
    d = os.path.join(root, "handoff", alias)
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, "20261106T180000Z.md")
    open(p, "w").write("# Handoff\n")
    return p


def run(projdir):
    env = dict(os.environ, CLAUDE_PROJECT_DIR=projdir, DT_ARCHIVE_ROOT=root, DT_PYTHON=sys.executable)
    p = subprocess.run(["node", HOOK], capture_output=True, env=env, timeout=200)
    return p.returncode, p.stdout.decode("utf-8", "replace")


GOOD = 'import sys\nprint("HANDOFF GUARD: CLEAN — safe to resume")\nprint("args:", " ".join(sys.argv[1:]))\n'
rc, out = run(clone("SomeOtherRepo", GOOD))
ok("an unmapped clone folder: nothing printed, exit 0", rc == 0 and out == "", out)
d = clone("DawnTraderV3-infra", GOOD)
rc, out = run(d)
ok("a mapped clone with NO handoff: nothing printed, exit 0", rc == 0 and out == "", out)
hp = handoff("CC-INFRA")
rc, out = run(d)
ok("a mapped clone with a handoff: the guard's banner is injected FIRST, tagged with the alias",
   rc == 0 and out.startswith("[HANDOFF GUARD — CC-INFRA] HANDOFF GUARD: CLEAN"), out[:200])
ok("...and the guard was called for that alias, that repo and that archive root",
   "guard --alias CC-INFRA --repo %s --root %s" % (d, root) in out, out)
shutil.rmtree(os.path.join(root, "handoff"))
dB = clone("DawnTraderV3-new", 'import sys\nsys.exit(3)\n')
handoff("CC-B")
rc, out = run(dB)
ok("a guard that FAILS: GUARD FAILED naming why and the handoff, still exit 0",
   rc == 0 and out.startswith("GUARD FAILED — the handoff guard could not run (exit 3)") and "20261106T180000Z.md" in out, out)
dC = clone("DawnTraderV3-analyst", 'pass\n')
handoff("CC-C")
rc, out = run(dC)
ok("a guard that prints NOTHING: GUARD FAILED (a missing banner counts as STALE)", rc == 0 and out.startswith("GUARD FAILED — the handoff guard printed nothing"), out)
dA = clone("DawnTraderV3-old", 'import sys\nsys.stdout.reconfigure(encoding="utf-8")\nprint("STALE (drift) — ref")\nprint("x" * 30000)\n')
handoff("CC-A")
rc, out = run(dA)
ok("an output over the delivery limit is cut under 7000 bytes, banner kept, ending with TRUNCATED and the path",
   rc == 0 and len(out.encode("utf-8")) <= 7000 and out.startswith("[HANDOFF GUARD — CC-A] STALE (drift) — ref")
   and "TRUNCATED" in out and "20261106T180000Z.md" in out, (len(out.encode("utf-8")), out[-200:]))
dP = clone("DawnTraderV3-pm", 'print("HANDOFF GUARD: CLEAN")\n')
handoff("CC-PM")
rc, out = run(dP)
ok("PM Claude's clone maps to CC-PM", out.startswith("[HANDOFF GUARD — CC-PM]"), out)
shutil.rmtree(base, ignore_errors=True)
print("\n%d failed" % len(FAILS))
sys.exit(1 if FAILS else 0)
