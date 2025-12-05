# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, leveraging OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its core purpose is to deliver a comprehensive, resilient, and continuously self-optimizing trading platform with a focus on business vision, market potential, and project ambitions to provide a cutting-edge trading solution.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application utilizes a React, TypeScript, Vite frontend with a mobile-first, responsive design, and a Node.js/Express backend providing a RESTful API and WebSocket support. PostgreSQL, with Neon serverless driver and Drizzle ORM, handles data persistence. Authentication is managed via username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. An AI Orchestrator & Command Center, powered by GPT-4o, integrates an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, Intelligence Refinement, Real-Time Execution, and a Unified Portfolio & Strategy State. This system employs a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, Continuous Learning Pipeline, `StateAwarenessService`, Intent Execution Framework with a `Pre-Execution Validator`, and an Autonomy Layer with Safety Guardrails & Operational Kill Switch. It supports paper trading simulation with a database-first architecture and multi-intent command processing. Live trading includes voice/chat activation and manual approval workflows.

The architecture uses a global mode-based engine shared by all users, with `ModeRegistry` for telemetry and `MetricsCore` for centralized metrics. Live pricing is managed by a `LivePricingAdapter` with dual-source integration.

The Goals Engine UI offers advanced universe and signal controls, execution rhythm controls, and simplified daily target goals with Trading Pace presets, supported by a Goal Feasibility Validation & Audit System.

The system incorporates a modern `guardrails_v2` schema with four core parameters: Portfolio Risk per Trade %, Symbol Cooldown (minutes), Max Open Positions, and Daily Loss Kill Switch %. It features dual-mode operation with independent guardrail sets, coherency validation, and real-time WebSocket broadcasts. The **GuardrailPolicy Service** (`server/services/guardrail-policy.ts`) is the single backend source of truth. The Goals Engine includes an adaptive learning system that optimizes preset boundaries based on 30-day performance metrics. The `trade-safety.ts` module provides `checkGuardrailRisk()` as the single pre-trade validation function for all risk checks.

The Screeners tab uses a unified v2 filter configuration, with an automated anomaly detection system (`AuditAnomalyDetectionService`) for override configuration changes.

**Adaptive Guardrails** introduces a local-only learning system (`AdaptiveGuardrails` service) that adaptively tunes parameters based on trading outcomes using variance-based statistical analysis of 30-day performance metrics.

**DHMA Strategy** implements Dual-Horizon Microstructure Alpha, with the `DHMAStrategy` module (`server/strategies/dhma.ts`) providing simplified microstructure features and dynamic position sizing. The `DHMATuningService` implements intelligent adaptive parameter optimization.

The **Strategic Drive & Profit Optimization Engine** tracks 5 strategies with hourly performance analysis, computes a global Strategic Drive Index (SDI), and implements "Soft Guardrails, Hard Coherency" via `StrategicDriveGuardrailService`. A Motivational Incentive Engine tracks `driveIndex` and `personalBest` based on SDI performance. A System Configuration Service manages global flags, including a `passiveLearning` mode.

Monitoring enhancements include strategy usage summary, passive learning as default, cross-user mode synchronization via WebSocket, and a trade execution verifier. The system uses an authoritative trading state contract via `/api/trading/status` and `trading_state_changed` WebSocket events for consistent state synchronization.

WebSocket Optimization and State Synchronization improvements include a singleton WebSocket connection pattern, hydrate-first state management, and polling optimization. Authentication and Portfolio Balance Unification was achieved by creating a unified `apiFetch` base fetcher and enhancing `trading_state_changed` WebSocket broadcasts to include `portfolioOverview`.

The `MarketEvaluationService` (`server/services/market-evaluation.ts`) unifies all filtering. Service-Layer Non-Blocking Refactor eliminated service-layer blocking in paper and live trading. An In-Memory Operation Queue successfully replaced blocking operation locks with an asynchronous FIFO queue architecture.

Unified Engine Health Monitor introduces comprehensive health monitoring with auto-recovery capabilities via `EngineHealthMonitor` service (`server/services/health-monitor.ts`) monitoring 6 subsystems. Real-time telemetry is broadcast via WebSocket, displayed on an Engine Telemetry Dashboard, and includes Anomaly Detection & Color-Coded Alerting with self-recovery. Auto-Recovery Validation & Circuit Breaker implements intelligent auto-recovery orchestration. Trade Telemetry Hardening & Broadcast Optimization implements comprehensive trade lifecycle telemetry.

Dry-Run Mode introduces safe, non-mutating trade pipeline validation by skipping trade creation when `process.env.DRYRUN_TRADING` is enabled. Single-Tenant Consolidation migrated all operational tables to a single user ('kylegjordan'). Gemini Performance Optimization implements full-stack adaptive self-regulation.

Startup & Telemetry Remediation + Modularization Kickoff remediates performance regressions through parallel lazy loading and enhanced compression, transitioning to a modular structure (`/server/modules` and `/server/agent/bridge`). Lottie Connectivity & Impact Audit and Orchestrator Connectivity & Impact Audit mapped system connections to ensure clear separation of concerns. Bob agents are active and registered with ReasoningOrchestrator for various domains.

