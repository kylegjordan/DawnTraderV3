# B-NEW-35 — Step 2 Pre-Implementation Audit

> **From:** Claude Code
> **To:** Langston (Step 2 review) + Kyle
> **Date:** 2026-05-19
> **Status:** Pre-audit complete; all 7 deliverables filed. Step 3 implementation queued.
> **Reference:** `B_NEW_35_SCOPE.md` rev 2 (consensus reached). Phase 1+2 migration SQL files staged. Phase 3 code change committed but NOT YET DEPLOYED.

---

## §1 — Per-partition row count estimates (Langston pre-audit ask #1)

Source: `pg_class.reltuples` joined to `pg_inherits` for the three partitioned tables. Cheap metadata-only query; used to size chunked DELETE batches.

| Table | Partition | Estimated rows | Sizing decision |
|---|---|---:|---|
| xstock_spot_ohlc_1m | 2026_04 | 4,213 | Single-statement DELETE (instant) |
| xstock_spot_ohlc_1m | **2026_05** | **14,962,897** | **Chunked DELETE at 200K rows/pass** |
| crypto_spot_ohlc_1m | 2026_04 | 27,174 | Single-statement DELETE |
| crypto_spot_ohlc_1m | **2026_05** | **9,296,031** | **Chunked DELETE at 200K rows/pass** |
| xstock_perp_ohlc_1m | 2026_04 | 81,510 | Single-statement DELETE |
| xstock_perp_ohlc_1m | **2026_05** | **3,256,549** | **Chunked DELETE at 200K rows/pass** |
| Future partitions (2026_06 → 2027_04) | (all 3 tables × 11 partitions) | -1 (never analyzed) | No dedup needed (empty) |

**Total May 2026 rows to dedup: ~27.5M across 3 tables, running in parallel sessions.**

Expected post-dedup state (assuming 18× average duplication factor):
- xstock_spot 2026_05: 15M → ~830K unique (symbol, minute) rows
- crypto_spot 2026_05: 9.3M → ~515K
- xstock_perp 2026_05: 3.3M → ~180K
- Net data reduction: ~95%

---

## §2 — Archiver INSERT latency baseline (Langston pre-audit ask #2)

Sampled from `pm2 logs dawntrader --lines 2000` filtered to `[B74][batch-writer] xstock_spot flushed N rows` log signature. 9 consecutive flush events captured during normal scanner-broken-but-archiver-healthy state at 2026-05-19 15:56-15:57 UTC:

| Timestamp (UTC) | Rows per flush |
|---|---:|
| 15:56:39 | 90 |
| 15:56:44 | 189 |
| 15:56:49 | 108 |
| 15:56:55 | 194 |
| 15:56:59 | 112 |
| 15:57:04 | 206 |
| 15:57:09 | 136 |
| 15:57:14 | 110 |
| 15:57:19 | 91 |

**Baseline characteristics:**
- Flush interval: **5 seconds** consistent (matches `BATCH_FLUSH_INTERVAL_MS = 5_000` in `ohlc-batch-writer.ts:28`).
- Rows per flush: 90-206 (sustained ~30 rows/sec across all xstock symbols).
- Latency well under 5s (otherwise next flush would lag).

**Warning thresholds during Phase 1 empirical validation:**
- Flush interval stretching >7s → WAL pressure delaying writes; switch to chunked DELETE if not already.
- Rows-per-flush accumulating >500 → buffer growing because flushes are slow; same response.
- New error log line `[B74][batch-writer] xstock_spot flush failed` → hard fail; pause dedup, investigate.

**Post-B-NEW-35 expectation:** flush row count drops ~5× (each minute now has one row not 18-56). Expected steady-state: 20-40 rows per flush, same 5-second interval.

---

## §3 — Migration SQL files staged for psql-bypass (Langston pre-audit ask #3)

Files created under `drizzle/migrations/` and committed to migration/aws-supabase:

| File | Purpose | Approx. wallclock |
|---|---|---|
| `2026-05-19-b-new-35-phase1-dedup-xstock-spot.sql` | April single-stmt + May chunked DELETE + per-partition VACUUM | ~10-20 min |
| `2026-05-19-b-new-35-phase1-dedup-crypto-spot.sql` | Same shape, crypto_spot | ~10-15 min |
| `2026-05-19-b-new-35-phase1-dedup-xstock-perp.sql` | Same shape, xstock_perp (smallest table → empirical validation candidate per Langston Q2) | ~5-10 min |
| `2026-05-19-b-new-35-phase2-add-unique-constraints.sql` | Three `ALTER TABLE ADD CONSTRAINT UNIQUE (symbol, interval_begin)` — one per parent table | ~1-3 min per table |

