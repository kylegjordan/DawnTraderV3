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
| 14.6 | Filter Diagnostics Data Truth + Family-Qualified Identity | Batches 20-39 (all deployed and verified) | COMPLETE |
| 15 | Strategy-family filter profiles / rules engine follow-on | — | PLANNED |
| 19-22 | Paper-mode audit, production hardening, live activation, publication | — | PLANNED |

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

As of Batch 39 (2026-03-27):
- Phase 12 is complete.
- Phase 13 is complete.
- Phase 14.1 is complete.
- Phase 14.2 is treated as effectively complete.
- Phase 14.3 is deferred indefinitely.
- Phase 14.4 is canceled.
- Phase 14.5 is fully complete (Batches 19 through 19L).
- **Phase 14.6 is COMPLETE** (Batches 20-39: Strategy-Family Filter Profiles, DI calibration, counter truth fixes, family-qualified identity model, 3-layer null taxonomy, pipeline summary table).
- Next: Phase 15 (X Stocks + Perpetual Futures), then Phase 11 Finalization.

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
