# P19-B8.4b — Completion Report (the engine-emit half of the active-path Filter-Diagnostics funnel)

**Batch:** P19-B8.4b (Part-2 of the B8.4 Filter-Diagnostics instrumentation batch; the named overflow home for the engine emits).
**Change-class:** `non_architecture` (telemetry-only instrumentation; no trade-state, no order path).
**Head:** `5058b8644` · **CI:** run `28903563905` — all 4 GREEN (Test Suite, Build, TypeScript Check, Docker Build) · **Deploy:** staging restart #454 · **No migration.**
**Owners:** CC-B (Claude New) implement + verify; Langston Step-4 / Step-8 review.

---

## 🚨 THIS BATCH DOES NOT MAKE THE PER-MODE FUNNEL FUNCTIONAL. THE COUNTERS REMAIN DORMANT (ALL ZEROS) UNTIL PAPER-ACTIVE TRADING TURNS ON AT B8.5.

The writers are reached ONLY from the active trading path (`buildSizedSignalForStrategy` → SQE → RTB refresh → promotion), which is OFF today. Every counter reads zero, and the Paper/Live Filter-Diagnostics tabs render the dormant "awaiting activation — populates at switch-on (B8.5)" rows. This batch is the WIRING ("connected but unproven until switch-on" — Kyle); the live per-(mode,assetClass) flow is proven by the B8.5 test harness before switch-on.

---

## What B8.4 was (both parts)

The Paper/Live **Filter Diagnostics** tabs had to become mode-honest and instrument the active trading path so that, at switch-on, each mode shows its OWN funnel for BOTH crypto and xStock.

