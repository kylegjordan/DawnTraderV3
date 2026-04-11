# DawnTrader Authority Baseline V1.0 (Directive 11.8C)

> **Version:** 1.0
> **Snapshot Date:** 2026-04-11
> **Last Commit:** `6a8badd6` (B57 Governance: Final)
> **Created:** Batch 58a (Phase 11 Finalization)
> **Purpose:** The authoritative "known-good" state of all adjustable parameters. All future adjustments are measured against this baseline. Rollback target if performance degrades.
> **Machine-Readable:** `1-system-manual/authority-baseline-v1.json`
> **Companion:** ADJUSTMENT_FRAMEWORK.md (governance rules for changing these values)

---

## 1. What This Document Is

This is the **Version 1.0 checkpoint** — the system state as of Batch 57 completion, after:
- Full Walter/CWQI/NGC purge (B55)
- CI green baseline established (B56)
- Pattern-strategy mismatch fixed, volume soft gates implemented (B57)
- All 37 running issues resolved

Every value below is the current production value. If any future adjustment degrades performance, these are the values to revert to.

---

## 2. Baseline Contents

The baseline has three sections reflecting where authority currently lives:

### Section A: Database Thresholds (`screener_filters`)

24 rows (12 filter paths x 2 modes). Live and paper are identical.

#### Uniform Values (same across all 12 filter paths)

| Column | Value |
|--------|-------|
| lq_min | 43 |
| corr_max | 0.92 |
| min_price | 0.01 |
| min_liquidity | 500,000 |
| min_market_cap | 100,000,000 |
| rsi_min | 30 |
| rsi_max | 70 |
| volatility_min | 0.50 |
| volatility_max | 5.00 |
| max_bid_ask_spread | 1.00 |
| final_score_min | 0.35 |
| regime_weight_min | 0.30 |
| min_history_days | 30 |
| universe_size | 100 |
| confidence_threshold | 60 |

#### Differentiating Values (vary by filter path)

| filter_path | vn_max | di_min | di_max | min_volume | volume_24h_min |
|---|---|---|---|---|---|
| active_quant | 0.85 | 25 | 100 | 500,000 | 50,000 |
| active_trend | 0.85 | 10 | 100 | 500,000 | null |
| active_breakout | 0.85 | 10 | 100 | 400,000 | null |
| active_oscillator | 0.85 | 0 | 30 | 250,000 | null |
| active_reversal | 0.85 | 0 | 35 | 250,000 | null |
| active_pattern | 0.98 | 5 | 100 | 250,000 | 50,000 |
| vts_quant | 0.95 | 15 | 100 | 250,000 | 50,000 |
| vts_trend | 0.95 | 10 | 100 | 250,000 | null |
| vts_breakout | 0.95 | 10 | 100 | 200,000 | null |
| vts_oscillator | 0.95 | 0 | 35 | 150,000 | null |
| vts_reversal | 0.95 | 0 | 40 | 150,000 | null |
| vts_pattern | 0.98 | 3 | 100 | 150,000 | 50,000 |

**Design patterns:**
- VTS paths more relaxed than active (lower min_volume, higher vn_max)
- Pattern paths highest vn_max tolerance (0.98)
- Oscillator/reversal have di_min=0 (no directional floor)
- Only 4 columns differentiate: vn_max, di_min, di_max, min_volume

### Section B: Strategy Constants (from code files)

All 17 strategies with their hardcoded constants. These are the calibrated values as of B57.

#### Original 8 Strategies (in `server/services/strategy-engine.ts`)

**1. vwap_pullback**
- pullbackThreshold: 3.0%, volumeMultiplier: 1.5x, maxHoldingPeriod: 24 bars
- Stop: 0.5x ATR below VWAP, Target: high24h - 0.25x ATR or 2R
- Base confidence: 0.7 (+0.2 if reversal confirmed)

**2. abcd_long**
- minConsolidation: 10, breakoutThreshold: 1.5%, volumeMultiplier: 1.5x
- targetPercent: 3.0%, trailingStopPercent: 2.0%, ATR: 14-period
- Entry: C-high + 0.3x ATR, Stop: C-low - 0.5x ATR
- Base confidence: 0.75

**3. sma_trend_ride**
- smaLength: 20, trailingStopPercent: 2.0%
- Entry premium: 0.2%, Stop: min(priorSwingLow*0.998, SMA*0.995)
- Base confidence: 0.65

