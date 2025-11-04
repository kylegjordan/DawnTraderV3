Dawn Trader v2.4 Charter

Version: 2.4
Date: November 4, 2025
Authors: Kyle G. Jordan & ChatGPT-5

🧭 Mission Statement

Grow Kyle’s portfolio as much as possible, as fast as possible, within defined risk guardrails, while providing clear and transparent reasoning for every trade decision—whether executed or declined.

🏗️ System Architecture Overview
🧩 Core Architecture
├── LATTI (Learning Autonomous Trading and Tuning Intelligence)
│   ├─ Adaptive AI for autonomous trading, motivation, and tuning
│   └─ Replaces Walter as local intelligence (Phase 31 SDPOE lineage)
├── Cortex Layer
│   ├─ Central data memory and decision telemetry
│   ├─ Stores all AI reasoning and outcome logs
│   └─ Feeds performance history to LATTI’s learning modules
├── Guardrails v2 + Behavioral Engine
│   ├─ Risk caps, exposure control, and behavioral limiters
│   └─ Derived from Phases 37–40
├── Paper / Live Isolation Pipelines
│   ├─ Paper: Simulation and learning
│   └─ Live: Real exchange execution (Kraken API)
├── Job Handler (Phase 38–39 lineage)
│   ├─ Oversees all trading loop jobs
│   ├─ Prevents overload and API call collisions
│   └─ Enables smooth loop cycle timing
└── Engine Telemetry (Phase 39 lineage)
    ├─ Measures latency, response times, and queue health
    └─ Feeds performance reports to Cortex for tuning

🧠 LATTI Autonomous Framework
🕐 Phase 31 – SDPOE Motivational Layer (Self-Driven Pursuit of Optimization & Excellence)
LATTI = Core AI framework replacing Walter’s original API-driven model.

1. SDPOE Motivational Layer

Gamifies trading behavior: LATTI competes against its own previous best results.

Reward Function: Increases satisfaction when equity growth accelerates within guardrails.

Penalty Function: Reduces parameter confidence when loss exceeds safe thresholds.

Drives Constant Improvement: LATTI “learns to win,” treating each trading session as a measurable competition.

2. Learning Engine
Mode	Description
Active Learning	During live or paper trading; adapts in real time.
Passive Learning	When not trading; analyzes historical data, strategy outcomes, and telemetry metrics.
3. Tuning Module (LATTI Tuning Tab)

Tracks Confidence, Stability, and Performance scores.

Adjusts guardrails and filters automatically based on risk-adjusted returns.

Displays Learning Insights and recent self-adjustments.

4. Telemetry Interface

Exposes real-time diagnostic metrics to the Engine Telemetry tab.

Provides audit-ready confidence logs, trade summaries, and latency heat maps.

🎯 Goals Engine
🕐 Origin: Phase 35–36 (Guardrails + Goals Presets)

1. Presets
Preset	Risk Level	Description
Conservative	1–2%	Focused on stability and minimal exposure.
Baseline	3–4%	Balanced growth and safety.
Optimistic	5–6%	Higher reward-to-risk ratio.
Maximum	7–8%	Aggressive risk profile; faster growth.
Custom	Variable	Activated when any parameter is manually edited.

Custom mode allows manual override of guardrails and filters, otherwise LATTI manages all automatically.

2. Core Four Guardrails
Guardrail	Default	Adjustable	Description
Risk Per Trade (%)	4%	✅	Maximum risk exposure per trade.
Max Open Positions	12	✅	Controls concurrency limits.
Symbol Cooldown (min)	15	✅	Prevents repetitive re-entries.
Daily Loss Kill Switch (%)	7%	✅	Halts trading when loss exceeds cap.

Each guardrail includes a toggle for LATTI-controlled or manual mode.
Manual toggles activate Custom Preset Mode.

3. Screeners / Filters
🕐 Origin: Phase 34 (Behavioral Guardrails Integration)


Volume & Liquidity

Price Range

Volatility Index

Technical Signal Strength

Market Momentum

Data Age (min historical window)

Correlation Filter

Behavioral Safeguards

Each screener has check boxes for LATTI vs Manual control.

4. Strategies (9 Total)
🕐 Origin: Phase 30–33

#	Strategy Name	Type	Description
1	VWAP Pullback	Momentum	Entry near VWAP with pullback confirmation.
2	ABCD Long	Pattern	Classic pattern with time-based entry.
3	SMA Trend Ride	Trend	Follows long-term trend with crossover logic.
4	Breakout	Momentum	Entry on range breakout, volume confirmation.
5	Mean Reversion	Counter	Trades against extreme RSI divergences.
6	Range Trading	Neutral	Buys low/sells high within channel.
7	VWAP Bounce	Momentum	Entry on VWAP support/resistance bounce.
8	Liquidity Trap	Opportunistic	Detects false breakouts.
9	DHMA	Microstructure	Dual-Horizon Alpha Strategy (Phase 33).
Strategy Prioritization (Phase 33 refinement)

