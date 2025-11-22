# Phase 8.6.10: UI Metrics Mapping Audit

**Date**: November 18, 2025  
**Status**: ⚠️ INCORRECT MAPPINGS IDENTIFIED  
**Purpose**: Document field mappings between REST API responses and Filter Insights UI

---

## Overview

This document audits the complete mapping between backend REST API responses and the Filter Insights UI component to identify and repair incorrect field mappings.

**Backend Status**: ✅ CORRECT (verified in Phase 8.6.9)  
**REST Endpoints**: ✅ CORRECT (return proper data structures)  
**UI Mappings**: ⚠️ INCORRECT (some fields mapped to wrong sources)

---

## REST API Data Structures

### 1. `/api/market-scanner/scan-summary` Response

**Backend Implementation**:
- **File**: `server/services/market-scanner.ts`
- **Method**: `getLastScanSnapshot()` (lines 522-548)
- **Route**: `server/routes.ts` (line 2318)

**Response Structure**:
```typescript
{
  scanCycleId: string;           // e.g., "cycle_paper_5fTYh6pn7T"
  lastScanCompletedAt: string;   // ISO timestamp
  nextScanEtaMs: number;         // Milliseconds until next scan
  evaluatedCount: number;        // ✅ Total pairs evaluated in last scan
  eligibleCount: number;         // ✅ Pairs that passed all filters
  ineligibleCount: number;       // ✅ Pairs that failed at least one filter
  cadenceMs: number;             // Scan cadence in milliseconds
  breakdown: {                   // ✅ Filter failure breakdown (last scan)
    failed_min_volume: number;
    failed_spread: number;
    failed_daily_range: number;
    failed_min_price: number;
    failed_stablecoin: number;
    failed_quote_currency: number;
    failed_blacklist: number;
    failed_whitelist: number;
    failed_history: number;
    failed_guardrail_risk: number;
    failed_universe_size: number;
    failed_no_strategy_triggered: number;
    failed_already_active: number;
    passed_all_filters: number;
  };
  krakenUniverseSize: number | null;  // Total Kraken trading pairs
  cyclesPerHour: number;              // Cycles per hour metric
}
```

### 2. `/api/market-scanner/24h-activity` Response

**Backend Implementation**:
- **File**: `server/services/market-scanner.ts`
- **Method**: `get24hFilterActivity()` (not shown but referenced)
- **Route**: `server/routes.ts` (line 2269)

**Response Structure**:
```typescript
{
  totalEvaluated: number;        // ✅ Total pairs evaluated (24h)
  uniqueEvaluated: number;       // ✅ Unique pairs evaluated (24h)
  totalSurvived: number;         // ✅ Total pairs that passed filters (24h)
  uniqueSurvived: number;        // ✅ Unique pairs that passed filters (24h)
  activePoolSize: number;        // ✅ Current active pool size
  breakdown: {                   // ✅ Cumulative filter breakdown (24h)
    failed_min_volume: number;
    failed_spread: number;
    failed_daily_range: number;
    failed_min_price: number;
    failed_stablecoin: number;
    failed_quote_currency: number;
    failed_blacklist: number;
    failed_whitelist: number;
    failed_history: number;
    failed_guardrail_risk: number;
    failed_universe_size: number;
    failed_no_strategy_triggered: number;
    failed_already_active: number;
    passed_all_filters: number;
  };
  cyclesLast24h: number;         // ✅ Number of scan cycles in 24h
  windowStart: string;           // ISO timestamp
  windowEnd: string;             // ISO timestamp
  windowHours: number;           // Window size in hours
}
```

### 3. `/api/market-scanner/active-pool` Response

**Backend Implementation**:
- **File**: `server/services/market-scanner.ts`
- **Method**: `getActiveFilteredPool()` (not shown but referenced)
- **Route**: `server/routes.ts` (line 2299)

**Response Structure**:
```typescript
{
  mode: string;                  // "paper" or "live"
  count: number;                 // ✅ Number of active pool entries
  entries: Array<{
    symbol: string;              // ✅ Trading pair symbol
    status: 'passed';            // Always 'passed' for active pool
    firstSeen: string;           // ISO timestamp
    lastUpdated: string;         // ISO timestamp
    expiresAt: number;           // Unix timestamp
  }>;
}
```

---

## UI Component Mappings

