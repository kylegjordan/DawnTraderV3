# Batch 58 Pre-Implementation Audit — Phase 11 Finalization

> **Date:** 2026-04-11
> **Scope:** B58a (Governance + Baseline Snapshot) + B58b (Code Implementation)
> **Auditor:** Claude Code
> **Langston Review:** Approved (#730). Guardrails: snapshot/classify/document/baseline only. No strategy constant migration. Log-only validation first.

---

## 1. System Impact Map Review — 26 Components Flagged

### CRITICAL (10) — Must audit and validate during B58b

| # | Component | Why | B58 Impact |
|---|-----------|-----|------------|
| 1 | **Signal Orchestrator** (`signal-orchestrator.ts`) | Reads SCORE_WEIGHTS, DI thresholds, strategy params. Computes FinalScore. | Registry validation on all reads |
| 2 | **FX5 Scanner** (`fx5-scanner.ts`) | Reads screener_filters DB (4-path thresholds), IMF metrics every 30s | Validate filter thresholds on each cycle |
| 3 | **screener_filters DB Table** (24 rows) | Single source of truth for all filter values | Add validation constraints to writes |
| 4 | **SCORE_WEIGHTS** (`score-weights.config.ts`) | FinalScore computation depends on these | Registry versioning, schema validation |
| 5 | **CANONICAL_REGIME_STRATEGY_MAP** (`canonical-regime-strategy-map.ts`) | Controls which strategies run per regime | Registry validation |
| 6 | **Net Expectancy Kernel** (within Signal Orchestrator) | EV gate uses friction, reward/risk ratios | Validate cost-model-derived values |
| 7 | **Pattern Filter Profile** (`pattern-filter-profile.ts`) | PATTERN_POOL_GUARDRAILS (0.45 FinalScore floor, 15% max position) | Validate against schema |
| 8 | **SYSTEM_GUARDS** (`system-guards.ts`) | Guardrails V2 policies (exposure caps, risk limits) | Registry validation + versioning |
| 9 | **Pre-Execution Validator** (`pre-execution-validator.ts`) | Reads SYSTEM_GUARDS for final gate | Validate guard values before enforcement |
| 10 | **Paper Execution Engine** (`paper-execution-engine.ts`) | Execution lifecycle, EV gate mirror | Validate incoming parameters |

### HIGH (10) — Secondary audit required

| # | Component | Why |
|---|-----------|-----|
| 11 | **VTS Runner** (`vts-runner.ts`) | Dual-path mirrors active trading scoring |
| 12 | **Strategy Thresholds** (17 strategy files) | Per-strategy entry/exit constants |
| 13 | **MCE** (`market-context-engine.ts`) | Computes regime + indicators |
| 14 | **Drift Detector** (`drift-detector.ts`) | Monitors parameter drift |
| 15 | **ML Calibration** (`ml-calibration.ts`) | Produces learning recommendations |
| 16 | **Cost Model** (`cost-model.ts`) | Single source of truth for friction |
| 17 | **DI Calculation** (within Signal Orchestrator) | Critical input to EV gate (Pwin) |
| 18 | **RANKING_WEIGHTS** (`ranking-weights.ts`) | Phase 14.5 cross-family signal ordering |
| 19 | **SQE** (`signal_quality_evaluator.ts`) | FinalScore threshold gatekeeper |
| 20 | **RTB Service** (`ready_to_buy_service.ts`) | rankingScore-based signal queue |

### MEDIUM (6) — Dependent audit

| # | Component | Why |
|---|-----------|-----|
| 21 | **Active Filter Pool** (`active-filter-pool.ts`) | Populated by FX5 Scanner |
| 22 | **Telemetry Aggregator** (`telemetry-aggregator.ts`) | Win rates, average edge per pool |
| 23 | **Adaptive Ratio Manager** (`adaptive-ratio-manager.ts`) | Pool split logic |
| 24 | **Learning Cooldown** (`learning-cooldown.ts`) | Regime-aware learning gating |
| 25 | **Boot Orchestrator** (`boot_orchestrator.ts`) | Service load order — registry must load early |
| 26 | **Startup Sequence** (`index.ts`) | ~40+ service initializations |

### KEY FINDING: Integration Point Correction

The `/api/filters-v2` endpoint referenced in old Phase 11 docs **may not exist as-named**. Filter writes go through the `screener_filters` DB table directly via Drizzle ORM. The B58b registry validation needs to intercept at the **DB write layer**, not a specific API endpoint.

---

## 2. Strategy Parameter Catalog — 150+ Parameters

### Summary

| Category | Count | Source | Authority |
|----------|-------|--------|-----------|
| Global config (system-guards) | 38 | `server/config/system-guards.ts` | Hardcoded |
| Score weights | 4 | `server/config/score-weights.config.ts` | Hardcoded |
| Ranking weights | 8+ | `server/config/ranking-weights.ts` | Hardcoded |
| Original 8 strategies | 56+ | `server/services/strategy-engine.ts` | Hardcoded (3 user-configurable via TradingSettings) |
| Newer 8 strategies | 80+ | `server/strategies/*.ts` (individual files) | Hardcoded |
| **Total** | **150+** | | |

### Global Configuration (`system-guards.ts`)

| Parameter | Value | Category |
|-----------|-------|----------|
| BASE_FEE_SLIPPAGE | 0.006 (0.6%) | Friction |
| DI_TRENDING | 55 | Regime |
| DI_CHOPPY | 35 | Regime |
| MIN_PWIN | 0.40 | EV Gate |
| MAX_PWIN | 0.60 | EV Gate |
| DI_PWIN_FACTOR | 200 | EV Gate |
| HYBRID_PARAMS.MIN_SCORE | 0.65 | Hybrid |
| HYBRID_PARAMS.MAX_CONFLUENCE_WINDOW | 5 candles | Hybrid |
| HYBRID_PARAMS.WEIGHTS.QUANT | 0.4 | Hybrid |
| HYBRID_PARAMS.WEIGHTS.PATTERN | 0.4 | Hybrid |
| HYBRID_PARAMS.WEIGHTS.PREDICTIVE | 0.2 | Hybrid |
| HYBRID_PARAMS.DECAY.LAMBDA | 0.15 | Decay |
| HYBRID_PARAMS.DECAY.FLOOR | 0.3 | Decay |
| DUAL_POOL.IDEAL_RATIO | 0.6 | Scanner |
| DUAL_POOL.ROTATIONAL_RATIO | 0.4 | Scanner |
| BATCH_SIZE | 300 | Scanner |

### Score Weights (`score-weights.config.ts`)

| Weight | Value |
|--------|-------|
| FINAL_SCORE.HYBRID | 0.4 |
| FINAL_SCORE.CONFIDENCE | 0.3 |
| FINAL_SCORE.REGIME | 0.2 |
| FINAL_SCORE.DECAY | 0.1 |

### Strategy Parameters (per strategy)

#### Original 8 Strategies (in `strategy-engine.ts`)

**1. VWAP_PULLBACK** — pullbackThreshold: 3%, volumeMultiplier: 1.5x, maxHoldingPeriod: 24, stop: 0.5x ATR, target: high24h - 0.25x ATR, confidence: 0.7

**2. ABCD_LONG** — minConsolidation: 10, breakoutThreshold: 1.5%, volumeMultiplier: 1.5x, targetPercent: 3%, trailingStopPercent: 2%, ATR: 14-period, confidence: 0.75

**3. SMA_TREND_RIDE** — smaLength: 20, trailingStopPercent: 2%, entry premium: 0.2%, confidence: 0.65

**4. BREAKOUT** — minConsolidationBars: 10, breakoutBuffer: 1%, volumeMultiplier: 1.5x, maxHoldingHours: 12, dynamicRange: max(7%, 5.0*ATR%), minTouches: 2, confidence: 0.75

**5. MEAN_REVERSION** — deviationThreshold: max(3%, 1.5*ATR/price), partialExitPercent: 50, stopLossBuffer: 1%, confidence: 0.7

**6. RANGE_TRADING** — minRangeDurationHours: 7, minBoundaryTouches: 1, entryZoneWidth: 1.5%, stopLossBeyond: 1%, minRangeWidth: max(1.5%, 2.0*ATR%), confidence: 0.72

**7. VWAP_BOUNCE** — vwapProximity: 1.5%, minVWAPSlope: 0.3%, volumeMultiplier: 1.3x, maxPullbackBars: 5, confidence: 0.73

**8. LIQUIDITY_TRAP** — maxTrapExtension: 1.2%, trapReturnBars: 2, minLevelTouches: 2, volumeRatio: 1.5x, rangeMaxWidth: 5%, confidence: 0.68

#### Newer 8 Strategies (individual files in `server/strategies/`)

**9. MORNING_STAR** — MS_MIN_STRENGTH: 0.55, MS_VOL_MULT: 1.2x, MS_STOP_BUFFER: 0.3%, MS_TARGET_ATR_MULT: 2.5x, MS_STRENGTH_WEIGHT: 0.80, confidence cap: 0.93. **Volume: SOFT gate (B57)**

**10. INSIDE_BAR_REVERSAL** — IB_MAX_COMPRESSION: 0.85, IB_BREAKOUT_BUFFER: 0.2%, IB_VOL_MULT: 1.3x, IB_STOP_BUFFER: 0.3%, IB_TARGET_ATR_MULT: 2.0x, IB_COMPRESSION_WEIGHT: 0.35, confidence cap: 0.93. **Volume: HARD gate**

**11. SUPPORT_BOUNCE** — SB_LOOKBACK_CANDLES: 50, SB_CLUSTER_TOLERANCE_BASE: 0.7% (widened B57), SB_MIN_TOUCHES: 2, SB_MAX_DISTANCE: 3%, SB_PROXIMITY: 3.5%, SB_VOL_MULT: 1.2x, SB_STOP_BELOW_SUPPORT: 0.5%, SB_TARGET_ATR_MULT: 2.0x, confidence cap: 0.93. **Volume: SOFT gate (B57)**

**12. PIVOT_SHIFT** — PS_RSI_LOW: 35, PS_RSI_HIGH: 65, PS_ADX_SLOPE_MIN: 0.5, PS_VOL_MULT: 1.3x, PS_STOP_ATR_MULT: 1.5x, PS_TARGET_ATR_MULT: 3.0x, confidence cap: 0.93. **Volume: HARD gate**

**13. REVERSE_IMPULSE** — RI_MIN_STRENGTH: 0.58, RI_MOMENTUM_THRESHOLD: -0.01, RI_LOOKBACK: 5, RI_VOL_MULT: 1.2x, RI_RSI_MAX: 40, RI_STOP_BUFFER: 0.5%, RI_TARGET_ATR_MULT: 2.0x, confidence cap: 0.95. **Volume: SOFT gate (B57)**

**14. DEFENSIVE_HEDGE** — DH_CORR_WINDOW: 30, DH_MAX_CORRELATION: 0.45, DH_MIN_VOL_OFFSET: 0.10, DH_VOL_MULT: 1.3x, DH_TARGET_ATR_MULT: 1.8x, confidence cap: 0.88. **Volume: HARD gate**

**15. ADAPTIVE_FLOW** — AF_LOOKBACK: 20, AF_MIN_INVERSIONS: 3, AF_MIN_VOL_PERCENTILE: 60, AF_VOL_MULT: 1.3x, AF_ADX_MAX: 30, AF_STOP_ATR_MULT: 1.5x, AF_TARGET_ATR_MULT: 3.0x, confidence cap: 0.88. **Volume: HARD gate**

**16. VOLATILITY_EDGE** — VE_A_VOL_MULT: 1.3x, VE_MIN_VOL_PERCENTILE: 70, VE_BREAKOUT_BUFFER: 0.2%, VE_BREAKOUT_VOL_MULT: 1.3x, VE_MEASURED_MOVE_MULT: 0.85, VE_TARGET_ATR_MULT: 2.5x, confidence cap: 0.95. **Volume: A-point SOFT, breakout HARD (B57)**

**17. DHMA** — theta_OBI: 0.3, epsilon_micro: 0.2, tau_toxicity: 0.7, maxSpread: 5 ticks, k_tp: 1.5, N_flow: 50, N_burst: 10, confidence: 0.6 + adjustments (max 0.95)

---

## 3. Database Baseline Snapshot

### screener_filters Table (24 rows = 12 filter paths x 2 modes)

**Uniform across all paths:**

| Column | Value |
|--------|-------|
| lq_min | 43.0000 |
| corr_max | 0.9200 |
| min_price | 0.01 |
| min_liquidity | 500,000 |
| min_market_cap | 100,000,000 |
| rsi_min / rsi_max | 30 / 70 |
| volatility_min / volatility_max | 0.50 / 5.00 |
| max_bid_ask_spread | 1.00 |
| final_score_min | 0.3500 |
| regime_weight_min | 0.3000 |
| min_history_days | 30 |

**Differentiating thresholds:**

| filter_path | vn_max | di_min | di_max | min_volume |
|---|---|---|---|---|
| active_quant | 0.8500 | 25 | 100 | 500,000 |
| active_breakout | 0.8500 | 10 | 100 | 400,000 |
| active_trend | 0.8500 | 10 | 100 | 500,000 |
| active_pattern | 0.9800 | 5 | 100 | 250,000 |
| active_oscillator | 0.8500 | 0 | 30 | 250,000 |
| active_reversal | 0.8500 | 0 | 35 | 250,000 |
| vts_quant | 0.9500 | 15 | 100 | 250,000 |
| vts_breakout | 0.9500 | 10 | 100 | 200,000 |
| vts_trend | 0.9500 | 10 | 100 | 250,000 |
| vts_pattern | 0.9800 | 3 | 100 | 150,000 |
| vts_oscillator | 0.9500 | 0 | 35 | 150,000 |
| vts_reversal | 0.9500 | 0 | 40 | 150,000 |

**Design patterns:**
- VTS paths consistently more relaxed (lower min_volume, higher vn_max at 0.95 vs 0.85)
- Pattern paths have highest vn_max tolerance (0.98) in both VTS and active
- Oscillator and reversal have di_min=0 (no directional floor)
- Live and paper rows are **identical** for every filter path
- **Simplification insight (prior session):** Only 4 columns actually differentiate between paths (vn_max, di_min, di_max, min_volume). All other columns are uniform. This means fewer parameters truly vary, simplifying the adjustment framework.

### strategy_settings Table (36 rows = 18 strategies x 2 modes)

- **8 enabled** (original quant): vwap_pullback, abcd_long, sma_trend_ride, breakout, mean_reversion, range_trading, vwap_bounce, liquidity_trap — full parameter configs
- **10 disabled** (newer pattern+hybrid): placeholder params only (`riskLevel: medium, maxPositionSize: 0.1`). Real tuning lives in hardcoded code constants.

### Related Tables

- **filter_calibration_log**: 220 rows (historical calibration changes)
- **filter_diagnostics**: 83,753 rows (runtime filter diagnostic data)

---

## 3b. Missing Parameters (flagged by prior session review)

### EXECUTION_CONFIG (`server/config/execution-config.ts`) — Tier 3 Constitutional (Object.freeze)

| Parameter | Value | Purpose |
|-----------|-------|---------|
| ADAPTIVE_EXPAND_FACTOR | 1.10 | Adaptive sizing expansion |
| ADAPTIVE_CONTRACT_FACTOR | 0.90 | Adaptive sizing contraction |
| TRAILING_STOP_BASE | 0.015 (1.5%) | Base trailing stop distance |
| TRAILING_STOP_ACCELERATION | 0.002 | Trailing stop tightening rate |
| MAX_POSITION_RISK | 0.02 (2%) | Maximum risk per position |
| TRAILING_STOP_ACTIVATION_PCT | 1.0 | Trailing stop activation threshold |
| TRAILING_STOP_DISTANCE_PCT | 0.5 | Trailing stop distance percent |
| MAX_HOLDING_PERIOD_MS | 86,400,000 (24h) | Maximum trade holding period |
| VERSION | v1.0.0 | Config version |

**Note:** This config is `Object.freeze`'d — immutable at runtime. Should be in baseline as Tier 3 constitutional items.

### VTS_NET_EV_FLOOR (`server/services/vts-runner.ts:351`)

| Parameter | Value | History | Category |
|-----------|-------|---------|----------|
| VTS_NET_EV_FLOOR | -0.01 (-1%) | B52 Fix 19: tightened from -2% → -1%. -2% was too permissive (zero rejections). | Tier 1 adjustable |

**Note:** Active trading uses strict netEV > 0. VTS floor allows boundary-case learning while filtering truly negative-EV trades. This is a Tier 1 adjustable parameter per the scope.

### Boot Orchestrator Circular Dependency Warning

The previous session flags that the Boot Orchestrator already has a circular dependency issue from B52. Adding the parameter registry as an early-load dependency needs careful implementation to avoid reintroducing that class of bug.

---

## 4. Implications for B58a

### Authority Baseline Structure (three sections per Langston recommendation)

1. **`db_thresholds`** — screener_filters snapshot (24 rows with all columns)
2. **`strategy_constants`** — normalized from hardcoded code constants (150+ params across 17 strategies)
3. **`shared_config`** — rankingScore weights, SCORE_WEIGHTS, SYSTEM_GUARDS non-strategy params, HYBRID_PARAMS

### What B58a Does NOT Do

- Does NOT migrate strategy constants from code to DB
- Does NOT change any threshold values
- Does NOT add validation enforcement (that's B58b)
- Does NOT modify any trading logic

### B58b Integration Points (for later)

1. **Boot Orchestrator** — load registry before any consuming service
2. **screener_filters DB writes** — validate against registry bounds (Drizzle ORM layer, not API endpoint)
3. **Score computation** — validate SCORE_WEIGHTS on startup
4. **Strategy evaluation** — structural validation of per-strategy thresholds on startup
5. **Log-only mode first** — warn but don't block, then switch to blocking after verification

---

## 5. Langston Consensus Summary

From messages #723-730:
- Three-tier governance (adjustable / supervised / constitutional)
- Per-family/path parameter bounds with global sanity envelopes
- Evidence-source agnostic with mode precedence (Live > Paper > VTS)
- Asset-class extensible hierarchy
- Directional bias as bounded Tier 2 context input
- B58a = snapshot/classify/document/baseline ONLY
- B58b = code implementation with strict B58a gate
- No strategy constant migration in this phase
- Startup validation = structural + bounds sanity, not behavior reinterpretation
