# Phase 6: ML Pipeline, Learning & Calibration

> **Version**: 1.1 (Phase 6 Addendum applied)
> **Date**: 2026-02-16
> **Author**: Claude Code (System Cartographer & Lead Architect)
> **Scope**: Virtual Trading Simulator (VTS), ML calibration loop, calibration utilities, reward evaluation, drift detection, continuous learning engine, learning coordination, telemetry aggregation, regime archival, retraining freeze, learning governance
> **Status**: Paper Mode + Passive Learning (CURRENT STATE)
> **Authoritative Path**: VTS Runner → VTS Service → ML Calibration → Telemetry Aggregator → Adaptive Learning Repository
> **Core Architectural Problem (Kyle, Phase 6 Addendum)**: Multi-strategy simulation is implemented (Directive 11.8C), but strategy-specific signal logic is NOT. All strategies use identical generic scoring math. Per-strategy learning is therefore statistically diluted — strategy differentiation is currently artificial.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [VTS Runner — The Autonomous Simulation Engine](#2-vts-runner--the-autonomous-simulation-engine)
3. [VTS Service — Trade Simulation & Calibration Trigger](#3-vts-service--trade-simulation--calibration-trigger)
4. [ML Calibration Service — Phase-10 Training Loop](#4-ml-calibration-service--phase-10-training-loop)
5. [Calibration Utilities — Linear Regression Engine](#5-calibration-utilities--linear-regression-engine)
6. [ML Service Client — Python Microservice Bridge](#6-ml-service-client--python-microservice-bridge)
7. [Reward Evaluator — Per-Strategy Per-Regime Rewards](#7-reward-evaluator--per-strategy-per-regime-rewards)
8. [Drift Detector — Calibration Parameter Monitoring](#8-drift-detector--calibration-parameter-monitoring)
9. [Retraining Freeze Controller — Model Shock Prevention](#9-retraining-freeze-controller--model-shock-prevention)
10. [Telemetry Aggregator — Performance Data Collection](#10-telemetry-aggregator--performance-data-collection)
11. [Adaptive Learning Repository — SQL-Backed Weight Persistence](#11-adaptive-learning-repository--sql-backed-weight-persistence)
12. [Regime Archiver — Long-Term Metric Preservation](#12-regime-archiver--long-term-metric-preservation)
13. [Learning Cooldown — Regime-Aware Update Gating](#13-learning-cooldown--regime-aware-update-gating)
14. [Adjustment Stability — Observability Instrumentation](#14-adjustment-stability--observability-instrumentation)
15. [Continuous Learning Engine — LEGACY](#15-continuous-learning-engine--legacy)
16. [Learning Cycle Service — LEGACY](#16-learning-cycle-service--legacy)
17. [Learning Coordinator — LEGACY](#17-learning-coordinator--legacy)
18. [Learning Bridge — LEGACY](#18-learning-bridge--legacy)
19. [Learning Gate Validator — LEGACY](#19-learning-gate-validator--legacy)
20. [Mathematical Validation: VTS Reward & Calibration](#20-mathematical-validation-vts-reward--calibration)
21. [Data Flow: VTS → ML Pipeline → Parameter Adjustment](#21-data-flow-vts--ml-pipeline--parameter-adjustment)
22. [Critical Findings](#22-critical-findings)
23. [File Catalog](#23-file-catalog)
24. [Kyle's Phase 6 Architectural Confirmations](#24-kyles-phase-6-architectural-confirmations)
25. [Revision History](#25-revision-history)

---

## 1. Architecture Overview

The ML Pipeline, Learning & Calibration layer is the **feedback loop** that enables DawnTrader to improve over time. Its primary function is:

1. **Simulate** virtual trades using real market data (VTS Runner)
2. **Record** outcomes with full Phase-10 metric coverage (VTS Service + Telemetry Aggregator)
3. **Calibrate** profit prediction models from outcomes (ML Calibration + Calibration Utils)
4. **Evaluate** strategy-regime reward performance (Reward Evaluator)
5. **Detect** parameter drift and trigger recalibration (Drift Detector)
6. **Archive** regime-level metrics for long-term seeding (Regime Archiver)
7. **Gate** learning updates based on regime stability (Learning Cooldown)

### System State Context

DawnTrader is currently in **Paper Mode + Passive Learning**. This means:
- The VTS Runner is the **only active execution component** generating data
- No real trades are placed; all outcomes are virtual
- The ML pipeline consumes VTS-generated data exclusively
- Learning is **passive** — parameters are adjusted but no live trades are affected

### Core Architectural Problem: Artificial Strategy Differentiation

> **Kyle (Phase 6 Addendum)**: "Strategy differentiation is currently artificial. That is the core architectural problem in Phase 6."

Although the VTS Runner implements multi-strategy simulation (Directive 11.8C) — iterating over ALL strategies compatible with a pair's regime — the underlying signal generation logic in `generatePhase10Signal()` is **identical for all strategies**. Specifically:

| Component | Implementation | Strategy-Specific? |
|-----------|---------------|-------------------|
| HybridScore | `simulateHybridScore(regime)` — regime lookup + random noise | ❌ NO |
| PredictiveConfidence | `hybridScore * 0.8 + 0.1 + noise` | ❌ NO |
| DecayPenalty | `Math.random() * 0.15` | ❌ NO |
| FinalScore | `hybridScore * w1 + predictiveConfidence * w2 + regimeWeight * w3 - decayPenalty * w4` | ❌ NO |
| Stop/Target | `max(config, volatility * multiplier)` | ❌ NO |
| Entry Logic | Current market price | ❌ NO |
| Confidence Model | Derived from simulated hybridScore | ❌ NO |

**Consequence**: The system simulates N strategies per pair, but all N strategies produce signals from the same generic math. Only randomness and metadata labels differ. This means:
- **Per-strategy calibration is statistically diluted** — calibration learns noise, not structural edge
- **Strategy comparisons are partially artificial** — "Breakout" vs "Mean Reversion" produce effectively identical signals
- **ML magnitude adjustments are noisy** — performance multipliers modulate based on random variation
- **True structural edge cannot emerge** — the pipeline cannot discover which strategies genuinely outperform because no strategy has unique signal logic

**Required Correction**: Each strategy must have unique entry logic, unique stop/target logic, unique confidence modeling, and unique feature-derived scoring. Without this, multi-strategy simulation is architectural infrastructure waiting for real strategy engines.

### Two-Layer Learning Architecture

The audit reveals **two distinct learning ecosystems** that operate independently:

| Layer | Purpose | Status | Data Source |
|-------|---------|--------|-------------|
| **VTS/ML Pipeline** (Canonical) | Calibrate profit predictions, evaluate strategies, detect drift | **ACTIVE** | VTS virtual trades, real Kraken prices |
| **Walter-Era Learning** (Legacy) | Cognitive weights, agent feedback, cluster learning deltas | **CONFIRMED LEGACY** (Kyle, Phase 6 Addendum) | Walter/Bob agent interactions, experience memory |

The **VTS/ML Pipeline** is the canonical learning system. It operates within the authoritative execution path and directly affects trading parameters.

The **Walter-Era Learning** system (ContinuousLearningEngine, LearningCoordinator, LearningBridge, LearningCycleService, LearningGateValidator) was built for the Walter/Bob AI ecosystem and manages "cognitive weights" (reasoning, exploration, exploitation, riskAversion, adaptability). These are **not connected to the canonical trading pipeline** — they track agent behavioral tendencies, not trading strategy parameters.

> **CONFIRMED LEGACY (Kyle, Phase 6 Addendum)**: The Walter-Era Learning subsystem operates independently of the canonical trading pipeline, maintains its own classification logic (CognitiveWeights), and supervises without affecting trade execution. Kyle confirmed these are "legacy autonomy-era artifacts" and recommended marking for removal in cleanup wave.

---

## 2. VTS Runner — The Autonomous Simulation Engine

**File**: `server/services/vts-runner.ts` (~1,400 lines)
**Directive**: 11.0E.1 (Upgraded from 8.8.4-M5C)
**Status**: 🔒 LOCKED MODULE — Active, Primary

### Purpose

The VTS Runner is the autonomous virtual trading simulator. During Passive Learning mode, it runs a **60-second simulation loop** that:
1. Fetches 100 pairs from the FX5 Scanner Ideal Pool
2. Calculates per-pair market regimes from OHLC data
3. Generates virtual trade signals using Phase-10 canonical math
4. Opens virtual trades and tracks them against **real Kraken prices**
5. Closes trades when stop/target/timeout is hit
6. Persists outcomes to telemetry and ML pipeline

### Simulation Cycle Flow

```
startAutonomousSimulation()
  └─ setInterval(runPhase10SimulationCycle, 60s)
       ├─ resolveOpenVirtualTrades()     ← Close trades hit by real prices
       ├─ getIdealPoolPairs()            ← FX5 Scanner → up to 100 pairs
       ├─ For each pair:
       │    ├─ fetchOHLCForPair()        ← Kraken 15m candles (50 max)
       │    ├─ calculatePairRegime()     ← Per-pair regime classification
       │    ├─ getStrategiesForRegime()  ← All compatible strategies (11.8C)
       │    └─ For each strategy:
       │         └─ generatePhase10Signal()
       │              ├─ Governance filter (11.7R-E)
       │              ├─ Strategy mode modulation (11.7S)
       │              ├─ Net EV gate (11.8B-A2)
       │              ├─ ROI pre-filter (11.7C)
       │              ├─ ADX guard (SMA strategies)
       │              ├─ Duplicate position guard (11.8C)
       │              ├─ Position sizing + mode overlay
       │              └─ Create OpenVirtualTrade
       └─ Record telemetry for all generated signals
```

### Key Design Decisions

**Multi-Strategy Simulation (Directive 11.8C)**: The VTS simulates ALL strategies compatible with a pair's regime, not just one "best" strategy. This generates N trades per pair where N equals the regime-compatible strategy count. Each trade has an `executionContext` of either `'VTS'` (single) or `'VTS_MULTI'` (multi-strategy).

**Real-Price Resolution (Directive 11.6)**: Trades are NOT resolved with random simulation. The VTS opens trades at real entry prices and resolves them against real Kraken prices via the price cache's `vtsSimulation` bucket. This replaced the legacy random simulation path (deprecated by 11.6D).

**Pre-Score Governance (Directive 11.7R-E)**: Before any scoring, strategies are checked against regime stability. If a strategy's dependency (trend, volatility, stability) is blocked in the current regime stability state, the signal is never scored, never ranked, and never generates a trade.

**Strategy Mode Modulation (Directive 11.7S)**: After governance, the strategy mode is resolved (AGGRESSIVE, STANDARD, CONSERVATIVE) based on global regime stability. The mode overlay adjusts position size, stop-loss distance, and take-profit distance via multipliers.

### Configuration

```typescript
DEFAULT_CONFIG = {
  autonomousMode: true,
  simulationIntervalSec: 60,      // 60-second cycle
  pairsPerCycle: 100,              // Up to 100 pairs from Ideal Pool
  strategies: [...],               // 8 strategies (legacy fallback)
  targetProfit: 0.015,             // 1.5% target
  stopLoss: 0.008,                 // 0.8% stop
  minVolume24h: 50000,
  minPrice: 0.5
};

MAX_OPEN_TRADES = 300;             // Directive 11.6E: Kraken API rate limit cap
MAX_HOLD_MS = 24 * 60 * 60 * 1000; // 24-hour max hold time
```

### Critical Observations

1. **HybridScore is simulated, not computed**: `simulateHybridScore()` generates a random regime-adjusted score (base ± random * 0.2). This is **BUG-001** from the pre-audit — VTS learns from statistically meaningless hybridScore data.

2. **PredictiveConfidence is simulated**: `simulatePredictiveConfidence()` derives from the simulated hybridScore (base * 0.8 + 0.1 ± random * 0.15). Same data quality issue as hybridScore.

3. **DecayPenalty is random**: `simulateDecayPenalty()` returns `Math.random() * 0.15`. No relationship to actual signal age or staleness.

4. **FinalScore uses real weights but simulated inputs**: The `computeFinalScore()` correctly applies `SCORE_WEIGHTS.FINAL_SCORE` weights, but since hybridScore and predictiveConfidence are simulated, the finalScore is meaningless for strategy comparison.

5. **Net EV Gate uses real math**: The `computeNetExpectancyKernel()` gate is canonical — identical to DSS and Paper Execution. However, it receives `DI = predictiveConfidence * 100`, and since predictiveConfidence is simulated, the DI is also simulated.

> **FINDING**: The VTS Runner's signal generation pipeline uses **real price data, real regime classification, real governance, and real Net EV math**, but feeds them **simulated scoring inputs** (hybridScore, predictiveConfidence, decayPenalty). This creates a paradox where sophisticated governance gates filter signals based on noise. The trade outcomes (entry/exit via real prices) are valid, but the scoring metadata attached to those outcomes is meaningless for calibration purposes.

---

## 3. VTS Service — Trade Simulation & Calibration Trigger

**File**: `server/services/vts-service.ts` (~500+ lines)
**Directive**: 10.0.A (Upgraded from 8.8.4-L8)
**Status**: 🔒 LOCKED MODULE — Active, Supporting

### Purpose

The VTS Service provides:
1. **VirtualSignal / VirtualTrade** type definitions (Phase-10 schema v1.6.7)
2. **Trade storage** — in-memory map of virtual trades + closed trades array
3. **Calibration interface** — `runCalibration()` for per-strategy calibration
4. **ML Calibration trigger** — fires every 10 HYBRID trades (Directive 10.6)
5. **Session metrics** — rolling averages for Phase-10 metrics

### Deprecated Methods

| Method | Reason | Replacement |
|--------|--------|-------------|
| `createVirtualTrade()` | Directive 11.6D — legacy random simulation | `openVirtualTrades` in vts-runner.ts |
| `closeTrade()` | Directive 11.6D — legacy random exits | `resolveOpenVirtualTrades()` in vts-runner.ts |

### VirtualSignal Schema (Phase-10, M50 Compliant)

```typescript
interface VirtualSignal {
  id: string;
  symbol: string;
  entryPrice: number; takeProfit: number; stopLoss: number;
  spread: number; predictedProfit: number;
  strategy: string;
  signalType: 'QUANT' | 'PATTERN' | 'HYBRID';
  patternType?: string | null;
  // Phase-10 canonical fields
  finalScore: number; hybridScore: number;
  predictiveConfidence: number; regimeWeight: number;
  decayPenalty: number; expectedEdge: number;
  frictionCost: number;
  regime: string; regimeScore?: number;
  pool: 'ideal' | 'rotational';
  source: 'simulation' | 'live';
}
```

### Calibration Trigger Flow

```
Trade closed → closedTrades.push(trade)
  └─ if (calibrationCounter++ % 10 === 0)
       └─ triggerMLCalibration()     ← fire-and-forget
            └─ MLCalibrationService.analyzePerformance()
                 └─ MLCalibrationService.logRecommendations()
```

### Trade Duration

All VTS trades have a **3-hour trade window** (`TRADE_DURATION = 3 * 60 * 60 * 1000`). This is the legacy VTS Service window. However, the VTS Runner uses a **24-hour max hold** (`MAX_HOLD_MS`). The VTS Service's 3-hour window applies to the legacy random simulation pathway (deprecated).

---

## 4. ML Calibration Service — Phase-10 Training Loop

**File**: `server/services/ml-calibration.ts` (~232 lines)
**Directive**: 11.0E.2
**Status**: 🔒 LOCKED — Active

### Purpose

Analyzes VTS trade outcomes using Phase-10 metrics and generates learning recommendations for strategy weighting.

### Performance Score Formula

```
PerformanceScore = (finalScore × 0.5) + (predictiveConfidence × 0.3) + (regimeWeight × 0.2)
```

### Analysis Pipeline

1. Retrieve recent `windowSize` trades (default: 50) of signal type HYBRID
2. Group by pattern/strategy
3. For each group:
   - Compute win rate, expectancy, avg finalScore, avg edge delta
   - Compute `performanceScore` using the Phase-10 formula above
   - Derive `performanceMultiplier = clamp(performanceScore, 0.5, 1.5)`
   - If win rate > 55%: **INCREASE** weight by `0.05 × performanceMultiplier`
   - If win rate < 45%: **DECREASE** weight by `0.05 × performanceMultiplier`
   - Otherwise: **HOLD**

### Edge Delta Tracking

```
edgeDelta = expectedEdge - realizedPnL
```

This measures how well the expected edge prediction tracked actual outcomes. A positive delta means the system overestimated; negative means underestimated.

### Critical Observation

The ML Calibration Service consumes the **simulated** metrics from VTS (see Section 2 findings). Since `finalScore`, `predictiveConfidence`, and `regimeWeight` are based on simulated inputs, the `performanceScore` and `performanceMultiplier` are also derived from noise. The **win rate** and **expectancy** are valid (based on real price outcomes), but the performance-weighted adjustment magnitude is meaningless.

> **FINDING**: The calibration adjustment magnitude (±0.05 × performanceMultiplier) is modulated by simulated data, but the directional recommendation (INCREASE/DECREASE/HOLD) is based on real win rate data. The recommendations are directionally valid but their magnitude is noise-modulated.

---

## 5. Calibration Utilities — Linear Regression Engine

**File**: `server/utils/calibration.ts` (~324 lines)
**Directive**: 8.8.4-L8
**Status**: 🔒 LOCKED MODULE — Active

### Purpose

Performs linear regression to learn calibration coefficients that map predicted profits to actual realized profits.

### Core Formula

```
calibrated_profit = αₛ + βₛ × predicted_profit
```

Where:
- `αₛ` = intercept (clamped to [-0.01, 0.01])
- `βₛ` = slope (clamped to [0.05, 0.5])
- Per-strategy coefficients when sample count ≥ 10, otherwise global fallback

### Default Coefficients

```typescript
{ alpha: 0.0018, beta: 0.19, rSquared: 0, sampleCount: 0 }
```

### Linear Fit Implementation

Standard OLS (Ordinary Least Squares) regression with:
- Minimum 10 samples required
- R² computation (coefficient of determination)
- Standard error computation
- Coefficient clamping for stability
- Anomaly detection: warns when `|β - 1| > 0.3` or `stdError > 0.05`

### Persistence

- **File**: `logs/vts_calibration.json` — current global + per-strategy calibration
- **History**: `logs/vts_calibration_history/{date}.json` — daily snapshots

### Per-Strategy Calibration (L8 Enhancement)

`calibrateFromTradesPerStrategy()` runs linear fit separately for each strategy, producing independent α/β/r²/stdError coefficients per strategy plus a global set from all trades combined.

---

## 6. ML Service Client — Python Microservice Bridge

**File**: `server/services/ml-service-client.ts` (~245 lines)
**Directive**: 8.8.4-L3
**Status**: Active (but depends on external Python service availability)

### Purpose

Async client for the Python ML microservice (`services/ml_service.py`, ~73KB). Provides:
- `predictPromotion()` — probability of trade promotion
- `predictProfit()` — predicted profit value
- `getMLServiceStatus()` — health check
- `blendConfidence()` — NGC/promotion blending

### Integration Points

- **Host**: `ML_SERVICE_HOST` env var, default `http://localhost:5001`
- **Timeout**: 2 seconds per request
- **Cache**: In-memory with 30-second TTL, 500-entry max
- **Boot dependency**: Checks `bootOrchestrator.isMLReady()` — returns fallback if not ready

### Fallback Values

When ML service is unavailable:
- Promotion probability: `0.5` (neutral)
- Predicted profit: `0.05` (default)

### Legacy Fields in PredictionInput

```typescript
interface PredictionInput {
  symbol: string; strategy: string;
  ngc: number;     // ← Legacy field (NGC removed in Phase 10)
  cwqi: number;    // ← Legacy field (CWQI removed in Phase 10)
  riskRatio: number; profitTarget: number;
  signalAge?: number; entry: number; exit: number; stop: number;
}
```

> **FINDING**: The ML Service Client's `PredictionInput` interface still references `ngc` and `cwqi` — both of which were removed in Phase 10. This interface is out of date with the Phase-10 canonical metrics (finalScore, hybridScore, predictiveConfidence, regimeWeight).

---

## 7. Reward Evaluator — Per-Strategy Per-Regime Rewards

**File**: `server/services/reward-evaluator.ts` (~274 lines)
**Directive**: 8.8.4-L14
**Status**: 🔒 LOCKED MODULE — Active

### Purpose

Computes per-strategy, per-regime cumulative rewards using a weighted formula.

### Reward Formula

```
R_{s,r} = α₁ × profit_rate + α₂ × win_rate − α₃ × drawdown
```

Where:
- `α₁ = 0.6` (profit rate weight)
- `α₂ = 0.3` (win rate weight)
- `α₃ = 0.1` (drawdown penalty weight)

### Operation

- **Evaluation interval**: Every 30 minutes
- **Trade history**: Rolling window of last 1,000 trades per strategy-regime pair
- **Drawdown**: Peak-to-current equity drawdown per strategy-regime pair
- **Persistence**: `logs/rewards/reward_history.json`

### Key Methods

| Method | Description |
|--------|-------------|
| `recordTrade(trade)` | Record a trade result for a strategy-regime pair |
| `getReward(strategy, regime)` | Get current reward for a strategy-regime combination |
| `getAllRewards()` | Get all strategy-regime reward values |
| `evaluateAll()` | Recompute all rewards (runs on 30-min interval) |

### Consumer

The Reward Evaluator is imported by the VTS Service (`getRewardEvaluator()`) but the audit found **no evidence of the reward values being fed back into the scoring pipeline**. The rewards are computed and persisted but not consumed by signal generation or trade selection.

> **FINDING**: The Reward Evaluator computes strategy-regime rewards but these values do not appear to be consumed by any downstream scoring or selection logic. The reward data is observability-only in the current architecture.

---

## 8. Drift Detector — Calibration Parameter Monitoring

**File**: `server/services/drift-detector.ts` (~400+ lines)
**Directive**: 8.8.4-L11
**Status**: 🔒 LOCKED MODULE — Active

### Purpose

Monitors calibration parameters (α, β, σ) for drift and triggers auto-recalibration when thresholds are exceeded.

### Drift Score Formula

```
DriftScore = w₁|βₛ - βₛ₋₁| + w₂|αₛ - αₛ₋₁| + w₃(σₛ / σ_baseline)
```

Where:
- `w₁ = 0.6` (beta weight — slope drift is most important)
- `w₂ = 0.2` (alpha weight — intercept drift)
- `w₃ = 0.2` (sigma weight — error growth)

### Thresholds

| Threshold | DriftScore | Action |
|-----------|-----------|--------|
| Warning | > 0.15 | Flag as drifting, emit `drift_warning` |
| Recalibration | > 0.25 | Trigger auto-recalibration, emit `drift_recalibrate` |

### Operation

- **Check interval**: Every 15 minutes
- **History depth**: Last 10 snapshots per strategy
- **Persistence**: `logs/drift_history/`, `logs/drift_events/`
- **Integration**: Checks retraining freeze controller before triggering recalibration

### Status States

```
stable → drifting → recalibrating → stable
```

---

## 9. Retraining Freeze Controller — Model Shock Prevention

**File**: `server/services/retraining-freeze-controller.ts` (~231 lines)
**Directive**: 10.0.E
**Status**: 🔒 LOCKED MODULE — Active

### Purpose

Prevents "Model Shock" when fee constants change. Pauses ML retraining for one epoch (default: 1 hour) after activation.

### Behavior

- Auto-activates on construction with Phase 10.0 friction correction message
- Checks expiry every 60 seconds
- Provides `isRetrainingAllowed()` gate for ML clients
- Provides `guardRetraining(fn, fallback)` wrapper that returns fallback if frozen

### Current State

On every server restart, the freeze controller activates a 1-hour freeze for "Phase 10.0 friction correction stabilization (0.26% → 0.50%)". This means **every restart blocks ML retraining for 1 hour**.

> **FINDING**: The retraining freeze controller unconditionally activates a 1-hour freeze on every instantiation (line 64: `this.activatePhase10Freeze()`). This was designed as a one-time Phase 10 deployment measure but runs on every restart. This is likely a stale deployment artifact that should be evaluated for removal.

---

## 10. Telemetry Aggregator — Performance Data Collection

**File**: `server/services/telemetry-aggregator.ts` (~62KB, ~1,500+ lines)
**Directive**: 10.8
**Status**: Active (not locked)

### Purpose

Collects and aggregates performance telemetry for adaptive pair selection. The single largest service file in the Phase 6 scope.

### Key Features

- **Rolling 24-hour history window** per pair
- **Weighted composite scoring** for pair ranking
- **Pool-level performance tracking** (ideal vs rotational — Directive 11.2 R1)
- **Source segregation** (simulation vs live — Directive 11.0E.2)
- **VTS-only write restriction** (Directive 11.4C.1) — only VTS can write telemetry
- **Z-score tracking** for volatility and trend drift (Directive 11.7F-B)

### PairTelemetry Interface

Tracks per-pair: finalScore, hybridScore, regimeWeight, regimeScore, predictiveConfidence, successRate, avgDecayedStrength, pairRegime, pattern, pool, source, signalType, strategy, volZ, trendZ, volZHistory, trendZHistory.

### Consumer Chain

The telemetry aggregator feeds the **AdaptiveScanManager** with ranked pair lists and the **DynamicStrategySelector** with regime-aware metrics. It is the central data collection point for the entire VTS feedback loop.

---

## 11. Adaptive Learning Repository — SQL-Backed Weight Persistence

**File**: `server/services/adaptive-learning-repository.ts` (~170+ lines)
**Directive**: 11.1B
**Status**: Active

### Purpose

Provides SQL-backed persistence for adaptive learning weights per strategy, per regime. Enables rehydration of learning state after restarts with timestamp awareness for time-based decay.

### Features

- **Strategy-specific weights** by regime
- **Timestamp propagation** for time decay on rehydration
- **Live mode-only persistence** (consistent with 11.1A1 provenance rules)
- **Upsert semantics** for weight updates

### Database Schema

Uses the `adaptive_learning` table with columns: strategyId, mode, regime, weights (JSONB), updatedAt.

---

## 12. Regime Archiver — Long-Term Metric Preservation

**File**: `server/core/archival/regime-archiver.ts` (~250+ lines)
**Directive**: 11.7E
**Status**: Active

### Purpose

Persistent regime-metric archival for Phase 12 seeding. Archives regime-level predictive metrics (winRate, avgPnL, skipRatio, confidence, dynamicROI, momentum/volatility/trend weights) into compressed daily files with checksums.

### Archive Record Schema (v1.1)

```typescript
interface RegimeArchiveRecord {
  _schema: 'regime-archive/v1.1';
  timestamp: string;
  source: 'VTS';           // VTS-only source isolation
  windowDays: number;       // 7 or 30 day window
  regime: string;
  strategy: string;
  metrics: RegimeArchiveMetrics;
  checksum: string;         // SHA-1 integrity hash
  _metadata: RegimeArchiveMetadata;
}
```

### Features

- **Canonical stringification** for deterministic checksums
- **SHA-1 integrity** on every record
- **Manifest tracking** with version and compression metadata
- **7-day and 30-day windows** for regime metrics
- **zlib compression** for archival

---

## 13. Learning Cooldown — Regime-Aware Update Gating

**File**: `server/core/governance/learning-cooldown.ts` (~160+ lines)
**Directive**: 11.7R
**Status**: Active

### Purpose

Enforces regime-aware learning update rules to prevent learning from noisy data during regime instability.

### Cooldown Rules

| Stability | Positive Reinforcement | Negative Learning |
|-----------|------------------------|-------------------|
| **STABLE** | Immediate | Immediate |
| **TRANSITION** | Batched (≥5 samples) | Immediate |
| **UNSTABLE** | Deferred & tagged | Immediate |

### Design Rationale

- **Negative learning is always immediate**: Losses during unstable regimes are still real losses
- **Positive learning is gated**: Wins during instability may be noise (lucky trades in choppy markets)
- **Deferred updates are replayed** when stability returns to STABLE

### State Tracking

```typescript
learningStats = {
  immediatePositive: 0,
  immediateNegative: 0,
  batchedPositive: 0,
  deferredPositive: 0,
  replayed: 0,
  lastStableAt: Date.now(),
};
```

---

## 14. Adjustment Stability — Observability Instrumentation

**File**: `server/core/learning/adjustment-stability.ts` (~200+ lines)
**Directive**: 11.7Q
**Status**: Active — **OBSERVABILITY ONLY**

### Purpose

Read-only instrumentation showing adjustment frequency and stability. Explicitly marked as "no learning logic modifications permitted."

### Features

- **Parameter touch history**: Tracks how often each parameter is adjusted, direction (increasing/decreasing/oscillating/stable), cooldown status
- **Bursty period detection**: Identifies clusters of rapid adjustments
- **Safety signals**: Advisory-only flags for rapid adjustment, regime instability, poor performance, oscillation
- **Lagged outcome context**: Post-adjustment trade outcome measurement

---

## 15. Continuous Learning Engine — LEGACY

**File**: `server/services/continuous-learning.ts` (~389 lines)
**Status**: ❌ **CONFIRMED LEGACY** (Kyle, Phase 6 Addendum) — "legacy autonomy-era artifact, mark for removal"

### Evidence for Legacy Classification

1. **Manages "CognitiveWeights"** (reasoning, exploration, exploitation, riskAversion, adaptability) — these are Walter/Bob AI behavioral weights, not trading strategy parameters
2. **Database-backed** via `learningWeightProfile` table with userId/profileId
3. **Broadcasts via contextBridge** — Walter's inter-agent communication system
4. **Not connected to VTS/ML pipeline** — no imports from vts-runner, ml-calibration, telemetry-aggregator, or any canonical trading module
5. **Not imported by any canonical trading service** — imported only by routes and other Walter-era services
6. **Tracks "experience memory"** via `experienceMemoryLog` table — Walter's memory system

### What It Does

- `initializeProfile()` — Creates learning weight profile for a user
- `adjustWeights()` — Adjusts cognitive weights with normalization
- `learnFromExperience()` — Integrates experience memory entries
- `evaluatePerformance()` — Generates recommendations based on performance metrics

### Key Distinction

This engine manages **behavioral tendency weights for AI agents**, not **trading strategy weights for the execution pipeline**. The canonical system uses `strategyWeights.ts` and `adaptive-learning-repository.ts` for strategy weight management.

---

## 16. Learning Cycle Service — LEGACY

**File**: `server/services/learning-cycle-service.ts` (~350+ lines)
**Status**: ❌ **CONFIRMED LEGACY** (Kyle, Phase 6 Addendum) — "legacy autonomy-era artifact, mark for removal"

### Evidence for Legacy Classification

1. **Imports from `learning-bob`** — Bob agent module
2. **Imports from `phase-8.6.5-enhancements`** — Paper→Live knowledge transfer (Walter-era)
3. **Generates "Cognitive Summary Reports"** — Walter's conversational intelligence
4. **24-hour analysis cycle** of "learning fragments" from Learning Bob
5. **Feeds to `feedbackIntegrationService`** — Walter's feedback integration

### What It Does

- Periodically analyzes Learning Fragments from Learning Bob
- Detects patterns: user preferences, effective phrasing, problematic areas
- Generates style recommendations for Walter's conversational behavior
- Promotes paper-mode learnings to live mode via `paperLiveTransferService`

This is **Walter's conversational improvement system**, not a trading learning system.

---

## 17. Learning Coordinator — LEGACY

**File**: `server/services/learning-coordinator.ts` (~269 lines)
**Status**: ❌ **CONFIRMED LEGACY** (Kyle, Phase 6 Addendum) — "legacy autonomy-era artifact, mark for removal"

### Evidence for Legacy Classification

1. **Phase 18.0** module — from a much earlier development phase
2. **Subscribes to `learning_delta` events from cluster bus** — inter-node communication (unused in single-tenant mode)
3. **Imports from `cluster-bus`** — distributed system infrastructure
4. **Uses `agentLearningDelta` database table** — agent-specific learning, not trading
5. **Fans out `model_sync` events** — multi-node model synchronization (no cluster exists)

### What It Does

- Validates, scores, and routes learning deltas across cluster nodes
- Calculates trust (0.4), recency (0.3), and success rate (0.3) scores
- Accepts deltas with score ≥ 0.75
- Validates through ethical gate chain (LearningGateValidator)
- Fans out model_sync events to other nodes

This is a **distributed learning coordination system for a multi-node architecture that does not exist**. DawnTrader runs as a single-tenant application.

---

## 18. Learning Bridge — LEGACY

**File**: `server/services/learning-bridge.ts` (~286 lines)
**Status**: ❌ **CONFIRMED LEGACY** (Kyle, Phase 6 Addendum) — "legacy autonomy-era artifact, mark for removal"

### Evidence for Legacy Classification

1. **Phase 9.7** module
2. **Tracks agent performance** (agentName, domain, accuracyScore, consensusAlignment) — agent behavioral tracking
3. **Uses `agentLearningFeedback` database table** — agent-specific feedback
4. **No connection to VTS/ML pipeline** or canonical trading logic

### What It Does

- Records feedback for agent performance (accuracy, consensus alignment)
- Analyzes performance trends (improving/stable/declining)
- Generates aggregated learning summaries across all agents
- Identifies top performers and agents needing improvement

This tracks **AI agent performance**, not trading strategy performance.

---

## 19. Learning Gate Validator — LEGACY

**File**: `server/services/learning-gate-validator.ts` (~250+ lines)
**Status**: ❌ **CONFIRMED LEGACY** (Kyle, Phase 6 Addendum) — "legacy autonomy-era artifact, mark for removal"

### Evidence for Legacy Classification

1. **Phase 18.0** module — same era as Learning Coordinator
2. **4-gate chain**: Safety → Federated Ethics → Ethical Reasoner → Knowledge
3. **Imported only by LearningCoordinator** — which is itself potential legacy
4. **"Federated Ethics" gate** — multi-agent ethical consensus (no multi-agent system exists in production)
5. **"Ethical Reasoner" gate** — principle-based evaluation (Walter-era AI ethics framework)

### What It Does

Applies a 4-gate validation chain to all learning operations:
1. **Safety**: Kill switch, policy violations, risk limits
2. **Federated Ethics**: Multi-agent ethical consensus
3. **Ethical Reasoner**: Principle-based evaluation
4. **Knowledge**: Semantic enrichment and gap detection (non-blocking)

This is an **AI ethics framework for learning governance** — sophisticated but unused in the canonical trading pipeline.

---

## 20. Mathematical Validation: VTS Reward & Calibration

### Calibration: Linear Regression (L8)

**Formula**: `calibrated_profit = α + β × predicted_profit`

**Validation**:
- ✅ Standard OLS regression — mathematically correct
- ✅ Coefficient clamping prevents extreme values (α: [-0.01, 0.01], β: [0.05, 0.5])
- ✅ Minimum sample requirement (n ≥ 10)
- ✅ R² and stdError computation correct
- ⚠️ The β clamp range [0.05, 0.5] means the calibration can never produce β > 0.5, even if the true relationship has a steeper slope. This biases toward conservative predictions.

### Reward Evaluator (L14)

**Formula**: `R = 0.6 × profit_rate + 0.3 × win_rate − 0.1 × drawdown`

**Validation**:
- ✅ Weighted sum formula is standard
- ✅ Drawdown computed correctly (peak-to-current equity)
- ⚠️ `profit_rate` is `totalPnL / tradeCount` — this is average PnL per trade, not a rate. The name is slightly misleading.
- ⚠️ The reward values are computed but **not consumed** by any downstream system (see Section 7 finding)

### Drift Detection (L11)

**Formula**: `DriftScore = 0.6|Δβ| + 0.2|Δα| + 0.2(σ / σ_baseline)`

**Validation**:
- ✅ Weighted change detection — standard approach
- ✅ Beta drift weighted highest (slope is most impactful)
- ✅ Sigma normalization against baseline
- ✅ Two-threshold system (warning + action)

### ML Calibration Performance Score (11.0E.2)

**Formula**: `PerformanceScore = finalScore × 0.5 + predictiveConfidence × 0.3 + regimeWeight × 0.2`

**Validation**:
- ✅ Formula is a valid weighted average
- ❌ Inputs (finalScore, predictiveConfidence) are **simulated**, not computed from real indicators — performance score is noise-modulated

### Net EV Gate (11.8B-A2)

**Formula**: `netEV = rawEV − totalFriction` (computed by `computeNetExpectancyKernel()`)

**Validation**:
- ✅ Canonical kernel — identical to DSS and Paper Execution
- ⚠️ DI input is `predictiveConfidence × 100` which is simulated (see Section 2)

---

## 21. Data Flow: VTS → ML Pipeline → Parameter Adjustment

```
┌─────────────────────────────────────────────────────────────────┐
│                   VTS RUNNER (60s cycle)                        │
│  FX5 Scanner → Regime Classification → Multi-Strategy Sim      │
│  → Governance Gates → Net EV → Position Sizing → Open Trade    │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Real price resolution
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TRADE RESOLUTION                              │
│  Price Cache (vtsSimulation bucket) → SL/TP/Timeout check      │
│  → Calculate P&L → Persist to VTS Service + Telemetry          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
    ┌───────────┐ ┌────────┐ ┌──────────────┐
    │ Telemetry │ │  VTS   │ │   Regime     │
    │ Aggregator│ │Service │ │   Archiver   │
    │ (24h win) │ │(trades)│ │ (7d/30d)     │
    └─────┬─────┘ └───┬────┘ └──────────────┘
          │           │
          │           ▼ (every 10 HYBRID trades)
          │     ┌──────────────┐
          │     │ML Calibration│
          │     │  Service     │
          │     │(Phase-10     │
          │     │ analysis)    │
          │     └──────┬───────┘
          │            │
          │            ▼
          │     ┌──────────────┐    ┌───────────────────┐
          │     │ Calibration  │◄───│ Drift Detector    │
          │     │ Utils (OLS)  │    │ (15-min checks)   │
          │     │ α, β per     │    │ Auto-recalibrate  │
          │     │ strategy     │    │ when drift > 0.25 │
          │     └──────┬───────┘    └───────────────────┘
          │            │
          │            ▼                    ┌──────────────────┐
          │     ┌──────────────┐            │Retraining Freeze │
          │     │ Adaptive     │◄───────────│Controller        │
          │     │ Learning     │  (blocks   │(1-hour epoch)    │
          │     │ Repository   │  if frozen)└──────────────────┘
          │     │ (SQL)        │
          │     └──────────────┘
          │
          ▼
    ┌──────────────┐    ┌──────────────┐
    │ Adaptive     │    │  Reward      │
    │ Scan Manager │    │  Evaluator   │
    │ (pair        │    │  (30-min     │
    │  ranking)    │    │   eval)      │
    └──────────────┘    └──────────────┘
```

### Disconnected Systems (Walter-Era Learning — CONFIRMED LEGACY)

```
┌────────────────────────────────────────────────────┐
│    WALTER-ERA LEARNING (CONFIRMED LEGACY — Kyle)    │
│                                                     │
│  ContinuousLearningEngine ← Experience Memory      │
│       ↓                                             │
│  LearningCycleService ← Learning Bob               │
│       ↓                                             │
│  LearningBridge ← Agent Feedback                   │
│       ↓                                             │
│  LearningCoordinator ← Cluster Bus                 │
│       ↓                                             │
│  LearningGateValidator ← Ethical Reasoner           │
│                                                     │
│  ❌ No connection to VTS/ML Pipeline                │
│  ❌ No connection to Strategy Weights               │
│  ❌ No connection to Telemetry Aggregator           │
│  ❌ No connection to Calibration Utils              │
└────────────────────────────────────────────────────┘
```

---

## 22. Critical Findings

### Bugs

| ID | Severity | Description | Location | Kyle Decision |
|----|----------|-------------|----------|---------------|
| BUG-001 | CRITICAL | VTS signal generation uses simulated hybridScore/predictiveConfidence/decayPenalty instead of real strategy calculations | `vts-runner.ts`: `simulateHybridScore()`, `simulatePredictiveConfidence()`, `simulateDecayPenalty()` | **CONFIRMED CRITICAL** — Replace with real feature-derived scoring |
| BUG-013 | MEDIUM | ML Service Client PredictionInput interface references removed `ngc` and `cwqi` fields | `ml-service-client.ts` line 30-31 | **CONFIRMED** — Remove deprecated fields, align with canonical metrics |
| BUG-014 | LOW | Retraining Freeze Controller activates Phase 10.0 freeze on every restart (stale deployment artifact) | `retraining-freeze-controller.ts` line 64 | **CONFIRMED** — Convert to manual trigger or remove auto-activation |

### Architectural Risks

| ID | Severity | Description | Kyle Decision |
|----|----------|-------------|---------------|
| RISK-038 | HIGH | VTS ML calibration performance multiplier is noise-modulated (based on simulated scores), making adjustment magnitudes statistically meaningless | **CONFIRMED** — Downstream of BUG-001, resolves when real scoring implemented |
| RISK-039 | MEDIUM | Reward Evaluator computes rewards but values are not consumed by any downstream scoring or selection system | **CONFIRMED** — Currently observability-only, not harmful, not integrated |
| RISK-040 | MEDIUM → **CONFIRMED LEGACY** | Five Walter-era learning services operate independently of canonical trading pipeline | **CONFIRMED LEGACY** — "legacy autonomy-era artifacts, mark for removal in cleanup wave" |
| RISK-041 | LOW | Calibration β coefficient clamped to [0.05, 0.5] — prevents calibration from learning steep slope relationships | — |
| RISK-042 | LOW | VTS Service trade duration (3h) vs VTS Runner max hold (24h) mismatch | — |
| **RISK-043** | **CRITICAL** | **Strategy-specific signal logic is NOT implemented** — all strategies use identical generic scoring math (same hybridScore, same predictiveConfidence, same decayPenalty, same stop/target logic). Multi-strategy simulation infrastructure exists (11.8C) but produces artificially differentiated signals. Per-strategy calibration is statistically diluted; true structural edge cannot emerge. | **Kyle (Phase 6 Addendum)**: "That is the core architectural problem in Phase 6." |

### Kyle Phase 6 Addendum — Decisions Applied

| Item | Decision |
|------|----------|
| RISK-040 | **CONFIRMED LEGACY** — All 5 Walter-era learning services are legacy autonomy-era artifacts. Mark for removal in cleanup wave. |
| RISK-039 | **CONFIRMED OBSERVABILITY-ONLY** — Reward Evaluator is disconnected from scoring, not harmful but not integrated. |
| BUG-014 | **CONFIRMED** — Retraining freeze auto-activation should be converted to manual trigger or removed. |
| RISK-043 (NEW) | **CRITICAL** — Strategy differentiation is artificial. Each strategy must have unique entry logic, stop/target logic, confidence modeling, and feature-derived scoring. This is the most serious Phase 6 issue. |

### Required Corrections (Kyle Phase 6 Addendum)

**CRITICAL (Red)**:
1. **Replace simulated scoring inputs** — Remove `simulateHybridScore()`, `simulatePredictiveConfidence()`, random decay penalty. Replace with real feature-derived, strategy-specific scoring engines.
2. **Implement strategy-specific signal generators** — Each strategy (Breakout, Mean Reversion, Liquidity Trap, SMA Trend Ride, etc.) must have unique entry logic, unique stop logic, unique target logic, and unique confidence modeling.

**HIGH (Orange)**:
3. **Remove Walter-era learning stack** — ContinuousLearningEngine, LearningCycleService, LearningCoordinator, LearningBridge, LearningGateValidator. All confirmed legacy.
4. **Remove freeze auto-activation** — Make RetrainingFreezeController explicitly controlled, not restart-triggered.
5. **Update ML client schema** — Remove deprecated `ngc`/`cwqi` fields from PredictionInput.

---

## 23. File Catalog

### Active Files (Canonical ML Pipeline)

| File | Lines | Directive | Role |
|------|-------|-----------|------|
| `server/services/vts-runner.ts` | ~1,400 | 11.0E.1 🔒 | Autonomous VTS simulation engine |
| `server/services/vts-service.ts` | ~500+ | 10.0.A 🔒 | Trade simulation, calibration trigger, type definitions |
| `server/services/ml-calibration.ts` | ~232 | 11.0E.2 🔒 | Phase-10 ML training loop |
| `server/utils/calibration.ts` | ~324 | 8.8.4-L8 🔒 | Linear regression calibration utilities |
| `server/services/ml-service-client.ts` | ~245 | 8.8.4-L3 | Python ML microservice client |
| `server/services/reward-evaluator.ts` | ~274 | 8.8.4-L14 🔒 | Per-strategy per-regime reward computation |
| `server/services/drift-detector.ts` | ~400+ | 8.8.4-L11 🔒 | Calibration drift detection & auto-recalibration |
| `server/services/retraining-freeze-controller.ts` | ~231 | 10.0.E 🔒 | Model shock prevention |
| `server/services/telemetry-aggregator.ts` | ~1,500+ | 10.8 | Telemetry collection & pair ranking |
| `server/services/adaptive-learning-repository.ts` | ~170+ | 11.1B | SQL-backed weight persistence |
| `server/core/archival/regime-archiver.ts` | ~250+ | 11.7E | Long-term regime metric archival |
| `server/core/governance/learning-cooldown.ts` | ~160+ | 11.7R | Regime-aware learning update gating |
| `server/core/learning/adjustment-stability.ts` | ~200+ | 11.7Q | Adjustment frequency observability |
| `server/core/learning/adjustment-explainability.ts` | ~200+ | 11.7Q | Adjustment explainability |
| `server/core/logging/vts-telemetry.ts` | ~300+ | — | VTS telemetry logging |
| `server/services/telemetry-repository.ts` | ~350+ | — | Telemetry SQL persistence |
| `server/services/telemetry-compression.ts` | ~150+ | — | Telemetry data compression |
| `server/core/telemetry/cost-telemetry.ts` | ~200+ | — | Cost-specific telemetry |
| `server/config/drift-definitions.ts` | ~45 | — | Drift threshold definitions |
| `server/config/drift-descriptions.ts` | ~60 | — | Drift description templates |
| `server/core/analytics/mapping-drift-calculator.ts` | ~140+ | — | Mapping drift computation |
| `server/core/schedulers/ml-calibration-scheduler.ts` | ~160+ | — | ML calibration scheduling |
| `config/vts.json` | ~10 | — | VTS runtime configuration |

### LEGACY Files — Confirmed by Kyle (Phase 6 Addendum)

| File | Lines | Phase | Role | Kyle Decision |
|------|-------|-------|------|---------------|
| `server/services/continuous-learning.ts` | ~389 | — | Cognitive weight management for AI agents | REMOVE |
| `server/services/learning-cycle-service.ts` | ~350+ | 8.6.1 | Walter's conversational improvement cycle | REMOVE |
| `server/services/learning-coordinator.ts` | ~269 | 18.0 | Multi-node learning delta coordination | REMOVE |
| `server/services/learning-bridge.ts` | ~286 | 9.7 | Inter-agent learning feedback | REMOVE |
| `server/services/learning-gate-validator.ts` | ~250+ | 18.0 | 4-gate ethical validation chain | REMOVE |

### Supporting Data Files

| Location | Contents |
|----------|----------|
| `logs/vts_calibration.json` | Current calibration coefficients (global + per-strategy) |
| `logs/vts_calibration_history/` | Daily calibration snapshots |
| `logs/rewards/reward_history.json` | Reward evaluator trade history + reward cache |
| `logs/drift_history/` | Drift detector snapshots |
| `logs/drift_events/` | Drift warning/recalibration events |
| `logs/regime_archive/` | Long-term regime metric archives |
| `logs/virtual_trades/` | Daily VTS trade logs |
| `data/vts_trades_*.json` | VTS session trade data |
| `logs/vts_exports/` | CSV exports of VTS trade data |

---

## 24. Kyle's Phase 6 Architectural Confirmations

The following architectural decisions were confirmed by Kyle in the Phase 6 Addendum:

### 1. Directive 11.8C — VERIFIED IMPLEMENTED
Multi-strategy regime-scoped simulation is active in `runPhase10SimulationCycle()`. VTS simulates every strategy mapped to the pair's regime. No ambiguity.

### 2. Strategy-Specific Signal Math — NOT IMPLEMENTED (CRITICAL)
Although 11.8C multi-strategy infrastructure exists, `generatePhase10Signal()` uses generic scoring logic for ALL strategies. This is the **most serious Phase 6 issue**. Each strategy must have unique entry/stop/target/confidence logic before per-strategy learning becomes meaningful.

### 3. Walter-Era Learning Stack — CONFIRMED LEGACY
Five services (ContinuousLearningEngine, LearningCycleService, LearningCoordinator, LearningBridge, LearningGateValidator) are confirmed as "legacy autonomy-era artifacts." They manage cognitive weights and agent behavior, not trading. Zero connection to canonical pipeline. Mark for removal in cleanup wave.

### 4. ML Service Client Schema — CONFIRMED OUTDATED
`PredictionInput` still references deprecated `ngc` and `cwqi` fields. Must be updated to canonical Phase-10 metrics: `finalScore`, `hybridScore`, `predictiveConfidence`, `regimeWeight`.

### 5. Retraining Freeze Controller — CONFIRMED ARTIFACT
Auto-activation on every restart is a stale one-time deployment measure. Convert to manual trigger or remove.

### 6. Reward Evaluator — CONFIRMED DISCONNECTED
Observability-only. Not harmful. Not integrated into scoring or selection. Not a priority to connect.

### 7. TelemetryAggregator — HIGH COUPLING NOTE
At ~62KB and centralizing strategy/regime/pool metrics, Z-score normalization, and ranking logic, TelemetryAggregator is a future modularization candidate. Not incorrect, not legacy — but high coupling risk.

### 8. ML Calibration — STRUCTURALLY SOUND BUT NOISY
Directional updates (win/loss) are based on real data. Magnitude scaling is corrupted by simulated scoring. Will self-correct once BUG-001 and strategy-specific signal logic are resolved.

### 9. System Assessment
Kyle's assessment of Claude's Phase 6 audit: "Largely accurate. Correct on simulated scoring flaw. Correct on legacy learning stack. Correct on freeze artifact. Correct on ML schema drift. But underemphasized the deeper structural issue: strategy differentiation is currently artificial."

---

## 25. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-16 | Claude Code | Initial Phase 6 audit — ML Pipeline, Learning & Calibration |
| 1.1 | 2026-02-16 | Claude Code | Phase 6 Addendum — Kyle's architectural confirmations applied: RISK-043 (CRITICAL: artificial strategy differentiation) elevated as core problem; Walter-era learning stack CONFIRMED LEGACY (5 files); BUG-014/RISK-039 confirmed; ML client schema confirmed outdated; Section 24 added (Kyle's confirmations); all POTENTIAL LEGACY sections updated to CONFIRMED LEGACY |
