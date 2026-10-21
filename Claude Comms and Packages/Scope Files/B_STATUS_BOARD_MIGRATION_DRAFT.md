# B-STATUS-BOARD — the pre-sprint table, MIGRATION DRAFT for owner check (2026-10-21)

**What this is.** `SPRINT_TO_LIVE_PLAN.md` §0 ("Clear the plates first", 38 rows) and §0a (the pre-sprint stages and session lists, 11 rows) become ONE table (`B_STATUS_BOARD_SCOPE.md` OBJ-1; pre-audit P2). Below is my proposed line for every live item. **Each session: check YOUR lines — owner, status, waiting on — and answer with corrections only.** Nothing here is written into the plan until the owners have answered; a line nobody confirms ships with status `unconfirmed`.

**A row-backed item shows its §4 row's status cell, so if that cell is out of date the board is out of date. Where I noticed one, the line says so; the fix is to update the §4 row, not this table.**

**Columns (the new table's header, exactly):** `| stage | order | item | owner | plan row | issue | agreed | status | waiting on |`
- **status** — `row` when the item owns a §4 row (the row's status cell is the one copy); otherwise one of the plan's words: `QUEUED` · `IN FLIGHT — Step N` · `BUILT` · `OBSERVATION` · `PARKED` · `DONE` / `CLOSED` · `MOVED` · `WITHDRAWN`.
- **waiting on** — `nothing` · `Kyle` · `Langston` · `Coltrane` · a session · `data — <what, until when>`.
- **agreed** — §0 items: Kyle 2026-09-28 (the "clear the plates" list); §0a stage items: Kyle 2026-10-07; CC-B's list: Kyle 2026-10-20 (locked); CC-A's list: Kyle 2026-10-20/21.

## ANALYST Claude (CC-C) — please check
| stage | order | item | plan row | issue | proposed status | proposed waiting on | from |
|---|---|---|---|---|---|---|---|
| 0 — reset safety | 1 | B-LOSS-WINDOW-OPERATOR-CLOSES | 183b | #1154 | row | nothing | §0a stage 0 |
| 1 — feed truth | 1 | B-PRICE-STALENESS-BOUND | 33 | | row | nothing | §0a "32/33" (no row 32) |
| 1 — feed truth | 2 | B-KRAKEN-PRIMARY-KEY-RESOLUTION | 14a | #1076 | row | nothing | §0a |
| 1 — feed truth | 3 | #1047 (WS parse-error drops) | 17 | #1047 | row (via B-PRICE-SIDE-BY-JOB) | nothing | §0a; HOME row 17 |
| after CC-B's list | 1 | B-BALANCE-SESSION-PAIRING | none | | QUEUED | CC-B (waits behind CC-B's list, Kyle 2026-10-20) | §0a CC-B line |
| P1b — entry | 1 | B-ENTRY-CONSUMPTION-FRESHNESS | 40 | | row | nothing | §0a |
| P1c — fill mode | 1 | B-CLASS-LEG-FILL-MODE | none | #1170 | CLOSED 2026-10-15 | nothing | §0a |
| 2 — exit | 1 | P-8e split (extrapolated-fill field) | none | | **please state** | | §0a; carrier `B_PRICE_SIDE_BY_JOB_PRE_AUDIT.md:562` |
| 2 — exit | 2 | B-XSTOCK-BID-TRIGGER-RELAND | 2 | | row | | §0a |
| 2 — exit | 3 | B-SPREAD-BLOWN-RELEASE-MOVEMENT | none | #1199 | QUEUED | data — objective 6's observation read | §0a |
| 2 — exit | 4 | B-CRYPTO-MARK-AGE-GATE | 38 | | row | | §0a |
| 2 — exit | 5 | B-EXIT-TICKER-LEG-ADAPTER-SIDES | 65 | | row | | §0a (owner per §4; NEW Claude confirmed) |
| 2 — exit | 6 | B-STALE-BOOK-DEPTH-REFUSAL | 8b | #1085 | row | | §0a |
| 2 — exit | 7 | B-EXIT-DECISION-RUNG-STAMP | 113 | | row | | §0a |
| 2 — exit | 9 | [C3] with row 62 | 62 | | row | | §0a |
| 3 — feed | 1 | B-XSTOCK-LIVE-FEED | 31 | #960, #1175 | MOVED (out of the pre-sprint, Kyle 2026-10-07) | | §0a |
| 3 — feed | 2 | CORZ investigation | none | | DONE | | §0a |
| 3 — feed | 3 | B-XSTOCK-BAR-AVAILABILITY | none | #707 | **please state** (IN FLIGHT — Step ?) | | §0a |
| 3 — feed | 6 | B-XSTOCK-SNAPSHOT-RETENTION | none | #1194 | QUEUED | | §0a |
| 3 — feed | 7 | B-CRON-MISSED-CATCHUP | none | #691 | QUEUED | | §0a |
| 4 — paper truth | 1 | B-OPEN-REFUSAL-DURABLE-ROW | 8a | #1083 | row | | §0a |
| 0 — clear the plates | 1 | B-OHLC-FRAME-GUARD | 13 | | row (row 13 reads `IN FLIGHT — Step 7`) | | §0 |
| 0 — clear the plates | 2 | B-OHLC-WRITE-ORDER (was F-G-1) | 16 | #1031 | row (row 16 reads `STEP 5 DONE … deploys after the hold` — still true?) | | §0 |
| 0 — clear the plates | 3 | B-PRICE-SIDE-BY-JOB | 17 | | row (row 17 reads `IN FLIGHT — 8a-P4c window to 2026-09-30` — that window has passed) | | §0 |
| 0 — clear the plates | 4 | B-VTS-NO-DECISION-VALVE | 4 (and 4b) | | row — **it owns two rows; which is the board's?** | | §0 |
| 0 — clear the plates | 5 | B-REST-SIDES-TO-CACHE | 14 | | row (row 14 reads `BUILT — deploy after 2026-09-30` — deployed since?) | | §0 |
| 0 — clear the plates | 6 | B-BOOK-STATE-RESTART-DURABLE | 15 | | row (row 15 reads `BUILT — deploy after 2026-09-30`) | | §0 |
| 0 — clear the plates | 7 | B-SIZING-DEC-RESTORE | 9 | | row | | §0 |
| 0 — clear the plates | 8 | B-XSTOCK-SESSION-FRESHNESS | 40 | | row (row 40, closed 2026-10-15) | | §0 |

## NEW Claude (CC-B) — please check
| stage | order | item | plan row | issue | proposed status | proposed waiting on | from |
|---|---|---|---|---|---|---|---|
| 0 — reset safety | 2 | B-ENGINE-STOP-DURATION-COLUMN | 2a0 | #1067 | row | | §0a (row 173 is an alias) |
| P1a — entry | 1 | B-ENTRY-LEVEL-RECHECK | 59 | #1168 | row | | §0a |
| P1a — entry | 2 | B-CRYPTO-BIRTH-FEED | 39a | #1060 | row | | §0a |
| CC-B list | 1 | B-BOOK-CHECKSUM-CIRCUIT-BREAKER | none | #1220 | **please state** | | §0a, locked |
| CC-B list | 2 | B-ENTRY-GATE | none | #1224 | **please state** (IN FLIGHT — Step 1?) | | §0a, locked |
| CC-B list | 3 | B-PRICE-FEED-COVERAGE | none | #1222 | QUEUED | | §0a, locked |
| CC-B list | 4 | B-PLAN-PRICE-BASIS (absorbs B-STRATEGY-INPUT-FIXES #1221) | none | #1223 | QUEUED | | §0a, locked |
| CC-B list | 5 | B-BOOK-TRUST-FLEET-GUARD | none | #1226 | QUEUED | | §0a |
| 2 — exit | 8 | B-DISPLAY-TRIGGER-PRICE | 3c | #1152 | row | | §0a |
| 3 — feed | 5 | B-B75-SCRIPT-TEST-HARNESS | none | #1208 | QUEUED | | §0a |
| 4 — paper truth | 2 | the main Dashboard 0-trades read | none | #903 | WITHDRAWN (Kyle 2026-10-19: the main Dashboard is off-limits) | | §0a |
| 5 — the reset | 1 | PAPER-RESET-3000 at $820 + a new dashboard epoch | none | | QUEUED | Kyle (runs only by his deliberate decision) | §0a; NEW Claude 2026-10-21 |
| 5 — the reset | 2 | row 100, the learning-record restart | 100 | | row | | §0a |
| 0 — clear the plates | 1 | B-REACH-BASELINE-ADJUST | none | | CLOSED 2026-09-29 | | §0 |
| 0 — clear the plates | 2 | B-FEED-MISMATCH-FIX | none | | **please state** (PARKED by Kyle 2026-09-30; its window ran to ~10-10) | | §0 |
| 0 — clear the plates | 3 | B-XSTOCK-FEE-CONTRACT | none | | **please state** (§0: observation, convert at close) | | §0 |
| 0 — clear the plates | 4 | B-ARCHIVE-RETENTION-SIZING | none | | CLOSED 2026-09-29 (a decision item) | | §0 |
| 0 — clear the plates | 5 | T-W20C-SCALAR-LEG | 107 | | row (a sprint row, Wave A3) | | §0 |
| 0 — clear the plates | 6 | B-ALERT-LANE-LEDGER-OWNER | none | #1201 | **please state** — §0 lists it under you; #1201 names Infra Claude | | §0 |

## Infra Claude — please check
| stage | order | item | plan row | issue | proposed status | proposed waiting on | from |
|---|---|---|---|---|---|---|---|
| 0 — clear the plates | 1 | B-LANGSTON-CONTEXT (increment 2) | none | | **please state** | | §0 |
| 0 — clear the plates | 2 | B-LANGSTON-RELIEF | none | | **please state** | | §0 |
| 0 — clear the plates | 3 | B-LANGSTON-CLAUDEMD-RESIDUAL | none | | **please state** (Kyle slotted it next, 2026-10-20) | | §0 |
| 0 — clear the plates | 4 | B-LANGSTON-AUTOMEMORY-TRIM | none | | DONE 2026-10-17 (inside B-LANGSTON-RELIEF) | | §0 |
| 0 — clear the plates | 5 | B-SIZE-WATCH-BREACH-ALARM | none | #1215 | QUEUED (proposed, awaiting placement) | Kyle | §0 |
| 0 — clear the plates | 6 | B-LANGSTON-MEMORY-NOTICES | none | #1216 | QUEUED (proposed, awaiting placement) | Kyle | §0 |
| 0 — clear the plates | 7 | B-AGENT-INVOKE-FAILURE-NOTICE | none | #1198 | **please state** | | §0 |
| 0 — clear the plates | 8 | B-AGENT-PRIVATE-TMP | none | #979, #1205 | **please state** | | §0 |
| 0 — clear the plates | 9 | B-LANGSTON-REPOST-FAILED | none | #1207 | QUEUED | B-AGENT-PRIVATE-TMP | §0 ("DO — after B-AGENT-PRIVATE-TMP") |
| 0 — clear the plates | 10 | B-CREDENTIALS-PRIVATE-REPO | none | #1023 | **please state** | | §0 |
| 0 — clear the plates | 11 | B-CREW-ACCESS-HARDEN | none | #1092, #924 | **please state** | | §0 |
| 0 — clear the plates | 12 | B-LANGSTON-RECONCILE-VERB | none | #1057 | **please state** | | §0 |
| 0 — clear the plates | 13 | B-CHAPLET-DELETE | none | #1101 | **please state** | | §0 |
| 0 — clear the plates | 14 | B-TRANSCRIPT-ARCHIVE | none | | **please state** | | §0 |
| 0 — clear the plates | 15 | B-TOKEN-WATCH | none | | PARKED (research, after live) | | §0 — note: it owns NO §4 row; row 197a is `B-TOKEN-WATCH-AUTH`, a different batch |
| 0 — clear the plates | 16 | #670, B-CREW-STATUS-2, #974 | none | #670, #974 | PARKED (after live); `B-CREW-STATUS-2` and `#670` dissolve with this batch's OBJ-6 | | §0 |

## OLD Claude (CC-A) — mine
| stage | order | item | plan row | issue | status | waiting on | from |
|---|---|---|---|---|---|---|---|
| CC-A list | 1 | B-MUTATING-ROUTES-AUTH | none | #1228 | DONE 2026-10-21 (verified) | | §0a |
| CC-A list | 2 | B-STATUS-BOARD | none | #1227 | IN FLIGHT — Step 3 | nothing | §0a |
| 0 — clear the plates | 1 | B-RULES-1e | none | | PARKED (crew tooling, after live) | | §0 |
| 0 — clear the plates | 2 | B-MEASURE-GATE | none | | PARKED (leg 2 CLOSED 2026-09-02; the rest after live) | | §0 |
| 0 — clear the plates | 3 | B-PLAN-CURRENCY-CHECK | 1 | | row | | §0 |
| 0 — clear the plates | 4 | B-TOKEN-BURN-CUT | 1h | | row | | §0 |
| 3 — feed | 4 | B-B75-EXPORT-COMPLETENESS | none | #1195 | CLOSED 2026-10-18 | | §0a |

## NOT CARRIED, with the reason (the drop list)
- §0 rows already done before this batch: `B-GOV-REPORTING`, `B-INSTRUMENTS-OVER-RULES`, `B-DEPLOY-DRIFT-LINE`, `B-WAKE-LEAD-NAME` (all ✅ CLOSED with reports) and `B-SCHEDULER-FIRST-TICK` (✅ handed to Infra Claude, row 73). They stay readable under the `history` heading.
- `F-G-1` — an alias: reopened as `B-OHLC-WRITE-ORDER` (`#1031`), row 16, which is carried. `F-G-2` — closed as absorbed 2026-09-28.
- `B-SQE-FEED-FANOUT` — absorbed into `B-PRICE-FEED-COVERAGE` (`#1222`). `B-STRATEGY-INPUT-FIXES` (`#1221`) — absorbed into `B-PLAN-PRICE-BASIS` by Kyle.
- Row 173 — `MOVED` to 2a0, an alias of it. Rows 53 and 37 — "Out" in §0a's own text.
- `B-XSTOCK-SESSION-FRESHNESS` (row 40's umbrella; §0 CC-C item 9) — dropped at Step 4 (Langston gate B, 2026-10-21): carried as `row` it would have shown row 40's `✅ CLOSED`, which is false for the umbrella. Its closed half is the entry line `B-ENTRY-CONSUMPTION-FRESHNESS` (row 40, carried); its OPEN halves live elsewhere — the exit-freshness alert rows and the notify cut at §4 row 3a1 `B-VENUE-QUIET-ALERTING` (CC-B; row 165 records the move), and the holiday calendar `#392`, parked by Kyle.
