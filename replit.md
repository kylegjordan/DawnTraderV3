# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, leveraging OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its core purpose is to deliver a comprehensive, resilient, and continuously self-optimizing trading platform with a focus on business vision, market potential, and project ambitions to provide a cutting-edge trading solution.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first, responsive design, and a Node.js/Express backend providing a RESTful API and WebSocket support. PostgreSQL, utilizing Neon serverless driver and Drizzle ORM, handles data persistence. Authentication is managed via username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. An AI Orchestrator & Command Center, powered by GPT-4o, integrates an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, Intelligence Refinement, Real-Time Execution, and a Unified Portfolio & Strategy State. This system employs a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, Continuous Learning Pipeline, `StateAwarenessService`, Intent Execution Framework with a `Pre-Execution Validator`, and an Autonomy Layer with Safety Guardrails & Operational Kill Switch. It supports paper trading simulation with a database-first architecture and multi-intent command processing. Live trading includes voice/chat activation and manual approval workflows.

The architecture utilizes a global mode-based engine (one per live/paper mode) shared by all users. `ModeRegistry` provides production telemetry, and `MetricsCore` centralizes metrics calculation with strict mode isolation, broadcasting real-time data via WebSockets. Live pricing is managed by a `LivePricingAdapter` with dual-source integration.

The Goals Engine UI offers advanced universe and signal controls, execution rhythm controls, and simplified daily target goals with Trading Pace presets. A Goal Feasibility Validation & Audit System tracks and validates goal changes. The Dashboard LATTI widget mirrors Goals Engine Target Daily Goals, displaying calculated values.

The system incorporates a modern `guardrails_v2` schema with four core guardrail parameters: Portfolio Risk per Trade %, Symbol Cooldown (minutes), Max Open Positions, and Daily Loss Kill Switch %. It features dual-mode operation with independent guardrail sets, coherency validation, and real-time WebSocket broadcasts. The **GuardrailPolicy Service** (`server/services/guardrail-policy.ts`) serves as the single backend source of truth. The Goals Engine features an adaptive learning system that automatically optimizes preset boundaries based on 30-day performance metrics.

The Screeners tab uses a unified v2 filter configuration. A comprehensive audit system ensures that only current, visible fields influence the trade engine. An automated anomaly detection system for override configuration changes, `AuditAnomalyDetectionService`, analyzes audit logs for unusual patterns.

**Adaptive Guardrails** introduces a local-only learning system (`AdaptiveGuardrails` service) that allows LATTI to adaptively tune parameters based on trading outcomes using variance-based statistical analysis of 30-day performance metrics.

**DHMA Strategy** implements Dual-Horizon Microstructure Alpha, a microstructure-based trading strategy. The `DHMAStrategy` module (`server/strategies/dhma.ts`) provides simplified microstructure features using OHLCV data. Position sizing uses dynamic down-weighting. DHMA parameters are configurable via a flexible, mode-aware parameter configuration system. The `DHMATuningService` implements intelligent adaptive parameter optimization for DHMA.

**Strategic Drive & Profit Optimization Engine** tracks 5 strategies with hourly performance analysis and computes a global Strategic Drive Index (SDI). "Soft Guardrails, Hard Coherency" is implemented via `StrategicDriveGuardrailService` controlling reallocation behavior. The Motivational Incentive Engine tracks `driveIndex` and `personalBest` based on SDI performance. A System Configuration Service manages global flags, including a `passiveLearning` mode. LATTI Learning Insights provide visibility into internal learning observations.

Monitoring and default operational state enhancements include strategy usage summary, passive learning as default, cross-user mode synchronization via WebSocket, and a trade execution verifier. The system uses an authoritative trading state contract via `/api/trading/status` and `trading_state_changed` WebSocket events for consistent state synchronization.

WebSocket Optimization and State Synchronization improvements include a singleton WebSocket connection pattern, hydrate-first state management for critical caches, and polling optimization. Authentication and Portfolio Balance Unification was achieved by creating a unified `apiFetch` base fetcher and enhancing `trading_state_changed` WebSocket broadcasts to include `portfolioOverview`.

The `MarketEvaluationService` (`server/services/market-evaluation.ts`) unifies all filtering under one service.

Service-Layer Non-Blocking Refactor eliminated service-layer blocking in paper and live trading operations.

