# DawnTrader System Manual: Systematic Repository Audit Plan

> **Date**: 2026-02-15 (Updated after Kyle approval)
> **Author**: Claude Code (System Cartographer)
> **Purpose**: Phased plan to expand System Manual v1.2 into a comprehensive "System Bible"
> **Audience**: Kyle (approval), Replit (reference), Claude Code (execution)
> **Status**: APPROVED — Phase 1 in progress

---

## Kyle's Decisions (Locked In)

1. **Phase order**: Approved as proposed
2. **Strategy depth**: Full depth — entry/exit logic, conditions, regime context, secondary metrics, formulas, and "slice of the pie" rationale
3. **Legacy handling**: Note everything encountered, but legacy removal plans go in a **separate deprecation document** (`LEGACY_DEPRECATION_PLAN.md`), NOT the System Manual
4. **Document scope**: Not every file/function goes in the manual. Important systems get documented; minor utilities get listed in the index. The manual should be readable by a new developer joining the project.
5. **Review cycle**: ChatGPT reviews each phase output. Replit available as second opinion when needed.
6. **Supplementary documents**: System Manual (active system docs) + Legacy Deprecation Plan (removal roadmap) + Module Index (comprehensive file-level catalog)

---

## The Problem

System Manual v1.2 covers ~20 core modules well, but the repository has **578 server-side files** (327 in `/services` alone). Many are legacy/dead, but many are active and undocumented.

---

## Approach: Phased Depth-First Audit

Each phase does a **deep dive into one functional area**, producing a complete new manual section. Legacy files encountered along the way are noted and deferred to the deprecation document.

### Output Documents
- **System Manual** (`DAWNTRADER_SYSTEM_MANUAL_v*.md`): Active system architecture, math, data flows, contracts
- **Legacy Deprecation Plan** (`LEGACY_DEPRECATION_PLAN.md`): All dead/deprecated files, removal difficulty, dependency risks
- **Module Index** (Appendix in manual): Every file classified as ACTIVE/LEGACY/DEAD with one-line description

---

## Phase Schedule

### Phase 1: Math Foundation — Filters, Scoring, Cost Model, EV
**Scope**: The mathematical engine beneath the trading pipeline
**Files to deep-read**:
- `server/core/metrics/*` (all files)
- `server/core/calculations/*` (net-expectancy-kernel, cost-model, etc.)
- `server/core/filters/*` (SQE, filter gateway, IMF)
- `server/utils/analysis-utils.ts`
- `server/utils/rolling-stats.ts`
- `server/config/score-weights.config.ts`
- `server/services/slippage-fee-model.ts`
- `server/services/unified-filter-gateway.ts`

**Covers Replit items**: IMF Metrics, Unified Filter Gateway, FinalScore Calculator, Score Weights Config, SQE Deep Dive, Cost Model, Slippage & Fee Model, Cost Metrics/Cache
**Deliverable**: New manual section "Core Math & Scoring Engine"

---

### Phase 2: Strategy Deep-Dives — All 17 Canonical + Pattern + Hybrid
**Scope**: What every strategy does, when it trades, and why it exists
**Files to deep-read**:
- `server/services/strategy-engine.ts` (full — all 9 QUANT strategies)
- `server/services/pattern-recognizer.ts`
- `server/services/hybrid-integration.ts`
- `server/services/strategy-filters.ts`
- `server/services/strategy-governance.ts`
- `server/services/drift-detector.ts`
- `server/strategies/*`
- `server/core/pattern-recognition.ts` (if exists)

**Covers Replit items**: 17 Strategy Definitions, Pattern Recognizer, Hybrid Integration, Strategy Filters, Strategy Governance, Drift Detection
**Deliverable**: New manual section "Strategy Catalog" — each strategy gets: purpose, regime affinity, entry/stop/target logic, indicator requirements, slice-of-the-pie context

---

