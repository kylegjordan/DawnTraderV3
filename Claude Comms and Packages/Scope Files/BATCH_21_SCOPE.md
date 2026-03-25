# Batch 21 — Telemetry & Calibration Scaffolding

**Date**: 2026-03-23
**Type**: Code batch (server + client)
**Branch**: dawntrader-v4
**Predecessor**: Batch 20 (audit — Architecture B selected)

## Objective

Install telemetry infrastructure needed BEFORE implementing Architecture B (Batch 22). This batch creates the measurement baseline so we can evaluate before/after impact of family-aware filtering.

## Changes

### 1. Expand VTSEvalSnapshot with Null Reason Breakdown
- Export VTSEvalSnapshot from `virtual-trade.interface.ts` (currently internal to vts-runner.ts)
- Add `NullReasonBreakdown` interface with 6 categories: conditionsNotMet, netEvBelowFloor, adxGuard, duplicatePosition, maxOpenTrades, regimeNoStrategies
- Add `totalStrategyEvaluations` counter

### 2. Rename tradesSimulated to signalsGenerated
- VTSCycleMetrics interface: field rename for metric clarity
- vts-runner.ts return statement: corresponding field rename

### 3. Track Null Reasons in VTS Cycle
- Expand counter initialization with nullReasons object
- Increment conditionsNotMet when strategy returns null
- Expand rolling 24h aggregation to sum null reasons

### 4. DI Distribution Logging
- Log actual DI values for all evaluated pairs at end of each VTS cycle
- Tagged `[21][DI_DIST]` for easy extraction and analysis
- Enables threshold calibration from real data

### 5. Dashboard Updates (Machine Learning Page)
- Add "Total Strategy Evaluations" row to Source Pool Summary table
- Add "Null Reason Breakdown" table after By Strategy Breakdown

## Files Modified

| File | Change Type |
|------|-------------|
| `server/types/virtual-trade.interface.ts` | Add VTSEvalSnapshot + NullReasonBreakdown interfaces, rename tradesSimulated |
| `server/services/vts-runner.ts` | Import new types, expand counters, add DI logging, rename field |
| `client/src/pages/machine-learning.tsx` | Add Total Strategy Evaluations row + Null Reason Breakdown table |

## System State Analysis

| Component | Active Trading | Passive Learning (VTS) | Stopped |
|-----------|---|---|---|
| Null reason counters | — | Fire (VTS cycle) | — |
| DI distribution log | — | Fire (VTS cycle) | — |
| totalStrategyEvaluations | — | Fire (VTS cycle) | — |
| ML page display | Shows data | Shows data | Shows stale data |

## Risk Assessment

- **Low risk**: All changes are additive telemetry (new counters, new UI display)
- **No breaking changes**: VTSEvalSnapshot gains new fields with safe defaults
- **Backward compatible**: Existing consumers see new fields as optional additions
- **No API contract changes**: Same endpoint, enriched payload
