# B-NEW-47 PRE-AUDIT — B75 tiered-sweep activation (fix-then-activate)

**Batch:** B-NEW-47 · **RI:** #161 · **Step:** 2 · 2026-06-01 · **Active trading:** OFF (zero capital).
**Author:** Claude Code. **Reviewer:** Langston (Step-2). **Mirror:** code edits in `C:\dev\DawnTraderV3` only.
**Scope (LOCKED §8):** `Scope Files/B_NEW_47_SCOPE.md` — Option 2 adaptive per-day slicing + streaming both directions; this pre-audit verifies every claim at code+DB level and finalizes the implementation surface.

---

## 0. PREVIOUSLY-STATED-VS-NOW (CLAUDE.md §9.2)

| Item | Scope §1/§8 stated | NOW (verified 2026-06-01) | Note |
|---|---|---|---|
| May spot-ticker partition | 31 GB | **31 GB** (33,550,811,136 B) | unchanged |
| May perp-ticker partition | 5.0 GB | **5,056 MB** | unchanged |
| May spot-ohlc partition | 4.4 GB | **4,453 MB** | unchanged |
| (new) May crypto-ohlc | — | **2,801 MB** | also >slice-threshold |
| (new) May crypto-ticker | — | **2,655 MB** | <slice-threshold (whole path) |
| DB total | 57 GB | **57 GB** / 200 GB ceiling | unchanged |
| Warm manifest rows | "4 real ctx_bridge archives" | **3 warm + 1 cold** ctx_bridge_log (one already rotated) | one warm→cold rotation has occurred historically |
| Supabase upload cap | 5 GB (probed) | (carried from scope; not re-probed this turn) | drives Option-2 |
| B74 ticker/ohlc archives | none (sweep never ran) | **confirmed zero** manifest rows for any ticker/ohlc table | sweep has never executed |

## 1. Per-component verification (code + DB)

**1.1 `partition-exporter.ts` — exportPartition() (UNCHANGED).** Already streams: keyset cursor on the timestamp column → `zlib.createGzip` → `fs.createWriteStream` with backpressure (`gzip.write`→`drain`); REPEATABLE READ READ ONLY snapshot; SHA-256 via streamed `sha256OfFile`. Accepts arbitrary `rangeStart`/`rangeEnd`/`partitionLabel`/`timestampColumn`/`partitionTableName`. **⇒ Per-day slicing = call exportPartition with day bounds + `partitionLabel='YYYY-MM-DD'` + the same `partitionTableName` (monthly child). ZERO exporter edits.** Peak memory already bounded (BATCH=1000 rows/query).

**1.2 `storage-client.ts` — THE DEFECT (confirmed).** `uploadWarm(bucket,path,data:Buffer)` and `uploadWarmTus(...,data:Buffer)` (`data.subarray` chunking, :214) require the WHOLE object in a Buffer. `downloadWarm` does `Buffer.from(await res.arrayBuffer())` (:268). `HARD_CAP=5GB` (:120). On a 3.7 GB-RAM box a ~4–6 GB compressed object OOM-kills both paths. **Co-callers of the Buffer API:** `b75-retention-sweep.ts` (:339/:348), `b75-rehydrate.ts` (:164), `b75-cold-rotator.ts` (:196), **and `context-bridge-log-ttl.ts` (:177/:186/:187)** — the last is a SECOND sweep with the same latent OOM but bounded (small bridge-log table + an existing 413→cold fallback at :194-222). Building blocks for the fix already present: `sha256HexStream(stream)` (:559), TUS chunk loop (:212-240).

**1.3 `b75-retention-sweep.ts` — the activation target.** `processPartition()` flow: stats → `upsertManifestPending` → `exportPartition` → **`fs.readFileSync(localPath)` (:339, OOM)** → `uploadWarm(Buffer)` → **`downloadWarm` re-read (:348, OOM)** → checksum compare → `updateManifestUploaded` → ts-bounds verify → `updateManifestVerified` → unlink → `dropPartition` → `updateManifestActive`. Per-month granularity (`listOldPartitions` parses `YYYY_MM` child names; eligibility = `rangeStart < cutoffMonthStart`). Crash-safe manifest states pending→uploaded→verified→active. **Needs:** whole-vs-sliced decision; per-day slice loop; distinct-dates DROP gate; streamed I/O; HARD_CAP + projected-size fail-fast; failure→system-alert.

**1.4 `b75-rehydrate.ts` — symmetric defect.** Per-label loop → `downloadWarm` → **`fs.writeFileSync(localPath, data.data)` (:164-166, OOM)**. Manifest query (:90-100) keys on `source_table` + `tstzrange(min_ts,max_ts) && window` — so it already matches by time-range, NOT by label-prefix; **multi-slice reassembly is mostly automatic** (each `YYYY-MM-DD` slice is a row whose `min_ts/max_ts` fall in the window → all returned + downloaded). Only change: streamed download-to-file + ensure one local file per slice label (already keyed by `label`). The `warmByLabel`/`coldByLabel` maps key on `partition_label`, which is now per-day — fine (distinct keys).

