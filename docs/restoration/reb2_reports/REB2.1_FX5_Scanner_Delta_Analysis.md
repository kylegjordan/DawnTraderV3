# REB 2.1: FX5 Scanner Delta Analysis
**Date**: November 22, 2025  
**Phase**: PH.8.7–11.20–REB 2.1  
**Purpose**: Document exact deltas between current FX5 Scanner and 11.18-11.20 truth state

---

## Executive Summary

**Finding**: ❌ **COMPLETE ARCHITECTURAL ROLLBACK**  
**Status**: Current implementation is Phase 8.8.2, truth state is Phase 8.6.7  
**Impact**: Batch-first → FX5 filter architecture completely absent

The FX5 Scanner has rolled back to **universe-scale filtering**, evaluating all 1,370+ Kraken pairs every 30 seconds, instead of the batch-first architecture (60-pair batches with Top-N/Tier-B rotation) validated in Phase 8.6.7.

---

## Truth State: Phase 8.6.7 (November 18, 2025)

### Source Document
- **File**: `docs/restoration/truth/phase_8.6.7_validation_1763829797709.md`
- **Validation Date**: November 18, 2025
- **Status**: ✅ APPROVED FOR PRODUCTION

### Expected Architecture

**Pipeline Location**: `server/services/market-scanner.ts`  
**Function**: `collectMixedBatch()`

**5-Step Batch-First Pipeline**:
```
STEP 1: Fetch ALL 1,370 Kraken tickers (NO filtering)
        ↓
STEP 2: Sort by 24h volume, identify:
        - Top-N universe: Top 100 pairs by volume
        - Tier-B universe: Remaining 1,270 pairs
        ↓
STEP 3: Build 60-pair mixed batch using rotation:
        - Select 36 pairs from Top-N (with rotation index)
        - Select 24 pairs from Tier-B (with rotation index)
        - Batch composition: 36 + 24 = 60 total
        ↓
STEP 4: Apply FX5 filters to ONLY those 60 symbols
        - Min volume, spread, daily range, price checks
        - Quote currency, stablecoin, history filters
        - Only 60 pairs evaluated (NOT 1,370)
        ↓
STEP 5: Return survivors with breakdown
        - Survivors: Pairs that passed all filters
        - Breakdown: Count of failures per filter category
```

### Expected Rotation Logic

**Top-N Rotation**:
- Universe size: 100 pairs
- Batch size: 36 pairs per cycle
- Rotation increment: +36 after each scan
- Wrap-around: Index % 100
- Full rotation: Every 3 cycles (100/36 ≈ 2.78 cycles)

**Tier-B Rotation**:
- Universe size: 1,270 pairs
- Batch size: 24 pairs per cycle
- Rotation increment: +24 after each scan
- Wrap-around: Index % 1,270
- Full rotation: Every 53 cycles (1,270/24 ≈ 52.92 cycles)

**Rotation Independence**:
- Rotation based on UNFILTERED universes
- Rotation state persists across cycles
- Filter results DO NOT affect rotation indices

### Expected Metrics

**Count Semantics**:
- `evaluatedCount`: **60** (batch size, NOT universe size)
- `eligibleCount`: Number of batch pairs that passed all filters
- `ineligibleCount`: Number of batch pairs that failed any filter
- `topNCount`: Number of Top-N batch pairs that passed filters
- `tierBCount`: Number of Tier-B batch pairs that passed filters

**Universe Metrics**:
- `topEndUniverseSize`: 100 (Top-N universe before batch selection)
- `tierBUniverseSize`: 1,270 (Tier-B universe before batch selection)
- `krakenUniverseSize`: 1,370 (total Kraken trading pairs)

### Expected Debug Logging

**Log Prefix**: `[8.6.7][DEBUG]`

**Example Logs** (from validation report):
```
[8.6.7][DEBUG] STEP 1: Fetching ALL Kraken tickers for volume ranking...
[8.6.7][DEBUG] Total Kraken symbols available: 1370
[8.6.7][DEBUG] STEP 2: Top-N universe: 100, Tier-B universe: 1270
[8.6.7][DEBUG] STEP 3: Built batch - 36 Top-N + 24 Tier-B = 60 total
[8.6.7][DEBUG] Batch size BEFORE filtering: 60
[8.6.7][DEBUG] STEP 4: Applying FX5 filters to 60 batch symbols...
[8.6.7][DEBUG] Survivors AFTER FX5 filters: 2/60
[Scan:paper] Mixed batch collected: 2 eligible (36 Top-N + 24 Tier-B)
[PassiveScan:paper] ✅ Passive learning cycle complete (no trading state modified)
```

### Expected Performance

**Benchmarks** (from validation report):
- Total scan duration: 376-684ms (average ~400ms)
- Batch construction: <50ms
- FX5 filtering (60 pairs only): ~300ms
- Total pipeline: **Under 1 second** ✅

