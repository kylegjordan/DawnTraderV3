# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, disciplined risk management, and offers both live and paper trading capabilities. The application leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its primary goal is to provide a comprehensive, resilient, and continuously improving self-optimizing trading platform, delivering a leading-edge solution in automated crypto trading with significant business and market potential.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first, responsive design. The backend uses Node.js and Express, providing a RESTful API and WebSocket support. Data persistence is managed by PostgreSQL via Neon serverless driver and Drizzle ORM.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`, supporting automated trading strategies and multi-layered risk management. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, features an AI SysAdmin Co-Pilot named Walter. Walter's architecture includes a Unified Command & Conversation Layer, Semantic Memory Layer (pgvector and OpenAI embeddings), and an Intelligence Refinement Layer with a Self-optimizing Cognitive Weight Adjuster. A Paper Trading Simulation Engine provides real-time execution. The system incorporates a multi-module intelligent caching system (Bob Core) and a Hybrid Cortex Intelligent Memory Layer.

The system includes a `SystemHealthMonitor`, `SelfRepairService`, a Natural Language Action Interpreter (NLAI), and a Contextual Intent Engine (CIE). The Real-Time Execution Layer manages market data, execution timing, slippage modeling, and rate control. A Unified Portfolio & Strategy State ensures a single source of truth. Walter's architecture is Hybrid Cognitive-Operational, with a Cognitive Layer for intent reflection and an Intent Gateway for validating operational commands with RBAC, risk assessment, and audit logging. Data Provenance & Source Governance is ensured, and Schema Binding Validation & Learning Alignment provides comprehensive data source validation. A `SecureCoreService` restricts Walter's domains when enabled. The Continuous Learning Pipeline extends the Event Broker to capture trade events and transfer knowledge. A `StateAwarenessService` provides a single authoritative system state snapshot for Walter and UI components. An Intent Execution Framework provides safe, audited execution of validated intents. A `Pre-Execution Validator` ensures comprehensive validation of trade intents. The Context Bridge enables real-time, bidirectional synchronization between Walter's panel, chat widget, and backend systems via WebSocket broadcasting.

The Reasoning Orchestrator enables Walter's multi-step transparent reasoning via Domain Bobs (DevOps, FullStack, UX, TradingBob) for contextual analysis and execution plan building. The Memory Lifecycle Manager ensures semantic memory integrity and nightly learning feedback aggregation. An Async Task Queue provides distributed multi-domain reasoning with parallel execution. Cognitive Tuning & Testing provides automated performance validation and tuning for Walter's cognitive subsystems.

The Autonomy Layer introduces self-directed analysis, meta-reasoning, exploratory learning, and automated optimization capabilities, enabling higher-order cognition and continuous self-improvement through `AutonomyController`, `MetaReasoningEngine`, `CuriosityEngine`, and `SelfOptimizer`. The Emergent Awareness Layer enables meta-cognitive state tracking and self-reflection via `AwarenessCoreService`. The Adaptive Learning & Goal Alignment Foundation enables experience-based learning and policy-aligned adaptation through `ExperienceMemoryService` and `AdaptiveObjectiveEngine`.

The Strategic Planner & Continuous Learning Model extends the Autonomy Layer with long-range strategic planning and continuous cognitive weight optimization. The Strategic Memory & Simulation Engine provides advanced decision forecasting and strategic lesson capture. The Reflective Intelligence Layer enables meta-cognitive self-reflection and decision quality analysis. The Ethical Reasoning & Value Alignment Module enforces ethical constraints. The Collaborative Cognition & Cross-Domain Reasoning Module enables multi-agent collaborative problem-solving. The Cooperative Learning Feedback Module enables agents to learn from each other's outcomes. The Meta-Cognitive Oversight Engine provides system-level bias detection, learning trend analysis, and cognitive health monitoring. The Long-Term Strategic Memory & Model Calibration Module enables persistent knowledge archival and adaptive parameter tuning.

