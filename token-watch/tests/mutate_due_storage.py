"""
token-watch — mutation proof for test_due_storage.py. (B-TOKEN-WATCH-STORAGE amendment 1, P8)

Each mutation breaks ONE rule in a COPY of the package, runs the suite from
the copy, and passes only if the suite EXITS NON-ZERO **and** prints the named
FAIL line. ⛔ Judged by exit code and the named line, never by grepping for
"FAIL" alone: a mutation that crashes the suite prints no FAIL line and would
read as "caught". And each patch is checked to have APPLIED (exactly one match)
before its result is read.
"""

import os
import shutil
import subprocess
import sys
import tempfile

PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MUTATIONS = [
    ("no cursor bound: a bucket after the cursor is treated as read",
     "tier.py", "            elif h > last:\n", "            elif False:\n",
     "FAIL ★ every OLD unread bucket after a stalled cursor survived"),
    ("no consumed_from: the lineage start is ignored",
     "tier.py", "            elif h < first:\n", "            elif False:\n",
     "FAIL ★ after cursor loss + one run, NOTHING old is removed"),
    ("no consumed_from on a lost cursor: the first run does not start a lineage",
     "follow_up.py", '        rec["consumed_from"] = min(buckets).strftime("%Y-%m-%dT%H")\n', "        pass\n",
     "FAIL ★ the new lineage starts at this hour"),
    ("no probe: the feed watch reads an unreadable census as quiet",
     "ops/feed_watch.py", "    problems = liveness.probe_readable()\n", "    problems = []\n",
     "FAIL ★ run_check exits non-zero on a failed probe"),
    ("the backfill counts the miss rows",
     "tools/backfill_consumed_from.py", "            if rec.get(\"reason\") != MISS_REASON:\n",
     "            if True:\n",
     "FAIL ★ the miss row is excluded: derived hour is the follow-up's"),
]


def main() -> int:
    bad = 0
    for label, rel, old, new, expect in MUTATIONS:
        work = tempfile.mkdtemp(prefix="tw-mutant-")
        copy = os.path.join(work, "token-watch")
        shutil.copytree(PKG, copy, ignore=shutil.ignore_patterns("__pycache__"))
        path = os.path.join(copy, rel)
        src = open(path, encoding="utf-8").read().replace("\r\n", "\n")
        n = src.count(old)
        if n != 1:
            print("NOT APPLIED (%d matches): %s" % (n, label))
            bad += 1
            shutil.rmtree(work, ignore_errors=True)
            continue
        open(path, "w", encoding="utf-8", newline="\n").write(src.replace(old, new))
        r = subprocess.run([sys.executable, os.path.join(copy, "tests", "test_due_storage.py")],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        caught = r.returncode != 0 and expect in r.stdout
        print("%s  %s  (rc=%d, named line %s)" % ("CAUGHT " if caught else "SURVIVED", label, r.returncode,
                                                  "present" if expect in r.stdout else "ABSENT"))
        bad += not caught
        shutil.rmtree(work, ignore_errors=True)
    print("%d of %d mutations caught" % (len(MUTATIONS) - bad, len(MUTATIONS)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
