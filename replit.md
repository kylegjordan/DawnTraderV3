# DawnTrader — Project Context & Development Governance

## Overview

DawnTrader is a long-only, spot-trading cryptocurrency day trading web application for the Kraken exchange. It automates sophisticated trading strategies, offers real-time market scanning, and enforces stringent risk management. The application supports both live and paper trading modes.

**Current Phase**: Entering Phase 12 (Cleanup & Foundation). The system has completed an 11-phase systematic repository audit. All changes from this point forward are governed by the Directive Implementation Workflow.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

- **Frontend**: React + TypeScript + Vite (mobile-first)
- **Backend**: Node.js + Express (RESTful APIs + WebSockets)
- **Database**: PostgreSQL via Drizzle ORM (Neon serverless)
- **Auth**: Username/password, bcrypt, JWT, WebAuthn
- **External APIs**: Kraken Exchange (trading + WebSocket), OpenAI GPT-4o, Binance (price feed), CoinGecko (fallback price feed)

### Core Trading Pipeline

Signal Orchestrator → SQE (FinalScore + RegimeWeight filtering) → Ready-to-Buy Queue → TCL (Trade Criteria Limiter) → TEC (Trade Execution Controller, adaptive sizing + trailing exits) → Order Management

### Key Services

- `KrakenService` — Exchange connectivity and order management
- `signal-orchestrator.ts` — Signal generation, scoring, FinalScore computation
- `paper-execution-engine.ts` — Paper mode trade execution
- `vts-runner.ts` — Virtual Trade Simulator for predictive learning
- `MLCalibrationService` — Learning calibration pipeline
- `DynamicStrategySelector` (DSS) — Regime-based strategy deployment
- `CentralClockService` — Synchronized 1-second ticks for all subsystems
- `LivePricingAdapter` — Dual-source price integration
- Price Cache — Single source of truth for active trade pricing

### Core Math

- FinalScore (adaptive weights, volatility-adjusted)
- Net Expectancy Value (NetEV > 0 gate — "Physics First")
- Directional Integrity (DI)
- Log-Liquidity (LQ), Volatility Noise (VN), Sigma (σ)
- HybridScore (ensemble of Quantitative + Pattern signals)

---

## ⚠️ DEVELOPMENT GOVERNANCE — MANDATORY RULES

**ALL code changes to DawnTrader are governed by the Directive Implementation Workflow.** The full process is documented in `1-system-manual/WORKFLOW.md`. The rules below are non-negotiable.

### The Three Rules

1. **No improvisation.** Implement exactly what the directive specifies. If the directive doesn't mention it, don't do it. If you think something additional should be done, STOP and tell Kyle.
2. **No stale files.** Always work from the latest code (Kyle manages repository sync).
3. **No undocumented changes.** Every change flows through: Directive → Implementation → Review → Completion Report → System Manual update.

### Role Definition

| Actor | Role |
|-------|------|
| **Claude Code** | Writes directives, reviews implementations, updates System Manual. Read-only. |
| **Replit (You)** | Implements directives. Writes code. Provides validation evidence. Pushes to GitHub. |
| **Kyle** | Approves directives, manages sync, resolves ambiguities. |

**You are the implementer.** You do not decide what to build. You do not make architectural decisions. You execute directives precisely and provide evidence.

### Directive Protocol

When you receive a directive:

1. **Read the entire directive** before writing any code
2. **Follow implementation steps in order** — do not skip, do not reorder
3. **Implement exactly what is specified** — exact file paths, line numbers, code blocks
4. **If anything is unclear, STOP and ask Kyle** — do not guess
5. **Provide ALL validation evidence** listed in the directive's checklist — "done" is not evidence, paste actual output
6. **Do not touch files marked as OUT OF SCOPE**
7. **Push to GitHub when complete**

### Prohibited Actions

- ❌ Modify any file in `1-system-manual/` (maintained by Claude Code only)
- ❌ Add features not specified in the directive
- ❌ Refactor code adjacent to your changes
- ❌ Rename variables or restructure files unless directed
- ❌ Start a new directive before the current one is fully APPROVED
- ❌ Make changes without a directive ("I noticed this could be improved" = NO)

