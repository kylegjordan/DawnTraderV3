# B-AFTERLIVE-TOTAL-RULE (#1180, row 1x) — CHANGE LIST (Step 4, r1)

| field | value |
|---|---|
| **(i) DECLARED CHANGE-CLASS** | `non_architecture` (scope header) |
| **(ii) THAT CLASS'S DOC SET** | SCOPE — **present**, `Claude Comms and Packages/Scope Files/B_AFTERLIVE_TOTAL_RULE_SCOPE.md` (r2 `10d1278b3`, approved with three conditions) · PRE_AUDIT — **present**, `…/B_AFTERLIVE_TOTAL_RULE_PRE_AUDIT.md` (`cd1d8c05d`, approved with D1-D5) · COMPLETION_REPORT — **absent**, Step 11 · BATCH_CATALOG, PHASE_HISTORY — **absent**, Step 10 · SYSTEM_MANUAL — **judged N/A**: nothing under server/, client/ or shared/ · SYSTEM_IMPACT_MAP — **owed at Step 10**: the census table (the after-live recount, `al`, and the (b′) clause now droppable) · CHANGES_AND_FIXES — **judged N/A**: crew tooling · RUNNING_ISSUES — **present** (`#1180`) · POST_AUDIT_ROADMAP, DELETED_COMPONENTS_LOG, ADJUSTMENT_FRAMEWORK — **judged N/A**: no roadmap item, nothing removed, no parameter · SPRINT_TO_LIVE_PLAN row 1x — **present** · memory + task list — Step 10 |
| **(iii) STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_AFTERLIVE_TOTAL_RULE_PRE_AUDIT.md` at `cd1d8c05d` (APPROVED 2026-10-08) |

**Two parts.** The list edits (P1) on `migration/aws-supabase` at `baf9ed3a7`. The census code (P2-P4) on the review branch `migration/b-afterlive-total-rule` at `30f48445b` — NOT on `aws-supabase`; 2 files.

## P1 — the named set, at `baf9ed3a7` (OBJ-3: nothing else changed; diff 7+/7−)
`:5` `**After live: 212** (+6 moved to the sprint; …)` → `**After live: 224** (+6 moved to the sprint, +4 struck through; …)` (D4: the same answer as the headline) · `:27` `218 … (+6 moved to the sprint, listed below)` → `224 … (+6 moved to the sprint, +4 struck through, listed below)` · `:29` `(3). Recounted 2026-09-30: 221 − 6 − 3 = 212.` → `(4). Recounted 2026-10-08: 234 − 6 − 4 = 224 (the weekly census re-counts it since …)` · `:31` AMR `(+6 moved to the sprint)` → `(+6 moved to the sprint, +1 struck through)` · `:75` 72 → 73 · `:154` 21 → 22 · `:261` 5 → 6.

## P2-P3 — `census.mjs`
- **`recountAfterLive(text)`** (pure): `- ` lines at column 0 between `## After live` and the next `## `; MOVED = the arrow and `MOVED`; struck = starts `- ~~`. **D2:** only `- ` lines are subtrahends (the `:29` rule line contains "➡️ MOVED"). **D3:** a both-marked line is subtracted once, listed in `bothMarked`, raises `al`. Partial strikes counted live and listed. Orphan bullets (before the first `###`) and unparseable stated counts listed. Checks: each theme, the headline, the `:5` summary against the rule; the **sum of the stated theme counts against the stated headline**. **D1:** `al` = disagreements + partial strikes + both-marked + orphans + unparseable.
- **Wiring:** `runCensus` reads the file once (`afterLiveText`) for `parseAfterLive` and the recount; result `r.afterLive`. `censusCounts` gains **scalar `al`** (unconditional). `censusLists.al` = the detail (or `null`). Dry run: one `(g′)` line. No body prose, no alert flag, no dedupe key — it rides the week-keyed census row.
- **D5:** `po` unconditional — the guard's only reason (P45 lacking the key) is removed in this commit; the comment says so.
- **Condition-1 note:** beside `censusCounts`, the slice is full; the 300 is Discord's display truncation (`scripts/system-alerts.ts:87`), not a store limit.

## ⚠️ A REAL OVERRUN THE FIXTURE GAP WAS HIDING — found by your Step-1 condition 2, fixed here
With `placedOwnerless` added to P45, `censusAlert` **threw**: measured, the maximum body with the (b′) clause is **1,018** characters (992 without it). The clause was added by `B-CENSUS-OWNERLESS-REMAINDER` (`d728f903d`, mine) and the fixture could not see it — at maximum sizes the whole weekly census would have refused. Fix: `lineFor` gains `withPo`; a last rung `lineFor(0, false, false)` drops the (b′) clause after the handover clause (its count stays in `po`). `MISTAKE:` trailer on the commit.

## P4 — tests (`census.test.mjs`: **194 passed, 0 failed**; was 183)
A1 consistent file → `al` 0 (and the rule line not subtracted) · A2 theme off by one · A3 headline · A4 `:5` summary · A5 the theme sum · A6 both-marked (once, listed, `al`) · A7 partial strike (counted live, listed, `al`) · A8 orphan · A9 unparseable · A10 no heading refuses. P45 now carries `placedOwnerless` + `afterLive`, asserts `al` and `po` are present, and prints: **`P45 lengths: body 992/1000 · counts object 272 chars, ends at metadata char 282/300`**. Mutations (each restored): drop the sum check → only A5 fails; drop the orphan leg → only A8; drop the both leg → only A6. Poller 443/0. **CI on the review branch:** run `37749357216` at `30f48445b` — TypeScript Check ✅ · Test Suite ✅ · Build ✅ · Docker Build ✅.

## P5 — measured with the new code (dry run, review-branch `census.mjs`)
- at `cd1d8c05d` (before P1): `(g′) … headline stated 218 vs rule 224 · al 6` — L75 72/73 · L154 21/22 · L261 5/6 · L27 218/224 · L5 212/224 · the theme sum 221 vs headline 218.
- at `baf9ed3a7` (after P1): `(g′) … headline stated 224 vs rule 224 · al 0 · agrees`. **OBJ-1's proof is this same function.**

## JUDGEMENT CALLS TO ATTACK
1. The (b′) clause drops LAST (after the handover clause) — it is the newer clause, and its count is in `po`.
2. The sum check uses STATED values (themes vs headline); the recount values sum by construction except for orphans, which have their own leg.
