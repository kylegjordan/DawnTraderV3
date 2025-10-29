# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application offers both live and paper trading capabilities and leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. The primary goal is to create a comprehensive, resilient, and continuously self-optimizing trading platform with significant market potential in automated crypto trading.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first, responsive design, and a Node.js/Express backend providing a RESTful API and WebSocket support. Data persistence is managed by PostgreSQL using Neon serverless driver and Drizzle ORM.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, includes an AI SysAdmin Co-Pilot named Walter. Its architecture features a Unified Command & Conversation Layer, Semantic Memory Layer, Intelligence Refinement Layer, Real-Time Execution Layer, and a Unified Portfolio & Strategy State. It incorporates a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, Continuous Learning Pipeline, `StateAwarenessService`, Intent Execution Framework with a `Pre-Execution Validator`, and an Autonomy Layer with Safety Guardrails & Operational Kill Switch. The system supports paper trading simulation with a database-first architecture and multi-intent command processing, and live trading includes voice/chat activation with manual approval workflows.

The architecture uses a global mode-based engine (one per live/paper mode) shared by all users. `ModeRegistry` provides production telemetry via WebSocket broadcasts. `/api/system/health` returns dual-mode telemetry. `MetricsCore` provides centralized metrics calculation with strict mode isolation for portfolio, risk, and execution KPIs, with real-time WebSocket broadcasts. Live pricing is handled by a `LivePricingAdapter` with dual-source integration and WebSocket broadcasts.

The Goals Engine UI includes advanced universe and signal controls, execution rhythm controls, and simplified daily target goals with Trading Pace presets. A Goal Feasibility Validation & Audit System tracks and validates goal changes, calculating and displaying a rolling **Average Daily Earnings % (ADE%)**. The Dashboard LATTI widget mirrors Goals Engine Target Daily Goals, displaying calculated values like Risk per Trade ($), Trades per Day, and Projected Portfolio Growth. "Risk per Trade ($)" is converted to "Portfolio Risk per Trade (%)" across the Goals Engine and Dashboard LATTI widget.

The system uses a modern `guardrails_v2` schema with four core guardrail parameters: Portfolio Risk per Trade %, Symbol Cooldown (minutes), Max Open Positions, and Daily Loss Kill Switch %. Key features include dual-mode operation with independent guardrail sets, coherency validation enforced via 10 rules, backend API endpoints for GET/PUT guardrails, and real-time WebSocket broadcasts for config changes. Toggle controls allow switching between LATTi autonomous optimization and manual user control for individual parameters.

A unified dashboard widget and Goals Preset Grid implements a 4+1 preset structure (Conservative, Baseline, Optimistic, Maximum, Custom) with coherency analytics, stored in a `goals_presets` table. Presets can be applied via API, triggering updates and broadcasting WebSocket events. The Goals Engine includes a real-time Coherency Status Widget.

A **GuardrailPolicy Service** (`server/services/guardrail-policy.ts`) acts as a single backend source of truth for guardrail values with runtime coherency enforcement, handling effective value resolution, coherency validation (all 10 rules including learning expansion caps), kill switch management, and conflict detection.

The Goals Engine features an adaptive learning system that automatically optimizes preset boundaries based on 30-day performance metrics. When a preset achieves ≥80% of its target daily return, guardrail parameters automatically expand by 5% up to global safety caps. The `GoalsLearningEngine` service handles this logic.

All legacy screener variable inputs have been removed. The Screeners tab now exclusively uses the unified v2 filter configuration with modern fields (Volume, Price, Market Quality, RSI, Volatility, Asset Type, Universe & Signal Controls).

A comprehensive audit system ensures only current, visible fields influence the trade engine through runtime validation, database views (`v_guardrails_active`, `v_filters_active`, `v_goals_active`), diagnostic endpoints, and startup telemetry. An automated anomaly detection system for override configuration changes, `AuditAnomalyDetectionService`, analyzes audit logs for unusual patterns.

The coherency rules have been rationalized to act as extreme fail-safes only, with relaxed thresholds for some rules. Control behavior has been refined for switching between LATTi and manual control, allowing mixed custom configurations.

**Adaptive Guardrails (v2.3)** introduces a local-only learning system (`AdaptiveGuardrails` service) that enables LATTI to adaptively tune parameters based on trading outcomes using variance-based statistical analysis of 30-day performance metrics. A strict throttle mechanism limits changes to 3 per 24 hours. `behavioral_log` tracks changes and `learning_history` maintains versioned snapshots for rollback. Override influence weighting adjusts AI aggressiveness based on user manual overrides. The `LearningCycleService` runs autonomously every 24 hours to analyze outcomes, calculate performance metrics, generate recommendations, validate coherency, and apply changes.

**DHMA Strategy (v2.4)** implements Dual-Horizon Microstructure Alpha, a microstructure-based trading strategy using order book imbalance, microprice tilt, signed flow, toxicity detection, and dual-horizon regime analysis. The `DHMAStrategy` module (`server/strategies/dhma.ts`) provides simplified microstructure features using OHLCV data. Entry logic requires dual-horizon alignment where both burst and session regimes agree, with configurable thresholds and safety controls. Position sizing uses dynamic down-weighting based on spread and toxicity. The strategy integrates with `StrategyEngine.detectDHMA()` and validates trades through `guardrailPolicy.validate()`. DHMA parameters are configurable via a flexible, mode-aware parameter configuration system stored in a `strategy_param_schema` table, allowing dynamic adjustment without code changes and independent configurations for paper and live trading modes. The `DHMATuningService` implements intelligent adaptive parameter optimization for DHMA based on real-time trading performance metrics.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: External market price feed (primary for live pricing).
-   **CoinGecko API**: External market price feed (fallback for live pricing).
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.