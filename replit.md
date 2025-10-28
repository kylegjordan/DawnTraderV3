# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application offers both live and paper trading capabilities and leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. The primary goal is to create a comprehensive, resilient, and continuously self-optimizing trading platform with significant market potential in automated crypto trading.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first, responsive design, and a Node.js/Express backend providing a RESTful API and WebSocket support. Data persistence is managed by PostgreSQL using Neon serverless driver and Drizzle ORM.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, includes an AI SysAdmin Co-Pilot named Walter. Walter's architecture features a Unified Command & Conversation Layer, Semantic Memory Layer, Intelligence Refinement Layer, Real-Time Execution Layer, and a Unified Portfolio & Strategy State. It incorporates a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, Continuous Learning Pipeline, `StateAwarenessService`, Intent Execution Framework with a `Pre-Execution Validator`, and an Autonomy Layer, with Safety Guardrails & Operational Kill Switch. The system supports paper trading simulation with a database-first architecture and multi-intent command processing. Live trading includes voice/chat activation with manual approval workflows.

The architecture has transitioned to a global mode-based engine, with one engine per mode (live/paper) shared by all users, eliminating per-user engine state. All Bob services (`ConfigBob`, `StrategyBob`, `TradingBob`) are refactored for mode-based operation. `ModeRegistry` service provides production telemetry with WebSocket broadcasts for real-time mode status updates. `/api/system/health` returns comprehensive dual-mode telemetry.

`MetricsCore` service provides centralized metrics calculation with strict mode isolation for portfolio, risk, and execution KPIs, with mode-based APIs and real-time WebSocket broadcasts. Live pricing integration is handled by a `LivePricingAdapter` service providing external market price feeds with dual-source integration, a 15-second refresh cycle, and WebSocket broadcasts. `MetricsCore` consumes live pricing data for live mode unrealized P/L calculations.

The Goals Engine UI has been refactored to include advanced universe and signal controls (Market Universe Size, Confidence Threshold, Quote Currencies, Active Timeframes), execution rhythm controls (Symbol Cool-Down), and simplified daily target goals with Trading Pace presets. A Goal Feasibility Validation & Audit System tracks goal change attempts and validates Target per Trade against guardrail limits, providing frontend feedback and logging all attempts. All validation rules and guardrail parameters are database-driven and integrated with LATTI for optimization.

The system calculates and displays a rolling **Average Daily Earnings % (ADE%)** as a percentage of portfolio value. It implements bidirectional synchronization between Trading Pace presets and Performance Metrics, ensuring consistency across the Goals Engine. The Trading Pace Control widget displays "Target Daily Avg Earning %". Symbol Cooldown synchronization ensures `cooldownMinutes` stays unified across Guardrails, Tuning Policy, and LATTI. The PerformanceTrackingMetrics component is replaced with a simplified TargetDailyGoals component featuring an editable "Target Daily Average Earnings %" input field and a projected balances table. The backend `/api/system/trading-pace` endpoint calculates and stores "Target Daily Avg Earning %" for both modes. The LATTI Dashboard widget displays this metric as a read-only value. Guardrails save endpoint hardening includes structured logging, payload whitelisting, single-transaction save, detailed error responses, and WebSocket broadcasts for real-time cache invalidation. Client-side improvements include updated mutation handling, dual query invalidation, WebSocket subscription listeners, and detailed error messages.

The Dashboard LATTI widget now mirrors Goals Engine Target Daily Goals, displaying LATTI-calculated values only: Risk per Trade ($), Trades per Day, Target Daily Average Earnings %, Current Portfolio Value ($), and a Projected Portfolio Growth table. Projections use compound daily growth. "Risk per Trade ($)" is converted to "Portfolio Risk per Trade (%)" across the Goals Engine and Dashboard LATTI widget, displayed as a percentage of total portfolio value.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: External market price feed (primary for live pricing).
-   **CoinGecko API**: External market price feed (fallback for live pricing).
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.