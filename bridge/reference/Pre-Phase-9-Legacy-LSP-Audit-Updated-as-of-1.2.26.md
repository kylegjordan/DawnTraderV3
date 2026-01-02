# Pre-Phase 9 Comprehensive Audit Report
## Updated with Phase 9 Completion Notes

**Original Date:** December 30, 2025  
**Updated:** January 02, 2026  
**Scope:** Paper Trading Engine (FX5 Scanner → Trade Closure + Goals Engine)  
**Excludes:** Dashboard components  
**Purpose:** Identify legacy references and LSP errors for safe cleanup before Phase 9

---

# PHASE 9 FIX SUMMARY TABLE

## All Fixes Made Before, During, and After Phase 9

| Fix ID | Phase | Category | File(s) | Issue | Resolution | Status |
|--------|-------|----------|---------|-------|------------|--------|
| F-001 | Pre-9 | Legacy File | `kraken-websocket-adapter.legacy.ts` | Inactive WS v1 adapter | Moved to `_deprecated/`, then deleted in 9.8.B | ✅ DELETED |
| F-002 | Pre-9 | Legacy File | `market-data-ws.legacy.ts` | Inactive WS v1 market data | Moved to `_deprecated/`, then deleted in 9.8.B | ✅ DELETED |
| F-003 | Pre-9 | Legacy File | `rtb-queue-panel.legacy.tsx` | Inactive RTB queue UI | Moved to `_deprecated/`, then deleted in 9.8.B | ✅ DELETED |
| F-004 | 9.7 | Guardrails | Multiple files (11) | Dollar-based risk values | Migrated to `guardrails_v2` with percentage-based fields | ✅ COMPLETE |
| F-005 | 9.7 | Deprecated Method | `storage.ts` | `getGuardrails()` still accessible | Throws error, forces use of `getGuardrailsV2()` | ✅ COMPLETE |
| F-006 | 9.7 | Deprecated Method | `storage.ts` | `upsertGuardrails()` still accessible | Throws error, forces use of `upsertGuardrailsV2()` | ✅ COMPLETE |
| F-007 | 9.8.C | FilteredPairsService | `market-evaluation.ts` | Using deprecated FilteredPairsService | Refactored to use `UnifiedFilterGateway` | ✅ COMPLETE |
| F-008 | 9.8.B | Legacy File | `filtered-pairs.legacy.service.ts` | Deprecated but still imported | Deleted after UnifiedFilterGateway migration | ✅ DELETED |
| F-009 | 9.8.D | Null Handling | `paper-sim-service.ts:631` | Potential null reference in portfolio state | Added null coalescing and validation | ✅ FIXED |
| F-010 | 9.9 | Type Interface | `cwqi-service.ts` | `costTotal` field deprecated | Replaced with `friction`, `rawEV`, `netEV` | ✅ COMPLETE |
| F-011 | 9.9 | Parity Test | `parity.test.ts` | Tests used `costTotal` | Updated to use `friction` and `netEV` | ✅ FIXED |
| F-012 | 9.6 | Missing Constants | Multiple files | Hardcoded math constants | Centralized in `SYSTEM_GUARDS` | ✅ COMPLETE |
| F-013 | Post-9 | Documentation | Canonical files | Missing Phase 9 history | Created `Phase_9_Implementation_History.md` | ✅ COMPLETE |

---

## Fixes by Category

### Legacy File Deletions (9.8.B)

| File | Original Location | Lines | Deletion Date |
|------|-------------------|-------|---------------|
| `filtered-pairs.legacy.service.ts` | `server/services/` | 217 | Jan 02, 2026 |
| `rtb-queue-panel.legacy.tsx` | `client/src/components/_deprecated/` | 337 | Jan 02, 2026 |
| `market-data-ws.legacy.ts` | `server/_deprecated/` | 295 | Jan 02, 2026 |
| `kraken-websocket-adapter.legacy.ts` | `server/_deprecated/` | 2,638 | Jan 02, 2026 |

**Total Lines Removed:** 3,487 lines of legacy code

### Guardrails v2 Migration (9.7)

| File | Changes Made |
|------|--------------|
| `server/storage.ts` | Added `getGuardrailsV2()`, `upsertGuardrailsV2()`, deprecated legacy methods |
| `server/services/trade-safety.ts` | Migrated to use `portfolioRiskPerTradePct` |
| `server/services/goal-feasibility.ts` | Migrated to percentage-based calculations |
| `server/services/heuristic-trader.ts` | Updated guardrails access |
| `server/services/baseline-indicator.ts` | Updated guardrails access |
| `server/services/config-update-service.ts` | Added `updateGuardrailsV2()` |
| `server/services/execution-policy-controller.ts` | Migrated to v2 fields |
| `server/services/micro-execution-service.ts` | Migrated to v2 fields |
| `server/services/state-awareness.ts` | Updated guardrails queries |
| `server/services/bob-config.ts` | Updated config routing |
| `server/routes.ts` | Updated API endpoints for v2 |

