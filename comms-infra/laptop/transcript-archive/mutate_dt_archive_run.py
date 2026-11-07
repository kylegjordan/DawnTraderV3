#!/usr/bin/env python3
"""Mutation runner for dt_archive_run (B-TRANSCRIPT-ARCHIVE P7). CONTROL FIRST; a crash is printed apart AND fails."""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "dt_archive_run.py"), encoding="utf-8").read()
COPIED = ("test_dt_archive_run.py", "dt_archive.py", "dt_index.py", "dt_transcript.py", "dt_secret_hashes.py")


def replace(a, b):
    def f(s):
        assert s.count(a) == 1, "anchor not unique: %r (%d)" % (a[:60], s.count(a))
        return s.replace(a, b)
    return f


MUTATIONS = [
    ("an empty session folder passes quietly", replace("    if empty:\n        return 7,", "    if False:\n        return 7,")),
    ("a missing machine tolerated (partial fingerprints)", replace("        if failed:\n            return 3,", "        if False:\n            return 3,")),
    ("an old lock not checked", replace("    if stale:\n        return 6,", "    if False:\n        return 6,")),
    ("a fresh lock treated as old", replace("                if now - os.path.getmtime(p) > LOCK_MAX_S:", "                if True:")),
    ("one fixed key for every run", replace("    key = os.urandom(32)", "    key = bytes(32)")),
    ("the index not built", replace("        if not dry:\n            ix = di.build(", "        if False:\n            ix = di.build(")),
    ("a dry run builds the index", replace("        if not dry:\n            ix = di.build(", "        if True:\n            ix = di.build(")),
    ("refused files reported as OK", replace("        if refused:\n            return 5,", "        if False:\n            return 5,")),
    ("a collision reported as OK", replace('            return 4, "ARCHIVE RUN FAILED — %s" % e', '            return 0, "ARCHIVE RUN OK — %s" % e')),
    ("P5 r4: an unreadable lock folder reads as no stale lock", replace(
        "os.walk(top, onerror=unreadable)", "os.walk(top)")),
    ("P5 r4: an absent .state raises (first run dies)", replace(
        "    if not os.path.lexists(top):", "    if False:")),
    ("P5 r4: an unexpected failure escapes main as a traceback", replace(
        "    except Exception as e:     # noqa: BLE001", "    except KeyboardInterrupt as e:     # noqa: BLE001")),
    ("REREAD not named in the run's result line", replace('rr = [os.path.basename(r["raw"]) for r in results if r.get("reread")]', "rr = []")),
    # Langston P10 counts leg: an unmapped Dawn Trader folder is loud
    ("UNMAPPED: a Dawn Trader folder neither read nor excluded passes quietly", replace("    if unmapped:\n        return 7,", "    if False:\n        return 7,")),
    ("UNMAPPED: an empty Dawn Trader folder made loud", replace("        if any(f.endswith(\".jsonl\") for f in files):", "        if True:")),
    ("UNMAPPED: a conversation only in a nested folder missed", replace("        if any(f.endswith(\".jsonl\") for f in files):", "        if any(f.endswith(\".jsonl\") for f in files) and _root == folder:")),
    ("UNMAPPED: the memory junction walked", replace("        dirs[:] = [d for d in dirs if d != \"memory\"]\n        if any(", "        if any(")),
    # Langston P10 r4: the QUIET class and its laptop-local list
    ("QUIET: a folder on no list not named", replace('            ("; %d folder(s) on no list: %s" % (len(unlisted), ", ".join(unlisted))) if unlisted else "")',
                                                     '            "")')),
    ("QUIET: the outside list may quiet a Dawn Trader name", replace("    if bad:\n        raise ValueError(", "    if False:\n        raise ValueError(")),
    ("QUIET: the outside list ignored", replace("and s not in outside\n", "\n")),
    ("QUIET: the index told nothing", replace("            ix = di.build(root, shared, unlisted=unlisted)", "            ix = di.build(root, shared)")),
    ("C-1: the gated counts left off the result line", replace("red.layer_c_names, gated,", 'red.layer_c_names, "",')),
    ("CAP RULING: the shared index size left off the OK line", replace('            body += "; shared index %d bytes" % ix["shared_bytes"]',
                                                               "            pass")),
]


def suite(src):
    d = tempfile.mkdtemp(prefix="dt-rmut-")
    try:
        open(os.path.join(d, "dt_archive_run.py"), "w", encoding="utf-8").write(src)
        for f in COPIED:
            shutil.copy(os.path.join(HERE, f), d)
        p = subprocess.run([sys.executable, "-I", os.path.join(d, "test_dt_archive_run.py")], capture_output=True, cwd=d, timeout=600)
        tail = [l for l in p.stdout.decode("utf-8", "replace").splitlines() if l.endswith(" failed")]
        return p.returncode, (tail[-1] if tail else None)
    finally:
        shutil.rmtree(d, ignore_errors=True)


rc0, line0 = suite(SRC)
if rc0 != 0 or line0 != "0 failed":
    print("HARNESS BROKEN: the unmutated run does not pass in the scratch layout (rc=%s, %r)" % (rc0, line0))
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
