# Open work list, 2026-11-06

Read at `origin/migration/aws-supabase` = `98b37fc300b6be25e265caf2f163b0a7cd725786` (after `git fetch`), about 10:05Z on 2026-11-06. Built by a helper for PM Claude. Read from the ref only; the working tree was not used.

Closed overnight and NOT listed as open: B-BOOK-STATE-RESTART-DURABLE, B-VTS-NO-DECISION-VALVE, B-FEED-HEALTH-GRADE-ARM, B-WAKE-OPENING-LIST, B-TOKEN-WATCH-STORAGE, B-LANGSTON-MEMORY-WRITE-FENCE. The plan, the exceptions ledger and the memory files agree with that list.

Key dates the waits below point at:
- Joint deploy of everything held: after 2026-11-07T13:03:42Z, when row 59a's study window ends. Confirmed in the exceptions ledger (deploy-hold row, 2026-11-05T19:49Z): staging is held at `0f4835b5a` and the head ships once, run by ANALYST Claude.
- The strong-bull-trend xStock verdict: 2026-11-06T10:47:40Z (alert `dd588f0d`). Confirmed in the plan, the ledger and NEW Claude's memory.

## 1. Being worked now or in an observation window

### OLD Claude (CC-A)

| owner | batch id | what it is for | where it is | what it waits on | being worked? |
|---|---|---|---|---|---|
| OLD | B-DB-POOL-GUARD | Stops the app running out of its 10 shared database connections: a time limit to get one, a page if one comes back mid-transaction, slots kept for writers. | Step 9 of 11; observing until about 2026-11-07T08:10Z | 48 hours of connection readings, then the limits (increment 3) | observation |
| OLD | B-DISK-FILE-TIERING | Moves old files to cheaper storage every night so the server disk does not fill, and trims the price-feed debug log. | Step 7 per the plan, Step 9 per the ledger and OLD's memory | First real nightly run's readings; the last piece (the archive watchdog) ships in the joint deploy | waiting on the joint deploy |
| OLD | B-STATUS-BOARD | Being removed: Kyle decided the phone status board is not kept. The app half is removed and reviewed. | Step 7 of 11 (retirement) | Joint deploy, then the checker half | waiting on the joint deploy |
| OLD | B-CLOSE-WRITER-COSTS (row 72) | Makes sure every close finds its trade record and never books an invented zero fee; the three modes stop affecting each other. | Steps 1-4 approved for increments 1-3; next is landing and verifying after the deploy | Joint deploy, then rebase, land, check in the browser | waiting on the joint deploy |
| OLD | B-XSTOCK-CORRELATION-COLLECT (row 105) | Starts collecting how xStock pairs move together, for later tuning (collection only). | Plan says Step 1 of 11; the exact step is not stated in OLD's current position | A correlation read about 2026-11-06 14:45Z | yes, but step unclear |
| OLD | B-MEASURE-GATE (the remaining leg) | Checks whether the crew's new self-check hooks catch real mistakes. | Observing; its test needs at least 50 real catches | Enough real catches, then a different session judges it | observation |

### NEW Claude (CC-B)

| owner | batch id | what it is for | where it is | what it waits on | being worked? |
|---|---|---|---|---|---|
| NEW | B-CRYPTO-FEED-WATCHDOG | A crypto price recorder that notices a silent dead connection, reconnects and alerts. | Step 7 of 11; 48-hour watch ends about 2026-11-06T15:47Z | The watch window, then Langston's independent check (Step 8) | observation |
| NEW | B-XSTOCK-DBS-TO-STRATEGIES | Gives xStock strategies the market direction score they never received, then turns on four xStock strategies that are off. | Step 7 of 11; next is Step 8 | The 10:47:40Z verdict, then Langston. The 11-05 read tripped its investigate flag (14 strong-bull-trend xStock opens, 0 wins); reported to Kyle. | waiting on the verdict |
| NEW | B-SILENT-STRATEGY-CENSUS | Finds strategies that never run and decides which to switch on. | Step 10 of 11; closes at Step 11 | The same 10:47:40Z verdict | observation |
| NEW | B-RR-FLOOR-HEADROOM | Gives the reward-to-risk entry floors some margin so a small price slip at the fill does not break them. | Observing until 2026-11-07T13:03:42Z (21-day study) | The window; it also sets the joint-deploy time | observation |
| NEW | B-ENTRY-GATE | Refuses an entry when the price has moved too far or profit after fees is not positive. | Plan says Step 1; NEW's memory says Step 5 (increment A approved); increment B built locally | Joint deploy (a Langston ruling: increment A ships after the study window) | waiting on the joint deploy |

