# B-NEW-35 — Source-side dedup for WS-archived OHLC tables (B74 archiver UPSERT pattern)

> **From:** Claude Code
> **To:** Langston (Step 1 design review) + Kyle (decider)
> **Date:** 2026-05-19 early UTC
> **Type:** Structural source-side fix — eliminates 18-56× row duplication in xstock_spot_ohlc_1m + xstock_perp_ohlc_1m + crypto_spot_ohlc_1m
> **Kyle directive 2026-05-19 early UTC:** "we shouldn't be satisfied with these blue chip xStocks not populating... we need to see this as a problem that we need to solve and then come up with a solution for it." → empirical investigation tonight confirmed B-NEW-34b snapshot architecture CANNOT solve the 26-missing-symbol problem because the live-aggregator fallback batched-DISTINCT-ON across heavy-traded symbols (SPY, TSLA, NVDA, QQQ) exceeds the 25-second scanner cycle budget. Source-side dedup is the only structural fix.

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

### Phase 1 — Dedup cleanup (one-time, ~30-90 min)

- Per-partition DELETE-self-join keeping highest id per `(symbol, interval_begin)`.
- Estimated run time per partition: 5-20 min depending on partition size.
- Concurrent with B74 archiver writes: yes — DELETE doesn't block INSERTs at the row level.
- Risk: VACUUM debt afterward. Run VACUUM (NOT FULL) per-partition immediately after each DELETE to reclaim space without table-lock.
- Order: smallest table first (crypto_spot has the most data but xstock_spot has the most-urgent need; ordering TBD per Langston Q1).

### Phase 2 — Add UNIQUE constraints (~1-5 min per table)

- Three ALTER TABLE statements. Adds index per partition (PG cascades).
- Fast on already-deduped data.
- Brief metadata lock per partition (no row-level lock; ongoing INSERTs queue briefly).

### Phase 3 — Deploy new code with UPSERT

- Single deploy: `npm run build && pm2 restart`.
- After deploy: archiver continues receiving WS updates, but each minute's row collapses to one upsert.
- Verification: pick a heavy symbol (SPY), check row counts before/after deploy. Pre-deploy: ~150 rows/minute. Post-deploy: ~1 row/minute (with multiple UPDATEs of the same row internally, but only one row visible).
- Per-minute row count delta is the success signal.

### Phase 4 — Re-run pre-warm cleanly

- After Phase 3 is stable (~30 min observation), re-run `npm run b-new-34b:prewarm -- --days 14`.
- Per-symbol query is now ~20× cheaper (no duplication factor). All 265 symbols should complete in 5-15 minutes.
- Snapshot table reaches 100% coverage.

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

## §5 — Specific questions for Langston

**Q1 — Cleanup ordering.** Three tables to dedup: xstock_spot, xstock_perp, crypto_spot. xstock_spot is the most urgent (scanner broken). crypto_spot is the most data. xstock_perp is the smallest. My pick: xstock_spot first (unblocks scanner), then crypto_spot (releases the most IO budget), then xstock_perp (cleanup-of-record). Concur?

**Q2 — Chunk size for per-partition DELETE.** Per-partition self-join DELETE across a 5-20M row partition could take 5-20 minutes wallclock and acquire many WAL writes. Alternative: chunked CTE-based DELETE (`DELETE WHERE id IN (SELECT id FROM duplicates LIMIT 100K)`) iterated until exhausted. Per-pass safer but slower overall. My pick: full per-partition DELETE in one statement per partition. Postgres handles 5-20M row deletes routinely. The MV-CC nature means no blocking. Concur, or should we go chunked?

**Q3 — VACUUM strategy post-cleanup.** Each partition will have ~95% bloat post-DELETE (95% of rows removed). Two paths: (a) `VACUUM <partition>` (lock-free, reclaims for reuse but not OS-free; depends on autovacuum to eventually compact), (b) `VACUUM FULL <partition>` (exclusive lock during the operation, reclaims space and returns to OS, brief archiver write-pause for that partition). My pick: regular VACUUM per partition immediately after each DELETE. Trade-off: disk space stays high for a few weeks until autovacuum gets around to it. Supabase dashboard will show high disk usage in the interim. Alternative: VACUUM FULL during a planned quiet window (e.g., Saturday 12:00 UTC when xstock weekend is in close). Concur with regular VACUUM?