In-Memory Operation Queue successfully replaced blocking operation locks with an asynchronous FIFO queue architecture, eliminating concurrent request collisions. Implemented `OperationQueue` class (`server/utils/operation-queue.ts`).

Unified Engine Health Monitor introduces comprehensive health monitoring with auto-recovery capabilities. Implemented `EngineHealthMonitor` service (`server/services/health-monitor.ts`) monitoring 6 subsystems. Real-time telemetry broadcasting via WebSocket `health_engine` topic.

Engine Telemetry Dashboard provides a production-ready frontend telemetry dashboard with real-time monitoring and contextual guidance.

Anomaly Detection & Color-Coded Alerting implements comprehensive anomaly detection with color-coded alerting and self-recovery capabilities for the unified engine health monitor across 6 subsystems.

Auto-Recovery Validation & Circuit Breaker implements intelligent auto-recovery orchestration with dry-run planning, cool-down enforcement, and circuit breaker protection.

Trade Telemetry Hardening & Broadcast Optimization implements comprehensive trade lifecycle telemetry with health monitor integration and optimized broadcast thresholds. Created `TelemetryService` (`server/services/telemetry-service.ts`).

Dry-Run Mode introduces safe, non-mutating trade pipeline validation. Trading engine checks `process.env.DRYRUN_TRADING` and skips trade creation when enabled, returning simulated trade objects with telemetry recording.

Single-Tenant Consolidation completed destructive migration to remove `user_id` from all operational tables, preserving 'kylegjordan' as canonical owner while maintaining paper/live mode isolation.

Gemini Performance Optimization implements full-stack adaptive self-regulation for production-grade performance, including dynamic backend optimization and frontend load optimization.

Startup & Telemetry Remediation + Modularization Kickoff remediates performance regressions through parallel lazy loading and enhanced compression. The system is transitioning to a modular structure (`/server/modules` and `/server/agent/bridge`).

Lottie Connectivity & Impact Audit mapped all LATTI/Lottie system connections across 4 core services, 13 API endpoints, 5 database tables, 6 UI components, and 5 scheduled jobs, confirming clean separation of concerns and zero external AI dependencies for LATTI's statistical analysis.

Orchestrator Connectivity & Impact Audit mapped all Orchestrator system connections (SignalOrchestrator, ReasoningOrchestrator, CLEOrchestrator, EthicsConsensusOrchestrator), confirming clean separation of concerns and independence from LATTI/Lottie. Bob agents are active and registered with ReasoningOrchestrator for DevOps, FullStack, UX, and Trading domains.

An Active Filter Pool with TTL-based expiry, deduplication logic, and passive-mode enforcement has been implemented. The FX5 Scanner now maintains a persistent pool of survivors with automatic cleanup and engine-state awareness. A standalone FX5 scanner service runs independently every 30 seconds for both paper and live modes, completely decoupled from trading engine state. Stage-3 now serves as the single source of truth for scan cycle state, emitting `scan_tick` and `scanner:breakdown` WebSocket events every 30 seconds.

The Filter Insights UI now uses REST data for Cycle Info and Last Scan Result fields. The backend endpoint `/api/paper-sim/diagnostics/scan-latest` calculates `nextScanInMs` server-side and returns zeroed payloads when the engine is STOPPED.

The legacy `scan24hAggregator` was replaced with an FX5-native module (`fx5-24h-window.ts`) that implements proper ACTIVE-only tracking for 24h metrics and rolling 1-hour window for cyclesPerHour calculation.

Critical fixes were applied to the Filter Insights Primary Metrics section with REST-only logic for Kraken Universe, Cycle Info, Last Scan Result, and 24h Filter Activity, including correct `nextScanInMs` calculation, improved frontend countdown, and accurate `getCyclesPerHour()` calculation.

Further primary metrics truth restoration involved implementing trading-activity semantics and proper reset behavior for `cyclesPerHour` to represent "trading activity only" (ACTIVE scans).

Final fixes for Primary Metrics addressed issues with countdown UI stuck at 0s, `cyclesPerHour` timing, and `uniqueEvaluated` calculation.

Critical portfolio balance synchronization for paper trading mode ensures `portfolioState.balance` (canonical source of truth) stays synchronized with `paperSimSessions.startingBalance` across all success and failure paths.

