# Directive 12.1.2: Fix Dual Friction Models (RISK-009)

> **Phase**: Phase 12.1 — Critical Math & Security Fixes
> **Author**: Claude Code (System Cartographer & Lead Architect)
> **Date**: 2026-02-22
> **Status**: COMPLETE
> **Related**: RISK-009, UNIFY-001, FINDING-P1-02

---

## Context & Motivation

**What this directive does**: Replaces all incorrect `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` friction calculations with the canonical cost model (`computeTotalRoundTripCost()` from `cost-model.ts`), which uses real per-pair fee, slippage, and spread data.

**Why this change is needed**: The signal orchestrator's DSS evaluation path and the trade expectancy gate both used a flat-rate constant (`BASE_FEE_SLIPPAGE = 0.005`) for friction estimation. This is incorrect for two reasons:

1. **Wrong model**: A flat 0.5% rate ignores actual per-pair fee schedules, real slippage estimates, and real spread data. The canonical model — `(fee × 2) + (slippage × 2) + spread` — correctly accounts for fees and slippage on both entry AND exit legs, with spread charged once at entry.

2. **Compounding math error**: The signal-orchestrator divided `BASE_FEE_SLIPPAGE` (0.005) by 100, producing 0.00005 (0.005%), then doubled it. This made friction effectively invisible — the DSS was approving trades whose costs exceeded their expected edge.

**Numerical impact**:
- **Before**: friction = 0.01% of entry price (for BTC at $50,000: $5.00 per unit)
- **After**: friction = 0.72% of entry price using defaults (for BTC at $50,000: $360.00 per unit)
- The old code underestimated friction by **72×**.

**Current behavior** (pre-fix, with file paths and line numbers):

- In `server/services/signal-orchestrator.ts`, line 1122 (DSS evaluation loop):
  ```typescript
  const frictionPct = SYSTEM_GUARDS.BASE_FEE_SLIPPAGE / 100;
  const frictionPerUnit = 2 * frictionPct * entry;
  ```

- In `server/services/signal-orchestrator.ts`, line 1165 (DSS_TRADE_SNAPSHOT):
  ```typescript
  const frictionPct = SYSTEM_GUARDS.BASE_FEE_SLIPPAGE / 100;
  const totalFriction = 2 * frictionPct * entry * posSize;
  ```

- In `server/core/calculations/expectancy.ts`, line 520:
  ```typescript
  const friction = calculateFriction(tradeMeta.entryPrice, tradeMeta.targetPrice, 1);
  ```
  This calls `calculateFriction()` from analysis-utils.ts which uses the same flat `BASE_FEE_SLIPPAGE` rate.

**Expected behavior after this directive**:
- All three locations use `getCachedCostMetrics(symbol)` + `computeTotalRoundTripCost()` from cost-model.ts
- Friction reflects real per-pair trading costs, not a hardcoded constant
- The DSS NetEV gate correctly filters trades whose costs exceed their expected edge

---

## Impact Analysis

**Consulted**: SYSTEM_IMPACT_MAP.md — Layer 1 (1.3 Cost Model), Layer 4 (4.1 Signal Orchestrator)

**Directly affected files**:
| File | Change Type | Description |
|------|-------------|-------------|
| `server/services/signal-orchestrator.ts` | MODIFY | Replace 2 friction calculations with canonical cost model |
| `server/core/calculations/expectancy.ts` | MODIFY | Replace `calculateFriction()` call with direct cost-model usage, update imports |
| `server/utils/analysis-utils.ts` | MODIFY | Mark 3 functions as `@deprecated` |

**Upstream dependencies** (verified):
- `cost-model.ts`: `getCachedCostMetrics()` and `computeTotalRoundTripCost()` — already imported in signal-orchestrator.ts (line 70), new import added to expectancy.ts
- `cost-cache.ts`: `getOrSetCostMetrics()` — auto-seeds from `DEFAULT_COST_BUNDLE` on cache miss. Zero-friction trades are impossible.

