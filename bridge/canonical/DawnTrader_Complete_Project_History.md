# DawnTrader: Complete Project History & Technical Reference
## For New Engineering Leadership

**Document Created:** December 12, 2025  
**Last Updated:** January 18, 2026  
**Document Purpose:** Comprehensive onboarding document for incoming Sr. Engineer  
**Document Status:** Living Reference Document

---

# Table of Contents

1. [Executive Summary](#executive-summary)
2. [Purpose & Objective of DawnTrader](#part-1-purpose--objective-of-dawntrader)
3. [Initial Build Including Walter](#part-2-initial-build-including-walter)
4. [Transition from Walter to LATTi](#part-3-transition-from-walter-to-latti)
5. [V2 Decision: Architecture Failures](#part-4-v2-decision-architecture-failures)
6. [The Failed V2 Build](#part-5-the-failed-v2-build)
7. [Initial Refactoring: Phases 1-8.7](#part-6-initial-refactoring-phases-1-87)
8. [The GitHub Incident](#part-7-the-github-incident)
9. [Rebuild of Lost Work: REB 1-2.12F](#part-8-rebuild-of-lost-work-reb-1-212f)
10. [Phase 8.8.3: Making the Engine Work](#part-9-phase-883-making-the-engine-work)
11. [Phase 8.8.4: Extended Calibration & Validation](#part-10-phase-884-extended-calibration--validation)
12. [Phase 9: Math Core Finalization](#part-11-phase-9-math-core-finalization)
13. [Phase 10: Hybrid Alpha Pattern Engine](#part-12-phase-10-hybrid-alpha-pattern-engine)
14. [Phase 11: Production Hardening & Dynamic Validation](#part-13-phase-11-production-hardening--dynamic-validation)
15. [Current Architecture & Components](#part-14-current-architecture--components)
16. [Roadmap Forward](#part-15-roadmap-forward)

---

# Executive Summary

DawnTrader is a **long-only, spot-trading cryptocurrency day trading platform** for the Kraken exchange. The project has undergone significant evolution:

| Phase | Timeframe | Description |
|-------|-----------|-------------|
| V1 Original | Pre-October 2025 | Functional trading platform with 9 strategies |
| Walter Integration | October 2025 | AI SysAdmin Co-Pilot added (OpenAI-powered) |
| Walter Sidelined | October 2025 | API latency made Walter impractical for real-time |
| LATTi Created | October 2025 | Local autonomous tuning system replaces Walter |
| V2 Attempted | October-November 2025 | Complete rewrite attempted, failed catastrophically |
| V1 Restoration | November 2025 | Phases 0-7 restored V1 to working state |
| Phase 8.x Refactoring | November 2025 | Systematic improvements to Phase 8.7 |
| GitHub Incident | November 20, 2025 | Sync event erased 10-14 days of work |
| REB Program | November 22-30, 2025 | Emergency restoration (REB 1.0-2.12F) |
| Phase 8.8.3 | December 2025 | End-to-end trading pipeline functional |
| Phase 8.8.4 | December 2025 | Extended Calibration & Validation Framework |
| Phase 9 | December 2025 - January 2026 | Math Core Finalization (IMF, FinalScore) |
| Phase 10 | January 2026 | Hybrid Alpha Pattern Engine & VTS Modernization |
| Phase 11 | January 2026 | Production Hardening, Z-Score, Macro-State (COMPLETE) |

**Current State:** DawnTrader V3.1 has completed Phase 11 with Z-Score normalization, macro-state detection, profitability gate enforcement, and 17 canonical strategies across 5 market regimes. The system features dual-pool adaptive scanning (100 pairs/cycle), institutional math filters with dynamic thresholds, and full telemetry-driven learning. Production-ready for live trading validation.

---

# Part 1: Purpose & Objective of DawnTrader

## 1.1 Core Mission

DawnTrader is designed as a **comprehensive cryptocurrency day trading platform** with these objectives:

1. **Automated Trading**: Execute trading strategies automatically on Kraken
2. **Real-Time Scanning**: Evaluate 1400+ trading pairs using adaptive FX5 scanner
3. **Risk Management**: Enforce guardrails, kill switches, and position limits
4. **Paper Trading**: Full simulation capability before live deployment
5. **AI Integration**: Autonomous optimization and advisory capabilities
6. **Self-Optimization**: Continuous learning from trading outcomes via VTS

## 1.2 Trading Philosophy

| Principle | Implementation |
|-----------|----------------|
| **Long-Only** | No short selling; buy and hold only |
| **Spot Trading** | No margin or leverage |
| **Day Trading** | Positions closed within defined holding periods |
| **Risk-First** | Guardrails enforced before every trade |
| **Cost-Aware** | SLIPPAGE_PERCENT = 0.15%, FEE_PERCENT = 0.10% |
| **Physics First** | NetEV > 0 required for trade execution |

## 1.3 Technical Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React, TypeScript, Vite, TailwindCSS, Shadcn/UI |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | PostgreSQL (Neon serverless), Drizzle ORM |
| **Real-Time** | WebSocket (custom server + Kraken WebSocket API) |
| **AI** | OpenAI GPT-4o (for analysis, not real-time trading) |
| **Exchange** | Kraken REST API + WebSocket ticker feed |

---

# Part 2: Initial Build Including Walter

## 2.1 V1 Core Architecture

DawnTrader V1 was a functional, production-ready trading engine:

### Data Input Layer
- Kraken REST & WebSocket feed
- FX5 OHLCV extraction
- Real-time volume, liquidity, spread, volatility
- Internal rate limit backoff

### FX5 Scanner Engine
Evaluated 1550+ trading pairs with filters:
- Spread, Range, Volatility
- Price cutoffs, Liquidity, RSI
- Stablecoin exclusion
- Minimum history requirements

### Strategy Engine (Original 9 Strategies)
1. **VWAP Pullback** - VWAP retracement in trending markets
2. **ABCD Long** - Harmonic pattern with Fibonacci targets
3. **SMA Trend Ride** - Trend-following with SMA crossovers
4. **Breakout** - Consolidation breakouts with volume confirmation
5. **Mean Reversion** - Trades when price deviates from VWAP
6. **Range Trading** - Range-bound trading at support/resistance
7. **VWAP Bounce** - Bounce trades off VWAP with momentum
8. **Liquidity Trap** - Contrarian entries on false breakouts
9. **DHMA** - Dynamic Hull Moving Average with microstructure analysis

### Ready-To-Buy Queue
- FIFO queue with priority weighting
- Cooldown logic and deduplication
- Guardrail enforcement (max trades, risk sizing)

### Paper Trading Engine
- Opening/closing trades
- State transitions
- Portfolio updates
- PnL tracking

## 2.2 Walter: The AI SysAdmin Co-Pilot

Walter was conceived as an **AI-powered conversational assistant** integrated into DawnTrader:

### Walter's Design Philosophy
1. **Contextual Intelligence**: Understand user's trading purpose
2. **Expert Knowledge**: 80+ curated trading principles
3. **System Integration**: Visibility into platform operational state
4. **Memory Persistence**: Long-term memory across sessions

### Walter's Components

| Service File | Purpose |
|--------------|---------|
| `walter-memory.ts` | Long-term memory storage |
| `walter-purpose.ts` | User purpose tracking |
| `walter-expert-corpus.ts` | 80 trading principles |
| `walter-cognitive-layer.ts` | Reasoning and analysis |
| `walter-response-templates.ts` | Response generation |
| `walter-intent-gateway.ts` | Intent classification |
| `walter-chat-lifecycle.ts` | Conversation management |

---

# Part 3: Transition from Walter to LATTi

## 3.1 Why Walter Was Turned Off

**The decision was operational, not philosophical.**

Walter was OpenAI-API dependent, and real-time trading created too many calls:

| Problem | Impact |
|---------|--------|
| **Rate-limit throttling** | OpenAI limits constrained interactions during trading |
| **Delayed responses** | 2-8 second API latency made real-time decisions impossible |
| **Instability during live loops** | Trading engine couldn't wait for Walter's responses |
| **Cumulative delays** | Multiple calls meant 5-15+ seconds total response time |
| **Cost accumulation** | Each API call incurred costs |

**Key Insight:** Walter wasn't "wrong" — he was in the wrong place in the architecture.

## 3.2 LATTi: The Local Solution

LATTi (Learning Autonomous Trading Tuning Intelligence), also known as **Lottie**, was created as Walter's replacement:

| Aspect | Walter | Lottie |
|--------|--------|--------|
| **Architecture** | External (API-dependent) | Local (embedded) |
| **Execution** | Conversational (chat) | Autonomous (background) |
| **Timing** | Strategic, offline | Real-time, continuous |
| **Dependencies** | OpenAI API | None — fully local |
| **Scope** | Advisory | Operational (guardrails, filters) |

### Canonical Truth

```
Lottie = real-time, local, constrained
Walter = strategic, offline, advisory
```

---

# Part 4: V2 Decision: Architecture Failures

## 4.1 The V2 Motivation

By October 2025, several issues prompted a V2 consideration:
- Complex state management across services
- Tight coupling between components
- Difficulty adding new strategies
- Testing challenges

## 4.2 V2 Failure Analysis

The V2 attempt failed for these reasons:

1. **Scope Creep**: Started as refactor, became complete rewrite
2. **Lost Functionality**: Working features broken during rewrite
3. **Time Pressure**: Unable to iterate properly
4. **Testing Gap**: No comprehensive test suite to validate changes

---

# Part 5: The Failed V2 Build

## 5.1 What Was Attempted

- Complete service layer rewrite
- New event-driven architecture
- Centralized state management
- GraphQL API layer

## 5.2 What Failed

- Breaking changes to working features
- Loss of institutional knowledge in code
- No path to rollback
- Unstable intermediate states

## 5.3 Decision: Restore V1

The decision was made to abandon V2 and systematically improve V1 through phased refactoring.

---

# Part 6: Initial Refactoring: Phases 1-8.7

## 6.1 Phase Overview

| Phase | Focus |
|-------|-------|
| Phase 0 | Assessment and stabilization |
| Phase 1 | Core service cleanup |
| Phase 2 | Database schema normalization |
| Phase 3 | API standardization |
| Phase 4 | WebSocket reliability |
| Phase 5 | Scanner optimization |
| Phase 6 | Strategy engine improvements |
| Phase 7 | UI/UX enhancements |
| Phase 8.0-8.7 | Integration and testing |

## 6.2 Key Achievements

- Stable trading pipeline
- Reliable WebSocket connections
- Consistent API responses
- Improved error handling
- Better logging and debugging

---

# Part 7: The GitHub Incident

## 7.1 What Happened

On November 20, 2025, a GitHub synchronization event caused **10-14 days of work to be lost**.

## 7.2 Impact

- All Phase 8.0-8.7 work lost
- Local changes not backed up
- No checkpoint system in place

## 7.3 Response

The REB (Rapid Emergency Build) program was initiated to restore lost functionality.

---

# Part 8: Rebuild of Lost Work: REB 1-2.12F

## 8.1 REB Program Structure

| REB Phase | Focus |
|-----------|-------|
| REB 1.0 | Core service restoration |
| REB 2.0 | Trading pipeline rebuild |
| REB 2.5 | Signal generation restoration |
| REB 2.8 | Execution engine rebuild |
| REB 2.10 | WebSocket reconnection |
| REB 2.12 | Final validation |
| REB 2.12F | Production certification |

## 8.2 Timeline

- **November 22-30, 2025**: Intensive rebuild effort
- **December 1, 2025**: REB 2.12F certified complete

## 8.3 Lessons Learned

1. Implement checkpoint system
2. Regular backups to external storage
3. Document architectural decisions immediately
4. Maintain comprehensive test suite

---

# Part 9: Phase 8.8.3: Making the Engine Work

## 9.1 Focus

Phase 8.8.3 focused on making the end-to-end trading pipeline functional.

## 9.2 Key Implementations

1. **Price Cache System**: Unified rate-governed cache
2. **Central Clock**: Synchronized 1-second ticks
3. **Position Monitoring**: 1.5-second monitoring loop
4. **WebSocket Reliability**: Reconnection and subscription audit
5. **Balance Tracking**: Accurate portfolio value calculation

## 9.3 Outcome

Paper trading engine fully functional with realistic cost modeling.

---

# Part 10: Phase 8.8.4: Extended Calibration & Validation

## 10.1 Focus

Validation framework and extended calibration.

## 10.2 Key Implementations

1. **RTB Refresh Service**: Bucket-based signal refresh (15s/bucket)
2. **Adaptive Concurrency Tuner (ACT)**: Dynamic pool sizing
3. **Stage-C Validator**: Signal validation framework
4. **Execution Attempt Audit**: Complete RTB logging
5. **Health Monitor**: System-wide health tracking

## 10.3 Outcome

Comprehensive validation framework ensuring signal quality.

---

# Part 11: Phase 9: Math Core Finalization

## 11.1 Focus

Mathematical foundations and institutional-grade filters.

## 11.2 Key Implementations

### IMF (Institutional Math Filters)
| Metric | Formula | Threshold |
|--------|---------|-----------|
| LQ (Log-Liquidity) | `log10(volume × price) × 10` | ≥ 40 |
| VolNoise | Volatility-to-trend ratio | ≤ 0.6 |
| DI (Directional Integrity) | Trend strength | ≥ 45 |
| Sigma (σ) | Standard deviation | Calculated |

### FinalScore Unification
Single formula across all subsystems:
```
FinalScore = (
  confidence × 0.35 +
  regimeWeight × 0.25 +
  liquidityScore × 0.20 +
  momentumScore × 0.15 +
  patternScore × 0.05
) × riskAdjustment
```

## 11.3 Outcome

Unified mathematical foundation with immutable scoring coefficients.

---

# Part 12: Phase 10: Hybrid Alpha Pattern Engine

## 12.1 Focus

Pattern recognition, hybrid signals, and VTS modernization.

## 12.2 Key Implementations

### 5-Class Regime Model
| Regime | Description |
|--------|-------------|
| BULL_STABLE | Sustained uptrend, low volatility |
| BEAR_VOLATILE | Downtrend, high turbulence |
| LOW_VOL_CHOP | Range-bound, no direction |
| HIGH_VOL_IMPULSE | Breakout, violent expansion |
| TRANSITION | Unclear conditions |

### Strategy Expansion (9 → 17)
- 8 QUANT strategies
- 5 PATTERN strategies
- 4 HYBRID strategies

### VTS Modernization
- Passive learning data aggregation
- 60-second simulation cycles
- Telemetry-only writes
- Isolated cache bucket

### Canonical Regime-Strategy Map
- Single source of truth for all mappings
- Validation middleware enforcement
- Schema version 11.4F.1

## 12.3 Outcome

Hybrid intelligence combining Quant + Pattern + ML signals.

---

# Part 13: Phase 11: Production Hardening & Dynamic Validation

## 13.1 Focus

Production-ready hardening with advanced mathematical validation.

## 13.2 Key Implementations (Directive 11.0-11.5)

### Directive 11.0: VTS Telemetry Integration
- VTS auto-starts during passive learning
- Telemetry writes with pool tagging
- Data segregation from live trades

### Directive 11.1: Dual-Pool Architecture
- Adaptive Scan Manager implementation
- 60% Ideal / 40% Rotational split
- Pair failure tracking with cooldown

### Directive 11.2: Telemetry Aggregator Enhancement
- 24-hour rolling windows
- Per-pair performance metrics
- Pool-level statistics

### Directive 11.3: Adaptive Ratio Manager
- Dynamic pool ratio adjustment
- Regime-based weighting
- Confidence-based scaling

### Directive 11.4: Canonical Harmonization
- Regime-Strategy Map (single source of truth)
- Pattern normalization
- Signal type validation

### Directive 11.5: Math, Macro, and Regime Synchronization

#### Task 1: Profitability Validation (Net Expectancy Gate)
**File:** `server/core/calculations/expectancy.ts`

```typescript
isMathematicallyProfitable(signal): boolean {
  const grossProfit = (targetPrice - entryPrice) / entryPrice;
  const totalCost = (feeRate × 2) + (spread × 1.1) + slippage;
  return grossProfit > totalCost;
}
```

#### Task 2: Rolling Z-Score Normalization
**File:** `server/utils/rolling-stats.ts`

- 300-period rolling window for statistics
- Z-Score calculation: `(value - mean) / stdDev`
- 30-sample warmup before valid classification

#### Task 3: Macro-State Module
**File:** `server/core/metrics/macro-state.ts`

Uses rolling Z-scores of aggregate market metrics (300-period window, 30-sample warmup):

| Condition | Z-Score Detection | Adjustments |
|-----------|-------------------|-------------|
| NORMAL | Default (no thresholds exceeded) | Standard thresholds |
| VOLATILITY_EXPANSION | avgVolatilityZ > 2 | LQ×1.2, VolNoise×0.8 |
| LIQUIDITY_CRUNCH | liquidityZ < -1 | LQ×1.5 |
| SPECULATIVE_SURGE | correlationZ > 1.5 | LQ×1.1, VolNoise×0.7 |

#### Task 4: Secondary Metric Adjustment
**File:** `server/core/metrics/secondary-metrics.ts`

Dynamic threshold adjustment based on macro conditions.

#### Task 5: Filter Logic Correction
Blue-chip/stablecoin pairs scanned but tradable only when passing IMF.

#### Task 6: Strategy-Specific Guardrails
`sma_trend_ride` requires ADX > 25.

#### Task 7: Strategy Performance Audit
**File:** `server/core/strategy-analyzer.ts`

Per-strategy win rate analysis with keep/monitor/disable recommendations.

## 13.3 Phase 11 Outcome

- Z-Score normalization integrated in VTS and DSS
- Macro-state detection with dynamic thresholds
- Profitability gate enforcing NetEV > 0
- 17 canonical strategies with regime mappings
- Production-ready for live trading validation

---

# Part 14: Current Architecture & Components

## 14.1 Core Services

| Service | File | Purpose |
|---------|------|---------|
| **KrakenService** | `kraken.ts` | Exchange API |
| **FX5 Scanner** | `fx5-scanner.ts` | Market scanning (100 pairs/cycle) |
| **Signal Orchestrator** | `signal-orchestrator.ts` | Strategy evaluation |
| **Strategy Engine** | `strategy-engine.ts` | 17 strategies |
| **Paper Execution Engine** | `paper-execution-engine.ts` | Trade execution |
| **VTS Runner** | `vts-runner.ts` | Virtual simulation |

## 14.2 Infrastructure Services

| Service | File | Purpose |
|---------|------|---------|
| **Price Cache** | `price-cache.ts` | Unified cache (4 buckets) |
| **RTB Refresh** | `rtb-refresh-service.ts` | Signal refresh (8 buckets) |
| **Telemetry Aggregator** | `telemetry-aggregator.ts` | 24h metrics |
| **Adaptive Scan Manager** | `adaptive-scan-manager.ts` | Dual-pool selection |
| **Central Clock** | `central-clock.ts` | 1-second ticks |
| **Symbol Canonicalizer** | `symbol-canonicalizer.ts` | Kraken ↔ BASE/QUOTE |

## 14.3 Metrics Services

| Service | File | Purpose |
|---------|------|---------|
| **Market Regime** | `market-regime.ts` | 5-class + Z-Score |
| **Macro-State** | `macro-state.ts` | Global conditions |
| **Expectancy** | `expectancy.ts` | Profitability gate |
| **IMF Metrics** | `imf-metrics.ts` | LQ, VolNoise, DI, Sigma |

## 14.4 Database Schema

| Table | Purpose |
|-------|---------|
| `paper_sim_trades` | Paper trade records |
| `paper_sim_open_positions` | Open positions |
| `paper_sim_portfolio` | Portfolio balance |
| `guardrails_v2` | Risk parameters |
| `screener_filters` | Filter config |
| `telemetry_pairs` | Pair metrics |
| `imf_metrics` | IMF calculations |

---

# Part 15: Roadmap Forward

## 15.1 Immediate Next Steps

1. **Live Trading Validation**: Test with small positions on Kraken
2. **Performance Monitoring**: Track live vs paper performance
3. **Strategy Tuning**: Adjust based on live results

## 15.2 Future Phases

| Phase | Focus |
|-------|-------|
| Phase 12 | Live trading stabilization |
| Phase 13 | Advanced ML integration |
| Phase 14 | Multi-exchange support |
| Phase 15 | Portfolio optimization |

## 15.3 Technical Debt

| Item | Priority | Notes |
|------|----------|-------|
| Walter integration | Low | Keep offline, advisory only |
| Legacy strategy cleanup | Medium | Remove unused strategies |
| Test coverage | High | Expand unit/integration tests |
| Documentation | Ongoing | Keep canonical docs current |

---

# Document History

| Date | Version | Changes |
|------|---------|---------|
| 2025-12-12 | 1.0 | Initial creation |
| 2026-01-08 | 1.5 | Phase 10 additions |
| 2026-01-18 | 2.0 | Complete overhaul for Phase 11 |

---

*This document serves as the authoritative project history for DawnTrader. For current technical details, consult the System Architecture and Current State Reference documents.*