**Q4 — UPSERT semantics on bar-update fields.** When an UPSERT updates an existing row, which fields should it update? The OHLC values (open, high, low, close, volume, vwap, tradeCount) reflect the latest WS update — so they evolve toward the closed-bar value across the minute. Latest update = best snapshot. Drizzle DO UPDATE SET should refresh these. Also update `capturedAt = NOW()` so we know the last touch. Should `id` and `assetClass + exchange` remain immutable? Yes (they're invariants). Anything else to retain? My pick: replace OHLC + volume + vwap + tradeCount + capturedAt; preserve everything else.

**Q5 — Should we ALSO simplify the aggregator's DISTINCT ON CTE in this batch?** Post-B-NEW-35 the DISTINCT ON dedup in `ohlc-aggregator.ts:223-231` is functionally redundant (every (symbol, interval_begin) has exactly one row). Removing it makes the query simpler and faster. But it's also a no-op (the ON CONFLICT DO UPDATE leaves at most one row, so DISTINCT ON over one-row groups is trivially fast). My pick: remove the DISTINCT ON CTE in this batch — keeps the aggregator's read path clean. Trade-off: brief window during deploy where new code runs against not-yet-deduplicated rows (Phase 3 deploys before Phase 4 re-pre-warm). Could leave the DISTINCT ON in place as belt-and-suspenders during the deploy window, then remove in a follow-up cleanup batch. Concur with remove-in-this-batch, or prefer belt-and-suspenders?

**Q6 — Re-run pre-warm window for snapshot freshness.** Phase 4 re-runs `b-new-34b:prewarm --days 14`. Once UPSERT is live, the source 1m table has clean data — but the existing snapshot table (the 239 covered + 26 missing) was populated against the DUPLICATED source. The aggregate values are correct (DISTINCT ON picked one row per minute) but the snapshot wasn't running over the right-shape source. Worth a full snapshot rebuild? My pick: yes — clean slate post-cleanup. Cleared snapshot (`TRUNCATE xstock_spot_ohlc_60m_snapshot;`) then re-pre-warm. Concur?

**Q7 — Migration runner blocker carryover.** RUNNING_ISSUES #119 still applies: 16 unrecorded migrations from 2026-05-08+ block `npm run db:migrate`. B-NEW-35's migrations need to apply via the runner OR via direct psql + manual `_migrations` INSERT bypass per the B-NEW-34b deploy pattern. My pick: same bypass pattern for tonight (psql -f, manual INSERT). B-NEW-36 sub-batch (a) handles the proper ledger reconciliation when it ships. Concur, or should B-NEW-35 force the ledger reconciliation first?

**Q8 — Estimated effort.** 1-2 days including: scope review pass (~half day), pre-audit (~half day), implementation (~half day), cleanup migration execution (~30-90 min wallclock, with monitoring), code deploy (~10 min), pre-warm re-run (~10 min), scanner verification (~10 min). Step 4 code review on a small focused diff (~3 files changed). Step 11 completion report. Realistic to ship within 24-36 hours of consensus on scope? Concur?

**Q9 — Crypto/xstock-perp same fix priority?** The same duplication affects crypto_spot_ohlc_1m and xstock_perp_ohlc_1m. Crypto's signal-orchestrator doesn't read from the archive table (uses Kraken-REST), so crypto's immediate scanner cycle isn't affected. xstock_perp is dormant. Should B-NEW-35 fix all 3 tables in one batch (cleaner) or just xstock_spot now + crypto+xstock_perp in a follow-up? My pick: fix all 3 in this batch because the code change is one line and the cleanup migrations run independently per table. Crypto and xstock_perp benefit too (B70 backfill consumers, IO budget). Concur?

---

## §6 — Ask

Step 1 ACK from Langston with revisions on §1-§5. Once locked, I'll write the Step 2 pre-audit (SIM consultation + per-partition row-count estimates + dedup timing baseline + deploy ordering trace). After ACK on pre-audit, Step 3 implementation begins.

**Kyle directive 2026-05-19 early UTC:** B-NEW-35 RE-SEQUENCED ahead of B-NEW-36 because the empirical state proves B-NEW-34b cannot achieve functional scanner state without source-side dedup. B-NEW-36 (lifecycle controller) waits until B-NEW-35 ships clean. Pre-audit work on B-NEW-36 is on hold; Step 2 work resumes after B-NEW-35 Step 11 completion report closes.

**Open thread for Kyle's decision:** there is also a tactical interim option — modify the B-NEW-34b cache to skip the live-aggregator fallback for snapshot-covered symbols (saving the cycle budget from the heavy missing symbols). Would give partial scanner functionality with the 239 covered names while B-NEW-35 ships properly. NOT a long-term fix — pure tactical patch. Flagged for Kyle's call: would conflict with NO PATCHES doctrine but would unblock partial trading-signal observability tonight rather than waiting 1-2 days for B-NEW-35.

INFRASTRUCTURE NOTE (CLAUDE.md §6.5.0.a): scope is design-only, no code snippets needed inline beyond the ones already embedded above. Pre-audit will trace specific call sites + migration SQL. DO NOT `cd /mnt/gdrive`. For staging-side inspection use ssh staging at commit `90a3915b0` (current head of migration/aws-supabase).

Reply with: (a) Step 1 ACK with revisions on §1-§5, (b) substantive disagreement on the phased rollout, OR (c) re-sequencing pushback.

— Claude Code, 2026-05-19 early UTC (rev 1 of B_NEW_35_SCOPE)
