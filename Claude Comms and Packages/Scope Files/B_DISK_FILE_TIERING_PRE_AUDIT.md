# B-DISK-FILE-TIERING — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: architecture · **Issue:** `#1233` · **Owner:** CC-A (OLD Claude) · **Reviewer:** Langston
**Scope:** `B_DISK_FILE_TIERING_SCOPE.md` r5 (Langston PROCEED on r4, condition folded at `173dc31cf`).
**Read at:** `origin/migration/aws-supabase` (code), staging `188.245.193.8` (runtime, database, crontab, pm2 module), 2026-11-04 15:00-16:00Z.
**Load-bearing claims NOT RE-READ by a fresh reader** (Kyle 2026-09-30, `B-TOKEN-BURN-CUT` OBJ-4): F1 (the compression mechanism), F3 (what cold has carried), F6 (no server-disk monitor). Each cites the line or the query it rests on, for Langston to re-derive.

---

## 0. PREVIOUSLY STATED → NOW (the numbers and facts that moved since the scope)

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| 0.1 | scope OBJ-3 + Langston r3: the cold hop "has carried only 104-byte liveness objects" | **cold holds 4 real objects; the largest is 99,870,161 B** (`context_bridge_log/2025-12`, written straight to cold 2026-05-06); the rotator moved **3** objects on 2026-07-07/08, largest **13,901,237 B** | manifest query 2026-11-04 (§2, H). The 104-byte figure is true of the liveness canary only. The ~173 MB trace `.gz` is about 1.7× the largest object cold has carried, not 1.7 million times. OBJ-3's measurement stays; its framing changes. |
| 0.2 | scope OBJ-6: "Step 2 owes the mechanism"; four candidate causes | **cause found:** a setting-type mismatch between pm2-logrotate 3.0.0 and the library that loads its settings (F1) | read at the implementing lines on the box |
| 0.3 | `STORAGE_POLICY.md:100` (my own `B-OPS-PM2-LOG`, `#499`, 2026-07-13): rotation is "lossless rename + reloadLogs" | **rotation is copy-then-truncate** (`app.js` `proceed()`: stream copy, then `fs.truncate`) | F2 |
| 0.4 | scope OBJ-8: a separate page `disk-tiering-failed` | **the job's PAGE is `archival-health`'s existing check** (`archival-health-<name>-<reason>`); only the 90 % server-disk page is new | F5: archival-health already pages failed / stale / incomplete / missing per job; a second key would double-page one failure |
| 0.5 | scope §1: "No rule or job TIERS business-data files on the server's disk" | true, and **the gap was already catalogued**: `STORAGE_POLICY.md` §F.2 (`74fb7e3e9`, 2026-07-28) and the after-live line `B-STORAGE-CATALOG (CC-A)` | F7, §9.5(b-ii) |
| 0.6 | scope OBJ-1 ¶: "an existing manifest with a `kind='disk-file'` discriminator" | the manifest has **no kind column**; the discriminator is the `source_table` value, and two CHECK constraints need one new value each | F4 |
| 0.7 | backlog 12.66 GB (my 14:15Z read) | **12.51 GB** (Langston 14:43Z) | the 35-day boundary moved by one file per folder |

---

## 1. THE SIX SOURCES — which I read

