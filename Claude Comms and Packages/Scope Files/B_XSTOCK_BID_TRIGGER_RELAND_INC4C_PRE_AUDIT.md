# B-XSTOCK-BID-TRIGGER-RELAND increment (4c) — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: architecture (row 2's declared class; this increment changes when a VTS xStock page fires)
**Owner:** CC-C · **Row:** `SPRINT_TO_LIVE_PLAN` row 2 · **Placed:** after (4b) Step 7 and before row 2.3 (progress report §3d HOME line, and Langston's (4b) Step 8 adding the moonbag basis item) · **Drafted:** 2026-11-05 ~02:30Z.

## 0. Previously stated vs now
- **PREVIOUSLY STATED (§3d, 2026-11-04):** "350 of 389 rail pages minted 10-13 min after the US open; 297 cleared 15-20 min after it." **NOW: unchanged.** The population is the 389 rail rows minted 10-19 → 11-03.
- **PREVIOUSLY STATED (§3d):** the paging clock starts at the engine's 09:30 regular session, "mechanism cited, NOT RE-READ". **NOW: re-read at the code, A1 below.**

## 1. Audit

### A1 — why the pages land at the open (mechanism re-read)
`vts-runner.ts:4028-4030`: `_ntXsOffHours = xstock && (isInXstockWeekendClose(now) || getXstockSession(now) !== 'regular')`; `_ntPages` is true only outside off-hours. `getXstockSession` (`asset_classes/xstock_spot/time-of-day.ts:82-94`) returns `regular` from 09:30 to 16:00 New York time. `stepNoTriggerStreak` keeps a streak in every session but measures PAGING time only while `_ntPages` is true, with `pageSinceMs` restarting after any off-hours gap; at `VTS_NO_TRIGGER_ALERT_AFTER_MS` = 10 min (`:225`) it pages. ⇒ a VTS xStock trade with no decision at 09:30 crosses the page line at **09:40 ET**.
**The venue's own regular-session flag flips at 09:45 ET**: measured first `is_extended_hours = false` rows 13:45Z on 10-29 and 10-30 (EDT) and 14:45Z on 11-02 and 11-03 (EST), §3d. The system already knows this: `entry-spread-plausibility.ts:25` says the feed's flag "flips at 13:45Z, 15 min after the open" and is not the engine's session. So for 15 minutes our clock calls it regular while the venue does not, and books in that window are not yet the regular book. The pages then clear 15-20 min after the open, once the books turn usable.
**Census (§9.5(a)) at the page decision:** one writer of `_vtsNoTriggerStreak` (`vts-runner.ts`, the real-lane resolve loop); the shadow lane does not page. One consumer of `_ntPages` per trade. The session function `getXstockSession` has other readers (the VTS instrument's per-session buckets, the paper xStock paths); **this increment does not change `getXstockSession`**, only the rail's page gate.

### A2 — the joins carry no reason breakdown
`[VTS_RAIL][SWEEP]` (`vts-rail-reporting.ts:332`) prints `crossings`, `joins`, `pagesAttempted`, `minted`, `dedupeHits`, `escalations`, `markMissedRowMarks`, `reasonExits` since start. A join happens for `too_wide`, and for `too_old` only on a `quiet`/`closed` cohort verdict (`core/trading/vts-rail.ts:48-55`). The (4a) read could not say how the 50/60/97 daily joins split between the two, and the §3d reason table had to come from alert bodies.

### A3 — `moonbag_timeout` prints no basis
`active-execution-engine.ts` (the exit switch after `selectExitTrigger`): `target_hit`, `stop_hit`, `break_even_stop` and `trailing_stop_hit` print `${_xsTag}` (which carries `basis=`), but `case 'moonbag_timeout'` prints `type=moonbag_timeout price=${currentPrice}` with no tag. A moonbag exit would read as "no exception" rather than "not observed" in any basis read (Langston, (4b) Step 8).

### A4 — provenance
- The page gate's session rule is `8a-P4c` increment 3 P10 (rule C, Kyle's `#994`: "Kyle cut the PAGE, not the measurement"), comment at `vts-runner.ts:4021-4027`. Its intent is that off-hours staleness never pages; the 09:30-09:45 gap is a mismatch between our clock and the venue's, not a choice that was made. **Disposition (2): relevant, needs updating to today's measured venue behaviour.**
- The join rule and the sweep line are row 2 increment (4a) (Langston-ruled; (4a) objective 11 PASS 2026-11-04). **Disposition (1); this adds a field only.**
- The moonbag log line predates the `_xsTag` work (`B65.2`). **Disposition (2): bring it into line.**

### A5 — ledger search
`RUNNING_ISSUES` and the progress report searched for "open", "09:45", "13:45Z", "pageSinceMs" and `moonbag_timeout`: the opening-bell finding is §3d's own, homed here; no prior decision covers the 09:30-09:45 window.

## 2. Plan (each item cites its finding)
| # | item | finding |
|---|---|---|
| **P1** | **An opening settle for the xStock page gate:** paging time does not run from 09:30 to 09:45 New York time (`XSTOCK_PAGE_OPEN_SETTLE_MS` = 15 min), named for the venue's measured flag flip, with that measurement cited beside the constant. Implemented in the rail's gate only (a pure helper beside `getXstockSession`, used by `_ntXsOffHours`), so the streak is still measured in full and only the page waits. | A1 |
| **P2** | **Joins by reason on the sweep line:** `joinsTooWide` and `joinsTooOldQuiet` counters beside `joins`, since start like the others, and their sum equals `joins` (a test asserts it). | A2 |
| **P3** | **`moonbag_timeout` prints its basis:** the same `${_xsTag}` as the other exit types. | A3 |
| **P4** | **Tests:** the settle helper (09:44:59 ET off, 09:45:00 ET on, both clock regimes, weekend unaffected); a page that would have fired at 09:40 now fires at 09:55 for a still-undecided trade; the sweep line's join split; the moonbag line carries `basis=`. | P1-P3 |

**Alternative considered for P1, and why not:** reading the venue's own `is_extended_hours` per symbol. It is the truer signal, but the flag lives only in `xstock_spot_ticker_snap`, not in the in-memory quote the VTS loop reads, so it means new plumbing on the hot path for a rule whose measured effect is a fixed 15 minutes. If the venue ever moves its flip, P1's constant is wrong in a way the (4c) read will show (pages clustering at the new boundary).

## 3. Pre-registered Step 7 read (written before the data)
Over the first five complete US regular sessions after deploy, from `[VTS_RAIL][SWEEP]` and the rail rows:
- **PASS** if rail pages minted 0-15 min after the open fall to ≤ 10% of the (4a)-window share (350 of 389 = 90% ⇒ ≤ 9% of that session's mints), and pages minted 15-30 min after the open do not rise above 2× their (4a)-window count per session;
- **FAIL** if pages simply move to 25-30 min after the open in the same numbers (the settle only delayed them), or if any non-expected reason that paged in the window stops paging.
- Report the join split from P2 per session, and every `moonbag_timeout` line's `basis=` (zero lines is "not observed", stated).

## 4. Risk
A genuinely broken xStock feed at the open pages up to 15 minutes later than today (25 minutes after the open instead of 10). Off-hours behaviour, crypto paging and every exit decision are unchanged; only an alert's timing moves.

## 5. Plain-language summary
Most VTS xStock alerts fire ten minutes after the US open, because our clock calls the market open at 9:30 while the venue only switches to its regular book at 9:45. They then clear by themselves. The plan waits 15 minutes after the open before that clock starts. It also adds a count of why waiting trades were held back, and gives the one exit type that doesn't say which price it used the same label as the rest.
