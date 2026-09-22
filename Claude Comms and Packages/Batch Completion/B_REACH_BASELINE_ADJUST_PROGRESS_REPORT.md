# B-REACH-BASELINE-ADJUST — PROGRESS REPORT · **OPEN — the 7-day rollback window, and the gates are still unexercised**

`PHASE_19_PLAN` row `3n.v` · owner **CC-B** · **CHANGE-CLASS: architecture** · deployed **`40f22a1bb0ac1f3073d926decd453c3ec10b8a2a`** 2026-09-20T21:19:40Z · **STEP: 10 of 11 · NEXT STEP: 11 of 11 (this report converts when the window closes AND a decision is taken).**

## 1. What the batch is for
**Kyle, 2026-09-15**, striking the rule that blocked it: *"we are protecting a theoretical placeholder and not using all of the data that we've been gathering… this is just our new baseline placeholder from which we can still calibrate later."* **2026-09-20**, releasing the hold and widening it: *"strong bull trend and VWAP pullback settings aren't the only settings that should be adjusted. Please check the other strategies for adjustments."*
Two geometry gates stand between a strategy's signal and a trade — the **reward-to-risk floor** and the **reachability ceiling**. Neither had ever been set from realised outcomes. **Finished outcome: every gate value is either a placeholder with a stated falsifier and a rollback, or it is deliberately unchanged with its reason recorded where the next person will hit it.**

## 2. Every step, with its evidence
| step | evidence |
|---|---|
| 1 scope | `Scope Files/B_REACH_BASELINE_ADJUST_SCOPE.md` r4, change-class declared. Langston **APPROVED with six conditions**. Two fresh-reader rounds before dispatch caught the tail-counter denominator (a ratio across two windows) and an era claim — **both were errors I had already published.** |
| 2 audit+plan | `Scope Files/B_REACH_BASELINE_ADJUST_PRE_AUDIT.md` + **ADDENDUM r2**. Langston **PROCEED**. ⛔ **The audit overturned the scope's own plan: five of six proposed cells did not survive contact with outcomes.** |
| 3 implementation | `cb763da5a`. tsc baseline **377 = 377**; reach suite **28/28**; the replacement assertion **mutation-proved**; migration **dry-run on live staging in a rolled-back transaction** (INSERT 0 6, DELETE 2, six invariants pass) and **invariant (5) mutation-proved** (flip the expected multiplier → raises and aborts). |
| 4 code review | `Change Lists/B_REACH_BASELINE_ADJUST_CHANGE_LIST.md`. **FIVE ROUNDS.** CHANGES-NEEDED ×3 → a RULING that the xStock ceiling ships → **APPROVED with one condition**, landed at `40f22a1bb`. |
| 5 CI | run `35538205688` on the deployed head: Build · Test Suite · TypeScript Check (baseline gate) · Docker Build — **4/4 per job**. |
| 6 deploy | `dt-deploy … --by cc-b` — *"OK — live, engine resumed, identity asserted"*. `migrate_ran_at 21:19:28Z`, restart 21:19:40Z ⇒ **migration before restart, verified at the object.** Rollback: `2026-09-21-…-rollback.sql`, **in git**, ⛔ **SQL FIRST, THEN THE SHA**. |
| 7 verification | §3. **PARTIAL and stated as partial.** |
| 10 governance | §6. |

## 3. What is LIVE, measured — and what is NOT
✅ **The six rows read back at the DB after the deploy**, and `target_floor_pct` returns **0 rows**.
⛔ **AT DEPLOY + 15 MIN THE GATES WERE UNEXERCISED** — 3 `strong_bull_trend` evaluations, all dropping on `invalid_atr` before reaching either threshold, and zero evaluations elsewhere. **That was the post-restart indicator warm-up, and it is left here because it is what the record said at the time.**

✅✅ **AT DEPLOY + 44 HOURS THE FIX IS DECISIVE.** Deltas from the deploy snapshot to 2026-09-22T17:26:51Z:

