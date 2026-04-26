#!/usr/bin/env python3
"""B65.6 - replay post-B62 classifier on 04-18 telemetry.

Per Kyle directive 2026-04-26: pre-B62 hostile days were classified by the OLD classifier
and trades got routed by it. To compare apples-to-apples, replay the post-B62 classifier
code on the pre-B62 inputs and see what it would have classified.

Cheap version: 04-18 telemetry IS available in phase15b_dbs_telemetry log (which starts 04-15).
Inputs (vol, ADX, mom, DBS) are computed independently of the classifier, so we can take
the recorded inputs and re-run the post-B62 classifier logic on them.

POST-B62 CLASSIFIER LOGIC (from server/core/metrics/market-regime.ts:147-174):

  if (vol < 0.012 && dx < 45 && absDbs < 0.10):
    regime = RANGE_BOUND_STABLE
  elif (vol > 0.020 && dx > 55) or (vol > 0.015 and absDbs >= 0.50):
    regime = IMPULSE_EXPANSION
  elif (mom > 0.003 and dx > 50) or absDbs >= 0.30:
    regime = TREND_FRIENDLY_STABLE  # Path A or Path B
  elif (vol > 0.015 and mom < -0.003) or (dx > 60 and mom < -0.005):
    regime = HIGH_VOLATILITY_UNSTABLE
  else:
    regime = STRUCTURAL_TRANSITION
"""
import json, os
from collections import defaultdict
from datetime import datetime, timezone

TELEMETRY_DIR = "/home/deploy/dawntrader/logs/phase15b_dbs_telemetry"

def post_b62_classify(vol, dx, mom, dbs):
    """Replay post-B62 classifier logic on (vol, ADX, mom, DBS) inputs."""
    abs_dbs = abs(dbs)
    if vol < 0.012 and dx < 45 and abs_dbs < 0.10:
        return "RANGE_BOUND_STABLE"
    elif (vol > 0.020 and dx > 55) or (vol > 0.015 and abs_dbs >= 0.50):
        return "IMPULSE_EXPANSION"
    elif (mom > 0.003 and dx > 50) or abs_dbs >= 0.30:
        return "TREND_FRIENDLY_STABLE"
    elif (vol > 0.015 and mom < -0.003) or (dx > 60 and mom < -0.005):
        return "HIGH_VOLATILITY_UNSTABLE"
    else:
        return "STRUCTURAL_TRANSITION"

def is_path_a(vol, dx, mom, dbs):
    return mom > 0.003 and dx > 50

def is_path_b(vol, dx, mom, dbs):
    return abs(dbs) >= 0.30

DAYS = ["2026-04-15", "2026-04-16", "2026-04-17", "2026-04-18", "2026-04-19",
        "2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24", "2026-04-25"]

print("Loading telemetry and replaying post-B62 classifier...", flush=True)
print("Two regime values per entry:")
print("  RECORDED = whatever was running at time (pre-B62 for 04-15..04-19, post-B62 for 04-20+)")
print("  REPLAYED = post-B62 classifier applied to the same inputs now")
print()

day_results = {}

for d in DAYS:
    path = f"{TELEMETRY_DIR}/{d}.jsonl"
    if not os.path.exists(path): continue
    recorded = defaultdict(int)
    replayed = defaultdict(int)
    paths_in_tfs = defaultdict(int)  # 'a-only', 'b-only', 'both', 'neither'
    total = 0

    with open(path) as fh:
        for line in fh:
            try:
                e = json.loads(line)
                vol = e["classifier"]["vol"]
                dx = e["classifier"]["adx"]
                mom = e["classifier"]["mom"]
                dbs = e["dbs"]["score"]
                rec_regime = e["classifier"]["regime"]
                rep_regime = post_b62_classify(vol, dx, mom, dbs)
                recorded[rec_regime] += 1
                replayed[rep_regime] += 1
                if rep_regime == "TREND_FRIENDLY_STABLE":
                    a = is_path_a(vol, dx, mom, dbs)
                    b = is_path_b(vol, dx, mom, dbs)
                    if a and b: paths_in_tfs["both"] += 1
                    elif a and not b: paths_in_tfs["a-only"] += 1
                    elif b and not a: paths_in_tfs["b-only"] += 1
                    else: paths_in_tfs["neither"] += 1  # shouldn't happen given branch logic
                total += 1
            except Exception:
                continue

    day_results[d] = {
        "total": total,
        "recorded": dict(recorded),
        "replayed": dict(replayed),
        "tfs_paths": dict(paths_in_tfs),
    }

