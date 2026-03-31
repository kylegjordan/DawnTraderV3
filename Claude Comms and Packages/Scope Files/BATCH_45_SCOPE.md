# Batch 45 Scope: Strategy Conversion Bottleneck — Root-Cause Fixes

> **Date**: 2026-03-31
> **Baseline**: Commit `20532662` (Batch 44 governance)
> **Branch**: migration/aws-supabase
> **Approved by**: Kyle (directive), Langston (scope review pending)

---

## Purpose

All 17 strategies produce zero signals on staging. Pre-audit of VTS evaluation data reveals specific detect()-level gates that are either structurally broken, near-contradictory, or use hard-coded percentage thresholds that should be ATR-relative (per Batch 18H finding). This batch fixes the dominant kill gates in the 4 highest-volume strategies to unlock signal production.

---

## Pre-Audit Data (VTS cycle on staging, post-Batch 44)

| Strategy | Evaluated | Signals | Primary Kill Reason |
|----------|-----------|---------|-------------------|
| range_trade | 28 | 0 | range_not_found (20), price_position |
| abcd_long | 28 | 0 | price_position (23), breakout_fail |
| vwap_pullback | 15 | 0 | price_position (detectBullishReversal) |
| volatility_edge | 5 | 0 | no_pattern (ABCD metadata) |
| inside_bar_reversal | 2 | 0 | — |
| support_bounce | 2 | 0 | — |

**Null reason totals:** conditionsNotMet=48, familyFilterMismatch=32

---

## Root Causes Found

### 1. vwap_pullback — `detectBullishReversal()` is near-contradictory
**File:** `strategy-engine.ts` line 945
**Bug:** Requires price within 2% of 24h low AND above VWAP simultaneously. These conditions are near-mutually-exclusive — VWAP is usually well above the daily low.
**Fix:** Replace the "near 24h low" check with an ATR-relative pullback depth check. Price should be pulling back toward VWAP from above, not sitting at the daily low.

### 2. abcd_long — Volume gate compares against max volume bar
**File:** `strategy-engine.ts` line 214
**Bug:** Breakout volume must be >= 1.5x the A-point spike volume. But the A-point IS the max-volume bar in the window (by definition of `findSpike()`). Requiring 1.5x the maximum is nearly impossible.
**Fix:** Compare breakout volume against average volume (e.g., 1.3x avg), not against the spike's max volume.

### 3. range_trading — Entry zone fixed at 1.5% of price
**File:** `strategy-engine.ts` line 564
**Bug:** Entry zone is bottom 1.5% of range regardless of range width. For a 10% range, only the bottom 15% qualifies. Combined with boundary touch requirements, this is an extremely narrow window.
**Fix:** Make entry zone proportional to range width (e.g., bottom 20% of range) or ATR-relative.

### 4. General: Hard-coded percentages should be ATR-relative
Multiple strategies use fixed % thresholds for entry zones, breakout confirmation, stop placement, and proximity checks. Per Batch 18H finding, these should scale with ATR.

---

## Objectives

### Objective 1: Fix vwap_pullback detectBullishReversal()
**What:** Replace the near-contradictory "price within 2% of 24h low" check with an ATR-relative pullback check: price is above VWAP, has pulled back within 1.5 * ATR of VWAP, and shows bullish candle confirmation.
**Why:** Current gate is near-impossible to pass. Strategy has never produced a signal.
**Verification:** vwap_pullback produces signals in VTS when price is near VWAP with bullish confirmation. Null rate drops below 100%.

### Objective 2: Fix abcd_long volume comparison
**What:** Change breakout volume comparison from spike-volume reference (max bar) to average-volume reference. Use 1.3x average volume of the lookback period instead of 1.5x the A-point spike volume.
**Why:** Comparing against the maximum by definition ensures near-zero pass rate.
**Verification:** abcd_long produces signals when valid ABCD structure exists with above-average breakout volume.

### Objective 3: Fix range_trading entry zone
**What:** Make entry zone proportional to range width: bottom 20% of the range, with a minimum of 1 ATR below the range midpoint. Replace fixed 1.5% with `rangeWidth * 0.2` or `ATR`-relative.
**Why:** Fixed 1.5% is too narrow for most range widths in crypto.
**Verification:** range_trade produces signals when price is in the lower portion of a detected range.

### Objective 4: Convert critical hard-coded % to ATR-relative
**What:** For the 3 strategies above, convert all entry/stop/target percentages to ATR-relative values. Specifically:
- vwap_pullback: entry premium, stop buffer, target discount
- abcd_long: breakout threshold (1.5% → 1.0 ATR), target (3% → 2.0 ATR), trailing stop (2% → 1.5 ATR)
- range_trading: stop loss beyond support (1% → 0.5 ATR)
**Why:** Batch 18H finding — hard-coded percentages don't scale with market volatility.
**Verification:** All ATR-relative thresholds produce values that scale appropriately for both high-vol (BTC/DOGE) and low-vol (EUR/GBP stableish) pairs.

---

## Files Affected

| File | Change Type |
|------|------------|
| `server/services/strategy-engine.ts` | Major — vwap_pullback, abcd_long, range_trading detect() fixes |
| `server/strategies/support-bounce.ts` | Reference — may need minor ATR adjustments |
| `server/strategies/volatility-edge.ts` | Reference — blocked by pattern detection, not this batch |

---

## Risks / Dependencies

1. **Signal quality vs quantity tradeoff**: Relaxing gates will produce more signals but some may be lower quality. VTS evaluation will test them — that's the purpose of VTS.
2. **ATR availability**: ATR must be available in the indicators object passed to detect(). Verify MCE provides it.
3. **No changes to pattern detection**: volatility_edge remains blocked by upstream ABCD pattern detection. That's a separate issue (pattern recognizer quality) for a future batch.

---

## Verification Targets

### V1: Signal production
At least 2 of the 3 fixed strategies (vwap_pullback, abcd_long, range_trading) produce signals in VTS within a few cycles.

### V2: Null rate reduction
Total strategy null rate drops below 95% (currently 100%).

### V3: ATR scaling
Log ATR-relative values for a few pairs to confirm they scale appropriately.

### V4: No regression
Pattern-pool routing still works. Family fan-out unaffected. Build succeeds.
