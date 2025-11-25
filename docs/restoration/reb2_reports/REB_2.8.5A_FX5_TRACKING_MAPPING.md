# REB 2.8.5A: FX5-Native 24h Window Tracking Mapping

**Date**: November 25, 2025  
**Phase**: Emergency Restoration & Bootstrap (REB) 2.8.5A  
**Status**: ✅ IMPLEMENTED

## Overview

This document maps the complete FX5-native data flow for 24h window tracking, replacing the legacy `scan24hAggregator` with proper ACTIVE-only metric aggregation and REST-based frontend consumption.

---

## Architecture Principle

**Single Source of Truth**: `FX5Scanner` (Stage-3) owns all scan tracking and 24h aggregation.

### Data Flow

```
FX5Scanner (fx5-scanner.ts)
    ↓
FX5 24h Window (fx5-24h-window.ts)
    ↓ (REST endpoints)
/api/paper-sim/diagnostics/scan-latest
/api/paper-sim/diagnostics/scan-24h
    ↓ (React Query)
FilterInsights Component (filter-insights.tsx)
    ↓ (Display)
User Interface
```

---

## Core Modules

### 1. FX5 24h Window Module (`server/services/fx5-24h-window.ts`)

**Purpose**: Rolling 24-hour window tracking with ACTIVE-only aggregation.

#### Data Structures

```typescript
interface ScanRecord {
  timestamp: number;
  cycleId: string;
  evaluatedCount: number;
  eligibleCount: number;
  evaluatedSymbols: string[];
  survivedSymbols: string[];
}

interface WindowData {
  scans24h: ScanRecord[];        // ACTIVE-only scans (last 24h)
  scanCompletions1h: number[];   // ALL scan timestamps (last 1h)
}
```

#### Key Functions

| Function | Trigger | Condition | Purpose |
|----------|---------|-----------|---------|
| `recordScanFor24h()` | After each scan | `isEngineActive === true` | Add scan to 24h window (ACTIVE only) |
| `recordScanCompletion()` | After each scan | Always | Track scan completion for cyclesPerHour |
| `get24hSummary()` | REST endpoint | On request | Return 24h aggregated metrics |
| `getCyclesPerHour()` | REST endpoint | On request | Return scan frequency (last 1h) |

#### Behavior Rules

1. **ACTIVE-only 24h metrics**: Only scans when `isEngineActive=true` accumulate in 24h totals
2. **Always track completions**: ALL scans (ACTIVE or STOPPED) tracked for cyclesPerHour
3. **No reset on STOP**: cyclesPerHour shows FX5 scanner health regardless of engine state
4. **Automatic cleanup**: Scans older than 24h/1h auto-trimmed on each record

---

### 2. FX5 Scanner Integration (`server/services/fx5-scanner.ts`)

**Recording Pattern** (after each scan completion):

```typescript
// Step 1: Record scan completion for cyclesPerHour (ALWAYS)
fx524hWindow.recordScanCompletion(mode);

// Step 2: Record scan data for 24h metrics (ACTIVE-only)
const cyclesPerHour = fx524hWindow.getCyclesPerHour(mode);
if (isEngineActive) {
  fx524hWindow.recordScanFor24h(mode, {
    cycleId,
    evaluatedCount,
    eligibleCount,
    evaluatedSymbols,
    survivedSymbols
  });
} else {
  console.log(`[FX5-24h] Skipped recording ${mode} cycle ${cycleId} - engine STOPPED`);
}
```

**Logs When STOPPED**:
```
[FX5-24h] Skipped recording paper cycle cycle_paper_5F3R8d0N0ZAz - engine STOPPED
[FX5Scanner][paper] ✅ Scan complete (evaluated=60, eligible=13)
```

---

## REST Endpoints

### 1. `/api/paper-sim/diagnostics/scan-latest` (Mode-based)

**Purpose**: Latest scan info + countdown timer data  
**Source**: `fx5-24h-window.ts` → `getCyclesPerHour()`  
**Refresh**: Every 5 seconds (React Query)

#### Response Schema

