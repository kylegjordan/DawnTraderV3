# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, leveraging OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its core purpose is to deliver a comprehensive, resilient, and continuously self-optimizing trading platform.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first design and a Node.js/Express backend providing a RESTful API and WebSocket support. PostgreSQL, utilizing Neon serverless driver and Drizzle ORM, handles data persistence. Authentication is managed via username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. An AI Orchestrator & Command Center, powered by GPT-4o, provides an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, and a Continuous Learning Pipeline. The system employs a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, and an Autonomy Layer with Safety Guardrails. It supports paper trading simulation and multi-intent command processing, while live trading includes voice/chat activation and manual approval workflows.

The architecture uses a global mode-based engine, `ModeRegistry` for telemetry, and `MetricsCore` for centralized metrics. Live pricing is managed by a `LivePricingAdapter` with dual-source integration, enhanced with a `KrakenWebSocketAdapter` for real-time price updates on open trades. The Goals Engine UI offers advanced universe and signal controls, execution rhythm controls, and simplified daily target goals with a Goal Feasibility Validation & Audit System.

The system incorporates a modern `guardrails_v2` schema with parameters like Portfolio Risk per Trade %, Symbol Cooldown, Max Open Positions, and Daily Loss Kill Switch %. It supports dual-mode operation with independent guardrail sets and real-time WebSocket broadcasts. The `GuardrailPolicy Service` is the single backend source of truth for guardrail settings. The Goals Engine includes an adaptive learning system that optimizes preset boundaries based on 30-day performance. `trade-safety.ts` provides `checkGuardrailRisk()` for all pre-trade risk checks. Adaptive Guardrails further tune parameters based on trading outcomes.

The Screeners tab uses a unified v2 filter configuration with an automated anomaly detection system. The DHMA Strategy implements Dual-Horizon Microstructure Alpha with dynamic position sizing and intelligent adaptive parameter optimization via `DHMATuningService`. The Strategic Drive & Profit Optimization Engine tracks strategies, computes a global Strategic Drive Index (SDI), and implements "Soft Guardrails, Hard Coherency" via `StrategicDriveGuardrailService`. A Motivational Incentive Engine tracks `driveIndex` and `personalBest` based on SDI performance.

Monitoring enhancements include strategy usage summary, passive learning as default, cross-user mode synchronization via WebSocket, and a trade execution verifier. The system uses an authoritative trading state contract via `/api/trading/status` and `trading_state_changed` WebSocket events. WebSocket Optimization includes a singleton connection pattern and hydrate-first state management.

The `MarketEvaluationService` unifies all filtering. Service-Layer Non-Blocking Refactor eliminated blocking in paper and live trading, replaced by an In-Memory Operation Queue. A Unified Engine Health Monitor (`EngineHealthMonitor` service) provides comprehensive health monitoring with auto-recovery, real-time telemetry, and anomaly detection.

Dry-Run Mode introduces safe, non-mutating trade pipeline validation. Startup & Telemetry Remediation + Modularization Kickoff improved performance and transitioned to a modular structure (`/server/modules` and `/server/agent/bridge`). Active Filter Pool with TTL-based expiry and deduplication is implemented. The FX5 Scanner maintains a persistent pool of survivors, running independently every 30 seconds, with Stage-3 being the single source of truth for scan cycle state.

Execution Safety Alignment ensures `preComputedNotional` from P2 signals is used for `checkPositionSizeCap`. A Diagnostic Framework (`B4DiagnosticService`) provides observational diagnostics for MAX_POSITION, Funnel, and WebSocket Health. A Signal Creation & Sizing Pipeline Audit (`B5SizingAuditService`) provides a comprehensive audit trail for the entire signal-to-trade pipeline across all 9 strategies, also observational only. A Unified Sizing Pipeline Refactor (`B6`) standardizes the signal-to-trade sizing pipeline, implementing exposure-budget-based sizing and centralizing sizing in the Signal Orchestrator, ensuring the engine trusts pre-sized signals.

