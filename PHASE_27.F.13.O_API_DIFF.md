# Phase 27.F.13.O - Stage O.c: API Endpoint Diff Log

**Date**: October 23, 2025 20:40 UTC  
**Status**: DOCUMENTED - Changes Required

---

## Overview

This document details all API endpoint changes required for Phase 27.F.13.O global engine unification.

---

## Critical Endpoint Changes

### 1. POST /api/trading/start

#### Before (Per-User)
```typescript
// Request
POST /api/trading/start
Body: { mode: 'paper' | 'live' }
Headers: Authorization: Bearer <token>

// Implementation
const userId = req.user.id;
const context = await storage.getSystemContext(userId); // Per-user lookup
// Start user's personal engine
```

#### After (Global Per-Mode) ⚠️ NOT YET IMPLEMENTED
```typescript
// Request (unchanged)
POST /api/trading/start
Body: { mode: 'paper' | 'live' }
Headers: Authorization: Bearer <token>

// Implementation
const userId = req.user.id; // For audit only
const { mode } = req.body;
const context = await storage.getSystemContext(mode); // Global mode lookup

// Update with audit trail
await storage.updateSystemContext(mode, {
  isEngineActive: true,
  lastStartedBy: userId, // NEW: Audit field
  lastHeartbeat: new Date(),
  changedBy: req.user.username
});

// Start GLOBAL engine for this mode (shared by all users)
```

**Breaking Change**: YES - All users now control same engine  
**Database Impact**: Uses new audit columns  
**Current Status**: ⚠️ NOT IMPLEMENTED

---

### 2. POST /api/trading/stop

#### Before (Per-User)
```typescript
// Request
POST /api/trading/stop
Body: { mode: 'paper' | 'live' }

// Implementation
const userId = req.user.id;
const context = await storage.getSystemContext(userId);
// Stop user's personal engine
```

#### After (Global Per-Mode) ⚠️ NOT YET IMPLEMENTED
```typescript
// Request (unchanged)
POST /api/trading/stop
Body: { mode: 'paper' | 'live' }

// Implementation
const userId = req.user.id; // For audit only
const { mode } = req.body;

// Stop GLOBAL engine
await stopGlobalEngine(mode);

// Update with audit trail
await storage.updateSystemContext(mode, {
  isEngineActive: false,
  lastStoppedBy: userId, // NEW: Audit field
  changedBy: req.user.username,
  changeReason: 'User-initiated stop'
});
```

**Breaking Change**: YES - Stopping affects all users  
**Current Status**: ⚠️ NOT IMPLEMENTED

---

### 3. GET /api/trading/status

#### Before (Per-User)
```typescript
// Request
GET /api/trading/status?mode=paper

// Response
{
  "isEngineActive": true, // User's personal engine
  "mode": "paper",
  "userId": "user123"
}
```

#### After (Global Per-Mode) ⚠️ NOT YET IMPLEMENTED
```typescript
// Request (unchanged)
GET /api/trading/status?mode=paper

// Response
{
  "mode": "paper",
  "isEngineActive": true, // GLOBAL engine status
  "lastStartedBy": "user123-uuid", // NEW: Who started it
  "lastStoppedBy": null,
  "lastHeartbeat": "2025-10-23T20:00:00Z", // NEW: Health
  "state": "running" // running|starting|stopping|stopped
}
```

**Breaking Change**: NO - Response format expanded  
**Impact**: All users see SAME status  
**Current Status**: ⚠️ NOT IMPLEMENTED

---

### 4. POST /api/trading/force-stop (Admin)

#### Changes Required
- Accept `mode` parameter instead of looking up user context
- Stop global engine for specified mode
- Add `lastStoppedBy` audit with admin user ID

**Current Status**: ⚠️ NOT IMPLEMENTED

---

## New Audit Fields in Responses

All trading endpoints will now return audit information:

```typescript
{
  // ... existing fields
  "lastStartedBy": "uuid", // Who started the global engine
  "lastStoppedBy": "uuid", // Who stopped it
  "lastHeartbeat": "ISO timestamp" // Last engine health ping
}
```

---

## WebSocket Changes (Required)

### Before (Per-User Channels)
```typescript
ws.emit(`engine:status:${userId}`, status);
ws.emit(`scan:update:${userId}`, pairs);
```

