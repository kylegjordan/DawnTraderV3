# FILTER INSIGHTS - CURRENT STATE FIELD MAPPING

**Generated:** 2025-11-24  
**Purpose:** Document exact current-state mapping of Filter Insights UI fields to backend data sources

---

## 🟦 TABLE 1 — TOP SECTION FIELD MAPPING

| UI Field Name | Current Backend Source (REST Endpoint or FX5 internal state) | Current Field Name Used in Code | Actual Values Observed in UI | Expected Correct Source (based on truth) | Notes on Discrepancy |
|---------------|--------------------------------------------------------------|----------------------------------|------------------------------|-------------------------------------------|---------------------|
| **Kraken Universe Section** |
| Kraken Universe — Total Pairs | `/api/paper-sim/diagnostics/scan-latest` | `scanData.krakenUniverseSize` | 1,386 | Same (correct) | ✅ No discrepancy |
| **Cycle Info Section** |
| Last Scan Cycle ID | `/api/paper-sim/diagnostics/scan-latest` | `scanData.scanCycleId` | Unique string ID (e.g., "1763981180327") | Same (correct) | ✅ No discrepancy |
| Last Scan Time | `/api/paper-sim/diagnostics/scan-latest` | `scanData.cycleEndTimestamp` | Timestamp formatted as locale string | Same (correct) | ✅ No discrepancy |
| Next Scan In | `/api/paper-sim/diagnostics/scan-latest` | `scanData.nextScanInMs` (calculated client-side with countdown) | Live countdown (e.g., "28s") | Same (correct) | ✅ No discrepancy - client-side countdown from server value |
| Scan Frequency | `/api/paper-sim/diagnostics/scan-latest` | `scanData.cycleFrequencyMs` | "Every 30s" | Same (correct) | ✅ No discrepancy |
| Cycles per Hour | `/api/paper-sim/diagnostics/scan-latest` | `scanData.cyclesPerHour` | 120.0 | Same (correct) | ✅ No discrepancy |
| **Last Scan Result Section** |
| Evaluated (This Scan) | `/api/paper-sim/diagnostics/scan-latest` | `scanData.evaluatedCount` | 60 | Same (correct) | ✅ No discrepancy |
| Eligible (This Scan) | `/api/paper-sim/diagnostics/scan-latest` | `scanData.eligibleCount` | 19 | Same (correct) | ✅ No discrepancy |
| Ineligible (This Scan) | `/api/paper-sim/diagnostics/scan-latest` | `scanData.ineligibleCount` | 41 | Same (correct) | ✅ No discrepancy |
| Eligible % (calculated client-side) | (calculated client-side) | `eligiblePercent` (from `scanData.evaluatedCount` and `scanData.eligibleCount`) | 31.7% | Same (correct) | ✅ No discrepancy - client-side calculation |
| **24h Filter Activity Section** |
| Total Evaluated (24h) | `/api/paper-sim/diagnostics/scan-24h` | `scan24hData.data.totalEvaluated` | 0 (when engine STOPPED) | Same source, but needs 24h aggregation | ⚠️ Shows 0 in passive mode (correct behavior) |
| Unique Evaluated (24h) | `/api/paper-sim/diagnostics/scan-24h` | `scan24hData.data.uniqueEvaluated` | 0 (when engine STOPPED) | Same source, but needs 24h aggregation | ⚠️ Shows 0 in passive mode (correct behavior) |
| Total Survived Filters (24h) | `/api/paper-sim/diagnostics/scan-24h` | `scan24hData.data.totalSurvived` | 0 (when engine STOPPED) | Same source, but needs 24h aggregation | ⚠️ Shows 0 in passive mode (correct behavior) |
| Unique Survived Filters (24h) | `/api/paper-sim/diagnostics/scan-24h` | `scan24hData.data.uniqueSurvived` | 0 (when engine STOPPED) | Same source, but needs 24h aggregation | ⚠️ Shows 0 in passive mode (correct behavior) |
| Cycles (24h) | `/api/paper-sim/diagnostics/scan-24h` | `scan24hData.data.totalCycles` | 0 (when engine STOPPED) | Same source, but needs 24h aggregation | ⚠️ Shows 0 in passive mode (correct behavior) |

