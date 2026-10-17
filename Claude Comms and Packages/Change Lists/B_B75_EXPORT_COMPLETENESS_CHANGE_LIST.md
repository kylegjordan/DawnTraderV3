# B-B75-EXPORT-COMPLETENESS (#1195) — Step 4 change list r1 (2026-10-17)

**Review ref:** `review/b-b75-export-completeness` at `7f9e08ad6096c26b6200bf3e613866ea4107d2ca`. One commit on top of `migration/aws-supabase` `64f20a0b0`; nothing is on `migration/aws-supabase` yet.
**Diff:** 16 files, +1370 / −198.
**Three gates, one per dispatch** (Langston's 900 s ceiling): **A** the database layer · **B** the decision and the sweep · **C** the other lanes, the readers and the tests.

## THE DISPATCH HEADER
| # | field | value |
|---|---|---|
| i | **declared class** | `architecture` (scope r6 header) |
| ii | **the doc set, row by row** | **scope** present (`Scope Files/B_B75_EXPORT_COMPLETENESS_SCOPE.md` r6) · **pre-audit** present (`…_PRE_AUDIT.md` r6, Step 2 APPROVED) · **completion report** absent, Step 11 · **BATCH_CATALOG**, **PHASE_HISTORY** absent, Step 10 · **SYSTEM_MANUAL** (Data Lifecycle chapter) and **SYSTEM_IMPACT_MAP** (B75 block, row-7 correction, the evidence table, the trigger, the four gates, the `active` and `hot_partition_dropped_at` meanings) absent, Step 10 · **STORAGE_POLICY** (OBJ-4, §9.A "safe", §9.D) absent, Step 10 · **CHANGES_AND_FIXES** absent, Step 10 · **RUNNING_ISSUES** `#1195` present (Step-2 record), more at Step 10 · **session task lists** at Step 10 · **DELETED_COMPONENTS_LOG** — **now APPLICABLE**, at Step 10: three rule-18 removals (the `governance-checker` transport value, the dead `reused` field, the `:703` short-circuit). Scope r6 judged this N/A; that judgement is withdrawn. · **ADJUSTMENT_FRAMEWORK** N/A (no parameter) |
| iii | **Step-2 reference** | `Claude Comms and Packages/Scope Files/B_B75_EXPORT_COMPLETENESS_PRE_AUDIT.md` r6 (`0219f6dd7`), Step 2 APPROVED on r5 with C-1 folded |

**Fresh reader:** none spawned. Every claim below is a code citation at the ref or a dry-run output, and they ship `NOT RE-READ`.

---

## GATE A — the database layer
**Files:**
- `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql` (new, 122 lines) and its `-rollback.sql` (new, 74 lines);
- `2026-10-15-b-xstock-bar-availability-observation.sql` and its `-rollback.sql` (replay guards);
- `MANIFEST.txt` (+1).

**A1. The column and the backfill** (`…completeness.sql`, section 1):
```sql
ALTER TABLE data_archive_manifest
  ADD COLUMN IF NOT EXISTS completeness_basis TEXT NOT NULL DEFAULT 'unrecorded';
… CHECK (completeness_basis IN ('source-count-matched','gate-deployed-unrecorded','unverified-legacy','unrecorded'))
UPDATE … SET completeness_basis = 'unverified-legacy'       WHERE completeness_basis = 'unrecorded' AND created_at <  '2026-10-16T09:45:18Z';
UPDATE … SET completeness_basis = 'gate-deployed-unrecorded' WHERE completeness_basis = 'unrecorded' AND created_at >= '2026-10-16T09:45:18Z';
UPDATE data_archive_manifest c SET completeness_basis = w.completeness_basis FROM data_archive_manifest w
 WHERE c.tier = 'cold' AND w.tier = 'warm' AND same (source_table, partition_label) AND they differ;
```
The cold-inherits-warm step is new versus the plan: a rotator copy takes its warm row's basis, and a cold row with no warm sibling is a 413 original and keeps its own. **Today it moves 0 rows**, because the 4 cold rows and their warm siblings are all `unverified-legacy`.

**A2. The rename.** Section 2 drops the `source_table`, `tier` and single-contract checks. It adds:
- `cursor_contract IN ('jsonb-text-v1:…', 'text-ts-tiegroup-v1')`;
- a **domain** check `tier IN ('warm','cold')` — not a pin; the plan did not name it.

It then renames the 10 remaining constraints (the pkey and unique renames carry their indexes) and the 2 guard triggers. The unique key becomes `data_archive_exact_evidence_label_tier_key`, because the long form would exceed Postgres's 63-character limit.

**A3. The tie trigger** (section 3):
```sql
IF NEW.completeness_basis = 'source-count-matched' AND NOT EXISTS (
     SELECT 1 FROM data_archive_exact_evidence e
      WHERE e.source_table = NEW.source_table AND e.partition_label = NEW.partition_label) THEN
  RAISE EXCEPTION …
CREATE TRIGGER trg_data_archive_manifest_basis_requires_evidence
BEFORE INSERT OR UPDATE OF completeness_basis ON data_archive_manifest FOR EACH ROW …
```
Its `COMMENT ON TRIGGER` carries the two-column argument and the ordering invariant.

**A4. The rollback.**
- It drops the trigger and the column, and reverses every rename.
- **The conditional pins:** if any row has a non-xStock table, a non-warm tier or a non-xStock contract, it restores only the widened checks under the old names and `RAISE NOTICE`s. Otherwise it restores all three pins.
- It deletes nothing.

**A5. The 10-15 replay guard.**
- **Three `DO $guard$` blocks**, each `IF to_regclass('data_archive_exact_evidence') IS NULL`, wrap the `CREATE TABLE` (`:65-87`), the two triggers and the `COMMENT`.
- **The 10-15 rollback's `COMMENT`** comments whichever name exists.
- The observation test's strings survive (it passes).

**A6. DRY RUN ON STAGING, 2026-10-17, one transaction, ROLLED BACK** (`psql -f`, with the migration body and the rollback body run inline, `lock_timeout 5s`). Output, verbatim where it matters:
- **PRE:** `manifest_rows 572`, `evidence_rows 0`.
- **APPLY:** `UPDATE 568`, `UPDATE 4`, `UPDATE 0` (the cold inherit).
- **P1** census: `gate-deployed-unrecorded warm active 4` · `unverified-legacy cold active 4` · `unverified-legacy warm active 561` · `unverified-legacy warm migrated 3` → **568 / 4 / 0 / 0**.
- **P2** names after the rename: 12 constraints, all `data_archive_exact_evidence_*` · triggers `trg_guard_data_archive_exact_evidence_{mutation,truncate}` · indexes `…_label_tier_key`, `…_pkey`.
- **P3** the 10-15 guarded blocks re-run: `DO DO DO`, and exactly one table matches `%exact_evidence`: `data_archive_exact_evidence`.
- **P4** rollback with no foreign rows (in a savepoint, undone): `…_cursor_contract_check`, `…_source_table_check` and `…_tier_check` restored; `basis_column_left 0`.
- **P5, falsifying control:** `UPDATE … SET completeness_basis = 'source-count-matched'` on `crypto_perp_ohlc_1m/2026-09-16` → `refused -> … requires a data_archive_exact_evidence row`.
- **P6a** with a non-xStock evidence row (`text-ts-tiegroup-v1`), the warm stamp is admitted.
- **P6b** a cold copy is inserted with the inherited basis: admitted, 1 row.
- **P6c** an unknown contract is refused by `data_archive_exact_evidence_cursor_contract_check`.
- **P6d** an `UPDATE` of the evidence is refused: `xStock projection flush evidence is append-only`.
- **P7** rollback with a foreign row: `NOTICE: … 1 evidence row(s) belong to other lanes; they are KEPT …`; `evidence_rows_kept 1`; the source_table pin is not restored.
- **POST** (after `ROLLBACK`): `old_name xstock_bar_archive_exact_evidence | new_name (null)`, `basis_column 0`.

**For attack (A):**
- the cold-inherits-warm backfill step;
- the `tier IN ('warm','cold')` domain check;
- whether the 10-15 guards should also cover the `CREATE INDEX` on `xstock_bar_revision_event` (I left it, because it is not the evidence table).

---

## GATE B — the decision and the sweep
**Files:** `server/services/data-archive/archive-completeness.ts` (new, 203 lines) and `server/scripts/b75-retention-sweep.ts` (+334 / −?).

**B1. The decision** — `archive-completeness.ts`, `decideExistingCopy(row, evidenceExists, rowsPresent)`:

| row | decision |
|---|---|
| none | export |
| `verified` + `source-count-matched` | reuse |
| `verified` + anything else | refuse `verified-unproven` |
| `active` + rows | refuse `active-rows-present` |
| `active` + no rows | skip `already-active` |
| `migrated` or `migrating` + rows | refuse `migrated-rows-present` |
| `migrated` or `migrating` + no rows | skip `already-migrated` |
| `pending` or `uploaded` + evidence | refuse `stale-proof` |
| `pending` or `uploaded` + no evidence | export |
| unknown state | throw |

`decisionNeeds(row)` says which input to read, so the probe runs only for `active`/`migrated`/`migrating` and the evidence lookup only for `pending`/`uploaded`.

**B2. `archiveOneObject`** (sweep `:552`):
- **The decision comes first** (`:577`), before `upsertManifestPending` (`:588`) and `uploadWarmFile` (`:621`).
- **The probe** is `labelRowsPresent` (`:484`): `target` = the partition child or the plain table, the same range and the same `extraPredicate` as the exporter.
- `refuse` → `throw new NonProvenExistingCopyError` (`:579`). `skip` → `{ kind: 'skipped' }`. `reuse` → `{ kind: 'reused' }`.
- **The evidence:** every export now builds it (`:641` onward) with `sourceTable: spec.parent`, `tier: 'warm'`, and the contract from the spec, using the downloaded count from `verifyPath`.
- **R-1:** `BEGIN` (`:687`) → `recordExactArchiveEvidence` → `UPDATE … SET completeness_basis = $2` (`:691`) → `updateManifestVerified` → `COMMIT` (`:695`), with `ROLLBACK` on any throw.

**B3. The whole path** (`:787` onward):
- The `already-active` short-circuit is deleted.
- `if (outcome.kind === 'skipped') return { status: 'skipped', … }` (`:806`) comes **before** `dropAndMarkActive` (`:818`).
- A `reused` outcome still drops (proven `verified`, source intact), flipping `verified` → `active` by id.

**B4. The sliced path:**
- A per-day `skipped` (`:862`) is collected, and **any** skip refuses the drop with an error. This is defensive: present days are row-derived, so the probe finds rows and refuses rather than skips.
- The DROP gate requires `(verified|active) && isProvenBasis(...)` (`:888`).

**B5. The plain lane:**
- `archivedLabels` is hoisted (`:1031`).
- The gate requires a proven basis (`:1082`), and a blocked gate now **throws** "DELETE REFUSED this run" (`:1089`) into the catch, which alerts, instead of `continue`.
- After the delete loop, `markLabelsActive(ctl, spec.table, archivedLabels)` (`:1150`). It pins `state = 'verified'`, so an already-`active` label is never re-stamped.

**B6. Alerts:**
- `raiseSweepAlert(…, dedupeKey)` (`:943`). The body appends the run id, the time and the log path.
- `resolveSweepAlerts` (`:968`) resolves as `b75-retention-sweep` with transport `timer-script`. Its evidence is `b75 sweep run <uuid> succeeded for …`, a uuid token, and the run id is printed on the started line.
- **The three sites:**
  - partition: key `b75-sweep:<parent>:<label>:<cls>` (`:1341`); resolved on a `dropped` or `skipped` result (`:1317`);
  - plain: key `b75-plain:<table>:<cls>` (`:1167`); resolved on success (`:1158`);
  - fatal: `b75-sweep:fatal` (`:1392`); resolved at DONE (`:1377`).
- **Severity:** `critical` for `checksum` and `non-proven-existing`. `failureClassText` (`:984`) words each class; "Likely transient" survives only for `other`.

**For attack (B):**
- (1) `reused` on the whole path still runs `updateManifestActive` by id. That is correct for proven `verified`, but it is the only id-unpinned writer left.
- (2) The sliced path's defensive skip-throw is classed `other` ("likely transient") even though it is not reachable — should it be its own class?
- (3) `countGzipJsonlLines` now runs for every object, a second gunzip pass. The cost is unmeasured until Step 7, on the largest object (`xstock_spot_ticker_snap`, 2.9M rows).
- (4) The resolve on `skipped`: a skipped empty partition clears its old rows.

---

## GATE C — the other lanes, the readers and the tests
**Files:**
- `context-bridge-log-ttl.ts`, `b75-cold-rotator.ts`, `b75-rehydrate.ts`, `perpfeed-gate-test.ts`, `b-xstock-bar-availability-capacity-gate.ts`;
- `exact-archive-evidence.ts`, `system-alerts.ts`;
- tests: `b-b75-export-completeness.test.ts` (new, 48 cases) and `b-xstock-bar-availability-archive.test.ts`.

- **C1. ctx lane.**
  - `getManifestState` reads either tier, warm first (a 413 original is cold).
  - The one decision replaces the `active` skip; its probe is `monthRowsPresent`.
  - The evidence, then `UPDATE … verified … completeness_basis = $7`, run in one transaction with `tier: actualTier`.
  - The downloaded count is read from the local file, which the read-back checksum shows is byte-identical. Still unscheduled (`#169`).
- **C2. Rotator** (`:303-327`). `completeness_basis` is in the INSERT column list, the `SELECT` list and the `ON CONFLICT … SET`, with no evidence written.
- **C3. Rehydrate.** `chooseObjectsByLabel` picks among downloadable rows (A13: a `migrated`/`migrating` warm row is never one).
  - It prints `rows(unproven)=` and `completeness=`, and every tier's row when there is more than one.
  - It writes a `<file>.completeness.json` sidecar, and splits the total into `rows_proven=` and `rows_unproven=`, with a WARNING per unproven object.
- **C4. perpfeed `--clean`.** `DELETE` first, inside a try; on refusal it exits before the `DROP`. The comment names the recovery, including dropping the leftover child.
- **C5. Capacity gate.** `:125` and `:609` use the new name, with the comment on the whole-relation over-charge, ANALYST Claude's choice.
- **C6. The evidence writer.** It takes `sourceTable`, `tier` and `cursorContract`, and the replay compare uses them. A `producing_build_sha` mismatch is **logged, not refused**: the stored value is kept and the writer never `UPDATE`s. `evidenceExistsForManifest` is added.
- **C7. `system-alerts.ts`.**
  - `ResolveTransport` = `'cli' | 'dispatcher' | 'api' | 'engine' | 'timer-script'`. `governance-checker` is removed: 0 resolved rows ever, and no caller passes it.
  - `ALERT_ACTORS` gains the machine actor `b75-retention-sweep`.
- **C8. Tests.**
  - `b-b75-export-completeness.test.ts` covers: every decision row; the probe's role (the same row with `rowsPresent` forced true refuses); the keys and their positive controls; the rehydrate choice; the writer (its own source and tier, the cold tier, first-write-wins with the log, a counts or checksum replay refusing, CC-C's contract unchanged); sweep, ctx, rotator, rehydrate, perpfeed and alerts wiring by structure; and the migration texts.
  - **Honest limit: the sweep runs `main()` at import, so its wiring is tested by structure (order and presence at the source), not by execution.** The first execution is the Step-7 nightly run.
- **Results:**
  - **Mutation-proved, each caught:** the `active` refuse arm removed (3 failed); the source-table literal restored (1 failed); the rotator `ON CONFLICT` carry removed (1 failed).
  - **Suites:** the archive suites 149/149. The whole suite: 4393 passed, 0 failed, 184 skipped. 9 files fail to load — 8 for want of a database, and `b-staging-liveness-watch` on a `.mjs` syntax error that reproduces with this diff's `system-alerts.ts` change stashed.
  - **tsc:** 335 = baseline 335.

**For attack (C):**
- the ctx lane reading either tier (a behaviour change for a cold-only month: it was invisible before);
- the downloaded count from the local file in the ctx lane;
- whether structure tests are enough for the sweep's gates, or whether a test harness should exist before the first live run.
