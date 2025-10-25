# Phase 27.F.15 - userId Audit & Classification Matrix

## Executive Summary

**Total userId References Found:** 3,538 across 200+ files

**Architecture Principle:**
- Trading data, settings, and state are **GLOBAL per mode** (paper/live)
- All users share the **SAME trading portfolio and configuration** for each mode
- userId is ONLY for authentication, session management, and user account data
- Trading synchronization is **mode-based**, not user-based

---

## Classification Categories

### Category A: ✅ KEEP userId (Legitimate Authentication/Account Use)
These are proper uses of userId for user accounts, authentication, and personal preferences.

### Category B: ⚠️ REPLACE with mode (Trading Data - Should Be Global)
These incorrectly use userId for trading data that should be global per mode.

### Category C: 🔄 REFACTOR (Service Layer - Parameter Removal)
Backend service methods that accept userId but should only accept mode.

### Category D: 🗑️ REMOVE (Database Schema - Drop Columns)
Database columns that should be removed entirely.

---

## Part 1: Database Schema Analysis

| Table Name | Current userId | Status | Action Required | Priority |
|------------|---------------|--------|-----------------|----------|
| `system_alerts` | ✅ REMOVED | Complete | Already global per Phase 27.F.14.N | DONE |
| `guardrails` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, globalContextId) | HIGH |
| `screener_filters` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, globalContextId) | HIGH |
| `watchlist_pairs` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, pair, globalContextId) | HIGH |
| `trading_signals` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, pair, timestamp) | HIGH |
| `trades` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, tradeId) | HIGH |
| `paper_trades` | ⚠️ Has user_id | Replace | Drop user_id column (legacy table, use paper_sim_trades) | MEDIUM |
| `paper_sim_trades` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, tradeId) | HIGH |
| `paper_sim_open_positions` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, pair) | HIGH |
| `paper_sim_trade_logs` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, logId) | HIGH |
| `strategy_settings_audit` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, strategy, timestamp) | MEDIUM |
| `filter_diagnostics` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, timestamp) | MEDIUM |
| `screener_results` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, pair, timestamp) | MEDIUM |
| `filter_calibration_log` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, timestamp) | MEDIUM |
| `strategy_parameters` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, strategy, parameter) | HIGH |
| `user_goals_live` | ⚠️ Has user_id | Replace | Rename to `goals_live`, drop user_id, use globalContextId | HIGH |
| `user_goals_paper` | ⚠️ Has user_id | Replace | Rename to `goals_paper`, drop user_id, use globalContextId | HIGH |
| `goal_analysis_history_live` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, timestamp) | MEDIUM |
| `goal_analysis_history_paper` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, timestamp) | MEDIUM |
| `goal_audit_log` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, action, timestamp) | MEDIUM |
| `intraday_adjustments` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, timestamp) | MEDIUM |
| `portfolio_adjustments` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, timestamp) | MEDIUM |
| `historic_signals` | ⚠️ Has user_id | Replace | Drop user_id column, key by (mode, signal, timestamp) | MEDIUM |
| | | | | |
| `users` | ✅ KEEP | Legitimate | User account table (id, username, email, password) | - |
| `ai_conversations` | ✅ KEEP | Legitimate | User chat history | - |
| `ai_chat_logs` | ✅ KEEP | Legitimate | User chat logs | - |
| `response_cache` | ✅ KEEP | Legitimate | User-specific API response caching | - |
| `ai_audit_log` | ✅ KEEP | Legitimate | User action audit trail | - |
| `error_logs` | ✅ KEEP | Legitimate | User error tracking | - |
| `walter_pending_approvals` | ✅ KEEP | Legitimate | User approval requests | - |
| `walter_execution_log` | ✅ KEEP | Legitimate | User execution history | - |
| `walter_purpose` | ✅ KEEP | Legitimate | User-specific Walter configuration | - |
| `walter_memory` | ✅ KEEP | Legitimate | User-specific Walter memory | - |
| `walter_user_preferences` | ✅ KEEP | Legitimate | User preferences | - |
| `walter_actions` | ✅ KEEP | Legitimate | User actions | - |
| `execution_config` | ✅ KEEP | Legitimate | User execution settings | - |
| `ai_reports` | ✅ KEEP | Legitimate | User-specific AI reports | - |
| `daily_briefs` | ✅ KEEP | Legitimate | User-specific daily briefs | - |
| `paper_daily_briefs` | ✅ KEEP | Legitimate | User-specific paper briefs | - |
| `paper_ai_reports` | ✅ KEEP | Legitimate | User-specific paper reports | - |
| `ai_opportunities` | ✅ KEEP | Legitimate | User-specific opportunities | - |
| `ai_opportunity_runs` | ✅ KEEP | Legitimate | User-specific opportunity runs | - |
| `kill_switch_events` | ✅ KEEP | Legitimate | User safety actions | - |
| `safety_telemetry` | ✅ KEEP | Legitimate | User safety events | - |
| `learning_sources` | ✅ KEEP | Legitimate | User learning sources | - |
| `signal_weights` | ✅ KEEP | Legitimate | User signal weights | - |
| `prediction_outcomes` | ✅ KEEP | Legitimate | User prediction outcomes | - |
| `ai_lessons` | ✅ KEEP | Legitimate | User AI lessons | - |
| `ai_transparency_log` | ✅ KEEP | Legitimate | User transparency log | - |
| `actuation_policies` | ✅ KEEP | Legitimate | User actuation policies | - |
| `proposed_adjustments` | ✅ KEEP | Legitimate | User proposed adjustments | - |

