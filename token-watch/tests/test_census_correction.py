"""
token-watch — CENSUS MINT CORRECTION: the default read path corrects.

⛔⛔ THE DEFECT: 19 census rows carry a QUOTE CURRENCY where the launched mint
   belongs -- USDC or wrapped SOL standing in for a real launch, written
   before the conservation rule landed. BLOCKER-C's repair reached the
   assignment ledger and never the census, one layer past where I declared it
   fixed.

⚠️ AND I OVERSTATED IT TO LANGSTON, so the correction is written here too: a
   per-day COUNT of births is UNAFFECTED. A collapsed row is still one launch,
   counted once. What breaks is IDENTITY -- distinct-mint counts are short,
   and any mint-keyed join misses those rows. Block 4 is that claim, tested,
   because it is the one that decides how much of the reader surface needs to
   change.

★ THE BOUND, measured 2026-09-01: every correction that repairs a birth is
  from before the conservation fix, which went live at the 10h->11h boundary.
  After it, BOTH currencies appear with births already correct -- so this is a
  closed historical set, not an open hole, and 19 is a count rather than a
  floor. That was Langston's question and it is answered by measurement, not
  by the absence of later cases.

⇒ THE NAMING IS THE MECHANISM (his ruling). A raw census plus a correction set
  joined by convention is two objects every reader must combine correctly
  forever, and it fails quietly in whichever one forgets. So `census()`
  corrects by default and `read_census_uncorrected()` is the only way to the
  raw rows -- which makes every bypass a greppable string instead of an
  omission. An omission is invisible; a named call is a census.
"""

import json
import os
import sys
import tempfile
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-census-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import store  # noqa: E402

UTC = timezone.utc
PASS = FAIL = 0

USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
WSOL = "So11111111111111111111111111111111111111112"
DAY = "2026-08-31.jsonl"


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  PASS  " + label)
    else:
        FAIL += 1
        print("  FAIL  " + label + ("  -- " + detail if detail else ""))


def birth(mint, created_at, followed=True):
    store._append(os.path.join(ROOT, "births", DAY), {
        "mint": mint, "created_at": created_at,
        "first_seen_at": created_at, "followed": followed,
        "follow_reason": "deferred", "initial_size": 1.0,
        "size_source": "test", "venue": "PUMP_FUN",
    })


def correction(recorded, created_at, real):
    store._append(store.MINT_CORRECTIONS_PATH, {
        "recorded_mint": recorded, "created_at": created_at,
        "corrected_mint": real, "signature": "SIG" + real[:6],
    })


# Three collapsed rows and one clean one. Two of the collapsed share a key
# with DIFFERENT real mints -- the ambiguous case.
birth(USDC, "2026-08-31T09:44:55+00:00")          # repairable
birth(WSOL, "2026-08-31T11:15:34+00:00")          # repairable, other currency
birth("RealMintZZZ", "2026-08-31T10:00:00+00:00")  # never collapsed
birth(USDC, "2026-08-31T11:28:26+00:00")          # AMBIGUOUS key

correction(USDC, "2026-08-31T09:44:55+00:00", "RealMintAAA")
correction(WSOL, "2026-08-31T11:15:34+00:00", "RealMintBBB")
correction(USDC, "2026-08-31T11:28:26+00:00", "RealMintCCC")
correction(USDC, "2026-08-31T11:28:26+00:00", "RealMintDDD")   # same key, other mint

raw = store.read_census_uncorrected(DAY)
fixed = store.census(DAY)

print("\nBLOCK 1 -- THE DEFAULT PATH CORRECTS; THE RAW PATH DOES NOT")
check("raw still holds the collapse currencies",
      sorted(r["mint"] for r in raw).count(USDC) == 2, str([r["mint"] for r in raw]))
check("corrected replaced the repairable USDC row",
      "RealMintAAA" in [r["mint"] for r in fixed], str([r["mint"] for r in fixed]))
check("corrected replaced the repairable wSOL row -- NOT a USDC denylist",
      "RealMintBBB" in [r["mint"] for r in fixed], str([r["mint"] for r in fixed]))
check("the untouched row is untouched",
      [r["mint"] for r in fixed].count("RealMintZZZ") == 1)

print("\nBLOCK 2 -- CONSERVATION: nothing is created, nothing is lost")
# Langston's condition: corrected == raw + the substitutions, exactly.
check("row count is identical", len(fixed) == len(raw),
      "%d vs %d" % (len(fixed), len(raw)))
subs = [(a["mint"], b["mint"]) for a, b in zip(raw, fixed) if a["mint"] != b["mint"]]
check("exactly the expected substitutions happened",
      sorted(subs) == sorted([(USDC, "RealMintAAA"), (WSOL, "RealMintBBB")]), str(subs))
