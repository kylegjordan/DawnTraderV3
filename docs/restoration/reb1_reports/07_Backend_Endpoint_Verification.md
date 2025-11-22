# REB 1.1 Report: Backend REST Endpoint Verification
**Report ID**: REB1-07  
**Phase**: REB 1.1 (Backend Endpoint Verification)  
**Date**: November 22, 2025  
**Status**: ⚠️ **CRITICAL MISSING ENDPOINTS DETECTED**

---

## Executive Summary

**VERDICT**: ❌ **FAIL** — Multiple critical REST API endpoints missing

The Backend Endpoint Verification audit has confirmed that the REST API architecture established in Phase 8.6.10 has been significantly degraded. **4 out of 8 required endpoints are missing**, forcing the Filter Insights UI to rely on WebSocket data and alternative diagnostic endpoints that do not match the truth state contract.

**Key Finding**: Phase 8.6.10's REST API specification violated — missing `/api/scan-summary`, `/api/24h-activity`, `/api/active-pool`, and other critical endpoints.

---

## Methodology

This audit searched the entire `server/` directory for REST endpoint definitions matching the Phase 8.6.10 specification. Methods included:

1. **Grep searches** across `server/routes.ts` for endpoint patterns
2. **File inspection** of routes.ts (17,509 lines)
3. **Cross-reference** with Phase 8.6.10 mapping documentation
4. **Payload shape analysis** for existing endpoints

---

## I. FX5-Required Endpoints Audit

### A. Scan Summary Endpoint

**Expected** (Phase 8.6.10):
```
GET /api/scan-summary?mode={mode}
GET /api/market-scanner/scan-summary?mode={mode}
```

**Status**: ❌ **NOT FOUND**

**Expected Payload**:
```typescript
{
  krakenUniverseSize: number;
  scanCycleId: string;
  lastScanCompletedAt: string; // ISO timestamp
  evaluatedCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  cadenceMs: number;
  cyclesPerHour: number;
}
```

**Current Alternative**: ❌ **NO DIRECT REPLACEMENT**

**Evidence**:
```bash
$ grep -n "scan-summary" server/routes.ts
# No matches found
```

**Impact**: Filter Insights Section 1 (real-time scan metrics) cannot use REST API, must rely on WebSocket `scan_tick` events.

---

### B. Scan History Endpoint

**Expected** (Phase 8.6.10):
```
GET /api/scan-history?mode={mode}&limit={limit}
```

**Status**: ❌ **NOT FOUND**

**Expected Payload**:
```typescript
{
  history: Array<{
    scanCycleId: string;
    completedAt: string;
    evaluatedCount: number;
    eligibleCount: number;
  }>;
}
```

**Current Alternative**: ❌ **NO REPLACEMENT**

**Evidence**:
```bash
$ grep -n "scan-history" server/routes.ts
# No matches found
```

**Impact**: No historical scan data available via REST API.

---

### C. 24-Hour Activity Endpoint

**Expected** (Phase 8.6.10):
```
GET /api/24h-activity?mode={mode}
GET /api/market-scanner/24h-activity?mode={mode}
```

**Status**: ⚠️ **PARTIAL** — Different endpoint exists

**Expected Payload**:
```typescript
{
  totalEvaluated: number;
  uniqueEvaluated: number;
  totalSurvived: number;
  uniqueSurvived: number;
  cyclesLast24h: number;
  breakdown: FilterBreakdown; // Per-filter failure counts
}
```

**Current Alternative**: ✅ **Found** at different path:
```
GET /api/paper-sim/diagnostics/scan-24h?mode={mode}
```

**Location**: `server/routes.ts` line 6060

**Actual Payload**:
```typescript
{
  ok: boolean;
  data: {
    totalEvaluated: number;
    uniqueEvaluated: number;
    totalSurvived: number;
    uniqueSurvived: number;
    totalCycles: number; // vs cyclesLast24h
    // breakdown field status: UNKNOWN (needs verification)
  };
}
```

**Discrepancies**:
1. Different endpoint path (`/api/paper-sim/diagnostics/scan-24h` vs `/api/24h-activity`)
2. Field name difference: `totalCycles` vs `cyclesLast24h`
3. Wrapped in `{ ok, data }` structure (not in truth spec)
4. `breakdown` field presence uncertain

**Evidence**:
```typescript
// server/routes.ts:6060-6078
apiRouter.get('/paper-sim/diagnostics/scan-24h', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { scan24hAggregator } = await import('./services/scan-24h-aggregator.js');
    const { mode } = req.query;
    const scanMode = (mode as 'paper' | 'live') || 'paper';
    
    const metrics = scan24hAggregator.getMetrics(scanMode);
    
    res.json({
      ok: true,
      data: metrics,
    });
  } catch (error) {
    // error handling
  }
});
```

