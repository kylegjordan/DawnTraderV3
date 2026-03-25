# Batch 16 Scope — Phase 14.1 HF8: VTS Throughput + Remaining Items

**Date**: 2026-03-07
**Phase**: 14.1 (Strategy-Specific VTS)
**Batch**: 16 (HF8)
**Branch**: dawntrader-v4
**Baseline Commit**: `8cfd34ed` (Batch 15B governance)
**Test Baseline**: 790 pass / 91 fail (881 total)

---

## Context

Phase 14.1 core VTS wiring is complete (HF1-HF7). HF7 recalibrated the regime classifier for crypto DX values, which correctly routed pairs to their true regimes but exposed a strategy fitness gap — fewer VTS trades are opening because:

1. **Timeframe mismatch**: VTS uses 15-min candles but strategy parameters were calibrated for the orchestrator's 60-min candles. MCE receives different timeframe data in each path, producing different regime classifications for the same pair.
2. **OHLC bottleneck**: 50-candle limit blocks `adaptive_flow` (needs 65), `volatility_edge` (needs 65).
3. **BTC candles missing**: `defensive_hedge` always returns null (needs BTC correlation data).
4. **Parameter miscalibration**: With 15-min candles, strategy parameters produce unreasonably strict conditions (e.g., 50% boundary-touch rate for range detection).

This batch addresses all 8 remaining Phase 14.1 items plus the timeframe alignment (originally Phase 14.1B, moved forward due to its impact on trade throughput).

---

## Scope — 11 Changes Across 6 Files

### GROUP A: VTS Throughput Fixes (4 changes in vts-runner.ts)

**A1. VTS Timeframe Alignment: 15-min → 60-min candles**
- **File**: `server/services/vts-runner.ts` line 292
- **Change**: `getOHLCData(symbol, 15, ...)` → `getOHLCData(symbol, 60, ...)`
- **Why**: Aligns VTS candle timeframe with signal orchestrator (60-min). MCE now receives the same data shape in both paths → consistent regime classification → ML learning transfers directly to active trading.
- **Side effects**: VTS OHLC data changes hourly instead of every 15 min. Trade management (stop/target P&L checks) still uses live ticker prices every 60 seconds — unaffected. Strategy parameters are now correctly calibrated (they were designed for 1h bars).
- **Eliminates**: Phase 14.1B roadmap block (VTS/Orchestrator Timeframe Alignment).

**A2. OHLC Candle Count: 50 → 100**
- **File**: `server/services/vts-runner.ts` line 292
- **Change**: `maxCandlesTotal: 50` → `maxCandlesTotal: 100`
- **Why**: `adaptive_flow` needs 65 candles, `volatility_edge` needs 65. With 60-min candles, 100 = ~4.2 days of lookback.
- **Combined with A1**: Single line change: `getOHLCData(symbol, 60, undefined, { maxCandlesTotal: 100 })`

**A3. BTC Candles for defensive_hedge**
- **File**: `server/services/vts-runner.ts` lines 409-411
- **Change**: Fetch BTCUSD OHLC data (60-min, 100 candles) and pass as 4th parameter to `detectDefensiveHedge()`.
- **Implementation**: Add a `btcOhlcCache` variable at module level. Fetch BTC OHLC once per VTS cycle (before the pair loop) using `vtsKrakenService.getOHLCData('XXBTZUSD', 60, undefined, { maxCandlesTotal: 100 })`. Pass cached BTC candles to `strategyEngine.detectDefensiveHedge(indicators, ohlcData, patternInput, btcOhlcData)`.
- **Why**: `defensive_hedge` requires ≥32 BTC candles for Spearman correlation. Currently always returns null.
- **Kraken API impact**: +1 OHLC call per VTS cycle (negligible — BTC is a different pair with its own rate counter).

**A4. VTS Strategy Parameter Relaxation**
- **File**: `server/services/vts-runner.ts` lines 347-397 (callStrategyDetect function)
- **Changes** (VTS-only, active trading via signal-orchestrator unaffected):

