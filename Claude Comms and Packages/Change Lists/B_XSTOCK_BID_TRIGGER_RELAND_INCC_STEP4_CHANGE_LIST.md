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