### Phase 3: FX5 Scanner, Adaptive Pool, Pair Management
**Scope**: How pairs enter the system and get managed
**Files to deep-read**:
- `server/services/fx5-scanner.ts`
- `server/services/active-filter-pool.ts`
- `server/services/adaptive-scan-manager.ts`
- `server/services/adaptive-pool-config.ts`
- `server/services/fx5-24h-window.ts`
- `server/services/market-scanner.ts`
- `server/services/market-volume-cache.ts`

**Covers Replit items**: Adaptive Pool Config, Adaptive Scan Manager, Market Scanner
**Deliverable**: New manual section "Market Scanning & Pair Management"

---

### Phase 4: Guardrails, Risk, Portfolio, & Trade Safety
**Scope**: Everything that prevents bad trades and protects capital
**Files to deep-read**:
- `server/services/trade-safety.ts`
- `server/services/safety-guardrails.ts`
- `server/services/adaptive-guardrails.ts`
- `server/services/guardrail-policy.ts`
- `server/services/guardrail-settings.ts`
- `server/services/circuit-breaker.ts`
- `server/services/pre-execution-validator.ts`
- `server/services/gasp-coordinator.ts`
- `server/services/pdc-engine.ts`
- `server/services/risk-concentration.ts`
- `server/core/risk/*`
- `server/services/paper-portfolio-manager.ts`
- `server/services/portfolio-aggregator.ts`
- `server/services/kraken.ts` (main Kraken REST client)

**Covers Replit items**: Guardrail System, Trade Safety, Circuit Breaker, GASP, PDC, Risk Concentration, Covariance Guard, Paper Portfolio Manager, Portfolio Aggregator, Kraken Service
**Deliverable**: New manual section "Risk Management, Guardrails & Portfolio"

---

### Phase 5: Database Schema, Storage Layer, & Persistence
**Scope**: The data model and persistence layer
**Files to deep-read**:
- `shared/schema.ts`
- `shared/diagnostic-schema.ts`
- `server/db.ts`
- `server/storage.ts`
- `server/migrations/*`
- `drizzle.config.ts` (if exists)

**Covers Replit items**: Database Schema, Diagnostic Schema, Storage Layer, Drizzle ORM Config
**Deliverable**: New manual section "Data Model & Persistence"

---

### Phase 6: ML Pipeline, Learning, & Calibration
**Scope**: The full learning pipeline from trade outcomes to parameter adjustments
**Files to deep-read**:
- `server/services/ml-calibration.ts`
- `server/services/ml-service-client.ts`
- `server/core/calibration/*`
- `server/services/calibration_report_service.ts`
- `server/services/regime-archiver.ts`
- `server/services/telemetry-aggregator.ts`
- `server/services/telemetry-repository.ts`
- VTS learning parameter files (reward function, GSI computation, learning rate updates)

**Covers Replit items**: ML Calibration, ML Service Client, Learning Feedback, Regime Archiver, Calibration Report, Adjustment Explainability/Stability

**CRITICAL — Phase 1 Cross-Dependency**: Phase 1 revealed that VTS couples to scoring via `VTS → adaptive relevance → rolling normalization → NGC → confidence → DSS DI → kernel Pwin`. This phase must provide **rigorous mathematical validation** (not just structural overview) of:
1. VTS reward function math
2. Learning rate update equations
3. GSI (Global Stability Index) calculation logic
4. Stability bounds on adaptive relevance
5. Drift controls and convergence properties
6. Statistical reproducibility characteristics
7. Whether VTS-derived adjustments materially improve trade expectancy

**This phase is mathematically authoritative** for any final decisions about NGC removal, RollingNormalizer deprecation, and confidence consolidation recommended in Phase 1.

**Deliverable**: New manual section "Learning Pipeline & ML Calibration"

---

