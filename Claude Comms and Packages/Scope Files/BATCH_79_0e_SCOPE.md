# BATCH 79.0e — `equity_*` → `xstock_*` table rename (SCOPE rev 1)

**Status:** DRAFT 2026-05-10 — sequenced AFTER B79.0g lands.
**Phase:** 24 — sub-batch 8.
**Branch:** `migration/aws-supabase`.
**Workflow:** 11-step canonical (full).
**Trigger:** Kyle directive 2026-05-09 night — B69 retagged the asset_class field VALUES from `equity_spot` → `xstock_spot`, but the DB TABLES still use legacy `equity_spot_*` / `equity_perp_*`. Violates B69's namespace convention which preserves `equity_*` for FUTURE real (non-tokenized) US equities.

---

## §1 — Numbered objectives

| # | Objective | Verification |
|---|---|---|
| 1 | Rename 4 tables: `equity_spot_ohlc_1m` → `xstock_spot_ohlc_1m`, `equity_spot_ticker_snap` → `xstock_spot_ticker_snap`, `equity_perp_ohlc_1m` → `xstock_perp_ohlc_1m`, `equity_perp_ticker_snap` → `xstock_perp_ticker_snap` | `\dt` shows new names; old names absent |
| 2 | Rename indexes: `equity_spot_ohlc_1m_sym_time` → `xstock_spot_ohlc_1m_sym_time`, etc (4 indexes) | `\d xstock_spot_ohlc_1m` shows correctly-named indexes |
| 3 | DB cutover via `ALTER TABLE RENAME` — metadata-only on 1.2M+ row tables (NOT data copy) | Migration runs in seconds, not minutes |
| 4 | Drizzle schema (`shared/schema.ts`) updated with new table names | `grep equitySpotOhlc1m shared/schema.ts` → 0 hits; new names present |
| 5 | Code-side string replacements across 13 files (server scanner, data-freshness, storage-client, archive-bootstrap, drift-dashboard-aggregator, B74/B75 scripts, B79.0a scripts, test) | `grep -E "equity_spot_(ohlc_1m|ticker_snap)\|equity_perp_" server/ scripts/ shared/` → only historical migrations match |
| 6 | Aliased VIEW for transition (deferred per Kyle's earlier "ALTER TABLE not data copy" remark — table rename IS metadata-only, no view bridge needed; legacy code paths fail-loud at compile/runtime if any references are missed) | post-deploy: query against legacy name fails with "table does not exist" — confirms zero unupdated callers |
| 7 | Boundary tests pass; no new test failures beyond legacy baseline | CI green |
| 8 | No-touch fence on crypto_spot regime cadence holds | Post-deploy SQL |
| 9 | CI 4 checks gate | green |

---

## §2 — Open questions for Langston

**Q1 — Migration timing.** ALTER TABLE RENAME holds AccessExclusiveLock for the duration of the rename — but rename is metadata-only so duration is sub-second. Run during low-activity window (post-ARCA-close + pre-Sunday-22-UTC reopen)?

**My call: any time, sub-second blocking is fine.** Document the brief lock in completion report.

**Q2 — Aliased view for transition.** Could create a `equity_spot_ohlc_1m` VIEW pointing to `xstock_spot_ohlc_1m` so any missed code path keeps working temporarily. Adds rollback safety but creates a window where both names coexist.

**My call: skip the view.** Forces immediate code-path completeness. If any caller references the old name post-deploy, it fails LOUD on first query. Better than silent legacy-name persistence.

**Q3 — Legacy migrations.** The historical `2026-05-01-b74-passive-archive-tables.sql` migration files reference the old names. Leave as-is (historical record) or update?

**My call: leave as-is.** Historical migrations are immutable contracts of what shipped at the time. Document in scope that legacy refs in `drizzle/migrations/2026-05-0[136]-*` are intentional.

**Q4 — Code-side ordering.** Code changes + migration must coordinate: deploy code that reads from new names, run migration to rename, restart. Or: run migration first, then deploy code (window where new code reads from old names = breakage; window where old code reads from new names = breakage).

**My call: same-batch deploy.** Migration runs before code restart in the deploy script. PM2 serves old-code-old-names until restart; restart picks up new code reading from new names. Sub-second window of code/data mismatch, mitigated by pm2's fast restart.

**Q5 — Backfill of column comments / table comments.** Tables have no current comments referring to "equity"; column defaults all use `xstock_spot` or `xstock_perp` (per B69 retag). No comment cleanup needed.

**My call: confirm no-op.**

---

## §3 — Files affected

### DB migration
- `drizzle/migrations/2026-05-10-b79-0e-rename-equity-to-xstock.sql` (NEW)
- `drizzle/migrations/2026-05-10-b79-0e-rename-equity-to-xstock-rollback.sql` (NEW)

### Drizzle schema
- `shared/schema.ts` — rename table definitions

### Server code (string literals + Drizzle table imports)
- `server/asset_classes/xstock_spot/scanner.ts`
- `server/utils/data-freshness.ts`
- `server/services/data-archive/storage-client.ts`
- `server/services/drift-dashboard-aggregator.ts`
- `server/startup/passive-archive-bootstrap.ts`
- `server/scripts/b74-create-monthly-partitions.ts`
- `server/scripts/b75-rehydrate.ts`
- `server/scripts/b75-retention-sweep.ts`
- `scripts/b79-0a-load-test.ts`
- `scripts/b79-0a-qd-probe.ts`
- `shared/asset-classes.ts`
- `server/tests/unit/asset-classes.test.ts`

### Out of scope
- Historical migrations `2026-05-01-b74-*`, `2026-05-03-b69-*`, `2026-05-06-b75-*` — left as-is (immutable contracts)

---

## §4 — Risks

| Risk | Mitigation |
|---|---|
| Code path missed → query fails post-deploy | grep'd 13 files; CI catches Drizzle type mismatches; fail-loud is preferable to silent legacy persistence |
| ALTER TABLE lock blocks live writes | Sub-second metadata-only rename; live archiver buffers absorb the gap |
| Rollback path | Reverse-rename script + revert code commit |
| Crypto no-touch fence | Tables touched are xstock-archive only — crypto pipeline unaffected |
| Drizzle migration log out-of-order | New migration filename uses 2026-05-10 prefix — sorts after existing |

---

## §5 — Out of scope

- View bridge for legacy names
- Historical migration file edits
- Renaming `paper_trades` / `trades` / other unrelated tables
- Schema changes beyond rename (no column adds/drops)

---

*End BATCH_79_0e_SCOPE.md rev 1.*
