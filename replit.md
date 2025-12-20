# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for the Kraken exchange. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, leveraging OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its core purpose is to deliver a comprehensive, resilient, and continuously self-optimizing trading platform, aiming for market potential through advanced automation and AI integration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application uses a mobile-first React, TypeScript, and Vite frontend, communicating with a Node.js/Express backend providing a RESTful API and WebSocket support. PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, handles data persistence. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. An AI Orchestrator & Command Center, powered by GPT-4o, provides an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, and a Continuous Learning Pipeline. The system employs a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, and an Autonomy Layer with Safety Guardrails, supporting paper trading simulation and multi-intent command processing.

The architecture utilizes a global mode-based engine with a `ModeRegistry` for telemetry and `MetricsCore` for centralized metrics. Live pricing is managed by a `LivePricingAdapter` with dual-source integration and a `KrakenWebSocketAdapter`. The Goals Engine UI offers advanced universe and signal controls, execution rhythm controls, and simplified daily target goals with a Goal Feasibility Validation & Audit System, and an adaptive learning system.

The system incorporates a modern `guardrails_v2` schema, supporting dual-mode operation and real-time WebSocket broadcasts, with a `GuardrailPolicy Service` as the single backend source of truth. The DHMA Strategy implements Dual-Horizon Microstructure Alpha with dynamic position sizing and intelligent adaptive parameter optimization. The Strategic Drive & Profit Optimization Engine tracks strategies and computes a global Strategic Drive Index (SDI).

Monitoring includes strategy usage summary, passive learning, cross-user mode synchronization, and a trade execution verifier. The system uses an authoritative trading state contract via `/api/trading/status` and `trading_state_changed` WebSocket events. A Service-Layer Non-Blocking Refactor eliminated blocking in paper and live trading, replaced by an In-Memory Operation Queue. A Unified Engine Health Monitor provides comprehensive health monitoring with auto-recovery, real-time telemetry, and anomaly detection.

Dry-Run Mode introduces safe, non-mutating trade pipeline validation. An Active Filter Pool with TTL-based expiry and deduplication is implemented. The FX5 Scanner maintains a persistent pool of survivors, running independently.

Execution Safety Alignment ensures `preComputedNotional` from P2 signals is used for `checkPositionSizeCap`. A Signal Creation & Sizing Pipeline Audit (`B5SizingAuditService`) provides a comprehensive audit trail for the entire signal-to-trade pipeline across all 9 strategies. A Unified Sizing Pipeline Refactor standardizes the signal-to-trade sizing pipeline, implementing exposure-budget-based sizing and centralizing sizing in the Signal Orchestrator.

A Hard Reset Service provides a single authoritative path for complete paper simulation reset. Execution Engine Integrity ensures P&L calculations use only real market data. Kraken Canonical Symbol Mapping introduces a single authoritative symbol mapping layer for Kraken using a `BASE/QUOTE` internal format, with a Symbol Map and Symbol Resolver. WebSocket Subscription & Tick Flow Diagnostics implement tracing of the complete WebSocket subscription lifecycle and 8-stage price tracing. Tick Frequency Stabilization improves WebSocket tick reliability by detecting and correcting slow, irregular, or frozen tick streams with auto-resubscription.

A centralized price cache module ensures a single source of truth for active trade pricing, updated from WebSocket and REST. WebSocket Subscription Reliability Fix addresses low WebSocket coverage by subscribing all open positions on engine start, new trades, and reconnects, with a 5-second subscription health audit. Database Symbol Normalization ensures all database symbols use canonical BASE/QUOTE format.

Enhanced Active Trades UI provides comprehensive UI improvements including new columns for Source/Frequency, Volume 24h, and Confidence, a prominent GlobalMetricsBar displaying portfolio metrics, and a reset session button for paper trading. Volume Enrichment persists 24h volume data at trade creation using FX5 with Kraken REST API fallback. Trade History Table enhancements include new columns for Quantity and Confidence, and improved number formatting.

Fee and Slippage Tracking + Pagination enhances trade transparency and table usability by adding fee and slippage data to trades and open positions, and enabling filtering, sorting, and pagination of trade history records. Full Cost Transparency implements comprehensive P/L breakdown across the platform, tracking Gross P/L, Total Cost (entry/exit fees, slippage), and Net P/L.

Financial Integrity Verification & Diagnostic Validation implements a verification-only diagnostic suite, including Balance Reconciliation, Guardrail Input Verification, P/L Sanity Check, and Analytics Scope Verification. The manual close cost model correctly calculates exit slippage and total cost, mirroring the engine's `closePosition` method. The portfolio summary endpoint now separates `cashBalance` (starting + realized P/L only) from `portfolioValue` (cash + unrealized P/L). Guardrails use Current Balance (starting + realized P/L) for risk calculations.

Signal Flow Correction & Confidence Source Consolidation corrects the signal processing flow in Signal Orchestrator, with NGC (Normalized Global Confidence) as the single authoritative source of confidence. Adaptive Normalization, Enhanced Risk & Durability Framework implements Adaptive Rolling Normalization, an Enhanced Risk Metric, CWQI Durability Decay, and Strategy-Specific ProfitRate Floors.

RTB Queue Service Consolidation consolidates RTB refresh responsibility, implementing a TCL 5-Minute Failsafe and a Unified Refresh Cycle owned by `ReadyToBuyService`. RTB UI Unification consolidates the Ready-to-Buy UI with a `UnifiedReadyToBuyTable` and a unified endpoint `/api/trading-signals`. An Event-Driven TCL Watchdog System replaces polling-based TCL activation with an event-driven architecture using a `TCLWatchdog Service` and an `Extended Event Bus`.