**REB 8.8.3-A Strategy Engine Deep Audit** (November 30, 2025) completed comprehensive read-only diagnostic of all 9 strategies (vwap_pullback, abcd_long, sma_trend_ride, breakout, mean_reversion, range_trading, vwap_bounce, liquidity_trap, dhma). All strategies confirmed HEALTHY with full indicator availability, complete guardrail integration, and consistent signal interfaces. No legacy V1/V2 code paths detected. LHTS (Local Heuristic Trader Service) confirmed as active Walter stand-in for offline optimization. Audit outputs: `docs/audits/REB-8.8.3-A_Strategy_Status_Map.json` and `.md`.

**REB 8.8.3-B Diagnostic Logging** (November 30, 2025) implemented comprehensive JSON diagnostic logging across all 9 strategies and SignalOrchestrator for runtime behavior validation. Each strategy now emits `[8.8.3-B][STRATEGY]` logs with input snapshots and signal outputs. SignalOrchestrator emits `[8.8.3-B][EVAL_CYCLE]` logs for per-symbol evaluation telemetry. Logs can be filtered via `grep "\[8.8.3-B\]"`. Documentation: `docs/audits/REB-8.8.3-B_Diagnostic_Logging.md`.

**REB 8.8.3-KS-A Kill Switch Audit** (November 30, 2025) completed comprehensive read-only audit of all trading state flags and kill switch mechanisms. Documented relationships between `killSwitchTripped`, `tradingSuspended`, `isEngineActive`, and `passiveLearning` flags. Identified redundancy between `killSwitchTripped` and `tradingSuspended`. Audit outputs: `docs/audits/REB_8.8.3-KS-A_Kill_Switch_Trading_State_Audit.md` and `REB_8.8.3-KS-A_State_Flags_Map.json`.

**REB 8.8.3-KS-B Kill Switch Unification** (November 30, 2025) unified kill switch state management around `killSwitchTripped` as single source of truth. Key changes: (1) `tripKillSwitch()` now also stops engine, (2) Trading start endpoint auto-clears kill switch, (3) Manual reset endpoints deprecated, (4) Frontend uses "Resume Trading" button calling `/api/trading/start`. `tradingSuspended` field eliminated. Documentation: `docs/audits/REB_8.8.3-KS-B_Kill_Switch_Unification_Complete.md`.

**REB 8.8.3-E Ready-to-Buy Integration** (November 30, 2025) wired Ready-to-Buy (RTB) system to real strategy signals from Active Filtered Pool. Key changes: (1) Paper execution engine now saves TradingSignal to database after best strategy signal selection, (2) Comprehensive symbol parsing for base/quote currencies (handles "BTC/USD", "FETEUR", "XBTUSDT" formats), (3) Removed legacy Refresh button from RTB component, (4) Added "Auto-updates every 30s" text with Clock icon. Signal flow: Strategy detection → saveTradingSignal → database → /api/trading-signals → RTB table (30s auto-refresh). Files modified: `server/services/paper-execution-engine.ts`, `client/src/components/trading/ready-to-buy-table.tsx`. Debug logging: `[8.8.3-E][RTB_ENQUEUE]` and `[8.8.3-E][RTB_API]` prefixes.

**REB 8.8.3-F Paper Trade Execution Path** (November 30, 2025) enabled paper trade execution through guardrails_v2 integration. Key changes: (1) Removed execution blocker in `processSignal()` method that was blocking trades pending guardrails_v2 migration, (2) Implemented `buildSettingsFromModeLevel()` for modern mode-level guardrails retrieval, (3) Added V2 percentage-based position sizing using `calculateRiskAmount()` helper, (4) Full trade lifecycle logging with `[8.8.3-F]` diagnostic tags for PROCESS, OPEN, RISK_REJECT, and CLOSE events. Execution flow: Signal → buildSettingsFromModeLevel() → Risk Manager validation → Position sizing → Trade creation/rejection. Risk checks include: stop-loss validation, max positions per asset, symbol cooldown, 10% position size cap, and kill switch status. Files modified: `server/services/paper-execution-engine.ts`. Debug logging: `grep "\[8.8.3-F\]"` to filter execution path logs. Documentation: `docs/audits/REB_8.8.3-F_Execution_Path_Notes.md`.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: External market price feed (primary for live pricing).
-   **CoinGecko API**: External market price feed (fallback for live pricing).
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.