A Hard Reset Service (`B7.A PaperSessionResetService`) provides a single authoritative path for complete paper simulation reset, coordinating across engine state, orchestrator session state, diagnostics buffers, FX5 24h windows, and the database. This ensures genuinely fresh sessions without manual SQL. The `/api/paper-sim/start` API enforces a strict contract requiring a `mode` parameter ('new' or 'continue').

Execution Engine Integrity (B9) ensures P&L calculations use only real market data, with mock pricing disabled by default. The `LivePricingAdapter` returns `no_reliable_price` when real data is unavailable. A WebSocket Startup Fix (B9.FIX-WS-START) addresses a critical bug preventing the Kraken WebSocket from starting on simulation launch. WebSocket Symbol Normalization (8.8.4) implements bidirectional symbol mapping for Kraken WebSocket to ensure real-time price updates at 1.5-second intervals.

RTB Pipeline Diagnostics (I1), Hard-Stop Freeze + RTB Metrics Repair (I2), Trade Status Consistency & RTB Metrics Integrity (I3), RTB Metrics UI & Price Tick Health Diagnostics (I4), and RTB Block Recording & Price Tick Engine Flow Audit (I5) phases introduce diagnostic and consistency improvements without altering trading behavior. These include tracking RTB attempts/blocks, trade lifecycle events, implementing an `isStopInProgress` flag to prevent new trades during a hard stop, reconciling incomplete trades after a stop, aligning RTB block reasons between backend and frontend, and providing extensive logging and API endpoints for auditing price tick flow and RTB blocks.

Live Price Distribution Fix (I6) ensures all modern endpoints use `getPriceWithFallback()` for consistent live pricing with comprehensive fallback tracking. Updated endpoints include `/paper-sim/active-trades`, `/paper-sim/portfolio-summary`, `/paper-sim/close-trade/:id`, `/paper-sim/force-clear-stranded`, and `paper-portfolio-manager.ts` closeAllPositions(). Diagnostic logging with `[8.8.3-I6]` tags tracks `fallbackType` (none/rest_fallback/entry_fallback), `priceAgeMs`, and `source` for complete price audit trails. Legacy files (risk-manager.ts, heuristic-trader.ts) remain untouched per corrective directive. I6 Backend Fix (Dec 2025) adds `fetchFromKrakenRest()` to call Kraken's public Ticker API when cache is stale, eliminating stale `last_known_good` prices. The fallback chain is now: Binance → CoinGecko → Kraken REST → last_known_good. Diagnostic logging uses `[8.8.3-I6][REST_FALLBACK]` tags for Kraken REST calls.

Frontend Symbol Normalization Fix (I6-UI) resolves a UI price update staleness issue in the Active Trades tab. The fix adds a `normalizeSymbol()` function that strips slashes and uppercases symbols, applied to both WebSocket `price_updated` events when storing in `livePrices` state and to position symbols when looking up live prices. This ensures symbols like "FXS/USD" and "FXSUSD" resolve to the same cache key ("FXSUSD"), enabling real-time price updates regardless of symbol format variations.

WebSocket Broadcast Mode Fix (I6-FIX, Dec 2025) resolves a critical bug where `price_updated` broadcasts were hardcoded with `mode=live` regardless of actual trading mode. The fix introduces a `currentTradingMode` property in `LivePricingAdapter` with `setTradingMode()` and `getTradingMode()` methods. Mode is now correctly set:
- To `'paper'` in paper-sim-service.ts (4 start paths), PaperExecutionEngine.start() (new and idempotent)
- To `'live'` in live-trading-service.ts when activating live trading
Enhanced diagnostic logging with `[8.8.3-I6-FIX]` tags tracks subscription counts, unsubscription events, and mode labels in price broadcasts.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **Kraken WebSocket API**: Real-time ticker feed (`wss://ws.kraken.com`) for open trade price monitoring.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: External market price feed (primary for live pricing).
-   **CoinGecko API**: External market price feed (fallback for live pricing).
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.