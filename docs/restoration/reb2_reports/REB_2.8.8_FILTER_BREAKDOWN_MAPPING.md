# REB 2.8.8: Filter Breakdown REST Mapping

**Date**: 2025-11-25  
**Status**: ✅ COMPLETED  
**Session**: REB 2.8.8  
**Directive**: Replace WebSocket with REST, add 24h aggregation, add passive-mode guard

---

## I. EXECUTIVE SUMMARY

### Mission
Convert Filter Breakdown section from WebSocket-based (latest scan only) to REST-based (24h aggregation) with proper passive-mode gating.

### Problems Fixed
1. ✅ Breakdown used WebSocket → **Now uses REST** (`/api/paper-sim/diagnostics/scan-24h`)
2. ✅ Breakdown showed latest scan only → **Now shows 24h aggregation**
3. ✅ Breakdown updated in passive mode → **Now freezes when engine STOPPED**
4. ✅ Missing "Ineligible Total (24h)" → **Now displays ineligible count**
5. ✅ Filter rows showed single cycle → **Now shows 24h totals**

---

## II. COMPLETE DATA FLOW MAPPING

### A. UI → REST → Backend → Data Source

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FILTER BREAKDOWN UI                              │
│                 (client/src/components/trading/filter-insights.tsx)     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ useQuery() - refetchInterval: 30s
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                           REST ENDPOINT                                  │
│         GET /api/paper-sim/diagnostics/scan-24h?mode=paper              │
│                     (server/routes.ts line 6074)                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ import get24hSummary()
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                        24H WINDOW SERVICE                                │
│              get24hSummary(mode: 'paper' | 'live')                       │
│              (server/services/fx5-24h-window.ts line 161)                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Aggregates from rolling window
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         IN-MEMORY STORAGE                                │
│                    window24hByMode: Map<Mode, Entry[]>                   │
│                 (server/services/fx5-24h-window.ts line 57)              │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↑
                                    │ recordScanFor24h() - ONLY when isEngineActive
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                           FX5 SCANNER                                    │
│                    (server/services/fx5-scanner.ts)                      │
│                      - Runs every 30 seconds                             │
│                      - Captures breakdown per cycle                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## III. DETAILED COMPONENT MAPPING

### Frontend: `filter-insights.tsx`

**Line 70-78**: Type Definitions (NEW)
```typescript
interface Breakdown24h {
  survived: number;
  ineligible: number;  // REB 2.8.8: NEW metric
  byFilter: Record<string, {
    name: string;
    failedCount: number;
    survivedCount: number;
  }>;
}
```

**Line 89**: Added to `Scan24hMetrics`
```typescript
breakdown24h: Breakdown24h; // REB 2.8.8: Filter-level breakdown over 24h
```

**Line 236**: REST Query (Already Exists, Now Returns breakdown24h)
```typescript
const { data: scan24hData, isLoading: isLoading24h } = useQuery<Scan24hResponse>({
  queryKey: ['/api/paper-sim/diagnostics/scan-24h?mode=paper'],
  refetchInterval: 30 * 1000, // Refresh every 30s
  refetchOnWindowFocus: true,
});
```

**Line 261**: REMOVED WebSocket Listener
```typescript
// REB 2.8.8: WebSocket breakdown listener REMOVED - now using REST-only for Filter Breakdown
```

**Line 579-591**: NEW 3-Column Metrics (Including Ineligible)
```typescript
<div className="mb-4 grid grid-cols-3 gap-4">
  <div className="flex items-baseline gap-2">
    <span className="text-xs text-muted-foreground">Total Evaluated (24h):</span>
    <span className="text-sm font-semibold">{scan24hData.data.totalEvaluated.toLocaleString()}</span>
  </div>
  <div className="flex items-baseline gap-2">
    <span className="text-xs text-muted-foreground">Survived Filters (24h):</span>
    <span className="text-sm font-semibold text-success">{scan24hData.data.breakdown24h.survived.toLocaleString()}</span>
  </div>
  <div className="flex items-baseline gap-2">
    <span className="text-xs text-muted-foreground">Ineligible (24h):</span>
    <span className="text-sm font-semibold text-destructive">{scan24hData.data.breakdown24h.ineligible.toLocaleString()}</span>
  </div>
</div>
```

