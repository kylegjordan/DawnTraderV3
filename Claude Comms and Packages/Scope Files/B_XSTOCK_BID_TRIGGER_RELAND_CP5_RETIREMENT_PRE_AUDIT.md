# B-XSTOCK-BID-TRIGGER-RELAND (row 2) — C-P5 RETIREMENT — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: sub_batch (row 2's own C-P5 outcome; parent scope `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md`)
Owner: CC-C (ANALYST Claude). **r2, 2026-11-16 — folds Langston's Step-2 PROCEED (Discord `1571717549157130291`): option (a); conditions 1-6 below; P5 (epoch bump) DROPPED.** r1 at `b1634120e`. Read at `origin/migration/aws-supabase` @ `16548b962` (line numbers below are at that ref).
Inputs: the four-week read and Langston's ruling, `Batch Completion/B_XSTOCK_BID_TRIGGER_RELAND_PROGRESS_REPORT.md` §3g (ruling Discord `1571711573180027016`); the pre-registered rule, `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4B_PRE_AUDIT.md` P7 and `…_INCC_PRE_AUDIT.md` C-P5.

## 0. Previously stated vs now
- **PREVIOUSLY STATED (§3g, `20a07a822`): "retire the pause". NOW: retire ONLY the paper EXIT suppression (C-P2). REASON: Langston — C-P5 measured one of the predicate's uses; the entry refusal (C-P3), the VTS lane and the archiver's Sunday watchdog suppression are not covered by it.**
- **PREVIOUSLY STATED (§3g's extract at `fb9b289d5`): the committed pause-line csv. NOW: rebuilt at `16548b962`. REASON: the sed build scrambled three columns; the parser build reconciles to the carrier (548 lines; stop 19 = 16:15 × 12 + 20:15 × 7; target 6; `sun_reopen` 28 with neither arm).**

## 1. Audit

**A1 — every use of `isXstockVenueTransitionPause` (repo-wide, tests separated).** Definition `server/asset_classes/xstock_spot/market-hours.ts:193`. Production callers, four:
| site | what it does | C-P5 covers it? | this plan |
|---|---|---|---|
| `active-execution-engine.ts:3413` (block `:3405-3452`) | C-P2: paper xStock exit suppression — no trigger, no resting-exit fill; `[VENUE_PAUSE]` / `[VENUE_PAUSE_RESUMED]` lines | **yes — measured** | **delete (see A2 on `sun_reopen`)** |
| `active-execution-engine.ts:606-612` | C-P3: paper xStock ENTRY refusal, reason `venue_transition_pause <w>` | no (entry fidelity, not premature sale) | **stays** |
| `vts-runner.ts:128` (+ `:5161` refusal) | the VTS lane's looks/opens suspension, `[VTS_VENUE_PAUSE]` | no (excluded from P7's control) | **stays** |
| `passive-archive/equity-spot-archiver.ts:573` | `sun_reopen` only: the Sunday stall-watchdog suppression | no | **stays** |
Test users: `b-xstock-bid-trigger-reland-incc.test.ts` (predicate units `:12-59` stay; the C-P2 source-string describe `:63-83` goes; the `SRC` helper `:61` and the C-P3/C-P4 describes `:84+` stay), `p19-b4a-c3-gate-watchdog.test.ts:59` (a mock of the predicate — stays, the predicate survives). ⇒ **The predicate and its window table survive unchanged.**

**A2 — `sun_reopen` on the exit arm — RULED (a): delete in all three windows (Langston, r1 → r2).** Re-derived from `scripts/analysis/cp5_four_week_pause_lines.csv`:
- **F-1, the mechanism (condition 1):** all 28 `sun_reopen` lines fall in **ET 20:15-20:33; zero in 20:00-20:14** — the minutes holding the whole-universe re-sends at 20:00 and 20:13 that the window was built for (`market-hours.ts:168-169`). The exit pause has never acted where its transient occurs; something upstream already holds there (objective 6, or no mark before the venue quotes — not discriminated, and the commit does not claim either). What it did suppress is 28 ticks on a live book 15-33 minutes after the reopen.
- **F-3, why deciding is the honest simulation:** implied spread `2·(mark − bid)/mark` on the 28: median **0.757%** (min 0.1765%, max 0.9989%) against **0.0537%** on the 520 weekday lines (Langston's figures 0.768% / 0.0543%, same order). So the inside/outside rate is unavailable for this population, and a bid on a sub-1% book is a price we could transact at (Langston's level-basis rule, 2026-09-04): a live stop resting at the venue is hit on that bid, so suppressing it is the fiction.
- **F-2, the zero is not evidence (carried beside it):** weekday stop-arm rate 19/520 = 3.65% predicts **1.02** would-fires over 28 lines; P(0) = **0.353** if Sunday behaved like the weekday windows. The zero cannot tell the two apart.
- **Declared extension of the pre-registration (condition 2):** P7's four-week band is denominated in 20 weekdays at "≤ 0.2 a weekday"; `sun_reopen` sits on 4 days. Applying the ≤ 4 band to it is a **declared extension**, not coverage, and the retirement of this window rests on F-1 + F-3, not on the rate.
- **Against (b) (Langston):** it would keep the Map, three counters, four `[EVAL_EXIT]` fields and both log lines alive for one weekly window whose carrier is gone — a suppression never measured again, with no scheduled decision behind it.
`NOT RE-READ`: the "97% wider" figure is the predicate's own doc comment; it is no longer load-bearing.

