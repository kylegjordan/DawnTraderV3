Below is the Roadmap we are currently working on for the Dawn Trader trading app.

Phase 8 — Fix & Complete the Paper-Mode Trading Engine

This phase brings the entire paper-trading engine to a fully functioning, end-to-end state, without Lottie.

8.1 — Fix accounting model (FX5) → COMPLETED
8.2 — Fix passive learning isolation → COMPLETED
8.3 — Fix scan cadence → COMPLETED
8.4 — Fix breakdown accuracy → COMPLETED
8.5 — Fix batch selection → COMPLETED
8.6 — Fix top-end rotation & UI → COMPLETED
8.7 — Activate Unused Filters → COMPLETED

8.8 — Build Real-Time Data Pipeline
• Filtered pool → 5–10 sec
• Ready-to-Buy → 2–3 sec
• Active trades → 1–2 sec
• Uses ticker batching
• Ensures we NEVER compete with scan budget

8.9 — Increase Scanner Batch Size
• Move from 60 → 300+ per scan
• After real-time pipeline is operational
• Fully rotate top-end in ~30–60 sec
• Validate throughput + rate limits

8.10 — Execute Real Simulated Trades
A dedicated step confirming that:
• Strategies fire correctly
• Conditions to open trades work
• Conditions to close trades work
• Portfolio updates correctly
• Risk guardrails are honored in real trade execution
• ALL THREE data loops function:
   o scan engine (filtering)
   o strategy engine (evaluating filtered pool)
   o execution engine (open/close trades)

8.11 — Role Stability & Auth Fixes
•	Correct role storage, server validation, reconnection, permissions.
•	Permanently repairs user-role syncing (admin/owner), eliminating the disappearing Filter Insights tab.
•	Replaces localStorage hacks with real server-side role validation and removes legacy "viewer/tester" user-mode logic.


🧠 Phase 9 — Full Strategy Engine Rebuild
Now that the system can:
• filter
• evaluate
• execute trades
• close trades
…we replace the micro-strategy layer entirely.

This includes:
• Full rebuild of strategy framework
• Replacing old heuristics
• Rewriting DHMA, MACH, switches, signals
• Adding rule-based, statistical, and trend systems
• Unified signal engine
• Integration tests with live data
• Back testing framework (lightweight)

This is where Lottie will eventually learn from the clean strategy signals.

🤖 Phase 10 — Full Lottie Restore

Lottie is plugged in after:
• Full paper trading execution engine works
• All filters are correct
• Real-time feeds are in place
• Strategy engine is rebuilt
• Trades open & close successfully

Lottie plug-in includes:
• Full restore of learning engine
• DPOE restored - internal motivational and gamification layer that drives Lottie to maximize portfolio growth as quickly and efficiently as possible while strictly obeying all risk, guardrail, and safety constraints. It treats every trading decision as part of a competitive performance cycle, reinforcing profitable, safe, high-quality actions and penalizing risky, slow, or inefficient ones to make Lottie behave like the most disciplined and effective trading entity in the system.
• Reinforcement dataset → paper trades
• Decision arbitration layer
• Guardrail compliance
• Scenario-based training

💰 Phase 11 — Live Execution Engine
This is where we adapt paper execution engine to real trading.

Includes:
• Replace mock execution with real Kraken orders
• Build error-handling for order rejection
• Slippage handling
• Real-time WebSocket Kraken feeds
• Retry logic
• Real trading guardrails
• Wallet tracking
• Real account updates

Paper and live trading engines will share 90% of the same code.


☁️ Phase 12 — AWS & Supabase Migration
Once live engine is working:

• Clone runtime state
• Spin parallel environment
• Migrate DB schemas
• Migrate Lottie memory store
• Migrate Secrets / Config
• API gateway + load balancer
• Real-time logs
• 24/7 uptime environment
• Run both systems in parallel for 48 hours
• Validate consistency
• Cutover to AWS


🧠 Phase 13 — Restore Walter

Walter is restored after the live trading system is stable on AWS.

• Walter becomes the long-term, long-horizon advisor
• Historical analytics + suggestion engine
• Performance heuristics
• Strategy tuning insights
• Portfolio simulation