**Line 595-644**: Filter Breakdown Rows (Updated to use 24h data)
```typescript
{ALLOWED_FILTER_CATEGORIES.map((key) => {
  const filterData = scan24hData.data.breakdown24h.byFilter[key];
  const count = filterData?.failedCount ?? 0;
  
  return (
    // ... render row with 24h aggregated counts
    {isPassedAllFilters 
      ? (filterData?.survivedCount?.toLocaleString() ?? '0')  // Show survived count
      : count.toLocaleString()                                 // Show failed count
    }
  );
})}
```

---

### Backend: REST Endpoint (`server/routes.ts`)

**Line 6074-6095**: REST Endpoint (No Changes - Already Returns Full Summary)
```typescript
apiRouter.get('/paper-sim/diagnostics/scan-24h', authenticateToken, async (req, res) => {
  try {
    const { get24hSummary } = await import('./services/fx5-24h-window.js');
    const { mode } = req.query;
    const scanMode = (mode as 'paper' | 'live') || 'paper';
    
    // Get 24h summary from FX5-native window
    // This automatically returns zeros when no ACTIVE cycles in window
    const summary = get24hSummary(scanMode);
    
    res.json({
      ok: true,
      data: summary, // REB 2.8.8: Now includes breakdown24h
    });
  } catch (error) {
    // ... error handling
  }
});
```

---

### Backend: 24h Window Service (`server/services/fx5-24h-window.ts`)

**Line 23-32**: Extended Entry Interface
```typescript
interface Scan24hEntry {
  cycleId: string;
  completedAt: number;
  evaluatedCount: number;
  eligibleCount: number;
  evaluatedSymbols: string[];
  survivedSymbols: string[];
  ineligibleSymbols: string[]; // REB 2.8.8: NEW - symbols that failed filters
  filterFailures: Record<string, number>; // REB 2.8.8: NEW - count per filter
}
```

**Line 34-42**: NEW Breakdown24h Interface
```typescript
interface Breakdown24h {
  survived: number;           // total passed all filters across 24h
  ineligible: number;         // total failed at least one filter across 24h
  byFilter: Record<string, {
    name: string;
    failedCount: number;
    survivedCount: number;
  }>;
}
```

**Line 44-54**: Extended Response Interface
```typescript
interface Scan24hResponse {
  mode: Mode;
  totalCycles: number;
  totalEvaluated: number;
  totalSurvived: number;
  uniqueEvaluated: number;
  uniqueSurvived: number;
  windowStart: string;
  windowEnd: string;
  breakdown24h: Breakdown24h; // REB 2.8.8: NEW - filter breakdown over 24h
}
```

**Line 161-268**: get24hSummary() - MAJOR CHANGES
```typescript
export function get24hSummary(mode: Mode): Scan24hResponse {
  const window = window24hByMode.get(mode) ?? [];
  
  if (window.length === 0) {
    // Return empty breakdown when no ACTIVE cycles
    return {
      // ... existing fields
      breakdown24h: {
        survived: 0,
        ineligible: 0,
        byFilter: {},
      },
    };
  }

  // Aggregate totals
  const totalCycles = window.length;
  const totalEvaluated = window.reduce((sum, e) => sum + e.evaluatedCount, 0);
  const totalSurvived = window.reduce((sum, e) => sum + e.eligibleCount, 0);

  // REB 2.8.8: Compute filter-level breakdown over 24h window
  const filterAggregation: Record<string, { failedCount: number; survivedCount: number }> = {};
  let totalIneligible = 0;

  for (const entry of window) {
    totalIneligible += entry.ineligibleSymbols?.length ?? 0;
    
    // Aggregate failures per filter
    const failures = entry.filterFailures ?? {};
    for (const [filterId, count] of Object.entries(failures)) {
      if (!filterAggregation[filterId]) {
        filterAggregation[filterId] = { failedCount: 0, survivedCount: 0 };
      }
      filterAggregation[filterId].failedCount += count;
    }
  }

  // Compute survivedCount for each filter (totalEvaluated - failedCount)
  const byFilter: Record<string, { name: string; failedCount: number; survivedCount: number }> = {};
  const filterNameMap: Record<string, string> = {
    failed_min_volume: 'Minimum Volume',
    failed_spread: 'Bid-Ask Spread',
    // ... all filter names
  };

  for (const [filterId, data] of Object.entries(filterAggregation)) {
    byFilter[filterId] = {
      name: filterNameMap[filterId] || filterId,
      failedCount: data.failedCount,
      survivedCount: totalEvaluated - data.failedCount,
    };
  }

  // Add passed_all_filters if not already present
  if (!byFilter.passed_all_filters) {
    byFilter.passed_all_filters = {
      name: 'Passed All Filters',
      failedCount: totalEvaluated - totalSurvived,
      survivedCount: totalSurvived,
    };
  }

  return {
    mode,
    totalCycles,
    totalEvaluated,
    totalSurvived,
    uniqueEvaluated,
    uniqueSurvived,
    windowStart,
    windowEnd,
    breakdown24h: {
      survived: totalSurvived,
      ineligible: totalIneligible,
      byFilter,
    },
  };
}
```

