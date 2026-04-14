# Batch 45 — Change List

> **Date**: 2026-04-01
> **Commits**: `b6894c00`, `6cd0bf25`, `89f8bcb0`, `ad9151da`

## Files Modified

### 1. `server/services/strategy-engine.ts`
- detectBullishReversal(): Replaced 2%-of-24h-low with ATR-relative pullback (within 2.0 ATR of VWAP, above low by 0.5 ATR)
- detectABCDLong(): Volume comparison changed from spike max to average volume of lookback
- detectRangeTrading(): Entry zone proportional to range width (25%), capped at 40%, ATR minimum. ATR-relative entry/stop/target.
- detectDHMA(): Short branch blocked — only longSignal proceeds. Short entry/stop/target calculation removed.

### 2. `server/services/vts-runner.ts`
- callStrategyDetect: liquidity_trap case returns null (strategy_disabled_bearish)
- Added recentCloses Map + REENTRY_COOLDOWN_MS (5 min) for post-close cooldown
- Cooldown check before duplicate guard in generatePhase10Signal
- Close timestamp recorded on trade resolution
- expectedEdge stored on open trade object (finalScore * dynamicTarget - frictionCost)
- getOpenVirtualTradesForML: expectedEdge uses trade.expectedEdge ?? trade.predictiveConfidence
- persistRealPriceTrade call: added sourcePool and expectedEdge params
- familyFilterMismatch: removed from totalStrategyEvaluations and null counters

### 3. `server/strategies/inside-bar-reversal.ts`
- SELL breakout blocked: if (!isBuyBreakout) return null with sell_disabled_long_only
- Direction forced to BUY literal

### 4. `server/services/vts-service.ts`
- persistRealPriceTrade: added sourcePool and expectedEdge to function params and VirtualTrade object

### 5. `server/utils/export-csv.ts`
- expectedEdge: changed from predictiveConfidence-first to expectedEdge-first (?? operator)
- pool: changed to read sourcePool first (sourcePool || pool || UNKNOWN)

### 6. `1-system-manual/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md`
- Pre-audit step: added mandatory System Impact Map review

## Files Created
- `Claude Comms and Packages/Scope Files/BATCH_45_SCOPE.md`