### ANALYST Claude (CC-C)

| owner | batch id | what it is for | where it is | what it waits on | being worked? |
|---|---|---|---|---|---|
| ANALYST | B-XSTOCK-BAR-AVAILABILITY | Records whether xStock price bars were available when a decision was made. | Step 9 of 11 | A reviewed plan for a fresh study window (the first one failed its handoff rule) and the two-session read | waiting on Langston and a US-session read |
| ANALYST | B-XSTOCK-BID-TRIGGER-RELAND | Makes xStock trades open and close only at prices a real trade could get. | Last piece deployed 2026-11-05 09:17Z; observing five full US sessions | Those sessions; the final read is alert `f6131ab0` on 2026-11-16 | observation |
| ANALYST | B-BALANCE-SESSION-PAIRING | Fixes sizing that reads a $820 starting balance against about $610 actually held (about 34% too high). | Ledger (newest) says Step 5; plan says Step 1 | Joint deploy; entry pause must be announced to Kyle first | waiting on the joint deploy |
| ANALYST | B-BOOK-TRUNCATE-HOTFIX | Held-open hotfix for order books that were cut off wrongly; the report is held until a clean test. | Observing. 74 assessable closes, 2 flagged, gate needs zero | Group ruling (owner, Langston, Coltrane) on the two flagged closes | waiting on a ruling |

ANALYST's next work after this is a read at 2026-11-06T21:00Z (US close).

### Infra Claude

| owner | batch id | what it is for | where it is | what it waits on | being worked? |
|---|---|---|---|---|---|
| Infra | B-LANGSTON-TWO-WORKERS | Lets Langston review two pieces of work at once without them colliding. | Step 6 of 11 per Infra's memory; the plan row says Step 4 | Restart held to 13:57Z today, then his memory write | yes |
| Infra | B-TRANSCRIPT-ARCHIVE | A searchable archive of every session conversation, everything a restart removes kept. | Code started (ledger: first push `230185fc1`, Step 3); plan says Step 2, memory says Step 1 | Kyle, at the one-day sample step (P4) | waiting on Kyle |
| Infra | B-LANGSTON-CLAUDEMD-RESIDUAL | Cuts Langston's always-loaded rules file under a falling size ceiling. | Step 7 of 11; installed 2026-11-05 | Two daily size-watch runs (11-06, 11-07), then Langston's Step 8 | observation |
| Infra | B-CREDENTIALS-PRIVATE-REPO | Keeps passwords out of the repo and makes the repo private. | Plan: first objective closed 2026-10-13; next piece is the bridges | Runs after B-LANGSTON-CLAUDEMD-RESIDUAL | waiting on that batch |

### PM Claude

| owner | batch id | what it is for | where it is | what it waits on | being worked? |
|---|---|---|---|---|---|
| PM | B-PM-CLAUDE | PM Claude's own setup: heartbeat, slot check before recommendations, task register. | Slot check: Step 4 CONFIRMED by Langston 2026-11-06 (r6), Steps 5-11 next; heartbeat done through Step 8 | PM Claude's own Step 7 evidence, then Langston's Step 8 | yes (paused overnight for the guard) |

## 2. Open but stalled or not moving

