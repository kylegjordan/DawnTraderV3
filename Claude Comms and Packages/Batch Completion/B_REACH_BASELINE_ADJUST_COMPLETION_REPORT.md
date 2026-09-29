# B-REACH-BASELINE-ADJUST — COMPLETION REPORT · **✅ CLOSED 2026-09-29 — the pre-registered rollback trigger FIRED on arm 1; Kyle kept every row. The arm as written counted the wrong thing, and counted on trades opened it still fires narrowly (25.5 %)**

`PHASE_19_PLAN` row `3n.v` · owner **CC-B** · **CHANGE-CLASS: architecture** · deployed **`40f22a1bb0ac1f3073d926decd453c3ec10b8a2a`** 2026-09-20T21:19:40Z · **STEP: 11 of 11.** Converted from `B_REACH_BASELINE_ADJUST_PROGRESS_REPORT.md` (renamed in the same commit, history kept).

## 0. THE RESULT AND THE DECISION — read this first
**Window: 2026-09-20T21:19:40Z → 2026-09-27T21:19:40Z. Read by CC-B on 2026-09-28 on staging (queries named per line).**

### (a) What data came in, against the criterion as pre-registered
⚠️ **WHAT WAS WRITTEN WHEN.** The rollback trigger was pre-registered in `B_REACH_BASELINE_ADJUST_PRE_AUDIT.md:66`, before the deploy: *"if within 7 days of the deploy `strong_bull_trend` exceeds 25 % of all active-path signal ADMISSIONS on its class, or the active pool's realised 7-day P&L on that class falls below its pre-deploy 7-day figure by more than 2 percentage points, the two `reach_atr_max` rows are reverted to 4.0 by the rollback migration and the batch returns to Step 2."* **§4's PASS block (a)–(c), its "either class" wording and its "the geometry rows" consequence were written 22 minutes AFTER the restart** (`0043bdf9e`, 2026-09-20T21:41Z), while the gates were still unexercised, so no outcome could have shaped them. But §4's heading, "written BEFORE the deploy", overstates it. §4 is left exactly as written; this note corrects its heading.
⚠️ **ONE POPULATION (Langston's Step-11 condition 2):** `bc199185e` deployed inside the window, 2026-09-22T14:39Z. Its only `server/` changes are `8a-P4c` — `xstockTransactableSides` moved into the shared module, plus an xStock VTS telemetry instrument — so crypto is behaviourally unchanged across it and the crypto window is one population.
| arm / condition, as written | outcome | object |
|---|---|---|
| **Arm 1** — *"`strong_bull_trend` exceeds 25 % of all active-path signal ADMISSIONS on its class"* | ⛔ **FIRES on crypto: 49,626 of 78,013 admission rows = 63.6 %.** The same holds on every other count tried: 523 of 599 distinct symbol-days; **12 of 47 trades opened = 25.5 %** (one of the 12, CHIP/USD, never filled). xStock: 0 of 902 — **"not measured", as pre-registered**, never "passed". **Counted on what actually opened, it STILL FIRES, narrowly: 12 of 47 trades opened = 25.5 %** (`closed_trades` by `opened_at`; the engine's own admission rows in the archive, `source='active-execution-engine'`, `reject_stage='admitted'`, give the same 12 of 47). **On trades FILLED (`closed_trades.actual_entry_price IS NOT NULL`; 3 of the 47 never filled) it is 11 of 44 = 25.00 % — exactly at the line, not exceeding it. In no reading does it cleanly pass** (corrected at Langston's Step-11 condition 1: `entry_price` is NOT NULL on that table and cannot tell a fill from a non-fill). | `signal_eval_archive`, `source='signal-orchestrator'`, `mode='paper_sim'`, `reject_stage='admitted'`, captured in the window; trades from `closed_trades` `mode='paper'` by `opened_at` |
| **Arm 2** — *"the active lane's realised 7-day P&L on either class falls more than 2 percentage points below its baseline"* | ✅ **Does not fire.** Crypto **+1.35 %** mean net over **n=44** closes (21 of 44 above zero = 47.7 %) against the −0.8981 % baseline; xStock **+1.78 %** over **n=5**. ⚠️ The baseline re-derived for control on the same query came out −0.79 % (n=51) and −0.61 % (n=42): close, not exact, because the 09-21 read used a slightly different window end. ⚠️ **The 44 closes are a mixed cohort:** 4 were opened before the deploy and 2 never filled (booked at 0 %). Counting trades OPENED in the window instead, crypto is **+0.15 % (n=46, through today — 6 of them closed after the window)**, about 1 pp above the baseline, so the arm still does not fire. xStock's 5 closes include 1 never-filled, n≈4, which is **not measured**, the same standard arm 1 applies to xStock. | `closed_trades` `mode='paper'`, mean `net_pnl_percent`, `closed_at` in the window |
| **PASS (a)** — a `strong_bull_trend` signal reaches the active pipeline past the second gate | ✅ **12 crypto `strong_bull_trend` trades opened in the window, 11 of them filled** (17 opened by 2026-09-28). An opened trade is past every gate. | `closed_trades` by `opened_at`, `strategy_name` |
| **PASS (b)** — the post-deploy `reachDrops / evals` delta for `strong_bull_trend` is ~0 on both classes | ✅ **Crypto 9 reach drops in 19,556 evals (0.05 %)**, against **0 passes of 367,009** before; **xStock 0 of 7 (too few to judge).** ⚠️ Measured over the first 44 hours, not the full 7 days, from the guard's in-memory counters, which the archive tables cannot re-derive. | the guard's own counters, deltas from the deploy snapshot to 2026-09-22T17:26:51Z (§3) |
| **PASS (c)** — neither arm fires | ⛔ **Arm 1 fired**, so **§4's criterion is a FAIL.** ⚠️ The PASS/FAIL block is §4's, written after the deploy; the pre-audit's own terms are simpler and give the same answer: arm 1 fired, so the pre-registered consequence was to revert the two `strong_bull_trend` `reach_atr_max` rows to 4.0 and return to Step 2. **Kyle overrode that consequence.** | — |

**Context, not a criterion — PREVIOUSLY STATED: +3.02 % (n=12). NOW: +1.07 % over the 11 filled trades (5 above zero), all closed. REASON: the 09-28 read counted two still-open trades at zero; both stopped out on 2026-09-29 (PENGU/USD −11.99 %, S/USD −12.54 %), and CHIP/USD never filled.** The 11 range from −25.5 % to +34.3 %, so this is thin evidence either way. The other 35 opened in the window: **−0.14 %** over 34 closed. **The other three adjusted cells showed no measurable effect in the week:** crypto `vwap_pullback` admissions 361 → 383 and trades 1 → 0; crypto `vwap_bounce` passes the geometry guard (176 of 176) but reached **zero** SQE admissions in either week, so something downstream of this batch still stops it; xStock `vwap_pullback` admissions 299 → 265 and trades 17 → 0 — ⚠️ **but xStock opening fell on every strategy, and why is NOT established.** Coltrane measured the shared total-exposure cap refusing 43 of 43 xStock attempts on 09-17..18 (before this window) and 99.4 % of attempts since 09-22; the max-open-positions check is another candidate — it was running during the window and still is: CC-C's `e41359ee8` retires it in code (2026-09-29) but is not deployed. **The xStock cells are too thin to judge either way.**

### (b) What decision was taken on it, and by whom
**KYLE, 2026-09-28 (Desktop chat): keep `strong_bull_trend` as shipped, and every other row.** His reasoning, verbatim: *"There is no limit to its size, so 64% is a comment on the number of SBT signals passing the SQE relative to others. Once in the RTB, then the ranking system should take over. If I am correct, then we should leave SBT alone and look at how the other strategy adjustments look."* **The object, re-derived at the ref by a second reader and re-checked by CC-B:** the `admitted` row (`signal-orchestrator.ts:1854-1888`) is written AFTER the SQE and AFTER a fire-and-forget RTB enqueue (`:1486-1488`) whose outcome it does not wait for — so it is written even when the RTB refuses the signal (pair exclusivity, class gate, re-entry cooldown, or an existing kept row; in the window, 2,224 crypto `strong_bull_trend` pair-exclusivity refusals — `signal_eval_archive` rows with `reject_stage='sqe'` — each also carry an `admitted` row within seconds) — and a persisting setup re-mints it on every 30-second cycle (measured at about 1.3 rows per symbol per cycle). **So arm 1 counted how long `strong_bull_trend` setups stayed alive after passing the SQE — not how many entered the RTB, and not what the ranking opened.** ⚠️ **Counted on the right object it still fires, by half a point: 25.5 % of trades opened (25.00 % of trades filled, on the line).** The archive writer can drop rows on overflow, so the counts are a floor; the 63.6 % share is not.
**Reported to Kyle AFTER his decision, because both bear on it:** the `strong_bull_trend` figure he was shown (+3.02 %) is now +1.07 % over 11 filled trades, and counted on trades opened the crowding arm still fires, by half a point (25.5 %). **His call stands unless he reopens it.**
⇒ **NO ROLLBACK — A KYLE OVERRIDE OF THE PRE-REGISTERED CONSEQUENCE, recorded as one. The six rows stay. The pre-registered text is kept exactly as written, not rewritten to pass. The arm counted the wrong thing; counted on the right thing it still fires by half a point; Kyle's reason is not the count but the premise — the RTB ranking decides what opens.**
⛔ **The lesson, recorded because it is mine:** a crowding guard must count what the ranking OPENS, not SQE-pass rows that repeat every cycle; and a pre-registration must be the document written before the deploy, not a restatement added after it. `MISTAKE: wrong-object [B-REACH-BASELINE-ADJUST] — the pre-registered crowding arm counted SQE admission rows (re-counted every cycle into an unbounded RTB pool) instead of trades opened.`

### (c) Objectives
| objective | result | evidence |
|---|---|---|
| **OBJ-1** unblock `strong_bull_trend`, both classes | **YES crypto · PARTIAL xStock** | crypto 99.90 % guard pass, 12 trades opened (11 filled, +1.07 % mean); xStock 7 of 7 guard passes but no SQE admission and no trade in the window — unexercised |
| **OBJ-2** re-seed `min_rr` where the floor sat above its own mean | **PARTIAL, by design** | crypto `vwap_pullback` 2.44 → 1.95 shipped (its rr drops went to 0); crypto `reverse_impulse` withdrawn on evidence and xStock `morning_star` on no evidence (Step 2) |
| **OBJ-3** ceilings for the continuous cells | **PARTIAL, by design** | xStock `vwap_pullback` 6.0 shipped (guard pass 9.20 % → 36.3 %); xStock `sma_trend_ride`, `vwap_bounce`, `range_trade` withdrawn; crypto `vwap_pullback` ceiling recorded and not acted on (`PRE_AUDIT:54`, the band sits at att ≈ 12) |
| **OBJ-4** strike the one-way lock, widen the spread rule | **YES** | `ADJUSTMENT_FRAMEWORK.md` (tier ledger §6) |
| **OBJ-5** record `dhma` as a decision at Phase-25 25-20 with both gates' numbers | **YES — landed at this conversion.** ⚠️ It was NOT in row 25-20 until now: `P-7` placed it, and the roadmap row never received it (found by re-reading the row). Now added to `POST_AUDIT_ROADMAP.md` row 25-20. | this commit |
| **OBJ-6** delete `target_floor_pct` with a replacement fail-hard | **YES** | 0 rows after deploy; `DELETED_COMPONENTS_LOG.md`; the replacement assertion's residual is `#1069` |
| **OBJ-7** correct the two stale statements | **YES** | `SYSTEM_IMPACT_MAP.md:232` struck with the original kept; row `2.4g-3` premise corrected at `3n.v` |

**Fresh-reader record (three rounds, each a new reader, the last reading the object at the ref and the live DB):**
- `REVIEWER r1: claim-only · what else is consistent with the mechanism and the window numbers · hits: admitted rows precede nothing and include RTB refusals; the +3.02 % counted two open trades at zero; the win rate was wrong · re-derived y · changed: mechanism rewritten, figures corrected`
- `REVIEWER r2: object · same · hits: 5 not 6 above zero; ~1.3 rows per cycle not 2; §4's PASS block post-dates the deploy; the right-object count sits at 25 %; arm 2's cohort is mixed; the xStock cause not established · re-derived y · changed: all six stated`
- `REVIEWER r3: object · same · hits: 12 of 47 = 25.53 % FIRES; the max-open-positions retirement is not deployed; the PASS/FAIL verdict is §4's, the pre-audit's consequence is the SBT revert; +0.15 % includes 6 post-window closes; name the 2,224 object · re-derived y · changed: all stated; loop capped at three rounds`
⚠️ **The narrowing across rounds was checkable-for-checkable, and it moved the finding AGAINST the batch** (the crowding arm fires even on the right object). That is recorded because it is the direction a report under pressure would not drift.

**LANGSTON, STEP 11, 2026-09-29T13:48Z: CLOSE CONFIRMED with two conditions, both landed above.** He re-derived every load-bearing number on staging and ruled the override **correctly recorded, not a reason to reopen**: the P&L arm fires in no reading, n=11 spanning −25.5 % to +34.3 % cannot carry a reversal, and strong_bull_trend was the better half (+1.07 % vs −0.14 %). **But Kyle's reason is a premise the window did not test** — nothing bounds one strategy's share of what opens — so the successor test is placed: `HOME: B-CROWDING-CRITERION-OBJECT (#1095), owner CC-B, placed in SPRINT_TO_LIVE_PLAN at row 135a after #221 (ranking) and in PHASE_19_PLAN at 3n.v6 after 3n.v5`. *An overridden trigger needs a successor test or it is a bypass* (his rule).
**Split out, each placed:** `3n.v2` `B-VTS-CLASS-LABEL-INTEGRITY` (`#1068`) · `3n.v3` `B-GATE-WILDCARD-REFUSE` (`#1069`) · `3n.v4` `B-SILENT-STRATEGY-CENSUS` (`#1070`) · `3n.v5` `B-OPEN-OBLIGATION-SWEEP` (`#1071`).
**CI:** run `35538205688` on the deployed head `40f22a1bb`, Build · Test Suite · TypeScript Check · Docker Build, 4/4 per job. No code changed at conversion.

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
| T1 | `BATCH_CATALOG.md` | every batch | ✅ | Entry added at deploy; **flipped to CLOSED at conversion** with the FAIL-as-written and Kyle's keep. |
| T1 | `PHASE_HISTORY.md` | every batch | ✅ | The narrative: an audit that overturned its own plan twice, and three corrections that were each a wrong OBJECT rather than a wrong number. |
| T1 | `PHASE_19_PLAN.md` | Phase 19 only, every batch | ✅ | `3n.v` → DEPLOYED/observation, then **CLOSED at conversion**; `3n.v2`–`3n.v5` placed with owners, positions and issue numbers. The Sprint to Live plan's section-0 plate line is marked closed too. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_B.md` | every batch | ✅ | **The shared file WAS edited and it was a correction, not an addition:** its migration line said *"rollback files stay OUT"* of git — false against 94 tracked rollbacks, and acting on it shipped a batch whose rollback existed on one laptop. Own file updated with position and the traps. |
| T1 | the batch `SCOPE` | written at Step 1 | ✅ | r4, change-class declared before code existed. |
| T1 | the batch `PRE_AUDIT` | written at Step 2 | ✅ | Audit before plan, every plan item back-referenced, plus an ADDENDUM recording three of its own claims overturned. |
| T1 | the `COMPLETION_REPORT` | written at Step 11 | ✅ | **Converted from the progress report on 2026-09-29** (§0 added: the data against the pre-registered text, and Kyle's decision). |
| T1 | THE FOUR SESSION TASK LISTS | every batch close | ✅ mine / N/A ×3 | `CC_B_SESSION_TASK_LIST.md` updated (batch status + the four new rows); CC-A, CC-C and Infra are not mine to touch. |
| T1 | Langston's `MEMORY.md` | every batch | ✅ | **Written by Langston, 2026-09-29T13:48Z** (the close, both conditions, the override ruling and the home), plus two rules lifted into his reviewer ledger. ⚠️ This row was first ticked on the asking, one reply before the write existed — his nit, corrected. |
| T2 | `SYSTEM_MANUAL.md` | architecture · strategy logic · math | ✅ | New subsection: what both gates are set to and what carries each value; the refused-signal instrument and the three properties that bind it; why the deleted constant needed a replacement; the revert order. Two stale passages marked. |
| T2 | `SYSTEM_IMPACT_MAP.md` | components, cross-cutting state | ✅ | The gate entry described a floor-LIFT removed in June **while contradicting itself ten lines lower**; corrected, original kept struck because the drop reasons still carry its names. |
| T2 | `RUNNING_ISSUES.md` | issues opened or closed | ✅ | `#1068`–`#1071` filed, each pointing at its placed plan row. |
| T2 | `CHANGES_AND_FIXES.md` | bug / risk registry | ✅ | Five fixes with their before-numbers; four residuals, the first being that the gates are unexercised. |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | parameter-adjustment governance | ✅ | **The no-loosening lock STRUCK per Kyle, with what it cost recorded beside it, replaced by the baseline-placeholder regime — plus three clauses: the spread rule widened to ANY geometry threshold, Langston's no-threshold-on-a-spike clause, and the control rule this batch earned.** |
| T2 | `DELETED_COMPONENTS_LOG.md` | a component removed | ✅ | `target_floor_pct` — census, the throw it silently carried, the replacement, the residual, and the revert order. |
| T2 | `POST_AUDIT_ROADMAP.md` | phase-level change | ✅ | **At conversion:** row 25-20 now carries `dhma` with both gates' numbers (OBJ-5 had not landed). |
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
