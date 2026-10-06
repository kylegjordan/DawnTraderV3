# B-EXPECTANCY-TUNING-ROWS-RETIRE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2, r1)

change-class: non_architecture · row 4a2 · `#1156` · owner CC-C · scope r1 APPROVED by Langston 2026-10-06 23:13Z (three conditions, folded below).
Code read at `origin/migration/aws-supabase` `cd090a153`; DB on staging 2026-10-06 ~21:40Z.

## Previously stated vs now
**PREVIOUSLY STATED (scope objective 4): `CURRENT_SETTINGS_REGISTRY.md` "regenerated or edited to match". NOW: edited by hand — an annotation, never a regeneration. REASON: Langston C1 — `dump-settings-registry.ts:52` reads the whole live table, so a regeneration lands every unrelated value drift since the last dump as an unreviewed diff.**
**PREVIOUSLY STATED (scope objective 3): the order "stated in the migration header and the change list". NOW: also in the release record of the deploy that carries it. REASON: Langston C2 — someone rolling code back reads the release record, not a migration header (precedent `RELEASE_DEPLOY_2026-10-02_PREP.md:51,58`).**

## The audit — the six sources
| # | source | read | finding |
|---|---|---|---|
| 1 | Code at the ref | `server/startup/b72-warmup.ts` (whole); `server/services/module-constants-service.ts:125`, `:356`, `:514-528` (Langston); repo grep for the module name and the three constant names, tests and `.removed` excluded | **A1** zero code readers of `expectancy_tuning` or its three names; `expectancy_tuning` is not in `PREFETCH_MODULES` since `d4c688b88` (row 4a); `b72-warmup.ts:194-196` throws on a prefetched module with 0 rows. |
| 2 | Runtime + DB | staging `module_constants` (3 rows, control `roi_gating` 10); `_migrations` | **A2** the rows hold their 2026-05-05 seed values, never tuned; `2026-05-05-b72-lever-sweep.sql` applied 2026-05-18. |
| 3 | `SYSTEM_IMPACT_MAP.md` | the module-constants warm-up / refresher component | **A3** the 60 s background refresher re-reads every CACHED module: during the deploy window the old process may re-read `expectancy_tuning` and get 0 rows — `prefetchModule` does not throw on 0 and the refresher catches, and the only reader had zero callers even before 4a ⇒ inert (Langston, verified at `module-constants-service.ts:514-528`). |
| 4 | `SYSTEM_MANUAL.md` | the migrate-between-build-and-restart invariant (`:13234`; `dt-deploy.sh`'s comment still cites the old `:12734`) | **A4** `dt-deploy.sh` runs build → `db:migrate` → `pm2 restart` (read at the ref), so `dist/` already holds post-4a code before the DELETE runs — even a crash-restart in that window boots the new build. |
| 5 | Ledger | `RUNNING_ISSUES` `#1156`, `#133/#134` (the `cost_model` removal — same shape, `b72-warmup.ts:47-48`); `BATCH_72_COMPLETION_REPORT.md:33,139`; the inc2a retire migration + rollback | **A5** precedent: a retired module leaves `PREFETCH_MODULES` and its rows go by migration; inc2a's rollback restores rows and deletes its own `_migrations` row; rollbacks are never in `MANIFEST.txt` (db-migrate skips them by construction). |
| 6 | Provenance | `d13977022` (B72 Slice 2a, quoted in the scope); Directive 11.7B `5c95f5612`; `bridge/canonical/` — no coverage of `expectancy_tuning` (it postdates the corpus) | **A6** the rows exist because B72 promoted every literal it found; the function holding these literals never had a caller. Disposition (5). |
| — | CI | `b-price-side-8a-p4c-inc3-guard.test.ts` PREFETCH-completeness sweep | **A7** source-to-prefetch only, never the DB ⇒ a zero-row module is invisible to it; no CI interaction (Langston). No doc-sync gate reads `CURRENT_SETTINGS_REGISTRY.md` or `LEVER_INVENTORY.md`. |

**Census (§9.5(a)) of the three rows:** writers — the two seed migrations only; readers — none in code since `d4c688b88` (the archived `getAdjustedMinROI` was the one); mutators — none (never tuned); deleters — this batch; schedulers — the 60 s refresher re-reads cached modules only (A3). **Deletion-time state-write census (§9.5(a-ii)):** the migration writes only the deletion of these 3 rows; the one surviving whole-table reader is the registry dumper, a doc generator (A1, C1).

**Forward safety — two independent reasons (Langston C2):** (i) ANCESTRY — any sha carrying this migration carries `d4c688b88`, so a pre-4a code + this migration is impossible on deploy; (ii) SEQUENCE — A4 (`dt-deploy.sh` build → `db:migrate` → restart, `SYSTEM_MANUAL.md:13234`). **The one live hazard is backwards:** reverting 4a's code without first running this rollback restores a `PREFETCH_MODULES` entry over zero rows ⇒ boot refusal.

## The plan (every item points at its finding)
| # | item | from |
|---|---|---|
| P1 | `drizzle/migrations/2026-10-07-b-expectancy-tuning-rows-retire.sql`: `BEGIN; SET LOCAL lock_timeout='5s'; DELETE FROM module_constants WHERE module_name='expectancy_tuning' AND constant_name IN ('winrate_floor_low','winrate_threshold_medium','winrate_threshold_high'); COMMIT;` Header: what, why, the two forward-safety reasons, the rollback order. `git add -f`; one line in `MANIFEST.txt`. | A1, A2, A5, A4 |
| P2 | `…-rollback.sql` in git beside it: re-INSERT the three rows with their values and `updated_by='b-expectancy-tuning-rows-retire-rollback'`; `DELETE FROM _migrations WHERE name = '<forward file>'`. NOT in `MANIFEST.txt`. | A5 |
| P3 | Rollback ORDER, written in (a) the migration header, (b) the change list, (c) the release record of the deploy that carries it — the next release's PREP record, or, if 4a + 4a2 deploy on their own, my Step-6 deploy record: *"to roll code back past `d4c688b88`, run this rollback FIRST, then deploy the older sha."* | A1, C2 |
| P4 | `CURRENT_SETTINGS_REGISTRY.md:172-178`: annotate in place (the inc2a precedent at `:215`) — name the migration, say the rows are deleted and the section is kept for history. **No regeneration.** | C1 |
| P5 | `LEVER_INVENTORY.md:60-62`: mark B72-CORE-008/009/010 RETIRED with this batch + `#1156`. | A6 |
| P6 | Test: `server/tests/unit/b-expectancy-tuning-rows-retire.test.ts` — the migration text deletes exactly the three names under the one module; the rollback restores exactly the three values; MANIFEST lists the forward file and not the rollback; `PREFETCH_MODULES` does not list `expectancy_tuning` (control: it lists `roi_gating`). | A1, A5 |
| P7 | Step 10: `DELETED_COMPONENTS_LOG` entry (rows, archive = the rollback file), `#1156` closed, SIM row for the module-constants table (one module fewer). | §9.5(a-ii) |

**Step 7 reading:** after the deploy, `SELECT count(*) FROM module_constants WHERE module_name='expectancy_tuning'` = 0 with control `roi_gating` = 10; boot clean (no `[B72][warmup]` refusal in either stream); `_migrations` carries the forward file.

`REVIEWER: none spawned — every load-bearing claim here (A1, A3, A4, A7) was re-derived by Langston at Step 1; A4's sequence re-read by me at the ref.`
