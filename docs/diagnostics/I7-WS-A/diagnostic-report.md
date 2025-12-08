# Phase 8.8.3-I7-WS-A Diagnostic Report

## Overview
**Date**: 2025-12-08  
**Phase**: I7-WS-A - WebSocket Subscription & Tick Flow Diagnostics  
**Status**: COMPLETE - All diagnostic logging implemented and verified

## Diagnostic Objectives
1. Trace the complete WebSocket subscription lifecycle from request to price broadcast
2. Verify symbol mapping consistency between internal, Kraken WS, and Kraken REST formats
3. Validate that all active positions receive real-time price updates
4. Ensure no symbols are "lost" in the subscription/tick pipeline
5. Expose granular gap reporting with differentiation between pending vs never-requested

## Diagnostic Points Implemented

| Point | Tag | Location | Trigger Condition |
|-------|-----|----------|-------------------|
| A1 | [I7-WS-A][SUB_REQ] | subscribeToSymbols() | Once per symbol at simulation start |
| A2 | [I7-WS-A][SUB_ACK] | handleSystemMessage() | When Kraken acknowledges subscription |
| A2' | [I7-WS-A][SUB_REJECT] | handleSystemMessage() | When Kraken rejects subscription |
| A3 | [I7-WS-A][FIRST_TICK] | handleTickerUpdate() | First tick received per symbol (once) |
| A3' | [I7-WS-A][UNMAPPED_TICK] | handleTickerUpdate() | Tick received for unmapped symbol |
| A4 | [I7-WS-A][CACHE_UPDATE] | updateFromWebSocket() | Each WebSocket price update to cache |
| A5 | [I7-WS-A][BROADCAST] | broadcastPriceUpdate() | Each price broadcast (all sources) |

## Diagnostic Endpoint
**Endpoint**: `/api/diagnostics/i7-ws/subscription-map?mode={paper|live}`  
**Reset**: `/api/diagnostics/i7-ws/reset-tracking` (POST)

### Response Structure
```json
{
  "ok": true,
  "timestamp": "2025-12-08T20:14:39.000Z",
  "mode": "paper",
  "wsStatus": { "isConnected": true, "healthy": true, ... },
  "summary": {
    "totalActivePositions": 15,
    "subscribedToWs": 14,
    "pendingSubscription": 0,
    "neverRequested": 1,
    "receivedAck": 14,
    "receivedFirstTick": 14,
    "neverReceivedTick": 0,
    "unmappedTickPairs": 0
  },
  "gaps": {
    "neverTickedSymbols": [],
    "pendingSymbols": [],
    "neverRequestedSymbols": ["SYMBOL_X"],
    "unmappedTicks": [{ "pair": "XYZ/EUR", "count": 5, "lastSeen": "2025-12-08T..." }]
  },
  "active_positions": [{ 
    "internal": "...", 
    "subscribed": true, 
    "pending": false,
    "acked": true, 
    "first_tick_received": true,
    "subscription_status": "subscribed" // "subscribed" | "pending" | "never_requested"
  }],
  "allSubscribedSymbols": [...],
  "allFirstTickSymbols": [...]
}
```

### Gap Reporting Features
- **neverTickedSymbols**: Symbols that ARE subscribed but never received a WebSocket tick
- **pendingSymbols**: Symbols with subscription request but awaiting Kraken ACK
- **neverRequestedSymbols**: Symbols with no subscription request (not yet subscribed)
- **unmappedTicks**: Kraken WS pairs received that couldn't be mapped to internal symbols (with count and lastSeen timestamp)

### Subscription Status Differentiation
Each position now includes `subscription_status` field:
- `subscribed`: Active WebSocket subscription, in subscribedSymbols set
- `pending`: Subscription requested (in pendingSubscriptions or subscriptionRequests) but not yet in subscribedSymbols
- `never_requested`: No subscription request made for this symbol

## Tracking Infrastructure

### Persistent Tracking State
```typescript
subscriptionRequests: Map<string, { krakenWsPair, internalSymbol, timestamp }>
subscriptionAcks: Map<string, { acked: boolean, timestamp }>
firstTickReceived: Set<string>
unmappedTicks: Map<string, { count: number, lastSeen: number }>
pendingSubscriptions: Set<string>
subscribedSymbols: Set<string>
```

