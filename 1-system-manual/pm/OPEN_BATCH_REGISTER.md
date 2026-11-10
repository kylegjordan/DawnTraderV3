# Open batch register — 2026-11-05 09:40 UTC, built by PM Claude

> **UPDATE 2026-11-06 ~13:0xZ (PM Claude):** six batches closed overnight/this morning and are struck below. The fuller, newer census is `1-system-manual/pm/reviews/2026-11-06_OPEN_WORK_LIST.md` (57a2f4a62); this register is rebuilt from it at the next full crew check. Also closed or moved since that list: B-VTS-TELEMETRY-AGGREGATES (row 4a) at Step 11 with Langston (ANALYST, 75aeb7fad); B-PRICE-FEED-TRUTH at Step 11 with Langston. Open follow-ups from #1235: F2's xStock half (own stop/target sizes for the strong-trend lane, decision pending on #1235) and #1249 (no warning when a deploy lands inside another batch's test window), surfaced for Kyle, not placed.

> **CURRENT OVERLAY 2026-11-10 13:32Z (PM Codex):** this is the authoritative current-position layer until the older 2026-11-05 census below is rebuilt. OLD — B-DB-SIZE-RELIEF Step 7 is timed through the 2026-11-11 01:00Z partition run and 02:15Z retention/database read, plus Kyle's signed-in UI leg; KD-69 is closed. NEW — B-ENTRY-GATE inc A Step 7 remains in its registered 2026-11-10 14:30-21:00Z full-session wait; the B-SILENT-STRATEGY-CENSUS due read remains complete at `89ea0e4dc`. ANALYST — B-XSTOCK-BAR-AVAILABILITY is legitimately open in its November 9-18 Step-9 observation window; both governance backstops were resolved after the re-justification at `2995b2adc` passed four-job CI, while the certification tally stays open for the final read. #1250 Step 7 remains at its formal five-session read, KD-19 at Step 9 event wait, and 8c at Step 7 waiting on Kyle. INFRA — #1117 drift parse capture completed Step 11 at `d6c98284a`; Coltrane confirmed the increment, the B-CREDENTIALS-PRIVATE-REPO parent remains open, and INFRA is identifying the next eligible non-deploy parent objective. B-LANGSTON-TWO-WORKERS remains at Step 7 with the 2026-11-20 fallback, B-DISK-HEADROOM remains at Step 6, and Langston plus worker 2 remain off. Shared successor `6ec74023e` passed all four CI jobs. Sources: four CURRENT POSITION blocks, four exact building chats, clone heads, due-alert queue and Discord through 2026-11-10 13:32Z.

> **How this register is used (Kyle 2026-11-05, KD-29).** PM Claude re-reads it at EVERY crew check (the scheduled check and any slotting decision) and updates it the same turn.
> - Every open batch carries ONE of three states: **ACTIVE** (being worked now) · **OBSERVATION** (deployed, waiting on a dated read or window; the date is written) · **STALLED** (no recorded activity for 7 days, or an OBSERVATION read whose date has passed with no result).
> - A session may hold several batches at once and may switch between them (an urgent fix, a dependency, a wait). This is NOT restricted (Kyle 2026-11-05, ~11:25Z). The register only TRACKS each one and FOLLOWS UP: a STALLED batch is chased with its owner at the next crew check, and raised to Kyle only if it stays stalled with no recorded reason.
> - An OBSERVATION read is chased ON its date: if the read is not posted within a day of its date, the owner is nudged; a second miss goes to Kyle.
> - Deployed batches that only need their final verification and write-up are the first thing a session is pointed back to.

Built from the review branch at `5a14ac786` plus the pull at 09:27Z (working-tree reads; CRLF caveat applies to byte counts only, not to this register).
Sources, in order: `SPRINT_TO_LIVE_PLAN.md` (§0a table and §4 rows), the four session task lists, the five memory files (`.claude/memory/`), `GOVERNANCE_EXCEPTIONS.md` open rows, and the seven governance-checker "OPEN > 7d" ids you named.
Rule used: CLOSED = a `*_COMPLETION_REPORT.md` exists in `Claude Comms and Packages/Batch Completion/` or the plan/task list says CLOSED. Everything else started = OPEN. A `_PROGRESS_REPORT.md` is NOT a completion report.
Not counted: items that are only QUEUED with no scope or code started (for example B-PRICE-FEED-COVERAGE, B-PLAN-PRICE-BASIS, B-CRON-MISSED-CATCHUP, B-UNIVERSE-REFRESH-ACTS, B-SYMBOL-CLASS-IDENTITY, B-TOKEN-WATCH-FOLLOWUP-MEMORY).
Date column = last dated evidence I could find. "UNKNOWN" = I could not establish it.

