# Batch 41 Scope: Strategy Detect Filter Relaxation

## Purpose
Relax overly strict internal filters in three high-evaluation zero-signal strategies to increase signal generation in the VTS pipeline. These are VTS-path changes only — they affect learning data quality, not live trading risk. Formulas and calculations are confirmed correct (all 6 bugs from the 4-LLM review are fixed). This batch adjusts filter strictness, not math.

## Context
- Batch 18H (March 2026) calibrated all strategy thresholds for crypto via 4-LLM consensus
- Batch 16/HF8 relaxed 5 specific VTS parameters
- Batches 20-23 built the family filter architecture and calibrated DI thresholds
- Despite all of this, 15 of 17 strategies produce zero signals
- Root cause: multiplicative filter stacking inside detect() functions — individually reasonable filters combining to create near-impossible pass rates
- Industry research (Langston web search) confirms several filters are stricter than standard crypto practice

## Desired Outcomes (Numbered)

### 1. Range Trade: Widen entry zone
- **Current**: Entry must be within 0.5% of support floor
- **Change**: Widen to 1.5% of support floor
- **Rationale**: Langston research confirms 0.5% is too tight for crypto. Support is a zone, not a line. 1.5% is still conservative.
- **File**: `server/services/strategy-engine.ts` (range_trade detect logic)
- **Verify**: range_trade signal count increases from ~14 to significantly more per 24h cycle

### 2. Morning Star: Soften SMA gate
- **Current**: Price MUST be below SMA(20) — hard gate, returns null if not met
- **Change**: Make SMA(20) a confidence bonus/penalty instead of a hard gate. If price is below SMA(20), add confidence bonus. If above, reduce confidence but still allow the signal.
- **Rationale**: Industry practice uses SMA as context, not a universal hard gate. The pattern itself (three-candle reversal) already implies a downtrend context. Langston research confirms this is not a universal requirement.
- **File**: `server/strategies/morning-star.ts`
- **Verify**: morning_star begins generating signals (currently 0 from 11,732 evaluations)

### 3. Support Bounce: Reduce filter stack and widen support zone
- **Current**: Requires ALL of: 50+ candles, valid support cluster (2+ touches within 3%), price within 1.5% of support, PINBAR detected at exact support, volume >= 1.2x average
- **Changes**:
  - (a) Remove PINBAR requirement as a hard gate — treat as confidence bonus instead. A bullish candle near support is sufficient.
  - (b) Widen support proximity from 1.5% to 2.5% (or ATR-relative if feasible)
- **Rationale**: Industry practice treats support as a zone, not a line. Requiring a specific candle pattern (PINBAR) at an exact price level is too restrictive. Langston research confirms ATR-based tolerance is more realistic.
- **File**: `server/strategies/support-bounce.ts`
- **Verify**: support_bounce begins generating signals (currently 0 from 30,877 evaluations)

### 4. Eliminate duplicate scanPatterns() call
- **Current**: `scanPatterns()` runs in the VTS main loop for strategy selection (line 1677), then runs AGAIN inside `generatePhase10Signal()` (line 673) on the same OHLC data
- **Change**: Pass the first detection result into `generatePhase10Signal()` instead of re-running
- **Rationale**: Pure efficiency fix. Same function, same data, same result. No behavioral change.
- **File**: `server/services/vts-runner.ts`
- **Verify**: No behavioral change. Slight performance improvement per cycle.

## Files Expected to Change

| File | Change | Type |
|------|--------|------|
| `server/services/strategy-engine.ts` | Widen range_trade entry zone 0.5% → 1.5% | Threshold |
| `server/strategies/morning-star.ts` | SMA(20) hard gate → confidence factor | Logic change |
| `server/strategies/support-bounce.ts` | Remove PINBAR hard gate, widen proximity | Logic change |
| `server/services/vts-runner.ts` | Pass pattern result to generatePhase10Signal | Efficiency |

## Verification Criteria

| # | Objective | How to Verify |
|---|-----------|---------------|
| 1 | range_trade signals increase | Filter diagnostics: range_trade signals > 14 per 24h |
| 2 | morning_star generates signals | Filter diagnostics: morning_star signals > 0 |
| 3 | support_bounce generates signals | Filter diagnostics: support_bounce signals > 0 |
| 4 | No duplicate scanPatterns call | Code review: single call with result passed forward |
| 5 | No regression in existing signals | range_trade and mean_reversion signal rates maintained |
| 6 | VTS open trades increase | ML page: more diverse strategy mix in open/closed trades |

## Verification Surfaces
- **Logs**: pm2 logs — check for new signal generation from morning_star, support_bounce
- **DB**: N/A (no schema changes)
- **UI**: ML page — check open trades for new strategies, Filter Diagnostics for updated counts
- **CI**: Build must pass
- **Server health**: PM2 stable, no restarts

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Over-relaxation producing low-quality signals | LOW | VTS-only changes. ML system learns from outcomes. Can tighten later based on P&L data. |
| Morning Star confidence change affects signal scoring | LOW | Total confidence formula bounded [0,1]. Removing one hard gate adds range, doesn't break bounds. |
| Support bounce generating false signals at non-support levels | LOW | Still requires 2+ touches defining support zone + volume confirmation. Only the exact-PINBAR requirement removed. |

## Branch
`migration/aws-supabase`