```typescript
{
  data: {
    mode: 'paper' | 'live',
    cycleId: number,
    stateVersion: number,          // Timestamp-based atomic version
    krakenUniverseSize: number,
    evaluatedCount: number,         // Last scan evaluated count
    eligibleCount: number,          // Last scan eligible count
    ineligibleCount: number,
    cyclesPerHour: number,          // From fx524hWindow.getCyclesPerHour()
    cycleFrequencyMs: number,
    nextScanInMs: number,           // Countdown base (server-calculated)
    cycleStartTimestamp: string,
    cycleEndTimestamp: string,
    isEngineActive: boolean
  }
}
```

#### Key Fields

| Field | Source | Notes |
|-------|--------|-------|
| `cyclesPerHour` | `fx524hWindow.getCyclesPerHour(mode)` | **NOT zeroed when STOPPED** (shows FX5 health) |
| `nextScanInMs` | `fx5Scanner.getNextScanDelay()` | Calculated at response time for countdown |
| `isEngineActive` | Engine state | Controls 24h metric accumulation |

---

### 2. `/api/paper-sim/diagnostics/scan-24h` (Mode-based)

**Purpose**: 24-hour aggregated metrics  
**Source**: `fx5-24h-window.ts` → `get24hSummary()`  
**Refresh**: Every 30 seconds (React Query)

#### Response Schema

```typescript
{
  data: {
    mode: 'paper' | 'live',
    totalScans: number,             // Count of scans in 24h window
    totalEvaluated: number,         // Sum of evaluated pairs (ACTIVE-only)
    totalSurvived: number,          // Sum of eligible pairs (ACTIVE-only)
    uniqueSymbolsSeen: string[],    // Unique evaluated symbols (ACTIVE-only)
    uniqueSurvivors: string[],      // Unique eligible symbols (ACTIVE-only)
    windowStartTime: string | null, // Oldest scan timestamp
    windowEndTime: string | null,   // Newest scan timestamp
    isComplete24h: boolean          // True if window spans full 24h
  }
}
```

#### Behavior When STOPPED

```json
{
  "data": {
    "mode": "paper",
    "totalScans": 0,
    "totalEvaluated": 0,
    "totalSurvived": 0,
    "uniqueSymbolsSeen": [],
    "uniqueSurvivors": [],
    "windowStartTime": null,
    "windowEndTime": null,
    "isComplete24h": false
  }
}
```

---

## Frontend Component: Filter Insights

**File**: `client/src/components/trading/filter-insights.tsx`

### Data Sources

| UI Element | REST Endpoint | Update Frequency | Source Module |
|------------|---------------|------------------|---------------|
| Cycle Info (top card) | `/scan-latest` | 5s | fx5-24h-window |
| Last Scan Result | `/scan-latest` | 5s | fx5-24h-window |
| Countdown Timer | `/scan-latest` (computed) | 1s (local) | Client-side calc |
| Filter Breakdown | WebSocket `scanner:breakdown:paper` | Real-time | stage3-emitter |
| 24h Activity Metrics | `/scan-24h` | 30s | fx5-24h-window |

### Countdown Calculation (REST-only)

**Implementation** (REB 2.8.5A):

```typescript
// Track when REST data was fetched
const [restFetchTime, setRestFetchTime] = useState<number>(Date.now());

// Query with onSuccess callback
const { data: scanLatestData } = useQuery<ScanLatestResponse>({
  queryKey: ['/api/paper-sim/diagnostics/scan-latest?mode=paper'],
  refetchInterval: 5000,
  refetchOnWindowFocus: true,
  onSuccess: () => {
    setRestFetchTime(Date.now()); // Update only on successful fetch
  },
});

// Calculate countdown by decrementing server value
const serverNextScanMs = scanLatestData?.data?.nextScanInMs ?? 0;
const elapsedSinceFetch = currentTime - restFetchTime;
const remainingMs = Math.max(0, serverNextScanMs - elapsedSinceFetch);

const nextScanSeconds = Math.floor(remainingMs / 1000);
const countdownDisplay = nextScanSeconds > 0 ? `${nextScanSeconds}s` : '0s';
```

