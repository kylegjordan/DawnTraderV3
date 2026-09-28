# F-G-1 REOPEN (OBJ-9 ① and ②) — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: sub_batch

> **Owner:** CC-C · **Opened:** 2026-09-28 · **Parent:** `F-G-1` / `B-GRID-REPRESENTABILITY` (plan row 3; progress report `Batch Completion/F_G_1_PROGRESS_REPORT.md` §7 and its amendment) · **Plan:** `PUSH_TO_LIVE_PLAN.md` section 0, CC-C's plate: "F-G-1-REOPEN" · **Issue:** `#1031`
> **Bounded by Langston (J9, 2026-09-11 09:28Z):** the reopen is limited to OBJ-9's ORDERING GUARANTEE. The unbounded database checkout, the in-flight buffer cap and the shutdown drain (`#1034`), and the ticker chunk double-insert (`#1032`) are **not** in it; they are homed at `PHASE_19_PLAN` `3b.h-8`.
> **Not a hotfix:** nothing is broken now. The failure needs a transient write error while two flushes of one class overlap, and none has been observed on a bar that mattered.

## 0. PREVIOUSLY STATED vs NOW
**PREVIOUSLY STATED** (F-G-1 conversion plan, §6): OBJ-9 met. **NOW:** OBJ-9 ① and ② are both unmet in production. **REASON:** `#1031` and Langston's J9 (§7 of the progress report).

## 1. THE CRITERIA, VERBATIM
- **①** *"Splice AFTER a successful write"* (`B_EXIT_GRID_REPRESENTABILITY_SCOPE.md`, OBJ-9, as graded by Langston at J9).
- **②** *"A retried batch appended after fresh rows makes the STALE row win and overwrite a good bar. ⇒ the dedupe switches to MAX-BY-ARRIVAL; do not rely on preserving order, which is the fragile half."* (`:176`, Langston finding E)
- **The progress report's own addition (§7):** *"max-by-arrival inside one flush cannot protect a newer bar already written by an earlier flush. The fix must hold across flushes."*

## 2. AUDIT — WHAT THE CODE DOES AT `origin/migration/aws-supabase`

| # | finding | where |
|---|---|---|
| **A1** | **Drain before write (① unmet).** `flushAssetClass` empties the whole buffer (`batch.splice(0, batch.length)`) before `acquireSlot()`. A transient failure then re-adds the rows at the FRONT (`buf.unshift(...rows)`), which is a substitute for splicing after success. | `server/services/passive-archive/ohlc-batch-writer.ts:249`, `:348-349` |
| **A2** | **No in-flight guard per class.** The timer fires every 5 s (`BATCH_FLUSH_INTERVAL_MS`, `:30`) and calls every class's flush without waiting (`:376-378`). With two insert slots (`MAX_CONCURRENT_INSERTS = 2`, `:32`), a newer flush of one class can commit while an older one is still inside its insert. | `:30`, `:32`, `:376-378` |
| **A3** | **Order is the only protection (② unmet).** In-flush dedupe keeps the LAST row per `(symbol, interval_begin)` by Map insertion order (`:260-267`). The upsert overwrites unconditionally (`:307-319`). So if the older flush fails after the newer one commits, its rows go back to the front, and the next flush writes the older bar over the committed newer one. **One transient failure is enough** (`#1031`). | `:260-267`, `:307-319` |
| **A4** | **What each row already carries.** Every row is stamped `capturedAt: new Date()` when it is BUFFERED, which is an arrival stamp. The upsert then overwrites the stored `captured_at` with `NOW()`, the database write time. The stored column therefore means arrival for an insert and write time for an update. | producers `equity-spot-archiver.ts:224`, `crypto-spot-archiver.ts:158`, `kraken-futures-archiver.ts:171`; writer `:317` |
| **A5** | **`captured_at` on the bar tables has live readers**, so re-purposing it as an arrival key is not free. Files that query a `*_ohlc_1m` table and also mention `captured_at`: `vts-runner.ts`, `xstock_spot/scanner.ts`, `b-xstock-freshness-monitor.ts`, `xstock_spot/ohlc-aggregator.ts`, `xstock-ohlc-cache.ts`, `active-execution-engine.ts`, `b75-retention-sweep.ts`, plus analysis scripts. ⚠️ This is a FILE-level census. Whether each mention reads the OHLC column or a ticker table's column is NOT resolved here; Option C below would owe that per-site read. | repo-wide grep, tests excluded |

### Census at each hop (§9.5(a))
| question | answer |
|---|---|
| who **writes** to the buffer | exactly **3**: `crypto-spot-archiver.ts:135`, `equity-spot-archiver.ts:121`, `kraken-futures-archiver.ts:124` (the futures archiver is one class with two instances, one per perp leg) |
| who **flushes** (schedules) | the timer in `startBatchWriter` (`:376`, started once at `passive-archive-bootstrap.ts:221`), `stopBatchWriter` (`:388`), and the shutdown drain `drainArchiveBuffersForShutdown` (`:403`, called once from `core/boot_orchestrator.ts:58`). **Two schedulers can overlap** (the timer and the drain) and need a mutual-exclusion check: see P2. |
| who **mutates** buffered rows | only `flushAssetClass` (drain, re-add, shed) |
| who **deletes** stored rows | `server/scripts/b75-retention-sweep.ts` (partition-level retention). Row-level deletes: none found. |
| who **reads** stored rows | many (scanner, aggregator, VTS runner, bar cache, freshness monitor, dashboards); none depend on write ORDER, only on the final stored bar. |

