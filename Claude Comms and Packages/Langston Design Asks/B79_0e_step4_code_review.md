# B79.0e Step 4 — Code Review

Diff at `Claude Comms and Packages/Change Lists/B79_0e_diff.txt`. Implementation per scope rev 1 + your Step 1 revisions:
- Step 2 audit: exhaustive grep of `equity_(spot|perp)_(ohlc_1m|ticker_snap)|equity(Spot|Perp)(Ohlc1m|TickerSnap)` across server/ scripts/ shared/ now returns 0 matches outside historical migrations.
- Rollback parity: 4 parent + 4 index renames in rollback (matches forward).
- Live archiver buffering: ohlc-batch-writer + ticker-batch-writer flush every 5s with in-memory buffers; sub-second metadata-only ALTER TABLE lock fits inside a flush gap.
- B79.0g already landed (PM2 #205, commit `fb42335f7`).

## What's in the diff

**Migration applied to staging 2026-05-10:**
- `drizzle/migrations/2026-05-10-b79-0e-rename-equity-to-xstock.sql` — 4 parent table renames + 4 parent index renames + DO blocks for partition children (52 renamed) + DO block for partition indexes (108 renamed) + module_constants `data_lifecycle.equity_*.hot_retention_days` (4 keys) → `xstock_*`. **Total 72 renames.** All in single transaction.
- Verification: `SELECT COUNT(*) FROM pg_tables WHERE tablename LIKE 'equity_%';` returns 0; same for pg_indexes; same for module_constants.

**Code changes (15 files):**
- `shared/schema.ts` — pgTable + index const literals renamed; const exports `equitySpotOhlc1m`→`xstockSpotOhlc1m` etc; type aliases `EquitySpotOhlc1m` etc still resolve via the new const refs (preserves type-name back-compat).
- `shared/asset-classes.ts` — registry `archiveOhlcTable` + `archiveTickerTable` strings updated.
- `server/services/passive-archive/ohlc-batch-writer.ts` + `ticker-batch-writer.ts` — import paths updated to new const names.
- `server/asset_classes/xstock_spot/scanner.ts` — query string updated.
- `server/utils/data-freshness.ts` — comment reference updated.
- `server/services/data-archive/storage-client.ts` — JSDoc path example updated.
- `server/services/drift-dashboard-aggregator.ts` — `name: 'equity_spot'` → `'xstock_spot'`; tableName strings updated.
- `server/startup/passive-archive-bootstrap.ts` — SIX_TABLES list updated.
- `server/scripts/b74-create-monthly-partitions.ts` — SIX_TABLES list updated.
- `server/scripts/b75-rehydrate.ts` — usage example updated.
- `server/scripts/b75-retention-sweep.ts` — `B74_TABLES` parent + retention key strings updated.
- `scripts/b79-0a-load-test.ts` + `scripts/b79-0a-qd-probe.ts` — query strings updated.
- `server/tests/unit/asset-classes.test.ts` — assertions updated.

## Specific verification points

- Exhaustive grep: 0 matches outside historical migrations (verified post-edit)
- Rollback symmetry: forward + rollback both touch parents+indexes+partitions+constants
- B79.0g landed first: yes (PM2 #205, commit fb42335f7)
- Migration applied + 0 equity_ tables/indexes/constants remain on staging
- Live archiver compatibility: B74 buffers absorb sub-second lock

## Reply

`/tmp/langston_b79_0e_code_review_reply.txt`. Plain markdown ≤2KB. Verdict + ship recommendation.
