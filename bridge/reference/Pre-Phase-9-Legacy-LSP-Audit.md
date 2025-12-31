# Pre-Phase 9 Comprehensive Audit Report

**Date:** December 30, 2025  
**Scope:** Paper Trading Engine (FX5 Scanner → Trade Closure + Goals Engine)  
**Excludes:** Dashboard components  
**Purpose:** Identify legacy references and LSP errors for safe cleanup before Phase 9

---

# PART 1: LEGACY SYSTEM AUDIT

## 1.1 Explicitly Marked Legacy Files

### 1.1.1 `.legacy.*` Files (4 Files)

| File | Size | Purpose | Current Usage |
|------|------|---------|---------------|
| `server/services/filtered-pairs.legacy.service.ts` | 217 lines | Original pair filtering service | **ACTIVE** - Still imported by `market-evaluation.ts` for UI analytics |
| `server/services/kraken-websocket-adapter.legacy.ts` | 2,638 lines | WebSocket v1 adapter | **INACTIVE** - Not imported anywhere in active code |
| `server/services/market-data-ws.legacy.ts` | 295 lines | WebSocket v1 market data | **INACTIVE** - Not imported anywhere in active code |
| `client/src/components/trading/legacy/rtb-queue-panel.legacy.tsx` | 337 lines | RTB queue UI panel | **INACTIVE** - Moved to legacy folder, not imported |

### 1.1.2 Deprecation Risk Assessment

| File | Risk Level | Reason | Safe to Deprecate? |
|------|------------|--------|-------------------|
| `filtered-pairs.legacy.service.ts` | **MEDIUM** | Still actively imported by `market-evaluation.ts` for UI summary widgets | NO - Requires migration of MarketEvaluationService first |
| `kraken-websocket-adapter.legacy.ts` | **LOW** | Not imported, WS v2 in production | YES - Can be commented/removed safely |
| `market-data-ws.legacy.ts` | **LOW** | Not imported, WS v2 in production | YES - Can be commented/removed safely |
| `rtb-queue-panel.legacy.tsx` | **LOW** | Already in legacy folder, not imported | YES - Can be removed safely |

---

## 1.2 Deprecated Services Still Referenced

### 1.2.1 RiskManager Class (HIGH PRIORITY)

**Status:** Deprecated in Phase 8.8.3-H4  
**Replacement:** `checkGuardrailRisk()` from `trade-safety.ts`

**Current References (12 locations):**

| File | Line(s) | Type | Risk |
|------|---------|------|------|
| `server/routes.ts` | 13, 88, 12793, 12796 | Import + Instantiation | HIGH - Used in multiple API endpoints |
| `server/test-guardrails.ts` | 14, 34 | Import + Instantiation | LOW - Test file only |
| `server/services/paper-sim-diagnostic.ts` | 8, 69, 74 | Import + Instantiation | MEDIUM - Diagnostic service |
| `server/services/heuristic-trader.ts` | 124-125 | Dynamic import | MEDIUM - Used for sizing calculations |
| `server/services/behavioral-template.ts` | 3, 5 | Import + Instantiation | MEDIUM - Behavioral analysis |
| `server/services/trading-state-sync.ts` | 211-212 | Dynamic import (live mode) | MEDIUM - Live balance fetching |
| `server/services/daily-brief.ts` | 2, 39, 42 | Import + Instantiation | LOW - Daily brief generation |

**Warning Message:** Constructor logs `[8.8.3-H4][DEPRECATED] RiskManager instantiated. Please migrate to checkGuardrailRisk() from trade-safety.ts`

**Migration Strategy:**
1. Replace `RiskManager.checkPreTradeRisk()` → `checkGuardrailRisk()` from `trade-safety.ts`
2. Replace `RiskManager.calculatePositionSize()` → Direct guardrail-based sizing
3. Remove imports and instantiations after migration
4. Keep `RiskManager` class as deprecated stub for backward compatibility during transition

---

### 1.2.2 FilteredPairsService (MEDIUM PRIORITY)