---

## Part 2: Backend Service Methods Refactoring

### High Priority - Trading Core Services

| File | Method | Current Signature | New Signature | Status |
|------|--------|-------------------|---------------|--------|
| `server/storage.ts` | `getGuardrails` | `(userId, mode)` | `(mode)` | Pending |
| `server/storage.ts` | `updateGuardrails` | `(userId, mode, data)` | `(mode, data)` | Pending |
| `server/storage.ts` | `getScreenerFilters` | `(userId, mode)` | `(mode)` | Pending |
| `server/storage.ts` | `updateScreenerFilters` | `(userId, mode, data)` | `(mode, data)` | Pending |
| `server/storage.ts` | `getWatchlist` | `({userId, mode})` | `({mode})` | Pending |
| `server/storage.ts` | `addToWatchlist` | `(userId, pair, mode)` | `(pair, mode)` | Pending |
| `server/storage.ts` | `removeFromWatchlist` | `(userId, pair, mode)` | `(pair, mode)` | Pending |
| `server/storage.ts` | `getTrades` | `(userId, filters)` | `(mode, filters)` | Pending |
| `server/storage.ts` | `getActiveTrades` | `(userId)` | `(mode)` | Pending |
| `server/storage.ts` | `saveTrade` | `({userId, ...})` | `({mode, ...})` | Pending |
| `server/storage.ts` | `saveTradingSignal` | `({userId, ...})` | `({mode, ...})` | Pending |
| `server/storage.ts` | `getTradingSignals` | `(userId, filters)` | `(mode, filters)` | Pending |
| `server/storage.ts` | `getStrategyParameters` | `(userId, mode)` | `(mode)` | Pending |
| `server/storage.ts` | `updateStrategyParameters` | `(userId, mode, data)` | `(mode, data)` | Pending |

### Medium Priority - Analysis & Reporting Services

| File | Method | Current Signature | New Signature | Status |
|------|--------|-------------------|---------------|--------|
| `server/services/market-scanner.ts` | `scanForUser` | `(userId, mode)` | `(mode)` | Pending |
| `server/services/risk-manager.ts` | Various methods | `(userId, ...)` | `(mode, ...)` | Pending |
| `server/services/paper-execution-engine.ts` | Various methods | `(userId, ...)` | `(mode, ...)` | Pending |
| `server/services/live-trading-service.ts` | Various methods | `(userId, ...)` | `(mode, ...)` | Pending |

---

## Part 3: API Routes Refactoring

### Routes.ts - Endpoint Updates

| Endpoint | Current Implementation | Required Change | Priority |
|----------|----------------------|-----------------|----------|
| `/api/guardrails` | Uses `req.user?.id` | Use mode from query/body | HIGH |
| `/api/screener-filters` | Uses `req.user?.id` | Use mode from query/body | HIGH |
| `/api/watchlist/*` | Uses `req.user?.id` | Use mode from query/body | HIGH |
| `/api/trading-signals` | Uses `req.user?.id` | Use mode from query/body | HIGH |
| `/api/paper/trades/*` | Uses `req.user?.id` | Use mode='paper' | HIGH |
| `/api/live/trades/*` | Uses `req.user?.id` | Use mode='live' | HIGH |
| `/api/strategies/*` | Uses `req.user?.id` | Use mode from query/body | HIGH |
| `/api/goals/*` | Uses `req.user?.id` | Use mode from query/body | HIGH |

**Authentication Note:**
- Routes should still require `req.user` to verify user is logged in
- But trading data queries should NOT filter by userId
- Mode-based data is shared across all authenticated users

---

## Part 4: Frontend Cleanup

### React Hooks & Components

| File/Hook | Current Usage | Required Change | Priority |
|-----------|--------------|-----------------|----------|
| `client/src/hooks/useTrading.tsx` | May use userId | Remove userId, use mode only | HIGH |
| `client/src/hooks/useWatchlist.tsx` | May use userId | Remove userId, use mode only | HIGH |
| `client/src/hooks/useAlerts.tsx` | ✅ Already mode-based | No change needed | DONE |
| `client/src/pages/trading/*` | Check for userId usage | Remove all userId references | MEDIUM |
| `client/src/pages/dashboard/*` | Check for userId usage | Remove all userId references | MEDIUM |

