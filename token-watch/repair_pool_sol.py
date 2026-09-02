"""Repair `pool_sol` values written by the pre-quote-fix decoder.

WHY A REPAIR IS POSSIBLE AT ALL, AND IT IS THE WHOLE ARGUMENT FOR THE
   PROVENANCE STORE. Two sweeps on 2026-09-02 recorded `pool_sol` through a
   decoder with two faults: a drained (graduated) curve was reported as
   `sol: 0.0` rather than named, and a USDC-quoted curve was scaled as though
   it held SOL, understating it by a factor of 1,000. Both are EXTRACTION
   defects, not collection defects -- the raw `getAccountInfo` bodies are in
   `provenance/follow-up/`, so the cost is a re-parse rather than an
   unrecoverable observation. That is exactly the trade `record_follow_up`
   was built to make.

IT DOES NOT REWRITE THE OBSERVATION FILE. The stores are append-only, so a
   correction is a new record and the original stands. Same shape as
   `mint-corrections.jsonl`, and for the same reason: a store you can edit in
   place is a store whose history cannot be audited.

ONE DECODER, NOT TWO. It calls `providers.decode_curve_account` -- the same
   function the live read calls. A repair with its own copy of the decode
   would be free to drift, and a correction written by a second
   implementation is a second chance to be wrong rather than a check on the
   first (`fix-relocates` in MISTAKE_PATTERNS).

THE JOIN, STATED because it is the part that can silently under-cover: an
   observation carries the MINT, while a pool read is recorded under the POOL
   ADDRESS. They are joined through the aggregator response from the same
   sweep, which carries both. A mint whose aggregator response is missing
   cannot be repaired, and the coverage figure is printed rather than assumed.

USAGE (on the host that holds the store):
    python3 repair_pool_sol.py --day 2026-09-02            # dry run, counts only
    python3 repair_pool_sol.py --day 2026-09-02 --write    # append corrections
"""

import argparse
import base64
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import providers  # noqa: E402
import store  # noqa: E402
from config import ROOT  # noqa: E402


def _load_day(day):
    """Return (pool body by pool address, pool address by mint) for one day."""
    path = "%s/provenance/follow-up/%s.jsonl" % (ROOT, day)
    pools, pair_of_mint = {}, {}
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            try:
                rec = json.loads(line)
            except Exception:
                continue
            body = rec.get("body") or rec.get("raw") or rec.get("response")
            if isinstance(body, str):
                try:
                    body = json.loads(body)
                except Exception:
                    continue
            src = rec.get("source")
            key = rec.get("mint") or rec.get("key") or rec.get("subject")
            if src == "helius_pool_account":
                pools[key] = body
            elif src == "dexscreener_token_state" and isinstance(body, dict):
                for pair in (body.get("pairs") or []):
                    mint = ((pair.get("baseToken") or {}).get("address"))
                    if mint and pair.get("pairAddress"):
                        pair_of_mint.setdefault(mint, pair["pairAddress"])
    return pools, pair_of_mint


def _differs(old, new):
    """Is the corrected value materially different from what was stored?

    Compared on the fields that carry meaning, never on `read_at` -- a
    timestamp differs on every re-parse and would mark all rows as changed,
    which is the same as marking none.
    """
    # ONLY THE FIELDS THAT MEAN THE SAME THING IN BOTH VERSIONS. The first
    #    run of this compared `quote_symbol` and `quote_amount` too -- fields
    #    the old decoder never wrote -- so every row differed and it reported
    #    2,784 of 2,784 "materially changed". That is a SCHEMA change, not a
    #    value change, and reporting it as a correction would have buried the
    #    hundred rows that are actually wrong among thousands that are fine.
    keys = ("sol", "source")
    return any(old.get(k) != new.get(k) for k in keys)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", required=True)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    pools, pair_of_mint = _load_day(args.day)
    obs_path = "%s/observations/%s.jsonl" % (ROOT, args.day)

    considered = joined = changed = unjoinable = 0
    by_change = {}
    corrections = []
    with open(obs_path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            try:
                rec = json.loads(line)
            except Exception:
                continue
            old = rec.get("pool_sol")
            if not isinstance(old, dict):
                continue
            if old.get("source") != "bonding_curve_real_reserves":
                continue          # only the curve branch was affected
            considered += 1
            mint = rec.get("mint")
            pair = pair_of_mint.get(mint)
            body = pools.get(pair) if pair else None
            val = (((body or {}).get("result") or {}).get("value")) or None
            if not val:
                unjoinable += 1
                continue
            joined += 1
            new = providers.decode_curve_account(val)
            if not _differs(old, new):
                continue
            changed += 1
            key = "%s -> %s" % (old.get("source"), new.get("source"))
            by_change[key] = by_change.get(key, 0) + 1
            corrections.append({
                "mint": mint,
                "observed_at": rec.get("observed_at"),
                "pair_address": pair,
                "was": {k: old.get(k) for k in
                        ("sol", "source", "quote_symbol", "quote_amount")},
                "corrected": new,
                "reason": "pre-quote-fix decoder: graduated curve read as an "
                          "empty pool, and/or USDC-quoted reserve scaled as SOL",
            })

    print("day %s" % args.day)
    print("  curve-branch pool_sol rows considered : %d" % considered)
    print("  joined to their raw account body      : %d" % joined)
    print("  COULD NOT BE JOINED (not repairable)  : %d" % unjoinable)
    print("  materially changed by the re-parse    : %d" % changed)
    for k, v in sorted(by_change.items(), key=lambda x: -x[1]):
        print("      %-52s %d" % (k, v))

    if not args.write:
        print("\ndry run -- nothing written. Re-run with --write to append.")
        return 0
    for c in corrections:
        store.record_pool_sol_correction(c)
    print("\nappended %d corrections to %s"
          % (len(corrections), store.POOL_SOL_CORRECTIONS_PATH))
    return 0


if __name__ == "__main__":
    sys.exit(main())