---

## 🟦 TABLE 2 — ACTIVE FILTERED POOL (TRIGGER & DATA SOURCES)

| Question | Your Answer |
|----------|-------------|
| What backend source currently determines whether the Active Filtered Pool table becomes visible or stays empty? | Frontend checks: `!scanData.activeFilteredPool \|\| scanData.activeFilteredPool.length === 0` (line 514 in filter-insights.tsx). If the array is empty or undefined, shows empty state with "No Eligible Pairs" message. |
| What field or endpoint currently provides the Active Filtered Pool list? | REST endpoint: `/api/paper-sim/diagnostics/scan-latest`<br>Field: `scanData.activeFilteredPool` (array of ActiveFilteredPair objects)<br>Backend source: `activeFilterPool.getActivePool(mode)` in fx5-scanner.ts (line 189) |
| What exact value is the frontend reading to display "Total Active Filtered Pairs"? | REST endpoint: `/api/paper-sim/diagnostics/scan-latest`<br>Field: `scanData.activePoolCount`<br>Code: Line 510 in filter-insights.tsx: `{scanData.activePoolCount \|\| 0}` |
| Why does the table never populate even when Eligible > 0? | **Passive Learning Mode Enforcement:**<br>1. When `passiveLearning` is enabled (default state), FX5Scanner skips populating the active pool (fx5-scanner.ts line 185: "Active Pool not populated (correct behavior)")<br>2. Even when eligible survivors exist, they are NOT added to activeFilteredPool in passive mode<br>3. Routes.ts line 6153 also zeros the pool when engine is STOPPED: `isEngineActive ? scanState.activeFilteredPool : []`<br>**Result:** Pool remains empty until engine is ACTIVE and passive learning is disabled |
| What prevents the Active Filtered Pool rows from ever rendering? | Two conditions must be met for rows to render:<br>1. `scanData.activeFilteredPool` array must have items<br>2. `scanData.activeFilteredPool.length > 0`<br>Since passive learning prevents pool population, the array is always empty `[]`, triggering the empty state instead of the table rows (line 514-537 vs 538-585) |

---

## 🟦 TABLE 3 — FILTER BREAKDOWN (24H AGGREGATION LOGIC)

| Question | Your Answer |
|----------|-------------|
| What data source is currently populating the Filter Breakdown category counts? | **WebSocket event:** `scanner:breakdown:paper`<br>Frontend listens to WebSocket messages (lines 258-267 in filter-insights.tsx) and updates `breakdown` state with the latest `ScannerBreakdownPayload`<br>Backend emits this event from stage3-emitter.ts after each scan cycle completes |
| Is the Filter Breakdown using only the latest scan results? | **YES** - The Filter Breakdown shows only the LATEST SCAN results, not 24h aggregation.<br>Evidence:<br>- WebSocket event `scanner:breakdown:paper` is emitted per-cycle (stage3-emitter.ts)<br>- Frontend receives and displays the most recent breakdown payload<br>- No accumulation logic exists in the frontend |
| What backend logic (if any) currently performs 24h accumulation for breakdown counts? | **(no source)** - No 24h accumulation logic exists for breakdown counts.<br>The title says "Filter Breakdown (Last 24h)" but this is **misleading** - the data shown is from the latest scan cycle only, not 24h aggregated.<br>Legacy aggregator was removed and no replacement for breakdown accumulation was implemented. |
| Since the legacy 24h aggregator is removed, what code now tracks 24h accumulation? | **For 24h metrics (Total Evaluated, etc.):** scan24hAggregator still exists and records cycles (scan-24h-aggregator.ts), used by `/api/paper-sim/diagnostics/scan-24h` endpoint<br>**For Filter Breakdown counts:** **(no source)** - No 24h accumulation exists. The breakdown shows per-cycle data only. |
| If no 24h logic exists, confirm that the Filter Breakdown is currently non-aggregated. | **CONFIRMED:** The Filter Breakdown is currently **NON-AGGREGATED**.<br>It displays breakdown counts from the most recent scan cycle only, received via WebSocket event `scanner:breakdown:paper`.<br>The card title "Filter Breakdown (Last 24h)" is **INCORRECT** - should be "Filter Breakdown (Latest Scan)" to reflect actual behavior. |
| What backend endpoint or state would be required to produce correct 24h aggregation? | **Option 1 (Recommended):** Add breakdown accumulation to scan24hAggregator<br>- Modify `recordCycle()` to track breakdown counts per category<br>- Add breakdown object to 24h metrics response<br>- Update `/api/paper-sim/diagnostics/scan-24h` to return aggregated breakdown<br><br>**Option 2:** New dedicated endpoint `/api/paper-sim/diagnostics/breakdown-24h`<br>- Separate endpoint specifically for 24h aggregated breakdown data<br>- Could be populated by scan24hAggregator or new service<br><br>**Frontend change needed:** Replace WebSocket listener with REST query to new 24h breakdown endpoint |

