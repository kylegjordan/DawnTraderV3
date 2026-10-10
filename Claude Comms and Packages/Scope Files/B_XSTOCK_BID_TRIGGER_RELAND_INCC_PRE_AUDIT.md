# B-XSTOCK-BID-TRIGGER-RELAND increment C — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2, r1, CC-C, 2026-10-10)

Scope: `B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md` §MERGED r1 objective 7 + r2 conditions C1-C4 (Langston PROCEED 14:48Z). Increment C = objective 7, the venue-transition pause; independent of A and B (r2). Design: `Langston Design Asks/B-XSTOCK-BID-TRIGGER-RELAND_overnight-exit-design_r1.md` r5 (Kyle's answer 3) and r6 (b). Code read at `origin/migration/aws-supabase` (`e8dff031e`; staging runs `e1b37c2d5`).

## 0. PREVIOUSLY STATED → NOW
- **PREVIOUSLY STATED (design r6 (b)): the pause's basis is the spread data, which SIZES it but does not prove it is needed; if Step 2 cannot establish a mechanism it ships as an acknowledged belt. NOW: a mechanism is measured (A1).** Since 2026-09-19, **18 of 116 xStock closes (15.5%) fell inside the two windows, which cover 42 of 1,440 minutes (2.9%)**; 17 of the 18 are stop-outs, 13 of them inside the first 60 s after 20:15:00Z or 00:15:00Z; every one labelled `exit_book_state = two_sided`. In **7** of them the exit FILL sat below BOTH the bid 2+ minutes before the transition and the bid 15-25 minutes after it, **5 of those by 4-11%** (DLR 163.87 vs 185.02 / 180.00): a transient book the guard accepted. So the pause is not only a belt.
- **PREVIOUSLY STATED (r6): 8:14-8:35 pm ET covers "the Sunday 20:00 ET weekly reopen". NOW: on SUNDAY the pause starts at 20:00 ET (A2).** Measured 2026-10-04: 20:00 and 20:13 ET each hold ONE all-symbol burst (468 rows each), **97.2% wider than 1%**; live trading resumes at 20:15 (2,838 rows). A 20:14 start leaves both bursts unpaused.

## A. THE AUDIT

### A1. The mechanism, measured
**Object:** `closed_trades`, `asset_class = 'xstock_spot'`, `closed_at IS NOT NULL`, `closed_at >= 2026-09-19` (after `8a-P4a`), **116 rows**; ET minute via `AT TIME ZONE 'America/New_York'`; windows 16:14-16:34 and 20:14-20:34 ET inclusive. Bids from `xstock_spot_ticker_snap` as-of (−30..−2 min, +15..+25 min, +45..+60 min).
| | in 16:14-16:34 | in 20:14-20:34 | of 116 | net P&L in windows |
|---|---|---|---|---|
| closes | 10 | 8 | 18 (15.5%) | −$23.99 |
| opens | 8 | 5 | 13 (11.2%) | — |
**Per close (stop level vs bids):** of the 15 stop-outs with a +15-25-min bid, it is back ABOVE the stop for 4 (TMO, ARKK, JNJ, PCG) and below for 11. **The decisive cases are the FILLS:** DLR fill 163.87 (bid before 185.02, after 180.00), KEYS 342.00 (381.71 / 366.96), ROK 417.41 (441.33 / 425.00), PPG 101.17 (106.54 / 103.59), ARKK 85.62 (90.55 / 90.40) — fills 4-11% below both neighbours; TMO (656.58 vs 657.09 / 658.00) and INTC (112.56 vs 112.69 / 113.04) are below both by ~0.1%.
**Why the guard passes these:** a transition re-quote moves BOTH sides together. The one-side arms need the other side to hold, the mid arm keeps the mid near fair, and `spread_blown` (objective 6) is off; and even armed, a symmetric SHIFT at a normal spread is invisible to every per-frame spread test (SM §3.5.1b, `#1065`). The pause covers exactly the minutes where that shape concentrates.
⚠️ **Limits:** n = 18 is small; the after-hours bid is structurally lower than the daytime bid (the spread settles at ~24-28% of frames over 1%, design r5), so "below the stop at +25 min" over-counts genuine moves; five transient fills by 4-11% is the conservative count (seven below both neighbours at all).

### A2. The Sunday reopen
`xstock_spot_ticker_snap`, 2026-10-04 23:55Z → 10-05 00:45Z, per ET minute, share of rows with spread > 1%: **20:00 — 468 rows, 97.2% · 20:13 — 468 rows, 97.2%** · 20:15 — 2,838 rows, 75.4% · 20:16 60.5% · 20:17 54.7% · 20:18-20:24 19-28% · 20:25-20:44 13-32%. The 20:00 and 20:13 bursts are whole-universe re-sends of a book that is not yet trading (the reconnect-snapshot shape `#743` now carries). ⇒ Sunday's pause starts at 20:00 ET. Weekdays keep 20:14 (a live after-hours book runs right up to the 8:15 handoff, design r5: 21-28% before).

### A3. Census (§9.5(a) + entry-point enumeration) — every place an xStock trade opens or closes, tests excluded
| # | decision point | where | in the pause |
|---|---|---|---|
| 1 | paper exit trigger | `active-execution-engine.ts` exit loop, `checkExitConditions` (after the book-state block, `aee:~2935`) | **SUPPRESSED** — skip the decision for the tick, AFTER the book-state block (the guard keeps observing and advancing; no chain is touched) |
| 2 | paper maker exit rest (place / fill / convert) | same loop iteration, after the trigger (`aee:~2950-3080`) | **SUPPRESSED** — it is reached only through #1's iteration, so the same `continue` covers it; a resting order stays resting and is judged at resume |
| 3 | paper entry | `_evaluateOpenDepthGate` xStock branch (`aee:~676`) | **REFUSED**, reason `venue_transition_pause`, before the depth read |
| 4 | VTS xStock exit, pending maker entry fill, drop | `vts-runner.ts` sim cycle (`:3642` `weekend_suspended` skip, `:3690-3705`, `:3793-3803`) | **SUPPRESSED** — an xStock trade is skipped for the cycle like `weekend_suspended`; never counted as a VTS no-decision |
| 5 | VTS xStock new trade | `registerOpenVtsTrade` (`vts-runner.ts:4853`) | **REFUSED** for xStock, logged |
| 6 | operator actions — manual close routes, flatten, engine stop, kill switch | `routes.ts`, `active-portfolio-manager.ts` | **NOT paused** — an operator decision is never blocked by a trading-fidelity rule |
**Exactly one exit-loop writer and one entry seam per lane, confirmed by the census.** ⇒ four call sites, one predicate.

### A4. C3 — where the pause lives
**Outside `book-state.ts`.** The predicate is a pure function in `market-hours.ts`; the call sites are the four above. So SM §3.5.1's *"no clock term exists anywhere in the guard"* stays literally TRUE, and the manual edit is an addition in the exit-path section with a cross-reference (Langston r2 C3). **C2 still applies:** §3.5.1's *"no threshold to revisit"* clause is corrected (the pause has thresholds — the window edges and the Sunday start), with objective 7's retirement criterion (B5 below) in the manual text and both Kyle quotes verbatim (09-03 and the 10-09 delegation).

### A5. C4 — no new Eastern-time reader
`market-hours.ts` has `getETParts` (`:51`, private). The new predicate `isXstockVenueTransitionPause(now)` is EXPORTED from the same file and calls `getETParts`; nothing else parses Eastern time. (The other existing reader, `time-of-day.ts` `getXstockSession`, is untouched and never mixed with this one.)

### A6. Row 166b, side by side (r2: no contradiction)
| | row 166b `B-XSTOCK-WEEKEND-POSTURE` (CC-B, queued) | increment C pause |
|---|---|---|
| when | a calendar cut-off BEFORE the Friday 20:00 ET weekend closure | 16:14-16:35 ET Mon-Fri; 20:14-20:35 ET Mon-Thu; **20:00-20:35 ET Sunday** |
| what | refuses NEW entries (extends the SQE `xstock_weekend_closure` check) | suppresses exit DECISIONS and refuses entries, paper and VTS |
| overlap | Friday 16:14-16:35 may sit inside 166b's cut-off | both are refusals ⇒ the union refuses; neither re-enables what the other blocks |
No Friday 20:14 pause (the weekend close begins at 20:00 Friday, `isInXstockWeekendClose`), so the two never disagree about the weekend boundary.

### A7. No paging (objective 9)
A paused tick must NOT go through `_recordPriceSkip` (it feeds the price-skip streak and escalates to an alert) and a paused VTS look must NOT feed the `3n.q3` no-decision streak. Both get their own counter and log line instead.

### A8. Holidays (r6, not built)
`market-hours.ts:25-29` builds no holiday calendar (`#392`, Kyle-parked). Forward check stays: does Kraken's 16:15 rollover move on a US half-day? First candidate **2026-11-27** — a Step-8 read, not code.

### A9. Ledger and provenance
Kyle 2026-09-03 (no clock term in the guard; declined a flat off-hours blackout) and 2026-10-09 (*"whatever protects us"*, the delegation) — scope §MERGED policy section and r2 C1. `#1065` (MDB symmetric blowout, the shape the guard cannot see), `#743` (reconnect snapshots, A2), `#531`/row 166b, `#392` holidays.

## B. THE PLAN
| # | item | from | change | proof |
|---|---|---|---|---|
| **C-P1** | **The predicate** | A2, A5 | `export function isXstockVenueTransitionPause(now: Date): { paused: boolean; window: '16:15' \| '20:15' \| 'sun_reopen' \| null }` in `market-hours.ts`: false inside the weekend close; else ET minute in [974, 995) ⇒ `16:15`; Sunday [1200, 1235) ⇒ `sun_reopen`; Mon-Thu [1214, 1235) ⇒ `20:15`. Window edges are code constants beside the measurement that sized them (design r5, A2) — they are the policy, and a change is a reviewed commit, not a knob. | Unit across the 2026-11-01 DST change, every weekday edge minute, Friday 20:14 (false), Sunday 19:59/20:00/20:34/20:35, Saturday (false) |
| **C-P2** | **Paper exit suppression** | A3 #1-2, A7 | In the exit loop, xStock only, AFTER the book-state block and BEFORE `checkExitConditions`: if paused, count it, log ONE `VENUE_PAUSE` line per position per window carrying mark, bid, stop, target and whether the mark had crossed a level (`wouldFire`), then `continue`. No `_recordPriceSkip`, no `updateCache`. At the first decided tick after the window, one `VENUE_PAUSE_RESUMED` line with the same fields (the cost read). | Engine-stub test: a paused tick makes no close and no price-skip; the book-state advance still ran; a tick after the window decides normally. Fence: the pause check sits after the advance and before `checkExitConditions` |
| **C-P3** | **Paper entry refusal** | A3 #3 | `_evaluateOpenDepthGate`, xStock: refuse `venue_transition_pause <window>` before the depth read. | Unit through the gate; reason code distinct from `depth_verdict` and `implausible_spread_entry` |
| **C-P4** | **The VTS half** | A3 #4-5, A7 | `vts-runner.ts` sim cycle: an xStock trade is skipped during the pause like `weekend_suspended` (exit, pending maker fill, drop all wait). `registerOpenVtsTrade`: refuse xStock during the pause, logged. Neither touches the no-decision streak. | Unit on both; fence that the skip sits before `selectVtsXstockExitBid` |
| **C-P5** | **The fidelity-deviation record + the retirement criterion** | A1, r6 (b) | Counters per window: paused exit ticks, paused positions, entries refused, VTS skips, and `wouldFire` events — exposed in the engine's diagnostics beside the existing exit counters. **Retirement criterion, pre-registered:** once increment B (bid trigger + size test) and objective 6 (`spread_blown`) are live, read two weeks of `VENUE_PAUSE`/`RESUMED` lines; for each `wouldFire` event compare the bid at suppression with the bid 15-25 min later. **Retire the pause if the share of would-be fills below both the pre-window bid and the +25-min bid is no higher inside the windows than outside them** (the outside share read the same way from `XS_FRAME`). Retirement is a reviewed commit. | Step 8 reads the counters; the criterion text goes into SM |
- **No item is UNAUDITED.**
- **Governance owed at Step 10:** SM — the exit-path section gains the pause (both Kyle quotes, the window table, A1's mechanism, the retirement criterion) with a cross-reference from §3.5.1, and §3.5.1's *"no threshold to revisit"* corrected (C2); SIM — `market-hours.ts`'s new export and its four consumers; `RUNNING_ISSUES` — the 11-27 half-day read; `ADJUSTMENT_FRAMEWORK` N/A (no knob: the edges are policy constants, stated as such).

**Second readers:** none spawned. **NOT RE-READ:** A1 and A2's numbers (queries in this session; re-derivable from the object and windows stated) and A3's census.
