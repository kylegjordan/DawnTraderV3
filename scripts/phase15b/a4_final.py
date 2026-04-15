#!/usr/bin/env python3
"""
BATCH 61 — A.4 Final — DBS Flicker Rate Measurement.

Measures the DBS category-boundary flip rate on cycle-sampled MCE telemetry
and compares it to the A.0 Baseline legacy classifier flip rate (1.37%).

Pass criterion: DBS 1-cycle category flip rate on the MAIN bucket
must be <= 2.06% (1.5 x 1.37% A.0 baseline).

Metrics reported:
  1. Category-boundary flip rate (any DBS category change) — 1-cycle and 3-cycle
  2. Family-level flip rate (cross-family: UP_* vs NEUTRAL vs DOWN_*) — 1-cycle and 3-cycle
  3. Cross-category flip rate (category jumps > 1 ordinal step in 3 cycles)
  4. Per-symbol top-N most-flicky pairs
  5. Explicit PASS/FAIL against 2.06% threshold

DBS categories in ordinal order:
  DOWN_STRONG(0), DOWN_MODERATE(1), DOWN_WEAK(2), NEUTRAL(3),
  UP_WEAK(4), UP_MODERATE(5), UP_STRONG(6)

Family grouping:
  DOWN family: DOWN_STRONG, DOWN_MODERATE, DOWN_WEAK
  NEUTRAL family: NEUTRAL
  UP family: UP_WEAK, UP_MODERATE, UP_STRONG

Usage: python3 a4_final.py <path-to-jsonl>
"""
import json
import sys
from collections import Counter, defaultdict

# DBS categories in ordinal order (0 = most bearish, 6 = most bullish)
DBS_CATEGORY_ORDER = [
    "DOWN_STRONG", "DOWN_MODERATE", "DOWN_WEAK",
    "NEUTRAL",
    "UP_WEAK", "UP_MODERATE", "UP_STRONG",
]
DBS_CATEGORY_INDEX = {c: i for i, c in enumerate(DBS_CATEGORY_ORDER)}

# Family mapping for family-level flip analysis
DBS_FAMILY = {}
for c in DBS_CATEGORY_ORDER:
    if c.startswith("DOWN_"):
        DBS_FAMILY[c] = "DOWN"
    elif c.startswith("UP_"):
        DBS_FAMILY[c] = "UP"
    else:
        DBS_FAMILY[c] = "NEUTRAL"

# Stablecoin / fiat side bucket — noise-floor behavior inflates flip rates
# for reasons unrelated to DBS quality. Must not contaminate main bucket.
STABLECOIN_PAIRS = {
    "USDG/USD", "USDG/USDC",
    "EUR/CHF", "EUR/GBP",
    "TRX/USD", "TRX/EUR",
    "USD/CHF", "EUR/USD", "AUD/USD",
}

# A.0 Baseline results
A0_MAIN_1CYCLE_CATEGORY = 1.37  # percent
PASS_THRESHOLD = 2.06           # 1.5 x 1.37%


def compute_flip_rates(samples_by_pair, lag):
    """
    For each pair, order by timestamp and compute:
      - Category-boundary flip rate at `lag` cycles apart
      - Family-level flip rate at `lag` cycles apart
    Returns (cat_flips, cat_total, fam_flips, fam_total, per_pair_cat_rates)
    """
    cat_flips = 0
    cat_total = 0
    fam_flips = 0
    fam_total = 0
    per_pair = {}
    for sym, rows in samples_by_pair.items():
        rows = sorted(rows, key=lambda r: r["ts"])
        if len(rows) <= lag:
            continue
        pair_cat_flips = 0
        pair_total = 0
        for i in range(lag, len(rows)):
            c_now = rows[i]["dbs"]["category"]
            c_prev = rows[i - lag]["dbs"]["category"]
            cat_total += 1
            pair_total += 1
            if c_now != c_prev:
                cat_flips += 1
                pair_cat_flips += 1
            f_now = DBS_FAMILY.get(c_now, "unknown")
            f_prev = DBS_FAMILY.get(c_prev, "unknown")
            fam_total += 1
            if f_now != f_prev:
                fam_flips += 1
        if pair_total > 0:
            per_pair[sym] = (pair_cat_flips, pair_total, 100.0 * pair_cat_flips / pair_total)
    return cat_flips, cat_total, fam_flips, fam_total, per_pair


