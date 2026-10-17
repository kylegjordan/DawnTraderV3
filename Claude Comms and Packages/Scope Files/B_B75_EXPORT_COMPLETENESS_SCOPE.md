# B-B75-EXPORT-COMPLETENESS — SCOPE r5 (2026-10-17)

change-class: architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` §0a stage 3, the urgent storage-safety interrupt · **Issue:** `#1195` · **Reviewer:** Langston
**Why `architecture`** (Langston agreed at r2): this batch changes a shared table's columns, an existing evidence table's constraints, and what four gates and one reader accept. The manifest is defined only in `drizzle/migrations/2026-05-06-b75-data-lifecycle.sql`, not in `shared/schema.ts`.

> **Revision record.**
> - **r1** `a6f79a9eb`.
> - **r2** `1f149e572`: added OBJ-7.
> - **r5** (this file) answers Langston's r3 CHANGES (04:13Z):
>   - C-6 → OBJ-8, rewritten: a non-proven existing copy is refused, never re-exported; the real reason exposure is zero, measured;
>   - C-7 → already answered in r4 (OBJ-5 keys and resolves all three sites);
>   - C-8 → §2b, the full rename census and a replay guard;
>   - C-9 → §2b item 2, the over-charge quantified;
>   - the cold rotator's `ON CONFLICT` list, R-1 and R-2 → OBJ-2 and OBJ-7;
>   - OBJ-4 → states what the label does NOT mean;
>   - board card created (`PVTI_lAHODmulEM4BfQP4zhBZsXA`).
> - **r4** `d6f75f27b` folds Langston's second r2 reply (03:16Z: name the cut window; all three alert sites; a positive control; a body that points at the log) and ANALYST Claude's three conditions on the evidence table (03:09Z).
> - **r3** `5bb7f0669` answered Langston's r2 CHANGES:
>   - C-1 → OBJ-1 and §2b;
>   - C-2 → the basis values in OBJ-1;
>   - C-3 → `pre-page-rule` withdrawn, §1;
>   - C-4 → OBJ-6;
>   - C-5 → OBJ-8, widened by a census to four gates;
>   - the fold-ins → OBJ-3 and OBJ-5;
>   - the two citation errors → corrected;
>   - §2 → per-module provenance.

## 0. WHY, AND WHAT IS ALREADY DONE
- **The forward loss is closed.** The hotfix `B-B75-COUNT-GATE` (deployed `b678ef0f6`; Langston confirmed the close at 02:37Z on 2026-10-17) counts the source inside the export snapshot and throws before COMMIT on any difference.
- **Kyle decided on 2026-10-17 (option 3):** recover nothing; record the gaps everywhere.
- **What remains:**
  - make the gap impossible to miss for anyone who reads that period later;
  - make every gate that deletes or reuses an archive copy require proof, not presence;
  - Langston's F2 and F4.

## 1. MEASURED (`data_archive_manifest`, staging, 2026-10-17; Langston re-derived the window split at `cd75148fc`)
**572 objects across 12 source tables.**

| group | objects | rows | basis |
|---|---|---|---|
| exported before the hotfix | **568** = 561 warm active + 4 cold active + 3 warm migrated | 810,604,186 | no source count was ever taken |
| exported after the hotfix | **4** warm active, all `2026-09-16` (`crypto_perp_ohlc_1m`, `crypto_perp_ticker_snap`, `signal_eval_archive`, `xstock_spot_ticker_snap`) | 6,937,105 | the in-snapshot gate fired on none of them; no count was stored |

- **The two timestamp columns agree on every row.**
  - `created_at` and `verified_at` fall on the same side of the deploy (2026-10-16T09:45:18Z) for all 572 rows.
  - The four post-hotfix rows were created 02:15-02:23Z on 10-17 and verified 02:20-02:27Z.
