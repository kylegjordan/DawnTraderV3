# P19-B7.2 — Completion Report (maker/taker best-of-both entry decision — the structural crypto opener)

**Owner:** CC-B (Claude New) · **Reviewer:** Langston (Step-1/2/4/8) · **2nd-eyes:** CC-A (landmine catch) · **change-class:** architecture
**Head:** `c595d987e` · **CI:** run `28486308234` all-4-green (Build, TypeScript Check, Test Suite, Docker Build) · **Deploy:** staging `188.245.193.8`, HTTP 200, b72-warmup passed, migration applied+self-verified (16 `maker_taker` rows + 8 `rtb_signals` columns live in Supabase).
**Kyle directives:** START TIGHT / conservative haircut; iterate autonomously to verified completion; DEEP Step-2 (code + SIM + System Manual + Active-Trading-Path-Audit).

> 🚨 **THIS BATCH DOES NOT MAKE ACTIVE CRYPTO TRADING FUNCTIONAL. The maker/taker decision + make-then-take ladder REMAIN DORMANT until P19-B8 turns paper-mode active trading ON.** B7.2 wires the structural crypto opener correctly (decision computed, snapshotted, gated, ranked, tested, deployed) but active trading is OFF, so no live maker/taker decision flows yet. The real Kraken post-only resting-order lifecycle is Phase-21; the haircut calibrates only on Phase-21 live passive fills → Phase-25 (§9.1).

## Objectives — checklist
| OBJ | Result | Evidence |
|---|---|---|
| **OBJ-1** best-of-both maker/taker EV, computed early, single-sourced | ✅ YES | NEW pure `decideMakerTaker` (`server/core/math/maker-taker-decision.ts`) — both EVs via the SAME `computeNetExpectancyKernel` (only `totalFriction` differs); computed ONCE at the shared convergence `buildSizedSignalForStrategy` (F1-verified: pattern bypasses `[HF9]`); fee delta single-sourced `feeRateTaker−feeRateMaker` (Langston Q1). Test: kernel parity + maker-advantage. |
| **OBJ-2** signal-conditioned adverse-selection haircut (the one conservatism knob) + hard floor | ✅ YES | `makerNetEVAdjusted = pFill·(makerNetEV−A) − (1−pFill)·C`; non-fill an opportunity-cost LOSS (never EV=0); A↑strength, C↑continuation/↓reversal (urgency endogenous via the continuation/reversal family prior); hard taker floor. Per-class DB `maker_taker` (fail-hard, START TIGHT). Tests: non-fill-negative, hard-floor, urgency, monotone-A. |
| **OBJ-3** single-consistent-number invariant + named test | ✅ YES | `[11.8B]` open-gate + B7.1 ranker both read `chosen_net_ev` (never the raw maker EV). Tests: `chosenNetEV === makerNetEVAdjusted` (maker) / `=== takerNetEV` (taker); `chosenNetEV !== makerNetEVRaw`. |
| **OBJ-4** make-then-take + convert-safety in the RTB refresh | ✅ YES | `processMakerPending` + `markMakerPending` in `ready_to_buy_service`; honest trade-through fill (`livePricingAdapter`); convert-safety via the KERNEL (`evaluateTradeExpectancy`, NOT `computeNetGeometry` — CC-A landmine) + ATOMIC re-snapshot; maker-POST in the promotion loop (slot-free `continue`) + mutual-exclusion filter; S1/S4-at-fill via the open path. |
| **OBJ-5** #330 fee-source consolidation | ⚖ SPLIT (Langston Q1 consensus) | SPLIT to a dedicated dated home **P19-B7.2a** (RUNNING_ISSUES #330) — the decision doesn't depend on it. The underlying divergence risk is closed STRUCTURALLY in B7.2 (fee delta single-sourced). |
| **OBJ-6** telemetry + the DATA FENCE | ✅ YES | `rtbMetricsService.recordMakerTakerDecision` + `getMakerPickProof()` (maker-PICK-RATE monitor — the too-loose-haircut early warning); paper maker-fills DATA-FENCED (non-calibration). |