**1.5 `b75-cold-rotator.ts` — stays dry-run.** `default_warm_retention_days=365` ⇒ nothing rotates for a year. Buffered `downloadWarm`+`uploadCold(Buffer)` (:196/:205) is latent — but Option-2 slicing now BOUNDS every warm object to ≤~1 GB (whole path) or ≤~500 MB (slice), so when cold activates (future batch) its per-object buffer ≤~1 GB on the box. Acceptable; logged as a deferred follow-up (RUNNING_ISSUES), not fixed this batch (respects locked scope = warm path only).

**1.6 `system-alerts.ts` — chunk-E mechanism (verified).** `addAlert({triggers_at, category, severity, title, body, metadata})` writes to `/var/log/dawntrader/system-alerts.jsonl` under O_EXCL lock; `ensureFileExists()` bootstraps. A scheduled alert with `triggers_at = now` is promoted to `active` by the dispatcher's next 15-min tick and surfaces in the §10.5 per-turn check. **⇒ Sweep imports `addAlert`, calls it `category:'breakage' severity:'warning'` on any partition failure (and on a top-level fatal).** This file only exists on staging (`/var/log/...`) → in local unit tests we MUST NOT call the real addAlert (would mkdir `/var/log` on Windows); chunk-E code is isolated behind a thin wrapper so tests exercise sweep logic without touching the alert file.

## 2. DB facts (verified this turn)

- **Index:** `xstock_spot_ticker_snap_2026_05` PK = `btree (captured_at, symbol, id)` (+ `(symbol, captured_at DESC)`). Leading `captured_at` ⇒ per-day `EXISTS(... WHERE captured_at>=D AND captured_at<D+1)` probes and keyset export both ride the PK. ohlc tables use `ts` (per sweep spec). **Distinct-dates-present = ~28–31 cheap index `EXISTS` probes per partition, NOT a `SELECT DISTINCT date()` seq-scan.**
- **`data_archive_manifest`:** UNIQUE `(source_table, partition_label, tier)`; `state` CHECK ∈ {pending,uploaded,verified,active,migrating,migrated}; `tier` ∈ {warm,cold}; `format` ∈ {jsonl.gz,parquet}; `min_ts/max_ts/date_range_start/date_range_end` NOT NULL; `original_partition_size_bytes` nullable; partial index `_pending` on (source_table,partition_label) WHERE state∈{pending,uploaded,verified}. **⇒ Per-day slice = row with `partition_label='YYYY-MM-DD'`, `date_range_{start,end}`=day bounds. Distinct from the month row by the unique key.**
- **Crons (root crontab):** only `b70-retention-sweep` (`0 2 * * *`) + `b70-create-monthly-partitions` (`30 2 28 * *`). **No b75-sweep, no ctx-bridge-ttl, no cold-rotator.** Confirms scope. (B70 sweeps a DIFFERENT table set: pair_scan/signal_eval/exit_decision/macro_feed.)
- **Partition eligibility today:** retention=30 + monthly granularity ⇒ cutoffMonth = May 1 ⇒ only April partitions (7–35 MB) are naturally eligible now; the May giants (rangeStart=May 1) age in ~July 1. **The controlled force-sweep of May is the only way to validate streaming on real giant data this batch.**

## 3. Governance gap found — SIM B75 section is STALE (§9 framing: surface buried/wrong governance)

SIM lines 1693-1754 misstate current code:
- L1712: "500 MB single-call upload guard" → code is 40 MB threshold + 5 GB HARD_CAP + **TUS resumable** (already implemented).
- L1713: "LIMIT/OFFSET batched export" + L1740 "Keyset pagination … B75.x follow-up" → exporter **already uses keyset**.
- L1741: "Multipart/TUS … B75.x adds TUS" → **already added**.
- L1714/L1726-1729: marks b75-retention-sweep "✅ LIVE" and lists `15 2 * * *` + `0 3 1 * *` crons as the live schedule → **those crons were never installed** (code present ≠ scheduled). This is the exact "buried/imprecise governance" failure mode. **Step-10 will correct the SIM B75 section to reality + add the B-NEW-47 streaming+slicing+activation entries.**

## 4. Implementation plan (chunks A–H, all in `C:\dev` mirror)

