# B-B75-EXPORT-COMPLETENESS — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (r5, 2026-10-17)

> **r5 answers Langston's r4 blocker (07:4xZ):**
> - the premise "every call has source rows present" is withdrawn for the whole path, which enumerates children by name and age (`listOldPartitions`, `:244-281`), not by rows;
> - the decision now takes a **measured** `rowsPresent` from a `LIMIT 1` probe at `:517`, and the refuse arms that claim new rows require it;
> - record 1 → P9;
> - record 2 → P3.6.
> r4 was `e3fdb9e07`.

> **r4 answers Langston's r3 blocker (07:1xZ):**
> - the whole path's `already-active` short-circuit (`b75-retention-sweep.ts:703`) is now a gate in the census (§3.1, §3.4(e)). It is **deleted**, so the whole path reaches the one decision;
> - the rule's `active` row becomes **refuse, any basis**;
> - following the same argument found A14: the plain lane never marks a label `active` after it deletes, so its `verified` row plays the role `active` plays elsewhere. It now marks labels `active` after the delete (P3.6).
> r3 was `68972749a`.

> **r3 answers Langston's r2 CHANGES (05:4xZ):**
> - **the blocker** → P3.2, the resume decision rewritten as a five-row table: `migrated` joins the refusal, and any existing evidence refuses a re-export;
> - **record item 1** → A12 corrected to 67, and the dead `governance-checker` transport value is removed under rule 18 (P4);
> - **record item 2** → P7 excludes `migrating` alongside `migrated`.
> r2 was `3651e8c7a`.

> **r2 answers Langston's r1 CHANGES (05:0xZ):**
> - **B-1** → P3.2: `migrated` falls through to re-export, plus the shadowing it creates (A10);
> - **B-2** → P3.4: a fourth alert class, `isNonProven`;
> - **B-3** → P1.3: the trigger's exact columns, and its comment;
> - **B-4** → P4: a new transport class, measured at runtime;
> - **C-1** → P9: the harness's `--clean` is reordered, not only commented;
> - **C-2** → P8: the full rename census;
> - **notes** → P1: no Drizzle schema, and the second definition site.
> r1 was `24e6cad56`.

change-class: architecture

**Owner:** CC-A (OLD Claude) · **Issue:** `#1195` · **Scope:** `B_B75_EXPORT_COMPLETENESS_SCOPE.md` r6 at `253f27c4d` (Step 1 APPROVED by Langston on r5 `29d23c2e9`, 2026-10-17 04:00Z) · **Board:** `PVTI_lAHODmulEM4BfQP4zhBZsXA` · **Reviewer:** Langston
All code citations are at `origin/migration/aws-supabase` `253f27c4d`. All database reads are staging, 2026-10-17.
**Fresh reader:** none spawned. The load-bearing claims are §2's entry-point list, §3's census lists and A8's FK behaviour. **They ship `NOT RE-READ`; Langston is the reader.**

## 0. PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED** (scope r1/r2): 567 legacy-window objects plus 1 "pre-page-rule" object. **NOW:** 568, one group. **REASON:** the "pre-page-rule" object's `created_at` is a placeholder (scope r3 §1, Langston re-derived). *(Already corrected in the scope; repeated here because it is a number the plan rests on.)*
- **PREVIOUSLY STATED** (scope r3 OBJ-8): "no legacy row is `verified`" bounds the resume-skip exposure. **NOW:** the bound is "0 of 568 overlap a live hot child". **REASON:** the skip reads `verified` OR `active` (Langston C-6).
- **NEW, not in the scope:**
  - the context-bridge lane is **not scheduled at all** (§2);
  - the sweep has raised **4** failure alerts in its history, all unkeyed and all resolved, 2 of them for the same partition on consecutive nights (§3.7).
- **No other number moved.** 572 / 568 / 4, 810,604,186 + 6,937,105 rows, and the 0-overlap result all stand as the scope states them.

## 1. THE SIX SOURCES — WHICH I READ
| # | source | read | what it gave |
|---|---|---|---|
| 1 | code at the ref | ✅ every file in §3 | the census below |
| 2 | logs + database | ✅ `b75-retention.log` (138 DONE lines; the last 3 read), `system-alerts.jsonl` (every row with `source = b75-retention-sweep`), `data_archive_manifest` (all 572), `pg_inherits` (276 children), the evidence table's constraints, triggers and indexes, root and deploy crontabs, `/etc/cron.d`, systemd timers | §2, §3 |
| 3 | `SYSTEM_IMPACT_MAP.md` | ✅ the B75 block (`:2358-2440`) and its component inventory | §4 — one self-contradiction |
| 4 | `SYSTEM_MANUAL.md` | ✅ "Data Lifecycle Policy (B75)" (`:12190-12250`) | §4 — silent on completeness |
| 5 | ledger + reports | ✅ `RUNNING_ISSUES` (searched for `data_archive_manifest`, `exact_evidence`, `rehydrate`, `context-bridge-log-ttl`; read `#169`, `#1195`), `BATCH_CATALOG` B75, `STORAGE_POLICY.md` §9, the `B-B75-COUNT-GATE` note | §5 |
| 6 | `bridge/canonical/` | ✅ searched for `archive_manifest`, `retention sweep`, `b75`, `warm tier`, `cold tier` — **no coverage of this component** (it postdates the corpus) | §6 |

