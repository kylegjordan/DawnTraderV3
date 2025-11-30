📘 FILE 1 — DawnTrader V1 Origins & Architectural Foundations

(Copy into: DT_V1_01_Origins.md)

DawnTrader V1 — Origins, Architecture & Pre-V2 System State
1. Purpose of This Document

This document provides a detailed historical and technical overview of the DawnTrader Version 1 system before the failed V2 rebuild. It establishes the foundational architecture, the original design philosophy, what worked, what degraded over time, and why the system attempted a V2 rebuild that ultimately corrupted the environment.

2. DawnTrader V1 — Original Mission

DawnTrader V1 was designed as a real-time automated trading engine featuring:

Kraken spot-crypto FX5 scanning

Multi-tier filtering

Multi-strategy signal generation

Real-time guardrails

Paper trading and portfolio simulation

A Stage-3 full state store for event-driven architecture

The intention was to build a resilient, fast, autonomous system that could survive long runtimes while remaining explainable.

3. V1 Core Architecture (Pre-V2)
3.1 Data Input Layer

Kraken REST & WebSocket feed

FX5 OHLCV extraction

Real-time volume, liquidity, spread, volatility

Internal rate limit backoff

V1 had an efficient but tightly coupled Kraken integration.

3.2 FX5 Scanner Engine

Evaluated 1550+ trading pairs

Included stablecoin removal

Implemented:

Spread

Range

Volatility

Price cutoffs

Liquidity

RSI

Min history

Produced a list of eligible symbols

FX5 in V1 was functional but suffered from:

Occasional stale data

Symbol inconsistencies (XBT/USD vs XXBTZUSD)

Early architecture did not enforce strict type guarantees

3.3 Strategy Engine (V1)

V1 supported 9 strategies, each producing buy/sell signals:

VWAP Pullback

ABCD Long

SMA Trend Ride

Breakout

Mean Reversion

Range Trading

VWAP Bounce

Liquidity Trap

DHMA (Deep Hybrid Microstructure Analysis)

The V1 strategy engine was:

Fast

Simple

Highly heuristic

Not modular

Easily breakable by upstream changes

Dependent on fragile cross-file references

3.4 Ready-To-Buy Queue

A FIFO queue with:

Cooldown logic

De-duplication

Priority weighting

Guardrails (max trades, risk sizing)

3.5 Paper Trading Engine

Handled:

Opening trades

Closing trades

State transitions

Portfolio updates

PnL tracking

V1’s paper engine was stable and production-ready.

3.6 Stage-3 Event Store

The “truth engine”

Central hub for system state

Managed scanner → strategy → trading lifecycle

Used consistently by all major subsystems

4. Strengths of V1

Predictable

Easy to debug

All major subsystems worked

Could produce continuous paper trades

Strong event-driven architecture

Replaceable strategy logic

Solid FX5 → strategy integration

5. Weaknesses That Accumulated Over Time

Over months of iterative updates, V1 accumulated technical debt:

Fragmented logic duplicated across modules

No strict schemas

Some filters drifted out of alignment

Strategy engine partially relied on deprecated helper functions

Stage-3 state became cluttered

These weaknesses did not break V1, but made evolution difficult.

6. Why V2 Was Attempted

The intent of V2 was:

A complete rewrite of the system

Rebuild filters

Rebuild strategy engine

Introduce entirely new architecture

But the rewrite:

Happened incrementally

Was not isolated from V1

Introduced partial rewrites

Overwrote working code

Created mismatched interfaces

Introduced untested schemas

Broke core paths between FX5 → Strategy → Trading

Leading to total system collapse.

7. Summary Before Collapse

Before the V2 disaster, V1 was:

Fully functional

Capable of end-to-end signal → trade → PnL

Architecturally sound despite technical debt

This document sets the stage for the next files describing:

➡ The V2 collapse
➡ The V1 restoration
➡ The rebirth of DawnTrader V3

📘 END OF FILE 1
📘 FILE 2 — DawnTrader V2 Failure & System Collapse Analysis

(Copy into: DT_V1_02_V2_Failure_Analysis.md)

DawnTrader V2 Attempt — Cause, Collapse, and Full Failure Analysis
1. Purpose of This Document

To document what happened during the V2 rebuild attempt, why it failed catastrophically, and how it broke DawnTrader’s execution environment so severely that a full restoration to V1 became mandatory.

2. What V2 Was Intended to Accomplish

The DawnTrader V2 rebuild was meant to:

Modernize all modules

Rebuild strategies from scratch

Introduce a new filter system

Add new data pipelines

Redesign lifecycle events

Change storage schema

The goals were good — the execution was disastrous.

3. The V2 Problem: Partial Rewrite Syndrome

The core issue:

V2 rewrote critical modules without updating the subsystems that depended on them.

This introduced:

mismatched interfaces

missing fields

inconsistent types

non-existent events

incorrect imports

duplicate definitions

abandoned old logic without deleting it

