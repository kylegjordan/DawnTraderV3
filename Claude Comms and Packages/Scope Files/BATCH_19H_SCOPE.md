# Batch 19H Scope — Filter Pipeline Diagnostics Tab

**Phase**: 14.5 (visibility enhancement)
**Date**: 2026-03-21
**Status**: APPROVED

## Summary

New "Filter Diagnostics" tab in Machine Learning page providing visibility into the dual-path filter pipeline. Shows per-filter rejection counts, 24h trends, and downstream signal rejection reasons.

## Checklist

1. [ ] Add `patternBreakdown` to `BatchResult` in market-scanner.ts (return existing counter variables)
2. [ ] Add `ScanDiagnostics` interface and in-memory tracking to fx5-scanner.ts
3. [ ] Add per-metric IMF counters (LQ/VN/DI separately) for both quant and pattern paths
4. [ ] Store 24h rolling history of scan diagnostics with automatic pruning
5. [ ] Track total pairs scanned per cycle + all symbols for unique pair counting
6. [ ] Add `GET /api/vts/filter-diagnostics` endpoint to vts.ts
7. [ ] Build FilterDiagnosticsTab component in machine-learning.tsx with 3 tables
8. [ ] TABLE 1: Last Scan Stats (per-filter rejection counts, quant + pattern paths)
9. [ ] TABLE 2: 24h Rolling Aggregates (total scans, total pairs, unique pairs, aggregated breakdowns)
10. [ ] TABLE 3: Signal Rejection Breakdown (from existing skipped-signals-logger)
11. [ ] Auto-refresh at 60s interval, no manual refresh button

## Files Modified

| File | Change |
|------|--------|
| `server/services/market-scanner.ts` | Add `patternBreakdown` to `BatchResult` + return it |
| `server/services/fx5-scanner.ts` | `ScanDiagnostics` tracking, IMF counters, 24h history, getter |
| `server/routes/vts.ts` | `GET /api/vts/filter-diagnostics` endpoint |
| `client/src/pages/machine-learning.tsx` | 5th tab + FilterDiagnosticsTab + types |
