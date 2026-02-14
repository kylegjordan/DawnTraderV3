# Phase 35.2B - Observed Anomalies

**Date:** October 31, 2025  
**Test Phase:** Phase 35.2B Active Trading Performance Validation  
**Classification:** Deferred Fixes — Post-Audit  
**Priority:** Low (Cosmetic) | Medium (Functional)

---

## Overview

During Phase 35.2B automated browser testing, two anomalies were observed but did not block test completion. Both issues are documented here for future investigation and remediation after the current performance audit cycle completes.

---

## Anomaly #1: Dashboard Toggle Desync (Cosmetic)

### Description
The Dashboard displayed conflicting trading status indicators:
- **Top bar toggle:** Showed "ACTIVE" (green indicator)
- **Paper Trading Mode banner:** Showed "STOPPED" status

This desync was **cosmetic only** and resolved automatically after the next WebSocket synchronization broadcast (~15 seconds).

### Evidence
**Screenshot:** `attached_assets/1919ddf9-062b-4f0b-b797-28cb6ede99db_1761917451441.png`

**Visual Indicators:**
- Top bar: "Trading" label with green "ACTIVE" badge
- Banner: "Paper Trading Mode" with "STOPPED" badge (red circle icon)
- Portfolio displayed: $832.00 (simulated)

### Root Cause Analysis (Preliminary)
**Likely Cause:** Race condition between initial page load state and WebSocket reconnection after page navigation.

**Technical Details:**
1. User navigated from Dashboard → Systems → Dashboard
2. Initial render used stale cached state (`active: true`)
3. Banner component fetched fresh state from `/api/paper-sim/status` (`isRunning: false`)
4. Top bar component had not yet invalidated its cache
5. Next WebSocket `trading_state_changed` broadcast synchronized both components

**Evidence from Logs:**
```
[SYNC] trading_state_changed: {..., "active": false, ...}
[UI] Auto-refresh triggered on mode switch: paper -> paper
[UI] Mode switch complete - all queries invalidated for: paper
```

### Reproduction Steps
1. Start paper trading from Dashboard
2. Navigate to Systems tab (or any other page)
3. Navigate back to Dashboard quickly (within 5 seconds)
4. Observe top bar vs. banner status indicators
5. Wait 15 seconds for reconciliation broadcast
6. Observe indicators sync to correct state

### Impact Assessment
- **User Experience:** Momentary confusion (5-15 seconds)
- **Functional Impact:** None (state is cosmetic only)
- **Data Integrity:** No impact (backend state correct)
- **Auto-Resolution:** Yes (next WebSocket broadcast fixes it)

### Recommended Fix (Deferred)
**Option A - Hydration First:**
- Force TopBar to hydrate from `/api/trading/status` on mount
- Remove reliance on cached state for initial render

**Option B - Synchronous State:**
- Use a single source of truth (e.g., TradingModeContext)
- Both TopBar and Banner subscribe to same context

**Option C - Optimistic Update:**
- Add invalidation guard to prevent stale cache reads after navigation

**Defer Reason:** Cosmetic only, auto-resolves, low user impact

---

## Anomaly #2: Filtered Pairs HTTP 500 Error (Functional)

### Description
The Trading page displayed a persistent HTTP 500 error when attempting to load filtered trading pairs:

**Error Message:**
```
Failed to load filtered pairs: HTTP 500:
{"error":"ContextBridge2.getClientCount is not a function"}
```

This error prevented the "Filter Health (Last 24h)" widget from displaying eligible trading pairs data.

### Evidence
**Screenshot:** `attached_assets/1cc5c0c9-6993-410c-aa6f-b457301436ee_1761917455349.png`

**Visual Indicators:**
- Red error banner in "Filter Health (Last 24h)" section
- Error text clearly visible: "ContextBridge2.getClientCount is not a function"
- HTTP 500 response code
- "Pairs Scanned: 1,473" displayed but "Eligible Pairs: 426" calculation failed

### Root Cause Analysis (Preliminary)

**Error Type:** `TypeError: ContextBridge2.getClientCount is not a function`

**Likely Cause:** Method signature mismatch or undefined method on ContextBridge2 service.

**Technical Details:**
1. Trading page mounted and requested filtered pairs data
2. Backend route likely calls ContextBridge2 service for telemetry
3. Service attempted to invoke `getClientCount()` method
4. Method does not exist or is not exported from ContextBridge2
5. Exception thrown, route returns 500 error

**Affected Endpoint:**
- Likely: `GET /api/filters/diagnostics` or similar filtered pairs endpoint
- Response: HTTP 500 with JSON error payload