**4. breakout**
- minConsolidationBars: 10, breakoutBuffer: 1%, volumeMultiplier: 1.5x
- maxHoldingHours: 12, dynamicRange: max(7%, 5.0*ATR%)
- touchTolerance: ATR/4, minTouches: 2
- Base confidence: 0.75

**5. mean_reversion**
- deviationThreshold: max(3%, 1.5*ATR/price), partialExitPercent: 50
- stopLossBuffer: 1%, minPrice history: 20 candles
- Base confidence: 0.7

**6. range_trading**
- minRangeDurationHours: 7, minBoundaryTouches: 1
- entryZoneWidth: 1.5%, stopLossBeyond: 1%
- minRangeWidth: max(1.5%, 2.0*ATR%)
- Base confidence: 0.72

**7. vwap_bounce**
- vwapProximity: 1.5%, minVWAPSlope: 0.3%, volumeMultiplier: 1.3x
- maxPullbackBars: 5, partialExitR: 1.5R
- Base confidence: 0.73

**8. liquidity_trap**
- maxTrapExtension: 1.2%, trapReturnBars: 2, minLevelTouches: 2
- volumeRatio: 1.5x, rangeMaxWidth: 5%
- Base confidence: 0.68

#### Newer 8 Strategies (individual files in `server/strategies/`)

**9. morning_star** (`morning-star.ts`) — Volume: SOFT gate (B57)
- MS_MIN_STRENGTH: 0.55, MS_VOL_MULT: 1.2x, MS_STOP_BUFFER: 0.3%
- MS_TARGET_ATR_MULT: 2.5x, MS_STRENGTH_WEIGHT: 0.80
- MS_HIGH_VOL_BONUS: 0.08, MS_GAP_BONUS: 0.07, MS_MAX_RECOVERY_BONUS: 0.05
- Confidence cap: 0.93

**10. inside_bar_reversal** (`inside-bar-reversal.ts`) — Family: pattern, Volume: HARD gate
- IB_MAX_COMPRESSION: 0.85, IB_BREAKOUT_BUFFER: 0.2%, IB_VOL_MULT: 1.3x
- IB_STOP_BUFFER: 0.3%, IB_TARGET_ATR_MULT: 2.0x
- IB_COMPRESSION_WEIGHT: 0.35, IB_STRENGTH_WEIGHT: 0.45
- IB_VOL_SCORE_RATE: 0.10, IB_MAX_VOL_BONUS: 0.20
- IB_SELL_RSI_MIN: 45, Confidence cap: 0.93

**11. support_bounce** (`support-bounce.ts`) — Family: pattern, Volume: SOFT gate (B57)
- SB_LOOKBACK_CANDLES: 50, SB_CLUSTER_TOLERANCE_BASE: 0.7% (widened B57)
- SB_MIN_TOUCHES: 2, SB_MAX_DISTANCE: 3%, SB_PROXIMITY: 3.5%
- SB_VOL_MULT: 1.2x, SB_STOP_BELOW_SUPPORT: 0.5%, SB_TARGET_ATR_MULT: 2.0x
- SB_PATTERN_WEIGHT: 0.40, SB_SUPPORT_WEIGHT: 0.30, SB_PROXIMITY_WEIGHT: 0.15
- SB_HIGH_VOL_BONUS: 0.08, Confidence cap: 0.93

**12. pivot_shift** (`pivot-shift.ts`) — Family: hybrid, Volume: HARD gate
- PS_RSI_LOW: 35, PS_RSI_HIGH: 65, PS_ADX_SLOPE_MIN: 0.5
- PS_VOL_MULT: 1.3x, PS_STOP_ATR_MULT: 1.5x, PS_TARGET_ATR_MULT: 3.0x
- PS_PATTERN_WEIGHT: 0.40, PS_RSI_WEIGHT: 0.25
- PS_ADX_SCORE_RATE: 0.05, PS_MAX_ADX_BONUS: 0.20, PS_HIGH_VOL_BONUS: 0.08
- Confidence cap: 0.93

**13. reverse_impulse** (`reverse-impulse.ts`) — Family: hybrid, Volume: SOFT gate (B57)
- RI_MIN_STRENGTH: 0.58, RI_MOMENTUM_THRESHOLD: -0.01, RI_LOOKBACK: 5
- RI_VOL_MULT: 1.2x, RI_RSI_MAX: 40, RI_STOP_BUFFER: 0.5%
- RI_PATTERN_WEIGHT: 0.40, RI_MOMENTUM_RATE: 10.0, RI_MAX_MOMENTUM_BONUS: 0.20
- RI_RSI_WEIGHT: 0.25, RI_EXTREME_VOL_BONUS: 0.10
- RI_TARGET_ATR_MULT: 2.0x, Confidence cap: 0.95

