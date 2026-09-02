"""CONTROL: re-decode the first reading of every straddling fall, then re-run.

⛔ LANGSTON'S PRE-PUBLICATION CONDITION (2026-09-02). Of the 200 tokens whose
   pool fell to <=10%, some have their FIRST reading taken on the pre-quote-fix
   decoder and their LAST on the current one. A fall measured across a decoder
   change is a fall partly manufactured by the change.

   His words: "Both documented faults bias AGAINST detecting a fall -- a false
   `sol: 0.0` first reading is excluded by `v[0]['amt'] > 0`, and a
   1,000x-understated USDC first reading reads as a RISE -- so this is
   conservative WITH RESPECT TO THE TWO FAULTS YOU KNOW ABOUT, and unbounded
   with respect to any you don't. The control is cheap and you already own it."

★ AND HE REQUIRED THE COVERAGE STATEMENT, NOT JUST THE RESULT: say whether the
  straddling mints were REACHED-AND-UNCHANGED or NEVER REACHED by the join.
  Those are different facts and only one of them is reassuring -- a mint whose
  raw body cannot be found is not evidence of stability, it is absence of
  evidence, and pooling the two would be exactly the #546 shape.

⚠️ ONE DECODER, NOT TWO. The re-decode calls `providers.decode_curve_account`
   -- the same function production uses. A control with its own copy of the
   decode would be testing a second implementation rather than the first.
"""

import collections
import glob
import json
import os
import sys

sys.path.insert(0, "/opt/token-watch")

import providers  # noqa: E402
import provenance  # noqa: E402

provenance.record_follow_up = lambda *a, **k: None

OBS = "/var/lib/token-watch/observations"
PROV = "/var/lib/token-watch/provenance/follow-up"
COLLAPSE = 0.10


def load_raw_bodies():
    """pool address -> the raw getAccountInfo value, from the provenance store."""
    pools, pair_of_mint = {}, {}
    for f in sorted(glob.glob(PROV + "/*.jsonl")):
        with open(f, encoding="utf-8", errors="replace") as fh:
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
                key = rec.get("mint")
                if rec.get("source") == "helius_pool_account":
                    val = ((body or {}).get("result") or {}).get("value")
                    if val:
                        pools.setdefault(key, []).append((rec.get("observed_at"), val))
                elif rec.get("source") == "dexscreener_token_state" and isinstance(body, dict):
                    for p in (body.get("pairs") or []):
                        m = (p.get("baseToken") or {}).get("address")
                        if m and p.get("pairAddress"):
                            pair_of_mint.setdefault(m, p["pairAddress"])
    return pools, pair_of_mint


def main():
    ser = collections.defaultdict(list)
    for f in sorted(glob.glob(OBS + "/*.jsonl")):
        with open(f, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try:
                    r = json.loads(line)
                except Exception:
                    continue
                ps = r.get("pool_sol")
                if not isinstance(ps, dict):
                    continue
                amt = ps.get("quote_amount")
                if amt is None:
                    amt = ps.get("sol")
                ser[r.get("mint")].append({"at": r.get("observed_at"), "amt": amt, "ps": ps})

    falls = []
    for m, v in ser.items():
        vv = sorted([x for x in v if x["amt"] is not None], key=lambda z: z["at"] or "")
        if len(vv) < 2 or vv[0]["amt"] <= 0:
            continue
        if vv[-1]["amt"] / vv[0]["amt"] <= COLLAPSE:
            falls.append((m, vv))
    print("fall set (<=%d%% of the earlier reading): %d mints" % (COLLAPSE * 100, len(falls)))

    # ⛔ A STRADDLE IS IDENTIFIED BY THE SCHEMA, NOT BY THE CLOCK. The old
    #    decoder wrote `virtual_sol` and no `quote_symbol`; the current one
    #    writes `quote_*`. Keying on the fields is exact; keying on a
    #    deploy timestamp would be a guess about when each row was produced.
    straddle = [(m, vv) for m, vv in falls
                if "quote_symbol" not in vv[0]["ps"] and "quote_symbol" in vv[-1]["ps"]]
    print("...whose FIRST reading used the old decoder and LAST the new: %d"
          % len(straddle))

    pools, pair_of_mint = load_raw_bodies()
    reached = unreached = unchanged = changed = survives = dissolves = 0
    examples = []
    for m, vv in straddle:
        pair = pair_of_mint.get(m)
        cands = pools.get(pair) or []
        # the raw body closest in time to the FIRST observation
        target = vv[0]["at"]
        # The raw body nearest in time to the FIRST observation. Nearest, not
        #    first-found: the store holds one body per sweep and the fall's
        #    first reading must be re-decoded from the body it was made from.
        best = min(cands, key=lambda c: abs(_ts(c[0]) - _ts(target))) if cands else None
        if not best:
            unreached += 1
            continue
        reached += 1
        redec = providers.decode_curve_account(best[1])
        new_amt = redec.get("quote_amount")
        if new_amt is None:
            new_amt = redec.get("sol")
        old_amt = vv[0]["amt"]
        if new_amt is None or new_amt <= 0:
            dissolves += 1
            examples.append((m, old_amt, new_amt, vv[-1]["amt"], "no usable re-decode"))
            continue
        if abs(new_amt - old_amt) < 1e-12:
            unchanged += 1
        else:
            changed += 1
        if vv[-1]["amt"] / new_amt <= COLLAPSE:
            survives += 1
        else:
            dissolves += 1
            examples.append((m, old_amt, new_amt, vv[-1]["amt"], "fall DISSOLVES"))

    print("")
    print("COVERAGE OF THE STRADDLING SET -- reached and unreached are DIFFERENT")
    print("facts, and only one of them is reassuring:")
    print("   raw body REACHED and re-decoded            : %d" % reached)
    print("   NEVER REACHED by the join (not repairable) : %d" % unreached)
    print("")
    print("OF THE REACHED:")
    print("   first reading UNCHANGED by re-decoding     : %d" % unchanged)
    print("   first reading CHANGED by re-decoding       : %d" % changed)
    print("   ★ the fall SURVIVES the corrected first reading : %d" % survives)
    print("   ⛔ the fall DISSOLVES -- it was the decoder      : %d" % dissolves)
    for m, o, n, last, why in examples[:8]:
        print("      %-46s %s -> re-decoded %s, last %s   [%s]"
              % (m[:44], o, n, last, why))
    return 0


def _ts(s):
    """Seconds-since-epoch-ish from an ISO string, for nearest-match only."""
    if not s:
        return 0
    try:
        from datetime import datetime
        return datetime.fromisoformat(s).timestamp()
    except Exception:
        return 0


if __name__ == "__main__":
    sys.exit(main())