**Evidence from Error Message:**
```json
{
  "error": "ContextBridge2.getClientCount is not a function"
}
```

**Service Investigation Required:**
- Check `server/services/context-bridge.ts` (or ContextBridge2 file)
- Verify `getClientCount()` method exists and is exported
- Check if method name changed (e.g., `getClientCount` → `getConnectedClients`)
- Verify all callers use correct method signature

### Reproduction Steps
1. Navigate to Trading page (`/trading`)
2. Ensure paper trading mode is active or inactive (error occurs in both states)
3. Observe "Filter Health (Last 24h)" widget
4. Wait for initial data load
5. Error banner appears: "Failed to load filtered pairs: HTTP 500"
6. Click "Retry" button (if available)
7. Error persists

**Alternative Reproduction:**
1. Open browser DevTools Network tab
2. Navigate to Trading page
3. Observe failed HTTP request (likely `/api/filters/diagnostics`)
4. Inspect response body: `{"error":"ContextBridge2.getClientCount is not a function"}`

### Impact Assessment
- **User Experience:** Critical widget data unavailable
- **Functional Impact:** Cannot view filtered pairs or eligibility metrics
- **Data Integrity:** No impact (read-only operation)
- **Trading Impact:** No direct impact (filtering still works, only diagnostics fail)
- **Auto-Resolution:** No (requires code fix)

### Recommended Fix (Deferred)

**Step 1: Identify Caller**
```bash
grep -r "getClientCount" server/
```

**Step 2: Verify ContextBridge2 API**
- Check if method exists in service
- Check if method was renamed
- Check if service was refactored

**Step 3A: If Method Missing - Add It**
```typescript
// In ContextBridge2 service
public getClientCount(): number {
  return this.connectedClients.size;
}
```

**Step 3B: If Method Renamed - Update Callers**
```typescript
// Before:
const count = contextBridge2.getClientCount();

// After:
const count = contextBridge2.getConnectedClientsCount();
```

**Step 4: Add Error Handling**
```typescript
// In route handler
try {
  const clientCount = contextBridge2.getClientCount?.() ?? 0;
  // ... rest of logic
} catch (error) {
  console.error('ContextBridge2 error:', error);
  // Return degraded response instead of 500
  return res.json({ 
    pairsScanned: 1473, 
    eligiblePairs: null, 
    error: 'Telemetry unavailable' 
  });
}
```

**Defer Reason:** Non-critical diagnostic feature, does not block core trading functionality

---

## Priority & Scheduling

### Anomaly #1: Dashboard Toggle Desync
- **Priority:** Low
- **Severity:** Cosmetic
- **Fix Timeline:** Phase 35.3 or later
- **Estimated Effort:** 1-2 hours
- **Dependencies:** None

### Anomaly #2: Filtered Pairs HTTP 500
- **Priority:** Medium
- **Severity:** Functional (diagnostic feature only)
- **Fix Timeline:** Phase 35.3 or Phase 36
- **Estimated Effort:** 2-4 hours (investigation + fix + testing)
- **Dependencies:** ContextBridge2 service audit

---

## Testing Recommendations

### For Anomaly #1 (After Fix)
1. Automated browser test with rapid navigation cycle
2. WebSocket disconnect/reconnect simulation
3. Cache invalidation edge cases
4. Multi-tab synchronization test

### For Anomaly #2 (After Fix)
1. Unit test for `getClientCount()` method
2. Integration test for filtered pairs endpoint
3. Error handling verification (graceful degradation)
4. Load test with multiple concurrent requests

---

## Related Issues

### Possibly Related to Anomaly #1
- Phase 34: WebSocket synchronization improvements
- Phase 35.2A: Batched invalidations implementation
- TradingModeContext initialization timing

### Possibly Related to Anomaly #2
- ContextBridge refactoring (Phase 33+)
- WebSocket telemetry enhancements
- Service method signature changes

---

## Conclusion

Both anomalies observed during Phase 35.2B testing are documented for post-audit remediation:

1. **Dashboard Toggle Desync:** Low-priority cosmetic issue with auto-resolution
2. **Filtered Pairs HTTP 500:** Medium-priority functional issue affecting diagnostic widget

Neither anomaly blocked the Phase 35.2B test completion or affects core trading functionality. Both are deferred to Phase 35.3 or later performance optimization cycles.

**Status:** Documented ✅  
**Code Changes:** None (as requested)  
**Next Action:** Include in Phase 35.3 planning or backlog grooming

---

**Documented by:** Agent  
**Phase:** 35.2B Post-Test Analysis  
**Classification:** Deferred Fixes — Post-Audit