| cell | evals | passes | reach drops | rr drops | was |
|---|---:|---:|---:|---:|---|
| crypto `strong_bull_trend` | 19,556 | **19,537 (99.90 %)** | 9 | 0 | **0 passes of 367,009** |
| xStock `strong_bull_trend` | 7 | **7** | 0 | 0 | **0 passes of 406** |
| crypto `vwap_bounce` | 176 | **176** | 0 | **0** | 0.75 % refused on float noise |
| crypto `vwap_pullback` | 12,835 | 435 | 12,400 | **0** | 88.35 % rr-refused |
| xStock `vwap_pullback` | 5,093 | **1,848 (36.3 %)** | 2,840 | 0 | 9.20 % pass |

⭐ **AND THE SEQUENTIAL-GATE FINDING (P-3) IS CONFIRMED IN THE LIVE DATA, WHICH IS THE PART TO KEEP:** crypto `vwap_pullback`'s rr drops went to **zero** and its reach drops became the binding constraint (12,400). **Lowering a floor did not admit the refused population — it released it into the ceiling behind it, exactly as predicted, and the naive single-gate estimate would have overstated the benefit ~4×.**
⚠️ **NOT YET SETTLED: PASS-arm (a) — a `strong_bull_trend` signal reaching the active pipeline PAST the second gate application. A guard pass is not a trade, and that arm is still unmeasured.**

## 4. ⛔ THE PRE-REGISTERED CRITERION — written BEFORE the deploy, in the audit and in the rollback file
**Window: 7 days from 2026-09-20T21:19:40Z.**
**BASELINES, CAPTURED BEFORE THE DEPLOY** (live lane, trailing 7 days): **crypto −0.8981 % over n=50 (38.0 % win) · xStock −0.6664 % over n=41 (31.7 % win).**
**ROLLBACK TRIGGER — either arm fires ⇒ revert the geometry rows and return to Step 2:**
1. `strong_bull_trend` exceeds **25 %** of all active-path signal ADMISSIONS on its class; **or**
2. the active lane's realised 7-day P&L on either class falls **more than 2 percentage points** below its baseline above.
⚠️ **ARM (1) MAY BE UNREADABLE ON xSTOCK for lack of volume — a zero there means "not measured", NEVER "passed".**
**PASS — all three:** (a) at least one `strong_bull_trend` signal reaches the active pipeline **past the second gate application** (a guard pass is not a trade); (b) the post-deploy `reachDrops / evals` delta for `strong_bull_trend` is **~0** on both classes; (c) neither rollback arm fires.
**FAIL — any one:** either trigger arm · or the reach-drop delta is unchanged, which would mean the ceiling is not being read at all.

## 5. What is unproven, and what would falsify it
- **The crypto leg's cohort is a mixture, and its segments are small.** Recut at every epoch bump: cohort −1.485 % (n=1,309) → −3.994 % (n=90) → +2.090 % (n=211) → **+0.710 % (n=158)**; the live-lane control over the same segments runs n=164 / 12 / 14 / 33 and swings **+2.556 % → −1.840 %.** ⇒ **At that resolution neither side supports a strong claim. What carries this leg is Kyle's replay evidence plus the trigger above — not the cohort.**
- **The xStock leg has NO outcome evidence at all.** Its cohort was withdrawn as an artifact. It ships on arithmetic — both multipliers are single `'*'` rows ⇒ class-invariant geometry ⇒ categorically off by construction — **ruled by Langston**, who also measured that the corpus a hold would wait for does not exist: all 256 rows in that cell, all-time, are three symbols priced ≤ $7.43.
- **The replacement fail-hard rests on a property of the DATA.** One wildcard-`asset_class` `min_rr` row defeats it. Invariant (4b) refuses to apply while one exists; the test **pins the gap rather than closing it**; `#1069` / row `3n.v3` is the durable fix.
- **Per-class VTS statistics over this window are contaminated** — `#1068`.
- **Duration is uncontrolled** between cohorts (crypto medians 295 / 1,739 / 1,045 min), so no percentage here is capital-time comparable.

## 6. Governance files changed — the tier ledger
**CHANGE-CLASS: architecture**

