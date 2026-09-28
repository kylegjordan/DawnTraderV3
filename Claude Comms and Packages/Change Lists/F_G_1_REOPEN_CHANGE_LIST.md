# F-G-1 REOPEN (OBJ-9 ① and ②, #1031) — STEP 4 CHANGE LIST

**Graded ref:** `4f9df55e1` on `origin/migration/aws-supabase` (code commit `7cae297a3`, rebased). **CI:** run `36493264716`, 4/4 green (TypeScript Check · Test Suite · Build · Docker Build), per job. The integration fence ran against CI's Postgres, not skipped: all 6 legs `✓` in the Test Suite log.

## DISPATCH HEADER (workflow-04, three fields)
| # | field | value |
|---|---|---|
| i | **declared change-class** | `sub_batch` (from `F_G_1_REOPEN_PRE_AUDIT.md` header) |
| ii | **doc set for `sub_batch`** (`config.mjs:129-132`) | `completion_report`: **absent, due at Step 11** (conversion of `F_G_1_PROGRESS_REPORT.md`) · `batch_catalog`: **absent, due Step 10** · `phase_history`: **absent, due Step 10** · `scope`: **N/A**, a reopen of an approved batch (no new Step 1; the original F-G-1 scope stands) · `pre_audit`: **present**, `Scope Files/F_G_1_REOPEN_PRE_AUDIT.md` r3 · `system_manual`: **judged N/A**, the archive writer is data plumbing, not architecture/strategy/regime/filter/pipeline/math · `sim`: **applicable, due Step 10** (the writer gains a column, an in-flight map and a counter) · `changes_and_fixes`: **applicable, due Step 10** · `running_issues`: **applicable, due Step 10** (`#1031`) · `deleted_log`: **judged N/A**, no component removed (the `unshift` re-add is a changed path inside a live function) · `adjustment_framework`: **N/A** · `phase_19_plan`: **applicable, due Step 10** · plus `STORAGE_POLICY`: **applicable, due Step 10** (a column on hot tables) |
| iii | **Step-2 reference** | `Claude Comms and Packages/Scope Files/F_G_1_REOPEN_PRE_AUDIT.md` r3 at `b912c0790` — Step 2 **cleared** by Langston 2026-09-29 with four conditions, all folded |

## FILES
| file | status |
|---|---|
| `server/services/passive-archive/ohlc-batch-writer.ts` | MODIFIED — P1, P2, P3 |
| `shared/schema.ts` | MODIFIED — `ohlcColumns.arrivedAt` (6 lines) |
| `drizzle/migrations/2026-09-29-f-g-1-ohlc-arrived-at.sql` | NEW (force-added) |
| `drizzle/migrations/2026-09-29-f-g-1-ohlc-arrived-at-rollback.sql` | NEW (force-added, in git, not in MANIFEST) |
| `drizzle/migrations/MANIFEST.txt` | MODIFIED — one line |
| `server/tests/unit/f-g-1-reopen-writer-order.test.ts` | NEW — 12 tests |
| `server/tests/integration/f-g-1-ohlc-arrival-guard.test.ts` | NEW — 6 tests, real partitioned table |
| `server/tests/unit/f-g-1-writer-retry-fence.test.ts` | MODIFIED — comments for the deleted `unshift`; one test renamed |

No untracked file is part of the change (`git status --porcelain` shows only `.claude/launch.json`, local config).

## P3 — THE STAMP, AT THE CHOKEPOINT
BEFORE:
```ts
export function bufferOhlcBar(assetClass: ArchiveAssetClass, row: InsertEquitySpotOhlc1m): void {
  buffers[assetClass].push(row);
}
```
AFTER:
```ts
export function bufferOhlcBar(assetClass: ArchiveAssetClass, row: InsertEquitySpotOhlc1m): void {
  buffers[assetClass].push({ ...row, arrivedAt: new Date() });
}
```
The stamp is spread LAST, so a producer row carrying `arrivedAt` cannot set the guard's input (tested; mutation "stamp before spread" killed).