**A3 — what changes for a held paper xStock position at 16:14-16:34 / 20:14-20:34 ET.** Today those ticks `continue` before `checkExitConditions` and before the maker rest lifecycle (`aee:3407-3409` comment). After: the tick runs the normal exit path. A book over 1% is still held by objective 6 at the hollow arms (no decision, no rest fill — the same `continue`). A book under 1% is decided on the bid (increment B), and a resting maker exit may fill there. That is the population the rate measured (inside 5/14 dips vs outside 127/280).

**A4 — deletion-time state-write census of the exit block (§9.5(a-ii)).**
| state written | readers | after |
|---|---|---|
| `_venuePausePending` (Map; set `:3424`, read `:3414`/`:3433`, deleted `:3444`, `:5287` close cleanup) | `[EVAL_EXIT]` `venuePausedPositionsNow` (`:3724`); test fixtures | delete field, `:5287` line, EVAL field |
| `_venuePauseExitTicks` / `_venuePauseWouldFire` / `_venuePauseBidWouldFire` (`:787-789`) | `[EVAL_EXIT]` `…SinceStart` fields (`:3724`); fixtures; `inc2-chain` assertions | delete |
| `_venuePauseEntriesRefused` (`:790`, written by C-P3 `:608`) | `[EVAL_EXIT]` `venuePauseEntriesRefusedSinceStart` | **STAYS — C-P3's counter.** Your condition (2) said "the five `[EVAL_EXIT]` fields"; four go, this one stays with its writer. |
| `[VENUE_PAUSE]` / `[VENUE_PAUSE_RESUMED]` log lines | the cp5 harvest (cron removed 11-16), tests; no script, route or dashboard parses them (repo grep outside `dist/` and `Claude Comms`) | delete |
`grep venuePause` outside the engine and two test files: no reader (the `dist/` hits are build output).

**A5 — tests.** `b-xstock-bid-trigger-reland-inc2-chain.test.ts:511-570` (the C-P2 describe and its control) is the subject's own test and is deleted with it. Fixture fields `:212-214`, `:216` and `b-class-leg-fill-mode-engine.test.ts:180-182`, `:184` drop the four exit fields and keep `_venuePauseEntriesRefused`. `incc.test.ts` C-P2 describe `:63-83`: the three pause-placement `it`s die with their subject, **but the ordering assertion is RE-POINTED, not deleted (condition 3)** — it is the only fence in the suite that the book-state guard runs before the exit decision. Retitled to that subject, it asserts both hollow `continue` arms (yield-refused and hollow skip) and the `advanceBookStateComparator(` call precede `checkExitConditions(`. Predicate units stay. **New fence:** an `inc2-chain` case at 16:20 ET (inside the 16:15 window) on a sub-1% book with the bid through the stop ⇒ the tick is DECIDED and closes on the bid, with no `[VENUE_PAUSE]` line. It must fail against the current code (the deleted block suppresses it). If (b): add a `sun_reopen` case that still pauses.

**A6 — the forward dependency (condition I + your condition 3).** With the exit pause gone, objective 6's absolute `spread_blown` hold is the only upstream protection against blown-handoff stops. It is written down at: `RUNNING_ISSUES` `#943` (annotation), System Manual §3.5.1 (the `spread_blown` section) and the pause bullet, and **where the ceiling is set**: the seed `BOOK_STATE_SEED.ri_abs_spread_ceiling_pct` (`book-state.ts:93`) and the bounds check (`book-state-config.ts:79`). Each gets one comment: *raising this ceiling, or adding a yield path for `spread_blown`, re-opens the venue-pause question (C-P5, row 2 §3g)*. The DB row itself takes no comment; the migration that last set it (`2026-10-10-…-inca.sql`) is history and is not edited.

