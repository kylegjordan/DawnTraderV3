"""Can the liquidity read tell a RUG from a token that is alive? RUN ON THE HOST.

⛔ KYLE'S QUESTION, 2026-09-02: "how can we verify liquidity? How do we know
   that it's working? and can that be taken as had the rope pulled, or is
   still alive and kicking."

★ A SINGLE READING CAN NEVER SHOW A PULL. Liquidity being removed is an EVENT,
  and an event is only visible as a CHANGE BETWEEN TWO READINGS. Until the
  balance read was fixed there was no series at all -- which is why the death
  class `liquidity_pulled` had never once been backed by a liquidity figure
  and was inferred entirely from the pool having vanished by the time we
  looked.

★★ THE CROSS-CHECK THAT MAKES THIS MORE THAN OUR OWN OPINION: for GRADUATED
   pools the aggregator publishes its own liquidity figure, computed from its
   own data. Where both can see, they must tell the same story. Where they do,
   the finding does not depend on our decode at all.
⚠️ AND FOR BONDING CURVES NOTHING ELSE PUBLISHES A FIGURE -- which is the
   entire reason the study reads the chain itself. Those cases are reported
   SEPARATELY and are explicitly UNCORROBORATED, never pooled with the ones
   that are.

⛔ GRADUATION IS NOT A RUG AND IS RULED OUT, NOT ASSUMED. A graduating curve is
   drained legitimately -- the money moves to a new pool. So a fall is only
   counted when the pool being read is the SAME pool at both ends, and the
   verdict names the source at each end so a venue change is visible rather
   than silently counted as a collapse.

⚠️ WHAT THIS DOES NOT DO: it does NOT reclassify anything. The death definition
   is pre-registered and unchanged; every survival figure still counts these
   tokens exactly as it did. This measures what the definition would SEE if it
   used the number, which is the evidence a decision to change it would rest
   on -- not the change itself.
"""

import collections
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, "/opt/token-watch")
from fingerprint import fingerprint, print_fingerprint   # noqa: E402

OBS = "/var/lib/token-watch/observations"
COLLAPSE = 0.10          # a fall to <=10% of the earlier reading
THEIRS = 0.20            # the aggregator's own figure falling to <=20% corroborates


def main():
    files = sorted(glob.glob(OBS + "/*.jsonl"))
    ser = collections.defaultdict(list)
    for f in files:
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
                ser[r.get("mint")].append({
                    "at": r.get("observed_at"), "amt": amt,
                    "source": ps.get("source"), "pair": r.get("chart_url"),
                    "their_liq": r.get("liquidity_usd"),
                    "vol": r.get("volume_h24"), "alive": r.get("alive")})

    have_any = len(ser)
    series = {m: sorted([x for x in v if x["amt"] is not None], key=lambda z: z["at"] or "")
              for m, v in ser.items()}
    series = {m: v for m, v in series.items() if len(v) >= 2 and v[0]["amt"] > 0}

    agree = disagree = uncorroborated = venue_changed = 0
    rows = []
    for m, v in series.items():
        a, b = v[0], v[-1]
        if b["amt"] / a["amt"] > COLLAPSE:
            continue
        # ⛔ SAME POOL AT BOTH ENDS, or the fall may be a venue change.
        if a["pair"] and b["pair"] and a["pair"] != b["pair"]:
            venue_changed += 1
            continue
        l0, l1 = a["their_liq"], b["their_liq"]
        if l0 in (None, 0) or l1 is None:
            uncorroborated += 1
            rows.append(("UNCORROBORATED", a, b, m))
            continue
        if l1 / l0 <= THEIRS:
            agree += 1
            rows.append(("CORROBORATED", a, b, m))
        else:
            disagree += 1
            rows.append(("DISAGREES -- our read may be wrong", a, b, m))

    tot = agree + disagree + uncorroborated
    print("TOKENS WITH A REAL BALANCE SERIES (two or more readings) : %d of %d seen"
          % (len(series), have_any))
    print("...whose pool fell to <=%d%% of its earlier reading      : %d"
          % (COLLAPSE * 100, tot))
    print("   excluded because the pool ADDRESS changed between reads: %d" % venue_changed)
    print("")
    print("DOES AN INDEPENDENT SOURCE AGREE THE MONEY LEFT?")
    print("   the aggregator's OWN liquidity figure also collapsed  : %d" % agree)
    print("   the aggregator DISAGREES                              : %d" % disagree)
    print("   nothing to check against -- bonding curve, no figure   : %d" % uncorroborated)
    print("   (that last group is why the study reads the chain at all:")
    print("    for a bonding curve, ours is the ONLY liquidity figure.)")
    print("")
    print("AND WHAT DOES THE STUDY CURRENTLY CALL THEM?")
    verdict = collections.Counter()
    for kind, a, b, m in rows:
        verdict["%s / study says alive=%s" % (kind.split(" --")[0], b["alive"])] += 1
    for k, c in verdict.most_common():
        print("   %-52s %d" % (k, c))
    print("")
    print("THE LARGEST CORROBORATED COLLAPSES:")
    corr = sorted([r for r in rows if r[0] == "CORROBORATED"],
                  key=lambda r: -(r[1]["their_liq"] or 0))
    for kind, a, b, m in corr[:6]:
        print("   %s" % m)
        print("      their liquidity  $%-12.0f -> $%-10.0f   our pool read %10.3f -> %.3f"
              % (a["their_liq"], b["their_liq"], a["amt"], b["amt"]))
        print("      still trading $%s/day, study says alive=%s   [%s -> %s]"
              % (b["vol"], b["alive"], a["source"], b["source"]))
    print("")
    print("⛔ NOTHING HERE RECLASSIFIES ANYTHING. The death definition is")
    print("   pre-registered and unchanged; this measures what it would SEE if")
    print("   it used the number. Changing it is a decision, not a fix.")
    print_fingerprint(fingerprint(
        files, observed_at_of=lambda r: r.get("observed_at"), rows=tot))
    return 0


if __name__ == "__main__":
    sys.exit(main())
