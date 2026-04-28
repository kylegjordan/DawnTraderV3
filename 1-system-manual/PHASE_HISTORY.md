# DawnTrader Phase History

> **Purpose**: Chronological record of how DawnTrader evolved by phase, including batch mapping and the major architectural milestones each phase delivered.
> **Updated by**: Langston (compiled from current governance docs, frozen snapshot history, and the accessible canonical-history bundle)
> **Location**: `1-system-manual/PHASE_HISTORY.md`
>
> **Source note**: The historical bundle path provided in the assignment did not exist exactly as written. The accessible canonical context used for pre-governance reconstruction was: `DawnTrader_Canonical_Context_v2025-12-13/`.

---

## Phase-to-Batch Mapping

| Phase | Description | Batches | Status |
|-------|-------------|---------|--------|
| 1-7 | Early platform build, Walter integration, LATTi transition, failed V2 attempt, restoration | Pre-governance history only | HISTORICAL |
| 8.x | Refactoring waves, REB rebuild, end-to-end pipeline restoration to Phase 8.8.3 | Pre-governance history only | HISTORICAL |
| 9-11 | Late pre-governance expansion, authority/adjustment framework groundwork, system stabilization | Pre-governance history only | HISTORICAL / PARTIALLY RECONSTRUCTED |
| 12.1 | Critical Math & Security Fixes | Batch 1, 1B, 2, 2B, 3, 3B | COMPLETE |
| 12.2 | Dead Code Purge | Batch 4, 4B, 5, 5B, 6, 6B, 7A, 7B, 7B GOV, 8, 8B, 9, 9B, 10, 10B, 11, 11B | COMPLETE |
| 12.3 | Pipeline Unification | Batch 12, 12B, 13, 13B | COMPLETE |
| 13 | MCE Installation + L12/L20 Removal | Batch 14 | COMPLETE |
| 14 | VTS Real Calculations / Regime / DBS Transition | Batch 15, HF6, HF7 | ADVANCED / SPLIT INTO 14.1-14.6 |
| 14.1 | VTS Throughput, Regime, IMF, Column Fixes | HF8, HF9, with scoped work in Batch 16 and Batch 17 absorbed into the hotfix path | COMPLETE |
| 14.2 | DBS Implementation | Already effectively implemented | SKIPPED / COMPLETE BY PRIOR STATE |
| 14.3 | Short Trading | — | DEFERRED INDEFINITELY |
| 14.4 | Phase 14.4 line of work | — | CANCELED |
| 14.5 | Dual-Path Pattern Scanning + Merit-Based Ranking + Filter Diagnostics | Batch 19 through 19K GOV | COMPLETE |
| Inter-phase | API Budget Optimization + routing/archive hotfixes | Batch 18, 18B, HF10, HF10B, HF11B, HF12, HF12B, HF12C, HF12D | COMPLETE |
| 14.6 | Filter Diagnostics Data Truth + Family-Qualified Identity | Batches 20-39 (all deployed and verified on Replit) | COMPLETE |
| Migration | Hetzner + Supabase Migration (Post-Replit) | Batch 40 | COMPLETE |
| 14.7 | Filter Diagnostics & Strategy Calibration | Batches 48-54 (deployed on Hetzner staging) | COMPLETE |
| 12.2 (completion) | Legacy Code Purge — Walter/CWQI/NGC final removal | Batch 55 | COMPLETE |
| Post-migration | Stabilization + architecture fixes + execution integrity | Batches 41-47 | COMPLETE |
| 11.8 | Phase 11 Finalization: Adjustment Framework + Authority Baseline | Batch 58 | COMPLETE |
| 15a | Predictive Learning UI Audit & Data Path Fixes | Batch 59 | COMPLETE (Regime Archive verification pending next telemetry cycle) |
| 15b (OLD) | ~~Rules-Based Predictive Execution / Smart Thermostat~~ | ~~B60~~ | **DEFERRED post-live → renumbered Phase 17.5** (2026-04-14). Cannot tune adaptive policy on top of a misclassified state model. |
| **15b (NEW)** | **Regime / DBS / Strategy / Filter Restructure** — DBS validation, regime taxonomy redesign, Strong Bull Trend strategy + TEC activation, infrastructure consolidation, data archiving, drift dashboard | **B61, B62, B63, B64, B65, B66** | **LOCKED 2026-04-14 — IN PROGRESS.** Sub-Phase A (B61 DBS Validation) CLOSED 2026-04-16. Sub-Phase B (B62 Regime Taxonomy Redesign) CLOSED 2026-04-19 (RBS drift 0.00%, TFS+IE 46.19%, 174k MCE samples + 359 trades). Plan restructured 2026-04-19 after verification analysis. **Sub-Phase C (B63) IMPLEMENTATION COMPLETE 2026-04-21 — scope expanded 9 → 19 items, all code shipped across three stage commits:** `b0b8e39e` Stage 10A counter-trend LONG guards; `c3fe0712` Stage 10B+10C vwap_pullback strong-trend promotion + geometry override + mode-overlay lane bypass; `a4f5dbe0` Stage 16 global DBS persistent store + atomic snapshot + 20-pair floor. Counterfactual audit delivered (BATCH_63_COUNTERFACTUAL_AUDIT.md). B58a authority baseline verified intact via integrated B64-lite check (24/24 baseline rows match exactly). **B63 audits all CLOSED 2026-04-22:** Items 15/17/18/19 deliverables complete. Also landed 2026-04-22: `B63_STREAKINESS_ANALYSIS.md` (runs test z=−15.57, mechanism trace), `MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md` (8 canonical modules across 5D matrix), `EXTERNAL_DATA_ARCHITECTURE_PLACEMENT.md` (external data → extended MCE, not SQE), `BATCH_66_SCOPE.md` (3-sub-deploy recalibration plan). **Final B63 close blocker:** Item 13 decision gate at 2026-04-28. **Phase 15c IN PROGRESS** (post-audit implementation): **B64b CLOSED 2026-04-23** via commit `0a56d139` (PM2 #86) — canonical map sync + IE metrics description + Avg/Sum move % column rename + MAX_HOLD_MS safety-valve restoration. Scope-audit-implement-review-push-deploy-verify-governance-close workflow executed cleanly per CLAUDE.md §2. → B65 (TEC + asset_class + exchange schema, expanded per 2026-04-22 directive) → B66 (SQE recalibration) → B67 (external data Phase 1) → B68 (external data Phase 2) → B69-B70 (schema + archiving). **Post-live Modularization Phase** (new slot, 8-module extraction across 5D `(exchange, asset_class, filter, strategy, regime)` matrix) is precondition for Phase 21.5 asset class + new exchange expansion. Code freeze on regime/DBS LIFTED (B62). Full plan in `POST_B62_PRE_LAUNCH_PLAN.md` + `MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md` §V. |
| 16 | DB & Legacy Cleanup | — | PLANNED |
| 19 | Paper Mode Full Audit & Debug | — | PLANNED |
| 20 | Production Hardening | — | PLANNED |
| 21 | Live Mode Activation (Kraken real orders) | — | PLANNED |
| 21.5 | Exchange Expansion: XStocks + Perpetual Futures (Kraken) | — | PLANNED (post-live) |
| 17 | Machine Learning Design | — | PLANNED (post-live) |
| 18 | Machine Learning Implementation (ML Adaptive Intelligence Layer) | — | PLANNED (post-live) |
| 17.5 | Smart Thermostat / Rules-Based Predictive Execution (formerly Phase 15b) | — | PLANNED (post-live, deferred from pre-live 2026-04-14) |
| 22 | Publication & Monitoring | — | PLANNED (post-live) |
| 18 | Machine Learning Implementation | — | PLANNED (post-live) |
| 22 | Publication & Monitoring | — | PLANNED |

---

## Phase 12 — Cleanup & Foundation

### Purpose
Phase 12 was the disciplined post-audit cleanup program that turned DawnTrader from a contaminated hybrid of old and new systems into a governable codebase. It had three major themes: urgent math/security corrections, dead-code/legacy removal, and pipeline-unification work.

### 12.1 — Critical Math & Security Fixes
Phase 12.1 corrected foundational defects before deeper architecture changes began.

- **Batch 1 / 1B** fixed BUG-004 by restoring real geometric directional integrity instead of synthetic confidence-derived DI and then documented that fix in governance.
- **Batch 2 / 2B** resolved the dual-friction split-brain problem (RISK-009) by replacing flat friction shortcuts with the canonical round-trip cost model and then recording that fix across the governance stack.
- **Batch 3 / 3B** combined security hardening, simulated-price cleanup, and RiskManager comment/stub cleanup into a single multi-directive closure wave.

### 12.2 — Dead Code Purge
Phase 12.2 was the large legacy-removal campaign.

- **Batch 4 / 4B** removed NLAI.
- **Batches 5 through 7B** dismantled the Walter/Bob/Cortex cluster in stages: safe deletions first, then importer/frontend cleanup, then high-complexity surgery and hotfixes.
- **Batches 8 and 9** removed LATTi residuals, the orphaned DHMA strategy module, dead frontend pages, and the obsolete MarketScanner class.
- **Batches 10 and 11** cleaned dead Walter-era learning services, removed the old goal-alignment gate system, and removed deprecated friction functions.

This phase materially reduced the blast radius of later architecture work and created a cleaner foundation for MCE and Phase 14.x.

### 12.3 — Pipeline Unification
Phase 12.3 unified core decision authority.

- **Batch 12 / 12B** staged and documented the 17-strategy expansion specification.
- **Batch 13 / 13B** implemented regime authority resolution, confidence authority cleanup, and strategy-routing expansion so the trading pipeline was operating off one coherent control path instead of multiple competing authorities.

### Why Phase 12 Mattered
Without Phase 12, later work like MCE installation and dual-path scanning would have been built on top of contradictory math, obsolete services, and contaminated routing logic. Phase 12 was the cleanup-and-unification bridge that made Phase 13 and 14 possible.

---

## Phase 13 — MCE Installation + L12/L20 Removal

### Purpose
Phase 13 installed the Market Context Engine (MCE) as the centralized regime and indicator authority, while removing a large legacy cluster that had become redundant or misleading.

### Primary Batch
- **Batch 14**

### What Landed
- MCE became the central authority for market context rather than one participant among many competing engines.
- Legacy L12/L20 cluster files were removed.
- Strategy enum/state handling was expanded and aligned with the newer strategy architecture.
- Major consumers such as orchestration and simulation paths were rewired around the new context authority.

### Why It Mattered
Phase 13 was the architecture pivot that made the later dual-path and diagnostics work tractable. Once MCE became the clear source of truth for market context, it became possible to build more advanced filter/routing systems without compounding regime-authority drift.

---

## Phase 14 — VTS Real Calculations / DBS / Regime Transition

### Purpose
Phase 14 advanced the simulation and execution realism path. It pushed the system from broad cleanup into practical trading-pipeline refinement: real VTS calculations, regime-name/regime-model cleanup, DBS handling, and then later branching into the 14.1–14.6 sub-phases.

### Primary Batches
- **Batch 15**
- **HF6**
- **HF7**

### What Landed
- VTS real-calculation work began in earnest.
- Regime rename/cleanup work advanced and then required completion and recalibration through hotfixes.
- DBS was incorporated strongly enough that later governance treats Phase 14.2 as effectively complete/already implemented.

### Why It Split
Phase 14 proved too broad to remain a single undifferentiated phase. The work naturally branched into sub-phases such as 14.1 (VTS throughput / IMF / regime closure), 14.3 (short trading), 14.5 (dual-path pattern scanning), and 14.6 (X Stocks).

---

## Phase 14.1 — VTS Throughput, Regime, IMF, Column Fixes

### Purpose
Phase 14.1 closed the immediate operational gaps left after the initial Phase 14 work. This phase was about making the VTS path more usable, cleaning up residual regime issues, and finishing IMF/column/governance-gate work that surfaced once the first real-calculation wave landed.

### Primary Delivery Path
- **HF8** — VTS throughput fixes
- **HF9** — column fix, governance gate, DSS deletion, VTS IMF

### Supporting Scoped Batches
- **Batch 16** and **Batch 17** captured planned work that was later absorbed into HF8/HF9 rather than persisting as the final canonical delivery artifacts.

### Outcome
Phase 14.1 is treated as complete. Phase 14.1B was later eliminated as its own lane, with the relevant work absorbed into the hotfix path rather than preserved as a separate enduring phase.

---

## Phase 14.5 — Dual-Path Pattern Scanning + Merit-Based Ranking + Filter Diagnostics

### Overall Purpose
Transform DawnTrader from a single-path quant-first system into a dual-path architecture where both quantitative strategies and candlestick-pattern strategies can operate across the scanned universe. Replace arbitrary pair limiting with merit-based ranking, migrate filters toward DB-driven governance, and expose the filter/evaluation pipeline through diagnostics.

**Duration**: 2026-03-18 through 2026-03-22 (Batch 19 through Batch 19K GOV)

### 14.5.1 — Core Dual-Path Architecture (Batch 19)
- Dual-path pattern scanning introduced alongside the quant path.
- Merit-based rankingScore ordering replaced crude queue behavior.
- MCE global regime overlay and source-pool identity were added so downstream systems could distinguish path origin and context.

### 14.5.2 — Deferred/VTS Pattern-Pool Work (Batch 19C, Batch 19E)
- Deferred items from Batch 19 were completed.
- VTS pattern-pool persistence and frontend visibility were added, including sourcePool-aware state handling.
- Pattern-path visibility improved both in storage and in the UI.

### 14.5.3 — DB-Driven Filter Architecture Completion (Batch 19F + hotfixes)
- Filter architecture moved further into database-driven configuration.
- Hybrid confluence and ABCD-pattern work landed.
- Follow-up hotfixes repaired IMF/threshold/regime edge cases exposed by the architecture shift.

### 14.5.4 — 4-Path Filter Architecture (Batch 19G + hotfixes)
- FX5 began reading filter thresholds from the database instead of stale hardcoded constants.
- VTS deduplication and pattern-scanning visibility improved.
- The system moved toward a transparent 4-path filter model rather than mixed hidden logic.

### 14.5.5 — VN / DI Quantitative Cleanup (19G VN family + 19G DI)
- VN was revised to a log-returns MAD/median formulation.
- Thresholds were recalibrated from observed behavior.
- DI moved to a rolling 48-candle window to remain analytically useful.
- Deprecated VN/DI constants and hidden split-brain behavior were removed or reduced.

### 14.5.6 — Filter Diagnostics (19H, 19I, 19J)
- Batch 19H introduced the Filter Pipeline Diagnostics tab.
- Batch 19I added number formatting, faster refresh, and richer VTS evaluation metrics.
- Batch 19J changed VTS breakdown reporting from last-cycle-only to 24-hour rolling aggregation.

### 14.5.7 — Governance Overhaul (19H GOV, 19K GOV)
- Governance and workflow ownership were updated around the 14.5 delivery chain.
- CCPI was rewritten with a strong essentials section.
- `BATCH_CATALOG.md` and `PHASE_HISTORY.md` became new canonical governance docs.
- The old directives workflow was archived into `directives-archive/`.

### Outcome
Phase 14.5 is treated as fully complete in the current governance state. It is one of the most consequential architecture/program phases in DawnTrader because it fundamentally changed how pairs are filtered, ranked, evaluated, and explained.

---

## Phase 14.6 — Strategy-Family Filter Profiles + Diagnostics Data Truth (Batches 20-39)

### Purpose
Implement strategy-family-aware filtering, establish data truth in filter diagnostics, and deploy the family-qualified candidate identity model. Each strategy family gets IMF thresholds tuned to its market environment. Filter pipeline metrics become fully reconcilable.

### Included Batches
- **Batch 20** (2026-03-23) — Pre-implementation audit. Architecture B selected. DI threshold recalibration identified.
- **Batch 21** (2026-03-23) — Telemetry & Calibration Scaffolding.
- **Batch 22** (2026-03-23) — Architecture B Implementation. 4 family IMF filter paths.
- **Batch 22 HF-HF7** (2026-03-23) — Post-deployment hotfixes (7 total).
- **Batch 23** (2026-03-24) — DI Threshold Calibration + Null Reason Expansion.
- **Batch 23 HF** (2026-03-24) — Empirical DI recalibration (crypto DI distribution 3-20).
- **Batch 24** (2026-03-24) — Filter Diagnostics data truth + per-pool counter split.
- **Batch 25** (2026-03-25) — Counter reset + pattern null split + all rejection categories.
- **Batch 26** (2026-03-25) — Counter truth fixes (ADX guard, family filter, Net EV reorder).
- **Batch 27** (2026-03-26) — Counter fixes + investigation resolutions.
- **Batch 28** (2026-03-26) — Pattern-path DI threshold adjustment.
- **Batch 29** (2026-03-26) — UI layout + labeling fixes.
- **Batch 36** (2026-03-27) — Diagnostics correctness fixes (sourcePool on closedTradeRecord, DI aggregation).
- **Batch 37** (2026-03-27) — Source pool family-qualified identity model. Replaced generic `quant` with `quant-trend/reversal/breakout/oscillation`. 10 changes across 13 files. Reconciliation proof verified.
- **Batch 38** (2026-03-27) — 3-layer null taxonomy (Setup Nulls A-F, Routing/Path Failures, Post-Signal Rejections). Signals rejected counter fix.
- **Batch 39** (2026-03-27) — Pipeline Summary Table with counting basis labels. Family label polish.

### Key Architecture Decisions
- **Architecture B (brute-force fan-out)** over Architecture A (early MCE)
- **Family-qualified candidate identity** — `quant-trend`, `quant-reversal`, `quant-breakout`, `quant-oscillation` replace generic `quant`
- **Total quant survivors = sum of family survivors** (not deduplicated by symbol)
- **No hidden fallbacks** — explicit family filtering, CONFIG_MISSING error if family path absent
- **3-layer null taxonomy** — Setup Nulls (data/context), Routing/Path Failures, Post-Signal Rejections
- **Pipeline Summary Table** — full pipeline flow with counting basis labels at top of Filter Diagnostics

### Outcome
Phase 14.6 is COMPLETE. The system now has family-qualified candidate identity, reconcilable pipeline metrics, and transparent filter diagnostics. Next: Phase 15 (X Stocks + Perpetual Futures).

---

## Inter-Phase Work — API Budget Optimization + Repair Hotfixes

### Purpose
Between the large roadmap phases, DawnTrader went through a stabilization/optimization lane that cut API usage, repaired archive/routing issues, and improved deployment/governance discipline before the 14.5 mega-phase began.

### Included Batches
- **Batch 18 / 18B** — OHLC cache, priceCache migration, larger batch size, API budget reduction
- **HF10 / HF10B** — KrakenService property fix + governance
- **HF11B** — governance enforcement/consolidation
- **HF12 / HF12B** — regime archive catch-up + scheduler-status + governance
- **HF12C / HF12D** — route-path fix + governance / UI-debugging guidance

### Outcome
This inter-phase lane created the stable baseline that Phase 14.5 was built on.

---

## Pre-Governance History (Phases 1-11)

> **Reconstruction basis**: `bridge/canonical/` materials in the repo, especially `DawnTrader_Complete_Project_History.md`, `Phase_8_Implementation_History.md`, `Phase_9_Implementation_History.md`, `Phase_10_Implementation_History.md`, and `Phase_11_Implementation_History.md`.
>
> **Important**: These phases predate the current governance/batch-documentation system, so the summaries below are historical reconstructions rather than batch-level records.

### Phases 1-3 — Initial Platform Build + Walter Era
The earliest DawnTrader build established the core V1 trading platform: FX5 scanning, a 9-strategy engine, RTB queuing, paper-trading lifecycle, and a Stage-3 event-store style truth engine. During this same era, Walter was integrated as an OpenAI-backed AI sysadmin/advisory copilot with memory, intent, reasoning, and expert-corpus components.

### Phases 3-4 — Walter Sidelined, LATTi Created
Walter was removed from the real-time path because API latency, throttling, and cost made him unsuitable for live-loop decision support. LATTi/Lottie was then created as a local, embedded, passive-only telemetry/tuning layer, establishing the long-running split between offline strategic AI guidance and local runtime behavior.

### Phases 4-5 — Failed V2 Attempt
A full V2 rewrite was attempted and failed catastrophically. The historical record makes clear that this period damaged continuity rather than improving it, and it directly motivated the later restoration and rebuild discipline.

### Phases 5-7 — Restoration and Early Refactoring
After the failed V2 path, DawnTrader went through restoration and structured cleanup to recover the working V1 system. This was the bridge into the more explicitly documented Phase 8.x era.

### Phase 8 — Foundation Repairs, REB Restoration, End-to-End Pipeline Recovery
Phase 8’s stated mission was to fix and complete the paper-mode trading engine without Lottie active in the loop. The canonical Phase 8 history breaks the work into:

- **8.1** — accounting-model / FX5 output repairs
- **8.2** — passive-learning isolation
- **8.3** — scan-cadence repair
- **8.4** — breakdown-accuracy fixes
- **8.5** — batch-selection repair
- **8.6** — top-end rotation + UI integration
- **8.7** — reactivation of unused filters

A GitHub incident on **2025-11-20** erased roughly 10-14 days of work and triggered the **REB** (rebuild) program. The historical sequence then moved through:
- **REB 1.0-2.12F** — emergency restoration of lost functionality
- **8.8.1** — scanner-output audit
- **8.8.2** — signal-engine audit
- **8.8.3** — end-to-end trading-pipeline restoration

By the end of Phase 8.8.3, DawnTrader again had a functioning end-to-end scanner → signal → RTB → paper-trade pipeline.

### Phase 9 — Math Core Finalization
Phase 9’s mission was to finalize DawnTrader’s mathematical core and establish single sources of truth for quantitative calculations.

Key documented outcomes from the canonical Phase 9 history:
- **9.0-FP** — deprecated-file quarantine and foundation prep
- **9.1-9.5** — `SYSTEM_GUARDS` established as the central store for math constants and thresholds
- **9.6** — sim-to-live parity test suite created
- **9.7** — Guardrails v2 migration from dollar-based to percentage-based risk logic
- **9.8** — validation and legacy purge
- **9.9** — CWQI net expectancy and friction standardization

In practical terms, Phase 9 centralized scoring/risk constants, hardened parity between simulation and live math, and moved the system toward a more disciplined quantitative foundation.

### Phase 10 — Hybrid Alpha Pattern Engine & Trade Lifecycle Modernization
Phase 10’s mission was to build the **Hybrid Alpha Pattern Engine** and modernize the trade lifecycle for production readiness.

The canonical Phase 10 history records:
- **10.0-10.3** — hybrid integration of quant + pattern + ML-style inputs
- **10.4-10.6** — multi-timeframe expansion (1H / 15m / 5m cascade logic)
- **10.7** — adaptive scanning intelligence
- **10.8** — math-core harmonization
- **10.9** — trade-lifecycle modernization

This phase introduced ensemble/hybrid concepts, expanded multi-timeframe logic, and modernized execution-lifecycle handling — much of the conceptual groundwork that later evolved into the more heavily governed Phase 11-14 architecture.

### Phase 11 — Mathematical & Operational Hardening
Phase 11 is the richest pre-governance phase in the canonical bridge material. Its implementation history describes the phase as the hardening layer spanning metric consolidation through authority unification and legacy decommission.

Major directive families documented there:
- **11.0** — metric-engine consolidation and FinalScore as the canonical quality metric
- **11.1** — canonical regime-strategy mapping
- **11.2** — VTS modernization and regime-driven simulation
- **11.3** — adaptive scanning intelligence
- **11.4** — indicators and analytics hardening
- **11.5** — math / macro / regime synchronization
- **11.6** — data purge and ML reset
- **11.7** — regime archive and telemetry infrastructure
- **11.8 / 11.8C** — authority unification and legacy decommission

The Executive Summary for Phase 11 explicitly highlights:
- unified FinalScore replacing legacy CWQI/NGC/ProfitRate paths,
- canonical regime-strategy relationships,
- VTS modernization,
- adaptive scanning,
- regime archive infrastructure,
- authority unification,
- and decommissioning of legacy systems like LATTi / Goals ML / ARA / Strategy Presets.

This is the clearest precursor to the modern audited/governed DawnTrader architecture. The later 2026 roadmap’s “Phase 11 Finalization” language indicates that although major Phase 11 foundations were built, some parts of the finalization/authority framework remained unfinished when the Phase 12+ governance era began.

### Historical Significance of Phases 1-11
The pre-governance era established nearly all of DawnTrader’s core ambitions: high-volume scanning, strategy orchestration, paper-trading lifecycle, AI-adjacent advisory/tuning layers, hybrid-pattern experimentation, and authority/math unification. It also created much of the technical debt, legacy overlap, and split-brain behavior that Phases 12 through 14.5 later had to unwind, standardize, or formally retire.

---

## Current Historical Position

As of Batch 55 (2026-04-10):
- Phase 12 is complete.
- Phase 13 is complete.
- Phase 14.1 is complete.
- Phase 14.2 is treated as effectively complete.
- Phase 14.3 is deferred indefinitely.
- Phase 14.4 is canceled.
- Phase 14.5 is fully complete (Batches 19 through 19L).
- **Phase 14.6 is COMPLETE** (Batches 20-39).
- **Phase 14.7 is COMPLETE** (Batches 48-54: Filter Diagnostics, Strategy Calibration, Pattern Recognizer Optimization, Hardcoded Default Removal, ML Service).
- Migration (Batch 40) complete.
- Batches 41-47: Post-migration stabilization complete.
- **Running Issues: 37 RESOLVED, 1 DEFERRED, 0 OPEN.**
- **Batch 55 (2026-04-10):** Full Walter/CWQI/NGC purge — 116 files changed, 8261 lines removed. Completes Directive 12.2.3 (Walter legacy code) and UNIFY-002 (CWQI/NGC metric removal). quality_index.ts gutted to active signal metric helpers only. This is the final legacy code purge originally scoped under Phase 12 Directive 12.2.3 and UNIFY-002.
- **Batch 56 (2026-04-10):** CI Green — deleted 23 dead files, fixed 77 test failures, resolved 314 TS errors. All 4 CI checks green (TypeScript, Tests 821 pass, Build, Docker) for the first time in project history. Langston file-by-file importer audit approved all deletions.
- **Batch 57 (2026-04-10 to 2026-04-11):** Pattern-strategy mismatch fix + pool-split null reasons. Fixed pattern-strategy mismatch in both VTS and active trading path — each strategy now receives its matching pattern instead of the global best. Added quant/pattern pool-level breakdown to null reason tracking. Fixed adaptive-flow.ts THREE_SOLDIERS/MORNING_STAR canonicalization. "No Pattern Detected" dropped from 38% to negligible.
- **Batch 58a (2026-04-11):** Phase 11 Finalization — Adjustment Framework (11.8B-E) + Authority Baseline (11.8C). Created ADJUSTMENT_FRAMEWORK.md (three-tier governance, parameter hierarchy, per-parameter specs, evidence-gating with Live>Paper>VTS hierarchy). Created AUTHORITY_BASELINE.md + authority-baseline-v1.json (V1.0 snapshot: 24 screener_filters rows, 150+ strategy constants, shared config). Pre-audit: 26 system components mapped, 150+ params cataloged. Langston consensus (#723-730). **Phase 11 governance sub-batch — B58b (code implementation) follows.**
- **Batch 58b (2026-04-12):** Phase 11 code implementation — adjustment-registry.ts, authority-baseline.ts, audit logging, /api/filters-v2 log-only validation. Phase 11 CLOSED.
- **Batch 59 (2026-04-12):** Phase 15a — Predictive Learning UI Audit & Data Path Fixes. Fixed Regime Archive 0% win rate (vts-telemetry.ts field name mismatch + pnl double-scaling). Fixed Mapping Drift sync (hard-coded timestamp, added auto sync, MIN_SAMPLES 30→10). Added Predictive tab placeholder labels. Fixed ESM compatibility for sync-canonical-bridge.ts. Phase 15 split into B59 (data fixes) + B60 (Policy Engine). Langston + prior CC session reviews.
- **Next: Batch 60** (Phase 15b — Policy Engine / Smart Thermostat). Scope drafted, Langston approved with 5 recommendations. Starts after B59 Regime Archive verification.
- **Revised roadmap:** 11.8 → 15a (B59 data fixes) → 15b (B60 Policy Engine) → 16 (DB/Legacy) → 19 → 20 → 21 (go live) → XStocks/Perpetuals → ML Design → ML Implementation → Publication.

The system is now in a far more governable state than at any point in the pre-governance history.

### Migration (Batch 40, 2026-03-30)
**Replit to Hetzner + Supabase migration.** Not a numbered phase — a cross-cutting infrastructure change.
- Batch 40: Dockerfile, GitHub Actions CI/CD, nginx, PM2, .env template, deployment guide
- Database driver swap: Neon serverless to standard pg (Supabase PostgreSQL, Frankfurt)
- Replit Vite plugins removed, OpenAI imports disabled (legacy Walter code)
- Hetzner CPX22 staging server provisioned (188.245.193.8, Falkenstein)
- Full schema (182 tables) and data migrated from Neon to Supabase
- FX5 scanner operational on staging, VTS accumulating data
- Post-Replit workflow adopted (see POST_REPLIT_WORKFLOW.md)
- Replit frozen as of 2026-03-30 — no further updates
- Migration branch: `migration/aws-supabase`

### Phase 14.7: Filter Diagnostics & Strategy Calibration (Batches 48-54, 2026-04-04 to 2026-04-09)
**Filter pipeline diagnostics overhaul + full strategy audit + pattern recognizer optimization.**
- Batches 48-51: Pipeline visibility — VTS Signal Funnel, pair-pool counting, 24h rolling aggregates, null reason tracking
- Batch 52 (19 fixes): VTS boot circular dependency fixed, pair-pool N×N overcounting fixed, byStrategy counter double-counting fixed, cooldown removed, LQ=43, benchmark exclusion, UI reorganized
- Batch 53: 8 strategy threshold relaxations (Langston consensus), zero-duration trades entry guard, full 17-strategy audit, IMF fallback removal, Screeners UI fix
- Batch 54: Pattern recognizer relaxed for crypto (PINBAR, INSIDE_BAR, THREE_SOLDIERS, MORNING_STAR), DI threshold 12→10 for trend family, ai-analyst legacy service removed, ALL hardcoded filter defaults removed (60+ across 4 files, DB sole authority), ML service installed on staging
- **Outcome**: All 17 strategies audited. Pattern detection rate improved. Trend family gained 5 pairs. Dominant constraint is regime eligibility. 5 regime-map decisions deferred (Langston: insufficient evidence). Canonical regime-strategy map (Directive 11.7F) confirmed as SSOT. Running Issues fully cleared (37 resolved, 1 deferred, 0 open).

### Phase 15a-c: Predictive Learning Audit, DBS Integration, Strong-Trend Family, TEC (Batches 59-65, 2026-04-12 to 2026-04-25)

**Phase 15a (B59):** Predictive Learning UI audit. Regime Archive 0% WR fix. ESM compatibility fixes. Phase 15 split into 15a + 15b/c.

**Phase 15b (B60-B62):** DBS validation and regime-classifier restructuring. B60 absorbed into B61/B62 (Smart Thermostat / Policy Engine deferred to post-launch as Phase 17.5 — cannot tune adaptive policy on top of misclassified state). B61 8-deliverable DBS validation audit. B62 regime taxonomy redesign with DBS now first-class input — RBS drift contamination dropped from 70.2% to 0.00%, TFS+IE share normalized.

**Phase 15c (B63-B65):** Strong-trend family + TEC functional + adaptive-response framing.
- **B63** Strong Bull Trend strategy + DBS pre-filter routing + 19 audit items. Strong-trend lane mode-overlay bypass. Streakiness analysis (z=−15.57 runs test, mode-overlay dormancy flagged). **Closed 2026-04-25** — Item 13 vwap_pullback decision gate resolved BUILD_DEDICATED (57 trades / 21.1% WR / sumR -28.99 at 2.85× min sample; closed 3 days ahead of original 2026-04-28 gate after statistical certainty reached). Follow-on: B65.5 Strong Bull Pullback research-then-design.
- **B64a** Drift Dashboard tab shipped 2026-04-22. Closed-trade rolling-window metrics (regime shares, family flicker, RBS drift, DBS distribution).
- **B64b** Canonical map sync + MAX_HOLD_MS safety valve restoration (POSITIVE_INFINITY → 7 days).
- **B65.1** module_constants infrastructure (5-dim tunable-parameter table, most-specific-wins resolver, 60s cache). Schema additions (exchange + asset_class on 4 tables; baseCurrency NOT NULL). 4 TEC seed rows. New `scripts/db-migrate.ts` file-based runner replacing drizzle-kit push.
- **B65.2 functional** Trailing exits engaged end-to-end in VTS + paper. ATR-based two-stage latch (BE lock at 1×ATR, target-lock + moonbag at target hit for qualifying strategies). 4h duration cap, reserved-slots concurrency cap. Stop writeback. trade_mode populated across all 4 trade-row tables. Phase-11 percentage-trailing TEC deleted outright. EXECUTION_CONFIG live consumers migrated to module_constants. 11-scenario parity test green.
  - **HF1-HF3** series fixed DSE fallback, surfaced trailing engine state in the VTS Machine Learning UI (TEC State column on Open + Closed Simulated Trades, endpoint extensions for tradeMode/breakEvenLatched/targetLatched/engineStopPrice), distinguished break_even_stop from trailing_stop_hit (49 BE-lock exits at +$0.09 mean were being mislabeled as moonbag trails — now correctly badged "BE PROTECT"). PM2 #96 live.
- **Adaptive Market Response concept (2026-04-25):** Captured the multi-batch arc that started with B59 — VTS streaks are market-condition-driven, not strategy-quality-driven. Existing mode overlay (Directive 11.7S) is defensive-only skeleton; needs expansion to add offensive mode and richer detection signals. Concept document at `1-system-manual/ADAPTIVE_MARKET_RESPONSE_CONCEPT.md`. Conditional **Phase 19.5** inserted in roadmap, pending paper-trading observation results.

**Phase 15c outcome:** Trailing and break-even protection observably engaging on staging. Adaptive-response framework conceptually unified across docs.

**Phase 15c continuation 2026-04-25:** B65.4 ladder trailing model shipped (commits `37beb18c` + HF1 `4b958a6b` + governance `ce13705e` + `6e154b7a`). PM2 restart #97. Replaces pure-trail moonbag (one target latch event, HWM-based ratchet) with target-ratcheting ladder (each rung hit advances both stop and target by R-distance step). Combined with HWM dynamic trail kept as secondary floor. Backward-compat persistence migration verified live for in-flight trades.

**Phase 15c batch reorganization 2026-04-25 (Kyle directive):**
- **B65.3 declared MOOT** — original scope ("migrate paper metadata percentage-trailing onto ATR TEC") was found unnecessary because paper-execution-engine.ts no longer consumes the legacy `trailingStopPercent` exit path; B65.2 functional ship deleted that consumption. Only one comment-flagged residual `highWaterMark` write remains at trade-open (paper-execution-engine.ts:1929) for legacy dashboards. Live verification work folded into Phase 19.3.5.
- **B71 Drift Dashboard verified DONE** — closed via B64a (Apr 22 MVP) + B64b (Apr 23 column polish) + final live verification 2026-04-25. Original Item 7 of POST_B62_PRE_LAUNCH_PLAN closed.
- **B66 retired** — split into Phase 19.4 (SQE recalibration, conditional) + B70 (data archiving) + B71 (drift dashboard, now done). B66 number reserved with no work attached.
- **B65.5 NEW — Strong Bull Pullback research** — triggered by B63 Item 13 preliminary BUILD_DEDICATED verdict. Research-then-design (analyze 57-trade vwap_pullback failure cohort → hypothesis on filter/detector exclusion of bad entries while preserving 12 winners → backtest against historical OHLC → optional A/B build). Realistic 1-2 weeks. May renumber as B66.5 or B72 once scope formalized.
- **Phase 16 scope note added** — delete remaining trailing-percent code mentions/calls (paper-engine residual `highWaterMark` write + ABCD/SMA strategy detector internals + settings types + AUTHORITY_BASELINE references, conditional on whether ABCD/SMA strategies are themselves retired in Phase 16 cleanup).

Adaptive Market Response concept document `1-system-manual/ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` captures the multi-batch arc that started in B59. Roadmap commit `3e50eb9c` moved B66 SQE recalibration into Phase 19.4 (conditional on paper-mode evidence) and AMR into Phase 19.5 (conditional).

**Next pre-Phase-19 work (in order, updated 2026-04-28):** ⭐ **B67 coordinated regime overhaul** (5 sub-deliverables per `REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md`: macro confidence modifier + phase dimension + per-underlying limits + realized-outcome feedback + Path B sustainability) → B68 external data Phase 2 (conditional) → B69 schema/asset class → B70 data archiving → B72 comprehensive lever-to-`module_constants` sweep → **Phase 19 Paper Mode Audit** (Phase 19.0 VTS partition + Exchange-Data Adapter NEW 2026-04-26, then 19.1-19.3 plus 19.3.5 trailing-exit live verification, 19.4 SQE recalibration conditional, **19.4.5 Observational Decision Gate** with 8 items including ladder net contribution and low-volume-pair-from-moonbag deferral, 19.5 AMR conditional) → **Phase 16** (DB / legacy cleanup, including residual trailing-percent code purge).

**Phase 15c continuation 2026-04-28 (B65.4.1 hotfix verification + B65.4.2 observability columns + Master planning doc filed):**
- **B65.4.1 verification 2026-04-28** (`B65_4_1_HOTFIX_VERIFICATION_2026_04_28.md` + `B65_4_1_LADDER_TABLE_2026_04_28.md`): hotfix formula confirmed working on post-deploy clean cases (4 trades aggregate −3.98pp, ~break-even vs counterfactual). 17-trade total still net-negative (−59.89pp aggregate). Anomaly rows (8 of 17) concentrated on illiquid pairs where slippage swallows the buffer. Conclusion: hotfix is doing what it was designed to do; ladder is calibration on top of upstream entry-quality problem. Broader 7-day cohort (1,136 trades) net is **−$1,187** with 74% of exits at BE-stop / SL / trailing-stop — the dominant problem is upstream signal quality, B67 macro modifier is the priority lever.
- **B65.4.2 SHIPPED 2026-04-28** (commits `db7cbcfb` main + `e9abe8fd` HF1 for `decimal` vs `numeric` build error). PM2 restart #100. Ladder observability columns: TrailingState +3 fields (`originalStopPrice` captured at init, `latchTriggerPrice` captured at first target latch, `rungTargetHistory[]` appended at each ratchet) propagated through engine → evaluator → caller chain. New `paper_sim_trades` columns (`original_stop_price` decimal, `latch_trigger_price` decimal, `rung_target_history` jsonb). Migration `2026-04-28-b65-4-2-ladder-observability-columns.sql`. Both open + closed CSV exports + `/api/vts/ml/open` endpoint serializer include the fields. Folds in the original B65.4 punch-list item (open-trades API wiring). Backward-compat: `importStates` migration sets `rungTargetHistory: []` for pre-B65.4.2 persisted states.
- **Master planning doc filed 2026-04-27** at `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md`. Captures the full conversation between CC and Langston about external data integration, regime classifier improvements, and material-improvement levers. Key positions: Langston's confidence-modifier architecture (recommended over CC's original alongside-the-classifier approach), phase dimension EARLY/MATURE/LATE on existing 5 regimes (recommended over adding new top-level regimes), B67 expanded to 5 coordinated sub-deliverables (~3-4 weeks total), 12 decisions queued for Kyle in §11. Listed as ⭐ MUST READ on next session start in MEMORY.md. ML-light reliability score (Langston suggestion): logistic regression on classifier inputs + B67 macro features, ~2-3 days, viable as Phase 19.4 candidate.
- **NEW deferred decision (Kyle directive 2026-04-28):** exclude low-volume pairs from moonbag eligibility — tracked in `POST_AUDIT_ROADMAP.md` Phase 19.4.5 item 8. Decision deferred to allow observation data to accumulate.

**Phase 15c continuation 2026-04-26 (B65.4 closed + B65.6 closed via SKIP + Phase 19.4.5 inserted):**
- **B65.4 CLOSED 2026-04-26** with Langston Step-8 sign-off. First live ladder event 2026-04-26 02:11:59 UTC on 2Z/USD (rung=1, stop locked at cost-aware floor 0.0903, target advanced to 0.0944, TRAILING_TAKE mode). Engine verified via PM2 logs + `/tmp/trailing-states.json` persistence file. Punch-list: `/api/vts/ml/open` endpoint returns 0 trades — small follow-up batch / hotfix to wire it.
- **B65.6 CLOSED 2026-04-26 via SKIP** per Kyle directive. Per-pair regime classifier audit completed Phase A across 7 analysis tracks: telemetry candidates, OHLC candidates, hostile-day historical scan (5 hostile days identified, two distinct failure-mode patterns), clean-day falsification (confirmed winners-have-momentum is hostile-day-specific), global metrics analysis, classifier replay validation (B62 deployed 2026-04-16, 04-18 was already post-B62), Option C combined-rule sweep (rejected — 50-79% clean-day winner blocking at every threshold). No code change shipped. vwap_pullback stays in strong-trend lane. Path B unchanged. Findings paper at `Claude Comms and Packages/Scope Files/B65_6_FINDINGS_PAPER.md` is the canonical reference.
- **Phase 19.4.5 Observational Decision Gate inserted in roadmap.** Sits between SQE recalibration (19.4) and AMR (19.5). Uses 1-2 weeks of clean active-paper-trading data to decide which currently-post-live items (AMR / XStocks+Perp Futures / Modularization / ML) might need pre-launch moves based on observed evidence. References B65.6 findings paper directly. Reflects the workflow principle of preferring observation-stage decisions over interim pre-launch patches that AMR is likely to replace.

**Phase 15c continuation 2026-04-26 (B65.5 + B63 Item 13 reframe):**
- **B65.5 closed via SKIP route 2026-04-26.** Phase A0 (market-window control, Kyle directive 2026-04-26) returned decisive evidence that the B63 Item 13 cohort metrics reflect window-quality contamination, not strategy-quality failure. Sibling-strategy WR in same ±60min windows = 25.8% (vs cohort 27.0%); SBT lane-mate = 23.9%. Single catastrophic day 2026-04-22 contributed virtually all cohort net loss. Excluding 04-22, cohort outperforms lane-mate by ~10 points. Routing: SKIP A/B/C/D, defer to Phase 19.5 AMR. No code change. vwap_pullback stays in strong-trend lane unchanged.
- **B63 Item 13 verdict reframed as INCONCLUSIVE — INSUFFICIENT EVIDENCE** (provisional; original BUILD_DEDICATED closure stands as historical record). Methodology gap: pre-registered thresholds did not include sibling-strategy WR control. Reframe lands as 2026-04-26 addendum to BATCH_63_COMPLETION_REPORT.md §12.
- **Recurrence finding (Langston cc-inbox #821):** 04-22 is the SECOND instance in one week of the 04-18 streakiness pattern (both globalRegime=TFS while market disagreed catastrophically). Two recurring failure-mode events motivate Phase 19.5 AMR detection-layer build rather than per-strategy detector redesign.
- **New queued slot:** future TBD-numbered batch to re-evaluate Item 13 with cleaner cohort data + explicit window controls in the threshold definition. Earliest cleanly-comparable data is post-Phase-19 paper audit.