### Subscription Lifecycle State Machine
```
never_requested → pending → subscribed
       │              │           │
       │              └──(reject)─┘
       │                     │
       └─────────────────────┘
```

1. **never_requested**: Symbol has no subscription request (not in pendingSubscriptions or subscriptionRequests)
2. **pending**: Subscription requested but awaiting Kraken ACK (in pendingSubscriptions AND/OR subscriptionRequests)
3. **subscribed**: Subscription confirmed (in subscribedSymbols, cleared from pending/requests on ACK)

### Key Design Decisions
1. **Fresh Position Queries**: Endpoint fetches current open positions on each request (`storage.getPaperSimOpenPositions(mode)`)
2. **Unmapped Tick Tracking**: Captures ticks for symbols that fail normalization with count and lastSeen timestamp
3. **Granular Status**: Differentiates between subscribed, pending, and never_requested states
4. **Pending State Persistence**: pendingSubscriptions and subscriptionRequests persist until ACK/rejection arrives (cleared in handleSystemMessage() only)
5. **Reset Capability**: `clearFirstTickTracking()` clears all tracking state for fresh diagnostic runs

## Log Visibility Analysis

| Log Point | Visibility in Logs | Reason |
|-----------|-------------------|--------|
| A1 SUB_REQ | Startup only | Emitted once when subscribeToSymbols() is called at simulation start |
| A2 SUB_ACK | Startup only | Emitted once when Kraken acknowledges each subscription |
| A3 FIRST_TICK | Startup only | Emitted once per symbol when first WebSocket tick arrives |
| A3' UNMAPPED_TICK | Continuous | Emitted each time an unmapped tick is received (with count) |
| A4 CACHE_UPDATE | WebSocket ticks only | Emitted when price arrives via WebSocket (not REST fallback) |
| A5 BROADCAST | All sources | Emitted for every price update (WebSocket + REST fallback) |

**Note**: A1-A3 logs appear only during simulation startup, making them invisible in rolling log captures that begin after startup. The diagnostic endpoint provides point-in-time verification of these events via tracking Maps/Sets that persist across the session.

## Files Modified (Diagnostic Only)
- `server/services/kraken-websocket-adapter.ts` - Added A1, A2, A3, A3' diagnostic logging + tracking infrastructure + unmappedTicks tracking + subscription_status field
- `server/services/live-pricing-adapter.ts` - Added A4, A5 diagnostic logging
- `server/routes.ts` - Added diagnostic endpoints with granular gap reporting

## Strict Observational Compliance
- No changes to trading behavior
- No changes to price cache logic
- No changes to symbol resolver logic
- No changes to execution engine
- Diagnostic logging and tracking only

## How to Use

### Query Subscription State
```bash
curl -s "http://localhost:5000/api/diagnostics/i7-ws/subscription-map?mode=paper" \
  -H "Authorization: Bearer $TOKEN" | jq '.summary, .gaps'
```

### Reset Tracking for Fresh Run
```bash
curl -X POST "http://localhost:5000/api/diagnostics/i7-ws/reset-tracking" \
  -H "Authorization: Bearer $TOKEN"
```

### Capture A1-A3 Logs
To capture subscription/ACK/first-tick logs, monitor logs immediately after:
1. Starting a fresh simulation (`POST /api/paper-sim/start?mode=new`)
2. Adding new positions to an existing simulation
3. Restarting the workflow/server

## Conclusion
Phase 8.8.3-I7-WS-A diagnostic implementation is complete and verified. The WebSocket subscription and tick flow pipeline is instrumented with 7 diagnostic points (A1, A2, A2', A3, A3', A4, A5) covering the complete lifecycle. The diagnostic endpoint (`/api/diagnostics/i7-ws/subscription-map`) provides authoritative state verification including:
- Granular subscription status (subscribed/pending/never_requested)
- Unmapped tick tracking with count and lastSeen timestamps
- Complete gap analysis for debugging missing price updates