print(f"{'Day':<12} {'classifier':<18} {'TFS%':>6} {'TFS+IE%':>8} {'IE%':>6} {'RBS%':>6} {'STR%':>6} {'HVU%':>6}")
for d in sorted(day_results):
    r = day_results[d]
    n = r["total"]
    if n == 0: continue
    for label, regs in [("RECORDED", r["recorded"]), ("REPLAYED post-B62", r["replayed"])]:
        tfs = regs.get("TREND_FRIENDLY_STABLE",0)/n*100
        ie  = regs.get("IMPULSE_EXPANSION",0)/n*100
        rbs = regs.get("RANGE_BOUND_STABLE",0)/n*100
        str_ = regs.get("STRUCTURAL_TRANSITION",0)/n*100
        hvu = regs.get("HIGH_VOLATILITY_UNSTABLE",0)/n*100
        print(f"  {d:<10} {label:<18} {tfs:>5.1f}% {tfs+ie:>7.1f}% {ie:>5.1f}% {rbs:>5.1f}% {str_:>5.1f}% {hvu:>5.1f}%")
    print()

print()
print("=" * 90)
print("KEY QUESTION: would post-B62 classifier have called 04-18 a high-TFS-concentration day?")
print("=" * 90)
r = day_results.get("2026-04-18")
if r:
    n = r["total"]
    rec_tfs_ie = (r["recorded"].get("TREND_FRIENDLY_STABLE",0) + r["recorded"].get("IMPULSE_EXPANSION",0)) / n * 100
    rep_tfs_ie = (r["replayed"].get("TREND_FRIENDLY_STABLE",0) + r["replayed"].get("IMPULSE_EXPANSION",0)) / n * 100
    print(f"\n04-18 RECORDED (pre-B62 classifier): TFS+IE = {rec_tfs_ie:.1f}%")
    print(f"04-18 REPLAYED (post-B62 classifier): TFS+IE = {rep_tfs_ie:.1f}%")
    print(f"Difference: {rep_tfs_ie - rec_tfs_ie:+.1f} percentage points")
    print()
    if rep_tfs_ie >= 75:
        print(">> POST-B62 CLASSIFIER WOULD HAVE CALLED 04-18 HIGH-CONCENTRATION TOO.")
        print(">> Implication: 04-18 is the SAME hostile-day flavor as 04-22 under the new classifier.")
        print(">> 'Two distinct flavors' finding was a ROUTING ARTIFACT, not real market structure.")
    elif rep_tfs_ie >= 60:
        print(">> POST-B62 CLASSIFIER WOULD HAVE CALLED 04-18 ELEVATED but not extreme.")
        print(">> Implication: 04-18 is partially same-flavor as 04-22 under new classifier.")
    else:
        print(">> POST-B62 CLASSIFIER WOULD HAVE CALLED 04-18 NORMAL CONCENTRATION.")
        print(">> Implication: 04-18 IS a different hostile-day flavor under either classifier.")

# Compare 04-18 vs 04-22 specifically under post-B62
print()
print("=" * 90)
print("04-18 vs 04-22 under POST-B62 classifier (apples-to-apples)")
print("=" * 90)
for d in ["2026-04-18", "2026-04-22"]:
    r = day_results.get(d)
    if not r: continue
    n = r["total"]
    rep = r["replayed"]
    tfs = rep.get("TREND_FRIENDLY_STABLE",0)/n*100
    ie  = rep.get("IMPULSE_EXPANSION",0)/n*100
    rbs = rep.get("RANGE_BOUND_STABLE",0)/n*100
    str_ = rep.get("STRUCTURAL_TRANSITION",0)/n*100
    hvu = rep.get("HIGH_VOLATILITY_UNSTABLE",0)/n*100
    print(f"\n{d} (post-B62 replay): n={n}")
    print(f"  TFS={tfs:.1f}% IE={ie:.1f}% RBS={rbs:.1f}% STR={str_:.1f}% HVU={hvu:.1f}%")
    paths = r["tfs_paths"]
    pt = sum(paths.values())
    if pt > 0:
        print(f"  Of TFS classifications: A-only={paths.get('a-only',0)/pt*100:.1f}%  B-only={paths.get('b-only',0)/pt*100:.1f}%  Both={paths.get('both',0)/pt*100:.1f}%")

print()
print("=" * 90)
print("FULL TABLE: ALL DAYS, RECORDED vs REPLAYED TFS+IE share")
print("=" * 90)
print()
print(f"{'Day':<12} {'rec TFS+IE%':>13} {'rep TFS+IE%':>13} {'delta':>8}")
for d in sorted(day_results):
    r = day_results[d]
    n = r["total"]
    if n == 0: continue
    rec = (r["recorded"].get("TREND_FRIENDLY_STABLE",0) + r["recorded"].get("IMPULSE_EXPANSION",0)) / n * 100
    rep = (r["replayed"].get("TREND_FRIENDLY_STABLE",0) + r["replayed"].get("IMPULSE_EXPANSION",0)) / n * 100
    print(f"  {d:<10} {rec:>12.1f}% {rep:>12.1f}% {rep-rec:>+7.1f}")
