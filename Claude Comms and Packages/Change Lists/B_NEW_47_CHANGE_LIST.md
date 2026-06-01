# B-NEW-47 CHANGE LIST — B75 tiered-sweep streaming + adaptive slicing (Step 4 code review)

**Batch:** B-NEW-47 · **RI:** #161 · 2026-06-01 · **Active trading:** OFF.
**Reviewer:** Langston (Step-4 code review BEFORE push). **All 5 your Step-2 fold-ins landed — mapped below.**
**INFRASTRUCTURE NOTE:** Do NOT cd to /mnt/gdrive or run git on the mount. The full changed files are staged in your inbox `/home/langston/inbox/b-new-47/` (local FS, fast Read). For live repo/DB inspection use `ssh staging`.

**Verification already GREEN locally:** `tsc --noEmit` = 493 (B-NEW-50 baseline, ZERO new errors in touched files); 16 new B-NEW-47 tests pass; tsx runtime ESM import of the changed modules loads+constructs clean (no new CJS dep — only Node built-ins, so the BUG-2026-06-01-A trap doesn't apply); the 12 full-suite failures are PROVEN pre-existing (identical failures at clean HEAD via git-stash test — all are local-no-Postgres artifacts; CI has the Postgres service container).

---

## Files changed
- `server/services/data-archive/storage-client.ts` (+209) — new streaming methods.
- `server/services/data-archive/sweep-slicing.ts` (NEW) — pure helpers (testable).
- `server/scripts/b75-retention-sweep.ts` (+542/−140, near-rewrite) — slicing + DROP gate + streamed I/O + failure-alert.
- `server/scripts/b75-rehydrate.ts` (+22/−...) — streamed warm download + multi-slice doc.
- `drizzle/migrations/2026-06-01-b-new-47-slice-threshold.sql` (+ rollback) + `MANIFEST.txt` entry.
- `server/tests/unit/b-new-47-sweep-helpers.test.ts` (NEW, 11 tests) + `b-new-47-storage-streaming.test.ts` (NEW, 5 tests).

## 1. storage-client — the OOM fix (additive; Buffer methods kept for small ctx-bridge payloads, now comment-marked per your Q-C)

NEW `uploadWarmFile` routes >40 MB to a TUS-from-FD path that never buffers the whole file:
```ts
// uploadWarmTusFile — chunk source is fs.read at offset, peak mem = one 6 MiB buffer
const fd = fs.openSync(localPath, 'r');
const buf = Buffer.allocUnsafe(CHUNK_SIZE); // 6 MiB
while (offset < size) {
  const want = Math.min(CHUNK_SIZE, size - offset);
  let filled = 0;
  while (filled < want) { const n = fs.readSync(fd, buf, filled, want - filled, offset + filled); if (n===0) break; filled += n; }
  const chunk = buf.subarray(0, want);              // shares buf; safe — PATCH awaited before reuse
  const patchRes = await fetch(location, { method:'PATCH', headers:{ 'Upload-Offset': String(offset), 'Content-Length': String(want), ... }, body: chunk });
  // 204 + server-offset drift check ...
  offset += want;
}
```
NEW `downloadWarmFile` streams body→file then checksums the on-disk bytes (your Q-B second read-pass):
```ts
await pipeline(Readable.fromWeb(res.body as ...), fs.createWriteStream(localPath));
const checksum = await sha256HexStream(fs.createReadStream(localPath));
return { bytes: fs.statSync(localPath).size, checksum };
```

## 2. sweep — DRY `archiveOneObject` used by BOTH whole + sliced paths

```ts
// resume skip (FOLD-IN #2): already verified/active → no re-export
const existing = await getManifestRow(ctlClient, spec.parent, label, 'warm');
if (existing && (existing.state==='verified'||existing.state==='active') && existing.checksum)
  return { manifestId: existing.id, rowCount:0, bytesCompressed:0, reused:true };
...
const fileSize = fs.statSync(exportRes.localPath).size;
if (fileSize > HARD_CAP_BYTES) throw new Error(`object ${label} ${fileSize}B exceeds HARD_CAP; no sub-day fallback`); // FOLD-IN #3
const upload = await storage.uploadWarmFile(cfg.warmBucket, objPath, exportRes.localPath, { size:fileSize, checksum:exportRes.checksum });
verifyPath = `${exportRes.localPath}.verify`;
const dl = await storage.downloadWarmFile(cfg.warmBucket, objPath, verifyPath);
if (dl.checksum!==exportRes.checksum || upload.checksum!==exportRes.checksum) throw new ChecksumMismatchError(...); // → critical alert, FOLD-IN #4
// ... updateUploaded → ts-bounds verify → updateVerified; finally unlink temp + verify file
```

## 3. sweep — mode decision (invariant guard OVERRIDES live threshold) + sliced path + DROP gate

```ts
const existingLabels = await listMonthLabels(ctlClient, spec.parent, partition.partitionLabel);
const resumeMode = deriveModeFromLabels(partition.partitionLabel, existingLabels); // throws if month+day both exist
mode = resumeMode ?? decideSliceMode(bytesHot, cfg.sliceThresholdHotBytes);       // Q-A DB-governed threshold
...
// SLICED: distinct dates PRESENT via per-day index EXISTS probes (NOT SELECT DISTINCT date())
const presentDates = await listPresentDates(ctlClient, partition.child, spec.timestampColumn, rangeStart, rangeEnd);
for (const day of presentDates) await archiveOneObject(..., dayLabel(day), day, day+1d, partition.child, bytesHot);
// DROP gate (FOLD-IN #1 write-sealed): drop ONLY after EVERY present date is verified/active
const stateRows = await ctlClient.query(`SELECT partition_label,state FROM data_archive_manifest WHERE source_table=$1 AND tier='warm' AND partition_label = ANY($2)`, [spec.parent, presentLabels]);
const missing = presentLabels.filter(l => !verifiedSet.has(l));
if (missing.length) throw new Error(`DROP gate BLOCKED: ${missing.length}/${presentLabels.length} not verified`);
await dropPartition(ctlClient, partition.child);
await markLabelsActive(ctlClient, spec.parent, presentLabels);
```
Failure→alert (chunk E): per-partition failure raises `addAlert({category:'breakage', severity: isChecksumMismatch?'critical':'warning'})`; top-level crash raises a `critical`. Hot partition is NEVER dropped on failure (data safe).

## 4. Config + migration (Q-A DB-governed, fail-hard)
```ts
sliceThresholdHotBytes: reqNum('slice_threshold_hot_bytes'),  // fail-hard if missing — no code default
```
Migration seeds `data_lifecycle.slice_threshold_hot_bytes = 3221225472` (3 GiB hot ≈ ≤1 GB compressed @3:1) with ON CONFLICT DO UPDATE; registered in MANIFEST.txt; drift self-check clean. Verified both `equity_*` (stale) AND `xstock_*` (current) retention keys exist on staging → sweep config load won't fail (stale `equity_*` dupes logged for cleanup).

## 5. Write-sealed invariant (FOLD-IN #1) — stated in the file header + the eligibility comment
Eligible partition = `rangeStart < cutoffMonthStart` ⇒ its whole month is past ⇒ live writers target a LATER month ⇒ no concurrent mutation. The per-slice snapshots + stable-hotBytes resume + DROP gate all rest on this.

## 6. Open items for your review
- **R-1:** the TUS chunk reuses one 6 MiB `buf` across PATCH iterations (`buf.subarray`). Safe because undici copies the body before the awaited fetch resolves, and the next `fs.readSync` only runs after the await. Confirm you're comfortable with that reasoning (the existing buffered `uploadWarmTus` uses the same `data.subarray` pattern).
- **R-2:** day>HARD_CAP permanent-stall is a documented boundary (FOLD-IN #3) → I'll log RUNNING_ISSUES at Step 10. OK to ship with the documented limit (not reachable at ~300–500 MB/day)?
- **R-3:** ctx-bridge buffered upload latent-OOM → deferred RUNNING_ISSUE per your Q-D (precise text: 413→cold does NOT protect OOM; mitigation = small table). OK?
- **R-4:** activation plan unchanged — root-cron `15 2 * * *`, cold dry-run, force-sweep ONLY the 31 GB May spot-ticker (Step 6, attended).

Reply **APPROVED / APPROVED-W-REVISIONS / REVISE** with code-level specifics. On approval I push (CI all-4-green gate), deploy, run the attended force-sweep, verify on staging, then governance + close.
