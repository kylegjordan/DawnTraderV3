# REB 1 Report: FX5 Scanner Architecture Audit
**Report ID**: REB1-01  
**Component**: FX5 Scanner (Stage-3 Market Scanner)  
**Date**: November 22, 2025  
**Priority**: 🚨 CRITICAL  
**Status**: ❌ **COMPLETE ARCHITECTURAL ROLLBACK DETECTED**

---

## Executive Summary

**VERDICT**: ❌ **FAIL** — Batch-first → FX5 filter architecture completely missing

The FX5 Scanner has experienced a complete architectural rollback. The batch-first pipeline documented in Phase 8.6.7 (Nov 18, 2025) is entirely absent from the current codebase. The system has reverted to universe-scale filtering, exactly what Phase 8.6.7 was designed to eliminate.

---

## Truth State (Phase 8.6.7 - November 18, 2025)

### Source Document
- **File**: `docs/restoration/truth/phase_8.6.7_validation_1763829797709.md`
- **SHA-256**: `1e6856ea1d12e5dae77b89f17923f1fdc8ab19ae938678a6333ed834adab4938`
- **Validation Date**: November 18, 2025
- **Status**: ✅ APPROVED FOR PRODUCTION

### Expected Architecture

**File**: `server/services/market-scanner.ts`  
**Function**: `collectMixedBatch()`  
**Pipeline** (5 Steps):

```
STEP 1: Fetch ALL 1,370 Kraken tickers (NO filtering)
STEP 2: Identify Top-N (100) and Tier-B (1,270) universes
STEP 3: Build 60-pair batch with rotation (36 Top-N + 24 Tier-B)
STEP 4: Apply FX5 filters to ONLY those 60 symbols
STEP 5: Return survivors with breakdown
```

**Architecture Flow**:
```
1,370 tickers → 60-pair batch → FX5 filters → survivors
```

### Expected Implementation Details

**Methods Used**:
- `kraken.getTicker()` — Returns ALL tickers (no filtering)
- `kraken.getTradablePairs()` — Returns ALL pairs (no filtering)

**Rotation State**:
- Top-N rotation index increments by 36 each cycle
- Tier-B rotation index increments by 24 each cycle
- Rotation based on UNFILTERED universes

**Debug Logging**:
- `[8.6.7][DEBUG] STEP 1: Fetching ALL Kraken tickers for volume ranking...`
- `[8.6.7][DEBUG] Total Kraken symbols available: 1370`
- `[8.6.7][DEBUG] STEP 2: Top-N universe: 100, Tier-B universe: 1270`
- `[8.6.7][DEBUG] STEP 3: Built batch - 36 Top-N + 24 Tier-B = 60 total`
- `[8.6.7][DEBUG] Batch size BEFORE filtering: 60`
- `[8.6.7][DEBUG] STEP 4: Applying FX5 filters to 60 batch symbols...`
- `[8.6.7][DEBUG] Survivors AFTER FX5 filters: X/60`

**Performance Metrics** (from validation):
- Scan Duration: 376-684ms (average ~400ms)
- Batch Construction: <50ms
- FX5 Filtering (60 pairs only): ~300ms
- Total Pipeline: Under 1 second

**Deleted Legacy Code**:
- ❌ `getEligiblePairsWithBreakdown()` function (338 lines deleted from `kraken.ts`)
- ❌ Universe-scale prescreen pipeline eliminated

---

## Current Workspace State (November 22, 2025)

### Actual Implementation

**File**: `server/services/fx5-scanner.ts` (368 lines)  
**Class**: `Fx5ScannerService`  
**Method**: `computeBreakdown()` (lines 222-363)

### Current Architecture

**NO batch-first pipeline detected**. Current approach:

```typescript
// Lines 232-235: Fetch ALL tickers and pairs
const [tickers, pairsObj] = await Promise.all([
  this.krakenService.getTicker(),
  this.krakenService.getTradablePairs()
]);

// Lines 280-355: Iterate over ALL pairs
Object.entries(tickers).forEach(([pairName, ticker]) => {
  // Line 284: Increment evaluated counter for EACH pair
  evaluated++;
  
  // Lines 305-341: Apply filters to ENTIRE universe
  // ... filter logic for all 1,370+ pairs ...
});
```

