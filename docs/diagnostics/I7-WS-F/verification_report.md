# Phase 8.8.3-I7-WS-F: WebSocket Subscription Coverage Fix

## Summary

Phase I7-WS-F ensures all active-trade symbols have correct Kraken WebSocket subscriptions by:
- Auditing subscription coverage for all active positions
- Identifying and repairing subscription gaps
- Detecting ACK timeouts and no-tick situations
- Validating symbol map integrity

## Implementation Details

### F1: Coverage Audit Function

**Function**: `auditWebSocketCoverage(activeSymbols)`

Verifies the complete subscription chain for each symbol:
1. Internal symbol → canonical map
2. Canonical map → Kraken WS pair
3. Subscription request sent
4. Subscription ACK received

### F2: Automatic Subscription Correction

**Function**: `autoSubscribeMissingSymbols(activeSymbols)`

For symbols with coverage gaps:
1. Derives the correct Kraken pair
2. Subscribes dynamically
3. Logs with `[I7-WS-F][AUTO_SUBSCRIBE]`

### F3: Enhanced Coverage Status

**Field**: `coverage_status`

Possible values:
| Status | Description |
|--------|-------------|
| `subscribed` | Active WebSocket subscription confirmed |
| `pending` | Subscription requested, awaiting ACK |
| `missing` | No subscription exists |
| `unmappable` | Cannot resolve to Kraken pair |

### F4: Subscription Health Monitoring

**Thresholds**:
| Issue | Threshold | Log Tag |
|-------|-----------|---------|
| ACK Timeout | >5 seconds pending | `[I7-WS-F][ACK_TIMEOUT]` |
| No Tick | >10 seconds after ACK | `[I7-WS-F][NO_TICK]` |

### F5: Symbol Map Validation

Detects:
- Internal symbols with missing Kraken pair mapping
- Format mismatches between expected and actual WS pairs

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/diagnostics/i7-ws-f/coverage` | GET | Get coverage status for all active symbols |
| `/api/diagnostics/i7-ws-f/audit` | POST | Run full coverage audit |
| `/api/diagnostics/i7-ws-f/auto-subscribe` | POST | Auto-subscribe missing symbols |
| `/api/diagnostics/i7-ws-f/validate-map` | GET | Validate symbol map integrity |
| `/api/diagnostics/i7-ws-f/health` | GET | Get subscription health status |
| `/api/diagnostics/i7-ws-f/start-monitoring` | POST | Start health monitoring |
| `/api/diagnostics/i7-ws-f/stop-monitoring` | POST | Stop health monitoring |

## Diagnostic Logging

```
[I7-WS-F][COVERAGE_AUDIT] symbol=XXX status=subscribed|pending|missing|unmappable
[I7-WS-F][AUTO_SUBSCRIBE] symbol=XXX kraken_ws_pair=YYY
[I7-WS-F][AUTO_SUBSCRIBE_SUMMARY] attempted=N subscribed=N failed=N unmappable=N
[I7-WS-F][ACK_TIMEOUT] symbol=XXX kraken_ws_pair=YYY pending_ms=N
[I7-WS-F][NO_TICK] symbol=XXX time_since_ack_ms=N
[I7-WS-F][MAP_VALIDATION] symbol=XXX status=missing_mapping|mismatch
[I7-WS-F][HEALTH_MONITOR] Starting/Stopped subscription health monitoring
```

## Test Workflow

1. Start paper simulation (or verify live trades exist)
2. Wait 10 seconds for positions to open
3. Call `GET /api/diagnostics/i7-ws-f/coverage`
4. Verify all active symbols are in "subscribed" state
5. If gaps exist, call `POST /api/diagnostics/i7-ws-f/auto-subscribe`
6. Re-check coverage status

**Note**: All endpoints check both paper AND live trades to ensure complete WebSocket coverage across all active positions.

## Files Modified

| File | Changes |
|------|---------|
| `server/services/kraken-websocket-adapter.ts` | Added F1-F5 functions and health monitoring |
| `server/routes.ts` | Added I7-WS-F diagnostic endpoints |

## Production Readiness

Phase 8.8.3-I7-WS-F is ready for production:

- [x] Coverage audit function implemented
- [x] Automatic subscription correction for missing symbols
- [x] Enhanced coverage_status field in API response
- [x] ACK timeout detection (>5s pending)
- [x] No-tick detection (>10s after ACK without ticks)
- [x] Symbol map validation
- [x] Comprehensive diagnostic logging
- [x] API endpoints for monitoring and repair
- [x] No changes to trading logic (diagnostic-only)
