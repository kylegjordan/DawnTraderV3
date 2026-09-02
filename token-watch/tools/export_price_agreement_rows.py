"""Export the decode-vs-aggregator pair rows for INDEPENDENT re-derivation.

⛔ WHY THIS EXISTS, AND IT IS NOT A READ PATH (Langston, 2026-09-02). I was
   about to take "give Langston access to the store" to Kyle as a security
   decision. He pointed out I had already solved it once, in round 5, by
   EXPORTING the specific objects a leg depends on:

     "An EXPORT of the specific objects a leg depends on is not a read path to
      the store. It does not touch `tokenwatch` ownership, it does not widen
      `deploy`, and it is not Kyle's to decide -- you already built it and I
      already used it."

   His round-5 reply had opened: "I RE-DERIVED EVERY LOAD-BEARING NUMBER
   MYSELF FROM THE EXPORTED OBJECTS. Nothing below is RULED ON REPORTED FACT."

★ THE ROW CARRIES THE RAW ACCOUNT BYTES, not just my decoded number. He can
  therefore re-derive the DECODE, not merely re-check my arithmetic on it --
  which is the difference between auditing a result and reproducing it. The
  aggregator's published price and its 5-minute trade count travel with it, so
  the quiet/trading split and the agreement rate are both re-derivable without
  reference to anything I computed.

⚠️ THE PRICE-AGREEMENT LEG IS THE ONE THIS LIFTS, and only it. The
   quote-asset and dead-pool legs he established from code he read; their
   numbers only size them.

RUN ON THE HOST holding the store; writes into /srv/token-watch-review.
"""

import base64
import hashlib
import json
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, "/opt/token-watch")

PUMPFUN = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
USDC_Q = bytes.fromhex(
    "c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61")
ZERO_Q = bytes(32)
REVIEW = "/srv/token-watch-review"


def main(day):
    src = "/var/lib/token-watch/provenance/follow-up/%s.jsonl" % day
    meta, pools = {}, []
    with open(src, encoding="utf-8", errors="replace") as fh:
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
            if rec.get("source") == "dexscreener_token_state" and isinstance(body, dict):
                for p in (body.get("pairs") or []):
                    pa = p.get("pairAddress")
                    if not pa or not p.get("priceNative"):
                        continue
                    m5 = (p.get("txns") or {}).get("m5") or {}
                    meta[pa] = {
                        "mint": (p.get("baseToken") or {}).get("address"),
                        "symbol": (p.get("baseToken") or {}).get("symbol"),
                        "provider_price_native": float(p["priceNative"]),
                        "provider_quote_label": (p.get("quoteToken") or {}).get("symbol"),
                        "txns_m5": int(m5.get("buys") or 0) + int(m5.get("sells") or 0),
                    }
            elif rec.get("source") == "helius_pool_account":
                pools.append(rec)

    out_path = os.path.join(REVIEW, "price-agreement-rows-%s.jsonl" % day)
    n = 0
    with open(out_path, "w", encoding="utf-8") as out:
        for rec in pools:
            key = rec.get("mint") or rec.get("key") or rec.get("subject")
            m = meta.get(key)
            if not m:
                continue
            body = rec.get("body") or rec.get("raw") or rec.get("response")
            if isinstance(body, str):
                try:
                    body = json.loads(body)
                except Exception:
                    continue
            val = ((body or {}).get("result") or {}).get("value") or {}
            if val.get("owner") != PUMPFUN:
                continue
            data_b64 = (val.get("data") or [""])[0]
            raw = base64.b64decode(data_b64)
            if len(raw) < 115:
                continue
            vt, vs, rt, rs, sup = struct.unpack_from("<QQQQQ", raw, 8)
            q = bytes(raw[83:115])
            row = dict(m)
            row.update({
                "pair_address": key,
                # THE RAW BYTES, so the decode itself is re-derivable rather
                #    than merely auditable.
                "account_data_b64": data_b64,
                "account_owner": val.get("owner"),
                "complete_flag": raw[48],
                "quote_mint_hex": q.hex(),
                "quote_symbol_from_account": (
                    "USDC" if q == USDC_Q else ("SOL" if q == ZERO_Q else "UNKNOWN")),
                # My decoded values, LABELLED AS MINE so they are the thing
                #    under test rather than the reference.
                "my_virtual_token": vt, "my_virtual_quote_raw": vs,
                "my_real_token": rt, "my_real_quote_raw": rs, "my_supply": sup,
            })
            out.write(json.dumps(row, sort_keys=True) + "\n")
            n += 1

    sha = hashlib.sha256(open(out_path, "rb").read()).hexdigest()
    man_path = os.path.join(REVIEW, "MANIFEST.json")
    man = {}
    if os.path.exists(man_path):
        try:
            man = json.load(open(man_path, encoding="utf-8"))
        except Exception:
            man = {}
    man["price_agreement_rows_%s" % day.replace("-", "_")] = {
        "file": os.path.basename(out_path),
        "rows": n,
        "sha256": sha,
        "source_sha256": hashlib.sha256(open(src, "rb").read()).hexdigest(),
        "source": src,
        "what": ("One row per curve-owned pool read joined to the aggregator "
                 "response from the same sweep. Carries the RAW account bytes "
                 "so the decode is re-derivable, the aggregator's published "
                 "price, its quote label, and its 5-minute trade count -- so "
                 "the quiet/trading split and the agreement rate can both be "
                 "computed without reference to anything I derived."),
        "how_to_rederive": (
            "implied_price_native = (my_virtual_quote_raw / 10**dec) / "
            "(my_virtual_token / 1e6), where dec is 6 when the quote mint is "
            "USDC and 9 when it is all zeroes. ratio = implied / "
            "provider_price_native. PRIMARY arm is txns_m5 == 0. Rows with "
            "complete_flag == 1 are drained curves and publish no comparable "
            "price."),
        "caveat": ("Graduated rows (complete_flag == 1) are excluded from the "
                   "agreement leg BY CONSTRUCTION, not by choice."),
    }
    with open(man_path, "w", encoding="utf-8") as fh:
        json.dump(man, fh, indent=2, sort_keys=True)
    print("wrote %s" % out_path)
    print("  rows            : %d" % n)
    print("  sha256          : %s" % sha)
    print("  source sha256   : %s" % man["price_agreement_rows_%s"
                                         % day.replace("-", "_")]["source_sha256"])
    print("  MANIFEST.json updated in place, existing keys preserved")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "2026-09-02")
