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
| **15b (NEW)** | **Regime / DBS / Strategy / Filter Restructure** — DBS validation, regime taxonomy redesign, Strong Bull Trend strategy + TEC activation, infrastructure consolidation, data archiving, drift dashboard | **B61, B62, B63, B64, B65, B66** | **LOCKED 2026-04-14 — IN PROGRESS.** Sub-Phase A (B61 DBS Validation) CLOSED 2026-04-16. Sub-Phase B (B62 Regime Taxonomy Redesign) CLOSED 2026-04-19 (RBS drift 0.00%, TFS+IE 46.19%, 174k MCE samples + 359 trades). Plan restructured 2026-04-19 after verification analysis. **Sub-Phase C (B63) IMPLEMENTATION COMPLETE 2026-04-21 — scope expanded 9 → 19 items, all code shipped across three stage commits:** `b0b8e39e` Stage 10A counter-trend LONG guards; `c3fe0712` Stage 10B+10C vwap_pullback strong-trend promotion + geometry override + mode-overlay lane bypass; `a4f5dbe0` Stage 16 global DBS persistent store + atomic snapshot + 20-pair floor. Counterfactual audit delivered (BATCH_63_COUNTERFACTUAL_AUDIT.md). B58a authority baseline verified intact via integrated B64-lite check (24/24 baseline rows match exactly). **B63 audits all CLOSED 2026-04-22:** Items 15/17/18/19 deliverables complete. Also landed 2026-04-22: `B63_STREAKINESS_ANALYSIS.md` (runs test z=−15.57, mechanism trace), `MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md` (8 canonical modules across 5D matrix), `EXTERNAL_DATA_ARCHITECTURE_PLACEMENT.md` (external data → extended MCE, not SQE), `BATCH_66_SCOPE.md` (3-sub-deploy recalibration plan). **Final B63 close blocker:** Item 13 decision gate at 2026-04-28. **Phase 15c IN PROGRESS** (post-audit implementation): **B64b CLOSED 2026-04-23** via commit `0a56d139` (PM2 #86) — canonical map sync + IE metrics description + Avg/Sum move % column rename + MAX_HOLD_MS safety-valve restoration. Scope-audit-implement-review-push-deploy-verify-governance-close workflow executed cleanly per CLAUDE.md §2. → B65 (TEC + asset_class + exchange schema, expanded per 2026-04-22 directive) → B66 (SQE recalibration) → B67 (external data Phase 1) → B68 (external data Phase 2) → B69-B70 (schema + archiving). **Phase 15c B67/B68 series — implementation track CLOSED 2026-05-03:** B67 implementation closed 2026-05-03 (8 sub-deliverables LIVE across B67.0/0.1/1/2/2.1/3/3.5/4/5-prep); B68.x chain modulator series CLOSED 2026-05-03 with B68.1 ship (commit `cb861176`, PM2 #135) — 7-modulator confidence chain fully live and observational. **B69 Asset Class as First-Class Schema Dimension SHIPPED 2026-05-03** (commit `18372159`, PM2 #137) — 8-entry taxonomy registry, exchange-first resolver, B74 archive rename+retag, schema extensions, UI badge. **B69 follow-ups 2026-05-04:** B69.1 (Asset Class column on Open + Closed Simulated Trades, refactored to badge below symbol per Kyle preference, PM2 #138, `ebe199b5`); B69.2 (b67_2 phase preference visibility fix in calibration aggregator — factor was firing correctly but shift collapsed to zero by construction; alt.confidence now stores with-factor value, PM2 #139, `1efb1599`); B69.3 (CoinGecko Demo API key + 429 backoff — fixes ~50% feed-drop rate from shared-IP rate limiting, PM2 #141, `c1b2f2b8`); B73.3 (F/J variant simulators rewritten — pre-fix all three of F/J/K routed through `replayPureSlTp` which ignored its allowBe/trailMultiplier params, producing identical results; new dedicated `replayNoBeWithTrailingTake` and `replayBeOnlyNoTrail` simulators ship distinct logic; K unchanged. Earlier "turn off BE-stop" recommendation walked back pending differentiated F/J data, PM2 #140, `17a35c50`). **B70 Unified Data Archiving SHIPPED 2026-05-04 → 2026-05-05** (commits `516140bc` → `3796ae56`, PM2 #142 → #145) — 5 partitioned archive tables under `server/services/data-archive/` with mode-agnostic capture (Kyle directive 2026-05-04 §M: every row carries `mode` from `getCurrentMode()` accessor + `source` per-hook hardcoded). Hot-path hooks try/catch wrapped, bounded-queue drop-OLDEST. Drift Dashboard `DataArchiveSection` panel live. **B70.1 follow-up SHIPPED 2026-05-05** (`977d3ff0`+`919e7015`+`7c1bfafd`+`3555f600`+`7e059186`) — VTS reject-stage hooks + B62 retroactive runner + JSONL tabular exporter + unit tests + System Manual appendix. **B70.2 SHIPPED 2026-05-05** (`5617ad72` + 3 hotfixes `03d704cb`/`f799f701`/`0423a2be`) — gap-fill 30+ trade fields in exit_decision state_snapshot + 25+ in admit features mirroring open/closed-trade CSV exports; storage-size display in dashboard panels (B70=52.4MB / B74=5.12GB live); regime-archiver writer deprecated (B70 supersedes); silent-failure bugs caught via PM2 log scan (rawSignal scope, trade.openedAt type, _modulatedConfChain scope, finalTradeMode scope — admit + exit hooks were non-functional from 2026-05-04 deploy until 2026-05-05 12:24 UTC fix series). **B70.3 SHIPPED 2026-05-05** (`decf5b80`) — Path B sustainability gate swap from `dbsSlope >= b68_5DbsSlopeMin` to `mom > b68_5PathBMomentumMin` (default 0.002) per Langston cc-inbox #901 review of 7-day calibration data showing -2.0pp predictive lift for the slope gate; `liquidity_trap` excluded from VTS iteration loop via UNIVERSALLY_DISABLED_STRATEGIES Set + active-path block removed (eliminates ~7,342 wasted evaluations/24h). **B70.3b 2026-05-05** (no code commit — module_constants UPDATE only) — post-composition floor dropped 0.45 → 0.20 per Langston cc-inbox #902 + Kyle approval. Pure visibility change (no consumer reads `regimeConfidenceModulated` until B67.5 wires it). Enables seeing the natural chain output distribution during the calibration window. **Phase 19.0.5 added 2026-05-05** — full data-capture coverage for paper-active path (FX5 pre-filter rejects + active-path SQE/RTB/TCL hooks + paper-engine admit hook) becomes a HARD precondition before Phase 19.1 paper-active starts. Master plan §5.4 lever inventory: 7 of 9 originally-planned levers SHIPPED + 2 bonus levers (B68.4 freshness, B68.3 pair correlation). Remaining: B67.5 consumer wiring (gated on B67.4 calibration check ~2026-05-15), B69 ML-light (deferred to end of pre-Phase-16 per Kyle directive), Phase 19.5 AMR concentration gate (post-Phase-16), External Data Phase 2 full (exchange flows / DXY / SPX / liquidations full — post-Phase-16 conditional on B67/B68 measurable lift). **Post-live Modularization Phase** (new slot, 8-module extraction across 5D `(exchange, asset_class, filter, strategy, regime)` matrix) is precondition for Phase 21.5 asset class + new exchange expansion. Code freeze on regime/DBS LIFTED (B62). Full plan in `POST_B62_PRE_LAUNCH_PLAN.md` + `MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md` §V. |
| **15c continuation** | **B78.2 Kraken WS v1→v2 format fix SHIPPED 2026-05-07** (commits `5c3ce00b3` + `5ec57cbd3`). Resolves RUNNING_ISSUES #76 (5-week-old Kraken WS v1-format ping rejection). Root cause: `{event:'ping'}` (v1) → `{method:'ping'}` (v2) at `kraken-websocket-adapter.ts:2767`. ~21s error cadence matched `PING_INACTIVITY_MS=20000`. Plus pre-emptive v1→v2 at L2292 (`subscribeToBookChannel`). Error stream STOPPED at deploy boundary. **"Subscribed Symbols: 0" reframed NOT-A-BUG** — empty positions table = no I8C subscribes by design; B78.1 wiring ready when positions open. Compressed workflow per Langston: Step-4 folded into Step-8; both APPROVED via watchdog (25-35s round-trips). | B78.2 | SHIPPED 2026-05-07 |
| **15c continuation** | **B78.1 Cycle break SHIPPED 2026-05-07** (commits `bcbea1896` + `ee7c8dc3e` + `fb9a58667`). EventEmitter inversion of `kraken-websocket-adapter ↔ live-pricing-adapter`; ws-adapter moved to `server/exchanges/kraken/`. Madge 47 → 46 cycles, #10 absent. Langston Step-1+2 APPROVED rev 2; Step-8 APPROVED to close. **NEW DISCOVERY filed as RUNNING_ISSUES #76:** kraken-websocket-adapter has been failing Kraken WS subscribe for 5 weeks pre-B78.1 (since 2026-04-03; 49K health-checks all 0 subscribed; 142K rejections); B78.2 owns the fix and must precede B79 Day 0 per Langston sequencing call. **NEW watchdog `langston-call`** (60s first-byte / 30s idle / 5 max attempts) auto-retries hung CC↔Langston SSH calls; brought Step-8 review from 22-min hang → 35-sec success. | B78.1 | SHIPPED 2026-05-07 |
| **15c continuation** | **B78 Modularization Phase SHIPPED 2026-05-07** (commits `e814461d6` + `57220ab4b` hotfix). First batch in B78–B81 Multi-Asset VTS Expansion stretch (per `MULTI_ASSET_VTS_EXPANSION_PLAN.md`). Pure file/import refactor + one aggregator-query scope filter; zero behavioral change on `asset_class='crypto_spot'`. Created `server/asset_classes/{crypto_spot,crypto_perp,xstock_spot}/` and `server/exchanges/kraken/` module scaffolding. Moved 3 kraken files + pattern-filter-profile to new locations (rename: `pattern-pool-filters.ts`). Extracted regime-classifier branch-condition constants to `server/asset_classes/crypto_spot/regime-thresholds.ts` (leaf module, no imports allowed; formula anchors preserved inline per pre-audit trap table). Added `AND asset_class='crypto_spot'` to `drift-dashboard-aggregator.ts` `computeFactorCalibration` query L1054 — locks calibration cohort to crypto_spot regardless of B79+ data. Madge HARD GATE green: 47 cycles → 47 cycles, no new cross-package cycles. **Deferred per Langston rev 1 review:** ws-adapter move (bidirectional cycle with live-pricing-adapter; gets own batch); friction extraction (cost-model.ts is exchange-keyed; defer to B79/B80 when multi-asset shape becomes real). 4-round Langston review (rev 1 6 REVISE items, rev 2 propagation, rev 3 line 69, APPROVED rev 4); Step-4 code review APPROVED. Hotfix needed because pre-flight grep pattern missed 23 intra-services callers. Test failures unchanged (59/995/5/1059). **Enables B79 (xstock_spot)** to populate asset-class scaffolds. | B78 | SHIPPED 2026-05-07 |
| **15c continuation** | **B77 `isBreakEvenTriggered` no-op fix SHIPPED 2026-05-07.** Closes RUNNING_ISSUES #71 (constant `break_even_trigger_r` plumbed but hardcoded `gain >= ATR` since B65.1). Threads multiplier explicitly through `isBreakEvenTriggered(currentPrice, entryPrice, ATR, breakEvenTriggerR=1.0)`. Single live caller updated. Default 1.0 preserves pre-B77 behavior. Variant K keeps BE off in production. 3 new unit tests + 1 back-compat assertion. Zero behavioral change at current settings. No DB migration. | B77 | SHIPPED 2026-05-07 |
| **15c continuation** | **B76 Chain-Final Calibration Framework Refactor SHIPPED 2026-05-06** (commit `235237ffd`). Closes RUNNING_ISSUES #54 (calibration aggregator shift metric structurally not measuring per-factor effect). Two-pass stash-then-build pattern in both orchestrator emit paths — at each factor's fire point pushes `FactorAlternateInput` discriminated-union record onto a stash; after final post-floor clamp, `buildAllAlternates(stash, chainFinal, regimeLabel)` dispatches to existing `buildXAlternate` helpers. `realDecision.confidence` now persisted as chain-final (raw preserved at metadata.predictiveConfidenceRaw). Every row stamped `realDecision.metadata.calibrationFrameworkVersion = 'b76_chain_final'`. Drift-dashboard-aggregator: removed two `factor_name NOT IN (...)` filters; `computeFactorCalibration` now version-filters b67_1_*/b67_2_* to chain-final cohort only. NEW `factor-ablation-builders.ts` dispatcher with TS exhaustiveness check. NEW `buildB67_2Alternate` extracted from inline blocks. Zero formula/weight/threshold change. No DB migration. **Enables trustworthy per-factor predictive lift before B67.5 consumer wiring window opens 2026-05-15.** | B76 | SHIPPED 2026-05-06 |
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

**Phase 15c continuation 2026-04-29 (Pre-calibration-window fixes LIVE — PM2 #105 → #112):**
- **Per-input ablation split** (commit `ed9a1a08`). Single `b67_1_macro_modifier` row replaced with three per-input rows (`b67_1_btc_dominance` / `b67_1_funding_rates` / `b67_1_mcap_momentum`). Each independently attributable on the dashboard. Per-input metadata: counterfactual_modifier_value, input_z_score, input_weight. `b67_2_phase_dimension` renamed `b67_2_phase_preference` for clarity. Pre-split rows preserved in DB but frozen — dashboard shows both legacy + new factor names side-by-side; the legacy rows won't grow further.
- **Final fallback cleanup** (commit `cab55804`). 7 `??` config-read fallbacks → throw on missing constant; `readConst<T>(name, fallback)` → `readConstStrict<T>(name)`; `pollIntervalSec` default removed; `calculatePairRegime(macroModifier=1.0)` default arg removed (parameter required, all callers updated incl. getDynamicRegimeScore + diagnostic-11.4G + vts-modernization test); `?? 1.0` at MCE consumer site → throws on cold-start race; `b67_1_enabled` shadow flag removed entirely; BTC/ETH 0.6/0.4 funding weighting promoted from hardcode to module_constants (`b67_1_funding_btc_weight` / `b67_1_funding_eth_weight`). Cold-start warmup fallback (modifier=1.0 + fallbackActive=true when rolling baseline below 48 samples) STAYS — it's a legitimate runtime state with explicit telemetry, not silent substitution.
- **B67.3 ACTIVATION** (commit `c1b314ad` + DB flip). `pair_id_hash` trade-open persistence wired into paper-execution-engine via `assignCohortHash()`; `b67_3_enabled=true` flipped via SQL UPDATE. Per-underlying cap is now actively rejecting cohort-0 signals when 2+ trades are open on same base. Cohort 1 is uncapped control. 14-day cohort A/B observation began 2026-04-29.
- **B67.2.1 — Trade record observability** (commits `141ec3c3` + `41abd541` + `575dbca4`). New schema migration adds 6 nullable columns to paper_sim_trades: regime_confidence_raw, macro_modifier_value, phase, phase_age_seconds, strategy_phase_weight, regime_confidence_modulated. Active-trading path captures these in `createPaperSimTrade` call site. VTS path extends `OpenVirtualTrade` with same fields + `pairIdHash`, captures at trade-open from MCE cached context, propagates through `persistRealPriceTrade` to JSONL log. UI: regime confidence + phase badge displayed in SAME column as regime label on open + closed trade tables (per Kyle directive). CSV exports include all 7 new columns automatically (CSV generator uses Object.keys). Pre-B67.2.1 trades render with null fields = empty cells, backward-compat preserved.
- **Replay logic + cron** (commits `3d1a1e7f` + `5e1031a6` + `33df2380`). `replay-ablation.ts` script fully implemented (was stubbed). VTS JSONL outcome reader builds in-memory index of closed trades from `logs/virtual_trades/YYYY-MM-DD.json` over 14d window, joins to pending ablation rows by `vts_trade_id`. Active-path query implemented (no rows match today since active trading is OFF and paper_sim_trades has 0 rows — when active trading turns back on the join becomes hot). Per-pass bound 5000 rows. Real bug found mid-implementation: `vts_trade_id` on ablation rows = signal.id (`vsig_p10_*` format) but JSONL `trade.signal.id` was a NEW random `vs_*` id created inside persistRealPriceTrade — they never matched. Fixed by threading the original signal id through `persistRealPriceTrade` as new `originalSignalId` field. Trades opened post `33df2380` deploy carry matching ids; pre-fix pending rows (562 at deploy time) won't match and naturally age out via 90-day retention sweep. **Nightly cron scheduled at 04:00 UTC** in root crontab — runs `npm run b67:replay-ablation`, logs to `/var/log/dawntrader/replay-ablation.log`. First production run scheduled for 2026-04-30 04:00 UTC.
- **Calibration window status:** NOT YET STARTED. Pre-window fixes 1-6 done; only step 7 (B67.4 cheap-tier bundle) remains before window can start. Per Kyle directive 2026-04-29 the window starts AFTER cheap-tier deploys + post-deploy verification confirms all 5 factors emitting ablation rows correctly. Subsequent B68 batches get their own mini-windows. Reference master plan §0.11.

**Phase 15c follow-up sub-batch 2026-04-30 night (B74.1 — equity-perp OHLC fix + xStocks universe expansion + Monitor panel v1+v2):**

- **Triggered** by Kyle directive 2026-04-30 night for autonomous overnight scope: fix RUNNING_ISSUES #41 (perp OHLC at 0 rows), expand xStocks beyond v1's 38-symbol starter, ship monitoring UI panel.
- **Equity-perp OHLC fix (RESOLVED):** Diagnosed Kraken Futures WS has no candle/kline subscription feed. Earlier `feed: 'candles_trade_1m'` was a non-existent feed name. Fix: dual-path archiver — WS for ticker only, REST polling at `/api/charts/v1/trade/<sym>/1m` every 60s with per-symbol last-seen-interval dedup. Initial poll backfills 2000 1-min candles per symbol (~5.5 days history).
- **xStocks universe expansion 38 → 245:** WS subscription probe of ~520 candidate equity tickers via throttled (30ms/req) `wss://ws-equities.kraken.com` subscriptions. 245 accepted (Kraken Pro UI shows 128; overshoot intentional, harmless). Static config updated with full set.
- **Monitor panel v1+v2 combined:** Per-archiver `getEquitySpotStats()` / `getEquityPerpStats()` / `getCryptoSpotStats()` exports + cumulative scanned counters. New `computePassiveArchiveStatus()` aggregator + `GET /api/analytics/passive-archive-status` endpoint + `PassiveArchiveSection` UI panel showing per-universe configured / active-in-window / OHLC stored+scanned / ticker stored+scanned / store-fraction / status badge. Drift detection via stored÷scanned ratio.
- **One hotfix during verification:** initial 20,000-row REST backfill exceeded Postgres 65,535-parameter bind limit. Drizzle doesn't auto-chunk. Added CHUNK_SIZE=1000 in both ohlc-batch-writer and ticker-batch-writer. BUG-2026-04-30-J logged.
- **Langston Step-4 approved** cc-inbox #874 with two design decisions: keep universe overshoot (Q1) and keep pre-write counter increment for drift semantic (Q2).
- **Verified post-deploy:** all 6 tables active with monitor panel returning structured data. equity_perp transitioned from 0 to 20,030 OHLC rows / 10 syms. xStocks active count 261 of 265 configured.

**Phase 15c parallel batch 2026-04-30 night (B74 Passive OHLC Archive Pipeline SHIPPED — equity + crypto data substrate accumulating):**

- **Triggered** by Kyle directive 2026-04-29 + extended 2026-04-30 — accumulate finer-grained OHLC + ticker substrate NOW so Phase 21.5 (equity expansion) and B68.1 (crypto multi-timeframe) have weeks-to-months of historical context when their work begins.
- **Three universes shipped:** 38 xStocks via `wss://ws-equities.kraken.com` (target 128, v1 starter); 10 PF_*XUSD perps via Kraken Futures WS; ~380 USD/USDT/USDC crypto pairs ≥ $10k 24h volume via Kraken WS v2 with hash-mod sharding (180/201 across 2 connections post-fix).
- **Six month-partitioned tables** with 12 forward partitions × 6 = 72 pre-created. Self-describing rows with `metadata.schema_version=1` for B70 cold-storage forward-compat. NO FK constraints into B74 → cold-archivable standalone.
- **Symbol canonicalizer extended** for `PF_*XUSD` → `<TICKER>/USD:PERP` per Langston cc-inbox #867 Q1.
- **DB pool isolation** via wrapper-layer counting semaphore (max 2 concurrent inserts per writer × 2 writer types = 4 max) — does NOT touch Drizzle pool config.
- **5-second batch flush windows** with try/catch error logging on insert failures.
- **Auto-reconnect** with exponential backoff capped at 30s.
- **Bootstrap LAST** in startup sequence (lazy-load 1.5s after server.listen) — passive archive non-critical, cannot block app startup.
- **7 module_constants** in new `passive_archive` module (3 kill-switches + 4 tuning knobs).
- **2 new crons** — daily 03:00 UTC universe refresh + monthly 28th 02:00 UTC partition pre-creation.
- **Three production hotfixes during same-day deploy:** (a) `import.meta.url` config path didn't survive esbuild bundle to dist/index.js → switched to `process.cwd()`-based path. (b) Migration off-by-one: pre-created partitions spanned 2026-05 → 2027-04 but deploy was 2026-04-30, so all inserts failed until UTC midnight; bootstrap now self-heals current-month partition with WARN log if missing. (c) FNV-1a hash low-bit bias on similar-suffix strings produced 364/16 crypto sharding — added Murmur3 fmix32 finalizer; rebalanced to 180/201.
- **Verified post-deploy** within 6 minutes: equity_spot 161 OHLC + 1,418 ticker, crypto_spot 4,008 OHLC + 824 ticker, equity_spot_ticker 38/38 syms, equity_perp_ticker 10/10 syms, crypto 373/380 syms.
- **One backlog item**: `equity_perp_ohlc_1m` at 0 rows. Subscription feed name `candles_trade_1m` may not be correct Kraken Futures feed. Ticker stream covers asset class for v1 (more granular for most analysis); OHLC backfill possible in v2. Logged in RUNNING_ISSUES.
- **NO signal-pipeline / FX5 / VTS / B73 impact** — verified via SIM walk in pre-audit §A.3.
- **Langston-approved Steps 1/2/4/8** (cc-inbox #867 / #869 / #870 / #873). Step 11 completion report next.

**Phase 15c follow-up sub-batch 2026-04-30 afternoon (B73.2 + Factor Calibration UI panel SHIPPED — variant-collapse fix + actual predictive analysis surface):**

- **Triggered** by Kyle observation 2026-04-30 afternoon that B73.1 morning fix shipped clean but ALL variants STILL collapsed to identical rows on every closed trade. Direct Kraken OHLC pull on AIXBT/USD diagnosis trade: max bar high was +0.5% above entry, BE trigger threshold (entry + 1×ATR_proxy) was at +5.9% — no bar's high ever crossed the trigger, so no variant fired any level. Yet live trade DID latch BE — meaning live TEC saw sub-minute price movement that 1-min OHLC bars don't expose.
- **Diagnosis** (Langston cc-inbox #866): TWO separate problems requiring TWO separate fixes. Q1 (headline "does live BE-stop convert TPs to BEs?") needs extended OHLC window past actualExit so Variants F/K can see post-exit reality. Q2 (variant parameter comparison) needs trigger thresholds consistent with bar-resolution data — bar-derived ATR.
- **Implementation** (`a98ce7ff`, PM2 #119): (a) Bar-derived ATR — recompute from 14 1-min bars BEFORE entry as 14-period TR average. Variant trigger thresholds use this in place of `atrAtOpen` proxy. Trade-off acknowledged: replay ATR ≠ live ATR; framework answers "what would variant X have done with bar-resolution thresholds" not "in live world." (b) Extended OHLC window from `exitTime + 1h` to `entryTime + maxHoldMs` (7d) regardless of actual exit. Pagination enabled (10080 candle cap, 14 batches × 720 candles, 500ms delay). Async fire-and-forget so the 7s pagination doesn't block trade-close persistence. (c) Both `atr_live` and `atr_bar_derived` logged in metadata of every B73 variant row for diagnostic validation. Wiped 180 useless inherited-only B73 rows from B73.1 window.
- **Plus Factor Calibration UI panel** — Kyle observation that pre-B67.5 the Factor Ablation Comparison panel was decoratively dead (all 4 factors with identical zero-counts because no consumer gates on confidence pre-B67.5). The underlying confidence-shift data IS captured per signal in `regime_factor_alternates.alternateDecision.confidence` — was just never surfaced. New `computeFactorCalibration()` aggregator + `GET /api/analytics/factor-calibration` endpoint + `FactorCalibrationSection` rendered above existing substrate panel. Two sub-views per factor: (1) Confidence-shift distribution (avg / max abs |REAL−ALT|, % at zero) shows whether each lever moves the confidence number; (2) Tertile WR + predictive lift = REAL spread − ALT spread shows whether high-confidence trades win more, AND whether each factor adds predictive value vs. the without-factor scenario. **Decision-grade gate n ≥ 150 per bucket per factor** per Langston cc-inbox #856 calibration check threshold. Existing Factor Ablation Comparison panel marked SUBSTRATE with explanatory pre-B67.5 note pointing readers to the new panel; stays in UI per Kyle directive 2026-04-30 afternoon (will be useful post-B67.5 + provides "data is flowing" sanity check).
- **Decision logic for the 14d window** now answerable mid-window: lift > +7pp with n ≥ 50/bucket and monotonic WR ordering = ship factor early; lift solidly negative with n ≥ 50/bucket = drop factor early. Panel updates every minute.

**Phase 15c hotfix sub-batch 2026-04-30 morning (B73.1 + B67.0.1 Ablation Tables Fixes SHIPPED — both panels now decision-grade):**

- **Triggered** by Kyle observation 2026-04-30: Factor Ablation Comparison stuck at 0/1183 replayed; Exit-Strategy Ablation showed 11/12 variants identical across 39 trades (only H trailing fired 2 of 39).
- **Diagnosis** — B67.0 ID mismatch (vts-runner emit signal.id=`vsig_p10_*` vs JSONL signal.id=`vts_<sym>_<strat>_<ts>`); B73 three structural issues (ATR proxy `(target-entry)/1.5` mis-scaling BE triggers, TIMEOUT synthesizing identical last-bar mid, Variant A re-simulating instead of being live truth).
- **Langston Q1-Q4 approved** cc-inbox #864 — natural-key join (symbol, evaluated_at±60s, strategy); real ATR plumbed; Variant A copies realized; TIMEOUT inherits realized; wipe pre-fix bad rows.
- **Implementation** (`3afd8ed2`, PM2 #117): ADD COLUMN `regime_factor_alternates.strategy` + composite index; updated `factor-ablation-emitter` signature + both call sites; rewrote `buildVtsTradeIndex` to key by `(symbol|strategy)` with `findVtsTradeByNaturalKey` ±60s tolerance; threaded `atrAtOpen` through `vts-service.persistRealPriceTrade` to B73 hook; added `actualExit*` + `actualPnlPct` to ReplayContext; new `mkVariantAFromRealized` returns realized values for A; `timeoutExit` inherits realized for non-firing variants; tests rewritten for new semantics. Wiped 480 bad B73 rows + 1477 NULL-strategy B67.0 rows.
- **Aggregator alignment hotfix** (`f6a0bb87` then `67cf66d9` for backtick-in-template build error, PM2 #118): drift-dashboard-aggregator was querying `replay_outcome->>'notes' = 'admit_admit_no_delta'` but emitter writes `'pre_b67_5_both_admit'`; UI showed 0 counts even when replay populated rows. Aligned to actual emitter shape (`outcome` not `alternateOutcome`, `pre_b67_5_both_admit` not `admit_admit_no_delta`).
- **Verified end-to-end post-deploy:** ad-hoc `npm run b67:replay-ablation` matched 4 rows (FLOW/USD strong_bull_trend close), API returns `bothAdmit=1 replayed=1` per factor; B73 first post-fix close populated 12 properly-differentiated rows (A=`source: realized_truth`, B-L=`source: realized_inherited` with metadata explaining why each didn't fire — `be_latched: false`, `trail_active: false`, `phase: pre`).
- **720-bar OHLC cap** flagged by Langston Q4 as v2 watchpoint — not blocking (max TIMEOUT duration was 283 min on pre-fix data, well under 12h).
- **Combined sub-batch nests inside B67 + B73** parents — no new scope file (uses Langston cc-inbox #864 as design ack).

**Phase 15c parallel batch 2026-04-29 night (B73 Exit-Strategy Ablation Framework SHIPPED — full stack same-day):**

**Same-day same-night ship cycle:**
- **Data layer** (`a747b646`, PM2 #115) — migration + replay service + VTS hook
- **Governance pass** (`778a1fe9`) — BATCH_CATALOG + PHASE_HISTORY + SIM + CHANGES_AND_FIXES + MEMORY + progress report
- **API endpoint + UI panel** (`a4bd0e6c`, PM2 #116) — `GET /api/analytics/exit-strategy-ablation` returning per-variant Sharpe-like scores. New `ExitStrategyAblationSection` rendered under Analytics → Drift Dashboard tab. Variants sorted by Δ vs A baseline (descending). Sharpe color-coded (>1.0 emerald, <-0.5 red). Per-regime filter dropdown (All / TFS / HVU / RBS / IE / ST). READY vs ACCUMULATING badge based on `n >= min_n_total` (or `min_n_per_regime` when filtered). Empty-state panel until first VTS close.
- **Unit tests** (`49c711d2` initial + `f53b9d60` float-precision assertion fixes). Test coverage: INSUFFICIENT_DATA path; Variant A (TP-direct, BE-retrace, SL-no-latch, TIMEOUT); Variant F (TP after retrace = "leaves money on table" scenario); Variant B (BE+pad exits at 101 vs A's 100); Variant C (no latch on 1×ATR, only on 1.5×ATR); Variant E (vol-conditional A→F switch); Trailing state machine G/H/I (activation, peak update, trail level computation, tighter exits earlier than baseline, looser exits later); Variant J (no trail; hits target through volatility); Variant L combined (phase transitions pre→be_latched→trailing); SELL direction (inverted checks); gap-bar edge case (target wins per Langston cc-inbox #863); return shape (12 variants in correct order with correct names). CI run `25136181772` Test Suite/Build/Docker green; TS Check pre-existing legacy baseline.

**Original B73 data-layer entry:**
- **B73 SHIPPED 2026-04-29** (commit `a747b646`, PM2 restart #115). Observation-only ablation framework that records what 12 BE-stop / trailing-stop variants WOULD have done on every closed VTS trade. Triggered by Kyle's 7d closed-trades review showing 509 BE_STOP (44%) vs 22 TP (2%); long winning streaks gone. Counterfactual analysis on n=87 trades with `originalStopPrice` populated showed 18.4% would have hit TP first (avg +9%) without BE-stop, but n too small to act on alone. B73 builds the multi-week observation framework. **What ships in this commit (data layer):** new `exit_strategy_alternates` table (parallel to B67.0's `regime_factor_alternates`), `exit-strategy-replay.ts` (12 variant evaluators with simplified trailing state machine), `exit-strategy-replay-service.ts` (orchestrator: 1-min OHLC fetch + bulk-insert; async fire-and-forget), `vts-service.persistRealPriceTrade` hook. 13 module_constants in new `exit_strategy_replay` module. Variant A baseline anchors on `b73_baseline_*` snapshot constants (NOT live `trailing_exit`) so paired-diff Sharpe stays valid across TEC tuning. Sharpe-like selection metric pre-registered. n=200 total + n=50 per-regime minimum for declaring a winner. Zero contamination with B67 calibration window (exits unchanged). Paper-execution-engine hook intentionally NOT wired (active trading OFF; B67 symmetry). **Tomorrow follow-up:** API endpoint + UI panel + unit tests. v2: real ATR plumbing, b73_variant_l_target_lock_r module_constant, gap_bar metadata flag. Langston-approved Steps 1/2/4 cc-inbox #861/#862/#863. Variants: A baseline / B ATR-padded BE+ / C higher BE trigger / D trailing instead of BE / E vol-conditional skip / F NO BE / G baseline trailing / H tighter trail / I looser trail / J no trailing / K NO BE + NO trail / L BE+pad and looser trail.
- **Calibration window unaffected.** B73 runs in parallel with B67 calibration; observation surface only.

**Phase 15c continuation 2026-05-06 (B75 Data Lifecycle / Tiered Storage SHIPPED — never-drop-data architecture):**
- **B75 SHIPPED 2026-05-06** (single commit `f4e6a73f6`, PM2 #172). Tiered hot/warm/cold storage architecture per Kyle directive ("we don't ever drop data"). HOT=Supabase disk (30d ticker / 365d OHLC / 14d ctx-bridge). WARM=Supabase Storage JSONL.gz (~6× cheaper, sec latency, 365d retention). COLD=Backblaze B2 JSONL.gz (~125× cheaper than disk, indefinite, never deleted). 5y full-fidelity B74 in cold ≈ $2.55/mo. **Originally drafted as B73; renumbered to B75 in Step 2** after pre-audit grep found B73 was already shipped 2026-04-29 (Exit-Strategy Ablation Framework + B73.1/.2/.3 + 5 source files). Components: `data_archive_manifest` table with state machine (pending→uploaded→verified→active→migrating→migrated) for crash-recovery + idempotency; `data_lifecycle` module_constants (18 rows); `database_monitor` module (3 rows: plan_cap_mb=204800 against 200 GB Supabase Pro cap, stable across disk auto-expansions per Langston rec); `b75-retention-sweep.ts` (cron 02:15 UTC export-then-drop fence with REPEATABLE READ snapshot + post-upload re-read checksum verify + min/max_ts verify); `context-bridge-log-ttl.ts` (cron 02:30 UTC export-then-DELETE rounded to month-start so partial-month rows never deleted, plus tail VACUUM); `b75-rehydrate.ts` CLI (manifest-driven analytics restore); `b75-cold-rotator.ts` (cron 03:00 UTC monthly, dry-run until B2 creds land); `storage-client.ts` (native Node fetch wrapper, zero new npm deps per Kyle's GDrive-EBADF directive, 45 MB upload-size guard); `database-monitor.ts` parameterized — **alarm transitioned CRITICAL (88.7% / 10 GiB stale) → NORMAL (5.2% / 200 GB plan cap)** verified live in PM2 #172 logs; `b70-b62-relabel-runner.ts` header guard added (Langston Step-2 F4 ask). Pre-deploy SQL migration validated against staging via BEGIN/ROLLBACK. Production migration applied cleanly: 18 + 3 + 0 rows confirmed. **Pending external (non-blocking):** SUPABASE_SERVICE_ROLE_KEY in staging .env (Kyle action — needed for sweeps to run); Backblaze B2 account (Kyle action — cold rotator stays dry-run until). Warm tier ships independently. **Deferred to B75.x:** keyset pagination perf upgrade (LIMIT/OFFSET acceptable for first sweeps; becomes O(N²) for B74 ticker partitions ~10M rows expected late June); multipart upload for >45MB warm objects; partitioning of `context_bridge_log` (B75.1); partitioning of `execution_attempt_audit` + `walter_memory` (B75.2); Phase 2 cold-rotator wiring + B70 knob migration into `data_lifecycle`. Langston Steps 1 rev1+rev2, 2, 4 reviews — B1 (drop updated_at) + B2 (round delete cutoff to month-start) fixes applied pre-push. **First batch end-to-end on the new Langston-on-Claude-Code bridge architecture** (post-OpenClaw-decommission 2026-05-06 morning); bridges proven; SDK session-lock contention discovered + workaround documented. CI: Build+Docker GREEN; TS Check + Test Suite legacy baseline (zero B75 file refs). Deploy after Test+Build+Docker per Kyle directive. Completion report `BATCH_75_COMPLETION_REPORT.md`. **Phase 15c next slot:** Phase 16 (TS errors + storage.ts modularization) per POST_AUDIT_ROADMAP.

**Phase 15c continuation 2026-05-06 (B72.2 in-class quant strategy lever migration SHIPPED — closes gap missed by B72 main and reinforced by B72.1 wrong §13.1):**
- **B72.2 SHIPPED 2026-05-06** (Slice 1 SQL `eeabb7147` + Slices 2-5 wiring `6c42dc370`, PM2 #171). Closes the audit gap: live universe is **18 canonical strategies** (`STRATEGY_DISPLAY_NAMES` in `canonical-regime-strategy-map.ts:365–385`), not 9 as B72.1 §13.1 incorrectly claimed. The 9 in-class quant strategies (`vwap_pullback`, `abcd_long`, `sma_trend_ride`, `breakout`, `mean_reversion`, `range_trade`, `vwap_bounce`, `liquidity_trap`, `dhma`) have full `detect*` methods at `server/services/strategy-engine.ts:87–1344` and are dispatched from 6 production sites. `vwap_pullback` alone produces 26,540 evaluations / 7d — the highest-volume strategy in the system. **131 lever rows seeded** under 9 new `strategy.<key>` modules. Detector bodies migrated to `getCachedNumbersForModule` + `getCachedConstant<string>` (4 string enums: abcd_long.exit_type, sma_trend_ride.entry/exit_condition, mean_reversion.mean_type, liquidity_trap.min_stop_zone_size). Dispatcher param-object literals stripped from 4 dispatcher files — 5 vts-runner-vs-signal-orchestrator value discrepancies collapsed to canonical vts-runner values per Langston cc-inbox #914. `liquidity_trap` migrated for re-enablement readiness (operationally disabled — bullish strategy + system has no short support). Boot warmup verified all 9 new modules clean; signal regression check confirms in-class quants emitting at consistent rates post-deploy. **18/18 canonical strategies now DB-tunable.** B72 main + B72.1 + B72.2 batch family fully closed. Audit-process bug logged as `BUG-2026-05-06-A` (surface grep of `server/strategies/` missed in-class methods; B72.1 audit reinforced the gap). Completion report `BATCH_72_2_COMPLETION_REPORT.md`. **Phase 15c next slot:** Phase 16 (TS errors + storage.ts modularization).

**Phase 15c continuation 2026-05-05 (B72.1 source-side wiring SHIPPED — B72 carry-over closed):**
- **B72.1 SHIPPED 2026-05-05** (commit `31f4b873`, PM2 #170 on `migration/aws-supabase`). Closes the 5 carry-over items deferred by B72 main. Source-side reads now wired to live `module_constants` for all 5 modules: `adaptive-manager.ts` (lazy `get decayRate()` accessor + `_decayRateOverride` for setDecayRate / constructor — fixes singleton-init timing trap), `risk-concentration.ts` Directive 9.4 covariance guards (lazy `get config()` accessor + `_configOverride` partial), `trade-safety.ts` `guardrail_defaults` (3 fallback callsites), `pre-execution-validator.ts` `goal_alignment` + `strategy_profiles` HIGH-risk atomic block (snapshot-once-per-validateTrade pattern, legacy `strategyRiskProfile` map deleted), `strategy-modes.ts` already shipped under B72 main `791e72b5`. PREFETCH_MODULES extended with `adaptive_weights`, `concentration_risk`, `guardrail_defaults`, `goal_alignment`, `strategy_profiles` — boot warmup verified clean (rows: 1, 3, 2, 6, 6) and `[B72][INIT_OK] (pre-orchestrator)` confirmed in deploy logs. **17-vs-9 strategy reconciliation outcome**: live universe is **9 active canonical strategies** in `server/strategies/`; the 8 keys missing files (vwap_pullback, mean_reversion, range_trade, abcd_long, sma_trend_ride, breakout, vwap_bounce, dhma, liquidity_trap) are legacy exit-only `case` branches in `strategy-engine.ts` with no `detect()` entry — they cannot enter trades. CLAUDE.md "17 canonical" reference is stale. No B72 levers escaped audit. Flagged as Phase 16 dead-code candidate. CI: Build+Docker GREEN; Test Suite + TS Check pre-existing infrastructure failures (ECONNREFUSED 5432, vitest hoisting bug) identical to prior commit — not introduced by B72.1. Langston Step 4 sign-off cc-inbox #912. Documented in `LEVER_INVENTORY.md §13`. **B72 carry-over list cleared. Phase 15c next slot:** Phase 16 (TS errors + storage.ts modularization) per POST_AUDIT_ROADMAP.

**Phase 15c continuation 2026-05-05 (B72 Comprehensive Lever-to-`module_constants` Sweep SHIPPED — final pre-Phase-19 backstop):**
- **B72 SHIPPED 2026-05-05** (14 commits across 4 slices on `migration/aws-supabase`, PM2 #155 → #163, final HEAD `b8a40fe1`). Final pre-Phase-19 backstop migrating every operator-tunable lever from source code to `module_constants` so live trading never requires a code redeploy to retune. Step 2 inventory swept all 6 tiers (`server/core/`, `server/services/`, `server/strategies/`, `server/risk/`+`execution/`, `server/api/`+`routes/`+`config/`, `shared/`) and identified ~180 unique PROMOTE levers; Langston Step-2 sign-off cc-inbox #906. Implementation landed as one Drizzle migration (`2026-05-05-b72-lever-sweep.sql`, 170 unique new rows seeded) + Commit A DBS routing guards atomic group (4 rows + integration test) + 13 source-replacement commits across Slices 1/2a-d/3a-b/4. **34 modules / ~163 rows live in production sync-read paths** verified across 8 PM2 restart cycles. **Sync-read API added to `module-constants-service.ts`:** `prefetchModule()`, `getCachedConstant<T>()`, `getCachedNumberRequired()`, `getCachedNumbersForModule()` (bulk Record reader). 60s background refresher propagates SQL UPDATEs without redeploy. **Boot hard-fail discipline** in new `server/startup/b72-warmup.ts` — every PROMOTE module read from sync code MUST be in `PREFETCH_MODULES` or boot fails fast. **DBS routing guards group migration** (Commit A) under `module_name=strategy_dbs_routing_guards` with mandatory mutual-consistency integration test. **All 9 strategy files** migrated to bulk-read pattern at top of detect() covering 91 strategy-tier levers. **HIGH-risk Slice 4 wiring**: SQE primary admission gates use 3-layer precedence chain `screener_filters → sqe_config → SQE_DEFAULT_THRESHOLDS static mirror` (cc-inbox #909); net-expectancy-kernel pure-math contract preserved via caller-injection refactor (cc-inbox #910); market_regime 5 TFS fields discovered already-DB under `regime_classifier` from B67.3.5 era — Slice 4 cleanup removed duplicate rows accidentally seeded by initial Slice B SQL. **Companion deliverable**: `server/scripts/dump-settings-registry.ts` auto-generates `1-system-manual/CURRENT_SETTINGS_REGISTRY.md` (live snapshot, 293 module_constants + 28 screener_filters rows captured). Langston Slice 4 sign-off + B72 main close approved cc-inbox #911. **B72.1 carry-over (non-blocking)**: adaptive-manager / risk-concentration singleton-init refactors; strategy-modes confidence-floor naming reseed; pre-execution-validator atomic block; trade-safety guardrail_defaults; 17-vs-9 strategy reconciliation. Rows seeded; source wiring deferred. Completion report at `Claude Comms and Packages/Batch Completion/BATCH_72_COMPLETION_REPORT.md`. **Phase 15c next slot:** Phase 16 (TS errors + storage.ts modularization) per POST_AUDIT_ROADMAP.

**Phase 15c continuation 2026-04-29 evening (B67.3.5 Pre-Window Hardening SHIPPED LIVE):**
- **B67.3.5 SHIPPED 2026-04-29** (commits `49209eb4` initial + `d97d47d7` CI fix, PM2 restart #114). Pre-window foundation sub-batch resolving the two open discussion items from master plan §0.12.B that surfaced earlier 2026-04-29 evening: (1) phase backfill from OHLC history (cold pairs read EARLY when actually deep in PRIME/LATE) and (2) TFS branch confidence saturation (12/16 closed VTS trades at conf=1.0, calibration check uninformative). Both fixes coordinated as one batch through full 11-step workflow; Langston reviewed at Steps 1, 2, 4, 8 (cc-inbox #851/#852/#853/#854). **Phase backfill** (`server/core/metrics/regime-phase.ts:backfillFromHistory`): walks 12 backward 60-min OHLC windows running `calculatePairRegime` to find the actual regime entry boundary; first-observation only; uses CURRENT DBS as approximation (label is robust); persists via existing `/tmp/regime-phase-store.json`; new optional `BackfillContext` parameter on `tick()` is backwards-compatible. **TFS desaturation** (`server/core/metrics/market-regime.ts:177-184`): step-function replaced with continuous mapping `confidence = min + (max - min) × (momentum_factor × dbs_strength × vol_inverse)`; multiplicative (semantic match for "trend-friendly STABLE" = all three should align); output [0.50, 0.90] via 5 module_constants in `regime_classifier` module (recalibrate via DB UPDATE). New `RegimeConfig` type + required 4th param on `calculatePairRegime` + `DEFAULT_REGIME_CONFIG` for advisory paths (3 callers updated). MCE wiring resolves the 5 constants alongside macro/phase boundaries with hard-fail on missing; threads as 4th param into classifier AND as backfill context into phase-store tick. Migration `2026-04-29-b67-3-5-tfs-desat.sql` (5 INSERTs in regime_classifier module). 6 new unit tests for desat + 5 augmented for backfill. CI initially failed on test fixture issues (timestamp generation, computeMomentum lookback) + hardcoded regime string in MCE — all caught by tests + integrity check; fixed in `d97d47d7`, CI Test Suite/Build/Docker green. Step-7 first-pass verification: macro modifier first-ever non-1.0 value = 0.85 (clamped to min) with real z-scores (BTC -0.79, funding +1.90, mcap +0.08); macro feed rolling windows survived restart (btc:78, fund:96, mcap:77). Step-8 Langston second-pass approved (cc-inbox #854).
- **Out of scope (deferred per RUNNING_ISSUES #40):** HVU / RBS / IE / ST regime branches still on original step-function. TFS alone covers ~55-60% of pairs (the calibration bottleneck). Remaining branches queued for post-window classifier-formula tuning batch.
- **Calibration window status:** all 7 pre-window foundation fixes complete (B67.0/1/2/2.1/3/3.5 + replay logic). Only B67.4 cheap-tier bundle (B67.4 outcome feedback + B68.4 regime-age first-class + B68.5 Path B sustainability tightening) remains. Window starts when B67.4 deploys clean per master plan §0.11.C.

**Phase 15c continuation 2026-04-29 (B67.2 Phase Dimension SHIPPED LIVE + B67.1 cleanup to LIVE):**
- **B67.2 SHIPPED 2026-04-29** (commit `9f82f401`, PM2 restart #105). Sub-deliverable 4 of 6 in B67. Sub-classifies the existing 5 canonical regimes by AGE: EARLY (0-2h since regime entry) / PRIME (2-12h) / LATE (12h+). 18 strategies × 3 phases = 54 cells in approved JSONB blob (cc-inbox #843 with `range_trade` tweak applied: EARLY 0.90, PRIME 1.10, LATE 1.05 per Langston review). Built: new `server/core/metrics/regime-phase.ts` (`regimePhaseStore` singleton + `computePhase` + `applyPhasePreference` shared utility called from both signal-orchestrator and vts-runner for lockstep parity); MCE refresh extended to also load 3 `regime_phase` module constants (boundaries + 54-cell weights blob), throws hard on any missing key per the no-fallbacks rule; `RegimeContext` extended with required `phase` + `phaseAgeSeconds` fields; ablation hooks at orchestrator + vts-runner emit B67.2 alternate row (`factor_name='b67_2_phase_dimension'`, JSONB shape per Langston cc-inbox #842 with `regime_label` addition for future (strategy, regime, phase) tuple analysis); 12 unit tests covering boundaries, store tick semantics, and applyPhasePreference math + hard-fail. Migration `2026-04-29-b67-2-phase-dimension.sql` ran cleanly. **Ships LIVE — no `b67_2_enabled` flag per Kyle directive 2026-04-29.** Phase preference modulates confidence on every signal evaluation immediately. Decorative until B67.5 wires consumers.
- **B67.1 cleanup commits 2026-04-29** (`6177013e` + `82e542ff`). Per Kyle directive 2026-04-29 ("all fallbacks are to be removed/deleted") and the live-everything pivot from the same conversation: removes all 5 fallback paths from the B67.1 ship + eliminates the `b67_1_enabled` shadow-mode flag entirely. Removed: 7 `??` config-read fallbacks in MCE.refreshMacroContext (now throws with explicit missing-key list); `readConst<T>(name, fallback)` helper (replaced with throwing `readConstStrict`); `pollIntervalSec` default; `calculatePairRegime(macroModifier=1.0)` default arg (parameter now required, all callers updated incl. `getDynamicRegimeScore`, `diagnostic-11.4G.ts`, `vts-modernization` test); `?? 1.0` at MCE consumer site (now throws on cold-start race); `b67_1_enabled` flag entirely (`MacroContext.modifier` now non-nullable, conditional null path deleted, kill-switch use case = set `modifier_min = modifier_max = 1.0` in DB). Follow-up migration `2026-04-29-b67-1-remove-shadow-flag.sql` deletes the orphaned `b67_1_enabled` row. **Hotfix `82e542ff`** renamed the rollback file to follow the `*-rollback.sql` convention recognized by `scripts/db-migrate.ts:69` (file got auto-applied as a regular migration on first deploy because its name didn't include "rollback"; staging state corrected via direct psql DELETE; rename ensures future deploys don't re-apply). Both deploys (PM2 #103 → #104) HTTP 200, modifier line `[B67.1][modifier]` now appearing in PM2 logs.
- **Both B67.1 + B67.2 LIVE as of 2026-04-29 PM2 #105.** No shadow theater. 14d observation window starts now. End-of-observation calibration check (tertile-monotonic WR(HIGH)−WR(LOW)≥7pp, p<0.05, n≥150/bucket) gates B67.5 consumer wiring. Ablation framework collects per-factor counterfactual data on every signal evaluation.
- **No-fallbacks discipline reinforced:** the `?? <default>` patterns I introduced in B67.1's first ship were a §11 violation (CLAUDE.md "fail hard if the DB is empty — don't silently use a default"). Lesson logged in CHANGES_AND_FIXES. Same hard-fail discipline applied to B67.2 from the start (54-cell blob throws on missing key with `[B67.2][missing-weight]` error).

**Phase 15c continuation 2026-04-29 (B67.1 Macro Confidence Modifier SHIPPED in shadow mode):**
- **B67.1 SHIPPED 2026-04-28** (commit `828f6d92`, PM2 restart #103). Sub-deliverable 3 of 6 in B67. Macro confidence modifier on per-pair regime classifier output. Confidence-modifier architecture (Langston's Option C from master planning doc §3) — label preserved; only confidence is modulated by a multiplier in [0.85, 1.05]. Inputs: BTC dominance + funding rates + total-mcap momentum. Built: pure `computeMacroModifier()` function (`server/core/metrics/macro-modifier.ts`) with min-48-sample z-score floor (Langston cc-inbox #844 §6.2) + stale-data fallback; singleton external feed service (`external-macro-feed.ts`) polling CoinGecko (BTC dom + total mcap) + Binance public futures (BTC + ETH 8h funding rates, 0.6/0.4 OI-weighted) on 60s cache with 720-sample rolling window for z-score normalization, partial-feed graceful + loud `[B67.1][feed]` logging; MCE periodic refresh loop reads feed snapshot + module_constants + computes modifier each cycle, exposes via sync `getCurrentMacroContext()` accessor; classifier modification (`market-regime.ts`) accepts optional `macroModifier` 3rd parameter applied pre-clamp with upper bound raised 0.95 → 1.0; `MarketContext.macro` field optional (back-compat); ablation hook wire-ups at signal-orchestrator + vts-runner push B67.1 alternate row when modifier non-null with `confidence_with_modifier / confidence_without_modifier / btc_dom_z / funding_z / mcap_z / fallback_active / stale_data_flag` JSONB shape (`buildB67_1Alternate` helper in macro-modifier.ts); `market-snapshot.ts` stub reconciled per V2 pre-audit §3.5 (single caller `ai-market-analyzer.ts` transparently inherits real values; +`fundingRate` field on type); `initExternalMacroFeed()` boot wire-up in `autonomy-scheduler.ts`. 11 module_constants seeds in new `macro_modifier` module (b67_1_enabled=false shadow; weights 0.40/0.35/0.25; band 0.85-1.05; cache 60s; stale 300s; lookbacks 30d; min-sample-count 48). Migration `2026-04-28-b67-1-macro-modifier.sql` ran cleanly. Langston Step-1 + Step-2 + Step-4 all approved (cc-inbox #844 + #845) with one bug fixed in Step-4: `mcapMomentum` field separated from raw `totalMarketCapUsd` on `MacroSnapshot` per "no naming lie" rule (option a from review). Step-7 first-pass verification: HTTP 200, all 11 module_constants seeds present, feed alive (`[B67.1][feed] btc_dom=57.98% mcap_mom=0.00000 funding=0.000029 windows=(btc:2,fund:2,mcap:1)`), no `[B67.1]` errors. CI overall conclusion SUCCESS (Build/Test/Docker all green; TS Check legacy-failing per established baseline — every B67.1 file is TS-clean at edit lines, the 656 vs 655 delta is a re-evaluation artifact). Unit tests: `b67-1-macro-modifier.test.ts` 18 cases (clamp / weight math / cold-start floor / stale fallback / missing inputs / `buildB67_1Alternate` shape + reverse-derivation). **Activation plan:** ship in shadow → 24h soak (rolling baseline reaches 48-sample floor at ~T+48min) → flip `b67_1_enabled=true` via `module_constants` UPDATE → 14d observation → calibration check (tertile-monotonic WR(HIGH)−WR(LOW) ≥7pp, p<0.05, n≥150/bucket) → if pass, B67.5 wires confidence into 7 consumers; if fail, B67.4 realized-outcome feedback ships first to recalibrate.

**Phase 15c continuation 2026-04-28 (B67.3 Per-underlying position limits SHIPPED in shadow mode):**
- **B67.3 SHIPPED 2026-04-28** (commit `ca0e2c2d`). PM2 restart #102. Sub-deliverable 2 of 6 in B67. Per-underlying position cap admission gate. Built: `per-underlying-cap.ts` service (cohort assignment via FNV-1a 32-bit hash on symbol; cohort 0 = treatment, cohort 1 = control); new `PER_UNDERLYING_CAP` rejection reason in `signal_lifecycle_audit.ts` taxonomy; `paper_sim_trades.pair_id_hash` integer column for cohort persistence; 3 module_constants seeds (`b67_3_enabled=false` shadow at deploy, `b67_3_max_concurrent_per_underlying=2`, `b67_3_universe_split_active=true`). Wire-in: `signal-orchestrator.ts` (active path, gates BEFORE RTB queue using `storage.getActiveTrades()`) and `vts-runner.ts` (VTS-mirror, after MAX_OPEN_TRADES check using in-memory `openVirtualTrades` map). paper-execution-engine intentionally NOT gated (signals filter at signal-orchestrator before reaching RTB; redundant gate would risk consistency drift). Migration `2026-04-28-b67-3-per-underlying-cap-pair-hash.sql` ran cleanly. Langston Step-4 reviewed and approved (cc-inbox #841) with one comment fix applied (migration header now states FNV-1a explicitly with portability rationale; scope §5.3 specified CRC32 conceptually). Step-7 first-pass verification: HTTP 200, schema column PRESENT, 3 seeds correct, no `[B67.3]` errors. Live signal-evaluation logging not yet visible because VTS reports "No pairs available" during verification window — gate will exercise live when signal flow resumes. **Activation plan:** ship in shadow → verify shadow logs once signal flow resumes → small follow-up commit to wire `pair_id_hash` persistence at trade open → flip `b67_3_enabled=true` via module_constants UPDATE (no code change) → 14-day A/B observation → cohort comparison decides keep-cap vs deactivate.

**Phase 15c continuation 2026-04-28 (B67.0 Telemetry & Ablation Framework SHIPPED):**
- **B67.0 SHIPPED 2026-04-28** (commit `105d2b53`). PM2 restart #101. First sub-deliverable of B67 coordinated regime overhaul. Builds the observation infrastructure that future B67 work will use to prove its value. Three concrete artifacts: (a) new `regime_factor_alternates` DB table with XOR-discriminated source (active_signal vs vts_trade) capturing real classifier decisions plus N factor-level alternates per signal; (b) fire-and-forget `factor-ablation-emitter.ts` service wired into both signal-orchestrator (active path) and vts-runner (VTS mirror), gated on `b67_0_ablation_emit_enabled` module constant; (c) nightly `replay-ablation.ts` job (skeleton + 90-day retention sweep functional; outcome-lookup logic ships with B67.1+ producers). UI side: new `AblationComparisonSection` panel in existing Drift Dashboard tab (Analytics page) renders empty-state explainer at B67.0 ship time, populates 8-column per-factor table when factor producers ship. New API endpoint `GET /api/analytics/ablation-comparison`. Seed module_constants entries: emit-enabled=true, retention-days=90, paper-replay-capital-threshold-pct=0.80. Migration `2026-04-28-b67-0-regime-factor-alternates.sql` ran cleanly. Langston Step-1 + Step-2 V2 + Step-4 (×3 chunks) all approved. Step-7 first-pass verification: HTTP 200, DB schema 12 cols verified, 3 seeds present, row count 0 (expected), API returns well-formed empty response, zero `[B67` errors in PM2. Progress report at `Claude Comms and Packages/Batch Completion/BATCH_67_PROGRESS_REPORT.md` (open until all 6 sub-deliverables close).
- **B67 scope expanded** from original "External Data Context Layer Phase 1" (2026-04-22 single-workstream queued slot) to a 6-sub-deliverable coordinated batch (master planning doc 2026-04-27, V2 pre-audit 2026-04-28). Sub-deliverables: B67.0 ✅ / B67.3 Per-underlying limits / B67.1 Macro modifier / B67.2 Phase dimension EARLY/PRIME/LATE / Calibration check / B67.5 Wire confidence into 7 consumers / B67.4 Realized-outcome feedback. Estimated 3-4 weeks total.
- **Independent safety gap surfaced in V2 pre-audit:** kill-switch `dailyLossKillSwitchPct` configured (10% per UI) but no automated enforcement code — `tripKillSwitch()` accepts auto-trip params but is only called manually via UI/API. Logged as `POST_AUDIT_ROADMAP.md` Phase 19.4.5 item 9 marked **BLOCKING for live-trading activation**. Independent of B67 — must be closed before any real capital is at risk in live trading.
- **MATURE → PRIME naming change** locked in across phase dimension docs per Kyle directive 2026-04-28. EARLY / PRIME / LATE going forward.
- **No new hardcoded constants from B67 forward (Kyle directive 2026-04-28):** every new threshold/weight/multiplier/cutoff goes directly into `module_constants` at moment of introduction. B72 becomes a sweep of pre-B67 legacy constants only.

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

---

### Phase 24: Multi-Asset VTS Onboarding (xstock_spot + reusable workflow) — Batch 79+ — 2026-05-07 onwards

**Phase 24 NEW per Kyle directive 2026-05-07 round 2.** Out-of-sequence with current Phase 15c/16/19, consistent with the roadmap pattern (Phase 19.0 was pulled forward as documented; xStocks onboarding similarly sits in its own phase container). Phase 25 = B80 (crypto_perp) with same workflow doc applied as second worked example.

**Trigger (Kyle 2026-05-07):** *"What we are doing with these X-Stocks, this needs to be our experimentation lab, our learning example for how we set up asset classes in the future. We need to document and design a workflow for how we add other asset classes in the future."*

**Phase 24 deliverables:**
- B79: workflow doc + xstock_spot foundational scaffold + screener_filters schema + dedicated scanner + telemetry-partitioning audit + parallel pattern path + Q-D AAPLx-vs-AAPL pre-implementation investigation stage + ORB strategy file shipped Q-D-gated + 3 file-based pattern strategies enabled (`inside_bar_reversal`, `morning_star`, `pivot_shift`) + scripted sector mapping (yfinance) + exit observation metrics framework
- B79.0a: live xstock scanner setInterval wire-in + ARM constructor injection + Q-D probe + freshness-gate helper + load test
- B79.1: Layer 1/2 threshold derivation deepenings as PIA findings dictate
- B79.2: equity-specific strategies (Gap-Fill, EOD-MR, etc.) — observation-triggered
- B79.3: equity macro modifier (VIX, S&P, sector rotation, yield curve) — Layer 3 evidence trigger
- B79.4: equity exit observation calibration (trailing stops, BE stops re-derivation)
- B79.5: live-pricing adapter for `wss://ws-equities.kraken.com` — Phase 19 prerequisite
- B79.6: sector-aware portfolio cluster prevention (Stage 12.5)
- B79.x: failure-mode taxonomy implementation (LULD halts, circuit breakers, dividends, splits, earnings)

**Phase 24 success criteria:** xstock_spot in production VTS shadow-mode + ASSET_CLASS_ONBOARDING_WORKFLOW.md battle-tested through B79 + ready for Phase 25 (crypto_perp) to execute the workflow as second worked example.

**B79 ship 2026-05-07 evening (commits `d7ca57340` + `a991f40a4` + `260cc8cc5` + `871038509`; PM2 #184).** Step 1+2 PIA Langston-greenlit through 2 review rounds with concession to separate-instance partitioning architecture. Step 4 code review PUSH_GREENLIT with 4 non-blocking notes for B79.0a. Step 6 deploy verified: HTTP 200, no B79 errors, no-touch fence on crypto_spot regime_factor_alternates 12 emissions/factor/hr (within ±10% post-restart-window-fill). NEW Tier-2 governance doc `ASSET_CLASS_ONBOARDING_WORKFLOW.md` is the canonical reusable template for future asset-class onboarding. xstock_spot pipeline ships DORMANT — code paths exist, schema migrations applied (NO max_price cap per Kyle), telemetry isolation pattern in place; live xstock scanner setInterval is B79.0a follow-on. Layer 3 shadow-mode VTS observation 48-72h+ begins when B79.0a wires the live loop.

**Phase 24 sub-batch progression 2026-05-07 → 2026-05-10 (full close):**

| Batch | Closed | Commit | Summary |
|---|---|---|---|
| B79 | 2026-05-07 | `d7ca57340`+`260cc8cc5`+`871038509` | Dormant scaffold + workflow doc + screener_filters + canonical regime/strategy whitelist |
| B79.TEC | 2026-05-08 | `01fa39912`+`7eb4f5452` | Per-asset-class TEC config + HARD-FAIL boot + state-vs-config rehydrate boundary |
| B79.0a | 2026-05-08 | `a327964a5` (chain) | Live xstock_spot scanner via centralClock; telemetry partitioning triad; data-freshness helper; pre-deploy load test |
| B79.0b | 2026-05-09 | `54201bd32` | N3+N4 cleanup pattern (truthy-guard removal + retroactive boundary tests) + B79.0a SQE wildcard DELETE script |
| B79.0c | 2026-05-09 | `666812ca7`+`e37679ebc` | Per-symbol 24/7 predicate (Kraken Phase 1 names) + WS-archiver weekend-silence empirical confirmation |
| B79.0d | 2026-05-09 | `13178e9b5` | ORB strategy real implementation (~210 lines) + 6-step activation pattern + triple-defense asset-class guard |
| B79.0f | 2026-05-10 | `e6fd7350f`+`3ba99237a` | Asset-class collision disambiguation (the SUI bug class) + 4862-row backfill + WARN log + provenance + standing quarterly re-audit rule |
| B79.0g | 2026-05-10 | `6542dccb6`+`fb42335f7` | Persistence-at-trade-open (`vts_open_trades` table + service); INSERT-before-Map.set; bootstrap-with-re-resolve; rehydrate-on-boot |
| B79.0e | 2026-05-10 | `aca52acdc` | `equity_*` → `xstock_*` namespace cleanup (172 DB objects in single transaction; rollback symmetry) |
| **B79.0h** | 2026-05-10 | (this commit) | **Governance retrospective** — ASSET_CLASS_ONBOARDING_WORKFLOW H.1.x post-mortem + H.1.y decision rules + SIM/SYSTEM_MANUAL/PHASE_HISTORY updates |
| **B79.0i.b** | 2026-05-10 | `5dde28f52`+`cdbd2a04b`+`b9a1cdd4e` | **xStocks tab EXPANDED to full Filter Diagnostics mirror + rich exit + factor ablation tables** (3-revision arc per Kyle pushback). Final form: 5 sections — scanner header + per-pair freshness + FULL FilterDiagnosticsPanel reused from crypto (Pipeline Summary + Last Scan + 24h Rolling + VTS Eval Detail + Setup Nulls + Pre-Eval Skips + Post-Signal Rejections + Filter Metric Ranges) + ExitStrategyAblationSection + FactorCalibrationSection (the LATTER two reused from analytics.tsx via export+endpointBase prop, rendering the SAME rich tables as crypto's Drift Dashboard with all window selectors and empty-state messages). Aggregators `computeExitStrategyAblation` + `computeFactorCalibration` parameterized with optional asset_class (default preserves byte-identical pre-B79.0i.b crypto behavior). "Shadow-mode" terminology dropped — replaced with "VTS Observation". PM2 #210. G3 walkthrough verified rich tables render. Crypto regression NONE by-construction. |
| **B79.0i.a** | 2026-05-10 | `c927924df` | **xStocks observation tab Phase 1** (tab + Panel A scanner-cycle + Panel E freshness + 2 new sibling endpoints under `/api/xstocks/`). Phase 24 standing rule #10 obligation. PM2 #207. All 5 verification gates PASS including G3 Claude-in-Chrome live UI walkthrough + N0/N1 rate-sanity check (delta=2 over 60s = exact 30s × 2 cadence). Crypto regression: NONE by-construction (no shared-endpoint mods). Panels B/C/D + 3 shared endpoint parameterization deferred to B79.0i.b Tue/Wed. |

**Phase 24 success criteria — MET 2026-05-10:**
- ✅ xstock_spot in production VTS shadow-mode (PM2 #206; archiver flushing to xstock_* renamed tables; no-touch fence on crypto_spot held)
- ✅ ASSET_CLASS_ONBOARDING_WORKFLOW.md battle-tested through 9 sub-batches (Sections H.1.x post-mortem + H.1.y updated decision rules)
- ✅ Ready for Phase 25 (crypto_perp) to execute the workflow as second worked example

**Open follow-ups carrying into post-Phase-24:**
- RUNNING_ISSUES #89 — Kraken WS-equities weekend silence (24/7 names not flowing; needs Kraken Pro feed-tier investigation OR REST polling fallback)
- RUNNING_ISSUES #90 — ORB module_constant `risk_reward_ratio` rename to `target_range_multiple` (Layer-3 calibration sub-batch)
- RUNNING_ISSUES #91 — B79.0g-tx (close-time atomic DELETE+INSERT through `persistRealPriceTrade`; affects B73 + B70 hooks; substantial refactor)
- B79.x calibration sub-batches (Layer-1 → Layer-3 promotion of xstock_spot thresholds based on shadow-mode evidence)
- B79.5 (live-pricing adapter for ws-equities — Phase 19 prerequisite)

**Phase 25 reframe:** B80 (crypto_perp) becomes Phase 25's first batch. Same workflow doc — implementer reads ASSET_CLASS_ONBOARDING_WORKFLOW.md Sections H.1.x and H.1.y FIRST, then walks Section A-G applying the H.1.x checklist explicitly. Perp-specific deltas (funding rate, leverage, liquidation, perpetual settlement). Phase 25 batches: B80, B80.1, B80.2 etc. as observation dictates.

**Phase 26+ later:** B81 (RTB ranking parity + filter-as-first-class) might warrant its own phase, OR be batches at the end of Phase 25, depending on how Phase 24+25 reveal cross-asset ranking architecture decisions. Defer to mid-Phase-24 to decide.
