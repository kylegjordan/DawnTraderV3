# P19-B4b D5 — Completion Report (paper/live split-brain isolation)

**Batch:** P19-B4b D5 (the Objective-3 isolation — the Phase-21 paper+live co-run precondition) · **Date:** 2026-06-15 · **Author:** Claude New (CC-B)
**Run mode:** AUTONOMOUS with Langston (Kyle directive: iterate the rest of B4b together, escalate only on no-consensus; thorough code/SIM/System-Manual review; verify everything before close; two plain-language recaps to Kyle).

> 🚨 **SCAFFOLDING-VS-FUNCTIONAL (§9.1):** D5 changes NO user-facing behavior today. xStock + live active trading remain DORMANT (gated off). This is **forward-prep**: it makes paper and live runtime state non-colliding so the Phase-21 co-run is safe. The witness it ships (`LIVENESS_SPLIT`) is dormant-clean until a co-run dry-run exercises it.

## Scope objectives (D5 = the isolation half of P19-B4b; D2/D3/D4 fill-fidelity stay B4b.1)

| Objective | Status | Evidence |
|---|---|---|
| **S1 — portfolio-manager cluster per-mode** (holds the heat ceilings — the worst leak) | **YES** | `global.globalPaperPortfolioManager` single slot → `Map<'paper'\|'live',Manager>` behind mode-aware `get/set/clearGlobalPaperSimManager(mode='paper')`. All ~15 raw-global sites across 8 files routed through (paper-sim-service, routes ×5, paper-trading-stop, operation-queue, paper-session-reset, + the dormant #297 intent-executor/state-awareness sites at `mode='paper'`). Grep-confirmed: no raw `global.globalPaperPortfolioManager` access remains. |
| **Vestigial busy-flag/operation-lock REMOVED** (rule-18) | **YES** | Verified never-acquired (flag never set true, lock never assigned a Promise, timestamps only nulled — superseded by `paperOperationQueue` since Phase 41F). Removed across paper-sim-service, routes, paper-session-reset. **DELETED_COMPONENTS_LOG entry written.** |
| **Liveness → DB SSOT (H1 + H2)** | **YES** | **H1:** `setEngineActive` awaits the DB write FIRST, then broadcasts (the `setTimeout(,0)` deferred-write — the 5-reader divergence root — is gone; write-throw ⇒ no broadcast). **H2:** the 30s reconciliation guard runs `checkLivenessInvariants` — per-mode `DB == engine-presence == orchestrator-presence` + global `vtsAudit == anyActive`, gated by a 15s settling window (`lastEngineFlipAt`) so in-flight transitions don't false-positive — incrementing the observable **`LIVENESS_SPLIT`** counter (`getLivenessSplitStats()`). Advances #214. |
| **S4 — risk-concentration per-mode** | **YES** | `positionWeights`/`concentrationScores` symbol-keyed → `Map<mode,Map<symbol,…>>`; `mode` threaded REQUIRED through every method + 4 callers (trade-safety, paper-execution-engine, signal-orchestrator, + a new required `mode` on `PaperPositionSizingParams`). Root bug fixed: trade-safety built mode-scoped weights and wrote them into the mode-agnostic global → modes clobbered. S2 covariance left SHARED (market-return-derived = mode-invariant; keying = forbidden 2× compute). |
| **S6 — RTB refresh-latch key mode-prefixed** | **YES** | `signalRefreshStates` key `signalId` → `${mode}:${signalId}` (was statistically-unique only); 5 call sites thread the in-scope mode. |
| **S13 / S8 — left shared (documented)** | **YES (decision)** | S13 `vtsAudit.tradingActive` is witnessed by the H2 check + VTS only needs "any active" (simulator vs observer); S8 `currentPoolSize` is a CPU-load knob shadowed by a per-mode local for the actual TCL decisions. Both reasonings recorded; Langston CONCUR. |
| **S3 — Kraken limiter** | **DEFERRED (named home)** | `kraken.ts` is a 🔒 LOCKED module (Directive 8.8.4-A4.R10R-4) + S3 is a *fragmentation* fix not a hard split-brain blocker. **R2 (Langston AGREE):** key by CREDENTIAL identity, NOT `${userId}:${mode}` (shared key ⇒ account-wide lockout is correctly shared; mode-keying would deepen a real lockout). Re-homed to a follow-up batch carrying the locked-module directive — RUNNING_ISSUES #296 (subsumes the old active-12/residual-23 split). |
| **Co-run gate as a numbered hard-blocker** | **YES** | `LIVENESS_SPLIT == 0` for every key during a Phase-21 co-run dry-run is the NUMBERED precondition for the flip — recorded in PHASE_19_PLAN §5. |

## Verification
- ✅ **Bench (C:\dev @ HEAD `8693239` + changes): tsc baseline gate "no regressions above baseline"** (404 current vs 494 baseline — zero new type errors) · **vitest 1952 / 1952 passed (171 files, +7 new).**
- ✅ **New tests** (`server/tests/unit/p19-b4b-d5-isolation.test.ts`, 7): liveness split-FIRES on DB/engine disagreement, NO-split on agreement, paper-also-checks-orchestrator, settling-SUPPRESSES-within-window; S4 per-mode no-clobber + per-mode reset; S1 paper/live separate slots.
- ⏳ Staging deploy + §9.3 UI re-verify (paper-sim status/metrics/health pages still render after the routes accessor change) + clean-boot/no-new-errors + CI all-4-green — _recorded at close._
- ⏳ Langston Step-8 second-pass — _pending._

## Langston gates
- **Step-2** PROCEED-WITH-CONDITIONS (D1 audit; the H1/H2 hardening + S2-stays-shared + S3-blast-radius all ratified).
- **R1/R2 design refinements** (`P19_B4b_D5_DESIGN_REFINEMENTS.md`) — AGREE on both: R1 route dormant #297 sites through the accessor (with the paper-default revisit caveat → #297); R2 key the Kraken limiter by CREDENTIAL identity not mode (amends his ratified C3).
- **Step-4** CHANGES-NEEDED → resolved → APPROVE. Two blockers, neither architectural: (1) the diff silently failed to scp (Helsinki SSH reset) so he refused a line-level APPROVE off embedded snippets — re-staged; (2) the H2 `LIVENESS_SPLIT` witness IS the Phase-21 gate so it can't ship untested — extracted the pure `isFlipSettled`/`livenessSplitsForMode` helpers + added the 7 tests. 3 sign-offs CONCUR: lock/flag removal, S13/S8 as-documented, S3 deferral.

## Governance files changed
- `1-system-manual/DELETED_COMPONENTS_LOG.md` — vestigial busy-flag/operation-lock removal entry.
- `1-system-manual/RUNNING_ISSUES.md` — #296 (S3 deferred + credential-keying + named follow-up home), #297 (R1 paper-default revisit caveat).
- `1-system-manual/PHASE_19_PLAN.md` — §5 decision log: D5 closure + C3 credential-keying amendment + the numbered Phase-21 co-run gate.
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — Cross-Cutting Registry: D5 isolation status banner + the liveness consolidation-target marked SHIPPED.
- `1-system-manual/BATCH_CATALOG.md` + `PHASE_HISTORY.md` (Tier-1).
- MEMORY (3-way: user-cache truth + in-repo mirror + Langston Helsinki).
- `Claude Comms and Packages/` — `P19_B4b_D5_DESIGN_REFINEMENTS.md`, `P19_B4b_D5_CHANGE_LIST.md`, this report.

## Next
**B4b.1** = the depth-feed-gated fill-fidelity work (D2 depth substrate + D3 fill model + D4 validate+warmth). **S3** = its own follow-up batch (needs the kraken.ts locked-module directive). **B6.5** (crypto-resurrect #235) + **B6.6** (liveness/holiday #236) still hard-gate B7b. The `LIVENESS_SPLIT` witness must read 0 during a Phase-21 co-run dry-run before the flip.
