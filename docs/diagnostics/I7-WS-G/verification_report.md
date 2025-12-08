# Phase 8.8.3-I7-WS-G: Tick Frequency Stabilization - Verification Report

## Phase Summary

Phase I7-WS-G improves the reliability of WebSocket tick arrival by detecting slow, irregular, or frozen tick frequency and applying corrective actions automatically.

## Implemented Features

### G1: Tick Frequency Tracking
- **G1.1**: Per-symbol tick frequency monitoring with `lastTickTimestamp`, `tickIntervals`, `frozenSince`, rolling averages
- **G1.2**: Rolling bucket averaging for 30s, 60s, and 180s windows
- **G1.3**: Automatic classification: `normal`, `slow` (>3500ms), `very_slow` (>6000ms), `frozen` (≥10s no tick)

### G2: Corrective Behavior
- **G2.1**: Auto-resubscribe logic triggered for slow/frozen symbols
- **G2.2**: Single-symbol re-subscribe (no global WS reset)
- **G2.3**: Attempt tracking with max 3 attempts per 60s; marks symbol as `unstable` after exceeded

### G3: Kraken Channel Quality Detection
- **G3.1**: Channel hints for low-liquidity pairs; auto-switch to book channel with depth=1
- **G3.2**: Book channel revert after 120s stable on ticker channel

### G4: Diagnostic Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/diagnostics/i7-ws-g/frequency` | GET | Per-symbol tick frequency metrics with summary |
| `/api/diagnostics/i7-ws-g/reset` | POST | Reset all tick interval history |
| `/api/diagnostics/i7-ws-g/unstable` | GET | List symbols marked as unstable |
| `/api/diagnostics/i7-ws-g/start-monitoring` | POST | Start tick frequency monitoring |
| `/api/diagnostics/i7-ws-g/stop-monitoring` | POST | Stop tick frequency monitoring |
| `/api/diagnostics/i7-ws-g/channel-hints` | GET | Get channel hints configuration |

## Log Tags

```
[I7-WS-G][TICK_INTERVAL] symbol=... interval=...ms avg=...ms
[I7-WS-G][SLOW_TICK] symbol=... avg=...ms classification=slow|very_slow
[I7-WS-G][FROZEN] symbol=... lastTick=...
[I7-WS-G][RESUBSCRIBE] pair=... reason=slow|frozen
[I7-WS-G][UNSTABLE] symbol=... attempts=3
[I7-WS-G][CHANNEL_SWITCH] symbol=... use=book depth=1
[I7-WS-G][CHANNEL_REVERT] symbol=... from=book to=ticker
[I7-WS-G][FREQ_MONITOR] Starting/Stopped tick frequency monitoring
```

## Thresholds

| Threshold | Value | Description |
|-----------|-------|-------------|
| Slow | >3500ms avg | Tick interval slower than expected |
| Very Slow | >6000ms avg | Significant tick delay |
| Frozen | ≥10000ms | No tick received |
| Max Correction Attempts | 3 | Per 60-second window |
| Book Revert Delay | 120s | Stable period before reverting to ticker |

## Channel Hints Configuration

Low-liquidity pairs that may require special handling:
- TIA/USD, FORTH/USD, PROVEEUR, BAND/USD, SC/USD, RLC/EUR, OGN/USD

Pairs preferring book channel when ticker is slow:
- TIA/USD, BAND/USD, SC/USD, RLC/EUR

## Test Results

### Endpoint Verification
All endpoints tested and returning correct responses:
- `/api/diagnostics/i7-ws-g/frequency` - Returns metrics with summary
- `/api/diagnostics/i7-ws-g/unstable` - Returns unstable symbol list
- `/api/diagnostics/i7-ws-g/channel-hints` - Returns channel hints configuration
- `/api/diagnostics/i7-ws-g/start-monitoring` - Starts monitoring successfully

## Files Modified

| File | Changes |
|------|---------|
| `server/services/kraken-websocket-adapter.ts` | Added G1-G3 tick frequency tracking, corrective behavior, and channel quality detection |
| `server/routes.ts` | Added 6 new G4 diagnostic endpoints |
| `replit.md` | Updated with I7-WS-G documentation |

## Expected Outcome

After implementing WS-G:
- Smooth, stable tick flow
- No unexpected stale cache conditions
- Automatic healing of frozen subscriptions
- Deterministic tick cadence
- Visibility into tick health for every active symbol
- Handling for thin-liquidity Kraken assets
- Reduced REST fallback usage
- Real-time detection of price flow degradation
