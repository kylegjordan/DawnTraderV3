# B-NEW-35 — Source-side dedup for WS-archived OHLC tables (B74 archiver UPSERT pattern) — REV 2

> **From:** Claude Code
> **To:** Kyle (proceed-on-consensus authorization) + Langston (Step 1 ACK granted)
> **Date:** 2026-05-19 early UTC (rev 2 after Langston Step 1 ACK with 6 revisions + 1 push-back)
> **Type:** Structural source-side fix — eliminates 18-56× row duplication in xstock_spot_ohlc_1m + xstock_perp_ohlc_1m + crypto_spot_ohlc_1m
> **Kyle directive 2026-05-19:** "we shouldn't be satisfied with these blue chip xStocks not populating... we need to see this as a problem that we need to solve and then come up with a solution for it." Then: "If Langston and you can converge on the solution, then please proceed."
> **Langston Step 1 ACK 2026-05-19:** "green light to proceed to Step 2 pre-audit" with 6 revisions on Q1-Q8 + 1 push-back on tactical interim (skip — patch doesn't actually fix cycle budget because SPY+QQQ pinned benchmarks are in the missing-26 set). All revisions incorporated in rev2.
> **Status:** consensus reached. Step 2 pre-audit begins next. Then implementation per Kyle authorization.

---

## §0 — Why this is urgent (the empirical state tonight)

After three pre-warm passes (`--days 14`, `--days 7`, `--days 3`) attempted to populate the `xstock_spot_ohlc_60m_snapshot` table introduced by B-NEW-34b, the result was:

- **239 / 265 symbols populated successfully (90%)**
- **26 symbols hit Postgres statement_timeout repeatedly**: SPY, TSLA, NVDA, QQQ, COIN, XOM, MS, MSFT, PEP, PFE, PG, PGR, PLD, PM, PNR, PRU, PSA, PSX, PWR, PYPL, QCOM, RBLX, REGN, RGEN, RIVN, RKT, RTX, SNOW, SOFI, TRV, TT, TXN, UBER, UL, UPS, URI, UWMC, VIA, VICI, VLO, VTRS, VZ, WBD, WFC, XBI, XEL, XYZ, ZTS (the heavy-traded names).
- **Post-deploy reality: 25 consecutive scanner cycles all SCAN_TIMEOUT.** B-NEW-34b's cache architecture does the snapshot read for covered symbols (cheap) AND a batched live-aggregator call for ALL missed symbols (including the 26 heavy names). The batched live-aggregator's DISTINCT ON across SPY + TSLA + QQQ alone exceeds the cycle budget.

The Supabase Disk IO Budget warning from 2026-05-18 14:40 ET is the same root cause: the WebSocket archiver writes 18-56× more rows than it should, depleting IO budget on writes AND making every read 18-56× more expensive than it needs to be.

**B-NEW-35 was scoped originally as the structural cleanup for the snapshot architecture's read-cost — moved up tonight to immediate-next priority per Kyle directive because B-NEW-34b cannot reach functional scanner state without it.**

---

## §1 — Empirical evidence (B74 source duplication, current state)

From earlier diagnostic queries (xstock_spot_ohlc_1m):

- **Friday 2026-05-15 10:00-11:00 ET (peak trading hour):**
  - SPY: 9,076 source rows in 1 hour = ~150 rows/minute
  - NVDA: 8,002 rows = ~133 rows/minute
  - QQQ: 7,274 rows = ~121 rows/minute
  - TSLA: 5,054 rows = ~84 rows/minute
- **Saturday 2026-05-16 14:00-15:00 ET (weekend close):**
  - All 10 designated-24/7 names + sampled others: 0 rows. Weekend close is uniform.

At ~150 rows per minute for heavy names, with 60 minutes per bar, a 3-day query for SPY would scan ~9,000 × 24 × 3 = ~648K source rows pre-DISTINCT-ON — and that's just one symbol. Batched across 75-rotation-batch symbols where 26 are heavy traders: ~5-10M rows per query. The DISTINCT ON cost scales with that volume, and Postgres's statement_timeout caps query execution at 2 minutes (Supabase default).

**After B-NEW-35:** 1 row per (symbol, interval_begin) per minute. SPY 1 hour = 60 rows. 3-day query = 4,320 rows per symbol. 75-symbol batched query = ~325K rows. ~20× cheaper. Comfortably under the timeout.

---

## §2 — Architecture: ON CONFLICT DO UPDATE in batch writer

### The bug (in code today)

`server/services/passive-archive/ohlc-batch-writer.ts` line 113-116:

```ts
const CHUNK_SIZE = 1000;
for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
  const slice = rows.slice(i, i + CHUNK_SIZE);
  await db.insert(table as any).values(slice as any);   // ← plain INSERT, no ON CONFLICT
}
```

Every WebSocket OHLC update (which Kraken sends multiple times per minute as the in-progress bar evolves) becomes a fresh row. The auto-generated `id` column makes every row unique even though `(symbol, interval_begin)` collides.

### The fix

Change the INSERT to UPSERT keyed on `(symbol, interval_begin)` using Drizzle's `onConflictDoUpdate`:

```ts
await db.insert(table as any).values(slice as any)
  .onConflictDoUpdate({
    target: [table.symbol, table.intervalBegin],
    set: {
      // Latest WS-update wins per-minute — these are "evolving in-progress bar" updates
      open:        sql`EXCLUDED.open`,
      high:        sql`EXCLUDED.high`,
      low:         sql`EXCLUDED.low`,
      close:       sql`EXCLUDED.close`,
      volume:      sql`EXCLUDED.volume`,
      vwap:        sql`EXCLUDED.vwap`,
      tradeCount:  sql`EXCLUDED.trade_count`,
      capturedAt:  sql`NOW()`,
    },
  });
```

### Required schema change

Each of the three `_ohlc_1m` tables (xstock_spot, xstock_perp, crypto_spot) needs a UNIQUE INDEX on `(symbol, interval_begin)` to enable ON CONFLICT DO UPDATE. Currently the PK is on the auto-generated `id` column only, so collisions on `(symbol, interval_begin)` are silently allowed.

**Complication: monthly partitioning.** The tables are partitioned by `interval_begin RANGE`. A UNIQUE constraint on the parent table MUST be supported by Postgres' partition-pruning logic. Per PG docs: UNIQUE on a partitioned table is allowed IF the partition key columns are included. Since `interval_begin` is the partition key + part of the unique, this is supported.

Migration shape:

```sql
-- For each partitioned table, add UNIQUE on (symbol, interval_begin) at parent level.
-- PG cascades to all existing partitions automatically.
ALTER TABLE xstock_spot_ohlc_1m
  ADD CONSTRAINT xstock_spot_ohlc_1m_symbol_interval_unique
  UNIQUE (symbol, interval_begin);

ALTER TABLE xstock_perp_ohlc_1m
  ADD CONSTRAINT xstock_perp_ohlc_1m_symbol_interval_unique
  UNIQUE (symbol, interval_begin);

ALTER TABLE crypto_spot_ohlc_1m
  ADD CONSTRAINT crypto_spot_ohlc_1m_symbol_interval_unique
  UNIQUE (symbol, interval_begin);
```

**Order of operations matters:** the table must be deduped BEFORE the UNIQUE constraint can be added (existing duplicates would fail the constraint). So the migration sequence is:

1. **Phase 1 — Cleanup migration** (dedupe existing rows). DELETE all but the most-recent-captured_at row per `(symbol, interval_begin)`. Chunked by partition to avoid table-locking the live archiver. Estimated 100M+ rows to delete across all 3 tables.
2. **Phase 2 — Add UNIQUE constraints** (runs after dedup completes).
3. **Phase 3 — Deploy new code** that uses UPSERT. Archiver continues to receive WS updates but now upserts instead of inserts.

### Cleanup migration shape (Phase 1)

```sql
-- Dedupe one table at a time, one partition at a time.
-- Inside each partition:
DELETE FROM <partition_name> a USING <partition_name> b
WHERE a.symbol = b.symbol
  AND a.interval_begin = b.interval_begin
  AND a.id < b.id;  -- keep highest id (latest write within partition)
```

Per-partition execution because `DELETE ... USING` across the whole table would scan the entire 100M+ row table at once.

---

## §3 — Phased rollout + risk management

### Phase 1 — Dedup cleanup (one-time, ~20-30 min wallclock with parallel sessions per Langston Q1)

- **PARALLEL execution across 3 tables (Langston Q1 ACK):** open 3 psql sessions, one per table (xstock_spot, crypto_spot, xstock_perp), run independently. Zero contention because different tables. Wallclock compresses from sequential ~60-90 min to parallel ~20-30 min.
- **Chunked DELETE per partition (Langston Q2 ACK):** 100K-500K rows per pass within each partition. Brief WAL-flush pauses between passes. Avoids single-statement DELETE generating massive WAL pressure that could risk Supabase checkpoint stalls.
- **Empirical validation step (Langston Q2 caveat):** run smallest partition first with single-statement DELETE while monitoring archiver INSERT latency from `[B74][batch-writer]` logs. If latency stays under baseline (TBD in pre-audit), switch to single-statement for the rest. If latency spikes, stick with chunked. Pre-audit captures the baseline.
- **Per-partition VACUUM (NOT FULL) immediately after each DELETE (Langston Q3 ACK).** Reclaims space without exclusive lock. Autovacuum compacts over time.
- Concurrent with B74 archiver writes: yes — DELETE doesn't block INSERTs at row level. WAL pressure is the actual cost.

### Phase 2 — Add UNIQUE constraints (~1-5 min per table)

- Three ALTER TABLE statements. Adds index per partition (PG cascades).
- Fast on already-deduped data.
- Brief metadata lock per partition (no row-level lock; ongoing INSERTs queue briefly).

### Phase 3 — Deploy new code with UPSERT

- Single deploy: `npm run build && pm2 restart`.
- After deploy: archiver continues receiving WS updates, but each minute's row collapses to one upsert.
- Verification: pick a heavy symbol (SPY), check row counts before/after deploy. Pre-deploy: ~150 rows/minute. Post-deploy: ~1 row/minute (with multiple UPDATEs of the same row internally, but only one row visible).
- Per-minute row count delta is the success signal.

### Phase 4 — Re-run pre-warm cleanly (Langston Q6 ACK: UPSERT-style, NO TRUNCATE)

- **Skip TRUNCATE of `xstock_spot_ohlc_60m_snapshot`.** The existing 239 rows ARE correct — the duplication problem was query cost, not query correctness. DISTINCT ON in the original pre-warm picked one valid row per minute. The bucket-aggregate values match what they'd be after dedup.
- Re-run `npm run b-new-34b:prewarm -- --days 14`.
- The script's `INSERT ... ON CONFLICT (symbol, bucket_ts) DO UPDATE SET ...` clause: refreshes existing covered (no-op if values match), fills in the missing 26.
- Per-symbol query is now ~20× cheaper (no duplication factor). All 265 symbols should complete in 5-15 minutes.
- **Snapshot integrity spot-check (per Langston Q6 paranoia option):** before Phase 4 starts, snapshot 5 covered symbols' last bucket OHLC values to a temp file. After Phase 4 completes, re-query the same buckets and confirm values match within ±0.01% (tiny numeric drift acceptable; >0.01% indicates a real discrepancy worth investigating).

### Phase 5 — pm2 restart to clear scanner cache + verify

- Scanner first cycles read from full snapshot, miss-count drops to ~0, cycle duration drops well under budget.
- B-NEW-34b functional state finally achieved.

---

## §4 — SIM impact (consulted per CLAUDE.md §9.1)

### Affected components

- **`server/services/passive-archive/ohlc-batch-writer.ts`** — INSERT → UPSERT. Blast radius: MEDIUM. All three asset-class archivers feed this. Change is additive (onConflictDoUpdate clause); INSERT semantics preserved when no conflict exists (first-write-of-the-minute).
- **`xstock_spot_ohlc_1m`, `xstock_perp_ohlc_1m`, `crypto_spot_ohlc_1m` schemas** — new UNIQUE constraint on (symbol, interval_begin). Cascades to all partitions. Blast radius: HIGH for migrations (one-time), LOW for ongoing operations.
- **`ohlc-aggregator.ts` DISTINCT ON CTE** — becomes redundant post-deploy. Can be SIMPLIFIED OR REMOVED in this batch (it adds query cost that's no longer needed). Recommendation: simplify in this batch since the dedup logic is now structural. Updates the aggregator's hot read path to be even cheaper.
- **`xstock-ohlc-cache.ts` snapshot-first cold-read** — behavior unchanged. The snapshot read is unaffected. The live overlay aggregator (now without DISTINCT ON cost) is ~20× faster. The 26-missing-symbol problem dissolves naturally.
- **B-NEW-34b snapshot pre-warm script** — re-run after deploy with --days 14 to repopulate the snapshot with clean source data. The current 239/265 snapshot rows REMAIN VALID (the aggregation is over the same source-bar values, just without duplicates) — but re-running gives a clean baseline.

### Cross-cutting concerns

- **Crypto regression check**: Crypto trades on the same `crypto_spot_ohlc_1m` table. The dedup+UPSERT applies there too. Crypto's signal-orchestrator + VTS pipeline reads this table indirectly via `ohlc-cache.ts` (Kraken-REST-fed, not WS-fed-archiver path). So crypto reads from a fresh Kraken-REST source, not the deduped archive table directly. **However:** the archive table feeds the B70 data-archive backfill for regime classifier replay + B-NEW-37 inversion forensics. These consumers should benefit from cleaner data, not break.
- **TEC interaction**: TEC reads OHLC via crypto's `ohlcCache` (Kraken-REST) for crypto, and xstock's `xstockOhlcCache` (snapshot+aggregator) for xstock. Both paths benefit, neither breaks.
- **B-NEW-36 dependency**: simplifies dramatically — once B-NEW-35 is live, the snapshot architecture functions as designed, and B-NEW-36 lifecycle controller has clean inputs.

---

## §5 — Question table with Langston Step 1 ACK responses

**Q1 — Cleanup ordering.** **Langston ACK with revision: PARALLEL sessions, not sequential.** Three psql sessions, one per table. Zero contention (different tables). Wallclock ~20-30 min total instead of sequential ~60-90 min. Phase 2 ALTERs run sequentially (fast). Phase 3 single deploy. Net: scanner recovery ~30-45 min sooner.

**Q2 — Chunk size for per-partition DELETE.** **Langston ACK with revision: CHUNKED, not single-statement.** WAL pressure is the actual cost (not row locks). Single-statement DELETE generates massive WAL, pressures Supabase shared_buffers + max_wal_size, risks checkpoint stalls. Use chunked CTE-based DELETE at 100K-500K rows per pass with brief WAL-flush pauses between passes. Interruptible if something goes sideways. **Empirical validation step:** run smallest partition single-statement first while monitoring archiver INSERT latency from `[B74][batch-writer]` logs. If latency stays at baseline, switch to single-statement for the rest. If latency spikes, keep chunked. Pre-audit captures baseline.

**Q3 — VACUUM strategy post-cleanup.** **Langston ACK: regular VACUUM (NOT FULL).** VACUUM FULL's exclusive lock would pause the archiver mid-cleanup; not worth it for cosmetic disk pressure. Supabase reuses freed space on subsequent writes; autovacuum compacts over time. If disk-usage alarms get noisy, schedule a weekend VACUUM FULL window post-soak (not in critical path).

**Q4 — UPSERT semantics on bar-update fields.** **Langston ACK: concur.** Replace OHLC + volume + vwap + tradeCount + capturedAt; preserve `id`, `assetClass`, `exchange`. Confirmed correct because Kraken WS sends ordered, cumulatively-aggregated bar updates per symbol — the latest update IS the correct cumulative high/low/close for that minute. Replace is the right semantic, not MAX/MIN.

**Q5 — DISTINCT ON CTE in aggregator.** **Langston push-back: KEEP belt-and-suspenders in this batch.** Remove in a follow-up after 7+ days soak proving zero-duplicate operation. Cost of DISTINCT ON over single-row groups is trivial; benefit is bug-tolerance during any future migration or replay path that could briefly introduce duplicates. Reducing B-NEW-35 blast radius matters on the critical scanner path. Removal filed as a future cleanup batch (logged to RUNNING_ISSUES post-completion).

**Q6 — Re-run pre-warm window for snapshot freshness.** **Langston push-back: SKIP TRUNCATE, run pre-warm UPSERT-style.** The existing 239 snapshot rows ARE correct — duplication was query-cost, not query-correctness (DISTINCT ON picked one valid row per minute, and that row had correct OHLC values). Pre-warm script's existing `ON CONFLICT (symbol, bucket_ts) DO UPDATE SET ...` clause: refreshes existing covered symbols (no-op if values match), fills in the missing 26. Saves time and removes the risk of dropping a working snapshot. Spot-check 3-5 covered symbols pre/post — values should match within ±0.01%.

**Q7 — Migration runner blocker carryover.** **Langston ACK: psql-bypass with documented INSERT.** Each manual `_migrations` INSERT for B-NEW-35 migrations carries a comment "B-NEW-35 bypass — ledger reconciliation pending in B-NEW-36 sub-batch (a)". RUNNING_ISSUES #119 gets the three new migration files added to the reconciliation backlog so they don't get lost.

**Q8 — Estimated effort.** **Langston revision: BUFFER to 36-48 hours, not 24-36.** Chunked DELETE adds time; parallel dedup recovers some. Scanner recovery on xstock_spot side achievable in first 18-24 hours; clean completion-report close in 36-48 hours. Don't over-commit to 24-36 if Q2 chunked DELETE bumps Phase 1.

**Q9 — All 3 tables in one batch?** **Langston ACK: concur.** Code change is one line, UNIQUE must exist on all three before deploy (shared `ohlc-batch-writer.ts` UPSERT path needs the constraint on every target table — partial fix would require ugly conditional UPSERT). Full-fix is right. Crypto and xstock_perp benefit too (B70 backfill consumers, IO budget recovery).

---

## §6 — Consensus reached → Step 2 pre-audit begins

**Consensus state (rev 2):**

- Langston Step 1 ACK granted with 6 revisions on Q1-Q8 (all incorporated in rev2) + 1 push-back on tactical interim (skip — patch doesn't fix cycle budget because SPY+QQQ pinned benchmarks are in the missing-26 set).
- Kyle authorization: "If Langston and you can converge on the solution, then please proceed."
- B-NEW-36 (lifecycle controller) waits until B-NEW-35 ships clean.

**Tactical interim DECISION: SKIPPED.** Both Langston (reasoning #1: doesn't actually unblock pinned-benchmark path; reasoning #2: NO-PATCHES doctrine; 24-36 hours short enough that patch review/revert overhead exceeds value) and the empirical data agree: ship B-NEW-35 hard.

**Step 2 pre-audit deliverables (per Langston):**

1. **Per-partition row-count estimates** for all three tables (xstock_spot_ohlc_1m, crypto_spot_ohlc_1m, xstock_perp_ohlc_1m). Used to size chunked DELETE batches.
2. **Archiver INSERT latency baseline** from current `[B74][batch-writer]` log signature. Captures pre-deploy p50/p95 of flush latency for the chunked-vs-single-statement empirical validation step in Phase 1.
3. **Migration SQL files staged for psql-bypass** — three Phase-1 cleanup files (one per table), three Phase-2 ADD CONSTRAINT files. Plus the manual `_migrations` INSERTs with bypass comments.
4. **TRUNCATE-skip verification plan** — pre/post snapshot integrity spot-check on 5 covered symbols: capture last bucket OHLC values pre-Phase-4; re-query post-Phase-4; tolerance ±0.01%.
5. **SIM consultation per §9.1** — verify the 4 affected components don't have blast-radius leaks beyond what's documented.
6. **Crypto regression trace** — confirm crypto_spot scanner pipeline reads OHLC via Kraken-REST `ohlcCache`, NOT the archive table directly. B70 backfill is the only crypto consumer of the archive (which benefits from cleaner data, not breaks).
7. **Deploy ordering invariant** — confirm npm run db:migrate-bypass runs BEFORE pm2 restart (matches B-NEW-34b pattern from earlier today).

**Implementation authorization:** per Kyle "please proceed" given Langston consensus. Step 3 implementation begins after pre-audit completes. No additional Kyle gate between pre-audit and Step 3.

INFRASTRUCTURE NOTE: rev2 incorporates Langston revisions in-line. Pre-audit will be a new file `B_NEW_35_PRE_AUDIT.md` in the same Scope Files folder.

— Claude Code, 2026-05-19 early UTC (rev 2 of B_NEW_35_SCOPE — consensus reached)
