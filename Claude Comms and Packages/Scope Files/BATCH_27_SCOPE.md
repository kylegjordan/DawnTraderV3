# Batch 27 Scope: Counter Fixes + Investigation Results

**Date**: 2026-03-26
**Phase**: 14.6 (Filter Diagnostics Data Truth)
**Author**: Claude Code

---

## Purpose

Fix remaining counter bugs found during Batch 26 post-implementation verification, and resolve investigation items for LQ thresholds, benchmark bypass, and signal rejection key mismatches.

---

## Pre-Implementation Audit: Code-Path Trace Results

### Issue #22: byStrategy TOTAL gap (100,140 vs 103,315)
**Root cause**: Duplicate guard (vts-runner.ts line 1724) increments `totalStrategyEvaluations` but does NOT increment `byStrategy[stratKey]`. The `continue` at line 1734 skips the byStrategy increment at line 1753.
**Fix**: Add byStrategy init + evaluated/nulls increment inside the duplicate guard block.

### Issue #23: Null reason % denominator = 115%
**Root cause**: machine-learning.tsx line 2105 uses `ve.quantStrategyNulls || 1` as the denominator. But nullReasons contains ALL nulls (quant + pattern + family filter + ADX guard + duplicate). The denominator should be the sum of all null reason counts.
**Fix**: Change denominator to sum of all nullReason values.

### Issue #20: Signal rejection reasons all zero despite 53 total
**Root cause**: `logSkippedSignal()` is called in very few places. Many SkipReason types (FinalScore_Low, RegimeWeight_Low, Duplicate_Position, BLOCKED_GOVERNANCE, LEARNING_DEFERRED, Confidence_Floor, Illiquid_USD) are defined in the type but NEVER actually written by any code path. The rejections showing by regime come from a different data source or calculation. Additionally, vts-runner.ts line 853 logs `'Net_EV_Below_VTS_Floor'` which doesn't match the SkipReason type `'Net_EV_Negative'`.
**Fix**: This is primarily a wiring issue — the SQE and other guards need to call logSkippedSignal() when they reject. For Batch 27, we focus on ensuring the existing log calls use correct keys and that the byReason data actually flows to the UI. The broader wiring of all rejection paths is tracked but may extend to Batch 29.

### Issue #7: LQ threshold all zeros
**Root cause**: LQ thresholds are NOT zero — they're set to 20-40 depending on path. The actual issue is that LQ scores for Kraken pairs are consistently high enough to pass. The `lq >= threshold` check at fx5-scanner.ts line 1058 passes for all pairs because their computed LQ values exceed the minimums.
**Finding**: LQ is working correctly — no pairs fail because all pairs have sufficient liquidity. This is expected for Kraken (a major exchange). LQ would matter more on smaller exchanges. **Resolution: Document as working-as-intended. Not a bug.**

### Issue #9: Benchmark bypass pattern path = 0
**Root cause**: Benchmark bypass flags (`bypassVolatilityReject`, `bypassBoringReject`) are only applied in the quant IMF filter path (fx5-scanner.ts lines 911-916). The pattern path IMF filter (lines 1001-1018) does NOT check bypass flags — it's a strict metric check.
**Finding**: Zero is truthful — the pattern path has no benchmark bypass by design. Benchmark pairs can still enter the pattern path if they pass the strict metrics. **Resolution: Document as by-design. Not a bug. Could add bypass to pattern path if desired, but that's a feature request, not a fix.**

### Issue #5: Quant pattern detection = 0
**Root cause**: By design, quant pairs don't run `scanPatterns()`. Pattern detection only runs on `pair.sourcePool === 'pattern'` pairs (vts-runner.ts line 1602). Quant pairs use regime-based strategy selection.
**Finding**: Zero is truthful — quant pairs never trigger pattern detection. **Resolution: Document as by-design.**

---

## Changes — Checklist

### FIX 1: Duplicate guard byStrategy increment (vts-runner.ts ~line 1724-1734)
- [ ] Add byStrategy init and increment inside the duplicate guard block
- **Verification**: byStrategy TOTAL = Total Strategy Evaluations after 30min

### FIX 2: Null reason % denominator (machine-learning.tsx ~line 2105)
- [ ] Change `ve.quantStrategyNulls || 1` to sum of all nullReason values
- **Verification**: No percentage exceeds 100%. All percentages sum to ~100%.

### FIX 3: Signal rejection key investigation — ensure existing logSkippedSignal calls use correct keys
- [ ] Check if `'Net_EV_Below_VTS_Floor'` at vts-runner.ts line 853 should be `'Net_EV_Negative'` to match SkipReason type
- [ ] Verify that logSkippedSignal calls at lines 853, 882, 929, 1780 in vts-runner.ts and lines 165, 294 in signal_quality_evaluator.ts use valid SkipReason keys
- **Verification**: After restart, byReason shows non-zero counts for reasons that are actually firing

### FIX 4: Document #7, #9, #5 as resolved/by-design in issues tracker
- [ ] Update FILTER_DIAGNOSTICS_ISSUES.md with findings

---

## Files Affected

| File | Changes |
|------|---------|
| `server/services/vts-runner.ts` | Fix 1: byStrategy increment in duplicate guard. Fix 3: verify logSkippedSignal keys |
| `client/src/pages/machine-learning.tsx` | Fix 2: null reason % denominator |

---

## Verification Plan

### After restart (30 minutes)
1. byStrategy TOTAL = Total Strategy Evaluations (Issue #22 resolved)
2. No null reason % exceeds 100% (Issue #23 resolved)
3. Signal rejection byReason shows non-zero counts for at least Net_EV_Negative (Issue #20 at least partially resolved)

### What counts as failure
- byStrategy TOTAL still != Total Strategy Evaluations → duplicate guard increment didn't wire correctly
- Any null % still > 100% → denominator still wrong
- All rejection reasons still zero → deeper wiring issue, escalate to Batch 29
