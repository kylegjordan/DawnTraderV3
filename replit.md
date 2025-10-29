# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application offers both live and paper trading capabilities and leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. The primary goal is to create a comprehensive, resilient, and continuously self-optimizing trading platform with significant market potential in automated crypto trading.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first, responsive design, and a Node.js/Express backend providing a RESTful API and WebSocket support. Data persistence is managed by PostgreSQL using Neon serverless driver and Drizzle ORM.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, includes an AI SysAdmin Co-Pilot named Walter. Walter's architecture features a Unified Command & Conversation Layer, Semantic Memory Layer, Intelligence Refinement Layer, Real-Time Execution Layer, and a Unified Portfolio & Strategy State. It incorporates a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, Continuous Learning Pipeline, `StateAwarenessService`, Intent Execution Framework with a `Pre-Execution Validator`, and an Autonomy Layer, with Safety Guardrails & Operational Kill Switch. The system supports paper trading simulation with a database-first architecture and multi-intent command processing. Live trading includes voice/chat activation with manual approval workflows.

The architecture uses a global mode-based engine, with one engine per mode (live/paper) shared by all users. `ModeRegistry` provides production telemetry with WebSocket broadcasts. `/api/system/health` returns comprehensive dual-mode telemetry. `MetricsCore` provides centralized metrics calculation with strict mode isolation for portfolio, risk, and execution KPIs, with real-time WebSocket broadcasts. Live pricing is handled by a `LivePricingAdapter` providing external market price feeds with dual-source integration and WebSocket broadcasts.

The Goals Engine UI includes advanced universe and signal controls, execution rhythm controls, and simplified daily target goals with Trading Pace presets. A Goal Feasibility Validation & Audit System tracks and validates goal change attempts against guardrail limits. It calculates and displays a rolling **Average Daily Earnings % (ADE%)**. The Dashboard LATTI widget mirrors Goals Engine Target Daily Goals, displaying calculated values like Risk per Trade ($), Trades per Day, and Projected Portfolio Growth. "Risk per Trade ($)" is converted to "Portfolio Risk per Trade (%)" across the Goals Engine and Dashboard LATTI widget.

The system uses a modern `guardrails_v2` schema with four core guardrail parameters: Portfolio Risk per Trade %, Symbol Cooldown (minutes), Max Open Positions, and Daily Loss Kill Switch %. Key features include dual-mode operation with independent guardrail sets, coherency validation enforced via 10 validation rules, backend API endpoints for GET/PUT guardrails, and real-time WebSocket broadcasts for config changes.

Toggle controls allow switching between LATTi autonomous optimization and manual user control for individual parameters, managed via `locked_by_user` flags in the `guardrails_v2` table. Dedicated frontend components manage this functionality with real-time WebSocket synchronization.

A unified dashboard widget and Goals Preset Grid implements a 4+1 preset structure (Conservative, Baseline, Optimistic, Maximum, Custom) with coherency analytics, stored in a `goals_presets` table. Presets can be applied via API, triggering updates and broadcasting WebSocket events. The Goals Engine includes a real-time Coherency Status Widget displaying the active preset name, coherency validation status, and detailed descriptions of any conflicts.

A **GuardrailPolicy Service** (`server/services/guardrail-policy.ts`) acts as a single backend source of truth for guardrail values with runtime coherency enforcement. It handles effective value resolution, coherency validation (all 10 rules including learning expansion caps), kill switch management, and conflict detection. The API layer exposes endpoints for effective guardrails, updating guardrails with full coherency validation, and managing the kill switch state. New WebSocket events are broadcast for kill switch status and policy updates.

The Goals Engine features an adaptive learning system that automatically optimizes preset boundaries based on 30-day performance metrics. When a preset achieves ≥80% of its target daily return, guardrail parameters automatically expand by 5% up to global safety caps. The `GoalsLearningEngine` service handles this logic. API endpoints include GET `/api/goals-learning/summary` and POST `/api/goals-learning/trigger`.

All legacy screener variable inputs have been removed. The Screeners tab now exclusively uses the unified v2 filter configuration with modern fields (Volume, Price, Market Quality, RSI, Volatility, Asset Type, Universe & Signal Controls). API endpoints `/api/screeners` and `/api/filters-v2` provide mode-specific access.

A comprehensive audit system ensures only current, visible fields influence the trade engine with zero legacy field access. This is enforced through runtime validation, database views (`v_guardrails_active`, `v_filters_active`, `v_goals_active`), diagnostic endpoints (`GET /api/diagnostics/config-snapshot`), and startup telemetry.

An automated anomaly detection system for override configuration changes, `AuditAnomalyDetectionService`, analyzes audit logs for unusual patterns using frequency spike detection and value reversion detection. The `OverrideFrequencyChart` component displays 24-hour override trends and real-time anomaly alerts.

The coherency rules have been rationalized to act as extreme fail-safes only, updating `coherency_rules.yaml` with relaxed thresholds for rules like Portfolio Risk and Daily Loss Kill Switch, while preserving critical rules. The `GuardrailPolicy Service` has been updated with this new validation logic. A `coherency_rule_status` table tracks individual rule status. Control behavior has been refined for switching between LATTi and manual control, allowing mixed custom configurations. Comprehensive Control Modes Reference documentation is integrated into the Goals Engine UI.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: External market price feed (primary for live pricing).
-   **CoinGecko API**: External market price feed (fallback for live pricing).
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.