# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, disciplined risk management, and offers both live and paper trading capabilities. The application leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its primary goal is to provide a comprehensive, resilient, and continuously improving self-optimizing trading platform, delivering a leading-edge solution in automated crypto trading with significant business and market potential.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX
The frontend is built with React, TypeScript, Vite, shadcn/ui (Radix UI + Tailwind CSS), and TanStack Query, featuring a mobile-first, responsive design with dynamic mode-aware UI. It includes voice transcription, context-based persistent chat history, a mode-aware toggle for trading engines with safety confirmations, and a comprehensive, categorized notification system. Walter UI enhancements include chat deletion, archive/delete, dynamic textarea resizing, and optimized vertical space. The dashboard includes a System Truth Panel for real-time comparison of backend, Cortex, and Walter states, and a Data Flow Trace Panel for development.

### Technical Implementation
The backend uses Node.js with Express, providing a RESTful API and WebSocket support. Data storage is handled by PostgreSQL via Neon serverless driver and Drizzle ORM. Key services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. The system offers 8 automated trading strategies, multi-layered risk management, AI-powered opportunity identification, and a Continuous Learning Engine (CLE). Authentication uses username/password with bcrypt and JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, provides insights. An AI SysAdmin Co-Pilot named Walter handles system configuration and optimization with a dual-control system, featuring a Unified Command & Conversation Layer, Semantic Memory Layer (pgvector and OpenAI embeddings), and an Intelligence Refinement Layer with a Self-optimizing Cognitive Weight Adjuster. `DiagnosticsAnalyzer` and "Bob Inspector Service" perform auto-analysis. A Paper Trading Simulation Engine provides real-time execution, and system-wide global session tracking ensures dashboard synchronization.

The system incorporates a multi-module intelligent caching system (Bob Core) for performance optimization, including modules for metrics, dashboard data, configuration, strategy intelligence, trade data, system insights, and UI state. A Hybrid Cortex Intelligent Memory Layer acts as a memory bridge between Bob Core and Walter, managing short-term context and snapshots.

**System Health & Diagnostic Intelligence** includes `SystemHealthMonitor` tracking performance metrics and a `SelfRepairService` for automated recovery. Anomaly detection and health metrics are integrated into MetricsBob and InsightBob for Walter AI context. A Natural Language Action Interpreter (NLAI) system enables pattern-based intent recognition and command execution for Walter.

**User Preference Management** allows comprehensive workspace customization. A **Contextual Intent Engine (CIE)** with `IntentClassifier`, `SemanticGuardrail`, and `ContextualNLAIInterpreter` provides Walter with semantic understanding.

**Real-Time Execution Layer** components include `MarketDataWebSocket`, `ExecutionTimingService`, `SlippageFeeModelingService`, `RateControlService`, `MarketDataCoordinator`, `RealtimePaperExecutor`, and `ParityGateService` for paper-to-live readiness validation.

**Unified Portfolio & Strategy State** ensures a single source of truth for portfolio balance and strategy settings, maintained by a `portfolio_state` database table and `StrategySync` Service.

**System Truth Synchronization & Context Refresh** establishes cross-layer data consistency validation. `SystemTruthDiagnostic` compares data across backend, Cortex, and Walter layers, detecting discrepancies. `ContextRefreshCoordinator` fetches the latest trading status, synchronizes Cortex snapshots, updates Walter's semantic memory, and emits WebSocket events for UI updates. Walter automatically triggers context refresh if data is stale before responding, and all Walter responses include `dataSource: 'live-api'` metadata.

**Live Source Enforcement & Verification** ensures all context refreshes pull directly from the live backend state, eliminating cached or stale data. `ContextRefreshCoordinator` and `SystemTruthDiagnostic` fetch data directly from the `portfolio_state` table.

**Walter Context Rehydration on Response** forces a live context refresh before every Walter response via `ensureFreshContext()` to eliminate in-memory staleness. Memory deduplication prevents runaway memory growth from identical refresh entries.

**Chat Route Alignment & UI Telemetry Binding** integrates UI with backend telemetry. The Dashboard polls `/api/system/truth-check` for real-time truth data. A Global Request Trace System tracks API calls, and Walter assistant messages display a "Source: live-api ✓" badge indicating fresh data.

**Direct Fresh Data Injection (Addendum K.1)** ensures Walter's prompt receives live system state directly. Fresh portfolio balance, active strategies, engine status, and mode are fetched via `ensureFreshContext()` and injected as a LIVE SYSTEM STATE block in Walter's system prompt. This eliminates reliance on potentially stale semantic memory retrieval. All fallback logic defaults to $0 (not $1000) when portfolio_state is absent, enforcing consistency with Addendum I live source rules.

**Global Context Unification (Addendum K.3)** establishes a shared workspace architecture where all users operate within a single global context. The system uses `globalContextId = 'default'` for all shared resources including portfolio state, strategy settings, and trading configuration. Users are differentiated by roles (owner/editor/viewer) stored in the `users` table. This eliminates per-user data duplication—the system now maintains exactly 16 strategies (8 live + 8 paper) instead of 48+ duplicates. Critical services updated: `ContextRefreshCoordinator`, `StrategySync`, `PortfolioAggregator`, and API routes `/api/trading/status`, `/api/strategies/settings`. The migration consolidated all data to a single canonical portfolio ($800 in paper mode) and assigned all existing users the 'owner' role. Walter chat history preserved with global context linkage via `walter_chats.global_context_id`.

## External Dependencies

-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.