"""B-XSTOCK-BID-TRIGGER-RELAND (row 3n.q7) increment 2 OBJ-5 — (V)'s OVERNIGHT NO-DECISION STRETCH, for Kyle's hold decision.

SNAPSHOT PROXY, ONE DAY. Replays captured xStock ticker frames (~4-5 s apart, not the guard's own ~1.5 s frames) through a
model of the book-state chain WITH and WITHOUT the `spread_blown` arm (§L (V): spread > max(kRel x median(ring), floor)
=> hollow => skip ... yield => reseed judged against the retained ring => refused while implausible => escape on
recovery). Source: `/home/deploy/8ap4b_br_sim.py` (8a-P4b Step 8, 2026-09-19), copied here and corrected.

⛔ THE CORRECTION (found at inc-2 Step 3, 2026-09-30): the source counted a YIELD frame twice (`blown` and `yield`) and an
ESCAPE frame twice (`escape` and `unvalidated`), so its per-segment totals were not frame counts: arm-on RTH 333,434 vs
arm-off 333,431 (3 escapes), off-hours 245,633 vs 245,614 (14 yields + 5 escapes). "Not decided" computed from those
totals overstated by exactly the double counts: RTH 131 -> 128, off-hours 4,762 -> 4,743. Here every frame lands in
exactly ONE bucket, and `--legacy` reproduces the source's figures as the positive control.

Usage: python3 b_xstock_bid_trigger_v_replay.py <frames.csv> [--legacy]
  frames.csv rows: symbol, epoch_seconds, bid, ask   (the 8a-P4b capture, e.g. /home/deploy/8ap4b_br_0917.csv)
"""
import csv, statistics, collections, sys

K = 3.0; FLOOR = 0.01; W = 20; CAP = 60
LEGACY = '--legacy' in sys.argv
rows = collections.defaultdict(list)
for s, t, b, a in csv.reader(open(sys.argv[1])):
    rows[s].append((float(t), float(b), float(a)))