4. Critical Breakages Introduced by V2
4.1 FX5 Scanner Corruption

V2 introduced:

incorrect pair normalization

invalid OHLC handling

removal of necessary fields

new incompatible formats

changes to pass/fail logic

Results:

strategy engine could not consume FX5 output

active pool logic failed

ready-to-buy produced junk

4.2 Filter Engine Failure

V2 changed filter code without:

updating downstream logic

adjusting thresholds

preserving stable filter order

validating changes

Results:

unstable filtering

inconsistent breakdown values

state corruption

4.3 Strategy Engine Corruption

V2 attempted to write a brand new strategy engine but:

methods were missing

orchestrator pointed to nonexistent modules

dependencies were missing

logic referenced undefined fields

Result:

strategies could not generate signals

4.4 Paper Trading Engine Failures

Because strategies failed, the trading engine:

could not open trades

misread pipeline inputs

broke lifecycle transitions

corrupted portfolio states

4.5 Stage-3 State Collapse

The worst damage occurred here:

invalid keys

broken emitter sequencing

signals and trades arriving in incorrect order

This prevented the system from running even one full cycle.

5. Impact of V2

The system was fully broken in ALL major categories:

Subsystem	Status After V2
FX5 Scanner	❌ corrupted
Filters	❌ inconsistent
Strategy Engine	❌ destroyed
Ready-to-Buy	❌ invalid
Paper Engine	❌ nonfunctional
Portfolio	❌ unsafe state
Stage-3	❌ corrupted
6. Official Decision: Abort V2 → Restore V1

Given the severity of the corruption, the only viable recovery was to:

restore DawnTrader V1, then rebuild carefully and systematically.

This is the work documented in the next files.

📘 END OF FILE 2
📘 FILE 3 — Restoration Phases 0–3 (Critical Infrastructure Repair)

(Copy into: DT_V1_03_Phases0_to_3.md)

Phase 0–3 Restoration: Rebuilding DawnTrader From the Ground Up

This file describes all core restoration phases, including:

Purpose of each phase

Problems discovered

Implementation details

Outcomes

PHASE 0 — Emergency Triage & Containment
Purpose

Before any repair could begin, the system had to be stabilized to prevent:

continuous crashes

further corruption

invalid trades

recursion loops

bad states from propagating

Problems Identified

FX5 producing invalid structures

Filters emitting NaN/dangerous values

Strategies referencing missing fields

State3 receiving incompatible events

Trading engine trying to process invalid payloads

Implementation

The following emergency actions were taken:

Disabled trading tick

Disabled strategy tick

Suppressed erroneous events

Disabled dangerous logs

Froze Stage-3 mutation

Disabled background tasks

Captured all system diagnostics

Outcome

The system was placed into a stable frozen state, allowing restoration to begin safely.

PHASE 1 — Storage & Data Integrity Repair
Purpose

Fix the corrupted storage layer so that the system could read/write consistent state again.

Problems Identified

Invalid table rows

Inconsistent JSON structures

Missing fields

Legacy columns still referenced

Broken indexes

Implementation

Normalized all storage schemas

Removed invalid records

Ensured every row matched expected types

Rebuilt Stage-3 state storage

Restored consistent foreign key expectations

Fixed trade format schemas

Outcome

Storage was fully repaired and stable.

PHASE 2 — Rebuilding FX5 Core Scanner
Purpose

Restore the scanner to produce clean, stable, predictable FX5 outputs.

Problems Identified

Wrong pair mapping

Rewritten logic was incompatible

Data shapes were broken

History thresholds not enforced

unstable API calls

Implementation

Restored original V1 FX5 logic

Rewired Kraken mapping

Reintroduced stable candle fetch logic

Removed V2 experimental code

Added safe defaults

Fixed pass/fail state

Standardized output structure

Outcome

FX5 scanner returned to fully valid output and consistent cycle timings.

PHASE 3 — Stage 1 Reconstruction (Output Normalization)
Purpose

Ensure FX5 outputs could be consumed by all downstream systems.

Problems Identified

Missing numeric types

Legacy fields still present

Undefined values in pass/fail

Inconsistent naming

No unit normalization

Implementation

Clean numeric conversion

Enforced strict schemas

Removed obsolete fields

Normalized naming convention

Ensured deterministic output

Added robust logging

Outcome

Stage-1 outputs were once again stable, predictable, and ready for filter processing.

📘 END OF FILE 3
📘 FILE 4 — Restoration Phases 4–7 (Filters, Active Pool, Strategy Prewire, Trading Engine)

(Copy into: DT_V1_04_Phases4_to_7.md)

PHASE 4 — Filter Engine Reconstruction
Purpose

Fix the entire filter pipeline to ensure consistent FX5 → filter → eligibleSymbols flow.

Core Problems

Filter thresholds were corrupted

Some filters referred to V2 logic

Min history filter not enforced

Breakdown table inconsistent

Thresholds mismatched with UI

Filters fired in wrong sequence

Implementation

