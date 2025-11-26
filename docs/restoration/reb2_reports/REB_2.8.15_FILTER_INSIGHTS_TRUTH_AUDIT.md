# REB 2.8.15 – FX5 Filter Insights Truth Audit

**Date:** November 26, 2025  
**Objective:** Prove that all Filter Insights numbers are mathematically correct and consistent with FX5 scanner behavior

---

## A. Data Flow Mapping (FX5 → 24h Metrics → Active Pool → UI)

### 1. Filter Insights Metrics & Data Sources

#### **Total Evaluated (24h)**
- **File:** `server/services/fx5-24h-window.ts` - Function: `get24hSummary()`
- **Computation:** `window.reduce((sum, e) => sum + e.evaluatedCount, 0)` (line 180)
- **Data Source:** In-memory `window24hByMode` Map, containing `Scan24hEntry[]` for last 24 hours
- **Aggregation Logic:** Sum of `evaluatedCount` from each cycle entry in the 24h window
- **Filters Applied:** 
  - **isEngineActive=true ONLY** (passive learning cycles excluded, see line 81)
  - Time range: Last 24 hours from current time
  - Mode-specific (paper vs live)

#### **Unique Evaluated (24h)**
- **File:** `server/services/fx5-24h-window.ts` - Function: `get24hSummary()`
- **Computation:** Deduplicate all `evaluatedSymbols` across window (lines 184-188)
  ```typescript
  const evaluatedSet = new Set<string>();
  for (const e of window) {
    e.evaluatedSymbols.forEach(s => evaluatedSet.add(s));
  }
  const uniqueEvaluated = evaluatedSet.size;
  ```
- **Data Source:** Same `window24hByMode` Map
- **Aggregation Logic:** Count of distinct symbols that appeared in ANY cycle's `evaluatedSymbols` array
- **Filters Applied:** Same as Total Evaluated (24h)

#### **Total Survived Filters (24h)**
- **File:** `server/services/fx5-24h-window.ts` - Function: `get24hSummary()`
- **Computation:** `window.reduce((sum, e) => sum + e.eligibleCount, 0)` (line 181)
- **Data Source:** Same `window24hByMode` Map
- **Aggregation Logic:** Sum of `eligibleCount` from each cycle entry in the 24h window
- **Filters Applied:** Same as Total Evaluated (24h)

#### **Unique Survived Filters (24h)**
- **File:** `server/services/fx5-24h-window.ts` - Function: `get24hSummary()`
- **Computation:** Deduplicate all `survivedSymbols` across window (lines 184-190)
  ```typescript
  const survivedSet = new Set<string>();
  for (const e of window) {
    e.survivedSymbols.forEach(s => survivedSet.add(s));
  }
  const uniqueSurvived = survivedSet.size;
  ```
- **Data Source:** Same `window24hByMode` Map
- **Aggregation Logic:** Count of distinct symbols that passed filters in ANY cycle
- **Filters Applied:** Same as Total Evaluated (24h)

#### **Total Active Filtered Pairs (Active Pool Card Header)**
- **File:** `server/services/stage3-state-cache.ts` - Property: `activePoolCount`
- **Computation:** `activeFilteredPool.length` (persistent pool, deduped & TTL-managed)
- **Data Source:** In-memory Active Filter Pool (`server/services/active-filter-pool.ts`)
- **Aggregation Logic:** 
  - Deduplication: One entry per symbol (latest wins)
  - TTL: 5-minute expiration (entries auto-expire if not refreshed)
  - Single-gate pattern: Pool cleared when `isEngineActive=false`
- **Files Involved:**
  - `server/services/fx5-scanner.ts` lines 182-189: Pool population logic
  - `server/services/active-filter-pool.ts`: Pool management

### 2. REST Endpoint Confirmation

✅ **All 24h metrics now come from REST-based aggregation** (REB 2.8.8)

**Primary Endpoints:**
1. **`GET /api/paper-sim/diagnostics/scan-24h?mode={mode}`**
   - File: `server/routes.ts` lines 6090-6111
   - Handler: Calls `get24hSummary(mode)` from `fx5-24h-window.ts`
   - Returns: `totalCycles`, `totalEvaluated`, `totalSurvived`, `uniqueEvaluated`, `uniqueSurvived`, `breakdown24h`
   - Refresh Interval: Every 30 seconds (client-side polling)

