# DawnTrader V1 — Origins, Architecture & Pre-V2 System State

## FILE 1 — DawnTrader V1 Origins & Architectural Foundations

### 1. Purpose of This Document

This document provides a detailed historical and technical overview of the DawnTrader Version 1 system before the failed V2 rebuild. It establishes the foundational architecture, the original design philosophy, what worked, what degraded over time, and why the system attempted a V2 rebuild that ultimately corrupted the environment.

### 2. DawnTrader V1 — Original Mission

DawnTrader V1 was designed as a real-time automated trading engine featuring:

- Kraken spot-crypto FX5 scanning
- Multi-tier filtering
- Multi-strategy signal generation
- Real-time guardrails
- Paper trading and portfolio simulation
- A Stage-3 full state store for event-driven architecture

The intention was to build a resilient, fast, autonomous system that could survive long runtimes while remaining explainable.

### 3. V1 Core Architecture (Pre-V2)

#### 3.1 Data Input Layer

- Kraken REST & WebSocket feed
- FX5 OHLCV extraction
- Real-time volume, liquidity, spread, volatility
- Internal rate limit backoff

V1 had an efficient but tightly coupled Kraken integration.

#### 3.2 FX5 Scanner Engine

Evaluated 1550+ trading pairs

Included stablecoin removal

Implemented:
- Spread
- Range
- Volatility
- Price cutoffs
- Liquidity
- RSI
- Min history

Produced a list of eligible symbols

FX5 in V1 was functional but suffered from:
- Occasional stale data
- Symbol inconsistencies (XBT/USD vs XXBTZUSD)
- Early architecture did not enforce strict type guarantees

#### 3.3 Strategy Engine (V1)

V1 supported 9 strategies, each producing buy/sell signals:

1. VWAP Pullback
2. ABCD Long
3. SMA Trend Ride
4. Breakout
5. Mean Reversion
6. Range Trading
7. VWAP Bounce
8. Liquidity Trap
9. DHMA (Deep Hybrid Microstructure Analysis)

The V1 strategy engine was:
- Fast
- Simple
- Highly heuristic
- Not modular
- Easily breakable by upstream changes
- Dependent on fragile cross-file references

#### 3.4 Ready-To-Buy Queue

A FIFO queue with:
- Cooldown logic
- De-duplication
- Priority weighting
- Guardrails (max trades, risk sizing)

#### 3.5 Paper Trading Engine

Handled:
- Opening trades
- Closing trades
- State transitions
- Portfolio updates
- PnL tracking

V1's paper engine was stable and production-ready.

#### 3.6 Stage-3 Event Store

- The "truth engine"
- Central hub for system state
- Managed scanner → strategy → trading lifecycle
- Used consistently by all major subsystems

### 4. Strengths of V1

- Predictable
- Easy to debug
- All major subsystems worked
- Could produce continuous paper trades
- Strong event-driven architecture
- Replaceable strategy logic
- Solid FX5 → strategy integration

### 5. Weaknesses That Accumulated Over Time

Over months of iterative updates, V1 accumulated technical debt:

- Fragmented logic duplicated across modules
- No strict schemas
- Some filters drifted out of alignment
- Strategy engine partially relied on deprecated helper functions
- Stage-3 state became cluttered

These weaknesses did not break V1, but made evolution difficult.

### 6. Why V2 Was Attempted

The intent of V2 was:
- A complete rewrite of the system
- Rebuild filters
- Rebuild strategy engine
- Introduce entirely new architecture

But the rewrite:
- Happened incrementally
- Was not isolated from V1
- Introduced partial rewrites
- Overwrote working code
- Created mismatched interfaces
- Introduced untested schemas
- Broke core paths between FX5 → Strategy → Trading

Leading to total system collapse.

### 7. Summary Before Collapse

Before the V2 disaster, V1 was:
- Fully functional
- Capable of end-to-end signal → trade → PnL
- Architecturally sound despite technical debt

---

## FILE 2 — DawnTrader V2 Failure & System Collapse Analysis

### 1. Purpose of This Document

To document what happened during the V2 rebuild attempt, why it failed catastrophically, and how it broke DawnTrader's execution environment so severely that a full restoration to V1 became mandatory.

### 2. What V2 Was Intended to Accomplish

The DawnTrader V2 rebuild was meant to:
- Modernize all modules
- Rebuild strategies from scratch
- Introduce a new filter system
- Add new data pipelines
- Redesign lifecycle events
- Change storage schema

The goals were good — the execution was disastrous.

### 3. The V2 Problem: Partial Rewrite Syndrome

The core issue:

V2 rewrote critical modules without updating the subsystems that depended on them.

This introduced:
- mismatched interfaces
- missing fields
- inconsistent types
- non-existent events
- incorrect imports
- duplicate definitions
- abandoned old logic without deleting it

### 4. Critical Breakages Introduced by V2

#### 4.1 FX5 Scanner Corruption

V2 introduced:
- incorrect pair normalization
- invalid OHLC handling
- removal of necessary fields
- new incompatible formats
- changes to pass/fail logic

Results:
- strategy engine could not consume FX5 output
- active pool logic failed
- ready-to-buy produced junk

#### 4.2 Filter Engine Failure

V2 changed filter code without:
- updating downstream logic
- adjusting thresholds
- preserving stable filter order
- validating changes

Results:
- unstable filtering
- inconsistent breakdown values
- state corruption