## Langston Step-4/8 riders — status
- **Q1 (#330):** SPLIT approved + **structurally closed** — fee delta single-sourced `feeRateTaker−feeRateMaker` (both from `getFrictionForAssetClass`), no cross-source subtraction (Langston verified live at `maker-taker-decision.ts`). #330 (system-wide two-path consolidation) homed at P19-B7.2a.
- **Q2 (honest fill):** approved — single per-tick trade-through observation UNDER-counts fills (safe direction for dormant paper); real Kraken resting-order lifecycle = Phase-21 (§9.1).
- **Q3 (SQE-ROI dormant):** verified — the active `sqeInput` (`signal-orchestrator.ts:669`) sets NONE of `entryPrice`/`targetPrice`/`regime`; the SQE ROI gate is guarded `if(entry&&target&&regime)` (`signal_quality_evaluator.ts:326`, Langston-confirmed live) → **`[11.8B]` is the SOLE active taker-EV gate.** ⚠ **If the active SQE ROI gate is ever activated (entry/target/regime set on the active sqeInput), it would reject every maker-chosen opener upstream and this batch goes inert — at that point best-of-both MUST move before the SQE evaluate (or the SQE ROI gate must read the snapshot).** The pure `decideMakerTaker` kernel does not read `sqeInput`; the exposure is entirely in the caller/plumbing. (Landed in SYSTEM_MANUAL "P19-B7.2" subsection.)

## Notes for the record
- **Seed keying (Langston §8.11):** the 16 `maker_taker` rows are per-asset-class (crypto vs xstock carry distinct values — the required split, not a wildcard placeholder) but WILDCARD exchange/regime/strategy **BY DESIGN** — continuation/reversal sensitivity is endogenous in the kernel (`hard_floor_continuation_strength`, `non_fill_continuation_penalty` vs `non_fill_reversal_discount`), so regime-keying would be redundant. A future grep should NOT read the regime wildcard as an un-split placeholder.
- **CC-A landmine:** `computeNetGeometry.netRewardToRisk` (GROSS) vs `net-expectancy-kernel.netRewardToRisk` (pWin-weighted) share a field name; convert-safety + the decision + the ranker all use the KERNEL value (tests + code comments pin this).

## Bench + verification
- Bench (C:\dev): `node scripts/check-tsc-baseline.mjs` = no regressions above baseline; `npx vitest run p19-b7-2-maker-taker.test.ts` = **13/13 pass** (opens-crypto, single-consistent-number, non-fill-negative, hard-floor, urgency, family→urgency map).
- CI: run `28486308234` all-4-green on `c595d987e`.
- Staging: HTTP 200, b72-warmup passed (fail-hards without the 16 seeds → passing proves the migration), 8 columns + 16 rows verified in Supabase. Langston Step-8 = PASS (independent staging verification).
- **Pattern signal COUNT before/after (F1, RUNNING_ISSUES #411):** DEFERRED to the B8 paper-active switch-on (the gen-time gate is dormant until then) — Langston's Step-8 evidence ask, homed.

## Governance files changed
`BATCH_CATALOG.md` (B7.2 row) · `PHASE_HISTORY.md` (plain-language paragraph) · `PHASE_19_PLAN.md` §1 status board + §5 decision log · `RUNNING_ISSUES.md` (#330 SPLIT→P19-B7.2a + #410 haircut-calibration Phase-21/25 + #411 pattern-vol at B8) · `SYSTEM_MANUAL.md` (NEW "P19-B7.2 — Maker/taker best-of-both entry decision" subsection + the B-4.5 fee note maker-activation reconcile [F4]) · `SYSTEM_IMPACT_MAP.md` (B7.2 callout + the `maker_pending` cross-cutting-state/liveness-registry entry §17) · `ADJUSTMENT_FRAMEWORK.md` (the `maker_taker` haircut/budget knobs + tuning rationale) · migration `2026-07-01-p19-b7-2-maker-taker.sql` (+rollback, +MANIFEST) · Langston `/home/langston/MEMORY.md` · this report. Code: `maker-taker-decision.ts` (NEW), `maker-taker-config.ts` (NEW), `signal-orchestrator.ts`, `ready_to_buy_service.ts`, `paper-execution-engine.ts`, `rtb-metrics-service.ts`, `b72-warmup.ts`, `shared/schema.ts`, `p19-b7-2-maker-taker.test.ts` (NEW).

## Follow-ups homed (§9.4 — every "fix it later" has a named home NOW)
- **P19-B7.2a** — #330 system-wide two-fee-source-path consolidation (adjacent to P19-B8 prep).
- **#410** — haircut calibration: Phase-21 (real Kraken post-only lifecycle + live passive-fill data) → Phase-25 (signal-conditioned markout curves TOP, fill-prob, alpha-decay, non-fill C, A/B).
- **#411** — pattern gen-time NetEV gate is net-new; measure pattern signal count before/after at B8.

**Status: CLOSED pending Kyle acknowledgment.** Langston Step-4 APPROVE-to-push + Step-8 PASS; all 3 riders addressed; governance landed.
