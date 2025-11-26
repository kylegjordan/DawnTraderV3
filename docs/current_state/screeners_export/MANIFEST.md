# Screeners Export Manifest - REB 2.9 Audit

**Export Date:** November 26, 2025  
**Purpose:** Complete collection of all Screener/Filter backend and UI files for REB 2.9 truth comparison and restoration

---

## Export Summary

- **Total Backend Files:** 11
- **Total Frontend Files:** 5
- **Total Files Exported:** 16

---

## A. Backend Files (11 files)

All filter-related logic, scanning services, and API routes.

### Core Scanner Services (5 files)

1. **fx5-scanner.ts**
   - Main FX5 scanning service
   - Orchestrates 30-second scan cycles
   - Integrates with collectMixedBatch for Top-N/Tier-B rotation
   - Manages Active Filter Pool population
   - Records 24h metrics when isEngineActive=true
   - Contains REB 2.8.15 early-cycle diagnostic logging

2. **market-scanner.ts**
   - Implements collectMixedBatch() rotation logic
   - Top-N (100 pairs, 36/cycle) + Tier-B (~1,270 pairs, 24/cycle)
   - Batch-first architecture (Phase 8.6.7)
   - Applies FX5 filters to 60-pair batches
   - Returns survivors, breakdown, and metrics

3. **fx5-24h-window.ts**
   - 24h rolling window aggregation
   - Implements get24hSummary() for Total/Unique Evaluated/Survived metrics
   - Records scan completions (ONLY when isEngineActive=true)
   - Cycles per hour tracking
   - Single-gate pattern (passive learning = !isEngineActive)

4. **stage3-state-cache.ts**
   - Latest scan state cache
   - Stores activePoolCount and activeFilteredPool
   - Provides real-time scanner metrics
   - Used by /api/paper-sim/diagnostics/scan-latest endpoint

5. **stage3-emitter.ts**
   - WebSocket event emissions for Stage-3 updates
   - Emits scan results to connected clients
   - Breakdown broadcasting (filter-level failures)

### Filter Management Services (3 files)

6. **strategy-filters.ts**
   - Filter definitions and configurations
   - FX5 filter criteria (volume, spread, daily range, etc.)
   - Quote currency and stablecoin exclusions

7. **filtered-pairs-service.ts**
   - Legacy filtered pairs service
   - May contain historical filter logic

8. **active-filter-pool.ts**
   - Active Filter Pool management (REB 2.2)
   - Deduplication logic (one entry per symbol, latest wins)
   - 5-minute TTL expiration
   - Pool clearing when isEngineActive=false

### Aggregation & Calibration (2 files)

9. **scan-24h-aggregator.ts**
   - Additional 24h aggregation logic
   - May complement fx5-24h-window.ts

10. **screener-recalibration-task.ts**
    - Screener recalibration scheduling
    - Filter threshold adjustments

### API Routes (1 file)

11. **routes.ts** (FULL FILE)
    - All API endpoints including:
      - `/api/paper-sim/diagnostics/scan-24h?mode={mode}` - 24h metrics
      - `/api/paper-sim/diagnostics/scan-latest?mode={mode}` - Latest scan
      - `/api/screeners` - Filter value updates
      - All other screener-related endpoints

---

## B. Frontend Files (5 files)

All UI components for displaying Screener and filter data.

### Pages (1 file)

1. **pages/filter-insights.tsx**
   - Filter Insights page wrapper
   - Route definition for /filter-insights

### Components (4 files)

2. **components/trading/filter-insights.tsx**
   - Main Filter Insights component (REB 2.8.8+)
   - REST-based 24h metrics polling (30s interval)
   - Latest scan polling (5s interval)
   - Displays:
     - Total/Unique Evaluated (24h)
     - Total/Unique Survived (24h)
     - Active Pool size and table
     - Filter breakdown
   - NO WebSocket listeners for 24h metrics (REB 2.8.3 removed)

3. **components/goals/filters-with-override.tsx**
   - Filter configuration with override capabilities
   - Used in Goals Engine settings

4. **components/goals/screener-filters-tab.tsx**
   - Screener filters tab in Goals Engine
   - Filter management UI

5. **components/dashboard/filter-health-widget.tsx**
   - Dashboard widget displaying filter health
   - May show Active Pool status or filter pass rates

---

## C. Architecture Highlights

### Current Truth State (Nov 26, 2025)

**FX5 Scanner Architecture:**
- **Batch-first design:** 60-pair batches per cycle (Phase 8.6.7)
- **Top-N rotation:** 100 highest-volume pairs, 36/cycle, full coverage ~2.78 cycles
- **Tier-B rotation:** ~1,270 remaining pairs, 24/cycle, full coverage ~53 cycles
- **Scan interval:** 30 seconds (120 cycles per hour)

**24h Metrics (REST-only, REB 2.8.8):**
- **Total Evaluated (24h):** Sum of evaluatedCount (60 per cycle)
- **Unique Evaluated (24h):** Distinct symbols across all cycles
- **Total Survived (24h):** Sum of eligibleCount (filter passers)
- **Unique Survived (24h):** Distinct survivors
- **Active Pool:** Deduped, TTL-managed (5min), cleared when engine stopped

**Single-gate pattern (REB 2.8.5C):**
- **Passive learning:** isEngineActive=false → no 24h recording, no pool population
- **Active trading:** isEngineActive=true → 24h recording enabled, pool active