The detailed plan for Phase 8.8 and its subphases are as follows:
✅ Phase 8.8 — Build Real-Time Data Pipeline

DETAILED EXPLANATION
🌐 Phase 8.8 — Build Real-Time Data Pipeline

Phase 8.8 is the beginning of the end-to-end trading engine stabilization, ensuring that:

The entire system can:
• accept filtered FX5 output
• feed it into signals
• feed signals into the strategy engine
• feed signals into ready-to-buy
• feed ready-to-buy into the trading engine
• and run PAPER TRADES end-to-end without breaking anything


✔ A full system-wide AUDIT of the entire trading stack
✔ Ensuring the pipeline from scanner → ready-to-buy → strategy → trading → position updates is working end-to-end
✔ Ensuring data formats match expectations
✔ Ensuring signals fire correctly
✔ Ensuring guardrails integrate dynamically
✔ Ensuring no legacy code paths corrupt data
✔ Ensuring Lottie’s old API hooks do not interfere
✔ Preparing the system for bigger batch sizes (300–500)
✔ Preparing the system to support the new strategy engine in Phase 9


The Goal of Phase 8.8 (Recovered Exactly as Discussed)

“Make DawnTrader run end-to-end simulated trades reliably, using real FX5 scanner output, with a clean real-time data pipeline that is forward compatible with Phase 9 strategy rebuild.”

What that means:

🟦 Scanner → 🟩 Signal → 🟧 Strategy → 🟨 Ready-to-Buy → 🟥 Trading Engine → 🟪 Portfolio → 🟫 UI


We must ensure:
• consistent data structures
• identical field names
• no legacy attributes break downstream logic
• no race conditions
• no passive/active contamination
• proper WebSocket emissions
• correct persistence of trade state
• guardrails enforced correctly in REAL-TIME (not only pre-trade)
• No legacy code paths sabotage the pipeline.


We found earlier:
• Lottie’s “guardrail risk” logic was still connected in places
• The strategy engine was referencing old signal structures
• Stage 3 events were out of sync
• Some old paper-sim logic still wrote to old DB tables
• Watchlist updates were duplicating or overwriting
• readyToBuyService was using stale validation logic
• The real-time trading engine was sometimes not consuming signals correctly
• race conditions existed between scan_tick and trading_tick ticks

Phase 8.8 resolves all of that.


📘 PHASE 8.8 — Build Real-Time Data Pipeline (Full Audit + Integration) Step by Step Plan Outline


Goal: Make DawnTrader execute one fully correct, end-to-end, real simulated trade using real FX5 data — proving the pipeline is stable, consistent, and ready for strategy rebuild (Phase 9).
----------------------------------------

🔷 8.8.1 — Scanner Output Audit (COMPLETED)

The FX5 → eligibleSymbols output must be clean, consistent, and formatted for the downstream pipeline.

Tasks:
• Verify eligibleSymbols structure matches current expectations.
• Remove any legacy fields (score, reasons, confidence, deprecated metrics).
• Validate numeric types (avoid stringified floats).
• Ensure breakdown values aren’t reused incorrectly in strategy logic.
• Validate Stage 3 “scan_tick” emits clean payloads without duplicates.


----------------------------------------

🔷 8.8.2 — Signal Engine Audit (COMPLETED)

We validate that the signal engine actually produces signals from real FX5 filtered output.

Tasks:
• Confirm buy/sell triggers fire where they should.
• Detect missing fields required for signal generation.
• Identify which indicators are broken or missing.
• Document signals that never fire.
• Confirm signals flow into ready-to-buy queue.


----------------------------------------

🔷 8.8.3 — Strategy Engine Audit (No Rebuild Yet) and Minimum Strategy Engine Fix – (NEXT TO BE IMPLEMENTED)
We audit strategy logic to identify broken, obsolete, or missing components — but do not fix them yet.

Tasks: Audit
• Map every strategy module and its dependencies.
• Identify references to legacy V1/V2 logic.
• Document missing indicator inputs.
• Validate output compatibility with ready-to-buy.
• Ensure guardrails don’t prematurely block strategy decisions.

