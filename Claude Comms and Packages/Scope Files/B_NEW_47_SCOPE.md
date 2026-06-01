# B-NEW-47 SCOPE — Activate B75 tiered storage sweep (RUNNING_ISSUES #161) — fix-then-activate

**Batch ID:** B-NEW-47 · **RI:** #161 · **Author:** Claude Code · 2026-06-01 · **Active trading:** OFF (zero capital risk).
**Mirror:** code edits in `C:\dev\DawnTraderV3` only. **Langston:** now on Opus 4.8 [1m].

---

## 0. Mandate (Kyle 2026-06-01)
"Fix now then activate." Do NOT just install the cron — the existing B75 sweep has a memory defect that would crash on the dominant table. Fix it properly, then activate. Full 11-step workflow with Langston, autonomous to verified completion.

## 1. Code-level review of the EXISTING system (done — do not rebuild)

The B75 three-tier system is fully built and well-engineered:
- **Engine:** `server/services/data-archive/storage-client.ts` (warm = Supabase Storage REST incl. TUS resumable; cold = Backblaze B2 native API; SHA-256 both tiers) + `partition-exporter.ts` (REPEATABLE READ, keyset-paginated streaming export → gzipped JSONL on disk).
- **Sweep `b75-retention-sweep.ts`:** daily, per the 6 B74 tables, exports whole monthly partitions older than per-table `hot_retention_days`, uploads to warm, **re-reads + verifies checksum, then DROPs** the hot partition. Crash-safe manifest state machine `pending→uploaded→verified→active`.
- **Cold rotator `b75-cold-rotator.ts`:** monthly warm→cold after `default_warm_retention_days`; dry-run until B2 creds + flag.
- **Rehydrate `b75-rehydrate.ts`:** pull warm/cold back to disk for analytics.

**Live state (verified on staging 2026-06-01):**
- Config (`module_constants` / `data_lifecycle`) fully seeded: warm_bucket=`dt-archive` warm_prefix=`warm`, cold_bucket=`dt-archive-cold` provider=`b2`, `cold_rotator_dry_run=true`, `default_warm_retention_days=365`, ticker `hot_retention_days=30`, ohlc=365.
- Warm path **already works**: 4 manifest rows are real `context_bridge_log` archives uploaded to `dt-archive` (state=active) → bucket exists, `SUPABASE_SERVICE_ROLE_KEY` present + valid.
- **B2 cold creds ALREADY present** in staging .env (B2_KEY_ID/B2_APPLICATION_KEY/B2_BUCKET) — contrary to #161. Cold not urgent anyway (`default_warm_retention_days=365` → nothing rotates for a year).
- **Crons live in ROOT's crontab** (not deploy/cron.d). b70-retention-sweep runs nightly 02:00 (last ran today) over a DIFFERENT table set (pair_scan/signal_eval/exit_decision/macro_feed, 90d straight-DROP). **No b75 sweep cron exists** → the 6 B74 ticker/ohlc tables are NEVER swept = unbounded growth.
- Partition sizes: `xstock_spot_ticker_snap_2026_05` = **31 GB** (April only 16 MB — universe came mid-May); `xstock_perp_ticker_snap_2026_05`=5.0 GB; `xstock_spot_ohlc_1m_2026_05`=4.4 GB. DB total 57 GB / 200 GB ceiling; ~50 GB/mo growth.
- Staging box: **3.7 GB RAM (2.7 GB free)**, 75 GB disk (23 GB free).

## 2. THE DEFECT (why naive activation fails)

The export streams safely to a temp file, but the sweep then **`fs.readFileSync(localPath)` loads the entire compressed archive into one in-memory Buffer** before upload (`b75-retention-sweep.ts:339`), and `uploadWarm`/`uploadWarmTus` both take a full `Buffer`. The 31 GB May partition compresses to ~4–6 GB → on a 3.7 GB box this **OOM-kills the sweep**, and it also exceeds the code's self-imposed 5 GB per-object cap (`storage-client.ts:120`). **The rehydrate path has the SYMMETRIC defect**: `downloadWarm` buffers the whole object (`Buffer.from(await res.arrayBuffer())`) and `writeFileSync`s it (`b75-rehydrate.ts:164-166`) → a multi-GB object can't be read back either.

**Timing cushion:** monthly granularity + 30d retention means the 31 GB May partition isn't eligible until ~July 1 (June sweep would only touch tiny April partitions). DB at 57/200 GB with months of runway. So we fix properly, not rushed.