- **C-3, withdrawn:** r1/r2's "pre-page-rule" object is not one.
  - It is `exit_decision_archive` `2026-05`, warm, migrated, 4,145 rows.
  - Its `created_at` reads `2026-01-01 00:00:00+00`, a placeholder: its contents span `2026-05-05 13:02` → `2026-05-31 23:43`, so it was written no earlier than 05-31, after the page rule.
  - No writer of that value exists in the repo (searched `drizzle/migrations` and `server/scripts`).
  - It joins the 567, so the third label is gone.
  - **The window is therefore defined by evidence (no stored source count), not by `created_at`.**
- **The cold rows are of two kinds:**
  - three `context_bridge_log` months (`2025-12`, `2026-01`, `2026-02`) went straight to cold by the 413 fallback (`context-bridge-log-ttl.ts:196-222`), so they are originals;
  - `exit_decision_archive` `2026-05` is the cold rotator's copy of the warm object above.
- **Known shortfall:**
  - `crypto_perp_ohlc_1m`: 27 nights at exactly 240,000, against 264,960 = 184 symbols × 1,440 (Langston).
  - `signal_eval_archive`: about 2.1% short on the 09-16 replay.
  - The ticker snapshots: about 0.1-0.3% short.
  - The rest: unknowable — the sources are gone.
  - **For the bars, a method, not a number:** each day's expected count is distinct symbols × 1,440, an upper bound, derived from its own warm copy. No figure is asserted before it is measured.

## 2. PROVENANCE (tier 1)
**The defect.** `565b605f0` (2026-05-06), verbatim: *"Trade-off: strict '> lastTs' would skip rows sharing exact timestamp value. For context_bridge_log (UUID id + ms timestamp resolution + random broadcast arrival) exact ties are negligible, and the sweep's row_count + min/max_ts manifest verify catches any anomaly."*
- The trade-off was judged for one table, and the exporter then served the B74 tables, where ties are routine.
- The verify premise was false: `row_count` and min/max come from the export itself.