**Architecture Flow**:
```
1,370 tickers → apply filters to ALL → count survivors
```

**❌ This is universe-scale filtering** — exactly what Phase 8.6.7 eliminated.

---

## Gap Analysis

### 🚨 Critical Missing Components

#### 1. `collectMixedBatch()` Function
- **Truth**: Implemented in `market-scanner.ts`
- **Current**: ❌ **DOES NOT EXIST** (0 occurrences in codebase)
- **Impact**: No batch-first architecture

#### 2. Top-N/Tier-B Rotation Logic
- **Truth**: 
  - Top-N universe: 100 pairs
  - Tier-B universe: 1,270 pairs
  - Rotation increments: 36 (Top-N), 24 (Tier-B)
- **Current**: 
  - Lines 153-154: Stub variables with no rotation logic
  - `topNCount = eligibleCount` (incorrect calculation)
  - `tierBCount = 0; // Future enhancement (Phase 8.9)` (🚨 Phase 8.6.7 already implemented this!)
- **Impact**: No rotation, no batch diversity

#### 3. 60-Pair Batch Limiting
- **Truth**: Build 60-pair batch FIRST (36 Top-N + 24 Tier-B)
- **Current**: ❌ No batch limiting logic exists
- **Impact**: Evaluates entire universe instead of 60-pair batch

#### 4. Batch-First → Filter Architecture
- **Truth**: Build batch → apply filters to batch only
- **Current**: Apply filters to entire universe → count survivors
- **Impact**: Complete architectural inversion

#### 5. Debug Logging
- **Truth**: `[8.6.7][DEBUG]` logs at each pipeline step
- **Current**: ❌ Zero occurrences of `[8.6.7]` in codebase
- **Impact**: No validation of batch-first operation

### ⚠️ Incorrect Stub Values

**Lines 151-154** (fx5-scanner.ts):
```typescript
// Calculate rotation stats
const universeSize = filters.universeSize || 100;
const topNCount = eligibleCount;  // ❌ WRONG
const tierBCount = 0;              // ❌ WRONG - Phase 8.9 comment is incorrect
```

**Expected**:
- `topNCount` = count of pairs from Top-N universe that passed filters
- `tierBCount` = count of pairs from Tier-B universe that passed filters

**Lines 191-193** (fx5-scanner.ts):
```typescript
rotation: {
  topEndUniverseSize: universeSize,
  tierBUniverseSize: 0,  // ❌ WRONG - should be 1,270
}
```

### ✅ What Survived the Rollback

1. **`getEligiblePairsWithBreakdown()` deletion confirmed**
   - ✅ Function does not exist in `kraken.ts`
   - ✅ No references found in codebase

2. **FX5 Scanner class exists**
   - ✅ `Fx5ScannerService` implemented in `fx5-scanner.ts`
   - ✅ 30-second interval scanning operational
   - ✅ Stage-3 cache updates functional

3. **Filter breakdown categories**
   - ✅ 11 categories present (will verify in separate audit)

---

## Architect Verdict

**Status**: ❌ **FAIL**  
**Finding**: FX5 scanner architecture is rolled back to universe-wide filtering, breaking the batch-first pipeline mandated by Phase 8.6.7.

**Critical Issues**:
1. Truth file shows `collectMixedBatch()` pipeline (60-symbol batch, Top-N/Tier-B rotation, FX5 filters only on batch, `[8.6.7][DEBUG]` logs)
2. Current `fx5-scanner.ts`/`market-scanner.ts` lack this entirely
3. Present implementation evaluates all 1,370 symbols inside `computeBreakdown()`, recreating the deleted prescreen bottleneck
4. Removes rotation, batching, and performance guarantees
5. No evidence of `collectMixedBatch()` remnants elsewhere

---

## Restoration Requirements

