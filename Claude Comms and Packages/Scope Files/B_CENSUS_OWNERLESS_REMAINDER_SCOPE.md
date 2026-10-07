# B-CENSUS-OWNERLESS-REMAINDER — SCOPE (Step 1, r1 — APPROVED by Langston 2026-10-07 with C1-C5, folded in the pre-audit)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1s**, after row 1n · **Issue:** `#1167` · **Placed by:** Langston, `B-CENSUS-OWNERLESS-TRIAGE` Step 8 condition 2 (§9.4 disposition 3).

## 0. WHY
After row 1n, **48 open issues are PLACED but have no owner the census can read** (`census.mjs` `ownerOfIssue` → `source: 'unknown'`; measured at `035d0f7e5` (Langston C5: one ref, named): ownerLine 407 · homeLine 34 · filer 15 · **unknown 48** of 504 open). Being placed, they appear in no census list, so nothing ever surfaces that nobody owns them.

**Survey (at the same ref), by the line that places each:** **18** on a §4 row whose owner cell names a session · **24** on an after-live line — **1** names a session, **2** name Kyle (the census does not read Kyle as an owner, and §6 says Kyle owns no rows), **21** read `(—)` or no owner · **6** placed by a HOME batch or roadmap row (`#203`, `#205`, `#237`, `#302`, `#324`, `#539`), read individually. 18 + 24 + 6 = 48.

## 1.a ARCHITECTURAL READ
`census.mjs` `ownerOfIssue` reads only the ISSUE's text (an OWNER line, a HOME line naming a session, the head's filer). It never reads the owner of the line that PLACES the issue — so an issue placed on a row owned by CC-B still reads "owner ?". No trading component; System Manual N/A. SIM: the governance-checker entry, if the census rule changes (OBJ-3).

## 1.b PROVENANCE READ
- `ownerOfIssue` — `B-PLAN-CURRENCY-CHECK` (CLOSED 2026-09-30, mine): R3-Q9 widened owners "measured and LABELLED" (ownerLine / homeLine / filer); the placing line's owner was never a source. Disposition (2): relevant, may need one more source — decided at OBJ-3.
- The after-live list's `(—)` owners — `PRE_LIVE_SPRINT.md`, built from the Phase-19 → sprint move (2026-09-28): items carried over with no owner. Not a defect in itself; it is where these 22 have no owner.

## 2. METHOD (per issue — same rules as row 1n)
1. Read the entry; **default to the session the entry or its placing line names** (row 1n's C1); a departure states its reason.
2. Where the placing line names a session, the issue takes it. Where it reads `(—)`, Kyle or nothing, assign by the §6 grouping (prices → CC-C; signals/strategies/SQE/RTB/learning → CC-B; servers/deploys/security/diagnostic screens → Infra Claude; records/costs/scores/regimes/gates/risk/live engine → CC-A), and write the SAME owner on the after-live line.
3. Write one line into the entry: `W41 OWNER (CC-A, <date>): OWNER <session> — <why>`; edit in place, never stack. Kyle-decided items keep his decision marker; Kyle still owns no row.

## 3. OBJECTIVES
| # | objective | check |
|---|---|---|
| **OBJ-1** | Each of the 48 has an owner the census reads | `ownerOfIssue` over the ledger at the close commit: `source: 'unknown'` = 0 among the 48 (control at `f440dd232`: 48) |
| **OBJ-2** | The owner agrees with the placing line | a script: for each of the 48, the entry's owner = the placing §4 owner cell or after-live `(owner)`; 0 mismatches (after-live lines updated where they read `(—)`/Kyle) |
| **OBJ-3** | The census cannot silently grow this set again | **decision for Step 2, with Langston:** (a) `ownerOfIssue` falls back to the PLACING line's owner (structural — an owned row owns its issues), or (b) a "placed but ownerless" list, or (c) both. Whichever is chosen is built and tested with a positive control; measured on the live ledger before it ships (row 1n's C2 rule) |
| **OBJ-4** | Every issue given to another session is handed over by number | one post per session; a refusal re-opens that item only |
| **OBJ-5** | §6 still agrees | `recountS6` diffs `[]` at the close commit (no §4 row is added or re-owned, so this is a check, not a change) |

## 4. OUT OF SCOPE
Every other `(—)` after-live line that places no open issue; renumbering; any defect found live (homed, not fixed).

## 5. OBSERVATION
None — graded by the census functions at the close commit; W42 (Monday) confirms independently.
