# BATCH 19G-VN SCOPE: Volatility Noise Formula Revision

**Date**: 2026-03-20
**Phase**: 14.5 (Post-Completion Refinement)
**Branch**: dawntrader-v4
**Author**: Claude Code (System Cartographer)

---

## 1. Problem Statement

The current Volatility Noise (VN) formula uses absolute price differences:

```
diffs[i] = |close[i] - close[i-1]|
VN = sqrt(variance(diffs)) / mean(diffs)
```

This formula is **scale-dependent** -- it operates on raw price deltas, not normalized returns. For crypto pairs with high nominal prices (e.g., BTC at $60K, ETH at $3K), the absolute diffs are large and variable, causing the coefficient of variation (stddev/mean) to push most pairs to VN = 1.00 (the ceiling). This defeats the purpose of VN as a discriminator: if every pair scores 1.00, the metric provides zero filtering value.

**Root cause**: Absolute price differences are not comparable across different price levels. A $100 move on BTC ($60K) is 0.17%, but a $100 move on a $200 pair is 50%. The old formula treats both the same.

## 2. Consensus Solution

Five independent sources (4 external LLMs + DawnTrader architecture team) unanimously agreed on the replacement formula:

### New Formula: Log Returns + MAD/Median (Robust Statistics)

```
returns[i] = |ln(close[i] / close[i-1])|     // Absolute log returns
median     = median(returns)                    // Central tendency
MAD        = median(|returns[i] - median|)      // Median Absolute Deviation
VN         = MAD / max(median, 0.0001)          // Noise ratio
VN         = clamp(VN, 0, 1)                    // Bounded output
```

### Why This Formula

1. **Log returns normalize across price levels** -- a 1% move on BTC and a 1% move on a $0.50 altcoin produce the same log return (~0.01). This eliminates the scale-dependence problem entirely.

2. **MAD/median is robust to outliers** -- unlike stddev/mean (which the old formula used), MAD/median is resistant to fat tails, flash crashes, and single-candle spikes. These are common in crypto and previously skewed VN toward the ceiling.

3. **Denominator floor (0.0001)** prevents division by zero for perfectly flat assets (median = 0).

4. **Output remains 0-1 bounded** -- the clamp ensures compatibility with all downstream consumers.

## 3. Files Affected

### Primary Change (Formula)
| File | Change | Risk |
|------|--------|------|
| `server/utils/analysis-utils.ts` | Replace `calculateVolNoise()` function body | **HIGH** -- single source of truth for all VN computation |

### Comment Update (Delegate Function)
| File | Change | Risk |
|------|--------|------|
| `server/core/metrics/imf-metrics.ts` | Update formula comment (lines 80-86). Code is a delegate to analysis-utils, no logic change needed. | LOW |

### Frontend Bug Fixes
| File | Change | Risk |
|------|--------|------|
| `client/src/components/goals/diagnostics-tab.tsx` | Line 24: hardcoded `MAX_VOL_NOISE: 0.6` -- replace with dynamic value from API or remove hardcoding | LOW |
| `client/src/components/trading/filter-insights.tsx` | Lines 127, 144: hardcoded `VolNoise > 0.6` / `VolNoise <= 0.6` labels -- make dynamic from filter data | LOW |

### Test Updates
| File | Change | Risk |
|------|--------|------|
| `server/tests/unit/analysis-utils.test.ts` | Update VN test expectations for new formula behavior | MEDIUM |
| `server/tests/unit/vn_parity.test.ts` | Verify parity still holds (IMF delegates to canonical, so it should) | LOW |

### Consumers (NO CHANGES -- behavior shift is expected and acceptable)
| File | How VN is Used | Impact of New Values |
|------|----------------|---------------------|
| FX5 Scanner | `VN <= vn_max` threshold comparison | Pairs that were VN=1.00 will now have meaningful values. More pairs will pass. Threshold recalibration needed post-deployment. |
| Signal Orchestrator (line 982) | `EXTREME_NOISE` veto when VN exceeds threshold | Same threshold comparison; new values are more meaningful |
| Adaptive Kalman Filter | `Q_t = max(0.1, VN * 0.5)` | Process noise will be lower for most pairs (was 0.5 ceiling, now spread across 0-1). Kalman will be more responsive. This is correct behavior. |
| Trailing Exit Controller | `K' = K_base * (1 + alpha*(1-DI/100) + beta*VN)` | Stop distances will be tighter for pairs that were previously VN=1.00. This is correct -- those pairs are not actually maximally noisy. |
| Expectancy Scoring | `quality = (1 - VN)` | Quality scores will be higher for pairs that were VN=1.00. This is correct -- the old values were artificially pessimistic. |
| Filter Insights | Display only | Will show new values |
| VTS Routes | Display only | Will show new values |
| Data Aggregator | Statistical tracking | Will track new distribution |
| Frontend components | Display only | Will show new values |

