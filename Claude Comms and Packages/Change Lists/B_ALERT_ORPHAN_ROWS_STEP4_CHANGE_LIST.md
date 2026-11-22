# B-ALERT-ORPHAN-ROWS — STEP 4 CHANGE LIST (r1)

change-class: non_architecture · Owner CC-B · Kyle KD-116 · Scope `Scope Files/B_ALERT_ORPHAN_ROWS_SCOPE.md` · Pre-audit `Scope Files/B_ALERT_ORPHAN_ROWS_PRE_AUDIT.md`
**Graded ref: `a1905f47a`** on `origin/migration/aws-supabase` (parent `430ff2b18`). `git diff 430ff2b18 a1905f47a` is the whole change set: 7 files, +141/−7, no untracked residue (`git status --porcelain` shows only `.claude/launch.json`, local config, not committed).

## 0. What you ruled at Step 1/2 and where each landed
| condition | landed |
|---|---|
| **C-1** fence | forward migration `:25-30` (gate), `:42-47` (post-delete assertion), `:40` (count NOTICE), one `BEGIN`/`COMMIT` `:23`/`:50` |
| **C-2** pre-deploy exactness | rollback header `:7-17` carries the generator and the procedure; dry run below |
| **C-3** plan row in the Step-3 commit | `SPRINT_TO_LIVE_PLAN.md` row **3c** added after 3b; row **3a** R-1 cell corrected |
| **O3** no foreign key | scope O3 records the ruling; class-wide drift filed `RUNNING_ISSUES` **#1267** as a decision for Kyle, relayed to PM, **not** a plan row |

## 1. NEW — `drizzle/migrations/2026-11-22-b-alert-orphan-rows.sql` (whole body)
```sql
BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM users) = 0 AND EXISTS (SELECT 1 FROM system_alerts) THEN
    RAISE EXCEPTION 'B-ALERT-ORPHAN-ROWS gate: users is empty while system_alerts holds rows; every alert would read as orphaned. Refusing. Investigate the users table first.';
  END IF;
END $$;

DO $$
DECLARE
  deleted_count int;
  remaining int;
BEGIN
  DELETE FROM system_alerts a
   WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.user_id);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'B-ALERT-ORPHAN-ROWS: deleted % orphaned system_alerts rows', deleted_count;

  SELECT count(*) INTO remaining
    FROM system_alerts a
   WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.user_id);
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'B-ALERT-ORPHAN-ROWS post-delete assertion failed: % orphaned rows remain', remaining;
  END IF;
END $$;

COMMIT;
```
Header comment (`:1-21`): purpose, the re-open-under-a-dead-user reason (labelled *possible, not observed*), the fence, no FK, rollback pointer.

**Behaviour by database state:**
| state | gate | delete | assertion | result |
|---|---|---|---|---|
| staging today (3 users, 5,906 alerts, 12 orphans) | passes | 12 | 0 remain | commits |
| CI (empty database after `db:migrate`) | passes — `EXISTS (system_alerts)` is false | 0 | 0 remain | commits |
| users wiped, alerts present | **RAISE** | — | — | whole transaction rolls back; `db:migrate` fails the deploy |

**CI evidence for row 2:** no migration seeds either table — `git grep -i -E "insert into (public\.)?(system_alerts|users)\b" origin/migration/aws-supabase -- drizzle/migrations/` excluding rollback files returns nothing; the only `INSERT INTO` text in the initial schema is a comment (`2026-04-22-initial-schema.sql:20781`). Positive control for that grep's reach: the same tree lists this batch's own two files when grepped for `system_alerts`. CI runs `npm run db:migrate` (`.github/workflows/ci.yml:102`), which applies forward files only.

## 2. NEW — `…-rollback.sql` (tracked with `git add -f`, never listed in MANIFEST)
`BEGIN;` + 12 × `INSERT INTO system_alerts (id, user_id, mode, alert_type, severity, category, message, metadata, action_buttons, acknowledged, "timestamp") VALUES (…) ON CONFLICT DO NOTHING;` + `COMMIT;`. All 11 columns, original ids, `metadata`/`action_buttons` cast `::jsonb`. Messages carry embedded newlines inside their quoted literals (as stored).

**C-2 dry run (2026-11-22):** generator run through `dt-sql --csv -f`, first column of each row compared line-for-line with the file's INSERT lines → **IDENTICAL, 12 of 12.** Control: an earlier malformed run of the same comparison returned DIFFER, so the compare can fail. **It is re-run immediately before deploy**, because the episode-close sweep is not user-filtered and can re-stamp these rows' `metadata` (pre-audit A3).

## 3. MODIFIED
- **`drizzle/migrations/MANIFEST.txt`**: `+2026-11-22-b-alert-orphan-rows.sql` (last line, CRLF kept).
- **`SPRINT_TO_LIVE_PLAN.md`**: row 3a last cell → *"none — closed; R-1 (the 12 orphaned alert rows) became B-ALERT-ORPHAN-ROWS, row 3c (Kyle KD-116)"*; row 3b status brought current (Step 5 done, deploys after the inc-C read); **new row 3c** after 3b — owner CC-B, issues #1255 (R-1) and #1267, authority KD-116, deploy after 11-23 21:00Z, separate from the shared deploy unless OLD Claude agrees. `node scripts/pm/test-slot-check.mjs`: 85/85.
- **`RUNNING_ISSUES.md`**: **#1267** (number checked free at origin after fetch; control: #1266 found). 44 `references(() => users.id)` lines in `shared/schema.ts`, 0 of 30 public FKs reference `users` (30 is the catalog-reach control). DISPOSITION: decision required — no work, on Kyle's 2026-10-19 rule.
- **Scope / pre-audit**: O2 carries C-2, O3 carries the ruling; P1/P2 describe the fence and the check; ruling section added.

## 4. What this change does not do
No code, no test, no route or service change, no DDL. The writer's re-open-without-changing-`user_id` behaviour (pre-audit A3) is untouched; after this deploy there is no orphan row for it to re-open, and a future orphan needs a user deleted outside the app (no deletion path in code).

## 5. Deploy and Step 7 (unchanged from scope)
After 11-23 21:00Z; separate from the shared one-sha deploy unless OLD Claude agrees to fold. Immediately before: re-run C-2; take pre-counts (total, orphans). Step 7: orphans = 0, total = pre − 12, read by `dt-sql`. (The NOTICE is not relied on: `scripts/db-migrate.ts` has no notice handler, so it may not reach the deploy log.)
