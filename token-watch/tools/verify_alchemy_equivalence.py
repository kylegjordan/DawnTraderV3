"""ACCEPTANCE TEST for moving the chain reads to Alchemy. RUN ON THE HOST.

⛔ A DATA SOURCE IS NOT SWAPPED ON A PRICE. It is swapped when it has been
   shown to return THE SAME BYTES as the source it replaces, on every method
   we depend on, sustained. Anything less and a silent difference becomes a
   study finding.

★ THE CORRECTNESS TEST USES A DRAINED (GRADUATED) CURVE AS ITS ANCHOR, and
  that choice is the whole design: a drained curve is FROZEN -- its reserves
  are zero and nothing trades on it -- so the two providers must agree
  byte-for-byte and ANY difference is a real disagreement rather than the
  account having moved between two reads. On a live curve a difference is
  ambiguous, which is no test at all.

⚠️ AND A LIVE CURVE IS ALSO CHECKED, but only for SHAPE (same owner, same
   decodable structure), never for byte equality -- because there a trade
   between the two reads produces a legitimate difference. Stating which
   comparison is which is the point; pooling them would let a real fault hide
   behind "it probably traded".

METHODS COVERED -- all four we actually use. PublicNode passed three of four
   in an earlier probe and refused `getTokenAccountsByOwner`, which is the one
   graduated pools need. Three of four is a failure, not a pass.
"""

import base64
import json
import os
import struct
import sys
import time
import urllib.request

sys.path.insert(0, "/opt/token-watch")

import providers  # noqa: E402
import provenance  # noqa: E402

provenance.record_follow_up = lambda *a, **k: None   # a probe is not an observation

PUMPFUN = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
WSOL = "So11111111111111111111111111111111111111112"
ALCHEMY_ENV = "/etc/token-watch/alchemy.env"

PASS = FAIL = 0


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  PASS  " + label)
    else:
        FAIL += 1
        print("  FAIL  " + label + ("  -- " + detail if detail else ""))


def alchemy_url():
    """Read the key from the protected file. NEVER from argv or the environment
    of a command line -- every local account can read those."""
    if not os.path.exists(ALCHEMY_ENV):
        raise RuntimeError("%s is absent" % ALCHEMY_ENV)
    for line in open(ALCHEMY_ENV, encoding="utf-8"):
        if line.startswith("ALCHEMY_API_KEY="):
            return "https://solana-mainnet.g.alchemy.com/v2/" + line.split("=", 1)[1].strip()
    raise RuntimeError("ALCHEMY_API_KEY not found in %s" % ALCHEMY_ENV)


URL = alchemy_url()


def alchemy(method, params, timeout=15):
    body = json.dumps({"jsonrpc": "2.0", "id": 1,
                       "method": method, "params": params}).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def find_anchors():
    """A FROZEN (graduated) curve and a LIVE one, from our own records."""
    import glob
    frozen = live = None
    for f in sorted(glob.glob("/var/lib/token-watch/provenance/follow-up/*.jsonl"))[-1:]:
        for line in open(f, encoding="utf-8", errors="replace"):
            try:
                r = json.loads(line)
            except Exception:
                continue
            if r.get("source") != "helius_pool_account":
                continue
            b = r.get("body")
            if isinstance(b, str):
                try:
                    b = json.loads(b)
                except Exception:
                    continue
            v = ((b or {}).get("result") or {}).get("value") or {}
            if v.get("owner") != PUMPFUN or not v.get("data"):
                continue
            raw = base64.b64decode(v["data"][0])
            if len(raw) < 115:
                continue
            if raw[48] == 1 and frozen is None:
                frozen = r.get("mint")
            elif raw[48] == 0 and live is None:
                live = r.get("mint")
            if frozen and live:
                break
    return frozen, live