---

## Current State: Phase 8.8.2 (Rolled Back)

### Current Implementation

**File**: `server/services/fx5-scanner.ts` (368 lines)  
**Class**: `Fx5ScannerService`  
**Method**: `computeBreakdown()` (lines 222-363)

### Current Architecture

**NO batch-first pipeline** — Current approach:

```typescript
// Lines 232-235: Fetch ALL tickers and pairs
const [tickers, pairsObj] = await Promise.all([
  this.krakenService.getTicker(),
  this.krakenService.getTradablePairs()
]);

// Lines 280-355: Iterate over ALL pairs, applying filters to each
Object.entries(tickers).forEach(([pairName, ticker]) => {
  evaluated++;  // Increments for EACH of 1,370+ pairs
  
  // Filter logic applied to ENTIRE universe
  // ... quote currency, stablecoin, volume, range, price, spread checks ...
  
  // Count failures and survivors
  if (!rejected) {
    breakdown.passed_all_filters++;
  }
});
```

**Architecture Flow**:
```
1,370 tickers → apply filters to ALL → count survivors
```

❌ **This is universe-scale filtering** — exactly what Phase 8.6.7 eliminated.

### Current Metrics (INCORRECT)

**Lines 151-154** (fx5-scanner.ts):
```typescript
// Calculate rotation stats
const universeSize = filters.universeSize || 100;
const topNCount = eligibleCount;  // ❌ WRONG
const tierBCount = 0;              // ❌ WRONG - Comment says "Future enhancement (Phase 8.9)"
```

**Lines 191-193** (Stage-3 cache):
```typescript
rotation: {
  topEndUniverseSize: universeSize,  // Uses filter setting, not calculated
  tierBUniverseSize: 0,              // ❌ WRONG - should be 1,270
}
```

**Count Semantics** (INCORRECT):
- `evaluatedCount`: **1,370+** (entire universe)
- `eligibleCount`: Count of ALL pairs that passed filters (not batch-limited)
- `topNCount`: Set equal to `eligibleCount` (incorrect calculation)
- `tierBCount`: Hardcoded to `0` (rotation not implemented)

### Current Debug Logging

❌ **ZERO occurrences of `[8.6.7]` in codebase**

Current logs (Phase 8.8.2):
```
[FX5Scanner][paper] ✅ Scan complete (evaluated=1370, eligible=X)
```

No batch construction logs, no rotation logs, no step-by-step pipeline logs.

---

## Gap Analysis: Critical Missing Components

### 1. ❌ `collectMixedBatch()` Function
- **Truth**: Implemented in `market-scanner.ts`
- **Current**: **DOES NOT EXIST** (0 occurrences in codebase)
- **Impact**: No batch-first architecture, evaluates entire universe

### 2. ❌ Top-N/Tier-B Rotation Logic
- **Truth**: 
  - Top-N universe: 100 pairs
  - Tier-B universe: 1,270 pairs
  - Rotation increments: 36 (Top-N), 24 (Tier-B)
  - Rotation state persisted across cycles
- **Current**: 
  - Lines 153-154: Stub variables with no rotation logic
  - `topNCount = eligibleCount` (incorrect calculation)
  - `tierBCount = 0; // Future enhancement (Phase 8.9)` (🚨 8.6.7 already implemented this!)
- **Impact**: No rotation, no batch diversity, same pairs evaluated every cycle

### 3. ❌ 60-Pair Batch Limiting
- **Truth**: Build 60-pair batch FIRST (36 Top-N + 24 Tier-B)
- **Current**: No batch limiting logic exists
- **Impact**: Evaluates entire 1,370-pair universe instead of 60-pair batch

### 4. ❌ Batch-First → Filter Architecture
- **Truth**: Build batch → apply filters to batch only
- **Current**: Apply filters to entire universe → count survivors
- **Impact**: Complete architectural inversion, performance degradation

### 5. ❌ Debug Logging
- **Truth**: `[8.6.7][DEBUG]` logs at each pipeline step
- **Current**: Zero occurrences of `[8.6.7]` in codebase
- **Impact**: No validation of batch-first operation

### 6. ❌ Rotation State Persistence
- **Truth**: Rotation indices stored and incremented across cycles
- **Current**: No rotation state exists
- **Impact**: Cannot rotate through Top-N and Tier-B universes

### 7. ❌ Volume-Based Universe Sorting
- **Truth**: Sort all 1,370 pairs by 24h volume to identify Top-N/Tier-B
- **Current**: No volume sorting logic exists
- **Impact**: Cannot identify Top-N high-liquidity pairs vs Tier-B tail pairs

---

## Performance Impact

### Truth State (Phase 8.6.7)
- **Total scan**: 376-684ms
- **Batch construction**: <50ms
- **FX5 filtering (60 pairs)**: ~300ms
- **Performance**: ✅ Under 1 second

