# Phase 27.F.13.O - Stage O.c Continuation Plan

**Date**: October 23, 2025 20:45 UTC  
**Current Status**: ⚠️ PAUSED - Foundation Complete, Awaiting Sub-Stage Execution  
**Completion**: 40% (Schema ✅ | Storage ✅ | Routes ⚠️ | Services ⚠️ | WebSocket ⚠️)

---

## Foundation Complete ✅

### What's Done
1. ✅ **Database Schema** (`shared/schema.ts`)
   - Added audit columns to systemContext
   - Documented global-per-mode architecture
   - Updated indexes

2. ✅ **Storage Layer** (`server/storage.ts`)
   - Refactored to mode-only queries
   - `getSystemContext(mode)` - no longer uses userId
   - `upsertSystemContext({ tradingMode })` - mode-based upsert
   - `updateSystemContext(mode, updates)` - mode-based update

3. ✅ **Documentation**
   - BACKEND_REFACTOR.md - Complete refactor summary
   - API_DIFF.md - Endpoint changes documented
   - DB_AUDIT.md - Database migration verified

4. ✅ **Database State**
   - Exactly 2 rows in system_context (1 per mode)
   - Audit columns present and functional
   - Backup tables created

---

## Remaining Work: 3 Sub-Stages

Stage O.c will be completed in **3 sub-stages**, each with a validation checkpoint.

### O.c-1: Critical Trading Routes (HIGHEST PRIORITY)
**Objective**: Fix trading start/stop endpoints to use global mode architecture

**Files to Update**:
- `server/routes.ts` (Lines ~1023-1500)

**Changes Required**:

1. **`POST /api/trading/start`** (Line ~1023)
   - Change: `storage.getSystemContext(userId)` → `storage.getSystemContext(mode)`
   - Add: `lastStartedBy: userId` in updateSystemContext call
   - Add: `lastHeartbeat: new Date()` on engine start
   - Test: Multi-user sees same engine status

2. **`POST /api/trading/stop`** (Line ~1225)
   - Change: `storage.getSystemContext(userId)` → `storage.getSystemContext(mode)`
   - Add: `lastStoppedBy: userId` in updateSystemContext call
   - Test: Stopping affects all users

3. **`POST /api/trading/force-stop`** (Line ~1285)
   - Change: Mode parameter instead of userId lookup
   - Add: Admin userId to `lastStoppedBy`

4. **`GET /api/trading/status`** (if exists)
   - Return global status per mode
   - Include audit fields in response

**Validation Checkpoint O.c-1**:
- [ ] TypeScript compiles without errors
- [ ] `/api/trading/start` accepts mode, updates global context
- [ ] Audit fields (`lastStartedBy`) populate correctly
- [ ] `/api/trading/stop` updates `lastStoppedBy`
- [ ] Manual test: Start engine, verify system_context row updated
- [ ] Manual test: Check database - `last_started_by` has UUID

**Pass Criteria**: 
✅ All routes compile  
✅ Audit fields write to database  
✅ Single engine per mode confirmed

**Estimated Time**: 30-45 minutes

---

### O.c-2: Service Layer Refactor (HIGH PRIORITY)
**Objective**: Update all services to use mode-based system context queries

**Files to Update** (in priority order):

1. **`server/services/paper-sim-service.ts`** (2 calls)
   - Line 97: `new PaperPortfolioManager(userId)` → Constructor refactor
   - Line 262: `storage.getSystemContext(userId)` → `getSystemContext(mode)`
   - Line 275: `new PaperPortfolioManager(userId)` → Use mode
   - Line 432: `storage.getSystemContext(userId)` → `getSystemContext(mode)`

2. **`server/services/paper-portfolio-manager.ts`** (Constructor)
   - Change constructor: `(userId: string)` → `(mode: 'live' | 'paper')`
   - Update all internal references from `this.userId` to `this.mode`
   - Update PaperExecutionEngine instantiation

