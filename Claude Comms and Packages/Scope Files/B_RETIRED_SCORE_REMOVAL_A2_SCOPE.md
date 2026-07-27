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

---

## ★ REFRAME v2 (Langston-concurred 2026-07-27, ref `da9ccfdc`) — A2 is SYSTEM-WIDE PERSISTENCE, not xStock-only

**Why the original narrow framing was wrong (Langston re-read, caught 2 defects in my framing):** finalScore now GATES NOTHING (`:778`/`vts-runner:1741` no longer tints chosenNetEV; A1 made RTB rank on r_multiple; SQE gate retired #525). Its only remaining role is PERSISTED VTS telemetry / ML-feed data, written on BOTH lanes — xStock via `registerOpenVtsTrade` (sole caller `eval-cycle.ts:1124`), crypto via the INLINE `openVirtualTrades.set()` path (`vts-runner.ts:2195/2227`, VirtualSignal/Phase10TradeRecord literals — NOT registerOpenVtsTrade). Removing it xStock-only strands crypto still writing it → a per-lane split in the ML training data (a data regression wearing a telemetry label). ⇒ the clean cut is SYSTEM-WIDE, both lanes together.

**★ THE BRIGHT LINE (Langston — this keeps "zero-computation-change" HONEST): `computeFinalScore` STAYS in A2.** It still DERIVES crypto's `expectedEdge` at `vts-runner.ts:2040` (`finalScore * dynamicTarget − frictionCost`); xStock's expectedEdge is already `kernelResult.netEV` (price-space). Removing computeFinalScore would break crypto's expectedEdge telemetry → that's **A3**, not A2.

### A2 (revised) = PERSISTED-finalScore retirement, BOTH lanes — PURE DATA PLUMBING, zero decision/admission/ranking/sizing change
- xStock: `eval-cycle.ts` — remove finalScore from the persisted VTS record (`:1000`) + the `archiveCommon`/archiveSignalEval use (`:668`) + the `:656` compute + the import (xStock's finalScore is persistence-only; its expectedEdge is netEV, not finalScore).
- crypto: `vts-runner.ts` — remove the persisted finalScore FIELD from the inline `:2195/:2227` records (⚠️ B79.0m.b HOT-PATH-LOCK surface — both-branches regression discipline, twin-lock like B7.2d, NOT a free edit). **KEEP `computeFinalScore(:1687)`** (derives expectedEdge — A3).
- type + readers: `OpenVirtualTrade.finalScore` (`:628`) + `RegisterOpenVtsTradeInput.finalScore` (`:3913`) + the `:4050` builder + readers (`:3808` open feed, `:5023` cycle-avg `totalFinalScore`).
- archiver: the signal-eval-archiver `would_admit`/`final_score` (#582 FOLDS IN now — once BOTH lanes stop feeding it finalScore it goes fully dead; re-audit confirms both lanes' archiver writers).
- **NO column drop in A2.** `vts_open_trades.final_score` + `signal_eval.final_score` drops are **Phase B**, gated on a zero-remaining-reader BAKE (rollback never hits a missing column).

### A3 (new, separate) = `computeFinalScore` removal + RE-SOURCE crypto `expectedEdge` off a coherent source (mechanical). ★ RETIRING expectedEdge (incoherent cross-lane field) is a SEPARATE §13-homed item — decide its home when scoping A3, do NOT fold into A3 silently.

### Pre-Phase-B verification (Langston): confirm the ML trainer (`scripts/hce` / ML ingest) consumption of `vts_open_trades.finalScore` — sets the column-drop URGENCY (urgent if actively trained on; leisurely if captured-not-consumed). Does NOT block A2 code.

### Re-audit TODO before cut (Step 1/2, both lanes): pin the crypto inline writers + OpenVirtualTrade readers + BOTH lanes' archiveSignalEval writers + confirm crypto expectedEdge is the ONLY computeFinalScore consumer that must survive A2.
