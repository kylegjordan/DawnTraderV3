#!/usr/bin/env python3
"""
B61 A.3 — Global DBS Methodology Analysis (v2)

Key insight: cycleId is per-pair-call, NOT per-global-cycle.
The MCE cache holds all pair contexts with a 60s TTL.
Global DBS reads from the cache at market-indicators call time.

This script simulates the MCE cache: for each 60s window, the "cache"
contains the most recent sample per symbol within the TTL window.
Global DBS = unweighted median of those cached scores.

Usage: python3 a3_global_dbs_methodology_v2.py <telemetry.jsonl>
"""
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from math import floor

def load_data(path):
    samples = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                # Parse timestamp
                ts_str = obj['ts']
                # Handle both Z and +00:00 formats
                ts_str = ts_str.replace('Z', '+00:00')
                obj['_ts'] = datetime.fromisoformat(ts_str)
                obj['_epoch'] = obj['_ts'].timestamp()
                samples.append(obj)
            except (json.JSONDecodeError, KeyError, ValueError):
                continue
    samples.sort(key=lambda x: x['_epoch'])
    return samples

def weighted_median(entries):
    """Compute weighted median. entries = list of (score, weight)."""
    if not entries:
        return 0.0
    entries_sorted = sorted(entries, key=lambda x: x[0])
    total_weight = sum(w for _, w in entries_sorted)
    half = total_weight / 2.0
    cum = 0.0
    for score, weight in entries_sorted:
        cum += weight
        if cum >= half:
            return score
    return entries_sorted[-1][0]

def classify_dbs(score):
    if score >= 0.60: return 'UP_STRONG'
    if score >= 0.30: return 'UP_MODERATE'
    if score >= 0.10: return 'UP_WEAK'
    if score <= -0.60: return 'DOWN_STRONG'
    if score <= -0.30: return 'DOWN_MODERATE'
    if score <= -0.10: return 'DOWN_WEAK'
    return 'NEUTRAL'