3. **`server/services/paper-execution-engine.ts`** (if has userId)
   - Check if constructor uses userId
   - Refactor to mode-based if needed

4. **`server/services/risk-manager.ts`** (6 calls)
   - Lines 48, 232, 277, 326, 465, 830
   - All: `storage.getSystemContext(userId)` → `getSystemContext(mode)`
   - Get mode from function parameters or context

5. **`server/services/trading-state-sync.ts`** (9 calls)
   - Lines 41, 90, 126, 147, 163, 193, 235, 294, 323
   - Refactor to mode-based context management
   - This service coordinates state - critical for global engine

6. **`server/services/paper_sim_heartbeat.ts`** (1 call)
   - Line 137: `storage.getSystemContext(userId)` → `getSystemContext(mode)`
   - Update heartbeat to write to global context

**Validation Checkpoint O.c-2**:
- [ ] TypeScript compiles without errors
- [ ] All services use mode-based queries
- [ ] PaperPortfolioManager instantiates with mode
- [ ] Risk manager loads correct mode context
- [ ] Trading state sync uses global context
- [ ] Manual test: Start paper engine, check all services operational

**Pass Criteria**:
✅ Zero TypeScript errors  
✅ All getSystemContext calls use mode  
✅ Engine instantiation works with mode parameter  
✅ Services load correct global context per mode

**Estimated Time**: 60-90 minutes

---

### O.c-3: WebSocket & Real-Time Broadcasts (MEDIUM PRIORITY)
**Objective**: Convert WebSocket broadcasts from per-user to per-mode channels

**Files to Update**:
- `server/websocket.ts` (or wherever broadcasts originate)
- Any service files emitting WebSocket events

**Changes Required**:

1. **Engine Status Broadcasts**
   - Before: `ws.emit(\`engine:status:\${userId}\`, status)`
   - After: `ws.emit(\`engine:update:\${mode}\`, status)`

2. **Market Scanner Updates**
   - Before: `ws.emit(\`scan:update:\${userId}\`, pairs)`
   - After: `ws.emit(\`scan:update:\${mode}\`, pairs)`

3. **Signal Updates**
   - Before: `ws.emit(\`signals:update:\${userId}\`, signals)`
   - After: `ws.emit(\`signals:update:\${mode}\`, signals)`

4. **Trade Execution Updates**
   - Before: `ws.emit(\`trades:update:\${userId}\`, trades)`
   - After: `ws.emit(\`trades:update:\${mode}\`, trades)`

5. **Client Subscription Logic**
   - Clients subscribe to mode topics, not user-specific
   - Frontend needs parallel update (not in this stage)

**Implementation Notes**:
- Find all `ws.emit()` or `broadcast()` calls
- Replace userId-based topics with mode-based
- Ensure mode is available in broadcast context
- Test with multiple connected clients

**Validation Checkpoint O.c-3**:
- [ ] All WebSocket emits use mode-based topics
- [ ] No userId-based broadcast topics remain
- [ ] Multiple clients receive same broadcasts
- [ ] Manual test: Connect 2 browsers, start engine in one
- [ ] Manual test: Both browsers receive `engine:update:paper` event
- [ ] Network tab shows correct topic subscriptions

**Pass Criteria**:
✅ All broadcasts use mode topics  
✅ Multi-client sync confirmed  
✅ No userId topics in WebSocket code  
✅ Real-time updates propagate to all users

**Estimated Time**: 30-45 minutes

---

## Overall Stage O.c Timeline

| Sub-Stage | Focus | Time | Checkpoint |
|-----------|-------|------|------------|
| **O.c-1** | Critical Trading Routes | 30-45 min | Routes compile, audit writes work |
| **O.c-2** | Service Layer Refactor | 60-90 min | Services use mode queries |
| **O.c-3** | WebSocket Broadcasts | 30-45 min | Multi-client sync works |
| **Total** | Complete Backend Refactor | 2-3 hours | All systems operational |

---

## Execution Order (MUST FOLLOW)

