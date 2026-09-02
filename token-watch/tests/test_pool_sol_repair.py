"""token-watch -- the pool_sol repair pass, and the corrections it writes.

WHAT IT IS REPAIRING. Two sweeps on 2026-09-02 recorded `pool_sol` through a
   decoder with two faults: a drained (graduated) curve reported as
   `sol: 0.0`, and a USDC-quoted reserve scaled as though it were SOL --
   understating it 1,000-fold. Both are EXTRACTION defects, so the raw bodies
   in the provenance store make them a re-parse rather than a lost
   observation.

THE ONE THING THESE CHECKS EXIST TO PREVENT, and it already happened once:
   the first dry run reported 2,784 of 2,784 rows "materially changed",
   because the comparison included fields the OLD decoder never wrote. That is
   a SCHEMA change wearing a value change's clothes, and it would have buried
   the ~90 genuinely wrong rows among thousands of correct ones. The
   discrimination check below is the fence for it.

A TRUE ZERO MUST SURVIVE THE REPAIR. A live curve nobody has bought into
   really does hold zero, and that is a finding, not a fault. If the repair
   cannot tell it from a drained curve it destroys real data while claiming to
   fix it.
"""

import base64
import json
import os
import struct
import sys
import tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

os.environ.setdefault("TOKEN_WATCH_ROOT", tempfile.mkdtemp(prefix="token-watch-rep-"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import providers  # noqa: E402
import store  # noqa: E402
import repair_pool_sol  # noqa: E402

PASS = FAIL = 0

V_TOKEN = 1070587035411929
V_SOL = 30067616482
R_TOKEN = 790687035411929
R_SOL = 67616482
SUPPLY = 1000000000000000
QUOTE_SOL = bytes(32)
QUOTE_USDC = bytes.fromhex(
    "c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61")


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  PASS  " + label)
    else:
        FAIL += 1
        print("  FAIL  " + label + ("  -- " + detail if detail else ""))


def account(quote=QUOTE_SOL, complete=0, rsol=R_SOL, vtok=V_TOKEN):
    raw = bytearray(bytes(8) + struct.pack("<QQQQQ", vtok, V_SOL, R_TOKEN, rsol, SUPPLY))
    raw += bytes(115 - len(raw))
    raw[48] = complete
    raw[83:115] = quote
    return {"owner": providers.PUMPFUN_PROGRAM,
            "data": [base64.b64encode(bytes(raw)).decode(), "base64"]}


print("\nBLOCK 1 -- THE COMPARISON DISCRIMINATES A VALUE CHANGE FROM A SCHEMA CHANGE")
# The old decoder wrote neither `quote_symbol` nor `quote_amount`. A comparison
#    that includes them marks EVERY row as changed, which is the same as
#    marking none -- measured, 2,784 of 2,784 on the first run.
_new = providers.decode_curve_account(account())
_old_same = {"sol": _new["sol"], "source": _new["source"]}
check("a row whose meaning is unchanged is NOT flagged",
      not repair_pool_sol._differs(_old_same, _new), str(_new))
check("...even though the corrected record carries fields the old one lacked",
      "quote_symbol" in _new and "quote_symbol" not in _old_same, str(_new))
# And it must still catch the two real faults.
_old_grad = {"sol": 0.0, "source": "bonding_curve_real_reserves"}
_new_grad = providers.decode_curve_account(account(complete=1))
check("★ a drained curve read as an empty pool IS flagged",
      repair_pool_sol._differs(_old_grad, _new_grad), str(_new_grad))
_new_usdc = providers.decode_curve_account(account(quote=QUOTE_USDC))
_old_usdc = {"sol": R_SOL / 1e9, "source": "bonding_curve_real_reserves"}
check("★ a USDC reserve scaled as SOL IS flagged",
      repair_pool_sol._differs(_old_usdc, _new_usdc), str(_new_usdc))
check("...and the corrected amount is 1000x the value that was stored",
      abs(_new_usdc["quote_amount"] - _old_usdc["sol"] * 1000.0) < 1e-6,
      "%s vs %s" % (_new_usdc["quote_amount"], _old_usdc["sol"]))

print("\nBLOCK 2 -- A TRUE ZERO IS NOT A FAULT AND MUST SURVIVE THE REPAIR")
# A LIVE curve with no real reserves is a token nobody has bought a single
#    unit of. That is one of the study's more interesting findings, and a
#    repair that cannot tell it from a drained curve would delete it.
_true_zero = providers.decode_curve_account(account(complete=0, rsol=0))
check("★ a live curve with zero reserves still reports zero, not None",
      _true_zero["sol"] == 0.0
      and _true_zero["source"] == "bonding_curve_real_reserves", str(_true_zero))
check("★ ...and is NOT flagged for correction",
      not repair_pool_sol._differs(
          {"sol": 0.0, "source": "bonding_curve_real_reserves"}, _true_zero),
      str(_true_zero))
check("★ while a DRAINED curve at the same zero IS distinguished from it",
      _new_grad["sol"] is None
      and _new_grad["source"] == "curve_complete_graduated", str(_new_grad))

print("\nBLOCK 3 -- THE CORRECTIONS STORE")
store.record_pool_sol_correction(
    {"mint": "M1", "observed_at": "2026-09-02T09:07:47+00:00",
     "corrected": {"sol": None, "source": "curve_complete_graduated"}})
idx = store.pool_sol_correction_index()
check("a correction is retrievable by (mint, observed_at)",
      idx.get(("M1", "2026-09-02T09:07:47+00:00", )) is not None
      or idx.get(("M1", "2026-09-02T09:07:47+00:00")) is not None, str(idx))
check("...and carries the corrected value, not just a marker",
      (idx.get(("M1", "2026-09-02T09:07:47+00:00")) or {}).get("source")
      == "curve_complete_graduated", str(idx))

# ⛔ AMBIGUOUS KEYS ARE DROPPED, NOT GUESSED -- the rule the mint index already
#    follows. A wrong substitution is undetectable in a way a missing one
#    is not.
store.record_pool_sol_correction(
    {"mint": "M2", "observed_at": "2026-09-02T09:07:47+00:00",
     "corrected": {"sol": 1.0, "source": "bonding_curve_real_reserves"}})
store.record_pool_sol_correction(
    {"mint": "M2", "observed_at": "2026-09-02T09:07:47+00:00",
     "corrected": {"sol": 2.0, "source": "bonding_curve_real_reserves"}})
idx = store.pool_sol_correction_index()
check("★ a key with two DIFFERENT corrections is poisoned, never guessed",
      ("M2", "2026-09-02T09:07:47+00:00") in idx
      and idx[("M2", "2026-09-02T09:07:47+00:00")] is None, str(idx))
# A repeat of the SAME correction is idempotent, so re-running the pass twice
#    does not poison every key it already wrote.
store.record_pool_sol_correction(
    {"mint": "M1", "observed_at": "2026-09-02T09:07:47+00:00",
     "corrected": {"sol": None, "source": "curve_complete_graduated"}})
idx = store.pool_sol_correction_index()
check("★ re-running the repair is idempotent, not self-poisoning",
      (idx.get(("M1", "2026-09-02T09:07:47+00:00")) or {}).get("source")
      == "curve_complete_graduated", str(idx))
# A record with no key must add NO entry. Asserted by comparing the index
#    size across the write -- an earlier draft of this file asserted `True`
#    here, which is the shape Langston has bounced twice in this batch: a
#    check that cannot come out differently is not a check.
_before = len(idx)
store.record_pool_sol_correction({"corrected": {"sol": 1.0}})
idx2 = store.pool_sol_correction_index()
check("★ a record missing its key adds NO entry",
      len(idx2) == _before, "%d entries before, %d after" % (_before, len(idx2)))

print("\n%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