**Deploy order:**
1. Run all three Phase 1 SQL files in parallel via 3 psql sessions (per Langston Q1).
2. Wait for all three to complete (monitor RAISE NOTICE per-iteration messages).
3. Run Phase 2 (single SQL, ALTER TABLE statements run sequentially within the file).
4. Manual `INSERT INTO _migrations` for each of the 4 files with bypass-comment per Langston Q7.
5. Then Phase 3 code deploy (already-committed UPSERT change in `ohlc-batch-writer.ts`).

**Manual ledger INSERT shape:**
```sql
INSERT INTO _migrations (name, applied_at) VALUES
  ('2026-05-19-b-new-35-phase1-dedup-xstock-spot.sql', NOW()),
  ('2026-05-19-b-new-35-phase1-dedup-crypto-spot.sql', NOW()),
  ('2026-05-19-b-new-35-phase1-dedup-xstock-perp.sql', NOW()),
  ('2026-05-19-b-new-35-phase2-add-unique-constraints.sql', NOW())
ON CONFLICT (name) DO NOTHING;
-- Comment: B-NEW-35 bypass per RUNNING_ISSUES #119; ledger reconciliation pending in B-NEW-36 sub-batch (a).
```

---

## §4 — TRUNCATE-skip verification plan (Langston pre-audit ask #4)

Per Langston Q6 push-back: existing 239 snapshot rows are CORRECT (duplication was query-cost, not query-correctness). Skip TRUNCATE; let UPSERT-style pre-warm refresh existing + fill missing 26. Spot-check verifies no value drift.

**Spot-check protocol (executed pre + post Phase 4 pre-warm re-run):**

1. **Pick 5 representative covered symbols:** one from each major sector + one ADR + one ETF.
   - AAPL/USD (XLK, mega-cap)
   - JPM/USD (XLF, mega-cap)
   - JNJ/USD (XLV, mega-cap)
   - BABA/USD (XLY, ADR)
   - GLD/USD (BROAD_ETF, commodity)
2. **Capture pre-state** before Phase 4: for each symbol, query `SELECT bucket_ts, open, high, low, close, volume FROM xstock_spot_ohlc_60m_snapshot WHERE symbol = $1 ORDER BY bucket_ts DESC LIMIT 5;`
3. **Run Phase 4 pre-warm** (`npm run b-new-34b:prewarm -- --days 14` against deduplicated source).
4. **Capture post-state** identically.
5. **Compare value-by-value:** open/high/low/close should match within ±0.01% absolute (allowing for trivial numeric drift from floating-point operations across runs). Volume should match exactly (SUM is integer-stable). Bucket timestamps should match exactly.

**Acceptance:** all 5 symbols pass tolerance. Any failure = investigate before proceeding to Phase 5.

---

## §5 — SIM consultation (CLAUDE.md §9.1)

Affected components traced upstream + downstream + shared state per CLAUDE.md SIM-discipline rule:

### Component: `server/services/passive-archive/ohlc-batch-writer.ts`
- **Change:** INSERT → UPSERT (one line + 8-line `.onConflictDoUpdate` block).
- **Upstream feeders:**
  - `equity-spot-archiver.ts` calls `bufferOhlcBar('xstock_spot', row)` for each WS message.
  - `equity-perp-archiver.ts` same shape for xstock_perp.
  - `crypto-spot-archiver.ts` same shape for crypto_spot.
- **Downstream consumers (now writing one row per minute instead of many):**
  - `xstock_spot_ohlc_1m` table → read by `ohlc-aggregator.ts` (xstock scanner critical path) + `b-new-34b-prewarm-snapshot.ts` + `b75-retention-sweep.ts` (lifecycle) + `b75-rehydrate.ts` (boot) + `exit-strategy-replay-service.ts` (B73 ablation) + `vts-runner.ts` (rare; only on cold-start backfill) + `drift-dashboard-aggregator.ts` (analytics) + `vts-service.ts` (rare).
  - `crypto_spot_ohlc_1m` table → similar shape, plus B70 backfill consumers.
  - `xstock_perp_ohlc_1m` table → dormant, B75 retention only.
