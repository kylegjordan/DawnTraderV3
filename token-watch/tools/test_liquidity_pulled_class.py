"""Does `liquidity_pulled` actually mean liquidity was pulled? RUN ON THE HOST.

⛔ THE CLASS HAS NEVER BEEN TESTED AGAINST THE CHAIN. It is assigned when the
   aggregator stops returning a pair for a token where it previously returned
   one -- the pool VANISHED from the data source. That is an inference from
   ABSENCE, and I have said so in the record repeatedly. What has never been
   done is the obvious thing: go and look at what the last transactions on
   that pool actually were.

★ THIS IS THE BIGGER PRIZE THAN THE BALANCE-COLLAPSE SET. That set is 253
  tokens. THIS class is 21,112 -- the study's primary death outcome. If the
  name is right, the last thing to happen on these pools is a WITHDRAWAL. If
  the name is wrong, it is ordinary selling and the token simply died.

⛔⛔ AND THE TWO SIGNALS ARE DISJOINT, MEASURED: 0 overlap between the 21,112
   (pool gone) and the 253 (pool present, balance collapsed). They are
   different tokens caught by different evidence, and I muddled them by
   calling both "rug pulls" in a report to Kyle. This tool is about the FIRST
   one.

⚠️ WHAT A NULL RESULT WOULD MEAN, stated before the run so it cannot be
   reinterpreted after: finding no withdrawal does NOT prove there was none.
   `getSignaturesForAddress` returns newest-first and a busy pool's history is
   deep, so absence here is a statement about the WINDOW EXAMINED, not about
   the pool's life. The result is reported as "in the last N transactions
   before it went quiet", never as "there was no withdrawal".

★ AND THE POPULATION IS NAMED HONESTLY: only 2,306 of the 21,112 still have a
  pool address recoverable from an aggregator response taken BEFORE they died.
  The rest cannot be tested at all, and that is a coverage limit, not a result.
"""

import collections
import json
import sys
import time

sys.path.insert(0, "/opt/token-watch")

import providers  # noqa: E402
import provenance  # noqa: E402

provenance.record_follow_up = lambda *a, **k: None   # a probe is not an observation

# ⛔⛔ THE FIRST VERSION OF THIS LIST COUNTED `burn` AND `close` AS A
#    WITHDRAWAL AND RETURNED "16 of 25 withdrawal-shaped" -- which I nearly
#    reported. BurnTokens and CloseAccount are ROUTINE CLEANUP when a curve
#    completes: leftover tokens are burned and temporary accounts closed. They
#    say nothing about whether anyone removed liquidity.
# ★ A LOOSE DEFINITION MANUFACTURES THE FINDING IT IS LOOKING FOR. These are
#   the instructions that actually mean "someone took the money out".
WITHDRAW_WORDS = ("withdraw", "removeliquidity", "remove_liquidity",
                  "decreaseliquidity", "collectfees")
# Reported separately rather than folded in, because a migration is a
#    legitimate reason for a pool to vanish and is NOT a rug.
MIGRATE_WORDS = ("migrate", "graduate", "initializepool", "createpool")
CLEANUP_WORDS = ("burn", "close")
TRADE_WORDS = ("buy", "sell", "swap")


def rpc(method, params, tries=3):
    last = None
    for i in range(tries):
        try:
            return providers._rpc(method, params)
        except Exception as e:
            last = e
            time.sleep(2 * (i + 1))
    raise last


def classify(pool, depth=6):
    """The instruction mix in the last `depth` transactions on this pool."""
    sigs = (rpc("getSignaturesForAddress", [pool, {"limit": depth}]) or {}).get("result") or []
    if not sigs:
        return None, collections.Counter(), 0
    kinds = collections.Counter()
    for s in sigs:
        tx = rpc("getTransaction",
                 [s["signature"], {"encoding": "jsonParsed",
                                   "maxSupportedTransactionVersion": 0}])
        meta = ((tx or {}).get("result") or {}).get("meta") or {}
        for line in (meta.get("logMessages") or []):
            if "Instruction:" in line:
                kinds[line.split("Instruction:")[1].strip()] += 1
    low = " ".join(kinds).lower()
    if any(w in low for w in WITHDRAW_WORDS):
        verdict = "WITHDRAWAL -- someone removed the money"
    elif any(w in low for w in MIGRATE_WORDS):
        verdict = "migration -- pool moved, not a rug"
    elif any(w in low for w in TRADE_WORDS):
        verdict = "trading only"
    elif any(w in low for w in CLEANUP_WORDS):
        verdict = "cleanup only (burn/close) -- NOT a withdrawal"
    else:
        verdict = "neither"
    return verdict, kinds, len(sigs)


def main():
    pairs = json.load(open("/tmp/tw_dead_pairs.json", encoding="utf-8"))
    items = list(pairs.items())
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 25
    # EVENLY SPREAD, not the first n -- the file is in store order, which is
    #    discovery order, and the first n would be the earliest deaths only.
    step = max(1, len(items) // n)
    sample = items[::step][:n]
    print("TESTING THE `liquidity_pulled` CLASS AGAINST THE CHAIN")
    print("population that CAN be tested: %d pools hold a recoverable address"
          % len(items))
    print("(the rest of the 21,112 have none from before they died -- a coverage")
    print("limit, not a result)")
    print("sampling %d, evenly spread across that population" % len(sample))
    print("")
    verdicts = collections.Counter()
    allkinds = collections.Counter()
    for mint, pool in sample:
        try:
            v, kinds, ns = classify(pool)
        except Exception as e:
            verdicts["ERROR %s" % type(e).__name__] += 1
            continue
        if v is None:
            verdicts["no signatures returned for the pool"] += 1
            continue
        verdicts[v] += 1
        allkinds.update(kinds)
        print("   %-44s %-42s (%d txns)" % (mint[:42], v, ns))
    print("")
    print("VERDICTS over the sample:")
    for k, c in verdicts.most_common():
        print("   %-46s %d" % (k, c))
    print("")
    print("INSTRUCTION MIX across every transaction examined:")
    for k, c in allkinds.most_common(14):
        print("   %-34s %d" % (k, c))
    print("")
    print("⚠️  A null result is a statement about the WINDOW EXAMINED -- the last")
    print("    few transactions before the pool went quiet -- and NOT a claim that")
    print("    no withdrawal ever happened.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
