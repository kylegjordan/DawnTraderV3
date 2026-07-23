# B-RETIRED-SCORE-REMOVAL — SCOPE (#558)

**change-class: architecture** (removes computed values across SQE / RTB / VTS / telemetry / schema)
**Owner:** CC-A · **Review:** Langston · **Date:** 2026-07-23 · **Issue:** #558

---

## 0. KYLE DIRECTIVE

> "I asked the whole crew to make sure that finalScore and any of the scores we're no longer using were taken out, and we didn't — we left some in worrying about parity between this system and the VTS. **If it needs to be removed from the VTS as well, then remove it from the VTS.**" (2026-07-22)

So: **finalScore and hybridScore are RETIRED and must be REMOVED, including from the VTS** — the VTS-parity objection that kept them is overruled.

## 1. STATUS OF THE TWO SCORES (architectural read — confirmed in code)

- **finalScore GATE is RETIRED** — `signal_quality_evaluator.ts:339` "the finalScore GATE is RETIRED (Kyle-ratified crew consensus 2026-07-13)"; admission is governed by the honest gates (netEV>0 in-SQE etc.). The `finalScoreMin` thresholds are already 0.
- **finalScore as RANKER is DEAD LEGACY** — the live default ranker is `r_multiple` (`computeRankKey → signalRMultiple`); `ready_to_buy_service.ts:253/1365` call the finalScore path "friction-blind rank-by-confidence" and "the dead legacy ranker pair."
- **hybridScore** — its source substituted confidence; made honest-null in #555 (B-RANKING-COMPONENT-CAPTURE). Not a live decision input.
- **⇒ Neither score drives a live admission, ranking, or sizing decision today.** What remains is: dead computation, shadow/telemetry writes, archived columns, VTS writes, and `control` (non-default) rankers that fall back to them.

## 2. THE SURFACE (census — excl. tests)

`finalScore`/`final_score` ≈ 30 files (top: `signal_quality_evaluator.ts` 49, `vts-runner.ts` 39, `ready_to_buy_service.ts` 31, `telemetry-aggregator.ts` 20, `signal-orchestrator.ts` 15, `shared/schema.ts` 13, archivers/shadow-store/governance-engine/ml-calibration/quality_index/score-calculator/eval-cycle …). `hybridScore`/`hybrid_score` ≈ 20 more files.

## 3. THE THREE BUCKETS (the removal MUST separate these — this is the whole risk)

**A. RETIRED LOGIC — safe to delete now (rule 18):** the retired finalScore gate + thresholds, the dead finalScore-fallback ranker pair, the hybridScore substitution remnants, `score-calculator.ts`'s `calculateFinalScore` if it has no live caller, any compute that only feeds A or B.

**B. STORED-DATA CONTRACTS — NOT a code delete; a migration + retention decision (§17):** `shared/schema.ts` columns (**⛔ CORRECTED 2026-07-23 — an earlier draft of this line wrongly claimed `rtb_signals.final_score` was already dropped in #555. FALSE, verified at `origin/migration/aws-supabase`: #555 dropped `regime_weight` / `hybrid_score` / `decay_penalty` only (`shared/schema.ts:1944-1945`); **`final_score` SURVIVES and is `.notNull()`** (`:1943`) — so dropping it is a NOT-NULL column drop requiring a real forward+rollback migration, not a no-op. The error was mine (CC-A); it would have made the audit skip the single largest remaining data contract.**), archived rows in `signal-eval-archiver` / shadow sinks / telemetry tables, any `'…'`-style persisted discriminator. Dropping a column is irreversible in data terms — each needs: is anything reading it? is the history worth retaining? forward+rollback migration. **⚠️ rule 20 precedent: the persisted `'paper_sim'` discriminator is KEEP-AS-DATA — there may be similar finalScore stored contracts that stay.**

**C. CONTROL / DIAGNOSTIC RANKERS — a SCOPE DECISION (bucket 2), not an auto-delete:** `computeRankKey` has non-default `control` rankers (`ranking_score` etc.) that fall back to finalScore/rankingScore. These are calibration controls, deliberately kept as A/B baselines against the live `r_multiple`. **Removing them changes what calibration can compare.** Kyle/Langston decide: are the retired-score controls still wanted as baselines, or removed too?

## 4. OBJECTIVES (draft — Langston to shape at Step-1)

- **OBJ-1** — delete bucket-A retired logic (gate, dead ranker, substitution remnants, orphaned compute) with per-symbol caller-tracing (rule 18) AND state-write-tracing (#568: what does the deleted code WRITE that something still reads?).
- **OBJ-2** — VTS removal (`vts-runner.ts`, `vts-service.ts`): confirm VTS only STORES these (doesn't rank/decide on them), then remove the writes; declare the VTS telemetry-shape change.
- **OBJ-3** — schema/archive data-contract disposition (bucket B): enumerate every remaining column/table, decide keep-as-data vs drop-with-migration per item, forward+rollback migrations.
- **OBJ-4** — control-ranker decision (bucket C): Kyle/Langston ruling on whether the retired-score baseline rankers stay.

## 5. OPEN QUESTIONS FOR LANGSTON (Step-1)

1. **Sequencing:** one batch, or split A (logic) from B (data-contract migration) so a schema drop doesn't ride with a large logic delete? My lean: **split** — ship the dead-logic delete first (reversible, low-risk), then the schema/archive migration as its own sub-batch with the retention decision explicit.
2. **Control rankers (bucket C):** keep the retired-score baselines for calibration comparison, or remove? (Kyle may own this.)
3. **`calculateFinalScore` / `score-calculator.ts`:** live callers, or fully dead?
4. **hybridScore in the shadow sink:** #555 made it honest-null — is the column/write removed here or does the calibration sink still want the (now-honest) field?
5. **Scale/risk:** this is ~30 files incl. the SQE and VTS. Is a single batch appropriate, or a phased campaign? (I flagged to Kyle this is large.)

## 6. NOTE ON SCALE (honest)

This is a major removal touching the SQE, RTB ranker, VTS, telemetry, archival, governance-engine, ML-calibration, and the schema. The dead-logic delete is mechanical once the buckets are separated; the **data-contract and control-ranker decisions are the load-bearing judgment**. Recommend Step-1 rules the sequencing (§5.1) before any code, and the implementation runs as a phased set with each phase independently reviewed — not one 30-file diff.