### Component: `FilterInsights`
**File**: `client/src/components/trading/filter-insights.tsx`

---

## Section 1: Kraken Universe

**UI Field**: "Total Kraken Trading Pairs"

| Field | Component Line | Data Source | JSON Path | Correct? |
|-------|---------------|-------------|-----------|----------|
| Total Kraken Trading Pairs | Line 135 | `/api/market-scanner/scan-summary` | `scanData?.krakenUniverseSize` | ✅ CORRECT |

---

## Section 2: Cycle Info

| UI Field | Component Line | Data Source | JSON Path | Correct? |
|----------|---------------|-------------|-----------|----------|
| Last Scan Cycle ID | Line 145 | `/api/market-scanner/scan-summary` | `scanData?.scanCycleId` | ✅ CORRECT |
| Last Scan Time | Line 149 | `/api/market-scanner/scan-summary` | `scanData?.lastScanCompletedAt` | ✅ CORRECT |
| Next Scan In | Line 153 | `useScanTick()` hook | `scanTick.countdownSeconds` | ✅ CORRECT |
| Scan Frequency | Line 156 | `/api/market-scanner/scan-summary` | `scanData?.cadenceMs` | ✅ CORRECT |
| Cycles per Hour | Line 161 | `/api/market-scanner/scan-summary` | `scanData?.cyclesPerHour` | ✅ CORRECT |

---

## Section 3: Last Scan Result ⚠️ INCORRECT MAPPINGS

| UI Field | Component Line | Current Source | Current JSON Path | Expected Source | Expected JSON Path | Status |
|----------|---------------|----------------|-------------------|-----------------|-------------------|---------|
| **Evaluated This Scan** | **Line 172** | `useScanTick()` / REST | `scanTick.evaluated \|\| scanData?.evaluatedCount` | ✅ Same | ✅ Same | ✅ **CORRECT** |
| **Eligible This Scan** | **Line 176** | `useScanTick()` / REST | `scanTick.eligible \|\| scanData?.eligibleCount` | ✅ Same | ✅ Same | ✅ **CORRECT** |
| **Ineligible This Scan** | **Line 180** | ❌ **CALCULATED** | `Math.max(0, (scanTick.evaluated - scanTick.eligible)) \|\| scanData?.ineligibleCount` | `/api/market-scanner/scan-summary` | `scanData?.ineligibleCount` | ❌ **INCORRECT** |

### Issue #1: Ineligible Count Calculation

**Current Code (Line 180)**:
```tsx
<span className="text-lg font-bold text-muted-foreground">
  {Math.max(0, (scanTick.evaluated || 0) - (scanTick.eligible || 0)) || scanData?.ineligibleCount || 0}
</span>
```

**Problem**:
- Calculates `ineligible = evaluated - eligible` FIRST
- Only falls back to `scanData?.ineligibleCount` if calculation result is 0
- Backend already provides the correct `ineligibleCount` value

**Expected Code**:
```tsx
<span className="text-lg font-bold text-muted-foreground">
  {scanData?.ineligibleCount || 0}
</span>
```

**Impact**: 
- In passive learning mode: Shows `0 - 0 = 0` ✅ Correct by coincidence
- In active trading mode: Shows calculated value instead of backend value ❌ Potentially incorrect if logic differs

---

## Section 4: 24h Filter Activity

| UI Field | Component Line | Data Source | JSON Path | Correct? |
|----------|---------------|-------------|-----------|----------|
| Total Evaluated (24h) | Line 191 | `/api/market-scanner/24h-activity` | `activity24h?.totalEvaluated` | ✅ CORRECT |
| Unique Evaluated (24h) | Line 195 | `/api/market-scanner/24h-activity` | `activity24h?.uniqueEvaluated` | ✅ CORRECT |
| Total Survived Filters (24h) | Line 199 | `/api/market-scanner/24h-activity` | `activity24h?.totalSurvived` | ✅ CORRECT |
| Unique Survived Filters (24h) | Line 203 | `/api/market-scanner/24h-activity` | `activity24h?.uniqueSurvived` | ✅ CORRECT |
| Cycles (24h) | Line 207 | `/api/market-scanner/24h-activity` | `activity24h?.cyclesLast24h` | ✅ CORRECT |

---

## Section 5: Active Filtered Pool