Minimum Strategy Engine Fix Includes:
• Fix heuristic-trader.ts
• Ensure DHMA, Dema, Nodal, etc. produce real signals
• Ensure signals move pairs:

   • filtered → ready to buy → trade opened → trade monitored → trade closed

• End-to-end execution of simulated trades
• Confirm paper portfolio changes
• Confirm trade ledger updates
• Confirm trade lifecycle events
• Ensure guardrails apply to real trade decisions

Output: A “Strategy Status Map” for Phase 9.

----------------------------------------

🔷 8.8.4 — Ready-To-Buy Audit
Ensure signals → ready-to-buy is correct and fast.

Tasks:
• Ensure signals are queued correctly.
• Verify sorting logic and prioritization.
• Validate cooldown logic.
• Fix duplicate or stale entries.
• Confirm that ready-to-buy outputs are emitted cleanly.

----------------------------------------

🔷 8.8.5 — Trading Engine Audit (Paper Mode)
Ensure trade creation, monitoring, and completion all function properly.

Tasks:
• Validate trade open logic.
• Validate lifecycle updates (open → monitor → close).
• Validate guardrails (max-risk, cooldown, max positions, kill-switch).
• Validate PnL tracking and state transitions.
• Confirm no ghost or duplicate trades.

----------------------------------------

🔷 8.8.6 — Portfolio + DB/Watchlist Sync Audit
Ensure downstream systems receive correct updates.

Tasks:
• Verify portfolio updates correctly reflect trades.
• Ensure watchlist entries aren’t overwritten incorrectly.
• Validate DB tables receive correct updates.
• Correct stage3 cache inconsistencies.

----------------------------------------

🔷 8.8.7 — Tick Loop Concurrency / Race Fix
Prevent race conditions between scanning ticks and trading ticks.

Tasks:

• Serialize or lock scan_tick vs trading_tick.
• Ensure state reads/writes do not overlap.
• Prevent partial updates from being consumed.
• Guarantee stable timing cycles.

----------------------------------------

🔷 8.8.8 — Real-Time Guardrail Enforcement
Guardrails must work live, not just at trade creation.

Tasks:
• Validate max-risk per trade.
• Validate portfolio max-positions.
• Validate cooldown.
• Validate daily-loss kill switch.
• Remove ANY legacy guardrail logic.

----------------------------------------

🔷 8.8.9 — The Green Path Test (Required Milestone)
One real FX5 filtered symbol → real signal → strategy approval → ready → trade open → trade complete.

Output required:
• Full timestamped log of each stage.
• CycleId / pair / action trace.
• Full state transition correctness.

This is the success badge for Phase 8.8.

----------------------------------------

🔷 8.8.10 — Backwards Compatibility Contract (For Phase 9)
Ensure that Phase 9 can rebuild the strategy engine without breaking the pipeline.

Output:
• Field input requirements
• Deprecated fields
• Broken indicators
• Missing features
• Strategy wiring points

----------------------------------------

🔷 8.8.11 — Throughput Prep for Phase 8.9
Ensure the entire system can handle 300–500 batch scans.

Tasks:
• Test memory usage
• Test event queue responsiveness
• Validate processing time
• Ensure guardrails can keep up with throughput

----------------------------------------

END CONDITIONS FOR PHASE 8.8

✔ When activated, paper mode successfully simulates trades
✔ No race conditions
✔ Correct data flow scanner → strategy → trading
✔ Guardrails stable
✔ Backwards compatibility contract created
✔ Real-time pipeline documented


PHASE 8.8.3 IMPLEMENTATION PLAN

Below is the fully updated, post-REB1 + REB2–aware Phase 8.8.3 plan, rewritten from scratch using:

✔ Everything you just pasted
✔ Everything we actually implemented across REB1 → REB2.12F
✔ The present state of the FX5 engine, strategy-engine, orchestrator, signal pipeline, lifecycle events, trade executor, guardrails, and diagnostics

This is the final, correct plan for Phase 8.8.3, as it must be executed today, not the version from before the rebuild.

✅ PHASE 8.8.3 — Strategy Engine Audit + Minimum Fix (UPDATED AFTER REB PHASES)
🔵 High-Level Purpose of 8.8.3

