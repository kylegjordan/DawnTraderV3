"""
token-watch — B-TOKEN-WATCH-FOLLOWUP-MEMORY P7: summary._read_new is STREAMED. A from-empty build read the 258 MB
tombstone file whole (1,915 MiB peak measured on staging 2026-11-15). The streamed reader must return the same rows,
the same skipped count and the same cursor as a reference reader with the INTENDED semantics (binary-exact cursor,
split on newline only) on every edge case.
⚠️ The reference is NOT the reader it replaced on two axes (Langston): the old one read in text mode (its cursor
   undershot on CRLF) and split with splitlines(); both differences are bugs the new reader fixes, recorded in its
   docstring. This fence proves the intended behaviour, not equivalence to the old code.

Run:  python tests/test_p7_summary_stream.py        (exit 0 = every check passed)
"""

import json
import os
import shutil
import sys
import tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-p7ss-", dir=os.path.expanduser("~"))
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import summary  # noqa: E402

PASS = FAIL = 0
NL = chr(10)


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok   %s" % label)
    else:
        FAIL += 1
        print("  FAIL %s%s" % (label, (" :: %s" % (detail,)) if detail else ""))


def old_read_new(path, offset):
    """A whole-remainder reference with the INTENDED semantics (newline-only split, exact byte cursor) -- see the
    module docstring for how it differs from the pre-P7 reader."""
    skipped = 0
    if not os.path.exists(path):
        return [], offset, 0
    size = os.path.getsize(path)
    if size < offset:
        offset = 0
    if size == offset:
        return [], offset, 0
    with open(path, "r", encoding="utf-8", newline="") as fh:
        fh.seek(offset)
        raw = fh.read()
    if not raw:
        return [], offset, 0
    if not raw.endswith(NL):
        cut = raw.rfind(NL)
        if cut < 0:
            return [], offset, 0
        raw = raw[: cut + 1]
    rows = []
    for line in raw.split(NL)[:-1]:
        if not line.strip():
            continue
        try:
            r = json.loads(line)
        except ValueError:
            skipped += 1
            continue
        if not isinstance(r, dict):
            skipped += 1
            continue
        rows.append(r)
    return rows, offset + len(raw.encode("utf-8")), skipped


def new_read_new(path, offset):
    summary._READ_NEW_SKIPPED["lines"] = 0
    it = summary._read_new(path, offset)
    rows = list(it)
    return rows, it.end, summary._READ_NEW_SKIPPED["lines"]


def write(text, mode="w"):
    p = os.path.join(ROOT, "f.jsonl")
    with open(p, mode, encoding="utf-8", newline="") as fh:
        fh.write(text)
    return p


os.makedirs(ROOT, exist_ok=True)
CASES = {
    "plain rows": '{"a": 1}' + NL + '{"a": 2}' + NL,
    "a torn last line is not consumed": '{"a": 1}' + NL + '{"a": 2',
    "blank and whitespace lines": '{"a": 1}' + NL + NL + "   " + NL + '{"a": 2}' + NL,
    "unparseable and non-object lines are skipped and counted": '{"a": 1}' + NL + "nope" + NL + "123" + NL + "[1]" + NL,
    "only a torn line": '{"a": 1',
    "multi-byte text keeps the byte cursor exact": '{"name": "éè☃"}' + NL + '{"a": 2}' + NL,
    "empty file": "",
}
for name, text in CASES.items():
    p = write(text)
    for off in sorted({0, len(text.encode("utf-8").split(b"\n", 1)[0]) + 1 if "\n" in text else 0}):
        o, n = old_read_new(p, off), new_read_new(p, off)
        check("S %s (offset %d): rows, cursor and skipped equal the old reader" % (name, off), o == n, (o, n))

p = write('{"a": 1}' + NL + '{"a": 2}' + NL)
o, n = old_read_new(p, 999), new_read_new(p, 999)
check("S a file that SHRANK below the cursor restarts at 0, as before", o == n and n[1] == len(open(p, "rb").read()), (o, n))
check("S a missing file yields nothing and keeps the offset", new_read_new(os.path.join(ROOT, "nope"), 7) == ([], 7, 0))

big = os.path.join(ROOT, "big.jsonl")
with open(big, "w", encoding="utf-8", newline="") as fh:
    for i in range(20000):
        fh.write(json.dumps({"mint": "m%d" % i, "age_at_death": "24h", "pad": "x" * 200}) + NL)
it = summary._read_new(big, 0)
first = next(iter(it))
check("S STREAMED: after the first row the cursor has moved one line, not to the end of the file",
      0 < it.end < os.path.getsize(big) // 100 and first["mint"] == "m0", (it.end, os.path.getsize(big)))

print(NL + "%d passed, %d failed" % (PASS, FAIL))
shutil.rmtree(ROOT, ignore_errors=True)
sys.exit(1 if FAIL else 0)
