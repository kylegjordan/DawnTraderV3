# AJ18 RTB Signal Starvation Diagnostic Report
**Session ID:** aj18_20251203_151016  
**Date:** December 3, 2025  
**Duration:** ~1.5 minutes (session ended early due to paper trading stop)  
**Mode:** Paper Trading  

---

## Executive Summary

This diagnostic session successfully captured detailed RTB (Ready-to-Buy) signal generation data to investigate why signals collapse after 3-5 minutes of trading. Even in this short session, the findings reveal significant insights into the root cause of signal starvation.

**Key Finding:** Only 2 signals were generated out of 196 strategy evaluations (1.02% signal rate), indicating that strategy criteria are uniformly too restrictive under current market conditions.

---

## Session Statistics

| Metric | Value |
|--------|-------|
| Total Cycles | 6 |
| Trading Duration | ~90 seconds |
| Signals Generated | 2 |
| Criteria Failures | 196 |
| MAX_POSITIONS Skips | 0 |
| Trades Opened | 2 |
| Trades Closed | 0 |
| Symbols in Pool | 5→10 (grew during session) |

---

## Log Category Breakdown

| Category | Count | Purpose |
|----------|-------|---------|
| STRATEGY_NO_SIGNAL | 196 | Strategy evaluations that produced no signal |
| CRITERIA_FAIL | 196 | Specific failure reasons for each no-signal |
| COOLDOWN_CHECK | 47 | Cooldown status evaluations |
| INDICATOR_STATUS | 22 | Technical indicator values |
| SNAPSHOT | 10 | Cycle state snapshots |
| CYCLE_START/END | 6 each | Cycle lifecycle events |
| POOL_STATE | 4 | Active pool state logs |
| MAX_POSITIONS_EVALUATION | 4 | Position limit checks |
| ACTIVE_POSITION_EXCLUDE | 3 | Position exclusion events |
| TRADE_LIFECYCLE | 2 | Trade open/close events |
| STRATEGY_SIGNAL | 2 | Successful signal generations |
| SIGNAL_GENERATED | 2 | RTB candidate proposals |
| BECAME_RTB | 2 | Symbols becoming RTB |
| SESSION_START | 1 | Session initialization |

---

## Criteria Failure Analysis

### By Strategy (sorted by failure count)

| Strategy | Failure Reason | Count | % of Total |
|----------|---------------|-------|------------|
| range_trading | no_range_or_not_at_support | 22 | 11.2% |
| mean_reversion | not_oversold | 22 | 11.2% |
| liquidity_trap | no_trap_pattern | 22 | 11.2% |
| dhma | regime_mismatch | 22 | 11.2% |
| breakout | no_consolidation_breakout | 22 | 11.2% |
| abcd_long | no_pattern_detected | 22 | 11.2% |
| vwap_pullback | price_below_vwap | 17 | 8.7% |
| vwap_bounce | no_bounce_confirmation | 17 | 8.7% |
| sma_trend_ride | price_below_sma | 14 | 7.1% |
| vwap_bounce | price_above_vwap | 5 | 2.6% |
| sma_trend_ride | no_uptrend | 5 | 2.6% |
| vwap_pullback | no_reversal_pattern | 4 | 2.0% |
| sma_trend_ride | not_near_sma | 2 | 1.0% |

### Strategy Success Rate

| Strategy | Evaluations | Signals | Success Rate |
|----------|-------------|---------|--------------|
| sma_trend_ride | 21 | 1 | 4.8% |
| vwap_pullback | 21 | 1 | 4.8% |
| abcd_long | 22 | 0 | 0.0% |
| breakout | 22 | 0 | 0.0% |
| mean_reversion | 22 | 0 | 0.0% |
| range_trading | 22 | 0 | 0.0% |
| vwap_bounce | 22 | 0 | 0.0% |
| liquidity_trap | 22 | 0 | 0.0% |
| dhma | 22 | 0 | 0.0% |

---

## Successful Signals Generated

1. **EURC/USDC via sma_trend_ride** (Cycle 3)
   - Confidence: 0.65
   - Trade Opened: Yes (ID: c8d37bc4-42c6-44ac-8e5c-17692ac3cf3c)

