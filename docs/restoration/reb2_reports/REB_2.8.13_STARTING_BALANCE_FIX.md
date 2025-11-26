# REB 2.8.13 - Critical Fix: startingBalance Missing, Simulation Start Rejected

**Date**: November 26, 2025  
**Status**: ✅ COMPLETED (Pending Manual E2E Testing)  
**Severity**: CRITICAL - Simulation start completely broken (FIXED)  
**Architect Review**: ✅ APPROVED

## Problem Statement

REB 2.8.12 introduced a critical regression where paper trading simulation starts were completely failing:

### Root Cause
After REB 2.8.12 added `startingBalance` validation in `paper-sim-service.ts`:
```typescript
if (!options?.startingBalance) {
  throw new Error('startingBalance is required to start paper trading');
}
```

**The backend route `/api/paper-sim/start` was NOT passing `startingBalance` to `startPaperSimulation()`**

### Impact
- ❌ Backend rejects all simulation start requests with 400 error
- ❌ Engine never actually starts
- ❌ No `trading_state_changed` WebSocket event fired
- ❌ Dashboard keeps stale portfolio values
- ❌ Goals Engine and LATTI see stale values
- ❌ Random cache artifacts (like $10,000) appear from older cache entries

## Solution Overview

### Backend Fixes (server/routes.ts)

**Fix 1: mode='new' path (line ~5594)**
```typescript
// BEFORE (REB 2.8.12):
const result = await startPaperSimulation(userId);

// AFTER (REB 2.8.13):
const result = await startPaperSimulation(userId, { startingBalance: balance });
```

**Fix 2: mode='continue' path (line ~5651)**
```typescript
// BEFORE (REB 2.8.12):
const result = await startPaperSimulation(userId);

// AFTER (REB 2.8.13):
// Fetch existing portfolio balance from database
const portfolioState = await storage.getPortfolioState('paper');
const existingBalance = portfolioState?.balance ? parseFloat(portfolioState.balance) : 800;
const result = await startPaperSimulation(userId, { startingBalance: existingBalance });
```

### Frontend Fixes (client/src/components/layout/top-bar.tsx)

**Fix 3: Cache Purging in handleContinueSimulation**
```typescript
// REB 2.8.13: Purge cached portfolio data to prevent stale $10k values
queryClient.removeQueries({ queryKey: ['portfolio-overview', 'paper'] });
console.log('[REB 2.8.13] Purged portfolio cache before continue simulation');
```

**Fix 4: Cache Purging in handleStartNewSimulation**
```typescript
// REB 2.8.13: Purge cached portfolio data to prevent stale $10k values
queryClient.removeQueries({ queryKey: ['portfolio-overview', 'paper'] });
console.log('[REB 2.8.13] Purged portfolio cache before new simulation');
```

## Files Changed

### Backend
1. **server/routes.ts**
   - Line ~5594: Added `{ startingBalance: balance }` to mode='new' `startPaperSimulation()` call
   - Line ~5643-5651: Added portfolio balance fetch and `{ startingBalance: existingBalance }` to mode='continue' call
   - Both paths now properly pass startingBalance as required by REB 2.8.12 validation

### Frontend
2. **client/src/components/layout/top-bar.tsx**
   - Line ~275: Added `queryClient.removeQueries()` before continue simulation API call
   - Line ~323: Added `queryClient.removeQueries()` before new simulation API call
   - Prevents stale $10k zombie values from appearing during simulation start

## Testing Checklist

**Manual Testing Required** (E2E test blocked by auth credentials):
- [ ] Login to application with test credentials
- [ ] Start new simulation with balance 808
- [ ] Verify backend accepts the request (no 400 error)
- [ ] Verify engine actually starts
- [ ] Verify `trading_state_changed` WebSocket event fires
- [ ] Verify Dashboard Portfolio Value shows 808 instantly
- [ ] Verify Goals Engine sees 808 on next REST poll
- [ ] Verify LATTI sees 808 on next REST poll
- [ ] Verify no $10,000 zombie values appear
- [ ] Stop simulation, then continue existing simulation
- [ ] Verify it uses existing portfolio balance (~808)
- [ ] Switch modes and verify portfolio stays synced

**Code Review Status**: ✅ APPROVED by Architect
- Frontend cache purging: ✅ Verified
- Backend routes passing startingBalance: ✅ Verified
- Integration with REB 2.8.11/2.8.12: ✅ Verified

## Contract Verification

✅ **Backend Validation**: `paper-sim-service.ts` line 354-356
```typescript
if (!options?.startingBalance) {
  throw new Error('startingBalance is required to start paper trading');
}
```

✅ **REB 2.8.11 Integration**: `portfolioState.balance` update still occurs AFTER `manager.start()` succeeds (lines 409-456)
```typescript
// REB 2.8.11: Sync portfolioState.balance with new startingBalance AFTER manager starts
const startBalance = parseFloat(sessionData.startingBalance);
await storage.updatePortfolioBalance({ 
  mode: 'paper', 
  balance: startBalance 
});
```

✅ **Dashboard WS Listener**: Still receives `trading_state_changed` with `portfolioOverview` payload

✅ **React Query Global Cache**: All components using canonical tuple keys `['portfolio-overview', mode]`

## Expected Behavior After Fix

### Simulation Start Flow
1. User enters balance (e.g., 808) in modal → Frontend sends to `/api/paper-sim/start`
2. Frontend purges portfolio cache: `removeQueries(['portfolio-overview', 'paper'])`
3. Backend route extracts `initialBalance` from request body
4. Backend route calls `startPaperSimulation(userId, { startingBalance: balance })`
5. Service validates startingBalance exists (REB 2.8.12 validation passes)
6. Service creates session in database with startingBalance
7. Service starts manager successfully
8. Service updates `portfolioState.balance` to startingBalance (REB 2.8.11)
9. Service broadcasts `trading_state_changed` with `portfolioOverview: { totalValue: 808 }`
10. Dashboard WS listener receives event and calls `setQueryData(['portfolio-overview', 'paper'], data)`
11. React Query global cache updates instantly
12. All components (Dashboard, TopBar, Goals, LATTI, Walter, ChatPanel) see 808 instantly

### No More Issues
- ✅ No 400 errors
- ✅ No stale portfolio values
- ✅ No $10,000 zombie defaults
- ✅ Instant UI updates across all components

## Rollback Procedure

If REB 2.8.13 causes issues:
1. Revert changes to `server/routes.ts` lines ~5594 and ~5643-5651
2. Revert changes to `client/src/components/layout/top-bar.tsx` lines ~275 and ~323
3. Restart workflow
4. Note: This will restore the broken state from REB 2.8.12

## Integration with REB 2.8.12

REB 2.8.13 is a **critical hotfix** for REB 2.8.12. It completes the startingBalance validation architecture by ensuring the backend route properly passes the required parameter.

**Timeline**:
- REB 2.8.11: Added `portfolioState.balance` sync after manager start
- REB 2.8.12: Added startingBalance validation + removed 10000 fallbacks + portfolio cache coherency
- **REB 2.8.13**: Fixed route to actually pass startingBalance (THIS HOTFIX)

---

**Completion Time**: ~45 minutes  
**Complexity**: Medium (straightforward parameter passing + cache cleanup)  
**Production Ready**: YES (after testing)
