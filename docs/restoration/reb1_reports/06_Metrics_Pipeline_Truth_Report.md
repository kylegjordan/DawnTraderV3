# REB 1 Report: Metrics Pipeline Audit
**Report ID**: REB1-06  
**Component**: Metrics Data Pipeline (REST API vs WebSocket)  
**Date**: November 22, 2025  
**Priority**: 🚨 CRITICAL  
**Status**: ❌ **ARCHITECTURAL VIOLATION DETECTED**

---

## Executive Summary

**VERDICT**: ❌ **FAIL** — REST API architecture replaced with WebSocket-first approach

The Metrics Pipeline audit confirms a critical architectural violation. Phase 8.6.10 (Nov 18, 2025) established REST API as the sole authoritative data source with WebSocket limited to triggering query invalidation. The current implementation has reverted to WebSocket-first architecture for real-time metrics.

**Key Finding**: Metrics pipeline architectural rollback violates Phase 8.6.10 "REST API as sole authoritative source" directive.

---

## Cross-Reference to REB1-02 (Filter Insights UI)

This audit is closely related to **REB1-02: Filter Insights UI Mapping Audit**, which documented the architectural rollback in detail.

**Shared Findings**:
- WebSocket replaced REST API as primary data source
- `useScanTick()` hook missing (should abstract WebSocket events)
- REST API endpoints removed or changed
- Query invalidation strategy eliminated

**For Complete Technical Details**: See `docs/restoration/reb1_reports/02_Filter_Insights_UI_Truth_Report.md`

---

## Truth State (Phase 8.6.10 - November 18, 2025)

### Metrics Pipeline Architecture

**Data Flow** (Phase 8.6.10):
```
┌────────────────┐
│  WebSocket     │
│  scan_tick     │ ──> Extract scanCycleId only
└────────────────┘         │
                           ▼
                  ┌─────────────────┐
                  │ Invalidate REST  │
                  │ API Queries      │
                  └─────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ /scan-summary │  │ /24h-activity │  │ /active-pool  │
│  (REST API)   │  │  (REST API)   │  │  (REST API)   │
└───────────────┘  └───────────────┘  └───────────────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
                  ┌─────────────────┐
                  │  UI Components   │
                  │  (Filter Insights)│
                  └─────────────────┘
```

**Key Principles**:
1. **WebSocket Role**: Limited to triggering REST API invalidation
2. **Data Source**: REST API endpoints exclusively
3. **Update Mechanism**: Query invalidation, not direct state updates
4. **Consistency**: Single source of truth (backend database)

---

## Current State (November 22, 2025)

### Actual Metrics Pipeline Architecture

**Data Flow** (Current):
```
┌────────────────┐
│  WebSocket     │
│  scan_tick     │ ──> Full payload → UI state
└────────────────┘
        │
┌───────────────────┐
│  WebSocket        │
│  breakdown:paper  │ ──> Full payload → UI state
└───────────────────┘
        │
        └───────────────────┐
                            ▼
                   ┌─────────────────┐
                   │  Filter Insights │
                   │  UI Component    │
                   │  (WebSocket data)│
                   └─────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  REST API       │
                   │  /scan-24h      │ (24h metrics only)
                   └─────────────────┘
```

**Violations**:
1. **WebSocket Role Expanded**: Provides full payload, not just trigger
2. **Data Source Mixed**: WebSocket primary, REST API secondary
3. **Update Mechanism**: Direct state updates from WebSocket events
4. **Consistency Risk**: Multiple sources of truth (WebSocket + REST API)

---

## Phase 8.6.10 Compliance

### Architectural Requirements

| Requirement | Truth State | Current State | Compliance |
|------------|-------------|---------------|-----------|
| WebSocket limited to invalidation | ✅ scanCycleId only | ❌ Full payload | ❌ **VIOLATED** |
| REST API sole authoritative source | ✅ All metrics | ❌ Only 24h data | ❌ **VIOLATED** |
| Query invalidation strategy | ✅ Implemented | ❌ Not implemented | ❌ **VIOLATED** |
| Single source of truth | ✅ Backend DB | ❌ Mixed (WS + REST) | ❌ **VIOLATED** |

**Compliance**: 0/4 (0%)

---

## Metrics Data Sources

### Truth State (Phase 8.6.10)

