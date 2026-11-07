#!/usr/bin/env python3
"""Mutation runner for dt_dupes (B-TRANSCRIPT-ARCHIVE P10). CONTROL FIRST; a crash is printed apart and fails the run."""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "dt_dupes.py"), encoding="utf-8").read()


def replace(a, b):
    def f(s):
        assert s.count(a) == 1, "anchor not unique: %r (%d)" % (a[:60], s.count(a))
        return s.replace(a, b)
    return f


MUTATIONS = [
    ("every project folder read", replace('    return da.dt_folder_class(slug) != "outside"', "    return True")),
    ("same size taken as same bytes", replace("            out[(sha256(p), size)].append(p)", "            out[(\"size-only\", size)].append(p)")),
    ("a single file counted as a group", replace("    return {k: sorted(v) for k, v in out.items() if len(v) >= 2}",
                                                 "    return {k: sorted(v) for k, v in out.items()}")),
    # NOT a mutation: dropping the unique-size skip ("if len(ps) < 2: continue") changes only how much is hashed, never
    # the output (the >=2 filter below still removes singletons) - an EQUIVALENT mutant, which no test can or should catch.
    ("non-.jsonl files counted", replace('                if f.endswith(".jsonl"):', "                if True:")),
    ("unknown arguments accepted", replace(
        '            sys.stderr.write("REFUSED: unknown argument at position %d\\n" % argv.index(a))\n            return 2',
        "            continue")),
]


def suite(src):
    d = tempfile.mkdtemp(prefix="dt-dmut-")
    try:
        open(os.path.join(d, "dt_dupes.py"), "w", encoding="utf-8").write(src)
        for f in ("test_dt_dupes.py", "dt_archive.py", "dt_transcript.py"):   # dt_dupes imports the writer's folder test
            shutil.copy(os.path.join(HERE, f), d)
        p = subprocess.run([sys.executable, "-I", os.path.join(d, "test_dt_dupes.py")], capture_output=True, cwd=d, timeout=300)
        tail = [l for l in p.stdout.decode("utf-8", "replace").splitlines() if l.endswith(" failed")]
        return p.returncode, (tail[-1] if tail else None)
    finally:
        shutil.rmtree(d, ignore_errors=True)


rc0, line0 = suite(SRC)
if rc0 != 0 or line0 != "0 failed":
    print("HARNESS BROKEN: the unmutated tool does not pass in the scratch layout (rc=%s, %r)" % (rc0, line0))
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
