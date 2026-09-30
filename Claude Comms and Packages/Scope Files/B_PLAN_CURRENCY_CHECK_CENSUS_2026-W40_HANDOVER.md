# B-PLAN-CURRENCY-CHECK — census 2026-W40 worklist: handover record

**Source:** the first live census, alert `3333bbb0-63ee-4d39-8e6e-a857a9254b65`, graded at `13fa6bbce`; its box file is committed beside this as `B_PLAN_CURRENCY_CHECK_CENSUS_2026-W40.json` (sha256 `2f24be4e47453bfa1c5bbf4d52bc453e1cc32fb93228dab9d18c63bb00b64152`, equal on the box and here).
**Why a record, by id:** Langston's amendments to the W40 handling (2026-09-30): every set is named BY ID, never by count, so next week's census can tell the SAME items from different ones (A1); the resolve discharges the HANDOVER POST, not the placement, which is the receiving session's (A2; scope OBJ-8, §7 "no edit to another session's ledger entries").

## THE OWNER PREDICATE (A3), as the census computes it (`census.mjs` `ownerOfIssue`)
In order, first match wins: (1) an `OWNER` word followed within 30 characters by a session name, anywhere in the entry → **owner**; (2) a `HOME` line naming a session → **owner**; (3) the session that filed the entry (its head) → **by filer**; (4) none of these → **owner unknown**.
**Filer-derived items count as OWNED, by their filer** — the filer is the addressee of the handover (the Q24 asymmetry: a HOME-line owner is the addressee where one exists). Only (4) is unknown. Census-wide source counts: owner line 368, HOME line 43, filer 25, unknown 103 (of all OPEN issues; the 55 below are the unknown ones that are also unplaced).

## THE SETS
### CC-A (Old Claude) — mine, dispositioned by me in this batch — 28
| # | why unplaced |
|---|---|
| `#348` | U2 — its HOME batch has a completion report |
| `#407` | U2 — its HOME batch has a completion report |
| `#433` | U2 — its HOME batch has a completion report |
| `#437` | U2 — its HOME batch has a completion report |
| `#439` | U2 — its HOME batch has a completion report |
| `#461` | U1 — no HOME line |
| `#462` | U2 — its HOME batch has a completion report |
| `#541` | U6 — HOME line with no id |
| `#555` | U2 — its HOME batch has a completion report |
| `#575` | U6 — HOME line with no id |
| `#578` | U1 — no HOME line |
| `#580` | U1 — no HOME line |
| `#582` | U2 — its HOME batch has a completion report |
| `#584` | U5 — HOME batch in no list |
| `#586` | U5 — HOME batch in no list |
| `#587` | U6 — HOME line with no id |
| `#591` | U5 — HOME batch in no list |
| `#595` | U6 — HOME line with no id |
| `#596` | U6 — HOME line with no id |
| `#613` | U6 — HOME line with no id |
| `#623` | U6 — HOME line with no id |
| `#674` | U1 — no HOME line |
| `#702` | U2 — its HOME batch has a completion report |
| `#732` | U2 — its HOME batch has a completion report |
| `#749` | U2 — its HOME batch has a completion report |
| `#750` | U2 — its HOME batch has a completion report |
| `#751` | U1 — no HOME line |
| `#1021` | U1 — no HOME line |

### CC-A by FILER (no owner line) — mine, dispositioned by me — 3
| # | why unplaced |
|---|---|
| `#511` | U1 — no HOME line |
| `#677` | U2 — its HOME batch has a completion report |
| `#756` | U1 — no HOME line |

### CC-B (New Claude) — 13
| # | why unplaced |
|---|---|
| `#385` | U6 — HOME line with no id |
| `#393` | U4 — HOME cites PHASE_19_PLAN or a row with no id |
| `#395` | U5 — HOME batch in no list |
| `#422` | U2 — its HOME batch has a completion report |
| `#500` | U2 — its HOME batch has a completion report |
| `#509` | U6 — HOME line with no id |
| `#516` | U2 — its HOME batch has a completion report |
| `#520` | U2 — its HOME batch has a completion report |
| `#524` | U2 — its HOME batch has a completion report |
| `#525` | U5 — HOME batch in no list |
| `#562` | U2 — its HOME batch has a completion report |
| `#607` | U5 — HOME batch in no list |
| `#1098` | U2 — its HOME batch has a completion report |

