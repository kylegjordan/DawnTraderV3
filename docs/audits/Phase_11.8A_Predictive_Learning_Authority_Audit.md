# Phase 11.8A — Predictive & Learning Authority Audit

**Directive**: 11.8A (READ-ONLY AUDIT)  
**Date**: 2026-02-02  
**Status**: COMPLETE  
**Schema Version**: audit/v1.0  

---

## Objective

Produce a complete, verifiable, file-level audit of all predictive, learning, calibration, governance, and legacy (LATTi) write paths that influence:
- Strategy behavior
- Scoring
- Filters
- Risk
- Guardrails
- Position sizing
- Regime behavior

**Core Question**: "When a trade executed, which value was actually in force — and which system had authority over it?"

---

## 1. Predictive & Learning Adjustment Inventory

### 1.1 Strategy Weights

| Parameter | File Path(s) | Function(s) | R/W | Trigger | Write Cadence | Read Cadence | Persistence | Value Type |
|-----------|--------------|-------------|-----|---------|---------------|--------------|-------------|------------|
| FinalScore.HYBRID | `server/config/score-weights.config.ts` | `SCORE_WEIGHTS.FINAL_SCORE` | READ | - | immutable | runtime | config file | absolute |
| FinalScore.CONFIDENCE | `server/config/score-weights.config.ts` | `SCORE_WEIGHTS.FINAL_SCORE` | READ | - | immutable | runtime | config file | absolute |
| FinalScore.REGIME | `server/config/score-weights.config.ts` | `SCORE_WEIGHTS.FINAL_SCORE` | READ | - | immutable | runtime | config file | absolute |
| FinalScore.DECAY | `server/config/score-weights.config.ts` | `SCORE_WEIGHTS.FINAL_SCORE` | READ | - | immutable | runtime | config file | absolute |
| Strategy dependency | `server/config/strategy-governance.ts` | `STRATEGY_GOVERNANCE` | READ | - | immutable | runtime | config file | absolute |

### 1.2 Pattern / Signal Weights

| Parameter | File Path(s) | Function(s) | R/W | Trigger | Write Cadence | Read Cadence | Persistence | Value Type | UI Surface |
|-----------|--------------|-------------|-----|---------|---------------|--------------|-------------|------------|------------|
| Pattern weights (MORNING_STAR, etc.) | `server/services/ml-calibration.ts` | `MLCalibrationService.analyzePerformance()` | BOTH | scheduler/manual | 8-hour schedule | per-signal | logs only | delta | None |
| Cognitive source weights | `server/services/cognitive-weight-adjuster.ts` | `CognitiveWeightAdjuster.adjustSourceWeight()` | BOTH | scheduler (nightly) | daily 2:00 AM | per-prediction | database (learning_sources) | delta | None |
| Signal optimizer weights | `server/services/signal-weight-optimizer.ts` | `SignalWeightOptimizerService.optimizeStrategyWeights()` | BOTH | scheduler (nightly) | daily 2:00 AM | per-strategy | database (prediction_outcomes) | derived | None |

**⚠️ CONFLICT FLAG**: Pattern weights are modified by ML calibration but logged via `logPredictiveAdjustment()` — NOT persisted to canonical file by default.

### 1.3 Regime Confidence Modifiers

| Parameter | File Path(s) | Function(s) | R/W | Trigger | Write Cadence | Read Cadence | Persistence | Value Type |
|-----------|--------------|-------------|-----|---------|---------------|--------------|-------------|------------|
| regimeWeight | `server/services/telemetry-aggregator.ts` | `TelemetryAggregator.recordPairTelemetry()` | BOTH | scan cycle | per-scan | per-signal | in-memory (24hr TTL) | derived |
| regimeConfidence | `server/core/governance/governance-engine.ts` | `applyGovernance()` | READ | per-signal | - | per-signal | in-memory | derived |
| stabilityClassification | `server/core/governance/regime-stability.ts` | `computeGlobalStability()` | BOTH | per-signal | per-scan | per-signal | in-memory | derived |

### 1.4 Risk Multipliers

