# B-XSTOCK-BID-TRIGGER-RELAND increment C — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2, r2, CC-C, 2026-10-10)

Scope: `B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md` §MERGED r1 objective 7 + r2 conditions C1-C4 (Langston PROCEED 14:48Z). Increment C = objective 7, the venue-transition pause; independent of A and B (r2). Design: `Langston Design Asks/B-XSTOCK-BID-TRIGGER-RELAND_overnight-exit-design_r1.md` r5 (Kyle's answer 3) and r6 (b). Code read at `origin/migration/aws-supabase` (`e8dff031e`; staging runs `e1b37c2d5`).

## 0. PREVIOUSLY STATED → NOW
- **PREVIOUSLY STATED (r1, `db485fe44`): "a mechanism is measured" — 7 fills below both neighbouring bids, 5 by 4-11%, every one `exit_book_state = two_sided`, a "symmetric shift" the guard cannot see. NOW: the harm is measured by Langston's IN-vs-OUT control (A1); the neighbour test, the `two_sided` label and the "symmetric shift" claim are WITHDRAWN.** REASON (Langston, Step 2 ruling 2026-10-10): all 18 in-window closes filled exactly at `exit_ticker_bid` (the tick was the transient, not the fill); 112 of all 116 rows read `two_sided` and 4 are NULL, so the label cannot discriminate; and the five decisive cases are BID COLLAPSES against a held or widening ask (DLR 163.87 / 197.00), with decision-tick spreads of 8-18%, not symmetric shifts.
- **PREVIOUSLY STATED (r1): the pause is "not only a belt". NOW: after objective 6 the measured residual is ONE close (INTC, −0.81%), so the pause is an ACKNOWLEDGED BELT** (design r6 (b) licenses it) — against the decision-tick blowouts until objective 6 arms `spread_blown`, and against the vacuously-seeded-chain hole (scope :32) after it. ⚠️ That hole's population is not identifiable from `closed_trades`, so neither Langston nor I may assert the pause covers it.
- **PREVIOUSLY STATED (r1): Sunday's 20:00 start rests on one Sunday. NOW: n = 4** (A2).
- **NEW (Langston C5, discharged here, A10): the anchor is Eastern time, from Kraken's own schedule** — the constants are written in ET minutes with that basis beside them, and the first EST observation is pre-registered for 2026-11-02.

## A. THE AUDIT

### A1. The harm, measured (Langston's control, re-derived by him on staging; cited, not re-run by CC-C)
**Object:** `closed_trades`, `asset_class = 'xstock_spot'`, `closed_at IS NOT NULL`, `closed_at >= 2026-09-19`: **116 closes, 18 inside the windows (16:14-16:34 / 20:14-20:34 ET), 98 outside** (97 with a decision-tick bid). Per close, from `exit_ticker_bid` / `exit_ticker_ask` at the decision tick and the stop:
| per-close rate | IN (n = 18) | OUT (n = 98 / 97) | ratio |
|---|---|---|---|
| decision-tick spread > 1% | 72.2% | 10.3% | 7.0× |
| decision-tick spread > 5% | 44.4% | 6.2% | 7.2× |
| fill ≥ 1% below the stop | 55.6% | 8.2% | 6.8× |
| fill ≥ 3% below the stop | 38.9% | 2.0% | 19.1× |
| worst fill vs stop | −10.40% | −5.06% | |
**The mechanism, rewritten:** at the transition the BID collapses while the ask holds or widens (DLR bid 163.87 / ask 197.00; decision-tick spreads DLR 18.36%, KEYS 17.84%, REGN 14.63%, PPG 12.65%, NWL 12.31%, ARKK 9.21%, NVT 8.70%, ROK 8.29%). Every fill sits exactly at the decision-tick bid (18 of 18, `exit_fill_arm` walk / walk_stale), so the FILL is faithful and the TICK is the transient; the harm ranks with the decision-tick spread.
**Why it still reaches a close:** the stop trigger is the MARK today (increment B moves it to the bid), and `spread_blown` (objective 6) is off. **Residual after objective 6** (6 of the 8 worst in-window cases are `warm`, so the arm would fire): ONE in-window close with a sub-1% spread and an adverse fill — INTC, −0.81%. ⇒ the pause is a belt; its own retirement test (C-P5) is the same inside-vs-outside comparison, run after B and objective 6.
⚠️ Evidence struck: the r1 "below both neighbours" count (never given an out-of-window share) and `exit_book_state = two_sided` (non-discriminating). Discriminating fields for any later read: `exit_book_state_at_fill`, `exit_book_state_basis`, `exit_fill_book_warmth`.

### A2. The Sunday reopen (n = 4)
`xstock_spot_ticker_snap`, every Sunday in retention (Langston re-derived): the **20:00 ET burst is 468 rows on 4 of 4 Sundays** (09-13, 09-20, 09-27, 10-04), **91.7 / 97.2 / 97.2 / 97.2%** wider than 1%; the **20:13 burst on 3 of 4** (absent 09-20). Live trading resumes at 20:15 (2026-10-04: 2,838 rows, 75.4%, then 60.5 / 54.7%, settling to 13-32%). These are whole-universe re-sends of a book that is not yet trading — the reconnect-snapshot shape `#743` carries (CC-B's wire probe, 2026-10-10: a subscribe yields one `type:"snapshot"` frame per symbol).
⚠️ **No close has ever been observed in the 20:00-20:13 extension** (the 18 in-window closes sit at ET minutes 975, 976, 986, 993, 1215, 1223). The Sunday 20:00 start is PRE-EMPTIVE, on the spread profile — not a caught harm.

### A3. Census (§9.5(a) + entry-point enumeration) — every place an xStock trade opens or closes, tests excluded
| # | decision point | where | in the pause |
|---|---|---|---|
| 1 | paper exit trigger | `active-execution-engine.ts` exit loop, `checkExitConditions` (after the book-state block, `aee:~2935`) | **SUPPRESSED** — skip the decision for the tick, AFTER the book-state block (the guard keeps observing and advancing; no chain is touched) |
| 2 | paper maker exit rest (place / fill / convert) | same loop iteration, after the trigger (`aee:~2950-3080`) | **SUPPRESSED** — it is reached only through #1's iteration, so the same `continue` covers it; a resting order stays resting and is judged at resume |
| 3 | paper entry | `_evaluateOpenDepthGate` xStock branch (`aee:~676`) | **REFUSED**, reason `venue_transition_pause`, before the depth read |
| 4 | VTS xStock exit, pending maker entry fill, drop | `vts-runner.ts` sim cycle (`:3642` `weekend_suspended` skip, `:3690-3705`, `:3793-3803`) | **SUPPRESSED** — an xStock trade is skipped for the cycle like `weekend_suspended`; never counted as a VTS no-decision |
| 5 | VTS xStock new trade | `registerOpenVtsTrade` (`vts-runner.ts:4853`) | **REFUSED** for xStock, logged |
| 6 | operator actions — manual close routes, flatten, engine stop, kill switch | `routes.ts`, `active-portfolio-manager.ts` | **NOT paused** — an operator decision is never blocked by a trading-fidelity rule |
**Exactly one exit-loop writer and one entry seam per lane, confirmed by the census.** ⇒ four call sites, one predicate. Line numbers here are approximate; Step 4 pins each to the exact line at the graded ref (Langston nit).

### A4. C3 — where the pause lives
**Outside `book-state.ts`.** The predicate is a pure function in `market-hours.ts`; the call sites are the four above. So SM §3.5.1's *"no clock term exists anywhere in the guard"* stays literally TRUE, and the manual edit is an addition in the exit-path section with a cross-reference (Langston r2 C3). **C2 still applies:** §3.5.1's *"no threshold to revisit"* clause is corrected (the pause has thresholds — the window edges and the Sunday start), with objective 7's retirement criterion (B5 below) in the manual text and both Kyle quotes verbatim (09-03 and the 10-09 delegation).

### A5. C4 — no new Eastern-time reader
`market-hours.ts` has `getETParts` (`:51`, private). The new predicate `isXstockVenueTransitionPause(now)` is EXPORTED from the same file and calls `getETParts`; nothing else parses Eastern time. (The other existing reader, `time-of-day.ts` `getXstockSession`, is untouched and never mixed with this one.)

### A6. Row 166b, side by side (r2: no contradiction)
| | row 166b `B-XSTOCK-WEEKEND-POSTURE` (CC-B, queued) | increment C pause |
|---|---|---|
| when | a calendar cut-off BEFORE the Friday 20:00 ET weekend closure | 16:14-16:34 ET Mon-Fri; 20:14-20:34 ET Mon-Thu; **20:00-20:34 ET Sunday** (inclusive minutes; the predicate's half-open [974, 995), [1214, 1235), [1200, 1235)) |
| what | refuses NEW entries (extends the SQE `xstock_weekend_closure` check) | suppresses exit DECISIONS and refuses entries, paper and VTS |
| overlap | Friday 16:14-16:34 may sit inside 166b's cut-off | both are refusals ⇒ the union refuses; neither re-enables what the other blocks |
No Friday 20:14 pause (the weekend close begins at 20:00 Friday, `isInXstockWeekendClose`), so the two never disagree about the weekend boundary.

### A7. No paging (objective 9)
A paused tick must NOT go through `_recordPriceSkip` (it feeds the price-skip streak and escalates to an alert) and a paused VTS look must NOT feed the `3n.q3` no-decision streak. Both get their own counter and log line instead.

### A8. Holidays (r6, not built)
`market-hours.ts:25-29` builds no holiday calendar (`#392`, Kyle-parked). Forward check stays: does Kraken's 16:15 rollover move on a US half-day? First candidate **2026-11-27** — a Step-8 read, not code.

### A10. The anchor — Eastern time, from the operator's schedule (Langston C5, discharged before C-P1's constants)
**The question:** our evidence is UTC (`20:15:00Z`, `00:15:00Z`) and every observation is under EDT (`xstock_spot_ticker_snap` begins 2026-09-10, `xstock_spot_ohlc_1m` 2026-04-30; EDT began 2026-03-08), so the data cannot say whether the rollover is a fixed UTC instant or an Eastern-time one.
**The operator's answer** (Kraken support, *Market hours explained*, read 2026-10-10): the sessions are published in Eastern time — Overnight *"8 PM to 4 AM EST"*, Pre market *"4 AM to 9:30 AM EST"*, Market open *"9:30 AM to 4 PM EST"*, After hours *"4 PM to 8 PM EST"* — and the week as *"8:00 PM ET on Sunday through 8:00 PM ET on Friday"*. Off-hours prices *"reference live prices from the extended hours markets of the underlying exchanges such as Nasdaq and NYSE"* and, overnight, *"Blue Ocean ATS"*. Those boundaries are the US equity sessions, which follow US Eastern time across daylight saving (the 4 PM close is 4 PM ET in winter and summer). The page says nothing about daylight saving and nothing about a 15-minute offset.
**So:** the anchor is ET (the session boundaries are Eastern-time events), and the observed handoffs at 4:15 and 8:15 pm ET are a MEASURED 15 minutes after two of those boundaries — the offset itself is undocumented and stays a measurement. ⚠️ "EST" on the page is used loosely (it also says "ET"); it is read as Eastern time, not as a fixed UTC−5 — that reading is what the pre-registered check tests.
**PRE-REGISTERED (a length, not a promise): the first EST weekday, 2026-11-02.** Read the per-minute wide-book share with `scripts/analysis/xstock-handoff-spread-minutes.py` around 21:15Z and 01:15Z (ET-anchored prediction) AND 20:15Z and 00:15Z (UTC-anchored alternative). **Pass:** the spike sits at 21:15Z / 01:15Z. **Fail:** it sits at 20:15Z / 00:15Z ⇒ the constants are wrong by an hour and are corrected in a reviewed commit the same day. Owner CC-C. The basis is written beside the constants in `market-hours.ts`.

### A11. Policy, not a knob (Langston point 6)
The window edges are code constants: a `module_constants` row is a surface that can move without a review, and these edges encode a deliberate FIDELITY DEVIATION (choosing not to trade). That belongs behind a reviewed commit. ⇒ `ADJUSTMENT_FRAMEWORK` is N/A on that basis, stated in the Step-10 ledger, not left blank.

### A9. Ledger and provenance
Kyle 2026-09-03 (no clock term in the guard; declined a flat off-hours blackout) and 2026-10-09 (*"whatever protects us"*, the delegation) — scope §MERGED policy section and r2 C1. `#1065` (MDB symmetric blowout, the shape the guard cannot see), `#743` (reconnect snapshots, A2), `#531`/row 166b, `#392` holidays.

## B. THE PLAN
| # | item | from | change | proof |
|---|---|---|---|---|
| **C-P1** | **The predicate** | A2, A5 | `export function isXstockVenueTransitionPause(now: Date): { paused: boolean; window: '16:15' \| '20:15' \| 'sun_reopen' \| null }` in `market-hours.ts`: false inside the weekend close; else ET minute in [974, 995) ⇒ `16:15`; Sunday [1200, 1235) ⇒ `sun_reopen`; Mon-Thu [1214, 1235) ⇒ `20:15`. Window edges are code constants beside the measurement that sized them (design r5, A1, A2) and the ET-anchor basis (A10) — policy, changed only by a reviewed commit (A11). | Unit across the 2026-11-01 DST change, every weekday edge minute, Friday 20:14 (false), Sunday 19:59/20:00/20:34/20:35, Saturday (false) |
| **C-P2** | **Paper exit suppression** | A3 #1-2, A7 | In the exit loop, xStock only, AFTER the book-state block and BEFORE `checkExitConditions`: if paused, count it, log ONE `VENUE_PAUSE` line per position per window carrying mark, bid, stop, target and whether the mark had crossed a level (`wouldFire`), then `continue`. No `_recordPriceSkip`, no `updateCache`. At the first decided tick after the window, one `VENUE_PAUSE_RESUMED` line with the same fields (the cost read). | Engine-stub test: a paused tick makes no close and no price-skip; the book-state advance still ran; a tick after the window decides normally. Fence: the pause check sits after the advance and before `checkExitConditions` |
| **C-P3** | **Paper entry refusal** | A3 #3 | `_evaluateOpenDepthGate`, xStock: refuse `venue_transition_pause <window>` before the depth read. | Unit through the gate; reason code distinct from `depth_verdict` and `implausible_spread_entry` |
| **C-P4** | **The VTS half** | A3 #4-5, A7 | `vts-runner.ts` sim cycle: an xStock trade is skipped during the pause like `weekend_suspended` (exit, pending maker fill, drop all wait). `registerOpenVtsTrade`: refuse xStock during the pause, logged. Neither touches the no-decision streak. | Unit on both; fence that the skip sits before `selectVtsXstockExitBid` |
| **C-P5** | **The fidelity-deviation record + the retirement criterion** | A1, r6 (b) | Counters per window: paused exit ticks, paused positions, entries refused, VTS skips, and `wouldFire` events — exposed in the engine's diagnostics beside the existing exit counters. **Retirement criterion, pre-registered:** once increment B (bid trigger + size test) and objective 6 (`spread_blown`) are live, read two weeks of `VENUE_PAUSE`/`RESUMED` lines; for each `wouldFire` event compare the bid at suppression with the bid 15-25 min later. **Retire the pause if the share of would-be fills below both the pre-window bid and the +25-min bid is no higher inside the windows than outside them** (the outside share read the same way from `XS_FRAME`). Retirement is a reviewed commit. | Step 8 reads the counters; the criterion text goes into SM |
- **No item is UNAUDITED.**
- **Governance owed at Step 10** (the 2026-11-02 anchor read is a Step-8 item): SM — the exit-path section gains the pause (both Kyle quotes, the window table, A1's mechanism, the retirement criterion) with a cross-reference from §3.5.1, and §3.5.1's *"no threshold to revisit"* corrected (C2); SIM — `market-hours.ts`'s new export and its four consumers; `RUNNING_ISSUES` — the 11-27 half-day read; `ADJUSTMENT_FRAMEWORK` N/A (no knob: the edges are policy constants, stated as such).

**Step 2 ruling (Langston, 2026-10-10):** PROCEED on B (C-P1-C-P5) with six conditions — C1-C4 and C6 folded into A1/A2/A10/A11 and §0 above; C5 (the anchor) discharged at A10 before any constant is written.
**Second readers:** none spawned. A1's table and A2's n = 4 are Langston's re-derivations, cited; A3's census and A10's reading of Kraken's page are NOT RE-READ by a second reader.
