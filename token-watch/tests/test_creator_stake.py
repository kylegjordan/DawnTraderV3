"""token-watch -- the creator's opening stake, captured at birth for free.

⛔ WHY THIS EXISTS. On a bonding curve there is no liquidity-provider position
   to withdraw, so a rug LOOKS LIKE SELLING -- selling is the only mechanism
   available. What separates a rug from a token that simply died is WHO sold,
   HOW MUCH, and HOW EARLY. The creator's opening stake is the HOW MUCH, and
   it is the half obtainable without spending a credit.

⛔⛔ EVERY CHECK DRIVES `receiver.ingest`, THE PRODUCTION ENTRY POINT, AND
   ASSERTS ON THE STORED BIRTH RECORD. Not the extractor directly.
   Langston, earlier in this batch: "your tests test the function; nothing
   tests the connection" -- 57 checks passed while nothing in production ever
   charged a birth. And the field this suite covers was, at first write,
   produced by the parser and SILENTLY DROPPED at `record_birth`, whose
   signature names its arguments one by one. A suite that called the
   extractor would have been green across that gap.

★ THE ABSENT-VS-ZERO DISCIPLINE, which is the whole shape here: a creator who
  took NOTHING and an extraction that did not run must never share a value.
  Both are 0 tokens; only `creator_stake_source` tells them apart.
"""

import glob
import json
import os
import sys
import tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-creator-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import provenance  # noqa: E402
provenance.record_raw = lambda *a, **k: None
provenance.record_follow_up = lambda *a, **k: None

import receiver  # noqa: E402
import store  # noqa: E402

PASS = FAIL = 0
CREATOR = "CreatorWa11etAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
OTHER = "SomebodyE1seBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  PASS  " + label)
    else:
        FAIL += 1
        print("  FAIL  " + label + ("  -- " + detail if detail else ""))


def event(mint, transfers, native=None):
    """A CREATE webhook payload in the shape Helius actually sends."""
    return {
        "type": "CREATE", "source": "PUMP_FUN", "feePayer": CREATOR,
        "signature": "sig-" + mint, "timestamp": 1788300000,
        "tokenTransfers": transfers,
        "nativeTransfers": native if native is not None else
        [{"amount": 2_000_000_000, "fromUserAccount": CREATOR,
          "toUserAccount": mint}],
        # ⛔ THE MINT IS DERIVED FROM accountData BY CONSERVATION -- a launched
        #    token NETS POSITIVE because it is created out of nothing -- NOT
        #    from tokenTransfers. My first fixture passed an empty list and the
        #    events were rejected as unrecognised, which looked like a code
        #    defect and was a fixture defect. A payload that the production
        #    parser would refuse is not a test of the production parser.
        # ★ Verified against live data before changing anything: all 3,233
        #   real no-transfer payloads DO carry a net-positive mint here, so
        #   they are recorded as births normally. No census hole.
        "accountData": [{"account": mint, "nativeBalanceChange": 0,
                         "tokenBalanceChanges": [
                             {"mint": mint, "userAccount": mint,
                              "rawTokenAmount": {"tokenAmount": "1000000000000000",
                                                 "decimals": 6}}]}],
        "events": {},
        "description": "", "instructions": [],
    }


def xfer(mint, to, amount):
    return {"mint": mint, "toUserAccount": to, "fromUserAccount": "curve",
            "tokenAmount": amount}


def birth(mint):
    """The STORED record -- read back from disk, not from a return value."""
    for f in glob.glob(ROOT + "/births/*.jsonl"):
        for line in open(f, encoding="utf-8", errors="replace"):
            try:
                r = json.loads(line)
            except Exception:
                continue
            if r.get("mint") == mint:
                return r
    return None


print("\nBLOCK 1 -- THE STAKE REACHES THE STORE THROUGH THE REAL ENTRY POINT")
M1 = "MintOneAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAApump"
receiver.ingest([event(M1, [xfer(M1, CREATOR, 15_000_000)])])
b = birth(M1)
check("the launch was recorded at all", b is not None, "no birth row")
check("★ the stored record carries the creator's token count",
      b and b.get("creator_tokens") == 15_000_000, str(b))
check("...and the share of the standard supply",
      b and abs((b.get("creator_share") or 0) - 0.015) < 1e-9, str(b))
check("...and NAMES how it was obtained",
      b and b.get("creator_stake_source") == "creator_token_transfer", str(b))

print("\nBLOCK 2 -- EVERY TRANSFER TO THE CREATOR IS SUMMED, NOT ONE OF THEM")
# ⛔ THE DISCRIMINATING CHECK. A creator can receive their allocation in
#    several transfers in one transaction. Taking the FIRST or the LARGEST
#    understates the stake by an unknown amount while looking resolved -- the
#    exact failure `size_source` was introduced for, one field up in the same
#    parser, after a fresh reader reproduced it.
M2 = "MintTwoBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBpump"
receiver.ingest([event(M2, [xfer(M2, CREATOR, 5_000_000),
                            xfer(M2, OTHER, 900_000_000),
                            xfer(M2, CREATOR, 3_000_000)])])
b = birth(M2)
check("★ two transfers to the creator SUM to 8,000,000",
      b and b.get("creator_tokens") == 8_000_000, str(b))
check("...and the huge transfer to somebody else is NOT counted",
      b and b.get("creator_tokens") != 900_000_000, str(b))