| Parameter | File Path(s) | Function(s) | R/W | Trigger | Write Cadence | Read Cadence | Persistence | Value Type | UI Surface |
|-----------|--------------|-------------|-----|---------|---------------|--------------|-------------|------------|------------|
| portfolioRiskPerTradePct | `server/services/guardrail-settings.ts` | `getRiskPercentageV2()` | READ | - | UI manual | per-trade | database (guardrails_v2) | absolute | Guardrails tab |
| influenceMultiplier | `server/core/governance/governance-engine.ts` | `getGovernanceMultiplier()` | READ | per-signal | - | per-signal | config file | absolute | None |

### 1.4.1 Adaptive Learning Repository Write Path

| Parameter | File Path | Function | R/W | Trigger | Write Cadence | Persistence |
|-----------|-----------|----------|-----|---------|---------------|-------------|
| Per-strategy adaptive weights | `server/services/adaptive-learning-repository.ts` | `saveAdaptiveWeights()` | BOTH | telemetry cycle | per-cycle | database (`adaptive_learning`) |
| Per-regime weight profiles | `server/services/adaptive-learning-repository.ts` | `loadAdaptiveWeightsWithTimestamps()` | READ | rehydration | startup | database (`adaptive_learning`) |

**Code Evidence** (Lines 45-75 of `adaptive-learning-repository.ts`):
```typescript
export async function loadAdaptiveWeightsWithTimestamps(
  regime: MarketRegime
): Promise<AdaptiveWeightResult[]> {
  // ... reads from adaptive_learning table with mode='live' filter
}
```

**Persistence Rules**: Live mode-only persistence per Directive 11.1A1 provenance rules.

### 1.5 Position Sizing Factors

| Parameter | File Path(s) | Function(s) | R/W | Trigger | Write Cadence | Read Cadence | Persistence | Value Type | UI Surface |
|-----------|--------------|-------------|-----|---------|---------------|--------------|-------------|------------|------------|
| riskAmount | `server/services/guardrail-settings.ts` | `calculateRiskAmount()` | READ (computed) | per-trade | - | per-trade | derived | derived | Settings |
| portfolioBalance | `server/services/guardrail-settings.ts` | `getPortfolioBalanceV2()` | READ | - | - | per-trade | database (portfolio_state) | absolute | Dashboard |

### 1.6 Filter Thresholds

| Parameter | File Path(s) | Function(s) | R/W | Trigger | Write Cadence | Read Cadence | Persistence | Value Type |
|-----------|--------------|-------------|-----|---------|---------------|--------------|-------------|------------|
| MIN_LIQUIDITY_SCORE | `server/config/system-guards.ts` | `SYSTEM_GUARDS` | READ | - | immutable | runtime | config file | absolute |
| MAX_VOL_NOISE | `server/config/system-guards.ts` | `SYSTEM_GUARDS` | READ | - | immutable | runtime | config file | absolute |
| MIN_PWIN / MAX_PWIN | `server/config/system-guards.ts` | `SYSTEM_GUARDS` | READ | - | immutable | runtime | config file | absolute |
| IMF thresholds (LQ_MIN, VN_MAX) | `server/config/system-guards.ts` | `IMF_THRESHOLDS` | READ | - | immutable | runtime | config file | absolute |

### 1.7 Guardrails

| Parameter | File Path(s) | Function(s) | R/W | Trigger | Write Cadence | Read Cadence | Persistence | Value Type | UI Surface |
|-----------|--------------|-------------|-----|---------|---------------|--------------|-------------|------------|------------|
| maxOpenPositions | `server/services/guardrail-policy.ts` | policy checks | READ | - | UI manual | per-trade | database (guardrails_v2) | absolute | Guardrails tab |
| dailyLossLimit | `server/services/guardrail-policy.ts` | policy checks | READ | - | UI manual | per-trade | database (guardrails_v2) | absolute | Guardrails tab |
| maxPositionSize | `server/services/guardrail-policy.ts` | policy checks | READ | - | UI manual | per-trade | database (guardrails_v2) | absolute | Guardrails tab |

### 1.8 Execution Modifiers