### CWQI Service Updates (9.9)

| Change | Before | After |
|--------|--------|-------|
| Cost field | `costTotal` | `friction`, `rawEV`, `netEV` |
| Gate logic | `ev > 0` | `netEV > 0` |
| Score calculation | Used raw EV | Uses Net EV with friction |
| Friction source | Inline calculation | `calculateFriction()` helper |

---

# PART 1: LEGACY SYSTEM AUDIT

## 1.1 Explicitly Marked Legacy Files

### 1.1.1 `.legacy.*` Files (4 Files) - **ALL DELETED IN 9.8.B**

| File | Size | Purpose | Final Status |
|------|------|---------|--------------|
| `server/services/filtered-pairs.legacy.service.ts` | 217 lines | Original pair filtering service | ✅ **DELETED** - Replaced by UnifiedFilterGateway |
| `server/services/kraken-websocket-adapter.legacy.ts` | 2,638 lines | WebSocket v1 adapter | ✅ **DELETED** - WS v2 in production |
| `server/services/market-data-ws.legacy.ts` | 295 lines | WebSocket v1 market data | ✅ **DELETED** - WS v2 in production |
| `client/src/components/trading/legacy/rtb-queue-panel.legacy.tsx` | 337 lines | RTB queue UI panel | ✅ **DELETED** - Moved to _deprecated, then removed |

### 1.1.2 Deprecation Risk Assessment - **POST-PHASE 9 STATUS**

| File | Original Risk | Phase 9 Action | Current Status |
|------|---------------|----------------|----------------|
| `filtered-pairs.legacy.service.ts` | MEDIUM | 9.8.C - Created UnifiedFilterGateway | ✅ DELETED |
| `kraken-websocket-adapter.legacy.ts` | LOW | 9.8.B - Garbage Collection | ✅ DELETED |
| `market-data-ws.legacy.ts` | LOW | 9.8.B - Garbage Collection | ✅ DELETED |
| `rtb-queue-panel.legacy.tsx` | LOW | 9.8.B - Garbage Collection | ✅ DELETED |

---

## 1.2 Deprecated Services Still Referenced - **UPDATED STATUS**

### 1.2.1 RiskManager Class

**Original Status:** Deprecated in Phase 8.8.3-H4  
**Phase 9 Status:** Still present, lower priority for Phase 10  
**Replacement:** `checkGuardrailRisk()` from `trade-safety.ts`

**Current References (12 locations):** Unchanged - scheduled for Phase 10 cleanup

| File | Line(s) | Type | Phase 9 Action |
|------|---------|------|----------------|
| `server/routes.ts` | 13, 88, 12793, 12796 | Import + Instantiation | Deferred to Phase 10 |
| `server/test-guardrails.ts` | 14, 34 | Import + Instantiation | Test file - low priority |
| `server/services/paper-sim-diagnostic.ts` | 8, 69, 74 | Import + Instantiation | Deferred to Phase 10 |
| `server/services/heuristic-trader.ts` | 124-125 | Dynamic import | Deferred to Phase 10 |
| `server/services/behavioral-template.ts` | 3, 5 | Import + Instantiation | Deferred to Phase 10 |
| `server/services/trading-state-sync.ts` | 211-212 | Dynamic import | Deferred to Phase 10 |
| `server/services/daily-brief.ts` | 2, 39, 42 | Import + Instantiation | Deferred to Phase 10 |

---

### 1.2.2 FilteredPairsService - **RESOLVED IN 9.8.C**

**Original Status:** Deprecated in Phase 8.8.7  
**Phase 9 Resolution:** ✅ **FULLY MIGRATED AND DELETED**

**Migration Details:**
1. Created `server/services/unified-filter-gateway.ts` wrapping ActiveFilterPoolService
2. Updated `server/services/market-evaluation.ts` to use UnifiedFilterGateway
3. Deleted `server/services/filtered-pairs.legacy.service.ts`

---

### 1.2.3 ConfigBob/BobCore Routing

**Status:** No changes in Phase 9 - Still active enhancement layer  
**Risk:** LOW - Not legacy, continues to function as intended

---

## 1.3 Deprecated API Endpoints

### 1.3.1 Guardrails v2 Enforcement (Phase 9.7)

| Endpoint | Status | Phase 9 Change |
|----------|--------|----------------|
| `/api/guardrails` (v1) | BLOCKED | Throws error, redirects to v2 |
| `/api/guardrails-v2/*` | ACTIVE | Now the only valid guardrails API |

---

## 1.4 Walter System References

**Phase 9 Status:** No changes - Intentionally preserved for Phase 13  
**Note:** All 20 Walter service files remain isolated but functional

---

## 1.5 WebSocket v1 References - **RESOLVED**

| File | Phase 9 Action |
|------|----------------|
| `market-data-ws.legacy.ts` | ✅ DELETED in 9.8.B |
| `kraken-websocket-adapter.legacy.ts` | ✅ DELETED in 9.8.B |

