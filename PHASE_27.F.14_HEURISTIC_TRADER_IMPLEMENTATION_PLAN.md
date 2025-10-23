# Phase 27.F.14 - Local Heuristic Trader Service Implementation Plan
**Walter Stand-In: Offline Self-Optimizing Trading System**

**Date**: October 23, 2025  
**Status**: 📋 PLAN - Ready for Review  
**Priority**: HIGH - Addresses OpenAI API quota instability

---

## Executive Summary

This plan outlines the implementation of a **Local Heuristic Trader Service** to replace Walter's trading adjustment functionality while Walter is temporarily disabled due to OpenAI API rate-limit issues. The service will operate entirely offline using rule-based heuristics and portfolio performance metrics to autonomously adjust guardrails, strategies, and filter parameters.

**Core Objective**: Maintain autonomous trading adaptability without external API dependencies.

**Expected Outcome**: A self-optimizing, offline trading system ready for Paper Trading and Live Trading deployment.

---

## Problem Statement

### Current State
- Walter (OpenAI GPT-4o orchestrator) handles dynamic trading adjustments
- Walter is experiencing API quota exhaustion (429 errors)
- Trading system loses adaptability when Walter is offline
- No fallback mechanism for autonomous parameter optimization

### Impact
```
[OpenAIRateLimiter] ⛔ CIRCUIT BREAKER OPENED - OpenAI requests suspended for 5 minutes
Error: OpenAI API quota exhausted. AI features temporarily unavailable.
```

### Requirements
1. ✅ **Offline Operation**: Zero external API dependencies
2. ✅ **Autonomous Adjustments**: Self-tune based on portfolio performance
3. ✅ **Mode Support**: Paper Trading now, Live Trading ready
4. ✅ **Seamless Integration**: Drop-in replacement for Walter's trading functions
5. ✅ **Validation**: Comprehensive testing before production use

---

## Architecture Overview

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│         Local Heuristic Trader Service (LHTS)               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Metrics    │  │  Heuristic   │  │  Adjustment  │      │
│  │  Collector   │──│   Engine     │──│   Executor   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                 │                  │               │
│         │                 │                  │               │
│  ┌──────▼─────────────────▼──────────────────▼─────┐       │
│  │         Heuristic Rules Database                 │       │
│  │  (thresholds, bounds, adjustment algorithms)     │       │
│  └──────────────────────────────────────────────────┘       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐
│ Portfolio       │  │ Trading          │  │ Config Update   │
│ Metrics         │  │ State            │  │ Service         │
└─────────────────┘  └──────────────────┘  └─────────────────┘
```

### Service Components

| Component | Responsibility | Inputs | Outputs |
|-----------|---------------|--------|---------|
| **MetricsCollector** | Gather portfolio KPIs | Trades, positions, balances | Performance snapshot |
| **HeuristicEngine** | Evaluate rules & make decisions | Metrics + rules | Adjustment recommendations |
| **AdjustmentExecutor** | Apply parameter changes | Recommendations | Updated configs |
| **HealthMonitor** | Track service performance | Execution logs | Health metrics |

---

## Core Functionality

### 1. Metrics Collector

**Purpose**: Aggregate portfolio performance data for decision-making.

**Collected Metrics**:
```typescript
interface PortfolioMetrics {
  // Performance Metrics
  winRate: number;              // % of winning trades
  lossRate: number;             // % of losing trades
  profitFactor: number;         // Gross profit / Gross loss
  
  // Risk Metrics
  currentDrawdown: number;      // Current equity drawdown %
  maxDrawdown: number;          // Maximum drawdown in period
  dailyLoss24h: number;         // Loss in last 24 hours %
  
  // Exposure Metrics
  totalExposure: number;        // Total capital at risk
  exposurePercent: number;      // % of portfolio at risk
  openPositions: number;        // Number of active trades
  
  // Strategy Performance
  strategyWinRates: Map<string, number>;  // Per-strategy win rates
  strategyProfitFactors: Map<string, number>;
  