| Parameter | File Path(s) | Function(s) | R/W | Trigger | Write Cadence | Read Cadence | Persistence | Value Type |
|-----------|--------------|-------------|-----|---------|---------------|--------------|-------------|------------|
| HYBRID_PARAMS.MIN_SCORE | `server/config/system-guards.ts` | `HYBRID_PARAMS` | READ | - | immutable | per-signal | config file | absolute |
| HYBRID_PARAMS.DECAY | `server/config/system-guards.ts` | `HYBRID_PARAMS.DECAY` | READ | - | immutable | per-signal | config file | absolute |
| governanceBlockThreshold | `server/config/strategy-governance.ts` | `INFLUENCE_RULES` | READ | - | immutable | per-signal | config file | absolute |

---

## 2. Canonical vs Runtime Truth Map

| Resource Path | Role | Authority Type | Multi-Role? | Update Frequency |
|---------------|------|----------------|-------------|------------------|
| `bridge/canonical/phase9_predictive-learning.json` | Regime weight vectors | **Authoritative baseline** | NO | Every 8 hours (scheduled) |
| `bridge/canonical/mapping-regime-strategy.json` | Regime-strategy mapping | **Authoritative baseline** | NO | Manual only |
| `logs/regime_archive/*.json` | Archived regime metrics | Historical artifact | NO | Every 8 hours |
| `logs/predictive_adjustments/*.jsonl` | Adjustment event log | Learning-only output | NO | Per adjustment |
| `logs/telemetry/regime_performance_*.json` | VTS telemetry snapshots | Runtime input | NO | Every 60 seconds |
| `logs/telemetry/recalibration_history.json` | Recalibration audit trail | Historical artifact | NO | Every 8 hours |
| `server/config/score-weights.config.ts` | FinalScore coefficients | **Authoritative baseline** | NO | Immutable |
| `server/config/system-guards.ts` | Threshold constants | **Authoritative baseline** | NO | Immutable |
| `server/config/strategy-governance.ts` | Strategy dependency levels | **Authoritative baseline** | NO | Immutable |

### 2.1 Database Tables

| Table | Role | Authority Type | Update Frequency |
|-------|------|----------------|------------------|
| `adaptive_learning` | Per-strategy adaptive weights | Runtime input (live mode only) | Per learning cycle |
| `guardrails_v2` | Risk parameters | **Authoritative baseline** (UI-editable) | Manual via UI |
| `portfolio_state` | Balance tracking | Runtime input | Per trade |
| `strategy_param_schema` | DHMA tuning parameters | **Runtime modifiable** (LATTi) | Max 3x/day |
| `trading_audit_log` | Audit trail | Historical artifact | Per event |
| `virtual_trades` | VTS simulation results | Runtime input | Per VTS cycle |
| `regime_performance` | Regime telemetry | Runtime input | Per scan cycle |

**⚠️ DUAL-ROLE FLAG**: None detected. All resources serve single roles.

---

## 3. LATTi Authority Audit

### 3.1 LATTi Files

| File Path | Responsibility |
|-----------|----------------|
| `server/services/latti-manager.ts` | Main LATTi coordinator |
| `server/services/dhma-tuning-service.ts` | DHMA parameter tuning (called by LATTi) |

### 3.2 LATTi Capabilities

| Capability | Status | Details |
|------------|--------|---------|
| **READ**: Strategy telemetry | YES | Fetches DHMA trades for last 24 hours via `fetchDHMATelemetry()` |
| **READ**: Audit log | YES | Reads `trading_audit_log` for recent adjustments |
| **WRITE**: DHMA parameters | YES | Via `DHMATuningService.processTelemetry()` to `strategy_param_schema` table |
| **WRITE**: Audit log | YES | Logs tuning actions to `trading_audit_log` with `triggered_by='latti_dhma_tuning'` |
| **OVERRIDE**: Strategy weights | NO | Does not modify strategy weights directly |
| **BLOCK**: Execution | NO | Does not gate trade execution |
| **SOFTEN**: Scores | NO | Does not modify signal scores |

### 3.2.1 DHMATuningService Write Path (Code Evidence)

**File**: `server/services/dhma-tuning-service.ts`