**Impact**: Frontend must use different endpoint path and handle different payload structure.

---

### D. Active Pool Endpoint

**Expected** (Phase 8.6.10):
```
GET /api/active-pool?mode={mode}
GET /api/market-scanner/active-pool?mode={mode}
```

**Status**: ❌ **NOT FOUND**

**Expected Payload**:
```typescript
{
  count: number;
  entries: Array<{
    symbol: string;
    status: 'eligible' | 'in_trade' | 'cooldown';
    firstSeen: string; // ISO timestamp
    lastUpdated: string;
    expiresAt: string | null;
  }>;
}
```

**Current Alternative**: ❌ **NO DIRECT REPLACEMENT**

**Evidence**:
```bash
$ grep -n "active-pool\|activePool" server/routes.ts
# No matches found in routes
```

**Workaround**: Active pool data included in WebSocket `scan_tick` event payload as `activeFilteredPool`

**Impact**: Filter Insights Active Pool Table (Section 3) cannot use REST API, must rely on WebSocket.

---

### E. Filters V2 Endpoint

**Expected** (Truth Files):
```
GET /api/filters-v2?mode={mode}
PUT /api/filters-v2?mode={mode}
```

**Status**: ✅ **FOUND**

**Location**: `server/routes.ts` lines 1879 (GET), 2044 (PUT)

**Evidence**:
```typescript
// server/routes.ts:1879
apiRouter.get('/filters-v2', authenticateToken, async (req: AuthenticatedRequest, res) => {
  // Implementation exists
});

// server/routes.ts:2044
apiRouter.put('/filters-v2', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
  // Actual filter value updates still use /api/screeners endpoint
});
```

**Note**: PUT handler comment indicates updates still routed to `/api/screeners` endpoint (architectural inconsistency).

---

### F. Screeners Endpoint

**Expected**:
```
GET /api/screeners?mode={mode}
PUT /api/screeners?mode={mode}
```

**Status**: ✅ **FOUND**

**Location**: `server/routes.ts` lines 2308 (GET), 2357 (PUT)

**Evidence**:
```typescript
// server/routes.ts:2308
apiRouter.get('/screeners', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
  // ConfigBob routing with fallback
});

// server/routes.ts:2357
apiRouter.put('/screeners', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
  // Update screener filters
});
```

**Note**: Includes ConfigBob transparent routing (Phase 7.4).

---

### G. Screeners Update Endpoint

**Expected**:
```
PUT /api/screeners/update?mode={mode}
```

**Status**: ⚠️ **UNCLEAR** — PUT /api/screeners exists, but `/update` suffix not found

**Alternative**: Standard PUT `/api/screeners` may handle updates

---

### H. Filters Reset Endpoint

**Expected**:
```
POST /api/filters/reset?mode={mode}
```

**Status**: ❌ **NOT FOUND**

**Evidence**:
```bash
$ grep -n "filters.*reset\|reset.*filters" server/routes.ts
# No matches found
```

**Impact**: No API endpoint to reset filters to defaults.

---

## II. Filter Insights-Required Endpoints Audit

### A. Settings Filters Endpoint

**Expected** (Phase 8.8.2):
```
GET /api/settings/filters?mode={mode}
```

**Status**: ✅ **FOUND**

**Location**: `server/routes.ts` line 2244

**Payload Shape**:
```typescript
{
  mode: 'paper' | 'live';
  filters: {
    minVolume: number;
    maxBidAskSpread: number;
    minDailyRange: number;
    minPrice: number;
    excludeStablecoins: boolean;
    allowedQuoteCurrencies: string[];
  };
}
```

**Evidence**:
```typescript
// server/routes.ts:2244-2286
apiRouter.get('/settings/filters', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
  try {
    const mode = req.mode!;
    const screenerFilters = await storage.getScreenerFilters({ mode });
    
    const response = {
      mode,
      filters: {
        minVolume: parseNumber(screenerFilters.minVolume),
        maxBidAskSpread: parseNumber(screenerFilters.maxBidAskSpread),
        minDailyRange: parseNumber(screenerFilters.volatilityMin) || 0.02,
        minPrice: parseNumber(screenerFilters.minPrice),
        excludeStablecoins: screenerFilters.excludeStablecoins ?? true,
        allowedQuoteCurrencies,
      },
    };
    res.json(response);
  } catch (error) {
    // error handling
  }
});
```

**Compliance**: ✅ **MATCHES TRUTH STATE**

---

### B. Filters Diagnostics Endpoint