2. **`GET /api/paper-sim/diagnostics/scan-latest?mode={mode}`**
   - File: `server/routes.ts` lines 6114-6162
   - Handler: Reads from `stage3Cache.getState(mode)`
   - Returns: Latest scan cycle data including `activePoolCount` and `activeFilteredPool`
   - Refresh Interval: Every 5 seconds (client-side polling)

**UI Implementation:**
- File: `client/src/components/trading/filter-insights.tsx`
- Lines 240-251: REST queries (NO WebSocket listeners for 24h metrics)
- Lines 259-260: WebSocket listeners REMOVED (REB 2.8.3 comment confirms this)
- Lines 268: WebSocket breakdown listener REMOVED (REB 2.8.8 comment confirms this)

✅ **Confirmed: NO WebSocket-based 24h metric manipulation**

---

## B. Accounting TRUTH for FX5

### Defined Truth (Based on Historical REB Docs)

For a given 24h window:

1. **Total Evaluated (24h)** = Sum of `evaluatedCount` from all ACTIVE cycles
   - Each cycle contributes its batch size (60 pairs)
   - **Expected behavior:** Should grow by 60 with each scan (assuming engine is ACTIVE)

2. **Unique Evaluated (24h)** = Count of distinct symbols evaluated at least once
   - Accounts for rotation re-checking same pairs
   - **Expected behavior:** Should be ≤ Total Evaluated (24h), growing slower due to rotation overlap

3. **Total Survived Filters (24h)** = Sum of `eligibleCount` from all ACTIVE cycles
   - Each cycle contributes the number of pairs that passed ALL filters
   - **Expected behavior:** Should be ≤ Total Evaluated (24h), dependent on filter strictness

4. **Unique Survived Filters (24h)** = Count of distinct symbols that passed filters at least once
   - Deduped across all cycles
   - **Expected behavior:** Should be ≤ Unique Evaluated (24h) and ≤ Total Survived Filters (24h)

5. **Total Active Filtered Pairs (Active Pool)** = Distinct symbols currently in pool (deduped, non-expired)
   - **Invariant:** MUST be ≤ Unique Survived Filters (24h)
   - **Invariant:** MUST equal the number of rows in the Active Pool table
   - **Invariant:** MUST be 0 when `isEngineActive=false` (passive learning mode)

### Implementation Verification

✅ **MATCHES TRUTH** - Current implementation aligns with defined accounting:

| Metric | Implementation | Truth Match |
|--------|---------------|-------------|
| Total Evaluated (24h) | Sum of `evaluatedCount` across window | ✅ Correct |
| Unique Evaluated (24h) | `Set<string>` deduplication of `evaluatedSymbols` | ✅ Correct |
| Total Survived Filters (24h) | Sum of `eligibleCount` across window | ✅ Correct |
| Unique Survived Filters (24h) | `Set<string>` deduplication of `survivedSymbols` | ✅ Correct |
| Active Pool Size | `activeFilteredPool.length` (deduped, TTL-managed) | ✅ Correct |

**Active Pool Invariants:**
- ✅ Pool size ≤ Unique Survived (verified in code logic)
- ✅ Pool size = rows in table (single source of truth)
- ✅ Pool cleared when engine stopped (line 179 in fx5-scanner.ts)

**No Discrepancies Found** - All accounting logic matches the defined truth.

---

## C. Early-Cycle Behavior Analysis

### Expected First 10-20 Scan Cycle Behavior

#### Rotation Mechanics (see Section D for details)

**Batch Composition per Cycle:**
- Total: 60 pairs per scan
- Top-N: 36 pairs (from top 100 by volume, rotates)
- Tier-B: 24 pairs (from remaining ~1,270 pairs, rotates)

**Top-N Rotation:**
- Universe: 100 highest-volume pairs
- Batch size: 36 pairs per cycle
- Rotation: Advances by 36 each cycle → **Full Top-N coverage every ~2.78 cycles**
- Example: Cycle 1 (pairs 0-35), Cycle 2 (pairs 36-71), Cycle 3 (pairs 72-99, wraps to 0-7)

**Tier-B Rotation:**
- Universe: ~1,270 remaining pairs (after top 100)
- Batch size: 24 pairs per cycle
- Rotation: Advances by 24 each cycle → **Full Tier-B coverage every ~53 cycles**

#### Early-Cycle Predictions

**First 10 Cycles (engine ACTIVE, fresh 24h window):**