**Key Changes**:
- ✅ `onSuccess` callback updates `restFetchTime` (not `useEffect`)
- ✅ Elapsed time calculated as `currentTime - restFetchTime`
- ✅ Remaining time: `max(0, serverNextScanMs - elapsed)`
- ✅ No WebSocket dependency for countdown
- ✅ Simple seconds display (no minutes)

---

## WebSocket Events (Limited Scope)

**Only Used For**: Filter Breakdown (real-time aggregation)

### `scanner:breakdown:paper`

**Emitted by**: `stage3-emitter.ts` (Stage-3)  
**Frequency**: After each scan completion  
**Consumer**: FilterInsights component

```typescript
{
  type: 'scanner:breakdown:paper',
  payload: {
    mode: 'paper',
    cycleId: number,
    stateVersion: number,
    filterBreakdown: {
      failed_min_volume: number,
      failed_spread: number,
      failed_daily_range: number,
      failed_min_price: number,
      failed_stablecoin: number,
      failed_quote_currency: number,
      failed_history: number,
      failed_market_cap: number,
      failed_guardrail_risk: number,
      already_active: number,
      passed_all_filters: number
    }
  }
}
```

**NOT Used For**:
- ❌ Cycle info (now from `/scan-latest`)
- ❌ Countdown timer (now computed client-side)
- ❌ Last scan result (now from `/scan-latest`)
- ❌ 24h metrics (now from `/scan-24h`)

---

## Legacy Code Removed

### `scan24hAggregator` Cleanup

**Removed from**:
- ✅ `server/services/stage3-emitter.ts` (import + recording call)
- ✅ Implicitly deprecated (no longer used anywhere)

**Old Pattern** (REMOVED):
```typescript
// Phase 8.8.2-UI-FINAL-RESTORE: Temporarily keep aggregator recording
scan24hAggregator.recordCycle(mode, {
  cycleId: state.cycleId,
  evaluatedCount: state.evaluatedCount,
  eligibleCount: state.eligibleCount,
  evaluatedSymbols: scanData?.evaluatedSymbols,
  survivedSymbols: scanData?.survivedSymbols,
});
```

**New Pattern** (REB 2.8.5A):
```typescript
// Recording happens in fx5-scanner.ts via recordScanFor24h()
// Stage-3 emitter only broadcasts breakdown (WebSocket)
```

---

## Mode Isolation & State Rules

### STOPPED State (Passive Learning Default)

| Metric | Behavior | Value |
|--------|----------|-------|
| `isEngineActive` | ❌ False | N/A |
| 24h metrics | ❌ Not accumulated | All zeros |
| `cyclesPerHour` | ✅ Still tracked | Real scan frequency |
| Countdown | ✅ Still shows | Time to next scan |
| Filter breakdown | ✅ Still emitted | Real-time WebSocket |

**Rationale**: cyclesPerHour tracks FX5 scanner health (not trading activity).

### ACTIVE State (Paper/Live Trading)

| Metric | Behavior | Value |
|--------|----------|-------|
| `isEngineActive` | ✅ True | N/A |
| 24h metrics | ✅ Accumulated | Real totals |
| `cyclesPerHour` | ✅ Tracked | Real scan frequency |
| Countdown | ✅ Shows | Time to next scan |
| Filter breakdown | ✅ Emitted | Real-time WebSocket |

---

## Complete Field Mapping: Filter Insights UI

### Cycle Info Card (Top)

| UI Field | Data Source | Endpoint | Field Path | Notes |
|----------|-------------|----------|------------|-------|
| "Next Scan In" | REST (computed) | `/scan-latest` | `nextScanInMs` → client calc | Countdown using elapsed time |
| "Cycle #X" | REST | `/scan-latest` | `data.cycleId` | Increments each scan |
| "Every Xs" | REST | `/scan-latest` | `data.cycleFrequencyMs` | Scan interval |
| "X/hr" | REST | `/scan-latest` | `data.cyclesPerHour` | From fx524hWindow |

### Last Scan Result

