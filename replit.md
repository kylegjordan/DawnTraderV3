# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, disciplined risk management, and offers both live and paper trading capabilities. The application leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its primary goal is to provide a comprehensive, resilient, and continuously improving self-optimizing trading platform, delivering a leading-edge solution in automated crypto trading with significant business and market potential.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first, responsive design. The backend uses Node.js and Express, providing a RESTful API and WebSocket support. Data persistence is managed by PostgreSQL via Neon serverless driver and Drizzle ORM.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, features an AI SysAdmin Co-Pilot named Walter. Walter's architecture includes a Unified Command & Conversation Layer, Semantic Memory Layer, and an Intelligence Refinement Layer, incorporating a multi-module intelligent caching system (Bob Core) and a Hybrid Cortex Intelligent Memory Layer. The system includes a `SystemHealthMonitor`, `SelfRepairService`, a Natural Language Action Interpreter (NLAI), and a Contextual Intent Engine (CIE). The Real-Time Execution Layer manages market data, execution timing, slippage modeling, and rate control. A Unified Portfolio & Strategy State ensures a single source of truth. Walter's architecture is Hybrid Cognitive-Operational, with an Intent Gateway for validating operational commands and a `SecureCoreService` for domain restriction. A Continuous Learning Pipeline extends the Event Broker to capture trade events and transfer knowledge. A `StateAwarenessService` provides system state snapshots. An Intent Execution Framework provides safe, audited execution of validated intents, with a `Pre-Execution Validator`. The Context Bridge enables real-time, bidirectional synchronization between Walter's panel, chat widget, and backend systems via WebSocket broadcasting.

The Reasoning Orchestrator enables Walter's multi-step transparent reasoning via Domain Bobs (DevOps, FullStack, UX, TradingBob). The Memory Lifecycle Manager ensures semantic memory integrity. An Async Task Queue provides distributed multi-domain reasoning with parallel execution. Cognitive Tuning & Testing provides automated performance validation.

The Autonomy Layer introduces self-directed analysis, meta-reasoning, exploratory learning, and automated optimization capabilities through `AutonomyController`, `MetaReasoningEngine`, `CuriosityEngine`, and `SelfOptimizer`. The Emergent Awareness Layer enables meta-cognitive state tracking and self-reflection via `AwarenessCoreService`. The Adaptive Learning & Goal Alignment Foundation enables experience-based learning and policy-aligned adaptation through `ExperienceMemoryService` and `AdaptiveObjectiveEngine`.

Safety Guardrails & Operational Kill Switch provides comprehensive safety controls with database tables, a `SafetyGuardrails` service, and admin-only API endpoints to halt all trading/execution.

Ethical Alignment Framework establishes comprehensive ethical reasoning across all autonomous decisions with database tables and an `EthicalReasoner` service integrated into the Autonomy Controller execution chain.

Controlled Web Intelligence & Knowledge Retrieval uses a `KnowledgeRetrievalService` for policy-bound web acquisition and a `SemanticCorrelationEngine`.

The Autonomous Execution Layer provides Walter with complete autonomous command execution capabilities. The `ExecutionPolicyController` evaluates every Walter command against approval matrix settings and risk thresholds, creating comprehensive audit trails in the `walter_execution_log` database table. The NLAI Execution Broker orchestrates the execution pipeline: policy evaluation → action execution → result logging → cluster bus event emission.

Paper Trading Simulation State Management uses a database-first architecture with comprehensive reconciliation diagnostics.

Multi-Intent Command Processing enhances Walter's NLAI to detect, parse, and execute multiple intents from single user messages.

Live Trading Voice/Chat Activation enables Walter to manage live trading mode through voice or chat commands with comprehensive manual approval workflows.

The Automatic Test Harness provides automated end-to-end validation of conversational and operational flows with an `AutoTestHarness` framework.

Context Persistence Framework enables Walter to automatically internalize mission context and development history on startup by scanning designated markdown files (`/replit.md` and `/context_uploads/*.md`). This framework includes a 10-layer sanitization pipeline to ensure production readiness and security.

Inline Approval Prompts & Interactive Notifications provide seamless manual approval workflows through dual interfaces: inline chat approvals and bell notification center. This includes comprehensive API endpoints for approval management and real-time WebSocket integration for automatic notification refresh.

Frontend Permission Integration implements comprehensive role-based access control (RBAC) on the frontend with fail-closed security, using a `useUserRole` hook and `can(permission)` helper for granular checks. Server-side validation with `requirePermission` middleware ensures database is the source of truth.

Trading State Synchronization & Fail-Safe Recovery provides database-backed trading mode persistence with automatic recovery and cross-service coordination via the `system_context` table and `TradingStateSync` service. It includes kill-switch integration and broadcasts state changes via WebSocket for real-time synchronization.

Goals Engine Persistence & Audit Logging provides comprehensive audit trails for all goal changes in the Goals Engine via the `goal_audit_log` table, ensuring durable persistence and server-authoritative hydration. It also includes metric name canonicalization to prevent duplicate goals.

