"""Verify a pool's balance against the VALIDATOR'S OWN TRANSACTION RECORD.

⛔ LANGSTON'S PRIMARY (2026-09-02), and the axis matters more than the source:

     "You said everything reduces to the aggregator or your RPC. That's true
      of the TRANSPORT. It is not true of the PRODUCER, and the producer is
      what independence means here."

   A transaction's meta carries `postBalances`, computed by the validator when
   the transaction executed. It is a DIFFERENT RESPONSE, a DIFFERENT RECORD
   and a DIFFERENT PRODUCER from the account read my decode uses -- and it
   should match EXACTLY, not within a tolerance.

⛔⛔ THE TRAP HE NAMED, WHICH WOULD MAKE THIS USELESS: PIN THE SLOT.
   `getAccountInfo` returns `context.slot`; the transaction carries its own.
   If a trade lands between the two reads you have TWO TRUE READINGS OF TWO
   DIFFERENT MOMENTS, and the difference is a RACE, NOT AN ERROR -- "every
   adjacent-object miss in my ledger wearing a new hat".
⇒ SO A PAIR IS ONLY ADMITTED WHEN THE NEWEST SIGNATURE PREDATES THE ACCOUNT
  READ. A pair that fails that test is reported as SKIPPED-RACE, never as a
  mismatch, and never quietly dropped.

★ STRATIFIED, NOT RANDOM -- also his condition, and the reason is sharp:
  "10 quiet SOL-quoted curves would agree beautifully and prove almost
  nothing." The sample deliberately includes a USDC-quoted curve (the rare arm
  and the one the scaling bug lived in), a graduated curve (the wrong-venue
  read), a curve the aggregator gives no liquidity for (the field gap), and a
  TRADING curve -- the arm my own price-agreement primary EXCLUDES, where a
  race is most likely and where I have the least evidence.

USAGE:  python3 verify_balance_against_tx_meta.py [strata.json]
"""

import base64
import json
import os
import os
import struct
import sys
import time

sys.path.insert(0, "/opt/token-watch")

import providers  # noqa: E402
import provenance  # noqa: E402

provenance.record_follow_up = lambda *a, **k: None   # a probe is not an observation

PUMPFUN = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
USDC = bytes.fromhex(
    "c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61")
USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
RENT_BY_LEN = {115: 1691280, 151: 1941840}   # derived, see measure_balance_ground_truth


def rpc(method, params, tries=3):
    last = None
    for i in range(tries):
        try:
            return providers._rpc(method, params)
        except Exception as e:                     # transient upstream
            last = e
            time.sleep(3 * (i + 1))
    raise last


