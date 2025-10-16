# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, disciplined risk management, and offers both live and paper trading capabilities. The application leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its primary goal is to provide a comprehensive, resilient, and continuously improving self-optimizing trading platform, focusing on business vision, market potential, and project ambitions to deliver a leading-edge solution in automated crypto trading.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX
The frontend is built with React, TypeScript, Vite, shadcn/ui (Radix UI + Tailwind CSS), and TanStack Query, featuring a mobile-first, responsive design with dynamic mode-aware UI. Key features include microphone-based voice transcription, context-based persistent chat history, a mode-aware toggle for trading engines with safety confirmations, and a comprehensive, categorized notification system. Walter UI enhancements include chat deletion, archive/delete buttons, dynamic textarea resizing, and optimized vertical space.

### Technical Implementation
The backend uses Node.js with Express, providing a RESTful API and WebSocket support. Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. Data storage is handled by PostgreSQL via Neon serverless driver and Drizzle ORM. The system offers 8 automated trading strategies, multi-layered risk management, AI-powered opportunity identification, and a Continuous Learning Engine (CLE) for optimization. Authentication uses username/password with bcrypt and JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, monitors and provides insights. An AI SysAdmin Co-Pilot named Walter handles system configuration and optimization with a dual-control system. Walter features a Unified Command & Conversation Layer for natural language command interpretation, a Semantic Memory Layer (pgvector and OpenAI embeddings), and an Intelligence Refinement Layer with a Self-optimizing Cognitive Weight Adjuster. `DiagnosticsAnalyzer` and "Bob Inspector Service" perform diagnostics and auto-analysis. A Paper Trading Simulation Engine provides real-time execution, and system-wide global session tracking ensures dashboard synchronization.

The system implements a multi-module intelligent caching system (Bob Core) for performance optimization, including modules for metrics, dashboard data, configuration, strategy intelligence, trade data, system insights, and UI state. A Hybrid Cortex Intelligent Memory Layer acts as a memory bridge between Bob Core and Walter, managing short-term context storage and snapshot management.

**System Health & Diagnostic Intelligence** includes `SystemHealthMonitor` tracking CPU, memory, cache performance, latency, and scheduler health. The `SelfRepairService` provides automated recovery. Anomaly detection flags issues, and health metrics are integrated into MetricsBob and InsightBob for Walter AI context awareness.

A **Natural Language Action Interpreter (NLAI)** system for Walter includes `NLAIActionRegistry` (pattern-based intent recognition), `NLAIInterpreter` (command parsing), and `NLAIExecutionBroker` (async action dispatch).

**Walter UX Enhancements & User Preferences** introduces comprehensive user preference management and workspace customization. Database schema extends with `walter_user_preferences` for view mode, theme, tone, send key, and sidebar state.

A **Contextual Intent Engine (CIE)** elevates Walter with semantic understanding and context awareness. Core components include `IntentClassifier`, `SemanticGuardrail`, and `ContextualNLAIInterpreter`. Cortex conversation snapshots extend the Hybrid Cortex Memory Layer for contextual follow-ups.

**Front-End/Back-End Sync & Full Strategy Visibility** ensures complete strategy visibility. The `/api/trading/status` endpoint returns `activeStrategies` as a dynamic array of all enabled strategies. Consistency monitoring compares backend active strategies with Cortex snapshots.

**Persistent File Output & Chat File Sharing** establishes a reliable file persistence infrastructure. `FilePersistenceService` redirects all file operations to persistent directories (`./reports/`, `./logs/`, `./exports/`, `./analysis/`) with automatic post-save verification. File operations are tracked with metrics integrated into `SystemHealthMonitor`. Walter chat features `ChatFileAttachment` components for file sharing. This also includes category-specific counters and append mode support for log files.

**Real-Time Execution Layer** establishes a production-grade execution infrastructure. Core components include:
- **MarketDataWebSocket**: Kraken WebSocket client for real-time market data.
- **ExecutionTimingService**: Order lifecycle tracker for latency analysis and order audit records.
- **SlippageFeeModelingService**: Real-time slippage and fee simulation for paper trading.
- **RateControlService**: Token bucket rate limiter for Kraken API endpoints.
- **MarketDataCoordinator**: Orchestrates WebSocket and REST market data sources.
- **RealtimePaperExecutor**: Enhanced paper trading engine integrating all execution services.
- **ParityGateService**: Paper-to-live readiness validator with strict thresholds and parity reports.

**Unified Portfolio & Strategy State** establishes a single source of truth. A `portfolio_state` database table tracks per-user, per-mode portfolio balance. A `StrategySync` Service ensures all 8 strategies exist in `strategy_settings` for every user. This ensures a unified data flow from `portfolio_state` to the Dashboard UI, Walter context, and Cortex snapshots.

