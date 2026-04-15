#!/usr/bin/env python3
"""
B61 A.2 Final — DBS Threshold & Category Review (cycle-sampled, authoritative)

Runs on the mature ~22h telemetry window. This is the gating analysis for B62.

Sections:
  1. Full DBS score distribution — percentiles, histogram
  2. Category mass under current fixed thresholds (authoritative)
  3. Fixed vs rolling-percentile threshold comparison
  4. DBS x classifier regime cross-tabulation (authoritative)
  5. Neutral-zone width check
  6. Category distribution per classifier regime (full matrix)

Usage: python3 a2_final.py <telemetry.jsonl>
"""
import json
import sys
import math
from collections import defaultdict, Counter

CATEGORY_ORDER = [
    "UP_STRONG", "UP_MODERATE", "UP_WEAK",
    "NEUTRAL",
    "DOWN_WEAK", "DOWN_MODERATE", "DOWN_STRONG"
]

REGIME_ORDER = [
    "TREND_FRIENDLY_STABLE",
    "IMPULSE_EXPANSION",
    "HIGH_VOLATILITY_UNSTABLE",
    "STRUCTURAL_TRANSITION",
    "RANGE_BOUND_STABLE",
]

STRONG_CATEGORIES = {"UP_STRONG", "UP_MODERATE", "DOWN_MODERATE", "DOWN_STRONG"}
NON_NEUTRAL = {c for c in CATEGORY_ORDER if c != "NEUTRAL"}
TREND_PERMISSIVE_REGIMES = {"TREND_FRIENDLY_STABLE", "IMPULSE_EXPANSION"}

# Fixed thresholds (from directional-bias.ts)
FIXED_THRESHOLDS = {
    "UP_STRONG":    (0.60, float('inf')),
    "UP_MODERATE":  (0.30, 0.60),
    "UP_WEAK":      (0.10, 0.30),
    "NEUTRAL":      (-0.10, 0.10),
    "DOWN_WEAK":    (-0.30, -0.10),
    "DOWN_MODERATE":(-0.60, -0.30),
    "DOWN_STRONG":  (float('-inf'), -0.60),
}


def load_data(path):
    samples = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if not obj['dbs']['sentinelZero']:
                    samples.append(obj)
            except (json.JSONDecodeError, KeyError):
                continue
    return samples


def classify_dbs(score):
    if score >= 0.60: return 'UP_STRONG'
    if score >= 0.30: return 'UP_MODERATE'
    if score >= 0.10: return 'UP_WEAK'
    if score <= -0.60: return 'DOWN_STRONG'
    if score <= -0.30: return 'DOWN_MODERATE'
    if score <= -0.10: return 'DOWN_WEAK'
    return 'NEUTRAL'


def percentile(sorted_vals, p):
    """Linear interpolation percentile."""
    if not sorted_vals:
        return 0
    k = (len(sorted_vals) - 1) * p / 100.0
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    return sorted_vals[int(f)] * (c - k) + sorted_vals[int(c)] * (k - f)


def classify_rolling(score, p5, p25, p50, p75, p95):
    """Classify DBS score using rolling-percentile thresholds."""
    if score >= p95:   return 'UP_STRONG'
    if score >= p75:   return 'UP_MODERATE'
    if score >= p50:   return 'UP_WEAK'
    if score <= (1.0 - p95) if p95 != 0 else -p95:
        pass  # handle below
    # Mirror: bottom 5% = DOWN_STRONG, bottom 25% = DOWN_MODERATE, bottom 50% = DOWN_WEAK
    q5  = percentile.__func__ if False else None  # unused
    # Actually, for rolling percentile: use the actual distribution percentiles
    # p5 = 5th percentile (bottom), p25 = 25th, etc.
    if score <= p5:    return 'DOWN_STRONG'
    if score <= p25:   return 'DOWN_MODERATE'
    if score <= p50:   return 'DOWN_WEAK'
    # Between p50 and p75 on the positive side or p25..p50 on neg side = NEUTRAL
    return 'NEUTRAL'


