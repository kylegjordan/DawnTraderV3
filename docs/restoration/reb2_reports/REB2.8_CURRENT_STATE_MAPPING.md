# REB 2.8 – Phase 1: Current-State Mapping for Filter Insights UI

**Status**: Mapping Complete (Phase 1 of 2)  
**Date**: November 23, 2025  
**Mode**: Documentation Only (No Changes)  

---

## TABLE 1: Scan & Filter Overview - Top Card

| Section | UI Label | Current UI Component Path | Current Backend Source | Current Response Property | Transform Logic | Notes |
|---------|----------|---------------------------|------------------------|--------------------------|-----------------|-------|
| **Kraken Universe** | Total Kraken Trading Pairs | `client/src/components/trading/filter-insights.tsx` (line 298-302) | WebSocket event `scan_tick` | `krakenUniverseSize` | `.toLocaleString()` | ✅ Working correctly |
| **Kraken Universe** | Evaluated This Scan | `client/src/components/trading/filter-insights.tsx` (line 303-308) | WebSocket event `scan_tick` | `evaluatedCount` | `.toLocaleString()` | ✅ Working correctly |
| **Kraken Universe** | Eligible This Scan | `client/src/components/trading/filter-insights.tsx` (line 309-319) | WebSocket event `scan_tick` | `eligibleCount` | None | ✅ Working correctly |
| **Kraken Universe** | Eligible Percentage | `client/src/components/trading/filter-insights.tsx` (line 315-317) | Computed client-side | N/A | `(eligibleCount / evaluatedCount * 100).toFixed(1)` | ✅ Working correctly |
| **Kraken Universe** | Ineligible This Scan | `client/src/components/trading/filter-insights.tsx` (line 320-325) | WebSocket event `scan_tick` | `ineligibleCount` | `.toLocaleString()` | ✅ Working correctly |
| **Cycle Info** | Last Scan Cycle ID | `client/src/components/trading/filter-insights.tsx` (line 332-343) | WebSocket event `scan_tick` | `cycleId` | Prefixed with `#` | ✅ Working correctly |
| **Cycle Info** | Next Scan In | `client/src/components/trading/filter-insights.tsx` (line 344-349) | WebSocket event `scan_tick` | `cycleEndTimestamp` | `.toLocaleTimeString()` | ⚠️ **MISLABELED** - Shows "Last scan" not "Next Scan In" (line 333) |
| **Cycle Info** | Last Scan Time | `client/src/components/trading/filter-insights.tsx` (line 357-361) | Client-side countdown | N/A | Computed from `nextScanInMs` and current time | ✅ Working correctly |
| **Cycle Info** | Scan Frequency | `client/src/components/trading/filter-insights.tsx` (line 350-355) | WebSocket event `scan_tick` | `cycleFrequencyMs` | Convert to seconds: `(ms / 1000).toFixed(0)` | ✅ Working correctly |
| **Cycle Info** | Cycles per Hour | `client/src/components/trading/filter-insights.tsx` (line 344-349) | WebSocket event `scan_tick` | `cyclesPerHour` | None | ✅ Working correctly |

---

## TABLE 2: 24h Filter Activity Section