### Phase 7: Boot Sequence, Infrastructure, & System Lifecycle
**Scope**: How the system starts, runs, and self-monitors
**Files to deep-read**:
- `server/index.ts`
- `server/startup/*`
- `server/bootstrap/*`
- `server/services/trading-engine.ts`
- `server/services/mode-registry.ts`
- `server/services/task-queue.ts`, `task-router.ts`, `task-worker.ts`
- `server/services/scheduler-registry.ts`
- `server/services/system-health-monitor.ts`
- `server/services/health-monitor.ts`
- `server/services/feed-integrity-monitor.ts`
- `server/services/self-repair.ts`

**Covers Replit items**: Boot Orchestrator, Mode Registry, Trading Engine, Market Scanner, Task Queue, Scheduler Registry, Health Monitor, Feed Integrity
**Deliverable**: New manual section "System Lifecycle & Infrastructure"

---

### Phase 8: API Surface, Routes, & WebSocket Protocol
**Scope**: External interface documentation
**Files to deep-read**:
- `server/routes.ts`
- `server/routes/*` (all 26 files)
- `server/services/auth-service.ts`
- `server/middleware/*`
- `server/services/market-data-ws.ts`

**Covers Replit items**: Auth System, API Routes Overview, Permissions
**Deliverable**: New manual section "API & Communication Layer"

---

### Phase 9: Frontend Architecture
**Scope**: Client-side application
**Files to deep-read**:
- `client/src/pages/*`
- `client/src/components/*`
- `client/src/hooks/*`
- `client/src/lib/*`

**Covers Replit items**: Frontend Page Map, WebSocket Client, Dashboard Components
**Deliverable**: New manual section "Frontend Architecture"

---

### Phase 10: Legacy Classification, Dead Code Census, & AI Systems
**Scope**: Everything not yet classified — primarily legacy/dead systems
**Files**: All remaining unclassified files (~200+)
**Focus areas**:
- Walter/Bob ecosystem (full file list)
- AI/NLP modules (ai-analyst, cortex, etc.)
- Cognitive services
- Deprecated adaptive systems (DCE deep-dive, MOF, MACO)
- Diagnostic services (active vs. dead)

**Covers Replit items**: DCE documentation, Adaptive Regime, MOF, MACO, Walter, AI Analyst, AI Opportunities, Cortex
**Deliverables**:
- `LEGACY_DEPRECATION_PLAN.md` — Complete removal roadmap with difficulty ratings
- Updated manual Section 18 (Active vs Legacy Boundary)

---

### Phase 11: Consolidation, Cross-Reference, & Final Assembly
**Deliverable**: System Manual v2.0 with:
- All new sections integrated
- Cross-references between sections
- Complete Module Index (every file classified with one-line description, parent system, key dependencies, key consumers)
- Updated glossary
- Updated system invariants
- Updated system contracts
- Complete impact reference map
- Table of contents regenerated

---

## Replit's 60 Topics — Phase Mapping