## 2. ENTRY POINTS, ENUMERATED FIRST (repo-wide, then on the box)
Everything that starts work against the manifest or the evidence table:

| entry point | schedule (measured on staging) | touches |
|---|---|---|
| `b75-retention-sweep.ts` | root crontab `15 2 * * *` | manifest (insert, update), evidence (insert), hot DROP and DELETE, alerts |
| `b75-cold-rotator.ts` | root crontab `0 3 1 * *` | manifest (insert cold, update warm), deletes warm objects |
| `context-bridge-log-ttl.ts` | **NOT SCHEDULED** — absent from the root crontab, the deploy crontab, `/etc/cron.d` and systemd timers; there is no `b75-ctx-bridge.log`. Its manifest rows (6) came from manual runs. Already recorded: SIM `:2396-2398` and `#169`. | manifest (insert, update), hot DELETE |
| `b75-rehydrate.ts` | manual CLI | manifest (read) |
| `b-xstock-bar-availability-capacity-gate.ts` | manual CLI (CC-C) | manifest + evidence (read), evidence relation size |
| `perpfeed-gate-test.ts` | manual harness | manifest (read; **delete** in `--clean`) |
| `scripts/db-migrate.ts` (via `dt-deploy`) | each deploy, between build and restart | schema (applies each MANIFEST file once by name) |

- **Not entry points, checked:** `b75-cold-liveness.ts` (weekly; touches B2 only, no manifest reference) and `b-storage-archival-health.ts` (daily; reads log files only).
- **Population:** a `git grep` for `data_archive_manifest` and for `xstock_bar_archive_exact_evidence` over `server`, `shared` and `scripts`, tests excluded, plus `drizzle/migrations`. **Concurrency:** the sweep holds an O_EXCL run-lock. The rotator runs at 03:00 on the 1st, after the sweep's 02:15 run has finished (the last three runs took 543-745 s). The ctx lane is manual. No two schedulers write the same row at the same time.