Apply only top 2–3 most relevant strategies per filtered pair.

Prioritization based on volatility, signal coherence, and liquidity rank.

Reduces compute load and API calls per cycle.

5. Coherency Rules
🕐 Origin: Phase 37 (Coherency Engine)


Rule 001: Portfolio Risk vs Kill Switch

Rule 002: Total Exposure Cap

Rule 003: Cooldown Minimum

Rule 004: Cooldown Maximum

Rule 005: Manual Override Exclusivity

Rule 006: Portfolio Risk Range

Rule 007: Kill Switch Maximum

Rule 008: Max Positions Range

Rule 009: Mode Isolation (paper vs live)

Rule 010: Learning Expansion Safety Caps

Coherency rules act as failsafes, not silent filters—the user always sees why LATTI blocked a trade.

⚙️ Trading Flow
🕐 Consolidated from Phase 32–34 builds


1️⃣ Filter Insights — Raw pairs pulled from Kraken (every 10–30s).
2️⃣ Filtered Pairs — Surviving pairs post-screeners.
3️⃣ Ready to Buy — Strategies applied; trade-ready candidates.
4️⃣ Active Trades — Currently open positions.
5️⃣ Trade History — Closed positions and outcomes.

Each tab corresponds to a step in the trade engine pipeline.

🧭 System Monitoring
🕐 Phase 38–39 lineage

1. LATTI Tuning Tab

Confidence, Stability, and Performance scores.

Displays LATTI’s autonomous parameter adjustments.

2. Engine Telemetry Tab

Queue health (paper/live).

Trading engine response times and recovery metrics.

Real-time latency tracker.

Strategy telemetry summaries.

3. Job Handler

Staggered cycle management for data pulls, filters, and strategy runs.

Prevents simultaneous Kraken API collisions.

Retries failed jobs and logs them to the Cortex.

🔁 Loop Timing & Behavioral Cadence
Function	Interval	Description
Kraken Data Pull	10–30s	Retrieves 300–500 prioritized pairs.
Filter Application	60s	Applies behavioral filters and guardrails.
Strategy Evaluation	90s	Evaluates surviving pairs via strategy matrix.
Ready-to-Buy Review	120s	Confirms actionable entries.
Execution Loop	1–2s	Updates open trades, positions, and metrics.
LATTI Tuning Cycle	30m	Periodic review of AI learning outcomes.
👤 User Accounts
Role	Username	Password	Description
Primary	kylegjordan	(private)	Admin user; full control.
Test	testuser123	SecurePass123!	Test account for E2E validation.

Login UI Features:

Username or email input.

Show/hide password toggle.

JWT session persistence.

Separate state tracking for paper and live modes.

🚫 Excluded & Deferred Components
Category	Status	Description
User-level settings	❌ Excluded	Permanently removed—no legacy user data control.
Walter API Reattachment	⏳ Deferred	Connection points preserved for future AI (local or external).
External WebSocket AI Training	⏳ Deferred	Planned for LATTI v3.0 expansion.
🔒 Security & Data Integrity

STRICT_MODE=1 enforces development-safe restrictions.

Mode-level data isolation (no cross-pollination between Paper/Live).

Cortex stores timestamped decisions and outcomes for every trade.

Audit trail available for every API call and LATTI adjustment.

🧩 Success Criteria

Full end-to-end trading pipeline executes without runtime errors.

LATTI autonomously tunes filters and guardrails based on results.

Telemetry confirms sub-2s response loop under load.

Coherency and guardrail checks pass consistently.

Paper and Live modes operate independently with verifiable data.

SDPOE motivational engine improves cumulative portfolio growth rate across sessions.

🗂️ Phase Lineage Summary
Phase	Feature / Module	Status
Phase 30–33	Strategy Framework & DHMA	✅ Integrated
Phase 31	SDPOE Motivational Layer (LATTI Core)	✅ Core Framework
Phase 34	Behavioral Guardrails	✅ Integrated
Phase 35–36	Goals Engine & Presets	✅ Integrated
Phase 37	Coherency Rules	✅ Integrated
Phase 38	Job Handler (Anti-Crash System)	✅ Refactored
Phase 39	Engine Telemetry System	✅ Refactored
Phase 40	Guardrails v2 Behavioral Filters	✅ Core Architecture
Phase 41	E2E Integration + Validation	✅ Foundation for v2
Phase 42	DawnTrader v2 Blueprint & Rebuild	🚧 Active

End of Document
Dawn Trader v2.4 – Charter serves as both technical and philosophical north star for all architecture, logic, and behavioral systems.