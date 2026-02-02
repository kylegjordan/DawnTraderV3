# Phase 11.8B — Adaptive Risk Advisor & Goals Preset Audit

**Directive**: 11.8B (READ-ONLY AUDIT)  
**Date**: 2026-02-02  
**Status**: COMPLETE  
**Schema Version**: audit/v1.0  

---

## Objective

Produce a complete, verifiable audit of the Adaptive Risk Advisor (ARA) and Goals Preset functionality including:
- All controls and their purposes
- Data flow and connectivity
- UI components and backend services
- Database schemas and persistence
- Learning engine integration

---

## 1. Goals Tab Architecture Overview

### 1.1 Page Structure

**File**: `client/src/pages/goals-engine.tsx`

The Goals Engine page contains 8 tabs:

| Tab Name | Component | Icon | Purpose |
|----------|-----------|------|---------|
| Goals | `GoalsEngineTab` + `AdaptiveRiskAdvisor` + `PresetsGrid` | Target | Main goals view with presets and projections |
| Guardrails | `CoreFourGuardrails` + `LowPricedProtectionCard` | Shield | Risk limit controls |
| Screeners | `FiltersWithOverride` | Filter | Pair filtering settings |
| Strategies | `StrategiesTab` | Layers | Strategy configuration |
| Diagnostics | `DiagnosticsTab` | Activity | System diagnostics |
| Coherency | `CoherencyRulesTab` | CheckSquare | Rule validation status |
| Purpose | `WalterPurposeTab` | Lightbulb | AI assistant purpose |
| Tuning | `TuningTab` | Settings | Advanced tuning |

### 1.2 Goals Tab Component Hierarchy

```
GoalsEnginePage
├── ModeBanner
├── Tabs
│   └── TabsContent[value="goals"]
│       ├── AdaptiveRiskAdvisor    ← ML-powered risk recommendations
│       ├── PresetsGrid            ← Preset selection cards
│       └── GoalsEngineTab         ← Portfolio projections
```

---

## 2. Goals Presets System

### 2.1 Database Schema

**File**: `shared/schema.ts` (Lines 368-392)

```typescript
export const goalsPresets = pgTable("goals_presets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: tradingModeEnum("mode").notNull(),
  name: goalsPresetNameEnum("name").notNull(),
  
  // Guardrail values for this preset
  portfolioRiskPerTradePct: decimal("portfolio_risk_per_trade_pct"),
  dailyLossKillSwitchPct: decimal("daily_loss_kill_switch_pct"),
  symbolCooldownMinutes: integer("symbol_cooldown_minutes"),
  maxOpenPositions: integer("max_open_positions"),
  
  // Goals values
  tradesPerDayEst: decimal("trades_per_day_est"),
  targetDailyAvgEarningPct: decimal("target_daily_avg_earning_pct"),
  
  // Status
  isActive: boolean("is_active").default(false),
  lastAdjustedAt: timestamp("last_adjusted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### 2.2 Preset Types

| Preset Name | Risk Profile | Description |
|-------------|--------------|-------------|
| `conservative` | Lowest | Minimal exposure, tight controls |
| `baseline` | Balanced | Suitable for most conditions |
| `optimistic` | Elevated | Increased tolerance for favorable markets |
| `maximum` | Highest | Maximum risk for experienced traders |
| `custom` | User-defined | Manual control, not auto-adjusted |

### 2.3 Preset Controls

**File**: `client/src/components/goals/presets-grid.tsx`

| Control | Type | API Endpoint | Method |
|---------|------|--------------|--------|
| Fetch presets | Query | `/api/goals-presets?mode={mode}` | GET |
| Select preset | Mutation | `/api/goals-presets/select` | PUT |
| Fetch active | Query | `/api/goals-presets/active?mode={mode}` | GET |

### 2.4 Preset Parameters

| Parameter | Type | Description | Range |
|-----------|------|-------------|-------|
| `portfolioRiskPerTradePct` | decimal | Risk % per trade | 0.5-5.0% |
| `dailyLossKillSwitchPct` | decimal | Daily loss limit | 2-20% |
| `symbolCooldownMinutes` | integer | Cooldown per symbol | 5-90 min |
| `maxOpenPositions` | integer | Max concurrent trades | 1-20 |
| `tradesPerDayEst` | decimal | Target trades/day | 1-50 |
| `targetDailyAvgEarningPct` | decimal | Daily profit target | 0.1-2.0% |

---

## 3. Goals Learning Engine

### 3.1 Purpose

**File**: `server/services/goals-learning-engine.ts`

The Goals Learning Engine automatically adjusts preset boundaries based on historical performance:
- Expands preset ranges by 5% when performance reaches 80% of target ceiling
- Enforces global safety caps to prevent excessive risk expansion
- Excludes `custom` preset from automatic adjustments

### 3.2 Safety Caps

```typescript
const SAFETY_CAPS = {
  MAX_PORTFOLIO_RISK_PER_TRADE_PCT: 5.0,   // Maximum 5% per trade
  MAX_DAILY_LOSS_KILL_SWITCH_PCT: 20.0,    // Maximum 20% daily loss
  MAX_SYMBOL_COOLDOWN_MINUTES: 90,         // Maximum 90 min cooldown
  MAX_OPEN_POSITIONS: 20                   // Maximum 20 positions
};
```

### 3.3 Learning Trigger

**Threshold**: Performance must reach 80% of target (`PERFORMANCE_THRESHOLD_MULTIPLIER = 0.8`)

**Expansion Rate**: 5% increase (`EXPANSION_RATE = 1.05`)

### 3.4 Learning Metrics

**Table**: `goals_learning_metrics`

| Metric | Description |
|--------|-------------|
| `avg_daily_return_30d` | 30-day average daily return |
| `avg_risk_per_trade_30d` | 30-day average risk per trade |
| `avg_drawdown_30d` | 30-day average drawdown |
| `total_trades_30d` | Total trades in 30-day window |

### 3.5 Learning Engine Workflow

```
┌─────────────────────────────────────────────────────────┐
│ 1. Fetch 30-day performance metrics from DB             │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ 2. For each managed preset (not 'custom'):              │
│    - Calculate performanceRatio = actual / target       │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ 3. If performanceRatio >= 0.8:                          │
│    - Expand preset boundaries by 5%                     │
│    - Respect SAFETY_CAPS limits                         │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Broadcast 'goals.learning.completed' event           │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Adaptive Risk Advisor (ARA)