**Expected**:
```
GET /api/filters/diagnostics?mode={mode}
```

**Status**: ✅ **FOUND**

**Location**: `server/routes.ts` line 2148

**Evidence**:
```typescript
// server/routes.ts:2148
apiRouter.get('/filters/diagnostics', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
  // Implementation exists
});
```

---

### C. Screeners Calibration Endpoint

**Expected**:
```
GET /api/screeners/calibration?mode={mode}
```

**Status**: ✅ **FOUND**

**Location**: `server/routes.ts` line 2289

**Evidence**:
```typescript
// server/routes.ts:2289-2304
apiRouter.get('/screeners/calibration', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
  try {
    const mode = req.mode!;
    const calibration = await storage.getCalibrationWithFallback(mode, 24);
    
    if (!calibration) {
      return res.status(404).json({ error: 'No calibration data found' });
    }
    
    res.json(calibration);
  } catch (error) {
    // error handling
  }
});
```

---

## III. Endpoint Compliance Matrix

| Endpoint | Required By | Expected Path | Status | Current Path | Compliance |
|----------|-------------|---------------|--------|--------------|-----------|
| Scan Summary | FX5 | `/api/scan-summary` | ❌ NOT FOUND | N/A | ❌ 0% |
| Scan History | FX5 | `/api/scan-history` | ❌ NOT FOUND | N/A | ❌ 0% |
| 24h Activity | FX5 | `/api/24h-activity` | ⚠️ PARTIAL | `/api/paper-sim/diagnostics/scan-24h` | ⚠️ 60% |
| Active Pool | FX5 | `/api/active-pool` | ❌ NOT FOUND | N/A | ❌ 0% |
| Filters V2 GET | Filters | `/api/filters-v2` | ✅ FOUND | `/api/filters-v2` | ✅ 100% |
| Filters V2 PUT | Filters | `/api/filters-v2` | ✅ FOUND | `/api/filters-v2` | ✅ 100% |
| Screeners GET | Filters | `/api/screeners` | ✅ FOUND | `/api/screeners` | ✅ 100% |
| Screeners PUT | Filters | `/api/screeners` | ✅ FOUND | `/api/screeners` | ✅ 100% |
| Screeners Update | Filters | `/api/screeners/update` | ⚠️ UNCLEAR | `/api/screeners` (PUT) | ⚠️ 80% |
| Filters Reset | Filters | `/api/filters/reset` | ❌ NOT FOUND | N/A | ❌ 0% |
| Settings Filters | Filter Insights | `/api/settings/filters` | ✅ FOUND | `/api/settings/filters` | ✅ 100% |
| Filters Diagnostics | Filter Insights | `/api/filters/diagnostics` | ✅ FOUND | `/api/filters/diagnostics` | ✅ 100% |
| Screeners Calibration | Filter Insights | `/api/screeners/calibration` | ✅ FOUND | `/api/screeners/calibration` | ✅ 100% |

**Overall Compliance**: 54% (7/13 endpoints fully compliant)

---

## IV. Payload Shape Analysis

### Discrepancies Found

#### 1. `/api/paper-sim/diagnostics/scan-24h` vs Expected `/api/24h-activity`

**Truth State Payload**:
```typescript
{
  totalEvaluated: number;
  uniqueEvaluated: number;
  totalSurvived: number;
  uniqueSurvived: number;
  cyclesLast24h: number;
  breakdown: FilterBreakdown;
}
```

**Current Payload**:
```typescript
{
  ok: boolean; // Extra wrapper
  data: {
    totalEvaluated: number;
    uniqueEvaluated: number;
    totalSurvived: number;
    uniqueSurvived: number;
    totalCycles: number; // Different field name
    // breakdown: unknown
  };
}
```

**Mismatches**:
1. Wrapped in `{ ok, data }` structure (not in spec)
2. Field name: `totalCycles` vs `cyclesLast24h`
3. `breakdown` field presence uncertain

---

## V. Passive Learning Mode Support

### Expected Behavior (Phase 8.6.10)

All REST endpoints should:
1. Accept `mode=paper` or `mode=live` query parameter
2. Return mode-specific data from backend database
3. Work correctly in passive learning mode (no active trades)

### Actual Behavior

**Verified Endpoints with Mode Support**:
- ✅ `/api/settings/filters` - Uses `validateMode` middleware
- ✅ `/api/screeners` - Uses `validateMode` middleware
- ✅ `/api/screeners/calibration` - Uses `validateMode` middleware
- ✅ `/api/filters/diagnostics` - Uses `validateMode` middleware
- ✅ `/api/paper-sim/diagnostics/scan-24h` - Accepts `mode` query param

