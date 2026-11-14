#!/usr/bin/env python3
"""Mutation check for test_index_guard.py (P12). Each mutant is applied to a COPY, the patch is asserted to have landed
exactly once, and the suite is judged by its EXIT CODE (a crashing suite prints no FAIL line and must still count as
killed only if it exits non-zero for the right reason - so the output is kept). The unmutated run must pass first.

    python3 mutate_index_guard.py        exit 0 = baseline passes and every mutant is killed
"""
import os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
G, W, T = (os.path.join(HERE, n) for n in ("langston-index-guard", "langston-memory-write", "test_index_guard.py"))

MUTANTS = [
    ("replace_all ignored", "guard",
     "return text.replace(old, new) if replace_all else text.replace(old, new, 1)", "return text.replace(old, new, 1)"),
    ("no realpath on the target", "guard", "real = os.path.realpath(path)", "real = path"),
    ("unknown ratchet passes", "guard", "    if r.get(\"unknown\"):\n        return block(", "    if False:\n        return block("),
    ("at-ceiling refused", "guard", "if r[\"total\"] > r[\"ceiling_bytes\"]:", "if r[\"total\"] >= r[\"ceiling_bytes\"]:"),
    ("writer ignores subject", "writer", "        if os.path.realpath(f) == subj:\n            continue",
     "        if os.path.realpath(f) == os.path.realpath(TARGET):\n            continue"),
    ("unenumerated tool allowed", "guard", "    if tool not in WRITERS:\n        return block(",
     "    if False:\n        return block("),
]


def run(gpath, wpath):
    p = subprocess.run([sys.executable, T, "--guard", gpath, "--writer", wpath], capture_output=True, text=True)
    return p.returncode, p.stdout.strip().splitlines()[-1:] or [p.stderr.strip()[-200:]]


rc, tail = run(G, W)
print("BASELINE rc=%d %s" % (rc, tail))
if rc != 0:
    sys.exit(2)
survived = 0
for name, which, a, b in MUTANTS:
    d = tempfile.mkdtemp(prefix="ligm-")
    g, w = os.path.join(d, "langston-index-guard"), os.path.join(d, "langston-memory-write")
    shutil.copy(G, g)
    shutil.copy(W, w)
    target = g if which == "guard" else w
    s = open(target, encoding="utf-8").read()
    if s.count(a) != 1:
        print("PATCH-NOT-APPLIED %s (anchor count %d)" % (name, s.count(a)))
        survived += 1
        shutil.rmtree(d)
        continue
    open(target, "w", encoding="utf-8", newline="").write(s.replace(a, b))
    rc, tail = run(g, w)
    print(("KILLED  " if rc != 0 else "SURVIVED") + " %-28s rc=%d %s" % (name, rc, tail))
    survived += rc == 0
    shutil.rmtree(d)
sys.exit(1 if survived else 0)
