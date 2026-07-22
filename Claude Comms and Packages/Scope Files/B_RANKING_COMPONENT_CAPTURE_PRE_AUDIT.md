# B-RANKING-COMPONENT-CAPTURE — PRE-AUDIT (#555)

**change-class: non_architecture** · **Owner:** CC-A · **Date:** 2026-07-22

> ⚠️ **RETROACTIVE — written after the batch shipped.** See §0 of the scope file. The verification below genuinely happened and is quoted from the work; the *document* is late, not the analysis.

---

## 1. THE CENSUS (the claim a column DROP lives or dies on)

**Question:** who reads `rtb_signals.{regime_weight, hybrid_score, decay_penalty}`?

**Method — a census, not one grep** (a single naming form is a sample):
1. **Raw snake_case** across server/client/shared/scripts → only schema definitions, the shadow-store's own INSERT column lists (different tables), and unrelated config knobs (`regime_weight_min`, `decay_penalty_cap`).
2. **camelCase reads enumerated BY RECEIVER** (~57 distinct receivers): `trade.` `input.` `extendedMetrics.` `thresholds.` `weights.` `metrics.` `tradeData.` `_acq.` etc.
3. **Destructuring** → none.
4. **Ambiguous receivers resolved by file:** of 11 candidate files, **10 contain ZERO `rtb_signals` references**, so their reads cannot be column reads. The 11th (`signal-orchestrator.ts`) references the table only in COMMENTS; its reads are on `extendedMetrics`/`hybrid` objects.
5. `storage.ts:3927-3929` is the upsert WRITE mapping (`data.X`), fed `undefined` forever — a writer, not a reader.

**RESULT: exactly three readers**, all in the single shadow-pairing capture block. **⇒ zero readers after the re-point.**

**★ A FALSE POSITIVE I NEARLY FILED AS A CONTRADICTION:** `grep "s\.regimeWeight"` returned **18 hits**, and I was about to tell Langston his deletion ruling was wrong. They were a **regex artifact** — `s\.` matching the trailing "s" of `metricS.`, `weightS.`, `thresholdS.`, `extendedMetricS.`. A word-boundary pattern gives exactly one. **Checking the hits before firing is the only reason a correct ruling wasn't wrongly contradicted.**

**INDEPENDENT CONFIRMATION:** Langston re-derived the census himself at `58d8f8f94` (explicitly not on my report) and reached the same three lines.

## 2. SIM / CROSS-CUTTING STATE

- The capture writes `rtb_shadow_pairings` / `rtb_shadow_pool_members` via `rtb-shadow-store.ts`, documented as the **ONLY writer** and a *"pure B5/B6 analysis sink"* whose isolation from learning consumers is a **deliberate designed invariant** (reorg-B4, Langston Step-2) — **not** evidence of death. §15/delete therefore does **not** apply to the sink.
- **DB-side:** a live `pg_depend`/`pg_rewrite` query returned **ZERO views or matviews** referencing `rtb_signals`. No external consumer blocks the drop.
- **Deploy ordering is load-bearing:** schema fields leave in the same commit, so new code never SELECTs the dropped columns; running the migration against older code would break its SELECT. **Code first, migration second.**

## 3. THE INSERT-PATH TRACE (what Langston's condition-2 caught)

Live metadata showed `regimeWeight`/`hybridScore`/`decayPenalty` populated **110/110** rows — but **all 110 were `status='reconfirmed'`**, and the refresh is what writes those keys. The sample could not speak to a never-refreshed row. Tracing the insert instead:
- `sqeSignalInput.metadata` (`signal-orchestrator.ts:1078-1107`) carries strategyWeight/exposureBias/admissionBasis/netEvAtAdmit/assetClass/maxHoldingMs/`_displayContext` — **not our three** (they sit top-level at `:1050-1052`).
- `enrichedMetadata` (`ready_to_buy_service.ts`) spreads `input.metadata` + adds only sourcePool/signalType/assetClass/rankingScore.

**⇒ at INSERT a new row had the values in NEITHER store** — so the re-point alone would still record NULLs for any pre-first-refresh capture. **This is why OBJ-2 exists.** A measurement that read as 100% coverage was blind to the only case that mattered.

## 4. SEMANTICS CHECKED BEFORE WRITING (OBJ-2)

- `regimeWeight` — genuine admission-time value. Clean.
- `decayPenalty: 0` — **honest, not a placeholder**: the formula is `λ × ageMinutes` and a just-queued signal has age 0, so 0 is the TRUE state-at-admission. The first refresh overwriting it is the value *evolving*, not disagreeing.
- `hybridScore` — **DELIBERATELY OMITTED.** Its source substitutes confidence (`?? extendedMetrics.confidence`), and both refresh paths repeat the fallback and write it back, so a substituted confidence is indistinguishable from a real hybrid score at every downstream point. Capturing it would bake the substitution into calibration. Langston ruled honest-null; the substitution removal became OBJ-5.

## 5. GOVERNANCE APPLICABILITY

`RUNNING_ISSUES` (#555) · `DELETED_COMPONENTS_LOG` (the column drop) · `BATCH_CATALOG` · `PHASE_HISTORY` · **`SYSTEM_IMPACT_MAP` — APPLICABLE** · **`SYSTEM_MANUAL` — proposed N/A** (telemetry/data-capture, no architecture/strategy/math change), *pending Langston confirmation in GOVERNANCE_EXCEPTIONS.md — not self-certified.*
