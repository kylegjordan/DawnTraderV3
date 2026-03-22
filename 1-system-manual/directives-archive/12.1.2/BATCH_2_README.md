# Batch 2: Fix Dual Friction Models (Directive 12.1.2, RISK-009)

> **Directives addressed**: 12.1.2
> **Risks resolved**: RISK-009 (HIGH)
> **Unification progress**: UNIFY-001 (PARTIALLY RESOLVED)
> **Findings resolved**: FINDING-P1-02
> **Snapshot baseline**: SNAPSHOT-003 (commit `dc17cfd6`)
> **Date**: 2026-02-22
> **Commit**: `8393a1ef`

---

## What This Batch Does

Fixes a critical friction miscalculation across 3 files where the DSS evaluation path and trade expectancy gate used `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` (a flat 0.5% constant) instead of the canonical cost model (`computeTotalRoundTripCost()` from `cost-model.ts`).

The old code had a compounding math error that underestimated friction by **72×**:
- **Before**: friction = 0.01% of entry price ($5.00 for BTC at $50,000)
- **After**: friction = 0.72% of entry price ($360.00 for BTC at $50,000)

This means the DSS NetEV gate was approving trades whose real costs exceeded their expected edge.

---

## Files Modified

| File | Change |
|------|--------|
| `server/services/signal-orchestrator.ts` | 2 friction calculations replaced with canonical cost model |
| `server/core/calculations/expectancy.ts` | `calculateFriction()` call replaced with direct cost-model usage; imports updated |
| `server/utils/analysis-utils.ts` | 3 functions marked `@deprecated` (zero runtime callers) |

**No files created. No files deleted.**

---

## Exact Changes

### Change 1: DSS evaluation loop friction (signal-orchestrator.ts, lines ~1120-1124)

**Before**:
```typescript
const frictionPct = SYSTEM_GUARDS.BASE_FEE_SLIPPAGE / 100;
const frictionPerUnit = 2 * frictionPct * entry;
```

**After**:
```typescript
const dssLoopCostMetrics = getCachedCostMetrics(symbol);
const dssLoopFrictionPct = computeTotalRoundTripCost(dssLoopCostMetrics.fee, dssLoopCostMetrics.slippage, dssLoopCostMetrics.spread);
const frictionPerUnit = dssLoopFrictionPct * entry;
```

### Change 2: DSS_TRADE_SNAPSHOT friction (signal-orchestrator.ts, lines ~1165-1169)

**Before**:
```typescript
const frictionPct = SYSTEM_GUARDS.BASE_FEE_SLIPPAGE / 100;
const totalFriction = 2 * frictionPct * entry * posSize;
```

**After**:
```typescript
const snapshotCostMetrics = getCachedCostMetrics(symbol);
const snapshotFrictionPct = computeTotalRoundTripCost(snapshotCostMetrics.fee, snapshotCostMetrics.slippage, snapshotCostMetrics.spread);
const totalFriction = snapshotFrictionPct * entry * posSize;
```

### Change 3: Expectancy gate friction (expectancy.ts, lines 36-38 + 520-525)

**Before** (import):
```typescript
import { calculateDirectionalIntegrity, calculateVolNoise, calculateFriction } from '../../utils/analysis-utils.js';
```

**After** (import):
```typescript
import { calculateDirectionalIntegrity, calculateVolNoise } from '../../utils/analysis-utils.js';
import { getCachedCostMetrics, computeTotalRoundTripCost } from '../math/cost-model.js';
```

**Before** (friction call):
```typescript
const friction = calculateFriction(tradeMeta.entryPrice, tradeMeta.targetPrice, 1);
```

**After** (friction call):
```typescript
const costMetrics = getCachedCostMetrics(symbol);
const frictionPct = computeTotalRoundTripCost(costMetrics.fee, costMetrics.slippage, costMetrics.spread);
const friction = frictionPct * tradeMeta.entryPrice;
```

### Change 4: Deprecated functions (analysis-utils.ts, lines ~328-377)

`calculateFriction()`, `calculatePerUnitFriction()`, and `getFrictionRate()` marked `@deprecated` with JSDoc pointing to cost-model.ts. Function bodies left intact. Zero runtime callers remain.

---

## Validation Results

- TypeScript compilation: PASS (zero new errors)
- Test suite: 816 passed, 81 failed (same pre-existing failures — no regressions)
- Server startup: No new errors
- Batch-specific checks: All 5 PASS

---

## What NOT To Touch

- `server/core/math/cost-model.ts` — canonical, correct as-is
- `server/core/calculations/net-expectancy-kernel.ts` — kernel math correct
- `server/config/system-guards.ts` — `BASE_FEE_SLIPPAGE` retained for non-friction consumers

---

## Rollback

If this batch causes issues:
```bash
git checkout HEAD~1 -- server/services/signal-orchestrator.ts server/core/calculations/expectancy.ts server/utils/analysis-utils.ts
```
Or revert to SNAPSHOT-003: `git reset --hard dc17cfd6`

---

## Roadmap Reference

| Item | Reference |
|------|-----------|
| Phase | 12.1 — Critical Math & Security Fixes |
| Risk | RISK-009 — Dual Friction Models |
| Unification | UNIFY-001 — Friction Model Consolidation (PARTIALLY RESOLVED) |
| Finding | FINDING-P1-02 — Dual Friction Models in Same File |
| System Manual | Chapter 1 (Core Math & Scoring) |
| Impact Map | Layer 1.3 (Cost Model), Layer 4.1 (Signal Orchestrator) |
