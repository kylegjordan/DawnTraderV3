#!/usr/bin/env python3
"""
BATCH 61 — A.0 Baseline — Legacy Classifier Flicker Rate.

Computes the cycle-to-cycle flicker rate of the current (legacy) regime
classifier on the cycle-sampled MCE telemetry window. Needed as the
comparison baseline for A.4 Final's "DBS within 1.5× legacy" flicker test.

Langston methodology adjustments (2026-04-15 Thread 21 consensus):
  1. Matched-symbol-matched-timestamp — for each pair, order samples
     by timestamp and compute flips between consecutive samples WITHIN
     that pair. No cross-pair contamination.
  2. Report both CATEGORY-BOUNDARY flip rate (any regime change) AND
     FAMILY-LEVEL sign flip rate (only cross-family changes). Family
     definitions:
       - Trend: TREND_FRIENDLY_STABLE, IMPULSE_EXPANSION
       - Range: RANGE_BOUND_STABLE
       - Volatility: HIGH_VOLATILITY_UNSTABLE, STRUCTURAL_TRANSITION
  3. Separate stablecoin / ultra-low-vol side bucket. Stablecoins can
     look flaky for stupid reasons (peg oscillation, noise-floor
     behavior) and should not contaminate the main bucket statistics.

Scope §4 A.0 deliverable items:
  1. Legacy classifier 1-cycle flip rate
  2. Legacy classifier 3-cycle flip rate
  3. Distribution of regime assignments (confirm roughly matches B59
     ~54.5% RBS snapshot, flag if >±10pp divergence)
  4. Red-flag check: if legacy 1-cycle flip rate > 5%, note that
     "DBS within 1.5× legacy" is not automatically comforting

Usage: python3 a0_baseline.py <path-to-jsonl>
"""
import json
import sys
from collections import Counter, defaultdict

# Family mapping for family-level flip analysis
REGIME_FAMILY = {
    "TREND_FRIENDLY_STABLE": "trend",
    "IMPULSE_EXPANSION": "trend",
    "RANGE_BOUND_STABLE": "range",
    "HIGH_VOLATILITY_UNSTABLE": "volatility",
    "STRUCTURAL_TRANSITION": "volatility",
}

# Stablecoin / ultra-low-vol side bucket (pairs expected to have near-zero
# real directional movement; noise-floor behavior can inflate flip rates
# for reasons unrelated to classifier quality)
STABLECOIN_PAIRS = {
    "USDG/USD", "USDG/USDC",
    "EUR/CHF", "EUR/GBP",
    "TRX/USD", "TRX/EUR",
    # Fiat FX also behaves stablecoin-like in this analysis
    "USD/CHF", "EUR/USD", "AUD/USD",
}

def compute_flip_rates(samples_by_pair, lag):
    """
    For each pair, order by timestamp and compute:
      - Category-boundary flip rate at `lag` cycles apart
      - Family-level flip rate at `lag` cycles apart
    Returns (category_flips, category_pairs, family_flips, family_pairs)
    where flips is total flip count, pairs is total comparison count.
    """
    cat_flips = 0
    cat_total = 0
    fam_flips = 0
    fam_total = 0
    for sym, rows in samples_by_pair.items():
        rows = sorted(rows, key=lambda r: r["ts"])
        if len(rows) <= lag:
            continue
        for i in range(lag, len(rows)):
            r_now = rows[i]["classifier"]["regime"]
            r_prev = rows[i - lag]["classifier"]["regime"]
            cat_total += 1
            if r_now != r_prev:
                cat_flips += 1
            f_now = REGIME_FAMILY.get(r_now, "unknown")
            f_prev = REGIME_FAMILY.get(r_prev, "unknown")
            fam_total += 1
            if f_now != f_prev:
                fam_flips += 1
    return cat_flips, cat_total, fam_flips, fam_total

