"""Freeze the PRE-SWITCH behaviour of the chain reads. RUN BEFORE ANY SWITCH.

⛔⛔ THIS HAS A DEADLINE AND THE DEADLINE IS THE SWITCH ITSELF (Langston,
   2026-09-03): "the baseline must be frozen from the existing provenance
   store BEFORE the switch. Switch first and the baseline is contaminated and
   this control is gone permanently."

★ WHAT IT BUYS. After a provider change, the question "has it silently
  degraded?" can only be answered against what normal looked like beforehand.
  The observable is the MIX of `decode_curve_account` source values — a
  degradation surfaces as a rise in `curve_decode_failed`,
  `no_wsol_account_found` or `error`, and as a shift in the ratio of the
  healthy branches. That mix is measurable today at zero cost and is
  unrecoverable once mixed provider data is in the store.

⚠️ IT IS A BASELINE, NOT A THRESHOLD. It records what was, with its own
   denominator and window. It does not by itself say what counts as a
   departure; a threshold drawn from one window is a threshold fitted to one
   window. The band is stated as a range across days so a reader can see the
   natural variation rather than infer it from a single number.
"""

import collections
import glob
import gzip
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, "/opt/token-watch")

OBS = "/var/lib/token-watch/observations"
OUT = "/var/lib/token-watch/study/preswitch-baseline.json"


def main():
    per_day = collections.defaultdict(collections.Counter)
    for f in sorted(glob.glob(OBS + "/*.jsonl")):
        day = os.path.basename(f).replace(".jsonl", "")
        opener = gzip.open if f.endswith(".gz") else open
        with opener(f, "rt", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try:
                    r = json.loads(line)
                except Exception:
                    continue
                ps = r.get("pool_sol")
                if not isinstance(ps, dict):
                    continue
                per_day[day][ps.get("source") or "none"] += 1

    print("PRE-SWITCH SOURCE MIX, by day (the control that expires at the switch)")
    print("")
    sources = sorted({s for d in per_day.values() for s in d})
    bands = {}
    for s in sources:
        shares = []
        for day, c in sorted(per_day.items()):
            tot = sum(c.values())
            if tot >= 500:            # a day with too few reads is not a rate
                shares.append(100.0 * c.get(s, 0) / tot)
        if shares:
            bands[s] = {"min_pct": round(min(shares), 3),
                        "max_pct": round(max(shares), 3),
                        "days": len(shares)}
    for day, c in sorted(per_day.items()):
        tot = sum(c.values())
        print("  %s  reads=%-7d %s" % (day, tot,
              "  ".join("%s=%.1f%%" % (s, 100.0 * c.get(s, 0) / tot)
                        for s in sources if c.get(s))))
    print("")
    print("BAND ACROSS FULL DAYS (>=500 reads), which is the thing to compare against:")
    for s, b in sorted(bands.items(), key=lambda x: -x[1]["max_pct"]):
        print("   %-34s %6.2f%% .. %6.2f%%   (%d days)"
              % (s, b["min_pct"], b["max_pct"], b["days"]))

    payload = {"what": "pre-switch source mix for the chain reads, by day",
               "why": ("a provider degradation surfaces as a shift in this mix; "
                       "it is unrecoverable once mixed-provider data is in the store"),
               "provider": "helius", "bands_pct": bands,
               "per_day": {d: dict(c) for d, c in per_day.items()},
               "caveat": ("a baseline, not a threshold. One window cannot say what "
                          "counts as a departure; the band shows natural variation.")}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=1, sort_keys=True)
    print("")
    print("written to %s" % OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