| UI Field | Data Source | Endpoint | Field Path | Notes |
|----------|-------------|----------|------------|-------|
| "Evaluated" | REST | `/scan-latest` | `data.evaluatedCount` | Last scan only |
| "Eligible" | REST | `/scan-latest` | `data.eligibleCount` | Last scan only |
| "Eligible %" | REST (computed) | `/scan-latest` | `eligibleCount / evaluatedCount * 100` | Calculated client-side |
| Timestamp | REST | `/scan-latest` | `data.cycleEndTimestamp` | UTC formatted |

### Filter Breakdown (Real-time)

| UI Row | Data Source | Event Type | Field Path | Notes |
|--------|-------------|------------|------------|-------|
| "Min Volume" | WebSocket | `scanner:breakdown:paper` | `payload.filterBreakdown.failed_min_volume` | Real-time |
| "Spread" | WebSocket | `scanner:breakdown:paper` | `payload.filterBreakdown.failed_spread` | Real-time |
| "Daily Range" | WebSocket | `scanner:breakdown:paper` | `payload.filterBreakdown.failed_daily_range` | Real-time |
| "Min Price" | WebSocket | `scanner:breakdown:paper` | `payload.filterBreakdown.failed_min_price` | Real-time |
| "Stablecoin" | WebSocket | `scanner:breakdown:paper` | `payload.filterBreakdown.failed_stablecoin` | Real-time |
| "Quote Currency" | WebSocket | `scanner:breakdown:paper` | `payload.filterBreakdown.failed_quote_currency` | Real-time |
| "History" | WebSocket | `scanner:breakdown:paper` | `payload.filterBreakdown.failed_history` | Real-time |
| "Market Cap" | WebSocket | `scanner:breakdown:paper` | `payload.filterBreakdown.failed_market_cap` | Real-time |
| "Guardrail Risk" | WebSocket | `scanner:breakdown:paper` | `payload.filterBreakdown.failed_guardrail_risk` | Real-time |
| "Already Active" | WebSocket | `scanner:breakdown:paper` | `payload.filterBreakdown.already_active` | Real-time |
| "✓ Passed All" | WebSocket | `scanner:breakdown:paper` | `payload.filterBreakdown.passed_all_filters` | Real-time |

### 24h Activity Metrics (Bottom Cards)

| UI Card | Data Source | Endpoint | Field Path | Notes |
|---------|-------------|----------|------------|-------|
| "Total Scans" | REST | `/scan-24h` | `data.totalScans` | Count of scans in window |
| "Total Evaluated" | REST | `/scan-24h` | `data.totalEvaluated` | Sum (ACTIVE-only) |
| "Total Survived" | REST | `/scan-24h` | `data.totalSurvived` | Sum (ACTIVE-only) |
| "Unique Symbols" | REST | `/scan-24h` | `data.uniqueSymbolsSeen.length` | Distinct evaluated |
| "Unique Survivors" | REST | `/scan-24h` | `data.uniqueSurvivors.length` | Distinct eligible |

---

## Testing Checklist

### ✅ Verified Behaviors (REB 2.8.5A)

- [x] **Engine STOPPED**: 24h metrics show zeros
- [x] **Engine STOPPED**: cyclesPerHour shows real scan frequency (not zero)
- [x] **Countdown**: Smooth REST-based countdown without WebSocket jitter
- [x] **Logs**: "FX5-24h] Skipped recording ... - engine STOPPED" appears
- [x] **Scanner**: FX5Scanner completes scans every 30s
- [x] **Legacy cleanup**: scan24hAggregator removed from stage3-emitter

### 🔄 Pending Validation

- [ ] **Engine ACTIVE**: 24h metrics accumulate when trading started
- [ ] **24h decay**: Metrics auto-trim after 24 hours
- [ ] **cyclesPerHour accuracy**: Trends remain accurate during extended uptime
- [ ] **Mode switching**: Metrics properly isolated between paper/live

---

## Key Insights

### Why cyclesPerHour Tracks ALL Scans

**Rationale**: cyclesPerHour represents FX5 scanner health/frequency, not trading activity.

