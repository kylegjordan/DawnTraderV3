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
     "was": {"sol": 0.0},
     "corrected": {"sol": None, "source": "curve_complete_graduated"}})
idx = store.pool_sol_correction_index()
check("a correction is retrievable by (mint, observed_at)",
      idx.get(("M1", "2026-09-02T09:07:47+00:00", )) is not None
      or idx.get(("M1", "2026-09-02T09:07:47+00:00")) is not None, str(idx))
check("...and carries the corrected value, not just a marker",
      ((idx.get(("M1", "2026-09-02T09:07:47+00:00")) or {}).get("corrected")
       or {}).get("source") == "curve_complete_graduated", str(idx))
# THE INDEX ALSO CARRIES THE VALUE THE CORRECTION WAS COMPUTED FROM, which is
#    what lets the join validate itself against a non-unique key -- measured,
#    5 duplicate (mint, observed_at) pairs in 47,093 live rows.
check("...and the value it was computed FROM, for the self-validating join",
      "was" in (idx.get(("M1", "2026-09-02T09:07:47+00:00")) or {}), str(idx))

# ⛔ AMBIGUOUS KEYS ARE DROPPED, NOT GUESSED -- the rule the mint index already
#    follows. A wrong substitution is undetectable in a way a missing one
#    is not.
store.record_pool_sol_correction(
    {"mint": "M2", "observed_at": "2026-09-02T09:07:47+00:00",
     "was": {"sol": 0.0},
     "corrected": {"sol": 1.0, "source": "bonding_curve_real_reserves"}})
store.record_pool_sol_correction(
    {"mint": "M2", "observed_at": "2026-09-02T09:07:47+00:00",
     "was": {"sol": 0.0},
     "corrected": {"sol": 2.0, "source": "bonding_curve_real_reserves"}})
idx = store.pool_sol_correction_index()
check("★ a key with two DIFFERENT corrections is poisoned, never guessed",
      ("M2", "2026-09-02T09:07:47+00:00") in idx
      and idx[("M2", "2026-09-02T09:07:47+00:00")] is None, str(idx))
# A repeat of the SAME correction is idempotent, so re-running the pass twice
#    does not poison every key it already wrote.
store.record_pool_sol_correction(
    {"mint": "M1", "observed_at": "2026-09-02T09:07:47+00:00",
     "was": {"sol": 0.0},
     "corrected": {"sol": None, "source": "curve_complete_graduated"}})
idx = store.pool_sol_correction_index()
check("★ re-running the repair is idempotent, not self-poisoning",
      ((idx.get(("M1", "2026-09-02T09:07:47+00:00")) or {}).get("corrected")
       or {}).get("source") == "curve_complete_graduated", str(idx))
# A record with no key must add NO entry. Asserted by comparing the index
#    size across the write -- an earlier draft of this file asserted `True`
#    here, which is the shape Langston has bounced twice in this batch: a
#    check that cannot come out differently is not a check.
_before = len(idx)
store.record_pool_sol_correction({"was": {"sol": 0.0}, "corrected": {"sol": 1.0}})
idx2 = store.pool_sol_correction_index()
check("★ a record missing its key adds NO entry",
      len(idx2) == _before, "%d entries before, %d after" % (_before, len(idx2)))


print("")
print("BLOCK 4 -- THE DEFAULT READ PATH CORRECTS. THIS IS LANGSTON'S BLOCKER.")
# HE CAUGHT ME BUILDING THE CORRECTION STORE WITHOUT THIS, sixty lines below a
#    docstring of mine stating the exact invariant it violates:
#    "a raw store plus a correction set joined by convention is two objects
#    that must be combined correctly by every reader forever, and it fails
#    quietly in whichever one forgot. So the DEFAULT read path corrects."
#    Same file, same day, one function apart. Nothing reads `pool_sol` yet,
#    which is precisely why the fix was still free -- a corrections file the
#    default path does not apply is not a repair, it is a repair the next
#    reader has to remember.
from datetime import datetime, timezone  # noqa: E402

WHEN = datetime(2026, 9, 2, 9, 7, 47, tzinfo=timezone.utc)
DAY = WHEN.strftime("%Y-%m-%d") + ".jsonl"
WRONG = {"sol": 0.0, "source": "bonding_curve_real_reserves"}
RIGHT = {"sol": None, "source": "curve_complete_graduated", "graduated": True}
UNTOUCHED = {"sol": 1.25, "source": "bonding_curve_real_reserves"}

store.record_observation("GRAD1", "1h", WHEN, {"pool_sol": dict(WRONG)})
store.record_observation("CLEAN1", "1h", WHEN, {"pool_sol": dict(UNTOUCHED)})
store.record_pool_sol_correction(
    {"mint": "GRAD1", "observed_at": WHEN.isoformat(),
     "was": dict(WRONG), "corrected": dict(RIGHT)})

