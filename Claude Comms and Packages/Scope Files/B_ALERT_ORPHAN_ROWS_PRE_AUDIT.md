# B-ALERT-ORPHAN-ROWS — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture · Scope: `B_ALERT_ORPHAN_ROWS_SCOPE.md` · Owner CC-B · Kyle KD-116.

## Previously stated vs now
None. The 12-row figure is unchanged from the `B-ALERT-INSERT-CONTRACT` report (R-1, `:19`) and re-measured today.

## PART 1 — AUDIT

### A1. The population (staging, `dt-sql`, 2026-11-22)
| object | value |
|---|---|
| `system_alerts` rows whose `user_id` matches no `users.id` | **12** — `ce50e56b…` ×10 (`feed_health`, live+paper, 2025-10-24/25), `3ace5ebb…` ×2 (`walter_memory_limit`, paper, 2025-10-25); all acknowledged |
| `system_alerts` total | 5,906 across 5 distinct `user_id`s; `users` holds 3 rows |
| foreign keys referencing `users` | **0** of 30 public foreign keys (positive control: the 30 shows the catalog query sees foreign keys) |
| foreign keys referencing `system_alerts` | **0** — nothing cascades from a delete |
| non-internal triggers on `system_alerts` | **0** |

### A2. Component census — `system_alerts` (`git grep` at `origin/migration/aws-supabase`, tests excluded)
| question | members |
|---|---|
| writes/creates | **exactly one**: `AlertsService.createAlert` (`alerts-service.ts:72-91`, upsert on `(mode, alert_type, message)`); `storage.createSystemAlert` removed (`storage.ts:670`) |
| reads | `alerts-service.ts:139` (unacknowledged, by mode), `:161` (all, by mode — orphans are visible in history), `routes.ts:18642-18646` (action route, by id AND user) |
| mutates | `alerts-service.ts:176` (ack one), `:222` (ack all), `:269` (mute info), `:313` (feed-health episode close), and the upsert's `DO UPDATE` |
| **deletes** | **none in code** (`AlertsService.cleanupOldAlerts` removed, SIM §2.1.1.a `:352`). This migration is the only delete. |
| schedules | feed-integrity cron (`*/5`) reaches the writer/episode-close; no job deletes |

### A3. Why the rows matter (possible, not observed)
The upsert's `DO UPDATE` sets `acknowledged = false` when `metadata.episodeClosedAt` is set and **does not update `user_id`** (`alerts-service.ts:83-91`). The 10 orphan `feed_health` rows carry `episodeClosedAt` (stamped by the episode-close sweep, `:313-327`). So a new `feed_health` alert with an identical message would **re-open an orphan row under a dead user**, which the action route (`routes.ts:18640-18647`, filtered by user) cannot act on. **Not observed** — labelled possible.

### A4. The user link (O3)
`shared/schema.ts` has 44 lines matching `references(() => users.id)`; the database enforces none (A1). A foreign key on `system_alerts` alone would fix one of 44 and leave the class; it would also need the 12 rows gone first and adds a write-time failure mode to the alert path. **Recommendation: no foreign key in this batch; the class-wide gap goes back to Kyle as a proposal if Langston agrees it is worth raising.** Ledger checked: no existing `RUNNING_ISSUES` entry for ORM-vs-database foreign-key drift (`git grep -i "foreign key"` at the ref returns one unrelated hit, `:10515`).

### A5. Migration path
`dt-deploy` runs `npm run db:migrate` between build and restart (`scripts/dt-deploy.sh:350-353`); `db-migrate` hard-fails when a forward file is not listed exactly once in `MANIFEST.txt`. CI applies every migration to an empty database, where this delete touches 0 rows. Rollback files are tracked (`git add -f`) and never listed.

## PART 2 — PLAN
| # | item | from |
|---|---|---|
| P1 | `drizzle/migrations/2026-11-22-b-alert-orphan-rows.sql`: `DELETE FROM system_alerts a WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.user_id);` — a predicate, not 12 hardcoded ids, so it is exact on staging and a no-op on an empty database. **Fenced (C-1):** a gate refuses when `users` is empty while `system_alerts` holds rows (the predicate would then match every alert); after the delete it asserts 0 orphans remain and `RAISE NOTICE`s the count; gate and delete in one `BEGIN/COMMIT` (precedent `2026-05-26-b79-0n-tec-wildcard-retire.sql`). | A1, A5 |
| P2 | `…-rollback.sql`: the 12 rows re-inserted verbatim (all 11 columns, original ids), `ON CONFLICT DO NOTHING`. Residual: a row whose `(mode, alert_type, message)` was re-used after deploy would be skipped — acceptable, the live row is the newer truth. **C-2:** the rollback header carries its own generator; immediately before deploy it is re-run (`dt-sql --csv -f`, first column) and must match the file line-for-line, else regenerate and re-commit. Dry run 2026-11-22: 12 of 12, identical (control: a malformed run of the same compare returned DIFFER). The episode-close sweep is not user-filtered (A3), so the rows' `metadata` can change — that is why the check is at deploy, not now. | A1, A3 |
| P3 | `MANIFEST.txt`: one line, appended last. | A5 |
| P4 | No code change, no test file (no code path changes; CI's empty-database apply exercises the migration). | A2 |
| P5 | Deploy: separate from the shared one-sha deploy after 11-23 21:00Z unless OLD Claude agrees to fold it (KD-116). Step 7: orphan count 0, total = pre-deploy − 12. | scope O1 |

### Langston Step-1/2 ruling (2026-11-22, Discord `1574139970585886853`)
PROCEED with C-1 (fence, P1), C-2 (pre-deploy exactness, P2), C-3 (a running-plan row in the Step-2/3 commit: `SPRINT_TO_LIVE_PLAN.md` CC-B row 3c, and row 3a's "R-1 with PM for Kyle" cell corrected). O3 agreed: no foreign key; the class-wide drift goes to `RUNNING_ISSUES` as a proposal for Kyle. Step 10: `SPRINT_TO_LIVE_PLAN` required, `PHASE_19_PLAN` N/A, `PHASE_HISTORY` required.

### UNAUDITED
None.
