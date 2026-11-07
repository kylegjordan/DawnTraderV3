#!/usr/bin/env python3
"""Tests for dt_dupes (B-TRANSCRIPT-ARCHIVE P10). `python3 -I test_dt_dupes.py` - exit 0 = all pass. Runs the tool AS A
PROCESS on a throwaway projects tree and asserts on its output and on the tree being untouched."""
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass
FAILS = []


def ok(name, cond, detail=None):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond or detail is None else "   [%r]" % (detail,)))
    if not cond:
        FAILS.append(name)


base = tempfile.mkdtemp(prefix="dt-dup-")
proj = os.path.join(base, "projects")


def put(rel, data):
    p = os.path.join(proj, *rel.split("/"))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "wb").write(data)
    return p


A = b'{"uuid":"a"}\n' * 50
a1 = put("C--DawnTraderV3-new/s1.jsonl", A)
a2 = put("G--My-Drive-Dawn-Trader-DT-Clone-Repo-DawnTraderV3-BACKUP-1/s1.jsonl", A)
a3 = put("C--DawnTraderV3-old/x/subagents/agent-1.jsonl", A)
put("C--DawnTraderV3-new/s2.jsonl", A[:-1] + b"X")                 # same size, different bytes
put("C--DawnTraderV3-new/s3.jsonl", b'{"uuid":"b"}\n')
put("G--My-Drive-Kasia-Projects/private.jsonl", A)                # out of scope: never read
put("C--DawnTraderV3-new/notes.txt", A)                            # not a .jsonl
snap = {}
for r, _d, fs in os.walk(proj):
    for f in fs:
        p = os.path.join(r, f)
        snap[p] = (os.path.getsize(p), open(p, "rb").read())
p = subprocess.run([sys.executable, "-I", os.path.join(HERE, "dt_dupes.py"), "--projects", proj], capture_output=True)
out, err = p.stdout.decode("utf-8"), p.stderr.decode("utf-8")
rows = [l.split("\t") for l in out.strip().split("\n")[1:]]
ok("exit 0 and one group of three", p.returncode == 0 and len(rows) == 3 and {r[2] for r in rows} == {"3"}, out)
ok("the group is the three identical files in scope, by full sha256",
   sorted(r[3] for r in rows) == sorted([a1, a2, a3]) and all(r[0] == hashlib.sha256(A).hexdigest() for r in rows), rows)
ok("a same-size file with different bytes is not a duplicate", all("s2.jsonl" not in r[3] for r in rows))
ok("a folder outside Dawn Trader is never read", "Kasia" not in out and "private" not in out)
ok("a non-.jsonl file is not counted", "notes.txt" not in out)
ok("the summary counts two extra copies and says nothing moved", "2 extra cop(ies)" in err and "nothing moved" in err, err)
after = {}
for r, _d, fs in os.walk(proj):
    for f in fs:
        q = os.path.join(r, f)
        after[q] = (os.path.getsize(q), open(q, "rb").read())
ok("the tree is untouched, byte for byte", after == snap)
ok("stdout is LF", b"\r\n" not in p.stdout)
p = subprocess.run([sys.executable, "-I", os.path.join(HERE, "dt_dupes.py"), "--projects", proj, "--move"], capture_output=True)
ok("an unknown argument (there is no --move) is refused", p.returncode == 2)
# Langston P10 PROCEED: a folder the census cannot read REFUSES (exit 3), never an under-count
sys.path.insert(0, HERE)
import dt_dupes as dd  # noqa: E402
_scandir = os.scandir


def failing_scandir(path="."):
    if os.path.basename(str(path)) == "x":
        raise PermissionError(13, "Access is denied", str(path))
    return _scandir(path)


os.scandir = failing_scandir
try:
    code = dd.main(["dt_dupes.py", "--projects", proj, "--out", os.path.join(base, "o.tsv")])
finally:
    os.scandir = _scandir
ok("an unreadable folder inside a Dawn Trader folder REFUSES the census (exit 3), never reads as fewer files", code == 3, code)
shutil.rmtree(base)
print("\n%d failed" % len(FAILS))
sys.exit(1 if FAILS else 0)
