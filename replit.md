# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, leveraging OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its core purpose is to deliver a comprehensive, resilient, and continuously self-optimizing trading platform with a focus on business vision, market potential, and project ambitions to provide a cutting-edge trading solution.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first, responsive design, and a Node.js/Express backend providing a RESTful API and WebSocket support. PostgreSQL, utilizing Neon serverless driver and Drizzle ORM, handles data persistence. Authentication is managed via username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. An AI Orchestrator & Command Center, powered by GPT-4o, integrates an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, Intelligence Refinement, Real-Time Execution, and a Unified Portfolio & Strategy State. This system employs a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, Continuous Learning Pipeline, `StateAwarenessService`, Intent Execution Framework with a `Pre-Execution Validator`, and an Autonomy Layer with Safety Guardrails & Operational Kill Switch. It supports paper trading simulation with a database-first architecture and multi-intent command processing. Live trading includes voice/chat activation and manual approval workflows.

The architecture utilizes a global mode-based engine (one per live/paper mode) shared by all users. `ModeRegistry` provides production telemetry, and `MetricsCore` centralizes metrics calculation with strict mode isolation, broadcasting real-time data via WebSockets. Live pricing is managed by a `LivePricingAdapter` with dual-source integration.

The Goals Engine UI offers advanced universe and signal controls, execution rhythm controls, and simplified daily target goals with Trading Pace presets. A Goal Feasibility Validation & Audit System tracks and validates goal changes. The Dashboard LATTI widget mirrors Goals Engine Target Daily Goals, displaying calculated values like Risk per Trade ($), Trades per Day, and Projected Portfolio Growth.

The system incorporates a modern `guardrails_v2` schema with four core guardrail parameters: Portfolio Risk per Trade %, Symbol Cooldown (minutes), Max Open Positions, and Daily Loss Kill Switch %. It features dual-mode operation with independent guardrail sets, coherency validation, backend API endpoints for GET/PUT guardrails, and real-time WebSocket broadcasts for configuration changes. The **GuardrailPolicy Service** (`server/services/guardrail-policy.ts`) serves as the single backend source of truth for guardrail values, enforcing runtime coherency. The Goals Engine features an adaptive learning system that automatically optimizes preset boundaries based on 30-day performance metrics.

The Screeners tab exclusively uses the unified v2 filter configuration. A comprehensive audit system ensures that only current, visible fields influence the trade engine through runtime validation and database views. An automated anomaly detection system for override configuration changes, `AuditAnomalyDetectionService`, analyzes audit logs for unusual patterns.

**Adaptive Guardrails** introduces a local-only learning system (`AdaptiveGuardrails` service) that allows LATTI to adaptively tune parameters based on trading outcomes using variance-based statistical analysis of 30-day performance metrics. A strict throttle mechanism limits changes to 3 per 24 hours. Override influence weighting adjusts AI aggressiveness based on user manual overrides.

**DHMA Strategy** implements Dual-Horizon Microstructure Alpha, a microstructure-based trading strategy. The `DHMAStrategy` module (`server/strategies/dhma.ts`) provides simplified microstructure features using OHLCV data. Position sizing uses dynamic down-weighting based on spread and toxicity. DHMA parameters are configurable via a flexible, mode-aware parameter configuration system stored in a `strategy_param_schema` table. The `DHMATuningService` implements intelligent adaptive parameter optimization for DHMA.

**Strategic Drive & Profit Optimization Engine** tracks 5 strategies with hourly performance analysis and computes a global Strategic Drive Index (SDI). "Soft Guardrails, Hard Coherency" is implemented via `StrategicDriveGuardrailService` controlling reallocation behavior. The Motivational Incentive Engine tracks `driveIndex` and `personalBest` based on SDI performance. A System Configuration Service, using a `system_config` table, manages global flags, including a `passiveLearning` mode. LATTI Learning Insights provide visibility into internal learning observations, generating dynamic insights on Spread Tightness, Burst Alignment Accuracy, and Toxicity Ratio.