**Nov 6-15 truth compatibility:**
- Dashboard WebSocket listener preserved (Nov 6-15 truth)
- Filter Insights REST-only (REB 2.8.3 removed WebSocket)
- React Query v5 compatibility (no onError callbacks)

---

## D. Notable Recent Changes

**REB 2.8.14 (Completed):**
- Fixed Dashboard "LATTi Goals & Guardrails" widget regression
- Aligned query patterns with Goals Engine (added retry:2)
- Fixed React Query v5 compatibility (removed deprecated onError)

**REB 2.8.15 (Completed):**
- Comprehensive FX5 Filter Insights truth audit
- Verified all metrics mathematically correct
- Added early-cycle diagnostic logging (first 20 cycles)
- Documented Top-N/Tier-B rotation semantics
- Confirmed REST-only architecture for 24h metrics

---

## E. Files NOT Found (May Not Exist)

The following files/folders were requested but not found in the codebase:

**Backend:**
- apply-filters.ts
- run-filter.ts
- filter-mapper.ts
- filter-config.ts
- server/services/**/rsi*.ts
- server/services/**/macd*.ts
- server/services/**/ema*.ts
- server/services/**/volatility*.ts
- server/services/**/atr*.ts
- server/services/**/trend*.ts
- server/services/**/momentum*.ts
- server/services/**/candle*.ts
- server/services/**/mistrend*.ts
- strategy-filters/** (folder)
- filter-rules/** (folder)
- filters_v2/** (folder)
- active-filters/** (folder)
- fx-filters/** (folder)

**Frontend:**
- client/src/pages/screeners*.tsx (no plural version)
- client/src/components/screeners/** (no folder)
- client/src/components/filter-item*.tsx
- client/src/components/filter-table*.tsx
- client/src/components/screener-table*.tsx
- client/src/components/screener-row*.tsx
- client/src/hooks/use-screeners*.ts
- client/src/hooks/use-filter*.ts
- client/src/ui/** (folder does not exist)
- client/src/constants/** (folder does not exist)

**Note:** The absence of these files may indicate:
1. Simplified architecture (filters handled in existing services)
2. Naming conventions differ from expectations
3. Features consolidated into fewer files
4. Technical indicators integrated directly into scanner logic

---

## F. REB 2.9 Audit Instructions

### Audit Scope

Compare exported files against Nov 6-15 truth state to identify:

1. **Architectural Divergence**
   - Changes to batch-first design
   - Modifications to Top-N/Tier-B rotation logic
   - Alterations to 24h aggregation semantics

2. **Filter Logic Changes**
   - FX5 filter criteria modifications
   - New/removed filter types
   - Threshold adjustments

3. **UI/UX Changes**
   - Filter Insights display logic
   - REST vs WebSocket usage patterns
   - Polling intervals and refresh strategies

4. **Data Flow Changes**
   - Scanner → 24h Window → Cache → REST → UI pipeline
   - Active Pool population and expiration logic
   - Single-gate pattern implementation

### Restoration Priorities

If divergence is found:
1. Verify mathematical correctness (truth audit validates current state)
2. Check Nov 6-15 compatibility (Dashboard WebSocket preserved)
3. Assess impact on user experience
4. Determine if changes are improvements or regressions

### Reference Documents

- **REB_2.8.15_FILTER_INSIGHTS_TRUTH_AUDIT.md:** Complete accounting truth verification
- **Phase 8.6.7 docs:** Original batch-first architecture
- **Nov 6-15 truth files:** Baseline for comparison

---

## G. File Listing

```
docs/current_state/screeners_export/
├── backend/ (11 files)
│   ├── active-filter-pool.ts
│   ├── filtered-pairs-service.ts
│   ├── fx5-24h-window.ts
│   ├── fx5-scanner.ts
│   ├── market-scanner.ts
│   ├── routes.ts
│   ├── scan-24h-aggregator.ts
│   ├── screener-recalibration-task.ts
│   ├── stage3-emitter.ts
│   ├── stage3-state-cache.ts
│   └── strategy-filters.ts
└── frontend/ (5 files)
    ├── components/
    │   ├── dashboard/
    │   │   └── filter-health-widget.tsx
    │   ├── goals/
    │   │   ├── filters-with-override.tsx
    │   │   └── screener-filters-tab.tsx
    │   └── trading/
    │       └── filter-insights.tsx
    └── pages/
        └── filter-insights.tsx
```

---

## H. Next Steps for REB 2.9

1. **Load Nov 6-15 truth baseline**
   - Retrieve original screener/filter files from truth archive
   - Compare file structure and naming

2. **Perform line-by-line diff**
   - Focus on critical logic paths (batch collection, 24h aggregation)
   - Identify functional changes vs refactoring

3. **Validate against REB 2.8.15 truth audit**
   - Cross-reference with accounting TRUTH definitions
   - Ensure no regressions in mathematical correctness

4. **Document restoration plan**
   - Classify changes as: preserve, restore, or hybrid
   - Prioritize by impact on system integrity

5. **Execute restoration (if needed)**
   - Apply fixes in isolated REB 2.9.X tasks
   - Test with early-cycle diagnostics
   - Validate with E2E tests

---

**Manifest Version:** 1.0  
**Export Complete:** ✅ All available screener/filter files collected