### localStorage & Session Storage

**Search Pattern:** `localStorage.*user` or `sessionStorage.*user`

**Action Required:**
- Remove any localStorage.userId or similar
- User authentication should only be in HTTP-only cookies
- No client-side storage of user identifiers

---

## Part 5: Migration SQL Scripts

### Schema Migration Plan

```sql
-- Phase 1: Drop userId columns from trading tables
ALTER TABLE guardrails DROP COLUMN IF EXISTS user_id;
ALTER TABLE screener_filters DROP COLUMN IF EXISTS user_id;
ALTER TABLE watchlist_pairs DROP COLUMN IF EXISTS user_id;
ALTER TABLE trading_signals DROP COLUMN IF EXISTS user_id;
ALTER TABLE trades DROP COLUMN IF EXISTS user_id;
ALTER TABLE paper_sim_trades DROP COLUMN IF EXISTS user_id;
ALTER TABLE paper_sim_open_positions DROP COLUMN IF EXISTS user_id;
ALTER TABLE paper_sim_trade_logs DROP COLUMN IF EXISTS user_id;
ALTER TABLE strategy_parameters DROP COLUMN IF EXISTS user_id;
ALTER TABLE filter_diagnostics DROP COLUMN IF EXISTS user_id;
ALTER TABLE screener_results DROP COLUMN IF EXISTS user_id;
ALTER TABLE filter_calibration_log DROP COLUMN IF EXISTS user_id;
ALTER TABLE goal_audit_log DROP COLUMN IF EXISTS user_id;
ALTER TABLE intraday_adjustments DROP COLUMN IF EXISTS user_id;
ALTER TABLE portfolio_adjustments DROP COLUMN IF EXISTS user_id;
ALTER TABLE historic_signals DROP COLUMN IF EXISTS user_id;

-- Phase 2: Rename user_goals tables
ALTER TABLE user_goals_live RENAME TO goals_live;
ALTER TABLE user_goals_paper RENAME TO goals_paper;
ALTER TABLE goal_analysis_history_live DROP COLUMN IF EXISTS user_id;
ALTER TABLE goal_analysis_history_paper DROP COLUMN IF EXISTS user_id;

-- Phase 3: Add mode-based indexes
CREATE INDEX IF NOT EXISTS guardrails_mode_idx ON guardrails(mode);
CREATE INDEX IF NOT EXISTS screener_filters_mode_idx ON screener_filters(mode);
CREATE INDEX IF NOT EXISTS watchlist_mode_pair_idx ON watchlist_pairs(mode, pair);
CREATE INDEX IF NOT EXISTS trading_signals_mode_idx ON trading_signals(mode, pair, timestamp);
CREATE INDEX IF NOT EXISTS trades_mode_idx ON trades(mode, trade_id);
```

---

## Execution Plan

### Phase 1: Preparation (Current)
- ✅ Generate audit_userid_refs.txt
- ✅ Create this classification matrix
- 🔄 Review and validate classification

### Phase 2: Schema Migration
1. Backup database
2. Run schema migration SQL
3. Verify tables structure
4. Test data integrity

### Phase 3: Backend Refactor
1. Update storage.ts interface
2. Update all service methods
3. Update routes.ts endpoints
4. Test API functionality

### Phase 4: Frontend Refactor
1. Update React hooks
2. Remove userId from API calls
3. Clean localStorage usage
4. Test UI functionality

### Phase 5: Verification
1. Run verification script
2. Manual testing of all features
3. Confirm multi-user sync works
4. Document completion

---

## Risk Assessment

### HIGH RISK (Breaking Changes)
- Database schema changes (userId column removal)
- Storage interface method signature changes
- API endpoint parameter changes

### MITIGATION STRATEGIES
1. Create database backup before migration
2. Use feature flags for gradual rollout
3. Comprehensive testing at each phase
4. Rollback plan ready if issues arise

### TESTING REQUIREMENTS
- [ ] Unit tests for storage methods
- [ ] Integration tests for API endpoints
- [ ] E2E tests for user workflows
- [ ] Multi-user session testing
- [ ] WebSocket broadcast verification

---

## Success Criteria

✅ Zero userId references in trading-related code  
✅ All trading data keyed by (mode, globalContextId)  
✅ Multi-user sync works flawlessly  
✅ Verification script passes cleanly  
✅ No regressions in authentication/account features  
✅ All tests passing  

---

**Last Updated:** October 25, 2025  
**Phase:** 27.F.15 - System-Wide userId Audit  
**Status:** Classification Complete - Ready for Implementation