- **A — storage-client streamed upload-from-file.** New `uploadWarmFile(bucket, path, localPath, opts:{size, checksum, contentType?})`. Routes >40 MB to a TUS variant that `fs.read(fd, sharedBuffer, 0, CHUNK, offset)` per 6 MiB chunk (never buffers whole file); ≤40 MB still reads the small file once. Returns `{bytes, checksum, uri}` using the passed-in streamed checksum (no re-hash). Keep Buffer `uploadWarm`/`uploadWarmTus` for ctx-bridge + tests.
- **B — storage-client streamed download-to-file.** New `downloadWarmFile(bucket, path, localPath): {bytes, checksum}` — pipe `res.body` (web ReadableStream) → `fs.createWriteStream` via `stream/promises pipeline`; checksum via a `PassThrough`/tee or a second `sha256HexStream(fs.createReadStream(localPath))` pass. Used by sweep-verify AND rehydrate. Keep Buffer `downloadWarm`.
- **C — sweep slicing + DROP gate** (the core). Per old partition:
  1. `original_partition_size_bytes` = `pg_total_relation_size(child)`. **Decision:** `sliced = hotBytes >= SLICE_THRESHOLD_HOT_BYTES` (≈3 GB hot ≈ ≤1 GB compressed at a conservative 3:1; hotBytes is a strict upper bound on compressed size). **Invariant guard:** if any existing manifest row for this `(source_table)` has `partition_label='YYYY-MM'` → continue WHOLE; if any has `'YYYY-MM-DD'` → continue SLICED; never mix.
  2. **Whole path** (small): existing flow but with streamed upload-from-file + streamed download-verify-to-temp; post-export assert `fileSize <= HARD_CAP` (defensive).
  3. **Sliced path:** enumerate distinct dates present via per-day `EXISTS` probes over `[rangeStart,rangeEnd)`. For each present date: `exportPartition` (day bounds, label `YYYY-MM-DD`, child as `partitionTableName`) → pre-upload `fileSize <= HARD_CAP` check (fail-fast) → `uploadWarmFile` → `downloadWarmFile` to temp + checksum round-trip → manifest pending→uploaded→verified → unlink temps. Each slice ≈150–500 MB.
  4. **DROP gate:** DROP the monthly child ONLY after EVERY distinct-present-date has a manifest row in state `verified` (download-verified, not upload-201). Then mark all slice rows `active` + set `hot_partition_dropped_at`. Empty calendar days produce no row and are not awaited.
- **D — rehydrate streamed.** Swap `downloadWarm`+`writeFileSync` → `downloadWarmFile`. Multi-slice reassembly already handled by the tstzrange manifest query (each slice is a row in-window) — verify each slice writes its own `<table>_<label>.jsonl.gz`.
- **E — failure→system-alert.** Thin `raiseSweepAlert(title, body, meta)` wrapper around `addAlert(category:'breakage')`, called on per-partition failure + top-level fatal. Isolated for testability.
- **F — cron install (Step 6, ops).** Root crontab `15 2 * * * su - deploy -c "cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b75-retention-sweep.ts" >> /var/log/dawntrader/b75-retention.log 2>&1`. Cold-rotator NOT scheduled.
- **G — tests** (new surface; only `b70-archive-batch-writer.test.ts` exists today): (1) streamed upload+download round-trip on a synthetic >1 GB temp file → checksum match + peak-RSS assertion (or mock the fetch layer + assert no whole-file Buffer alloc); (2) whole-vs-sliced decision boundary; (3) invariant guard (reject mixed month/day labels); (4) distinct-dates DROP gate (gate blocks until all present dates verified; ignores empty days); (5) projected-size HARD_CAP fail-fast. Factor the decision/gate/enumerate logic into pure exported helpers so they unit-test without a live DB.
- **H — local `npx tsc --noEmit` + `npx vitest run`** before push; tsc baseline = current HEAD (re-measure, do not hardcode).

## 5. Risk register

| Risk | Mitigation |
|---|---|
| Streamed download checksum needs whole stream | tee via PassThrough OR second read-pass of the temp file (small extra disk read, no memory blowup) |
| Force-sweep of 31 GB holds a long REPEATABLE READ txn vs live writers | Writers target the **June** partition, not May; May is read-only historical. Sliced path = ~17 short per-day txns, not one long one (also fixes Q-5 xmin-bloat). Attended run. |
| Disk: export temp + slices on a 23 GB-free disk | Per-day slices unlink immediately after verify; only ~1 slice (~300–500 MB compressed + its gz temp) on disk at a time. Whole path bounded <1 GB. Never the full 31 GB at once. |
| Manifest invariant violated by a crash mid-switch | Guard re-derives whole-vs-sliced from existing rows on resume; deterministic from stable hotBytes |
| `addAlert` mkdir on Windows in tests | chunk-E isolated behind wrapper; tests never call the real file writer |

## 6. OPEN QUESTIONS FOR LANGSTON (Step-2)

