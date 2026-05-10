# BATCH 79.0e — `equity_*` → `xstock_*` table rename (COMPLETION REPORT)

**Status:** CLOSED 2026-05-10. DB migration applied to staging. Code-side changes pushed. CI + deploy in progress.
**Phase:** 24 — sub-batch 8.
**Branch:** `migration/aws-supabase`. Commit: `aca52acdc`.
**Trigger:** Kyle directive 2026-05-09 night — B69 retagged asset_class field VALUES but DB tables retained legacy `equity_*` names, violating namespace convention.

---

## §1 — Objectives — outcomes

| # | Objective | Status |
|---|---|---|
| 1 | Rename 4 parent tables | ✅ |
| 2 | Rename 4 parent indexes | ✅ |
| 3 | DB cutover via ALTER RENAME (metadata-only) | ✅ Sub-second, applied 2026-05-10 |
| 4 | Drizzle schema updated | ✅ Const exports renamed (xstockSpotOhlc1m etc.); type aliases retained per F2 |
| 5 | Code-side string replacements (15 files) | ✅ Exhaustive grep: 0 matches outside historical migrations |
| 6 | No view bridge — fail-loud on missed callers | ✅ Skip per Langston Q2 lock |
| 7 | Boundary tests | ✅ asset-classes.test.ts assertions updated |
| 8 | No-touch fence on crypto_spot | TBD post-deploy |
| 9 | CI 4 checks gate | TBD |

**Bonus catches discovered during impl:**
- 52 partition children + 108 partition indexes also needed rename (Drizzle parents inherit children with their own names)
- 4 module_constants `data_lifecycle.equity_*.hot_retention_days` keys needed rename to keep b75-retention-sweep working with renamed retention key strings
- Migration SQL extended with DO blocks + UPDATE for symmetry; rollback also extended (Langston Step 4 F1 catch)

**Total renames in single transaction:** 4 parents + 52 partition children + 4 parent indexes + 108 partition indexes + 4 module_constants = **172 objects**.

---

## §2 — Files

### DB
- `drizzle/migrations/2026-05-10-b79-0e-rename-equity-to-xstock.sql` — 5 sections (parents, parent indexes, partition DO sweep, index DO sweep, module_constants UPDATE)
- `drizzle/migrations/2026-05-10-b79-0e-rename-equity-to-xstock-rollback.sql` — symmetric reverse (Langston F1 fix: parent table+indexes + DO blocks for partitions+indexes + reverse UPDATE)

### Code (15 files)
- `shared/schema.ts` — pgTable + index const literals; const exports renamed; type aliases retained per F2 cosmetic
- `shared/asset-classes.ts` — registry archive table strings updated
- `server/services/passive-archive/ohlc-batch-writer.ts` + `ticker-batch-writer.ts` — import paths + map values
- `server/asset_classes/xstock_spot/scanner.ts`, `server/utils/data-freshness.ts`, `server/services/data-archive/storage-client.ts` — string literals
- `server/services/drift-dashboard-aggregator.ts` — universeConfigs entries
- `server/startup/passive-archive-bootstrap.ts`, `server/scripts/b74-create-monthly-partitions.ts`, `server/scripts/b75-rehydrate.ts`, `server/scripts/b75-retention-sweep.ts` — table+key strings
- `scripts/b79-0a-load-test.ts`, `scripts/b79-0a-qd-probe.ts` — query strings
- `server/tests/unit/asset-classes.test.ts` — assertions

---

## §3 — Langston review process

**Step 1 (scope review):** approved-with-revisions Q1-Q5 + 6 add'l (Step 2 audit, drizzle const renames, rollback parity, archiver buffer, no-touch fence specifics, sequencing).

**Step 4 (code review):** approved-with-revisions; F1 (rollback symmetry) FIXED — rollback file extended with DO blocks for partition tables+indexes + reverse module_constants UPDATE. F2 (type-name modernization for `EquitySpot/PerpOhlc1m` etc.) deferred as cosmetic follow-up.

**Verdict:** approved-with-revisions, ship-after F1 fix (applied this session).

---

## §4 — Plain-language summary

DB tables `equity_spot_ohlc_1m`, `equity_spot_ticker_snap`, `equity_perp_ohlc_1m`, `equity_perp_ticker_snap` (and their 52 monthly partitions + 108 indexes + 4 retention-key module_constants) renamed to `xstock_*` to honor B69's namespace convention reserving `equity_*` for FUTURE real (non-tokenized) US equity feeds. Single transaction, sub-second metadata-only ALTER RENAME — live archiver flush buffers absorbed the gap. Code-side string + Drizzle const updates in 15 files. Type aliases preserve back-compat (queued for cosmetic modernization).

**Out of scope per design:** view bridge (fail-loud beats silent legacy persistence); historical migrations left as immutable contracts; type-name modernization (cosmetic follow-up).

---

*End BATCH_79_0e_COMPLETION_REPORT.md.*