| UI Field | Component Line | Data Source | JSON Path | Correct? |
|----------|---------------|-------------|-----------|----------|
| Total Active Filtered Pairs | Line 220 | `/api/market-scanner/active-pool` | `activePoolResponse?.count \|\| activePool.length` | ✅ CORRECT |
| Symbol | Line 237 | `/api/market-scanner/active-pool` | `entry.symbol` | ✅ CORRECT |
| Status | Line 239 | Hardcoded badge | `"Passed all filters"` | ✅ CORRECT |
| First Seen | Line 244 | `/api/market-scanner/active-pool` | `entry.firstSeen` | ✅ CORRECT |
| Last Updated | Line 247 | `/api/market-scanner/active-pool` | `entry.lastUpdated` | ✅ CORRECT |

---

## Section 6: Filter Breakdown (Last 24 Hours)

**Summary Metrics**:

| UI Field | Component Line | Data Source | JSON Path | Correct? |
|----------|---------------|-------------|-----------|----------|
| Total Evaluated (24h) | Line 278 | `/api/market-scanner/24h-activity` | `activity24h?.totalEvaluated` | ✅ CORRECT |
| Total Survived Filters (24h) | Line 282 | `/api/market-scanner/24h-activity` | `activity24h?.totalSurvived` | ✅ CORRECT |

**Breakdown Rows** (Lines 289-304):

| Filter Reason | Component Line | Data Source | JSON Path | Correct? |
|--------------|---------------|-------------|-----------|----------|
| Min Volume | Line 289-303 | `/api/market-scanner/24h-activity` | `activity24h?.breakdown.failed_min_volume` | ✅ CORRECT |
| Spread | Line 289-303 | `/api/market-scanner/24h-activity` | `activity24h?.breakdown.failed_spread` | ✅ CORRECT |
| Daily Range | Line 289-303 | `/api/market-scanner/24h-activity` | `activity24h?.breakdown.failed_daily_range` | ✅ CORRECT |
| Min Price | Line 289-303 | `/api/market-scanner/24h-activity` | `activity24h?.breakdown.failed_min_price` | ✅ CORRECT |
| Stablecoin | Line 289-303 | `/api/market-scanner/24h-activity` | `activity24h?.breakdown.failed_stablecoin` | ✅ CORRECT |
| Quote Currency | Line 289-303 | `/api/market-scanner/24h-activity` | `activity24h?.breakdown.failed_quote_currency` | ✅ CORRECT |
| Blacklist | Line 289-303 | `/api/market-scanner/24h-activity` | `activity24h?.breakdown.failed_blacklist` | ✅ CORRECT |
| Whitelist | Line 289-303 | `/api/market-scanner/24h-activity` | `activity24h?.breakdown.failed_whitelist` | ✅ CORRECT |
| History | Line 289-303 | `/api/market-scanner/24h-activity` | `activity24h?.breakdown.failed_history` | ✅ CORRECT |
| Guardrail Risk | Line 289-303 | `/api/market-scanner/24h-activity` | `activity24h?.breakdown.failed_guardrail_risk` | ✅ CORRECT |
| Universe Size | Line 289-303 | `/api/market-scanner/24h-activity` | `activity24h?.breakdown.failed_universe_size` | ✅ CORRECT |
| No Strategy Triggered | Line 289-303 | `/api/market-scanner/24h-activity` | `activity24h?.breakdown.strategy_none_triggered` | ✅ CORRECT |
| Already Active | Line 289-303 | `/api/market-scanner/24h-activity` | `activity24h?.breakdown.failed_already_active` | ⚠️ **MISSING** |
| Passed All Filters | Line 305-308 | `/api/market-scanner/24h-activity` | `activity24h?.totalSurvived` | ✅ CORRECT |

### Issue #2: Missing Breakdown Key

**Current Code (Lines 289-292)**:
```tsx
{activity24h?.breakdown && Object.entries(activity24h.breakdown).map(([key, count]) => {
  const displayName = key
    .replace('failed_', '')
    .replace('strategy_none_triggered', 'No Strategy Triggered')
```

**Problem**:
- Uses `Object.entries(activity24h.breakdown)` to dynamically render all breakdown keys
- This SHOULD work correctly and display all keys including `failed_already_active`
- If showing zeros, the backend is returning zeros (not a mapping issue)