def print_crosstab(title, crosstab, row_order, col_order, row_label="DBS"):
    print(f"\n=== {title} ===")
    total = sum(crosstab[r][c] for r in crosstab for c in crosstab[r])
    if total == 0:
        print("  (no data)")
        return

    # Header
    print(f"  {row_label:16s}", end="")
    for col in col_order:
        short = col[:14]
        print(f"  {short:>14s}", end="")
    print(f"  {'TOTAL':>8s}  {'%':>7s}")

    # Data rows
    for row in row_order:
        print(f"  {row:16s}", end="")
        rtotal = 0
        for col in col_order:
            v = crosstab[row].get(col, 0)
            rtotal += v
            print(f"  {v:>14d}", end="")
        rpct = 100.0 * rtotal / total if total else 0
        print(f"  {rtotal:>8d}  {rpct:>6.2f}%")

    # Column totals
    print(f"  {'TOTAL':16s}", end="")
    for col in col_order:
        ctotal = sum(crosstab[r].get(col, 0) for r in crosstab)
        print(f"  {ctotal:>14d}", end="")
    print(f"  {total:>8d}  100.00%")

    # Column %
    print(f"  {'col %':16s}", end="")
    for col in col_order:
        ctotal = sum(crosstab[r].get(col, 0) for r in crosstab)
        cpct = 100.0 * ctotal / total if total else 0
        print(f"  {cpct:>13.2f}%", end="")
    print()
    return total


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 a2_final.py <telemetry.jsonl>")
        sys.exit(1)

    samples = load_data(sys.argv[1])
    n = len(samples)
    print(f"B61 A.2 FINAL — DBS Threshold & Category Review")
    print(f"{'='*70}")
    print(f"Loaded {n} clean samples (sentinelZero excluded)")

    scores = [s['dbs']['score'] for s in samples]
    scores_sorted = sorted(scores)

    # Window info
    from datetime import datetime
    ts_list = [s['ts'] for s in samples]
    ts_min = min(ts_list)
    ts_max = max(ts_list)
    t0 = datetime.fromisoformat(ts_min.replace('Z', '+00:00'))
    t1 = datetime.fromisoformat(ts_max.replace('Z', '+00:00'))
    hours = (t1 - t0).total_seconds() / 3600
    print(f"Window: {t0.strftime('%Y-%m-%d %H:%M')} -> {t1.strftime('%Y-%m-%d %H:%M')} UTC ({hours:.1f}h)")

    symbols = set(s['symbol'] for s in samples)
    print(f"Unique symbols: {len(symbols)}")
    print(f"Unique cycles: {len(set(s['cycleId'] for s in samples))}")

    # ==================================================================
    # SECTION 1: FULL DBS SCORE DISTRIBUTION
    # ==================================================================
    print(f"\n{'='*70}")
    print("SECTION 1: FULL DBS SCORE DISTRIBUTION")
    print(f"{'='*70}")

    ptiles = [1, 5, 10, 25, 50, 75, 90, 95, 99]
    print(f"\n  Percentile distribution (n={n}):")
    ptile_vals = {}
    for p in ptiles:
        v = percentile(scores_sorted, p)
        ptile_vals[p] = v
        print(f"    P{p:>2d}:  {v:>+8.4f}")

    mean_score = sum(scores) / n
    std_score = (sum((s - mean_score)**2 for s in scores) / n) ** 0.5
    print(f"\n  Mean:   {mean_score:>+8.4f}")
    print(f"  StdDev: {std_score:>8.4f}")
    print(f"  Min:    {scores_sorted[0]:>+8.4f}")
    print(f"  Max:    {scores_sorted[-1]:>+8.4f}")
    print(f"  IQR:    {ptile_vals[75] - ptile_vals[25]:>8.4f}")

    # Histogram
    bins = [(-1.0, -0.8), (-0.8, -0.6), (-0.6, -0.4), (-0.4, -0.2), (-0.2, 0.0),
            (0.0, 0.2), (0.2, 0.4), (0.4, 0.6), (0.6, 0.8), (0.8, 1.0)]
    print(f"\n  Score histogram:")
    max_count = 0
    hist_data = []
    for lo, hi in bins:
        c = sum(1 for s in scores if lo <= s < hi)
        if hi == 1.0:
            c = sum(1 for s in scores if lo <= s <= hi)
        hist_data.append((lo, hi, c))
        max_count = max(max_count, c)
    for lo, hi, c in hist_data:
        pct = 100.0 * c / n
        bar_w = int(40 * c / max_count) if max_count else 0
        print(f"    [{lo:>+5.1f}, {hi:>+5.1f})  {c:>6d}  ({pct:>5.2f}%)  {'#' * bar_w}")

    # Per-pair summary
    print(f"\n  Per-pair DBS percentile summary (top 10 most extreme):")
    pair_scores = defaultdict(list)
    for s in samples:
        pair_scores[s['symbol']].append(s['dbs']['score'])
    pair_medians = {}
    for sym, vals in pair_scores.items():
        sv = sorted(vals)
        pair_medians[sym] = percentile(sv, 50)
    extreme = sorted(pair_medians.items(), key=lambda x: abs(x[1]), reverse=True)[:10]
    for sym, med in extreme:
        cnt = len(pair_scores[sym])
        mn = min(pair_scores[sym])
        mx = max(pair_scores[sym])
        print(f"    {sym:16s}  median={med:>+7.4f}  min={mn:>+7.4f}  max={mx:>+7.4f}  n={cnt}")

    # ==================================================================
    # SECTION 2: CATEGORY MASS UNDER FIXED THRESHOLDS (AUTHORITATIVE)
    # ==================================================================
    print(f"\n{'='*70}")
    print("SECTION 2: CATEGORY MASS — FIXED THRESHOLDS (AUTHORITATIVE)")
    print(f"{'='*70}")

    cat_counts = Counter()
    for s in samples:
        cat_counts[s['dbs']['category']] += 1

    print(f"\n  {'Category':16s}  {'Count':>8s}  {'%':>7s}  Distribution")
    for cat in CATEGORY_ORDER:
        c = cat_counts.get(cat, 0)
        pct = 100.0 * c / n
        bar = '#' * int(50 * c / n)
        print(f"  {cat:16s}  {c:>8d}  {pct:>6.2f}%  {bar}")

    # Symmetry check
    up_strong = cat_counts.get('UP_STRONG', 0) + cat_counts.get('DOWN_STRONG', 0)
    up_mod = cat_counts.get('UP_MODERATE', 0) + cat_counts.get('DOWN_MODERATE', 0)
    up_weak = cat_counts.get('UP_WEAK', 0) + cat_counts.get('DOWN_WEAK', 0)
    neutral = cat_counts.get('NEUTRAL', 0)
    print(f"\n  Symmetry check:")
    print(f"    STRONG (up+down):   {cat_counts.get('UP_STRONG',0):>6d} + {cat_counts.get('DOWN_STRONG',0):>6d} = {up_strong}")
    print(f"    MODERATE (up+down): {cat_counts.get('UP_MODERATE',0):>6d} + {cat_counts.get('DOWN_MODERATE',0):>6d} = {up_mod}")
    print(f"    WEAK (up+down):     {cat_counts.get('UP_WEAK',0):>6d} + {cat_counts.get('DOWN_WEAK',0):>6d} = {up_weak}")
    print(f"    NEUTRAL:            {neutral}")

    # ==================================================================
    # SECTION 3: FIXED vs ROLLING-PERCENTILE THRESHOLDS
    # ==================================================================
    print(f"\n{'='*70}")
    print("SECTION 3: FIXED vs ROLLING-PERCENTILE THRESHOLDS")
    print(f"{'='*70}")

    # Rolling percentile boundaries
    p5  = percentile(scores_sorted, 5)
    p25 = percentile(scores_sorted, 25)
    p50 = percentile(scores_sorted, 50)
    p75 = percentile(scores_sorted, 75)
    p95 = percentile(scores_sorted, 95)

    print(f"\n  Rolling-percentile boundaries (from actual distribution):")
    print(f"    DOWN_STRONG  : score <= P5  = {p5:>+.4f}   (fixed: <= -0.60)")
    print(f"    DOWN_MODERATE: score <= P25 = {p25:>+.4f}   (fixed: <= -0.30)")
    print(f"    DOWN_WEAK    : score <= P50 = {p50:>+.4f}   (fixed: <= -0.10)")
    print(f"    UP_WEAK      : score >= P50 = {p50:>+.4f}   (fixed: >= +0.10)")
    print(f"    UP_MODERATE  : score >= P75 = {p75:>+.4f}   (fixed: >= +0.30)")
    print(f"    UP_STRONG    : score >= P95 = {p95:>+.4f}   (fixed: >= +0.60)")

    # Classify under rolling scheme
    rolling_counts = Counter()
    for s in scores:
        if s >= p95:       rolling_counts['UP_STRONG'] += 1
        elif s >= p75:     rolling_counts['UP_MODERATE'] += 1
        elif s >= p50:     rolling_counts['UP_WEAK'] += 1
        elif s <= p5:      rolling_counts['DOWN_STRONG'] += 1
        elif s <= p25:     rolling_counts['DOWN_MODERATE'] += 1
        elif s < p50:      rolling_counts['DOWN_WEAK'] += 1
        else:              rolling_counts['NEUTRAL'] += 1

    print(f"\n  {'Category':16s}  {'Fixed %':>9s}  {'Rolling %':>11s}  {'Delta':>8s}")
    for cat in CATEGORY_ORDER:
        f_pct = 100.0 * cat_counts.get(cat, 0) / n
        r_pct = 100.0 * rolling_counts.get(cat, 0) / n
        delta = r_pct - f_pct
        marker = " **" if abs(delta) > 5 else ""
        print(f"  {cat:16s}  {f_pct:>8.2f}%  {r_pct:>10.2f}%  {delta:>+7.2f}%{marker}")

    print(f"\n  (** = |delta| > 5pp)")
    print(f"\n  Interpretation: if rolling and fixed are close, the fixed thresholds")
    print(f"  already approximate the natural distribution well. Large deltas indicate")
    print(f"  the fixed thresholds are misaligned with actual score distribution.")

    # Concentration analysis
    neutral_fixed = 100.0 * cat_counts.get('NEUTRAL', 0) / n
    print(f"\n  NEUTRAL concentration: fixed={neutral_fixed:.2f}%, rolling=by-design ~0% (median split)")
    print(f"  If NEUTRAL fixed >> 50%, thresholds are too wide (most pairs classified as undecided).")
    print(f"  If NEUTRAL fixed << 10%, thresholds are too tight (noise classified as signal).")

    # ==================================================================
    # SECTION 4: DBS x REGIME CROSS-TABULATION (AUTHORITATIVE)
    # ==================================================================
    print(f"\n{'='*70}")
    print("SECTION 4: DBS x REGIME CROSS-TABULATION (AUTHORITATIVE)")
    print(f"{'='*70}")

    ct = defaultdict(lambda: defaultdict(int))
    for s in samples:
        cat = s['dbs']['category']
        reg = s['classifier']['regime']
        ct[cat][reg] += 1

    print_crosstab("DBS category x Classifier regime (FINAL, n=%d)" % n,
                   ct, CATEGORY_ORDER, REGIME_ORDER)

    # --- Key metrics ---
    print(f"\n  --- KEY CROSS-TAB METRICS (FINAL) ---")

    # Drift contamination
    rbs_all = sum(ct[c].get("RANGE_BOUND_STABLE", 0) for c in CATEGORY_ORDER)
    rbs_non_neutral = sum(ct[c].get("RANGE_BOUND_STABLE", 0) for c in NON_NEUTRAL)
    if rbs_all > 0:
        drift_pct = 100.0 * rbs_non_neutral / rbs_all
        print(f"\n  DRIFT CONTAMINATION:")
        print(f"    Non-NEUTRAL DBS in RBS: {rbs_non_neutral}/{rbs_all} = {drift_pct:.2f}%")
        print(f"    Provisional (12h):  72.59%")
        print(f"    Final (mature):     {drift_pct:.2f}%")
        print(f"    Delta:              {drift_pct - 72.59:>+.2f}pp")

    # Strategy lockout
    strong_all = sum(sum(ct[c].values()) for c in STRONG_CATEGORIES)
    strong_rbs = sum(ct[c].get("RANGE_BOUND_STABLE", 0) for c in STRONG_CATEGORIES)
    strong_trend = sum(ct[c].get(r, 0) for c in STRONG_CATEGORIES for r in TREND_PERMISSIVE_REGIMES)
    if strong_all > 0:
        lockout_pct = 100.0 * strong_rbs / strong_all
        trend_pct = 100.0 * strong_trend / strong_all
        print(f"\n  STRATEGY LOCKOUT:")
        print(f"    Strong-DBS pair-cycles: {strong_all}")
        print(f"    Locked in RBS:          {strong_rbs} ({lockout_pct:.2f}%)")
        print(f"    In trend-permissive:    {strong_trend} ({trend_pct:.2f}%)")
        print(f"    Provisional lockout:    54.48%")
        print(f"    Final lockout:          {lockout_pct:.2f}%")
        print(f"    Delta:                  {lockout_pct - 54.48:>+.2f}pp")

    # Regime distribution
    print(f"\n  REGIME DISTRIBUTION:")
    regime_totals = Counter()
    for c in CATEGORY_ORDER:
        for r in REGIME_ORDER:
            regime_totals[r] += ct[c].get(r, 0)
    for r in REGIME_ORDER:
        rc = regime_totals[r]
        rpct = 100.0 * rc / n
        bar = '#' * int(40 * rc / n)
        print(f"    {r:28s}  {rc:>7d}  ({rpct:>5.2f}%)  {bar}")

    # ==================================================================
    # SECTION 5: NEUTRAL-ZONE WIDTH CHECK
    # ==================================================================
    print(f"\n{'='*70}")
    print("SECTION 5: NEUTRAL-ZONE WIDTH CHECK")
    print(f"{'='*70}")

    # Of RBS-labeled pair-cycles, what fraction have DBS outside +/-0.10?
    rbs_samples = [s for s in samples if s['classifier']['regime'] == 'RANGE_BOUND_STABLE']
    rbs_outside_neutral = [s for s in rbs_samples if abs(s['dbs']['score']) > 0.10]
    if rbs_samples:
        outside_pct = 100.0 * len(rbs_outside_neutral) / len(rbs_samples)
        print(f"\n  RBS pair-cycles with |DBS| > 0.10 (outside NEUTRAL zone):")
        print(f"    {len(rbs_outside_neutral)}/{len(rbs_samples)} = {outside_pct:.2f}%")
        print(f"    (This is the drift-contamination rate by the +/-0.10 definition)")

    # Score distribution within RBS
    rbs_scores = sorted([s['dbs']['score'] for s in rbs_samples])
    if rbs_scores:
        print(f"\n  DBS score distribution within RBS (n={len(rbs_scores)}):")
        for p in [5, 10, 25, 50, 75, 90, 95]:
            v = percentile(rbs_scores, p)
            print(f"    P{p:>2d}:  {v:>+8.4f}")
        rbs_mean = sum(rbs_scores) / len(rbs_scores)
        rbs_std = (sum((s - rbs_mean)**2 for s in rbs_scores) / len(rbs_scores)) ** 0.5
        print(f"    Mean:  {rbs_mean:>+8.4f}")
        print(f"    Std:   {rbs_std:>8.4f}")

    # Wider neutral zones
    print(f"\n  Neutral zone width sensitivity:")
    for width in [0.05, 0.10, 0.15, 0.20, 0.25, 0.30]:
        inside = sum(1 for s in scores if abs(s) <= width)
        pct = 100.0 * inside / n
        rbs_inside = sum(1 for s in rbs_scores if abs(s) <= width) if rbs_scores else 0
        rbs_pct = 100.0 * rbs_inside / len(rbs_scores) if rbs_scores else 0
        print(f"    +/-{width:.2f}:  universe={pct:>5.1f}% NEUTRAL   RBS={rbs_pct:>5.1f}% NEUTRAL")

    # ==================================================================
    # SECTION 6: CATEGORY DISTRIBUTION PER CLASSIFIER REGIME
    # ==================================================================
    print(f"\n{'='*70}")
    print("SECTION 6: CATEGORY DISTRIBUTION PER CLASSIFIER REGIME")
    print(f"{'='*70}")

    for regime in REGIME_ORDER:
        r_total = regime_totals[regime]
        if r_total == 0:
            print(f"\n  --- {regime} (n=0) ---")
            continue
        print(f"\n  --- {regime} (n={r_total}, {100.0*r_total/n:.2f}% of universe) ---")
        print(f"    {'Category':16s}  {'Count':>8s}  {'% of regime':>11s}  Distribution")
        for cat in CATEGORY_ORDER:
            c = ct[cat].get(regime, 0)
            cpct = 100.0 * c / r_total
            bar = '#' * int(40 * c / r_total) if r_total else ''
            print(f"    {cat:16s}  {c:>8d}  {cpct:>10.2f}%  {bar}")
        # Non-neutral %
        non_neut = sum(ct[c].get(regime, 0) for c in NON_NEUTRAL)
        nn_pct = 100.0 * non_neut / r_total
        strong = sum(ct[c].get(regime, 0) for c in STRONG_CATEGORIES)
        st_pct = 100.0 * strong / r_total
        print(f"    Non-NEUTRAL: {nn_pct:.1f}%  |  Strong-DBS: {st_pct:.1f}%")

    # ==================================================================
    # SUMMARY
    # ==================================================================
    print(f"\n{'='*70}")
    print("SUMMARY — A.2 FINAL VERDICT")
    print(f"{'='*70}")
    print(f"\n  Window: {hours:.1f}h, {n} samples, {len(symbols)} pairs")
    if rbs_all > 0:
        print(f"  Drift contamination (FINAL):  {drift_pct:.2f}%  (provisional: 72.59%)")
    if strong_all > 0:
        print(f"  Strategy lockout (FINAL):     {lockout_pct:.2f}%  (provisional: 54.48%)")
    print(f"  NEUTRAL mass (fixed):         {100.0 * cat_counts.get('NEUTRAL',0)/n:.2f}%")
    print(f"  Regime concentration (RBS):   {100.0*regime_totals.get('RANGE_BOUND_STABLE',0)/n:.2f}%")
    print(f"  IE share:                     {100.0*regime_totals.get('IMPULSE_EXPANSION',0)/n:.2f}%")


if __name__ == "__main__":
    main()