An Active Filter Pool with TTL-based expiry, deduplication, and passive-mode enforcement has been implemented. The FX5 Scanner maintains a persistent pool of survivors with automatic cleanup and engine-state awareness, running independently every 30 seconds. Stage-3 serves as the single source of truth for scan cycle state, emitting `scan_tick` and `scanner:breakdown` WebSocket events.

The Filter Insights UI uses REST data for Cycle Info and Last Scan Result. The backend endpoint `/api/paper-sim/diagnostics/scan-latest` calculates `nextScanInMs` server-side. The legacy `scan24hAggregator` was replaced with an FX5-native module (`fx5-24h-window.ts`) for proper ACTIVE-only tracking of 24h metrics and rolling 1-hour window for `cyclesPerHour`. Critical fixes were applied to Filter Insights Primary Metrics for accuracy and synchronization, including `refetchIntervalInBackground: true` and `staleTime: 0` for continuous background polling. Session-based RTB metrics reset to zero when the engine stops, with all RTB metrics endpoints filtering by `createdAt` after `engineSessionStart`. An Intelligent Sizing Buffer (3% in `paper-position-sizing.ts`) prevents MAX_POSITION blocks, and the RTB UI has been overhauled for enhanced visibility of block reasons and strategy performance. Execution Safety Alignment ensures `preComputedNotional` from P2 signals is used for `checkPositionSizeCap`. A comprehensive RTB Cooling Diagnostic and Automated RTB Cooling Diagnostic Runner have been implemented to identify and log reasons for signal dry-up.

**Phase 8.8.3-AJ19: Max Position Guardrail Diagnostic** investigates why MAX_POSITION guardrail blocks 99%+ of RTB signals after trades start opening. Key components: `aj19-max-position-diagnostic.ts` service for comprehensive logging of position size checks with P2/P3 value comparison, dry-run mode support (logs but doesn't block), and 6 API endpoints (`/api/diagnostics/aj19/*`) for status, enable/disable, dry-run toggle, entries, export, and clear operations. Block reason clarification: MAX_POSITION (position size % of portfolio), MAX_TRADES (total open trades count), POSITION_LIMIT (existing position in same symbol).

**Phase A Cleanup (Dec 2025)**: Rolled back AJ19/AJ19-B test behaviors to normal production operation:
- Per-cycle reconciliation disabled (lines 439-451 in `paper-execution-engine.ts`) - reconciliation now only runs via API: `POST /api/diagnostics/aj19b/reconcile`
- Both diagnostic services (`aj19-max-position-diagnostic.ts`, `aj19b-lifecycle-diagnostic.ts`) installed but **disabled by default** (`isEnabled = false`)
- `dryRunNoGuardrails` mode disabled by default - no guardrail bypass paths active
- Fixed TypeScript error in `guardrail-settings.ts` return type (added `killSwitchTripped: boolean`)
- **Removed automatic reset of guardrails and screener filters** when starting a "New Simulation" - user configurations are now preserved across simulation restarts

**Phase 8.8.3-B3.7: Max Total Portfolio Exposure Fix** (Dec 2025):
The `maxTotalExposurePct` guardrail field was not updating when edited because it was missing from:
1. Field mapping in `PUT /api/guardrails-v2` endpoint (routes.ts lines 1419-1422)
2. Validation payload builder (routes.ts line 1437)
3. Update payload builder (routes.ts line 1484)
4. Storage upsert function (storage.ts line 802)

**Phase 8.8.3-B3.6: Kraken WebSocket Price Engine** replaces REST polling with real-time WebSocket updates for open trade monitoring:
- `KrakenWebSocketAdapter` (`server/services/kraken-websocket-adapter.ts`) connects to `wss://ws.kraken.com` for real-time ticker subscriptions
- `LivePricingAdapter` now includes `updateFromWebSocket()` to update cache from WS ticks and `getPriceWithFallback()` for WS→REST fallback (5s stale threshold)
- `PaperExecutionEngine.checkOpenPositions()` uses WS cache with REST fallback for TP/SL monitoring
- **Subscription Lifecycle**: Automatic symbol subscription at trade open (`krakenWebSocketAdapter.subscribeToSymbols([symbol])`) and unsubscription at trade close (`krakenWebSocketAdapter.unsubscribeFromSymbols([symbol])`), both wrapped in try/catch for resilience
- Active Trades UI polling reduced from 1.5s to 10s (metadata only), with live WS prices merged in real-time via `price_updated` events
- FX5 Scanner continues using REST API (unchanged per directive)
- Diagnostics endpoint: `GET /api/diagnostics/ws-price-engine` for WS engine health monitoring

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **Kraken WebSocket API**: Real-time ticker feed (`wss://ws.kraken.com`) for open trade price monitoring.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: External market price feed (primary for live pricing).
-   **CoinGecko API**: External market price feed (fallback for live pricing).
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.