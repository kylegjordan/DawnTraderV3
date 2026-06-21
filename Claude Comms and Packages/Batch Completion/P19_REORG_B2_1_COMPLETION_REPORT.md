# P19 reorg-B2.1 — COMPLETION REPORT

> **Batch:** reorg-B2.1 · **Phase:** 19 · **change-class: architecture** · **Author:** NEW Claude (CC-B) · **Date:** 2026-06-21
> **Status:** ✅ OBJ-1/2/3/4 COMPLETE + DEPLOYED + CI-GREEN. OBJ-5/6 SPLIT to reorg-B2.2 (#374). Pending Langston completion-report review (Step-11) + Kyle ack.
> **Production code deployed:** `8beb34181` (restart-verified, guard recording). **CI 4-green head:** `7bef81fd7` (run `27901621481`). **Origin:** Kyle 2026-06-21 — "why a post-hoc target normalizer instead of setting targets right in the strategy modules where the signal is made?"

---

## ⚠️ HONEST CI NOTE (read first — process correction)

OBJ-4b (`8beb34181`) wired 10 in-class/file strategies into the shared guard. That guard calls `getPerClassTargetGate` → a **synchronous** `getCachedNumberRequired('expectancy_gates', …)` read. Two STRATEGY UNIT tests did not warm/mock that read, so the **Test Suite CI job went RED at `8beb34181`** (2 files / 184 passing): `b79-0d-orb` mocked the constants service without `getCachedNumberRequired`; `b63-item12-geometry-override` used the real service but never warmed `expectancy_gates`. **This was mislabeled "CI 4-green" mid-batch and was caught only at the close while gathering close evidence.** Root cause is a TEST-ISOLATION gap, NOT a production bug (production warms `expectancy_gates` at boot; the guard has its own `strategy-helpers` tests). **Fixed TEST-ONLY at `7bef81fd7`** (orb mock gains a permissive `getCachedNumberRequired`; b63 `vi.mock`s `getPerClassTargetGate` permissive — restoring pre-OBJ-4b guard behavior). **CI 4-green confirmed on `7bef81fd7`.** Surfaced to Kyle + Langston + CC-A; both CC sessions re-anchored on check-CI-before-every-push.

---

## Objectives

| # | Objective | Verdict | Evidence |
|---|---|---|---|
| OBJ-1 | DROP the floor-lift (a target mutation redundant with the Net-Expectancy gate) | ✅ YES | `signal-target-normalizer.ts` no longer lifts the target (`targetPrice = nativeTarget`); `floorPct` removed from the destructure; RR/reachability/invalid_atr/geometry guards retained on the native target. |
| OBJ-2 | Move RR + reachability into the strategies' shared guard at signal-gen | ✅ YES | `applyGlobalGuards(entry, stop, target, effectiveATR, gate)` → `GuardResult{pass, rr, atrsToTarget, dropReason}` in `strategy-helpers.ts` (stays a PURE leaf); `validateRR(minRR injected)` + new `validateReachability(reachAtrMax)`; `clampEffectiveATR` value-form. |
| OBJ-3 | ONE per-class RR SSOT (kill the live 1.5-vs-2.5 split-brain) + per-class reachability | ✅ YES | `getPerClassTargetGate(assetClass)` resolves `min_rr`/`reach_atr_max`/`target_floor_pct` from `expectancy_gates` via `getCachedNumberRequired` (throws on missing — no silent fallback). The old `MIN_RR_RATIO=1.5` demoted to a seed; the normalizer's 2.5 no longer a second source. |
| OBJ-4 | Wire ALL guard-eligible strategies + suppression instrumentation | ✅ YES | 8 file-based (OBJ-4a) + 10 in-class/orb/SBT (OBJ-4b) wired at the verified dominance lines; `liquidity_trap` SKIPPED (disabled, inverted geometry). NEW `guard-eval-tracker.ts` (in-memory per-strategy counters) + `GET /api/diagnostics/guard-eval-stats`. Sanity: 3 strategies / 23 evals @90s post-deploy (#373 ✅). |
| OBJ-5 | Retire `signal-target-normalizer.ts` | ⏸ SPLIT → reorg-B2.2 OBJ-C (#374) | Window-gated on the #371 ATR-divergence measurement (#373's 3-condition gate). Normalizer KEPT as a net-neutral bridge until then. |
| OBJ-6 | Surface the gate by-reason in the VTS Filter-Diag tabs, per-class | ⏸ SPLIT → reorg-B2.2 OBJ-B (#374) | Window-gated (the `(strategy,assetClass)` re-key would reset + re-bucket the in-memory tracker mid-window). |

**Why the split (Kyle + Langston 2026-06-21):** OBJ-5 and OBJ-6 are both structurally gated on the ≥48h suppression/divergence window (any deploy resets the in-memory tracker), so they could not land inside B2.1 without either resetting the measurement or claiming a false close. Splitting them into the named follow-up reorg-B2.2 (#374) is what lets B2.1 close on its complete, deployed, CI-green OBJ-1/2/3/4.

## The placement decision (Kyle's question, resolved with evidence)

Kyle asked why the floor-lift / RR / reachability lived in a post-hoc normalizer rather than in the strategy modules where the signal is generated — a strategy "would never have produced a signal with a target like that." Investigation across all **19** canonical strategies confirmed the gates belonged at signal-gen: the floor-lift was a *mutation* of the target (redundant with the Net-Expectancy gate that already judges cost-coverage), and the RR/reachability checks are *validations* that every strategy should answer for its own geometry. Consensus (CC-B + Langston): drop the lift, move the two validations into the shared guard each strategy already calls, keep ONE per-class SSOT for the thresholds, and surface every drop by-reason (no hidden gates).

## Evidence
- **CI:** 4-green on `7bef81fd7` — run `27901621481` (TypeScript Check, Test Suite, Build, Docker Build all ✓). See the Honest CI Note for the red→fix history.
- **Deploy:** production code `8beb34181` deployed + restart-verified; guard recording live (sanity 3 strategies / 23 evals @90s).
- **Langston Step-4:** APPROVE all objectives, after catching + getting fixed: active reachability fed `atr=0` → carry ATR on `SizingContext` + loud `invalid_atr`; VTS `invalid_atr` silent-mislabel → distinct reason; `meanRR` skew → `rrEvals` denominator (only RR-reached evals); orb import-extension consistency.
- **Net-neutrality:** the 8 file-based strategies already had the normalizer applying per-class 2.5; the in-class strategies' increased drops are the INTENDED correct-tightening (the suppression NUMBERS are the #372 post-window read).

## Governance files changed
- `1-system-manual/RUNNING_ISSUES.md` — #370 (NetEV-judgment, Phase-25), #371 (ATR-divergence, OBJ-5 gate), #372 (minRR calibration), #373 (OBJ-5 3-condition retirement gate + in-memory fragility + airtight zero-code detection), **#374 (reorg-B2.2 home)**.
- `1-system-manual/PHASE_19_PLAN.md` — §1 status board (reorg-B2.1 + reorg-B2.2 rows), §5 decision log (B2.1-close + B2.2/freeze decisions).
- `1-system-manual/BATCH_CATALOG.md` — reorg-B2.1 entry.
- `1-system-manual/PHASE_HISTORY.md` — Phase-19 status.
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — the shared-guard gate relocation + `guard-eval-tracker` component.
- `1-system-manual/SYSTEM_MANUAL.md` — the gate-at-signal-gen architecture (RR/reachability in the shared guard; floor-lift dropped; one per-class SSOT).
- `Claude Comms and Packages/Scope Files/P19_REORG_B2_1_SCOPE.md` + `P19_REORG_B2_1_PRE_AUDIT.md` (Step-1/2).
- This completion report.

## Open items (all homed)
- **#371** (reachability ATR-source divergence) → reorg-B2.2, measured post-window.
- **#372** (per-strategy minRR calibration) → Phase-25; the suppression numbers read post-window from the tracker.
- **#373** (normalizer-retirement 3-condition gate) → reorg-B2.2 OBJ-C.
- **#374** (reorg-B2.2: persistence + VTS-tab visibility + normalizer-retire) → building during the 48h freeze, deploy post-window.
- **#370** (Net-Expectancy judgment-quality validation) → Phase-25 item 25-19.
