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

The Screeners tab now exclusively uses the unified v2 filter configuration. A comprehensive audit system ensures that only current, visible fields influence the trade engine through runtime validation and database views. An automated anomaly detection system for override configuration changes, `AuditAnomalyDetectionService`, analyzes audit logs for unusual patterns.

**Adaptive Guardrails (v2.3)** introduces a local-only learning system (`AdaptiveGuardrails` service) that allows LATTI to adaptively tune parameters based on trading outcomes using variance-based statistical analysis of 30-day performance metrics. A strict throttle mechanism limits changes to 3 per 24 hours. Override influence weighting adjusts AI aggressiveness based on user manual overrides.

**DHMA Strategy (v2.4)** implements Dual-Horizon Microstructure Alpha, a microstructure-based trading strategy. The `DHMAStrategy` module (`server/strategies/dhma.ts`) provides simplified microstructure features using OHLCV data. Position sizing uses dynamic down-weighting based on spread and toxicity. DHMA parameters are configurable via a flexible, mode-aware parameter configuration system stored in a `strategy_param_schema` table. The `DHMATuningService` implements intelligent adaptive parameter optimization for DHMA.

**Strategic Drive & Profit Optimization Engine (Phase 31)** tracks 5 strategies with hourly performance analysis and computes a global Strategic Drive Index (SDI). "Soft Guardrails, Hard Coherency" is implemented via `StrategicDriveGuardrailService` controlling reallocation behavior. The Motivational Incentive Engine tracks `driveIndex` and `personalBest` based on SDI performance. A System Configuration Service, using a `system_config` table, manages global flags, including a `passiveLearning` mode. LATTI Learning Insights provide visibility into internal learning observations, generating dynamic insights on Spread Tightness, Burst Alignment Accuracy, and Toxicity Ratio.

Monitoring and default operational state enhancements include strategy usage summary, passive learning as default, cross-user mode synchronization via WebSocket, and a trade execution verifier. The system now uses an authoritative trading state contract via `/api/trading/status` and `trading_state_changed` WebSocket events for consistent state synchronization.

WebSocket Optimization and State Synchronization improvements include a singleton WebSocket connection pattern, hydrate-first state management for critical caches, and polling optimization. Authentication and Portfolio Balance Unification was achieved by creating a unified `apiFetch` base fetcher and enhancing `trading_state_changed` WebSocket broadcasts to include `portfolioOverview`.

The `MarketEvaluationService` (`server/services/market-evaluation.ts`) unifies all filtering under one service, wrapping `FilteredPairsService` with a 15-second cache. All user-facing endpoints now use the SSOT.

**Service-Layer Non-Blocking Refactor (Phase 41E-S)** eliminated service-layer blocking in paper and live trading operations, implementing a non-blocking teardown pattern.

**In-Memory Operation Queue (Phase 41F-A)** successfully replaced blocking operation locks with an asynchronous FIFO queue architecture, eliminating concurrent request collisions. Implemented `OperationQueue` class (`server/utils/operation-queue.ts`) with sequential job processing and promise-based result handling. **Queue Enhancements (Phase 41F-B)** added request deduplication and startup recovery logic.

**Unified Engine Health Monitor (Phase 41F-C)** introduces comprehensive health monitoring with auto-recovery capabilities. Implemented `EngineHealthMonitor` service (`server/services/health-monitor.ts`) monitoring 6 subsystems. Real-time telemetry broadcasting via WebSocket `health_engine` topic.

**Engine Telemetry Dashboard (Phase 41F-D)** provides a production-ready frontend telemetry dashboard with real-time monitoring and contextual guidance. Implemented `EngineTelemetry` component (`client/src/components/monitoring/engine-telemetry.tsx`).

**Engine Start/Stop Cycle Validation (Phase 41F-E)** resolved critical blocking operation in paper trading engine startup, reducing start duration significantly.

**Anomaly Detection & Color-Coded Alerting (Phase 41F-F)** implements comprehensive anomaly detection with color-coded alerting and self-recovery capabilities for the unified engine health monitor across 6 subsystems.

**Auto-Recovery Validation & Circuit Breaker (Phase 41F-G)** implements intelligent auto-recovery orchestration with dry-run planning, 120-second cool-down enforcement, and circuit breaker protection.

**Trade Telemetry Hardening & Broadcast Optimization (Phase 41F-I)** implements comprehensive trade lifecycle telemetry with health monitor integration and optimized broadcast thresholds. Created `TelemetryService` (`server/services/telemetry-service.ts`) with `recordTradeEvent()` and `recordTradeMetric()`. Integrated telemetry hooks across `TradingEngine`, `RiskManager`, and `StrategyEngine`.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: External market price feed (primary for live pricing).
-   **CoinGecko API**: External market price feed (fallback for live pricing).
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.