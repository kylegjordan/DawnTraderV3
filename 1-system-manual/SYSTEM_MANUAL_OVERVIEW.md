# DawnTrader System Manual & Governance Overview

## What Is the System Manual?

The `1-system-manual/` folder is the **single source of truth** for DawnTrader's architecture, known issues, removal plans, implementation roadmap, and development governance. It was produced through a systematic 11-phase repository audit conducted by Claude Code (System Cartographer & Lead Architect), with feedback from ChatGPT and cross-referencing against a Replit LSP audit report.

Everything in this folder is authoritative. When there is a question about how the system works, what needs to be fixed, what needs to be removed, or what to build next — the answer is in these documents.

---

## The Folder Structure

```
1-system-manual/
│
│  ── CORE DOCUMENTS (The System Bible) ──────────────────────
│
├── SYSTEM_MANUAL.md              The system as it IS today
│                                 ~10,000 lines. 11 chapters covering:
│                                 Core math, strategies, scanning, risk,
│                                 execution, ML/learning, infrastructure,
│                                 API, frontend, testing, database.
│                                 Includes System Authority Hierarchy
│                                 and Legacy Clusters appendix.
│
├── CHANGES_AND_FIXES.md          Bug & risk registry
│                                 22 bugs (7 CRITICAL) + 85 architectural
│                                 risks. Each with severity, location,
│                                 verification status, and recommended timing.
│                                 This is the ACTION registry — what to fix.
│
├── LEGACY_DEPRECATION_PLAN.md    What to remove
│                                 10 removal waves, ~96 legacy files,
│                                 ~71 legacy database tables. Difficulty
│                                 ratings, dependency risks, removal order.
│
├── POST_AUDIT_ROADMAP.md         The implementation plan
│                                 Phases 12-22. Full roadmap from current
│                                 state through cleanup, MCE, VTS, Directional
│                                 Bias, Short Trading, Adjustment Framework,
│                                 Authority Baseline, Predictive Execution,
│                                 ML Design, ML Build, Paper Debug, Production
│                                 Hardening, Live Mode, and Publication.
│                                 ~43 week timeline.
│
│  ── GOVERNANCE DOCUMENTS ───────────────────────────────────
│
├── WORKFLOW.md                   The directive lifecycle
│                                 7-step process: Sync → Author → Implement →
│                                 Sync → Review → Complete → Update Docs.
│                                 Includes templates for Directive, Review,
│                                 and Completion Report documents.
│
├── SYSTEM_IMPACT_MAP.md          Component dependency map
│                                 30+ services across 11 layers. For each:
│                                 upstream deps, downstream consumers, shared
│                                 state, execution model, blast radius rating.
│                                 "If I change X, check Y" quick lookup table.
│                                 Consulted BEFORE writing any directive.
│
├── sync-repo.bat                 One-click repository sync
│                                 Pulls latest from GitHub into local clone.
│                                 Used between directive steps to keep all
│                                 parties working from current code.
│
│  ── DIRECTIVES ─────────────────────────────────────────────
│
├── directives/
│   ├── DIRECTIVE_INDEX.md         Master tracker for all directives
│   │                              Status, dates, review cycle count.
│   │
│   ├── 12.1.1/                    (Created when directive is issued)
│   │   ├── DIRECTIVE_12.1.1.md    The directive itself
│   │   ├── REVIEW_12.1.1.md      Post-implementation review
│   │   └── COMPLETION_12.1.1.md  Completion report
│   │
│   └── [X.Y.Z]/                   One folder per directive
│
│  ── REFERENCE / ARCHIVE ────────────────────────────────────
│
├── AUDIT_PLAN.md                 Historical — original audit plan
│                                 Documents how the 11-phase audit was
│                                 structured. Archive reference only.
│
└── sections/                     Individual phase reports
    ├── PHASE1_CORE_MATH_AND_SCORING.md
    ├── PHASE2_STRATEGY_DEEP_DIVES.md
    ├── PHASE3_MARKET_SCANNING_AND_PAIR_MANAGEMENT.md
    ├── PHASE4_RISK_MANAGEMENT_GUARDRAILS_PORTFOLIO.md
    ├── PHASE5_TRADE_EXECUTION_AND_LIFECYCLE.md
    ├── PHASE6_ML_PIPELINE_LEARNING_AND_CALIBRATION.md
    ├── PHASE7_SYSTEM_LIFECYCLE_AND_INFRASTRUCTURE.md
    ├── PHASE8_API_AND_COMMUNICATION_LAYER.md
    ├── PHASE9_FRONTEND_AND_UI_LAYER.md
    ├── PHASE10_TESTING_AND_QUALITY_ASSURANCE.md
    └── PHASE11_DATABASE_SCHEMA_AND_MIGRATIONS.md
        (These are the original per-phase audit reports.
         All content is consolidated into SYSTEM_MANUAL.md.
         Retained for granular reference.)
```

