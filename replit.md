# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application offers both live and paper trading capabilities and leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. The primary goal is to create a comprehensive, resilient, and continuously self-optimizing trading platform with significant market potential in automated crypto trading.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first, responsive design, and a Node.js/Express backend providing a RESTful API and WebSocket support. Data persistence is managed by PostgreSQL using Neon serverless driver and Drizzle ORM.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, includes an AI SysAdmin Co-Pilot named Walter. Walter's architecture features a Unified Command & Conversation Layer, Semantic Memory Layer, Intelligence Refinement Layer, Real-Time Execution Layer, and a Unified Portfolio & Strategy State. It incorporates a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, Continuous Learning Pipeline, `StateAwarenessService`, Intent Execution Framework with a `Pre-Execution Validator`, and an Autonomy Layer, with Safety Guardrails & Operational Kill Switch. The system supports paper trading simulation with a database-first architecture and multi-intent command processing. Live trading includes voice/chat activation with manual approval workflows.

The architecture uses a global mode-based engine, with one engine per mode (live/paper) shared by all users. `ModeRegistry` service provides production telemetry with WebSocket broadcasts for real-time mode status updates. `/api/system/health` returns comprehensive dual-mode telemetry.

`MetricsCore` service provides centralized metrics calculation with strict mode isolation for portfolio, risk, and execution KPIs, with mode-based APIs and real-time WebSocket broadcasts. Live pricing integration is handled by a `LivePricingAdapter` service providing external market price feeds with dual-source integration, a 15-second refresh cycle, and WebSocket broadcasts. `MetricsCore` consumes live pricing data for live mode unrealized P/L calculations.

The Goals Engine UI includes advanced universe and signal controls, execution rhythm controls, and simplified daily target goals with Trading Pace presets. A Goal Feasibility Validation & Audit System tracks and validates goal change attempts against guardrail limits. The system calculates and displays a rolling **Average Daily Earnings % (ADE%)** as a percentage of portfolio value. It implements bidirectional synchronization between Trading Pace presets and Performance Metrics.

The Dashboard LATTI widget mirrors Goals Engine Target Daily Goals, displaying LATTI-calculated values: Risk per Trade ($), Trades per Day, Target Daily Average Earnings %, Current Portfolio Value ($), and a Projected Portfolio Growth table using compound daily growth. "Risk per Trade ($)" is converted to "Portfolio Risk per Trade (%)" across the Goals Engine and Dashboard LATTI widget.

### LATTi Goals + Guardrails Modernization
The system uses a modern `guardrails_v2` schema with four core guardrail parameters:
- **Portfolio Risk per Trade %**: Percentage of portfolio value at risk per trade
- **Symbol Cooldown (minutes)**: Minimum time between trades on the same symbol
- **Max Open Positions**: Maximum concurrent open positions
- **Daily Loss Kill Switch %**: Portfolio loss threshold that triggers emergency shutdown

Key features include dual-mode operation (paper/live) with independent guardrail sets, coherency validation enforced via 10 validation rules (including learning expansion caps), backend API endpoints for GET/PUT guardrails, and real-time WebSocket broadcasts for config changes.

The system implements toggle controls for switching between LATTi autonomous optimization and manual user control for individual parameters. This is managed via `locked_by_user` flags in the `guardrails_v2` table and `managed_by_lottie`/`manual_override_enabled` metadata flags for filters. Dedicated frontend components (`CoreFourGuardrails`, `FiltersWithOverride`) and a `useOverrideState` hook manage this functionality with real-time WebSocket synchronization.

A unified dashboard widget and Goals Preset Grid implements a 4+1 preset structure (Conservative, Baseline, Optimistic, Maximum, Custom) with coherency analytics, stored in a `goals_presets` table. Presets can be applied via API, triggering updates to `guardrails_v2` and broadcasting WebSocket events.

A **GuardrailPolicy Service** (`server/services/guardrail-policy.ts`) acts as a single backend source of truth for guardrail values with runtime coherency enforcement. It handles:
- **Effective Value Resolution**: Determines values based on manual vs. LATTi management.
- **Coherency Validation**: Validates all 10 rules (including Phase 6 learning expansion caps), returning errors or warnings.
- **Kill Switch Management**: Implements a circuit breaker pattern with per-mode state to activate/reset emergency trading halts.
- **Conflict Detection**: Identifies attempts to override LATTi-managed parameters without proper locking.
- **Metrics & Telemetry**: Tracks rule failures, kill switch trips, and override conflicts.
The API layer exposes endpoints for effective guardrails, updating guardrails with full coherency validation, and managing the kill switch state. New WebSocket events are broadcast for kill switch status and policy updates. The GuardrailPolicy Service is integrated into the `RiskManager`, `StrategyEngine`, and `LATTI Manager` to ensure consistent and safe operation.

**Phase 6 - Adaptive Learning Mode (COMPLETED):**
The Goals Engine now features an adaptive learning system that automatically optimizes preset boundaries based on 30-day performance metrics. When a preset achieves ≥80% of its target daily return over a 30-day rolling window, the system automatically expands all guardrail parameters by 5% to capitalize on proven performance. Global safety caps prevent runaway expansion: portfolio risk capped at 5.0%, kill switch at 20.0%, cooldown at 90 minutes, max positions at 20. The `goals_learning_metrics` table stores daily performance snapshots, and the `v_goals_learning_summary` view provides 30-day rolling averages. The `GoalsLearningEngine` service (`server/services/goals-learning-engine.ts`) handles auto-adjustment logic with safety cap enforcement. API endpoints include GET `/api/goals-learning/summary` for metrics and POST `/api/goals-learning/trigger` for manual learning cycles. Each preset tracks `last_adjusted_at` timestamp and `learning_active` boolean flag. WebSocket events (`goals.learning.expanded`, `goals.learning.completed`) broadcast learning actions in real-time. Designed for daily cron execution with manual trigger capability for testing. Full documentation in `docs/goals_engine_redesign_overview.md`. Safety rule RULE_010 added to `audit/coherency_rules.yaml`.

**Phase 27.F.34 - Screener Filters Modernization (COMPLETED):**
All legacy screener variable inputs have been removed. The Screeners tab now exclusively uses the unified v2 filter configuration with modern fields (Volume, Price, Market Quality, RSI, Volatility, Asset Type, Universe & Signal Controls). Deprecated fields (avgVolumeRatio, atrThreshold, earningsBlackout, priceDeltaTrigger as screener variable) have been fully removed from both frontend and backend. API endpoints `/api/screeners` and `/api/filters-v2` provide mode-specific access to current filter configuration.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: External market price feed (primary for live pricing).
-   **CoinGecko API**: External market price feed (fallback for live pricing).
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.