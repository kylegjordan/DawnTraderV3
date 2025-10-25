# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application designed for Kraken. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application offers both live and paper trading capabilities and leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. The primary goal is to create a comprehensive, resilient, and continuously self-optimizing trading platform with significant market potential in automated crypto trading.

## User Preferences
Preferred communication style: Simple, everyday language.

## Test Credentials
For functionality testing and all future tests:
- Username: testuser123
- Password: SecurePass123!
Note: Always use username (not email) for login.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first, responsive design. The backend is built with Node.js and Express, providing a RESTful API and WebSocket support. Data persistence is managed by PostgreSQL using Neon serverless driver and Drizzle ORM.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, includes an AI SysAdmin Co-Pilot named Walter. Walter's architecture features a Unified Command & Conversation Layer, Semantic Memory Layer, Intelligence Refinement Layer, Real-Time Execution Layer, and a Unified Portfolio & Strategy State. It incorporates a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, Continuous Learning Pipeline, `StateAwarenessService`, Intent Execution Framework with a `Pre-Execution Validator`, and an Autonomy Layer for self-directed analysis and optimization. Safety Guardrails & Operational Kill Switch provides comprehensive safety controls.

The system supports paper trading simulation with a database-first architecture and multi-intent command processing. Live trading includes voice/chat activation with manual approval workflows. A Context Persistence Framework allows Walter to internalize mission context. Frontend Permission Integration implements comprehensive role-based access control (RBAC).

Trading State Synchronization & Fail-Safe Recovery provides database-backed trading mode persistence, automatic recovery, and cross-service coordination via the `system_context` table and `TradingStateSync` service. Goals Engine Persistence & Audit Logging provides comprehensive audit trails.

PaperSim Lifecycle Initialization implements lazy initialization and explicit reset. Cross-Mode Isolation & PaperSim Broadcast Sync ensures independent state and real-time WebSocket events. Symbol Canonicalization & Filter Parity enforces a canonical pair format.

Trading Panel Enhancements include a **Filter Insights** tab, **Inline Live Trading Confirmation Modals**, and a **Filtered Pairs Live Data Feed**. Filter Health Diagnostic Logging tracks real-time filter statistics. Screener Alignment with Goals Engine Filters unifies filtering logic using the `screener_filters` table.

Walter Chat Intent Detection & Hardening implements comprehensive intent parsing with hard override rules for paper simulation detection and a backend NLAI routing guard. UI Navigation consolidates Command Center tabs into the AI Transparency page and Search and Analysis into the Watchlist page.

Formula Audit & Computation Verification implements a `FormulaAuditService` to verify numeric computations, with automated daily monitoring and alerts. Data Feed Integrity Monitor provides continuous monitoring of Kraken WebSocket and REST feeds with automated health checks and alerts.

Filter-Driven Auto-Watchlist initializes paper trading simulation with top qualifying pairs when the watchlist is empty. State Persistence and Broadcast Verification ensures robust state synchronization. Mode-Specific Engine Status Fields enhance trading state broadcasts. A Watchlist Countdown Timer & Field Mapping is included.

Execution Config introduces per-mode, per-action-type configuration for Walter's autonomous execution behavior via an `execution_config` database table. API Routing Architecture uses a dedicated Express Router for all backend routes at the `/api` prefix. Global Session Registration for Paper Trading ensures accurate UI toggle button state.

The system has migrated from legacy `paper_trades` to `paper_sim_trades`, `paper_sim_open_positions`, and `paper_sim_trade_logs`. `RiskManager` implements mode-aware position tracking. Filtered Pairs feature adds an endpoint and UI tab with auto-refresh. Complete Database-Driven Guardrails eliminates all hardcoded risk limits and guardrail values, loading configurations exclusively from database tables (`screener_filters`, `guardrails`, `trading_settings`).

An automated cleanup scheduler for expired signals, stale watchlist pairs, and old trades is included. Critical infrastructure enhancements include `FilteredPairsService` with caching and global numeric normalization middleware. Engine Start/Stop Recovery resolves engine startup timeout issues through non-blocking manager initialization, timeout protection, and pre-flight validation checks, with an admin-only `/api/trading/force-stop` for emergency recovery.

Systematic Global Settings Migration eliminated all userId dependencies from settings/configuration calls, enforcing global settings shared across all users, while engine instances remain per-user for independent portfolio management.

The Local Autonomous Trading Tuning Intelligence (LATTI) service, an evolution of the Local Heuristic Trader Service (LHTS), provides autonomous trading parameter optimization, operating offline with zero external dependencies. It includes MetricsCollector, HeuristicEngine with rule-based decision rules, and AdjustmentExecutor with safety-bounded parameter changes. LATTI supports independent paper and live mode instances, with dual `HeuristicTraderService` instances coordinated by a `LATTIManager` class. A `BaselineIndicator Service` implements a simplified manual-copy baseline approach for paper-to-live parameter transfer, with criteria for baseline establishment and fee-aware calculations. Fee-Aware Metrics Display provides comprehensive fee-aware metrics visualization across the Dashboard and Goals Engine.

Trading Pace Control provides global trading aggressiveness settings via the Goals Engine. It features four pace options (Conservative, Baseline, Optimistic, Aggressive) with dynamic target metrics for risk per trade, trades per day, earnings per trade, and daily profit targets. The trading pace is stored in `system_context.trading_pace` and applies globally to both Live and Paper modes. The UI component is located in the Goals tab and integrates with LATTI for autonomous parameter adjustment within user-defined pace boundaries.

