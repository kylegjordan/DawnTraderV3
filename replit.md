# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, disciplined risk management, and offers both live and paper trading capabilities. The application leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its primary goal is to provide a comprehensive, resilient, and continuously improving self-optimizing trading platform, delivering a leading-edge solution in automated crypto trading with significant business and market potential.

## User Preferences
Preferred communication style: Simple, everyday language.

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

Collaborative Alignment & Federated Ethics enables multi-agent ethical consensus across domain agents with database tables (`federated_ethics_state`, `cross_agent_ethics_session`, `ethics_conflict_register`, `ethics_propagation_journal`) supporting distributed ethical decision-making. The `FederatedEthicsHub` provides authoritative ethical state snapshots, and the `EthicsConsensusOrchestrator` performs multi-agent consensus checks using weighted majority voting and conflict detection. The `PolicyPropagationService` handles push/pull delta updates. The Autonomy Controller execution path is enhanced with federated ethics: Safety → Federated Ethics Consensus → Ethical Reasoning → Execution. A Federation UI tab provides comprehensive monitoring and control.


**Cognitive Introspection & Bias Mitigation (Phase 15.0)**

**Database Schema:**
- `bias_observation_log`: Records detected cognitive biases
- `confidence_drift_log`: Tracks confidence drift metrics
- `introspection_report`: Stores daily summaries
- `BiasType` enum: confirmation, recency, anchoring, overconfidence, availability, optimism

**Core Services:**
- `IntrospectionEngine`: Detects six bias types, strictly per-user via INNER JOIN
- `BiasMitigation`: Applies corrections when biases detected

**Autonomy Controller Integration:**
- Pipeline: Reasoning → Introspection (async) → Safety → Federated Ethics → Ethical Reasoning → Execution

**Scheduler Tasks:**
- `introspection_cycle`: Every 4 hours
- `bias_mitigation_cycle`: Every 8 hours

**API Endpoints (JWT auth required):**
- `GET /api/introspection/status`, `/biases`, `/drift`
- `POST /api/introspection/mitigate`

**System Monitoring UI - Introspection Tab:**
Summary cards, Bias Breakdown Chart, Confidence Drift Chart, Mitigation Controls

**Critical Notes:**
- Uses `integrityScore` (not reflectionScore) for overconfidence detection
- All queries join reasoningTrace for user isolation

**Controlled Web Intelligence & Knowledge Retrieval (Phase 16.0)**

**Database Schema:**
- `knowledge_source` enum: web_search, web_fetch, api, internal_docs
- `retrieval_trust_level` enum: verified, moderate, low, untrusted
- `knowledge_retrieval_log`: Records all knowledge queries (userId, query, source, url, trustLevel, relevanceScore, retrievedData, retrievedAt)
- `knowledge_cache`: Caches data with 24h TTL (queryHash, cachedData, expiresAt)
- `knowledge_trust_record`: Tracks domain trust (domain, trustLevel, success/failure counts, avgRelevanceScore)

**Core Services:**
- `KnowledgeRetrievalService`: Safe web acquisition with policy-bound domain whitelisting
  - `queryWeb()`: Retrieves via web_search/web_fetch with trust scoring and caching
  - `scoreTrust()`: Domain whitelist - verified: wikipedia.org, reuters.com, bbc.com, bloomberg.com, coindesk.com, cointelegraph.com, github.com, stackexchange.com, stackoverflow.com, arxiv.org, nature.com, science.org; moderate: medium.com, dev.to, reddit.com, twitter.com, x.com; low: unknown
  - `recordRetrieval()`: Logs all retrievals with trust/relevance scores
  - `refreshCache()`: Removes expired entries
  - `auditTrust()`: Re-evaluates trust (downgrade <50% success, promote ≥80% moderate, ≥95% verified)
- `SemanticCorrelationEngine`: OpenAI embeddings for relevance and gap detection
  - `embedText()`: 1536-dim embeddings via text-embedding-3-small
  - `computeRelevanceScore()`: Cosine similarity
  - `relateToKnowledgeGraph()`: Gap detection (threshold 0.4)

**Autonomy Controller Integration:**
- Pipeline: Reasoning → Introspection → Safety → Federated Ethics → Ethical Reasoning → Knowledge Acquisition (if gap >0.4) → Execution
- Async, non-blocking (doesn't halt on failure)
- Gap threshold: 0.4 (40% semantic relevance)

**Scheduler Tasks:**
- `knowledge_sync`: Every 2 hours (cache refresh, sync sources)
- `trust_audit`: Every 12 hours (re-evaluate domain trust)

**API Endpoints (JWT auth required):**
- `GET /api/knowledge/query?query=all&limit=24`: Retrieval logs (default 24h)
- `GET /api/knowledge/trust`: Trusted sources (verified+moderate)
- `POST /api/knowledge/refresh`: Manual cache refresh

**System Monitoring UI - Knowledge Tab:**
- Summary: Retrievals (24h), Trusted Sources, Avg Relevance, Cache Status
- Recent Retrievals: Last 10 with trust badges (verified=green, moderate=yellow, low=gray), relevance, timestamps
- Trusted Domains: verified/moderate sources with success rates
- Cache Management: Manual refresh button, auto-sync schedule

**Critical Notes:**
- ONLY valid enum values: "verified", "moderate", "low", "untrusted"
- Domain whitelist enforces policy-bound retrieval (no arbitrary URLs)
- All operations user-scoped (userId enforced)
- Cache TTL: 24 hours
- Trust audit thresholds: <50% → low, ≥80% → moderate, ≥95% → verified
- Optional enhancement (doesn't block execution)
- getTrustedSources uses enum casting: \`sql\`\${knowledgeTrustRecord.trustLevel} = ANY(ARRAY['verified'::retrieval_trust_level, 'moderate'::retrieval_trust_level])\`\`

**Security Constraints:**
- All endpoints require JWT auth (authenticateToken)
- No direct URL access - only via approved query flow
- Web search/fetch sandboxed via KnowledgeRetrievalService
- Unknown domains default to "low" trust
- Admin can override via knowledge_trust_record manual entries
## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.