## P3 — DEDUPE: LATEST ARRIVAL, TIES TO LAST INSERTED (condition 2)
BEFORE (`:260-267`): `dedupedMap.set(key, row)` unconditionally (buffer-order last wins).
AFTER:
```ts
export function dedupeLatestArrival(rawRows: InsertEquitySpotOhlc1m[]): InsertEquitySpotOhlc1m[] {
  const dedupedMap = new Map<string, InsertEquitySpotOhlc1m>();
  for (const row of rawRows) {
    /* key = symbol::intervalBegin, unchanged */
    const prev = dedupedMap.get(key);
    if (prev === undefined || arrivalMs(row) >= arrivalMs(prev)) dedupedMap.set(key, row);
  }
  return Array.from(dedupedMap.values());
}
```
`arrivalMs` returns `-Infinity` for an absent stamp, so an unstamped row never beats a stamped one and two unstamped rows keep last-inserted.

## P3 — THE UPSERT GUARD (extracted to `upsertOhlcRows`, same chunking)
```ts
set: { /* open..tradeCount unchanged */ capturedAt: sql`NOW()`, arrivedAt: sql`EXCLUDED.arrived_at` },
setWhere: sql`${(table as any).arrivedAt} IS NULL OR ${(table as any).arrivedAt} <= EXCLUDED.arrived_at`,
```
Rendered (asserted exactly in the unit fence): `"crypto_spot_ohlc_1m"."arrived_at" IS NULL OR "crypto_spot_ohlc_1m"."arrived_at" <= EXCLUDED.arrived_at`. `upsertOhlcRows` is exported so the integration fence drives the REAL SQL with explicit stamps (the two-process case cannot be produced through `bufferOhlcBar`).

## P1 — REMOVE ONLY AFTER A SUCCESSFUL WRITE
BEFORE:
```ts
const batch = buffers[assetClass];
if (batch.length === 0) return;
const rawRows = batch.splice(0, batch.length); // drain atomically
... catch (transient) { buf.unshift(...rows); /* + cap */ }
```
AFTER:
```ts
const buf = buffers[assetClass];
if (buf.length === 0) return;
const n = buf.length;
const rows = dedupeLatestArrival(buf.slice(0, n));
try { await acquireSlot(); try { await upsertOhlcRows(assetClass, rows); console.log(... `(coalesced=${coalescedFlushes[assetClass]})`); }
      finally { releaseSlot(); }
      buf.splice(0, n);                        // success: the snapshot leaves now
      clearPermanentAlertLatch('ohlc', assetClass);
} catch (err) {
  if (!isTransientWriteError(err)) { buf.splice(0, n); /* log + alert, unchanged */ return; }
  // transient: rows are still at the front — nothing to put back; the cap/shed block is unchanged
}
```
Rows pushed during the flight sit BEHIND the snapshot, and P2 guarantees no other flush of the class touches the front while this one is in flight, so the front `n` are exactly the rows written.

## P2 — ONE FLUSH PER CLASS, COALESCED AND COUNTED (condition 3)
```ts
const inFlight: Partial<Record<ArchiveAssetClass, Promise<void>>> = {};
const coalescedFlushes: Record<ArchiveAssetClass, number> = { xstock_spot: 0, xstock_perp: 0, crypto_spot: 0, crypto_perp: 0 };
export function flushAssetClass(assetClass: ArchiveAssetClass): Promise<void> {
  const running = inFlight[assetClass];
  if (running) { coalescedFlushes[assetClass]++; return running; }
  const p: Promise<void> = doFlushAssetClass(assetClass).finally(() => { if (inFlight[assetClass] === p) delete inFlight[assetClass]; });
  inFlight[assetClass] = p;
  return p;
}
```
`stopBatchWriter`: `await Promise.allSettled(Object.values(inFlight));` then the existing final `Promise.all(ALL_ARCHIVE_CLASSES.map(flushAssetClass))`. The counter is published on every successful upsert line and via `getOhlcWriterCoalescedFlushes()`.