Automated Trading Signals Cleanup Scheduler (Phase 27.F.14.D) implements a 5-minute recurring task that marks expired signals and removes old entries (>7 days expired) to prevent database bloat. The cleanup task is registered with `SchedulerRegistry` and runs via `TradingSignalsCleanupTask`. Manual cleanup reduced active signals from 5,032 → 555 (91% reduction) by removing 4,400+ duplicates in October 2025.

Portfolio Balance Confirmation System (Phase 27.F.14.D-POST) implements mandatory balance confirmation before starting Paper Trading. The system checks if the portfolio balance has been confirmed within the last 24 hours via the `balance_last_confirmed` timestamp in `system_context`. If confirmation is missing or stale, the API returns `requiresConfirmation: true` with the current balance, prompting the user to confirm via modal before starting. Confirmation updates both the portfolio balance and timestamp through the `/api/paper-sim/confirm-balance` endpoint. The check is integrated into both `/api/trading/start` (for paper mode) and `/api/paper-sim/start` direct endpoints.

Multi-User Synchronization (Phase 27.F.14.E) provides real-time WebSocket broadcast synchronization across all user sessions. When portfolio balances are confirmed, the backend broadcasts `portfolio_balance_updated` events, triggering immediate dashboard refresh for all connected clients. Trading toggle state automatically syncs via existing `trading_state_changed` broadcasts, ensuring all users see identical start/stop states. Global alert synchronization broadcasts `alerts_updated` events when alerts are created, dismissed, or cleared, so all users maintain identical alert visibility. Frontend components (`TopBar`, `AlertBanner`) listen for these WebSocket events and invalidate React Query caches to immediately reflect changes across sessions.

Simulation Startup Modal (Phase 27.F.14.I) implements a user choice dialog when starting paper trading: Continue Previous Simulation (resumes with existing baseline) or Start New Simulation (resets baseline, metrics, and portfolio balance). The modal includes balance input for new simulations. Backend supports 'continue' and 'new' modes via `/api/paper-sim/start` endpoint. Baseline management uses `baseline_mode` field in `system_context` ('per_simulation', 'cumulative', 'persistent') for phase-based baseline transitions. New simulations reset LATTI baseline anchor time and set baseline_mode to 'per_simulation'.

Phase 27.F.14.J - Final Baseline Policy Integration, Guardrails Reset, and Alert Sync Verification completed with enhanced debug logging. Baseline mode policy integration handles per_simulation/cumulative/persistent modes with proper logging at `/api/paper-sim/start` endpoint. New simulation flow resets guardrails (maxDailyLoss=150, maxExposure=25, maxPositionSize=10, minWinRate=40) and screener filters (minVolume=5000, maxBidAskSpread=2.0, excludeStablecoins=true) to baseline defaults. Enhanced alert synchronization logging on both backend (`alerts-service.ts`) and frontend (`alert-banner.tsx`) provides latency tracking and comprehensive audit trail for broadcast→receipt verification. Trade execution diagnostic verified trading pipeline components (361 signals, 371 filtered pairs); execution requires running engine.

## Recent Changes
- **Oct 25, 2025**: Phase 27.F.14.K completed - Critical bug fixes: (1) Fixed `updateSystemContext()` calls passing single object instead of two parameters (mode, updates) - corrected 3 locations in routes.ts; (2) Made alerts truly global per mode by removing userId filtering from all alert queries - when one user dismisses alerts, ALL users see the change; (3) Biometric login now mobile-only with user agent detection and localStorage preference tracking to prevent repeated prompts
- **Oct 25, 2025**: Phase 27.F.14.J-POST completed - Fixed deprecated getGlobalContextId() 500 error in paper-sim/start and paper-sim/reset endpoints by replacing with getSystemContext(); enhanced alert synchronization debug logging with client count tracking; login improvements: case-insensitive username, password visibility toggle (Eye/EyeOff icons), forgot password link, integrated WebAuthn biometric login for mobile devices with setup flow; removed manual refresh button regression from LIVE|PAPER toggle
- **Oct 25, 2025**: Phase 27.F.14.J completed - Baseline mode policy integration (per_simulation/cumulative/persistent), guardrails/filters reset on new simulation, enhanced alert sync debug logs with latency tracking, trade execution diagnostic (361 signals, 371 filtered pairs, requires running engine for execution)
- **Oct 25, 2025**: Phase 27.F.14.I - Fixed critical bugs in multi-user sync implementation: (1) Created `/api/paper/portfolio/state` endpoint that correctly reads from `portfolio_state.balance` field; (2) Fixed portfolio state writes in `/api/paper-sim/start` to use `balance` field instead of non-existent `totalValue`; (3) PortfolioValueWidget now displays accurate $834 balance from database; (4) Fixed graceful handling of already-stopped engines in new simulation flow; (5) All fixes architect-approved with no regressions
- **Oct 24, 2025**: Multi-user synchronization completed (Phase 27.F.14.E) - portfolio balance, trading toggle, and alerts sync across all sessions via WebSocket broadcasts
- **Oct 24, 2025**: Portfolio balance confirmation system fully implemented (Phase 27.F.14.D-POST) - backend and frontend complete with modal state synchronization fix
- **Oct 24, 2025**: Automated cleanup scheduler implemented and verified working (Phase 27.F.14.D)
- **Oct 24, 2025**: Mobile responsive overhaul completed across Trading, Watchlist, Reports, and System Monitoring pages with icon-only tabs for dense tab sets (<640px)
- **Oct 24, 2025**: Signal deduplication implemented in `saveTradingSignal()` to prevent duplicate signals

## Known Technical Debt
- **Pre-existing LSP Type Errors in paper-sim-service.ts**: Lines 239-540 have type errors related to null/undefined handling and return type mismatches. These are in older code sections and do not affect runtime functionality. These should be addressed in future cleanup work.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.