**Downstream consumers** (verified):
- `computeNetExpectancyKernel()`: Receives `totalFriction` as input. Now receives correct friction value. No interface change.
- `DSS.evaluate()`: Receives `strategyMetrics` including `netEV`. NetEV now computed with correct friction.
- `dataAggregator.capture('DSS_TRADE_SNAPSHOT')`: `frictionCost` field now reports correct friction.

**Cache miss safety**: `getCachedCostMetrics()` calls `getOrSetCostMetrics()` which calls `setCostMetrics(symbol, DEFAULT_COST_BUNDLE)` on cache miss. Default values: fee=0.0026, slippage=0.0005, spread=0.0010 → total=0.0072 (0.72%). Zero-friction trades are structurally impossible.

**Test safety**: `calculateFriction()` has zero test callers. Deprecated functions left intact with unchanged behavior — no test assertions can break.

---

## Scope

**Files modified**: 3
- `server/services/signal-orchestrator.ts`
- `server/core/calculations/expectancy.ts`
- `server/utils/analysis-utils.ts`

**Files created**: None
**Files deleted**: None
**Files explicitly OUT OF SCOPE** (do not touch):
- `server/core/math/cost-model.ts` — canonical cost model, correct as-is
- `server/core/calculations/net-expectancy-kernel.ts` — kernel math is correct, only the friction input was wrong
- `server/config/system-guards.ts` — `BASE_FEE_SLIPPAGE` constant retained (still used by non-friction consumers: `getSystemGuardsInfo()` log, `retraining-freeze-controller.ts`)

---

## Implementation Steps

### Step 1: Replace DSS evaluation loop friction (signal-orchestrator.ts, lines ~1120-1124)

**REMOVE**:
```typescript
// Friction formula: 2 × BASE_FEE_SLIPPAGE% × entry (round-trip cost per unit)
const frictionPct = SYSTEM_GUARDS.BASE_FEE_SLIPPAGE / 100;
const frictionPerUnit = 2 * frictionPct * entry;
```

**REPLACE WITH**:
```typescript
// Directive 12.1.2: Use canonical cost model — real per-pair fee/slippage/spread
// getCachedCostMetrics always returns valid defaults on cache miss (exchange-defaults.ts)
const dssLoopCostMetrics = getCachedCostMetrics(symbol);
const dssLoopFrictionPct = computeTotalRoundTripCost(dssLoopCostMetrics.fee, dssLoopCostMetrics.slippage, dssLoopCostMetrics.spread);
const frictionPerUnit = dssLoopFrictionPct * entry;
```

### Step 2: Replace DSS_TRADE_SNAPSHOT friction (signal-orchestrator.ts, lines ~1165-1166)

**REMOVE**:
```typescript
const frictionPct = SYSTEM_GUARDS.BASE_FEE_SLIPPAGE / 100;
const totalFriction = 2 * frictionPct * entry * posSize;
```

**REPLACE WITH**:
```typescript
// Directive 12.1.2: Use canonical cost model for snapshot friction
const snapshotCostMetrics = getCachedCostMetrics(symbol);
const snapshotFrictionPct = computeTotalRoundTripCost(snapshotCostMetrics.fee, snapshotCostMetrics.slippage, snapshotCostMetrics.spread);
const totalFriction = snapshotFrictionPct * entry * posSize;
```

### Step 3: Replace calculateFriction() call in expectancy.ts (line ~520)

**REMOVE** (import line 36):
```typescript
import { calculateDirectionalIntegrity, calculateVolNoise, calculateFriction } from '../../utils/analysis-utils.js';
```

**REPLACE WITH**:
```typescript
import { calculateDirectionalIntegrity, calculateVolNoise } from '../../utils/analysis-utils.js';
// Directive 12.1.2: Import canonical cost model (replaces calculateFriction flat-rate helper)
import { getCachedCostMetrics, computeTotalRoundTripCost } from '../math/cost-model.js';
```

