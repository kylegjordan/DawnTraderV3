# B63 Item 15 — Adaptive Framework Audit

**Author:** Langston (Opus 4.6 session, 2026-04-22)
**Status:** Levels 1-3 and Part E COMPLETE.

---

## Operating-Mode Context

**Active trading is OFF. Paper trading is OFF. Only VTS (passive learning) is running.** All findings are framed as VTS-mode observations and preparation for Phase 19 paper mode. No recommendations for immediate code changes — the observation window runs through 2026-04-28.

---

## Executive Summary

1. **The system has 69 adaptive levers but only 18 (26%) actually adapt at runtime.** The remaining 51 are static constants frozen in source code across 12+ files. 65% of all levers require a code deploy to change. For a system designed to respond to market conditions, this is a significant rigidity. The truly adaptive levers are concentrated in a narrow band: regime classification, scoring, and sizing. Everything outside that band — thresholds, geometry, weights, bounds — is frozen.

2. **The scoring pipeline is snapshot-heavy (governance violation).** Of 10 audited adaptive levers, only 3 use properly rolling inputs (pair regime, DBS, trailing stop). The scoring pipeline (FinalScore, RegimeWeight, PredictiveConfidence) relies entirely on snapshots or cumulative averages. PredictiveConfidence uses all-time cumulative VTS win rate rather than a rolling window — in a market that shifts on multi-hour timescales, this measures a market that no longer exists.

3. **ExpectedEdge is anti-correlated with actual profit (r = −0.130).** The system overestimates profitability on every trade (mean expected edge +2.28% vs mean actual net −0.98%). This is the strongest anti-predictive signal in the dataset — worse than FinalScore (r = −0.017). The edge model does not account for real execution friction and adverse selection.

4. **PredictiveConfidence has a self-cancellation design flaw.** It feeds FinalScore (higher → easier to pass) AND the ROI gate (higher → stricter threshold) simultaneously. In VTS mode where the FinalScore gate is non-binding, higher PredConf makes admission HARDER — the opposite of designed intent. This dual consumption is undocumented.

5. **DecayPenalty is dead.** Always zero across 595 trades. Occupies 10% of the FinalScore formula but contributes nothing. Dead weight in the scoring composite.

6. **Mode overlays and governance gates are functionally inactive.** Global regime is TFS 90.6% of the time, meaning NORMAL mode and STABLE governance are the near-constant state. These systems exist in code but are untested under stress during this observation window.

7. **quant-strong_trend (B63) is the only profitable segment.** Validates the B63 lane architecture. All other source pools are net-negative.

**Overall verdict:** The adaptive framework has sound architectural bones (the DAG is acyclic, chains are logically structured, no direct feedback loops) but poor calibration and excessive rigidity. The scoring pipeline is the weakest link: anti-predictive FinalScore, inverted RegimeWeight, stale PredConf, dead decayPenalty, and an anti-correlated expectedEdge. B66 should prioritize: (a) promoting 65 hard-coded constants to DB/config, (b) fixing the PredConf self-cancellation, (c) switching scoring inputs from snapshots to rolling windows, and (d) recalibrating the FinalScore formula using empirical outcome data. All recommendations are pre-Phase-19 preparation, not immediate deploys.

---

## Level 1 — Framework Enumeration

### Methodology