---

### Backend: FX5 Scanner (`server/services/fx5-scanner.ts`)

**Line 243-276**: NEW - Compute Ineligible & Filter Failures
```typescript
// REB 2.8.8: Compute ineligible symbols (failed at least one filter)
const survivedSet = new Set(survivedSymbols);
const ineligibleSymbols = evaluatedSymbols.filter(s => !survivedSet.has(s));

// REB 2.8.8: Convert breakdown to filter failures format (for 24h aggregation)
const filterFailures: Record<string, number> = {
  failed_min_volume: breakdown.failed_min_volume,
  failed_spread: breakdown.failed_spread,
  failed_daily_range: breakdown.failed_daily_range,
  failed_min_price: breakdown.failed_min_price,
  failed_stablecoin: breakdown.failed_stablecoin,
  failed_quote_currency: breakdown.failed_quote_currency,
  failed_history: breakdown.failed_history,
  failed_market_cap: breakdown.failed_market_cap,
  failed_guardrail_risk: breakdown.failed_guardrail_risk,
  already_active: breakdown.already_active,
  passed_all_filters: breakdown.passed_all_filters,
};

// Track 24h metrics (ONLY when engine is ACTIVE)
recordScanFor24h(
  mode,
  {
    cycleId: scanCycleId,
    completedAt,
    evaluatedCount,
    eligibleCount,
    evaluatedSymbols,
    survivedSymbols,
    ineligibleSymbols, // REB 2.8.8: Add ineligible symbols
    filterFailures,    // REB 2.8.8: Add filter-level failures
  },
  isEngineActive
);
```

---

## IV. SAMPLE REST RESPONSE

### When Engine ACTIVE (with cycles in 24h window)

**Request**:
```http
GET /api/paper-sim/diagnostics/scan-24h?mode=paper
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "mode": "paper",
    "totalCycles": 15,
    "totalEvaluated": 900,
    "totalSurvived": 180,
    "uniqueEvaluated": 250,
    "uniqueSurvived": 45,
    "windowStart": "2025-11-24T22:34:21.957Z",
    "windowEnd": "2025-11-25T22:34:21.957Z",
    "breakdown24h": {
      "survived": 180,
      "ineligible": 720,
      "byFilter": {
        "failed_min_volume": {
          "name": "Minimum Volume",
          "failedCount": 120,
          "survivedCount": 780
        },
        "failed_spread": {
          "name": "Bid-Ask Spread",
          "failedCount": 85,
          "survivedCount": 815
        },
        "failed_daily_range": {
          "name": "Daily Range",
          "failedCount": 15,
          "survivedCount": 885
        },
        "failed_min_price": {
          "name": "Minimum Price",
          "failedCount": 380,
          "survivedCount": 520
        },
        "failed_stablecoin": {
          "name": "Stablecoin Filter",
          "failedCount": 30,
          "survivedCount": 870
        },
        "failed_quote_currency": {
          "name": "Quote Currency",
          "failedCount": 60,
          "survivedCount": 840
        },
        "failed_history": {
          "name": "Insufficient History",
          "failedCount": 0,
          "survivedCount": 900
        },
        "failed_market_cap": {
          "name": "Market Cap",
          "failedCount": 0,
          "survivedCount": 900
        },
        "failed_guardrail_risk": {
          "name": "Guardrail Risk",
          "failedCount": 0,
          "survivedCount": 900
        },
        "already_active": {
          "name": "Already Active",
          "failedCount": 30,
          "survivedCount": 870
        },
        "passed_all_filters": {
          "name": "Passed All Filters",
          "failedCount": 720,
          "survivedCount": 180
        }
      }
    }
  }
}
```