---

## File Descriptions

### SYSTEM_MANUAL.md — "What the system IS"
The unified reference document for DawnTrader's entire architecture. Covers every active component, data flow, configuration, and integration point across 11 chapters organized into 5 parts:

- **Part I** (Chapters 1-3): Core Trading Engine — math/scoring, strategy deep dives, market scanning
- **Part II** (Chapters 4-5): Risk & Execution — guardrails, trade execution lifecycle
- **Part III** (Chapter 6): Intelligence & Learning — VTS, ML calibration, drift detection
- **Part IV** (Chapters 7-9): Infrastructure & Platform — boot sequence, API layer, frontend
- **Part V** (Chapters 10-11): Quality & Data — testing, database schema

Front matter includes:
- **System Authority Hierarchy** — which components are authoritative (trust these), which are contaminated/legacy (do not build on these), and which are the development path
- **Legacy Clusters** — 6 removal groupings showing how legacy systems are interconnected
- **Reading guidance** — how to distinguish current state from intended state in the document

**This is the living document.** It is updated after every completed directive to reflect what the system IS today.

### CHANGES_AND_FIXES.md — "What needs to be fixed"
The action registry tracking every bug and architectural risk discovered during the audit:

- **22 bugs** (7 CRITICAL, 2 HIGH, 4 MEDIUM, 7 LOW, 2 Informational)
- **85 architectural risks** (RISK-001 through RISK-085)

Each entry includes severity, file location, description, verification status, recommended timing (pre-MCE / during-MCE / post-MCE), and the phase where it was discovered. As directives resolve bugs and risks, they are marked RESOLVED with a reference to the completing directive.

### LEGACY_DEPRECATION_PLAN.md — "What needs to be removed"
The removal roadmap for all legacy, deprecated, and dead code:

- **10 removal waves** organized by difficulty (EASY → MODERATE → HARD → DANGEROUS)
- **~96 legacy files** (Walter/Bob/Cortex ecosystem)
- **~71 legacy database tables** (~44% of the schema)
- **~460 unused API endpoints**
- **~40 legacy enum definitions**

Each entry includes file count, difficulty rating, dependency risks, and recommended removal order. Waves are mapped to roadmap phases.

### POST_AUDIT_ROADMAP.md — "The plan, in order"
The complete implementation roadmap from current state (Phase 11.8B-D1) to production:

| Phase | What |
|-------|------|
| **Phase 12** | Cleanup & Foundation — math fixes, dead code purge, pipeline unification |
| **Phase 13** | MCE Installation |
| **Phase 14** | VTS Real Calculations + Directional Bias + Short Trading |
| **Phase 11 Final** | Adjustment Framework (11.8B-E) + Authority Baseline (11.8C) |
| **Phase 15** | Rules-Based Predictive Execution |
| **Phase 16** | L-Series Removal & Legacy Cleanup |
| **Phase 17** | Machine Learning Design |
| **Phase 18** | Machine Learning Implementation |
| **Phase 19** | Paper Mode Audit & Debug |
| **Phase 20** | Production Hardening |
| **Phase 21** | Live Mode Activation |
| **Phase 22** | Publication |

Includes dependency chain, risk assessment, decision points requiring Kyle's input, and a cross-reference table mapping Kyle's "Next Steps" document to roadmap phases.

### WORKFLOW.md — "How we implement changes"
The governing process for all directive work. Defines the 7-step lifecycle:

1. **Pre-Directive Sync** — Ensure Claude Code has the latest codebase
2. **Directive Authoring** — Claude Code writes a detailed directive with impact analysis
3. **Implementation** — Replit implements exactly as specified, provides validation evidence
4. **Post-Implementation Sync** — Updated code pulled to Claude Code's view
5. **Implementation Review** — Claude Code verifies correctness and completeness
6. **Completion Report** — Permanent record of what was done
7. **Document Updates** — System Manual and registries updated

Includes full templates for Directive, Review, and Completion Report documents. Key principles: no improvisation, no stale files, no undocumented changes.

### SYSTEM_IMPACT_MAP.md — "If I change X, what else is affected?"
Component dependency reference covering 30+ services and modules across 11 system layers. For each component:

