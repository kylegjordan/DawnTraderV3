# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, leveraging OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its core purpose is to deliver a comprehensive, resilient, and continuously self-optimizing trading platform.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first design and a Node.js/Express backend providing a RESTful API and WebSocket support. PostgreSQL, utilizing Neon serverless driver and Drizzle ORM, handles data persistence. Authentication is managed via username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. An AI Orchestrator & Command Center, powered by GPT-4o, provides an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, and a Continuous Learning Pipeline. The system employs a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, and an Autonomy Layer with Safety Guardrails. It supports paper trading simulation and multi-intent command processing, while live trading includes voice/chat activation and manual approval workflows.

The architecture uses a global mode-based engine, `ModeRegistry` for telemetry, and `MetricsCore` for centralized metrics. Live pricing is managed by a `LivePricingAdapter` with dual-source integration, now enhanced with a `KrakenWebSocketAdapter` for real-time price updates on open trades.

The Goals Engine UI offers advanced universe and signal controls, execution rhythm controls, and simplified daily target goals with a Goal Feasibility Validation & Audit System.

The system incorporates a modern `guardrails_v2` schema with parameters like Portfolio Risk per Trade %, Symbol Cooldown, Max Open Positions, and Daily Loss Kill Switch %. It supports dual-mode operation with independent guardrail sets and real-time WebSocket broadcasts. The `GuardrailPolicy Service` is the single backend source of truth for guardrail settings. The Goals Engine includes an adaptive learning system that optimizes preset boundaries based on 30-day performance. `trade-safety.ts` provides `checkGuardrailRisk()` for all pre-trade risk checks. Adaptive Guardrails further tune parameters based on trading outcomes.

The Screeners tab uses a unified v2 filter configuration with an automated anomaly detection system. The DHMA Strategy implements Dual-Horizon Microstructure Alpha with dynamic position sizing and intelligent adaptive parameter optimization via `DHMATuningService`.

The Strategic Drive & Profit Optimization Engine tracks strategies, computes a global Strategic Drive Index (SDI), and implements "Soft Guardrails, Hard Coherency" via `StrategicDriveGuardrailService`. A Motivational Incentive Engine tracks `driveIndex` and `personalBest` based on SDI performance.

Monitoring enhancements include strategy usage summary, passive learning as default, cross-user mode synchronization via WebSocket, and a trade execution verifier. The system uses an authoritative trading state contract via `/api/trading/status` and `trading_state_changed` WebSocket events. WebSocket Optimization includes a singleton connection pattern and hydrate-first state management.

The `MarketEvaluationService` unifies all filtering. Service-Layer Non-Blocking Refactor eliminated blocking in paper and live trading, replaced by an In-Memory Operation Queue. A Unified Engine Health Monitor (`EngineHealthMonitor` service) provides comprehensive health monitoring with auto-recovery, real-time telemetry, and anomaly detection.

Dry-Run Mode introduces safe, non-mutating trade pipeline validation. Single-Tenant Consolidation migrated operational tables to a single user. Gemini Performance Optimization implements full-stack adaptive self-regulation. Startup & Telemetry Remediation + Modularization Kickoff improved performance and transitioned to a modular structure (`/server/modules` and `/server/agent/bridge`). Active Filter Pool with TTL-based expiry and deduplication is implemented. The FX5 Scanner maintains a persistent pool of survivors, running independently every 30 seconds, with Stage-3 being the single source of truth for scan cycle state.

The Filter Insights UI uses REST data for Cycle Info and Last Scan Result. The legacy `scan24hAggregator` was replaced with an FX5-native module for proper ACTIVE-only tracking of 24h metrics. An Intelligent Sizing Buffer prevents MAX_POSITION blocks, and the RTB UI has been overhauled. Execution Safety Alignment ensures `preComputedNotional` from P2 signals is used for `checkPositionSizeCap`.

A Diagnostic Framework (`B4DiagnosticService`) provides observational diagnostics for MAX_POSITION, Funnel, and WebSocket Health, without modifying core trading logic. A Signal Creation & Sizing Pipeline Audit (`B5SizingAuditService`) provides a comprehensive audit trail for the entire signal-to-trade pipeline across all 9 strategies, also observational only. A Unified Sizing Pipeline Refactor (`B6`) standardizes the signal-to-trade sizing pipeline, implementing exposure-budget-based sizing and centralizing sizing in the Signal Orchestrator, ensuring the engine trusts pre-sized signals.