_raw = {r["mint"]: r for r in store.read_observations_uncorrected(DAY)}
_cor = {r["mint"]: r for r in store.observations(DAY)}

check("the corrected row comes back CORRECTED from the default path",
      _cor["GRAD1"]["pool_sol"]["source"] == "curve_complete_graduated",
      str(_cor["GRAD1"]["pool_sol"]))
check("...and is marked as having been corrected, not silently swapped",
      _cor["GRAD1"].get("pool_sol_correction") == "applied", str(_cor["GRAD1"]))
# THE DISCRIMINATING CONTROL. If both paths returned the same thing the
#    default-corrects claim would be untested -- the two must DIFFER on
#    exactly this row, which is the entire point of the pair.
check("the RAW path still returns the original wrong value",
      _raw["GRAD1"]["pool_sol"]["sol"] == 0.0
      and _raw["GRAD1"]["pool_sol"]["source"] == "bonding_curve_real_reserves",
      str(_raw["GRAD1"]["pool_sol"]))
check("...so the two paths DIFFER on the corrected row",
      _raw["GRAD1"]["pool_sol"] != _cor["GRAD1"]["pool_sol"], "identical")
check("a row with no correction is unchanged by either path",
      _raw["CLEAN1"]["pool_sol"] == _cor["CLEAN1"]["pool_sol"] == UNTOUCHED,
      str(_cor["CLEAN1"]["pool_sol"]))
check("...and carries no correction marker",
      "pool_sol_correction" not in _cor["CLEAN1"], str(_cor["CLEAN1"]))

# AN AMBIGUOUS KEY IS FLAGGED, NEVER LEFT LOOKING CLEAN. Returning the
#    known-wrong original with no marker would make an unresolvable row
#    indistinguishable from a correct one -- the absent-as-valid shape.
store.record_observation("AMB1", "1h", WHEN, {"pool_sol": dict(WRONG)})
for _val in (1.0, 2.0):
    store.record_pool_sol_correction(
        {"mint": "AMB1", "observed_at": WHEN.isoformat(),
         "was": dict(WRONG),
         "corrected": {"sol": _val, "source": "bonding_curve_real_reserves"}})
_cor = {r["mint"]: r for r in store.observations(DAY)}
check("a row whose corrections disagree is FLAGGED unresolvable",
      _cor["AMB1"].get("pool_sol_correction") == "ambiguous_unresolvable",
      str(_cor["AMB1"]))
check("...and is not quietly given either of the disagreeing values",
      _cor["AMB1"]["pool_sol"] == WRONG, str(_cor["AMB1"]["pool_sol"]))


print("")
print("BLOCK 5 -- THE KEY IS NOT UNIQUE, AND THE JOIN VALIDATES ITSELF")
# MEASURED ON THE LIVE STORE: 5 duplicate (mint, observed_at) pairs in 47,093
#    rows, and ONE of those pairs carries a DIFFERENT pool_sol on each row. So
#    a correction matched on the key alone is applied to BOTH rows and is
#    wrong for one of them.
# FOUND BY CHASING A ONE-ROW DISCREPANCY -- 86 corrections applied, 87 rows
#    differing -- rather than rounding it off. The extra row was my own
#    verification collapsing a duplicate key, and the collapse was the finding.
# THE FIX: a correction records the value it was computed FROM, so it applies
#    only to a row still holding that value. Its twin is MARKED, never
#    silently overwritten with a correction that may not belong to it.
TWIN_WHEN = datetime(2026, 9, 2, 11, 0, 0, tzinfo=timezone.utc)
TWIN_DAY = TWIN_WHEN.strftime("%Y-%m-%d") + ".jsonl"
MINE = {"sol": 0.0, "source": "bonding_curve_real_reserves"}
THEIRS = {"sol": 4.5, "source": "bonding_curve_real_reserves"}

# Two rows, SAME mint and SAME observed_at, different pool_sol -- the shape
#    that exists in the live store.
store.record_observation("TWIN", "1h", TWIN_WHEN, {"pool_sol": dict(MINE)})
store.record_observation("TWIN", "24h", TWIN_WHEN, {"pool_sol": dict(THEIRS)})
store.record_pool_sol_correction(
    {"mint": "TWIN", "observed_at": TWIN_WHEN.isoformat(),
     "was": dict(MINE),
     "corrected": {"sol": None, "source": "curve_complete_graduated"}})