| Section | UI Label | Current UI Component Path | Current Backend Source | Current Response Property | Transform Logic | Notes |
|---------|----------|---------------------------|------------------------|--------------------------|-----------------|-------|
| **24h Filter Activity** | Total Cycles (24h) | `client/src/components/trading/filter-insights.tsx` (line 438-443) | REST API `/api/paper-sim/diagnostics/scan-24h?mode=paper` | `data.totalCycles` | `.toLocaleString()` | ⚠️ **HIDDEN when engine STOPPED** (line 399-426) |
| **24h Filter Activity** | Total Evaluated (24h) | `client/src/components/trading/filter-insights.tsx` (line 444-449) | REST API `/api/paper-sim/diagnostics/scan-24h?mode=paper` | `data.totalEvaluated` | `.toLocaleString()` | ⚠️ **HIDDEN when engine STOPPED** |
| **24h Filter Activity** | Total Survived (24h) | `client/src/components/trading/filter-insights.tsx` (line 450-456) | REST API `/api/paper-sim/diagnostics/scan-24h?mode=paper` | `data.totalSurvived` | `.toLocaleString()` | ⚠️ **HIDDEN when engine STOPPED** |
| **24h Filter Activity** | Unique Evaluated (24h) | `client/src/components/trading/filter-insights.tsx` (line 458-467) | REST API `/api/paper-sim/diagnostics/scan-24h?mode=paper` | `data.uniqueEvaluated` | `.toLocaleString()` | ⚠️ **HIDDEN when engine STOPPED** |
| **24h Filter Activity** | Unique Survived (24h) | `client/src/components/trading/filter-insights.tsx` (line 468-477) | REST API `/api/paper-sim/diagnostics/scan-24h?mode=paper` | `data.uniqueSurvived` | `.toLocaleString()` | ⚠️ **HIDDEN when engine STOPPED** |
| **24h Filter Activity** | Window Start/End | `client/src/components/trading/filter-insights.tsx` (line 479-481) | REST API `/api/paper-sim/diagnostics/scan-24h?mode=paper` | `data.windowStart`, `data.windowEnd` | `.toLocaleString()` | ⚠️ **HIDDEN when engine STOPPED** |
| **24h Filter Activity** | Engine Status Badge | `client/src/components/trading/filter-insights.tsx` (line 372-376) | WebSocket event `trading_state_changed` | `payload.isEngineActive` or `payload.active` | None | ⚠️ Shows "STOPPED" badge when inactive |
| **24h Filter Activity** | Warning Message | `client/src/components/trading/filter-insights.tsx` (line 383-393) | Client-side computed from `engineActive` | N/A | N/A | ⚠️ Shows warning when engine STOPPED: "24h metrics only accumulate when trading engine is ACTIVE" |

**Critical Note**: All 24h metrics show `0` when engine is STOPPED (lines 399-426). This creates misleading UX where data appears to be "zero" rather than "not yet collected."

---

## TABLE 3: Active Filtered Pool Table

| UI Column | UI Label | UI Component Path | Backend Source | Response Property | Transform Logic | Notes |
|-----------|----------|-------------------|----------------|-------------------|-----------------|-------|
| **Column 1** | Symbol | `client/src/components/trading/filter-insights.tsx` (line 527, 537) | WebSocket event `scan_tick` | `activeFilteredPool[].symbol` | None | ✅ Working correctly |
| **Column 2** | Status | `client/src/components/trading/filter-insights.tsx` (line 528, 538-542) | N/A (hardcoded) | N/A | Hardcoded badge: "Passed all filters" | ⚠️ **ALWAYS shows same status** - no dynamic status logic |
| **Column 3** | Price | `client/src/components/trading/filter-insights.tsx` (line 529, 543-545) | WebSocket event `scan_tick` | `activeFilteredPool[].price` | Conditional: `>= 1 ? .toFixed(2) : .toFixed(4)`, prefixed with `$` | ✅ Working correctly |
| **Column 4** | 24h Volume | `client/src/components/trading/filter-insights.tsx` (line 530, 546-548) | WebSocket event `scan_tick` | `activeFilteredPool[].volume24h` | Divide by 1M: `(vol / 1000000).toFixed(2)`, suffix `M`, prefix `$` | ✅ Working correctly |
| **Column 5** | Daily Range | `client/src/components/trading/filter-insights.tsx` (line 531, 549-551) | WebSocket event `scan_tick` | `activeFilteredPool[].dailyRange` | Convert to percent: `(range * 100).toFixed(2)`, suffix `%` | ✅ Working correctly |
| **Summary Field** | Total Active Filtered Pairs | `client/src/components/trading/filter-insights.tsx` (line 558) | WebSocket event `scan_tick` | `activePoolCount` | None | ⚠️ Used in "Showing 20 of X" message |
| **Table Display** | Row Limit | `client/src/components/trading/filter-insights.tsx` (line 535) | Client-side logic | N/A | `.slice(0, 20)` - Shows first 20 rows only | ⚠️ Hard limit: max 20 rows displayed |
| **Empty State** | No Pairs Message | `client/src/components/trading/filter-insights.tsx` (line 514-521) | Conditional rendering | N/A | Shows when `activeFilteredPool.length === 0` | ⚠️ Different from engine STOPPED state |
| **Engine STOPPED** | STOPPED Warning | `client/src/components/trading/filter-insights.tsx` (line 503-513) | WebSocket `trading_state_changed` | `engineActive` | Shows warning: "Active pool only populates when trading engine is ACTIVE" | ⚠️ **COMPLETELY HIDES TABLE when engine STOPPED** |

