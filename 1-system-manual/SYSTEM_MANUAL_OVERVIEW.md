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
├── _archive/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md
│                                 CCPI — RETIRED 2026-04-20. Role absorbed by
│                                 `CLAUDE.md` at repo root (auto-loaded at
│                                 session start). See `_archive/README.md`.
│                                 THE governance documents are now:
│                                 CLAUDE.md + MEMORY.md + this folder.
│
├── BATCH_CATALOG.md              Index of every batch
│                                 Batch ID, description, scope file,
│                                 completion report, commit hash, date.
│                                 Updated every governance batch.
│
├── PHASE_HISTORY.md              Phase chronology
│                                 Phase-to-batch mapping, timeline,
│                                 and key milestones. Updated every
│                                 governance batch.
│
├── SYSTEM_IMPACT_MAP.md          Component dependency map
│                                 30+ services across 11 layers. For each:
│                                 upstream deps, downstream consumers, shared
│                                 state, execution model, blast radius rating.
│                                 "If I change X, check Y" quick lookup table.
│                                 Consulted BEFORE writing any batch.
│
├── sync-repo.bat                 One-click repository sync
│                                 Pulls latest from GitHub into local clone.
│                                 Used between steps to keep all
│                                 parties working from current code.
│
│  ── REFERENCE / ARCHIVE ────────────────────────────────────
│
├── directives-archive/           Historical directive folders
│                                 Legacy directive system (pre-batch workflow).
│                                 Contains DIRECTIVE_INDEX.md and per-directive
│                                 folders with directive, review, and completion
│                                 documents. Retained for historical reference.
│                                 New batches do NOT create directive folders.
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

**This is the living document.** It is updated after every completed batch to reflect what the system IS today.

### CHANGES_AND_FIXES.md — "What needs to be fixed"
The action registry tracking every bug and architectural risk discovered during the audit:

- **22 bugs** (7 CRITICAL, 2 HIGH, 4 MEDIUM, 7 LOW, 2 Informational)
- **85 architectural risks** (RISK-001 through RISK-085)

Each entry includes severity, file location, description, verification status, recommended timing (pre-MCE / during-MCE / post-MCE), and the phase where it was discovered. As batches resolve bugs and risks, they are marked RESOLVED with a reference to the completing batch.

### LEGACY_DEPRECATION_PLAN.md — "What needs to be removed"
The removal roadmap for all legacy, deprecated, and dead code:

- **10 removal waves** organized by difficulty (EASY → MODERATE → HARD → DANGEROUS)
- **~96 legacy files** (Walter/Bob/Cortex ecosystem)
- **~71 legacy database tables** (~44% of the schema)
- **~460 unused API endpoints**
- **~40 legacy enum definitions**

Each entry includes file count, difficulty rating, dependency risks, and recommended removal order. Waves are mapped to roadmap phases.

### POST_AUDIT_ROADMAP.md — "The plan, in order"
The complete implementation roadmap from current state to production:

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

### CLAUDE.md (repo root) — "How we work"
`CLAUDE.md` is the canonical governance document. It auto-loads into every Claude Code session at start. It defines:

- **Roles & responsibilities** (§1) — who does what in the three-way workflow
- **Canonical workflow** (§2) — the 11-phase batch process
- **Governance tiers** (§3) — which docs get updated every batch vs when-applicable
- **Canonical file locations** (§4) — where everything lives
- **Critical rules** (§5) — non-negotiable invariants (clone is source of truth, Replit frozen, etc.)
- **Three-way communication** (§6) — Kyle + CC + Langston protocol, Telegram patterns, escalation triggers
- **Infrastructure reference** (§7) — server addresses, credentials, deploy commands

Volatile current state (current phase, current batch, next steps) lives in `.claude/memory/MEMORY.md`, not in CLAUDE.md.

**Historical note:** Before 2026-04-20, the canonical governance doc was `CLAUDE_CODE_PROJECT_INSTRUCTIONS.md` (CCPI) in this folder. It was retired and moved to `_archive/` when `CLAUDE.md` at repo root took over the auto-load role. See `_archive/README.md`.

### BATCH_CATALOG.md — "Index of every batch"
Master index of all batches with batch ID, description, scope file location, completion report location, commit hash, and date. Updated in every governance batch. This replaces the legacy DIRECTIVE_INDEX.md.

### PHASE_HISTORY.md — "Phase chronology"
Phase-to-batch mapping showing which batches belong to which phase, timeline, and key milestones. Updated in every governance batch. Provides the high-level view of project progress.

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

**This map is consulted before every batch is written** to ensure system-wide awareness of impacts.

### directives-archive/ — "Historical directive system"
The legacy directive folders from the pre-batch workflow era. Contains DIRECTIVE_INDEX.md and per-directive folders with directive, review, and completion documents. Retained for historical reference only. New batches do NOT create directive folders — batch tracking is now handled by BATCH_CATALOG.md and PHASE_HISTORY.md.

---

## The Batch Implementation Cycle

### The Four Actors

| Actor | Role |
|-------|------|
| **Claude Code** | Implements code, deploys to Replit (through Langston's server), pushes to GitHub, pulls to clone, runs audits, writes batch completion reports, writes governance batches, participates in design. |
| **Langston** | Reviews and validates: scope/intent, pre-implementation audit, completed batch folder, batch completion reports. Cross-actor capacity monitoring. Participates in design. |
| **Replit Agent** | Applies file changes per INSTRUCTIONS.md. Source of truth for live codebase. Runs diagnostics when requested. Does NOT run shell commands — shell commands go through the Replit Shell tool only. |
| **Kyle** | Approves scope/direction/architecture. Breaks ties. Only person who can override governance. Reviews batch completion reports at his discretion. |

### How a Batch Flows

See the **Canonical Workflow** section (§2) in `CLAUDE.md` at repo root for the complete step-by-step workflow. That is the canonical workflow reference (CCPI retired 2026-04-20).

In summary (post-Replit workflow, 2026-03-30 onwards):
1. Scope and planning (Kyle directive, CC drafts scope, Langston reviews)
2. Pre-implementation audit (SIM consultation, upstream/downstream trace)
3. Implementation (CC edits directly in clone repo on migration branch)
4. Code review (Langston reviews git diff BEFORE push)
5. Push + CI + deploy to Hetzner staging
6. Verification (first-pass CC, second-pass Langston)
7. Iteration until objectives green
8. Governance (update Tier 1 + applicable Tier 2 docs, write completion report)

---

## Why This Process Exists

DawnTrader has accumulated significant technical debt from organic development across many phases, multiple AI assistants, and evolving requirements. The 11-phase audit surfaced 22 bugs and 85 architectural risks. The codebase contains ~96 legacy files, ~71 legacy database tables, and ~460 unused API endpoints.

Going forward, every change to the system must be:
- **Intentional** — driven by a batch with clear purpose
- **Traceable** — documented in the batch catalog and completion reports
- **System-aware** — impact-analyzed against the full component dependency map
- **Verified** — validated with evidence before acceptance
- **Recorded** — reflected in the System Manual so it always describes reality

This process ensures that as we implement the remaining roadmap phases, we build on a clean foundation with full visibility into what we're changing and why.