### Phase 1: Restore Batch-First Pipeline

**File**: `server/services/market-scanner.ts` (or new batch-collection service)

1. **Implement `collectMixedBatch()` function** with 5-step pipeline:
   - STEP 1: Fetch all Kraken tickers
   - STEP 2: Sort by volume, identify Top-N (100) and Tier-B (1,270)
   - STEP 3: Apply rotation, build 60-pair batch (36 + 24)
   - STEP 4: Apply FX5 filters to batch only
   - STEP 5: Return survivors with breakdown

2. **Implement rotation state management**:
   - Persist rotation indices (Top-N, Tier-B)
   - Increment by 36/24 each cycle
   - Wrap around universe boundaries

3. **Add debug logging**:
   - `[8.6.7][DEBUG]` prefix for all steps
   - Log batch size before/after filtering
   - Log universe sizes, rotation state

### Phase 2: Rewire FX5 Scanner

**File**: `server/services/fx5-scanner.ts`

1. **Replace `computeBreakdown()` with batch-first approach**:
   - Call `collectMixedBatch()` instead of universe iteration
   - Use batch-level breakdown from `collectMixedBatch()`
   - Update `evaluatedCount` to reflect 60-pair batch (not 1,370 universe)

2. **Fix rotation stats**:
   - `topNCount` = actual count from Top-N batch
   - `tierBCount` = actual count from Tier-B batch
   - `tierBUniverseSize` = 1,270 (not 0)

3. **Update Stage-3 cache**:
   - Ensure `evaluatedCount = 60` (batch size, not universe size)
   - Ensure rotation stats reflect actual Top-N/Tier-B composition

### Phase 3: Validation

1. **Run multiple scan cycles**
2. **Verify debug logs** match Phase 8.6.7 truth logs
3. **Confirm performance**: <1 second total scan duration
4. **Validate rotation**: Batch composition changes across cycles
5. **Test survivor variance**: Different pairs pass filters across cycles

---

## Performance Impact

**Truth State** (Phase 8.6.7):
- Total scan: 376-684ms
- Batch construction: <50ms
- FX5 filtering (60 pairs): ~300ms

**Current State** (Estimated):
- Universe-scale filtering (1,370 pairs): 3-5x slower
- No batch construction step
- Filters applied to all pairs every cycle

**Risk**: Performance degradation, increased API load on Kraken

---

## Compliance Status

### Architecture Requirements (from Phase 8.6.7)
- [ ] Batch construction happens FIRST (60 pairs selected)
- [ ] FX5 filters applied to batch only (NOT universe-scale)
- [ ] Rotation state independent of filter results
- [ ] No prescreen pipeline remains
- [ ] Debug logging confirms correct operation

**Compliance**: 0/5 (0%)

---

## Next Steps

1. **REB 1 continues** — This audit is complete, moving to Task 2 (Filter Insights UI)
2. **Restoration deferred** — REB 1 is read-only, restoration occurs in REB 2+
3. **Master Gap Analysis** — This finding will be included in final consolidated report

---

## Appendix: Evidence Files

### Truth Files Referenced
- `docs/restoration/truth/phase_8.6.7_validation_1763829797709.md` (212 lines)

### Current Code Files Audited
- `server/services/fx5-scanner.ts` (368 lines)
- `server/services/market-scanner.ts` (first 125 lines examined)
- `server/services/kraken.ts` (grep search for deleted function)

### Search Commands Executed
```bash
# collectMixedBatch search
grep -r "collectMixedBatch" server/services --include="*.ts"
# Result: 0 matches

# [8.6.7] debug log search
grep -r "\[8\.6\.7\]" server/services --include="*.ts"
# Result: 0 matches

# Deleted function verification
grep -r "getEligiblePairsWithBreakdown" server/services/kraken.ts
# Result: 0 matches (✅ deletion confirmed)
```

---

**Report Generated**: November 22, 2025  
**Audit Phase**: REB 1 (Truth State Extraction)  
**Next Audit**: Filter Insights UI Mapping (Task 2)