**Status:** Deprecated in Phase 8.8.7  
**Replacement:** `activeFilterPool.getActivePool(mode)` from `active-filter-pool.ts`

**Current References (2 active locations):**

| File | Line(s) | Purpose | Risk |
|------|---------|---------|------|
| `server/services/market-evaluation.ts` | 18, 41, 45, 78-85 | UI analytics display | MEDIUM - Affects Filter Insights UI |

**Migration Strategy:**
1. `MarketEvaluationService` can be refactored to use `activeFilterPool` for consistency
2. Keep `FilteredPairsService` for backward compatibility until UI migration complete
3. Mark file as `DO NOT USE for signal generation` (already done)

---

### 1.2.3 ConfigBob/BobCore Routing (LOW PRIORITY)

**Status:** Optional routing layer (Phase 7.4)  
**Purpose:** Transparent config routing with caching

**Locations (routes.ts):**
- Lines 46, 1206-1226 - `/api/guardrails` routing
- Lines 3358-3376 - `/api/screeners` routing
- Lines 5784-5792 - `/api/system/health` routing
- Lines 9567-9845 - Cache invalidation calls
- Lines 10186-10190 - `/api/paper-sim/status` routing

**Risk:** LOW - BobCore is an enhancement layer, not a legacy system. Falls back gracefully if disabled.

---

## 1.3 Deprecated API Endpoints

### 1.3.1 Explicitly Deprecated Endpoints

| Endpoint | Method | Line | Deprecation Tag | Replacement |
|----------|--------|------|-----------------|-------------|
| `/api/guardrails-v2/kill-switch/reset` | POST | 1801 | REB 8.8.3-KS-B | Auto-cleared on `/api/trading/start` |
| `/api/settings` | PUT | 1172 | Phase 41F-L.E2E-PURGE | Use mode-level guardrails |

### 1.3.2 Legacy Fields Validation

**Location:** `server/routes.ts` lines 1438-1453

The system includes `validateNoLegacyKeys()` function that blocks legacy field submissions:
- Rejects requests with deprecated field names
- Returns HTTP 422 with `LEGACY_FIELD_BLOCKED` error
- Provides replacement field guidance

---

## 1.4 Walter System References

### 1.4.1 Walter Service Files (20 files)

Walter is **intentionally isolated** since Phase 0 (documented in project history). All Walter services are preserved but disconnected from real-time trading.

**Files in `server/services/walter-*.ts`:**
```
walter-memory.ts
walter-ops-engine.ts
walter-intent-gateway.ts
walter-data-pipeline.ts
walter-cognitive-layer.ts
walter-tts.ts
walter-response-templates.ts
walter-reference-tracker.ts
walter-reasoning-templates.ts
walter-purpose.ts
walter-personality.ts
walter-patch-analyst.ts
walter-knowledge-refresh.ts
walter-ingest.ts
walter-health-monitor.ts
walter-feedback.ts
walter-expert-corpus.ts
walter-chat-lifecycle.ts
walter-adaptive-heuristics.ts
walter-standby.ts
```

**Risk:** LOW - These are intentionally preserved for Phase 13 restoration. Do NOT deprecate.

### 1.4.2 Walter References in Trading Services

| File | Import From | Purpose |
|------|-------------|---------|
| `semantic-correlation.ts` | walter-* | Isolated semantic analysis |
| `event-broker.ts` | walter-* | Event routing (isolated) |
| `ai-opportunities.ts` | walter-* | AI opportunity generation |
| `ai-analyst.ts` | walter-* | AI analysis features |
| `context-refresh-coordinator.ts` | walter-* | Context management |

**Risk:** LOW - These imports are for isolated Walter features, not real-time trading dependencies.

---

## 1.5 WebSocket v1 References

### 1.5.1 Hardcoded v1 URLs

| File | Line | URL | Status |
|------|------|-----|--------|
| `market-data-ws.legacy.ts` | 44 | `wss://ws.kraken.com` | LEGACY FILE - Not active |
| `kraken-websocket-adapter.legacy.ts` | 163 | `wss://ws.kraken.com` | LEGACY FILE - Not active |