**Parameters Modified** (Lines 77-100):
- `spreadMaxTicks`: Adjusted based on `avgSpreadTicks` telemetry
- `toxicityMax`: Adjusted based on `avgToxicity` telemetry  
- `minMomentum`: Adjusted based on hit rate performance

**Safety Limits** (Lines 33-53):
```typescript
// Safety Rule 1: Throttle - one update per 30 minutes
const thirtyMinutes = 30 * 60 * 1000;

// Safety Rule 2: Max 3 updates per day (24 hours)
if (this.updateCount[mode] >= 3) {
  console.log(`[DHMATuning][${mode}] Daily limit reached: ${this.updateCount[mode]}/3 updates`);
  return;
}
```

**Persistence Target**: Database table `strategy_param_schema` (NOT config files)

### 3.3 LATTi Does NOT Touch

| Subsystem | Confirmed Safe |
|-----------|----------------|
| SQE filters | ✅ NO interaction |
| Execution gating | ✅ NO blocking authority |
| Scoring logic | ✅ NO score modification |
| Regime detection | ✅ NO regime override |
| Guardrails | ✅ NO guardrail modification |

### 3.4 LATTi Overlap Points

| Overlap | Description |
|---------|-------------|
| FX5 Scanner | None - LATTi runs post-scan, does not affect pair selection |
| Guardrails | None - LATTi reads only; guardrails read from database |
| Manual overrides | None - LATTi does not conflict with UI settings |
| Governance modes | None - LATTi is not affected by governance stability |

---

## 4. Conflict & Overlap Report

### 4.1 Parameters Written by Multiple Systems

| Parameter | Writers | Conflict Severity |
|-----------|---------|-------------------|
| Pattern weights (e.g., MORNING_STAR) | MLCalibrationService, CognitiveWeightAdjuster | **HIGH** - Both write to logs, neither persists to canonical |
| Cognitive source weights | CognitiveWeightAdjuster, SignalWeightOptimizer | **MEDIUM** - Different scopes but same storage |

### 4.2 Parameters Displayed but NOT Applied

| Parameter | Displayed In | Applied Where | Issue |
|-----------|--------------|---------------|-------|
| ML calibration recommendations | Logs only | NOT applied to scoring | Recommendations logged but not persisted to runtime weights |

### 4.3 Parameters Applied but NOT Surfaced

| Parameter | Applied Where | UI Surface | Issue |
|-----------|---------------|------------|-------|
| Governance influenceMultiplier | `applyGovernance()` | None | Score adjustment invisible to user |
| decayPenalty | `computeFinalScore()` | None | Decay calculation not shown in UI |
| regimeWeight from telemetry | Signal scoring | None | Dynamic value not exposed |

### 4.4 Snap-Back / Reversion Root Cause Analysis

**Symptom**: Predictive exports show values that "snap back" to defaults after recalibration.

**Root Cause Identified (with code evidence)**:

1. **Default Fallback on Zero Telemetry** (Line 159-161 of `recalibrate-predictive-weights.ts`):
   ```typescript
   if (!Number.isFinite(total) || total <= 0) {
     acc.momentum = acc.volatility = acc.trend = 0.33;
     total = 1;
   }
   ```
   When telemetry metrics sum to zero (winRate=0, avgPnL=0, skipRatio=1), the script resets all weights to 0.33.

2. **Chaining Only When Prior Exists** (Lines 168-174):
   ```typescript
   if (prev?.[regime] && !regime.startsWith("_")) {
     const prevWeights = prev[regime] as WeightVector;
     for (const k of Object.keys(acc) as Array<keyof typeof acc>) {
       const p = prevWeights?.[k] ?? 0.33;
       acc[k] = +(ALPHA * acc[k] + (1 - ALPHA) * p).toFixed(3);
     }
   }
   ```
   Chaining with prior canonical values DOES exist, BUT: if `acc[k]` was already reset to 0.33 by the fallback, the smoothing produces `0.6 × 0.33 + 0.4 × prior`, causing gradual drift toward 0.33.

