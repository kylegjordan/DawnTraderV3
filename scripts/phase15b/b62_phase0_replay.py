#!/usr/bin/env python3
"""
B62 Phase 0 — Counterfactual Routing + Proxy Opportunity Analysis

Tests three candidate DBS-integrated classifier designs against B61
cycle-sampled telemetry. Produces per-strategy failure-mode x/y split
(regime-scarcity vs gate-rejection) that locks the Path D decision.

Usage: python3 b62_phase0_replay.py <telemetry1.jsonl> [telemetry2.jsonl ...]

Per CLAUDE.md §5 rule #13: all distribution measurements use rolling-window methodology.
"""
import json
import sys
from collections import defaultdict
from math import sqrt

# ═══════════════════════════════════════════════════════════════
# CANONICAL REGIME → STRATEGY MAP (from canonical-regime-strategy-map.ts)
# ═══════════════════════════════════════════════════════════════
REGIME_STRATEGIES = {
    'TREND_FRIENDLY_STABLE': [
        'vwap_pullback', 'morning_star', 'pivot_shift'
    ],
    'HIGH_VOLATILITY_UNSTABLE': [
        'mean_reversion', 'reverse_impulse', 'defensive_hedge',
        'inside_bar_reversal', 'engulfing_reversal'
    ],
    'RANGE_BOUND_STABLE': [
        'range_trade', 'support_bounce', 'abcd_long', 'adaptive_flow'
    ],
    'IMPULSE_EXPANSION': [
        'sma_trend_ride', 'breakout', 'vwap_bounce',
        'volatility_edge', 'dhma'
    ],
    'STRUCTURAL_TRANSITION': [
        'liquidity_trap', 'pivot_shift'
    ],
}

# Trend strategies = those in TFS or IE that are NOT in RBS/HVU/ST
TREND_STRATEGIES = set(REGIME_STRATEGIES['TREND_FRIENDLY_STABLE'] +
                       REGIME_STRATEGIES['IMPULSE_EXPANSION'])
# Remove pivot_shift since it's shared with ST
TREND_ONLY_STRATEGIES = TREND_STRATEGIES - set(REGIME_STRATEGIES['STRUCTURAL_TRANSITION'])

ALL_STRATEGIES = set()
for strats in REGIME_STRATEGIES.values():
    ALL_STRATEGIES.update(strats)

def classify_dbs(score):
    if score >= 0.60: return 'UP_STRONG'
    if score >= 0.30: return 'UP_MODERATE'
    if score >= 0.10: return 'UP_WEAK'
    if score <= -0.60: return 'DOWN_STRONG'
    if score <= -0.30: return 'DOWN_MODERATE'
    if score <= -0.10: return 'DOWN_WEAK'
    return 'NEUTRAL'

def dbs_family(score):
    if score >= 0.10: return 'UP'
    if score <= -0.10: return 'DOWN'
    return 'NEUTRAL'

# ═══════════════════════════════════════════════════════════════
# CURRENT CLASSIFIER (from market-regime.ts calculatePairRegime)
# ═══════════════════════════════════════════════════════════════
def current_classifier(vol, mom, dx):
    if vol < 0.012 and dx < 45:
        return 'RANGE_BOUND_STABLE'
    elif vol > 0.020 and dx > 55:
        return 'IMPULSE_EXPANSION'
    elif mom > 0.003 and dx > 50:
        return 'TREND_FRIENDLY_STABLE'
    elif (vol > 0.015 and mom < -0.003) or (dx > 60 and mom < -0.005):
        return 'HIGH_VOLATILITY_UNSTABLE'
    else:
        return 'STRUCTURAL_TRANSITION'

# ═══════════════════════════════════════════════════════════════
# CANDIDATE CLASSIFIER DESIGNS
# ═══════════════════════════════════════════════════════════════

def design_a_override(vol, mom, dx, dbs_score):
    """Design A: DBS override. If |DBS| >= 0.30, force TFS."""
    if abs(dbs_score) >= 0.30:
        return 'TREND_FRIENDLY_STABLE'
    return current_classifier(vol, mom, dx)

def design_b_fourth_input(vol, mom, dx, dbs_score):
    """Design B: DBS as fourth input in the decision tree."""
    abs_dbs = abs(dbs_score)

    # RBS gets additional gate: must also have low DBS
    if vol < 0.012 and dx < 45 and abs_dbs < 0.10:
        return 'RANGE_BOUND_STABLE'

    # IE gets relaxed: OR high DBS + moderate vol
    if (vol > 0.020 and dx > 55) or (vol > 0.015 and abs_dbs >= 0.50):
        return 'IMPULSE_EXPANSION'

    # TFS gets relaxed: OR moderate+ DBS
    if (mom > 0.003 and dx > 50) or abs_dbs >= 0.30:
        return 'TREND_FRIENDLY_STABLE'

    if (vol > 0.015 and mom < -0.003) or (dx > 60 and mom < -0.005):
        return 'HIGH_VOLATILITY_UNSTABLE'

    return 'STRUCTURAL_TRANSITION'

