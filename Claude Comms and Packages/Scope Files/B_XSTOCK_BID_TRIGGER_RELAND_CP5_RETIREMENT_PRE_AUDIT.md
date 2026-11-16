# B-XSTOCK-BID-TRIGGER-RELAND (row 2) — C-P5 RETIREMENT — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: sub_batch (row 2's own C-P5 outcome; parent scope `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md`)
Owner: CC-C (ANALYST Claude). r1, 2026-11-16. Read at `origin/migration/aws-supabase` @ `16548b962` (line numbers below are at that ref).
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

**A2 — `sun_reopen` on the exit arm: the one judgement this plan asks you to rule on.** Your condition (1) scoped the deletion to 16:15/20:15 because the rate does not cover `sun_reopen`. The extract (`scripts/analysis/cp5_four_week_pause_lines.csv`): **`sun_reopen` 28 lines over 4 Sundays, stop arm 0, target arm 0.** That is P7's ≤ 4 band, whose pre-registered outcome is *"proposes RETIREMENT on mechanism to Langston as a reviewed commit"* — **this plan is that proposal.** Mechanism: the Sunday re-sends are whole-universe and 97% wider than 1% (`market-hours.ts:166-170` doc, 4 of 4 Sundays); objective 6's `spread_blown` holds such a book at the hollow arms, which `continue` upstream of the pause block (your census: `aee:2743`/`:2765` vs `:3412`), so the pause never sees them, which is consistent with 0 of 28 firing. Options:
- **(a) RECOMMENDED — delete the exit block in all three windows.** A clean §15 deletion: no narrowed block left carrying counters and lines for one weekly window. The forward dependency (A4) covers `sun_reopen` too.
- **(b) keep the exit block for `sun_reopen` only** (`if (_vp.paused && _vp.window === 'sun_reopen')`). The counters, `_venuePausePending`, both log lines and the `[EVAL_EXIT]` fields all stay; only the 16:15/20:15 branch goes. Smaller blast radius, but it leaves the instrumentation of a pause with no live retirement read behind it.
`NOT RE-READ`: the "97% wider" figure is the predicate's own doc comment, not re-measured here.

**A3 — what changes for a held paper xStock position at 16:14-16:34 / 20:14-20:34 ET.** Today those ticks `continue` before `checkExitConditions` and before the maker rest lifecycle (`aee:3407-3409` comment). After: the tick runs the normal exit path. A book over 1% is still held by objective 6 at the hollow arms (no decision, no rest fill — the same `continue`). A book under 1% is decided on the bid (increment B), and a resting maker exit may fill there. That is the population the rate measured (inside 5/14 dips vs outside 127/280).

**A4 — deletion-time state-write census of the exit block (§9.5(a-ii)).**
| state written | readers | after |
|---|---|---|
| `_venuePausePending` (Map; set `:3424`, read `:3414`/`:3433`, deleted `:3444`, `:5287` close cleanup) | `[EVAL_EXIT]` `venuePausedPositionsNow` (`:3724`); test fixtures | delete field, `:5287` line, EVAL field |
| `_venuePauseExitTicks` / `_venuePauseWouldFire` / `_venuePauseBidWouldFire` (`:787-789`) | `[EVAL_EXIT]` `…SinceStart` fields (`:3724`); fixtures; `inc2-chain` assertions | delete |
| `_venuePauseEntriesRefused` (`:790`, written by C-P3 `:608`) | `[EVAL_EXIT]` `venuePauseEntriesRefusedSinceStart` | **STAYS — C-P3's counter.** Your condition (2) said "the five `[EVAL_EXIT]` fields"; four go, this one stays with its writer. |
| `[VENUE_PAUSE]` / `[VENUE_PAUSE_RESUMED]` log lines | the cp5 harvest (cron removed 11-16), tests; no script, route or dashboard parses them (repo grep outside `dist/` and `Claude Comms`) | delete |
`grep venuePause` outside the engine and two test files: no reader (the `dist/` hits are build output).