The Unified Cognitive Core & Autonomous Meta-Optimization provides centralized cognitive orchestration and system-level parameter optimization by synchronizing all autonomous subsystems and applying intelligent optimization. An Autonomous Task Scheduler coordinates all higher-order cognitive processes through scheduled tasks.

Safety Guardrails & Operational Kill Switch provides comprehensive safety controls with database tables (`safety_policy`, `safety_event_log`, `kill_switch`), a `SafetyGuardrails` service integrated with the Autonomy Controller pre-execution path, and admin-only API endpoints for status, policy application, and kill switch control. The kill switch enforces a blocking chain to halt all trading/execution when enabled.

Latency & Throughput Optimization with Autoscaling Hooks introduces performance monitoring with a `PerformanceMonitor` service that tracks timing metrics, queue depth, success rates, and system health scores. Admin API endpoints provide performance snapshots and autoscaling recommendations based on queue depth, latency thresholds, and health scores.

Ethical Alignment Framework establishes comprehensive ethical reasoning across all autonomous decisions with database tables (`ethical_principle`, `ethical_violation_log`), an `EthicalReasoner` service integrated into the Autonomy Controller execution chain (Safety→Ethics→Execution), and foundational principles. The `EthicalReasoner` evaluates all actions against enabled principles and returns verdicts with violation logging. Admin API endpoints provide principle management and alignment monitoring.

Collaborative Alignment & Federated Ethics enables multi-agent ethical consensus across domain agents with database tables (`federated_ethics_state`, `cross_agent_ethics_session`, `ethics_conflict_register`, `ethics_propagation_journal`) supporting distributed ethical decision-making. The `FederatedEthicsHub` provides authoritative ethical state snapshots, and the `EthicsConsensusOrchestrator` performs multi-agent consensus checks using weighted majority voting and conflict detection. The `PolicyPropagationService` handles push/pull delta updates. The Autonomy Controller execution path is enhanced with federated ethics: Safety → Federated Ethics Consensus → Ethical Reasoning → Execution. A Federation UI tab provides comprehensive monitoring and control.

**Cognitive Introspection & Bias Mitigation (Phase 15.0)** adds continuous self-analysis to detect and counter cognitive biases across Walter's autonomous reasoning, providing meta-cognitive awareness and automated bias correction.

**Database Schema:**
- `bias_observation_log`: Records detected cognitive biases with type, context, confidence score, decision ID, impact assessment, and metadata
- `confidence_drift_log`: Tracks confidence drift metrics including average confidence, variance, drift direction, and decisions analyzed
- `introspection_report`: Stores daily introspection summaries with overall health score, critical issues, and improvement recommendations
- `BiasType` enum: confirmation, recency, anchoring, overconfidence, availability, optimism

**Core Services:**
- `IntrospectionEngine`: Analyzes reasoning traces to detect six bias types and calculate confidence drift metrics. All analysis is strictly per-user via INNER JOIN between `metaReasoningLog` and `reasoningTrace` filtering by userId, preventing cross-user data pollution. Bias detection methods:
  - Confirmation bias: Pattern reinforcement detection
  - Recency bias: Over-weighting recent data
  - Anchoring bias: Initial value fixation
  - Overconfidence bias: Excessive certainty via integrityScore > 0.85
  - Availability bias: Reliance on readily available information
  - Optimism bias: Systematic over-estimation
- `BiasMitigation`: Applies event-driven corrections when biases are detected, adjusting `cognitiveWeights` to counter specific patterns and persisting corrections to the database. Subscribes to introspection events and triggers mitigation workflows.

**Autonomy Controller Integration:**
- Async introspection checkpoint added to execution pipeline before final execution
- Pipeline flow: Reasoning → Introspection (async, user-scoped) → Safety → Federated Ethics → Ethical Reasoning → Execution