### 2a. Per module — what each was built to do, and its disposition under the five
| module | built by, and for | disposition |
|---|---|---|
| `data_archive_manifest` | B75 `f4e6a73f6` (`BATCH_75_SCOPE.md` §C): the crash-safe lifecycle row per archive object (pending → uploaded → verified → active → migrating → migrated). **Mutable by design.** | **(2)** — it never recorded completeness; gains the label (OBJ-1) |
| `server/services/data-archive/partition-exporter.ts` | B75 `f4e6a73f6`; keyset paging `87c1c50a2`/`565b605f0`; the count gate `b678ef0f6`. **A streaming export of one range inside one `REPEATABLE READ` snapshot.** | **(2), not changed.** It already returns `sourceRowCount` (`:109`, `:327`); this batch only stores it |
| `server/scripts/b75-retention-sweep.ts` | B75 `f4e6a73f6`, built to move aged partitions to warm and drop hot only after a verified copy. Later additions: streaming and per-day slices (B-NEW-47 `e984aefac`, `#161`); plain-table age-delete (P19-B5c `dc8350110`); the trade tables' archive-then-delete lane (B-TRADE-TIER-REGISTER `f3d5fa54a`, `#599`). | **(2)** — its two gates and its resume skip accept presence; they must accept proof (OBJ-8); it writes the evidence (OBJ-7) |
| `server/scripts/context-bridge-log-ttl.ts` | B75 `f4e6a73f6` (`BATCH_75_SCOPE.md` §C.3): export whole months, then age-delete. Langston's B2 fix keeps partial months hot ("never drop data"); `924bfa045` adds the 413 fallback straight to cold. | **(2)** — writes the label and evidence for its own exports (OBJ-2); its "already active" skip is one of the four gates (OBJ-8) |
| `server/scripts/b75-cold-rotator.ts` | B75 Phase 2 `1ee802fd3`; B-STORAGE-HARDEN OBJ-1 fixes. **Copies a verified warm object to B2 and inserts the cold row by `INSERT … SELECT` from the warm row** (`:303-317`). | **(2)** — the column list must carry the label, or every cold copy silently takes the default (OBJ-2) |
| `server/scripts/b75-rehydrate.ts` | B75 `f4e6a73f6`: the analytics pull-back CLI (*"Future ML/analytics schedulers will wrap this script"*). It prints `rows=<row_count>` per object (`:178`, `:205`) and sums it (`:181`, `:208`, `:220`). | **(2)** — it is the read path where a short copy reads as whole (OBJ-3) |
| `xstock_bar_archive_exact_evidence` + `server/services/data-archive/exact-archive-evidence.ts` | B-XSTOCK-BAR-AVAILABILITY (`#707`, **CC-C**, migration `2026-10-15-…-observation.sql`; Step-9 `6dadbb614`). **An append-only proof** that source = exported = downloaded for one export, guarded against UPDATE, DELETE and TRUNCATE. It is pinned to `source_table = 'xstock_bar_revision_event'`, `tier = 'warm'` and one cursor contract. **0 rows**, because that table is in none of the 572 manifest rows (Langston's control). | **(2)** — this is the proof OBJ-1 needs, already built; it is generalised rather than duplicated (§2b, OBJ-7) |
| `server/scripts/b-xstock-bar-availability-capacity-gate.ts` | CC-C's capacity gate. It reads the evidence table joined to the manifest, filtered to `xstock_bar_revision_event` (`:595-617`). | **(2)**, a reader of the renamed table; its query is updated in the same commit, and its semantics are unchanged by the filter it already carries |

### 2b. C-1 — the disposition of the existing evidence table
**Generalise it, and do not build a second home.**
- **One home for the proof.** The source, exported and downloaded counts live once, in the evidence table, for every lane.
- **The manifest label is a derived pointer, and the database enforces it.** A constraint trigger refuses `completeness_basis = 'source-count-matched'` on any manifest row with no evidence row for that `(source_table, partition_label)`. So the label can never claim a proof that is not stored.
- **Changes to the table:**
  - drop the `source_table` pin;
  - drop the `tier` pin (the context-bridge 413 fallback exports straight to cold, so an export's own tier can be cold);
  - widen `cursor_contract` to a fixed set of two — CC-C's `jsonb-text-v1:arrived_at-timestamptz+revision_id-uuid`, and `text-ts-tiegroup-v1` for the hotfix's legacy-mode cursor;
  - rename it to `data_archive_exact_evidence`, because a table named for xStock bars that holds one-minute-bar evidence is the name-not-thing error we keep making.
- **Kept unchanged:** the append-only triggers, the two equality CHECKs and `UNIQUE (source_table, partition_label, tier)`.
- **Blast radius of the rename (C-8; Langston enumerated 19 references in 6 files):**
  - `exact-archive-evidence.ts:63`, `:85`;
  - the capacity gate at `:125`, `:609`;
  - two test files (`b-xstock-bar-availability-archive.test.ts:168-169`, `b-xstock-bar-availability-observation.test.ts:204`, `:212`);
  - **the forward migration that created it**, `drizzle/migrations/2026-10-15-b-xstock-bar-availability-observation.sql`: `:59` `CREATE TABLE IF NOT EXISTS`, the two guard triggers `:113-121`, `:303` `COMMENT ON TABLE`;
  - its rollback, `…-observation-rollback.sql:15`.
- **The rename moves every database name with it, not only the table** (`ALTER TABLE … RENAME TO` carries none of them). Read on staging:
  - **13 constraints:** `…_pkey`, `…_manifest_id_fkey`, `xstock_bar_archive_exact_evid_source_table_partition_label__key`, `…_check`, `…_check1`, and the `…_cursor_contract`, `…_downloaded_row_count`, `…_exported_row_count`, `…_object_checksum`, `…_producing_build_sha`, `…_source_row_count`, `…_source_table` and `…_tier` checks (the last two are dropped, not renamed);
  - **2 triggers:** `trg_guard_xstock_bar_archive_exact_evidence_mutation` and `…_truncate`;
  - **2 indexes:** the pkey and unique indexes, which follow their constraints.
  - The new migration renames each one explicitly. Its rollback reverses every step and restores both pins.
- **The replay hazard (C-8):** if the 10-15 file is ever run again after the rename, its `CREATE TABLE IF NOT EXISTS` would make an empty table under the old name beside the real one — two homes for one proof.
  - **Fix:** the 10-15 file's evidence statements (`:59-77`, `:113-121`, `:303`) are wrapped so they do nothing when `data_archive_exact_evidence` already exists. A fresh database replayed in order is unchanged: 10-15 creates the old name, and this batch's migration renames it.
  - **The test:** apply the 10-15 file again after the rename, then assert there is exactly one evidence table.
  - ⚠ **This edits an applied migration.** The repo has done that before (57 modifications to `drizzle/migrations/*.sql` since 2026-08-01, counted by `git log --diff-filter=M`), but it is CC-C's file and a judgement call (§5).
- **It is CC-C's table.** ANALYST Claude agreed at 03:09Z to the rename and the widening, with three conditions, all taken:
  1. the same-reads test (OBJ-7);
  2. **the store-size query (`b-xstock-bar-availability-capacity-gate.ts:125`) — C-9, and Langston is right that only `:609` carries a filter.** `:125` adds the whole relation's size into the xStock bar store budget, and a relation's size cannot be filtered. After OBJ-7, the gauge charges xStock for every lane's proof rows.
     - **Size of the over-charge:** about 13 new evidence rows a night (one per object: 12 tables, plus a monthly context-bridge object). At a few hundred bytes a row with its index, that is about 1-2 MB a year, against a 5 GiB archive floor (`:241`). **This is an estimate, not a measurement.** Step 7 measures `pg_total_relation_size` after the first sweep.
     - **ANALYST Claude chose** to keep the table in the list, rather than change the measured set mid-window. So the gauge's meaning changes from "xStock evidence" to "all archive evidence". The change list and the capacity gate's comment say so, and the claim "unchanged semantics" is withdrawn for `:125`;
  3. `xstock_bar_writer_handoff` and the boot tables are not touched.
  - Landing before CC-C's 10-25 window end is fine, because the gate is updated in the same commit.
- **For attack (judgement call 1):** rename vs generalise in place under the old name.

## 3. OBJECTIVES
| obj | objective | verified by |
|---|---|---|
| OBJ-1 | **The register.** `data_archive_manifest` gains `completeness_basis TEXT NOT NULL DEFAULT 'unrecorded'`, with a CHECK over exactly four values: **`source-count-matched`** (an evidence row stores source = exported = downloaded; enforced by the §2b trigger), **`gate-deployed-unrecorded`** (exported under the in-snapshot gate, so a mismatch would have thrown, but no count was stored; basis = the sweep log plus the throw before COMMIT. **The cut:** every object written from the hotfix deploy, 2026-10-16T09:45:18Z, until OBJ-7's deploy. Today that is the 4 rows of 09-16; each nightly run before OBJ-7 lands adds to it, and the backfill runs in OBJ-7's own deploy, so the cut is exact), **`unverified-legacy`** (exported with no source count at all: the 568) and **`unrecorded`** (the default — a writer that did not stamp, which is a defect signal, and fails closed at every gate). Backfill, in OBJ-7's deploy: rows exported before the hotfix deploy → `unverified-legacy` (568); rows exported from it until that deploy → `gate-deployed-unrecorded` (4 today, plus each night until then). **Only `source-count-matched` counts as proven** anywhere in the code. | a census query after deploy: 568 / N / 0 / 0, where N is the rows exported between the two deploys, summing to the manifest total. **A falsifying control:** the trigger refuses `source-count-matched` on a row with no evidence (test plus a staging probe in a rolled-back transaction). Unlike r2's "a post-hotfix object reads proven", this check can fail. |
| OBJ-2 | **Stamped at write, by every writer.** The sweep and `context-bridge-log-ttl` insert the evidence row, then set `source-count-matched` in the same transaction as `verified`. The cold rotator carries `completeness_basis` in both its `INSERT … SELECT` column list and its `ON CONFLICT … DO UPDATE SET` list (`:303-317`); otherwise a pre-existing cold row keeps `unrecorded` after its warm row is proven. **R-1:** at the ref, the evidence insert (`:613`) and the `verified` update (`:615`) are two bare statements; the only `BEGIN/COMMIT` (`:467-473`) is in another function. This batch adds an explicit transaction around the evidence insert, the basis stamp and `verified`, so all three land or none do. | tests per writer, including the `ON CONFLICT` path; the next 02:15Z sweep's new rows read `source-count-matched` with an evidence row each; a cold rotation carries the warm row's value |
| OBJ-3 | **The rehydrate path says so, at the point of print.** The per-object lines (`:178`, `:205`) print `completeness=<basis>`, and a non-proven object's `rows=` is labelled `rows(unproven)=`. The total (`:220`) splits into proven and unproven rows. A warning names each non-proven object and its date range. A `<file>.completeness.json` is written beside every rehydrated file. | a rehydrate of one legacy object prints the label, the split total and the warning; a rehydrate of one proven object prints none (staging, read-only) |
| OBJ-4 | **`STORAGE_POLICY.md`** names the window, the cause, Kyle's no-recovery decision and each basis value's meaning. **It also says what `source-count-matched` does NOT mean:** it proves the copy matches the table *as it stood at export time*. It does not prove the table held everything it should have, which is a recorder's question, not the archive's. | the document at the ref |
| OBJ-5 | **F2, with a resolve edge at every site.** `raiseSweepAlert` (`b75-retention-sweep.ts:833`) has three call sites, and each gets a key and a resolver. **(a) Per-partition** (`:1156`): key `b75-sweep:<parent>:<label>:<class>`, class ∈ checksum, count-mismatch, other; resolved by the sweep's next success for that `(parent, label)`. **(b) The plain lane's catch** (`:999`, the same edit as OBJ-6): key `b75-plain:<table>:<class>`; resolved by that table's next successful run. **(c) The fatal** (`:1201`, no parent or label): key `b75-sweep:fatal`; resolved by the next run that reaches the DONE line. Resolves go through `resolveAlertsByDedupeKey` (`system-alerts.ts:857`) as a new machine actor, `b75-retention-sweep`, added to `ALERT_ACTORS` (`system-alerts.ts:212`); no machine actor names this script today, and #987 forbids a robot claiming a session name. **A deduplicated row replays its body from mint time**, so each body names the run and points at `/var/log/dawntrader/b75-retention.log` and carries no count that goes stale. | tests per site: two failing runs mint one row; **a different parent, label or class still mints (the positive control)**; a success resolves the row; a later failure after the resolve mints again |
| OBJ-6 | **F4, re-pointed (C-4).** The plain lane's catch (`b75-retention-sweep.ts:994-1005`) names a count mismatch when `err` is `ExportRowCountMismatchError`, instead of "retried next run". The partition alert's promise (`:1165`, "keeps failing safely until B-B75-EXPORT-COMPLETENESS lands") is rewritten, because this batch records completeness and does not clear a mismatch. | a test per wording |
| OBJ-7 | **Persist the proof for every lane.** The evidence row (§2b) is written for every export, not only when `exactCursorTieBreakerColumn` is set (`b75-retention-sweep.ts:572`, `:613`). `sourceRowCount` is already on the export result; the downloaded count is taken by `countGzipJsonlLines` as the exact lane does. `updateManifestUploaded` (`:357`) is unchanged. **R-2:** `recordExactArchiveEvidence` compares `producing_build_sha` when a row already exists (`exact-archive-evidence.ts:98`). So an object whose evidence landed but whose `verified` failed can never complete after any later deploy. With R-1 the three writes land together, which closes the common case. The replay compare stays strict for the counts, the checksum and the contract; `producing_build_sha` records the first producer and is no longer compared. This is CC-C's module, so it is for attack (§5). | the next sweep: one evidence row per new object, three counts equal. **ANALYST Claude's condition:** a test that an xStock warm export written by the new writer carries `XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT` and passes the capacity gate's archive proof unchanged |
| OBJ-8 | **Proof, not presence, at every gate, and no proof manufactured by a re-export (C-5, C-6).** **C-6, the hazard:** a re-export counts the source inside its own snapshot (`partition-exporter.ts:178`). So re-exporting a label whose original rows are already gone would match the *leftover* rows, write an evidence row and stamp `source-count-matched` on a short copy — or overwrite the warm object at the same path with fewer rows. **The rule:** a label that already has a non-proven manifest row in state `verified`, `active` or `migrated` is never reused and never re-exported. The run refuses that label, mints an alert (`b75-sweep:<parent>:<label>:non-proven-existing`, no resolve edge but a human's; its body says the hot rows were left in place), and leaves its hot rows where they are. Rows in `pending` or `uploaded` never passed verify, so nothing was deleted against them; they re-export as today. **The four sites:** **(a)** the partition DROP gate (`b75-retention-sweep.ts:775-793`) and **(b)** the plain-archive delete gate (`:922-935`) require `source-count-matched`, and (b)'s refusal mints an alert where today it only logs. **(c)** The resume skip (`:516-520`, which reads `verified` OR `active`) and **(d)** the context-bridge `active` skip (`context-bridge-log-ttl.ts:133-138`) apply the rule above. **Why exposure is zero today, and it is not the reason r3 gave:** every lane enumerates only labels with rows still present in the source — the partition lane's present dates (`:745-752`), the plain lane's present dates (`:900-902`), and the context-bridge lane's months from its oldest live row (`listMonthsToExport`). **Measured on staging, 2026-10-17:** of the 568 pre-hotfix rows, **0** have a date range overlapping a live hot child. The control: the same query enumerated the children of all 11 partitioned source tables (13-45 children each), so it could hit. `context_bridge_log`'s oldest live row is 2026-04-01 00:00:00.151Z, and its newest pre-hotfix month ends exactly then. The plain-archive tables (`closed_trades`, `vts_open_trades`, 365-day retention) have no manifest rows at all. | tests per gate: an `unverified-legacy` row blocks (a) and (b); at (c) and (d) a non-proven `active`/`verified` row refuses with the alert and **writes no evidence row and overwrites no object**; a `pending` row re-exports; a `source-count-matched` row passes |

## 4. OUT OF SCOPE
- **Recovery of the lost rows:** Kyle decided no, 2026-10-17.
- **Proving any legacy object complete:** Langston agreed at r2 — one honest label.
- **Retention sizing:** sprint row 6, Infra Claude.
- **The wake log's bound:** `#1202`.

## 5. JUDGEMENT CALLS FOR ATTACK
1. **Rename plus a guarded edit of CC-C's applied 10-15 migration, or generalise under the old name.** I still prefer the rename (you agreed subject to C-8). If editing an applied migration is a line you would not cross, keeping the name removes the replay hazard entirely, at the cost of a misleading name with a `COMMENT ON TABLE` explaining it.
2. **`gate-deployed-unrecorded` for the 4 post-hotfix rows.** It is honest about a stored-evidence gap that sits on good news (C-2). The alternative is to re-derive their sources, but those children are already dropped.
3. **`unrecorded` as a fourth, fail-closed default** rather than defaulting to `unverified-legacy`. A writer that forgets should look like a defect, not like history.
4. **R-2: drop `producing_build_sha` from the replay compare.** It weakens CC-C's immutability check by one field. The alternative is to keep it strict and accept that a half-completed object needs a human after any deploy.