def compute_cross_category_rate(samples_by_pair, lag, min_jump):
    """
    Cross-category flip rate: among lag-cycle comparisons, how many jump
    by more than `min_jump` ordinal steps?
    """
    cross_flips = 0
    cross_total = 0
    for sym, rows in samples_by_pair.items():
        rows = sorted(rows, key=lambda r: r["ts"])
        if len(rows) <= lag:
            continue
        for i in range(lag, len(rows)):
            c_now = rows[i]["dbs"]["category"]
            c_prev = rows[i - lag]["dbs"]["category"]
            idx_now = DBS_CATEGORY_INDEX.get(c_now)
            idx_prev = DBS_CATEGORY_INDEX.get(c_prev)
            if idx_now is None or idx_prev is None:
                continue
            cross_total += 1
            if abs(idx_now - idx_prev) > min_jump:
                cross_flips += 1
    return cross_flips, cross_total


def pct(n, d):
    return 100.0 * n / d if d > 0 else 0.0


def print_bucket(label, by_pair):
    total_samples = sum(len(v) for v in by_pair.values())
    print(f"{'=' * 70}")
    print(f"  {label}")
    print(f"  (n_pairs={len(by_pair)}, n_samples={total_samples})")
    print(f"{'=' * 70}")
    if total_samples == 0:
        print("  (no samples)")
        print()
        return None

    # --- 1-cycle rates ---
    cf1, ct1, ff1, ft1, pp1 = compute_flip_rates(by_pair, lag=1)
    cat1_pct = pct(cf1, ct1)
    fam1_pct = pct(ff1, ft1)
    print(f"\n  1-CYCLE RATES (consecutive observations):")
    print(f"    Category-boundary flips: {cf1:6d} / {ct1:6d} = {cat1_pct:6.2f}%")
    print(f"    Family-level flips:      {ff1:6d} / {ft1:6d} = {fam1_pct:6.2f}%")

    # --- 3-cycle rates ---
    cf3, ct3, ff3, ft3, pp3 = compute_flip_rates(by_pair, lag=3)
    cat3_pct = pct(cf3, ct3)
    fam3_pct = pct(ff3, ft3)
    print(f"\n  3-CYCLE RATES (3 observations apart):")
    print(f"    Category-boundary flips: {cf3:6d} / {ct3:6d} = {cat3_pct:6.2f}%")
    print(f"    Family-level flips:      {ff3:6d} / {ft3:6d} = {fam3_pct:6.2f}%")

    # --- Cross-category flip rate (3-cycle, jump > 1 ordinal step) ---
    xc3, xt3 = compute_cross_category_rate(by_pair, lag=3, min_jump=1)
    xc3_pct = pct(xc3, xt3)
    print(f"\n  CROSS-CATEGORY FLIP RATE (3-cycle, ordinal jump > 1):")
    print(f"    Cross-category flips:    {xc3:6d} / {xt3:6d} = {xc3_pct:6.2f}%")

    # --- DBS category distribution ---
    cat_dist = Counter(
        l["dbs"]["category"]
        for pair_rows in by_pair.values()
        for l in pair_rows
    )
    print(f"\n  DBS CATEGORY DISTRIBUTION:")
    for cat in DBS_CATEGORY_ORDER:
        c = cat_dist.get(cat, 0)
        p = pct(c, total_samples)
        bar = "#" * int(p / 2)
        print(f"    {cat:16s}  {c:6d}  ({p:5.2f}%)  {bar}")

    # --- Top-10 most-flicky pairs (1-cycle) ---
    if pp1:
        sorted_pairs = sorted(pp1.items(), key=lambda x: -x[1][2])
        top_n = min(10, len(sorted_pairs))
        print(f"\n  TOP-{top_n} MOST FLICKY PAIRS (1-cycle category-boundary):")
        for sym, (flips, total, rate) in sorted_pairs[:top_n]:
            print(f"    {sym:16s}  {flips:4d} / {total:4d} = {rate:6.2f}%")

    print()
    return cat1_pct, fam1_pct, cat3_pct


