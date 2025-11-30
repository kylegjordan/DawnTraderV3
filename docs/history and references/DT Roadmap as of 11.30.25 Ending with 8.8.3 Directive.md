# DawnTrader Roadmap as of November 30, 2025

Below is the Roadmap we are currently working on for the Dawn Trader trading app.

---

## Phase 8 — Fix & Complete the Paper-Mode Trading Engine

This phase brings the entire paper-trading engine to a fully functioning, end-to-end state, without Lottie.

| Subphase | Description | Status |
|----------|-------------|--------|
| 8.1 | Fix accounting model (FX5) | ✅ COMPLETED |
| 8.2 | Fix passive learning isolation | ✅ COMPLETED |
| 8.3 | Fix scan cadence | ✅ COMPLETED |
| 8.4 | Fix breakdown accuracy | ✅ COMPLETED |
| 8.5 | Fix batch selection | ✅ COMPLETED |
| 8.6 | Fix top-end rotation & UI | ✅ COMPLETED |
| 8.7 | Activate Unused Filters | ✅ COMPLETED |
| 8.8 | Build Real-Time Data Pipeline | 🔄 IN PROGRESS |
| 8.9 | Increase Scanner Batch Size | ⏳ PENDING |
| 8.10 | Execute Real Simulated Trades | ⏳ PENDING |
| 8.11 | Role Stability & Auth Fixes | ⏳ PENDING |

---

### 8.8 — Build Real-Time Data Pipeline

- Filtered pool → 5–10 sec
- Ready-to-Buy → 2–3 sec
- Active trades → 1–2 sec
- Uses ticker batching
- Ensures we NEVER compete with scan budget

### 8.9 — Increase Scanner Batch Size

- Move from 60 → 300+ per scan
- After real-time pipeline is operational
- Fully rotate top-end in ~30–60 sec
- Validate throughput + rate limits

### 8.10 — Execute Real Simulated Trades

A dedicated step confirming that:
- Strategies fire correctly
- Conditions to open trades work
- Conditions to close trades work
- Portfolio updates correctly
- Risk guardrails are honored in real trade execution
- ALL THREE data loops function:
  - scan engine (filtering)
  - strategy engine (evaluating filtered pool)
  - execution engine (open/close trades)

### 8.11 — Role Stability & Auth Fixes

- Correct role storage, server validation, reconnection, permissions
- Permanently repairs user-role syncing (admin/owner)
- Eliminates the disappearing Filter Insights tab
- Replaces localStorage hacks with real server-side role validation
- Removes legacy "viewer/tester" user-mode logic

---

## Phase 9 — Full Strategy Engine Rebuild

Now that the system can filter, evaluate, execute trades, and close trades, we replace the micro-strategy layer entirely.

This includes:
- Full rebuild of strategy framework
- Replacing old heuristics
- Rewriting DHMA, MACH, switches, signals
- Adding rule-based, statistical, and trend systems
- Unified signal engine
- Integration tests with live data
- Backtesting framework (lightweight)

This is where Lottie will eventually learn from the clean strategy signals.

---

## Phase 10 — Full Lottie Restore

Lottie is plugged in after:
- Full paper trading execution engine works
- All filters are correct
- Real-time feeds are in place
- Strategy engine is rebuilt
- Trades open & close successfully

Lottie plug-in includes:
- Full restore of learning engine
- DPOE restored - internal motivational and gamification layer that drives Lottie to maximize portfolio growth
- Reinforcement dataset → paper trades
- Decision arbitration layer
- Guardrail compliance
- Scenario-based training

---

## Phase 11 — Live Execution Engine

This is where we adapt paper execution engine to real trading.

Includes:
- Replace mock execution with real Kraken orders
- Build error-handling for order rejection
- Slippage handling
- Real-time WebSocket Kraken feeds
- Retry logic
- Real trading guardrails
- Wallet tracking
- Real account updates

Paper and live trading engines will share 90% of the same code.

---

## Phase 12 — AWS & Supabase Migration

Once live engine is working:
- Clone runtime state
- Spin parallel environment
- Migrate DB schemas
- Migrate Lottie memory store
- Migrate Secrets / Config
- API gateway + load balancer
- Real-time logs
- 24/7 uptime environment
- Run both systems in parallel for 48 hours
- Validate consistency
- Cutover to AWS

---

## Phase 13 — Restore Walter

Walter is restored after the live trading system is stable on AWS.

- Walter becomes the long-term, long-horizon advisor
- Historical analytics + suggestion engine
- Performance heuristics
- Strategy tuning insights
- Portfolio simulation

---

# Phase 8.8 Detailed Plan

## 🌐 Phase 8.8 — Build Real-Time Data Pipeline

Phase 8.8 is the beginning of the end-to-end trading engine stabilization, ensuring that:

The entire system can:
- accept filtered FX5 output
- feed it into signals
- feed signals into the strategy engine
- feed signals into ready-to-buy
- feed ready-to-buy into the trading engine
- and run PAPER TRADES end-to-end without breaking anything

### The Goal of Phase 8.8

"Make DawnTrader run end-to-end simulated trades reliably, using real FX5 scanner output, with a clean real-time data pipeline that is forward compatible with Phase 9 strategy rebuild."

What that means:

🟦 Scanner → 🟩 Signal → 🟧 Strategy → 🟨 Ready-to-Buy → 🟥 Trading Engine → 🟪 Portfolio → 🟫 UI

We must ensure:
- consistent data structures
- identical field names
- no legacy attributes break downstream logic
- no race conditions
- no passive/active contamination
- proper WebSocket emissions
- correct persistence of trade state
- guardrails enforced correctly in REAL-TIME
- No legacy code paths sabotage the pipeline

---

## Phase 8.8 Subphases

### 🔷 8.8.1 — Scanner Output Audit ✅ COMPLETED

The FX5 → eligibleSymbols output must be clean, consistent, and formatted for the downstream pipeline.

Tasks:
- Verify eligibleSymbols structure matches current expectations
- Remove any legacy fields (score, reasons, confidence, deprecated metrics)
- Validate numeric types (avoid stringified floats)
- Ensure breakdown values aren't reused incorrectly in strategy logic
- Validate Stage 3 "scan_tick" emits clean payloads without duplicates

---

### 🔷 8.8.2 — Signal Engine Audit ✅ COMPLETED

We validate that the signal engine actually produces signals from real FX5 filtered output.

Tasks:
- Confirm buy/sell triggers fire where they should
- Detect missing fields required for signal generation
- Identify which indicators are broken or missing
- Document signals that never fire
- Confirm signals flow into ready-to-buy queue

---

### 🔷 8.8.3 — Strategy Engine Audit & Minimum Fix 🔄 NEXT

We audit strategy logic to identify broken, obsolete, or missing components — and apply minimum fixes.

#### Audit Tasks:
- Map every strategy module and its dependencies
- Identify references to legacy V1/V2 logic
- Document missing indicator inputs
- Validate output compatibility with ready-to-buy
- Ensure guardrails don't prematurely block strategy decisions

#### Minimum Strategy Engine Fix Includes:
- Fix heuristic-trader.ts
- Ensure DHMA, Dema, Nodal, etc. produce real signals
- Ensure signals move pairs: filtered → ready to buy → trade opened → trade monitored → trade closed
- End-to-end execution of simulated trades
- Confirm paper portfolio changes
- Confirm trade ledger updates
- Confirm trade lifecycle events
- Ensure guardrails apply to real trade decisions

**Output**: A "Strategy Status Map" for Phase 9.

---

### 🔷 8.8.4 — Ready-To-Buy Audit

Ensure signals → ready-to-buy is correct and fast.

Tasks:
- Ensure signals are queued correctly
- Verify sorting logic and prioritization
- Validate cooldown logic
- Fix duplicate or stale entries
- Confirm that ready-to-buy outputs are emitted cleanly

---

### 🔷 8.8.5 — Trading Engine Audit (Paper Mode)

Ensure trade creation, monitoring, and completion all function properly.

Tasks:
- Validate trade open logic
- Validate lifecycle updates (open → monitor → close)
- Validate guardrails (max-risk, cooldown, max positions, kill-switch)
- Validate PnL tracking and state transitions
- Confirm no ghost or duplicate trades

---

### 🔷 8.8.6 — Portfolio + DB/Watchlist Sync Audit

Ensure downstream systems receive correct updates.

Tasks:
- Verify portfolio updates correctly reflect trades
- Ensure watchlist entries aren't overwritten incorrectly
- Validate DB tables receive correct updates
- Correct stage3 cache inconsistencies

---

### 🔷 8.8.7 — Tick Loop Concurrency / Race Fix

Prevent race conditions between scanning ticks and trading ticks.

Tasks:
- Serialize or lock scan_tick vs trading_tick
- Ensure state reads/writes do not overlap
- Prevent partial updates from being consumed
- Guarantee stable timing cycles

---

### 🔷 8.8.8 — Real-Time Guardrail Enforcement

Guardrails must work live, not just at trade creation.

Tasks:
- Validate max-risk per trade
- Validate portfolio max-positions
- Validate cooldown
- Validate daily-loss kill switch
- Remove ANY legacy guardrail logic

---

### 🔷 8.8.9 — The Green Path Test (Required Milestone)

One real FX5 filtered symbol → real signal → strategy approval → ready → trade open → trade complete.

Output required:
- Full timestamped log of each stage
- CycleId / pair / action trace
- Full state transition correctness

**This is the success badge for Phase 8.8.**

---

### 🔷 8.8.10 — Backwards Compatibility Contract (For Phase 9)

Ensure that Phase 9 can rebuild the strategy engine without breaking the pipeline.

Output:
- Field input requirements
- Deprecated fields
- Broken indicators
- Missing features
- Strategy wiring points

---

### 🔷 8.8.11 — Throughput Prep for Phase 8.9

Ensure the entire system can handle 300–500 batch scans.

Tasks:
- Test memory usage
- Test event queue responsiveness
- Validate processing time
- Ensure guardrails can keep up with throughput

---

## END CONDITIONS FOR PHASE 8.8

✔ When activated, paper mode successfully simulates trades  
✔ No race conditions  
✔ Correct data flow scanner → strategy → trading  
✔ Guardrails stable  
✔ Backwards compatibility contract created  
✔ Real-time pipeline documented  

---

**Document Status**: Active Roadmap  
**Last Updated**: November 30, 2025
