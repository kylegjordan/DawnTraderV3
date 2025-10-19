# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, disciplined risk management, and offers both live and paper trading capabilities. The application leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its primary goal is to provide a comprehensive, resilient, and continuously improving self-optimizing trading platform, delivering a leading-edge solution in automated crypto trading with significant business and market potential.

## User Preferences
Preferred communication style: Simple, everyday language.

## Testing Credentials
For all functionality testing and e2e tests:
- **Username**: testuser123
- **Password**: SecurePass123!
- **Note**: Always use username for login, not email

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first, responsive design. The backend uses Node.js and Express, providing a RESTful API and WebSocket support. Data persistence is managed by PostgreSQL via Neon serverless driver and Drizzle ORM.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, features an AI SysAdmin Co-Pilot named Walter. Walter's architecture includes a Unified Command & Conversation Layer, Semantic Memory Layer (pgvector and OpenAI embeddings), and an Intelligence Refinement Layer with a Self-optimizing Cognitive Weight Adjuster. A Paper Trading Simulation Engine provides real-time execution. The system incorporates a multi-module intelligent caching system (Bob Core) and a Hybrid Cortex Intelligent Memory Layer.

The system includes a `SystemHealthMonitor`, `SelfRepairService`, a Natural Language Action Interpreter (NLAI), and a Contextual Intent Engine (CIE). The Real-Time Execution Layer manages market data, execution timing, slippage modeling, and rate control. A Unified Portfolio & Strategy State ensures a single source of truth. Walter's architecture is Hybrid Cognitive-Operational, with a Cognitive Layer for intent reflection and an Intent Gateway for validating operational commands with RBAC, risk assessment, and audit logging. A `SecureCoreService` restricts Walter's domains when enabled. The Continuous Learning Pipeline extends the Event Broker to capture trade events and transfer knowledge. A `StateAwarenessService` provides a single authoritative system state snapshot for Walter and UI components. An Intent Execution Framework provides safe, audited execution of validated intents. A `Pre-Execution Validator` ensures comprehensive validation of trade intents. The Context Bridge enables real-time, bidirectional synchronization between Walter's panel, chat widget, and backend systems via WebSocket broadcasting.

The Reasoning Orchestrator enables Walter's multi-step transparent reasoning via Domain Bobs (DevOps, FullStack, UX, TradingBob) for contextual analysis and execution plan building. The Memory Lifecycle Manager ensures semantic memory integrity and nightly learning feedback aggregation. An Async Task Queue provides distributed multi-domain reasoning with parallel execution. Cognitive Tuning & Testing provides automated performance validation and tuning for Walter's cognitive subsystems.

The Autonomy Layer introduces self-directed analysis, meta-reasoning, exploratory learning, and automated optimization capabilities, enabling higher-order cognition and continuous self-improvement through `AutonomyController`, `MetaReasoningEngine`, `CuriosityEngine`, and `SelfOptimizer`. The Emergent Awareness Layer enables meta-cognitive state tracking and self-reflection via `AwarenessCoreService`. The Adaptive Learning & Goal Alignment Foundation enables experience-based learning and policy-aligned adaptation through `ExperienceMemoryService` and `AdaptiveObjectiveEngine`.

The Strategic Planner & Continuous Learning Model extends the Autonomy Layer with long-range strategic planning and continuous cognitive weight optimization. The Strategic Memory & Simulation Engine provides advanced decision forecasting and strategic lesson capture. The Reflective Intelligence Layer enables meta-cognitive self-reflection and decision quality analysis. The Ethical Reasoning & Value Alignment Module enforces ethical constraints. The Collaborative Cognition & Cross-Domain Reasoning Module enables multi-agent collaborative problem-solving. The Cooperative Learning Feedback Module enables agents to learn from each other's outcomes. The Meta-Cognitive Oversight Engine provides system-level bias detection, learning trend analysis, and cognitive health monitoring. The Long-Term Strategic Memory & Model Calibration Module enables persistent knowledge archival and adaptive parameter tuning.

