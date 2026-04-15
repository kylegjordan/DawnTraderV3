#!/usr/bin/env python3
"""
BATCH 61 — A.1 Provisional — Component Independence Check.

Computes Pearson correlation matrix between the three DBS components
(slopeComponent, returnComponent, emaComponent) across the cycle-sampled
MCE telemetry window.

Rule: if any two components are >= 0.90 correlated, the composite is
effectively 2-dimensional and the 0.40/0.35/0.25 weighting is overstating
diversification. That would be an A.1 finding worth flagging.

Also reports:
  - Per-pair correlation stats (are some pairs more redundant than others?)
  - Component magnitude distribution (does any component saturate at clamp?)

Usage: python3 a1_component_correlation.py <path-to-jsonl>
"""
import json
import sys
import math
from collections import defaultdict

def pearson(xs, ys):
    n = len(xs)
    if n < 2:
        return float("nan")
    mx = sum(xs) / n
    my = sum(ys) / n
    num = 0.0
    sx2 = 0.0
    sy2 = 0.0
    for x, y in zip(xs, ys):
        dx = x - mx
        dy = y - my
        num += dx * dy
        sx2 += dx * dx
        sy2 += dy * dy
    denom = math.sqrt(sx2 * sy2)
    return num / denom if denom > 0 else float("nan")

def main(path):
    clean = []
    with open(path) as fp:
        for line in fp:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            if obj["dbs"]["sentinelZero"]:
                continue
            clean.append(obj)

    print(f"INPUT_SAMPLES: {len(clean)}")
    print()

    slopes = [l["dbs"]["slopeComponent"] for l in clean]
    returns = [l["dbs"]["returnComponent"] for l in clean]
    emas = [l["dbs"]["emaComponent"] for l in clean]

    print("=== POOLED (ALL PAIRS, ALL CYCLES) CORRELATION MATRIX ===")
    r_sr = pearson(slopes, returns)
    r_se = pearson(slopes, emas)
    r_re = pearson(returns, emas)
    print(f"  slope  vs return  : {r_sr:+.4f}")
    print(f"  slope  vs ema     : {r_se:+.4f}")
    print(f"  return vs ema     : {r_re:+.4f}")
    print()
    print("Interpretation:")
    print("  |r| < 0.30  — low correlation, components are largely independent")
    print("  0.30–0.70  — moderate, components share some structure but each adds signal")
    print("  0.70–0.90  — high, the components are redundant but not identical")
    print("  |r| >= 0.90 — effectively collinear, one of them is covered by the other two")
    print()
    flagged = []
    for name, r in [("slope×return", r_sr), ("slope×ema", r_se), ("return×ema", r_re)]:
        if abs(r) >= 0.90:
            flagged.append(name)
    if flagged:
        print(f"FLAGGED: {', '.join(flagged)} are collinear — formula is effectively 2D or lower")
    else:
        print("NO_COLLINEARITY: all pairs < 0.90, formula retains 3D structure")
    print()

    # Per-pair correlations (are some pairs worse than others?)
    print("=== PER-PAIR CORRELATION DISTRIBUTION ===")
    by_pair = defaultdict(lambda: ([], [], []))
    for l in clean:
        s = l["dbs"]["slopeComponent"]
        r = l["dbs"]["returnComponent"]
        e = l["dbs"]["emaComponent"]
        by_pair[l["symbol"]][0].append(s)
        by_pair[l["symbol"]][1].append(r)
        by_pair[l["symbol"]][2].append(e)

    pair_sr = []
    pair_se = []
    pair_re = []
    usable_pairs = 0
    for sym, (ss, rs, es) in by_pair.items():
        if len(ss) < 20:
            continue
        usable_pairs += 1
        rsr = pearson(ss, rs)
        rse = pearson(ss, es)
        rre = pearson(rs, es)
        if not math.isnan(rsr):
            pair_sr.append(rsr)
        if not math.isnan(rse):
            pair_se.append(rse)
        if not math.isnan(rre):
            pair_re.append(rre)

    def summary(name, vals):
        if not vals:
            print(f"  {name}: no usable pairs")
            return
        vs = sorted(vals)
        mn = vs[0]
        p25 = vs[len(vs) // 4]
        p50 = vs[len(vs) // 2]
        p75 = vs[3 * len(vs) // 4]
        mx = vs[-1]
        mean = sum(vals) / len(vals)
        high = sum(1 for v in vals if abs(v) >= 0.90)
        print(f"  {name}: n={len(vs)}  mean={mean:+.3f}  min={mn:+.3f}  p25={p25:+.3f}  "
              f"median={p50:+.3f}  p75={p75:+.3f}  max={mx:+.3f}  [|r|>=0.90: {high}]")

    print(f"pairs_with_>=20_samples: {usable_pairs}")
    summary("slope×return", pair_sr)
    summary("slope×ema   ", pair_se)
    summary("return×ema  ", pair_re)
    print()

    # Component magnitude / saturation check
    print("=== COMPONENT CLAMP SATURATION CHECK ===")
    print("  slopeComponent clamped to [-0.40, +0.40]")
    print("  returnComponent clamped to [-0.35, +0.35]  (from [-1,1] * 0.35)")
    print("  emaComponent clamped to [-0.25, +0.25]      (from [-1,1] * 0.25)")

    def sat(vals, lo, hi):
        n = len(vals)
        at_lo = sum(1 for v in vals if v <= lo + 1e-6)
        at_hi = sum(1 for v in vals if v >= hi - 1e-6)
        return at_lo, at_hi, n

    for name, vals, lo, hi in [
        ("slope ", slopes, -0.40, +0.40),
        ("return", returns, -0.35, +0.35),
        ("ema   ", emas, -0.25, +0.25),
    ]:
        at_lo, at_hi, n = sat(vals, lo, hi)
        pct_lo = 100.0 * at_lo / n
        pct_hi = 100.0 * at_hi / n
        print(f"  {name}: {at_lo:5d} ({pct_lo:4.1f}%) at {lo:+.3f} (floor) | "
              f"{at_hi:5d} ({pct_hi:4.1f}%) at {hi:+.3f} (ceiling)")
    print()
    print("A saturating component means the raw signal was clipped — interpretation")
    print("depends on which component. Heavy floor/ceiling on slope (its raw range is")
    print("unbounded before the clamp) suggests the clamp is binding frequently and")
    print("information is being lost at the extremes.")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "logs/phase15b_dbs_telemetry/2026-04-15.jsonl")