#### 4.3 Strategy Engine Corruption

V2 attempted to write a brand new strategy engine but:
- methods were missing
- orchestrator pointed to nonexistent modules
- dependencies were missing
- logic referenced undefined fields

Result:
- strategies could not generate signals

#### 4.4 Paper Trading Engine Failures

Because strategies failed, the trading engine:
- could not open trades
- misread pipeline inputs
- broke lifecycle transitions
- corrupted portfolio states

#### 4.5 Stage-3 State Collapse

The worst damage occurred here:
- invalid keys
- broken emitter sequencing
- signals and trades arriving in incorrect order

This prevented the system from running even one full cycle.

### 5. Impact of V2

The system was fully broken in ALL major categories:

| Subsystem | Status After V2 |
|-----------|-----------------|
| FX5 Scanner | ❌ corrupted |
| Filters | ❌ inconsistent |
| Strategy Engine | ❌ destroyed |
| Ready-to-Buy | ❌ invalid |
| Paper Engine | ❌ nonfunctional |
| Portfolio | ❌ unsafe state |
| Stage-3 | ❌ corrupted |

### 6. Official Decision: Abort V2 → Restore V1

Given the severity of the corruption, the only viable recovery was to:

**Restore DawnTrader V1, then rebuild carefully and systematically.**

---

## FILE 3 — Restoration Phases 0–3 (Critical Infrastructure Repair)

### PHASE 0 — Emergency Triage & Containment

#### Purpose
Before any repair could begin, the system had to be stabilized to prevent:
- continuous crashes
- further corruption
- invalid trades
- recursion loops
- bad states from propagating

#### Problems Identified
- FX5 producing invalid structures
- Filters emitting NaN/dangerous values
- Strategies referencing missing fields
- State3 receiving incompatible events
- Trading engine trying to process invalid payloads

#### Implementation
The following emergency actions were taken:
- Disabled trading tick
- Disabled strategy tick
- Suppressed erroneous events
- Disabled dangerous logs
- Froze Stage-3 mutation
- Disabled background tasks
- Captured all system diagnostics

#### Outcome
The system was placed into a stable frozen state, allowing restoration to begin safely.

---

### PHASE 1 — Storage & Data Integrity Repair

#### Purpose
Fix the corrupted storage layer so that the system could read/write consistent state again.

#### Problems Identified
- Invalid table rows
- Inconsistent JSON structures
- Missing fields
- Legacy columns still referenced
- Broken indexes

#### Implementation
- Normalized all storage schemas
- Removed invalid records
- Ensured every row matched expected types
- Rebuilt Stage-3 state storage
- Restored consistent foreign key expectations
- Fixed trade format schemas

#### Outcome
Storage was fully repaired and stable.

---

### PHASE 2 — Rebuilding FX5 Core Scanner

#### Purpose
Restore the scanner to produce clean, stable, predictable FX5 outputs.

#### Problems Identified
- Wrong pair mapping
- Rewritten logic was incompatible
- Data shapes were broken
- History thresholds not enforced
- Unstable API calls

#### Implementation
- Restored original V1 FX5 logic
- Rewired Kraken mapping
- Fixed OHLC data structures
- Enforced type guarantees
- Added validation layers

#### Outcome
FX5 scanner producing clean, consistent output.

---

### PHASE 3 — Filter Engine Restoration

#### Purpose
Restore all filters to V1 behavior with improvements.

#### Implementation
- Rebuilt filter manager
- Restored all 20+ filter types
- Added verbose failure reasons
- Implemented filter-by-filter audit mode

#### Outcome
Filter engine fully operational.

---

## FILE 4 — Restoration Phases 4–7 (Strategy & Trading Restoration)

### PHASE 4 — Strategy Engine Restoration

#### Purpose
Restore all 9 strategies to working state.

#### Implementation
- Fixed method signatures
- Restored orchestrator wiring
- Fixed indicator dependencies
- Validated signal output formats

#### Outcome
All 9 strategies producing signals.

---

### PHASE 5 — Ready-to-Buy Queue Restoration

#### Purpose
Ensure signals flow correctly into the trading queue.

#### Implementation
- Fixed queue logic
- Restored cooldown tracking
- Fixed deduplication
- Validated priority weighting

#### Outcome
Ready-to-buy queue operational.

---

### PHASE 6 — Paper Trading Engine Restoration

#### Purpose
Enable end-to-end paper trade execution.

#### Implementation
- Fixed trade open logic
- Fixed lifecycle transitions
- Fixed portfolio updates
- Fixed PnL tracking

#### Outcome
Paper trading engine fully functional.

---

### PHASE 7 — Integration & Validation

#### Purpose
Validate the complete pipeline works end-to-end.

#### Implementation
- Multi-cycle tests
- Drift detection
- State consistency validation
- Performance benchmarks

#### Outcome
System validated and ready for Phase 8.

---

## Summary

The V1 → V2 → V1 Restoration journey taught critical lessons:

1. **Never do partial rewrites** — either isolate completely or don't start
2. **Type guarantees matter** — loose typing caused cascading failures
3. **Event-driven architecture is fragile** — one broken event breaks everything
4. **Incremental improvement beats revolution** — V3 (REB phases) succeeded by fixing incrementally

DawnTrader V3 (post-REB) is now the strongest version ever built.

---

**Document Status**: Complete  
**Last Updated**: November 30, 2025
