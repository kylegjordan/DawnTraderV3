# Change Request CR-001: Active Trades Table Enhancements

**Date:** December 17, 2025  
**Requested By:** Kyle  
**Status:** Implemented  

## Summary

Enhancements to the Active Trades table to improve trading visibility and signal quality monitoring.

## Changes Implemented

### 1. Distance Column: Percentage to Dollar Values

**Before:** Distance to Take Profit (TP) and Stop Loss (SL) were displayed as percentage values relative to current price.

**After:** Distance values are now displayed in **dollar amounts**, representing the actual P/L impact at TP/SL levels.

**Calculation (position-side aware):**

For Long positions:
- `distanceToTPDollars = (takeProfit - currentPrice) * quantity` (positive = profit potential)
- `distanceToSLDollars = (currentPrice - stopLoss) * quantity` (positive = loss buffer)

For Short positions:
- `distanceToTPDollars = (currentPrice - takeProfit) * quantity` (positive = profit potential)
- `distanceToSLDollars = (stopLoss - currentPrice) * quantity` (positive = loss buffer)

**Rationale:** Dollar values provide a more intuitive understanding of potential gains/losses at target and stop levels, making risk assessment more straightforward. Position-side awareness ensures correct signage for both long and short trades.

### 2. CWQI Column Added

**Location:** New column added immediately before the Confidence column.

**Display:** CWQI (Composite Weighted Quality Index) is displayed as a percentage (0-100%), color-coded:
- Green (70%+): High quality signal
- Blue (50-69%): Good quality signal  
- Orange (30-49%): Moderate quality signal
- Red (<30%): Low quality signal

**Source:** CWQI is extracted from the trade's metadata where it was stored at signal promotion time. The extraction checks multiple paths (`metadata.cwqi`, `metadata.sqe.cwqi`, `metadata.signal.cwqi`) for backwards compatibility. Displays "N/A" when CWQI is unavailable.

**Rationale:** CWQI is a key signal quality metric used by the SQE (Signal Quality Evaluator) for filtering. Displaying it allows real-time monitoring of position quality relative to entry signal quality.

## Files Modified

### Backend
- `server/routes.ts`: Added `distanceToTPDollars`, `distanceToSLDollars`, and `cwqi` fields to the `/api/paper-sim/active-trades` endpoint response.

### Frontend  
- `client/src/components/trading/active-trades-v2.tsx`:
  - Updated `ActiveTrade` interface with new fields
  - Modified Distance column to display dollar values
  - Added CWQI column with sortable header
  - Updated sort field types

## Acceptance Criteria

- [x] Distance column displays dollar values instead of percentages
- [x] CWQI column appears before Confidence column
- [x] CWQI is color-coded based on quality thresholds
- [x] Both columns are sortable
- [x] Changes documented in bridge/decisions

## Related Directives

- Phase 8.8.3-C2: Full Cost Transparency (established P/L breakdown pattern)
- Phase 8.8.4-A3: SQE Integrity Enforcement (CWQI as quality gate)
