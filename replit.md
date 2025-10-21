# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, disciplined risk management, and offers both live and paper trading capabilities. Leveraging OpenAI's GPT models, it provides AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. The primary goal is to deliver a comprehensive, resilient, and continuously improving self-optimizing trading platform with significant business and market potential in automated crypto trading.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first, responsive design. The backend uses Node.js and Express, providing a RESTful API and WebSocket support. Data persistence is managed by PostgreSQL via Neon serverless driver and Drizzle ORM.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, features an AI SysAdmin Co-Pilot named Walter. Walter's architecture includes a Unified Command & Conversation Layer, Semantic Memory Layer, Intelligence Refinement Layer, Real-Time Execution Layer, and a Unified Portfolio & Strategy State. It also incorporates a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, Continuous Learning Pipeline, `StateAwarenessService`, and an Intent Execution Framework with a `Pre-Execution Validator`. The Context Bridge enables real-time synchronization between Walter's panel, chat, and backend.

The Reasoning Orchestrator enables multi-step transparent reasoning via Domain Bobs (DevOps, FullStack, UX, TradingBob), with a Memory Lifecycle Manager, Async Task Queue, and Cognitive Tuning & Testing.

The Autonomy Layer introduces self-directed analysis, meta-reasoning, exploratory learning, and automated optimization through `AutonomyController`, `MetaReasoningEngine`, `CuriosityEngine`, and `SelfOptimizer`. The Emergent Awareness Layer provides meta-cognitive state tracking via `AwarenessCoreService`, and the Adaptive Learning & Goal Alignment Foundation enables experience-based learning and policy-aligned adaptation.

Safety Guardrails & Operational Kill Switch provides comprehensive safety controls with database tables, a `SafetyGuardrails` service, and admin-only API endpoints. An Ethical Alignment Framework is integrated into the Autonomy Controller. Controlled Web Intelligence & Knowledge Retrieval uses a `KnowledgeRetrievalService` and a `SemanticCorrelationEngine`.

The Autonomous Execution Layer provides Walter with complete command execution capabilities via an `ExecutionPolicyController` and the NLAI Execution Broker, with comprehensive audit trails.

Paper Trading Simulation State Management uses a database-first architecture with reconciliation diagnostics. Multi-Intent Command Processing enhances Walter's NLAI to detect and execute multiple intents. Live Trading Voice/Chat Activation enables Walter to manage live trading mode with manual approval workflows. An Automatic Test Harness provides automated end-to-end validation.

Context Persistence Framework enables Walter to internalize mission context and development history from designated markdown files with a 10-layer sanitization pipeline. Inline Approval Prompts & Interactive Notifications provide seamless manual approval workflows through chat and a bell notification center.

Frontend Permission Integration implements comprehensive role-based access control (RBAC) with `useUserRole` hook and `can(permission)` helper, backed by server-side validation.

Trading State Synchronization & Fail-Safe Recovery provides database-backed trading mode persistence with automatic recovery and cross-service coordination via the `system_context` table and `TradingStateSync` service, including kill-switch integration and WebSocket broadcasts. Goals Engine Persistence & Audit Logging provides comprehensive audit trails for all goal changes. Trading Engine Invocation ensures trading toggles start/stop trading engines with audit logging and frontend safety guardrails.

PaperSim Lifecycle Initialization implements lazy initialization and explicit reset. PaperSim State Reconciliation & Atomic Manager Creation fixes state mismatches with synchronized manager API helpers and atomic creation/destruction. Cross-Mode Isolation & PaperSim Broadcast Sync ensures paper trading broadcasts real-time WebSocket events and maintains independent state.

PaperSim Universe Scan & Filter Trace provides read-only diagnostic capabilities via a `PaperSimDiagnosticService` and an admin/owner-only GET endpoint `/api/paper-sim/diagnostics/scan`. Symbol Canonicalization & Filter Parity enforces one canonical pair format across filtering components, including a fix for Kraken's prefixed quote currencies.