**System Truth Synchronization & Context Refresh (Phase 8.5 Addendum G+H)** establishes cross-layer data consistency validation and intelligent context refresh mechanisms. Core components include:
- **SystemTruthDiagnostic**: Compares portfolio balance, active strategies, engine state, and risk settings across backend, Cortex, and Walter layers. Detects discrepancies with configurable thresholds (10% for balance, absolute counts for strategies/trades) and classifies severity (high/medium/low). Provides both JSON and markdown output formats for programmatic and human-readable analysis.
- **ContextRefreshCoordinator**: Fetches latest trading status from backend API, synchronizes Cortex snapshots, updates Walter semantic memory, and emits WebSocket events for real-time UI updates. Achieves ~860-1112ms average refresh latency with comprehensive metrics tracking (total refreshes, failures, average latency, last refresh timestamp).
- **SystemHealthMonitor Integration**: Tracks context refresh metrics including `lastContextRefreshISO`, `avgContextLatencyMs`, `totalContextRefreshes`, and `failedContextRefreshes`. Enables system-wide visibility into data synchronization health.
- **Walter Auto-Refresh Integration**: Walter automatically checks context age before responding. If context is >30 seconds stale, Walter triggers auto-refresh before generating response, ensuring recommendations are based on fresh, accurate system state. Eliminates manual refresh requests and improves user trust.
- **Cortex Event Listener**: Cortex core integrates context refresh event listener to maintain synchronization with backend truth via dynamic import of ContextRefreshCoordinator. Enables real-time Cortex snapshot updates when context refresh occurs.
- **Dashboard Truth Panel UI**: Comprehensive frontend component displaying three-layer comparison (Backend/Cortex/Walter) with real-time sync status. Shows portfolio balance, active strategies, engine status across all layers. Features staleness indicator (green <30s, yellow >30s), manual refresh button, discrepancy list with severity color-coding (red=high, yellow=medium, blue=low), and refresh metrics (total refreshes, avg latency, failed count). Gracefully handles error states with retry functionality and "No Data" state for missing analytics.
- **NLAI Command Support**: Walter responds to natural language commands for manual context refresh ("refresh your data", "update context", "reload live values") and truth checking ("check system truth", "verify data alignment", "are systems in sync").
- **Discrepancy Alert System**: Automatically logs high-severity misalignments (portfolio balance divergence >10%, strategy count mismatches) as `[TruthAlert]` warnings with detailed field-level diagnostics. Medium/low severity discrepancies trigger advisory warnings.
- **API Endpoints**: GET `/api/system/truth-check` (JSON/markdown comparison report), POST `/api/context/refresh` (manual refresh trigger), GET `/api/context/metrics` (refresh operation statistics).

This infrastructure ensures Walter maintains accurate, real-time awareness of system state, enabling confident AI-driven recommendations and proactive detection of data drift across architectural layers. Auto-refresh integration eliminates stale context issues, while the Dashboard Truth Panel provides full transparency into cross-layer synchronization health.

**Live Source Enforcement & Verification (Phase 8.5 Addendum I)** eliminates all stale or cached data sources to ensure every context refresh pulls from the live backend state. Core changes include:
- **ContextRefreshCoordinator**: Now fetches data directly from `portfolio_state` table without fallback to hardcoded defaults (removed 1000 fallback). Matches `/api/trading/status` logic exactly for consistency. Includes `liveAPIUsed` markers in logs and `lastLivePortfolio` metric tracking. Auto-triggers resync when discrepancies detected after refresh.
- **SystemTruthDiagnostic**: Eliminated hardcoded fallback values (changed from 1000 to 0 when no portfolio state exists). Added `liveAPIUsed: true` flag to truth comparison results to verify live data usage.
- **PortfolioAggregator**: Deprecated `INITIAL_CAPITAL` constant. Now uses actual `portfolio_state.balance` or 0 if no state exists (no fallback to 1000).
- **SystemHealthMonitor**: Extended with `lastContextSource` and `lastRefreshDelta` fields to track data source provenance. Sets `lastContextSource = "live-api"` and `lastRefreshDelta = 0` when successful live refresh completes with 0 discrepancies.
- **Metrics Tracking**: ContextRefreshCoordinator metrics extended with `lastLivePortfolio` field. Already includes `refreshCount` (as `totalRefreshes`) and `avgRefreshLatency` (as `avgLatencyMs`).
- **Log Markers**: All live API fetches log `[ContextSource] live-api ✓` markers for auditing. Logs include source and portfolio values (e.g., `source=live-api portfolio=800 strategies=3`).
- **Auto-Resync Logic**: When truth check detects discrepancies after refresh, system automatically triggers secondary refresh with `source='resync'` to resolve misalignments without manual intervention.

This ensures all context layers (Backend, Cortex, Walter) always reflect true live system state from `portfolio_state` table, eliminating phantom balance mismatches and ensuring data integrity across the platform.

**Walter Context Rehydration on Response (Phase 8.5 Addendum J)** forces live context refresh before every Walter response, eliminating all in-memory staleness. Core changes include:
- **ensureFreshContext() Method**: Added to ContextRefreshCoordinator to force live context refresh without staleness checks. Called at the start of every `generateWalterResponse()` to guarantee fresh data.
- **getLatestContext() Method**: Added to ContextRefreshCoordinator to retrieve fresh portfolio balance, active strategies, and settings immediately after refresh. Returns live data for Walter's response generation.
- **contextUpdated Event**: ContextRefreshCoordinator now emits `contextUpdated` event after successful refresh, enabling Walter to rehydrate memory when live data arrives.
- **Event Listener**: Walter response service listens for `contextUpdated` events and logs rehydration notifications for transparency.
- **Response Metadata**: All Walter chat responses now include metadata with `dataSource: 'live-api'` and `refreshedAt: ISO timestamp` stored in `walterChatLogs.metadata` jsonb field.
- **Rehydration Logging**: Detailed logs show `[Addendum-J] Forcing live context rehydration...` and `Rehydrated context → portfolio=X strategies=Y source=live-api` for every response.

This ensures Walter always "speaks" from the latest live data, with no cached or stale values. Portfolio balances, strategy counts, and settings are refreshed on every message, guaranteeing accuracy and eliminating user confusion from outdated information.

## External Dependencies

-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.