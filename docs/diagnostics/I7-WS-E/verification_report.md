# Phase 8.8.3-I7-WS-E: REST Fallback Optimization

## Summary

Phase I7-WS-E optimizes when REST fallback is used for price fetching, ensuring REST API calls only occur when necessary:
- WebSocket cache is stale (older than 2 seconds)
- Symbol has no active WebSocket subscription

This reduces unnecessary REST API calls and improves price data freshness tracking.

## Implementation Details

### Thresholds
| Threshold | Duration | Behavior |
|-----------|----------|----------|
| Fresh | ≤2000ms | Use WebSocket cache directly |
| Warning | ≥3000ms | Log warning, still use cache |
| Fallback | ≥5000ms | Trigger REST fallback |

### Fallback Reasons
- `cache_stale`: WebSocket cache exists but is older than threshold
- `no_ws_subscription`: Symbol has no active WebSocket subscription
- `cache_miss`: No cached price available (rare)

### Diagnostic Logging
```
[I7-WS-E][REST_FALLBACK] symbol=XXX reason=cache_stale
[I7-WS-E][REST_FALLBACK] symbol=XXX reason=no_ws_subscription
[I7-WS-E][CACHE_WARNING] symbol=XXX age=3500ms source=kraken_ws (approaching stale)
```

## API Endpoint

### GET /api/diagnostics/i7-ws-e/rest-fallback-metrics
Returns REST fallback metrics including:
- Total fallback count
- Per-symbol breakdown with reason and timestamps
- Summary by fallback reason type
- WebSocket subscription status per symbol

### POST /api/diagnostics/i7-ws-e/reset
Clears REST fallback metrics for fresh test runs.

## 30-Second Test Results

**Test Date:** 2025-12-08
**Test Duration:** 30 seconds
**Trading Mode:** Paper Simulation

### Metrics Summary
| Metric | Value |
|--------|-------|
| Total Fallbacks | 41 |
| cache_stale | 35 (85.4%) |
| no_ws_subscription | 6 (14.6%) |
| cache_miss | 0 (0%) |

### Per-Symbol Breakdown (Top Symbols)
| Symbol | Fallback Count | Last Reason | Has WS Subscription |
|--------|----------------|-------------|---------------------|
| API3EUR | 6 | cache_stale | Yes |
| AUD/USD | 4 | cache_stale | Yes |
| BAND/USD | 3 | cache_stale | Yes |
| SUI/EUR | 3 | no_ws_subscription | No |
| TIA/USD | 3 | no_ws_subscription | No |
| KNC/USD | 3 | cache_stale | Yes |
| JTOEUR | 3 | cache_stale | Yes |
| FXS/USD | 3 | cache_stale | Yes |

### WebSocket Pipeline (I7-WS-C Comparison)
| Stage | Count | Description |
|-------|-------|-------------|
| Stage 1 | 42 | WebSocket tick arrival |
| Stage 2 | 42 | Symbol mapping |
| Stage 3 | 42 | Cache update |
| Stage 4 | 36 | Frontend broadcast |
| Stage 7 | 58 | Engine price request |
| Stage 8 | 58 | Engine exit evaluation |

## Impact Analysis

### Positive Outcomes
1. **Clear Visibility**: REST fallback reasons are now explicitly logged
2. **Subscription Gaps Identified**: Symbols without WS subscriptions are clearly flagged
3. **Cache Freshness Tracking**: Warning threshold catches symbols approaching staleness
4. **Diagnostic Endpoint**: Real-time metrics available for monitoring

### Observations
- 85% of fallbacks are due to `cache_stale`, indicating WebSocket ticks are arriving but not frequently enough for some symbols
- 15% of fallbacks are due to `no_ws_subscription`, identifying symbols that need WebSocket coverage
- Zero `cache_miss` events indicate the price caching system is working correctly

## Files Modified

| File | Changes |
|------|---------|
| `server/services/live-pricing-adapter.ts` | Added I7-WS-E logic, thresholds, metric tracking, diagnostic methods |
| `server/routes.ts` | Added `/api/diagnostics/i7-ws-e/*` endpoints |
| `server/index.ts` | Registered WebSocket subscription checker |

## Production Readiness

Phase 8.8.3-I7-WS-E is **ready for production**:

- [x] REST fallback conditions implemented (cache stale OR no WS subscription)
- [x] Diagnostic logging for all fallback reasons
- [x] Warning thresholds (fresh ≤2s, warning ≥3s, fallback ≥5s)
- [x] Diagnostic endpoint exposing per-symbol metrics
- [x] 30-second test completed with expected results
- [x] No breaking changes to existing functionality
- [x] Backward compatible with existing price fetching logic
