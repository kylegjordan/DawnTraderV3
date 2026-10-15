# B-ENTRY-CONSUMPTION-FRESHNESS — Step 3 implementation change list r1

**Base:** `e3fb8157b62392829cdd4238222cc42ada94b90c`
**Step:** 3 of 11 — implementation

## Changed

1. `server/services/execution/depth-source.ts`
   - captures one process-monotonic anchor before every crypto/xStock source read, including the xStock last-two-sided fallback;
   - preserves the existing xStock compatibility clamp while carrying whether the source age was actually finite/non-negative;
   - adds the pure consumption-freshness decision with exact-boundary pass, stale refusal, and invalid-clock refusal.
2. `server/services/active-execution-engine.ts`
   - carries the exact first-gate age limit on the passing result;
   - checks the same snapshot after all awaited work and immediately before the sole immediate `openOrder` call;
   - covers direct taker and maker→taker, excludes pending-maker placement, emits structured pass/block evidence, and writes the admitted consumption age.
3. `server/services/rtb-metrics-service.ts`
   - adds and zero-initializes the distinct `CONSUMPTION_FRESHNESS` open-failure stage.
4. `shared/schema.ts`
   - adds nullable `entryBookConsumptionAgeMs` beside the unchanged first-gate age.
5. `drizzle/migrations/2026-10-15-b-entry-consumption-freshness.sql`
   - adds nullable `closed_trades.entry_book_consumption_age_ms` with no default and no backfill, plus the live database comment.
6. `drizzle/migrations/MANIFEST.txt`
   - registers the forward migration.
7. `scripts/codex-export/export-data.sql`
   - exports the new raw provenance field beside `entry_book_age_ms`.
8. `server/tests/unit/b-entry-consumption-freshness.test.ts`
   - proves the boundary/elapsed/invalid matrix, wall-clock independence, pre-read source anchors, xStock compatibility-clamp refusal, delay mutations with a side-effecting fake placer, sole-call dominance, arm coverage, stage initialization, and schema/migration/export contract.
9. `server/tests/unit/p19-b4b1-depth-gate.test.ts`
   - updates the typed snapshot fixture for the required anchor and source-age-validity fields.

## Verification run before commit

- targeted unit suite: 4 files, 75 tests passed;
- TypeScript baseline gate: 335 current vs 337 baseline, zero regressions above baseline; the two absent errors are pre-existing `partition-exporter.ts` baseline entries and no changed file is involved;
- `git diff --cached --check`: passed after explicit-path staging.

## Explicit non-changes

- no change to the DB-governed 5,000 ms crypto or 15,000 ms xStock limits;
- no source timestamp fabrication and no claim to repair skew already embedded in a source age;
- no snapshot replacement or second book read;
- no pending-maker later-fill, exit-fill, RTB-refresh, liveness, VPG/VOG, session, or spread policy change;
- no backfill and no reinterpretation of `entry_book_age_ms`;
- `.claude/launch.json` remains untouched.