- **Q-A (decision threshold):** `SLICE_THRESHOLD_HOT_BYTES` as a **DB-seeded `data_lifecycle` constant** (consistent with all other sweep config + Kyle "DB-governed, fail-hard-if-empty") via a tiny seed migration, vs a well-commented code constant? CC leans DB-seeded (~3 GB hot). Agree?
- **Q-B (streamed-download checksum):** PassThrough-tee during the pipe vs a second read-pass of the temp file for `sha256HexStream`. CC leans second read-pass (simplest, no tee race; disk-read only). Agree?
- **Q-C (additive methods):** keep Buffer `uploadWarm`/`downloadWarm` for `context-bridge-log-ttl.ts` + tests, ADD `uploadWarmFile`/`downloadWarmFile` for archives — vs converting the Buffer methods in place (forces ctx-bridge to temp-file its small payloads)? CC leans additive (smallest blast radius; Langston Step-1 concurred Option-1 streaming). Agree?
- **Q-D (ctx-bridge latent OOM):** log `context-bridge-log-ttl.ts` buffered-upload as a deferred RUNNING_ISSUE (bounded by small table + 413→cold fallback; not scheduled) rather than fix this batch? Agree?
- **Q-E (force-sweep scope):** force-sweep ONLY `xstock_spot_ticker_snap_2026_05` (31 GB) as the validation, leaving the other May giants to natural July eligibility — vs force-sweep ALL May partitions >threshold now (frees ~46 GB but longer attended run)? CC leans the single 31 GB partition (biggest lever + cleanest validation; rest age naturally). Agree?
- **Q-F (SIM correction):** confirm Step-10 corrects the stale SIM B75 section (500 MB guard / LIMIT-OFFSET / TUS-deferred / phantom cron schedule) as part of this batch's governance. Agree?

---

## 7. LANGSTON STEP-2 — APPROVED-W-REVISIONS (folded 2026-06-01, consensus)

Langston concurred all 6 Q's and added 5 correctness/blast-radius fold-ins. Resolutions:
- **Q-A → DB-seeded** `slice_threshold_hot_bytes` (~3 GB) in `data_lifecycle`, **fail-hard-if-empty** (no code-const default — that would reintroduce the §5-#15 silent-fallback violation). Two hard conditions: (1) `reqNum` it in the config loader; (2) **the resume invariant guard (re-derive whole-vs-sliced from existing manifest rows) OVERRIDES the live DB threshold** — else lowering the threshold mid-partition flips a half-swept month whole→sliced and mixes labels.
- **Q-B → second read-pass checksum** (validates bytes-as-landed-on-disk; catches write-path corruption a tee would miss). Already implemented in chunk B.
- **Q-C → additive methods** + add a one-line comment on `uploadWarm`/`downloadWarm` marking them the small-payload/Buffer path.
- **Q-D → defer ctx-bridge OOM as RI**, but precise text: the `413→cold` fallback does **NOT** protect against OOM (`Buffer.from(arrayBuffer())` OOMs *before* any 413); real mitigation = bridge-log table stays small. State the concrete OOM-trigger size, not a vague TODO.
- **Q-E → force-sweep ONLY the 31 GB spot-ticker**; NO second force-sweep (57/200 GB = no ceiling pressure; other May giants roll off naturally in July once cron is proven).
- **Q-F → SIM correction mandatory**; the phantom "✅ LIVE" cron (L1714/L1726-29) is the dangerous one (implies a sweep that never ran).

**5 fold-ins (all into chunk C/E + governance):**
1. **Write-sealed invariant — state it explicitly.** The DROP gate + stable-hotBytes resume guard + per-slice independent snapshots are correct ONLY because an eligible partition (`rangeStart < cutoffMonthStart`) is write-sealed (writers target the current month). Assert/comment it; if ever false the gate can pass while a date mutates.
2. **Per-slice resume SKIPS already verified/active slices** — read per-slice manifest state before exporting; don't rely on the UNIQUE constraint to no-op.
3. **Single-day slice > HARD_CAP = permanent-stall trap** (date never verifies → gate never passes → nightly alert). Not reachable now (~300–500 MB/day) but no sub-day fallback exists → document as a known boundary (RUNNING_ISSUE), not a surprise.
4. **Checksum-mismatch round-trip → higher severity** (`critical`) than a transient failure (`warning`) — corruption vs retryable.
5. **Rehydrate output contract changed** one-file→N-files per month — verify no consumer globs `<table>_YYYY-MM.jsonl.gz` single-file before Step-3 close (low risk; rehydrate rarely invoked).

**STATUS:** Step-2 CONSENSUS REACHED (APPROVED-W-REVISIONS, folded). Proceed to Step 3 chunks A–H.
