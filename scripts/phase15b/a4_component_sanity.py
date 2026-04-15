#!/usr/bin/env python3
"""
BATCH 61 — A.4 Provisional — Component Sanity Spot Check + Silent-Zero Count.

Rerouted from VTS trade metadata to cycle-sampled MCE telemetry per the
2026-04-15 scope reroute (VTS does not carry components).

Sampling rule (per Langston's request: avoid monoculture):
  - Pick 20 pairs total, stratified ~evenly across LOW_ATR / MID_ATR / HIGH_ATR
  - Within each bucket, spread across DBS categories where possible
  - For each selected pair, pull the most-recent clean sample and check:
    * Sign of slopeComponent matches sign of returnComponent?
    * Sign of emaComponent matches sign of slopeComponent?
    * Score matches the expected category given the score?
    * Score within the numerical bounds [-1, +1]?

Usage: python3 a4_component_sanity.py <path-to-jsonl>
"""
import json
import sys
from collections import defaultdict
from statistics import median

CATEGORY_ORDER = [
    "UP_STRONG", "UP_MODERATE", "UP_WEAK",
    "NEUTRAL",
    "DOWN_WEAK", "DOWN_MODERATE", "DOWN_STRONG"
]

def categorize(score):
    if score >= 0.60: return "UP_STRONG"
    if score >= 0.30: return "UP_MODERATE"
    if score >= 0.10: return "UP_WEAK"
    if score <= -0.60: return "DOWN_STRONG"
    if score <= -0.30: return "DOWN_MODERATE"
    if score <= -0.10: return "DOWN_WEAK"
    return "NEUTRAL"

