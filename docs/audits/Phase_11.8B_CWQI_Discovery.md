# Phase 11.8B — CWQI / Net Expectancy Discovery Report

**Directive**: 11.8B Step 1 — Exhaustive Discovery  
**Date**: 2026-02-03  
**Status**: COMPLETE  

---

## 1. Summary of Findings

### **CASE B CONFIRMED: CWQI Is the ONLY Net Expectancy Gate in Execution Path**

Two separate expectancy implementations exist:
1. **SQE Expectancy** (`server/core/calculations/expectancy.ts`) - Signal filtering, NOT execution gating
2. **CWQI Expectancy** (`server/services/cwqi-service.ts`) - Trade execution blocking in paper-execution-engine

The paper-execution-engine uses CWQI's `calculateTradeExpectancy` as the ONLY pre-trade EV gate. This functionality must be migrated to SQE before CWQI can be deleted.

---

## 2. Complete Reference List

### 2.1 CWQI Service References

| File Path | Line(s) | Function/Purpose | Classification |
|-----------|---------|------------------|----------------|
| `server/services/cwqi-service.ts` | ALL | Net Expectancy Gate + Quality Score | **SOURCE - DELETE** |
| `server/services/paper-execution-engine.ts` | 83 | `import { cwqiService }` | **GATE - MIGRATE** |
| `server/services/paper-execution-engine.ts` | 1591-1631 | `cwqiService.calculateTradeExpectancy` - blocks trades if `!isTradeable` | **GATE - MIGRATE** |
| `server/tests/unit/cwqi.test.ts` | ALL | Unit tests for cwqiService | **DELETE with service** |
| `server/tests/integration/parity.test.ts` | 16, 36-181 | Parity tests using cwqiService | **DELETE with service** |
| `server/routes.ts` | 5025-5031 | RTB FinalRank formula uses CWQI value | **METRIC - REMOVE** |
| `server/routes.ts` | 8269 | RTB signal includes cwqi | **METRIC - REMOVE** |
| `server/routes.ts` | 11118-11187 | Trade metadata extraction (legacy) | **LOGGING - CLEAN** |
| `server/core/metrics/quality_index.ts` | 488-817 | Legacy CWQI calculation functions | **ARCHIVE - REMOVE** |
| `server/core/diagnostics/trace_service.ts` | 26, 164-218 | cwqiRaw in diagnostic traces | **LOGGING - CLEAN** |
| `server/legacy/metrics_archive.ts` | 35-81 | Archived CWQI formulas | **PRESERVE (archive)** |

### 2.2 Expectancy Implementations

| File | Function | Purpose | Authority |
|------|----------|---------|-----------|
| `server/core/calculations/expectancy.ts` | `isMathematicallyProfitable` | Signal filter (ROI check) | **SQE** |
| `server/core/calculations/expectancy.ts` | `calculateNetExpectancy` | Generic net EV calculation | **SQE** |
| `server/core/calculations/expectancy.ts` | `isSignalProfitable` | VTS/SQE signal validation | **SQE** |
| `server/services/cwqi-service.ts` | `calculateTradeExpectancy` | Trade execution gate (blocks trades) | **CWQI - MIGRATE** |
| `server/services/cwqi-service.ts` | `calculateExpectancy` | Raw + friction EV | **CWQI - MIGRATE** |
| `server/services/cwqi-service.ts` | `calculateQualityScore` | DI/VolNoise/Correlation score | **CWQI - MIGRATE** |

### 2.3 Where EV ≤ 0 Trade Blocking Occurs

| File | Line | Block Condition | Action |
|------|------|-----------------|--------|
| `server/services/paper-execution-engine.ts` | 1600 | `!cwqiResult.isTradeable` | Reject trade with CWQI_REJECT |
| `server/core/filters/signal_quality_evaluator.ts` | 144-150 | `finalScore < threshold` | Reject signal (different gate) |

**CRITICAL**: The paper-execution-engine's CWQI gate is the ONLY place where netEV ≤ 0 blocks a trade at execution time.

---

## 3. CWQI Math to Migrate

### 3.1 The Gate (Pass/Fail)

```typescript
// From cwqi-service.ts lines 101-124
calculateExpectancy(tradeMeta: TradeMeta): { netEV, rawEV, friction, pWin, pLoss }
// RawEV = (Pwin × DistTarget) - (Ploss × DistStop)
// Friction = calculateFriction(entry, target, 1)
// NetEV = RawEV - Friction
// isTradeable = netEV > 0
```

### 3.2 Win Probability

```typescript
// From cwqi-service.ts lines 57-60
pWin = 0.40 + (DI / 200), capped at 0.60
pLoss = 1 - pWin
```

### 3.3 Quality Score (Optional - for ranking)

```typescript
// From cwqi-service.ts lines 141-175
Score = normalize(netEV / risk) × DI × (1 - VolNoise) × (1 - meanCorrelation)
```

---

## 4. Migration Plan

### 4.1 Target Location

Add to: `server/core/calculations/expectancy.ts` (already has SQE expectancy logic)

### 4.2 New Function Name

`evaluateTradeExpectancy(tradeMeta)` → Returns `{ isTradeable, netEV, rejectionReason }`

### 4.3 Integration Point

In `server/services/paper-execution-engine.ts`:
- Replace: `import { cwqiService } from './cwqi-service.js'`
- With: `import { evaluateTradeExpectancy } from '../core/calculations/expectancy.js'`
- Replace: `cwqiService.calculateTradeExpectancy(signal.symbol, {...})`
- With: `evaluateTradeExpectancy({...})`

---

## 5. Files to Modify

| File | Action | Reason |
|------|--------|--------|
| `server/core/calculations/expectancy.ts` | ADD `evaluateTradeExpectancy` | Migrate CWQI gate logic |
| `server/services/paper-execution-engine.ts` | MODIFY import + usage | Use SQE instead of CWQI |
| `server/routes.ts` | REMOVE CWQI references in RTB | Clean legacy metric |
| `server/core/diagnostics/trace_service.ts` | REMOVE cwqiRaw | Clean legacy field |
| `server/core/metrics/quality_index.ts` | REMOVE CWQI functions | Legacy code |

---

## 6. Files to Delete

| File | Reason |
|------|--------|
| `server/services/cwqi-service.ts` | Legacy - functionality migrated |
| `server/tests/unit/cwqi.test.ts` | Tests for deleted service |
| `server/tests/integration/parity.test.ts` | Depends on cwqiService |

---

## 7. Verification Requirements

After migration:
1. Zero references to `cwqi` or `CWQI` (except legacy/metrics_archive.ts)
2. Single authority: `evaluateTradeExpectancy` in expectancy.ts
3. Behavioral equivalence: trades rejected before must still be rejected
4. Runtime logs: Show SQE rejecting negative-EV trades

---

**Discovery Complete. Ready for Step 2: Authority Decision → Case B Implementation.**