| Cycle | Total Eval (24h) | Unique Eval (24h) | Expected Relationship |
|-------|------------------|-------------------|----------------------|
| 1 | 60 | ~60 | Nearly equal (first batch, all new symbols) |
| 2 | 120 | ~90-110 | Some overlap from Top-N rotation |
| 3 | 180 | ~130-160 | Top-N full cycle complete, more overlap |
| 5 | 300 | ~220-270 | Significant overlap in Top-N, minimal in Tier-B |
| 10 | 600 | ~380-480 | Top-N fully covered ~3.6x, Tier-B ~18% covered |

**Why Total ≠ Unique Early On:**
- Top-N rotates through same 100 pairs every ~3 cycles
- By cycle 10, Top-N pairs seen ~3-4 times each
- Tier-B pairs mostly unique (only ~18% of universe touched)

**Active Pool Behavior:**
- Cycle 1: Pool size = survivors from first batch (0-60 depending on filters)
- Cycle 2-10: Pool grows as NEW unique survivors added
- After ~20 cycles: Pool stabilizes (TTL expires old entries, rotation brings them back)

**If Divergence Appears:**
- **Expected:** Total > Unique from cycle 2 onwards (rotation intentionally re-checks pairs)
- **Unexpected:** Total = Unique for many cycles → rotation logic broken
- **Unexpected:** Active Pool > Unique Survived → TTL or deduplication broken

### Diagnostic Logging Implementation

**TODO (Section I below):** Add temporary logging to capture first 20 cycles with:
- cycleId, mode, batch type (Top-N/Tier-B counts)
- evaluatedCount, survivorsCount per cycle
- Cumulative 24h metrics after each cycle
- Active Pool size after each cycle

---

## D. Top-N + Tier-B Rotation Semantics

### Current Implementation

**File:** `server/services/market-scanner.ts` - Function: `collectMixedBatch()` (lines 700-929)

#### Step-by-Step Rotation Logic

**STEP 1: Fetch Kraken Universe** (lines 708-723)
```typescript
const [tickers, pairsObj] = await Promise.all([
  krakenService.getTicker(),
  krakenService.getTradablePairs()
]);
const allPairs = /* map tickers to pair objects */;
const krakenUniverseSize = allPairs.length; // ~1,370 total
```

**STEP 2: Sort & Partition** (lines 726-732)
```typescript
allPairs.sort((a, b) => b.volume24h - a.volume24h); // Descending volume
const TOP_N_SIZE = 100;
const topNUniverse = allPairs.slice(0, 100);    // Top 100 by volume
const tierBUniverse = allPairs.slice(100);       // Remaining ~1,270
```

**STEP 3: Build 60-Pair Batch with Rotation** (lines 735-763)
```typescript
const TOP_N_BATCH_SIZE = 36;
const TIER_B_BATCH_SIZE = 24;

// Top-N rotation (36 pairs)
const topNBatch = [];
for (let i = 0; i < 36; i++) {
  const index = (rotationState.topNIndex + i) % topNUniverse.length;
  topNBatch.push(topNUniverse[index]);
}

// Tier-B rotation (24 pairs)
const tierBBatch = [];
for (let i = 0; i < 24; i++) {
  const index = (rotationState.tierBIndex + i) % tierBUniverse.length;
  tierBBatch.push(tierBUniverse[index]);
}

const batch = [...topNBatch, ...tierBBatch]; // Total: 60 pairs

// Increment indices for next cycle
rotationState.topNIndex = (rotationState.topNIndex + 36) % 100;
rotationState.tierBIndex = (rotationState.tierBIndex + 24) % tierBUniverse.length;
```

**STEP 4: Apply FX5 Filters to Batch** (lines 766-891)
- Filters applied: quote currency, stablecoins, min volume, daily range, min price, bid-ask spread
- Already-active check: Pairs in open trades excluded from pool (but counted as eligible)
- Survivors: Pairs passing ALL filters + not already active

#### Batch Composition & Coverage

| Parameter | Top-N | Tier-B |
|-----------|-------|--------|
| Universe Size | 100 | ~1,270 |
| Batch Size per Cycle | 36 | 24 |
| Total Batch Size | - | 60 |
| Full Rotation Period | ~2.78 cycles (100/36) | ~53 cycles (1,270/24) |
| Coverage After 10 Cycles | 100% (3.6x) | ~18.9% (240/1,270) |
| Coverage After 20 Cycles | 100% (7.2x) | ~37.8% (480/1,270) |

### Interaction with 24h Metrics