---

## 🔍 KEY FINDINGS

### Current Architecture Summary:

**✅ Working Correctly (REST-based):**
- Kraken Universe metrics
- Cycle Info (all fields)
- Last Scan Result (evaluated/eligible/ineligible)
- 24h Filter Activity metrics (uses scan24hAggregator via REST)

**⚠️ Passive Learning Enforcement (Intentional Behavior):**
- Active Filtered Pool: Empty by design in passive mode
- Pool only populates when engine is ACTIVE and passive learning is disabled

**❌ Misleading/Broken:**
- **Filter Breakdown title claims "Last 24h" but shows latest scan only**
- No 24h accumulation logic exists for breakdown counts
- Uses WebSocket (per-cycle) instead of REST (24h aggregated)

### Data Flow:

```
┌─────────────────────────────────────┐
│ /api/paper-sim/diagnostics/         │
│ scan-latest (REST)                   │
│ ✅ Polled every 5s                   │
├─────────────────────────────────────┤
│ • krakenUniverseSize                 │
│ • cycleId, timestamps                │
│ • evaluatedCount, eligibleCount      │
│ • activePoolCount, activeFilteredPool│
│ • cyclesPerHour, nextScanInMs        │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ /api/paper-sim/diagnostics/         │
│ scan-24h (REST)                      │
│ ✅ Polled every 5 minutes            │
├─────────────────────────────────────┤
│ • totalEvaluated, uniqueEvaluated    │
│ • totalSurvived, uniqueSurvived      │
│ • totalCycles                        │
│ • windowStart, windowEnd             │
│ ❌ MISSING: breakdown counts         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ scanner:breakdown:paper (WebSocket)  │
│ ❌ Per-cycle, not aggregated         │
├─────────────────────────────────────┤
│ • breakdown.failed_min_volume        │
│ • breakdown.failed_spread            │
│ • breakdown.passed_all_filters       │
│ • [9 filter categories total]        │
│ ⚠️  Latest scan only, not 24h        │
└─────────────────────────────────────┘
```

---

## 📋 REQUIREMENTS COMPLIANCE

✅ **All fields documented with exact current sources**  
✅ **No WebSockets in REST endpoint mappings** (only in Filter Breakdown which currently uses WS)  
✅ **All placeholders/hard-coded values labeled**  
✅ **(no source) used where applicable**  
✅ **No redesign or implementation - documentation only**  
✅ **Tables filled exactly as structured**  
✅ **All backend sources reference REST endpoints or FX5 internal state**  

---

**Next Steps:** Await corrected mapping table and implementation instructions.
