# Batch 19C Scope — Phase 14.5 Deferred Items

**Date**: 2026-03-18
**Phase**: 14.5 (completion — deferred items from Batch 19)
**Preceding Batches**: Batch 19 (code), Batch 19B (governance)
**Type**: Code batch (single mega-batch for 3 deferred items)

---

## What This Batch Does

Completes the three items deferred from the Phase 14.5 mega-batch:

1. **VTS Runner Pattern Pool Integration** — VTS learns from pattern-pool pairs
2. **Frontend Pattern Scanning Tab** — New UI tab + API endpoint
3. **FX5 Regime-Aware Pattern Pool Thresholds** — Dynamic thresholds based on global regime

---

## Item 1: VTS Runner Pattern Pool Integration (SMALL)

### Problem
VTS currently only evaluates pairs from the FX5 quant pool (`fx5Scanner.getCurrentScanBatch('paper')`). Pattern-pool pairs — which are the only pairs evaluated by PATTERN + HYBRID strategies in active trading — are invisible to VTS. This means VTS cannot learn from or calibrate pattern/hybrid strategy performance.

### Solution
Add a second evaluation pass in the VTS main cycle that pulls pattern-pool pairs from `activeFilterPool.getPatternPool('paper')` and evaluates them with PATTERN + HYBRID strategies only (same dual-path logic the signal orchestrator uses).

### Changes
- **`server/services/vts-runner.ts`** — 3 surgical edits:
  1. In the main cycle (~line 1305): After the quant-pool loop, add a second loop over `activeFilterPool.getPatternPool('paper')`, filtering `regimeStrategies` to PATTERN_POOL_STRATEGIES only
  2. Add `sourcePool: 'pattern'` metadata to VTS trade records generated from pattern-pool pairs (~lines 1096-1102, 1352-1361)
  3. Log pattern pool evaluation count alongside quant pool count

### What Does NOT Change
- `callStrategyDetect()` — already handles all 17 strategies including PATTERN and HYBRID
- Scoring formulas — VTS uses same FinalScore computation regardless of pool
- rankingScore — not used by VTS (RTB-only concept)
- MCE/regime computation — VTS already calls MCE per symbol

---

## Item 2: Frontend Pattern Scanning Tab (MEDIUM)

### Problem
No UI visibility into the pattern pool pipeline. Users cannot see: which pairs are in the pattern pool, what pattern signals are being generated, or how pattern-pool trades compare to quant-pool trades.

### Solution
Add a 5th tab ("Pattern Scanning") to the Trading page, plus a new API endpoint to expose pattern pool data.

### Changes

**Backend (1 file):**
- **`server/routes.ts`** — Add `GET /api/pattern-pool` endpoint that returns:
  ```json
  {
    "patternPool": [...],       // activeFilterPool.getPatternPool(mode)
    "patternPoolSize": N,       // activeFilterPool.getPatternPoolSize(mode)
    "quantPoolSize": N,         // activeFilterPool.getPoolSize(mode)
    "thresholds": {...},        // PATTERN_POOL_THRESHOLDS (static config)
    "guardrails": {...},        // PATTERN_POOL_GUARDRAILS (static config)
    "strategies": [...],        // PATTERN_POOL_STRATEGIES list
    "globalRegime": {...}       // MCE getDominantRegime() current value
  }
  ```

**Frontend (2 files):**
- **NEW `client/src/components/trading/pattern-scanning.tsx`** — New component displaying:
  - Pattern pool pair count vs quant pool pair count (summary cards)
  - Pattern pool pairs table (symbol, price, volume, LQ, VN, DI, TTL)
  - Current global regime (from MCE)
  - Pattern pool thresholds vs quant thresholds (comparison table)
  - Eligible strategies list (8 strategies)
- **`client/src/pages/active-trades.tsx`** — Surgical edits:
  - Add 5th TabsTrigger ("Pattern Scanning" with icon)
  - Add 5th TabsContent wrapping PatternScanning component
  - Update TabsList `grid-cols-4` → `grid-cols-5`
  - Add import for PatternScanning component

### What Does NOT Change
- Existing 4 tabs — no modifications to Filter Insights, Ready to Buy, Open Trades, or Trade History
- Backend pattern pool logic — read-only endpoint, no mutations
- RTB metadata — already persists sourcePool/signalType from Batch 19

---

## Item 3: FX5 Regime-Aware Pattern Pool Thresholds (SMALL)

### Problem
Pattern pool thresholds in `pattern-filter-profile.ts` are static. In a HIGH_VOLATILITY_UNSTABLE regime, the current relaxed VN≤0.98 threshold admits nearly everything. In a TREND_FRIENDLY_STABLE regime, the DI≥30 threshold may be unnecessarily restrictive. The MCE `getDominantRegime()` foundation exists but isn't used by FX5.