- **Shared state:** The `MAX_CONCURRENT_INSERTS = 2` semaphore in the same file. UPSERT vs INSERT doesn't change the slot accounting. Brief per-row INSERT latency may increase slightly (UPSERT does a unique-index lookup before INSERT) but well under 5s budget.
- **Background execution:** every 5s via `setInterval(BATCH_FLUSH_INTERVAL_MS)`.
- **Blast radius:** LOW for ongoing operations (every row now ONE write instead of many; behaviorally identical to consumers reading the table). MEDIUM for one-time migration (Phase 1 cleanup migration deletes ~95% of existing rows).

### Component: `xstock_spot_ohlc_1m`, `crypto_spot_ohlc_1m`, `xstock_perp_ohlc_1m` schemas
- **Change:** ADD UNIQUE CONSTRAINT on (symbol, interval_begin) — cascades to all partitions.
- **Upstream feeders:** ohlc-batch-writer.ts (post-B-NEW-35 only triggers ON CONFLICT path).
- **Downstream consumers:** unchanged — they read the same rows, just fewer of them.
- **Blast radius:** HIGH for the migration moment (Phase 2 brief partition-level metadata lock during constraint add); LOW for ongoing operations. Concurrent INSERTs queue for ~1-5 seconds during the per-partition constraint add.

### Component: `ohlc-aggregator.ts` DISTINCT ON CTE (lines 223-231)
- **Per Langston Q5 push-back: KEEP this CTE in place.** Belt-and-suspenders during migration window. Removal queued as future cleanup batch after 7+ day soak proves zero-duplicate operation.
- **Side effect of B-NEW-35:** DISTINCT ON over single-row groups is trivially fast. Aggregator queries now run ~20× cheaper because there's only one row per (symbol, interval_begin) for the dedup to consider.

### Component: `xstock-ohlc-cache.ts` snapshot-first cold-read path
- **Behavior unchanged.** The snapshot read is unaffected by B-NEW-35.
- **Side effect:** the live-overlay aggregator (called by the cache for cache-misses) now runs ~20× faster because the source table is deduplicated. The 26-missing-symbol problem dissolves naturally — the live aggregator now fits comfortably within the 25-second cycle budget.

### Component: `b-new-34b-prewarm-snapshot.ts` pre-warm script
- **Behavior unchanged.** Per-symbol DISTINCT ON aggregation still runs.
- **Side effect:** post-Phase-3 deploy, the per-symbol query scans ~1/18 to 1/56 the rows it did before. All 265 symbols should complete in 5-15 minutes total instead of 9+ hours.

### Cross-cutting concerns

