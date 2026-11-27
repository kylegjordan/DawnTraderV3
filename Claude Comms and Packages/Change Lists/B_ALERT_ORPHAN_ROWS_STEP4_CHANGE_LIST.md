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
After 11-23 21:00Z; separate from the shared one-sha deploy unless OLD Claude agrees to fold. Immediately before: re-run C-2; take pre-counts (total, orphans). Step 7: orphans = 0, total = `pre_total − pre_orphans` from the same pre-deploy read, read by `dt-sql`. (The NOTICE is not relied on: `scripts/db-migrate.ts` has no notice handler, so it may not reach the deploy log.)

## 6. Phase A staging deploy — 2026-11-26

OLD and NEW cleared the conditional fold and ANALYST handled the release (NEW agreement `1575113776116662383`, fallback `1575118494658461878`, executed handoff `1575338499127640085`). The exact target was `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`, with all four jobs green in CI `45589022150`. The forward and rollback git blobs are `6710254032d6d7688ebc234e8546c48be65b2d5c` and `eca6c17dec44a63df2687a57872971e9ef0dc5b3`. The forward file is at MANIFEST line 264.

ANALYST's immediate preflight at 02:31:33.849 UTC found C-2 exact **12/12**, **5,936** operator alerts, **12** orphans and **3** users. The registered expected post-migration total was **5,924**. The Phase A handoff records restart **716** at 02:32:06.222 UTC, engine resumed and deploy recorded at 02:32:16 UTC. At the Step 7 read, the build SHA and 581-byte deploy record corroborated that exact target and restart (record SHA-256 `db39222490ae9a9de0bfdb322520610afac5a734adda575ae8a59fa24ca9bb2a`). These are the record's captured values at the read. The durable migration ledger separately records the forward filename applied at **02:32:03.327920 UTC**.

## 7. First-pass staging verification — 2026-11-26

| UTC read | Users | Total operator alerts | Orphans | Alerts linked to a user |
|---|---:|---:|---:|---:|
| 02:31:33.849 (ANALYST preflight) | 3 | 5,936 | 12 | 5,924, by subtraction |
| 02:43:17.830979 (NEW) | 3 | 5,924 | 0 | 5,924 |

The same anti-join that matched the preflight's 12 orphans returned zero, and the total matched `5,936 − 12 = 5,924`. A second read at 02:44:22.136188 UTC repeated the total and orphan count and found **0/12** of the exact rollback primary keys in the whole alert table, independent of user linkage. No extant alert carried a timestamp at or after the preflight instant in that second read. The before/after totals grade the registered count and the key check identifies the removed rows. A full survivor-ID comparison would require a preflight snapshot of the other keys.

**Chrome:** Opened System Monitoring (`/systems`) in Kyle's signed-in Chrome session at 02:44 UTC, expanded **System Notifications 2**, and read both rendered Weekly Expert Insights rows (weeks Nov 2 and Oct 26). The deployed page mounts the AlertBanner that reads the authenticated `/api/alerts`, whose reader uses the current user and trading mode. Each rendered title and date matched one unacknowledged paper alert with an existing user in staging SQL. UTC row times were Nov 3 23:13:12.753009 and Oct 27 23:13:12.713282, displayed at 00:13:12 the next day in the browser. This is an operator-alert rendering control. The 12 preflight targets were already acknowledged and tied to deleted users.

**Reproduction:** Run the read-only aggregate below through staging `dt-sql --csv`. Extract the 12 first-column IDs from the tracked rollback INSERTs at the deployed ref. Confirm the same aggregate with `count(*) filter (where a.id::text in (<rollback IDs>))` as an added projection, and select `name, applied_at` from `public._migrations` for the exact forward and rollback filenames. The forward ledger entry is present. Search the two Chrome notification titles in `system_alerts` filtered to unacknowledged rows, checking `mode`, timestamp and the same users join. Read the actual expanded System Notifications panel on `/systems` for UI confirmation.

```sql
select clock_timestamp() at time zone 'UTC' as captured_utc,
       (select count(*) from users) as users,
       count(*) as total,
       count(*) filter (where not exists (select 1 from users u where u.id = a.user_id)) as orphans,
       count(*) filter (where exists (select 1 from users u where u.id = a.user_id)) as linked
from system_alerts a;
```

