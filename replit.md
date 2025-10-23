# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, disciplined risk management, and offers both live and paper trading capabilities. Leveraging OpenAI's GPT models, it provides AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. The primary goal is to deliver a comprehensive, resilient, and continuously improving self-optimizing trading platform with significant business and market potential in automated crypto trading.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first, responsive design. The backend uses Node.js and Express, providing a RESTful API and WebSocket support. Data persistence is managed by PostgreSQL via Neon serverless driver and Drizzle ORM.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, features an AI SysAdmin Co-Pilot named Walter. Walter's architecture includes a Unified Command & Conversation Layer, Semantic Memory Layer, Intelligence Refinement Layer, Real-Time Execution Layer, and a Unified Portfolio & Strategy State. It incorporates a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, Continuous Learning Pipeline, `StateAwarenessService`, and an Intent Execution Framework with a `Pre-Execution Validator`. The Autonomy Layer introduces self-directed analysis, meta-reasoning, exploratory learning, and automated optimization. The Emergent Awareness Layer provides meta-cognitive state tracking, and the Adaptive Learning & Goal Alignment Foundation enables experience-based learning and policy-aligned adaptation. Safety Guardrails & Operational Kill Switch provides comprehensive safety controls.

The system supports paper trading simulation with a database-first architecture and multi-intent command processing for Walter's NLAI. Live trading includes voice/chat activation with manual approval workflows. A Context Persistence Framework enables Walter to internalize mission context and development history. Inline Approval Prompts & Interactive Notifications facilitate manual approval workflows. Frontend Permission Integration implements comprehensive role-based access control (RBAC).

Trading State Synchronization & Fail-Safe Recovery provides database-backed trading mode persistence with automatic recovery and cross-service coordination via the `system_context` table and `TradingStateSync` service, including kill-switch integration and WebSocket broadcasts. Goals Engine Persistence & Audit Logging provides comprehensive audit trails for all goal changes.

PaperSim Lifecycle Initialization implements lazy initialization and explicit reset. Cross-Mode Isolation & PaperSim Broadcast Sync ensures paper trading broadcasts real-time WebSocket events and maintains independent state. PaperSim Universe Scan & Filter Trace provides read-only diagnostic capabilities. Symbol Canonicalization & Filter Parity enforces a canonical pair format across filtering components.

Trading Panel Enhancements include a **Filter Insights** tab displaying universe statistics, **Inline Live Trading Confirmation Modals**, and a **Filtered Pairs Live Data Feed**. Filter Health Diagnostic Logging integrates real-time filter statistics tracking. Screener Alignment with Goals Engine Filters unifies filtering logic by migrating to the `screener_filters` table.

Walter Chat Intent Detection & Hardening implements comprehensive intent parsing with hard override rules for paper simulation detection and a backend NLAI routing guard.

UI Navigation Reorganization consolidates navigation by integrating Command Center tabs into the AI Transparency page (now 13 tabs for AI oversight) and Search and Analysis into the Watchlist page.

Formula Audit & Computation Verification implements a `FormulaAuditService` to verify numeric computations against industry standards, with automated daily scheduled monitoring and alerts for deviations. Data Feed Integrity Monitor provides continuous monitoring of Kraken WebSocket and REST fallback feeds with automated health checks, status levels, grading, and alert management, including dormant-mode suppression.

Filter-Driven Auto-Watchlist implements screener-based initialization for Paper Trading simulation, automatically adding top qualifying pairs when the watchlist is empty. State Persistence and Broadcast Verification ensures robust state synchronization for paper trading engine lifecycle. Mode-Specific Engine Status Fields enhances trading state broadcasts for accurate UI display. Real-Time Filter Insights & Scan Status implements live-updating diagnostics for the Filter Insights tab. Watchlist Countdown Timer & Field Mapping adds a real-time countdown timer to the Watchlist component.

Execution Config introduces per-mode, per-action-type configuration for Walter's autonomous execution behavior via an `execution_config` database table. API Routing Architecture implements a dedicated Express Router for all backend routes at the `/api` prefix. Global Session Registration for Paper Trading ensures accurate UI toggle button state.

The system completed migration from legacy `paper_trades` to `paper_sim_trades`, `paper_sim_open_positions`, and `paper_sim_trade_logs`. `RiskManager` implements mode-aware position tracking. Filtered Pairs feature adds an endpoint and UI tab with auto-refresh for eligible trading pairs. Quote Currency Filter Removal eliminates currency-based filtering, allowing all trading pairs. Complete Database-Driven Guardrails eliminates all hardcoded risk limits and guardrail values, loading all configuration exclusively from database tables (`screener_filters`, `guardrails`, `trading_settings`).

Automated cleanup scheduler for expired signals, stale watchlist pairs, and old trades is included. Critical infrastructure enhancements include `FilteredPairsService` with caching and global numeric normalization middleware. Engine Start/Stop Recovery resolves critical engine startup timeout issues through non-blocking manager initialization, timeout protection, and comprehensive pre-flight validation checks, with an admin-only `/api/trading/force-stop` endpoint for emergency recovery. Global Settings Migration migrates Goals Engine to a global shared settings architecture, using exactly 1 row per mode (live/paper) for all configuration, shared across all users, with audit trails.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.