print("\nBLOCK 3 -- A CREATOR WHO TOOK NOTHING IS A MEASURED STATE, NOT A GAP")
# MEASURED over 24,256 real payloads: 3,198 carry no token transfers at all
#    and 589 move tokens only to somebody else. Both are real launches.
M3 = "MintThreeCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCpump"
receiver.ingest([event(M3, [])])
b3 = birth(M3)
check("no transfers at all -> zero tokens", b3 and b3.get("creator_tokens") == 0.0, str(b3))
check("★ ...and it is NAMED `no_token_transfers`",
      b3 and b3.get("creator_stake_source") == "no_token_transfers", str(b3))

M4 = "MintFourDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDpump"
receiver.ingest([event(M4, [xfer(M4, OTHER, 700_000_000)])])
b4 = birth(M4)
check("transfers, but none to the creator -> zero tokens",
      b4 and b4.get("creator_tokens") == 0.0, str(b4))
check("★ ...and it is NAMED `transfers_to_others_only`",
      b4 and b4.get("creator_stake_source") == "transfers_to_others_only", str(b4))
# ⛔ THE POINT OF THE TWO NAMES: both are zero, and a study that pooled them
#    would report "creator took nothing" for a launch where the tokens went to
#    a second wallet -- which is a DIFFERENT and more interesting fact.
check("★ the two zero states are DISTINGUISHABLE from each other",
      b3 and b4 and b3["creator_stake_source"] != b4["creator_stake_source"],
      "%s vs %s" % (b3 and b3.get("creator_stake_source"),
                    b4 and b4.get("creator_stake_source")))

print("\nBLOCK 4 -- A BIRTH RECORDED WITHOUT THE FIELD IS NOT A CREATOR WHO TOOK NOTHING")
# 83,786 births predate this. If they read as zero they become indistinguishable
#    from a measured zero, and every share computed over them is wrong in a
#    direction nobody can see. `record_birth` defaults the source, and the
#    default must NOT be one of the measured names.
from datetime import datetime, timezone  # noqa: E402
store.record_birth(
    mint="LegacyMintEEEEEEEEEEEEEEEEEEEEEEEEEEEEEpump",
    created_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
    first_seen_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
    venue="PUMP_FUN", initial_size=1.0, initial_liquidity=None,
    creator=CREATOR, size_source="feePayer_sole_transfer",
    socials={"telegram": False, "twitter": False, "website": False},
    followed=True, follow_reason="test")
b = birth("LegacyMintEEEEEEEEEEEEEEEEEEEEEEEEEEEEEpump")
check("★ a birth recorded without the stake reads `not_extracted`",
      b and b.get("creator_stake_source") == "not_extracted", str(b))
check("...and its token count is None, NOT zero",
      b and b.get("creator_tokens") is None, str(b))
check("★ so it can never be mistaken for a creator who took nothing",
      b and b.get("creator_stake_source") not in
      ("no_token_transfers", "transfers_to_others_only"), str(b))


print("")
print("BLOCK 5 -- THE BACKFILL REACHES THE DEFAULT READ PATH")
# ⛔ THE LESSON THIS BATCH PAID FOR TWICE. A raw store plus a correction set
#    joined by convention is two objects that every reader must combine
#    correctly forever, and it fails quietly in whichever one forgot. So the
#    DEFAULT read corrects, and reading raw is a named call.
LEGACY = "LegacyMintEEEEEEEEEEEEEEEEEEEEEEEEEEEEEpump"
DAY = "2026-09-01.jsonl"
store.record_creator_stake({"mint": LEGACY, "creator_tokens": 42_000_000,
                            "creator_share": 0.042,
                            "creator_stake_source": "creator_token_transfer"})
_raw = {r["mint"]: r for r in store.read_census_uncorrected(DAY)}
_cor = {r["mint"]: r for r in store.census(DAY)}
check("the backfilled stake appears on the DEFAULT read",
      _cor.get(LEGACY, {}).get("creator_tokens") == 42_000_000, str(_cor.get(LEGACY)))
# THE DISCRIMINATING HALF: if both paths returned the same thing the
#    default-applies claim would be untested.
check("★ the RAW read still shows it un-backfilled",
      _raw.get(LEGACY, {}).get("creator_stake_source") == "not_extracted",
      str(_raw.get(LEGACY)))
check("★ ...so the two paths DIFFER on the backfilled row",
      _raw.get(LEGACY, {}).get("creator_tokens")
      != _cor.get(LEGACY, {}).get("creator_tokens"), "identical")

# ⛔ A BACKFILL THAT DISAGREES WITH ITSELF IS MARKED, NOT LEFT LOOKING
#    UN-BACKFILLED. `not_extracted` would be indistinguishable from a mint the
#    backfill never reached, and those are different facts.
store.record_creator_stake({"mint": LEGACY, "creator_tokens": 99_000_000,
                            "creator_share": 0.099,
                            "creator_stake_source": "creator_token_transfer"})
_cor = {r["mint"]: r for r in store.census(DAY)}
check("★ two disagreeing backfills mark the row `backfill_ambiguous`",
      _cor.get(LEGACY, {}).get("creator_stake_source") == "backfill_ambiguous",
      str(_cor.get(LEGACY)))
check("...and it is NOT silently given either value",
      _cor.get(LEGACY, {}).get("creator_tokens") is None, str(_cor.get(LEGACY)))

# A record with no mint must be refused at the door, like the pool_sol one.
_rejected = False
try:
    store.record_creator_stake({"creator_tokens": 1})
except ValueError:
    _rejected = True
check("a stake record with no mint is REJECTED at write time", _rejected,
      "it was accepted")

print("\n%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