### CC-B by FILER — 1
| # | why unplaced |
|---|---|
| `#445` | U1 — no HOME line |

### CC-C (Analyst Claude) — 40
| # | why unplaced |
|---|---|
| `#565` | U5 — HOME batch in no list |
| `#576` | U2 — its HOME batch has a completion report |
| `#620` | U1 — no HOME line |
| `#633` | U6 — HOME line with no id |
| `#650` | U6 — HOME line with no id |
| `#691` | U2 — its HOME batch has a completion report |
| `#696` | U6 — HOME line with no id |
| `#703` | U6 — HOME line with no id |
| `#908` | U5 — HOME batch in no list |
| `#911` | U2 — its HOME batch has a completion report |
| `#913` | U2 — its HOME batch has a completion report |
| `#915` | U5 — HOME batch in no list |
| `#916` | U4 — HOME cites PHASE_19_PLAN or a row with no id |
| `#936` | U3 — HOME cites the roadmap in prose only |
| `#937` | U3 — HOME cites the roadmap in prose only |
| `#939` | U1 — no HOME line |
| `#948` | U1 — no HOME line |
| `#949` | U1 — no HOME line |
| `#950` | U1 — no HOME line |
| `#952` | U1 — no HOME line |
| `#953` | U1 — no HOME line |
| `#954` | U4 — HOME cites PHASE_19_PLAN or a row with no id |
| `#955` | U1 — no HOME line |
| `#956` | U1 — no HOME line |
| `#957` | U1 — no HOME line |
| `#958` | U2 — its HOME batch has a completion report |
| `#960` | U2 — its HOME batch has a completion report |
| `#961` | U1 — no HOME line |
| `#962` | U1 — no HOME line |
| `#964` | U1 — no HOME line |
| `#969` | U1 — no HOME line |
| `#971` | U2 — its HOME batch has a completion report |
| `#992` | U2 — its HOME batch has a completion report |
| `#1001` | U1 — no HOME line |
| `#1073` | U1 — no HOME line |
| `#1075` | U1 — no HOME line |
| `#1076` | U5 — HOME batch in no list |
| `#1083` | U5 — HOME batch in no list |
| `#1085` | U5 — HOME batch in no list |
| `#1086` | U5 — HOME batch in no list |

### CC-C by FILER — 6
| # | why unplaced |
|---|---|
| `#554` | U1 — no HOME line |
| `#624` | U5 — HOME batch in no list |
| `#667` | U1 — no HOME line |
| `#938` | U3 — HOME cites the roadmap in prose only |
| `#945` | U6 — HOME line with no id |
| `#1065` | U1 — no HOME line |

### Infra Claude — 2
| # | why unplaced |
|---|---|
| `#924` | U3 — HOME cites the roadmap in prose only |
| `#1027` | U6 — HOME line with no id |