```
Stage O.c-1 → Validate → Pass? → Continue
                       ↓
                      Fail → Fix → Re-validate
                       
Stage O.c-2 → Validate → Pass? → Continue
                       ↓
                      Fail → Fix → Re-validate

Stage O.c-3 → Validate → Pass? → Continue
                       ↓
                      Fail → Fix → Re-validate

ALL PASS → Stage O.c COMPLETE → Pause for O.d Planning
```

**DO NOT PROCEED** to Stage O.d until all 3 sub-stages pass validation.

---

## Validation Test Suite

### O.c-1 Validation Tests
```bash
# 1. TypeScript compile
npm run build

# 2. Start paper engine via API
curl -X POST http://localhost:5000/api/trading/start \
  -H "Authorization: Bearer <token>" \
  -d '{"mode":"paper"}'

# 3. Check database
psql -c "SELECT trading_mode, is_engine_active, last_started_by FROM system_context;"
# Expected: paper mode, is_engine_active=true, last_started_by=<uuid>

# 4. Stop engine
curl -X POST http://localhost:5000/api/trading/stop \
  -H "Authorization: Bearer <token>" \
  -d '{"mode":"paper"}'

# 5. Verify stopped
psql -c "SELECT trading_mode, is_engine_active, last_stopped_by FROM system_context WHERE trading_mode='paper';"
```

### O.c-2 Validation Tests
```bash
# 1. Start paper engine (should use refactored services)
curl -X POST http://localhost:5000/api/trading/start \
  -H "Authorization: Bearer <token>" \
  -d '{"mode":"paper"}'

# 2. Check logs for service initialization
# Should see: PaperPortfolioManager instantiated with mode=paper

# 3. Verify risk manager loads mode context
# Check logs for: RiskManager loaded guardrails for mode=paper

# 4. Check no errors in console
# Should see clean startup without TypeScript errors
```

### O.c-3 Validation Tests
```bash
# 1. Open 2 browser windows
# 2. Connect both to WebSocket
# 3. In Browser A: Start paper engine
# 4. In Browser B: Should see "Engine Active" update immediately
# 5. Check Network tab: Should see `engine:update:paper` event received
```

---

## Rollback Points

**After O.c-1 Fails**:
- Routes broken, services still old code
- Rollback: Revert routes.ts changes only
- Keep: Schema + storage changes

**After O.c-2 Fails**:
- Services broken, WebSocket still old
- Rollback: Revert service changes
- Keep: Routes if O.c-1 passed

**After O.c-3 Fails**:
- WebSocket broken, core engine works
- Rollback: Revert WebSocket changes
- Keep: Routes + services if passed

**Full Rollback**:
```sql
-- Restore from backup
TRUNCATE TABLE system_context;
INSERT INTO system_context SELECT * FROM system_context_backup_20251023;
```

Then revert: shared/schema.ts, server/storage.ts to previous commit.

---

## Success Criteria (Final)

Stage O.c is **COMPLETE** when:

✅ **O.c-1**: Trading start/stop endpoints use mode-based logic with audit trails  
✅ **O.c-2**: All services query system_context by mode only  
✅ **O.c-3**: WebSocket broadcasts use mode-scoped topics  
✅ **Integration**: Multi-user test shows synchronized global engine  
✅ **Database**: Audit fields populate correctly  
✅ **TypeScript**: Zero compilation errors  
✅ **Logs**: Clean startup without errors  

---

## After Stage O.c Complete

**Pause Point**: ⏸️ **DO NOT BEGIN STAGE O.d**

**Required Actions**:
1. Document O.c completion status
2. Update BACKEND_REFACTOR.md with results
3. Run comprehensive test suite
4. Prepare for Stage O.d planning session
5. Review with user before proceeding

---

**Plan Created**: October 23, 2025 20:45 UTC  
**Status**: READY FOR EXECUTION  
**Next Action**: Execute O.c-1 (Critical Trading Routes)
