#!/usr/bin/env python3
"""
BATCH 61 — A.1 Provisional — ATR-Bucket Distribution Check.

DBS is supposed to be ATR-normalized so pairs of different volatility regimes
can be compared on the same [-1, +1] scale. This script tests that claim:
it buckets observations by the pair's median ATR over the window (top 20%,
mid 60%, bottom 20%) and compares DBS distributions per bucket.

If the ATR normalization is working:
  - score distribution should be similar across buckets (same IQR, same skew)
  - category mass should be similar across buckets

If the normalization is under-compensating:
  - low-ATR pairs will have wide DBS distributions (small price moves look huge)
  - high-ATR pairs will have narrow distributions (big price moves look small)

If the normalization is over-compensating:
  - opposite pattern

Usage: python3 a1_atr_buckets.py <path-to-jsonl>
"""
import json
import sys
from collections import defaultdict, Counter
from statistics import median

CATEGORY_ORDER = [
    "UP_STRONG", "UP_MODERATE", "UP_WEAK",
    "NEUTRAL",
    "DOWN_WEAK", "DOWN_MODERATE", "DOWN_STRONG"
]

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

    # Bucket by pair median ATR (not sample ATR — the idea is "this pair's
    # typical volatility", and normalization should handle cross-pair comparison)
    by_pair_atr = defaultdict(list)
    for l in clean:
        by_pair_atr[l["symbol"]].append(l["atr"])
    pair_median_atr = {sym: median(vs) for sym, vs in by_pair_atr.items()}

    # Sort pairs by median ATR and bucket
    sorted_pairs = sorted(pair_median_atr.items(), key=lambda kv: kv[1])
    n_pairs = len(sorted_pairs)
    low_cut = int(n_pairs * 0.20)
    high_cut = int(n_pairs * 0.80)
    low_pairs = set(p for p, _ in sorted_pairs[:low_cut])
    mid_pairs = set(p for p, _ in sorted_pairs[low_cut:high_cut])
    high_pairs = set(p for p, _ in sorted_pairs[high_cut:])

    print(f"BUCKET_CUTOFFS:")
    print(f"  low  ({len(low_pairs)} pairs)  : median ATR <= {sorted_pairs[low_cut-1][1]:.6f}")
    print(f"  mid  ({len(mid_pairs)} pairs)  : {sorted_pairs[low_cut-1][1]:.6f} < ATR <= {sorted_pairs[high_cut-1][1]:.6f}")
    print(f"  high ({len(high_pairs)} pairs) : median ATR > {sorted_pairs[high_cut-1][1]:.6f}")
    print()

    # Show sample cutoff pairs
    print("LOW_BUCKET_PAIRS (lowest ATR):", sorted([p for p, _ in sorted_pairs[:low_cut]]))
    print("HIGH_BUCKET_PAIRS (highest ATR):", sorted([p for p, _ in sorted_pairs[high_cut:]]))
    print()

    def summarize_bucket(label, pairs_set):
        scores = [l["dbs"]["score"] for l in clean if l["symbol"] in pairs_set]
        n = len(scores)
        if n == 0:
            print(f"{label}: no samples")
            return
        s_sorted = sorted(scores)
        def pct(p):
            return s_sorted[max(0, min(n - 1, int(p * n)))]
        mean = sum(scores) / n
        iqr = pct(0.75) - pct(0.25)
        print(f"\n{label} (n={n})")
        print(f"  mean={mean:+.4f}  median={pct(0.50):+.4f}  IQR={iqr:.4f}  "
              f"[p05={pct(0.05):+.4f} .. p95={pct(0.95):+.4f}]  "
              f"range=[{s_sorted[0]:+.4f}, {s_sorted[-1]:+.4f}]")
        cats = Counter(l["dbs"]["category"] for l in clean if l["symbol"] in pairs_set)
        for cat in CATEGORY_ORDER:
            c = cats.get(cat, 0)
            pct_ = 100.0 * c / n
            bar = "#" * int(40 * c / n)
            print(f"    {cat:16s} {c:5d} ({pct_:5.2f}%)  {bar}")

    print("=== SCORE DISTRIBUTION BY ATR BUCKET ===")
    summarize_bucket("LOW_ATR bucket", low_pairs)
    summarize_bucket("MID_ATR bucket", mid_pairs)
    summarize_bucket("HIGH_ATR bucket", high_pairs)
    print()

    # Check component magnitudes per bucket
    print("=== COMPONENT MAGNITUDE BY BUCKET (mean absolute value) ===")
    for label, pairs_set in [("LOW_ATR", low_pairs), ("MID_ATR", mid_pairs), ("HIGH_ATR", high_pairs)]:
        rows = [l for l in clean if l["symbol"] in pairs_set]
        if not rows:
            continue
        ms = sum(abs(l["dbs"]["slopeComponent"]) for l in rows) / len(rows)
        mr = sum(abs(l["dbs"]["returnComponent"]) for l in rows) / len(rows)
        me = sum(abs(l["dbs"]["emaComponent"]) for l in rows) / len(rows)
        print(f"  {label}: |slope|={ms:.4f}  |return|={mr:.4f}  |ema|={me:.4f}")
    print()

    # Verdict
    print("=== ATR NORMALIZATION VERDICT ===")
    print("Pass criterion: IQR ratio (LOW_IQR / HIGH_IQR) should be within [0.5, 2.0].")
    print("Bigger than 2.0 means low-ATR pairs have wider distribution — under-normalized.")
    print("Smaller than 0.5 means high-ATR pairs have wider distribution — over-normalized.")
    print("Both are signs ATR normalization isn't doing its job.")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "logs/phase15b_dbs_telemetry/2026-04-15.jsonl")
