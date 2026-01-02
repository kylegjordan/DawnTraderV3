# Phase 8: Predictive Learning & Adaptive Risk Manager
## Comprehensive System Report

**Document Created:** January 02, 2026  
**Purpose:** Complete overview for project management handoff  
**Scope:** Phase 8 Adaptive Learning, ML Integration, and Trading Engine Connections

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Core Components](#3-core-components)
4. [Data Flow & Integration Points](#4-data-flow--integration-points)
5. [Current Operational Status](#5-current-operational-status)
6. [API Endpoints](#6-api-endpoints)
7. [File Locations](#7-file-locations)
8. [Recommendations](#8-recommendations)

---

## 1. Executive Summary

Phase 8 implemented a comprehensive **Predictive Learning and Adaptive Risk Management** system for DawnTrader. The system consists of:

- **Passive Learning Data Aggregator** - Captures signal-level metrics during both passive and active trading
- **Python ML Microservice** - Provides real-time predictions for trade promotion probability and profit forecasting
- **Virtual Trade Simulator (VTS)** - Simulates trades without real orders to generate ground-truth calibration data
- **Adaptive Risk Advisor (ARA)** - UI component displaying ML-driven risk recommendations
- **Decision Confidence Engine (DCE)** - Unified confidence scoring combining multiple metrics into a single Decision Index

### Key Achievement
The system captures learning data continuously, feeds it through ML models, and outputs predictions that blend with the Signal Orchestrator's confidence calculations—enabling adaptive, data-driven trade decisions.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PREDICTIVE LEARNING ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────┐                                                     │
│  │  FX5 Scanner        │──┐                                                  │
│  │  (30s cycles)       │  │                                                  │
│  └─────────────────────┘  │                                                  │
│                           │                                                  │
│  ┌─────────────────────┐  │     ┌─────────────────────────────────────────┐ │
│  │  Strategy Engine    │──┼────▶│  DATA AGGREGATOR (8.8.4-L1)             │ │
│  │  (Signal generation)│  │     │  • Buffered capture (30s flush)         │ │
│  └─────────────────────┘  │     │  • 15-min aggregation cycles            │ │
│                           │     │  • Daily JSON logs                       │ │
│  ┌─────────────────────┐  │     │  • Symbol/Strategy grouping             │ │
│  │  CWQI Service       │──┘     └──────────────────┬──────────────────────┘ │
│  │  (Trade quality)    │                           │                         │
│  └─────────────────────┘                           ▼                         │
│                                  ┌─────────────────────────────────────────┐ │
│                                  │  logs/data_aggregates/                  │ │
│                                  │  • passive_YYYY-MM-DD.json              │ │
│                                  │  • hourly/passive_YYYY-MM-DDTHH.json    │ │
│                                  └──────────────────┬──────────────────────┘ │
│                                                     │                         │
│                                                     ▼                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │                    PYTHON ML MICROSERVICE (Port 5001)                    ││
│  │                                                                          ││
│  │  Endpoints:                                                              ││
│  │  • POST /predict/promotion → Promotion probability (0-1)                 ││
│  │  • POST /predict/profit    → Expected profit prediction                  ││
│  │  • GET  /metrics           → Service health + resource usage             ││
│  │                                                                          ││
│  │  Managed by: BootOrchestrator (server/core/boot_orchestrator.ts)         ││
│  └──────────────────────────────────────────────────────────────────────────┘│
│                                     │                                         │
│                                     ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │                    SIGNAL ORCHESTRATOR                                   ││
│  │                    (server/services/signal-orchestrator.ts)              ││
│  │                                                                          ││
│  │  ML Integration (Directive 8.8.4-L3):                                    ││
│  │  • Fire-and-forget async calls to ML service                             ││
│  │  • Blends NGC with ML promotion probability                              ││
│  │  • Formula: blendedNGC = 0.6*NGC + 0.4*promotionProb                     ││
│  │  • Results logged for learning, don't block pipeline                     ││
│  └──────────────────────────────────────────────────────────────────────────┘│
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Components

### 3.1 Data Aggregator (Directive 8.8.4-L1)

**File:** `server/services/data-aggregator.ts`

**Purpose:** Non-blocking capture of signal-level, strategy-level, and market-level metrics during passive and active trading.

**Key Features:**
| Feature | Description |
|---------|-------------|
| Buffered Capture | 30-second flush intervals |
| Aggregation Cycles | 15-minute roll-ups |
| Auto Mode Detection | Switches between passive/active |
| Symbol Grouping | Groups by symbol_strategy key |

**Metrics Captured:**
- `avgNGC` - Average Normalized Global Confidence
- `avgCWQI` - Average Confidence-Weighted Quality Index
- `avgRisk` - Average risk ratio
- `avgProfitRate` - Average expected profit rate
- `reconfirmRate` - Signal reconfirmation rate
- `tradePromotionRate` - Rate of signals promoted to trades
- `sampleCount` - Number of samples in period

**Output Files:**
```
logs/data_aggregates/
├── passive_2026-01-02.json       # Daily captures
├── hourly/
│   └── passive_2026-01-02T07.json # Hourly aggregates
```

---

### 3.2 ML Service Client (Directive 8.8.4-L3)

**File:** `server/services/ml-service-client.ts`

**Purpose:** TypeScript client for calling Python ML microservice endpoints with caching and fallback handling.

**Prediction Types:**

| Endpoint | Input | Output | Use Case |
|----------|-------|--------|----------|
| `/predict/promotion` | PredictionInput | probability (0-1) | Likelihood signal becomes trade |
| `/predict/profit` | PredictionInput | predicted_profit | Expected profit if traded |

**PredictionInput Schema:**
```typescript
{
  symbol: string;
  strategy: string;
  ngc: number;         // Normalized Global Confidence
  cwqi: number;        // Confidence-Weighted Quality Index
  riskRatio: number;   // Risk/reward ratio
  profitTarget: number;
  signalAge?: number;
  entry: number;       // Entry price
  exit: number;        // Take-profit price
  stop: number;        // Stop-loss price
}
```

**Resilience Features:**
- 30-second TTL cache (500 entries max)
- 2-second request timeout
- BootOrchestrator readiness check
- Graceful degradation with default values

---

### 3.3 Virtual Trade Simulator (Directive 8.8.4-L8)

**File:** `server/services/vts-service.ts`

**Purpose:** Simulates trades without placing real orders to generate ground-truth data for ML calibration.

**Simulation Parameters:**
| Parameter | Value | Description |
|-----------|-------|-------------|
| Fee Rate | 0.26% per side | Kraken fee model |
| Avg Slippage | 0.15% | Realistic slippage |
| Trade Duration | 3 hours | Timeout window |

**Outcome Types:**
- `take_profit` - Price hit TP level
- `stop_loss` - Price hit SL level  
- `timeout` - 3-hour window expired

**Calibration System:**
- Per-strategy alpha/beta coefficients
- Rolling calibration from simulated outcomes
- Drift detection with auto-recalibration

**Output Files:**
```
logs/virtual_trades/
├── vts_2026-01-02.json          # Daily virtual trades
├── calibration/
│   └── strategy_calibration.json # Coefficients per strategy
```

---

### 3.4 Decision Confidence Engine (Directive 8.8.4-L16)

**File:** `server/services/decision-confidence-engine.ts`

**Purpose:** Combines multiple confidence metrics into a single Decision Index (DI).

**Formula:**
```
DI = w₁·CWQI + w₂·NGC + w₃·MLconf + w₄·RegimeConf + w₅·MACOconsensus
```

**Default Weights:**
| Component | Weight | Description |
|-----------|--------|-------------|
| CWQI | 0.25 | Trade quality score |
| NGC | 0.20 | Global confidence |
| ML Confidence | 0.20 | ML promotion probability |
| Regime Confidence | 0.15 | Market condition fit |
| MACO Consensus | 0.20 | Multi-agent agreement |

**DI Grading:**
- `strong` (DI > 0.7) - High confidence signal
- `caution` (0.4 < DI ≤ 0.7) - Moderate confidence
- `avoid` (DI ≤ 0.4) - Low confidence, skip

---

### 3.5 Adaptive Risk Advisor (ARA) UI

**File:** `client/src/components/goals/adaptive-risk-advisor.tsx`

**Purpose:** Dashboard component displaying ML-driven risk recommendations and system status.

**Sections Displayed:**
1. **ARA Core** - Risk per trade, max exposure, suggested values
2. **Drift Detection** - Per-strategy drift scores and recalibration status
3. **RL Status** - Reinforcement learning policy allocations
4. **MACO Status** - Multi-agent cooperative optimizer
5. **DCE Status** - Decision Confidence Engine metrics
6. **APR-SLE** - Adaptive Profit Realization & Stop-Loss Evolution
7. **PDC-ECS** - Predictive Drawdown Containment & Equity Curve Smoothing
8. **MOF** - Meta-Optimization Framework weights
9. **GASP** - Global Autonomy Stabilization Protocol

---

## 4. Data Flow & Integration Points

### 4.1 How ML Predictions Feed Into Trading

```
Signal Generated
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  SIGNAL ORCHESTRATOR (signal-orchestrator.ts:389-414)        │
│                                                              │
│  1. Calculate extendedMetrics (NGC, CWQI, profitRate)        │
│  2. Build PredictionInput from signal data                   │
│  3. Fire-and-forget async ML calls:                          │
│     • predictPromotion(input)                                │
│     • predictProfit(input)                                   │
│  4. On success: blendedNGC = blend(NGC, promotionProb, 0.6)  │
│  5. Log: [L3][MODEL_INFER] symbol/strategy: promotion=X      │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  DECISION CONFIDENCE ENGINE                                  │
│                                                              │
│  Combines blendedNGC + CWQI + RegimeConf + MACO → DI         │
│  Grades signal: strong | caution | avoid                     │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  TRADE PROMOTION DECISION                                    │
│                                                              │
│  If DI > threshold AND netEV > 0 → Promote to execution      │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Learning Feedback Loop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LEARNING FEEDBACK LOOP                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. CAPTURE PHASE                                                            │
│     • DataAggregator captures all signals (promoted + rejected)              │
│     • VTS simulates outcomes for rejected signals                            │
│     • Actual trades provide ground truth                                     │
│                                                                              │
│  2. AGGREGATION PHASE (every 15 min)                                         │
│     • Group by symbol_strategy                                               │
│     • Calculate avgNGC, avgCWQI, avgRisk, avgProfitRate                      │
│     • Compute tradePromotionRate, reconfirmRate                              │
│                                                                              │
│  3. CALIBRATION PHASE                                                        │
│     • Compare VTS predictions vs actual outcomes                             │
│     • Calculate per-strategy alpha/beta coefficients                         │
│     • Detect drift (actual vs predicted divergence)                          │
│                                                                              │
│  4. MODEL UPDATE PHASE                                                       │
│     • ML microservice retrains on new data                                   │
│     • DCE recalibrates component weights                                     │
│     • GASP monitors stability and dampens if needed                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Current Operational Status

### 5.1 Active Components

| Component | Status | Last Verified | Notes |
|-----------|--------|---------------|-------|
| DataAggregator | ✅ Active | Jan 2, 2026 | Capturing passive mode data |
| ML Service Client | ✅ Ready | Jan 2, 2026 | Requires ML microservice running |
| VTS Service | ✅ Active | Jan 2, 2026 | Simulating signals |
| DCE | ✅ Active | Jan 2, 2026 | Computing DI scores |
| ARA UI | ✅ Active | Jan 2, 2026 | Rendering in Goals tab |

### 5.2 ML Microservice Status

**Current State:** NOT RUNNING (Python service not deployed)

The ML microservice is designed to run on port 5001 but is currently not active. The system gracefully degrades:
- Returns default probability (0.5) when ML unavailable
- Returns default profit prediction (0.05) when ML unavailable
- Pipeline continues without ML enhancement

**To activate ML:**
1. Deploy Python Flask service with /predict/promotion and /predict/profit endpoints
2. Set ML_SERVICE_HOST environment variable
3. BootOrchestrator will detect and enable ML integration

### 5.3 Data Collection Status

**Daily Passive Learning Files:** Active since Dec 24, 2025
```
logs/data_aggregates/
├── passive_2025-12-24.json through passive_2026-01-02.json
└── hourly/ (aggregated data)
```

---

## 6. API Endpoints

### Trading & Risk APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ara/status` | GET | Adaptive Risk Advisor recommendations |
| `/api/vts/status` | GET | Virtual Trade Simulator stats |
| `/api/vts/drift/status` | GET | Per-strategy drift detection |
| `/api/dce/status` | GET | Decision Confidence Engine metrics |
| `/api/rl/status` | GET | Reinforcement learning policy |
| `/api/maco/status` | GET | Multi-agent optimizer status |
| `/api/apr-sle/status` | GET | Adaptive exit logic status |
| `/api/pdc-ecs/status` | GET | Drawdown containment status |
| `/api/mof/status` | GET | Meta-optimization framework |
| `/api/gasp/status` | GET | Global stability protocol |

### ML Service APIs (Port 5001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/predict/promotion` | POST | Promotion probability |
| `/predict/profit` | POST | Profit prediction |
| `/metrics` | GET | Service health |

---

## 7. File Locations

### Core Service Files

```
server/services/
├── data-aggregator.ts          # 8.8.4-L1 - Passive learning capture
├── ml-service-client.ts        # 8.8.4-L3 - ML service client
├── vts-service.ts              # 8.8.4-L8 - Virtual trade simulator
├── decision-confidence-engine.ts # 8.8.4-L16 - DCE
├── drift-detector.ts           # Strategy drift detection
├── market-profiler.ts          # Regime classification
├── regime-performance.ts       # Per-regime tracking
├── mof-orchestrator.ts         # Meta-optimization
├── gasp-coordinator.ts         # Stability protocol
└── signal-orchestrator.ts      # ML integration point
```

### UI Components

```
client/src/components/goals/
└── adaptive-risk-advisor.tsx   # Full ARA dashboard
```

### Data Directories

```
logs/
├── data_aggregates/            # Passive learning data
│   ├── passive_YYYY-MM-DD.json
│   └── hourly/
└── virtual_trades/             # VTS output
    └── vts_YYYY-MM-DD.json
```

---

## 8. Recommendations

### 8.1 Immediate Actions

1. **Deploy ML Microservice** - The Python Flask service is designed but not running. Deploy it to enable full predictive capabilities.

2. **Review Calibration Data** - 10+ days of passive learning data exists. Use for initial ML model training.

3. **Enable Active Trading Mode** - VTS and DataAggregator support both passive and active modes. Active mode provides higher-quality ground truth.

### 8.2 Future Enhancements

| Priority | Enhancement | Complexity | Impact |
|----------|-------------|------------|--------|
| High | Deploy ML microservice with pre-trained models | Medium | Enables full prediction |
| High | Automated model retraining pipeline | High | Self-improving predictions |
| Medium | Expand VTS with multi-timeframe simulation | Medium | Better calibration |
| Medium | Add ML confidence intervals | Low | Risk-aware predictions |
| Low | Strategy-specific ML models | High | Specialized predictions |

### 8.3 Monitoring

Monitor these metrics for system health:
- `DataAggregator flush count` - Should increase steadily
- `VTS closedTrades count` - Indicates simulation activity
- `DCE meanDI` - Should stay in 0.4-0.7 range
- `GASP GSI` - Global Stability Index (1.0 = stable)
- `Drift scores` - < 0.3 = stable, > 0.5 = needs recalibration

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Jan 2, 2026 | System | Initial comprehensive report |

---

*End of Report*
