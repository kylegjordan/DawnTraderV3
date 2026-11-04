# B-DISK-FILE-TIERING — SCOPE r1 (2026-11-04) — Step 1

change-class: architecture

**Owner:** CC-A (OLD Claude) · **Issue:** `#1233` · **Reviewer:** Langston
**Directive (Kyle, 2026-11-04, Desktop):** *"instead of just deleting things, let's start moving some of those items on a daily, weekly, monthly basis to warm storage, then cold storage. Same sort of plan we have for the other disk cleanup or storage."* And: *"Discard the running logs as we planned."*
**Placement:** CC-A pre-sprint list, item 3, after `B-STATUS-BOARD` (Kyle approved it the same day as urgent: the disk has about two weeks of runway).
**Not in this batch:** the token-watch store (Infra Claude's `B-TOKEN-WATCH-STORAGE`, approved the same day) and the app's pm2 logs (rotate-and-discard, `STORAGE_POLICY.md` §5.5, re-confirmed by Kyle 2026-11-04; only their compression is checked here).

## 1. The problem, measured (staging, 2026-11-04)
- `/` is 75 GB at 87% (63 GB used, 9.7 GB free). App logs are written at about 11 GB a day and bounded by rotation; the unbounded growers are business-data files the app writes to its own disk, which no tier ever moves.
- Older than 30 days: `logs/phase15b_dbs_telemetry/` **344 files, 11.14 GB**; `logs/vts_eval_history/` **187 files, 0.93 GB**; `logs/data_aggregates/` (incl. `hourly/`) **4,691 files, 1.14 GB**. Daily file names (`YYYY-MM-DD.jsonl`, `passive_YYYY-MM-DD.json`, `hourly/passive_YYYY-MM-DDTHH.json`).
- `diagnostic-reports/phase-41F-L-trace.ndjson`: **5.37 GB**, appended every broadcast since 2026-03-30, never rotated, still written today.
- `STORAGE_POLICY.md` §1 defines the tiers for the DATABASE (HOT → WARM Supabase `dt-archive` → COLD Backblaze B2 `dt-archive-cold`, download-verified at each boundary, never deleted from cold); §2.5 sets 30 days hot as the default. **No rule or job covers business-data files on the server's disk.** That gap is this batch.

## 2. Objectives (each with how it is verified)
| # | objective | verified by |
|---|---|---|
| **OBJ-1** | A daily job moves each listed folder's dated files older than **30 days** (§2.5; the longest reader window is the Drift Dashboard's `rolling_30d`) to **WARM**: gzip → upload to `dt-archive` under `disk-files/<folder>/` → download and re-hash (sha256) → write a manifest row → only then delete the local file. Any failure leaves the local file and alerts. | a run on staging; manifest rows match local hashes taken before the move; the files are gone locally only after their verify; a planted upload failure keeps the file and alerts |
| **OBJ-2** | WARM → COLD at **365 days**, by the existing rotator if its manifest can carry these objects, otherwise by the same job with the same verify; COLD is never deleted. | Step 2 decides which; a test with a back-dated manifest row |
| **OBJ-3** | The backlog (about 13.2 GB) moves on the first runs, in slices so a run cannot fill the disk or overrun. | free space before and after; manifest count = file count moved |
| **OBJ-4** | **The Phase 41F-L trace writer is removed** (rule 18), and the existing 5.37 GB file is moved to COLD (verified) before the local copy is removed. | the line is gone; the file stops growing after deploy; cold object verified; `DELETED_COMPONENTS_LOG.md` row |
| **OBJ-5** | pm2 log compression: confirm whether `pm2-logrotate`'s `compress: true` is compressing (the rotated files on disk are plain `.log` at about 1 GB each). If not, fix the configuration only. The logs stay rotate-and-discard. | rotated files are `.gz` after the next rotation; disk use for `/var/log/dawntrader` falls |
| **OBJ-6** | Rehydration: one documented command brings any moved file back from WARM or COLD, verified. | a round trip of one moved file, hash-equal |
| **OBJ-7** | The job is watched: it joins `archival-health` (a missed or failed run alerts), and a disk-runway line is logged daily. | a forced skip shows in `archival-health` |
| **OBJ-8** | Governance: `STORAGE_POLICY.md` gains a disk-file section (what is tiered, the 30-day window, the readers that set it); `SYSTEM_IMPACT_MAP.md` entries for the job and for the three folders' readers. | the documents at the close |

## 3. Provenance read (corpora searched: `git log` by file and by string, `BATCH_CATALOG.md`, `RUNNING_ISSUES.md`, `STORAGE_POLICY.md`, `SYSTEM_IMPACT_MAP.md`; not yet searched: `bridge/canonical/` — Step 2)
**TIER 1 — behaviour this batch changes:**
- **`server/services/context-bridge.ts:185`, the Phase 41F-L trace writer.** Introduced by `3478ddcbd` (2025-11-02): *"Add automated testing for paper trading and enhance system monitoring capabilities"*. Comment at the site: *"Phase 41F-L: Record trade and health broadcasts to NDJSON trace file"*; failures are swallowed (*"Silent fail - don't break broadcasts for tracing"*). **No reader found in `server/`, `client/`, `scripts/`** (Step 2 confirms with a census and a positive control). The 41F-L phase is closed (`LEGACY_DEPRECATION_PLAN.md:335` names its E2E purge). **Disposition (4): connected but should be removed** — a diagnostic tracer that outlived its phase.
**TIER 2 — files moved, writers unchanged:**
- `logs/phase15b_dbs_telemetry/` — written by `server/services/phase15b-dbs-telemetry.ts` (Phase 15b B61, MCE per-cycle DBS snapshot plus consumer sites, gated by `DT_PHASE15B_DBS_TELEMETRY=1`); read by `drift-dashboard-aggregator.ts:33` with windows up to `rolling_30d`. **Disposition (1):** still relevant; 30 days stays hot, so the dashboard's widest window is whole.
- `logs/vts_eval_history/` — written and read by `vts-runner.ts:379-417`; the read takes yesterday and today only. **Disposition (1).**
- `logs/data_aggregates/` — written by `data-aggregator.ts:130`; the hourly roll reads today's file only. **Disposition (1).**
- `server/services/data-archive/storage-client.ts` — the B75 upload/download/sha256 client; reused, not changed.

## 4. Risks, stated
- A reader with a window longer than 30 days that Step 2 misses would read short. Mitigation: Step 2 censuses every reader of the three folders, with a positive control.
- An upload that succeeds but stores the wrong bytes: the download-verify is the guard; the local file goes only after a hash match.
- Removing the trace writer touches the broadcast path: the change deletes one guarded block; Step 2 measures that no consumer reads the file.

## 5. Questions for Langston
1. Is 30 days the right hot window for all three folders, or should `vts_eval_history` and `data_aggregates` (read for one day only) go sooner?
2. Extend the existing cold rotator to file objects, or keep this job self-contained?
3. Is removing the trace writer inside this batch right (rule 18, disposition at the find), or should it be its own hotfix?