**Verification Needed**:
- Check if `activity24h?.breakdown.failed_already_active` exists in the response
- Check if backend is populating this field correctly

---

## WebSocket Data Flow (NOT Used for Filter Insights)

**Hook**: `useScanTick()` (`client/src/hooks/use-scan-tick.tsx`)  
**Context**: `ScanTickContext` (`client/src/contexts/ScanTickContext.tsx`)

**Fields Provided by WebSocket**:
- `scanTick.evaluated` - Used as primary source for "Evaluated This Scan"
- `scanTick.eligible` - Used as primary source for "Eligible This Scan"
- `scanTick.scanCycleId` - Used to trigger REST API invalidation

**Query Invalidation Trigger** (Lines 73-79):
```tsx
useEffect(() => {
  if (!scanTick.isLoading && scanTick.scanCycleId) {
    queryClient.invalidateQueries({ queryKey: [`/api/market-scanner/scan-summary?mode=${mode}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/market-scanner/24h-activity?mode=${mode}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/market-scanner/active-pool?mode=${mode}`] });
  }
}, [scanTick.scanCycleId, mode]);
```

**Behavior**: ✅ CORRECT
- WebSocket `scan_tick` event triggers REST API polling
- REST API responses populate Filter Insights UI
- No direct WebSocket stats consumption

---

## Summary of Issues

### ❌ Issue #1: Ineligible Count Calculation (CONFIRMED)

**Location**: `client/src/components/trading/filter-insights.tsx` Line 180

**Current Behavior**:
```tsx
{Math.max(0, (scanTick.evaluated || 0) - (scanTick.eligible || 0)) || scanData?.ineligibleCount || 0}
```

**Expected Behavior**:
```tsx
{scanData?.ineligibleCount || 0}
```

**Impact**: Medium - Shows calculated value instead of backend authoritative value

---

### ⚠️ Issue #2: Filter Breakdown Showing Zeros (NEEDS VERIFICATION)

**Location**: `client/src/components/trading/filter-insights.tsx` Lines 289-304

**Current Behavior**: Uses `Object.entries(activity24h.breakdown)` to dynamically render

**Possible Causes**:
1. Backend returning zeros (passive learning mode) ✅ Expected behavior
2. Backend not populating breakdown correctly ❌ Backend issue
3. Missing `failed_already_active` key in mapping ❌ Mapping issue

**Verification Required**:
- Capture REST API response during active trading cycle
- Verify `activity24h.breakdown` contains non-zero values
- Check if all breakdown keys are present

---

## Recommended Fixes

### Fix #1: Ineligible Count (IMMEDIATE)

**File**: `client/src/components/trading/filter-insights.tsx`  
**Line**: 180

**Before**:
```tsx
<span className="text-lg font-bold text-muted-foreground">
  {Math.max(0, (scanTick.evaluated || 0) - (scanTick.eligible || 0)) || scanData?.ineligibleCount || 0}
</span>
```

**After**:
```tsx
<span className="text-lg font-bold text-muted-foreground">
  {scanData?.ineligibleCount || 0}
</span>
```

---

### Fix #2: Filter Breakdown (CONDITIONAL - VERIFY FIRST)

**Action**: Verify backend is returning non-zero breakdown values during active trading

**If backend returns zeros**:
- ✅ No UI fix needed (backend issue or passive learning)

**If backend returns non-zero values but UI shows zeros**:
- ❌ Investigate React Query caching or data transformation

---

## Verification Checklist

After applying Fix #1:

- [ ] Start trading engine in paper mode (disable passive learning)
- [ ] Wait for at least 2 scan cycles (60 seconds)
- [ ] Verify "Ineligible This Scan" shows correct value from backend
- [ ] Verify Filter Breakdown shows non-zero values (if active trading)
- [ ] Capture screenshots of all sections
- [ ] Document before/after comparison

---

## Related Documentation

- **Phase 8.6.9**: `docs/phase_8.6.9_audit_logging.md` - Backend metrics audit
- **Phase 8.6.9 Verification**: `docs/phase_8.6.9_verification_results.md` - Backend verification
- **Filter Insights Mapping**: `docs/filter-insights-metrics-mapping.md` - Original mapping doc
- **Project Overview**: `replit.md` - System architecture

---

**Last Updated**: November 18, 2025  
**Status**: ⚠️ 1 Confirmed Issue, 1 Issue Needs Verification
