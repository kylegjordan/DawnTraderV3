# B-FEED-MISMATCH-FIX — PROGRESS REPORT · **OPEN — waiting on the four unobserved close arms**

`PHASE_19_PLAN` row `3n.u` · owner **CC-B** · **CHANGE-CLASS: architecture** · deployed **`323ae277641368acb057e8ffa7643894aa1c2799`** 2026-09-19 00:02:43Z · **STEP: 10 of 11 · NEXT STEP: 11 of 11 (this report converts to the completion report when the window closes).**

## 1. What the batch is for
Kyle, 2026-09-19: *"fix the incorrect feeds that are not going to be fixed by analyst."* The `3n.t` per-situation audit sorted every price defect into two piles; everything about which SIDE a price comes from went to CC-C's `B-PRICE-SIDE-BY-JOB`. What was left is the CLOSE: how a position is priced when it is forced out. Finished outcome: **no close books a price nobody was offering, and no close invents one when none exists.**

## 2. Every step, with its evidence
| step | evidence |
|---|---|
| 1 scope | `Scope Files/B_FEED_MISMATCH_FIX_SCOPE.md`, change-class declared; Langston **approved** with BLOCKER-1 (C3 does not transfer to a stopped engine) and the Q1/Q2 rulings. |
| 2 audit+plan | `Scope Files/B_FEED_MISMATCH_FIX_PRE_AUDIT.md` **r5** — four rounds. Langston's blockers in order: the fill-harm comparator was a MID not a BID (harm 8/8 → **3/8**, and it does not order by age); the predicate must be **SIGNED**; the reference bid **did not exist at the refusal point**; the hoist that would have fixed that **blanked the maker leg's witness** and inserted an awaited DB read between the depth snapshot and its walk. Cleared 22:50Z with C1-C4. |
| 3 implementation | `51e35b195` (+ `4d86141b6` test fix). tsc 377 = baseline 377; new `b-feed-mismatch-fix.test.ts` 10/10, **mutation-proved** three ways (witness into the taker branch; unsigned predicate; refusal `return` removed — each fails a named test). |
| 4 code review | Change list `Change Lists/B_FEED_MISMATCH_FIX_CHANGE_LIST.md`. CHANGES-NEEDED → both blockers + four conditions landed in `bb31b4923` → **APPROVED** 2026-09-19 00:01:20Z. |
| 5 CI | run `35407191468` on the deployed head `323ae2776`: Build · Test Suite · TypeScript Check (baseline gate) · Docker Build — **4/4**, re-derived by Langston. |
| 6 deploy | `dt-deploy … --by cc-b` — *"OK — live, engine resumed, identity asserted"*. `migrate_ran_at 00:02:31Z` (both migration pairs, date order), constants stamped 00:02:32.763Z, pm2 up 00:02:33.231Z ⇒ **migration before restart, verified at the object**. Rollback: `91647c9b99e2c0c1c548bab6127134301fd5f6a0` + the two `-rollback.sql` in reverse date order. |
| 7 verification (CC-B) | See §3. UI navigated in Claude-in-Chrome (`/paper-trading` → Closed Trades). |
| 8 verification (Langston) | **CONFIRMED** 00:13:29Z, re-derived at the objects; two record corrections applied (restart warm-up ramp; my entry-price misread). |
| 10 governance | See §6. |

## 3. What is LIVE, measured
- **First post-deploy close, 4 s in:** `LOW/USD` — the stuck xStock position behind CC-C's hollow-book alerts. Book **51.8 s** old ⇒ `stale_book`; walked fill **192.50** = witness bid **192.50** ⇒ within `up_tol` ⇒ **booked**, `walk_stale`. It closed at the price buyers were actually showing.
- **Arms observed to 2026-09-20 03:20Z** (31 closes since the deploy): `walk` **19** (warm crypto) · `walk_stale` **3** (xStock) · `flatten_walk_diverged` **1** · maker legs **8** (NULL by construction) · one pre-fill `never_filled` row. **Refusals 0, yields 0.**
- **The flatten path, exercised deliberately (Kyle-approved, 2026-09-20 03:19:06Z):** stopping the engine closed `AMC/USD` through `_flattenOne` → `forceClosePosition` → `closePosition`. Book age **97,445,846 ms (27 h)** ⇒ `stale_book`; diverged ⇒ **booked anyway because a flatten must go flat**, stamped `flatten_walk_diverged`, requested at a `last_known_good` quote (`xstock_rest_gate_reserve`) with its `observedAt` on the row — **not at the entry price**. `[LEARNING_FENCE] AMC/USD … arm=flatten_walk_diverged — excluded from learning capture` fired, and the reconciler ran clean (`reconciled: 0, stillOpen: 0, errors: 0`). Engine restarted 03:19:59Z; `EVAL_EXIT` cycles resumed 03:20:15Z.
- **Found by that same test — `#1067`, placed at `3n.u4`:** the stop's LAST write overflows `run_for_ms` (`integer`) once a session has run > 24.85 days. **The flatten completed; the session row still reads `running` and the caller saw a 500.** Two defects: the overflow, and an elapsed duration written into a column declared as the REQUESTED run length.

