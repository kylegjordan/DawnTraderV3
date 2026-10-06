# B-CENSUS-OWNERLESS-TRIAGE — SCOPE (Step 1, r1)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1n**, after row 1m · **Issue:** `#1139` · **Placed by:** Langston, W40 census handling A3 (2026-09-30), §9.4 disposition 4 — a review.

## 0. WHY

The weekly census lists every OPEN issue with no place in the sprint plan. Most have an owner and are handed to it. **55 have no owner at all** by the census's predicate (`census.mjs` `ownerOfIssue`: no `OWNER <session>`, no `HOME` naming a session, no identifiable filer), so nobody is handed them and they sit forever. **The 2026-W41 census, a week later, lists exactly the same 55** (set-compared by id against W40: identical) — nothing arrived, nothing left. Row 1n also carries four of CC-A's own items that need a decision before they can be placed (`#439`, `#575`, `#596`, `#613`), and W41 added `#532` (its head reads CLOSED before its final OPEN, and it has no filer).

**The set — 60 issues:**
- **The 55:** #146, #160, #170, #174, #200, #211, #212, #214, #225, #227, #228, #230, #232, #236, #238, #295, #299, #300, #301, #303, #320, #321, #323, #325, #326, #327, #328, #329, #331, #342, #343, #345, #346, #347, #381, #384, #388, #389, #390, #403, #404, #406, #409, #410, #411, #418, #431, #435, #440, #442, #523, #536, #754, #997, #1047.
- **CC-A's four:** #439, #575, #596, #613. **And #532.**

A first survey of their heads: most are June–July findings from Phase-19 batches (P19-B3 … B8, the reorg, B-STORAGE-HARDEN, B-LANGSTON-QUEUE), several are dead-code notes whose code may since have been deleted, and several name a home batch that has since closed. **So many are likely closed or dissolved already, with the head never updated** — which the census cannot tell from a live issue.

## 1.a ARCHITECTURAL READ
No component changes: this batch edits `RUNNING_ISSUES.md` and the sprint plan only. `SYSTEM_IMPACT_MAP.md` and `SYSTEM_MANUAL.md` are read per issue where an issue names a component (to tell whether the thing it describes still exists), not changed — unless an issue turns out to be a live defect, which then gets its own placed home rather than a fix here.

## 1.b PROVENANCE READ
- **The owner predicate** — `census.mjs` `ownerOfIssue`, `B-PLAN-CURRENCY-CHECK` (CLOSED 2026-09-30): first match wins — an `OWNER` word followed within 30 characters by a session name; a `HOME` line naming a session; the filer in the head; else unknown. Disposition (1): correct, and it is what OBJ-2 is graded against.
- **The placement predicate** — `census.mjs` `placement`: an issue is placed when the plan names it by number, or its `HOME` line names a batch that is in a plan list and not closed, or it is parked/roadmap. Disposition (1).
- **Each issue's own provenance** is read at Step 2, per issue: its entry, the batch that filed it, and `git log -S "#<n>"` for anything that closed or superseded it.

## 2. METHOD (per issue)
1. Read the whole entry and its history; search the ledger and later batches for its number and its component (`§9.5(b-ii)`).
2. Decide ONE outcome, each with a citation a reader can check without me:
   - **CLOSED** — the thing was done; cite the commit or batch that did it.
   - **WITHDRAWN** — it dissolves (the code it describes is gone, or a later decision supersedes it); cite what dissolves it (§9.4 disposition 5).
   - **PLACED** — still live: an owner by the §6 grouping (prices and the exit price path → CC-C; signals, strategies, SQE, RTB, learning data → CC-B; identity, servers, restarts, deploys, security, diagnostic screens → Infra Claude; trade records and costs, scores, regimes, gates, risk controls, the live engine → CC-A), and a `HOME:` line in the plan's form — an item on an existing plan row where one fits, a new row only where none does.
3. Write it into the entry, in place: the head's status word updated, and one line `W41 TRIAGE (CC-A, <date>): <outcome> — <citation>; HOME: …`. **Edit in place, never stack** (`#753`), quoting any home line it replaces.

## 3. OBJECTIVES

| # | objective | check |
|---|---|---|
| **OBJ-1** | Every one of the 60 has an outcome and its citation written into its entry | a script lists the 60 and finds the `W41 TRIAGE` line in each — 60 of 60 |
| **OBJ-2** | None of the 60 is left OPEN-and-unplaced, and none is ownerless | the census's own `ownerOfIssue` and `placement` run over the ledger and plan at the close commit: 0 of the 60 in the unplaced list (control: the same run at `be41f8585` lists all 55 + #439/#575/#596/#613) |
| **OBJ-3** | Every issue placed on another session's row or given to another session is handed over by number | one post per session, by id; owners may disagree, and a disagreement re-opens that item only |
| **OBJ-4** | CC-A's four are decided: `#439` re-measured or homed with its measurement; `#575`/`#596` settled with CC-B (the ledger says CC-A, their plan rows say CC-B); `#613`'s owner confirmed | each carries its decision and who agreed it |
| **OBJ-5** | `#532`'s head no longer reads CLOSED before its final OPEN | the census's self-contradiction list no longer contains it |

## 4. OUT OF SCOPE
- Fixing any defect found live — it gets a placed home, not a fix (rule 23's fix-on-find applies only where the fix is trivial and sits in a batch already open; none does here).
- The other owners' unplaced items (handed over at W41; theirs to place).
- Renumbering reused numbers (row 1f).

## 5. OBSERVATION
None. OBJ-2 is graded by running the census's own functions at the close commit; next Monday's census (W42) confirms it independently, but the close does not wait for it.