- File path(s)
- Upstream dependencies (what feeds it)
- Downstream consumers (what it feeds)
- Shared state and configuration dependencies
- Background execution model (timer, event-driven, on-demand)
- Blast radius rating (LOW / MEDIUM / HIGH / CRITICAL)
- Known contamination points
- Related test files

Includes a quick lookup table: "If I change Signal Orchestrator, also check VTS Runner, SQE, Paper Execution Engine, Cost Model, Price Cache, and all signal tests."

**This map is consulted before every directive is written** to ensure system-wide awareness of impacts.

### directives/DIRECTIVE_INDEX.md — "Status of all directives"
Master tracker showing every directive's status (PENDING → ISSUED → IN PROGRESS → IN REVIEW → CORRECTIONS → COMPLETE), dates, and review cycle count. Currently pre-loaded with 18 Phase 12 directives.

---

## The Directive Implementation Cycle

### The Three Actors

| Actor | Role |
|-------|------|
| **Claude Code** | Writes directives, reviews implementations, updates System Manual. Has read-only access to a local clone of the repository. |
| **Replit** | Implements directives. Writes code. Provides validation evidence. Pushes to GitHub. |
| **Kyle** | Approves directives, manages repository sync between GitHub and the local clone, makes decisions on disagreements or ambiguities. |

### How a Directive Flows

```
Kyle syncs repo → Claude Code reads current code
                → Claude Code consults System Impact Map
                → Claude Code writes DIRECTIVE_X.Y.Z.md
                → Kyle reviews and approves directive
                → Kyle sends directive to Replit

Replit implements → Replit provides validation evidence
                 → Replit pushes to GitHub

Kyle syncs repo → Claude Code reads updated code
                → Claude Code writes REVIEW_X.Y.Z.md
                → If corrections needed: correction cycle
                → If approved: Claude Code writes COMPLETION_X.Y.Z.md

Claude Code writes DOC_UPDATE_X.Y.Z.md (Document Update Package)
Kyle sends package to Replit
Replit applies doc updates verbatim → pushes to GitHub
Kyle syncs repo
→ READY FOR NEXT DIRECTIVE
```

### What Makes a Good Directive

Directives are written so that Replit has **zero ambiguity**. They include:

- **Context**: What the system currently does and why it needs to change
- **Impact Analysis**: All upstream, downstream, and shared-state effects (from the System Impact Map)
- **Exact implementation steps**: File paths, line numbers, code blocks showing what to remove and what to replace it with
- **Validation requirements**: Specific checks Replit must perform and evidence Replit must provide (TypeScript compilation, test results, behavioral verification, screenshots)
- **Expected outcomes**: Before/after comparison
- **Risks and rollback**: What could go wrong and how to revert

The directive's job is to make it impossible for the implementer to misunderstand what needs to be done.

### What Replit Must Do

1. **Follow the directive literally** — do not improvise, add features, or "improve" anything not specified
2. **If the directive is unclear, STOP and ask Kyle** — do not guess
3. **Provide the validation evidence specified in the directive** — "done" is not evidence
4. **Push to GitHub when implementation is complete**
5. **Apply Document Update Packages verbatim** when provided by Kyle after directive approval — this is the one exception to the `1-system-manual/` read-only rule

### What Happens After Implementation

Claude Code reviews the implementation against the directive and produces one of three verdicts:

- **APPROVED** — Implementation matches directive. Proceed to completion report.
- **APPROVED WITH CORRECTIONS** — Mostly correct but needs specific fixes. Correction steps provided.
- **REJECTED** — Significant deviations. Requires re-implementation.

After approval, Claude Code writes a **Document Update Package** containing all governance document edits (completion report, System Manual updates, registry status changes). Kyle sends the package to Replit, Replit applies the edits verbatim and pushes to GitHub. This ensures the System Manual always reflects the current state of the system, and the only path to GitHub remains through Replit.

---

## Why This Process Exists

DawnTrader has accumulated significant technical debt from organic development across many phases, multiple AI assistants, and evolving requirements. The 11-phase audit surfaced 22 bugs and 85 architectural risks. The codebase contains ~96 legacy files, ~71 legacy database tables, and ~460 unused API endpoints.

Going forward, every change to the system must be:
- **Intentional** — driven by a directive with clear purpose
- **Traceable** — documented in the directive chain (directive → review → completion)
- **System-aware** — impact-analyzed against the full component dependency map
- **Verified** — validated with evidence before acceptance
- **Recorded** — reflected in the System Manual so it always describes reality

This process ensures that as we implement Phases 12-22, we build on a clean foundation with full visibility into what we're changing and why.