### Provenance (§9.5(b))
- The last-wins dedupe and the upsert are `B-NEW-35` (2026-05-19/20, `B_NEW_35_SCOPE.md` §2): *"Latest WS update IS the correct cumulative OHLCV for that minute"*. That premise is TEMPORAL and holds only while writes land in arrival order.
- The front re-add is F-G-1's own `98640f00a`, which kept last-wins and relied on order, the half ② says not to rely on.
- **The same drain-before-the-slot class exists in a different writer:** `data-archive/archive-batch-writer.ts:194` (`#1078`, found 2026-09-28, where it lost 670 learning rows). This writer drains before its slot too, but re-queues on a transient failure, so its visible harm is ordering rather than loss. Separate batch; cross-referenced both ways.
- `bridge/canonical/`: no coverage of the batch writer (it postdates the corpus).

## 3. OPTIONS FOR ② — ONE RULING WANTED

| option | how | cost | risk |
|---|---|---|---|
| **A (recommended)** | New nullable column **`arrived_at timestamptz`** on the four OHLC parents (partitioned; adding a nullable column with no default is a metadata-only change). Set from each row's buffer-time stamp. The upsert sets it and **only overwrites when `t.arrived_at IS NULL OR t.arrived_at <= EXCLUDED.arrived_at`**. The in-flush dedupe keeps the row with the latest arrival, not the last inserted. | a migration plus rollback (both in git) and a MANIFEST entry; **≈ 8 bytes a row**, about 5 MB a day across the four tables at today's ~670k bars a day (to be measured at Step 3), ~160 MB at steady state under the 30-day hot window. That is small but not nothing while the database alert is critical, so it is stated. | none on readers: `captured_at` keeps its meaning. Existing rows stay NULL, and NULL always accepts the first new write. |
| **B** | No schema change. Guard the upsert on the bar's **cumulative volume** (`WHERE EXCLUDED.volume >= t.volume`), since a minute's volume only grows as trades arrive. | none | rests on a venue property, not on arrival. A venue correction that lowers a bar's volume would be refused. Needs Kraken's OHLC documentation cited (`vendor-docs-unread`). Not the criterion's "max-by-arrival". |
| **C** | No schema change. Make the stored `captured_at` mean arrival: `SET captured_at = EXCLUDED.captured_at` with the same `<=` guard. | none | changes what a live column means under the readers in A5; each needs a per-site read first. |

## 4. IMPLEMENTATION PLAN (each item points at the finding it fixes)

- **P1 ← A1 (①).** Snapshot `n = buffer.length`; write `buffer.slice(0, n)` (deduped); **`buffer.splice(0, n)` only after the write succeeds.** A transient failure leaves the rows where they are (the `unshift` path is deleted). A permanent failure still drops `n` rows with its alert, unchanged. The retry cap and its loud shed stay in the transient branch (`#1034` owns the cap's placement).
- **P2 ← A2.** A **per-class in-flight promise**. A flush of a class already in flight returns that same promise instead of starting a second one. **`stopBatchWriter` awaits every in-flight promise, then runs one final flush**, so the shutdown drain cannot skip a class because the timer happened to be mid-flush. *(Mutual exclusion between the two schedulers in the census; the drain's race with `process.exit` stays `#1034`'s.)*
- **P3 ← A3, A4 (②), per the option ruled.** Under A: the `arrived_at` column (schema `ohlcColumns`, migration, rollback, MANIFEST), set from the buffered stamp; the upsert's `setWhere` guard; dedupe by latest arrival.
- **P4 — tests.** (a) Dedupe keeps the latest arrival regardless of buffer order. (b) The `#1031` sequence, flush A in flight, flush B commits a newer bar, A fails transiently: under P1 and P2 the older rows are never re-queued ahead of the newer ones, and under P3 the generated upsert carries the guard. (c) A second flush call during an in-flight flush starts no second insert. (d) The drain awaits the in-flight flush. **Mutations:** splice-before-write, the in-flight guard removed, the guard removed from the upsert, and dedupe back to last-inserted. Each must fail a test.
- **P5 — verification after deploy (a rendering and stored-value claim only).** New rows carry `arrived_at`; the writer's log shows no second concurrent flush per class. A transient failure cannot be induced on staging, so ① and ② are graded by code and tests, and that is stated as the limit.

**Deploy:** it rides CC-C's second deploy (after the 2026-10-02 held deploy), with its migration.

## 5. DOCUMENT SET — class `sub_batch`
scope = this document (a reopen of an approved batch; no new Step 1) · this pre-audit · change list at Step 4 · the conversion of `F_G_1_PROGRESS_REPORT.md` to its completion report, grading OBJ-9 ① and ② from this work · `BATCH_CATALOG`, `PHASE_HISTORY`, `RUNNING_ISSUES` (`#1031`), `PUSH_TO_LIVE_PLAN` section 0 · `SYSTEM_IMPACT_MAP` (writer contract and, under option A, the new column) — judged applicable · `SYSTEM_MANUAL` — judged N/A (writer mechanics, not trading math) · `STORAGE_POLICY` — applicable under option A (a column added to hot tables).