Trading Panel Enhancements include a **Filter Insights** tab displaying universe statistics and breakdown by filter rule, **Inline Live Trading Confirmation Modals**, and a **Filtered Pairs Live Data Feed** for real-time updates.

Filter Health Diagnostic Logging integrates real-time filter statistics tracking into the MarketScanner's scan cycle, logging to the `filter_diagnostics` database table. Filter Breakdown in the Filter Insights tab displays all 11 filter categories.

Screener Alignment with Goals Engine Filters unifies filtering logic by migrating from `trading_settings` to the `screener_filters` table. `KrakenService.getEligiblePairs()` accepts 14 filter parameters, and the system implements 9 operational filters (Min Volume, Daily Range, Min/Max Price, Bid-Ask Spread, Stablecoins, Quote Currency, Blacklist, Whitelist, History) plus Volatility, with 4 filters noted as unavailable due to Kraken API limitations. An `/api/filters/diagnostics` endpoint returns threshold values, and the UI displays these with tooltips.

Walter Chat Intent Detection & Hardening implements comprehensive intent parsing with hard override rules for paper simulation detection, enhanced trace logging, and a backend NLAI routing guard to force paper-sim service when paper keywords are detected. Inline modal enforcement prevents notification-only paths for live trading. A debug intent pill in the Walter header displays the detected intent.

UI Navigation Reorganization consolidates navigation by integrating Command Center tabs into the AI Transparency page and Search and Analysis into the Watchlist page. The AI Transparency page now has 13 tabs for comprehensive AI oversight, and the Watchlist page unifies symbol search, market data analysis, and AI-generated insights.

Formula Audit & Computation Verification implements a `FormulaAuditService` to verify 10 numeric computations (RSI, VWAP, SMA, Volume USD, Bid-Ask Spread, Daily Range, Volatility, Typical Price, SMA Slope, Volume Delta) against industry standards. It generates reports with deviation percentages, formula locations, and status indicators, accessible via the `/api/system/formula-audit` endpoint.

Formula Hardening Auto-Recheck extends the Formula Audit system with automated daily scheduled monitoring, creating system alerts for admin users when deviations are detected (WARNING for 0.1-1%, CRITICAL for ≥1%). An on-demand audit execution endpoint `/api/system/formula-audit/run` is available, and a Formula Health card in the AI Transparency page displays real-time audit status.

Data Feed Integrity Monitor provides continuous monitoring of the Kraken WebSocket and REST fallback feeds with a `FeedIntegrityMonitor` service. It runs 5-minute automated health checks with three-tier status levels (Healthy/Warning/Critical) and an A/B/C/D/F grading system. Metrics tracked include interval-based reconnect count (resets each check), tick staleness, latency (currently using tick age as proxy), and time-based uptime percentage. Thresholds are fully configurable via 16 environment variables (WARNING/CRITICAL for reconnects, tick age, latency, uptime; A/B/C/D grading thresholds for each metric). Alert deduplication with 5-minute cooldown prevents spam, and alerts auto-clear after 2+ consecutive healthy checks. A Feed Health card in the AI Transparency page displays grade, status, latency, uptime, interval reconnects, active pairs, and data source type. Health reports are saved to `/tmp/feed_health_*.json` with 7-day retention.

Dormant-Mode Alert Suppression implements intelligent alert management during inactive trading periods. Global gating checks if any trading engine (live or paper) is active before running feed health checks; when all engines are stopped, checks are skipped entirely and return a dormant report with perfect grade 'A', ensuring degraded metrics during stopped periods don't impact system health scores. Auto-clear on transition triggers when trading stops, filtering and auto-resolving all `feed_health` alerts, logging the action to Walter's memory, and broadcasting state updates via the context bridge. A retrospective cleanup endpoint (`POST /api/system/feed-health/cleanup-old-alerts`, admin-only) targets dormant-mode alerts older than 30 minutes, preserving active alerts. Event listeners on `engine_state_changed` and `trading_mode_changed` coordinate alert lifecycle management. Diagnostic logging tracks skip/clear operations for debugging stale state issues.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.