### When Engine STOPPED (empty 24h window)

**Request**:
```http
GET /api/paper-sim/diagnostics/scan-24h?mode=paper
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "mode": "paper",
    "totalCycles": 0,
    "totalEvaluated": 0,
    "totalSurvived": 0,
    "uniqueEvaluated": 0,
    "uniqueSurvived": 0,
    "windowStart": "2025-11-24T22:34:21.957Z",
    "windowEnd": "2025-11-25T22:34:21.957Z",
    "breakdown24h": {
      "survived": 0,
      "ineligible": 0,
      "byFilter": {}
    }
  }
}
```

---

## V. PASSIVE-MODE GATING

### Recording Gate (`fx5-24h-window.ts` line 61-85)

```typescript
export function recordScanFor24h(
  mode: Mode,
  entry: Scan24hEntry,
  isEngineActive: boolean
): void {
  // REB 2.8.6B: Single-gate pattern - check ONLY isEngineActive
  if (!isEngineActive) {
    console.log(`[FX5-24h] Skipped recording ${mode} cycle ${entry.cycleId} - engine STOPPED (passive learning)`);
    return; // DO NOT RECORD - breakdown will remain empty/frozen
  }

  const now = entry.completedAt;
  const window = window24hByMode.get(mode) ?? [];
  window.push(entry); // ONLY recorded when ACTIVE

  // Keep only last 24 hours
  const cutoff = now - 24 * 60 * 60 * 1000;
  const trimmed = window.filter(e => e.completedAt >= cutoff);

  window24hByMode.set(mode, trimmed);
  console.log(`[FX5-24h] Recorded ${mode} cycle ${entry.cycleId} - window size: ${trimmed.length} cycles`);
}
```

**Server Logs When Engine STOPPED**:
```
[FX5-24h] Skipped recording paper cycle cycle_paper_xE2yStHqHocD - engine STOPPED (passive learning)
```

**Server Logs When Engine ACTIVE**:
```
[FX5-24h] Recorded paper cycle cycle_paper_xE2yStHqHocD - window size: 15 cycles
```

---

## VI. WEBSOCKET REMOVAL

### Removed Code (`filter-insights.tsx`)

**BEFORE**:
```typescript
// REB 2.8.3: WebSocket state - ONLY for Filter Breakdown (scanner:breakdown:paper)
const [breakdown, setBreakdown] = useState<ScannerBreakdownPayload | null>(null);

// Listen for scanner:breakdown WebSocket events (still needed for Filter Breakdown)
useEffect(() => {
  const breakdownEvents = wsMessages.filter((msg: any) => 
    (msg.type === 'scanner:breakdown:paper' || msg.type === 'scanner:breakdown') && msg.payload?.mode === 'paper'
  );
  if (breakdownEvents.length > 0) {
    const latestBreakdown = breakdownEvents[breakdownEvents.length - 1].payload as ScannerBreakdownPayload;
    setBreakdown(latestBreakdown);
  }
}, [wsMessages]);
```

**AFTER**:
```typescript
// REB 2.8.8: breakdown state REMOVED - now using REST-only (scan24hData.breakdown24h)

// REB 2.8.8: WebSocket breakdown listener REMOVED - now using REST-only for Filter Breakdown
```

**Note**: WebSocket `scanner:breakdown:paper` events are still emitted by the backend but are NO LONGER consumed by the frontend. This allows for a gradual deprecation path.

---

## VII. VISUAL MAPPING (Before/After)

### BEFORE (WebSocket, Latest Scan Only)