  // Time-based
  tradesLast24h: number;
  tradesLast7d: number;
  avgHoldingPeriod: number;     // In minutes
}
```

**Data Sources**:
- `RiskManager.calculate24hPL()` - Daily P/L tracking
- `RiskManager.calculateWinRate()` - Win/loss statistics
- `storage.getTrades()` - Historical trade data
- `storage.getPaperSimOpenPositions()` - Current positions
- `storage.getPortfolioState()` - Balance and equity

**Update Frequency**: Every 5 minutes (configurable)

---

### 2. Heuristic Engine

**Purpose**: Apply rule-based logic to determine parameter adjustments.

#### Rule Categories

##### A. Performance-Based Rules

**Rule 1: Win Rate Adjustment**
```typescript
if (winRate < 40%) {
  // Tighten risk - reduce position sizes
  adjustGuardrail('riskPerTrade', -10%);
  adjustGuardrail('maxPositionSize', -15%);
  
} else if (winRate > 60%) {
  // Increase risk - capture more profit
  adjustGuardrail('riskPerTrade', +5%);
  adjustGuardrail('maxPositionSize', +10%);
}
```

**Rule 2: Drawdown Protection**
```typescript
if (currentDrawdown > 5%) {
  // Emergency tightening
  adjustGuardrail('maxDailyLoss', -20%);
  adjustGuardrail('maxOpenPositions', -1);
  disableStrategy('high_risk_strategies');
  
} else if (currentDrawdown < 2% && winRate > 55%) {
  // Gradual loosening
  adjustGuardrail('maxDailyLoss', +5%);
}
```

**Rule 3: Profit Factor Optimization**
```typescript
if (profitFactor < 1.2) {
  // Reduce trading frequency
  adjustFilter('minVolume', +10%);
  adjustFilter('minDailyRange', +5%);
  
} else if (profitFactor > 1.8) {
  // Increase trading opportunities
  adjustFilter('minVolume', -5%);
  adjustFilter('minDailyRange', -3%);
}
```

##### B. Exposure Management Rules

**Rule 4: Position Limit Adjustment**
```typescript
if (exposurePercent > 30%) {
  // Too much capital at risk
  adjustGuardrail('maxOpenPositions', -1);
  adjustGuardrail('maxExposurePercent', -5%);
  
} else if (exposurePercent < 15% && winRate > 55%) {
  // Underutilized capital
  adjustGuardrail('maxOpenPositions', +1);
}
```

**Rule 5: Daily Loss Protection**
```typescript
if (dailyLoss24h > 3%) {
  // Approaching kill switch threshold
  adjustGuardrail('maxDailyLoss', -25%);
  pauseTradingFor(4 hours);
  
} else if (dailyLoss24h > 5%) {
  // Critical - emergency stop
  triggerEmergencyStop();
}
```

##### C. Strategy-Specific Rules

**Rule 6: Strategy Win Rate Tuning**
```typescript
for (const [strategyName, winRate] of strategyWinRates) {
  if (winRate < 35% && trades > 10) {
    // Disable underperforming strategy
    disableStrategy(strategyName);
    
  } else if (winRate > 65% && trades > 10) {
    // Increase allocation to winning strategy
    increaseStrategyWeight(strategyName, +10%);
  }
}
```

**Rule 7: Volume Filter Calibration**
```typescript
if (tradesLast24h < 2) {
  // Too restrictive filters
  adjustFilter('minVolume', -10%);
  adjustFilter('minDailyRange', -5%);
  
} else if (tradesLast24h > 10) {
  // Too many trades - quality over quantity
  adjustFilter('minVolume', +10%);
}
```

#### Rule Execution Logic

```typescript
interface HeuristicRule {
  id: string;
  category: 'performance' | 'risk' | 'exposure' | 'strategy';
  condition: (metrics: PortfolioMetrics) => boolean;
  action: (metrics: PortfolioMetrics) => AdjustmentRecommendation[];
  cooldown: number; // Minutes before rule can fire again
  priority: number; // Higher = execute first
}