### OWNER UNKNOWN — the triage row (§9.4 disposition 4) — 55
| # | why unplaced |
|---|---|
| `#146` | U1 — no HOME line |
| `#160` | U1 — no HOME line |
| `#170` | U1 — no HOME line |
| `#174` | U2 — its HOME batch has a completion report |
| `#200` | U1 — no HOME line |
| `#211` | U1 — no HOME line |
| `#212` | U1 — no HOME line |
| `#214` | U1 — no HOME line |
| `#225` | U1 — no HOME line |
| `#227` | U1 — no HOME line |
| `#228` | U1 — no HOME line |
| `#230` | U1 — no HOME line |
| `#232` | U1 — no HOME line |
| `#236` | U2 — its HOME batch has a completion report |
| `#238` | U2 — its HOME batch has a completion report |
| `#295` | U2 — its HOME batch has a completion report |
| `#299` | U1 — no HOME line |
| `#300` | U1 — no HOME line |
| `#301` | U2 — its HOME batch has a completion report |
| `#303` | U2 — its HOME batch has a completion report |
| `#320` | U2 — its HOME batch has a completion report |
| `#321` | U2 — its HOME batch has a completion report |
| `#323` | U2 — its HOME batch has a completion report |
| `#325` | U2 — its HOME batch has a completion report |
| `#326` | U5 — HOME batch in no list |
| `#327` | U2 — its HOME batch has a completion report |
| `#328` | U6 — HOME line with no id |
| `#329` | U6 — HOME line with no id |
| `#331` | U3 — HOME cites the roadmap in prose only |
| `#342` | U2 — its HOME batch has a completion report |
| `#343` | U2 — its HOME batch has a completion report |
| `#345` | U2 — its HOME batch has a completion report |
| `#346` | U2 — its HOME batch has a completion report |
| `#347` | U2 — its HOME batch has a completion report |
| `#381` | U1 — no HOME line |
| `#384` | U6 — HOME line with no id |
| `#388` | U6 — HOME line with no id |
| `#389` | U6 — HOME line with no id |
| `#390` | U6 — HOME line with no id |
| `#403` | U6 — HOME line with no id |
| `#404` | U6 — HOME line with no id |
| `#406` | U2 — its HOME batch has a completion report |
| `#409` | U1 — no HOME line |
| `#410` | U2 — its HOME batch has a completion report |
| `#411` | U2 — its HOME batch has a completion report |
| `#418` | U2 — its HOME batch has a completion report |
| `#431` | U2 — its HOME batch has a completion report |
| `#435` | U1 — no HOME line |
| `#440` | U2 — its HOME batch has a completion report |
| `#442` | U5 — HOME batch in no list |
| `#523` | U1 — no HOME line |
| `#536` | U1 — no HOME line |
| `#754` | U1 — no HOME line |
| `#997` | U1 — no HOME line |
| `#1047` | U1 — no HOME line |

## THE OTHER LISTS, BY ID
### (a) a new completion report in no plan line — 1
| file | verdict | addressee |
|---|---|---|
| `F_G_2_COMPLETION_REPORT.md` | in-no-plan-line | CC-C (F-G-2 is CC-C's batch; Langston: likely an in-flight Step 10, not an orphan) |

### (c) a dated home — a batch booked against a calendar date (`CLAUDE.md` §9.4) — 12 issues / 13 lines
| # | RUNNING_ISSUES line(s) | owner |
|---|---|---|
| `#444` | 546 | owner CC-B |
| `#451` | 428 | owner CC-A |
| `#455` | 429 | owner CC-A |
| `#480` | 531 | owner CC-B |
| `#481` | 529 | owner CC-B |
| `#485` | 496 | owner CC-A |
| `#680` | 3629 | owner CC-B |
| `#681` | 3647 | owner CC-INFRA |
| `#682` | 3600 | owner CC-INFRA |
| `#684` | 3697, 3717 | owner CC-B |
| `#705` | 3732 | owner CC-C |
| `#908` | 5090 | owner CC-C |

excluded by name: [{'issue': 696, 'lines': [3774, 3776], 'reason': 'length-is-the-content date (the date of a data read, not a deadline), Langston Q25, scope §10h'}]

### (f) a plan line that is not closed but whose batch has a report — 5
| plan line | batch | owner |
|---|---|---|
| §4 row 55 | `B-RTB-REFRESH-CONSOLIDATE` | CC-B |
| §0 | `B-MEASURE-GATE` | CC-A |
| §0 | `B-XSTOCK-FEE-CONTRACT` | CC-B |
| §0 | `B-WAKE-LEAD-NAME` | CC-INFRA |
| §5 | `B-XSTOCK-FEE-CONTRACT` | CC-B |

## STATE, per item, from W41 on (A2)
Every item above is **handed over 2026-09-30** — Discord `#general` post id **`1554940764759400560`** (~19:50Z), one post naming CC-B, CC-C and Infra Claude with each one's items by number; CC-A's own items are dispositioned by CC-A in this batch. Next week's census reads this file and reports each item as one of three states — **never surfaced** / **handed over <date>, still unplaced** / **placed** — so a handover that was ignored does not read as a fresh finding, and a placement shows as progress. *(The census change that reads this file is built in this batch before W41.)*

