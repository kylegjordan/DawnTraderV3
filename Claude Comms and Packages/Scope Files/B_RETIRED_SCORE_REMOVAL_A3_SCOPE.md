# B-RETIRED-SCORE-REMOVAL — A3 SCOPE (computeFinalScore removal + re-source the derived values)

change-class: architecture

> A3 of #558. A0/A1/A2 ✅ (A2 deployed+verified 2026-07-27). A3 = stop DERIVING values from the retired `computeFinalScore` output + re-source them off coherent inputs. **★ change-class = architecture (Langston-ruled, alert cfde64bb): this changes the scoring-and-ranking pipeline → SYSTEM_MANUAL + SIM CONTENT updates land at the A3/Phase-B close.** Then Phase B = column drops.

## AUDIT (read at head `fdeb8b69b`, both lanes)

**`computeFinalScore` (vts-runner.ts:1167) has 2 callers — SHARED across lanes:**
- **crypto `vts-runner.ts:1695`** → the local `finalScore` const feeds the DERIVED values: `expectedEdge` (`:2049` + `:2207`, `finalScore * dynamicTarget − frictionCost`), `predictedProfit` (`:2195`, `finalScore * dynamicTarget`), ablation metadata (`:2548`, local read).
- **xStock `eval-cycle.ts:656`** → the local `finalScore` feeds **ONLY `:668` archiveCommon → archiveSignalEval (#582 signal_eval sink)** — confirmed sole consumer (the persisted-record write was omitted in A2).

**`computeRankingScore` (`ranking-weights.ts:82`):** `score = finalScore*qualityWeight + normalizedNetReturn*returnWeight − frictionPenalty*frictionWeight + contextBonus`. The `:5648` call passes `trade.finalScore ?? 0` (A2 coalesced it to 0 interim) as the **quality term** → currently the quality component contributes 0.

## ★ THE SEQUENCING ENTANGLEMENT (Decision 1 for Langston)
The `computeFinalScore` FUNCTION can only be deleted when BOTH callers stop. Crypto's caller (`:1695`) CAN stop once A3 re-sources the derived values. **But xStock's caller (`:656`) feeds ONLY the #582 archiver** — retiring it crosses into #582 (the signal_eval archive is active-path co-fed; deferred). ⇒ **the function is NOT removable in A3** without #582.
- **Option A (my lean): A3 = crypto-side only** — re-source `expectedEdge`/`predictedProfit`/`rankingScore` off coherent inputs + remove the crypto `computeFinalScore` CALL (`:1695`). The FUNCTION + the xStock caller (`:656→#582`) stay; the function's final deletion rides #582 (or a Phase-B tail). Keeps A3 crypto-scoped + off the active fence.
- **Option B:** sequence #582 BEFORE A3 (retire the archiver finalScore across active+VTS callers), then eval-cycle:656 drops computeFinalScore, then A3 deletes the function + re-sources crypto in one leg. Bigger, touches the active fence first.

## ★ THE RE-SOURCE TARGETS (Decision 2 for Langston — the design substance)
Each derived value currently built from `finalScore` needs an honest replacement. finalScore is dead (measured anti-predictive r=−0.140), so these have been deriving off a dead input:
- **`expectedEdge` (:2049/:2207)** `= finalScore * dynamicTarget − frictionCost`. xStock's expectedEdge is already `kernelResult.netEV` (price-space, coherent). **Candidate: re-source crypto expectedEdge to the same net-EV / kernel edge** (unifies the cross-lane incoherence you flagged). CONFIRM the coherent source.
- **`predictedProfit` (:2195)** `= finalScore * dynamicTarget`. Same family — re-source or retire (is predictedProfit still read? audit its consumers at Step-2).
- **`rankingScore` quality term (:5648 / computeRankingScore arg1)**. Options: drop the quality term (re-weight), or re-source it to a live quality signal (`predictiveConfidence`? the `r_multiple`?). This is the RTB-ranking display's quality input — CONFIRM.

## §13 HOMES
- **expectedEdge RETIREMENT** (the incoherent cross-lane field itself — separate from re-sourcing it): named home decided at Step-2 (a RUNNING_ISSUES entry). Langston: re-source ≠ retire; don't fold silently.
- The computeFinalScore FUNCTION deletion (if Option A): rides #582 / Phase-B tail — record the home.

## VERIFY PLAN (Step-4)
Untruncated tsc both lanes; check-tsc-baseline PASS; the re-sourced expectedEdge/predictedProfit/rankingScore produce sane values (not 0/NaN); b79-0n green; **SYSTEM_MANUAL + SIM content updates (scoring/ranking pipeline) at close** (architecture-class). Deploy = §9.3 UI-verify (the RTB-ranking display + any expectedEdge/Edge-column surface). No migration in A3 (column drops = Phase B).

## OPEN FOR LANGSTON STEP-1
Decision 1 (A3 crypto-only vs sequence-#582-first) + Decision 2 (the re-source targets for expectedEdge/predictedProfit/rankingScore). Both shape the diff — ruling needed before Step-2 audit + cut.
