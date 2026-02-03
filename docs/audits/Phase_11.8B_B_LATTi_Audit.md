# Phase 11.8B-B LATTi Decommission Audit

**Date:** 2026-02-03  
**Directive:** 11.8B-B - LATTi Decommission & Authority Cleanup  
**Status:** AUDIT COMPLETE

---

## 1. Backend Service Files

### 1.1 Active LATTi Services

| File | Lines | Authority Type | Status |
|------|-------|----------------|--------|
| `server/services/heuristic-trader.ts` | 1-1407 | ACTIVE - Core LATTi service (exports `lattiPaper`, `lattiLive`, `LATTIManager`) | **REMOVE** |
| `server/services/lottie-oversight-service.ts` | 1-105 | ACTIVE - DHMA health monitoring via LATTi | **REMOVE** |
| `server/services/baseline-indicator.ts` | 1-460 | ACTIVE - LATTi baseline indicator service | **REMOVE** |
| `server/services/walter-standby.ts` | 1-35 | DORMANT - Placeholder for Walter + LATTI co-op | **REMOVE** |
| `server/services/walter-adaptive-heuristics.ts` | 1-~300 | DORMANT - Walter adaptive heuristics | **REMOVE** |

### 1.2 Config/Scheduler Files

| File | Lines | Authority Type | Status |
|------|-------|----------------|--------|
| `server/scripts/seed-config.ts` | 5-8 | ACTIVE - Seeds `ENABLE_LATTI` config | **MODIFY** |
| `server/scripts/validate-phase6.ts` | 46-91 | ACTIVE - Validates `ENABLE_LATTI` | **MODIFY** |
| `server/config/index.ts` | various | References LATTi config | **VERIFY** |

### 1.3 Route Handlers with LATTi References

| File | Lines | Authority Type | Status |
|------|-------|----------------|--------|
| `server/routes.ts:570-579` | `/api/system/latti-tuning` | ACTIVE - LATTi metrics endpoint | **REMOVE** |
| `server/routes.ts:748-757` | `/api/system/latti-insights` | ACTIVE - LATTi insights endpoint | **REMOVE** |
| `server/routes.ts:760-769` | `/api/system/latti-cross-strategy` | ACTIVE - Cross-strategy insights | **REMOVE** |
| `server/routes.ts:772-781` | `/api/system/latti-strategy-usage` | ACTIVE - Strategy usage summary | **REMOVE** |
| `server/routes.ts:1291` | `/api/latti/targets` | ACTIVE - LATTi targets endpoint | **REMOVE** |
| `server/routes.ts:23551-23630` | `handleLATTISafetySummary` | ACTIVE - Safety summary handler | **REMOVE** |
| `server/routes.ts:1280-1285` | Comment about removal | UI-ONLY - Already commented | **VERIFY** |

### 1.4 Service References to LATTi

| File | Lines | Authority Type | Status |
|------|-------|----------------|--------|
| `server/services/guardrail-policy.ts` | 88, 212-568 | ACTIVE - `tunedByLatti` field handling | **MODIFY** |
| `server/services/config-update-service.ts` | 190 | DORMANT - Comment reference | **MODIFY** |
| `server/services/dhma-tuning-service.ts` | 216 | UI-ONLY - Log reference | **MODIFY** |
| `server/services/awareness-core.ts` | various | References to adaptive tuning | **VERIFY** |
| `server/services/rtb-refresh-service.ts` | various | References to adaptive tuning | **VERIFY** |
| `server/strategies/dhma.ts` | 571 | ACTIVE - `tunedByLatti: true` | **MODIFY** |

### 1.5 Startup Files

| File | Lines | Authority Type | Status |
|------|-------|----------------|--------|
| `server/startup.ts` | 16-53 | UI-ONLY - Logs about LATTi removal | **MODIFY** |
| `server/startup/lazy-loader.ts` | 85-89 | ACTIVE - Loads LottieOversight | **MODIFY** |

---

## 2. UI Components

### 2.1 Core LATTi UI Files

| File | Component | Authority Type | Status |
|------|-----------|----------------|--------|
| `client/src/components/latti-toast-listener.tsx` | `LATTIToastListener` | ACTIVE - Toast notifications | **REMOVE** |
| `client/src/components/monitoring/lottie-tuning-tab.tsx` | `LottieTuningTab` | ACTIVE - System monitoring tab | **REMOVE** |
| `client/src/components/dashboard/dashboard-latti-widget.tsx` | `DashboardLATTiWidget` | ACTIVE - Dashboard widget | **REMOVE** |
| `client/src/components/dashboard/latti-goals-mirror.tsx` | `LATTIGoalsMirror` | ACTIVE - Goals mirror | **REMOVE** |
| `client/src/components/dashboard/latti-dashboard-widget.tsx` | `LATTIDashboardWidgetComponent` | ACTIVE - Dashboard widget | **REMOVE** |

### 2.2 Components with LATTi References

