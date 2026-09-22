# CC-C (ANALYST Claude) — SESSION TASK LIST — as of 2026-09-22

> ⛔ **KYLE'S STANDING RULE, 2026-09-05:** every session keeps its own task list.
> - **It holds:** the batches assigned to this session, the sub-batches already identified, the hotfixes, and the findings still to investigate — in working order.
> - **It is updated:** every time a batch closes, and every time something new is decided and slotted.
> - **Every update lands in three places, in the same turn:** this file, then `1-system-manual/PHASE_19_PLAN.md`, then `POST_AUDIT_ROADMAP.md` where the item is roadmap-level.
>
> ⚠️ **The plan is the authority; this file is the index.** Every row below is derived from `PHASE_19_PLAN.md`. If the two disagree, the plan wins and this file is stale.
>
> ⚠️ **Created late — 2026-09-11.** Kyle's rule landed on 2026-09-05; this list did not exist until the governance checker flagged its missing ledger row (alert `2ec36624`, routed by Langston).

---

## 0a. OPEN AND STALLED — batches I have started and not closed

| plan row | batch | where it stands | waiting on |
|---|---|---|---|
| 3b.h-6 | `B-OHLC-FRAME-GUARD` (`#1028`) | deployed `29cce1076`; Step 4 approved; **paused at Step 7** — only the on-screen panel check is left | me (behind the Codex experiment) |
| 3 | `F-G-1` `B-GRID-REPRESENTABILITY` | window closed 2026-09-04; **conversion to a completion report owed**; OBJ-9 re-opened, bounded to the ordering guarantee (`#1031`) | me |
| 3c | `F-G-2` `B-EXIT-TRANSACTABLE-SIDE` | crypto half deployed 2026-09-02; **observation window VOID since 2026-09-05** | the level-basis and reachability work, then re-open |
| 3n / 3n.q / 3n.q2 | `B-PRICE-SIDE-BY-JOB` — exit and fill side (`8a-P2`, `8a-P3`, `8a-P4`; one batch, two halves) | `8a-P2` + `8a-P3` + `8a-P4a` + `8a-P4b` (with C1) deployed; the `8a-P3` window closed 2026-09-22 12:16:07Z; **Step 10 governance landed 2026-09-22**; progress report `Batch Completion/B_PRICE_SIDE_BY_JOB_8A_P3_PROGRESS_REPORT.md` | me — **`8a-P4c` (VTS xStock)** is the next build; one completion report when both halves land |
| 3n (`8c`) | `B-PRICE-SIDE-BY-JOB` row `8c` | P1 only; **HELD** | the decision recorded on the row |
| 3n.l | `B-REST-SIDES-TO-CACHE` (`#1056`) | scope APPROVED r4 2026-09-13 (`6036fd1a6`); Step 2 next | built during `8c`'s window, deployed after it |
| RUN ORDER banner | `B-SIZING-DEC-RESTORE` | obj-1, obj-10, obj-11 LIVE at `213e162dc` (it sizes every trade); obj-2..5 and Steps 4-11 not built; declared in `GOVERNANCE_EXCEPTIONS.md` 2026-09-12 | **Kyle** — its queue position against the price work is his |
| 3b.f-c | `B-XSTOCK-SESSION-FRESHNESS` | open; the entry-side flat 15 s ceiling is its subject | me |

**Closed 2026-09-11:** 3b.b `B-XSTOCK-FEED-SANITY` (`#943`) — window INCONCLUSIVE, stopped; the acceptance re-arms on the post-OBJ-7 instrument · 3b.f `B-PRICE-AGE-TRUTH` (`#951`) — Langston confirmed Step 11.

## 0b. OUTSIDE THE PLAN — current direction from Kyle

| item | state |
|---|---|
| **The Codex experiment** (Kyle, 2026-09-11) — `Scope Files/CODEX_FINDINGS_BY_GROUP.md` | r3 sent to Coltrane 2026-09-11; **waiting on his per-group design report** |
| **Standing ownership:** `1-system-manual/ACTIVE_PATH_FLOW.md` | updated as Phase-19 batches land |

## 0. THE QUEUE — every plan row naming CC-C as owner, in plan order

Derived 2026-09-11 from the plan's own rows; the `3n.*` rows re-derived 2026-09-22 (plan lines 87-125, owner column read per row). Rows marked ⚠️ carry a closed or withdrawn word somewhere in the row; **confirm the row before working them.**