**14. defensive_hedge** (`defensive-hedge.ts`) — Family: hybrid, Volume: HARD gate
- DH_CORR_WINDOW: 30, DH_MAX_CORRELATION: 0.45, DH_MIN_VOL_OFFSET: 0.10
- DH_VOL_MULT: 1.3x, DH_STOP_BUFFER: 0.5%, DH_TARGET_ATR_MULT: 1.8x
- DH_PATTERN_WEIGHT: 0.45, DH_DECORR_WEIGHT: 0.25
- DH_VOL_OFFSET_RATE: 0.15, DH_MAX_VOL_BONUS: 0.15, DH_STRONG_ENGULF_BONUS: 0.08
- Confidence cap: 0.88

**15. adaptive_flow** (`adaptive-flow.ts`) — Family: hybrid, Volume: HARD gate
- AF_LOOKBACK: 20, AF_MIN_INVERSIONS: 3, AF_MIN_VOL_PERCENTILE: 60
- AF_VOL_MULT: 1.3x, AF_ADX_MAX: 30, AF_STOP_ATR_MULT: 1.5x, AF_STOP_BUFFER: 0.3%
- AF_TARGET_ATR_MULT: 3.0x
- AF_PATTERN_WEIGHT: 0.35, AF_INVERSION_RATE: 0.05, AF_MAX_INVERSION_BONUS: 0.20
- AF_VOL_PCT_WEIGHT: 0.25, AF_HIGH_VOL_BONUS: 0.08
- Pattern: THREE_SOLDIERS or MORNING_STAR (canonicalized B57)
- Confidence cap: 0.88

**16. volatility_edge** (`volatility-edge.ts`) — Family: hybrid, Volume: A-point SOFT, breakout HARD (B57)
- VE_A_VOL_MULT: 1.3x, VE_MIN_VOL_PERCENTILE: 70
- VE_BREAKOUT_BUFFER: 0.2%, VE_BREAKOUT_VOL_MULT: 1.3x
- VE_STOP_BUFFER: 0.3%, VE_MEASURED_MOVE_MULT: 0.85, VE_TARGET_ATR_MULT: 2.5x
- VE_BASE_CONFIDENCE: 0.40, VE_VOL_PCT_WEIGHT: 0.20, VE_FIB_WEIGHT: 0.20
- VE_VOL_SCORE_RATE: 0.05, VE_MAX_VOL_BONUS: 0.15
- VE_C_POINT_TOLERANCE: 1%, Confidence cap: 0.95

**17. dhma** (in `strategy-engine.ts`) — Family: quant-trend (note: uses OBI/microprice, not HMA — classification may be revisited), Regime-gated (IMPULSE_EXPANSION)
- theta_OBI: 0.3, epsilon_micro: 0.2, tau_toxicity: 0.7
- maxSpread: 5, k_tp: 1.5, N_flow: 50, N_burst: 10
- Confidence adjustments: +OBI*0.15, +flow*0.10, -toxicity*0.15, +/-MTF*0.10
- Base confidence: 0.6, max: 0.95

#### Volume Gate Classification Summary

| Classification | Strategies |
|---|---|
| **SOFT gate** (graduated confidence factor) | support_bounce, reverse_impulse, morning_star, volatility_edge (A-point only) |
| **HARD gate** (binary pass/fail) | inside_bar_reversal, defensive_hedge, adaptive_flow, pivot_shift, volatility_edge (breakout candle) |
| **No volume gate** (quant strategies) | All original 8 strategies (volume checks vary but not via the pattern-pool gate mechanism) |

### Section C: Shared Configuration (non-strategy, non-DB)

#### Score Weights (`score-weights.config.ts`)

| Weight | Value |
|--------|-------|
| FINAL_SCORE.HYBRID | 0.4 |
| FINAL_SCORE.CONFIDENCE | 0.3 |
| FINAL_SCORE.REGIME | 0.2 |
| FINAL_SCORE.DECAY | 0.1 |

#### Ranking Weights (`ranking-weights.ts`)

**Formula:** `rankingScore = FinalScore * qualityWeight + netReturn * returnWeight - frictionPenalty * frictionWeight + contextBonus`