Phase 8.8.3 is the bridge between Phase 8.8 (real-time pipeline validation) and Phase 9 (full strategy engine rebuild)

Its purpose is to audit the entire existing strategy engine, confirm which parts of the system work, and apply a minimal strategy-layer fix so that:

→ One strategy can produce a real BUY signal → open a trade → monitor → close → update portfolio → update ledger.

This is the first true full-cycle trade test of DawnTrader V3.
•	No rebuilding.
•	No optimization.
•	Just verifying the current engine is correctly wired.

🔵 What Changed Because of REB1 & REB2
•	The original plan assumed:
•	The scanner was unstable
•	Signals were inconsistent
•	Ready-to-buy logic was broken
•	The active filter pool was miscounting
•	The history filter was not wired
•	DHMA was disabled
•	Lifecycle events were missing
•	Trade executor logic didn’t exist
•	Strategy detection methods were inconsistent
•	Orchestrator wiring was incomplete
•	Signal debugging was missing

But REB1 → REB2.12F restored ALL of these layers. Therefore:

🔥 Phase 8.8.3 now focuses on:
•	confirming the strategy engine can actually fire in real conditions,
•	verifying signal → ready → trade → close actually works,
•	applying minimal band-aids only,
•	producing a Strategy Status Map so Phase 9 can rebuild everything cleanly.

This is what 8.8.3 MUST do now.

🟦 PHASE 8.8.3 — Detailed Plan (Updated)
🔷 PART A — Strategy Engine Audit (Deep Diagnostic)
A read-only, no-modification audit of the entire strategy system.

We must inspect:

A1. Map every strategy module
We list:
•	vwap_pullback.ts
•	abcd_long.ts
•	sma_trend_ride.ts
•	breakout.ts
•	mean_reversion.ts
•	range_trading.ts
•	vwap_bounce.ts
•	liquidity_trap.ts
•	dhma.ts

For each:
✔ required indicators
✔ expected data inputs
✔ dependencies on shared indicators
✔ dependencies on market structure
✔ risk parameters
✔ required tick-history
✔ expected outputs (StrategySignal object shape)

A2. Identify legacy V1/V2 logic still present
We check for references to:
•	old scoring systems
•	V1 “signal objects”
•	early Dema/Nodal placeholder code
•	pre-stage3 patterns
•	old indicator files
•	leftover guardrail logic
•	deprecated strategy fields
•	old portfolio update methods

A3. Document Missing Indicator Inputs
Some strategies may require data that does not exist in the new system:

•	missing multi-timeframe RSI
•	missing trend slope
•	missing liquidity-weighted OB
•	missing MFI
•	missing microstructure
•	missing volatility context
•	missing depth-of-book
•	missing 24h ranges for gatekeeping
•	missing normalized OHLC series
•	missing EMA clouds

We document specifically what each strategy needs, and whether the FX5 + passive learning pipeline can currently supply it.

(This will become the “Strategy Status Map”.)

A4. Validate output compatibility with ready-to-buy
We confirm for every strategy:
•	output objects match the StrategySignal interface
•	required fields (pair, direction, confidence, reason) are filled
•	no nulls or missing fields
•	timestamps valid
•	signal id unique
•	everything matches what ready-to-buy expects

A5. Ensure guardrails do NOT block legitimate strategies
We confirm:
•	strategy signals pass guardrail checks
•	no premature block (incorrect max-risk flag, cooldown logic, etc.)
•	no ghost or double blocking
•	guardrails wait until after strategy evaluation

This avoids false negatives.

🔷 PART B — Minimum Strategy Engine Fix (not a rebuild)

This is NOT Phase 9.
We only apply surgical minimum fixes to make exactly the current strategies functional for Phase 8.8.
The strategy engine must be made “good enough” to trigger simulated trades.

Minimum fixes:

B1. Fix heuristic-trader.ts
This is the last-mile routing layer that converts:

strategy signal → action decision → trade execution.

