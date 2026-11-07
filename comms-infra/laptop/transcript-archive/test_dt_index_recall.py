#!/usr/bin/env python3
"""Tests for dt_index + dt_recall (B-TRANSCRIPT-ARCHIVE P6). `python3 -I test_dt_index_recall.py` - exit 0 = all pass.
END TO END: a throwaway raw tree is archived by the real writer (dt_archive), indexed by dt_index.build, and searched
through dt_recall AS A PROCESS. Every claim is checked against the archive files themselves."""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dt_archive as da  # noqa: E402
import dt_index as di  # noqa: E402
import dt_transcript as dt  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass
FAILS = []


def ok(name, cond, detail=None):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond or detail is None else "   [%r]" % (detail,)))
    if not cond:
        FAILS.append(name)


SA, SB = "0fe1c46a-a390-40b1-92b3-b160c6024f60", "7f66d970-1111-2222-3333-444455556666"
TN = "<task-notification>\n<task-id>x</task-id>\n<status>completed</status>\n<summary>Background command done</summary>\n</task-notification>"


def raw(entries):
    return "".join(json.dumps(e) + "\n" for e in entries)


base = tempfile.mkdtemp(prefix="dt-idx-")
proj, root, shared = (os.path.join(base, x) for x in ("projects", "archive", "shared"))
for d in (os.path.join(proj, "C--DawnTraderV3-new"), os.path.join(proj, "C--DawnTraderV3-old"), root, shared):
    os.makedirs(d)
open(os.path.join(proj, "C--DawnTraderV3-new", SA + ".jsonl"), "w", newline="\n").write(raw([
    {"type": "user", "uuid": "w", "timestamp": "2026-10-20T08:00:00Z", "message": {"content": TN}},
    {"type": "user", "uuid": "u1", "timestamp": "2026-10-20T08:00:01Z", "message": {"content": "please look at B-TOKEN-WATCH and the archive, and B-ALPHA once"}},
    {"type": "assistant", "uuid": "a1", "timestamp": "2026-10-20T08:00:02Z", "message": {"content": [
        {"type": "text", "text": "Looking at B-ZULU now: B-ZULU, B-ZULU, B-TOKEN-WATCH."},
        {"type": "tool_use", "id": "t1", "name": "Bash", "input": {"command": "ls", "description": "List the token watch store"}}]}},
    {"type": "assistant", "uuid": "a2", "timestamp": "2026-10-21T09:00:00Z", "message": {"content": [{"type": "text", "text": "Next day: the zebra finding."}]}},
]))
os.makedirs(os.path.join(proj, "C--DawnTraderV3-new", SA, "subagents"))
open(os.path.join(proj, "C--DawnTraderV3-new", SA, "subagents", "agent-q.jsonl"), "w", newline="\n").write(raw([
    {"type": "assistant", "uuid": "n1", "timestamp": "2026-10-20T08:05:00Z", "message": {"content": [
        {"type": "tool_use", "id": "tn", "name": "Grep", "input": {"description": "Search for the zebra"}}]}}]))
open(os.path.join(proj, "C--DawnTraderV3-old", SB + ".jsonl"), "w", newline="\n").write(raw([
    {"type": "user", "uuid": "o1", "timestamp": "2026-10-22T10:00:00Z", "message": {"content": "a private note about my family"}}]))
da.archive_all(root, proj, dt.Redactor())
r = di.build(root, shared)

print("1. INDEX.md, one line per conversation")
idx = open(os.path.join(root, "INDEX.md"), encoding="utf-8").read()
rows = [l for l in idx.split("\n") if l.startswith("| CC-")]
ok("one row per conversation (two conversations, three day files, one nested)", len(rows) == 2 and r["conversations"] == 2, rows)
rb = [l for l in rows if SA in l]
ok("the row carries the FULL session id, first/last day, day count, nested count",
   len(rb) == 1 and "| 2026-10-20 | 2026-10-21 | 2 |" in rb[0] and rb[0].split("|")[7].strip() == "1", rb)
ok("the batches it mentions most, MOST first - not alphabetical", rb and "B-ZULU, B-TOKEN-WATCH, B-ALPHA" in rb[0], rb)
ok("the topic is the first thing a PERSON said - not the wake notice before it",
   rb and "please look at B-TOKEN-WATCH and the archive, and B-ALPHA once" in rb[0] and "Background command" not in rb[0], rb)

print("2. the topic-free copy in the shared folder")
lean = open(os.path.join(shared, "TRANSCRIPT_INDEX.md"), encoding="utf-8").read()
ok("it carries no topic: neither conversation's words appear", "private note" not in lean and "please look" not in lean, lean)
ok("...but it does carry both conversations and their batch ids", lean.count("| CC-") == 2 and "B-TOKEN-WATCH" in lean)
ok("it is LF and under the memory-file cap", b"\r\n" not in open(os.path.join(shared, "TRANSCRIPT_INDEX.md"), "rb").read()
   and r["shared_bytes"] <= di.MEMORY_CAP)