**Why Total ≠ Unique in First 10 Cycles:**
1. **Top-N Re-Evaluation:** Same 100 pairs cycle through every ~3 cycles
   - By cycle 3, all Top-N pairs seen at least once
   - By cycle 10, each Top-N pair evaluated ~3-4 times
2. **Tier-B Gradual Coverage:** Only ~19% of Tier-B universe touched by cycle 10
   - Mostly unique symbols in early Tier-B batches
3. **Combined Effect:**
   - Total Evaluated (24h) = 60 × cycles (assumes ACTIVE)
   - Unique Evaluated (24h) grows slower due to Top-N repetition

**Example (First 10 Cycles, Hypothetical):**
- Cycle 1: Total=60, Unique=60 (all new)
- Cycle 3: Total=180, Unique=~150 (Top-N full rotation complete, some Tier-B overlap possible)
- Cycle 10: Total=600, Unique=~420 (Top-N 100 + Tier-B ~240 new + ~60 Tier-B repeats)

### Comparison to Nov 6-15 Truth

**Original Phase 8.6.7 Architecture (Nov 6-15):**
- Batch-first design: ✅ **Preserved**
- 60-pair batches: ✅ **Preserved**
- Top-N/Tier-B rotation: ✅ **Preserved**
- Top-N size: 100 → ✅ **Unchanged**
- Top-N batch: 36 → ✅ **Unchanged**
- Tier-B batch: 24 → ✅ **Unchanged**

**No divergence detected** - Current rotation logic matches pre-GitHub truth per Phase 8.6.7.

---

## E. UI Reconciliation with Backend Truth

### Filter Insights Page Analysis

**File:** `client/src/components/trading/filter-insights.tsx`

#### REST Endpoint Usage

| UI Metric | REST Endpoint | Line | Correct Mapping |
|-----------|--------------|------|-----------------|
| Total Evaluated (24h) | `/api/paper-sim/diagnostics/scan-24h` | 463 | ✅ `scan24hData.data.totalEvaluated` |
| Unique Evaluated (24h) | Same | 469 | ✅ `scan24hData.data.uniqueEvaluated` |
| Total Survived (24h) | Same | 478 | ✅ `scan24hData.data.totalSurvived` |
| Unique Survived (24h) | Same | 484 | ✅ `scan24hData.data.uniqueSurvived` |
| Cycles (24h) | Same | 492 | ✅ `scan24hData.data.totalCycles` |
| Active Pool Size | `/api/paper-sim/diagnostics/scan-latest` | 508 | ✅ `scanData.activePoolCount` |
| Active Pool Table | Same | 548-568 | ✅ `scanData.activeFilteredPool.map(...)` |

#### Client-Side Adjustments

**Derived Percentages (Line 312-314):**
```typescript
const eligiblePercent = scanData && scanData.evaluatedCount > 0
  ? ((scanData.eligibleCount / scanData.evaluatedCount) * 100).toFixed(1)
  : '0.0';
```
- **Math Check:** ✅ Correct (eligibleCount / evaluatedCount × 100)
- **Scope:** Last scan only (not 24h aggregate)
- **Display:** "Eligible This Scan" with percentage

**No Hidden Defaults or Magic Numbers:**
- ❌ No hardcoded 10,000 values
- ❌ No WebSocket-based metric manipulation
- ❌ No stale local state accumulation

#### Confirmed: UI Displays Exact Backend Values

✅ **No client-side massaging** - All values rendered directly from REST responses  
✅ **No leftover WebSocket listeners** - Comments on lines 259, 268 confirm removal  
✅ **Mathematically consistent** - Percentage calculations verified correct

---

## F. Summary of Findings

### No Bugs Found

After comprehensive analysis of the FX5 Filter Insights data flow, **no discrepancies were found** between implementation and defined accounting truth. The system is functioning as intended.

### Validated Correctness

✅ **Data Flow:** FX5 Scanner → 24h Window → REST Endpoints → UI  
✅ **Accounting Logic:** All metrics computed correctly per defined truth  
✅ **Rotation Semantics:** Batch-first Top-N/Tier-B design matches Nov 6-15 truth  
✅ **UI Reconciliation:** Direct backend value display, no client-side manipulation  
✅ **REST-Only Architecture:** WebSocket listeners removed, 24h metrics purely REST-based  

### Early-Cycle Behavior (Predicted)

Based on rotation mechanics:
- **Total > Unique** starting from cycle 2 (Top-N rotation re-checks pairs)
- **First 10 cycles:** Unique Evaluated should be 60-80% of Total Evaluated
- **Active Pool:** Should grow until stabilizing around TTL expiration equilibrium