**Current Production:** Using `wss://ws.kraken.com/v2` in active adapter.

**Risk:** LOW - Legacy files are not imported.

---

## 1.6 Goals Engine Analysis

### 1.6.1 Goals Engine Page Structure

**File:** `client/src/pages/goals-engine.tsx` (133 lines)

**Tabs:**
1. Goals - `GoalsEngineTab`, `AdaptiveRiskAdvisor`, `PresetsGrid`
2. Guardrails - `CoreFourGuardrails`, `LowPricedProtectionCard`
3. Screeners - `ScreenerFiltersTab`, `FiltersWithOverride`
4. Strategies - `StrategiesTab`
5. Coherency - `CoherencyRulesTab`
6. Purpose - `WalterPurposeTab` ⚠️ **Walter dependency**
7. Tuning - `TuningTab`

### 1.6.2 Goals Engine Server Component

**File:** `server/services/goals-learning-engine.ts`

**Status:** Active - Part of the adaptive learning system.

### 1.6.3 Walter Purpose Tab

**Risk:** MEDIUM - The "Purpose" tab (`WalterPurposeTab`) references Walter's purpose/personality system. This is intentional and preserved for future Phase 13 restoration. Do NOT deprecate.

---

## 1.7 Summary: Safe Deprecation Candidates

### Immediate (Quick Wins)

| Item | File(s) | Action | Risk |
|------|---------|--------|------|
| WS v1 Legacy Adapter | `kraken-websocket-adapter.legacy.ts` | Add deprecation header, move to `_deprecated/` folder | LOW |
| Market Data WS v1 | `market-data-ws.legacy.ts` | Add deprecation header, move to `_deprecated/` folder | LOW |
| RTB Queue Panel | `rtb-queue-panel.legacy.tsx` | Already in legacy folder, can be deleted | LOW |

### Requires Migration First

| Item | File(s) | Blocker | Effort |
|------|---------|---------|--------|
| FilteredPairsService | `filtered-pairs.legacy.service.ts` | `market-evaluation.ts` import | MEDIUM (2-3 hours) |
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

## 2.1 Error Statistics

| Metric | Count |
|--------|-------|
| **Total TypeScript Errors** | 638 |
| **Property/Assignment Errors (TS2339, TS2322, TS2345, TS2304)** | 447 (70%) |

### 2.1.1 Errors by File (Top 15)

| Rank | File | Error Count |
|------|------|-------------|
| 1 | `server/routes.ts` | 211 |
| 2 | `server/storage.ts` | 66 |
| 3 | `server/test-guardrails.ts` | 25 |
| 4 | `server/services/unified-core.ts` | 21 |
| 5 | `server/scripts/duplicate-live-to-paper.ts` | 17 |
| 6 | `server/services/autonomy-scheduler.ts` | 16 |
| 7 | `server/services/walter-chat-lifecycle.ts` | 13 |
| 8 | `server/services/ai-analyst.ts` | 13 |
| 9 | `server/services/stage-b-validator.ts` | 12 |
| 10 | `server/services/asset-capabilities.ts` | 11 |
| 11 | `server/migrations/goals-canonicalization-backfill.ts` | 10 |
| 12 | `server/test-resilience-phase2.ts` | 9 |
| 13 | `client/src/components/system/enhanced-system-monitoring.tsx` | 8 |
| 14 | `server/services/autonomy-controller.ts` | 8 |
| 15 | `server/utils/stabilization-controller.ts` | 8 |

---

## 2.2 Quick Wins (Simple Fixes)

### 2.2.1 Category A: Missing Type Annotations (Est. Fix Time: 30 min)

**Root Cause:** Variables declared without explicit types, TypeScript infers `unknown` or `{}`.

**Examples:**
```
client/src/components/ai/audit-log-viewer.tsx(88,19): error TS2322: Type 'unknown' is not assignable to type 'ReactNode'.
client/src/components/ai/error-log-viewer.tsx(128,27): error TS2322: Type 'unknown' is not assignable to type 'ReactNode'.
```