before = open(os.path.join(shared, "TRANSCRIPT_INDEX.md"), "rb").read()
cap = di.MEMORY_CAP
di.MEMORY_CAP = 100
try:
    di.build(root, shared)
    ok("over the cap the shared copy is REFUSED", False)
except OverflowError:
    ok("over the cap the shared copy is REFUSED", True)
di.MEMORY_CAP = cap
ok("...and the old copy is left as it was", open(os.path.join(shared, "TRANSCRIPT_INDEX.md"), "rb").read() == before)
# Langston P10 r4 conditions 1 and 3: the coverage bound in both; a folder on no list NAMED only in the laptop copy
ok("both copies state the coverage bound", di.COVERAGE in open(os.path.join(root, "INDEX.md"), encoding="utf-8").read()
   and di.COVERAGE in lean)
di.build(root, shared, unlisted=["G--Someone-Elses-Project"])
idx2 = open(os.path.join(root, "INDEX.md"), encoding="utf-8").read()
lean2 = open(os.path.join(shared, "TRANSCRIPT_INDEX.md"), encoding="utf-8").read()
ok("a folder on no list is NAMED in the laptop-local index", "G--Someone-Elses-Project" in idx2)
ok("...and only COUNTED in the git-mirrored copy, never named", "G--Someone-Elses-Project" not in lean2
   and "1 folder(s) on no list" in lean2, lean2[:500])

print("3. ACTIONS.tsv, one row per action, each pointing at its own line")
tsv = open(os.path.join(root, "ACTIONS.tsv"), encoding="utf-8").read().strip().split("\n")
ok("a header and one row per action (one top-level, one nested)", len(tsv) == 3 and tsv[0].startswith("alias\tdate"), tsv)
good = True
for row in tsv[1:]:
    f = row.split("\t")
    path, line = f[4].rsplit(":", 1)
    target = open(os.path.join(root, *path.split("/")), encoding="utf-8").read().split("\n")[int(line) - 1]
    good = good and target.startswith("- `%s` %s" % (f[2], f[5]))
ok("every file:line points at exactly its action line", good, tsv)


def recall(*a):
    p = subprocess.run([sys.executable, "-I", os.path.join(HERE, "dt_recall.py")] + list(a) + ["--root", root],
                       capture_output=True)
    return p.returncode, p.stdout.decode("utf-8", "replace")


print("4. dt_recall as a process")
rc, out = recall("zebra finding")
ok("a hit prints file:line and its time - and EVERY word must be on the line (one hit, not two)", rc == 0 and "1 hit(s)" in out and "CC-B/2026-10-21_0fe1c46a.md:" in out and "09:00:00" in out, out)
first = out.split("\n")[0].split("  ")[0]
p, ln = first.rsplit(":", 1)
ok("...and that file:line really holds both words", "zebra finding" in open(os.path.join(root, *p.split("/")), encoding="utf-8").read().split("\n")[int(ln) - 1])
ok("every run ends with the lead / not-evidence footer", "LEAD" in out and "NOT evidence" in out)
rc, out = recall("nothing-matches-this-xyz")
ok("no hit: exit 1, and the footer still says no hit is not evidence", rc == 1 and "0 hit(s)" in out and "NOT evidence" in out, out)
rc, out = recall("zebra", "--alias", "CC-A")
ok("--alias keeps only that session", rc == 1, out)
rc, out = recall("token", "--since", "2026-10-21")
ok("--since drops earlier day files", rc == 1, out)
rc, out = recall("private", "--batch", "B-TOKEN-WATCH")
ok("--batch keeps only conversations that mention it", rc == 1, out)
rc, out = recall("zebra", "--actions")
ok("--actions searches the action list only (the nested Grep row, one hit)", rc == 0 and "1 hit(s)" in out and "Search for the zebra" in out and "sub/0fe1c46a" in out, out)
rc, out = recall("zebra", "--bogus")
ok("an unknown argument is refused, exit 2", rc == 2)
ok("recall's stdout is LF", b"\r\n" not in subprocess.run([sys.executable, "-I", os.path.join(HERE, "dt_recall.py"), "zebra", "--root", root],
                                                         capture_output=True).stdout)

print("5. Langston P6 review: a flag with no value, an empty query, --since and nested files, a stray file, a failure")


def recall_raw(*a):
    p = subprocess.run([sys.executable, "-I", os.path.join(HERE, "dt_recall.py")] + list(a), capture_output=True)
    return p.returncode, p.stdout.decode("utf-8", "replace") + p.stderr.decode("utf-8", "replace")