| # | document | WHEN IT APPLIES | verdict | one line |
|---|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | every batch | ✅ | Entry added, OPEN-observation, with the six shipped rows, the five withdrawals and why it is open. |
| T1 | `PHASE_HISTORY.md` | every batch | ✅ | The narrative: an audit that overturned its own plan twice, and three corrections that were each a wrong OBJECT rather than a wrong number. |
| T1 | `PHASE_19_PLAN.md` | Phase 19 only, every batch | ✅ | `3n.v` → DEPLOYED/observation; `3n.v2`–`3n.v5` placed with owners, positions and issue numbers. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_B.md` | every batch | ✅ | **The shared file WAS edited and it was a correction, not an addition:** its migration line said *"rollback files stay OUT"* of git — false against 94 tracked rollbacks, and acting on it shipped a batch whose rollback existed on one laptop. Own file updated with position and the traps. |
| T1 | the batch `SCOPE` | written at Step 1 | ✅ | r4, change-class declared before code existed. |
| T1 | the batch `PRE_AUDIT` | written at Step 2 | ✅ | Audit before plan, every plan item back-referenced, plus an ADDENDUM recording three of its own claims overturned. |
| T1 | the `COMPLETION_REPORT` | written at Step 11 | ⏳ | **This progress report stands in its place.** It converts when the 7-day window closes **and** a decision is taken on the result. |
| T1 | THE FOUR SESSION TASK LISTS | every batch close | ✅ mine / N/A ×3 | `CC_B_SESSION_TASK_LIST.md` updated (batch status + the four new rows); CC-A, CC-C and Infra are not mine to touch. |
| T1 | Langston's `MEMORY.md` | every batch | ⏳ | Owed at conversion; he holds the Step-1, Step-2 and five Step-4 rulings already. |
| T2 | `SYSTEM_MANUAL.md` | architecture · strategy logic · math | ✅ | New subsection: what both gates are set to and what carries each value; the refused-signal instrument and the three properties that bind it; why the deleted constant needed a replacement; the revert order. Two stale passages marked. |
| T2 | `SYSTEM_IMPACT_MAP.md` | components, cross-cutting state | ✅ | The gate entry described a floor-LIFT removed in June **while contradicting itself ten lines lower**; corrected, original kept struck because the drop reasons still carry its names. |
| T2 | `RUNNING_ISSUES.md` | issues opened or closed | ✅ | `#1068`–`#1071` filed, each pointing at its placed plan row. |
| T2 | `CHANGES_AND_FIXES.md` | bug / risk registry | ✅ | Five fixes with their before-numbers; four residuals, the first being that the gates are unexercised. |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | parameter-adjustment governance | ✅ | **The no-loosening lock STRUCK per Kyle, with what it cost recorded beside it, replaced by the baseline-placeholder regime — plus three clauses: the spread rule widened to ANY geometry threshold, Langston's no-threshold-on-a-spike clause, and the control rule this batch earned.** |
| T2 | `DELETED_COMPONENTS_LOG.md` | a component removed | ✅ | `target_floor_pct` — census, the throw it silently carried, the replacement, the residual, and the revert order. |
| T2 | `POST_AUDIT_ROADMAP.md` | phase-level change | N/A | No phase-level change; all of it sits inside Phase 19. |
| T2 | `AUTHORITY_BASELINE.md` | constitutional baseline | N/A | No authority or risk boundary moved. |
| T2 | `STORAGE_POLICY.md` | retention, tiers | N/A | No retention or tier change. |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | VTS expansion | N/A | No VTS expansion change. ⚠️ Its temporary xStock working list was reviewed and had no item this batch touches. |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | onboarding learnings | N/A | No new asset-class onboarding learning. |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | the METHOD changed | N/A | No role, gate or rule of the method changed — five review rounds used the existing one. |
| T2 | `LANGSTON_ARCHITECTURE.md` | the reviewer's build | N/A | His model, runtime and read path unchanged. |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | an exception granted | N/A | None granted. |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | the alert process | N/A | Unchanged. One alert (`51f8e4b9`, deploy drift) was **resolved** by this deploy under the existing process. |
| T2 | `CLAUDE.md` / `CONDUCT.md` | a rule changed | N/A | No rule changed. |

## 7. The mistakes this batch produced, recorded because three are the same shape
- **`wrong-object` ×3** — a control from the wrong execution lane; an epoch asserted off a column default; a cohort read without asking why it was too clean.
- **`fix-follows-pointer` ×3** — grepped the literal a reviewer quoted, declared the class clean, and left the same claim standing two lines away. **The third instance was a withdrawal list whose TOTAL was right and whose membership was wrong in both directions** (`enumerator-blind-spot`).
- **A rollback file left out of git** on a note that contradicted the repo, and **a revert order written backwards** — in the same batch whose central argument is why that constant could not simply be deleted.
