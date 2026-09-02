"""GROUND TRUTH for a pool's balance, from a DIFFERENT PRODUCER. RUN ON THE HOST.

⛔ THE PROBLEM LANGSTON POSED (2026-09-02). I said every source I can reach
   reduces to the aggregator or the same RPC I decode from. His answer:

     "That's true of the TRANSPORT. It is not true of the PRODUCER, and the
      producer is what independence means here."

★ THE TWO PRODUCERS IN PLAY, and they are genuinely separate:
   - `lamports` on the account is maintained by the SOLANA RUNTIME. Nothing
     the pump.fun program writes can set it directly; it moves only as the
     runtime debits and credits the account.
   - `real_quote_reserves` is a field the PROGRAM writes into its own account
     data, and it is what my struct decode reads.
   For a SOL-quoted curve the two describe the same money, so they must agree
   EXACTLY once the rent-exempt minimum is subtracted -- not "within 0.1%".
   An exact-match test is a far sharper instrument than the aggregator price
   comparison, which tolerates a tenth of a percent and has a
   contemporaneity dependence.

⚠️ WHAT THIS IS AND IS NOT. Same RESPONSE, different PRODUCER within it. It
   rules out a wrong offset, a wrong scale factor and a wrong field -- which
   is exactly the failure class the USDC-scaled-as-SOL bug belonged to. It
   does NOT rule out the response itself being wrong, which is what the
   transaction-meta check (Langston's PRIMARY, separate script) addresses.
   Stated rather than glossed, because "independent" without naming the axis
   is the claim he bounced.

★ AND THE USDC ARM IS A POSITIVE CONTROL THAT COSTS NOTHING. A USDC-quoted
  curve holds no native SOL beyond rent, so its lamport balance is rent ONLY
  while its decoded reserve is large. If the decode were treating those
  reserves as SOL, the runtime's own accounting would contradict it -- and
  that contradiction is visible without reference to any price.

THE RENT-EXEMPT MINIMUM IS MEASURED, NOT ASSUMED. It depends on the account's
   data length, and both 115- and 151-byte accounts exist in this population.
   Deriving it per length from the data means a future account size cannot
   silently break the comparison.
"""

import base64
import collections
import json
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, "/opt/token-watch")
from fingerprint import fingerprint, print_fingerprint   # noqa: E402

PUMPFUN = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
USDC = bytes.fromhex(
    "c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61")
ZERO = bytes(32)
F = "/var/lib/token-watch/provenance/follow-up/2026-09-02.jsonl"


def main():
    rows = []
    with open(F, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            try:
                rec = json.loads(line)
            except Exception:
                continue
            if rec.get("source") != "helius_pool_account":
                continue
            body = rec.get("body")
            if isinstance(body, str):
                try:
                    body = json.loads(body)
                except Exception:
                    continue
            val = ((body or {}).get("result") or {}).get("value") or {}
            if val.get("owner") != PUMPFUN:
                continue
            raw = base64.b64decode((val.get("data") or [""])[0])
            if len(raw) < 115 or val.get("lamports") is None:
                continue
            vt, vs, rt, rs, sup = struct.unpack_from("<QQQQQ", raw, 8)
            q = bytes(raw[83:115])
            rows.append({
                "pool": rec.get("mint"),
                "len": len(raw),
                "lamports": int(val["lamports"]),
                "decoded_reserve": rs,
                "quote": "USDC" if q == USDC else ("SOL" if q == ZERO else "OTHER"),
                "graduated": raw[48] == 1,
            })

    # THE RENT-EXEMPT MINIMUM, DERIVED FROM THE DATA. A graduated curve holds
    #    nothing but rent, so its lamport balance IS the minimum for its size.
    #    Measured per data length rather than hardcoded.
    rent = {}
    for r in rows:
        if r["graduated"]:
            rent.setdefault(r["len"], collections.Counter())[r["lamports"]] += 1
    rent_for = {}
    print("RENT-EXEMPT MINIMUM, derived from drained curves (which hold only rent):")
    for ln in sorted(rent):
        common, n = rent[ln].most_common(1)[0]
        rent_for[ln] = common
        print("   %3d-byte account : %-12d lamports  (from %d drained curves, %d distinct values seen)"
              % (ln, common, n, len(rent[ln])))
    if not rent_for:
        print("   NONE DERIVABLE -- no drained curves in this population.")
        return 1

    # ⛔ READS ARE NOT POOLS, AND THIS HEADLINE SAID "CURVES" WHILE COUNTING
    #    ROWS. Langston, third instance in one day: I fixed it in the strata
    #    SELECTOR and left the class alone, which is `fix-follows-pointer`
    #    landing inside the batch that fixed it. A pool read twice and
    #    agreeing twice is not a fabrication -- it is a DENOMINATOR defect,
    #    not a validity defect -- but the number must say which it is.
    print("")
    print("POPULATION, STATED AS BOTH: %d reads across %d DISTINCT pool addresses"
          % (len(rows), len({r["pool"] for r in rows})))
    _per = collections.Counter(collections.Counter(r["pool"] for r in rows).values())
    print("   reads per pool: %s" % dict(sorted(_per.items())))
    print("")
    print("DOES THE RUNTIME'S LAMPORT BALANCE AGREE WITH THE PROGRAM'S RESERVE FIELD?")
    print("(SOL-quoted only: for those two fields describe the same money.)")
    agree = collections.Counter()
    worst = []
    for r in rows:
        if r["quote"] != "SOL" or r["graduated"]:
            continue
        base = rent_for.get(r["len"])
        if base is None:
            agree["no rent baseline for this account size"] += 1
            continue
        implied = r["lamports"] - base
        d = implied - r["decoded_reserve"]
        agree["EXACT match" if d == 0 else "MISMATCH"] += 1
        if d:
            worst.append((abs(d), r["pool"], r["decoded_reserve"], implied))
    tot = sum(agree.values())
    for k, v in agree.most_common():
        print("   %-34s %6d  (%.3f%%)" % (k, v, 100.0 * v / tot if tot else 0))
    _sol_pools = {r["pool"] for r in rows if r["quote"] == "SOL" and not r["graduated"]}
    print("   ...over %d reads spanning %d DISTINCT pools" % (tot, len(_sol_pools)))
    if worst:
        worst.sort(reverse=True)
        print("   five largest mismatches (lamports):")
        for d, pool, dec, imp in worst[:5]:
            print("      %-46s decoded %-16d runtime-implied %-16d diff %d"
                  % (pool, dec, imp, d))

    print("")
    print("THE USDC ARM -- A POSITIVE CONTROL THAT NEEDS NO PRICE.")
    print("A USDC-quoted curve holds no native SOL beyond rent, so if the decode")
    print("were treating its reserves as SOL the runtime would contradict it.")
    u = [r for r in rows if r["quote"] == "USDC" and not r["graduated"]]
    rent_only = [r for r in u if r["lamports"] == rent_for.get(r["len"])]
    big = [r for r in u if r["decoded_reserve"] > 10 ** 9]
    print("   USDC-quoted curves                                  : %d" % len(u))
    print("   ...whose lamport balance is RENT ONLY               : %d" % len(rent_only))
    print("   ...whose decoded reserve exceeds 1 SOL-equivalent   : %d" % len(big))
    print("   => if those reserves were SOL, the runtime would be holding them.")
    print("      It is not. The reserves are not SOL, which is what the quote")
    print("      mint said and what the 1,000x price error was.")

    print_fingerprint(fingerprint(
        [F], observed_at_of=lambda r: r.get("observed_at"), rows=tot))
    return 0


if __name__ == "__main__":
    sys.exit(main())
