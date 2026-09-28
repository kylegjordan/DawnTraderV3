# PUSH TO LIVE — THE PLAN (governed, Tier 1)

> **Kyle, 2026-09-28.** This document is the working plan from here to live trading. It replaces phase names: one list, in order. It is the **active phase plan** for `CLAUDE.md` §9.4 purposes — a new item's HOME is a placed row here. `PHASE_19_PLAN.md` stays as history and for the detail each row links to.

## 0. Clear the plates first (Kyle, 2026-09-28)

Before any session starts its push rows, everything it has in flight is **finished** (if it is in the push, or nearly done, or leads to something that must be finished) or **paused cleanly** at a batch boundary and moved to the after-live list. Each session confirms its own lines; this table is CC-B's read of the four task lists at 2026-09-28.

| session | in flight now | disposition |
|---|---|---|
| CC-A (Old Claude) | B-GOV-REPORTING — pushed, the review gate never ran | FINISH: its rules are in use by all four sessions; run Langston's gate |
| CC-A (Old Claude) | B-RULES-1e — Step 2 | PAUSE cleanly: crew tooling, after live |
| CC-A (Old Claude) | B-MEASURE-GATE beyond leg 2 — Step 2 | PAUSE cleanly: after live |
| CC-A (Old Claude) | B-INSTRUMENTS-OVER-RULES — usage measure to 2026-10-02 | FINISH the measure, then close |
| CC-A (Old Claude) | B-DEPLOY-DRIFT-LINE — observation window | FINISH: convert when its criterion is read |
| CC-A (Old Claude) | B-SCHEDULER-FIRST-TICK — next up, not started | HAND to Infra (its push row) |
| CC-B (New Claude) | B-REACH-BASELINE-ADJUST — 7-day review overdue | FINISH: read the window, convert the report |
| CC-B (New Claude) | B-FEED-MISMATCH-FIX — observation to ~2026-10-10 | FINISH: convert at close |
| CC-B (New Claude) | B-XSTOCK-FEE-CONTRACT — observation (~21 days from 09-11) | FINISH: convert at close |
| CC-B (New Claude) | B-ARCHIVE-RETENTION-SIZING — was waiting on Kyle | CLOSE: Kyle decided 2026-09-23 (August moves to warm storage in October) |
| CC-B (New Claude) | T-W20C-SCALAR-LEG — not started | stays as its push row (Wave A3) |
| CC-C (Analyst Claude) | B-OHLC-FRAME-GUARD — Step 7 | FINISH (Wave 0) |
| CC-C (Analyst Claude) | F-G-1 — conversion owed, reopened | FINISH (Wave 0) |
| CC-C (Analyst Claude) | B-PRICE-SIDE-BY-JOB — 8a-P4c window to 09-30, then increments 2-3 | FINISH (Wave 0) |
| CC-C (Analyst Claude) | B-REST-SIDES-TO-CACHE, B-BOOK-STATE-RESTART-DURABLE — built | FINISH: deploy after 09-30 (Wave 0) |
| CC-C (Analyst Claude) | B-SIZING-DEC-RESTORE — half live | FINISH: stays with CC-C (in flight); now placed in the push |
| CC-C (Analyst Claude) | B-XSTOCK-SESSION-FRESHNESS — open | continues as its push row |
| CC-C (Analyst Claude) | F-G-2 — window void since 09-05 | absorbed into B-PRICE-SIDE-BY-JOB; close as absorbed |
| Infra Claude | B-LANGSTON-CONTEXT increment 2 — chunk 1 Step 7, chunk 2 part 1 Step 3 | FINISH the chunks in flight, then PAUSE the rest (after live) |
| Infra Claude | B-WAKE-LEAD-NAME — Step 10 | FINISH |
| Infra Claude | B-TOKEN-WATCH — Step 7, paused | stays PAUSED: research, after live |
| Infra Claude | #670, B-CREW-STATUS-2, #974 | stay parked / after live |

## 1. The rule — what is in the push