### Current State (Estimated)
- **Universe-scale filtering (1,370 pairs)**: 3-5x slower
- **No batch construction step**: N/A
- **Filters applied to all pairs every cycle**: Heavy load
- **Performance**: ⚠️ Potentially 1-3 seconds per scan

### Risk Assessment
1. **Performance degradation**: Slower scans due to universe-scale filtering
2. **Increased API load**: Evaluates 22.8x more pairs per scan (1,370 vs 60)
3. **Reduced batch diversity**: No rotation means same high-volume pairs dominate
4. **Missing Tier-B coverage**: Never evaluates tail-end pairs (potential opportunities missed)

---

## Restoration Requirements Summary

### Phase 1: Implement Batch-First Pipeline

**Location**: `server/services/market-scanner.ts` (or new batch service)

**Tasks**:
1. ✅ Create `collectMixedBatch()` function with 5-step pipeline
2. ✅ Implement volume-based universe sorting (identify Top-N/Tier-B)
3. ✅ Implement rotation state management (persist indices, increment by 36/24)
4. ✅ Build 60-pair batch selection (36 from Top-N, 24 from Tier-B)
5. ✅ Apply FX5 filters to batch only (not universe-scale)
6. ✅ Return survivors with batch-level breakdown

### Phase 2: Rewire FX5 Scanner

**Location**: `server/services/fx5-scanner.ts`

**Tasks**:
1. ✅ Replace `computeBreakdown()` universe iteration with `collectMixedBatch()` call
2. ✅ Update `evaluatedCount` to reflect 60-pair batch (not 1,370 universe)
3. ✅ Fix rotation stats (`topNCount`, `tierBCount`, `tierBUniverseSize`)
4. ✅ Add `[8.6.7][DEBUG]` logging at each pipeline step
5. ✅ Update Stage-3 cache to use batch-level metrics

### Phase 3: Validation

**Tasks**:
1. ✅ Run multiple scan cycles
2. ✅ Verify debug logs match Phase 8.6.7 truth logs
3. ✅ Confirm performance <1 second
4. ✅ Validate rotation: batch composition changes across cycles
5. ✅ Test survivor variance: different pairs pass filters across cycles

---

## Compliance Matrix

| Requirement | Truth State | Current State | Status |
|-------------|-------------|---------------|--------|
| **Architecture** | Batch-first → FX5 filter | Universe-scale filter | ❌ **FAIL** |
| **Function** | `collectMixedBatch()` exists | Does not exist | ❌ **FAIL** |
| **Batch Size** | 60 pairs (36+24) | N/A (evaluates all) | ❌ **FAIL** |
| **Rotation Logic** | Top-N +36, Tier-B +24 | Not implemented | ❌ **FAIL** |
| **Evaluated Count** | 60 (batch size) | 1,370 (universe) | ❌ **FAIL** |
| **Top-N Count** | Calculated from batch | Set to `eligibleCount` | ❌ **FAIL** |
| **Tier-B Count** | Calculated from batch | Hardcoded to `0` | ❌ **FAIL** |
| **Tier-B Universe Size** | 1,270 | 0 | ❌ **FAIL** |
| **Debug Logging** | `[8.6.7][DEBUG]` at each step | Not present | ❌ **FAIL** |
| **Performance** | <1 second | Unknown (likely slower) | ❌ **FAIL** |

**Overall Compliance**: **0/10 (0%)** — Complete rollback to pre-8.6.7 architecture

---

## Evidence Summary

### Truth Files Reviewed
1. `docs/restoration/truth/phase_8.6.7_validation_1763829797709.md` (212 lines)
2. `docs/restoration/truth/phase_8.6.10_mapping_1763829567734.md` (383 lines)
3. `docs/restoration/reb1_reports/01_FX5_Scanner_Truth_Report.md` (REB 1 audit)

### Current Code Files Audited
1. `server/services/fx5-scanner.ts` (368 lines)
2. `server/services/market-scanner.ts` (642 lines, first 225 examined)

### Search Results
```bash
# collectMixedBatch search
grep -r "collectMixedBatch" server/services --include="*.ts"
# Result: 0 matches ❌

# [8.6.7] debug log search
grep -r "\[8\.6\.7\]" server/services --include="*.ts"
# Result: 0 matches ❌

# Verification: Function completely absent
```

---

## Next Steps

1. ✅ **Delta Analysis Complete** (this document)
2. 🔄 **Proceed to REB 2.1 Task 4**: Restore FX5 Scanner to match truth state
3. ⏳ **Pending**: Verification with logs (REB 2.1 Task 5)
4. ⏳ **Pending**: Final REB 2.1 report (Task 6)

---

**Analysis Complete**: November 22, 2025  
**Next Phase**: Implementation (REB 2.1 Task 4)  
**Restoration Target**: Phase 8.6.7 (November 18, 2025 validated state)