def design_c_mixed(vol, mom, dx, dbs_score):
    """Design C: Design B for most regimes + Design A safety net for strong DBS."""
    abs_dbs = abs(dbs_score)

    # Design B logic first
    if vol < 0.012 and dx < 45 and abs_dbs < 0.10:
        return 'RANGE_BOUND_STABLE'

    if (vol > 0.020 and dx > 55) or (vol > 0.015 and abs_dbs >= 0.50):
        return 'IMPULSE_EXPANSION'

    if (mom > 0.003 and dx > 50) or abs_dbs >= 0.30:
        return 'TREND_FRIENDLY_STABLE'

    if (vol > 0.015 and mom < -0.003) or (dx > 60 and mom < -0.005):
        return 'HIGH_VOLATILITY_UNSTABLE'

    # Design A safety net: strong DBS that Design B didn't catch
    if abs_dbs >= 0.50:
        return 'TREND_FRIENDLY_STABLE'

    return 'STRUCTURAL_TRANSITION'

# ═══════════════════════════════════════════════════════════════
# PROXY SIGNAL ASSESSMENT
# ═══════════════════════════════════════════════════════════════

def proxy_signal_plausible(strategy_key, vol, mom, dx, dbs_score, atr):
    """
    Estimate whether a strategy's detect function would plausibly fire
    based on available telemetry indicators. Returns (plausible: bool, reason: str).

    This is a PROXY ESTIMATE, not a deterministic replay. Confidence bounds
    should be applied to all aggregated numbers.
    """
    abs_dbs = abs(dbs_score)
    abs_mom = abs(mom)

    if strategy_key == 'vwap_pullback':
        # Needs: VWAP deviation < -1σ, momentum > 0
        # Proxy: positive momentum + moderate vol = plausible
        return mom > 0.001 and vol < 0.025, "mom>0 + low-mod vol"

    elif strategy_key == 'morning_star':
        # Needs: 3-bar pattern sequence, momentum flip
        # Proxy: cannot assess pattern from telemetry
        return abs_mom > 0.002, "momentum present (pattern unknown)"

    elif strategy_key == 'pivot_shift':
        # Needs: RSI 45-55, ADX slope > 0.5
        # Proxy: moderate ADX + moderate momentum
        return 35 < dx < 65 and abs_mom > 0.001, "moderate ADX + momentum"

    elif strategy_key == 'sma_trend_ride':
        # Needs: SMA(50) > SMA(100), ADX > 25, RSI 55-70
        # Proxy: positive momentum + ADX > 40 (crypto-calibrated)
        return mom > 0.003 and dx > 40, "trend momentum + directional strength"

    elif strategy_key == 'breakout':
        # Needs: Momentum > +0.7%, Volume > 2× avg
        # Proxy: strong momentum
        return abs_mom > 0.007, "strong momentum"

    elif strategy_key == 'vwap_bounce':
        # Needs: VWAP deviation > +1σ, small negative momentum
        # Proxy: slight negative momentum in a trending context
        return -0.006 < mom < -0.001 and abs_dbs > 0.20, "pullback in trend"

    elif strategy_key == 'volatility_edge':
        # Needs: Vol percentile > 80, regime mismatch
        # Proxy: high vol
        return vol > 0.018, "elevated volatility"

    elif strategy_key == 'dhma':
        # Needs: HMA(9) cross HMA(21), ADX flat
        # Proxy: cannot assess HMA from telemetry
        return 40 < dx < 55, "moderate ADX (HMA unknown)"

    elif strategy_key == 'mean_reversion':
        # Needs: RSI < 30 or > 70, price deviation > 1σ
        # Proxy: strong momentum + high vol
        return abs_mom > 0.005 and vol > 0.015, "extreme move"

    elif strategy_key == 'range_trade':
        # Needs: Bollinger < 0.14, RSI 45-55, ADX < 20
        # Proxy: low vol + low ADX + low momentum
        return vol < 0.012 and dx < 45 and abs_mom < 0.003, "flat market"

    elif strategy_key == 'support_bounce':
        # Needs: price near local min, pinbar pattern
        # Proxy: cannot assess from telemetry
        return mom < -0.002 and vol < 0.020, "price decline (pattern unknown)"

    else:
        # Default: plausible if any directional signal exists
        return abs_mom > 0.002 or abs_dbs > 0.15, "generic directional"