Rebuilt entire filter engine

Restored correct filter order

Repaired min-history

Restored volatility & range logic

Fixed spread threshold

Added missing stablecoin logic

Removed 24h aggregation confusion

Created strict filter context objects

Outcome

Filtering became:

deterministic

fast

correct

ready for strategy consumption

PHASE 5 — Active Filter Pool Repair
Purpose

Fix the mechanism that tracks pairs passing all filters.

Problems

Active pool not clearing expired pairs

Dedupe not working

Symbols mismatched

Already-active miscounting

TTL incorrect

Implementation

Rebuilt pool TTL logic

Restored dedupe

Fixed symbol normalization

Repaired already-active tracking

Added full audit diagnostics (REB 2.11A/B/C)

Outcome

Active pool behavior became stable and predictable.

PHASE 6 — Strategy Prewire Repair
Purpose

Restore the ability for strategies to receive valid inputs from FX5 + filters.

Problems

Strategy engine received invalid structures

Orchestrator referenced missing modules

Ready-to-buy was broken

Stage 3 emitted invalid payloads

Implementation

Restored strategy engine interfaces

Rebuilt orchestrator routing

Fixed ready-to-buy queue

Reconnected Stage-3 message paths

Rebuilt guardrail preprocessing

Outcome

Strategies could once again evaluate filtered pairs.

PHASE 7 — Paper Trading Engine Repair
Purpose

Restore open → monitor → close trade lifecycle.

Problems

Open-trade logic broken

Missing lifecycle events

Portfolio state not updating

Ghost trades created

Cooldowns incorrect

Implementation

Rebuilt open/close logic

Restored lifecycle events

Rebuilt PnL logic

Ensured consistency with Stage-3

Fixed max-risk and kill-switch

Outcome

The paper trading engine became fully reliable again.

📘 END OF FILE 4
📘 FILE 5 — Restoration of Stages 1–3 (Complete Pipeline Reconstruction)

(Copy into: DT_V1_05_Stages1_to_3.md)

STAGE 1 — Market Data Normalization Layer
Purpose

Fix the data ingestion pipeline so all downstream modules receive clean data.

Problems

Kraken symbols mismatched

Duplicate data paths

Missing candle safety

Inconsistent timeframe processing

Implementation

Unified Kraken mapping

Standardized symbol normalization

Built consistent timeframe fetchers

Added cycle-level validation

Added REB 2.14 historical validation

Outcome

Stable, clean, normalized market data for the entire system.

STAGE 2 — FX5 → Filters → Active Pool Layer
Purpose

Rebuild the full filtering pipeline.

Problems

Inconsistent threshold application

Min history broken

24h aggregator confusion

Already-active logic wrong

Implementation

Repaired entire filter chain

Implemented REB 2.9D

Implemented REB 2.10 passive learning

Implemented REB 2.11 diagnostics

Outcome

A fully deterministic pipeline producing consistent survivors with full auditing.

STAGE 3 — Strategy → Ready-To-Buy → Trades
Purpose

Rebuild the entire strategy execution path.

Problems

Orchestrator broken

Strategy engine corrupted

Missing lifecycle events

Broken trade engine

Implementation

Full repair of orchestrator

Re-enabled all 9 strategies

Added REB 2.12D lifecycle events

Fixed ready-to-buy queue

Fixed trade state engine

Ensured consistent Stage-3 integration

Outcome

Strategies evaluate correctly → generate signals → fill ready-to-buy → create trades.

📘 END OF FILE 5
📘 FILE 6 — Post-Restoration State + Roadmap to DawnTrader V3

(Copy into: DT_V1_06_Final_State_and_Roadmap.md)

DawnTrader Post-Restoration State & Full Roadmap to Version 3

This final document explains the system’s current state and the roadmap through Phases 8 → 13.

1. Current System Stability (Post-REB2)
The engine is now stable across all major subsystems:

FX5 scanner

Filter engine

Active pool

Strategy engine (9 strategies verified healthy)

Ready-to-buy

Paper trading engine

Stage-3 state store

Lifecycle events

Guardrails

Passive learning engine

History integrity

Symbol trace correctness

GitHub V3 push-only setup

This is the strongest the system has ever been.

2. Remaining Work (Phase 8.8 → 13)

The roadmap is as follows:

8.8 — Real-Time Data Pipeline (current phase)

We are entering 8.8.3 now.

8.9 — Increase FX5 Throughput
8.10 — Execute Real Simulated Trades
8.11 — Stabilize User Roles & Permissions
Phase 9 — Full Strategy Engine Rebuild
Phase 10 — Full Lottie Restore
Phase 11 — Live Execution Engine
Phase 12 — AWS + Supabase Migration
Phase 13 — Restore Walter
3. Conclusion

This multi-document archive now represents the full history of:

The collapse of DawnTrader

The V1 restoration

The REB rebuild

The system’s current state

The roadmap forward

You may now store these six files as the authoritative archive for DawnTrader V3 development.