| plan row | item |
|---|---|
| 3b.b-c | `B-ROLLBACK-EPOCH-FORWARD` (`#1045`) — placed 2026-09-11; after OBJ-7 deploys, before OBJ-8's build |
| 3b.d | `B-XSTOCK-BOOK-LADDER` (`#949`) — prerequisite of F-G-2's xStock legs |
| 3b.e | ⚠️ `B-XSTOCK-LIVE-FEED` (`#950`) |
| 3b.f-a | `B-OPENTRADE-REFRESH-LANE` (`#977`) — placed before 3b.f-b by Kyle |
| 3b.f-b | `B-PRICE-AGE-REFUSAL` — gated on `#971` |
| 3b.f-d | `B-OBS-WINDOW-EVIDENCE-CAPTURE` (`#1044`) — placed 2026-09-11 after 3b.f-c |
| 3b.b-b | `B-XSTOCK-ENTRY-COMPARATOR` (`#996`) |
| 3b.g | `B-DECIDED-INTENT-INDEX` (`#956`) — precedes the exit-path redesign |
| 3b.h-1 | `B-TICKER-BBO-TRIGGER` (`#1017`) — immediately before 3n |
| 3b.h-2 | `B-UNIVERSE-REFRESH-ACTS` (`#1018`) |
| 3n.0 | `B-VTS-MARK-SIDE` |
| 3b.h-4 | `B-SYMBOL-CLASS-IDENTITY` (`#1024`) |
| 3b.h-7 | `B-FUTURES-BAR-FINAL` (`#1030`) |
| 3b.h-8 | `B-ARCHIVE-WRITER-LIFECYCLE` (`#1034`, `#1032`; Step 1 also reviews `#1036`, `#1037`; ➕ `#1072` added 2026-09-22 — the crypto snapshot archiver's membership is frozen at each restart, three legs) — position proposed, Langston to confirm |
| 3b.i | `B-DISPATCH-STAGING-VERIFY` (`#964`) |
| 3b.j | ⚠️ `B-SCANNER-DEDUPE-DEAD-TABLE` (`#965`) |
| 3b.k | ⚠️ `B-CHANGE-CLASS-PARSER` (`#968`) |
| 3b.l | `B-TWO-CACHE-INTENT` (`#971`) |
| 3b.m | `B-PROVENANCE-LOSS-CENSUS` (`#976`) |
| 3c.a | `B-DEPLOY-REF-DECLARATION` (`#988`) |
| 3d | ⚠️ `B-MIN-STOP-DISTANCE` |
| 3e | `B-GUARD-COVERAGE-AUDIT` (`#919`) |
| 3f | `B-VALIDATE-OBSERVABILITY` (`#922`) |
| 3g | `B-GRID-LIVE-PATH-PARITY` (`#939`) |
| 3h | `B-INTENT-ENTRY-PARITY` (`#928`, `#929`) |
| 3i | `B-TARGET-FABRICATION` (`#927`) |
| 3i.b | `B-STRING-TRUTHINESS-GUARDS` (`#930`) |
| 3i.c | `B-CANONICAL-FREEZE` (`#948`) — governance hygiene |
| 3j | `B-FUNNEL-PERP-CLASSES` (`#925`) |
| 3k | `B-VENUE-PAIRS-REINIT` (`#933`) |
| 3l | `B-VPG-ROW-ALIGN` (`#934`) |
| 3m | ⚠️ `B-RATE-LIMITER-RESET-DISPOSITION` (`#936`) |
| 3n.a | `B-ORPHAN-ROOT-SCANNER` |
| 3n.b | `B-ORPHAN-LEVEL-TABLES` |
| 3n.c | `B-TRAILING-STATE-DURABILITY` |
| 3n.d | `B-GRID-REFUSAL-RATE` |
| 3n.e | `B-CANONICAL-CORPUS-ACCURACY` (`#733`) |
| 3n.f | `B-DIAG-READ-INTEGRITY` (`#1014`) |
| 3n.g | `B-QUOTE-PEG-DEVIATION-WATCH` |
| 3n.h | `B-QUOTE-LEG-INTEGRITY` (`#1050`) |
| 3n.i | `B-QUOTE-ADMISSION-LEGACY-SWEEP` (`#937`) |
| 3n.k | `B-FAMILY-POOL-REACHABILITY` (`#1052`) |
| 3n.l | `B-REST-SIDES-TO-CACHE` (`#1056`) — see §0a |
| 3n.m | `B-BOOK-SUBSCRIPTION-REACH` |
| 3n.n | `B-DECISION-INSTANT-QUOTE` |
| 3n.q2 | **`8a-P4c` — VTS xStock**, the remainder of the xStock half (the list is on the plan row) |
| 3n.q3 | `B-VTS-NO-DECISION-VALVE` |
| 3n.q4 | `B-EXIT-LINE-IDENTITY` |
| 3n.q5 | `B-BOOK-STATE-RING-INDEPENDENT-BOUND` |
| 3n.q6 | `B-EXIT-DECISION-RUNG-STAMP` (`#1064`) |
| 3n.q8 | `B-BOOK-STATE-RESTART-DURABLE` (`#1066`) — before 3n.q7 |
| 3n.q7 | `B-XSTOCK-BID-TRIGGER-RELAND` — after 3n.q8 |
| 3n.r | `B-TSC-COVERS-TESTS` |
| 3n.o | `B-CRYPTO-MARK-AGE-GATE` |
| 3n.p | `B-EXIT-TICKER-LEG-ADAPTER-SIDES` |
| 4 | `F-5` — per-strategy reach structure (pulled forward by Kyle, after 3n) |
| 4.b | `B-KILLSWITCH-DENOMINATOR` (`#618` remaining legs) |
| 5.a | `B-NONFIAT-QUOTE-DENOMINATION` (`#966`) |
| 5.b | `B-PRICE-FLOOR-REVIEW` (`#967`) — **the decision is Kyle's** |
| 3z | `B-TOTAL-DRAWDOWN-WARNING` (`#303`) — placed at the end of Phase 19 |

**Not in the queue, and why:**
- 3b.h `B-EXIT-BOOK-AGE-STAMP` — closed 2026-09-07.
- 3b.c `B-EXIT-TRIGGER-FILL-PARITY` — withdrawn 2026-08-31 and folded into 3b.b.
- 3b.f-c-a — absorbed into 3b.b on 2026-09-03.
- 3b.f-d — CC-B's row.

## THE OTHER THREE LISTS — listed so they can be seen, not touched

- `CC_A_SESSION_TASK_LIST.md` (OLD Claude)
- `CC_INFRA_SESSION_TASK_LIST.md` (Infra Claude)
- `CC_B_SESSION_TASK_LIST.md` (NEW Claude) — does not exist yet. Langston has placed that as an item on the `B-TASK-LIST-SLOT` follow-on.