The Unified Cognitive Core & Autonomous Meta-Optimization provides centralized cognitive orchestration and system-level parameter optimization by synchronizing all autonomous subsystems and applying intelligent optimization. An Autonomous Task Scheduler coordinates all higher-order cognitive processes through scheduled tasks.

Safety Guardrails & Operational Kill Switch provides comprehensive safety controls with database tables (`safety_policy`, `safety_event_log`, `kill_switch`), a `SafetyGuardrails` service integrated with the Autonomy Controller pre-execution path, and admin-only API endpoints for status, policy application, and kill switch control. The kill switch enforces a blocking chain to halt all trading/execution when enabled.

Latency & Throughput Optimization with Autoscaling Hooks introduces performance monitoring with a `PerformanceMonitor` service that tracks timing metrics, queue depth, success rates, and system health scores. Admin API endpoints provide performance snapshots and autoscaling recommendations based on queue depth, latency thresholds, and health scores.

Ethical Alignment Framework establishes comprehensive ethical reasoning across all autonomous decisions with database tables (`ethical_principle`, `ethical_violation_log`), an `EthicalReasoner` service integrated into the Autonomy Controller execution chain (Safety→Ethics→Execution), and foundational principles. The `EthicalReasoner` evaluates all actions against enabled principles and returns verdicts with violation logging. Admin API endpoints provide principle management and alignment monitoring.

Collaborative Alignment & Federated Ethics enables multi-agent ethical consensus across domain agents with database tables (`federated_ethics_state`, `cross_agent_ethics_session`, `ethics_conflict_register`, `ethics_propagation_journal`) supporting distributed ethical decision-making. The `FederatedEthicsHub` provides authoritative ethical state snapshots, and the `EthicsConsensusOrchestrator` performs multi-agent consensus checks using weighted majority voting and conflict detection. The `PolicyPropagationService` handles push/pull delta updates. The Autonomy Controller execution path is enhanced with federated ethics: Safety → Federated Ethics Consensus → Ethical Reasoning → Execution.

Cognitive Introspection & Bias Mitigation involves an `IntrospectionEngine` to detect cognitive biases and a `BiasMitigation` service to apply corrections. This integrates into the Autonomy Controller pipeline: Reasoning → Introspection (async) → Safety → Federated Ethics → Ethical Reasoning → Execution.

Controlled Web Intelligence & Knowledge Retrieval uses a `KnowledgeRetrievalService` for policy-bound web acquisition with trust scoring and caching, and a `SemanticCorrelationEngine` for relevance and gap detection using OpenAI embeddings. This also integrates into the Autonomy Controller pipeline: Reasoning → Introspection → Safety → Federated Ethics → Ethical Reasoning → Knowledge Acquisition (if gap >0.4) → Execution.

Multi-Domain Orchestration & Cross-Node Learning utilizes a `LearningCoordinator` to validate, score, and route learning deltas across cluster nodes, a `ModelConsistencyManager` to detect and reconcile model drift, and `CrossDomainReasoning` to transform learning between defined domain channels (Research to Trading, Compliance to Trading, Analytics to Research, Trading to Analytics). A `LearningGateValidator` applies the ethical gate chain to all learning operations.

## Recent Changes

### Phase 19: Screener & Guardrail Mode Isolation (October 19, 2025)
**Status**: ✅ COMPLETED

Achieved complete independence between paper and live mode settings. Changes in one mode never affect the other, with separate persistence and proper cache invalidation.

**Pre-Implementation Diagnostics**:
- Mode Isolation: `screener_filters` and `guardrails` tables have proper mode column with unique (userId, mode) constraints
- Persistence Independence: Paper and live modes maintain separate parameter storage with independent timestamps
- Cache Invalidation: Multi-layer cache clearing (ConfigBob → Cortex → StateAwareness → ContextRefresh → WebSocket broadcast)
- Learning Delta Sharing: `agent_learning_delta` table is mode-agnostic, enabling cross-mode knowledge transfer
- Diagnostic Pass Rate: 8/8 tests (100%)