| # | source | read? | what it gave |
|---|---|---|---|
| 1 | code at the ref | yes | writers, readers, the B75 storage client, rotator, sweep, rehydrate, archival-health, migrations |
| 2 | runtime + database | yes | crontab, pm2 module code and config, folder contents, newest files, manifest rows, `module_constants`, free memory |
| 3 | `SYSTEM_IMPACT_MAP.md` | yes | entries for the telemetry emitter (`:669`), VTS eval counters (`:1677`), drift-dashboard-aggregator (`:1700`), archival-health (3 hits), the manifest (6 hits); **no entry** for `data-aggregator`, the 41F-L trace, or pm2-logrotate — gaps, closed at Step 10 |
| 4 | `SYSTEM_MANUAL.md` | yes | the Drift Dashboard chapter (`:11737`, `:11740`) names the telemetry folder as Layer 1; nothing on disk files or log rotation (storage is delegated to `STORAGE_POLICY.md`, `:26`) |
| 5 | ledger + reports | yes | `#499` (pm2 rotation, mine), `STORAGE_POLICY` §F (the July inventory), `B-STORAGE-CATALOG` + `#431` (after-live), `#1236`, the B-NEW-47 / B-STORAGE-HARDEN / `#1195` storage records |
| 6 | `bridge/canonical/` | yes | **no coverage** of the telemetry folder, `vts_eval_history`, pm2-logrotate or archive tiering; `context-bridge.ts` appears only as "WebSocket event broadcasting" (`DawnTrader_System_Architecture_Execution_Flow.md:200`, `:829`), no trace; `passive-data-aggregator.ts` is listed as "passive learning data collection" (`DawnTrader_Core_System_Files_Reference.md:184`) |

**Provenance of the trace writer** (scope §3, unchanged): `3478ddcbd` (2025-11-02); its directives are under `attached_assets/` (Phase 41F-L simulation and E2E files) — a validation tracer for a closed phase.

---

## 2. ENTRY POINTS, REPO-WIDE, BEFORE THE TRACE

**Every scheduler that touches these stores** (staging crontab, root + deploy, read 2026-11-04; `/etc/cron.d` holds only certbot, e2scrub, sysstat; one logrotate file mentions the app: `dawntrader-system-alerts`):
- **No cron, timer or script moves or deletes any file in the three folders or `diagnostic-reports/`.** Presence evidence: the same crontab DOES carry a deleter for another store (`30 4 * * * find /var/log/dawntrader -name "rawcap-*.jsonl" -mtime +10 -delete`), so the read can see one.
- The B75 jobs that the new job sits beside: `b75-retention-sweep` (02:15 daily), `b75-cold-rotator` (03:00 on the 1st), `b75-cold-liveness` (Mon 04:00), `b-storage-archival-health` (05:00 daily).
- **In-app writers** (each started by the app; one per folder): `phase15b-dbs-telemetry.ts` (gated `DT_PHASE15B_DBS_TELEMETRY=1`, set in staging `.env:28`), `vts-runner.ts:379-417`, `data-aggregator.ts:130`, `context-bridge.ts:185`.
- **pm2-logrotate** is the only thing that rotates `/var/log/dawntrader/{out,error}.log`.

---

## 3. COMPONENT CENSUS, PER HOP (repo-wide grep at the ref, tests excluded; every list stated)

