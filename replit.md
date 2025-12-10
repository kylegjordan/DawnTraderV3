# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application designed for Kraken. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, leveraging OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its core purpose is to deliver a comprehensive, resilient, and continuously self-optimizing trading platform, aiming for market potential through advanced automation and AI integration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application utilizes a React, TypeScript, Vite frontend with a mobile-first design, and a Node.js/Express backend providing a RESTful API and WebSocket support. PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, handles data persistence. Authentication is managed using username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. An AI Orchestrator & Command Center, powered by GPT-4o, provides an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, and a Continuous Learning Pipeline. The system employs a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, and an Autonomy Layer with Safety Guardrails. It supports paper trading simulation and multi-intent command processing, while live trading includes voice/chat activation and manual approval workflows.

The architecture uses a global mode-based engine, `ModeRegistry` for telemetry, and `MetricsCore` for centralized metrics. Live pricing is managed by a `LivePricingAdapter` with dual-source integration, enhanced with a `KrakenWebSocketAdapter` for real-time price updates on open trades. The Goals Engine UI offers advanced universe and signal controls, execution rhythm controls, and simplified daily target goals with a Goal Feasibility Validation & Audit System.

The system incorporates a modern `guardrails_v2` schema with parameters like Portfolio Risk per Trade %, Symbol Cooldown, Max Open Positions, and Daily Loss Kill Switch %. It supports dual-mode operation with independent guardrail sets and real-time WebSocket broadcasts. The `GuardrailPolicy Service` is the single backend source of truth for guardrail settings. The Goals Engine includes an adaptive learning system that optimizes preset boundaries based on 30-day performance. Adaptive Guardrails further tune parameters based on trading outcomes.

The Screeners tab uses a unified v2 filter configuration with an automated anomaly detection system. The DHMA Strategy implements Dual-Horizon Microstructure Alpha with dynamic position sizing and intelligent adaptive parameter optimization via `DHMATuningService`. The Strategic Drive & Profit Optimization Engine tracks strategies, computes a global Strategic Drive Index (SDI), and implements "Soft Guardrails, Hard Coherency" via `StrategicDriveGuardrailService`.

Monitoring enhancements include strategy usage summary, passive learning as default, cross-user mode synchronization via WebSocket, and a trade execution verifier. The system uses an authoritative trading state contract via `/api/trading/status` and `trading_state_changed` WebSocket events. WebSocket Optimization includes a singleton connection pattern and hydrate-first state management. The `MarketEvaluationService` unifies all filtering. Service-Layer Non-Blocking Refactor eliminated blocking in paper and live trading, replaced by an In-Memory Operation Queue. A Unified Engine Health Monitor (`EngineHealthMonitor` service) provides comprehensive health monitoring with auto-recovery, real-time telemetry, and anomaly detection.

Dry-Run Mode introduces safe, non-mutating trade pipeline validation. Startup & Telemetry Remediation + Modularization Kickoff improved performance and transitioned to a modular structure. An Active Filter Pool with TTL-based expiry and deduplication is implemented. The FX5 Scanner maintains a persistent pool of survivors, running independently every 30 seconds.

Execution Safety Alignment ensures `preComputedNotional` from P2 signals is used for `checkPositionSizeCap`. A Diagnostic Framework (`B4DiagnosticService`) provides observational diagnostics. A Signal Creation & Sizing Pipeline Audit (`B5SizingAuditService`) provides a comprehensive audit trail for the entire signal-to-trade pipeline across all 9 strategies. A Unified Sizing Pipeline Refactor (`B6`) standardizes the signal-to-trade sizing pipeline, implementing exposure-budget-based sizing and centralizing sizing in the Signal Orchestrator.

A Hard Reset Service (`B7.A PaperSessionResetService`) provides a single authoritative path for complete paper simulation reset, coordinating across engine state, orchestrator session state, diagnostics buffers, FX5 24h windows, and the database. Execution Engine Integrity (B9) ensures P&L calculations use only real market data, with mock pricing disabled by default. The `LivePricingAdapter` returns `no_reliable_price` when real data is unavailable. WebSocket Symbol Normalization implements bidirectional symbol mapping for Kraken WebSocket to ensure real-time price updates at 1.5-second intervals.

RTB Pipeline Diagnostics (I1-I5) introduce diagnostic and consistency improvements without altering trading behavior, including tracking RTB attempts/blocks, trade lifecycle events, and providing extensive logging and API endpoints for auditing price tick flow and RTB blocks.

Live Price Distribution Fix (I6) ensures all modern endpoints use `getPriceWithFallback()` for consistent live pricing with comprehensive fallback tracking. Frontend Symbol Normalization Fix (I6-UI) resolves a UI price update staleness issue by normalizing symbols for consistent caching. WebSocket Broadcast Mode Fix (I6-FIX) correctly sets the trading mode (`paper` or `live`) for `price_updated` broadcasts.

Kraken Canonical Symbol Mapping (I7) introduces a single authoritative symbol mapping layer for Kraken using a `BASE/QUOTE` internal format, with a Symbol Map and Symbol Resolver for consistent symbol handling. WebSocket Subscription & Tick Flow Diagnostics (I7-WS-A, I7-WS-C) implement tracing of the complete WebSocket subscription lifecycle and 8-stage price tracing. WebSocket Tick Delivery Pipeline Fix (I7-WS-D) ensures every incoming WebSocket tick reaches both the price cache and the frontend broadcast pipeline. REST Fallback Optimization (I7-WS-E) ensures REST API fallback is only used when WebSocket cache is stale or unsubscribed. WebSocket Subscription Coverage Fix (I7-WS-F) ensures all active-trade symbols have correct Kraken WebSocket subscriptions, with auto-correction and diagnostic endpoints. Tick Frequency Stabilization (I7-WS-G) improves WebSocket tick reliability by detecting and correcting slow, irregular, or frozen tick streams with auto-resubscription.