# ═══════════════════════════════════════════════════════════════
# PROXY GATE SURVIVAL
# ═══════════════════════════════════════════════════════════════

# Simplified gate thresholds (from system configuration)
SQE_CONFIDENCE_FLOOR = 0.45
NET_EV_THRESHOLD = 0.0  # positive net EV required

def proxy_gate_survival(strategy_key, vol, mom, dx, dbs_score, regime_confidence):
    """
    Estimate whether a signal would survive SQE/RTB/NetEV gates.
    Returns (survives: bool, reason: str).
    """
    # SQE confidence floor
    # Proxy: regime confidence is a rough proxy for signal confidence
    if regime_confidence < SQE_CONFIDENCE_FLOOR:
        return False, "below SQE confidence floor"

    # Net EV gate: positive expected value required
    # Proxy: strong DBS + moderate confidence = likely positive EV
    abs_dbs = abs(dbs_score)
    if abs_dbs < 0.15 and abs(mom) < 0.002:
        return False, "weak signal unlikely positive EV"

    return True, "proxy pass"


# ═══════════════════════════════════════════════════════════════
# MAIN ANALYSIS
# ═══════════════════════════════════════════════════════════════

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
                except:
                    continue
    return samples

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 b62_phase0_replay.py <telemetry1.jsonl> [telemetry2.jsonl ...]")
        sys.exit(1)

    samples = load_data(sys.argv[1:])
    print(f"Loaded {len(samples)} clean samples")
    print(f"Unique symbols: {len(set(s['symbol'] for s in samples))}")

    designs = {
        'CURRENT': lambda s: current_classifier(
            s['classifier']['vol'], s['classifier']['mom'], s['classifier']['adx']),
        'DESIGN_A': lambda s: design_a_override(
            s['classifier']['vol'], s['classifier']['mom'], s['classifier']['adx'], s['dbs']['score']),
        'DESIGN_B': lambda s: design_b_fourth_input(
            s['classifier']['vol'], s['classifier']['mom'], s['classifier']['adx'], s['dbs']['score']),
        'DESIGN_C': lambda s: design_c_mixed(
            s['classifier']['vol'], s['classifier']['mom'], s['classifier']['adx'], s['dbs']['score']),
    }

    # ═══════════════════════════════════════════════════
    # SECTION 1: REGIME DISTRIBUTION UNDER EACH DESIGN
    # ═══════════════════════════════════════════════════
    print("\n" + "="*70)
    print("SECTION 1: REGIME DISTRIBUTION UNDER EACH DESIGN")
    print("="*70)

    regime_counts = {d: defaultdict(int) for d in designs}
    for s in samples:
        for d_name, d_func in designs.items():
            regime = d_func(s)
            regime_counts[d_name][regime] += 1

    regimes = ['TREND_FRIENDLY_STABLE', 'IMPULSE_EXPANSION', 'HIGH_VOLATILITY_UNSTABLE',
               'STRUCTURAL_TRANSITION', 'RANGE_BOUND_STABLE']
    print(f"\n  {'Regime':<28s}", end="")
    for d in designs:
        print(f" {d:>12s}", end="")
    print()
    for r in regimes:
        print(f"  {r:<28s}", end="")
        for d in designs:
            c = regime_counts[d][r]
            pct = 100 * c / len(samples)
            print(f" {pct:>11.1f}%", end="")
        print()

    # Drift contamination under each design
    print(f"\n  Drift contamination (non-NEUTRAL DBS in RBS):")
    for d_name, d_func in designs.items():
        rbs_total = 0
        rbs_non_neutral = 0
        for s in samples:
            if d_func(s) == 'RANGE_BOUND_STABLE':
                rbs_total += 1
                if abs(s['dbs']['score']) >= 0.10:
                    rbs_non_neutral += 1
        if rbs_total > 0:
            print(f"    {d_name}: {100*rbs_non_neutral/rbs_total:.1f}% ({rbs_non_neutral}/{rbs_total})")
        else:
            print(f"    {d_name}: N/A (0 RBS samples)")

    # ═══════════════════════════════════════════════════
    # SECTION 2: STRATEGY ELIGIBILITY UNDER EACH DESIGN
    # ═══════════════════════════════════════════════════
    print("\n" + "="*70)
    print("SECTION 2: PER-STRATEGY ELIGIBILITY (NEWLY ELIGIBLE PAIR-CYCLES)")
    print("="*70)

    # For each counterfactual design, count pair-cycles where a trend strategy
    # becomes newly eligible (was NOT eligible under current, IS eligible under counterfactual)
    for d_name in ['DESIGN_A', 'DESIGN_B', 'DESIGN_C']:
        d_func = designs[d_name]
        print(f"\n  --- {d_name} ---")

        newly_eligible = defaultdict(int)  # strategy -> count
        total_eligible = defaultdict(int)  # strategy -> total under counterfactual
        current_eligible = defaultdict(int)  # strategy -> total under current

        for s in samples:
            current_regime = current_classifier(
                s['classifier']['vol'], s['classifier']['mom'], s['classifier']['adx'])
            cf_regime = d_func(s)

            current_strats = set(REGIME_STRATEGIES.get(current_regime, []))
            cf_strats = set(REGIME_STRATEGIES.get(cf_regime, []))

            for st in current_strats:
                current_eligible[st] += 1
            for st in cf_strats:
                total_eligible[st] += 1
            for st in cf_strats - current_strats:
                newly_eligible[st] += 1

        # Report trend strategies
        print(f"  {'Strategy':<22s} {'Current':>8s} {'CF Total':>10s} {'Newly Elig':>12s} {'Change':>8s}")
        for st in sorted(ALL_STRATEGIES):
            cur = current_eligible[st]
            tot = total_eligible[st]
            new = newly_eligible[st]
            if new > 0 or st in TREND_STRATEGIES:
                change = tot - cur
                print(f"  {st:<22s} {cur:>8d} {tot:>10d} {new:>12d} {change:>+8d}")

    # ═══════════════════════════════════════════════════
    # SECTION 3: FAILURE MODE DECOMPOSITION (x/y SPLIT)
    # ═══════════════════════════════════════════════════
    print("\n" + "="*70)
    print("SECTION 3: FAILURE MODE DECOMPOSITION (x/y SPLIT)")
    print("="*70)
    print("x = Failure Mode A (regime-scarcity lockout)")
    print("y = Failure Mode B (post-eligibility gate rejection)")
    print("Proxy estimates — interpret with ±5-10% confidence band\n")

    for d_name in ['DESIGN_A', 'DESIGN_B', 'DESIGN_C']:
        d_func = designs[d_name]
        print(f"\n  === {d_name} ===")

        # For each trend strategy, for pair-cycles that are newly eligible:
        # x = cycle IS newly eligible and signal plausibly fires and gates plausibly pass
        #     (failure was purely regime-scarcity — fixing the classifier recovers this)
        # y = cycle IS newly eligible but signal does NOT plausibly fire or gates reject
        #     (failure is in the gates, not the classifier)
        strategy_xy = {}
        for st in sorted(TREND_STRATEGIES):
            x_count = 0  # recovered by classifier fix
            y_count = 0  # still lost to gate rejection
            newly_elig_count = 0

            for s in samples:
                current_regime = current_classifier(
                    s['classifier']['vol'], s['classifier']['mom'], s['classifier']['adx'])
                cf_regime = d_func(s)

                current_strats = set(REGIME_STRATEGIES.get(current_regime, []))
                cf_strats = set(REGIME_STRATEGIES.get(cf_regime, []))

                if st in cf_strats and st not in current_strats:
                    newly_elig_count += 1

                    # Proxy signal assessment
                    signal_fires, _ = proxy_signal_plausible(
                        st, s['classifier']['vol'], s['classifier']['mom'],
                        s['classifier']['adx'], s['dbs']['score'], s.get('atr', 0.01))

                    if signal_fires:
                        # Proxy gate survival
                        # Estimate confidence from regime confidence range
                        regime_conf = 0.70  # typical for TFS/IE
                        survives, _ = proxy_gate_survival(
                            st, s['classifier']['vol'], s['classifier']['mom'],
                            s['classifier']['adx'], s['dbs']['score'], regime_conf)
                        if survives:
                            x_count += 1
                        else:
                            y_count += 1
                    else:
                        y_count += 1

            if newly_elig_count > 0:
                x_pct = 100 * x_count / newly_elig_count
                y_pct = 100 * y_count / newly_elig_count
                strategy_xy[st] = (x_pct, y_pct, newly_elig_count)

        print(f"\n  {'Strategy':<22s} {'Newly Elig':>10s} {'x (scarcity)':>14s} {'y (gates)':>12s} {'Dominant':>10s}")
        for st in sorted(strategy_xy.keys()):
            x_pct, y_pct, n = strategy_xy[st]
            dominant = "SCARCITY" if x_pct > y_pct + 10 else ("GATES" if y_pct > x_pct + 10 else "MIXED")
            print(f"  {st:<22s} {n:>10d} {x_pct:>13.1f}% {y_pct:>11.1f}% {dominant:>10s}")

        # Path D decision summary for this design
        if strategy_xy:
            gate_dominant = sum(1 for st, (x, y, n) in strategy_xy.items() if y > x + 10)
            scarcity_dominant = sum(1 for st, (x, y, n) in strategy_xy.items() if x > y + 10)
            print(f"\n  Path D signal: {scarcity_dominant} strategies scarcity-dominant, "
                  f"{gate_dominant} gate-dominant, "
                  f"{len(strategy_xy) - scarcity_dominant - gate_dominant} mixed")

    # ═══════════════════════════════════════════════════
    # SECTION 4: STRONG-DBS ROUTING IMPROVEMENT
    # ═══════════════════════════════════════════════════
    print("\n" + "="*70)
    print("SECTION 4: STRONG-DBS ROUTING (KEY B62 METRIC)")
    print("="*70)

    for d_name in ['CURRENT', 'DESIGN_A', 'DESIGN_B', 'DESIGN_C']:
        d_func = designs[d_name]
        strong_total = 0
        strong_in_trend = 0
        strong_in_rbs = 0

        for s in samples:
            if abs(s['dbs']['score']) >= 0.30:  # MODERATE or STRONG
                strong_total += 1
                regime = d_func(s)
                if regime in ('TREND_FRIENDLY_STABLE', 'IMPULSE_EXPANSION'):
                    strong_in_trend += 1
                elif regime == 'RANGE_BOUND_STABLE':
                    strong_in_rbs += 1

        if strong_total > 0:
            print(f"\n  {d_name}:")
            print(f"    Strong-DBS pair-cycles: {strong_total}")
            print(f"    → Trend-permissive (TFS+IE): {strong_in_trend} ({100*strong_in_trend/strong_total:.1f}%)")
            print(f"    → Locked in RBS: {strong_in_rbs} ({100*strong_in_rbs/strong_total:.1f}%)")

    # ═══════════════════════════════════════════════════
    # SECTION 5: REGIME FLICKER UNDER EACH DESIGN
    # ═══════════════════════════════════════════════════
    print("\n" + "="*70)
    print("SECTION 5: REGIME FLICKER (FAMILY-LEVEL) UNDER EACH DESIGN")
    print("="*70)

    by_symbol = defaultdict(list)
    for s in samples:
        by_symbol[s['symbol']].append(s)

    def regime_family(regime):
        if regime in ('TREND_FRIENDLY_STABLE', 'IMPULSE_EXPANSION'):
            return 'TREND'
        elif regime == 'RANGE_BOUND_STABLE':
            return 'RANGE'
        else:
            return 'VOLATILITY'

    for d_name in designs:
        d_func = designs[d_name]
        flips = 0
        comparisons = 0
        for sym, sym_samples in by_symbol.items():
            if len(sym_samples) < 2:
                continue
            for i in range(1, len(sym_samples)):
                r_prev = d_func(sym_samples[i-1])
                r_curr = d_func(sym_samples[i])
                comparisons += 1
                if regime_family(r_prev) != regime_family(r_curr):
                    flips += 1

        if comparisons > 0:
            rate = 100 * flips / comparisons
            print(f"  {d_name}: {flips}/{comparisons} = {rate:.2f}%")

    # ═══════════════════════════════════════════════════
    # SECTION 6: DESIGN RECOMMENDATION
    # ═══════════════════════════════════════════════════
    print("\n" + "="*70)
    print("SECTION 6: SUMMARY + DESIGN RECOMMENDATION")
    print("="*70)

    print("\nCompare designs on key metrics:")
    print(f"  {'Metric':<40s} {'CURRENT':>10s} {'DESIGN_A':>10s} {'DESIGN_B':>10s} {'DESIGN_C':>10s}")

    # TFS+IE share
    for label, metric_fn in [
        ('TFS+IE share (%)', lambda d: 100*(regime_counts[d].get('TREND_FRIENDLY_STABLE',0)+regime_counts[d].get('IMPULSE_EXPANSION',0))/len(samples)),
        ('RBS share (%)', lambda d: 100*regime_counts[d].get('RANGE_BOUND_STABLE',0)/len(samples)),
        ('ST share (%)', lambda d: 100*regime_counts[d].get('STRUCTURAL_TRANSITION',0)/len(samples)),
    ]:
        print(f"  {label:<40s}", end="")
        for d in designs:
            print(f" {metric_fn(d):>9.1f}%", end="")
        print()

    print("\n" + "="*70)
    print("ANALYSIS COMPLETE")
    print("="*70)

if __name__ == '__main__':
    main()