_rows = [r for r in store.observations(TWIN_DAY) if r.get("mint") == "TWIN"]
_hit = [r for r in _rows if r.get("pool_sol_correction") == "applied"]
_miss = [r for r in _rows if r.get("pool_sol_correction") == "not_applied_value_mismatch"]
check("both rows sharing the key are returned", len(_rows) == 2, str(len(_rows)))
check("EXACTLY ONE of them takes the correction",
      len(_hit) == 1, "%d applied" % len(_hit))
check("...and it is the row the correction was computed FROM",
      _hit and _hit[0]["pool_sol"]["source"] == "curve_complete_graduated",
      str(_hit))
# THE DISCRIMINATING HALF. Without this the block would pass on an
#    implementation that corrected both rows and happened to check only one.
check("the TWIN row is NOT overwritten by a correction that is not its own",
      len(_miss) == 1 and _miss[0]["pool_sol"] == THEIRS, str(_miss))
check("...and it is MARKED, so an unapplied correction is never invisible",
      _miss and _miss[0]["pool_sol_correction"] == "not_applied_value_mismatch",
      str(_miss))


print("")
print("BLOCK 6 -- THE FIX ITSELF FAILED OPEN, AND THE INDEX HAD A FALSE POSITIVE")
# BOTH FOUND BY LANGSTON, 2026-09-02, reading the fix for the previous defect.

# ── 6a. THE VALIDATOR WAS OPT-IN BY THE PRESENCE OF A FIELD ───────────────
# `if was and any(...)` -- a correction written WITHOUT `was` got {}, which
#    falsified the guard and dropped through to the unconditional apply: the
#    key-only join that had just been removed, restored by an ABSENT FIELD.
#    His words: the opt-out being an omission is the exact distinction drawn
#    sixty lines up, and I wrote the sibling that ignores it again, one
#    function apart, inside the fix for the first instance.
_rejected = False
try:
    store.record_pool_sol_correction(
        {"mint": "NOWAS", "observed_at": "2026-09-02T12:00:00+00:00",
         "corrected": {"sol": None, "source": "curve_complete_graduated"}})
except ValueError:
    _rejected = True
check("a correction with no `was` is REJECTED AT WRITE TIME",
      _rejected, "it was accepted")
# THE DISCRIMINATING HALF: rejected at the door, not merely ignored later.
#    A record that entered the store and was skipped on read would leave the
#    fail-open one careless reader away from returning.
check("...and does not enter the store at all",
      ("NOWAS", "2026-09-02T12:00:00+00:00") not in store.pool_sol_correction_index(),
      "it is in the index")
_rejected_empty = False
try:
    store.record_pool_sol_correction(
        {"mint": "EMPTYWAS", "observed_at": "2026-09-02T12:00:00+00:00",
         "was": {}, "corrected": {"sol": 1.0}})
except ValueError:
    _rejected_empty = True
check("an EMPTY `was` is rejected too, not treated as present",
      _rejected_empty, "an empty dict was accepted")

# ── 6b. THE INDEX POISONED ON `corrected` ALONE, WHICH WAS A FALSE POSITIVE
# The repair re-decodes both duplicate-key twins from the SAME pair address,
#    so twins yield two corrections with the SAME `corrected` and DIFFERENT
#    `was`. Comparing `corrected` alone left them unpoisoned, last-write-wins
#    kept one `was`, and the OTHER twin was then marked
#    `not_applied_value_mismatch` DESPITE a correct correction existing for it.
FP_WHEN = datetime(2026, 9, 2, 13, 0, 0, tzinfo=timezone.utc)
FP_DAY = FP_WHEN.strftime("%Y-%m-%d") + ".jsonl"
A = {"sol": 0.0, "source": "bonding_curve_real_reserves"}
B = {"sol": 9.5, "source": "bonding_curve_real_reserves"}
SAME = {"sol": None, "source": "curve_complete_graduated"}
store.record_observation("FPTWIN", "1h", FP_WHEN, {"pool_sol": dict(A)})
store.record_observation("FPTWIN", "24h", FP_WHEN, {"pool_sol": dict(B)})
for _w in (A, B):
    store.record_pool_sol_correction(
        {"mint": "FPTWIN", "observed_at": FP_WHEN.isoformat(),
         "was": dict(_w), "corrected": dict(SAME)})

_idx = store.pool_sol_correction_index()
check("twins with the same correction but different `was` POISON the key",
      _idx.get(("FPTWIN", FP_WHEN.isoformat()), "missing") is None, str(_idx))
