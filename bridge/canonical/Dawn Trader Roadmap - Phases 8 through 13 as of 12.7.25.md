🔵 8.8.3 — Strategy Engine Audit + Minimum Fix
➡ inspect per-strategy cooldowns
➡ inspect exclusion logic
➡ inspect signal eligibility
➡ inspect strategy scoring decay
➡ inspect indicator feed continuity
➡ verify price feed assumptions
Final Strategy Engine Map
This produces the required deliverable for Phase 9.
________________________________________

🔷 8.8.4 — Ready-To-Buy Audit
Ensure signals → ready-to-buy is correct and fast.

Tasks:
• Ensure signals are queued correctly.
• Verify sorting logic and prioritization.
• Validate cooldown logic.
• Fix duplicate or stale entries.
• Confirm that ready-to-buy outputs are emitted cleanly.
NEW TABLES:
✓ RTB Conversion Table
Shows conversion rate from Active Pool → RTB.

🔷 8.8.5 — Trading Engine Audit (Paper Mode)
Ensure trade creation, monitoring, and completion all function properly.

Tasks:
• Validate trade open logic.
• Validate lifecycle updates (open → monitor → close).
• Validate guardrails (max-risk, cooldown, max positions, kill-switch).
• Validate PnL tracking and state transitions.
• Confirm no ghost or duplicate trades.
⭐ Order Execution Modeling (MANDATORY)
•	Slippage model
•	Spread cost model
•	Fee model
•	Limit vs market simulation
•	Partial fill model
•	Stop-loss fill model
⭐ Stop Loss & Take Profit Engine (MANDATORY)
•	SL/TP triggers
•	ATR min boundaries
•	TP/SL fill simulation
•	Gap/slippage
•	Reason-for-close data
✓ Trade Outcomes Summary Table
•	Total trades
•	Closed trades
•	Win rate
•	Avg win
•	Avg loss
•	Largest win/loss
•	Duration stats
________________________________________

🔷 8.8.6 — Portfolio + DB/Watchlist Sync Audit
Ensure downstream systems receive correct updates.

Tasks:
• Verify portfolio updates correctly reflect trades.
• Ensure watchlist entries aren’t overwritten incorrectly.
• Validate DB tables receive correct updates.
• Correct stage3 cache inconsistencies.
________________________________________


🔷 8.8.7 — Tick Loop Concurrency / Race Fix
Prevent race conditions between scanning ticks and trading ticks.

Tasks:

• Serialize or lock scan_tick vs trading_tick.
• Ensure state reads/writes do not overlap.
• Prevent partial updates from being consumed.
• Guarantee stable timing cycles.

🔷 8.8.8 — Real-Time Guardrail Enforcement
Guardrails must work live, not just at trade creation.

Tasks:
• Validate max-risk per trade.
• Validate portfolio max-positions.
• Validate cooldown.
• Validate daily-loss kill switch.
• Remove ANY legacy guardrail logic.
________________________________________

🔷 8.8.9 — The Green Path Test (Required Milestone)
One real FX5 filtered symbol → real signal → strategy approval → ready → trade open → trade complete.

Output required:
• Full timestamped log of each stage.
• CycleId / pair / action trace.
• Full state transition correctness.

This is the success badge for Phase 8.8.

🔷 8.8.10 — Backwards Compatibility Contract (For Phase 9)
Ensure that Phase 9 can rebuild the strategy engine without breaking the pipeline.

Output:
• Field input requirements
• Deprecated fields
• Broken indicators
• Missing features
• Strategy wiring points
Must now include:
•	Order execution modeling contract
•	SL/TP contract
•	Fee model contract
•	Tick concurrency contract
•	Strategy output consistency contract
________________________________________

🔷 8.8.11 — Throughput Prep for Phase 8.9
Ensure the entire system can handle 300–500 batch scans.

Tasks:
• Test memory usage
• Test event queue responsiveness
• Validate processing time
• Ensure guardrails can keep up with throughput

Additional items:
•	RTB throughput under spread model
•	Open Trades throughput under SL/TP
•	Trade History scalability testing


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



