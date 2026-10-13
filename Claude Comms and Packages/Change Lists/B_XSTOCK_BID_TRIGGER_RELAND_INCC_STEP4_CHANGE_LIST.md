# B-XSTOCK-BID-TRIGGER-RELAND increment C — STEP 4 CHANGE LIST (CC-C, 2026-10-10)

**Graded ref: `c5ada79c5`** on `origin/migration/aws-supabase`. CI: run `38086829583` on `c5ada79c5` was CANCELLED by a newer push; run `38086888188` on `91df05e6e` (which contains `c5ada79c5`; the later commits are another session's governance) is 4/4 success per job.

## DISPATCH HEADER (workflow-04)
| field | value |
|---|---|
| **(i) declared change-class** | `architecture` (scope §MERGED r1) |
| **(ii) doc set for `architecture`** | `scope` **present** (§MERGED r1+r2 + objective-6 note) · `pre_audit` **present** (`Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INCC_PRE_AUDIT.md` r3) · `completion_report` **absent — Step 11** (batch open: B and objective 6 follow) · `batch_catalog`, `phase_history`, `system_manual` (exit-path section + §3.5.1 cross-reference and the corrected "no threshold to revisit" clause, C2), `sim` (`market-hours.ts`'s new export and its consumers) **absent — Step 10** · `running_issues` (the 2026-11-01/02/03 EST reads, the 11-27 half-day read) **conditional, Step 10** · `adjustment_framework` **N/A — stated: the window edges are policy constants, not knobs (pre-audit A11)** · `changes_and_fixes` conditional, Step 10 · `deleted_log` N/A · `roadmap` N/A · `phase_19_plan` N/A |
| **(iii) Step 2** | `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INCC_PRE_AUDIT.md` r3 at `700c69231` — Langston PROCEED (six conditions folded at r2 `bd738714f`); C5 satisfied, two read fixes folded at r3 |

## FILES (5)
`server/asset_classes/xstock_spot/market-hours.ts` (+C-P1) · `server/services/active-execution-engine.ts` (C-P2, C-P3, counters) · `server/services/vts-runner.ts` (C-P4) · `server/tests/unit/b-xstock-bid-trigger-reland-incc.test.ts` (new, 17) · `server/tests/unit/b-xstock-bid-trigger-reland-inc2-chain.test.ts` (engine-stub fields).

## C-P1 — the predicate (`market-hours.ts:163`)
```ts
const PAUSE_1615 = [974, 995];   // 16:14-16:34 ET Mon-Fri
const PAUSE_2015 = [1214, 1235]; // 20:14-20:34 ET Mon-Thu
const PAUSE_SUN_REOPEN = [1200, 1235]; // 20:00-20:34 ET Sunday
export function isXstockVenueTransitionPause(now = new Date()) {
  if (isInXstockWeekendClose(now)) return { paused: false, window: null };
  const { weekday, hour, minute } = getETParts(now);   // Intl, timeZone 'America/New_York'
  …Sun → sun_reopen only · Sat → never · 16:15 any weekday · 20:15 not Friday
}
```
The docstring carries the A10 basis (Kraken's published ET sessions; the +15 min is measured), the three pre-registered EST reads, and "policy, not a knob".

## C-P2 — paper exit (`active-execution-engine.ts:2941`, before `checkExitConditions` at `:2979`)
xStock only; after the book-state block (`advanceBookStateComparator`) and the P/L update. Paused ⇒ count, one `VENUE_PAUSE` line per position per window (plus `WOULD_FIRE` if the mark crosses a level later in the window), `continue` — so no trigger and no maker-rest place/fill/convert this tick. First decided tick after ⇒ `VENUE_PAUSE_RESUMED` with mark/bid at start and now, `wouldFireDuring`. No `_recordPriceSkip`, no `addAlert`. Pending map evicted in the close `finally`. Cumulative counters on the `EVAL_EXIT` cycle line: `venuePauseExitTicks`, `venuePauseWouldFire`, `venuePauseEntriesRefused`.

## C-P3 — paper entry (`active-execution-engine.ts:681-685`, before `getDepthSnapshot` at `:688`)
`return { pass: false, reason: 'venue_transition_pause <window>', snapshot: null }` — its own reason code beside `depth_verdict` and `implausible_spread_entry`.

## C-P4 — the VTS (`vts-runner.ts`)
- real lane `:3681` — xStock trade skipped for the pass right after the `weekend_suspended` skip (before the pending-fill, drop and `selectVtsXstockExitBid` blocks);
- shadow lane `:4561` — beside the weekend window skip;
- `registerOpenVtsTrade` `:4901` and `registerOpenShadowTrade` `:1054` — xStock opens refused (`null`; both callers tolerate null);
- `_vtsVenuePause` counters + one `VTS_VENUE_PAUSE` summary line per window; `getVtsVenuePauseCounters()` exported. Never the `3n.q3` no-decision streak, never an alert.

## TESTS
17 in `b-xstock-bid-trigger-reland-incc.test.ts`: every edge minute of the three windows (EDT), Friday (16:15 yes, 20:15 no), Saturday, Sunday 19:59/20:00/20:13/20:34/20:35; the three EST windows after 2026-11-01 (Sunday reopen at 01:00Z, 16:15 at 21:14Z with 20:14Z now unpaused, 20:15 at 01:14Z); four call-site fences with controls (pause after the advance and before the decision; no price-skip/alert in the branch; entry refusal before the depth read; both VTS lanes and both registrations). Related suites green individually; tsc 337 = 337. Local note: `8a-P4c inc 3 — mark-staleness knobs have ONE reader (swept)` times out at 5 s on this laptop (it walks the tree, and a stale 537 MB agent worktree under `.claude/worktrees/` sits in it); CI is the gate.

## JUDGEMENT CALLS TO ATTACK
1. **The shadow lane is a CENSUS ADDITION** beyond pre-audit A3 (which listed the real VTS lane and its registration only): both its exit look and its new opens are paused, for the same realism reason. Refusing a new xStock shadow adds a third `null` case to `registerOpenShadowTrade` (cap, persist-fail, pause); the pool-member row then carries no shadow FK for that cycle.
2. **The exit pause is placed after the P/L update** (`updateActiveOpenPosition`), so the dashboard's unrealised P&L keeps moving on the mark during the pause; only the decision is withheld.
3. **`wouldFire` is judged on the MARK** (today's trigger) — the cost read for the retirement criterion. When increment B moves the trigger to the bid, this line should move with it.
4. **The VTS skip also holds pending maker entry fills and drops** — a resting VTS entry cannot fill on a transient ask inside the pause; it is judged at the first pass after.
5. **A position's pause episode is keyed only by position**; a second window the same day re-opens it after `RESUMED`. A restart inside a window loses the pending record (no `RESUMED` line for that episode), as every in-memory record here does.

## STEP 4 (Langston, 2026-10-10) — APPROVED with three in-commit conditions; folded
- **C1 — behaviour, not text.** A paused tick is now driven through the REAL exit loop (`b-xstock-bid-trigger-reland-inc2-chain.test.ts`, new describe): no close, no price-skip, no alert, no `XS_FRAME` (the decision did not run), the comparator still advanced (`framesSinceSeed + 1`), counters and the pending map set, one pause line per window, and the first tick after the window prints `VENUE_PAUSE_RESUMED` and decides. CONTROL: the same tick outside a window decides with no pause line. **Mutation:** removing the paused branch's `continue` turns the test red. The vacuous r1 "CONTROL" (a self-matching literal) is deleted. That file's clock is now PINNED (Wed 2026-10-14 11:00 ET): the exit loop is calendar-dependent, and a CI run inside a window would otherwise change what every test in it sees.
- **C2 — the bid arm.** `bidWouldFire` beside `wouldFire` on the pause, `WOULD_FIRE` and `RESUMED` lines; its own counter. The retirement criterion's population (pre-audit C-P5) is the BID set once increment B is live.
- **C3 — the record.** (i) the engine counters are named `…SinceStart` on the cycle line; (ii) `venuePausedPositionsNow` (the pending map's size) is printed beside them; (iii) the VTS counters are PER WINDOW, printed at the window's END (`VTS_VENUE_PAUSE END window=… sinceStart …`), then reset; the zero-caller `getVtsVenuePauseCounters` export is removed (test seams only).
- **Judgement call 1 RULED SOUND**; A3 amended in place (shadow rows 4b/5b added, the "exactly one … confirmed" sentence struck with the original kept).
- **Forward-binding for reorg-B5** (the declared consumer of the shadow sink): xStock shadow pool-member rows now have DETERMINISTIC holes at the three windows, distinguishable from cap-reject / persist-fail only by the `shadowOpensRefused` aggregate, never in the row data — exclude them BY CLOCK (`isXstockVenueTransitionPause`), not by `?? 0` (`#546`).
- **Named beside the constants (`market-hours.ts`):** the trailing edge is bounded at ~15 s by two knobs (`floor_ms`, `sigma_min_observations`), not by this file.
- **Nits taken:** the two dead guards (`Sat`, `!== 'Fri'`) removed — the weekend-close return is the only guard for both, now said in a comment. Not taken: moving the VTS block below the imports (the file already interleaves statements and imports above line 332).
- **Cleared by Langston, recorded so nobody re-raises them:** the pause sits below `notePriced` (the venue-quiet clearing path is not blinded); `DEPTH_GATE` counts now mix a book refusal with a clock refusal, separated by the reason string (`venuePauseEntriesRefused…` recovers the clock share); `dispatchXstockActiveSignal` still fires when the VTS open is refused, and C-P3 catches it at the shared open seam.

## DEPLOYED + STEP-8 PRE-REGISTRATION (Langston, no objection; 2026-10-10)
- **DEPLOYED `5da17e02c` 2026-10-10T21:58:27Z** (restart 634; phase9 + reports preserved SAME, `/home/deploy/preserved-incC-20261010T215754Z`). Runtime-identical to the graded head `6011da6a9` (docs-only commits between).
- **The first live window is MONDAY 2026-10-12 00:00-00:35Z** (Sunday 20:00 ET), not Sunday 00:00Z (Saturday 20:00 ET is inside the weekend close).
- ⛔ **PRE-REGISTERED, BEFORE THE READ (Langston's false-absence trap):** the pause sits BELOW all eight `_recordPriceSkip` sites and `notePriced`, so a position still refused by staleness or the book-state guard `continue`s before it and emits NO pause line. At the reopen all 16 held xStocks may be in that state. ⇒ **`venuePauseExitTicksSinceStart` ≈ 0 in the first window is CONSISTENT with the pause working and is NOT a pass.** The discriminating read: a position that PRICES inside a window (passes staleness and the guard) and then carries a `VENUE_PAUSE` line, with no `XS_FRAME` decision in the window.
- **Counting convention, stated (record nit, disposition 1):** an episode is up to THREE lines — the opening `VENUE_PAUSE`, one `WOULD_FIRE` per arm (mark, bid) the first time each crosses — then `VENUE_PAUSE_RESUMED`. The VTS `END` line prints only when an xStock trade is passed AFTER the window (the call sits behind the class test), so a window followed by no xStock pass before a restart is never reported. Both stated beside the counters at Step 10.

## STEP 7 — THE FIRST LIVE WINDOW READ (sun_reopen, 2026-10-12 00:00-00:35Z; `error.log` 00:00:00-00:40:00Z, build `620b1b6b5`)
- **The discriminating read — PASS.** 11 positions PRICED inside the window and carried a `VENUE_PAUSE` line (CRCL, NOC, PLTR, RCL, MRVL at 00:00:15; UNH 00:15:19; CRWD 00:15:27; RBLX 00:15:33; GEV 00:18:30; COPX 00:21:19), and **zero `XS_FRAME frame=ok` lines inside 00:00:00-00:35:00Z** (positive control: 1,717 `XS_FRAME` decision lines after 00:35:00Z in the same file). 9 `VENUE_PAUSE_RESUMED` at 00:35:00-00:36:10Z (`pausedS` 890-2,086).
- **Would-fire during the pause:** `wouldFireDuring=none` on the mark for all; **`bidWouldFireDuring=stop` on NOC, PLTR, MRVL** — the bid crossed the stop while the mark did not, and nothing was decided in the window. 0 `WOULD_FIRE` lines (no arm crossed for the first time after the opening line).
- **VTS:** `[VTS_VENUE_PAUSE] START window=sun_reopen@2026-10-12T00` at 00:00:41Z; `END … realSkips=7920 shadowSkips=6510 opensRefused=0` at 00:35:41Z.
- **Closes:** 0 `closed_trades` rows from 2026-10-11 23:50Z to the read.
- Not yet read: the weekday 16:15 / 20:15 ET windows (first: 2026-10-12 20:14Z), the EST reads (11-01/02/03).

## STEP 7 — THE FIRST WEEKDAY WINDOW READ (16:15 ET, 2026-10-12 20:14-20:35Z; `error.log` 20:10-20:40Z, build `e8f575d3c`)
- **The discriminating read — PASS.** 19 positions priced inside the window and paused at 20:14:00-20:14:01Z; **0 `XS_FRAME frame=ok` between 20:14:00 and 20:35:00Z** (positive controls in the same file: 2,829 before 20:14Z, 1,997 after 20:35Z). `VENUE_PAUSE_RESUMED` at 20:35:00-20:35:14Z (`pausedS` ~1,260). VTS `START` 20:14:03Z, `END` 20:35:05Z (`realSkips=4368 shadowSkips=1470 opensRefused=1` — RBLX's VTS open refused).
- **★ THE WINDOW DID ITS JOB, MEASURED: at the 16:15 ET transition (20:15:01Z) the books blew out** — `WOULD_FIRE` with `bidWouldFire=stop` on PCAR (bid 102.10 vs mark 107.95, stop 107.66), TMUS (149.00), ABNB (160.01), DXCM (82.86), ACN (203.93), BKR (54.00), ALGN (140.00); the MARK crossed on ALGN (`wouldFire=target`, mark 157.94 vs target 150.40) and ABNB (`wouldFire=stop` at 20:15:23Z). **Without the pause: seven bid-side false stops and a false target on transient transition quotes. With it: nothing decided, 0 `closed_trades` rows from 20:00Z to the 20:40Z read.**
- Next: the 20:15 ET window (2026-10-13 00:14-00:35Z), then the EST reads (11-01/02/03).

## STEP 7 — THE FIRST 20:15 ET WINDOW READ (2026-10-13 00:14-00:35Z; `error.log` 00:00-00:42Z, build `e8f575d3c`)
- **The discriminating read — PASS.** 16 positions priced inside the window and opened a `VENUE_PAUSE` episode (11 at 00:14:00Z, PCAR 00:14:38, ALGN 00:14:42, NOC 00:15:01, BKR 00:15:01, DXCM 00:15:02); **0 `XS_FRAME frame=ok` between 00:14:00 and 00:35:00Z** (controls in the same file: 6,622 in 00:00-00:14Z, 2,637 in 00:35-00:42Z). 15 `VENUE_PAUSE_RESUMED` at 00:34-00:40Z (`pausedS` 1,199-1,531); BKR had none by 00:42Z. VTS `START` 00:14:06Z, `END` 00:35:06Z (`realSkips=4074 shadowSkips=1449 opensRefused=1` — RBLX again).
- **The books blew out at 00:15:00Z, as at 16:15:** 11 `WOULD_FIRE` lines — e.g. COPX mark 79.87 / bid 74 vs stop 82.59, ACN bid 191.69 vs stop 209.39, DXCM bid 69.65 vs stop 82.99, TMUS bid 140.22 vs stop 150.05. Nothing was decided on any of them inside the window.
- **ONE close after the window — PCAR/USD `stop_hit` at 00:37:22Z, 2 min 22 s after the window ended. NOT a transition artifact; it is the overnight thin-book case the pause was never meant to cover.** Read in full:
  - Book at the decision: bid 100.80 / ask 114.00 (spread 12.29%), unchanged since 00:33:31Z and still so at 00:39:49Z. The mark was stale 188-229 s through 00:36:40-00:37:20Z (`EQUITY_MARK … not actionable`); the first fresh mark, 107.40, is exactly that book's midpoint, below the stop 107.6551 ⇒ `markExit=y exitReason=stop_hit`. Booked at the bid: exit 100.80 vs entry 108.62 (−7.2%) where the stop sat 0.89% under entry; net −$2.85.
  - **Control: PCAR's ordinary overnight book is this wide.** Median spread of PCAR's `xstock_spot_ticker_snap` rows 00:40-07:59Z per UTC date, 2026-09-22 → 10-12: on all 15 weeknights (9-53 rows each) it is 3.9-14.8%, with 12.25 / 14.76 / 13.84 / 14.30% on 09-23, 09-25, 10-07, 10-08 (the 4 weekend dates, 1-3 rows each, are left out). ⇒ a longer window would not have helped: the book did not recover at the edge because it does not recover overnight.
  - **The book-state guard re-calibrated INSIDE the window, by design (pre-audit C-P2: the guard keeps observing and advancing while decisions are suppressed):** PCAR's comparator yielded after 60 hollow ticks at 00:19:42Z, re-seeded on the 14.3% book, and the seed check passed against a retained-ring median that was itself 26.9% (`REFUSAL_BASIS seedImplausible=false … ratio=0.53`); `EXIT_RELEASED` at 00:19:47Z (bid 8.2% under the stop). ACN yielded and re-seeded the same way (seed 4.8% vs ring 15.4%).
  - **What this means for objective 6 (`spread_blown`), stated as a reading of the code, not a re-run:** at the decision the arm's yardstick was `thr = 3 × trail = 0.39879` (`book-state.ts:224`, `kRel × trailing`), so the 12.29% spread would NOT have been refused had the arm been on. The bid trigger (increment B) would also fire: bid 100.80 is under the stop. The pre-audit's "residual after objective 6 is one close" counts IN-window closes on warm chains and is not contradicted; this close is outside the window, on a chain whose yardstick is the overnight book itself — the limit `book-state.ts:276-278` already names.
  - ⇒ **This is evidence for Kyle's overnight-hold decision (row 2, objective 6), not a defect in increment C.** DISPOSITION: folded into this batch — carried to the objective-6 decision packet as a measured case: a stop 0.89% under entry, on a name whose overnight book is 5-15% wide, booked 7.2% under entry two minutes after the pause.
- Next: the EST reads (11-01/02/03); C-P5's retirement read after increment B and objective 6.
