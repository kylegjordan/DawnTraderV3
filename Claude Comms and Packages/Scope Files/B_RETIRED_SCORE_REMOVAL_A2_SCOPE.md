# B-RETIRED-SCORE-REMOVAL — A2 SCOPE (xStock finalScore telemetry removal)

change-class: non_architecture

> A2 of #558. A0 (VTS convergence) ✅, A1 (RTB core finalScore removal) ✅ deployed+verified 2026-07-27. A2 = remove the retired `finalScore` from the **xStock VTS eval-cycle**. Phase B (column DROP) + #582 (RTB telemetry-reader retire) still follow.

## AUDIT FINDINGS (read in code at head `ee6474d25`, not from memory)

**1. eval-cycle.ts `finalScore` is VTS ARCHIVE TELEMETRY, not a live gate.**
- `:656` `const finalScore = computeFinalScore(hybridScore, predictiveConfidence, regimeWeight, decayPenalty)` → fed to two telemetry records only: `:668` `archiveCommon` (`source: 'vts-runner'`, → `archiveSignalEval`) and `:1000` the VTS trade record (→ `registerOpenVtsTrade`).
- `:778` comment confirms `finalScore` **no longer tints this lane's chosenNetEV** — already decoupled from the Net-EV decision. So removing it changes NO admission/ranking/sizing behavior (parity with A0's VTS convergence).
- `:61` imports `computeFinalScore`.

**2. `computeFinalScore` (vts-runner.ts:1159) has exactly TWO callers:** eval-cycle.ts:656 (this slice) + **vts-runner.ts:1687 (VTS main path — SEPARATE slice).** ⇒ the function DEF stays; A2 removes only eval-cycle's call.

**3. ★ EXCLUDED — NAME COLLISION, NOT the retired score (the rule-24 trap):** `FINAL_SCORE_FLOOR` / `pattern_final_score_min` (0.45) in `pattern-pool-filters.ts` / `pattern-filter.ts` is a SEPARATE, LIVE, load-bearing **pattern-pool quality gate** read by the SQE (`signal_quality_evaluator.ts:336`) to admit pattern signals, with an extensive `b79-0n-*` test suite and a routes.ts display. It is NOT the retired `finalScore` ranking metric — the names collide, the concepts do not. **A2 does NOT touch it.**

**4. Archiver (`signal-eval-archiver.ts`) degrades gracefully:** `finalScore?` is OPTIONAL (`:243`); `final_score: input.finalScore ?? null` (`:341`) writes null when absent; the `would_admit_v0` / `final_score_vs_paper_finalScoreMin` shadow annotation (`:344-365`) already branches on `!Number.isFinite(input.finalScore)` (`:357`).

## PROPOSED BOUNDARY (narrow — mirrors A1; Langston to rule at Step-1)
- **A2 = eval-cycle.ts ONLY:** remove the `finalScore` computation (`:656`) + its two telemetry uses (`:668`, `:1000`) + the `computeFinalScore` import (`:61`).
- **DEFER (separate slices, do NOT fold in):** the archiver's `final_score` column + `would_admit` shadow annotation (degrades to null/not-finite — its own telemetry slice, sibling to #582); **hybridScore + predictiveConfidence + regimeWeight + decayPenalty** co-located in the `:1000` record (hybridScore alone is a ~110-ref cross-file concern — its own batch); `computeFinalScore` def + vts-runner:1687 (VTS slice).

## THE ONE QUESTION FOR LANGSTON
Is **eval-cycle-only** the right cut, OR should A2 also retire the archiver's `would_admit`-vs-`finalScoreMin` shadow annotation? Once eval-cycle stops passing `finalScore`, that annotation always takes the not-finite branch — i.e. it computes nothing meaningful. Narrow-cut leaves it dormant-but-harmless (sibling to #582); folding it in crosses into `signal-eval-archiver.ts`. My lean: **narrow** (defer the archiver annotation to the same telemetry-retire slice as #582), to keep A2 reviewable and the boundary clean — but it is a judgment call and I want your Step-1 ruling before cutting.

## VERIFY PLAN
tsc untruncated on eval-cycle.ts (edited lines in ZERO errors); check-tsc-baseline PASS; the `b79-0n-*` pattern-pool tests must stay green (proves the EXCLUDED gate untouched). No migration (A1 already made the column nullable; A2 is xStock code-readers). Deploy carries no schema change.
