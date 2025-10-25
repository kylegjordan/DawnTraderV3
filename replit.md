# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application offers both live and paper trading capabilities and leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. The primary goal is to create a comprehensive, resilient, and continuously self-optimizing trading platform with significant market potential in automated crypto trading.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first, responsive design. The backend is built with Node.js and Express, providing a RESTful API and WebSocket support. Data persistence is managed by PostgreSQL using Neon serverless driver and Drizzle ORM.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, includes an AI SysAdmin Co-Pilot named Walter. Walter's architecture features a Unified Command & Conversation Layer, Semantic Memory Layer, Intelligence Refinement Layer, Real-Time Execution Layer, and a Unified Portfolio & Strategy State. It incorporates a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, Continuous Learning Pipeline, `StateAwarenessService`, Intent Execution Framework with a `Pre-Execution Validator`, and an Autonomy Layer for self-directed analysis and optimization. Safety Guardrails & Operational Kill Switch provides comprehensive safety controls.

The system supports paper trading simulation with a database-first architecture and multi-intent command processing. Live trading includes voice/chat activation with manual approval workflows. A Context Persistence Framework allows Walter to internalize mission context. Frontend Permission Integration implements comprehensive role-based access control (RBAC).

Trading State Synchronization & Fail-Safe Recovery provides database-backed trading mode persistence, automatic recovery, and cross-service coordination via the `system_context` table and `TradingStateSync` service. Goals Engine Persistence & Audit Logging provides comprehensive audit trails.

PaperSim Lifecycle Initialization implements lazy initialization and explicit reset. Cross-Mode Isolation & PaperSim Broadcast Sync ensures independent state and real-time WebSocket events. Symbol Canonicalization & Filter Parity enforces a canonical pair format.

Trading Panel Enhancements include a **Filter Insights** tab, **Inline Live Trading Confirmation Modals**, and a **Filtered Pairs Live Data Feed**. Screener Alignment with Goals Engine Filters unifies filtering logic using the `screener_filters` table.

Walter Chat Intent Detection & Hardening implements comprehensive intent parsing with hard override rules for paper simulation detection and a backend NLAI routing guard. UI Navigation consolidates Command Center tabs into the AI Transparency page and Search and Analysis into the Watchlist page.

Formula Audit & Computation Verification implements a `FormulaAuditService` to verify numeric computations. Data Feed Integrity Monitor provides continuous monitoring of Kraken WebSocket and REST feeds.

Filter-Driven Auto-Watchlist initializes paper trading simulation with top qualifying pairs when the watchlist is empty. State Persistence and Broadcast Verification ensures robust state synchronization.

Execution Config introduces per-mode, per-action-type configuration for Walter's autonomous execution behavior via an `execution_config` database table. API Routing Architecture uses a dedicated Express Router for all backend routes at the `/api` prefix. Global Session Registration for Paper Trading ensures accurate UI toggle button state.

The system has migrated from legacy `paper_trades` to `paper_sim_trades`, `paper_sim_open_positions`, and `paper_sim_trade_logs`. `RiskManager` implements mode-aware position tracking. Filtered Pairs feature adds an endpoint and UI tab with auto-refresh. Complete Database-Driven Guardrails eliminates all hardcoded risk limits and guardrail values, loading configurations exclusively from database tables (`screener_filters`, `guardrails`, `trading_settings`).

An automated cleanup scheduler for expired signals, stale watchlist pairs, and old trades is included. Engine Start/Stop Recovery resolves engine startup timeout issues through non-blocking manager initialization, timeout protection, and pre-flight validation checks, with an admin-only `/api/trading/force-stop` for emergency recovery.

Systematic Global Settings Migration enforced global settings shared across all users, while engine instances remain per-user for independent portfolio management.

The Local Autonomous Trading Tuning Intelligence (LATTI) service, an evolution of the Local Heuristic Trader Service (LHTS), provides autonomous trading parameter optimization, operating offline with zero external dependencies. It supports independent paper and live mode instances, with dual `HeuristicTraderService` instances coordinated by a `LATTIManager` class. A `BaselineIndicator Service` implements a simplified manual-copy baseline approach for paper-to-live parameter transfer. Fee-Aware Metrics Display provides comprehensive fee-aware metrics visualization.

Trading Pace Control provides global trading aggressiveness settings via the Goals Engine with four pace options (Conservative, Baseline, Optimistic, Aggressive) and dynamic target metrics. The trading pace is stored in `system_context.trading_pace` and applies globally to both Live and Paper modes.

Automated Trading Signals Cleanup Scheduler implements a 5-minute recurring task that marks expired signals and removes old entries.

Portfolio Balance Confirmation System implements mandatory balance confirmation before starting Paper Trading. If confirmation is missing or stale, the API returns `requiresConfirmation: true` prompting the user to confirm via modal before starting.

Multi-User Synchronization provides real-time WebSocket broadcast synchronization across all user sessions for portfolio balances, trading toggle state, and global alerts.

Simulation Startup Modal implements a user choice dialog when starting paper trading: Continue Previous Simulation (resumes with existing baseline) or Start New Simulation (resets baseline, metrics, and portfolio balance). The modal includes balance input for new simulations. Backend supports 'continue' and 'new' modes via `/api/paper-sim/start` endpoint.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.