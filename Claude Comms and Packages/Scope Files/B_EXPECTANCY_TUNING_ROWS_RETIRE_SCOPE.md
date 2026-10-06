# B-EXPECTANCY-TUNING-ROWS-RETIRE — SCOPE r1 (sprint row 4a2, `#1156`)

change-class: non_architecture

**Owner:** CC-C (ANALYST Claude). **Placed:** `SPRINT_TO_LIVE_PLAN.md` row 4a2, after row 4a (`B-VTS-TELEMETRY-AGGREGATES`). **Origin:** Langston, row-4a scope r1 condition C3 (2026-10-06) — *row 4a removes the code and the boot prefetch; this removes the rows.*
**Facts below read 2026-10-06 ~21:40Z, code at `origin/migration/aws-supabase` `612547ed0` (contains row 4a's Step-3 commit `d4c688b88`), DB on staging.**

## What this is for
Three settings in `module_constants`, module `expectancy_tuning`, were read by exactly one function, `getAdjustedMinROI`. Row 4a deletes that function (zero callers) and stops the boot warm-up prefetching the module. After 4a the rows are settings nothing reads — rule 18 says they go, not linger, because a lingering setting looks live to whoever reads `CURRENT_SETTINGS_REGISTRY` or `LEVER_INVENTORY` and invites someone to tune a dial that is connected to nothing.

## The rows (staging, read 2026-10-06)
| constant | value | scope | updated_by | updated_at |
|---|---|---|---|---|
| `winrate_floor_low` | 0.4 | `(*,*,*,*)` | `b72-step3-commit-b` | 2026-05-05 15:24:26Z |
| `winrate_threshold_medium` | 0.5 | `(*,*,*,*)` | `b72-step3-commit-b` | 2026-05-05 15:24:26Z |
| `winrate_threshold_high` | 0.6 | `(*,*,*,*)` | `b72-step3-commit-b` | 2026-05-05 15:24:26Z |
Exactly 3 rows (control: `roi_gating` reads 10 by the same query). Unchanged since seeding — no operator ever tuned them.

## Provenance (1.b, TIER 1 — this batch changes the rows)
Corpora searched: `RUNNING_ISSUES.md`, `BATCH_CATALOG.md`, the completion reports (by module name and by constant name), `git log -S` (not path-limited), the migrations.
- **The logic:** Directive 11.7B Task 4 (`5c95f5612`) — an adaptive ROI boost keyed to VTS win rate. Its chain (`getAdaptiveExpectancy` → `getAdjustedMinROI`) had no caller outside itself (row-4a pre-audit A5).
- **The rows:** B72 moved hard-coded levers into the DB. Seeded by `drizzle/migrations/2026-05-05-b72-lever-sweep.sql:42-46` (applied on staging 2026-05-18), also present in `2026-04-22b-initial-seed-data.sql:165-167`; read wired by `d13977022`, quoted: *"expectancy.ts: getMinROIForRegime() (5 per-regime), getAdjustedMinROI() winrate floors (3) … Modules: roi_gating, expectancy_tuning, expectancy_gates. … All reads via getCachedNumberRequired (no silent fallback)."* B72 promoted every literal it found; it did not ask whether the function holding the literal had a caller.
- **Disposition: (5) disconnected and should be removed** — the reader is gone with row 4a and nothing else reads them (census below).

## Reader census at the ref (tests excluded unless named)
- Name readers — `expectancy_tuning`, `winrate_floor_low`, `winrate_threshold_medium`, `winrate_threshold_high` across server, client, shared, scripts, audit and the tracked migrations: **zero code readers after `d4c688b88`.** Remaining mentions: `expectancy.ts:56` (a comment saying the module lost its reader), the row-4a test's fence (asserts the prefetch is gone), the two seed migrations, and docs (`CURRENT_SETTINGS_REGISTRY.md:172-178`, `LEVER_INVENTORY.md:60-62`, `CHANGES_AND_FIXES.md:901` historical).
- Whole-table readers that would simply show fewer rows: `server/scripts/dump-settings-registry.ts` (regenerates the registry), the admin/diagnostics surfaces. Step 2 confirms none of them asserts a row count for this module.
- ⚠️ **The one coupling that matters — boot refuses on an empty prefetched module.** `b72-warmup.ts` throws when a module in `PREFETCH_MODULES` returns 0 rows (its own comment at the `cost_model` removal, `#133/#134`). Row 4a removes `expectancy_tuning` from that list, so after 4a an empty module is harmless — **but any code at or before the parent of `d4c688b88` refuses to start once these rows are gone.** ⇒ the rollback order is part of the deliverable (objective 3).

## Objectives
| # | objective | verification |
|---|---|---|
| 1 | A forward migration deletes exactly the three rows (`module_name='expectancy_tuning'`, the three constant names), registered in `MANIFEST.txt`, `git add -f`. | Migration text; on staging after deploy the query above returns 0 rows and the `roi_gating` control still returns 10. |
| 2 | A rollback in git beside it restores the three rows with their values and `updated_by`, and deletes its own `_migrations` row (the inc2a precedent). | Rollback text read against the table above. |
| 3 | Deploy and rollback ORDER stated in the migration header and in the change list: ships in row 4a's deploy or later, never with pre-4a code; **a code rollback to before `d4c688b88` runs this rollback first or the server refuses to boot.** | Header text; Step 2 confirms the boot refusal at the parent sha by reading `b72-warmup.ts` there. |
| 4 | Docs: `CURRENT_SETTINGS_REGISTRY.md` loses the `expectancy_tuning` section (regenerated or edited to match); `LEVER_INVENTORY.md:60-62` rows marked retired with this batch; `DELETED_COMPONENTS_LOG.md` entry; `#1156` closed. | Step 10 ledger. |
| 5 | Boot is clean after the deploy: the warm-up line lists no `expectancy_tuning` and no warm-up refusal. | PM2 `out.log` + `error.log` after the restart. |

## Not in scope
- The `2026-04-22b-initial-seed-data.sql` lines stay — applied migrations are history; on a fresh database the later delete removes what the seed inserted.
- Row 4a's own deploy timing (not before 2026-10-07T15:53Z, `#1154`). This batch rides that deploy or a later one.

## Plain-language summary
Three dials in the settings table controlled a feature that was never switched on. Row 4a removes the feature's code; this removes the three dials so nobody tunes something that does nothing. The one trap: older code refuses to start if those dials are missing, so the undo instructions must say "put the dials back before rolling the code back."
