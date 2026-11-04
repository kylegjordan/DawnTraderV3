"""
token-watch — mutation runner for cold_offbox.py. (B-TOKEN-WATCH-STORAGE P8)

★ A test that has never been seen to fail proves nothing about the check it
  covers. Each mutation below switches ONE safety check off in a temporary copy
  of the module, confirms the edit actually applied (by line, not by hoping a
  string matched), runs test_cold_offbox.py against the copy, and requires the
  NAMED block to fail. Judged by the suite's exit code AND the named block's
  FAIL line — a crash would also exit non-zero, so the FAIL line is required.

Run:  python3 token-watch/tests/mutate_cold_offbox.py   (exit 0 = every mutation caught)
"""

import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), "ops", "cold_offbox.py")
SUITE = os.path.join(HERE, "test_cold_offbox.py")

MUTATIONS = [
    # (name, the exact line to find, its replacement, the block that must FAIL)
    ("read-back comparison off",
     "    if back_sha != sha256 or back_n != size:", "    if False:", "FAIL T2"),
    ("decompress-to-EOF off",
     "    uncompressed = decompressed_size(path)                    # FileFailed on a truncated archive",
     "    uncompressed = 0", "FAIL T3"),
    ("prefix refusal off",
     "    if allowed.get(\"namePrefix\") != KEY_PREFIX:", "    if False:", "FAIL T6"),
    ("capability allowlist off",
     "    if set(caps) != ALLOWED_CAPABILITIES:", "    if False:", "FAIL T8"),
    ("capabilities-present check off (the vacuous-pass case)",
     "    if not isinstance(caps, list) or not caps:", "    if False:", "FAIL T11"),
    ("bucket check off",
     "    if not _one_bucket(buckets):", "    if False:", "FAIL T13"),
    ("bucket name and id clauses dropped",
     "            and buckets[0].get(\"name\") == BUCKET_NAME and bool(buckets[0].get(\"id\")))",
     "            )", "FAIL T15"),
    ("bucket entry type clause dropped",
     "    return (isinstance(buckets, list) and len(buckets) == 1 and isinstance(buckets[0], dict)",
     "    return (isinstance(buckets, list) and len(buckets) == 1", "FAIL T17"),
    ("v4-shape check off",
     "    if not isinstance(allowed, dict):", "    if False:", "FAIL T10"),
    ("abort on transport failure off (carry on instead)",
     "                raise Abort(\"%s failed twice (HTTP %s)\" % (what, exc.code))",
     "                raise FileFailed(\"%s failed twice (HTTP %s)\" % (what, exc.code))", "FAIL T5"),
]

src = open(SRC, encoding="utf-8").read().split("\n")
caught = 0
for name, find, repl, must in MUTATIONS:
    hits = [i for i, line in enumerate(src) if line == find]
    if len(hits) != 1:
        print("BROKEN RUNNER %s: the target line occurs %d times, expected 1" % (name, len(hits)))
        continue
    mutated = list(src)
    mutated[hits[0]] = repl
    assert mutated[hits[0]] != src[hits[0]], "mutation did not change the line"
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8",
                                     dir=os.path.dirname(SRC)) as fh:
        fh.write("\n".join(mutated))
        path = fh.name
    try:
        r = subprocess.run([sys.executable, SUITE], capture_output=True, text=True,
                           env=dict(os.environ, COLD_OFFBOX_MODULE=path), timeout=300)
    finally:
        os.unlink(path)
    hit = r.returncode != 0 and any(l.startswith(must) for l in r.stdout.splitlines())
    caught += hit
    print(("CAUGHT  " if hit else "MISSED  ") + "%s (line %d): suite exit %d, %s %s"
          % (name, hits[0] + 1, r.returncode, must, "present" if hit else "ABSENT"))

print("%d of %d mutations caught" % (caught, len(MUTATIONS)))
sys.exit(0 if caught == len(MUTATIONS) else 1)