def main():
    frozen, live = find_anchors()
    print("ALCHEMY EQUIVALENCE TEST")
    print("  frozen anchor (drained curve, cannot change): %s" % frozen)
    print("  live anchor   (may trade between reads)     : %s" % live)
    print("")

    print("BLOCK 1 -- ALL FOUR METHODS ANSWER")
    sig = None
    for m, p in (("getAccountInfo", [frozen, {"encoding": "base64"}]),
                 ("getTokenAccountsByOwner", [frozen, {"mint": WSOL},
                                              {"encoding": "jsonParsed"}]),
                 ("getSignaturesForAddress", [frozen, {"limit": 2}])):
        try:
            r = alchemy(m, p)
            ok = "error" not in r
            check("%s answers" % m, ok, str(r.get("error"))[:70])
            if m == "getSignaturesForAddress" and ok:
                got = r.get("result") or []
                sig = got[0]["signature"] if got else None
        except Exception as e:
            check("%s answers" % m, False, "%s %s" % (type(e).__name__, str(e)[:50]))
    if sig:
        try:
            r = alchemy("getTransaction", [sig, {"encoding": "jsonParsed",
                                                 "maxSupportedTransactionVersion": 0}])
            check("getTransaction answers", "error" not in r, str(r.get("error"))[:70])
        except Exception as e:
            check("getTransaction answers", False, str(e)[:60])
    else:
        check("getTransaction answers", False, "no signature to fetch")

    print("")
    print("BLOCK 2 -- THE FROZEN CURVE MUST BE BYTE-IDENTICAL TO WHAT WE PAY FOR")
    # ⛔ THE DISCRIMINATING TEST. This account cannot change, so a difference
    #    here is a genuine disagreement between providers and not a trade.
    h = providers._rpc("getAccountInfo", [frozen, {"encoding": "base64"}])
    a = alchemy("getAccountInfo", [frozen, {"encoding": "base64"}])
    hv = ((h or {}).get("result") or {}).get("value") or {}
    av = ((a or {}).get("result") or {}).get("value") or {}
    check("both providers return the account", bool(hv) and bool(av), "")
    check("★ the DATA is byte-identical",
          (hv.get("data") or [""])[0] == (av.get("data") or [""])[0], "differs")
    check("★ the owner program agrees", hv.get("owner") == av.get("owner"),
          "%s vs %s" % (hv.get("owner"), av.get("owner")))
    check("★ the lamport balance agrees", hv.get("lamports") == av.get("lamports"),
          "%s vs %s" % (hv.get("lamports"), av.get("lamports")))
    # And it must decode to the same numbers through OUR decoder.
    dh = providers.decode_curve_account(hv)
    da = providers.decode_curve_account(av)
    check("★ our decoder produces the same verdict from both",
          dh.get("source") == da.get("source") and dh.get("sol") == da.get("sol"),
          "%s vs %s" % (dh.get("source"), da.get("source")))

    print("")
    print("BLOCK 3 -- A LIVE CURVE: SHAPE ONLY, NEVER BYTE EQUALITY")
    # A trade between the two reads makes a byte difference legitimate, so
    #    asserting equality here would be a test that fails for a correct
    #    provider. Shape is what can honestly be asserted.
    hl = ((providers._rpc("getAccountInfo", [live, {"encoding": "base64"}]) or {})
          .get("result") or {}).get("value") or {}
    al = ((alchemy("getAccountInfo", [live, {"encoding": "base64"}]) or {})
          .get("result") or {}).get("value") or {}
    check("both return the live account", bool(hl) and bool(al), "")
    check("same owner program", hl.get("owner") == al.get("owner"), "")
    dhl = providers.decode_curve_account(hl)
    dal = providers.decode_curve_account(al)
    check("both decode to the same SOURCE (may differ in amount if it traded)",
          dhl.get("source") == dal.get("source"),
          "%s vs %s" % (dhl.get("source"), dal.get("source")))
    if dhl.get("sol") is not None and dal.get("sol") is not None:
        print("        depth: paid %.9f   alchemy %.9f   %s"
              % (dhl["sol"], dal["sol"],
                 "identical" if dhl["sol"] == dal["sol"] else "differs (a trade landed between reads)"))

    print("")
    print("BLOCK 4 -- SUSTAINED, AT TWICE OUR REAL RATE")
    # Our need is 0.33/sec. This runs at 0.7/sec for 60s -- polite, and enough
    #    to show whether it throttles under steady use rather than in a burst.
    ok = bad = 0
    lat = []
    t_end = time.time() + 60
    while time.time() < t_end:
        t0 = time.time()
        try:
            r = alchemy("getAccountInfo", [frozen, {"encoding": "base64"}], timeout=10)
            v = ((r.get("result") or {}).get("value")) or {}
            if (v.get("data") or [""])[0] == (hv.get("data") or [""])[0]:
                ok += 1
            else:
                bad += 1
            lat.append((time.time() - t0) * 1000)
        except Exception:
            bad += 1
        s = (1 / 0.7) - (time.time() - t0)
        if s > 0:
            time.sleep(s)
    n = ok + bad
    check("★ every sustained call returned the correct bytes",
          bad == 0 and ok > 30, "%d correct, %d not, of %d" % (ok, bad, n))
    if lat:
        lat.sort()
        print("        %d calls in 60s, latency median %.0f ms, worst %.0f ms"
              % (n, lat[len(lat) // 2], lat[-1]))

    print("")
    print("%d passed, %d failed" % (PASS, FAIL))
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