### 4.1 Purpose

**File**: `server/routes/ara.ts`

The ARA provides ML-powered risk and exposure recommendations based on:
- VTS (Virtual Trade Simulator) learning parameters
- DCE (Decision Confidence Engine) context stability
- Historical trade calibration data
- Strategy-specific performance metrics

### 4.2 ARA API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ara/calculate` | GET | Calculate risk metrics and projections |
| `/api/ara/suggestions` | GET | Get adaptive risk/exposure suggestions |
| `/api/ara/apply` | POST | Apply suggested settings |
| `/api/ara/retrain` | POST | Trigger model retraining (SSE) |
| `/api/ara/calibration` | GET | Get calibration coefficients |
| `/api/ara/drift-status` | GET | Get strategy drift status |
| `/api/ara/dce-status` | GET | Get Decision Confidence Engine status |
| `/api/ara/maco-status` | GET | Get Multi-Agent Cooperative Optimizer status |

### 4.3 ARA Calculation Output

**Interface**: `ARACalculation`

| Field | Type | Description |
|-------|------|-------------|
| `portfolioValue` | number | Current portfolio value |
| `riskPerTrade` | number | Current risk % per trade |
| `maxExposure` | number | Maximum portfolio exposure |
| `suggestedRisk` | number | ML-suggested risk % |
| `suggestedExposure` | number | ML-suggested exposure % |
| `numTrades` | number | Estimated trades (exposure / risk) |
| `avgValuePerTrade` | number | Average $ value per trade |
| `estimatedGrossProfit` | number | Projected gross profit |
| `estimatedNetProfit` | number | Projected net profit (after fees) |
| `expectedProfitPercent` | number | Expected profit % |
| `mlExpectedProfit` | number | ML model profit prediction |
| `confidenceLevel` | number | ML confidence (0-1) |
| `rawProfitRate` | number | Uncalibrated profit rate |
| `calibratedProfitRate` | number | Calibrated profit rate |
| `strategyWeight` | number | Strategy reliability weight (Wₛ) |
| `exposureMultiplier` | number | Exposure bias multiplier (Eₛ) |
| `adjustedRiskPerTrade` | number | Rbase × Eₛ |

### 4.4 Adaptive Suggestion Formulas

**File**: `server/routes/ara.ts` (Lines 147-194)

**Risk Formula** (Directive 8.8.4-M3B):
```
suggestedRisk = baseRisk + (learningRate × 5)
```
Where:
- `baseRisk`: 1.5% (live) or 2.5% (paper)
- `learningRate`: VTS learning rate parameter

**Exposure Formula** (Directive 8.8.4-M3B):
```
suggestedExposure = baseExposure + (volatilityIndex × 40)
```
Where:
- `baseExposure`: 15% (live) or 25% (paper)
- `volatilityIndex`: DCE context stability volatility index

### 4.5 ARA UI Component

**File**: `client/src/components/goals/adaptive-risk-advisor.tsx` (1599 lines)