REVIEWER: claim-only · which objects distinguish removal from reparenting or replacement? · exact target keys needed and full survivor identity requires a preflight key set · re-derived y for target keys; full survivor identity unmeasured.

## 8. Coltrane's second pass — 2026-11-26

**SEND BACK at 03:07:48 UTC** on exact `d79d93e16eaa107a28a007bd86ff73daa5ef061d` (dispatch `1575346171210367079`). Coltrane independently read the same deployed Phase A build and restart 716, reproduced the migration ledger and the two rendered operator alerts, and at 03:05:27.755487 UTC read 5,924 linked operator alerts, zero orphans and zero matches for the 12 rollback IDs. His known-present ID matched through the same lookup. His read-only fixture made the orphan count zero by reparenting all 12, while their IDs still matched; it distinguishes reparenting from the live deletion evidence. These legs pass.

The Step 8 send-back concerns the original **02:31:33.848808 UTC** aggregate and C-2 generator output. Coltrane could read ANALYST's contemporary handoff but could not reproduce the preflight from the original output at the reviewed ref. NEW requested the retained outputs from ANALYST in Discord `1575348593806676042`. ANALYST replied in `1575349152022405121` and preserved the original preflight command stdout from execution chunk `1e1bfc` (exit 0), at `75790fcea60100b66a456dd1bf29894ac0c318f7` in `B_PRICE_SIDE_BY_JOB_8C_OFF_REMOVAL_CHANGE_LIST.md`, section **Original NEW preflight capture and retention limit**. The complete retained stdout follows:

```jsonl
{"phase": "immediate", "read_utc": "2026-11-26T02:31:30.293057+00:00", "manifest": 226, "ledger": 227, "pending": ["2026-11-22-b-alert-orphan-rows.sql", "2026-11-22-b-universe-refresh-acts.sql"]}
{"phase": "immediate", "c2_tracked": 12, "c2_live": 12, "c2_match": true}
{"phase": "immediate", "total": 5936, "orphans": 12, "users": 3, "post_expected_total": 5924, "at_utc": "2026-11-26T02:31:33.848808+00:00"}
```

The command validated the C-2 CSV header and one field per row, normalized CRLF to LF and compared the ordered received statements to the 12 tracked INSERTs from rollback blob `eca6c17dec44a63df2687a57872971e9ef0dc5b3` at exact A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`. It separately validated the aggregate CSV shape and required the orphan count to equal the tracked statement count, with linked alerts and users present. The raw SQL responses were consumed in memory and discarded when the command ended. ANALYST confirmed that the raw aggregate CSV and original live C-2 generator rows are unavailable. The tracked rollback blob contains the expected rows. It cannot recover the original returned rows.

**03:20:14 UTC ruling — SEND BACK on C-2 only** (dispatch `1575349982783995917`). Coltrane read original stdout at `75790fcea60100b66a456dd1bf29894ac0c318f7`, accepted the aggregate capture, re-derived 5,924 as the expected total and verified 12 distinct IDs in the Phase A rollback blob. The historical ordered statement comparison remains **RULED ON REPORTED FACT**. Keep Step 8 open pending independently checkable C-2 evidence or a recorded Kyle exception to close with C-2 unproven. The ruling preserves the verified database and UI legs. It requires no staging change or rerun. Entry Gate D remains behind OLD's explicit restart release and ANALYST's governed Phase B.

### KD-126 — historical C-2 evidence exception, 2026-11-27

Kyle accepted the historical pre-deploy ordered rollback comparison as **reported, independently unproved**, because the originally returned statements are unavailable. Authority: `1-system-manual/pm/DECISIONS.md` at `06f1e278c6529d457317acb394083ccb26d14be3`, KD-126. This dispositions the single leg returned by Coltrane; the retained original stdout at `75790fcea` and the verified database and UI legs remain as recorded above. The rollback file `drizzle/migrations/2026-11-22-b-alert-orphan-rows-rollback.sql` stays tracked at Phase A with blob `eca6c17dec44a63df2687a57872971e9ef0dc5b3`.

Next: take the exact revised record to Coltrane for Step 8 disposition with that exception. The separate governance alert `11ccdc63-d895-4292-83f9-96fba872e816` remains a sign-off wait. Normal closeout remains due. No historical rows are to be reconstructed and no staging row changes follow from this disposition.
