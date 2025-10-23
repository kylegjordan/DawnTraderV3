# Phase 27.F.13.O - Stage O.c: Backend Refactor Summary

**Date**: October 23, 2025 20:35 UTC  
**Stage**: O.c - Backend Refactor (IN PROGRESS)  
**Status**: ⚠️ PARTIAL - Critical path in progress

---

## Objectives

Transform backend code from **per-user engine instances** to **global-per-mode architecture**:
- ONE engine instance per mode (paper/live) shared across all users
- Mode-only business logic (userId for audit trail only)
- Audit fields for tracking start/stop actions
- WebSocket broadcasts scoped by mode

---

## Changes Completed ✅

### 1. Schema Layer (shared/schema.ts)
**File**: `shared/schema.ts:3781-3806`

**Changes**:
- Updated `systemContext` table schema documentation
- Added new audit columns:
  - `lastStartedBy VARCHAR` - Tracks which user started engine
  - `lastStoppedBy VARCHAR` - Tracks which user stopped engine
  - `lastHeartbeat TIMESTAMPTZ` - Engine health monitoring
- Removed `.unique()` constraint from `userId` (now audit-only)
- Added new index on `isEngineActive`
- Documented that exactly 2 rows should exist (1 per mode)

**Impact**: Schema now matches database state after O.b migration

---

### 2. Storage Layer (server/storage.ts)
**Files Modified**: `server/storage.ts:583-588, 3353-3389`

#### Interface Changes (IStorage)
```typescript
// BEFORE (per-user)
getSystemContext(userId: string): Promise<SystemContext | undefined>;
upsertSystemContext(data: Partial<InsertSystemContext> & { userId: string }): Promise<SystemContext>;
updateSystemContext(userId: string, updates: Partial<SystemContext>): Promise<SystemContext>;

// AFTER (global per-mode)
getSystemContext(mode: 'live' | 'paper'): Promise<SystemContext | undefined>;
upsertSystemContext(data: Partial<InsertSystemContext> & { tradingMode: 'live' | 'paper' }): Promise<SystemContext>;
updateSystemContext(mode: 'live' | 'paper', updates: Partial<SystemContext>): Promise<SystemContext>;
```

#### Implementation Changes
- `getSystemContext`: Queries by `tradingMode` instead of `userId`
- `upsertSystemContext`: Uses `tradingMode` as unique key
- `updateSystemContext`: Updates by `mode` parameter

**Impact**: All future system_context queries will be mode-based

---

## Changes In Progress 🔄

### 3. API Routes (server/routes.ts)
**Critical Endpoints**: `/api/trading/start`, `/api/trading/stop`, `/api/trading/status`

**Required Changes**:
1. **Start Endpoint** (`/api/trading/start`):
   - Accept `mode` from request body
   - Remove per-user engine lookup
   - Set `last_started_by = req.user.id` (audit trail)
   - Update global system_context for that mode
   - Return single global engine status

2. **Stop Endpoint** (`/api/trading/stop`):
   - Accept `mode` from request body
   - Stop global engine for that mode
   - Set `last_stopped_by = req.user.id` (audit trail)
   - Update global system_context

3. **Status Endpoint** (`/api/trading/status`):
   - Accept `mode` query parameter
   - Return single global status for requested mode
   - All users see same status

**Current State**: 
- Lines 1023-1500 have per-user logic
- 7+ calls to `storage.getSystemContext(userId)` need updating

---

### 4. Paper Sim Service (server/services/paper-sim-service.ts)
**File**: `server/services/paper-sim-service.ts`

**Required Changes**:
1. Remove per-user manager instantiation
2. Global manager keyed by mode only
3. Update database session queries to be mode-scoped
4. Remove userId from PaperPortfolioManager constructor calls

**Current State**:
- Lines 97, 275: `new PaperPortfolioManager(userId)` - needs mode
- 2 calls to `storage.getSystemContext(userId)` need updating

---

### 5. Paper Portfolio Manager (server/services/paper-portfolio-manager.ts)
**File**: `server/services/paper-portfolio-manager.ts:36-53`

**Required Changes**:
```typescript
// BEFORE
constructor(userId: string) {
  this.userId = userId;
  this.executionEngine = new PaperExecutionEngine(userId);
  ...
}

// AFTER
constructor(mode: 'live' | 'paper') {
  this.mode = mode;
  this.executionEngine = new PaperExecutionEngine(mode);
  ...
}
```

