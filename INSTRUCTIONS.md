# BATCH 19G-VN: Volatility Noise Formula Revision

## Summary
Replace the VN (Volatility Noise) formula from absolute-diff stddev/mean to log-returns MAD/median. Fixes the issue where most crypto pairs hit VN=1.00 ceiling due to scale-dependent absolute price differences.

## Files Modified

| File (repo-relative) | Action |
|----------------------|--------|
| `server/utils/analysis-utils.ts` | **FULL REPLACE** — New `calculateVolNoise()` using log-returns MAD/median |
| `server/core/metrics/imf-metrics.ts` | **COMMENT UPDATE ONLY** — Update formula description in JSDoc (lines 79-86). Code unchanged (delegates to analysis-utils). See `.patch` file for exact text. |
| `client/src/components/goals/diagnostics-tab.tsx` | **FULL REPLACE** — Remove hardcoded `MAX_VOL_NOISE: 0.6`, show dynamic value from telemetry API |
| `client/src/components/trading/filter-insights.tsx` | **FULL REPLACE** — Remove hardcoded "VolNoise > 0.6" and "VolNoise <= 0.6" labels |
| `server/tests/unit/analysis-utils.test.ts` | **FULL REPLACE** — Updated VN tests for new formula behavior + scale-independence test |
| `server/tests/unit/vn_parity.test.ts` | **FULL REPLACE** — Updated parity test + scale-independence test |

## Deployment

### Commit message
```
Batch 19G VN: Replace absolute-diff VN with log-returns MAD/median — robust crypto noise metric
```

### Push command
```bash
bash REPLIT_PUSH_SCRIPT.sh "Batch 19G VN: Replace absolute-diff VN with log-returns MAD/median — robust crypto noise metric"
```

### Apply order
1. Replace `server/utils/analysis-utils.ts` (full file)
2. Apply patch to `server/core/metrics/imf-metrics.ts` (comment only — see `.patch` file)
3. Replace `client/src/components/goals/diagnostics-tab.tsx` (full file)
4. Replace `client/src/components/trading/filter-insights.tsx` (full file)
5. Replace `server/tests/unit/analysis-utils.test.ts` (full file)
6. Replace `server/tests/unit/vn_parity.test.ts` (full file)
7. Run tests: `npx vitest run server/tests/unit/analysis-utils.test.ts server/tests/unit/vn_parity.test.ts`
8. Commit and push

## Post-Deployment Verification

1. **Run diagnostic**: Compute new VN values across all 300+ pairs
2. **Verify distribution**: VN values should now be spread across 0-1 (not clustered at 1.00)
3. **Check frontend**:
   - Diagnostics tab: VolNoise threshold should show "DB-driven" (not hardcoded 0.6)
   - Filter Insights: Noise Guard label should show "Noise Guard (VolNoise)" without hardcoded threshold
4. **Monitor for 24h**: Watch Kalman filter and trailing exit behavior
5. **Collect percentile data**: After 24-48h, export VN distribution for threshold recalibration

## IMPORTANT: What NOT to change
- Do NOT change `SYSTEM_GUARDS.MAX_VOL_NOISE` value in `system-guards.ts`
- Do NOT change `vn_max` values in `screener_filters` DB table
- Do NOT change VTS_IMF_THRESHOLDS
- Threshold recalibration is a SEPARATE follow-up batch after empirical data collection

## imf-metrics.ts Patch Details
The `imf-metrics.ts` file only needs a comment update. The actual `calculateVolNoise` function in that file is a one-line delegate to the canonical function in `analysis-utils.ts`. Apply the changes described in `server/core/metrics/imf-metrics.ts.patch`.

Find lines 79-86:
```
 * Directive 11.7H: Calculate Volatility Noise using canonical price-difference formula
 *
 * Delegates to analysis-utils.ts canonical function for cross-mode parity.
 * This ensures passive learning (OHLC cache) and active trading use identical math.
 *
 * Formula: stdDev(|price_diffs|) / mean(|price_diffs|)
 * Typical range: 0.2 – 0.7 for stable markets
```

Replace with:
```
 * Directive 11.7H: Calculate Volatility Noise using canonical log-returns MAD/median formula
 *
 * Delegates to analysis-utils.ts canonical function for cross-mode parity.
 * This ensures passive learning (OHLC cache) and active trading use identical math.
 *
 * Batch 19G VN: Formula updated to log returns + MAD/median (robust statistics)
 * Formula: VN = MAD(|ln(close[i]/close[i-1])|) / max(median(|ln returns|), 0.0001)
 * Typical range: 0.0 – 1.0 (new distribution — thresholds need post-deployment recalibration)
```