Monitoring and default operational state enhancements include strategy usage summary, passive learning as default, cross-user mode synchronization via WebSocket, and a trade execution verifier. The system now uses an authoritative trading state contract via `/api/trading/status` and `trading_state_changed` WebSocket events for consistent state synchronization.

WebSocket Optimization and State Synchronization improvements include a singleton WebSocket connection pattern, hydrate-first state management for critical caches, and polling optimization. Authentication and Portfolio Balance Unification was achieved by creating a unified `apiFetch` base fetcher and enhancing `trading_state_changed` WebSocket broadcasts to include `portfolioOverview`.

The `MarketEvaluationService` (`server/services/market-evaluation.ts`) unifies all filtering under one service, wrapping `FilteredPairsService` with a 15-second cache. All user-facing endpoints now use the SSOT.

Service-Layer Non-Blocking Refactor eliminated service-layer blocking in paper and live trading operations, implementing a non-blocking teardown pattern.

In-Memory Operation Queue successfully replaced blocking operation locks with an asynchronous FIFO queue architecture, eliminating concurrent request collisions. Implemented `OperationQueue` class (`server/utils/operation-queue.ts`) with sequential job processing and promise-based result handling, with added request deduplication and startup recovery logic.

Unified Engine Health Monitor introduces comprehensive health monitoring with auto-recovery capabilities. Implemented `EngineHealthMonitor` service (`server/services/health-monitor.ts`) monitoring 6 subsystems. Real-time telemetry broadcasting via WebSocket `health_engine` topic.

Engine Telemetry Dashboard provides a production-ready frontend telemetry dashboard with real-time monitoring and contextual guidance. Implemented `EngineTelemetry` component (`client/src/components/monitoring/engine-telemetry.tsx`).

Anomaly Detection & Color-Coded Alerting implements comprehensive anomaly detection with color-coded alerting and self-recovery capabilities for the unified engine health monitor across 6 subsystems.

Auto-Recovery Validation & Circuit Breaker implements intelligent auto-recovery orchestration with dry-run planning, 120-second cool-down enforcement, and circuit breaker protection.

Trade Telemetry Hardening & Broadcast Optimization implements comprehensive trade lifecycle telemetry with health monitor integration and optimized broadcast thresholds. Created `TelemetryService` (`server/services/telemetry-service.ts`) with `recordTradeEvent()` and `recordTradeMetric()`. Integrated telemetry hooks across `TradingEngine`, `RiskManager`, and `StrategyEngine`.

Dry-Run Mode introduces safe, non-mutating trade pipeline validation. Trading engine checks `process.env.DRYRUN_TRADING` and skips `storage.createTrade()` when enabled, returning simulated trade objects with telemetry recording. Standalone test endpoint `/api/dryrun/trade/test` validates trade execution without requiring running engines. Enables zero-risk validation of trade logic, strategy signals, and risk calculations.

Single-Tenant Consolidation completed destructive migration to remove `user_id` from all operational tables, preserving 'kylegjordan' as canonical owner while maintaining paper/live mode isolation. This included refactoring `system-truth-diagnostic.ts`, migrating `value-alignment.ts` to a mode-based architecture, and updating the `value_alignment_matrix` table schema.

Gemini Performance Optimization implements full-stack adaptive self-regulation for production-grade performance, including dynamic backend optimization with `GeminiAdaptiveProfiler` service auto-adjusting cache TTL and telemetry batch intervals, and frontend load optimization with lazy loading and adaptive UI telemetry refresh.

Startup & Telemetry Remediation + Modularization Kickoff remediates performance regressions through parallel lazy loading and enhanced compression. The system is transitioning to a modular structure (`/server/modules` and `/server/agent/bridge`) with typed interface stubs for future integration.

Lottie Connectivity & Impact Audit mapped all LATTI/Lottie system connections across 4 core services, 13 API endpoints, 5 database tables, 6 UI components, and 5 scheduled jobs, confirming clean separation of concerns and zero external AI dependencies for LATTI's statistical analysis.