**Current Production:** Using `wss://ws.kraken.com/v2` exclusively

---

## 1.6 Goals Engine Analysis

**Phase 9 Status:** No structural changes  
**Note:** Walter Purpose Tab preserved for Phase 13

---

## 1.7 Summary: Safe Deprecation Candidates - **UPDATED**

### Completed in Phase 9

| Item | File(s) | Action Taken | Date |
|------|---------|--------------|------|
| WS v1 Legacy Adapter | `kraken-websocket-adapter.legacy.ts` | DELETED | Jan 02, 2026 |
| Market Data WS v1 | `market-data-ws.legacy.ts` | DELETED | Jan 02, 2026 |
| RTB Queue Panel | `rtb-queue-panel.legacy.tsx` | DELETED | Jan 02, 2026 |
| FilteredPairsService | `filtered-pairs.legacy.service.ts` | MIGRATED + DELETED | Jan 02, 2026 |

### Remaining for Phase 10

| Item | File(s) | Blocker | Effort |
|------|---------|---------|--------|
| RiskManager Class | `risk-manager.ts` | 12 import locations | HIGH (1-2 days) |

### Do NOT Deprecate

| Item | Reason |
|------|--------|
| Walter services (20 files) | Preserved for Phase 13 restoration |
| WalterPurposeTab | Intentional Goals Engine feature |
| ConfigBob/BobCore | Active enhancement layer, not legacy |
| Goals Learning Engine | Active adaptive learning system |

---

# PART 2: LSP ERROR AUDIT

## 2.1 Error Statistics - **UPDATED AFTER PHASE 9**

| Metric | Pre-Phase 9 | Post-Phase 9 | Change |
|--------|-------------|--------------|--------|
| **Total TypeScript Errors** | 638 | ~620 | -18 |
| **Legacy File Errors** | ~50 | 0 | -50 (files deleted) |

### 2.1.1 Phase 9 LSP Fixes

| File | Errors Fixed | Fix Type |
|------|--------------|----------|
| `cwqi-service.ts` | 4 | Interface update (costTotal → friction/netEV) |
| `parity.test.ts` | 2 | Test assertions updated |
| `paper-sim-service.ts` | 1 | Null handling (9.8.D) |
| Legacy files (4) | ~50 | Files deleted |

---

## 2.2 Quick Wins - **UPDATED STATUS**

### 2.2.1 Category C: Null/Undefined Parameter Issues

**9.8.D Fix Applied:**
- `server/services/paper-sim-service.ts:631` - Added null coalescing

**Remaining:** Other files in this category still need attention in Phase 10

### 2.2.2 Categories A, B, D, E

**Status:** Deferred to Phase 10 - Not blocking core functionality

---

## 2.3 Complex Fixes - **PHASE 10 CANDIDATES**

### 2.3.1 Category F: routes.ts Type Mismatches (211 errors)

**Phase 9 Status:** No changes - Deferred to routes refactoring initiative

### 2.3.2 Category G: storage.ts Schema Mismatches (66 errors)

**Phase 9 Status:** Partial improvement via guardrails_v2 migration

### 2.3.3 Category H: Walter Service Type Issues

**Phase 9 Status:** No changes - Deferred to Phase 13

---

# PART 3: RECOMMENDATIONS - **UPDATED**

## 3.1 Phase 9 Completed Actions ✅

1. **Legacy file cleanup:** 4 files deleted (3,487 lines removed)
2. **Guardrails v2 migration:** 11 files updated
3. **UnifiedFilterGateway:** Created and deployed
4. **CWQI friction standardization:** Complete
5. **Parity tests:** All passing

## 3.2 Phase 10 Recommendations

1. **RiskManager Migration:** Systematic replacement across 12 locations
2. **routes.ts Modularization:** Consider splitting into smaller route files
3. **LSP Quick Wins:** Complete Categories A-E fixes

## 3.3 Do Not Touch

1. **Walter services (20 files):** Preserved for Phase 13
2. **ConfigBob/BobCore:** Active enhancement, not legacy
3. **Goals Learning Engine:** Active system

---

# PHASE 9 VERIFICATION

## Test Suite Summary

| Test Category | Count | Status |
|---------------|-------|--------|
| CWQI Unit Tests | 26 | ✅ ALL PASSING |
| Parity Tests | 5 | ✅ ALL PASSING |
| Phase 9 Verification | 6 | ✅ ALL PASSING |

**Run Commands:**
```bash
npx vitest run server/tests/unit/cwqi.test.ts
npx vitest run server/tests/integration/parity.test.ts
npx tsx server/scripts/verify-phase-9.ts
```

---

**Original Document Created:** December 30, 2025  
**Updated:** January 02, 2026  
**Status:** Phase 9 Complete - Ready for Phase 10  
**Next Review:** Upon Phase 10 completion