3. **Zero Metrics Propagation** (Lines 148-150):
   ```typescript
   acc.momentum += perf.winRate ?? 0;
   acc.volatility += Math.abs(perf.avgPnL ?? 0);
   acc.trend += 1 - (perf.skipRatio ?? 0);
   ```
   When VTS produces trades with winRate=0, avgPnL=0, the accumulated metrics are zero, triggering the default fallback.

4. **No Staleness Check**: The script overwrites canonical weights regardless of whether telemetry is newer than the existing canonical file.

**Resolution Required in Phase 11.8B**:
- Establish canonical file as baseline authority
- Prevent overwrite when telemetry is sparse (e.g., require minimum sample count)
- Add staleness check comparing telemetry timestamp vs canonical timestamp
- Consider delta-only updates instead of full replacement

---

## 5. Master File Index

### 5.1 Files That Compute Predictive Adjustments

| File Path | Responsibility | Authority Candidate |
|-----------|----------------|---------------------|
| `server/services/ml-calibration.ts` | Analyzes VTS trades, produces weight recommendations | Delta application |
| `server/scripts/recalibrate-predictive-weights.ts` | Recalibrates canonical weights from telemetry | Baseline authority |
| `server/services/cognitive-weight-adjuster.ts` | Adjusts cognitive learning source weights | Delta application |
| `server/services/signal-weight-optimizer.ts` | Optimizes signal weights per strategy | Delta application |

### 5.2 Files That Apply Learning

| File Path | Responsibility | Authority Candidate |
|-----------|----------------|---------------------|
| `server/core/adaptive-manager.ts` | Manages adaptive weight state | Runtime input |
| `server/services/adaptive-learning-repository.ts` | Persists adaptive weights to database | Runtime input |
| `server/services/telemetry-aggregator.ts` | Aggregates pair telemetry for scoring | Runtime input |
| `server/services/continuous-learning.ts` | Runs continuous learning cycles | Delta application |
| `server/jobs/learning-feedback.ts` | Job scheduler for learning tasks | Delta application |

### 5.3 Files That Modify Strategy Behavior

| File Path | Responsibility | Authority Candidate |
|-----------|----------------|---------------------|
| `server/config/canonical-regime-strategy-map.ts` | Maps regimes to strategies | Baseline authority |
| `server/config/strategy-governance.ts` | Strategy dependency levels | Baseline authority |
| `server/core/governance/governance-engine.ts` | Applies governance constraints | Runtime input |
| `server/core/governance/regime-stability.ts` | Computes regime stability | Runtime input |
| `server/core/governance/learning-cooldown.ts` | Enforces learning cooldowns | Runtime input |

### 5.4 Files That Alter Filters or Guardrails

| File Path | Responsibility | Authority Candidate |
|-----------|----------------|---------------------|
| `server/config/system-guards.ts` | Threshold constants | Baseline authority |
| `server/services/guardrail-settings.ts` | Reads guardrail configuration | Runtime input |
| `server/services/guardrail-policy.ts` | Enforces guardrail policies | Runtime input |
| `server/services/adaptive-guardrails.ts` | Dynamic guardrail adjustments | Delta application |
| `server/services/safety-guardrails.ts` | Safety constraint enforcement | Runtime input |
| `server/services/unified-filter-gateway.ts` | Filter pipeline coordination | Runtime input |

### 5.5 Files That Touch Regime Logic

| File Path | Responsibility | Authority Candidate |
|-----------|----------------|---------------------|
| `server/core/metrics/market-regime.ts` | Computes market regime | Runtime input |
| `server/services/regime-performance.ts` | Tracks regime performance | Archival only |
| `server/services/adaptive-regime.ts` | Adaptive regime switching | Delta application |
| `server/scripts/archive-regime-metrics.ts` | Archives regime metrics | Archival only |
| `server/core/archival/regime-archiver.ts` | Regime archival utilities | Archival only |

### 5.6 Files That Log Adjustments

| File Path | Responsibility | Authority Candidate |
|-----------|----------------|---------------------|
| `server/core/logging/predictive-adjustments.ts` | Structured adjustment logging | Archival only |
| `server/routes/vts-predictive-adjustments.ts` | API for adjustment retrieval | UI only |
| `server/services/predictive-diagnostics.service.ts` | Diagnostic queries | UI only |