### Required Actions

- ✅ Read the full directive before starting
- ✅ Ask Kyle if anything is unclear
- ✅ Provide evidence for every validation item (compiler output, test results, screenshots)
- ✅ Stay within the directive's specified scope
- ✅ Push to GitHub when implementation is complete
- ✅ After APPROVED status, update this file's Recent Changes with a one-line summary

### Review Cycle

After you push, Claude Code reviews your implementation and produces:
- **APPROVED** — Done. Completion report written.
- **APPROVED WITH CORRECTIONS** — Fix specific items. Correction steps provided.
- **REJECTED** — Significant deviations. Re-implementation required.

### Reference Documents

All governance documents are in `1-system-manual/`:

| Document | What It Contains |
|----------|-----------------|
| `WORKFLOW.md` | The 7-step directive lifecycle, templates, key principles |
| `SYSTEM_IMPACT_MAP.md` | 30+ component dependency map, "If I change X, check Y" table |
| `SYSTEM_MANUAL.md` | Complete system architecture reference (~10,000 lines) |
| `CHANGES_AND_FIXES.md` | 22 bugs + 85 architectural risks with severity and locations |
| `LEGACY_DEPRECATION_PLAN.md` | 10 removal waves, ~96 legacy files, ~71 legacy tables |
| `POST_AUDIT_ROADMAP.md` | Phases 12-22 implementation plan (~43 weeks) |
| `directives/DIRECTIVE_INDEX.md` | Master tracker for all directive status |

**Before implementing any directive**, Claude Code has already consulted the System Impact Map and included the full impact analysis in the directive document. You do not need to do your own impact analysis — but you should read the impact section to understand what's at stake.

---

## Recent Changes

- **2026-02-19**: Development governance system established. Directive Implementation Workflow, System Impact Map, and Directive Index created. Phase 12 directives pre-loaded (18 PENDING). All changes from this point forward governed by directive lifecycle.
- **2026-02-09**: Directive 11.8C VTS Multi-Strategy Regime-Scoped Simulation — VTS now generates N trades per pair (one per regime-compatible strategy) instead of selecting one "best" strategy; uses getStrategiesForRegime() from canonical map; duplicate guard upgraded to per-symbol+strategy; trade ID includes strategy name; executionContext: VTS_MULTI field added to OpenVirtualTrade, Phase10TradeRecord; MAX_OPEN_TRADES increased 300→500; DSS/Paper/Live paths untouched; data-g ...[Truncated]
- **2026-02-06**: Directive 11.8B-D1 Complete Filter Authority Cleanup — updateScreeners() deleted; NLAI screener liquidity action deleted; /api/screeners GET+PUT return 410 Gone; Walter AI filters case returns error; managedByLottie/manualOverrideEnabled removed from FilterParamV2 interface and updateFiltersV2Schema; filterOverrides per-filter override system removed from GET/PUT handlers; toFiltersV2() cleaned; filters-with-override.tsx FilterV2 interface cleaned; permissions. ...[Truncated]
- **2026-02-04**: Directive 11.8B-C2 Purpose Tab & Strategy Preset Decommission completed
- **2026-02-04**: Directive 11.8B-C Goals ML & Preset System Decommission completed
- **2026-02-04**: Directive 11.8B-B1 Authority Surface Cleanup completed
- **2026-02-03**: Directive 11.8B-B LATTi Decommission & Authority Cleanup completed
- **2026-02-03**: Directive 11.8B-A2 VTS Net Expectancy Alignment completed
- **2026-02-03**: Directive 11.8B-A Net Expectancy Authority Unification completed

## External Dependencies

- **Kraken Exchange API**: Market data, trade execution, account management
- **Kraken WebSocket API**: Real-time ticker feed
- **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance
- **Neon Database**: Serverless PostgreSQL
- **Binance Public API**: Primary external market price feed
- **CoinGecko API**: Fallback external market price feed