**A. `logs/phase15b_dbs_telemetry/` (top level + `consumer_sites/`)**
- writes: `phase15b-dbs-telemetry.ts` only (5 refs, one file).
- reads (app): `drift-dashboard-aggregator.ts` only (`:33` path, `:196-224` reader).
- reads (offline): **sixteen** of `scripts/phase15b/*.py` (scope OBJ-7, 9 + 7) **plus four more not in the scope:** `Scope Files/b656_classifier_replay_04_18.py:29`, `b656_global_metrics.py:21`, `b656_phase_a.py:15`, `b656_phase_a_track1.py:21` — all hard-code the folder (F8).
- deletes: **nobody** (§2 evidence).
- schedules: the MCE cycle (the emitter's caller), every 60 s.

**B. `logs/vts_eval_history/`** — writes and reads: `vts-runner.ts` only (1 ref); reader takes yesterday + today. Deletes: nobody.

**C. `logs/data_aggregates/` (+ `hourly/`)** — writes and reads: `data-aggregator.ts` only (2 refs in code; 8 more in `attached_assets/` directives, which are provenance, not readers). Deletes: nobody. **Formats differ:** daily `passive_YYYY-MM-DD.json` is JSON-lines; `hourly/passive_YYYY-MM-DDTHH.json` is one JSON object; `vts_eval_history/YYYY-MM-DD.json` is one JSON array (read on staging).

**D. `diagnostic-reports/phase-41F-L-trace.ndjson`** — writes: `context-bridge.ts:185` only (`appendFileSync`, path relative to the app's working folder `/home/deploy/dawntrader`, confirmed from pm2). Reads: **none** in `server/`, `client/`, `scripts/`, `tests/` (the one test hit, `tests/phase-41F-L-simulation.spec.ts:125`, is a screenshot path, `phase-41F-L-final.png`). Deletes: nobody.
- **Deletion-time state-write census (§9.5(a-ii)):** the writer writes ONE thing — this file. Its only reader would be a file reader of this path; there is none. Zero callers of the file and no surviving reader of the state ⇒ the cut is clean.

**E. pm2-logrotate 3.0.0** (`/home/deploy/.pm2/modules/pm2-logrotate`) — rotates `out.log`/`error.log`, deletes rotated files beyond `retain`. The only scheduler and the only deleter of `out__*`/`error__*`.

**F. `data_archive_manifest`** — writers: `b75-retention-sweep`, `b75-cold-rotator`, `context-bridge-log-ttl`. Readers: those three + `b75-rehydrate`, `archive-completeness`, `b-xstock-bar-availability-capacity-gate`, `perpfeed-gate-test`. **Every reader except the rotator filters by a named `source_table`** (sweep `:333-351`, `:899`; capacity gate `:616`; rehydrate `:115`). **The rotator selects ALL `tier='warm' AND state='active'` rows older than their window** (`b75-cold-rotator.ts:132-151`) — so disk-file rows join the 365-day rotation with no rotator change, which is the scope's intent (OBJ-3).

**G. `archival-health`** (`b-storage-archival-health.ts`) — a list of jobs, each a log file with a grace period and a completion-line pattern (`:52-95`); pages `missing` / `stale` / `incomplete` / `failed` (`:131-186`), deduped `archival-health-<name>-<reason>` (`:118`). **It sees a job that never starts** (the `stale` and `missing` arms) — this answers the scope's OBJ-8 question.

**H. Cold tier, as it stands** (database, 2026-11-04): `cold|active` 4 rows, 117,461,261 B in total, largest 99,870,161 B; `warm|active` 743 rows, 49.5 GB, largest 535,409,768 B; `warm|migrated` 3. Last rotation `2026-07-08T00:01Z`. `default_warm_retention_days = 365`; no warm row is yet over 300 days old.

---

## 4. FINDINGS

**F1 — WHY COMPRESSION NEVER WORKED (mechanism, at the lines).** pm2-logrotate 3.0.0 reads `var COMPRESSION = parseBool(conf.compress, false)` (`app.js:49`), and `parseBool` returns true only for the STRING `'true'` (`app.js:38-42`). Its settings arrive through `pmx`'s loader, which runs every value through `Autocast` (`pmx/lib/configuration.js`, the `casted_conf` block) — and `Autocast` turns the string `'true'` into the boolean `true` (`pmx/lib/utils/autocast.js`, `common_strings`). The boolean is not `=== 'true'`, so `parseBool` falls back to `false`. **Positive control:** `retain "14"` is autocast to the number 14 and read with `parseInt` (`app.js:48`), which accepts it — and exactly 14 rotated files per stream are kept. **No configuration value can fix this:** any `"true"` is cast before the module sees it.
- **Fixes available:** (a) **pm2-logrotate 3.0.1**, whose `parseBool` accepts the boolean (`val === true || val === 'true'`, read from the published package) — **but it was published 2026-11-04T11:02Z, today** (npm `time`), so it is not installed before it is at least two weeks old and its whole diff against 3.0.0 is read; (b) **2.7.0** (2019), which reads `JSON.parse(conf.compress)` and so accepts either type — but declares `"pmx": "latest"` and predates the pm2 in use; (c) the system `logrotate`, already used on this box for one file. **Recommendation: (a) after its age gate, with (c) as the fallback if the diff shows anything else changed.** Plan P9.
- **Disposition:** rule 24 outcome (1), a real defect in a third-party module; folded into this batch (scope OBJ-6). Recorded on `#499` at Step 10.

**F2 — Rotation is copy-then-truncate, not rename.** `proceed()` streams `out.log` into the dated file, and on `finish` calls `fs.truncate(file)` (`app.js` `proceed`). Lines written between the end of the copy and the truncate are lost. `STORAGE_POLICY.md:100` (written by me in `#499`) says "lossless rename + reloadLogs"; that is wrong. These are operational logs, rotate-and-discard (§5.5); the loss window is the gap between two calls, unmeasured. **Disposition: folded — the STORAGE_POLICY line is corrected at Step 10; no code change** (the logs are discarded by design, and the evidence stream that needed losslessness moved to its own store in `B-EVIDENCE-SINK`, `#499`'s companion). `MISTAKE:` trailer on the correcting commit.

**F3 — The cold hop has carried 100 MB, not 104 bytes** (§0.1). The rotator's path is buffered end to end: `downloadWarm` → Buffer (`b75-cold-rotator.ts:278`), `uploadCold(…, warmObj.data)` (`:287`), then a cold re-download to verify. So a rotated object is held in memory at least twice. For the ~173 MB trace `.gz` that is roughly 350-520 MB against 2,504 MB available today (`free -m`). **OBJ-3's measurement stays the gate** (scope r5); the expected peak is now stated, and the largest object cold has proven is 99.9 MB.

**F4 — The manifest can carry disk files with two constraint widenings, no new column.** Columns needed exist (`source_table`, `partition_label`, `tier`, `state`, `storage_uri`, `min_ts`/`max_ts`, `row_count`, `bytes_compressed`, `original_partition_size_bytes`, `checksum`, `completeness_basis`; `2026-05-06-b75-data-lifecycle.sql:39-77`, `2026-10-17-…completeness.sql:27-35`). Two CHECKs refuse disk files as they stand: `format IN ('jsonl.gz','parquet')` (the hourly and eval files are whole JSON documents, not lines) and the evidence table's `cursor_contract` set (two values). The proof trigger (`trg_data_archive_manifest_basis_requires_evidence`) lets a disk-file row claim `source-count-matched` if an evidence row with equal source / exported / downloaded line counts is written first, in the same transaction. **Disposition: folded (P2).**

**F5 — archival-health is the page that already exists** (§0.4). **Disposition: folded (P7);** the scope's separate key is dropped.

**F6 — Nothing on staging alerts on the SERVER's own disk filling.** The `disk-utilization-warning/critical` alerts come from `database-monitor.ts:147` and measure the **Supabase database**. A repo-wide search at the ref for a filesystem check (`statfs`, `df -`, disk space or usage; code, scripts, shell, `comms-infra`) finds none — **control:** the same pattern over all files finds `B_TOKEN_WATCH_STORAGE_SCOPE.md`, so the search can hit. On the box: no cron entry checks the disk, and the five-minute out-of-process watchdog (`staging-liveness-watchdog.mjs`, `dawntrader-watchdog.timer`) checks only `http`, `pm2` and `engine` (`:9-13`). That is how this disk reached 87 % with two weeks of runway and no page. **Disposition: folded** — the scope's OBJ-8 already asks the job to escalate at 90 % of `/`; P7 builds it as a daily check, not only a by-product of a tiering run.

**F7 — The July inventory and its after-live line** (§0.5). `STORAGE_POLICY.md` §F.2 catalogued these stores as unbounded on 2026-07-28 and said the telemetry folder's consumer set "should be established before it is trimmed"; the after-live line `B-STORAGE-CATALOG (CC-A) — unmanaged app-local file store · + #431` was its home. **Disposition: added to this batch** — B-DISK-FILE-TIERING delivers the app-local-store half for the three folders that grow; the after-live line keeps `#431` (the cold canary's delete) and the small stores (`virtual_trades` 79 MB, `predictive_adjustments`, `fx5_state`), and is re-worded at Step 10 to say so.

**F8 — Four more offline readers of the telemetry folder** (§3 A): the `b656_*` scripts in `Scope Files/`. **Disposition: folded into OBJ-7's consumer list** (twenty in all: sixteen in `scripts/phase15b/`, four in `Scope Files/`).

---

## 5. THE PLAN — every item names the finding or census line it falls out of

| # | item | from |
|---|---|---|
| **P1** | **Migration** (`drizzle/migrations/2026-11-xx-b-disk-file-tiering.sql` + rollback, both committed, MANIFEST entry): widen `data_archive_manifest_format_chk` with `'file.gz'` (the original file's bytes, gzipped whole); widen `data_archive_exact_evidence_cursor_contract_check` with `'disk-file-lines-v1'`. Nothing else. | F4 |
| **P2** | **Manifest rows for disk files:** `source_table = 'disk_file.<folder>'` (`disk_file.phase15b_dbs_telemetry`, `…phase15b_dbs_telemetry.consumer_sites`, `…vts_eval_history`, `…data_aggregates`, `…data_aggregates.hourly`, `…diagnostic_reports`), path-safe for the rotator's cold key (`b75-cold-rotator.ts:286`); `partition_label` = the name date (`2026-09-18`, or `2026-10-01T05` for hourly; the trace uses `phase-41F-L-trace`); `min_ts`/`max_ts` and `date_range_*` = the name date's bounds (the trace: its first and last line's `ts`); `row_count` = line count; `format 'file.gz'`; an evidence row first (`cursor_contract 'disk-file-lines-v1'`, source = exported = downloaded line count), then the manifest row with `completeness_basis 'source-count-matched'`. | F4, census F |
| **P3** | **The daily job** `server/scripts/b-disk-file-tiering.ts`, root crontab beside the B75 jobs (proposed 02:45, between the sweep and the rotator's monthly slot), logging to `/var/log/dawntrader/disk-file-tiering.log` with a `DONE moved=N failed=N freed_bytes=N free_after=N` line. Per file, in order: select by NAME date older than 35 days → gzip to a temp file beside it → `uploadWarmFile` (streaming; never `uploadWarm(Buffer)`) → `downloadWarmFile` to a temp path and re-hash + re-count lines → evidence row + manifest row in one transaction → only then delete the original and the temps. Any failure keeps the original and counts as `failed`. | scope OBJ-1; census A-C; F3 |
| **P4** | **Backlog caps:** at most 2 GB of originals per run while `/` has under 15 GB free; stop if free space would fall below 5 GB; largest-folder first. | scope OBJ-4 |
| **P5** | **The trace, last:** after at least 6 GB has been freed, the same path moves the trace (gzip first is mandatory: the raw file is over `uploadWarmFile`'s 5 GB cap, `storage-client.ts:278-279`); then the writer at `context-bridge.ts:175-189` is removed, archived as `.removed`, logged in `DELETED_COMPONENTS_LOG.md`. The deploy that removes the writer is a normal app deploy (a restart). | scope OBJ-5; census D |
| **P6** | **The moved-day alert** in `drift-dashboard-aggregator.ts`: only when a window's start is older than 35 days (today, only `cohort_latest` with uptime past ~34 days), derive the expected day set from the window bounds, read the manifest for `disk_file.phase15b_dbs_telemetry` labels in that set, and raise `disk-tiering-moved-day:phase15b_dbs_telemetry` (resolve-only) for days in the manifest and not on disk. Inside 35 days the reader does no new work. | scope OBJ-2; census G |
| **P7** | **The page:** add the job to `archival-health`'s list (`missing`/`stale`/`incomplete`/`failed`, grace 26 h, pattern on the DONE line). **The server-disk check:** a fourth check in `staging-liveness-watchdog.mjs` — every 5 minutes, plain node, out of process, already pages through the alerts CLI with a direct-append fallback when the app is broken — reads `/` and raises `server-disk-utilization-critical` at 90 %, `-warning` at 85 % (resolve-only, its 2-tick debounce; distinct from the database's `disk-utilization-*`). | F5, F6, scope OBJ-8 |
| **P8** | **Rehydration:** reuse `b75-rehydrate.ts` (it already streams warm downloads and reports the basis) with a `--disk-file` mode that gunzips `file.gz` back to the original name; the consumer list is the twenty scripts of F8 and scope OBJ-7. | scope OBJ-7, F8 |
| **P9** | **Compression, last and gated:** install pm2-logrotate 3.0.1 once it is two weeks old, after reading its full diff against 3.0.0 (fallback: system logrotate); then (i) one real rotation produces a `.gz`, (ii) `delete_old` is shown to remove a `.gz` — **already readable at the line:** it matches every file containing `out__` / `error__` (`app.js` `delete_old`, an `indexOf` on the name prefix), so `.gz` files are counted and swept, (iii) then the one-time gzip of the `error__` family, owner and mode preserved. | F1, F2, scope OBJ-6 + Langston C6 |
| **P10** | **Cold proof:** before any disk-file row reaches 365 days, and as OBJ-3's measurement now, move the largest disk-file `.gz` through the rotator's path on staging with memory sampled; if the peak is unsafe beside the app, a streaming cold upload becomes an objective here. | F3, scope OBJ-3 |
| **P11** | **Governance (class `architecture`):** STORAGE_POLICY (a disk-file section; §F.2 updated; `:100` and `:191` corrected per F1/F2), SIM (new entries: the job, `data-aggregator`, pm2-logrotate, the trace's removal; manifest's new `source_table` family), SYSTEM_MANUAL (the Drift Dashboard chapter, Layer 1 + Layer 2 per P6), DELETED_COMPONENTS_LOG, CHANGES_AND_FIXES, BATCH_CATALOG, PHASE_HISTORY, RUNNING_ISSUES (`#1233`, `#499` correction, `B-STORAGE-CATALOG` re-word), the task-list row, the completion report. | scope OBJ-9, F7 |

**Order of work:** P1 → P2/P3/P7 together (one deploy for the migration + the job + archival-health; the app does not restart for a cron script) → run the job, watch the backlog fall (P4) → P6 + P5's writer removal (one app deploy, at a planned restart) → P10 → P9 last.
**UNAUDITED:** none. Every item above maps to a finding or a census line.

---

## 6. THE DOC SET FOR `architecture` (from `config.mjs:137`)
scope ✅ present · pre-audit ✅ this file · completion report ⏳ Step 11 · BATCH_CATALOG ⏳ · PHASE_HISTORY ⏳ · SYSTEM_MANUAL ⏳ (P11, required, content) · SIM ⏳ (P11). Plus STORAGE_POLICY, DELETED_COMPONENTS_LOG, CHANGES_AND_FIXES, RUNNING_ISSUES, task list.

## 7. QUESTIONS FOR LANGSTON (one ruling each)
1. **F1's fix:** 3.0.1 after a two-week age gate and a full diff read, or switch to the system logrotate now? (I recommend the first.)
2. **P2's `source_table` family `disk_file.<folder>`** — acceptable in a manifest that has held table names only?
3. **P7:** put the server-disk check in the five-minute liveness watchdog (out of process, pages even when the app is broken) rather than in the daily `archival-health` run? I recommend the watchdog: a disk can fill within a day, and that watchdog's own design (zero app imports) is what lets it page when the app cannot.

---

## 8. IN PLAIN LANGUAGE
The audit found why log compression never worked: a library that loads the log tool's settings turns the word "true" into a different kind of true, and the tool only recognises the word, so it quietly stays off. A fixed version came out this morning, which is too new to install; the plan waits two weeks and reads every change first. It also found that nothing watches this server's own disk (the existing disk alerts are about the database), so the plan adds that alarm to the five-minute watchdog that already checks the app is alive. The database's archive table can hold the moved files with two small rule changes, the existing nightly health check becomes their alarm, and the existing restore tool brings any file back. Order: archive the old files day by day, then retire the old trace file and its writer, then fix compression.