A Hard Reset Service (`B7.A PaperSessionResetService`) provides a single authoritative path for complete paper simulation reset. The service coordinates reset across: engine in-memory state (`resetSessionState()`), orchestrator session state (`resetSession()`), diagnostics buffers (B4/B5), FX5 24h windows, and database (open positions, trades, sessions). The `/api/paper-sim/reset` endpoint now uses this service, eliminating ghost trades and ensuring genuinely fresh sessions without manual SQL.

Phase 8.8.3-B7.1 enforces a strict API contract for `/api/paper-sim/start`: the `mode` parameter is now REQUIRED ('new' or 'continue'). Hard reset only runs when `mode='new'`, preserving existing state on `mode='continue'`. Frontend callers use structured payloads (`paper-new`, `paper-continue`, `live`) via the `startTradingMutation` hook, ensuring no accidental resets.

Phase 8.8.3-B9 (Execution Engine Integrity) ensures P&L calculations use only real market data. Mock pricing is DISABLED by default (requires `ENABLE_MOCK_PRICING=true` env var for dev/testing). The `LivePricingAdapter` returns `no_reliable_price` source when no real data is available instead of falling back to hardcoded mock prices. Price cache is seeded with entry prices on trade open via `seedLastKnownGoodPrice()` to prevent cold-start mock fallback. Position monitoring skips positions when no reliable price is available rather than using synthetic data. Legacy `paper-execution.ts` moved to `server/legacy/` folder with tsconfig exclude to prevent accidental usage.

Phase 8.8.3-B9.FIX-WS-START (WebSocket Startup Fix) fixes a critical bug where the Kraken WebSocket never started on simulation start. The root cause was an early-return block in `startPaperSimulation()` that bypassed `manager.start()` when session and manager both existed but manager wasn't running. The fix adds `getIsRunning()` check before early-return, ensuring WebSocket starts even when manager exists but is idle. Diagnostic logging added with markers `[DEBUG-B9]` for startup chain tracing. `KrakenWebSocketAdapter.stop()` now clears `pendingSubscriptions` to prevent stale resubscriptions on restart.

Phase 8.8.4 (WebSocket Symbol Normalization) implements bidirectional symbol mapping for Kraken WebSocket to ensure real-time price updates at 1.5-second intervals. Key changes: (1) `KrakenPairMetadataService` enhanced with dedicated `wsSymbolToPairId` map for clean reverse lookups from WS symbols (XRP/USD) to DB pairIds (XXRPZUSD), avoiding collisions with `exchangeToInternal`. (2) `normalToKrakenSymbol()` prioritizes metadata service lookups before legacy fallbacks, with `convertInternalToWsFormat()` as last resort for cold-start resilience. (3) `mapKrakenPairToInternalSymbol()` uses `getPairId()` for incoming ticks, ensuring price cache keys match DB format. (4) Added `unrecognizedSymbols` diagnostics and DB verification after position closes.

Phase 8.8.3-I1 (RTB Pipeline Diagnostics) adds diagnostics-only services for investigating workflow restart issues that caused orphaned positions. Implementation includes: (1) `I1RTBDiagnosticsService` tracking RTB attempts, blocks, and opens with per-reason/strategy/symbol breakdown, (2) `I1TradeLifecycleDiagnosticsService` tracking trade open/close/force-close events with hard stop summaries, (3) New API endpoints at `/api/diagnostics/rtb-blocks`, `/api/diagnostics/trade-lifecycle`, and `/api/diagnostics/open-position-ws-linkage` for visibility. All logs use `[8.8.3-I1]` prefix. Memory-safe with combined buffers under 1000 entries. Full documentation at `docs/diagnostics/Phase-8.8.3-I1_Trading_Pipeline_Diagnostics.md`.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **Kraken WebSocket API**: Real-time ticker feed (`wss://ws.kraken.com`) for open trade price monitoring.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: External market price feed (primary for live pricing).
-   **CoinGecko API**: External market price feed (fallback for live pricing).
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.