## 3. THE FIX — design choice for Langston

Root cause = "load whole file into memory" on BOTH directions. Two clean options:

**Option 1 (CC lean) — stream I/O, one object per month.** Make `storage-client` stream:
- `uploadWarm` from a **file path** (TUS path reads 6 MiB chunks via `fs.read` at offset; never buffers the whole file). Peak mem ~6 MiB.
- `downloadWarm` **to a file** (pipe `res.body` web-stream → `fs.createWriteStream`; checksum via `sha256HexStream`). Peak mem ~chunk.
- Sweep passes `exportRes.localPath` (+ known size + `exportRes.checksum`) instead of `readFileSync`. Rehydrate writes via stream.
- Raise the 5 GB self-cap to a sane multi-GB ceiling for the streamed path; **verify + raise the Supabase bucket `file_size_limit`** (one service-role API call) to accommodate multi-GB objects.
- Manifest UNCHANGED (one row per month). Smallest blast radius; directly removes the defect everywhere.

**Option 2 (alternative) — slice each oversized month into bounded sub-objects** (e.g., ≤500 MB compressed, or per-day). Every object small → memory-safe both ways, no Supabase limit raise. But manifest gains N rows/month (sub-index), and sweep/rehydrate/rotator all must handle multi-object months. Broader change.

**CC recommendation: Option 1** — surgical, manifest-stable, removes the actual root defect (whole-file buffering) on both paths; multi-GB objects are natively fine in Supabase Storage (TUS) + B2. Langston to confirm or argue Option 2.

## 4. Activation (after the fix, Step 6+)

1. Install the b75 sweep cron in **root's crontab**: `15 2 * * * su - deploy -c "cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b75-retention-sweep.ts" >> /var/log/dawntrader/b75-retention.log 2>&1`.
2. Keep `cold_rotator_dry_run=true` (cold not needed for 365d). Do NOT schedule the cold rotator this batch.
3. Keep ticker `hot_retention_days=30` (monthly granularity makes 14 vs 30 immaterial for the big chunk; 30 safe under the ceiling math). Drop the 14 directive unless Kyle insists.
4. **Controlled first real sweep** to validate live + free space: run the sweep manually once after the fix. Decision (Q-3): also force-sweep the 31 GB May partition now (frees 31 GB immediately + validates the streaming fix on real giant data; data goes to recoverable warm) vs. let it age to natural July eligibility.
5. Verify on staging: manifest rows added (state=active), DB size drops, warm objects present + checksum-verified, rehydrate round-trips one swept partition back successfully.

## 5. Ongoing-basis operation (steady state)
Nightly 02:15 UTC the sweep moves any whole month older than each table's hot window from fast DB → warm bucket (verified-before-drop). DB holds ~1–2 months ticks + ~1 year minute-bars; everything older in cheap warm (no hard ceiling). After the one-time 31 GB catch-up, each new month rolls off automatically → DB stays in a steady band far under 200 GB. Year-old warm → cold is a future monthly job (keys already present). Failures leave data in place + retry next night; B-NEW-49 observability + a system-alert surface a stuck run.