## 4. ⛔ THE PRE-REGISTERED CLOSE CRITERION — written BEFORE the data, do not data-mine
**Window (quantity, with a time cap): until 300 taker closes have accumulated since 2026-09-19 00:02:43Z, or 21 days elapse, whichever comes first.**
**PASS — all four:**
1. **Zero harmful closes.** No taker close has `exit_fill_arm IN ('walk','walk_stale','walk_yield')` with `actual_exit_price > exit_ticker_bid × 1.01`. *(The pre-deploy rate on xStock was 3 of 49.)*
2. **No position is stranded by the gate.** Every position that produces a `CLOSE_REFUSED` line closes within `cold_refusal_cap` (60) subsequent cycles — i.e. no `walk_yield` row exists whose position was refused for longer, and no open position carries an unresolved `close-refused-*` alert at window end.
3. **The flatten never books an entry price.** Zero rows with `close_reason IN ('manual_stop','engine_stop_cleanup','stranded_clear')` whose `exit_price` equals the position's entry price to 8 dp with `exit_price_producer = 'position_entry_price_reused'`. *(That producer should now be unreachable.)*
4. **`up_tol` re-derived on post-deploy rows** (both classes) and either confirmed or re-seeded with its new derivation — crypto's current value has **n=0** behind it.
**FAIL — any one:**
- a harmful close as defined in (1) — the gate did not fire where it was built to fire;
- a position held open > 60 cycles by refusals, or still open at window end because of them;
- any row booked at the entry price by a flatten path;
- an arm that cannot be reached at all when its condition demonstrably occurred (e.g. a cold book with no reference that did NOT produce a refusal).
**STILL UNOBSERVED and therefore NOT verified:** the refusal itself · `walk_yield` · `walk_no_reference` · `synthetic_reference`. **Post-deploy silence on these proves nothing** (`#661` leg 3).

## 5. What is unproven, and what would falsify it
- **`up_tol = 0.01` is a CHOICE INSIDE AN EMPTY INTERVAL**, not a derivation: healthy max +0.47% (KTA), lowest harm +5.15% (SPGI), nothing observed between, n=90. **Crypto's row grades n=0 not-warm closes.** Falsified by a post-deploy crypto close refused at a divergence a wider bound would have admitted, or by a harmful xStock row below 1%.
- **The gate cannot see a book and a witness that went stale TOGETHER** (both read 0.00% divergence — SYY at 213 s, NEM hollow at 90 s). That class is decision-side and stays with CC-C's `3b.f-c`/`#943`.
- **On xStock the witness is the SAME TABLE the fill walks** — a consistency record, not a second feed. Only crypto's witness is independent (and lagged 5-9 s).
- **The not-warm counts are by AGE only** (Langston): `min_levels` thin-books are not reconstructable from the row, so 8/49 and 0/45 are **floors**.
- **LIVE-SWAP OBLIGATION:** the gate runs after `closeOrder` and discards the result, which is sound only while the paper placer is side-effect-free. At B7 the gate must move ahead of it. Recorded in the SIM's OrderPlacer entry.

## 6. Governance files changed (Tier ledger — CHANGE-CLASS: architecture)
| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | Batch entry added, marked OPEN-observation with the live arm counts. |
| T1 | `PHASE_HISTORY.md` | ✅ | The narrative: two corrections (mid→bid comparator, unsigned→signed predicate) and what the deliberate stop test produced. |
| T1 | `PHASE_19_PLAN.md` | ✅ | Row `3n.u` status → deployed/observation; rows `3n.u2`, `3n.u3`, `3n.u4` placed. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_B.md` | ✅ | Own file updated (position, the CRLF staging trap); shared file untouched — no project-consensus truth changed. |
| T1 | the batch `SCOPE` | ✅ | Written at Step 1. |
| T1 | the batch `PRE_AUDIT` | ✅ | r5, audit-before-plan, every plan item back-referenced. |
| T1 | `COMPLETION_REPORT` | ⏳ | **This progress report converts to it** when §4's window closes and a decision is taken on the result. |
| T1 | THE FOUR SESSION TASK LISTS | ✅ mine / N/A ×3 | `CC_B_SESSION_TASK_LIST.md` updated (batch status + `3n.u2/u3/u4`); CC-A, CC-C, CC-INFRA not mine. |
| T1 | Langston's `MEMORY.md` | ⏳ | Owed at conversion — he holds the Step-4/Step-8 rulings already. |
| T2 | `SYSTEM_MANUAL.md` | ✅ | §fill model: "a market exit ALWAYS gets out" narrowed and the new graded-walk rule stated; "Force Close on Stop" rewritten (the "5 s staleness guard" and entry-price fallback lines were both false). |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | Close-path census five → **seven** (+ `hard_reset` named, out of scope); OrderPlacer gains the live-swap obligation and the "no longer always fills" rule. |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#1067` filed with its mechanism, blast radius and home. |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | Six fixes + residuals; status FIXED/observation open. |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ | `resetPortfolio()` removal, census + archive path + the docs-export occurrence named. |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | No phase-level change. |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | No parameter-adjustment governance changed; `close_fill_contract` is a new fail-closed module, seeded with its derivation in the migration. |
| T2 | `AUTHORITY_BASELINE.md` · `STORAGE_POLICY.md` · `MULTI_ASSET_VTS_EXPANSION_PLAN.md` · `ASSET_CLASS_ONBOARDING_WORKFLOW.md` · `BUILD_METHOD_PLAYBOOK.md` · `LANGSTON_ARCHITECTURE.md` · `GOVERNANCE_EXCEPTIONS.md` · `ALERT_HANDLING_PROTOCOL.md` | N/A | No constitutional, retention, VTS-expansion, onboarding, method, reviewer-build, exception or alert-protocol change. |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | No rule changed. |
