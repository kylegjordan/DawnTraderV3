# B-CENSUS-OWNERLESS-TRIAGE — SCOPE (Step 1, r2)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1n**, after row 1m · **Issue:** `#1139` · **Placed by:** Langston, W40 census handling A3 (2026-09-30), §9.4 disposition 4 — a review.

## STEP-1 r1 → r2 (Langston SENT BACK 2026-10-06 ~23:0xZ; both blockers and three conditions folded)
- **BLOCKER-1 (OBJ-2's control was false):** five of the 60 — `#439`, `#575`, `#596`, `#613`, `#532` — already resolve to an owner (CC-A) and a placement, so OBJ-2 read 0-of-60 for them before any work. **Fixed:** OBJ-2 now covers the 55 only; those five are graded by OBJ-4 and OBJ-5, which name a decision, not a census state.
- **BLOCKER-2 (OBJ-2 is satisfiable by editing a status word):** a CLOSED or WITHDRAWN head drops an entry out of the census population, and nothing resolves its citation. **Fixed:** OBJ-1 is re-registered on the object — every citation must RESOLVE (§3) — and **OBJ-6 adds a non-author re-derivation of 10 of the 55, chosen by Langston after the dispositions are written**, weighted to CLOSED and WITHDRAWN. The census run stays as necessary-not-sufficient.
- **CONDITION 1 (8 predicate-blind entries):** `#174`, `#238`, `#345`, `#523`, `#536`, `#754`, `#997`, `#1047` name a session the census regex cannot see. **Rule now in §2: read the named session first and default to it; a departure states its reason in the triage line.** One departure is expected: `#523` names CC-B (the gates sweep's filer), and its remaining work is the `#522` pre-live gate on row 101, a gates item in CC-A's §6 group — the reason goes in its line.
- **CONDITION 2:** no Kyle-directed item is WITHDRAWN in this batch (`#174`, `#327`, `#997`); CLOSED or PLACED only.
- **CONDITION 3:** §6 is recounted in the close commit (it already disagrees at the ref: CC-C 77 vs 74, Infra 55 vs 56).
- **Found since (pre-audit §5, for the Step-2 ruling):** the census and the live plan-state check both skip 9 valid §4 rows whose ids are deeper than `\d+[a-z]?` (`2a0`…`2a2`, `3a1`, `4a2`); two of the 55 are placed on one of them.

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
2. **Read the session the entry itself names first, and default to it** (Langston condition 1); a departure for a §6 group states its reason in the triage line. Then decide ONE outcome, each with a citation a reader can check without me:
   - **CLOSED** — the thing was done; cite the commit or batch that did it.
   - **WITHDRAWN** — it dissolves (the code it describes is gone, or a later decision supersedes it); cite what dissolves it (§9.4 disposition 5). **Never for a Kyle-directed item** (`#174`, `#327`, `#997`) — dissolving one of his decisions is his call.
   - **PLACED** — still live: an owner by the §6 grouping (prices and the exit price path → CC-C; signals, strategies, SQE, RTB, learning data → CC-B; identity, servers, restarts, deploys, security, diagnostic screens → Infra Claude; trade records and costs, scores, regimes, gates, risk controls, the live engine → CC-A), and a `HOME:` line in the plan's form — an item on an existing plan row where one fits, a new row only where none does.
3. Write it into the entry, in place: the head's status word updated, and one line `W41 TRIAGE (CC-A, <date>): <outcome> — <citation>; HOME: …`. **Edit in place, never stack** (`#753`), quoting any home line it replaces.

## 3. OBJECTIVES

| # | objective | check |
|---|---|---|
| **OBJ-1** | Every one of the 60 carries an outcome whose citation RESOLVES | a script, over the 60: each CLOSED cites a sha that exists (`git cat-file -e`) and touches the named thing, or a batch whose completion report exists; each WITHDRAWN cites a file or line that exists at the ref; each PLACED has an owner and a HOME naming a §4 row or after-live line that exists and is not closed. **0 unresolved** (control: the script run on a deliberately bad citation reports it) |
| **OBJ-2** | None of **the 55** is left OPEN-and-unplaced or ownerless — necessary, not sufficient | the census's own `ownerOfIssue` and `placement` over the ledger and plan at the close commit: 0 of the 55 (control: the same run at `be41f8585` lists all 55 as unplaced with `owner ?`) |
| **OBJ-3** | Every issue placed on another session's row or given to another session is handed over by number | one post per session, by id; a disagreement re-opens that item only (Langston ruled this adequate, 2026-10-06) |
| **OBJ-4** | CC-A's four are decided: `#439` re-measured or homed with its measurement; `#575`/`#596` settled with CC-B (the ledger says CC-A, their rows are CC-B's); `#613`'s owner confirmed | each carries its decision and who agreed it, in its entry |
| **OBJ-5** | `#532`'s head no longer reads CLOSED before its final OPEN | the census self-contradiction list no longer contains it |
| **OBJ-6** | The dispositions survive a reader who did not write them | **Langston picks 10 of the 55 after the dispositions are written** (weighted to CLOSED and WITHDRAWN) and re-derives each from its citation; any he refutes is re-done and reported |
| **OBJ-7** | §6 agrees with the recount at the close commit | `recountS6` at the close sha: no diffs, stated Total = cell sum |

## 4. OUT OF SCOPE
- Fixing any defect found live — it gets a placed home, not a fix (rule 23's fix-on-find applies only where the fix is trivial and sits in a batch already open; none does here).
- The other owners' unplaced items (handed over at W41; theirs to place).
- Renumbering reused numbers (row 1f).

## 5. OBSERVATION
None. OBJ-2 is graded by running the census's own functions at the close commit; next Monday's census (W42) confirms it independently, but the close does not wait for it.
