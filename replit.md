# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, leveraging OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its core purpose is to deliver a comprehensive, resilient, and continuously self-optimizing trading platform, aiming for market potential through advanced automation and AI integration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first design and a Node.js/Express backend providing a RESTful API and WebSocket support. PostgreSQL, utilizing Neon serverless driver and Drizzle ORM, handles data persistence. Authentication is managed via username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. An AI Orchestrator & Command Center, powered by GPT-4o, provides an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, and a Continuous Learning Pipeline. The system employs a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, and an Autonomy Layer with Safety Guardrails. It supports paper trading simulation and multi-intent command processing, while live trading includes voice/chat activation and manual approval workflows.

The architecture uses a global mode-based engine, `ModeRegistry` for telemetry, and `MetricsCore` for centralized metrics. Live pricing is managed by a `LivePricingAdapter` with dual-source integration, enhanced with a `KrakenWebSocketAdapter` for real-time price updates on open trades. The Goals Engine UI offers advanced universe and signal controls, execution rhythm controls, and simplified daily target goals with a Goal Feasibility Validation & Audit System.

The system incorporates a modern `guardrails_v2` schema with parameters like Portfolio Risk per Trade %, Symbol Cooldown, Max Open Positions, and Daily Loss Kill Switch %. It supports dual-mode operation with independent guardrail sets and real-time WebSocket broadcasts. The `GuardrailPolicy Service` is the single backend source of truth for guardrail settings. The Goals Engine includes an adaptive learning system that optimizes preset boundaries based on 30-day performance. Adaptive Guardrails further tune parameters based on trading outcomes.

The Screeners tab uses a unified v2 filter configuration with an automated anomaly detection system. The DHMA Strategy implements Dual-Horizon Microstructure Alpha with dynamic position sizing and intelligent adaptive parameter optimization via `DHMATuningService`. The Strategic Drive & Profit Optimization Engine tracks strategies, computes a global Strategic Drive Index (SDI), and implements "Soft Guardrails, Hard Coherency" via `StrategicDriveGuardrailService`.

Monitoring enhancements include strategy usage summary, passive learning as default, cross-user mode synchronization via WebSocket, and a trade execution verifier. The system uses an authoritative trading state contract via `/api/trading/status` and `trading_state_changed` WebSocket events. WebSocket Optimization includes a singleton connection pattern and hydrate-first state management. The `MarketEvaluationService` unifies all filtering. Service-Layer Non-Blocking Refactor eliminated blocking in paper and live trading, replaced by an In-Memory Operation Queue. A Unified Engine Health Monitor (`EngineHealthMonitor` service) provides comprehensive health monitoring with auto-recovery, real-time telemetry, and anomaly detection.

Dry-Run Mode introduces safe, non-mutating trade pipeline validation. Startup & Telemetry Remediation + Modularization Kickoff improved performance and transitioned to a modular structure. An Active Filter Pool with TTL-based expiry and deduplication is implemented. The FX5 Scanner maintains a persistent pool of survivors, running independently every 30 seconds.

Execution Safety Alignment ensures `preComputedNotional` from P2 signals is used for `checkPositionSizeCap`. A Diagnostic Framework (`B4DiagnosticService`) provides observational diagnostics. A Signal Creation & Sizing Pipeline Audit (`B5SizingAuditService`) provides a comprehensive audit trail for the entire signal-to-trade pipeline across all 9 strategies. A Unified Sizing Pipeline Refactor (`B6`) standardizes the signal-to-trade sizing pipeline, implementing exposure-budget-based sizing and centralizing sizing in the Signal Orchestrator.

A Hard Reset Service (`B7.A PaperSessionResetService`) provides a single authoritative path for complete paper simulation reset, coordinating across engine state, orchestrator session state, diagnostics buffers, FX5 24h windows, and the database. Execution Engine Integrity (B9) ensures P&L calculations use only real market data, with mock pricing disabled by default. The `LivePricingAdapter` returns `no_reliable_price` when real data is unavailable. WebSocket Symbol Normalization implements bidirectional symbol mapping for Kraken WebSocket to ensure real-time price updates at 1.5-second intervals.

RTB Pipeline Diagnostics (I1-I5) introduce diagnostic and consistency improvements without altering trading behavior, including tracking RTB attempts/blocks, trade lifecycle events, and providing extensive logging and API endpoints for auditing price tick flow and RTB blocks.

Live Price Distribution Fix (I6) ensures all modern endpoints use `getPriceWithFallback()` for consistent live pricing with comprehensive fallback tracking. The fallback chain is now: Binance → CoinGecko → Kraken REST → last_known_good. Frontend Symbol Normalization Fix (I6-UI) resolves a UI price update staleness issue by normalizing symbols for consistent caching. WebSocket Broadcast Mode Fix (I6-FIX) correctly sets the trading mode (`paper` or `live`) for `price_updated` broadcasts.

Kraken Canonical Symbol Mapping (I7) introduces a single authoritative symbol mapping layer for Kraken using a `BASE/QUOTE` internal format, with a Symbol Map and Symbol Resolver for consistent symbol handling across the application. WebSocket Subscription & Tick Flow Diagnostics (I7-WS-A) implements diagnostic-only tracing of the complete WebSocket subscription lifecycle from request to broadcast. Full Price Pipeline Tracing (I7-WS-C) implements comprehensive 8-stage price tracing from WebSocket tick arrival through UI updates to engine exit evaluation. WebSocket Tick Delivery Pipeline Fix (I7-WS-D) ensures every incoming WebSocket tick reaches both the price cache and the frontend broadcast pipeline, reducing throttling and guaranteeing broadcasts. REST Fallback Optimization (I7-WS-E) ensures REST API fallback is only used when WebSocket cache is stale (>2s) or the symbol has no WebSocket subscription, with diagnostic logging (`[I7-WS-E][REST_FALLBACK]`) and a metrics endpoint at `/api/diagnostics/i7-ws-e/rest-fallback-metrics`.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **Kraken WebSocket API**: Real-time ticker feed for open trade price monitoring.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: External market price feed (primary for live pricing).
-   **CoinGecko API**: External market price feed (fallback for live pricing).
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.