# Batch 19G VN Hotfix — Remove ALL Deprecated Filter Constants

## Commit Message
```
Batch 19G VN hotfix: Remove ALL deprecated filter constants — signal orchestrator, analysis-utils, imf-metrics now DB-driven
```

## Push Command
```bash
git -C ~/workspace add -A && git -C ~/workspace commit -m "Batch 19G VN hotfix: Remove ALL deprecated filter constants — signal orchestrator, analysis-utils, imf-metrics now DB-driven" && git -C ~/workspace push origin dawntrader-v4
```

## Summary

This hotfix removes all deprecated filter constants from `system-guards.ts` that were still being consumed by active code. All filter thresholds are now exclusively DB-driven (screener_filters table).

### What Was Wrong
- `SYSTEM_GUARDS.MAX_VOL_NOISE` (0.93), `MIN_LIQUIDITY_SCORE` (35), `CORRELATION_THRESHOLD` (0.92), `MIN_VOLUME_THRESHOLD_USD` (500K) were deprecated but still used by signal-orchestrator and analysis-utils
- `IMF_THRESHOLDS` (LQ_MIN: 35, VN_MAX: 0.96, CORR_MAX: 0.95) was still imported by imf-metrics.ts
- `VTS_IMF_THRESHOLDS` (LQ_MIN: 25, VN_MAX: 0.98, CORR_MAX: 0.95) was also present but already unused
- `verify-phase-9.ts` was completely stale (expected Phase 9 values)

### What Changed

## Files Modified

### 1. `server/services/signal-orchestrator.ts`
- **SYSTEM_GUARDS import removed** — no longer needed
- **EXTREME_NOISE veto** (line ~988): Now loads `vnMaxVeto` from DB via `storage.getScreenerFilters({ mode, filterPath: 'active_quant' })` at cycle start
- `evaluateSymbol()` method: Added `vnMaxVeto` parameter (default 0.93 for safety)
- Call site passes DB-loaded `vnMaxVeto` value

### 2. `server/utils/analysis-utils.ts`
- `CORE_METRIC_THRESHOLDS.LQ_MIN` and `.VOL_NOISE_MAX`: Changed from `SYSTEM_GUARDS.*` references to inline safe defaults (35, 0.93), marked `@deprecated`
- `passesCoreMetricFilters()`: Now accepts optional `lqMin` and `vnMax` override parameters for DB-driven values
- `computeCoreMetrics()`: Unchanged (uses defaults — callers with DB access pass overrides directly)
- SYSTEM_GUARDS import KEPT (still needed for `DI_TRENDING` and `DI_CHOPPY`)

### 3. `server/services/fx5-scanner.ts`
- `CORE_METRIC_THRESHOLDS` import removed
- `passesCoreMetricFilters()` call now passes DB-driven `lqMin` and `vnMax` from `filters` (active_quant row)
- Filter exclusion log now shows `[DB]` tag for threshold source

### 4. `server/core/metrics/imf-metrics.ts`
- `IMF_THRESHOLDS` import from system-guards.ts **removed**
- Module-level constants replaced with inline safe defaults (`DEFAULT_LQ_MIN=35`, `DEFAULT_VN_MAX=0.96`, `DEFAULT_CORR_MAX=0.95`)
- `calculateIMFMetrics()`: Now accepts optional `thresholds?: IMFThresholdOverrides` parameter
- `getIMFThresholds()`: Returns the safe defaults
- New exported interface: `IMFThresholdOverrides`

### 5. `server/config/system-guards.ts`
- **REMOVED**: `MIN_LIQUIDITY_SCORE`, `MAX_VOL_NOISE`, `CORRELATION_THRESHOLD`, `MIN_VOLUME_THRESHOLD_USD` from `SYSTEM_GUARDS` object
- **REMOVED**: `IMF_THRESHOLDS` export (and `IMFThresholdsType`)
- **REMOVED**: `VTS_IMF_THRESHOLDS` export
- `VERSION` updated to `Phase14_Batch19G_VN_HF`
- `getSystemGuardsInfo()` updated to reflect DB-driven architecture
- **KEPT**: `BASE_FEE_SLIPPAGE`, `PARITY_TOLERANCE`, `DI_TRENDING`, `DI_CHOPPY`, `MIN_PWIN`, `MAX_PWIN`, `DI_PWIN_FACTOR`, `REGIME_THRESHOLDS`, `STRATEGY_MAP`, `HYBRID_PARAMS`, `TIMEFRAME_CONFIG`, `SCANNER_PARAMS`, `FILTER_FLAGS`, `FILTER_SCHEMA_VERSION`, etc.

### 6. `server/core/calculations/expectancy.ts`
- Unused `SYSTEM_GUARDS` import removed

### 7. `server/tests/unit/analysis-utils.test.ts`
- Added test for DB-driven threshold override parameters in `passesCoreMetricFilters()`
- Existing tests unchanged (use defaults which match old values)

## File DELETED

### `server/scripts/verify-phase-9.ts`
Completely stale verification script that expected Phase 9 values (LQ=40, VN=0.6, VERSION=Phase9_Final). None of these match current system state. DELETE this file entirely.

## Verification Notes
- All remaining SYSTEM_GUARDS importers checked — none reference removed constants
- `risk_index.ts` and `data-normalization.ts` have their own local CORRELATION_THRESHOLD/MIN_LIQUIDITY_SCORE constants (unrelated to system-guards)
- `signal-weight-optimizer.ts` has its own CORRELATION_THRESHOLD (unrelated)
- `diagnostic-11.4G-5.ts` imports SYSTEM_GUARDS for HYBRID_PARAMS only — unaffected
- VN parity test (`vn_parity.test.ts`) unchanged — still valid
