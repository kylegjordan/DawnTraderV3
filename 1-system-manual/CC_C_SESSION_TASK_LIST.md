# CC-C (ANALYST Claude) — SESSION TASK LIST — as of 2026-09-30

> ⛔ **KYLE'S STANDING RULE, 2026-09-05:** every session keeps its own task list.
> - **It holds:** the batches assigned to this session, the sub-batches already identified, the hotfixes, and the findings still to investigate — in working order.
> - **It is updated:** every time a batch closes, and every time something new is decided and slotted.
> - **Every update lands in the same turn:** this file, then the active plan `1-system-manual/SPRINT_TO_LIVE_PLAN.md` (or its after-live list), then `POST_AUDIT_ROADMAP.md` where the item is roadmap-level.
>
> ⚠️ **The plan is the authority; this file is the index.** Every row below is derived from `SPRINT_TO_LIVE_PLAN.md` (Kyle, 2026-09-28: the active plan; `PHASE_19_PLAN.md` is history). If the two disagree, the plan wins and this file is stale.
>
> ⚠️ **Re-derived 2026-09-30** (Langston's `B-PLAN-CURRENCY-CHECK` Step-2 part-3 ruling, finding DL-r3-5, relayed by OLD Claude): the 2026-09-24 version was built from `PHASE_19_PLAN.md` and named 18 rows the sprint plan gives to other sessions (Infra Claude: 18, 19, 25-29, 75, 76, 85, 91, 92; NEW Claude: 119, 121, 123, 137; OLD Claude: 169, 170). The queue below is generated from the plan's owner column, so it names only rows the plan gives to CC-C.

---

## 0a. FINISH FIRST — the plan's §0 line for CC-C (Kyle: no sprint work until every session has finished its §0 list)

| plan row | batch | where it stands (2026-09-30) |
|---|---|---|
| 13 | `B-OHLC-FRAME-GUARD` (`#1028`) | r6 Step 5 done (`21d7e84a2`, CI `36475941280`); Step 6 in the held deploy (≥ 2026-10-02T20:10Z), then Step 7; declared OPEN in `GOVERNANCE_EXCEPTIONS` |
| 16 | `F-G-1` reopened (`#1031`) | Step 5 done; deploy with the held window; conversion to a completion report owed |
| 17 · 3 · 2 | `B-PRICE-SIDE-BY-JOB` | `8a-P4c` increment 2 at Step 5 (deploy with the held window); increment 3 at Step 2 with Langston (plan §C3, `#1118` folded as P14); then `B-XSTOCK-BID-TRIGGER-RELAND` (row 2, after row 15), `B-VTS-NO-DECISION-VALVE`, and `8c` per-leg levels (held) |
| 14 · 15 | `B-REST-SIDES-TO-CACHE`, `B-BOOK-STATE-RESTART-DURABLE` | built and reviewed; ship in the one held deploy |
| 9 | `B-SIZING-DEC-RESTORE` | 2e Step 4: gates A1 and B approved, A2 round 3 with Langston; deploy ≥ 2026-10-02T20:10Z (2e's rollback first), then Kyle's $3,000 paper reset |
| 40 | `B-XSTOCK-SESSION-FRESHNESS` | open; continues as its sprint row |
| — | `F-G-2` | ✅ closed as absorbed into `B-PRICE-SIDE-BY-JOB` (2026-09-28, `0ccad12f5`) |

## 0b. OUTSIDE THE PLAN — current direction from Kyle

| item | state |
|---|---|
| **The Codex experiment** (Kyle, 2026-09-11) — `Scope Files/CODEX_FINDINGS_BY_GROUP.md` | register r14 ready; not to Coltrane until `#1027` clears |
| **Standing ownership:** `1-system-manual/ACTIVE_PATH_FLOW.md` | updated as batches land |

## 1. THE QUEUE — every sprint-plan row naming CC-C as owner, in plan order (the §0a rows above excluded)

Generated from the plan's owner column. The state is the plan's own; the description is its first clause.

| plan row | item | state | what it is |
|---|---|---|---|
| 2 | B-XSTOCK-BID-TRIGGER-RELAND | QUEUED | midpoint off (Kyle 2026-09-28: finished and deployed BEFORE the sprint starts): paper xStock stop/target triggers back on the bid |
| 4 | B-VTS-NO-DECISION-VALVE | IN FLIGHT — Step 2 APPROVED 2026-10-01; Step 3 next | midpoint off, before the sprint: a VTS trade with no usable sell price no longer books its timeout at the midpoint |
| 4a | B-VTS-TELEMETRY-AGGREGATES (`#1141`) | IN FLIGHT — Step 1 | after row 4: NARROWED 2026-10-02 (Langston) to the telemetry lookup's `SKIPPED` fallback (`:283`), stale-cell overwrite (`:218-219`) and the regime-level skipped denominator (`:212-213`) — measure first — plus two rule-18 deletions and one comment record-fix; the never-count / class-pooling half moved to row 148a (CC-A) |
| 4b | B-VTS-NO-DECISION-VALVE increment 2 (`#1073`) | QUEUED | after row 4a: measure whether a paper maker rest fills after its deadline while a price is refused |
| 4c | B-SHADOW-HOLD-CLOCK (`#1144`) | QUEUED | after row 4b: decide whether the shadow lane's 48 h hold pauses while xStock is shut |
| 9a | B-TRADE-LOSS-BOUND-DECISION (`#1105`) | DONE — decided (Kyle 2026-09-30: NO bound) | Kyle: no buffer and no limit on the max position % tied to the kill switch; if a large position fails and the kill switch trips past its limit, so… |
| 9b | B-SETTINGS-REAL-TYPE (`#1106`) | QUEUED | after row 9a: the builder returns the legacy table's type, so 24 fields read at ~50 sites are always undefined (engine blacklist/whitelist, AI-prom… |
| 9c | B-LIVE-READERS-CLOSED-TRADES (`#1108`, was `#668`) | QUEUED | after row 9b, before the go-live switch (Kyle 2026-08-07: its own batch right after B-SIZING-DEC-RESTORE; named then, placed 2026-09-29): live's ba… |
| 9d | B-STRATEGY-SETTINGS-KNOBS (`#1109`) | QUEUED | after row 9c: shown and editable on the strategies screen, enforced nowhere; only feeds the strategy-settings approval rule, so removing it is a ch… |
| 9e | B-CLAMP-ESTIMAND-RESPEC (`#1110`) | QUEUED | after row 9d, before Phase 25 reads it: the clamp-bind stream is retired in B-SIZING-DEC-RESTORE 2d because its ratio is always 0.97 × one factor;… |
| 9f | B-CAP-COHORT-SPLIT-DECISION (`#1111`) | DONE — decided (Kyle 2026-09-30: split OFF, every coin under the rule; removed in B-SIZING-DEC-RESTORE 2e, `#1111`) | after row 9e: the limit turns on for real at the 2d deploy, and a switch seeded 2026-04-28 for an experiment that never ran exempts ~half the unive… |
| 9g | B-M5D-HARNESS-CENSUS (`#1112`) | QUEUED | after row 9f: the M5E harness was deleted in 2d after a census; M5D is its unaudited sibling (routes still live) — census its callers and state wri… |
| 9h | B-OPEN-POSITION-INDEX-TRUTH (`#1113`) | QUEUED | after row 9g: the duplicate-open handler names one index, the schema declares a second, and the database holds a third shape (symbol + side); decid… |
| 10 | #628 — batch named at Step 1 | QUEUED | with B-SIZING-DEC-RESTORE: its two sizing sites |
| 31 | B-XSTOCK-LIVE-FEED | QUEUED | the xStock feed became our trading feed without a decision — decide and fix |
| 32 | plan row 6 | QUEUED | a bound on how old a price may be when used |
| 33 | B-PRICE-STALENESS-BOUND | QUEUED | the last-known-good price is re-served with no age bound |
| 34 | B-EQUITY-RECONNECT-STALL-TIMER | QUEUED | a stalled xStock reconnect leaves positions unwatched |
| 36 | #506 — batch named at Step 1 | QUEUED | book subscriptions never unsubscribe |
| 37 | B-BOOK-SUBSCRIPTION-REACH | QUEUED | after #506: subscribe the order book for the whole pool, not ~3 coins |
| 38 | B-CRYPTO-MARK-AGE-GATE | QUEUED | crypto mark age |
| 39 | #977 — batch named at Step 1 | QUEUED | the shared price-cache refresh lane for open positions runs but nothing subscribes - staleness hits selection (CC-C) |
| 40 | B-XSTOCK-SESSION-FRESHNESS | QUEUED | xStock entry-age limit vs the exit standard Kyle ruled |
| 41 | B-XSTOCK-ENTRY-COMPARATOR | QUEUED | xStock entry-price cross-check |
| 42 | B-DECIDED-INTENT-INDEX | QUEUED | xStock's three definitions of 'the price' from one frame |
| 43 | B-POST-GRID-MUTATION-CENSUS | QUEUED | what changes a stop after it is rounded |
| 44 | plan row 7 | QUEUED | the VTS reads prices through the shared accessor |
| 45 | #1033 — batch named at Step 1 | QUEUED | an absent volume is stored as zero and the liquidity filter reads it |
| 53 | B-TARGET-FABRICATION | QUEUED | signals: default targets the strategy never chose |
| 60 | B-INTENT-ENTRY-PARITY | QUEUED | open: entry routes bypass the price grid and the sizer. ⛔ SCOPE SHRANK 2026-09-30: the HTTP intent path (`intent-executor.ts`) is DELETED (B-SIZING… |
| 61 | B-GRID-LIVE-PATH-PARITY | QUEUED | open: grid rounding on the live order path |
| 62 | — batch named at Step 1 | QUEUED | open: a resting order's deadline runs even when no price is usable |
| 63 | #630 — batch named at Step 1 | QUEUED | open: exercise the maker-order deadline once |
| 64 | B-EXIT-TRIGGER-FILL-PARITY | QUEUED | close: exits fire on the price they would fill at |
| 65 | B-EXIT-TICKER-LEG-ADAPTER-SIDES | QUEUED | close: the exit path sees both price sides |
| 66 | B-BOOK-STATE-RING-INDEPENDENT-BOUND | QUEUED | close: xStock exit plausibility bound |
| 67 | #204 — batch named at Step 1 | QUEUED | close: xStock stop prices at the wrong scale |
| 68 | plan row 3h.b | QUEUED | close: remove the second exit implementation |
| 69 | B-EXIT-LATCH-INVESTIGATION | QUEUED | close: is the hold-past-target a label or a real exit defect |
| 70 | — batch named at Step 1 | QUEUED | close: map the exit audit's items to homes |
| 86 | plan row 8 | QUEUED | paper truth: fill-integrity detector |
| 89 | B-IMPLEMENTATION-SHORTFALL | QUEUED | paper truth: separate stale-signal cost from execution cost |
| 90 | B-GRID-REFUSAL-RATE | QUEUED | paper truth: how often the grid refuses |
| 111 | #513 — batch named at Step 1 | QUEUED | the VTS books maker target exits the way the paper lane would |
| 112 | B-DECISION-INSTANT-QUOTE | QUEUED | the exact quote at decision time |
| 113 | B-EXIT-DECISION-RUNG-STAMP | QUEUED | which price rung an exit used |
| 118 | #1072 — batch named at Step 1 | QUEUED | the price-history recorder's frozen symbol set |
| 124a | B-AMR-INPUT-INTEGRITY-ARC (`#600`, `#604` leg A, `#608`, `#609`, `#610`, `#611`, `#612`) | QUEUED | after row 124 |
| 124b | P19-B-DROUGHT-2 (`PHASE_19_PLAN.md:23`) | QUEUED | after row 124a, before row 125: the drought batch two (DI recorded, spread ceiling, depth floor, volume floor, combinations study, mean-reversion decision) + the 25-5 gate's seven untriggered items, published after row 150 (placed 2026-10-02) |
| 124c | B-NEWS-ALTDATA-LAYER (STRATEGIC_DIRECTIONS item E) | QUEUED | after row 124b: capture-only first (news + on-chain inputs per decision), the score and its IC test after row 148a (Kyle 2026-10-02) |
| 135b | B-CONCENTRATION-SCORE-UNITS | QUEUED | after row 135a (Langston 2026-09-30, `B-SIZING-DEC-RESTORE` 2e J1b): the score mixes dollars with a 2.5 cap and is computed once at boot on an empt… |
| 138a | B-PATTERN-SIZE-CAP-REVIEW (`#1115`) | DONE — decided (Kyle 2026-09-30: cap OFF; removed in B-SIZING-DEC-RESTORE 2e) | SUPERSEDED: |
| 148c | `#399` (b) fractional Kelly | QUEUED | after rows 148a (B-PWIN-CALIBRATION, CC-A) and 148b: size by fractional Kelly on the calibrated pWin, Kelly and its tight cap together (placed by Langston 2026-10-02) |
| 154a | B-MAKER-PFILL-CALIBRATION (`#738`) | QUEUED | after row 154: the maker fill probability (pFill) — owns pFill; row 148a owns pWin (Langston 2026-10-02 boundary) |
| 166 | #692 — batch named at Step 1 | QUEUED | operator alert: no new trade has opened for a set time because the allowance is full, with manual close / prompt-exit options |
| 176 | #296 — batch named at Step 1 | QUEUED | one rate-limited path for placing and cancelling orders |
| 183a | B-MAKER-CANCEL-ON-DROP (`#1103`) | QUEUED | after row 183, with row 176 (#296): in live mode a dropped resting buy must be cancelled at Kraken, or it can fill into a position nothing tracks (… |
| 183b | B-LOSS-WINDOW-OPERATOR-CLOSES (`#1154`) | QUEUED | after row 183a: the kill switch's loss count should leave out operator closes by label; interim no restart within 24 h of the paper reset |
| 183c | B-SIZING-SLIP-DETECTOR (`#1155`) | QUEUED | after row 183b: a standing detector for a mistyped max position %, paper and live |
| 192 | B-KRAKEN-FEE-WATCH | QUEUED | notice when the exchange changes fees |
| 194 | — batch named at Step 1 | QUEUED | after KRAKEN-LIVE-KEY: confirm live fees |

## THE OTHER LISTS — listed so they can be seen, not touched

- `CC_A_SESSION_TASK_LIST.md` (OLD Claude)
- `CC_INFRA_SESSION_TASK_LIST.md` (Infra Claude)
- `CC_B_SESSION_TASK_LIST.md` (NEW Claude)