---

## 6. Execution-Time Authority Resolution

This section answers: **"When a trade executed, which value was actually in force — and which system had authority over it?"**

### 6.1 Trade Execution Dataflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SIGNAL GENERATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ Market Regime Detection → Canonical Strategy Map → Pattern Detection        │
│                                                                              │
│ Authority: canonical-regime-strategy-map.ts (immutable baseline)            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SIGNAL SCORING                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ FinalScore = (HYBRID × hybridScore) + (CONFIDENCE × confidenceScore)        │
│            + (REGIME × regimeWeight) - (DECAY × decayPenalty)               │
│                                                                              │
│ Authority Resolution Order:                                                  │
│ 1. score-weights.config.ts (HYBRID, CONFIDENCE, REGIME, DECAY coefficients) │
│ 2. telemetry-aggregator (regimeWeight from live telemetry)                   │
│ 3. governance-engine (influenceMultiplier applied post-scoring)              │
│                                                                              │
│ Effective Value = canonical × (1 + telemetryDelta) × governanceMultiplier   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SQE FILTERING                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ Filters: MIN_LIQUIDITY_SCORE, MAX_VOL_NOISE, MIN_PWIN                       │
│                                                                              │
│ Authority: system-guards.ts (immutable thresholds)                          │
│ No runtime override possible.                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GOVERNANCE GATE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Checks: Strategy dependency level, regime stability, learning cooldown      │
│                                                                              │
│ Authority Resolution Order:                                                  │
│ 1. strategy-governance.ts (STRATEGY_GOVERNANCE profiles)                     │
│ 2. regime-stability.ts (stabilityClassification computed at runtime)         │
│ 3. learning-cooldown.ts (cooldown state from database)                       │
│                                                                              │
│ Governance can BLOCK signals (hard exclusion) before they reach execution.   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                           POSITION SIZING                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ riskAmount = portfolioBalance × portfolioRiskPerTradePct                    │
│                                                                              │
│ Authority Resolution Order:                                                  │
│ 1. guardrails_v2 table (portfolioRiskPerTradePct from UI)                   │
│ 2. portfolio_state table (current balance)                                   │
│ 3. adaptive-guardrails.ts (can apply delta adjustments)                      │
│                                                                              │
│ Effective Value = UIGuardrail × adaptiveMultiplier                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ORDER EXECUTION                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Final guardrail checks: maxOpenPositions, dailyLossLimit, maxPositionSize   │
│                                                                              │
│ Authority: guardrails_v2 table (absolute, UI-editable)                      │
│ No learning system can override these limits.                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Parameter Authority Precedence Rules

| Stage | Parameter Type | Precedence (Highest → Lowest) |
|-------|----------------|-------------------------------|
| Scoring | FinalScore coefficients | `score-weights.config.ts` (only source) |
| Scoring | regimeWeight | Live telemetry > Canonical baseline |
| Scoring | governanceMultiplier | `strategy-governance.ts` (only source) |
| Filtering | Threshold constants | `system-guards.ts` (only source) |
| Sizing | Risk percentage | `guardrails_v2` UI > adaptive delta |
| Sizing | Portfolio balance | `portfolio_state` (only source) |
| Execution | Hard limits | `guardrails_v2` UI (only source, no override) |

### 6.3 Key Authority Answers

**Q: Which weights were in force during scoring?**
A: Canonical weights from `score-weights.config.ts`. Telemetry modifies `regimeWeight` dynamically. ML calibration recommendations are LOGGED but NOT applied to runtime scoring.

**Q: Can adaptive learning override guardrails?**
A: NO. Guardrails from `guardrails_v2` are absolute authority. Adaptive guardrails can only REDUCE risk (not increase it).

**Q: Does LATTi affect trade execution?**
A: NO. LATTi only modifies DHMA strategy parameters in `strategy_param_schema`. It does not touch scoring, filtering, or execution.

**Q: Where do governance blocks come from?**
A: From `strategy-governance.ts` (static profiles) combined with `regime-stability.ts` (runtime classification). Blocks are hard exclusions before scoring.

