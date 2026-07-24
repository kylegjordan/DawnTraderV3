# B-RETIRED-SCORE-REMOVAL (#558) — THE #568 STATE-WRITE CENSUS (one document, per Langston's gate)

**change-class: architecture** · **Owner:** CC-A · **Date:** 2026-07-25 · **All citations at `origin/migration/aws-supabase`.**

> **PURPOSE (§9.5(a-ii)):** for every deletion target, enumerate the STATE IT WRITES and grep for READERS of each. Caller-tracing answers *"does anything still CALL this?"* — but a removed WRITER whose READER survives produces no compile error, no failing test, green CI, and clean `tsc`. This census is the check that catches it. Langston holds the Phase-A diff gate until this lands as one unit; he re-derives from the ref.
>
> **CONVENTION:** each target states **WRITES** (the state it produces), **READERS** (who consumes that state, grep evidence), and **DISPOSITION** (delete / replace / keep-and-stop-writing). An asserted "zero readers" is stated with its grep, per rule 22.

---

## A. THE LIVE DECISION — NOT A DELETE (the census's headline; §10.03)

**Target:** the duplicate-resolution tiebreaker, `ready_to_buy_service.ts:2103-2114` inside `queueSQESignal` (the single live RTB admission chokepoint).
- **WRITES:** nothing new — it READS `existingSignal.finalScore` (stored column) vs `input.finalScore` and calls `expireSignal(...)` on the loser.
- **READER OF finalScore HERE:** this site itself — a **live decision** on the stored column.
- **DISPOSITION: REPLACE, not delete** (Kyle-ruled + Langston Q7). Decide the duplicate on the **live ranking key `r_multiple`** (`signalRMultiple`/`computeRankKey`), computable on both sides (§10.03.1). **HARD:** kill `parseFloat(x || '0')`; `chosenNetEv`-absent on either side → explicit **counted keep-first** branch (#574).

---

## B. THE NOT-NULL COLUMN — WRITERS AND COLUMN CHANGE MUST SHIP TOGETHER (§8.1)

**Target:** `rtb_signals.final_score` (`shared/schema.ts:1943`, **`.notNull()`**).
- **WRITERS:** `ready_to_buy_service.ts:1151` (reconfirm update) + `:2234` (queue-insert `insertData`).
- **READERS (grep `signal.finalScore` / `s.finalScore` / `metadata.finalScore`, non-test):** the tiebreaker (A, being replaced) · `computeRankKey` control arm `:1706`/`:1710` (being removed, §D) · `getQueuedSignals` ordering `:1400/:1408/:1416/:1422` (§E) · SQE backfill `signal_quality_evaluator.ts:521` (being removed) · the shadow-sink write path · display surfaces (§F). **Every reader is itself in the batch's removal set or being re-pointed** — no reader survives the batch.
- **DISPOSITION:** **A1 makes the column NULLABLE and removes the writers in the SAME migration; B drops the column.** Dropping writers first on a NOT-NULL column = insert/reconfirm violations day one; dropping the column first = writers throw. **Do not split.**

---

## C. THE FORMULA SITES — WRITE-INTO-A-RECORD, NO DECISION READER

| # | Site | WRITES | READERS | Disposition |
|---|---|---|---|---|
| 1 | `calculateFinalScore` (`score-calculator.ts:44`) | return value → `signal_quality_evaluator.ts:524`, `quality_index.ts:319` | both callers feed the SQE finalScore verdict (retired gate, §G) + `extendedMetrics.finalScore` | **DELETE** the function; keep `calculateRegimeWeight`/`getPredictiveConfidence` in the same file (§F2 mixed-file) |
| 2 | RTB inline `refreshedFinalScore` (`ready_to_buy_service.ts:805-810`) | → column at `:1151` (§B) + metadata mirror | column readers (§B, all in-batch) | **DELETE** the inline block; column handled by §B |
| 3 | xStock `computeFinalScore` (`eval-cycle.ts:656`) | local → eval-cycle record | eval-cycle record fields | **DELETE** — **slice A2** (separate class path/review) |
| 4 | `calculateAdaptiveFinalScore` (`adaptive-goals-weight.ts:146`) | return → `audit_goals_weights.ts` only | **script-only; 0 runtime readers** | **DELETE** cluster (module + script import + `b72-warmup` `goals_weighting` warm entry + its `module_constants` row) |
| 5 | `computeRankingScore` (`ranking-weights.ts:82`) | return → `vts-runner.ts:5609` (`rankingScore`) | VTS record `rankingScore` field | **DELETE** with the ranker retirement; VTS write goes too |
| 6 | `computePerformanceScore` (`ml-calibration.ts:93`) | return | **0 callers (grep = definition only)** — orphan | **DELETE** |
| 7 | `trading-engine.ts:241` finalScore | → trade `metadata` JSONB `:428`/`:469` | **no decision reader**; guardrail reads entry/stop/target. ⚠️ `TradingEngine` runs in **NEITHER mode today** (paper never `.start()`ed; live start is Phase-21-gated + refuses). The current paper+live pipeline is `active-execution-engine.ts`. | **DELETE** the blend + log + 2 metadata keys; keep `goalAlignmentScore`; no migration. **Do NOT touch the `TradingEngine` module** — its live-vs-legacy status is UNRESOLVED and homed to a §13 follow-up (`B-TRADING-ENGINE-DISPOSITION`), not #558. |

---

## D. THE CONTROL ARMS — REMOVE (Kyle: bucket C removed now)

**Target:** `computeRankKey` non-default arms (`ready_to_buy_service.ts:1706` `'confidence'` → `signal.finalScore`; `:1710` `'ranking_score'` → `metadata.rankingScore ?? finalScore`), `RANKER_STRATEGIES` (`:256`), `getActiveRanker`.
- **WRITES:** the rank key consumed by `getRankedSignals` sort + `getDisplayRankKey`.
- **READER of `arm`:** `getDisplayRankKey` returns `{value, arm}` → `routes.ts:5110` → client `rankArm` (`ready-to-buy-table.tsx:28`, **rendered nowhere** — §F/§10.0). `rankScore` (the value) is load-bearing and survives as `r_multiple`.
- **DISPOSITION:** **COLLAPSE** to a single-arm direct `signalRMultiple`; retire the enum, `getActiveRanker`, the `active_ranker` DB row; drop `arm` from the response + `rankArm` from the client type. Client loses no rendered output.

---

## E. `getQueuedSignals` ORDERING — RE-POINT, DON'T DROP (Q5)

**Target:** three `orderBy:'finalScore'` queries + merged re-sort (`:1400/:1408/:1416`, `:1422-1425`).
- **WRITES:** row order of the returned list.
- **READERS:** `getRankedSignals` (re-ranks by `computeRankKey` — order-blind), refresh consumers (set/bucket — order-blind), **but `routes.ts:9324` + c13/c14 display consumers DO surface order.**
- **DISPOSITION:** order by the **live rank key**, not drop the ordering (dropping hands display consumers nondeterministic order).

---

## F. STORED-DATA CONTRACTS — the two landmines (Phase B; NOT auto-drop)

1. **`telemetry_history` scoring columns store COST DATA** (`cost-telemetry.ts:109-113`: `finalScore=totalCost`, `hybridScore=avgFee`, `regimeWeight=avgSlippage`, `predictiveConfidence=avgSpread`; read back `:184-213`). **SURVIVING READER = cost telemetry.** ⇒ **HARD EXCLUSION from the drop set** (rule-20 keep-as-data, live second tenant). Dropping as "unused scoring" silently destroys cost telemetry.
2. **Shadow sink** (`rtb_shadow_pairings`/`rtb_shadow_pool_members`): `hybrid_score`/`regime_weight`/`decay_penalty` already dropped (#555); `final_score` populated — handled with the column disposition. Historical rows kept as inert data.
3. **`screener_filters.final_score_min`** + `module_constants` `finalscore_decay_lambda` / `pattern_final_score_min` — Phase-B per-column keep-vs-drop.

---

## G. THE SHADOW GATE + PROVENANCE (cite-and-close, not silent-delete)

**Target:** SQE finalScore shadow block (`signal_quality_evaluator.ts:338-347`), B-EVIDENCE-SINK dual-write.
- **WRITES:** a would-have-rejected shadow verdict to the durable evidence sink.
- **READER:** the post-paper field-kill decision this log was built to inform.
- **DISPOSITION:** DELETE, but the completion report **CITES AND CLOSES** the P19-B8.5a governed plan explicitly (§9.5(b-ii)) — field-kill ruling arrived early by Kyle's decision on the structural argument (`r=−0.140`). §13 homes: confidence-inversion (Finding 3, survives) + the now-unmeasured gate-accuracy number → **Phase-25 scoring redesign**.

---

## H. THREE ORPHANS — §15 delete-candidates, presence-evidence given

- `criteria-limiter.ts` (whole module) — grep `CriteriaLimiter`/`criteriaLimiter` non-test = **only the 2 definition lines**; one comment ref at `ready_to_buy_service.ts:994`. **Zero importers.** ★ Also a finding: it declares *"ranking is exclusively by FinalScore"* — dead code quoted as live architecture.
- `applyGovernance` (`governance-engine.ts:76`) — both former importers deleted it as dead (`active-execution-engine.ts:181`, `vts-runner.ts:109`).
- `computePerformanceScore` (§C #6).

---

## I. THE OUT-OF-SCOPE FINDINGS THIS CENSUS SURFACED (homed, NOT in #558)

- **#574** — the live `r_multiple` kernel runs on a fabricated `VolNoise=0.3` (`prices` absent, `?? 0.3` substitution, log-suppressed under `quiet=true`). Affects `pwinFloored` → calibration sink + `r` where `chosenNetEv` absent. DI/DBS **hands-off** (100% populated, working-as-designed). **Own batch.**
- **#575** — measure whether the shadow calibration sink retained rows with fabricated-input `pwinFloored`; **measure the sink directly, don't infer from the queue.** Own measurement objective.

---

## PHASE ORDER (unchanged; correctness-forced)

**A0** VTS convergence (`vts-runner.ts:4947` → `confidence`, resolve `:4929` strength; prerequisite gate — the removal can't land while these read the scores) → **A1** core/crypto (nullable-`final_score` + writers in one migration; §C/§D/§E/§G/§H; trading-engine §C#7) → **A2** xStock (`eval-cycle.ts` cluster) → **B** DROP column + Phase-B contracts.

**Methods:** clusters deleted as a unit with non-test non-archive word-boundary grep proof; archive generated programmatically from git HEAD with a leaked-live-method assertion (B8.10); this census IS the #568 pass.