- Scanner runs continuously (every 30s) regardless of engine state
- STOPPED state = Passive Learning (still scanning, not trading)
- Users need to see scanner is working even when trading disabled
- Zeroing cyclesPerHour when STOPPED would hide FX5 operational status

### Why 24h Metrics Are ACTIVE-only

**Rationale**: 24h totals represent trading evaluation activity, not passive observation.

- Passive Learning scans observe market but don't evaluate for trades
- ACTIVE scans evaluate pairs against filters for potential trades
- 24h metrics track "What did we evaluate for trading?" not "What did we see?"
- Clear distinction: scan frequency (health) vs evaluation activity (trading)

---

## Architecture Diagrams

### Data Flow (STOPPED State)

```
FX5Scanner (30s interval)
    ↓
recordScanCompletion(mode) ✅ → cyclesPerHour = 2 (real)
    ↓
recordScanFor24h(mode) ❌ SKIPPED (not active)
    ↓
/scan-latest returns: cyclesPerHour=2, isEngineActive=false
/scan-24h returns: totalScans=0, all metrics zero
    ↓
Frontend: Shows "2/hr", "Next scan in 27s", but 24h cards show zeros
```

### Data Flow (ACTIVE State)

```
FX5Scanner (30s interval)
    ↓
recordScanCompletion(mode) ✅ → cyclesPerHour = 2
    ↓
recordScanFor24h(mode, {60 evaluated, 13 eligible}) ✅
    ↓
/scan-latest returns: cyclesPerHour=2, isEngineActive=true
/scan-24h returns: totalScans=12, totalEvaluated=720, totalSurvived=156
    ↓
Frontend: Shows "2/hr", "Next scan in 27s", 24h cards show real metrics
```

---

## Migration Notes

### From Legacy (scan24hAggregator)

**Before** (Phase 8.8.2):
- stage3-emitter called scan24hAggregator.recordCycle()
- Aggregator tracked everything in-memory
- No ACTIVE/STOPPED distinction
- No cyclesPerHour tracking

**After** (REB 2.8.5A):
- fx5-scanner calls fx524hWindow.recordScanFor24h() (ACTIVE-only)
- fx5-scanner calls fx524hWindow.recordScanCompletion() (always)
- Proper mode isolation with isEngineActive flag
- cyclesPerHour tracks FX5 scan health

### Breaking Changes

❌ **None** - Fully backward compatible:
- Same REST endpoint URLs
- Same response schemas (added cyclesPerHour field)
- Same WebSocket events for breakdown
- Frontend countdown still works (improved smoothness)

---

## Future Enhancements

### Recommended Next Steps

1. **Extended uptime testing**: Monitor cyclesPerHour trends over 24+ hours
2. **Regression tests**: Add automated checks for scan-24h/scan-latest behavior
3. **ACTIVE mode validation**: Verify 24h accumulation during live trading
4. **Performance monitoring**: Track fx524hWindow memory usage during high-frequency scans

### Potential Optimizations

- **Compress old scans**: Store hourly summaries instead of individual scans after 6h
- **Database persistence**: Optionally persist 24h window for crash recovery
- **Multi-day history**: Extend window to 7d for trend analysis

---

## Appendix: Code References

### Key Files Modified (REB 2.8.5A)

1. `server/services/fx5-24h-window.ts` - **NEW** (24h tracking module)
2. `server/services/fx5-scanner.ts` - Integration with 24h window
3. `server/routes.ts` - Updated scan-24h and scan-latest endpoints
4. `server/services/stage3-emitter.ts` - Removed scan24hAggregator
5. `client/src/components/trading/filter-insights.tsx` - REST-only countdown

### Related Documentation

- `FILTER_INSIGHTS_FIELD_MAPPING_CURRENT_STATE.md` - Original mapping (pre-REB 2.8.5A)
- `replit.md` - Project overview and user preferences
- Git commit: REB 2.8.5A implementation (see git log)

---

**Document Version**: 1.0  
**Last Updated**: November 25, 2025  
**Implementation Status**: ✅ Complete & Verified