## 6. Numbered objectives + verification
1. Streaming warm upload (from file) — peak mem bounded; unit/integration test with a >1 GB synthetic file. **Verify:** memory stays low; checksum round-trips.
2. Streaming warm download (to file) for rehydrate — same. **Verify:** large-object rehydrate works on staging.
3. Raise self-cap + verify/raise Supabase bucket `file_size_limit`. **Verify:** multi-GB upload succeeds (no 413).
4. Sweep + rehydrate call-site changes (pass path, not Buffer). **Verify:** tsc baseline unchanged; tests green.
5. Activate: install root cron; controlled first sweep; manifest + DB-size + warm-object + rehydrate verification on staging.
6. Cron observability: confirm the new sweep run is covered (it's a root-crontab job, not node-cron — confirm logging/alerting path; may add a system-alert on failure).
7. CI all-4-green; governance (RI #161 closed, SIM, CHANGES_AND_FIXES, BATCH_CATALOG, PHASE_HISTORY, MEMORY); completion report.

## 7. OPEN QUESTIONS FOR LANGSTON (Step-1)
- **Q-1:** Option 1 (stream I/O, one object/month) vs Option 2 (slice into bounded objects)? CC lean Option 1.
- **Q-2:** Supabase bucket `file_size_limit` — raise via service-role API as part of the batch (verify current value first), or is there a project-level cap that blocks multi-GB regardless (forcing Option 2)?
- **Q-3:** Force-sweep the 31 GB May partition now (free space + validate on real data) vs wait for July eligibility?
- **Q-4:** Any concern leaving the cold rotator dry-run + keeping `hot_retention_days=30`?
- **Q-5:** First-sweep blast radius — the export holds a REPEATABLE READ snapshot + 96K keyset queries for the 31 GB/96M-row partition; any concern re: long-running read txn vs live writers (note: active trading OFF; ticker writers still running into June partition, not May)?

---

## 8. v2 FINAL DESIGN — LOCKED (Q-2 result + Langston concur 2026-06-01)

**Q-2 result (probed):** global Supabase project upload cap = **5 GB** (1/5 GB → 201; 10/50 GB → 413 "Maximum size exceeded"); bucket `file_size_limit=None`. Largest compressed month ≈5–6 GB and growing → **single-object-per-month is BLOCKED**. Raising the cap is a moving-target patch (universe growth re-crosses it) → rejected per NO-PATCHES.

**DECISION: Option 2 — adaptive per-day slicing (Langston-concurred).** Solves Q-2 (size) + Q-5 (short per-slice txns, no long xmin hold → no VACUUM bloat) + memory (small objects both directions) + restart cost (re-export only missing slices) with ZERO external dependency.

**Sweep design (per old monthly partition):**
1. Decide **whole-vs-sliced ONCE up front** by projected compressed size (threshold ~1 GB). Record the decision. **INVARIANT (Langston): a month is EITHER one `'YYYY-MM'` object OR N `'YYYY-MM-DD'` slices — NEVER both** (else rehydrate's `label LIKE 'YYYY-MM%'` enumeration is ambiguous). Logic guard, not schema.
2. **Sliced path:** enumerate **DISTINCT `date(ts)` actually present** in the partition. For each date: short `REPEATABLE READ READ ONLY` txn → keyset export → gzip to temp → **streamed upload** → **streamed download-verify (checksum round-trip)** → manifest row (`partition_label='YYYY-MM-DD'`, tier=warm, pending→uploaded→verified). Each slice ≈150–500 MB ≪ 5 GB.
3. **DROP the whole monthly DB partition ONLY after the gate:** every DISTINCT `date(ts)` in the partition has a manifest row in state `verified` (download-verified, NOT upload-201). Then DROP + mark slices active. Empty calendar days produce no row and are NOT awaited (gate keys off distinct-dates-present, not calendar month).
4. **Small partitions (<~1 GB projected):** stay one-object-per-month as today (existing code path, now with streamed I/O).

**Streaming (both directions — download is a HARD prereq, it's in the verify step):**
- `uploadWarm` from **file path**: TUS path reads 6 MiB chunks via `fs.read(fd, offset)` — never buffers whole file. Checksum from `exportRes.checksum` (already streamed). Building blocks present (`sha256HexStream` :561, TUS `data.subarray` :213).
- `downloadWarm` to **file path**: pipe `res.body` → `fs.createWriteStream`; checksum via `sha256HexStream`. Used by sweep-verify AND rehydrate.
- `HARD_CAP` set to ≤ confirmed 5 GB ceiling + **pre-export projected-size check** → fail fast (don't stream 4 GB then 413).

**Activation:** root-crontab `15 2 * * *`; cold rotator stays dry-run; `hot_retention_days=30`; **failure→system-alert wired THIS batch** (don't activate a silent job to fix a silence problem); controlled attended force-sweep of May 31 GB partition after the synthetic >1 GB test passes.

**SIM:** §9 data-archive table (entries 1–8 LIVE) to be extended with the streaming + slicing change + the b75 sweep activation. No existing tests for storage-client/partition-exporter/sweep (only `b70-archive-batch-writer.test.ts`) → new test surface.

**Implementation chunks (Step 3):** A storage-client streamed upload-from-file; B storage-client streamed download-to-file; C sweep per-day-slice loop + whole-vs-sliced decision + distinct-dates DROP gate + projected-size check + HARD_CAP; D rehydrate streamed + multi-slice reassembly; E failure→system-alert; F cron install (Step 6); G tests (synthetic >1 GB upload/download round-trip, slice-gate, whole-vs-sliced invariant, distinct-dates gate); H local tsc+vitest.

**STATUS: Step-1 CONSENSUS REACHED (Langston concur). Next: Step 2 pre-audit (SIM §9 data-archive deep read) → Step 3 implementation.** Gated behind B-NEW-50 close per Kyle sequencing.