**Q: Are ML calibration recommendations applied?**
A: NOT CURRENTLY. They are logged to `logs/predictive_adjustments/` but not persisted to canonical weights by default. This is the "gap" identified in this audit.

### 6.4 Authoritative Resolution Trace (Code Evidence)

| Parameter | Source File | Consumer File | Line(s) | Transform | Runtime Override |
|-----------|-------------|---------------|---------|-----------|------------------|
| SCORE_WEIGHTS.FINAL_SCORE | `server/config/score-weights.config.ts:25-30` | `server/core/utils/score-calculator.ts:42` | `const W = SCORE_WEIGHTS.FINAL_SCORE` | None | NO |
| hybridScore | Signal Orchestrator | `score-calculator.ts:49-53` | `hybridScore * W.HYBRID` | Direct multiply | NO |
| regimeWeight | `telemetry-aggregator.ts` | `score-calculator.ts:52` | `regimeWeight * W.REGIME` | Live telemetry | YES (telemetry) |
| decayPenalty | `score-calculator.ts` (computed) | `score-calculator.ts:53` | `decayPenalty * W.DECAY` | Subtracted | NO |
| influenceMultiplier | `strategy-governance.ts` | `governance-engine.ts` | Post-scoring | Multiplied | NO |
| portfolioRiskPerTradePct | `guardrails_v2` table | `guardrail-settings.ts` | Per-trade | Direct read | UI only |

**FinalScore Calculation (Lines 41-62 of `score-calculator.ts`):**
```typescript
export function calculateFinalScore(metrics: SignalMetrics): number {
  const W = SCORE_WEIGHTS.FINAL_SCORE;  // <-- Canonical source (immutable)
  
  const hybridScore = metrics.hybridScore ?? metrics.confidence ?? 0.5;
  const confidence = metrics.confidence ?? 0.5;
  const regimeWeight = metrics.regimeWeight ?? 0.5;  // <-- Telemetry override possible
  const decayPenalty = metrics.decayPenalty ?? 0;
  
  const finalScore = 
    hybridScore * W.HYBRID +      // W.HYBRID = 0.4 (canonical)
    confidence * W.CONFIDENCE +   // W.CONFIDENCE = 0.3 (canonical)
    regimeWeight * W.REGIME -     // W.REGIME = 0.2, regimeWeight from telemetry
    decayPenalty * W.DECAY;       // W.DECAY = 0.1 (canonical)
  
  return Math.max(0, Math.min(1, finalScore));
}
```

**Verified Authority Chain:**
1. `SCORE_WEIGHTS` is imported from `score-weights.config.ts` (immutable at runtime)
2. `regimeWeight` can be overridden by telemetry but uses fallback 0.5 if missing
3. No adaptive learning weights are injected into this calculation
4. Governance multipliers are applied POST-scoring, not during FinalScore calculation

---

## 7. Summary

### Key Findings

1. **Baseline Authority Files**: `score-weights.config.ts`, `system-guards.ts`, `strategy-governance.ts`, `canonical-regime-strategy-map.ts`, `phase9_predictive-learning.json`

2. **Delta Application Files**: `ml-calibration.ts`, `cognitive-weight-adjuster.ts`, `signal-weight-optimizer.ts`, `adaptive-guardrails.ts`, `continuous-learning.ts`

3. **LATTi Status**: Confirmed isolated - only touches DHMA parameters, does not interact with scoring, filters, or execution

4. **Critical Conflict**: ML calibration recommendations are logged but NOT persisted to canonical weights

5. **Snap-Back Root Cause**: Recalibration overwrites canonical weights without chaining from prior values; sparse telemetry causes default reversion

### Recommendations for Phase 11.8B

1. Establish `phase9_predictive-learning.json` as **immutable baseline**
2. Create delta layer for learning-derived adjustments
3. Implement chaining: `effectiveWeight = baseline + Σ(deltas)`
4. Add staleness checks to prevent overwrites from outdated telemetry
5. Surface governance multipliers in UI for transparency

---

**Audit Complete. No runtime behavior was modified.**