**A5 — tests.** `b-xstock-bid-trigger-reland-inc2-chain.test.ts:511-570` (the C-P2 describe and its control) is the subject's own test and is deleted with it. Fixture fields `:212-214`, `:216` and `b-class-leg-fill-mode-engine.test.ts:180-182`, `:184` drop the four exit fields and keep `_venuePauseEntriesRefused`. `incc.test.ts` C-P2 describe (source-string anchors) goes; predicate units stay. **New fence:** an `inc2-chain` case at 16:20 ET (inside the 16:15 window) on a sub-1% book with the bid through the stop ⇒ the tick is DECIDED and closes on the bid, with no `[VENUE_PAUSE]` line. It must fail against the current code (the deleted block suppresses it). If (b): add a `sun_reopen` case that still pauses.

**A6 — the forward dependency (condition I + your condition 3).** With the exit pause gone, objective 6's absolute `spread_blown` hold is the only upstream protection against blown-handoff stops. It is written down at: `RUNNING_ISSUES` `#943` (annotation), System Manual §3.5.1 (the `spread_blown` section) and the pause bullet, and **where the ceiling is set**: the seed `BOOK_STATE_SEED.ri_abs_spread_ceiling_pct` (`book-state.ts:93`) and the bounds check (`book-state-config.ts:79`). Each gets one comment: *raising this ceiling, or adding a yield path for `spread_blown`, re-opens the venue-pause question (C-P5, row 2 §3g)*. The DB row itself takes no comment; the migration that last set it (`2026-10-10-…-inca.sql`) is history and is not edited.

**A7 — epoch.** `calibration_epoch` `xstock_spot` `paper_sim` is **8** (`2026-11-07 19:06:15Z`, `b-price-side-1250`), read today. The change alters which tick decides a paper xStock exit in two daily windows. **Proposed: bump `paper_sim` 8 → 9 in the migration**, `vts`/`live` unmoved (the VTS lane keeps its own pause). Attack this if exit-timing at 40 minutes a day is below the epoch rule's bar.

**A8 — SIM / System Manual.** The SIM has no entry naming the pause (grep `VENUE_PAUSE`/`venue-transition` in `SYSTEM_IMPACT_MAP.md`: none) — a silence, flagged; Step 10 records the predicate's remaining three consumers under the xStock market-hours component. System Manual pause bullet (`SYSTEM_MANUAL.md:5027`) is rewritten at Step 10.

## 2. Plan (each item → its finding)
| # | item | from |
|---|---|---|
| P1 | Delete the C-P2 exit block `aee:3405-3452` (option a) or narrow it to `sun_reopen` (option b) | A1, A2 |
| P2 | Delete `_venuePausePending` and the three exit counters, the `:5287` cleanup line, and the four `[EVAL_EXIT]` fields; keep `_venuePauseEntriesRefused` and its field | A4 |
| P3 | Tests: delete the `inc2-chain` C-P2 describe and the `incc` C-P2 source-string describe; trim the fixtures; add the A5 fence (plus the `sun_reopen` case under b) | A5 |
| P4 | Forward-dependency comments at `book-state.ts:93` and `book-state-config.ts:79` | A6 |
| P5 | Migration `drizzle/migrations/2026-11-16-b-xstock-bid-trigger-reland-cp5.sql` (+ rollback, tracked) bumping `paper_sim` 8 → 9; MANIFEST entry | A7 |
| P6 | `DELETED_COMPONENTS_LOG.md` entry + `_archive/deleted-code/…venue-pause-exit-block.ts.removed`; Step 10: SM §3.5.1 + pause bullet, SIM, `#943`, `CHANGES_AND_FIXES`, `BATCH_CATALOG`, `PHASE_HISTORY` | A4, A6, A8 |
| P7 | Step 7: across the first full weekday, no `[VENUE_PAUSE]` line; `[XS_FRAME]` frames continue through the 16:15 and 20:15 windows; `[ENTRY_GATE] … venue_transition_pause` and `[VTS_VENUE_PAUSE]` still appear (the surviving uses' positive control); an exit decided inside a window is reported if one occurs (quantity, not guaranteed) | A1, A3 |

Next: on your PROCEED (and an a/b ruling), Step 3 code, then the diff at Step 4.
