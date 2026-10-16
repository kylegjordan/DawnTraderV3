# B-PLAN-CURRENCY-CHECK — census 2026-W42 worklist: handover record
**Source:** the weekly census, alert `cf101c38-82ae-462a-ac69-e33451992c22`, graded at `780a206ac` (prev `be41f8585`). Its box file `/var/lib/governance-checker/census/2026-W42.json` is committed beside this as `B_PLAN_CURRENCY_CHECK_CENSUS_2026-W42.json`.
**Method, as W40 and W41 (Langston A1/A2):** every set is listed by id, so next week can tell carried items from new ones. The resolve discharges the handover post and CC-A's own items, never another owner's placement. `W41` marks an id that was in W41's set; `new` marks one that was not.

## THE SETS — (b) unplaced OPEN issues, 11

### CC-A (Old Claude) — 1, DONE in this turn
| # | why unplaced | since | disposition |
|---|---|---|---|
| `#667` | U3 — HOME cites the roadmap in prose only | W41 | homed by number on sprint row 186 (`+ #667`), `75546ad0a`; reads placed at HEAD |

### CC-C (Analyst Claude) — 9
| # | why unplaced | since |
|---|---|---|
| `#620` | U4 — HOME cites PHASE_19_PLAN or a row with no id | W41 |
| `#908` | U5 — HOME batch in no list | W41 |
| `#936` | U3 — HOME cites the roadmap in prose only | W41 |
| `#945` | U4 — HOME cites PHASE_19_PLAN or a row with no id | W41 |
| `#961` | U5 — HOME batch in no list | W41 |
| `#962` | U5 — HOME batch in no list | W41 |
| `#1087` | U5 — HOME batch in no list | new |
| `#1170` | U6 — HOME line with no id | new |
| `#1173` | U5 — HOME batch in no list | new |

### CC-B (New Claude) — 1
| # | why unplaced | since |
|---|---|---|
| `#1165` | U4 — HOME cites PHASE_19_PLAN or a row with no id | new |

## THE OTHER LISTS, BY ID
### (a) completion reports in no plan line — 2, both CC-B
`B_DASHBOARD_STATS_BLANK_COMPLETION_REPORT.md`, `B_ENTRY_DISTANCE_GUARD_COMPLETION_REPORT.md` (the latter is known, `#1188`).

### (e) after-references that name no earlier row — 7
- CC-B: row 100 → `B-XSTOCK-ENTRY-COMPARATOR`, `B-EXIT-TRIGGER-FILL-PARITY`, `B-BOOK-STATE-RING-INDEPENDENT-BOUND`, `row 32`.
- CC-C: row 124b → `row 150`; row 124c → `row 148a`.
- CC-A: row 1w → `row 1u` — **DONE**: row 1u moved above row 1w, which matches the order they closed in (`c5c65e663`).

### (f) not-closed plan lines with a report — 6, of which NEW: 1
- CC-B: §4 row 55 `B-RTB-REFRESH-CONSOLIDATE`; §0 and §5 `B-XSTOCK-FEE-CONTRACT`.
- CC-C: §0 `B-SIZING-DEC-RESTORE` (**the new one**).
- Infra Claude: §0 `B-WAKE-LEAD-NAME`.
- CC-A: §0 `B-MEASURE-GATE` — **DONE**. The line now reads leg 2 ✅ CLOSED with its report, and points the remaining legs at their after-live line (`c5c65e663`).

### (g) the §6 tally
At the graded ref, CC-B read 85 against a table of 79, and CC-C read 81 against 83. Both agree at HEAD; another session corrected them. CC-A added row 1za in this turn and re-counted: CC-A 80, total 302 (`B-PLAN-CURRENCY-CHECK` rule). Recount at HEAD: no differences.

## FOUND WHILE WORKING IT — homed
The census does not read the §0a pre-sprint stage table as a placement list. Issues placed only there read as unplaced every week. At HEAD, after the grade, that is `#707`, `#1194`, `#1195` and `#1199`.
`HOME: B-CENSUS-PRESPRINT-LIST (#1200), owner CC-A, placed in SPRINT_TO_LIVE_PLAN.md at row 1za, after row 1z.` Until it lands, treat those four as placed.

## STATE, per item
Handed over 2026-10-16 in one Discord `#general` post naming ANALYST Claude, NEW Claude and Infra Claude, each with their items by number (post id recorded in the resolve evidence). CC-A's own three items are done at `c5c65e663`, `0779b02a1` and `75546ad0a`.