def main(path):
    lines = []
    with open(path) as fp:
        for line in fp:
            line = line.strip()
            if line:
                lines.append(json.loads(line))

    total = len(lines)
    sz_count = sum(1 for l in lines if l["dbs"]["sentinelZero"])
    clean = [l for l in lines if not l["dbs"]["sentinelZero"]]

    print(f"=== SILENT-ZERO COUNT ===")
    print(f"Total samples: {total}")
    print(f"sentinelZero=true: {sz_count} ({100.0 * sz_count / total:.2f}%)")
    print(f"sentinelZero=false: {len(clean)}")
    print()
    if sz_count == 0:
        print("NO silent-zero samples in the current window. The early-return guard")
        print("in directional-bias.ts (triggered when ohlcLen < lookbackPeriod or ATR <= 0)")
        print("has not fired on any pair during the observation window.")
    print()

    # Bucket pairs by median ATR
    by_pair_atr = defaultdict(list)
    by_pair_rows = defaultdict(list)
    for l in clean:
        by_pair_atr[l["symbol"]].append(l["atr"])
        by_pair_rows[l["symbol"]].append(l)
    pair_median_atr = {sym: median(vs) for sym, vs in by_pair_atr.items()}
    sorted_pairs = sorted(pair_median_atr.items(), key=lambda kv: kv[1])
    n_pairs = len(sorted_pairs)
    low_cut = int(n_pairs * 0.20)
    high_cut = int(n_pairs * 0.80)
    low_pairs = [p for p, _ in sorted_pairs[:low_cut]]
    mid_pairs = [p for p, _ in sorted_pairs[low_cut:high_cut]]
    high_pairs = [p for p, _ in sorted_pairs[high_cut:]]

    # Select 20 pairs stratified by bucket (6 low, 8 mid, 6 high) and by category spread.
    # For each bucket, pick pairs whose latest sample spans different categories.
    def pick(bucket_pairs, n_needed):
        # Sort by latest category to get spread
        latest = [(sym, by_pair_rows[sym][-1]) for sym in bucket_pairs]
        cat_groups = defaultdict(list)
        for sym, row in latest:
            cat_groups[row["dbs"]["category"]].append((sym, row))
        picked = []
        # Round-robin across categories
        cats = list(cat_groups.keys())
        i = 0
        while len(picked) < n_needed and any(cat_groups[c] for c in cats):
            cat = cats[i % len(cats)]
            if cat_groups[cat]:
                picked.append(cat_groups[cat].pop(0))
            i += 1
            if i > 1000:
                break
        return picked

    low_picks = pick(low_pairs, min(6, len(low_pairs)))
    mid_picks = pick(mid_pairs, min(8, len(mid_pairs)))
    high_picks = pick(high_pairs, min(6, len(high_pairs)))

    print("=== 20-PAIR COMPONENT SANITY SPOT CHECK ===")
    print(f"Selected: {len(low_picks)} LOW_ATR + {len(mid_picks)} MID_ATR + {len(high_picks)} HIGH_ATR = "
          f"{len(low_picks) + len(mid_picks) + len(high_picks)} total")
    print()
    print(f"{'bucket':6s} {'symbol':14s} {'category':14s} {'score':>8s} {'slope':>8s} {'return':>8s} {'ema':>8s}  checks")
    print("-" * 95)

    all_checks = []
    for bucket_label, picks in [("LOW", low_picks), ("MID", mid_picks), ("HIGH", high_picks)]:
        for sym, row in picks:
            d = row["dbs"]
            s = d["score"]
            sl = d["slopeComponent"]
            re = d["returnComponent"]
            em = d["emaComponent"]
            cat = d["category"]
            # Sanity checks
            checks = []
            expected_cat = categorize(s)
            if expected_cat == cat:
                checks.append("cat-ok")
            else:
                checks.append(f"cat-MISMATCH({expected_cat})")
            sum_c = sl + re + em
            if abs(s - sum_c) < 1e-9:
                checks.append("sum-ok")
            else:
                checks.append(f"sum-MISMATCH({s-sum_c:+.4f})")
            if -1.0 <= s <= 1.0:
                checks.append("bounds-ok")
            else:
                checks.append(f"bounds-VIOLATION({s:+.4f})")
            # Sign coherence (soft check — signs don't have to agree)
            sig_slope = 1 if sl > 0 else (-1 if sl < 0 else 0)
            sig_return = 1 if re > 0 else (-1 if re < 0 else 0)
            sig_ema = 1 if em > 0 else (-1 if em < 0 else 0)
            agree = (sig_slope == sig_return == sig_ema)
            partial = (sig_slope == sig_return) or (sig_slope == sig_ema) or (sig_return == sig_ema)
            if agree:
                checks.append("signs-all-agree")
            elif partial:
                checks.append("signs-partial")
            else:
                checks.append("signs-mixed")
            all_checks.append(checks)
            print(f"{bucket_label:6s} {sym:14s} {cat:14s} {s:+8.4f} {sl:+8.4f} {re:+8.4f} {em:+8.4f}  {' '.join(checks)}")
    print()

    # Aggregate
    total_picks = len(all_checks)
    cat_ok = sum(1 for c in all_checks if "cat-ok" in c)
    sum_ok = sum(1 for c in all_checks if "sum-ok" in c)
    bounds_ok = sum(1 for c in all_checks if "bounds-ok" in c)
    signs_all = sum(1 for c in all_checks if "signs-all-agree" in c)
    signs_partial = sum(1 for c in all_checks if "signs-partial" in c)
    signs_mixed = sum(1 for c in all_checks if "signs-mixed" in c)

    print("=== AGGREGATE ===")
    print(f"Category-threshold consistency: {cat_ok}/{total_picks}")
    print(f"Sum-reconstruction consistency:  {sum_ok}/{total_picks}")
    print(f"Numeric bounds [-1, +1]:         {bounds_ok}/{total_picks}")
    print(f"Sign coherence — all agree:      {signs_all}/{total_picks}")
    print(f"Sign coherence — partial:        {signs_partial}/{total_picks}")
    print(f"Sign coherence — mixed:          {signs_mixed}/{total_picks}")
    print()
    print("Sign coherence interpretation: ALL-agree means slope, return, and EMA")
    print("point the same direction (strong unanimity signal). PARTIAL means two of")
    print("three agree (usual case — one component can reasonably disagree during")
    print("a reversal). MIXED means slope, return, and EMA all have different signs")
    print("(reversal in progress — the final score is the weighted compromise).")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "logs/phase15b_dbs_telemetry/2026-04-15.jsonl")
