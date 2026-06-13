# P19-B3a COMPLETION REPORT — OrderPlacer execution port + #139 classify root-cause

> **Phase 19 · Batch 3 · sub-batch A** (B3a/B3b split per Langston). Closed 2026-06-13. Author: Claude New (CC-B). Reviewer: Langston (Opus 4.8). Decider: Kyle (autonomous-iteration directive).
> Commit `027d2ddcc` · CI `27477509296` all-4-green · deployed + staging-verified.

## 🚨 SCAFFOLDING-VS-FUNCTIONAL (§9.1)
**THIS BATCH DOES NOT TURN PAPER-MODE ACTIVE TRADING ON.** The pipeline stays in VTS/passive learning. B3a repaired the dormant active-trading path (the order-placement boundary + the classifier) so it is correct + type-safe before the switch-on (P19-B7b). The OrderPlacer port is built but DORMANT (paper-active OFF); live stays 409-gated until Phase 21.

## PREVIOUSLY-STATED-VS-NOW (§9.2)
- **#139 throwing-classifier surface: PREVIOUSLY "9 sites in vts-runner." NOW: ~21 active-path sites. REASON: the Kyle-directed full blast-radius audit. B3a converts the 9 vts-runner sites; the other ~12 are homed to P19-B4 (#228) — the widen + centralized alarm cover the structural risk for all callers now.**
- **Classifier regex: PREVIOUSLY "1 literal to widen." NOW: it was DUPLICATED at `symbol-normalize.ts:74`; both now derive from ONE SSOT constant (Langston C1). REASON: audit found the second copy — widening one alone would re-create the divergence.**

## Scope objectives → outcomes
| # | Objective | Result | Evidence |
|---|---|---|---|
| OBJ-1 | Typed OrderPlacer execution port (open/close→FillResult, partial/delayed/rejected from day one) | **YES** | `execution/types.ts` + `order-placer.ts`; wired through both paper-engine seams; behaviour-identical (Langston Step-4 parity-confirmed); 6 unit tests. |
| OBJ-2 | #137 baseline triage | **DEFERRED → B3b** | Triage is B3b's opening pre-audit work (Langston Q1: triage is pre-audit, not B3a code). |
| OBJ-3 | #137 active-path error fixes | **DEFERRED → B3b** | Follows the triage gate. |
| OBJ-4 | #139 classify root-cause (normalize-before-classify + fix-the-source + loud alarm, NOT a silent skip) | **YES** | SSOT widen (both files, one constant); centralized alarm (counter + hook) in `safeResolveAssetClass`; 9 vts-runner sites → safe+alarm; 10 unit tests. Confirmed normalize-before-classify already satisfied at VTS ingress; the source-fix = the SSOT widen. |
| OBJ-5 | No regression to VTS/passive | **YES** | tsc baseline clean; full suite 1896 green; staging boot clean, zero throws/fall-throughs, VTS metrics flowing. |

## The OrderPlacer port (OBJ-1)
Thin port wrapping ONLY the fill (slippage+fee math → `FillResult`); the engine keeps all bookkeeping (P/L, learning, archive, position write) and consumes `FillResult.{fillPrice,feeQuote,slippageQuote}`. `PaperOrderPlacer` always returns `filled`; the `partial/delayed/rejected` variants + the **close-seam state rule** (a non-filled close leaves the position OPEN, retried next cycle — never half-closed) are the live-swap insurance (Option A: live reuses the paper engine, swapping only this fill seam). Slippage%/fee-resolver injected → port does not import the engine. **Langston Step-4: behaviour-identical confirmed** — fee-base (post-slippage notional), slippage-sign (+buy/−sell), close fee-rate source, and totalSlippage telemetry all bit-identical.

## #139 classify root-cause (OBJ-4)
1. **Empirical ground truth:** zero classify failures live → latent landmine, not active leak.
2. **SSOT widen (Langston C1):** `CRYPTO_SPOT_BASE_MAX_LEN=15` (from 10 — finite tripwire, garbage/misclassification guard); `CRYPTO_SPOT_CANONICAL` built from it AND imported by `symbol-normalize.ts:74` — one constant, no two-literal drift.
3. **Centralized alarm:** counter `getClassifyFallthroughCount` + escalation-hook slot `setClassifyFallthroughHook` in `safeResolveAssetClass` (passive = WARN+counter; active escalation hook registered server-side at P19-B4 — `shared/` can't import `server/`). Every safe-call-site inherits it.
4. **9 vts-runner sites** → `safeResolveAssetClass(...) ?? 'crypto_spot'` (alarms on null; VTS cycle survives instead of throwing).
5. **Blast-radius audit (Kyle directive):** ~21 active-path throwing sites + 4 symbol-form modules surfaced; homes named (§9.4 below).

## Verification
- **tsc baseline:** no regressions (474 vs 494 baseline — surplus is pre-existing under-baseline fixes).
- **Tests:** 16 new (6 port + 10 classify), all green; **full suite 1896/1896 (163 files) green.**
- **CI:** run `27477509296` — all 4 jobs success on `027d2ddcc`.
- **Staging:** deployed `027d2ddcc`; HTTP 200; clean boot (no module/import errors from `execution/`); **0 CLASSIFY_FALLTHROUGH, 0 resolver throws** since restart; engine healthy (ELD p99 ~13ms). Backend-only change (no UI surface — paper screens dormant in passive mode) → verified via health + behavior, not UI nav (§9.3 honest: not claiming "UI staging-verified").

## §9.4 Homes (named, in RUNNING_ISSUES)
- **#228** — ~12 remaining active-path throwing `resolveAssetClass` sites + the active-vs-passive system-alert escalation hook registration → **P19-B4**.
- **#229** — 4-module symbol-form consolidation (incl. the LOCKED `kraken-symbol-resolver`) → **Phase 20**.
- **#230** — fallback-classified VTS samples need a distinguishable tag in the learning store (Langston Step-4 caveat) → **P19-B4**.

## Governance files changed
`SYSTEM_IMPACT_MAP.md` (§9.13 #139 + new §9.14 OrderPlacer port) · `SYSTEM_MANUAL.md` (§3.7 port note) · `RUNNING_ISSUES.md` (#228/#229/#230) · `PHASE_19_PLAN.md` (§1 B3 row + §5) · `BATCH_CATALOG.md` · `P19_B3_SCOPE.md` + `P19_B3_PRE_AUDIT.md` + `P19_B3a_CHANGE_LIST.md` · this report · MEMORY 3-way.

## Process note (honest)
Langston's bridge sessions hung 3× today (18/41/42 min) on heavy prompts. Each was killed per §6.5.0.b + worked around — but I failed to actively poll on the 41-min one (waited passively until Kyle flagged it). Corrected discipline: actively poll Langston dispatches at 5–10 min. Model verified live: `claude-opus-4-8[1m]` returns instantly (the hangs are prompt-specific, not Fable — zero Fable in the setup). All Langston gates substantively cleared (Step-1/2/4 + parity).

**NEXT: P19-B3b — #137 baseline triage (all 66 files) + active-path error fixes.**