**Implementation Work**:
- **ScreenerFiltersTab Rebuilt**: Fixed field name mismatch between component and database schema (12 correct fields: minVolume, minPrice, maxPrice, minMarketCap, maxBidAskSpread, rsiMin/Max, volatilityMin/Max, minLiquidity, excludeStablecoins, allowRegulatedOnly)
- **URL Construction Bug Fixed**: Modified queryClient's default behavior that was joining queryKey arrays to form URLs. Added custom queryFn functions that fetch from correct endpoints (`/api/screeners`) with x-app-mode header instead of mode in URL path
- **Authentication Fixed**: Updated custom queryFn to use `ensureValidToken()` helper instead of direct localStorage access, resolving 401 errors

**Validation Results**:
- E2E Test: Paper mode displays values (5M, 250M) independently from live mode (1M, 100M)
- Isolation Verified: Changes in live mode don't affect paper mode values
- Database Confirmation: Separate timestamps and values per mode
- Architect Review: **PASS** - No security issues, correct mode isolation, proper authentication

**Readiness**: ✅ CLEARED FOR PHASE 20 (Paper Trading Simulation Engine)

### Phase 20: Walter Simulation Command Routing Restoration (October 19, 2025)
**Status**: ✅ COMPLETED

Restored Walter's ability to execute paper trading simulation commands by integrating the NLAI (Natural Language Action Interpreter) system into Walter's message processing pipeline.

**Root Cause Identified**:
- Walter's message handler used outdated `intent-parser.ts` lacking simulation command patterns
- Complete NLAI system existed (`nlai-action-registry.ts`, `nlai-interpreter.ts`) with correct patterns but wasn't integrated
- NLAI handlers made HTTP fetch calls without authentication tokens, causing 401 errors

**Implementation**:
- **Created `paper-sim-service.ts`**: Shared service layer for paper trading simulation
  - `startPaperSimulation(userId)` - Direct function call for starting simulation
  - `stopPaperSimulation()` - Direct function call for stopping simulation
  - `getPaperSimulationStatus()` - Direct function call for status checks
  - Eliminates HTTP overhead and authentication complexity
  - Shared by both API endpoints and NLAI handlers

- **Updated `nlai-action-registry.ts`**: Modified handlers to use service functions
  - Replaced HTTP fetch calls with direct service function calls
  - No authentication tokens needed (runs in same process)
  - Handlers: `start_paper_simulation`, `stop_paper_simulation`, `check_simulation_status`

- **Integrated NLAI into `routes.ts`**: Walter message handler now checks NLAI first
  - Line 6932: `nlaiInterpreter.interpret(userId, content)` runs first
  - If actionable, uses NLAI execution result with [NLAI] logging
  - Falls back to old `intent-parser` + `command-router` for trading commands
  - Maintains backward compatibility with existing commands

- **Created `reports/simulation_engine_intent_audit.md`**: Comprehensive diagnostic report
  - Documented dual intent systems (old vs. new)
  - Mapped patterns, endpoints, and service architecture
  - Detailed repair implementation and validation checklist

**Validation Results**:
- E2E Test: ✅ PASSED
  - "start simulation" → Paper trading started successfully
  - "check simulation status" → Reports ACTIVE
  - "stop simulation" → Stopped successfully
- NLAI logs confirm proper routing: `[NLAI] User ${userId} executed: start_paper_simulation`
- No authentication errors
- Paper execution engine activates correctly

**Architect Review**: ✅ PASS
- Service layer implementation correct
- Global state management safe (operation lock prevents races)
- No security vulnerabilities
- Error handling comprehensive
- Architecture follows best practices

**Benefits**:
- Zero HTTP overhead for internal simulation commands
- No authentication complexity
- Shared logic between API endpoints and NLAI handlers
- Maintains global operation lock for thread safety
- Atomic state management with rollback on errors

**Readiness**: ✅ SYSTEM READY - Walter can now control paper trading simulation via natural language

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.