MCE_TTL_SECONDS = 60  # MCE cache TTL
SNAPSHOT_INTERVAL = 60  # Take a snapshot every 60s to simulate market-indicators calls

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 a3_global_dbs_methodology_v2.py <telemetry.jsonl>")
        sys.exit(1)

    samples = load_data(sys.argv[1])
    print(f"Loaded {len(samples)} samples")
    print(f"Time range: {samples[0]['ts']} → {samples[-1]['ts']}")

    # ── Build simulated MCE cache snapshots ──
    # At each snapshot time, the cache contains the most recent sample
    # per symbol where sample.ts is within [snapshot_time - TTL, snapshot_time]
    start_epoch = samples[0]['_epoch']
    end_epoch = samples[-1]['_epoch']
    total_hours = (end_epoch - start_epoch) / 3600
    print(f"Window duration: {total_hours:.1f} hours")

    # Index samples by symbol for efficient lookup
    by_symbol = defaultdict(list)
    for s in samples:
        by_symbol[s['symbol']].append(s)

    all_symbols = sorted(by_symbol.keys())
    print(f"Unique symbols: {len(all_symbols)}")

    # Generate snapshots
    snapshots = []
    t = start_epoch + MCE_TTL_SECONDS  # Start after first TTL window
    while t <= end_epoch:
        cache_state = {}
        for sym, sym_samples in by_symbol.items():
            # Find most recent sample within TTL window
            best = None
            for s in sym_samples:
                if s['_epoch'] <= t and s['_epoch'] > t - MCE_TTL_SECONDS:
                    if best is None or s['_epoch'] > best['_epoch']:
                        best = s
            if best is not None:
                cache_state[sym] = best
        if cache_state:
            snapshots.append({
                'epoch': t,
                'ts': datetime.fromtimestamp(t, tz=timezone.utc).isoformat(),
                'cache': cache_state
            })
        t += SNAPSHOT_INTERVAL

    print(f"Simulated cache snapshots: {len(snapshots)}")

    # ── 1. Pair-universe membership per snapshot ──
    print("\n" + "="*70)
    print("SECTION 1: PAIR-UNIVERSE MEMBERSHIP STABILITY (CACHE-SIMULATED)")
    print("="*70)

    snapshot_sizes = [len(snap['cache']) for snap in snapshots]
    print(f"Pairs in cache per snapshot: min={min(snapshot_sizes)}, max={max(snapshot_sizes)}, "
          f"mean={sum(snapshot_sizes)/len(snapshot_sizes):.1f}, "
          f"median={sorted(snapshot_sizes)[len(snapshot_sizes)//2]}")

    # Distribution of snapshot sizes
    size_dist = defaultdict(int)
    for sz in snapshot_sizes:
        bucket = (sz // 10) * 10
        size_dist[bucket] += 1
    print("Snapshot size distribution:")
    for bucket in sorted(size_dist.keys()):
        print(f"  {bucket}-{bucket+9} pairs: {size_dist[bucket]} snapshots "
              f"({100*size_dist[bucket]/len(snapshots):.1f}%)")

    # Membership changes
    changes = 0
    for i in range(1, len(snapshots)):
        prev_syms = set(snapshots[i-1]['cache'].keys())
        curr_syms = set(snapshots[i]['cache'].keys())
        if prev_syms != curr_syms:
            changes += 1
    print(f"\nSnapshots with membership changes: {changes}/{len(snapshots)-1} "
          f"({100*changes/(len(snapshots)-1):.1f}%)")

    # Per-symbol presence rate
    sym_presence = defaultdict(int)
    for snap in snapshots:
        for sym in snap['cache']:
            sym_presence[sym] += 1
    presence_rates = {sym: 100*count/len(snapshots)
                      for sym, count in sym_presence.items()}
    full = sum(1 for r in presence_rates.values() if r >= 99.0)
    high = sum(1 for r in presence_rates.values() if 80 <= r < 99)
    medium = sum(1 for r in presence_rates.values() if 50 <= r < 80)
    low = sum(1 for r in presence_rates.values() if r < 50)
    print(f"\nSymbol presence rates:")
    print(f"  ≥99%: {full} symbols (always in cache)")
    print(f"  80-99%: {high} symbols")
    print(f"  50-80%: {medium} symbols")
    print(f"  <50%: {low} symbols")

    # Show low-presence symbols
    if low > 0:
        print(f"\n  Low-presence symbols (<50%):")
        for sym, rate in sorted(presence_rates.items(), key=lambda x: x[1]):
            if rate < 50:
                print(f"    {sym}: {rate:.1f}%")

    # ── 2. Global DBS time series (unweighted = production) ──
    print("\n" + "="*70)
    print("SECTION 2: GLOBAL DBS TIME SERIES (UNWEIGHTED MEDIAN = PRODUCTION)")
    print("="*70)

    global_series = []
    for snap in snapshots:
        cache = snap['cache']
        # Exclude sentinel zeros (production code does NOT do this, but A.3 spec requires it)
        valid = {sym: s for sym, s in cache.items()
                 if not s['dbs']['sentinelZero']}
        sentinel_count = len(cache) - len(valid)

        if not valid:
            continue

        scores = [s['dbs']['score'] for s in valid.values()]
        # Production: unweighted median (empty volumes → weight=1 for all)
        uw_score = weighted_median([(sc, 1.0) for sc in scores])

        # ATR-weighted median (proxy for what volume-weighting would do)
        atrs = [(s['dbs']['score'], s.get('atr', 1.0)) for s in valid.values()]
        w_score = weighted_median(atrs)

        global_series.append({
            'ts': snap['ts'],
            'epoch': snap['epoch'],
            'uw_score': uw_score,
            'uw_cat': classify_dbs(uw_score),
            'w_score': w_score,
            'w_cat': classify_dbs(w_score),
            'pair_count': len(valid),
            'sentinel_excluded': sentinel_count
        })

    uw_scores = [g['uw_score'] for g in global_series]
    print(f"Snapshots with valid global DBS: {len(global_series)}")
    print(f"Score range: [{min(uw_scores):.4f}, {max(uw_scores):.4f}]")
    print(f"Mean: {sum(uw_scores)/len(uw_scores):.4f}")
    print(f"Std: {(sum((x - sum(uw_scores)/len(uw_scores))**2 for x in uw_scores)/len(uw_scores))**0.5:.4f}")

    # Category distribution
    cat_counts = defaultdict(int)
    for g in global_series:
        cat_counts[g['uw_cat']] += 1
    print("\nGlobal DBS category distribution (unweighted/production):")
    for cat in ['UP_STRONG','UP_MODERATE','UP_WEAK','NEUTRAL',
                'DOWN_WEAK','DOWN_MODERATE','DOWN_STRONG']:
        c = cat_counts.get(cat, 0)
        print(f"  {cat}: {c} ({100*c/len(global_series):.1f}%)")

    # Flicker rate
    transitions = 0
    for i in range(1, len(global_series)):
        if global_series[i-1]['uw_cat'] != global_series[i]['uw_cat']:
            transitions += 1
    print(f"\nGlobal DBS 1-snapshot category flip rate: {transitions}/{len(global_series)-1} "
          f"= {100*transitions/(len(global_series)-1):.2f}%")

    # Maturity gate condition (a): neutral crossings
    neutral_cross_pos = 0
    neutral_cross_neg = 0
    for i in range(1, len(global_series)):
        prev_s = global_series[i-1]['uw_score']
        curr_s = global_series[i]['uw_score']
        prev_pos = prev_s > 0.10
        curr_pos = curr_s > 0.10
        prev_neg = prev_s < -0.10
        curr_neg = curr_s < -0.10
        if not prev_pos and curr_pos:
            neutral_cross_pos += 1
        if not prev_neg and curr_neg:
            neutral_cross_neg += 1

    print(f"\nNEUTRAL crossings → positive: {neutral_cross_pos}")
    print(f"NEUTRAL crossings → negative: {neutral_cross_neg}")
    if neutral_cross_pos > 0 and neutral_cross_neg > 0:
        print("  ✅ Maturity gate condition (a) SATISFIED")
    else:
        print("  ⏳ Maturity gate condition (a) NOT YET SATISFIED")

    # Time series printout (every ~30 snapshots)
    step = max(1, len(global_series) // 40)
    print(f"\nGlobal DBS time series (every {step} snapshots):")
    print(f"  {'Timestamp':<26s} {'UW Score':>9s} {'UW Cat':<16s} {'W Score':>9s} {'W Cat':<16s} {'Pairs':>5s}")
    for i in range(0, len(global_series), step):
        g = global_series[i]
        print(f"  {g['ts'][:26]:<26s} {g['uw_score']:>+9.4f} {g['uw_cat']:<16s} "
              f"{g['w_score']:>+9.4f} {g['w_cat']:<16s} {g['pair_count']:>5d}")
    g = global_series[-1]
    print(f"  {g['ts'][:26]:<26s} {g['uw_score']:>+9.4f} {g['uw_cat']:<16s} "
          f"{g['w_score']:>+9.4f} {g['w_cat']:<16s} {g['pair_count']:>5d}")

    # ── 3. Weighted vs unweighted comparison ──
    print("\n" + "="*70)
    print("SECTION 3: WEIGHTED vs UNWEIGHTED MEDIAN SENSITIVITY")
    print("="*70)

    deltas = [abs(g['w_score'] - g['uw_score']) for g in global_series]
    cat_changes = sum(1 for g in global_series if g['uw_cat'] != g['w_cat'])
    print(f"Mean |delta| (ATR-weighted vs unweighted): {sum(deltas)/len(deltas):.4f}")
    print(f"Max |delta|: {max(deltas):.4f}")
    print(f"Median |delta|: {sorted(deltas)[len(deltas)//2]:.4f}")
    print(f"P95 |delta|: {sorted(deltas)[int(0.95*len(deltas))]:.4f}")
    print(f"Snapshots where ATR-weighting changes category: {cat_changes}/{len(global_series)} "
          f"({100*cat_changes/len(global_series):.1f}%)")

    # Direction agreement
    same_sign = sum(1 for g in global_series
                    if (g['uw_score'] > 0 and g['w_score'] > 0) or
                       (g['uw_score'] < 0 and g['w_score'] < 0) or
                       (abs(g['uw_score']) < 0.05 and abs(g['w_score']) < 0.05))
    print(f"Direction agreement (same sign or both near zero): {same_sign}/{len(global_series)} "
          f"({100*same_sign/len(global_series):.1f}%)")

    # ── 4. Silent-zero handling ──
    print("\n" + "="*70)
    print("SECTION 4: SILENT-ZERO HANDLING")
    print("="*70)

    total_sentinel = sum(g['sentinel_excluded'] for g in global_series)
    print(f"Total sentinelZero samples excluded from global aggregation: {total_sentinel}")
    print(f"(Production code does NOT exclude sentinel zeros from cache → global DBS)")
    print(f"(This is a code defect: score=0 from the early-return path would be")
    print(f" included in the median as if it were a genuine NEUTRAL reading)")
    if total_sentinel == 0:
        print("However, no sentinel zeros observed in this window, so the defect")
        print("has zero empirical impact during the audit period.")

    # ── 5. 2-sigma moves check ──
    print("\n" + "="*70)
    print("SECTION 5: 2-SIGMA MOVES CHECK (MATURITY GATE CONDITION B)")
    print("="*70)

    symbol_scores = defaultdict(list)
    for s in samples:
        if not s['dbs']['sentinelZero']:
            symbol_scores[s['symbol']].append(s['dbs']['score'])

    two_sigma_symbols = set()
    for sym, sc_list in symbol_scores.items():
        if len(sc_list) < 20:
            continue
        mean_s = sum(sc_list) / len(sc_list)
        var_s = sum((x - mean_s)**2 for x in sc_list) / len(sc_list)
        std_s = var_s ** 0.5
        if std_s < 0.001:
            continue
        for sc in sc_list:
            if abs(sc - mean_s) >= 2 * std_s:
                two_sigma_symbols.add(sym)
                break

    print(f"Symbols with ≥1 observation at 2σ from their own mean: {len(two_sigma_symbols)}")
    if len(two_sigma_symbols) >= 3:
        print("  ✅ Maturity gate condition (b) SATISFIED")
    print(f"  Sample: {sorted(two_sigma_symbols)[:10]}")

    # ── 6. Maturity gate summary ──
    print("\n" + "="*70)
    print("SECTION 6: MATURITY GATE SUMMARY")
    print("="*70)
    cond_a = neutral_cross_pos > 0 and neutral_cross_neg > 0
    cond_b = len(two_sigma_symbols) >= 3
    cond_c = True
    satisfied = sum([cond_a, cond_b, cond_c])
    print(f"(a) Global DBS crossed NEUTRAL both directions: {'✅' if cond_a else '⏳'}")
    print(f"(b) ≥3 symbols with 2σ moves: {'✅' if cond_b else '⏳'}")
    print(f"(c) RBS/TFS ratio divergence ≥±10pp: ✅ (A.0 §6)")
    print(f"Result: {satisfied}/3 → {'✅ GATE OPEN' if satisfied >= 2 else '⏳ PENDING'}")

    # ── 7. Per-pair summary for cross-reference ──
    print("\n" + "="*70)
    print("SECTION 7: PER-PAIR DBS SUMMARY")
    print("="*70)
    print(f"  {'Symbol':<14s} {'n':>5s} {'mean':>8s} {'std':>8s} {'min':>8s} {'max':>8s} {'dom_cat':<16s}")
    for sym in sorted(symbol_scores.keys()):
        sc_list = symbol_scores[sym]
        if not sc_list:
            continue
        n = len(sc_list)
        mean_s = sum(sc_list) / n
        var_s = sum((x - mean_s)**2 for x in sc_list) / n
        std_s = var_s ** 0.5
        dom_cat = classify_dbs(mean_s)
        print(f"  {sym:<14s} {n:>5d} {mean_s:>+8.4f} {std_s:>8.4f} "
              f"{min(sc_list):>+8.4f} {max(sc_list):>+8.4f} {dom_cat:<16s}")

    # ── 8. Global DBS → market direction summary ──
    print("\n" + "="*70)
    print("SECTION 8: GLOBAL DBS MARKET DIRECTION SUMMARY")
    print("="*70)

    # Split window into hourly buckets
    hourly = defaultdict(list)
    for g in global_series:
        hour = int((g['epoch'] - start_epoch) / 3600)
        hourly[hour].append(g)

    print(f"  {'Hour':>4s} {'Mean Score':>10s} {'Category':<16s} {'Snapshots':>9s} {'Mean Pairs':>10s}")
    for hour in sorted(hourly.keys()):
        bucket = hourly[hour]
        mean_sc = sum(g['uw_score'] for g in bucket) / len(bucket)
        mean_pairs = sum(g['pair_count'] for g in bucket) / len(bucket)
        cat = classify_dbs(mean_sc)
        print(f"  {hour:>4d} {mean_sc:>+10.4f} {cat:<16s} {len(bucket):>9d} {mean_pairs:>10.1f}")

    # Overall direction
    first_quarter = global_series[:len(global_series)//4]
    last_quarter = global_series[-len(global_series)//4:]
    mean_first = sum(g['uw_score'] for g in first_quarter) / len(first_quarter)
    mean_last = sum(g['uw_score'] for g in last_quarter) / len(last_quarter)
    print(f"\nFirst-quarter mean: {mean_first:+.4f} ({classify_dbs(mean_first)})")
    print(f"Last-quarter mean:  {mean_last:+.4f} ({classify_dbs(mean_last)})")
    if mean_last > mean_first + 0.05:
        print("  Direction trend: ↑ BULLISH DRIFT over the window")
    elif mean_last < mean_first - 0.05:
        print("  Direction trend: ↓ BEARISH DRIFT over the window")
    else:
        print("  Direction trend: → SIDEWAYS / NO CLEAR DRIFT")

    print("\n" + "="*70)
    print("ANALYSIS COMPLETE")
    print("="*70)

if __name__ == '__main__':
    main()