**Fix Pattern:**
```typescript
// Before
const data = response.data;

// After
const data = response.data as ExpectedType;
// Or
const data: ExpectedType = response.data;
```

**Files to Fix:**
- `client/src/components/ai/audit-log-viewer.tsx` (1 error)
- `client/src/components/ai/error-log-viewer.tsx` (1 error)

---

### 2.2.2 Category B: Missing Interface Properties (Est. Fix Time: 1 hour)

**Root Cause:** Interface definitions missing properties that code expects.

**Examples:**
```
client/src/components/alerts/alert-banner.tsx(53,82): error TS2339: Property 'timestamp' does not exist on type 'WebSocketMessage'.
client/src/pages/settings.tsx(80,34): error TS2339: Property 'walterMemoryDepth' does not exist on type 'TradingSettings'.
```

**Fix Pattern:** Add missing properties to interface definitions.

**Files to Fix:**
- Update `WebSocketMessage` interface to include `timestamp`
- Update `TradingSettings` interface to include Walter memory fields
- Update `enhanced-system-monitoring.tsx` interfaces for `reflections`, `audits`, `sessions`, `stats`, `agents`, `summary`, `logs`, `trustRecords`

---

### 2.2.3 Category C: Null/Undefined Parameter Issues (Est. Fix Time: 1 hour)

**Root Cause:** Passing nullable values to functions expecting non-null parameters.

**Examples:**
```
server/services/paper-sim-diagnostic.ts(132,34): error TS2345: Argument of type 'string | null' is not assignable to parameter of type 'string'.
server/services/paper-sim-service.ts(627,43): error TS2345: Argument of type 'string | null | undefined' is not assignable to parameter of type 'string'.
```

**Fix Pattern:**
```typescript
// Before
someFunction(nullableValue);

// After
someFunction(nullableValue ?? 'default');
// Or
if (nullableValue) {
  someFunction(nullableValue);
}
```

**Core Trading Files to Fix:**
- `server/services/paper-sim-diagnostic.ts` (5 errors)
- `server/services/paper-sim-service.ts` (1 error)
- `server/services/vts-runner.ts` (1 error)

---

### 2.2.4 Category D: Missing Imports/Declarations (Est. Fix Time: 30 min)

**Root Cause:** Using variables not in scope.

**Examples:**
```
server/services/paper-48hr-simulation.ts(418,32): error TS2304: Cannot find name 'settings'.
server/services/paper-daily-brief.ts(340,30): error TS2304: Cannot find name 'openai'.
server/services/paper-metrics.ts(57,57): error TS2304: Cannot find name 'mode'.
```

**Fix Pattern:** Add missing imports or declare the missing variable.

**Files to Fix:**
- `server/services/paper-48hr-simulation.ts` (2 errors - `settings` undefined)
- `server/services/paper-daily-brief.ts` (1 error - `openai` undefined)
- `server/services/paper-metrics.ts` (2 errors - `mode` undefined)

---

### 2.2.5 Category E: Function Argument Count Mismatch (Est. Fix Time: 45 min)

**Root Cause:** Calling functions with wrong number of arguments.

**Examples:**
```
server/services/paper-portfolio-manager.ts(65,59): error TS2554: Expected 1 arguments, but got 2.
server/services/paper-daily-brief.ts(86,66): error TS2554: Expected 1 arguments, but got 2.
```

**Fix Pattern:** Update function calls to match signatures, or update function signatures.

**Files to Fix:**
- `server/services/paper-portfolio-manager.ts` (5 errors)
- `server/services/paper-daily-brief.ts` (6 errors)

---

## 2.3 Complex Fixes (Require Careful Attention)

### 2.3.1 Category F: routes.ts Type Mismatches (211 errors)

**Root Cause:** Multiple issues in the massive routes file:
1. `req.user.tradingMode` property doesn't exist on type (20+ occurrences)
2. Drizzle ORM query builder type mismatches
3. Zod schema validation issues
4. Property existence checks on response types

**Complexity:** HIGH - This file is 21,000+ lines and is the central API routing hub.

**Recommended Approach:**
1. Do NOT attempt bulk fixes
2. Address errors incrementally during related feature work
3. Consider routes refactoring into smaller modules

