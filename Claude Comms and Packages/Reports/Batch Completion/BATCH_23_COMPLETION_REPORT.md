# Batch 23 — DI Threshold Calibration + Null Reason Expansion
## Batch Completion Report

**Date**: 2026-03-24
**Commits**: `bafb5770` (Batch 23), `36288df1` (Batch 23 HF)
**Branch**: dawntrader-v4
**Phase**: 14.6
**Actors**: Claude Code (implementor), Langston (reviewer)

---

## 1. Changes Implemented

### DI Threshold Calibration

**Problem**: Trend and Breakout families had 0 survivors. DI thresholds were set at 55/45 (Batch 22 candidate values), then lowered to 25/20 (Batch 23), but actual crypto DI under the 48-candle rolling window formula ranges 3-20 for most pairs.

**Solution**: Empirical recalibration based on observed DI distribution:

| Family Path | Original (B22) | First Calibration (B23) | Empirical (B23 HF) |
|-------------|----------------|------------------------|---------------------|
| active_trend | 55.00 | 25.00 | **12.00** |
| active_breakout | 45.00 | 20.00 | **10.00** |
| vts_trend | 45.00 | 20.00 | **10.00** |
| vts_breakout | 35.00 | 15.00 | **8.00** |

**Rationale**: The 48-candle window DI formula (Efficiency Ratio) produces much lower values than the full-history version that was originally calibrated against. Crypto pairs with genuine trend persistence typically show DI 12-25 under this formula, not 55+.

### Null Reason Expansion

Wired 3 previously unused NullReasonBreakdown categories:
- **maxOpenTrades**: Checks `openVirtualTrades.size >= MAX_OPEN_VIRTUAL_TRADES` before strategy evaluation
- **netEvBelowFloor**: Checks signal Net EV against VTS_NET_EV_FLOOR after generation
- **adxGuard**: Checks ADX < 25 specifically for sma_trend_ride strategy

### Dynamic Null Reason Display

Replaced hard-coded 6-item array in machine-learning.tsx with dynamic `Object.entries()` iteration. Any new null reason key with count > 0 now appears automatically with auto-formatted label.

## 2. Post-Implementation Audit

Preview site verified after each calibration step. Key observations:
- With DI ≥ 25/20: Still 0 survivors for Trend/Breakout (DI failures at 48-52 per cycle)
- With DI ≥ 12/10: Awaiting verification after server accumulates data with new thresholds
- Reversal/Oscillator: Healthy at 55+/56 survivors (unchanged, correctly permissive)
- Signal Rejection Breakdown: Duplicate Position Max at 1,114 (stale — flush issue under investigation)

## 3. Langston Review

Approved with note: DI thresholds are calibration based on live findings, not permanent law. Documentation should be explicit about this. Recommended testing at 20/15 first — actual distribution required even lower (12/10).