def check(entry):
    pool = entry["pool"]
    out = {"stratum": entry["stratum"], "symbol": entry["sym"], "pool": pool}

    # 1. THE ACCOUNT, and the slot it was true at.
    info = rpc("getAccountInfo", [pool, {"encoding": "base64"}])
    slot_acct = ((info or {}).get("result") or {}).get("context", {}).get("slot")
    if slot_acct is None:
        slot_acct = ((info or {}).get("result") or {}).get("slot")
    val = ((info or {}).get("result") or {}).get("value") or {}
    if val.get("owner") != PUMPFUN:
        out["verdict"] = "SKIPPED-not-a-curve"
        return out
    raw = base64.b64decode((val.get("data") or [""])[0])
    vt, vs, rt, rs, sup = struct.unpack_from("<QQQQQ", raw, 8)
    q = bytes(raw[83:115])
    out.update({"quote": "USDC" if q == USDC else "SOL",
                "graduated": raw[48] == 1,
                "lamports": val.get("lamports"),
                "decoded_reserve": rs, "slot_account": slot_acct})

    # 2. THE NEWEST TRANSACTION TOUCHING THAT ACCOUNT.
    sigs = rpc("getSignaturesForAddress", [pool, {"limit": 1}])
    got = ((sigs or {}).get("result") or [])
    if not got:
        out["verdict"] = "SKIPPED-no-signatures"
        return out
    sig, slot_tx = got[0].get("signature"), got[0].get("slot")
    out.update({"slot_tx": slot_tx, "signature": sig})

    # 3. ⛔ THE SLOT GATE. A transaction newer than the account read means the
    #    two describe different moments -- a RACE, not a disagreement.
    if slot_tx is None or slot_acct is None or slot_tx > slot_acct:
        out["verdict"] = "SKIPPED-RACE (a trade landed after the account read)"
        return out

    tx = rpc("getTransaction",
             [sig, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}])
    res = (tx or {}).get("result") or {}
    meta = res.get("meta") or {}
    keys = ((res.get("transaction") or {}).get("message") or {}).get("accountKeys") or []
    names = [k.get("pubkey") if isinstance(k, dict) else k for k in keys]
    if pool not in names:
        out["verdict"] = "SKIPPED-pool-not-in-tx-accounts"
        return out
    idx = names.index(pool)
    post = (meta.get("postBalances") or [])
    if idx >= len(post):
        out["verdict"] = "SKIPPED-no-postBalance-for-index"
        return out
    out["validator_post_balance"] = post[idx]

    # 4. THE COMPARISON. Two producers, two responses, exact or not at all.
    out["lamports_match"] = (post[idx] == val.get("lamports"))
    rent = RENT_BY_LEN.get(len(raw))
    if out["quote"] == "SOL" and not out["graduated"] and rent is not None:
        implied = post[idx] - rent
        out["reserve_from_validator"] = implied
        out["reserve_match"] = (implied == rs)
        out["verdict"] = ("EXACT MATCH" if out["lamports_match"] and out["reserve_match"]
                          else "MISMATCH")
    elif out["quote"] == "USDC":
        # RENT-ONLY LAMPORTS PROVE THE RESERVES ARE NOT SOL. THEY DO NOT PROVE
        #    THE USDC FIGURE IS RIGHT -- and this is the arm the 1,000x bug
        #    lived in, so leaving it at the weaker claim would validate
        #    everything except the thing that broke.
        # ⇒ THE SPL TOKEN PROGRAM'S OWN ACCOUNTING is a third producer: a
        #   different program, a different response, and a PARSED field I do
        #   not decode. It also STATES the mint's decimals, so the scale
        #   factor stops being my assumption and becomes a read value.
        acc = rpc("getTokenAccountsByOwner",
                  [pool, {"mint": USDC_MINT}, {"encoding": "jsonParsed"}])
        vals = ((acc or {}).get("result") or {}).get("value") or []
        if not vals:
            out["verdict"] = "SKIPPED-no-USDC-token-account-for-pool"
            return out
        amt = ((((vals[0].get("account") or {}).get("data") or {})
                .get("parsed") or {}).get("info") or {}).get("tokenAmount") or {}
        out["token_program_raw"] = amt.get("amount")
        out["token_program_decimals"] = amt.get("decimals")
        out["reserve_match"] = (str(amt.get("amount")) == str(rs))
        out["decimals_match"] = (amt.get("decimals") == 6)
        out["verdict"] = ("EXACT MATCH (USDC, confirmed by the token program)"
                          if out["lamports_match"] and out["reserve_match"]
                          and out["decimals_match"] else "MISMATCH")
    else:
        # A drained curve holds rent only, and that IS the assertion.
        out["verdict"] = ("EXACT MATCH (rent-only, as expected)"
                          if out["lamports_match"] else "MISMATCH")
    return out


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/tw_strata.json"
    entries = json.load(open(path, encoding="utf-8"))
    print("VERIFYING %d STRATIFIED POOLS AGAINST THE VALIDATOR'S OWN RECORD" % len(entries))
    print("A pair is admitted only when the newest signature PREDATES the account")
    print("read. A later trade is a RACE, reported as skipped -- never a mismatch.")
    print("")
    results = []
    for e in entries:
        try:
            r = check(e)
        except Exception as exc:
            r = {"stratum": e.get("stratum"), "symbol": e.get("sym"),
                 "verdict": "ERROR %s: %s" % (type(exc).__name__, exc)}
        results.append(r)
        print("  %-18s %-12s %s" % (r.get("stratum"), r.get("symbol"), r.get("verdict")))
        if r.get("token_program_raw") is not None:
            print("        decoded reserve %-16s   token program says %-16s  decimals %s"
                  % (r.get("decoded_reserve"), r.get("token_program_raw"),
                     r.get("token_program_decimals")))
        if r.get("decoded_reserve") is not None:
            print("        decoded reserve %-16s   validator-implied %-16s"
                  % (r.get("decoded_reserve"), r.get("reserve_from_validator", "n/a")))
            print("        account lamports %-15s  validator postBalance %-15s  slots acct=%s tx=%s"
                  % (r.get("lamports"), r.get("validator_post_balance", "n/a"),
                     r.get("slot_account"), r.get("slot_tx")))
    print("")
    ok = sum(1 for r in results if str(r.get("verdict", "")).startswith("EXACT"))
    bad = sum(1 for r in results if r.get("verdict") == "MISMATCH")
    skip = sum(1 for r in results if str(r.get("verdict", "")).startswith("SKIPPED"))
    err = sum(1 for r in results if str(r.get("verdict", "")).startswith("ERROR"))
    print("EXACT %d   MISMATCH %d   SKIPPED %d   ERROR %d" % (ok, bad, skip, err))
    strata = sorted({r.get("stratum") for r in results if str(r.get("verdict", "")).startswith("EXACT")})
    print("strata with at least one confirmed match: %s" % (strata or "NONE"))
    # ⛔ THE OUTPUT PATH IS DERIVED FROM THE SCRIPT THAT RAN, and this is not
    #    tidiness. The positive controls are COPIES of this file with a
    #    deliberate defect injected; when they wrote to a fixed path they
    #    OVERWROTE the real results, and I then read a sabotaged run's numbers
    #    and nearly reported them to Langston as the verification's arm counts.
    #    A control that destroys the evidence it was meant to validate is
    #    worse than no control.
    out_path = "/tmp/%s_results.json" % os.path.basename(__file__).rsplit(".", 1)[0]
    json.dump(results, open(out_path, "w"), indent=1, default=str)
    print("full results written to %s" % out_path)
    return 1 if bad or err else 0


if __name__ == "__main__":
    sys.exit(main())