for flag in ("--alias", "--since", "--batch"):
    rc, out = recall_raw("zebra", flag, "--root", root)          # the flag's value would be "--root"
    ok("must-fix 1: %s with no value is REFUSED (exit 2), never a dropped filter" % flag, rc == 2 and "needs a value" in out, (rc, out))
    rc, out = recall_raw("zebra", "--root", root, flag)            # the flag is the LAST argument
    ok("must-fix 1: ...and as the last argument too (%s)" % flag, rc == 2 and "needs a value" in out, (rc, out))
rc, out = recall_raw("zebra", "--root")
ok("must-fix 1: a bare --root is refused, never the live laptop archive", rc == 2 and "needs a value" in out, (rc, out))
for q, extra in (("", ()), ("   ", ()), ("", ("--actions",))):
    rc, out = recall_raw(q, "--root", root, *extra)
    ok("must-fix 3: an empty query %r%s is REFUSED (exit 2) - never a zero, never every row" % (q, " --actions" if extra else ""),
       rc == 2 and "empty query" in out, (rc, out))
rc, out = recall("zebra", "--actions")
ok("must-fix 2: (control) the nested action row is found without --since", rc == 0 and "sub/0fe1c46a" in out, out)
rc, out = recall("zebra", "--actions", "--since", "2026-10-20")
ok("must-fix 2: --since leaves the undated nested action row OUT, as the text arm does, and SAYS so",
   rc == 1 and "left out 1 nested" in out, out)
rc, out = recall("token watch", "--since", "2026-10-20")
ok("must-fix 2: a text search under --since says how many nested transcripts it left out",
   "left out 1 nested" in out, out)
stray = os.path.join(root, "CC-B", "sub", "stray.txt")
open(stray, "w").write("not a folder")
rc, out = recall("zebra finding")
ok("must-fix 4: a stray FILE in <alias>/sub/ does not crash the search (exit 0, the hit still found)", rc == 0 and "1 hit(s)" in out, (rc, out))
os.remove(stray)
tsv_path = os.path.join(root, "ACTIONS.tsv")
os.rename(tsv_path, tsv_path + ".aside")
os.makedirs(tsv_path)                                             # an archive layout the tool cannot read
rc, out = recall_raw("zebra", "--actions", "--root", root)
ok("must-fix 4: a search that FAILS exits 3 and says so - never the no-hits code 1", rc == 3 and "SEARCH FAILED" in out, (rc, out))
os.rmdir(tsv_path)
os.rename(tsv_path + ".aside", tsv_path)

for bad in ("2026-1-5", "11-05", "yesterday", "2026-13-45", "2026-02-30"):
    rc, out = recall_raw("zebra", "--since", bad, "--root", root)
    ok("P6 r3 must-fix 7: --since %r is REFUSED (exit 2), never a voided or zeroed filter" % bad,
       rc == 2 and "real date" in out, (rc, out))
rc, out = recall("zebra finding", "--batch", "B-TOKEN-WATCH")
ok("P6 r3 must-fix 8: (control) --batch as written keeps the conversation", rc == 0 and "1 hit(s)" in out, out)
rc, out = recall("zebra finding", "--batch", "b-token-watch")
ok("P6 r3 must-fix 8: --batch is case-blind in the TEXT arm too (same hit)", rc == 0 and "1 hit(s)" in out, out)
rc, out = recall("zebra", "--actions", "--batch", "b-token-watch")
rc2, out2 = recall("zebra", "--actions", "--batch", "B-TOKEN-WATCH")
ok("P6 r3 must-fix 8: ...and the two arms agree on case (actions arm: same result either case)", rc == rc2, (rc, rc2))

print("6. claim 4 by TEST, not only by construction: a phrase only inside a redacted secret is not found")
import hmac, hashlib  # noqa: E402,E401
KEY = bytes(range(32))
SECRET = "Qm" + "7Vx2Lp9Rt4Wz8Kc"
hs = [{"name": "FRED_API_KEY", "length": len(SECRET), "hmac": hmac.new(KEY, SECRET.encode(), hashlib.sha256).hexdigest(),
       "key_id": dt.key_id(KEY)}]
with open(os.path.join(proj, "C--DawnTraderV3-old", SB + ".jsonl"), "a", newline="\n") as fh:
    fh.write(raw([{"type": "user", "uuid": "o2", "timestamp": "2026-10-22T11:00:00Z",
                   "message": {"content": "the walrus credential is " + SECRET + " keep it"}}]))
da.archive_all(root, proj, dt.Redactor(hs, key=KEY))
rc, out = recall(SECRET)
ok("the secret itself returns NO hit (exit 1)", rc == 1 and "0 hit(s)" in out and SECRET not in out, out)
rc, out = recall("walrus credential")
ok("...while the SAME line's other words DO hit - so that zero is redaction, not a broken query",
   rc == 0 and "1 hit(s)" in out and SECRET not in out, out)
shutil.rmtree(base)
print("\n%d failed" % len(FAILS))
sys.exit(1 if FAILS else 0)
