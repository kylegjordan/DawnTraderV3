# Screeners Export - REB 2.9 Audit Ready

This directory contains all Screener/Filter backend and UI files exported on **November 26, 2025** for REB 2.9 truth comparison and restoration.

## Quick Stats

- ✅ **16 files exported** (11 backend + 5 frontend)
- ✅ **Full routes.ts included** (all API endpoints)
- ✅ **Complete FX5 scanner chain** (scanner → aggregation → cache → emitter)
- ✅ **All filter UI components** (Filter Insights + Goals + Dashboard)

## File Organization

```
screeners_export/
├── backend/        → 11 backend services + routes.ts
├── frontend/       → 5 UI components (pages + components)
├── MANIFEST.md     → Complete documentation
└── README.md       → This file
```

## What's Included

### Backend (11 files)
- **Core Scanner:** fx5-scanner.ts, market-scanner.ts
- **24h Metrics:** fx5-24h-window.ts, scan-24h-aggregator.ts
- **State Management:** stage3-state-cache.ts, stage3-emitter.ts
- **Filter Pool:** active-filter-pool.ts, filtered-pairs-service.ts
- **Configuration:** strategy-filters.ts, screener-recalibration-task.ts
- **API Routes:** routes.ts (FULL FILE)

### Frontend (5 files)
- **Main Page:** pages/filter-insights.tsx
- **Filter Insights:** components/trading/filter-insights.tsx (REST-only, REB 2.8.8)
- **Goals Engine:** components/goals/filters-with-override.tsx, screener-filters-tab.tsx
- **Dashboard:** components/dashboard/filter-health-widget.tsx

## Current State Highlights

**Architecture:** Batch-first FX5 (Phase 8.6.7)
- 60-pair batches: 36 Top-N + 24 Tier-B
- 30-second scan cycles
- REST-only 24h metrics (no WebSocket)

**Recent Changes:**
- ✅ REB 2.8.14: Dashboard LATTi widget fix
- ✅ REB 2.8.15: Filter Insights truth audit (all metrics verified correct)

**Truth State:** Nov 6-15 compatible
- Dashboard WebSocket listener: Preserved
- Filter Insights: REST-only (WebSocket removed REB 2.8.3)
- React Query v5: Compatible

## Audit Instructions

1. **Load this export** into comparison tool
2. **Retrieve Nov 6-15 baseline** from truth archive
3. **Compare line-by-line** focusing on:
   - collectMixedBatch() rotation logic
   - 24h aggregation semantics
   - Active Pool management
   - REST endpoint implementations
4. **Cross-reference with REB_2.8.15_FILTER_INSIGHTS_TRUTH_AUDIT.md**
5. **Document restoration plan** (if divergence found)

## See Also

- **MANIFEST.md** - Complete file documentation and architecture overview
- **REB_2.8.15_FILTER_INSIGHTS_TRUTH_AUDIT.md** - Truth verification report
- **Nov 6-15 truth files** - Original baseline for comparison

---

**Export Status:** ✅ COMPLETE  
**Ready for REB 2.9 Audit:** YES
