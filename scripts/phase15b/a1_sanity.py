#!/usr/bin/env python3
"""
BATCH 61 — A.1 Provisional — Step 0: Sanity checks on cycle-sampled MCE DBS telemetry.

Verifies before any real analysis:
  1. Score vs sum(components) reconstruction (is the stored score equal to
     the sum of the three component values? If not, something is wrong.)
  2. Sentinel-zero count and separation.
  3. Per-pair sample count distribution (do we have enough per-pair data?)
  4. Category distribution across the clean (non-sentinel) universe.

Usage: python3 a1_sanity.py <path-to-jsonl>
"""
import json
import sys
from collections import Counter

def main(path):
    lines = []
    with open(path) as fp:
        for line in fp:
            line = line.strip()
            if line:
                lines.append(json.loads(line))

    total = len(lines)
    symbols = {l["symbol"] for l in lines}
    sz = sum(1 for l in lines if l["dbs"]["sentinelZero"])
    clean = [l for l in lines if not l["dbs"]["sentinelZero"]]

    print(f"TOTAL_SAMPLES: {total}")
    print(f"UNIQUE_SYMBOLS: {len(symbols)}")
    print(f"SENTINEL_ZERO_COUNT: {sz}/{total} ({100.0 * sz / total:.2f}%)")
    print(f"CLEAN_SAMPLES (sentinelZero=false): {len(clean)}")
    print()

    print("=== SCORE vs SUM(COMPONENTS) RECONSTRUCTION CHECK ===")
    mismatches = 0
    max_delta = 0.0
    for l in clean:
        dbs = l["dbs"]
        s = dbs["score"]
        sum_c = dbs["slopeComponent"] + dbs["returnComponent"] + dbs["emaComponent"]
        delta = abs(s - sum_c)
        if delta > max_delta:
            max_delta = delta
        if delta > 1e-9:
            mismatches += 1
    print(f"Max delta (score vs sum-of-components): {max_delta:.2e}")
    print(f"Mismatched samples (delta > 1e-9):        {mismatches}/{len(clean)}")
    print(f"(If the formula is `score = slope + return + ema`, delta should be 0.")
    print(f" Non-zero delta means the formula stores the score differently — worth investigating.)")
    print()

    print("=== PER-PAIR SAMPLE COUNT DISTRIBUTION (clean) ===")
    per_pair = Counter(l["symbol"] for l in clean)
    counts = sorted(per_pair.values())
    n = len(counts)
    p25 = counts[n // 4] if n else 0
    p50 = counts[n // 2] if n else 0
    p75 = counts[3 * n // 4] if n else 0
    print(f"pairs_with_samples={n}  min={counts[0] if counts else 0}  "
          f"p25={p25}  median={p50}  p75={p75}  max={counts[-1] if counts else 0}")
    print()

    print("=== CATEGORY DISTRIBUTION (clean, full universe) ===")
    cat_dist = Counter(l["dbs"]["category"] for l in clean)
    order = ["UP_STRONG", "UP_MODERATE", "UP_WEAK", "NEUTRAL",
             "DOWN_WEAK", "DOWN_MODERATE", "DOWN_STRONG"]
    denom = len(clean) if clean else 1
    for cat in order:
        c = cat_dist.get(cat, 0)
        pct = 100.0 * c / denom
        bar = "#" * int(50 * c / denom)
        print(f"  {cat:16s} {c:6d}  ({pct:5.2f}%)  {bar}")
    print()

    # Quick score statistics
    scores = [l["dbs"]["score"] for l in clean]
    if scores:
        s_sorted = sorted(scores)
        m = len(s_sorted)
        def pct(p):
            return s_sorted[max(0, min(m - 1, int(p * m)))]
        mean = sum(scores) / m
        print("=== SCORE SUMMARY (clean) ===")
        print(f"  n={m}  mean={mean:+.4f}")
        print(f"  min={s_sorted[0]:+.4f}  p01={pct(0.01):+.4f}  p05={pct(0.05):+.4f}")
        print(f"  p25={pct(0.25):+.4f}  p50={pct(0.50):+.4f}  p75={pct(0.75):+.4f}")
        print(f"  p95={pct(0.95):+.4f}  p99={pct(0.99):+.4f}  max={s_sorted[-1]:+.4f}")
    print()

    # Classifier regime distribution from the same samples (for A.2 cross-ref later)
    print("=== CLASSIFIER REGIME DISTRIBUTION (full-universe, cycle-sampled) ===")
    regime_dist = Counter(l["classifier"]["regime"] for l in clean)
    for regime in sorted(regime_dist.keys()):
        c = regime_dist[regime]
        pct = 100.0 * c / denom
        bar = "#" * int(50 * c / denom)
        print(f"  {regime:26s} {c:6d}  ({pct:5.2f}%)  {bar}")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "logs/phase15b_dbs_telemetry/2026-04-15.jsonl")