**Scheduler Tasks:**
- `introspection_cycle`: Runs every 4 hours to analyze recent reasoning traces for biases and confidence drift
- `bias_mitigation_cycle`: Runs every 8 hours to apply corrections for detected biases and optimize cognitive weights

**API Endpoints (All require JWT authentication):**
- `GET /api/introspection/status`: Returns introspection summary with overall score, recent biases, drift status, and active mitigations
- `GET /api/introspection/biases`: Returns recent bias observations with type, confidence, context, and timestamps
- `GET /api/introspection/drift`: Returns confidence drift logs with session windows, averages, variance, and drift direction
- `POST /api/introspection/mitigate`: Triggers immediate bias mitigation and cognitive weight adjustment

**System Monitoring UI - Introspection Tab:**
- Summary cards: Reasoning Quality (%), Biases Detected (count), Active Mitigations (count), Drift Status (text)
- Bias Breakdown Chart: BarChart (Recharts) showing distribution of detected bias types
- Confidence Drift Chart: LineChart (Recharts) visualizing confidence trends over time
- Mitigation Controls: Trigger Mitigation button with auto-refresh after execution
- All data properly scoped to authenticated user, preventing cross-user information leakage

**Critical Implementation Notes:**
- Overconfidence detection uses `integrityScore` (validated field in schema), not reflectionScore
- All metaReasoningLog queries join with reasoningTrace to ensure user isolation
- Query pattern: `.from(metaReasoningLog).innerJoin(reasoningTrace, eq(metaReasoningLog.targetTraceId, reasoningTrace.traceId)).where(eq(reasoningTrace.userId, userId))`

## UI Maintenance Notes

### System Monitoring Panel Sticky Tab Fix (October 18, 2025)

**Issue:** Tab menu was being covered by metric cards (CPU Usage, Memory Usage, etc.), particularly the third row of wrapped tabs (Task Performance, Alerts, UX Monitor).

**Root Cause:** With 20 tabs wrapping across 3 rows, metric cards were visually overlapping the tab menu due to insufficient spacing between the wrapped tab rows and content below.

**Solution:** Implemented sticky positioning with significantly increased spacing to accommodate all wrapped tab rows.

**Implementation:**
- Wrapped TabsList in sticky container: `<div className="sticky top-0 z-20 bg-background pb-16">`
- TabsList styling: `flex w-full flex-wrap gap-y-3 bg-background pt-2 pb-6`
  - `gap-y-3` (12px) provides vertical spacing between wrapped tab rows
  - `pb-6` (24px) adds internal bottom padding to TabsList
- All TabsContent sections: `relative z-0 overflow-visible mt-12 space-y-4`
  - `mt-12` (48px) creates clear separation from tabs
- Sticky positioning keeps tab menu anchored at viewport top while content scrolls
- Z-index z-20 ensures tabs stay above all content (z-0)
- Background color prevents content showing through when scrolling

**Spacing Breakdown:**
- Sticky container bottom: 64px (pb-16)
- TabsList bottom: 24px (pb-6)
- Gap between tab rows: 12px (gap-y-3)
- Content top margin: 48px (mt-12)
- **Total measured spacing: ~112px** between last tab row and first content card

**Structure:**
```tsx
<Tabs className="relative">
  <div className="sticky top-0 z-20 bg-background pb-16">
    <TabsList className="flex w-full flex-wrap gap-y-3 bg-background pt-2 pb-6">
      {/* 20 tabs wrapping across 3 rows */}
    </TabsList>
  </div>
  <TabsContent className="relative z-0 overflow-visible mt-12 space-y-4">
```

**Result:** All 20 tabs fully visible across 3 rows with substantial clearance. Third row tabs (Task Performance, Alerts, UX Monitor) completely visible and clickable with no visual obstruction. Measured ~112px spacing between tabs and content cards, providing generous separation. Fix validated with automated e2e testing at 1366×768 resolution.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.