| Strategy | Parameter | Current | New | Rationale |
|----------|-----------|---------|-----|-----------|
| `range_trade` | minBoundaryTouches | 3 | 2 | 2 touches per boundary in 12 hourly bars is still a valid range |
| `range_trade` | minRangeWidth | 3 | 2 | 2% range width is meaningful |
| `breakout` | volumeMultiplier | 2 | 1.5 | 1.5x avg volume still confirms breakout interest |
| `liquidity_trap` | minLevelTouches | 3 | 2 | 2 level touches confirms a real level |
| `mean_reversion` | deviationThreshold | 2.5 | 2.0 | 2% VWAP deviation is significant for 60-min |

- **Why**: Even with correct 60-min calibration, VTS is an exploration engine. Slightly relaxed parameters produce more learning data while keeping setups valid. The ML system will learn actual P&L outcomes from these relaxed setups.

### GROUP B: Code Cleanup (3 changes across 3 files)

**B1. Remove Duplicate FinalScore Checks**
- **Files**: `server/services/paper-execution-engine.ts` line 1335-1339, `server/services/ready_to_buy_service.ts` lines 1057-1061
- **Change**: Remove the hardcoded `MIN_FINAL_SCORE = 0.35` checks from both files.
- **Why**: SQE already enforces FinalScore ≥ 0.35 (signal_quality_evaluator.ts line 130). Signals that reach paper-execution-engine and RTB have already passed SQE. The duplicates are maintenance risk — if the threshold changes in SQE, the hardcoded copies would drift.
- **Note**: This is what MEMORY.md called "TCL duplicate FinalScore check" (Item 3), but the duplicates are in paper-execution-engine and ready_to_buy_service, NOT in c13-validation-service.ts.

**B2. Return Type Fix: getOpenVirtualTradesForML()**
- **File**: `server/services/vts-runner.ts` lines 1640-1667
- **Change**: Add 5 missing properties to the return type declaration:
  - `globalRegime: string | null`
  - `pairFriction: number | null`
  - `globalFriction: number | null`
  - `pairDirectionalBias: string | null`
  - `globalDirectionalBias: string | null`
- **Why**: The function actually returns these properties (lines 1735-1739) but the type declaration doesn't include them. TypeScript type mismatch.

**B3. Add Confidence Floor to SQE**
- **File**: `server/core/filters/signal_quality_evaluator.ts`
- **Change**: Add a confidence floor check to `evaluateSignalQuality()` using `meetsConfidenceFloor()` from `strategy-modes.ts`. Import `resolveStrategyMode`, `getModeOverlay`, `meetsConfidenceFloor` from `../governance/strategy-modes.js`.
- **Why**: Currently the confidence floor is only checked in paper-execution-engine.ts (line 2168). VTS bypasses it. Moving it to SQE means both VTS and active trading use the same qualification gate.
- **Note**: VTS paper-mode cold-start bypass is preserved — VTS signals skip the confidence floor during initial calibration (this is existing behavior, line 603-609 in paper-execution-engine.ts). The SQE check should include a `skipConfidenceFloor` option or check signal source.

### GROUP C: Analytics Tab (1 change, client-side)

**C1. Wire /api/regime-map Endpoint**
- **File**: `client/src/pages/analytics.tsx` lines 730-863
- **Change**: Replace the hardcoded HTML table with a dynamic fetch from `GET /api/regime-map`. The endpoint already exists (`server/routes/regime-map.ts`) and returns all regime-strategy mappings from the canonical map.
- **Implementation**: Add a `useEffect` + `useState` to fetch on component mount. Map the response to render the same table layout (Tailwind classes, Badge components) but populated from API data.
- **Why**: The hardcoded table has incorrect strategy-to-regime assignments. The API returns the canonical source of truth.

### GROUP D: Configuration Fix (1 change)

**D1. VTS pairsPerCycle Config Override: 20 → 100**
- **File**: `config/vts.json` line 4
- **Change**: `"pairsPerCycle": 20` → `"pairsPerCycle": 100`
- **Why**: The default code value is 100 but `config/vts.json` overrides it to 20. Currently only 12 non-benchmark pairs survive the filtering pipeline, so this isn't the binding constraint — but it removes an artificial cap that would limit throughput if more pairs qualify in the future (e.g., after filter tuning).