Orchestrator Connectivity & Impact Audit mapped all Orchestrator system connections (SignalOrchestrator, ReasoningOrchestrator, CLEOrchestrator, EthicsConsensusOrchestrator), confirming clean separation of concerns and independence from LATTI/Lottie. Bob agents are active and registered with ReasoningOrchestrator for DevOps, FullStack, UX, and Trading domains.

An Active Filter Pool with TTL-based expiry (5 minutes), deduplication logic, and passive-mode enforcement has been implemented. The FX5 Scanner now maintains a persistent pool of survivors with automatic cleanup and engine-state awareness. A standalone FX5 scanner service runs independently every 30 seconds for both paper and live modes, completely decoupled from trading engine state. Stage-3 now serves as the single source of truth for scan cycle state, emitting `scan_tick` and `scanner:breakdown` WebSocket events every 30 seconds.

**REB 2.8.3 Filter Insights REST Migration** completed the transition from WebSocket to REST data for all Cycle Info and Last Scan Result fields in the Filter Insights UI. The backend endpoint `/api/paper-sim/diagnostics/scan-latest` now calculates `nextScanInMs` server-side using the formula `(cycleEndTimestamp + 30000ms) - Date.now()` and returns zeroed payloads when the engine is STOPPED (Passive Learning mode). The frontend implements live countdown by tracking REST fetch time and decrementing the server-provided value based on elapsed time, eliminating the previous WebSocket `scan_tick` listener that was causing countdown glitches. This ensures the countdown displays smoothly (30→29→28...→0) without resetting, and the UI properly shows STOPPED state with zero metrics instead of loading skeletons when the engine is inactive.

**REB 2.8.5A FX5-Native 24h Window Tracking** replaced the legacy `scan24hAggregator` with a new FX5-native module (`fx5-24h-window.ts`) that implements proper ACTIVE-only tracking for 24h metrics and rolling 1-hour window for cyclesPerHour calculation. The FX5 Scanner now calls `recordScanFor24h()` only when the engine is ACTIVE (trading mode) and `recordScanCompletion()` for all scans (to track scanner health). The cyclesPerHour metric is NOT zeroed when the engine is STOPPED, allowing visibility into FX5 scanner operational status regardless of trading state. Frontend countdown logic was updated to use REST-only data flow with proper elapsed time calculation via `onSuccess` callback, eliminating WebSocket dependencies for countdown/cycle info. All legacy scan24hAggregator code was removed from stage3-emitter.ts, establishing clean separation: Stage-3 emits real-time filter breakdown via WebSocket, while FX5 owns all 24h tracking via REST endpoints.

**REB 2.8.5B Primary Metrics Section Fixes** completed critical fixes to the Filter Insights Primary Metrics section with REST-only logic for Kraken Universe, Cycle Info, Last Scan Result, and 24h Filter Activity. Key fixes include: (1) Backend `/scan-latest` endpoint now always calculates `nextScanInMs` correctly, even when engine is STOPPED or no scan state exists, by using FX5 scanner start time + cycle interval; (2) Frontend countdown updated to set `restFetchTime` ONLY in the `onSuccess` callback, eliminating jitter; (3) Fixed `getCyclesPerHour()` calculation to use `Date.now()` internally with simple count of scans in last hour; (4) Critical `startTime` contract fix: moved initialization from constructor to `start()` method to ensure accurate countdown baselines after restarts. All changes verified via backend logs showing `nextScanInMs: 30000` (not zero) and `cyclesPerHour: 1` (real scan count). Comprehensive mapping table documented in `docs/restoration/reb2_reports/REB_2.8.5B_PRIMARY_METRICS_MAPPING_TABLE.md`.

**REB2 Documentation**: All Emergency Restoration & Bootstrap (REB2) implementation reports, field mappings, and completion documents are stored in `docs/restoration/reb2_reports/`. This includes phase completion reports (REB2.1-2.8.5B), truth restoration documents, component impact matrices, and architectural mapping files.

The overall system architecture is considered foundational and sound, with a clear path for improvements in security and performance.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: External market price feed (primary for live pricing).
-   **CoinGecko API**: External market price feed (fallback for live pricing).
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.