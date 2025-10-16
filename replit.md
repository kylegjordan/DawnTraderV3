# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, disciplined risk management, and offers both live and paper trading capabilities. The application leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its primary goal is to provide a comprehensive, resilient, and continuously improving self-optimizing trading platform, delivering a leading-edge solution in automated crypto trading with significant business and market potential.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX
The frontend is built with React, TypeScript, Vite, shadcn/ui (Radix UI + Tailwind CSS), and TanStack Query, featuring a mobile-first, responsive design with dynamic mode-aware UI. It includes voice transcription, context-based persistent chat history, a mode-aware toggle for trading engines with safety confirmations, and a comprehensive, categorized notification system. The dashboard includes a System Truth Panel for real-time comparison of backend, Cortex, and Walter states, and a Data Flow Trace Panel for development.

### Technical Implementation
The backend uses Node.js with Express, providing a RESTful API and WebSocket support. Data storage is handled by PostgreSQL via Neon serverless driver and Drizzle ORM. Key services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. The system offers 8 automated trading strategies, multi-layered risk management, AI-powered opportunity identification, and a Continuous Learning Engine (CLE). Authentication uses username/password with bcrypt and JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, provides insights. An AI SysAdmin Co-Pilot named Walter handles system configuration and optimization with a dual-control system, featuring a Unified Command & Conversation Layer, Semantic Memory Layer (pgvector and OpenAI embeddings), and an Intelligence Refinement Layer with a Self-optimizing Cognitive Weight Adjuster. A Paper Trading Simulation Engine provides real-time execution, and system-wide global session tracking ensures dashboard synchronization.

The system incorporates a multi-module intelligent caching system (Bob Core) for performance optimization, including modules for metrics, dashboard data, configuration, strategy intelligence, trade data, system insights, and UI state. A Hybrid Cortex Intelligent Memory Layer acts as a memory bridge between Bob Core and Walter, managing short-term context and snapshots.

**System Health & Diagnostic Intelligence** includes `SystemHealthMonitor` tracking performance metrics and a `SelfRepairService` for automated recovery, with anomaly detection and health metrics integrated into MetricsBob and InsightBob for Walter AI context. A Natural Language Action Interpreter (NLAI) system enables pattern-based intent recognition and command execution for Walter. User preference management allows comprehensive workspace customization. A **Contextual Intent Engine (CIE)** provides Walter with semantic understanding.

**Real-Time Execution Layer** components include `MarketDataWebSocket`, `ExecutionTimingService`, `SlippageFeeModelingService`, `RateControlService`, `MarketDataCoordinator`, `RealtimePaperExecutor`, and `ParityGateService` for paper-to-live readiness validation.

**Unified Portfolio & Strategy State** ensures a single source of truth for portfolio balance and strategy settings, maintained by a `portfolio_state` database table and `StrategySync` Service. **System Truth Synchronization & Context Refresh** establishes cross-layer data consistency validation. `SystemTruthDiagnostic` compares data across backend, Cortex, and Walter layers, detecting discrepancies. `ContextRefreshCoordinator` fetches the latest trading status, synchronizes Cortex snapshots, updates Walter's semantic memory, and emits WebSocket events for UI updates. Walter automatically triggers context refresh if data is stale before responding, and all Walter responses include `dataSource: 'live-api'` metadata.

**Live Source Enforcement & Verification** ensures all context refreshes pull directly from the live backend state. `ContextRefreshCoordinator` and `SystemTruthDiagnostic` fetch data directly from the `portfolio_state` table. Walter's prompt receives live system state directly, injected as a LIVE SYSTEM STATE block in Walter's system prompt, ensuring fresh portfolio balance, active strategies, engine status, and mode.

**Global Context Unification** establishes a shared workspace architecture where all users operate within a single global context using `globalContextId = 'default'`. Users are differentiated by roles (owner/editor/viewer). This eliminates per-user data duplication. **Live Mode Visibility Synchronization** ensures Walter AI and the dashboard always display portfolio balances and strategy configurations for BOTH live and paper modes from the database, regardless of trading engine status. `ContextRefreshCoordinator.ensureFreshDualContext()` fetches both modes in parallel.

**Database Initialization & Live-Mode Portfolio State** establishes automated portfolio state initialization on server startup to ensure both live and paper mode entries exist in the `portfolio_state` table.

**Hybrid Cognitive-Operational Walter** transforms Walter into a dual-layer intelligence system: (1) **Cognitive Layer** (`walter-cognitive-layer.ts`) provides intent reflection, strategic options, and follow-up questions with three tone profiles (Technical, Conversational, Advisory); (2) **Intent Gateway** (`walter-intent-gateway.ts`) validates all operational commands with RBAC, risk assessment, and audit logging; (3) **Execution Core** (existing trading-engine, strategy-engine, risk-manager) handles actual trading operations. The Intent Gateway prevents the Cognitive Layer from executing trades directly.

**Unified Conversational Walter** makes Walter permanently conversational by routing ALL system outputs through natural language interpretation. This involves a **Cognitive Interpreter Service** (`cognitive-interpreter.ts`) that translates raw execution events into natural language narratives, an **Event Broker** (`event-broker.ts`) that intercepts all execution core outputs, **Learning Fragment Storage** for persisting interpreted events, a **Conversational Context Manager** for maintaining dialogue history, and a **Learning Cycle Service** for continuous improvement.

**Data Provenance & Source Governance** establishes complete end-to-end traceability for all data flows from database to UI, implementing a single source of truth policy with correlation tracking using `data_lineage` and `bob_trace_log` tables.

## External Dependencies

-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.