def main(path):
    lines = []
    with open(path) as fp:
        for line in fp:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            if obj["dbs"]["sentinelZero"]:
                continue
            lines.append(obj)

    print(f"INPUT_SAMPLES (sentinelZero excluded): {len(lines)}")
    symbols = sorted({l["symbol"] for l in lines})
    print(f"UNIQUE_SYMBOLS: {len(symbols)}")
    print()

    # Partition into main and stablecoin buckets
    main_by_pair = defaultdict(list)
    stable_by_pair = defaultdict(list)
    for l in lines:
        if l["symbol"] in STABLECOIN_PAIRS:
            stable_by_pair[l["symbol"]].append(l)
        else:
            main_by_pair[l["symbol"]].append(l)

    print(f"MAIN_BUCKET_PAIRS: {len(main_by_pair)}")
    print(f"STABLECOIN_SIDE_BUCKET_PAIRS: {len(stable_by_pair)}")
    print(f"stablecoins observed: {sorted(stable_by_pair.keys())}")
    print()

    # Summary helper
    def print_bucket(label, by_pair):
        total_samples = sum(len(v) for v in by_pair.values())
        print(f"=== {label} (n_pairs={len(by_pair)}, n_samples={total_samples}) ===")
        if total_samples == 0:
            print("  (no samples)")
            return
        # 1-cycle
        cf, ct, ff, ft = compute_flip_rates(by_pair, lag=1)
        if ct > 0:
            cpct = 100.0 * cf / ct
            fpct = 100.0 * ff / ft if ft > 0 else 0
            print(f"  1-cycle category-boundary flips: {cf:6d} / {ct:6d} = {cpct:5.2f}%")
            print(f"  1-cycle family-level flips:      {ff:6d} / {ft:6d} = {fpct:5.2f}%")
        # 3-cycle
        cf3, ct3, ff3, ft3 = compute_flip_rates(by_pair, lag=3)
        if ct3 > 0:
            cpct3 = 100.0 * cf3 / ct3
            fpct3 = 100.0 * ff3 / ft3 if ft3 > 0 else 0
            print(f"  3-cycle category-boundary flips: {cf3:6d} / {ct3:6d} = {cpct3:5.2f}%")
            print(f"  3-cycle family-level flips:      {ff3:6d} / {ft3:6d} = {fpct3:5.2f}%")
        # Regime distribution
        regime_dist = Counter(l["classifier"]["regime"] for pair_rows in by_pair.values() for l in pair_rows)
        print(f"  Regime distribution:")
        for regime in ["TREND_FRIENDLY_STABLE", "IMPULSE_EXPANSION",
                       "HIGH_VOLATILITY_UNSTABLE", "STRUCTURAL_TRANSITION",
                       "RANGE_BOUND_STABLE"]:
            c = regime_dist.get(regime, 0)
            pct = 100.0 * c / total_samples
            print(f"    {regime:28s} {c:6d} ({pct:5.2f}%)")
        print()
        return cpct if ct > 0 else 0, fpct if ft > 0 else 0

    main_cat1, main_fam1 = print_bucket("MAIN BUCKET", main_by_pair)
    stable_cat1, stable_fam1 = print_bucket("STABLECOIN / FIAT SIDE BUCKET", stable_by_pair)

    # Red-flag check (main bucket only; stablecoins are pre-excluded from the core analysis)
    print("=== RED-FLAG CHECK (Scope §4 A.0 item 4) ===")
    RED_FLAG_THRESHOLD = 5.0
    if main_cat1 > RED_FLAG_THRESHOLD:
        print(f"  🚩 FLAGGED: main-bucket 1-cycle category-boundary flip rate = {main_cat1:.2f}%")
        print(f"     exceeds the {RED_FLAG_THRESHOLD}% red-flag threshold.")
        print(f"     'DBS within 1.5× legacy' is NOT automatically comforting under this baseline —")
        print(f"     the legacy classifier itself is unstable, so 1.5× of an unstable baseline is")
        print(f"     still unstable. A.4 Final must address whether DBS is stable in ABSOLUTE terms,")
        print(f"     not just relative to a flaky baseline.")
    else:
        print(f"  OK: main-bucket 1-cycle category-boundary flip rate = {main_cat1:.2f}% <= {RED_FLAG_THRESHOLD}%")
        print(f"      Legacy classifier baseline is stable enough that relative comparison in A.4")
        print(f"      Final ('DBS within 1.5× legacy') is a meaningful test.")
    print()

    # Compare to B59 snapshot
    print("=== B59 SNAPSHOT COMPARISON (Scope §4 A.0 item 3) ===")
    full_total = sum(len(v) for v in main_by_pair.values()) + sum(len(v) for v in stable_by_pair.values())
    full_dist = Counter(
        l["classifier"]["regime"]
        for pair_rows in list(main_by_pair.values()) + list(stable_by_pair.values())
        for l in pair_rows
    )
    b59_snapshot = {
        "TREND_FRIENDLY_STABLE": 19.3,
        "IMPULSE_EXPANSION": 2.4,
        "HIGH_VOLATILITY_UNSTABLE": None,  # not reported in B59 notes
        "STRUCTURAL_TRANSITION": None,
        "RANGE_BOUND_STABLE": 54.5,
    }
    print(f"{'regime':30s}  {'B61 cycle-sampled':>18s}  {'B59 snapshot':>14s}  {'delta (pp)':>12s}")
    for regime in ["TREND_FRIENDLY_STABLE", "IMPULSE_EXPANSION",
                   "HIGH_VOLATILITY_UNSTABLE", "STRUCTURAL_TRANSITION",
                   "RANGE_BOUND_STABLE"]:
        c = full_dist.get(regime, 0)
        pct = 100.0 * c / full_total
        b59 = b59_snapshot.get(regime)
        if b59 is not None:
            delta = pct - b59
            marker = " *" if abs(delta) > 10 else ""
            print(f"  {regime:28s}  {pct:16.2f}%  {b59:12.1f}%  {delta:+10.2f}pp{marker}")
        else:
            print(f"  {regime:28s}  {pct:16.2f}%  {'n/a':>14s}  {'':>12s}")
    print("  (* = |delta| > 10pp, window may not be representative)")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "logs/phase15b_dbs_telemetry/2026-04-15.jsonl")
