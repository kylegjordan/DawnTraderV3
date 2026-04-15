#!/usr/bin/env python3
"""
B61 A.3 — Global DBS Methodology Analysis

Analyzes the global DBS aggregation from per-pair cycle-sampled telemetry.
Key questions:
  1. Weighted-median-by-volume review (production uses empty volumes = unweighted median)
  2. Pair-universe stability and membership drift
  3. Silent-zero handling in global aggregation
  4. Global DBS time series for external cross-reference

Usage: scp to staging, run with python3 against the telemetry file.
  python3 a3_global_dbs_methodology.py /path/to/2026-04-15.jsonl
"""
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone

def load_data(path):
    samples = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                samples.append(obj)
            except json.JSONDecodeError:
                continue
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

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 a3_global_dbs_methodology.py <telemetry.jsonl>")
        sys.exit(1)

    samples = load_data(sys.argv[1])
    print(f"Loaded {len(samples)} samples")

    # ── Group samples by cycleId ──
    cycles = defaultdict(list)
    for s in samples:
        cid = s['cycleId']
        cycles[cid].append(s)

    cycle_ids = sorted(cycles.keys())
    print(f"Unique cycles: {len(cycle_ids)}")
    print(f"Time range: {samples[0]['ts']} → {samples[-1]['ts']}")

    # ── 1. Pair-universe membership analysis ──
    print("\n" + "="*70)
    print("SECTION 1: PAIR-UNIVERSE MEMBERSHIP STABILITY")
    print("="*70)

    all_symbols = set()
    cycle_symbols = {}
    for cid in cycle_ids:
        syms = set(s['symbol'] for s in cycles[cid])
        cycle_symbols[cid] = syms
        all_symbols.update(syms)

    print(f"Total unique symbols across all cycles: {len(all_symbols)}")

    # Membership stats per cycle
    sizes = [len(cycle_symbols[cid]) for cid in cycle_ids]
    print(f"Pairs per cycle: min={min(sizes)}, max={max(sizes)}, "
          f"mean={sum(sizes)/len(sizes):.1f}, median={sorted(sizes)[len(sizes)//2]}")

    # Membership changes between consecutive cycles
    changes = []
    for i in range(1, len(cycle_ids)):
        prev = cycle_symbols[cycle_ids[i-1]]
        curr = cycle_symbols[cycle_ids[i]]
        added = curr - prev
        removed = prev - curr
        if added or removed:
            changes.append({
                'from_cycle': cycle_ids[i-1],
                'to_cycle': cycle_ids[i],
                'added': added,
                'removed': removed
            })

    print(f"Cycles with membership changes: {len(changes)} / {len(cycle_ids)-1} "
          f"({100*len(changes)/(len(cycle_ids)-1) if len(cycle_ids)>1 else 0:.1f}%)")

    if changes:
        total_adds = sum(len(c['added']) for c in changes)
        total_removes = sum(len(c['removed']) for c in changes)
        print(f"Total additions: {total_adds}, total removals: {total_removes}")
        # Show first 5 changes
        for c in changes[:5]:
            print(f"  Cycle {c['from_cycle']}→{c['to_cycle']}: "
                  f"+{c['added'] if c['added'] else '{}'} "
                  f"-{c['removed'] if c['removed'] else '{}'}")
        if len(changes) > 5:
            print(f"  ... and {len(changes)-5} more changes")

    # Per-symbol participation rate
    symbol_cycles = defaultdict(int)
    for cid in cycle_ids:
        for sym in cycle_symbols[cid]:
            symbol_cycles[sym] += 1

    participation = {sym: count/len(cycle_ids)*100 for sym, count in symbol_cycles.items()}
    full_participation = sum(1 for p in participation.values() if p >= 99.9)
    partial = {sym: p for sym, p in participation.items() if p < 99.9}
    print(f"\nFull participation (>99.9%): {full_participation} symbols")
    if partial:
        print(f"Partial participation ({len(partial)} symbols):")
        for sym, p in sorted(partial.items(), key=lambda x: x[1]):
            print(f"  {sym}: {p:.1f}% ({symbol_cycles[sym]}/{len(cycle_ids)} cycles)")

    # ── 2. Global DBS computation: unweighted median (production reality) ──
    print("\n" + "="*70)
    print("SECTION 2: GLOBAL DBS TIME SERIES (UNWEIGHTED MEDIAN = PRODUCTION)")
    print("="*70)

    global_dbs_series = []  # (timestamp, score, category, pair_count)
    for cid in cycle_ids:
        cycle_data = cycles[cid]
        # Exclude sentinelZero
        valid = [s for s in cycle_data if not s['dbs']['sentinelZero']]
        sentinel_zero_count = len(cycle_data) - len(valid)

        scores = [(s['dbs']['score'], 1.0) for s in valid]  # weight=1 = unweighted
        global_score = weighted_median(scores)
        global_cat = classify_dbs(global_score)
        ts = cycle_data[0]['ts']
        global_dbs_series.append({
            'ts': ts,
            'cycle': cid,
            'score': global_score,
            'category': global_cat,
            'pair_count': len(valid),
            'sentinel_zero_excluded': sentinel_zero_count
        })

    # Print summary stats
    scores_list = [g['score'] for g in global_dbs_series]
    print(f"Global DBS cycles: {len(global_dbs_series)}")
    print(f"Score range: [{min(scores_list):.4f}, {max(scores_list):.4f}]")
    print(f"Mean: {sum(scores_list)/len(scores_list):.4f}")
    print(f"Categories observed:")
    cat_counts = defaultdict(int)
    for g in global_dbs_series:
        cat_counts[g['category']] += 1
    for cat in ['UP_STRONG','UP_MODERATE','UP_WEAK','NEUTRAL',
                'DOWN_WEAK','DOWN_MODERATE','DOWN_STRONG']:
        if cat in cat_counts:
            print(f"  {cat}: {cat_counts[cat]} ({100*cat_counts[cat]/len(global_dbs_series):.1f}%)")

    # Category transitions (global DBS flicker)
    transitions = 0
    neutral_crossings_pos = 0
    neutral_crossings_neg = 0
    for i in range(1, len(global_dbs_series)):
        prev = global_dbs_series[i-1]
        curr = global_dbs_series[i]
        if prev['category'] != curr['category']:
            transitions += 1
        # Neutral crossing check (maturity gate condition a)
        prev_positive = prev['score'] > 0.10
        curr_positive = curr['score'] > 0.10
        prev_negative = prev['score'] < -0.10
        curr_negative = curr['score'] < -0.10
        if not prev_positive and curr_positive:
            neutral_crossings_pos += 1
        if not prev_negative and curr_negative:
            neutral_crossings_neg += 1

    print(f"\nGlobal DBS 1-cycle category flip rate: {transitions}/{len(global_dbs_series)-1} "
          f"= {100*transitions/(len(global_dbs_series)-1):.2f}%")
    print(f"NEUTRAL crossings → positive: {neutral_crossings_pos}")
    print(f"NEUTRAL crossings → negative: {neutral_crossings_neg}")
    if neutral_crossings_pos > 0 and neutral_crossings_neg > 0:
        print("  ✅ Maturity gate condition (a) SATISFIED: global DBS crossed NEUTRAL both directions")
    else:
        print("  ⏳ Maturity gate condition (a) NOT YET SATISFIED")

    # Print time series (sampled every ~30 cycles for readability)
    step = max(1, len(global_dbs_series) // 30)
    print(f"\nGlobal DBS time series (every {step} cycles):")
    print(f"  {'Timestamp':<26s} {'Score':>8s} {'Category':<16s} {'Pairs':>5s}")
    for i in range(0, len(global_dbs_series), step):
        g = global_dbs_series[i]
        print(f"  {g['ts']:<26s} {g['score']:>+8.4f} {g['category']:<16s} {g['pair_count']:>5d}")
    # Always print last
    g = global_dbs_series[-1]
    print(f"  {g['ts']:<26s} {g['score']:>+8.4f} {g['category']:<16s} {g['pair_count']:>5d}")

    # ── 3. Silent-zero handling ──
    print("\n" + "="*70)
    print("SECTION 3: SILENT-ZERO HANDLING IN GLOBAL AGGREGATION")
    print("="*70)

    total_sentinel = sum(g['sentinel_zero_excluded'] for g in global_dbs_series)
    print(f"Total sentinelZero samples across all cycles: {total_sentinel}")
    if total_sentinel == 0:
        print("No sentinel zeros observed — global aggregation was never affected.")
        print("However, the production code does NOT exclude sentinel zeros:")
        print("  computeGlobalBias() reads entry.context.directionalBias.score")
        print("  from the MCE cache. If a pair returned score=0 via the early-return")
        print("  path, that 0 is included in the median. The sentinel flag is not")
        print("  checked at the global aggregation level.")
    else:
        # Show which cycles had sentinel zeros
        affected = [g for g in global_dbs_series if g['sentinel_zero_excluded'] > 0]
        print(f"Cycles with sentinel-zero exclusions: {len(affected)}")
        for g in affected[:10]:
            print(f"  Cycle {g['cycle']}: {g['sentinel_zero_excluded']} excluded, "
                  f"{g['pair_count']} remaining")

    # ── 4. Weighted vs unweighted comparison (using ATR as volume proxy) ──
    # MCE telemetry doesn't carry 24h volume, but ATR is available as a rough
    # volatility-based proxy to show how weighting would affect the result
    print("\n" + "="*70)
    print("SECTION 4: WEIGHTED vs UNWEIGHTED MEDIAN SENSITIVITY")
    print("="*70)
    print("(Production passes empty volumes → unweighted median)")
    print("(Using ATR as proxy weight to estimate volume-weighting impact)")

    weighted_scores = []
    for cid in cycle_ids:
        valid = [s for s in cycles[cid] if not s['dbs']['sentinelZero']]
        if not valid:
            continue

        # Unweighted (production)
        uw_entries = [(s['dbs']['score'], 1.0) for s in valid]
        uw_score = weighted_median(uw_entries)

        # ATR-weighted (proxy for volume weighting — larger ATR pairs ≈ more volatile ≈ higher volume)
        w_entries = [(s['dbs']['score'], s.get('atr', 1.0)) for s in valid]
        w_score = weighted_median(w_entries)

        weighted_scores.append({
            'cycle': cid,
            'unweighted': uw_score,
            'atr_weighted': w_score,
            'delta': w_score - uw_score
        })

    deltas = [ws['delta'] for ws in weighted_scores]
    abs_deltas = [abs(d) for d in deltas]
    print(f"\nCycles analyzed: {len(weighted_scores)}")
    print(f"Mean |delta| (ATR-weighted vs unweighted): {sum(abs_deltas)/len(abs_deltas):.6f}")
    print(f"Max |delta|: {max(abs_deltas):.6f}")
    print(f"Median |delta|: {sorted(abs_deltas)[len(abs_deltas)//2]:.6f}")
    print(f"Cycles where weighting changes category: ", end="")
    cat_changes = sum(1 for ws in weighted_scores
                      if classify_dbs(ws['unweighted']) != classify_dbs(ws['atr_weighted']))
    print(f"{cat_changes} ({100*cat_changes/len(weighted_scores):.1f}%)")

    # ── 5. 2-sigma moves check (maturity gate condition b) ──
    print("\n" + "="*70)
    print("SECTION 5: 2-SIGMA MOVES CHECK (MATURITY GATE CONDITION B)")
    print("="*70)

    # Per-symbol: compute rolling mean + std of DBS score, flag 2σ excursions
    symbol_scores = defaultdict(list)
    for s in samples:
        if not s['dbs']['sentinelZero']:
            symbol_scores[s['symbol']].append(s['dbs']['score'])

    two_sigma_symbols = set()
    for sym, scores in symbol_scores.items():
        if len(scores) < 20:
            continue
        mean_s = sum(scores) / len(scores)
        var_s = sum((x - mean_s)**2 for x in scores) / len(scores)
        std_s = var_s ** 0.5
        if std_s < 0.001:
            continue
        # Check if any score exceeds 2σ from the pair's own mean
        for sc in scores:
            if abs(sc - mean_s) >= 2 * std_s:
                two_sigma_symbols.add(sym)
                break

    print(f"Symbols with at least one 2σ DBS move: {len(two_sigma_symbols)}")
    if len(two_sigma_symbols) >= 3:
        print(f"  ✅ Maturity gate condition (b) SATISFIED: ≥3 distinct symbols with 2σ moves")
    else:
        print(f"  ⏳ Maturity gate condition (b) NOT YET SATISFIED (need ≥3)")
    print(f"  Symbols: {sorted(two_sigma_symbols)[:15]}{'...' if len(two_sigma_symbols)>15 else ''}")

    # ── 6. Maturity gate condition (c) — already known SATISFIED from A.0 ──
    print("\n" + "="*70)
    print("SECTION 6: MATURITY GATE SUMMARY")
    print("="*70)

    cond_a = neutral_crossings_pos > 0 and neutral_crossings_neg > 0
    cond_b = len(two_sigma_symbols) >= 3
    cond_c = True  # Already confirmed in A.0 Baseline §6
    satisfied = sum([cond_a, cond_b, cond_c])
    print(f"Condition (a) global DBS crossed NEUTRAL both directions: {'✅ YES' if cond_a else '⏳ NO'}")
    print(f"Condition (b) ≥3 symbols with 2σ moves: {'✅ YES' if cond_b else '⏳ NO'}")
    print(f"Condition (c) RBS/TFS ratio divergence ≥±10pp: ✅ YES (confirmed in A.0 §6)")
    print(f"\n2-of-3 required: {satisfied}/3 satisfied → {'✅ GATE OPEN' if satisfied >= 2 else '⏳ GATE PENDING'}")

    # ── 7. Per-pair score distribution for cross-reference ──
    print("\n" + "="*70)
    print("SECTION 7: PER-PAIR DBS SUMMARY (for external cross-reference)")
    print("="*70)

    print(f"  {'Symbol':<14s} {'n':>5s} {'mean':>8s} {'std':>8s} {'min':>8s} {'max':>8s}")
    for sym in sorted(symbol_scores.keys()):
        scores = symbol_scores[sym]
        if not scores:
            continue
        n = len(scores)
        mean_s = sum(scores) / n
        var_s = sum((x - mean_s)**2 for x in scores) / n
        std_s = var_s ** 0.5
        print(f"  {sym:<14s} {n:>5d} {mean_s:>+8.4f} {std_s:>8.4f} "
              f"{min(scores):>+8.4f} {max(scores):>+8.4f}")

    print("\n" + "="*70)
    print("ANALYSIS COMPLETE")
    print("="*70)

if __name__ == '__main__':
    main()