Fixes include:
✔ validate signal object
✔ ensure direction logic is correct
✔ ensure no “undefined” fields crash execution
✔ ensure filtering between BUY/SELL works
✔ ensure signals route to ready-to-buy queue
✔ ensure signal → trade executor link is correct
✔ ensure signal timestamps and metadata propagate properly

B2. Ensure DHMA, DEMA, Nodal produce real signals
These must NOT be placeholders.

This includes:
•	verifying indicator inputs
•	verifying microstructure features
•	verifying threshold logic
•	enabling DHMA evaluation block
•	ensuring at least one strategy can fire in real market conditions

B3. Validate the entire trade lifecycle
We must prove:

filtered → ready → trade opened → trade monitored → trade closed → portfolio updated → ledger updated

This requires:
✔ signals flow correctly
✔ trade executor receives valid trade objects
✔ lifecycle events fire
✔ monitor loop updates PnL
✔ close logic triggers
✔ ledger entry is written
✔ portfolio changes
✔ guardrails enforce risk

B4. Ensure no strategy produces malformed signals
We check:
•	empty reason
•	NaN values
•	null indicators
•	missing symbol
•	missing price
•	undefined timeframe
•	invalid confidence

B5. Verify guardrail correctness

Guardrails must not:
•	block real trades accidentally
•	trigger cooldowns incorrectly
•	treat 0 trades as “over max positions”
•	drop strategies due to missing fields that Replit just fixed

Guardrails must:
•	enforce max positions
•	enforce cooldown
•	enforce daily risk
•	enforce kill switch

🔷 PART C — Output: Strategy Status Map for Phase 9

When the audit is complete, we produce a formal structured JSON/Markdown map containing:

C1. Strategy Coverage Map
For each strategy:
•	status: working, partially working, broken
•	data inputs required: list
•	data currently available: list
•	missing inputs: list
•	dependencies: indicators, shared libraries
•	compatibility: ready-to-buy, trade executor, FX5
•	recommendations for rebuild

C2. Indicator Availability List
For all indicators:
•	available
•	missing
•	partial
•	deprecated
•	incorrect formulae

C3. Microstructure feature readiness
Includes:
•	orderbook imbalance
•	signed flow
•	microprice tilt
•	spread regime
•	volatility regime
•	toxicity filters

C4. Signal → Execution Path Integrity
We confirm full compatibility.

C5. Recommendations for Phase 9
This section tells us:
•	what to rewrite
•	which features to rebuild
•	which strategies to rebuild completely
•	what the unified signal model should look like
•	what indicators must be implemented
•	what the learning engine will consume

🔷 RESULT OF PHASE 8.8.3

When Phase 8.8.3 is fully complete:

✔ One strategy successfully fires a real signal
✔ The entire trade lifecycle works end-to-end
✔ Strategy Status Map is created
✔ All minimal wiring issues are resolved
✔ Nothing is rebuilt prematurely
✔ The system is fully ready for Phase 8.8.4 → 8.8.10
✔ Phase 9 (full rebuild) has a correct blueprint



Below is the official subdivision of Phase 8.8.3 and then Directive 8.8.3-A, which is the first actionable part of the plan for Replit to execute.

✅ PHASE 8.8.3 — Subphase Breakdown (Final)

To keep the implementation clean, testable, safe, and aligned with the REB-style rebuilds, Phase 8.8.3 is divided into FOUR subphases:

🔷 8.8.3-A — Strategy Engine Deep Audit (Read-Only)

This subphase performs the full “diagnose-only” mapping of strategies, dependencies, missing indicators, legacy logic, and compatibility checks.

No code is changed in this subphase.
It produces the Strategy Status Map — Part 1 (Audit Findings).

This is what we execute first.

🔷 8.8.3-B — Minimum Strategy Engine Fix (Wiring Layer)

Only minimal corrective adjustments:

Fix heuristic-trader.ts

Fix the signal → ready → trade routing path

Fix any incorrect signal object shapes

Fix missing metadata or malformed fields

Fix orchestrator → strategy-engine link integrity

Fix guardrails that incorrectly block valid trades

Output: Strategy Status Map — Part 2 (Corrected Wiring).

🔷 8.8.3-C — Minimum Strategy Output Fix + Signal Validation