## 4. Implementation Checklist

- [ ] **Item 1**: Replace `calculateVolNoise()` in `server/utils/analysis-utils.ts` with log-returns MAD/median formula
- [ ] **Item 2a**: Fix `diagnostics-tab.tsx` -- remove hardcoded `MAX_VOL_NOISE: 0.6`, use telemetry API value
- [ ] **Item 2b**: Fix `filter-insights.tsx` -- remove hardcoded "VolNoise > 0.6" / "VolNoise <= 0.6" labels, use dynamic threshold from filter data
- [ ] **Item 3**: Update `imf-metrics.ts` formula comment to reflect new formula (code delegates to analysis-utils, no logic change)
- [ ] **Item 4**: Update `analysis-utils.test.ts` VN tests for new formula behavior
- [ ] **Item 5**: Verify `vn_parity.test.ts` still passes (parity between IMF and canonical)
- [ ] **Item 6**: Create INSTRUCTIONS.md with deployment steps
- [ ] **Item 7**: Package as BATCH_19G_VN.zip

## 5. Threshold Calibration Approach

**CRITICAL: Do NOT change any VN threshold values in this batch.**

The current thresholds (`vn_max` in `screener_filters` DB table, `MAX_VOL_NOISE` in `SYSTEM_GUARDS`) were calibrated for the old formula's output distribution. The new formula will produce a completely different distribution.

### Post-Deployment Calibration Steps

1. **Deploy the formula change** (this batch)
2. **Run the FX5 scanner for 24-48 hours** to accumulate VN values across all 300 pairs under the new formula
3. **Export the new VN distribution** -- compute percentiles (p10, p25, p50, p75, p90) across all pairs
4. **Set new thresholds empirically**:
   - Active quant path: `vn_max` at approximately p75-p85 (filter out noisiest 15-25%)
   - Active pattern path: `vn_max` at approximately p85-p90 (pattern recognition is more noise-tolerant)
   - VTS quant path: relaxed further per existing VTS_IMF_THRESHOLDS pattern
   - VTS pattern path: most relaxed
5. **Update DB thresholds** via a follow-up hotfix batch after empirical data is collected

This ensures thresholds are data-driven, not guessed.

## 6. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| VN values change scale, breaking threshold comparisons | **Expected** | Thresholds are DB-driven and will be recalibrated post-deployment. No code thresholds are being changed. |
| Kalman filter becomes too responsive | LOW | `Q_t = max(0.1, VN * 0.5)` has a floor of 0.1. Even if VN drops significantly, Q never goes below 0.1. |
| Trailing stops become too tight | LOW | `calculateDynamicStopDistance` has `Math.max(0.5, ...)` floor and `Math.min(3.0, ...)` ceiling. Bounded. |
| Zero/negative prices in log returns | LOW | Guard clause: `if (prices[i] <= 0 || prices[i-1] <= 0) continue` skips invalid data |
| Flat asset (all prices identical) | LOW | Denominator floor `0.0001` prevents division by zero. MAD = 0, median = 0, VN = 0/0.0001 = 0. |
| IMF/canonical parity breaks | LOW | IMF delegates to canonical function. Same code path. Parity test verifies. |

## 7. Verification Plan

### Pre-Deployment
- [ ] All VN unit tests pass with new formula
- [ ] VN parity test confirms IMF == canonical
- [ ] Manual spot-check: smooth trend prices produce low VN
- [ ] Manual spot-check: choppy oscillating prices produce high VN
- [ ] Manual spot-check: insufficient data (< 3 prices) returns 0.5

### Post-Deployment
- [ ] Run Replit diagnostic to compute new VN values across all 300+ pairs
- [ ] Verify VN distribution is spread across 0-1 range (not clustered at ceiling)
- [ ] Verify no pairs produce NaN or undefined VN
- [ ] Check filter insights page shows dynamic threshold (not hardcoded 0.6)
- [ ] Check diagnostics page shows dynamic threshold from API
- [ ] Monitor Kalman filter and trailing exit behavior for 24h
- [ ] Collect VN percentile data for threshold recalibration (separate follow-up batch)

## 8. What This Batch Does NOT Do

- Does NOT change any VN threshold values (DB or code)
- Does NOT change SYSTEM_GUARDS.MAX_VOL_NOISE
- Does NOT change VTS_IMF_THRESHOLDS
- Does NOT change screener_filters DB rows
- Does NOT modify Kalman, trailing exit, or expectancy formulas (they consume VN as-is)
- Does NOT add new features -- this is purely a formula correction

Threshold recalibration will be a separate follow-up batch after 24-48h of empirical data collection under the new formula.