**REST API Endpoints**:
1. **GET /api/market-scanner/scan-summary?mode={mode}**:
   - `krakenUniverseSize`
   - `scanCycleId`
   - `lastScanCompletedAt`
   - `evaluatedCount`
   - `eligibleCount`
   - `ineligibleCount`
   - `cadenceMs`
   - `cyclesPerHour`

2. **GET /api/market-scanner/24h-activity?mode={mode}**:
   - `totalEvaluated`
   - `uniqueEvaluated`
   - `totalSurvived`
   - `uniqueSurvived`
   - `cyclesLast24h`
   - `breakdown` (filter categories)

3. **GET /api/market-scanner/active-pool?mode={mode}**:
   - `count`
   - `entries[]` (symbol, status, firstSeen, lastUpdated, expiresAt)

**WebSocket Event**:
- **scan_tick**: Only used to extract `scanCycleId` for query invalidation

---

### Current State

**WebSocket Events**:
1. **scan_tick** (primary data source):
   - `krakenUniverseSize`
   - `cycleId`
   - `cycleEndTimestamp`
   - `evaluatedCount`
   - `eligibleCount`
   - `ineligibleCount`
   - `cycleFrequencyMs`
   - `cyclesPerHour`
   - `activePoolCount`
   - `activeFilteredPool[]`
   - `nextScanInMs`

2. **scanner:breakdown** (primary data source):
   - `breakdown` (filter categories)

**REST API Endpoints**:
1. **GET /api/paper-sim/diagnostics/scan-24h?mode=paper**:
   - `totalEvaluated`
   - `uniqueEvaluated`
   - `totalSurvived`
   - `uniqueSurvived`
   - `totalCycles`
   - (24h aggregated metrics only)

2. **GET /api/settings/filters?mode=paper**:
   - Filter threshold settings
   - (Not metrics data)

**Missing REST Endpoints**:
- ❌ `/api/market-scanner/scan-summary`
- ❌ `/api/market-scanner/24h-activity`
- ❌ `/api/market-scanner/active-pool`

---

## Passive Learning Mode Impact

### Expected Behavior (Truth State)

**Passive Learning Mode**:
- REST API endpoints return real scanner metrics
- No active trades executed
- Metrics show actual filter evaluation results
- "Passive Learning" banner displayed in UI

**Data Integrity**:
- Backend database records all scan results
- REST API serves database-sourced metrics
- Historical analysis available via 24h endpoint

---

### Current Behavior (Uncertain)

**Questions Requiring Verification**:
1. Do WebSocket `scan_tick` events emit in passive learning mode?
2. Is breakdown data accurate in passive mode?
3. Are active pool entries tracked correctly?
4. Do 24h metrics aggregate properly?

**Risk**: WebSocket-first architecture may not handle passive mode correctly if events differ between passive and active modes.

---

## Cycle Count Metrics

### Truth State

**Metrics Tracking**:
- `cyclesPerHour` - Calculated from scan cadence
- `cyclesLast24h` - 24h rolling count from database
- `scanCycleId` - Unique identifier per scan

**Source**: REST API endpoints query backend database for authoritative counts

---

### Current State

**Metrics Tracking**:
- `cyclesPerHour` - From WebSocket `scan_tick` event
- `totalCycles` - From REST API `/scan-24h` endpoint
- `cycleId` - From WebSocket `scan_tick` event

**Source**: Mixed (WebSocket for current, REST API for 24h aggregates)

---

## 24h Rolling Window Metrics

### Truth State (Phase 8.6.10)

**Endpoint**: `GET /api/market-scanner/24h-activity?mode={mode}`

**Metrics**:
- `totalEvaluated`: Total pairs evaluated in last 24h
- `uniqueEvaluated`: Unique pairs evaluated in last 24h
- `totalSurvived`: Total passes in last 24h
- `uniqueSurvived`: Unique pairs that passed in last 24h
- `cyclesLast24h`: Scan cycles in last 24h
- `breakdown`: Per-filter failure counts (24h)

**Update Strategy**: Database-backed rolling window, updated on each scan

---

### Current State

**Endpoint**: `GET /api/paper-sim/diagnostics/scan-24h?mode=paper`

**Metrics**:
- `totalEvaluated`
- `uniqueEvaluated`
- `totalSurvived`
- `uniqueSurvived`
- `totalCycles` (vs `cyclesLast24h`)

**Discrepancy**: Different endpoint path, possibly different backend implementation

