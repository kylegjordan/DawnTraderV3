#!/usr/bin/env python3
"""
B62 Phase 0 — TFS threshold sweep on Design B.
Tests |DBS| >= 0.30, 0.25, 0.20 for TFS gate.
Reports: TFS+IE share, ST share, RBS drift, family flicker, HVU share.
"""
import json, sys
from collections import defaultdict

def load_data(paths):
    samples = []
    for path in paths:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    if not obj['dbs']['sentinelZero']:
                        samples.append(obj)
                except: continue
    return samples

def design_b(vol, mom, dx, dbs_score, tfs_threshold=0.30):
    abs_dbs = abs(dbs_score)
    if vol < 0.012 and dx < 45 and abs_dbs < 0.10:
        return 'RANGE_BOUND_STABLE'
    if (vol > 0.020 and dx > 55) or (vol > 0.015 and abs_dbs >= 0.50):
        return 'IMPULSE_EXPANSION'
    if (mom > 0.003 and dx > 50) or abs_dbs >= tfs_threshold:
        return 'TREND_FRIENDLY_STABLE'
    if (vol > 0.015 and mom < -0.003) or (dx > 60 and mom < -0.005):
        return 'HIGH_VOLATILITY_UNSTABLE'
    return 'STRUCTURAL_TRANSITION'

def regime_family(r):
    if r in ('TREND_FRIENDLY_STABLE', 'IMPULSE_EXPANSION'): return 'TREND'
    if r == 'RANGE_BOUND_STABLE': return 'RANGE'
    return 'VOLATILITY'

def main():
    samples = load_data(sys.argv[1:])
    print(f"Samples: {len(samples)}, Symbols: {len(set(s['symbol'] for s in samples))}")

    by_symbol = defaultdict(list)
    for s in samples:
        by_symbol[s['symbol']].append(s)

    thresholds = [0.30, 0.25, 0.20, 0.15]
    regimes = ['TREND_FRIENDLY_STABLE', 'IMPULSE_EXPANSION', 'HIGH_VOLATILITY_UNSTABLE',
               'STRUCTURAL_TRANSITION', 'RANGE_BOUND_STABLE']

    print(f"\n{'Metric':<40s}", end="")
    for t in thresholds:
        print(f" |DBS|>={t:.2f}", end="")
    print()
    print("-" * (40 + 12 * len(thresholds)))

    # Regime distribution
    for r in regimes:
        print(f"  {r:<38s}", end="")
        for t in thresholds:
            count = sum(1 for s in samples if design_b(
                s['classifier']['vol'], s['classifier']['mom'],
                s['classifier']['adx'], s['dbs']['score'], t) == r)
            print(f" {100*count/len(samples):>10.1f}%", end="")
        print()

    # TFS+IE combined
    print(f"\n  {'TFS + IE combined':<38s}", end="")
    for t in thresholds:
        tfs = sum(1 for s in samples if design_b(
            s['classifier']['vol'], s['classifier']['mom'],
            s['classifier']['adx'], s['dbs']['score'], t) == 'TREND_FRIENDLY_STABLE')
        ie = sum(1 for s in samples if design_b(
            s['classifier']['vol'], s['classifier']['mom'],
            s['classifier']['adx'], s['dbs']['score'], t) == 'IMPULSE_EXPANSION')
        print(f" {100*(tfs+ie)/len(samples):>10.1f}%", end="")
    print()

    # RBS drift contamination
    print(f"  {'RBS drift contamination':<38s}", end="")
    for t in thresholds:
        rbs_total = 0
        rbs_drift = 0
        for s in samples:
            if design_b(s['classifier']['vol'], s['classifier']['mom'],
                        s['classifier']['adx'], s['dbs']['score'], t) == 'RANGE_BOUND_STABLE':
                rbs_total += 1
                if abs(s['dbs']['score']) >= 0.10:
                    rbs_drift += 1
        pct = 100 * rbs_drift / rbs_total if rbs_total > 0 else 0
        print(f" {pct:>10.1f}%", end="")
    print()

    # Family-level flicker
    print(f"  {'Family-level flicker':<38s}", end="")
    for t in thresholds:
        flips = 0
        comparisons = 0
        for sym, sym_samples in by_symbol.items():
            if len(sym_samples) < 2: continue
            for i in range(1, len(sym_samples)):
                r_prev = design_b(sym_samples[i-1]['classifier']['vol'],
                    sym_samples[i-1]['classifier']['mom'],
                    sym_samples[i-1]['classifier']['adx'],
                    sym_samples[i-1]['dbs']['score'], t)
                r_curr = design_b(sym_samples[i]['classifier']['vol'],
                    sym_samples[i]['classifier']['mom'],
                    sym_samples[i]['classifier']['adx'],
                    sym_samples[i]['dbs']['score'], t)
                comparisons += 1
                if regime_family(r_prev) != regime_family(r_curr):
                    flips += 1
        rate = 100 * flips / comparisons if comparisons > 0 else 0
        print(f" {rate:>10.2f}%", end="")
    print()

    # Strong-DBS routing
    print(f"  {'Strong-DBS → trend-permissive':<38s}", end="")
    for t in thresholds:
        strong = 0
        in_trend = 0
        for s in samples:
            if abs(s['dbs']['score']) >= 0.30:
                strong += 1
                r = design_b(s['classifier']['vol'], s['classifier']['mom'],
                    s['classifier']['adx'], s['dbs']['score'], t)
                if r in ('TREND_FRIENDLY_STABLE', 'IMPULSE_EXPANSION'):
                    in_trend += 1
        pct = 100 * in_trend / strong if strong > 0 else 0
        print(f" {pct:>10.1f}%", end="")
    print()

    # Category-level flicker (for comparison with family-level)
    print(f"  {'Category-level flicker':<38s}", end="")
    for t in thresholds:
        flips = 0
        comparisons = 0
        for sym, sym_samples in by_symbol.items():
            if len(sym_samples) < 2: continue
            for i in range(1, len(sym_samples)):
                r_prev = design_b(sym_samples[i-1]['classifier']['vol'],
                    sym_samples[i-1]['classifier']['mom'],
                    sym_samples[i-1]['classifier']['adx'],
                    sym_samples[i-1]['dbs']['score'], t)
                r_curr = design_b(sym_samples[i]['classifier']['vol'],
                    sym_samples[i]['classifier']['mom'],
                    sym_samples[i]['classifier']['adx'],
                    sym_samples[i]['dbs']['score'], t)
                comparisons += 1
                if r_prev != r_curr:
                    flips += 1
        rate = 100 * flips / comparisons if comparisons > 0 else 0
        print(f" {rate:>10.2f}%", end="")
    print()

if __name__ == '__main__':
    main()
