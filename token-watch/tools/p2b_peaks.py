#!/usr/bin/env python3
"""B-TOKEN-WATCH-FOLLOWUP-MEMORY P2b - read one arm's sample file for the R3 done-line legs and the stage trail.
    python3 p2b_peaks.py <arm>-samples.jsonl
Prints: the sampled peak of the four-term unreclaimable sum (anon + slab_unreclaimable + kernel_stack + pagetables)
and where it occurred; the last line's memory.peak / events; and the named-stage trail (open:observations marks are
summarised, not listed - an append opens the day file once per observation)."""
import json, sys

MiB = 1048576.0
path = sys.argv[1]
peak = (0, None)
last = None
t0 = None
stages = []
obs_opens = 0
n = 0
with open(path, "rb") as fh:
    for raw in fh:
        if not raw.strip():
            continue
        try:
            r = json.loads(raw)
        except ValueError:
            continue
        n += 1
        if t0 is None:
            t0 = r.get("t")
        st = r.get("stat") or {}
        four = st.get("anon", 0) + st.get("slab_unreclaimable", 0) + st.get("kernel_stack", 0) + st.get("pagetables", 0)
        if four > peak[0]:
            peak = (four, r)
        last = r
        stg = r.get("stage")
        if stg and stg.startswith("open:observations/"):
            obs_opens += 1
            continue
        if r.get("kind") == "mark" and stg != "loop":
            stages.append(r)
pr = peak[1] or {}
print("lines %d, open:observations marks %d" % (n, obs_opens))
print("PEAK four-term %.1f MiB at t+%.1fs seq %s %s (anon %.1f, file %.1f)" % (
    peak[0] / MiB, (pr.get("t", 0) - (t0 or 0)), pr.get("seq"), pr.get("stage") or pr.get("kind"),
    (pr.get("stat") or {}).get("anon", 0) / MiB, (pr.get("stat") or {}).get("file", 0) / MiB))
print("LAST line kind=%s stage=%s memory.peak=%s events=%s thread_alive=%s joined=%s" % (
    last.get("kind"), last.get("stage"), last.get("memory_peak"), last.get("events"), last.get("thread_alive"),
    last.get("joined")))
for r in stages:
    st = r.get("stat") or {}
    print("%8.1fs seq=%-7s %-44s anon=%6.1f file=%6.1f blocks=%s len_prev=%s dead=%s bytes=%s" % (
        r["t"] - t0, r["seq"], (r.get("stage") or "")[:44], st.get("anon", 0) / MiB, st.get("file", 0) / MiB,
        r.get("allocated_blocks"), r.get("len_prev"), r.get("len_dead_cache"), r.get("file_bytes")))