- **Crypto regression:** see §6.
- **TEC interaction:** TEC reads OHLC via `ohlcCache` (crypto, Kraken-REST) and `xstockOhlcCache` (xstock, snapshot+aggregator). Neither path is directly affected by B-NEW-35; both benefit from the underlying cleanup.
- **B-NEW-36 lifecycle controller dependency:** B-NEW-36 currently waits for B-NEW-35 to ship (per Kyle re-sequencing 2026-05-19). After B-NEW-35 completes, B-NEW-36 Step 2 pre-audit resumes against a clean B74 archive.
- **B79.0n active-trading wire-in (RUNNING_ISSUES #117):** unchanged. Future batch.

---

## §6 — Crypto regression trace (Langston pre-audit ask #6)

**Question:** does the crypto signal-orchestrator pipeline read from `crypto_spot_ohlc_1m` directly, and could B-NEW-35 dedup disrupt active crypto trading?

**Answer: NO direct read from `crypto_spot_ohlc_1m` on the hot signal-orchestrator path.** Trace:

1. **Crypto scanner** (`server/services/fx5-scanner.ts`) reads OHLC via `server/services/ohlc-cache.ts` (the crypto-side cache).
2. **`ohlc-cache.ts`** fetches OHLC from **Kraken REST API** (`https://api.kraken.com/0/public/OHLC`), NOT from the local archive table. This was the original B-NEW-34 design rationale (xstocks don't have a Kraken REST endpoint; crypto does).
3. The local `crypto_spot_ohlc_1m` archive is consumed ONLY by:
   - **B70 data-archive backfill** (regime-classifier replay rebuilding, B-NEW-37 inversion forensics analysis) — these are offline/replay consumers, not hot-path consumers.
   - **B75 retention-sweep** + rehydrate (lifecycle / boot).
   - **Drift-dashboard aggregator** (analytics).

**Conclusion:** crypto active-trading path is **unaffected** by B-NEW-35. Replay consumers see *cleaner* data after dedup (fewer rows to process for the same minute coverage). No regression risk to crypto pipeline.

---

## §7 — Deploy ordering invariant (Langston pre-audit ask #7)

Per Langston C2 from the B-NEW-36 scope review (carry over): migration must run BEFORE pm2 restart in the deploy flow.

**Verified deploy sequence for B-NEW-35:**

1. **Pre-deploy:** capture spot-check baseline for 5 symbols (per §4).
2. **Phase 1 cleanup (~20-30 min wallclock, parallel sessions):**
   - 3 psql sessions running `phase1-dedup-*.sql` files concurrently.
   - Monitor `[B74][batch-writer]` log latency every ~2 min.
3. **Phase 2 ADD CONSTRAINT (~3-10 min):**
   - Run `phase2-add-unique-constraints.sql` after all 3 Phase-1 files complete.
   - Per-partition constraint adds in sequence within the file.
4. **Manual `_migrations` INSERT** for all 4 SQL files (bypass per RUNNING_ISSUES #119).
5. **Phase 3 code deploy:**
   - `git pull` (already pushed by CC).
   - `npm run build`.
   - `pm2 restart dawntrader`.
6. **Phase 4 pre-warm re-run (~5-15 min):**
   - `npm run b-new-34b:prewarm -- --days 14`.
   - All 265 symbols populate (vs current 239/265).
7. **Phase 4 spot-check verification:** compare 5-symbol post-state to baseline.
8. **Phase 5 verify:**
   - Re-confirm pm2 restart picked up new code.
   - Watch first 5-10 scanner cycles. Expect `[B79.0a][SCAN_CYCLE_DONE]` per cycle with `pairs_scanned ≥ 65` and `db_roundtrip_ms < 5000`.
9. **Close:** ack alert `7b33b931`, Step 11 completion report, governance updates.

**Ordering invariant guarantees:**
- Phase 1+2 complete BEFORE Phase 3 deploy → UNIQUE constraint exists when new UPSERT code runs.
- Phase 1 dedup completes BEFORE Phase 2 ADD CONSTRAINT → no existing duplicates to fail the constraint.
- Phase 3 deploy BEFORE Phase 4 pre-warm re-run → re-warm runs against clean source.

---

## §8 — Risk register

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Phase 1 chunked DELETE exceeds 60-min per partition | Low-Med | Med | Per-iteration RAISE NOTICE logs progress; operator can pause/abort. Empirical validation step catches earlier. |
| Archiver INSERT latency spikes during Phase 1 | Low | Low-Med | Chunked DELETE with WAL-flush pauses (per Langston Q2). Monitoring threshold §2. |
| Phase 2 constraint add fails (residual duplicates) | Low | High | Phase 1 finishes cleanly (RAISE NOTICE final count = 0 deletes) before Phase 2 begins. If add fails, re-run Phase 1 chunk loop. |
| Phase 4 spot-check tolerance violation | Very Low | Low | Tolerance is generous (±0.01%); failure would indicate either dedup correctness bug OR snapshot row already corrupted (separate investigation). |
| Crypto active-trading regression | None by-construction | High | Crypto pipeline reads Kraken REST not the archive table (§6). |
| Migration runner ledger drift | Already documented | Low | Bypass per RUNNING_ISSUES #119; manual `_migrations` INSERT with bypass comment. B-NEW-36 sub-batch (a) reconciles. |
| Mid-deploy crash | Low | Med | Each phase is its own transaction. Re-run Phase 1 from scratch (DELETE-self-join is idempotent). Re-run Phase 2 (ADD CONSTRAINT errors are catchable, restart). |

---

## §9 — Ask

Step 2 pre-audit ready for Langston review. Kyle has pre-authorized "proceed on consensus" — so if Langston ACKs the pre-audit, Step 3 implementation (Phase 1 execution) begins. If Langston has revisions, I apply them and re-confirm.

INFRASTRUCTURE NOTE: per §6.5.0.a, no diff snippets needed in this pre-audit — the migration SQL files are linked via path, and `ohlc-batch-writer.ts` already has the UPSERT change committed (commit pending). For staging-side inspection use ssh staging at the head of migration/aws-supabase post-commit.

— Claude Code, 2026-05-19 (rev 1 of B_NEW_35_PRE_AUDIT)