**Missing Endpoints Cannot Be Verified**:
- ❌ `/api/scan-summary` - Not implemented
- ❌ `/api/24h-activity` - Not implemented
- ❌ `/api/active-pool` - Not implemented

---

## VI. REST vs WebSocket Usage Analysis

### Current Data Flow (Observed)

```
┌────────────────┐
│  FX5 Scanner   │ (30s intervals)
│  Service       │
└────────┬───────┘
         │
         ├──────> Stage-3 Cache Update
         │
         └──────> WebSocket emit: scan_tick (FULL PAYLOAD)
                           │
                           ├─> krakenUniverseSize
                           ├─> cycleId
                           ├─> evaluatedCount
                           ├─> eligibleCount
                           ├─> activePoolCount
                           ├─> activeFilteredPool[]
                           └─> nextScanInMs
```

**Finding**: WebSocket provides FULL data payload, not just invalidation trigger.

### Expected Data Flow (Phase 8.6.10)

```
┌────────────────┐
│  FX5 Scanner   │ (30s intervals)
│  Service       │
└────────┬───────┘
         │
         ├──────> Database (persist scan results)
         │
         └──────> WebSocket emit: scan_tick
                  (scanCycleId ONLY - triggers invalidation)
                           │
                           ▼
                  ┌─────────────────┐
                  │ Frontend         │
                  │ Query Invalidate │
                  └─────────┬───────┘
                            │
                            ▼
                   REST API Queries:
                   - /api/scan-summary
                   - /api/24h-activity
                   - /api/active-pool
```

**Violation**: Current implementation bypasses REST API entirely, using WebSocket for data delivery.

---

## VII. Missing Endpoint Impact Assessment

### Impact on Filter Insights UI