## THE MIGRATION (condition 4)
```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE crypto_spot_ohlc_1m ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE xstock_spot_ohlc_1m ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE xstock_perp_ohlc_1m ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE crypto_perp_ohlc_1m ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
COMMENT ON COLUMN ... ;
COMMIT;
```
A timeout aborts the file; `db-migrate.ts` exits non-zero (its header: each migration in its own transaction, non-zero on any failure), so `dt-deploy` stops before the restart and the deploy is re-run. The rollback drops the four columns under the same lock timeout and says to revert the code first (a missing column is classified PERMANENT and would drop rows, the `#704` shape).
**Downstream census for the new column:** `\copy` exports in `scripts/codex-export/export-data.sql:33-34` list columns explicitly (unaffected); the retention sweep exports JSONL.gz rows (self-describing; a restored old row lacks the key ⇒ NULL); partitions are created `PARTITION OF` the parent (inherit the column). **One other writer exists:** `server/scripts/perpfeed-gate-test.ts:77`, an operational probe, `INSERT INTO ${PARENT} (symbol, asset_class, exchange, interval_begin, open, high, low, close, volume)`: an explicit column list, so its rows land `arrived_at` NULL, which the guard treats as "accept the next stamped write". Harmless. (Census: every file in `server/` and `scripts/` naming an OHLC table, tests excluded, read for its `INSERT` targets; the other scripts' inserts go to `module_constants`, `b62_retroactive_labels`, `data_archive_manifest`, `xstock_dbs_backfill` and DBS tables. A first single-line grep missed variable-table inserts, including the writer's own at `:340`, so it was not used as the census.)

## TESTS AND MUTATIONS
Unit fence (12): stamp present · producer cannot supply the stamp · latest arrival wins out of buffer order · equal stamps keep last-inserted · unstamped never beats stamped · CONTROL different keys never merged · setWhere rendered exactly + `set.arrivedAt` · transient keeps rows, success removes them · a bar arriving mid-flush survives a failed flush and the fresher arrival wins the retry · second call during a flight: same promise, one insert, counter +1 · CONTROL a call after the flight is a fresh flush, not counted · the drain waits a flight out, then writes the rows that arrived during it.
Integration fence (6, real `crypto_spot_ohlc_1m` partition `_2026_09`): CONTROL first write lands with its stamp · older arrival written second does NOT overwrite · later overwrites · equal overwrites · a stored NULL accepts the first stamped write · CI-only guard that the writes hit the `test` database.
**Mutations run locally, all 11 KILLED:** no stamp · stamp before spread · dedupe last-inserted · tie strict `>` · `setWhere` removed · in-flight guard removed · counter not incremented · drain without awaiting flights · splice before write · no success splice · permanent branch keeps rows. ⚠️ **Not run:** the three integration mutations (`setWhere` removed, `<=` → `<`, `IS NULL` arm dropped) need Postgres, which this machine does not have. The unit fence kills the first; the other two are killed only by the integration legs, which ran green in CI but whose mutations were not executed.

## JUDGEMENT CALLS I WANT ATTACKED
1. **Exporting `flushAssetClass` and `upsertOhlcRows`.** Both are test seams; neither has a new production caller. Acceptable, or should the integration fence go through a narrower export?
2. **`arrivalMs` treats an unparseable stamp as `-Infinity`.** Post-chokepoint every buffered row is a `Date`; the fallback only matters for a row that bypassed `bufferOhlcBar`, which the census says does not exist. Fail-open to "loses the dedupe" was chosen over throwing inside the flush.
3. **The coalesced counter is in-process and resets on restart.** P5 reads it from the `upserted N rows (coalesced=K)` lines in `out.log`, whose reach is hours. Enough for P5's single read after deploy, not a durable record.
4. **The permanent branch removes the raw `n`, logs `rows.length` (deduped).** Unchanged semantics; the log counts what was attempted, not what was buffered.
