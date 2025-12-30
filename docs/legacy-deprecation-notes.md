# Legacy Deprecation Notes - FilteredPairsService

## Overview
This document summarizes the deprecation of `FilteredPairsService` as part of Directive 8.8.7 (Filter Synchronization & Legacy Deprecation).

## Problem Statement
Prior to Phase 8.8.7, a critical filter bypass was identified where pairs failing FX5 filters were still generating trading signals. This occurred because:
- The Signal Orchestrator and VTS Runner were using `FilteredPairsService.getValidPairs()` instead of the authoritative `ActiveFilterPool.getActivePool()`
- This resulted in 88 signals being generated when only 1-4 pairs passed the FX5 filters

## Deprecated Component

### FilteredPairsService
- **Original Location**: `server/services/filtered-pairs.service.ts`
- **Renamed To**: `server/services/filtered-pairs.legacy.service.ts`
- **Status**: DEPRECATED (retained for UI analytics only)

## Replacement

### ActiveFilterPool Service
- **Location**: `server/services/active-filter-pool.ts`
- **Method**: `activeFilterPool.getActivePool()`
- **Features**:
  - 5-minute TTL expiry for pool entries
  - Deduplication of pairs
  - 5-minute telemetry logging
  - Initialization verification on server startup

## Affected Components

| Component | Change Made |
|-----------|-------------|
| Signal Orchestrator | Now uses `activeFilterPool.getActivePool()` |
| VTS Runner | Now uses `activeFilterPool.getActivePool()` |
| MarketEvaluationService | Still uses FilteredPairsService (for UI analytics) |

## Remaining Usage

The deprecated `FilteredPairsService` is retained ONLY for:
1. **Dashboard Filter Health Widget** - UI analytics display
2. **Walter Analytics** - Via `MarketEvaluationService` for `/api/filters/diagnostics`

**NOTE**: The Filter Breakdown table in the UI does NOT use FilteredPairsService - it uses `fx5-24h-window.ts` for its data.

## Verification Criteria

Post-implementation validation confirms:
1. Ready-to-Buy signals count ≤ FX5 survivors × strategies
2. No signals generated for pairs not in Active Filter Pool
3. VTS simulation reports identical eligible pairs as Orchestrator logs
4. All verification flags show ✅ in validation logs

## Date
Implemented: December 30, 2024
