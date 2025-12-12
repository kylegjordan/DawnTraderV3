# DawnTrader: Complete Project History & Technical Reference
## For New Engineering Leadership

**Document Created:** December 12, 2025  
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
11. [Current Architecture & Components](#part-10-current-architecture--components)
12. [Roadmap Forward](#part-11-roadmap-forward)

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

**Current State:** DawnTrader V3 is the most stable and feature-complete version ever built. The trading pipeline is fully functional from FX5 scanning through trade closure.

---

# Part 1: Purpose & Objective of DawnTrader

## 1.1 Core Mission

DawnTrader is designed as a **comprehensive cryptocurrency day trading platform** with these objectives:

1. **Automated Trading**: Execute trading strategies automatically on Kraken
2. **Real-Time Scanning**: Evaluate 1500+ trading pairs using the FX5 scanner
3. **Risk Management**: Enforce guardrails, kill switches, and position limits
4. **Paper Trading**: Full simulation capability before live deployment
5. **AI Integration**: Autonomous optimization and advisory capabilities
6. **Self-Optimization**: Continuous learning from trading outcomes

## 1.2 Trading Philosophy

| Principle | Implementation |
|-----------|----------------|
| **Long-Only** | No short selling; buy and hold only |
| **Spot Trading** | No margin or leverage |
| **Day Trading** | Positions closed within defined holding periods |
| **Risk-First** | Guardrails enforced before every trade |
| **Cost-Aware** | SLIPPAGE_PERCENT = 0.15%, FEE_PERCENT = 0.10% |

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

### Strategy Engine (9 Strategies)
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

### Stage-3 Event Store
- Central hub for system state ("truth engine")
- Managed scanner → strategy → trading lifecycle
- Used consistently by all major subsystems

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

### Walter's Infrastructure
- 20+ service files in `server/services/`
- Expert corpus of 80 principles (Psychology, Risk, Strategy, Execution)
- Training data in `docs/training/Walter_Learning_Files/`
- Prompt templates and memory heuristics

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

## 3.2 The Decision: Turn Walter Off Entirely

The explicit decision was made to:
1. **Turn Walter off entirely** — not partial, complete removal from real-time path
2. **Replace with a fully local heuristic system** — what evolved into LATTi/Lottie

## 3.3 LATTi: The Local Solution

LATTi (Learning Autonomous Trading Tuning Intelligence), also known as **Lottie**, was created as Walter's replacement:

### LATTi's Key Differences from Walter

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

### LATTi's Current State (December 2025)

**Lottie is currently PASSIVE-ONLY by design:**

She does:
- ✅ Observe telemetry (engine state, metrics)
- ✅ Record outcomes (trade results, win-rates)
- ✅ Collect data (20-cycle passive learning buffer)
- ✅ Track 24h statistics (volume, momentum, volatility)

She does NOT:
- ❌ Open or close trades
- ❌ Change guardrails
- ❌ Make autonomous decisions

**Active control returns in Phase 10/11.**

---

# Part 4: V2 Decision: Architecture Failures

## 4.1 Technical Debt in V1

V1 had accumulated issues over time:

### General Technical Debt
- Fragmented logic duplicated across modules
- No strict schemas
- Some filters drifted out of alignment
- Strategy engine relied on deprecated helpers
- Stage-3 state became cluttered

### Global User vs. Mode Architecture Issue

A critical architectural problem emerged: **the mixing of global user architecture vs. mode-based logic**. This manifested as:

- Inconsistent handling of paper vs. live mode state
- User session data conflicting with trading mode data
- Passive learning flags disconnected from business logic
- Mode isolation broken between paper and live trading

### Walter Legacy Code Issues
- Walter's 20+ service files had become intertwined with core trading logic
- Many patterns from Walter's architecture spread throughout the codebase
- Walter's API-dependent design left orphaned code paths when sidelined

## 4.2 Why V2 Was Attempted

The V2 rebuild was intended to:
- Modernize all modules
- Rebuild strategies from scratch
- Introduce new filter system
- Redesign lifecycle events
- Change storage schema
- Clean up Walter legacy code

**The goals were good — the execution was disastrous.**

---

# Part 5: The Failed V2 Build

## 5.1 The V2 Problem: Partial Rewrite Syndrome

The core issue: **V2 rewrote critical modules without updating dependent subsystems.**

This introduced:
- Mismatched interfaces
- Missing fields
- Inconsistent types
- Non-existent events
- Incorrect imports
- Duplicate definitions
- Abandoned old logic without deletion

## 5.2 Critical Breakages

### FX5 Scanner Corruption
- Incorrect pair normalization
- Invalid OHLC handling
- Removal of necessary fields
- New incompatible formats

**Result:** Strategy engine could not consume FX5 output.

### Filter Engine Failure
- Updated filter code without updating downstream logic
- Thresholds not adjusted
- Stable filter order not preserved

**Result:** Unstable filtering, inconsistent breakdown values.

### Strategy Engine Corruption
- Methods missing
- Orchestrator pointed to nonexistent modules
- Dependencies missing
- Logic referenced undefined fields

**Result:** Strategies could not generate signals.

### Paper Trading Engine Failures
- Could not open trades
- Misread pipeline inputs
- Broke lifecycle transitions
- Corrupted portfolio states

### Stage-3 State Collapse
- Invalid keys
- Broken emitter sequencing
- Signals and trades in incorrect order

## 5.3 Impact Summary

| Subsystem | Status After V2 |
|-----------|-----------------|
| FX5 Scanner | ❌ Corrupted |
| Filters | ❌ Inconsistent |
| Strategy Engine | ❌ Destroyed |
| Ready-to-Buy | ❌ Invalid |
| Paper Engine | ❌ Nonfunctional |
| Portfolio | ❌ Unsafe state |
| Stage-3 | ❌ Corrupted |

## 5.4 Decision: Abort V2, Restore V1

Given the severity, the only viable recovery was:

**Restore DawnTrader V1, then rebuild carefully and systematically.**

---

# Part 6: Initial Refactoring: Phases 1-8.7

## 6.1 Restoration Phases 0-7

### Phase 0 — Emergency Triage
- Disabled trading tick
- Disabled strategy tick
- Froze Stage-3 mutation
- Captured system diagnostics
- Placed system in stable frozen state

### Phase 1 — Storage & Data Integrity
- Normalized storage schemas
- Removed invalid records
- Rebuilt Stage-3 state storage
- Fixed trade format schemas

### Phase 2 — FX5 Core Scanner
- Restored original V1 FX5 logic
- Rewired Kraken mapping
- Fixed OHLC data structures
- Added validation layers

### Phase 3 — Filter Engine Restoration
- Rebuilt filter manager
- Restored all 20+ filter types
- Added verbose failure reasons
- Implemented filter-by-filter audit mode

### Phase 4 — Strategy Engine Restoration
- Fixed method signatures
- Restored orchestrator wiring
- Fixed indicator dependencies
- Validated signal output formats

### Phase 5 — Ready-to-Buy Queue
- Fixed queue logic
- Restored cooldown tracking
- Fixed deduplication
- Validated priority weighting

### Phase 6 — Paper Trading Engine
- Fixed trade open logic
- Fixed lifecycle transitions
- Fixed portfolio updates
- Fixed PnL tracking

### Phase 7 — Integration & Validation
- Multi-cycle tests
- Drift detection
- State consistency validation

## 6.2 Phase 8.x Improvements

| Subphase | Description | Status |
|----------|-------------|--------|
| 8.1 | Fix accounting model (FX5) | ✅ Completed |
| 8.2 | Fix passive learning isolation | ✅ Completed |
| 8.3 | Fix scan cadence | ✅ Completed |
| 8.4 | Fix breakdown accuracy | ✅ Completed |
| 8.5 | Fix batch selection | ✅ Completed |
| 8.6 | Fix top-end rotation & UI | ✅ Completed |
| 8.7 | Activate unused filters | ✅ Completed |

---

# Part 7: The GitHub Incident

## 7.1 What Happened

On **November 20, 2025**, a GitHub sync event **overwrote approximately 10-14 days of critical development work**.

### Scope of Data Loss

The rollback affected:
- Filter Insights (UI + backend mapping + breakdown logic)
- Screeners tab (UI + backend mapping + field semantics)
- FX5 scanner (core engine state + rotation + filtering outputs)
- Active Filter Pool (dedupe + expiration logic)
- Various backend services

## 7.2 Critical Rollbacks Identified

### Priority 1: Critical Architectural Violations

| Component | Rollback Severity |
|-----------|-------------------|
| FX5 Scanner Architecture | **100% ROLLBACK** |
| Filter Insights UI Architecture | **100% ROLLBACK** |
| Metrics Pipeline Architecture | **100% ROLLBACK** |

### Priority 2: Feature Rollbacks

| Component | Rollback Severity |
|-----------|-------------------|
| Screeners Tab Configuration | **PARTIAL ROLLBACK** |
| Filter Breakdown Categories | **CATEGORY COUNT VIOLATION** |
| Active Filter Pool Logic | **BASELINE COMPROMISED** |

### Passive Learning Rollback

**Critical Finding:** The passive learning flag existed but was **completely disconnected** from backend business logic.

- Rollback Depth: **85%**
- Only 15% of passive learning architecture survived (flag definition only)

---

# Part 8: Rebuild of Lost Work: REB 1-2.12F

## 8.1 REB Program Overview

The Emergency Restoration & Bootstrap (REB) Program was structured as:

```
REB 0 — Master Restoration Audit Blueprint
REB 1 — Truth State Extraction (from 11.18-11.20 archives)
REB 2 — Current State System Audit
REB 3 — Truth vs Current: Diff Analysis
REB 4 — Restoration Planning
REB 5 — Restoration Implementation
REB 6 — Verification & Reconciliation
REB 7 — Re-stabilization Before Phase 8.8
```

## 8.2 REB 1.0-2.0: Foundation Repair

### REB 1.0 — System Integrity Diagnostics
- Confirmed system was recoverable
- FX5 fetch loops still functional
- Database responsive
- Filters partially working

### REB 1.5 — Deep Dump Analysis
- Produced complete dependency graph
- Mapped all valid and invalid modules
- Classified each system into Safe / Risky / Broken
- Created **MASTER GAP ANALYSIS**

### REB 2.0 — Start of Active Rebuild
- Standardized FX5 data structures
- Repaired scan-batch composition
- Implemented cycle-snapshots for learning

## 8.3 REB 2.1-2.8: Data Integrity Restoration

| Phase | Purpose | Outcome |
|-------|---------|---------|
| REB 2.1 | FX5 Structure Normalization | Filtering stopped crashing |
| REB 2.2 | Filter Engine Stabilization | 20+ filters reliable |
| REB 2.3 | Passive Learning Framework | 20-cycle FIFO buffer restored |
| REB 2.4 | History Filter Restoration | History-based filtering reliable |
| REB 2.5 | Active Filter Pool Fix | "Already Active" filter working |
| REB 2.6 | 24h Aggregator Cleanup | Removed legacy aggregator conflicts |
| REB 2.7 | Audit Framework | Zero mismatches achieved |
| REB 2.8 | Stress & Stability Tests | No drift across multiple cycles |

## 8.4 REB 2.9-2.12F: Strategy & Trading Restoration

| Phase | Purpose | Outcome |
|-------|---------|---------|
| REB 2.9 | Full Cycle Drift Detection | Zero drift detected |
| REB 2.10 | Passive Learning Deep Tests | Confirmed fully operational |
| REB 2.11C | Already Active Logic Fix | Filter category functioning |
| REB 2.12 | Filter Wiring Validation | All 15 tests passed |
| REB 2.12C | Goals Engine Override Fix | Per-filter override working |
| REB 2.12D | Trading Engine Wiring | Lifecycle events restored |
| REB 2.12F | Strategy Manifest Health | All 9 strategies HEALTHY |

---

# Part 9: Phase 8.8.3: Making the Engine Work

## 9.1 Phase 8.8.3 Objective

**"Make DawnTrader run end-to-end simulated trades reliably."**

The goal: Scanner → Signal → Strategy → Ready-to-Buy → Trading Engine → Portfolio → UI

## 9.2 Key Audits & Fixes

### Strategy Status Map (REB-8.8.3-A)
- All 9 strategies audited
- All 9 confirmed HEALTHY
- Zero legacy references causing issues
- Overall Health: **EXCELLENT**

### Kill Switch Unification (REB-8.8.3-KS)
- Single source of truth: `guardrails_v2` database
- `GuardrailPolicy` is the controller
- `checkGuardrailRisk()` is the single pre-trade gate
- Removed legacy secondary kill switches

### Strategy-to-Execution Unification (J4)
- **Problem:** Only 3 of 9 strategies were being called
- **Fix:** Added all 6 missing strategy calls
- All 9 strategies now evaluated consistently

### Walter Isolation (H11)
- Confirmed Walter modules are **diagnostic-only**
- Walter has **ZERO blocking capability**
- Cannot trip or reset kill switches
- Cannot modify guardrails

### Trading Pipeline Diagnostics (I1-I7)

| Phase | Focus | Status |
|-------|-------|--------|
| I1 | Pipeline documentation | ✅ Complete |
| I2-I5 | RTB diagnostics | ✅ Complete |
| I6 | Live Price Distribution | ✅ Fixed |
| I7 | Canonical Symbol Mapping | ✅ Implemented |
| I7-WS-A through G | WebSocket reliability | ✅ Complete |

### WebSocket Improvements
- Canonical symbol mapping (BASE/QUOTE format)
- 8-stage price tracing
- Auto-resubscription for slow/frozen tick streams
- 100% subscription coverage for active trades

## 9.3 Current Pipeline Flow

```
FX5 Scanner (30s cycle)
    │
    ▼
Active Filter Pool (filtered pairs)
    │
    ▼
Signal Orchestrator (evaluates all 9 strategies)
    │
    ▼
Paper Execution Engine (sizing + guardrails)
    │
    ▼
checkGuardrailRisk() [SINGLE GATE]
    │
    ├── Kill Switch Check
    ├── Stop Loss Required
    ├── Max Positions Per Asset
    ├── Symbol Cooldown
    ├── Position Size Cap
    └── Max Open Trades
    │
    ▼
Trade Creation (DB + WebSocket subscription)
    │
    ▼
Monitoring Cycle (price updates)
    │
    ▼
Trade Closure (target/stop/trailing/manual)
```

---

# Part 10: Current Architecture & Components

## 10.1 Core Services

| Service | File | Purpose |
|---------|------|---------|
| **FX5 Scanner** | `fx5-scanner.ts` | Scans Kraken universe, applies filters |
| **Strategy Engine** | `strategy-engine.ts` | 9 trading strategies |
| **Signal Orchestrator** | `signal-orchestrator.ts` | Coordinates strategy evaluation |
| **Paper Execution Engine** | `paper-execution-engine.ts` | Paper trade lifecycle |
| **Trade Safety** | `trade-safety.ts` | `checkGuardrailRisk()` gate |
| **Guardrail Policy** | `guardrail-policy.ts` | Kill switch + guardrail management |
| **Risk Manager** | `risk-manager.ts` | Daily loss monitoring |
| **Kraken WebSocket Adapter** | `kraken-websocket-adapter.ts` | Real-time price feed |
| **Live Pricing Adapter** | `live-pricing-adapter.ts` | Price cache with fallbacks |

## 10.2 Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `guardrails_v2` | Single source of truth for risk parameters |
| `paper_sim_open_positions` | Current open paper trades |
| `paper_sim_trades` | Closed paper trade history |
| `paper_trading_sessions` | Paper simulation session state |
| `screener_configs` | Filter configuration per user |
| `fx5_24h_activity` | 24-hour scanner metrics |

## 10.3 Guardrails v2 Schema

```sql
-- Key fields in guardrails_v2
mode VARCHAR                    -- 'paper' or 'live'
portfolio_risk_per_trade_pct    -- Per-trade risk limit (default 3%)
symbol_cooldown_minutes         -- Cooldown between same-symbol trades
max_open_positions              -- Maximum concurrent positions
daily_loss_kill_switch_pct      -- Daily loss threshold (default 5%)
max_position_percent_pct        -- Maximum position size
kill_switch_tripped             -- Boolean kill switch state
is_manual_override              -- User override flag
tuned_by_latti                  -- LATTi optimization flag
```

## 10.4 WebSocket Architecture

```
┌─────────────────────────────────────────┐
│         Kraken WebSocket API            │
│    (ticker feed for open positions)     │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│      Kraken WebSocket Adapter           │
│  - Symbol mapping (canonical format)    │
│  - Auto-subscription management         │
│  - Tick frequency monitoring            │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│       Live Pricing Adapter              │
│  - Price cache (single source of truth) │
│  - REST fallback when WebSocket stale   │
│  - Binance/CoinGecko fallback           │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│      Frontend WebSocket Broadcast       │
│  - price_updated events                 │
│  - trading_state_changed events         │
│  - scan_tick events                     │
└─────────────────────────────────────────┘
```

## 10.5 AI Components

### LATTi/Lottie (Active - Passive Mode)
- `latti-manager.ts` - Core optimization engine
- `guardrail-policy.ts` - Guardrail management
- `adaptive-guardrails.ts` - Adaptive adjustments
- `dhma-tuning-service.ts` - DHMA strategy optimization

### Walter (Isolated - Phase 13 Restoration)
- 20+ service files preserved
- Chat functionality isolated from trading
- Expert corpus (80 principles) intact
- Memory system functional but disconnected

---

# Part 11: Roadmap Forward

## 11.1 Phase 8.8 Completion

| Subphase | Description | Status |
|----------|-------------|--------|
| 8.8.1 | Scanner Output Audit | ✅ Complete |
| 8.8.2 | Signal Engine Audit | ✅ Complete |
| 8.8.3 | Strategy Engine Audit | ✅ Complete |
| 8.8.4 | Ready-To-Buy Audit | ⏳ Pending |
| 8.8.5 | Trading Engine Audit | ⏳ Pending |
| 8.8.9 | Green Path Test | ⏳ Pending |

## 11.2 Future Phases

| Phase | Description |
|-------|-------------|
| **Phase 9** | Full Strategy Engine Rebuild |
| **Phase 10** | Full LATTi/Lottie Restore (active control) |
| **Phase 11** | Live Execution Engine (real Kraken orders) |
| **Phase 12** | AWS & Supabase Migration |
| **Phase 13** | Restore Walter (strategic advisor role) |

## 11.3 Walter's Future Role

Walter returns in Phase 13 as:
- Long-horizon advisor (not real-time)
- Analytics engine
- Simulation & suggestion layer

**Critical constraint:** Walter will **never again be a real-time execution dependency**.

---

# Appendix A: Key File Locations

## Server Services
```
server/services/fx5-scanner.ts
server/services/strategy-engine.ts
server/services/signal-orchestrator.ts
server/services/paper-execution-engine.ts
server/services/trade-safety.ts
server/services/guardrail-policy.ts
server/services/risk-manager.ts
server/services/kraken-websocket-adapter.ts
server/services/live-pricing-adapter.ts
server/services/paper-portfolio-manager.ts
server/services/paper-position-sizing.ts
server/services/latti-manager.ts
```

## Walter Services (Isolated)
```
server/services/walter-memory.ts
server/services/walter-purpose.ts
server/services/walter-expert-corpus.ts
server/services/walter-cognitive-layer.ts
server/services/walter-intent-gateway.ts
```

## Key Documentation
```
docs/history and references/Walter_and_LATTi_System_History.md
docs/history and references/DawnTrader V1 Restoration after Failed V2 Build - Phases 0 - 7.md
docs/history and references/DawnTrader V3 8.6 through 8.7 Rebuild and Restoration Report.md
docs/history and references/REB1 MASTER_GAP_ANALYSIS.md
docs/audits/phase_8.8.3-H11_autonomy_walter_isolation.md
docs/diagnostics/Phase-8.8.3-I1_Trading_Pipeline_Diagnostics.md
```

---

# Appendix B: Critical Lessons Learned

## From Walter's API Failure
> External API dependencies are incompatible with real-time trading operations.

## From the V2 Failure
1. Never do partial rewrites — isolate completely or don't start
2. Type guarantees matter — loose typing caused cascading failures
3. Event-driven architecture is fragile — one broken event breaks everything
4. Incremental improvement beats revolution

## From the GitHub Incident
1. Always have multiple backup sources
2. Document truth state before major changes
3. GitHub sync can overwrite local work unexpectedly

## The Solution Formula
```
If (operation requires real-time response) + (operation will be called frequently):
    → Build it LOCAL, not API-dependent
    → Put "AI inside the engine, not outside it"
```

---

**Document Status:** Complete  
**Last Updated:** December 12, 2025  
**Next Review:** Upon Phase 8.8 completion