**REMOVE** (line ~520):
```typescript
const friction = calculateFriction(tradeMeta.entryPrice, tradeMeta.targetPrice, 1);
```

**REPLACE WITH**:
```typescript
// Directive 12.1.2: Use canonical cost model — real per-pair fee/slippage/spread
// getCachedCostMetrics always returns valid defaults on cache miss (exchange-defaults.ts)
const costMetrics = getCachedCostMetrics(symbol);
const frictionPct = computeTotalRoundTripCost(costMetrics.fee, costMetrics.slippage, costMetrics.spread);
const friction = frictionPct * tradeMeta.entryPrice;
```

### Step 4: Deprecate old friction functions in analysis-utils.ts (lines ~328-377)

Mark `calculateFriction()`, `calculatePerUnitFriction()`, and `getFrictionRate()` with `@deprecated` JSDoc tags pointing to `cost-model.ts`. Leave function bodies intact for backward compatibility.

---

## Validation & Verification Requirements

- [x] TypeScript compiles with zero new errors
- [x] Test suite: 816+ pass, same pre-existing failures (no regressions)
- [x] `BASE_FEE_SLIPPAGE` removed from signal-orchestrator.ts (0 matches)
- [x] `getCachedCostMetrics` present in signal-orchestrator.ts (5 matches)
- [x] `calculateFriction` call removed from expectancy.ts (0 functional calls)
- [x] `cost-model` import added to expectancy.ts (1 match)
- [x] `@deprecated` tags on analysis-utils friction functions (3 matches)
- [x] Server startup: no new errors

---

## Expected Outcomes

| Dimension | Before | After |
|-----------|--------|-------|
| Friction source in DSS path | `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE / 100` (flat, wrong) | `getCachedCostMetrics(symbol)` + `computeTotalRoundTripCost()` (real, per-pair) |
| Friction in expectancy gate | `calculateFriction()` (flat `BASE_FEE_SLIPPAGE`) | `getCachedCostMetrics(symbol)` + `computeTotalRoundTripCost()` (real, per-pair) |
| Friction magnitude (BTC example) | $5.00 per unit (0.01%) | $360.00 per unit (0.72%) |
| DSS NetEV gate accuracy | Approving trades whose costs exceed edge | Correctly filtering based on real costs |
| Cache miss behavior | N/A (flat constant) | Conservative defaults from exchange-defaults.ts (0.72%) |

**Behavioral note**: With correct friction, the DSS NetEV gate will filter more aggressively. Trades that previously appeared profitable (because friction was invisible) will now be correctly vetoed if their expected edge doesn't exceed real trading costs. This is the **correct** behavior.

---

## Risks & Rollback

**What could go wrong**:
- **More signals vetoed**: With 72× higher friction in the EV calculation, marginal trades will be correctly filtered. This reduces signal volume but increases signal quality.
- **Zero signals in low-edge markets**: If all evaluated pairs have expected edges below 0.72%, no signals will pass. This is correct — trading in that scenario would be net-negative.

**Rollback procedure**: Revert the 3 modified files from git:
```bash
git checkout HEAD~1 -- server/services/signal-orchestrator.ts server/core/calculations/expectancy.ts server/utils/analysis-utils.ts
```

---

## References

- Roadmap phase: Phase 12.1 — Critical Math & Security Fixes
- Related risks: RISK-009 (Dual Friction Models), UNIFY-001 (Friction Model Consolidation)
- Related finding: FINDING-P1-02 (Dual Friction Models in Same File)
- System Manual chapter: Chapter 1 (Core Math & Scoring)
- System Impact Map: Layer 1.3 (Cost Model), Layer 4.1 (Signal Orchestrator)
- Batch: Batch 2, commit `8393a1ef`