**Critical Notes**:
- Truth shows columns: **Symbol, Status, First Seen (this window), Last Updated (this cycle)**
- Current implementation shows: **Symbol, Status, Price, 24h Volume, Daily Range**
- ❌ **MISMATCH**: Missing `First Seen` and `Last Updated` columns
- ❌ **MISMATCH**: Extra columns `Price`, `24h Volume`, `Daily Range` not in truth
- The `activeFilteredPool` interface (lines 27-34) includes `firstSeen` and `lastUpdated` but they're **NOT DISPLAYED**

---

## TABLE 4: Filter Breakdown Categories

| Display Order | Category Label | Component Path | Backend Source | Response Property | Count Logic | Notes |
|---------------|----------------|----------------|----------------|-------------------|-------------|-------|
| 1 | Min Volume | `client/src/components/trading/filter-insights.tsx` (line 111, 589-648) | WebSocket `scanner:breakdown:paper` | `breakdown.failed_min_volume` | Direct count | ✅ Working correctly |
| 2 | Max Spread | `client/src/components/trading/filter-insights.tsx` (line 112, 589-648) | WebSocket `scanner:breakdown:paper` | `breakdown.failed_spread` | Direct count | ✅ Working correctly |  
| 3 | Min Daily Range | `client/src/components/trading/filter-insights.tsx` (line 113, 589-648) | WebSocket `scanner:breakdown:paper` | `breakdown.failed_daily_range` | Direct count | ✅ Working correctly |
| 4 | Min Price | `client/src/components/trading/filter-insights.tsx` (line 114, 589-648) | WebSocket `scanner:breakdown:paper` | `breakdown.failed_min_price` | Direct count | ✅ Working correctly |
| 5 | Exclude Stablecoins | `client/src/components/trading/filter-insights.tsx` (line 115, 589-648) | WebSocket `scanner:breakdown:paper` | `breakdown.failed_stablecoin` | Direct count | ✅ Working correctly |
| 6 | Valid Quote Currency | `client/src/components/trading/filter-insights.tsx` (line 116, 589-648) | WebSocket `scanner:breakdown:paper` | `breakdown.failed_quote_currency` | Direct count | ✅ Working correctly |
| 7 | Min Data History | `client/src/components/trading/filter-insights.tsx` (line 117, 589-648) | WebSocket `scanner:breakdown:paper` | `breakdown.failed_history` | Direct count | ✅ Working correctly |
| 8 | Market Cap Range | `client/src/components/trading/filter-insights.tsx` (line 118, 589-648) | WebSocket `scanner:breakdown:paper` | `breakdown.failed_market_cap` | Direct count | ✅ Working correctly |
| 9 | Risk Guardrails | `client/src/components/trading/filter-insights.tsx` (line 119, 589-648) | WebSocket `scanner:breakdown:paper` | `breakdown.failed_guardrail_risk` | Direct count | ✅ Working correctly |
| 10 | Already Active | `client/src/components/trading/filter-insights.tsx` (line 120, 589-648) | WebSocket `scanner:breakdown:paper` | `breakdown.already_active` | Direct count | ✅ Working correctly |
| 11 | Passed All Filters | `client/src/components/trading/filter-insights.tsx` (line 121, 589-648) | WebSocket `scanner:breakdown:paper` | `breakdown.passed_all_filters` | Direct count | ✅ Working correctly |

**Additional Fields per Category**:
- **Description** (lines 96-108, 635-639): Detailed explanation of what each filter does
- **Threshold** (lines 124-128, 220-239, 641-645): Current threshold value from `/api/settings/filters?mode=paper`
- **Badge Variant** (lines 622-632): Color coded based on count:
  - `count > 100`: Destructive (red)
  - `count > 0`: Secondary (yellow/warning)
  - `count === 0`: Success (green checkmark "✓ Pass")

**Notes**:
- All 11 categories defined in `ALLOWED_FILTER_CATEGORIES` (lines 131-143)
- Display names mapped in `FILTER_DISPLAY_NAMES` (lines 110-122)
- Descriptions mapped in `FILTER_DESCRIPTIONS` (lines 96-108)
- Threshold display logic: lines 220-239 (conceptual text for non-numeric filters)

---

## TRUTH SCREENSHOTS

The following truth screenshots have been saved to `docs/truth/filter-insights/`:

1. **FI_truth_top_section_1.png** - Scan & Filter Overview (Kraken Universe + Cycle Info + Last Scan Result)
2. **FI_truth_top_section_2.png** - Scan & Filter Overview (complete view) + 24h Filter Activity  
3. **FI_truth_active_pool.png** - Active Filtered Pool table with correct columns
4. **FI_truth_breakdown.png** - Filter Breakdown (Last 24 Hours) with all categories