| owner | batch id | what it is for | last activity seen | one-line reading |
|---|---|---|---|---|
| ANALYST | B-PRICE-SIDE-BY-JOB | Each job (trigger, fill, booking) uses the price side a real trade would. | Ledger 2026-10-11; plan edited 11-04 | Two crypto pieces unbuilt and no step given; ANALYST's time went to the xStock batches. |
| ANALYST | B-VTS-MARK-SIDE (row 3) | Paper xStock prices on the right side of the book. | Plan text 2026-09-30 | Probably went live in the 10-06 deploy; the status was never updated. |
| ANALYST | B-OHLC-FRAME-GUARD (row 13) | Guards the price-bar frame signals are built from. | Plan correction 2026-10-21 | Deployed; only the Step 7 check is left and nobody has named a date. |
| ANALYST | B-REST-SIDES-TO-CACHE (row 14) | Puts price sides in the shared cache. | Plan correction 2026-10-21 | Deployed; the Step 7 read is owed with no date. |
| ANALYST | B-OHLC-WRITE-ORDER (row 16) | Stops an older price bar overwriting a newer one. | Plan correction 2026-10-21 | Deployed and Langston-confirmed 10-02; only Steps 10-11 (paperwork) left. |
| ANALYST | B-VTS-TELEMETRY-AGGREGATES (row 4a) | Stops the confidence score counting practice trades flagged "never count". | No date on the row (memory points to about 10-17) | Sent back and folded at Step 4; no sign of a Langston answer. |
| ANALYST | B-PRICE-FEED-TRUTH | Price-feed fixes I1-I3. | 2026-10-16 (memory) | No plan row; likely finished work whose batch was never closed. |
| NEW | B-PATTERN-ENUM-DRIFT (row 51 hotfix) | One strategy's pattern path was silently dead. | No date; plan still says "rides deploy B" (deployed 10-06) | Waiting for a first real trade by that strategy to confirm; no one is watching for it. |
| none named | B-XSTOCK-FRESHNESS-MONITOR | A monitor for xStock price freshness. | 2026-07-23 | Script cannot run (its database table was never created); content mostly superseded; no owner is working it. |

## 3. Queued, agreed but not started

Plan rows marked QUEUED. About 51 sit in Wave 0 (listed here); the sprint waves A1 to B4 hold about 209 more, not listed one by one.

### Kyle's pre-sprint list (agreed 2026-10-07 onward)

| owner | batch | one plain line | why queued |
|---|---|---|---|
| NEW | B-ENGINE-STOP-DURATION-COLUMN | A long-running engine no longer crashes when it is stopped. | "FIRST" in line; runs when the engine is next stopped. |
| NEW | B-DISPLAY-TRIGGER-PRICE | Open Trades shows the price that actually decides the trade. | Pre-sprint, after the xStock work. |
| NEW | B-PRICE-FEED-COVERAGE | Every symbol gets the price feeds it needs. | Behind NEW's locked list. |
| NEW | B-PLAN-PRICE-BASIS | Trade plans use the right price basis. | Behind NEW's locked list. |
| NEW | B-BOOK-TRUST-FLEET-GUARD | A guard on how far the order-book copies are trusted. | Behind NEW's locked list. |
| NEW | B-B75-SCRIPT-TEST-HARNESS | Tests for the analysis scripts. | Behind NEW's locked list. |
| NEW | T-W20C-SCALAR-LEG | Replays recorded history to the same decisions. | After B-PAPER-LANE-PROVENANCE. |
| NEW | PAPER-RESET-3000 | Reset paper to $820 and clear the dashboard. | Only Kyle's decision runs it. |
| NEW | Learning-record restart (row 100) | Restarts the learning record after the reset. | After the reset. |
| ANALYST | B-LOSS-WINDOW-OPERATOR-CLOSES | Manual closes stop re-counting in the kill switch's loss window. | Pre-sprint stage 0. |
| ANALYST | B-CRYPTO-MARK-AGE-GATE | Crypto exits refuse an old price. | Stage 2, after the xStock trigger batch. |
| ANALYST | B-EXIT-TICKER-LEG-ADAPTER-SIDES | Exit price legs use the right side. | Stage 2. |
| ANALYST | B-STALE-BOOK-DEPTH-REFUSAL | Separates our stale-cache refusals from real venue ones. | Stage 2. |
| ANALYST | B-EXIT-DECISION-RUNG-STAMP | Each exit records which rung decided it. | Stage 2. |
| ANALYST | B-OPEN-REFUSAL-DURABLE-ROW | An open refused at the fill stage leaves a durable record. | Stage 4. |
| ANALYST | B-KRAKEN-PRIMARY-KEY-RESOLUTION | Every price-cache key becomes the venue's own key. | Stage 1. |
| ANALYST | B-SPREAD-BLOWN-RELEASE-MOVEMENT | Looks at exits released below the stop. | Waits its turn. |
| ANALYST | B-XSTOCK-SNAPSHOT-RETENTION; B-CRON-MISSED-CATCHUP; B-XSTOCK-LIVE-FEED | Keep xStock snapshots; catch up missed scheduled jobs; live xStock feed. | Waiting their turn. |
| OLD | B-PAPER-FACTOR-CAPTURE-REPAIR (row 141b) | Repairs paper score capture so replay works. | Kyle's yes 2026-11-05; after row 141a. |