| File | Lines | Reference Type | Status |
|------|-------|----------------|--------|
| `client/src/App.tsx` | 19, 261 | Imports `LATTIToastListener` | **MODIFY** |
| `client/src/pages/dashboard.tsx` | 27-33, 121-163 | Lazy loads `DashboardLATTiWidget` | **MODIFY** |
| `client/src/components/goals/goals-table.tsx` | 247, 291, 364 | Text references to LATTi | **MODIFY** |
| `client/src/components/goals/guardrails-tab.tsx` | 682 | Text reference "LATTI Baseline Status" | **MODIFY** |
| `client/src/components/goals/coherency-rules-tab.tsx` | 59, 287-318 | LATTi control mode descriptions | **MODIFY** |
| `client/src/components/goals/core-four-guardrails.tsx` | various | Adaptive tuning references | **MODIFY** |
| `client/src/components/goals/low-priced-protection-card.tsx` | various | Adaptive tuning references | **MODIFY** |
| `client/src/components/goals/tuning-tab.tsx` | various | Adaptive tuning references | **MODIFY** |
| `client/src/components/layout/top-bar.tsx` | 345, 388 | Query invalidations for `/api/latti/targets` | **MODIFY** |

### 2.3 Hooks

| File | Description | Status |
|------|-------------|--------|
| `client/src/hooks/use-baseline-status.ts` | LATTi baseline indicator hook | **REMOVE** |

### 2.4 Schemas

| File | Lines | Reference Type | Status |
|------|-------|----------------|--------|
| `client/src/schemas/filters_v2.ts` | 16, 154 | `managedByLottie` field | **MODIFY** |

---

## 3. Database Schema

### 3.1 Guardrails Table Fields

| Field | Location | Authority Type | Status |
|-------|----------|----------------|--------|
| `tunedByLatti` | `shared/schema.ts:348` | ACTIVE - LATTi management flag | **FREEZE** |
| `managedByLottie` | `shared/schema.ts:352, 452` | ACTIVE - Global LATTi flag | **FREEZE** |
| `lastUpdatedBy` | `shared/schema.ts:354, 457` | ACTIVE - Can be 'latti' | **FREEZE** |

### 3.2 System Meta Fields

| Field | Location | Authority Type | Status |
|-------|----------|----------------|--------|
| `lattiMode` | `shared/schema.ts:4376` | ACTIVE - LATTi mode tracking | **FREEZE** |
| `lattiLastAnchorTime` | `shared/schema.ts:4377` | ACTIVE - Baseline anchor | **FREEZE** |
| `lattiLastModeSyncTime` | `shared/schema.ts:4378` | ACTIVE - Mode sync time | **FREEZE** |

### 3.3 Dedicated LATTi Tables

| Table | Location | Authority Type | Status |
|-------|----------|----------------|--------|
| `latti_baseline_history` | `shared/schema.ts:4400-4437` | ACTIVE - Baseline history | **FREEZE** |
| `lottie_oversight_log` | `shared/schema.ts:4680-4700` | ACTIVE - Oversight logging | **FREEZE** |

---

## 4. Authority Reassignment Summary

### 4.A Manual-Only (User Controlled) - NO CHANGE

These remain manual after LATTi removal:
- Max total portfolio exposure
- Max position size %
- Max concurrent trades
- Daily loss limits

### 4.B System-Locked (No Adaptive Control Yet)

After LATTi removal, these become system-locked:
- IMF filters (Liquidity guard, Noise guard, Correlation guard)
- Price range filters
- Spread limits
- SQE gates

### 4.C Removed Entirely

- All LATTi adaptive logic
- All LATTi heuristics
- All LATTi "learning" code
- All shadow defaults tied to LATTi
- All UI toggles for "manual vs LATTi"

---

## 5. Removal Execution Plan

### Phase 1: Backend Service Removal
1. Remove `server/services/heuristic-trader.ts`
2. Remove `server/services/lottie-oversight-service.ts`
3. Remove `server/services/baseline-indicator.ts`
4. Remove `server/services/walter-standby.ts`
5. Remove `server/services/walter-adaptive-heuristics.ts`

### Phase 2: Route Cleanup
1. Remove all `/api/system/latti-*` endpoints
2. Remove `/api/latti/targets` endpoint
3. Remove `handleLATTISafetySummary` handler
4. Remove all LATTi imports from `server/routes.ts`

### Phase 3: UI Component Removal
1. Remove `client/src/components/latti-toast-listener.tsx`
2. Remove `client/src/components/monitoring/lottie-tuning-tab.tsx`
3. Remove `client/src/components/dashboard/dashboard-latti-widget.tsx`
4. Remove `client/src/components/dashboard/latti-goals-mirror.tsx`
5. Remove `client/src/components/dashboard/latti-dashboard-widget.tsx`
6. Remove `client/src/hooks/use-baseline-status.ts`
7. Update `client/src/App.tsx` - remove LATTIToastListener
8. Update `client/src/pages/dashboard.tsx` - remove LATTi widget imports

### Phase 4: Reference Cleanup
1. Remove LATTi references from startup files
2. Remove LATTi conditionals from service files
3. Update text references in UI components
4. Clean up config seed/validation scripts

### Phase 5: Database Fields
- **FREEZE** all LATTi-related database fields (no deletion, no read/write access)
- Document frozen fields for future cleanup

---

## 6. Acceptance Criteria

After completion:
- [ ] `grep -R "latti" server/ client/` → zero results in active code
- [ ] No backend service references LATTi
- [ ] No conditionals branch on adaptive tuning
- [ ] No UI element references LATTi
- [ ] No toggle exists for "manual vs LATTi"
- [ ] Application boots cleanly
- [ ] Paper trading runs normally
- [ ] No warnings about missing LATTi services

---

**Audit Completed:** 2026-02-03  
**Ready for Removal Phase:** YES