RTB Clearing & Synchronization: `clearReadyToBuy()` calls `readyToBuyService.clearQueue(mode)` and broadcasts `rtb:cleared` WebSocket events for UI synchronization. RTB Promotion Cleanup & Dynamic Re-Ranking removes promoted signals and reconfirms RTB signals with fresh market data every 30 seconds, applying CWQI durability decay.

SQE Integrity Enforcement implements pair-level duplicate validation and continuous SQE re-qualification, rejecting signals with `duplicate_pair_active` and re-validating signals every 30-second cycle. Verification & Hardening implements configurable CWQI Decay, Pair-Key Normalization, and Engine-Aware Refresh Control.

RTB Stabilization & Diagnostics includes conditional TTL expiry for missed refreshes, skip-self dedupe in `queueSQESignal()`, CWQI floor clamping, auto-reinitialize refresh/TCL timers on startup, TCL threshold adjustments, `cleanupExpiredSignals()` on engine start, and SQE rejection diagnostic logging. Paper Trade History Retention Fix extends paper trade retention to 30 days.

Central Clock Architecture (Directive 8.8.4-A3.R7) introduces a synchronized timing system using `CentralClockService` that emits 1-second ticks to coordinate all timing-dependent subsystems. FX5 Scanner, RTB Refresh, and TCL Watchdog now subscribe to the Central Clock for deterministic 30-second aligned intervals. The TCL Watchdog uses tick-based failsafe timing (default 120 seconds) and emits SlotOpened, RTBThresholdMet, and FailsafeTrigger events via an enhanced EventBus with a 200ms event queue processor for reliable event handling. The startup sequence ensures Central Clock starts first, followed by event listeners, then services.

System Harmonization (Directive 8.8.4-A3.R9.0) implements comprehensive RTB, TCL, and SQE alignment:
- **SQE Calibration**: Restored thresholds (MIN_NGC=0.55, MIN_CWQI=0.45) targeting 35-50% pass rate. NGC formula: normalize→blend (0.4*NGC + 0.4*profitRate + 0.2*(1-risk)).
- **RTB Refresh Realignment**: Per-signal rolling TTL with 30-second individual expiry, statusUpdatedAt tracking in metadata, and enhanced deduplication key (symbol:strategy:createdAtBucket).
- **TCL Synchronization Barrier**: Atomic `refreshComplete` flag prevents TCL from querying RTB mid-refresh cycle. All `checkSignalThresholdLive()` calls require explicit barrier state (no default parameter). Error paths keep barrier closed; only successful refresh releases it.
- **TradingScheduler**: Unified Central Clock consumer that fans out to FX5Scanner, RTB, and TCL, reducing CPU spikes ~10%.
- **Performance Metrics**: Auto-starting `PerformanceMonitor` tracks sqe_evaluation_rate, rtb_refresh_latency, tcl_activation_delay, and queue_churn_rate with 60-second summary logs. All queue removal paths (promotion, dedupe, SQE failure, expiry, TTL, bulk clear) call `recordQueueRemove()` exactly once per deletion.
- All log tags standardized to `[A3.R9.0]` across SQE, RTB, and TCL modules.

Normalization & Refresh Stagger Harmonization (Directive 8.8.4-A3.R9.0.A) implements:
- **Pre-Blend Normalization (R9-D1)**: Explicit nBase/nProfit/nRisk variables before NGC blending, preventing double compression. Diagnostic log: `[A3.R9.0.A][NGC_NORMALIZED]`.
- **Uniform Refresh Stagger (R9-D2)**: Hash-based signal distribution using djb2 algorithm. Signals sorted by offset and processed with staggered delays (scaled 0-5s window). Diagnostic log: `[A3.R9.0.A][RTB_REFRESH_STAGGER]`.
- **Performance Monitor Consistency (R9-D3)**: Updated header and log tags to `[A3.R9.0.A][METRICS]`.

Engine Activation Standardization (Directive 8.8.4-A3.R9.0.B) implements:
- **Direct Execution Guard**: `server/paper-trading-start.ts` blocked via `ALLOW_DIRECT_ENGINE_START` guard. All engine starts must go through authenticated API endpoint `/api/paper-sim/start`. Diagnostic log: `[A3.R9.0.B][ENGINE_START_BLOCKED]`.
- **Provenance Tracking**: `start(source: 'api' | 'internal' | 'unknown')` parameter flows through `PaperPortfolioManager` → `PaperExecutionEngine`. Diagnostic log: `[A3.R9.0.B][ENGINE_START]` with source and PID.
- **Redundant Start Safeguard**: Engine blocks duplicate start calls when already running. Diagnostic log: `[A3.R9.0.B][GUARD]`.
- **CLI Wrapper**: `scripts/start-paper-sim.sh` provides authenticated API access using `PAPER_SIM_TOKEN` environment variable.

## External Dependencies
- **Kraken Exchange API**: Market data, trade execution, account management.
- **Kraken WebSocket API**: Real-time ticker feed for open trade price monitoring.
- **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
- **Neon Database**: Serverless PostgreSQL database.
- **Binance Public API**: External market price feed (primary for live pricing).
- **CoinGecko API**: External market price feed (fallback for live pricing).
- **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.