Source files read: 19 TypeScript files across `server/config/`, `server/core/`, and `server/services/`. Each lever is classified by:
- **Cadence**: how often it changes (per-scan / per-cycle / per-batch / manual / static)
- **Authority**: where the value lives (hard-coded / config file / DB / runtime-computed)
- **Adaptive**: whether the lever adjusts automatically at runtime (YES / NO — NO means it's a tunable constant that requires a deploy or DB write to change)

### Lever Count Summary

| Category | Lever count | Adaptive (runtime) | Static-tunable |
|---|---|---|---|
| Regime classification | 8 | 3 | 5 |
| DBS computation | 4 | 1 | 3 |
| Regime stability | 4 | 1 | 3 |
| SQE / Scoring | 9 | 2 | 7 |
| ROI / Profitability gate | 4 | 1 | 3 |
| Strategy governance | 3 | 1 | 2 |
| Mode overlays | 3 | 1 | 2 |
| Position sizing (DSE) | 8 | 3 | 5 |
| Trailing exit (TEC) | 5 | 2 | 3 |
| Ranking | 5 | 1 | 4 |
| Filter thresholds (IMF) | 6 | 0 | 6 |
| Exchange / friction | 3 | 0 | 3 |
| Hybrid / multi-TF | 4 | 1 | 3 |
| Scanner | 3 | 1 | 2 |
| **Total** | **69** | **18** | **51** |

18 levers are genuinely adaptive at runtime. 51 are static constants that require a code deploy or DB write to change. Of the 51 static-tunable, 6 are already DB-driven (via `screener_filters`); the remaining 45 are hard-coded in source.

---

### Full Inventory

#### 1. Regime Classification (8 levers)

| # | Lever | File | Design intent | Inputs | Outputs | Cadence | Authority | Adaptive | Downstream |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Pair regime label** | `core/metrics/market-regime.ts` :: `calculatePairRegime()` | Classify each pair into 1 of 5 canonical regimes | OHLC data + DBS score | Regime label + confidence | Per-MCE-cycle | Runtime-computed | YES | SQE, strategy selection, mode overlay, governance, stability |
| 2 | Vol threshold (RBS) | `core/metrics/market-regime.ts` | RBS requires low volatility | — | `< 0.012` boundary | Static | Hard-coded | NO | Regime label |
| 3 | ADX threshold (RBS) | `core/metrics/market-regime.ts` | RBS requires low directional pressure | — | `< 45` boundary | Static | Hard-coded | NO | Regime label |
| 4 | DBS threshold (RBS) | `core/metrics/market-regime.ts` | RBS requires neutral bias (B62) | — | `< 0.10` boundary | Static | Hard-coded | NO | Regime label |
| 5 | DBS threshold (TFS) | `core/metrics/market-regime.ts` | TFS admits moderate+ directional pairs (B62) | — | `>= 0.30` boundary | Static | Hard-coded | NO | Regime label |
| 6 | DBS threshold (IE) | `core/metrics/market-regime.ts` | IE admits strongly biased pairs (B62) | — | `>= 0.50` boundary | Static | Hard-coded | NO | Regime label |
| 7 | Momentum lookback | `core/metrics/market-regime.ts` :: `computeMomentum()` | Stability of momentum signal | OHLC | Lookback = 30 candles (HF7) | Static | Hard-coded | NO | Regime label |
| 8 | **Regime confidence** | `core/metrics/market-regime.ts` :: `calculatePairRegime()` | Certainty of classification | Vol, mom, ADX, DBS | Confidence [0.4, 0.95] | Per-MCE-cycle | Runtime-computed | YES | Stability classifier, SQE |

#### 2. DBS Computation (4 levers)

| # | Lever | File | Design intent | Inputs | Outputs | Cadence | Authority | Adaptive | Downstream |
|---|---|---|---|---|---|---|---|---|---|
| 9 | **Pair DBS score** | `core/metrics/directional-bias.ts` :: `computeDirectionalBias()` | Measure directional strength | OHLC + ATR + config | DBS [-1, +1] + category | Per-MCE-cycle | Runtime-computed | YES | Regime classifier, strong-trend lane routing, counter-trend guards |
| 10 | DBS weights (w1/w2/w3) | `types/directional-bias.types.ts` :: `DEFAULT_DBS_CONFIG` | Balance slope vs return vs EMA components | — | Weight triple | Static | Hard-coded | NO | DBS score |
| 11 | DBS category thresholds | `types/directional-bias.types.ts` :: `DIRECTIONAL_BIAS_CATEGORIES` | Classify DBS into UP_STRONG/UP_MODERATE/etc. | — | Category boundaries | Static | Hard-coded | NO | DBS category label |
| 12 | DBS lookback period | `types/directional-bias.types.ts` :: `DEFAULT_DBS_CONFIG` | Rolling window for DBS calculation | — | N candles | Static | Hard-coded | NO | DBS score |

#### 3. Regime Stability (4 levers)

| # | Lever | File | Design intent | Inputs | Outputs | Cadence | Authority | Adaptive | Downstream |
|---|---|---|---|---|---|---|---|---|---|
| 13 | **Stability classification** | `core/governance/regime-stability.ts` :: `classifyStability()` | Determine STABLE / TRANSITION / UNSTABLE | DriftScore, VolZ, confidence, flipRate | Stability label | Per-scan-cycle (cached) | Runtime-computed | YES | Mode overlay, governance gate |
| 14 | Stability DriftScore thresholds | `core/governance/regime-stability.ts` :: `STABILITY_THRESHOLDS` | Boundary for regime drift | — | stable: 0.8, transition: 1.5 | Static | Hard-coded | NO | Stability label |
| 15 | Stability VolZ thresholds | `core/governance/regime-stability.ts` :: `STABILITY_THRESHOLDS` | Boundary for vol deviation | — | stable: 1.2, transition: 2.0 | Static | Hard-coded | NO | Stability label |
| 16 | Stability FlipRate thresholds | `core/governance/regime-stability.ts` :: `STABILITY_THRESHOLDS` | Boundary for regime churn | — | stable: 1, transition: 3, unstable: >=4 | Static | Hard-coded | NO | Stability label |

#### 4. SQE / Scoring (9 levers)

| # | Lever | File | Design intent | Inputs | Outputs | Cadence | Authority | Adaptive | Downstream |
|---|---|---|---|---|---|---|---|---|---|
| 17 | **FinalScore** | `core/utils/score-calculator.ts` :: `calculateFinalScore()` | Composite signal quality | hybridScore, confidence, regimeWeight, decayPenalty | Score [0, 1] | Per-signal | Runtime-computed | YES | SQE gate, ranking |
| 18 | FinalScore weights | `config/score-weights.config.ts` :: `SCORE_WEIGHTS` | Balance components | — | H=0.4, C=0.3, R=0.2, D=0.1 | Static | Hard-coded | NO | FinalScore formula |
| 19 | MIN_FINAL_SCORE | `core/filters/signal_quality_evaluator.ts` | Quality gate threshold | — | 0.35 (default), DB-overridable | DB-poll (60s cache) | DB / hard-coded fallback | NO | SQE pass/fail |
| 20 | MIN_REGIME_WEIGHT | `core/filters/signal_quality_evaluator.ts` | Regime-fit gate threshold | — | 0.30 (default), DB-overridable | DB-poll (60s cache) | DB / hard-coded fallback | NO | SQE pass/fail |
| 21 | Pattern pool FinalScore floor | `config/pattern-filter-profile.ts` :: `PATTERN_POOL_GUARDRAILS` | Elevated floor for pattern signals | — | 0.45 | Static | Hard-coded | NO | SQE (pattern path) |
| 22 | **RegimeWeight (backfill)** | `core/utils/score-calculator.ts` :: `calculateRegimeWeight()` | Regime fitness proxy | trendStrength, volatility | Weight [0.1, 1] | Per-signal (sync backfill) | Runtime-computed | YES | FinalScore, SQE gate |
| 23 | RegimeWeight coefficients | `core/utils/score-calculator.ts` | Trend vs vol balance in backfill | — | trend=0.7, vol=0.3 | Static | Hard-coded | NO | RegimeWeight formula |
| 24 | **PredictiveConfidence** | `core/utils/score-calculator.ts` :: `getPredictiveConfidence()` | Adaptive confidence from VTS telemetry | VTS win rate per (regime, strategy) | Confidence [0, 1] via sigmoid | Per-minute (60s cache) | Runtime-computed (VTS telemetry) | YES | FinalScore, ROI gate |
| 25 | PredConf sigmoid parameters | `core/utils/score-calculator.ts` | Shape of winRate → confidence transform | — | center=0.5, scale=6 | Static | Hard-coded | NO | PredictiveConfidence |

#### 5. ROI / Profitability Gate (4 levers)

| # | Lever | File | Design intent | Inputs | Outputs | Cadence | Authority | Adaptive | Downstream |
|---|---|---|---|---|---|---|---|---|---|
| 26 | **Dynamic ROI threshold** | `core/calculations/expectancy.ts` :: `getDynamicROIThreshold()` | Regime-aware minimum ROI | Regime, PredictiveConfidence, adaptive config | ROI floor [1%, 4%] | Per-signal | Runtime-computed | YES | SQE ROI gate |
| 27 | ROI_FLEX_MULTIPLIER | `config/adaptive-thresholds.ts` | ±30% flex around regime baseline | — | 0.6 | Static | Hard-coded | NO | Dynamic ROI |
| 28 | ROI bounds (min/max) | `config/adaptive-thresholds.ts` | Hard floor/ceiling for ROI | — | min=1%, max=4% | Static | Hard-coded | NO | Dynamic ROI |
| 29 | FRICTION_SAFETY_BUFFER | `config/adaptive-thresholds.ts` | 10% above friction floor | — | 1.1 | Static | Hard-coded | NO | Profitability check |

#### 6. Strategy Governance (3 levers)

| # | Lever | File | Design intent | Inputs | Outputs | Cadence | Authority | Adaptive | Downstream |
|---|---|---|---|---|---|---|---|---|---|
| 30 | Strategy dependency levels | `config/strategy-governance.ts` :: `STRATEGY_GOVERNANCE` | Classify regime fragility per strategy | — | HIGH/MEDIUM/LOW per strategy (21 entries) | Static | Hard-coded | NO | Governance gate |
| 31 | INFLUENCE_RULES multipliers | `config/strategy-governance.ts` :: `INFLUENCE_RULES` | Weight reduction by stability × dependency | Stability, dependency | Multiplier [0, 1] (3×3 matrix) | Static | Hard-coded | NO | Governance gate, sizing |
| 32 | **Governance gate output** | `core/governance/strategy-eligibility.ts` :: `isStrategyEligible()` | Binary: is strategy permitted? | Strategy, stability, dependency | Boolean | Per-signal | Runtime-computed | YES | SQE, paper execution |

#### 7. Mode Overlays (3 levers)

| # | Lever | File | Design intent | Inputs | Outputs | Cadence | Authority | Adaptive | Downstream |
|---|---|---|---|---|---|---|---|---|---|
| 33 | **Active mode** | `core/governance/strategy-modes.ts` :: `resolveStrategyMode()` | Map stability → NORMAL/DEFENSIVE/SURVIVAL | RegimeStability | Mode label | Per-scan (follows stability) | Runtime-computed | YES | Position sizing, stop/target geometry, confidence floor, cooldown |
| 34 | Mode overlay multipliers | `core/governance/strategy-modes.ts` :: `STRATEGY_MODE_OVERLAYS` | Dampen exposure in adverse conditions | — | 5 multipliers × 3 modes (15 values) | Static | Hard-coded | NO | All geometry + sizing in execution |
| 35 | Mode confidence floors | `core/governance/strategy-modes.ts` :: `STRATEGY_MODE_OVERLAYS` | Minimum confidence per mode | — | NORMAL=0.60, DEFENSIVE=0.70, SURVIVAL=0.80 | Static | Hard-coded | NO | SQE confidence floor gate |

#### 8. Position Sizing — DSE (8 levers)

| # | Lever | File | Design intent | Inputs | Outputs | Cadence | Authority | Adaptive | Downstream |
|---|---|---|---|---|---|---|---|---|---|
| 36 | **DSE size multiplier** | `core/risk/dynamic-sizing-engine.ts` :: `computeDynamicSize()` | Adapt position size to conditions | Edge, vol, cost, confidence, cost-pressure | Multiplier [0.3, 1.2] | Per-trade | Runtime-computed | YES | Position size |
| 37 | **Cost pressure factor** | `core/risk/dynamic-sizing-engine.ts` :: `getCostPressureFactor()` | Dampen sizing when spreads widen | Cost-drift monitor | Factor [0.8, 1.0] | Per-trade | Runtime-computed | YES | DSE multiplier |
| 38 | **Adaptive weights (edge/confidence)** | `services/adaptive-learning-repository.ts` :: `loadAdaptiveWeights()` | Pull learned performance from VTS | VTS telemetry per (regime, strategy) | Edge, confidence | Per-trade (DB read) | DB / VTS telemetry | YES | DSE multiplier |
| 39 | DSE multiplier bounds | `core/risk/dynamic-sizing-engine.ts` :: `DSE_CONFIG` | Prevent extreme sizing | — | min=0.3, max=1.2 | Static | Hard-coded | NO | DSE multiplier |
| 40 | DSE sensitivity params | `core/risk/dynamic-sizing-engine.ts` :: `DSE_CONFIG` | Tune edge/vol/cost response curves | — | EDGE_SENSITIVITY=4, VOL_THRESHOLD=0.02, etc. | Static | Hard-coded | NO | DSE multiplier |
| 41 | DEFAULT_RISK_PCT | `core/risk/dynamic-sizing-engine.ts` :: `DSE_CONFIG` | Base portfolio fraction risked | — | 2% | Static | Hard-coded | NO | Base position size |
| 42 | MAX_POSITION_RISK | `config/execution-config.ts` :: `EXECUTION_CONFIG` | Hard cap on any single position | — | 2% of balance | Static | Hard-coded | NO | DSE cap |
| 43 | Pattern pool MAX_POSITION_PCT | `config/pattern-filter-profile.ts` :: `PATTERN_POOL_GUARDRAILS` | Tighter cap for pattern-pool trades | — | 15% | Static | Hard-coded | NO | Pattern-pool sizing |

#### 9. Trailing Exit — TEC (5 levers)

| # | Lever | File | Design intent | Inputs | Outputs | Cadence | Authority | Adaptive | Downstream |
|---|---|---|---|---|---|---|---|---|---|
| 44 | **Trailing stop price** | `services/trailing-exit-controller.ts` | Dynamic stop following price | DI, VolNoise, ATR, high-water mark | Stop price | Per-tick | Runtime-computed | YES | Exit decision |
| 45 | **Break-even / target latch** | `services/trailing-exit-controller.ts` | Two-stage exit locking | Price vs entry, price vs target | Latch state (bool × 2) | Per-tick | Runtime-computed | YES | Mode persistence |
| 46 | Trailing stop base distance | `config/execution-config.ts` :: `EXECUTION_CONFIG` | Initial trailing distance | — | 1.5% | Static | Hard-coded | NO | TEC computation |
| 47 | Trailing stop acceleration | `config/execution-config.ts` :: `EXECUTION_CONFIG` | Tightening speed | — | 0.2% per step | Static | Hard-coded | NO | TEC computation |
| 48 | MAX_HOLDING_PERIOD | `config/execution-config.ts` :: `EXECUTION_CONFIG` | Timeout force-close | — | 24 hours | Static | Hard-coded | NO | Timeout exit |

#### 10. Ranking (5 levers)

| # | Lever | File | Design intent | Inputs | Outputs | Cadence | Authority | Adaptive | Downstream |
|---|---|---|---|---|---|---|---|---|---|
| 49 | **rankingScore** | `config/ranking-weights.ts` :: `computeRankingScore()` | Cross-family signal desirability | FinalScore, netReturn, friction, contextBonus, signalType | Score [0, 1] | Per-signal | Runtime-computed | YES | RTB queue ordering |
| 50 | Ranking weight profiles | `config/ranking-weights.ts` :: `RANKING_WEIGHTS` | Family-specific component balance | — | 3 profiles × 4 weights | Static | Hard-coded | NO | rankingScore formula |
| 51 | Net return normalization | `config/ranking-weights.ts` | Scale return to [0,1] | — | ceiling=5%, floor=0.2% | Static | Hard-coded | NO | rankingScore input |
| 52 | Context bonus rules | `config/ranking-weights.ts` :: `CONTEXT_BONUS` | Regime-agreement reward/penalty | — | 4 bonus values | Static | Hard-coded | NO | rankingScore input |
| 53 | FinalScore gap override | `config/ranking-weights.ts` | Prevent mediocre signals outranking on return alone | — | 0.10 gap threshold | Static | Hard-coded | NO | RTB ordering |

#### 11. Filter Thresholds — IMF (6 levers)

| # | Lever | File | Design intent | Inputs | Outputs | Cadence | Authority | Adaptive | Downstream |
|---|---|---|---|---|---|---|---|---|---|
| 54 | LQ_MIN | `screener_filters` table (DB) | Minimum liquidity score | — | Per filter path | User-adjustable | DB | NO (manual) | FX5 scanner pair admission |
| 55 | VN_MAX | `screener_filters` table (DB) | Maximum vol-noise | — | Per filter path | User-adjustable | DB | NO (manual) | FX5 scanner pair admission |
| 56 | DI_MIN / DI_MAX | `screener_filters` table (DB) | Directional intensity range | — | Per filter path | User-adjustable | DB | NO (manual) | FX5 scanner pair admission |
| 57 | MIN_VOLUME_USD | `screener_filters` table (DB) | Minimum 24h volume | — | Per filter path | User-adjustable | DB | NO (manual) | FX5 scanner pair admission |
| 58 | RSI bounds | `config/pattern-filter-profile.ts` | Pattern pool RSI limits | — | min=15, max=85 | Static | Hard-coded | NO | Pattern pool admission |
| 59 | Adjustment Registry bounds | `config/adjustment-registry.ts` :: `FILTER_BOUNDS` | Guardrails for all DB-adjustable filters | — | 15 param × (min, max, stepSize, cadenceDays) | Static | Hard-coded | NO | Validates filter changes |

#### 12. Exchange / Friction (3 levers)

| # | Lever | File | Design intent | Inputs | Outputs | Cadence | Authority | Adaptive | Downstream |
|---|---|---|---|---|---|---|---|---|---|
| 60 | Taker/maker fees | `config/exchange-defaults.ts` | Cost basis for all EV calculations | — | 0.26% / 0.16% | Static | Hard-coded | NO | Net EV, friction, DSE |
| 61 | Slippage + spread | `config/exchange-defaults.ts` | Execution cost assumptions | — | 0.05% / 0.10% | Static | Hard-coded | NO | Net EV, friction, DSE |
| 62 | BASE_FEE_SLIPPAGE | `config/system-guards.ts` | Guardrail fee floor | — | 0.6% | Static | Hard-coded | NO | pWin calculation |

#### 13. Hybrid / Multi-TF (4 levers)

| # | Lever | File | Design intent | Inputs | Outputs | Cadence | Authority | Adaptive | Downstream |
|---|---|---|---|---|---|---|---|---|---|
| 63 | Hybrid ensemble weights | `config/system-guards.ts` :: `HYBRID_PARAMS.WEIGHTS` | Balance QUANT vs PATTERN vs PREDICTIVE | — | Q=0.4, P=0.4, ML=0.2 | Static | Hard-coded | NO | hybridScore |
| 64 | Pattern decay (lambda/floor) | `config/system-guards.ts` :: `HYBRID_PARAMS.DECAY` | Temporal memory for pattern signals | — | λ=0.15, floor=0.3 | Static | Hard-coded | NO | Pattern signal aging |
| 65 | Multi-TF cascade criteria | `config/system-guards.ts` :: `TIMEFRAME_CONFIG` | When to drill from 1H→15m→5m | — | RW_MIN=0.5, PATTERN_MIN=0.6 | Static | Hard-coded | NO | Cascade activation |
| 66 | **Hybrid confluence buffer** | `services/hybrid-confluence-buffer.ts` | Match QUANT+PATTERN within time window | Max window=5 candles | Confluence match | Per-signal | Runtime-computed | YES | hybridScore |

#### 14. Scanner (3 levers)

| # | Lever | File | Design intent | Inputs | Outputs | Cadence | Authority | Adaptive | Downstream |
|---|---|---|---|---|---|---|---|---|---|
| 67 | Scan batch size | `config/system-guards.ts` :: `SCANNER_PARAMS` | Total pairs per scan | — | 300 | Static | Hard-coded | NO | FX5 scanner throughput |
| 68 | Dual-pool ratio | `config/system-guards.ts` :: `SCANNER_PARAMS.DUAL_POOL` | Ideal vs rotational exploration | — | 60/40 | Static | Hard-coded | NO | Pair selection |
| 69 | **Failure cooldown** | `config/system-guards.ts` :: `SCANNER_PARAMS.FAILURE_TRACKING` | Suppress recently-failed pairs | Failure count, timestamp | Cooldown [2min, 5min] | Per-scan | Runtime-computed (state) | YES | Pair re-admission |

---

### Authority Source Breakdown

| Authority | Count | % |
|---|---|---|
| Hard-coded in source | 45 | 65% |
| DB (`screener_filters`) | 6 | 9% |
| Runtime-computed (truly adaptive) | 18 | 26% |
| **Total** | **69** | 100% |

**65% of all levers are frozen in source code.** Only the runtime-computed levers (26%) adjust automatically. The remaining 9% are user-adjustable via DB but are still manually tuned, not adaptive.

### Cadence Breakdown

| Cadence | Count | What changes? |
|---|---|---|
| Per-tick | 2 | TEC trailing stop, break-even latch |
| Per-signal | 7 | FinalScore, RegimeWeight, Dynamic ROI, governance gate, DSE multiplier, rankingScore, hybrid confluence |
| Per-MCE-cycle | 3 | Pair regime label, DBS score, regime confidence |
| Per-scan | 3 | Stability classification, active mode, failure cooldown |
| Per-minute | 2 | PredictiveConfidence (60s cache), cost pressure factor |
| User-adjustable (DB) | 6 | Filter thresholds via screener UI |
| Static (code deploy only) | 46 | Everything else |
| **Total** | **69** | |

---

### Key Observations from Level 1

1. **The system has a thick static layer.** 46 of 69 levers require a code deploy to change. For a system designed to adapt to market conditions, this is a significant rigidity. The adaptive levers (18) are concentrated in a narrow band: regime classification, scoring, and sizing. Everything outside that band — thresholds, geometry, weights, bounds — is frozen.

2. **Authority fragmentation.** Tunable constants are scattered across 12+ source files with no centralized parameter service. `score-weights.config.ts`, `execution-config.ts`, `adaptive-thresholds.ts`, `system-guards.ts`, `pattern-filter-profile.ts`, and `strategy-governance.ts` each own pieces of the calibration surface with no shared discovery mechanism.

3. **The Adjustment Registry exists but is in log-only mode.** `adjustment-registry.ts` defines bounds and step sizes for filter parameters — exactly the kind of guardrail infrastructure needed for data-driven tuning — but `validationMode` is set to `'log-only'`, meaning violations are warned but never blocked. The registry covers IMF filter thresholds but not scoring weights, regime thresholds, or geometry parameters.

4. **rankingScore EXISTS in code but is NOT logged in trades.** `ranking-weights.ts` defines a complete formula (`computeRankingScore`) used for RTB queue ordering. It is computed per-signal but not written to the VTS trade record. This confirms the Item 18 finding — the ranking function exists, it's just invisible to post-hoc analysis.

5. **Regime classification thresholds (levers 2-7) are the highest-leverage static constants.** A 0.01 change in the vol threshold or a 0.05 change in the DBS threshold for TFS would reclassify thousands of pairs per day. These are frozen in source with no runtime override path.

---

## Level 2 — Input Coherence

### 2.1 Input Dependency Graph (DAG)

The 18 adaptive levers form 5 dependency chains with no cycles:

```
Chain 1 (Regime Pipeline — longest, 7 nodes):
  OHLC_data → DBS_score → pair_regime_label → regime_confidence
    → stability_classification → active_mode → governance_gate

Chain 2 (Scoring Pipeline):
  VTS_telemetry_winRate → PredictiveConfidence → FinalScore → rankingScore

Chain 3 (ROI Pipeline — branches from Chain 2):
  VTS_telemetry_winRate → PredictiveConfidence → dynamic_ROI_threshold

Chain 4 (RegimeWeight Pipeline — feeds into Chain 2):
  trendStrength → RegimeWeight_backfill → FinalScore → rankingScore

Chain 5 (Sizing Pipeline):
  cost_drift_monitor → cost_pressure_factor → DSE_multiplier
```

**Maximum chain depth:** 7 (Chain 1). A single OHLC data issue propagates through regime → stability → mode → governance in one cycle.

### 2.2 Shared-Input Clusters

10 inputs are consumed by more than one lever:

| Shared Input | Consumer Count | Consumers |
|---|---|---|
| **volatility** | 3 | regime_confidence, RegimeWeight_backfill, DSE_multiplier |
| **OHLC_data** | 2 | pair_regime_label, DBS_score |
| **DBS_score** | 2 | pair_regime_label, regime_confidence |
| **ATR** | 2 | DBS_score, trailing_stop_price |
| **stability_label** | 2 | active_mode, governance_gate |
| **PredictiveConfidence** | 2 | FinalScore, dynamic_ROI_threshold |
| **regime_label** | 2 | dynamic_ROI_threshold, adaptive_weights |
| **strategy** | 2 | governance_gate, adaptive_weights |
| **entry_price** | 2 | trailing_stop_price, breakeven_target_latch |
| **target_price** | 2 | trailing_stop_price, breakeven_target_latch |

**Volatility is the most widely shared input** — it feeds regime confidence, RegimeWeight backfill, AND DSE sizing. A volatility spike simultaneously changes the regime classification, inflates RegimeWeight (and therefore FinalScore), and contracts position sizes. These three effects are uncoordinated — each lever reacts independently to the same input without knowing the others have also reacted.

**PredictiveConfidence is the most dangerous shared input** — it feeds both FinalScore (as 30% of the composite via the confidence component) and the ROI gate (as the flex parameter for dynamic thresholds). When PredConf changes, it moves the quality score AND the profitability gate simultaneously but in potentially conflicting directions: higher PredConf raises FinalScore (easier to pass) while also raising the ROI threshold (harder to pass). This creates a partial self-cancellation that is not documented or intentional.

### 2.3 Feedback Loop Analysis

**No direct 2-node feedback loops exist.** The DAG is acyclic within a single scan cycle.

**However, there is a temporal feedback loop via VTS telemetry:**

```
Cycle N: VTS_telemetry → PredictiveConfidence → FinalScore → trade admitted → trade outcome
Cycle N+k: trade outcome → VTS_telemetry (winRate updated) → PredictiveConfidence changes
```

This is a **delayed feedback loop** with a time constant of hours to days (depending on how many trades accumulate before the win rate meaningfully shifts). It is the only feedback loop in the system. The loop is stabilizing in theory (good outcomes raise confidence → admit more → dilute quality → lower confidence) but the time constant is unknown and uncalibrated. If PredConf responds too quickly to a short streak, it could amplify short-term noise.

### 2.4 Snapshot-vs-Rolling Audit

Per B61 doctrine and CLAUDE.md §5 rule #13, rolling-window measurements are authoritative over snapshots. The audit classifies each adaptive lever's input freshness:

| Lever | Input Type | Rolling Window? | Governance Status |
|---|---|---|---|
| Pair regime label | OHLC lookback (30 candles = 7.5hr at 15min) | **YES** — rolling | ✅ Compliant |
| DBS score | OHLC lookback + EMA crossover | **YES** — rolling | ✅ Compliant |
| Regime confidence | Derived from vol/mom/ADX/DBS of current cycle | **SNAPSHOT** — single cycle | ⚠️ Single-cycle snapshot. Not rolling-averaged. |
| Stability classification | DriftScore + VolZ (snapshot), flipRate (7d rolling) | **MIXED** — 3 snapshot, 1 rolling | ⚠️ Mostly snapshot. DriftScore and VolZ are single-cycle values, not rolling averages. |
| PredictiveConfidence | VTS cumulative win rate | **CUMULATIVE** — all-time, not windowed | ⚠️ Neither snapshot nor rolling. Uses lifetime win rate. A recent regime shift won't surface in the confidence metric until enough new trades accumulate to move the average. Stale in regime transitions. |
| RegimeWeight backfill | trendStrength + volatility from latest MCE cycle | **SNAPSHOT** — single cycle | ⚠️ Point-in-time MCE values. No rolling average. |
| FinalScore | Composite of hybridScore (snapshot), PredConf (cumulative), RW (snapshot), decay (dead) | **MIXED** — all inputs are snapshots or cumulative | ⚠️ No rolling component. Entirely snapshot-driven. |
| DSE adaptive weights | DB-stored VTS telemetry | **CUMULATIVE** — DB values, refresh cadence unknown | ⚠️ Same staleness risk as PredConf. |
| Dynamic ROI threshold | Regime (snapshot) + PredConf (cumulative) | **MIXED** | ⚠️ Inherits staleness from both inputs. |
| Trailing stop price | DI + VolNoise + ATR (rolling) + high-water mark (rolling) | **YES** — rolling | ✅ Compliant |

**Summary:** Of 10 audited adaptive levers, only 3 use properly rolling inputs (pair regime, DBS, trailing stop). 7 use snapshots, cumulative averages, or mixed inputs. The snapshot-heavy levers are concentrated in the scoring pipeline (FinalScore, RegimeWeight, PredConf) — exactly the pipeline Item 18 found to be anti-predictive.

**Key governance violation candidate:** PredictiveConfidence uses all-time cumulative win rate rather than a rolling window. In a system where regimes shift on multi-hour timescales, a cumulative win rate that includes data from 7+ days ago is measuring a different market. This is the strongest snapshot-vs-rolling violation in the system.

---

## Level 3 — Calibration Check (10 High-Impact Levers)

### Methodology

Using the same 7-day VTS dataset as Item 18 (595 closed trades, 2026-04-15 through 2026-04-22). For each lever, compare designed behavior against observed behavior, assess sensitivity, and segment by regime/pool/DBS archetype.

### 3.1 PredictiveConfidence

**Designed behavior:** Sigmoid transform of VTS win rate per (regime, strategy). Higher win rate → higher confidence → higher FinalScore + stricter ROI gate.

**Observed behavior (595 trades, quartile split):**

| Quartile | Avg PredConf | N | WR% | Avg Net |
|---|---|---|---|---|
| Q1 (lowest) | 0.189 | 148 | **45.9%** | −0.0121 |
| Q2 | 0.308 | 148 | **47.3%** | −0.0082 |
| Q3 | 0.455 | 148 | 29.7% | −0.0153 |
| Q4 (highest) | 0.621 | 151 | 38.4% | −0.0039 |

**Verdict: MISCALIBRATED.** Q1-Q2 (low confidence) have better WR than Q3-Q4 (high confidence). The sigmoid transform is not producing a signal that correlates with outcomes. Q4 has the best average net profit (least negative) but the worst WR is Q3, not Q1. PredConf is noise with a slight anti-predictive tendency on WR. The cumulative-rather-than-rolling input is the likely root cause — the confidence reflects a market that no longer exists.

### 3.2 Regime Distribution

**Designed behavior:** 5 canonical regimes, roughly balanced distribution with TFS dominant in trending markets.

**Observed (7d closed trades):**

| Regime | Count | Share | WR% | Avg Net |
|---|---|---|---|---|
| TFS | 275 | 46.2% | 35.6% | −0.0084 |
| RBS | 132 | 22.2% | 56.8% | −0.0042 |
| ST | 93 | 15.6% | 37.6% | −0.0119 |
| IE | 55 | 9.2% | 34.5% | −0.0309 |
| HVU | 40 | 6.7% | 32.5% | −0.0048 |

**Global regime:** TFS = 90.6%, RBS = 3.7%, ST = 5.7%. Global regime is overwhelmingly TFS.

**Verdict:** TFS is the dominant regime at both pair and global level, confirming the B62 classifier shift. RBS is the only regime with positive WR tendency (56.8%). IE has the worst avg net (−0.031) — impulse trades are costly. The 90.6% global TFS concentration means mode overlays and governance gates are almost always operating in STABLE/NORMAL mode.

### 3.3 DBS Score Distribution

**Designed behavior:** DBS ∈ [-1, +1], categories from DOWN_STRONG through UP_STRONG.

**Observed:**
- Score range: −1.000 to +0.688, mean −0.027, median +0.019
- Categories: NEUTRAL 27.1%, DOWN_MODERATE 17.5%, UP_MODERATE 19.5%, DOWN_STRONG 9.7%, UP_STRONG 4.7%, DOWN_WEAK 10.3%, UP_WEAK 11.3%

**Verdict:** Distribution is roughly centered near zero with a slight negative skew (mean −0.027). NEUTRAL is the plurality category. DOWN_STRONG (9.7%) > UP_STRONG (4.7%) — more strongly bearish pairs than strongly bullish during this window. The DBS score range is asymmetric (−1.0 to +0.69), suggesting the formula may saturate on the negative side faster than positive. This is worth investigating in a future calibration.

### 3.4 ExpectedEdge vs Actual Net Profit

**Designed behavior:** expectedEdge should predict actual net profit direction and magnitude.

**Observed:**
- ExpectedEdge: mean 0.0228 (2.28%), always positive (min 0.0007)
- ActualNet: mean −0.0098 (−0.98%), frequently negative
- Pearson r = **−0.130**

**Verdict: ANTI-CORRELATED.** Higher expected edge predicts *worse* actual outcomes. The system is systematically overestimating the profitability of its signals. The expected edge is always positive (the system never predicts a losing trade, by design), but the average actual outcome is negative. The 2.28% average expected edge vs −0.98% average actual net is a 3.26pp gap. This is a calibration failure — the edge model is not accounting for real execution friction and adverse selection.

### 3.5 Friction Cost

**Designed behavior:** Friction cost should approximate real round-trip trading costs (fees + slippage + spread).

**Observed:** min 0.62%, max 1.62%, mean 0.71%

**Verdict:** Friction is tightly centered around 0.71%, which is close to the theoretical 2 × (0.26% fee + 0.05% slippage) + 0.10% spread = 0.72%. The friction model appears well-calibrated — this is one of the few levers that matches designed behavior.

### 3.6 Source Pool Performance

**Designed behavior:** Each pool targets different market conditions. quant-strong_trend (B63) should capture the strongest trend signals.

**Observed:**

| Pool | N | Share | WR% | Avg Net | Avg FS |
|---|---|---|---|---|---|
| pattern | 190 | 31.9% | 35.8% | −0.0151 | 0.616 |
| quant-trend | 179 | 30.1% | 33.0% | −0.0108 | 0.573 |
| quant-reversal | 171 | 28.7% | 47.4% | −0.0091 | 0.482 |
| quant-strong_trend | 53 | 8.9% | **58.5%** | **+0.0093** | 0.686 |
| quant-breakout | 1 | 0.2% | 100% | +0.0065 | 0.607 |
| quant-oscillator | 1 | 0.2% | 0% | −0.0017 | 0.592 |

**Verdict:** quant-strong_trend is the only profitable pool, validating B63. quant-reversal has the second-best WR (47.4%) but is still net-negative — the RR geometry is working against it (same finding as Item 18's range_trade observation). pattern pool has the worst net despite mid-range FinalScores. The pattern pool's elevated FinalScore floor (0.45) is not providing quality discrimination — it's just shifting the admitted distribution upward without improving outcomes.

### 3.7 DecayPenalty

**Designed behavior:** Penalize stale signals that have aged since generation.

**Observed:** Always exactly zero across all 595 trades.

**Verdict: DEAD LEVER.** The decay penalty component occupies 10% of the FinalScore formula (`- decayPenalty * 0.1`) but contributes zero information. Either signals never age (they are consumed immediately) or the decay calculation is not being invoked. This is a wasted formula slot.

### 3.8 RegimeWeight Backfill (cross-reference Item 18)

**Designed behavior:** `trendStrength*0.7 + (1-volatility)*0.3`, rewarding trending low-vol conditions.

**Observed:** (from Item 18 Part B)
- RBS average RW = 0.47 (lowest, despite RBS having best WR)
- TFS average RW = 0.73 (highest, despite TFS having below-average WR)
- RW > 0.9 outliers: 64% stop-loss

**Verdict: INVERTED** (confirmed in Item 18). The formula systematically rewards the regime where strategies perform worst and penalizes the regime where they perform best.

### 3.9 Global Regime Concentration

**Designed behavior:** Global regime provides market-wide context, should vary with conditions.

**Observed:** TFS = 90.6% of all trades. RBS = 3.7%. ST = 5.7%.

**Verdict:** The global regime is nearly constant at TFS during this 7-day window. This means:
- Mode overlays are almost always NORMAL (not DEFENSIVE or SURVIVAL)
- Governance gates are almost always STABLE (not TRANSITION or UNSTABLE)
- Context bonus in rankingScore is almost always +0.06 (pair-global agreement on TFS)

The mode overlay system and governance gates are effectively inactive — they exist in code but the regime concentration means they rarely activate. This is not necessarily a bug (if the market genuinely is in a stable trend), but it means these levers are untested under stress.

### 3.10 PredConf Self-Cancellation in SQE

**Designed behavior:** PredConf feeds FinalScore (higher → easier to pass gate) AND ROI gate (higher → stricter threshold).

**Observed consequence:** The dual consumption creates a partial self-cancellation. When PredConf rises:
- FinalScore increases (confidence × 0.3 goes up) → signal is more likely to pass the FinalScore gate
- ROI threshold increases (getDynamicROIThreshold returns a higher floor) → signal is more likely to fail the ROI gate

The net effect depends on which gate is binding. In VTS mode where the FinalScore gate is a near-no-op (1.8% rejection), the ROI gate is the only active filter, so higher PredConf actually makes it HARDER to pass. This partially explains the Q3 WR dip (29.7%) — trades in the mid-high confidence range face a stricter ROI gate without a compensating quality improvement.

**Verdict: DESIGN FLAW.** The same input should not simultaneously relax one gate and tighten another unless the interaction is explicitly designed and documented. It is neither.

---

## Part E — Modularization Lens

### E.1 Natural module clusters from the DAG

The 5 dependency chains map naturally to 5 modules:

| Module | Levers | Chain | Cadence band |
|---|---|---|---|
| **Regime Engine** | Pair regime, DBS, regime confidence, stability classification | Chain 1 (nodes 1-4) | Per-MCE-cycle (seconds) |
| **Mode/Governance** | Active mode, governance gate, strategy dependencies, INFLUENCE_RULES | Chain 1 (nodes 5-7) | Per-scan (seconds, follows regime) |
| **Scoring Kernel** | FinalScore, RegimeWeight, PredConf, decayPenalty, hybridScore | Chains 2+4 | Per-signal (sub-second) |
| **Profitability Gate** | Dynamic ROI, friction, Net EV, expected edge | Chain 3 | Per-signal (sub-second) |
| **Sizing/Execution** | DSE multiplier, cost pressure, adaptive weights, TEC trailing stop, mode overlay application | Chain 5 + TEC | Per-trade / per-tick |

The Ranking module (rankingScore) sits between Scoring Kernel and Sizing/Execution — it consumes scoring output and feeds RTB queue ordering.

### E.2 Cadence-based module boundaries

The cadence breakdown reveals three natural tiers that should be separate modules:

| Tier | Cadence | Module(s) | Update frequency |
|---|---|---|---|
| **Tier A — Market State** | Per-MCE-cycle | Regime Engine | Every 15 min (MCE cycle) |
| **Tier B — Signal Evaluation** | Per-signal | Scoring + Profitability + Ranking | Every signal (~seconds) |
| **Tier C — Execution** | Per-trade / per-tick | Sizing + TEC | At trade entry / continuously |

Tier A produces context that Tier B consumes. Tier B produces scored/ranked signals that Tier C executes. Clean interface boundaries exist between these tiers.

### E.3 Independence analysis

Of the 14 lever categories:
- **4 are fully independent:** Exchange/friction, filter thresholds (IMF), scanner params, pattern pool guardrails. These can be modularized without touching anything else.
- **3 are loosely coupled:** Mode overlays (coupled only via stability_label), governance gate (coupled only via stability + strategy), TEC (coupled only via DI/VolNoise/ATR).
- **7 are tightly coupled:** Everything in the scoring + regime + profitability chains. These share volatility, PredConf, regime_label, and DBS_score across multiple consumers.

### E.4 Hard-coded-to-DB promotion list

Consolidating with Item 18's list and adding new levers:

**P0 — Blocking for B66 formula recalibration (from Item 18):**
1-6. SCORE_WEIGHTS (4) + RegimeWeight coefficients (2) — already listed in Item 18 §E.6

**P1 — Blocking for regime classifier tuning:**
7. Vol threshold for RBS (0.012)
8. ADX threshold for RBS (45)
9. DBS threshold for RBS (0.10)
10. DBS threshold for TFS (0.30)
11. DBS threshold for IE (0.50)
12. Momentum threshold for TFS (0.003)

**P2 — Blocking for execution calibration:**
13. DSE_CONFIG constants (10 values — MIN/MAX_MULTIPLIER, sensitivities, floors)
14. EXECUTION_CONFIG trailing stop params (5 values)
15. Mode overlay multipliers (15 values across 3 modes)

**P3 — Important but not blocking:**
16. Stability thresholds (8 values across 4 metrics × 2 boundaries)
17. Ranking weight profiles (12 values across 3 families)
18. ROI gate parameters (4 values)
19. PredConf sigmoid parameters (2 values)
20. Hybrid params (weights, decay, confluence window)

Total: **~65 constants** across 20 promotion items that should move from hard-coded source to DB or config service.

### E.5 Recommendation

**The adaptive framework is a strong modularization candidate** with one important caveat: the tightly-coupled scoring chain (FinalScore ↔ RegimeWeight ↔ PredConf) should be treated as a single module, not split.

Three arguments:

1. **The DAG is already modular — the code is not.** The 5 dependency chains have clean boundaries with well-defined interfaces (regime → stability → mode → governance; VTS telemetry → scoring → ranking). But the code spreads these across 12+ files with no shared parameter service, no per-module telemetry, and no ability to A/B test one module's parameters without deploying the entire system.

2. **65 hard-coded constants prevent calibration.** The Item 18 audit found the scoring formula is anti-predictive. The Level 3 calibration check found expectedEdge is anti-correlated with actual profit. PredConf is stale. RegimeWeight is inverted. Fixing any of these requires editing source, committing, building, and restarting PM2. A config service or DB-backed parameter store would enable rapid iteration.

3. **The snapshot-vs-rolling violation in the scoring pipeline is a modularization forcing function.** PredConf uses cumulative win rate. RegimeWeight uses single-cycle trendStrength. FinalScore composites these snapshots. Fixing these to use rolling windows requires architectural changes to how inputs are computed and cached — exactly the kind of work that modularization enables by decoupling the input refresh cadence from the consumption cadence.

**Proposed module partition (extends Item 18's 5-module SQE partition to the full framework):**

| Module | Scope | Interface | Config surface |
|---|---|---|---|
| Regime Engine | Classifier + DBS + stability | `getRegimeContext(ohlc, atr): {regime, dbs, stability, confidence}` | 12 thresholds (P1) |
| Mode Policy | Mode overlay + governance gate | `getModePolicy(stability, strategy): {mode, eligible, multipliers}` | 15 multipliers + 21 dependencies + 9 influence rules |
| Scoring Kernel | FinalScore + RW + PredConf + decay | `computeSignalScore(signal, regime): {finalScore, components}` | 6 weights (P0) + 5 params |
| Profitability Gate | ROI + Net EV + friction | `isProfitable(signal, regime, confidence): bool` | 4 ROI params + 5 exchange constants |
| Ranking | rankingScore + RTB ordering | `rank(signals[]): ranked[]` | 12 weights + 5 constants |
| Sizing | DSE + mode application | `computeSize(signal, regime, mode): {size, multiplier}` | 10 DSE params + MAX_POSITION_RISK |
| Execution | TEC trailing stop + latch logic | `updateTrailingStop(position, price): {newStop, mode}` | 5 TEC params |

---

## Appendix — Additional Data from Level 3 Calibration

### Pearson Correlations (vs net profit)

| Variable | r | Interpretation |
|---|---|---|
| FinalScore | −0.017 | Noise (from Item 18) |
| hybridScore | −0.069 | Weakly anti-predictive |
| predictiveConfidence | +0.071 | Weakly positive (but WR-inverted) |
| regimeWeight | −0.035 | Weakly anti-predictive |
| expectedEdge | **−0.130** | Anti-correlated — strongest negative signal |
| frictionCost | (tight range, no meaningful correlation) | Well-calibrated |

### PredConf Self-Cancellation Mechanism

PredConf simultaneously:
- Raises FinalScore (confidence × 0.3) → easier to pass FinalScore gate
- Raises ROI threshold (getDynamicROIThreshold) → harder to pass ROI gate

In VTS mode where FinalScore gate is non-binding (1.8% rejection), the net effect of higher PredConf is STRICTER admission — the opposite of the designed intent. This is undocumented and unintentional.

### DecayPenalty Status

All 595 trades: decayPenalty = 0.000. The lever is dead. It occupies 10% of the FinalScore formula but contributes nothing. Either signals are consumed instantly (no decay possible) or the decay computation is not being invoked on VTS signals.

## Appendix — Data Sources

### Source files read

| File | Category | Key levers found |
|---|---|---|
| `config/score-weights.config.ts` | Scoring | FinalScore weights (4) |
| `config/adaptive-thresholds.ts` | ROI gate | ROI flex, bounds, friction buffer (4) |
| `config/adjustment-registry.ts` | Governance | Filter bounds (15 params), validation mode |
| `config/execution-config.ts` | TEC/sizing | Trailing stop params, MAX_POSITION_RISK (8) |
| `config/strategy-governance.ts` | Governance | Strategy dependencies (21), INFLUENCE_RULES (9) |
| `config/pattern-filter-profile.ts` | Filters/SQE | Pattern guardrails (3), RSI bounds (2) |
| `config/canonical-regime-strategy-map.ts` | Mapping | riskMultiplier (5), minConfidence (5), strategy families |
| `config/exchange-defaults.ts` | Friction | Fee/slippage/spread (5) |
| `config/ranking-weights.ts` | Ranking | Weight profiles (3×4), normalization, context bonus |
| `config/system-guards.ts` | Multi-domain | Hybrid params, TF config, scanner params, filter flags |
| `core/filters/signal_quality_evaluator.ts` | SQE | Gates, thresholds, evaluation pipeline |
| `core/utils/score-calculator.ts` | Scoring | FinalScore formula, RW backfill, PredConf sigmoid |
| `core/metrics/market-regime.ts` | Regime | Classifier thresholds, DBS integration |
| `core/metrics/directional-bias.ts` | DBS | DBS formula, component weights |
| `core/governance/strategy-modes.ts` | Mode | 3 mode overlays × 5 multipliers |
| `core/governance/regime-stability.ts` | Stability | 4 metric thresholds × 2 boundaries |
| `core/risk/dynamic-sizing-engine.ts` | Sizing | DSE config (10 params), cost pressure |
| `services/trailing-exit-controller.ts` | TEC | Trailing stop, break-even/target latch |
| `core/calculations/expectancy.ts` | Profitability | ROI gate, Net EV gate |