| # | Topic | Phase | Status |
|---|-------|-------|--------|
| **Cat 1: Risk & Safety** | | | |
| 1 | Guardrail System | Phase 4 | Pending |
| 2 | Trade Safety Service | Phase 4 | Pending |
| 3 | Circuit Breaker | Phase 4 | Pending |
| 4 | GASP | Phase 4 | Pending |
| 5 | PDC & Equity Curve Smoothing | Phase 4 | Pending |
| 6 | Risk Concentration | Phase 4 | Pending |
| 7 | Covariance Guard | Phase 4 | Pending |
| **Cat 2: Filters & Scoring** | | | |
| 8 | IMF Metrics | Phase 1 | Pending |
| 9 | Unified Filter Gateway | Phase 1 | Pending |
| 10 | Strategy Filters | Phase 2 | Pending |
| 11 | FinalScore Calculator | Phase 1 | Pending |
| 12 | Score Weights Config | Phase 1 | Pending |
| 13 | SQE Deep Dive | Phase 1 | Pending |
| 14 | Cost Model | Phase 1 | Pending |
| 15 | Slippage & Fee Model | Phase 1 | Pending |
| 16 | Cost Metrics & Cache | Phase 1 | Pending |
| **Cat 3: Strategy Details** | | | |
| 17 | 17 Canonical Strategies | Phase 2 | Pending |
| 18 | Pattern Recognizer | Phase 2 | Pending |
| 19 | Hybrid Integration | Phase 2 | Pending |
| 20 | Strategy Governance | Phase 2 | Pending |
| 21 | Drift Detection | Phase 2 | Pending |
| **Cat 4: Infrastructure** | | | |
| 22 | Boot Orchestrator | Phase 7 | Pending |
| 23 | Mode Registry | Phase 7 | Pending |
| 24 | Trading Engine | Phase 7 | Pending |
| 25 | Market Scanner | Phase 3 | Pending |
| 26 | Task Queue | Phase 7 | Pending |
| 27 | Scheduler Registry | Phase 7 | Pending |
| 28 | Health Monitor | Phase 7 | Pending |
| 29 | Feed Integrity | Phase 7 | Pending |
| **Cat 5: ML & Learning** | | | |
| 30 | ML Calibration | Phase 6 | Pending |
| 31 | ML Service Client | Phase 6 | Pending |
| 32 | Learning Feedback | Phase 6 | Pending |
| 33 | Regime Archiver | Phase 6 | Pending |
| 34 | Calibration Report | Phase 6 | Pending |
| 35 | Adjustment Explainability | Phase 6 | Pending |
| **Cat 6: AI Systems** | | | |
| 36 | AI Analyst | Phase 10 | Pending |
| 37 | AI Opportunities | Phase 10 | Pending |
| 38 | Cortex System | Phase 10 | Pending |
| 39 | Walter (deprecation list) | Phase 10 | Pending |
| **Cat 7: Portfolio** | | | |
| 40 | Paper Portfolio Manager | Phase 4 | Pending |
| 41 | Portfolio Aggregator | Phase 4 | Pending |
| 42 | Portfolio Initializer | Phase 4 | Pending |
| 43 | Kraken Service | Phase 4 | Pending |
| **Cat 8: Database** | | | |
| 44 | Database Schema | Phase 5 | Pending |
| 45 | Diagnostic Schema | Phase 5 | Pending |
| 46 | Storage Layer | Phase 5 | Pending |
| 47 | Drizzle Config | Phase 5 | Pending |
| **Cat 9: Auth & API** | | | |
| 48 | Auth System | Phase 8 | Pending |
| 49 | API Routes | Phase 8 | Pending |
| 50 | Permissions | Phase 8 | Pending |
| **Cat 10: Frontend** | | | |
| 51 | Frontend Page Map | Phase 9 | Pending |
| 52 | WebSocket Client | Phase 9 | Pending |
| 53 | Dashboard Components | Phase 9 | Pending |
| **Cat 11: Adaptive Systems** | | | |
| 54 | DCE Documentation | Phase 10 | Pending |
| 55 | Adaptive Regime | Phase 10 | Pending |
| 56 | Adaptive Pool Config | Phase 3 | Pending |
| 57 | Adaptive Scan Manager | Phase 3 | Pending |
| 58 | MOF | Phase 10 | Pending |
| 59 | MACO | Phase 10 | Pending |

**Coverage**: All 59 items mapped. Zero gaps.

---

## Session Structure (Per Phase)

1. **Read**: Deep-read all files in scope (full file, not excerpts)
2. **Classify**: Active vs. legacy vs. dead (legacy items → deprecation doc)
3. **Extract**: Math formulas, logic flows, contracts, data shapes
4. **Cross-reference**: How this area connects to already-documented areas
5. **Write**: New manual section + any legacy findings to deprecation doc
6. **Kyle Review**: Kyle + ChatGPT review, corrections
7. **Integrate**: Merge into System Manual, update cross-references

Estimated time per phase: **1-2 sessions** (some phases may take 2).

---

*This plan produces a complete System Bible in ~11 phases across ~14-18 sessions, with each phase delivering a usable, standalone section. All 59 of Replit's identified topics are mapped and covered.*
