# B-EXPECTANCY-TUNING-ROWS-RETIRE — change list (Step 4)

## Dispatch header
| # | field | value |
|---|---|---|
| i | change-class | `non_architecture` (scope r1, ratified by Langston at Steps 1 and 2) |
| ii | doc set | scope present (`B_EXPECTANCY_TUNING_ROWS_RETIRE_SCOPE.md` r1) · pre-audit + plan present (`B_EXPECTANCY_TUNING_ROWS_RETIRE_PRE_AUDIT.md` r1, Step 2 APPROVED 01:56Z) · running_issues present (`#1156`) · `CURRENT_SETTINGS_REGISTRY` + `LEVER_INVENTORY` edited in this commit (P4, P5) · DELETED_COMPONENTS_LOG + SIM + `#1156` close = Step 10 (P7) · SYSTEM_MANUAL judged N/A (no architecture or math change — three unread rows) |
| iii | Step 2 | `B_EXPECTANCY_TUNING_ROWS_RETIRE_PRE_AUDIT.md` (Langston APPROVED 2026-10-07 01:56Z, three conditions) |

## The change
- **`drizzle/migrations/2026-10-07-b-expectancy-tuning-rows-retire.sql`** (P1, `git add -f`) — `DELETE FROM module_constants WHERE module_name='expectancy_tuning' AND constant_name IN (the three)`, `lock_timeout 5s`. Header: what, why, both forward-safety reasons (ancestry; build → `db:migrate` → restart, `SYSTEM_MANUAL.md:13234`), the rollback order.
- **`…-rollback.sql`** (P2, `git add -f`, NOT in MANIFEST) — re-INSERTs 0.4 / 0.5 / 0.6 at `(*,*,*,*)`, `updated_by='b-expectancy-tuning-rows-retire-rollback'`; deletes its own `_migrations` row.
- **`drizzle/migrations/MANIFEST.txt`** — one line, the forward file (LF, matching the file's tail).
- **`server/tests/integration/b-expectancy-tuning-rows-retire.test.ts`** (P6 as amended by C1) — DB leg on the migrated CI database: `expectancy_tuning` count = 0, control `roi_gating` > 0 (CI's DB is built from migrations, so the control is presence, not staging's 10); prints `DB leg MEASURED` or `SKIPPED — not passed` (rider a); CI-fail if Postgres is unreachable in CI. TEXT leg on the forward file (exactly the module + three names). **TEXT-ONLY** leg on the rollback, labelled so (rider b). CODE leg: `PREFETCH_MODULES` lacks the module, control `roi_gating`. The two MANIFEST assertions were dropped — `validateManifest` already hard-fails both cases (`db-migrate.ts:120-148`). Local run: 4 passed, DB leg skipped (no local Postgres) — CI is the measurement.
- **`CURRENT_SETTINGS_REGISTRY.md`** (P4, C2) — the heading now reads RETIRED / 0 rows; the inc2a-form annotation; the three rows struck through. No regeneration.
- **`LEVER_INVENTORY.md`** (P5, C3) — B72-CORE-008/009/010 in the `:281` inc2a form: every cell struck, a RETIRED note naming the deleted reader and `DELETED_COMPONENTS_LOG.md`.
- **`SPRINT_TO_LIVE_PLAN.md` row 164** — your §13 item (the stale `SYSTEM_MANUAL:12734` cite in `dt-deploy.sh:221`). ⚠️ You named the owner CC-B; the row's owner is **Infra Claude** — placed there as an item, the owner unchanged.

## Ancestry (your Step-4 check)
`git merge-base --is-ancestor d4c688b88 <this head>` → true (run before commit). This batch rides row 4a's deploy or a later one; never before 2026-10-07T15:53Z (`#1154`).

## What changes at runtime
Nothing reads the rows. The 60 s refresher may re-read the cached module once in the old process during the deploy window and get 0 rows — inert (pre-audit A3). Boot: the module is not prefetched since `d4c688b88`.

## Rollback order (also in the migration header; goes into the carrying deploy's release record at Step 6)
To roll code back past `d4c688b88`: run `2026-10-07-b-expectancy-tuning-rows-retire-rollback.sql` FIRST, then deploy the older sha.