def main(path):
    print("=" * 70)
    print("  BATCH 61 — A.4 FINAL — DBS FLICKER RATE MEASUREMENT")
    print("=" * 70)
    print(f"\n  Input file: {path}")
    print(f"  A.0 Baseline (legacy classifier 1-cycle main bucket): {A0_MAIN_1CYCLE_CATEGORY:.2f}%")
    print(f"  Pass threshold (1.5x baseline):                       {PASS_THRESHOLD:.2f}%")
    print()

    # Load and filter
    lines = []
    sentinel_count = 0
    total_raw = 0
    with open(path) as fp:
        for line in fp:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            total_raw += 1
            if obj["dbs"]["sentinelZero"]:
                sentinel_count += 1
                continue
            # Verify DBS category is recognized
            cat = obj["dbs"].get("category", "")
            if cat not in DBS_CATEGORY_INDEX:
                continue  # skip unrecognized categories
            lines.append(obj)

    print(f"  Total raw samples:          {total_raw}")
    print(f"  sentinelZero excluded:      {sentinel_count}")
    print(f"  Unrecognized category skip: {total_raw - sentinel_count - len(lines)}")
    print(f"  Clean samples for analysis: {len(lines)}")
    symbols = sorted({l["symbol"] for l in lines})
    print(f"  Unique symbols:             {len(symbols)}")

    # Compute observation window
    all_ts = [l["ts"] for l in lines]
    if all_ts:
        ts_min = min(all_ts)
        ts_max = max(all_ts)
        # Try to parse as ISO string or epoch
        print(f"  Observation window:         {ts_min} to {ts_max}")
    print()

    # Partition into main and stablecoin buckets
    main_by_pair = defaultdict(list)
    stable_by_pair = defaultdict(list)
    for l in lines:
        if l["symbol"] in STABLECOIN_PAIRS:
            stable_by_pair[l["symbol"]].append(l)
        else:
            main_by_pair[l["symbol"]].append(l)

    print(f"  Main bucket pairs:          {len(main_by_pair)}")
    print(f"  Stablecoin/fiat side pairs: {len(stable_by_pair)}")
    if stable_by_pair:
        print(f"  Stablecoins observed:       {sorted(stable_by_pair.keys())}")
    print()

    # Analyze each bucket
    main_result = print_bucket("MAIN BUCKET — DBS FLICKER RATES", main_by_pair)
    stable_result = print_bucket("STABLECOIN / FIAT SIDE BUCKET — DBS FLICKER RATES", stable_by_pair)

    # --- PASS / FAIL VERDICT ---
    print("=" * 70)
    print("  A.4 FINAL VERDICT")
    print("=" * 70)
    if main_result is None:
        print("\n  INCONCLUSIVE — no main-bucket samples available.")
        return

    main_cat1, main_fam1, main_cat3 = main_result

    print(f"\n  A.0 Baseline (legacy classifier, main bucket, 1-cycle):  {A0_MAIN_1CYCLE_CATEGORY:.2f}%")
    print(f"  Pass threshold (1.5x baseline):                          {PASS_THRESHOLD:.2f}%")
    print(f"  A.4 Final (DBS, main bucket, 1-cycle category-boundary): {main_cat1:.2f}%")
    print()

    if main_cat1 <= PASS_THRESHOLD:
        print(f"  >>> PASS <<<  DBS 1-cycle category flip rate {main_cat1:.2f}% <= {PASS_THRESHOLD:.2f}% threshold")
    else:
        print(f"  >>> FAIL <<<  DBS 1-cycle category flip rate {main_cat1:.2f}% > {PASS_THRESHOLD:.2f}% threshold")

    # Additional context
    print()
    print(f"  Additional context:")
    print(f"    DBS 1-cycle family-level flip rate (main):   {main_fam1:.2f}%")
    print(f"    DBS 3-cycle category-boundary rate (main):   {main_cat3:.2f}%")
    if stable_result:
        s_cat1, s_fam1, s_cat3 = stable_result
        print(f"    DBS 1-cycle category-boundary rate (stable): {s_cat1:.2f}%")
        print(f"    DBS 1-cycle family-level flip rate (stable): {s_fam1:.2f}%")

    # Ratio to baseline
    if A0_MAIN_1CYCLE_CATEGORY > 0:
        ratio = main_cat1 / A0_MAIN_1CYCLE_CATEGORY
        print(f"\n  DBS-to-legacy ratio: {ratio:.2f}x  (threshold is 1.50x)")
    print()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 a4_final.py <path-to-jsonl>")
        sys.exit(1)
    main(sys.argv[1])