An item is in the push **only** if it serves one of these (Kyle's words, condensed):

1. **Mechanics** — the pipeline works as intended: filtering, pattern detection, DBS, regime classification, strategy selection and signal generation, SQE evaluation, the RTB pool and its refresh, opening and closing trades.
2. **Tuning** — thresholds, ranges, gates, regime classification, strategies, and the confidence and prediction scores.
3. **Prices** — the feed is correct and paper uses the right price for each job.
4. **Paper tells the truth** — no mistake that makes paper look better or worse than it is.
5. **Learning data** — we capture what we currently intend to learn from.
6. **Live-mode readiness** — the live engine, risk controls on real money, security, the live key, the environment.
7. **The evidence** — paper trading profitably and consistently, judged against Kyle's standard.

**Everything else goes after live** — machine learning, the AMR, break-even / trailing / moonbag exits, the non-US-dollar currency conversion, crew and reviewer tooling, legacy cleanup that no live path can reach, research ideas. The after-live list is `Claude Comms and Packages/Scope Files/PRE_LIVE_PUSH.md`.

## 2. New discoveries — the intake test (Kyle, 2026-09-28)

Anything found while working — a bug, an issue, a needed fix — gets the same test **in the same turn it is found** (this is the §9.4 disposition, applied to this plan):
- **Meets the rule in §1** → it gets a row here, placed in the right wave, with an owner and a batch reference. It is part of the push.
- **Does not** → it goes to the after-live list, with a one-line reason.
- ⛔ A discovery that can stop trading or lose money now is still a hotfix, and the hotfix path applies first.

## 3. How this plan is kept current

- **Every item is a batch** (or a hotfix, investigation or sub-batch), run through the normal eleven-step workflow; its report is linked from its row.
- **The owner updates its row at every batch close** (status + report link), in the same governance turn — and adds any discovery that passes §2. ⏳ **To be made a Tier-1 ledger row in `workflow-10-governance` and graded by the governance checker** (proposed below — Langston to rule).
- **Finish what is in flight** (Kyle): work already under way is completed, including any follow-on it was leading up to; a clean break is taken at the next batch boundary.
- **Clear plates first** (Kyle): before any session starts its push rows, it finishes or cleanly pauses everything it has in flight — see section 0.
- **Owners** are assigned by connected group (section 6); reassign by editing the row and saying why.

## 4. The plan

Status: `QUEUED` · `IN FLIGHT — Step N` · `BUILT` · `OBSERVATION` · `DONE — report`. Two tracks run side by side and meet at go-live; Wave 0 is this week.

### Wave 0 — NOW — urgent, cheap, or already in flight (this week)

| # | item | batch / reference | owner | status | report | note |
|---:|---|---|---|---|---|---|
| 1 | 12.1 rulings-durability fix | — batch named at Step 1 | Infra Claude | QUEUED | — | cheap and irreversible if lost: copy Langston's rulings file to a read-only replica |
| 2 | Months of database headroom | — batch named at Step 1 | Infra Claude | QUEUED | — | database at 81% (critical): confirm the October move to warm storage lands, then measure months of headroom |
| 3 | Define 'comfortable in paper' in numbers | — batch named at Step 1 | CC-C (Analyst Claude) + Langston | QUEUED | — | set the numbers for 'comfortable in paper' BEFORE the evidence comes in ⭐ Kyle approves the numbers. |
| 4 | Fix duplicated plan ids | — batch named at Step 1 | Infra Claude | QUEUED | — | part of rewriting the plan: no two items share a number |
| 5 | B-OHLC-FRAME-GUARD | B-OHLC-FRAME-GUARD | CC-C (Analyst Claude) | IN FLIGHT — Step 7 | — | in flight: only the on-screen check is left |
| 6 | B-REST-SIDES-TO-CACHE | B-REST-SIDES-TO-CACHE | CC-C (Analyst Claude) | BUILT — deploy after 2026-09-30 | — | built and reviewed: deploy after the 2026-09-30 VTS window closes |
| 7 | B-BOOK-STATE-RESTART-DURABLE | B-BOOK-STATE-RESTART-DURABLE | CC-C (Analyst Claude) | BUILT — deploy after 2026-09-30 | — | built and reviewed: deploy with the one above |
| 8 | F-G-1 reopens: the OHLC writer can write an older bar over a newer one | F-G-1-REOPEN | CC-C (Analyst Claude) | REOPENED — Step 3 | — | the OHLC writer can put an older bar over a newer one — it feeds the bars signals are built from |
| 9 | B-PRICE-SIDE-BY-JOB | B-PRICE-SIDE-BY-JOB | CC-C (Analyst Claude) | IN FLIGHT — 8a-P4c window to 2026-09-30 | — | in flight: its xStock increments follow the 09-30 window |

### Wave A1 — TRACK A · Foundations — the things that corrupt everything downstream

| # | item | batch / reference | owner | status | report | note |
|---:|---|---|---|---|---|---|
| 10 | B-UNIVERSE-REFRESH-ACTS | B-UNIVERSE-REFRESH-ACTS | Infra Claude | QUEUED | — | first link of the identity chain |
| 11 | B-SYMBOL-CLASS-IDENTITY | B-SYMBOL-CLASS-IDENTITY | Infra Claude | QUEUED | — | after B-UNIVERSE-REFRESH-ACTS: a ticker shared by a coin and a stock becomes two instruments |
| 12 | B-RTB-SIGNAL-IDENTITY | B-RTB-SIGNAL-IDENTITY | Infra Claude | QUEUED | — | after B-SYMBOL-CLASS-IDENTITY |
| 13 | B-VTS-CLASS-LABEL-INTEGRITY | B-VTS-CLASS-LABEL-INTEGRITY | Infra Claude | QUEUED | — | after B-SYMBOL-CLASS-IDENTITY: correct the mislabelled VTS rows |
| 14 | B-CLOSED-TRADES-CLASS-BACKFILL | B-CLOSED-TRADES-CLASS-BACKFILL | Infra Claude | QUEUED | — | after B-SYMBOL-CLASS-IDENTITY |
| 15 | Exclude plain-currency and non-dollar pairs | — batch named at Step 1 | Infra Claude | QUEUED | — | Kyle's decision: exclude plain currency pairs and non-dollar crypto now |
| 16 | B-NONFIAT-QUOTE-DENOMINATION | B-NONFIAT-QUOTE-DENOMINATION | Infra Claude | QUEUED | — | the exclusion itself, if small |
| 17 | B-QUOTE-ADMISSION-LEGACY-SWEEP | B-QUOTE-ADMISSION-LEGACY-SWEEP | Infra Claude | QUEUED | — | with the exclusion: what the old allowed-pairs list is for |
| 18 | B-QUOTE-LEG-INTEGRITY | B-QUOTE-LEG-INTEGRITY | Infra Claude | QUEUED | — | with the exclusion |
| 19 | B-PRICE-FLOOR-REVIEW | B-PRICE-FLOOR-REVIEW | Infra Claude | QUEUED | — | replace the $0.25 floor with a real market-depth test |
| 20 | B-VENUE-PAIRS-REINIT | B-VENUE-PAIRS-REINIT | Infra Claude | QUEUED | — | a changed exchange price step must not refuse orders |
| 21 | B-SCAN-BREADTH-DECLINE | B-SCAN-BREADTH-DECLINE | Infra Claude | QUEUED | — | why the scanner sees so few pairs — breadth feeds selection |
| 22 | B-XSTOCK-LIVE-FEED | B-XSTOCK-LIVE-FEED | CC-C (Analyst Claude) | QUEUED | — | the xStock feed became our trading feed without a decision — decide and fix |
| 23 | row:6 | plan row 6 | CC-C (Analyst Claude) | QUEUED | — | a bound on how old a price may be when used |
| 24 | B-PRICE-STALENESS-BOUND | B-PRICE-STALENESS-BOUND | CC-C (Analyst Claude) | QUEUED | — | the last-known-good price is re-served with no age bound |
| 25 | B-EQUITY-RECONNECT-STALL-TIMER | B-EQUITY-RECONNECT-STALL-TIMER | CC-C (Analyst Claude) | QUEUED | — | a stalled xStock reconnect leaves positions unwatched |
| 26 | B-WS-SUBSCRIBE-CLASS-FILTER | B-WS-SUBSCRIBE-CLASS-FILTER | Infra Claude | QUEUED | — | the crypto subscribe set is not class-filtered |
| 27 | #506 | #506 — batch named at Step 1 | CC-C (Analyst Claude) | QUEUED | — | book subscriptions never unsubscribe |
| 28 | B-BOOK-SUBSCRIPTION-REACH | B-BOOK-SUBSCRIPTION-REACH | CC-C (Analyst Claude) | QUEUED | — | after #506: subscribe the order book for the whole pool, not ~3 coins |
| 29 | B-CRYPTO-MARK-AGE-GATE | B-CRYPTO-MARK-AGE-GATE | CC-C (Analyst Claude) | QUEUED | — | crypto mark age |
| 30 | B-XSTOCK-SESSION-FRESHNESS | B-XSTOCK-SESSION-FRESHNESS | CC-C (Analyst Claude) | QUEUED | — | xStock entry-age limit vs the exit standard Kyle ruled |
| 31 | B-XSTOCK-ENTRY-COMPARATOR | B-XSTOCK-ENTRY-COMPARATOR | CC-C (Analyst Claude) | QUEUED | — | xStock entry-price cross-check |
| 32 | B-DECIDED-INTENT-INDEX | B-DECIDED-INTENT-INDEX | CC-C (Analyst Claude) | QUEUED | — | xStock's three definitions of 'the price' from one frame |
| 33 | B-POST-GRID-MUTATION-CENSUS | B-POST-GRID-MUTATION-CENSUS | CC-C (Analyst Claude) | QUEUED | — | what changes a stop after it is rounded |
| 34 | row:7 | plan row 7 | CC-C (Analyst Claude) | QUEUED | — | the VTS reads prices through the shared accessor |
| 35 | #1033 | #1033 — batch named at Step 1 | CC-C (Analyst Claude) | QUEUED | — | an absent volume is stored as zero and the liquidity filter reads it |
| 36 | #972 | #972 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | xStock ATR reads empty around the open and close |
| 37 | #566 | #566 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | volatility measured with a lag |
| 38 | Independent review of the pricing architecture (Codex) | — batch named at Step 1 | CC-C (Analyst Claude) (+ Coltrane) | QUEUED | — | after the price items: an independent review of the whole price layer |
| 39 | B-SIZING-DEC-RESTORE | B-SIZING-DEC-RESTORE | CC-C (Analyst Claude) | IN FLIGHT — half live | — | paper sizing to Kyle's intent (~$140-150 a trade, 15-20 open) |
| 40 | #628 | #628 — batch named at Step 1 | CC-C (Analyst Claude) | QUEUED | — | with B-SIZING-DEC-RESTORE: its two sizing sites |

### Wave A2 — TRACK A · Mechanics, stage by stage — can start as A1's pieces land

| # | item | batch / reference | owner | status | report | note |
|---:|---|---|---|---|---|---|
| 41 | #233 | #233 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | signals: drift and volume inputs fed as fixed defaults |
| 42 | #199 | #199 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | strategies: xStock volume confirmation removed for lack of an honest feed |
| 43 | row:3m-ENUM | plan row 3m-ENUM | CC-B (New Claude) | QUEUED | — | strategies: volatility_edge's pattern path is silently dead |
| 44 | B-SILENT-STRATEGY-CENSUS | B-SILENT-STRATEGY-CENSUS | CC-B (New Claude) | QUEUED | — | strategies: three wired strategies never evaluated |
| 45 | B-TARGET-FABRICATION | B-TARGET-FABRICATION | CC-C (Analyst Claude) | QUEUED | — | signals: default targets the strategy never chose |
| 46 | #574 | #574 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | SQE: a made-up volatility input in the ranker |
| 47 | B-RTB-REFRESH-CONSOLIDATE | B-RTB-REFRESH-CONSOLIDATE | CC-B (New Claude) | QUEUED | — | RTB: the net-EV backstop removed on thin evidence |
| 48 | #570 | #570 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | RTB: one refresh bucket fires but does not refresh |
| 49 | #699 | #699 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | RTB: does promotion evict, or is the screen stale |
| 50 | 19.2 Audit & Debug — - Verify FinalScore, Hybrid Score, Confidenc | roadmap 19.2 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | SQE: verify every score calculates correctly |
| 51 | B-ENTRY-LEVEL-RECHECK | B-ENTRY-LEVEL-RECHECK | CC-B (New Claude) | QUEUED | — | open: re-check a signal's levels against the current price before the fill |
| 52 | B-INTENT-ENTRY-PARITY | B-INTENT-ENTRY-PARITY | CC-C (Analyst Claude) | QUEUED | — | open: two entry routes bypass the price grid |
| 53 | B-GRID-LIVE-PATH-PARITY | B-GRID-LIVE-PATH-PARITY | CC-C (Analyst Claude) | QUEUED | — | open: grid rounding on the live order path |
| 54 | A resting order's deadline must run whether or not a price is usable | — batch named at Step 1 | CC-C (Analyst Claude) | QUEUED | — | open: a resting order's deadline runs even when no price is usable |
| 55 | #630 | #630 — batch named at Step 1 | CC-C (Analyst Claude) | QUEUED | — | open: exercise the maker-order deadline once |
| 56 | B-EXIT-TRIGGER-FILL-PARITY | B-EXIT-TRIGGER-FILL-PARITY | CC-C (Analyst Claude) | QUEUED | — | close: exits fire on the price they would fill at |
| 57 | B-EXIT-TICKER-LEG-ADAPTER-SIDES | B-EXIT-TICKER-LEG-ADAPTER-SIDES | CC-C (Analyst Claude) | QUEUED | — | close: the exit path sees both price sides |
| 58 | B-XSTOCK-BID-TRIGGER-RELAND | B-XSTOCK-BID-TRIGGER-RELAND | CC-C (Analyst Claude) | QUEUED | — | close: xStock triggers back on the bid |
| 59 | B-BOOK-STATE-RING-INDEPENDENT-BOUND | B-BOOK-STATE-RING-INDEPENDENT-BOUND | CC-C (Analyst Claude) | QUEUED | — | close: xStock exit plausibility bound |
| 60 | #204 | #204 — batch named at Step 1 | CC-C (Analyst Claude) | QUEUED | — | close: xStock stop prices at the wrong scale |
| 61 | row:3h.b | plan row 3h.b | CC-C (Analyst Claude) | QUEUED | — | close: remove the second exit implementation |
| 62 | B-EXIT-LATCH-INVESTIGATION | B-EXIT-LATCH-INVESTIGATION | CC-C (Analyst Claude) | QUEUED | — | close: is the hold-past-target a label or a real exit defect |
| 63 | Map EXIT_PATH_MACHINERY_AUDIT §10 items to their homes | — batch named at Step 1 | CC-C (Analyst Claude) | QUEUED | — | close: map the exit audit's items to homes |
| 64 | #166 | #166 — batch named at Step 1 | Infra Claude | QUEUED | — | close: the TEC stale-cache fence keeps firing |
| 65 | B-CLOSE-WRITER-COSTS | B-CLOSE-WRITER-COSTS | CC-A (Old Claude) | QUEUED | — | close: no close without a trade record, no invented zero fees |
| 66 | B-SCHEDULER-FIRST-TICK | B-SCHEDULER-FIRST-TICK | Infra Claude | QUEUED — next in CC-A's list | — | restarts: every scheduled job runs twice after a restart |
| 67 | #585 | #585 — batch named at Step 1 | Infra Claude | QUEUED | — | restarts: auto-resume skips a malformed session |
| 68 | B-STRING-TRUTHINESS-GUARDS | B-STRING-TRUTHINESS-GUARDS | Infra Claude | QUEUED | — | hygiene: guards that treat '0' as true |
| 69 | B-GUARD-COVERAGE-AUDIT | B-GUARD-COVERAGE-AUDIT | Infra Claude | QUEUED | — | hygiene: which guards cover which paths |
| 70 | B-LEARNING-SYSTEM-CENSUS | B-LEARNING-SYSTEM-CENSUS | Infra Claude | QUEUED | — | hygiene: old learning systems still wired |
| 71 | Dead-code reachability census | — batch named at Step 1 | Infra Claude | QUEUED | — | hygiene: which dead code a trade can still reach (pulls items forward if any) |
| 72 | B-MODE-PREDICATE-SWEEP | B-MODE-PREDICATE-SWEEP | Infra Claude | QUEUED | — | hygiene: readers that would mix live and paper P&L |
| 73 | row:8 | plan row 8 | CC-C (Analyst Claude) | QUEUED | — | paper truth: fill-integrity detector |
| 74 | B-COST-MATH-CONSOLIDATION | B-COST-MATH-CONSOLIDATION | CC-A (Old Claude) | QUEUED | — | paper truth: one home for cost maths |
| 75 | #527 | #527 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | paper truth: xStock friction components |
| 76 | B-IMPLEMENTATION-SHORTFALL | B-IMPLEMENTATION-SHORTFALL | CC-C (Analyst Claude) | QUEUED | — | paper truth: separate stale-signal cost from execution cost |
| 77 | B-GRID-REFUSAL-RATE | B-GRID-REFUSAL-RATE | CC-C (Analyst Claude) | QUEUED | — | paper truth: how often the grid refuses |
| 78 | B-VALIDATE-OBSERVABILITY | B-VALIDATE-OBSERVABILITY | Infra Claude | QUEUED | — | paper truth: make validation failures visible |
| 79 | B-DIAG-READ-INTEGRITY | B-DIAG-READ-INTEGRITY | Infra Claude | QUEUED | — | paper truth: diagnostics that read a status code as data |
| 80 | B-FILTER-DIAG-XSTOCK | B-FILTER-DIAG-XSTOCK | Infra Claude | QUEUED | — | paper truth: the empty xStock decline table |
| 81 | #664 | #664 — batch named at Step 1 | Infra Claude | QUEUED | — | paper truth: a hardcoded 'strategies evaluated' |
| 82 | #419 | #419 — batch named at Step 1 | Infra Claude | QUEUED | — | paper truth: funnel counts under errors |
| 83 | #549 | #549 — batch named at Step 1 | Infra Claude | QUEUED | — | paper truth: Open Trades field gaps |
| 84 | #561 | #561 — batch named at Step 1 | Infra Claude | QUEUED | — | paper truth: volume / order book columns in Open Trades |
| 85 | #547 | #547 — batch named at Step 1 | Infra Claude | QUEUED | — | paper truth: the Analyst's July findings (owner reads) |
| 86 | #522 | #522 — batch named at Step 1 | CC-A (Old Claude) + Langston (+ Coltrane) | QUEUED | — | LAST in A2: the full runtime pipeline audit, both classes, end to end |
| 87 | #235 | #235 — batch named at Step 1 | CC-A (Old Claude) + Langston | QUEUED | — | with #522: the crypto pipeline validated end to end |

### Wave A3 — TRACK A · Learning data — alongside A2; must finish before tuning reads the data

| # | item | batch / reference | owner | status | report | note |
|---:|---|---|---|---|---|---|
| 88 | B-OUTCOME-CORPUS-CAPTURE | B-OUTCOME-CORPUS-CAPTURE | CC-B (New Claude) | QUEUED | — | what each VTS trade earned, recorded durably, with a measured/defaulted flag on its inputs. NOT a deletion clock: the 90-day delete was fixed 2026-07-30/08-06 (365 days, archive before delete); nothing is due for deletion before 2027-05 |
| 89 | B-PAPER-LANE-PROVENANCE | B-PAPER-LANE-PROVENANCE | CC-B (New Claude) | QUEUED | — | paper records its decision inputs |
| 90 | T-W20C-SCALAR-LEG | — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | after B-PAPER-LANE-PROVENANCE: the parity harness proves recorded history replays |
| 91 | #515 | #515 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | remaining learning columns on the active path |
| 92 | #631 | #631 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | entry-mode fields on the active archive |
| 93 | #504 | #504 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | regime on maker/taker shadow rows |
| 94 | B-DECISION-INSTANT-QUOTE | B-DECISION-INSTANT-QUOTE | CC-C (Analyst Claude) | QUEUED | — | the exact quote at decision time |
| 95 | B-EXIT-DECISION-RUNG-STAMP | B-EXIT-DECISION-RUNG-STAMP | CC-C (Analyst Claude) | QUEUED | — | which price rung an exit used |
| 96 | B-TRADE-RECORD-JOINABILITY | B-TRADE-RECORD-JOINABILITY | CC-B (New Claude) | QUEUED | — | trade records join across stores |
| 97 | B-VPNL-WRITER-BOUND | B-VPNL-WRITER-BOUND | CC-B (New Claude) | QUEUED | — | an unbounded learning column |
| 98 | B-VTS-MARK-SIDE | B-VTS-MARK-SIDE | CC-C (Analyst Claude) | QUEUED | — | the VTS marks on the right side |
| 99 | B-VTS-NO-DECISION-VALVE | B-VTS-NO-DECISION-VALVE | CC-C (Analyst Claude) + Langston | QUEUED | — | only if quick (Kyle): VTS trades stuck with no usable sell price |
| 100 | #658 | #658 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | VTS posture multipliers contaminating learning rows |
| 101 | #220 | #220 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | an error thrown 64,494 times in VTS strategy runs |
| 102 | #1072 | #1072 — batch named at Step 1 | CC-C (Analyst Claude) | QUEUED | — | the price-history recorder's frozen symbol set |
| 103 | B-ARCHIVE-WRITER-LIFECYCLE | B-ARCHIVE-WRITER-LIFECYCLE | CC-B (New Claude) | QUEUED | — | the archive writer's lifecycle |
| 104 | B-EPOCH-PARITY-FENCE | B-EPOCH-PARITY-FENCE | CC-B (New Claude) | QUEUED | — | one home for the calibration epoch |
| 105 | B-ROLLBACK-EPOCH-FORWARD | B-ROLLBACK-EPOCH-FORWARD | CC-B (New Claude) | QUEUED | — | epochs across a rollback |
| 106 | #590 | #590 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | calibration store reset at the formula change |
| 107 | B-OBS-WINDOW-EVIDENCE-CAPTURE | B-OBS-WINDOW-EVIDENCE-CAPTURE | CC-B (New Claude) | QUEUED | — | capture window evidence at the event |
| 108 | B-PROVENANCE-LOSS-CENSUS | B-PROVENANCE-LOSS-CENSUS | CC-B (New Claude) | QUEUED | — | where decision provenance is lost |
| 109 | #231 | #231 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | ablation record id gap |
| 110 | 25-9 xStock pair_correlation per-pair WR data accumulation (B68.3 | roadmap 25-9 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | xStock per-pair correlation data |
| 111 | row:9 | plan row 9 | CC-B (New Claude) | QUEUED | — | LAST in A3: the gate for restarting the learning record clean after the fixes |

### Wave A4 — TRACK A · Tuning — reads the clean data; costs -> geometry -> strategies -> regimes -> scores -> gates -> ranking

| # | item | batch / reference | owner | status | report | note |
|---:|---|---|---|---|---|---|
| 112 | #914 | #914 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | costs: the per-leg cost term |
| 113 | 25-18 friction_safety_buffer per-class evaluation (reorg-B2 delibe | roadmap 25-18 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | costs: the per-class safety margin |
| 114 | #645 | #645 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | costs: a crypto-era net-EV floor applied to xStocks |
| 115 | B-EXCURSION-RECORD | B-EXCURSION-RECORD | CC-B (New Claude) | QUEUED | — | geometry: record how far trades travel |
| 116 | 25-17 TARGET-GEOMETRY CALIBRATION — ALL 19 CANONICAL STRATEGIES, B | roadmap 25-17 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | after B-EXCURSION-RECORD: target geometry for all strategies |
| 117 | 25-17b CRYPTO reach_atr_max DECISION — the reachability-ceiling que | roadmap 25-17b — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | geometry: crypto reach ceilings |
| 118 | 25-20 Per-strategy × per-class minRR (reward-vs-risk floor) RECALI | roadmap 25-20 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | geometry: per-strategy minimum reward-to-risk |
| 119 | B-TARGET-MULTIPLE-VS-HORIZON | B-TARGET-MULTIPLE-VS-HORIZON | CC-B (New Claude) | QUEUED | — | geometry: move targets that sit too far |
| 120 | 25-26 Trade HOLD-TIME / timeframe study — do slower (multi-day) tr | roadmap 25-26 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | geometry: do slower trades clear the fee wall |
| 121 | B-EXIT-MAKER-VS-TAKER-REVIEW | B-EXIT-MAKER-VS-TAKER-REVIEW | CC-B (New Claude) | QUEUED | — | geometry: maker exits profitable, taker target exits negative |
| 122 | #648 | #648 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | strategies: six never traded |
| 123 | #201 | #201 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | strategies: range_trade starved |
| 124 | #529 | #529 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | strategies: the strategy-weighting chain |
| 125 | B-FAMILY-POOL-REACHABILITY | B-FAMILY-POOL-REACHABILITY | CC-B (New Claude) | QUEUED | — | strategies: reachability in the family pool |
| 126 | B-IDEAL-POOL-STARVATION | B-IDEAL-POOL-STARVATION | CC-B (New Claude) | QUEUED | — | strategies: the ideal pool gets 4-5% of slots |
| 127 | 25-12 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — | roadmap 25-12 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | xStock: entry-trigger sweep |
| 128 | 25-13 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — | roadmap 25-13 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | xStock: geometry reconstruction |
| 129 | 25-14 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — | roadmap 25-14 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | xStock: per-strategy entry re-fit |
| 130 | 25-2 §19.0.A Regime classifier confidence-chain calibration B-NEW | roadmap 25-2 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | regimes: confidence-chain calibration |
| 131 | 25-10 Crypto confidence-modifier calibration Kyle 2026-05-27 voice | roadmap 25-10 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | regimes: crypto confidence modifiers |
| 132 | 25-7 #94 B79.3 xStock equity-equivalent macro confidence modifier | roadmap 25-7 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | regimes: xStock macro modifiers |
| 133 | B-RETIRED-SCORE-REMOVAL | roadmap 16.7 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | scores: retire the retired scores |
| 134 | #588 | #588 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | scores: a validated quality term in the ranking |
| 135 | 25-4 §19.4 SQE Recalibration (B66 conditional) Rebuild SQE thresh | roadmap 25-4 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | scores: SQE recalibration |
| 136 | 25-3 §19.0.3 TFS sustainability gate value-scope decision Recalib | roadmap 25-3 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | gates: the sustainability gate |
| 137 | 25-15 DATA-BLOCKED STUDY (intraday-coverage gap) — HCE rejected-ar | roadmap 25-15 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | gates: does the Net Expectancy gate reject winners |
| 138 | 25-19 Net-Expectancy gate JUDGMENT-QUALITY validation (Kyle 2026-0 | roadmap 25-19 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | gates: the Net Expectancy gate's measured judgement |
| 139 | #644 | #644 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | gates: the exploration subsidy decision |
| 140 | #221 | #221 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | ranking: crypto vs xStock signals in one queue |
| 141 | #149 | #149 — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | ranking: per-class RTB refresh cadence |

### Wave A5 — TRACK A · The evidence — runs continuously; judged at the end

| # | item | batch / reference | owner | status | report | note |
|---:|---|---|---|---|---|---|
| 142 | 19-11 §19.1 Paper Trading Run The act of actually running paper-ac | roadmap 19-11 — batch named at Step 1 | CC-C (Analyst Claude) + Langston | QUEUED | — | the paper run judged against Kyle's standard |

### Wave B1 — TRACK B · Safety now — can start immediately, in parallel with Track A

| # | item | batch / reference | owner | status | report | note |
|---:|---|---|---|---|---|---|
| 143 | B-SEC-HARDEN | B-SEC-HARDEN | Infra Claude | QUEUED | — | rotate the public owner password first (Kyle), then route authorisation ⭐ Kyle rotates the password first. |
| 144 | B-SSH-KEY-CENSUS (investigation) | B-SSH-KEY-CENSUS | Infra Claude | QUEUED | — | whose are the two unknown keys |
| 145 | #615 | #615 — batch named at Step 1 | Infra Claude | QUEUED | — | the reviewer identity must not read the secrets file |
| 146 | Coltrane parity: a privacy check like Langston's | — batch named at Step 1 | Infra Claude | QUEUED | — | before the Coltrane trial: a privacy check like Langston's |
| 147 | #681 | #681 — batch named at Step 1 | Infra Claude | QUEUED | — | a deploy must not outrun CI |
| 148 | #168 | #168 — batch named at Step 1 | Infra Claude | QUEUED | — | with #681: CI catches a build that crashes on boot |
| 149 | P19-B12 | P19-B12 | Infra Claude | QUEUED | — | the deploy tool's own executable comes from the reviewed code |

### Wave B2 — TRACK B · Risk controls and restart safety — fixed in paper, carried to live

| # | item | batch / reference | owner | status | report | note |
|---:|---|---|---|---|---|---|
| 150 | #634 | #634 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | the kill switch must not fail open |
| 151 | #632 | #632 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | the daily-loss count survives a restart |
| 152 | B-KILLSWITCH-DENOMINATOR | B-KILLSWITCH-DENOMINATOR | CC-A (Old Claude) | QUEUED | — | the kill switch's remaining legs |
| 153 | B-TOTAL-DRAWDOWN-WARNING | B-TOTAL-DRAWDOWN-WARNING | CC-A (Old Claude) | QUEUED | — | a mark-to-market drawdown warning |
| 154 | #519 | #519 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | the daily-loss trip fails loud |
| 155 | B-TEC-PRIME-BOOT-RACE | B-TEC-PRIME-BOOT-RACE | Infra Claude | QUEUED | — | restarts: the exit loop throws for a tick on open positions |
| 156 | #521 | #521 — batch named at Step 1 | Infra Claude | QUEUED | — | restarts: nothing notices a dead engine |
| 157 | B-ENGINE-STOP-DURATION-COLUMN | B-ENGINE-STOP-DURATION-COLUMN | Infra Claude | QUEUED | — | an engine stop reports failure when it worked |
| 158 | #619 | #619 — batch named at Step 1 | Infra Claude | QUEUED | — | a restore from backup lacks seeded config |
| 159 | B-DASHBOARD-AUTH-RACE | B-DASHBOARD-AUTH-RACE | Infra Claude | QUEUED | — | the portfolio card never recovers from a 401 |
| 160 | #296 | #296 — batch named at Step 1 | CC-C (Analyst Claude) | QUEUED | — | one rate-limited path for placing and cancelling orders |

### Wave B3 — TRACK B · The live engine — after Kyle's production-environment decision

| # | item | batch / reference | owner | status | report | note |
|---:|---|---|---|---|---|---|
| 161 | B-LEGACY-LIVE-EXIT-PATH | roadmap 21.1.a — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | hard blocker: the legacy live exit route |
| 162 | 21-3c (NEW, KYLE-RULED 2026-08-21 — RUNNING_ISSUES #734): the engi | roadmap 21-3c — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | the engine-start health gate refuses live |
| 163 | 21-3d (NEW, KYLE-DIRECTED 2026-08-21 — B-BALANCE-TRUTH Step G / B- | roadmap 21-3d — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | reset functions must not delete both modes' data |
| 164 | 19-10 #139 vts-runner throwing resolveAssetClass call sites 10+ pr | roadmap 19-10 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | throwing asset-class lookups on the live path |
| 165 | 21.1 Live Mode Engine — - Create Live Mode trading engine based o | roadmap 21.1 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | build live on the paper engine (Option A) |
| 166 | #322 | #322 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | test-in-paper / bypass-in-live switches |
| 167 | P19-B6.10 retire the old per-mode guardrails table | P19-B6.10 | CC-A (Old Claude) | QUEUED | — | one source of guardrail values |
| 168 | 21-3a (NEW, P19-B6.8a 2026-06-30 — RUNNING_ISSUES #401): add the " | roadmap 21-3a — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | after P19-B6.10: the Live Guardrails tab |
| 169 | #517 | #517 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | after rm:21.1: the live trade tables |
| 170 | 21.3 Live Mode Guardrails — - 21-3a (NEW, P19-B6.8a 2026-06-30 — | roadmap 21.3 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | the live guardrails umbrella |
| 171 | 19-9 B79.x failure-mode taxonomy — entry-side gap LULD halts / ci | roadmap 19-9 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | entry-side failure modes (halts, splits, earnings) |
| 172 | 25-11a refuse a position larger than the visible book | — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | refuse a position larger than the visible book |
| 173 | Protect live positions if our server dies | — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | decide how live positions are protected if the server dies ⭐ Kyle picks; CC-A + Langston propose. |
| 174 | B-VENUE-RESTING-EXITS | B-VENUE-RESTING-EXITS | CC-A (Old Claude) | QUEUED | — | after PROCESS-DEATH-FORM: build that protection |
| 175 | B-KRAKEN-FEE-WATCH | B-KRAKEN-FEE-WATCH | CC-C (Analyst Claude) | QUEUED | — | notice when the exchange changes fees |

### Wave B4 — TRACK B · Go-live preparation — last

| # | item | batch / reference | owner | status | report | note |
|---:|---|---|---|---|---|---|
| 176 | Provision the live Kraken API key | — batch named at Step 1 | Infra Claude | QUEUED | — | the live key: trade-only, no withdrawals, locked to the server ⭐ Kyle creates the key on Kraken; Infra sets it up. |
| 177 | Confirm the live fee schedule | — batch named at Step 1 | CC-C (Analyst Claude) | QUEUED | — | after KRAKEN-LIVE-KEY: confirm live fees |
| 178 | 25-16 Trade-size / concurrency / win-rate dynamic + starting-balan | roadmap 25-16 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | the trade-size / concurrency study at the real balance |
| 179 | Day-one live money settings | — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | after rm:25-16: Kyle sets the live money settings ⭐ Kyle sets the numbers; CC-A brings the evidence. |
| 180 | 21-3b (NEW, P19-B6.9 2026-06-30 — RUNNING_ISSUES #398/#396): calib | roadmap 21-3b — batch named at Step 1 | CC-C (Analyst Claude) + Langston | QUEUED | — | the feed-reliability threshold (Analyst + Langston) |
| 181 | 21.2 Paper-to-Live Transition Testing — - Run parallel paper+live | roadmap 21.2 — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | paper-to-live testing at small size |
| 182 | 19-17b ITEM-4 step 3 standing note (2026-06-10): Phase-21 go-live M | roadmap 19-17b — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | LAST: the go-live switch ⭐ Kyle approves the switch. |

## 5. Running now — observation windows

| item | owner | closes |
|---|---|---|
| 8a-P4c (VTS xStock price instrument) | CC-C | 2026-09-30T00:00Z |
| B-FEED-MISMATCH-FIX | CC-B | 300 taker closes or 2026-10-10 |
| B-REACH-BASELINE-ADJUST | CC-B | 7-day review due 2026-09-27 — overdue |
| B-XSTOCK-FEE-CONTRACT | CC-B | 21 days from 2026-09-11 |
| F-G-1 (venue price grid) | CC-C | window closed 2026-09-04 — conversion owed; reopened, see Wave 0 |
| B-DEPLOY-DRIFT-LINE | CC-A | observation window open |
| B-INSTRUMENTS-OVER-RULES | CC-A | 2026-10-02 |

## 6. Who owns what — grouped so connected work stays with one session

Kyle 2026-09-28: an even split by connected groups; earlier ownership is not a factor; Kyle owns no rows — his decisions and actions are marked ⭐ inside the owning session's row.

| session | group | items |
|---|---|---:|
| CC-C (Analyst Claude) | Prices and the exit price path; paper sizing (in flight); the paper standard and judging the evidence | 48 |
| Infra Claude | Identity, the coin list and exclusions; restarts, deploys, security and the servers; what the diagnostic screens show | 45 |
| CC-B (New Claude) | Signals, strategies, the SQE and RTB; learning data; trade-distance and strategy tuning | 44 |
| CC-A (Old Claude) | Trade records and costs; scores, regimes and gates; the xStock tuning studies; risk controls; the live engine; the final end-to-end audit | 45 |

## 7. Coltrane — proposed role (for Langston's view, then Kyle)

- **Not an implementer in this push.** Making him one is its own setup batch: he cannot push to the review branch (his key reaches only the agent-work repo, so a session must pull, review and push his work), his clone has no installed packages so he cannot run the type check or tests, and a full build on the shared 3 GB reviewer box is unmeasured. Kyle: *don't spend a long batch setting him up.*
- **A second, independent reviewer on the batches where a miss costs most** — a different model family reading the same diff after Langston's code review: the price layer (§1.3), risk controls and the live engine (§1.6), security, and the end-to-end runtime audit (`#522`). Read-only; his review goes in the channel and the batch report.
- **Two preconditions:** his privacy check (`COLTRANE-PARITY`, Wave B1) and Kyle allowing sessions to call him for those batch types (today only Kyle may).