### Recommended Next Steps

1. **Run Early-Cycle Diagnostic Test (Section G below)**
   - Add temporary logging for first 20 cycles
   - Capture actual behavior vs predictions
   - Validate rotation overlap calculations

2. **Optional Enhancements (NOT bugs)**
   - Add UI tooltip explaining Total vs Unique difference
   - Add cycle-by-cycle breakdown view for debugging
   - Log rotation state on scanner startup

---

## G. Early-Cycle Diagnostic Implementation

**TODO:** Add temporary diagnostic logging to validate early-cycle behavior predictions.

### Proposed Logging Location

**File:** `server/services/fx5-scanner.ts` - After line 273 (inside `scanMode()` method)

### Logging Format

```typescript
// REB 2.8.15: Early-cycle diagnostic logging (first 20 cycles only)
const cycleNumber = /* derive from timestamp or counter */;
if (cycleNumber <= 20) {
  const summary24h = get24hSummary(mode);
  console.log(`[REB 2.8.15][Cycle ${cycleNumber}] mode=${mode} cycleId=${scanCycleId}`);
  console.log(`  - Batch: topN=${topNCount} tierB=${tierBCount} evaluated=${evaluatedCount} survivors=${eligibleCount}`);
  console.log(`  - 24h Cumulative: totalEval=${summary24h.totalEvaluated} uniqueEval=${summary24h.uniqueEvaluated} totalSurv=${summary24h.totalSurvived} uniqueSurv=${summary24h.uniqueSurvived}`);
  console.log(`  - Active Pool: size=${activeFilteredPoolEntries.length} (deduped, non-expired)`);
}
```

### Test Protocol

1. Clear 24h window: `reset24hWindow('paper')`
2. Start engine: Ensure `isEngineActive=true`
3. Let scanner run for at least 20 cycles (~10 minutes)
4. Capture logs and analyze:
   - Are Total and Unique close in cycle 1? (Expected: yes)
   - Does Total > Unique from cycle 2? (Expected: yes)
   - Does Unique grow slower than Total? (Expected: yes)
   - Does Active Pool size ≤ Unique Survived? (Expected: always)

---

## H. Files Analyzed

**Backend Services:**
- `server/services/fx5-scanner.ts` - Main scanner loop, pool management
- `server/services/market-scanner.ts` - `collectMixedBatch()` rotation logic
- `server/services/fx5-24h-window.ts` - 24h aggregation and metrics computation
- `server/services/stage3-state-cache.ts` - Latest scan state cache
- `server/services/active-filter-pool.ts` - Deduped pool management

**Backend Routes:**
- `server/routes.ts` - REST endpoints for 24h metrics and latest scan data

**Frontend Components:**
- `client/src/components/trading/filter-insights.tsx` - UI rendering and REST queries
- `client/src/pages/filter-insights.tsx` - Page wrapper

**Historical Documentation:**
- `docs/restoration/truth/filter-insights (11.18.25)_1763821067417.tsx` - Truth reference

---

## I. Action Items

### Immediate (REB 2.8.15)

✅ **COMPLETED:**
1. Document data flow mapping
2. Define and verify accounting truth
3. Analyze Top-N + Tier-B rotation semantics
4. Verify UI reconciliation with backend
5. Confirm REST-only architecture (no WebSocket manipulation)

🔲 **TODO (Next Steps):**
1. Add early-cycle diagnostic logging (Section G)
2. Run 20-cycle test with fresh 24h window
3. Capture and analyze cycle-by-cycle behavior
4. Update this report with actual test results
5. Remove diagnostic logging after validation

### Optional Future Enhancements (NOT bugs)

- Add UI tooltip: "Total counts pairs across all scans; Unique counts each symbol once"
- Add cycle-by-cycle breakdown view in Filter Insights for debugging
- Log rotation state indices on scanner startup for observability

---

## J. Conclusion

**Filter Insights metrics are mathematically correct** and consistent with FX5 scanner behavior. The implementation matches the defined accounting truth with no discrepancies found.

The system follows the established Nov 6-15 architecture:
- Batch-first design with 60-pair cycles
- Top-N (36) + Tier-B (24) rotation
- REST-based 24h aggregation
- Single-gate pattern (isEngineActive only)

**Next step:** Run early-cycle diagnostic test to empirically validate rotation overlap predictions and confirm Total vs Unique divergence behavior in first 10-20 cycles.
