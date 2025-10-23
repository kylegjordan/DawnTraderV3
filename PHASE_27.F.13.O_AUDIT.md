# Phase 27.F.13.O - Stage O.a: Pre-Migration Audit Report

**Date**: October 23, 2025 19:57 UTC  
**Status**: ✅ AUDIT COMPLETE

---

## Executive Summary

### ✅ PASS Criteria Met
- **Settings code**: Zero userId dependencies in guardrails/screener/strategy readers
- **Global settings**: Already operating global-per-mode (Phase 27.F.13.M complete)
- **Safe to proceed**: All pre-conditions satisfied for Stage O.b schema migration

### ⚠️ Migration Required
- **system_context**: 4 rows (per-user) → needs consolidation to 2 rows (per-mode)
- **Engine managers**: Currently per-user → needs refactor to global per-mode
- **Runtime data**: 32 paper_sim_sessions across 3 users → will archive

---

## 1. Code Audit Results

### A. Settings Code (Global per Mode) ✅
```
storage.getGuardrails({ userId, ... })       : 0 matches
storage.getScreenerFilters({ userId, ... })  : 0 matches  
storage.getStrategySettings({ userId, ... }) : 0 matches
```

**Conclusion**: Phase 27.F.13.M successfully eliminated ALL userId from settings queries. Settings are truly global per mode.

### B. Engine Manager Registries ⚠️
**Current State**: Per-user engine instances
- `PaperPortfolioManager(userId)` created at lines 97, 275 in paper-sim-service.ts
- No Map-based registry found (uses global singleton pattern)

**Required Change**: Remove userId parameter, use mode-only instantiation

### C. API Endpoints Analysis
**Current**: `/api/trading/start` uses `userId` from `req.user.id`
**Target**: Keep userId for audit trail only (`last_started_by`), use `mode` for engine selection

---

## 2. Database State Audit

### Current Row Counts

| Table | Rows | user_id Present | Global Rows | Per-User Rows | Status |
|-------|------|-----------------|-------------|---------------|--------|
| **system_context** | 4 | YES (PK) | 0 | 4 | ⚠️ MIGRATE |
| **guardrails** | 2 | NO (NULL) | 2 | 0 | ✅ READY |
| **screener_filters** | 2 | NO (NULL) | 2 | 0 | ✅ READY |
| **portfolio_state** | 2 | NO | 2 (global) | 0 | ✅ READY |
| **paper_sim_sessions** | 32 | YES | - | 32 | ⚠️ ARCHIVE |
| **paper_sim_trades** | 0 | YES | - | 0 | ✅ EMPTY |
| **paper_sim_open_positions** | 0 | YES | - | 0 | ✅ EMPTY |
| **watchlist_pairs** | 1249 | YES | - | 1249 | ⚠️ ARCHIVE |

### system_context Current State
```
4 rows across 4 users (ce50e56b, 6c591801, 14e0809e, 3ace5ebb)
- 3 paper mode (2 active, 1 inactive)
- 1 live mode (inactive)
```

**Target State**: 2 rows total
- 1 row: mode='paper', is_engine_active=false
- 1 row: mode='live', is_engine_active=false

---

## 3. Dependencies Found

### Files Requiring Refactor (Stage O.c)

1. **server/services/paper-sim-service.ts**
   - Lines 97, 275: `new PaperPortfolioManager(userId)` → `new PaperPortfolioManager(mode)`
   - Remove per-user session logic
   - Implement mode-only global manager

2. **server/routes.ts**
   - `/api/trading/start`: Add `last_started_by` audit field
   - `/api/trading/stop`: Add `last_stopped_by` audit field
   - Remove user-specific engine lookup

3. **server/services/paper-portfolio-manager.ts**
   - Constructor: `userId` parameter → remove or make optional
   - Use mode for state isolation instead

---

## 4. Archive Strategy

### Tables to Archive (Stage O.b)
Create `_user_archive` tables for:
- `paper_sim_sessions` → `paper_sim_sessions_user_archive` (32 rows)
- `paper_sim_trades` → `paper_sim_trades_user_archive` (0 rows, but structure preserved)
- `paper_sim_open_positions` → `paper_sim_open_positions_user_archive` (0 rows)
- `watchlist_pairs` → `watchlist_pairs_user_archive` (1249 rows)

### Data Not Archived
- Settings tables (already global)
- `portfolio_state` (already global with global_context_id='default')

---

## 5. Risk Assessment

### Low Risk ✅
- Settings migration: Already complete (Phase 27.F.13.M)
- No active trades or positions to migrate
- Portfolio state already using global context

### Medium Risk ⚠️
- system_context consolidation: Need to select "canonical" row per mode from 4 existing
- Engine manager refactor: Changing fundamental architecture
- Watchlist has 1249 per-user pairs - needs archive strategy

### Mitigation
- Database backup before Stage O.b
- Archive all per-user runtime data before cleanup
- Keep shadow columns for rollback capability

---

## 6. Gate 0 PASS/FAIL Decision

### ✅ PASS Criteria
- [x] Zero settings code paths depend on userId (audit/trail only)
- [x] Settings tables (guardrails, screeners) operate global-per-mode
- [x] No active per-user runtime state blocking migration
- [x] Clear refactor path identified

### Decision: **PASS** ✅

**Recommendation**: Proceed to Stage O.b (Schema Migration)

---

## Next Steps (Stage O.b)

1. Create database backup (Neon snapshot)
2. Add audit columns to system_context (`last_started_by`, `last_stopped_by`)
3. Archive per-user runtime tables
4. Consolidate system_context to 2 canonical rows (1 per mode)
5. Generate `/workspace/PHASE_27.F.13.O_DB_AUDIT.md`

---

**Audit Completed**: October 23, 2025  
**Auditor**: Replit Agent  
**Gate 0 Status**: ✅ PASS - Safe to proceed
