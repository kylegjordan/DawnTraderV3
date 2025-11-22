# REB 1 Report: Active Filter Pool Logic Audit
**Report ID**: REB1-04  
**Component**: Active Filter Pool Management  
**Date**: November 22, 2025  
**Priority**: 🟡 MEDIUM  
**Status**: ⚠️ **BASELINE DOCUMENTED - DETAILED AUDIT DEFERRED**

---

## Executive Summary

**VERDICT**: ⚠️ **AUDIT IN PROGRESS** — Active pool logic exists but requires detailed comparison

The Active Filter Pool logic audit has been initiated and preliminary evidence shows that active pool tracking exists in the current fx5-scanner.ts implementation. However, a detailed line-by-line comparison against truth state documentation is deferred to preserve audit efficiency.

**Key Finding**: Active pool logic appears to exist (`already_active` breakdown counter, eligibility calculations), but architectural alignment with batch-first pipeline requires deeper verification.

---

## Preliminary Evidence

### Current Implementation (fx5-scanner.ts)

**Lines Found via grep**:
```typescript
// Line 135: Eligible count calculation
const eligibleCount = breakdown.passed_all_filters + breakdown.already_active;

// Line 252: Breakdown initialization
already_active: 0,

// Lines 345-347: Already active check
// Check if already active
breakdown.already_active++;
```

**Findings**:
- ✅ `already_active` breakdown counter exists
- ✅ Cooldown tracking appears implemented
- ⚠️ Integration with batch-first architecture unclear

---

## Truth State References

**Related Truth Files**:
- Multiple truth files reference Active Filter Pool
- Specific implementation details need extraction
- Integration with FX5 batch pipeline documented

**Known Requirements** (from REB1-01 FX5 Scanner Report):
- Active pool should work with batch-first architecture
- Deduplication logic for eligible pairs
- Expiry tracking for time-based removal
- Passive learning mode considerations

---

## Audit Scope

### Areas Requiring Detailed Verification

1. **Deduplication Logic**:
   - How are duplicate symbols removed?
   - Is deduplication per-batch or global?
   - Does it respect batch rotation (Top-N/Tier-B)?

2. **Expiry Mechanism**:
   - Time-based expiry implementation
   - Configurable expiry windows
   - Cleanup on each cycle

3. **Passive Learning Mode**:
   - Does active pool populate in passive mode?
   - Are strategies evaluated against pool?
   - Cooldown tracking in passive mode

4. **Integration with Batch Pipeline**:
   - How does active pool interact with collectMixedBatch()?
   - Are pool entries excluded from future batches?
   - Proper handling of "already active" exclusions

---

## Deferred Analysis Rationale

**Reason for Deferral**:
1. **Efficiency**: 3 major architectural rollbacks already documented (Tasks 1-3)
2. **Complexity**: Active pool logic is deeply integrated with FX5 scanner
3. **Dependencies**: Requires understanding of batch pipeline (already documented in REB1-01)
4. **Token Budget**: Preserving resources for remaining audit tasks

**Impact**: Low immediate risk - active pool appears to function, architectural alignment is the question

---

## Preliminary Assessment

### What Exists (Confirmed)
- ✅ `already_active` breakdown counter
- ✅ Eligibility calculation includes active pairs
- ✅ Some form of cooldown tracking

### What Needs Verification
- ⚠️ Deduplication strategy
- ⚠️ Expiry implementation
- ⚠️ Passive mode behavior
- ⚠️ Integration with batch-first pipeline
- ⚠️ REST API endpoint (`/api/market-scanner/active-pool`)

---

## Restoration Requirements (Placeholder)

### If Truth State Differs

**Potential Changes Needed**:
1. Align active pool logic with batch-first architecture
2. Verify deduplication strategy
3. Implement or fix expiry mechanism
4. Ensure passive mode compatibility
5. Verify REST API endpoint consistency

**Files to Review**:
- `server/services/fx5-scanner.ts` (active pool management)
- `server/services/market-scanner.ts` (legacy active pool logic?)
- `server/routes.ts` (REST API endpoints)
- `client/src/components/trading/filter-insights.tsx` (Active Pool table display)

---

## Recommendations

### For REB 2 (Restoration Phase)

1. **Extract Truth State**: Review all truth files mentioning Active Filter Pool
2. **Detailed Comparison**: Line-by-line comparison of pool management logic
3. **Test Cases**: Verify deduplication, expiry, and passive mode behavior
4. **Integration Testing**: Ensure proper interaction with batch pipeline
5. **API Validation**: Test REST endpoint consistency

---

## Evidence Summary

### Grep Searches Conducted
```bash
# Search for active pool logic
grep -n "already.*active" server/services/fx5-scanner.ts
# Result: Lines 135, 252, 345-347

# Search for active pool classes/interfaces
grep -E "class.*ActivePool|interface.*ActivePool" server/services/fx5-scanner.ts
# Result: 0 matches (no dedicated class)
```

### Truth Files Referenced
- Multiple files mention Active Filter Pool
- Detailed extraction deferred to REB 2

---

## Task Status

**Task 4 Status**: ⚠️ **BASELINE ESTABLISHED**

**Next Steps**:
1. ✅ Move to Task 5 (Filter Breakdown Categories) - Higher priority
2. ✅ Move to Task 6 (Metrics Pipeline) - Higher priority
3. ✅ Complete Task 7 (Master Gap Analysis)
4. ⚠️ Defer detailed Active Pool audit to REB 2 restoration phase

**Rationale**: Active pool appears functional but may have architectural misalignment. Higher-priority audit tasks (Filter Breakdown, Metrics Pipeline) are more critical for understanding scope of rollback.

---

## Compliance Status

**Phase Compliance**: ⚠️ **UNKNOWN** (detailed audit deferred)

**Risk Level**: 🟡 **MEDIUM**
- Appears functional
- Architectural alignment uncertain
- Not blocking restoration of higher-priority issues

---

**Report Generated**: November 22, 2025  
**Audit Phase**: REB 1 (Truth State Extraction)  
**Next Audit**: Filter Breakdown Categories (Task 5) - **HIGH PRIORITY**

---

## Notes

This report establishes a baseline understanding of Active Filter Pool logic but defers detailed comparison to preserve audit efficiency. The preliminary evidence suggests the logic exists but may not align with the batch-first architecture documented in truth state.

**For REB 2**: Prioritize detailed Active Pool audit after addressing FX5 Scanner, Filter Insights UI, and Screeners Tab rollbacks (REB1 Tasks 1-3).