### GROUP E: Deferred Items (2 items — recommend deferring to HF9 or later)

**D1. DSS Pre-Selector (Item 4) — DEFER**
- **Recommendation**: Defer to Phase 14.2 or later.
- **Rationale**: The VTS already uses `getStrategiesForRegime()` as a pre-selector (line 1272). The signal orchestrator uses MCE's `allowedStrategies` (line 843). The DSS's evaluate() function is called after detect functions run, but changing the orchestrator's evaluation loop to call DSS before detect functions is an architectural change that affects the active trading path. This deserves its own focused scope, not a side change in a throughput fix batch.

**D2. Secondary Metrics Programmatic Format (Item 5) — DEFER**
- **Recommendation**: Defer — no current code path evaluates secondary metrics programmatically.
- **Rationale**: The `secondaryMetrics` strings in the canonical map are currently used only for display (analytics tab). No system component tries to evaluate them as conditions. Making them programmatic requires: (a) defining a condition DSL/type system, (b) writing an evaluator function, (c) integrating it into SQE or detect functions. This is valuable work but has zero impact on trade throughput and should be scoped independently.

---

## Files Modified (Summary)

| File | Changes | Group |
|------|---------|-------|
| `server/services/vts-runner.ts` | A1 (timeframe), A2 (candle count), A3 (BTC candles), A4 (params), B2 (return type) | A, B |
| `server/services/paper-execution-engine.ts` | B1 (remove duplicate FinalScore) | B |
| `server/services/ready_to_buy_service.ts` | B1 (remove duplicate FinalScore) | B |
| `server/core/filters/signal_quality_evaluator.ts` | B3 (add confidence floor) | B |
| `client/src/pages/analytics.tsx` | C1 (wire /api/regime-map) | C |

**Total: 5 files modified, 9 changes implemented, 2 items deferred.**

---

## Expected Impact

### Trade Throughput
- **3 strategies unblocked**: `adaptive_flow`, `volatility_edge`, `defensive_hedge` go from "always null" to "can fire"
- **Timeframe alignment**: Regime classification matches orchestrator → strategies are evaluated in correct regime context
- **Parameter relaxation**: `range_trade`, `breakout`, `liquidity_trap`, `mean_reversion` all become more likely to fire
- **Expected**: 3-5x increase in VTS trade throughput across diverse strategies and regimes

### Learning Quality
- **Improved**: VTS now uses same candle timeframe as active trading → ML learning transfers directly
- **Maintained**: All trades still have valid entry/stop/target geometry, Net EV, ROI gates
- **Cleaner**: Duplicate quality gates removed, single SQE authority

### Roadmap Impact
- **Eliminates Block 2**: Phase 14.1B (VTS/Orchestrator Timeframe Alignment) — done as part of HF8
- **Items 4 and 5** deferred to future phases — no throughput impact

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| VTS 15→60 min | Low — strategy params were designed for 60-min | VTS-only change, orchestrator unaffected |
| OHLC 50→100 | None — more data is strictly better | Same API, just larger window |
| BTC candles | Low — 1 additional API call per cycle | Cached at module level, rate limit headroom exists |
| Parameter relaxation | Low — VTS-only, doesn't affect active trading | Core strategy logic unchanged |
| Remove FinalScore duplicates | Low — SQE already enforces the same gate | Signals must pass SQE before reaching these points |
| Confidence floor in SQE | Medium — affects qualification for both paths | Cold-start bypass preserved for VTS paper mode |
| Analytics tab fetch | None — display-only | Server endpoint already tested |

---

## Validation Criteria

1. TypeScript compilation passes (`npx tsc --noEmit`)
2. Test baseline maintained (790 pass / 91 fail)
3. Server starts without errors
4. VTS cycle completes and processes pairs with 60-min candles
5. `/api/regime-map` endpoint returns correct data
6. Analytics page renders regime-strategy table from API data