---

## CRITICAL DISCREPANCIES IDENTIFIED

### 1. Active Filtered Pool - Column Mismatch ❌

**Truth Columns**:
- Symbol
- Status
- First Seen (this window)
- Last Updated (this cycle)

**Current Implementation Columns**:
- Symbol
- Status
- Price ← **NOT IN TRUTH**
- 24h Volume ← **NOT IN TRUTH**
- Daily Range ← **NOT IN TRUTH**

**Missing Columns**:
- First Seen (this window) ← **DATA EXISTS but NOT DISPLAYED** (line 32: `firstSeen`)
- Last Updated (this cycle) ← **DATA EXISTS but NOT DISPLAYED** (line 33: `lastUpdated`)

### 2. 24h Filter Activity - Misleading Zero Display ⚠️

When trading engine is STOPPED, all 24h metrics show `0` (lines 399-426), creating false impression of "zero activity" rather than "no data yet."

**Truth shows**: Actual accumulated values OR clear indication metrics aren't tracking yet
**Current shows**: Hardcoded `0` values when engine stopped

### 3. Cycle Info - Label Mismatch ⚠️

**Line 333**: Label says "Last scan" but displays `cycleEndTimestamp` formatted as time
**Should be**: "Last Scan Time" showing the timestamp when last scan completed

### 4. Active Pool - Engine State Behavior ⚠️

**Current**: Completely hides entire table when engine STOPPED (lines 503-513)
**Truth**: May show table structure with appropriate messaging, not complete hiding

---

## BACKEND ENDPOINTS REFERENCE

| Endpoint | Purpose | Current Usage |
|----------|---------|---------------|
| WebSocket `scan_tick` | Real-time scan cycle data | Kraken Universe, Cycle Info, Active Pool (lines 169-176) |
| WebSocket `scanner:breakdown:paper` | Real-time filter breakdown | Filter Breakdown section (lines 179-187) |
| WebSocket `trading_state_changed` | Trading engine status | Engine active state tracking (lines 190-200) |
| `/api/paper-sim/diagnostics/scan-24h?mode=paper` | 24h aggregated metrics | 24h Filter Activity section (lines 156-160) |
| `/api/settings/filters?mode=paper` | Current filter thresholds | Threshold display in breakdown (lines 163-166) |

---

## WEBSOCKET EVENT PAYLOADS

### `scan_tick` Event Structure
```typescript
interface ScanTickPayload {
  mode: 'paper' | 'live';
  cycleId: number;
  krakenUniverseSize: number;
  evaluatedCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  cyclesPerHour: number;
  cycleFrequencyMs: number;
  nextScanInMs: number;
  cycleStartTimestamp: string;
  cycleEndTimestamp: string;
  topNCount: number;
  tierBCount: number;
  rotation: {
    topEndUniverseSize: number;
    tierBUniverseSize: number;
  };
  activePoolCount: number;
  activeFilteredPool: ActiveFilteredPair[]; // ← Array of pool entries
}
```

### `scanner:breakdown:paper` Event Structure
```typescript
interface ScannerBreakdownPayload {
  mode: 'paper' | 'live';
  cycleId: number;
  evaluatedCount: number;
  eligibleCount: number;
  breakdown: FilterBreakdown;
  truthConstraintOk: boolean;
}
```

---

## COMPONENT FILE STRUCTURE

**Main Component**: `client/src/components/trading/filter-insights.tsx` (662 lines)
**Page Wrapper**: `client/src/pages/filter-insights.tsx` (17 lines)

**Key Code Sections**:
- Lines 1-144: Imports, interfaces, constants, filter metadata
- Lines 145-264: Component setup, state, queries, WebSocket listeners
- Lines 266-283: Header card with countdown
- Lines 284-365: Scan & Filter Overview section
- Lines 367-485: 24h Filter Activity section  
- Lines 487-564: Active Filtered Pool section
- Lines 566-659: Filter Breakdown section

---

## TEST USER CREDENTIALS

```
Trader Test User:
username: testuser123
password: SecurePass123!
```

---

## NEXT STEPS

**Phase 2** will provide:
1. Corrected mapping table (truth alignment)
2. Full UI specification for each field
3. Required backend changes (if any)
4. Implementation guidance for corrections

**No changes made in Phase 1** - This is mapping-only documentation.

---

*End of REB 2.8 Phase 1 Current-State Mapping*
