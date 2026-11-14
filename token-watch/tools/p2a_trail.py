#!/usr/bin/env python3
"""B-TOKEN-WATCH-FOLLOWUP-MEMORY P2a - the stage-by-stage memory trail of one arm's sample file (no verdict; the verdict
is p2a_verdict.py). Every named stage marker, plus every Nth loop marker, with anon/file in MiB and the Python counters.
    python3 p2a_trail.py <arm>-samples.jsonl [loop_every=50]"""
import json, sys

path = sys.argv[1]
every = int(sys.argv[2]) if len(sys.argv) > 2 else 50
MiB = 1048576.0
rows = [json.loads(l) for l in open(path, "rb").read().split(b"\n") if l.strip()]
t0 = rows[0]["t"]
loop_i = 0
prev_anon = None
for r in rows:
    st = r.get("stat") or {}
    anon, fil = st.get("anon", 0) / MiB, st.get("file", 0) / MiB
    if r.get("kind") == "mark" and r.get("stage") == "loop":
        loop_i += 1
        if loop_i % every:
            continue
    elif r.get("kind") == "sample":
        continue
    print("%7.1fs seq=%-4d %-38s anon=%6.1f file=%6.1f peak=%6.1f blocks=%s len_prev=%s dead_cache=%s entries=%s" % (
        r["t"] - t0, r["seq"], (r.get("stage") or r.get("kind"))[:38], anon, fil,
        (r.get("memory_peak") or 0) / MiB, r.get("allocated_blocks"), r.get("len_prev"), r.get("len_dead_cache"),
        r.get("entries")))