### Solution
Make `PATTERN_POOL_THRESHOLDS` regime-aware with a lookup table per canonical regime. FX5 scanner calls `mce.getDominantRegime()` once per scan cycle and selects the appropriate threshold set.

### Changes
- **`server/config/pattern-filter-profile.ts`** — Add `REGIME_PATTERN_THRESHOLDS` lookup table:
  ```typescript
  const REGIME_PATTERN_THRESHOLDS: Record<string, typeof PATTERN_POOL_THRESHOLDS> = {
    TREND_FRIENDLY_STABLE:    { MIN_VOLUME_USD: 200_000, LQ_MIN: 18, VN_MAX: 0.96, DI_TRENDING_MIN: 25, RSI_MIN: 15, RSI_MAX: 85 },
    HIGH_VOLATILITY_UNSTABLE: { MIN_VOLUME_USD: 300_000, LQ_MIN: 25, VN_MAX: 0.95, DI_TRENDING_MIN: 35, RSI_MIN: 20, RSI_MAX: 80 },
    RANGE_BOUND_STABLE:       { MIN_VOLUME_USD: 250_000, LQ_MIN: 20, VN_MAX: 0.98, DI_TRENDING_MIN: 20, RSI_MIN: 15, RSI_MAX: 85 },
    IMPULSE_EXPANSION:        { MIN_VOLUME_USD: 250_000, LQ_MIN: 20, VN_MAX: 0.97, DI_TRENDING_MIN: 30, RSI_MIN: 15, RSI_MAX: 85 },
    STRUCTURAL_TRANSITION:    { MIN_VOLUME_USD: 300_000, LQ_MIN: 22, VN_MAX: 0.96, DI_TRENDING_MIN: 30, RSI_MIN: 18, RSI_MAX: 82 },
  };
  ```
  - Add `getPatternPoolThresholds(regime: string)` function that returns regime-specific thresholds, falling back to static defaults
- **`server/services/fx5-scanner.ts`** — Surgical edit (~2 lines):
  - Import `getPatternPoolThresholds` and `getMarketContextEngine`
  - At the pattern pool filtering section (~line 637), call `mce.getDominantRegime()` and use `getPatternPoolThresholds(regime)` instead of static `PATTERN_POOL_THRESHOLDS`

### Design Rationale
- **TREND_FRIENDLY_STABLE**: Loosen — patterns thrive in trending markets, lower barriers
- **HIGH_VOLATILITY_UNSTABLE**: Tighten — raise volume floor and LQ minimum, narrow VN to avoid noise-dominated pairs
- **RANGE_BOUND_STABLE**: Current defaults — patterns work well in range-bound, keep relaxed
- **IMPULSE_EXPANSION**: Moderate — keep DI floor at 30, slightly tighten VN
- **STRUCTURAL_TRANSITION**: Tighten — raise quality floors during regime transitions

### What Does NOT Change
- Quant pool thresholds — no regime adjustment for quant filters (those are already well-calibrated)
- SQE thresholds — pattern FinalScore floor remains 0.45 regardless of regime
- rankingScore weights — remain static per signal family

---

## File Summary

| File | Action | Item |
|------|--------|------|
| `server/services/vts-runner.ts` | Surgical edits (3 locations) | Item 1 |
| `server/config/pattern-filter-profile.ts` | Add regime lookup table + getter function | Item 3 |
| `server/services/fx5-scanner.ts` | Surgical edit (2 lines — import + threshold call) | Item 3 |
| `server/routes.ts` | Add GET /api/pattern-pool endpoint | Item 2 |
| `client/src/components/trading/pattern-scanning.tsx` | NEW file | Item 2 |
| `client/src/pages/active-trades.tsx` | Surgical edits (import, tab trigger, tab content, grid-cols) | Item 2 |

**Total**: 6 files (1 new, 5 modified), ~200 lines of new code, ~30 lines of surgical edits

---

## Blast Radius

- **VTS Runner**: HIGH — affects all VTS learning data. But the change is additive (new pairs evaluated, not changing existing evaluation). Existing quant-pool VTS path unchanged.
- **FX5 Scanner**: CRITICAL path but minimal change (threshold selection only, fallback to existing static values).
- **Frontend**: LOW — new tab is additive, existing tabs untouched.
- **routes.ts**: LOW — new read-only endpoint, no mutations.

---

## Validation Plan

After deployment:
1. `grep "getPatternPool" server/services/vts-runner.ts` — confirms VTS pattern pool integration
2. `grep "REGIME_PATTERN_THRESHOLDS" server/config/pattern-filter-profile.ts` — confirms regime lookup table
3. `grep "pattern-pool" server/routes.ts` — confirms API endpoint
4. `grep "pattern-scanning" client/src/pages/active-trades.tsx` — confirms tab wiring
5. Server starts without errors (TypeScript compilation)
6. `/api/pattern-pool` endpoint returns valid JSON