Trading Engine Invocation ensures trading toggles start/stop trading engines and provides comprehensive audit logging for all trading operations via a `trading_audit_log` table. Frontend modals provide safety guardrails before live trading activation or deactivation.

PaperSim Lifecycle Initialization implements lazy initialization and explicit reset on startup to prevent ghost manager issues, clearing in-memory state on server boot. PaperSim State Reconciliation & Atomic Manager Creation fixes state mismatches by implementing synchronized manager API helpers and atomic creation/destruction patterns with comprehensive reconciliation logic, ensuring global and service state synchronization.

Cross-Mode Isolation & PaperSim Broadcast Sync (Phase 27.F.10) ensures paper trading broadcasts real-time WebSocket events just like live trading, providing instant UI updates without relying solely on 5-second polling. Backend paper-sim endpoints (`/api/paper-sim/start` and `/api/paper-sim/stop`) now call `tradingStateSync.setEngineActive()` and `broadcastUserUpdate()` to emit `trading_state_changed` WebSocket events with mode-specific payloads (mode: "paper"). Frontend `use-trading.tsx` hook includes mode-scoped query invalidation guard: only invalidates paper-sim queries when `payload.mode === 'paper'`, preventing cross-mode state pollution where live trading updates would incorrectly update paper trading UI (and vice versa). Console logging with `[TradingSync][PaperSim]` prefix provides audit trail for paper trading broadcasts. This ensures independent state management for live and paper modes with real-time WebSocket synchronization for both, eliminating the previous asymmetry where only live trading had instant updates.

PaperSim Universe Scan & Filter Trace (Phase 27.F.12) provides read-only diagnostic capabilities to verify end-to-end filtering without starting engines. The `PaperSimDiagnosticService` loads the raw Kraken universe and manually applies all screener filters in sequence, tracking actual exclusion reasons per symbol. Admin/owner-only GET endpoint `/api/paper-sim/diagnostics/scan` accepts query params (mode, limit, trace, strategies) and returns detailed breakdown data with concise logging ([UniverseLoad], [FilterEval], [StrategyProbe], [TraceReject]). Trading state broadcasts extended to include both `isEngineActivePaper` and `isEngineActiveLive` fields for accurate per-mode status tracking. TopBar UI updated to use mode-specific status fields instead of mixing paper/live state. Frontend diagnostic component added to Tuning tab with admin-only visibility.

Symbol Canonicalization & Filter Parity (Phase 27.F.12.b) enforces one canonical pair format (BASE/QUOTE) across whitelist/blacklist, Screener, Guardrails, Strategy prechecks, and MarketDataCoordinator. Created `symbol-canonicalizer.ts` utility with `toCanonical()` (converts any exchange ID or pair format to BASE/QUOTE), `toKrakenId()` (converts BASE/QUOTE to Kraken's exchange ID format), and `normalizeSymbolArray()` (normalizes arrays of symbols). Both diagnostic and production `getEligiblePairs()` pipelines use canonical symbol comparison for whitelist/blacklist filters. Migration script `migrate-symbol-canonicalization.ts` provides one-time conversion of existing whitelist/blacklist arrays to BASE/QUOTE format with comprehensive audit logging. Diagnostic output enhanced with validation fields (symbol_canonical, kraken_id, whitelist_hit, blacklist_hit) when trace=true. **Quote Currency Mapping Fix**: Added comprehensive quote currency mappings (ZUSD→USD, ZEUR→EUR, ZGBP→GBP, ZJPY→JPY, ZAUD→AUD, ZCAD→CAD, ZCHF→CHF, XXBT→BTC, XETH→ETH) to normalize Kraken's prefixed quote currencies in both exchange ID format (XXBTZUSD→BTC/USD) and already-slashed format (BTC/ZUSD→BTC/USD), resolving the 88.6% pair rejection rate caused by quote currency filter mismatches. Verified with automated test suite covering 9 test cases.

Trading Panel Enhancements (Phase 27.F.14) introduces comprehensive filter insights and real-time data feeds to the Trading page. A new **Filter Insights** tab displays universe statistics (total, evaluated, eligible, ineligible counts), breakdown by filter rule (volume, spread, quote currency, etc.), top 10 candidate pairs, and last updated timestamp. It features auto-refresh every 30 minutes with a manual "Refresh Now" button that resets the timer. **Inline Live Trading Confirmation Modals** appear directly above Walter Chat when users type "start live trading" or "stop live trading" commands, using the existing modal designs for seamless user experience. Intent detection patterns intercept these commands on the frontend before sending to NLAI, showing appropriate confirmation modals inline instead of requiring navigation to the notification drawer. **Filtered Pairs Live Data Feed** now responds to real-time updates during Paper Trading Mode, with the FilterHealthWidget using dynamic refetch intervals (10s when active, 60s when inactive) and WebSocket listeners for `trading_state_changed` and `trade_update` events to invalidate queries immediately. The Trading page tabs expanded from 3 to 4 columns to accommodate the new Filter Insights tab, which appears after Filtered Pairs.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.