**Features**:
- Portfolio value display
- Current vs suggested risk/exposure comparison
- Confidence level indicator
- Calibration status display
- Drift detection status
- Strategy weight visualization
- Retrain button with progress streaming
- Apply suggestions button

### 4.6 ARA Calibration System

**Calibration Coefficients**:
- `alpha`: Profit rate scaling factor
- `beta`: Baseline profit offset
- `sampleCount`: Number of trades used for calibration
- `rSquared`: Regression fit quality

**Calibration Formula**:
```
calibratedProfitRate = applyCalibration(rawProfitRate, calibration)
```

**Minimum Sample Requirement**: 10 trades (`MIN_SAMPLE_COUNT = 10`)

### 4.7 Strategy-Specific Calibration

ARA supports per-strategy calibration:
- Fetches strategy-specific alpha/beta if available
- Falls back to global calibration if insufficient samples
- Logs calibration source for transparency

---

## 5. Adaptive Goals Weight System

### 5.1 Purpose

**File**: `server/core/metrics/adaptive-goals-weight.ts`

Provides volatility-sensitive weighting for the Goals Engine:
- Caps total ML contribution at 40% to prevent AI confidence dominance
- Reduces ML reliance in high-volatility conditions
- Redistributes reduced ML weight to hybrid and regime weights

### 5.2 Weight Formula

```
aiWeight = min(baseWeight × (1 - volatilityFactor), AI_WEIGHT_CAP)
```

Where:
- `baseWeight`: Configured ML confidence weight from SCORE_WEIGHTS
- `volatilityFactor`: Market volatility 0-1 (higher = more volatile)
- `AI_WEIGHT_CAP`: 0.40 (40% maximum)

### 5.3 Weight Redistribution

When ML weight is reduced:
- 60% of reduction → Hybrid weight
- 40% of reduction → Regime weight

**Normalization**: Positive weights normalized to sum to 1.0

---

## 6. Projected Portfolio Growth

### 6.1 Purpose

**File**: `client/src/components/goals/goals-engine-tab.tsx`

Displays compound growth projections based on active preset's daily target.

### 6.2 Projection Periods

| Period | Days |
|--------|------|
| Tomorrow | 1 |
| 1 Week | 7 |
| 1 Month | 30 |
| 3 Months | 90 |
| 6 Months | 180 |
| 1 Year | 365 |

### 6.3 Projection Formula

```
projectedBalance = portfolioBalance × (1 + dailyRate)^days
```

Where `dailyRate = targetDailyAvgEarningPct / 100`

---

## 7. Target Daily Goals

### 7.1 Purpose

**File**: `client/src/components/goals/target-daily-goals.tsx` (572 lines)

Allows users to view and modify their daily earnings target percentage.

### 7.2 Validation Rules

| Status | Condition | Action |
|--------|-----------|--------|
| OK | Target within safe limits | Allow save |
| WARN | Target approaching limits | Show warning, allow override |
| BLOCK | Target exceeds safety limits | Prevent save |

### 7.3 LATTI Integration

The component fetches LATTI (Learning-Assisted Trading Target Intelligence) targets:
- Current trading pace
- Risk per trade limit
- Calculated earnings per trade
- Daily profit projections

---

## 8. Data Flow & Connectivity