_fp = [r for r in store.observations(FP_DAY) if r.get("mint") == "FPTWIN"]
_mismatch = [r for r in _fp if r.get("pool_sol_correction") == "not_applied_value_mismatch"]
_amb = [r for r in _fp if r.get("pool_sol_correction") == "ambiguous_unresolvable"]
# THE DISCRIMINATING HALF: before the fix exactly one twin was marked
#    MISMATCHED -- the wrong verdict, because a correct correction for it was
#    in the store. Now neither is, and both are marked unresolvable instead.
check("NEITHER twin is falsely marked mismatched", len(_mismatch) == 0, str(_fp))
check("...both are marked unresolvable instead", len(_amb) == 2, str(_fp))
check("...and neither value is silently overwritten",
      sorted(r["pool_sol"]["sol"] for r in _fp) == [0.0, 9.5], str(_fp))

# ── 6c. THE MARKERS ARE A COUNTABLE SURFACE ───────────────────────────────
# A read path must not raise on a data condition -- that trades a wrong number
#    for no page at all. So the ROW is marked and the RUN is counted, and a
#    non-zero count is what someone looks at. Langston's split, not mine.
# ⚠️ THE DENOMINATOR IS THE WHOLE DAY, NOT THIS BLOCK. My first version of
#    this check asserted 2 ambiguous and 0 applied -- the FPTWIN rows only --
#    and failed against 3 and 2, because BLOCK 4 and BLOCK 5 write into the
#    same day file. Naming the wrong population inside the suite that exists
#    to catch wrong populations, so it is written down rather than quietly
#    corrected.
_health = store.correction_health(FP_DAY)
_rows = store.observations(FP_DAY)
check("EVERY row is counted exactly once -- the counts sum to the row total",
      sum(_health.values()) == len(_rows),
      "%d counted vs %d rows -- %s" % (sum(_health.values()), len(_rows), _health))
check("...and this block's two unresolvable rows are among them",
      _health["ambiguous_unresolvable"] >= 2, str(_health))
check("...and counts uncorrected rows too, so the denominator is present",
      "uncorrected" in _health, str(_health))


print("")
print("BLOCK 8 -- RE-RUNNING THE REPAIR MUST NOT POISON WHAT IT ALREADY FIXED")
# ⛔ MEASURED ON THE LIVE STORE THE MOMENT THE HEALTH CHECK SHIPPED, AND ONLY
#    BECAUSE IT SHIPPED: re-running the repair appended 86 identical
#    corrections differing ONLY in `read_at` -- the time the RE-PARSE ran, not
#    anything about the observation. The index compared whole entries, so all
#    86 keys poisoned, and the corrected read path went from 86 rows corrected
#    to 86 rows `ambiguous_unresolvable`. A live degradation caused by the
#    safety mechanism's own comparison being too strict.
# ★ Langston's condition earned its keep on its FIRST REAL RUN: the surface he
#   required turned a silent regression into a non-zero count.
RR_WHEN = datetime(2026, 9, 2, 14, 0, 0, tzinfo=timezone.utc)
RR_DAY = RR_WHEN.strftime("%Y-%m-%d") + ".jsonl"
RR_WAS = {"sol": 0.0, "source": "bonding_curve_real_reserves"}
store.record_observation("RERUN", "1h", RR_WHEN, {"pool_sol": dict(RR_WAS)})
for _stamp in ("2026-09-02T10:32:28.774972+00:00",
               "2026-09-02T11:38:49.909397+00:00"):
    store.record_pool_sol_correction(
        {"mint": "RERUN", "observed_at": RR_WHEN.isoformat(), "was": dict(RR_WAS),
         "corrected": {"sol": None, "source": "curve_complete_graduated",
                       "read_at": _stamp}})

_rr = [r for r in store.observations(RR_DAY) if r.get("mint") == "RERUN"]
check("two runs of the same repair leave the row CORRECTED, not poisoned",
      len(_rr) == 1 and _rr[0].get("pool_sol_correction") == "applied", str(_rr))
check("...and the corrected value is the one both runs agreed on",
      _rr and _rr[0]["pool_sol"]["source"] == "curve_complete_graduated", str(_rr))

# ⛔ THE DISCRIMINATING HALF. Ignoring `read_at` must NOT become ignoring
#    disagreement: two runs that produce genuinely DIFFERENT corrections still
#    have to poison the key, or the fix for over-strictness would have made
#    the index blind.
store.record_pool_sol_correction(
    {"mint": "RERUN", "observed_at": RR_WHEN.isoformat(), "was": dict(RR_WAS),
     "corrected": {"sol": 3.0, "source": "bonding_curve_real_reserves",
                   "read_at": "2026-09-02T12:00:00+00:00"}})
_rr = [r for r in store.observations(RR_DAY) if r.get("mint") == "RERUN"]
check("★ a genuinely DIFFERENT correction still poisons the key",
      _rr and _rr[0].get("pool_sol_correction") == "ambiguous_unresolvable", str(_rr))

print("\n%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