---

## Restoration Requirements

### Phase 1: Restore REST API Endpoints

**Create or Verify**:
1. `GET /api/market-scanner/scan-summary?mode={mode}`
2. `GET /api/market-scanner/24h-activity?mode={mode}`
3. `GET /api/market-scanner/active-pool?mode={mode}`

**Backend Services**:
- Ensure FX5 scanner populates these endpoints
- Verify database schema supports 24h rolling windows
- Test mode isolation (paper vs live)

---

### Phase 2: Restore Query Invalidation Architecture

**Frontend Changes** (filter-insights.tsx):
1. Remove WebSocket direct state management
2. Implement `useScanTick()` hook for WebSocket abstraction
3. Add REST API queries for all metrics
4. Add query invalidation on `scanCycleId` changes

**Expected Code** (from REB1-02 Report):
```typescript
// Query invalidation on scan_tick events
useEffect(() => {
  if (!scanTick.isLoading && scanTick.scanCycleId) {
    queryClient.invalidateQueries({ 
      queryKey: [`/api/market-scanner/scan-summary?mode=${mode}`] 
    });
    queryClient.invalidateQueries({ 
      queryKey: [`/api/market-scanner/24h-activity?mode=${mode}`] 
    });
    queryClient.invalidateQueries({ 
      queryKey: [`/api/market-scanner/active-pool?mode=${mode}`] 
    });
  }
}, [scanTick.scanCycleId, mode]);
```

---

### Phase 3: Validate Passive Learning Mode

**Test Cases**:
1. Enable passive learning mode
2. Verify REST API endpoints return scanner metrics
3. Confirm no active trades executed
4. Check 24h rolling window aggregates correctly
5. Verify "Passive Learning" banner displays

---

### Phase 4: Verify Cycle Count Accuracy

**Validation**:
1. Compare `cyclesPerHour` calculation methods (WebSocket vs REST API)
2. Verify `cyclesLast24h` matches actual scan count
3. Ensure `scanCycleId` increments correctly
4. Test rolling window behavior across mode switches

---

## Evidence Summary

### Reports Referenced
- **REB1-02**: Filter Insights UI Mapping Audit (complete architectural analysis)

### Truth Files Referenced
- `phase_8.6.10_mapping_1763829567734.md` (REST API architecture)
- `PHASE_8.6.10_COMPLETE_1763829567734.md` (completion verification)
- `phase_8.6.10_verification_1763829567735.md` (field-level validation)

### Current Code Files Audited
- `client/src/components/trading/filter-insights.tsx` (WebSocket-first implementation)

---

## Risk Assessment

**Severity**: 🚨 **CRITICAL**

**Impact**:
1. **Architectural Violation**: Phase 8.6.10 compliance at 0%
2. **Data Consistency Risk**: Multiple sources of truth
3. **Passive Mode Uncertainty**: Unknown behavior in passive learning
4. **Maintenance Burden**: WebSocket + REST API dual maintenance

**Mitigation**: Restore REST API-only architecture per Phase 8.6.10

---

## Compliance Status

### Phase 8.6.10 Metrics Pipeline Requirements
- [ ] REST API sole authoritative source
- [ ] WebSocket limited to invalidation trigger
- [ ] Query invalidation on `scanCycleId` changes
- [ ] All metrics from REST API endpoints
- [ ] 24h rolling window from database
- [ ] Passive learning mode supported
- [ ] Mode isolation (paper vs live)

**Compliance**: 0/7 (0%)

---

## Next Steps

1. **REB 1 completes** — Moving to Task 7 (Master Gap Analysis)
2. **Restoration deferred** — REB 1 is read-only, restoration occurs in REB 2+
3. **Cross-Reference REB1-02** — Detailed architectural comparison already documented

---

**Report Generated**: November 22, 2025  
**Audit Phase**: REB 1 (Truth State Extraction)  
**Next Audit**: Master Gap Analysis (Task 7) - **FINAL TASK**

---

## Notes

This metrics pipeline audit confirms the architectural rollback documented in REB1-02 (Filter Insights UI). The violation of Phase 8.6.10's "REST API as sole authoritative source" directive affects:
- Real-time scan metrics
- 24h aggregated metrics
- Active pool tracking
- Passive learning mode behavior

**For REB 2**: Prioritize restoration of REST API endpoints and query invalidation architecture before addressing individual UI components.
