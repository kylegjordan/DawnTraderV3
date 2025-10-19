# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, disciplined risk management, and offers both live and paper trading capabilities. The application leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its primary goal is to provide a comprehensive, resilient, and continuously improving self-optimizing trading platform, delivering a leading-edge solution in automated crypto trading with significant business and market potential.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first, responsive design. The backend uses Node.js and Express, providing a RESTful API and WebSocket support. Data persistence is managed by PostgreSQL via Neon serverless driver and Drizzle ORM.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, features an AI SysAdmin Co-Pilot named Walter. Walter's architecture includes a Unified Command & Conversation Layer, Semantic Memory Layer, and an Intelligence Refinement Layer. It incorporates a multi-module intelligent caching system (Bob Core) and a Hybrid Cortex Intelligent Memory Layer. The system includes a `SystemHealthMonitor`, `SelfRepairService`, a Natural Language Action Interpreter (NLAI), and a Contextual Intent Engine (CIE). The Real-Time Execution Layer manages market data, execution timing, slippage modeling, and rate control. A Unified Portfolio & Strategy State ensures a single source of truth. Walter's architecture is Hybrid Cognitive-Operational, with an Intent Gateway for validating operational commands and a `SecureCoreService` for domain restriction. A Continuous Learning Pipeline extends the Event Broker to capture trade events and transfer knowledge. A `StateAwarenessService` provides system state snapshots. An Intent Execution Framework provides safe, audited execution of validated intents, with a `Pre-Execution Validator`. The Context Bridge enables real-time, bidirectional synchronization between Walter's panel, chat widget, and backend systems via WebSocket broadcasting.

The Reasoning Orchestrator enables Walter's multi-step transparent reasoning via Domain Bobs (DevOps, FullStack, UX, TradingBob). The Memory Lifecycle Manager ensures semantic memory integrity. An Async Task Queue provides distributed multi-domain reasoning with parallel execution. Cognitive Tuning & Testing provides automated performance validation.

The Autonomy Layer introduces self-directed analysis, meta-reasoning, exploratory learning, and automated optimization capabilities through `AutonomyController`, `MetaReasoningEngine`, `CuriosityEngine`, and `SelfOptimizer`. The Emergent Awareness Layer enables meta-cognitive state tracking and self-reflection via `AwarenessCoreService`. The Adaptive Learning & Goal Alignment Foundation enables experience-based learning and policy-aligned adaptation through `ExperienceMemoryService` and `AdaptiveObjectiveEngine`.

The Strategic Planner & Continuous Learning Model extends the Autonomy Layer with long-range strategic planning and continuous cognitive weight optimization. The Strategic Memory & Simulation Engine provides advanced decision forecasting. The Reflective Intelligence Layer enables meta-cognitive self-reflection. The Ethical Reasoning & Value Alignment Module enforces ethical constraints. The Collaborative Cognition & Cross-Domain Reasoning Module enables multi-agent collaborative problem-solving. The Cooperative Learning Feedback Module enables agents to learn from each other's outcomes. The Meta-Cognitive Oversight Engine provides system-level bias detection and cognitive health monitoring. The Long-Term Strategic Memory & Model Calibration Module enables persistent knowledge archival and adaptive parameter tuning.

The Unified Cognitive Core & Autonomous Meta-Optimization provides centralized cognitive orchestration and system-level parameter optimization. An Autonomous Task Scheduler coordinates higher-order cognitive processes.

Safety Guardrails & Operational Kill Switch provides comprehensive safety controls with database tables, a `SafetyGuardrails` service, and admin-only API endpoints. The kill switch enforces a blocking chain to halt all trading/execution when enabled.

Latency & Throughput Optimization with Autoscaling Hooks introduces performance monitoring with a `PerformanceMonitor` service.

Ethical Alignment Framework establishes comprehensive ethical reasoning across all autonomous decisions with database tables and an `EthicalReasoner` service integrated into the Autonomy Controller execution chain.

Collaborative Alignment & Federated Ethics enables multi-agent ethical consensus across domain agents with database tables, a `FederatedEthicsHub`, and an `EthicsConsensusOrchestrator`.

Cognitive Introspection & Bias Mitigation involves an `IntrospectionEngine` to detect cognitive biases and a `BiasMitigation` service to apply corrections.

Controlled Web Intelligence & Knowledge Retrieval uses a `KnowledgeRetrievalService` for policy-bound web acquisition and a `SemanticCorrelationEngine`.

Multi-Domain Orchestration & Cross-Node Learning utilizes a `LearningCoordinator`, a `ModelConsistencyManager`, and `CrossDomainReasoning`. A `LearningGateValidator` applies the ethical gate chain to all learning operations.

The Autonomous Execution Layer provides Walter with complete autonomous command execution capabilities. The `ExecutionPolicyController` evaluates every Walter command against approval matrix settings and risk thresholds. All executions create comprehensive audit trails in the `walter_execution_log` database table. The NLAI Execution Broker orchestrates the execution pipeline: policy evaluation → action execution → result logging → cluster bus event emission.

Paper Trading Simulation State Management refactors the paper trading simulation to a database-first architecture with comprehensive reconciliation diagnostics.

Multi-Intent Command Processing enhances Walter's NLAI to detect, parse, and execute multiple intents from single user messages.

Live Trading Voice/Chat Activation enables Walter to manage live trading mode through voice or chat commands with comprehensive manual approval workflows.

Simulation Heartbeat & Recovery provides automatic monitoring and recovery for paper trading simulations.

The Automatic Test Harness provides automated end-to-end validation of conversational and operational flows with an `AutoTestHarness` framework.

Auto-Tuning Engine & Dashboard Integration provides AI-driven parameter optimization with comprehensive audit trails and user controls.

Context Persistence Framework (Phase 27 - COMPLETED) enables Walter to automatically internalize mission context and development history on startup by scanning designated markdown files. The framework features a production-grade 10-layer sanitization pipeline (HTML entity decoding, backtick and tilde fenced code removal, indented code stripping, inline code elimination, HTML tag removal, dangerous protocol neutralization, event handler stripping, and conservative JSON removal). All context records are stored as non-actionable memories with `policy: 'no-execution'` enforcement. The implementation passed comprehensive architect security review with no vulnerabilities observed and is production-ready. Context is loaded from `/replit.md` and `/context_uploads/*.md` files during server initialization, providing Walter with complete situational awareness before processing any commands.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.