## OLD Claude (CC-A)

| batch id | what it is for | step N of 11 | waiting on | last evidence |
|---|---|---|---|---|
| B-DB-POOL-GUARD (#1239) | Guard the app's 10 shared database connections: time limit to get one, page on a mid-transaction return, slots kept for writers. | Step 9 (memory); plan says Step 4; task list says Step 1 | 48 h of readings, then increment 3 (limits); Langston's gate-1 question | deployed `c0214c973` 2026-11-05 08:08Z (MEMORY_CC_A.md position line) |
| B-DISK-FILE-TIERING (#1233) | Move old files to cheaper storage on a schedule, plus trim the price-feed debug log (#1240). | Step 9 (memory); plan says Step 7 | OBJ-10 rotated-file PASS, H-1..H-3, Step 8, governance | O1 r3 deployed 2026-11-05 (MEMORY_CC_A.md); plan row 5a |
| B-STATUS-BOARD (#1227) | The phone status board that reads the plan. | Step 7 | Langston (shared-id fix); Kyle's phone check; absent-file and stale-banner renders at next restart | exception row 2026-11-05T03:40Z (GOVERNANCE_EXCEPTIONS.md:29); plan line 37 |
| B-XSTOCK-CORRELATION-COLLECT (plan row 105, roadmap 25-9) | Start collecting xStock pair-correlation data (collection only). | Step 4 (memory); plan says Step 1; task list says QUEUED | Langston on code `c74ff4dbf`; a US-hours repeat after 14:30Z | MEMORY_CC_A.md position line (2026-11-05 08:20Z) |
| B-CLOSE-WRITER-COSTS (plan row 72) | A close always finds its trade record; no invented zero fee; the three modes independent. | Step 2 (memory); plan and task list say QUEUED | Langston (scope r3 PROCEED, `e83fad625`); starts after rows 4-5 per KD-27 | MEMORY_CC_A.md position line; PM memory notes Langston ruling msg `1567679032332521534` |
| B-RULES-1e | Crew tooling rules work. | Step 2, PARKED (after live) | nothing until after live | task list 0a; plan line 110; pre-audit `650dd2209` |
| B-MEASURE-GATE (legs beyond leg 2) | Further measurement-gate hooks beyond the closed leg 2. | Step 2, PARKED (after live) | nothing until after live | task list 0a (Step 1 approved 2026-08-31; leg 2 closed 2026-09-02) |

Open count: 7; actively worked: 5; parked/waiting: 2

## NEW Claude (CC-B)

| batch id | what it is for | step N of 11 | waiting on | last evidence |
|---|---|---|---|---|
| B-CRYPTO-FEED-WATCHDOG (#1232) | The crypto recorder notices a silent connection, reconnects and alerts. | Step 7 / WATCH WINDOW | 48 h watch to 2026-11-06 ~15:47Z (alert `d766f9b3`), then Langston Step 8 | deployed `b8685a453` 2026-11-04 15:47Z; plan row 33a |
| ~~B-XSTOCK-DBS-TO-STRATEGIES~~ ✅ CLOSED 2026-11-06 (Langston Steps 10-11 12:21Z) (#1235) | xStock strategies receive the direction score; then switch on four xStock strategies still off. | Step 7 (plan) | first US-session read 21:15Z (alert `dbc60600`), then Langston Step 8 | deployed `8636040255` 2026-11-05 05:36Z (plan line 20) |
| B-ENTRY-GATE (#1224) | Entry refused when the price has moved too far or profit after fees is not positive. | Step 1 (scope r1 sent back 2026-10-21; r2 not yet sent) | queue order: after the watchdog and #1235; Coltrane silent since 10-20 | plan line 32; MEMORY_CC_B.md 11-04 14:40Z entry |
| B-ENGINE-STOP-DURATION-COLUMN (#1067) | An engine stop no longer crashes on a long session (whole-number overflow at ~24.8 days). | Step 7 (task list) | the engine stop, run as the paper reset's first act | task list B 0; deployed 2026-10-07 |
| B-RR-FLOOR-HEADROOM (#1183) | Reward-to-risk floors get margin so a small fill slip does not breach them. | Step 10 / WATCH WINDOW | 21-day read from 2026-10-17T13:03Z; terminal alert `20bba77f` 2026-11-07 | progress report commit `34c0a6a7d` 2026-11-04 |
| B-SILENT-STRATEGY-CENSUS | Find strategies that never evaluate and decide which to switch on. | Step 10 / WATCH WINDOW | alert `dd588f0d` (20 xStock closes or 2026-11-06), then O3 — NOT discharged: #1235 only removed the reason to wait (Langston, 11-06). Replacement window likely ends at the 11-07 inc-A deploy; O3's four switch-ons proposed to follow inc-A, one at a time, after an amended feasibility check incl. stops and costs (NEW + Langston + Coltrane 11-06, to Kyle for timing) | progress report `18c5c517c` 2026-10-17 |
| ~~B-FEED-HEALTH-GRADE-ARM~~ ✅ CLOSED 2026-11-06 (Langston Step 11 03:39Z) (#1123) | Arm the feed-liveness grade that was read but never loaded. | Step 10 (task list); plan says Step 7 partial; exception row says Step 9 | one weekday of readings and the first real recovery; "one extension at most" | progress report `b41d5442d` 2026-10-18 |
| B-FORMULA-HEALTH-AUDIT-FRESHNESS (#1214) | The Formula Health card shows when the scheduled audit last ran. | PARKED (Kyle: AI pages off-limits) | the cleanup phase | parked 2026-10-19; deployed `ee0a3b0e4` |
| ~~B-PATTERN-ENUM-DRIFT~~ ✅ CLOSED 2026-11-06 (Langston 10:16Z) (hotfix, #1063, plan row 51) | volatility_edge's pattern path was silently dead. | Step 7, verification half-done | first `volatility_edge` open after deploy B, to read its `pattern_type` | task list B (as of 2026-11-04); no completion report found |
| B-FEED-MISMATCH-FIX (plan 3n.u) | Stop/target fills use the right side of the book. | Step 10 / PAUSED (Kyle 2026-09-30) | the 300-close window, ended 2026-10-10 | progress report `dea5f554a` 2026-09-30 |
| T-W20C-SCALAR-LEG (plan row 107) | Capture integrity: the parity harness replays recorded history to the same decisions. | Step 1 (scope r1 drafted, never ruled) PARKED | its turn, after B-PAPER-LANE-PROVENANCE | scope `6e97a8f1c` 2026-09-13 |

Open count: 11; actively worked: 2; parked/waiting: 9

## ANALYST Claude (CC-C)

| batch id | what it is for | step N of 11 | waiting on | last evidence |
|---|---|---|---|---|
| B-XSTOCK-BAR-AVAILABILITY (#707) | Know whether xStock bars were available when decisions were made. | Step 9 | R6b two-session read (11-05/11-06 US); re-registration plan with Langston | MEMORY_CC_C.md: deployed `10df95fb0` 2026-11-05 04:35Z |
| B-XSTOCK-BID-TRIGGER-RELAND | xStock trades open and close only where a real trade could. | (4c) Step 7 per memory; (4c) Step 2 per plan; (4b) Step 10 | five complete US sessions from 11-05; C-P5 read 11-16 | (4c) deployed `0abfd7102` 2026-11-05 09:17Z (MEMORY_CC_C.md); plan line 235 |
| B-BALANCE-SESSION-PAIRING (#618) | Fix sizing reading the $820 anchor against ~$610 held (~34% high). | Step 2 (memory, r3 `0abfd7102`); plan says Step 1 | Langston (Step 2 r3) | git log `0abfd7102` |
| B-PRICE-SIDE-BY-JOB (plan row 17) | Each job (trigger, fill, booking) uses the price side a real trade would. | UNKNOWN (plan gives no step; rows 8c, 8d still to build) | UNKNOWN; KD-19 (2026-11-04) added three objectives | latest exception re-justification 2026-10-11 (GOVERNANCE_EXCEPTIONS.md:67); plan line 289 edited after 11-04 |
| ~~B-VTS-NO-DECISION-VALVE~~ ✅ CLOSED 2026-11-06 (Langston Step 11 03:27Z) (plan row 4) | A VTS trade with no usable sell price stops booking at the midpoint. | Step 7 (plan); memory says Step 5 done, next 6 | weekend reopen count | exception row 2026-10-07T11:25Z (GOVERNANCE_EXCEPTIONS.md:62) |
| B-OHLC-FRAME-GUARD (#1028, row 13) | Guard the bar frame that signals are built from. | Step 7 (plan); memory says Step 5 done | the on-screen check | exception row 2026-09-30T02:45Z (:73) |
| B-REST-SIDES-TO-CACHE (row 14) | REST price sides go to the shared cache. | Step 7 | the Step-7 read, owed | plan line 283 ("status corrected 2026-10-21") |
| ~~B-BOOK-STATE-RESTART-DURABLE~~ ✅ CLOSED 2026-11-06 (Langston Step 11 01:05Z) (row 15) | Order-book state survives restarts. | Step 10 | Steps 10-11 | plan line 286; Step 8 confirmed 2026-10-09 |
| ~~B-OHLC-WRITE-ORDER~~ ✅ CLOSED 2026-11-06 (Langston Step 11, with F-G-1) (#1031, row 16) | The OHLC writer can no longer put an older bar over a newer one. | Step 10 | Steps 10-11 | plan line 287; Step 8 PASS 2026-10-02 |
| B-VTS-MARK-SIDE (row 3) | VTS xStock prices on the right side (8a-P4c increments 2-3). | UNKNOWN (plan text from 2026-09-30 says "Step 6 with the held release") | UNKNOWN | plan line 253; merge `6eaac010d` 2026-09-30 |
| B-PRICE-FEED-TRUTH | Price-feed truth fixes I1-I3. | Step 7 (memory, 2026-10-16 block) | I1 gated on a 2026-10-19 window | MEMORY_CC_C.md "(superseded) POSITION 2026-10-16"; no plan row |

Open count: 11; actively worked: 3; parked/waiting: 8
(B-VTS-TELEMETRY-AGGREGATES, row 4a, is UNKNOWN: the task list says Step 4 r2 as of 2026-10-17 but the plan row is struck through. Not counted.)

## Infra Claude (CC-INFRA)

| batch id | what it is for | step N of 11 | waiting on | last evidence |
|---|---|---|---|---|
| B-TOKEN-WATCH-STORAGE (#1132) | Move the token-watch backlog to cold storage and keep the store inside its limit. | Step 7 | re-download check after 00:00Z; nothing-to-move re-run after 11-06 05:30Z; design ruling on #1246 | MEMORY_CC_INFRA.md (11-05 05:30Z run: 86 files moved) |
| B-WAKE-OPENING-LIST (#1241) | Everyone named in a post's opening list of addressees wakes. | Step 1 (plan: Step 1 APPROVED, scope r4a) | Langston (memory says r3 at Langston) | plan line 76; PM memory |
| B-LANGSTON-CLAUDEMD-RESIDUAL (#974) | Cut Langston's always-loaded rules file under a falling ceiling. | Step 7 | two daily size-watch runs under the ceiling, then Step 8 | installed 2026-11-05 08:21Z (task list; plan line 78) |
| B-LANGSTON-MEMORY-WRITE-FENCE (#1234) | Langston's memory file writable only through the tool. | Step 1 (scope r1 `5a8a72793`) | dispatch held until the rules-file batch finishes | MEMORY_CC_INFRA.md |
| B-LANGSTON-CONTEXT (increment 2) | Keep Langston's memory trimmed by a standing system. | UNKNOWN (task list: chunk 1 Step 7 / chunk 2 Step 3; memory: chunk 1 CLOSED, next P-2) | the task list names runs of 2026-09-11 | progress report `b0c1d8223` 2026-09-13 |
| B-CREDENTIALS-PRIVATE-REPO (#1023) | No password in the repo; flip the repo private. | OBJ-1 closed; parent open, "Step 1 next" (memory); "GB-8 bridges next" (plan) | after B-LANGSTON-CLAUDEMD-RESIDUAL | progress report `c49bb5f24` 2026-10-13 |
| B-CREW-ACCESS-HARDEN (#1092, #924) | Remove standing admin and tighten crew access. | Step 9, PAUSED | Kyle (still paused 2026-11-04) | task list; plan line 82; P3a fixes `ddf7eafac` unreviewed |
| B-TOKEN-WATCH | Research token endpoint. | Step 7, PAUSED (after live) | Langston round 11; Helius feed not pointed at us | task list; plan line 145 |
| B-CREW-STATUS-2 (remainder) | Persist derived crew facts at observation time. | PARKED | Kyle (parked 2026-08-26) | task list 0a |

Open count: 9; actively worked: 2; parked/waiting: 7
(B-LANGSTON-RELIEF closed 2026-11-05. B-WAKE-LEAD-NAME is CLOSED: completion report exists and plan line 139 says so; see disagreements. B-COLTRANE is a Kyle-directed non-eleven-step interruption and is not counted.)

## PM Claude (CC-PM)

| batch id | what it is for | step N of 11 | waiting on | last evidence |
|---|---|---|---|---|
| B-PM-CLAUDE | PM Claude's own setup, in ten increments (P1b heartbeat, P1d slot check). | P1d: Step 2 (r5 `ab770a274` at Langston); P1b: Step 8 | Langston on r4/r5; Step 8 for P1b | exception row 2026-11-04T20:53Z (GOVERNANCE_EXCEPTIONS.md:32); MEMORY_PM.md |

Open count: 1; actively worked: 1; parked/waiting: 0

## Total
Open count: 39 (OLD 7, NEW 11, ANALYST 11, INFRA 9, PM 1); actively worked: 13; parked/waiting: 26

## Disagreements between sources

Step or status differs between the plan (P), the task list (T) and the memory file (M). All quotes verbatim.

- B-DB-POOL-GUARD: P "IN FLIGHT — Step 4 (OBJ-1/1b/1c deployed `93cead7f2` 2026-11-04 …"; T "IN FLIGHT, Step 1 (scope r1 with Langston)"; M "STEP: 9 of 11 — increment 2 r4 … Langston PROCEED + deployed".
- B-DISK-FILE-TIERING: P and T "Step 7"; M "STEP: 9 — O1 r3 PROCEED + deployed".
- B-XSTOCK-CORRELATION-COLLECT: P "IN FLIGHT — Step 1 (scope r1 …)"; T item 5 "QUEUED, before live, after items 1-2"; M "STEP: 4 — code `c74ff4dbf` with Langston".
- B-CLOSE-WRITER-COSTS: P row 72 "QUEUED"; T item 8 "QUEUED, after items 4-5"; M "STEP: 2 — scope r3 PROCEED + amendment folded".
- B-XSTOCK-BID-TRIGGER-RELAND: P "(4c) Step 2 r2 with Langston"; M "(4c) `STEP: 6 of 11` DONE — DEPLOYED `0abfd7102` … `NEXT: 7`"; M also has an older block reading "Row 2 `STEP: 7 of 11`".
- B-BALANCE-SESSION-PAIRING: P "IN FLIGHT — Step 1 (scope r1 …)"; M "Step 1 PROCEED; Step 2 audit+plan `a5135baa` with Langston … Step 2 r3 `0abfd7102`".
~~- B-XSTOCK-DBS-TO-STRATEGIES: P "IN FLIGHT — Step 7 (deployed `8636040255` …)"; T (CC_B, as of 2026-11-04) "own batch, named at Step 1"; M position block dated 2026-09-23 with the 11-04 20:45Z line "own batch, name at Step 1" (no 11-05 entry).~~ ✅ CLOSED 2026-11-06 (Langston Steps 10-11 12:21Z)
- B-ENGINE-STOP-DURATION-COLUMN: P row 2a0 "QUEUED — FIRST"; T "deployed 2026-10-07 — STEP 7"; P §0a table "row".
~~- B-FEED-HEALTH-GRADE-ARM: P "OPEN — deployed 2026-10-10, Step 7 partial"; T "STEP 10 — progress report, card Observation"; exception row 2026-10-17 "Step-9 fix deployed `162ae0537`".~~ ✅ CLOSED 2026-11-06 (Langston Step 11 03:39Z)
~~- B-VTS-NO-DECISION-VALVE: P "STEP 7 of 11"; M "`STEP: 5 of 11` DONE … `NEXT: 6`, rides deploy B".~~ ✅ CLOSED 2026-11-06 (Langston Step 11 03:27Z)
- B-OHLC-FRAME-GUARD: P "IN FLIGHT — Step 7"; M "`STEP: 5 of 11` … `NEXT: 6`".
- B-WAKE-LEAD-NAME: P line 139 "CLOSED 2026-09-11"; T "Step 10"; M "STEP 11 of 11 … BLOCKED-ON Kyle's acknowledgement". Completion report exists, so CLOSED; both the Infra task list and memory are stale.
- B-LANGSTON-CONTEXT: T "chunk 1: Step 7 … chunk 2 part 1 at Step 3"; M "chunk 1 CLOSED; NEXT: P-2 (Step 1/2)".
- B-WAKE-OPENING-LIST: P "Step 1 APPROVED 2026-11-05 (scope r4a …"; M "STEP: 1 of 11 r3 `51762457a` at Langston".
- B-HEALTH-CHECK-REMOVAL and B-DASHBOARD-STATS-BLANK: M (CC-B) "Steps 10-11 still owed"; both have completion reports in Batch Completion, so both are CLOSED (memory stale; not in the counts).
- B-TEC-SELFHEAL: GOVERNANCE_EXCEPTIONS.md:90 still "open"; `B_TEC_SELFHEAL_COMPLETION_REPORT.md` exists. Stale exception row.
- Task-list ages: CC_C task list header "as of 2026-10-17" and CC_A "as of 2026-09-29" (its section 00 was updated 2026-11-05); CC_C memory position block 2026-11-04 with a 2026-10-16 block below.

## Open rows in GOVERNANCE_EXCEPTIONS.md with no session position

Not counted in the totals; owner UNKNOWN unless stated.
- B-BOOK-TRUNCATE-HOTFIX: open since 2026-08-23, row owner "langston"; no completion report found.
- B-XSTOCK-FRESHNESS-MONITOR: open since 2026-07-08, "pending".
- B-RETIRED-SCORE-REMOVAL: open since 2026-07-25; row says re-homed to CC-B (Phase 16) by Kyle 2026-09-02; absent from CC-B's task list and memory.
- P19-B8.5: umbrella, legitimately open until Phase 19 closes (Kyle 2026-09-02).

## Stalled

Open batches with no recorded activity in 7+ days (as of 2026-11-05):
- B-FEED-MISMATCH-FIX (NEW): 36 days (progress report 2026-09-30); paused by Kyle.
- B-LANGSTON-CONTEXT (INFRA): 53 days (progress report 2026-09-13); task list text is stale.
- T-W20C-SCALAR-LEG (NEW): 53 days (scope 2026-09-13).
- B-OHLC-FRAME-GUARD (ANALYST): 36 days (exception row 2026-09-30); plan says only the on-screen check is left.
- B-VTS-MARK-SIDE (ANALYST): 36 days (plan text 2026-09-30); step UNKNOWN.
~~- B-VTS-NO-DECISION-VALVE (ANALYST): 29 days (exception row 2026-10-07).~~ ✅ CLOSED 2026-11-06 (Langston Step 11 03:27Z)
- B-ENGINE-STOP-DURATION-COLUMN (NEW): deployed 2026-10-07 (29 days); waits on an engine stop that nobody has scheduled.
- B-PRICE-FEED-TRUTH (ANALYST): last position 2026-10-16 (20 days); no plan row.
- B-BOOK-STATE-RESTART-DURABLE, B-OHLC-WRITE-ORDER, B-REST-SIDES-TO-CACHE (ANALYST): plan rows last corrected 2026-10-21 (15 days); Steps 10-11 or the Step-7 read owed. Each is deployed.
~~- B-FEED-HEALTH-GRADE-ARM (NEW): 18 days (progress report 2026-10-18); its "one extension at most" window has run out.~~ ✅ CLOSED 2026-11-06 (Langston Step 11 03:39Z)
- B-CREDENTIALS-PRIVATE-REPO (INFRA): 23 days (2026-10-13).
- B-FORMULA-HEALTH-AUDIT-FRESHNESS (NEW): 17 days, parked by Kyle's rule (2026-10-19); its Step-7 read lapsed unread.
- B-PRICE-SIDE-BY-JOB (ANALYST): 25 days since the last exception re-justification (2026-10-11); plan edited 2026-11-04 (KD-19) but rows 8c and 8d still unbuilt.
~~- B-PATTERN-ENUM-DRIFT (NEW): UNKNOWN date; still awaiting its first volatility_edge open.~~ ✅ CLOSED 2026-11-06 (Langston 10:16Z)
- B-CREW-STATUS-2 (INFRA): parked since 2026-08-26 (71 days) on Kyle.
- Paused on Kyle or after-live, deliberately: B-CREW-ACCESS-HARDEN (2026-10-16), B-TOKEN-WATCH, B-RULES-1e, B-MEASURE-GATE.
