# Strategy Opportunity-Flow Audit
**Date:** 2026-04-14
**Analyst:** Claude Code
**Evidence window:** Last 7 days VTS data (2026-04-08 → 2026-04-14)
**Total closed trades analyzed:** 465

## Purpose

Per Langston's refinement during the three-way design discussion on the Unified Adaptive Intelligence Layer, this audit distinguishes between:
- **"Enabled and theoretically triggerable"** (the result of the earlier strategy status audit)
- **"Empirically receiving meaningful opportunity flow"** (what this audit answers)

A strategy can be technically alive and still be starved by market reality, gate stacking, or rarely relevant under the current architecture. This audit identifies who is merely alive vs who is actually contributing.

## Findings Summary

### Closed Trade Performance (Last 7 Days)

| Rank | Strategy | Trades | Wins | Losses | Win Rate | Avg P&L % | Status |
|------|----------|--------|------|--------|----------|-----------|--------|
| 1 | range_trade | 260 | 63 | 197 | 24.2% | -1.08% | ⚠️ DOMINANT, UNPROFITABLE |
| 2 | reverse_impulse | 61 | 28 | 33 | 45.9% | -0.36% | ⚠️ NET-NEGATIVE |
| 3 | morning_star | 54 | 32 | 22 | 59.3% | +0.18% | ✅ PROFITABLE WORKHORSE |
| 4 | support_bounce | 43 | 13 | 30 | 30.2% | -1.06% | ⚠️ UNPROFITABLE |
| 5 | volatility_edge | 24 | 24 | 0 | 100% | +3.54% | ✅ PERFECT, UNDERFIRED |
| 6 | mean_reversion | 10 | 3 | 7 | 30.0% | -1.20% | ⚠️ UNPROFITABLE |
| 7 | vwap_pullback | 6 | 1 | 5 | 16.7% | -0.45% | ⚠️ UNPROFITABLE |
| 8 | pivot_shift | 4 | 2 | 2 | 50.0% | +0.07% | ✅ MARGINAL |
| 9 | defensive_hedge | 3 | 1 | 2 | 33.3% | -0.78% | ⚠️ LOW VOLUME |

### Skip Reasons (Last 7 Days)

| Strategy | Skipped | Primary Reason |
|----------|---------|----------------|
| range_trade | 215 | 100% Net_EV_Negative |
| volatility_edge | 70 | 100% Net_EV_Negative |
| morning_star | 5 | 100% Net_EV_Negative |

### Strategy x Regime Distribution

- **range_trade:** 100% RANGE_BOUND_STABLE (260)
- **reverse_impulse:** STRUCTURAL_TRANSITION=20, HIGH_VOLATILITY_UNSTABLE=19, RANGE_BOUND_STABLE=14, TREND_FRIENDLY_STABLE=4, IMPULSE_EXPANSION=4
- **morning_star:** RANGE_BOUND_STABLE=17, STRUCTURAL_TRANSITION=15, HIGH_VOLATILITY_UNSTABLE=11, TREND_FRIENDLY_STABLE=7, IMPULSE_EXPANSION=4
- **support_bounce:** 100% RANGE_BOUND_STABLE (43)
- **volatility_edge:** TREND_FRIENDLY_STABLE=14, STRUCTURAL_TRANSITION=7, IMPULSE_EXPANSION=2, RANGE_BOUND_STABLE=1
- **mean_reversion:** 100% HIGH_VOLATILITY_UNSTABLE (10)
- **vwap_pullback:** 100% TREND_FRIENDLY_STABLE (6)
- **pivot_shift:** STRUCTURAL_TRANSITION=3, TREND_FRIENDLY_STABLE=1
- **defensive_hedge:** TREND_FRIENDLY_STABLE=1, RANGE_BOUND_STABLE=1, IMPULSE_EXPANSION=1

## Critical Finding: 7 Strategies Entirely Dormant

The following strategies are **technically enabled** but produced **ZERO trades and ZERO skips** over 7 days:

1. **sma_trend_ride** (mapped to IMPULSE_EXPANSION)
2. **breakout** (mapped to IMPULSE_EXPANSION)
3. **adaptive_flow** (mapped to RANGE_BOUND_STABLE)
4. **abcd_long** (mapped to RANGE_BOUND_STABLE)
5. **inside_bar_reversal** (mapped to HIGH_VOLATILITY_UNSTABLE)
6. **vwap_bounce** (mapped to IMPULSE_EXPANSION)
7. **dhma** (mapped to IMPULSE_EXPANSION)

Plus liquidity_trap (intentionally disabled).

**Hypothesis:** These strategies are either (a) blocked by filter gate stacking before reaching signal generation, (b) never having their patterns detected, (c) being routed incorrectly, or (d) the regimes they depend on (especially IMPULSE_EXPANSION) are rarely occurring in current market conditions.

**Cannot be determined from this audit alone.** Requires a filter-diagnostics deep-dive that traces evaluations by strategy through each filter stage.

## Critical Finding: range_trade Dominance + Underperformance

range_trade accounts for **56% of all closed trades** (260/465) with a **24.2% win rate** and **-1.08% avg P&L**. It also has **215 skipped signals** due to Net_EV_Negative. This is the single largest risk to paper-trading viability:

- Strategy logic may be broken for current market conditions
- Thresholds may be wrong
- Market conditions may simply be unfavorable for range trading
- RANGE_BOUND_STABLE regime may be over-represented in the regime classifier

## Critical Finding: volatility_edge Over-Filtered

volatility_edge has perfect performance (100% win rate, +3.54% avg P&L) but only 24 trades, with 70 skipped due to Net_EV_Negative. Either:
- Net_EV filter is legitimately rejecting low-quality opportunities
- OR the threshold is too strict and blocking profitable trades

## Recommendations (Before Go-Live)

1. **Investigate 7 dormant strategies** (filter-diagnostics deep-dive)
   - Trace evaluations → filter stages → signal generation for each
   - Determine if they're blocked by gates or starved of opportunities
   - Fix or reclassify as "rare-condition strategies"

2. **Deep-dive on range_trade performance**
   - Review strategy logic for RANGE_BOUND_STABLE conditions
   - Validate threshold calibration
   - Check if regime classifier is over-assigning RANGE_BOUND_STABLE

3. **Review volatility_edge Net_EV threshold**
   - Determine if the 70 skips represent legitimate risk filtering or missed opportunity
   - May be able to loosen threshold to increase trade count while preserving profitability

4. **Archive capture expansion**
   - Current archive captures closed trades but not filter diagnostics granularity needed
   - Before-live archive schema should include per-strategy per-filter-stage evaluation counts
   - This feeds both the before-live diagnostics and future ML feature space

## Conclusion

Langston's framing was validated by the data: "enabled and theoretically triggerable" is fundamentally different from "empirically contributing." Of 17 strategies, only **9 produced any trades** in the last 7 days, and only **3 are profitable** (morning_star, volatility_edge, pivot_shift).

Before go-live, we need confidence that the strategy portfolio is functioning as intended. The current picture shows significant imbalance that needs investigation.
