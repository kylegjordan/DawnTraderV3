"""Select the STRATIFIED sample the balance verification runs against.

⛔ LANGSTON'S CONDITION (2026-09-02), and it is the part that matters more than
   the source of truth:

     "DO NOT SAMPLE 5-10 MINTS AT RANDOM. STRATIFY, or you validate the arm
      that was never in doubt... 10 quiet SOL-quoted curves would agree
      beautifully and prove almost nothing."

THE FOUR ARMS HE NAMED, each for a stated reason:
  - `usdc_quoted`      -- the rare arm, AND THE ARM THE 1,000x SCALING BUG
                          LIVED IN. Verifying everything except this would be
                          verifying everything except the thing that broke.
  - `graduated`        -- the wrong-venue read: a drained curve whose money
                          has moved to another pool.
  - `trading_excluded` -- one of the curves my own price-agreement PRIMARY
                          throws out. His A3 logic applied to me: the
                          exclusion is defensible, but the excluded arm is
                          where a race is most likely and where I have the
                          least evidence.
  - `curve_liq_none`   -- the field gap: a bonding curve the aggregator
                          publishes no liquidity figure for at all.

⛔ DEDUPED BY POOL ADDRESS. The first run of this selected the top two rows per
   stratum and got the SAME pool twice, because a pool is read once per sweep
   and the store holds many sweeps -- so "8 pools" was 7. That is the
   reads-versus-distinct error Langston had caught me making earlier the same
   day, one level up. Counting rows and calling them pools is the error; the
   fix belongs in the SELECTION, not in the wording of the result.

Writes /tmp/tw_strata.json for verify_balance_against_tx_meta.py.
"""

import base64
import collections
import json
import struct
import sys

PUMPFUN = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
USDC = bytes.fromhex(
    "c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61")
PER_STRATUM = 3


def main(day="2026-09-02"):
    F = "/var/lib/token-watch/provenance/follow-up/%s.jsonl" % day
    meta, pools = {}, []
    with open(F, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            try:
                rec = json.loads(line)
            except Exception:
                continue
            body = rec.get("body")
            if isinstance(body, str):
                try:
                    body = json.loads(body)
                except Exception:
                    continue
            if rec.get("source") == "dexscreener_token_state" and isinstance(body, dict):
                for p in (body.get("pairs") or []):
                    if not p.get("pairAddress"):
                        continue
                    m5 = (p.get("txns") or {}).get("m5") or {}
                    meta[p["pairAddress"]] = {
                        "sym": (p.get("baseToken") or {}).get("symbol"),
                        "liq": (p.get("liquidity") or {}).get("usd"),
                        "m5": int(m5.get("buys") or 0) + int(m5.get("sells") or 0)}
            elif rec.get("source") == "helius_pool_account":
                pools.append(rec)

    strata = collections.defaultdict(dict)      # keyed by POOL, so it dedupes
    for rec in pools:
        key = rec.get("mint")
        m = meta.get(key)
        if not m:
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
        if len(raw) < 115:
            continue
        vt, vs, rt, rs, sup = struct.unpack_from("<QQQQQ", raw, 8)
        q = bytes(raw[83:115])
        if raw[48] == 1:
            s = "graduated"
        elif q == USDC:
            s = "usdc_quoted"
        elif m["m5"] > 0:
            s = "trading_excluded"
        elif m["liq"] is None:
            s = "curve_liq_none"
        else:
            s = "other"
        strata[s][key] = {"pool": key, "sym": m["sym"], "rs": rs, "stratum": s}

    sel = []
    for s in ("usdc_quoted", "graduated", "trading_excluded", "curve_liq_none", "other"):
        # Largest reserves first WITHIN a stratum, so the comparison has
        #    something to bite on -- a check against zero is satisfied by any
        #    implementation that returns zero.
        rows = sorted(strata.get(s, {}).values(), key=lambda x: -(x["rs"] or 0))[:PER_STRATUM]
        sel.extend(rows)
        print("%-18s distinct pools available=%-6d selected=%d"
              % (s, len(strata.get(s, {})), len(rows)))
    print("")
    print("SELECTED %d rows across %d DISTINCT pool addresses"
          % (len(sel), len({x["pool"] for x in sel})))
    with open("/tmp/tw_strata.json", "w", encoding="utf-8") as fh:
        json.dump(sel, fh)
    print("written to /tmp/tw_strata.json")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "2026-09-02"))
