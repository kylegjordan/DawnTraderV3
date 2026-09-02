"""Mutation runner for the quote-asset and graduation guards.

JUDGED BY EXIT CODE, NEVER BY GREPPING FOR "FAIL" -- a mutation that CRASHES
the suite prints no FAIL lines and reads as "survived". And the patch is
VERIFIED APPLIED before its result is read: a replace that silently matched
nothing produces a green run that looks like a surviving mutant.
"""
import io, os, subprocess, sys

SRC = "providers.py"          # RUN FROM token-watch/, not from tests/
assert os.path.exists(SRC), "run this from the token-watch directory"
SUITE = ["python3", "tests/test_pool_liquidity.py"]

MUTATIONS = [
    ("M6  ignore the quote asset, always scale as SOL",
     "scale = float(10 ** qdec)",
     "scale = float(10 ** 9)"),
    ("M7  an unknown quote asset falls through to SOL instead of refusing",
     'return {"sol": None, "source": "curve_unknown_quote_asset",',
     'qraw = QUOTE_SOL_BYTES\n            return {"sol": None, "source": "curve_unknown_quote_asset_DISABLED",'),
    ("M8  drop the graduation guard",
     "if len(raw) > 48 and raw[48] == 1:",
     "if False:"),
    ("M9  put the quote amount in the field named sol",
     'return {"sol": (rsol / scale) if qsym == "SOL" else None,',
     'return {"sol": rsol / scale,'),
    ("M10 drop the too-short fail-closed guard",
     "if len(raw) < hi:",
     "if False:"),
    ("M11 drop the uninitialised-curve guard",
     "if not _vtok:",
     "if False:"),
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
        mutated = original.replace(old, new)
        io.open(SRC, "w", encoding="utf-8", newline="\r\n").write(mutated)
        # VERIFY THE MUTATION IS ACTUALLY ON DISK before reading its result.
        on_disk = io.open(SRC, encoding="utf-8").read()
        if new.splitlines()[0] not in on_disk:
            print("  ERROR %s -- patch did not land; result would be meaningless" % name)
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

# NEGATIVE CONTROL: with the file restored the suite must be GREEN again, or
# every "CAUGHT" above is just a broken working copy.
rc = subprocess.call(SUITE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print("")
print("restored source, suite exit %d (must be 0)" % rc)
print("%d caught, %d survived" % (caught, survived))
sys.exit(1 if (survived or rc) else 0)