### 8.1 Frontend → Backend Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                     │
├─────────────────────────────────────────────────────────────────────┤
│ AdaptiveRiskAdvisor    PresetsGrid    GoalsEngineTab                │
│         │                   │               │                        │
│         ↓                   ↓               ↓                        │
│    /api/ara/*     /api/goals-presets/*   /api/goals-presets/active  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND                                      │
├─────────────────────────────────────────────────────────────────────┤
│ server/routes/ara.ts    server/routes.ts (goals-presets routes)     │
│         │                         │                                  │
│         ↓                         ↓                                  │
│    VTS Service         storage.getGoalsPresets()                    │
│    DCE Engine          storage.selectGoalsPreset()                  │
│    ML Service                     │                                  │
│         │                         ↓                                  │
│         └────────────→ PostgreSQL (goals_presets table)             │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 ARA Data Sources

| Source | Data Provided |
|--------|---------------|
| VTS Service | `learningRate`, `lastAdaptiveUpdate` |
| DCE Engine | `volatilityIndex`, `contextStability` |
| ML Service | Profit predictions, confidence levels |
| Calibration | `alpha`, `beta`, `sampleCount` |
| Strategy Weights | Per-strategy reliability weights |
| Exposure Bias | Per-strategy exposure multipliers |

### 8.3 Goals Preset → Guardrails Flow

When a preset is selected:
1. `selectGoalsPreset()` called in storage
2. Preset values copied to `guardrails_v2` table
3. Both `goals_presets` and `guardrails_v2` queries invalidated
4. UI refreshes to show new values

---

## 9. File Index

### 9.1 Frontend Components

| File Path | Responsibility |
|-----------|----------------|
| `client/src/pages/goals-engine.tsx` | Main Goals page with tabs |
| `client/src/components/goals/adaptive-risk-advisor.tsx` | ARA UI component |
| `client/src/components/goals/presets-grid.tsx` | Preset selection cards |
| `client/src/components/goals/goals-engine-tab.tsx` | Portfolio projections |
| `client/src/components/goals/target-daily-goals.tsx` | Daily target editor |
| `client/src/components/goals/core-four-guardrails.tsx` | Core guardrail controls |
| `client/src/components/goals/coherency-status-widget.tsx` | Coherency indicator |
| `client/src/components/goals/guardrails-tab.tsx` | Guardrails tab |
| `client/src/components/goals/strategies-tab.tsx` | Strategies tab |
| `client/src/components/goals/diagnostics-tab.tsx` | Diagnostics tab |
| `client/src/components/goals/tuning-tab.tsx` | Tuning tab |

### 9.2 Backend Services

| File Path | Responsibility |
|-----------|----------------|
| `server/routes/ara.ts` | ARA API endpoints |
| `server/services/goals-learning-engine.ts` | Adaptive preset learning |
| `server/core/metrics/adaptive-goals-weight.ts` | Volatility-sensitive weights |
| `server/storage.ts` | Preset CRUD operations |
| `server/services/vts-service.ts` | VTS learning parameters |
| `server/services/decision-confidence-engine.ts` | DCE context stability |
| `server/utils/calibration.ts` | Calibration loading/applying |
| `server/utils/strategyWeights.ts` | Strategy weight computation |
| `server/utils/strategyBias.ts` | Exposure bias computation |

### 9.3 Database Tables

| Table | Purpose |
|-------|---------|
| `goals_presets` | Preset configurations |
| `goals_learning_metrics` | 30-day performance metrics |
| `guardrails_v2` | Active risk limits |
| `portfolio_state` | Current portfolio value |

---

## 10. Control Summary

### 10.1 User-Controllable Settings

| Control | Location | Persistence |
|---------|----------|-------------|
| Preset selection | Goals tab → PresetsGrid | `goals_presets.isActive` |
| Target daily % | Goals tab → TargetDailyGoals | `goals_presets.targetDailyAvgEarningPct` |
| Risk per trade | Guardrails tab | `guardrails_v2.portfolioRiskPerTradePct` |
| Daily loss limit | Guardrails tab | `guardrails_v2.dailyLossKillSwitchPct` |
| Max positions | Guardrails tab | `guardrails_v2.maxOpenPositions` |
| Symbol cooldown | Guardrails tab | `guardrails_v2.symbolCooldownMinutes` |

### 10.2 System-Controlled Settings

| Control | Controller | Trigger |
|---------|------------|---------|
| Preset boundary expansion | GoalsLearningEngine | 80% performance threshold |
| Suggested risk % | ARA (VTS-derived) | Per calculation request |
| Suggested exposure % | ARA (DCE-derived) | Per calculation request |
| ML weight cap | AdaptiveGoalsWeight | Volatility conditions |

### 10.3 Read-Only Displays

| Display | Source | Update Frequency |
|---------|--------|------------------|
| Portfolio projections | Calculated from preset + balance | Per preset change |
| Calibration status | Calibration cache | 60-second TTL |
| Strategy weights | strategyWeights utility | Per ARA calculation |
| Drift status | Drift detection service | On demand |

---

## 11. Summary

### Key Components

1. **Goals Presets**: 5 predefined risk profiles (conservative → maximum) plus custom
2. **Adaptive Risk Advisor (ARA)**: ML-powered suggestions from VTS/DCE
3. **Goals Learning Engine**: Automatic preset expansion based on performance
4. **Adaptive Goals Weight**: Volatility-sensitive ML weight capping
5. **Portfolio Projections**: Compound growth visualization

### Safety Mechanisms

- **Safety Caps**: Hard limits on all expandable parameters
- **AI Weight Cap**: 40% maximum ML contribution
- **Minimum Sample Count**: 10 trades before calibration applies
- **Validation Rules**: WARN/BLOCK on unsafe targets
- **Custom Preset Exclusion**: No automatic adjustments to user-defined preset

### Authority Chain

1. **User Authority**: Preset selection, target setting, guardrail overrides
2. **Learning Authority**: Preset boundary expansion (within safety caps)
3. **ARA Authority**: Suggestions only (requires user approval to apply)
4. **Weight Authority**: Canonical SCORE_WEIGHTS, adjusted by volatility

---

**Audit Complete. No runtime behavior was modified.**