Paper Trade Persistence Fix (I7-PERSIST-FIX) corrects a database table mismatch for `I7-WS-F` coverage endpoints. Canonical Symbol Mapping Repair (I7-MAP-FIX) fixes unmappable symbols by expanding the `KRAKEN_SYMBOL_MAP` and implementing a smart resolver. Automatic Symbol Mapping (I7-MAP-AUTO) replaces static maps with a dynamic, verified, auto-generated canonical mapping layer backed by live Kraken AssetPairs metadata.

Phase 8.8.3-I7-ROOT-FIX and Phase 8.8.3-I7-ROOT-FIX-2 restore core engine functionality and fix diagnostic endpoint wiring for paper trading. Phase 8.8.3-I7-MAP-AUTO-FIX resolves a critical singleton initialization issue in `krakenAssetPairsService` for consistent symbol mapping. Phase 8.8.3-I7-WS-STARTUP ensures the Kraken WebSocket adapter starts during server initialization.

Phase 8.8.4-IA-PRICE-CACHE introduces a centralized price cache module (`server/services/price-cache.ts`) for active trade pricing, ensuring a single source of truth updated from WebSocket and REST. Phase 8.8.3-I8C (WebSocket Subscription Reliability Fix) addresses low WebSocket coverage by subscribing all open positions on engine start, new trades, and reconnects, with a 5-second subscription health audit. Phase 8.8.3-I8C-SYMBOL-NORM (Database Symbol Normalization) ensures all database symbols use canonical BASE/QUOTE format, with normalization at the storage layer during trade creation to prevent format mismatches with the WebSocket price cache.

Phase 8.8.3-A2R (Engine Stop & Reset Integrity Fix) ensures the trading engine is fully stopped before any database reset operations:
- Reset endpoint (`/api/paper-sim/reset`) now calls `stopPaperSimulation()` FIRST and aborts with 500 if stop fails
- Triple post-stop verification: session status check, manager null check, AND direct `globalPaperEngine.isEngineRunning()` check
- Only proceeds to `hardResetPaperSimulation()` after ALL three verifications pass
- All logging normalized to `[8.8.3-A2R]` prefix for consistent telemetry filtering
- Eliminates race condition where engine could open trades during DB reset

Phase 8.8.3-I9 (Enhanced Active Trades UI) provides comprehensive UI improvements:
- **Part A - New Columns**: Three new columns added (Source/Frequency, Volume 24h, Confidence) with reordered layout: Symbol, Slot, Strategy, Qty/Value, Entry, TP/SL, Current, Distance, P/L$, P/L%, Confidence, Source, Volume, Duration, Actions
- **Source/Frequency**: Shows data source (WS/REST) and tick frequency bucket (High/Medium/Low/Very Low based on average tick interval: <3s=High, 3-10s=Medium, 10-30s=Low, >30s=Very Low)
- **Volume (24h)**: Displays 24-hour trading volume with K/M formatting and bucket classification ($50M+=High, $10-50M=Medium, $1-10M=Low, <$1M=Very Low)
- **Confidence**: Shows trade signal confidence percentage (0-100%) with color-coded thresholds (>=80=green, 60-79=blue, 40-59=orange, <40=red)
- **Part B - GlobalMetricsBar**: Prominent portfolio metrics display showing Balance, Cash, Positions value (with count), and Net P/L with percentage, using icons and color-coding for profit/loss
- **Part C - Reset Session**: Reset button with confirmation dialog that triggers full paper session reset via `PaperSessionResetService`, clearing all positions and resetting to $10,000 starting balance
- **Part D - Cosmetic Fixes**: `formatNumber()` utility applied to all monetary values for comma-separated formatting
Backend methods `getSymbolFrequencyInfo()` in KrakenWebSocketAdapter and `getSymbolVolumeInfo()` in ActiveFilterPoolService provide the data.

Phase 8.8.3-I10 (Volume Enrichment) persists 24h volume data at trade creation time using FX5 as the authoritative source, with a Kraken REST API fallback via `MarketVolumeCache`:
- **DB Columns**: Added `volume_24h` and `volume_bucket` to `paper_sim_open_positions` table
- **Volume Source Priority**: FX5 signal metadata → Active Filter Pool → Kraken REST (5-min TTL cache)
- **Volume Buckets**: ≥$5M=High, ≥$500K=Medium, ≥$50K=Low, <$50K=Very Low
- **No Per-Refresh Fetching**: Volume is captured at trade creation, not updated per UI refresh
- **API Responses**: `/api/paper-sim/active-trades` returns volume from DB with pool/cache fallback

Trade History Table enhancements:
- **New Columns**: Quantity (between Exit and Close Reason), Confidence (after P/L%)
- **Number Formatting**: `formatNumber()` utility for comma-separated monetary values
- **Confidence Display**: Normalized to 0-100%, color-coded (Green ≥80%, Blue 60-79%, Orange 40-59%, Red <40%)

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **Kraken WebSocket API**: Real-time ticker feed for open trade price monitoring.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: External market price feed (primary for live pricing).
-   **CoinGecko API**: External market price feed (fallback for live pricing).
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.