**Section 1: Real-Time Scan Metrics**
- ❌ Cannot use `/api/scan-summary` (doesn't exist)
- ⚠️ Must use WebSocket `scan_tick` event
- **Risk**: Multiple sources of truth, data consistency issues

**Section 2: 24-Hour Activity**
- ⚠️ Must use alternative path `/api/paper-sim/diagnostics/scan-24h`
- **Risk**: Payload structure mismatch, field name differences

**Section 3: Active Pool Table**
- ❌ Cannot use `/api/active-pool` (doesn't exist)
- ⚠️ Must use WebSocket `scan_tick.activeFilteredPool`
- **Risk**: No historical active pool data, WebSocket-only access

**Section 4: Filter Breakdown**
- ✅ Can use WebSocket `scanner:breakdown` event
- ⚠️ No REST API alternative for querying breakdown history

---

## VIII. Restoration Requirements

### Phase 1: Create Missing REST Endpoints

**Endpoint 1: `/api/scan-summary`**
```typescript
apiRouter.get('/scan-summary', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
  const mode = req.mode!;
  
  // Query Stage-3 cache or database for latest scan summary
  const summary = await getLatestScanSummary(mode);
  
  res.json({
    krakenUniverseSize: summary.krakenUniverseSize,
    scanCycleId: summary.scanCycleId,
    lastScanCompletedAt: summary.lastScanCompletedAt,
    evaluatedCount: summary.evaluatedCount,
    eligibleCount: summary.eligibleCount,
    ineligibleCount: summary.ineligibleCount,
    cadenceMs: summary.cadenceMs,
    cyclesPerHour: summary.cyclesPerHour,
  });
});
```

**Endpoint 2: `/api/24h-activity`**
```typescript
apiRouter.get('/24h-activity', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
  const mode = req.mode!;
  
  // Query 24h aggregator or database
  const metrics = await scan24hAggregator.getMetrics(mode);
  
  res.json({
    totalEvaluated: metrics.totalEvaluated,
    uniqueEvaluated: metrics.uniqueEvaluated,
    totalSurvived: metrics.totalSurvived,
    uniqueSurvived: metrics.uniqueSurvived,
    cyclesLast24h: metrics.totalCycles, // Rename field
    breakdown: metrics.breakdown,
  });
});
```

**Endpoint 3: `/api/active-pool`**
```typescript
apiRouter.get('/active-pool', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
  const mode = req.mode!;
  
  // Query Stage-3 cache for active filtered pool
  const activePool = await getActiveFilteredPool(mode);
  
  res.json({
    count: activePool.length,
    entries: activePool.map(entry => ({
      symbol: entry.symbol,
      status: entry.status || 'eligible',
      firstSeen: entry.firstSeen,
      lastUpdated: entry.lastUpdated,
      expiresAt: entry.expiresAt || null,
    })),
  });
});
```

**Endpoint 4: `/api/filters/reset`**
```typescript
apiRouter.post('/filters/reset', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const mode = req.mode!;
  
  // Reset to default filter values
  const defaultFilters = getDefaultScreenerFilters(mode);
  await storage.upsertScreenerFilters({ ...defaultFilters, mode, userId });
  
  res.json({ ok: true, filters: defaultFilters });
});
```

---

### Phase 2: Align Payload Structures

**Fix `/api/paper-sim/diagnostics/scan-24h`**:
1. Remove `{ ok, data }` wrapper (return data directly)
2. Rename `totalCycles` → `cyclesLast24h`
3. Include `breakdown` field in response

---

### Phase 3: Verify Database Schema Support

**Requirements**:
1. Database must persist scan cycle records with timestamps
2. 24h rolling window query capability
3. Active pool tracking with expiry timestamps
4. Mode isolation (separate paper/live data)

---

## IX. Evidence Summary

### Files Audited
- `server/routes.ts` (17,509 lines) - Complete inspection
- `server/services/fx5-scanner.ts` (368 lines) - Scan logic review
- `server/services/scan-24h-aggregator.ts` - Referenced but not inspected

### Grep Searches Conducted
```bash
# Scan-related endpoints
grep -n "GET.*\/api.*scan" server/routes.ts

# Paper-sim diagnostic endpoints
grep -n "\/api\/paper-sim\/diagnostics" server/routes.ts

# Filters endpoints
grep -n "apiRouter\.\(get\|put\|post\).*\/filters" server/routes.ts

# Screeners endpoints
grep -n "apiRouter\.get.*\/screeners" server/routes.ts
```

---

## X. Compliance Status

### Phase 8.6.10 REST API Requirements
- [ ] `/api/scan-summary` endpoint exists
- [ ] `/api/24h-activity` endpoint exists (proper path and payload)
- [ ] `/api/active-pool` endpoint exists
- [ ] `/api/scan-history` endpoint exists
- [ ] All endpoints use mode query parameter
- [ ] WebSocket limited to invalidation trigger only
- [ ] Passive learning mode supported

**Compliance**: 0/7 (0%)

### Filter Insights Requirements
- [x] `/api/settings/filters` endpoint exists
- [x] `/api/screeners` endpoint exists
- [x] `/api/screeners/calibration` endpoint exists
- [ ] All endpoints return correct payload shapes

**Compliance**: 3/4 (75%)

### Overall Backend Endpoint Compliance
**54% compliant** (7/13 endpoints fully implemented)

---

## XI. Risk Assessment

**Severity**: 🚨 **CRITICAL**

**Impact**:
1. **Architectural Violation**: Phase 8.6.10 "REST API as sole source" completely bypassed
2. **Data Consistency Risk**: WebSocket + partial REST creates multiple sources of truth
3. **Passive Mode Risk**: Unknown behavior without REST endpoints
4. **Maintenance Burden**: Mixed data sources complicate debugging and testing

**Mitigation**: Implement all missing REST endpoints per Phase 8.6.10 specification.

---

## XII. Recommendations

### Immediate Actions (REB 2)

1. **Implement Missing Endpoints**: Create `/api/scan-summary`, `/api/24h-activity`, `/api/active-pool`
2. **Fix Payload Structures**: Align `/api/paper-sim/diagnostics/scan-24h` with truth spec
3. **Database Schema Review**: Ensure scan persistence and 24h windowing support
4. **WebSocket Reduction**: Limit `scan_tick` event to `scanCycleId` only (remove full payload)

### Long-Term Actions (REB 3+)

1. **Query Invalidation**: Implement React Query invalidation on `scanCycleId` changes
2. **Frontend Migration**: Update Filter Insights to use REST API exclusively
3. **Integration Testing**: Verify REST endpoints across paper/live modes
4. **Passive Mode Validation**: Test REST API behavior in passive learning mode

---

**Report Generated**: November 22, 2025  
**Audit Phase**: REB 1.1 (Backend Endpoint Verification)  
**Next Audit**: FX5 → ActivePool → Strategy Wiring (REB 1.2)

---

## Notes

This audit confirms that the REST API architecture established in Phase 8.6.10 has been significantly degraded. **4 out of 13 critical endpoints are missing**, forcing Filter Insights UI to rely on WebSocket data delivery instead of the intended REST-only architecture.

The violation of Phase 8.6.10's "REST API as sole authoritative source" directive is **complete and systemic**, not a minor deviation. Restoration will require implementing missing endpoints, fixing payload structures, and migrating frontend components from WebSocket to REST API data sources.

**For REB 2**: Prioritize backend endpoint restoration before frontend changes to establish proper data foundation.