**Impact**: Core engine manager becomes mode-based

---

## Files Requiring Updates (Discovered)

**High Priority** (Breaks trading functionality):
1. ✅ `server/storage.ts` - COMPLETE
2. ⚠️ `server/routes.ts` - IN PROGRESS
3. ⚠️ `server/services/paper-sim-service.ts` - PENDING
4. ⚠️ `server/services/paper-portfolio-manager.ts` - PENDING
5. ⚠️ `server/services/paper-execution-engine.ts` - PENDING (if has userId)

**Medium Priority** (Related services):
6. `server/services/trading-state-sync.ts` - 9 calls to getSystemContext(userId)
7. `server/services/risk-manager.ts` - 6 calls to getSystemContext(userId)
8. `server/services/paper_sim_heartbeat.ts` - 1 call to getSystemContext(userId)

**Low Priority** (Diagnostic/reporting):
9. Other services with isolated getSystemContext calls

---

## WebSocket Updates (Pending)

**Current State**: Not yet implemented

**Required Changes**:
- Broadcast on `engine:update:{mode}` instead of per-user
- Broadcast on `scan:update:{mode}`
- Broadcast on `signals:update:{mode}`
- Broadcast on `trades:update:{mode}`

**Location**: `server/websocket.ts` or websocket broadcast calls in services

---

## Migration Strategy

### Phase 1: Core Trading Path ✅ DONE
- [x] Schema updates
- [x] Storage interface/implementation

### Phase 2: Critical Endpoints ⚠️ IN PROGRESS
- [ ] Update `/api/trading/start` for mode-only
- [ ] Update `/api/trading/stop` for mode-only
- [ ] Update `/api/trading/status` for mode-only
- [ ] Add audit trail writes (last_started_by, last_stopped_by)

### Phase 3: Engine Managers ⚠️ PENDING
- [ ] Refactor PaperPortfolioManager for mode
- [ ] Refactor PaperExecutionEngine for mode
- [ ] Update paper-sim-service for global managers

### Phase 4: Supporting Services ⚠️ PENDING
- [ ] Update trading-state-sync.ts
- [ ] Update risk-manager.ts
- [ ] Update heartbeat monitoring

### Phase 5: WebSocket & Broadcasts ⚠️ PENDING
- [ ] Mode-scoped WebSocket channels
- [ ] Update all broadcast calls

---

## Breaking Changes Summary

| Component | Old Behavior | New Behavior | Impact |
|-----------|--------------|--------------|--------|
| **system_context** | Per-user (4+ rows) | Global per-mode (2 rows) | Database |
| **getSystemContext** | `(userId)` | `(mode)` | All callers |
| **Engine instances** | One per user | One per mode | Architecture |
| **API start/stop** | Per-user control | Global control with audit | Endpoints |
| **WebSocket** | Per-user topics | Per-mode topics | Frontend |

---

## Rollback Capability

**Database**: ✅ Backup tables exist (`system_context_backup_20251023`)  
**Code**: ⚠️ Breaking changes in progress - Git commit recommended  
**Schema**: ⚠️ Drizzle schema changed - May need manual rollback

---

## Testing Requirements

**Before Stage O.d**:
1. Verify `/api/trading/start` works with mode parameter
2. Verify `/api/trading/stop` works with mode parameter
3. Verify audit fields populate correctly
4. Multi-user test: Two users see same engine status
5. WebSocket broadcasts reach all connected clients

---

## Next Steps

**Immediate** (Complete Stage O.c):
1. Fix `/api/trading/start` endpoint (routes.ts)
2. Fix `/api/trading/stop` endpoint (routes.ts)
3. Fix `/api/trading/status` endpoint (routes.ts)
4. Update PaperPortfolioManager constructor
5. Update paper-sim-service manager instantiation
6. Test basic start/stop flow

**Follow-up** (Before O.d):
7. Update all remaining getSystemContext calls
8. Implement WebSocket mode-scoped broadcasts
9. Full integration test with multi-user scenarios

---

**Refactor Started**: October 23, 2025 20:10 UTC  
**Status**: Schema ✅ | Storage ✅ | Routes ⚠️ | Services ⚠️ | WebSocket ⚠️  
**Completion**: ~40% (2 of 5 major components)
