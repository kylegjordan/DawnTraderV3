# Batch 23 — DI Threshold Calibration + Null Reason Expansion

**Date**: 2026-03-24
**Type**: Code batch (server + client + DB)
**Branch**: dawntrader-v4
**Phase**: 14.6

## Objective

1. Calibrate DI thresholds for trend and breakout families so they produce non-zero survivors
2. Wire up the 3 unused null reason counters (netEvBelowFloor, adxGuard, maxOpenTrades)
3. Update UI to display all active null reasons

## Problem Statement

**DI Thresholds**: Trend family requires DI ≥ 55, Breakout requires DI ≥ 45. Real crypto DI distribution under the 48-candle rolling window formula is typically 15-40. Result: 0 survivors for both families.

**Null Reasons**: 3 of 7 NullReasonBreakdown categories are defined but never incremented:
- `netEvBelowFloor` — VTS_NET_EV_FLOOR exists but no check gate
- `adxGuard` — ADX < 25 guard mentioned but not implemented in VTS
- `maxOpenTrades` — openVirtualTrades.size never compared to limit

## Changes

### 1. DI Threshold Calibration (DB update)

Update screener_filters rows via SQL or seed script:

| Family Path | Current DI_MIN | New DI_MIN | Rationale |
|-------------|---------------|------------|-----------|
| active_trend | 55.00 | 25.00 | Allows pairs with moderate directional persistence |
| active_breakout | 45.00 | 20.00 | Breakout detection needs some directionality, not extreme |
| vts_trend | 45.00 | 20.00 | VTS is more permissive for learning |
| vts_breakout | 35.00 | 15.00 | VTS breakout is most permissive |

Reversal/Oscillator thresholds remain unchanged (already working: 396+ survivors).

### 2. Null Reason Wiring (vts-runner.ts)

Add increment logic for the 3 unused categories:

**netEvBelowFloor**: After signal generation, check if Net EV < VTS_NET_EV_FLOOR. If so, increment counter and log skip.

**adxGuard**: In sma_trend_ride strategy evaluation, if ADX < 25, increment counter.

**maxOpenTrades**: Before strategy evaluation loop, check if openVirtualTrades.size >= MAX_OPEN_TRADES. If so, skip pair and increment counter.

### 3. UI Update (machine-learning.tsx)

Update the hard-coded null reasons array to include any newly-active categories. Make the display dynamic — iterate over all keys in nullReasons that have count > 0 instead of maintaining a static list.

## Files Modified

1. `server/db/seed-family-filters.ts` — Update DI thresholds
2. `server/services/vts-runner.ts` — Wire 3 null reason counters
3. `client/src/pages/machine-learning.tsx` — Dynamic null reason display

## Candidate DI Thresholds

Based on the Batch 20 audit finding that crypto DI under the 48-candle window formula typically ranges 15-40:
- **Trend**: DI 25-100 (want directional persistence, but 25 is achievable)
- **Breakout**: DI 20-100 (need some directionality for expansion)
- **Reversal**: DI 0-35 (unchanged — want choppy conditions)
- **Oscillator**: DI 0-30 (unchanged — want ranging conditions)

These are conservative adjustments. Further calibration may be needed after observing real filter behavior.