check("every substituted row RECORDS what it was",
      all(r.get("recorded_mint") in (USDC, WSOL)
          for r in fixed if r["mint"].startswith("RealMintA")
          or r["mint"].startswith("RealMintB")),
      str([(r["mint"], r.get("recorded_mint")) for r in fixed]))
check("no row that was NOT substituted carries a recorded_mint",
      all(r.get("recorded_mint") is None
          for r in fixed if r["mint"] in (USDC, "RealMintZZZ")),
      str([(r["mint"], r.get("recorded_mint")) for r in fixed]))

print("\nBLOCK 3 -- AN AMBIGUOUS KEY IS DROPPED, NOT GUESSED")
# ⛔ Two launches sharing a collapse currency AND a creation second. A collapse
#    is detectable; a wrong substitution is not, so the row stays uncorrected.
check("the ambiguous row was NOT silently substituted",
      [r["mint"] for r in fixed].count(USDC) == 1, str([r["mint"] for r in fixed]))
check("...and it is MARKED unresolvable, so no reader can mistake it for a launch",
      any(r.get("mint_unresolved") for r in fixed if r["mint"] == USDC),
      str([(r["mint"], r.get("mint_unresolved")) for r in fixed]))
check("...while a row that was never collapsed carries no such mark",
      not any(r.get("mint_unresolved") for r in fixed if r["mint"] == "RealMintZZZ"))
check("...and neither candidate was silently chosen",
      not any(r["mint"] in ("RealMintCCC", "RealMintDDD") for r in fixed),
      str([r["mint"] for r in fixed]))

print("\nBLOCK 4 -- COUNTS WERE NEVER THE BROKEN THING (the claim I overstated)")
# A per-day count of rows is identical either way; only identity differs. This
# is why the row-counting fold in `summary` is deliberately left uncorrected.
check("a per-day ROW COUNT is unchanged by correction", len(raw) == len(fixed))
check("...while DISTINCT-MINT identity is not",
      len({r["mint"] for r in raw}) != len({r["mint"] for r in fixed}),
      "raw %d vs fixed %d" % (len({r["mint"] for r in raw}),
                              len({r["mint"] for r in fixed})))

print("\nBLOCK 5 -- POSITIVE CONTROL: the corrector can be shown to DO something")
# ⛔ Without this, an index that silently loaded nothing would make every check
#    above pass by leaving the rows alone, and the suite would be green over a
#    corrector that never ran.
idx = store._correction_index()
check("the index resolved both unambiguous keys",
      sum(1 for v in idx.values() if v) == 2, str(idx))
# ⛔ THE AMBIGUOUS KEY IS RETAINED WITH None, NOT DROPPED -- and that change is
#    the point. Dropping it made "we know this row is wrong but cannot repair
#    it" indistinguishable from "we never heard of this row", so the display
#    had no way to tell them apart and rendered a quote currency as a launch.
check("...and RETAINED the ambiguous one as explicitly unresolvable",
      idx.get((USDC, "2026-08-31T11:28:26+00:00"), "missing") is None, str(sorted(idx)))
check("at least one row genuinely changed", len(subs) > 0, str(subs))

print("\nBLOCK 6 -- THE PAGE ITSELF, DRIVEN THROUGH ITS PRODUCTION ENTRY POINT")
# THE REASON THIS BLOCK EXISTS. My first mutation of the page read replaced
#   the corrected call with `store.read_census_uncorrected(...)` -- and `store`
#   is not imported in summary, so it raised NameError and the suite went red.
#   I nearly recorded that as "CAUGHT". A mutation that CRASHES proves nothing
#   about detection. Re-applied VALIDLY, it SURVIVED: nothing noticed the page
#   reverting to raw census rows.
# So this block does not call the corrector -- it calls `summary.build`, the
#   thing production runs, and asserts on what the page would SHOW. That is
#   the standing lesson: a test that drives the function proves the function;
#   only a test that drives the entry point proves the connection.
import summary  # noqa: E402

_p = summary.build(datetime(2026, 9, 1, 12, 0, tzinfo=UTC))
_shown = [o.get("mint") for o in (_p.get("oldest_survivors") or [])]
check("the page shows the REAL mint for a corrected launch",
      "RealMintAAA" in _shown, str(_shown))
# ⛔ THIS IS WHY BLOCK 6 EXISTS AND IT FAILED FIRST TIME. An UNREPAIRABLE row
#    still rendered a quote currency as a launch: correcting what we can does
#    not make what we cannot correct safe to display. Refusing to guess is the
#    right call at the data layer AND leaves a wrong row on the page unless
#    the display also acts on it.
check("...and never shows a quote currency as a launch, INCLUDING the",
      USDC not in _shown and WSOL not in _shown, str(_shown))
check("...one it could not repair -- excluded, not guessed at",
      USDC not in _shown, str(_shown))
check("POSITIVE CONTROL: the page is actually rendering rows at all",
      len(_shown) > 0, str(_shown))

print("\n%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