- **Part-1 (already deployed, restart#452):** DISPLAY — re-pointed the crypto tab to the mode-keyed active-engine scanner, enforced the early-return so each tab shows only its own scanner stage + downstream "awaiting activation" dormant rows, gated the calibration tables to VTS-only, and fixed the xStock-shows-crypto's-1,534-pairs bleed (asset-class-aware scanner skip).
- **Part-2 / B8.4b (this report):** ENGINE EMITS — wired the S22 active-funnel writers into the live pipeline so the dormant rows fill with real per-mode data at switch-on.

## Objectives (B8.4b)

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | signalsGenerated denominator at the funnel top (shared, both pipes) | ✅ | `buildSizedSignalForStrategy` top, per non-null rawSignal |
| 2 | pre-SQE rejects (unmappable / strategy_gate / sizing_zero), per-strategy | ✅ | 3 shared sites, before the :784 SQE |
| 3 | SQE-at-generation per-gate breakdown + pass/fail denominator | ✅ | `recordActiveSqeEvaluation(...,'generation')` |
| 4 | POST-SQE rejects distinct bucket (position_cap + target-gate reasons) | ✅ | `recordActivePostSqeReject`, after the SQE (Langston anchor-b) |
| 5 | strategy attrition (family filter) as its OWN upstream bucket | ✅ | `recordActiveStrategyAttrition`, before `activeStrategies.clear()` (Langston fix) |
| 6 | cyclesRun on the REFRESH path (dormant→active discriminator) | ✅ | `rtb-refresh-service.refreshModeSignals`, per present class (anchor-a) |
| 7 | per-signal refresh outcomes + SQE-at-refresh (phase-split, no sum) | ✅ | `ready_to_buy_service.refreshAndRank`: refreshedAttempted/reconfirmed/rejectedInRefresh + SQE(...,'refresh') |
| 8 | promoted (single home) | ✅ | `active-execution-engine.checkRtbPromotion` on promotion-success |
| 9 | BOTH crypto + xStock (per-class keyed everywhere) | ✅ | shared `sizingContext.assetClass` narrowing; endpoint serves both classes |
| 10 | Dormant-honest: writers reachable only from the active path | ✅ | Q1 isolation confirmed; endpoint serves `status:"dormant"` both classes |

## The Langston finding + the family_imf → strategyAttrition fix

Langston (Step-4) approved to push with one substantive item: `family_imf` was bucketed into `preSqeRejects`, but the family filter drops STRATEGIES in `evaluateSymbol` upstream of the `signalsGenerated` denominator — so `preSqeRejects` could exceed the denominator and read as a broken funnel (the exact honesty problem `postSqeRejects` was split out to avoid). Per NO-PATCHES, fixed properly NOW (his lean, option a): a dedicated `strategyAttrition` bucket (record field + envelope field + writer `recordActiveStrategyAttrition` + client StageBlock rendered ABOVE the signal funnel with "before signal generation, upstream of the funnel" label). Now `preSqeRejects ⊆ signalsGenerated` holds **by construction**, not convention. Langston ACK'd ("Ship it"); his two closing holds (conservation check — no downstream sum reconciles the funnel; schema v2-never-persisted so v2→v3 is free) confirmed. Minor cleanups folded: no-await invariant banner over the writers, fragile `:line` comment refs replaced by gate names, `reachability`→`unreachable` in doc/test.

## Verification (Step-7)

- **Endpoint** `/api/active-engine/diagnostics/funnel?mode={paper,live}` serves the `active-funnel/v3` envelope for `crypto_spot` + `xstock_spot`, `status:"dormant"`, all zeros, with the new `strategyAttrition{}` + `postSqeRejects{}` fields present.
- **§9.3 UI walk (Claude-in-Chrome, DOM read; Radix tabs switched via `element.focus()` + Enter — the reliable method, noted per the OWED item):** Paper/Crypto → dormant funnel; Paper/xStock → dormant + own ScannerCycleHeader + **no crypto 1,534 bleed**; Live/Crypto → dormant with mode-aware copy; VTS page → renders with real data, no regression. The strategyAttrition/postSqe StageBlocks correctly appear only in the active branch (dormant today).
- **Bench:** tsc baseline no regressions above baseline; S22 unit test 12/12 pass.

## Deferred, with named homes (§9.4 / §13)

- **RUNNING_ISSUES #419 → B8.5:** the `refreshAndRank` error-path (`catch` bulk-deletes without ticking reconfirmed/rejected) makes the refresh sub-stage not balance under error rows. Add an `error` outcome bucket; dormant until switch-on so no real error row displays before the fix. Langston tracking it to B8.5 Step-4.

## Governance files changed

- `Claude Comms and Packages/Batch Completion/P19_B8_4b_COMPLETION_REPORT.md` (this)
- `Claude Comms and Packages/Langston Design Asks/P19_B8_4b_STEP4_CONTEXT.md` + `…_ENGINE_EMITS.diff`
- `1-system-manual/BATCH_CATALOG.md` (B8.4 entry — Part-1 + B8.4b)
- `1-system-manual/PHASE_HISTORY.md` (B8.4 shipped)
- `1-system-manual/PHASE_19_PLAN.md` (§1 renumber B8.4=instrumentation / B8.5=switch-on; §5 decision log)
- `1-system-manual/SYSTEM_IMPACT_MAP.md` (S22 active-funnel-tracker + emit sites)
- `1-system-manual/RUNNING_ISSUES.md` (#419 homed to B8.5)
- MEMORY (CC-B truth + repo mirror) + Langston MEMORY sync
- **SYSTEM_MANUAL.md:** N/A by judgment — this is a telemetry/observability service that OBSERVES the existing SQE/signal-pipeline without changing its architecture, strategy logic, regime, filter design, or math (SIM-scope, not System-Manual-scope; §9 applicability judgment stated explicitly, not skipped by default).

## Code changed

`server/services/signal-orchestrator.ts`, `server/services/rtb-refresh-service.ts`, `server/core/rtb/ready_to_buy_service.ts`, `server/services/active-execution-engine.ts`, `server/core/observability/active-funnel-tracker.ts`, `shared/active-funnel-envelope.ts`, `client/src/components/vts/vts-filter-diagnostics-panel.tsx`, `server/tests/unit/p19-b8-4-active-funnel-tracker.test.ts`.