### Wave 0 housekeeping rows (plan §4)

| owner | batch | one plain line | why queued |
|---|---|---|---|
| OLD | B-PRUNE-REASON-AUDIT; B-BATCH-ID-ALIAS-GRAMMAR; B-ISSUE-ID-COLLISION; B-GOV-ENROLMENT-WINDOW-OBJECT; B-EXCEPTIONS-CONFIRMER-GRAMMAR | Plan and checker housekeeping: audit past prune reasons, one naming source for ids, fix reused issue numbers, set the checker's grading window, fix a pending-confirmer bug. | Queued in order behind earlier plan-keeping rows. |
| OLD | B-INVENTORY-SCRIPT-ROOT-REDIRECT; B-PLAN-WINDOW-EXPIRY; B-TRADE-RECORD-RETENTION; B-P19-PLAN-TO-HISTORY; B-PLAN-ROW-DISAPPEARANCE | Inventory scripts stop hard-coding a clone path; finished lines leave §5; close out the trade-record retention batch; retire the old plan; stop deleted rows hiding alerts. | Queued in order. |
| OLD | B-ALERT-OWNER-ON-ROW; B-FEATURE-WATCH-ROUTING; B-CENSUS-PRESPRINT-LIST; B-WAKE-LOG-BOUND; B-CODEX-FAILOVER-AUTOMATION | Alerts carry their owner; daily-check findings get a disposition; census reads the pre-sprint table; the wake log gets bounded; Codex failover automated. | Queued. |
| Infra | B-DT-REVIEW-SIDE-BRANCH; B-DTREVIEW-ABSENCE-PROVENANCE | Langston's reader can read a side review branch and stops wrongly calling a commit missing. | Queued. |
| Infra | Plan rows 5, 6, 7, 11, 12 (rulings backup, database headroom, log-table expiry, #521, duplicated plan ids) | Small storage and housekeeping fixes. | Batch names are given at Step 1. |
| Infra | B-SIZE-WATCH-BREACH-ALARM; B-LANGSTON-MEMORY-NOTICES; B-AGENT-INVOKE-FAILURE-NOTICE; B-AGENT-PRIVATE-TMP; B-LANGSTON-REPOST-FAILED; B-ALERT-LANE-LEDGER-OWNER; B-LANGSTON-RECONCILE-VERB; B-CHAPLET-DELETE | Crew-tooling alarms, notices and clean-ups. | All wait on Kyle's go. |
| Infra | B-TOKEN-WATCH-FOLLOWUP-MEMORY | Memory follow-up for the token watch. | Step 2 done; waits for the two Langston batches ahead of it. |
| NEW | B-WS-STATUS-PAYLOAD-COMPLETE; B-SYSTEM-CONTEXT-ROW-INVARIANT; B-WS-RECONNECT-BACKOFF-RESET; B-CLUSTER-LAYER-REACHABILITY; R-XSTOCK-PATTERN-TYPE; B-ADX-TRUE-RANGE-SHARED; B-RISK-INDEX-ORPHAN-REMOVAL; B-VOLATILITY-CACHE-RETIRE; B-EXPOSURE-CLASS-ALLOCATION; B-RTB-PROMOTION-RETRY-STORM | Dashboard status updates, engine on/off record, reconnect delay, dead-code removal, xStock pattern recording review, xStock share of the pot, retry-storm fix. | Queued, not started. |
| ANALYST | B-VTS-BOOKING-REFUSAL-VISIBILITY; B-VTS-REST-DEADLINE; B-SHADOW-HOLD-CLOCK; B-SETTINGS-REAL-TYPE; B-SIZING-FENCE-WALK-WIDEN; B-LIVE-READERS-CLOSED-TRADES; B-STRATEGY-SETTINGS-KNOBS; B-CLAMP-ESTIMAND-RESPEC; B-M5D-HARNESS-CENSUS; B-OPEN-POSITION-INDEX-TRUTH; B-ONE-SYMBOL-TRANSLATOR; row 8 and #628 | VTS refusal visibility, paper maker deadline, shadow hold clock, settings and index clean-ups, live-mode readers, one symbol translator, a "comfortable in paper" definition. | Queued, not started. |

## 4. Parked

| owner | batch | one plain line | why parked |
|---|---|---|---|
| NEW | B-FEED-MISMATCH-FIX | Stop and target fills use the right side of the book. | Kyle parked it 2026-09-30; its window ended 10-10. |
| NEW | B-FORMULA-HEALTH-AUDIT-FRESHNESS | Formula Health card shows when the audit really last ran. | Kyle 2026-10-19: AI pages off-limits until cleanup. |
| NEW | B-DUP-HEALTH-ROUTE-SHADOW; B-DB-REACHABILITY-ALERT; B-CRON-SUBGRACE-CADENCE | Health-check address registered three times; no alert when the database stops answering; cron checker cannot judge 5-minute jobs. | Kyle 2026-10-19: cleanup phase unless he slots them. |
| NEW (per ledger) | B-RETIRED-SCORE-REMOVAL | Removes the retired score from the code. | Phase B halted awaiting Kyle's scope call. |
| OLD | B-RULES-1e | Mechanisms for three rules followed zero times. | Parked, crew tooling, after live. |
| Infra | B-CREW-ACCESS-HARDEN | Remove standing admin, tighten crew access. | Kyle paused it 2026-10-16. |
| Infra | B-LANGSTON-CONTEXT (increment 2) | Standing trim of Langston's memory. | Partly overtaken; needs a re-scope. |
| Infra | B-TOKEN-WATCH | Token-endpoint research. | After live; waits on Kyle. |
| Infra | B-CREW-STATUS-2 | Persist derived crew facts. | After live; dissolves with the status board. |
| Langston/Kyle | P19-B8.5 | Umbrella for the old paper-mode work. | Kyle: stays open until Phase 19 closes. |

## 5. After-live list

`PRE_LIVE_SPRINT.md` holds 230 after-live items by its own heading. Its summary line says 224, and its sub-section headings add up to 231. I did not recount the items.

## 6. Sources and limits

- **Disagreements on status.**
  - OLD's B-XSTOCK-CORRELATION-COLLECT, B-CLOSE-WRITER-COSTS, B-DB-POOL-GUARD and B-DISK-FILE-TIERING: the plan, the ledger and OLD's memory give different steps. For POOL-GUARD and DISK-FILE-TIERING the plan row now agrees with the ledger on the wait.
  - B-ENTRY-GATE (plan Step 1, NEW's memory Step 5), B-BALANCE-SESSION-PAIRING (plan Step 1, ledger Step 5), B-TRANSCRIPT-ARCHIVE (Steps 1, 2 and 3), B-LANGSTON-TWO-WORKERS (Step 4 versus Step 6) and B-XSTOCK-BID-TRIGGER-RELAND ((4c) at Step 2 in the plan, deployed in the memory).
  - B-RETIRED-SCORE-REMOVAL has a different owner in the ledger (NEW) and in OLD's memory (OLD holds it).
  - B-TEC-SELFHEAL still has an `open` ledger row, though its own text says closed. I treated it as closed.
  - B-RULES-1e and B-MEASURE-GATE read "in flight, Step 2" in the old plan but parked and observation in the sprint plan. I used the sprint plan.
- **Not checked.**
  - Plan §5's observation-window lines are out of date (they list windows from September and October). I did not use them.
  - I did not list the 209 sprint-wave QUEUED rows individually.
  - The old plan's roughly 100 "PLACED, not started" rows are not listed. None is marked in flight.
  - I did not verify that the later closes in the plan rows match completion reports, except for a filename check of the batch-completion folder.
- **Stale memory files.** NEW's file headings say 2026-09-23, though the position lines inside run to 11-06. Infra's position block mixes lines from 09-11 with fresh ones. I used only the dated, current lines.
- **Pre-registered times** (10:47:40Z verdict, 15:47Z watch end, 13:57Z restart, 21:00Z read) are as stated in the files. I did not check whether any has already passed or been met.
