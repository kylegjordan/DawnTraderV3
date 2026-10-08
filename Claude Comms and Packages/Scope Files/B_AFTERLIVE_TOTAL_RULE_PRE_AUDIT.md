# B-AFTERLIVE-TOTAL-RULE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2, r1)

change-class: non_architecture · **Owner:** CC-A (OLD Claude) · **Plan row:** `SPRINT_TO_LIVE_PLAN.md` 1x · **Issue:** `#1180` · **Scope:** r2 `10d1278b3`, **APPROVED by Langston 2026-10-08 with three in-commit conditions** (folded below). `path:line` at `10d1278b3`.

## PREVIOUSLY STATED → NOW
- **PREVIOUSLY STATED (scope r2 OBJ-2): the body cap is the binding limit. NOW: the binding limit for a counts key is the P45 300-character metadata-slice assertion** (`census.test.mjs:442-445`, implementing `scripts/system-alerts.ts:87`); `censusCounts` is metadata and costs no body characters. REASON: Langston condition 1, measured: live shape 285/300; `+ "al":9999` 295 (fits); `+ "al":[x,y]` 302 (over) ⇒ **`al` ships as a SCALAR**.
- **PREVIOUSLY STATED (scope r2 OBJ-3): "six count cells". NOW: the named set in §2 P1** — five numeric cells, one sentence (`:29`, its count AND its arithmetic), two parentheticals. REASON: condition 3.

## 1. AUDIT

### A. The file (source 1, read at `10d1278b3`)
Block `## After live` = `:27`–`:285`, next `## ` at `:287`. 234 `- ` lines · 6 `➡️ … MOVED` · 4 struck (`:56`, `:88`, `:130`, `:133`) · 0 both · 0 partial strikes · 0 indented bullets · 0 arrow-without-MOVED · 0 MOVED-without-arrow (Langston re-derived). Rule result 224; per theme 25/6/73/22/78/6/14.

### B. The census (source 1)
- `parseAfterLive` `:395` (lines → items; placement and owners) — reads the LINES; nothing reads the counts.
- `runCensus` `:578` reads the file once (`:590`); the §6 recount runs at `:627-629`, its result is `r.g`.
- `censusCounts` `:648` — metadata, unconditional except two guarded keys: `po` (`:660`, guarded only for hand-built objects) and `hv`. `censusLists` carries the full lists; `censusAlert`'s `lineFor` (`:701-729`) builds the body and never reads `censusCounts`.
- **P45** (`census.test.mjs:418-446`): a hand-built maximum-size result → body ≤ `CENSUS_BODY_MAX` (1000) and the counts object recovered whole from the first 300 characters of the metadata. ⚠️ **It omits `placedOwnerless`**, so `po` is absent from the object CI measures while `runCensus:637` always sets it — a 10-character gap (Langston condition 2; my own `B-CENSUS-OWNERLESS-REMAINDER` left it so).

### C. Sources read
1 code + the file (above) · 2 no runtime/DB read needed (a file + the census) · 3 SIM — the census table (owed at Step 10: a recount of the after-live list) · 4 System Manual N/A · 5 `#1180`, `#1167`, `B-PLAN-CURRENCY-CHECK` (`recountS6`) · 6 `bridge/canonical/` N/A (the file is 2026-09-28).

## 2. PLAN (each item → its finding)
| # | item | from |
|---|---|---|
| **P1** | **The named set of edits to `PRE_LIVE_SPRINT.md` (condition 3):** `:27` 218 → 224 and its parenthetical `(+6 moved to the sprint, listed below)` → `(+6 moved to the sprint, +4 struck through, listed below)` (IN, by OBJ-1's consistency rule) · `:31` AMR `(+6 moved to the sprint)` → `(+6 moved to the sprint, +1 struck through)` · `:75` 72 → 73 · `:154` 21 → 22 · `:261` 5 → 6 · `:5` "After live: 212" → 224 · `:29` "(3)" → "(4)" and `221 − 6 − 3 = 212` → `234 − 6 − 4 = 224` with the recount date. Nothing else. | §A, OBJ-1, OBJ-3 |
| **P2** | `census.mjs`: pure `recountAfterLive(text)` → `{ themes: [{heading, stated, recount, line}], headline: {stated, recount}, summary5: {stated, recount}, partialStrikes, disagree: [...] }` — the rule as written; MOVED and struck mutually exclusive (a line that is both counts once, as MOVED); a `~~` not at the line start counted live and in `partialStrikes`. `stated` parsed from the leading integer after `— ` (headings) and after `After live: ` (`:5`). | OBJ-2 |
| **P3** | wiring: `runCensus` computes it from the same text it already reads (`:590`); `censusCounts` gains **scalar `al`** = `disagree.length` (unconditional); `censusLists` gains `al` = the disagreement detail + `partialStrikes`; the box file carries both (it writes the lists). No (g) prose, no alert flag, no new dedupe key. Dry run prints one line: `after-live recount: agrees` or each disagreement. | OBJ-2, condition 1 |
| **P4** | tests (`census.test.mjs`): a planted off-by-one in a theme, the headline and `:5` each reported (positive controls); MOVED, struck, both-at-once (counted once), partial strike (counted live AND reported) — fixtures, not the live zeros (Langston record item iii); **P45 gains `placedOwnerless` and the new `al`** (condition 2) and the change list prints both lengths: the body and the metadata slice | OBJ-2, conditions 1-2 |
| **P5** | measured on the live file before it ships: dry run at `10d1278b3` lists 5 disagreements (headline, three themes, `:5`); at the close commit, **`recountAfterLive` itself** reports 0 (OBJ-1's proof — one implementation) | OBJ-1, OBJ-2 |
| **P6** | Step 10: SIM census table (the after-live recount and the `al` key) | §C |

## 3. JUDGEMENT CALLS TO ATTACK
1. The headline parenthetical gains "+4 struck through" (P1) — the consistency rule applied to the headline too; it changes a heading's wording, not only a number.
2. A line that is both MOVED and struck counts once, as MOVED (0 today; a fence).
3. `al` counts disagreeing headings (each theme, the headline, `:5`), not the size of each gap — the gap is in the lists.