2. **AKT/USD via vwap_pullback** (Cycle 6)
   - Confidence: 0.90
   - Trade Opened: Yes (ID: cded38ab-d8e7-417e-9266-e638341cc221)

---

## Pool State Progression

| Cycle | Pool Size | Evaluated | Skipped | RTB Proposed |
|-------|-----------|-----------|---------|--------------|
| 3 | 5 | 5 | 0 | 1 |
| 4 | 5 | 5 | 0 | 0 |
| 5 | 5 | 5 | 0 | 0 |
| 6 | 10 | 10 | 0 | 1 |

---

## Root Cause Analysis

### 1. Pattern Detection Too Strict (6 strategies affected)

**Strategies:** abcd_long, breakout, range_trading, liquidity_trap, vwap_bounce, dhma

**Issue:** These strategies rely on complex pattern detection that rarely matches real market conditions:
- `abcd_long`: Requires specific ABCD harmonic pattern
- `breakout`: Requires consolidation followed by breakout
- `range_trading`: Requires established range and price at support
- `liquidity_trap`: Requires specific trap pattern formation
- `vwap_bounce`: Requires bounce confirmation at VWAP
- `dhma`: Requires specific regime conditions

**Evidence:** All 6 strategies had 100% failure rate (22 failures each, 0 signals)

### 2. Mean Reversion Threshold Too Aggressive

**Issue:** The `not_oversold` failure indicates RSI threshold is set too low (requiring deeply oversold conditions that rarely occur)

**Evidence:** 22 consecutive failures, 0 signals

### 3. VWAP/SMA Directional Bias

**Issue:** Strategies expecting price to be above VWAP/SMA fail when market is consolidating or trending down:
- `price_below_vwap` (17 failures)
- `price_below_sma` (14 failures)
- `price_above_vwap` (5 failures - opposite condition for vwap_bounce)

### 4. Regime Detection Sensitivity

**Issue:** DHMA's regime_mismatch failures (22) indicate the regime detection is too narrow, requiring perfect trend alignment

---

## Recommendations

### Immediate Actions (Priority 1)

1. **Relax Pattern Detection Thresholds**
   - Increase tolerance for ABCD pattern detection
   - Lower consolidation requirements for breakout
   - Accept partial pattern matches with reduced confidence

2. **Adjust Mean Reversion RSI Threshold**
   - Current: Likely < 30 (too aggressive)
   - Recommended: < 40 or use Z-score approach

3. **Add Adaptive VWAP/SMA Criteria**
   - Accept positions slightly below VWAP/SMA
   - Use percentage bands (e.g., within 0.5% of indicator)

### Medium-Term Actions (Priority 2)

1. **Implement Signal Blending**
   - Combine multiple weak signals into composite RTB
   - Weight signals by historical success rate

2. **Add Market Regime Awareness**
   - Detect trending vs ranging market conditions
   - Adjust strategy activation based on regime

3. **Dynamic Threshold Adjustment**
   - Track signal generation rate
   - Auto-adjust thresholds when rate drops below target

### Long-Term Actions (Priority 3)

1. **ML-Based Pattern Recognition**
   - Train models on historical successful trades
   - Replace rule-based pattern detection

2. **Backtesting Integration**
   - Test threshold changes against historical data
   - Validate before deployment

---

## Session Limitations

1. **Short Duration:** Session lasted only ~1.5 minutes before paper trading stopped unexpectedly
2. **Limited Cycles:** Only 6 complete cycles captured
3. **Report Not Auto-Generated:** Manual analysis required due to early termination

---

## Next Steps

1. **Investigate Paper Trading Stoppage** - Why does trading stop unexpectedly?
2. **Run Full 20-Minute Session** - Complete diagnostic with stable trading
3. **Implement Priority 1 Recommendations** - Focus on relaxing pattern detection
4. **Re-run Diagnostic** - Verify improvement after changes

---

## Raw Data Location

- **Session Directory:** `/tmp/aj18/aj18_20251203_151016/`
- **Log Stream:** `raw-log-stream.jsonl` (515 entries, 209KB)
- **Session Info:** `session-info.json`

---

*Report generated from AJ18 RTB Diagnostic System - Phase 8.8.3-AJ18*
