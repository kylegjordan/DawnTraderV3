# B-PLAN-CURRENCY-CHECK — census 2026-W44 and 2026-W45 worklists: handover record
**Source:** two weekly census alerts, run late because the crew was paused 2026-10-20 → 2026-11-04:
- W44: alert `df2bb2cc-ac9f-4290-922a-0ce3006c1f34`, graded at `e00072c8e` (prev `555a2cc71`); box file committed beside this as `B_PLAN_CURRENCY_CHECK_CENSUS_2026-W44.json`.
- W45: alert `103b3594-a455-41c5-b439-cc42a6afc76b`, graded at `cf6f0601d`; box file `B_PLAN_CURRENCY_CHECK_CENSUS_2026-W45.json`.
**The two weeks list the same sets** for (b), (e) and the reused numbers, read by id from each alert's `metadata.lists`. They differ only in (f): W44 marks `§0 B-MEASURE-GATE` as new; in W45 it is in the full list and not new.
**Method, as W40-W43:** every set is listed by id; `W43` marks an id that was in W43's set, `new` one that was not. Each item is re-checked against the plan at the handover (2026-11-04, after `0f25ca0d7`).
⛔ **KYLE'S RULE (2026-10-19, restated 2026-11-04) APPLIES:** no new batch or plan row without his agreement; findings go to him to slot, calibration-first. So this record **hands items to their owners and adds no plan rows.**

## (b) unplaced OPEN issues — 11 in both weeks
### CC-C (Analyst Claude) — 8, all W43
| # | why unplaced |
|---|---|
| `#620` | U4 — HOME cites PHASE_19_PLAN or a row with no id |
| `#908` | U5 — HOME batch in no list |
| `#936` | U3 — HOME cites the roadmap in prose only |
| `#945` | U4 — HOME cites PHASE_19_PLAN or a row with no id |
| `#961` | U5 — HOME batch in no list |
| `#962` | U5 — HOME batch in no list |
| `#1087` | U5 — HOME batch in no list |
| `#1173` | U5 — HOME batch in no list |

### CC-B (New Claude) — 3
| # | why unplaced | since |
|---|---|---|
| `#1165` | U4 — HOME cites PHASE_19_PLAN or a row with no id | W43 |
| `#237` | U2 — its HOME batch has a completion report | new |
| `#1230` | U1 | new — **placed since the census:** Kyle put it on the after-live list on 2026-11-04 (`PRE_LIVE_SPRINT.md:262`, `RUNNING_ISSUES` `#1230` header). No work. |

The census counts 11: 8 + 3 = 11. Infra Claude's seven W43 items (`#1197`-`#1216`) have left the set, now placed.

## THE OTHER LISTS, BY ID
### (a) completion reports in no plan line — 0 in both weeks.
### (e) after-references that name no earlier row — 7, all W43
- CC-B: row 100 → `B-XSTOCK-ENTRY-COMPARATOR`, `B-EXIT-TRIGGER-FILL-PARITY`, `B-BOOK-STATE-RING-INDEPENDENT-BOUND`, `row 32`; row 59g2 → `N` (row 59g2 is CLOSED; a parse of its text, not a live ordering).
- CC-C: row 124b → `row 150`; row 124c → `row 148a`.
### (f) not-closed plan lines with a report — 3 (W44: 1 new; W45: 0 new)
- **CC-A: `§0 B-MEASURE-GATE` (new in W44).** No work: the line reads *IN OBSERVATION — leg 2 built and CLOSED 2026-09-02 (report …); the OBJ-4 window is open* (`SPRINT_TO_LIVE_PLAN.md:57`). The report is leg 2's; the batch stays open on purpose for its observation window, so a not-closed line with a report is the correct state.
- CC-B: §4 row 55 `B-RTB-REFRESH-CONSOLIDATE`; §5 `B-XSTOCK-FEE-CONTRACT` (both W43).
### reused numbers — 8, unchanged: `#559 #561 #642 #646 #648 #660 #741 #921` (the known legacy doubles; not renumbered blind).
### (c) dated homes 0 · (d) id-less plan rows 0 · (g) the §6 recount agrees.

## STATE, per item
Every item above for CC-B and CC-C is **handed over 2026-11-04** in one Discord `#general` post naming NEW Claude and ANALYST Claude, each with their items by number; its id is in the resolve evidence. CC-A's one item needs no work. **Standing note for Kyle's next look:** CC-C's eight have been in the unplaced set since 2026-09-30 (six of them) or 2026-10-16 (`#1087`, `#1173`), per the census's own first-seen dates; under his rule their placement is his call when the owners bring them.
