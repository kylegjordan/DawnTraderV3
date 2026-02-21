# Batch 1: Fix DI Probability Divergence (BUG-004)

> **Directives addressed**: 12.1.1
> **Bugs resolved**: BUG-004 (CRITICAL)
> **Risks addressed**: UNIFY-003 (DI Source Consolidation)
> **Snapshot baseline**: SNAPSHOT-000 (commit `5632a370`)
> **Date**: 2026-02-22

---

## What This Batch Does

Fixes a critical math error in the signal orchestrator's DSS evaluation path where Directional Integrity (DI) — which drives the win probability (Pwin) in every Net Expected Value calculation — was being derived from the confidence score (NGC) instead of from actual price geometry.

**Before**: `DI = normalizedConf * 100` (confidence masquerading as DI)
**After**: `DI = calculateDirectionalIntegrity(closePrices)` (geometric DI from price data)

This means every trade's Pwin and NetEV in the DSS path were mathematically wrong. After this fix, the DSS path uses the same geometric DI that the Expectancy Gate path already uses correctly.

---

## Files Modified

| File | Change |
|------|--------|
| `server/services/signal-orchestrator.ts` | 2 changes (import + DI calculation) |

**No files created. No files deleted.**

---

## Exact Changes

### Change 1: Import (line 56)

**Before**:
```typescript
import { calculateEfficiencyRatio, calculateVolNoise, calculateTrendSlope } from '../utils/analysis-utils.js';
```

**After**:
```typescript
import { calculateEfficiencyRatio, calculateVolNoise, calculateTrendSlope, calculateDirectionalIntegrity } from '../utils/analysis-utils.js';
```

### Change 2: DI Calculation (lines 1125-1128 → 1125-1127)

**Before** (4 lines):
```typescript
          // Note: confidence may be 0-1 (NGC) or 0-100 (raw) - normalize to 0-1 first
          const rawConf = signal.confidence || 0;
          const normalizedConf = rawConf > 1 ? rawConf / 100 : rawConf;
          const DI = normalizedConf * 100; // Convert to DI scale (0-100) for kernel
```

**After** (3 lines):
```typescript
          // Directive 12.1.1: Use geometric DI from price data (BUG-004 fix)
          // closePrices is already in scope (line 780: ohlcData.map(c => parseFloat(c.close)))
          const DI = calculateDirectionalIntegrity(closePrices);
```

---

## Upload Instructions for Replit

1. Upload `server/services/signal-orchestrator.ts` from this BATCH_1 folder to Replit, replacing the existing file at the same path
2. Upload `REPLIT_VALIDATION.sh` from the parent `DT_Staged_Changes/` folder to Replit's root
3. Run: `bash REPLIT_VALIDATION.sh "BATCH_1"`
4. Send the console output back to Kyle

---

## What NOT To Touch

- `server/core/calculations/net-expectancy-kernel.ts` — kernel math is correct
- `server/core/calculations/expectancy.ts` — already uses correct DI
- `server/services/paper-execution-engine.ts` — already uses correct DI
- `server/utils/analysis-utils.ts` — function is correct as-is
- `server/services/dynamic-strategy-selector.ts` — consumes netEV, does not compute DI

---

## Expected Behavioral Impact

DI values will change for every signal evaluation:
- **Before**: DI tracked confidence (typically 60-75 range)
- **After**: DI reflects price geometry:
  - Strong trending pairs: DI > 70 (higher Pwin, easier to pass EV gate)
  - Choppy/ranging pairs: DI < 30 (lower Pwin, harder to pass EV gate)
  - This is the **correct** behavior

---

## Rollback

If this batch causes issues:
1. In Replit: restore `signal-orchestrator.ts` from git: `git checkout HEAD -- server/services/signal-orchestrator.ts`
2. Or revert the clone to SNAPSHOT-000: `git reset --hard 5632a370`

---

## Roadmap Reference

| Item | Reference |
|------|-----------|
| Phase | 12.1 — Critical Math & Security Fixes |
| Bug | BUG-004 — DI Probability Divergence |
| Recommendation | UNIFY-003 — DI Source Consolidation |
| System Manual | Chapter 1 (Core Math & Scoring) |
| Impact Map | Layer 1.2 (Net Expectancy Kernel), Layer 1.4 (DI Calculation), Layer 4.1 (Signal Orchestrator) |
