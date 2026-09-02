"""Mutation runner for the creator-stake extraction.

JUDGED BY EXIT CODE, NEVER BY GREPPING FOR "FAIL" -- a mutation that CRASHES
prints no FAIL lines and reads as survived. Each patch is VERIFIED ON DISK
before its result is read, because a replace that matched nothing produces a
green run indistinguishable from a surviving mutant.

⛔ THE OUTPUT AND THE SOURCE ARE RESTORED IN A `finally`, and the negative
   control at the end re-runs the suite on the restored source: without it,
   every "CAUGHT" could be a broken working copy rather than a working fence.
"""

import io
import os
import subprocess
import sys

SRC = "receiver.py"
assert os.path.exists(SRC), "run this from the token-watch directory"
SUITE = ["python3", "tests/test_creator_stake.py"]

MUTATIONS = [
    ("M1  take the FIRST transfer to the creator instead of summing them",
     "            try:\n                total += float(t.get(\"tokenAmount\") or 0)\n                seen = True",
     "            try:\n                total = float(t.get(\"tokenAmount\") or 0) if not seen else total\n                seen = True"),
    ("M2  count transfers to ANYONE, not just the creator",
     'if t.get("toUserAccount") == creator and t.get("mint") == mint:',
     'if t.get("mint") == mint:'),
    ("M3  collapse the two zero states into one name",
     'return 0.0, 0.0, "transfers_to_others_only"',
     'return 0.0, 0.0, "no_token_transfers"'),
    ("M4  report a creator who took nothing as an extraction failure",
     'return 0.0, 0.0, "no_token_transfers"',
     'return None, None, "not_extracted"'),
    ("M5  divide by the wrong supply constant",
     "STANDARD_SUPPLY = 1_000_000_000",
     "STANDARD_SUPPLY = 1_000_000"),
]

original = io.open(SRC, encoding="utf-8").read()
caught = survived = 0
try:
    for name, old, new in MUTATIONS:
        n = original.count(old)
        if n != 1:
            print("  SKIP  %s -- anchor matched %d times, not 1" % (name, n))
            survived += 1
            continue
        io.open(SRC, "w", encoding="utf-8", newline="\r\n").write(original.replace(old, new))
        if new.splitlines()[0] not in io.open(SRC, encoding="utf-8").read():
            print("  ERROR %s -- patch did not land; its result would be meaningless" % name)
            survived += 1
            continue
        rc = subprocess.call(SUITE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if rc != 0:
            print("  CAUGHT   %s   (suite exit %d)" % (name, rc))
            caught += 1
        else:
            print("  SURVIVED %s   -- NOTHING TESTS THIS" % name)
            survived += 1
finally:
    io.open(SRC, "w", encoding="utf-8", newline="\r\n").write(original)

rc = subprocess.call(SUITE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print("")
print("restored source, suite exit %d (must be 0)" % rc)
print("%d caught, %d survived" % (caught, survived))
sys.exit(1 if (survived or rc) else 0)
