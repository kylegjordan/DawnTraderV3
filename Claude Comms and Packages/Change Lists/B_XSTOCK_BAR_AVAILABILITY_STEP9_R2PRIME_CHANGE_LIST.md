# B-XSTOCK-BAR-AVAILABILITY — Step 9 R2': change list for the Step-4 diff review

**Header (Step-4 dispatch fields):**
- **(i) Declared change-class:** `architecture` (scope header, `Scope Files/B_XSTOCK_BAR_AVAILABILITY_SCOPE.md:3`).
- **(ii) Doc set for that class, row by row:**
  - scope `Scope Files/B_XSTOCK_BAR_AVAILABILITY_SCOPE.md`: **present**.
  - pre-audit `Scope Files/B_XSTOCK_BAR_AVAILABILITY_PRE_AUDIT.md`: **present**; this round's audit and plan are its new section `### Step 9 R2' - the second re-run window`.
  - completion report: **absent** (batch open at Step 9).
  - `BATCH_CATALOG`, `PHASE_HISTORY`, System Manual, System Impact Map: **owed at Step 10** (unchanged from the R7/R7b list; R2' adds only the new window date to them).
  - `DEPLOY_WINDOWS.jsonl` and `GOVERNANCE_EXCEPTIONS.md`: **present in this diff** (one row each).
- **(iii) Step 2:** the pre-audit section above, at the commit below. The plan implements r6 R2' as ruled at `1573143973550096385` (midnight Monday start) and carries C6-ruling condition 3 (`1573271063721287783`).

**Commit:** `aa012205c` as committed locally (subject `B-XSTOCK-BAR-AVAILABILITY R2': register the second re-run window at 2026-11-30T00:00:00Z`); the sha as pushed is in the dispatch if a rebase moves it. One commit, eight files, +94/−17, all mine.

| file | change |
|---|---|
| `drizzle/migrations/2026-11-22-b-xstock-bar-availability-window-r2prime.sql` | NEW +28: DO block, UPDATE `graded_window_start` to `2026-11-30T00:00:00Z`, `updated_by='b-xstock-bar-availability-r2prime'`, aborts unless exactly 1 row changed |
| `drizzle/migrations/2026-11-22-b-xstock-bar-availability-window-r2prime-rollback.sql` | NEW +9: restores `2026-11-09T00:05:00Z`, distinct `updated_by`; tracked, not in MANIFEST |
| `drizzle/migrations/MANIFEST.txt` | +1, after `2026-11-20-b-entry-gate-inc-c.sql` |
| `server/scripts/b-xstock-bar-availability-capacity-gate.ts` | +6/−5: `EXPECTED_GRADED_WINDOW_START = '2026-11-30T00:00:00.000Z'`, usage line |
| `server/tests/unit/b-xstock-bar-availability-observation.test.ts` | the R2 case becomes the R2' case (+39/−17) |
| pre-audit, `DEPLOY_WINDOWS.jsonl`, `GOVERNANCE_EXCEPTIONS.md` | +21, +1, +1 |

## The load-bearing hunks

Gate constant (BEFORE / AFTER):
```ts
-const EXPECTED_GRADED_WINDOW_START = '2026-11-09T00:05:00.000Z';
+const EXPECTED_GRADED_WINDOW_START = '2026-11-30T00:00:00.000Z';
```
Migration core:
```sql
UPDATE module_constants
   SET value = to_jsonb('2026-11-30T00:00:00Z'::text),
       updated_by = 'b-xstock-bar-availability-r2prime', updated_at = now()
 WHERE module_name = 'xstock_bar_availability'
   AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
   AND constant_name = 'graded_window_start';
GET DIAGNOSTICS n = ROW_COUNT;
IF n <> 1 THEN RAISE EXCEPTION 'graded_window_start: expected exactly 1 row, updated %', n; END IF;
```
The test asserts: constant and row value equal by `toISOString()`; Monday (`getUTCDay()===1`) at 00:00Z; the usage line names the new start and neither old one; the guard text and `updated_by`; the rollback's values; the R2 rerun migration still reads 11-09; the r2prime MANIFEST index is after the R2 rerun; no rollback file is in MANIFEST.

**Verification at my clone:** vitest 28/28 (gate-read 20, observation 8). No runtime code path changed beyond the one literal.

## What each reader does with the new start (census at the ref, tests excluded)
- **Gate** (`capacity-gate.ts:444-462` at this commit): reads the row, requires it to equal both `--window-start` and the constant (`:461-462`). Both move in this commit.
- **Verdict runner** (`verdict-runner.ts`, `decide()`): final gate = start + 9 d 10 min = **2026-12-09T00:10Z**; before it, `not-due`; the key becomes `xstock-bar-availability-capacity-verdict:2026-11-30T00:00:00.000Z`, so the verdict already stored for the 11-09 key does not block it.
- **R7b hold** (`xstock-revision-verdict-hold.ts`): with a future start it holds nothing until 11-30; from then it holds partitions overlapping [11-30, 12-09) until a verdict exists, capped at 3 days.
- **Archival health** (`b-storage-archival-health.ts:191-201`): runner log liveness only; no coupling to the start.

## Judgement calls I want attacked
1. **11-30, not 11-23.** By my count 11-23 holds four complete venue sessions (Thanksgiving 11-26, half day 11-27) and would FAIL, spending the one-shot key; 11-30 holds six for the five required. ⚠️ **NOT RE-READ: the session count was not routed to a second reader.** Please re-count it.
2. **00:00Z, not R2's 00:05Z**, per the r6 "midnight" wording.
3. **Alert order at registration:** resolve `3306c5c3` as superseded FIRST (the store dedups on non-resolved rows with the same key), then create the new event-wait alert on `xstock-bar-availability-capacity-gate`, triggers 2026-12-09T00:45Z, metadata `supersedes: 3306c5c3`. `ba8b42e2` stays active and resolves only on the graded read.
4. **C6 condition 3** is graded at the first fire after registration (the 12-09 00:15Z cron): the CLI's end-to-end elapsed, read back from the stored verdict's timings.
