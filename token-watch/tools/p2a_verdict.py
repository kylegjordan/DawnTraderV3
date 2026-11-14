#!/usr/bin/env python3
"""B-TOKEN-WATCH-FOLLOWUP-MEMORY P2a - apply the F-6 criterion EXACTLY as pre-registered (change list, "F-6 — RULED",
written before any P2a run) to one arm's sample file. Root on staging:
    python3 p2a_verdict.py <arm>-samples.jsonl <kill time ISO-Z> [interval_s=5]
It reads; it decides nothing the criterion does not. Prints the deciding line, the verdict and the beside-records."""
import json, sys
from datetime import datetime, timezone

CAP = 536_870_912
THRESH = 314_572_800


def ts(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()


path, kill = sys.argv[1], ts(sys.argv[2])
interval = float(sys.argv[3]) if len(sys.argv) > 3 else 5.0
raw = open(path, "rb").read()
lines, discarded = [], []
for i, chunk in enumerate(raw.split(b"\n")):
    if not chunk.strip():
        continue
    try:
        obj = json.loads(chunk)
        if not isinstance(obj, dict):
            raise ValueError
        lines.append(obj)
    except ValueError:
        discarded.append(i)
seqs = [x.get("seq") for x in lines]
contiguous = seqs == list(range(1, len(seqs) + 1))
deciding = next((x for x in reversed(lines) if x.get("kind") in ("start", "sample", "mark") and x.get("stat")), None)
out = {"file_bytes": len(raw), "lines": len(lines), "discarded_partials": len(discarded),
       "discarded_were_last": discarded == [] or max(discarded) >= len(raw.split(b"\n")) - 2,
       "seq_contiguous_from_1": contiguous, "kinds": {}}
for x in lines:
    out["kinds"][x.get("kind")] = out["kinds"].get(x.get("kind"), 0) + 1
if deciding is None:
    out["verdict"] = "VOID - no line carries memory.stat"
    print(json.dumps(out, indent=2))
    sys.exit(0)
st = deciding["stat"]
S = st.get("anon", 0) + st.get("slab_unreclaimable", 0)
F = st.get("file", 0)
C = deciding.get("memory_current")
U = CAP - C
gap = kill - deciding["t"]
four = S + st.get("kernel_stack", 0) + st.get("pagetables", 0)
first = next((x for x in lines if x.get("stat")), {})
leg1, leg2 = S >= THRESH, S > F
sf1, sf2 = max(0, THRESH - S), max(0, F - S)
if not contiguous:
    verdict = "VOID - seq not contiguous from 1 (a line was lost)"
elif gap > 2 * interval:
    verdict = "UNDERDETERMINED - deciding line is %.1f s before the kill (> 2 x %.0f s)" % (gap, interval)
elif leg1 and leg2:
    verdict = "PASS"
else:
    failing = [("S >= 300 MiB", sf1), ("S > file", sf2)]
    failing = [(n, s) for n, s in failing if s > 0]
    if all(U < s for _, s in failing):
        verdict = "FAIL - " + ", ".join("%s short by %d B (U=%d B could not close it)" % (n, s, U) for n, s in failing)
    else:
        verdict = "UNDERDETERMINED - " + ", ".join("%s short by %d B, U=%d B could have closed it" % (n, s, U)
                                                   for n, s in failing if U >= s)
out.update({
    "deciding": {"seq": deciding["seq"], "kind": deciding["kind"], "stage": deciding.get("stage"), "t": deciding["t"],
                 "gap_to_kill_s": round(gap, 2), "memory_current": C, "memory_peak": deciding.get("memory_peak"),
                 "events": deciding.get("events"), "stat": st},
    "S_anon_plus_slab_unreclaimable": S, "F_file": F, "U_cap_minus_current": U,
    "leg_S_ge_300MiB": leg1, "leg_S_gt_file": leg2,
    "four_term_C1ii_sum_UPPER_bound_256MiB_label": four,
    "beside": {"shmem": st.get("shmem"), "pgsteal_delta": st.get("pgsteal", 0) - (first.get("stat") or {}).get("pgsteal", 0),
               "pgscan_delta": st.get("pgscan", 0) - (first.get("stat") or {}).get("pgscan", 0),
               "sample_file_bytes": len(raw), "deciding_stage_or_kind": deciding.get("stage") or deciding.get("kind")},
    "verdict": verdict,
})
print(json.dumps(out, indent=2, sort_keys=True))
