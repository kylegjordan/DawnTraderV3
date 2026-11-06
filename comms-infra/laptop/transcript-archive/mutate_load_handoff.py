#!/usr/bin/env python3
"""Mutation runner for .claude/hooks/load-handoff.mjs (B-TRANSCRIPT-ARCHIVE P8). Each mutation breaks one rule in a TEMP
copy of the hook; test_load_handoff.py runs against that copy (LOAD_HANDOFF_HOOK) and must FAIL. CONTROL FIRST; a crash
is printed apart AND fails the run."""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
HOOK = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(HERE))), ".claude", "hooks", "load-handoff.mjs")
SRC = open(HOOK, encoding="utf-8").read()


def replace(a, b):
    def f(s):
        assert s.count(a) == 1, "anchor not unique: %r (%d)" % (a[:60], s.count(a))
        return s.replace(a, b)
    return f


MUTATIONS = [
    ("an unmapped clone gets output", replace("  if (!alias) return '';", "  if (!alias) return 'x\\n';")),
    ("a session with no handoff gets output", replace(
        "  if (!existsSync(hdir) || readdirSync(hdir).filter((f) => f.endsWith('.md')).length === 0) return '';",
        "  if (!existsSync(hdir) || readdirSync(hdir).filter((f) => f.endsWith('.md')).length === 0) return 'GUARD FAILED\\n';")),
    ("a failed guard is silent", replace("    return `GUARD FAILED — the handoff guard could not run (${why}); the handoff counts as STALE: ${latest}\\n`;",
                                         "    return '';")),
    ("an empty guard output passes as clean", replace("  if (!out || !out.trim()) {", "  if (false) {")),
    ("the delivery budget not enforced", replace("  if (b.length <= BUDGET) return text;", "  return text;")),
    ("PM Claude unmapped", replace(" 'DawnTraderV3-pm': 'CC-PM',", "")),
    ("the guard called for the wrong archive root", replace("'--root', root]", "'--root', projectDir]")),
]


def suite(src):
    d = tempfile.mkdtemp(prefix="dt-hkmut-")
    try:
        h = os.path.join(d, "load-handoff.mjs")
        open(h, "w", encoding="utf-8").write(src)
        p = subprocess.run([sys.executable, "-I", os.path.join(HERE, "test_load_handoff.py")], capture_output=True,
                           env=dict(os.environ, LOAD_HANDOFF_HOOK=h), timeout=600)
        tail = [l for l in p.stdout.decode("utf-8", "replace").splitlines() if l.endswith(" failed")]
        return p.returncode, (tail[-1] if tail else None)
    finally:
        shutil.rmtree(d, ignore_errors=True)


rc0, line0 = suite(SRC)
if rc0 != 0 or line0 != "0 failed":
    print("HARNESS BROKEN: the unmutated hook does not pass in the scratch layout (rc=%s, %r)" % (rc0, line0))
    sys.exit(2)
caught = crashed = 0
for name, mut in MUTATIONS:
    try:
        m = mut(SRC)
    except AssertionError as e:
        print("ERROR    %s: %s" % (name, e)); continue
    rc, line = suite(m)
    verdict = "SURVIVED" if rc == 0 else ("crashed" if line is None else "caught")
    crashed += verdict == "crashed"
    caught += rc != 0
    print("%-8s %s" % (verdict, name))
print("\n%d/%d caught (%d of them by a crash rather than an assertion)" % (caught, len(MUTATIONS), crashed))
sys.exit(0 if caught == len(MUTATIONS) and crashed == 0 else 1)
