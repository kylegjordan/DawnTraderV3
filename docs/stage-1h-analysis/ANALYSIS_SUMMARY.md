# Stage 1h Synchronization Analysis - File Package

## Purpose
Complete codebase analysis for diagnosing 30-40s delays in TopBar indicators after paper trading START.

## Files Included

### Frontend (5 files)
1. **client/src/hooks/use-trading.tsx** - Trading state management, WebSocket listeners, debounced invalidation
2. **client/src/components/layout/top-bar.tsx** - TopBar component with system config polling
3. **client/src/pages/dashboard.tsx** - Dashboard with portfolio queries and WebSocket updates
4. **client/src/hooks/use-websocket.tsx** - WebSocket singleton with heartbeat and reconnection
5. **client/src/lib/queryClient.ts** - React Query configuration with stale times and intervals

### Backend (4 files)
6. **server/services/trading-state-sync.ts** - State synchronization with broadcast debouncing
7. **server/services/paper-sim-service.ts** - Paper simulation service with Stage 1h blocking fix
8. **server/routes.ts** - API routes and WebSocket server setup
9. **server/services/context-bridge.ts** - WebSocket broadcast mechanism with retry logic

### Configuration (2 files)
10. **.env.example** - Environment variable reference
11. **POLL_INTERVALS.txt** - Extracted poll/refresh/debounce constants from codebase

## Key Findings

### Stage 1h Fix Status: ✅ APPLIED
- **File**: `server/services/paper-sim-service.ts`
- **Lines**: 491-508
- **Fix**: `await tradingStateSync.setEngineActive(userId, true, mode)` is BLOCKING
- **Result**: Broadcast guaranteed to fire BEFORE HTTP response returns

### Potential Delay Sources

1. **Broadcast Debounce** (250ms)
   - Location: `server/services/trading-state-sync.ts:31`
   - Could skip broadcasts within 250ms window
   - Search logs for: `[Phase-33.A] Broadcast debounced`

2. **Passive Learning Debounce** (2 seconds)
   - Location: `server/services/trading-state-sync.ts:479-492`
   - Skips duplicate passiveLearning state broadcasts
   - Search logs for: `[Phase-33.B] Duplicate passiveLearning broadcast skipped`

3. **System Config Polling** (10 seconds)
   - Location: `client/src/components/layout/top-bar.tsx:104`
   - TopBar polls `/api/system/config` every 10s
   - **BUT**: Instant hydration bypass exists (use-trading.tsx:112-123)

4. **WebSocket Delivery**
   - Check context-bridge logs for delivery failures
   - Verify client count and broadcast success

## Log Search Commands

```bash
# Check if broadcasts are being debounced/skipped
grep "Broadcast debounced\|Duplicate passiveLearning" server-logs.txt

# Verify broadcast delivery
grep "Broadcasting trading_state_changed to" server-logs.txt

# Check Stage 1h timing
grep "Stage-1h" server-logs.txt
```

## Browser Console Checks

Look for these log patterns after clicking START:

```
[Stage-1h][BROADCAST] Firing engine state sync IMMEDIATELY (blocking)
[Stage-1h][BROADCAST] ✅ Engine state sync completed in <X>ms
[SYNC][Stage-1f][ACCEPT] New state v=<version>
[SYNC][Stage-1g][ACK] Received engine_start v=<version>
[SYNC][Stage-1f][RENDER] v=<version> rendered in <X>ms
```

## Expected Latency Targets
- Backend broadcast: <50ms
- ACK reception: <100ms
- TopBar update: <200ms total

## Analysis Date
Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
