#!/usr/bin/env python3
"""B-WAKE-LEASE-PID-REUSE (#1179): the lease-holder decision, graded as a truth table — runs anywhere (CI is Linux).

It reads `holder_verdict` out of comms-infra/laptop/cc-wake-filter.py with `ast` (the exact bytes of the REPO copy,
without importing the script, which would start the filter). ⚠️ A green run proves the REPO copy. The laptop runs a
hand-installed copy (~/.claude/cc-wake-filter.py, the #1004 class); only a sha256 equality with the blob proves the
laptop has the fix — this test cannot.

Rows: 2 alive x 3 created {None, equal, differs} x 2 loop_created {None, recorded} x 2 denied = 24. Rows that the
probe cannot produce are kept and labelled IMPOSSIBLE, so a reordering of the rules cannot slip through on them.
Control (Langston Step-2 C5): the pre-fix rule, transcribed below, must disagree with the new one on EXACTLY the
pre-stated row set — not fewer, not more, and not none.
"""
import ast, itertools, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, "..", "..", "comms-infra", "laptop", "cc-wake-filter.py"))
tree = ast.parse(open(SRC, encoding="utf-8").read(), filename=SRC)
fn = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "holder_verdict"]
if len(fn) != 1:
    print(f"FAIL: expected exactly one holder_verdict in {SRC}, found {len(fn)}"); sys.exit(1)
ns = {}
exec(compile(ast.Module(body=fn, type_ignores=[]), SRC, "exec"), ns)
holder_verdict = ns["holder_verdict"]

LC = 1000                                     # a recorded loop_created
CREATED = {"none": None, "equal": LC, "differs": 2000}
P = F = 0
def ok(name, cond, extra=""):
    global P, F
    if cond: P += 1
    else: F += 1; print(f"  FAIL: {name} {extra}")

def expected(alive, cname, lc, denied):
    """The specification, written independently of the code."""
    if not alive: return "dead"
    if denied and lc is not None: return "dead"          # #1179
    if cname == "none": return "alive"
    if lc is None: return "alive"                         # OBJ-6
    return "alive" if cname == "equal" else "dead"

def impossible(alive, cname, denied):
    if denied and not alive: return "denied comes only with an open refused for a non-87 error, which reads alive"
    if denied and cname != "none": return "a refused open yields no handle, so no creation time"
    return ""

def old_rule(alive, created, lc):
    """Pre-fix _holder_alive (c31d13ed9 :370-378), transcribed: no `denied` input."""
    if not alive: return "dead"
    return "alive" if (created is None or lc is None or created == lc) else "dead"

disagree = set()
for alive, cname, lc, denied in itertools.product((True, False), ("none", "equal", "differs"), (None, LC), (False, True)):
    created = CREATED[cname]
    if cname == "equal" and lc is None:
        created = LC                              # "equal" is only meaningful against a recorded value; keep the row
    v, why = holder_verdict(alive, created, lc, denied)
    exp = expected(alive, cname, lc, denied)
    tag = impossible(alive, cname, denied)
    label = f"alive={alive} created={cname} loop_created={'set' if lc else 'None'} denied={denied}" + (f" [IMPOSSIBLE: {tag}]" if tag else "")
    ok(f"row {label} -> {exp}", v == exp, f"(got {v}: {why})")
    if old_rule(alive, created, lc) != v:
        disagree.add((alive, cname, lc is not None, denied))

# The two rows the fix exists for, named (#1179 measured: denied, recorded creation, nothing readable).
ok("#1179: alive, denied, creation recorded, nothing readable -> dead", holder_verdict(True, None, LC, True)[0] == "dead")
ok("OBJ-6 (ruled): alive, denied, NOTHING recorded -> alive", holder_verdict(True, None, None, True)[0] == "alive")
ok("C1 producer B: open succeeded, times failed (not denied), creation recorded -> alive", holder_verdict(True, None, LC, False)[0] == "alive")
ok("reuse: creation differs -> dead", holder_verdict(True, 2000, LC, False)[0] == "dead")

# Control, pre-stated BEFORE the run: the old rule differs from the new one on exactly these rows.
PRESTATED = {(True, "none", True, True), (True, "equal", True, True)}
ok("CONTROL: the old rule disagrees on exactly the pre-stated rows (not fewer, not more, not none)",
   disagree == PRESTATED and len(disagree) > 0, f"(got {sorted(disagree)})")

print(f"\nlease verdict tests: {P} passed, {F} failed")
sys.exit(0 if F == 0 else 1)