| Profile | qualityWeight | returnWeight | frictionWeight | contextBonusMax |
|---------|--------------|-------------|---------------|----------------|
| QUANT | 0.45 | 0.35 | 0.10 | 0.10 |
| PATTERN | 0.30 | 0.25 | 0.20 | 0.25 |
| HYBRID | 0.35 | 0.30 | 0.15 | 0.20 |

**Net Return Normalization:** NET_RETURN_CEILING = 0.05 (5% = 1.0), NET_RETURN_FLOOR = 0.002 (0.2% = floor)

**Context Bonus/Penalty:**

| Condition | Value |
|-----------|-------|
| PAIR_GLOBAL_AGREE | +0.06 |
| PAIR_GLOBAL_DISAGREE | -0.04 |
| BTC_CONFIRMS_GLOBAL | +0.03 |
| BTC_DISAGREES_GLOBAL | -0.02 |

**Safety Rule:** FINAL_SCORE_GAP_OVERRIDE = 0.10 (when FinalScore gap > 0.10, FinalScore always wins)

#### Hybrid Parameters (`system-guards.ts`)

| Parameter | Value |
|-----------|-------|
| WEIGHTS.QUANT | 0.4 |
| WEIGHTS.PATTERN | 0.4 |
| WEIGHTS.PREDICTIVE | 0.2 |
| DECAY.LAMBDA | 0.15 |
| DECAY.FLOOR | 0.3 |
| MIN_SCORE | 0.65 |
| MAX_CONFLUENCE_WINDOW | 5 candles |

#### Scanner Parameters (`system-guards.ts`)

| Parameter | Value |
|-----------|-------|
| BATCH_SIZE | 300 |
| DUAL_POOL.IDEAL_RATIO | 0.6 |
| DUAL_POOL.ROTATIONAL_RATIO | 0.4 |

#### EV Gate Parameters (`system-guards.ts`)

| Parameter | Value |
|-----------|-------|
| MIN_PWIN | 0.40 |
| MAX_PWIN | 0.60 |
| DI_PWIN_FACTOR | 200 |
| BASE_FEE_SLIPPAGE | 0.006 (0.6%) |

#### VTS Parameters

| Parameter | Value | Source |
|-----------|-------|--------|
| VTS_NET_EV_FLOOR | -0.01 (-1%) | vts-runner.ts:351 |
| Cycle interval | 60 seconds | vts-runner.ts |

#### Execution Config (`execution-config.ts` — Object.freeze, Tier 3)

| Parameter | Value |
|-----------|-------|
| ADAPTIVE_EXPAND_FACTOR | 1.10 |
| ADAPTIVE_CONTRACT_FACTOR | 0.90 |
| TRAILING_STOP_BASE | 0.015 (1.5%) |
| TRAILING_STOP_ACCELERATION | 0.002 |
| MAX_POSITION_RISK | 0.02 (2%) |
| TRAILING_STOP_ACTIVATION_PCT | 1.0 |
| TRAILING_STOP_DISTANCE_PCT | 0.5 |
| MAX_HOLDING_PERIOD_MS | 86,400,000 (24h) |
| VERSION | v1.0.0 |

#### Regime Model

| Regime | Description |
|--------|-------------|
| TREND_FRIENDLY_STABLE | Trending with low chop |
| HIGH_VOLATILITY_UNSTABLE | High vol, unpredictable |
| RANGE_BOUND_STABLE | Sideways, bounded |
| IMPULSE_EXPANSION | Breakout/expansion |
| STRUCTURAL_TRANSITION | Regime change in progress |

---

## 3. Rollback Procedure

If performance degrades after any adjustment:

1. **Identify** — compare current state to this baseline using `authority-baseline-v1.json`
2. **Diagnose** — which parameters changed and what impact each had
3. **Revert** — restore baseline values (DB update for filter thresholds, code revert for strategy constants)
4. **Log** — document the reversion: timestamp, parameters reverted, evidence of degradation, mode
5. **Notify** — inform Kyle via Telegram
6. **Post-mortem** — document why the adjustment failed in the batch completion report

---

## 4. Versioning

This is **V1.0**. Future baselines are created when:
- A significant adjustment proves beneficial and is adopted as the new standard
- A new asset class is added (new profile baseline)
- A major system architecture change occurs

Version format: `authority-baseline-v{major}.{minor}.json`
- Major: new baseline checkpoint after proven improvements
- Minor: corrections or additions to the baseline document