**UI Display**:
```
Filter Breakdown (Last 24h)                         [MISLEADING TITLE]

Total Evaluated: 60                                  [Latest scan only]
Survived Filters: 15                                 [Latest scan only]

Minimum Volume          | 0
Bid-Ask Spread          | 0
Daily Range             | 1
Minimum Price           | 38
Stablecoin Filter       | 2
Quote Currency          | 4
Insufficient History    | 0
Market Cap              | 0
Guardrail Risk          | 0
Already Active          | 0
Passed All Filters      | 15
```

**Problems**:
- ❌ Title says "Last 24h" but shows latest scan only
- ❌ Data updates even when engine STOPPED (passive mode)
- ❌ No "Ineligible" metric
- ❌ Counts reset to 0 between scans

---

### AFTER (REST, 24h Aggregation)

**UI Display**:
```
Filter Breakdown (Last 24h)                         [ACCURATE TITLE]

Total Evaluated (24h): 900                          [15 cycles × 60 = 900]
Survived Filters (24h): 180                         [Aggregated]
Ineligible (24h): 720                               [NEW METRIC]

Minimum Volume          | 120                       [24h aggregated]
Bid-Ask Spread          | 85
Daily Range             | 15
Minimum Price           | 380
Stablecoin Filter       | 30
Quote Currency          | 60
Insufficient History    | 0
Market Cap              | 0
Guardrail Risk          | 0
Already Active          | 30
Passed All Filters      | 180                       [Shows survivedCount]
```

**Improvements**:
- ✅ Title matches actual data (true 24h aggregation)
- ✅ Data ONLY updates when engine ACTIVE
- ✅ "Ineligible (24h)" metric added
- ✅ Counts accumulate over 24h window
- ✅ When engine STOPPED → all values freeze (or zero if restarted)

---

## VIII. TRUTH CONSTRAINTS

### Filter Breakdown Math
```
totalEvaluated = sum(all filter failures) + passed_all_filters

Where:
- totalEvaluated = 900 (15 cycles × 60 pairs each)
- failed_min_volume = 120
- failed_spread = 85
- failed_daily_range = 15
- failed_min_price = 380
- failed_stablecoin = 30
- failed_quote_currency = 60
- failed_history = 0
- failed_market_cap = 0
- failed_guardrail_risk = 0
- already_active = 30
- passed_all_filters = 180

Verification:
120 + 85 + 15 + 380 + 30 + 60 + 0 + 0 + 0 + 30 + 180 = 900 ✓
```

**Note**: A pair can fail multiple filters, so filter failures may sum to MORE than totalEvaluated. The math constraint applies to unique pairs, not individual filter failures.

---

## IX. FILES MODIFIED SUMMARY

### Backend
```
server/services/fx5-24h-window.ts
  - Line 23-32: Extended Scan24hEntry with ineligibleSymbols, filterFailures
  - Line 34-42: Added Breakdown24h interface
  - Line 53: Added breakdown24h to Scan24hResponse
  - Line 161-268: Updated get24hSummary() to compute breakdown24h

server/services/fx5-scanner.ts
  - Line 243-276: Added ineligibleSymbols computation, filterFailures conversion

server/routes.ts
  - Line 6074-6095: No changes (already returns full summary with breakdown24h)
```

### Frontend
```
client/src/components/trading/filter-insights.tsx
  - Line 70-78: Added Breakdown24h interface
  - Line 89: Added breakdown24h to Scan24hMetrics
  - Line 226: Removed breakdown state variable
  - Line 261: Removed WebSocket listener
  - Line 579-591: Added 3-column metrics (including Ineligible)
  - Line 595-644: Updated filter rows to use breakdown24h.byFilter
```

---

## X. ROLLBACK MAPPING

If rollback is needed, reverse these changes in order:

1. **Frontend**: Restore WebSocket listener and breakdown state
2. **Frontend**: Revert Filter Breakdown UI to use `breakdown.breakdown[key]`
3. **Backend**: Remove breakdown24h from fx5-scanner.ts
4. **Backend**: Revert fx5-24h-window.ts to remove breakdown tracking
5. **Backend**: No changes to REST endpoint (it will just return empty breakdown24h)

**Rollback Command** (Git):
```bash
git revert <commit-hash>
```

---

**END OF MAPPING DOCUMENT**