interface AdjustmentRecommendation {
  type: 'guardrail' | 'filter' | 'strategy';
  parameter: string;
  currentValue: number;
  recommendedValue: number;
  reason: string;
  confidence: number; // 0-100
}
```

**Execution Order**:
1. Safety rules (drawdown, daily loss) - **HIGHEST PRIORITY**
2. Risk management rules (exposure, position limits)
3. Performance optimization rules (win rate, profit factor)
4. Strategy-specific rules (allocation, enable/disable)

**Safeguards**:
- **Cooldown periods**: Prevent over-adjustment (min 30 minutes between changes)
- **Bounds checking**: Never adjust beyond safe limits (±30% max per adjustment)
- **Change limits**: Max 3 adjustments per hour
- **Rollback capability**: Store previous values for 24 hours

---

### 3. Adjustment Executor

**Purpose**: Apply approved adjustments to database configuration.

**Execution Flow**:
```
1. Validate adjustment (bounds check, type validation)
2. Load current configuration (guardrails, filters, strategies)
3. Calculate new values (apply percentage changes)
4. Update database via ConfigUpdateService
5. Log adjustment with reason and metrics
6. Broadcast update via WebSocket (trading_config_changed)
7. Update cooldown timer for rule
```

**Integration Points**:
- `ConfigUpdateService.updateGuardrails()` - Risk parameter updates
- `ConfigUpdateService.updateScreenerFilters()` - Filter adjustments
- `storage.updateStrategyEnabled()` - Strategy enable/disable
- `contextBridge.broadcast()` - Real-time UI updates

**Audit Trail**:
```typescript
interface AdjustmentLog {
  id: string;
  timestamp: Date;
  mode: 'live' | 'paper';
  ruleId: string;
  parameter: string;
  oldValue: number;
  newValue: number;
  changePercent: number;
  triggerMetrics: PortfolioMetrics;
  reason: string;
  executionTimeMs: number;
}
```

---

## Data Flow Architecture

### Continuous Monitoring Loop

```
┌─────────────────────────────────────────────────────────┐
│         LHTS Main Loop (Every 5 minutes)                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ 1. Collect Metrics                                      │
│    - Fetch trades, positions, balances                  │
│    - Calculate win rate, drawdown, exposure            │
│    - Calculate per-strategy performance                │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Evaluate Heuristic Rules                            │
│    - Check safety rules first (drawdown, daily loss)    │
│    - Check risk rules (exposure, position limits)       │
│    - Check optimization rules (win rate, profit factor) │
│    - Apply cooldown and priority filtering              │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Generate Recommendations                            │
│    - Calculate new parameter values                     │
│    - Validate bounds (±30% max change)                  │
│    - Prioritize by safety/impact                        │
│    - Log decision rationale                             │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Execute Adjustments                                 │
│    - Update guardrails database                         │
│    - Update screener filters database                   │
│    - Enable/disable strategies                          │
│    - Broadcast config changes via WebSocket             │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Record Audit Trail                                  │
│    - Log adjustment with metrics snapshot               │
│    - Update rule cooldown timers                        │
│    - Store rollback data (24h retention)                │
└─────────────────────────────────────────────────────────┘
```

---

## Database Schema

### New Table: `heuristic_adjustments`

```sql
CREATE TABLE heuristic_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode trading_mode NOT NULL,
  rule_id VARCHAR(100) NOT NULL,
  parameter_type VARCHAR(50) NOT NULL,  -- 'guardrail', 'filter', 'strategy'
  parameter_name VARCHAR(100) NOT NULL,
  old_value DECIMAL(20, 8),
  new_value DECIMAL(20, 8),
  change_percent DECIMAL(10, 2),
  trigger_metrics JSONB NOT NULL,       -- Portfolio metrics at time of adjustment
  reason TEXT NOT NULL,
  execution_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_mode_created (mode, created_at),
  INDEX idx_rule_id (rule_id)
);
```

### New Table: `heuristic_rules`

```sql
CREATE TABLE heuristic_rules (
  id VARCHAR(100) PRIMARY KEY,
  category VARCHAR(50) NOT NULL,        -- 'performance', 'risk', 'exposure', 'strategy'
  description TEXT NOT NULL,
  condition_code TEXT NOT NULL,         -- JavaScript condition expression
  action_code TEXT NOT NULL,            -- JavaScript action function
  cooldown_minutes INTEGER DEFAULT 30,
  priority INTEGER DEFAULT 50,
  enabled BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Extend: `system_context` (Add LHTS state)

```sql
ALTER TABLE system_context ADD COLUMN lhts_enabled BOOLEAN DEFAULT false;
ALTER TABLE system_context ADD COLUMN lhts_last_run TIMESTAMP;
ALTER TABLE system_context ADD COLUMN lhts_adjustments_count INTEGER DEFAULT 0;
```

---

## Implementation Phases

### Phase 1: Core Service Infrastructure (Day 1)
**Goal**: Build foundational service architecture.

**Tasks**:
1. ✅ Create `server/services/heuristic-trader.ts`
2. ✅ Implement MetricsCollector class
3. ✅ Implement HeuristicEngine class (rule loader + evaluator)
4. ✅ Implement AdjustmentExecutor class
5. ✅ Create database migrations for new tables
6. ✅ Add service initialization to `server/index.ts`

**Deliverables**:
- `heuristic-trader.ts` (350+ lines)
- Database schema files
- Service lifecycle management (start/stop)

**Validation**: Service starts without errors, loads empty rule set.

---

### Phase 2: Heuristic Rules Implementation (Day 2)
**Goal**: Implement core decision-making rules.

**Tasks**:
1. ✅ Implement 7 core heuristic rules (Rules 1-7)
2. ✅ Create rule registration system
3. ✅ Add bounds validation logic
4. ✅ Implement cooldown tracking
5. ✅ Add priority-based execution ordering
6. ✅ Seed initial rules into `heuristic_rules` table

**Deliverables**:
- Rule definitions in database
- Execution engine with safeguards
- Rule validation tests

**Validation**: Rules execute in correct order, respect cooldowns, apply bounds.

---

### Phase 3: Integration with Trading System (Day 3)
**Goal**: Connect LHTS to existing trading infrastructure.

**Tasks**:
1. ✅ Integrate with `ConfigUpdateService` for guardrail updates
2. ✅ Integrate with `storage` for filter updates
3. ✅ Add WebSocket broadcasts for config changes
4. ✅ Create audit logging for all adjustments
5. ✅ Add health monitoring endpoint `/api/heuristic-trader/health`
6. ✅ Add manual control endpoint `/api/heuristic-trader/toggle`

**Deliverables**:
- API endpoints for LHTS control
- WebSocket integration
- Audit trail logging

**Validation**: Adjustments update database, broadcast to UI, logged correctly.

---

### Phase 4: Walter Graceful Shutdown (Day 4)
**Goal**: Disable Walter safely while preserving system stability.

**Tasks**:
1. ✅ Add feature flag `WALTER_ENABLED` to environment variables
2. ✅ Update AI orchestrator to check flag before OpenAI calls
3. ✅ Redirect Walter adjustment requests to LHTS
4. ✅ Add UI indicator showing "Local Heuristic Mode" vs "Walter AI Mode"
5. ✅ Update documentation and help text

**Deliverables**:
- Environment variable configuration
- Conditional routing logic
- UI status indicators

**Validation**: Walter disabled, no OpenAI calls, LHTS handles adjustments.

---

### Phase 5: Testing & Validation (Day 5)
**Goal**: Comprehensive testing before production deployment.

**Test Suites**:

#### A. Unit Tests
```typescript
describe('MetricsCollector', () => {
  test('calculates win rate correctly');
  test('calculates drawdown correctly');
  test('handles zero trades gracefully');
});

describe('HeuristicEngine', () => {
  test('applies drawdown rule when threshold exceeded');
  test('respects cooldown periods');
  test('executes rules in priority order');
  test('validates bounds on adjustments');
});

describe('AdjustmentExecutor', () => {
  test('updates guardrails in database');
  test('broadcasts config change events');
  test('logs audit trail');
  test('rolls back on validation failure');
});
```

#### B. Integration Tests
```typescript
describe('LHTS Integration', () => {
  test('end-to-end: poor win rate triggers risk reduction');
  test('end-to-end: high drawdown triggers emergency stop');
  test('end-to-end: multiple rules execute without conflict');
  test('respects max adjustments per hour limit');
});
```

#### C. Stress Tests
```typescript
describe('LHTS Stability', () => {
  test('handles 100 consecutive metric collections');
  test('maintains performance under 10 simultaneous users');
  test('recovers from database connection loss');
  test('handles malformed metric data gracefully');
});
```

**Acceptance Criteria**:
- ✅ All unit tests pass (100% coverage for core logic)
- ✅ Integration tests pass in paper mode
- ✅ No memory leaks over 24-hour run
- ✅ Adjustment latency < 500ms
- ✅ Zero unhandled errors in logs

---

### Phase 6: Production Deployment (Day 6)
**Goal**: Deploy to paper trading, monitor for 48 hours.

**Deployment Steps**:
1. ✅ Enable LHTS in paper mode only
2. ✅ Disable Walter (set `WALTER_ENABLED=false`)
3. ✅ Monitor adjustment frequency and quality
4. ✅ Validate portfolio performance stability
5. ✅ Collect 48 hours of operational data
6. ✅ Review adjustment logs and effectiveness

**Monitoring Metrics**:
- Adjustments per hour (target: 1-3)
- Win rate stability (target: ±5% variance)
- Drawdown protection (target: max 7% drawdown)
- System uptime (target: 99.9%)

**Success Criteria**:
- ✅ Portfolio performance maintains or improves
- ✅ No over-adjustment (max 3 changes/hour respected)
- ✅ Emergency stop triggers correctly at 5% drawdown
- ✅ Zero crashes or service interruptions

---

## Configuration

### Environment Variables

```env
# Heuristic Trader Configuration
LHTS_ENABLED=true                      # Enable/disable service
LHTS_UPDATE_INTERVAL_MINUTES=5         # Metrics collection frequency
LHTS_MAX_ADJUSTMENTS_PER_HOUR=3        # Rate limiting
LHTS_DEFAULT_COOLDOWN_MINUTES=30       # Rule cooldown period
LHTS_MAX_CHANGE_PERCENT=30             # Maximum adjustment size
LHTS_MODE=paper                        # 'paper' or 'live'

# Walter Configuration
WALTER_ENABLED=false                   # Disable Walter during LHTS operation
```

### Rule Configuration Example

```json
{
  "id": "drawdown_protection",
  "category": "risk",
  "description": "Tighten risk when drawdown exceeds 5%",
  "condition": "metrics.currentDrawdown > 5.0",
  "action": "adjustGuardrail('maxDailyLoss', -20); adjustGuardrail('maxOpenPositions', -1);",
  "cooldownMinutes": 60,
  "priority": 100,
  "enabled": true
}
```

---

## Safety Mechanisms

### 1. Bounds Validation
```typescript
function validateAdjustment(param: string, newValue: number): boolean {
  const bounds = {
    riskPerTrade: { min: 0.5, max: 5.0 },
    maxDailyLoss: { min: 2.0, max: 15.0 },
    maxPositionSize: { min: 1000, max: 10000 },
    maxOpenPositions: { min: 1, max: 10 },
    minVolume: { min: 50000, max: 5000000 },
  };
  
  const range = bounds[param];
  return newValue >= range.min && newValue <= range.max;
}
```

### 2. Rate Limiting
- Max 3 adjustments per hour per mode
- Cooldown: 30 minutes minimum between same-rule triggers
- Emergency adjustments bypass cooldown (drawdown > 5%)

### 3. Rollback System
```typescript
interface RollbackSnapshot {
  timestamp: Date;
  mode: 'live' | 'paper';
  guardrails: Guardrails;
  filters: ScreenerFilters;
  strategies: StrategyState[];
}

// Store last 24 hours of snapshots
function createRollbackSnapshot(): void;
function rollbackToTimestamp(timestamp: Date): void;
```

### 4. Manual Override
- Admin endpoint: `POST /api/heuristic-trader/pause`
- Pauses LHTS for specified duration (default 4 hours)
- Emergency stop: `POST /api/heuristic-trader/emergency-stop`

---

## Monitoring & Observability

### Health Endpoint
```typescript
GET /api/heuristic-trader/health

Response:
{
  "status": "healthy" | "degraded" | "offline",
  "enabled": boolean,
  "lastRun": ISO timestamp,
  "adjustmentsLast24h": number,
  "activeRules": number,
  "averageExecutionTimeMs": number,
  "errors": []
}
```

### Logs
```
[LHTS] 🔍 Collecting metrics for paper mode...
[LHTS] ✅ Metrics collected: winRate=52.3%, drawdown=2.1%, exposure=18.5%
[LHTS] 🎯 Evaluating 7 active rules...
[LHTS] ✨ Rule 'profit_factor_optimization' triggered (profitFactor=1.45 < 1.5)
[LHTS] 📝 Recommendation: Increase minVolume by 10% (50000 → 55000)
[LHTS] ✅ Applied adjustment: minVolume updated successfully
[LHTS] 📊 Audit logged: adjustment_id=abc123
```

### Dashboard Metrics (Optional - Phase 7)
- Real-time adjustment history chart
- Rule trigger frequency heatmap
- Performance impact analysis (before/after adjustments)
- Parameter drift visualization

---

## Transition Strategy

### From Walter to LHTS

**Week 1: Parallel Operation (Validation Phase)**
- Walter: Enabled (rate-limited)
- LHTS: Enabled (shadow mode - log only, no execution)
- Compare: Walter recommendations vs LHTS recommendations
- Validate: LHTS decisions align with trading goals

**Week 2: LHTS Primary (Pilot Phase)**
- Walter: Disabled
- LHTS: Enabled (full execution)
- Monitor: Portfolio performance, adjustment quality
- Validate: System stability, no regressions

**Week 3: Production (Deployment Phase)**
- Walter: Offline (API quota recovered, standby)
- LHTS: Primary adjustment engine
- Option: Re-enable Walter for complex decisions (manual approval only)

### Back to Walter (Future)

**Trigger Conditions**:
1. OpenAI API quota fully restored
2. Walter re-engineered with better rate-limiting
3. LHTS performance plateau or degradation observed

**Transition Steps**:
1. Set `WALTER_ENABLED=true`
2. Set `LHTS_ENABLED=false`
3. Migrate LHTS audit data to Walter context
4. Resume Walter orchestrator operations

---

## Risk Assessment

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Over-adjustment (too aggressive) | Medium | High | Implement cooldowns, bounds, rate limits |
| Under-adjustment (too conservative) | Medium | Medium | Tune rule thresholds based on backtesting |
| Rule conflicts (contradictory actions) | Low | Medium | Priority ordering, conflict detection |
| Database write failures | Low | High | Transaction rollback, retry logic |
| Service crash during adjustment | Low | High | Atomic updates, health checks |

### Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Reduced adaptability vs Walter AI | High | Medium | Comprehensive rule coverage, continuous tuning |
| Portfolio performance degradation | Low | High | 48-hour paper trading validation, rollback plan |
| Loss of "intelligent" decision-making | Medium | Medium | Rule-based logic validated against historical data |

---

## Success Metrics

### Phase 5 Validation Criteria
- ✅ **Stability**: Zero crashes over 24-hour test run
- ✅ **Performance**: Adjustment latency < 500ms
- ✅ **Accuracy**: 90%+ of adjustments improve metrics within 24h
- ✅ **Safety**: Emergency stop triggers at 5% drawdown (tested)

### Phase 6 Production Criteria (48-hour pilot)
- ✅ **Win Rate**: Maintains ≥ 50% in paper trading
- ✅ **Drawdown**: Never exceeds 7% max drawdown
- ✅ **Adjustments**: 1-3 per hour (not over-adjusting)
- ✅ **Uptime**: 99.9% service availability

### Long-term Success (30 days)
- ✅ **Performance**: Portfolio growth matches or exceeds baseline
- ✅ **Adaptability**: Responds correctly to market regime changes
- ✅ **Cost**: Zero external API costs (vs Walter's OpenAI fees)
- ✅ **Reliability**: < 0.1% error rate in adjustments

---

## Rollback Plan

### Immediate Rollback (Emergency)
**Trigger**: Portfolio loss > 10% in 24 hours OR service crash > 3 times

**Steps**:
1. Execute `POST /api/heuristic-trader/emergency-stop`
2. Restore last known good configuration from rollback snapshot
3. Disable LHTS: `LHTS_ENABLED=false`
4. Optionally re-enable Walter if API quota available
5. Manual review of all open positions
6. Root cause analysis of failure

**Recovery Time**: < 5 minutes

### Gradual Rollback (Degraded Performance)
**Trigger**: Win rate < 40% for 48 hours OR max drawdown > 6%

**Steps**:
1. Pause LHTS: `POST /api/heuristic-trader/pause?duration=8h`
2. Analyze adjustment logs and identify problematic rules
3. Disable underperforming rules
4. Re-tune rule thresholds
5. Resume LHTS with updated configuration
6. Monitor for 24 hours before full re-engagement

**Recovery Time**: 8-24 hours

---

## File Structure

```
server/services/
├── heuristic-trader.ts              # Main service (350+ lines)
├── heuristic/
│   ├── metrics-collector.ts         # Portfolio metrics aggregation
│   ├── rule-engine.ts               # Rule evaluation and execution
│   ├── adjustment-executor.ts       # Database update logic
│   ├── bounds-validator.ts          # Safety bounds checking
│   └── rollback-manager.ts          # Configuration rollback system
├── heuristic-rules/
│   ├── performance-rules.ts         # Win rate, profit factor rules
│   ├── risk-rules.ts                # Drawdown, daily loss rules
│   ├── exposure-rules.ts            # Position limits, exposure rules
│   └── strategy-rules.ts            # Strategy enable/disable rules

server/jobs/
├── heuristic-trader-scheduler.ts    # Cron job for periodic execution

shared/
├── heuristic-types.ts               # TypeScript types and interfaces

db/migrations/
├── XXX_create_heuristic_adjustments.sql
├── XXX_create_heuristic_rules.sql
└── XXX_alter_system_context_lhts.sql
```

---

## Next Steps

### Immediate Actions (Pre-Implementation)
1. **Review this plan** with stakeholders for approval
2. **Validate rule logic** against historical trading data
3. **Define success metrics** thresholds with product owner
4. **Allocate resources** (1 developer, 6 days)

### Implementation Start
1. Execute Phase 1 (Core Service Infrastructure)
2. Daily standups to track progress
3. Continuous testing at each phase
4. Documentation updates as code is written

### Post-Implementation
1. 48-hour paper trading pilot
2. Performance analysis and tuning
3. Documentation of lessons learned
4. Plan for Walter re-integration (long-term)

---

## Conclusion

The Local Heuristic Trader Service provides a robust, offline alternative to Walter's AI-driven trading adjustments. By implementing rule-based heuristics validated against portfolio performance metrics, the system maintains autonomous adaptability without external API dependencies.

**Key Advantages**:
- ✅ **Zero API Costs**: Eliminates OpenAI quota issues
- ✅ **Predictable Behavior**: Rule-based logic, not black-box AI
- ✅ **Fast Execution**: Local computation, <500ms latency
- ✅ **Safety-First**: Multiple safeguards, emergency stop, rollback

**Trade-offs**:
- ⚠️ **Less "Intelligent"**: Rule-based vs ML-driven decisions
- ⚠️ **Requires Tuning**: Rules need periodic review and optimization
- ⚠️ **Limited Scope**: Handles trading adjustments only (not conversational AI)

**Recommendation**: **APPROVED FOR IMPLEMENTATION**

This plan provides a comprehensive, production-ready solution to maintain trading system autonomy while Walter is offline. The phased approach ensures thorough validation before production deployment, minimizing risk while maximizing system reliability.

---

**Plan Status**: 📋 **READY FOR REVIEW**  
**Next Action**: Stakeholder approval → Begin Phase 1 implementation  
**Estimated Timeline**: 6 days (development) + 2 days (validation) = **8 days total**