Ensure that every strategy method returns a correctly structured StrategySignal object and can fire valid signals under test mode.

This subphase:

Runs deterministic mock tests

Ensures DHMA, SMA Trend Ride, Breakout, ABCD, etc. all return proper signals

Confirms none return null, undefined, NaN fields

Verifies compatibility with ready-to-buy queue

Output: Strategy Status Map — Part 3 (Signal Health).

🔷 8.8.3-D — End-to-End Signal → Trade Lifecycle Minimal Test

•	This is the “Minimum Viable Trade Pipeline” test:
•	filtered → ready
•	ready → trade opened
•	trade opened → monitored
•	monitored → closed
•	portfolio updated
•	ledger updated
•	lifecycle events fired

This proves Phase 8.8’s pipeline is alive and Phase 9 can rebuild the strategies safely.

Output:
8.8.3 Certification Report
and
Green Path readiness confirmation (pre-8.8.9).

🟦 CONFIRMED SUBPHASE COUNT: 4

8.8.3-A → 8.8.3-D

We now proceed with 8.8.3-A, the full diagnostic audit.

✅ DIRECTIVE FOR REPLIT — Phase 8.8.3-A (Strategy Engine Deep Audit)

Below is the exact instruction format the Replit agent performs best with.

🚀 REB 8.8.3-A — Strategy Engine Deep Audit (Read-Only Diagnostic Phase)

Context:
We are beginning Phase 8.8.3. In this first subphase, we perform a 100% diagnostic, zero-modification audit of the entire strategy engine.
This audit must produce a complete Strategy Status Map – Part 1 to guide the minimum fixes and the subsequent rebuild in Phase 9.

Authentication (use only the test user):

username: testuser123
password: SecurePass123!

🎯 Objectives for 8.8.3-A

Replit must:

1. Map ALL 9 strategies and their dependencies

For each strategy:

required indicators

imported modules

expected FX5 inputs

data shape expectations

microstructure requirements

risk parameters

timeframes used

output fields generated

2. Identify all legacy V1/V2 references

Search for:

old scoring logic

deprecated indicators

unused params

dead code paths

V1/V2 signal objects

Dema / Nodal placeholders

old guardrail files referenced

3. Document missing indicator inputs

For each strategy, list:

what indicators they expect

what indicators exist today

what indicators are missing

what must be added in Phase 9

4. Validate output compatibility with ready-to-buy

For each strategy:

check shape of StrategySignal return

check missing fields

check invalid/NaN values

check type mismatches

check timestamp fields

check if ready-to-buy can accept the output

5. Guardrail compatibility audit

Check whether:

guardrails falsely reject valid strategy signals

guardrails expect fields strategies do not supply

cooldown logic blocks strategy evaluation incorrectly

max positions or kill-switch logic misfires

6. Produce the Strategy Status Map — Part 1

Format (JSON + Markdown summary):

For each strategy:

strategyName:
  status: working | partial | broken
  requiredIndicators: [...]
  availableIndicators: [...]
  missingIndicators: [...]
  dependencies: [...]
  legacyReferences: [...]
  outputCompatibility:
      readyToBuyCompatible: true/false
      issues: [...]
  guardrailCompatibility:
      passes: true/false
      issues: [...]
  notes: [...]


Also produce:

Global Indicator Availability Map

Missing Microstructure Requirements Map

Legacy Logic Map

Strategy Compatibility Summary

Phase 9 Rebuild Dependencies List

Write the results to:

docs/audits/PHASE_8.8.3A_STRATEGY_ENGINE_AUDIT.json
docs/audits/PHASE_8.8.3A_STRATEGY_ENGINE_AUDIT.md

🧪 Verification Replit Must Perform

After the audit is generated, Replit must:

✔ Display the JSON summary (top-level only)
✔ Display the Markdown summary (first 50 lines)
✔ Confirm that no code was modified
✔ Confirm the audit includes all 9 strategies
✔ Confirm that dependencies include DHMA microstructure inputs

🏁 Final Expected Output

Replit should end with a message:

“REB 8.8.3-A audit complete. Strategy Status Map generated successfully. No code modified.”

✔️ Ready to run 8.8.3-A