## 3. COMPONENT CENSUS AT EVERY HOP
### 3.1 `data_archive_manifest` (B75, `2026-05-06-b75-data-lifecycle.sql:39-69`)
| question | members (`file:line`) |
|---|---|
| **creates** | sweep `upsertManifestPending` `:337`; ctx `:162`; rotator `:303` (cold row, `INSERT … SELECT` from warm) |
| **mutates** | sweep `:368` uploaded, `:383` verified, `:392` active, `:407` `markLabelsActive`; ctx `:157` pending, `:217` tier→cold (413 fallback), `:225` verified, `:293` `markMonthsActive`; rotator `:333` warm→migrating/migrated |
| **reads** | sweep `:304` `getManifestRow`, called at exactly two sites: **`:703` (the whole path's `already-active` short-circuit, missed in r1-r3)** and `:517` (the resume skip); `:320`; `:778` DROP gate; `:925` plain gate; ctx `:119` (the active skip); rotator `:134`; rehydrate `:101`; capacity gate `:608`; perpfeed `:108` |
| **deletes** | **exactly one:** `perpfeed-gate-test.ts:126`, `--clean`, for the synthetic `xstock_perp_ohlc_1m/2025-01-15` only. That is also the one `xstock_perp_ohlc_1m` manifest row. |
| **schedules** | §2 |

### 3.2 `xstock_bar_archive_exact_evidence` (CC-C, `2026-10-15-…-observation.sql:59-77`, `:113-121`, `:303`)
| question | members |
|---|---|
| creates | **exactly one:** `exact-archive-evidence.ts:63` (`recordExactArchiveEvidence`), called from sweep `:613` |
| mutates / deletes | **none possible** — the BEFORE UPDATE/DELETE and TRUNCATE triggers raise; the FK to the manifest has no `ON DELETE` clause |
| reads | `exact-archive-evidence.ts:85` (replay compare); capacity gate `:609` (joined, filtered), `:125` (whole-relation size, unfiltered — C-9) |
| rows | **0** (Langston's control: `xstock_bar_revision_event` is in none of the 572 manifest rows) |
| names (staging) | 13 constraints, 2 triggers, 2 indexes (scope §2b lists them) |

### 3.3 The exporter (`partition-exporter.ts`)
- **Unchanged.** It counts the source inside its `REPEATABLE READ READ ONLY` snapshot (`:146`, `:178`) and throws `ExportRowCountMismatchError` before COMMIT (`:294`); it returns `sourceRowCount` (`:109`, `:327`).
- Its two callers are the sweep and the ctx lane. **One caller is scheduled.**

### 3.4 The four gates (OBJ-8)
| gate | today | reached by |
|---|---|---|
| (a) partition DROP gate `:775-793` | every present label must be `verified`/`active` | the partition lane, after its day loop |
| (b) plain delete gate `:922-935` | every present label `verified`/`active`, else `console.error` + `continue` (no alert) | the plain-archive tables only — `closed_trades` and `vts_open_trades`, **0 manifest rows** (365-day window) |
| (c) resume skip `:516-520` | `verified`/`active` with a checksum → reuse, no re-export | both sweep lanes |
| (d) ctx active skip `ctx:133-138` | `active` → skip | the unscheduled ctx lane |
| **(e) whole-path short-circuit `:703-714`** | `active` → `skipped: already-active`, **before** `archiveOneObject`, so before (c) | the WHOLE path only; the sliced path goes straight to `:758` and reaches (c) |

- **Exposure, measured:** 0 of 568 pre-hotfix rows overlap a live hot child. The control: the same query enumerated all 11 partitioned parents' 276 children; Langston's own control returned 921 pairs once the key was dropped. `context_bridge_log`'s oldest row is 2026-04-01 00:00:00.151Z, which is the end of its newest archived month.

### 3.5 The cold rotator
- Its cold row is an `INSERT … SELECT` from the warm row, with `ON CONFLICT … DO UPDATE SET` (`:303-317`).
- Its candidate query (`:134-145`) selects warm rows past the warm window with no cold sibling.
- **An aside it explains, with no work owed:** the rotator ages by `created_at` (`:137`), so the placeholder `2026-01-01` row (`exit_decision_archive` `2026-05`) went to cold on 07-08, months early. The cold copy was verified by re-download (`:290-295`), so nothing was lost.
- **It does not consult completeness, and should not:** moving a short copy to cold changes nothing about its shortness. It must only carry the label (OBJ-2).

### 3.6 The rehydrate CLI
- It reads the manifest (`:98-107`), then prints per object `rows=<row_count>` (`:178`, `:205`) and sums the total (`:181`, `:208`, `:220`).
- **It is the one reader a future analytics job inherits** (SIM "B75 forward-couples").

### 3.7 The sweep's alerts (OBJ-5)
- **Three call sites** of `raiseSweepAlert` (`:833`): `:999` plain, `:1156` per partition, `:1201` fatal. None passes a `dedupe_key`.
- **History (measured, every row with `source = b75-retention-sweep`):** 4 rows, all resolved, all unkeyed:
  - `xstock_spot_ticker_snap/2026-06` ×2 (consecutive nights for one partition — the duplicate F2 is about);
  - `xstock_spot_ticker_snap/2026-07` ×1;
  - `xstock_perp_ohlc_1m/2025-01-15` ×1 (the perpfeed harness's deliberate negative leg).
- The last three runs: `failed=0`, `examined=4 dropped=4`.

## 4. SYSTEM_IMPACT_MAP AND SYSTEM_MANUAL
- **SIM — one self-contradiction, folded into this batch's SIM update:** the B75 inventory row 7 marks `context-bridge-log-ttl.ts` "✅ LIVE" with "cron 02:30 UTC", while the same section's cron note (`:2396-2398`) says it is "NOT installed (deferred)". **The cron note is right** (measured, §2). Row 7 is corrected to "code live; not scheduled; manual runs only (`#169`)".
- **SIM — silent, a governance gap:** nothing in the B75 block says what an archive object's row count *means*, or that `xstock_bar_archive_exact_evidence` exists. This batch adds both, and the trigger that ties them.
- **System Manual — silent:** "Data Lifecycle Policy (B75)" (`:12190-12250`) describes the manifest as the "single source of truth" and the "rehydration seam", with no word on completeness. Under `architecture` it gets a content update: the basis column, its four values, what `source-count-matched` does and does not prove, and the four gates.
- **No contradiction** between the scope and either document: both are silent, not opposed.

## 5. LEDGER (§9.5(b-ii)) — SEARCHED BEFORE ANY FINDING
- **`#1195`** (CC-C, 2026-10-15) — the parent; this batch is its recording half. Kyle's option 3 is recorded on it.
- **`#169`** (OPEN, 2026-06-01) — the ctx lane's buffered upload could run out of memory, which is why it was never scheduled. **Cross-reference, not a finding.** This batch touches the ctx lane only for consistency (label, evidence, the active-skip rule) and does **not** schedule it. Scheduling stays with `#169`.
- **`STORAGE_POLICY.md` §9.A** heads 12 tables "ARCHIVED **then** dropped — safe". **For every copy made from 2026-05-06 to 2026-10-16 that word is now unproven.** Corrected under OBJ-4 (finding A4).
- **`STORAGE_POLICY.md` §9.D** says `context_bridge_log` "**Is** tiered". That is true of its 6 objects. It is now annotated "not scheduled since B75 (`#169`)".
- No existing issue records any of A1-A7 below. Each is either new or a scope objective, and none is a decided design reported as a defect.

## 6. PROVENANCE (§9.5(b))
- `bridge/canonical/`: **no coverage** — B75 is from 2026-05, after the corpus.
- Git origins (scope §2a, re-read):
  - B75 `f4e6a73f6` (manifest, sweep, ctx, rehydrate);
  - page rule `565b605f0`, quoted verbatim in the scope;
  - cold rotator `1ee802fd3`, then B-STORAGE-HARDEN;
  - plain-archive lane `f3d5fa54a` (`#599`);
  - evidence table and module: B-XSTOCK-BAR-AVAILABILITY `4be3426e9`, `6dadbb614` (CC-C).
- **The intent, verbatim (SIM B75):** *"we don't ever drop data"*; the manifest is *"the rehydration seam"*.
- **The batch serves that intent directly:** a seam that reports a short copy as whole breaks the never-drop promise at the one place it is checked later.

## 7. FINDINGS (each falls into the plan in §8)
| # | finding | evidence | disposition |
|---|---|---|---|
| A1 | The manifest has no completeness field, and `row_count` is the exported count only | §3.1; the hotfix note | scope OBJ-1 |
| A2 | The proof table exists, is pinned to one table, and is empty | §3.2 | scope §2b, OBJ-7 |
| A3 | The evidence writer hard-codes `source_table`, `tier` and `cursor_contract` (sweep `:576`; `exact-archive-evidence.ts` VALUES and the replay compare) | Langston condition 1 | OBJ-7 |
| A4 | `STORAGE_POLICY.md` §9.A calls the archived tables "safe" | §5 | OBJ-4 |
| A5 | SIM row 7 contradicts the SIM's own cron note | §4 | folded: SIM update |
| A6 | The four gates accept presence; the resume skip would manufacture a proof on re-export | §3.4, Langston C-6 | OBJ-8 |
| A7 | 4 sweep alerts, none keyed; 2 for one partition | §3.7 | OBJ-5 |
| A8 | `perpfeed-gate-test --clean` deletes manifest rows. Once a proven object has an evidence row, the FK (no `ON DELETE`) **blocks that delete** and the append-only trigger blocks removing the evidence. | §3.1, §3.2 | **folded, and no code change:** the harness's own header says `--clean` is "abort path only — after a successful positive leg there is nothing to clean". Its only row today is legacy (no evidence), so `--clean` still works for it. A comment is added at `:121` saying a proven object cannot be cleaned. |
| A9 | The ctx lane is unscheduled | §2 | cross-reference to `#169`; no work |
| A10 | A `migrated` label that re-exported would gain a warm copy that shadows its cold copy in the rehydrate CLI (warm preferred by label, `:148-153`) | Langston B-1, followed through | **made unreachable by P3.2's refusal**; P7 still lists every tier |
| A11 | The partition lane's alert has three classes (`:1156-1170`), so a fourth failure kind would land in the "likely transient" arm | Langston B-2 | P3.4 |
| A12 | `engine` is defined as "no timer script" (`system-alerts.ts:146-149`). At runtime, the two machine timer scripts resolve as `cli`: `governance-checker` 67 rows (Langston's read; mine was 66, taken earlier) and `deploy-drift-monitor` 30 (measured across every resolved row on staging), because they go through the CLI. The sweep would be the first timer script to resolve in-process. | Langston B-4 | P4 |
| A14 | **The plain-archive lane never marks a label `active`.** `markLabelsActive` and `updateManifestActive` are called only in the partition lane (`:729`, `:796`), so after the delete its labels stay `verified`, and a later row for the same day would be reused and deleted unarchived | Langston r3's argument, applied to the plain lane | P3.6 |
| A13 | **The rehydrate CLI crashes on every rotated label (new, measured).** `queryManifest` admits `migrated` (`b75-rehydrate.ts:103`), and the warm-first map (`:148-153`) then picks the warm `migrated` row, whose object the rotator deleted by design (`b75-cold-rotator.ts:343`). Run on staging, read-only into a temp folder (`--table context_bridge_log --from 2026-02-05 --to 2026-02-06`): `manifest matches: warm=1 cold=1`, then `fatal: … warm download (file) failed: … 404 … NoSuchKey` at `:175`, and nothing written. The control is the matched pair and the error naming the deleted object. **Reach:** all 3 `migrated` labels today; and since warm rotates to cold after 365 days, every object eventually. **Provenance:** the reader was written at B75, when cold was dry-run; the rotator was activated at B-STORAGE-HARDEN Wave A (07-08), and the reader's tier choice never changed. No ledger entry (searched `rehydrate`). | **folded into P7 (disposition 1):** P7 already rewrites the tier choice. Recorded on `#1195` at Step 10. |

## 8. IMPLEMENTATION PLAN (each item names its finding)
**P1 — migration `2026-10-17-b-b75-export-completeness.sql` + rollback (A1, A2, A6).** One transaction:
1. **The manifest column.**
   - `ALTER TABLE data_archive_manifest ADD COLUMN completeness_basis TEXT NOT NULL DEFAULT 'unrecorded'`, with a CHECK over the four values.
   - **Backfill:** `unverified-legacy` where `created_at < '2026-10-16T09:45:18Z'`; `gate-deployed-unrecorded` for the rest. At deploy time "the rest" is every row exported since the hotfix. Ordering is safe: `created_at` and `verified_at` agree on all 572 rows (§1 of the scope), and the placeholder row falls in the legacy group.
2. **The evidence table, generalised (scope §2b).**
   - Drop `…_source_table_check` and `…_tier_check`.
   - Replace `…_cursor_contract_check` with a two-value CHECK.
   - Rename the table, its 11 remaining constraints, its 2 triggers and its 2 indexes.
   - `COMMENT ON TABLE` states the two-column key intent.
3. **The tie, as a trigger.** A `BEFORE INSERT OR UPDATE OF completeness_basis` trigger on the manifest raises when `NEW.completeness_basis = 'source-count-matched'` and
   `NOT EXISTS (SELECT 1 FROM data_archive_exact_evidence e WHERE e.source_table = NEW.source_table AND e.partition_label = NEW.partition_label)`.
   - **Exactly two columns, deliberately — not `manifest_id`, not tier (Langston B-3).** The evidence's key is `manifest_id` (PK and FK), plus `UNIQUE (source_table, partition_label, tier)` (`obs.sql:75`). The rotator's cold row is a different `id` with no evidence of its own (`:303-317`). So only this predicate lets P6 carry the label.
   - **`COMMENT ON TRIGGER` says why:** a cold row inherits the warm row's proof, because moving a copy to cold does not change what it holds. It also states the ordering invariant: every writer that stamps the label must insert the evidence first, in the same transaction. There are three such writers (P3.1, P5, P6). P6 never inserts evidence, because it inherits.
   - **Plain `BEFORE`, not `DEFERRABLE` (Langston agreed):** it fails at the offending statement, not anonymously at COMMIT.
   - **Step order is safe either way:** the backfill (P1.1) writes only `unverified-legacy` and `gate-deployed-unrecorded`, never `source-count-matched`.
4. **The replay guard.** The 10-15 file's evidence statements (`:59-77`, `:113-121`, `:303`) are wrapped in `DO` blocks that skip when `to_regclass('data_archive_exact_evidence') IS NOT NULL`. **This is CC-C's applied file;** CC-C agreed at 04:2xZ.
5. **The rollback.**
   - Drop the tie trigger and the column.
   - Reverse the renames.
   - Restore the single-value contract CHECK and the two pins **only if no row violates them**; otherwise leave them off, keep every row, and `RAISE NOTICE` (Langston condition 2).
6. **No Drizzle change:** `data_archive_manifest` has zero references in `shared/`. It is raw SQL, so there is no `schema.ts` edit (Langston note). **The table has two definition sites in the migration history:** `2026-04-22-initial-schema.sql:2884` (the dump) and `2026-05-06-b75-data-lifecycle.sql:39`. The new column is added by `ALTER` only, so both stay valid. The rollback drops only what this batch adds.
7. **Registered in `MANIFEST.txt`.** Both files are force-added; the rollback is tracked, per the shared `MEMORY.md` correction.

**P2 — `exact-archive-evidence.ts` (A2, A3).**
- `recordExactArchiveEvidence` takes `sourceTable`, `tier` and `cursorContract` as inputs, and writes and compares against them, not literals.
- A `producing_build_sha` mismatch on replay is **logged** with both shas and does not refuse; the stored value is kept (JC-4).
- The exported names (`XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT`) stay, so CC-C's capacity gate import is unchanged.
- A new `LEGACY_TS_TIEGROUP_CURSOR_CONTRACT = 'text-ts-tiegroup-v1'`.

**P3 — the sweep, `b75-retention-sweep.ts` (A1, A3, A6, A7).**
1. **Every export writes evidence, inside one transaction (OBJ-7, R-1).**
   - After the download verify (`:563-569`), build the evidence for every spec, not only the exact lane (`:572`), with `sourceTable: spec.parent` (fixing `:576`), the export's tier, and the spec's contract.
   - Then, in one transaction, run three writes in this order: evidence insert → `completeness_basis = 'source-count-matched'` → `verified`, replacing the bare statements at `:613` and `:615`.
2. **The resume decision (`:516-520`), rewritten — the DECISION (Langston's r2 blocker).** r2's "`migrated` falls through and re-exports" is withdrawn, and the reason is the evidence writer's conflict target:
   - `upsertManifestPending` returns the **existing** row's id on conflict (`b75-retention-sweep.ts:337-353`).
   - `recordExactArchiveEvidence` conflicts on `manifest_id` and does nothing (`exact-archive-evidence.ts:68`). A re-export of a label that already has evidence would therefore keep the old proof, fail the replay compare (`:81-105`) with a bare `Error`, land in the "likely transient" arm every night, and leave row M `uploaded` with a short `row_count` under a proof that describes other bytes.
   - That is the general case after this ships, not an xStock edge: after deploy every new object has evidence.

   **The rule, one row per state, decided at ONE site BEFORE any upload.** It is a pure function, `decideExistingCopy(row, evidenceExists)`, returning `export | reuse | refuse(reason)`.
   - **Called from:** `archiveOneObject` (`:517`), used by the whole, sliced and plain lanes; and the ctx lane's skip (`ctx:133-138`).
   - **The whole path's short-circuit at `:703-714` is deleted,** so the whole path reaches it through `archiveOneObject` (Langston r3: hoist or route; I route).
   - **Row presence is MEASURED, not assumed (Langston r4).**
     - The sliced path (`listPresentDates`, `:745`) and the plain lane (`:900`, `:923`) enumerate labels from rows.
     - **The whole path does not:** `listOldPartitions` (`:244-281`) enumerates child partitions by name and age, and `:703` passed `partition.partitionLabel` straight through. The deleted short-circuit was the only thing between an empty re-created past child and the decision.
     - So `archiveOneObject` runs one probe before deciding: `SELECT 1 FROM <partitionTableName or table> WHERE <ts> >= rangeStart AND <ts> < rangeEnd <extraPredicate> LIMIT 1`. All of those are in scope at `:517`.
     - The result, `rowsPresent`, is an input to `decideExistingCopy`. **A refusal that claims new rows can fire only when the probe found one,** so its body is a measured claim.

   | existing warm row for the label | decision | why |
   |---|---|---|
   | none | export | the normal path |
   | `verified`, basis `source-count-matched` | **reuse** (skip) | proven, and the source was not yet dropped or deleted. This is the legitimate mid-run resume (the sliced path's day loop, a crash between verify and drop). No alert. |
   | `verified`, any other basis | **refuse** | C-6: a re-export could only prove the leftover rows |
   | **`active`, ANY basis, `rowsPresent`** (Langston r3) | **refuse** | `active` is set only after the drop or delete (P3.6 makes the plain lane true too), so rows present now are new rows outside a closed copy. Reusing would run `dropAndMarkActive` and destroy them; re-exporting would overwrite the closed copy with only the new rows. **Refusing is right even when the basis is `source-count-matched`.** |
   | **`active`, any basis, NOT `rowsPresent`** (Langston r4) | **skip**, `skipped: already-active`, as today; no alert | an empty re-created past child; nothing to protect and nothing to claim |
   | `migrated` / `migrating`, any basis, `rowsPresent` | **refuse** | the cold copy is the copy of record; a re-export would split one label into two partial copies |
   | `migrated` / `migrating`, any basis, NOT `rowsPresent` | **skip**, no alert | same reasoning as the empty `active` case |
   | `pending` / `uploaded` | export **only if no evidence row exists for M**; otherwise **refuse** | an existing proof for M with a non-final state means the state was reset under a proof |

   - The refusal body names which row fired. The `active` row's body says *"rows found for a label already archived and dropped/deleted — they are NOT in the archived copy, and they are kept hot"*. That separates it from the `verified` reuse, which raises no alert.
   - **Every refusal** uses the `isNonProven` class (P3.4): `critical`, permanent until a human acts, and it names the retained hot size. Nothing is uploaded, no evidence is written, and no object or manifest field is overwritten. The hot rows stay.
   - **Reach today:** none. 0 of 568 pre-hotfix rows overlap a live hot child, and 0 evidence rows exist. After deploy, a refusal needs hot rows to appear for a label already archived — rows written with an old timestamp.
   - **The tests change accordingly:**
     - **the WHOLE path specifically:**
       - an `active` row with a live child **holding rows** now refuses with `isNonProven`, where the deleted short-circuit returned `skipped` (Langston r3);
       - an `active` row with an **empty** re-created child still returns `skipped: already-active`, with no alert (Langston r4);
       - both are regression cases for `:703`. The probe is mutation-proved: forced to `true`, the empty case must page.
     - `active` refuses even with `source-count-matched`; `verified` + `source-count-matched` reuses, with no alert;
     - `migrated` refuses, `migrating` refuses;
     - `pending` with no evidence exports;
     - `pending` with evidence refuses before the upload;
     - in every refusal: no `uploadWarmFile` call, no evidence insert, no manifest update.
   - **A10, re-read against this rule:** the sweep can no longer create a warm copy beside a cold one, so the shadowing cannot arise from the sweep. P7 still lists every tier per label: the `migrated` warm row plus its cold row is today's normal state for 3 labels, and any future mixed state must be visible, never silently chosen.
3. **The DROP gate (`:775-793`) and the plain gate (`:922-935`)** add `completeness_basis = 'source-count-matched'` to their state predicate. The plain gate's refusal mints an alert instead of only logging.
4. **Alerts (OBJ-5).**
   - **A fourth class, `isNonProven` (Langston B-2).** `ProcessResult` gains it beside `isChecksumMismatch` and `isCountMismatch`, so the C-6 refusal never lands in the `:1166` "likely transient" arm. Its body says the refusal is **permanent until a human acts**: the existing copy is not proven, a re-export could only prove the rows still hot, and the hot partition is kept, so its bytes stay on the database disk every night it refuses. It names the label's hot size. **Severity `critical`**, because the disk is the measured constraint (`e656e5d4`, 67.5% of the 200 GB cap) and a refusal grows it daily.
   - Keys `b75-sweep:<parent>:<label>:<class>`, `b75-plain:<table>:<class>` and `b75-sweep:fatal`. The non-proven class is `…:non-proven-existing`.
   - On each success, `resolveAlertsByDedupeKey` for that parent+label's three classes (or that table's), as `b75-retention-sweep`. At the DONE line, the same for `b75-sweep:fatal`.
   - `non-proven-existing` has **no** automatic resolver; it needs a human disposition.
   - Bodies name the run start time and point at the log; no counts.
5. **Wording (OBJ-6).** The plain catch (`:999-1005`) names a count mismatch; the `:1165` promise is rewritten to say a mismatch keeps failing safely and needs investigation.
6. **The plain lane marks its labels `active` after the delete (A14, new).** Today the plain-archive lane leaves every label `verified` forever (the only `active` writers are `:729` and `:796`, both in the partition lane). So a late row with an old timestamp would meet a `verified` + proven row, be reused at (c), and **be deleted by the age-delete without being in the archive.** After its delete loop finishes, the lane runs `markLabelsActive` (`:400`) for every present label. Those are exactly the days whose rows the delete just removed.
   - **Mechanics (Langston r4 record 2):** `labels` (`:923`) is block-scoped inside the `present.length > 0` branch, which closes at `:966`, while the delete loop is `:973-987`. The implementation hoists `labels` (and `present`) to the table's scope before the branch, and calls `markLabelsActive` after the loop only when the archive branch ran.
   - `markLabelsActive` pins `AND state = 'verified'` (`:411`)., so the `active` row above refuses that case.
   - **Reach today:** none. The plain-archive tables have 0 manifest rows.
   - **Semantic note:** `active` then means "the source rows for this label were removed", for both lanes.
     - **The timestamp moves with it:** `markLabelsActive` also stamps `hot_partition_dropped_at = NOW()` (`:408`). In the plain lane nothing is dropped, so the column means "the source rows were deleted at". A later reader dates the removal from that column.
     - The SIM states both the state value and the column, and the System Manual chapter states the column's two lane meanings.

**P4 — `system-alerts.ts` (A7, A12).**
- Add `{ value: 'b75-retention-sweep', tag: 'machine', why: … }` to `ALERT_ACTORS` (`:212`).
- **The transport (Langston B-4): a new CLASS, `timer-script`.** It covers a scheduled process outside the server runtime that resolves in-process, without the CLI. It is added to `ResolveTransport` (`:150`) with a definition beside `engine`'s (`:146-149`).
  - **Not `engine`:** its own definition excludes timer scripts, and every `engine` call site is a server-runtime service.
  - **Not `cli`:** `cli` records that a resolve arrived through the CLI, and the two timer scripts that use it do go through the CLI (A12). The sweep would not, so `cli` would be a false provenance stamp.
  - **A class, not a per-caller value:** the sweep is told apart by its actor. Any later timer script that resolves in-process uses the same class.
  - `ResolveTransport` has one consumer file (Langston), so the change has no drift surface.
- **The dead `governance-checker` transport value is removed (rule 18; Langston record item 1).** It has **0** resolved rows ever (Langston's read of every resolved row). No code passes it: a whole-tree grep finds the literal only in the type at `:150` and in unrelated `source:` metadata fields (`census.mjs:736`, `:825`, `poller.mjs:619`). The checker resolves through the CLI, as `cli`. The removal is logged in `DELETED_COMPONENTS_LOG.md` at Step 10.
- My r1 wording "as the other machine resolvers use" was a wrong-population claim, and it is withdrawn.
- Check `dt-deploy`'s derived table: machine actors are excluded, per the shared MEMORY note.

**P5 — `context-bridge-log-ttl.ts` (A1, A3, A6).**
- After verify, the same transactional evidence + stamp, using the export's actual tier (it may be `cold` after the 413 fallback, `:214-219`).
- The active skip (`:133-138`) follows the C-6 rule.
- **Still unscheduled** (`#169`).

**P6 — `b75-cold-rotator.ts` (A1).** `completeness_basis` goes into both the `INSERT` column list and the `ON CONFLICT … DO UPDATE SET` list (`:303-317`). **Its test is the inheritance case specifically (Langston B-3):** a warm `source-count-matched` row with evidence rotates, and the cold row is admitted by the trigger with no evidence of its own. A warm `unverified-legacy` row rotates to an `unverified-legacy` cold row.

**P7 — `b75-rehydrate.ts` (A1).**
- `queryManifest` selects `completeness_basis`.
- Per object it prints `completeness=<basis>`, and `rows(unproven)=` for anything not `source-count-matched`.
- The total splits into proven and unproven.
- One warning per non-proven object names its range.
- **A13:** a warm row in state `migrated` **or `migrating`** is never a download candidate, because its object is gone by design or is being removed. `migrating` is declared in the CHECK and admitted at `:103`, but no code writes it (Langston's whole-tree grep, positive control 8 hits). It is excluded so the reader cannot pick a half-moved copy if a writer ever appears. The label falls to its cold row, using `--restore-cold` as today.
- **A10:** when a label has objects in more than one tier, every tier's object is listed with its basis. A warning says which one is downloaded and that the other exists. The CLI never silently picks one.
- Writes `<file>.completeness.json` beside each file.

**P8 — every reference to the old name (A2, Langston C-2).** `git grep xstock_bar_archive_exact_evidence` over the whole repo at the ref returns **19 lines in 6 files**, plus 5 lines in this batch's own scope and pre-audit (24 in 8, Langston's count). All 19 are named here:
  - `b-xstock-bar-availability-capacity-gate.ts:125`, `:609` → new name;
  - `exact-archive-evidence.ts:63`, `:85` → new name;
  - `b-xstock-bar-availability-archive.test.ts:168-169` → new name;
  - `b-xstock-bar-availability-observation.test.ts:204`, `:212` → **left unchanged, on purpose:** they assert the text of the 10-15 file, which keeps the old name inside its replay guard. A test confirms the guarded text still contains those strings;
  - `2026-10-15-…-observation.sql` (10 lines: `:59`, `:113-116`, `:118-121`, `:303`) → wrapped by the P1.4 replay guard, old name kept;
  - `2026-10-15-…-observation-rollback.sql:15` (`COMMENT ON TABLE`) → **ordering matters:** run after this batch's migration, it would fail on the old name. It gets the same guard and names whichever table exists. **P1.5's rollback must run before CC-C's 10-15 rollback**, and both rollback headers say so.
- Re-run the grep after the change and state its result in the Step-4 change list.
- A comment at `:125` says the relation now holds every lane's evidence (C-9, CC-C's choice).

**P9 — `perpfeed-gate-test.ts` (A8, Langston C-1).** **Reorder `--clean`, rather than only comment it.** Today it runs `DROP TABLE` (`:124`) before the manifest `DELETE` (`:126`). For a proven object the `DELETE` is blocked, so the harness would be left half-cleaned: partition gone, manifest row permanent. A later `--seed` would then pass, the resume skip would reuse the proven row, and the gate test would pass without exercising the export.
- **Fix:** delete the manifest rows first. If that delete is refused, stop **before** the drop, with a message that names the cause.
- **Then the comment:** after this deploy, the harness is single-use for any label it has proven, and the only recovery is P1.5's rollback.
- **Record 1 (Langston r4):** `--seed` (`:74`) creates a past child, `2025-01-15`, and its manifest row is live today (`xstock_perp_ohlc_1m` warm `active`).
  - An aborted run leaves that child behind. With r5's probe, an empty leftover child only skips; a leftover child **with rows** would page `critical` nightly with no resolver.
  - So the recovery note says: drop the leftover child (`DROP TABLE xstock_perp_ohlc_1m_2025_01_15`) as well as running the rollback. `--clean`'s reordered path refuses before the drop, which leaves exactly that state on purpose.
- A test covers the refused-delete path.

**P10 — documents (A4, A5).**
- `STORAGE_POLICY.md`: §9.A wording, §9.D annotation, and a new subsection for the window, the cause, Kyle's decision and the four values, saying what the label does not mean.
- The SIM B75 block: row 7 corrected; the evidence table, the trigger and the gates added.
- The System Manual Data Lifecycle chapter.
- Plus the architecture-class document set at Step 10.

**Tests (one file per area, all mutation-proved):**
- `b-b75-completeness-migration.test.ts`:
  - the four-value CHECK;
  - the tie trigger refuses without evidence and admits with it (Langston condition 1, non-xStock);
  - the replay guard leaves exactly one evidence table;
  - the rollback's conditional pin restore.
- `b-b75-completeness-sweep.test.ts`:
  - the evidence row carries `spec.parent` and the actual tier;
  - the transaction order;
  - the C-6 refusals at (c) and (d) write no evidence and overwrite nothing;
  - the five-row resume decision in P3.2, each row its own case;
  - the refusal carries `isNonProven` with its own body and `critical` severity, and never the "likely transient" text (B-2);
  - gates (a) and (b);
  - OBJ-5's suppression, its positive control (a different parent/label/class mints), resolve-on-success, and re-mint after a resolve.
- `exact-archive-evidence` tests:
  - first-write-wins (CC-C);
  - the xStock contract still passes the capacity gate's proof (CC-C);
  - a build-sha mismatch logs and does not refuse.
- Rehydrate and rotator: one test each.

**Deploy:**
- One `dt-deploy` (migrate between build and restart), **outside 02:00-02:30Z**.
- The first proof is the next 02:15Z sweep: every new row is `source-count-matched` with one evidence row whose three counts are equal.
- Then the census reads 568 / N / 0 / 0.

**Nothing in this plan is UNAUDITED.** Every item names a finding above.

## 9. PLAIN-LANGUAGE SUMMARY
The audit found what the plan expected, plus three things worth knowing:
- **The internal message log's archive job has never been scheduled.** It is a known, recorded memory issue, so this batch leaves the schedule alone.
- **Two of our documents were wrong or contradicted themselves.** The storage policy calls the old archive copies "safe". The system map lists that unscheduled job as live. Both get corrected.
- **A test script can no longer delete a proven copy's record.** That is the right outcome, and it gets a comment.

**The plan:**
- add the "complete / possibly incomplete" label to every archive record;
- widen ANALYST Claude's proof record to cover every table;
- have the nightly archive store a proof for every new copy and refuse to delete, or to reuse, anything unproven;
- stop repeat alerts piling up night after night;
- make the reload tool show which copies are unproven.