---

### 2.3.2 Category G: storage.ts Schema Mismatches (66 errors)

**Root Cause:** Drizzle schema definitions don't match expected column types.

**Complexity:** HIGH - Database schema changes require careful migration.

**Recommended Approach:**
1. Schema audit required before fixing
2. Never change primary key types
3. Use `npm run db:push` for safe schema sync

---

### 2.3.3 Category H: Walter Service Type Issues (13 errors in walter-chat-lifecycle.ts)

**Root Cause:** Walter services have evolved type requirements not updated.

**Complexity:** MEDIUM - Walter is isolated, but fixes could affect Phase 13 restoration.

**Recommended Approach:**
1. Low priority - Walter is not in production path
2. Fix during Phase 13 planning

---

### 2.3.4 Category I: Cron/Job Type Issues

**Example:**
```
server/jobs/feed-integrity-auto-check.ts(16,10): error TS2503: Cannot find namespace 'cron'.
```

**Root Cause:** Missing type declarations for node-cron.

**Fix:** Add `@types/node-cron` or type assertions.

---

## 2.4 Quick Wins Summary

### Recommended Order of Fixes

| Priority | Category | Files | Est. Time | Impact |
|----------|----------|-------|-----------|--------|
| 1 | C - Null/Undefined | Core trading services | 1 hour | Prevents runtime nulls |
| 2 | D - Missing Declarations | paper-*, metrics | 30 min | Fixes undefined refs |
| 3 | E - Argument Count | paper-portfolio, paper-brief | 45 min | Fixes function calls |
| 4 | A - Type Annotations | UI components | 30 min | Fixes React rendering |
| 5 | B - Interface Properties | settings, alerts | 1 hour | Fixes type safety |

**Total Quick Win Estimate:** 3-4 hours

---

## 2.5 Root Cause Analysis (Preventing Recurrence)

### 2.5.1 Pattern: Nullable Database Fields

**Issue:** Database columns with `nullable: true` return `Type | null`, but downstream code expects non-null.

**Prevention:**
```typescript
// In schema definitions, consider:
column.notNull().default('value')

// In code, always handle nullability:
const value = dbResult.column ?? defaultValue;
```

### 2.5.2 Pattern: Dynamic Imports Lose Type Information

**Issue:** Using `await import('./module')` loses type inference.

**Prevention:**
```typescript
// Instead of:
const { RiskManager } = await import('./risk-manager');

// Use static imports when possible:
import { RiskManager } from './risk-manager';
```

### 2.5.3 Pattern: Interface Drift

**Issue:** Interfaces updated in one place but not others.

**Prevention:**
- Define shared types in `@shared/schema.ts`
- Use single source of truth for API response types
- Run `tsc --noEmit` in CI/CD pipeline

---

# PART 3: RECOMMENDATIONS

## 3.1 Immediate Actions (Before Phase 9)

1. **Move inactive legacy files to `_deprecated/` folder:**
   - `kraken-websocket-adapter.legacy.ts`
   - `market-data-ws.legacy.ts`
   - `rtb-queue-panel.legacy.tsx`

2. **Fix Quick Win LSP Errors (Categories A-E):**
   - Start with core trading services
   - Est. time: 3-4 hours

3. **Add header comments to remaining legacy-in-use files:**
   - `filtered-pairs.legacy.service.ts` - Already has deprecation header
   - `risk-manager.ts` - Add migration path header

## 3.2 Phase 9 Considerations

1. **RiskManager Migration:** Plan for systematic replacement across 12 locations
2. **FilteredPairsService Migration:** Refactor MarketEvaluationService
3. **routes.ts Modularization:** Consider splitting into smaller route files

## 3.3 Do Not Touch

1. **Walter services (20 files):** Preserved for Phase 13
2. **ConfigBob/BobCore:** Active enhancement, not legacy
3. **Goals Learning Engine:** Active system

---

**Document Created:** December 30, 2025  
**Status:** Audit Complete - Awaiting Review  
**Next Steps:** User approval for Quick Win fixes
