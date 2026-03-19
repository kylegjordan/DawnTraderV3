# BATCH_19G_HF1 — Hotfix: Remove legacy filter UI, fix VTS dedup, fix Pattern Scanning 401, fix VTS pattern path

## Modified Files

1. **client/src/components/goals/filters-with-override.tsx**
   - Removed hardcoded "Institutional Math Filters" panel (LQ >= 40, VolNoise <= 0.6, Corr <= 0.75 cards)
   - Removed legacy VtsImfPanel 2-section fallback (the old "VTS Learning Filters (Relaxed)" display)
   - Removed ALL editable filter input fields (Volume & Liquidity, Price Range, Market Quality, Asset Type, Data Quality, Market Configuration, Execution Quality category cards with Input/Select/Dropdown controls)
   - Removed unused imports: Input, Label, Badge, useState, useEffect, CircleDot, useToast, queryClient, useMutation, Select/*, DropdownMenu/*, Button
   - Removed dead code: FilterV2 interface, FiltersV2Response interface, FILTER_CATEGORIES, TIMEFRAME_OPTIONS, MARKET_UNIVERSE_OPTIONS, formatNumber, unformatNumber, isNumericAmountFilter, renderFilterInput, updateValueMutation, localValues state, filtersData query
   - Renamed VtsImfPanel -> DualPathFilterPanel for clarity
   - DualPathFilterPanel now shows a "waiting for data" message instead of legacy fallback when 4-column data is unavailable
   - Kept: 4-column Dual-Path Filter Thresholds table (sole source of truth), SQE Filters display, SQE ROI Gate display, SQE Liquidity Filter display
   - Kept exports: ADAPTIVE_SCANNING_ENABLED, LEGACY_METRICS_ENABLED, FINAL_SCORE_CONFIG (may be imported elsewhere)

2. **server/services/vts-runner.ts**
   - Changed VTS_MAX_CONCURRENT_PER_COMBO from 3 to 1
   - Updated comments at constant definition and duplicate guard check
   - Duplicate guard logic (`existingTradeCount >= VTS_MAX_CONCURRENT_PER_COMBO`) works correctly with value 1: any existing open trade for the same symbol+strategy combo will block new entries

3. **client/src/components/trading/pattern-scanning.tsx**
   - Added Bearer token header to fetchPatternPool() — reads from localStorage (accessToken or token)
   - Root cause: the /api/pattern-pool route uses authenticateToken middleware which requires Authorization header, but the original fetch only sent credentials: "include" (cookies) without the JWT Bearer token

4. **server/services/vts-runner.ts** (Item 4 — VTS pattern path parity with active trading path)
   - **Problem**: VTS pattern pool pairs used regime-driven strategy selection (getStrategiesForRegime → filter to PATTERN_POOL_STRATEGIES). This is wrong — pattern pool pairs should have pattern detection drive strategy selection, not regime. The active trading path (signal-orchestrator.ts) already does this correctly.
   - **Fix**: Pattern pool pairs now mirror the active trading path:
     1. MCE computes regime + indicators (for context only, not strategy selection)
     2. `scanPatterns()` runs on the OHLC candles
     3. If no BUY pattern detected → pair is skipped for this cycle
     4. Each detected BUY pattern is normalized to canonical type via `normalizePatternToCanonical()`
     5. The canonical pattern is matched to a PATTERN or HYBRID strategy definition from the canonical regime-strategy map (searches ALL regimes, not just current)
     6. The matched strategy is passed to `generatePhase10Signal()` as before
   - Added imports: `normalizePatternToCanonical`, `CanonicalPatternType` from canonical-regime-strategy-map
   - Removed unused import: `PATTERN_POOL_STRATEGIES` from pattern-filter-profile (no longer needed)
   - Quant pairs are unchanged — still use all regime strategies
   - Pattern-to-strategy resolution (via canonical map): MORNING_STAR→morning_star, INSIDE_BAR→inside_bar_reversal, PINBAR→support_bounce, ENGULFING→defensive_hedge, TRI_STAR→adaptive_flow, ABCD→volatility_edge

## Commit Message

```
Batch 19G HF1: Remove legacy filter UI, fix VTS dedup, fix Pattern Scanning 401, fix VTS pattern path
```

## Push Command

```bash
git add client/src/components/goals/filters-with-override.tsx server/services/vts-runner.ts client/src/components/trading/pattern-scanning.tsx
git commit -m "Batch 19G HF1: Remove legacy filter UI, fix VTS dedup, fix Pattern Scanning 401, fix VTS pattern path"
git push origin dawntrader-v4
```