def rth(t):
    m = int((t % 86400) // 60)
    return 810 <= m < 1200  # 13:30-20:00Z (US regular hours in EDT)


def sim(frames, arm):
    ring = None; retained = None; seedImpl = False; hollow = 0; runMoves = 0; prev = None; moved_chain = False
    out = collections.Counter()
    # the longest run of consecutive NOT-DECIDED frames per segment: (frames, seconds). A run ends at a decided frame or a
    # segment change (a run is never merged across the RTH boundary).
    best = {'rth': (0, 0.0), 'off': (0, 0.0)}
    runs_over_1h = {'rth': 0, 'off': 0}
    over1h_runs = {'rth': [], 'off': []}  # (frames, seconds) of every run over 1 h — the density disclosure
    cur = 0; cur_t0 = None; cur_seg = None; last_t = None

    def close_run(t_end):
        nonlocal cur
        if cur:
            dur = t_end - cur_t0
            # the LONGEST stretch is the longest in TIME (Langston inc-2 Step-4 BLOCKER-1: it was chosen by frame count and
            # its duration then reported, so a dense short run could hide a sparse long one)
            if dur > best[cur_seg][1]: best[cur_seg] = (cur, dur)
            if dur > 3600:
                runs_over_1h[cur_seg] += 1
                over1h_runs[cur_seg].append((cur, dur))
        cur = 0

    for (t, b, a) in frames:
        seg = 'rth' if rth(t) else 'off'
        decided = False
        if a < b:
            out[(seg, 'crossed')] += 1; prev = (b, a)
        else:
            mid = (a + b) / 2; sp = (a - b) / mid
            mv = prev is not None and (b != prev[0] or a != prev[1]); prev = (b, a)
            if ring is None:  # seed (unvalidated this frame)
                seedImpl = retained is not None and sp > K * statistics.median(retained)
                if not seedImpl: retained = None
                ring = [sp]; hollow = 0; runMoves = 0; moved_chain = False
                out[(seg, 'seed')] += 1
            else:
                thr = max(K * statistics.median(ring), FLOOR)
                if arm and sp > thr:
                    hollow += 1
                    if hollow >= CAP:
                        if not seedImpl and moved_chain: retained = list(ring)
                        ring = None; hollow = 0
                        out[(seg, 'yield')] += 1
                        if LEGACY: out[(seg, 'blown')] += 1  # the source's double count
                    else:
                        out[(seg, 'blown')] += 1
                else:
                    hollow = 0
                    if mv: moved_chain = True
                    if seedImpl:
                        rthr = K * statistics.median(retained)
                        runMoves = (runMoves + (1 if mv else 0)) if sp <= rthr else 0
                        trail = (ring + [sp])[-W:]
                        if len(trail) >= W and statistics.median(trail) <= rthr and sp <= rthr and runMoves >= 2:
                            out[(seg, 'escape')] += 1
                            if LEGACY: out[(seg, 'unvalidated')] += 1  # the source's double count
                            ring = [sp]; seedImpl = False; retained = None; runMoves = 0; moved_chain = False
                        else:
                            ring = (ring + [sp])[-W:]; out[(seg, 'unvalidated')] += 1
                    else:
                        ring = (ring + [sp])[-W:]; out[(seg, 'decided')] += 1; decided = True
        if decided or (cur and seg != cur_seg):
            close_run(t)
        if not decided:
            if cur == 0: cur_t0 = t; cur_seg = seg
            cur += 1
        last_t = t
    if cur and last_t is not None: close_run(last_t)
    return out, best, runs_over_1h, over1h_runs


tot = {True: collections.Counter(), False: collections.Counter()}
per = []
for s, f in sorted(rows.items()):
    o1, b1, h1, r1runs = sim(f, True); o0, b0, h0, _ = sim(f, False)
    tot[True].update(o1); tot[False].update(o0)
    per.append((s, b1['off'], b0['off'], h1['off'], b1['rth'], h0['off'], r1runs['off']))


def summ(c, seg):
    n = sum(v for (sg, k), v in c.items() if sg == seg)
    return n, {k: v for (sg, k), v in sorted(c.items()) if sg == seg}


print(f"# SNAPSHOT PROXY, ONE DAY — {len(rows)} symbols — {'LEGACY (source double counts, the positive control)' if LEGACY else 'each frame counted once'}")
for seg in ('rth', 'off'):
    for arm in (False, True):
        n, d = summ(tot[arm], seg)
        dec = d.get('decided', 0)
        print(f"{seg} arm={arm} frames={n} decided={dec} not_decided={n - dec} ({100 * (n - dec) / max(n, 1):.3f}%) {d}")
if LEGACY:
    sys.exit(0)
print()
over1h = [p for p in per if p[3] > 0]  # the direct object: symbols with >= 1 off-hours run over 1 h (runs_over_1h)
print(f"# OFF-HOURS: symbols whose longest no-decision stretch exceeds 1 h with the arm ON: {len(over1h)} of {len(per)}"
      f" (arm OFF: {sum(1 for p in per if p[5] > 0)} of {len(per)})")
print("# WARNING - DENSITY BIAS (Langston inc-2 Step-4 r2): a run is counted over SAMPLED frames with no density floor, so a capture gap"
      " can merge two sub-hour stretches into one over-hour stretch. Direction: it INFLATES the arm's overnight blindness (argues"
      " for the hold). Read each over-1 h run with its frame count and implied seconds-per-frame below; the capture's nominal"
      " cadence is ~4-5 s. Against it: the ticker is event-driven, so a sparse stretch can be a book that genuinely stayed blown;"
      " the snapshot writer is time-throttled, so a brief recovery can go uncaptured. Read the headline as an UPPER bound.")
print("symbol longest_off_arm(frames,s) longest_off_noarm(frames,s) off_runs_over_1h_arm longest_rth_arm(frames,s) | over-1h runs: frames,seconds,s/frame")
per.sort(key=lambda x: -x[1][1])
for s, b1, b0, h1, r1, _h0, runs in per:
    dens = ' '.join(f"[{n},{d:.0f}s,{d / max(n, 1):.0f}s/f]" for n, d in sorted(runs, key=lambda x: -x[1]))
    print(f"{s} ({b1[0]},{b1[1]:.0f}s) ({b0[0]},{b0[1]:.0f}s) {h1} ({r1[0]},{r1[1]:.0f}s){' | ' + dens if dens else ''}")
allruns = [r for p in per for r in p[6]]
if allruns:
    spf = sorted(d / max(n, 1) for n, d in allruns)
    print(f"# over-1 h runs: {len(allruns)} across {len(over1h)} symbols; seconds-per-frame median {spf[len(spf) // 2]:.0f}, "
          f"max {spf[-1]:.0f}; {sum(1 for x in spf if x > 60)} of {len(spf)} runs average more than 60 s between frames")
