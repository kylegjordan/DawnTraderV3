# Batch 47 Scope: Strategy Threshold Audit Round 1 — Range Detection + Volume Gates

> **Date**: 2026-04-02
> **Baseline**: Commit `bb15d3b2`
> **Branch**: migration/aws-supabase
> **System Impact Map**: Reviewed. Layer 4 (Signal Generation). Changes contained within detect() logic.
> **Pre-audit data**: 146 evals, 1 signal. Dominant null: range_not_found=78 (53%).

---

## Purpose

Focused threshold relaxation targeting the two largest, most clearly justified null categories: range detection strictness (53% of nulls) and volume multiplier strictness (5% of nulls). DHMA and indicator filter relaxations deferred to Round 2 to keep changes attributable.

---

## Objectives

### Objective 1: Relax detectRange() — addresses 53% of nulls
**File:** `server/services/strategy-filters.ts`
**Changes:**
- `minBars` default: 10 → 7 — crypto consolidates in shorter windows; 7 hours is still meaningful
- `touchTolerance` default: 0.003 → 0.005 — crypto wicks overshoot; 0.5% tolerance still identifies valid ranges

**File:** `server/services/strategy-engine.ts` (detectRangeTrading)
**Changes:**
- `minRangeWidth` floor: 3% → 1.5% — a 2% range on BTC ($1,200) is tradeable
- `minRangeDurationHours`: 10 → 7 — matches minBars relaxation

### Objective 2: Fix pattern DI config alignment (DB-governed, not fallback)
**File:** `server/config/pattern-filter-profile.ts`
**What:** The static `DI_TRENDING_MIN = 30` does NOT match the DB seed value of `DI_MIN = 5` for `active_pattern`. Per Kyle's rule: no hard-coded fallback values — missing DB value = config error. This is a config alignment fix: ensure the static constant matches the intended DB-governed value. If DB is missing, the system should log an error, not silently apply a different threshold.
**Note:** This is NOT a threshold relaxation. It is a correction to align static fallback with DB-governed intent.

### Objective 3: Relax volume multipliers — addresses 5% of nulls
**Changes:**
- `server/strategies/reverse-impulse.ts` `RI_VOL_MULT`: 1.5 → 1.2 — pinbar reversals don't always need volume spikes
- `server/strategies/inside-bar-reversal.ts` `IB_VOL_MULT`: 1.5 → 1.3 — inside bar breakouts can occur on moderate volume
- `server/strategies/volatility-edge.ts` `VE_A_VOL_MULT`: 2.0 → 1.5 — A-point doesn't need extreme volume

### Objective 4: Before/after monitoring with per-strategy attribution
**What:** Capture 3+ VTS cycles before deploy (baseline), deploy, capture 3+ cycles after. Document per-strategy:
- Evaluation count (before vs after)
- Signal count (before vs after)
- Null reason breakdown (before vs after)
- Example of any newly passing signals

---

## Deferred to Round 2
- DHMA microstructure thresholds (theta_OBI, burstReturn, sessionSlope)
- Indicator filter relaxations (RSI, momentum, volatility percentile, compression, ADX slope, correlation)
- These require separate before/after measurement to remain attributable

---

## Files Affected

| File | Changes |
|------|---------|
| `server/services/strategy-filters.ts` | detectRange() minBars, touchTolerance defaults |
| `server/services/strategy-engine.ts` | range_trade minRangeWidth, minRangeDurationHours |
| `server/config/pattern-filter-profile.ts` | DI_TRENDING_MIN alignment with DB |
| `server/strategies/reverse-impulse.ts` | RI_VOL_MULT |
| `server/strategies/inside-bar-reversal.ts` | IB_VOL_MULT |
| `server/strategies/volatility-edge.ts` | VE_A_VOL_MULT |

---

## Verification Targets

### V1: range_not_found reduction
range_not_found drops from 78/146 (53%) to below 40/146 (27%).

### V2: Signal rate improvement
At least 3 additional signals per monitoring period compared to baseline.

### V3: No junk signal flood
Newly generated signals have valid geometry and reasonable risk/reward.

### V4: Per-strategy attribution
Clear before/after comparison showing which strategies benefited from which changes.
