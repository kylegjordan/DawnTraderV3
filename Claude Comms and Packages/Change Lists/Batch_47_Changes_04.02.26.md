# Batch 47 — Change List

> **Date**: 2026-04-02
> **Commits**: `3f039788`

## Files Modified

### 1. `server/services/strategy-filters.ts`
- detectRange() defaults: minBars 10→7, touchTolerance 0.003→0.005

### 2. `server/services/strategy-engine.ts`
- detectRangeTrading(): minRangeDurationHours 10→7, minRangeWidth floor max(0.03,2.5*ATR)→max(0.015,2.0*ATR)

### 3. `server/config/pattern-filter-profile.ts`
- PATTERN_POOL_THRESHOLDS.DI_TRENDING_MIN: 30→5 (aligned with DB seed)
- getPatternPoolThresholds(): Added console.warn when static fallback is used

### 4. `server/strategies/reverse-impulse.ts`
- RI_VOL_MULT: 1.5→1.2

### 5. `server/strategies/inside-bar-reversal.ts`
- IB_VOL_MULT: 1.5→1.3

### 6. `server/strategies/volatility-edge.ts`
- VE_A_VOL_MULT: 2.0→1.5

## Files Created
- `Claude Comms and Packages/Scope Files/BATCH_47_SCOPE.md`