### After (Mode Channels) ⚠️ NOT YET IMPLEMENTED
```typescript
ws.emit(`engine:update:${mode}`, status); // All users subscribed to mode
ws.emit(`scan:update:${mode}`, pairs);
ws.emit(`signals:update:${mode}`, signals);
ws.emit(`trades:update:${mode}`, trades);
```

**Impact**: All connected users receive same real-time updates per mode

---

## Observer Endpoint (New)

### GET /api/trading/observer

**Purpose**: Single endpoint for frontend to hydrate all global state

```typescript
GET /api/trading/observer?mode=paper

Response:
{
  "mode": "paper",
  "engine": {
    "isActive": true,
    "lastStartedBy": "uuid",
    "lastHeartbeat": "ISO"
  },
  "portfolio": { /* portfolio_state */ },
  "filteredPairs": [ /* eligible pairs */ ],
  "signals": [ /* active signals */ ],
  "openTrades": [ /* current positions */ ]
}
```

**Status**: ⚠️ NOT YET IMPLEMENTED

---

## Breaking Changes Summary

| Endpoint | Change Type | Backward Compatible | Severity |
|----------|-------------|---------------------|----------|
| POST /api/trading/start | Logic | NO | 🔴 HIGH |
| POST /api/trading/stop | Logic | NO | 🔴 HIGH |
| GET /api/trading/status | Response expanded | YES | 🟡 LOW |
| POST /api/trading/force-stop | Parameter change | NO | 🟡 MEDIUM |
| WebSocket channels | Topic structure | NO | 🔴 HIGH |

---

## Migration Path for Callers

### Frontend Changes Required

**Before**:
```typescript
// Each user has their own engine
const { data } = await apiRequest('/api/trading/start', { mode: 'paper' });
// Only affects current user
```

**After**:
```typescript
// Starts GLOBAL engine for this mode
const { data } = await apiRequest('/api/trading/start', { mode: 'paper' });
// AFFECTS ALL USERS in this mode
// Need to show who started it: data.lastStartedBy
```

**WebSocket Subscription**:
```typescript
// Before
socket.on(`engine:status:${userId}`, handleUpdate);

// After
socket.on(`engine:update:${mode}`, handleUpdate); // mode = 'paper' or 'live'
```

---

## Implementation Checklist

### Backend
- [ ] Update `/api/trading/start` to use mode-only logic
- [ ] Update `/api/trading/stop` to use mode-only logic
- [ ] Update `/api/trading/status` to return global state
- [ ] Update `/api/trading/force-stop` for mode parameter
- [ ] Implement `/api/trading/observer` endpoint
- [ ] Convert all WebSocket emits to mode-scoped topics
- [ ] Update all `getSystemContext(userId)` calls to `getSystemContext(mode)`

### Frontend
- [ ] Update start/stop button handlers
- [ ] Update WebSocket subscription logic
- [ ] Display "Started by: username" in UI
- [ ] Add confirmation modal: "This will affect all users"
- [ ] Update status polling to use mode parameter
- [ ] Implement observer endpoint hydration

---

## Security Considerations

**Multi-User Control**:
- Any authenticated user can start/stop the global engine
- Audit trail tracks who performed action
- Consider: Add RBAC check (editor/admin only)

**Recommendations**:
1. Require `requireEditor` middleware on start/stop
2. Add confirmation in UI: "Starting global engine affects all users"
3. Log all start/stop actions
4. Optional: Add cooldown timer (prevent rapid start/stop)

---

## Testing Scenarios

### Scenario 1: Multi-User Start
1. User A starts paper engine
2. User B's UI should show engine as "Active"
3. User B should see "Started by: UserA"

### Scenario 2: Concurrent Control
1. User A starts paper engine
2. User B stops paper engine (3 seconds later)
3. User A's UI should show "Stopped"
4. Audit log should show both actions

### Scenario 3: WebSocket Sync
1. User A starts paper engine
2. All connected clients (User B, C, D) should receive `engine:update:paper` event
3. All dashboards should update simultaneously

---

**Document Status**: Complete reference for API changes  
**Implementation Status**: ⚠️ 0% - Documented only, not yet implemented  
**Next Action**: Implement endpoint changes in routes.ts
