# B-XSTOCK-SNAPSHOT-RETENTION — Step 7 dry-read correction

## Live finding

The first registered staging read ran through the production kernel-lock launcher at deployed ref
`5b628af9fbd3527ab874bed20fb958e5e2bc838f` with mutation disabled.

- Run id: `c82fb1fa-f480-4e58-b2da-bb6a9e28c83c`.
- Frozen cutoff: `2026-10-12T00:00:00.000Z`.
- The 15-minute lane declared 100 eligible day objects, completed 32 exact exports, then stopped its table on `canceling statement due to statement timeout`.
- The 60-minute lane completed all 111 eligible day objects.
- Terminal result: `snapshot_failed=1`, `snapshot_deleted=0`; both tables reported `vacuum_count=0 rows_deleted=0`.
- Positive control: the same live role reports `statement_timeout=2min`; the 60-minute objects and the first 32 fifteen-minute objects proved that the exporter and evidence output were executing before the cancellation.

The run therefore refused safely but did not satisfy the full dry-read gate. Mutation stays disabled and no supervised cleanup may begin on this ref.

## Correction for review

`server/scripts/b75-retention-sweep.ts` now gives only the dedicated snapshot sweep clients explicit finite bounds:

- server `statement_timeout = 300000 ms`;
- pg client `query_timeout = 310000 ms`, deliberately later than the server cancellation;
- the final writer-excluding compare/delete **statement** remains server-bounded by `SET LOCAL statement_timeout = '5s'`, after a separately bounded `lock_timeout = '1s'`; this is not claimed as a five-second whole-transaction wall clock;
- each table header prints both client bounds, and every dry object prints `export_ms` so the live run measures the bound instead of relying on configuration prose.
- if another snapshot export fails, the preserved error class now also names the exact stage (`observation`, `schema`, `source_count`, `cursor_declare`, `cursor_fetch`, `gzip_finalize`, `row_count_gate`, or `commit`) instead of leaving count/declaration/fetch indistinguishable.

`server/tests/unit/b-xstock-snapshot-retention.test.ts` pins the two bounds and their order, constructs the actual standalone client and reads back both effective connection parameters, drives a canceled cursor fetch and checks its stage label, and retains the existing ordered-query proof that the delete path applies the separate five-second mutation statement bound.

## Local evidence

- Focused unit suite: 30 passed; Linux-only process lock tests 3 skipped on Windows; database integration tests 6 skipped without the integration database.
- Whole-tree database-client census: the new B75 snapshot client is the third one-connection client with ordered server/client bounds; the census pin now counts all three.
- TypeScript baseline: current 324 errors, baseline 324 errors, no regression.
- `.claude/launch.json` remains untracked and untouched.

## Required live recheck

The five-minute value is a bounded retry justified by the measured two-minute cancellation; it is **not** treated as proof that the backlog now completes. Transient contention, plan/I/O variance, repeated ranking cost, and a recurrence above five minutes remain possible until the same live read passes.

After review, four-job CI and exact-ref redeploy, rerun the identical `server/scripts/b75-retention-run.sh --snapshot-only` path with mutation still disabled. The gate requires all 100 fifteen-minute and all 111 sixty-minute objects to complete, both tables to report zero deletes/zero vacuums, and `snapshot_failed=0` before any apply run is allowed.

REVIEWER: claim-only · what objects settle whether the inherited two-minute bound caused the failure and whether the dedicated 300/310-second client bounds preserve the five-second delete gate; what other states remain consistent · HIT: completion and exact canceled statement were unproven, five seconds bounded a statement rather than whole transaction, and the original test did not exercise client construction · re-derived yes — live role `SHOW statement_timeout=2min`, run/alert `c82fb1fa…`/`b54dd656…`, source/test objects; claims narrowed, actual client constructed in test, stage logging added, same live rerun retained as the completion gate