**A7 — epoch: NO BUMP; IMPACT NAMED (condition 4, Langston's default; `ADJUSTMENT_FRAMEWORK.md:590`, rule 2's third form).** `calibration_epoch` `xstock_spot` `paper_sim` stays **8**. The epoch's only consumer is `outcomeFeedbackStore.updateEma`; a mismatch resets the Welford stream per key while the EMA (the live factor input) continues, so a bump would change no live behaviour and would only discard disk-persisted variance samples, possibly inside other batches' open windows. **Named impact:** population = paper xStock exits whose deciding tick falls in a 16:15, 20:15 or `sun_reopen` window — over the four-week read, 14 stop episodes + 6 target would-fires in 20 weekdays (≈ 4-5% of paper xStock closes) plus 28 `sun_reopen` lines with neither arm; direction = these now decide at the crossing tick instead of at resume; measured size = the bid at resume was −0.58% against the bid at suppression on average over the 14 stop episodes (9 worse, 4 better, 1 flat), so exits in this population book slightly better than before. Why no reset: the shift is small, one-signed and named here, and a reset would cut other batches' accumulated samples (row 52's replacement window, `B-ENTRY-GATE`'s xStock week read) — not established whether they read `outcome_feedback` or `closed_trades`, and with no bump it does not matter.

**A8 — SIM / System Manual.** The SIM has no entry naming the pause (grep `VENUE_PAUSE`/`venue-transition` in `SYSTEM_IMPACT_MAP.md`: none) — a silence, flagged. The existing `market-hours.ts` component entry (`SYSTEM_IMPACT_MAP.md:2923`) names only `isXstockMarketOpenUTC`; Step 10 writes the predicate and its three remaining consumers **into that entry** (condition 6), not a new section. System Manual pause bullet (`SYSTEM_MANUAL.md:5027`) is rewritten at Step 10.

## 2. Plan (each item → its finding)
| # | item | from |
|---|---|---|
| P1 | Delete the C-P2 exit block `aee:3405-3452` (option a) or narrow it to `sun_reopen` (option b) | A1, A2 |
| P2 | Delete `_venuePausePending` and the three exit counters, the `:5287` cleanup line, and the four `[EVAL_EXIT]` fields; keep `_venuePauseEntriesRefused` and its field | A4 |
| P3 | Tests: delete the `inc2-chain` C-P2 describe and the `incc` C-P2 source-string describe; trim the fixtures; add the A5 fence (plus the `sun_reopen` case under b) | A5 |
| P4 | Forward-dependency comments at `book-state.ts:93` and `book-state-config.ts:79` | A6 |
| P5 | **DROPPED (condition 4).** No migration, no epoch bump; A7's named-impact line goes into the completion report and `ADJUSTMENT_FRAMEWORK` at Step 10 | A7 |
| P6 | `DELETED_COMPONENTS_LOG.md` entry + `_archive/deleted-code/…venue-pause-exit-block.ts.removed`; Step 10: SM §3.5.1 + pause bullet, SIM, `#943`, `CHANGES_AND_FIXES`, `BATCH_CATALOG`, `PHASE_HISTORY` | A4, A6, A8 |
| P7 | Step 7: across the first full weekday, no `[VENUE_PAUSE]` line; `[XS_FRAME]` frames continue through the 16:15 and 20:15 windows; `[ENTRY_GATE] … venue_transition_pause` and `[VTS_VENUE_PAUSE]` still appear (the surviving uses' positive control); an exit decided inside a window is reported if one occurs (quantity, not guaranteed). **Window (condition 5):** `DEPLOY_WINDOWS.jsonl` `open` row for `B-XSTOCK-BID-TRIGGER-RELAND` lands with this r2. The deploy itself lands inside `B-PRICE-SIDE-BY-JOB`'s open row (mine, to 11-21) and so names `--in-window B-PRICE-SIDE-BY-JOB`; that read and `B-ENTRY-GATE`'s xStock week read (cc-b, to 11-20) are both on xStock taker OPENS, and this retirement touches the EXIT side only, so it perturbs neither | A1, A3 |

Next: on your PROCEED (and an a/b ruling), Step 3 code, then the diff at Step 4.
